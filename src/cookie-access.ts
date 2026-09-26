/**
 * Browser sign-in reads that explain macOS permission prompts.
 *
 * Chromium browsers keep their cookie key in the login keychain, so the first
 * read makes macOS ask whether `security` may use it. Safari's cookie store
 * needs Full Disk Access, which macOS never asks for. This module says what is
 * about to happen before the read, and turns a denial into a typed error
 * instead of "no matching cookies".
 *
 * TODO(df-0.8): replace the inline copy and audience rule with
 * `@hraness/desktop-foundation` permissions once Ghostget adopts 0.8.0.
 */
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  createCookieRecordReader,
  type CookieRecordReader,
  type CookieSelection,
  type CookieStoreReader,
} from "@hraness/kb/clip/acquire";
import { getCookies } from "@steipete/sweet-cookie";

import { cliStyle, responsibleApp, type CliEnvironment } from "./cli-style";
import { CookieAccessError, keychainAsk, type CookieAccessCode } from "./cookie-access-error";

export {
  CookieAccessError,
  cookieAccessRemedy,
  findCookieAccessError,
  FULL_DISK_ACCESS_PATH,
  FULL_DISK_ACCESS_URL,
  type CookieAccessCode,
  type CookiePermissionKind,
} from "./cookie-access-error";

export { responsibleApp };

export type CookieAudience = "human" | "agent" | "quiet";


/** Browsers whose cookie key sits in the login keychain, with their labels. */
const KEYCHAIN_BROWSERS: Readonly<Record<string, string>> = Object.freeze({
  chrome: "Chrome",
  arc: "Arc",
  brave: "Brave",
  chromium: "Chromium",
  edge: "Microsoft Edge",
});

/**
 * Classify one `security find-generic-password` failure. Exit statuses are the
 * low byte of the OSStatus: 51 errSecAuthFailed and 128 errSecUserCanceled are
 * denials, 36 errSecInteractionNotAllowed is a locked keychain, and 44
 * errSecItemNotFound means the browser never stored a key. The cookie library
 * kills `security` after its timeout, which also happens when nobody answers
 * the dialog.
 */
export function classifyKeychainFailure(text: string): "denied" | "unavailable" | "missing" | null {
  const lower = text.toLowerCase();
  if (
    lower.includes("user canceled")
    || lower.includes("passphrase you entered is not correct")
    || lower.includes("authorization was denied")
    || lower.includes("not allowed to access")
    || /\bexit (51|45|128)\b/u.test(lower)
  ) return "denied";
  if (
    lower.includes("interaction is not allowed")
    || lower.includes("timed out after")
    || /\bexit (36|124)\b/u.test(lower)
  ) return "unavailable";
  if (lower.includes("could not be found") || /\bexit 44\b/u.test(lower)) return "missing";
  return null;
}

function providerWarnings(value: unknown): readonly string[] {
  if (value === null || typeof value !== "object") return [];
  const warnings = (value as { readonly warnings?: unknown }).warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.filter((warning): warning is string => typeof warning === "string").slice(0, 64);
}

function keychainBrowserFor(warning: string, sources: readonly string[]): string | null {
  const match = /Keychain \(([^)]{1,64}) Safe Storage\)/u.exec(warning);
  if (match?.[1] !== undefined) return match[1];
  if (/Microsoft Edge Safe Storage/u.test(warning)) return "Microsoft Edge";
  const first = sources.find((source) => KEYCHAIN_BROWSERS[source] !== undefined);
  return first === undefined ? null : KEYCHAIN_BROWSERS[first] ?? null;
}

type ObservedFailure = { readonly code: CookieAccessCode; readonly browser: string };

/** Read the cookie provider's warnings for a keychain or Full Disk Access denial. */
export function classifyCookieProviderResult(
  value: unknown,
  sources: readonly string[],
): ObservedFailure | null {
  for (const warning of providerWarnings(value)) {
    if (/keychain/iu.test(warning)) {
      const kind = classifyKeychainFailure(warning);
      const browser = keychainBrowserFor(warning, sources);
      if (browser === null) continue;
      if (kind === "denied") return { code: "KEYCHAIN_DENIED", browser };
      if (kind === "unavailable") return { code: "KEYCHAIN_UNAVAILABLE", browser };
    }
    if (/safari/iu.test(warning) && /\b(EPERM|EACCES)\b|operation not permitted/iu.test(warning)) {
      return { code: "FDA_DENIED", browser: "Safari" };
    }
  }
  return null;
}

/** Whether the process may look inside Safari's sandboxed cookie folder. */
export type SafariAccessProbe = () => "ok" | "denied" | "missing";

export const probeSafariAccess: SafariAccessProbe = () => {
  try {
    statSync(join(homedir(), "Library", "Containers", "com.apple.Safari", "Data", "Library", "Cookies"));
    return "ok";
  } catch (error) {
    const code = (error as { readonly code?: unknown }).code;
    return code === "EPERM" || code === "EACCES" ? "denied" : "missing";
  }
};

const AGENT_MARKERS = [
  "AI_AGENT",
  "CLAUDECODE",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CURSOR_AGENT",
  "GEMINI_CLI",
] as const;

/** TODO(df-0.8): use detectAudience. Same rule, copied verbatim from the shared spec. */
export function detectCookieAudience(environment: CliEnvironment, stderrIsTTY: boolean): CookieAudience {
  const explicit = environment.HRANESS_AUDIENCE;
  if (explicit === "human" || explicit === "agent" || explicit === "quiet") return explicit;
  if (explicit === "off") return "quiet";
  if (AGENT_MARKERS.some((name) => (environment[name] ?? "") !== "")) return "agent";
  return stderrIsTTY ? "human" : "quiet";
}

/** The two notice lines, without symbol or indentation. */
export function keychainNoticeLines(browser: string, requester = "security"): readonly [string, string] {
  return [
    `macOS will ask to let ${requester} ${keychainAsk(browser)} for Ghostget.`,
    `Ghostget uses it to read the ${browser} sign-in you already have and never stores it. Enter your Mac password if asked, then choose Always Allow so macOS doesn't ask again.`,
  ];
}

export type CookieNoticeIO = {
  readonly environment: CliEnvironment;
  readonly stdinIsTTY: boolean;
  readonly stderrIsTTY: boolean;
  readonly write: (text: string) => void;
  /** Wait for one key. Only called when stdin and stderr are terminals. */
  readonly readKey?: (timeoutSeconds: number) => Promise<"enter" | "s" | "other" | "timeout">;
  /** Ask for Enter before continuing (explicit setup commands only). */
  readonly confirm: boolean;
};

export type CookieNoticeOutcome = "continue" | "skip";

/** Render and show the keychain notice for one browser. Never triggers the prompt itself. */
export async function showKeychainNotice(browser: string, io: CookieNoticeIO): Promise<CookieNoticeOutcome> {
  const audience = detectCookieAudience(io.environment, io.stderrIsTTY);
  const [first, second] = keychainNoticeLines(browser);
  if (audience === "quiet") return "continue";
  if (audience === "agent") {
    io.write(`${JSON.stringify({
      type: "permission-notice",
      product: "Ghostget",
      kind: "keychain",
      message: `${first} ${second}`,
    })}\n`);
    return "continue";
  }
  const style = cliStyle(io.environment, io.stderrIsTTY);
  const interactive = io.confirm && io.stdinIsTTY && io.stderrIsTTY && io.readKey !== undefined;
  io.write(`${style.symbol("notice")} ${first}\n   ${second}\n${interactive ? "   Press Enter to continue · s to skip\n" : ""}`);
  if (!interactive || io.readKey === undefined) return "continue";
  for (;;) {
    const key = await io.readKey(120);
    if (key === "enter") return "continue";
    if (key === "s" || key === "timeout") return "skip";
  }
}

/** Read one key from a terminal stdin, restoring its mode afterwards. */
export function terminalReadKey(timeoutSeconds: number): Promise<"enter" | "s" | "other" | "timeout"> {
  const stdin = process.stdin;
  return new Promise((resolve) => {
    const wasRaw = stdin.isRaw === true;
    let settled = false;
    const finish = (key: "enter" | "s" | "other" | "timeout"): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdin.off("data", onData);
      try { stdin.setRawMode(wasRaw); } catch { /* The terminal went away. */ }
      stdin.pause();
      resolve(key);
    };
    const onData = (chunk: Buffer | string): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (text === "\u0003") {
        finish("s");
        process.kill(process.pid, "SIGINT");
        return;
      }
      if (text === "\r" || text === "\n") finish("enter");
      else if (text.toLowerCase() === "s") finish("s");
      else finish("other");
    };
    const timer = setTimeout(() => finish("timeout"), timeoutSeconds * 1_000);
    try { stdin.setRawMode(true); } catch { finish("other"); return; }
    stdin.on("data", onData);
    stdin.resume();
  });
}

let activeNotice: CookieNoticeIO | null = null;
const announced = new Set<string>();

/**
 * Set where keychain notices go for this CLI run. Library use leaves it unset,
 * so importing Ghostget never writes to a terminal.
 */
export function configureCookieAccessNotice(io: CookieNoticeIO | null): void {
  activeNotice = io;
  announced.clear();
}

/** The person chose to skip the keychain request. */
export class CookieAccessSkippedError extends Error {
  constructor(browser: string) {
    super(`Stopped before reading your ${browser} sign-in. Nothing was read`);
    this.name = "CookieAccessSkippedError";
  }
}

async function announceKeychainReads(options: CookieSelection, platform: string): Promise<void> {
  if (activeNotice === null || options.cookiesFile !== undefined || platform !== "darwin") return;
  for (const source of options.cookieSources) {
    const browser = KEYCHAIN_BROWSERS[source];
    if (browser === undefined || announced.has(browser)) continue;
    announced.add(browser);
    if (await showKeychainNotice(browser, activeNotice) === "skip") throw new CookieAccessSkippedError(browser);
  }
}

/**
 * Wrap the shared cookie reader so a keychain or Full Disk Access denial
 * becomes a `CookieAccessError`. Everything else behaves exactly as before.
 */
export function createClassifiedCookieRecordReader(
  store: CookieStoreReader,
  context: {
    readonly probeSafari?: SafariAccessProbe;
    readonly environment?: CliEnvironment;
    readonly platform?: string;
  } = {},
): CookieRecordReader {
  const probeSafari = context.probeSafari ?? probeSafariAccess;
  const platform = context.platform ?? process.platform;
  return async (options, url) => {
    const environment = context.environment ?? process.env;
    let observed: ObservedFailure | null = null;
    const records = createCookieRecordReader(async (cookieOptions) => {
      const provided = await store(cookieOptions);
      observed ??= classifyCookieProviderResult(provided, options.cookieSources);
      return provided;
    });
    await announceKeychainReads(options, platform);
    try {
      return await records(options, url);
    } catch (error) {
      const failure = observed as ObservedFailure | null;
      if (failure !== null) {
        const requester = failure.code === "FDA_DENIED" ? responsibleApp(environment) : "security";
        throw new CookieAccessError(failure.code, failure.browser, requester, { cause: error });
      }
      if (
        options.cookiesFile === undefined
        && options.cookieSources.includes("safari")
        && platform === "darwin"
        && probeSafari() === "denied"
      ) {
        throw new CookieAccessError("FDA_DENIED", "Safari", responsibleApp(environment), { cause: error });
      }
      throw error;
    }
  };
}

export const acquireCookieRecords: CookieRecordReader = createClassifiedCookieRecordReader(
  (options) => getCookies(options),
);

