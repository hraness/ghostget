/**
 * The macOS Chromium cookie read behind the signed local helper (GG-8).
 *
 * Sweet Cookie's macOS providers resolve each browser's cookie database and
 * decrypt rows themselves; only the "Safe Storage" key lookup leaves the
 * process, through `security find-generic-password`, so the macOS prompt and
 * the item's access list name a system tool. When `HRANESS_LOCAL_APP=1` is
 * set, this module runs the same `getCookies` call with a private `security`
 * bridge first in `PATH`: the bridge answers only
 * `find-generic-password -w -a <account> -s <service>` and forwards it to the
 * signed `ghostget-cookie-reader` helper inside
 * `~/Applications/Hraness/Ghostget.app`, so the keychain read is attributed
 * to Ghostget's local signature. Every other part of the read — database
 * discovery, snapshotting, AES-128-CBC decryption, profile selection — is
 * Sweet Cookie's own code, and without the opt-in nothing changes at all.
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getCookies } from "@steipete/sweet-cookie";

import {
  CHROMIUM_SAFE_STORAGE,
  ensureLocalApp,
  localAppEnabled,
  safeStorageWarning,
  type AssembledLocalApp,
  type LocalAppEnvironment,
} from "./cookie-safe-storage";

/** Chrome's label is the fallback when no explicit browser names a store. */
const CHROME_SAFE_STORAGE_LABEL = "Chrome Safe Storage";

export type GetCookiesLike = (options: unknown) => Promise<unknown>;

export type SignedCookieStoreDependencies = {
  readonly platform?: NodeJS.Platform;
  readonly ensureApp?: (environment: LocalAppEnvironment) => Promise<AssembledLocalApp>;
  /** The base store every non-bridged call (and every test double) uses. */
  readonly getCookies?: GetCookiesLike;
  /** Bridge directory creation hook; tests substitute a fixed private dir. */
  readonly bridgeDirectory?: () => string;
};

// ---------------------------------------------------------------------------
// The `security` bridge script
// ---------------------------------------------------------------------------

/**
 * A `security` that answers exactly one subcommand by forwarding it to the
 * signed helper's `generic_password_read` line protocol. The helper exits 0
 * for every answered request, so the bridge translates `{"ok":false,"code"}`
 * back into the exit statuses the caller's classifier already types: 128
 * (user canceled) and 51 (auth failed) are denials, 36 a locked keychain,
 * 44 a missing item. Anything else — other `security` subcommands included —
 * exits nonzero instead of silently answering.
 */
export function keychainBridgeScript(helperPath: string): string {
  if (
    helperPath.length === 0
    || !helperPath.startsWith("/")
    || /['\u0000-\u001f']/u.test(helperPath)
  ) {
    throw new Error("the signed cookie reader path must be absolute and single-quotable");
  }
  return `#!/bin/sh
# Ghostget's signed keychain bridge. It answers only
# \`security find-generic-password -w -a <account> -s <service>\` by asking the
# signed helper inside Ghostget.app, so macOS names Ghostget in the prompt.
# Every other invocation exits nonzero.
if [ "$1" != "find-generic-password" ]; then
  exit 2
fi
account=""
service=""
shift
while [ $# -gt 0 ]; do
  case "$1" in
    -w) shift ;;
    -a) [ $# -ge 2 ] || exit 2; account="$2"; shift 2 ;;
    -s) [ $# -ge 2 ] || exit 2; service="$2"; shift 2 ;;
    *) exit 2 ;;
  esac
done
if [ -z "$account" ] || [ -z "$service" ]; then
  exit 2
fi
# Only the known Safe Storage selectors are forwarded, so the request JSON is
# always well formed and this bridge cannot probe arbitrary keychain items.
case "$account" in
  Chrome|Brave|Arc|Chromium|Dia|"Microsoft Edge") ;;
  *) exit 2 ;;
esac
case "$service" in
  "Chrome Safe Storage"|"Brave Safe Storage"|"Arc Safe Storage"|"Chromium Safe Storage"|"Dia Safe Storage"|"Microsoft Edge Safe Storage"|"Microsoft Edge") ;;
  *) exit 2 ;;
esac
response=$(printf '%s\\n' "{\\"op\\":\\"generic_password_read\\",\\"service\\":\\"$service\\",\\"account\\":\\"$account\\"}" | '${helperPath}' 2>/dev/null)
case "$response" in
  *'"contentBase64":"'*)
    encoded=$(printf '%s' "$response" | /usr/bin/sed -n 's/.*"contentBase64":"\\([A-Za-z0-9+/=]*\\)".*/\\1/p')
    if [ -z "$encoded" ]; then
      echo "the signed cookie reader returned no credential" >&2
      exit 1
    fi
    printf '%s' "$encoded" | /usr/bin/base64 --decode
    exit 0
    ;;
esac
code=$(printf '%s' "$response" | /usr/bin/sed -n 's/.*"code":"\\([^"]*\\)".*/\\1/p')
case "$code" in
  denied)
    echo "The user name or passphrase you entered is not correct." >&2
    exit 128
    ;;
  missing)
    echo "The specified item could not be found in the keychain." >&2
    exit 44
    ;;
  interaction-not-allowed)
    echo "User interaction is not allowed." >&2
    exit 36
    ;;
  *)
    echo "The keychain could not be read." >&2
    exit 1
    ;;
esac
`;
}

/**
 * One private directory per process holding the `security` bridge. `mkdtemp`
 * gives owner-only permissions, the file is written with mode 0700, and the
 * directory is removed when the process exits. A helper path baked into a
 * stale script is detected and rewritten.
 */
export function ensureKeychainBridge(
  helperPath: string,
  bridgeDirectory: () => string = defaultBridgeDirectory,
): string {
  const directory = bridgeDirectory();
  const shimPath = join(directory, "security");
  const content = keychainBridgeScript(helperPath);
  let current: string | null = null;
  try {
    current = readFileSync(shimPath, "utf8");
  } catch { /* absent */ }
  if (current !== content) {
    writeFileSync(shimPath, content, { mode: 0o700 });
    chmodSync(shimPath, 0o700);
  }
  return directory;
}

let processBridgeDirectory: string | undefined;

function defaultBridgeDirectory(): string {
  if (processBridgeDirectory === undefined) {
    processBridgeDirectory = mkdtempSync(join(tmpdir(), "ghostget-keychain-bridge-"));
    const directory = processBridgeDirectory;
    process.once("exit", () => {
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* already gone */ }
    });
  }
  return processBridgeDirectory;
}

/**
 * Run `run` with the bridge directory first in `PATH`, restoring the exact
 * previous value afterwards — including "unset". The window is one cookie
 * read; only bare `security` lookups resolve differently inside it.
 */
async function withBridgedSecurity<T>(bridgeDirectory: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.PATH;
  process.env.PATH = `${bridgeDirectory}:${previous ?? ""}`;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  }
}

// ---------------------------------------------------------------------------
// Store-reader dispatch
// ---------------------------------------------------------------------------

/** The browsers whose keychain read the bridge answers. */
const BRIDGED_BROWSERS = new Set(["chrome", "edge"]);

function bridgedLabels(options: { readonly browsers?: unknown; readonly chromiumBrowser?: unknown }): readonly string[] {
  const browsers = Array.isArray(options.browsers)
    ? options.browsers.filter((browser): browser is string => typeof browser === "string")
    : [];
  const chromium = typeof options.chromiumBrowser === "string" ? options.chromiumBrowser : undefined;
  const labels = new Set<string>();
  if (chromium !== undefined) {
    const selector = CHROMIUM_SAFE_STORAGE[chromium];
    if (selector !== undefined) labels.add(selector.label);
  }
  for (const browser of browsers) {
    // `chromiumBrowser` retargets the chrome backend's keychain item, so a
    // chrome entry does not add a second label once it is set.
    if (chromium !== undefined && browser === "chrome") continue;
    const selector = CHROMIUM_SAFE_STORAGE[browser];
    if (selector !== undefined) labels.add(selector.label);
  }
  if (labels.size === 0) labels.add(CHROME_SAFE_STORAGE_LABEL);
  return [...labels];
}

function keychainReadWouldHappen(options: { readonly browsers?: unknown; readonly chromiumBrowser?: unknown }): boolean {
  if (typeof options.chromiumBrowser === "string") return true;
  if (!Array.isArray(options.browsers)) {
    // No explicit list: the provider's own defaults/env include Chromium.
    return true;
  }
  return options.browsers.some((browser) => typeof browser === "string" && BRIDGED_BROWSERS.has(browser));
}

/**
 * A Sweet Cookie store reader that resolves `security` to the signed-bridge
 * script when `HRANESS_LOCAL_APP=1` on macOS, so the Safe Storage keychain
 * read is attributed to Ghostget's local app signature. The bridge is
 * assembled lazily; when assembly fails the read reports a typed keychain
 * warning and never falls back to the system `security` tool. Without the
 * opt-in — or for selections that cannot touch the keychain — every call
 * delegates to `getCookies` untouched.
 */
export function createSignedCookieStore(
  environment: LocalAppEnvironment,
  dependencies: SignedCookieStoreDependencies = {},
): GetCookiesLike {
  const platform = dependencies.platform ?? process.platform;
  const base = dependencies.getCookies ?? ((options) => getCookies(options as Parameters<typeof getCookies>[0]));
  return async (options) => {
    const selection = typeof options === "object" && options !== null ? options : {};
    if (
      !localAppEnabled(environment, platform)
      || !keychainReadWouldHappen(selection)
    ) {
      return base(options);
    }

    let assembled: AssembledLocalApp;
    try {
      assembled = await (dependencies.ensureApp ?? ensureLocalApp)(environment);
    } catch {
      return {
        cookies: [],
        warnings: bridgedLabels(selection).map((label) =>
          safeStorageWarning(label, "error")),
      };
    }

    let directory: string;
    try {
      directory = ensureKeychainBridge(
        assembled.helperPath,
        dependencies.bridgeDirectory ?? defaultBridgeDirectory,
      );
    } catch {
      return {
        cookies: [],
        warnings: bridgedLabels(selection).map((label) =>
          safeStorageWarning(label, "error")),
      };
    }
    return withBridgedSecurity(directory, () => base(options));
  };
}

/** Test hook: release the process-wide bridge directory memo. */
export function resetKeychainBridge(): void {
  if (processBridgeDirectory !== undefined && existsSync(processBridgeDirectory)) {
    rmSync(processBridgeDirectory, { recursive: true, force: true });
  }
  processBridgeDirectory = undefined;
}
