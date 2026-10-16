import { describe, expect, test } from "bun:test";
import { projectXSocialPost } from "./x-web-model";
import {
  deferredXWebWorkspaceRead,
  parseXWebExplorePage,
  parseXWebNotificationPage,
  xWebWorkspaceReadSupport,
} from "./x-web-workspace-reads";

const notification = {
  kind: "notification", id: "notification-fixture", eventType: "like", createdAt: null, text: null,
  actors: [{ id: "123", handle: "fixture", displayName: "Fixture" }], postIds: ["456"], read: null, url: null,
} as const;
const trend = {
  kind: "trend", id: "trend-fixture", source: "trending", title: "Fixture topic", description: null,
  category: null, postCount: null, query: "#fixture", url: "https://x.com/search?q=%23fixture",
} as const;
function page(source: string, items: readonly unknown[]) {
  return { modelVersion: 1, source, items, cursor: "next-fixture", terminatedDirections: [] };
}

describe("X workspace read qualification", () => {
  test("reviewed workspace sources remain distinct", () => {
    expect(xWebWorkspaceReadSupport["profile-reposts"]).toBeTrue();
    expect(xWebWorkspaceReadSupport.likes).toBeTrue();
    expect(xWebWorkspaceReadSupport.trending).toBeTrue();
    expect(xWebWorkspaceReadSupport.notifications).toBeTrue();
    expect(xWebWorkspaceReadSupport["today-news"]).toBeTrue();
    for (const source of ["profile-replies", "profile-highlights"] as const) {
      expect(xWebWorkspaceReadSupport[source]).toBeTrue();
    }
    expect(Object.isFrozen(xWebWorkspaceReadSupport)).toBeTrue();
  });

  test("recognizes only deferred reads with bounded source-specific input", () => {
    expect(deferredXWebWorkspaceRead("feeds.read", { feed: "user-replies", user_id: "123", limit: 50, cursor: "next" }))
      .toEqual({ surface: "profile-replies", target: "123", limit: 50, cursor: "next" });
    expect(deferredXWebWorkspaceRead("feeds.read", { feed: "user-highlights", user_id: "123" })?.surface).toBe("profile-highlights");
    expect(deferredXWebWorkspaceRead("feeds.read", { feed: "user-reposts", user_id: "123" })?.surface).toBe("profile-reposts");
    expect(deferredXWebWorkspaceRead("feeds.read", { feed: "likes" })?.target).toBeNull();
    expect(deferredXWebWorkspaceRead("notifications.list", {})?.surface).toBe("notifications");
    expect(deferredXWebWorkspaceRead("explore.read", { source: "today-news" })?.surface).toBe("today-news");
    expect(deferredXWebWorkspaceRead("feeds.read", { feed: "user", user_id: "123" })).toBeNull();
    expect(deferredXWebWorkspaceRead("likes.set", { post_id: "123", liked: true })).toBeNull();
  });

  test("rejects unbound/private targets, guessed discovery sources, extra fields, and unbounded paging", () => {
    for (const input of [{ feed: "user-replies" }, { feed: "user-reposts" }, { feed: "user-reposts", user_id: "@fixture" }, { feed: "user-reposts", user_id: "123", sort: "latest" }, { feed: "user-highlights", user_id: "@fixture" }, { feed: "likes", user_id: "123" }, { feed: "likes", query: "guessed" }]) {
      expect(() => deferredXWebWorkspaceRead("feeds.read", input)).toThrow();
    }
    for (const input of [{ source: "todays-news" }, { source: "trending", limit: 51 }, { source: "trending", cursor: "" }, { source: "trending", cursor: "x".repeat(4_097) }, { source: "trending", limit: 1.5 }, { source: "trending", target: "bad\nvalue" }]) {
      expect(() => deferredXWebWorkspaceRead("explore.read", input)).toThrow();
    }
    expect(() => deferredXWebWorkspaceRead("notifications.list", { acknowledge: true })).toThrow();
    for (const target of ["section", '{"source":"today-news","kind":"search","value":"x"}', '{"kind":"search","source":"trending","value":"x","extra":true}', '{"kind":"story","source":"trending","value":"x"}', '{ "kind":"search","source":"trending","value":"x"}']) {
      expect(() => deferredXWebWorkspaceRead("explore.read", { source: "trending", target })).toThrow();
    }
    const target = '{"kind":"search","source":"trending","value":"#fixture"}';
    expect(deferredXWebWorkspaceRead("explore.read", { source: "trending", target })?.target).toBe(target);
    for (const input of [{ source: "today-news", target }, { source: "today-news", cursor: "next" }]) {
      expect(() => deferredXWebWorkspaceRead("explore.read", input)).toThrow();
    }
    const storyTarget = '{"kind":"story","source":"today-news","value":"story-fixture_1"}';
    expect(deferredXWebWorkspaceRead("explore.read", { source: "today-news", target: storyTarget, cursor: "bounded-continuation" }))
      .toEqual({ surface: "today-news", target: storyTarget, limit: 20, cursor: "bounded-continuation" });
    for (const value of ["", "provider/story", "story with spaces", "x".repeat(513)]) {
      expect(() => deferredXWebWorkspaceRead("explore.read", { source: "today-news", target: JSON.stringify({ kind: "story", source: "today-news", value }) })).toThrow();
    }
  });
});

describe("closed X notification and Explore application pages", () => {
  test("preserves ordered mixed entries, unknown read state and model provenance without exposing raw fields", () => {
    const post = projectXSocialPost({ __typename: "Tweet", rest_id: "456", legacy: { full_text: "Fixture #tag" } });
    const result = parseXWebNotificationPage(page("notifications", [notification, { kind: "post", post }, { kind: "unavailable", postId: null, reason: null }]), 3);
    expect(result.items.map(item => item.kind)).toEqual(["notification", "post", "unavailable"]);
    expect(result.items[0]).toEqual(notification);
    expect(result.cursor).toBe("next-fixture");
    expect(Object.isFrozen(result.items)).toBeTrue();
    expect(() => parseXWebNotificationPage(page("notifications", [{ ...notification, raw: { cookie: "must-not-export" } }]), 1)).toThrow();
  });

  test("Trending and Today's News cannot be relabeled as one another", () => {
    expect(parseXWebExplorePage(page("trending", [trend]), "trending", 1).items[0]).toEqual(trend);
    const news = { ...trend, source: "todays-news" };
    expect(parseXWebExplorePage(page("todays-news", [news]), "today-news", 1).source).toBe("todays-news");
    expect(() => parseXWebExplorePage(page("trending", [news]), "trending", 1)).toThrow();
    expect(() => parseXWebExplorePage(page("todays-news", [news]), "trending", 1)).toThrow();
    expect(() => parseXWebNotificationPage(page("notifications", [trend]), 1)).toThrow();
    expect(() => parseXWebExplorePage(page("trending", [notification]), "trending", 1)).toThrow();
  });

  test("rejects duplicate identities, unsupported directions, cursor contradictions and over-limit pages", () => {
    expect(() => parseXWebNotificationPage(page("notifications", [notification, notification]), 2)).toThrow();
    expect(() => parseXWebExplorePage(page("trending", [trend, trend]), "trending", 1)).toThrow();
    expect(() => parseXWebExplorePage({ ...page("trending", [trend]), terminatedDirections: ["Bottom"] }, "trending", 1)).toThrow();
    expect(() => parseXWebExplorePage({ ...page("trending", []), terminatedDirections: ["guess"] }, "trending", 1)).toThrow();
    expect(() => parseXWebExplorePage({ ...page("trending", []), headers: {} }, "trending", 1)).toThrow();
    expect(() => parseXWebExplorePage({ ...page("trending", []), cursor: "bad\nvalue" }, "trending", 1)).toThrow();
    expect(parseXWebExplorePage({ ...page("trending", []), cursor: null, terminatedDirections: ["Bottom"] }, "trending", 1).items).toEqual([]);
  });
});
