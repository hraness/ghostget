/**
 * `ghostget pdf <url>` with a browser sign-in.
 *
 * Without sign-in options `pdf` stays a thin delegation to the Wordcell notes
 * CLI, which downloads the file anonymously. With them, Ghostget downloads the
 * bytes itself through the same cookie readers `read` and `clip` use, checks
 * that the result really is a PDF, and hands Wordcell a private local copy.
 *
 * Cookies are read from the selected browser separately for every origin the
 * download visits and filtered to that exact URL by the shared cookie filter,
 * so a cookie is only ever sent to a host it belongs to. Every hop is a
 * DNS-pinned public HTTPS request; plain HTTP, private addresses, and
 * credential-bearing URLs are refused before any cookie is read.
 */

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { cookieSources, type CookieSource } from "@hraness/wordcell/clip/args";
import type { StrictCookie } from "@hraness/wordcell/clip/cookies";
import type { CookieSelection } from "@hraness/wordcell/clip/acquire";

import type { GhostgetAuth } from "./auth";

/** Sign-in options `pdf` understands; they are never forwarded to Wordcell. */
const AUTH_VALUE_OPTIONS = new Set([
  "--auth",
  "--browser-profile",
  "--cookie-source",
  "--cookie-profile",
  "--cookies-file",
  "--mode",
]);

/** Wordcell `pdf` options that take a value, so their values are not the input. */
const WORDCELL_VALUE_OPTIONS = new Set([
  "--output",
  "--slug",
  "--annotations",
  "--timeout-ms",
  "--max-pdf-bytes",
  "--max-pages",
  "--max-images",
  "--max-asset-bytes",
  "--max-total-asset-bytes",
]);

/** Same limits Wordcell applies to an anonymous PDF download. */
export const PDF_AUTH_DEFAULTS = Object.freeze({
  timeoutMs: 120_000,
  maxPdfBytes: 512 * 1024 * 1024,
  maxRedirects: 5,
});

/** The browser-like agent `read --mode http` sends by default. */
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type PdfSignIn =
  | { readonly kind: "auth"; readonly id: string }
  | {
      readonly kind: "browser";
      readonly source: CookieSource;
      readonly profile: string | undefined;
    }
  | { readonly kind: "cookies-file"; readonly path: string };

export type PdfAuthSplit = {
  readonly signIn: PdfSignIn | null;
  /** Arguments for Wordcell `pdf`, with every sign-in option removed. */
  readonly remaining: readonly string[];
};

/** A problem the person can fix; `code` picks the exit status. */
export class PdfAuthError extends Error {
  readonly code: "usage" | "access" | "download";
  constructor(code: "usage" | "access" | "download", message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "PdfAuthError";
    this.code = code;
  }
}

function usage(message: string): PdfAuthError {
  return new PdfAuthError("usage", message);
}

/** True when `pdf` arguments carry any sign-in option. */
export function hasPdfSignInOptions(pdfArguments: readonly string[]): boolean {
  const separator = pdfArguments.indexOf("--");
  const scanned = separator === -1 ? pdfArguments : pdfArguments.slice(0, separator);
  return scanned.some((argument) => AUTH_VALUE_OPTIONS.has(argument.split("=", 1)[0] ?? ""));
}

function isCookieSource(value: string): value is CookieSource {
  return (cookieSources as readonly string[]).includes(value);
}

/**
 * Remove sign-in options from `pdf` arguments (everything after `pdf`).
 * Only the combinations `read` accepts are allowed; anything else is a usage
 * error raised before a browser store is touched.
 */
export function splitPdfSignInArguments(pdfArguments: readonly string[]): PdfAuthSplit {
  const remaining: string[] = [];
  const values = new Map<string, string>();
  for (let index = 0; index < pdfArguments.length; index += 1) {
    const argument = pdfArguments[index] ?? "";
    if (argument === "--") {
      remaining.push(...pdfArguments.slice(index));
      break;
    }
    const equals = argument.indexOf("=");
    const name = argument.startsWith("--") && equals !== -1 ? argument.slice(0, equals) : argument;
    if (!AUTH_VALUE_OPTIONS.has(name)) {
      remaining.push(argument);
      continue;
    }
    let value: string | undefined;
    if (name !== argument) {
      value = argument.slice(equals + 1);
    } else {
      value = pdfArguments[index + 1];
      index += 1;
    }
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw usage(`${name} needs a value`);
    }
    if (values.has(name)) throw usage(`${name} can be given only once`);
    values.set(name, value);
  }
  if (values.size === 0) return { signIn: null, remaining };

  const mode = values.get("--mode");
  if (mode !== undefined && !["auto", "http", "browser"].includes(mode)) {
    throw usage("--mode must be auto, http or browser");
  }
  const authId = values.get("--auth");
  const browserProfile = values.get("--browser-profile");
  const cookieSource = values.get("--cookie-source");
  const cookieProfile = values.get("--cookie-profile");
  const cookiesFile = values.get("--cookies-file");

  if (authId !== undefined) {
    if (browserProfile !== undefined || cookieSource !== undefined || cookieProfile !== undefined || cookiesFile !== undefined) {
      throw usage("--auth cannot be combined with --browser-profile, --cookie-source, --cookie-profile or --cookies-file");
    }
    return { signIn: { kind: "auth", id: authId }, remaining };
  }
  if (cookiesFile !== undefined) {
    if (browserProfile !== undefined || cookieSource !== undefined || cookieProfile !== undefined) {
      throw usage("--cookies-file cannot be combined with a browser or browser profile");
    }
    return { signIn: { kind: "cookies-file", path: cookiesFile }, remaining };
  }
  if (cookieSource !== undefined && !isCookieSource(cookieSource)) {
    throw usage(`--cookie-source must be one of ${cookieSources.join(", ")}`);
  }
  if (browserProfile !== undefined && cookieProfile !== undefined) {
    throw usage("use either --browser-profile or --cookie-profile, not both");
  }
  if (cookieSource === undefined && browserProfile === undefined) {
    throw usage(cookieProfile !== undefined
      ? "--cookie-profile needs --cookie-source, for example --cookie-source chrome"
      : "say which browser is signed in, for example --cookie-source chrome");
  }
  // `--browser-profile` names a Chrome profile unless another browser is given,
  // matching `read --browser-profile`'s "signed-in Chrome profile".
  return {
    signIn: {
      kind: "browser",
      source: (cookieSource ?? "chrome") as CookieSource,
      profile: browserProfile ?? cookieProfile,
    },
    remaining,
  };
}

/** Index of the Wordcell `pdf` input positional in `remaining`, or -1. */
export function pdfInputIndex(remaining: readonly string[]): number {
  const start = remaining[0] === "save" || remaining[0] === "capture" ? 1 : 0;
  for (let index = start; index < remaining.length; index += 1) {
    const argument = remaining[index] ?? "";
    if (argument === "--") return remaining[index + 1] === undefined ? -1 : index + 1;
    if (argument.startsWith("-")) {
      if (WORDCELL_VALUE_OPTIONS.has(argument)) index += 1;
      continue;
    }
    return index;
  }
  return -1;
}

export type PdfCookieReader = (url: URL) => Promise<{
  readonly cookies: readonly StrictCookie[];
  readonly warnings: readonly string[];
}>;

export type PdfFetch = (url: URL, init: RequestInit, timeoutMs: number) => Promise<Response>;

export type PdfDownload = {
  readonly bytes: Uint8Array;
  readonly finalUrl: URL;
  /** Distinct hosts that received at least one cookie, for tests and notices. */
  readonly cookieHosts: readonly string[];
};

function isNoMatchingCookies(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message.startsWith("no matching cookies were found")
    || message.startsWith("no usable origin-scoped cookies were found")
    || message.startsWith("the managed Chromium profile contained no usable origin-scoped cookies");
}

function browserLabel(signIn: PdfSignIn | null, auth: GhostgetAuth | undefined): string {
  const source = signIn?.kind === "browser"
    ? signIn.source
    : auth?.kind === "cookie-source"
      ? auth.source
      : auth?.kind === "browser-profile"
        ? auth.cookieSource ?? "chrome"
        : undefined;
  if (source === undefined) return "browser";
  const names: Record<string, string> = {
    chrome: "Chrome", arc: "Arc", brave: "Brave", chromium: "Chromium",
    edge: "Edge", firefox: "Firefox", safari: "Safari",
  };
  return names[source] ?? "browser";
}

function noAccessMessage(browser: string): string {
  return `The site sent a web page instead of the PDF, so your ${browser} sign-in does not seem to have access to it. `
    + `Open the link in ${browser}, sign in through your library or university if it asks, check that the PDF opens there, then run this again.`;
}

function contentTypeEssence(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function looksLikeHtml(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "text/html" || contentType === "application/xhtml+xml") return true;
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 512))
    .replace(/^﻿/u, "")
    .trimStart()
    .toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<head")
    || head.startsWith("<body") || head.startsWith("<?xml") || head.startsWith("<!--");
}

function isPdfSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

async function readBounded(response: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new PdfAuthError("download", `The PDF is larger than the ${maxBytes}-byte limit. Pass a larger --max-pdf-bytes to allow it`);
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        throw new PdfAuthError("download", `The PDF is larger than the ${maxBytes}-byte limit. Pass a larger --max-pdf-bytes to allow it`);
      }
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function checkedHttpsUrl(url: URL): URL {
  if (url.protocol !== "https:") {
    throw new PdfAuthError("download", "Signed-in PDF downloads only use https links, so your sign-in is never sent unencrypted");
  }
  if (url.username !== "" || url.password !== "") {
    throw new PdfAuthError("download", "The PDF link must not contain a user name or password");
  }
  const clean = new URL(url);
  clean.hash = "";
  return clean;
}

/**
 * Download one PDF with cookies from the selected browser.
 *
 * Redirects are followed manually, at most `maxRedirects` times, each to an
 * https URL. Cookies for every hop come from `readCookies(hopUrl)`, which
 * returns only cookies whose domain and path match that URL; results are cached
 * per origin and path, so one host's cookies can never be replayed to another.
 */
export async function downloadSignedInPdf(
  input: URL,
  options: {
    readonly readCookies: PdfCookieReader;
    readonly fetch: PdfFetch;
    readonly browser: string;
    readonly timeoutMs?: number;
    readonly maxPdfBytes?: number;
    readonly maxRedirects?: number;
  },
): Promise<PdfDownload> {
  const timeoutMs = options.timeoutMs ?? PDF_AUTH_DEFAULTS.timeoutMs;
  const maxBytes = options.maxPdfBytes ?? PDF_AUTH_DEFAULTS.maxPdfBytes;
  const maxRedirects = options.maxRedirects ?? PDF_AUTH_DEFAULTS.maxRedirects;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new PdfAuthError(
    "download",
    `The download did not finish within ${Math.round(timeoutMs / 1000)} seconds. Try again, or pass a larger --timeout-ms`,
  )), timeoutMs);
  const deadline = Date.now() + timeoutMs;
  const cookiesByOrigin = new Map<string, string>();
  const cookieHosts = new Set<string>();
  try {
    let url = checkedHttpsUrl(input);
    for (let hop = 0; ; hop += 1) {
      const cookieKey = `${url.origin}${url.pathname}`;
      let header = cookiesByOrigin.get(cookieKey);
      if (header === undefined) {
        let cookies: readonly StrictCookie[] = [];
        try {
          cookies = (await options.readCookies(url)).cookies;
        } catch (error) {
          if (!isNoMatchingCookies(error)) throw error;
        }
        header = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
        cookiesByOrigin.set(cookieKey, header);
      }
      if (header !== "") cookieHosts.add(url.hostname);
      controller.signal.throwIfAborted();
      const headers = new Headers({
        accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
        "accept-encoding": "identity",
        "user-agent": USER_AGENT,
      });
      if (header !== "") headers.set("cookie", header);
      const remaining = Math.max(1_000, Math.min(10 * 60_000, deadline - Date.now()));
      let response: Response;
      try {
        response = await options.fetch(url, {
          method: "GET",
          redirect: "error",
          headers,
          signal: controller.signal,
        }, remaining);
      } catch (error) {
        if (controller.signal.aborted && controller.signal.reason instanceof PdfAuthError) throw controller.signal.reason;
        throw new PdfAuthError("download", `Could not reach ${url.hostname}. Check the link and your connection, then try again`, { cause: error });
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        if (location === null || location === "") {
          throw new PdfAuthError("download", `${url.hostname} sent a redirect without a destination`);
        }
        if (hop >= maxRedirects) {
          throw new PdfAuthError("download", `The link redirected more than ${maxRedirects} times without reaching a PDF`);
        }
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new PdfAuthError("download", `${url.hostname} sent an invalid redirect`);
        }
        url = checkedHttpsUrl(next);
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => undefined);
        throw new PdfAuthError("access", noAccessMessage(options.browser));
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        throw new PdfAuthError("download", `${url.hostname} answered with HTTP ${response.status} instead of the PDF`);
      }
      const contentType = contentTypeEssence(response);
      let bytes: Uint8Array;
      try {
        bytes = await readBounded(response, maxBytes, controller.signal);
      } catch (error) {
        if (controller.signal.aborted && controller.signal.reason instanceof PdfAuthError) throw controller.signal.reason;
        throw error;
      }
      if (isPdfSignature(bytes)) return { bytes, finalUrl: url, cookieHosts: [...cookieHosts] };
      if (looksLikeHtml(bytes, contentType)) throw new PdfAuthError("access", noAccessMessage(options.browser));
      throw new PdfAuthError("download", "The link did not return a PDF file");
    }
  } finally {
    clearTimeout(timer);
  }
}

/** A filesystem-safe `.pdf` name from the final URL, like Wordcell's own download. */
export function pdfFilename(url: URL): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(basename(url.pathname));
  } catch {
    decoded = "source.pdf";
  }
  const normalized = decoded
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/^[.-]+|[.-]+$/gu, "")
    .slice(0, 180);
  const stem = normalized === "" ? "source" : normalized.replace(/\.pdf$/iu, "");
  return `${stem}.pdf`;
}

export type PdfAuthOutput = {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
};

export type PdfAuthDependencies = {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly runWordcellPdf: (pdfArguments: readonly string[]) => Promise<number>;
  readonly readCookies?: (signIn: PdfSignIn, auth: GhostgetAuth | undefined, url: URL, timeoutMs: number) => ReturnType<PdfCookieReader>;
  readonly loadAuth?: (id: string) => GhostgetAuth;
  readonly fetch?: PdfFetch;
  readonly makeTemporaryDirectory?: () => string;
  readonly removeDirectory?: (path: string) => void;
  /** Called before any browser store is read, for the keychain notice. */
  readonly beforeCookieRead?: () => void;
};

type ValidatedPdf = {
  readonly input: string;
  readonly json: boolean;
  readonly quiet: boolean;
  readonly timeoutMs?: number;
  readonly maxPdfBytes?: number;
};

async function validateWordcellArguments(
  remaining: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
): Promise<ValidatedPdf> {
  const { parsePdfArguments } = await import("@hraness/wordcell/pdf");
  const parsed = parsePdfArguments(remaining, environment);
  if (!parsed.ok) throw usage(parsed.message);
  if (parsed.value.command !== "capture") throw usage("a PDF link is missing");
  return {
    input: parsed.value.input,
    json: parsed.value.json,
    quiet: parsed.value.quiet,
    ...(parsed.value.timeoutMs === undefined ? {} : { timeoutMs: parsed.value.timeoutMs }),
    ...(parsed.value.maxPdfBytes === undefined ? {} : { maxPdfBytes: parsed.value.maxPdfBytes }),
  };
}

function authForSignIn(signIn: PdfSignIn, load: (id: string) => GhostgetAuth): GhostgetAuth | undefined {
  if (signIn.kind !== "auth") return undefined;
  const auth = load(signIn.id);
  if (auth.kind === "cookie-source" || auth.kind === "cookies-file") return auth;
  if (auth.kind === "browser-profile" && auth.cookieSource !== undefined) return auth;
  if (auth.kind === "browser-profile") {
    throw usage(`connected account ${signIn.id} does not name a browser to read its sign-in from; use --cookie-source chrome instead`);
  }
  throw usage(`connected account ${signIn.id} is not a browser sign-in, so it cannot download a PDF`);
}

function selectionFor(signIn: PdfSignIn, timeoutMs: number): CookieSelection {
  if (signIn.kind === "cookies-file") {
    return { cookieSources: [], cookiesFile: signIn.path, cookieProfile: undefined, timeoutMs, requireExplicitCookieScope: true };
  }
  if (signIn.kind === "browser") {
    return { cookieSources: [signIn.source], cookiesFile: undefined, cookieProfile: signIn.profile, timeoutMs, requireExplicitCookieScope: true };
  }
  throw new Error("stored sign-ins are read through their auth record");
}

async function defaultReadCookies(
  signIn: PdfSignIn,
  auth: GhostgetAuth | undefined,
  url: URL,
  timeoutMs: number,
): ReturnType<PdfCookieReader> {
  const cookieTimeout = Math.min(timeoutMs, 30_000);
  if (auth !== undefined) {
    const { acquireWebSessionCookieRecords } = await import("./web-session-cookies");
    return acquireWebSessionCookieRecords(auth, url, cookieTimeout);
  }
  const { acquireCookieRecords } = await import("./cookie-access");
  return acquireCookieRecords(selectionFor(signIn, cookieTimeout), url);
}

async function defaultFetch(url: URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const { pinnedHttpsFetch } = await import("./pinned-https");
  return pinnedHttpsFetch(url, init, timeoutMs);
}

/**
 * Run `pdf` with sign-in options: download with the browser session, then
 * import the private local copy through Wordcell with the other options.
 */
export async function runSignedInPdf(
  pdfArguments: readonly string[],
  dependencies: PdfAuthDependencies,
): Promise<number> {
  const { signIn, remaining } = splitPdfSignInArguments(pdfArguments);
  if (signIn === null) return dependencies.runWordcellPdf(pdfArguments);
  const validated = await validateWordcellArguments(remaining, dependencies.environment);
  if (!/^https?:\/\//iu.test(validated.input)) {
    throw usage("sign-in options only apply to web links; open a local PDF without them");
  }
  let url: URL;
  try {
    url = new URL(validated.input);
  } catch {
    throw usage("the PDF link is not a valid web address");
  }
  checkedHttpsUrl(url);
  const loadAuthRecord = dependencies.loadAuth ?? ((id: string) => {
    throw new Error(`auth locator ${id} cannot be loaded`);
  });
  const auth = authForSignIn(signIn, loadAuthRecord);
  const browser = browserLabel(signIn, auth);
  const timeoutMs = validated.timeoutMs ?? PDF_AUTH_DEFAULTS.timeoutMs;
  const readCookies = dependencies.readCookies ?? defaultReadCookies;
  const inputIndex = pdfInputIndex(remaining);
  if (inputIndex === -1 || remaining[inputIndex] !== validated.input) {
    throw usage("a PDF link is missing");
  }
  dependencies.beforeCookieRead?.();
  const download = await downloadSignedInPdf(url, {
    readCookies: (hop) => readCookies(signIn, auth, hop, timeoutMs),
    fetch: dependencies.fetch ?? defaultFetch,
    browser,
    timeoutMs,
    ...(validated.maxPdfBytes === undefined ? {} : { maxPdfBytes: validated.maxPdfBytes }),
  });

  const directory = (dependencies.makeTemporaryDirectory
    ?? (() => mkdtempSync(join(tmpdir(), "ghostget-pdf-"))))();
  const remove = dependencies.removeDirectory
    ?? ((path: string) => rmSync(path, { recursive: true, force: true }));
  try {
    chmodSync(directory, 0o700);
    const localPath = join(directory, pdfFilename(download.finalUrl));
    writeFileSync(localPath, download.bytes, { flag: "wx", mode: 0o600 });
    const forwarded = [...remaining];
    forwarded[inputIndex] = localPath;
    return await dependencies.runWordcellPdf(forwarded);
  } finally {
    remove(directory);
  }
}

function terminalSafe(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu, "?");
}

/**
 * The `ghostget pdf` entry for sign-in options: runs the download, shows the
 * keychain notice on an interactive terminal, and turns failures into plain
 * sentences with a next step. Returns the process exit code.
 */
export async function runSignedInPdfCommand(
  pdfArguments: readonly string[],
  output: PdfAuthOutput,
  options: {
    readonly environment: Readonly<Record<string, string | undefined>>;
    readonly runWordcellPdf: (pdfArguments: readonly string[]) => Promise<number>;
    readonly interactive: boolean;
    readonly overrides?: Partial<PdfAuthDependencies>;
  },
): Promise<number> {
  const json = pdfArguments.includes("--json");
  const quiet = json || pdfArguments.includes("--quiet");
  const { cliStyle, renderCliError } = await import("./cli-style");
  const cookieAccess = await import("./cookie-access");
  const style = cliStyle(options.environment, process.stderr.isTTY === true);
  const fail = (code: string, message: string, next: string, exitCode: number): number => {
    const safe = terminalSafe(message.replace(/\.$/u, ""));
    if (json) {
      output.stdout(`${JSON.stringify({ ok: false, error: { code, message: `${safe}.`, next } })}\n`);
    } else {
      output.stderr(renderCliError(style, `${safe}.`, next));
    }
    return exitCode;
  };
  if (options.interactive) {
    const { stateKeychainNoticeRecord } = await import("./keychain-notice-record");
    cookieAccess.configureCookieAccessNotice({
      environment: options.environment,
      stdinIsTTY: process.stdin.isTTY === true,
      stderrIsTTY: process.stderr.isTTY === true,
      write: (text) => output.stderr(text),
      readKey: (timeoutSeconds) => cookieAccess.terminalReadKey(timeoutSeconds),
      confirm: false,
      record: stateKeychainNoticeRecord(options.environment),
    });
  }
  try {
    return await runSignedInPdf(pdfArguments, {
      environment: options.environment,
      runWordcellPdf: options.runWordcellPdf,
      beforeCookieRead: () => {
        if (!quiet) output.stderr("Downloading the PDF with your browser sign-in ...\n");
      },
      ...(await (async () => {
        const { loadAuth } = await import("./auth");
        return { loadAuth: (id: string) => loadAuth(id, options.environment) };
      })()),
      ...options.overrides,
    });
  } catch (error) {
    if (error instanceof cookieAccess.CookieAccessSkippedError) {
      return fail("permission-skipped", error.message, "ghostget pdf <url> --cookies-file <path>", 3);
    }
    const denied = cookieAccess.findCookieAccessError(error);
    if (denied !== null) {
      return fail("permission-denied", `${denied.message}. ${cookieAccess.cookieAccessRemedy(denied)}`, "ghostget pdf --help", 3);
    }
    if (error instanceof PdfAuthError) {
      if (error.code === "usage") return fail("usage", error.message, "ghostget pdf --help", 2);
      if (error.code === "access") return fail("no-access", error.message, "Open the link in your browser first, then run this again", 1);
      return fail("download-failed", error.message, "ghostget pdf --help", 1);
    }
    const message = error instanceof Error ? error.message : "the signed-in PDF download failed";
    if (/auth locator .* was not found/u.test(message)) {
      return fail("usage", message, "ghostget auth list", 2);
    }
    if (/no matching cookies|no usable origin-scoped cookies|could not be read/u.test(message)) {
      return fail("no-sign-in", `Could not use your browser sign-in: ${message}`, "Open the link in your browser first, then run this again", 1);
    }
    return fail("download-failed", `The signed-in PDF download failed: ${message}`, "ghostget pdf --help", 1);
  } finally {
    if (options.interactive) cookieAccess.configureCookieAccessNotice(null);
  }
}
