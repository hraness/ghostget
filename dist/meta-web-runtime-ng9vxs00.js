// @bun
import {
  META_RELAY_ORIGINS,
  META_WEB_OPERATIONS,
  META_WEB_OPERATION_NAMES,
  META_WEB_SITES,
  ThreadsAuthRepairRequiredError,
  assertMetaCometReadActor,
  assertMetaPaginationCursorBinding,
  assertMetaRelayResponseBinding,
  bindMetaAccessContext,
  bindMetaPaginationCursor,
  bootstrapMetaComet,
  buildMetaRelayRequest,
  consumeMetaCometRequestProof,
  defineMetaOperationDescriptor,
  extractMetaRelayBundleUrls,
  isCanonicalMetaNumericId,
  isReviewedFacebookGroupRelayResultEnvelope,
  materializeMetaCometRequestProof,
  metaOperationDescriptorKey,
  normalizeFacebookFeedHtml,
  normalizeFacebookMarketplaceFeedHtml,
  normalizeFacebookMarketplaceFeedJsonDocuments,
  normalizeFacebookMarketplaceListingHtml,
  normalizeInstagramComments,
  normalizeInstagramContacts,
  normalizeInstagramFeed,
  normalizeInstagramInbox,
  normalizeInstagramPost,
  normalizeInstagramProfileStats,
  normalizeThreadsFeedHtml,
  normalizeThreadsPostHtml,
  normalizeThreadsProfileStats,
  normalizeThreadsRecentViewsAvailability,
  normalizeThreadsVideoPostHtml,
  parseFacebookViewerId,
  parseInstagramViewerId,
  parseMetaJsonDocuments,
  parseMetaJsonScripts,
  parseThreadsViewerId,
  projectThreadsPublishVideo,
  resolveMetaOperationDescriptor,
  resolveMetaRelayOperationRevision
} from "./index-wq0wgv6q.js";
import"./index-81sjy26h.js";
import"./index-f30rdtbs.js";
import {
  isoBmffMp4VideoMetadata,
  isoBmffVideoDimensions
} from "./index-kqaaw64h.js";
import {
  PreservedBrowserArtifactsError,
  browserCleanupBarrier,
  browserResultData,
  createBrowserSession,
  isSafeNamedProfile,
  runCommand
} from "./index-d5mavmrj.js";
import {
  createWebSessionClient,
  fetchPublicWebAsset,
  webSessionAuthSubject,
  webSessionCookie
} from "./index-wn3s7nnj.js";
import {
  createPrivateJsonIfAbsent,
  ghostgetStateHome,
  listPrivateStateDirectory,
  readRegularFile
} from "./index-0ywm1fj9.js";
import"./index-4bpemvnc.js";
import {
  ProviderReadResponseRejectedError,
  ProviderReadTransportError,
  failedProviderRead
} from "./index-4smh9n9x.js";
import"./index-j3ysa35f.js";
import {
  startWebSessionCleanupTrackedOperation
} from "./index-aka7rgdj.js";
import {
  OperationDeadlineError
} from "./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import"./index-26yq8q16.js";
import {
  canonicalJson,
  jsonScriptLiteral,
  sha256
} from "./index-8sbt8qwx.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/providers/meta-web-runtime.ts
import { constants as constants3 } from "fs";
import { open as open2 } from "fs/promises";
import { acquireCookieRecords as acquireCookieRecords3 } from "@hraness/kb/clip/acquire";

// src/cursor-token.ts
import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from "crypto";
import { join } from "path";
var TOKEN_VERSION = "smn1";
var TOKEN_PREFIX = `${TOKEN_VERSION}.`;
var KEY_FILE_NAME = ".cursor-encryption-key";
var KEY_BYTES = 32;
var IV_BYTES = 12;
var AUTH_TAG_BYTES = 16;
var MAX_KEY_FILE_BYTES = 128;
var MAX_TOKEN_CHARACTERS = 8192;
var MAX_ENVELOPE_BYTES = Math.floor((MAX_TOKEN_CHARACTERS - TOKEN_PREFIX.length) * 3 / 4);
var MAX_PLAINTEXT_BYTES = MAX_ENVELOPE_BYTES - IV_BYTES - AUTH_TAG_BYTES;
function invalidToken(message) {
  return new Error(`cursor token ${message}`);
}
function validateCoordinates(scope, authId, authHash) {
  if (typeof scope !== "string" || !/^[a-z][a-z0-9-]{0,47}$/u.test(scope)) {
    throw new Error("cursor-token scope must be lowercase kebab-case");
  }
  if (typeof authId !== "string" || !/^[a-z][a-z0-9-]{0,47}$/u.test(authId)) {
    throw new Error("cursor-token auth ID must be lowercase kebab-case");
  }
  if (typeof authHash !== "string" || !/^[a-f0-9]{64}$/u.test(authHash)) {
    throw new Error("cursor-token auth hash is malformed");
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keyPath(environment) {
  return join(ghostgetStateHome(environment), KEY_FILE_NAME);
}
function cursorEncryptionKey(environment, createIfMissing) {
  const path = keyPath(environment);
  if (createIfMissing) {
    createPrivateJsonIfAbsent(path, {
      schemaVersion: 1,
      key: randomBytes(KEY_BYTES).toString("hex")
    }, {
      environment,
      privateParent: true
    });
  }
  const text = readRegularFile(path, MAX_KEY_FILE_BYTES, "cursor encryption key");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("cursor encryption key is malformed");
  }
  if (!isRecord(parsed) || Object.keys(parsed).sort().join(",") !== "key,schemaVersion" || parsed.schemaVersion !== 1 || typeof parsed.key !== "string" || !/^[a-f0-9]{64}$/u.test(parsed.key)) {
    throw new Error("cursor encryption key is malformed");
  }
  return Buffer.from(parsed.key, "hex");
}
function additionalData(scope, authId, authHash) {
  return Buffer.from(`io-cursor-token\x00${TOKEN_VERSION}\x00${scope}\x00${authId}\x00${authHash}`, "utf8");
}
function canonicalPayload(payload) {
  let encoded;
  try {
    encoded = canonicalJson(payload);
  } catch {
    throw new Error("cursor-token payload must be JSON-compatible");
  }
  const bytes = Buffer.from(encoded, "utf8");
  if (bytes.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error("cursor-token payload exceeds its size bound");
  }
  return bytes;
}
function decodeEnvelope(token) {
  if (typeof token !== "string" || token.length > MAX_TOKEN_CHARACTERS || !token.startsWith(TOKEN_PREFIX)) {
    throw invalidToken("is malformed");
  }
  const encoded = token.slice(TOKEN_PREFIX.length);
  if (encoded === "" || /[^A-Za-z0-9_-]/u.test(encoded)) {
    throw invalidToken("is malformed");
  }
  let envelope;
  try {
    envelope = Buffer.from(encoded, "base64url");
  } catch {
    throw invalidToken("is malformed");
  }
  if (envelope.toString("base64url") !== encoded || envelope.byteLength <= IV_BYTES + AUTH_TAG_BYTES || envelope.byteLength > MAX_ENVELOPE_BYTES) {
    throw invalidToken("is malformed");
  }
  return {
    iv: envelope.subarray(0, IV_BYTES),
    ciphertext: envelope.subarray(IV_BYTES, -AUTH_TAG_BYTES),
    tag: envelope.subarray(-AUTH_TAG_BYTES)
  };
}
function sealCursorToken(scope, authId, authHash, payload, environment = process.env) {
  validateCoordinates(scope, authId, authHash);
  const plaintext = canonicalPayload(payload);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", cursorEncryptionKey(environment, true), iv);
  cipher.setAAD(additionalData(scope, authId, authHash));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
  const token = `${TOKEN_PREFIX}${envelope.toString("base64url")}`;
  if (token.length > MAX_TOKEN_CHARACTERS) {
    throw new Error("cursor-token payload exceeds its size bound");
  }
  return token;
}
function openCursorToken(scope, authId, authHash, token, environment = process.env) {
  validateCoordinates(scope, authId, authHash);
  const { ciphertext, iv, tag } = decodeEnvelope(token);
  let plaintext;
  try {
    const decipher = createDecipheriv("aes-256-gcm", cursorEncryptionKey(environment, false), iv);
    decipher.setAAD(additionalData(scope, authId, authHash));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
  } catch {
    throw invalidToken("authentication failed");
  }
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw invalidToken("is malformed");
  }
  let text;
  let payload;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    payload = JSON.parse(text);
  } catch {
    throw invalidToken("is malformed");
  }
  try {
    if (canonicalJson(payload) !== text)
      throw invalidToken("is malformed");
  } catch {
    throw invalidToken("is malformed");
  }
  return payload;
}

// src/web-session-cookies.ts
import {
  createDecipheriv as createDecipheriv2,
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
import { basename as basename2, dirname as dirname2, isAbsolute as isAbsolute2, join as join4, resolve } from "path";
import {
  acquireCookieRecords as acquireCookieRecords2
} from "@hraness/kb/clip/acquire";
import {
  filterCookies,
  MAX_COOKIE_RECORDS
} from "@hraness/kb/clip/cookies";

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
import { basename, dirname, isAbsolute, join as join3 } from "path";
import { fileURLToPath } from "url";
import {
  acquireCookieRecords,
  browserCookieCommands
} from "@hraness/kb/clip/acquire";
import { isPrivateAddress as isPrivateAddress2, isPrivateHostname as isPrivateHostname2 } from "@hraness/kb/clip/network";

// src/derivation-network-guard.ts
import { tmpdir } from "os";
import { join as join2 } from "path";
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
  return join2(root, `io-wrench-dp-${derivationId}.ctl`);
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
} from "@hraness/kb/clip/network";
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
var deriveCommandHelperPath = join3(dirname(fileURLToPath(import.meta.url)), "derive-command-helper.ts");
var profileCloneHelperPath = join3(dirname(fileURLToPath(import.meta.url)), "profile-clone-helper.ts");
var trustedBunConfigPath = join3(dirname(fileURLToPath(import.meta.url)), "state-helper.bunfig.toml");
var derivationDnrPolicyFileName = "network-readiness-policy.json";
var derivationDnrPolicyActions = Object.freeze([
  "launch",
  "cdp_url",
  "url"
]);
var derivationIdPattern2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function ownedByCurrentUser(uid) {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return currentUid === undefined || uid === (typeof uid === "bigint" ? BigInt(currentUid) : currentUid);
}
function inspectDirectoryIdentity(path) {
  const stats = lstatSync(path, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats.uid) || (stats.mode & 0o777n) !== 0o700n)
    throw new Error("derivation session directory is unsafe");
  return { device: stats.dev.toString(), inode: stats.ino.toString() };
}
function parseDirectoryIdentity(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "device,inode" || !("device" in value) || typeof value.device !== "string" || !/^\d{1,40}$/u.test(value.device) || !("inode" in value) || typeof value.inode !== "string" || !/^\d{1,40}$/u.test(value.inode))
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
  return join3(ghostgetStateHome(environment), "derivations", id);
}
function metadataPath(id, environment) {
  return join3(derivationDirectory(id, environment), "session.json");
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
  return join3(root, `io-derive-ab-${id}`);
}
function parseDerivationDirectoryPhase(value, id, directoryIdentity) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("derivation directory phase marker is malformed");
  }
  const record = value;
  if (Object.keys(record).sort().join(",") !== "derivationId,directoryIdentity,kind,schemaVersion" || record.schemaVersion !== 1 || record.kind !== "io-derivation-directory-phase" || record.derivationId !== id)
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
  if (Object.keys(record).sort().join(",") !== "derivationId,directoryIdentity,kind,schemaVersion,socketDirectory,socketIdentity" || record.schemaVersion !== 1 || record.kind !== "io-derivation-initialization" || record.derivationId !== id || record.socketDirectory !== expectedSocketDirectory(id))
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
  const stats = (() => {
    try {
      return lstatSync(path, { bigint: true });
    } catch (error) {
      throw new Error(`${label} is unavailable or unsafe`, { cause: error });
    }
  })();
  if (!stats.isFile() || stats.isSymbolicLink() || !ownedByCurrentUser(stats.uid) || (stats.mode & 0o077n) !== 0n || stats.size < 1n || stats.size > BigInt(maximumBytes))
    throw new Error(`${label} is unavailable or unsafe`);
  return {
    device: stats.dev.toString(),
    inode: stats.ino.toString(),
    byteLength: Number(stats.size)
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
  return join3(session.directory, derivationReadyMarkerName);
}
function initializationMarkerPath(directory) {
  return join3(directory, derivationInitializationMarkerName);
}
function phaseMarkerPath(directory) {
  return join3(directory, derivationPhaseMarkerName);
}
function parseReadyDerivation(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("derivation ready marker is malformed");
  }
  const record = value;
  const metadata = record.metadata;
  if (Object.keys(record).sort().join(",") !== "metadata,schemaVersion,state" || record.schemaVersion !== 1 || record.state !== "ready" || typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
    throw new Error("derivation ready marker is malformed");
  const evidence = metadata;
  if (Object.keys(evidence).sort().join(",") !== "byteLength,device,inode,sha256" || typeof evidence.device !== "string" || !/^\d{1,40}$/u.test(evidence.device) || typeof evidence.inode !== "string" || !/^\d{1,40}$/u.test(evidence.inode) || !Number.isSafeInteger(evidence.byteLength) || evidence.byteLength < 1 || evidence.byteLength > 64 * 1024 || typeof evidence.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(evidence.sha256))
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
  const expectedProfiles = new Set([join3(directory, "profile"), join3(directory, "profile-user-data")]);
  const namedProfile = session.profilePath !== null && isSafeNamedProfile(session.profilePath);
  if (session.id !== id || session.directory !== directory || session.socketDirectory !== expectedSocketDirectory(id) || session.configPath !== join3(directory, "agent-browser.json") || session.policyPath !== join3(directory, "action-policy.json") || session.profilePath !== null && !expectedProfiles.has(session.profilePath) && !namedProfile) {
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
    readRegularFile(join3(session.directory, derivationDnrPolicyFileName), 64 * 1024, "derivation DNR readiness policy", session.directoryIdentity);
  }
  return { session, socketAvailable, ready, metadataEvidence: metadata.evidence };
}
function reviewMarkerPath(session) {
  return join3(session.directory, derivationReviewMarkerName);
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
  if (Object.keys(record).sort().join(",") !== "har,schemaVersion,state" || record.schemaVersion !== 1 || record.state !== "sealed" || typeof har !== "object" || har === null || Array.isArray(har))
    throw new Error("derivation review seal is malformed");
  const harRecord = har;
  if (Object.keys(harRecord).sort().join(",") !== "byteLength,device,inode,sha256" || typeof harRecord.device !== "string" || !/^\d{1,40}$/u.test(harRecord.device) || typeof harRecord.inode !== "string" || !/^\d{1,40}$/u.test(harRecord.inode) || !Number.isSafeInteger(harRecord.byteLength) || harRecord.byteLength < 1 || harRecord.byteLength > MAX_HAR_BYTES || typeof harRecord.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(harRecord.sha256))
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
  const directory = join3(ghostgetStateHome(environment), "derivations");
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
        const sessionDirectory = join3(directory, entry.name);
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
function ownedByCurrentUser2(uid) {
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
  if (!stats.isFile() || stats.isSymbolicLink() || !ownedByCurrentUser2(stats.uid) || (stats.mode & 0o077n) !== 0n || stats.size < 1n || stats.size > BigInt(maximumBytes) || realpathSync2(path) !== path)
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
  if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser2(stats.uid) || (stats.mode & 0o777n) !== 0o700n || realpathSync2(path) !== path)
    throw new Error(`${label} is unsafe`);
}
function managedDerivationChromiumCookieDatabase(browserProfile, cookieProfile) {
  if (!isAbsolute2(browserProfile) || cookieProfile === undefined || !isAbsolute2(cookieProfile)) {
    return null;
  }
  const profile = resolve(browserProfile);
  if (basename2(profile) !== "profile")
    return null;
  const directory = dirname2(profile);
  const id = basename2(directory);
  const derivationsDirectory = dirname2(directory);
  if (!DERIVATION_ID_PATTERN.test(id) || basename2(derivationsDirectory) !== "derivations" || resolve(cookieProfile) !== join4(profile, "Default"))
    return null;
  const sessionPath = join4(directory, "session.json");
  const before = inspectPrivateRegularFile(sessionPath, 64 * 1024, "managed Chromium derivation metadata");
  const summaries = listDerivations({
    GHOSTGET_STATE_HOME: dirname2(derivationsDirectory)
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
  inspectPrivateDirectory(join4(profile, "Default"), "managed Chromium Default profile");
  return join4(profile, "Default", "Cookies");
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
    const decipher = createDecipheriv2("aes-128-cbc", MOCK_KEYCHAIN_KEY, Buffer.alloc(16, 32));
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
  const snapshotDirectory = mkdtempSync(join4(tmpdir3(), "wrench-managed-chromium-"));
  const snapshotPath = join4(snapshotDirectory, "Cookies");
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
async function acquireWebSessionCookieRecords(auth, target, timeoutMs, reader = acquireCookieRecords2) {
  if (auth.kind === "browser-profile" && auth.cookieSource === "chrome") {
    const databasePath = managedDerivationChromiumCookieDatabase(auth.profile, auth.cookieProfile);
    if (databasePath !== null) {
      return readManagedChromiumCookies(databasePath, target);
    }
  }
  return reader(webSessionCookieSelection(auth, timeoutMs), target);
}

// src/providers/instagram-web-profile-browser.ts
import { createHash as createHash2 } from "crypto";
var INSTAGRAM_ORIGIN = "https://www.instagram.com";
var INSTAGRAM_ROOT_URL = `${INSTAGRAM_ORIGIN}/`;
var INSTAGRAM_PRE_COOKIE_REALM_URL = `${INSTAGRAM_ORIGIN}/robots.txt`;
var INSTAGRAM_INITIAL_ROOT_BATCH = JSON.stringify([
  ["open", INSTAGRAM_ORIGIN]
]);
var INSTAGRAM_INITIAL_BLANK_BATCH = JSON.stringify([
  ["open", "about:blank"]
]);
var INSTAGRAM_INITIAL_REALM_BATCH = JSON.stringify([
  ["open", INSTAGRAM_PRE_COOKIE_REALM_URL]
]);
var INSTAGRAM_PROFILE_ROUTE = "/api/v1/users/web_profile_info/";
var INSTAGRAM_WEB_APP_ID = "936619743392459";
var MAX_VIEWER_HTML_BYTES = 12 * 1024 * 1024;
var MAX_PROFILE_JSON_BYTES = 8 * 1024 * 1024;
var BROWSER_ENVELOPE_BYTES = 64 * 1024;
var profileBrowserManifest = Object.freeze({
  schemaVersion: 4,
  id: "instagram-profile-runtime",
  version: "1.0.0",
  displayName: "Instagram profile stats runtime",
  surfaceId: "instagram",
  origins: Object.freeze([INSTAGRAM_ORIGIN]),
  browserDomains: Object.freeze(["www.instagram.com"]),
  operations: Object.freeze({})
});
var INSTAGRAM_RESPONSE_MEDIA_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

class InstagramProfileBrowserFailure extends Error {
  category;
  constructor(category, message) {
    super(message);
    this.name = "InstagramProfileBrowserFailure";
    this.category = category;
  }
}

class InstagramProfileBrowserResponseRejectedError extends InstagramProfileBrowserFailure {
  status;
  contentType;
  constructor(status, contentType) {
    super("response-rejected", "Instagram profile browser request returned a reviewed rejection");
    this.name = "InstagramProfileBrowserResponseRejectedError";
    if (!Number.isSafeInteger(status) || status < 100 || status > 599 || contentType.length > 128 || contentType !== "" && !INSTAGRAM_RESPONSE_MEDIA_TYPE.test(contentType))
      throw new Error("Instagram profile browser returned a malformed response category");
    this.status = status;
    this.contentType = contentType === "" ? "missing" : contentType;
  }
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys3(value, expected, label) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} returned an unexpected result shape`);
  }
}
function exactInstagramProfile(value) {
  if (!/^[a-z0-9._]{1,30}$/u.test(value)) {
    throw new Error("Instagram profile browser target must be one canonical lowercase handle");
  }
  return value;
}
function profilePath2(profile) {
  const url = new URL(INSTAGRAM_PROFILE_ROUTE, INSTAGRAM_ORIGIN);
  url.searchParams.set("username", profile);
  return `${url.pathname}${url.search}`;
}
function browserReadEvaluationSource(binding) {
  const bound = jsonScriptLiteral(binding);
  return `(async()=>{const input=${bound};if(location.origin!=="${INSTAGRAM_ORIGIN}")throw new Error("unexpected Instagram origin");if((input.kind!=="json"&&input.kind!=="html")||!Number.isSafeInteger(input.maxBytes)||input.maxBytes<1||input.maxBytes>${MAX_VIEWER_HTML_BYTES})throw new Error("invalid Instagram profile browser request binding");const expected=new URL(input.path,"${INSTAGRAM_ORIGIN}");if(expected.origin!=="${INSTAGRAM_ORIGIN}"||expected.username!==""||expected.password!==""||expected.hash!==""||expected.href!=="${INSTAGRAM_ORIGIN}"+input.path)throw new Error("invalid Instagram profile browser path binding");if(input.kind==="html"){if(expected.pathname!=="/"||expected.search!==""||input.referrer!=="${INSTAGRAM_ROOT_URL}")throw new Error("Instagram viewer browser request escaped its exact route")}else{const names=[...expected.searchParams.keys()];const profile=expected.searchParams.get("username");if(expected.pathname!=="${INSTAGRAM_PROFILE_ROUTE}"||names.length!==1||names[0]!=="username"||typeof profile!=="string"||!/^[a-z0-9._]{1,30}$/.test(profile)||expected.search!=="?username="+encodeURIComponent(profile)||input.referrer!=="${INSTAGRAM_ORIGIN}/"+profile+"/")throw new Error("Instagram profile browser request escaped its exact route")}const headers=input.kind==="json"?{accept:"application/json, text/plain, */*","x-ig-app-id":"${INSTAGRAM_WEB_APP_ID}","x-requested-with":"XMLHttpRequest"}:{accept:"text/html,application/xhtml+xml"};const response=await fetch(input.path,{cache:"no-store",credentials:"include",headers,method:"GET",redirect:"error",referrer:input.referrer,referrerPolicy:"same-origin"});const responseUrl=new URL(response.url);if(responseUrl.origin!=="${INSTAGRAM_ORIGIN}"||responseUrl.username!==""||responseUrl.password!==""||responseUrl.hash!==""||responseUrl.href!==expected.href)throw new Error("Instagram profile browser response escaped its exact route");const contentType=(response.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();const contentTypeAllowed=input.kind==="json"?contentType==="application/json":contentType==="text/html";if(response.status!==200||!contentTypeAllowed){response.body?.cancel();return{authWall:false,bodyBase64:null,bodyBytes:0,bodySha256:null,contentType,status:response.status}}if(response.body===null)throw new Error("Instagram profile browser response omitted its body");const reader=response.body.getReader();const chunks=[];let bytes=0;while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>input.maxBytes){await reader.cancel();throw new Error("Instagram profile browser response exceeded its reviewed byte bound")}chunks.push(part.value)}const body=new Uint8Array(bytes);let cursor=0;for(const chunk of chunks){body.set(chunk,cursor);cursor+=chunk.byteLength}const text=new TextDecoder("utf-8",{fatal:true}).decode(body);const authWall=input.kind==="html"&&/<form[^>]+(?:login|sign-in)|href=["']\\/accounts\\/login\\/?["']/iu.test(text);if(authWall)return{authWall:true,bodyBase64:null,bodyBytes:0,bodySha256:null,contentType,status:response.status};const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",body)),(value)=>value.toString(16).padStart(2,"0")).join("");let binary="";for(let offset=0;offset<body.length;offset+=32768)binary+=String.fromCharCode(...body.subarray(offset,Math.min(offset+32768,body.length)));return{authWall:false,bodyBase64:btoa(binary),bodyBytes:body.byteLength,bodySha256:digest,contentType,status:response.status}})()`;
}
function encodedBodyBound(bytes) {
  return Math.ceil(bytes / 3) * 4;
}
function decodedBody(result, maximumBytes) {
  if (typeof result.bodyBase64 !== "string" || result.bodyBase64.length > encodedBodyBound(maximumBytes) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(result.bodyBase64) || !Number.isSafeInteger(result.bodyBytes) || result.bodyBytes < 0 || result.bodyBytes > maximumBytes || typeof result.bodySha256 !== "string" || !/^[a-f0-9]{64}$/u.test(result.bodySha256))
    throw new InstagramProfileBrowserFailure("body-envelope", "Instagram profile browser body envelope changed shape");
  const bytes = Buffer.from(result.bodyBase64, "base64");
  if (bytes.byteLength !== result.bodyBytes || bytes.toString("base64") !== result.bodyBase64 || createHash2("sha256").update(bytes).digest("hex") !== result.bodySha256)
    throw new InstagramProfileBrowserFailure("body-envelope", "Instagram profile browser body envelope failed integrity verification");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InstagramProfileBrowserFailure("body-envelope", "Instagram profile browser body was not valid UTF-8");
  }
}
function browserEvaluationResult(value) {
  const data = browserResultData(value);
  if (!isRecord2(data) || typeof data.origin !== "string" || !isRecord2(data.result)) {
    throw new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser returned a malformed evaluation envelope");
  }
  let origin;
  try {
    origin = new URL(data.origin);
  } catch {
    throw new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser returned a malformed evaluation envelope");
  }
  if (origin.origin !== INSTAGRAM_ORIGIN || origin.username !== "" || origin.password !== "")
    throw new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser returned a malformed evaluation envelope");
  return data.result;
}
function hasNoDefaultExecutionContext(error) {
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof Error && /(?:cannot find|no) default execution context/iu.test(current.message))
      return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
function hasUnexpectedInstagramOrigin(error) {
  let current = error;
  for (let depth = 0;depth < 8 && current !== undefined; depth += 1) {
    if (current instanceof Error && /(?:^|: )unexpected Instagram origin(?:$|[\r\n])/u.test(current.message))
      return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
function classifiedBrowserCommandFailure(error) {
  const message = error instanceof Error && error.message.length <= 1500 ? error.message : "";
  if (message.includes("Failed to fetch")) {
    return new InstagramProfileBrowserFailure("provider-fetch", "Instagram profile browser could not complete its first-party fetch");
  }
  if (message.endsWith("Instagram profile browser response escaped its exact route") || message.endsWith("Instagram profile browser request escaped its exact route") || message.endsWith("Instagram viewer browser request escaped its exact route")) {
    return new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser request escaped its exact route");
  }
  if (message.includes("process output exceeded") || message.includes("response exceeded its reviewed byte bound")) {
    return new InstagramProfileBrowserFailure("output-bound", "Instagram profile browser exceeded a reviewed output bound");
  }
  if (message.includes("malformed batch") || message.includes("malformed batch entry") || message.includes("did not return JSON") || message.includes("command omitted its result")) {
    return new InstagramProfileBrowserFailure("browser-envelope", "Instagram profile browser command returned a malformed envelope");
  }
  return new InstagramProfileBrowserFailure("browser-command", "Instagram profile browser command failed before a reviewed response");
}
function instagramProfileBrowserCommandRunner(execute, authKind) {
  let initialBatchPending = true;
  return (command, options) => {
    const rewroteInitialRoot = initialBatchPending && options.stdin === INSTAGRAM_INITIAL_ROOT_BATCH;
    const rewroteInitialBlank = initialBatchPending && authKind === "browser-profile" && options.stdin === INSTAGRAM_INITIAL_BLANK_BATCH;
    initialBatchPending = false;
    return execute(command, rewroteInitialRoot || rewroteInitialBlank ? { ...options, stdin: INSTAGRAM_INITIAL_REALM_BATCH } : options);
  };
}
async function finalizeBrowserSession(session) {
  const failures = [];
  let closeVerified = false;
  try {
    await session.close();
    closeVerified = true;
  } catch (error) {
    failures.push(error);
  }
  let cleanupVerified = false;
  try {
    await session.cleanup();
    cleanupVerified = true;
  } catch (error) {
    failures.push(error);
  }
  if (cleanupVerified)
    return;
  const cleanupEvidence = closeVerified && !cleanupVerified && session.cleanupResourceIdentity !== undefined ? Object.freeze({
    kind: "agent-browser-closed-artifacts-v1",
    resource: session.cleanupResourceIdentity
  }) : undefined;
  throw new PreservedBrowserArtifactsError("Instagram profile browser finalization failed; private artifacts were preserved", session.recoveryHandle ?? "session=instagram-profile-runtime;artifacts=unknown", new AggregateError(failures, "Instagram profile browser finalization failed"), cleanupEvidence);
}
function assertSupportedAuth(auth) {
  if (auth.kind !== "cookie-source" && auth.kind !== "cookies-file" && auth.kind !== "browser-profile")
    throw new Error("Instagram profile browser requires browser-session or cookie auth");
}
async function createInstagramProfileBrowserTransport(auth, options) {
  assertSupportedAuth(auth);
  if (!Number.isSafeInteger(options.maxOutputBytes) || options.maxOutputBytes < 1 || options.maxOutputBytes > MAX_VIEWER_HTML_BYTES)
    throw new Error("Instagram profile browser output bound is invalid");
  const createSession = options.dependencies?.createBrowserSession ?? createBrowserSession;
  const browserOutputBytes = encodedBodyBound(options.maxOutputBytes) + BROWSER_ENVELOPE_BYTES;
  const sessionOptions = {
    allowCodeOwnedEvaluation: true,
    headed: true,
    maxOutputBytes: browserOutputBytes,
    timeoutMs: options.timeoutMs,
    dependencies: {
      runCommand: instagramProfileBrowserCommandRunner(options.dependencies?.runCommand ?? runCommand, auth.kind)
    },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
  };
  let session;
  try {
    session = await createSession(profileBrowserManifest, auth, sessionOptions);
  } catch (error) {
    if (error instanceof PreservedBrowserArtifactsError)
      throw error;
    options.operationDeadline?.throwIfUnavailable("Instagram profile browser startup");
    throw new InstagramProfileBrowserFailure("startup", "Instagram profile browser could not start its contained session");
  }
  let closed = false;
  let state = "ready";
  const remainingTimeMs = () => options.operationDeadline?.remainingTimeMs() ?? options.timeoutMs;
  const run = async (binding) => {
    if (closed)
      throw new Error("Instagram profile browser transport is closed");
    const source = browserReadEvaluationSource(binding);
    let records;
    try {
      records = await session.runBatch([["eval", source]], remainingTimeMs(), Math.min(encodedBodyBound(binding.maxBytes) + BROWSER_ENVELOPE_BYTES, browserOutputBytes));
    } catch (error) {
      if (error instanceof PreservedBrowserArtifactsError)
        throw error;
      if (error instanceof InstagramProfileBrowserFailure)
        throw error;
      options.operationDeadline?.throwIfUnavailable("Instagram profile browser operation");
      if (hasNoDefaultExecutionContext(error)) {
        throw new InstagramProfileBrowserFailure("execution-context", "Instagram profile browser lost its reviewed execution context");
      }
      if (hasUnexpectedInstagramOrigin(error)) {
        throw new InstagramProfileBrowserFailure("bootstrap", "Instagram profile browser was not on its reviewed signed-in origin");
      }
      throw classifiedBrowserCommandFailure(error);
    }
    const first = records[0];
    if (first === undefined) {
      throw new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser omitted its response");
    }
    const result = browserEvaluationResult(first);
    try {
      exactKeys3(result, [
        "authWall",
        "bodyBase64",
        "bodyBytes",
        "bodySha256",
        "contentType",
        "status"
      ], "Instagram profile browser request");
    } catch {
      throw new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser request returned an unexpected result shape");
    }
    const expectedContentType = binding.kind === "json" ? "application/json" : "text/html";
    if (typeof result.status !== "number" || !Number.isSafeInteger(result.status) || result.status < 100 || result.status > 599 || typeof result.contentType !== "string" || result.contentType.length > 128 || result.contentType !== "" && !INSTAGRAM_RESPONSE_MEDIA_TYPE.test(result.contentType))
      throw new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser returned a malformed response category");
    if (result.authWall === true) {
      if (binding.kind !== "html" || result.status !== 200 || result.contentType !== "text/html" || result.bodyBase64 !== null || result.bodyBytes !== 0 || result.bodySha256 !== null)
        throw new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser returned a malformed authwall envelope");
      throw new InstagramProfileBrowserFailure("authwall", "Instagram profile browser reached the signed-out authwall");
    }
    if (result.authWall !== false) {
      throw new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser returned a malformed authwall envelope");
    }
    if (result.status !== 200 || result.contentType !== expectedContentType) {
      if (result.bodyBase64 !== null || result.bodyBytes !== 0 || result.bodySha256 !== null)
        throw new InstagramProfileBrowserFailure("response-envelope", "Instagram profile browser returned a malformed rejection envelope");
      throw new InstagramProfileBrowserResponseRejectedError(result.status, result.contentType);
    }
    return result;
  };
  return Object.freeze({
    readCurrentViewerHtml: async () => {
      if (state !== "ready") {
        throw new Error("Instagram profile browser viewer read is out of order");
      }
      state = "viewer-pending";
      const maximumBytes = Math.min(MAX_VIEWER_HTML_BYTES, options.maxOutputBytes);
      const result = await run({
        kind: "html",
        maxBytes: maximumBytes,
        path: "/",
        referrer: INSTAGRAM_ROOT_URL
      });
      const html = decodedBody(result, maximumBytes);
      state = "viewer";
      return html;
    },
    readProfileJson: async (profileValue) => {
      if (state !== "viewer") {
        throw new Error("Instagram profile browser target read is out of order");
      }
      const profile = exactInstagramProfile(profileValue);
      state = "profile-pending";
      const maximumBytes = Math.min(MAX_PROFILE_JSON_BYTES, options.maxOutputBytes);
      const result = await run({
        kind: "json",
        maxBytes: maximumBytes,
        path: profilePath2(profile),
        referrer: `${INSTAGRAM_ORIGIN}/${profile}/`
      });
      const text = decodedBody(result, maximumBytes);
      let output;
      try {
        output = JSON.parse(text);
      } catch {
        throw new InstagramProfileBrowserFailure("profile-json", "Instagram profile browser response was not valid JSON");
      }
      state = "complete";
      return output;
    },
    close: async () => {
      if (closed)
        return;
      closed = true;
      await finalizeBrowserSession(session);
    }
  });
}

// src/providers/instagram-video-foundations.ts
import { Blob } from "buffer";
import { createHash as createHash3 } from "crypto";
import { constants as constants2 } from "fs";
import { open } from "fs/promises";
import { types as nodeTypes } from "util";
var MAX_INSTAGRAM_VIDEO_BYTES = 128 * 1024 * 1024;
var MAX_INSTAGRAM_THUMBNAIL_BYTES = 8 * 1024 * 1024;
var INSTAGRAM_MEDIA_ID_PATTERN = /^[1-9][0-9]{0,31}(?:_[1-9][0-9]{0,31})?$/u;
var INSTAGRAM_SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
var INSTAGRAM_VIEWER_ID_PATTERN = /^[1-9][0-9]{0,31}$/u;
var INSTAGRAM_ORIGIN2 = "https://www.instagram.com";
var INSTAGRAM_VIDEO_PUBLISH_BINDING_KEYS = Object.freeze([
  "audience",
  "byteLength",
  "bytes",
  "caption",
  "durationMilliseconds",
  "height",
  "mediaSha256",
  "mediaType",
  "thumbnailByteLength",
  "thumbnailBytes",
  "thumbnailHeight",
  "thumbnailMediaType",
  "thumbnailSha256",
  "thumbnailWidth",
  "width"
]);
var TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
var TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "buffer")?.get;
var TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "byteLength")?.get;
var MP4_COMPATIBLE_BRANDS = Object.freeze(new Set([
  "M4V ",
  "MSNV",
  "avc1",
  "iso2",
  "isom",
  "mp41",
  "mp42"
]));
var INSTAGRAM_VIDEO_CAPTURE_BLOCKERS = Object.freeze({
  "media.publish": "the observed first configure response was 202 without an accepted target; neither a safe repeated configure POST nor an independent upload-ID reconciliation read is proven"
});
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactInputKeys(input, required, label) {
  const permitted = new Set(required);
  if (Object.keys(input).some((key) => !permitted.has(key))) {
    throw new Error(`${label} contained an unsupported input field`);
  }
  if (required.some((key) => !Object.hasOwn(input, key))) {
    throw new Error(`${label} omitted a required input field`);
  }
}
function boundedCaption(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 1000 || /[\0\r]/u.test(value))
    throw new Error(`${label} must be 1 to 1000 bounded UTF-16 code units`);
  return value;
}
function instagramMediaId(value, label) {
  if (typeof value !== "string" || !INSTAGRAM_MEDIA_ID_PATTERN.test(value)) {
    throw new Error(`${label} must be one exact canonical Instagram media ID`);
  }
  return value;
}
function instagramShortcode(value, label) {
  if (typeof value !== "string" || !INSTAGRAM_SHORTCODE_PATTERN.test(value)) {
    throw new Error(`${label} must be one exact Instagram shortcode`);
  }
  return value;
}
function instagramVideoPermalink(code) {
  return `${INSTAGRAM_ORIGIN2}/p/${code}/`;
}
function exactNormalizedKeys(value, expected, label) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} changed its bounded normalized shape`);
  }
}
function boundedForeignRecord(value, label, maximumKeys) {
  if (!isRecord3(value) || Object.keys(value).length > maximumKeys) {
    throw new Error(`${label} must be one bounded object`);
  }
  return value;
}
function exactInstagramVideoPublishBinding(value) {
  if (typeof value !== "object" || value === null)
    throw new Error("Instagram video binding must be one exact object");
  if (nodeTypes.isProxy(value)) {
    throw new Error("Instagram video binding must not be a proxy");
  }
  if (Array.isArray(value)) {
    throw new Error("Instagram video binding must be one exact object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Instagram video binding must use a plain prototype");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== INSTAGRAM_VIDEO_PUBLISH_BINDING_KEYS.length || ownKeys.some((key) => typeof key !== "string") || ownKeys.sort().join(",") !== [...INSTAGRAM_VIDEO_PUBLISH_BINDING_KEYS].sort().join(","))
    throw new Error("Instagram video binding contained unsupported fields");
  const snapshot = Object.create(null);
  for (const key of INSTAGRAM_VIDEO_PUBLISH_BINDING_KEYS) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("Instagram video binding must contain only enumerable data properties");
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}
function snapshotInstagramBytes(value, maximumBytes, label) {
  if (typeof value !== "object" || value === null || nodeTypes.isProxy(value) || !(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype || TYPED_ARRAY_BUFFER_GETTER === undefined || TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined)
    throw new Error(`Instagram video binding must contain one bounded ${label}`);
  let buffer;
  let byteLength;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER.call(value);
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER.call(value);
  } catch {
    throw new Error(`Instagram video binding must contain one bounded ${label}`);
  }
  if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < (label === "MP4" ? 24 : 16) || byteLength > maximumBytes || nodeTypes.isSharedArrayBuffer(buffer))
    throw new Error(`Instagram video binding must contain one bounded ${label}`);
  const bytes = new Uint8Array(byteLength);
  try {
    Uint8Array.prototype.set.call(bytes, value);
  } catch {
    throw new Error(`Instagram video binding must contain one bounded ${label}`);
  }
  return bytes;
}
function instagramJpegDimensions(bytes) {
  if (bytes.byteLength < 16 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
    throw new Error("Instagram video thumbnail must be one complete JPEG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameMarkers = new Set([
    192,
    193,
    194,
    195,
    197,
    198,
    199,
    201,
    202,
    203,
    205,
    206,
    207
  ]);
  let offset = 2;
  let frame = null;
  while (offset < bytes.byteLength - 2) {
    if (bytes[offset] !== 255) {
      throw new Error("Instagram video thumbnail JPEG marker stream changed shape");
    }
    while (bytes[offset] === 255)
      offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0) {
      throw new Error("Instagram video thumbnail JPEG marker stream changed shape");
    }
    if (marker === 217)
      break;
    if (marker === 218) {
      if (frame === null) {
        throw new Error("Instagram video thumbnail JPEG omitted its frame dimensions");
      }
      return frame;
    }
    if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) {
      continue;
    }
    if (offset + 2 > bytes.byteLength) {
      throw new Error("Instagram video thumbnail JPEG segment exceeded its bytes");
    }
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.byteLength) {
      throw new Error("Instagram video thumbnail JPEG segment exceeded its bytes");
    }
    if (frameMarkers.has(marker)) {
      if (frame !== null || length < 8 || bytes[offset + 2] !== 8) {
        throw new Error("Instagram video thumbnail JPEG frame changed shape");
      }
      const height = view.getUint16(offset + 3);
      const width = view.getUint16(offset + 5);
      if (height < 1 || height > 20000 || width < 1 || width > 20000) {
        throw new Error("Instagram video thumbnail JPEG dimensions are outside the reviewed bound");
      }
      frame = Object.freeze({ height, width });
    }
    offset += length;
  }
  if (frame === null) {
    throw new Error("Instagram video thumbnail JPEG omitted its frame dimensions");
  }
  return frame;
}
function planBoundFile(value) {
  if (!isRecord3(value) || Object.keys(value).sort().join(",") !== "kind,reference" || value.kind !== "file" || typeof value.reference !== "string" || value.reference.length < 1 || value.reference.length > 4096 || /[\0\r\n]/u.test(value.reference))
    throw new Error("input.media must be one exact plan-bound file");
  return Object.freeze({ kind: "file", reference: value.reference });
}
function requireMp4FileType(bytes) {
  if (bytes.byteLength < 24) {
    throw new Error("Instagram video must be one complete MP4 file");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fileTypeBytes = view.getUint32(0);
  if (fileTypeBytes < 16 || fileTypeBytes > bytes.byteLength || String.fromCharCode(...bytes.subarray(4, 8)) !== "ftyp" || (fileTypeBytes - 16) % 4 !== 0)
    throw new Error("Instagram video must begin with one bounded MP4 file-type box");
  const majorBrand = String.fromCharCode(...bytes.subarray(8, 12));
  if (majorBrand === "qt  ") {
    throw new Error("Instagram video file-type box is not MP4-compatible");
  }
  const brands = [];
  for (let offset = 8;offset < fileTypeBytes; offset += offset === 8 ? 8 : 4) {
    brands.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)));
  }
  if (!brands.some((brand) => MP4_COMPATIBLE_BRANDS.has(brand))) {
    throw new Error("Instagram video file-type box is not MP4-compatible");
  }
}
function instagramVideoSha256(bytes) {
  return createHash3("sha256").update(bytes).digest("hex");
}
function instagramVideoMetadata(bytes) {
  requireMp4FileType(bytes);
  const dimensions = isoBmffVideoDimensions(bytes, "Instagram video");
  const metadata = isoBmffMp4VideoMetadata(bytes, "Instagram video", Object.freeze({
    compatibleBrands: Object.freeze([...MP4_COMPATIBLE_BRANDS]),
    rejectedMajorBrands: Object.freeze(["qt  "])
  }));
  const durationMilliseconds = Math.floor(metadata.durationSeconds * 1000);
  if (metadata.durationSeconds < 0.001 || metadata.durationSeconds > 86400 || !Number.isSafeInteger(durationMilliseconds) || durationMilliseconds < 1 || durationMilliseconds > 86400000 || metadata.height !== dimensions.height || metadata.width !== dimensions.width)
    throw new Error("Instagram video duration is outside the reviewed bound");
  return Object.freeze({ durationMilliseconds, ...dimensions });
}
async function stableInstagramPublishFile(path, maximumBytes, label, operationDeadline) {
  const noFollow = "O_NOFOLLOW" in constants2 ? constants2.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open(path, constants2.O_RDONLY | noFollow) : await operationDeadline.run(() => open(path, constants2.O_RDONLY | noFollow), "authenticated web operation deadline");
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 16 || before.size > maximumBytes) {
      throw new Error(`Instagram ${label} must be a regular file within its reviewed in-memory bound`);
    }
    const fileBytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || fileBytes.byteLength !== before.size)
      throw new Error(`Instagram ${label} changed while it was materialized`);
    return new Uint8Array(fileBytes);
  } finally {
    await handle.close();
  }
}
function prepareInstagramVideoPublishInput(input) {
  exactInputKeys(input, ["audience", "caption", "media", "thumbnail"], "Instagram video publishing");
  if (input.audience !== "default") {
    throw new Error("input.audience must be the exact default Instagram audience");
  }
  return Object.freeze({
    audience: "default",
    caption: boundedCaption(input.caption, "input.caption"),
    media: planBoundFile(input.media),
    thumbnail: planBoundFile(input.thumbnail)
  });
}
async function materializeInstagramVideoPublishInput(input, fileResolver, operationDeadline) {
  const plan = prepareInstagramVideoPublishInput(input);
  if (fileResolver === undefined) {
    throw new Error("Instagram video upload requires the plan-bound file resolver");
  }
  const resolve2 = () => fileResolver([plan.media, plan.thumbnail]);
  const paths = operationDeadline === undefined ? await resolve2() : await operationDeadline.run(resolve2, "authenticated web operation deadline");
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== 2 || typeof paths[0] !== "string" || typeof paths[1] !== "string") {
    throw new Error("Instagram file resolver did not return the exact video and JPEG thumbnail paths");
  }
  const bytes = await stableInstagramPublishFile(paths[0], MAX_INSTAGRAM_VIDEO_BYTES, "video", operationDeadline);
  const dimensions = instagramVideoMetadata(bytes);
  const thumbnailBytes = await stableInstagramPublishFile(paths[1], MAX_INSTAGRAM_THUMBNAIL_BYTES, "video thumbnail", operationDeadline);
  const thumbnailDimensions = instagramJpegDimensions(thumbnailBytes);
  return Object.freeze({
    audience: plan.audience,
    bytes,
    byteLength: bytes.byteLength,
    caption: plan.caption,
    durationMilliseconds: dimensions.durationMilliseconds,
    height: dimensions.height,
    mediaType: "video/mp4",
    mediaSha256: instagramVideoSha256(bytes),
    thumbnailByteLength: thumbnailBytes.byteLength,
    thumbnailBytes,
    thumbnailHeight: thumbnailDimensions.height,
    thumbnailMediaType: "image/jpeg",
    thumbnailSha256: instagramVideoSha256(thumbnailBytes),
    thumbnailWidth: thumbnailDimensions.width,
    width: dimensions.width
  });
}
function revalidateInstagramVideoPublishBindingForDispatch(value) {
  const binding = exactInstagramVideoPublishBinding(value);
  const bytes = snapshotInstagramBytes(binding.bytes, MAX_INSTAGRAM_VIDEO_BYTES, "MP4");
  const thumbnailBytes = snapshotInstagramBytes(binding.thumbnailBytes, MAX_INSTAGRAM_THUMBNAIL_BYTES, "JPEG thumbnail");
  const dimensions = instagramVideoMetadata(bytes);
  const thumbnailDimensions = instagramJpegDimensions(thumbnailBytes);
  const mediaSha256 = instagramVideoSha256(bytes);
  const thumbnailSha256 = instagramVideoSha256(thumbnailBytes);
  if (!Number.isSafeInteger(binding.byteLength) || binding.byteLength !== bytes.byteLength || typeof binding.mediaSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(binding.mediaSha256) || binding.mediaSha256 !== mediaSha256 || binding.durationMilliseconds !== dimensions.durationMilliseconds || binding.height !== dimensions.height || binding.width !== dimensions.width || !Number.isSafeInteger(binding.thumbnailByteLength) || binding.thumbnailByteLength !== thumbnailBytes.byteLength || typeof binding.thumbnailSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(binding.thumbnailSha256) || binding.thumbnailSha256 !== thumbnailSha256 || binding.thumbnailHeight !== thumbnailDimensions.height || binding.thumbnailWidth !== thumbnailDimensions.width)
    throw new Error("Instagram video binding changed from its exact bytes");
  if (binding.audience !== "default" || binding.mediaType !== "video/mp4" || binding.thumbnailMediaType !== "image/jpeg") {
    throw new Error("Instagram video binding declarations are invalid");
  }
  const body = new Blob([bytes], { type: "video/mp4" });
  const thumbnailBody = new Blob([thumbnailBytes], { type: "image/jpeg" });
  if (body.size !== bytes.byteLength || body.type !== "video/mp4" || thumbnailBody.size !== thumbnailBytes.byteLength || thumbnailBody.type !== "image/jpeg") {
    throw new Error("Instagram video dispatch snapshot changed shape");
  }
  return Object.freeze({
    audience: "default",
    body,
    byteLength: bytes.byteLength,
    caption: boundedCaption(binding.caption, "Instagram video binding caption"),
    durationMilliseconds: dimensions.durationMilliseconds,
    height: dimensions.height,
    mediaSha256,
    mediaType: "video/mp4",
    thumbnailBody,
    thumbnailByteLength: thumbnailBytes.byteLength,
    thumbnailHeight: thumbnailDimensions.height,
    thumbnailMediaType: "image/jpeg",
    thumbnailSha256,
    thumbnailWidth: thumbnailDimensions.width,
    width: dimensions.width
  });
}
function prepareInstagramAuthoredPostDeleteInput(input) {
  exactInputKeys(input, ["expected_caption", "expected_media_kind", "media_id"], "Instagram authored-post deletion");
  if (typeof input.media_id !== "string" || !/^[1-9][0-9]{0,31}_[1-9][0-9]{0,31}$/u.test(input.media_id))
    throw new Error("input.media_id must be one exact full Instagram media ID");
  if (input.expected_media_kind !== "video") {
    throw new Error("input.expected_media_kind must be video");
  }
  return Object.freeze({
    expectedCaption: boundedCaption(input.expected_caption, "input.expected_caption"),
    expectedMediaKind: "video",
    mediaId: input.media_id
  });
}
function bindInstagramVideoMediaReadback(value, expectation) {
  const expectedMediaId = instagramMediaId(expectation.mediaId, "Instagram video readback expected media ID");
  const expectedCaption = boundedCaption(expectation.expectedCaption, "Instagram video readback expected caption");
  if (typeof expectation.viewerId !== "string" || !INSTAGRAM_VIEWER_ID_PATTERN.test(expectation.viewerId))
    throw new Error("Instagram video readback expected viewer ID is invalid");
  const expectedCode = expectation.expectedCode === undefined ? undefined : instagramShortcode(expectation.expectedCode, "Instagram video readback expected shortcode");
  if (!isRecord3(value)) {
    throw new Error("Instagram video readback must be one bounded media projection");
  }
  exactNormalizedKeys(value, [
    "caption",
    "code",
    "comment_count",
    "has_liked",
    "has_viewer_saved",
    "id",
    "like_count",
    "media_type",
    "pk",
    "taken_at",
    "user"
  ], "Instagram video readback");
  const mediaId = instagramMediaId(value.id, "Instagram video readback media ID");
  const code = instagramShortcode(value.code, "Instagram video readback shortcode");
  if (mediaId !== expectedMediaId || value.caption !== expectedCaption || value.media_type !== 2 || expectedCode !== undefined && code !== expectedCode)
    throw new Error("Instagram video readback did not bind the confirmed video");
  if (!isRecord3(value.user)) {
    throw new Error("Instagram video readback did not bind the confirmed actor");
  }
  exactNormalizedKeys(value.user, ["full_name", "id", "username"], "Instagram video readback actor");
  if (value.user.id !== expectation.viewerId) {
    throw new Error("Instagram video readback did not bind the confirmed actor");
  }
  return Object.freeze({
    code,
    mediaId,
    url: instagramVideoPermalink(code)
  });
}
function parseInstagramVideoPermalink(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) {
    throw new Error("Instagram provider-accepted video target returned an invalid permalink");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Instagram provider-accepted video target returned an invalid permalink");
  }
  if (url.origin !== INSTAGRAM_ORIGIN2 || url.username !== "" || url.password !== "" || url.pathname !== `/p/${code}/` || url.search !== "" || url.hash !== "")
    throw new Error("Instagram provider-accepted video target returned an invalid permalink");
  return url.href;
}
function instagramVideoAcceptedTargetIdentifier(target) {
  const mediaId = instagramMediaId(target.mediaId, "Instagram provider-accepted video target media ID");
  const code = instagramShortcode(target.code, "Instagram provider-accepted video target shortcode");
  const url = parseInstagramVideoPermalink(target.url, code);
  return canonicalJson({ code, mediaId, url });
}
function parseInstagramVideoAcceptedTargetIdentifier(identifier) {
  if (typeof identifier !== "string" || identifier.length < 1 || identifier.length > 4096) {
    throw new Error("Instagram provider-accepted video target is not canonical JSON");
  }
  let value;
  try {
    value = JSON.parse(identifier);
  } catch {
    throw new Error("Instagram provider-accepted video target is not canonical JSON");
  }
  if (!isRecord3(value)) {
    throw new Error("Instagram provider-accepted video target contained unsupported fields");
  }
  exactNormalizedKeys(value, ["code", "mediaId", "url"], "Instagram provider-accepted video target");
  const target = Object.freeze({
    code: instagramShortcode(value.code, "Instagram provider-accepted video target shortcode"),
    mediaId: instagramMediaId(value.mediaId, "Instagram provider-accepted video target media ID"),
    url: ""
  });
  const parsed = Object.freeze({
    code: target.code,
    mediaId: target.mediaId,
    url: parseInstagramVideoPermalink(value.url, target.code)
  });
  if (canonicalJson(parsed) !== identifier) {
    throw new Error("Instagram provider-accepted video target is not canonical");
  }
  return parsed;
}
function instagramShortcodeMediaPk(value) {
  const code = instagramShortcode(value, "Instagram video shortcode");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let decoded = 0n;
  for (const character of code) {
    const digit = alphabet.indexOf(character);
    if (digit < 0)
      throw new Error("Instagram video shortcode is invalid");
    decoded = decoded * 64n + BigInt(digit);
  }
  const pk = decoded.toString(10);
  if (decoded < 1n || !/^[1-9][0-9]{0,31}$/u.test(pk)) {
    throw new Error("Instagram video shortcode decoded outside the media-PK bound");
  }
  return pk;
}
function assertInstagramVideoUploadAcknowledgement(value) {
  if (!isRecord3(value) || Object.keys(value).sort().join(",") !== "status" || value.status !== "ok")
    throw new Error("Instagram video upload acknowledgement changed shape");
}
function assertInstagramVideoConfigureIndeterminate(value) {
  if (!isRecord3(value) || Object.keys(value).sort().join(",") !== "message,status" || value.status !== "fail" || typeof value.message !== "string" || value.message.length < 1 || value.message.length > 2048 || /[\0\r]/u.test(value.message))
    throw new Error("Instagram video configure 202 envelope changed shape");
}
function parseInstagramVideoConfigureAccepted(value, expectation) {
  const root = boundedForeignRecord(value, "Instagram video configure response", 32);
  const uploadId = instagramMediaId(expectation.uploadId, "Instagram video configure expected upload ID");
  const viewerId = instagramMediaId(expectation.viewerId, "Instagram video configure expected viewer ID");
  const caption = boundedCaption(expectation.caption, "Instagram video configure expected caption");
  if (root.status !== "ok" || root.upload_id !== uploadId) {
    throw new Error("Instagram video configure response did not accept the exact upload");
  }
  const media = boundedForeignRecord(root.media, "Instagram video configure response.media", 256);
  const mediaId = instagramMediaId(media.id, "Instagram video configure response media ID");
  const pk = instagramMediaId(media.pk, "Instagram video configure response media PK");
  if (pk.includes("_") || mediaId !== `${pk}_${viewerId}`) {
    throw new Error("Instagram video configure response did not bind the current actor");
  }
  const code = instagramShortcode(media.code, "Instagram video configure response shortcode");
  if (instagramShortcodeMediaPk(code) !== pk) {
    throw new Error("Instagram video configure response shortcode changed the media PK");
  }
  const captionContainer = boundedForeignRecord(media.caption, "Instagram video configure response.media.caption", 64);
  if (captionContainer.text !== caption || media.media_type !== 2) {
    throw new Error("Instagram video configure response did not bind the exact video");
  }
  return Object.freeze({
    code,
    mediaId,
    url: instagramVideoPermalink(code)
  });
}
function assertInstagramVideoDeleteAcknowledgement(value) {
  if (!isRecord3(value) || Object.keys(value).sort().join(",") !== "did_delete,status" || value.status !== "ok" || value.did_delete !== true)
    throw new Error("Instagram video deletion acknowledgement changed shape");
}

// src/providers/meta-facebook-group.ts
var MAX_TREE_NODES = 250000;
var MAX_TREE_DEPTH = 40;
var MAX_CONTAINER_ENTRIES = 1e4;
var MAX_PROVIDER_EDGES = 500;
var MAX_ACTORS = 20;
var FACEBOOK_GROUP_STREAM_KEY_PATTERN = /^adp_CometGroupDiscussionRootSuccessQueryRelayPreloader_[A-Za-z0-9_]{1,192}$/u;
var FACEBOOK_GROUP_STREAM_RESULT_PATH = Object.freeze([
  "require",
  "[]",
  "[]",
  "[]",
  "__bbox",
  "require",
  "[]",
  "[]",
  "[]",
  "__bbox",
  "result"
]);
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUnknownArray(value) {
  return Array.isArray(value);
}
function record(value, label) {
  if (!isRecord4(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys4(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    throw new Error(`${label} changed its reviewed fields`);
}
function boundedString(value, label, maximum, minimum = 1) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || /[\0]/u.test(value))
    throw new Error(`${label} must be a bounded string`);
  return value;
}
function optionalString(value, label, maximum) {
  if (value === undefined || value === null)
    return null;
  return boundedString(value, label, maximum, 0);
}
function decimalId(value, label, maximum = 32) {
  const id = boundedString(value, label, maximum);
  if (!/^[0-9]+$/u.test(id) || id === "0") {
    throw new Error(`${label} must be a stable decimal ID`);
  }
  return id;
}
function boundedInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative safe integer`);
  return value;
}
function exactBoolean(value, label) {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
function walk(roots, visit) {
  const stack = roots.map((value) => ({
    value,
    depth: 0,
    path: Object.freeze([])
  })).reverse();
  let nodes = 0;
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined)
      break;
    nodes += 1;
    if (nodes > MAX_TREE_NODES) {
      throw new Error("Facebook Group bootstrap exceeded its reviewed structural bound");
    }
    visit(item.value, item.path);
    if (item.depth >= MAX_TREE_DEPTH) {
      if (Array.isArray(item.value) && item.value.length > 0 || isRecord4(item.value) && Object.keys(item.value).length > 0) {
        throw new Error("Facebook Group bootstrap exceeded its reviewed depth bound");
      }
      continue;
    }
    if (Array.isArray(item.value)) {
      if (item.value.length > MAX_CONTAINER_ENTRIES) {
        throw new Error("Facebook Group bootstrap contained an oversized array");
      }
      for (let index = item.value.length - 1;index >= 0; index -= 1) {
        stack.push({
          value: item.value[index],
          depth: item.depth + 1,
          path: Object.freeze([...item.path, "[]"])
        });
      }
      continue;
    }
    if (!isRecord4(item.value))
      continue;
    const entries = Object.entries(item.value);
    if (entries.length > MAX_CONTAINER_ENTRIES) {
      throw new Error("Facebook Group bootstrap contained an oversized object");
    }
    for (let index = entries.length - 1;index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry === undefined)
        continue;
      stack.push({
        value: entry[1],
        depth: item.depth + 1,
        path: Object.freeze([...item.path, entry[0]])
      });
    }
  }
}
function pathEquals(value, expected) {
  return value.length === expected.length && value.every((segment, index) => segment === expected[index]);
}
function reviewedFacebookGroupStreamKey(roots, path, value) {
  if (!pathEquals(path, FACEBOOK_GROUP_STREAM_RESULT_PATH) || !isReviewedFacebookGroupRelayResultEnvelope(roots, path, value))
    return null;
  const keys = new Set;
  for (const root of roots) {
    if (!isRecord4(root) || !isUnknownArray(root.require))
      continue;
    for (const scheduled of root.require) {
      if (!isUnknownArray(scheduled) || scheduled.length !== 4 || scheduled[0] !== "ScheduledServerJS" || scheduled[1] !== "handle" || scheduled[2] !== null || !isUnknownArray(scheduled[3]))
        continue;
      for (const scheduledPayload of scheduled[3]) {
        if (!isRecord4(scheduledPayload) || !isRecord4(scheduledPayload.__bbox) || !isUnknownArray(scheduledPayload.__bbox.require))
          continue;
        for (const streamValue of scheduledPayload.__bbox.require) {
          if (!isUnknownArray(streamValue) || streamValue.length !== 4 || streamValue[0] !== "RelayPrefetchedStreamCache" || streamValue[1] !== "next" || !isUnknownArray(streamValue[2]) || streamValue[2].length !== 0 || !isUnknownArray(streamValue[3]) || streamValue[3].length !== 2 || typeof streamValue[3][0] !== "string" || !FACEBOOK_GROUP_STREAM_KEY_PATTERN.test(streamValue[3][0]))
            continue;
          const payload = streamValue[3][1];
          if (isRecord4(payload) && isRecord4(payload.__bbox) && payload.__bbox.result === value)
            keys.add(streamValue[3][0]);
        }
      }
    }
  }
  if (keys.size !== 1) {
    throw new Error("Facebook Group result did not bind exactly one reviewed preloader key");
  }
  return [...keys][0];
}
function assertEmptyProviderErrors(value, label) {
  if (!Object.hasOwn(value, "errors"))
    return;
  if (!Array.isArray(value.errors)) {
    throw new Error(`${label}.errors must be an array`);
  }
  if (value.errors.length > 0) {
    throw new Error(`${label} contained provider errors`);
  }
}
function assertExpectedGroup(value, expectedGroupId, label, requireTypename) {
  const group = record(value, label);
  if (requireTypename && group.__typename !== "Group") {
    throw new Error(`${label} must be a typed Group`);
  }
  if (group.__typename !== undefined && group.__typename !== "Group")
    throw new Error(`${label} changed its Group typename`);
  if (decimalId(group.id, `${label}.id`) !== expectedGroupId) {
    throw new Error(`${label} changed the requested Group target`);
  }
  return group;
}
function assertTypedGroupRoot(group, expectedGroupId) {
  if (group.__typename === "Group") {
    assertExpectedGroup(group, expectedGroupId, "Facebook Group feed root", true);
    return;
  }
  if (group.__typename !== undefined) {
    throw new Error("Facebook Group feed root changed its Group typename");
  }
  assertExpectedGroup(group.if_viewer_can_see_content, expectedGroupId, "Facebook Group feed root access marker", true);
}
function validatePlaceholder(value, index, expectedGroupId) {
  if (value === null)
    return null;
  const edge = record(value, `Facebook Group placeholder edge[${index}]`);
  exactKeys4(edge, ["cursor", "node"], `Facebook Group placeholder edge[${index}]`);
  const cursor = boundedString(edge.cursor, `Facebook Group placeholder edge[${index}].cursor`, 4096);
  const node = record(edge.node, `Facebook Group placeholder edge[${index}].node`);
  if (node.__typename !== "GroupsSectionHeaderUnit" || node.__isFeedUnit !== "GroupsSectionHeaderUnit") {
    throw new Error(`Facebook Group placeholder edge[${index}] changed its header-unit markers`);
  }
  const target = record(node.target_group, `Facebook Group placeholder edge[${index}].target_group`);
  if (target.__typename !== undefined && target.__typename !== "Group")
    throw new Error(`Facebook Group placeholder edge[${index}] changed its Group typename`);
  if (decimalId(target.id, `Facebook Group placeholder edge[${index}].target_group.id`) !== expectedGroupId)
    throw new Error(`Facebook Group placeholder edge[${index}] changed the requested Group target`);
  return cursor;
}
function rootPlaceholders(roots, expectedGroupId) {
  const candidates = [];
  walk(roots, (value, path) => {
    const streamKey2 = reviewedFacebookGroupStreamKey(roots, path, value);
    if (isRecord4(value) && streamKey2 !== null) {
      assertEmptyProviderErrors(value, "Facebook Group reviewed Relay envelope");
    }
    if (!isRecord4(value) || !isRecord4(value.data))
      return;
    const group2 = value.data.group;
    if (!isRecord4(group2) || !isRecord4(group2.group_feed))
      return;
    if (streamKey2 === null) {
      throw new Error("Facebook Group feed root appeared outside its reviewed Relay envelope");
    }
    assertEmptyProviderErrors(value, "Facebook Group feed envelope");
    candidates.push(Object.freeze({ group: group2, streamKey: streamKey2 }));
  });
  if (candidates.length !== 1) {
    throw new Error("Facebook Group response did not contain exactly one group-feed root");
  }
  const candidate = candidates[0];
  if (candidate === undefined)
    throw new Error("Facebook Group feed root disappeared");
  const { group, streamKey } = candidate;
  if (decimalId(group.id, "Facebook Group feed root.id") !== expectedGroupId) {
    throw new Error("Facebook Group feed root changed the requested Group target");
  }
  assertTypedGroupRoot(group, expectedGroupId);
  const feed = record(group.group_feed, "Facebook Group feed root.group_feed");
  exactKeys4(feed, ["edges"], "Facebook Group feed root.group_feed");
  if (!Array.isArray(feed.edges) || feed.edges.length > MAX_PROVIDER_EDGES) {
    throw new Error("Facebook Group placeholder edges must be a bounded array");
  }
  const cursors = [];
  const seenCursors = new Set;
  for (const [index, edge] of feed.edges.entries()) {
    const cursor = validatePlaceholder(edge, index, expectedGroupId);
    if (cursor === null)
      continue;
    if (seenCursors.has(cursor)) {
      throw new Error("Facebook Group placeholders contained a duplicate edge cursor");
    }
    seenCursors.add(cursor);
    cursors.push(cursor);
  }
  return {
    count: feed.edges.length,
    cursors: Object.freeze(cursors),
    streamKey
  };
}
function stream(roots, placeholderCount, expectedStreamKey) {
  const indexed = new Map;
  const pageInfoCandidates = [];
  let finalFragments = 0;
  let streamPhase = "before-root";
  walk(roots, (value, pathToValue) => {
    const streamKey = reviewedFacebookGroupStreamKey(roots, pathToValue, value);
    if (isRecord4(value) && isRecord4(value.data) && isRecord4(value.data.group) && isRecord4(value.data.group.group_feed) && streamKey !== null) {
      if (streamKey !== expectedStreamKey) {
        throw new Error("Facebook Group stream changed its bound preloader key");
      }
      if (streamPhase !== "before-root") {
        throw new Error("Facebook Group stream emitted its initial root out of order");
      }
      streamPhase = "edges";
    }
    if (!isRecord4(value) || !Array.isArray(value.path))
      return;
    const path = value.path;
    if (path[0] !== "group" || path[1] !== "group_feed")
      return;
    if (streamKey === null) {
      throw new Error("Facebook Group stream patch appeared outside its reviewed envelope");
    }
    if (streamKey !== expectedStreamKey) {
      throw new Error("Facebook Group stream changed its bound preloader key");
    }
    if (streamPhase !== "edges") {
      throw new Error("Facebook Group stream patch appeared outside its reviewed order");
    }
    assertEmptyProviderErrors(value, "Facebook Group stream envelope");
    const extensions = record(value.extensions, "Facebook Group stream extensions");
    if (typeof extensions.is_final !== "boolean") {
      throw new Error("Facebook Group stream extensions.is_final must be boolean");
    }
    if (extensions.is_final)
      finalFragments += 1;
    if (path.length === 4 && path[2] === "edges" && typeof path[3] === "number") {
      const index = path[3];
      if (!Number.isSafeInteger(index) || index < placeholderCount || index >= MAX_PROVIDER_EDGES)
        throw new Error("Facebook Group stream used an out-of-bounds edge index");
      if (extensions.is_final) {
        throw new Error("Facebook Group edge fragment unexpectedly ended the stream");
      }
      if (indexed.has(index)) {
        throw new Error("Facebook Group stream contained a duplicate edge index");
      }
      const edge = record(value.data, `Facebook Group streamed edge[${index}]`);
      exactKeys4(edge, ["cursor", "node"], `Facebook Group streamed edge[${index}]`);
      indexed.set(index, edge);
      return;
    }
    if (path.length === 2) {
      if (!extensions.is_final) {
        throw new Error("Facebook Group page-info fragment was not final");
      }
      streamPhase = "final";
      const data = record(value.data, "Facebook Group final stream data");
      exactKeys4(data, ["page_info"], "Facebook Group final stream data");
      pageInfoCandidates.push(record(data.page_info, "Facebook Group final page_info"));
      return;
    }
    throw new Error("Facebook Group stream used an unsupported group-feed path");
  });
  if (pageInfoCandidates.length !== 1 || finalFragments !== 1) {
    throw new Error("Facebook Group response did not contain exactly one final page-info fragment");
  }
  const edges = [...indexed.entries()].sort(([left], [right]) => left - right).map(([index, edge]) => Object.freeze({ index, edge }));
  if (edges.some((edge, index) => edge.index !== placeholderCount + index)) {
    throw new Error("Facebook Group stream edge indices were not contiguous");
  }
  const pageInfo = pageInfoCandidates[0];
  if (pageInfo === undefined)
    throw new Error("Facebook Group final page_info disappeared");
  exactKeys4(pageInfo, ["end_cursor", "has_next_page"], "Facebook Group final page_info");
  return {
    edges: Object.freeze(edges),
    hasNextPage: exactBoolean(pageInfo.has_next_page, "Facebook Group page_info.has_next_page"),
    endCursor: boundedString(pageInfo.end_cursor, "Facebook Group page_info.end_cursor", 4096)
  };
}
function actors(value, label) {
  if (value === undefined || value === null)
    return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_ACTORS) {
    throw new Error(`${label} must be a bounded actor array`);
  }
  const seen = new Set;
  const projected = value.map((actorValue, index) => {
    const actor = record(actorValue, `${label}[${index}]`);
    const id = actor.id === undefined || actor.id === null ? null : decimalId(actor.id, `${label}[${index}].id`);
    const name = optionalString(actor.name, `${label}[${index}].name`, 512);
    if (id === null && name === null) {
      throw new Error(`${label}[${index}] omitted both reviewed actor fields`);
    }
    if (id !== null && seen.has(id)) {
      throw new Error(`${label} contained a duplicate actor ID`);
    }
    if (id !== null)
      seen.add(id);
    return Object.freeze({ id, name });
  });
  return Object.freeze(projected);
}
function sameActors(left, right) {
  return left.length === right.length && left.every((actor, index) => {
    const candidate = right[index];
    return candidate !== undefined && actor.id === candidate.id && actor.name === candidate.name;
  });
}
function projectPost(edge, expectedGroupId) {
  const label = `Facebook Group streamed edge[${edge.index}]`;
  boundedString(edge.edge.cursor, `${label}.cursor`, 4096);
  const node = record(edge.edge.node, `${label}.node`);
  if (node.__typename !== "Story" || node.__isFeedUnit !== "Story") {
    throw new Error(`${label}.node changed its Story markers`);
  }
  const id = decimalId(node.post_id, `${label}.node.post_id`);
  const nodeId = boundedString(node.id, `${label}.node.id`, 256);
  assertExpectedGroup(node.to, expectedGroupId, `${label}.node.to`, true);
  const creationTime = boundedInteger(node.creation_time, `${label}.node.creation_time`);
  const outerActors = actors(node.actors, `${label}.node.actors`);
  const sections = record(node.comet_sections, `${label}.node.comet_sections`);
  const content = record(sections.content, `${label}.node.comet_sections.content`);
  const story = record(content.story, `${label}.node.comet_sections.content.story`);
  if (boundedString(story.id, `${label}.story.id`, 256) !== nodeId || decimalId(story.post_id, `${label}.story.post_id`) !== id)
    throw new Error(`${label} changed its nested Story identity`);
  const target = record(story.target_group, `${label}.story.target_group`);
  if (target.__typename !== undefined && target.__typename !== "Group")
    throw new Error(`${label}.story.target_group changed its Group typename`);
  if (decimalId(target.id, `${label}.story.target_group.id`) !== expectedGroupId) {
    throw new Error(`${label}.story changed the requested Group target`);
  }
  const innerActors = actors(story.actors, `${label}.story.actors`);
  if (outerActors.length > 0 && innerActors.length > 0 && !sameActors(outerActors, innerActors))
    throw new Error(`${label} changed its nested Story actors`);
  const messageRecord = story.message === undefined || story.message === null ? null : record(story.message, `${label}.story.message`);
  const message = messageRecord === null ? null : optionalString(messageRecord.text, `${label}.story.message.text`, 20000);
  return Object.freeze({
    id,
    creation_time: creationTime,
    message,
    actors: outerActors.length > 0 ? outerActors : innerActors
  });
}
function normalizeFacebookGroupFeedHtml(html, expectedViewerId, expectedGroupId, limit) {
  const viewerId = decimalId(expectedViewerId, "expected Facebook viewer ID");
  const groupId = decimalId(expectedGroupId, "expected Facebook Group ID");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) {
    throw new Error("Facebook Group feed limit must be an integer between 1 and 30");
  }
  const roots = parseMetaJsonScripts(html);
  if (parseFacebookViewerId(html) !== viewerId) {
    throw new Error("Facebook Group feed response changed its bound viewer");
  }
  assertMetaCometReadActor(roots, viewerId);
  const placeholders = rootPlaceholders(roots, groupId);
  const providerPage = stream(roots, placeholders.count, placeholders.streamKey);
  const seenPostIds = new Set;
  const seenCursors = new Set(placeholders.cursors);
  const posts = providerPage.edges.map((edge) => {
    const cursor = boundedString(edge.edge.cursor, `Facebook Group streamed edge[${edge.index}].cursor`, 4096);
    if (seenCursors.has(cursor)) {
      throw new Error("Facebook Group feed contained a duplicate edge cursor");
    }
    seenCursors.add(cursor);
    const post = projectPost(edge, groupId);
    if (seenPostIds.has(post.id)) {
      throw new Error("Facebook Group feed contained a duplicate post ID");
    }
    seenPostIds.add(post.id);
    return post;
  });
  const truncated = posts.length > limit;
  return Object.freeze({
    feed: "group",
    group_id: groupId,
    posts: Object.freeze(posts.slice(0, limit)),
    provider_has_next_page: providerPage.hasNextPage,
    next_cursor: null,
    continuation_supported: false,
    truncated,
    complete: !providerPage.hasNextPage && !truncated
  });
}

// src/providers/meta-marketplace-relay.ts
var FRIENDLY_NAME = "MarketplaceCometBrowseFeedLightPaginationQuery";
var REVIEWED_PAGINATION_DOC_ID = "27448592924790037";
var REVIEWED_CONTAINER_DOC_ID = "28097605446510041";
var TARGET_ID = "marketplace_home_feed";
var MAX_TREE_NODES2 = 250000;
var MAX_TREE_DEPTH2 = 40;
var MAX_CURSOR_HISTORY = 48;
var SHIPPING_ICON = "__relay_internal__pv__CometMarketplaceShouldShowFeedShippingIconrelayprovider";
var TOP_PICKS_STRIKETHROUGH = "__relay_internal__pv__CometMarketplaceShouldShowTopPicksStrikethroughrelayprovider";
var SPONSORED_FIELD_NAME = "__relay_internal__pv__GHLShouldChangeMarketplaceSponsoredDataFieldNamerelayprovider";
var AD_MODULE = "__relay_internal__pv__MarketplaceCometAdmodulerelayprovider";
var PRELOADER_VARIABLE_FIELDS = Object.freeze([
  SHIPPING_ICON,
  TOP_PICKS_STRIKETHROUGH,
  SPONSORED_FIELD_NAME,
  AD_MODULE,
  "buyLocation",
  "count",
  "cursor",
  "imageWidth",
  "mediaType",
  "radius",
  "scale",
  "sizing",
  "useSDFPath"
]);
var marketplacePaginationBindings = new WeakMap;
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUnknownArray2(value) {
  return Array.isArray(value);
}
function record2(value, label) {
  if (!isRecord5(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys5(value, keys, label) {
  const observed = Object.keys(value);
  const expected = new Set(keys);
  if (observed.length !== expected.size || observed.some((key) => !expected.has(key)))
    throw new Error(`${label} changed its reviewed fields`);
}
function boundedString2(value, label, minimum, maximum) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || /[\0\r\n]/u.test(value))
    throw new Error(`${label} must be bounded text`);
  return value;
}
function boundedInteger2(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${label} must be a bounded integer`);
  return value;
}
function boundedNumber(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error(`${label} must be a bounded finite number`);
  return value;
}
function boolean(value, label) {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
function isReviewedCometPlatformPreloaderPath(roots, path, candidate) {
  if (path.length !== 12 || typeof path[0] !== "number" || path[1] !== "require" || typeof path[2] !== "number" || path[3] !== 3 || typeof path[4] !== "number" || path[5] !== "__bbox" || path[6] !== "require" || typeof path[7] !== "number" || path[8] !== 3 || path[9] !== 0 || path[10] !== "expectedPreloaders" || typeof path[11] !== "number")
    return false;
  const root = roots[path[0]];
  if (!isRecord5(root) || !isUnknownArray2(root.require))
    return false;
  const scheduled = root.require[path[2]];
  if (!isUnknownArray2(scheduled) || scheduled.length !== 4 || scheduled[0] !== "ScheduledServerJS" || scheduled[1] !== "handle" || scheduled[2] !== null || !isUnknownArray2(scheduled[3]))
    return false;
  const scheduledPayload = scheduled[3][path[4]];
  if (!isRecord5(scheduledPayload) || !isRecord5(scheduledPayload.__bbox) || !isUnknownArray2(scheduledPayload.__bbox.require))
    return false;
  const platformRoot = scheduledPayload.__bbox.require[path[7]];
  if (!isUnknownArray2(platformRoot) || platformRoot.length !== 4 || platformRoot[0] !== "CometPlatformRootClient" || platformRoot[1] !== "initialize" || !isUnknownArray2(platformRoot[2]) || platformRoot[2].length !== 2 || platformRoot[2][0] !== "CometFBLoggedInRootConfig" || platformRoot[2][1] !== "RequireDeferredReference" || !isUnknownArray2(platformRoot[3]) || platformRoot[3].length !== 1)
    return false;
  const configuration = platformRoot[3][0];
  return isRecord5(configuration) && isUnknownArray2(configuration.expectedPreloaders) && configuration.expectedPreloaders[path[11]] === candidate;
}
function inputVariable(name, schema) {
  return Object.freeze({
    name,
    optional: false,
    source: Object.freeze({ kind: "input", key: name }),
    schema: Object.freeze(schema)
  });
}
var ALL_PROOFS = Object.freeze([
  Object.freeze({
    kind: "viewer",
    source: "bootstrap.viewer",
    sinks: Object.freeze(["access.viewer-id", "form.__user"])
  }),
  Object.freeze({
    kind: "actor",
    source: "bootstrap.actor",
    sinks: Object.freeze(["access.actor-id", "form.av"])
  }),
  Object.freeze({
    kind: "fb_dtsg",
    source: "bootstrap.fb_dtsg",
    sinks: Object.freeze(["form.fb_dtsg"])
  }),
  Object.freeze({
    kind: "jazoest",
    source: "derived.fb_dtsg-jazoest",
    sinks: Object.freeze(["form.jazoest"])
  }),
  Object.freeze({
    kind: "lsd",
    source: "bootstrap.lsd",
    sinks: Object.freeze(["form.lsd"])
  }),
  Object.freeze({
    kind: "client-revision",
    source: "bootstrap.client-revision",
    sinks: Object.freeze(["form.__rev"])
  }),
  Object.freeze({
    kind: "hsi",
    source: "bootstrap.hsi",
    sinks: Object.freeze(["form.__hsi"])
  }),
  Object.freeze({
    kind: "comet-environment",
    source: "bootstrap.comet-environment",
    sinks: Object.freeze(["form.__comet_req"])
  }),
  Object.freeze({
    kind: "request-counter",
    source: "session.request-counter",
    sinks: Object.freeze(["form.__req"])
  })
]);
var BOOLEAN_SCHEMA = Object.freeze({ kind: "boolean" });
var FACEBOOK_MARKETPLACE_PAGINATION_DESCRIPTOR = defineMetaOperationDescriptor(Object.freeze({
  schemaVersion: 1,
  id: "facebook-marketplace.feeds-read-pagination",
  platform: "facebook",
  kind: "query",
  operationType: "query",
  friendlyName: FRIENDLY_NAME,
  docId: REVIEWED_PAGINATION_DOC_ID,
  origin: META_RELAY_ORIGINS.facebook,
  method: "POST",
  path: "/api/graphql/",
  contract: Object.freeze({
    state: "observed",
    contractVersion: 1,
    evidenceId: "facebook-marketplace-pagination-2026-07-23"
  }),
  access: Object.freeze({ kind: "marketplace", actorBinding: "viewer" }),
  proofs: ALL_PROOFS,
  variables: Object.freeze({
    fields: Object.freeze([
      inputVariable(SHIPPING_ICON, BOOLEAN_SCHEMA),
      inputVariable(TOP_PICKS_STRIKETHROUGH, BOOLEAN_SCHEMA),
      inputVariable(SPONSORED_FIELD_NAME, BOOLEAN_SCHEMA),
      inputVariable(AD_MODULE, BOOLEAN_SCHEMA),
      inputVariable("buyLocation", Object.freeze({
        kind: "object",
        fields: Object.freeze([
          Object.freeze({
            name: "latitude",
            optional: false,
            schema: Object.freeze({ kind: "number", minimum: -90, maximum: 90 })
          }),
          Object.freeze({
            name: "longitude",
            optional: false,
            schema: Object.freeze({ kind: "number", minimum: -180, maximum: 180 })
          })
        ])
      })),
      Object.freeze({
        name: "count",
        optional: false,
        source: Object.freeze({ kind: "literal", value: 5 }),
        schema: Object.freeze({ kind: "literal", value: 5 })
      }),
      Object.freeze({
        name: "cursor",
        optional: true,
        source: Object.freeze({ kind: "pagination" }),
        schema: Object.freeze({ kind: "cursor" })
      }),
      inputVariable("imageWidth", Object.freeze({
        kind: "integer",
        minimum: 1,
        maximum: 4096
      })),
      Object.freeze({
        name: "includePDPRelevantListings",
        optional: false,
        source: Object.freeze({ kind: "literal", value: false }),
        schema: Object.freeze({ kind: "literal", value: false })
      }),
      inputVariable("mediaType", Object.freeze({
        kind: "enum",
        values: Object.freeze(["image/jpeg"])
      })),
      Object.freeze({
        name: "pdpListingId",
        optional: false,
        source: Object.freeze({ kind: "literal", value: "" }),
        schema: Object.freeze({ kind: "literal", value: "" })
      }),
      inputVariable("radius", Object.freeze({
        kind: "integer",
        minimum: 1,
        maximum: 1e7
      })),
      Object.freeze({
        name: "refinement",
        optional: false,
        source: Object.freeze({ kind: "literal", value: null }),
        schema: Object.freeze({ kind: "literal", value: null })
      }),
      inputVariable("scale", Object.freeze({
        kind: "integer",
        minimum: 1,
        maximum: 4
      })),
      inputVariable("sizing", Object.freeze({
        kind: "enum",
        values: Object.freeze(["cover-fill-cropped"])
      })),
      inputVariable("useSDFPath", BOOLEAN_SCHEMA)
    ])
  }),
  pagination: Object.freeze({ kind: "cursor", variableName: "cursor" }),
  responseRoots: Object.freeze([
    Object.freeze({
      kind: "query-data",
      path: Object.freeze(["data", "marketplace_home_feed"])
    })
  ])
}));
function candidatePreloaders(roots) {
  const candidates = [];
  for (const [index, value] of roots.entries()) {
    if (!isRecord5(value))
      continue;
    const root = value;
    if (!Object.hasOwn(root, "errors"))
      continue;
    if (!Array.isArray(root.errors)) {
      throw new Error(`Marketplace Relay root[${index}].errors must be an array`);
    }
    if (root.errors.length > 0) {
      throw new Error("Marketplace Relay preloader contained provider errors");
    }
  }
  const seen = new WeakSet;
  const stack = roots.map((value, index) => ({
    value,
    path: Object.freeze([index]),
    depth: 0
  }));
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined)
      break;
    nodes += 1;
    if (nodes > MAX_TREE_NODES2 || current.depth > MAX_TREE_DEPTH2) {
      throw new Error("Marketplace Relay preloader exceeded its reviewed structural bound");
    }
    const value = current.value;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      continue;
    }
    if (typeof value !== "object" || seen.has(value)) {
      throw new Error("Marketplace Relay preloader was not plain acyclic JSON");
    }
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > 1e4)
        throw new Error("Marketplace Relay preloader array exceeded its reviewed bound");
      for (let index = value.length - 1;index >= 0; index -= 1) {
        stack.push({
          value: value[index],
          path: Object.freeze([...current.path, index]),
          depth: current.depth + 1
        });
      }
      continue;
    }
    const source = record2(value, "Marketplace Relay preloader object");
    if (source.queryName === "MarketplaceCometBrowseFeedLightContainerQuery") {
      if (!isReviewedCometPlatformPreloaderPath(roots, current.path, source)) {
        throw new Error("Marketplace Relay preloader appeared outside its reviewed root");
      }
      candidates.push(source);
    }
    const entries = Object.entries(source);
    if (entries.length > 1e4)
      throw new Error("Marketplace Relay preloader object exceeded its reviewed bound");
    for (let index = entries.length - 1;index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry === undefined)
        continue;
      stack.push({
        value: entry[1],
        path: Object.freeze([...current.path, entry[0]]),
        depth: current.depth + 1
      });
    }
  }
  return Object.freeze(candidates);
}
function extractFacebookMarketplacePaginationInput(html, expectedViewerId) {
  if (parseFacebookViewerId(html) !== expectedViewerId) {
    throw new Error("Marketplace Relay preloader changed its bound viewer");
  }
  const candidates = candidatePreloaders(parseMetaJsonScripts(html));
  if (candidates.length !== 1) {
    throw new Error("Marketplace Relay preloader was missing or ambiguous");
  }
  const candidate = candidates[0];
  if (candidate === undefined)
    throw new Error("Marketplace Relay preloader was missing");
  exactKeys5(candidate, ["actorID", "preloaderID", "queryID", "queryName", "variables"], "Marketplace Relay preloader");
  if (candidate.actorID !== expectedViewerId) {
    throw new Error("Marketplace Relay preloader actor changed its bound viewer");
  }
  boundedString2(candidate.preloaderID, "Marketplace Relay preloader ID", 1, 512);
  if (typeof candidate.queryID !== "string" || !/^[1-9][0-9]{9,23}$/u.test(candidate.queryID))
    throw new Error("Marketplace Relay preloader query ID was malformed");
  if (candidate.queryID !== REVIEWED_CONTAINER_DOC_ID) {
    throw new Error("Marketplace Relay preloader query ID drifted from reviewed evidence");
  }
  if (candidate.queryName !== "MarketplaceCometBrowseFeedLightContainerQuery") {
    throw new Error("Marketplace Relay preloader query name drifted");
  }
  const variables = record2(candidate.variables, "Marketplace Relay preloader variables");
  exactKeys5(variables, PRELOADER_VARIABLE_FIELDS, "Marketplace Relay preloader variables");
  boundedInteger2(variables.count, "Marketplace Relay preloader count", 1, 100);
  if (variables.cursor !== null) {
    throw new Error("Marketplace Relay initial preloader unexpectedly contained a cursor");
  }
  const location = record2(variables.buyLocation, "Marketplace Relay buy location");
  exactKeys5(location, ["latitude", "longitude"], "Marketplace Relay buy location");
  return Object.freeze({
    [SHIPPING_ICON]: boolean(variables[SHIPPING_ICON], `Marketplace Relay ${SHIPPING_ICON}`),
    [TOP_PICKS_STRIKETHROUGH]: boolean(variables[TOP_PICKS_STRIKETHROUGH], `Marketplace Relay ${TOP_PICKS_STRIKETHROUGH}`),
    [SPONSORED_FIELD_NAME]: boolean(variables[SPONSORED_FIELD_NAME], `Marketplace Relay ${SPONSORED_FIELD_NAME}`),
    [AD_MODULE]: boolean(variables[AD_MODULE], `Marketplace Relay ${AD_MODULE}`),
    buyLocation: Object.freeze({
      latitude: boundedNumber(location.latitude, "Marketplace Relay latitude", -90, 90),
      longitude: boundedNumber(location.longitude, "Marketplace Relay longitude", -180, 180)
    }),
    imageWidth: boundedInteger2(variables.imageWidth, "Marketplace Relay image width", 1, 4096),
    mediaType: boundedString2(variables.mediaType, "Marketplace Relay media type", 1, 64),
    radius: boundedInteger2(variables.radius, "Marketplace Relay radius", 1, 1e7),
    scale: boundedInteger2(variables.scale, "Marketplace Relay scale", 1, 4),
    sizing: boundedString2(variables.sizing, "Marketplace Relay sizing", 1, 64),
    useSDFPath: boolean(variables.useSDFPath, "Marketplace Relay SDF path flag")
  });
}
function facebookMarketplaceAccess(viewerId) {
  return bindMetaAccessContext(FACEBOOK_MARKETPLACE_PAGINATION_DESCRIPTOR, Object.freeze({
    kind: "marketplace",
    platform: "facebook",
    viewerId,
    actorId: viewerId,
    targetId: TARGET_ID
  }));
}
function marketplacePaginationInputHash(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error("Marketplace pagination input hash was malformed");
  }
  return value;
}
function marketplaceProviderCursor(value, label) {
  const cursor = boundedString2(value, label, 1, 4096);
  if (!/^[\x20-\x7e]+$/u.test(cursor)) {
    throw new Error(`${label} must use the reviewed printable-ASCII cursor alphabet`);
  }
  return cursor;
}
function marketplaceCursorHash(cursor) {
  return Buffer.from(sha256(cursor), "hex").subarray(0, 16).toString("base64url");
}
function marketplaceCursorHistory(value, cursor) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CURSOR_HISTORY || value.some((item) => typeof item !== "string" || !/^[A-Za-z0-9_-]{22}$/u.test(item))) {
    throw new Error("Marketplace sealed cursor history was malformed");
  }
  const history = value;
  if (new Set(history).size !== history.length || history.at(-1) !== marketplaceCursorHash(cursor)) {
    throw new Error("Marketplace sealed cursor history changed its chain");
  }
  return Object.freeze([...history]);
}
function reviewedMarketplacePaginationInputHash(input) {
  if (input.mediaType !== "image/jpeg") {
    throw new Error("Marketplace Relay media type drifted from reviewed evidence");
  }
  if (input.sizing !== "cover-fill-cropped") {
    throw new Error("Marketplace Relay sizing drifted from reviewed evidence");
  }
  return sha256(canonicalJson(input));
}
function facebookMarketplacePaginationInputHash(html, viewerId) {
  return reviewedMarketplacePaginationInputHash(extractFacebookMarketplacePaginationInput(html, viewerId));
}
function bindFacebookMarketplacePaginationCursor(viewerId, cursor, inputHashValue, previous = null) {
  const access = facebookMarketplaceAccess(viewerId);
  const inputHash = marketplacePaginationInputHash(inputHashValue);
  const providerCursor = marketplaceProviderCursor(cursor, "Marketplace provider cursor");
  if (previous !== null) {
    if (!marketplacePaginationBindings.has(previous) || previous.inputHash !== inputHash) {
      throw new Error("Marketplace pagination cursor changed its feed input context");
    }
    if (previous.cursorHistory.length >= MAX_CURSOR_HISTORY) {
      throw new Error("Marketplace pagination cursor reached its reviewed chain bound");
    }
    if (previous.cursorHistory.includes(marketplaceCursorHash(providerCursor))) {
      throw new Error("Marketplace pagination cursor repeated an earlier page");
    }
  }
  const previousBinding = previous === null ? null : marketplacePaginationBindings.get(previous);
  if (previous !== null && previousBinding === undefined) {
    throw new Error("Marketplace pagination cursor was not issued by its feed binding policy");
  }
  const binding = bindMetaPaginationCursor(FACEBOOK_MARKETPLACE_PAGINATION_DESCRIPTOR, access, providerCursor, previousBinding ?? null);
  const result = Object.freeze({
    schemaVersion: 1,
    inputHash,
    descriptorKey: binding.descriptorKey,
    actorId: binding.actorId,
    targetId: binding.targetId,
    cursor: binding.cursor,
    cursorHistory: Object.freeze([
      ...previous?.cursorHistory ?? [],
      marketplaceCursorHash(binding.cursor)
    ])
  });
  marketplacePaginationBindings.set(result, binding);
  return result;
}
function reconstructFacebookMarketplacePaginationCursor(viewerId, value) {
  const candidate = record2(value, "Marketplace sealed pagination payload");
  exactKeys5(candidate, [
    "schemaVersion",
    "inputHash",
    "descriptorKey",
    "actorId",
    "targetId",
    "cursor",
    "cursorHistory"
  ], "Marketplace sealed pagination payload");
  if (candidate.schemaVersion !== 1) {
    throw new Error("Marketplace sealed pagination payload changed its schema");
  }
  const inputHash = marketplacePaginationInputHash(candidate.inputHash);
  if (candidate.descriptorKey !== metaOperationDescriptorKey(FACEBOOK_MARKETPLACE_PAGINATION_DESCRIPTOR) || candidate.actorId !== viewerId || candidate.targetId !== TARGET_ID) {
    throw new Error("Marketplace sealed pagination payload changed its bound coordinates");
  }
  const cursor = marketplaceProviderCursor(candidate.cursor, "Marketplace sealed cursor");
  const cursorHistory = marketplaceCursorHistory(candidate.cursorHistory, cursor);
  const binding = bindMetaPaginationCursor(FACEBOOK_MARKETPLACE_PAGINATION_DESCRIPTOR, facebookMarketplaceAccess(viewerId), cursor);
  const current = Object.freeze({
    schemaVersion: 1,
    inputHash,
    descriptorKey: binding.descriptorKey,
    actorId: binding.actorId,
    targetId: binding.targetId,
    cursor: binding.cursor,
    cursorHistory
  });
  if (current.descriptorKey !== candidate.descriptorKey || current.actorId !== candidate.actorId || current.targetId !== candidate.targetId) {
    throw new Error("Marketplace sealed pagination payload failed reconstruction");
  }
  marketplacePaginationBindings.set(current, binding);
  return current;
}
function facebookMarketplacePaginationCursorExhausted(value) {
  if (!marketplacePaginationBindings.has(value)) {
    throw new Error("Marketplace pagination cursor was not issued by its feed binding policy");
  }
  return value.cursorHistory.length >= MAX_CURSOR_HISTORY;
}
function buildFacebookMarketplacePaginationRequest(html, viewerId, paginationValue) {
  const access = facebookMarketplaceAccess(viewerId);
  const boundPagination = marketplacePaginationBindings.get(paginationValue);
  if (boundPagination === undefined) {
    throw new Error("Marketplace pagination cursor was not issued by its feed binding policy");
  }
  const input = extractFacebookMarketplacePaginationInput(html, viewerId);
  const currentInputHash = reviewedMarketplacePaginationInputHash(input);
  if (paginationValue.inputHash !== currentInputHash) {
    throw new Error("Marketplace pagination cursor changed its feed input context");
  }
  const pagination = assertMetaPaginationCursorBinding(FACEBOOK_MARKETPLACE_PAGINATION_DESCRIPTOR, access, boundPagination);
  return buildMetaRelayRequest(FACEBOOK_MARKETPLACE_PAGINATION_DESCRIPTOR, {
    input,
    access,
    pagination
  });
}

// src/providers/meta-web-runtime.ts
var ORIGINS = Object.freeze({
  instagram: "https://www.instagram.com",
  threads: "https://www.threads.com",
  facebook: "https://www.facebook.com",
  "facebook-page": "https://www.facebook.com",
  "facebook-group": "https://www.facebook.com",
  "facebook-marketplace": "https://www.facebook.com"
});
var MAX_BOOTSTRAP_BYTES = 12 * 1024 * 1024;
var MAX_API_BYTES = 8 * 1024 * 1024;
var MAX_META_RELAY_ASSETS = 16;
var MAX_META_RELAY_ASSET_BYTES = 3 * 1024 * 1024;
var MAX_THREADS_IMAGE_BYTES = 20 * 1024 * 1024;
var MAX_THREADS_VIDEO_BYTES = 1024 * 1024 * 1024;
var MAX_THREADS_UPLOAD_ACKNOWLEDGEMENT_BYTES = 16 * 1024;
var MARKETPLACE_CURSOR_SCOPE = "facebook-marketplace-feed";
var THREADS_WEB_APP_ID = "238260118697367";
var THREADS_ASBD_ID = "359341";
var INSTAGRAM_UPLOAD_ORIGIN = "https://i.instagram.com";
var INSTAGRAM_WEB_APP_ID2 = "936619743392459";
var INSTAGRAM_ASBD_ID = "359341";
function metaWebSessionDependencies(site, auth, dependencies) {
  if (site !== "threads" && site !== "instagram")
    return dependencies;
  const fallback = dependencies?.acquireCookies ?? acquireCookieRecords3;
  return {
    ...dependencies?.fetch === undefined ? {} : { fetch: dependencies.fetch },
    acquireCookies: (selection, target) => acquireWebSessionCookieRecords(auth, target, selection.timeoutMs, fallback)
  };
}
function isMetaSite(value) {
  return META_WEB_SITES.includes(value);
}
function operationContract(site, action) {
  if (!META_WEB_OPERATION_NAMES[site].includes(action))
    return null;
  const siteContracts = META_WEB_OPERATIONS[site];
  return siteContracts[action] ?? null;
}
function integerInput(input, name, fallback, minimum, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function exactStringInput(input, name, pattern, label) {
  const value = input[name];
  if (typeof value !== "string" || !pattern.test(value))
    throw new Error(`input.${name} must be ${label}`);
  return value;
}
function exactEnumInput(input, name, allowed) {
  const value = input[name];
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`input.${name} must be ${allowed.join(" or ")}`);
  }
  return value;
}
function optionalOpaqueCursor(input, name) {
  const value = input[name];
  if (value === undefined)
    return;
  if (typeof value !== "string" || value.length < 1 || value.length > 8192 || [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  }))
    throw new Error(`input.${name} must be an exact bounded opaque cursor`);
  return value;
}
function requireExactInputKeys(input, allowed) {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(input).filter((name) => !allowedKeys.has(name));
  if (unexpected.length > 0) {
    throw new Error(`input contains unsupported keys: ${unexpected.join(", ")}`);
  }
}
function htmlHeaders(origin) {
  return Object.freeze({
    accept: "text/html,application/xhtml+xml",
    referer: `${origin}/`
  });
}
function instagramHeaders(referer) {
  return Object.freeze({
    accept: "application/json, text/plain, */*",
    referer,
    "x-ig-app-id": INSTAGRAM_WEB_APP_ID2,
    "x-requested-with": "XMLHttpRequest"
  });
}
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function bootstrapConfig(html, moduleName) {
  const stack = [...parseMetaJsonScripts(html)];
  const matches = [];
  let visited = 0;
  while (stack.length > 0) {
    const value = stack.pop();
    visited += 1;
    if (visited > 250000)
      throw new Error("Meta bootstrap configuration exceeded its reviewed bound");
    if (Array.isArray(value)) {
      if (value[0] === moduleName && isRecord6(value[2]))
        matches.push(value[2]);
      for (const item of value)
        stack.push(item);
    } else if (isRecord6(value)) {
      for (const item of Object.values(value))
        stack.push(item);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`Meta bootstrap must contain one exact ${moduleName} configuration`);
  }
  return matches[0];
}
function threadsRequestConfig(html) {
  const bloks = bootstrapConfig(html, "WebBloksVersioningID");
  const sprinkle = bootstrapConfig(html, "SprinkleConfig");
  if (typeof bloks.versioningID !== "string" || !/^[a-f0-9]{64}$/u.test(bloks.versioningID))
    throw new Error("Threads bootstrap Web Bloks version is invalid");
  if (sprinkle.param_name !== "jazoest" || !Number.isSafeInteger(sprinkle.version) || sprinkle.version < 1 || sprinkle.version > 9 || sprinkle.should_randomize !== false)
    throw new Error("Threads bootstrap request-sprinkle configuration is invalid");
  return Object.freeze({
    bloksVersionId: bloks.versioningID,
    sprinkleParameter: "jazoest",
    sprinkleVersion: sprinkle.version
  });
}
function exactInstagramRolloutHash(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || /[^\x21-\x7e]/u.test(value))
    throw new Error("Instagram bootstrap rollout hash is invalid");
  return value;
}
function instagramVideoRequestConfig(html) {
  const pushInfo = bootstrapConfig(html, "InstagramWebPushInfo");
  return Object.freeze({
    rolloutHash: exactInstagramRolloutHash(pushInfo.rollout_hash)
  });
}
function instagramVideoMutationHeaders(csrfToken, config, contentType) {
  if (csrfToken.length < 1 || csrfToken.length > 512 || /[\0\r\n]/u.test(csrfToken))
    throw new Error("Instagram CSRF cookie is invalid");
  const rolloutHash = exactInstagramRolloutHash(config.rolloutHash);
  return Object.freeze({
    accept: "*/*",
    "content-type": contentType,
    origin: ORIGINS.instagram,
    referer: `${ORIGINS.instagram}/`,
    "x-asbd-id": INSTAGRAM_ASBD_ID,
    "x-csrftoken": csrfToken,
    "x-ig-app-id": INSTAGRAM_WEB_APP_ID2,
    "x-instagram-ajax": rolloutHash
  });
}
function threadsSprinkleValue(csrfToken, version) {
  if (csrfToken.length < 1 || csrfToken.length > 512 || /[\0\r\n]/u.test(csrfToken)) {
    throw new Error("Threads CSRF cookie is invalid");
  }
  let total = 0;
  for (const character of csrfToken)
    total += character.charCodeAt(0);
  return `${version}${total}`;
}
function threadsWebSessionId(seed) {
  const numeric = Number(seed);
  if (!Number.isSafeInteger(numeric))
    throw new Error("Threads upload ID is invalid");
  const pageId = (numeric % 36 ** 6).toString(36).padStart(6, "0");
  return `::${pageId}`;
}
function threadsApiHeaders(client, config, webSessionId, contentType) {
  return Object.freeze({
    accept: "*/*",
    "content-type": contentType,
    origin: ORIGINS.threads,
    referer: `${ORIGINS.threads}/`,
    "x-asbd-id": THREADS_ASBD_ID,
    "x-bloks-version-id": config.bloksVersionId,
    "x-csrftoken": webSessionCookie(client.cookies, "csrftoken"),
    "x-ig-app-id": THREADS_WEB_APP_ID,
    "x-instagram-ajax": "0",
    "x-web-session-id": webSessionId
  });
}
function fileInput(value, label = "input.attachment") {
  if (!isRecord6(value) || value.kind !== "file" || typeof value.reference !== "string" || Object.keys(value).sort().join(",") !== "kind,reference")
    throw new Error(`${label} must be one plan-bound file`);
  return Object.freeze({ kind: "file", reference: value.reference });
}
async function materializeThreadsImage(attachment, fileResolver, operationDeadline) {
  if (fileResolver === undefined) {
    throw new Error("Threads image upload requires the plan-bound file resolver");
  }
  const paths = operationDeadline === undefined ? await fileResolver([attachment]) : await operationDeadline.run(() => fileResolver([attachment]), "authenticated web operation deadline");
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("Threads file resolver did not return one exact path");
  }
  const noFollow = "O_NOFOLLOW" in constants3 ? constants3.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open2(paths[0], constants3.O_RDONLY | noFollow) : await operationDeadline.run(() => open2(paths[0], constants3.O_RDONLY | noFollow), "authenticated web operation deadline");
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 24 || before.size > MAX_THREADS_IMAGE_BYTES) {
      throw new Error("Threads image must be a regular PNG no larger than 20 MiB");
    }
    const bytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.byteLength !== before.size)
      throw new Error("Threads image changed while it was materialized");
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (signature.some((value, index) => bytes[index] !== value) || bytes.subarray(12, 16).toString("ascii") !== "IHDR")
      throw new Error("Threads image must be a PNG fixture");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 20000 || height > 20000) {
      throw new Error("Threads PNG dimensions are outside the reviewed bound");
    }
    return Object.freeze({
      bytes: new Uint8Array(bytes),
      height,
      mediaType: "image/png",
      width
    });
  } finally {
    await handle.close();
  }
}
async function materializeThreadsVideo(media, fileResolver, operationDeadline) {
  if (fileResolver === undefined) {
    throw new Error("Threads video upload requires the plan-bound file resolver");
  }
  const paths = operationDeadline === undefined ? await fileResolver([media]) : await operationDeadline.run(() => fileResolver([media]), "authenticated web operation deadline");
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("Threads file resolver did not return one exact path");
  }
  const noFollow = "O_NOFOLLOW" in constants3 ? constants3.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open2(paths[0], constants3.O_RDONLY | noFollow) : await operationDeadline.run(() => open2(paths[0], constants3.O_RDONLY | noFollow), "authenticated web operation deadline");
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 24 || before.size > MAX_THREADS_VIDEO_BYTES) {
      throw new Error("Threads video must be a regular MP4 no larger than 1 GiB");
    }
    const bytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.byteLength !== before.size)
      throw new Error("Threads video changed while it was materialized");
    const dimensions = isoBmffVideoDimensions(bytes, "Threads video");
    return Object.freeze({
      bytes: new Uint8Array(bytes),
      height: dimensions.height,
      mediaType: "video/mp4",
      width: dimensions.width
    });
  } finally {
    await handle.close();
  }
}
async function rootHtml(client, origin) {
  return client.requestText({
    url: new URL("/", origin),
    headers: htmlHeaders(origin),
    expectedContentTypes: ["text/html"],
    maxBytes: MAX_BOOTSTRAP_BYTES
  });
}
async function metaHtmlPath(client, origin, path, refererPath = "/") {
  return client.requestText({
    url: new URL(path, origin),
    headers: Object.freeze({
      accept: "text/html,application/xhtml+xml",
      referer: new URL(refererPath, origin).href
    }),
    expectedContentTypes: ["text/html"],
    maxBytes: MAX_BOOTSTRAP_BYTES
  });
}
async function resolveCurrentMetaRelayOperation(html, friendlyName, timeoutMs, dependencies, budget = {}) {
  const urls = extractMetaRelayBundleUrls(html);
  if (urls.length > MAX_META_RELAY_ASSETS) {
    throw new Error("Meta Relay bootstrap exposed too many executable bundle assets");
  }
  const texts = await Promise.all(urls.map((url) => fetchPublicWebAsset(new URL(url), {
    allowedOrigin: "https://static.xx.fbcdn.net",
    contentTypes: [
      "application/javascript",
      "application/x-javascript",
      "text/javascript"
    ],
    maxBytes: MAX_META_RELAY_ASSET_BYTES,
    timeoutMs,
    ...budget.signal === undefined ? {} : { signal: budget.signal },
    ...budget.operationDeadline === undefined ? {} : { operationDeadline: budget.operationDeadline },
    ...dependencies === undefined ? {} : { dependencies }
  })));
  const revision = resolveMetaRelayOperationRevision(texts, friendlyName);
  resolveMetaOperationDescriptor([{
    friendlyName: revision.friendlyName,
    docId: revision.docId,
    operationType: "query",
    origin: "https://www.facebook.com",
    method: "POST",
    path: "/api/graphql/"
  }], FACEBOOK_MARKETPLACE_PAGINATION_DESCRIPTOR);
}
async function executeFacebookMarketplaceContinuation(client, html, viewerId, cursor, limit, recipe, dependencies, budget = {}) {
  const bootstrap = bootstrapMetaComet(html, {
    parseMetaJsonScripts,
    expectedViewerId: viewerId,
    expectedActingId: viewerId
  });
  const request = buildFacebookMarketplacePaginationRequest(html, viewerId, cursor);
  const friendlyName = request.parameters.find(({ name }) => name === "fb_api_req_friendly_name")?.value;
  if (friendlyName === undefined) {
    throw new Error("Marketplace Relay request omitted its reviewed friendly name");
  }
  await resolveCurrentMetaRelayOperation(html, friendlyName, recipe.timeoutMs, dependencies, budget);
  const form = new URLSearchParams;
  form.set("__a", "1");
  form.set("fb_api_caller_class", "RelayModern");
  form.set("server_timestamps", "true");
  for (const parameter of request.parameters)
    form.set(parameter.name, parameter.value);
  const variablesText = form.get("variables");
  if (variablesText === null)
    throw new Error("Marketplace Relay request omitted variables");
  let variables;
  try {
    variables = JSON.parse(variablesText);
  } catch {
    throw new Error("Marketplace Relay request variables were malformed");
  }
  if (typeof variables !== "object" || variables === null || Array.isArray(variables) || !Number.isSafeInteger(variables.scale))
    throw new Error("Marketplace Relay request omitted its reviewed display scale");
  form.set("dpr", String(variables.scale));
  const writtenProofs = [];
  consumeMetaCometRequestProof(materializeMetaCometRequestProof(bootstrap, request), request, {
    sink: "network-request",
    write: (name, value) => {
      if (!request.proofFormFields.includes(name)) {
        throw new Error("Marketplace Relay proof escaped its descriptor-owned sink");
      }
      writtenProofs.push(name);
      form.set(name, value);
    }
  });
  if (writtenProofs.length !== request.proofFormFields.length || request.proofFormFields.some((name) => !writtenProofs.includes(name)))
    throw new Error("Marketplace Relay request omitted a descriptor-owned proof");
  const text = await client.requestText({
    url: new URL(request.path, request.origin),
    method: "POST",
    headers: Object.freeze({
      accept: "*/*",
      "content-type": "application/x-www-form-urlencoded",
      referer: "https://www.facebook.com/marketplace/"
    }),
    body: form.toString(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(recipe.maxOutputBytes, MAX_API_BYTES)
  });
  const documents = parseMetaJsonDocuments(text);
  const firstDocument = documents[0];
  if (firstDocument === undefined) {
    throw new Error("Marketplace Relay response omitted its descriptor-bound root document");
  }
  const response = assertMetaRelayResponseBinding(FACEBOOK_MARKETPLACE_PAGINATION_DESCRIPTOR, firstDocument);
  return normalizeFacebookMarketplaceFeedJsonDocuments(documents, cursor.cursor, limit, response.value);
}
function threadsUploadId(now) {
  const value = Math.trunc(now());
  const uploadId = String(value);
  if (!/^[1-9][0-9]{12}$/u.test(uploadId)) {
    throw new Error("Threads upload clock did not produce one canonical 13-digit ID");
  }
  return uploadId;
}
function instagramVideoUploadId(now) {
  const value = Math.trunc(now());
  const uploadId = String(value);
  if (!/^[1-9][0-9]{12}$/u.test(uploadId)) {
    throw new Error("Instagram upload clock did not produce one canonical 13-digit ID");
  }
  return uploadId;
}
function instagramVideoUploadRequestShape(snapshot, uploadId, csrfToken, config) {
  if (!/^[1-9][0-9]{12}$/u.test(uploadId) || !Number.isSafeInteger(snapshot.byteLength) || snapshot.byteLength < 24 || snapshot.byteLength > 128 * 1024 * 1024 || !Number.isSafeInteger(snapshot.durationMilliseconds) || snapshot.durationMilliseconds < 1 || snapshot.durationMilliseconds > 86400000 || !Number.isSafeInteger(snapshot.height) || snapshot.height < 1 || snapshot.height > 20000 || !Number.isSafeInteger(snapshot.width) || snapshot.width < 1 || snapshot.width > 20000 || snapshot.mediaType !== "video/mp4")
    throw new Error("Instagram upload request input is outside its reviewed bound");
  const entityName = `fb_uploader_${uploadId}`;
  return Object.freeze({
    url: new URL(`/rupload_igvideo/${entityName}`, INSTAGRAM_UPLOAD_ORIGIN).href,
    method: "POST",
    headers: Object.freeze({
      ...instagramVideoMutationHeaders(csrfToken, config, "video/mp4"),
      offset: "0",
      "x-entity-length": String(snapshot.byteLength),
      "x-entity-name": entityName,
      "x-instagram-rupload-params": JSON.stringify({
        "client-passthrough": "1",
        is_clips_video: "1",
        for_album: false,
        is_sidecar: "0",
        media_type: 2,
        upload_id: uploadId,
        upload_media_duration_ms: snapshot.durationMilliseconds,
        upload_media_height: snapshot.height,
        upload_media_width: snapshot.width,
        video_format: snapshot.mediaType,
        video_transform: null
      })
    })
  });
}
function instagramVideoThumbnailUploadRequestShape(thumbnail, uploadId, csrfToken, config) {
  if (!/^[1-9][0-9]{12}$/u.test(uploadId) || !Number.isSafeInteger(thumbnail.thumbnailByteLength) || thumbnail.thumbnailByteLength < 16 || thumbnail.thumbnailByteLength > 8 * 1024 * 1024 || !Number.isSafeInteger(thumbnail.thumbnailHeight) || thumbnail.thumbnailHeight < 1 || thumbnail.thumbnailHeight > 20000 || !Number.isSafeInteger(thumbnail.thumbnailWidth) || thumbnail.thumbnailWidth < 1 || thumbnail.thumbnailWidth > 20000 || thumbnail.thumbnailMediaType !== "image/jpeg")
    throw new Error("Instagram thumbnail upload request input is outside its reviewed bound");
  const entityName = `fb_uploader_${uploadId}`;
  return Object.freeze({
    url: new URL(`/rupload_igphoto/${entityName}`, INSTAGRAM_UPLOAD_ORIGIN).href,
    method: "POST",
    headers: Object.freeze({
      ...instagramVideoMutationHeaders(csrfToken, config, "image/jpeg"),
      offset: "0",
      "x-entity-length": String(thumbnail.thumbnailByteLength),
      "x-entity-name": entityName,
      "x-entity-type": "image/jpeg",
      "x-instagram-rupload-params": JSON.stringify({
        is_sidecar: "0",
        media_type: 1,
        upload_id: uploadId,
        upload_media_height: thumbnail.thumbnailHeight,
        upload_media_width: thumbnail.thumbnailWidth
      })
    })
  });
}
function exactInstagramConfigureInput(caption, uploadId) {
  if (typeof caption !== "string" || caption.length < 1 || caption.length > 1000 || /[\0\r]/u.test(caption))
    throw new Error("Instagram configure caption is outside its reviewed bound");
  if (!/^[1-9][0-9]{12}$/u.test(uploadId)) {
    throw new Error("Instagram configure upload ID is invalid");
  }
}
function instagramVideoConfigurePayload(caption, uploadId) {
  exactInstagramConfigureInput(caption, uploadId);
  return Object.freeze({
    archive_only: false,
    caption,
    clips_share_preview_to_feed: "1",
    disable_comments: "0",
    disable_oa_reuse: false,
    igtv_share_preview_to_feed: 1,
    is_meta_only_post: "0",
    is_unified_video: 1,
    like_and_view_counts_disabled: "0",
    media_share_flow: "creation_flow",
    share_to_facebook: "",
    share_to_fb_destination_type: "USER",
    source_type: "library",
    upload_id: uploadId,
    video_subtitles_enabled: "0"
  });
}
function instagramVideoConfigureForm(caption, uploadId) {
  const payload = instagramVideoConfigurePayload(caption, uploadId);
  const form = new URLSearchParams;
  for (const [name, value] of Object.entries(payload))
    form.set(name, String(value));
  form.set("signed_body", `SIGNATURE.${JSON.stringify(payload)}`);
  return form.toString();
}
function instagramConfigureDispatchDecision(status) {
  if (status === 200) {
    return Object.freeze({ kind: "inspect-terminal-envelope" });
  }
  if (status === 202) {
    return Object.freeze({ kind: "retain-indeterminate-dispatch" });
  }
  throw new Error("Instagram configure returned an unreviewed HTTP status");
}
function instagramVideoConfigureRequestShape(caption, uploadId, csrfToken, config) {
  return Object.freeze({
    body: instagramVideoConfigureForm(caption, uploadId),
    headers: instagramVideoMutationHeaders(csrfToken, config, "application/x-www-form-urlencoded;charset=UTF-8"),
    method: "POST",
    url: new URL("/api/v1/media/configure_to_clips/", ORIGINS.instagram).href
  });
}
function instagramVideoDeleteRequestShape(mediaId, csrfToken, config) {
  if (!/^[1-9][0-9]{0,31}_[1-9][0-9]{0,31}$/u.test(mediaId)) {
    throw new Error("Instagram deletion request media ID is invalid");
  }
  return Object.freeze({
    body: "",
    headers: instagramVideoMutationHeaders(csrfToken, config, "application/x-www-form-urlencoded;charset=UTF-8"),
    method: "POST",
    url: new URL(`/api/v1/web/create/${mediaId}/delete/`, ORIGINS.instagram).href
  });
}
function assertThreadsUploadAcknowledgement(value, uploadId) {
  if (!isRecord6(value) || Object.keys(value).sort().join(",") !== "status,upload_id" || value.status !== "ok" || value.upload_id !== uploadId)
    throw new Error("Threads upload acknowledgement did not bind the exact upload ID");
}
async function uploadThreadsImage(client, image, uploadId) {
  const entityName = `fb_uploader_${uploadId}`;
  const acknowledgement = await client.requestJson({
    url: new URL(`/rupload_igphoto/${entityName}`, ORIGINS.threads),
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": image.mediaType,
      offset: "0",
      origin: ORIGINS.threads,
      referer: `${ORIGINS.threads}/`,
      "x-entity-length": String(image.bytes.byteLength),
      "x-entity-name": entityName,
      "x-entity-type": image.mediaType,
      "x-ig-app-id": THREADS_WEB_APP_ID,
      "x-instagram-rupload-params": JSON.stringify({
        is_sidecar: "0",
        is_threads: "1",
        media_type: 1,
        upload_id: uploadId,
        upload_media_height: image.height,
        upload_media_width: image.width
      })
    },
    body: image.bytes,
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: MAX_THREADS_UPLOAD_ACKNOWLEDGEMENT_BYTES
  });
  assertThreadsUploadAcknowledgement(acknowledgement, uploadId);
  return Object.freeze({
    height: image.height,
    id: uploadId,
    mediaType: 1,
    sourceMediaType: image.mediaType,
    width: image.width
  });
}
async function uploadThreadsVideo(client, video, uploadId) {
  const entityName = `fb_uploader_${uploadId}`;
  const acknowledgement = await client.requestJson({
    url: new URL(`/rupload_igvideo/${entityName}`, ORIGINS.threads),
    method: "POST",
    headers: {
      accept: "*/*",
      "content-type": video.mediaType,
      offset: "0",
      origin: ORIGINS.threads,
      referer: `${ORIGINS.threads}/`,
      "x-entity-length": String(video.bytes.byteLength),
      "x-entity-name": entityName,
      "x-entity-type": video.mediaType,
      "x-ig-app-id": THREADS_WEB_APP_ID,
      "x-instagram-rupload-params": JSON.stringify({
        extract_cover_frame: "1",
        is_sidecar: "0",
        is_threads: "1",
        media_type: 2,
        upload_id: uploadId,
        upload_media_height: video.height,
        upload_media_width: video.width
      })
    },
    body: video.bytes,
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: MAX_THREADS_UPLOAD_ACKNOWLEDGEMENT_BYTES
  });
  assertThreadsUploadAcknowledgement(acknowledgement, uploadId);
  return Object.freeze({
    height: video.height,
    id: uploadId,
    mediaType: 2,
    sourceMediaType: video.mediaType,
    width: video.width
  });
}

class ThreadsCreateResponseError extends Error {
  category;
  constructor(category, message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ThreadsCreateResponseError";
    this.category = category;
  }
}
function threadsCreateRequestFailureCategory(error) {
  if (!(error instanceof Error))
    return "unexpected";
  if (error.message === "authenticated web API request failed before a reviewed response was received" || error.message.includes("authenticated web operation deadline") || error.message.includes("authenticated web operation timed out"))
    return "transport";
  const statusAndContentType = /^authenticated web API returned unreviewed status\/content type ([0-9]{3})\//u.exec(error.message);
  if (statusAndContentType !== null) {
    return statusAndContentType[1] === "200" ? "content-type" : "status";
  }
  if (error.message === "authenticated web API returned invalid UTF-8 JSON" || error.message === "authenticated web API returned malformed JSON")
    return "json";
  return "unexpected";
}
function threadsCreatedPost(value, viewerId, expectedBody, uploaded) {
  if (!isRecord6(value) || Object.keys(value).sort().join(",") !== "media,status" || value.status !== "ok" || !isRecord6(value.media)) {
    throw new ThreadsCreateResponseError("success-shape", "Threads create response did not match the reviewed success shape");
  }
  const minimalLocator = Object.keys(value.media).sort().join(",") === "code,permalink,pk";
  if (!minimalLocator && uploaded?.mediaType !== 2) {
    throw new ThreadsCreateResponseError("success-shape", "Threads create response did not match the reviewed success shape");
  }
  if (!minimalLocator) {
    try {
      const projected = projectThreadsPublishVideo(value.media, "Threads video create response media");
      const projectedUser = isRecord6(projected.user) ? projected.user : null;
      if (projected.caption !== expectedBody || projected.user === null || projectedUser?.id !== viewerId || projected.video === null || projected.video.mediaId !== projected.id || uploaded === null || projected.video.mediaType !== uploaded.mediaType || projected.video.width !== uploaded.width || projected.video.height !== uploaded.height || projected.canonical_url !== null && projected.canonical_url !== value.media.permalink) {
        throw new Error("unbound rich video response");
      }
    } catch {
      throw new ThreadsCreateResponseError("success-shape", "Threads video create response did not bind the confirmed actor, text, and media");
    }
  }
  const { code, permalink, pk } = value.media;
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(code) || typeof permalink !== "string" || permalink.length > 2048 || typeof pk !== "string" || !/^[0-9]{1,32}(?:_[0-9]{1,32})?$/u.test(pk)) {
    throw new ThreadsCreateResponseError("identifiers", "Threads create response returned invalid post identifiers");
  }
  let url;
  try {
    url = new URL(permalink);
  } catch {
    throw new ThreadsCreateResponseError("permalink", "Threads create response returned an unreviewed permalink");
  }
  const path = url.pathname.split("/");
  if (url.origin !== ORIGINS.threads || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || path.length !== 4 || !/^@[A-Za-z0-9._]{1,64}$/u.test(path[1] ?? "") || path[2] !== "post" || path[3] !== code) {
    throw new ThreadsCreateResponseError("permalink", "Threads create response returned an unreviewed permalink");
  }
  if (pk.includes("_") && !pk.endsWith(`_${viewerId}`)) {
    throw new ThreadsCreateResponseError("actor", "Threads create response changed the confirmed actor");
  }
  return Object.freeze({
    locator: Object.freeze({ code, id: pk, url: url.href }),
    media: uploaded === null ? null : Object.freeze({
      height: uploaded.height,
      mediaId: pk,
      mediaType: uploaded.mediaType,
      width: uploaded.width
    })
  });
}
function threadsTextPostAppInfo(body) {
  return JSON.stringify({
    excluded_inline_media_ids: "[]",
    is_genai_invocation_post: false,
    is_reply_approval_enabled: false,
    is_spoiler_media: false,
    text_with_entities: {
      entities: [],
      text: body
    }
  });
}
async function createThreadsPost(client, viewer, prepared, uploaded, config, uploadId) {
  const csrfToken = webSessionCookie(client.cookies, "csrftoken");
  const webSessionId = threadsWebSessionId(uploadId);
  const form = new URLSearchParams;
  form.set("audience", prepared.audience);
  form.set("caption", prepared.body);
  form.set("creator_geo_gating_info", JSON.stringify({ whitelist_country_codes: [] }));
  form.set("is_threads", "true");
  form.set("should_include_permalink", "true");
  form.set("text_post_app_info", threadsTextPostAppInfo(prepared.body));
  form.set("upload_id", uploadId);
  form.set("web_session_id", webSessionId);
  form.set(config.sprinkleParameter, threadsSprinkleValue(csrfToken, config.sprinkleVersion));
  let response;
  try {
    response = await client.requestJson({
      url: new URL("/api/v1/media/configure_text_post_app_feed/", ORIGINS.threads),
      method: "POST",
      headers: threadsApiHeaders(client, config, webSessionId, "application/x-www-form-urlencoded;charset=UTF-8"),
      body: form.toString(),
      expectedStatuses: [200],
      expectedContentTypes: ["application/json", "text/plain"],
      maxBytes: 256 * 1024
    });
  } catch (error) {
    throw new ThreadsCreateResponseError(threadsCreateRequestFailureCategory(error), "Threads create request did not return one reviewed response", { cause: error });
  }
  return threadsCreatedPost(response, viewer.id, prepared.body, uploaded);
}
function metaDispatchEvent(id, started, verified) {
  return { id, index: 1, progress: { planned: 1, started, verified } };
}
async function executeThreadsPost(client, viewer, prepared, options) {
  const image = prepared.attachment === undefined ? null : await materializeThreadsImage(prepared.attachment, options.fileResolver, options.operationDeadline);
  const uploadId = threadsUploadId(options.now);
  let started = 0;
  let verified = 0;
  let created = null;
  let failureStage = image === null ? "post create admission" : "image upload confirmation";
  try {
    const uploaded = image === null ? null : await uploadThreadsImage(client, image, uploadId);
    const dispatchViewer = await currentViewer("threads", client);
    if (dispatchViewer.subject !== viewer.subject) {
      throw new Error(image === null ? "Threads current viewer changed before the post dispatch" : "Threads current viewer changed after the image upload");
    }
    const config = threadsRequestConfig(dispatchViewer.rootHtml);
    await options.beforeDispatch?.(metaDispatchEvent("posts.publish", started, verified));
    started = 1;
    failureStage = "post create response";
    created = await createThreadsPost(client, dispatchViewer, prepared, uploaded, config, uploadId);
    const createdImage = created.media;
    failureStage = "accepted target retention";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "posts.publish",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: createdImage === null ? canonicalJson({
          code: created.locator.code,
          id: created.locator.id,
          url: created.locator.url
        }) : canonicalJson({
          code: created.locator.code,
          height: createdImage.height,
          id: created.locator.id,
          mediaType: createdImage.mediaType,
          remoteMediaId: createdImage.mediaId,
          url: created.locator.url,
          width: createdImage.width
        })
      }
    });
    failureStage = "permalink readback";
    const readbackHtml = await client.requestText({
      url: new URL(created.locator.url),
      method: "GET",
      headers: htmlHeaders(ORIGINS.threads),
      expectedContentTypes: ["text/html"],
      maxBytes: MAX_BOOTSTRAP_BYTES
    });
    const post = normalizeThreadsPostHtml(readbackHtml, dispatchViewer.id, created.locator.id, created.locator.code, created.locator.url, prepared.body, createdImage === null ? null : { height: createdImage.height, width: createdImage.width });
    if (createdImage === null) {
      if (post.image !== null) {
        throw new Error("Threads permalink readback introduced an unconfirmed image");
      }
    } else {
      const remoteImage = post.image;
      if (remoteImage === null || remoteImage.mediaId !== createdImage.mediaId || remoteImage.mediaType !== createdImage.mediaType || remoteImage.width !== createdImage.width || remoteImage.height !== createdImage.height)
        throw new Error("Threads permalink readback changed the response-bound image");
    }
    verified = 1;
    await options.afterDispatchVerified?.(metaDispatchEvent("posts.publish", started, verified));
    return {
      status: "succeeded",
      output: createdImage === null || post.image === null ? Object.freeze({ post }) : Object.freeze({
        post,
        attachment: Object.freeze({
          height: post.image.height,
          mediaType: "image/png",
          remoteMediaId: post.image.mediaId,
          verifiedBy: "permalink-readback",
          width: post.image.width
        })
      }),
      finalUrl: created.locator.url,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch (error) {
    const publicFailureStage = failureStage === "post create response" ? `${failureStage} (${error instanceof ThreadsCreateResponseError ? error.category : "unexpected"})` : failureStage;
    const verifiedSurfaces = image === null ? "exact actor, ID, code, text, and permalink readback" : "exact actor, ID, code, text, image, and permalink readback";
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: created?.locator.url ?? `${ORIGINS.threads}/`,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? `Threads may have accepted the ${image === null ? "post" : "image upload or post"} but ${verifiedSurfaces} was not verified; failure stage: ${publicFailureStage}; reconcile before retrying` : image === null ? "Threads post create failed before submission; retry with a fresh confirmed plan" : "Threads image upload failed before post submission; retry with a fresh confirmed plan"
    };
  }
}
async function executeThreadsVideo(client, viewer, prepared, options) {
  const video = await materializeThreadsVideo(prepared.media, options.fileResolver, options.operationDeadline);
  const uploadId = threadsUploadId(options.now);
  let started = 0;
  let verified = 0;
  let created = null;
  let failureStage = "video upload confirmation";
  try {
    const uploaded = await uploadThreadsVideo(client, video, uploadId);
    const dispatchViewer = await currentViewer("threads", client);
    if (dispatchViewer.subject !== viewer.subject) {
      throw new Error("Threads current viewer changed after the video upload");
    }
    const config = threadsRequestConfig(dispatchViewer.rootHtml);
    await options.beforeDispatch?.(metaDispatchEvent("media.publish", started, verified));
    started = 1;
    failureStage = "post create response";
    created = await createThreadsPost(client, dispatchViewer, prepared, uploaded, config, uploadId);
    const createdVideo = created.media;
    if (createdVideo === null || createdVideo.mediaType !== 2) {
      throw new Error("Threads create response changed the confirmed video media type");
    }
    failureStage = "accepted target retention";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "media.publish",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: canonicalJson({
          code: created.locator.code,
          height: createdVideo.height,
          id: created.locator.id,
          mediaType: createdVideo.mediaType,
          remoteMediaId: createdVideo.mediaId,
          url: created.locator.url,
          width: createdVideo.width
        })
      }
    });
    failureStage = "permalink readback";
    const readbackHtml = await client.requestText({
      url: new URL(created.locator.url),
      method: "GET",
      headers: htmlHeaders(ORIGINS.threads),
      expectedContentTypes: ["text/html"],
      maxBytes: MAX_BOOTSTRAP_BYTES
    });
    const post = normalizeThreadsVideoPostHtml(readbackHtml, dispatchViewer.id, created.locator.id, created.locator.code, created.locator.url, prepared.body, video);
    const remoteVideo = post.video;
    if (remoteVideo.mediaId !== createdVideo.mediaId || remoteVideo.mediaType !== createdVideo.mediaType || remoteVideo.width !== createdVideo.width || remoteVideo.height !== createdVideo.height)
      throw new Error("Threads permalink readback changed the response-bound video");
    verified = 1;
    await options.afterDispatchVerified?.(metaDispatchEvent("media.publish", started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({
        post,
        media: Object.freeze({
          durationSeconds: remoteVideo.durationSeconds,
          hasAudio: remoteVideo.hasAudio,
          height: remoteVideo.height,
          mediaType: video.mediaType,
          remoteMediaId: remoteVideo.mediaId,
          verifiedBy: "permalink-readback",
          width: remoteVideo.width
        })
      }),
      finalUrl: created.locator.url,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch (error) {
    const publicFailureStage = failureStage === "post create response" ? `${failureStage} (${error instanceof ThreadsCreateResponseError ? error.category : "unexpected"})` : failureStage;
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: created?.locator.url ?? `${ORIGINS.threads}/`,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? `Threads may have accepted the video or post but exact actor, ID, code, text, video, and permalink readback was not verified; failure stage: ${publicFailureStage}; reconcile before retrying` : "Threads video upload failed before post submission; retry with a fresh confirmed plan"
    };
  }
}
function isThreadsPublishedMediaTarget(target) {
  return "mediaType" in target;
}
function threadsPublishedMutationTargetDimension(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 20000) {
    throw new Error(`${label} must be an integer between 1 and 20000`);
  }
  return value;
}
function parseThreadsPublishedPermalink(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) {
    throw new Error("Threads provider-accepted post target returned an invalid permalink");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Threads provider-accepted post target returned an invalid permalink");
  }
  const path = url.pathname.split("/");
  if (url.origin !== ORIGINS.threads || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || path.length !== 4 || !/^@[A-Za-z0-9._]{1,64}$/u.test(path[1] ?? "") || path[2] !== "post" || path[3] !== code)
    throw new Error("Threads provider-accepted post target returned an invalid permalink");
  return url;
}
function parseThreadsPublishedMutationTarget(identifier) {
  let value;
  try {
    value = JSON.parse(identifier);
  } catch {
    throw new Error("Threads provider-accepted post target is not canonical JSON");
  }
  if (!isRecord6(value)) {
    throw new Error("Threads provider-accepted post target contained unsupported fields");
  }
  if (typeof value.id !== "string" || !/^[0-9]{1,32}(?:_[0-9]{1,32})?$/u.test(value.id)) {
    throw new Error("Threads provider-accepted post target returned invalid media identifiers");
  }
  if (typeof value.code !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(value.code)) {
    throw new Error("Threads provider-accepted post target returned an invalid post code");
  }
  const keys = Object.keys(value).sort().join(",");
  const url = parseThreadsPublishedPermalink(value.url, value.code);
  if (keys === "code,id,url") {
    const parsed2 = Object.freeze({ code: value.code, id: value.id, url: url.href });
    if (canonicalJson(parsed2) !== identifier) {
      throw new Error("Threads provider-accepted post target is not canonical");
    }
    return parsed2;
  }
  if (keys !== "code,height,id,mediaType,remoteMediaId,url,width") {
    throw new Error("Threads provider-accepted post target contained unsupported fields");
  }
  if (typeof value.remoteMediaId !== "string" || value.remoteMediaId !== value.id) {
    throw new Error("Threads provider-accepted post target returned invalid media identifiers");
  }
  if (value.mediaType !== 1 && value.mediaType !== 2) {
    throw new Error("Threads provider-accepted post target did not identify one reviewed media item");
  }
  const parsed = Object.freeze({
    code: value.code,
    height: threadsPublishedMutationTargetDimension(value.height, "Threads provider-accepted post target height"),
    id: value.id,
    mediaType: value.mediaType,
    remoteMediaId: value.remoteMediaId,
    url: url.href,
    width: threadsPublishedMutationTargetDimension(value.width, "Threads provider-accepted post target width")
  });
  if (canonicalJson(parsed) !== identifier) {
    throw new Error("Threads provider-accepted post target is not canonical");
  }
  return parsed;
}
async function readThreadsWebPublishedMutationTarget(recipe, input, auth, identifier, options = {}) {
  const isPostPublish = recipe.site === "threads" && recipe.action === "posts.publish" && (recipe.contractVersion === 4 || recipe.contractVersion === 5);
  const isVideoPublish = recipe.site === "threads" && recipe.action === "media.publish" && recipe.contractVersion === 1;
  if (!isPostPublish && !isVideoPublish) {
    throw new Error("Threads publish recovery supports only posts.publish@4, posts.publish@5, or media.publish@1");
  }
  const target = parseThreadsPublishedMutationTarget(identifier);
  const prepared = prepareMetaRead(recipe, input, auth, Object.freeze({}));
  if (isPostPublish && prepared.kind !== "threads-post" || isVideoPublish && prepared.kind !== "threads-video") {
    throw new Error("Threads publish recovery input did not match its exact media contract");
  }
  if (prepared.kind !== "threads-post" && prepared.kind !== "threads-video") {
    throw new Error("Threads publish recovery input did not match its exact media contract");
  }
  const mediaTarget = isThreadsPublishedMediaTarget(target) ? target : null;
  if (prepared.kind === "threads-post" && (recipe.contractVersion === 4 && prepared.attachment === undefined || prepared.attachment !== undefined !== (mediaTarget !== null) || mediaTarget !== null && mediaTarget.mediaType !== 1)) {
    throw new Error("Threads publish recovery target did not bind the confirmed media input");
  }
  if (prepared.kind === "threads-video" && (mediaTarget === null || mediaTarget.mediaType !== 2)) {
    throw new Error("Threads publish recovery target did not bind the confirmed media input");
  }
  const expectedSubject = expectedMetaAuthSubject("threads", auth);
  const viewerId = expectedSubject.slice("threads:".length);
  const dependencies = metaWebSessionDependencies("threads", auth, options.dependencies);
  const client = await createWebSessionClient(ORIGINS.threads, auth, {
    timeoutMs: recipe.timeoutMs,
    ...dependencies === undefined ? {} : { dependencies }
  });
  if (webSessionCookie(client.cookies, "ds_user_id") !== viewerId) {
    throw new Error("Threads account cookie did not match the confirmed auth subject");
  }
  const html = await client.requestText({
    url: new URL(target.url),
    method: "GET",
    headers: htmlHeaders(ORIGINS.threads),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(recipe.maxOutputBytes, MAX_BOOTSTRAP_BYTES)
  });
  if (prepared.kind === "threads-video") {
    if (mediaTarget === null || mediaTarget.mediaType !== 2) {
      throw new Error("Threads publish recovery target did not bind the confirmed media input");
    }
    const post = normalizeThreadsVideoPostHtml(html, viewerId, target.id, target.code, target.url, prepared.body, { height: mediaTarget.height, width: mediaTarget.width });
    const media = post.video;
    if (media === null || media.mediaId !== mediaTarget.remoteMediaId || media.mediaType !== mediaTarget.mediaType || media.width !== mediaTarget.width || media.height !== mediaTarget.height)
      throw new Error("Threads publish recovery readback changed the accepted media");
  } else {
    const post = normalizeThreadsPostHtml(html, viewerId, target.id, target.code, target.url, prepared.body, mediaTarget === null ? null : { height: mediaTarget.height, width: mediaTarget.width });
    const media = post.image;
    if (mediaTarget !== null) {
      if (media === null || media.mediaId !== mediaTarget.remoteMediaId || media.mediaType !== mediaTarget.mediaType || media.width !== mediaTarget.width || media.height !== mediaTarget.height)
        throw new Error("Threads publish recovery readback changed the accepted media");
    } else if (media !== null) {
      throw new Error("Threads publish recovery readback introduced unconfirmed media");
    }
  }
  return Object.freeze({ present: true, postId: target.id });
}
function facebookMarketplaceAuthHash(auth) {
  return sha256(canonicalJson(auth));
}
function expectedFacebookViewerId(auth) {
  const subject = webSessionAuthSubject(auth);
  const prefix = "facebook:user:";
  const id = subject?.startsWith(prefix) === true ? subject.slice(prefix.length) : null;
  if (!isCanonicalMetaNumericId(id)) {
    throw new Error("Facebook Marketplace pagination requires an exact bound Facebook viewer subject");
  }
  return id;
}
function expectedMetaAuthSubject(site, auth) {
  const subject = webSessionAuthSubject(auth);
  const prefix = site === "instagram" ? "instagram:" : site === "threads" ? "threads:" : "facebook:user:";
  if (subject === null || !subject.startsWith(prefix) || !isCanonicalMetaNumericId(subject.slice(prefix.length))) {
    throw new Error(`${site} authenticated operations require an exact bound viewer subject`);
  }
  return subject;
}
function openFacebookMarketplaceCursor(token, auth, environment) {
  const cursor = reconstructFacebookMarketplacePaginationCursor(expectedFacebookViewerId(auth), openCursorToken(MARKETPLACE_CURSOR_SCOPE, auth.id, facebookMarketplaceAuthHash(auth), token, environment));
  if (facebookMarketplacePaginationCursorExhausted(cursor)) {
    throw new Error("Marketplace pagination cursor reached its reviewed chain bound");
  }
  return cursor;
}
function sealFacebookMarketplaceFeed(feed, html, viewerId, auth, previous, environment) {
  if (feed.next_cursor === null)
    return feed;
  const cursor = bindFacebookMarketplacePaginationCursor(viewerId, feed.next_cursor, facebookMarketplacePaginationInputHash(html, viewerId), previous);
  if (facebookMarketplacePaginationCursorExhausted(cursor)) {
    return Object.freeze({
      ...feed,
      next_cursor: null,
      continuation_supported: false,
      complete: false
    });
  }
  return Object.freeze({
    ...feed,
    next_cursor: sealCursorToken(MARKETPLACE_CURSOR_SCOPE, auth.id, facebookMarketplaceAuthHash(auth), cursor, environment)
  });
}
async function currentViewer(site, client) {
  const html = await rootHtml(client, ORIGINS[site]);
  if (site === "instagram") {
    const id2 = parseInstagramViewerId(html);
    if (webSessionCookie(client.cookies, "ds_user_id") !== id2) {
      throw new Error("Instagram Polaris viewer did not match the selected browser session");
    }
    return Object.freeze({ id: id2, subject: `instagram:${id2}`, rootHtml: html });
  }
  if (site === "threads") {
    const id2 = parseThreadsViewerId(html);
    if (webSessionCookie(client.cookies, "ds_user_id") !== id2) {
      throw new Error("Threads Barcelona viewer did not match the selected browser session");
    }
    return Object.freeze({ id: id2, subject: `threads:${id2}`, rootHtml: html });
  }
  const id = parseFacebookViewerId(html);
  if (webSessionCookie(client.cookies, "c_user") !== id) {
    throw new Error("Facebook CurrentUserInitialData did not match the selected browser session");
  }
  return Object.freeze({ id, subject: `facebook:user:${id}`, rootHtml: html });
}
async function probeMetaWebSubject(site, auth, options = {}) {
  const dependencies = metaWebSessionDependencies(site, auth, options.dependencies);
  const client = await createWebSessionClient(ORIGINS[site], auth, {
    timeoutMs: options.timeoutMs ?? 60000,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...dependencies === undefined ? {} : { dependencies }
  });
  return (await currentViewer(site, client)).subject;
}
async function requireBoundViewer(site, client, expectedSubject) {
  const subjectPrefix = site === "instagram" ? "instagram:" : site === "threads" ? "threads:" : "facebook:user:";
  const cookieName = site === "instagram" || site === "threads" ? "ds_user_id" : "c_user";
  const expectedCookieValue = expectedSubject.slice(subjectPrefix.length);
  if (webSessionCookie(client.cookies, cookieName) !== expectedCookieValue) {
    throw new Error(`${site} account cookie did not match the confirmed auth subject`);
  }
  const viewer = await currentViewer(site, client);
  if (viewer.subject !== expectedSubject) {
    throw new Error(`${site} current viewer no longer matches the confirmed auth subject`);
  }
  return viewer;
}
var INSTAGRAM_REMOVED_TITLE = "Page not found \u2022 Instagram";
var INSTAGRAM_REMOVED_MAIN_TEXT = "Sorry, this page isn't available.";
var INSTAGRAM_REMOVED_DETAIL_TEXT = "The link you followed may be broken, or the page may have been removed.";
var INSTAGRAM_REMOVED_BACK_LINK_TEXT = "Go back to Instagram.";
function instagramHtmlTitle(source) {
  const matches = [...source.matchAll(/<title(?:\s[^>]*)?>([^<]*)<\/title>/giu)];
  if (matches.length !== 1) {
    throw new Error("Instagram permalink response did not contain one exact HTML title");
  }
  return (matches[0]?.[1] ?? "").replaceAll("&bull;", "\u2022").replaceAll("&#8226;", "\u2022").replaceAll("&#x2022;", "\u2022").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}
function instagramVideoPermalinkWasRemoved(html) {
  if (typeof html !== "string" || html.length < 1 || Buffer.byteLength(html, "utf8") > MAX_API_BYTES)
    throw new Error("Instagram permalink response exceeded its reviewed HTML bound");
  const title = instagramHtmlTitle(html);
  if (title !== INSTAGRAM_REMOVED_TITLE)
    return false;
  if (!html.includes(INSTAGRAM_REMOVED_MAIN_TEXT) || !html.includes(INSTAGRAM_REMOVED_DETAIL_TEXT) || !html.includes(INSTAGRAM_REMOVED_BACK_LINK_TEXT))
    throw new Error("Instagram permalink removal marker changed shape");
  return true;
}
async function readInstagramVideoAcceptedMutationTargetPresence(recipe, input, auth, identifier, options = {}) {
  const isPublish = recipe.site === "instagram" && recipe.action === "media.publish" && recipe.contractVersion === 3;
  const isDelete = recipe.site === "instagram" && recipe.action === "content.delete" && recipe.contractVersion === 2;
  if (!isPublish && !isDelete) {
    throw new Error("Instagram video accepted-target readback supports only media.publish@3 or content.delete@2");
  }
  const target = parseInstagramVideoAcceptedTargetIdentifier(identifier);
  const expectedCaption = isPublish ? prepareInstagramVideoPublishInput(input).caption : prepareInstagramAuthoredPostDeleteInput(input).expectedCaption;
  if (isDelete) {
    const deletion = prepareInstagramAuthoredPostDeleteInput(input);
    if (deletion.mediaId !== target.mediaId) {
      throw new Error("Instagram deletion accepted target did not bind the confirmed media ID");
    }
  }
  const expectedSubject = expectedMetaAuthSubject("instagram", auth);
  const client = await createWebSessionClient(ORIGINS.instagram, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const viewer = await requireBoundViewer("instagram", client, expectedSubject);
  const permalink = await client.requestText({
    url: new URL(target.url),
    method: "GET",
    headers: htmlHeaders(ORIGINS.instagram),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(recipe.maxOutputBytes, MAX_API_BYTES)
  });
  if (instagramVideoPermalinkWasRemoved(permalink)) {
    return Object.freeze({
      code: target.code,
      mediaId: target.mediaId,
      present: false
    });
  }
  const response = await client.requestJson({
    url: new URL(`/api/v1/media/${target.mediaId}/info/`, ORIGINS.instagram),
    method: "GET",
    headers: instagramHeaders(target.url),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: Math.min(recipe.maxOutputBytes, MAX_API_BYTES)
  });
  const normalized = normalizeInstagramPost(response, target.mediaId);
  bindInstagramVideoMediaReadback(normalized, {
    expectedCaption,
    expectedCode: target.code,
    mediaId: target.mediaId,
    viewerId: viewer.id
  });
  return Object.freeze({
    code: target.code,
    mediaId: target.mediaId,
    present: true
  });
}
function exactInstagramMediaId(input) {
  return exactStringInput(input, "media_id", /^[0-9]{1,32}(?:_[0-9]{1,32})?$/u, "an exact Instagram media ID");
}
function prepareMetaRead(recipe, input, auth, environment) {
  if (recipe.site === "instagram") {
    if (recipe.action === "media.publish") {
      prepareInstagramVideoPublishInput(input);
      return Object.freeze({ kind: "instagram-video", input });
    }
    if (recipe.action === "content.delete") {
      const deletion = prepareInstagramAuthoredPostDeleteInput(input);
      return Object.freeze({
        kind: "instagram-video-delete",
        expectedCaption: deletion.expectedCaption,
        mediaId: deletion.mediaId
      });
    }
    if (recipe.action === "profiles.read") {
      requireExactInputKeys(input, ["profile"]);
      return Object.freeze({
        kind: "instagram-profile",
        profile: exactStringInput(input, "profile", /^[a-z0-9._]{1,30}$/u, "one canonical lowercase Instagram handle")
      });
    }
    if (recipe.action === "contacts.list") {
      requireExactInputKeys(input, ["contact_limit", "thread_limit"]);
      return Object.freeze({
        kind: "instagram-contacts",
        threadLimit: integerInput(input, "thread_limit", 20, 1, 50),
        contactLimit: integerInput(input, "contact_limit", 50, 1, 100)
      });
    }
    if (recipe.action === "feeds.read") {
      requireExactInputKeys(input, ["feed", "limit"]);
      exactEnumInput(input, "feed", ["home"]);
      return Object.freeze({
        kind: "instagram-feed",
        limit: integerInput(input, "limit", 20, 1, 30)
      });
    }
    if (recipe.action === "posts.read" || recipe.action === "media.read") {
      requireExactInputKeys(input, ["media_id"]);
      return Object.freeze({
        kind: "instagram-media",
        mediaId: exactInstagramMediaId(input)
      });
    }
    if (recipe.action === "comments.read") {
      requireExactInputKeys(input, ["limit", "media_id"]);
      const mediaId = exactInstagramMediaId(input);
      return Object.freeze({
        kind: "instagram-comments",
        mediaId,
        limit: integerInput(input, "limit", 20, 1, 50)
      });
    }
    if (recipe.action === "messaging.list") {
      requireExactInputKeys(input, ["folder", "limit"]);
      exactEnumInput(input, "folder", ["inbox"]);
      return Object.freeze({
        kind: "instagram-inbox",
        limit: integerInput(input, "limit", 20, 1, 50)
      });
    }
  }
  if (recipe.site === "threads" && recipe.action === "profiles.read") {
    requireExactInputKeys(input, ["profile"]);
    return Object.freeze({
      kind: "threads-profile",
      profile: exactStringInput(input, "profile", /^[a-z0-9._]{1,30}$/u, "one canonical lowercase Threads handle")
    });
  }
  if (recipe.site === "threads" && recipe.action === "feeds.read") {
    requireExactInputKeys(input, ["feed", "limit"]);
    exactEnumInput(input, "feed", ["for-you"]);
    return Object.freeze({
      kind: "threads-feed",
      limit: integerInput(input, "limit", 20, 1, 30)
    });
  }
  if (recipe.site === "threads" && recipe.action === "posts.publish") {
    requireExactInputKeys(input, ["attachment", "audience", "body"]);
    const body = input.body;
    if (typeof body !== "string" || body.length < 1 || body.length > 450 || /[\0\r]/u.test(body))
      throw new Error("input.body must be 1 to 450 bounded UTF-16 code units");
    const audience = input.audience === undefined ? "default" : exactEnumInput(input, "audience", ["default"]);
    return Object.freeze({
      kind: "threads-post",
      ...input.attachment === undefined ? {} : { attachment: fileInput(input.attachment) },
      audience,
      body
    });
  }
  if (recipe.site === "threads" && recipe.action === "media.publish") {
    requireExactInputKeys(input, ["audience", "body", "media"]);
    const body = input.body;
    if (typeof body !== "string" || body.length < 1 || body.length > 450 || /[\0\r]/u.test(body))
      throw new Error("input.body must be 1 to 450 bounded UTF-16 code units");
    if (input.media === undefined) {
      throw new Error("reviewed Threads media.publish requires one MP4 video");
    }
    const audience = input.audience === undefined ? "default" : exactEnumInput(input, "audience", ["default"]);
    return Object.freeze({
      kind: "threads-video",
      audience,
      body,
      media: fileInput(input.media, "input.media")
    });
  }
  if (recipe.site === "facebook" && recipe.action === "feeds.read") {
    requireExactInputKeys(input, ["feed", "limit"]);
    exactEnumInput(input, "feed", ["home"]);
    return Object.freeze({
      kind: "facebook-feed",
      limit: integerInput(input, "limit", 20, 1, 30)
    });
  }
  if (recipe.site === "facebook-group" && recipe.action === "feeds.read") {
    requireExactInputKeys(input, ["feed", "group_id", "limit"]);
    exactEnumInput(input, "feed", ["group"]);
    return Object.freeze({
      kind: "facebook-group-feed",
      groupId: exactStringInput(input, "group_id", /^[1-9][0-9]{0,31}$/u, "an exact nonzero numeric Facebook Group ID"),
      limit: integerInput(input, "limit", 20, 1, 30)
    });
  }
  if (recipe.site === "facebook-marketplace" && recipe.action === "feeds.read") {
    requireExactInputKeys(input, ["cursor", "feed", "limit"]);
    exactEnumInput(input, "feed", ["marketplace"]);
    const token = optionalOpaqueCursor(input, "cursor");
    const cursor = token === undefined ? undefined : openFacebookMarketplaceCursor(token, auth, environment);
    return Object.freeze({
      kind: "facebook-marketplace-feed",
      ...cursor === undefined ? {} : { cursor },
      limit: integerInput(input, "limit", cursor === undefined ? 30 : 50, 1, 50)
    });
  }
  if (recipe.site === "facebook-marketplace" && recipe.action === "listings.read") {
    requireExactInputKeys(input, ["listing_id"]);
    return Object.freeze({
      kind: "facebook-marketplace-listing",
      listingId: exactStringInput(input, "listing_id", /^[1-9][0-9]{0,31}$/u, "an exact nonzero Marketplace listing ID")
    });
  }
  throw new Error(`${recipe.site} authenticated web operation ${recipe.action} has no executable reviewed contract`);
}
async function executeInstagramRead(prepared, client, viewerId, maximumBytes) {
  const maxBytes = Math.min(maximumBytes, MAX_API_BYTES);
  if (prepared.kind === "instagram-feed") {
    const url = new URL("/api/v1/feed/timeline/", ORIGINS.instagram);
    url.searchParams.set("count", String(prepared.limit));
    const response = await client.requestJson({
      url,
      method: "GET",
      headers: instagramHeaders(`${ORIGINS.instagram}/`),
      maxBytes
    });
    return normalizeInstagramFeed(response, prepared.limit);
  }
  if (prepared.kind === "instagram-media") {
    const response = await client.requestJson({
      url: new URL(`/api/v1/media/${prepared.mediaId}/info/`, ORIGINS.instagram),
      method: "GET",
      headers: instagramHeaders(`${ORIGINS.instagram}/`),
      maxBytes
    });
    return normalizeInstagramPost(response, prepared.mediaId);
  }
  if (prepared.kind === "instagram-comments") {
    const url = new URL(`/api/v1/media/${prepared.mediaId}/comments/`, ORIGINS.instagram);
    url.searchParams.set("can_support_threading", "true");
    url.searchParams.set("permalink_enabled", "false");
    const response = await client.requestJson({
      url,
      method: "GET",
      headers: instagramHeaders(`${ORIGINS.instagram}/`),
      maxBytes
    });
    return normalizeInstagramComments(response, prepared.mediaId, prepared.limit);
  }
  if (prepared.kind === "instagram-inbox" || prepared.kind === "instagram-contacts") {
    const url = new URL("/api/v1/direct_v2/inbox/", ORIGINS.instagram);
    const threadLimit = prepared.kind === "instagram-inbox" ? prepared.limit : prepared.threadLimit;
    url.searchParams.set("limit", String(threadLimit));
    url.searchParams.set("thread_message_limit", "1");
    url.searchParams.set("persistentBadging", "true");
    url.searchParams.set("visual_message_return_type", "unseen");
    const response = await client.requestJson({
      url,
      method: "GET",
      headers: instagramHeaders(`${ORIGINS.instagram}/direct/inbox/`),
      maxBytes
    });
    return prepared.kind === "instagram-inbox" ? normalizeInstagramInbox(response, viewerId, prepared.limit) : normalizeInstagramContacts(response, viewerId, prepared.threadLimit, prepared.contactLimit);
  }
  const exhaustive = prepared;
  throw new Error(`Instagram authenticated web operation ${exhaustive.kind} is not reviewed`);
}
function instagramProfileBrowserFailure(error) {
  if (error instanceof InstagramProfileBrowserResponseRejectedError) {
    return new ProviderReadResponseRejectedError(error.status);
  }
  if (error instanceof InstagramProfileBrowserFailure && (error.category === "startup" || error.category === "execution-context" || error.category === "provider-fetch"))
    return new ProviderReadTransportError(error);
  return error;
}
async function executeInstagramProfileRead(recipe, prepared, auth, expectedSubject, finalUrl, options) {
  let failureStage = "identity";
  let transport = null;
  try {
    const createTransport = options.dependencies?.createInstagramProfileBrowserTransport ?? createInstagramProfileBrowserTransport;
    transport = await createTransport(auth, {
      timeoutMs: recipe.timeoutMs,
      maxOutputBytes: MAX_BOOTSTRAP_BYTES,
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
    });
    const viewerId = parseInstagramViewerId(await transport.readCurrentViewerHtml());
    if (`instagram:${viewerId}` !== expectedSubject) {
      throw new Error("instagram current viewer no longer matches the confirmed auth subject");
    }
    failureStage = "target";
    const response = await transport.readProfileJson(prepared.profile);
    const output = normalizeInstagramProfileStats(response, viewerId, prepared.profile, new Date((options.dependencies?.now ?? Date.now)()).toISOString());
    return {
      status: "succeeded",
      output,
      finalUrl,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }
    };
  } catch (error) {
    if (error instanceof PreservedBrowserArtifactsError)
      throw error;
    const projected = instagramProfileBrowserFailure(error);
    return failedProviderRead("Instagram profile", projected, finalUrl, {
      stage: failureStage,
      authenticated: true,
      accountMismatch: (candidate) => candidate.message.includes("current viewer no longer matches the confirmed auth subject") || candidate.message.includes("profile response did not bind the current viewer ID") || candidate.message.includes("profile response did not bind the requested handle"),
      authRepairRequired: (candidate) => candidate instanceof InstagramProfileBrowserFailure && candidate.category === "authwall"
    });
  } finally {
    await transport?.close();
  }
}
function instagramMutationDispatchEvent(id, started, verified) {
  return Object.freeze({
    id,
    index: 1,
    progress: Object.freeze({ planned: 1, started, verified })
  });
}
async function readInstagramAuthoredVideoTarget(client, recipe, viewerId, mediaId, expectedCaption) {
  const response = await client.requestJson({
    url: new URL(`/api/v1/media/${mediaId}/info/`, ORIGINS.instagram),
    method: "GET",
    headers: instagramHeaders(`${ORIGINS.instagram}/`),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: Math.min(recipe.maxOutputBytes, MAX_API_BYTES)
  });
  return bindInstagramVideoMediaReadback(normalizeInstagramPost(response, mediaId), { expectedCaption, mediaId, viewerId });
}
async function instagramBlobBytes(body, expectedLength, label) {
  const bytes = new Uint8Array(await body.arrayBuffer());
  if (bytes.byteLength !== expectedLength) {
    throw new Error(`Instagram ${label} dispatch body changed length`);
  }
  return bytes;
}
async function executeInstagramVideoPublish(client, viewer, recipe, input, auth, options) {
  const bound = await materializeInstagramVideoPublishInput(input, options.fileResolver, options.operationDeadline);
  const snapshot = revalidateInstagramVideoPublishBindingForDispatch(bound);
  const uploadId = instagramVideoUploadId(options.now);
  const config = instagramVideoRequestConfig(viewer.rootHtml);
  const csrfToken = webSessionCookie(client.cookies, "csrftoken");
  const uploadClient = await createWebSessionClient(INSTAGRAM_UPLOAD_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  if (webSessionCookie(uploadClient.cookies, "ds_user_id") !== viewer.id) {
    throw new Error("Instagram upload session did not bind the confirmed viewer");
  }
  let started = 0;
  let verified = 0;
  let failureStage = "dispatch-admission";
  let target = null;
  try {
    await options.beforeDispatch?.(instagramMutationDispatchEvent("media.publish", started, verified));
    started = 1;
    failureStage = "video-upload";
    const videoRequest = instagramVideoUploadRequestShape(snapshot, uploadId, csrfToken, config);
    const videoBytes = await instagramBlobBytes(snapshot.body, snapshot.byteLength, "video");
    try {
      const acknowledgement = await uploadClient.requestJson({
        url: new URL(videoRequest.url),
        method: videoRequest.method,
        headers: videoRequest.headers,
        body: videoBytes,
        expectedStatuses: [200],
        expectedContentTypes: ["application/json"],
        maxBytes: 16 * 1024
      });
      assertInstagramVideoUploadAcknowledgement(acknowledgement);
    } finally {
      videoBytes.fill(0);
    }
    failureStage = "thumbnail-upload";
    const thumbnailRequest = instagramVideoThumbnailUploadRequestShape(snapshot, uploadId, csrfToken, config);
    const thumbnailBytes = await instagramBlobBytes(snapshot.thumbnailBody, snapshot.thumbnailByteLength, "thumbnail");
    try {
      const acknowledgement = await uploadClient.requestJson({
        url: new URL(thumbnailRequest.url),
        method: thumbnailRequest.method,
        headers: thumbnailRequest.headers,
        body: thumbnailBytes,
        expectedStatuses: [200],
        expectedContentTypes: ["application/json"],
        maxBytes: 16 * 1024
      });
      assertInstagramVideoUploadAcknowledgement(acknowledgement);
    } finally {
      thumbnailBytes.fill(0);
    }
    failureStage = "account-revalidation";
    const reboundViewer = await requireBoundViewer("instagram", client, viewer.subject);
    failureStage = "configure";
    const configureRequest = instagramVideoConfigureRequestShape(snapshot.caption, uploadId, csrfToken, config);
    const configure = await client.requestJsonResponse({
      url: new URL(configureRequest.url),
      method: configureRequest.method,
      headers: configureRequest.headers,
      body: configureRequest.body,
      expectedStatuses: [200, 202],
      expectedContentTypes: ["application/json"],
      maxBytes: Math.min(recipe.maxOutputBytes, MAX_API_BYTES)
    });
    if (configure.status === 202) {
      assertInstagramVideoConfigureIndeterminate(configure.value);
      throw new Error("Instagram configure remains indeterminate after its one allowed POST");
    }
    target = parseInstagramVideoConfigureAccepted(configure.value, {
      caption: snapshot.caption,
      uploadId,
      viewerId: reboundViewer.id
    });
    failureStage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "media.publish",
      index: 1,
      target: Object.freeze({
        schemaVersion: 1,
        identifier: instagramVideoAcceptedTargetIdentifier(target)
      })
    });
    failureStage = "publication-readback";
    await readInstagramAuthoredVideoTarget(client, recipe, reboundViewer.id, target.mediaId, snapshot.caption);
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(instagramMutationDispatchEvent("media.publish", started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({
        published: true,
        target,
        media: Object.freeze({
          byteLength: snapshot.byteLength,
          durationMilliseconds: snapshot.durationMilliseconds,
          height: snapshot.height,
          mediaType: snapshot.mediaType,
          sha256: snapshot.mediaSha256,
          thumbnailByteLength: snapshot.thumbnailByteLength,
          thumbnailMediaType: snapshot.thumbnailMediaType,
          thumbnailSha256: snapshot.thumbnailSha256,
          width: snapshot.width
        })
      }),
      finalUrl: target.url,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: target?.url ?? ORIGINS.instagram,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? `Instagram may have accepted the exact video publish, but its response-derived target and independent readback were not both verified; reconcile before retrying (stage: ${failureStage})` : `Instagram video publication failed before remote submission (stage: ${failureStage})`
    };
  }
}
async function executeInstagramVideoDelete(client, viewer, recipe, prepared, options) {
  const initial = await readInstagramAuthoredVideoTarget(client, recipe, viewer.id, prepared.mediaId, prepared.expectedCaption);
  const reboundViewer = await requireBoundViewer("instagram", client, viewer.subject);
  const fresh = await readInstagramAuthoredVideoTarget(client, recipe, reboundViewer.id, prepared.mediaId, prepared.expectedCaption);
  if (instagramVideoAcceptedTargetIdentifier(initial) !== instagramVideoAcceptedTargetIdentifier(fresh)) {
    throw new Error("Instagram deletion target changed between its exact pre-reads");
  }
  const config = instagramVideoRequestConfig(reboundViewer.rootHtml);
  const csrfToken = webSessionCookie(client.cookies, "csrftoken");
  const request = instagramVideoDeleteRequestShape(fresh.mediaId, csrfToken, config);
  let started = 0;
  let verified = 0;
  let failureStage = "dispatch-admission";
  try {
    await options.beforeDispatch?.(instagramMutationDispatchEvent("content.delete", started, verified));
    started = 1;
    failureStage = "bound-target-recording";
    await options.afterProviderBoundMutationTarget?.({
      id: "content.delete",
      index: 1,
      target: Object.freeze({
        schemaVersion: 1,
        identifier: instagramVideoAcceptedTargetIdentifier(fresh)
      })
    });
    failureStage = "delete-transport";
    const acknowledgement = await client.requestJson({
      url: new URL(request.url),
      method: request.method,
      headers: request.headers,
      body: request.body,
      expectedStatuses: [200],
      expectedContentTypes: ["application/json"],
      maxBytes: 16 * 1024
    });
    assertInstagramVideoDeleteAcknowledgement(acknowledgement);
    failureStage = "account-revalidation";
    await requireBoundViewer("instagram", client, reboundViewer.subject);
    failureStage = "deletion-readback";
    const permalink = await client.requestText({
      url: new URL(fresh.url),
      method: "GET",
      headers: htmlHeaders(ORIGINS.instagram),
      expectedContentTypes: ["text/html"],
      maxBytes: Math.min(recipe.maxOutputBytes, MAX_API_BYTES)
    });
    if (!instagramVideoPermalinkWasRemoved(permalink)) {
      throw new Error("Instagram deleted-video permalink did not return its removal marker");
    }
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(instagramMutationDispatchEvent("content.delete", started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({ deleted: true, target: fresh }),
      finalUrl: fresh.url,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: fresh.url,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? `Instagram may have deleted the exact authored video, but its fixed soft-200 removal marker was not verified; reconcile before retrying (stage: ${failureStage})` : `Instagram video deletion failed before remote submission (stage: ${failureStage})`
    };
  }
}
async function executeMetaWebOperationInternal(recipe, input, auth, options = {}) {
  if (!isMetaSite(recipe.site)) {
    throw new Error("Meta authenticated web recipe is not installed");
  }
  const contract = operationContract(recipe.site, recipe.action);
  if (contract === null)
    throw new Error(`Meta authenticated web operation ${recipe.action} is not registered`);
  if (recipe.contractVersion !== contract.contractVersion) {
    throw new Error(`${recipe.site} authenticated web operation ${recipe.action} contract version ${recipe.contractVersion} is not installed`);
  }
  if (contract.state !== "observed") {
    throw new Error(`${recipe.site} authenticated web operation ${recipe.action} is capture-required: ${contract.reason}`);
  }
  const isThreadsMutation = recipe.site === "threads" && (recipe.action === "posts.publish" || recipe.action === "media.publish");
  const isInstagramMutation = recipe.site === "instagram" && recipe.action === "content.delete";
  if (!isThreadsMutation && !isInstagramMutation && (contract.risk !== "R1" || contract.effect !== "read")) {
    throw new Error(`${recipe.site} reviewed Meta runtime refuses non-read execution`);
  }
  if (!isThreadsMutation && !isInstagramMutation) {
    options.beforeDispatch;
    options.afterProviderAcceptedMutationTarget;
    options.afterProviderBoundMutationTarget;
    options.afterDispatchVerified;
  }
  const environment = options.environment ?? process.env;
  const prepared = prepareMetaRead(recipe, input, auth, environment);
  const statisticsRead = prepared.kind === "instagram-profile" || prepared.kind === "threads-profile";
  const origin = ORIGINS[recipe.site];
  const statisticsFinalUrl = prepared.kind === "instagram-profile" ? `${origin}/${prepared.profile}/` : prepared.kind === "threads-profile" ? new URL(`/@${encodeURIComponent(prepared.profile)}`, origin).href : null;
  let expectedSubject;
  try {
    expectedSubject = expectedMetaAuthSubject(recipe.site, auth);
  } catch (error) {
    if (!statisticsRead)
      throw error;
    return failedProviderRead(`${recipe.site} profile`, error, statisticsFinalUrl, {
      stage: "bootstrap",
      authenticated: true,
      authRepairRequired: (candidate) => candidate.message.includes("auth subject")
    });
  }
  if (prepared.kind === "instagram-profile") {
    return executeInstagramProfileRead(recipe, prepared, auth, expectedSubject, `${origin}/${prepared.profile}/`, {
      ...options.dependencies === undefined ? {} : { dependencies: options.dependencies },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.publishCleanupResource === undefined ? {} : { publishCleanupResource: options.publishCleanupResource }
    });
  }
  const dependencies = metaWebSessionDependencies(recipe.site, auth, options.dependencies);
  let threadsAccountCookieState = Object.freeze({
    cookies: Object.freeze([]),
    tombstones: Object.freeze([])
  });
  let client;
  try {
    client = await createWebSessionClient(origin, auth, {
      timeoutMs: recipe.timeoutMs,
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...dependencies === undefined ? {} : { dependencies },
      ...isThreadsMutation ? {
        cookieRotation: {
          allowedNames: Object.freeze(["ds_user_id"]),
          cachedState: threadsAccountCookieState,
          maxCachedCookieAgeSeconds: 60,
          tombstoneTtlSeconds: 60,
          save: (state) => {
            threadsAccountCookieState = state;
          }
        }
      } : {}
    });
  } catch (error) {
    if (!statisticsRead)
      throw error;
    return failedProviderRead(`${recipe.site} profile`, error, statisticsFinalUrl, {
      stage: "bootstrap",
      authenticated: true
    });
  }
  let viewer;
  try {
    viewer = await requireBoundViewer(recipe.site, client, expectedSubject);
  } catch (error) {
    if (!statisticsRead)
      throw error;
    return failedProviderRead(`${recipe.site} profile`, error, statisticsFinalUrl, {
      stage: "identity",
      authenticated: true,
      accountMismatch: (candidate) => candidate.message.includes("no longer matches") || candidate.message.includes("did not match the confirmed auth subject") || candidate.message.includes("did not match the selected browser session"),
      authRepairRequired: (candidate) => candidate.message.includes("cookie") || candidate instanceof ThreadsAuthRepairRequiredError
    });
  }
  if (prepared.kind === "threads-profile") {
    try {
      const profilePath3 = `/@${encodeURIComponent(prepared.profile)}`;
      const profileHtml = await metaHtmlPath(client, origin, profilePath3);
      let recentViews = normalizeThreadsRecentViewsAvailability("<main></main>");
      try {
        const insightsHtml = await metaHtmlPath(client, origin, "/insights", profilePath3);
        recentViews = normalizeThreadsRecentViewsAvailability(insightsHtml);
      } catch (error) {
        let cause = error;
        for (let depth = 0;depth < 8 && cause !== undefined; depth += 1) {
          if (cause instanceof OperationDeadlineError)
            throw cause;
          cause = cause instanceof Error ? cause.cause : undefined;
        }
        options.operationDeadline?.throwIfUnavailable("Threads insights supplemental read");
      }
      const output2 = normalizeThreadsProfileStats(profileHtml, viewer.id, prepared.profile, recentViews, new Date((options.dependencies?.now ?? Date.now)()).toISOString());
      return {
        status: "succeeded",
        output: output2,
        finalUrl: statisticsFinalUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    } catch (error) {
      return failedProviderRead("Threads profile", error, statisticsFinalUrl, {
        stage: "target",
        authenticated: true,
        accountMismatch: (candidate) => candidate.message.includes("response changed its bound viewer") || candidate.message.includes("did not bind the current viewer ID")
      });
    }
  }
  if (prepared.kind === "instagram-video") {
    return executeInstagramVideoPublish(client, viewer, recipe, prepared.input, auth, {
      ...options.fileResolver === undefined ? {} : { fileResolver: options.fileResolver },
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.beforeDispatch === undefined ? {} : { beforeDispatch: options.beforeDispatch },
      ...options.afterProviderAcceptedMutationTarget === undefined ? {} : {
        afterProviderAcceptedMutationTarget: options.afterProviderAcceptedMutationTarget
      },
      ...options.afterDispatchVerified === undefined ? {} : { afterDispatchVerified: options.afterDispatchVerified },
      ...dependencies === undefined ? {} : { dependencies },
      now: options.dependencies?.now ?? Date.now
    });
  }
  if (prepared.kind === "instagram-video-delete") {
    return executeInstagramVideoDelete(client, viewer, recipe, prepared, {
      ...options.beforeDispatch === undefined ? {} : { beforeDispatch: options.beforeDispatch },
      ...options.afterProviderBoundMutationTarget === undefined ? {} : {
        afterProviderBoundMutationTarget: options.afterProviderBoundMutationTarget
      },
      ...options.afterDispatchVerified === undefined ? {} : { afterDispatchVerified: options.afterDispatchVerified }
    });
  }
  if (prepared.kind === "threads-post") {
    return executeThreadsPost(client, viewer, prepared, {
      ...options.fileResolver === undefined ? {} : { fileResolver: options.fileResolver },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.beforeDispatch === undefined ? {} : { beforeDispatch: options.beforeDispatch },
      ...options.afterProviderAcceptedMutationTarget === undefined ? {} : {
        afterProviderAcceptedMutationTarget: options.afterProviderAcceptedMutationTarget
      },
      ...options.afterDispatchVerified === undefined ? {} : { afterDispatchVerified: options.afterDispatchVerified },
      now: options.dependencies?.now ?? Date.now
    });
  }
  if (prepared.kind === "threads-video") {
    return executeThreadsVideo(client, viewer, prepared, {
      ...options.fileResolver === undefined ? {} : { fileResolver: options.fileResolver },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.beforeDispatch === undefined ? {} : { beforeDispatch: options.beforeDispatch },
      ...options.afterProviderAcceptedMutationTarget === undefined ? {} : {
        afterProviderAcceptedMutationTarget: options.afterProviderAcceptedMutationTarget
      },
      ...options.afterDispatchVerified === undefined ? {} : { afterDispatchVerified: options.afterDispatchVerified },
      now: options.dependencies?.now ?? Date.now
    });
  }
  let output;
  let finalUrl = `${origin}/`;
  if (prepared.kind === "instagram-feed" || prepared.kind === "instagram-media" || prepared.kind === "instagram-comments" || prepared.kind === "instagram-inbox" || prepared.kind === "instagram-contacts") {
    const instagramResponse = await executeInstagramRead(prepared, client, viewer.id, recipe.maxOutputBytes);
    output = instagramResponse;
    if (prepared.kind === "instagram-inbox" || prepared.kind === "instagram-contacts") {
      finalUrl = `${origin}/direct/inbox/`;
    }
  } else if (prepared.kind === "threads-feed") {
    output = normalizeThreadsFeedHtml(viewer.rootHtml, viewer.id, prepared.limit);
  } else if (prepared.kind === "facebook-feed") {
    output = normalizeFacebookFeedHtml(viewer.rootHtml, viewer.id, prepared.limit);
  } else if (prepared.kind === "facebook-group-feed") {
    const path = `/groups/${encodeURIComponent(prepared.groupId)}/`;
    const html = await metaHtmlPath(client, origin, path, "/groups/");
    output = normalizeFacebookGroupFeedHtml(html, viewer.id, prepared.groupId, prepared.limit);
    finalUrl = new URL(path, origin).href;
  } else if (prepared.kind === "facebook-marketplace-feed") {
    const html = await metaHtmlPath(client, origin, "/marketplace/");
    const feed = prepared.cursor === undefined ? normalizeFacebookMarketplaceFeedHtml(html, viewer.id, prepared.limit) : await executeFacebookMarketplaceContinuation(client, html, viewer.id, prepared.cursor, prepared.limit, recipe, options.dependencies, options);
    output = sealFacebookMarketplaceFeed(feed, html, viewer.id, auth, prepared.cursor ?? null, environment);
    finalUrl = `${origin}/marketplace/`;
  } else if (prepared.kind === "facebook-marketplace-listing") {
    const path = `/marketplace/item/${encodeURIComponent(prepared.listingId)}/`;
    const html = await metaHtmlPath(client, origin, path, "/marketplace/");
    output = normalizeFacebookMarketplaceListingHtml(html, viewer.id, prepared.listingId);
    finalUrl = new URL(path, origin).href;
  } else {
    const exhaustive = prepared;
    throw new Error(`Meta authenticated web operation ${exhaustive.kind} is not reviewed`);
  }
  return {
    status: "succeeded",
    output,
    finalUrl,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
function executeMetaWebOperation(recipe, input, auth, options = {}) {
  if (recipe.site === "instagram" && recipe.action === "profiles.read") {
    return startWebSessionCleanupTrackedOperation(options.registerCleanupBarrier, (publishCleanupResource) => executeMetaWebOperationInternal(recipe, input, auth, {
      ...options,
      ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
    }), browserCleanupBarrier);
  }
  return executeMetaWebOperationInternal(recipe, input, auth, options);
}
export {
  revalidateInstagramVideoPublishBindingForDispatch,
  readThreadsWebPublishedMutationTarget,
  readInstagramVideoAcceptedMutationTargetPresence,
  probeMetaWebSubject,
  prepareInstagramVideoPublishInput,
  prepareInstagramAuthoredPostDeleteInput,
  parseInstagramVideoConfigureAccepted,
  parseInstagramVideoAcceptedTargetIdentifier,
  materializeInstagramVideoPublishInput,
  instagramVideoUploadRequestShape,
  instagramVideoUploadId,
  instagramVideoThumbnailUploadRequestShape,
  instagramVideoRequestConfig,
  instagramVideoPermalinkWasRemoved,
  instagramVideoMutationHeaders,
  instagramVideoDeleteRequestShape,
  instagramVideoConfigureRequestShape,
  instagramVideoConfigurePayload,
  instagramVideoConfigureForm,
  instagramVideoAcceptedTargetIdentifier,
  instagramConfigureDispatchDecision,
  executeMetaWebOperation,
  bindInstagramVideoMediaReadback,
  assertInstagramVideoUploadAcknowledgement,
  assertInstagramVideoDeleteAcknowledgement,
  assertInstagramVideoConfigureIndeterminate,
  INSTAGRAM_VIDEO_CAPTURE_BLOCKERS
};
