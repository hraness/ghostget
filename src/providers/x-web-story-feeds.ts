import { canonicalJson, isCanonicalJsonText } from "../canonical-json";
import {
  boundXWebProviderPage,
  extractXWebGraphQlReadResponseRoot,
  normalizeXWebUrtTimeline,
  type XWebFeedEntry,
} from "./x-web";
import type { XWebCapturedDiscoveryPage } from "./x-web-captured-reads";

/** Internal provider selection, never a public request or a transport URL. */
export type XWebStoryTimelineSelection = Readonly<{
  subject: string;
  storyId: string;
  timelineId: string;
}>;

export type XWebStoryReadRequest = Readonly<{
  subject: string;
  operationId: "explore.story";
  operationName: "AiTrendByRestId";
  method: "GET";
  variables: Readonly<{
    trendId: string;
    includePromotedContent: false;
    withBirdwatchNotes: false;
    withVoice: false;
    withCommunity: false;
  }>;
}>;

export type XWebStoryTimelineReadRequest = Readonly<{
  subject: string;
  operationId: "explore.timeline";
  operationName: "GenericTimelineById";
  method: "GET";
  variables: Readonly<{
    timelineId: string;
    count: number;
    withQuickPromoteEligibilityTweetFields: true;
    cursor?: string;
  }>;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function bounded(value: unknown, maximum: number, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be a bounded string`);
  }
  return value;
}

function subject(value: unknown): string {
  const result = bounded(value, 19, "X story subject");
  if (!/^[0-9]{1,19}$/u.test(result)) throw new Error("X story subject must be an exact numeric ID");
  return result;
}

function storyId(value: unknown): string {
  const result = bounded(value, 512, "X story ID");
  if (!/^[A-Za-z0-9_-]+$/u.test(result)) throw new Error("X story ID must be an exact provider identifier");
  return result;
}

function pageLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 50) {
    throw new Error("X story limit must be an integer between 1 and 50");
  }
  return value;
}

function selection(value: unknown): XWebStoryTimelineSelection {
  const input = record(value, "X story timeline selection");
  const fields = ["subject", "storyId", "timelineId"];
  if (Object.keys(input).length !== fields.length || fields.some(key => !Object.hasOwn(input, key))) {
    throw new Error("X story timeline selection has unreviewed fields");
  }
  return Object.freeze({ subject: subject(input.subject), storyId: storyId(input.storyId),
    timelineId: bounded(input.timelineId, 4_096, "X story timeline ID") });
}

/** The exact read-only Story route observed in the current LiveEvent source. */
export function buildXWebStoryReadRequest(verifiedSubject: string, selectedStoryId: string): XWebStoryReadRequest {
  return Object.freeze({ subject: subject(verifiedSubject), operationId: "explore.story", operationName: "AiTrendByRestId", method: "GET",
    variables: Object.freeze({ trendId: storyId(selectedStoryId), includePromotedContent: false,
      withBirdwatchNotes: false, withVoice: false, withCommunity: false }) });
}

/**
 * The provider owns the post-timeline ID. Its first returned row is the current
 * Story page's initial selection; neither the story ID nor a URL is a timeline.
 */
export function selectXWebStoryTimeline(response: unknown, verifiedSubject: string, selectedStoryId: string): XWebStoryTimelineSelection {
  const boundSubject = subject(verifiedSubject), expectedStoryId = storyId(selectedStoryId);
  const envelope = record(response, "X story response");
  if (envelope.error !== undefined || envelope.errors !== undefined && (!Array.isArray(envelope.errors) || envelope.errors.length !== 0)) {
    throw new Error("X story response contained GraphQL errors");
  }
  const resultContainer = record(record(envelope.data, "X story response.data").ai_trend_by_rest_id, "X story result container");
  if (resultContainer.rest_id !== undefined && storyId(resultContainer.rest_id) !== expectedStoryId) {
    throw new Error("X story response container changed the selected story");
  }
  const result = record(resultContainer.result, "X story result");
  if (result.__typename !== undefined && result.__typename !== "AiTrend") throw new Error("X story result has an unreviewed typename");
  if (storyId(result.rest_id) !== expectedStoryId) throw new Error("X story response changed the selected story");
  const rows = record(result.page, "X story page").post_timelines;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 20) throw new Error("X story page omitted its bounded post timelines");
  const ids = new Set<string>();
  const timelines = rows.map(value => {
    const row = record(value, "X story post timeline row");
    const timelineId = bounded(record(row.post_timeline, "X story post timeline").id, 4_096, "X story timeline ID");
    bounded(row.label, 1_000, "X story timeline label");
    if (ids.has(timelineId)) throw new Error("X story page repeated a post timeline identity");
    ids.add(timelineId);
    return timelineId;
  });
  return selection({ subject: boundSubject, storyId: expectedStoryId, timelineId: timelines[0]! });
}

function continuation(value: unknown, expected: XWebStoryTimelineSelection): string {
  const text = bounded(value, 4_096, "X story continuation");
  let decoded: unknown;
  try { decoded = JSON.parse(text); } catch { throw new Error("X story continuation is invalid JSON"); }
  const input = record(decoded, "X story continuation");
  const fields = ["version", "subject", "storyId", "timelineId", "cursor"];
  if (Object.keys(input).length !== fields.length || fields.some(key => !Object.hasOwn(input, key))
    || !isCanonicalJsonText(text, input)) throw new Error("X story continuation has unreviewed fields or encoding");
  if (input.version !== 1 || input.subject !== expected.subject || input.storyId !== expected.storyId || input.timelineId !== expected.timelineId) {
    throw new Error("X story continuation no longer binds this subject, story and timeline");
  }
  return bounded(input.cursor, 4_096, "X story provider cursor");
}

/** Initial requests omit cursor; later requests consume only this selection's continuation. */
export function buildXWebStoryTimelineReadRequest(selected: XWebStoryTimelineSelection, limit: number, cursor: string | null = null): XWebStoryTimelineReadRequest {
  const target = selection(selected), count = pageLimit(limit);
  return Object.freeze({ subject: target.subject, operationId: "explore.timeline", operationName: "GenericTimelineById", method: "GET",
    variables: Object.freeze({ timelineId: target.timelineId, count, withQuickPromoteEligibilityTweetFields: true,
      ...(cursor === null ? {} : { cursor: continuation(cursor, target) }) }) });
}

function unavailableReason(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 10_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error("X story unavailable reason escaped its public text bound");
  }
  return value;
}

/**
 * GenericTimelineById's fixed response root is scoped by its generated request,
 * not by the authors inside its posts. The caller keeps selection and returned
 * continuation behind its account/revision-bound opaque application handles.
 */
export function projectXWebStoryReadPage(response: unknown, selected: XWebStoryTimelineSelection, limit: number): XWebCapturedDiscoveryPage {
  const target = selection(selected);
  pageLimit(limit);
  const normalized = normalizeXWebUrtTimeline(extractXWebGraphQlReadResponseRoot("explore.timeline", response));
  if (normalized.terminatedDirections.some(direction => direction !== "Top" && direction !== "Bottom")) {
    throw new Error("X story returned an unreviewed termination direction");
  }
  if (normalized.cursors.bottom !== null && normalized.terminatedDirections.includes("Bottom")) {
    throw new Error("X story continuation contradicted termination");
  }
  const posts = normalized.items.filter(item => item.kind === "tweet");
  const postPage = boundXWebProviderPage(posts, limit, normalized.cursors.bottom !== null, "X story feed page");
  let filtered = false;
  const entries = normalized.items.flatMap((item): XWebFeedEntry[] => {
    if (item.kind === "tweet") return [Object.freeze({ kind: "post", id: item.tweetId, post: item.social })];
    if (item.kind === "unavailable") return [Object.freeze({ kind: "unavailable", id: bounded(item.entryId, 512, "X story unavailable occurrence ID"),
      postId: null, reason: unavailableReason(item.reason) })];
    filtered = true;
    return [];
  });
  const entriesTruncated = entries.length > limit;
  const cursor = normalized.cursors.bottom === null || entriesTruncated || postPage.truncated ? null
    : bounded(canonicalJson({ version: 1, ...target, cursor: bounded(normalized.cursors.bottom.value, 4_096, "X story provider cursor") }), 4_096, "X story continuation");
  return Object.freeze({ modelVersion: 1, source: "today-news", entries: Object.freeze(entries.slice(0, limit)), cursor,
    terminatedDirections: normalized.terminatedDirections, entriesTruncated, filtered: filtered || entriesTruncated || postPage.truncated });
}
