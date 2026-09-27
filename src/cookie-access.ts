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
import type { KeychainNoticeRecord } from "./keychain-notice-record";

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
    // The signed helper reports a locked keychain, a dead sidecar or an
    // unreadable item the same way: the read could not happen.
    || lower.includes("the keychain could not be read")
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
      // The Edge reader tries "Microsoft Edge Safe Storage", then a legacy
      // "Microsoft Edge" item, and reports only the last error. It asks the
      // keychain only after finding Edge's cookie database, and Edge creates
      // its key on first launch, so "not found" here means the first request
      // was denied or never answered.
      if (kind === "missing" && browser === "Microsoft Edge" && /Microsoft Edge Safe Storage/u.test(warning)) {
        return { code: "KEYCHAIN_DENIED", browser };
      }
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
  readonly readKey?: (timeoutSeconds: number) => Promise<TerminalKey>;
  /** Ask for Enter before continuing (explicit setup commands only). */
  readonly confirm: boolean;
  /** Browsers whose keychain access already worked; their notice is skipped. */
  readonly record?: KeychainNoticeRecord;
};

export type CookieNoticeOutcome = "continue" | "skip";

/** One key press; `unavailable` means the terminal can't read single keys. */
export type TerminalKey = "enter" | "s" | "other" | "timeout" | "unavailable";

/** How long the notice waits for Enter before it skips the read. */
const NOTICE_WAIT_SECONDS = 120;

/** Render and show the keychain notice for one browser. Never triggers the prompt itself. */
export async function showKeychainNotice(browser: string, io: CookieNoticeIO): Promise<CookieNoticeOutcome> {
  const audience = detectCookieAudience(io.environment, io.stderrIsTTY);
  const [first, second] = keychainNoticeLines(browser, keychainRequester(io.environment));
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
  // Other keys wait again, but never past one overall deadline. A terminal
  // that can't read single keys already showed the notice, so go on.
  const deadline = Date.now() + NOTICE_WAIT_SECONDS * 1_000;
  for (;;) {
    const remaining = Math.ceil((deadline - Date.now()) / 1_000);
    if (remaining <= 0) return "skip";
    const key = await io.readKey(remaining);
    if (key === "enter" || key === "unavailable") return "continue";
    if (key === "s" || key === "timeout") return "skip";
  }
}

/** The part of a terminal stdin that `terminalReadKey` uses. */
export type KeyInput = {
  readonly isRaw?: boolean;
  setRawMode(mode: boolean): unknown;
  on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  on(event: "end" | "close", listener: () => void): unknown;
  off(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  off(event: "end" | "close", listener: () => void): unknown;
  resume(): unknown;
  pause(): unknown;
  unref?(): unknown;
};

/** Classify one chunk of raw terminal input by its first character. */
export function classifyTerminalKey(text: string): TerminalKey | "interrupt" {
  const first = text[0] ?? "";
  if (first === "\u0003") return "interrupt";
  // Ctrl-D is end of input in raw mode, which is not a yes.
  if (first === "\u0004") return "s";
  if (first === "\r" || first === "\n") return "enter";
  if (first === "s" || first === "S") return "s";
  return "other";
}

/**
 * Read one key from a terminal stdin, restoring its mode afterwards. Closed
 * input answers "skip" instead of waiting out the timeout, and stdin is
 * released so a finished command exits.
 */
export function terminalReadKey(
  timeoutSeconds: number,
  stdin: KeyInput = process.stdin,
  interrupt: () => void = () => { process.kill(process.pid, "SIGINT"); },
): Promise<TerminalKey> {
  return new Promise((resolve) => {
    const wasRaw = stdin.isRaw === true;
    let settled = false;
    let listening = false;
    const finish = (key: TerminalKey): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (listening) {
        stdin.off("data", onData);
        stdin.off("end", onClosed);
        stdin.off("close", onClosed);
        try { stdin.setRawMode(wasRaw); } catch { /* The terminal went away. */ }
        stdin.pause();
        // A paused stdin can still hold the event loop open in Bun.
        stdin.unref?.();
      }
      resolve(key);
    };
    const onClosed = (): void => finish("s");
    const onData = (chunk: Buffer | string): void => {
      const key = classifyTerminalKey(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      if (key === "interrupt") {
        finish("s");
        interrupt();
        return;
      }
      finish(key);
    };
    const timer = setTimeout(() => finish("timeout"), timeoutSeconds * 1_000);
    try { stdin.setRawMode(true); } catch { finish("unavailable"); return; }
    listening = true;
    stdin.on("data", onData);
    stdin.on("end", onClosed);
    stdin.on("close", onClosed);
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

/**
 * Who the macOS keychain prompt names. With the signed local app the helper
 * inside `Ghostget.app` asks, so the dialog shows Ghostget instead of the
 * system `security` tool.
 */
export function keychainRequester(
  environment: CliEnvironment,
  platform: NodeJS.Platform = process.platform,
): string {
  // Kept edge-free on purpose: this mirrors `localAppEnabled` in
  // cookie-safe-storage.ts without importing that module into the ordinary
  // graph. The signed-helper store still gates on the real function.
  return platform === "darwin" && environment.HRANESS_LOCAL_APP === "1" ? "Ghostget" : "security";
}

/** The keychain browsers one cookie read may ask macOS about. */
function keychainBrowsersFor(options: CookieSelection, platform: string): readonly string[] {
  if (options.cookiesFile !== undefined || platform !== "darwin") return [];
  return [...new Set(options.cookieSources.flatMap((source) => {
    const browser = KEYCHAIN_BROWSERS[source];
    return browser === undefined ? [] : [browser];
  }))];
}

async function announceKeychainReads(options: CookieSelection, platform: string): Promise<void> {
  const notice = activeNotice;
  if (notice === null) return;
  for (const browser of keychainBrowsersFor(options, platform)) {
    if (announced.has(browser)) continue;
    announced.add(browser);
    // Access already granted: macOS won't ask, so say nothing.
    if (notice.record?.has(browser) === true) continue;
    if (await showKeychainNotice(browser, notice) === "skip") throw new CookieAccessSkippedError(browser);
  }
}

/**
 * A keychain read that finishes this fast returned without a macOS dialog:
 * nobody can read, decide and click in under a second. Slower reads may have
 * asked, and a one-time "Allow" also succeeds, so only fast reads count.
 */
export const UNPROMPTED_KEYCHAIN_READ_MS = 1_000;

/**
 * Keep the record in step with what macOS actually did. A fast, clean read of
 * one browser means access is granted, so later runs skip its notice. A slow
 * or failed read means macOS asked (or refused), for example after a one-time
 * Allow, a revoked grant or an update that changed the code signature, so the
 * notice comes back next time. Reads that name several browsers stop at the
 * first that works, so they never add to the record.
 */
function updateKeychainRecord(
  options: CookieSelection,
  platform: string,
  warnings: readonly string[],
  elapsedMs: number,
  succeeded: boolean,
): void {
  const record = activeNotice?.record;
  if (record?.update === undefined) return;
  const browsers = keychainBrowsersFor(options, platform);
  if (browsers.length === 0) return;
  // No cookie database means the keychain was never asked.
  if (warnings.some((warning) => /cookies database not found/iu.test(warning))) return;
  const clean = succeeded && !warnings.some((warning) => /keychain/iu.test(warning));
  if (clean && elapsedMs < UNPROMPTED_KEYCHAIN_READ_MS && browsers.length === 1) {
    record.update(browsers, []);
  } else if (!clean || elapsedMs >= UNPROMPTED_KEYCHAIN_READ_MS) {
    record.update([], browsers);
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
    /** Milliseconds clock for timing keychain reads. */
    readonly now?: () => number;
  } = {},
): CookieRecordReader {
  const probeSafari = context.probeSafari ?? probeSafariAccess;
  const platform = context.platform ?? process.platform;
  const now = context.now ?? (() => performance.now());
  return async (options, url) => {
    const environment = context.environment ?? process.env;
    let observed: ObservedFailure | null = null;
    const warnings: string[] = [];
    let elapsedMs = 0;
    const records = createCookieRecordReader(async (cookieOptions) => {
      const started = now();
      try {
        const provided = await store(cookieOptions);
        observed ??= classifyCookieProviderResult(provided, options.cookieSources);
        warnings.push(...providerWarnings(provided));
        return provided;
      } finally {
        elapsedMs += now() - started;
      }
    });
    await announceKeychainReads(options, platform);
    try {
      const result = await records(options, url);
      updateKeychainRecord(options, platform, warnings, elapsedMs, true);
      return result;
    } catch (error) {
      updateKeychainRecord(options, platform, warnings, elapsedMs, false);
      const failure = observed as ObservedFailure | null;
      if (failure !== null) {
        const requester = failure.code === "FDA_DENIED"
          ? responsibleApp(environment)
          : keychainRequester(environment, platform as NodeJS.Platform);
        throw new CookieAccessError(failure.code, failure.browser, requester, { cause: error });
      }
      // Only the default Safari store needs Full Disk Access; a named cookie
      // file can fail for its own reasons.
      if (
        options.cookiesFile === undefined
        && options.cookieProfile === undefined
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

/**
 * The default store keeps its pre-GG-8 behavior unless `HRANESS_LOCAL_APP=1`
 * opted in on macOS — then the signed-helper store is imported on first use,
 * so the ordinary module graph and its startup cost stay unchanged.
 */
export const acquireCookieRecords: CookieRecordReader = createClassifiedCookieRecordReader(
  async (options) => {
    if (process.platform === "darwin" && process.env.HRANESS_LOCAL_APP === "1") {
      const { createSignedCookieStore } = await import("./cookie-chromium-mac");
      return createSignedCookieStore(process.env)(options);
    }
    return getCookies(options);
  },
);

