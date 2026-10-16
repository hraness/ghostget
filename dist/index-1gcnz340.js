// @bun
import {
  cliStyle,
  responsibleApp
} from "./index-nf661g95.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/cookie-access.ts
import { statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  createCookieRecordReader
} from "@hraness/wordcell/clip/acquire";
import { getCookies } from "@steipete/sweet-cookie";

// src/cookie-access-error.ts
var FULL_DISK_ACCESS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";
var FULL_DISK_ACCESS_PATH = "System Settings \u203A Privacy & Security \u203A Full Disk Access";

class CookieAccessError extends Error {
  code;
  permission;
  browser;
  requester;
  settingsUrl;
  constructor(code, browser, requester, options) {
    super(cookieAccessMessage(code, browser, requester), options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "CookieAccessError";
    this.code = code;
    this.permission = code === "FDA_DENIED" ? "full-disk-access" : "keychain";
    this.browser = browser;
    this.requester = requester;
    this.settingsUrl = code === "FDA_DENIED" ? FULL_DISK_ACCESS_URL : null;
  }
}
function keychainAsk(browser) {
  return `use "${browser} Safe Storage" from your keychain`;
}
function cookieAccessMessage(code, browser, requester) {
  if (code === "KEYCHAIN_DENIED")
    return `Ghostget can't ${keychainAsk(browser)}: the keychain request was denied`;
  if (code === "KEYCHAIN_UNAVAILABLE")
    return `Ghostget couldn't ${keychainAsk(browser)}: the keychain was locked or the request timed out`;
  return `Ghostget can't read ${browser}'s cookies: macOS access is off for ${requester}`;
}
function cookieAccessRemedy(error) {
  if (error.code === "KEYCHAIN_DENIED")
    return "Run it again and choose Always Allow when macOS asks.";
  if (error.code === "KEYCHAIN_UNAVAILABLE")
    return "Unlock your login keychain, run it again and answer the macOS dialog.";
  return `Turn on ${error.requester} in ${FULL_DISK_ACCESS_PATH}.`;
}
function findCookieAccessError(error) {
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined && current !== null; depth += 1) {
    if (current instanceof CookieAccessError)
      return current;
    current = current instanceof Error ? current.cause : undefined;
  }
  return null;
}
// src/cookie-access.ts
var KEYCHAIN_BROWSERS = Object.freeze({
  chrome: "Chrome",
  arc: "Arc",
  brave: "Brave",
  chromium: "Chromium",
  edge: "Microsoft Edge"
});
function classifyKeychainFailure(text) {
  const lower = text.toLowerCase();
  if (lower.includes("user canceled") || lower.includes("passphrase you entered is not correct") || lower.includes("authorization was denied") || lower.includes("not allowed to access") || /\bexit (51|45|128)\b/u.test(lower))
    return "denied";
  if (lower.includes("interaction is not allowed") || lower.includes("timed out after") || lower.includes("the keychain could not be read") || /\bexit (36|124)\b/u.test(lower))
    return "unavailable";
  if (lower.includes("could not be found") || /\bexit 44\b/u.test(lower))
    return "missing";
  return null;
}
function providerWarnings(value) {
  if (value === null || typeof value !== "object")
    return [];
  const warnings = value.warnings;
  if (!Array.isArray(warnings))
    return [];
  return warnings.filter((warning) => typeof warning === "string").slice(0, 64);
}
function keychainBrowserFor(warning, sources) {
  const match = /Keychain \(([^)]{1,64}) Safe Storage\)/u.exec(warning);
  if (match?.[1] !== undefined)
    return match[1];
  if (/Microsoft Edge Safe Storage/u.test(warning))
    return "Microsoft Edge";
  const first = sources.find((source) => KEYCHAIN_BROWSERS[source] !== undefined);
  return first === undefined ? null : KEYCHAIN_BROWSERS[first] ?? null;
}
function classifyCookieProviderResult(value, sources) {
  for (const warning of providerWarnings(value)) {
    if (/keychain/iu.test(warning)) {
      const kind = classifyKeychainFailure(warning);
      const browser = keychainBrowserFor(warning, sources);
      if (browser === null)
        continue;
      if (kind === "denied")
        return { code: "KEYCHAIN_DENIED", browser };
      if (kind === "unavailable")
        return { code: "KEYCHAIN_UNAVAILABLE", browser };
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
var probeSafariAccess = () => {
  try {
    statSync(join(homedir(), "Library", "Containers", "com.apple.Safari", "Data", "Library", "Cookies"));
    return "ok";
  } catch (error) {
    const code = error.code;
    return code === "EPERM" || code === "EACCES" ? "denied" : "missing";
  }
};
var AGENT_MARKERS = [
  "AI_AGENT",
  "CLAUDECODE",
  "CODEX_SANDBOX",
  "CODEX_SANDBOX_NETWORK_DISABLED",
  "CURSOR_AGENT",
  "GEMINI_CLI"
];
function detectCookieAudience(environment, stderrIsTTY) {
  const explicit = environment.HRANESS_AUDIENCE;
  if (explicit === "human" || explicit === "agent" || explicit === "quiet")
    return explicit;
  if (explicit === "off")
    return "quiet";
  if (AGENT_MARKERS.some((name) => (environment[name] ?? "") !== ""))
    return "agent";
  return stderrIsTTY ? "human" : "quiet";
}
function keychainNoticeLines(browser, requester = "security") {
  return [
    `macOS will ask to let ${requester} ${keychainAsk(browser)} for Ghostget.`,
    `Ghostget uses it to read the ${browser} sign-in you already have and never stores it. Enter your Mac password if asked, then choose Always Allow so macOS doesn't ask again.`
  ];
}
var NOTICE_WAIT_SECONDS = 120;
async function showKeychainNotice(browser, io) {
  const audience = detectCookieAudience(io.environment, io.stderrIsTTY);
  const [first, second] = keychainNoticeLines(browser, keychainRequester(io.environment));
  if (audience === "quiet")
    return "continue";
  if (audience === "agent") {
    io.write(`${JSON.stringify({
      type: "permission-notice",
      product: "Ghostget",
      kind: "keychain",
      message: `${first} ${second}`
    })}
`);
    return "continue";
  }
  const style = cliStyle(io.environment, io.stderrIsTTY);
  const interactive = io.confirm && io.stdinIsTTY && io.stderrIsTTY && io.readKey !== undefined;
  io.write(`${style.symbol("notice")} ${first}
   ${second}
${interactive ? `   Press Enter to continue \xB7 s to skip
` : ""}`);
  if (!interactive || io.readKey === undefined)
    return "continue";
  const deadline = Date.now() + NOTICE_WAIT_SECONDS * 1000;
  for (;; ) {
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    if (remaining <= 0)
      return "skip";
    const key = await io.readKey(remaining);
    if (key === "enter" || key === "unavailable")
      return "continue";
    if (key === "s" || key === "timeout")
      return "skip";
  }
}
function classifyTerminalKey(text) {
  const first = text[0] ?? "";
  if (first === "\x03")
    return "interrupt";
  if (first === "\x04")
    return "s";
  if (first === "\r" || first === `
`)
    return "enter";
  if (first === "s" || first === "S")
    return "s";
  return "other";
}
function terminalReadKey(timeoutSeconds, stdin = process.stdin, interrupt = () => {
  process.kill(process.pid, "SIGINT");
}) {
  return new Promise((resolve) => {
    const wasRaw = stdin.isRaw === true;
    let settled = false;
    let listening = false;
    const finish = (key) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      if (listening) {
        stdin.off("data", onData);
        stdin.off("end", onClosed);
        stdin.off("close", onClosed);
        try {
          stdin.setRawMode(wasRaw);
        } catch {}
        stdin.pause();
        stdin.unref?.();
      }
      resolve(key);
    };
    const onClosed = () => finish("s");
    const onData = (chunk) => {
      const key = classifyTerminalKey(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      if (key === "interrupt") {
        finish("s");
        interrupt();
        return;
      }
      finish(key);
    };
    const timer = setTimeout(() => finish("timeout"), timeoutSeconds * 1000);
    try {
      stdin.setRawMode(true);
    } catch {
      finish("unavailable");
      return;
    }
    listening = true;
    stdin.on("data", onData);
    stdin.on("end", onClosed);
    stdin.on("close", onClosed);
    stdin.resume();
  });
}
var activeNotice = null;
var announced = new Set;
function configureCookieAccessNotice(io) {
  activeNotice = io;
  announced.clear();
}

class CookieAccessSkippedError extends Error {
  constructor(browser) {
    super(`Stopped before reading your ${browser} sign-in. Nothing was read`);
    this.name = "CookieAccessSkippedError";
  }
}
function keychainRequester(environment, platform = process.platform) {
  return platform === "darwin" && environment.HRANESS_LOCAL_APP === "1" ? "Ghostget" : "security";
}
function keychainBrowsersFor(options, platform) {
  if (options.cookiesFile !== undefined || platform !== "darwin")
    return [];
  return [...new Set(options.cookieSources.flatMap((source) => {
    const browser = KEYCHAIN_BROWSERS[source];
    return browser === undefined ? [] : [browser];
  }))];
}
async function announceKeychainReads(options, platform) {
  const notice = activeNotice;
  if (notice === null)
    return;
  for (const browser of keychainBrowsersFor(options, platform)) {
    if (announced.has(browser))
      continue;
    announced.add(browser);
    if (notice.record?.has(browser) === true)
      continue;
    if (await showKeychainNotice(browser, notice) === "skip")
      throw new CookieAccessSkippedError(browser);
  }
}
var UNPROMPTED_KEYCHAIN_READ_MS = 1000;
function updateKeychainRecord(options, platform, warnings, elapsedMs, succeeded) {
  const record = activeNotice?.record;
  if (record?.update === undefined)
    return;
  const browsers = keychainBrowsersFor(options, platform);
  if (browsers.length === 0)
    return;
  if (warnings.some((warning) => /cookies database not found/iu.test(warning)))
    return;
  const clean = succeeded && !warnings.some((warning) => /keychain/iu.test(warning));
  if (clean && elapsedMs < UNPROMPTED_KEYCHAIN_READ_MS && browsers.length === 1) {
    record.update(browsers, []);
  } else if (!clean || elapsedMs >= UNPROMPTED_KEYCHAIN_READ_MS) {
    record.update([], browsers);
  }
}
function createClassifiedCookieRecordReader(store, context = {}) {
  const probeSafari = context.probeSafari ?? probeSafariAccess;
  const platform = context.platform ?? process.platform;
  const now = context.now ?? (() => performance.now());
  return async (options, url) => {
    const environment = context.environment ?? process.env;
    let observed = null;
    const warnings = [];
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
      const failure = observed;
      if (failure !== null) {
        const requester = failure.code === "FDA_DENIED" ? responsibleApp(environment) : keychainRequester(environment, platform);
        throw new CookieAccessError(failure.code, failure.browser, requester, { cause: error });
      }
      if (options.cookiesFile === undefined && options.cookieProfile === undefined && options.cookieSources.includes("safari") && platform === "darwin" && probeSafari() === "denied") {
        throw new CookieAccessError("FDA_DENIED", "Safari", responsibleApp(environment), { cause: error });
      }
      throw error;
    }
  };
}
var acquireCookieRecords = createClassifiedCookieRecordReader(async (options) => {
  if (process.platform === "darwin" && process.env.HRANESS_LOCAL_APP === "1") {
    const { createSignedCookieStore } = await import("./cookie-chromium-mac-ke616638.js");
    return createSignedCookieStore(process.env)(options);
  }
  return getCookies(options);
});

export { FULL_DISK_ACCESS_URL, FULL_DISK_ACCESS_PATH, CookieAccessError, cookieAccessRemedy, findCookieAccessError, classifyKeychainFailure, classifyCookieProviderResult, probeSafariAccess, detectCookieAudience, keychainNoticeLines, showKeychainNotice, classifyTerminalKey, terminalReadKey, configureCookieAccessNotice, CookieAccessSkippedError, keychainRequester, UNPROMPTED_KEYCHAIN_READ_MS, createClassifiedCookieRecordReader, acquireCookieRecords };
