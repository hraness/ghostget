import { describe, expect, test } from "bun:test";
import { canonicalJson } from "../canonical-json";
import { assertProperty, fc } from "../test-support";
import {
  buildXWebStoryReadRequest,
  selectXWebStoryTimeline,
  buildXWebStoryTimelineReadRequest,
  projectXWebStoryReadPage,
  type XWebStoryTimelineSelection,
} from "./x-web-story-feeds";

const selected = { subject: "123", storyId: "story-fixture", timelineId: "opaque-provider-timeline" } as const;
function storyResponse() {
  return { data: { ai_trend_by_rest_id: { rest_id: String(selected.storyId), result: { __typename: "AiTrend", rest_id: String(selected.storyId),
    page: { article: { title: "Not a timeline authority" }, post_timelines: [
      { post_timeline: { id: selected.timelineId }, label: "Top" },
      { post_timeline: { id: "opaque-later-timeline" }, label: "Latest" },
    ] },
  } } } };
}
function post(entryId: string, id: string, authorId = "999") {
  return { entryId, content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: { result: {
    __typename: "Tweet", rest_id: id, legacy: { full_text: `Synthetic post ${id}`, user_id_str: authorId },
  } } } } };
}
function pageResponse() {
  const items = [post("parent", "701"), post("reply", "702", "123")].map(value => ({ entryId: value.entryId, item: { itemContent: value.content.itemContent } }));
  return { data: { timeline: { timeline: { instructions: [{ type: "TimelineAddEntries", entries: [
    { entryId: "conversation", content: { entryType: "TimelineTimelineModule", items } },
    { entryId: "unavailable", content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: { result: null } } } },
    { entryId: "top", content: { entryType: "TimelineTimelineCursor", cursorType: "Top", value: "provider-top" } },
    { entryId: "bottom", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "provider-next" } },
  ] }] } } } };
}

describe("fixed X Story read chain", () => {
  test("uses exact AiTrend variables and only its first returned provider timeline", () => {
    expect(buildXWebStoryReadRequest("123", selected.storyId)).toEqual({ subject: "123", operationId: "explore.story", operationName: "AiTrendByRestId", method: "GET",
      variables: { trendId: selected.storyId, includePromotedContent: false, withBirdwatchNotes: false, withVoice: false, withCommunity: false } });
    const target = selectXWebStoryTimeline(storyResponse(), "123", selected.storyId);
    expect(target).toEqual(selected); expect(Object.isFrozen(target)).toBeTrue();
    const request = buildXWebStoryTimelineReadRequest(target, 20);
    expect(request).toEqual({ subject: "123", operationId: "explore.timeline", operationName: "GenericTimelineById", method: "GET",
      variables: { timelineId: selected.timelineId, count: 20, withQuickPromoteEligibilityTweetFields: true } });
    expect(Object.isFrozen(request)).toBeTrue(); expect(Object.isFrozen(request.variables)).toBeTrue();
    expect(Object.isFrozen(buildXWebStoryReadRequest("123", selected.storyId).variables)).toBeTrue();
  });

  test("rejects subject, story and selected-timeline input drift before construction", () => {
    for (const subject of ["", "@fixture", "1\n", "1".repeat(20)]) expect(() => buildXWebStoryReadRequest(subject, selected.storyId)).toThrow("subject");
    for (const storyId of ["", "https://x.com/i/trending/fixture", "story/fixture", " story ", "x".repeat(513)]) expect(() => buildXWebStoryReadRequest("123", storyId)).toThrow("story ID");
    for (const value of [null, [], {}, { ...selected, extra: true }, { ...selected, timelineId: "" }, { ...selected, timelineId: "bad\nID" }, { ...selected, timelineId: "x".repeat(4_097) }]) {
      expect(() => buildXWebStoryTimelineReadRequest(value as XWebStoryTimelineSelection, 20)).toThrow();
    }
    for (const limit of [0, 51, 1.5, Number.NaN]) expect(() => buildXWebStoryTimelineReadRequest(selected, limit)).toThrow("limit");
  });

  test("binds both observed Story identities and rejects unavailable or malformed roots", () => {
    const missingOuterEcho = storyResponse(); delete (missingOuterEcho.data.ai_trend_by_rest_id as Record<string, unknown>).rest_id;
    expect(selectXWebStoryTimeline(missingOuterEcho, "123", selected.storyId)).toEqual(selected);
    for (const mutate of [
      (value: ReturnType<typeof storyResponse>) => { value.data.ai_trend_by_rest_id.rest_id = "other-story"; },
      (value: ReturnType<typeof storyResponse>) => { value.data.ai_trend_by_rest_id.result.rest_id = "other-story"; },
      (value: ReturnType<typeof storyResponse>) => { value.data.ai_trend_by_rest_id.result.__typename = "NotFound"; },
      (value: ReturnType<typeof storyResponse>) => { delete (value.data.ai_trend_by_rest_id.result as Record<string, unknown>).rest_id; },
      (value: ReturnType<typeof storyResponse>) => { Object.assign(value.data.ai_trend_by_rest_id.result, { page: null }); },
    ]) { const value = storyResponse(); mutate(value); expect(() => selectXWebStoryTimeline(value, "123", selected.storyId)).toThrow(); }
    for (const value of [{ data: { story_topic: {} } }, { ...storyResponse(), errors: [{ message: "Synthetic rejection" }] }, { ...storyResponse(), errors: {} }]) {
      expect(() => selectXWebStoryTimeline(value, "123", selected.storyId)).toThrow();
    }
    expect(selectXWebStoryTimeline({ ...storyResponse(), errors: [] }, "123", selected.storyId)).toEqual(selected);
  });

  test("validates every bounded row instead of guessing labels, aliases or fallback IDs", () => {
    const swapped = storyResponse(); swapped.data.ai_trend_by_rest_id.result.page.post_timelines.reverse();
    expect(selectXWebStoryTimeline(swapped, "123", selected.storyId).timelineId).toBe("opaque-later-timeline");
    for (const rows of [[], null, {}, Array.from({ length: 21 }, () => ({ post_timeline: { id: "fixture" }, label: "Top" })),
      [{ post_timeline: { id: selected.timelineId }, label: "Top" }, { post_timeline: { id: selected.timelineId }, label: "Latest" }],
      [{ post_timeline: { id: selected.timelineId }, label: "Top" }, { post_timeline: { id: "other" }, label: null }],
      [{ post_timeline: { id: selected.timelineId }, label: "" }], [{ post_timeline: { id: 123 }, label: "Top" }]]) {
      const value = storyResponse(); Object.assign(value.data.ai_trend_by_rest_id.result.page, { post_timelines: rows });
      expect(() => selectXWebStoryTimeline(value, "123", selected.storyId)).toThrow();
    }
    const wrongAlias = storyResponse(); const page = wrongAlias.data.ai_trend_by_rest_id.result.page;
    Object.assign(page, { timelines: page.post_timelines }); delete (page as Record<string, unknown>).post_timelines;
    expect(() => selectXWebStoryTimeline(wrongAlias, "123", selected.storyId)).toThrow("post timelines");
  });
});

describe("Story posts and continuation", () => {
  test("preserves captured module/direct occurrence shapes and binds the next Generic request", () => {
    const page = projectXWebStoryReadPage(pageResponse(), selected, 20);
    expect(page.source).toBe("today-news"); expect(page.modelVersion).toBe(1);
    expect(page.entries.map(entry => [entry.kind, entry.id])).toEqual([["post", "701"], ["post", "702"], ["unavailable", "unavailable"]]);
    expect(page.entries[0]).toMatchObject({ post: { id: "701", authorId: "999", text: "Synthetic post 701" } });
    expect(page.entries[2]).toEqual({ kind: "unavailable", id: "unavailable", postId: null, reason: null });
    expect(page.filtered).toBeFalse(); expect(page.entriesTruncated).toBeFalse();
    expect(Object.isFrozen(page)).toBeTrue(); expect(Object.isFrozen(page.entries)).toBeTrue();
    expect(buildXWebStoryTimelineReadRequest(selected, 1, page.cursor)).toMatchObject({ variables: { timelineId: selected.timelineId, count: 1, cursor: "provider-next" } });
    expect(JSON.parse(page.cursor!)).toEqual({ version: 1, ...selected, cursor: "provider-next" });
  });

  test("continuations cannot switch viewer, story, timeline, encoding or provider cursor", () => {
    const cursor = projectXWebStoryReadPage(pageResponse(), selected, 20).cursor!;
    for (const target of [{ ...selected, subject: "456" }, { ...selected, storyId: "another-story" }, { ...selected, timelineId: "another-timeline" }]) {
      expect(() => buildXWebStoryTimelineReadRequest(target, 20, cursor)).toThrow("binds");
    }
    for (const value of ["", "not JSON", "x".repeat(4_097), ` ${cursor}`, JSON.stringify({ version: 1, ...selected, cursor: "provider-next" }),
      canonicalJson({ version: 2, ...selected, cursor: "provider-next" }), canonicalJson({ version: 1, ...selected, cursor: "" }),
      canonicalJson({ version: 1, ...selected, cursor: "bad\nvalue" }), canonicalJson({ version: 1, ...selected, cursor: "provider-next", extra: true }),
      canonicalJson({ version: 1, subject: selected.subject, storyId: selected.storyId, cursor: "provider-next" })]) {
      expect(() => buildXWebStoryTimelineReadRequest(selected, 20, value)).toThrow();
    }
  });

  test("partial pages withhold continuation and reject contradictory provider termination", () => {
    const page = projectXWebStoryReadPage(pageResponse(), selected, 2);
    expect(page.entries).toHaveLength(2); expect(page.entriesTruncated).toBeTrue(); expect(page.filtered).toBeTrue(); expect(page.cursor).toBeNull();
    const terminated = pageResponse(); (terminated.data.timeline.timeline.instructions as unknown[]).push({ type: "TimelineTerminateTimeline", direction: "Bottom" });
    expect(() => projectXWebStoryReadPage(terminated, selected, 20)).toThrow("contradicted");
    const missingCursor = pageResponse(); missingCursor.data.timeline.timeline.instructions[0]!.entries.pop();
    expect(() => projectXWebStoryReadPage(missingCursor, selected, 1)).toThrow("no continuation");
    for (const value of [{ data: { home: {} } }, { ...pageResponse(), errors: [{ message: "Synthetic rejection" }] }]) {
      expect(() => projectXWebStoryReadPage(value, selected, 20)).toThrow();
    }
  });

  test("bounds provider continuation envelopes rather than truncating opaque data", () => {
    const response = pageResponse(); Object.assign(response.data.timeline.timeline.instructions[0]!.entries.at(-1)!.content, { value: "x".repeat(4_096) });
    expect(() => projectXWebStoryReadPage(response, selected, 20)).toThrow("continuation");
  });

  test("property: initial selection follows the first returned row, independently of labels", () => {
    assertProperty(fc.property(fc.uniqueArray(fc.stringMatching(/^[A-Za-z0-9_=-]{1,64}$/u), { minLength: 1, maxLength: 20 }), ids => {
      const response = storyResponse();
      response.data.ai_trend_by_rest_id.result.page.post_timelines = ids.map((id, index) => ({ post_timeline: { id }, label: `Synthetic label ${ids.length - index}` }));
      const target = selectXWebStoryTimeline(response, selected.subject, selected.storyId);
      expect(target).toEqual({ ...selected, timelineId: ids[0]! });
      expect(Object.keys(target).sort()).toEqual(["storyId", "subject", "timelineId"]);
      expect(buildXWebStoryTimelineReadRequest(target, 20).variables.timelineId).toBe(ids[0]!);
    }));
  });

  test("property: canonical continuation round trips preserve exact bounded selections", () => {
    assertProperty(fc.property(fc.stringMatching(/^[1-9][0-9]{0,18}$/u), fc.stringMatching(/^[A-Za-z0-9_-]{1,32}$/u), fc.stringMatching(/^[A-Za-z0-9_=-]{1,64}$/u), fc.stringMatching(/^[A-Za-z0-9_-]{1,64}$/u), fc.integer({ min: 1, max: 50 }),
      (subject, storyId, timelineId, cursor, limit) => {
        const target = { subject, storyId, timelineId };
        const request = buildXWebStoryTimelineReadRequest(target, limit, canonicalJson({ version: 1, ...target, cursor }));
        expect(request.variables).toEqual({ timelineId, count: limit, withQuickPromoteEligibilityTweetFields: true, cursor });
        expect(request.subject).toBe(subject);
      }));
  });

  test("property: arbitrary input cannot escape into transport or public content", () => {
    assertProperty(fc.property(fc.jsonValue(), value => {
      let target: XWebStoryTimelineSelection;
      try {
        target = selectXWebStoryTimeline(value, "123", selected.storyId);
      } catch (error) { expect(error).toBeInstanceOf(Error); return; }
      expect(Object.keys(target).sort()).toEqual(["storyId", "subject", "timelineId"]);
      expect(target.subject).toBe("123"); expect(target.storyId).toBe(selected.storyId);
    }));
  });
});
