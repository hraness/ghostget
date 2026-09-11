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
import"./index-j3ysa35f.js";
import"./index-aka7rgdj.js";
import"./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import"./index-z1w83f81.js";

// src/providers/tiktok-web-runtime.ts
import { Blob } from "buffer";
import { constants } from "fs";
import { open } from "fs/promises";
import { types as nodeTypes } from "util";

// src/providers/tiktok-web.ts
import { createHash, createHmac } from "crypto";
var TIKTOK_WEB_OPERATION_NAMES = Object.freeze([
  "comments.create",
  "comments.read",
  "content.delete",
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
  "profiles.read",
  "posts.read",
  "posts.repost",
  "relationships.follow.set",
  "replies.create"
]);
var MAX_TIKTOK_VIDEO_PUBLISH_BYTES = 128 * 1024 * 1024;
var VIEWER_REQUEST = Object.freeze({
  method: "GET",
  path: "/api/user/detail/self/",
  requiredQueryParameters: Object.freeze([]),
  fixedQueryParameters: Object.freeze([])
});
var FOR_YOU_REQUEST = Object.freeze({
  method: "GET",
  path: "/api/recommend/item_list/",
  requiredQueryParameters: Object.freeze(["aid", "count"]),
  fixedQueryParameters: Object.freeze([Object.freeze(["aid", "1988"])])
});
var COMMENTS_REQUEST = Object.freeze({
  method: "GET",
  path: "/api/comment/list/",
  requiredQueryParameters: Object.freeze(["aid", "aweme_id", "count", "cursor"]),
  fixedQueryParameters: Object.freeze([Object.freeze(["aid", "1988"])])
});
var noRequests = () => Object.freeze([]);
var TIKTOK_WEB_OPERATIONS = Object.freeze({
  "profiles.read": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "observed",
    evidence: "live-har",
    requests: Object.freeze([VIEWER_REQUEST]),
    reason: "exact current-profile counts from the viewer-bound first-party user detail response"
  }),
  "feeds.read": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "observed",
    evidence: "live-direct",
    requests: Object.freeze([FOR_YOU_REQUEST]),
    reason: "exact signer-free For You GET with current-account bootstrap"
  }),
  "posts.read": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "live-direct",
    requests: noRequests(),
    reason: "item/detail and creator item-list reads returned no usable direct response without current proof material"
  }),
  "media.read": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "none",
    requests: noRequests(),
    reason: "media detail and expiring playback URL handling require a separately reviewed response contract"
  }),
  "comments.read": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "observed",
    evidence: "live-direct",
    requests: Object.freeze([COMMENTS_REQUEST]),
    reason: "exact signer-free comment-list GET with post binding and acknowledgement-free semantics"
  }),
  "messaging.list": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "none",
    requests: noRequests(),
    reason: "inbox transport and acknowledgement behavior require a reviewed capture"
  }),
  "messaging.read": Object.freeze({
    effect: "read",
    risk: "R1",
    state: "capture-required",
    evidence: "none",
    requests: noRequests(),
    reason: "conversation transport, pagination, and acknowledgement behavior require a reviewed capture"
  }),
  "likes.set": Object.freeze({
    effect: "write",
    risk: "R2",
    state: "capture-required",
    evidence: "live-har",
    requests: noRequests(),
    reason: "item digg needs current csrf/proof material, exact mutation response, and independent readback"
  }),
  "content.save": Object.freeze({
    effect: "write",
    risk: "R2",
    state: "capture-required",
    evidence: "live-har",
    requests: noRequests(),
    reason: "item collect needs current csrf/proof material, exact mutation response, and independent saved-list readback"
  }),
  "content.delete": Object.freeze({
    contractVersion: 1,
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "live-har",
    requests: noRequests(),
    reason: "an authorized disposable lifecycle proves exact account-bound list/detail preflight, recyclable permission, and one accepted recycle response, but the post-list miss and canonical soft-200 shell are not a strict tombstone, and the mutation requires in-origin ACrawler/ZTI proof that the direct cookie transport cannot reproduce"
  }),
  "relationships.follow.set": Object.freeze({
    effect: "write",
    risk: "R2",
    state: "capture-required",
    evidence: "live-har",
    requests: noRequests(),
    reason: "follow AB variants need exact target, csrf/proof material, mutation response, and independent relationship readback"
  }),
  "comments.create": Object.freeze({
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "live-har",
    requests: noRequests(),
    reason: "comment publish needs an authorized fixture and exact actor/root response binding"
  }),
  "replies.create": Object.freeze({
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "live-har",
    requests: noRequests(),
    reason: "reply publish needs an authorized fixture and exact actor/root/parent response binding"
  }),
  "messaging.send": Object.freeze({
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: noRequests(),
    reason: "DM send and optional attachment transport require separate reviewed fixtures"
  }),
  "posts.publish": Object.freeze({
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: noRequests(),
    reason: "text-post publication needs an authorized fixture and audience/response binding"
  }),
  "media.publish": Object.freeze({
    contractVersion: 2,
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "first-party-bundle",
    requests: noRequests(),
    reason: "an authorized private disposable publish proves two Apply/Commit cycles, one project-post acceptance, exact caption/audience settings, and account-bound readback, but observed TOS traffic differs from the unexecuted multipart projections and project dispatch still requires reviewed in-origin ACrawler/ZTI proof generation"
  }),
  "content.schedule": Object.freeze({
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: noRequests(),
    reason: "creator scheduling and upload publication require exact authorized Studio captures"
  }),
  "content.share": Object.freeze({
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "none",
    requests: noRequests(),
    reason: "share destinations have distinct externally visible effects and require reviewed fixtures"
  }),
  "posts.repost": Object.freeze({
    effect: "write",
    risk: "R3",
    state: "capture-required",
    evidence: "live-har",
    requests: noRequests(),
    reason: "upvote publish/delete requires exact current proof material, response binding, and independent readback"
  })
});
var tiktokWebDirectEvidenceSnapshot = Object.freeze({
  schemaVersion: 1,
  role: "revision-evidence-only",
  observedOn: "2026-07-23",
  origin: "https://www.tiktok.com",
  authentication: "browser-cookie-session",
  signerRequired: false,
  operations: Object.freeze({
    "viewer.current": Object.freeze({
      method: "GET",
      path: VIEWER_REQUEST.path,
      queryNames: Object.freeze([]),
      responseBinding: Object.freeze(["userInfo.user.id", "userInfo.user.secUid"])
    }),
    "profiles.current": Object.freeze({
      method: "GET",
      path: VIEWER_REQUEST.path,
      queryNames: Object.freeze([]),
      responseBinding: Object.freeze([
        "userInfo.user.id",
        "userInfo.user.uniqueId",
        "userInfo.stats.followerCount",
        "userInfo.stats.followingCount",
        "userInfo.stats.heartCount"
      ])
    }),
    "feeds.for-you": Object.freeze({
      method: "GET",
      path: FOR_YOU_REQUEST.path,
      queryNames: Object.freeze(["aid", "count"]),
      responseBinding: Object.freeze(["statusCode", "status_code", "itemList"])
    }),
    "comments.list": Object.freeze({
      method: "GET",
      path: COMMENTS_REQUEST.path,
      queryNames: Object.freeze(["aid", "aweme_id", "count", "cursor"]),
      responseBinding: Object.freeze(["status_code", "comments[].aweme_id", "cursor"])
    })
  })
});
var R1_REQUESTS = Object.freeze({
  "viewer.current": VIEWER_REQUEST,
  "profiles.current": VIEWER_REQUEST,
  "feeds.for-you": FOR_YOU_REQUEST,
  "comments.list": COMMENTS_REQUEST
});
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function requiredString(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be a bounded string`);
  return value;
}
function boundedText(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || /[\0\r]/u.test(value)) {
    throw new Error(`${label} must be bounded text`);
  }
  return value;
}
function optionalString(value, label, maximum) {
  if (value === undefined || value === null)
    return null;
  return requiredString(value, label, maximum);
}
function decimalId(value, label) {
  const id = requiredString(value, label, 32);
  if (!/^[0-9]{1,32}$/u.test(id))
    throw new Error(`${label} must be a decimal TikTok identifier`);
  return id;
}
function secUid(value, label) {
  const id = requiredString(value, label, 256);
  if (!/^[A-Za-z0-9._-]{16,256}$/u.test(id))
    throw new Error(`${label} must be an exact TikTok secUid`);
  return id;
}
function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function integerLike(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value === "number")
    return integer(value, label, minimum, maximum);
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,15})$/u.test(value)) {
    throw new Error(`${label} must be a safe decimal integer`);
  }
  return integer(Number(value), label, minimum, maximum);
}
function boolean(value, label) {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
function zeroStatus(root, fields, label) {
  for (const field of fields) {
    if (root[field] !== 0)
      throw new Error(`${label} did not return an exact success status`);
  }
}
function exactUrl(value, label) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.origin !== "https://www.tiktok.com" || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error(`${label} must use the exact https://www.tiktok.com origin`);
  return url;
}
function exactSingleQuery(url) {
  const result = new Map;
  for (const [name, value] of url.searchParams) {
    if (result.has(name))
      throw new Error(`TikTok request repeated query parameter ${name}`);
    result.set(name, value);
  }
  return result;
}
function decimalQuery(values, name, minimum, maximum) {
  const value = values.get(name);
  if (value === undefined || !/^(?:0|[1-9][0-9]{0,15})$/u.test(value)) {
    throw new Error(`TikTok request query parameter ${name} must be a decimal integer`);
  }
  return integer(Number(value), `TikTok request query parameter ${name}`, minimum, maximum);
}
function authorizeTikTokWebR1Request(input) {
  const definition = R1_REQUESTS[input.operation];
  if (definition === undefined)
    throw new Error("TikTok R1 operation is not allowlisted");
  if (input.method.toUpperCase() !== "GET")
    throw new Error("TikTok R1 requests require GET");
  if (input.body !== undefined)
    throw new Error("TikTok R1 requests may not contain a body");
  const url = exactUrl(input.url, "TikTok R1 URL");
  if (url.pathname !== definition.path)
    throw new Error("TikTok R1 request path is not reviewed");
  const query = exactSingleQuery(url);
  const allowed = new Set(definition.requiredQueryParameters);
  const missing = definition.requiredQueryParameters.filter((name) => !query.has(name));
  const extra = [...query.keys()].filter((name) => !allowed.has(name));
  if (missing.length > 0)
    throw new Error(`TikTok R1 request omitted ${missing.join(", ")}`);
  if (extra.length > 0)
    throw new Error(`TikTok R1 request contained unsupported parameter ${extra.join(", ")}`);
  for (const [name, expected] of definition.fixedQueryParameters) {
    if (query.get(name) !== expected)
      throw new Error(`TikTok R1 request changed fixed parameter ${name}`);
  }
  if (input.operation === "feeds.for-you") {
    decimalQuery(query, "count", 1, 30);
  } else if (input.operation === "comments.list") {
    const postId = query.get("aweme_id");
    if (postId === undefined)
      throw new Error("TikTok comments request omitted aweme_id");
    decimalId(postId, "TikTok comments request aweme_id");
    decimalQuery(query, "count", 1, 50);
    decimalQuery(query, "cursor", 0, Number.MAX_SAFE_INTEGER);
  }
  return Object.freeze({
    operation: input.operation,
    method: "GET",
    path: definition.path,
    query: Object.freeze(Object.fromEntries([...query].sort(([left], [right]) => left.localeCompare(right))))
  });
}
var tiktokWebHeaderSinkPolicy = Object.freeze({
  browserManaged: Object.freeze([
    "cookie",
    "host",
    "user-agent",
    "content-length"
  ]),
  browserManagedPrefixes: Object.freeze(["sec-", "proxy-"]),
  fixedCodeHeaders: Object.freeze(["accept", "referer"]),
  inOriginEphemeral: Object.freeze(["tt-csrf-token"]),
  permittedRawSink: "network-request",
  persistentSinks: Object.freeze(["plan", "receipt", "log", "fixture"]),
  forbiddenSources: Object.freeze(["manifest", "adapter", "user-input"])
});
function hasAsciiControl(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127)
      return true;
  }
  return false;
}
function enforceTikTokWebHeaderSinkPolicy(input) {
  if (!isRecord(input.headers))
    throw new Error("TikTok headers must be an object");
  const entries = Object.entries(input.headers);
  if (input.sink !== "network-request") {
    if (entries.length > 0)
      throw new Error(`raw TikTok headers may not flow to ${input.sink}`);
    return Object.freeze({});
  }
  if (tiktokWebHeaderSinkPolicy.forbiddenSources.includes(input.source)) {
    if (entries.length > 0)
      throw new Error(`${input.source} may not supply TikTok request headers`);
    return Object.freeze({});
  }
  const normalized = {};
  for (const [rawName, value] of entries) {
    const name = rawName.toLowerCase();
    if (!/^[a-z0-9-]+$/u.test(name) || Object.hasOwn(normalized, name)) {
      throw new Error("TikTok request contained an invalid or duplicate header");
    }
    if (typeof value !== "string" || value.length < 1 || value.length > 8192 || hasAsciiControl(value)) {
      throw new Error(`TikTok request header ${name} had an invalid value`);
    }
    if (tiktokWebHeaderSinkPolicy.browserManaged.includes(name) || tiktokWebHeaderSinkPolicy.browserManagedPrefixes.some((prefix) => name.startsWith(prefix)))
      throw new Error(`TikTok request header ${name} must be browser-managed`);
    if (name === "tt-csrf-token") {
      if (input.source !== "in-origin-session" || !/^[A-Za-z0-9._~-]{8,4096}$/u.test(value)) {
        throw new Error("TikTok tt-csrf-token must come from the in-origin session");
      }
    } else if (name === "accept") {
      if (input.source !== "code" || value !== "application/json, text/plain, */*") {
        throw new Error("TikTok accept header must use the exact code-owned value");
      }
    } else if (name === "referer") {
      if (input.source !== "code" || value !== "https://www.tiktok.com/" && value !== "https://www.tiktok.com/foryou")
        throw new Error("TikTok referer header must use a reviewed code-owned value");
    } else {
      throw new Error(`TikTok request header ${name} is not allowlisted`);
    }
    normalized[name] = value;
  }
  return Object.freeze(normalized);
}
function parseTikTokWebViewerResponse(value) {
  const root = record(value, "TikTok current-account response");
  zeroStatus(root, ["statusCode", "status_code"], "TikTok current-account response");
  const userInfo = record(root.userInfo, "TikTok current-account response.userInfo");
  const user = record(userInfo.user, "TikTok current-account response.user");
  return Object.freeze({
    id: decimalId(user.id, "TikTok current-account user.id"),
    secUid: secUid(user.secUid, "TikTok current-account user.secUid"),
    handle: requiredString(user.uniqueId, "TikTok current-account user.uniqueId", 64),
    displayName: requiredString(user.nickname, "TikTok current-account user.nickname", 128)
  });
}
function safePublicHttpUrl(value, label) {
  if (value === undefined || value === null || value === "")
    return null;
  const text = requiredString(value, label, 2048);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an absolute HTTP URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:" || url.username !== "" || url.password !== "")
    throw new Error(`${label} must be a safe public HTTP URL`);
  return url.href;
}
function matchingExactCount(primary, secondary, key, label) {
  const first = integerLike(primary[key], `${label}.${key}`);
  if (secondary === null || secondary[key] === undefined)
    return first;
  const second = integerLike(secondary[key], `${label}V2.${key}`);
  if (first !== second)
    throw new Error(`TikTok profile response contained conflicting ${key} values`);
  return first;
}
function parseTikTokWebProfileResponse(value) {
  const viewer = parseTikTokWebViewerResponse(value);
  const root = record(value, "TikTok current-profile response");
  const userInfo = record(root.userInfo, "TikTok current-profile response.userInfo");
  const user = record(userInfo.user, "TikTok current-profile response.user");
  const stats = record(userInfo.stats, "TikTok current-profile response.stats");
  const statsV2 = userInfo.statsV2 === undefined ? null : record(userInfo.statsV2, "TikTok current-profile response.statsV2");
  const bioLink = isRecord(user.bioLink) ? user.bioLink : null;
  return Object.freeze({
    ...viewer,
    bio: user.signature === undefined ? null : boundedText(user.signature, "TikTok current-profile response.user.signature", 4096),
    websiteUrl: bioLink === null ? null : safePublicHttpUrl(bioLink.link ?? bioLink.url, "TikTok current-profile response.user.bioLink"),
    followers: matchingExactCount(stats, statsV2, "followerCount", "TikTok current-profile response.stats"),
    following: matchingExactCount(stats, statsV2, "followingCount", "TikTok current-profile response.stats"),
    likes: matchingExactCount(stats, statsV2, "heartCount", "TikTok current-profile response.stats")
  });
}
function normalizedAuthor(value, label, style) {
  const author = record(value, label);
  return Object.freeze({
    id: decimalId(style === "item" ? author.id : author.uid, `${label}.${style === "item" ? "id" : "uid"}`),
    secUid: secUid(style === "item" ? author.secUid : author.sec_uid, `${label}.${style === "item" ? "secUid" : "sec_uid"}`),
    handle: requiredString(style === "item" ? author.uniqueId : author.unique_id, `${label}.${style === "item" ? "uniqueId" : "unique_id"}`, 64),
    displayName: requiredString(author.nickname, `${label}.nickname`, 128)
  });
}
function normalizedItem(value, index) {
  const label = `TikTok feed item ${index + 1}`;
  const item = record(value, label);
  const id = decimalId(item.id, `${label}.id`);
  const author = normalizedAuthor(item.author, `${label}.author`, "item");
  const stats = record(item.stats, `${label}.stats`);
  const video = record(item.video, `${label}.video`);
  const videoId = optionalString(video.id, `${label}.video.id`, 128);
  const ratio = optionalString(video.ratio, `${label}.video.ratio`, 32);
  return Object.freeze({
    id,
    description: boundedText(item.desc, `${label}.desc`, 8192),
    createdAtUnix: integer(item.createTime, `${label}.createTime`, 0),
    author,
    viewerState: Object.freeze({
      liked: boolean(item.digged, `${label}.digged`),
      saved: boolean(item.collected, `${label}.collected`)
    }),
    metrics: Object.freeze({
      likes: integerLike(stats.diggCount, `${label}.stats.diggCount`),
      comments: integerLike(stats.commentCount, `${label}.stats.commentCount`),
      shares: integerLike(stats.shareCount, `${label}.stats.shareCount`),
      plays: integerLike(stats.playCount, `${label}.stats.playCount`),
      saves: stats.collectCount === undefined ? null : integerLike(stats.collectCount, `${label}.stats.collectCount`)
    }),
    media: Object.freeze({
      type: "video",
      id: videoId,
      durationSeconds: integer(video.duration, `${label}.video.duration`, 0, 24 * 60 * 60),
      width: integer(video.width, `${label}.video.width`, 1, 65535),
      height: integer(video.height, `${label}.video.height`, 1, 65535),
      ratio
    }),
    url: `https://www.tiktok.com/@${encodeURIComponent(author.handle)}/video/${id}`
  });
}
function normalizeTikTokWebFeedResponse(value, requestedLimit) {
  integer(requestedLimit, "TikTok requested feed limit", 1, 30);
  const root = record(value, "TikTok For You response");
  zeroStatus(root, ["statusCode", "status_code"], "TikTok For You response");
  if (!Array.isArray(root.itemList))
    throw new Error("TikTok For You response.itemList must be an array");
  if (root.itemList.length > requestedLimit) {
    throw new Error("TikTok For You response exceeded the requested complete-page limit");
  }
  return Object.freeze({
    posts: Object.freeze(root.itemList.map(normalizedItem)),
    hasMore: boolean(root.hasMore, "TikTok For You response.hasMore")
  });
}
function normalizedComment(value, index, requestedPostId) {
  const label = `TikTok comment ${index + 1}`;
  const comment = record(value, label);
  const returnedPostId = decimalId(comment.aweme_id, `${label}.aweme_id`);
  if (returnedPostId !== requestedPostId) {
    throw new Error("TikTok comments response did not bind the requested post");
  }
  const userDigged = integer(comment.user_digged, `${label}.user_digged`, 0, 1);
  return Object.freeze({
    id: decimalId(comment.cid, `${label}.cid`),
    postId: returnedPostId,
    text: boundedText(comment.text, `${label}.text`, 8192),
    createdAtUnix: integer(comment.create_time, `${label}.create_time`, 0),
    author: normalizedAuthor(comment.user, `${label}.user`, "comment"),
    parentCommentId: optionalString(comment.reply_id, `${label}.reply_id`, 32),
    repliedToCommentId: optionalString(comment.reply_to_reply_id, `${label}.reply_to_reply_id`, 32),
    replyCount: integer(comment.reply_comment_total, `${label}.reply_comment_total`, 0),
    likeCount: integer(comment.digg_count, `${label}.digg_count`, 0),
    viewerLiked: userDigged === 1
  });
}
function normalizeTikTokWebCommentsResponse(value, requestedPostIdValue, requestedLimit) {
  const requestedPostId = decimalId(requestedPostIdValue, "requested TikTok post ID");
  integer(requestedLimit, "TikTok requested comment limit", 1, 50);
  const root = record(value, "TikTok comments response");
  zeroStatus(root, ["status_code"], "TikTok comments response");
  if (!Array.isArray(root.comments))
    throw new Error("TikTok comments response.comments must be an array");
  if (root.comments.length > requestedLimit) {
    throw new Error("TikTok comments response exceeded the requested complete-page limit");
  }
  return Object.freeze({
    comments: Object.freeze(root.comments.map((comment, index) => normalizedComment(comment, index, requestedPostId))),
    cursor: integer(root.cursor, "TikTok comments response.cursor", 0),
    hasMore: integer(root.has_more, "TikTok comments response.has_more", 0, 1) === 1,
    total: integer(root.total, "TikTok comments response.total", 0)
  });
}
var tiktokWebStudioBundleEvidenceSnapshot = Object.freeze({
  schemaVersion: 1,
  role: "bundle-evidence-only",
  observedOn: "2026-08-22",
  origin: "https://www.tiktok.com",
  authentication: "browser-cookie-session",
  upload: Object.freeze({
    auth: "GET /api/v1/video/upload/auth/",
    apply: "GET /top/v1 Action=ApplyUploadInner Version=2020-11-19",
    transfer: Object.freeze([
      "POST /upload/v1/{oid} phase=init",
      "POST /upload/v1/{oid} phase=transfer",
      "POST /upload/v1/{oid} phase=finish"
    ]),
    commit: "POST /top/v1 Action=CommitUploadInner Version=2020-11-19",
    partBytes: 3145728
  }),
  publish: Object.freeze({
    create: "POST /tiktok/web/project/post/v1/",
    status: "GET /tiktok/web/project/status/v1/",
    postType: 3
  }),
  deletion: Object.freeze({
    detail: "GET /api/v1/post/detail/ item_id={post-id}",
    mutate: "POST /tiktok/post/edit/v1/ scene=1",
    deleteTypes: Object.freeze({ normal: 0, trashBin: 1 })
  }),
  unresolvedForDispatch: Object.freeze([
    "provider-selected upload node, TOS origin, and authenticated response binding",
    "mutating Studio common-query request envelopes",
    "exact authenticated upload, transfer, commit, publish, status, and recycle response envelopes",
    "fresh viewer and authored-target binding",
    "processing completion and independent exact-post presence or absence readback"
  ])
});
var tiktokWebSanitizedPublishCaptureEvidenceSnapshot = Object.freeze({
  schemaVersion: 1,
  role: "structural-live-evidence-only",
  observedOn: "2026-08-23",
  targetOrigin: "https://www.tiktok.com",
  observedEntries: 1344,
  writeCandidateCount: 5,
  writeCandidateSamples: 8,
  remoteOrigins: Object.freeze([
    "https://lf16-tiktok-web.tiktokcdn-us.com",
    "https://lf16-cdn-tos.tiktokcdn-us.com",
    "https://tos16-up-useast8.tiktokcdn-us.com",
    "https://tos19-up-useast8.tiktokcdn-us.com"
  ]),
  observedUploadOrigins: Object.freeze([
    "https://tos16-up-useast8.tiktokcdn-us.com",
    "https://tos19-up-useast8.tiktokcdn-us.com"
  ]),
  unresolvedForDispatch: Object.freeze([
    "semantic operation ownership for every retained write candidate",
    "exact route, query names and values, request fields, and credential sinks",
    "response-selected upload credential, header, and accepted-status binding",
    "current account, project, post, and audience response binding",
    "processing completion and independent exact-post readback"
  ])
});
var tiktokWebDisposableVideoLifecycleEvidenceSnapshot = Object.freeze({
  schemaVersion: 1,
  role: "live-authorized-disposable-cycle",
  observedOn: "2026-08-24",
  origin: "https://www.tiktok.com",
  media: Object.freeze({
    mediaType: "video/mp4",
    binding: "exact-plan-bound-private-fixture",
    audience: "private"
  }),
  publish: Object.freeze({
    uploadAuth: "GET /api/v1/video/upload/auth/ HTTP 200",
    applyCommitCycles: 2,
    projectCreate: "POST /tiktok/web/project/post/v1/ HTTP 200",
    projectResponseBinding: Object.freeze([
      "status_code=0",
      "project_id",
      "single_post_resp_list[0].item_id",
      "single_post_resp_list[0].status_code=0"
    ]),
    readback: Object.freeze([
      "bound current account",
      "exact item ID",
      "exact caption",
      "private visibility"
    ])
  }),
  recycle: Object.freeze({
    preflight: Object.freeze([
      "account-bound exact-caption content-list presence",
      "GET /api/v1/post/detail/ HTTP 200 with exact item binding",
      "exact caption binding",
      "is_recyclable=true permission"
    ]),
    mutation: Object.freeze({
      request: "POST /tiktok/post/edit/v1/ HTTP 200",
      scene: 1,
      deleteType: 1,
      acceptedResponseBinding: Object.freeze([
        "status_code=0",
        "exact item ID"
      ])
    }),
    readback: Object.freeze({
      absenceProven: false,
      contentListMissProvesAbsence: false,
      independentCanonicalObservation: "exact canonical post URL became a soft-200 shell without the target video, caption, or media",
      providerRecycleFolder: "app-only"
    })
  }),
  executableAudit: Object.freeze({
    containedBrowser: Object.freeze({
      availablePrimitive: "code-owned same-origin evaluation with bounded post-request network observation",
      state: "insufficient",
      blockers: Object.freeze([
        "no reviewed Studio interceptor revision is bound before dispatch",
        "network observation can attest emitted request metadata only after the write may have started",
        "a generic evaluated fetch does not prove ACrawler/ZTI attached the captured request shape"
      ])
    }),
    mediaPublish: Object.freeze({
      state: "capture-required",
      blockers: Object.freeze([
        "live TOS requests do not match the unexecuted phase-based multipart projections",
        "project publish requires in-origin ACrawler interception and AB-gated ZTI proof",
        "no reviewed proof-only transport can produce and bind those ephemeral values"
      ])
    }),
    contentDelete: Object.freeze({
      state: "capture-required",
      blockers: Object.freeze([
        "recycle dispatch requires in-origin ACrawler interception and AB-gated ZTI proof",
        "the cookie-only web-session client cannot generate or attest that proof",
        "post-list nonappearance and an unmarked canonical soft-200 shell are not strict tombstone evidence"
      ])
    })
  })
});
var TIKTOK_SANITIZED_CAPTURE_UPLOAD_ORIGINS = new Set(tiktokWebSanitizedPublishCaptureEvidenceSnapshot.observedUploadOrigins);
var tiktokWebStudioSecurityEvidenceSnapshot = Object.freeze({
  schemaVersion: 1,
  role: "bundle-evidence-only",
  observedOn: "2026-08-24",
  aid: 1988,
  baseQuery: Object.freeze({
    aid: "1988",
    ttp2TargetIdc: "useast8",
    verifyFp: "first-profile-read-only-request-only"
  }),
  acrawler: Object.freeze({
    intercept: true,
    mode: 513,
    paths: Object.freeze([
      "/api/v1/web/project/post",
      "/api/v1/item/create/bulk/",
      "/api/v1/item/create/",
      "/api/upload/search/user/",
      "/api/upload/challenge/sug/",
      "/api/post/item_list/",
      "/api/v1/user/profile/upload/",
      "/api/v1/video/upload/auth/",
      "/api/v1/draft/create_update/",
      "/tiktok/web/project/post/v1/",
      "/tiktok/web/project/cancel/v1/",
      "/tiktok/post/edit/v1/",
      "/api/user/list/"
    ])
  }),
  antiCsrf: Object.freeze({
    host: "www.tiktok.com",
    method: "POST",
    paths: Object.freeze([
      "/api/v1/post_schedule/ack/",
      "/api/v1/video/transcode/enable/"
    ])
  }),
  zti: Object.freeze({
    abGate: "creation_use_zti",
    certType: "header",
    scene: "tt_fetch",
    signVersion: 2,
    paths: Object.freeze([
      "/api/v1/web/project/post/",
      "/api/v1/item/create/bulk/",
      "/tiktok/web/project/post/v1/",
      "/tiktok/post/edit/v1/"
    ])
  })
});
var tiktokWebVideoUploadAuthLiveEvidenceSnapshot = Object.freeze({
  schemaVersion: 1,
  role: "live-read-only-evidence",
  observedOn: "2026-08-24",
  origin: "https://www.tiktok.com",
  request: "GET /api/v1/video/upload/auth/?aid=1988",
  status: 200,
  contentType: "application/json; charset=utf-8",
  storeRegion: "US",
  videoSpaceName: "tiktok",
  clockFormat: "YYYY-MM-DDTHH:mm:ssZ"
});
var TIKTOK_VIDEO_UPLOADER_REGIONS = Object.freeze({
  ttp: Object.freeze({
    publicRegion: "ttp",
    signingRegion: "US-TTP",
    targetIdc: null,
    useServerCurrentTime: true,
    videoUrl: "https://www.tiktok.com/top/v1"
  }),
  ttp2: Object.freeze({
    publicRegion: "ttp2",
    signingRegion: "US-TTP",
    targetIdc: "useast8",
    useServerCurrentTime: true,
    videoUrl: "https://www.tiktok.com/top/v1"
  })
});
var TIKTOK_TOS_CRC32_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0;bit < 8; bit += 1) {
    value = value >>> 1 ^ (value & 1 ? 3988292384 : 0);
  }
  return value >>> 0;
}));
function tikTokVideoSha256(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("TikTok video SHA-256 input must be exact bytes");
  }
  return createHash("sha256").update(bytes).digest("hex");
}
var TIKTOK_VIDEO_TRANSCODE_STATES = Object.freeze([
  "unknown",
  "init",
  "in-progress",
  "success",
  "failed"
]);
var TIKTOK_TRANSCODE_ENABLE_RUNTIME_SECURITY = Object.freeze({
  acrawler: "not-listed-for-route",
  antiCsrf: "required",
  credentials: "include",
  csrfHeader: "in-origin-ephemeral",
  execution: "authenticated-in-origin-studio-session",
  verifyFp: "not-requested-by-base-query",
  zti: "not-listed-for-route"
});
var TIKTOK_UNLISTED_STUDIO_RUNTIME_SECURITY = Object.freeze({
  acrawler: "not-listed-for-route",
  antiCsrf: "not-listed-for-route",
  credentials: "include",
  csrfHeader: "not-explicit-for-route",
  execution: "authenticated-in-origin-studio-session",
  verifyFp: "not-requested-by-base-query",
  zti: "not-listed-for-route"
});
var TIKTOK_VIDEO_VISIBILITY_TYPES = Object.freeze({
  public: 0,
  private: 1,
  friends: 2
});
var TIKTOK_PROJECT_STATUS_POLL_POLICY = Object.freeze({
  defaultDelayMs: 1e4,
  maxPostingObservations: 50,
  plainVideoInitialDelaysMs: Object.freeze([0, 1000, 1000, 1000, 1000]),
  videoEditedInitialDelaysMs: Object.freeze([1e4, 5000, 5000, 5000, 5000])
});
var TIKTOK_PROJECT_STATES = Object.freeze([
  "unknown",
  "posting",
  "success",
  "failed",
  "vediting"
]);
var TIKTOK_PROJECT_TASK_STATES = Object.freeze([
  "unknown",
  "posting",
  "success",
  "failed"
]);
var TIKTOK_DELETE_PERMISSION_MAX_JSON_BYTES = 1024 * 1024;
var TIKTOK_DELETE_PERMISSION_MAX_STRING_BYTES = 256 * 1024;
var TIKTOK_VIDEO_DURABLE_DISPATCH_ORDER = Object.freeze([
  "beforeDispatch",
  "ApplyUploadInner",
  "TOS.init",
  "TOS.transfer",
  "TOS.finish",
  "CommitUploadInner",
  "transcode.enable-if-required",
  "transcode.result-until-terminal-if-required",
  "project.publish",
  "project.status-until-terminal"
]);

// src/providers/tiktok-video-mp4.ts
var TIKTOK_MP4_COMPATIBILITY_POLICY = Object.freeze({
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
function tiktokMp4Metadata(bytes, label) {
  return isoBmffMp4VideoMetadata(bytes, label, TIKTOK_MP4_COMPATIBILITY_POLICY);
}

// src/providers/tiktok-web-runtime.ts
var TIKTOK_ORIGIN = "https://www.tiktok.com";
var MAX_VIEWER_BYTES = 2 * 1024 * 1024;
var MAX_READ_BYTES = 4 * 1024 * 1024;
var MAX_TIKTOK_VIDEO_BYTES = 128 * 1024 * 1024;
var DEFAULT_FEED_LIMIT = 20;
var DEFAULT_COMMENT_LIMIT = 20;
var TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
var TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "buffer")?.get;
var TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "byteLength")?.get;
function exactInputKeys(input, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(input, key)) || Object.keys(input).some((key) => !allowed.has(key)))
    throw new Error(`${label} contained unsupported or missing input fields`);
}
function exactFileInput(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "kind,reference" || value.kind !== "file" || typeof value.reference !== "string" || value.reference.length < 1 || value.reference.length > 4096 || /[\0\r\n]/u.test(value.reference))
    throw new Error(`${label} must be one exact plan-bound file`);
  return value;
}
function boundedInputText(value, label, maximum, allowEmpty = false) {
  if (typeof value !== "string" || !allowEmpty && value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be bounded text`);
  return value;
}
function exactBooleanInput(input, name) {
  const value = input[name];
  if (typeof value !== "boolean")
    throw new Error(`input.${name} must be boolean`);
  return value;
}
function exactTikTokVideoBinding(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("TikTok video binding must be one exact object");
  if (nodeTypes.isProxy(value)) {
    throw new Error("TikTok video binding must not be a proxy");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("TikTok video binding must use a plain prototype");
  }
  const expected = [
    "allowAiRemix",
    "allowComments",
    "allowContentReuse",
    "allowDuet",
    "allowStitch",
    "audience",
    "byteLength",
    "bytes",
    "caption",
    "commercialContent",
    "containsSyntheticMedia",
    "durationSeconds",
    "height",
    "mediaSha256",
    "mediaType",
    "width"
  ];
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== expected.length || ownKeys.some((key) => typeof key !== "string") || ownKeys.sort().join(",") !== [...expected].sort().join(","))
    throw new Error("TikTok video binding contained unsupported fields");
  const snapshot = Object.create(null);
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor))
      throw new Error("TikTok video binding must contain only enumerable data properties");
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}
function exactTikTokCreatorBoolean(binding, name) {
  const value = binding[name];
  if (typeof value !== "boolean") {
    throw new Error("TikTok video binding creator declarations are invalid");
  }
  return value;
}
function snapshotTikTokVideoBytes(value) {
  if (typeof value !== "object" || value === null || nodeTypes.isProxy(value) || !(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype || TYPED_ARRAY_BUFFER_GETTER === undefined || TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined)
    throw new Error("TikTok video binding must contain one bounded MP4");
  let buffer;
  let byteLength;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER.call(value);
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER.call(value);
  } catch {
    throw new Error("TikTok video binding must contain one bounded MP4");
  }
  if (typeof byteLength !== "number" || !Number.isSafeInteger(byteLength) || byteLength < 24 || byteLength > MAX_TIKTOK_VIDEO_BYTES || nodeTypes.isSharedArrayBuffer(buffer))
    throw new Error("TikTok video binding must contain one bounded MP4");
  let bytes;
  try {
    bytes = new Uint8Array(byteLength);
    Uint8Array.prototype.set.call(bytes, value);
  } catch {
    throw new Error("TikTok video binding must contain one bounded MP4");
  }
  return bytes;
}
async function materializeTikTokVideoPublishInput(input, fileResolver, operationDeadline) {
  const required = [
    "allow_ai_remix",
    "allow_comments",
    "allow_content_reuse",
    "allow_duet",
    "allow_stitch",
    "audience",
    "commercial_content",
    "contains_synthetic_media",
    "media"
  ];
  exactInputKeys(input, required, ["caption"], "TikTok video publishing");
  const media = exactFileInput(input.media, "input.media");
  const caption = input.caption === undefined ? null : boundedInputText(input.caption, "input.caption", 500);
  const audience = input.audience;
  if (audience !== "public" && audience !== "friends" && audience !== "private") {
    throw new Error("input.audience must be public, friends, or private");
  }
  if (input.commercial_content !== "none") {
    throw new Error("input.commercial_content must explicitly be none");
  }
  const allowAiRemix = exactBooleanInput(input, "allow_ai_remix");
  const allowComments = exactBooleanInput(input, "allow_comments");
  const allowContentReuse = exactBooleanInput(input, "allow_content_reuse");
  const allowDuet = exactBooleanInput(input, "allow_duet");
  const allowStitch = exactBooleanInput(input, "allow_stitch");
  const containsSyntheticMedia = exactBooleanInput(input, "contains_synthetic_media");
  if (fileResolver === undefined) {
    throw new Error("TikTok video upload requires the plan-bound file resolver");
  }
  const resolve = () => fileResolver([media]);
  const paths = operationDeadline === undefined ? await resolve() : await operationDeadline.run(resolve, "authenticated web operation deadline");
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("TikTok file resolver did not return one exact video path");
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined ? await open(paths[0], constants.O_RDONLY | noFollow) : await operationDeadline.run(() => open(paths[0], constants.O_RDONLY | noFollow), "authenticated web operation deadline");
  try {
    const before = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (!before.isFile() || before.size < 24 || before.size > MAX_TIKTOK_VIDEO_BYTES) {
      throw new Error("TikTok video must be a regular MP4 no larger than the 128 MiB in-memory publish limit");
    }
    const fileBytes = operationDeadline === undefined ? await handle.readFile() : await operationDeadline.run(() => handle.readFile(), "authenticated web operation deadline");
    const after = operationDeadline === undefined ? await handle.stat() : await operationDeadline.run(() => handle.stat(), "authenticated web operation deadline");
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || fileBytes.byteLength !== before.size)
      throw new Error("TikTok video changed while it was materialized");
    const bytes = new Uint8Array(fileBytes);
    const metadata = tiktokMp4Metadata(bytes, "TikTok video");
    const mediaSha256 = tikTokVideoSha256(bytes);
    return Object.freeze({
      allowAiRemix,
      allowComments,
      allowContentReuse,
      allowDuet,
      allowStitch,
      audience,
      bytes,
      byteLength: bytes.byteLength,
      caption,
      commercialContent: "none",
      containsSyntheticMedia,
      durationSeconds: metadata.durationSeconds,
      height: metadata.height,
      mediaType: "video/mp4",
      mediaSha256,
      width: metadata.width
    });
  } finally {
    await handle.close();
  }
}
function revalidateTikTokVideoPublishBindingForDispatch(value) {
  const binding = exactTikTokVideoBinding(value);
  const bytes = snapshotTikTokVideoBytes(binding.bytes);
  const metadata = tiktokMp4Metadata(bytes, "TikTok video binding");
  const mediaSha256 = tikTokVideoSha256(bytes);
  if (!Number.isSafeInteger(binding.byteLength) || binding.byteLength !== bytes.byteLength || typeof binding.mediaSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(binding.mediaSha256) || binding.mediaSha256 !== mediaSha256 || binding.durationSeconds !== metadata.durationSeconds || binding.height !== metadata.height || binding.width !== metadata.width)
    throw new Error("TikTok video binding changed from its exact bytes");
  const audience = binding.audience;
  if (audience !== "public" && audience !== "friends" && audience !== "private" || binding.commercialContent !== "none" || binding.mediaType !== "video/mp4")
    throw new Error("TikTok video binding creator declarations are invalid");
  const allowAiRemix = exactTikTokCreatorBoolean(binding, "allowAiRemix");
  const allowComments = exactTikTokCreatorBoolean(binding, "allowComments");
  const allowContentReuse = exactTikTokCreatorBoolean(binding, "allowContentReuse");
  const allowDuet = exactTikTokCreatorBoolean(binding, "allowDuet");
  const allowStitch = exactTikTokCreatorBoolean(binding, "allowStitch");
  const containsSyntheticMedia = exactTikTokCreatorBoolean(binding, "containsSyntheticMedia");
  const caption = binding.caption === null ? null : boundedInputText(binding.caption, "TikTok video binding caption", 500);
  const body = new Blob([bytes], { type: "video/mp4" });
  if (body.size !== bytes.byteLength || body.type !== "video/mp4") {
    throw new Error("TikTok video dispatch snapshot changed shape");
  }
  return Object.freeze({
    allowAiRemix,
    allowComments,
    allowContentReuse,
    allowDuet,
    allowStitch,
    audience,
    body,
    byteLength: bytes.byteLength,
    caption,
    commercialContent: "none",
    containsSyntheticMedia,
    durationSeconds: metadata.durationSeconds,
    height: metadata.height,
    mediaSha256,
    mediaType: "video/mp4",
    width: metadata.width
  });
}
function prepareTikTokPublishedPostDeleteInput(input) {
  exactInputKeys(input, ["post_id", "expected_caption"], [], "TikTok authored-post deletion");
  const postId = input.post_id;
  if (typeof postId !== "string" || !/^[0-9]{1,32}$/u.test(postId)) {
    throw new Error("input.post_id must be an exact decimal TikTok post ID");
  }
  return Object.freeze({
    expectedCaption: boundedInputText(input.expected_caption, "input.expected_caption", 500),
    postId
  });
}
function isTikTokOperation(value) {
  return TIKTOK_WEB_OPERATION_NAMES.includes(value);
}
function integerInput(input, name, fallback, minimum, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function stringInput(input, name, pattern, label) {
  const value = input[name];
  if (typeof value !== "string" || !pattern.test(value))
    throw new Error(`input.${name} must be ${label}`);
  return value;
}
function exactReadHeaders(referer) {
  return enforceTikTokWebHeaderSinkPolicy({
    source: "code",
    sink: "network-request",
    headers: {
      accept: "application/json, text/plain, */*",
      referer
    }
  });
}
async function currentViewer(client, maximumBytes = MAX_VIEWER_BYTES) {
  const url = new URL("/api/user/detail/self/", TIKTOK_ORIGIN);
  authorizeTikTokWebR1Request({
    operation: "viewer.current",
    url,
    method: "GET"
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders("https://www.tiktok.com/"),
    maxBytes: Math.min(maximumBytes, MAX_VIEWER_BYTES)
  });
  return parseTikTokWebViewerResponse(response);
}
async function currentProfile(client, maximumBytes = MAX_VIEWER_BYTES) {
  const url = new URL("/api/user/detail/self/", TIKTOK_ORIGIN);
  authorizeTikTokWebR1Request({
    operation: "profiles.current",
    url,
    method: "GET"
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders("https://www.tiktok.com/"),
    maxBytes: Math.min(maximumBytes, MAX_VIEWER_BYTES)
  });
  return parseTikTokWebProfileResponse(response);
}
function viewerSubject(viewer) {
  return `tiktok:uid:${viewer.id}/sec:${viewer.secUid}`;
}
async function probeTikTokWebSubject(auth, options = {}) {
  const client = await createWebSessionClient(TIKTOK_ORIGIN, auth, {
    timeoutMs: options.timeoutMs ?? 60000,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const viewer = await currentViewer(client);
  return viewerSubject(viewer);
}
async function requireBoundViewer(client, auth) {
  const viewer = await currentViewer(client);
  assertBoundViewer(auth, viewer);
  return viewer;
}
function assertBoundViewer(auth, viewer) {
  const expected = webSessionAuthSubject(auth);
  if (expected === null || !/^tiktok:uid:[0-9]{1,32}\/sec:[A-Za-z0-9._-]{16,256}$/u.test(expected)) {
    throw new Error("TikTok personalized operations require an auth locator bound to the exact viewer subject");
  }
  if (viewerSubject(viewer) !== expected) {
    throw new Error("TikTok browser session viewer no longer matches the confirmed auth subject");
  }
}
function profileInput(input) {
  const profile = input.profile;
  if (typeof profile !== "string" || !/^[A-Za-z0-9._]{2,24}$/u.test(profile)) {
    throw new Error("input.profile must be an exact TikTok handle without @");
  }
  return profile;
}
function observedAt(dependencies) {
  const now = dependencies?.now?.() ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) {
    throw new Error("TikTok profile observation time is invalid");
  }
  return new Date(now).toISOString();
}
function exactCount(value) {
  return Object.freeze({
    status: "available",
    value,
    precision: "exact",
    unit: "count"
  });
}
async function readProfile(client, input, auth, dependencies) {
  const requestedProfile = profileInput(input);
  const profile = await currentProfile(client);
  assertBoundViewer(auth, profile);
  if (profile.handle.toLocaleLowerCase("en-US") !== requestedProfile.toLocaleLowerCase("en-US")) {
    throw new Error("TikTok requested profile did not match the bound current account");
  }
  return Object.freeze({
    schemaVersion: 1,
    provider: "tiktok",
    target: Object.freeze({
      kind: "profile",
      id: profile.handle,
      url: `${TIKTOK_ORIGIN}/@${encodeURIComponent(profile.handle)}`
    }),
    observedAt: observedAt(dependencies),
    completeness: "complete",
    metrics: Object.freeze({
      followers: exactCount(profile.followers),
      following: exactCount(profile.following),
      likes: exactCount(profile.likes)
    }),
    metadata: Object.freeze({
      handle: profile.handle,
      displayName: profile.displayName,
      ...profile.bio === null ? {} : { bio: profile.bio },
      ...profile.websiteUrl === null ? {} : { websiteUrl: profile.websiteUrl }
    })
  });
}
async function readForYou(client, input, maximumBytes) {
  if (input.feed !== "for-you") {
    throw new Error("input.feed must be the observed signer-free for-you feed");
  }
  const limit = integerInput(input, "limit", DEFAULT_FEED_LIMIT, 1, 30);
  const url = new URL("/api/recommend/item_list/", TIKTOK_ORIGIN);
  url.searchParams.set("aid", "1988");
  url.searchParams.set("count", String(limit));
  authorizeTikTokWebR1Request({
    operation: "feeds.for-you",
    url,
    method: "GET"
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders("https://www.tiktok.com/foryou"),
    maxBytes: Math.min(maximumBytes, MAX_READ_BYTES)
  });
  return normalizeTikTokWebFeedResponse(response, limit);
}
async function readComments(client, input, maximumBytes) {
  const postId = stringInput(input, "post_id", /^[0-9]{1,32}$/u, "a decimal TikTok post ID");
  const cursor = integerInput(input, "cursor", 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = integerInput(input, "limit", DEFAULT_COMMENT_LIMIT, 1, 50);
  const url = new URL("/api/comment/list/", TIKTOK_ORIGIN);
  url.searchParams.set("aid", "1988");
  url.searchParams.set("aweme_id", postId);
  url.searchParams.set("count", String(limit));
  url.searchParams.set("cursor", String(cursor));
  authorizeTikTokWebR1Request({
    operation: "comments.list",
    url,
    method: "GET"
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: exactReadHeaders("https://www.tiktok.com/foryou"),
    maxBytes: Math.min(maximumBytes, MAX_READ_BYTES)
  });
  return normalizeTikTokWebCommentsResponse(response, postId, limit);
}
async function executeTikTokWebOperation(recipe, input, auth, options = {}) {
  if (recipe.site !== "tiktok" || !isTikTokOperation(recipe.action)) {
    throw new Error("TikTok authenticated web recipe is not installed");
  }
  const contract = TIKTOK_WEB_OPERATIONS[recipe.action];
  const contractVersion = "contractVersion" in contract ? contract.contractVersion : 1;
  if (recipe.contractVersion !== contractVersion) {
    throw new Error("TikTok authenticated web recipe is not installed");
  }
  if (contract.state !== "observed") {
    throw new Error(`TikTok authenticated web operation ${recipe.action} is capture-required: ${contract.reason}`);
  }
  if (recipe.action !== "profiles.read" && recipe.action !== "feeds.read" && recipe.action !== "comments.read") {
    throw new Error(`TikTok authenticated web operation ${recipe.action} has no executable reviewed contract`);
  }
  options.beforeDispatch;
  options.afterDispatchVerified;
  let client;
  try {
    client = await createWebSessionClient(TIKTOK_ORIGIN, auth, {
      timeoutMs: recipe.timeoutMs,
      ...options.signal === undefined ? {} : { signal: options.signal },
      ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
      ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
    });
  } catch (error) {
    if (recipe.action !== "profiles.read")
      throw error;
    return failedProviderRead("TikTok profile", error, `${TIKTOK_ORIGIN}/@${encodeURIComponent(profileInput(input))}`, { stage: "bootstrap", authenticated: true });
  }
  if (recipe.action === "profiles.read") {
    const finalUrl = `${TIKTOK_ORIGIN}/@${encodeURIComponent(profileInput(input))}`;
    try {
      const output2 = await readProfile(client, input, auth, options.dependencies);
      return {
        status: "succeeded",
        output: output2,
        finalUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 }
      };
    } catch (error) {
      return failedProviderRead("TikTok profile", error, finalUrl, {
        stage: "identity",
        authenticated: true,
        accountMismatch: (candidate) => candidate.message.includes("no longer matches") || candidate.message.includes("did not match the bound current account"),
        authRepairRequired: (candidate) => candidate.message.includes("auth locator bound")
      });
    }
  }
  const output = await (async () => {
    await requireBoundViewer(client, auth);
    return recipe.action === "feeds.read" ? readForYou(client, input, recipe.maxOutputBytes) : readComments(client, input, recipe.maxOutputBytes);
  })();
  return {
    status: "succeeded",
    output,
    finalUrl: recipe.action === "feeds.read" ? `${TIKTOK_ORIGIN}/foryou` : TIKTOK_ORIGIN,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
export {
  revalidateTikTokVideoPublishBindingForDispatch,
  probeTikTokWebSubject,
  prepareTikTokPublishedPostDeleteInput,
  materializeTikTokVideoPublishInput,
  executeTikTokWebOperation
};
