// @bun
import {
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  readPrivateStateFileIfPresent,
  writePrivateJson
} from "./index-74p4jtfz.js";
import"./index-gnc5dy8n.js";
import"./index-5m1wfgkw.js";
import"./index-26yq8q16.js";
import"./index-pqsan2cn.js";
import"./index-z1w83f81.js";

// src/keychain-notice-record.ts
import { join } from "path";
var KNOWN_BROWSERS = new Set(["Chrome", "Arc", "Brave", "Chromium", "Microsoft Edge"]);
var MAX_RECORD_BYTES = 1024;
function keychainNoticeRecordPath(environment) {
  return join(ghostgetStateHome(environment), "control", "keychain-notices.json");
}
function parseKeychainNoticeRecord(text) {
  if (text === null)
    return new Set;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return new Set;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return new Set;
  const { version, browsers } = value;
  if (version !== 1 || !Array.isArray(browsers))
    return new Set;
  return new Set(browsers.filter((browser) => typeof browser === "string" && KNOWN_BROWSERS.has(browser)));
}
function stateKeychainNoticeRecord(environment) {
  let loaded = null;
  const load = () => {
    if (loaded !== null)
      return loaded;
    try {
      loaded = new Set(parseKeychainNoticeRecord(readPrivateStateFileIfPresent(keychainNoticeRecordPath(environment), MAX_RECORD_BYTES, "keychain notice record", environment)));
    } catch {
      loaded = new Set;
    }
    return loaded;
  };
  return {
    has: (browser) => load().has(browser),
    update: (granted, lost) => {
      const current = load();
      let changed = false;
      for (const browser of granted) {
        if (KNOWN_BROWSERS.has(browser) && !current.has(browser)) {
          current.add(browser);
          changed = true;
        }
      }
      for (const browser of lost) {
        if (current.delete(browser))
          changed = true;
      }
      if (!changed)
        return;
      try {
        ensurePrivateStateDirectory(join(ghostgetStateHome(environment), "control"), environment);
        writePrivateJson(keychainNoticeRecordPath(environment), { version: 1, browsers: [...current].sort() });
      } catch {}
    }
  };
}
export {
  stateKeychainNoticeRecord,
  parseKeychainNoticeRecord,
  keychainNoticeRecordPath
};
