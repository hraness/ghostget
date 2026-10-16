import { randomUUID } from "node:crypto";
import { assertXWebContactsTargetBound, extractXWebGraphQlReadResponseRoot, normalizeXWebUrtTimeline, projectXWebFeedPage, type XWebFeedPage, type XWebFeedEntry, type XWebBundleQueryDescriptor } from "./x-web";
import { parseXSocialNotification, parseXSocialTrend, type XSocialActor, type XSocialNotification, type XSocialTrend } from "./x-web-model";

export type XWebCapturedNotificationsRequest = {
  readonly subject: string;
  readonly operationId: "notifications.all";
  readonly operationName: "NotificationsTimeline";
  readonly method: "GET";
  readonly variables: Readonly<{ timeline_type: "All"; count: number; cursor?: string }>;
};
export type XWebCapturedNotificationPage = Omit<XWebCapturedDiscoveryPage, "source" | "entries"> & {
  readonly source: "notifications";
  readonly entries: readonly (XWebFeedEntry | { readonly kind: "notification"; readonly id: string; readonly notification: XSocialNotification })[];
};

/** The separate first-party last-seen mutation is deliberately not a port. */
export function buildXWebNotificationsReadRequest(verifiedSubject: string, limit: number, cursor: string | null = null): XWebCapturedNotificationsRequest {
  return Object.freeze({
    subject: subject(verifiedSubject), operationId: "notifications.all", operationName: "NotificationsTimeline", method: "GET",
    variables: Object.freeze({ timeline_type: "All", count: pageLimit(limit), ...(cursor === null ? {} : { cursor: bounded(cursor, 4_096) }) }),
  });
}

function boundedArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error("X notification reference array escaped its bound");
  return value;
}

function notificationActor(value: unknown): XSocialActor | null {
  const reference = record(value);
  if (reference.__typename !== "TimelineNotificationUserRef") return null;
  const result = reference.user_results === undefined || reference.user_results === null ? null : record(reference.user_results).result;
  if (result === undefined || result === null) return null;
  const user = record(result);
  if (user.__typename !== "User") return null;
  const actorId = subject(user.rest_id);
  const core = user.core === undefined || user.core === null ? null : record(user.core);
  const legacy = user.legacy === undefined || user.legacy === null ? null : record(user.legacy);
  const handles = [core?.screen_name, legacy?.screen_name].filter(value => value !== undefined && value !== null).map(value => {
    const handle = bounded(value, 15);
    if (!/^[A-Za-z0-9_]{1,15}$/u.test(handle)) throw new Error("X notification actor handle is invalid");
    return handle.toLowerCase();
  });
  if (new Set(handles).size > 1) throw new Error("X notification actor handle disagreed across fields");
  const names = [core?.name, legacy?.name].filter(value => value !== undefined && value !== null).map(value => optionalPublicText(value, 1_000)!);
  if (new Set(names).size > 1) throw new Error("X notification actor name disagreed across fields");
  const name = names[0] ?? null;
  return Object.freeze({ id: actorId, handle: handles[0] ?? null, displayName: name !== null && /[\u0000-\u001f\u007f]/u.test(name) ? null : name });
}

function notificationPostId(value: unknown): string | null {
  const reference = record(value);
  if (reference.__typename !== "TimelineNotificationTweetRef") return null;
  const result = reference.tweet_results === undefined || reference.tweet_results === null ? null : record(reference.tweet_results).result;
  if (result === undefined || result === null) return null;
  const post = record(result);
  return post.__typename === "Tweet" ? subject(post.rest_id) : null;
}

function notificationTime(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^\d{1,16}$/u.test(value)) throw new Error("X notification timestamp is invalid");
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds > 8_640_000_000_000_000) throw new Error("X notification timestamp escaped its bound");
  return new Date(milliseconds).toISOString();
}

function projectCapturedNotification(item: Record<string, unknown>): XSocialNotification {
  const template = item.template === undefined || item.template === null ? null : record(item.template);
  const rich = item.rich_message === undefined || item.rich_message === null ? null : record(item.rich_message);
  const actors = new Map<string, XSocialActor>();
  for (const reference of boundedArray(template?.from_users ?? [], 100)) {
    const actor = notificationActor(reference);
    if (actor === null) continue;
    const previous = actors.get(actor.id);
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(actor)) throw new Error("X notification actor identity is ambiguous");
    actors.set(actor.id, actor);
  }
  const postIds = new Set<string>();
  for (const reference of boundedArray(template?.target_objects ?? [], 100)) {
    const id = notificationPostId(reference);
    if (id !== null) postIds.add(id);
  }
  return parseXSocialNotification({
    kind: "notification", id: bounded(item.id, 512),
    eventType: item.notification_icon === "heart_icon" ? "like" : item.notification_icon === "retweet_icon" ? "repost" : "other",
    createdAt: notificationTime(item.timestamp_ms), text: optionalPublicText(rich?.text, 10_000),
    actors: [...actors.values()], postIds: [...postIds], read: null, url: null,
  });
}

export function projectXWebNotificationsReadPage(response: unknown, verifiedSubject: string, limit: number): XWebCapturedNotificationPage {
  const boundSubject = subject(verifiedSubject);
  pageLimit(limit);
  const timeline = record(extractXWebGraphQlReadResponseRoot("notifications.all", response));
  const viewer = record(record(record(record(response).data).viewer_v2).user_results).result;
  assertXWebContactsTargetBound({ data: { user: { result: viewer } } }, boundSubject);
  const raw = rawItemContents(timeline);
  const normalized = normalizeXWebUrtTimeline(timeline);
  const entries: XWebCapturedNotificationPage["entries"][number][] = [];
  const seen = new Set<string>();
  let filtered = false;
  for (const item of normalized.items) {
    let entry: XWebCapturedNotificationPage["entries"][number];
    if (item.kind === "tweet") entry = Object.freeze({ kind: "post", id: item.tweetId, post: item.social });
    else if (item.kind === "unavailable") entry = Object.freeze({ kind: "unavailable", id: bounded(item.entryId, 512), postId: null, reason: optionalPublicText(item.reason, 10_000) });
    else if (item.kind === "other" && item.itemType === "TimelineNotification") {
      const value = raw.get(rawItemKey(item.entryId, item.moduleEntryId));
      if (value === undefined) throw new Error("X notification occurrence lost its provider payload");
      const notification = projectCapturedNotification(value);
      entry = Object.freeze({ kind: "notification", id: notification.id, notification });
    } else { filtered = true; continue; }
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) throw new Error("X notifications repeated an occurrence identity");
    seen.add(key); entries.push(entry);
  }
  if (normalized.terminatedDirections.some(value => value !== "Top" && value !== "Bottom")) throw new Error("X notifications returned an unreviewed termination direction");
  const entriesTruncated = entries.length > limit;
  const cursor = entriesTruncated || normalized.cursors.bottom === null ? null : bounded(normalized.cursors.bottom.value, 4_096);
  if (cursor !== null && normalized.terminatedDirections.includes("Bottom")) throw new Error("X notifications continuation contradicted termination");
  return Object.freeze({ modelVersion: 1, source: "notifications", entries: Object.freeze(entries.slice(0, limit)), cursor,
    terminatedDirections: normalized.terminatedDirections, entriesTruncated, filtered: filtered || entriesTruncated });
}

export type XWebCapturedExplorePageRequest = {
  readonly subject: string;
  readonly operationId: "explore.page";
  readonly operationName: "ExplorePage";
  readonly method: "GET";
  readonly variables: Readonly<{ cursor: "" }>;
};
export type XWebCapturedTrendingRequest = {
  readonly subject: string;
  readonly operationId: "explore.timeline";
  readonly operationName: "GenericTimelineById";
  readonly method: "GET";
  readonly variables: Readonly<{ timelineId: string; count: number; withQuickPromoteEligibilityTweetFields: true; cursor?: string }>;
};
export type XWebCapturedDiscoveryPage = {
  readonly modelVersion: 1;
  readonly source: "trending" | "today-news";
  readonly entries: readonly (XWebFeedEntry | { readonly kind: "trend"; readonly id: string; readonly trend: XSocialTrend; readonly target?: XWebDiscoveryTarget })[];
  readonly cursor: string | null;
  readonly terminatedDirections: readonly string[];
  readonly entriesTruncated: boolean;
  readonly filtered: boolean;
};

export type XWebCapturedNewsRequest = {
  readonly subject: string;
  readonly operationId: "explore.news";
  readonly operationName: "useStoryTopicQuery";
  readonly method: "GET";
  readonly variables: Readonly<{ limit: 3; rest_id: "Top Stories" }>;
};

/** The NewsSidebar public source fixes the initial personalized topic and size. */
export function buildXWebNewsReadRequest(verifiedSubject: string): XWebCapturedNewsRequest {
  return Object.freeze({ subject: subject(verifiedSubject), operationId: "explore.news", operationName: "useStoryTopicQuery", method: "GET",
    variables: Object.freeze({ limit: 3, rest_id: "Top Stories" }) });
}

/**
 * This one reviewed Relay params shape has no classic feature metadata.
 * It does not admit other Relay operations, arbitrary query text or execution.
 */
export function parseXWebNewsRelayBundleDescriptors(value: string): readonly XWebBundleQueryDescriptor[] {
  if (value.length > 16_777_216) throw new Error("X first-party bundle exceeded its byte limit");
  const pattern = /params:\{id:"([A-Za-z0-9_-]{8,128})",metadata:\{\},name:"useStoryTopicQuery",operationKind:"query",text:null\}/gu;
  return Object.freeze([...value.matchAll(pattern)].map(match => Object.freeze({
    queryId: match[1]!, operationName: "useStoryTopicQuery", operationType: "query" as const,
    metadata: Object.freeze({ featureSwitches: Object.freeze([]), fieldToggles: Object.freeze([]) }),
  })));
}

function newsPostCount(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && /^\d{1,16}$/u.test(value)) value = Number(value);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("X news post count must be an exact bounded integer");
  return value;
}

/** Exact StoryTopic news cards. Their story-detail transport is not inferred. */
export function projectXWebNewsReadPage(response: unknown, verifiedSubject: string, limit: number): XWebCapturedDiscoveryPage {
  subject(verifiedSubject); pageLimit(limit);
  const envelope = record(response);
  if (envelope.errors !== undefined && (!Array.isArray(envelope.errors) || envelope.errors.length !== 0)) throw new Error("X news response contained GraphQL errors");
  const topic = record(record(envelope.data).story_topic);
  if (topic.__typename !== undefined && topic.__typename !== "StoryTopic") throw new Error("X news response returned an unreviewed topic typename");
  const stories = record(topic.stories);
  if (!Array.isArray(stories.items) || stories.items.length > 100) throw new Error("X news story array escaped its bound");
  const entries: XWebCapturedDiscoveryPage["entries"][number][] = [];
  const seen = new Set<string>();
  let filtered = false;
  for (const value of stories.items) {
    const reference = record(record(value).trend_results);
    if (reference.result === null || reference.result === undefined) { filtered = true; continue; }
    const story = record(reference.result);
    if (story.__typename !== "AiTrend") { filtered = true; continue; }
    const storyId = bounded(story.rest_id, 512);
    bounded(story.id, 512);
    if (seen.has(storyId)) throw new Error("X news repeated a story identity");
    seen.add(storyId);
    const core = record(story.core);
    const trend = parseXSocialTrend({
      kind: "trend", id: storyId, source: "todays-news", title: bounded(core.name, 1_000),
      description: optionalPublicText(core.hook, 10_000), category: optionalPublicText(core.category, 256),
      postCount: newsPostCount(story.post_count), query: null, url: `https://x.com/i/trending/${encodeURIComponent(storyId)}`,
    });
    // No opaque target until a separate observed story-detail route is admitted.
    entries.push(Object.freeze({ kind: "trend", id: storyId, trend }));
  }
  const entriesTruncated = entries.length > limit;
  return Object.freeze({ modelVersion: 1, source: "today-news", entries: Object.freeze(entries.slice(0, limit)), cursor: null,
    terminatedDirections: Object.freeze([]), entriesTruncated, filtered: filtered || entriesTruncated });
}

/** The empty initial cursor is an exact first-party observation, not omission. */
export function buildXWebExplorePageReadRequest(verifiedSubject: string): XWebCapturedExplorePageRequest {
  return Object.freeze({ subject: subject(verifiedSubject), operationId: "explore.page", operationName: "ExplorePage", method: "GET", variables: Object.freeze({ cursor: "" }) });
}

/** Select the provider's Trending tab by its captured semantic ID. */
export function selectXWebTrendingTimeline(response: unknown): XWebDiscoveryTarget {
  const page = record(extractXWebGraphQlReadResponseRoot("explore.page", response));
  const body = record(page.body);
  if (!Array.isArray(body.timelines) || body.timelines.length > 20) throw new Error("X Explore configuration omitted its bounded timelines");
  const matching = body.timelines.map(value => record(value)).filter(tab => tab.id === "trending");
  if (matching.length !== 1) throw new Error("X Explore configuration did not bind one Trending tab");
  const timeline = record(matching[0]!.timeline);
  return parseXWebDiscoveryTarget({ source: "trending", kind: "timeline", value: bounded(timeline.id, 4_096) });
}

function trendingContinuation(value: unknown, expectedSubject: string, timelineId: string): string {
  const text = bounded(value, 4_096);
  let decoded: unknown;
  try { decoded = JSON.parse(text); } catch { throw new Error("X Trending continuation is invalid"); }
  const item = record(decoded);
  keys(item, ["version", "subject", "timelineId", "cursor"]);
  if (item.version !== 1 || item.subject !== expectedSubject || item.timelineId !== timelineId) {
    throw new Error("X Trending continuation no longer binds this viewer and provider timeline");
  }
  return bounded(item.cursor, 4_096);
}

export function buildXWebTrendingReadRequest(verifiedSubject: string, providerTimelineId: string, limit: number, cursor: string | null = null): XWebCapturedTrendingRequest {
  const boundSubject = subject(verifiedSubject);
  const timelineId = bounded(providerTimelineId, 4_096);
  const count = pageLimit(limit);
  return Object.freeze({
    subject: boundSubject, operationId: "explore.timeline", operationName: "GenericTimelineById", method: "GET",
    variables: Object.freeze({ timelineId, count, withQuickPromoteEligibilityTweetFields: true,
      ...(cursor === null ? {} : { cursor: trendingContinuation(cursor, boundSubject, timelineId) }) }),
  });
}

function rawItemKey(entryId: string, moduleId: string | null): string { return JSON.stringify([moduleId, entryId]); }

/** Retain raw item payloads while the existing URT reducer determines membership/order. */
function rawItemContents(timeline: Record<string, unknown>): ReadonlyMap<string, Record<string, unknown>> {
  if (!Array.isArray(timeline.instructions) || timeline.instructions.length > 100) throw new Error("X discovery instructions escaped their bound");
  const items = new Map<string, Record<string, unknown>>();
  let rows = 0;
  const add = (value: unknown): void => {
    if (++rows > 5_000) throw new Error("X discovery timeline escaped its row bound");
    const entry = record(value);
    const entryId = bounded(entry.entryId, 512);
    const content = record(entry.content);
    if (content.entryType === "TimelineTimelineItem") items.set(rawItemKey(entryId, null), record(content.itemContent));
    else if (content.entryType === "TimelineTimelineModule") {
      if (!Array.isArray(content.items) || content.items.length > 5_000) throw new Error("X discovery module escaped its row bound");
      for (const value of content.items) {
        if (++rows > 5_000) throw new Error("X discovery timeline escaped its row bound");
        const moduleItem = record(value);
        items.set(rawItemKey(bounded(moduleItem.entryId, 512), entryId), record(record(moduleItem.item).itemContent));
      }
    }
  };
  for (const value of timeline.instructions) {
    const instruction = record(value);
    if (instruction.type === "TimelineAddEntries") {
      if (!Array.isArray(instruction.entries) || instruction.entries.length > 5_000) throw new Error("X discovery additions escaped their row bound");
      for (const entry of instruction.entries) add(entry);
    } else if (instruction.type === "TimelineReplaceEntry" || instruction.type === "TimelinePinEntry") add(instruction.entry);
  }
  return items;
}

function optionalPublicText(value: unknown, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error("X discovery text escaped its public text bound");
  }
  return value;
}

/** The public DeepLink formatter maps only this native route's query to search. */
function capturedTrendSearch(candidate: string | null, type: unknown): { readonly query: string; readonly url: string } | null {
  if (candidate === null || type !== "DeepLink" || candidate.trim() !== candidate) return null;
  let native: URL;
  try { native = new URL(candidate); } catch { return null; }
  if (native.protocol !== "twitter:" || native.hostname !== "search" || !(["", "/"].includes(native.pathname)) || native.port !== ""
    || native.username !== "" || native.password !== "" || native.hash !== "") return null;
  const keys = [...native.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.some(key => !["query", "src", "vertical", "searchType", "type", "pt", "pc"].includes(key))) return null;
  if (native.searchParams.get("type") === "users") return null;
  // URLSearchParams deliberately tolerates malformed percent/UTF8 sequences;
  // provider navigation must not silently replace them with another query.
  try {
    for (const part of native.search.slice(1).split("&")) decodeURIComponent(part.replaceAll("+", " "));
  } catch { return null; }
  const query = native.searchParams.get("query");
  if (query === null || query.trim().length === 0 || query.length > 512 || /[\u0000-\u001f\u007f]/u.test(query)) return null;
  const url = new URL("https://x.com/search");
  url.searchParams.set("q", query);
  return Object.freeze({ query, url: url.href });
}

function projectCapturedTrend(item: Record<string, unknown>, occurrenceId: string): { readonly trend: XSocialTrend; readonly target?: XWebDiscoveryTarget } {
  const metadata = item.trend_metadata === undefined || item.trend_metadata === null ? null : record(item.trend_metadata);
  const target = item.trend_url === undefined || item.trend_url === null ? null : record(item.trend_url);
  // Provider URLs never select a transport endpoint. A fixed native search link
  // may supply only a bounded query for the existing semantic search operation.
  const candidate = target === null ? null : optionalPublicText(target.url, 4_096);
  const search = capturedTrendSearch(candidate, target?.urlType);
  const url = search?.url ?? (candidate !== null && /^https?:\/\//u.test(candidate) ? candidate : null);
  const trend = parseXSocialTrend({
    kind: "trend", id: occurrenceId, source: "trending", title: bounded(item.name, 1_000),
    description: optionalPublicText(metadata?.meta_description, 10_000),
    category: optionalPublicText(metadata?.domain_context, 256),
    postCount: null, query: search?.query ?? null, url,
  });
  return Object.freeze({ trend, ...(search === null ? {} : { target: parseXWebDiscoveryTarget({ source: "trending", kind: "search", value: search.query }) }) });
}

/** Projection of the exact GenericTimelineById URT root; no mark-read traffic. */
export function projectXWebTrendingReadPage(response: unknown, verifiedSubject: string, providerTimelineId: string, limit: number): XWebCapturedDiscoveryPage {
  const boundSubject = subject(verifiedSubject);
  const timelineId = bounded(providerTimelineId, 4_096);
  pageLimit(limit);
  const timeline = record(extractXWebGraphQlReadResponseRoot("explore.timeline", response));
  const raw = rawItemContents(timeline);
  const normalized = normalizeXWebUrtTimeline(timeline);
  const entries: XWebCapturedDiscoveryPage["entries"][number][] = [];
  const seen = new Set<string>();
  let filtered = false;
  for (const item of normalized.items) {
    let entry: XWebCapturedDiscoveryPage["entries"][number];
    if (item.kind === "tweet") entry = Object.freeze({ kind: "post", id: item.tweetId, post: item.social });
    else if (item.kind === "unavailable") entry = Object.freeze({ kind: "unavailable", id: bounded(item.entryId, 512), postId: null, reason: optionalPublicText(item.reason, 10_000) });
    else if (item.kind === "other" && item.itemType === "TimelineTrend") {
      const value = raw.get(rawItemKey(item.entryId, item.moduleEntryId));
      if (value === undefined) throw new Error("X Trending occurrence lost its provider payload");
      const projected = projectCapturedTrend(value, bounded(item.entryId, 512));
      entry = Object.freeze({ kind: "trend", id: projected.trend.id, ...projected });
    } else { filtered = true; continue; }
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) throw new Error("X Trending repeated an occurrence identity");
    seen.add(key); entries.push(entry);
  }
  if (normalized.terminatedDirections.some(value => value !== "Top" && value !== "Bottom")) throw new Error("X Trending returned an unreviewed termination direction");
  const entriesTruncated = entries.length > limit;
  let cursor: string | null = null;
  if (!entriesTruncated && normalized.cursors.bottom !== null) {
    if (normalized.terminatedDirections.includes("Bottom")) throw new Error("X Trending continuation contradicted termination");
    cursor = bounded(JSON.stringify({ version: 1, subject: boundSubject, timelineId, cursor: bounded(normalized.cursors.bottom.value, 4_096) }), 4_096);
  }
  return Object.freeze({ modelVersion: 1, source: "trending", entries: Object.freeze(entries.slice(0, limit)), cursor,
    terminatedDirections: normalized.terminatedDirections, entriesTruncated, filtered: filtered || entriesTruncated });
}

export type XWebCapturedLikesRequest = {
  readonly subject: string;
  readonly operationId: "feeds.likes";
  readonly operationName: "Likes";
  readonly method: "GET";
  readonly variables: Readonly<{
    userId: string;
    count: number;
    cursor?: string;
    includePromotedContent: false;
    withClientEventToken: false;
    withBirdwatchNotes: false;
    withVoice: true;
  }>;
};

function subject(value: unknown): string {
  const result = bounded(value, 19);
  if (!/^\d{1,19}$/u.test(result)) throw new Error("X captured read requires an exact verified subject");
  return result;
}

function pageLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 50) {
    throw new Error("X captured read limit must be between 1 and 50");
  }
  return value;
}

/**
 * The runtime must obtain the subject through its current Viewer preflight.
 * This pure builder grants no auth and exposes no caller-selected route.
 * Request flags and root were observed in the 2026-10-16 first-party capture;
 * the public current main bundle also fixes withClientEventToken to false.
 */
export function buildXWebLikesReadRequest(verifiedSubject: string, limit: number, cursor: string | null = null): XWebCapturedLikesRequest {
  const boundSubject = subject(verifiedSubject);
  const count = pageLimit(limit);
  const continuation = cursor === null ? null : bounded(cursor, 4_096);
  return Object.freeze({
    subject: boundSubject, operationId: "feeds.likes", operationName: "Likes", method: "GET",
    variables: Object.freeze({
      userId: boundSubject, count, ...(continuation === null ? {} : { cursor: continuation }),
      includePromotedContent: false, withClientEventToken: false, withBirdwatchNotes: false, withVoice: true,
    }),
  });
}

/** Viewer-owned collection binding concerns its root, never each liked author. */
export function projectXWebLikesReadPage(response: unknown, verifiedSubject: string, limit: number): XWebFeedPage {
  const boundSubject = subject(verifiedSubject);
  pageLimit(limit);
  assertXWebContactsTargetBound(response, boundSubject);
  return projectXWebFeedPage("feeds.likes", response, limit);
}

/** Discovery targets are provider data, never caller-selected URLs or routes. */
export type XWebDiscoveryTarget = {
  readonly source: "trending" | "today-news";
  readonly kind: "timeline" | "story" | "search";
  readonly value: string;
};

export type XWebDiscoveryTargetBinding = {
  readonly accountId: string;
  readonly subject: string;
  readonly revision: string;
};

export const X_WEB_DISCOVERY_TARGET_BOUNDS = Object.freeze({
  maxEntries: 128,
  ttlMs: 600_000,
  maxValueCharacters: 4_096,
});

type StoredTarget = {
  readonly binding: XWebDiscoveryTargetBinding;
  readonly target: XWebDiscoveryTarget;
  readonly expiresAt: number;
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("X discovery target must be an object");
  }
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, expected: readonly string[]): void {
  if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) {
    throw new Error("X discovery target has unreviewed fields");
  }
}

function bounded(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("X discovery target contains an invalid bounded value");
  }
  return value;
}

function source(value: unknown): XWebDiscoveryTarget["source"] {
  if (value !== "trending" && value !== "today-news") throw new Error("X discovery target source is unsupported");
  return value;
}

function binding(value: unknown): XWebDiscoveryTargetBinding {
  const item = record(value);
  keys(item, ["accountId", "subject", "revision"]);
  const subject = bounded(item.subject, 19);
  if (!/^\d{1,19}$/u.test(subject)) throw new Error("X discovery target subject must be numeric");
  return Object.freeze({ accountId: bounded(item.accountId, 512), subject, revision: bounded(item.revision, 512) });
}

/**
 * Validate only the internal descriptor emitted by an owned provider parser.
 * This does not qualify a route or authorize an executable provider request.
 */
export function parseXWebDiscoveryTarget(value: unknown): XWebDiscoveryTarget {
  const item = record(value);
  keys(item, ["source", "kind", "value"]);
  if (item.kind !== "timeline" && item.kind !== "story" && item.kind !== "search") throw new Error("X discovery target kind is unsupported");
  const targetSource = source(item.source);
  const targetValue = bounded(item.value, item.kind === "search" ? 512 : X_WEB_DISCOVERY_TARGET_BOUNDS.maxValueCharacters);
  if (item.kind === "search" && (targetSource !== "trending" || targetValue.trim().length === 0)) throw new Error("X search discovery target is unsupported");
  return Object.freeze({ source: targetSource, kind: item.kind, value: targetValue });
}

export class XWebDiscoveryTargetUnavailableError extends Error {
  readonly code = "X_DISCOVERY_TARGET_UNAVAILABLE";
  constructor() {
    super("This X discovery target is unavailable. Refresh its source to select it again.");
    this.name = "XWebDiscoveryTargetUnavailableError";
  }
}

/**
 * One app-host's bounded, ephemeral target capability map. Public tokens contain
 * neither the provider target nor an encoded query. Account replacement, source
 * switching, expiry, eviction and host restart all require a fresh selection.
 * The caller must issue targets only from admitted provider projections; this
 * store supplies no provider transport and never turns a URL into a request.
 */
export class XWebDiscoveryTargetStore {
  private readonly targets = new Map<string, StoredTarget>();

  constructor(private readonly now: () => number = Date.now) {}

  private sweep(now: number): void {
    for (const [token, target] of this.targets) {
      if (target.expiresAt <= now) this.targets.delete(token);
    }
  }

  issue(account: XWebDiscoveryTargetBinding, target: XWebDiscoveryTarget): string {
    const boundAccount = binding(account);
    const boundTarget = parseXWebDiscoveryTarget(target);
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - X_WEB_DISCOVERY_TARGET_BOUNDS.ttlMs) {
      throw new Error("X discovery target clock is invalid");
    }
    this.sweep(now);
    // Every entry is derived read data. Eviction never discards action state.
    if (this.targets.size >= X_WEB_DISCOVERY_TARGET_BOUNDS.maxEntries) {
      this.targets.delete(this.targets.keys().next().value!);
    }
    let token = `xdt1_${randomUUID()}`;
    for (let attempt = 0; this.targets.has(token) && attempt < 2; attempt += 1) token = `xdt1_${randomUUID()}`;
    if (this.targets.has(token)) throw new Error("X discovery target could not issue a unique selection");
    this.targets.set(token, Object.freeze({ binding: boundAccount, target: boundTarget, expiresAt: now + X_WEB_DISCOVERY_TARGET_BOUNDS.ttlMs }));
    return token;
  }

  resolve(token: unknown, account: XWebDiscoveryTargetBinding, requestedSource: XWebDiscoveryTarget["source"]): XWebDiscoveryTarget {
    const boundAccount = binding(account);
    const boundSource = source(requestedSource);
    if (typeof token !== "string" || !/^xdt1_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(token)) {
      throw new XWebDiscoveryTargetUnavailableError();
    }
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new Error("X discovery target clock is invalid");
    this.sweep(now);
    const stored = this.targets.get(token);
    if (stored === undefined || stored.binding.accountId !== boundAccount.accountId
      || stored.binding.subject !== boundAccount.subject || stored.binding.revision !== boundAccount.revision
      || stored.target.source !== boundSource) {
      throw new XWebDiscoveryTargetUnavailableError();
    }
    return stored.target;
  }

  /** Release provider-derived targets when the host disconnects an account. */
  revokeAccount(accountId: string): void {
    const id = bounded(accountId, 512);
    for (const [token, target] of this.targets) if (target.binding.accountId === id) this.targets.delete(token);
  }

  /** Host shutdown leaves no target authority available to a new host. */
  clear(): void { this.targets.clear(); }
}
