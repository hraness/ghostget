// @bun
import {
  cleanupEphemeralStage,
  createEphemeralStage,
  markEphemeralStageReady,
  stageInventory,
  validSupervisor
} from "./index-rq5anjw0.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/media/ephemeral-acquire.ts
import { createHash as createHash6 } from "crypto";

// src/media/ephemeral-account.ts
import { createHash } from "crypto";

// src/media/args.ts
var captureModes = new Set(["archive", "audio", "video", "transcript"]);
var valueOptions = new Set([
  "--output",
  "--lang",
  "--browser",
  "--auth-context",
  "--engine",
  "--model",
  "--executable"
]);
var booleanOptions = new Set(["--json", "--inherit-yt-dlp-config", "--refresh", "--replace"]);
var transcriberSetupOptions = new Set([
  "--engine",
  "--model",
  "--executable",
  "--replace",
  "--json"
]);
function hasControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127))
      return true;
  }
  return false;
}
function isLiteralLanguageTag(value) {
  const lower = value.toLowerCase();
  return lower !== "all" && lower !== "live_chat" && /^[A-Za-z0-9]{1,8}(?:-[A-Za-z0-9]{1,8}){0,4}$/u.test(value);
}
function isValidBrowserSpec(value) {
  return value.length > 0 && value.length <= 512 && !hasControlCharacter(value);
}
function normalizeAuthContextName(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value) ? value.toLowerCase() : null;
}

// src/media/ephemeral-account.ts
function ephemeralAccountSelection(snapshot, accountId) {
  if (!snapshot || snapshot.auth.id !== accountId || !/^[a-f0-9]{64}$/u.test(snapshot.contentSha256))
    throw new Error("integrity");
  const auth = snapshot.auth;
  if (auth.kind === "browser-profile" && (auth.cookieProfile === undefined || auth.storageState !== undefined || auth.browserExecutable !== undefined))
    throw new Error("unsupported");
  const source = auth.kind === "cookie-source" ? auth.source : auth.kind === "browser-profile" ? auth.cookieSource : undefined;
  const profile = auth.kind === "cookie-source" ? auth.profile : auth.kind === "browser-profile" ? auth.cookieProfile : undefined;
  if (source === undefined || !["brave", "chrome", "chromium", "edge", "firefox", "opera", "safari", "vivaldi", "whale"].includes(source))
    throw new Error("unsupported");
  if (profile !== undefined && (!profile || profile.includes(":")))
    throw new Error("unsupported");
  const browser = profile === undefined ? source : `${source}:${profile}`;
  if (!isValidBrowserSpec(browser))
    throw new Error("unsupported");
  const authContext = createHash("sha256").update(JSON.stringify(["ghostget-media-account-v1", accountId, snapshot.contentSha256])).digest("hex");
  return { browser, authContext };
}

// src/media/ephemeral-acquire.ts
import { constants } from "fs";
import { mkdir, open, readFile, writeFile } from "fs/promises";
import { basename, join as join2, relative } from "path";

// src/media/source-router.ts
import { createHash as createHash2 } from "crypto";
function requestUrlSha256(requestUrl) {
  return createHash2("sha256").update(requestUrl, "utf8").digest("hex");
}
function routedRequest(url) {
  url.hash = "";
  const requestUrl = url.href;
  return { requestUrl, requestUrlSha256: requestUrlSha256(requestUrl) };
}
function assertNever(value) {
  throw new TypeError(`unhandled source-routing state: ${String(value)}`);
}
function isDirectCaptureMode(mode) {
  return mode === "archive" || mode === "audio" || mode === "video";
}
function routeSource(input) {
  let url;
  try {
    url = new URL(input.url);
  } catch {
    return { kind: "reject", reason: "malformed-url" };
  }
  if (url.username !== "" || url.password !== "") {
    return { kind: "reject", reason: "credentials-not-allowed" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "reject", reason: "unsupported-protocol" };
  }
  const request = routedRequest(url);
  if (input.browser !== undefined && !isValidBrowserSpec(input.browser)) {
    return { kind: "reject", reason: "invalid-browser" };
  }
  if (input.browser !== undefined && input.inheritYtDlpConfig) {
    return { kind: "reject", reason: "ambiguous-private-access" };
  }
  const normalizedContext = input.authContext === undefined ? undefined : normalizeAuthContextName(input.authContext);
  if (normalizedContext === null) {
    return { kind: "reject", reason: "invalid-auth-context" };
  }
  const hasPrivateAccess = input.browser !== undefined || input.inheritYtDlpConfig;
  if (hasPrivateAccess && normalizedContext === undefined) {
    return { kind: "reject", reason: "auth-context-required" };
  }
  if (!hasPrivateAccess && normalizedContext !== undefined) {
    return { kind: "reject", reason: "auth-context-not-applicable" };
  }
  if (input.browser !== undefined) {
    if (normalizedContext === undefined) {
      return { kind: "reject", reason: "auth-context-required" };
    }
    return {
      kind: "yt-dlp",
      reason: "browser-auth",
      mode: input.mode,
      authContext: normalizedContext,
      ...request
    };
  }
  if (input.inheritYtDlpConfig) {
    if (normalizedContext === undefined) {
      return { kind: "reject", reason: "auth-context-required" };
    }
    return {
      kind: "yt-dlp",
      reason: "ambient-config",
      mode: input.mode,
      authContext: normalizedContext,
      ...request
    };
  }
  if (isDirectCaptureMode(input.mode)) {
    return { kind: "direct-http", intent: "media-probe", mode: input.mode, ...request };
  }
  if (input.mode === "transcript") {
    return {
      kind: "direct-http",
      intent: "transcript-probe-only",
      mode: input.mode,
      ...request
    };
  }
  return assertNever(input.mode);
}

// src/media/metadata.ts
import { createHash as createHash3 } from "crypto";

// src/media/utf8-order.ts
var encoder = new TextEncoder;
function compareCodeUnits(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0;index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0)
      return difference;
  }
  return left.length - right.length;
}
function compareUtf8(left, right) {
  if (left === right)
    return 0;
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0;index < length; index += 1) {
    const difference = (leftBytes[index] ?? 0) - (rightBytes[index] ?? 0);
    if (difference !== 0)
      return difference;
  }
  const byteLengthDifference = leftBytes.byteLength - rightBytes.byteLength;
  return byteLengthDifference !== 0 ? byteLengthDifference : compareCodeUnits(left, right);
}

// src/media/metadata.ts
var YT_DLP_OPAQUE_IDENTITY_PROFILE = "yt-dlp-opaque-url-v1";
var YT_DLP_AUTH_IDENTITY_PROFILE = "yt-dlp-auth-context-v1";
var AUTH_CONTEXT_IDENTITY_PROFILE = "wrench-media-auth-context-v1";
var IDENTITY_KEY_VERSION = 1;
var OWNED_YOUTUBE_EXTRACTOR = "Youtube";
var OPAQUE_EXTRACTOR = "External";
var SHA256_PATTERN = /^[0-9a-f]{64}$/u;
var YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/u;
var EXTRACTOR_DIRECTORY_MAX_LENGTH = 80;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasControlCharacter2(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint >= 127 && codePoint <= 159))
      return true;
  }
  return false;
}
function isWellFormedIdentity(value) {
  for (let index = 0;index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 55296 && codeUnit <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343))
        return false;
      index += 1;
    } else if (codeUnit >= 56320 && codeUnit <= 57343) {
      return false;
    }
  }
  return true;
}
function assertWellFormedIdentity(value) {
  if (!isWellFormedIdentity(value)) {
    throw new TypeError("provider identity contains ill-formed UTF-16");
  }
}
function boundedString(record, key, maximum = 4096) {
  const value = record[key];
  if (typeof value !== "string")
    return;
  const normalized = value.normalize("NFC").trim();
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined;
}
function boundedIdentityString(record, key, maximum) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !hasControlCharacter2(value) && isWellFormedIdentity(value) ? value : undefined;
}
function finiteNumber(record, key) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function diagnosticRedactions(record, acquisitionIdentity) {
  const values = [acquisitionIdentity.extractor, acquisitionIdentity.id];
  for (const key of [
    "title",
    "uploader",
    "channel",
    "description",
    "license",
    "upload_date",
    "language"
  ]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0 && value.length <= 64 * 1024 && !hasControlCharacter2(value) && isWellFormedIdentity(value)) {
      values.push(value);
      const normalized = value.normalize("NFC").trim();
      if (normalized.length > 0 && normalized.length <= 64 * 1024 && !hasControlCharacter2(normalized) && isWellFormedIdentity(normalized))
        values.push(normalized);
    }
  }
  return [...new Set(values)].toSorted((left, right) => right.length - left.length);
}
var youtubeHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com"
]);
function parsedSafeWebUrl(value) {
  if (value === undefined || value.length > 8192 || hasControlCharacter2(value))
    return;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
      return;
    }
    return parsed;
  } catch {
    return;
  }
}
function isOwnedYouTubeSource(extractor, providerId, candidateUrls) {
  return extractor === OWNED_YOUTUBE_EXTRACTOR && YOUTUBE_VIDEO_ID_PATTERN.test(providerId) && candidateUrls.some((value) => {
    const parsed = parsedSafeWebUrl(value);
    return parsed !== undefined && youtubeHosts.has(parsed.hostname.toLowerCase());
  });
}
function canonicalSourceUrl(candidateUrls, projection, providerId) {
  if (projection === "youtube") {
    const canonical = new URL("https://www.youtube.com/watch");
    canonical.searchParams.set("v", providerId);
    return canonical.href;
  }
  for (const value of candidateUrls) {
    const parsed = parsedSafeWebUrl(value);
    if (parsed === undefined)
      continue;
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = "/";
    return parsed.href;
  }
  return;
}
function languageKeys(value) {
  if (!isRecord(value))
    return [];
  return Object.keys(value).filter((key) => {
    const tracks = value[key];
    return Array.isArray(tracks) && tracks.some(isRecord) && isLiteralLanguageTag(key) && !hasControlCharacter2(key) && isWellFormedIdentity(key) && !key.includes("/") && !key.includes("\\");
  }).toSorted(compareUtf8);
}
function sourceItemDirectory(value) {
  assertWellFormedIdentity(value);
  const digest = createHash3("sha256").update(value, "utf8").digest("hex").slice(0, 24);
  const readable = value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^[._-]+|[.-]+$/gu, "");
  const maximumPrefixLength = 128 - digest.length - 1;
  const prefix = readable.slice(0, maximumPrefixLength).replace(/[.-]+$/gu, "") || "item";
  return `${prefix}-${digest}`;
}
function sourceExtractorDirectory(value) {
  assertWellFormedIdentity(value);
  const compatibilityNormalized = value.normalize("NFKC");
  const lower = compatibilityNormalized.toLowerCase();
  const slug = lower.replace(/[^a-z0-9._-]+/gu, "-").replace(/^[._-]+|[.-]+$/gu, "");
  const digest = createHash3("sha256").update(value, "utf8").digest("hex").slice(0, 24);
  const readablePrefix = slug.length === 0 || slug === "." || slug === ".." ? "source" : slug;
  const maximumPrefixLength = EXTRACTOR_DIRECTORY_MAX_LENGTH - digest.length - 1;
  return `${readablePrefix.slice(0, maximumPrefixLength).replace(/[-.]+$/gu, "") || "source"}-${digest}`;
}
function tupleDigest(domain, components) {
  const hash = createHash3("sha256");
  hash.update("wrench-media-identity-key\x00", "utf8");
  for (const component of [domain, ...components]) {
    const bytes = new TextEncoder().encode(component);
    const length = new Uint8Array(8);
    new DataView(length.buffer).setBigUint64(0, BigInt(bytes.byteLength), false);
    hash.update(length);
    hash.update(bytes);
  }
  return hash.digest("hex");
}
function invalidProbe(message) {
  return { ok: false, kind: "invalid", message };
}
function unsupportedProbe(reason) {
  const labels = {
    playlist: "playlist",
    "multi-video": "multi-video source",
    live: "live source",
    upcoming: "upcoming live source",
    "post-live": "post-live source",
    drm: "DRM-protected source"
  };
  return {
    ok: false,
    kind: "unsupported",
    reason,
    message: `yt-dlp probe returned an unsupported ${labels[reason]}`
  };
}
function unsupportedProbeEnvelope(value) {
  if (value["_type"] === "playlist")
    return unsupportedProbe("playlist");
  if (value["_type"] === "multi_video")
    return unsupportedProbe("multi-video");
  const liveStatus = value["live_status"];
  if (value["is_live"] === true || liveStatus === "is_live")
    return unsupportedProbe("live");
  if (value["is_upcoming"] === true || liveStatus === "is_upcoming") {
    return unsupportedProbe("upcoming");
  }
  if (liveStatus === "post_live")
    return unsupportedProbe("post-live");
  if (value["has_drm"] === true || value["_has_drm"] === true) {
    return unsupportedProbe("drm");
  }
  const requestedFormats = value["requested_formats"];
  if (Array.isArray(requestedFormats) && requestedFormats.some((format) => isRecord(format) && format["has_drm"] === true)) {
    return unsupportedProbe("drm");
  }
  const formats = value["formats"];
  const formatRecords = Array.isArray(formats) ? formats.filter(isRecord) : [];
  if (Array.isArray(formats) && formatRecords.length > 0 && formatRecords.length === formats.length && formatRecords.every((format) => format["has_drm"] === true)) {
    return unsupportedProbe("drm");
  }
  return null;
}
function providerIdentitySha256(extractor, providerId) {
  assertWellFormedIdentity(extractor);
  assertWellFormedIdentity(providerId);
  return tupleDigest("source", [extractor, providerId]);
}
function requestedUrlSha256(value) {
  const parsed = parsedSafeWebUrl(value);
  if (parsed === undefined)
    throw new TypeError("yt-dlp requested URL is malformed");
  parsed.hash = "";
  return createHash3("sha256").update(parsed.href, "utf8").digest("hex");
}
function authContextSha256(value) {
  const normalized = normalizeAuthContextName(value);
  if (normalized === null)
    throw new TypeError("authorization context is malformed");
  return tupleDigest("auth-context", [normalized]);
}
function sourceAssetKey(extractor, providerId) {
  return `source-v${String(IDENTITY_KEY_VERSION)}-${providerIdentitySha256(extractor, providerId)}`;
}
function opaqueYtDlpSourceAssetKey(identity) {
  if (identity.profile !== YT_DLP_OPAQUE_IDENTITY_PROFILE || !SHA256_PATTERN.test(identity.providerIdentitySha256) || !SHA256_PATTERN.test(identity.requestedUrlSha256)) {
    throw new TypeError("opaque yt-dlp identity is malformed");
  }
  return `source-v2-${tupleDigest("yt-dlp-opaque-url", [
    identity.providerIdentitySha256,
    identity.requestedUrlSha256
  ])}`;
}
function opaqueYtDlpSourceId(assetKey) {
  const match = /^source-v2-([0-9a-f]{64})$/u.exec(assetKey);
  if (match?.[1] === undefined)
    throw new TypeError("opaque yt-dlp source asset key is malformed");
  return `opaque-v2-${match[1]}`;
}
function authenticatedYtDlpSourceAssetKey(identity) {
  if (identity.profile !== YT_DLP_AUTH_IDENTITY_PROFILE || !SHA256_PATTERN.test(identity.providerIdentitySha256) || !SHA256_PATTERN.test(identity.requestedUrlSha256) || identity.accessMode !== "browser" && identity.accessMode !== "ambient_config" || identity.authContext.profile !== AUTH_CONTEXT_IDENTITY_PROFILE || !SHA256_PATTERN.test(identity.authContext.sha256)) {
    throw new TypeError("authenticated yt-dlp identity is malformed");
  }
  return `source-v3-${tupleDigest("yt-dlp-auth-context", [
    identity.providerIdentitySha256,
    identity.requestedUrlSha256,
    identity.accessMode,
    identity.authContext.sha256
  ])}`;
}
function authenticatedYtDlpSourceId(assetKey) {
  const match = /^source-v3-([0-9a-f]{64})$/u.exec(assetKey);
  if (match?.[1] === undefined) {
    throw new TypeError("authenticated yt-dlp source asset key is malformed");
  }
  return `opaque-v3-${match[1]}`;
}
function parseProbeMetadata(value, requestedUrl, authorization) {
  if (!isRecord(value))
    return invalidProbe("yt-dlp probe did not return an object");
  const unsupported = unsupportedProbeEnvelope(value);
  if (unsupported !== null)
    return unsupported;
  const id = boundedIdentityString(value, "id", 512);
  const extractor = boundedIdentityString(value, "extractor_key", 512) ?? boundedIdentityString(value, "extractor", 512);
  if (id === undefined || extractor === undefined) {
    return invalidProbe("yt-dlp probe is missing a bounded extractor identity");
  }
  const candidateUrls = [
    boundedString(value, "webpage_url", 8192),
    boundedString(value, "original_url", 8192),
    requestedUrl
  ];
  if (authorization !== undefined && (authorization.mode !== "browser" && authorization.mode !== "ambient_config" || !SHA256_PATTERN.test(authorization.contextSha256)))
    return invalidProbe("yt-dlp authorization identity is malformed");
  const projection = authorization === undefined && isOwnedYouTubeSource(extractor, id, candidateUrls) ? "youtube" : "opaque";
  const canonicalUrl = canonicalSourceUrl(candidateUrls, projection, id);
  if (canonicalUrl === undefined)
    return invalidProbe("yt-dlp probe is missing a safe canonical URL");
  let opaqueIdentity;
  let authenticatedIdentity;
  if (projection === "opaque") {
    let requestDigest;
    try {
      requestDigest = requestedUrlSha256(requestedUrl);
    } catch {
      return invalidProbe("yt-dlp probe is missing a safe requested URL");
    }
    const providerDigest = providerIdentitySha256(extractor, id);
    if (authorization === undefined) {
      opaqueIdentity = {
        profile: YT_DLP_OPAQUE_IDENTITY_PROFILE,
        providerIdentitySha256: providerDigest,
        requestedUrlSha256: requestDigest
      };
    } else {
      authenticatedIdentity = {
        profile: YT_DLP_AUTH_IDENTITY_PROFILE,
        providerIdentitySha256: providerDigest,
        requestedUrlSha256: requestDigest,
        accessMode: authorization.mode,
        authContext: {
          profile: AUTH_CONTEXT_IDENTITY_PROFILE,
          sha256: authorization.contextSha256
        }
      };
    }
  }
  const assetKey = authenticatedIdentity !== undefined ? authenticatedYtDlpSourceAssetKey(authenticatedIdentity) : opaqueIdentity === undefined ? sourceAssetKey(extractor, id) : opaqueYtDlpSourceAssetKey(opaqueIdentity);
  const projectedExtractor = projection === "youtube" ? OWNED_YOUTUBE_EXTRACTOR : OPAQUE_EXTRACTOR;
  const projectedId = projection === "youtube" ? id : authenticatedIdentity === undefined ? opaqueYtDlpSourceId(assetKey) : authenticatedYtDlpSourceId(assetKey);
  const extractorPath = sourceExtractorDirectory(projectedExtractor);
  const itemPath = sourceItemDirectory(projectedId);
  const title = projection === "youtube" ? boundedString(value, "title", 2048) : undefined;
  const uploader = projection === "youtube" ? boundedString(value, "uploader", 1024) : undefined;
  const channel = projection === "youtube" ? boundedString(value, "channel", 1024) : undefined;
  const description = projection === "youtube" ? boundedString(value, "description", 64 * 1024) : undefined;
  const license = projection === "youtube" ? boundedString(value, "license", 1024) : undefined;
  const uploadDate = projection === "youtube" ? boundedString(value, "upload_date", 32) : undefined;
  const timestamp = projection === "youtube" ? finiteNumber(value, "timestamp") : undefined;
  const durationSeconds = projection === "youtube" ? finiteNumber(value, "duration") : undefined;
  const originalLanguage = projection === "youtube" ? boundedString(value, "language", 128) : undefined;
  return {
    ok: true,
    metadata: {
      acquisitionIdentity: { extractor, id },
      projection,
      diagnosticRedactions: projection === "opaque" ? diagnosticRedactions(value, { extractor, id }) : [],
      id: projectedId,
      extractor: projectedExtractor,
      extractorDirectory: extractorPath,
      itemDirectory: itemPath,
      assetKey,
      ...opaqueIdentity === undefined ? {} : { opaqueYtDlpIdentity: opaqueIdentity },
      ...authenticatedIdentity === undefined ? {} : { authenticatedYtDlpIdentity: authenticatedIdentity },
      canonicalUrl,
      ...title === undefined ? {} : { title },
      ...uploader === undefined ? {} : { uploader },
      ...channel === undefined ? {} : { channel },
      ...description === undefined ? {} : { description },
      ...license === undefined ? {} : { license },
      ...uploadDate === undefined ? {} : { uploadDate },
      ...timestamp === undefined ? {} : { timestamp },
      ...durationSeconds === undefined ? {} : { durationSeconds },
      ...originalLanguage === undefined ? {} : { originalLanguage },
      manualCaptionLanguages: languageKeys(value["subtitles"]),
      automaticCaptionLanguages: languageKeys(value["automatic_captions"])
    }
  };
}
function languageFamily(value) {
  return value.toLowerCase().split("-")[0] ?? "";
}
function selectCaption(metadata, requestedLanguage) {
  const requested = requestedLanguage.toLowerCase();
  const requestedFamily = languageFamily(requested);
  const original = metadata.originalLanguage?.toLowerCase();
  const originalFamily = original === undefined ? undefined : languageFamily(original);
  const relevance = (language) => {
    const normalized = language.toLowerCase();
    if (normalized === requested)
      return 0;
    if (languageFamily(normalized) === requestedFamily)
      return 1;
    if (original !== undefined && normalized === original)
      return 2;
    if (originalFamily !== undefined && languageFamily(normalized) === originalFamily)
      return 3;
    return 4;
  };
  let best = null;
  let order = 0;
  for (const [source, languages] of [
    ["manual", metadata.manualCaptionLanguages],
    ["automatic", metadata.automaticCaptionLanguages]
  ]) {
    const quality = source === "manual" ? 0 : 1;
    for (const language of languages) {
      const candidate = {
        selection: { source, language },
        relevance: relevance(language),
        quality,
        order
      };
      order += 1;
      if (best === null || candidate.relevance < best.relevance || candidate.relevance === best.relevance && candidate.quality < best.quality || candidate.relevance === best.relevance && candidate.quality === best.quality && candidate.order < best.order) {
        best = candidate;
      }
    }
  }
  return best?.selection ?? null;
}

// src/media/process.ts
import { dlopen, ptr } from "bun:ffi";
import { constants as fsConstants, readFileSync } from "fs";
import { access, stat } from "fs/promises";
import { constants as osConstants, homedir } from "os";
import { delimiter, join } from "path";
var DEFAULT_STDOUT_LIMIT_BYTES = 16 * 1024 * 1024;
var DEFAULT_STDERR_LIMIT_BYTES = 2 * 1024 * 1024;
var MAX_OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;
var DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
var DEFAULT_TERMINATE_GRACE_MS = 2000;
var DEFAULT_KILL_GRACE_MS = 2000;
var MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;
var MAX_DIAGNOSTIC_CODE_UNITS = 16 * 1024;
var MAX_URL_REDACTION_CODE_UNITS = 8 * 1024;
var MIN_DERIVED_URL_SECRET_CODE_UNITS = 4;
var SENSITIVE_SWITCHES = new Set([
  "--add-header",
  "--client-certificate",
  "--client-certificate-key",
  "--client-certificate-password",
  "--cookies",
  "--cookies-from-browser",
  "--http-header",
  "--netrc-location",
  "--password",
  "--proxy",
  "--username",
  "--video-password"
]);
var URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
var HEADER_PATTERN = /\b(?:authorization|cookie|set-cookie|x-api-key)\s*:(?![ \t]*\[REDACTED\])[^\r\n]*/giu;
var KEY_VALUE_SECRET_PATTERN = /\b(?:access[_-]?token|api[_-]?key|auth(?:orization)?|cookie|password|passwd|secret|sig(?:nature)?|token)=([^\s&;]+)/giu;
var SWITCH_SECRET_PATTERN = /(--(?:add-header|client-certificate(?:-key|-password)?|cookies(?:-from-browser)?|http-header|netrc-location|password|proxy|username|video-password))(?:=|\s+)([^\s]+)/giu;
var OSC_SEQUENCE_PATTERN = /(?:\u001B\]|\u009D)[\s\S]*?(?:\u0007|\u001B\\|\u009C|$)/gu;
var ANSI_STRING_SEQUENCE_PATTERN = /(?:\u001B[P^_X]|[\u0090\u0098\u009E\u009F])[\s\S]*?(?:\u001B\\|\u009C|$)/gu;
var CSI_SEQUENCE_PATTERN = /(?:\u001B\[|\u009B)[0-?]*[ -/]*[@-~]/gu;
var TWO_BYTE_ESCAPE_PATTERN = /\u001B[@-_]/gu;
var TERMINAL_CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/gu;
var DIAGNOSTIC_WHITESPACE_PATTERN = /\s+/gu;
var defaultTimer = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle)
};
var defaultProcessDependencies = {
  spawn: (argv, options) => {
    const grouped = options.processGroup === true && process.platform !== "win32";
    const child = Bun.spawn([...argv], {
      ...options.cwd === undefined ? {} : { cwd: options.cwd },
      ...options.env === undefined ? {} : { env: { ...options.env } },
      ...grouped ? { detached: true } : {},
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe"
    });
    if (grouped)
      trackProcessGroup(child.pid, child.exited);
    return {
      stdout: child.stdout,
      stderr: child.stderr,
      exited: child.exited,
      kill: grouped ? (signal) => signalProcessGroup(child.pid, signal) : (signal) => child.kill(signal)
    };
  },
  timer: defaultTimer,
  now: () => Date.now()
};
var defaultDiscoveryDependencies = {
  isExecutableFile: async (path, platform) => {
    try {
      const metadata = await stat(path);
      if (!metadata.isFile())
        return false;
      await access(path, platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
};
async function runProcess(argv, options = {}, dependencies = defaultProcessDependencies) {
  const startedAt = dependencies.now();
  const command = redactArguments(argv, options.redactions);
  const stdoutLimit = normalizeByteLimit(options.maxStdoutBytes ?? options.maxOutputBytes, DEFAULT_STDOUT_LIMIT_BYTES);
  const stderrLimit = normalizeByteLimit(options.maxStderrBytes ?? options.maxOutputBytes, DEFAULT_STDERR_LIMIT_BYTES);
  const timeoutMs = normalizeDuration(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const terminateGraceMs = normalizeDuration(options.terminateGraceMs, DEFAULT_TERMINATE_GRACE_MS);
  const killGraceMs = normalizeDuration(options.killGraceMs, DEFAULT_KILL_GRACE_MS);
  if (options.signal?.aborted === true) {
    return {
      ok: false,
      reason: "aborted",
      command,
      exitCode: null,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      elapsedMs: elapsed(startedAt, dependencies.now()),
      diagnostic: redactDiagnostic(`${renderCommand(command)}: cancelled before the process started`, redactionOptions(options))
    };
  }
  let child;
  try {
    child = dependencies.spawn(argv, {
      ...options.cwd === undefined ? {} : { cwd: options.cwd },
      ...options.env === undefined ? {} : { env: options.env },
      ...options.processGroup === undefined ? {} : { processGroup: options.processGroup }
    });
  } catch (error) {
    const detail = redactDiagnostic(errorMessage(error), redactionOptions(options));
    const diagnostic = redactDiagnostic(`Could not start ${renderCommand(command)}: ${detail}`, redactionOptions(options));
    return {
      ok: false,
      reason: "spawn",
      command,
      exitCode: null,
      stdout: "",
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
      elapsedMs: elapsed(startedAt, dependencies.now()),
      diagnostic
    };
  }
  const stdoutCapture = captureBounded(child.stdout, stdoutLimit);
  const stderrCapture = captureBounded(child.stderr, stderrLimit);
  let termination = null;
  let exitResult = await waitFor(child.exited, timeoutMs, dependencies.timer, options.signal);
  if (exitResult.kind === "timeout" || exitResult.kind === "aborted") {
    termination = exitResult.kind;
    safelyKill(child, "SIGTERM");
    exitResult = await waitFor(child.exited, terminateGraceMs, dependencies.timer);
    if (exitResult.kind === "timeout") {
      safelyKill(child, "SIGKILL");
      exitResult = await waitFor(child.exited, killGraceMs, dependencies.timer);
    }
    if (options.processGroup === true) {
      safelyKill(child, "SIGKILL");
    }
  }
  const captures = Promise.all([stdoutCapture.result, stderrCapture.result]);
  if (exitResult.kind === "timeout") {
    await Promise.all([stdoutCapture.cancel(), stderrCapture.cancel()]);
  } else {
    const drained = await waitFor(captures, killGraceMs, dependencies.timer);
    if (drained.kind === "timeout") {
      await Promise.all([stdoutCapture.cancel(), stderrCapture.cancel()]);
    }
  }
  const [stdout, stderr] = await captures;
  const exitCode = exitResult.kind === "value" ? exitResult.value : null;
  const output = {
    command,
    exitCode,
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    elapsedMs: elapsed(startedAt, dependencies.now())
  };
  if (termination === null && exitResult.kind === "value" && exitCode === 0 && stdout.error === null && stderr.error === null) {
    return { ...output, ok: true, exitCode: 0 };
  }
  const reason = termination ?? (exitResult.kind === "error" || stdout.error !== null || stderr.error !== null ? "io" : "exit");
  const failureDetail = failureDetailFor(reason, exitCode, stdout, stderr, exitResult);
  return {
    ...output,
    ok: false,
    reason,
    diagnostic: redactDiagnostic(`${renderCommand(command)}: ${failureDetail}`, redactionOptions(options))
  };
}
async function findExecutable(name, options = {}, dependencies = defaultDiscoveryDependencies) {
  if (!isSafeExecutableName(name))
    return null;
  const platform = options.platform ?? process.platform;
  if (name.includes("/") || name.includes("\\")) {
    return await dependencies.isExecutableFile(name, platform) ? name : null;
  }
  const env = options.env ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();
  const pathValue = env.PATH ?? env.Path ?? env.path ?? "";
  const pathDirectories = pathValue.split(delimiter).filter((entry) => entry.length > 0);
  const directories = unique([
    ...pathDirectories,
    ...options.extraDirectories ?? [],
    ...commonExecutableDirectories(homeDirectory, platform)
  ]);
  const names = executableNames(name, env, platform);
  for (const directory of directories) {
    for (const candidateName of names) {
      const candidate = join(directory, candidateName);
      if (await dependencies.isExecutableFile(candidate, platform))
        return candidate;
    }
  }
  return null;
}
function redactArguments(argv, additionalSecrets = []) {
  const redacted = [];
  let redactNext = false;
  for (const argument of argv) {
    if (redactNext) {
      redacted.push("[REDACTED]");
      redactNext = false;
      continue;
    }
    const equalsIndex = argument.indexOf("=");
    const switchName = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    if (SENSITIVE_SWITCHES.has(switchName)) {
      if (equalsIndex === -1) {
        redacted.push(argument);
        redactNext = true;
      } else {
        redacted.push(`${switchName}=[REDACTED]`);
      }
      continue;
    }
    redacted.push(redactDiagnostic(argument, { secrets: additionalSecrets }));
  }
  return redacted;
}
function urlDerivedRedactions(value) {
  if (value.length === 0 || value.length > MAX_URL_REDACTION_CODE_UNITS)
    return [];
  let url;
  try {
    url = new URL(value);
  } catch {
    return [];
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return [];
  const candidates = [];
  const add = (candidate) => {
    if (candidate.length >= MIN_DERIVED_URL_SECRET_CODE_UNITS && candidate.length <= MAX_URL_REDACTION_CODE_UNITS && sanitizeTerminalText(candidate) === candidate)
      candidates.push(candidate);
  };
  const addRawDecodedAndStem = (candidate) => {
    add(candidate);
    const lastDot = candidate.lastIndexOf(".");
    if (lastDot > 0)
      add(candidate.slice(0, lastDot));
    try {
      const decoded = decodeURIComponent(candidate);
      add(decoded);
      const decodedLastDot = decoded.lastIndexOf(".");
      if (decodedLastDot > 0)
        add(decoded.slice(0, decodedLastDot));
    } catch {}
  };
  const rawSegments = url.pathname.split("/").filter((segment) => segment.length > 0);
  for (const segment of rawSegments)
    addRawDecodedAndStem(segment);
  const rawPath = rawSegments.join("/");
  if (rawSegments.length > 1)
    addRawDecodedAndStem(rawPath);
  for (const component of url.search.slice(1).split("&")) {
    if (component.length === 0)
      continue;
    const equals = component.indexOf("=");
    const rawKey = equals === -1 ? component : component.slice(0, equals);
    const rawValue = equals === -1 ? "" : component.slice(equals + 1);
    addRawDecodedAndStem(rawKey);
    addRawDecodedAndStem(rawValue);
  }
  for (const [queryKey, queryValue] of url.searchParams) {
    addRawDecodedAndStem(queryKey);
    addRawDecodedAndStem(queryValue);
  }
  addRawDecodedAndStem(url.hash.slice(1));
  addRawDecodedAndStem(url.username);
  addRawDecodedAndStem(url.password);
  return [...new Set(candidates)].toSorted((left, right) => right.length - left.length);
}
function redactDiagnostic(input, options = {}) {
  let output = redactExactSecrets(input, options.secrets ?? []);
  output = redactSensitivePatterns(output);
  output = redactInlineSensitivePatterns(sanitizeTerminalText(output));
  if (options.homeDirectory !== undefined && options.homeDirectory.length > 1) {
    output = output.split(options.homeDirectory).join("~");
  }
  output = sanitizeTerminalText(output);
  const limit = normalizeDiagnosticLimit(options.maxCodeUnits);
  return output.length <= limit ? output : `${output.slice(0, limit)}\u2026[truncated]`;
}
function redactExactSecrets(input, secrets) {
  let output = input;
  const longestFirst = [...new Set(secrets.filter((secret) => secret.length > 0))].sort((left, right) => right.length - left.length);
  for (const secret of longestFirst) {
    output = output.split(secret).join("[REDACTED]");
  }
  return output;
}
function redactSensitivePatterns(input) {
  return redactInlineSensitivePatterns(input.replace(HEADER_PATTERN, (value) => `${value.slice(0, value.indexOf(":"))}: [REDACTED]`));
}
function redactInlineSensitivePatterns(input) {
  return input.replace(URL_PATTERN, (value) => redactUrl(value)).replace(SWITCH_SECRET_PATTERN, (_match, switchName) => `${switchName} [REDACTED]`).replace(KEY_VALUE_SECRET_PATTERN, (match) => `${match.slice(0, match.indexOf("=") + 1)}[REDACTED]`);
}
function sanitizeTerminalText(input) {
  return input.replace(OSC_SEQUENCE_PATTERN, "").replace(ANSI_STRING_SEQUENCE_PATTERN, "").replace(CSI_SEQUENCE_PATTERN, "").replace(TWO_BYTE_ESCAPE_PATTERN, "").replace(TERMINAL_CONTROL_PATTERN, " ").replace(DIAGNOSTIC_WHITESPACE_PATTERN, " ").trim();
}
function commonExecutableDirectories(homeDirectory, platform) {
  const userDirectories = [
    join(homeDirectory, ".local", "bin"),
    join(homeDirectory, "bin"),
    join(homeDirectory, ".bun", "bin")
  ];
  if (platform === "win32")
    return userDirectories;
  return unique([
    ...userDirectories,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    "/opt/local/bin",
    "/usr/bin",
    "/bin"
  ]);
}
function captureBounded(stream, limit) {
  if (stream === null) {
    return {
      result: Promise.resolve({ text: "", truncated: false, error: null }),
      cancel: () => Promise.resolve()
    };
  }
  const reader = stream.getReader();
  let canceled = false;
  const result = (async () => {
    const chunks = [];
    let storedBytes = 0;
    let truncated = false;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done)
          break;
        const chunk = next.value;
        if (chunk.byteLength === 0)
          continue;
        const remaining = limit - storedBytes;
        if (remaining > 0) {
          const kept = chunk.byteLength <= remaining ? chunk.slice() : chunk.slice(0, remaining);
          chunks.push(kept);
          storedBytes += kept.byteLength;
        }
        if (chunk.byteLength > remaining)
          truncated = true;
      }
      return {
        text: decodeChunks(chunks, storedBytes),
        truncated: truncated || canceled,
        error: null
      };
    } catch (error) {
      if (canceled) {
        return { text: decodeChunks(chunks, storedBytes), truncated: true, error: null };
      }
      return {
        text: decodeChunks(chunks, storedBytes),
        truncated,
        error: errorMessage(error)
      };
    } finally {
      reader.releaseLock();
    }
  })();
  return {
    result,
    cancel: async () => {
      canceled = true;
      try {
        await reader.cancel("process did not exit after SIGKILL");
      } catch {}
    }
  };
}
function decodeChunks(chunks, byteLength) {
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
function waitFor(promise, timeoutMs, timer, signal) {
  return new Promise((resolve) => {
    let settled = false;
    const timerHandle = { value: undefined };
    const finish = (result) => {
      if (settled)
        return;
      settled = true;
      timer.clear(timerHandle.value);
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = () => finish({ kind: "aborted" });
    timerHandle.value = timer.set(() => finish({ kind: "timeout" }), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted === true) {
      finish({ kind: "aborted" });
      return;
    }
    promise.then((value) => finish({ kind: "value", value }), (error) => finish({ kind: "error", error }));
  });
}
function failureDetailFor(reason, exitCode, stdout, stderr, exitResult) {
  if (reason === "aborted")
    return "was cancelled and terminated";
  if (reason === "timeout")
    return "timed out and was terminated";
  if (exitResult.kind === "error")
    return `could not observe process exit: ${errorMessage(exitResult.error)}`;
  if (stdout.error !== null)
    return `could not read stdout: ${stdout.error}`;
  if (stderr.error !== null)
    return `could not read stderr: ${stderr.error}`;
  const stderrSummary = stderr.text.trim();
  const suffix = stderrSummary.length === 0 ? "" : `; stderr: ${stderrSummary}`;
  return `exited with code ${String(exitCode)}${suffix}`;
}
function signalProcessGroup(pid, signal) {
  if (!Number.isSafeInteger(pid) || pid <= 1)
    return;
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!(typeof error === "object" && error !== null && ("code" in error) && error.code === "ESRCH"))
      throw error;
  }
}
var PARENT_TERMINATION_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
var activeProcessGroups = new Set;
var parentSignalHandlers = new Map;
function trackProcessGroup(pid, exited) {
  if (!Number.isSafeInteger(pid) || pid <= 1)
    return;
  activeProcessGroups.add(pid);
  if (activeProcessGroups.size === 1)
    installParentHandlers();
  const forget = () => {
    activeProcessGroups.delete(pid);
    if (activeProcessGroups.size === 0)
      removeParentHandlers();
  };
  exited.then(forget, forget);
}
function killActiveProcessGroups() {
  for (const pid of activeProcessGroups) {
    try {
      signalProcessGroup(pid, "SIGKILL");
    } catch {}
  }
}
function onParentExit() {
  killActiveProcessGroups();
}
var inheritedIgnoredSignals;
function signalsIgnoredAtStart() {
  if (inheritedIgnoredSignals !== undefined)
    return inheritedIgnoredSignals;
  const ignored = new Set;
  for (const signal of PARENT_TERMINATION_SIGNALS) {
    if (process.listenerCount(signal) === 0 && signalIsIgnored(osConstants.signals[signal]))
      ignored.add(signal);
  }
  inheritedIgnoredSignals = ignored;
  return ignored;
}
var cachedSignalActionReader;
function darwinSignalActionReader() {
  if (cachedSignalActionReader !== undefined)
    return cachedSignalActionReader;
  try {
    const library = dlopen("/usr/lib/libSystem.B.dylib", {
      sigaction: { args: ["int", "ptr", "ptr"], returns: "int" }
    });
    cachedSignalActionReader = (signal, buffer) => library.symbols.sigaction(signal, null, ptr(buffer)) === 0;
  } catch {
    cachedSignalActionReader = null;
  }
  return cachedSignalActionReader;
}
function signalIsIgnored(signalNumber) {
  try {
    if (process.platform === "linux") {
      const line = readFileSync("/proc/self/status", "utf8").split(`
`).find((entry) => entry.startsWith("SigIgn:"));
      if (line === undefined)
        return false;
      return (BigInt(`0x${line.slice("SigIgn:".length).trim()}`) >> BigInt(signalNumber - 1) & 1n) === 1n;
    }
    if (process.platform === "darwin") {
      const reader = darwinSignalActionReader();
      const buffer = new Uint8Array(64);
      if (reader === null || !reader(signalNumber, buffer))
        return false;
      return new DataView(buffer.buffer).getBigUint64(0, true) === 1n;
    }
  } catch {}
  return false;
}
function installParentHandlers() {
  const ignored = signalsIgnoredAtStart();
  for (const signal of PARENT_TERMINATION_SIGNALS) {
    if (ignored.has(signal))
      continue;
    const handler = () => {
      if (process.listenerCount(signal) > 1)
        return;
      killActiveProcessGroups();
      removeParentHandlers();
      process.kill(process.pid, signal);
    };
    parentSignalHandlers.set(signal, handler);
    process.prependListener(signal, handler);
  }
  process.on("exit", onParentExit);
}
function removeParentHandlers() {
  for (const [signal, handler] of parentSignalHandlers)
    process.removeListener(signal, handler);
  parentSignalHandlers.clear();
  process.removeListener("exit", onParentExit);
}
function safelyKill(child, signal) {
  try {
    child.kill(signal);
  } catch {}
}
function normalizeByteLimit(value, fallback) {
  if (value === undefined || !Number.isFinite(value))
    return fallback;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_OUTPUT_LIMIT_BYTES);
}
function normalizeDuration(value, fallback) {
  if (value === undefined || !Number.isFinite(value))
    return fallback;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_TIMEOUT_MS);
}
function normalizeDiagnosticLimit(value) {
  if (value === undefined || !Number.isFinite(value))
    return MAX_DIAGNOSTIC_CODE_UNITS;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_DIAGNOSTIC_CODE_UNITS);
}
function elapsed(startedAt, finishedAt) {
  return Math.max(0, Math.trunc(finishedAt - startedAt));
}
function renderCommand(argv) {
  return argv.map((argument) => JSON.stringify(argument)).join(" ");
}
function errorMessage(error) {
  if (error instanceof Error)
    return error.message;
  if (typeof error === "string")
    return error;
  return "unknown process error";
}
function homeFromOptions(options) {
  const candidate = options.env?.HOME;
  return candidate === undefined || candidate.length === 0 ? undefined : candidate;
}
function redactionOptions(options) {
  const homeDirectory = homeFromOptions(options);
  return {
    ...options.redactions === undefined ? {} : { secrets: options.redactions },
    ...homeDirectory === undefined ? {} : { homeDirectory }
  };
}
function isSafeExecutableName(name) {
  return name.length > 0 && name !== "." && name !== ".." && !name.includes("\x00");
}
function executableNames(name, env, platform) {
  if (platform !== "win32" || /\.[a-z0-9]+$/iu.test(name))
    return [name];
  const extensions = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((extension) => extension.length > 0);
  return [name, ...extensions.map((extension) => `${name}${extension.toLowerCase()}`)];
}
function unique(values) {
  return [...new Set(values.filter((value) => value.length > 0))];
}
function redactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}/[REDACTED]`;
  } catch {
    return "[REDACTED URL]";
  }
}

// src/media/yt-dlp.ts
var PROBE_TIMEOUT_MS = 2 * 60 * 1000;
var CAPTURE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
var PROBE_STDOUT_LIMIT_BYTES = 32 * 1024 * 1024;
var CAPTURE_STDOUT_LIMIT_BYTES = 16 * 1024;
var TOOL_STDERR_LIMIT_BYTES = 2 * 1024 * 1024;
var CAPTURE_IDENTITY_PREFIX = "WRENCH_MEDIA_CAPTURE_IDENTITY_V1\t";
var CAPTURE_IDENTITY_MAX_CODE_UNITS = 512;
var CAPTURE_EXTENSION_MAX_CODE_UNITS = 16;
var RESERVED_CAPTURE_EXTENSIONS = new Set([
  "ass",
  "avif",
  "bmp",
  "description",
  "dfxp",
  "gif",
  "ico",
  "jpeg",
  "jfif",
  "jpg",
  "json",
  "json3",
  "jxl",
  "lrc",
  "part",
  "png",
  "sami",
  "scc",
  "srv1",
  "srv2",
  "srv3",
  "srt",
  "svg",
  "tif",
  "tiff",
  "txt",
  "ttml",
  "vtt",
  "webp",
  "xml",
  "ytdl"
]);
var OWNED_PROBE_BOUNDARY_ARGS = [
  "--no-remote-components",
  "--ignore-dynamic-mpd",
  "--no-wait-for-video",
  "--no-live-from-start",
  "--no-allow-unplayable-formats"
];
var OWNED_CAPTURE_BOUNDARY_ARGS = [
  ...OWNED_PROBE_BOUNDARY_ARGS,
  "--no-keep-fragments",
  "--no-hls-split-discontinuity"
];
var CAPTURE_IDENTITY_TEMPLATE = `${CAPTURE_IDENTITY_PREFIX}{"extractor":%(extractor_key,extractor|)j,"id":%(id|)j,"ext":%(ext|)j}`;
var defaultDependencies = { runProcess: (argv, options) => runProcess(argv, options) };
var SHA256_PATTERN2 = /^[0-9a-f]{64}$/u;
function authorizationIdentity(options) {
  if (options.browser !== undefined && !isValidBrowserSpec(options.browser)) {
    throw new TypeError("yt-dlp browser selector is malformed");
  }
  if (options.browser !== undefined && options.inheritConfig) {
    throw new TypeError("yt-dlp browser and ambient configuration are mutually exclusive");
  }
  const hasPrivateAccess = options.browser !== undefined || options.inheritConfig;
  if (hasPrivateAccess !== (options.authContextSha256 !== undefined)) {
    throw new TypeError("yt-dlp private access requires exactly one authorization context");
  }
  if (options.authContextSha256 === undefined)
    return;
  if (!SHA256_PATTERN2.test(options.authContextSha256)) {
    throw new TypeError("yt-dlp authorization context digest is malformed");
  }
  return {
    mode: options.browser === undefined ? "ambient_config" : "browser",
    contextSha256: options.authContextSha256
  };
}
function configurationArgs(options) {
  return options.inheritConfig ? [] : ["--ignore-config", "--no-plugin-dirs"];
}
function authenticationArgs(options) {
  return options.browser === undefined ? [] : ["--cookies-from-browser", options.browser];
}
function buildYtDlpProbeArgv(options) {
  authorizationIdentity(options);
  return [
    options.executable,
    ...configurationArgs(options),
    ...OWNED_PROBE_BOUNDARY_ARGS,
    "--no-playlist",
    "--skip-download",
    "--dump-single-json",
    "--no-warnings",
    ...authenticationArgs(options),
    "--",
    options.url
  ];
}
function modeArgs(mode) {
  switch (mode) {
    case "archive":
      return ["--format", "bv*+ba/b", "--merge-output-format", "mkv"];
    case "audio":
      return ["--format", "bestaudio/best"];
    case "video":
      return ["--format", "bestvideo/best"];
    case "transcript":
      return ["--skip-download"];
  }
}
function captionArgs(caption) {
  if (caption === null)
    return [];
  if (!isLiteralLanguageTag(caption.language)) {
    throw new TypeError("caption language must be a literal BCP-47-style tag");
  }
  return [
    caption.source === "manual" ? "--write-subs" : "--write-auto-subs",
    "--sub-langs",
    caption.language,
    "--sub-format",
    "vtt/best",
    "--convert-subs",
    "vtt"
  ];
}
function captureIdentityPrintArg(mode) {
  const when = mode === "transcript" ? "after_video" : "after_move";
  return `${when}:${CAPTURE_IDENTITY_TEMPLATE}`;
}
function buildYtDlpCaptureArgv(options) {
  authorizationIdentity(options);
  if (options.maximumBytes !== undefined && (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 1))
    throw new TypeError("invalid media byte limit");
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1))
    throw new TypeError("invalid media timeout");
  return [
    options.executable,
    ...configurationArgs(options),
    ...OWNED_CAPTURE_BOUNDARY_ARGS,
    "--no-playlist",
    "--abort-on-error",
    "--abort-on-unavailable-fragments",
    "--check-formats",
    "--quiet",
    "--no-progress",
    "--no-simulate",
    "--continue",
    "--part",
    "--no-overwrites",
    "--no-mtime",
    "--retries",
    "10",
    "--fragment-retries",
    "10",
    "--retry-sleep",
    "http:exp=1:20",
    "--retry-sleep",
    "fragment:exp=1:20",
    "--no-write-info-json",
    ...options.persistDescriptiveMetadata ? ["--write-description", "--write-thumbnail"] : ["--no-write-description", "--no-write-thumbnail"],
    ...captionArgs(options.caption),
    ...options.audioOnly && options.mode === "audio" ? ["--format", "bestaudio"] : modeArgs(options.mode),
    ...options.maximumBytes === undefined ? [] : ["--max-filesize", String(options.maximumBytes)],
    "--paths",
    `home:${options.captureDirectory}`,
    "--paths",
    `temp:${options.temporaryDirectory}`,
    "--output",
    "media.%(ext)s",
    "--print",
    captureIdentityPrintArg(options.mode),
    ...authenticationArgs(options),
    "--",
    options.url
  ];
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasIdentityControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint >= 127 && codePoint <= 159)) {
      return true;
    }
  }
  return false;
}
function boundedIdentityString2(value) {
  if (typeof value !== "string")
    return null;
  return value.length > 0 && value.length <= CAPTURE_IDENTITY_MAX_CODE_UNITS && !hasIdentityControlCharacter(value) && isWellFormedIdentity(value) ? value : null;
}
function isSafeYtDlpCaptureExtension(value) {
  return typeof value === "string" && value.length > 0 && value.length <= CAPTURE_EXTENSION_MAX_CODE_UNITS && /^[a-z0-9]+$/u.test(value) && !RESERVED_CAPTURE_EXTENSIONS.has(value);
}
function parseYtDlpCaptureIdentity(stdout) {
  if (typeof stdout !== "string") {
    return { ok: false, diagnostic: "yt-dlp capture did not return an identity record" };
  }
  const records = stdout.split(`
`).filter((line) => line.startsWith(CAPTURE_IDENTITY_PREFIX));
  if (records.length === 0) {
    return { ok: false, diagnostic: "yt-dlp capture did not return an identity record" };
  }
  if (records.length !== 1) {
    return { ok: false, diagnostic: "yt-dlp capture returned multiple identity records" };
  }
  const record = records[0];
  if (record === undefined) {
    return { ok: false, diagnostic: "yt-dlp capture did not return an identity record" };
  }
  let value;
  try {
    value = JSON.parse(record.slice(CAPTURE_IDENTITY_PREFIX.length));
  } catch {
    return { ok: false, diagnostic: "yt-dlp capture returned a malformed identity record" };
  }
  if (!isRecord2(value)) {
    return { ok: false, diagnostic: "yt-dlp capture returned a malformed identity record" };
  }
  const keys = Object.keys(value).toSorted();
  if (keys.length !== 3 || keys[0] !== "ext" || keys[1] !== "extractor" || keys[2] !== "id") {
    return { ok: false, diagnostic: "yt-dlp capture returned a malformed identity record" };
  }
  const extractor = boundedIdentityString2(value["extractor"]);
  const id = boundedIdentityString2(value["id"]);
  const ext = value["ext"];
  if (extractor === null || id === null || !isSafeYtDlpCaptureExtension(ext)) {
    return { ok: false, diagnostic: "yt-dlp capture returned a malformed identity record" };
  }
  return { ok: true, identity: { extractor, id, ext } };
}
async function probeWithYtDlp(options, dependencies = defaultDependencies) {
  const result = await dependencies.runProcess(buildYtDlpProbeArgv(options), {
    ...options.signal === undefined ? {} : { signal: options.signal },
    timeoutMs: PROBE_TIMEOUT_MS,
    processGroup: options.processGroup !== "inherit",
    maxStdoutBytes: PROBE_STDOUT_LIMIT_BYTES,
    maxStderrBytes: TOOL_STDERR_LIMIT_BYTES,
    redactions: [
      options.url,
      ...urlDerivedRedactions(options.url),
      ...options.browser === undefined ? [] : [options.browser]
    ]
  });
  if (!result.ok) {
    return {
      ok: false,
      diagnostic: result.diagnostic,
      processReason: result.reason
    };
  }
  if (result.stdoutTruncated)
    return { ok: false, diagnostic: "yt-dlp probe exceeded Ghostget media's metadata limit" };
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    return { ok: false, diagnostic: "yt-dlp probe did not return valid JSON" };
  }
  const parsed = parseProbeMetadata(value, options.url, authorizationIdentity(options));
  if (parsed.ok || parsed.kind === "unsupported")
    return parsed;
  return { ok: false, diagnostic: parsed.message };
}
async function captureWithYtDlp(options, dependencies = defaultDependencies) {
  const result = await dependencies.runProcess(buildYtDlpCaptureArgv(options), {
    ...options.signal === undefined ? {} : { signal: options.signal },
    timeoutMs: options.timeoutMs ?? CAPTURE_TIMEOUT_MS,
    processGroup: options.processGroup !== "inherit",
    maxStdoutBytes: CAPTURE_STDOUT_LIMIT_BYTES,
    maxStderrBytes: TOOL_STDERR_LIMIT_BYTES,
    redactions: [
      options.url,
      ...urlDerivedRedactions(options.url),
      ...options.privateRedactions ?? [],
      ...options.browser === undefined ? [] : [options.browser]
    ]
  });
  if (!result.ok) {
    return {
      ok: false,
      diagnostic: result.diagnostic,
      processReason: result.reason
    };
  }
  if (result.stdoutTruncated) {
    return { ok: false, diagnostic: "yt-dlp capture exceeded Ghostget media's identity output limit" };
  }
  return parseYtDlpCaptureIdentity(result.stdout);
}

// src/media/http.ts
import { createHash as createHash4 } from "crypto";
var DIRECT_HTTP_MAX_REDIRECTS = 5;
var DIRECT_HTTP_PROBE_BYTES = 65536;
var DIRECT_HTTP_MAX_BODY_BYTES = 64 * 1024 * 1024 * 1024;
var HTTP_TOKEN_PATTERN = /^[a-z0-9!#$%&'*+.^_`|~-]{1,127}$/iu;
var MEDIA_TYPE_PATTERN = /^[a-z0-9!#$%&'*+.^_`|~-]{1,127}\/[a-z0-9!#$%&'*+.^_`|~-]{1,127}$/u;
var IMF_FIXDATE_PATTERN = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u;
function directHttpMediaForContainer(container) {
  switch (container) {
    case "iso-bmff":
      return { container, extension: "mp4", mediaType: "video/mp4" };
    case "matroska":
      return { container, extension: "mkv", mediaType: "video/x-matroska" };
    case "webm":
      return { container, extension: "webm", mediaType: "video/webm" };
    case "ogg":
      return { container, extension: "ogg", mediaType: "application/ogg" };
    case "flac":
      return { container, extension: "flac", mediaType: "audio/flac" };
    case "wave":
      return { container, extension: "wav", mediaType: "audio/wav" };
    case "mp3":
      return { container, extension: "mp3", mediaType: "audio/mpeg" };
    case "mpeg-ts":
      return { container, extension: "ts", mediaType: "video/mp2t" };
  }
}

class DirectHttpBoundaryError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "DirectHttpBoundaryError";
    this.code = code;
  }
}
function sha256Hex(value) {
  return createHash4("sha256").update(value).digest("hex");
}
function parseContentLength(value) {
  if (value === null || !/^(?:0|[1-9]\d*)$/u.test(value))
    return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
function parseContentRange(value) {
  if (value === null)
    return null;
  const match = /^bytes (0|[1-9]\d*)-(0|[1-9]\d*)\/(\*|0|[1-9]\d*)$/u.exec(value);
  if (match === null)
    return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === "*" ? null : Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || total !== null && (!Number.isSafeInteger(total) || total <= end))
    return null;
  return { start, end, total };
}
function normalizeDeclaredMediaType(value) {
  if (value === null || value.length > 512 || value.includes(",") || hasHttpControl(value, true)) {
    return null;
  }
  const [rawType = "", ...parameters] = value.split(";");
  const candidate = rawType.trim().toLowerCase();
  if (!MEDIA_TYPE_PATTERN.test(candidate))
    return null;
  for (const parameter of parameters) {
    const trimmed = parameter.trim();
    const equals = trimmed.indexOf("=");
    if (equals <= 0)
      return null;
    const name = trimmed.slice(0, equals).trim();
    const parameterValue = trimmed.slice(equals + 1).trim();
    if (!HTTP_TOKEN_PATTERN.test(name) || !HTTP_TOKEN_PATTERN.test(parameterValue) && !validQuotedParameter(parameterValue))
      return null;
  }
  return candidate;
}
function validQuotedParameter(value) {
  if (value.length < 2 || value[0] !== '"' || value.at(-1) !== '"')
    return false;
  for (let index = 1;index < value.length - 1; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 92) {
      index += 1;
      if (index >= value.length - 1)
        return false;
      const escaped = value.charCodeAt(index);
      if (!(escaped === 9 || escaped >= 32 && escaped <= 126 || escaped >= 128 && escaped <= 255)) {
        return false;
      }
      continue;
    }
    if (!(code === 9 || code === 32 || code === 33 || code >= 35 && code <= 91 || code >= 93 && code <= 126 || code >= 128 && code <= 255)) {
      return false;
    }
  }
  return true;
}
function conflictsWithDirectMedia(value) {
  const mediaType = normalizeDeclaredMediaType(value);
  if (mediaType === null)
    return false;
  return mediaType.startsWith("text/") || mediaType === "application/json" || mediaType.endsWith("+json") || mediaType === "application/xml" || mediaType.endsWith("+xml") || mediaType === "application/xhtml+xml";
}
function normalizeLastModified(value) {
  if (value === null || !IMF_FIXDATE_PATTERN.test(value))
    return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds))
    return null;
  const normalized = new Date(milliseconds).toUTCString();
  return normalized === value ? normalized : null;
}
function validatorFromEtag(value) {
  const parsed = parseEntityTag(value);
  if (parsed === null) {
    return { strength: "absent" };
  }
  return {
    strength: parsed.strength,
    sha256: sha256Hex(parsed.raw)
  };
}
function strongEtag(value) {
  const parsed = parseEntityTag(value);
  return parsed?.strength === "strong" ? parsed.raw : null;
}
function parseEntityTag(value) {
  if (value === null || value.length < 2 || value.length > 8192)
    return null;
  const weak = value.startsWith("W/");
  const quoted = weak ? value.slice(2) : value;
  if (quoted.length < 2 || quoted[0] !== '"' || quoted.at(-1) !== '"')
    return null;
  for (let index = 1;index < quoted.length - 1; index += 1) {
    const code = quoted.charCodeAt(index);
    if (!(code === 33 || code >= 35 && code <= 126 || code >= 128 && code <= 255)) {
      return null;
    }
  }
  return { strength: weak ? "weak" : "strong", raw: value };
}
function asciiEquals(bytes, offset, value) {
  if (bytes.byteLength < offset + value.length)
    return false;
  for (let index = 0;index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index))
      return false;
  }
  return true;
}
function hasMpegTransportSync(bytes) {
  for (let offset = 0;offset < 188 && offset + 567 < bytes.byteLength; offset += 1) {
    let valid = true;
    for (let packet = 0;packet < 4; packet += 1) {
      const start = offset + packet * 188;
      const adaptationControl = (bytes[start + 3] ?? 0) >> 4 & 3;
      if (bytes[start] !== 71 || ((bytes[start + 1] ?? 0) & 128) !== 0 || adaptationControl === 0) {
        valid = false;
        break;
      }
    }
    if (valid) {
      return true;
    }
  }
  return false;
}
function readEbmlVint(bytes, offset, retainMarker) {
  const first = bytes[offset];
  if (first === undefined || first === 0)
    return null;
  let length = 1;
  let marker = 128;
  while (length <= 8 && (first & marker) === 0) {
    length += 1;
    marker >>= 1;
  }
  if (length > 8 || offset + length > bytes.byteLength)
    return null;
  let value = retainMarker ? first : first & marker - 1;
  for (let index = 1;index < length; index += 1) {
    value = value * 256 + (bytes[offset + index] ?? 0);
    if (!Number.isSafeInteger(value))
      return null;
  }
  return { value, length };
}
function ebmlDocType(bytes) {
  const headerSize = readEbmlVint(bytes, 4, false);
  if (headerSize === null)
    return null;
  const start = 4 + headerSize.length;
  const end = start + headerSize.value;
  if (end > bytes.byteLength || end - start > 4096)
    return null;
  let cursor = start;
  while (cursor < end) {
    const id = readEbmlVint(bytes, cursor, true);
    if (id === null)
      return null;
    const size = readEbmlVint(bytes, cursor + id.length, false);
    if (size === null)
      return null;
    const valueStart = cursor + id.length + size.length;
    const valueEnd = valueStart + size.value;
    if (valueEnd > end)
      return null;
    if (id.value === 17026) {
      if (size.value < 1 || size.value > 32)
        return null;
      let value = "";
      for (let index = valueStart;index < valueEnd; index += 1) {
        const byte = bytes[index];
        if (byte === undefined || byte > 127)
          return null;
        value += String.fromCharCode(byte);
      }
      return value;
    }
    cursor = valueEnd;
  }
  return null;
}
function isValidOggHeader(bytes) {
  if (!asciiEquals(bytes, 0, "OggS") || bytes.byteLength < 27 || bytes[4] !== 0)
    return false;
  const segmentCount = bytes[26] ?? 0;
  return bytes.byteLength >= 27 + segmentCount;
}
function isValidId3Header(bytes) {
  if (!asciiEquals(bytes, 0, "ID3") || bytes.byteLength < 10)
    return false;
  const version = bytes[3] ?? 0;
  const revision = bytes[4] ?? 255;
  const flags = bytes[5] ?? 255;
  if (version < 2 || version > 4 || revision === 255)
    return false;
  const invalidFlagMask = version === 2 ? 63 : version === 3 ? 31 : 15;
  if ((flags & invalidFlagMask) !== 0)
    return false;
  return [6, 7, 8, 9].every((index) => ((bytes[index] ?? 128) & 128) === 0);
}
function detectDirectHttpMedia(bytes) {
  if (bytes.byteLength >= 16 && asciiEquals(bytes, 4, "ftyp")) {
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, false);
    const ordinarySize = boxSize === 0 || boxSize >= 16;
    const largeSize = boxSize === 1 && bytes.byteLength >= 24 && new DataView(bytes.buffer, bytes.byteOffset + 8, 8).getBigUint64(0, false) >= 24n;
    if (ordinarySize || largeSize) {
      return directHttpMediaForContainer("iso-bmff");
    }
  }
  if (bytes.byteLength >= 4 && bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163) {
    const docType = ebmlDocType(bytes);
    if (docType === "webm") {
      return directHttpMediaForContainer("webm");
    }
    if (docType === "matroska") {
      return directHttpMediaForContainer("matroska");
    }
    return null;
  }
  if (isValidOggHeader(bytes)) {
    return directHttpMediaForContainer("ogg");
  }
  if (asciiEquals(bytes, 0, "fLaC")) {
    return directHttpMediaForContainer("flac");
  }
  if (asciiEquals(bytes, 0, "RIFF") && asciiEquals(bytes, 8, "WAVE")) {
    return directHttpMediaForContainer("wave");
  }
  if (isValidId3Header(bytes)) {
    return directHttpMediaForContainer("mp3");
  }
  if (hasMpegTransportSync(bytes)) {
    return directHttpMediaForContainer("mpeg-ts");
  }
  return null;
}
function parsePublicHttpUrl(value) {
  if (value.length === 0 || value.length > 8192 || hasHttpControl(value)) {
    throw new DirectHttpBoundaryError("invalid-url", "direct HTTP URL is malformed");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DirectHttpBoundaryError("invalid-url", "direct HTTP URL is malformed");
  }
  if (url.username !== "" || url.password !== "") {
    throw new DirectHttpBoundaryError("credentials-not-allowed", "direct HTTP does not accept URL credentials");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DirectHttpBoundaryError("unsupported-protocol", "direct HTTP accepts only HTTP(S)");
  }
  url.hash = "";
  return url;
}
function hasHttpControl(value, allowTab = false) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && ((!allowTab || code !== 9) && (code <= 31 || code >= 127 && code <= 159)))
      return true;
  }
  return false;
}
function resolveDirectHttpRedirect(current, location) {
  if (location.length === 0 || location.length > 8192 || hasHttpControl(location)) {
    throw new DirectHttpBoundaryError("invalid-redirect", "direct HTTP redirect is malformed");
  }
  let next;
  try {
    next = new URL(location, current);
  } catch {
    throw new DirectHttpBoundaryError("invalid-redirect", "direct HTTP redirect is malformed");
  }
  const safe = parsePublicHttpUrl(next.href);
  if (current.protocol === "https:" && safe.protocol !== "https:") {
    throw new DirectHttpBoundaryError("https-downgrade", "direct HTTP refuses an HTTPS downgrade");
  }
  return safe;
}
function publicOrigin(url) {
  return `${url.origin}/`;
}

// src/media/http-probe.ts
var DEFAULT_REQUEST_TIMEOUT_MS = 30000;
var DIRECT_HTTP_ACCEPT = "video/*, audio/*, application/ogg, application/octet-stream;q=0.5";
var REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class DirectHttpTransportError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "DirectHttpTransportError";
    this.code = code;
  }
}

class DirectHttpProbeTransport {
  #requestUrl;
  constructor(value) {
    this.#requestUrl = parsePublicHttpUrl(value).href;
    Object.freeze(this);
  }
  requestUrl() {
    return this.#requestUrl;
  }
  toJSON() {
    return { kind: "opaque-direct-http-transport" };
  }
}
var defaultFetchDependencies = {
  fetch: async (input, init) => await fetch(input, init)
};
function normalizeBoundedInteger(value, fallback, minimum, maximum) {
  if (value === undefined)
    return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new DirectHttpTransportError("invalid-request", "direct HTTP numeric option is outside its supported range");
  }
  return value;
}
function ownedHeaders(request) {
  const headers = new Headers({
    Accept: DIRECT_HTTP_ACCEPT,
    "Accept-Encoding": "identity"
  });
  if (request.method === "GET") {
    if (request.range !== undefined)
      headers.set("Range", request.range);
    if (request.ifRange !== undefined)
      headers.set("If-Range", request.ifRange);
  }
  return headers;
}
function cancelBody(response) {
  response.body?.cancel().catch(() => {});
}
function validRange(value) {
  const match = /^bytes=(0|[1-9]\d*)-(0|[1-9]\d*)?$/u.exec(value);
  if (match === null)
    return false;
  const start = Number(match[1]);
  const end = match[2] === undefined ? null : Number(match[2]);
  return Number.isSafeInteger(start) && start >= 0 && (end === null || Number.isSafeInteger(end) && end >= start);
}
function validateOwnedRequest(request) {
  if (request.method === "HEAD")
    return;
  if (request.method !== "GET") {
    throw new DirectHttpTransportError("invalid-request", "direct HTTP method is invalid");
  }
  if (request.range !== undefined && !validRange(request.range)) {
    throw new DirectHttpTransportError("invalid-request", "direct HTTP range is invalid");
  }
  if (request.ifRange !== undefined && strongEtag(request.ifRange) !== request.ifRange) {
    throw new DirectHttpTransportError("invalid-request", "direct HTTP resume validator is invalid");
  }
}
function boundaryAsTransport(error) {
  return new DirectHttpTransportError(error.code === "too-many-redirects" ? "too-many-redirects" : "redirect-policy", "direct HTTP rejected the request or redirect policy");
}
function abortReason(signal, timedOut) {
  return timedOut ? new DirectHttpTransportError("timeout", "direct HTTP request timed out") : new DirectHttpTransportError(signal.aborted ? "aborted" : "network", signal.aborted ? "direct HTTP request was aborted" : "direct HTTP request failed");
}
async function fetchWithDirectRedirects(value, request, options = {}, dependencies = defaultFetchDependencies) {
  validateOwnedRequest(request);
  let requestedUrl;
  try {
    requestedUrl = parsePublicHttpUrl(value);
  } catch (error) {
    if (error instanceof DirectHttpBoundaryError)
      throw boundaryAsTransport(error);
    throw new DirectHttpTransportError("invalid-request", "direct HTTP request is invalid");
  }
  const maxRedirects = normalizeBoundedInteger(options.maxRedirects, DIRECT_HTTP_MAX_REDIRECTS, 0, DIRECT_HTTP_MAX_REDIRECTS);
  const timeoutMs = normalizeBoundedInteger(options.timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, 1, 10 * 60000);
  if (request.method === "GET" && request.ifRange !== undefined && maxRedirects !== 0) {
    throw new DirectHttpTransportError("invalid-request", "direct HTTP resume requests must disable redirects");
  }
  const controller = new AbortController;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });
  if (options.signal?.aborted === true)
    controller.abort();
  let current = requestedUrl;
  let redirectCount = 0;
  let handedOff = false;
  let disposed = false;
  const dispose = () => {
    if (disposed)
      return;
    disposed = true;
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  };
  try {
    while (true) {
      let response;
      try {
        response = await dependencies.fetch(current.href, {
          method: request.method,
          headers: ownedHeaders(request),
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: controller.signal
        });
      } catch {
        throw abortReason(controller.signal, timedOut);
      }
      if (!REDIRECT_STATUSES.has(response.status)) {
        clearTimeout(timeout);
        handedOff = true;
        return { response, requestedUrl, effectiveUrl: current, redirectCount, dispose };
      }
      const location = response.headers.get("location");
      cancelBody(response);
      if (location === null) {
        throw new DirectHttpTransportError("redirect-policy", "direct HTTP redirect omitted its target");
      }
      if (redirectCount >= maxRedirects) {
        throw new DirectHttpTransportError("too-many-redirects", "direct HTTP exceeded the redirect limit");
      }
      try {
        current = resolveDirectHttpRedirect(current, location);
      } catch (error) {
        if (error instanceof DirectHttpBoundaryError)
          throw boundaryAsTransport(error);
        throw new DirectHttpTransportError("redirect-policy", "direct HTTP rejected a redirect");
      }
      redirectCount += 1;
    }
  } finally {
    if (!handedOff)
      dispose();
  }
}
function probeError(code, message) {
  return { ok: false, kind: "error", error: { code, message } };
}
function declaredLength(headers) {
  const rawLength = headers.get("content-length");
  const contentLength = parseContentLength(rawLength);
  if (rawLength !== null && contentLength === null)
    return null;
  return { expectedBytes: contentLength, responseBytes: contentLength };
}
function rangedLength(response, probeBytes) {
  const contentRange = parseContentRange(response.headers.get("content-range"));
  if (contentRange === null || contentRange.start !== 0 || contentRange.end >= probeBytes) {
    return null;
  }
  const responseBytes = contentRange.end - contentRange.start + 1;
  const rawLength = response.headers.get("content-length");
  const contentLength = parseContentLength(rawLength);
  if (rawLength !== null && (contentLength === null || contentLength !== responseBytes))
    return null;
  return { expectedBytes: contentRange.total, responseBytes };
}
async function boundedResponsePrefix(response, maximumBytes, timeoutMs, inspectOverflowAtLimit) {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return { bytes: new Uint8Array, ended: true, overflowed: false };
  }
  const chunks = [];
  let total = 0;
  let ended = false;
  let overflowed = false;
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      if (total === maximumBytes && !inspectOverflowAtLimit)
        break;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0)
        throw new Error("probe body timeout");
      const read = await readWithDeadline(reader, remainingMs);
      if (read.done) {
        ended = true;
        break;
      }
      if (total === maximumBytes) {
        overflowed = read.value.byteLength > 0;
        break;
      }
      const remaining = maximumBytes - total;
      const chunk = read.value.byteLength <= remaining ? read.value : read.value.subarray(0, remaining);
      chunks.push(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < read.value.byteLength) {
        overflowed = true;
        break;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, ended, overflowed };
}
async function readWithDeadline(reader, timeoutMs) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("probe body timeout")), timeoutMs);
    reader.read().then((result) => {
      clearTimeout(timer);
      if (result.done) {
        resolve({ done: true });
      } else if (result.value !== undefined) {
        resolve({ done: false, value: result.value });
      } else {
        reject(new Error("probe body reader omitted a chunk"));
      }
    }, (error) => {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error("probe body read failed"));
    });
  });
}
async function probeDirectHttp(value, options = {}, dependencies = defaultFetchDependencies) {
  let maximumBodyBytes;
  let probeBytes;
  let bodyTimeoutMs;
  let headTimeoutMs;
  try {
    maximumBodyBytes = normalizeBoundedInteger(options.maximumBodyBytes, DIRECT_HTTP_MAX_BODY_BYTES, 1, DIRECT_HTTP_MAX_BODY_BYTES);
    probeBytes = normalizeBoundedInteger(options.probeBytes, DIRECT_HTTP_PROBE_BYTES, 1, DIRECT_HTTP_PROBE_BYTES);
    bodyTimeoutMs = normalizeBoundedInteger(options.timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, 1, 10 * 60000);
    headTimeoutMs = normalizeBoundedInteger(options.headTimeoutMs, 5000, 1, 30000);
    normalizeBoundedInteger(options.maxRedirects, DIRECT_HTTP_MAX_REDIRECTS, 0, DIRECT_HTTP_MAX_REDIRECTS);
  } catch (error) {
    return probeError("invalid-request", error instanceof DirectHttpTransportError ? error.message : "direct HTTP probe options are invalid");
  }
  const common = {
    ...options.maxRedirects === undefined ? {} : { maxRedirects: options.maxRedirects },
    ...options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
    ...options.signal === undefined ? {} : { signal: options.signal }
  };
  const probeLimit = Math.min(probeBytes, maximumBodyBytes);
  try {
    const head = await fetchWithDirectRedirects(value, { method: "HEAD" }, {
      ...common,
      timeoutMs: headTimeoutMs
    }, dependencies);
    cancelBody(head.response);
    head.dispose();
  } catch {}
  let fetched;
  try {
    fetched = await fetchWithDirectRedirects(value, { method: "GET", range: `bytes=0-${String(probeLimit - 1)}` }, common, dependencies);
  } catch (error) {
    if (error instanceof DirectHttpTransportError)
      return probeError(error.code, error.message);
    return probeError("network", "direct HTTP probe failed");
  }
  const { response } = fetched;
  try {
    if (response.status !== 200 && response.status !== 206) {
      cancelBody(response);
      return { ok: false, kind: "not-applicable", reason: "http-status" };
    }
    const contentEncoding = response.headers.get("content-encoding")?.trim().toLowerCase();
    if (contentEncoding !== undefined && contentEncoding !== "" && contentEncoding !== "identity") {
      cancelBody(response);
      return probeError("unsupported-content-encoding", "direct HTTP response did not use identity encoding");
    }
    const length = response.status === 206 ? rangedLength(response, probeLimit) : declaredLength(response.headers);
    if (length === null) {
      cancelBody(response);
      return probeError("invalid-response-length", "direct HTTP response length is inconsistent");
    }
    if (length.expectedBytes !== null && length.expectedBytes > maximumBodyBytes) {
      cancelBody(response);
      return probeError("body-too-large", "direct HTTP body exceeds the configured limit");
    }
    let prefix;
    try {
      prefix = await boundedResponsePrefix(response, probeLimit, bodyTimeoutMs, length.responseBytes !== null || probeLimit === maximumBodyBytes);
    } catch {
      return probeError("response-read", "direct HTTP probe body could not be read");
    }
    if (length.responseBytes !== null && (length.responseBytes <= probeLimit && (prefix.bytes.byteLength !== length.responseBytes || prefix.overflowed) || prefix.ended && prefix.bytes.byteLength !== length.responseBytes)) {
      return probeError("invalid-response-length", "direct HTTP response body length disagrees with headers");
    }
    if (probeLimit === maximumBodyBytes && prefix.overflowed) {
      return probeError("body-too-large", "direct HTTP body exceeds the configured limit");
    }
    if (prefix.bytes.byteLength === 0) {
      return { ok: false, kind: "not-applicable", reason: "empty-response" };
    }
    const rawMediaType = response.headers.get("content-type");
    const declaredMediaType = normalizeDeclaredMediaType(rawMediaType);
    if (rawMediaType !== null && declaredMediaType === null) {
      return probeError("invalid-content-type", "direct HTTP response media type is malformed");
    }
    if (conflictsWithDirectMedia(rawMediaType)) {
      return { ok: false, kind: "not-applicable", reason: "declared-text" };
    }
    const media = detectDirectHttpMedia(prefix.bytes);
    if (media === null) {
      return { ok: false, kind: "not-applicable", reason: "unrecognized-media" };
    }
    const requestedUrl = fetched.requestedUrl.href;
    const effectiveUrl = fetched.effectiveUrl.href;
    return {
      ok: true,
      probe: {
        transport: new DirectHttpProbeTransport(requestedUrl),
        publicOrigin: publicOrigin(fetched.requestedUrl),
        requestedUrlSha256: sha256Hex(requestedUrl),
        effectiveUrlSha256: sha256Hex(effectiveUrl),
        redirectCount: fetched.redirectCount,
        declaredMediaType,
        lastModified: normalizeLastModified(response.headers.get("last-modified")),
        validator: validatorFromEtag(response.headers.get("etag")),
        media,
        expectedBytes: length.expectedBytes
      }
    };
  } finally {
    fetched.dispose();
  }
}

// src/media/http-capture.ts
import { createHash as createHash5 } from "crypto";
var DEFAULT_ATTEMPTS = 3;
var DEFAULT_INACTIVITY_TIMEOUT_MS = 30000;
var DEFAULT_TOTAL_TIMEOUT_MS = 2 * 60 * 60 * 1000;
var defaultCaptureDependencies = {
  request: async (url, request, options) => await fetchWithDirectRedirects(url, request, options)
};

class CaptureFailure extends Error {
  code;
  retryable;
  resumeRejected;
  constructor(code, message, options = {}) {
    super(message);
    this.name = "CaptureFailure";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.resumeRejected = options.resumeRejected ?? false;
  }
}
function freshState() {
  return {
    bytes: 0,
    hash: createHash5("sha256"),
    prefix: new Uint8Array(DIRECT_HTTP_PROBE_BYTES),
    prefixBytes: 0,
    expectedBytes: null,
    strongEtag: null,
    validator: { strength: "absent" },
    effectiveUrl: null,
    effectiveUrlSha256: null,
    redirectCount: 0,
    declaredMediaType: null,
    lastModified: null
  };
}
function normalizeBoundedInteger2(value, fallback, minimum, maximum) {
  if (value === undefined)
    return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new CaptureFailure("invalid-request", "direct HTTP numeric option is outside its supported range");
  }
  return value;
}
function captureFailure(error, fallback, retryable) {
  return error instanceof CaptureFailure ? error : new CaptureFailure(fallback, "direct HTTP capture failed", { retryable });
}
function safeCancel(response) {
  response.body?.cancel().catch(() => {});
}
function validIdentityEncoding(response) {
  const encoding = response.headers.get("content-encoding")?.trim().toLowerCase();
  return encoding === undefined || encoding === "" || encoding === "identity";
}
function exactContentLength(response) {
  const raw = response.headers.get("content-length");
  if (raw === null)
    return null;
  return parseContentLength(raw) ?? "invalid";
}
function validateInitialResponse(fetched, state, maximumBodyBytes) {
  const { response } = fetched;
  if (response.status !== 200 && response.status !== 206) {
    throw new CaptureFailure("http-status", "direct HTTP capture returned an unsupported status");
  }
  if (!validIdentityEncoding(response)) {
    throw new CaptureFailure("unsupported-content-encoding", "direct HTTP capture did not use identity encoding");
  }
  const rawMediaType = response.headers.get("content-type");
  const declaredMediaType = normalizeDeclaredMediaType(rawMediaType);
  if (rawMediaType !== null && declaredMediaType === null) {
    throw new CaptureFailure("invalid-content-type", "direct HTTP capture media type is malformed");
  }
  if (conflictsWithDirectMedia(rawMediaType)) {
    throw new CaptureFailure("declared-text", "direct HTTP capture declared a text response");
  }
  const contentLength = exactContentLength(response);
  if (contentLength === "invalid") {
    throw new CaptureFailure("invalid-response-length", "direct HTTP capture length is invalid");
  }
  if (response.status === 206) {
    const range = parseContentRange(response.headers.get("content-range"));
    if (range === null || range.start !== 0 || range.total === null || range.end !== range.total - 1 || contentLength !== null && contentLength !== range.total) {
      throw new CaptureFailure("invalid-response-length", "direct HTTP initial range is not a complete body");
    }
    state.expectedBytes = range.total;
  } else {
    state.expectedBytes = contentLength;
  }
  if (state.expectedBytes !== null && state.expectedBytes > maximumBodyBytes) {
    throw new CaptureFailure("body-too-large", "direct HTTP body exceeds the configured limit");
  }
  state.strongEtag = strongEtag(response.headers.get("etag"));
  state.validator = validatorFromEtag(response.headers.get("etag"));
  state.effectiveUrl = fetched.effectiveUrl.href;
  state.effectiveUrlSha256 = sha256Hex(fetched.effectiveUrl.href);
  state.redirectCount = fetched.redirectCount;
  state.declaredMediaType = declaredMediaType;
  state.lastModified = normalizeLastModified(response.headers.get("last-modified"));
}
function validateResumeResponse(fetched, state, maximumBodyBytes) {
  const reject = () => {
    throw new CaptureFailure("invalid-response-length", "direct HTTP resume was not an exact continuation", { retryable: true, resumeRejected: true });
  };
  const { response } = fetched;
  if (response.status !== 206 || !validIdentityEncoding(response) || state.strongEtag === null || strongEtag(response.headers.get("etag")) !== state.strongEtag || fetched.requestedUrl.href !== state.effectiveUrl || fetched.effectiveUrl.href !== state.effectiveUrl || fetched.redirectCount !== 0)
    reject();
  const range = parseContentRange(response.headers.get("content-range"));
  if (range === null || range.total === null) {
    throw new CaptureFailure("invalid-response-length", "direct HTTP resume was not an exact continuation", { retryable: true, resumeRejected: true });
  }
  const total = range.total;
  if (range.start !== state.bytes || range.end !== total - 1 || state.expectedBytes !== null && total !== state.expectedBytes)
    reject();
  const contentLength = exactContentLength(response);
  const remaining = total - state.bytes;
  if (contentLength === "invalid" || contentLength !== null && contentLength !== remaining)
    reject();
  if (total > maximumBodyBytes) {
    throw new CaptureFailure("body-too-large", "direct HTTP body exceeds the configured limit");
  }
  const rawMediaType = response.headers.get("content-type");
  if (rawMediaType !== null && normalizeDeclaredMediaType(rawMediaType) === null || conflictsWithDirectMedia(rawMediaType))
    reject();
  state.expectedBytes = total;
}
async function readWithTimeout(reader, timeoutMs, signal) {
  const result = await awaitInterruptibly(reader.read(), timeoutMs, signal, () => new Error("capture body timeout"));
  if (result.done)
    return { done: true };
  if (result.value !== undefined)
    return { done: false, value: result.value };
  throw new Error("capture body reader omitted a chunk");
}
async function streamResponse(response, sink, state, maximumBodyBytes, inactivityTimeoutMs, deadline, signal) {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new CaptureFailure("response-read", "direct HTTP capture returned no body", { retryable: true });
  }
  try {
    while (true) {
      const totalRemainingMs = deadline - Date.now();
      if (totalRemainingMs <= 0) {
        throw new CaptureFailure("total-timeout", "direct HTTP capture exceeded its total timeout");
      }
      let read;
      try {
        read = await readWithTimeout(reader, Math.min(inactivityTimeoutMs, totalRemainingMs), signal);
      } catch (error) {
        if (error instanceof CaptureFailure)
          throw error;
        throw new CaptureFailure("response-read", "direct HTTP capture body stalled or failed", { retryable: true });
      }
      if (read.done)
        break;
      const chunk = read.value;
      if (state.bytes + chunk.byteLength > maximumBodyBytes) {
        throw new CaptureFailure("body-too-large", "direct HTTP body exceeds the configured limit");
      }
      if (state.expectedBytes !== null && state.bytes + chunk.byteLength > state.expectedBytes) {
        throw new CaptureFailure("invalid-response-length", "direct HTTP response exceeded its declared length");
      }
      try {
        await sinkOperation(sink.write(chunk, signal), deadline, signal, "direct HTTP capture could not write its destination");
      } catch (error) {
        if (error instanceof CaptureFailure)
          throw error;
        throw new CaptureFailure("sink", "direct HTTP capture could not write its destination");
      }
      state.hash.update(chunk);
      if (state.prefixBytes < state.prefix.byteLength) {
        const copied = Math.min(chunk.byteLength, state.prefix.byteLength - state.prefixBytes);
        state.prefix.set(chunk.subarray(0, copied), state.prefixBytes);
        state.prefixBytes += copied;
      }
      state.bytes += chunk.byteLength;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (state.expectedBytes !== null && state.bytes !== state.expectedBytes) {
    throw new CaptureFailure("invalid-response-length", "direct HTTP response ended before its declared length", { retryable: true });
  }
}
async function sinkOperation(operation, deadline, signal, timeoutMessage) {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new CaptureFailure("total-timeout", "direct HTTP capture exceeded its total timeout");
  }
  await awaitInterruptibly(operation, remainingMs, signal, () => new CaptureFailure("total-timeout", timeoutMessage));
}
async function awaitInterruptibly(operation, timeoutMs, signal, timeoutError) {
  if (signal.aborted) {
    throw new CaptureFailure("aborted", "direct HTTP capture was aborted");
  }
  let timer;
  let abort;
  try {
    return await Promise.race([
      operation,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(timeoutError()), timeoutMs);
        abort = () => reject(new CaptureFailure("aborted", "direct HTTP capture was aborted"));
        signal.addEventListener("abort", abort, { once: true });
      })
    ]);
  } finally {
    if (timer !== undefined)
      clearTimeout(timer);
    if (abort !== undefined)
      signal.removeEventListener("abort", abort);
  }
}
async function abortSink(sink, signal) {
  let timer;
  try {
    await Promise.race([
      sink.abort(signal),
      new Promise((resolve) => {
        timer = setTimeout(resolve, 5000);
      })
    ]);
  } catch {} finally {
    if (timer !== undefined)
      clearTimeout(timer);
  }
}
function resultError(error) {
  return { ok: false, error: { code: error.code, message: error.message } };
}
async function captureDirectHttp(probe, sink, options = {}, dependencies = defaultCaptureDependencies) {
  const controller = new AbortController;
  let maximumBodyBytes;
  let maximumAttempts;
  let inactivityTimeoutMs;
  let totalTimeoutMs;
  let probeRequestUrl;
  let requestedUrlSha2562;
  try {
    maximumBodyBytes = normalizeBoundedInteger2(options.maximumBodyBytes, DIRECT_HTTP_MAX_BODY_BYTES, 1, DIRECT_HTTP_MAX_BODY_BYTES);
    maximumAttempts = normalizeBoundedInteger2(options.maximumAttempts, DEFAULT_ATTEMPTS, 1, 10);
    inactivityTimeoutMs = normalizeBoundedInteger2(options.inactivityTimeoutMs, DEFAULT_INACTIVITY_TIMEOUT_MS, 1, 10 * 60000);
    totalTimeoutMs = normalizeBoundedInteger2(options.totalTimeoutMs, DEFAULT_TOTAL_TIMEOUT_MS, 1, 24 * 60 * 60 * 1000);
    normalizeBoundedInteger2(options.maxRedirects, DIRECT_HTTP_MAX_REDIRECTS, 0, DIRECT_HTTP_MAX_REDIRECTS);
    normalizeBoundedInteger2(options.timeoutMs, 30000, 1, 10 * 60000);
    if (!(probe.transport instanceof DirectHttpProbeTransport)) {
      throw new CaptureFailure("invalid-request", "direct HTTP probe transport is invalid");
    }
    probeRequestUrl = probe.transport.requestUrl();
    requestedUrlSha2562 = sha256Hex(probeRequestUrl);
    if (probe.requestedUrlSha256 !== requestedUrlSha2562) {
      throw new CaptureFailure("invalid-request", "direct HTTP probe request digest is invalid");
    }
    const ownedMedia = directHttpMediaForContainer(probe.media.container);
    if (probe.media.extension !== ownedMedia.extension || probe.media.mediaType !== ownedMedia.mediaType) {
      throw new CaptureFailure("invalid-request", "direct HTTP probe media contract is invalid");
    }
  } catch (error) {
    controller.abort();
    await abortSink(sink, controller.signal);
    return resultError(error instanceof CaptureFailure ? error : new CaptureFailure("invalid-request", "direct HTTP capture request is invalid"));
  }
  const deadline = Date.now() + totalTimeoutMs;
  let totalTimedOut = false;
  const totalTimer = setTimeout(() => {
    totalTimedOut = true;
    controller.abort();
  }, totalTimeoutMs);
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });
  if (options.signal?.aborted === true)
    controller.abort();
  const requestOptions = {
    ...options.maxRedirects === undefined ? {} : { maxRedirects: options.maxRedirects },
    ...options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
    signal: controller.signal
  };
  let state = freshState();
  let attempts = 0;
  let next = "initial";
  let resumed = false;
  try {
    while (attempts < maximumAttempts) {
      attempts += 1;
      const request = next === "resume" && state.strongEtag !== null ? { method: "GET", range: `bytes=${String(state.bytes)}-`, ifRange: state.strongEtag } : { method: "GET" };
      const requestUrl = next === "resume" && state.effectiveUrl !== null ? state.effectiveUrl : probeRequestUrl;
      const attemptOptions = next === "resume" ? { ...requestOptions, maxRedirects: 0 } : requestOptions;
      let fetched;
      try {
        fetched = await awaitInterruptibly(dependencies.request(requestUrl, request, attemptOptions), Math.max(1, deadline - Date.now()), controller.signal, () => new CaptureFailure("total-timeout", "direct HTTP capture exceeded its total timeout"));
      } catch (error) {
        const failure = totalTimedOut ? new CaptureFailure("total-timeout", "direct HTTP capture exceeded its total timeout") : error instanceof CaptureFailure ? error : new CaptureFailure("transport", "direct HTTP capture request failed", { retryable: true });
        if (!failure.retryable || attempts >= maximumAttempts) {
          await abortSink(sink, controller.signal);
          return resultError(failure);
        }
        if (next === "initial" && state.bytes === 0)
          continue;
        try {
          await sinkOperation(sink.restart(controller.signal), deadline, controller.signal, "direct HTTP capture could not restart before its total timeout");
        } catch (error2) {
          await abortSink(sink, controller.signal);
          if (error2 instanceof CaptureFailure) {
            return resultError(totalTimedOut ? new CaptureFailure("total-timeout", "direct HTTP capture exceeded its total timeout") : error2);
          }
          return resultError(new CaptureFailure("sink", "direct HTTP capture could not restart its destination"));
        }
        state = freshState();
        next = "initial";
        continue;
      }
      try {
        if (next === "initial" && fetched.requestedUrl.href !== probeRequestUrl) {
          throw new CaptureFailure("transport", "direct HTTP capture request identity changed");
        }
        if (next === "resume")
          validateResumeResponse(fetched, state, maximumBodyBytes);
        else
          validateInitialResponse(fetched, state, maximumBodyBytes);
        await streamResponse(fetched.response, sink, state, maximumBodyBytes, inactivityTimeoutMs, deadline, controller.signal);
        if (next === "resume")
          resumed = true;
      } catch (error) {
        safeCancel(fetched.response);
        const failure = captureFailure(error, "response-read", true);
        if (!failure.retryable || attempts >= maximumAttempts || totalTimedOut) {
          await abortSink(sink, controller.signal);
          return resultError(totalTimedOut ? new CaptureFailure("total-timeout", "direct HTTP capture exceeded its total timeout") : failure);
        }
        if (failure.resumeRejected || state.strongEtag === null || state.bytes === 0) {
          try {
            await sinkOperation(sink.restart(controller.signal), deadline, controller.signal, "direct HTTP capture could not restart before its total timeout");
          } catch (restartError) {
            await abortSink(sink, controller.signal);
            if (restartError instanceof CaptureFailure) {
              return resultError(totalTimedOut ? new CaptureFailure("total-timeout", "direct HTTP capture exceeded its total timeout") : restartError);
            }
            return resultError(new CaptureFailure("sink", "direct HTTP capture could not restart its destination"));
          }
          state = freshState();
          next = "initial";
        } else {
          next = "resume";
        }
        continue;
      } finally {
        fetched.dispose();
      }
      const media = detectDirectHttpMedia(state.prefix.subarray(0, state.prefixBytes));
      if (media === null) {
        await abortSink(sink, controller.signal);
        return resultError(new CaptureFailure("media-unrecognized", "direct HTTP capture did not contain recognized media"));
      }
      const ownedMedia = directHttpMediaForContainer(media.container);
      if (media.container !== probe.media.container || media.extension !== ownedMedia.extension || media.mediaType !== ownedMedia.mediaType) {
        await abortSink(sink, controller.signal);
        return resultError(new CaptureFailure("media-changed", "direct HTTP media changed after its probe"));
      }
      if (state.effectiveUrlSha256 === null) {
        await abortSink(sink, controller.signal);
        return resultError(new CaptureFailure("transport", "direct HTTP capture omitted effective provenance"));
      }
      let sha256;
      try {
        sha256 = state.hash.digest("hex");
        await sinkOperation(sink.close(controller.signal), deadline, controller.signal, "direct HTTP capture could not close before its total timeout");
      } catch (error) {
        await abortSink(sink, controller.signal);
        if (error instanceof CaptureFailure) {
          return resultError(totalTimedOut ? new CaptureFailure("total-timeout", "direct HTTP capture exceeded its total timeout") : error);
        }
        return resultError(new CaptureFailure("sink", "direct HTTP capture could not finalize its destination"));
      }
      const provenance = {
        requestedUrlSha256: requestedUrlSha2562,
        effectiveUrlSha256: state.effectiveUrlSha256,
        validator: state.validator,
        lastModified: state.lastModified,
        declaredMediaType: state.declaredMediaType,
        container: media.container,
        body: { bytes: state.bytes, sha256 },
        redirectCount: state.redirectCount
      };
      return {
        ok: true,
        capture: {
          bytes: state.bytes,
          sha256,
          media,
          provenance,
          attempts,
          resumed
        }
      };
    }
    await abortSink(sink, controller.signal);
    return resultError(new CaptureFailure("transport", "direct HTTP capture exhausted its attempts"));
  } finally {
    clearTimeout(totalTimer);
    options.signal?.removeEventListener("abort", abortFromParent);
  }
}

// src/media/transcript.ts
var MAX_WEBVTT_CODE_UNITS = 64 * 1024 * 1024;
var MAX_CUE_COUNT = 1e6;
var TIMESTAMP_SOURCE = String.raw`(?:\d{2,}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})`;
var TIMING_LINE_PATTERN = new RegExp(String.raw`^(${TIMESTAMP_SOURCE})[ \t]+-->[ \t]+(${TIMESTAMP_SOURCE})(?:[ \t]+.*)?$`, "u");
var STRICT_TIMING_LINE_PATTERN = new RegExp(String.raw`^(${TIMESTAMP_SOURCE})[ \t]+-->[ \t]+(${TIMESTAMP_SOURCE})$`, "u");
var VTT_TAG_PATTERN = /^(?:\/?(?:b|i|u|ruby|rt|br)|\/?c(?:\.[^\s.<>]+)*|\/?v(?:\s+[^<>]*)?|\/?lang(?:\s+[^<>]*)?)$/iu;
var VTT_TIMESTAMP_TAG_PATTERN = new RegExp(String.raw`^${TIMESTAMP_SOURCE}$`, "u");
var ENTITY_PATTERN = /&(?:#(?:[xX][0-9a-fA-F]+|\d+)|[a-zA-Z][a-zA-Z0-9]+);/gu;
var CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
var WHITESPACE_PATTERN = /\s+/gu;
var TOKEN_EDGE_PATTERN = /^(?:[\p{P}\p{S}]+)|(?:[\p{P}\p{S}]+)$/gu;
function parseWebVtt(input) {
  if (typeof input !== "string") {
    return failure("invalid-input", "WebVTT input must be a string.");
  }
  if (input.length > MAX_WEBVTT_CODE_UNITS) {
    return failure("input-too-large", `WebVTT input exceeds the ${String(MAX_WEBVTT_CODE_UNITS)} code-unit limit.`);
  }
  const normalizedInput = toUnicodeScalarString(input).replace(/^\uFEFF/u, "").replace(/\r\n?/gu, `
`);
  const lines = normalizedInput.split(`
`);
  const header = lines[0];
  if (header === undefined || !/^WEBVTT(?:[ \t].*)?$/u.test(header)) {
    return failure("invalid-webvtt-header", "WebVTT input must begin with a WEBVTT header.");
  }
  let cursor = 1;
  while (cursor < lines.length && !isBlank(lines[cursor]))
    cursor += 1;
  const parsedCues = [];
  while (cursor < lines.length && parsedCues.length < MAX_CUE_COUNT) {
    while (cursor < lines.length && isBlank(lines[cursor]))
      cursor += 1;
    if (cursor >= lines.length)
      break;
    const blockStart = cursor;
    while (cursor < lines.length && !isBlank(lines[cursor]))
      cursor += 1;
    const block = lines.slice(blockStart, cursor);
    const firstLine = block[0];
    if (firstLine === undefined || isMetadataBlock(firstLine))
      continue;
    const timingIndex = timingLineIndex(block);
    if (timingIndex === -1)
      continue;
    const timingLine = block[timingIndex];
    if (timingLine === undefined)
      continue;
    const timing = parseTimingLine(timingLine);
    if (timing === undefined)
      continue;
    const cueText = stripWebVttMarkup(block.slice(timingIndex + 1).join(`
`));
    if (cueText.length === 0)
      continue;
    parsedCues.push({ ...timing, text: cueText });
  }
  if (parsedCues.length === 0) {
    return failure("no-valid-cues", "WebVTT input contains no valid, nonempty cues.");
  }
  const cues = deduplicateRollingCaptionCues(parsedCues);
  if (cues.length === 0) {
    return failure("empty-transcript", "WebVTT cues contain no transcript text after cleanup.");
  }
  const text = renderTranscriptText(cues);
  if (text.trim().length === 0) {
    return failure("empty-transcript", "WebVTT cues contain no transcript text after cleanup.");
  }
  return {
    ok: true,
    cues,
    text,
    json: renderTranscriptJson(cues)
  };
}
function stripWebVttMarkup(input) {
  const scalarInput = toUnicodeScalarString(input);
  const chunks = [];
  let cursor = 0;
  while (cursor < scalarInput.length) {
    const tagStart = scalarInput.indexOf("<", cursor);
    if (tagStart === -1) {
      chunks.push(scalarInput.slice(cursor));
      break;
    }
    chunks.push(scalarInput.slice(cursor, tagStart));
    const tagEnd = scalarInput.indexOf(">", tagStart + 1);
    if (tagEnd === -1) {
      chunks.push(scalarInput.slice(tagStart));
      break;
    }
    const tag = scalarInput.slice(tagStart + 1, tagEnd).trim();
    if (!VTT_TAG_PATTERN.test(tag) && !VTT_TIMESTAMP_TAG_PATTERN.test(tag)) {
      chunks.push(scalarInput.slice(tagStart, tagEnd + 1));
      cursor = tagEnd + 1;
      continue;
    }
    if (/^br$/iu.test(tag))
      chunks.push(" ");
    cursor = tagEnd + 1;
  }
  const decoded = chunks.join("").replace(ENTITY_PATTERN, (entity) => decodeEntity(entity));
  return decoded.replace(CONTROL_PATTERN, " ").replace(WHITESPACE_PATTERN, " ").trim().normalize("NFC");
}
function longestTokenOverlap(leftTokens, rightTokens) {
  const maximum = Math.min(leftTokens.length, rightTokens.length);
  if (maximum === 0)
    return 0;
  const pattern = rightTokens.slice(0, maximum).map(normalizeToken);
  const prefixLengths = new Array(pattern.length).fill(0);
  for (let index = 1;index < pattern.length; index += 1) {
    let matched2 = prefixLengths[index - 1] ?? 0;
    const token = pattern[index];
    while (matched2 > 0 && pattern[matched2] !== token) {
      matched2 = prefixLengths[matched2 - 1] ?? 0;
    }
    if (pattern[matched2] === token)
      matched2 += 1;
    prefixLengths[index] = matched2;
  }
  let matched = 0;
  for (const rawToken of leftTokens.slice(-maximum)) {
    const token = normalizeToken(rawToken);
    while (matched > 0 && (matched === pattern.length || pattern[matched] !== token)) {
      matched = prefixLengths[matched - 1] ?? 0;
    }
    if (matched < pattern.length && pattern[matched] === token)
      matched += 1;
  }
  return matched;
}
function deduplicateRollingCaptionCues(cues) {
  const output = [];
  let previousCue;
  for (const cue of cues) {
    const cueText = canonicalCueText(cue.text);
    if (cueText.length === 0)
      continue;
    const cueTokens = tokenize(cueText);
    const overlap = previousCue !== undefined && cue.startMs < previousCue.endMs ? longestTokenOverlap(previousCue.tokens, cueTokens) : 0;
    const novelTokens = cueTokens.slice(overlap);
    previousCue = { endMs: cue.endMs, tokens: cueTokens };
    if (novelTokens.length === 0)
      continue;
    output.push({
      startMs: cue.startMs,
      endMs: cue.endMs,
      text: novelTokens.join(" ")
    });
  }
  return output;
}
function renderTranscriptText(cues) {
  const lines = cues.map(({ text }) => canonicalCueText(text)).filter((text) => text.length > 0);
  return lines.length === 0 ? "" : `${lines.join(`
`)}
`;
}
function renderTranscriptJson(cues) {
  const document = {
    version: 1,
    cues: cues.map(({ startMs, endMs, text }) => ({
      startMs,
      endMs,
      text: canonicalCueText(text)
    }))
  };
  return `${JSON.stringify(document, null, 2)}
`;
}
function failure(code, message) {
  return { ok: false, error: { code, message } };
}
function isBlank(line) {
  return line === undefined || /^[ \t]*$/u.test(line);
}
function isMetadataBlock(line) {
  return /^(?:NOTE(?:[ \t].*)?|STYLE|REGION)$/u.test(line);
}
function timingLineIndex(block) {
  if (block[0] !== undefined && TIMING_LINE_PATTERN.test(block[0]))
    return 0;
  if (block[1] !== undefined && TIMING_LINE_PATTERN.test(block[1]))
    return 1;
  return -1;
}
function parseTimingLine(line) {
  const match = TIMING_LINE_PATTERN.exec(line);
  const startText = match?.[1];
  const endText = match?.[2];
  if (startText === undefined || endText === undefined)
    return;
  const startMs = parseTimestamp(startText);
  const endMs = parseTimestamp(endText);
  if (startMs === undefined || endMs === undefined || endMs <= startMs)
    return;
  return { startMs, endMs };
}
function parseTimestamp(timestamp) {
  const parts = timestamp.split(":");
  if (parts.length !== 2 && parts.length !== 3)
    return;
  const secondsPart = parts.at(-1);
  const minutesPart = parts.at(-2);
  const hoursPart = parts.length === 3 ? parts[0] : "0";
  if (secondsPart === undefined || minutesPart === undefined || hoursPart === undefined) {
    return;
  }
  const secondsMatch = /^(\d{2})\.(\d{3})$/u.exec(secondsPart);
  if (secondsMatch === null || !/^\d{2}$/u.test(minutesPart) || !/^\d+$/u.test(hoursPart)) {
    return;
  }
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  const seconds = Number(secondsMatch[1]);
  const milliseconds = Number(secondsMatch[2]);
  if (!Number.isSafeInteger(hours) || minutes > 59 || seconds > 59) {
    return;
  }
  const result = ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  return Number.isSafeInteger(result) ? result : undefined;
}
function decodeEntity(entity) {
  const namedEntities = {
    "&amp;": "&",
    "&apos;": "'",
    "&gt;": ">",
    "&lrm;": "\u200E",
    "&lt;": "<",
    "&nbsp;": "\xA0",
    "&quot;": '"',
    "&rlm;": "\u200F"
  };
  const named = namedEntities[entity.toLowerCase()];
  if (named !== undefined)
    return named;
  const numericMatch = /^&#(?:([xX])([0-9a-fA-F]+)|(\d+));$/u.exec(entity);
  if (numericMatch === null)
    return entity;
  const radix = numericMatch[1] === undefined ? 10 : 16;
  const digits = numericMatch[2] ?? numericMatch[3];
  if (digits === undefined)
    return entity;
  const codePoint = Number.parseInt(digits, radix);
  if (!Number.isInteger(codePoint) || codePoint === 0 || codePoint > 1114111 || codePoint >= 55296 && codePoint <= 57343) {
    return entity;
  }
  return String.fromCodePoint(codePoint);
}
function tokenize(text) {
  return text.split(WHITESPACE_PATTERN).filter((token) => token.length > 0);
}
function normalizeToken(token) {
  const normalized = toUnicodeScalarString(token).normalize("NFKC").toLowerCase().replace(TOKEN_EDGE_PATTERN, "");
  return normalized.length === 0 ? token.normalize("NFKC").toLowerCase() : normalized;
}
function canonicalCueText(text) {
  return toUnicodeScalarString(text).replace(CONTROL_PATTERN, " ").replace(WHITESPACE_PATTERN, " ").trim().normalize("NFC");
}
function toUnicodeScalarString(input) {
  if (!/[\uD800-\uDFFF]/u.test(input))
    return input;
  const chunks = [];
  for (let index = 0;index < input.length; index += 1) {
    const codeUnit = input.charCodeAt(index);
    if (codeUnit >= 55296 && codeUnit <= 56319) {
      const next = input.charCodeAt(index + 1);
      if (next >= 56320 && next <= 57343) {
        chunks.push(input.slice(index, index + 2));
        index += 1;
      } else {
        chunks.push("\uFFFD");
      }
    } else if (codeUnit >= 56320 && codeUnit <= 57343) {
      chunks.push("\uFFFD");
    } else {
      chunks.push(input[index] ?? "");
    }
  }
  return chunks.join("");
}

// src/media/ephemeral-acquire.ts
var hardBytes = 512 * 1024 * 1024;
var defaults = { findExecutable, probe: probeWithYtDlp, capture: captureWithYtDlp, probeHttp: probeDirectHttp, captureHttp: captureDirectHttp, run: runProcess };

class AcquisitionError extends Error {
  code;
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function fail(code) {
  throw new AcquisitionError(code);
}
function bound(value, fallback, maximum) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum)
    fail("invalid-input");
  return selected;
}
function sha(data) {
  return createHash6("sha256").update(data).digest("hex");
}
function progress(request, phase, bytes = 0) {
  try {
    request.onProgress?.({ phase, bytes });
  } catch {}
}
async function tool(deps, name) {
  const path = await deps.findExecutable(name);
  if (!path)
    fail("unavailable");
  return path;
}
async function audioDuration(path, deps, signal, maximum, processGroup) {
  const result = await deps.run([await tool(deps, "ffprobe"), "-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path], { signal, processGroup: processGroup !== "inherit", timeoutMs: 30000, maxOutputBytes: 65536 });
  if (!result.ok || result.stdoutTruncated)
    fail("integrity");
  const value = JSON.parse(result.stdout);
  if (!value || typeof value !== "object")
    fail("integrity");
  const record = value;
  const duration = Number(record.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(record.streams) || !record.streams.some((s) => s.codec_type === "audio") || record.streams.some((s) => s.codec_type === "video"))
    fail("unsupported");
  if (duration > maximum)
    fail("limit-exceeded");
  return duration;
}
async function fileRecord(root, path, role, maximum) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat2 = await file.stat();
    if (!stat2.isFile() || stat2.nlink !== 1 || stat2.size < 1 || stat2.size > maximum)
      fail("integrity");
    const hash = createHash6("sha256"), buffer = Buffer.alloc(64 * 1024);
    let bytes = 0;
    for (;; ) {
      const read = await file.read(buffer, 0, buffer.length, null);
      if (!read.bytesRead)
        break;
      bytes += read.bytesRead;
      if (bytes > maximum)
        fail("limit-exceeded");
      hash.update(buffer.subarray(0, read.bytesRead));
    }
    if (bytes !== stat2.size)
      fail("integrity");
    return { path: relative(root, path), bytes, sha256: hash.digest("hex"), role };
  } finally {
    await file.close();
  }
}
async function directAudio(request, stage, probe, deps, signal, maxBytes, maxDuration) {
  progress(request, "audio");
  const path = join2(stage.root, "audio"), file = await open(path, "wx", 384);
  let offset = 0, closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await file.close();
    }
  };
  const sink = {
    write: async (chunk) => {
      let written = 0;
      while (written < chunk.length) {
        const result2 = await file.write(chunk, written, chunk.length - written, offset);
        if (!result2.bytesWritten)
          fail("integrity");
        offset += result2.bytesWritten;
        written += result2.bytesWritten;
      }
    },
    restart: async () => {
      await file.truncate(0);
      offset = 0;
    },
    close,
    abort: close
  };
  let result;
  try {
    result = await deps.captureHttp(probe, sink, { signal, maximumBodyBytes: maxBytes });
  } finally {
    await close();
  }
  if (!result.ok)
    fail(result.error.code === "body-too-large" ? "limit-exceeded" : "permission-or-provider-failure");
  const duration = await audioDuration(path, deps, signal, maxDuration, request.processGroup), record = await fileRecord(stage.root, path, "audio", maxBytes);
  if (record.sha256 !== result.capture.sha256 || record.bytes !== result.capture.bytes)
    fail("integrity");
  return { duration, metadata: null, caption: null, files: [record], warnings: [] };
}
async function providerMedia(request, stage, deps, signal, maxBytes, maxDuration) {
  const executable = await tool(deps, "yt-dlp");
  const auth = { inheritConfig: false, ...request.processGroup === undefined ? {} : { processGroup: request.processGroup }, ...request.browser === undefined ? {} : { browser: request.browser, authContextSha256: authContextSha256(request.authContext) } };
  const probe = await deps.probe({ executable, url: request.url, signal, ...auth });
  if (!probe.ok)
    fail("kind" in probe && probe.kind === "unsupported" ? "unsupported" : "permission-or-provider-failure");
  const metadata = probe.metadata, duration = metadata.durationSeconds;
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0)
    fail("unsupported");
  if (duration > maxDuration)
    fail("limit-exceeded");
  const directory = join2(stage.root, "capture"), temporary = join2(stage.root, "temporary");
  await mkdir(directory, { mode: 448 });
  await mkdir(temporary, { mode: 448 });
  const selected = request.preferAudio ? null : selectCaption(metadata, request.language ?? "en");
  const capture = async (mode) => {
    progress(request, mode === "transcript" ? "captions" : "audio");
    const result = await deps.capture({ executable, url: request.url, signal, ...auth, mode, captureDirectory: directory, temporaryDirectory: temporary, caption: mode === "transcript" ? selected : null, persistDescriptiveMetadata: true, audioOnly: true, maximumBytes: maxBytes, timeoutMs: request.timeoutMs ?? 600000, privateRedactions: metadata.diagnosticRedactions });
    if (!result.ok)
      fail("permission-or-provider-failure");
    if (result.identity.extractor !== metadata.acquisitionIdentity.extractor || result.identity.id !== metadata.acquisitionIdentity.id)
      fail("integrity");
  };
  let caption = null;
  const records = [], warnings = [];
  if (selected) {
    await capture("transcript");
    const paths = (await stageInventory(directory, maxBytes)).files.filter((path) => path.endsWith(".vtt"));
    if (paths.length === 1 && paths[0]) {
      const record = await fileRecord(stage.root, paths[0], "captions", Math.min(maxBytes, 8 * 1024 * 1024));
      const parsed = parseWebVtt(await readFile(paths[0], "utf8"));
      if (parsed.ok && parsed.cues.every((c) => c.startMs >= 0 && c.endMs <= duration * 1000 + 1000) && (parsed.cues[0]?.startMs ?? Infinity) <= 30000 && (parsed.cues.at(-1)?.endMs ?? 0) >= duration * 900) {
        records.push(record);
        caption = selected;
        warnings.push("provider-caption-completeness-unverified");
      }
    }
    if (!caption)
      warnings.push("provider-captions-unusable");
  }
  if (!caption) {
    await capture("audio");
    const audio = (await stageInventory(directory, maxBytes)).files.filter((path) => /^media\.(?:m4a|mp3|ogg|opus|wav|webm|mp4|aac|flac)$/u.test(basename(path)));
    if (audio.length !== 1 || !audio[0])
      fail("integrity");
    const observed = await audioDuration(audio[0], deps, signal, maxDuration, request.processGroup);
    if (Math.abs(observed - duration) > Math.max(2, duration * 0.02))
      fail("integrity");
    records.push(await fileRecord(stage.root, audio[0], "audio", maxBytes));
  }
  const thumbnails = (await stageInventory(directory, maxBytes)).files.filter((path) => /^media\.(?:jpg|jpeg|png|webp)$/u.test(basename(path)));
  if (thumbnails.length > 1)
    fail("integrity");
  if (thumbnails[0])
    records.push(await fileRecord(stage.root, thumbnails[0], "thumbnail", Math.min(maxBytes, 16 * 1024 * 1024)));
  return { duration, metadata, caption, files: records, warnings };
}
async function acquireEphemeralMedia(request, deps = defaults) {
  let receipt;
  let controller, monitor, timeout;
  let monitoring = Promise.resolve(), monitoringActive = false, monitorFailure, timedOut = false, subprocessSettled = true;
  const abort = () => controller?.abort();
  try {
    let accountSnapshot;
    const loadAccount = deps.loadAccount ?? (async (id) => (await import("./auth-hwsjzmz6.js")).loadAuthSnapshot(id));
    if (request.accountId !== undefined) {
      if (typeof request.accountId !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/u.test(request.accountId) || request.browser !== undefined || request.authContext !== undefined)
        fail("invalid-input");
      try {
        accountSnapshot = await loadAccount(request.accountId);
      } catch {
        fail("permission-or-provider-failure");
      }
      try {
        request = { ...request, ...ephemeralAccountSelection(accountSnapshot, request.accountId) };
      } catch (error) {
        fail(error instanceof Error && error.message === "integrity" ? "integrity" : "unsupported");
      }
    }
    if (request.preferAudio !== undefined && typeof request.preferAudio !== "boolean")
      fail("invalid-input");
    const maxBytes = bound(request.maxBytes, 134217728, hardBytes), maxDuration = bound(request.maxDurationSeconds, 3600, 14400), timeoutMs = bound(request.timeoutMs, 600000, 3600000);
    const route = routeSource({ url: request.url, mode: "audio", inheritYtDlpConfig: false, ...request.browser === undefined ? {} : { browser: request.browser }, ...request.authContext === undefined ? {} : { authContext: request.authContext } });
    if (route.kind === "reject")
      fail("invalid-input");
    if (process.platform === "win32")
      fail("unsupported");
    if (request.processGroup !== undefined && !["owned", "inherit"].includes(request.processGroup))
      fail("invalid-input");
    if (request.processGroup === "inherit") {
      const owner = request.supervisor;
      if (!validSupervisor(owner))
        fail("invalid-input");
    } else if (request.supervisor !== undefined)
      fail("invalid-input");
    receipt = await createEphemeralStage(request.stagingParent, request.supervisor);
    controller = new AbortController;
    request.signal?.addEventListener("abort", abort, { once: true });
    if (request.signal?.aborted)
      abort();
    timeout = setTimeout(() => {
      timedOut = true;
      abort();
    }, timeoutMs);
    const stage = receipt;
    monitor = setInterval(() => {
      if (monitoringActive)
        return;
      monitoringActive = true;
      monitoring = stageInventory(stage.root, maxBytes + 16384).then((value) => {
        progress(request, "audio", value.bytes);
      }).catch((error) => {
        monitorFailure = error instanceof Error && error.message === "limit-exceeded" ? "limit-exceeded" : "integrity";
        abort();
      }).finally(() => {
        monitoringActive = false;
      });
    }, 100);
    if (controller.signal.aborted)
      fail("cancelled");
    progress(request, "probe");
    let acquired;
    subprocessSettled = false;
    if (route.kind === "direct-http") {
      const probe = await deps.probeHttp(route.requestUrl, { signal: controller.signal, maximumBodyBytes: maxBytes });
      if (probe.ok)
        acquired = await directAudio(request, stage, probe.probe, deps, controller.signal, maxBytes, maxDuration);
      else if (probe.kind === "not-applicable")
        acquired = await providerMedia(request, stage, deps, controller.signal, maxBytes, maxDuration);
      else
        fail(probe.error.code === "body-too-large" ? "limit-exceeded" : "permission-or-provider-failure");
    } else
      acquired = await providerMedia(request, stage, deps, controller.signal, maxBytes, maxDuration);
    subprocessSettled = true;
    clearInterval(monitor);
    await monitoring;
    if (monitorFailure)
      fail(monitorFailure);
    if (controller.signal.aborted)
      fail(timedOut ? "timeout" : "cancelled");
    await stageInventory(stage.root, maxBytes + 16384);
    const metadata = acquired.metadata;
    const manifest = {
      schemaVersion: 1,
      kind: "ephemeral-media",
      retainedSourceArchive: false,
      source: {
        requestedUrlSha256: route.requestUrlSha256,
        accountFingerprint: request.authContext ? authContextSha256(request.authContext) : null,
        providerIdentitySha256: metadata ? providerIdentitySha256(metadata.acquisitionIdentity.extractor, metadata.acquisitionIdentity.id) : sha(`direct-http:${route.requestUrlSha256}`),
        durationSeconds: acquired.duration,
        ...metadata?.title === undefined ? {} : { title: metadata.title },
        ...metadata?.uploader === undefined ? {} : { author: metadata.uploader }
      },
      caption: acquired.caption,
      files: acquired.files,
      warnings: acquired.warnings
    };
    if (accountSnapshot) {
      let current;
      try {
        current = await loadAccount(request.accountId);
      } catch {
        fail("permission-or-provider-failure");
      }
      if (current.auth.id !== accountSnapshot.auth.id || current.contentSha256 !== accountSnapshot.contentSha256)
        fail("integrity");
    }
    await writeFile(join2(stage.root, "media.json"), JSON.stringify(manifest), { mode: 384, flag: "wx" });
    await markEphemeralStageReady(stage);
    progress(request, "verified");
    return { ok: true, receipt: stage, manifest, cleanup: "pending" };
  } catch (error) {
    clearInterval(monitor);
    await monitoring;
    if (error instanceof AcquisitionError)
      subprocessSettled = true;
    let cleanup = "settled";
    if (receipt) {
      if (subprocessSettled) {
        try {
          await markEphemeralStageReady(receipt);
        } catch {}
      }
      cleanup = (await cleanupEphemeralStage(receipt)).status;
    }
    const code = monitorFailure ?? (request.signal?.aborted ? "cancelled" : timedOut ? "timeout" : error instanceof AcquisitionError ? error.code : error instanceof Error && error.message === "integrity" ? "integrity" : "unavailable");
    return { ok: false, code: cleanup === "pending" ? "cleanup-required" : code, cleanup, ...receipt && cleanup === "pending" ? { receipt } : {} };
  } finally {
    clearInterval(monitor);
    clearTimeout(timeout);
    await monitoring;
    request.signal?.removeEventListener("abort", abort);
  }
}
export {
  acquireEphemeralMedia
};
