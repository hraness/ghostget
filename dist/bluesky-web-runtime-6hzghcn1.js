// @bun
import {
  readSessionSecretSnapshot,
  writeSessionSecretIfUnchanged
} from "./index-8qr77as7.js";
import {
  isoBmffVideoDimensions
} from "./index-kqaaw64h.js";
import {
  PreservedBrowserArtifactsError,
  browserCleanupBarrier,
  browserResultData,
  createBrowserSession
} from "./index-d5mavmrj.js";
import {
  webSessionAuthSubject
} from "./index-wn3s7nnj.js";
import"./index-0ywm1fj9.js";
import"./index-4bpemvnc.js";
import {
  ProviderReadResponseRejectedError,
  ProviderReadTransportError,
  failedProviderRead
} from "./index-4smh9n9x.js";
import {
  pinnedHttpsFetch
} from "./index-j3ysa35f.js";
import {
  startWebSessionCleanupTrackedOperation
} from "./index-aka7rgdj.js";
import {
  OperationDeadline,
  OperationDeadlineError
} from "./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import"./index-26yq8q16.js";
import {
  canonicalJson,
  sha256
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/providers/bluesky-web-runtime.ts
import { constants } from "fs";
import { open } from "fs/promises";
import { BoundedByteBuffer } from "@hraness/kb/clip/bounded-byte-buffer";

// src/providers/bluesky-web.ts
var BLUESKY_WEB_OPERATION_NAMES = Object.freeze([
  "comments.read",
  "content.delete",
  "content.save",
  "content.share",
  "feeds.read",
  "likes.set",
  "media.publish",
  "media.read",
  "messaging.list",
  "messaging.read",
  "messaging.send",
  "profiles.read",
  "posts.publish",
  "posts.quote",
  "posts.read",
  "posts.repost",
  "relationships.follow.set",
  "replies.create",
  "threads.publish"
]);
var captureRequired = (effect, risk, reason) => Object.freeze({
  effect,
  risk,
  state: "capture-required",
  reason
});
var observed = (effect, risk, reason) => Object.freeze({
  effect,
  risk,
  state: "observed",
  reason
});
var BLUESKY_WEB_OPERATIONS = Object.freeze({
  "profiles.read": observed("read", "R1", "fixed getProfile AppView read binds the exact requested handle and projects exact follower, following, and post counts"),
  "feeds.read": observed("read", "R1", "fixed getTimeline, listNotifications, and getBookmarks XRPC reads are account-bound and project bounded results"),
  "posts.read": observed("read", "R1", "fixed getPosts XRPC reads bind the exact requested AT URI and project one bounded post"),
  "comments.read": observed("read", "R1", "fixed getPostThread XRPC reads bind the exact requested AT URI and bound the reply projection"),
  "media.read": observed("read", "R1", "fixed getPosts XRPC reads project attachment metadata without returning media URLs"),
  "media.publish": observed("write", "R3", "the fixed legacy video-service upload, bounded public job poll, response-bound blob, repository record, durable accepted target, and authoritative record plus AppView readback are implemented from the current first-party protocol and verified fixture"),
  "messaging.list": captureRequired("read", "R1", "the fixed listConvos query needs a live nonempty conversation fixture proving bsky_chat proxy routing and viewer membership projection"),
  "messaging.read": captureRequired("read", "R1", "the fixed getConvo and getMessages queries need a live conversation fixture proving exact membership, conversation binding, and message projection"),
  "likes.set": captureRequired("write", "R2", "the code-owned desired-state like exchange needs an authorized live fixture proving create/delete and independent readback"),
  "content.save": captureRequired("write", "R2", "the code-owned private bookmark exchange needs an authorized live fixture proving create/delete and independent readback"),
  "content.delete": observed("write", "R3", "exact current-account app.bsky.feed.post deletion uses an authoritative PDS pre-read, CID compare-and-swap, strict commit response, and authoritative RecordNotFound readback"),
  "relationships.follow.set": captureRequired("write", "R2", "the code-owned desired-state follow exchange needs an authorized live fixture proving create/delete and independent readback"),
  "posts.repost": captureRequired("write", "R3", "the code-owned repost exchange needs an authorized live fixture proving create/delete and independent readback"),
  "posts.publish": observed("write", "R3", "current code-owned plain-text and single-image uploadBlob/createRecord path with durable accepted-target evidence, authoritative getRecord binding, and bounded independent getPosts projection readback"),
  "replies.create": captureRequired("write", "R3", "the code-owned reply path needs an authorized live fixture proving exact root, parent, response, and readback binding"),
  "posts.quote": captureRequired("write", "R3", "the code-owned quote path needs an authorized live fixture proving the embedded strong reference and independent readback"),
  "threads.publish": captureRequired("write", "R3", "the code-owned one-to-twenty-five dispatch path needs an authorized live fixture proving every ordered root/reply readback"),
  "messaging.send": captureRequired("write", "R3", "the code-owned sendMessage path needs an authorized live fixture proving conversation, sender, response, and getMessages readback binding"),
  "content.share": captureRequired("write", "R3", "Bluesky exposes repost and quote as distinct supported operations; no separate native share mutation is proven")
});
var BLUESKY_APP_ORIGIN = "https://bsky.app";
var BLUESKY_VIDEO_SERVICE_ORIGIN = "https://video.bsky.app";
var BLUESKY_APPVIEW_PROXY = "did:web:api.bsky.app#bsky_appview";
var BLUESKY_NOTIFICATION_PROXY = "did:web:api.bsky.app#bsky_notif";
var BLUESKY_CHAT_PROXY = "did:web:api.bsky.chat#bsky_chat";
var MAX_RESPONSE_ITEMS = 1000;
var MAX_TEXT = 32768;
var didPattern = /^did:(?:plc:[a-z2-7]{24}|web:[A-Za-z0-9._:%-]{1,240})$/u;
var handlePattern = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
var cidPattern = /^b[a-z2-7]{10,200}$/u;
var rkeyPattern = /^[A-Za-z0-9._~:@!$&'()*+,;=-]{1,512}$/u;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys(value, required, optional, label) {
  const keys = new Set(Object.keys(value));
  for (const key of required) {
    if (!keys.delete(key))
      throw new Error(`${label} omitted ${key}`);
  }
  for (const key of optional)
    keys.delete(key);
  if (keys.size > 0) {
    throw new Error(`${label} contained unsupported fields`);
  }
}
function string(value, label, maximum = MAX_TEXT, allowEmpty = false) {
  if (typeof value !== "string" || !allowEmpty && value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be bounded text`);
  return value;
}
function optionalString(value, label, maximum = MAX_TEXT) {
  if (value === undefined || value === null || value === "")
    return null;
  return string(value, label, maximum);
}
function boolean(value, label) {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${label} must be a bounded integer`);
  return value;
}
function nullableInteger(value, label) {
  if (value === undefined || value === null)
    return null;
  return integer(value, label);
}
function boundedArray(value, label) {
  if (!Array.isArray(value) || value.length > MAX_RESPONSE_ITEMS) {
    throw new Error(`${label} must be a bounded array`);
  }
  return value;
}
function blueskyDid(value, label = "Bluesky DID") {
  const result = string(value, label, 255);
  if (!didPattern.test(result))
    throw new Error(`${label} must be an exact DID`);
  return result;
}
function blueskyCid(value, label = "Bluesky CID") {
  const result = string(value, label, 201);
  if (!cidPattern.test(result))
    throw new Error(`${label} must be a CIDv1`);
  return result;
}
function parseBlueskyAtUri(value, label = "Bluesky AT URI", expectedCollection) {
  const uri = string(value, label, 1024);
  const match = /^at:\/\/([^/]+)\/([a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){2,})\/([^/]+)$/u.exec(uri);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    throw new Error(`${label} must be an exact record AT URI`);
  }
  const actor = blueskyDid(match[1], `${label} actor`);
  const collection = string(match[2], `${label} collection`, 255);
  if (expectedCollection !== undefined && collection !== expectedCollection)
    throw new Error(`${label} must identify ${expectedCollection}`);
  if (!rkeyPattern.test(match[3]))
    throw new Error(`${label} has an invalid record key`);
  return Object.freeze({ uri, actor, collection, rkey: match[3] });
}
function blueskyPostUri(value, label = "Bluesky post URI") {
  return parseBlueskyAtUri(value, label, "app.bsky.feed.post");
}
function exactHttpsOrigin(value, label) {
  const source = string(value, label, 2048);
  let url;
  try {
    url = new URL(source);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "")
    throw new Error(`${label} must be an exact canonical HTTPS origin`);
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "bsky.social" && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.host\.bsky\.network$/u.test(hostname))
    throw new Error(`${label} is outside the reviewed Bluesky PDS host allowlist`);
  return url.origin;
}
function decodeJwtPayload(token, label) {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]{1,8192}$/u.test(part)))
    throw new Error(`Bluesky ${label} token is not a bounded JWT`);
  let decoded;
  try {
    decoded = Buffer.from(parts[1], "base64url").toString("utf8");
  } catch {
    throw new Error(`Bluesky ${label} token payload is invalid`);
  }
  if (decoded.length < 2 || decoded.length > 16384) {
    throw new Error(`Bluesky ${label} token payload exceeded its reviewed bound`);
  }
  let value;
  try {
    value = JSON.parse(decoded);
  } catch {
    throw new Error(`Bluesky ${label} token payload is malformed`);
  }
  return record(value, `Bluesky ${label} token payload`);
}
function parseBlueskyBootstrapAccount(value, nowSeconds = Math.floor(Date.now() / 1000)) {
  const account = record(value, "Bluesky browser bootstrap account");
  exactKeys(account, ["did", "handle", "accessJwt", "refreshJwt", "service", "pdsUrl"], [], "Bluesky browser bootstrap account");
  const did = blueskyDid(account.did);
  const handle = string(account.handle, "Bluesky handle", 253);
  if (!handlePattern.test(handle))
    throw new Error("Bluesky handle is invalid");
  const accessJwt = string(account.accessJwt, "Bluesky access token", 24576);
  if (/[\s]/u.test(accessJwt))
    throw new Error("Bluesky access token is invalid");
  const refreshJwt = string(account.refreshJwt, "Bluesky refresh token", 24576);
  if (/[\s]/u.test(refreshJwt))
    throw new Error("Bluesky refresh token is invalid");
  const pdsOrigin = exactHttpsOrigin(account.pdsUrl ?? account.service, "Bluesky PDS origin");
  const accessClaims = decodeJwtPayload(accessJwt, "access");
  const refreshClaims = decodeJwtPayload(refreshJwt, "refresh");
  if (accessClaims.sub !== did)
    throw new Error("Bluesky access token subject did not match the selected account");
  if (refreshClaims.sub !== did)
    throw new Error("Bluesky refresh token subject did not match the selected account");
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0 || !Number.isSafeInteger(accessClaims.exp) || !Number.isSafeInteger(refreshClaims.exp))
    throw new Error("Bluesky session tokens lack a valid expiry");
  const accessExpiresAt = accessClaims.exp;
  const refreshExpiresAt = refreshClaims.exp;
  if (refreshExpiresAt <= nowSeconds)
    throw new Error("Bluesky refresh token is expired");
  return Object.freeze({
    did,
    handle,
    accessJwt,
    refreshJwt,
    accessExpiresAt,
    refreshExpiresAt,
    pdsOrigin
  });
}
function parseBlueskyRefreshSessionResponse(value, selected, nowSeconds = Math.floor(Date.now() / 1000)) {
  const session = record(value, "Bluesky refresh-session response");
  exactKeys(session, ["accessJwt", "refreshJwt", "handle", "did"], [
    "didDoc",
    "email",
    "emailConfirmed",
    "emailAuthFactor",
    "active",
    "status"
  ], "Bluesky refresh-session response");
  const did = blueskyDid(session.did, "Bluesky refreshed DID");
  if (did !== selected.did) {
    throw new Error("Bluesky refresh-session DID did not match the selected account");
  }
  const handle = string(session.handle, "Bluesky refreshed handle", 253);
  if (!handlePattern.test(handle))
    throw new Error("Bluesky refreshed handle is invalid");
  if (session.active === false || session.status !== undefined) {
    throw new Error("Bluesky refresh-session response reported an inactive account");
  }
  const accessJwt = string(session.accessJwt, "Bluesky refreshed access token", 24576);
  const refreshJwt = string(session.refreshJwt, "Bluesky rotated refresh token", 24576);
  if (/[\s]/u.test(accessJwt) || /[\s]/u.test(refreshJwt)) {
    throw new Error("Bluesky refresh-session response returned an invalid token");
  }
  const accessClaims = decodeJwtPayload(accessJwt, "access");
  const refreshClaims = decodeJwtPayload(refreshJwt, "refresh");
  if (accessClaims.sub !== did || refreshClaims.sub !== did) {
    throw new Error("Bluesky refreshed token subject did not match the selected account");
  }
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0 || !Number.isSafeInteger(accessClaims.exp) || !Number.isSafeInteger(refreshClaims.exp))
    throw new Error("Bluesky refreshed session tokens lack a valid expiry");
  const accessExpiresAt = accessClaims.exp;
  const refreshExpiresAt = refreshClaims.exp;
  if (accessExpiresAt <= nowSeconds || refreshExpiresAt <= nowSeconds) {
    throw new Error("Bluesky refresh-session response returned an expired token");
  }
  return Object.freeze({
    did,
    handle,
    accessJwt,
    refreshJwt,
    accessExpiresAt,
    refreshExpiresAt,
    pdsOrigin: selected.pdsOrigin
  });
}
var BLUESKY_XRPC_METHODS = Object.freeze({
  "com.atproto.server.getSession": "GET",
  "com.atproto.server.refreshSession": "POST",
  "com.atproto.server.getServiceAuth": "GET",
  "app.bsky.feed.getTimeline": "GET",
  "app.bsky.feed.getPosts": "GET",
  "app.bsky.feed.getPostThread": "GET",
  "app.bsky.notification.listNotifications": "GET",
  "app.bsky.bookmark.getBookmarks": "GET",
  "app.bsky.actor.getProfile": "GET",
  "chat.bsky.convo.listConvos": "GET",
  "chat.bsky.convo.getConvo": "GET",
  "chat.bsky.convo.getMessages": "GET",
  "com.atproto.repo.getRecord": "GET",
  "com.atproto.repo.createRecord": "POST",
  "com.atproto.repo.deleteRecord": "POST",
  "com.atproto.repo.uploadBlob": "POST",
  "app.bsky.bookmark.createBookmark": "POST",
  "app.bsky.bookmark.deleteBookmark": "POST",
  "chat.bsky.convo.sendMessage": "POST"
});
var BLUESKY_XRPC_PROXIES = Object.freeze({
  "com.atproto.server.getSession": null,
  "com.atproto.server.refreshSession": null,
  "com.atproto.server.getServiceAuth": null,
  "app.bsky.feed.getTimeline": BLUESKY_APPVIEW_PROXY,
  "app.bsky.feed.getPosts": BLUESKY_APPVIEW_PROXY,
  "app.bsky.feed.getPostThread": BLUESKY_APPVIEW_PROXY,
  "app.bsky.notification.listNotifications": BLUESKY_NOTIFICATION_PROXY,
  "app.bsky.bookmark.getBookmarks": BLUESKY_APPVIEW_PROXY,
  "app.bsky.actor.getProfile": BLUESKY_APPVIEW_PROXY,
  "chat.bsky.convo.listConvos": BLUESKY_CHAT_PROXY,
  "chat.bsky.convo.getConvo": BLUESKY_CHAT_PROXY,
  "chat.bsky.convo.getMessages": BLUESKY_CHAT_PROXY,
  "com.atproto.repo.getRecord": null,
  "com.atproto.repo.createRecord": null,
  "com.atproto.repo.deleteRecord": null,
  "com.atproto.repo.uploadBlob": null,
  "app.bsky.bookmark.createBookmark": BLUESKY_APPVIEW_PROXY,
  "app.bsky.bookmark.deleteBookmark": BLUESKY_APPVIEW_PROXY,
  "chat.bsky.convo.sendMessage": BLUESKY_CHAT_PROXY
});
function authorizeBlueskyXrpcRequest(input) {
  const pdsOrigin = exactHttpsOrigin(input.pdsOrigin, "Bluesky request PDS origin");
  const url = input.url instanceof URL ? new URL(input.url.href) : new URL(input.url);
  if (url.origin !== pdsOrigin || url.username !== "" || url.password !== "" || url.hash !== "" || url.pathname !== `/xrpc/${input.nsid}`)
    throw new Error("Bluesky request escaped its exact reviewed XRPC endpoint");
  const expectedMethod = BLUESKY_XRPC_METHODS[input.nsid];
  const method = input.method.toUpperCase();
  if (method !== expectedMethod)
    throw new Error("Bluesky request method changed from its reviewed contract");
  if (input.proxy !== BLUESKY_XRPC_PROXIES[input.nsid]) {
    throw new Error("Bluesky request proxy changed from its reviewed contract");
  }
  const expectsBody = method === "POST" && input.nsid !== "com.atproto.server.refreshSession";
  if (input.hasBody !== expectsBody) {
    throw new Error("Bluesky request body did not match its reviewed method");
  }
  const actual = new Map;
  for (const [name, value] of url.searchParams) {
    const values = actual.get(name) ?? [];
    values.push(value);
    actual.set(name, values);
  }
  const expectedNames = Object.keys(input.expectedQuery).sort();
  if ([...actual.keys()].sort().join("\x00") !== expectedNames.join("\x00"))
    throw new Error("Bluesky request query names changed from their reviewed contract");
  for (const name of expectedNames) {
    const expectedValues = input.expectedQuery[name] ?? [];
    const actualValues = actual.get(name) ?? [];
    if (expectedValues.length !== actualValues.length || expectedValues.some((value, index) => actualValues[index] !== value))
      throw new Error(`Bluesky request query value ${name} changed from its reviewed contract`);
  }
  return Object.freeze({
    nsid: input.nsid,
    method,
    path: url.pathname,
    queryNames: Object.freeze(expectedNames),
    proxy: input.proxy
  });
}
function authorizeBlueskyVideoRequest(input) {
  const url = input.url instanceof URL ? new URL(input.url.href) : new URL(input.url);
  if (url.origin !== BLUESKY_VIDEO_SERVICE_ORIGIN || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error("Bluesky video request escaped its exact reviewed service origin");
  const expected = input.kind === "upload" ? {
    method: "POST",
    path: "/xrpc/app.bsky.video.uploadVideo",
    query: Object.freeze({
      did: [blueskyDid(input.did, "Bluesky video upload DID")],
      name: ["wrench-video.mp4"]
    })
  } : {
    method: "GET",
    path: "/xrpc/app.bsky.video.getJobStatus",
    query: Object.freeze({
      jobId: [string(input.jobId, "Bluesky video job ID", 1024)]
    })
  };
  const method = input.method.toUpperCase();
  if (method !== expected.method || url.pathname !== expected.path) {
    throw new Error("Bluesky video request changed from its reviewed route");
  }
  const actual = new Map;
  for (const [name, value] of url.searchParams) {
    const values = actual.get(name) ?? [];
    values.push(value);
    actual.set(name, values);
  }
  const expectedNames = Object.keys(expected.query).sort();
  if ([...actual.keys()].sort().join("\x00") !== expectedNames.join("\x00")) {
    throw new Error("Bluesky video request query names changed from their reviewed contract");
  }
  for (const name of expectedNames) {
    const expectedValues = expected.query[name] ?? [];
    const actualValues = actual.get(name) ?? [];
    if (expectedValues.length !== actualValues.length || expectedValues.some((value, index) => actualValues[index] !== value))
      throw new Error(`Bluesky video request query value ${name} changed from its reviewed contract`);
  }
  return Object.freeze({
    method,
    path: expected.path,
    queryNames: Object.freeze(expectedNames)
  });
}
function parseBlueskyServiceAuthResponse(value, expected) {
  const response = record(value, "Bluesky service-auth response");
  exactKeys(response, ["token"], [], "Bluesky service-auth response");
  const token = string(response.token, "Bluesky service-auth token", 24576);
  if (/\s/u.test(token))
    throw new Error("Bluesky service-auth token is invalid");
  const claims = decodeJwtPayload(token, "service-auth");
  const did = blueskyDid(expected.did, "Bluesky service-auth expected issuer");
  const audience = blueskyDid(expected.audience, "Bluesky service-auth expected audience");
  if (claims.iss !== did || claims.aud !== audience || claims.lxm !== expected.lxm)
    throw new Error("Bluesky service-auth token changed its exact issuer, audience, or method binding");
  if (!Number.isSafeInteger(expected.nowSeconds) || !Number.isSafeInteger(expected.expiresAt) || expected.nowSeconds < 0 || expected.expiresAt <= expected.nowSeconds || expected.expiresAt - expected.nowSeconds > 1800 || claims.exp !== expected.expiresAt)
    throw new Error("Bluesky service-auth token changed its reviewed expiry");
  return token;
}
function blueskyStrongRef(value, label, expectedUri) {
  const candidate = record(value, label);
  const uri = blueskyPostUri(candidate.uri, `${label}.uri`).uri;
  if (expectedUri !== undefined && uri !== expectedUri) {
    throw new Error(`${label} did not match the expected post`);
  }
  return Object.freeze({
    uri,
    cid: blueskyCid(candidate.cid, `${label}.cid`)
  });
}
function aspectRatio(value, label) {
  if (value === undefined || value === null)
    return null;
  const ratio = record(value, label);
  return Object.freeze({
    width: integer(ratio.width, `${label}.width`, 1, 1e5),
    height: integer(ratio.height, `${label}.height`, 1, 1e5)
  });
}
function blobCid(value, label) {
  if (!isRecord(value))
    return null;
  const ref = isRecord(value.ref) ? value.ref : null;
  if (ref === null || ref.$link === undefined)
    return null;
  return blueskyCid(ref.$link, `${label}.ref`);
}
function projectBlueskyAttachments(value) {
  if (value === undefined || value === null)
    return Object.freeze([]);
  const embed = record(value, "Bluesky post embed");
  const type = optionalString(embed.$type, "Bluesky post embed type", 128);
  const results = [];
  const addMedia = (candidate) => {
    const media = record(candidate, "Bluesky media embed");
    const mediaType = optionalString(media.$type, "Bluesky media embed type", 128);
    if (mediaType?.includes("images")) {
      for (const item of boundedArray(media.images, "Bluesky image list")) {
        const image = record(item, "Bluesky image");
        results.push(Object.freeze({
          kind: "image",
          alt: optionalString(image.alt, "Bluesky image alt", 1e4),
          cid: blobCid(image.image, "Bluesky image blob"),
          recordUri: null,
          aspectRatio: aspectRatio(image.aspectRatio, "Bluesky image aspect ratio")
        }));
      }
    } else if (mediaType?.includes("video")) {
      results.push(Object.freeze({
        kind: "video",
        alt: optionalString(media.alt, "Bluesky video alt", 1e4),
        cid: optionalString(media.cid, "Bluesky video CID", 201) === null ? blobCid(media.video, "Bluesky video blob") : blueskyCid(media.cid, "Bluesky video CID"),
        recordUri: null,
        aspectRatio: aspectRatio(media.aspectRatio, "Bluesky video aspect ratio")
      }));
    } else if (mediaType?.includes("external")) {
      results.push(Object.freeze({
        kind: "external",
        alt: optionalString(isRecord(media.external) ? media.external.description : media.description, "Bluesky external description", 1e4),
        cid: null,
        recordUri: null,
        aspectRatio: null
      }));
    }
  };
  if (type?.includes("recordWithMedia")) {
    addMedia(embed.media);
    results.push(Object.freeze({
      kind: "record",
      alt: null,
      cid: null,
      recordUri: isRecord(embed.record) && typeof embed.record.uri === "string" ? blueskyPostUri(embed.record.uri, "Bluesky embedded record URI").uri : null,
      aspectRatio: null
    }));
  } else if (type?.includes("record")) {
    results.push(Object.freeze({
      kind: "record",
      alt: null,
      cid: null,
      recordUri: isRecord(embed.record) && typeof embed.record.uri === "string" ? blueskyPostUri(embed.record.uri, "Bluesky embedded record URI").uri : typeof embed.uri === "string" ? blueskyPostUri(embed.uri, "Bluesky embedded record URI").uri : null,
      aspectRatio: null
    }));
  } else {
    addMedia(embed);
  }
  if (results.length > 4)
    throw new Error("Bluesky post embed exceeded the reviewed attachment limit");
  return Object.freeze(results);
}
function projectBlueskyPost(value, expectedUri) {
  const post = record(value, "Bluesky post");
  const uri = blueskyPostUri(post.uri).uri;
  if (expectedUri !== undefined && uri !== expectedUri) {
    throw new Error("Bluesky post response did not bind the requested post");
  }
  const author = record(post.author, "Bluesky post author");
  const authorDid = blueskyDid(author.did, "Bluesky post author DID");
  if (blueskyPostUri(uri).actor !== authorDid) {
    throw new Error("Bluesky post author did not match its AT URI");
  }
  const handle = string(author.handle, "Bluesky post author handle", 253);
  if (!handlePattern.test(handle))
    throw new Error("Bluesky post author handle is invalid");
  const postRecord = record(post.record, "Bluesky post record");
  if (postRecord.$type !== "app.bsky.feed.post") {
    throw new Error("Bluesky post record had an unexpected type");
  }
  const replyRecord = postRecord.reply;
  const reply = replyRecord === undefined ? null : (() => {
    const refs = record(replyRecord, "Bluesky reply reference");
    return Object.freeze({
      root: blueskyStrongRef(refs.root, "Bluesky reply root"),
      parent: blueskyStrongRef(refs.parent, "Bluesky reply parent")
    });
  })();
  const recordEmbed = isRecord(postRecord.embed) ? postRecord.embed : null;
  const quoteCandidate = recordEmbed?.$type === "app.bsky.embed.record" ? recordEmbed.record : recordEmbed?.$type === "app.bsky.embed.recordWithMedia" && isRecord(recordEmbed.record) ? recordEmbed.record.record : undefined;
  const quote = quoteCandidate === undefined ? null : blueskyStrongRef(quoteCandidate, "Bluesky quoted record");
  const viewer = isRecord(post.viewer) ? post.viewer : {};
  const like = optionalString(viewer.like, "Bluesky viewer like URI", 1024);
  const repost = optionalString(viewer.repost, "Bluesky viewer repost URI", 1024);
  if (like !== null)
    parseBlueskyAtUri(like, "Bluesky viewer like URI", "app.bsky.feed.like");
  if (repost !== null)
    parseBlueskyAtUri(repost, "Bluesky viewer repost URI", "app.bsky.feed.repost");
  return Object.freeze({
    uri,
    cid: blueskyCid(post.cid),
    author: Object.freeze({
      did: authorDid,
      handle,
      displayName: optionalString(author.displayName, "Bluesky author display name", 1000)
    }),
    text: string(postRecord.text, "Bluesky post text", 3000, true),
    createdAt: string(postRecord.createdAt, "Bluesky post creation time", 128),
    indexedAt: string(post.indexedAt, "Bluesky post index time", 128),
    reply,
    quote,
    counts: Object.freeze({
      replies: nullableInteger(post.replyCount, "Bluesky reply count"),
      reposts: nullableInteger(post.repostCount, "Bluesky repost count"),
      likes: nullableInteger(post.likeCount, "Bluesky like count"),
      quotes: nullableInteger(post.quoteCount, "Bluesky quote count")
    }),
    viewer: Object.freeze({
      like,
      repost,
      bookmarked: viewer.bookmarked === true
    }),
    attachments: projectBlueskyAttachments(post.embed)
  });
}
function projectBlueskyPostsResponse(value, expectedUri) {
  const response = record(value, "Bluesky getPosts response");
  const posts = boundedArray(response.posts, "Bluesky getPosts posts");
  if (posts.length !== 1)
    throw new Error("Bluesky getPosts response did not contain one exact post");
  return projectBlueskyPost(posts[0], expectedUri);
}
function projectBlueskyFeed(value, limit) {
  const response = record(value, "Bluesky timeline response");
  const feed = boundedArray(response.feed, "Bluesky timeline feed");
  const posts = feed.slice(0, limit).map((item) => projectBlueskyPost(record(item, "Bluesky timeline item").post));
  return Object.freeze({
    posts: Object.freeze(posts),
    cursor: optionalString(response.cursor, "Bluesky timeline cursor", 8192),
    truncated: feed.length > limit || response.cursor !== undefined
  });
}
function projectBlueskyNotifications(value, limit) {
  const response = record(value, "Bluesky notifications response");
  const source = boundedArray(response.notifications, "Bluesky notifications");
  const notifications = source.slice(0, limit).map((item) => {
    const notification = record(item, "Bluesky notification");
    const author = record(notification.author, "Bluesky notification author");
    const uri = string(notification.uri, "Bluesky notification URI", 1024);
    parseBlueskyAtUri(uri, "Bluesky notification URI");
    const reasonSubject = optionalString(notification.reasonSubject, "Bluesky notification subject", 1024);
    if (reasonSubject !== null)
      parseBlueskyAtUri(reasonSubject, "Bluesky notification subject");
    return Object.freeze({
      uri,
      cid: blueskyCid(notification.cid, "Bluesky notification CID"),
      author: Object.freeze({
        did: blueskyDid(author.did, "Bluesky notification author DID"),
        handle: string(author.handle, "Bluesky notification author handle", 253),
        displayName: optionalString(author.displayName, "Bluesky notification author display name", 1000)
      }),
      reason: string(notification.reason, "Bluesky notification reason", 64),
      reasonSubject,
      isRead: boolean(notification.isRead, "Bluesky notification read state"),
      indexedAt: string(notification.indexedAt, "Bluesky notification index time", 128)
    });
  });
  return Object.freeze({
    notifications: Object.freeze(notifications),
    cursor: optionalString(response.cursor, "Bluesky notifications cursor", 8192),
    seenAt: optionalString(response.seenAt, "Bluesky notifications seen time", 128),
    truncated: source.length > limit || response.cursor !== undefined
  });
}
function projectBlueskyBookmarks(value, limit) {
  const response = record(value, "Bluesky bookmarks response");
  const source = boundedArray(response.bookmarks, "Bluesky bookmarks");
  const posts = source.slice(0, limit).map((item) => {
    const bookmark = record(item, "Bluesky bookmark");
    const subject = blueskyStrongRef(bookmark.subject, "Bluesky bookmark subject");
    return projectBlueskyPost(bookmark.item, subject.uri);
  });
  return Object.freeze({
    posts: Object.freeze(posts),
    cursor: optionalString(response.cursor, "Bluesky bookmarks cursor", 8192),
    truncated: source.length > limit || response.cursor !== undefined
  });
}
function projectBlueskyThread(value, expectedUri, limit) {
  const response = record(value, "Bluesky thread response");
  const root = record(response.thread, "Bluesky thread");
  const post = projectBlueskyPost(root.post, expectedUri);
  const replies = [];
  const stack = [];
  if (root.replies !== undefined) {
    for (const item of [...boundedArray(root.replies, "Bluesky thread replies")].reverse()) {
      stack.push({ value: item, depth: 1 });
    }
  }
  let visited = 0;
  while (stack.length > 0) {
    const next = stack.pop();
    visited += 1;
    if (visited > MAX_RESPONSE_ITEMS || next.depth > 100) {
      throw new Error("Bluesky thread exceeded its reviewed traversal bounds");
    }
    const item = record(next.value, "Bluesky thread reply");
    if (item.post === undefined)
      continue;
    replies.push(projectBlueskyPost(item.post));
    if (item.replies !== undefined) {
      for (const child of [...boundedArray(item.replies, "Bluesky nested replies")].reverse()) {
        stack.push({ value: child, depth: next.depth + 1 });
      }
    }
  }
  return Object.freeze({
    post,
    replies: Object.freeze(replies.slice(0, limit)),
    truncated: replies.length > limit
  });
}
function exactObservationTime(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error(`${label} must be an exact UTC observation time`);
  return value;
}
function exactCountMetric(value, label) {
  return Object.freeze({
    status: "available",
    value: integer(value, label),
    precision: "exact",
    unit: "count"
  });
}
function projectBlueskyProfileStats(value, expectedHandle, observedAt) {
  if (!handlePattern.test(expectedHandle) || expectedHandle !== expectedHandle.toLowerCase()) {
    throw new Error("Bluesky profile target must be one canonical lowercase handle");
  }
  const profile = record(value, "Bluesky profile stats");
  const handle = string(profile.handle, "Bluesky profile stats handle", 253).toLowerCase();
  if (!handlePattern.test(handle) || handle !== expectedHandle) {
    throw new Error("Bluesky profile stats response did not bind the requested handle");
  }
  const did = blueskyDid(profile.did, "Bluesky profile stats DID");
  const url = `https://bsky.app/profile/${handle}`;
  return Object.freeze({
    schemaVersion: 1,
    provider: "bluesky",
    target: Object.freeze({ kind: "profile", id: did, url }),
    observedAt: exactObservationTime(observedAt, "Bluesky profile stats observedAt"),
    completeness: "complete",
    metrics: Object.freeze({
      followers: exactCountMetric(profile.followersCount, "Bluesky followersCount"),
      following: exactCountMetric(profile.followsCount, "Bluesky followsCount"),
      posts: exactCountMetric(profile.postsCount, "Bluesky postsCount")
    }),
    metadata: Object.freeze({
      handle,
      displayName: optionalString(profile.displayName, "Bluesky profile stats display name", 1000),
      bio: optionalString(profile.description, "Bluesky profile stats description", 1e4)
    })
  });
}
function projectBlueskyProfile(value, expectedDid) {
  const profile = record(value, "Bluesky profile");
  const did = blueskyDid(profile.did, "Bluesky profile DID");
  if (did !== expectedDid)
    throw new Error("Bluesky profile response did not bind the requested actor");
  const viewer = isRecord(profile.viewer) ? profile.viewer : {};
  const following = optionalString(viewer.following, "Bluesky following URI", 1024);
  const followedBy = optionalString(viewer.followedBy, "Bluesky followed-by URI", 1024);
  if (following !== null)
    parseBlueskyAtUri(following, "Bluesky following URI", "app.bsky.graph.follow");
  if (followedBy !== null)
    parseBlueskyAtUri(followedBy, "Bluesky followed-by URI", "app.bsky.graph.follow");
  const handle = string(profile.handle, "Bluesky profile handle", 253);
  if (!handlePattern.test(handle))
    throw new Error("Bluesky profile handle is invalid");
  return Object.freeze({
    did,
    handle,
    displayName: optionalString(profile.displayName, "Bluesky profile display name", 1000),
    following,
    followedBy
  });
}
function projectBlueskyMessage(value) {
  const message = record(value, "Bluesky chat message");
  const sender = isRecord(message.sender) ? message.sender : null;
  const text = optionalString(message.text, "Bluesky chat message text", 1e4);
  return Object.freeze({
    id: string(message.id, "Bluesky chat message ID", 512),
    rev: string(message.rev, "Bluesky chat message revision", 512),
    senderDid: sender === null ? null : blueskyDid(sender.did, "Bluesky chat sender DID"),
    text,
    sentAt: string(message.sentAt, "Bluesky chat sent time", 128),
    deleted: text === null && sender !== null,
    system: text === null && sender === null
  });
}
function projectBlueskyConvo(value, viewerDid, expectedId) {
  const convo = record(value, "Bluesky conversation");
  const id = string(convo.id, "Bluesky conversation ID", 512);
  if (expectedId !== undefined && id !== expectedId) {
    throw new Error("Bluesky conversation response did not bind the requested conversation");
  }
  const members = boundedArray(convo.members, "Bluesky conversation members").map((item) => {
    const member = record(item, "Bluesky conversation member");
    const handle = string(member.handle, "Bluesky conversation member handle", 253);
    if (!handlePattern.test(handle))
      throw new Error("Bluesky conversation member handle is invalid");
    return Object.freeze({
      did: blueskyDid(member.did, "Bluesky conversation member DID"),
      handle,
      displayName: optionalString(member.displayName, "Bluesky conversation member display name", 1000)
    });
  });
  if (!members.some((member) => member.did === viewerDid)) {
    throw new Error("Bluesky conversation did not include the bound viewer");
  }
  return Object.freeze({
    id,
    rev: string(convo.rev, "Bluesky conversation revision", 512),
    members: Object.freeze(members),
    muted: boolean(convo.muted, "Bluesky conversation muted state"),
    unreadCount: integer(convo.unreadCount, "Bluesky conversation unread count"),
    status: optionalString(convo.status, "Bluesky conversation status", 64),
    lastMessage: convo.lastMessage === undefined ? null : projectBlueskyMessage(convo.lastMessage)
  });
}
function projectBlueskyConvoList(value, viewerDid, limit) {
  const response = record(value, "Bluesky conversation list");
  const source = boundedArray(response.convos, "Bluesky conversations");
  return Object.freeze({
    conversations: Object.freeze(source.slice(0, limit).map((item) => projectBlueskyConvo(item, viewerDid))),
    cursor: optionalString(response.cursor, "Bluesky conversation cursor", 8192),
    truncated: source.length > limit || response.cursor !== undefined
  });
}
function projectBlueskyMessages(value, limit) {
  const response = record(value, "Bluesky message list");
  const source = boundedArray(response.messages, "Bluesky messages");
  return Object.freeze({
    messages: Object.freeze(source.slice(0, limit).map(projectBlueskyMessage)),
    cursor: optionalString(response.cursor, "Bluesky message cursor", 8192),
    truncated: source.length > limit || response.cursor !== undefined
  });
}
function parseBlueskySessionResponse(value) {
  const session = record(value, "Bluesky getSession response");
  const handle = string(session.handle, "Bluesky session handle", 253);
  if (!handlePattern.test(handle))
    throw new Error("Bluesky session handle is invalid");
  return Object.freeze({
    did: blueskyDid(session.did, "Bluesky session DID"),
    handle,
    active: session.active !== false
  });
}
function parseBlueskyCreateRecordResponse(value, actorDid, collection) {
  const response = record(value, "Bluesky createRecord response");
  const parsed = parseBlueskyAtUri(response.uri, "Bluesky created record URI", collection);
  if (parsed.actor !== actorDid)
    throw new Error("Bluesky created record actor did not match the bound viewer");
  return Object.freeze({
    uri: parsed.uri,
    cid: blueskyCid(response.cid, "Bluesky created record CID")
  });
}
function parseBlueskyGetRecordResponse(value, expected, expectedValue) {
  const response = record(value, "Bluesky getRecord response");
  exactKeys(response, ["uri", "cid", "value"], [], "Bluesky getRecord response");
  const actual = blueskyStrongRef(response, "Bluesky getRecord response", expected.uri);
  if (actual.cid !== expected.cid) {
    throw new Error("Bluesky getRecord response changed the created record CID");
  }
  const recordValue = record(response.value, "Bluesky getRecord response.value");
  if (canonicalJson(recordValue) !== canonicalJson(expectedValue)) {
    throw new Error("Bluesky getRecord response did not bind the confirmed record value");
  }
  return actual;
}
function parseBlueskyCurrentPostRecordResponse(value, expectedUri, expectedCid) {
  const parsedUri = blueskyPostUri(expectedUri, "Bluesky deletion target URI");
  const response = record(value, "Bluesky deletion pre-read response");
  exactKeys(response, ["uri", "cid", "value"], [], "Bluesky deletion pre-read response");
  const actual = blueskyStrongRef(response, "Bluesky deletion pre-read response", parsedUri.uri);
  if (actual.cid !== blueskyCid(expectedCid, "Bluesky deletion target CID")) {
    throw new Error("Bluesky deletion target revision changed from the confirmed CID");
  }
  const recordValue = record(response.value, "Bluesky deletion pre-read response.value");
  if (recordValue.$type !== "app.bsky.feed.post") {
    throw new Error("Bluesky deletion target was not an app.bsky.feed.post record");
  }
  return actual;
}
function parseBlueskyRecordNotFoundResponse(value) {
  const response = record(value, "Bluesky RecordNotFound response");
  exactKeys(response, ["error", "message"], [], "Bluesky RecordNotFound response");
  if (response.error !== "RecordNotFound") {
    throw new Error("Bluesky record absence response used an unexpected error code");
  }
  string(response.message, "Bluesky RecordNotFound response.message", 1024);
}
function parseBlueskyDeleteRecordResponse(value) {
  const response = record(value, "Bluesky deleteRecord response");
  exactKeys(response, [], ["commit"], "Bluesky deleteRecord response");
  if (response.commit === undefined)
    return Object.freeze({ commit: null });
  const commit = record(response.commit, "Bluesky deleteRecord response.commit");
  exactKeys(commit, ["cid", "rev"], [], "Bluesky deleteRecord response.commit");
  const rev = string(commit.rev, "Bluesky deleteRecord response.commit.rev", 64);
  if (!/^[234567abcdefghijklmnopqrstuvwxyz]{13}$/u.test(rev)) {
    throw new Error("Bluesky deleteRecord response.commit.rev must be a TID");
  }
  return Object.freeze({
    commit: Object.freeze({
      cid: blueskyCid(commit.cid, "Bluesky deleteRecord response.commit.cid"),
      rev
    })
  });
}
function blueskyBlobRef(value, label, expectedMimeType, maximumSize, expectedSize) {
  const blob = record(value, label);
  exactKeys(blob, ["$type", "ref", "mimeType", "size"], [], label);
  if (blob.$type !== "blob")
    throw new Error(`${label} had an unexpected type`);
  const ref = record(blob.ref, `${label} reference`);
  exactKeys(ref, ["$link"], [], `${label} reference`);
  const mimeType = string(blob.mimeType, `${label} media type`, 128);
  const size = integer(blob.size, `${label} size`, 1, maximumSize);
  if (mimeType !== expectedMimeType || expectedSize !== undefined && size !== expectedSize)
    throw new Error(`${label} did not match the confirmed file`);
  return Object.freeze({
    $type: "blob",
    ref: Object.freeze({ $link: blueskyCid(ref.$link, `${label} CID`) }),
    mimeType,
    size
  });
}
function parseBlueskyUploadBlobResponse(value, expectedMimeType, expectedSize) {
  const response = record(value, "Bluesky uploadBlob response");
  exactKeys(response, ["blob"], [], "Bluesky uploadBlob response");
  return blueskyBlobRef(response.blob, "Bluesky uploaded blob", expectedMimeType, 100 * 1024 * 1024, expectedSize);
}
var BLUESKY_VIDEO_JOB_STATES = Object.freeze([
  "JOB_STATE_CREATED",
  "JOB_STATE_ENCODING",
  "JOB_STATE_ENCODED",
  "JOB_STATE_SCANNING",
  "JOB_STATE_SCANNED",
  "JOB_STATE_UPLOADING",
  "JOB_STATE_UPLOADED",
  "JOB_STATE_COMPLETED",
  "JOB_STATE_FAILED"
]);
function blueskyVideoJobStatus(value, expectedDid, expectedJobId) {
  const status = record(value, "Bluesky video job status");
  exactKeys(status, ["jobId", "did", "state"], ["progress", "blob", "error", "failureCode", "message"], "Bluesky video job status");
  const jobId = string(status.jobId, "Bluesky video job ID", 1024);
  if (expectedJobId !== undefined && jobId !== expectedJobId) {
    throw new Error("Bluesky video job response switched jobs");
  }
  const did = blueskyDid(status.did, "Bluesky video job DID");
  if (did !== blueskyDid(expectedDid, "Bluesky expected video job DID")) {
    throw new Error("Bluesky video job response switched accounts");
  }
  const rawState = string(status.state, "Bluesky video job state", 64);
  if (!BLUESKY_VIDEO_JOB_STATES.includes(rawState)) {
    throw new Error("Bluesky video job returned an unreviewed state");
  }
  const state = rawState;
  const progress = status.progress === undefined ? null : integer(status.progress, "Bluesky video job progress", 0, 100);
  const blob = status.blob === undefined ? null : blueskyBlobRef(status.blob, "Bluesky processed video blob", "video/mp4", 1e8);
  if (state === "JOB_STATE_COMPLETED" !== (blob !== null)) {
    throw new Error("Bluesky video job completion did not bind one processed blob");
  }
  return Object.freeze({
    jobId,
    did,
    state,
    progress,
    blob,
    error: status.error === undefined ? null : string(status.error, "Bluesky video job error", 2048),
    failureCode: status.failureCode === undefined ? null : string(status.failureCode, "Bluesky video job failure code", 256),
    message: status.message === undefined ? null : string(status.message, "Bluesky video job message", 2048)
  });
}
function parseBlueskyVideoUploadResponse(value, expectedDid) {
  return blueskyVideoJobStatus(value, expectedDid);
}
function parseBlueskyVideoJobStatusResponse(value, expectedDid, expectedJobId) {
  const response = record(value, "Bluesky video getJobStatus response");
  exactKeys(response, ["jobStatus"], [], "Bluesky video getJobStatus response");
  return blueskyVideoJobStatus(response.jobStatus, expectedDid, expectedJobId);
}
function assertBlueskyText(value, label, maximumCodePoints, maximumCodeUnits) {
  const text = string(value, label, maximumCodeUnits);
  if (Array.from(text).length > maximumCodePoints) {
    throw new Error(`${label} exceeded ${maximumCodePoints} Unicode code points`);
  }
  return text;
}

// src/providers/bluesky-web-runtime.ts
var MAX_BOOTSTRAP_BYTES = 64 * 1024;
var MAX_READ_BYTES = 8 * 1024 * 1024;
var MAX_IMAGE_BYTES = 2000000;
var MAX_VIDEO_BYTES = 1e8;
var BLUESKY_PUBLIC_APPVIEW_ORIGIN = "https://public.api.bsky.app";
var DEFAULT_LIMIT = 25;
var WEB_SESSION_OPERATION_LABEL = "authenticated web operation deadline";
var PUBLISH_READBACK_DELAYS_MS = Object.freeze([0, 250, 750, 1500]);
var VIDEO_PROCESSING_DELAYS_MS = Object.freeze([
  1000,
  1000,
  2000,
  2000,
  4000,
  4000,
  8000,
  8000,
  1e4,
  1e4,
  15000,
  15000,
  20000,
  20000,
  30000,
  30000,
  30000,
  30000,
  30000
]);
var BLUESKY_RECORD_NOT_FOUND = Symbol("bluesky-record-not-found");
function remainingTimeoutMs(timeoutMs, deadline) {
  deadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const remaining = Math.min(timeoutMs, deadline?.remainingTimeMs() ?? timeoutMs);
  if (remaining < 1) {
    throw new Error("Bluesky authenticated web operation timed out");
  }
  return remaining;
}
var blueskyBootstrapManifest = Object.freeze({
  schemaVersion: 2,
  id: "wrench-bluesky-session-bootstrap",
  version: "1.0.0",
  displayName: "Ghostget Bluesky session bootstrap",
  origins: Object.freeze([BLUESKY_APP_ORIGIN]),
  browserDomains: Object.freeze(["bsky.app"]),
  operations: Object.freeze({})
});
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record2(value, label) {
  if (!isRecord2(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function isBlueskyOperation(value) {
  return BLUESKY_WEB_OPERATION_NAMES.includes(value);
}
function inputString(input, name, maximum) {
  const value = input[name];
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`input.${name} must be bounded text`);
  return value;
}
function optionalInputString(input, name, maximum) {
  if (input[name] === undefined)
    return;
  return inputString(input, name, maximum);
}
function inputBoolean(input, name) {
  const value = input[name];
  if (typeof value !== "boolean")
    throw new Error(`input.${name} must be boolean`);
  return value;
}
function inputInteger(input, name, fallback, minimum, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  return value;
}
function optionalCursor(input) {
  return optionalInputString(input, "cursor", 8192);
}
function postUriInput(input) {
  return blueskyPostUri(inputString(input, "post_uri", 1024), "input.post_uri").uri;
}
function convoIdInput(input) {
  const result = inputString(input, "convo_id", 512);
  if (!/^[A-Za-z0-9._~:-]{1,512}$/u.test(result)) {
    throw new Error("input.convo_id must be an exact Bluesky conversation ID");
  }
  return result;
}
function browserEvaluationSource() {
  return `(()=>{if(location.origin!=="${BLUESKY_APP_ORIGIN}")throw new Error("unexpected Bluesky origin");const raw=localStorage.getItem("BSKY_STORAGE");if(typeof raw!=="string"||raw.length<2||raw.length>1048576)throw new Error("Bluesky storage unavailable");const root=JSON.parse(raw);const session=root&&typeof root==="object"&&root.session;const current=session&&typeof session==="object"&&session.currentAccount;const accounts=session&&typeof session==="object"&&session.accounts;if(!current||typeof current.did!=="string"||!Array.isArray(accounts)||accounts.length>100)throw new Error("Bluesky current account unavailable");const matches=accounts.filter(account=>account&&typeof account==="object"&&account.did===current.did);if(matches.length!==1)throw new Error("Bluesky current account ambiguous");const account=matches[0];return{did:account.did,handle:account.handle,accessJwt:account.accessJwt,refreshJwt:account.refreshJwt,service:account.service,pdsUrl:typeof account.pdsUrl==="string"?account.pdsUrl:null}})()`;
}
function bootstrapEvaluationResult(value) {
  if (!isRecord2(value))
    throw new Error("Bluesky browser bootstrap returned a malformed envelope");
  let observedOrigin = null;
  if (typeof value.origin === "string") {
    try {
      observedOrigin = new URL(value.origin).origin;
    } catch {
      observedOrigin = null;
    }
  }
  if (observedOrigin !== BLUESKY_APP_ORIGIN) {
    throw new Error("Bluesky browser bootstrap escaped its reviewed origin");
  }
  return value.result;
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
  return Object.freeze({
    closeVerified,
    cleanupVerified,
    failures: Object.freeze(failures)
  });
}
async function bootstrapFromBrowser(auth, timeoutMs, dependencies, operationDeadline, publishCleanupResource) {
  if (auth.kind !== "browser-profile") {
    throw new Error("Bluesky storage bootstrap requires bound browser-profile auth");
  }
  const storageAuth = {
    schemaVersion: 1,
    id: auth.id,
    kind: "browser-profile",
    profile: auth.profile,
    trustUnfilteredEgress: true,
    ...auth.browserExecutable === undefined ? {} : { browserExecutable: auth.browserExecutable },
    ...auth.subject === undefined ? {} : { subject: auth.subject }
  };
  const createSession = dependencies?.createBrowserSession ?? createBrowserSession;
  const createTimeoutMs = remainingTimeoutMs(timeoutMs, operationDeadline);
  const session = await createSession(blueskyBootstrapManifest, storageAuth, {
    headed: false,
    timeoutMs: createTimeoutMs,
    maxOutputBytes: MAX_BOOTSTRAP_BYTES,
    allowCodeOwnedEvaluation: true,
    ...operationDeadline === undefined ? {} : { operationDeadline },
    ...publishCleanupResource === undefined ? {} : { publishCleanupResource }
  });
  let result;
  let failure;
  try {
    await session.runBatch([["open", `${BLUESKY_APP_ORIGIN}/robots.txt`]], remainingTimeoutMs(timeoutMs, operationDeadline), MAX_BOOTSTRAP_BYTES);
    const [urlEntry] = await session.runBatch([["get", "url"]], remainingTimeoutMs(timeoutMs, operationDeadline), MAX_BOOTSTRAP_BYTES);
    const urlData = urlEntry === undefined ? null : browserResultData(urlEntry);
    const currentUrl = isRecord2(urlData) && typeof urlData.url === "string" ? new URL(urlData.url) : null;
    if (currentUrl?.origin !== BLUESKY_APP_ORIGIN) {
      throw new Error("Bluesky browser bootstrap did not reach its reviewed origin");
    }
    const [evaluationEntry] = await session.runBatch([["eval", browserEvaluationSource()]], remainingTimeoutMs(timeoutMs, operationDeadline), MAX_BOOTSTRAP_BYTES);
    if (evaluationEntry === undefined) {
      throw new Error("Bluesky browser bootstrap omitted its evaluation result");
    }
    result = bootstrapEvaluationResult(browserResultData(evaluationEntry));
  } catch (error) {
    failure = error;
  }
  const finalization = await finalizeBrowserSession(session);
  if (!finalization.closeVerified || !finalization.cleanupVerified) {
    const cleanupEvidence = finalization.closeVerified && !finalization.cleanupVerified && session.cleanupResourceIdentity !== undefined ? Object.freeze({
      kind: "agent-browser-closed-artifacts-v1",
      resource: session.cleanupResourceIdentity
    }) : undefined;
    throw new PreservedBrowserArtifactsError("Bluesky browser bootstrap finalization failed; private artifacts were preserved", session.recoveryHandle ?? "session=bluesky-bootstrap;artifacts=unknown", new AggregateError([
      ...failure === undefined ? [] : [failure],
      ...finalization.failures
    ], "Bluesky browser bootstrap finalization failed"), cleanupEvidence);
  }
  if (failure !== undefined) {
    throw failure instanceof Error ? failure : new Error("Bluesky browser bootstrap failed");
  }
  return result;
}
async function loadBlueskySessionSnapshot(auth, authHash, dependencies) {
  if (dependencies?.loadCachedSession !== undefined) {
    return {
      enabled: true,
      snapshot: await dependencies.loadCachedSession(auth, authHash)
    };
  }
  if (dependencies?.bootstrapAccount !== undefined) {
    return {
      enabled: false,
      snapshot: Object.freeze({ value: null, contentSha256: null })
    };
  }
  return {
    enabled: true,
    snapshot: readSessionSecretSnapshot("bluesky", auth.id, authHash)
  };
}
async function selectedSession(auth, timeoutMs, dependencies, operationDeadline, registerCleanupBarrier) {
  if (auth.kind !== "browser-profile") {
    throw new Error("Bluesky authenticated API requires browser-profile auth");
  }
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (dependencies?.loadCachedSession === undefined !== (dependencies?.saveCachedSession === undefined)) {
    throw new Error("Bluesky rotating-session cache dependencies must be provided together");
  }
  const nowSeconds = Math.floor((dependencies?.now?.() ?? Date.now()) / 1000);
  const loadBrowserSession = () => {
    if (dependencies?.bootstrapAccount !== undefined) {
      return dependencies.bootstrapAccount(auth);
    }
    return startWebSessionCleanupTrackedOperation(registerCleanupBarrier, (publishCleanupResource) => bootstrapFromBrowser(auth, timeoutMs, dependencies, operationDeadline, publishCleanupResource), browserCleanupBarrier);
  };
  const value = operationDeadline === undefined || dependencies?.bootstrapAccount === undefined ? await loadBrowserSession() : await operationDeadline.run(loadBrowserSession, "authenticated web operation deadline");
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  const browserSession = parseBlueskyBootstrapAccount(value, nowSeconds);
  const authHash = sha256(canonicalJson(auth));
  const cache = await loadBlueskySessionSnapshot(auth, authHash, dependencies);
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  const result = (session) => Object.freeze({
    session,
    cache: Object.freeze({
      enabled: cache.enabled,
      contentSha256: cache.snapshot.contentSha256
    })
  });
  if (cache.snapshot.value === null)
    return result(browserSession);
  const cachedSession = parseBlueskyBootstrapAccount(cache.snapshot.value, nowSeconds);
  if (cachedSession.did !== browserSession.did || cachedSession.pdsOrigin !== browserSession.pdsOrigin)
    return result(browserSession);
  return result(cachedSession.refreshExpiresAt > browserSession.refreshExpiresAt || cachedSession.refreshExpiresAt === browserSession.refreshExpiresAt && cachedSession.accessExpiresAt > browserSession.accessExpiresAt ? cachedSession : browserSession);
}
function cachedSessionValue(session) {
  return Object.freeze({
    did: session.did,
    handle: session.handle,
    accessJwt: session.accessJwt,
    refreshJwt: session.refreshJwt,
    service: session.pdsOrigin,
    pdsUrl: session.pdsOrigin
  });
}
async function writeBlueskySessionSnapshot(auth, authHash, value, expectedContentSha256, dependencies) {
  return dependencies?.saveCachedSession === undefined ? writeSessionSecretIfUnchanged("bluesky", auth.id, authHash, value, expectedContentSha256) : dependencies.saveCachedSession(auth, authHash, value, expectedContentSha256);
}
function blueskySessionIsAtLeastAsFresh(candidate, attempted) {
  return candidate.refreshExpiresAt > attempted.refreshExpiresAt || candidate.refreshExpiresAt === attempted.refreshExpiresAt && candidate.accessExpiresAt >= attempted.accessExpiresAt;
}
async function saveSelectedSession(auth, session, cache, nowSeconds, dependencies) {
  if (!cache.enabled)
    return session;
  const authHash = sha256(canonicalJson(auth));
  const value = cachedSessionValue(session);
  const saved = await writeBlueskySessionSnapshot(auth, authHash, value, cache.contentSha256, dependencies);
  if (saved.written)
    return session;
  const latest = await loadBlueskySessionSnapshot(auth, authHash, dependencies);
  if (!latest.enabled || latest.snapshot.contentSha256 === null || latest.snapshot.contentSha256 === cache.contentSha256 || latest.snapshot.value === null) {
    throw new Error("Bluesky rotating session state changed concurrently; retry with a fresh session");
  }
  const candidate = parseBlueskyBootstrapAccount(latest.snapshot.value, nowSeconds);
  if (candidate.did !== session.did || candidate.pdsOrigin !== session.pdsOrigin || !blueskySessionIsAtLeastAsFresh(candidate, session)) {
    throw new Error("Bluesky rotating session state changed concurrently without a safe newer session");
  }
  return candidate;
}
async function boundedBytes(response, maximum, operationDeadline) {
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const count = Number(declared);
    if (!Number.isSafeInteger(count) || count < 0 || count > maximum) {
      response.body?.cancel().catch(() => {
        return;
      });
      throw new Error("Bluesky XRPC response exceeded its reviewed byte limit");
    }
  }
  if (response.body === null)
    return new Uint8Array;
  const reader = response.body.getReader();
  const buffer = new BoundedByteBuffer(maximum);
  try {
    for (;; ) {
      const item = await (async () => {
        try {
          return operationDeadline === undefined ? await reader.read() : await operationDeadline.run(() => reader.read(), WEB_SESSION_OPERATION_LABEL);
        } catch (error) {
          if (error instanceof OperationDeadlineError)
            throw error;
          throw new ProviderReadTransportError(error);
        }
      })();
      if (item.done)
        break;
      if (!(item.value instanceof Uint8Array) || !buffer.append(item.value)) {
        reader.cancel().catch(() => {
          return;
        });
        throw new Error("Bluesky XRPC response exceeded its reviewed byte limit");
      }
    }
  } catch (error) {
    reader.cancel().catch(() => {
      return;
    });
    throw error;
  } finally {
    reader.releaseLock();
  }
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  return buffer.toUint8Array();
}
function jsonContentType(response) {
  const raw = response.headers.get("content-type");
  if (raw === null)
    return false;
  const type = raw.split(";", 1)[0]?.trim().toLowerCase();
  return type === "application/json" || type?.endsWith("+json") === true;
}
function parseJson(bytes) {
  if (bytes.byteLength === 0)
    return Object.freeze({});
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Bluesky XRPC returned invalid UTF-8");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Bluesky XRPC returned malformed JSON");
  }
}
async function xrpc(client, nsid, options = {}) {
  const query = options.query ?? {};
  const proxy = options.proxy ?? null;
  const method = BLUESKY_XRPC_METHODS[nsid];
  const refreshRequest = options.authorization?.kind === "refresh";
  if (refreshRequest !== (nsid === "com.atproto.server.refreshSession")) {
    throw new Error("Bluesky refresh authorization is restricted to refreshSession");
  }
  if (options.recordNotFound === true && nsid !== "com.atproto.repo.getRecord") {
    throw new Error("Bluesky RecordNotFound handling is restricted to getRecord");
  }
  const authorizationToken = refreshRequest ? options.authorization?.token : client.session.accessJwt;
  if (authorizationToken === undefined) {
    throw new Error("Bluesky refresh authorization token is unavailable");
  }
  if (options.jsonBody !== undefined && options.blobBody !== undefined) {
    throw new Error("Bluesky XRPC request cannot contain two body types");
  }
  const hasBody = options.jsonBody !== undefined || options.blobBody !== undefined;
  const url = new URL(`/xrpc/${nsid}`, client.session.pdsOrigin);
  for (const [name, values] of Object.entries(query)) {
    for (const value of values)
      url.searchParams.append(name, value);
  }
  authorizeBlueskyXrpcRequest({
    pdsOrigin: client.session.pdsOrigin,
    nsid,
    url,
    method,
    expectedQuery: query,
    hasBody,
    proxy
  });
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${authorizationToken}`,
    ...proxy === null ? {} : { "atproto-proxy": proxy }
  });
  let body;
  if (options.jsonBody !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.jsonBody);
  } else if (options.blobBody !== undefined) {
    headers.set("content-type", options.blobBody.mediaType);
    body = new Uint8Array(options.blobBody.bytes);
  }
  const operationDeadline = client.operationDeadline;
  const controller = operationDeadline === undefined ? new AbortController : undefined;
  const timeoutMs = remainingTimeoutMs(client.timeoutMs, operationDeadline);
  const timeout = controller === undefined ? undefined : setTimeout(() => controller.abort(), timeoutMs);
  const signal = operationDeadline?.signal ?? controller?.signal;
  if (signal === undefined) {
    throw new Error("Bluesky XRPC request signal was not initialized");
  }
  let response;
  try {
    try {
      const request = () => client.fetch(url, {
        method,
        headers,
        ...body === undefined ? {} : { body },
        redirect: "error",
        signal
      });
      response = operationDeadline === undefined ? await request() : await operationDeadline.run(request, WEB_SESSION_OPERATION_LABEL);
    } catch (error) {
      throw new Error("Bluesky XRPC failed before a reviewed response was received", {
        cause: error
      });
    }
    if (response.status === 400 && options.recordNotFound === true) {
      const bytes2 = await boundedBytes(response, 64 * 1024, operationDeadline);
      if (!jsonContentType(response)) {
        throw new Error("Bluesky RecordNotFound response used an unreviewed content type");
      }
      parseBlueskyRecordNotFoundResponse(parseJson(bytes2));
      return BLUESKY_RECORD_NOT_FOUND;
    }
    if (response.status !== 200) {
      response.body?.cancel().catch(() => {
        return;
      });
      throw new Error(`Bluesky XRPC returned unreviewed status ${response.status}`);
    }
    const bytes = await boundedBytes(response, Math.min(options.maximumBytes ?? client.maxOutputBytes, MAX_READ_BYTES), operationDeadline);
    if (bytes.byteLength > 0 && !jsonContentType(response)) {
      throw new Error("Bluesky XRPC returned an unreviewed content type");
    }
    return parseJson(bytes);
  } finally {
    if (timeout !== undefined)
      clearTimeout(timeout);
    if (signal.aborted) {
      response?.body?.cancel().catch(() => {
        return;
      });
    }
  }
}
async function videoServiceJson(client, input) {
  const url = new URL(input.kind === "upload" ? "/xrpc/app.bsky.video.uploadVideo" : "/xrpc/app.bsky.video.getJobStatus", BLUESKY_VIDEO_SERVICE_ORIGIN);
  if (input.kind === "upload") {
    url.searchParams.set("did", client.session.did);
    url.searchParams.set("name", "wrench-video.mp4");
  } else {
    url.searchParams.set("jobId", input.jobId);
  }
  const method = input.kind === "upload" ? "POST" : "GET";
  authorizeBlueskyVideoRequest({
    kind: input.kind,
    url,
    method,
    ...input.kind === "upload" ? { did: client.session.did } : { jobId: input.jobId }
  });
  const headers = new Headers({ accept: "application/json" });
  let body;
  if (input.kind === "upload") {
    headers.set("authorization", `Bearer ${input.token}`);
    headers.set("content-type", "video/mp4");
    headers.set("content-length", String(input.bytes.byteLength));
    body = new Uint8Array(input.bytes);
  }
  const operationDeadline = client.operationDeadline;
  const controller = operationDeadline === undefined ? new AbortController : undefined;
  const timeoutMs = remainingTimeoutMs(client.timeoutMs, operationDeadline);
  const timeout = controller === undefined ? undefined : setTimeout(() => controller.abort(), timeoutMs);
  const signal = operationDeadline?.signal ?? controller?.signal;
  if (signal === undefined) {
    throw new Error("Bluesky video request signal was not initialized");
  }
  let response;
  try {
    const request = () => client.fetch(url, {
      method,
      headers,
      ...body === undefined ? {} : { body },
      redirect: "error",
      signal
    });
    try {
      response = operationDeadline === undefined ? await request() : await operationDeadline.run(request, WEB_SESSION_OPERATION_LABEL);
    } catch (error) {
      throw new Error("Bluesky video service failed before a reviewed response was received", {
        cause: error
      });
    }
    if (response.status !== 200) {
      response.body?.cancel().catch(() => {
        return;
      });
      throw new Error(`Bluesky video service returned unreviewed status ${response.status}`);
    }
    const bytes = await boundedBytes(response, 512 * 1024, operationDeadline);
    if (!jsonContentType(response)) {
      throw new Error("Bluesky video service returned an unreviewed content type");
    }
    return parseJson(bytes);
  } finally {
    if (timeout !== undefined)
      clearTimeout(timeout);
    if (signal.aborted)
      response?.body?.cancel().catch(() => {
        return;
      });
  }
}
function clientFor(session, timeoutMs, maxOutputBytes, dependencies, operationDeadline) {
  return Object.freeze({
    session,
    timeoutMs,
    maxOutputBytes,
    fetch: dependencies?.fetch ?? ((input, init = {}) => pinnedHttpsFetch(input instanceof Request ? new URL(input.url) : new URL(input), init, remainingTimeoutMs(timeoutMs, operationDeadline))),
    ...operationDeadline === undefined ? {} : { operationDeadline }
  });
}
async function currentSession(client) {
  const current = parseBlueskySessionResponse(await xrpc(client, "com.atproto.server.getSession", {
    maximumBytes: 512 * 1024
  }));
  if (!current.active || current.did !== client.session.did) {
    throw new Error("Bluesky PDS session did not match the selected browser account");
  }
  return current;
}
function requireBoundSubject(auth, session) {
  const expected = webSessionAuthSubject(auth);
  if (expected === null) {
    throw new Error("Bluesky authenticated operations require an auth locator bound to an exact DID");
  }
  const did = blueskyDid(expected, "Bluesky auth subject");
  if (did !== session.did) {
    throw new Error("Bluesky browser account did not match the bound auth subject");
  }
  return did;
}
async function bootstrapClient(auth, timeoutMs, maxOutputBytes, dependencies, operationDeadline, registerCleanupBarrier) {
  const selected = await selectedSession(auth, timeoutMs, dependencies, operationDeadline, registerCleanupBarrier);
  const nowSeconds = Math.floor((dependencies?.now?.() ?? Date.now()) / 1000);
  let session = selected.session;
  if (selected.session.accessExpiresAt <= nowSeconds) {
    const refreshClient = clientFor(selected.session, timeoutMs, Math.min(maxOutputBytes, 512 * 1024), dependencies, operationDeadline);
    session = parseBlueskyRefreshSessionResponse(await xrpc(refreshClient, "com.atproto.server.refreshSession", {
      authorization: { kind: "refresh", token: selected.session.refreshJwt },
      maximumBytes: 512 * 1024
    }), selected.session, nowSeconds);
    session = await saveSelectedSession(auth, session, selected.cache, nowSeconds, dependencies);
  }
  const client = clientFor(session, timeoutMs, maxOutputBytes, dependencies, operationDeadline);
  await currentSession(client);
  return client;
}
async function probeBlueskyWebSubject(auth, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60000;
  const deadline = new OperationDeadline(timeoutMs, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  try {
    const client = await bootstrapClient(auth, timeoutMs, 512 * 1024, options.dependencies, deadline);
    deadline.throwIfUnavailable("authenticated web subject probe");
    return client.session.did;
  } finally {
    deadline.dispose();
  }
}
async function getPost(client, uri) {
  return projectBlueskyPostsResponse(await xrpc(client, "app.bsky.feed.getPosts", {
    query: { uris: [uri] },
    proxy: BLUESKY_APPVIEW_PROXY
  }), uri);
}
async function getAuthoritativeRecord(client, expected, expectedValue) {
  const parsed = parseBlueskyAtUri(expected.uri, "Bluesky created post URI", "app.bsky.feed.post");
  if (parsed.actor !== client.session.did) {
    throw new Error("Bluesky created post actor did not match the bound viewer");
  }
  return parseBlueskyGetRecordResponse(await xrpc(client, "com.atproto.repo.getRecord", {
    query: {
      repo: [client.session.did],
      collection: ["app.bsky.feed.post"],
      rkey: [parsed.rkey]
    }
  }), expected, expectedValue);
}
async function authoritativePostPresence(client, uri, expectedCid) {
  const parsed = parseBlueskyAtUri(uri, "Bluesky deletion target URI", "app.bsky.feed.post");
  if (parsed.actor !== client.session.did) {
    throw new Error("Bluesky deletion target actor did not match the bound viewer");
  }
  const response = await xrpc(client, "com.atproto.repo.getRecord", {
    query: {
      repo: [client.session.did],
      collection: ["app.bsky.feed.post"],
      rkey: [parsed.rkey]
    },
    recordNotFound: true
  });
  if (response === BLUESKY_RECORD_NOT_FOUND) {
    return Object.freeze({ present: false });
  }
  return Object.freeze({
    present: true,
    ref: parseBlueskyCurrentPostRecordResponse(response, parsed.uri, expectedCid)
  });
}
async function readBlueskyWebContentDeleteDesiredState(recipe, input, auth, options = {}) {
  if (recipe.site !== "bluesky" || recipe.action !== "content.delete" || recipe.contractVersion !== 1) {
    throw new Error("Bluesky deletion recovery supports only content.delete@1");
  }
  const deadline = new OperationDeadline(recipe.timeoutMs, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  try {
    const client = await bootstrapClient(auth, recipe.timeoutMs, recipe.maxOutputBytes, options.dependencies, deadline);
    requireBoundSubject(auth, client.session);
    const postUri = postUriInput(input);
    const expectedCid = blueskyCid(inputString(input, "expected_cid", 201), "input.expected_cid");
    const presence = await authoritativePostPresence(client, postUri, expectedCid);
    return Object.freeze({ present: presence.present, postUri });
  } finally {
    deadline.dispose();
  }
}
function parseBlueskyPublishedMutationTarget(identifier) {
  let value;
  try {
    value = JSON.parse(identifier);
  } catch {
    throw new Error("Bluesky provider-accepted post target is not canonical JSON");
  }
  const target = record2(value, "Bluesky provider-accepted post target");
  if (Object.keys(target).sort().join(",") !== "cid,createdAt,media,uri") {
    throw new Error("Bluesky provider-accepted post target contained unsupported fields");
  }
  const parsedUri = parseBlueskyAtUri(target.uri, "Bluesky provider-accepted post target URI", "app.bsky.feed.post");
  const strongRef = parseBlueskyCreateRecordResponse({ uri: parsedUri.uri, cid: target.cid }, parsedUri.actor, "app.bsky.feed.post");
  if (typeof target.createdAt !== "string" || target.createdAt.length > 64 || Number.isNaN(Date.parse(target.createdAt)) || new Date(target.createdAt).toISOString() !== target.createdAt) {
    throw new Error("Bluesky provider-accepted post target createdAt is malformed");
  }
  let media = null;
  if (target.media !== null) {
    const rawMedia = record2(target.media, "Bluesky provider-accepted post target media");
    const cid = typeof rawMedia.cid === "string" && /^b[a-z2-7]{10,200}$/u.test(rawMedia.cid) ? rawMedia.cid : null;
    if (rawMedia.mediaType === "video/mp4") {
      if (Object.keys(rawMedia).sort().join(",") !== "cid,height,jobId,mediaType,size,width" || cid === null || typeof rawMedia.jobId !== "string" || rawMedia.jobId.length < 1 || rawMedia.jobId.length > 1024 || /[\0\r]/u.test(rawMedia.jobId) || !Number.isSafeInteger(rawMedia.size) || rawMedia.size < 1 || rawMedia.size > MAX_VIDEO_BYTES || !Number.isSafeInteger(rawMedia.width) || rawMedia.width < 1 || rawMedia.width > 20000 || !Number.isSafeInteger(rawMedia.height) || rawMedia.height < 1 || rawMedia.height > 20000)
        throw new Error("Bluesky provider-accepted video target is malformed");
      media = Object.freeze({
        cid,
        height: rawMedia.height,
        jobId: rawMedia.jobId,
        mediaType: "video/mp4",
        size: rawMedia.size,
        width: rawMedia.width
      });
    } else {
      if (Object.keys(rawMedia).sort().join(",") !== "cid,mediaType,size" || cid === null || rawMedia.mediaType !== "image/jpeg" && rawMedia.mediaType !== "image/png" && rawMedia.mediaType !== "image/webp" || !Number.isSafeInteger(rawMedia.size) || rawMedia.size < 1 || rawMedia.size > MAX_IMAGE_BYTES)
        throw new Error("Bluesky provider-accepted post target media is malformed");
      media = Object.freeze({
        cid,
        mediaType: rawMedia.mediaType,
        size: rawMedia.size
      });
    }
  }
  const parsed = Object.freeze({
    uri: strongRef.uri,
    cid: strongRef.cid,
    createdAt: target.createdAt,
    media
  });
  if (canonicalJson(parsed) !== identifier) {
    throw new Error("Bluesky provider-accepted post target is not canonical");
  }
  return parsed;
}
async function readBlueskyWebPublishedMutationTarget(recipe, input, auth, identifier, options = {}) {
  if (recipe.site !== "bluesky" || !(recipe.action === "posts.publish" && recipe.contractVersion === 3 || recipe.action === "media.publish" && recipe.contractVersion === 2)) {
    throw new Error("Bluesky publish recovery supports only posts.publish@3 or media.publish@2");
  }
  const target = parseBlueskyPublishedMutationTarget(identifier);
  const body = assertBlueskyText(input.body, "input.body", 280, 3000);
  const rawAlt = input.alt;
  const alt = rawAlt === undefined ? "" : typeof rawAlt === "string" && rawAlt.length <= 1e4 && !/[\0\r]/u.test(rawAlt) ? rawAlt : (() => {
    throw new Error("input.alt must be bounded text");
  })();
  const expectsVideo = recipe.action === "media.publish";
  if (input.media === undefined !== (target.media === null) || (expectsVideo ? target.media?.mediaType !== "video/mp4" || input.media_type !== undefined : target.media === null ? input.media_type !== undefined || input.alt !== undefined : target.media.mediaType === "video/mp4" || input.media_type !== target.media.mediaType)) {
    throw new Error("Bluesky provider-accepted post target did not bind the confirmed attachment shape");
  }
  const recordValue = Object.freeze({
    $type: "app.bsky.feed.post",
    text: body,
    createdAt: target.createdAt,
    ...target.media === null ? {} : target.media.mediaType === "video/mp4" ? {
      embed: {
        $type: "app.bsky.embed.video",
        video: {
          $type: "blob",
          ref: { $link: target.media.cid },
          mimeType: target.media.mediaType,
          size: target.media.size
        },
        alt,
        aspectRatio: {
          width: target.media.width,
          height: target.media.height
        }
      }
    } : {
      embed: {
        $type: "app.bsky.embed.images",
        images: [{
          image: {
            $type: "blob",
            ref: { $link: target.media.cid },
            mimeType: target.media.mediaType,
            size: target.media.size
          },
          alt
        }]
      }
    }
  });
  const client = await bootstrapClient(auth, recipe.timeoutMs, recipe.maxOutputBytes, options.dependencies);
  requireBoundSubject(auth, client.session);
  const strongRef = Object.freeze({ uri: target.uri, cid: target.cid });
  await getAuthoritativeRecord(client, strongRef, recordValue);
  const projected = await getPost(client, target.uri);
  if (projected.cid !== target.cid || projected.createdAt !== target.createdAt) {
    throw new Error("Bluesky publish recovery readback changed the accepted record revision");
  }
  assertPublishedPost(projected, {
    actorDid: client.session.did,
    text: body,
    reply: null,
    quote: null,
    attachment: target.media === null ? null : {
      alt,
      cid: target.media.mediaType === "video/mp4" ? target.media.cid : null,
      kind: target.media.mediaType === "video/mp4" ? "video" : "image"
    }
  });
  return Object.freeze({ present: true, uri: target.uri, cid: target.cid });
}
async function waitForPublishReadback(client, uri, sleep) {
  let lastError;
  for (const delay of PUBLISH_READBACK_DELAYS_MS) {
    if (delay > 0) {
      const pause = () => sleep(delay);
      if (client.operationDeadline === undefined)
        await pause();
      else
        await client.operationDeadline.run(pause, WEB_SESSION_OPERATION_LABEL);
    }
    try {
      return await getPost(client, uri);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("Bluesky public post readback did not settle within the reviewed bound", {
    cause: lastError
  });
}
async function getProfile(client, did) {
  return projectBlueskyProfile(await xrpc(client, "app.bsky.actor.getProfile", {
    query: { actor: [did] },
    proxy: BLUESKY_APPVIEW_PROXY
  }), did);
}
async function readBlueskyWebDesiredState(recipe, input, auth, options = {}) {
  if (recipe.site !== "bluesky" || recipe.contractVersion !== 1 || recipe.action !== "likes.set" && recipe.action !== "content.save" && recipe.action !== "relationships.follow.set" && recipe.action !== "posts.repost") {
    throw new Error("Bluesky recovery readback supports only likes.set, content.save, relationships.follow.set, and posts.repost");
  }
  const deadline = new OperationDeadline(recipe.timeoutMs, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  try {
    const client = await bootstrapClient(auth, recipe.timeoutMs, recipe.maxOutputBytes, options.dependencies, deadline);
    requireBoundSubject(auth, client.session);
    if (recipe.action === "relationships.follow.set") {
      const actorDid = blueskyDid(inputString(input, "actor_did", 255), "input.actor_did");
      if (actorDid === client.session.did) {
        throw new Error("Bluesky cannot follow the bound viewer");
      }
      const profile = await getProfile(client, actorDid);
      return Object.freeze({
        kind: "follow",
        enabled: profile.following !== null,
        actorDid
      });
    }
    const postUri = postUriInput(input);
    const kind = recipe.action === "likes.set" ? "like" : recipe.action === "content.save" ? "bookmark" : "repost";
    const post = await getPost(client, postUri);
    return Object.freeze({
      kind,
      enabled: postState(post, kind),
      postUri
    });
  } finally {
    deadline.dispose();
  }
}
async function executeFeedRead(client, input) {
  const feed = inputString(input, "feed", 32);
  const limit = inputInteger(input, "limit", DEFAULT_LIMIT, 1, 100);
  const cursor = optionalCursor(input);
  let output;
  if (feed === "home") {
    output = projectBlueskyFeed(await xrpc(client, "app.bsky.feed.getTimeline", {
      query: {
        limit: [String(limit)],
        ...cursor === undefined ? {} : { cursor: [cursor] }
      },
      proxy: BLUESKY_APPVIEW_PROXY
    }), limit);
  } else if (feed === "notifications") {
    output = projectBlueskyNotifications(await xrpc(client, "app.bsky.notification.listNotifications", {
      query: {
        limit: [String(limit)],
        ...cursor === undefined ? {} : { cursor: [cursor] }
      },
      proxy: BLUESKY_NOTIFICATION_PROXY
    }), limit);
  } else if (feed === "bookmarks") {
    output = projectBlueskyBookmarks(await xrpc(client, "app.bsky.bookmark.getBookmarks", {
      query: {
        limit: [String(limit)],
        ...cursor === undefined ? {} : { cursor: [cursor] }
      },
      proxy: BLUESKY_APPVIEW_PROXY
    }), limit);
  } else {
    throw new Error("input.feed must name home, notifications, or bookmarks");
  }
  return {
    status: "succeeded",
    output: Object.freeze({ feed, result: output }),
    finalUrl: feed === "home" ? `${BLUESKY_APP_ORIGIN}/` : feed === "notifications" ? `${BLUESKY_APP_ORIGIN}/notifications` : `${BLUESKY_APP_ORIGIN}/saved`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function executeBlueskyPublicProfileRead(recipe, input, dependencies, operationDeadline) {
  if (recipe.site !== "bluesky" || recipe.action !== "profiles.read" || recipe.contractVersion !== 2) {
    throw new Error("Bluesky public profiles.read contract is not installed");
  }
  const handle = inputString(input, "handle", 253).toLowerCase();
  const url = new URL("/xrpc/app.bsky.actor.getProfile", BLUESKY_PUBLIC_APPVIEW_ORIGIN);
  url.searchParams.set("actor", handle);
  const fetch = dependencies?.fetch ?? ((inputValue, init = {}) => pinnedHttpsFetch(inputValue instanceof Request ? new URL(inputValue.url) : new URL(inputValue), init, remainingTimeoutMs(recipe.timeoutMs, operationDeadline)));
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const controller = operationDeadline === undefined ? new AbortController : null;
  const timeout = controller === null ? null : setTimeout(() => controller.abort(), recipe.timeoutMs);
  const signal = operationDeadline?.signal ?? controller?.signal;
  let response;
  try {
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        redirect: "error",
        ...signal === undefined ? {} : { signal }
      });
    } catch (error) {
      if (signal?.aborted === true) {
        if (operationDeadline !== undefined) {
          operationDeadline.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
        }
        throw new OperationDeadlineError(WEB_SESSION_OPERATION_LABEL, "timed-out");
      }
      throw new ProviderReadTransportError(error);
    }
    if (response.status !== 200) {
      response.body?.cancel().catch(() => {
        return;
      });
      throw new ProviderReadResponseRejectedError(response.status);
    }
    const bytes = await boundedBytes(response, Math.min(recipe.maxOutputBytes, MAX_READ_BYTES), operationDeadline);
    if (!jsonContentType(response)) {
      throw new Error("Bluesky public AppView returned an unreviewed content type");
    }
    const output = projectBlueskyProfileStats(parseJson(bytes), handle, new Date(dependencies?.now?.() ?? Date.now()).toISOString());
    return {
      status: "succeeded",
      output,
      finalUrl: output.target.url,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }
    };
  } catch (error) {
    return failedProviderRead("Bluesky profile", error, `https://bsky.app/profile/${handle}`, {
      stage: "target",
      authenticated: false,
      targetStatusUnavailable: true
    });
  } finally {
    if (timeout !== null)
      clearTimeout(timeout);
  }
}
async function executePostRead(client, input, mediaOnly) {
  const uri = postUriInput(input);
  const post = await getPost(client, uri);
  return {
    status: "succeeded",
    output: mediaOnly ? Object.freeze({ postUri: uri, media: post.attachments }) : post,
    finalUrl: `${BLUESKY_APP_ORIGIN}/profile/${post.author.did}/post/${blueskyPostUri(uri).rkey}`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function executeCommentsRead(client, input) {
  const uri = postUriInput(input);
  const limit = inputInteger(input, "limit", DEFAULT_LIMIT, 1, 100);
  const output = projectBlueskyThread(await xrpc(client, "app.bsky.feed.getPostThread", {
    query: {
      uri: [uri],
      depth: ["10"],
      parentHeight: ["0"]
    },
    proxy: BLUESKY_APPVIEW_PROXY
  }), uri, limit);
  return {
    status: "succeeded",
    output,
    finalUrl: `${BLUESKY_APP_ORIGIN}/profile/${output.post.author.did}/post/${blueskyPostUri(uri).rkey}`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function getConvo(client, convoId) {
  const response = record2(await xrpc(client, "chat.bsky.convo.getConvo", {
    query: { convoId: [convoId] },
    proxy: BLUESKY_CHAT_PROXY
  }), "Bluesky getConvo response");
  return projectBlueskyConvo(response.convo, client.session.did, convoId);
}
async function getMessages(client, convoId, limit, cursor) {
  return projectBlueskyMessages(await xrpc(client, "chat.bsky.convo.getMessages", {
    query: {
      convoId: [convoId],
      limit: [String(limit)],
      ...cursor === undefined ? {} : { cursor: [cursor] }
    },
    proxy: BLUESKY_CHAT_PROXY
  }), limit);
}
async function executeMessagingList(client, input) {
  const limit = inputInteger(input, "limit", DEFAULT_LIMIT, 1, 100);
  const cursor = optionalCursor(input);
  const output = projectBlueskyConvoList(await xrpc(client, "chat.bsky.convo.listConvos", {
    query: {
      limit: [String(limit)],
      ...cursor === undefined ? {} : { cursor: [cursor] }
    },
    proxy: BLUESKY_CHAT_PROXY
  }), client.session.did, limit);
  return {
    status: "succeeded",
    output,
    finalUrl: `${BLUESKY_APP_ORIGIN}/messages`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function executeMessagingRead(client, input) {
  const convoId = convoIdInput(input);
  const limit = inputInteger(input, "limit", DEFAULT_LIMIT, 1, 100);
  const cursor = optionalCursor(input);
  const convo = await getConvo(client, convoId);
  const messages = await getMessages(client, convoId, limit, cursor);
  return {
    status: "succeeded",
    output: Object.freeze({ convo, ...messages }),
    finalUrl: `${BLUESKY_APP_ORIGIN}/messages/${encodeURIComponent(convoId)}`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
function dispatchEvent(id, index, planned, started, verified) {
  return Object.freeze({
    id,
    index,
    progress: Object.freeze({ planned, started, verified })
  });
}
async function rebindBeforeDispatch(client) {
  const rebound = await currentSession(client);
  if (rebound.did !== client.session.did) {
    throw new Error("Bluesky account changed during dispatch preparation");
  }
}
function desiredStateResult(action, output) {
  return {
    status: "succeeded",
    output: Object.freeze({
      action,
      noOp: true,
      effect: "already-satisfied",
      result: output
    }),
    finalUrl: BLUESKY_APP_ORIGIN,
    dispatchStarted: false,
    dispatch: { planned: 1, started: 0, verified: 0 }
  };
}
async function createRecord(client, collection, value) {
  return parseBlueskyCreateRecordResponse(await xrpc(client, "com.atproto.repo.createRecord", {
    jsonBody: {
      repo: client.session.did,
      collection,
      record: value
    }
  }), client.session.did, collection);
}
async function deleteRecord(client, uri, collection) {
  const parsed = parseBlueskyAtUri(uri, "Bluesky record to delete", collection);
  if (parsed.actor !== client.session.did) {
    throw new Error("Bluesky record deletion actor did not match the bound viewer");
  }
  await xrpc(client, "com.atproto.repo.deleteRecord", {
    jsonBody: {
      repo: client.session.did,
      collection,
      rkey: parsed.rkey
    }
  });
}
async function executeContentDelete(client, recipe, input, options) {
  const postUri = postUriInput(input);
  const expectedCid = blueskyCid(inputString(input, "expected_cid", 201), "input.expected_cid");
  const parsed = parseBlueskyAtUri(postUri, "Bluesky deletion target URI", "app.bsky.feed.post");
  if (parsed.actor !== client.session.did) {
    throw new Error("Bluesky deletion target actor did not match the bound viewer");
  }
  const finalUrl = `${BLUESKY_APP_ORIGIN}/profile/${client.session.did}/post/${parsed.rkey}`;
  let started = 0;
  let verified = 0;
  let failureStage = "authoritative pre-read";
  try {
    const before = await authoritativePostPresence(client, postUri, expectedCid);
    if (!before.present) {
      return {
        status: "succeeded",
        output: Object.freeze({
          postUri,
          expectedCid,
          deleted: true,
          effect: "already-absent"
        }),
        finalUrl,
        noOp: true,
        dispatchStarted: false,
        dispatch: { planned: 1, started: 0, verified: 0 }
      };
    }
    failureStage = "dispatch rebinding";
    await rebindBeforeDispatch(client);
    failureStage = "dispatch admission";
    await options.beforeDispatch?.(dispatchEvent(recipe.action, 1, 1, 0, 0));
    started = 1;
    failureStage = "delete response";
    parseBlueskyDeleteRecordResponse(await xrpc(client, "com.atproto.repo.deleteRecord", {
      jsonBody: {
        repo: client.session.did,
        collection: "app.bsky.feed.post",
        rkey: parsed.rkey,
        swapRecord: before.ref.cid
      }
    }));
    failureStage = "authoritative absence readback";
    const after = await authoritativePostPresence(client, postUri, expectedCid);
    if (after.present) {
      throw new Error("Bluesky deletion readback still found the confirmed record");
    }
    verified = 1;
    failureStage = "verification recording";
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1, 1, 1));
    return {
      status: "succeeded",
      output: Object.freeze({
        postUri,
        expectedCid,
        deleted: true,
        effect: "deleted"
      }),
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
      error: started > 0 ? `Bluesky may have deleted the exact confirmed post; failure stage: ${failureStage}; reconcile authoritative record absence and never retry automatically` : `Bluesky deletion failed before submission; failure stage: ${failureStage}`
    };
  }
}
function postState(post, kind) {
  return kind === "like" ? post.viewer.like !== null : kind === "repost" ? post.viewer.repost !== null : post.viewer.bookmarked;
}
function postStateUri(post, kind) {
  return kind === "like" ? post.viewer.like : post.viewer.repost;
}
async function executePostDesiredState(client, recipe, input, options) {
  const uri = postUriInput(input);
  const kind = recipe.action === "likes.set" ? "like" : recipe.action === "content.save" ? "bookmark" : "repost";
  const desired = inputBoolean(input, kind === "like" ? "liked" : kind === "bookmark" ? "saved" : "reposted");
  let started = 0;
  let verified = 0;
  try {
    const before = await getPost(client, uri);
    if (postState(before, kind) === desired) {
      return desiredStateResult(recipe.action, {
        postUri: uri,
        desired
      });
    }
    await rebindBeforeDispatch(client);
    await options.beforeDispatch?.(dispatchEvent(recipe.action, 1, 1, 0, 0));
    started = 1;
    let createdUri = null;
    if (kind === "bookmark") {
      await xrpc(client, desired ? "app.bsky.bookmark.createBookmark" : "app.bsky.bookmark.deleteBookmark", {
        proxy: BLUESKY_APPVIEW_PROXY,
        jsonBody: desired ? { uri: before.uri, cid: before.cid } : { uri: before.uri }
      });
    } else {
      const collection = kind === "like" ? "app.bsky.feed.like" : "app.bsky.feed.repost";
      if (desired) {
        const created = await createRecord(client, collection, {
          $type: collection,
          subject: { uri: before.uri, cid: before.cid },
          createdAt: new Date(options.now()).toISOString()
        });
        createdUri = created.uri;
      } else {
        const existing = postStateUri(before, kind);
        if (existing === null)
          throw new Error("Bluesky desired-state deletion omitted its exact record URI");
        await deleteRecord(client, existing, collection);
      }
    }
    const after = await getPost(client, uri);
    if (postState(after, kind) !== desired) {
      throw new Error("Bluesky desired-state readback did not match the confirmed state");
    }
    if (createdUri !== null && postStateUri(after, kind) !== createdUri)
      throw new Error("Bluesky desired-state readback did not bind the created record");
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1, 1, 1));
    return {
      status: "succeeded",
      output: Object.freeze({ postUri: uri, desired, noOp: false }),
      finalUrl: `${BLUESKY_APP_ORIGIN}/profile/${before.author.did}/post/${blueskyPostUri(uri).rkey}`,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: BLUESKY_APP_ORIGIN,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? "Bluesky may have changed the requested post state but exact readback was not verified; reconcile before retrying" : "Bluesky desired post state failed before submission"
    };
  }
}
async function executeFollowDesiredState(client, recipe, input, options) {
  const targetDid = blueskyDid(inputString(input, "actor_did", 255), "input.actor_did");
  const desired = inputBoolean(input, "followed");
  let started = 0;
  let verified = 0;
  try {
    if (targetDid === client.session.did)
      throw new Error("Bluesky cannot follow the bound viewer");
    const before = await getProfile(client, targetDid);
    if (before.following !== null === desired) {
      return desiredStateResult("relationships.follow.set", { actorDid: targetDid, desired });
    }
    await rebindBeforeDispatch(client);
    await options.beforeDispatch?.(dispatchEvent(recipe.action, 1, 1, 0, 0));
    started = 1;
    let createdUri = null;
    if (desired) {
      createdUri = (await createRecord(client, "app.bsky.graph.follow", {
        $type: "app.bsky.graph.follow",
        subject: targetDid,
        createdAt: new Date(options.now()).toISOString()
      })).uri;
    } else {
      if (before.following === null)
        throw new Error("Bluesky unfollow omitted its exact follow URI");
      await deleteRecord(client, before.following, "app.bsky.graph.follow");
    }
    const after = await getProfile(client, targetDid);
    if (after.following !== null !== desired) {
      throw new Error("Bluesky follow readback did not match the confirmed state");
    }
    if (createdUri !== null && after.following !== createdUri) {
      throw new Error("Bluesky follow readback did not bind the created record");
    }
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1, 1, 1));
    return {
      status: "succeeded",
      output: Object.freeze({ actorDid: targetDid, desired, noOp: false }),
      finalUrl: `${BLUESKY_APP_ORIGIN}/profile/${targetDid}`,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: `${BLUESKY_APP_ORIGIN}/profile/${targetDid}`,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? "Bluesky may have changed the follow state but exact readback was not verified; reconcile before retrying" : "Bluesky follow state failed before submission"
    };
  }
}
function fileInput(value) {
  if (!isRecord2(value) || value.kind !== "file" || typeof value.reference !== "string" || Object.keys(value).sort().join(",") !== "kind,reference")
    throw new Error("input.media must be one plan-bound file");
  return Object.freeze({ kind: "file", reference: value.reference });
}
async function readBoundMedia(input, fileResolver, operationDeadline) {
  if (input.media === undefined) {
    if (input.media_type !== undefined || input.alt !== undefined) {
      throw new Error("input.media_type and input.alt require input.media");
    }
    return null;
  }
  if (fileResolver === undefined)
    throw new Error("Bluesky media upload requires the plan-bound file resolver");
  const media = fileInput(input.media);
  const mediaType = inputString(input, "media_type", 32);
  if (mediaType !== "image/jpeg" && mediaType !== "image/png" && mediaType !== "image/webp")
    throw new Error("input.media_type must be a reviewed Bluesky image type");
  const rawAlt = input.alt;
  const alt = rawAlt === undefined ? "" : typeof rawAlt === "string" && rawAlt.length <= 1e4 && !/[\0\r]/u.test(rawAlt) ? rawAlt : (() => {
    throw new Error("input.alt must be bounded text");
  })();
  const paths = operationDeadline === undefined ? await fileResolver([media]) : await operationDeadline.run(() => fileResolver([media]), WEB_SESSION_OPERATION_LABEL);
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("Bluesky file resolver did not return one exact path");
  }
  const path = paths[0];
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open(path, constants.O_RDONLY | noFollow) : await operationDeadline.run(() => open(path, constants.O_RDONLY | noFollow), WEB_SESSION_OPERATION_LABEL);
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), WEB_SESSION_OPERATION_LABEL);
    if (!before.isFile() || before.size < 1 || before.size > MAX_IMAGE_BYTES) {
      throw new Error("Bluesky image must be a regular file no larger than 2,000,000 bytes");
    }
    const bytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), WEB_SESSION_OPERATION_LABEL);
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), WEB_SESSION_OPERATION_LABEL);
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || bytes.byteLength !== before.size)
      throw new Error("Bluesky image changed while it was materialized");
    return Object.freeze({
      bytes: new Uint8Array(bytes),
      mediaType,
      alt
    });
  } finally {
    await handle.close();
  }
}
async function readBoundVideo(input, fileResolver, operationDeadline) {
  if (input.media === undefined) {
    throw new Error("Bluesky video publishing requires input.media");
  }
  if (input.media_type !== undefined) {
    throw new Error("Bluesky video publishing does not accept input.media_type");
  }
  if (fileResolver === undefined) {
    throw new Error("Bluesky video upload requires the plan-bound file resolver");
  }
  const media = fileInput(input.media);
  const rawAlt = input.alt;
  const alt = rawAlt === undefined ? "" : typeof rawAlt === "string" && rawAlt.length <= 1e4 && !/[\0\r]/u.test(rawAlt) ? rawAlt : (() => {
    throw new Error("input.alt must be bounded text");
  })();
  const paths = operationDeadline === undefined ? await fileResolver([media]) : await operationDeadline.run(() => fileResolver([media]), WEB_SESSION_OPERATION_LABEL);
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("Bluesky file resolver did not return one exact video path");
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open(paths[0], constants.O_RDONLY | noFollow) : await operationDeadline.run(() => open(paths[0], constants.O_RDONLY | noFollow), WEB_SESSION_OPERATION_LABEL);
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), WEB_SESSION_OPERATION_LABEL);
    if (!before.isFile() || before.size < 24 || before.size > MAX_VIDEO_BYTES) {
      throw new Error("Bluesky video must be a regular MP4 no larger than 100,000,000 bytes");
    }
    const fileBytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), WEB_SESSION_OPERATION_LABEL);
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), WEB_SESSION_OPERATION_LABEL);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || fileBytes.byteLength !== before.size)
      throw new Error("Bluesky video changed while it was materialized");
    const bytes = new Uint8Array(fileBytes);
    const dimensions = isoBmffVideoDimensions(bytes, "Bluesky video");
    return Object.freeze({
      alt,
      bytes,
      height: dimensions.height,
      mediaType: "video/mp4",
      width: dimensions.width
    });
  } finally {
    await handle.close();
  }
}
async function uploadImage(client, media) {
  return parseBlueskyUploadBlobResponse(await xrpc(client, "com.atproto.repo.uploadBlob", {
    blobBody: { bytes: media.bytes, mediaType: media.mediaType },
    maximumBytes: 512 * 1024
  }), media.mediaType, media.bytes.byteLength);
}
async function uploadVideo(client, media, options) {
  const nowSeconds = Math.floor(options.now() / 1000);
  const expiresAt = nowSeconds + 1800;
  const audience = `did:web:${new URL(client.session.pdsOrigin).hostname}`;
  const lxm = "com.atproto.repo.uploadBlob";
  const token = parseBlueskyServiceAuthResponse(await xrpc(client, "com.atproto.server.getServiceAuth", {
    query: {
      aud: [audience],
      exp: [String(expiresAt)],
      lxm: [lxm]
    },
    maximumBytes: 64 * 1024
  }), {
    did: client.session.did,
    audience,
    lxm,
    expiresAt,
    nowSeconds
  });
  let status = parseBlueskyVideoUploadResponse(await videoServiceJson(client, {
    kind: "upload",
    bytes: media.bytes,
    token
  }), client.session.did);
  const completed = (candidate) => {
    if (candidate.state === "JOB_STATE_FAILED") {
      throw new Error("Bluesky video processing reported a terminal failure");
    }
    return candidate.state === "JOB_STATE_COMPLETED" ? candidate.blob : null;
  };
  let blob = completed(status);
  for (const delay of VIDEO_PROCESSING_DELAYS_MS) {
    if (blob !== null)
      break;
    const pause = () => options.sleep(delay);
    if (client.operationDeadline === undefined)
      await pause();
    else
      await client.operationDeadline.run(pause, WEB_SESSION_OPERATION_LABEL);
    status = parseBlueskyVideoJobStatusResponse(await videoServiceJson(client, {
      kind: "job-status",
      jobId: status.jobId
    }), client.session.did, status.jobId);
    blob = completed(status);
  }
  if (blob === null) {
    throw new Error("Bluesky video processing did not complete within the reviewed poll bound");
  }
  return Object.freeze({ blob, jobId: status.jobId });
}
function publishTexts(action, input) {
  if (action !== "threads.publish") {
    return [assertBlueskyText(input.body, "input.body", 280, 3000)];
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 25) {
    throw new Error("input.items must contain between one and twenty-five thread items");
  }
  return Object.freeze(input.items.map((item, index) => assertBlueskyText(item, `input.items[${index}]`, 280, 3000)));
}
function assertPublishedPost(post, expected) {
  if (post.author.did !== expected.actorDid || post.text !== expected.text) {
    throw new Error("Bluesky post readback did not bind the confirmed actor and text");
  }
  if (JSON.stringify(post.reply) !== JSON.stringify(expected.reply)) {
    throw new Error("Bluesky post readback did not bind the confirmed reply root and parent");
  }
  if (JSON.stringify(post.quote) !== JSON.stringify(expected.quote)) {
    throw new Error("Bluesky post readback did not bind the confirmed quoted record");
  }
  if (expected.attachment !== null) {
    const attachment = post.attachments[0];
    if (post.attachments.length !== 1 || attachment?.kind !== expected.attachment.kind || attachment.alt !== expected.attachment.alt || expected.attachment.cid !== null && attachment.cid !== expected.attachment.cid)
      throw new Error("Bluesky post readback did not bind the confirmed attachment");
  }
}
async function executePublish(client, recipe, input, options) {
  let started = 0;
  let verified = 0;
  let failureStage = "record-preparation";
  const posts = [];
  let planned = recipe.action === "threads.publish" && Array.isArray(input.items) ? input.items.length : 1;
  try {
    const texts = publishTexts(recipe.action, input);
    planned = texts.length;
    if (recipe.action !== "posts.publish" && recipe.action !== "replies.create" && recipe.action !== "media.publish" && input.media !== undefined)
      throw new Error("Bluesky media is supported only for a post, reply, or video post");
    const media = recipe.action === "media.publish" ? await readBoundVideo(input, options.fileResolver, client.operationDeadline) : recipe.action === "posts.publish" || recipe.action === "replies.create" ? await readBoundMedia(input, options.fileResolver, client.operationDeadline) : null;
    let reply = null;
    let quote = null;
    if (recipe.action === "replies.create") {
      const parent = await getPost(client, postUriInput(input));
      reply = Object.freeze({
        root: parent.reply?.root ?? Object.freeze({ uri: parent.uri, cid: parent.cid }),
        parent: Object.freeze({ uri: parent.uri, cid: parent.cid })
      });
    } else if (recipe.action === "posts.quote") {
      const target = await getPost(client, postUriInput(input));
      quote = Object.freeze({ uri: target.uri, cid: target.cid });
    }
    for (const [offset, text] of texts.entries()) {
      const index = offset + 1;
      const id = recipe.action === "threads.publish" ? `${recipe.action}[${index}]` : recipe.action;
      if (recipe.action === "threads.publish" && offset > 0) {
        const parent = posts[offset - 1];
        reply = Object.freeze({
          root: posts[0],
          parent
        });
      }
      failureStage = "media-upload";
      let blob = null;
      let videoJobId = null;
      if (media !== null && offset === 0) {
        if (media.mediaType === "video/mp4") {
          const uploaded = await uploadVideo(client, media, {
            now: options.now,
            sleep: options.sleep
          });
          blob = uploaded.blob;
          videoJobId = uploaded.jobId;
        } else {
          blob = await uploadImage(client, media);
        }
      }
      failureStage = "record-preparation";
      const createdAt = new Date(options.now()).toISOString();
      const record3 = Object.freeze({
        $type: "app.bsky.feed.post",
        text,
        createdAt,
        ...reply === null ? {} : { reply },
        ...quote === null ? {} : {
          embed: {
            $type: "app.bsky.embed.record",
            record: quote
          }
        },
        ...blob === null ? {} : media?.mediaType === "video/mp4" ? {
          embed: {
            $type: "app.bsky.embed.video",
            video: blob,
            alt: media.alt,
            aspectRatio: {
              width: media.width,
              height: media.height
            }
          }
        } : {
          embed: {
            $type: "app.bsky.embed.images",
            images: [{ image: blob, alt: media.alt }]
          }
        }
      });
      failureStage = "dispatch-rebinding";
      await rebindBeforeDispatch(client);
      failureStage = "dispatch-admission";
      await options.beforeDispatch?.(dispatchEvent(id, index, planned, started, verified));
      started = index;
      failureStage = "create-record";
      const created = await createRecord(client, "app.bsky.feed.post", record3);
      failureStage = "accepted-target-recording";
      await options.afterProviderAcceptedMutationTarget?.({
        id,
        index,
        target: {
          schemaVersion: 1,
          identifier: canonicalJson({
            uri: created.uri,
            cid: created.cid,
            createdAt,
            media: blob === null ? null : media?.mediaType === "video/mp4" ? {
              cid: blob.ref.$link,
              height: media.height,
              jobId: videoJobId,
              mediaType: blob.mimeType,
              size: blob.size,
              width: media.width
            } : {
              cid: blob.ref.$link,
              mediaType: blob.mimeType,
              size: blob.size
            }
          })
        }
      });
      failureStage = "authoritative-record-readback";
      await getAuthoritativeRecord(client, created, record3);
      failureStage = "public-post-readback";
      const readback = await waitForPublishReadback(client, created.uri, options.sleep);
      if (readback.cid !== created.cid || readback.createdAt !== createdAt) {
        throw new Error("Bluesky post readback did not bind the created record revision");
      }
      assertPublishedPost(readback, {
        actorDid: client.session.did,
        text,
        reply,
        quote,
        attachment: blob === null ? null : {
          alt: media.alt,
          cid: media?.mediaType === "video/mp4" ? blob.ref.$link : null,
          kind: media?.mediaType === "video/mp4" ? "video" : "image"
        }
      });
      posts.push(created);
      verified = index;
      failureStage = "verification-recording";
      await options.afterDispatchVerified?.(dispatchEvent(id, index, planned, started, verified));
    }
    return {
      status: "succeeded",
      output: Object.freeze({
        posts: Object.freeze(posts.map((post) => Object.freeze({
          uri: post.uri,
          cid: post.cid,
          url: `${BLUESKY_APP_ORIGIN}/profile/${client.session.did}/post/${blueskyPostUri(post.uri).rkey}`
        })))
      }),
      finalUrl: posts.length === 0 ? BLUESKY_APP_ORIGIN : `${BLUESKY_APP_ORIGIN}/profile/${client.session.did}/post/${blueskyPostUri(posts.at(-1).uri).rkey}`,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified }
    };
  } catch {
    const status = started > verified ? "indeterminate" : verified > 0 ? "partial" : "failed";
    return {
      status,
      output: posts.length === 0 ? null : Object.freeze({ posts }),
      finalUrl: posts.length === 0 ? BLUESKY_APP_ORIGIN : `${BLUESKY_APP_ORIGIN}/profile/${client.session.did}/post/${blueskyPostUri(posts.at(-1).uri).rkey}`,
      dispatchStarted: started > 0,
      dispatch: { planned, started, verified },
      error: status === "indeterminate" ? `Bluesky may have accepted the current post dispatch; failure stage: ${failureStage}; reconcile before retrying` : status === "partial" ? `Bluesky verified only part of the confirmed post workflow; failure stage: ${failureStage}; inspect the verified results before retrying` : `Bluesky post preparation failed before public record submission; failure stage: ${failureStage}; retry with a fresh confirmed plan`
    };
  }
}
async function executeMessageSend(client, recipe, input, options) {
  const convoId = convoIdInput(input);
  const text = assertBlueskyText(input.body, "input.body", 1000, 1e4);
  let started = 0;
  let verified = 0;
  try {
    await getConvo(client, convoId);
    await rebindBeforeDispatch(client);
    await options.beforeDispatch?.(dispatchEvent(recipe.action, 1, 1, 0, 0));
    started = 1;
    const sent = record2(await xrpc(client, "chat.bsky.convo.sendMessage", {
      proxy: BLUESKY_CHAT_PROXY,
      jsonBody: { convoId, message: { text } }
    }), "Bluesky sendMessage response");
    const sentIdInput = {
      sent: typeof sent.id === "string" ? sent.id : ""
    };
    const sentId = inputString(sentIdInput, "sent", 512);
    const sentProjection = projectBlueskyMessages({ messages: [sent] }, 1).messages[0];
    if (sentProjection.senderDid !== client.session.did || sentProjection.text !== text) {
      throw new Error("Bluesky sendMessage response did not bind the confirmed sender and text");
    }
    const readback = await getMessages(client, convoId, 100);
    const found = readback.messages.find((message) => message.id === sentId);
    if (found === undefined || found.senderDid !== client.session.did || found.text !== text)
      throw new Error("Bluesky message readback did not bind the sent message");
    verified = 1;
    await options.afterDispatchVerified?.(dispatchEvent(recipe.action, 1, 1, 1, 1));
    return {
      status: "succeeded",
      output: found,
      finalUrl: `${BLUESKY_APP_ORIGIN}/messages/${encodeURIComponent(convoId)}`,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified }
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: `${BLUESKY_APP_ORIGIN}/messages/${encodeURIComponent(convoId)}`,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0 ? "Bluesky may have accepted the message but exact readback was not verified; reconcile before retrying" : "Bluesky message dispatch failed before submission"
    };
  }
}
async function executeBlueskyWebOperation(recipe, input, auth, options = {}) {
  if (recipe.site !== "bluesky" || !isBlueskyOperation(recipe.action))
    throw new Error("Bluesky authenticated web recipe is not installed");
  const expectedContractVersion = recipe.action === "posts.publish" ? 3 : recipe.action === "media.publish" ? 2 : recipe.action === "profiles.read" ? 2 : 1;
  if (recipe.contractVersion !== expectedContractVersion) {
    throw new Error(`Bluesky authenticated web operation ${recipe.action} contract version ${recipe.contractVersion} is not installed`);
  }
  const contract = BLUESKY_WEB_OPERATIONS[recipe.action];
  if (contract.state !== "observed") {
    throw new Error(`Bluesky authenticated web operation ${recipe.action} is capture-required: ${contract.reason}`);
  }
  if (recipe.action === "profiles.read") {
    throw new Error("Bluesky profiles.read requires the reviewed public runtime hook");
  }
  const client = await bootstrapClient(auth, recipe.timeoutMs, recipe.maxOutputBytes, options.dependencies, options.operationDeadline, options.registerCleanupBarrier);
  requireBoundSubject(auth, client.session);
  if (recipe.action === "feeds.read")
    return executeFeedRead(client, input);
  if (recipe.action === "posts.read")
    return executePostRead(client, input, false);
  if (recipe.action === "media.read")
    return executePostRead(client, input, true);
  if (recipe.action === "comments.read")
    return executeCommentsRead(client, input);
  if (recipe.action === "messaging.list")
    return executeMessagingList(client, input);
  if (recipe.action === "messaging.read")
    return executeMessagingRead(client, input);
  const mutationOptions = {
    ...options.beforeDispatch === undefined ? {} : { beforeDispatch: options.beforeDispatch },
    ...options.afterDispatchVerified === undefined ? {} : { afterDispatchVerified: options.afterDispatchVerified },
    ...options.afterProviderAcceptedMutationTarget === undefined ? {} : {
      afterProviderAcceptedMutationTarget: options.afterProviderAcceptedMutationTarget
    },
    now: options.dependencies?.now ?? Date.now,
    sleep: options.dependencies?.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  };
  if (recipe.action === "likes.set" || recipe.action === "content.save" || recipe.action === "posts.repost")
    return executePostDesiredState(client, recipe, input, mutationOptions);
  if (recipe.action === "content.delete") {
    return executeContentDelete(client, recipe, input, mutationOptions);
  }
  if (recipe.action === "relationships.follow.set") {
    return executeFollowDesiredState(client, recipe, input, mutationOptions);
  }
  if (recipe.action === "posts.publish" || recipe.action === "media.publish" || recipe.action === "replies.create" || recipe.action === "posts.quote" || recipe.action === "threads.publish") {
    return executePublish(client, recipe, input, {
      ...mutationOptions,
      ...options.fileResolver === undefined ? {} : { fileResolver: options.fileResolver }
    });
  }
  if (recipe.action === "messaging.send") {
    return executeMessageSend(client, recipe, input, mutationOptions);
  }
  throw new Error(`Bluesky authenticated web operation ${recipe.action} has no executable reviewed contract`);
}
export {
  readBlueskyWebPublishedMutationTarget,
  readBlueskyWebDesiredState,
  readBlueskyWebContentDeleteDesiredState,
  probeBlueskyWebSubject,
  executeBlueskyWebOperation,
  executeBlueskyPublicProfileRead
};
