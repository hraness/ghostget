// @bun
import {
  isoBmffMp4VideoMetadata
} from "./index-kqaaw64h.js";
import {
  createWebSessionClient,
  webSessionAuthSubject
} from "./index-wn3s7nnj.js";
import {
  failedProviderRead
} from "./index-4smh9n9x.js";
import {
  pinnedHttpsFetch
} from "./index-j3ysa35f.js";
import"./index-aka7rgdj.js";
import {
  OperationDeadline
} from "./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import {
  canonicalJson
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/providers/substack-web-runtime.ts
import { Blob } from "buffer";
import { createHash } from "crypto";
import { constants } from "fs";
import { open } from "fs/promises";
import { types as nodeTypes } from "util";
import { renderCookieHeader } from "@hraness/kb/clip/cookies";

// src/providers/substack-video-mp4.ts
var SUBSTACK_MP4_COMPATIBILITY_POLICY = Object.freeze({
  compatibleBrands: Object.freeze([
    "M4V ",
    "MSNV",
    "avc1",
    "iso2",
    "isom",
    "mp41",
    "mp42"
  ]),
  rejectedMajorBrands: Object.freeze(["qt  "])
});
function substackMp4Metadata(bytes, label) {
  return isoBmffMp4VideoMetadata(bytes, label, SUBSTACK_MP4_COMPATIBILITY_POLICY);
}

// src/providers/substack-web.ts
var SUBSTACK_WEB_OPERATION_NAMES = Object.freeze([
  "articles.publish",
  "articles.read",
  "comments.create",
  "comments.read",
  "content.delete",
  "content.edit",
  "content.save",
  "content.schedule",
  "content.share",
  "feeds.read",
  "likes.set",
  "media.publish",
  "media.read",
  "messaging.list",
  "messaging.read",
  "messaging.send",
  "posts.publish",
  "posts.quote",
  "posts.read",
  "posts.repost",
  "profiles.read",
  "organizations.read",
  "relationships.follow.set",
  "replies.create"
]);
var observedRead = (reason) => Object.freeze({
  effect: "read",
  risk: "R1",
  state: "observed",
  evidence: "live-direct",
  reason
});
var observedWrite = (reason) => Object.freeze({
  effect: "write",
  risk: "R3",
  state: "observed",
  evidence: "live-direct",
  reason
});
var captureRequired = (risk, evidence, reason) => Object.freeze({
  effect: "write",
  risk,
  state: "capture-required",
  evidence,
  reason
});
var captureRequiredRead = (evidence, reason) => Object.freeze({
  effect: "read",
  risk: "R1",
  state: "capture-required",
  evidence,
  reason
});
var SUBSTACK_WEB_OPERATIONS = Object.freeze({
  "feeds.read": observedRead("current central reader, inbox, and reader-post list endpoints with bounded first-page projection"),
  "posts.read": observedRead("exact Note/comment entity read through /api/v1/reader/comment/{id}"),
  "articles.read": observedRead("exact entitled article read through /api/v1/posts/by-id/{id}"),
  "comments.read": observedRead("exact article reply branch read with post and publication binding"),
  "media.read": observedRead("bounded cover, podcast, video-upload, API audio-item, and exact same-publication inline audio metadata projected from an exact entitled article response"),
  "media.publish": captureRequired("R3", "first-party-bundle", "Note video upload initialization, byte transfer, processing, viewer binding, returned attachment, and exact public Note readback need an authorized fixture"),
  "messaging.list": observedRead("acknowledgement-free inbox listing for all, people, and unread tabs"),
  "messaging.read": captureRequiredRead("first-party-bundle", "the exact DM GET is current-bundle observed, but this account has no low-stakes direct-message fixture proving acknowledgement behavior"),
  "profiles.read": observedRead("exact target-bound /api/v1/user/{handle}/public_profile response with current-viewer ID binding and an exact follower count"),
  "organizations.read": observedRead("exact owned-publication /api/v1/publish-dashboard/summary response with bootstrap-bound publication origin and exact total-email and paid-subscriber counts"),
  "likes.set": captureRequired("R2", "first-party-bundle", "post and Note/comment reaction endpoints are distinct and need authorized desired-state fixtures plus independent readback"),
  "content.save": captureRequired("R2", "first-party-bundle", "post and Note save endpoints are distinct and need authorized desired-state fixtures plus independent readback"),
  "relationships.follow.set": captureRequired("R2", "first-party-bundle", "user-follow and publication-subscription changes have different effects; paid, pledge, and email changes remain blocked"),
  "comments.create": captureRequired("R3", "first-party-bundle", "article comment publication needs an authorized fixture and exact actor/post response binding"),
  "replies.create": captureRequired("R3", "first-party-bundle", "Note, article-comment, and chat replies are separate transports and need exact authorized fixtures"),
  "messaging.send": captureRequired("R3", "first-party-bundle", "DM start/send and optional media URL upload need exact recipient, thread, response, and attachment bindings"),
  "posts.publish": observedWrite("authorized Note composer capture proving one optional PNG upload, exact public create payload, durable accepted-Note targeting, actor and attachment response binding, and four bounded exact readbacks over a six-second visibility window"),
  "posts.quote": captureRequired("R3", "first-party-bundle", "quote-Note creation is not interchangeable with a plain Note or restack"),
  "posts.repost": captureRequired("R3", "first-party-bundle", "restack creation needs an authorized fixture and exact source/created-Note response binding"),
  "content.share": captureRequired("R3", "first-party-bundle", "external sharing and Substack-native restacking are different externally visible effects"),
  "content.edit": captureRequired("R3", "first-party-bundle", "owned Note, comment, draft, and article edits have distinct origins and response/readback contracts"),
  "content.delete": observedWrite("authorized personal-Note fixture proving an exact current-viewer/body pre-read, one bodyless DELETE /api/v1/comment/{note-id} accepted with 200, durable target retention, and an independent exact Note read returning 404"),
  "articles.publish": captureRequired("R3", "first-party-bundle", "article authoring may execute only on an exact viewer-owned publication origin and must never default to sending email"),
  "content.schedule": captureRequired("R3", "first-party-bundle", "scheduled publication needs an exact viewer-owned publication, time zone, audience, notification, and returned-draft binding")
});
var SUBSTACK_ORIGIN = "https://substack.com";
var MAX_HTML_BYTES = 8 * 1024 * 1024;
var MAX_ITEMS = 100;
var MAX_BODY_BYTES = 2 * 1024 * 1024;
var MAX_INLINE_AUDIO_EMBEDS = 20;
var MAX_INLINE_AUDIO_TAG_CODE_UNITS = 16384;
var INLINE_AUDIO_UPLOAD_PATH = /^\/api\/v1\/audio\/upload\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/src$/u;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function boundedString(value, label, maximum, allowEmpty = false) {
  if (typeof value !== "string" || !allowEmpty && value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be bounded text`);
  return value;
}
function optionalString(value, label, maximum) {
  if (value === undefined || value === null || value === "")
    return null;
  return boundedString(value, label, maximum);
}
function integerId(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}
function optionalIntegerId(value, label) {
  if (value === undefined || value === null)
    return null;
  return integerId(value, label);
}
function optionalFiniteNumber(value, label) {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
  return value;
}
function optionalBoolean(value, label) {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
function boundedArray(value, label, maximum = MAX_ITEMS) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} must be a bounded array`);
  }
  return value;
}
function exactHttpsUrl(value, label, maximum = 8192) {
  if (value === undefined || value === null || value === "")
    return null;
  const candidate = boundedString(value, label, maximum);
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "")
    throw new Error(`${label} must be a credential-free HTTPS URL`);
  return parsed.href;
}
function unavailableSubstackProfileMetric(reason) {
  return Object.freeze({ status: "unavailable", reason });
}
function exactSubstackProfileMetric(value) {
  if (value === undefined || value === null) {
    return unavailableSubstackProfileMetric("not-exposed");
  }
  const candidate = typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    return unavailableSubstackProfileMetric("provider-drift");
  }
  return Object.freeze({
    status: "available",
    value: candidate,
    precision: "exact",
    unit: "count"
  });
}
function canonicalSubstackProfileHandle(value, label) {
  const handle = boundedString(value, label, 128).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(handle)) {
    throw new Error(`${label} must be one canonical lowercase Substack handle`);
  }
  return handle;
}
function exactSubstackProfileId(value, label) {
  if (Number.isSafeInteger(value) && value > 0)
    return String(value);
  if (typeof value === "string" && /^[1-9][0-9]{0,15}$/u.test(value) && Number.isSafeInteger(Number(value)))
    return value;
  throw new Error(`${label} must be one positive safe integer identifier`);
}
function exactSubstackProfileObservedAt(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error("Substack profile observation time must be one exact UTC instant");
  return value;
}
function normalizeSubstackProfileStatsResponse(value, expectedViewerId, expectedProfile, observedAt) {
  const source = record(value, "Substack public-profile response");
  const handle = canonicalSubstackProfileHandle(source.handle, "Substack public-profile response.handle");
  const profile = canonicalSubstackProfileHandle(expectedProfile, "Substack requested profile");
  if (handle !== profile) {
    throw new Error("Substack public-profile response did not bind the requested handle");
  }
  const id = exactSubstackProfileId(source.id, "Substack public-profile response.id");
  if (id !== exactSubstackProfileId(expectedViewerId, "Substack expected viewer ID")) {
    throw new Error("Substack public-profile response did not bind the current viewer ID");
  }
  const camelCount = exactSubstackProfileMetric(source.followerCount);
  const snakeCount = exactSubstackProfileMetric(source.follower_count);
  let followers = source.followerCount === undefined ? snakeCount : camelCount;
  if (source.followerCount !== undefined && source.follower_count !== undefined && JSON.stringify(camelCount) !== JSON.stringify(snakeCount))
    followers = unavailableSubstackProfileMetric("provider-drift");
  const displayName = optionalString(source.name, "Substack public-profile response.name", 512);
  const bio = optionalString(source.bio, "Substack public-profile response.bio", 16384);
  const websiteUrl = exactHttpsUrl(source.websiteUrl ?? source.website_url, "Substack public-profile response.websiteUrl", 2048);
  return Object.freeze({
    schemaVersion: 1,
    provider: "substack",
    target: Object.freeze({
      kind: "profile",
      id,
      url: `https://substack.com/@${handle}`
    }),
    observedAt: exactSubstackProfileObservedAt(observedAt),
    completeness: followers.status === "available" ? "complete" : "partial",
    metrics: Object.freeze({ followers }),
    metadata: Object.freeze({
      handle,
      ...displayName === null ? {} : { displayName },
      ...bio === null ? {} : { bio },
      ...websiteUrl === null ? {} : { websiteUrl }
    })
  });
}
function unavailableDerivedSubstackMetric(values) {
  if (values.some((metric) => metric.status === "unavailable" && metric.reason === "provider-drift")) {
    return unavailableSubstackProfileMetric("provider-drift");
  }
  if (values.some((metric) => metric.status === "unavailable" && metric.reason === "not-authorized")) {
    return unavailableSubstackProfileMetric("not-authorized");
  }
  return unavailableSubstackProfileMetric("not-exposed");
}
function normalizeSubstackPublicationStatsResponse(value, expectedPublication, observedAt) {
  const source = record(value, "Substack publication summary response");
  const organization = canonicalSubstackProfileHandle(expectedPublication.organization, "Substack publication organization");
  const expectedOrigin = `https://${organization}.substack.com`;
  if (exactOrigin(expectedPublication.origin, "Substack publication origin") !== expectedOrigin) {
    throw new Error("Substack publication origin did not bind the requested organization");
  }
  const total = exactSubstackProfileMetric(source.totalEmail);
  const paidSubscribers = exactSubstackProfileMetric(source.subscribers);
  const freeSubscribers = total.status === "available" && paidSubscribers.status === "available" ? paidSubscribers.value <= total.value ? exactSubstackProfileMetric(total.value - paidSubscribers.value) : unavailableSubstackProfileMetric("provider-drift") : unavailableDerivedSubstackMetric([total, paidSubscribers]);
  const complete = freeSubscribers.status === "available" && paidSubscribers.status === "available";
  return Object.freeze({
    schemaVersion: 1,
    provider: "substack",
    target: Object.freeze({
      kind: "publication",
      id: exactSubstackProfileId(expectedPublication.id, "Substack publication ID"),
      url: `${expectedOrigin}/`
    }),
    observedAt: exactSubstackProfileObservedAt(observedAt),
    completeness: complete ? "complete" : "partial",
    metrics: Object.freeze({ freeSubscribers, paidSubscribers }),
    metadata: Object.freeze({ handle: organization })
  });
}
function isHtmlWhitespace(value) {
  return value === " " || value === "\t" || value === `
` || value === "\f" || value === "\r";
}
function asciiCaseEqualAt(value, offset, expected) {
  if (offset < 0 || offset + expected.length > value.length)
    return false;
  for (let index = 0;index < expected.length; index += 1) {
    const actual = value.charCodeAt(offset + index);
    const folded = actual >= 65 && actual <= 90 ? actual + 32 : actual;
    if (folded !== expected.charCodeAt(index))
      return false;
  }
  return true;
}
function isTagBoundary(value) {
  return value === undefined || value === ">" || value === "/" || isHtmlWhitespace(value);
}
function inlineAudioTagEnd(bodyHtml, start) {
  let quote = null;
  const maximumEnd = Math.min(bodyHtml.length, start + MAX_INLINE_AUDIO_TAG_CODE_UNITS);
  for (let cursor = start + 1;cursor < maximumEnd; cursor += 1) {
    const character = bodyHtml[cursor];
    if (quote !== null) {
      if (character === quote)
        quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor;
    }
  }
  throw new Error("Substack inline audio tag was malformed or exceeded its bound");
}
function inlineAudioSrcAttribute(tag) {
  let cursor = "<audio".length;
  let source = null;
  const end = tag.length - 1;
  while (cursor < end) {
    while (isHtmlWhitespace(tag[cursor]))
      cursor += 1;
    if (cursor >= end || tag[cursor] === "/")
      break;
    const nameStart = cursor;
    while (cursor < end && !isHtmlWhitespace(tag[cursor]) && tag[cursor] !== "=" && tag[cursor] !== "/" && tag[cursor] !== ">" && tag[cursor] !== '"' && tag[cursor] !== "'" && tag[cursor] !== "<")
      cursor += 1;
    if (cursor === nameStart) {
      throw new Error("Substack inline audio tag contained a malformed attribute");
    }
    const name = tag.slice(nameStart, cursor).toLowerCase();
    while (isHtmlWhitespace(tag[cursor]))
      cursor += 1;
    if (tag[cursor] !== "=") {
      if (name === "src") {
        throw new Error("Substack inline audio src attribute omitted its value");
      }
      continue;
    }
    cursor += 1;
    while (isHtmlWhitespace(tag[cursor]))
      cursor += 1;
    if (cursor >= end) {
      throw new Error("Substack inline audio attribute omitted its value");
    }
    let attributeValue;
    const quote = tag[cursor];
    if (quote === '"' || quote === "'") {
      cursor += 1;
      const valueStart = cursor;
      while (cursor < end && tag[cursor] !== quote)
        cursor += 1;
      if (cursor >= end) {
        throw new Error("Substack inline audio attribute was unterminated");
      }
      attributeValue = tag.slice(valueStart, cursor);
      cursor += 1;
    } else {
      const valueStart = cursor;
      while (cursor < end && !isHtmlWhitespace(tag[cursor]) && tag[cursor] !== ">") {
        if (tag[cursor] === '"' || tag[cursor] === "'" || tag[cursor] === "<") {
          throw new Error("Substack inline audio attribute was malformed");
        }
        cursor += 1;
      }
      attributeValue = tag.slice(valueStart, cursor);
    }
    if (name !== "src")
      continue;
    if (source !== null) {
      throw new Error("Substack inline audio tag contained repeated src attributes");
    }
    source = boundedString(attributeValue, "Substack inline audio src", 2048);
  }
  return source;
}
function normalizedInlineAudioEmbed(source, publicationBaseUrl) {
  let path = source;
  if (!source.startsWith("/")) {
    let absolute;
    try {
      absolute = new URL(source);
    } catch {
      throw new Error("Substack inline audio src must be an exact publication URL or path");
    }
    if (absolute.protocol !== "https:" || absolute.username !== "" || absolute.password !== "" || absolute.origin !== publicationBaseUrl.origin || absolute.search !== "" || absolute.hash !== "" || absolute.href !== source) {
      throw new Error("Substack inline audio src must use the exact publication origin");
    }
    path = absolute.pathname;
  }
  const match = INLINE_AUDIO_UPLOAD_PATH.exec(path);
  if (match?.[1] === undefined) {
    throw new Error("Substack inline audio src must use the exact audio upload route");
  }
  return Object.freeze({
    uploadId: match[1],
    url: new URL(path, publicationBaseUrl.origin).href
  });
}
function parseSubstackInlineAudioEmbeds(bodyHtml, publicationBaseUrl) {
  const html = boundedString(bodyHtml, "Substack inline audio body_html", MAX_BODY_BYTES, true);
  let publication = null;
  const embeds = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start < 0)
      break;
    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      if (commentEnd < 0) {
        throw new Error("Substack inline audio body_html contained an unterminated comment");
      }
      cursor = commentEnd + 3;
      continue;
    }
    if (!asciiCaseEqualAt(html, start + 1, "audio") || !isTagBoundary(html[start + 6])) {
      cursor = start + 1;
      continue;
    }
    const tagEnd = inlineAudioTagEnd(html, start);
    const source = inlineAudioSrcAttribute(html.slice(start, tagEnd + 1));
    cursor = tagEnd + 1;
    if (source === null)
      continue;
    if (embeds.length >= MAX_INLINE_AUDIO_EMBEDS) {
      throw new Error(`Substack inline audio embeds exceeded ${String(MAX_INLINE_AUDIO_EMBEDS)} items`);
    }
    if (publication === null) {
      const base = exactHttpsUrl(publicationBaseUrl, "Substack inline audio publication base_url", 2048);
      if (base === null) {
        throw new Error("Substack inline audio publication base_url is required");
      }
      publication = new URL(base);
    }
    embeds.push(normalizedInlineAudioEmbed(source, publication));
  }
  return Object.freeze(embeds);
}
function exactOrigin(value, label) {
  const candidate = boundedString(value, label, 2048);
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "")
    throw new Error(`${label} must be an exact credential-free HTTPS origin`);
  return parsed.origin;
}
function exactSubstackUrl(value, label) {
  let parsed;
  try {
    parsed = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (parsed.origin !== SUBSTACK_ORIGIN || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "")
    throw new Error(`${label} must use the exact ${SUBSTACK_ORIGIN} origin`);
  return parsed;
}
function exactSubstackPublicationUrl(value, organizationValue, publicationOriginValue) {
  const organization = canonicalSubstackProfileHandle(organizationValue, "Substack publication organization");
  const publicationOrigin = exactOrigin(publicationOriginValue, "Substack publication origin");
  if (publicationOrigin !== `https://${organization}.substack.com`) {
    throw new Error("Substack publication origin did not bind the requested organization");
  }
  let parsed;
  try {
    parsed = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new Error("Substack publication read URL must be an absolute URL");
  }
  if (parsed.origin !== publicationOrigin || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "")
    throw new Error("Substack publication read URL changed its exact owned origin");
  return parsed;
}
function exactQuery(value, label) {
  const result = new Map;
  for (const [name, item] of value) {
    if (result.has(name) || name.length < 1 || name.length > 64 || item.length > 4096 || /[\0\r\n]/u.test(name + item))
      throw new Error(`${label} contained an invalid or repeated parameter`);
    result.set(name, item);
  }
  return result;
}
function exactQueryNames(query, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((name) => !query.has(name));
  const extra = [...query.keys()].filter((name) => !allowed.has(name));
  if (missing.length > 0)
    throw new Error(`${label} omitted ${missing.join(", ")}`);
  if (extra.length > 0)
    throw new Error(`${label} contained unsupported ${extra.join(", ")}`);
}
function decimalPathId(value, label) {
  if (!/^[1-9][0-9]{0,15}$/u.test(value))
    throw new Error(`${label} must be a decimal ID`);
  return integerId(Number(value), label);
}
function boundedCursor(value, label) {
  if (value === undefined)
    return;
  boundedString(value, label, 4096);
}
function authorizeSubstackWebReadRequest(input) {
  if (input.method.toUpperCase() !== "GET" || input.body !== undefined) {
    throw new Error("Substack authenticated reads require body-free GET");
  }
  const url = input.operation === "organizations.read" ? exactSubstackPublicationUrl(input.url, input.organization, input.publicationOrigin) : exactSubstackUrl(input.url, "Substack read URL");
  const query = exactQuery(url.searchParams, "Substack read query");
  switch (input.operation) {
    case "viewer.logged-in":
      if (url.pathname !== "/api/v1/am_i_logged_in" || query.size !== 0) {
        throw new Error("Substack login-state request changed its reviewed exchange");
      }
      break;
    case "viewer.root":
      if (url.pathname !== "/" || query.size !== 0) {
        throw new Error("Substack viewer bootstrap request changed its reviewed exchange");
      }
      break;
    case "feeds.reader":
      if (url.pathname !== "/api/v1/reader/feed" || query.size !== 0) {
        throw new Error("Substack reader feed request changed its reviewed exchange");
      }
      break;
    case "feeds.inbox":
      if (url.pathname !== "/api/v1/inbox/top" || query.size !== 0) {
        throw new Error("Substack inbox feed request changed its reviewed exchange");
      }
      break;
    case "feeds.posts":
      if (url.pathname !== "/api/v1/reader/posts" || query.size !== 0) {
        throw new Error("Substack reader posts request changed its reviewed exchange");
      }
      break;
    case "posts.note": {
      const match = /^\/api\/v1\/reader\/comment\/([1-9][0-9]{0,15})$/u.exec(url.pathname);
      const target = integerId(input.targetId, "Substack requested Note ID");
      if (match === null || decimalPathId(match[1], "Substack Note path ID") !== target || query.size !== 0)
        throw new Error("Substack Note request did not bind the requested entity");
      break;
    }
    case "articles.read":
    case "media.read": {
      const match = /^\/api\/v1\/posts\/by-id\/([1-9][0-9]{0,15})$/u.exec(url.pathname);
      const target = integerId(input.targetId, "Substack requested article ID");
      if (match === null || decimalPathId(match[1], "Substack article path ID") !== target || query.size !== 0)
        throw new Error("Substack article request did not bind the requested entity");
      break;
    }
    case "comments.read": {
      const match = /^\/api\/v1\/reader\/post\/([1-9][0-9]{0,15})\/replies$/u.exec(url.pathname);
      const target = integerId(input.targetId, "Substack requested article ID");
      const publication = integerId(input.publicationId, "Substack requested publication ID");
      if (match === null || decimalPathId(match[1], "Substack replies path ID") !== target)
        throw new Error("Substack replies request did not bind the requested article");
      exactQueryNames(query, ["publication_id"], ["cursor"], "Substack replies query");
      if (query.get("publication_id") !== String(publication)) {
        throw new Error("Substack replies request did not bind the requested publication");
      }
      boundedCursor(query.get("cursor"), "Substack replies cursor");
      break;
    }
    case "messages.list": {
      if (url.pathname !== "/api/v1/messages/inbox") {
        throw new Error("Substack message listing path is not reviewed");
      }
      exactQueryNames(query, ["tab"], ["cursor"], "Substack message listing query");
      const folder = input.folder;
      if (folder === undefined || !["all", "people", "unread"].includes(folder) || query.get("tab") !== folder)
        throw new Error("Substack message listing did not bind the requested folder");
      boundedCursor(query.get("cursor"), "Substack message cursor");
      break;
    }
    case "profiles.read": {
      const profile = canonicalSubstackProfileHandle(input.profile, "Substack requested profile");
      if (url.pathname !== `/api/v1/user/${profile}/public_profile` || query.size !== 0)
        throw new Error("Substack profile request did not bind the requested handle");
      break;
    }
    case "organizations.read":
      if (url.pathname !== "/api/v1/publish-dashboard/summary" || query.size !== 0)
        throw new Error("Substack publication summary request changed its reviewed exchange");
      break;
  }
  return Object.freeze({
    operation: input.operation,
    method: "GET",
    path: url.pathname,
    queryNames: Object.freeze([...query.keys()].sort())
  });
}

class SubstackAuthRepairRequiredError extends Error {
  constructor() {
    super("Substack selected session is not signed in");
    this.name = "SubstackAuthRepairRequiredError";
  }
}
function parseSubstackLoggedInResponse(value) {
  const source = record(value, "Substack login-state response");
  if (source.loggedIn === false)
    throw new SubstackAuthRepairRequiredError;
  if (source.loggedIn !== true) {
    throw new Error("Substack login-state response did not expose a reviewed signed-in flag");
  }
}
function parseJsonStringLiteral(html, start) {
  const quote = html[start];
  if (quote !== '"')
    throw new Error("Substack preload must use a JSON string literal");
  let escaped = false;
  for (let index = start + 1;index < html.length; index += 1) {
    const character = html[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character !== quote)
      continue;
    try {
      const decoded = JSON.parse(html.slice(start, index + 1));
      if (typeof decoded !== "string")
        throw new Error("not a string");
      return { decoded, end: index + 1 };
    } catch {
      throw new Error("Substack preload contained malformed JSON string encoding");
    }
  }
  throw new Error("Substack preload string was unterminated");
}
function publicationBinding(value, label) {
  const source = record(value, label);
  const baseUrl = source.base_url ?? source.baseUrl;
  let origin;
  if (baseUrl !== undefined && baseUrl !== null) {
    origin = exactOrigin(baseUrl, `${label}.base_url`);
  } else {
    const subdomain = boundedString(source.subdomain, `${label}.subdomain`, 63);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(subdomain)) {
      throw new Error(`${label}.subdomain is not a reviewed Substack subdomain`);
    }
    origin = `https://${subdomain}.substack.com`;
  }
  return Object.freeze({
    id: integerId(source.id, `${label}.id`),
    origin,
    primaryUserId: optionalIntegerId(source.primary_user_id, `${label}.primary_user_id`),
    canPostNotesAsPrimaryUser: source.can_post_notes_as_primary_user === true,
    isPublicationPrimaryUser: source.is_publication_primary_user === true
  });
}
function parseSubstackPreloadsHtml(html) {
  const source = boundedString(html, "Substack viewer bootstrap", MAX_HTML_BYTES);
  const assignments = [...source.matchAll(/window\._preloads\s*=/gu)];
  if (assignments.length !== 1) {
    throw new Error("Substack viewer bootstrap must contain exactly one preload assignment");
  }
  const markerIndex = assignments[0].index;
  const marker = assignments[0][0];
  const parseIndex = source.indexOf("JSON.parse(", markerIndex + marker.length);
  if (parseIndex < 0 || parseIndex - markerIndex > 128) {
    throw new Error("Substack viewer bootstrap omitted its strict preload JSON");
  }
  const literalStart = parseIndex + "JSON.parse(".length;
  const literal = parseJsonStringLiteral(source, literalStart);
  const close = source.slice(literal.end, literal.end + 8);
  if (!/^\s*\)/u.test(close))
    throw new Error("Substack preload JSON call was malformed");
  let preloads;
  try {
    preloads = JSON.parse(literal.decoded);
  } catch {
    throw new Error("Substack preload payload was not strict JSON");
  }
  const root = record(preloads, "Substack preloads");
  const user = record(root.user, "Substack preloads.user");
  const publications = boundedArray(user.dashboard_pubs ?? [], "Substack preloads.user.dashboard_pubs", 200).map((publication, index) => publicationBinding(publication, `Substack preloads.user.dashboard_pubs[${index}]`));
  return Object.freeze({
    id: integerId(user.id, "Substack preloads.user.id"),
    handle: optionalString(user.handle, "Substack preloads.user.handle", 128),
    name: optionalString(user.name, "Substack preloads.user.name", 512),
    publications: Object.freeze(publications)
  });
}
function reactions(value, label) {
  if (value === undefined || value === null)
    return Object.freeze({});
  const source = record(value, label);
  if (Object.keys(source).length > 64)
    throw new Error(`${label} exceeded its key bound`);
  const result = {};
  for (const [name, count] of Object.entries(source)) {
    const key = boundedString(name, `${label} key`, 32);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`${label}.${key} must be a non-negative integer`);
    }
    result[key] = count;
  }
  return Object.freeze(result);
}
function projectedPublication(value, label) {
  if (value === undefined || value === null)
    return null;
  const source = record(value, label);
  return Object.freeze({
    id: integerId(source.id, `${label}.id`),
    name: optionalString(source.name, `${label}.name`, 512),
    subdomain: optionalString(source.subdomain, `${label}.subdomain`, 256),
    hostname: optionalString(source.hostname, `${label}.hostname`, 512),
    baseUrl: exactHttpsUrl(source.base_url, `${label}.base_url`),
    authorId: optionalIntegerId(source.author_id, `${label}.author_id`)
  });
}
function projectedPost(value, label, includeBody) {
  const source = record(value, label);
  const bodyHtml = includeBody ? optionalString(source.body_html, `${label}.body_html`, MAX_BODY_BYTES) : null;
  return Object.freeze({
    id: integerId(source.id, `${label}.id`),
    publicationId: integerId(source.publication_id, `${label}.publication_id`),
    title: optionalString(source.title, `${label}.title`, 4096),
    subtitle: optionalString(source.subtitle, `${label}.subtitle`, 16384),
    description: optionalString(source.description, `${label}.description`, 65536),
    truncatedBodyText: optionalString(source.truncated_body_text, `${label}.truncated_body_text`, 262144),
    bodyHtml,
    slug: optionalString(source.slug, `${label}.slug`, 1024),
    type: optionalString(source.type, `${label}.type`, 128),
    audience: optionalString(source.audience, `${label}.audience`, 128),
    postDate: optionalString(source.post_date, `${label}.post_date`, 128),
    canonicalUrl: exactHttpsUrl(source.canonical_url, `${label}.canonical_url`),
    coverImage: exactHttpsUrl(source.cover_image, `${label}.cover_image`),
    podcastUrl: exactHttpsUrl(source.podcast_url, `${label}.podcast_url`),
    reaction: optionalBoolean(source.reaction, `${label}.reaction`),
    reactionCount: optionalFiniteNumber(source.reaction_count, `${label}.reaction_count`),
    reactions: reactions(source.reactions, `${label}.reactions`),
    commentCount: optionalFiniteNumber(source.comment_count, `${label}.comment_count`),
    childCommentCount: optionalFiniteNumber(source.child_comment_count, `${label}.child_comment_count`),
    restacks: optionalFiniteNumber(source.restacks, `${label}.restacks`),
    restacked: optionalBoolean(source.restacked, `${label}.restacked`),
    saved: optionalBoolean(source.is_saved, `${label}.is_saved`),
    published: optionalBoolean(source.is_published, `${label}.is_published`)
  });
}
function projectedAttachment(value, label) {
  const source = record(value, label);
  return Object.freeze({
    id: optionalString(typeof source.id === "number" ? String(source.id) : source.id, `${label}.id`, 256),
    type: optionalString(source.type, `${label}.type`, 128),
    url: exactHttpsUrl(source.url, `${label}.url`),
    imageUrl: exactHttpsUrl(source.imageUrl ?? source.image_url, `${label}.imageUrl`),
    videoUrl: exactHttpsUrl(source.videoUrl ?? source.video_url, `${label}.videoUrl`),
    audioUrl: exactHttpsUrl(source.audioUrl ?? source.audio_url, `${label}.audioUrl`),
    altText: optionalString(source.altText ?? source.alt_text, `${label}.altText`, 4096),
    width: optionalFiniteNumber(source.width ?? source.imageWidth, `${label}.width`),
    height: optionalFiniteNumber(source.height ?? source.imageHeight, `${label}.height`)
  });
}
function projectedComment(value, label) {
  const source = record(value, label);
  const attachments = boundedArray(source.attachments ?? [], `${label}.attachments`, 20).map((attachment, index) => projectedAttachment(attachment, `${label}.attachments[${index}]`));
  return Object.freeze({
    id: integerId(source.id, `${label}.id`),
    userId: integerId(source.user_id, `${label}.user_id`),
    publicationId: optionalIntegerId(source.publication_id, `${label}.publication_id`),
    postId: optionalIntegerId(source.post_id, `${label}.post_id`),
    name: optionalString(source.name, `${label}.name`, 512),
    handle: optionalString(source.handle, `${label}.handle`, 128),
    body: boundedString(source.body, `${label}.body`, MAX_BODY_BYTES, true),
    type: optionalString(source.type, `${label}.type`, 128),
    date: optionalString(source.date ?? source.created_at, `${label}.date`, 128),
    editedAt: optionalString(source.edited_at, `${label}.edited_at`, 128),
    ancestorPath: optionalString(source.ancestor_path, `${label}.ancestor_path`, 4096),
    reaction: optionalBoolean(source.reaction, `${label}.reaction`),
    reactionCount: optionalFiniteNumber(source.reaction_count, `${label}.reaction_count`),
    reactions: reactions(source.reactions, `${label}.reactions`),
    restacks: optionalFiniteNumber(source.restacks, `${label}.restacks`),
    restacked: optionalBoolean(source.restacked, `${label}.restacked`),
    saved: optionalBoolean(source.is_saved, `${label}.is_saved`),
    childrenCount: optionalFiniteNumber(source.children_count, `${label}.children_count`),
    attachments: Object.freeze(attachments)
  });
}
function normalizeSubstackFeedResponse(value, feed, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ITEMS) {
    throw new Error("Substack feed limit is invalid");
  }
  const source = record(value, "Substack feed response");
  if (feed === "notes") {
    const items = boundedArray(source.items, "Substack reader feed items", 200).slice(0, limit).map((item, index) => {
      const entry = record(item, `Substack reader feed items[${index}]`);
      const comment = entry.comment === null || entry.comment === undefined ? null : projectedComment(entry.comment, `Substack reader feed items[${index}].comment`);
      const post = entry.post === null || entry.post === undefined ? null : projectedPost(entry.post, `Substack reader feed items[${index}].post`, false);
      if (comment === null && post === null) {
        throw new Error("Substack reader feed item omitted both Note and article entities");
      }
      return Object.freeze({
        entityKey: boundedString(entry.entity_key, `Substack reader feed items[${index}].entity_key`, 512),
        type: boundedString(entry.type, `Substack reader feed items[${index}].type`, 128),
        comment,
        post,
        publication: projectedPublication(entry.publication, `Substack reader feed items[${index}].publication`),
        canReply: optionalBoolean(entry.canReply, `Substack reader feed items[${index}].canReply`)
      });
    });
    return Object.freeze({
      feed,
      items: Object.freeze(items),
      nextCursor: optionalString(source.nextCursor, "Substack reader feed nextCursor", 4096)
    });
  }
  const posts = boundedArray(source.posts, "Substack article feed posts", 200).slice(0, limit).map((post, index) => projectedPost(post, `Substack article feed posts[${index}]`, false));
  return Object.freeze({
    feed,
    items: Object.freeze(posts),
    nextCursor: optionalString(source.cursor ?? source.nextCursor, "Substack article feed cursor", 4096),
    more: optionalBoolean(source.more, "Substack article feed more")
  });
}
function normalizeSubstackArticleResponse(value, articleId) {
  const source = record(value, "Substack article response");
  const postSource = record(source.post, "Substack article response.post");
  if (integerId(postSource.id, "Substack article response.post.id") !== articleId) {
    throw new Error("Substack article response did not bind the requested article");
  }
  const post = projectedPost(postSource, "Substack article response.post", true);
  const publication = projectedPublication(source.publication, "Substack article response.publication");
  if (isRecord(publication) && publication.id !== post.publicationId)
    throw new Error("Substack article response publication did not bind the article");
  return Object.freeze({ post, publication });
}
function normalizeSubstackNoteResponse(value, noteId) {
  const source = record(value, "Substack Note response");
  const item = record(source.item, "Substack Note response.item");
  const commentSource = record(item.comment, "Substack Note response.item.comment");
  if (integerId(commentSource.id, "Substack Note response.item.comment.id") !== noteId) {
    throw new Error("Substack Note response did not bind the requested entity");
  }
  return Object.freeze({
    entityKey: optionalString(item.entity_key, "Substack Note response.item.entity_key", 512),
    type: optionalString(item.type, "Substack Note response.item.type", 128),
    comment: projectedComment(commentSource, "Substack Note response.item.comment"),
    post: item.post === null || item.post === undefined ? null : projectedPost(item.post, "Substack Note response.item.post", false),
    publication: projectedPublication(item.publication, "Substack Note response.item.publication")
  });
}
function normalizeSubstackCommentsResponse(value, postId, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ITEMS) {
    throw new Error("Substack comment limit is invalid");
  }
  const source = record(value, "Substack replies response");
  const branches = boundedArray(source.commentBranches, "Substack replies response.commentBranches", MAX_ITEMS);
  const comments = [];
  for (let branchIndex = 0;branchIndex < branches.length; branchIndex += 1) {
    const branch = record(branches[branchIndex], `Substack replies response.commentBranches[${branchIndex}]`);
    const root = record(branch.comment, `Substack replies response.commentBranches[${branchIndex}].comment`);
    if (integerId(root.post_id, "Substack reply post_id") !== postId) {
      throw new Error("Substack replies response contained a comment for another article");
    }
    comments.push(projectedComment(root, `Substack replies response.commentBranches[${branchIndex}].comment`));
    for (const [descendantIndex, descendant] of boundedArray(branch.descendantComments ?? [], `Substack replies response.commentBranches[${branchIndex}].descendantComments`, MAX_ITEMS).entries()) {
      const wrapper = record(descendant, `Substack replies response.commentBranches[${branchIndex}].descendantComments[${descendantIndex}]`);
      const comment = record(wrapper.comment, `Substack replies response.commentBranches[${branchIndex}].descendantComments[${descendantIndex}].comment`);
      if (integerId(comment.post_id, "Substack descendant reply post_id") !== postId) {
        throw new Error("Substack replies response contained a descendant for another article");
      }
      comments.push(projectedComment(comment, `Substack replies response.commentBranches[${branchIndex}].descendantComments[${descendantIndex}].comment`));
      if (comments.length >= limit)
        break;
    }
    if (comments.length >= limit)
      break;
  }
  return Object.freeze({
    postId,
    comments: Object.freeze(comments.slice(0, limit)),
    nextCursor: optionalString(source.nextCursor, "Substack replies nextCursor", 4096),
    moreBranches: optionalFiniteNumber(source.moreBranches, "Substack replies moreBranches")
  });
}
function normalizeSubstackMediaResponse(value, articleId) {
  const article = normalizeSubstackArticleResponse(value, articleId);
  const source = record(record(value, "Substack media response").post, "Substack media response.post");
  const audioItems = boundedArray(source.audio_items ?? [], "Substack article audio_items", 20).map((item, index) => {
    const audio = record(item, `Substack article audio_items[${index}]`);
    return Object.freeze({
      id: optionalString(typeof audio.id === "number" ? String(audio.id) : audio.id, `Substack article audio_items[${index}].id`, 256),
      url: exactHttpsUrl(audio.audio_url ?? audio.url, `Substack article audio_items[${index}].url`),
      duration: optionalFiniteNumber(audio.duration ?? audio.audio_duration, `Substack article audio_items[${index}].duration`)
    });
  });
  const inlineAudioEmbeds = article.post.bodyHtml === null ? Object.freeze([]) : parseSubstackInlineAudioEmbeds(article.post.bodyHtml, article.publication?.baseUrl);
  return Object.freeze({
    articleId,
    publication: article.publication,
    coverImage: article.post.coverImage ?? null,
    podcastUrl: article.post.podcastUrl ?? null,
    videoUploadId: optionalString(typeof source.video_upload_id === "number" ? String(source.video_upload_id) : source.video_upload_id, "Substack article video_upload_id", 256),
    audioItems: Object.freeze(audioItems),
    inlineAudioEmbeds
  });
}
function projectedMessageThread(value, label) {
  const source = record(value, label);
  const rawId = typeof source.id === "number" ? String(source.id) : source.id;
  return Object.freeze({
    id: boundedString(rawId, `${label}.id`, 512),
    type: boundedString(source.type, `${label}.type`, 128),
    title: optionalString(source.title, `${label}.title`, 2048),
    subtitle: optionalString(source.subtitleBody, `${label}.subtitleBody`, 16384),
    timestamp: optionalString(source.timestamp, `${label}.timestamp`, 128),
    lastViewedAt: optionalString(source.lastViewedAt, `${label}.lastViewedAt`, 128),
    user: source.user === null || source.user === undefined ? null : (() => {
      const user = record(source.user, `${label}.user`);
      return Object.freeze({
        id: integerId(user.id, `${label}.user.id`),
        name: optionalString(user.name, `${label}.user.name`, 512),
        handle: optionalString(user.handle, `${label}.user.handle`, 128)
      });
    })(),
    publication: projectedPublication(source.publication, `${label}.publication`)
  });
}
function normalizeSubstackMessageInbox(value, folder, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ITEMS) {
    throw new Error("Substack message limit is invalid");
  }
  const source = record(value, "Substack message inbox response");
  const threads = boundedArray(source.threads, "Substack message inbox threads", 200).slice(0, limit).map((thread, index) => projectedMessageThread(thread, `Substack message inbox threads[${index}]`));
  return Object.freeze({
    folder,
    threads: Object.freeze(threads),
    nextCursor: optionalString(source.nextCursor, "Substack message nextCursor", 4096),
    more: optionalBoolean(source.more, "Substack message more"),
    pendingInviteCount: optionalFiniteNumber(source.pendingInviteCount, "Substack pendingInviteCount"),
    directMessagesUnreadCount: optionalFiniteNumber(source.directMessagesUnreadCount, "Substack directMessagesUnreadCount"),
    pubChatUnreadCount: optionalFiniteNumber(source.pubChatUnreadCount, "Substack pubChatUnreadCount")
  });
}
var substackWebEvidenceSnapshot = Object.freeze({
  schemaVersion: 1,
  observedOn: "2026-08-23",
  centralOrigin: SUBSTACK_ORIGIN,
  authentication: "browser-cookie-session",
  liveDirectReads: Object.freeze([
    "GET /api/v1/am_i_logged_in",
    "GET /",
    "GET /api/v1/reader/feed",
    "GET /api/v1/inbox/top",
    "GET /api/v1/reader/posts",
    "GET /api/v1/reader/comment/{note-id}",
    "GET /api/v1/posts/by-id/{post-id}",
    "GET /api/v1/reader/post/{post-id}/replies?publication_id={publication-id}",
    "GET /api/v1/messages/inbox?tab={all|people|unread}"
  ]),
  liveDirectWrites: Object.freeze([
    "bodyless DELETE /api/v1/comment/{note-id} after exact current-viewer/body pre-read, accepted with 200 and independently absent with GET /api/v1/reader/comment/{note-id} returning 404"
  ]),
  currentBundleOnly: Object.freeze({
    dmRead: "GET /api/v1/messages/dm/{thread-id}",
    dmStart: "POST /api/v1/messages/dm/start",
    dmSend: "POST /api/v1/messages/dm/{thread-id}",
    postReaction: "POST|DELETE /api/v1/post/{post-id}/reaction",
    commentReaction: "POST|DELETE /api/v1/comment/{comment-id}/reaction",
    postSave: "POST|DELETE /api/v1/posts/saved",
    noteSave: "POST|DELETE /api/v1/note/{entity-key}/save",
    restack: "POST /api/v1/restack/feed",
    videoUploadInitialization: "request-shape candidate: POST /api/v1/video/upload?filetype={type}&fileSize={bytes}&fileName={name} with optional post_id and postAsUserId",
    videoMultipartTransfer: "request-shape candidate: ordered raw PUT byte slicing with credentials and form-data disabled; static code references Etag fields but proves no returned header",
    videoTranscode: "request-shape candidate: POST /api/v1/video/upload/{media-upload-id}/transcode with duration, multipart_upload_id, and ordered multipart_upload_etags",
    videoStatus: "request-shape candidate: GET /api/v1/video/upload/{media-upload-id}; bundle lifecycle vocabulary includes created/uploaded/transcoded/error/cancelled",
    noteDelete: "DELETE /api/v1/comment/{note-id} with an optional publication_id body field"
  }),
  unresolvedMutationBindings: Object.freeze([
    "video initialization acceptance and exact initialization/transcode response key sets",
    "provider-issued multipart upload hostname family, exact accepted PUT status, and returned ETag binding",
    "Note video attachment identifier and create-response attachment shape",
    "independent Note video readback media identity and URL fields"
  ])
});

// src/providers/substack-web-runtime.ts
var SUBSTACK_ORIGIN2 = "https://substack.com";
var MAX_BOOTSTRAP_BYTES = 8 * 1024 * 1024;
var MAX_LOGIN_BYTES = 256 * 1024;
var MAX_READ_BYTES = 8 * 1024 * 1024;
var MAX_SUBSTACK_IMAGE_BYTES = 20 * 1024 * 1024;
var MAX_SUBSTACK_VIDEO_BYTES = 128 * 1024 * 1024;
var SUBSTACK_VIDEO_BINDING_KEYS = Object.freeze([
  "byteLength",
  "bytes",
  "durationSeconds",
  "height",
  "mediaType",
  "sha256",
  "width"
]);
var SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES = 50 * 1024 * 1024;
var MAX_SUBSTACK_VIDEO_PARTS = Math.ceil(MAX_SUBSTACK_VIDEO_BYTES / SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES);
var MAX_SUBSTACK_RECOVERY_IDENTIFIER_BYTES = 4096;
var DEFAULT_LIMIT = 20;
var SUBSTACK_NOTE_READBACK_DELAYS_MS = Object.freeze([500, 1500, 4000]);
var SUBSTACK_DELETE_REQUEST_LABEL = "Substack personal Note deletion request";
var MIN_PINNED_HTTPS_TIMEOUT_MS = 1000;
var TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
var TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "buffer")?.get;
var TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "byteLength")?.get;
function sleepForSubstackReadback(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new Error("Substack Note readback wait was cancelled"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new Error("Substack Note readback wait was cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
function isSubstackOperation(value) {
  return SUBSTACK_WEB_OPERATION_NAMES.includes(value);
}
function integerInput(input, name, fallback, minimum, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function positiveIdInput(input, name) {
  return integerInput(input, name, Number.NaN, 1, Number.MAX_SAFE_INTEGER);
}
function optionalStringInput(input, name, maximum) {
  const value = input[name];
  if (value === undefined)
    return;
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/u.test(value))
    throw new Error(`input.${name} must be bounded text`);
  return value;
}
function substackProfileInput(input) {
  const value = input.profile;
  if (typeof value !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(value))
    throw new Error("input.profile must be one canonical lowercase Substack handle");
  return value;
}
function substackOrganizationInput(input) {
  const value = input.organization;
  if (typeof value !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value))
    throw new Error("input.organization must be one canonical lowercase Substack subdomain");
  return value;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireExactKeys(value, expected, label) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} keys did not match the reviewed contract`);
  }
}
function requireAllowedKeys(value, allowed, label) {
  const permitted = new Set(allowed);
  if (Object.keys(value).some((key) => !permitted.has(key))) {
    throw new Error(`${label} contained fields outside the reviewed contract`);
  }
}
function requireExactInputKeys(input, allowed) {
  const permitted = new Set(allowed);
  const unexpected = Object.keys(input).filter((key) => !permitted.has(key));
  if (unexpected.length > 0) {
    throw new Error(`input contains unsupported keys: ${unexpected.join(", ")}`);
  }
}
function fileInput(value) {
  if (!isRecord2(value) || value.kind !== "file" || typeof value.reference !== "string" || value.reference.length < 1 || value.reference.length > 4096 || /[\0\r\n]/u.test(value.reference) || Object.keys(value).sort().join(",") !== "kind,reference")
    throw new Error("input.media must be one plan-bound file");
  return Object.freeze({ kind: "file", reference: value.reference });
}
function substackNoteText(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 500 || /[\0\r]/u.test(value))
    throw new Error(`${label} must be bounded Substack Note text`);
  return value;
}
function prepareSubstackVideoNotePublishInput(input) {
  requireExactInputKeys(input, ["body", "media"]);
  return Object.freeze({
    body: substackNoteText(input.body, "input.body"),
    media: fileInput(input.media)
  });
}
function prepareSubstackPersonalNoteDeleteInput(input) {
  requireExactInputKeys(input, ["expected_body", "note_id"]);
  return Object.freeze({
    expectedBody: substackNoteText(input.expected_body, "input.expected_body"),
    noteId: positiveIdInput(input, "note_id")
  });
}
function substackVideoSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function exactSubstackVideoBinding(value) {
  if (typeof value !== "object" || value === null)
    throw new Error("Substack video binding must be one exact object");
  if (nodeTypes.isProxy(value)) {
    throw new Error("Substack video binding must not be a proxy");
  }
  if (Array.isArray(value)) {
    throw new Error("Substack video binding must be one exact object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Substack video binding must use a plain prototype");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== SUBSTACK_VIDEO_BINDING_KEYS.length || ownKeys.some((key) => typeof key !== "string") || ownKeys.sort().join(",") !== [...SUBSTACK_VIDEO_BINDING_KEYS].sort().join(","))
    throw new Error("Substack video binding contained unsupported fields");
  const snapshot = Object.create(null);
  for (const key of SUBSTACK_VIDEO_BINDING_KEYS) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("Substack video binding must contain only enumerable data properties");
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}
function snapshotSubstackVideoBytes(value) {
  if (typeof value !== "object" || value === null || nodeTypes.isProxy(value) || !(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype || TYPED_ARRAY_BUFFER_GETTER === undefined || TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined)
    throw new Error("Substack video binding must contain one bounded MP4");
  let buffer;
  let byteLength;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER.call(value);
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER.call(value);
  } catch {
    throw new Error("Substack video binding must contain one bounded MP4");
  }
  if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 24 || byteLength > MAX_SUBSTACK_VIDEO_BYTES || nodeTypes.isSharedArrayBuffer(buffer))
    throw new Error("Substack video binding must contain one bounded MP4");
  const bytes = new Uint8Array(byteLength);
  try {
    Uint8Array.prototype.set.call(bytes, value);
  } catch {
    throw new Error("Substack video binding must contain one bounded MP4");
  }
  return bytes;
}
function parseSubstackVideoBinding(value) {
  const binding = exactSubstackVideoBinding(value);
  const bytes = snapshotSubstackVideoBytes(binding.bytes);
  if (binding.mediaType !== "video/mp4") {
    throw new Error("Substack video binding must contain one bounded MP4");
  }
  const metadata = substackMp4Metadata(bytes, "Substack video");
  const sha256 = substackVideoSha256(bytes);
  if (!Number.isSafeInteger(binding.byteLength) || binding.byteLength !== bytes.byteLength || typeof binding.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(binding.sha256) || binding.sha256 !== sha256)
    throw new Error("Substack video binding byte integrity changed from its exact bytes");
  if (binding.durationSeconds !== metadata.durationSeconds || binding.height !== metadata.height || binding.width !== metadata.width)
    throw new Error("Substack video binding metadata changed from its exact bytes");
  return Object.freeze({
    bytes,
    byteLength: bytes.byteLength,
    durationSeconds: metadata.durationSeconds,
    height: metadata.height,
    mediaType: "video/mp4",
    sha256,
    width: metadata.width
  });
}
async function materializeSubstackVideo(media, fileResolver, operationDeadline) {
  if (fileResolver === undefined) {
    throw new Error("Substack video upload requires the plan-bound file resolver");
  }
  const paths = operationDeadline === undefined ? await fileResolver([media]) : await operationDeadline.run(() => fileResolver([media]), "authenticated web operation deadline");
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("Substack file resolver did not return one exact path");
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open(paths[0], constants.O_RDONLY | noFollow) : await operationDeadline.run(() => open(paths[0], constants.O_RDONLY | noFollow), "authenticated web operation deadline");
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 24 || before.size > MAX_SUBSTACK_VIDEO_BYTES) {
      throw new Error("Substack video must be a regular MP4 no larger than the 128 MiB in-memory publish limit");
    }
    const bytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.byteLength !== before.size)
      throw new Error("Substack video changed while it was materialized");
    const snapshot = new Uint8Array(bytes);
    const metadata = substackMp4Metadata(snapshot, "Substack video");
    return Object.freeze({
      bytes: snapshot,
      byteLength: snapshot.byteLength,
      durationSeconds: metadata.durationSeconds,
      height: metadata.height,
      mediaType: "video/mp4",
      sha256: substackVideoSha256(snapshot),
      width: metadata.width
    });
  } finally {
    await handle.close();
  }
}
function planSubstackVideoMultipartParts(byteLength, uploadUrlCount) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 24 || byteLength > MAX_SUBSTACK_VIDEO_BYTES)
    throw new Error("Substack video byte length is outside the reviewed bound");
  const expectedCount = Math.ceil(byteLength / SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES);
  if (!Number.isSafeInteger(uploadUrlCount) || uploadUrlCount !== expectedCount || uploadUrlCount < 1 || uploadUrlCount > MAX_SUBSTACK_VIDEO_PARTS)
    throw new Error("Substack multipart URL count does not exactly cover the video");
  return Object.freeze(Array.from({ length: uploadUrlCount }, (_, index) => {
    const start = index * SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES;
    const endExclusive = Math.min(byteLength, start + SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES);
    return Object.freeze({
      byteLength: endExclusive - start,
      endExclusive,
      partNumber: index + 1,
      start
    });
  }));
}
function parseSubstackVideoMultipartDispatchCheckpoint(value) {
  if (!isRecord2(value)) {
    throw new Error("Substack multipart dispatch checkpoint must be an object");
  }
  requireExactKeys(value, [
    "byteLength",
    "durationSeconds",
    "height",
    "mediaType",
    "partCount",
    "schemaVersion",
    "sha256",
    "width"
  ], "Substack multipart dispatch checkpoint");
  if (value.schemaVersion !== 1 || value.mediaType !== "video/mp4" || !Number.isSafeInteger(value.byteLength) || !Number.isSafeInteger(value.partCount) || typeof value.durationSeconds !== "number" || !Number.isFinite(value.durationSeconds) || value.durationSeconds <= 0 || !Number.isSafeInteger(value.height) || value.height < 1 || value.height > 20000 || !Number.isSafeInteger(value.width) || value.width < 1 || value.width > 20000 || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.sha256))
    throw new Error("Substack multipart dispatch checkpoint changed shape");
  planSubstackVideoMultipartParts(value.byteLength, value.partCount);
  return Object.freeze({
    byteLength: value.byteLength,
    durationSeconds: value.durationSeconds,
    height: value.height,
    mediaType: "video/mp4",
    partCount: value.partCount,
    schemaVersion: 1,
    sha256: value.sha256,
    width: value.width
  });
}
function createSubstackVideoMultipartDispatchCheckpoint(videoValue, uploadUrlCount) {
  const video = parseSubstackVideoBinding(videoValue);
  const parts = planSubstackVideoMultipartParts(video.byteLength, uploadUrlCount);
  return Object.freeze({
    byteLength: video.byteLength,
    durationSeconds: video.durationSeconds,
    height: video.height,
    mediaType: video.mediaType,
    partCount: parts.length,
    schemaVersion: 1,
    sha256: video.sha256,
    width: video.width
  });
}
function revalidateAndSnapshotSubstackVideoMultipartDispatch(videoValue, checkpointValue) {
  const video = parseSubstackVideoBinding(videoValue);
  const checkpoint = parseSubstackVideoMultipartDispatchCheckpoint(checkpointValue);
  if (video.byteLength !== checkpoint.byteLength || video.durationSeconds !== checkpoint.durationSeconds || video.height !== checkpoint.height || video.mediaType !== checkpoint.mediaType || video.sha256 !== checkpoint.sha256 || video.width !== checkpoint.width)
    throw new Error("Substack video changed after its multipart dispatch checkpoint");
  const plannedParts = planSubstackVideoMultipartParts(checkpoint.byteLength, checkpoint.partCount);
  const immutableVideo = new Blob([
    video.bytes
  ], { type: video.mediaType });
  if (immutableVideo.size !== checkpoint.byteLength || immutableVideo.type !== checkpoint.mediaType)
    throw new Error("Substack video multipart snapshot changed shape");
  return Object.freeze({
    checkpoint,
    parts: Object.freeze(plannedParts.map((part) => Object.freeze({
      body: immutableVideo.slice(part.start, part.endExclusive, video.mediaType),
      byteLength: part.byteLength,
      credentials: "omit",
      endExclusive: part.endExclusive,
      formData: false,
      method: "PUT",
      partNumber: part.partNumber,
      start: part.start
    })))
  });
}
function substackResponseBoundIdentifier(value, label) {
  const candidate = typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : value;
  if (typeof candidate !== "string" || !/^[A-Za-z0-9_-]{1,256}$/u.test(candidate))
    throw new Error(`${label} must be one response-bound identifier`);
  return candidate;
}
function parseSubstackVideoMultipartEtags(value, expectedCount) {
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 1 || expectedCount > MAX_SUBSTACK_VIDEO_PARTS)
    throw new Error("Substack multipart ETags did not bind every ordered part");
  if (typeof value !== "object" || value === null || nodeTypes.isProxy(value)) {
    throw new Error("Substack multipart ETags must be one exact data-only array");
  }
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new Error("Substack multipart ETags must be one exact data-only array");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  const lengthDescriptor = descriptors.length;
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || lengthDescriptor.value !== expectedCount)
    throw new Error("Substack multipart ETags did not bind every ordered part");
  if (ownKeys.length !== expectedCount + 1 || ownKeys.some((key) => typeof key !== "string"))
    throw new Error("Substack multipart ETags must be one exact data-only array");
  const snapshot = [];
  for (let index = 0;index < expectedCount; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error("Substack multipart ETags must be one exact data-only array");
    }
    const entry = descriptor.value;
    if (typeof entry !== "string" || !/^"[\x21\x23-\x7e]{1,256}"$/u.test(entry))
      throw new Error("Substack multipart ETag changed from a bounded strong entity-tag");
    snapshot.push(entry);
  }
  return Object.freeze(snapshot);
}
function parseSubstackVideoUploadState(value) {
  if (value !== "cancelled" && value !== "created" && value !== "error" && value !== "transcoded" && value !== "uploaded")
    throw new Error("Substack video upload returned an unreviewed state");
  return value;
}
function classifySubstackVideoUploadState(value) {
  const state = parseSubstackVideoUploadState(value);
  return Object.freeze({
    state,
    status: state === "transcoded" ? "complete" : state === "created" || state === "uploaded" ? "pending" : "terminal-failure"
  });
}
function substackVideoUploadInitializationRequest(byteLength) {
  planSubstackVideoMultipartParts(byteLength, Math.ceil(byteLength / SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES));
  const url = new URL("/api/v1/video/upload", SUBSTACK_ORIGIN2);
  url.searchParams.set("filetype", "video/mp4");
  url.searchParams.set("fileSize", String(byteLength));
  url.searchParams.set("fileName", "wrench-video.mp4");
  return Object.freeze({ method: "POST", url: url.href });
}
function substackVideoUploadInitializationRequestForBinding(videoValue) {
  const video = parseSubstackVideoBinding(videoValue);
  return substackVideoUploadInitializationRequest(video.bytes.byteLength);
}
function substackVideoTranscodeRequest(mediaUploadId, multipartUploadId, durationSeconds, videoByteLength, uploadUrlCount, etags) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Substack video duration must be finite and positive");
  }
  const uploadId = substackResponseBoundIdentifier(mediaUploadId, "Substack media upload ID");
  const multipartId = substackResponseBoundIdentifier(multipartUploadId, "Substack multipart upload ID");
  const parts = planSubstackVideoMultipartParts(videoByteLength, uploadUrlCount);
  const parsedEtags = parseSubstackVideoMultipartEtags(etags, parts.length);
  return Object.freeze({
    body: Object.freeze({
      duration: durationSeconds,
      multipart_upload_id: multipartId,
      multipart_upload_etags: parsedEtags
    }),
    method: "POST",
    url: new URL(`/api/v1/video/upload/${encodeURIComponent(uploadId)}/transcode`, SUBSTACK_ORIGIN2).href
  });
}
function substackVideoTranscodeRequestForBinding(mediaUploadId, multipartUploadId, videoValue, uploadUrlCount, etags) {
  const video = parseSubstackVideoBinding(videoValue);
  return substackVideoTranscodeRequest(mediaUploadId, multipartUploadId, video.durationSeconds, video.bytes.byteLength, uploadUrlCount, etags);
}
function substackVideoStatusRequest(mediaUploadId) {
  const uploadId = substackResponseBoundIdentifier(mediaUploadId, "Substack media upload ID");
  return Object.freeze({
    method: "GET",
    url: new URL(`/api/v1/video/upload/${encodeURIComponent(uploadId)}`, SUBSTACK_ORIGIN2).href
  });
}
function substackVideoUploadRecoveryTargetIdentifier(mediaUploadId) {
  return canonicalJson({
    mediaUploadId: substackResponseBoundIdentifier(mediaUploadId, "Substack video recovery media upload ID"),
    schemaVersion: 1
  });
}
function parseSubstackVideoUploadRecoveryTargetIdentifier(identifier) {
  if (typeof identifier !== "string" || identifier.length < 1 || identifier.length > MAX_SUBSTACK_RECOVERY_IDENTIFIER_BYTES || /[\0\r\n]/u.test(identifier))
    throw new Error("Substack video recovery target must be bounded canonical JSON");
  let value;
  try {
    value = JSON.parse(identifier);
  } catch {
    throw new Error("Substack video recovery target must be bounded canonical JSON");
  }
  if (!isRecord2(value)) {
    throw new Error("Substack video recovery target changed shape");
  }
  requireExactKeys(value, ["mediaUploadId", "schemaVersion"], "Substack video recovery target");
  if (value.schemaVersion !== 1) {
    throw new Error("Substack video recovery target changed schema version");
  }
  const target = Object.freeze({
    mediaUploadId: substackResponseBoundIdentifier(value.mediaUploadId, "Substack video recovery media upload ID"),
    schemaVersion: 1
  });
  if (canonicalJson(target) !== identifier) {
    throw new Error("Substack video recovery target must use canonical JSON");
  }
  return target;
}
function substackVideoUploadRecoveryStatusRequest(identifier) {
  const target = parseSubstackVideoUploadRecoveryTargetIdentifier(identifier);
  return substackVideoStatusRequest(target.mediaUploadId);
}
async function materializeSubstackImage(media, fileResolver, operationDeadline) {
  if (fileResolver === undefined) {
    throw new Error("Substack image upload requires the plan-bound file resolver");
  }
  const paths = operationDeadline === undefined ? await fileResolver([media]) : await operationDeadline.run(() => fileResolver([media]), "authenticated web operation deadline");
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("Substack file resolver did not return one exact path");
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open(paths[0], constants.O_RDONLY | noFollow) : await operationDeadline.run(() => open(paths[0], constants.O_RDONLY | noFollow), "authenticated web operation deadline");
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 24 || before.size > MAX_SUBSTACK_IMAGE_BYTES) {
      throw new Error("Substack image must be a regular PNG no larger than 20 MiB");
    }
    const bytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || bytes.byteLength !== before.size)
      throw new Error("Substack image changed while it was materialized");
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (signature.some((value, index) => bytes[index] !== value) || bytes.subarray(12, 16).toString("ascii") !== "IHDR")
      throw new Error("Substack image must be a PNG fixture");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 20000 || height > 20000) {
      throw new Error("Substack PNG dimensions are outside the reviewed bound");
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
function jsonHeaders() {
  return Object.freeze({
    accept: "application/json",
    referer: `${SUBSTACK_ORIGIN2}/`
  });
}
function jsonPostHeaders() {
  return Object.freeze({
    accept: "application/json",
    "content-type": "application/json",
    referer: `${SUBSTACK_ORIGIN2}/`
  });
}
function htmlHeaders() {
  return Object.freeze({
    accept: "text/html",
    referer: `${SUBSTACK_ORIGIN2}/`
  });
}
async function currentViewer(client, maximumBytes = MAX_BOOTSTRAP_BYTES) {
  const loggedInUrl = new URL("/api/v1/am_i_logged_in", SUBSTACK_ORIGIN2);
  authorizeSubstackWebReadRequest({
    operation: "viewer.logged-in",
    url: loggedInUrl,
    method: "GET"
  });
  parseSubstackLoggedInResponse(await client.requestJson({
    url: loggedInUrl,
    method: "GET",
    headers: jsonHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: Math.min(maximumBytes, MAX_LOGIN_BYTES)
  }));
  const rootUrl = new URL("/", SUBSTACK_ORIGIN2);
  authorizeSubstackWebReadRequest({
    operation: "viewer.root",
    url: rootUrl,
    method: "GET"
  });
  const html = await client.requestText({
    url: rootUrl,
    headers: htmlHeaders(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(maximumBytes, MAX_BOOTSTRAP_BYTES)
  });
  return parseSubstackPreloadsHtml(html);
}
function viewerSubject(viewer) {
  return `substack:${viewer.id}`;
}
async function probeSubstackWebSubject(auth, options = {}) {
  const client = await createWebSessionClient(SUBSTACK_ORIGIN2, auth, {
    timeoutMs: options.timeoutMs ?? 60000,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  return viewerSubject(await currentViewer(client));
}
async function requireBoundViewer(client, auth, maximumBytes) {
  const expected = webSessionAuthSubject(auth);
  if (expected === null || !/^substack:[0-9]{1,32}$/u.test(expected)) {
    throw new Error("Substack authenticated operations require an auth locator bound to an exact substack:<user-id> subject");
  }
  const viewer = await currentViewer(client, maximumBytes);
  if (viewerSubject(viewer) !== expected) {
    throw new Error("Substack browser session viewer no longer matches the confirmed auth subject");
  }
  return viewer;
}
function boundedMaximum(recipe) {
  return Math.min(recipe.maxOutputBytes, MAX_READ_BYTES);
}
function feedName(input) {
  const value = input.feed;
  if (value !== "notes" && value !== "inbox" && value !== "reader-posts") {
    throw new Error("input.feed must name notes, inbox, or reader-posts");
  }
  return value;
}
async function readFeed(client, recipe, input) {
  const feed = feedName(input);
  const limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  const request = {
    notes: {
      operation: "feeds.reader",
      path: "/api/v1/reader/feed"
    },
    inbox: {
      operation: "feeds.inbox",
      path: "/api/v1/inbox/top"
    },
    "reader-posts": {
      operation: "feeds.posts",
      path: "/api/v1/reader/posts"
    }
  }[feed];
  const url = new URL(request.path, SUBSTACK_ORIGIN2);
  authorizeSubstackWebReadRequest({
    operation: request.operation,
    url,
    method: "GET"
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe)
  });
  return normalizeSubstackFeedResponse(response, feed, limit);
}
async function readProfile(client, recipe, viewer, input, now) {
  requireExactInputKeys(input, ["profile"]);
  const profile = substackProfileInput(input);
  if (viewer.handle !== profile) {
    throw new Error("Substack requested profile does not match the signed-in viewer");
  }
  const url = new URL(`/api/v1/user/${profile}/public_profile`, SUBSTACK_ORIGIN2);
  authorizeSubstackWebReadRequest({
    operation: "profiles.read",
    url,
    method: "GET",
    profile
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: boundedMaximum(recipe)
  });
  return normalizeSubstackProfileStatsResponse(response, viewer.id, profile, new Date(now()).toISOString());
}
async function readOrganization(recipe, input, auth, viewer, options) {
  requireExactInputKeys(input, ["organization"]);
  const organization = substackOrganizationInput(input);
  const origin = `https://${organization}.substack.com`;
  const owned = viewer.publications.filter((publication2) => publication2.origin === origin);
  if (owned.length !== 1) {
    throw new Error("Substack requested organization is not one exact signed-in viewer-owned publication");
  }
  const publication = owned[0];
  const client = await createWebSessionClient(origin, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const url = new URL("/api/v1/publish-dashboard/summary", origin);
  authorizeSubstackWebReadRequest({
    operation: "organizations.read",
    url,
    method: "GET",
    organization,
    publicationOrigin: publication.origin
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: Object.freeze({
      accept: "application/json",
      referer: `${origin}/publish/home`
    }),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: boundedMaximum(recipe)
  });
  return normalizeSubstackPublicationStatsResponse(response, {
    id: publication.id,
    organization,
    origin: publication.origin
  }, new Date((options.dependencies?.now ?? Date.now)()).toISOString());
}
async function readNote(client, recipe, input) {
  const noteId = positiveIdInput(input, "note_id");
  const url = new URL(`/api/v1/reader/comment/${noteId}`, SUBSTACK_ORIGIN2);
  authorizeSubstackWebReadRequest({
    operation: "posts.note",
    url,
    method: "GET",
    targetId: noteId
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe)
  });
  return normalizeSubstackNoteResponse(response, noteId);
}
async function articleResponse(client, recipe, articleId, operation) {
  const url = new URL(`/api/v1/posts/by-id/${articleId}`, SUBSTACK_ORIGIN2);
  authorizeSubstackWebReadRequest({
    operation,
    url,
    method: "GET",
    targetId: articleId
  });
  return client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe)
  });
}
async function readArticle(client, recipe, input, media) {
  const articleId = positiveIdInput(input, "article_id");
  const response = await articleResponse(client, recipe, articleId, media ? "media.read" : "articles.read");
  return media ? normalizeSubstackMediaResponse(response, articleId) : normalizeSubstackArticleResponse(response, articleId);
}
async function readComments(client, recipe, input) {
  const articleId = positiveIdInput(input, "article_id");
  const publicationId = positiveIdInput(input, "publication_id");
  const limit = integerInput(input, "limit", 50, 1, 100);
  const article = normalizeSubstackArticleResponse(await articleResponse(client, recipe, articleId, "articles.read"), articleId);
  if (article.post.publicationId !== publicationId) {
    throw new Error("input.publication_id did not match the requested Substack article");
  }
  const url = new URL(`/api/v1/reader/post/${articleId}/replies`, SUBSTACK_ORIGIN2);
  url.searchParams.set("publication_id", String(publicationId));
  const cursor = optionalStringInput(input, "cursor", 4096);
  if (cursor !== undefined)
    url.searchParams.set("cursor", cursor);
  authorizeSubstackWebReadRequest({
    operation: "comments.read",
    url,
    method: "GET",
    targetId: articleId,
    publicationId
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe)
  });
  return normalizeSubstackCommentsResponse(response, articleId, limit);
}
function messageFolder(input) {
  const value = input.folder;
  if (value !== "all" && value !== "people" && value !== "unread") {
    throw new Error("input.folder must name all, people, or unread");
  }
  return value;
}
async function listMessages(client, recipe, input) {
  const folder = messageFolder(input);
  const limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  const url = new URL("/api/v1/messages/inbox", SUBSTACK_ORIGIN2);
  url.searchParams.set("tab", folder);
  const cursor = optionalStringInput(input, "cursor", 4096);
  if (cursor !== undefined)
    url.searchParams.set("cursor", cursor);
  authorizeSubstackWebReadRequest({
    operation: "messages.list",
    url,
    method: "GET",
    folder
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe)
  });
  return normalizeSubstackMessageInbox(response, folder, limit);
}
function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}
function exactSubstackImageUrl(value, width, height, label) {
  if (typeof value !== "string" || value.length > 8192) {
    throw new Error(`${label} must be a bounded URL`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const path = new RegExp(`^/public/images/${uuid}_${width}x${height}\\.png$`, "iu");
  if (parsed.protocol !== "https:" || parsed.hostname !== "substack-post-media.s3.amazonaws.com" || parsed.port !== "" || parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "" || !path.test(parsed.pathname))
    throw new Error(`${label} did not match the reviewed Substack image asset URL`);
  return parsed.href;
}
function parseUploadedSubstackImage(value, image) {
  if (!isRecord2(value))
    throw new Error("Substack image upload response must be an object");
  requireExactKeys(value, [
    "bytes",
    "contentType",
    "id",
    "imageHeight",
    "imageWidth",
    "url"
  ], "Substack image upload response");
  if (value.bytes !== image.bytes.byteLength || value.contentType !== image.mediaType || value.imageHeight !== image.height || value.imageWidth !== image.width)
    throw new Error("Substack image upload response did not bind the reviewed PNG");
  return Object.freeze({
    id: positiveInteger(value.id, "Substack image upload response.id"),
    url: exactSubstackImageUrl(value.url, image.width, image.height, "Substack image upload response.url")
  });
}
function attachmentUuid(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value))
    throw new Error(`${label} must be an exact UUID`);
  return value;
}
function parseSubstackImageAttachment(value, image, expectedUrl) {
  if (!isRecord2(value))
    throw new Error("Substack image attachment response must be an object");
  requireExactKeys(value, [
    "explicit",
    "id",
    "imageHeight",
    "imageUrl",
    "imageWidth",
    "type"
  ], "Substack image attachment response");
  if (value.explicit !== false || value.type !== "image" || value.imageHeight !== image.height || value.imageWidth !== image.width || value.imageUrl !== expectedUrl)
    throw new Error("Substack image attachment response did not bind the reviewed PNG");
  return Object.freeze({
    id: attachmentUuid(value.id, "Substack image attachment response.id"),
    url: expectedUrl
  });
}
async function uploadSubstackImage(client, image) {
  const encoded = `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString("base64")}`;
  const uploaded = parseUploadedSubstackImage(await client.requestJson({
    url: new URL("/api/v1/image", SUBSTACK_ORIGIN2),
    method: "POST",
    headers: jsonPostHeaders(),
    body: JSON.stringify({ image: encoded }),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: 256 * 1024
  }), image);
  uploaded.id;
  return parseSubstackImageAttachment(await client.requestJson({
    url: new URL("/api/v1/comment/attachment", SUBSTACK_ORIGIN2),
    method: "POST",
    headers: jsonPostHeaders(),
    body: JSON.stringify({ type: "image", url: uploaded.url }),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: 256 * 1024
  }), image, uploaded.url);
}
function substackBodyJson(body) {
  const content = body.split(`
`).map((line) => Object.freeze({
    type: "paragraph",
    ...line.length === 0 ? {} : { content: Object.freeze([Object.freeze({ type: "text", text: line })]) }
  }));
  return Object.freeze({
    type: "doc",
    attrs: Object.freeze({ schemaVersion: "v1", title: null }),
    content: Object.freeze(content)
  });
}
function noteBodyInput(input) {
  return substackNoteText(input.body, "input.body");
}
var CREATED_NOTE_KEYS = Object.freeze([
  "ancestor_path",
  "attachments",
  "autotranslate_to",
  "body",
  "body_json",
  "children",
  "children_count",
  "date",
  "deleted",
  "edited_at",
  "handle",
  "id",
  "is_ai_generated_text",
  "language",
  "media_clip_id",
  "name",
  "photo_url",
  "post_id",
  "publication_id",
  "reaction_count",
  "reactions",
  "reply_minimum_role",
  "restacked",
  "restacks",
  "status",
  "type",
  "userStatus",
  "user_bestseller_tier",
  "user_id",
  "user_primary_publication"
]);

class SubstackNoteCreateBindingError extends Error {
  stage;
  constructor(stage, message) {
    super(message);
    this.stage = stage;
    this.name = "SubstackNoteCreateBindingError";
  }
}
function noteCreateBindingFailure(stage, message) {
  throw new SubstackNoteCreateBindingError(stage, message);
}
function substackNoteCreateRequestFailureStage(error) {
  const message = error instanceof Error ? error.message : "";
  const statusPrefix = "authenticated web API returned unreviewed status/content type ";
  if (message.startsWith(statusPrefix)) {
    const separator = message.indexOf("/", statusPrefix.length);
    const status = separator < 0 ? "" : message.slice(statusPrefix.length, separator);
    return status === "200" ? "note-create-content-type" : "note-create-http-status";
  }
  if (message === "authenticated web API returned invalid UTF-8 JSON" || message === "authenticated web API returned malformed JSON")
    return "note-create-json";
  if (message === "authenticated web response exceeded its reviewed byte limit" || message === "authenticated web response yielded a non-byte chunk")
    return "note-create-response-bounds";
  return "note-create-transport";
}
function parseCreatedSubstackNote(value, viewer, body, bodyJson, attachment) {
  if (!isRecord2(value)) {
    noteCreateBindingFailure("note-create-response-object", "Substack Note create response must be an object");
  }
  try {
    requireAllowedKeys(value, CREATED_NOTE_KEYS, "Substack Note create response");
  } catch {
    noteCreateBindingFailure("note-create-response-fields", "Substack Note create response fields changed");
  }
  if (value.user_id !== viewer.id) {
    noteCreateBindingFailure("note-create-actor", "Substack Note create response did not bind the confirmed actor");
  }
  if (value.body !== body) {
    noteCreateBindingFailure("note-create-body", "Substack Note create response did not bind the confirmed body");
  }
  if (value.type !== "feed") {
    noteCreateBindingFailure("note-create-kind", "Substack Note create response did not bind the confirmed Note kind");
  }
  if (value.deleted !== undefined && value.deleted !== false) {
    noteCreateBindingFailure("note-create-deleted-state", "Substack Note create response returned a deleted Note");
  }
  if (value.post_id !== null) {
    noteCreateBindingFailure("note-create-parent-post", "Substack Note create response did not bind the confirmed parent post");
  }
  if (value.publication_id !== null) {
    noteCreateBindingFailure("note-create-publication", "Substack Note create response did not bind the confirmed publication");
  }
  if (value.reply_minimum_role !== "everyone") {
    noteCreateBindingFailure("note-create-reply-role", "Substack Note create response did not bind the confirmed reply role");
  }
  let bodyJsonMatches = false;
  try {
    bodyJsonMatches = canonicalJson(value.body_json) === canonicalJson(bodyJson);
  } catch {
    bodyJsonMatches = false;
  }
  if (!bodyJsonMatches) {
    noteCreateBindingFailure("note-create-body-json", "Substack Note create response did not bind the confirmed body document");
  }
  if (value.status !== undefined && value.status !== "published") {
    noteCreateBindingFailure("note-create-publication-status", "Substack Note create response did not bind the confirmed publication status");
  }
  const attachments = value.attachments;
  if (attachments !== undefined && !Array.isArray(attachments)) {
    noteCreateBindingFailure("note-create-attachments-shape", "Substack Note create response attachments changed shape");
  }
  if (Array.isArray(attachments) && attachments.length > 0) {
    if (attachment === null || attachments.length !== 1) {
      noteCreateBindingFailure("note-create-attachments-count", "Substack Note create response did not bind the confirmed attachment count");
    }
    const item = attachments[0];
    if (!isRecord2(item)) {
      noteCreateBindingFailure("note-create-attachment-object", "Substack Note create attachment must be an object");
    }
    try {
      requireExactKeys(item, [
        "explicit",
        "id",
        "imageHeight",
        "imageUrl",
        "imageWidth",
        "type"
      ], "Substack Note create attachment");
    } catch {
      noteCreateBindingFailure("note-create-attachment-fields", "Substack Note create attachment fields changed");
    }
    if (item.id !== attachment.id) {
      noteCreateBindingFailure("note-create-attachment-id", "Substack Note create response attachment did not bind the uploaded image identifier");
    }
    if (item.imageUrl !== attachment.url) {
      noteCreateBindingFailure("note-create-attachment-url", "Substack Note create response attachment did not bind the uploaded image URL");
    }
    if (item.type !== "image") {
      noteCreateBindingFailure("note-create-attachment-kind", "Substack Note create response attachment did not bind the uploaded image kind");
    }
  }
  try {
    return positiveInteger(value.id, "Substack Note create response.id");
  } catch {
    noteCreateBindingFailure("note-create-id", "Substack Note create response did not return a valid Note identifier");
  }
}
function assertSubstackNoteDeletionPreRead(value, noteId, viewerId, expectedBody) {
  if (!Number.isSafeInteger(noteId) || noteId < 1) {
    throw new Error("Substack deletion Note ID must be positive");
  }
  if (!Number.isSafeInteger(viewerId) || viewerId < 1) {
    throw new Error("Substack deletion viewer ID must be positive");
  }
  substackNoteText(expectedBody, "Substack deletion expected body");
  const note = normalizeSubstackNoteResponse(value, noteId);
  if (note.entityKey !== `c-${noteId}` || note.comment.id !== noteId || note.comment.userId !== viewerId || note.comment.publicationId !== null || note.comment.postId !== null || note.comment.body !== expectedBody || note.comment.type !== "feed" || note.post !== null)
    throw new Error("Substack deletion pre-read did not bind the exact authored Note");
  return Object.freeze({ noteId, publicationId: null, schemaVersion: 1 });
}
function substackNoteDeletionRecoveryTargetIdentifier(targetValue) {
  if (!isRecord2(targetValue)) {
    throw new Error("Substack deletion recovery target changed shape");
  }
  requireExactKeys(targetValue, ["noteId", "publicationId", "schemaVersion"], "Substack deletion recovery target");
  if (targetValue.publicationId !== null || targetValue.schemaVersion !== 1) {
    throw new Error("Substack deletion recovery target changed shape");
  }
  return canonicalJson({
    noteId: positiveInteger(targetValue.noteId, "Substack deletion recovery target.noteId"),
    publicationId: null,
    schemaVersion: 1
  });
}
function parseSubstackNoteDeletionRecoveryTargetIdentifier(identifier) {
  if (typeof identifier !== "string" || identifier.length < 1 || identifier.length > MAX_SUBSTACK_RECOVERY_IDENTIFIER_BYTES || /[\0\r\n]/u.test(identifier))
    throw new Error("Substack deletion recovery target must be bounded canonical JSON");
  let value;
  try {
    value = JSON.parse(identifier);
  } catch {
    throw new Error("Substack deletion recovery target must be bounded canonical JSON");
  }
  if (!isRecord2(value)) {
    throw new Error("Substack deletion recovery target changed shape");
  }
  const canonical = substackNoteDeletionRecoveryTargetIdentifier(value);
  if (canonical !== identifier) {
    throw new Error("Substack deletion recovery target must use canonical JSON");
  }
  return Object.freeze({
    noteId: positiveInteger(value.noteId, "Substack deletion recovery target.noteId"),
    publicationId: null,
    schemaVersion: 1
  });
}
function substackNoteDeletionRecoveryReadRequest(identifier) {
  const target = parseSubstackNoteDeletionRecoveryTargetIdentifier(identifier);
  return Object.freeze({
    method: "GET",
    url: new URL(`/api/v1/reader/comment/${target.noteId}`, SUBSTACK_ORIGIN2).href
  });
}
function substackPersonalNoteDeleteRequest(noteId) {
  const target = positiveInteger(noteId, "Substack deletion Note ID");
  return Object.freeze({
    method: "DELETE",
    url: new URL(`/api/v1/comment/${target}`, SUBSTACK_ORIGIN2).href
  });
}
async function dispatchSubstackPersonalNoteDelete(client, noteId, options) {
  const request = substackPersonalNoteDeleteRequest(noteId);
  const url = new URL(request.url);
  if (url.origin !== SUBSTACK_ORIGIN2 || url.pathname !== `/api/v1/comment/${noteId}` || url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "")
    throw new Error("Substack personal Note deletion escaped its exact reviewed target");
  const ownedDeadline = options.operationDeadline === undefined ? new OperationDeadline(options.timeoutMs, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  }) : null;
  const deadline = options.operationDeadline ?? ownedDeadline;
  if (deadline === null) {
    throw new Error("Substack personal Note deletion deadline is unavailable");
  }
  const headers = new Headers(jsonPostHeaders());
  headers.set("cookie", renderCookieHeader(client.cookies));
  let response;
  try {
    deadline.throwIfUnavailable(SUBSTACK_DELETE_REQUEST_LABEL);
    const timeoutMs = deadline.remainingTimeMs();
    if (options.dependencies?.fetch === undefined && timeoutMs < MIN_PINNED_HTTPS_TIMEOUT_MS) {
      throw new Error("Substack personal Note deletion has insufficient time for its request");
    }
    try {
      response = await deadline.run((signal) => {
        const init = {
          method: request.method,
          headers,
          redirect: "error",
          signal
        };
        return options.dependencies?.fetch === undefined ? pinnedHttpsFetch(url, init, timeoutMs) : options.dependencies.fetch(url, init);
      }, SUBSTACK_DELETE_REQUEST_LABEL);
    } catch (error) {
      throw new Error("Substack personal Note deletion failed before a reviewed response was received", { cause: error });
    }
    if (response.status !== 200 || response.headers.get("location") !== null) {
      response.body?.cancel().catch(() => {
        return;
      });
      throw new Error(`Substack personal Note deletion returned unreviewed status/redirect ${response.status}`);
    }
    response.body?.cancel().catch(() => {
      return;
    });
    deadline.throwIfUnavailable(SUBSTACK_DELETE_REQUEST_LABEL);
  } finally {
    if (deadline.signal.aborted) {
      response?.body?.cancel().catch(() => {
        return;
      });
    }
    ownedDeadline?.dispose();
  }
}
async function readSubstackPersonalNoteDeletionPresence(client, recipe, noteId, viewerId, expectedBody) {
  const request = substackNoteDeletionRecoveryReadRequest(substackNoteDeletionRecoveryTargetIdentifier({
    noteId,
    publicationId: null,
    schemaVersion: 1
  }));
  const url = new URL(request.url);
  authorizeSubstackWebReadRequest({
    operation: "posts.note",
    url,
    method: "GET",
    targetId: noteId
  });
  const status = await client.requestStatus({
    url,
    method: "GET",
    headers: jsonHeaders(),
    expectedStatuses: [200, 404]
  });
  if (status.status === 404) {
    return Object.freeze({ present: false, target: null });
  }
  const value = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: boundedMaximum(recipe)
  });
  return Object.freeze({
    present: true,
    target: assertSubstackNoteDeletionPreRead(value, noteId, viewerId, expectedBody)
  });
}
function assertSubstackNoteReadback(note, noteId, viewer, body, image, attachment) {
  if (note.entityKey !== `c-${noteId}` || note.comment.id !== noteId || note.comment.userId !== viewer.id || note.comment.publicationId !== null || note.comment.postId !== null || note.comment.body !== body || note.comment.type !== "feed" || note.post !== null)
    throw new Error("Substack Note readback did not bind the confirmed Note");
  if (image === null || attachment === null) {
    if (note.comment.attachments.length !== 0) {
      throw new Error("Substack Note readback contained an unexpected attachment");
    }
    return;
  }
  if (note.comment.attachments.length !== 1 || note.comment.attachments[0]?.id !== attachment.id || note.comment.attachments[0]?.type !== "image" || note.comment.attachments[0]?.imageUrl !== attachment.url || note.comment.attachments[0]?.width !== image.width || note.comment.attachments[0]?.height !== image.height)
    throw new Error("Substack Note readback did not bind the confirmed image");
}
function substackDispatchEvent(started, verified) {
  return {
    id: "posts.publish",
    index: 1,
    progress: { planned: 1, started, verified }
  };
}
function substackDeleteDispatchEvent(started, verified) {
  return {
    id: "content.delete",
    index: 1,
    progress: { planned: 1, started, verified }
  };
}
function substackNoteUrl(handle, noteId) {
  return new URL(`/@${encodeURIComponent(handle)}/note/c-${noteId}`, SUBSTACK_ORIGIN2).href;
}
async function waitForSubstackNoteReadback(milliseconds, sleep, signal, operationDeadline) {
  if (operationDeadline === undefined) {
    await sleep(milliseconds, signal);
    return;
  }
  await operationDeadline.run((deadlineSignal) => sleep(milliseconds, deadlineSignal), "authenticated web operation deadline");
}
async function readExactSubstackNoteAfterPublish(client, recipe, noteId, viewer, body, image, attachment, options) {
  const readbackUrl = new URL(`/api/v1/reader/comment/${noteId}`, SUBSTACK_ORIGIN2);
  authorizeSubstackWebReadRequest({
    operation: "posts.note",
    url: readbackUrl,
    method: "GET",
    targetId: noteId
  });
  for (let attempt = 0;attempt <= SUBSTACK_NOTE_READBACK_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await waitForSubstackNoteReadback(SUBSTACK_NOTE_READBACK_DELAYS_MS[attempt - 1], options.sleep, options.signal, options.operationDeadline);
    }
    try {
      const note = normalizeSubstackNoteResponse(await client.requestJson({
        url: readbackUrl,
        method: "GET",
        headers: jsonHeaders(),
        maxBytes: boundedMaximum(recipe)
      }), noteId);
      assertSubstackNoteReadback(note, noteId, viewer, body, image, attachment);
      return note;
    } catch {
      options.operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
      if (options.signal?.aborted === true) {
        throw new Error("Substack Note readback was cancelled");
      }
      if (attempt === SUBSTACK_NOTE_READBACK_DELAYS_MS.length) {
        throw new Error("Substack exact Note readback exhausted its reviewed window");
      }
    }
  }
  throw new Error("Substack exact Note readback exhausted its reviewed window");
}
function parseSubstackAcceptedNoteTarget(identifier) {
  if (typeof identifier !== "string" || identifier.length < 1 || identifier.length > 8192 || /[\0\r\n]/u.test(identifier))
    throw new Error("Substack accepted Note target must be bounded canonical JSON");
  let value;
  try {
    value = JSON.parse(identifier);
  } catch {
    throw new Error("Substack accepted Note target must be bounded canonical JSON");
  }
  if (!isRecord2(value))
    throw new Error("Substack accepted Note target changed shape");
  requireExactKeys(value, ["attachment", "noteId"], "Substack accepted Note target");
  if (canonicalJson(value) !== identifier) {
    throw new Error("Substack accepted Note target must use canonical JSON");
  }
  const noteId = positiveInteger(value.noteId, "Substack accepted Note target.noteId");
  if (value.attachment === null)
    return Object.freeze({ noteId, attachment: null });
  if (!isRecord2(value.attachment)) {
    throw new Error("Substack accepted Note attachment changed shape");
  }
  requireExactKeys(value.attachment, ["height", "id", "mediaType", "url", "width"], "Substack accepted Note attachment");
  const width = positiveInteger(value.attachment.width, "Substack accepted Note attachment.width");
  const height = positiveInteger(value.attachment.height, "Substack accepted Note attachment.height");
  if (width > 20000 || height > 20000 || value.attachment.mediaType !== "image/png") {
    throw new Error("Substack accepted Note attachment changed shape");
  }
  return Object.freeze({
    noteId,
    attachment: Object.freeze({
      id: attachmentUuid(value.attachment.id, "Substack accepted Note attachment.id"),
      url: exactSubstackImageUrl(value.attachment.url, width, height, "Substack accepted Note attachment.url"),
      height,
      width,
      mediaType: "image/png"
    })
  });
}
async function readSubstackWebAcceptedNoteTargetPresence(recipe, input, auth, acceptedIdentifier, options = {}) {
  if (recipe.site !== "substack" || recipe.action !== "posts.publish" || recipe.contractVersion !== 3)
    throw new Error("Substack accepted Note readback supports only posts.publish@3");
  requireExactInputKeys(input, ["body", "media"]);
  const body = noteBodyInput(input);
  const media = input.media === undefined ? null : fileInput(input.media);
  const target = parseSubstackAcceptedNoteTarget(acceptedIdentifier);
  if (media !== null !== (target.attachment !== null)) {
    throw new Error("Substack accepted Note target did not bind the confirmed media input");
  }
  const client = await createWebSessionClient(SUBSTACK_ORIGIN2, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const viewer = await requireBoundViewer(client, auth, recipe.maxOutputBytes);
  const readbackUrl = new URL(`/api/v1/reader/comment/${target.noteId}`, SUBSTACK_ORIGIN2);
  authorizeSubstackWebReadRequest({
    operation: "posts.note",
    url: readbackUrl,
    method: "GET",
    targetId: target.noteId
  });
  const note = normalizeSubstackNoteResponse(await client.requestJson({
    url: readbackUrl,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe)
  }), target.noteId);
  assertSubstackNoteReadback(note, target.noteId, viewer, body, target.attachment, target.attachment);
  return Object.freeze({ present: true, noteId: target.noteId });
}
async function executeSubstackPost(client, recipe, viewer, input, options) {
  requireExactInputKeys(input, ["body", "media"]);
  const body = noteBodyInput(input);
  const bodyJson = substackBodyJson(body);
  if (viewer.handle === null) {
    throw new Error("Substack Note publication requires the bound viewer's public handle");
  }
  const image = input.media === undefined ? null : await materializeSubstackImage(fileInput(input.media), options.fileResolver, options.operationDeadline);
  const reboundViewer = await currentViewer(client, boundedMaximum(recipe));
  if (viewerSubject(reboundViewer) !== viewerSubject(viewer)) {
    throw new Error("Substack current viewer changed before the Note dispatch");
  }
  if (reboundViewer.handle === null) {
    throw new Error("Substack Note publication requires the bound viewer's public handle");
  }
  let started = 0;
  let verified = 0;
  let noteId = null;
  let attachment = null;
  let failureStage = "dispatch-admission";
  try {
    failureStage = "image-upload";
    attachment = image === null ? null : await uploadSubstackImage(client, image);
    failureStage = "dispatch-admission";
    await options.beforeDispatch?.(substackDispatchEvent(started, verified));
    started = 1;
    failureStage = "note-create-transport";
    let createdNoteResponse;
    try {
      createdNoteResponse = await client.requestJson({
        url: new URL("/api/v1/comment/feed", SUBSTACK_ORIGIN2),
        method: "POST",
        headers: jsonPostHeaders(),
        body: JSON.stringify({
          bodyJson,
          ...attachment === null ? {} : { attachmentIds: [attachment.id] },
          tabId: "for-you",
          surface: "feed",
          replyMinimumRole: "everyone"
        }),
        expectedStatuses: [200],
        expectedContentTypes: ["application/json"],
        maxBytes: boundedMaximum(recipe)
      });
    } catch (error) {
      failureStage = substackNoteCreateRequestFailureStage(error);
      throw error;
    }
    try {
      noteId = parseCreatedSubstackNote(createdNoteResponse, reboundViewer, body, bodyJson, attachment);
    } catch (error) {
      failureStage = error instanceof SubstackNoteCreateBindingError ? error.stage : "note-create-response-object";
      throw error;
    }
    failureStage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "posts.publish",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: canonicalJson({
          noteId,
          attachment: attachment === null ? null : {
            id: attachment.id,
            url: attachment.url,
            height: image.height,
            width: image.width,
            mediaType: image.mediaType
          }
        })
      }
    });
    failureStage = "note-readback";
    const note = await readExactSubstackNoteAfterPublish(client, recipe, noteId, reboundViewer, body, image, attachment, options);
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(substackDispatchEvent(started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({
        note,
        attachment: image === null ? null : Object.freeze({
          height: image.height,
          mediaType: image.mediaType,
          width: image.width
        })
      }),
      finalUrl: substackNoteUrl(reboundViewer.handle, noteId),
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: noteId === null ? SUBSTACK_ORIGIN2 : substackNoteUrl(reboundViewer.handle, noteId),
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? `Substack may have accepted the image upload or Note but exact actor, text, attachment, and permalink readback was not verified; reconcile before retrying (stage: ${failureStage})` : `Substack Note dispatch failed before submission (stage: ${failureStage})`
    };
  }
}
async function executeSubstackPersonalNoteDelete(client, recipe, viewer, input, options) {
  const plan = prepareSubstackPersonalNoteDeleteInput(input);
  const before = await readSubstackPersonalNoteDeletionPresence(client, recipe, plan.noteId, viewer.id, plan.expectedBody);
  const finalUrl = viewer.handle === null ? SUBSTACK_ORIGIN2 : substackNoteUrl(viewer.handle, plan.noteId);
  if (!before.present) {
    return {
      status: "succeeded",
      output: Object.freeze({ deleted: true, noOp: true, noteId: plan.noteId }),
      finalUrl,
      noOp: true,
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 }
    };
  }
  const reboundViewer = await currentViewer(client, boundedMaximum(recipe));
  if (viewerSubject(reboundViewer) !== viewerSubject(viewer)) {
    throw new Error("Substack current viewer changed before the Note deletion dispatch");
  }
  const fresh = await readSubstackPersonalNoteDeletionPresence(client, recipe, plan.noteId, reboundViewer.id, plan.expectedBody);
  if (!fresh.present) {
    return {
      status: "succeeded",
      output: Object.freeze({ deleted: true, noOp: true, noteId: plan.noteId }),
      finalUrl,
      noOp: true,
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 }
    };
  }
  if (fresh.target === null) {
    throw new Error("Substack deletion pre-read omitted its exact recovery target");
  }
  let started = 0;
  let verified = 0;
  let failureStage = "dispatch-admission";
  try {
    await options.beforeDispatch?.(substackDeleteDispatchEvent(started, verified));
    started = 1;
    failureStage = "delete-transport";
    await dispatchSubstackPersonalNoteDelete(client, plan.noteId, {
      timeoutMs: recipe.timeoutMs,
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
    });
    failureStage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "content.delete",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: substackNoteDeletionRecoveryTargetIdentifier(fresh.target)
      }
    });
    failureStage = "delete-readback";
    let after = await readSubstackPersonalNoteDeletionPresence(client, recipe, plan.noteId, reboundViewer.id, plan.expectedBody);
    for (const delay of SUBSTACK_NOTE_READBACK_DELAYS_MS) {
      if (!after.present)
        break;
      await waitForSubstackNoteReadback(delay, options.sleep, options.signal, options.operationDeadline);
      after = await readSubstackPersonalNoteDeletionPresence(client, recipe, plan.noteId, reboundViewer.id, plan.expectedBody);
    }
    if (after.present) {
      throw new Error("Substack exact Note deletion readback still returned the authored Note");
    }
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(substackDeleteDispatchEvent(started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({ deleted: true, noOp: false, noteId: plan.noteId }),
      finalUrl,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? `Substack may have deleted the exact authored Note, but independent absence was not verified; reconcile before retrying (stage: ${failureStage})` : `Substack Note deletion failed before submission (stage: ${failureStage})`
    };
  }
}
async function readSubstackWebContentDeleteDesiredState(recipe, input, auth, options = {}) {
  if (recipe.site !== "substack" || recipe.action !== "content.delete" || recipe.contractVersion !== 1)
    throw new Error("Substack deletion recovery supports only content.delete@1");
  const plan = prepareSubstackPersonalNoteDeleteInput(input);
  const client = await createWebSessionClient(SUBSTACK_ORIGIN2, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const viewer = await requireBoundViewer(client, auth, recipe.maxOutputBytes);
  const presence = await readSubstackPersonalNoteDeletionPresence(client, recipe, plan.noteId, viewer.id, plan.expectedBody);
  return Object.freeze({ present: presence.present, noteId: plan.noteId });
}
async function executeSubstackWebOperation(recipe, input, auth, options = {}) {
  if (recipe.site !== "substack" || !isSubstackOperation(recipe.action))
    throw new Error("Substack authenticated web recipe is not installed");
  const expectedContractVersion = recipe.action === "posts.publish" ? 3 : 1;
  if (recipe.contractVersion !== expectedContractVersion) {
    throw new Error(`Substack authenticated web operation ${recipe.action} contract version ${recipe.contractVersion} is not installed`);
  }
  const contract = SUBSTACK_WEB_OPERATIONS[recipe.action];
  if (contract.state !== "observed") {
    throw new Error(`Substack authenticated web operation ${recipe.action} is capture-required: ${contract.reason}`);
  }
  if (recipe.action !== "feeds.read" && recipe.action !== "posts.read" && recipe.action !== "articles.read" && recipe.action !== "comments.read" && recipe.action !== "media.read" && recipe.action !== "messaging.list" && recipe.action !== "profiles.read" && recipe.action !== "organizations.read" && recipe.action !== "posts.publish" && recipe.action !== "content.delete")
    throw new Error(`Substack authenticated web operation ${recipe.action} has no executable reviewed contract`);
  const statisticsRead = recipe.action === "profiles.read" || recipe.action === "organizations.read";
  const statisticsFinalUrl = recipe.action === "profiles.read" ? `https://substack.com/@${substackProfileInput(input)}` : recipe.action === "organizations.read" ? `https://${substackOrganizationInput(input)}.substack.com/` : null;
  let client;
  try {
    client = await createWebSessionClient(SUBSTACK_ORIGIN2, auth, {
      timeoutMs: recipe.timeoutMs,
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
    });
  } catch (error) {
    if (!statisticsRead)
      throw error;
    return failedProviderRead("Substack statistics", error, statisticsFinalUrl, {
      stage: "bootstrap",
      authenticated: true
    });
  }
  let viewer;
  try {
    viewer = await requireBoundViewer(client, auth, recipe.maxOutputBytes);
  } catch (error) {
    if (!statisticsRead)
      throw error;
    return failedProviderRead("Substack statistics", error, statisticsFinalUrl, {
      stage: "identity",
      authenticated: true,
      accountMismatch: (candidate) => candidate.message.includes("no longer matches"),
      authRepairRequired: (candidate) => candidate.message.includes("auth locator bound") || candidate instanceof SubstackAuthRepairRequiredError
    });
  }
  if (statisticsRead) {
    try {
      const output2 = recipe.action === "profiles.read" ? await readProfile(client, recipe, viewer, input, options.dependencies?.now ?? Date.now) : await readOrganization(recipe, input, auth, viewer, options);
      return {
        status: "succeeded",
        output: output2,
        finalUrl: statisticsFinalUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    } catch (error) {
      return failedProviderRead("Substack statistics", error, statisticsFinalUrl, {
        stage: "target",
        authenticated: true,
        accountMismatch: (candidate) => candidate.message.includes("does not match the signed-in viewer") || candidate.message.includes("viewer-owned publication") || candidate.message.includes("did not bind the current viewer ID")
      });
    }
  }
  if (recipe.action === "posts.publish") {
    return executeSubstackPost(client, recipe, viewer, input, {
      ...options,
      sleep: options.dependencies?.sleep ?? sleepForSubstackReadback
    });
  }
  if (recipe.action === "content.delete") {
    return executeSubstackPersonalNoteDelete(client, recipe, viewer, input, {
      ...options,
      sleep: options.dependencies?.sleep ?? sleepForSubstackReadback
    });
  }
  options.fileResolver;
  options.beforeDispatch;
  options.afterDispatchVerified;
  let output;
  let finalUrl = SUBSTACK_ORIGIN2;
  switch (recipe.action) {
    case "feeds.read":
      output = await readFeed(client, recipe, input);
      break;
    case "posts.read":
      output = await readNote(client, recipe, input);
      break;
    case "articles.read":
      output = await readArticle(client, recipe, input, false);
      break;
    case "comments.read":
      output = await readComments(client, recipe, input);
      break;
    case "media.read":
      output = await readArticle(client, recipe, input, true);
      break;
    case "messaging.list":
      output = await listMessages(client, recipe, input);
      break;
  }
  return {
    status: "succeeded",
    output,
    finalUrl,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
export {
  substackVideoUploadRecoveryTargetIdentifier,
  substackVideoUploadRecoveryStatusRequest,
  substackVideoUploadInitializationRequestForBinding,
  substackVideoUploadInitializationRequest,
  substackVideoTranscodeRequestForBinding,
  substackVideoTranscodeRequest,
  substackVideoStatusRequest,
  substackPersonalNoteDeleteRequest,
  substackNoteDeletionRecoveryTargetIdentifier,
  substackNoteDeletionRecoveryReadRequest,
  revalidateAndSnapshotSubstackVideoMultipartDispatch,
  readSubstackWebContentDeleteDesiredState,
  readSubstackWebAcceptedNoteTargetPresence,
  probeSubstackWebSubject,
  prepareSubstackVideoNotePublishInput,
  prepareSubstackPersonalNoteDeleteInput,
  planSubstackVideoMultipartParts,
  parseSubstackVideoUploadState,
  parseSubstackVideoUploadRecoveryTargetIdentifier,
  parseSubstackVideoMultipartEtags,
  parseSubstackVideoBinding,
  parseSubstackNoteDeletionRecoveryTargetIdentifier,
  materializeSubstackVideo,
  executeSubstackWebOperation,
  createSubstackVideoMultipartDispatchCheckpoint,
  classifySubstackVideoUploadState,
  assertSubstackNoteDeletionPreRead,
  SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES
};
