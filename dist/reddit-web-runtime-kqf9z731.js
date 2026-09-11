// @bun
import {
  REDDIT_FLAIR_OPERATION_NAMES,
  isRedditFlairOperation,
  parseRedditFlairChoicesResponse,
  parseRedditFlairInput,
  redditFlairContracts
} from "./index-6ctj5kfr.js";
import {
  createWebSessionClient,
  uploadPublicWebAsset,
  webSessionAuthSubject
} from "./index-wn3s7nnj.js";
import {
  failedProviderRead
} from "./index-4smh9n9x.js";
import"./index-j3ysa35f.js";
import"./index-aka7rgdj.js";
import"./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import {
  canonicalJson
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/providers/reddit-web-runtime.ts
import { createHash } from "crypto";
import { constants } from "fs";
import { open } from "fs/promises";

// src/providers/reddit-web.ts
var REDDIT_WEB_OPERATION_NAMES = Object.freeze([
  ...REDDIT_FLAIR_OPERATION_NAMES,
  "comments.create",
  "comments.read",
  "communities.membership.set",
  "content.delete",
  "content.edit",
  "content.save",
  "feeds.read",
  "media.publish",
  "media.read",
  "messaging.list",
  "messaging.read",
  "messaging.send",
  "posts.publish",
  "profiles.read",
  "posts.read",
  "posts.repost",
  "reactions.set",
  "relationships.follow.set",
  "replies.create"
]);
var observed = (effect, risk, reason) => Object.freeze({
  effect,
  risk,
  state: "observed",
  reason
});
var captureRequired = (effect, risk, reason) => Object.freeze({
  effect,
  risk,
  state: "capture-required",
  reason
});
var REDDIT_WEB_OPERATIONS = Object.freeze({
  ...Object.fromEntries(redditFlairContracts.map((contract) => [
    contract.operation,
    (contract.state === "observed" ? observed : captureRequired)(contract.risk === "R1" ? "read" : "write", contract.risk, contract.implementation)
  ])),
  "profiles.read": observed("read", "R1", "viewer-bound profile about JSON plus complete visible overview Listing pagination"),
  "feeds.read": observed("read", "R1", "signed-in home Listing JSON with explicit raw_json and bounded pagination"),
  "posts.read": observed("read", "R1", "target-bound comments Listing JSON root projection"),
  "comments.read": observed("read", "R1", "target-bound comments Listing JSON tree projection"),
  "messaging.list": observed("read", "R1", "legacy inbox, unread, and sent Listing JSON with mark=false"),
  "messaging.read": observed("read", "R1", "legacy message Listing JSON filtered by exact mid with mark=false"),
  "reactions.set": captureRequired("write", "R2", "the exact /api/vote desired-state implementation has deterministic readback tests, but still requires an authorized low-stakes live fixture"),
  "content.save": captureRequired("write", "R2", "the exact /api/save and /api/unsave desired-state implementation has deterministic readback tests, but still requires an authorized low-stakes live fixture"),
  "communities.membership.set": captureRequired("write", "R2", "subscribe and unsubscribe form variants and subreddit identity readback need a reviewed fixture"),
  "relationships.follow.set": captureRequired("write", "R2", "user and post-follow relationships are distinct contracts and need reviewed fixtures"),
  "media.read": observed("read", "R1", "current-account-bound exact /api/info hosted-video readback with a closed metadata-only projection that omits playback URLs"),
  "media.publish": observed("write", "R3", "captured old-Reddit cookie-authenticated leases, exact S3 transfers, explicit declarations, response websocket target binding, and independent hosted-video readback"),
  "content.delete": observed("write", "R3", "exact authored-post pre-read, /api/del dispatch, and independent exact-target absence readback"),
  "comments.create": captureRequired("write", "R3", "comment publication needs an authorized fixture and exact actor/root response binding"),
  "replies.create": captureRequired("write", "R3", "comment or legacy-message reply needs an authorized fixture and exact parent binding"),
  "content.edit": captureRequired("write", "R3", "edit response and independent authored-content readback need an authorized fixture"),
  "messaging.send": captureRequired("write", "R3", "legacy compose and Reddit Chat are separate transports; neither may be inferred from the other"),
  "posts.publish": captureRequired("write", "R3", "self/link submission variants and audience fields need an authorized fixture"),
  "posts.repost": captureRequired("write", "R3", "crosspost submission needs exact source, destination, response, and readback binding")
});
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactObjectKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.has(key)))
    throw new Error(`${label} changed its reviewed fields`);
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
function finiteNumber(value, label) {
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}
function safeInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function nullableBoolean(value, label) {
  if (value === null || value === undefined)
    return null;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean or null`);
  return value;
}
function boolean(value, label) {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
function redditFullname(value, label, allowedKinds = [
  "t1",
  "t2",
  "t3",
  "t4",
  "t5",
  "t6"
]) {
  const result = boundedString(value, label, 40);
  const match = /^(t[1-6])_([a-z0-9]{1,32})$/u.exec(result);
  if (match === null || !allowedKinds.includes(match[1])) {
    throw new Error(`${label} must be a reviewed Reddit fullname`);
  }
  return result;
}
function redditPostId(value, label = "Reddit post ID") {
  return redditFullname(value, label, ["t3"]);
}
function redditBarePostId(value, label = "Reddit post ID") {
  return redditPostId(value, label).slice(3);
}
function redditCommunity(value, label = "Reddit community") {
  const community = boundedString(value, label, 21);
  if (!/^[A-Za-z0-9_]{2,21}$/u.test(community)) {
    throw new Error(`${label} must be an exact subreddit name`);
  }
  return community;
}
function exactUrl(value, label, expectedOrigin = "https://www.reddit.com") {
  let url;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.origin !== expectedOrigin || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error(`${label} must use the exact ${expectedOrigin} origin`);
  return url;
}
function exactRedditUploadUrl(value, hostname, label) {
  const text = boundedString(value, label, 4096);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.hostname !== hostname || url.port !== "" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || !/^\/[A-Za-z0-9][A-Za-z0-9/_.-]{0,2047}$/u.test(url.pathname) || url.pathname.includes(".."))
    throw new Error(`${label} escaped its exact reviewed Reddit upload host`);
  return url;
}
function exactParameters(value, label) {
  const result = new Map;
  for (const [name, item] of value) {
    if (result.has(name))
      throw new Error(`${label} repeated ${name}`);
    if (name.length < 1 || name.length > 64 || /[\0\r\n]/u.test(name + item)) {
      throw new Error(`${label} contained an invalid parameter`);
    }
    result.set(name, item);
  }
  return result;
}
function exactNames(values, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((name) => !values.has(name));
  const extra = [...values.keys()].filter((name) => !allowed.has(name));
  if (missing.length > 0)
    throw new Error(`${label} omitted ${missing.join(", ")}`);
  if (extra.length > 0)
    throw new Error(`${label} contained unsupported ${extra.join(", ")}`);
}
function decimalParameter(values, name, minimum, maximum, label) {
  const value = values.get(name);
  if (value === undefined || !/^(?:0|[1-9][0-9]{0,15})$/u.test(value)) {
    throw new Error(`${label}.${name} must be a decimal integer`);
  }
  return safeInteger(Number(value), `${label}.${name}`, minimum, maximum);
}
function optionalAfter(values, label) {
  const after = values.get("after");
  if (after !== undefined)
    redditFullname(after, `${label}.after`, ["t1", "t3", "t4"]);
}
function requireFixed(values, name, expected, label) {
  if (values.get(name) !== expected)
    throw new Error(`${label}.${name} changed its reviewed value`);
}
function authorizeRedditWebRequest(input) {
  const url = exactUrl(input.url, "Reddit request URL", input.operation === "media.lease" || input.operation.startsWith("flair.") ? "https://old.reddit.com" : "https://www.reddit.com");
  const method = input.method.toUpperCase();
  const query = exactParameters(url.searchParams, "Reddit request query");
  let form = new Map;
  if (input.body !== undefined) {
    if (method !== "POST")
      throw new Error("Reddit request body requires POST");
    form = new Map(exactParameters(new URLSearchParams(input.body), "Reddit request form"));
  }
  if (method !== "GET" && method !== "POST")
    throw new Error("Reddit request method is not reviewed");
  const finish = () => Object.freeze({
    operation: input.operation,
    method,
    path: url.pathname,
    queryNames: Object.freeze([...query.keys()].sort()),
    formNames: Object.freeze([...form.keys()].sort())
  });
  if (input.operation === "viewer.current") {
    if (method !== "GET" || url.pathname !== "/api/me.json" || query.size !== 0 || form.size !== 0) {
      throw new Error("Reddit viewer request changed its reviewed exchange");
    }
    return finish();
  }
  if (input.operation === "profiles.about" || input.operation === "profiles.overview") {
    if (method !== "GET" || form.size !== 0 || input.profile === undefined) {
      throw new Error("Reddit profile request changed its reviewed exchange");
    }
    const profile = boundedString(input.profile, "Reddit profile handle", 64);
    if (!/^[A-Za-z0-9_-]{1,64}$/u.test(profile)) {
      throw new Error("Reddit profile handle is invalid");
    }
    const expectedPath = input.operation === "profiles.about" ? `/user/${encodeURIComponent(profile)}/about.json` : `/user/${encodeURIComponent(profile)}/overview.json`;
    if (url.pathname !== expectedPath) {
      throw new Error("Reddit profile path did not bind the requested handle");
    }
    if (input.operation === "profiles.about") {
      exactNames(query, ["raw_json"], [], "Reddit profile about query");
    } else {
      exactNames(query, ["limit", "raw_json"], ["after"], "Reddit profile overview query");
      requireFixed(query, "limit", "100", "Reddit profile overview query");
      optionalAfter(query, "Reddit profile overview query");
    }
    requireFixed(query, "raw_json", "1", "Reddit profile query");
    return finish();
  }
  if (input.operation === "feeds.home") {
    if (method !== "GET" || url.pathname !== "/.json" || form.size !== 0) {
      throw new Error("Reddit home feed request changed its reviewed exchange");
    }
    exactNames(query, ["limit", "raw_json"], ["after"], "Reddit home feed query");
    decimalParameter(query, "limit", 1, 100, "Reddit home feed query");
    requireFixed(query, "raw_json", "1", "Reddit home feed query");
    optionalAfter(query, "Reddit home feed query");
    return finish();
  }
  if (input.operation === "posts.read" || input.operation === "comments.read") {
    if (method !== "GET" || form.size !== 0 || input.targetId === undefined) {
      throw new Error("Reddit comments-page request changed its reviewed exchange");
    }
    const bare = redditBarePostId(input.targetId, "Reddit request target");
    if (url.pathname !== `/comments/${bare}.json`) {
      throw new Error("Reddit comments-page path did not bind the requested post");
    }
    if (input.operation === "posts.read") {
      exactNames(query, ["limit", "raw_json"], [], "Reddit post query");
      requireFixed(query, "limit", "1", "Reddit post query");
    } else {
      exactNames(query, ["depth", "limit", "raw_json", "sort"], [], "Reddit comments query");
      decimalParameter(query, "limit", 1, 100, "Reddit comments query");
      requireFixed(query, "depth", "10", "Reddit comments query");
      requireFixed(query, "sort", "confidence", "Reddit comments query");
    }
    requireFixed(query, "raw_json", "1", "Reddit comments-page query");
    return finish();
  }
  if (input.operation === "messages.list" || input.operation === "messages.read") {
    if (method !== "GET" || form.size !== 0 || input.folder === undefined) {
      throw new Error("Reddit message request changed its reviewed exchange");
    }
    if (url.pathname !== `/message/${input.folder}.json`) {
      throw new Error("Reddit message path did not bind the requested folder");
    }
    if (input.operation === "messages.list") {
      exactNames(query, ["limit", "mark", "max_replies", "raw_json"], ["after"], "Reddit message-list query");
      decimalParameter(query, "limit", 1, 100, "Reddit message-list query");
      requireFixed(query, "max_replies", "0", "Reddit message-list query");
      optionalAfter(query, "Reddit message-list query");
    } else {
      exactNames(query, ["limit", "mark", "max_replies", "mid", "raw_json"], [], "Reddit message-read query");
      requireFixed(query, "limit", "1", "Reddit message-read query");
      requireFixed(query, "max_replies", "100", "Reddit message-read query");
      const target = redditFullname(input.targetId, "Reddit requested message", ["t4"]);
      if (query.get("mid") !== target) {
        throw new Error("Reddit message query did not bind the requested message");
      }
    }
    requireFixed(query, "mark", "false", "Reddit message query");
    requireFixed(query, "raw_json", "1", "Reddit message query");
    return finish();
  }
  if (input.operation === "state.readback" || input.operation === "media.read") {
    if (method !== "GET" || url.pathname !== "/api/info.json" || form.size !== 0) {
      throw new Error(`Reddit ${input.operation} changed its reviewed exchange`);
    }
    exactNames(query, ["id", "raw_json"], [], `Reddit ${input.operation} query`);
    const target = redditFullname(input.targetId, `Reddit ${input.operation} target`, input.operation === "media.read" ? ["t3"] : ["t1", "t3"]);
    if (query.get("id") !== target) {
      throw new Error(`Reddit ${input.operation} query did not bind its target`);
    }
    requireFixed(query, "raw_json", "1", `Reddit ${input.operation} query`);
    return finish();
  }
  if (input.operation === "flair.user.choices" || input.operation === "flair.post.choices") {
    if (method !== "POST" || url.pathname !== "/api/flairselector" || input.community === undefined)
      throw new Error("Reddit flair choices request changed its reviewed exchange");
    exactNames(query, [], [], "Reddit flair choices query");
    const community = redditCommunity(input.community, "Reddit flair community");
    const commonFields = ["r", "uh"];
    exactNames(form, input.operation === "flair.user.choices" ? [...commonFields, "name"] : [...commonFields, "is_newlink"], [], "Reddit flair choices form");
    requireFixed(form, "r", community, "Reddit flair choices form");
    boundedString(form.get("uh"), "Reddit flair choices modhash", 256);
    if (input.operation === "flair.user.choices") {
      const username = boundedString(input.username, "Reddit flair username", 64);
      if (!/^[A-Za-z0-9_-]{1,64}$/u.test(username)) {
        throw new Error("Reddit flair username is invalid");
      }
      requireFixed(form, "name", username, "Reddit flair choices form");
    } else {
      requireFixed(form, "is_newlink", "true", "Reddit flair choices form");
    }
    return finish();
  }
  if (input.operation === "media.lease") {
    if (method !== "POST" || input.mediaType === undefined || input.filename === undefined)
      throw new Error("Reddit media lease request changed its reviewed exchange");
    const expectedPath = input.mediaType === "video/mp4" ? "/api/video_upload_s3.json" : "/api/image_upload_s3.json";
    if (url.pathname !== expectedPath || query.size !== 0) {
      throw new Error("Reddit media lease request changed its reviewed exchange");
    }
    exactNames(form, ["filepath", "mimetype", "raw_json"], [], "Reddit media lease form");
    requireFixed(form, "filepath", input.filename, "Reddit media lease form");
    requireFixed(form, "mimetype", input.mediaType, "Reddit media lease form");
    requireFixed(form, "raw_json", "1", "Reddit media lease form");
    return finish();
  }
  if (input.operation === "media.publish") {
    if (method !== "POST" || url.pathname !== "/api/submit" || input.community === undefined || input.title === undefined || typeof input.nsfw !== "boolean" || typeof input.spoiler !== "boolean" || typeof input.sendReplies !== "boolean" || input.mediaUrl === undefined || input.posterUrl === undefined)
      throw new Error("Reddit video submit request changed its reviewed exchange");
    exactNames(query, ["raw_json"], [], "Reddit video submit query");
    requireFixed(query, "raw_json", "1", "Reddit video submit query");
    exactNames(form, [
      "api_type",
      "kind",
      "nsfw",
      "resubmit",
      "sendreplies",
      "spoiler",
      "sr",
      "title",
      "uh",
      "url",
      "validate_on_submit",
      "video_poster_url"
    ], input.text === undefined ? [] : ["text"], "Reddit video submit form");
    requireFixed(form, "api_type", "json", "Reddit video submit form");
    requireFixed(form, "kind", "video", "Reddit video submit form");
    requireFixed(form, "nsfw", String(input.nsfw), "Reddit video submit form");
    requireFixed(form, "resubmit", "false", "Reddit video submit form");
    requireFixed(form, "sendreplies", String(input.sendReplies), "Reddit video submit form");
    requireFixed(form, "spoiler", String(input.spoiler), "Reddit video submit form");
    requireFixed(form, "sr", redditCommunity(input.community), "Reddit video submit form");
    requireFixed(form, "title", boundedString(input.title, "Reddit video title", 280), "Reddit video submit form");
    if (input.text !== undefined) {
      requireFixed(form, "text", boundedString(input.text, "Reddit video body", 1e4), "Reddit video submit form");
    }
    const mediaUrl = exactRedditUploadUrl(input.mediaUrl, "reddit-uploaded-video.s3-accelerate.amazonaws.com", "Reddit uploaded video URL");
    const posterUrl = exactRedditUploadUrl(input.posterUrl, "reddit-uploaded-media.s3-accelerate.amazonaws.com", "Reddit uploaded poster URL");
    requireFixed(form, "url", mediaUrl.href, "Reddit video submit form");
    requireFixed(form, "video_poster_url", posterUrl.href, "Reddit video submit form");
    requireFixed(form, "validate_on_submit", "true", "Reddit video submit form");
    boundedString(form.get("uh"), "Reddit video submit modhash", 256);
    return finish();
  }
  if (input.operation === "content.delete") {
    if (method !== "POST" || url.pathname !== "/api/del" || query.size !== 0) {
      throw new Error("Reddit delete request changed its reviewed exchange");
    }
    exactNames(form, ["id", "uh"], [], "Reddit delete form");
    const target = redditPostId(input.targetId, "Reddit delete target");
    if (form.get("id") !== target)
      throw new Error("Reddit delete form did not bind its target");
    boundedString(form.get("uh"), "Reddit delete modhash", 256);
    return finish();
  }
  if (input.operation === "reactions.set") {
    if (method !== "POST" || url.pathname !== "/api/vote" || query.size !== 0) {
      throw new Error("Reddit vote request changed its reviewed exchange");
    }
    exactNames(form, ["dir", "id", "uh"], [], "Reddit vote form");
    const target = redditFullname(input.targetId, "Reddit vote target", ["t1", "t3"]);
    if (form.get("id") !== target)
      throw new Error("Reddit vote form did not bind its target");
    if (input.direction !== -1 && input.direction !== 0 && input.direction !== 1) {
      throw new Error("Reddit vote direction is not reviewed");
    }
    if (form.get("dir") !== String(input.direction)) {
      throw new Error("Reddit vote form did not bind the desired direction");
    }
  } else if (input.operation === "content.save") {
    if (method !== "POST" || url.pathname !== "/api/save" && url.pathname !== "/api/unsave" || query.size !== 0 || typeof input.saved !== "boolean")
      throw new Error("Reddit save request changed its reviewed exchange");
    exactNames(form, ["id", "uh"], [], "Reddit save form");
    const target = redditFullname(input.targetId, "Reddit save target", ["t1", "t3"]);
    if (form.get("id") !== target)
      throw new Error("Reddit save form did not bind its target");
    if (url.pathname !== (input.saved ? "/api/save" : "/api/unsave")) {
      throw new Error("Reddit save path did not bind the desired state");
    }
  } else
    throw new Error("Reddit request operation is not reviewed");
  boundedString(form.get("uh"), "Reddit request modhash", 256);
  return finish();
}
function parseRedditWebViewerResponse(value) {
  const root = record(value, "Reddit viewer response");
  if (root.kind !== "t2")
    throw new Error("Reddit viewer response did not contain an account thing");
  const data = record(root.data, "Reddit viewer response.data");
  const rawId = boundedString(data.id, "Reddit viewer account ID", 32);
  if (!/^[a-z0-9]{1,32}$/u.test(rawId))
    throw new Error("Reddit viewer account ID must be base36");
  const username = boundedString(data.name, "Reddit viewer username", 64);
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(username))
    throw new Error("Reddit viewer username is invalid");
  const modhash = boundedString(data.modhash, "Reddit viewer modhash", 256);
  return Object.freeze({ id: `t2_${rawId}`, username, modhash });
}
var redditLeaseFieldNames = Object.freeze([
  "x-amz-algorithm",
  "x-amz-security-token",
  "x-amz-storage-class",
  "success_action_status",
  "bucket",
  "acl",
  "key",
  "x-amz-signature",
  "x-amz-date",
  "x-amz-meta-ext",
  "policy",
  "x-amz-credential",
  "Content-Type"
]);
function checkedRedditWebSocketUrl(value, label) {
  const text = boundedString(value, label, 8192);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an absolute WSS URL`);
  }
  const query = exactParameters(url.searchParams, `${label} query`);
  if (url.protocol !== "wss:" || url.username !== "" || url.password !== "" || url.hash !== "" || !/^(?:[a-z0-9-]{1,64}\.)?wss\.redditmedia\.com$/u.test(url.hostname) || !/^\/[A-Za-z0-9/_-]{1,2048}$/u.test(url.pathname) || url.pathname.includes("..") || query.size !== 1 || !query.has("m") || !/^[A-Za-z0-9_-]{20,2048}$/u.test(query.get("m") ?? ""))
    throw new Error(`${label} escaped the reviewed Reddit websocket family`);
  return url;
}
function parseRedditMediaLeaseResponse(value, expected) {
  const expectedHostname = expected.mediaType === "video/mp4" ? "reddit-uploaded-video.s3-accelerate.amazonaws.com" : "reddit-uploaded-media.s3-accelerate.amazonaws.com";
  const filename = boundedString(expected.filename, "Reddit lease filename", 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u.test(filename)) {
    throw new Error("Reddit lease filename is not a safe fixed name");
  }
  const root = record(value, "Reddit media lease response");
  exactObjectKeys(root, ["action", "fields"], [], "Reddit media lease response");
  if (root.action !== `//${expectedHostname}`) {
    throw new Error("Reddit media lease changed its exact upload host");
  }
  if (!Array.isArray(root.fields) || root.fields.length !== redditLeaseFieldNames.length) {
    throw new Error("Reddit media lease changed its upload field count");
  }
  const allowedNames = new Set(redditLeaseFieldNames);
  const seenNames = new Set;
  const fields = [];
  let totalValueBytes = 0;
  for (const [index, rawField] of root.fields.entries()) {
    const field = record(rawField, `Reddit media lease field ${index}`);
    exactObjectKeys(field, ["name", "value"], [], `Reddit media lease field ${index}`);
    const fieldName = boundedString(field.name, `Reddit media lease field ${index} name`, 64);
    if (!allowedNames.has(fieldName) || seenNames.has(fieldName)) {
      throw new Error("Reddit media lease changed its exact upload field set");
    }
    seenNames.add(fieldName);
    const fieldValue = boundedString(field.value, `Reddit media lease field ${fieldName}`, 65536);
    if (/\n/u.test(fieldValue))
      throw new Error("Reddit media lease field contained a line break");
    totalValueBytes += new TextEncoder().encode(fieldValue).byteLength;
    if (totalValueBytes > 160 * 1024)
      throw new Error("Reddit media lease fields exceeded their reviewed bound");
    fields.push(Object.freeze({ name: fieldName, value: fieldValue }));
  }
  const byName = new Map(fields.map((field) => [field.name, field.value]));
  const extension = expected.mediaType === "video/mp4" ? "mp4" : expected.mediaType === "image/png" ? "png" : "jpg";
  const bucket = expected.mediaType === "video/mp4" ? "reddit-uploaded-video" : "reddit-uploaded-media";
  if (byName.get("acl") !== "private" || byName.get("x-amz-algorithm") !== "AWS4-HMAC-SHA256" || byName.get("success_action_status") !== "201" || byName.get("bucket") !== bucket || byName.get("Content-Type") !== expected.mediaType || byName.get("x-amz-storage-class") !== "STANDARD" || byName.get("x-amz-meta-ext") !== extension)
    throw new Error("Reddit media lease changed a fixed upload declaration");
  const key = boundedString(byName.get("key"), "Reddit media lease key", 2048);
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,2047}$/u.test(key) || key.includes("..")) {
    throw new Error("Reddit media lease key escaped its reviewed path shape");
  }
  return Object.freeze({
    uploadOrigin: `https://${expectedHostname}`,
    fields: Object.freeze(fields),
    key
  });
}
function redditMediaAssetUrl(lease) {
  const origin = lease.uploadOrigin === "https://reddit-uploaded-video.s3-accelerate.amazonaws.com" ? lease.uploadOrigin : lease.uploadOrigin === "https://reddit-uploaded-media.s3-accelerate.amazonaws.com" ? lease.uploadOrigin : (() => {
    throw new Error("Reddit media lease upload origin is not reviewed");
  })();
  return new URL(`/${lease.key}`, origin).href;
}
function parseRedditVideoSubmitResponse(value) {
  const root = record(value, "Reddit video submit response");
  exactObjectKeys(root, ["json"], [], "Reddit video submit response");
  const json = record(root.json, "Reddit video submit response.json");
  exactObjectKeys(json, ["data", "errors"], [], "Reddit video submit response.json");
  if (!Array.isArray(json.errors) || json.errors.length !== 0) {
    throw new Error("Reddit video submit response contained provider errors");
  }
  const data = record(json.data, "Reddit video submit response.json.data");
  exactObjectKeys(data, ["websocket_url"], ["user_submitted_page"], "Reddit video submit response.json.data");
  if (data.user_submitted_page !== undefined) {
    const page = exactUrl(boundedString(data.user_submitted_page, "Reddit submitted-page URL", 2048), "Reddit submitted-page URL");
    if (!/^\/user\/[A-Za-z0-9_-]{1,64}\/submitted\/$/u.test(page.pathname) || page.search !== "") {
      throw new Error("Reddit submitted-page URL changed shape");
    }
  }
  return checkedRedditWebSocketUrl(data.websocket_url, "Reddit video submit websocket URL").href;
}
function parseRedditVideoWebSocketMessage(value, expectedCommunity) {
  let parsed = value;
  if (typeof value === "string") {
    if (new TextEncoder().encode(value).byteLength > 64 * 1024) {
      throw new Error("Reddit video websocket message exceeded its reviewed bound");
    }
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Reddit video websocket returned malformed JSON");
    }
  }
  const root = record(parsed, "Reddit video websocket message");
  exactObjectKeys(root, ["payload"], ["type"], "Reddit video websocket message");
  if (root.type !== undefined && root.type !== "success") {
    throw new Error("Reddit video processing did not succeed");
  }
  const payload = record(root.payload, "Reddit video websocket message.payload");
  exactObjectKeys(payload, ["redirect"], [], "Reddit video websocket message.payload");
  const redirectText = boundedString(payload.redirect, "Reddit video redirect", 2048);
  let redirect;
  try {
    redirect = new URL(redirectText);
  } catch {
    throw new Error("Reddit video redirect must be an absolute URL");
  }
  const community = redditCommunity(expectedCommunity);
  const match = /^\/r\/([^/]+)\/comments\/([a-z0-9]{1,32})\/[^/?#]+\/$/u.exec(redirect.pathname);
  if (redirect.protocol !== "https:" || redirect.hostname !== "www.reddit.com" && redirect.hostname !== "reddit.com" || redirect.username !== "" || redirect.password !== "" || redirect.port !== "" || redirect.search !== "" || redirect.hash !== "" || match === null || match[1]?.toLowerCase() !== community.toLowerCase())
    throw new Error("Reddit video redirect escaped its confirmed community");
  const postId = redditPostId(`t3_${match[2]}`, "Reddit video redirect post ID");
  return Object.freeze({
    postId,
    url: `https://www.reddit.com${redirect.pathname}`
  });
}
function parseRedditWebProfileResponse(value, expectedUsername) {
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(expectedUsername)) {
    throw new Error("Expected Reddit profile handle is invalid");
  }
  const root = record(value, "Reddit profile response");
  if (root.kind !== "t2")
    throw new Error("Reddit profile response did not contain an account thing");
  const data = record(root.data, "Reddit profile response.data");
  const username = boundedString(data.name, "Reddit profile response.data.name", 64);
  if (username.toLocaleLowerCase("en-US") !== expectedUsername.toLocaleLowerCase("en-US")) {
    throw new Error("Reddit profile response did not bind the requested handle");
  }
  const subreddit = record(data.subreddit, "Reddit profile response.data.subreddit");
  const prefixedName = optionalString(subreddit.display_name_prefixed, "Reddit profile response.data.subreddit.display_name_prefixed", 66);
  if (prefixedName !== null && prefixedName.toLocaleLowerCase("en-US") !== `u/${username}`.toLocaleLowerCase("en-US"))
    throw new Error("Reddit profile subreddit did not bind the requested handle");
  return Object.freeze({
    username,
    displayName: optionalString(subreddit.title, "Reddit profile response.data.subreddit.title", 256),
    bio: optionalString(subreddit.public_description, "Reddit profile response.data.subreddit.public_description", 4096),
    followers: safeInteger(subreddit.subscribers, "Reddit profile response.data.subreddit.subscribers", 0, Number.MAX_SAFE_INTEGER),
    karma: safeInteger(data.total_karma, "Reddit profile response.data.total_karma", 0, Number.MAX_SAFE_INTEGER)
  });
}
function listing(value, label, maximumChildren) {
  const root = record(value, label);
  if (root.kind !== "Listing")
    throw new Error(`${label}.kind must be Listing`);
  const data = record(root.data, `${label}.data`);
  if (!Array.isArray(data.children) || data.children.length > maximumChildren) {
    throw new Error(`${label}.data.children exceeded its reviewed bound`);
  }
  const children = data.children.map((child, index) => record(child, `${label}.data.children[${index}]`));
  const after = optionalString(data.after, `${label}.data.after`, 64);
  const before = optionalString(data.before, `${label}.data.before`, 64);
  if (after !== null)
    redditFullname(after, `${label}.data.after`, ["t1", "t3", "t4"]);
  if (before !== null)
    redditFullname(before, `${label}.data.before`, ["t1", "t3", "t4"]);
  return Object.freeze({
    children: Object.freeze(children),
    after,
    before
  });
}
function parseRedditProfileContributionPage(value, expectedUsername) {
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(expectedUsername)) {
    throw new Error("Expected Reddit profile handle is invalid");
  }
  const page = listing(value, "Reddit profile overview response", 100);
  const ids = page.children.map((child, index) => {
    const label = `Reddit profile overview response.data.children[${index}]`;
    if (child.kind !== "t1" && child.kind !== "t3") {
      throw new Error(`${label}.kind must be t1 or t3`);
    }
    const data = record(child.data, `${label}.data`);
    const id = redditFullname(data.name, `${label}.data.name`, [child.kind]);
    const author = boundedString(data.author, `${label}.data.author`, 64);
    if (author.toLocaleLowerCase("en-US") !== expectedUsername.toLocaleLowerCase("en-US")) {
      throw new Error("Reddit profile overview response contained another author");
    }
    return id;
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error("Reddit profile overview response repeated a contribution");
  }
  if (page.after !== null)
    redditFullname(page.after, "Reddit profile overview response.data.after", ["t1", "t3"]);
  return Object.freeze({ ids: Object.freeze(ids), after: page.after });
}
function thingData(value, expectedKind, label) {
  if (value.kind !== expectedKind)
    throw new Error(`${label}.kind must be ${expectedKind}`);
  return record(value.data, `${label}.data`);
}
function safeExternalUrl(value, label) {
  if (value === undefined || value === null || value === "")
    return null;
  const text = boundedString(value, label, 4096);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an absolute HTTP URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:" || url.username !== "" || url.password !== "")
    throw new Error(`${label} must be an absolute HTTP URL without credentials`);
  return url.href;
}
function permalink(value, label) {
  const path = boundedString(value, label, 2048);
  if (!path.startsWith("/") || path.startsWith("//") || /[?#]/u.test(path)) {
    throw new Error(`${label} must be a Reddit path`);
  }
  return `https://www.reddit.com${path}`;
}
function projectedPost(value, label) {
  const data = thingData(value, "t3", label);
  const id = redditFullname(data.name, `${label}.data.name`, ["t3"]);
  const commentCount = safeInteger(data.num_comments, `${label}.data.num_comments`, 0, Number.MAX_SAFE_INTEGER);
  return Object.freeze({
    id,
    title: boundedString(data.title, `${label}.data.title`, 1000, true),
    body: boundedString(data.selftext ?? "", `${label}.data.selftext`, 1e5, true),
    author: optionalString(data.author, `${label}.data.author`, 64),
    subreddit: boundedString(data.subreddit, `${label}.data.subreddit`, 64),
    createdUtc: finiteNumber(data.created_utc, `${label}.data.created_utc`),
    score: finiteNumber(data.score, `${label}.data.score`),
    commentCount,
    liked: nullableBoolean(data.likes, `${label}.data.likes`),
    saved: boolean(data.saved, `${label}.data.saved`),
    externalUrl: safeExternalUrl(data.url, `${label}.data.url`),
    permalink: permalink(data.permalink, `${label}.data.permalink`)
  });
}
function parseRedditAuthoredPostPresence(value, expectedPostId) {
  const target = redditPostId(expectedPostId);
  const page = listing(value, "Reddit authored-post presence Listing", 1);
  if (page.children.length === 0) {
    return Object.freeze({ present: false, post: null, authorFullname: null });
  }
  if (page.children.length !== 1) {
    throw new Error("Reddit authored-post presence returned multiple targets");
  }
  const thing = page.children[0];
  const data = thingData(thing, "t3", "Reddit authored-post presence");
  const id = redditPostId(data.name, "Reddit authored-post presence ID");
  if (id !== target)
    throw new Error("Reddit authored-post presence changed its exact target");
  const rawAuthor = data.author;
  if (rawAuthor === undefined || rawAuthor === null || rawAuthor === "[deleted]") {
    return Object.freeze({ present: false, post: null, authorFullname: null });
  }
  const post = projectedPost(thing, "Reddit authored-post presence");
  const authorFullname = data.author_fullname === undefined || data.author_fullname === null ? null : redditFullname(data.author_fullname, "Reddit authored-post presence author fullname", ["t2"]);
  return Object.freeze({ present: true, post, authorFullname });
}
function exactRedditVideoUrl(value, label) {
  const text = boundedString(value, label, 4096);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:" || url.hostname !== "v.redd.it" || url.username !== "" || url.password !== "" || url.port !== "" || url.hash !== "" || !/^\/[A-Za-z0-9_-]{1,128}(?:\/[A-Za-z0-9_.-]{1,128})?$/u.test(url.pathname))
    throw new Error(`${label} escaped the exact Reddit video host`);
  return url;
}
function parseRedditVideoPostPresence(value, expectedPostId) {
  const target = redditPostId(expectedPostId);
  const page = listing(value, "Reddit video-post presence Listing", 1);
  if (page.children.length === 0)
    return null;
  if (page.children.length !== 1) {
    throw new Error("Reddit video-post presence returned multiple targets");
  }
  const thing = page.children[0];
  const data = thingData(thing, "t3", "Reddit video-post presence");
  if (redditPostId(data.name, "Reddit video-post presence ID") !== target) {
    throw new Error("Reddit video-post presence changed its exact target");
  }
  if (data.is_video !== true || data.post_hint !== "hosted:video" || data.domain !== "v.redd.it") {
    throw new Error("Reddit video-post readback did not contain one hosted video");
  }
  const post = projectedPost(thing, "Reddit video-post presence");
  const videoUrl = exactRedditVideoUrl(data.url, "Reddit video-post URL");
  if (videoUrl.search !== "")
    throw new Error("Reddit video-post URL changed shape");
  const media = record(data.media, "Reddit video-post media");
  const video = record(media.reddit_video, "Reddit video-post media.reddit_video");
  if (video.is_gif !== false || video.transcoding_status !== "completed") {
    throw new Error("Reddit video-post processing did not complete as a normal video");
  }
  const durationSeconds = safeInteger(video.duration, "Reddit video-post duration", 1, 3600);
  const width = safeInteger(video.width, "Reddit video-post width", 1, 16384);
  const height = safeInteger(video.height, "Reddit video-post height", 1, 16384);
  const nsfw = boolean(data.over_18, "Reddit video-post NSFW declaration");
  const spoiler = boolean(data.spoiler, "Reddit video-post spoiler declaration");
  const fallbackUrl = exactRedditVideoUrl(video.fallback_url, "Reddit video-post fallback URL");
  const rootSegment = videoUrl.pathname.split("/")[1];
  if (fallbackUrl.pathname.split("/")[1] !== rootSegment) {
    throw new Error("Reddit video-post fallback URL changed the video identity");
  }
  const authorFullname = data.author_fullname === undefined || data.author_fullname === null ? null : redditFullname(data.author_fullname, "Reddit video-post author fullname", ["t2"]);
  return Object.freeze({
    post,
    authorFullname,
    videoUrl: videoUrl.href,
    fallbackUrl: fallbackUrl.href,
    durationSeconds,
    width,
    height,
    nsfw,
    spoiler
  });
}
function projectRedditHostedVideoMetadata(value, expectedPostId) {
  const readback = parseRedditVideoPostPresence(value, expectedPostId);
  if (readback === null) {
    throw new Error("Reddit media.read did not return the exact hosted-video post");
  }
  return Object.freeze({
    provider: "reddit",
    operation: "media.read",
    post: Object.freeze({
      id: readback.post.id,
      title: readback.post.title,
      author: readback.post.author,
      subreddit: readback.post.subreddit,
      createdUtc: readback.post.createdUtc,
      permalink: readback.post.permalink
    }),
    media: Object.freeze({
      kind: "hosted-video",
      mediaType: "video/mp4",
      durationSeconds: readback.durationSeconds,
      width: readback.width,
      height: readback.height,
      nsfw: readback.nsfw,
      spoiler: readback.spoiler,
      transcodingStatus: "completed"
    })
  });
}
function normalizeRedditFeedResponse(value, limit) {
  safeInteger(limit, "Reddit feed limit", 1, 100);
  const page = listing(value, "Reddit feed", limit);
  const posts = page.children.map((child, index) => projectedPost(child, `Reddit feed child ${index}`));
  return Object.freeze({
    posts: Object.freeze(posts),
    after: page.after,
    before: page.before
  });
}
function commentsPage(value, expectedPostId) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("Reddit comments response must contain exact post and comment Listings");
  }
  const posts = listing(value[0], "Reddit comments post Listing", 1);
  if (posts.children.length !== 1)
    throw new Error("Reddit comments response omitted its root post");
  const post = projectedPost(posts.children[0], "Reddit comments root");
  if (post.id !== expectedPostId) {
    throw new Error("Reddit comments response did not bind the requested post");
  }
  return {
    post,
    comments: listing(value[1], "Reddit comments Listing", 500)
  };
}
function normalizeRedditPostResponse(value, expectedPostId) {
  const target = redditPostId(expectedPostId);
  return Object.freeze({ post: commentsPage(value, target).post });
}
function projectedComment(value, expectedPostId, label) {
  const data = thingData(value, "t1", label);
  const postId = redditFullname(data.link_id, `${label}.data.link_id`, ["t3"]);
  if (postId !== expectedPostId)
    throw new Error("Reddit comment did not bind the requested post");
  return Object.freeze({
    id: redditFullname(data.name, `${label}.data.name`, ["t1"]),
    postId,
    parentId: redditFullname(data.parent_id, `${label}.data.parent_id`, ["t1", "t3"]),
    author: optionalString(data.author, `${label}.data.author`, 64),
    body: boundedString(data.body ?? "", `${label}.data.body`, 1e5, true),
    createdUtc: finiteNumber(data.created_utc, `${label}.data.created_utc`),
    score: finiteNumber(data.score, `${label}.data.score`),
    depth: data.depth === undefined || data.depth === null ? null : safeInteger(data.depth, `${label}.data.depth`, 0, 100),
    liked: nullableBoolean(data.likes, `${label}.data.likes`),
    saved: boolean(data.saved ?? false, `${label}.data.saved`),
    permalink: permalink(data.permalink, `${label}.data.permalink`)
  });
}
function normalizeRedditCommentsResponse(value, expectedPostId, limit) {
  const target = redditPostId(expectedPostId);
  safeInteger(limit, "Reddit comment limit", 1, 100);
  const page = commentsPage(value, target);
  const projected = [];
  let visited = 0;
  let hasMore = false;
  const visit = (children) => {
    for (const child of children) {
      visited += 1;
      if (visited > 500)
        throw new Error("Reddit comment tree exceeded its reviewed node bound");
      if (child.kind === "more") {
        hasMore = true;
        continue;
      }
      const comment = projectedComment(child, target, `Reddit comment ${visited}`);
      if (projected.length < limit)
        projected.push(comment);
      const data = record(child.data, `Reddit comment ${visited}.data`);
      if (data.replies === "" || data.replies === undefined || data.replies === null)
        continue;
      visit(listing(data.replies, `Reddit comment ${visited}.replies`, 500).children);
    }
  };
  visit(page.comments.children);
  return Object.freeze({
    post: page.post,
    comments: Object.freeze(projected),
    truncated: visited > limit,
    hasMore
  });
}
function projectedMessage(value, label) {
  if (value.kind !== "t4" && value.kind !== "t1") {
    throw new Error(`${label}.kind must be a legacy message or inbox notification`);
  }
  const data = record(value.data, `${label}.data`);
  const kind = value.kind === "t4" ? "message" : "notification";
  const id = redditFullname(data.name, `${label}.data.name`, [value.kind]);
  const contextValue = optionalString(data.context, `${label}.data.context`, 2048);
  if (contextValue !== null && (!contextValue.startsWith("/") || contextValue.startsWith("//"))) {
    throw new Error(`${label}.data.context must be a Reddit path`);
  }
  return Object.freeze({
    kind,
    id,
    author: optionalString(data.author, `${label}.data.author`, 64),
    recipient: optionalString(data.dest, `${label}.data.dest`, 64),
    subject: boundedString(data.subject ?? "", `${label}.data.subject`, 1000, true),
    body: boundedString(data.body ?? "", `${label}.data.body`, 1e5, true),
    createdUtc: finiteNumber(data.created_utc, `${label}.data.created_utc`),
    unread: boolean(data.new ?? false, `${label}.data.new`),
    parentId: data.parent_id === undefined || data.parent_id === null || data.parent_id === "" ? null : redditFullname(data.parent_id, `${label}.data.parent_id`, ["t1", "t3", "t4"]),
    context: contextValue === null ? null : `https://www.reddit.com${contextValue}`
  });
}
function nestedMessageThings(value, maximum) {
  const result = [value];
  const data = record(value.data, "Reddit message thing.data");
  if (data.replies === undefined || data.replies === null || data.replies === "") {
    return Object.freeze(result);
  }
  const replies = listing(data.replies, "Reddit message replies", maximum);
  for (const reply of replies.children) {
    if (result.length >= maximum)
      throw new Error("Reddit message thread exceeded its reviewed bound");
    result.push(...nestedMessageThings(reply, maximum - result.length));
  }
  return Object.freeze(result);
}
function normalizeRedditMessageListing(value, limit, requestedMessageId = null) {
  safeInteger(limit, "Reddit message limit", 1, 100);
  const target = requestedMessageId === null ? null : redditFullname(requestedMessageId, "Reddit requested message", ["t4"]);
  const page = listing(value, "Reddit message Listing", target === null ? limit : 1);
  const things = target === null ? page.children : Object.freeze(page.children.flatMap((child) => nestedMessageThings(child, 101)));
  if (things.length > (target === null ? limit : 101)) {
    throw new Error("Reddit message projection exceeded its reviewed bound");
  }
  const messages = things.map((thing, index) => projectedMessage(thing, `Reddit message ${index}`));
  const requested = target === null ? null : messages.find((message) => message.id === target) ?? null;
  if (target !== null && requested === null) {
    throw new Error("Reddit message response did not bind the requested message");
  }
  return Object.freeze({
    messages: Object.freeze(messages),
    after: page.after,
    before: page.before,
    requested
  });
}
function parseRedditThingState(value, expectedThingId) {
  const target = redditFullname(expectedThingId, "Reddit state target", ["t1", "t3"]);
  const page = listing(value, "Reddit state Listing", 1);
  if (page.children.length !== 1)
    throw new Error("Reddit state readback must contain exactly one thing");
  const child = page.children[0];
  if (child.kind !== "t1" && child.kind !== "t3") {
    throw new Error("Reddit state readback returned an unsupported thing kind");
  }
  const data = record(child.data, "Reddit state thing.data");
  const id = redditFullname(data.name, "Reddit state thing.name", ["t1", "t3"]);
  if (id !== target)
    throw new Error("Reddit state readback did not bind the requested thing");
  return Object.freeze({
    id,
    liked: nullableBoolean(data.likes, "Reddit state thing.likes"),
    saved: boolean(data.saved, "Reddit state thing.saved")
  });
}
function assertRedditMutationSuccess(value) {
  const root = record(value, "Reddit mutation response");
  if (root.json === undefined) {
    if (Object.keys(root).length !== 0) {
      throw new Error("Reddit mutation response contained an unreviewed variant");
    }
    return;
  }
  const json = record(root.json, "Reddit mutation response.json");
  if (!Array.isArray(json.errors) || json.errors.length !== 0) {
    throw new Error("Reddit mutation response contained provider errors");
  }
}

// src/providers/reddit-web-runtime.ts
var REDDIT_ORIGIN = "https://www.reddit.com";
var REDDIT_LEASE_ORIGIN = "https://old.reddit.com";
var REDDIT_USER_AGENT = "wrench/1.0 (local authenticated web client)";
var MAX_VIEWER_BYTES = 512 * 1024;
var MAX_READ_BYTES = 4 * 1024 * 1024;
var DEFAULT_LIMIT = 25;
var MAX_PROFILE_OVERVIEW_PAGES = 10;
var REDDIT_VIDEO_MAX_BYTES = 512 * 1024 * 1024;
var REDDIT_POSTER_MAX_BYTES = 20 * 1024 * 1024;
var REDDIT_UPLOAD_RESPONSE_BYTES = 2 * 1024 * 1024;
var REDDIT_VIDEO_FILENAME = "wrench-video.mp4";
function isRedditOperation(value) {
  return REDDIT_WEB_OPERATION_NAMES.includes(value);
}
function integerInput(input, name, fallback, minimum, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function stringInput(input, name, maximum) {
  const value = input[name];
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/u.test(value))
    throw new Error(`input.${name} must be a bounded string`);
  return value;
}
function booleanInput(input, name) {
  const value = input[name];
  if (typeof value !== "boolean")
    throw new Error(`input.${name} must be boolean`);
  return value;
}
function optionalStringInput(input, name, maximum) {
  const value = input[name];
  if (value === undefined)
    return;
  return stringInput(input, name, maximum);
}
function optionalBodyInput(input, name, maximum) {
  const value = input[name];
  if (value === undefined)
    return;
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`input.${name} must be bounded text`);
  return value;
}
function fileInput(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "kind,reference" || value.kind !== "file" || typeof value.reference !== "string" || value.reference.length < 1 || value.reference.length > 1024)
    throw new Error(`${label} must be one plan-bound file`);
  return value;
}
async function stableFileBytes(path, maximumBytes, label, operationDeadline) {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = await open(path, constants.O_RDONLY | noFollow);
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 1 || before.size > maximumBytes) {
      throw new Error(`${label} must be a regular file within its reviewed byte bound`);
    }
    const bytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || bytes.byteLength !== before.size)
      throw new Error(`${label} changed while it was materialized`);
    return bytes;
  } finally {
    await handle.close();
  }
}
function assertMp4(bytes) {
  if (bytes.byteLength < 16 || bytes[4] !== 102 || bytes[5] !== 116 || bytes[6] !== 121 || bytes[7] !== 112)
    throw new Error("Reddit video must be one bounded ISO BMFF MP4");
  const firstBoxSize = ((bytes[0] ?? 0) << 24 | (bytes[1] ?? 0) << 16 | (bytes[2] ?? 0) << 8 | (bytes[3] ?? 0)) >>> 0;
  if (firstBoxSize < 16 || firstBoxSize > bytes.byteLength) {
    throw new Error("Reddit video MP4 file-type box changed shape");
  }
}
function posterType(bytes) {
  if (bytes.byteLength >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10)
    return "image/png";
  if (bytes.byteLength >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  throw new Error("Reddit video poster must be one bounded PNG or JPEG");
}
async function readBoundRedditMedia(input, fileResolver, operationDeadline) {
  const videoInput = fileInput(input.media, "input.media");
  const posterInput = fileInput(input.thumbnail, "input.thumbnail");
  if (fileResolver === undefined) {
    throw new Error("Reddit video upload requires the plan-bound file resolver");
  }
  const resolve = () => fileResolver([videoInput, posterInput]);
  const paths = operationDeadline === undefined ? await resolve() : await operationDeadline.run(resolve, "authenticated web operation deadline");
  if (paths.length !== 2 || typeof paths[0] !== "string" || typeof paths[1] !== "string")
    throw new Error("Reddit media resolver did not return the exact video and poster files");
  const video = await stableFileBytes(paths[0], REDDIT_VIDEO_MAX_BYTES, "Reddit video", operationDeadline);
  const poster = await stableFileBytes(paths[1], REDDIT_POSTER_MAX_BYTES, "Reddit video poster", operationDeadline);
  assertMp4(video);
  const type = posterType(poster);
  return Object.freeze({
    video,
    poster,
    posterType: type,
    posterFilename: type === "image/png" ? "wrench-poster.png" : "wrench-poster.jpg"
  });
}
function exactReadHeaders() {
  return Object.freeze({
    accept: "application/json",
    referer: `${REDDIT_ORIGIN}/`,
    "user-agent": REDDIT_USER_AGENT
  });
}
function exactMutationHeaders() {
  return Object.freeze({
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    origin: REDDIT_ORIGIN,
    referer: `${REDDIT_ORIGIN}/`,
    "user-agent": REDDIT_USER_AGENT
  });
}
function exactLeaseHeaders(community, modhash) {
  return Object.freeze({
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    origin: REDDIT_LEASE_ORIGIN,
    referer: `${REDDIT_LEASE_ORIGIN}/r/${redditCommunity(community)}/submit`,
    "user-agent": REDDIT_USER_AGENT,
    "x-modhash": modhash,
    "x-requested-with": "XMLHttpRequest"
  });
}
function exactFlairHeaders(community, kind) {
  const subreddit = redditCommunity(community);
  return Object.freeze({
    accept: "text/html",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    origin: REDDIT_LEASE_ORIGIN,
    referer: kind === "post" ? `${REDDIT_LEASE_ORIGIN}/r/${subreddit}/submit` : `${REDDIT_LEASE_ORIGIN}/r/${subreddit}/`,
    "user-agent": REDDIT_USER_AGENT,
    "x-requested-with": "XMLHttpRequest"
  });
}
function redditMultipartUpload(lease, bytes, filename, mediaType) {
  const digest = createHash("sha256").update(bytes).update(filename).digest("hex").slice(0, 32);
  const fieldText = lease.fields.map(({ name, value }) => `${name}\x00${value}`).join("\x00");
  for (let suffix = 0;suffix < 16; suffix += 1) {
    const boundary = `wrench-reddit-upload-${digest}-${suffix}`;
    if (Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(Buffer.from(boundary, "ascii")) || fieldText.includes(boundary))
      continue;
    const chunks = [];
    for (const field of lease.fields) {
      chunks.push(Buffer.from(`--${boundary}\r
Content-Disposition: form-data; name="${field.name}"\r
\r
${field.value}\r
`, "utf8"));
    }
    chunks.push(Buffer.from(`--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${filename}"\r
Content-Type: ${mediaType}\r
\r
`, "utf8"));
    chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    chunks.push(Buffer.from(`\r
--${boundary}--\r
`, "ascii"));
    return Object.freeze({
      body: new Uint8Array(Buffer.concat(chunks)),
      contentType: `multipart/form-data; boundary=${boundary}`
    });
  }
  throw new Error("Reddit media could not bind an unambiguous multipart boundary");
}
async function uploadRedditMedia(recipe, lease, bytes, filename, mediaType, dependencies, operationDeadline) {
  const multipart = redditMultipartUpload(lease, bytes, filename, mediaType);
  await uploadPublicWebAsset(new URL("/", lease.uploadOrigin), {
    allowedOrigin: lease.uploadOrigin,
    body: multipart.body,
    contentType: multipart.contentType,
    expectedStatus: 201,
    maxBytes: mediaType === "video/mp4" ? REDDIT_VIDEO_MAX_BYTES + 1024 * 1024 : REDDIT_POSTER_MAX_BYTES + 1024 * 1024,
    timeoutMs: recipe.timeoutMs,
    userAgent: REDDIT_USER_AGENT,
    ...operationDeadline === undefined ? {} : { operationDeadline },
    ...dependencies === undefined ? {} : { dependencies }
  });
  return redditMediaAssetUrl(lease);
}
function safeRedditPreparationFailure(error) {
  if (!(error instanceof Error))
    return null;
  const message = error.message;
  if (/^public web asset upload returned unreviewed status [1-5][0-9]{2}$/u.test(message) || message === "public web asset upload failed before a reviewed response was received")
    return message;
  return null;
}
async function defaultWaitForWebSocketMessage(url, options) {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 180000)
    throw new Error("Reddit video websocket timeout is outside its reviewed bound");
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket;
    const finish = (result) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000);
      }
      if (result.ok)
        resolve(result.value);
      else
        reject(new Error("Reddit video processing websocket ended without a reviewed result"));
    };
    const abort = () => finish({ ok: false });
    const timer = setTimeout(() => finish({ ok: false }), options.timeoutMs);
    try {
      socket = new WebSocket(url);
    } catch {
      clearTimeout(timer);
      reject(new Error("Reddit video processing websocket could not be opened"));
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    socket.onmessage = (event) => {
      if (typeof event.data !== "string" || Buffer.byteLength(event.data, "utf8") > 64 * 1024) {
        finish({ ok: false });
        return;
      }
      finish({ ok: true, value: event.data });
    };
    socket.onerror = () => finish({ ok: false });
    socket.onclose = () => finish({ ok: false });
  });
}
async function currentViewer(client, maximumBytes = MAX_VIEWER_BYTES) {
  const url = new URL("/api/me.json", REDDIT_ORIGIN);
  authorizeRedditWebRequest({
    operation: "viewer.current",
    url,
    method: "GET"
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: Math.min(maximumBytes, MAX_VIEWER_BYTES)
  });
  return parseRedditWebViewerResponse(response);
}
function expectedSubject(auth) {
  const subject = webSessionAuthSubject(auth);
  if (subject === null || !/^reddit:t2_[a-z0-9]{1,32}$/u.test(subject)) {
    throw new Error("Reddit authenticated operations require an auth locator bound to an exact reddit:t2_<id> subject");
  }
  return subject;
}
function assertBoundViewer(auth, viewer) {
  const expected = expectedSubject(auth);
  if (`reddit:${viewer.id}` !== expected) {
    throw new Error("Reddit browser session viewer no longer matches the confirmed auth subject");
  }
  return expected;
}
async function requireBoundViewer(client, auth) {
  const viewer = await currentViewer(client);
  assertBoundViewer(auth, viewer);
  return viewer;
}
async function executeFlairChoices(client, recipe, input, auth, options) {
  if (!isRedditFlairOperation(recipe.action)) {
    throw new Error("Reddit flair operation is not installed");
  }
  const parsed = parseRedditFlairInput(recipe.action, input);
  if (parsed.action !== "choices") {
    throw new Error("Reddit flair selection is capture-required");
  }
  const viewer = await requireBoundViewer(client, auth);
  options.setStage?.("target");
  const flairClient = await createWebSessionClient(REDDIT_LEASE_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const url = new URL("/api/flairselector", REDDIT_LEASE_ORIGIN);
  const form = new URLSearchParams;
  if (parsed.target.kind === "user") {
    form.set("name", viewer.username);
  } else {
    form.set("is_newlink", "true");
  }
  form.set("r", parsed.target.community);
  form.set("uh", viewer.modhash);
  const body = form.toString();
  const operation = parsed.target.kind === "user" ? "flair.user.choices" : "flair.post.choices";
  authorizeRedditWebRequest({
    operation,
    url,
    method: "POST",
    body,
    community: parsed.target.community,
    ...parsed.target.kind === "user" ? { username: viewer.username } : {}
  });
  const response = await flairClient.requestText({
    url,
    method: "POST",
    headers: exactFlairHeaders(parsed.target.community, parsed.target.kind),
    body,
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(recipe.maxOutputBytes, MAX_VIEWER_BYTES)
  });
  return {
    status: "succeeded",
    output: parseRedditFlairChoicesResponse(response, parsed.target),
    finalUrl: parsed.target.kind === "post" ? `${REDDIT_LEASE_ORIGIN}/r/${parsed.target.community}/submit` : `${REDDIT_LEASE_ORIGIN}/r/${parsed.target.community}/`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function probeRedditWebSubject(auth, options = {}) {
  const client = await createWebSessionClient(REDDIT_ORIGIN, auth, {
    timeoutMs: options.timeoutMs ?? 60000,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const viewer = await currentViewer(client);
  return `reddit:${viewer.id}`;
}
function boundedMaximum(recipe) {
  return Math.min(recipe.maxOutputBytes, MAX_READ_BYTES);
}
function profileInput(input) {
  const value = stringInput(input, "profile", 64);
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(value)) {
    throw new Error("input.profile must be an exact Reddit profile handle");
  }
  return value;
}
function observedAt(dependencies) {
  const now = dependencies?.now?.() ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) {
    throw new Error("Reddit profile observation time is invalid");
  }
  return new Date(now).toISOString();
}
function exactCount(value, window) {
  return Object.freeze({
    status: "available",
    value,
    precision: "exact",
    unit: "count",
    ...window === undefined ? {} : { window }
  });
}
var contributionUnavailable = Object.freeze({
  status: "unavailable",
  reason: "not-exposed"
});
async function readProfileAbout(client, profile, maximumBytes) {
  const url = new URL(`/user/${encodeURIComponent(profile)}/about.json`, REDDIT_ORIGIN);
  url.searchParams.set("raw_json", "1");
  authorizeRedditWebRequest({
    operation: "profiles.about",
    url,
    method: "GET",
    profile
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: Math.min(maximumBytes, MAX_READ_BYTES)
  });
  return parseRedditWebProfileResponse(response, profile);
}
async function readVisibleContributionCount(client, profile, maximumBytes) {
  const ids = new Set;
  const cursors = new Set;
  let after = null;
  for (let pageNumber = 0;pageNumber < MAX_PROFILE_OVERVIEW_PAGES; pageNumber += 1) {
    const url = new URL(`/user/${encodeURIComponent(profile)}/overview.json`, REDDIT_ORIGIN);
    url.searchParams.set("limit", "100");
    url.searchParams.set("raw_json", "1");
    if (after !== null)
      url.searchParams.set("after", after);
    authorizeRedditWebRequest({
      operation: "profiles.overview",
      url,
      method: "GET",
      profile
    });
    const response = await client.requestJson({
      url,
      method: "GET",
      headers: exactReadHeaders(),
      expectedStatuses: [200],
      expectedContentTypes: ["application/json"],
      maxBytes: Math.min(maximumBytes, MAX_READ_BYTES)
    });
    const page = parseRedditProfileContributionPage(response, profile);
    for (const id of page.ids) {
      if (ids.has(id))
        throw new Error("Reddit profile overview pagination repeated a contribution");
      ids.add(id);
    }
    if (page.after === null)
      return ids.size;
    if (cursors.has(page.after))
      throw new Error("Reddit profile overview pagination repeated a cursor");
    cursors.add(page.after);
    after = page.after;
  }
  return null;
}
async function readProfile(client, recipe, input, viewer, dependencies, setStage = () => {
  return;
}) {
  const requestedProfile = profileInput(input);
  if (requestedProfile.toLocaleLowerCase("en-US") !== viewer.username.toLocaleLowerCase("en-US")) {
    throw new Error("Reddit requested profile did not match the bound current account");
  }
  setStage("target");
  const profile = await readProfileAbout(client, requestedProfile, recipe.maxOutputBytes);
  setStage("supplemental");
  const contributions = await readVisibleContributionCount(client, requestedProfile, recipe.maxOutputBytes);
  return Object.freeze({
    schemaVersion: 1,
    provider: "reddit",
    target: Object.freeze({
      kind: "profile",
      id: profile.username,
      url: `${REDDIT_ORIGIN}/user/${encodeURIComponent(profile.username)}/`
    }),
    observedAt: observedAt(dependencies),
    completeness: contributions === null ? "partial" : "complete",
    metrics: Object.freeze({
      followers: exactCount(profile.followers),
      karma: exactCount(profile.karma),
      contributions: contributions === null ? contributionUnavailable : exactCount(contributions, "visible-overview")
    }),
    metadata: Object.freeze({
      handle: profile.username,
      ...profile.displayName === null ? {} : { displayName: profile.displayName },
      ...profile.bio === null ? {} : { bio: profile.bio },
      contributionDefinition: "Distinct post and comment IDs in the complete authenticated profile overview listing."
    })
  });
}
function afterQuery(input) {
  const after = optionalStringInput(input, "after", 40);
  if (after === undefined)
    return;
  return redditFullname(after, "input.after", ["t1", "t3", "t4"]);
}
async function readFeed(client, recipe, input) {
  if (input.feed !== "home")
    throw new Error("input.feed must be the observed Reddit home feed");
  const limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  const url = new URL("/.json", REDDIT_ORIGIN);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("raw_json", "1");
  const after = afterQuery(input);
  if (after !== undefined)
    url.searchParams.set("after", after);
  authorizeRedditWebRequest({
    operation: "feeds.home",
    url,
    method: "GET"
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders(),
    maxBytes: boundedMaximum(recipe)
  });
  return normalizeRedditFeedResponse(response, limit);
}
function postInput(input) {
  return redditPostId(stringInput(input, "post_id", 40), "input.post_id");
}
async function readPostOrComments(client, recipe, input, comments) {
  const postId = postInput(input);
  const bare = postId.slice(3);
  const url = new URL(`/comments/${encodeURIComponent(bare)}.json`, REDDIT_ORIGIN);
  let limit = 1;
  if (comments) {
    limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
    url.searchParams.set("depth", "10");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("raw_json", "1");
    url.searchParams.set("sort", "confidence");
  } else {
    url.searchParams.set("limit", "1");
    url.searchParams.set("raw_json", "1");
  }
  authorizeRedditWebRequest({
    operation: comments ? "comments.read" : "posts.read",
    url,
    method: "GET",
    targetId: postId
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders(),
    maxBytes: boundedMaximum(recipe)
  });
  return comments ? normalizeRedditCommentsResponse(response, postId, limit) : normalizeRedditPostResponse(response, postId);
}
function messageFolder(input) {
  const value = stringInput(input, "folder", 16);
  if (value !== "inbox" && value !== "unread" && value !== "sent") {
    throw new Error("input.folder must name inbox, unread, or sent");
  }
  return value;
}
function redditReadFinalUrl(operation, input) {
  if (operation === "profiles.read") {
    return `${REDDIT_ORIGIN}/user/${encodeURIComponent(profileInput(input))}/`;
  }
  if (operation === "feeds.read") {
    if (input.feed !== "home") {
      throw new Error("input.feed must be the observed Reddit home feed");
    }
    return REDDIT_ORIGIN;
  }
  if (operation === "posts.read" || operation === "comments.read" || operation === "media.read") {
    return `${REDDIT_ORIGIN}/comments/${postInput(input).slice(3)}/`;
  }
  if (operation === "messaging.list" || operation === "messaging.read") {
    return `${REDDIT_ORIGIN}/message/${messageFolder(input)}/`;
  }
  if (operation === "flair.user.choices" || operation === "flair.post.choices") {
    const parsed = parseRedditFlairInput(operation, input);
    if (parsed.action !== "choices") {
      throw new Error("Reddit flair selection is capture-required");
    }
    return parsed.target.kind === "post" ? `${REDDIT_LEASE_ORIGIN}/r/${parsed.target.community}/submit` : `${REDDIT_LEASE_ORIGIN}/r/${parsed.target.community}/`;
  }
  return null;
}
function redditReadAccountMismatch(error) {
  return error.message.includes("viewer no longer matches") || error.message.includes("no longer matches the confirmed auth subject") || error.message.includes("did not match the bound current account");
}
function redditReadAuthRepairRequired(error) {
  return error.message.includes("auth locator bound");
}
function failedRedditRead(operation, error, finalUrl, stage) {
  return failedProviderRead(`Reddit ${operation}`, error, finalUrl, {
    stage,
    authenticated: true,
    accountMismatch: redditReadAccountMismatch,
    authRepairRequired: redditReadAuthRepairRequired,
    targetStatusUnavailable: operation === "posts.read" || operation === "comments.read" || operation === "media.read" || operation === "messaging.read"
  });
}
async function readMessages(client, recipe, input, single) {
  const folder = messageFolder(input);
  const url = new URL(`/message/${folder}.json`, REDDIT_ORIGIN);
  let limit = 1;
  let messageId = null;
  if (single) {
    messageId = redditFullname(stringInput(input, "message_id", 40), "input.message_id", ["t4"]);
    url.searchParams.set("limit", "1");
    url.searchParams.set("mark", "false");
    url.searchParams.set("max_replies", "100");
    url.searchParams.set("mid", messageId);
    url.searchParams.set("raw_json", "1");
  } else {
    limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("mark", "false");
    url.searchParams.set("max_replies", "0");
    url.searchParams.set("raw_json", "1");
    const after = afterQuery(input);
    if (after !== undefined)
      url.searchParams.set("after", after);
  }
  authorizeRedditWebRequest({
    operation: single ? "messages.read" : "messages.list",
    url,
    method: "GET",
    folder,
    ...messageId === null ? {} : { targetId: messageId }
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders(),
    maxBytes: boundedMaximum(recipe)
  });
  return normalizeRedditMessageListing(response, limit, messageId);
}
async function readThingState(client, targetId, maximumBytes) {
  const url = new URL("/api/info.json", REDDIT_ORIGIN);
  url.searchParams.set("id", targetId);
  url.searchParams.set("raw_json", "1");
  authorizeRedditWebRequest({
    operation: "state.readback",
    url,
    method: "GET",
    targetId
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders(),
    maxBytes: Math.min(maximumBytes, MAX_READ_BYTES)
  });
  return parseRedditThingState(response, targetId);
}
async function readPostPresenceValue(client, targetId, maximumBytes, operation = "state.readback") {
  const url = new URL("/api/info.json", REDDIT_ORIGIN);
  url.searchParams.set("id", redditPostId(targetId));
  url.searchParams.set("raw_json", "1");
  authorizeRedditWebRequest({
    operation,
    url,
    method: "GET",
    targetId
  });
  return client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: Math.min(maximumBytes, MAX_READ_BYTES)
  });
}
async function requestRedditMediaLease(client, community, modhash, mediaType, filename) {
  const url = new URL(mediaType === "video/mp4" ? "/api/video_upload_s3.json" : "/api/image_upload_s3.json", REDDIT_LEASE_ORIGIN);
  const form = new URLSearchParams;
  form.set("filepath", filename);
  form.set("mimetype", mediaType);
  form.set("raw_json", "1");
  const body = form.toString();
  authorizeRedditWebRequest({
    operation: "media.lease",
    url,
    method: "POST",
    body,
    mediaType,
    filename
  });
  return client.requestJson({
    url,
    method: "POST",
    headers: exactLeaseHeaders(community, modhash),
    body,
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: REDDIT_UPLOAD_RESPONSE_BYTES
  });
}
async function waitForRedditVideoReadback(client, recipe, postId, sleep) {
  const delays = [0, 1000, 2000, 3000, 5000];
  for (const delay of delays) {
    if (delay > 0)
      await sleep(delay);
    const readback = parseRedditVideoPostPresence(await readPostPresenceValue(client, postId, recipe.maxOutputBytes), postId);
    if (readback !== null)
      return readback;
  }
  throw new Error("Reddit video post did not appear within the bounded readback window");
}
function assertRedditVideoBinding(readback, expected) {
  if (readback.post.author !== expected.viewer.username || readback.authorFullname !== null && readback.authorFullname !== expected.viewer.id)
    throw new Error("Reddit video post readback did not bind the confirmed actor");
  if (readback.post.subreddit.toLowerCase() !== expected.community.toLowerCase() || readback.post.title !== expected.title || readback.post.body !== expected.body || readback.nsfw !== expected.nsfw || readback.spoiler !== expected.spoiler)
    throw new Error("Reddit video post readback did not bind the confirmed content and declarations");
  if (readback.post.createdUtc === null || readback.post.createdUtc < expected.notBeforeSeconds - 300 || readback.post.createdUtc > expected.nowSeconds + 300)
    throw new Error("Reddit video post readback escaped the confirmed dispatch window");
}
function acceptedRedditPostId(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Reddit provider-accepted post target is not canonical JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.keys(parsed).join(",") !== "postId")
    throw new Error("Reddit provider-accepted post target changed shape");
  const postId = redditPostId(parsed.postId, "Reddit provider-accepted post target ID");
  if (canonicalJson({ postId }) !== value) {
    throw new Error("Reddit provider-accepted post target is not canonical");
  }
  return postId;
}
async function executeMediaPublish(client, recipe, input, auth, options) {
  const community = redditCommunity(stringInput(input, "community", 21), "input.community");
  const title = stringInput(input, "title", 280);
  const body = optionalBodyInput(input, "body", 1e4) ?? "";
  const nsfw = booleanInput(input, "nsfw");
  const spoiler = booleanInput(input, "spoiler");
  const sendReplies = booleanInput(input, "send_replies");
  const viewer = await requireBoundViewer(client, auth);
  const media = await readBoundRedditMedia(input, options.fileResolver, options.operationDeadline);
  const leaseClient = await createWebSessionClient(REDDIT_LEASE_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  let started = 0;
  let verified = 0;
  let stage = "video-lease-request";
  let finalUrl = null;
  try {
    const videoLeaseResponse = await requestRedditMediaLease(leaseClient, community, viewer.modhash, "video/mp4", REDDIT_VIDEO_FILENAME);
    stage = "video-lease-parse";
    const videoLease = parseRedditMediaLeaseResponse(videoLeaseResponse, {
      mediaType: "video/mp4",
      filename: REDDIT_VIDEO_FILENAME
    });
    stage = "poster-lease-request";
    const posterLeaseResponse = await requestRedditMediaLease(leaseClient, community, viewer.modhash, media.posterType, media.posterFilename);
    stage = "poster-lease-parse";
    const posterLease = parseRedditMediaLeaseResponse(posterLeaseResponse, {
      mediaType: media.posterType,
      filename: media.posterFilename
    });
    stage = "video-upload";
    const videoUrl = await uploadRedditMedia(recipe, videoLease, media.video, REDDIT_VIDEO_FILENAME, "video/mp4", options.dependencies, options.operationDeadline);
    stage = "poster-upload";
    const posterUrl = await uploadRedditMedia(recipe, posterLease, media.poster, media.posterFilename, media.posterType, options.dependencies, options.operationDeadline);
    stage = "viewer-rebinding";
    const rebound = await currentViewer(client);
    assertBoundViewer(auth, rebound);
    if (rebound.id !== viewer.id)
      throw new Error("Reddit viewer changed during video upload");
    const url = new URL("/api/submit", REDDIT_ORIGIN);
    url.searchParams.set("raw_json", "1");
    const form = new URLSearchParams;
    form.set("api_type", "json");
    form.set("kind", "video");
    form.set("nsfw", String(nsfw));
    form.set("resubmit", "false");
    form.set("sendreplies", String(sendReplies));
    form.set("spoiler", String(spoiler));
    form.set("sr", community);
    form.set("title", title);
    form.set("uh", rebound.modhash);
    form.set("url", videoUrl);
    form.set("validate_on_submit", "true");
    form.set("video_poster_url", posterUrl);
    if (body !== "")
      form.set("text", body);
    const submitBody = form.toString();
    authorizeRedditWebRequest({
      operation: "media.publish",
      url,
      method: "POST",
      body: submitBody,
      community,
      title,
      ...body === "" ? {} : { text: body },
      nsfw,
      spoiler,
      sendReplies,
      mediaUrl: videoUrl,
      posterUrl
    });
    stage = "dispatch-admission";
    await options.beforeDispatch?.(dispatchEvent(recipe.action, 0, 0));
    started = 1;
    const notBeforeSeconds = Math.floor((options.dependencies?.now ?? Date.now)() / 1000);
    stage = "submit-response";
    const websocketUrl = parseRedditVideoSubmitResponse(await client.requestJson({
      url,
      method: "POST",
      headers: exactMutationHeaders(),
      body: submitBody,
      expectedStatuses: [200],
      expectedContentTypes: ["application/json"],
      maxBytes: REDDIT_UPLOAD_RESPONSE_BYTES
    }));
    stage = "processing-websocket";
    const waitForWebSocket = options.dependencies?.waitForWebSocketMessage ?? defaultWaitForWebSocketMessage;
    const remaining = options.operationDeadline?.remainingTimeMs() ?? 180000;
    const message = await waitForWebSocket(websocketUrl, {
      timeoutMs: Math.max(1000, Math.min(180000, remaining)),
      ...options.operationDeadline === undefined ? {} : { signal: options.operationDeadline.signal }
    });
    const accepted = parseRedditVideoWebSocketMessage(message, community);
    finalUrl = accepted.url;
    stage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: recipe.action,
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: canonicalJson({ postId: accepted.postId })
      }
    });
    stage = "independent-readback";
    const sleep = options.dependencies?.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const readback = await waitForRedditVideoReadback(client, recipe, accepted.postId, sleep);
    const nowSeconds = Math.floor((options.dependencies?.now ?? Date.now)() / 1000);
    assertRedditVideoBinding(readback, {
      viewer,
      community,
      title,
      body,
      nsfw,
      spoiler,
      notBeforeSeconds,
      nowSeconds
    });
    verified = 1;
    stage = "verification-recording";
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1));
    return {
      status: "succeeded",
      output: Object.freeze({
        postId: accepted.postId,
        url: accepted.url,
        community,
        title,
        video: Object.freeze({
          durationSeconds: readback.durationSeconds,
          width: readback.width,
          height: readback.height
        })
      }),
      finalUrl: accepted.url,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch (error) {
    const preparationFailure = safeRedditPreparationFailure(error);
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? `Reddit may have published the confirmed video, but ${stage} was not verified; reconcile before retrying` : `Reddit video preparation failed at ${stage} before public submission${preparationFailure === null ? "" : `; reason: ${preparationFailure}`}`
    };
  }
}
async function readDeletionPresence(client, recipe, postId) {
  return parseRedditAuthoredPostPresence(await readPostPresenceValue(client, postId, recipe.maxOutputBytes), postId);
}
function assertDeletionTarget(presence, viewer, expectedTitle) {
  if (!presence.present || presence.post === null)
    return;
  if (presence.post.author !== viewer.username || presence.authorFullname !== null && presence.authorFullname !== viewer.id)
    throw new Error("Reddit delete target was not authored by the bound viewer");
  if (presence.post.title !== expectedTitle) {
    throw new Error("Reddit delete target title changed after confirmation");
  }
}
async function executeContentDelete(client, recipe, input, auth, options) {
  const postId = redditPostId(stringInput(input, "post_id", 40), "input.post_id");
  const expectedTitle = stringInput(input, "expected_title", 280);
  const viewer = await requireBoundViewer(client, auth);
  const before = await readDeletionPresence(client, recipe, postId);
  if (!before.present) {
    return {
      status: "succeeded",
      output: Object.freeze({ postId, deleted: true, noOp: true }),
      finalUrl: `${REDDIT_ORIGIN}/comments/${postId.slice(3)}/`,
      noOp: true,
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 }
    };
  }
  assertDeletionTarget(before, viewer, expectedTitle);
  let started = 0;
  let verified = 0;
  try {
    const rebound = await currentViewer(client);
    assertBoundViewer(auth, rebound);
    if (rebound.id !== viewer.id)
      throw new Error("Reddit viewer changed during delete preparation");
    const freshTarget = await readDeletionPresence(client, recipe, postId);
    if (!freshTarget.present) {
      return {
        status: "succeeded",
        output: Object.freeze({ postId, deleted: true, noOp: true }),
        finalUrl: `${REDDIT_ORIGIN}/comments/${postId.slice(3)}/`,
        noOp: true,
        dispatchStarted: false,
        dispatch: { planned: 1, started: 0, verified: 0 }
      };
    }
    assertDeletionTarget(freshTarget, rebound, expectedTitle);
    const url = new URL("/api/del", REDDIT_ORIGIN);
    const form = new URLSearchParams;
    form.set("id", postId);
    form.set("uh", rebound.modhash);
    const body = form.toString();
    authorizeRedditWebRequest({
      operation: "content.delete",
      url,
      method: "POST",
      body,
      targetId: postId
    });
    await options.beforeDispatch?.(dispatchEvent(recipe.action, 0, 0));
    started = 1;
    assertRedditMutationSuccess(await client.requestJson({
      url,
      method: "POST",
      headers: exactMutationHeaders(),
      body,
      expectedStatuses: [200],
      expectedContentTypes: ["application/json"],
      maxBytes: 512 * 1024
    }));
    const sleep = options.dependencies?.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    let after = await readDeletionPresence(client, recipe, postId);
    for (const delay of [500, 1000, 2000]) {
      if (!after.present)
        break;
      await sleep(delay);
      after = await readDeletionPresence(client, recipe, postId);
    }
    if (after.present)
      throw new Error("Reddit exact delete readback still returned the authored post");
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1));
    return {
      status: "succeeded",
      output: Object.freeze({ postId, deleted: true, noOp: false }),
      finalUrl: `${REDDIT_ORIGIN}/comments/${postId.slice(3)}/`,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: `${REDDIT_ORIGIN}/comments/${postId.slice(3)}/`,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? "Reddit may have deleted the exact post, but absence was not verified; reconcile before retrying" : "Reddit delete dispatch failed before submission"
    };
  }
}
function dispatchEvent(id, started, verified) {
  return {
    id,
    index: 1,
    progress: { planned: 1, started, verified }
  };
}
function desiredReaction(input) {
  const value = input.direction;
  if (!Number.isSafeInteger(value)) {
    throw new Error("input.direction must be -1, 0, or 1");
  }
  if (value !== -1 && value !== 0 && value !== 1) {
    throw new Error("input.direction must be -1, 0, or 1");
  }
  return value;
}
function desiredLikedState(direction) {
  return direction === 1 ? true : direction === -1 ? false : null;
}
async function prepareDesiredStateWithClient(client, recipe, input, auth) {
  if (recipe.site !== "reddit" || recipe.contractVersion !== 1 || recipe.action !== "content.save" && recipe.action !== "reactions.set") {
    throw new Error("Reddit desired-state preparation supports only content.save and reactions.set");
  }
  const viewer = await requireBoundViewer(client, auth);
  const thingId = redditFullname(stringInput(input, "thing_id", 40), "input.thing_id", ["t1", "t3"]);
  const before = await readThingState(client, thingId, recipe.maxOutputBytes);
  if (recipe.action === "content.save") {
    const desiredState2 = booleanInput(input, "saved");
    return Object.freeze({
      viewer,
      preparation: Object.freeze({
        operation: "content.save",
        thingId,
        desiredState: desiredState2,
        actualState: before.saved,
        alreadyDesired: before.saved === desiredState2
      })
    });
  }
  const direction = desiredReaction(input);
  const desiredState = desiredLikedState(direction);
  return Object.freeze({
    viewer,
    preparation: Object.freeze({
      operation: "reactions.set",
      thingId,
      desiredState,
      actualState: before.liked,
      alreadyDesired: before.liked === desiredState
    })
  });
}
async function prepareRedditWebDesiredState(recipe, input, auth, options = {}) {
  if (recipe.site !== "reddit" || recipe.contractVersion !== 1 || recipe.action !== "content.save" && recipe.action !== "reactions.set") {
    throw new Error("Reddit desired-state preparation supports only content.save and reactions.set");
  }
  const client = await createWebSessionClient(REDDIT_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  return (await prepareDesiredStateWithClient(client, recipe, input, auth)).preparation;
}
async function readRedditWebDesiredState(recipe, input, auth, options = {}) {
  if (recipe.site !== "reddit" || recipe.contractVersion !== 1 || recipe.action !== "content.save") {
    throw new Error("Reddit recovery readback supports only content.save");
  }
  const preparation = await prepareRedditWebDesiredState(recipe, input, auth, options);
  if (preparation.operation !== "content.save") {
    throw new Error("Reddit saved-state readback changed operation kind");
  }
  return Object.freeze({
    kind: "saved",
    enabled: preparation.actualState,
    thingId: preparation.thingId
  });
}
async function readRedditWebContentDeleteDesiredState(recipe, input, auth, options = {}) {
  if (recipe.site !== "reddit" || recipe.action !== "content.delete" || recipe.contractVersion !== 1)
    throw new Error("Reddit deletion recovery supports only content.delete@1");
  const postId = redditPostId(stringInput(input, "post_id", 40), "input.post_id");
  const expectedTitle = stringInput(input, "expected_title", 280);
  const client = await createWebSessionClient(REDDIT_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const viewer = await requireBoundViewer(client, auth);
  const presence = await readDeletionPresence(client, recipe, postId);
  assertDeletionTarget(presence, viewer, expectedTitle);
  return Object.freeze({ present: presence.present, postId });
}
async function readRedditWebPublishedMutationTarget(recipe, input, auth, identifier, options = {}) {
  if (recipe.site !== "reddit" || recipe.action !== "media.publish" || recipe.contractVersion !== 9)
    throw new Error("Reddit video-publish recovery supports only media.publish@9");
  const postId = acceptedRedditPostId(identifier);
  const community = redditCommunity(stringInput(input, "community", 21), "input.community");
  const title = stringInput(input, "title", 280);
  const body = optionalBodyInput(input, "body", 1e4) ?? "";
  const nsfw = booleanInput(input, "nsfw");
  const spoiler = booleanInput(input, "spoiler");
  const client = await createWebSessionClient(REDDIT_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const viewer = await requireBoundViewer(client, auth);
  const readback = parseRedditVideoPostPresence(await readPostPresenceValue(client, postId, recipe.maxOutputBytes), postId);
  if (readback === null)
    return Object.freeze({ present: false, postId });
  const nowSeconds = Math.floor((options.dependencies?.now ?? Date.now)() / 1000);
  assertRedditVideoBinding(readback, {
    viewer,
    community,
    title,
    body,
    nsfw,
    spoiler,
    notBeforeSeconds: 0,
    nowSeconds
  });
  return Object.freeze({ present: true, postId });
}
function desiredStateNoOp(preparation) {
  const desired = preparation.operation === "content.save" ? { saved: preparation.desiredState } : {
    direction: preparation.desiredState === true ? 1 : preparation.desiredState === false ? -1 : 0
  };
  return {
    status: "succeeded",
    output: Object.freeze({
      thingId: preparation.thingId,
      desired: Object.freeze(desired),
      noOp: true,
      effect: "already-satisfied"
    }),
    finalUrl: REDDIT_ORIGIN,
    dispatchStarted: false,
    dispatch: { planned: 1, started: 0, verified: 0 }
  };
}
async function executeDesiredState(client, recipe, input, auth, options) {
  const prepared = await prepareDesiredStateWithClient(client, recipe, input, auth);
  const initialViewer = prepared.viewer;
  const targetId = prepared.preparation.thingId;
  const save = recipe.action === "content.save";
  const direction = save ? null : desiredReaction(input);
  const saved = save ? booleanInput(input, "saved") : null;
  if (prepared.preparation.alreadyDesired) {
    return desiredStateNoOp(prepared.preparation);
  }
  let started = 0;
  let verified = 0;
  try {
    const freshViewer = await currentViewer(client);
    assertBoundViewer(auth, freshViewer);
    if (freshViewer.id !== initialViewer.id) {
      throw new Error("Reddit viewer changed during desired-state preparation");
    }
    const url = new URL(save ? saved ? "/api/save" : "/api/unsave" : "/api/vote", REDDIT_ORIGIN);
    const form = new URLSearchParams;
    if (!save)
      form.set("dir", String(direction));
    form.set("id", targetId);
    form.set("uh", freshViewer.modhash);
    const body = form.toString();
    authorizeRedditWebRequest({
      operation: save ? "content.save" : "reactions.set",
      url,
      method: "POST",
      body,
      targetId,
      ...save ? { saved } : { direction }
    });
    await options.beforeDispatch?.(dispatchEvent(recipe.action, 0, 0));
    started = 1;
    const mutation = await client.requestJson({
      url,
      method: "POST",
      headers: exactMutationHeaders(),
      body,
      expectedStatuses: [200],
      expectedContentTypes: ["application/json"],
      maxBytes: Math.min(recipe.maxOutputBytes, 512 * 1024)
    });
    assertRedditMutationSuccess(mutation);
    const after = await readThingState(client, targetId, recipe.maxOutputBytes);
    if (save ? after.saved !== saved : after.liked !== desiredLikedState(direction)) {
      throw new Error("Reddit desired-state readback did not match the confirmed state");
    }
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1));
    return {
      status: "succeeded",
      output: Object.freeze({
        thingId: targetId,
        desired: save ? { saved } : { direction },
        noOp: false,
        previouslyDesired: false
      }),
      finalUrl: REDDIT_ORIGIN,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: REDDIT_ORIGIN,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? "Reddit may have changed the requested state but exact readback was not verified; reconcile before retrying" : "Reddit desired-state dispatch failed before submission"
    };
  }
}
async function executeRedditWebOperation(recipe, input, auth, options = {}) {
  const expectedContractVersion = recipe.action === "media.publish" ? 9 : recipe.action === "media.read" ? 2 : 1;
  if (recipe.site !== "reddit" || !isRedditOperation(recipe.action) || recipe.contractVersion !== expectedContractVersion) {
    throw new Error("Reddit authenticated web recipe is not installed");
  }
  const contract = REDDIT_WEB_OPERATIONS[recipe.action];
  if (contract.state !== "observed") {
    throw new Error(`Reddit authenticated web operation ${recipe.action} is capture-required: ${contract.reason}`);
  }
  const readFinalUrl = contract.effect === "read" ? redditReadFinalUrl(recipe.action, input) : null;
  let client;
  try {
    client = await createWebSessionClient(REDDIT_ORIGIN, auth, {
      timeoutMs: recipe.timeoutMs,
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
    });
  } catch (error) {
    if (contract.effect !== "read")
      throw error;
    return failedRedditRead(recipe.action, error, readFinalUrl, "bootstrap");
  }
  if (recipe.action === "media.publish") {
    return executeMediaPublish(client, recipe, input, auth, options);
  }
  if (recipe.action === "content.delete") {
    return executeContentDelete(client, recipe, input, auth, options);
  }
  if (recipe.action === "reactions.set" || recipe.action === "content.save") {
    return executeDesiredState(client, recipe, input, auth, options);
  }
  if (recipe.action === "flair.user.choices" || recipe.action === "flair.post.choices") {
    options.beforeDispatch;
    options.afterProviderAcceptedMutationTarget;
    options.afterDispatchVerified;
    let stage2 = "identity";
    try {
      return await executeFlairChoices(client, recipe, input, auth, {
        ...options,
        setStage: (next) => {
          stage2 = next;
        }
      });
    } catch (error) {
      return failedRedditRead(recipe.action, error, readFinalUrl, stage2);
    }
  }
  if (recipe.action === "profiles.read") {
    let stage2 = "identity";
    try {
      const viewer = await requireBoundViewer(client, auth);
      const output = await readProfile(client, recipe, input, viewer, options.dependencies, (next) => {
        stage2 = next;
      });
      return {
        status: "succeeded",
        output,
        finalUrl: readFinalUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    } catch (error) {
      return failedRedditRead(recipe.action, error, readFinalUrl, stage2);
    }
  }
  options.beforeDispatch;
  options.afterProviderAcceptedMutationTarget;
  options.afterDispatchVerified;
  let stage = "identity";
  try {
    await requireBoundViewer(client, auth);
    stage = "target";
    let output;
    if (recipe.action === "media.read") {
      const targetId = redditPostId(input.post_id, "input.post_id");
      output = projectRedditHostedVideoMetadata(await readPostPresenceValue(client, targetId, recipe.maxOutputBytes, "media.read"), targetId);
    } else {
      output = recipe.action === "feeds.read" ? await readFeed(client, recipe, input) : recipe.action === "posts.read" ? await readPostOrComments(client, recipe, input, false) : recipe.action === "comments.read" ? await readPostOrComments(client, recipe, input, true) : recipe.action === "messaging.list" ? await readMessages(client, recipe, input, false) : recipe.action === "messaging.read" ? await readMessages(client, recipe, input, true) : (() => {
        throw new Error(`Reddit authenticated web operation ${recipe.action} has no executable reviewed contract`);
      })();
    }
    return {
      status: "succeeded",
      output,
      finalUrl: readFinalUrl,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }
    };
  } catch (error) {
    return failedRedditRead(recipe.action, error, readFinalUrl, stage);
  }
}
export {
  readRedditWebPublishedMutationTarget,
  readRedditWebDesiredState,
  readRedditWebContentDeleteDesiredState,
  probeRedditWebSubject,
  prepareRedditWebDesiredState,
  executeRedditWebOperation
};
