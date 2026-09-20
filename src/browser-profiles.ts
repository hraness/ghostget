import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { cookieSources, type CookieSource } from "@hraness/kb/clip/args";

/**
 * Local browser profile discovery for cookie selection. Reading a profile's
 * cookies is a separate, explicit step: this module only reports which named
 * profiles exist so `--cookie-source` and `--cookie-profile` can be chosen
 * without guessing. It never opens a cookie store and never reports an
 * absolute path, a signed-in address, or any other profile content.
 */

/** Chromium writes profile metadata as JSON; a larger file is not one. */
const MAX_LOCAL_STATE_BYTES = 8 * 1024 * 1024;
/** Firefox writes an INI; the same bound keeps a hostile file out of memory. */
const MAX_PROFILES_INI_BYTES = 1024 * 1024;
/** One browser cannot contribute an unbounded menu, list, or prompt. */
export const MAX_DISCOVERED_PROFILES_PER_BROWSER = 64;

export type BrowserProfile = {
  /** The `--cookie-source` value for this profile. */
  readonly source: CookieSource;
  /**
   * The `--cookie-profile` value, or null when the source takes no profile.
   * Chromium browsers accept the name shown in the browser; Firefox accepts
   * the name in its profile manager.
   */
  readonly profile: string | null;
  /**
   * The on-disk profile directory name for a Chromium browser, such as
   * `Default` or `Profile 9`. Local controls address a profile this way.
   */
  readonly directory: string | null;
  /** Whether this profile has a cookie store to read. */
  readonly cookies: boolean;
};

export type BrowserProfileDiscovery = {
  readonly source: CookieSource;
  /** Whether this browser keeps profile data on this machine. */
  readonly installed: boolean;
  readonly profiles: readonly BrowserProfile[];
};

type ChromiumLayout = { readonly directory: string; readonly userDataSuffix?: readonly string[] };

/**
 * Where each Chromium browser keeps its user-data root, relative to the macOS
 * application-support directory. Arc nests one more level than the others.
 */
const CHROMIUM_LAYOUTS: Readonly<Record<string, ChromiumLayout>> = {
  chrome: { directory: "Google/Chrome" },
  brave: { directory: "BraveSoftware/Brave-Browser" },
  chromium: { directory: "Chromium" },
  edge: { directory: "Microsoft Edge" },
  arc: { directory: "Arc", userDataSuffix: ["User Data"] },
};

function applicationSupport(home: string): string {
  return join(home, "Library", "Application Support");
}

function isRegularFile(path: string): boolean {
  try {
    const entry = lstatSync(path);
    return !entry.isSymbolicLink() && entry.isFile();
  } catch {
    return false;
  }
}

function isRealDirectory(path: string): boolean {
  try {
    const entry = lstatSync(path);
    return !entry.isSymbolicLink() && entry.isDirectory();
  } catch {
    return false;
  }
}

function boundedJsonFile(path: string, maximumBytes: number): unknown {
  try {
    const entry = lstatSync(path);
    if (entry.isSymbolicLink() || !entry.isFile() || entry.size > maximumBytes) return null;
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function boundedTextFile(path: string, maximumBytes: number): string | null {
  try {
    const entry = lstatSync(path);
    if (entry.isSymbolicLink() || !entry.isFile() || entry.size > maximumBytes) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * A profile name reaches a menu, a prompt and a command line, so it may not
 * carry control characters, bidirectional overrides or path separators.
 */
export function isDisplayableProfileName(value: string): boolean {
  if (value.length < 1 || value.length > 128) return false;
  if (value.trim() !== value) return false;
  if (value.includes("/") || value.includes("\\")) return false;
  return ![...value].some((character) =>
    /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/u.test(character));
}

/** Chromium only ever creates `Default` and numbered profile directories. */
export function isChromiumProfileDirectory(value: string): boolean {
  return /^(?:Default|Profile [1-9][0-9]{0,2})$/u.test(value);
}

function chromiumProfileNames(localState: unknown): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  if (typeof localState !== "object" || localState === null) return names;
  const profile = (localState as { readonly profile?: unknown }).profile;
  if (typeof profile !== "object" || profile === null) return names;
  const cache = (profile as { readonly info_cache?: unknown }).info_cache;
  if (typeof cache !== "object" || cache === null) return names;
  for (const [directory, value] of Object.entries(cache as Record<string, unknown>)) {
    if (!isChromiumProfileDirectory(directory)) continue;
    const name = typeof value === "object" && value !== null
      ? (value as { readonly name?: unknown }).name
      : undefined;
    names.set(
      directory,
      typeof name === "string" && isDisplayableProfileName(name) ? name : directory,
    );
  }
  return names;
}

function chromiumUserDataRoot(home: string, source: string): string | null {
  const layout = Object.hasOwn(CHROMIUM_LAYOUTS, source) ? CHROMIUM_LAYOUTS[source] : undefined;
  if (layout === undefined) return null;
  const root = join(applicationSupport(home), layout.directory, ...(layout.userDataSuffix ?? []));
  return isRealDirectory(root) ? root : null;
}

function discoverChromium(home: string, source: CookieSource): BrowserProfileDiscovery {
  const root = chromiumUserDataRoot(home, source);
  if (root === null) return { source, installed: false, profiles: [] };
  const localState = join(root, "Local State");
  const named = chromiumProfileNames(boundedJsonFile(localState, MAX_LOCAL_STATE_BYTES));
  let directories: readonly string[];
  try {
    directories = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isChromiumProfileDirectory(entry.name))
      .map((entry) => entry.name);
  } catch {
    directories = [];
  }
  // A profile listed only in `Local State` is still selectable; a directory
  // present without metadata keeps its directory name.
  const all = [...new Set([...named.keys(), ...directories])].sort(compareChromiumDirectories);
  const profiles = all.slice(0, MAX_DISCOVERED_PROFILES_PER_BROWSER).flatMap((directory) => {
    if (!isRealDirectory(join(root, directory))) return [];
    const name = named.get(directory) ?? directory;
    return [{
      source,
      profile: name,
      directory,
      cookies: isRegularFile(join(root, directory, "Cookies")),
    }];
  });
  // A shared application-support folder can hold nothing but a native
  // messaging manifest. That is not an installed browser profile store.
  return { source, installed: profiles.length > 0 || isRegularFile(localState), profiles };
}

function compareChromiumDirectories(left: string, right: string): number {
  if (left === right) return 0;
  if (left === "Default") return -1;
  if (right === "Default") return 1;
  const leftIndex = Number(left.slice("Profile ".length));
  const rightIndex = Number(right.slice("Profile ".length));
  return leftIndex - rightIndex;
}

/** `profiles.ini` sections are `Key=value` lines under `[SectionName]`. */
export function parseFirefoxProfileNames(text: string): readonly { readonly name: string; readonly path: string; readonly relative: boolean }[] {
  const found: { name: string; path: string; relative: boolean }[] = [];
  let current: { name?: string; path?: string; relative: boolean } | null = null;
  const commit = () => {
    if (current?.name !== undefined && current.path !== undefined) {
      found.push({ name: current.name, path: current.path, relative: current.relative });
    }
  };
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      commit();
      current = line.startsWith("[Profile") ? { relative: true } : null;
      continue;
    }
    if (current === null) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key === "Name") current.name = value;
    else if (key === "Path") current.path = value;
    else if (key === "IsRelative") current.relative = value !== "0";
  }
  commit();
  return found;
}

function discoverFirefox(home: string): BrowserProfileDiscovery {
  const root = join(applicationSupport(home), "Firefox");
  if (!isRealDirectory(root)) return { source: "firefox", installed: false, profiles: [] };
  const text = boundedTextFile(join(root, "profiles.ini"), MAX_PROFILES_INI_BYTES);
  if (text === null) return { source: "firefox", installed: false, profiles: [] };
  const profiles = parseFirefoxProfileNames(text)
    .filter((entry) => isDisplayableProfileName(entry.name) && entry.relative && !entry.path.includes(".."))
    .slice(0, MAX_DISCOVERED_PROFILES_PER_BROWSER)
    .flatMap((entry) => {
      const directory = join(root, entry.path);
      if (!isRealDirectory(directory)) return [];
      return [{
        source: "firefox" as const,
        profile: entry.name,
        directory: null,
        cookies: isRegularFile(join(directory, "cookies.sqlite")),
      }];
    });
  return { source: "firefox", installed: profiles.length > 0, profiles };
}

function discoverSafari(home: string): BrowserProfileDiscovery {
  // Safari keeps one cookie store per user and takes no profile selector.
  const store = join(home, "Library", "Containers", "com.apple.Safari", "Data", "Library", "Cookies", "Cookies.binarycookies");
  const legacy = join(home, "Library", "Cookies", "Cookies.binarycookies");
  const cookies = isRegularFile(store) || isRegularFile(legacy);
  return {
    source: "safari",
    installed: cookies,
    profiles: cookies ? [{ source: "safari", profile: null, directory: null, cookies: true }] : [],
  };
}

/**
 * Report the browser profiles this machine can offer as a cookie source, in a
 * stable order. Discovery reads profile metadata only; a listed profile is a
 * selectable name, not proof that it holds a usable session for any site.
 */
export function discoverBrowserProfiles(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
): readonly BrowserProfileDiscovery[] {
  // Only the macOS profile layout is described here. Another platform reports
  // nothing rather than guessing at paths it has not been checked against.
  if (platform !== "darwin") return [];
  const home = environment.HOME ?? homedir();
  if (home === "" || !isRealDirectory(home)) return [];
  return cookieSources.map((source) =>
    source === "safari"
      ? discoverSafari(home)
      : source === "firefox"
        ? discoverFirefox(home)
        : discoverChromium(home, source));
}

/** The Chromium profiles local controls can offer for browser sign-in. */
export function discoverChromeProfileChoices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  platform: NodeJS.Platform = process.platform,
): readonly { readonly directory: string; readonly label: string }[] {
  const chrome = discoverBrowserProfiles(environment, platform).find((entry) => entry.source === "chrome");
  if (chrome === undefined) return [];
  return chrome.profiles.flatMap((profile) =>
    profile.directory === null
      ? []
      : [{
          directory: profile.directory,
          label: profile.profile === null || profile.profile === profile.directory
            ? profile.directory
            : `${profile.profile} (${profile.directory})`,
        }]);
}
