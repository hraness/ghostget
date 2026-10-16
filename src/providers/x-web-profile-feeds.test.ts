import { describe, expect, test } from "bun:test";
import { assertProperty, fc } from "../test-support";
import { buildXWebProfileFeedReadRequest, projectXWebProfileFeedReadPage, type XWebProfileFeedSource } from "./x-web-profile-feeds";

const sources = ["profile-replies", "profile-highlights"] as const;
const flags = { withVoice: true, withCommunity: false };
function post(entryId: string, id: string, authorId: string, text: string) {
  return { entryId, content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: { result: {
    __typename: "Tweet", rest_id: id, legacy: { full_text: text, user_id_str: authorId },
  } } } } };
}
function response(echoedId: string | null = "123") {
  return { data: { user: { result: { __typename: "User", ...(echoedId === null ? {} : { rest_id: echoedId }), timeline: { timeline: { instructions: [{
    type: "TimelineAddEntries", entries: [
      post("parent-occurrence", "701", "999", "Conversation parent"),
      { entryId: "unavailable-occurrence", content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: { result: null } } } },
      post("reply-occurrence", "702", "123", "Profile reply"),
      { entryId: "bottom", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "next-fixture" } },
    ],
  }] } } } } } };
}

describe("fixed current X profile collection reads", () => {
  test("builds exact GET variables with runtime feature booleans and no invented sort or initial cursor", () => {
    expect(buildXWebProfileFeedReadRequest("profile-replies", "123", 20, null, flags)).toEqual({
      operationId: "feeds.user-replies", operationName: "UserRepliesTimeline", method: "GET",
      variables: { userId: "123", count: 20, includePromotedContent: true, withVoice: true, withCommunity: false },
    });
    expect(buildXWebProfileFeedReadRequest("profile-highlights", "123", 1, "next-fixture", { withVoice: false, withCommunity: true })).toEqual({
      operationId: "feeds.user-highlights", operationName: "UserHighlightsTweets", method: "GET",
      variables: { userId: "123", count: 1, includePromotedContent: true, withVoice: false, cursor: "next-fixture" },
    });
    const request = buildXWebProfileFeedReadRequest("profile-replies", "123", 50, "next-fixture", flags);
    expect(Object.isFrozen(request)).toBeTrue(); expect(Object.isFrozen(request.variables)).toBeTrue();
  });

  test("rejects unsupported sources, targets, limits, cursor values and guessed flags", () => {
    for (const source of ["user-replies", "profile-posts", "profile-reposts", ""]) expect(() => buildXWebProfileFeedReadRequest(source as XWebProfileFeedSource, "123", 20, null, flags)).toThrow("source");
    for (const target of ["", "@fixture", "1\n", "1".repeat(20)]) expect(() => buildXWebProfileFeedReadRequest("profile-replies", target, 20, null, flags)).toThrow("numeric");
    for (const limit of [0, 51, 1.5, Number.NaN]) expect(() => buildXWebProfileFeedReadRequest("profile-highlights", "123", limit, null, flags)).toThrow("limit");
    for (const cursor of ["", "bad\nvalue", "x".repeat(4_097)]) expect(() => buildXWebProfileFeedReadRequest("profile-replies", "123", 20, cursor, flags)).toThrow("cursor");
    for (const invalid of [null, {}, { withVoice: true }, { withVoice: "true", withCommunity: false }, { ...flags, sortByMostLiked: false }]) {
      expect(() => buildXWebProfileFeedReadRequest("profile-replies", "123", 20, null, invalid as typeof flags)).toThrow("flags");
    }
  });

  test("property: exact bounded targets, feature values and continuation data survive construction", () => {
    assertProperty(fc.property(fc.constantFrom(...sources), fc.stringMatching(/^[1-9][0-9]{0,18}$/u), fc.integer({ min: 1, max: 50 }), fc.boolean(), fc.boolean(), (source, targetId, limit, withVoice, withCommunity) => {
      const request = buildXWebProfileFeedReadRequest(source, targetId, limit, "provider-next", { withVoice, withCommunity });
      expect(request.variables).toMatchObject({ userId: targetId, count: limit, withVoice, cursor: "provider-next" });
      expect(Object.hasOwn(request.variables, "withCommunity")).toBe(source === "profile-replies");
      expect(Object.hasOwn(request.variables, "sortByMostLiked")).toBeFalse();
    }));
  });
});

describe("root-bound profile feed projection", () => {
  test("preserves other-author conversation parents, unavailable occurrences and ordering for each source", () => {
    for (const source of sources) {
      const page = projectXWebProfileFeedReadPage(response(), "123", source, 20);
      expect(page.posts.map(post => [post.id, post.authorId])).toEqual([["701", "999"], ["702", "123"]]);
      expect(page.entries.map(entry => [entry.kind, entry.id])).toEqual([["post", "701"], ["unavailable", "unavailable-occurrence"], ["post", "702"]]);
      expect(page.entries[1]).toEqual({ kind: "unavailable", id: "unavailable-occurrence", postId: null, reason: null });
      expect(page.cursor).toBe("next-fixture"); expect(page.entriesTruncated).toBeFalse();
      expect(Object.isFrozen(page.entries)).toBeTrue();
      // Current collection responses may omit identity fields. The generated
      // target and typed User root bind that case, independently of row authors.
      expect(projectXWebProfileFeedReadPage(response(null), "123", source, 20)).toEqual(page);
    }
  });

  test("projects the captured Replies module shape without treating conversation authors as the profile identity", () => {
    const items = [
      post("parent-occurrence", "701", "999", "Conversation parent"),
      { entryId: "unavailable-occurrence", content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: { result: null } } } },
      post("reply-occurrence", "702", "123", "Profile reply"),
    ].map(entry => ({ entryId: entry.entryId, item: { itemContent: entry.content.itemContent } }));
    const fixture = { data: { user: { result: { __typename: "User", timeline: { timeline: { instructions: [{
      type: "TimelineAddEntries", entries: [
        { entryId: "conversation-module", content: { entryType: "TimelineTimelineModule", displayType: "VerticalConversation", items } },
        { entryId: "top", content: { entryType: "TimelineTimelineCursor", cursorType: "Top", value: "top-fixture" } },
        { entryId: "bottom", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "next-fixture" } },
      ],
    }] } } } } } };
    const page = projectXWebProfileFeedReadPage(fixture, "123", "profile-replies", 20);
    expect(page).toEqual(projectXWebProfileFeedReadPage(response(null), "123", "profile-replies", 20));
    expect(page.posts.map(post => [post.id, post.authorId])).toEqual([["701", "999"], ["702", "123"]]);
    expect(page.entries.map(entry => [entry.kind, entry.id])).toEqual([["post", "701"], ["unavailable", "unavailable-occurrence"], ["post", "702"]]);
    expect(page.cursor).toBe("next-fixture");
    const truncated = projectXWebProfileFeedReadPage(fixture, "123", "profile-replies", 2);
    expect(truncated.entriesTruncated).toBeTrue(); expect(truncated.cursor).toBeNull();
  });

  test("rejects wrong or ambiguous echoed collection identities and missing/malformed roots", () => {
    for (const source of sources) {
      expect(() => projectXWebProfileFeedReadPage(response("999"), "123", source, 20)).toThrow("requested user");
      const ambiguous = response(); Object.assign(ambiguous.data.user.result, { id: Buffer.from("User:999").toString("base64") });
      expect(() => projectXWebProfileFeedReadPage(ambiguous, "123", source, 20)).toThrow("requested user");
      expect(() => projectXWebProfileFeedReadPage({ data: { user: { result: null } } }, "123", source, 20)).toThrow();
      expect(() => projectXWebProfileFeedReadPage({ data: { home: {} } }, "123", source, 20)).toThrow();
      expect(() => projectXWebProfileFeedReadPage({ ...response(), errors: [{ message: "fixture rejection" }] }, "123", source, 20)).toThrow();
      expect(() => projectXWebProfileFeedReadPage(response(), "@fixture", source, 20)).toThrow("numeric");
      expect(() => projectXWebProfileFeedReadPage(response(), "123", source, 51)).toThrow("limit");
    }
  });

  test("clears continuation when the additive occurrence view truncates", () => {
    const page = projectXWebProfileFeedReadPage(response(), "123", "profile-replies", 2);
    expect(page.posts).toHaveLength(2); expect(page.entries).toHaveLength(2);
    expect(page.entriesTruncated).toBeTrue(); expect(page.cursor).toBeNull();
    const noContinuation = response(); noContinuation.data.user.result.timeline.timeline.instructions[0]!.entries.pop();
    expect(() => projectXWebProfileFeedReadPage(noContinuation, "123", "profile-highlights", 1)).toThrow("no continuation");
  });
});
