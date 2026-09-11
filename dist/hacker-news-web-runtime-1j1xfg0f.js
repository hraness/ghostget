// @bun
import {
  createWebSessionClient,
  webSessionAuthSubject
} from "./index-wn3s7nnj.js";
import"./index-j3ysa35f.js";
import"./index-vtj5zdgf.js";
import"./index-z1w83f81.js";

// src/providers/hacker-news-web.ts
import { renderCookieHeader } from "@hraness/kb/clip/cookies";
var HACKER_NEWS_WEB_OPERATION_NAMES = Object.freeze([
  "comments.create",
  "comments.read",
  "content.edit",
  "content.save",
  "feeds.read",
  "posts.publish",
  "posts.read",
  "reactions.set",
  "replies.create"
]);
var observed = (reason) => Object.freeze({
  effect: "read",
  risk: "R1",
  state: "observed",
  reason
});
var captureRequired = (risk, reason) => Object.freeze({
  effect: "write",
  risk,
  state: "capture-required",
  reason
});
var HACKER_NEWS_WEB_OPERATIONS = Object.freeze({
  "feeds.read": observed("signed-in /news HTML with exact athing/subtext projection"),
  "posts.read": observed("exact /item?id target with submission-row binding"),
  "comments.read": observed("exact /item?id target with bounded ordered comment projection"),
  "content.save": captureRequired("R2", "favorite and un-favorite links are request-bound; both real state fixtures and independent favorites-list readback are still required"),
  "reactions.set": captureRequired("R2", "upvote and unvote are request-bound human actions; exact undo fixture and readback are still required"),
  "comments.create": captureRequired("R3", "comment hmac form and externally visible response need an authorized fixture"),
  "replies.create": captureRequired("R3", "reply hmac form and exact parent/actor response binding need an authorized fixture"),
  "posts.publish": captureRequired("R3", "submission fnid/fnop form and returned item binding need an authorized fixture"),
  "content.edit": captureRequired("R3", "edit form is absent without an owned editable item and remains unobserved")
});
var HN_ORIGIN = "https://news.ycombinator.com";
var MAX_HTML_BYTES = 4 * 1024 * 1024;
function boundedHtml(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_HTML_BYTES || value.includes("\x00"))
    throw new Error(`${label} exceeded its reviewed HTML bound`);
  return value;
}
function boundedString(value, label, maximum, allowEmpty = false) {
  if (typeof value !== "string" || !allowEmpty && value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be bounded text`);
  return value;
}
function itemId(value, label) {
  const result = boundedString(value, label, 20);
  if (!/^[1-9][0-9]{0,19}$/u.test(result))
    throw new Error(`${label} must be a decimal Hacker News item ID`);
  return result;
}
function exactUrl(value, label) {
  let url;
  try {
    url = value instanceof URL ? new URL(value.href) : new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (url.origin !== HN_ORIGIN || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error(`${label} must use the exact ${HN_ORIGIN} origin`);
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
function exactNames(values, required, label) {
  const requiredSet = new Set(required);
  const missing = required.filter((name) => !values.has(name));
  const extra = [...values.keys()].filter((name) => !requiredSet.has(name));
  if (missing.length > 0)
    throw new Error(`${label} omitted ${missing.join(", ")}`);
  if (extra.length > 0)
    throw new Error(`${label} contained unsupported ${extra.join(", ")}`);
}
function authorizeHackerNewsReadRequest(input) {
  if (input.method.toUpperCase() !== "GET" || input.body !== undefined) {
    throw new Error("Hacker News authenticated reads require body-free GET");
  }
  const url = exactUrl(input.url, "Hacker News read URL");
  const query = exactParameters(url.searchParams, "Hacker News read query");
  if (input.operation === "viewer.current" || input.operation === "feeds.read") {
    if (url.pathname !== "/news" || query.size !== 0) {
      throw new Error("Hacker News news request changed its reviewed exchange");
    }
  } else {
    if (url.pathname !== "/item")
      throw new Error("Hacker News item request path is not reviewed");
    exactNames(query, ["id"], "Hacker News item query");
    const expected = itemId(input.targetId, "Hacker News requested item");
    if (query.get("id") !== expected) {
      throw new Error("Hacker News item query did not bind the requested item");
    }
  }
  return Object.freeze({
    operation: input.operation,
    method: "GET",
    path: url.pathname,
    queryNames: Object.freeze([...query.keys()].sort())
  });
}
function attribute(attributes, name) {
  const expression = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "iu");
  const match = expression.exec(attributes);
  return match?.[1] ?? match?.[2] ?? null;
}
function decodeHtml(value) {
  return value.replace(/&(?:#([0-9]{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/giu, (entity, decimal, hexadecimal, named) => {
    if (decimal !== undefined || hexadecimal !== undefined) {
      const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal === undefined ? 16 : 10);
      if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 1114111)
        return "\uFFFD";
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return "\uFFFD";
      }
    }
    switch (named?.toLowerCase()) {
      case undefined:
        return entity;
      case "amp":
        return "&";
      case "apos":
        return "'";
      case "gt":
        return ">";
      case "lt":
        return "<";
      case "nbsp":
        return " ";
      case "quot":
        return '"';
      default:
        return entity;
    }
  });
}
function plainText(value, label, maximum) {
  const withBreaks = value.replace(/<(?:br)\b[^>]*>/giu, `
`).replace(/<(?:p)\b[^>]*>/giu, `

`).replace(/<[^>]*>/gu, "");
  const text = decodeHtml(withBreaks).replace(/\r/gu, "").replace(/[ \t]+\n/gu, `
`).replace(/\n[ \t]+/gu, `
`).replace(/[ \t]{2,}/gu, " ").replace(/\n{3,}/gu, `

`).trim();
  return boundedString(text, label, maximum, true);
}
function athingSegments(value) {
  const html = boundedHtml(value, "Hacker News page");
  const starts = [];
  for (const match of html.matchAll(/<tr\b([^>]*)>/giu)) {
    const attributes = match[1] ?? "";
    const classValue = attribute(attributes, "class");
    if (classValue === null)
      continue;
    const classes = classValue.trim().split(/\s+/u).filter(Boolean);
    if (!classes.includes("athing"))
      continue;
    const id = itemId(attribute(attributes, "id"), "Hacker News athing ID");
    starts.push({
      index: match.index,
      id,
      classes: Object.freeze(classes)
    });
  }
  if (starts.length > 2000)
    throw new Error("Hacker News page exceeded its reviewed athing bound");
  return Object.freeze(starts.map((start, index) => Object.freeze({
    id: start.id,
    classes: start.classes,
    html: html.slice(start.index, starts[index + 1]?.index ?? html.length)
  })));
}
function anchors(html) {
  const result = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const attributes = match[1] ?? "";
    const rawHref = attribute(attributes, "href");
    if (rawHref === null)
      continue;
    result.push(Object.freeze({
      attributes,
      href: decodeHtml(rawHref),
      text: plainText(match[2] ?? "", "Hacker News anchor text", 1e4)
    }));
  }
  return Object.freeze(result);
}
function classFragment(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const expression = new RegExp(`<(?:span|div)\\b[^>]*class\\s*=\\s*(?:"[^"]*\\b${escaped}\\b[^"]*"|'[^']*\\b${escaped}\\b[^']*')[^>]*>([\\s\\S]*?)</(?:span|div)>`, "iu");
  return expression.exec(html)?.[1] ?? null;
}
function classAnchor(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const expression = new RegExp(`<a\\b([^>]*class\\s*=\\s*(?:"[^"]*\\b${escaped}\\b[^"]*"|'[^']*\\b${escaped}\\b[^']*')[^>]*)>([\\s\\S]*?)</a>`, "iu");
  const match = expression.exec(html);
  if (match === null)
    return null;
  const href = attribute(match[1] ?? "", "href");
  if (href === null)
    return null;
  return Object.freeze({
    href: decodeHtml(href),
    text: plainText(match[2] ?? "", `Hacker News ${className} text`, 1e4)
  });
}
function titleAnchor(segment) {
  const fragment = classFragment(segment.html, "titleline");
  if (fragment === null)
    throw new Error("Hacker News submission omitted its titleline");
  const first = anchors(fragment)[0];
  if (first === undefined)
    throw new Error("Hacker News submission omitted its title link");
  return first;
}
function projectedHref(value, label) {
  const href = boundedString(value, label, 4096);
  let url;
  try {
    url = new URL(href, HN_ORIGIN);
  } catch {
    throw new Error(`${label} was not a valid URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:" || url.username !== "" || url.password !== "")
    throw new Error(`${label} must be an HTTP URL without credentials`);
  return url.href;
}
function numericText(html, className, suffix) {
  const fragment = classFragment(html, className);
  if (fragment === null)
    return null;
  const text = plainText(fragment, `Hacker News ${className}`, 128);
  const match = new RegExp(`^([0-9]+)(?:\\s+${suffix})?$`, "iu").exec(text);
  if (match === null)
    throw new Error(`Hacker News ${className} did not contain a reviewed number`);
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number))
    throw new Error(`Hacker News ${className} exceeded its numeric bound`);
  return number;
}
function createdAt(html) {
  const expression = /<(?:span)\b([^>]*class\s*=\s*(?:"[^"]*\bage\b[^"]*"|'[^']*\bage\b[^']*')[^>]*)>/iu;
  const match = expression.exec(html);
  if (match === null)
    return null;
  const title = attribute(match[1] ?? "", "title");
  if (title === null)
    return null;
  const iso = title.split(/\s+/u, 1)[0] ?? "";
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$/u.test(iso)) {
    throw new Error("Hacker News age title did not contain a reviewed timestamp");
  }
  return `${iso}Z`;
}
function commentCount(segment) {
  for (const anchor of anchors(segment.html)) {
    let url;
    try {
      url = new URL(anchor.href, HN_ORIGIN);
    } catch {
      continue;
    }
    if (url.origin !== HN_ORIGIN || url.pathname !== "/item" || url.searchParams.get("id") !== segment.id)
      continue;
    if (anchor.text === "discuss")
      return 0;
    const match = /^([0-9]+)\s+comments?$/u.exec(anchor.text.replace(/\u00a0/gu, " "));
    if (match !== null)
      return Number(match[1]);
  }
  return 0;
}
function submissionBody(segment) {
  const fragment = classFragment(segment.html, "toptext");
  return fragment === null ? "" : plainText(fragment, "Hacker News submission body", 1e5);
}
function projectedPost(segment) {
  if (segment.classes.includes("comtr"))
    throw new Error("Hacker News post projection received a comment row");
  const title = titleAnchor(segment);
  const author = classAnchor(segment.html, "hnuser");
  return Object.freeze({
    id: segment.id,
    title: boundedString(title.text, "Hacker News post title", 1000, true),
    url: projectedHref(title.href, "Hacker News post URL"),
    author: author === null ? null : boundedString(author.text, "Hacker News post author", 64),
    body: submissionBody(segment),
    createdAt: createdAt(segment.html),
    score: numericText(segment.html, "score", "points?"),
    commentCount: commentCount(segment)
  });
}
function parseHackerNewsViewerHtml(value) {
  const html = boundedHtml(value, "Hacker News account page");
  const matches = [];
  for (const anchor of anchors(html)) {
    if (attribute(anchor.attributes, "id") !== "me")
      continue;
    matches.push(anchor);
  }
  if (matches.length !== 1)
    throw new Error("Hacker News page must contain exactly one current-account link");
  const current = matches[0];
  const url = exactUrl(new URL(current.href, HN_ORIGIN), "Hacker News current-account URL");
  if (url.pathname !== "/user")
    throw new Error("Hacker News current-account link changed its path");
  const query = exactParameters(url.searchParams, "Hacker News current-account query");
  exactNames(query, ["id"], "Hacker News current-account query");
  const username = boundedString(current.text, "Hacker News current username", 64);
  if (query.get("id") !== username)
    throw new Error("Hacker News current-account link did not bind its username");
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(username))
    throw new Error("Hacker News current username is invalid");
  return username;
}
function normalizeHackerNewsFeedHtml(value, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) {
    throw new Error("Hacker News feed limit must be between 1 and 30");
  }
  const html = boundedHtml(value, "Hacker News feed");
  const submissions = athingSegments(html).filter((segment) => !segment.classes.includes("comtr"));
  if (submissions.length < 1 || submissions.length > 30) {
    throw new Error("Hacker News feed contained an unreviewed submission count");
  }
  return Object.freeze({
    posts: Object.freeze(submissions.slice(0, limit).map(projectedPost)),
    hasMore: /<a\b[^>]*class\s*=\s*(?:"[^"]*\bmorelink\b[^"]*"|'[^']*\bmorelink\b[^']*')/iu.test(html)
  });
}
function exactSubmission(value, expectedId) {
  const target = itemId(expectedId, "Hacker News requested post");
  const submissions = athingSegments(value).filter((segment) => !segment.classes.includes("comtr"));
  if (submissions.length !== 1 || submissions[0]?.id !== target) {
    throw new Error("Hacker News item page did not bind the requested post");
  }
  return submissions[0];
}
function normalizeHackerNewsPostHtml(value, expectedId) {
  return Object.freeze({ post: projectedPost(exactSubmission(value, expectedId)) });
}
function commentDepth(segment) {
  const match = /<td\b([^>]*class\s*=\s*(?:"[^"]*\bind\b[^"]*"|'[^']*\bind\b[^']*')[^>]*)>/iu.exec(segment.html);
  if (match === null)
    throw new Error("Hacker News comment omitted its indentation");
  const raw = attribute(match[1] ?? "", "indent");
  if (raw === null || !/^(?:0|[1-9][0-9]?)$/u.test(raw)) {
    throw new Error("Hacker News comment indentation is invalid");
  }
  const depth = Number(raw);
  if (depth > 40)
    throw new Error("Hacker News comment indentation exceeded its reviewed bound");
  return depth;
}
function commentBody(segment) {
  const fragment = classFragment(segment.html, "commtext");
  if (fragment === null)
    return "";
  return plainText(fragment, "Hacker News comment body", 1e5);
}
function normalizeHackerNewsCommentsHtml(value, expectedPostId, limit) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Hacker News comment limit must be between 1 and 100");
  }
  const html = boundedHtml(value, "Hacker News item page");
  const post = projectedPost(exactSubmission(html, expectedPostId));
  const segments = athingSegments(html).filter((segment) => segment.classes.includes("comtr"));
  if (segments.length > 1000)
    throw new Error("Hacker News comment page exceeded its reviewed row bound");
  const ancestry = [];
  const comments = [];
  for (const segment of segments) {
    const depth = commentDepth(segment);
    const parentId = depth === 0 ? post.id : ancestry[depth - 1];
    if (parentId === undefined) {
      throw new Error("Hacker News comment indentation skipped its parent depth");
    }
    const explicitParent = /<a\b[^>]*href\s*=\s*(?:"#([0-9]+)"|'#([0-9]+)')[^>]*>\s*parent\s*<\/a>/iu.exec(segment.html);
    const explicitParentId = explicitParent?.[1] ?? explicitParent?.[2] ?? null;
    if (explicitParentId !== null && explicitParentId !== parentId) {
      throw new Error("Hacker News comment parent link disagreed with indentation order");
    }
    ancestry[depth] = segment.id;
    ancestry.length = depth + 1;
    if (comments.length >= limit)
      continue;
    const author = classAnchor(segment.html, "hnuser");
    comments.push(Object.freeze({
      id: segment.id,
      postId: post.id,
      parentId,
      author: author === null ? null : boundedString(author.text, "Hacker News comment author", 64),
      body: commentBody(segment),
      createdAt: createdAt(segment.html),
      depth
    }));
  }
  return Object.freeze({
    post,
    comments: Object.freeze(comments),
    truncated: segments.length > limit
  });
}
var unconsumedFavoriteActions = new WeakSet;

// src/providers/hacker-news-web-runtime.ts
var HN_ORIGIN2 = "https://news.ycombinator.com";
var MAX_HTML_BYTES2 = 4 * 1024 * 1024;
var DEFAULT_FEED_LIMIT = 30;
var DEFAULT_COMMENT_LIMIT = 100;
function isHackerNewsOperation(value) {
  return HACKER_NEWS_WEB_OPERATION_NAMES.includes(value);
}
function integerInput(input, name, fallback, minimum, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}
function itemIdInput(input, name) {
  const value = input[name];
  if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/u.test(value)) {
    throw new Error(`input.${name} must be a decimal Hacker News item ID`);
  }
  return value;
}
function readHeaders() {
  return Object.freeze({
    accept: "text/html",
    referer: `${HN_ORIGIN2}/`
  });
}
async function readNews(client, operation, maximumBytes) {
  const url = new URL("/news", HN_ORIGIN2);
  authorizeHackerNewsReadRequest({
    operation,
    url,
    method: "GET"
  });
  return client.requestText({
    url,
    headers: readHeaders(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(maximumBytes, MAX_HTML_BYTES2)
  });
}
function assertBoundViewer(auth, username) {
  const expected = webSessionAuthSubject(auth);
  if (expected === null || !/^hacker-news:[A-Za-z0-9_-]{1,64}$/u.test(expected)) {
    throw new Error("Hacker News authenticated operations require an auth locator bound to an exact hacker-news:<username> subject");
  }
  if (`hacker-news:${username}` !== expected) {
    throw new Error("Hacker News browser session viewer no longer matches the confirmed auth subject");
  }
  return expected;
}
async function probeHackerNewsWebSubject(auth, options = {}) {
  const client = await createWebSessionClient(HN_ORIGIN2, auth, {
    timeoutMs: options.timeoutMs ?? 60000,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const username = parseHackerNewsViewerHtml(await readNews(client, "viewer.current", MAX_HTML_BYTES2));
  return `hacker-news:${username}`;
}
async function readItemPage(client, operation, itemId2, maximumBytes) {
  const url = new URL("/item", HN_ORIGIN2);
  url.searchParams.set("id", itemId2);
  authorizeHackerNewsReadRequest({
    operation,
    url,
    method: "GET",
    targetId: itemId2
  });
  return client.requestText({
    url,
    headers: readHeaders(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(maximumBytes, MAX_HTML_BYTES2)
  });
}
async function executeHackerNewsWebOperation(recipe, input, auth, options = {}) {
  if (recipe.site !== "hacker-news" || recipe.contractVersion !== 1 || !isHackerNewsOperation(recipe.action))
    throw new Error("Hacker News authenticated web recipe is not installed");
  const contract = HACKER_NEWS_WEB_OPERATIONS[recipe.action];
  if (contract.state !== "observed") {
    throw new Error(`Hacker News authenticated web operation ${recipe.action} is capture-required: ${contract.reason}`);
  }
  if (recipe.action !== "feeds.read" && recipe.action !== "posts.read" && recipe.action !== "comments.read")
    throw new Error(`Hacker News authenticated web operation ${recipe.action} has no executable reviewed contract`);
  const client = await createWebSessionClient(HN_ORIGIN2, auth, {
    timeoutMs: recipe.timeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.operationDeadline === undefined ? {} : { operationDeadline: options.operationDeadline },
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies }
  });
  const newsHtml = await readNews(client, recipe.action === "feeds.read" ? "feeds.read" : "viewer.current", recipe.maxOutputBytes);
  assertBoundViewer(auth, parseHackerNewsViewerHtml(newsHtml));
  options.beforeDispatch;
  options.afterDispatchVerified;
  if (recipe.action === "feeds.read") {
    if (input.feed !== "news")
      throw new Error("input.feed must be the observed Hacker News news feed");
    const limit = integerInput(input, "limit", DEFAULT_FEED_LIMIT, 1, 30);
    return {
      status: "succeeded",
      output: normalizeHackerNewsFeedHtml(newsHtml, limit),
      finalUrl: `${HN_ORIGIN2}/news`,
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 }
    };
  }
  const idName = recipe.action === "posts.read" ? "item_id" : "post_id";
  const targetId = itemIdInput(input, idName);
  const itemHtml = await readItemPage(client, recipe.action, targetId, recipe.maxOutputBytes);
  const output = recipe.action === "posts.read" ? normalizeHackerNewsPostHtml(itemHtml, targetId) : normalizeHackerNewsCommentsHtml(itemHtml, targetId, integerInput(input, "limit", DEFAULT_COMMENT_LIMIT, 1, 100));
  return {
    status: "succeeded",
    output,
    finalUrl: `${HN_ORIGIN2}/item?id=${targetId}`,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
export {
  probeHackerNewsWebSubject,
  executeHackerNewsWebOperation
};
