// @bun
import {
  acquireCookieRecords
} from "./index-1gcnz340.js";
import"./index-nf661g95.js";
import {
  ghostgetStateHome,
  listPrivateStateDirectory,
  readRegularFile
} from "./index-y5035239.js";
import"./index-gnc5dy8n.js";
import {
  hasExactKeys
} from "./index-5m1wfgkw.js";
import"./index-26yq8q16.js";
import {
  sha256
} from "./index-pqsan2cn.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/web-session-cookies.ts
import {
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  timingSafeEqual
} from "crypto";
import {
  copyFileSync,
  existsSync as existsSync2,
  lstatSync as lstatSync2,
  mkdtempSync,
  readFileSync as readFileSync2,
  realpathSync as realpathSync2,
  rmSync
} from "fs";
import { tmpdir as tmpdir3 } from "os";
import { basename as basename3, dirname as dirname3, isAbsolute as isAbsolute2, join as join3, resolve } from "path";
import {
  filterCookies,
  MAX_COOKIE_RECORDS
} from "@hraness/wordcell/clip/cookies";

// src/derive.ts
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  futimesSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync
} from "fs";
import { tmpdir as tmpdir2 } from "os";
import { createConnection, isIP as isIP2 } from "net";
import { basename as basename2, dirname as dirname2, isAbsolute, join as join2 } from "path";
import { fileURLToPath } from "url";
import {
  browserCookieCommands as browserCookieCommands2
} from "@hraness/wordcell/clip/acquire";
import { isPrivateAddress as isPrivateAddress2, isPrivateHostname as isPrivateHostname2 } from "@hraness/wordcell/clip/network";
import { assertOwnedPathSync as assertOwnedPathSync2 } from "@hraness/local-custody/private-paths";

// src/browser.ts
import {
  agentBrowserCommand as packageAgentBrowserCommand,
  browserCookieCommands,
  browserProxyArguments
} from "@hraness/wordcell/clip/acquire";
import { BoundedByteBuffer } from "@hraness/wordcell/clip/bounded-byte-buffer";
import {
  cloneBrowserProfile,
  cloneProfile,
  copyBoundedLocalState,
  isSafeNamedProfile,
  profilePath
} from "@hraness/wordcell/browser-profiles";
import { startNetworkProxy } from "@hraness/wordcell/clip/network-proxy";
import { redactSensitiveText } from "@hraness/wordcell/clip/persist";
import { sanitizeTerminalLine } from "@hraness/wordcell/clip/terminal";
var browserCommandObservations = new WeakMap;
var maximumAgentBrowserControlLaunchHash = (1n << 64n) - 1n;
var inheritedProxyKeys = new Set([
  "ALL_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "all_proxy",
  "http_proxy",
  "https_proxy",
  "no_proxy"
]);
var ownedChromeOnboardingArguments = Object.freeze([
  "--no-first-run",
  "--no-default-browser-check"
]);
var reviewedOwnedChromeArguments = new Set([
  "--profile-directory=Default",
  "--disable-quic",
  "--disable-dns-prefetch",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-features=AsyncDns",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--proxy-bypass-list=<-loopback>"
]);
var maximumAgentBrowserLaunchHash = (1n << 64n) - 1n;
var maximumAgentBrowserJsonNesting = 256;

class AgentBrowserLaunchHashParseError extends Error {
}

class AgentBrowserLaunchHashRewriter {
  #input;
  #replacements = [];
  #index = 0;
  constructor(input) {
    this.#input = input;
  }
  rewrite() {
    this.#parseValue(false, 0);
    this.#skipWhitespace();
    if (this.#index !== this.#input.length) {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
    }
    let rewritten = this.#input;
    for (const replacement of this.#replacements.toReversed()) {
      rewritten = `${rewritten.slice(0, replacement.start)}${replacement.value}${rewritten.slice(replacement.end)}`;
    }
    return rewritten;
  }
  #parseValue(launchHash, depth) {
    this.#skipWhitespace();
    if (launchHash) {
      if (this.#input.startsWith("null", this.#index)) {
        this.#parseLiteral("null");
        return;
      }
      this.#parseLaunchHash();
      return;
    }
    const token = this.#input[this.#index];
    if (token === "{") {
      this.#parseObject(depth + 1);
      return;
    }
    if (token === "[") {
      this.#parseArray(depth + 1);
      return;
    }
    if (token === '"') {
      this.#parseString();
      return;
    }
    if (token === "t") {
      this.#parseLiteral("true");
      return;
    }
    if (token === "f") {
      this.#parseLiteral("false");
      return;
    }
    if (token === "n") {
      this.#parseLiteral("null");
      return;
    }
    this.#parseNumber();
  }
  #parseObject(depth) {
    this.#assertNesting(depth);
    let sawLaunchHash = false;
    this.#index += 1;
    this.#skipWhitespace();
    if (this.#input[this.#index] === "}") {
      this.#index += 1;
      return;
    }
    for (;; ) {
      this.#skipWhitespace();
      const key = this.#parseString();
      if (key === "launchHash") {
        if (sawLaunchHash) {
          throw new AgentBrowserLaunchHashParseError("agent-browser JSON contains a duplicate launchHash field");
        }
        sawLaunchHash = true;
      }
      this.#skipWhitespace();
      if (this.#input[this.#index] !== ":") {
        throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
      }
      this.#index += 1;
      this.#parseValue(key === "launchHash", depth);
      this.#skipWhitespace();
      const separator = this.#input[this.#index];
      if (separator === "}") {
        this.#index += 1;
        return;
      }
      if (separator !== ",") {
        throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
      }
      this.#index += 1;
    }
  }
  #parseArray(depth) {
    this.#assertNesting(depth);
    this.#index += 1;
    this.#skipWhitespace();
    if (this.#input[this.#index] === "]") {
      this.#index += 1;
      return;
    }
    for (;; ) {
      this.#parseValue(false, depth);
      this.#skipWhitespace();
      const separator = this.#input[this.#index];
      if (separator === "]") {
        this.#index += 1;
        return;
      }
      if (separator !== ",") {
        throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
      }
      this.#index += 1;
    }
  }
  #parseString() {
    const start = this.#index;
    if (this.#input[this.#index] !== '"') {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
    }
    this.#index += 1;
    for (;; ) {
      const token = this.#input[this.#index];
      if (token === undefined) {
        throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
      }
      if (token === '"') {
        this.#index += 1;
        return JSON.parse(this.#input.slice(start, this.#index));
      }
      if (token === "\\") {
        this.#index += 2;
      } else {
        this.#index += 1;
      }
    }
  }
  #parseLiteral(literal) {
    if (!this.#input.startsWith(literal, this.#index)) {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
    }
    this.#index += literal.length;
  }
  #parseNumber() {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(this.#input.slice(this.#index));
    if (match === null) {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
    }
    this.#index += match[0].length;
  }
  #parseLaunchHash() {
    const start = this.#index;
    const match = /^(?:0|[1-9][0-9]*)/u.exec(this.#input.slice(start));
    if (match === null) {
      throw new AgentBrowserLaunchHashParseError("agent-browser launchHash is not an unsigned 64-bit integer");
    }
    const value = match[0];
    this.#index += value.length;
    const following = this.#input[this.#index];
    if (following !== undefined && following !== "," && following !== "}" && following !== "]" && following !== " " && following !== "\t" && following !== "\r" && following !== `
`) {
      throw new AgentBrowserLaunchHashParseError("agent-browser launchHash is not an unsigned 64-bit integer");
    }
    if (BigInt(value) > maximumAgentBrowserLaunchHash) {
      throw new AgentBrowserLaunchHashParseError("agent-browser launchHash exceeds an unsigned 64-bit integer");
    }
    this.#replacements.push({
      start,
      end: this.#index,
      value: JSON.stringify(value)
    });
  }
  #skipWhitespace() {
    while (this.#input[this.#index] === " " || this.#input[this.#index] === "\t" || this.#input[this.#index] === "\r" || this.#input[this.#index] === `
`)
      this.#index += 1;
  }
  #assertNesting(depth) {
    if (depth > maximumAgentBrowserJsonNesting) {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON exceeds its nesting bound");
    }
  }
}
var BROWSER_CLEANUP_PROOF_SETTLING_MESSAGES = new Set([
  "agent-browser graceful close could not be verified",
  "browser cleanup daemon did not stop after SIGTERM",
  "browser cleanup daemon quiescence changed",
  "browser cleanup daemon quiescence is unproved",
  "browser cleanup endpoint refusal is unproved",
  "browser cleanup endpoint remained available",
  "browser cleanup launch-intent session quiescence changed",
  "browser cleanup launch-intent session remained active",
  "browser cleanup pinned owner is not quiescent",
  "browser cleanup pinned owner quiescence changed",
  "browser cleanup post-close convergence deadline expired",
  "browser cleanup session inspection could not be verified",
  "browser cleanup session remained active",
  "browser cleanup session quiescence changed",
  "browser cleanup session state changed before termination"
]);

// src/derivation-network-guard.ts
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import {
  assertOwnedPathSync,
  readOwnedFileStableSync
} from "@hraness/local-custody/private-paths";
import { createPrivateFileOnceSync } from "@hraness/local-custody/atomic-publish";
var derivationGuardResourceTypes = Object.freeze([
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "other"
]);
var DERIVATION_GUARD_EXTENSION_ID = "gjhalpeeegljfdmfkoilmojkfehhpgbm";
var extensionFileNames = Object.freeze([
  "manifest.json",
  "rules.json",
  "readiness.js"
]);
var digestPattern = /^[a-f0-9]{64}$/u;
var unsignedIntegerPattern = /^\d{1,40}$/u;
var derivationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function derivationGuardControlSocketPath(derivationId) {
  if (!derivationIdPattern.test(derivationId)) {
    throw new Error("derivation proxy control identity is malformed");
  }
  const root = process.platform === "win32" ? tmpdir() : "/tmp";
  return join(root, `io-wrench-dp-${derivationId}.ctl`);
}
function exactKeys(record, expected) {
  const actual = Object.keys(record).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}
function parseGuardDirectoryIdentity(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !exactKeys(value, ["device", "inode"]))
    throw new Error("derivation network guard identity is malformed");
  const record = value;
  if (typeof record.device !== "string" || !unsignedIntegerPattern.test(record.device) || typeof record.inode !== "string" || !unsignedIntegerPattern.test(record.inode))
    throw new Error("derivation network guard identity is malformed");
  return { device: record.device, inode: record.inode };
}
function parseGuardFileEvidence(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !exactKeys(value, ["device", "inode", "byteLength", "sha256"]))
    throw new Error("derivation network guard file evidence is malformed");
  const record = value;
  const identity = parseGuardDirectoryIdentity({ device: record.device, inode: record.inode });
  if (!Number.isSafeInteger(record.byteLength) || record.byteLength < 1 || record.byteLength > 4 * 1024 * 1024 || typeof record.sha256 !== "string" || !digestPattern.test(record.sha256))
    throw new Error("derivation network guard file evidence is malformed");
  return {
    ...identity,
    byteLength: record.byteLength,
    sha256: record.sha256
  };
}
function parseOwner(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !exactKeys(value, ["pid", "bootId", "processStartId"]))
    throw new Error("derivation proxy owner is malformed");
  const record = value;
  if (!Number.isSafeInteger(record.pid) || record.pid < 1 || typeof record.bootId !== "string" || !digestPattern.test(record.bootId) || typeof record.processStartId !== "string" || !digestPattern.test(record.processStartId))
    throw new Error("derivation proxy owner is malformed");
  return {
    pid: record.pid,
    bootId: record.bootId,
    processStartId: record.processStartId
  };
}
function parseDerivationNetworkGuard(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !exactKeys(value, ["schemaVersion", "kind", "extension", "proxy"]))
    throw new Error("derivation network guard metadata is malformed");
  const record = value;
  if (record.schemaVersion !== 1 || record.kind !== "contained-mv3-dnr-proxy") {
    throw new Error("derivation network guard metadata is malformed");
  }
  if (typeof record.extension !== "object" || record.extension === null || Array.isArray(record.extension) || !exactKeys(record.extension, ["id", "directoryIdentity", "files"]))
    throw new Error("derivation network guard extension metadata is malformed");
  const extensionRecord = record.extension;
  if (extensionRecord.id !== DERIVATION_GUARD_EXTENSION_ID || typeof extensionRecord.files !== "object" || extensionRecord.files === null || Array.isArray(extensionRecord.files) || !exactKeys(extensionRecord.files, extensionFileNames))
    throw new Error("derivation network guard extension metadata is malformed");
  const fileRecord = extensionRecord.files;
  const files = Object.fromEntries(extensionFileNames.map((name) => [
    name,
    parseGuardFileEvidence(fileRecord[name])
  ]));
  if (typeof record.proxy !== "object" || record.proxy === null || Array.isArray(record.proxy) || !exactKeys(record.proxy, [
    "policySha256",
    "controlNonce",
    "port",
    "owner",
    "parentOwner",
    "configFile",
    "readyFile"
  ]))
    throw new Error("derivation network proxy metadata is malformed");
  const proxy = record.proxy;
  if (typeof proxy.policySha256 !== "string" || !digestPattern.test(proxy.policySha256) || typeof proxy.controlNonce !== "string" || !/^[a-f0-9]{64}$/u.test(proxy.controlNonce) || !Number.isSafeInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535)
    throw new Error("derivation network proxy metadata is malformed");
  return Object.freeze({
    schemaVersion: 1,
    kind: "contained-mv3-dnr-proxy",
    extension: Object.freeze({
      id: DERIVATION_GUARD_EXTENSION_ID,
      directoryIdentity: parseGuardDirectoryIdentity(extensionRecord.directoryIdentity),
      files: Object.freeze(files)
    }),
    proxy: Object.freeze({
      policySha256: proxy.policySha256,
      controlNonce: proxy.controlNonce,
      port: proxy.port,
      owner: parseOwner(proxy.owner),
      parentOwner: parseOwner(proxy.parentOwner),
      configFile: parseGuardFileEvidence(proxy.configFile),
      readyFile: parseGuardFileEvidence(proxy.readyFile)
    })
  });
}

// src/derivation-network-proxy.ts
import { isIP, connect as connectTcp } from "net";
import {
  isPrivateAddress,
  isPrivateHostname,
  resolveSafeNetworkTarget
} from "@hraness/wordcell/clip/network";
var MAX_BROWSER_DOMAINS = 100;
var DEFAULT_MAX_TRANSFERRED_BYTES = 1024 * 1024 * 1024;
function domainBase(domain) {
  return domain.startsWith("*.") ? domain.slice(2) : domain;
}
function browserDomainsCover(browserDomains, hostnameValue) {
  const hostname = hostnameValue.toLowerCase();
  if (hostname.endsWith("."))
    return false;
  return browserDomains.some((domain) => {
    if (domain === hostname)
      return true;
    if (!domain.startsWith("*."))
      return false;
    const base = domain.slice(2);
    return hostname === base || hostname.endsWith(`.${base}`);
  });
}
function validateDerivationBrowserDomains(values, targetHostname) {
  if (values.length < 1 || values.length > MAX_BROWSER_DOMAINS) {
    throw new Error("browser domains must contain 1-100 exact or wildcard hostnames");
  }
  const normalized = [];
  const seen = new Set;
  for (const value of values) {
    if (typeof value !== "string" || !/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/iu.test(value) || value.includes("..")) {
      throw new Error("browser domains must contain 1-100 exact or wildcard hostnames");
    }
    const domain = value.toLowerCase();
    const base = domainBase(domain);
    if (isPrivateHostname(base) || isIP(base) !== 0 && isPrivateAddress(base) || domain.startsWith("*.") && isIP(base) !== 0) {
      throw new Error("browser domains cannot contain private, local, reserved, or wildcard IP hosts");
    }
    if (!seen.has(domain)) {
      seen.add(domain);
      normalized.push(domain);
    }
  }
  if (!browserDomainsCover(normalized, targetHostname.toLowerCase())) {
    throw new Error("browser domains must cover the derivation target hostname");
  }
  return Object.freeze(normalized);
}

// src/har.ts
var MAX_HAR_BYTES = 128 * 1024 * 1024;
var MAX_SCAFFOLD_BYTES = 256 * 1024 * 1024;
var staticRouteSegments = new Set([
  "api",
  "graphql",
  "rest",
  "rpc",
  "voyager",
  "messaging",
  "messages",
  "conversation",
  "conversations",
  "inbox",
  "feed",
  "posts",
  "comments",
  "reactions",
  "search",
  "query",
  "mutation",
  "realtime",
  "presence",
  "status",
  "statuses",
  "notifications",
  "profile",
  "profiles",
  "users",
  "member",
  "members",
  "dash",
  "internal",
  "public",
  "private",
  "content",
  "read",
  "write",
  "send",
  "create",
  "update",
  "delete",
  "list",
  "detail",
  "details",
  "home",
  "in"
]);
var stableHeaderNames = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "content-length",
  "content-type",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "origin",
  "pragma",
  "range",
  "referer",
  "user-agent"
]);

// src/derive-fixtures.ts
var MAX_DERIVATION_FIXTURES = 20;
var MAX_DERIVATION_FIXTURE_BYTES = 50 * 1024 * 1024;
var MAX_DERIVATION_FIXTURE_TOTAL_BYTES = 200 * 1024 * 1024;
var sha256Pattern = /^[a-f0-9]{64}$/u;
var unsignedIntegerPattern2 = /^\d{1,40}$/u;
var mediaTypeExtensions = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "video/mp4": ".mp4"
};
function fixtureError(message) {
  return new Error(`derivation fixture ${message}`);
}
function fixedFileName(index, mediaType) {
  return `fixture-${String(index).padStart(2, "0")}${mediaTypeExtensions[mediaType]}`;
}
function isFixtureMediaType(value) {
  return Object.hasOwn(mediaTypeExtensions, value);
}
function exactKeys2(value, expected) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}
function parseDerivationFixtures(value) {
  if (value === undefined)
    return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_DERIVATION_FIXTURES) {
    throw fixtureError("metadata is malformed");
  }
  let totalBytes = 0;
  const fixtures = value.map((candidate, offset) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate) || !exactKeys2(candidate, [
      "reference",
      "fileName",
      "bytes",
      "mediaType",
      "sha256",
      "device",
      "inode"
    ]))
      throw fixtureError("metadata is malformed");
    const record = candidate;
    const index = offset + 1;
    if (record.reference !== `fixture:${index}` || typeof record.mediaType !== "string" || !isFixtureMediaType(record.mediaType) || record.fileName !== fixedFileName(index, record.mediaType) || typeof record.bytes !== "number" || !Number.isSafeInteger(record.bytes) || record.bytes < 1 || record.bytes > MAX_DERIVATION_FIXTURE_BYTES || typeof record.sha256 !== "string" || !sha256Pattern.test(record.sha256) || typeof record.device !== "string" || !unsignedIntegerPattern2.test(record.device) || typeof record.inode !== "string" || !unsignedIntegerPattern2.test(record.inode))
      throw fixtureError("metadata is malformed");
    totalBytes += record.bytes;
    if (totalBytes > MAX_DERIVATION_FIXTURE_TOTAL_BYTES) {
      throw fixtureError("metadata exceeds its aggregate byte bound");
    }
    return {
      reference: record.reference,
      fileName: record.fileName,
      bytes: record.bytes,
      mediaType: record.mediaType,
      sha256: record.sha256,
      device: record.device,
      inode: record.inode
    };
  });
  return Object.freeze(fixtures);
}

// src/derive.ts
var derivationReviewMarkerName = "review.json";
var derivationReadyMarkerName = "ready.json";
var derivationPhaseMarkerName = "phase.json";
var derivationInitializationMarkerName = "initializing.json";
var DERIVATION_LIFECYCLE_ORPHAN_GRACE_MS = 15 * 60000;
var deriveCommandHelperPath = join2(dirname2(fileURLToPath(import.meta.url)), "derive-command-helper.ts");
var profileCloneHelperPath = join2(dirname2(fileURLToPath(import.meta.url)), "profile-clone-helper.ts");
var trustedBunConfigPath = join2(dirname2(fileURLToPath(import.meta.url)), "state-helper.bunfig.toml");
var derivationDnrPolicyFileName = "network-readiness-policy.json";
var derivationDnrPolicyActions = Object.freeze([
  "launch",
  "cdp_url",
  "url"
]);
var derivationIdPattern2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function inspectDirectoryIdentity(path) {
  let identity;
  try {
    identity = assertOwnedPathSync2(path, { kind: "directory", exactMode: 448 });
  } catch (error) {
    if (hasErrorCode(error, "ENOENT"))
      throw error;
    throw new Error("derivation session directory is unsafe", { cause: error });
  }
  return { device: identity.dev.toString(), inode: identity.ino.toString() };
}
function parseDirectoryIdentity(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !hasExactKeys(value, ["device", "inode"]) || !("device" in value) || typeof value.device !== "string" || !/^\d{1,40}$/u.test(value.device) || !("inode" in value) || typeof value.inode !== "string" || !/^\d{1,40}$/u.test(value.inode))
    throw new Error("derivation directory identity is malformed");
  return { device: value.device, inode: value.inode };
}
function sameDirectoryIdentity(left, right) {
  return left.device === right.device && left.inode === right.inode;
}
var derivationConfirmedPolicyActions = Object.freeze([
  "click",
  "dblclick",
  "fill",
  "type",
  "hover",
  "focus",
  "press",
  "check",
  "uncheck",
  "select",
  "interact",
  "upload",
  "getbyrole",
  "getbytext",
  "getbylabel",
  "getbyplaceholder",
  "getbyalttext",
  "getbytitle",
  "getbytestid"
]);
var allowedBrowserCommands = new Set([
  "open",
  "back",
  "forward",
  "reload",
  "snapshot",
  "get",
  "network",
  "wait",
  "scroll",
  "scrollintoview",
  "find",
  "click",
  "dblclick",
  "focus",
  "fill",
  "cleartext",
  "type",
  "press",
  "hover",
  "check",
  "uncheck",
  "select",
  "close",
  "upload",
  "upload-and-seal",
  "choose-upload"
]);
var mutatingBrowserTokens = new Set(["click", "dblclick", "fill", "cleartext", "type", "press", "hover", "focus", "check", "uncheck", "select", "upload", "upload-and-seal", "choose-upload"]);
function derivationDirectory(id, environment) {
  if (!derivationIdPattern2.test(id))
    throw new Error("derivation ID is invalid");
  return join2(ghostgetStateHome(environment), "derivations", id);
}
function metadataPath(id, environment) {
  return join2(derivationDirectory(id, environment), "session.json");
}
function parseSession(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("derivation session is malformed");
  const record = value;
  const id = record.id;
  const adapterId = record.adapterId;
  const targetUrl = record.targetUrl;
  const targetOrigin = record.targetOrigin;
  const createdAt = record.createdAt;
  const sessionName = record.sessionName;
  const directory = record.directory;
  const directoryIdentity = parseDirectoryIdentity(record.directoryIdentity);
  const socketDirectory = record.socketDirectory;
  const socketIdentity = parseDirectoryIdentity(record.socketIdentity);
  const configPath = record.configPath;
  const policyPath = record.policyPath;
  const fixtures = parseDerivationFixtures(record.fixtures);
  const networkGuard = record.schemaVersion === 2 ? record.networkGuard === null ? null : parseDerivationNetworkGuard(record.networkGuard) : undefined;
  const expectedKeys = [
    "schemaVersion",
    "id",
    "adapterId",
    "targetUrl",
    "targetOrigin",
    "createdAt",
    "allowRemoteActions",
    "contentMode",
    "browserDomains",
    "headed",
    "sessionName",
    "directory",
    "directoryIdentity",
    "socketDirectory",
    "socketIdentity",
    "configPath",
    "policyPath",
    "profilePath",
    ...record.fixtures === undefined ? [] : ["fixtures"],
    ...record.schemaVersion === 2 ? ["networkGuard"] : [],
    ...record.browserExecutable === undefined ? [] : ["browserExecutable"]
  ].sort();
  const actualKeys = Object.keys(record).sort();
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2 || typeof id !== "string" || typeof adapterId !== "string" || typeof targetUrl !== "string" || typeof targetOrigin !== "string" || typeof createdAt !== "string" || typeof sessionName !== "string" || typeof directory !== "string" || typeof socketDirectory !== "string" || typeof configPath !== "string" || typeof policyPath !== "string" || !Array.isArray(record.browserDomains) || record.browserDomains.some((domain) => typeof domain !== "string") || actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("derivation session is malformed");
  }
  if (typeof record.allowRemoteActions !== "boolean" || typeof record.headed !== "boolean" || record.contentMode !== "none" && record.contentMode !== "text") {
    throw new Error("derivation session is malformed");
  }
  if (record.profilePath !== null && typeof record.profilePath !== "string")
    throw new Error("derivation session is malformed");
  if (record.schemaVersion === 2 && (record.profilePath === null && networkGuard === null || record.profilePath !== null && networkGuard !== null))
    throw new Error("derivation session network boundary is malformed");
  if (record.browserExecutable !== undefined && (typeof record.browserExecutable !== "string" || !isAbsolute(record.browserExecutable) || record.browserExecutable.length < 1 || record.browserExecutable.length > 4096 || record.browserExecutable.includes("\x00")))
    throw new Error("derivation session browser executable is malformed");
  if (!derivationIdPattern2.test(id) || !/^[a-z][a-z0-9-]{0,47}$/u.test(adapterId) || !Number.isFinite(Date.parse(createdAt)) || !/^io-derive-[a-f0-9]{12}$/u.test(sessionName))
    throw new Error("derivation session metadata is malformed");
  const parsedTarget = validateTarget(targetUrl);
  if (parsedTarget.origin !== targetOrigin)
    throw new Error("derivation target origin is malformed");
  const browserDomains = validateDerivationBrowserDomains(record.browserDomains.map((domain) => String(domain)), parsedTarget.hostname.toLowerCase());
  return {
    schemaVersion: record.schemaVersion,
    id,
    adapterId,
    targetUrl,
    targetOrigin,
    createdAt,
    allowRemoteActions: record.allowRemoteActions,
    contentMode: record.contentMode,
    browserDomains,
    fixtures,
    headed: record.headed,
    sessionName,
    directory,
    directoryIdentity,
    socketDirectory,
    socketIdentity,
    configPath,
    policyPath,
    profilePath: record.profilePath,
    ...record.schemaVersion === 2 ? { networkGuard: networkGuard ?? null } : {},
    ...typeof record.browserExecutable === "string" ? { browserExecutable: record.browserExecutable } : {}
  };
}
function expectedSocketDirectory(id) {
  const root = process.platform === "win32" ? tmpdir2() : "/tmp";
  return join2(root, `io-derive-ab-${id}`);
}
function parseDerivationDirectoryPhase(value, id, directoryIdentity) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("derivation directory phase marker is malformed");
  }
  const record = value;
  if (!hasExactKeys(record, ["derivationId", "directoryIdentity", "kind", "schemaVersion"]) || record.schemaVersion !== 1 || record.kind !== "io-derivation-directory-phase" || record.derivationId !== id)
    throw new Error("derivation directory phase marker is malformed");
  const recordedDirectoryIdentity = parseDirectoryIdentity(record.directoryIdentity);
  if (!sameDirectoryIdentity(recordedDirectoryIdentity, directoryIdentity)) {
    throw new Error("derivation directory phase marker does not match its directory");
  }
  return {
    schemaVersion: 1,
    kind: "io-derivation-directory-phase",
    derivationId: id,
    directoryIdentity: recordedDirectoryIdentity
  };
}
function readDerivationDirectoryPhase(id, directory, directoryIdentity, environment) {
  const entry = listPrivateStateDirectory(directory, environment, directoryIdentity).find((candidate) => candidate.name === derivationPhaseMarkerName);
  if (entry?.kind !== "file")
    throw new Error("derivation directory phase marker is unavailable or unsafe");
  let value;
  try {
    value = JSON.parse(readRegularFile(phaseMarkerPath(directory), 64 * 1024, "derivation directory phase marker", directoryIdentity));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("derivation directory phase marker is malformed", { cause: error });
    }
    throw error;
  }
  return parseDerivationDirectoryPhase(value, id, directoryIdentity);
}
function parseDerivationInitialization(value, id, directoryIdentity) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("derivation initialization marker is malformed");
  }
  const record = value;
  if (!hasExactKeys(record, ["derivationId", "directoryIdentity", "kind", "schemaVersion", "socketDirectory", "socketIdentity"]) || record.schemaVersion !== 1 || record.kind !== "io-derivation-initialization" || record.derivationId !== id || record.socketDirectory !== expectedSocketDirectory(id))
    throw new Error("derivation initialization marker is malformed");
  const recordedDirectoryIdentity = parseDirectoryIdentity(record.directoryIdentity);
  const socketIdentity = parseDirectoryIdentity(record.socketIdentity);
  if (!sameDirectoryIdentity(recordedDirectoryIdentity, directoryIdentity)) {
    throw new Error("derivation initialization marker does not match its directory");
  }
  return {
    schemaVersion: 1,
    kind: "io-derivation-initialization",
    derivationId: id,
    directoryIdentity: recordedDirectoryIdentity,
    socketDirectory: record.socketDirectory,
    socketIdentity
  };
}
function readDerivationInitialization(id, directory, directoryIdentity, environment) {
  const entry = listPrivateStateDirectory(directory, environment, directoryIdentity).find((candidate) => candidate.name === derivationInitializationMarkerName);
  if (entry?.kind !== "file")
    throw new Error("derivation initialization marker is unavailable or unsafe");
  let value;
  try {
    value = JSON.parse(readRegularFile(initializationMarkerPath(directory), 64 * 1024, "derivation initialization marker", directoryIdentity));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("derivation initialization marker is malformed", { cause: error });
    }
    throw error;
  }
  return parseDerivationInitialization(value, id, directoryIdentity);
}
function hasErrorCode(error, code) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
function inspectPrivateFile(path, maximumBytes, label) {
  let identity;
  try {
    identity = assertOwnedPathSync2(path, {
      kind: "file",
      ownerOnly: true,
      minimumBytes: 1n,
      maximumBytes: BigInt(maximumBytes)
    });
  } catch (error) {
    throw new Error(`${label} is unavailable or unsafe`, { cause: error });
  }
  return {
    device: identity.dev.toString(),
    inode: identity.ino.toString(),
    byteLength: identity.size
  };
}
function samePrivateFile(left, right) {
  return left.device === right.device && left.inode === right.inode && left.byteLength === right.byteLength;
}
function readStablePrivateFileEvidence(path, maximumBytes, label, parentIdentity) {
  const before = inspectPrivateFile(path, maximumBytes, label);
  const text = readRegularFile(path, maximumBytes, label, parentIdentity);
  const after = inspectPrivateFile(path, maximumBytes, label);
  if (!samePrivateFile(before, after) || Buffer.byteLength(text, "utf8") !== before.byteLength) {
    throw new Error(`${label} changed while it was being read`);
  }
  return { text, evidence: { ...before, sha256: sha256(text) } };
}
function readyMarkerPath(session) {
  return join2(session.directory, derivationReadyMarkerName);
}
function initializationMarkerPath(directory) {
  return join2(directory, derivationInitializationMarkerName);
}
function phaseMarkerPath(directory) {
  return join2(directory, derivationPhaseMarkerName);
}
function parseReadyDerivation(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("derivation ready marker is malformed");
  }
  const record = value;
  const metadata = record.metadata;
  if (!hasExactKeys(record, ["metadata", "schemaVersion", "state"]) || record.schemaVersion !== 1 || record.state !== "ready" || typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
    throw new Error("derivation ready marker is malformed");
  const evidence = metadata;
  if (!hasExactKeys(evidence, ["byteLength", "device", "inode", "sha256"]) || typeof evidence.device !== "string" || !/^\d{1,40}$/u.test(evidence.device) || typeof evidence.inode !== "string" || !/^\d{1,40}$/u.test(evidence.inode) || !Number.isSafeInteger(evidence.byteLength) || evidence.byteLength < 1 || evidence.byteLength > 64 * 1024 || typeof evidence.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(evidence.sha256))
    throw new Error("derivation ready marker is malformed");
  return {
    schemaVersion: 1,
    state: "ready",
    metadata: {
      device: evidence.device,
      inode: evidence.inode,
      byteLength: evidence.byteLength,
      sha256: evidence.sha256
    }
  };
}
function readDerivationReady(session, metadataEvidence, environment) {
  const entry = sessionEntry(session, derivationReadyMarkerName, environment);
  if (entry === undefined)
    return false;
  if (entry.kind !== "file")
    throw new Error("derivation ready marker is not a regular file");
  const text = readRegularFile(readyMarkerPath(session), 64 * 1024, "derivation ready marker", session.directoryIdentity);
  let marker;
  try {
    marker = parseReadyDerivation(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("derivation ready marker is malformed", { cause: error });
    throw error;
  }
  if (!samePrivateFile(marker.metadata, metadataEvidence) || marker.metadata.sha256 !== metadataEvidence.sha256)
    throw new Error("derivation ready marker does not match its final session metadata");
  const currentMetadata = inspectPrivateFile(metadataPath(session.id, environment), 64 * 1024, "derivation session metadata");
  if (!samePrivateFile(currentMetadata, metadataEvidence)) {
    throw new Error("derivation session metadata changed after readiness was checked");
  }
  return true;
}
function inspectSessionSocket(session, policy) {
  let identity;
  try {
    identity = inspectDirectoryIdentity(session.socketDirectory);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      if (policy === "allow-missing")
        return false;
      throw new Error("derivation socket directory is unavailable; only list or discard can recover this session", { cause: error });
    }
    throw error;
  }
  if (!sameDirectoryIdentity(identity, session.socketIdentity)) {
    throw new Error("derivation socket directory changed identity");
  }
  return true;
}
function loadSessionWithSocketPolicy(id, environment, socketPolicy, readyPolicy = "required") {
  const directory = derivationDirectory(id, environment);
  const directoryIdentity = inspectDirectoryIdentity(directory);
  const metadata = readStablePrivateFileEvidence(metadataPath(id, environment), 64 * 1024, "derivation session metadata", directoryIdentity);
  let metadataValue;
  try {
    metadataValue = JSON.parse(metadata.text);
  } catch (error) {
    throw new Error("derivation session metadata is malformed", { cause: error });
  }
  const session = parseSession(metadataValue);
  const expectedProfiles = new Set([join2(directory, "profile"), join2(directory, "profile-user-data")]);
  const namedProfile = session.profilePath !== null && isSafeNamedProfile(session.profilePath);
  if (session.id !== id || session.directory !== directory || session.socketDirectory !== expectedSocketDirectory(id) || session.configPath !== join2(directory, "agent-browser.json") || session.policyPath !== join2(directory, "action-policy.json") || session.profilePath !== null && !expectedProfiles.has(session.profilePath) && !namedProfile) {
    throw new Error("derivation session paths do not match its ID");
  }
  if (!sameDirectoryIdentity(directoryIdentity, session.directoryIdentity)) {
    throw new Error("derivation session directory changed identity");
  }
  const ready = readDerivationReady(session, metadata.evidence, environment);
  if (!ready && readyPolicy === "required") {
    throw new Error("derivation is not ready; only list or discard can recover this interrupted session");
  }
  if (ready) {
    const phase = readDerivationDirectoryPhase(id, directory, directoryIdentity, environment);
    const initialization = readDerivationInitialization(id, directory, directoryIdentity, environment);
    if (!sameDirectoryIdentity(phase.directoryIdentity, session.directoryIdentity) || !sameDirectoryIdentity(initialization.directoryIdentity, session.directoryIdentity) || !sameDirectoryIdentity(initialization.socketIdentity, session.socketIdentity) || initialization.socketDirectory !== session.socketDirectory)
      throw new Error("ready derivation does not match its initialization boundary");
  }
  const socketAvailable = inspectSessionSocket(session, socketPolicy);
  readRegularFile(session.configPath, 64 * 1024, "derivation browser config", session.directoryIdentity);
  readRegularFile(session.policyPath, 64 * 1024, "derivation action policy", session.directoryIdentity);
  if (session.profilePath === null && session.schemaVersion === 2) {
    readRegularFile(join2(session.directory, derivationDnrPolicyFileName), 64 * 1024, "derivation DNR readiness policy", session.directoryIdentity);
  }
  return { session, socketAvailable, ready, metadataEvidence: metadata.evidence };
}
function reviewMarkerPath(session) {
  return join2(session.directory, derivationReviewMarkerName);
}
function sessionEntry(session, name, environment) {
  return listPrivateStateDirectory(session.directory, environment, session.directoryIdentity).find((candidate) => candidate.name === name);
}
function parseSealedDerivationReview(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("derivation review seal is malformed");
  }
  const record = value;
  const har = record.har;
  if (!hasExactKeys(record, ["har", "schemaVersion", "state"]) || record.schemaVersion !== 1 || record.state !== "sealed" || typeof har !== "object" || har === null || Array.isArray(har))
    throw new Error("derivation review seal is malformed");
  const harRecord = har;
  if (!hasExactKeys(harRecord, ["byteLength", "device", "inode", "sha256"]) || typeof harRecord.device !== "string" || !/^\d{1,40}$/u.test(harRecord.device) || typeof harRecord.inode !== "string" || !/^\d{1,40}$/u.test(harRecord.inode) || !Number.isSafeInteger(harRecord.byteLength) || harRecord.byteLength < 1 || harRecord.byteLength > MAX_HAR_BYTES || typeof harRecord.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(harRecord.sha256))
    throw new Error("derivation review seal is malformed");
  return {
    schemaVersion: 1,
    state: "sealed",
    har: {
      device: harRecord.device,
      inode: harRecord.inode,
      byteLength: harRecord.byteLength,
      sha256: harRecord.sha256
    }
  };
}
function readReviewSeal(session, environment) {
  const marker = sessionEntry(session, derivationReviewMarkerName, environment);
  if (marker === undefined)
    return null;
  if (marker.kind !== "file")
    throw new Error("derivation review seal is not a regular file");
  let value;
  try {
    value = JSON.parse(readRegularFile(reviewMarkerPath(session), 64 * 1024, "derivation review seal", session.directoryIdentity));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("derivation review seal is malformed", { cause: error });
    throw error;
  }
  return parseSealedDerivationReview(value);
}
function listDerivations(environment = process.env) {
  const directory = join2(ghostgetStateHome(environment), "derivations");
  return listPrivateStateDirectory(directory, environment).filter((entry) => entry.kind === "directory" && derivationIdPattern2.test(entry.name)).map((entry) => {
    try {
      const loaded = loadSessionWithSocketPolicy(entry.name, environment, "allow-missing", "allow-missing");
      const { session } = loaded;
      const hasBoundControlOwner = session.profilePath === null && session.schemaVersion === 2 && session.networkGuard != null;
      if (!hasBoundControlOwner && !derivationControlEndpointIsAbsent(entry.name)) {
        return { id: entry.name, invalid: true };
      }
      return {
        id: session.id,
        adapterId: session.adapterId,
        targetOrigin: session.targetOrigin,
        createdAt: session.createdAt,
        allowRemoteActions: session.allowRemoteActions,
        contentMode: session.contentMode,
        headed: session.headed,
        browserDomains: session.browserDomains,
        rawHarPresent: listPrivateStateDirectory(session.directory, environment, session.directoryIdentity).some((candidate) => candidate.kind === "file" && candidate.name === "capture.har"),
        reviewSealed: readReviewSeal(session, environment) !== null,
        socketAvailable: loaded.socketAvailable,
        ready: loaded.ready,
        ...!loaded.ready ? { recoverable: true } : {}
      };
    } catch {
      try {
        if (entry.identity === undefined)
          throw new Error("derivation directory identity is unavailable");
        const sessionDirectory = join2(directory, entry.name);
        const entries = listPrivateStateDirectory(sessionDirectory, environment, entry.identity);
        const readyEntry = entries.find((candidate) => candidate.name === derivationReadyMarkerName);
        if (readyEntry !== undefined)
          throw new Error("ready derivation is malformed");
        const initializationEntry = entries.find((candidate) => candidate.name === derivationInitializationMarkerName);
        if (initializationEntry !== undefined) {
          const initialization = readDerivationInitialization(entry.name, sessionDirectory, entry.identity, environment);
          assertNoUnboundDerivationControl(entry.name);
          return {
            id: entry.name,
            ready: false,
            recoverable: true,
            socketAvailable: inspectInitializationSocket(initialization)
          };
        }
        const phaseEntry = entries.find((candidate) => candidate.name === derivationPhaseMarkerName);
        if (phaseEntry === undefined) {
          if (entries.length !== 0 || inspectUnknownInitializationSocket(entry.name) || !derivationControlEndpointIsAbsent(entry.name)) {
            throw new Error("markerless derivation state is not safely recoverable");
          }
          return {
            id: entry.name,
            ready: false,
            recoverable: true,
            socketAvailable: false
          };
        }
        readDerivationDirectoryPhase(entry.name, sessionDirectory, entry.identity, environment);
        assertNoUnboundDerivationControl(entry.name);
        return {
          id: entry.name,
          ready: false,
          recoverable: true,
          socketAvailable: inspectUnknownInitializationSocket(entry.name)
        };
      } catch {
        return { id: entry.name, invalid: true };
      }
    }
  });
}
var maximumU64 = (1n << 64n) - 1n;
function inspectInitializationSocket(initialization) {
  try {
    const actualSocketIdentity = inspectDirectoryIdentity(initialization.socketDirectory);
    if (!sameDirectoryIdentity(actualSocketIdentity, initialization.socketIdentity)) {
      throw new Error("derivation socket directory changed identity");
    }
    return true;
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT"))
      throw error;
    return false;
  }
}
function inspectUnknownInitializationSocket(id) {
  const socketDirectory = expectedSocketDirectory(id);
  try {
    inspectDirectoryIdentity(socketDirectory);
    return true;
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT"))
      throw error;
    return false;
  }
}
function derivationControlEndpointIsAbsent(id) {
  try {
    lstatSync(derivationGuardControlSocketPath(id));
    return false;
  } catch (error) {
    if (!hasErrorCode(error, "ENOENT"))
      throw error;
    return true;
  }
}
function assertNoUnboundDerivationControl(id) {
  if (!derivationControlEndpointIsAbsent(id)) {
    throw new Error(`derivation ${id} has an unbound network control endpoint; its private state was preserved`);
  }
}
function validateTarget(value) {
  if (value.length > 64 * 1024)
    throw new Error("target URL is too long");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("derivation target must be HTTPS and contain no embedded credentials");
  }
  if (isPrivateHostname2(url.hostname) || isIP2(url.hostname) !== 0 && isPrivateAddress2(url.hostname)) {
    throw new Error("derivation target cannot use a private network host");
  }
  return url;
}

// src/web-session-cookies.ts
var MAX_CHROMIUM_COOKIE_DB_BYTES = 256 * 1024 * 1024;
var MAX_CHROMIUM_COOKIE_SIDECAR_BYTES = 128 * 1024 * 1024;
var CHROMIUM_EPOCH_OFFSET_MICROSECONDS = 11644473600000000n;
var MICROSECONDS_PER_SECOND = 1000000n;
var UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
var MOCK_KEYCHAIN_KEY = pbkdf2Sync("mock_password", "saltysalt", 1003, 16, "sha1");
var DERIVATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function ownedByCurrentUser(uid) {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return currentUid === undefined || uid === BigInt(currentUid);
}
function inspectPrivateRegularFile(path, maximumBytes, label) {
  let stats;
  try {
    stats = lstatSync2(path, { bigint: true });
  } catch (error) {
    throw new Error(`${label} is unavailable`, { cause: error });
  }
  if (!stats.isFile() || stats.isSymbolicLink() || !ownedByCurrentUser(stats.uid) || (stats.mode & 0o077n) !== 0n || stats.size < 1n || stats.size > BigInt(maximumBytes) || realpathSync2(path) !== path)
    throw new Error(`${label} is unsafe`);
  return {
    device: stats.dev.toString(),
    inode: stats.ino.toString(),
    byteLength: stats.size,
    modifiedAtNanoseconds: stats.mtimeNs
  };
}
function sameFileIdentity(left, right) {
  return left.device === right.device && left.inode === right.inode && left.byteLength === right.byteLength && left.modifiedAtNanoseconds === right.modifiedAtNanoseconds;
}
function inspectPrivateDirectory(path, label) {
  let stats;
  try {
    stats = lstatSync2(path, { bigint: true });
  } catch (error) {
    throw new Error(`${label} is unavailable`, { cause: error });
  }
  if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats.uid) || (stats.mode & 0o777n) !== 0o700n || realpathSync2(path) !== path)
    throw new Error(`${label} is unsafe`);
}
function managedDerivationChromiumCookieDatabase(browserProfile, cookieProfile) {
  if (!isAbsolute2(browserProfile) || cookieProfile === undefined || !isAbsolute2(cookieProfile)) {
    return null;
  }
  const profile = resolve(browserProfile);
  if (basename3(profile) !== "profile")
    return null;
  const directory = dirname3(profile);
  const id = basename3(directory);
  const derivationsDirectory = dirname3(directory);
  if (!DERIVATION_ID_PATTERN.test(id) || basename3(derivationsDirectory) !== "derivations" || resolve(cookieProfile) !== join3(profile, "Default"))
    return null;
  const sessionPath = join3(directory, "session.json");
  const before = inspectPrivateRegularFile(sessionPath, 64 * 1024, "managed Chromium derivation metadata");
  const summaries = listDerivations({
    GHOSTGET_STATE_HOME: dirname3(derivationsDirectory)
  });
  const summary = summaries.find((candidate) => candidate.id === id);
  if (summary === undefined || summary.invalid === true || summary.ready !== true) {
    throw new Error("managed Chromium profile is not bound to one ready Ghostget derivation");
  }
  let metadata;
  try {
    metadata = JSON.parse(readFileSync2(sessionPath, "utf8"));
  } catch (error) {
    throw new Error("managed Chromium derivation metadata is malformed", { cause: error });
  }
  const after = inspectPrivateRegularFile(sessionPath, 64 * 1024, "managed Chromium derivation metadata");
  if (!sameFileIdentity(before, after)) {
    throw new Error("managed Chromium derivation metadata changed during validation");
  }
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata) || metadata.id !== id || metadata.directory !== directory || metadata.profilePath !== profile)
    throw new Error("managed Chromium profile does not match its derivation metadata");
  inspectPrivateDirectory(profile, "managed Chromium profile");
  inspectPrivateDirectory(join3(profile, "Default"), "managed Chromium Default profile");
  return join3(profile, "Default", "Cookies");
}
function snapshotPrivateRegularFile(source, target, maximumBytes, label, optional = false) {
  if (optional && !existsSync2(source))
    return;
  const before = inspectPrivateRegularFile(source, maximumBytes, label);
  try {
    copyFileSync(source, target);
  } catch (error) {
    throw new Error(`${label} could not be snapshotted`, { cause: error });
  }
  const after = inspectPrivateRegularFile(source, maximumBytes, label);
  if (!sameFileIdentity(before, after)) {
    throw new Error(`${label} changed while it was being snapshotted`);
  }
}
function chromiumHostCandidates(hostname) {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length < 2)
    return [hostname.toLowerCase()];
  const candidates = new Set([parts.join(".")]);
  for (let index = 0;index <= parts.length - 2; index += 1) {
    candidates.add(`.${parts.slice(index).join(".")}`);
  }
  return [...candidates];
}
function booleanColumn(value) {
  if (value === true || value === 1 || value === 1n || value === "1")
    return true;
  if (value === false || value === 0 || value === 0n || value === "0")
    return false;
  return null;
}
function integerColumn(value) {
  if (typeof value === "number" && Number.isSafeInteger(value))
    return value;
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  if (typeof value === "string" && /^-?[0-9]+$/u.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}
function parseChromiumCookieRow(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const row = value;
  const secure = booleanColumn(row.is_secure);
  const httpOnly = booleanColumn(row.is_httponly);
  const hasCrossSiteAncestor = booleanColumn(row.has_cross_site_ancestor);
  const sameSite = integerColumn(row.samesite);
  if (typeof row.name !== "string" || typeof row.value !== "string" || typeof row.host_key !== "string" || typeof row.path !== "string" || typeof row.expires_utc !== "string" || !(row.encrypted_value instanceof Uint8Array) || typeof row.top_frame_site_key !== "string" || secure === null || httpOnly === null || hasCrossSiteAncestor === null || sameSite === null)
    return null;
  return {
    name: row.name,
    value: row.value,
    hostKey: row.host_key,
    path: row.path,
    expiresUtc: row.expires_utc,
    sameSite,
    encryptedValue: row.encrypted_value,
    secure,
    httpOnly,
    topFrameSiteKey: row.top_frame_site_key,
    hasCrossSiteAncestor
  };
}
function removePkcs7Padding(value) {
  if (value.length === 0)
    return null;
  const padding = value[value.length - 1] ?? 0;
  if (padding < 1 || padding > 16 || padding > value.length)
    return null;
  for (let index = value.length - padding;index < value.length; index += 1) {
    if (value[index] !== padding)
      return null;
  }
  return value.subarray(0, value.length - padding);
}
function decryptMockKeychainCookie(encryptedValue, hostKey, requireHostHash) {
  const bytes = Buffer.from(encryptedValue);
  if (bytes.length < 19)
    return null;
  const prefix = bytes.subarray(0, 3).toString("ascii");
  if (prefix !== "v10" && prefix !== "v11")
    return null;
  try {
    const decipher = createDecipheriv("aes-128-cbc", MOCK_KEYCHAIN_KEY, Buffer.alloc(16, 32));
    decipher.setAutoPadding(false);
    const padded = Buffer.concat([
      decipher.update(bytes.subarray(3)),
      decipher.final()
    ]);
    const plaintext = removePkcs7Padding(padded);
    if (plaintext === null)
      return null;
    let value = plaintext;
    if (requireHostHash) {
      if (plaintext.length < 32)
        return null;
      const expected = createHash("sha256").update(hostKey, "utf8").digest();
      if (!timingSafeEqual(plaintext.subarray(0, 32), expected))
        return null;
      value = plaintext.subarray(32);
    }
    return UTF8_DECODER.decode(value);
  } catch {
    return null;
  }
}
function chromiumExpiry(value) {
  if (!/^[0-9]+$/u.test(value))
    return null;
  const microseconds = BigInt(value);
  if (microseconds === 0n)
    return 0;
  if (microseconds <= CHROMIUM_EPOCH_OFFSET_MICROSECONDS)
    return null;
  const seconds = (microseconds - CHROMIUM_EPOCH_OFFSET_MICROSECONDS) / MICROSECONDS_PER_SECOND;
  const parsed = Number(seconds);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function chromiumSameSite(value) {
  if (value === 2)
    return "Strict";
  if (value === 1)
    return "Lax";
  if (value === 0)
    return "None";
  return null;
}
async function readManagedChromiumCookies(databasePath, target) {
  const snapshotDirectory = mkdtempSync(join3(tmpdir3(), "wrench-managed-chromium-"));
  const snapshotPath = join3(snapshotDirectory, "Cookies");
  try {
    snapshotPrivateRegularFile(databasePath, snapshotPath, MAX_CHROMIUM_COOKIE_DB_BYTES, "managed Chromium cookie database");
    snapshotPrivateRegularFile(`${databasePath}-wal`, `${snapshotPath}-wal`, MAX_CHROMIUM_COOKIE_SIDECAR_BYTES, "managed Chromium cookie WAL", true);
    snapshotPrivateRegularFile(`${databasePath}-shm`, `${snapshotPath}-shm`, MAX_CHROMIUM_COOKIE_SIDECAR_BYTES, "managed Chromium cookie shared-memory file", true);
    const { Database } = await import("bun:sqlite");
    const database = new Database(snapshotPath, { readonly: true });
    try {
      const meta = database.query("SELECT value FROM meta WHERE key = ? LIMIT 1").get("version");
      const metaVersion = typeof meta === "object" && meta !== null ? integerColumn(meta.value) : null;
      if (metaVersion === null)
        throw new Error("managed Chromium cookie database has no valid schema version");
      const hostCandidates = chromiumHostCandidates(target.hostname);
      const placeholders = hostCandidates.map(() => "?").join(", ");
      const rows = database.query(`SELECT name, value, host_key, path, CAST(expires_utc AS TEXT) AS expires_utc, samesite, encrypted_value, is_secure, is_httponly, top_frame_site_key, has_cross_site_ancestor FROM cookies WHERE host_key IN (${placeholders}) ORDER BY expires_utc DESC LIMIT ?`).all(...hostCandidates, MAX_COOKIE_RECORDS + 1);
      if (rows.length > MAX_COOKIE_RECORDS) {
        throw new Error("managed Chromium cookie selection exceeded its record bound");
      }
      let malformed = 0;
      let partitioned = 0;
      const candidates = new Map;
      for (const value of rows) {
        const row = parseChromiumCookieRow(value);
        if (row === null) {
          malformed += 1;
          continue;
        }
        if (row.topFrameSiteKey.trim() !== "") {
          partitioned += 1;
          continue;
        }
        const cookieValue = row.value.length > 0 ? row.value : decryptMockKeychainCookie(row.encryptedValue, row.hostKey, metaVersion >= 24);
        const expires = chromiumExpiry(row.expiresUtc);
        if (cookieValue === null || expires === null) {
          malformed += 1;
          continue;
        }
        const hostOnly = !row.hostKey.startsWith(".");
        const domain = hostOnly ? row.hostKey : row.hostKey.slice(1);
        const key = `${domain}\x00${hostOnly ? "host" : "domain"}\x00${row.path || "/"}\x00${row.name}`;
        if (candidates.has(key))
          continue;
        candidates.set(key, {
          name: row.name,
          value: cookieValue,
          domain,
          hostOnly,
          path: row.path || "/",
          secure: row.secure,
          httpOnly: row.httpOnly,
          sameSite: chromiumSameSite(row.sameSite),
          expires,
          top_frame_site_key: "",
          has_cross_site_ancestor: false
        });
      }
      const filtered = filterCookies([...candidates.values()], target);
      const rejected = malformed + filtered.rejected;
      if (filtered.cookies.length === 0) {
        throw new Error(rejected === 0 ? "no matching cookies were found in the managed Chromium profile" : "the managed Chromium profile contained no usable origin-scoped cookies");
      }
      const warnings = [];
      if (rejected > 0)
        warnings.push(`Ignored ${rejected} malformed, expired, or out-of-scope managed Chromium cookie record(s).`);
      if (partitioned > 0)
        warnings.push(`Excluded ${partitioned} partitioned managed Chromium cookie record(s).`);
      return { cookies: filtered.cookies, warnings };
    } finally {
      database.close();
    }
  } finally {
    rmSync(snapshotDirectory, { recursive: true, force: true });
  }
}
function webSessionCookieSelection(auth, timeoutMs) {
  if (auth.kind === "cookie-source") {
    return {
      cookieSources: [auth.source],
      cookiesFile: undefined,
      cookieProfile: auth.profile,
      timeoutMs,
      requireExplicitCookieScope: true
    };
  }
  if (auth.kind === "cookies-file") {
    return {
      cookieSources: [],
      cookiesFile: auth.path,
      cookieProfile: undefined,
      timeoutMs,
      requireExplicitCookieScope: true
    };
  }
  if (auth.kind === "browser-profile" && auth.cookieSource !== undefined) {
    return {
      cookieSources: [auth.cookieSource],
      cookiesFile: undefined,
      cookieProfile: auth.cookieProfile,
      timeoutMs,
      requireExplicitCookieScope: true
    };
  }
  if (auth.kind === "browser-profile") {
    throw new Error("authenticated web API execution requires the browser auth locator to name a cookie source");
  }
  throw new Error("authenticated web API execution requires browser-session or cookie auth");
}
async function acquireWebSessionCookieRecords(auth, target, timeoutMs, reader = acquireCookieRecords) {
  if (auth.kind === "browser-profile" && auth.cookieSource === "chrome") {
    const databasePath = managedDerivationChromiumCookieDatabase(auth.profile, auth.cookieProfile);
    if (databasePath !== null) {
      return readManagedChromiumCookies(databasePath, target);
    }
  }
  return reader(webSessionCookieSelection(auth, timeoutMs), target);
}
export {
  webSessionCookieSelection,
  acquireWebSessionCookieRecords
};
