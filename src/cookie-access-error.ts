/**
 * The typed error for a browser sign-in read that macOS permissions stopped.
 * Import-free, so read-failure classifiers and the SDK can use it without
 * loading the cookie reader.
 */
export type CookieAccessCode = "KEYCHAIN_DENIED" | "KEYCHAIN_UNAVAILABLE" | "FDA_DENIED";
export type CookiePermissionKind = "keychain" | "full-disk-access";

export const FULL_DISK_ACCESS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";
export const FULL_DISK_ACCESS_PATH = "System Settings › Privacy & Security › Full Disk Access";

/** A macOS permission stopped Ghostget from reading a browser sign-in. */
export class CookieAccessError extends Error {
  readonly code: CookieAccessCode;
  readonly permission: CookiePermissionKind;
  /** Browser label, such as "Chrome" or "Safari". */
  readonly browser: string;
  /** The app macOS shows in its dialog or Settings list. */
  readonly requester: string;
  readonly settingsUrl: string | null;

  constructor(
    code: CookieAccessCode,
    browser: string,
    requester: string,
    options?: { readonly cause?: unknown },
  ) {
    super(cookieAccessMessage(code, browser, requester), options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CookieAccessError";
    this.code = code;
    this.permission = code === "FDA_DENIED" ? "full-disk-access" : "keychain";
    this.browser = browser;
    this.requester = requester;
    this.settingsUrl = code === "FDA_DENIED" ? FULL_DISK_ACCESS_URL : null;
  }
}

export function keychainAsk(browser: string): string {
  return `use "${browser} Safe Storage" from your keychain`;
}

function cookieAccessMessage(code: CookieAccessCode, browser: string, requester: string): string {
  if (code === "KEYCHAIN_DENIED") return `Ghostget can't ${keychainAsk(browser)}: the keychain request was denied`;
  if (code === "KEYCHAIN_UNAVAILABLE") return `Ghostget couldn't ${keychainAsk(browser)}: the keychain was locked or the request timed out`;
  return `Ghostget can't read ${browser}'s cookies: macOS access is off for ${requester}`;
}

/** The follow-up line under a denial, without symbols. */
export function cookieAccessRemedy(error: CookieAccessError): string {
  if (error.code === "KEYCHAIN_DENIED") return "Run it again and choose Always Allow when macOS asks.";
  if (error.code === "KEYCHAIN_UNAVAILABLE") return "Unlock your login keychain, run it again and answer the macOS dialog.";
  return `Turn on ${error.requester} in ${FULL_DISK_ACCESS_PATH}.`;
}

/** Find a cookie access failure anywhere in an error's cause chain. */
export function findCookieAccessError(error: unknown): CookieAccessError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof CookieAccessError) return current;
    current = current instanceof Error ? current.cause : undefined;
  }
  return null;
}
