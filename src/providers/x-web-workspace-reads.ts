import type { OperationInput } from "../model";
import {
  parseXSocialNotification,
  parseXSocialPost,
  parseXSocialTrend,
  X_SOCIAL_MODEL_VERSION,
  type XSocialPage,
  type XSocialTimelineEntry,
} from "./x-web-model";

/** Provider qualification, not merely whether a menu or a bundle name exists. */
export const xWebWorkspaceReadSupport = Object.freeze({
  home: true,
  following: true,
  "profile-posts": true,
  // A filtered UserTweets page, never an assertion of a complete repost collection.
  "profile-reposts": true,
  "profile-replies": false,
  "profile-highlights": false,
  likes: false,
  bookmarks: true,
  followers: true,
  "following-accounts": true,
  notifications: false,
  trending: false,
  "today-news": false,
} as const);

export type XWebDeferredRead = {
  readonly surface: "profile-replies" | "profile-highlights" | "likes" | "notifications" | "trending" | "today-news";
  readonly limit: number;
  readonly cursor: string | null;
  readonly target: string | null;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} has an unreviewed field`);
}

function bounded(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be a bounded string`);
  }
  return value;
}

function userId(value: unknown): string {
  const id = bounded(value, "X profile collection user_id", 19);
  if (!/^\d{1,19}$/u.test(id)) throw new Error("X profile collection user_id must be an exact numeric ID");
  return id;
}

/**
 * Recognize and close the proposed input surface before cookies, bootstrap,
 * bundles, or a browser can be touched. This deliberately contains no guessed
 * provider request variables, response roots, query IDs, or transport.
 */
export function deferredXWebWorkspaceRead(action: string, input: OperationInput): XWebDeferredRead | null {
  let surface: XWebDeferredRead["surface"];
  let target: string | null = null;
  let maximum = 50;
  if (action === "feeds.read") {
    const feed = input.feed;
    if (feed !== "user-replies" && feed !== "user-highlights" && feed !== "likes") return null;
    keys(input, ["feed", "user_id", "cursor", "limit"], "X profile collection input");
    surface = feed === "user-replies" ? "profile-replies" : feed === "user-highlights" ? "profile-highlights" : "likes";
    maximum = 100;
    // Likes is a viewer-owned collection; accepting a different target would
    // imply that X exposes another account's private liked-post collection.
    if (feed === "likes") {
      if (input.user_id !== undefined) throw new Error("X liked posts must bind the connected viewer, without user_id");
    } else target = userId(input.user_id);
  } else if (action === "notifications.list") {
    keys(input, ["cursor", "limit"], "X notifications input");
    surface = "notifications";
  } else if (action === "explore.read") {
    keys(input, ["source", "target", "cursor", "limit"], "X Explore input");
    if (input.source !== "trending" && input.source !== "today-news") throw new Error("X Explore source must be trending or today-news");
    surface = input.source;
    target = input.target === undefined ? null : bounded(input.target, "X Explore target", 4_096);
  } else return null;
  const limit = input.limit ?? 20;
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > maximum) {
    throw new Error(`X ${surface} limit must be an integer between 1 and ${maximum}`);
  }
  const cursor = input.cursor === undefined ? null : bounded(input.cursor, "X read cursor", 4_096);
  return Object.freeze({ surface, limit: limit as number, cursor, target });
}

function unavailable(value: Record<string, unknown>): XSocialTimelineEntry {
  keys(value, ["kind", "postId", "reason"], "X unavailable entry");
  if (!Object.hasOwn(value, "postId") || !Object.hasOwn(value, "reason")) throw new Error("X unavailable entry omitted its explicit unknowns");
  return Object.freeze({
    kind: "unavailable",
    postId: value.postId === null ? null : userId(value.postId),
    reason: value.reason === null ? null : bounded(value.reason, "X unavailable reason", 1_024),
  });
}

/**
 * Close an already normalized application page. These are DTO projections,
 * never parsers for an unobserved X response. Source-specific transport and
 * provider field mapping stay capture-required; ordering and unknown values
 * survive this application boundary.
 */
function page(value: unknown, source: "notifications" | "trending" | "todays-news", limit: number): XSocialPage {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("X discovery page limit must be between 1 and 50");
  const input = record(value, "X discovery page DTO");
  keys(input, ["modelVersion", "source", "items", "cursor", "terminatedDirections"], "X discovery page DTO");
  if (input.modelVersion !== X_SOCIAL_MODEL_VERSION || input.source !== source) throw new Error("X discovery page model/source did not bind the request");
  if (!Array.isArray(input.items) || input.items.length > limit) throw new Error("X discovery page exceeds its requested limit");
  const seen = new Set<string>();
  const items = input.items.map((value): XSocialTimelineEntry => {
    const item = record(value, "X discovery item DTO");
    let result: XSocialTimelineEntry;
    let identity: string | null;
    if (item.kind === "post") {
      keys(item, ["kind", "post"], "X post entry DTO");
      const post = parseXSocialPost(item.post);
      result = Object.freeze({ kind: "post", post });
      identity = `post:${post.id}`;
    } else if (item.kind === "unavailable") {
      result = unavailable(item);
      identity = result.kind === "unavailable" && result.postId !== null ? `post:${result.postId}` : null;
    } else if (source === "notifications" && item.kind === "notification") {
      result = parseXSocialNotification(item);
      identity = `notification:${result.id}`;
    } else if (source !== "notifications" && item.kind === "trend") {
      const trend = parseXSocialTrend(item);
      if (trend.source !== source) throw new Error("X trend source did not bind its Explore page");
      result = trend;
      identity = `trend:${trend.id}`;
    } else throw new Error("X discovery item kind is not admitted for this source");
    if (identity !== null) {
      if (seen.has(identity)) throw new Error("X discovery page repeated an item identity");
      seen.add(identity);
    }
    return result;
  });
  const cursor = input.cursor === null ? null : bounded(input.cursor, "X discovery page cursor", 4_096);
  if (!Array.isArray(input.terminatedDirections) || input.terminatedDirections.length > 2
    || input.terminatedDirections.some(direction => direction !== "Top" && direction !== "Bottom")
    || new Set(input.terminatedDirections).size !== input.terminatedDirections.length) {
    throw new Error("X discovery page termination directions are unreviewed");
  }
  if (cursor !== null && input.terminatedDirections.includes("Bottom")) throw new Error("X discovery page cursor contradicts its termination state");
  return Object.freeze({
    modelVersion: X_SOCIAL_MODEL_VERSION, source, items: Object.freeze(items), cursor,
    terminatedDirections: Object.freeze([...input.terminatedDirections] as string[]),
  });
}

export function parseXWebNotificationPage(value: unknown, limit: number): XSocialPage {
  return page(value, "notifications", limit);
}

export function parseXWebExplorePage(value: unknown, source: "trending" | "today-news", limit: number): XSocialPage {
  return page(value, source === "today-news" ? "todays-news" : "trending", limit);
}
