/**
 * Which browsers' keychain notices Ghostget no longer needs to show.
 *
 * After a person chooses Always Allow, macOS stops asking, so repeating the
 * "macOS will ask" notice on every run would be noise. A browser is added
 * after a keychain read that returned without a dialog, and removed again
 * after one that asked or failed. Deleting the file only brings the notice
 * back.
 */
import { join } from "node:path";

import {
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  readPrivateStateFileIfPresent,
  writePrivateJson,
} from "./storage";

type Environment = Readonly<Record<string, string | undefined>>;

/** Browser labels a record may hold; anything else in the file is ignored. */
const KNOWN_BROWSERS = new Set(["Chrome", "Arc", "Brave", "Chromium", "Microsoft Edge"]);
const MAX_RECORD_BYTES = 1_024;

export type KeychainNoticeRecord = {
  /** True when this browser's keychain access was granted when last read. */
  readonly has: (browser: string) => boolean;
  /** Add browsers read without a dialog; remove browsers whose read asked or failed. */
  readonly update?: (granted: readonly string[], lost: readonly string[]) => void;
};

export function keychainNoticeRecordPath(environment: Environment): string {
  return join(ghostgetStateHome(environment), "control", "keychain-notices.json");
}

/** Parse a stored record; malformed content counts as empty. */
export function parseKeychainNoticeRecord(text: string | null): ReadonlySet<string> {
  if (text === null) return new Set();
  let value: unknown;
  try { value = JSON.parse(text); } catch { return new Set(); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return new Set();
  const { version, browsers } = value as { readonly version?: unknown; readonly browsers?: unknown };
  if (version !== 1 || !Array.isArray(browsers)) return new Set();
  return new Set(browsers.filter((browser): browser is string => typeof browser === "string" && KNOWN_BROWSERS.has(browser)));
}

/**
 * The record for one state home. Reads are lazy and happen once; any storage
 * failure falls back to showing the notice, and a failed write is ignored.
 */
export function stateKeychainNoticeRecord(environment: Environment): KeychainNoticeRecord {
  let loaded: Set<string> | null = null;
  const load = (): Set<string> => {
    if (loaded !== null) return loaded;
    try {
      loaded = new Set(parseKeychainNoticeRecord(readPrivateStateFileIfPresent(
        keychainNoticeRecordPath(environment),
        MAX_RECORD_BYTES,
        "keychain notice record",
        environment,
      )));
    } catch {
      loaded = new Set();
    }
    return loaded;
  };
  return {
    has: (browser) => load().has(browser),
    update: (granted, lost) => {
      const current = load();
      let changed = false;
      for (const browser of granted) {
        if (KNOWN_BROWSERS.has(browser) && !current.has(browser)) { current.add(browser); changed = true; }
      }
      for (const browser of lost) {
        if (current.delete(browser)) changed = true;
      }
      if (!changed) return;
      try {
        ensurePrivateStateDirectory(join(ghostgetStateHome(environment), "control"), environment);
        writePrivateJson(keychainNoticeRecordPath(environment), { version: 1, browsers: [...current].sort() });
      } catch {
        // The record only saves a repeated notice; never fail the command for it.
      }
    },
  };
}
