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
 * DNS-pinned public HTTPS request. Plain HTTP, credential-bearing URLs,
 * non-public IP literals, and local host names are refused before any cookie
 * is read; a name that resolves to a private address is refused by the pinned
 * fetch before any request is sent.
 */

import { chmodSync, closeSync, existsSync, mkdtempSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

import { cookieSources, type CookieSource } from "@hraness/wordcell/clip/args";
import type { StrictCookie } from "@hraness/wordcell/clip/cookies";
import type { CookieSelection } from "@hraness/wordcell/clip/acquire";

import type { GhostgetAuth } from "./auth";
import { isPublicUnicastAddress, parseIpv4, parseIpv6 } from "./public-address";
import { PDF_SIGN_IN_OPTIONS, hasPdfSignInOptions } from "./usage";

export { hasPdfSignInOptions };

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

/**
 * `access`: the sign-in reached the site but it refused the PDF.
 * `no-sign-in`: no cookie at all went to the site that refused, so the chosen
 * browser or profile most likely has no sign-in for it.
 */
export type PdfAuthErrorCode = "usage" | "access" | "no-sign-in" | "download";

/** A problem the person can fix; `code` picks the exit status. */
export class PdfAuthError extends Error {
  readonly code: PdfAuthErrorCode;
  constructor(code: PdfAuthErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "PdfAuthError";
    this.code = code;
  }
}

function usage(message: string): PdfAuthError {
  return new PdfAuthError("usage", message);
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
  // `read` options that mean nothing for a PDF download. They are dropped only
  // when a sign-in option is present; otherwise Wordcell rejects them as before.
  const readOnly: string[] = [];
  for (let index = 0; index < pdfArguments.length; index += 1) {
    const argument = pdfArguments[index] ?? "";
    if (argument === "--") {
      remaining.push(...pdfArguments.slice(index));
      break;
    }
    const equals = argument.indexOf("=");
    const name = argument.startsWith("--") && equals !== -1 ? argument.slice(0, equals) : argument;
    if (argument === "--trust-profile-egress") {
      readOnly.push(argument);
      continue;
    }
    if (name === "--mode") {
      const mode = name !== argument ? argument.slice(equals + 1) : pdfArguments[index + 1];
      if (name === argument) index += 1;
      readOnly.push(name, mode ?? "");
      continue;
    }
    if (!PDF_SIGN_IN_OPTIONS.has(name)) {
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
  if (values.size === 0) {
    if (readOnly.length === 0) return { signIn: null, remaining };
    // Put them back in place so Wordcell reports them exactly as before.
    return { signIn: null, remaining: [...pdfArguments] };
  }
  for (let index = 0; index < readOnly.length; index += 1) {
    if (readOnly[index] !== "--mode") continue;
    const mode = readOnly[index + 1];
    if (mode !== "browser" && mode !== "http") {
      throw usage("--mode must be browser or http; a signed-in PDF download needs neither, so you can leave it out");
    }
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

/** Reads the cookies for one URL, within `timeoutMs`. */
export type PdfCookieReader = (url: URL, timeoutMs: number) => Promise<{
  readonly cookies: readonly StrictCookie[];
  readonly warnings: readonly string[];
}>;

export type PdfFetch = (url: URL, init: RequestInit, timeoutMs: number) => Promise<Response>;

export type PdfDownload = {
  /** Owner-only file holding the PDF, inside the download directory. */
  readonly path: string;
  readonly byteLength: number;
  readonly finalUrl: URL;
  /** Distinct hosts that received at least one cookie, for tests and notices. */
  readonly cookieHosts: readonly string[];
};

/** What the shared reader says when a cookie file has nothing for one URL. */
const COOKIE_FILE_NO_MATCH = "the explicitly selected cookie file contained no usable cookies for this request";

function isNoMatchingCookies(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message.startsWith("no matching cookies were found")
    || message.startsWith("no usable origin-scoped cookies were found")
    || message.startsWith("the managed Chromium profile contained no usable origin-scoped cookies")
    || message === COOKIE_FILE_NO_MATCH;
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
  return `the site sent a web page instead of the PDF, so your ${browser} sign-in does not seem to have access to it. `
    + `Open the link in ${browser}, sign in through your library or university if it asks, check that the PDF opens there, then run this again`;
}

function noSignInMessage(browser: string, host: string): string {
  return `no ${browser} sign-in was found for ${host}, so the site sent a sign-in page instead of the PDF. `
    + `Check that you chose the browser and profile you use for this site (ghostget browsers lists them), `
    + `or open the link in ${browser}, sign in, then run this again`;
}

function refused(browser: string, host: string, signedIn: boolean): PdfAuthError {
  return signedIn
    ? new PdfAuthError("access", noAccessMessage(browser))
    : new PdfAuthError("no-sign-in", noSignInMessage(browser, host));
}

function readableSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const value = bytes / (1024 * 1024);
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} MB`;
}

function tooLarge(maxBytes: number): PdfAuthError {
  return new PdfAuthError(
    "download",
    `the PDF is larger than the ${readableSize(maxBytes)} limit. Pass a larger --max-pdf-bytes to allow it`,
  );
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

/** Enough of the body to tell a PDF from an HTML page. */
const SNIFF_BYTES = 512;

type StreamResult =
  | { readonly pdf: true; readonly byteLength: number }
  | { readonly pdf: false; readonly head: Uint8Array };

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function writeAll(descriptor: number, bytes: Uint8Array): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    offset += writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
  }
}

/**
 * Stream a response into an owner-only file created only once the first bytes
 * show a PDF signature. At most `maxBytes` are read, and only the sniffed head
 * is ever held in memory as a whole.
 */
async function streamPdf(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  openPath: () => string,
): Promise<StreamResult> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLarge(maxBytes);
  }
  if (response.body === null) return { pdf: false, head: new Uint8Array() };
  const reader = response.body.getReader();
  const pending: Uint8Array[] = [];
  let total = 0;
  let path: string | undefined;
  let descriptor: number | undefined;
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (!next.done) {
        total += next.value.byteLength;
        if (total > maxBytes) throw tooLarge(maxBytes);
      }
      if (descriptor === undefined) {
        if (!next.done) pending.push(next.value);
        const buffered = pending.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        if (!next.done && buffered < SNIFF_BYTES) continue;
        const head = concat(pending, buffered);
        pending.length = 0;
        if (!isPdfSignature(head)) {
          if (!next.done) await reader.cancel().catch(() => undefined);
          return { pdf: false, head: head.subarray(0, SNIFF_BYTES) };
        }
        path = openPath();
        descriptor = openSync(path, "wx", 0o600);
        writeAll(descriptor, head);
      } else if (!next.done) {
        writeAll(descriptor, next.value);
      }
      if (next.done) break;
    }
    closeSync(descriptor);
    descriptor = undefined;
    return { pdf: true, byteLength: total };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (descriptor !== undefined) closeSync(descriptor);
    if (path !== undefined) rmSync(path, { force: true });
    throw error;
  }
}

/**
 * Resolve with `work`, or reject with the deadline's reason as soon as
 * `signal` aborts, so a slow cookie read cannot outlast `--timeout-ms`.
 */
function withinDeadline<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolvePromise, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolvePromise(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
}

/**
 * True when a redirect hop stays on the link's own site: the same host, or a
 * parent or subdomain of it. Anything else, including a sibling subdomain, is
 * treated as another site, which only ever holds back more cookies than a
 * browser would.
 */
export function isSameSiteHop(linkHost: string, hopHost: string): boolean {
  const link = bareHost(linkHost);
  const hop = bareHost(hopHost);
  if (link === hop) return true;
  if (parseIpv4(link) !== null || parseIpv6(link) !== null || parseIpv4(hop) !== null || parseIpv6(hop) !== null) return false;
  return link.endsWith(`.${hop}`) || hop.endsWith(`.${link}`);
}

/**
 * True for hosts that are plainly not public websites: non-public IP literals
 * and local-only names. Names that merely resolve to a private address are
 * caught by the pinned fetch, which checks every resolved address.
 */
function isLocalOnlyHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  if (parseIpv4(host) !== null || parseIpv6(host) !== null) return !isPublicUnicastAddress(host);
  return !host.includes(".")
    || host === "localhost"
    || [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".intranet"].some((suffix) => host.endsWith(suffix));
}

function checkedHttpsUrl(url: URL, first: boolean): URL {
  if (url.protocol !== "https:") {
    throw new PdfAuthError("download", first
      ? "signed-in PDF downloads only use https links, so your sign-in is never sent unencrypted. "
        + "Change the start of the link from http:// to https:// and run it again"
      : `signed-in PDF downloads only use https links, but ${url.hostname} redirected to an unencrypted http link, `
        + "so the download stopped to keep your sign-in private");
  }
  if (url.username !== "" || url.password !== "") {
    throw new PdfAuthError("download", "the PDF link must not contain a user name or password");
  }
  if (isLocalOnlyHost(url.hostname)) {
    throw new PdfAuthError(
      "download",
      `signed-in PDF downloads only go to public websites, so ${url.hostname} was not contacted and no sign-in was read for it`,
    );
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
 * A hop on a different site from the link holds back `SameSite=Strict`
 * cookies, as a browser does after a redirect. Cookie reads count against the
 * same deadline as the download. The PDF is streamed into an owner-only file
 * in `directory` (a new private temporary folder when omitted).
 */
export async function downloadSignedInPdf(
  input: URL,
  options: {
    readonly readCookies: PdfCookieReader;
    readonly fetch: PdfFetch;
    readonly browser: string;
    readonly directory?: string;
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
    `the download did not finish within ${Math.round(timeoutMs / 1000)} seconds. Try again, or pass a larger --timeout-ms`,
  )), timeoutMs);
  const deadline = Date.now() + timeoutMs;
  const cookiesByOrigin = new Map<string, string>();
  const cookieHosts = new Set<string>();
  const rethrowDeadline = (error: unknown): never => {
    if (controller.signal.aborted && controller.signal.reason instanceof PdfAuthError) throw controller.signal.reason;
    throw error;
  };
  try {
    const link = checkedHttpsUrl(input, true);
    let url = link;
    for (let hop = 0; ; hop += 1) {
      const sameSite = isSameSiteHop(link.hostname, url.hostname);
      const cookieKey = `${sameSite ? "same" : "cross"} ${url.origin}${url.pathname}`;
      let header = cookiesByOrigin.get(cookieKey);
      if (header === undefined) {
        let cookies: readonly StrictCookie[] = [];
        try {
          cookies = (await withinDeadline(
            controller.signal,
            options.readCookies(url, Math.max(1, deadline - Date.now())),
          )).cookies;
        } catch (error) {
          if (controller.signal.aborted) rethrowDeadline(error);
          if (!isNoMatchingCookies(error)) throw error;
        }
        header = cookies
          .filter((cookie) => sameSite || cookie.sameSite !== "Strict")
          .map(({ name, value }) => `${name}=${value}`)
          .join("; ");
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
        throw new PdfAuthError("download", `could not reach ${url.hostname}. Check the link and your connection, then try again`, { cause: error });
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        const location = response.headers.get("location");
        if (location === null || location === "") {
          throw new PdfAuthError("download", `${url.hostname} sent a redirect without a destination`);
        }
        if (hop >= maxRedirects) {
          throw new PdfAuthError("download", `the link redirected more than ${maxRedirects} times without reaching a PDF`);
        }
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new PdfAuthError("download", `${url.hostname} sent an invalid redirect`);
        }
        url = checkedHttpsUrl(next, false);
        continue;
      }
      const signedIn = cookieHosts.has(url.hostname);
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel().catch(() => undefined);
        throw refused(options.browser, url.hostname, signedIn);
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        throw new PdfAuthError("download", `${url.hostname} answered with HTTP ${response.status} instead of the PDF`);
      }
      const contentType = contentTypeEssence(response);
      const finalUrl = url;
      let directory = options.directory;
      let result: StreamResult;
      try {
        result = await streamPdf(response, maxBytes, controller.signal, () => {
          directory ??= privateDirectory();
          return join(directory, pdfFilename(finalUrl));
        });
      } catch (error) {
        return rethrowDeadline(error);
      }
      if (result.pdf) {
        return {
          path: join(directory ?? "", pdfFilename(finalUrl)),
          byteLength: result.byteLength,
          finalUrl,
          cookieHosts: [...cookieHosts],
        };
      }
      if (looksLikeHtml(result.head, contentType)) throw refused(options.browser, url.hostname, signedIn);
      throw new PdfAuthError("download", "the link did not return a PDF file");
    }
  } finally {
    clearTimeout(timer);
  }
}

/** A new owner-only temporary folder. */
function privateDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "ghostget-pdf-"));
  chmodSync(directory, 0o700);
  return directory;
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

/** A PDF Ghostget already downloaded, for Wordcell to import as that link. */
export type PdfDownloadedSource = {
  /** Owner-only local copy; Ghostget removes it after the import. */
  readonly inputPath: string;
  /** The link the person gave, with secrets in the query redacted. */
  readonly requestedUrl: string;
  /** The link the PDF finally came from, redacted the same way. */
  readonly finalUrl: string;
};

/**
 * Runs Wordcell `pdf`. Without `download` it is the ordinary anonymous path;
 * with it, Wordcell imports the local copy but records the web link as the
 * note's source, exactly as when it downloads the link itself.
 */
export type RunWordcellPdf = (
  pdfArguments: readonly string[],
  download?: PdfDownloadedSource,
) => Promise<number>;

export type PdfAuthDependencies = {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly runWordcellPdf: RunWordcellPdf;
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
  let auth: GhostgetAuth;
  try {
    auth = load(signIn.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^auth locator .* was not found/u.test(message)) {
      throw new PdfAuthError("usage", `there is no connected account named ${signIn.id}; ghostget auth list shows the ones you have`, { cause: error });
    }
    throw error;
  }
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

function cookieFilePath(signIn: PdfSignIn, auth: GhostgetAuth | undefined): string | undefined {
  if (signIn.kind === "cookies-file") return signIn.path;
  return auth?.kind === "cookies-file" ? auth.path : undefined;
}

/**
 * Check a cookie file once, before the download, with the same reader `read`
 * uses. A file with no cookies for the first link is fine (a DOI link, say,
 * redirects to the publisher the cookies belong to); a file that cannot be
 * used at all is a plain error instead of an anonymous download.
 */
async function checkCookieFile(path: string, url: URL, requireExplicitScope: boolean): Promise<void> {
  const { readCookieFile } = await import("@hraness/wordcell/clip/cookies");
  const checked = readCookieFile(path, url, { requirePrivate: true });
  if (checked.ok) {
    if (requireExplicitScope && checked.scopeProvenance !== "explicit") {
      throw usage(`the cookie file ${path} must say which website each cookie belongs to; export it as a Netscape cookies.txt file`);
    }
    return;
  }
  if (checked.reason === "empty") return;
  if (checked.reason === "unavailable") throw usage(`could not open the cookie file ${path}`);
  if (checked.reason === "unsafe-permissions") {
    throw usage(`the cookie file ${path} must be readable only by you; run chmod 600 on it and try again`);
  }
  if (checked.reason === "too-large") throw usage(`the cookie file ${path} is too large to be a browser cookie export`);
  throw usage(`the cookie file ${path} is not in a format Ghostget can read; export it as a Netscape cookies.txt file`);
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

async function redactedUrl(url: URL): Promise<string> {
  const { sanitizeArtifactUrl } = await import("@hraness/wordcell/clip/persist");
  return sanitizeArtifactUrl(url.href);
}

/**
 * Wordcell `pdf` for a PDF Ghostget already downloaded: the arguments keep the
 * web link, and Wordcell's source step is replaced by the local copy, so the
 * note's `source_url` and the manifest's requested and final URLs are the same
 * as for an anonymous download.
 */
export async function runWordcellPdfWithDownload(
  pdfArguments: readonly string[],
  download: PdfDownloadedSource,
  environment: Readonly<Record<string, string | undefined>>,
  output: PdfAuthOutput,
  /** Test seam for the capture step; the source step is always the local copy. */
  capture: { readonly runPdfCapture?: typeof import("@hraness/wordcell/pdf").runPdfCapture } = {},
): Promise<number> {
  const { runPdfCommand } = await import("@hraness/wordcell/pdf");
  return runPdfCommand(pdfArguments, environment, output, {
    ...capture,
    preparePdfSource: async () => ({
      inputPath: download.inputPath,
      remoteSource: { requestedUrl: download.requestedUrl, finalUrl: download.finalUrl },
      dispose: () => undefined,
    }),
  });
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
  checkedHttpsUrl(url, true);
  const signInResolved = resolveProfilePath(signIn);
  const loadAuthRecord = dependencies.loadAuth ?? ((id: string) => {
    throw new Error(`auth locator ${id} cannot be loaded`);
  });
  const auth = authForSignIn(signInResolved, loadAuthRecord);
  const browser = browserLabel(signInResolved, auth);
  const timeoutMs = validated.timeoutMs ?? PDF_AUTH_DEFAULTS.timeoutMs;
  const readCookies = dependencies.readCookies ?? defaultReadCookies;
  const cookiesFile = cookieFilePath(signInResolved, auth);
  if (cookiesFile !== undefined && dependencies.readCookies === undefined) {
    await checkCookieFile(cookiesFile, url, signInResolved.kind === "cookies-file");
  }
  dependencies.beforeCookieRead?.();

  const directory = (dependencies.makeTemporaryDirectory ?? privateDirectory)();
  const remove = dependencies.removeDirectory
    ?? ((path: string) => rmSync(path, { recursive: true, force: true }));
  try {
    chmodSync(directory, 0o700);
    const download = await downloadSignedInPdf(url, {
      readCookies: (hop, hopTimeoutMs) => readCookies(signInResolved, auth, hop, hopTimeoutMs),
      fetch: dependencies.fetch ?? defaultFetch,
      browser,
      directory,
      timeoutMs,
      ...(validated.maxPdfBytes === undefined ? {} : { maxPdfBytes: validated.maxPdfBytes }),
    });
    return await dependencies.runWordcellPdf(remaining, {
      inputPath: download.path,
      requestedUrl: await redactedUrl(url),
      finalUrl: await redactedUrl(download.finalUrl),
    });
  } finally {
    remove(directory);
  }
}

const CHROMIUM_SOURCES: ReadonlySet<string> = new Set(["chrome", "arc", "brave", "chromium", "edge"]);

function hasCookieStore(directory: string): boolean {
  return existsSync(join(directory, "Cookies")) || existsSync(join(directory, "Network", "Cookies"));
}

/**
 * `read --browser-profile <path>` and `auth add --browser-profile <path>` take
 * a browser data folder whose sign-in lives in its `Default` profile. The
 * cookie reader wants the profile folder itself, so a data folder is resolved
 * to its `Default` profile, and a folder with no saved sign-in at all is a
 * plain error instead of a silent anonymous download.
 */
export function resolveProfilePath(signIn: PdfSignIn, home: string = homedir()): PdfSignIn {
  if (signIn.kind !== "browser" || signIn.profile === undefined || !CHROMIUM_SOURCES.has(signIn.source)) return signIn;
  const profile = signIn.profile;
  if (!profile.includes("/") && !profile.includes("\\")) return signIn;
  const expanded = profile.startsWith("~/")
    ? join(home, profile.slice(2))
    : isAbsolute(profile) ? profile : resolve(profile);
  let isFile = false;
  try {
    isFile = statSync(expanded).isFile();
  } catch {
    isFile = false;
  }
  if (isFile || hasCookieStore(expanded)) return { ...signIn, profile: expanded };
  const inner = join(expanded, "Default");
  if (hasCookieStore(inner)) return { ...signIn, profile: inner };
  throw usage(`the browser profile folder ${profile} has no saved sign-in; give a profile name instead (ghostget browsers lists them)`);
}

function terminalSafe(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu, "?");
}

/** Plain sentences for failures the shared cookie readers report in their own words. */
function plainCookieFailure(message: string): string | null {
  if (/^authenticated API cookie files require an explicit domain or URL/u.test(message)) {
    return "the cookie file must say which website each cookie belongs to; export it as a Netscape cookies.txt file";
  }
  if (/^the explicitly selected cookie file contained no usable cookies/u.test(message)) {
    return "the cookie file has no cookies for this website";
  }
  return null;
}

/**
 * The `ghostget pdf` entry for sign-in options: runs the download, shows the
 * keychain notice the same way `read` does (a JSON line for agents, a short
 * notice on a terminal), and turns failures into plain sentences with a next
 * step. Returns the process exit code.
 */
export async function runSignedInPdfCommand(
  pdfArguments: readonly string[],
  output: PdfAuthOutput,
  options: {
    readonly environment: Readonly<Record<string, string | undefined>>;
    readonly runWordcellPdf: RunWordcellPdf;
    readonly stdinIsTTY?: boolean;
    readonly stderrIsTTY?: boolean;
    readonly overrides?: Partial<PdfAuthDependencies>;
  },
): Promise<number> {
  const json = pdfArguments.includes("--json");
  const quiet = json || pdfArguments.includes("--quiet");
  const { cliSentence, cliStyle, renderCliError } = await import("./cli-style");
  const cookieAccess = await import("./cookie-access");
  const stderrIsTTY = options.stderrIsTTY ?? process.stderr.isTTY === true;
  const style = cliStyle(options.environment, stderrIsTTY);
  const fail = (code: string, message: string, next: string, exitCode: number): number => {
    const sentence = cliSentence(terminalSafe(message));
    if (json) {
      output.stdout(`${JSON.stringify({ ok: false, error: { code, message: sentence, next } })}\n`);
    } else {
      output.stderr(renderCliError(style, sentence, next));
    }
    return exitCode;
  };
  const { stateKeychainNoticeRecord } = await import("./keychain-notice-record");
  cookieAccess.configureCookieAccessNotice({
    environment: options.environment,
    stdinIsTTY: options.stdinIsTTY ?? process.stdin.isTTY === true,
    stderrIsTTY,
    write: (text) => output.stderr(text),
    readKey: (timeoutSeconds) => cookieAccess.terminalReadKey(timeoutSeconds),
    confirm: false,
    record: stateKeychainNoticeRecord(options.environment),
  });
  const openFirst = "Open the link in your browser first, then run this again";
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
      if (error.code === "usage") {
        const next = error.message.startsWith("there is no connected account") ? "ghostget auth list" : "ghostget pdf --help";
        return fail("usage", error.message, next, 2);
      }
      if (error.code === "access") return fail("no-access", error.message, openFirst, 1);
      if (error.code === "no-sign-in") return fail("no-sign-in", error.message, "ghostget browsers", 1);
      return fail("download-failed", error.message, "ghostget pdf --help", 1);
    }
    const message = error instanceof Error ? error.message : "the signed-in PDF download failed";
    const plain = plainCookieFailure(message);
    if (plain !== null) return fail("no-sign-in", plain, "ghostget pdf --help", 2);
    if (/no matching cookies|no usable origin-scoped cookies|could not be read/u.test(message)) {
      return fail("no-sign-in", `could not use your browser sign-in: ${message}`, openFirst, 1);
    }
    return fail("download-failed", `the signed-in PDF download failed: ${message}`, "ghostget pdf --help", 1);
  } finally {
    cookieAccess.configureCookieAccessNotice(null);
  }
}
