import { describe, expect, test } from "bun:test";
import { assertProperty, fc } from "../test-support";
import {
  parseXWebDiscoveryTarget,
  X_WEB_DISCOVERY_TARGET_BOUNDS,
  XWebDiscoveryTargetStore,
  XWebDiscoveryTargetUnavailableError,
  buildXWebLikesReadRequest,
  projectXWebLikesReadPage,
  buildXWebExplorePageReadRequest,
  selectXWebTrendingTimeline,
  buildXWebTrendingReadRequest,
  projectXWebTrendingReadPage,
  buildXWebNotificationsReadRequest,
  projectXWebNotificationsReadPage,
  buildXWebNewsReadRequest,
  parseXWebNewsRelayBundleDescriptors,
  projectXWebNewsReadPage,
} from "./x-web-captured-reads";
import { authorizeXWebR1GraphQlRequest } from "./x-web";

const account = { accountId: "account-fixture", subject: "123", revision: "revision-fixture" } as const;
const trend = { source: "trending", kind: "timeline", value: "provider-timeline-fixture" } as const;

function trendEntry(entryId: string, title = "Fixture topic") {
  return { entryId, content: { entryType: "TimelineTimelineItem", itemContent: {
    __typename: "TimelineTrend", itemType: "TimelineTrend", name: title, rank: "1",
    trend_url: { urlType: "DeepLink", url: "https://x.com/search?q=%23fixture" },
    trend_metadata: { domain_context: "Technology", meta_description: "Fixture context" },
  } } };
}
function trendingResponse(...entries: unknown[]) {
  return { data: { timeline: { timeline: { instructions: [{ type: "TimelineAddEntries", entries }] } } } };
}

function notificationEntry(id = "notification-fixture", icon = "heart_icon", timestamp = "1700000000000") {
  return { entryId: `occurrence-${id}`, content: { entryType: "TimelineTimelineItem", itemContent: {
    __typename: "TimelineNotification", itemType: "TimelineNotification", id, notification_icon: icon, timestamp_ms: timestamp,
    rich_message: { text: "Fixture liked your post", entities: [] },
    template: {
      from_users: [{ __typename: "TimelineNotificationUserRef", user_results: { result: {
        __typename: "User", rest_id: "789", core: { screen_name: "fixture", name: "Fixture" },
      } } }],
      target_objects: [{ __typename: "TimelineNotificationTweetRef", tweet_results: { result: { __typename: "Tweet", rest_id: "456" } } }],
    },
    notification_url: { urlType: "DeepLink", url: "provider-private-not-exported" },
  } } };
}
function notificationsResponse(...entries: unknown[]) {
  return { data: { viewer_v2: { user_results: { result: {
    __typename: "User", rest_id: "123", notification_timeline: { timeline: { instructions: [{ type: "TimelineAddEntries", entries }] } },
  } } } } };
}

function newsStory(restId = "876") {
  return { trend_results: { result: { __typename: "AiTrend", id: "relay-fixture", rest_id: restId, post_count: "12345",
    core: { name: "Fixture news", hook: "News context", category: "Personalized", created_at_ms: "1700000000000" },
    social_proof: [{ img_url: "https://pbs.twimg.com/profile_images/fixture.jpg" }], unprojected: "private-unused-field",
  } } };
}
function newsResponse(...items: unknown[]) { return { data: { story_topic: { id: "topic-fixture", stories: { items } } } }; }

describe("reviewed NewsSidebar Relay shape", () => {
  test("parses only the exact registered query name and empty Relay metadata shape", () => {
    const literal = 'params:{id:"FixtureQuery_123",metadata:{},name:"useStoryTopicQuery",operationKind:"query",text:null}';
    const descriptors = parseXWebNewsRelayBundleDescriptors(literal);
    expect(descriptors).toEqual([{ queryId: "FixtureQuery_123", operationName: "useStoryTopicQuery", operationType: "query", metadata: { featureSwitches: [], fieldToggles: [] } }]);
    expect(Object.isFrozen(descriptors)).toBeTrue(); expect(Object.isFrozen(descriptors[0]?.metadata.featureSwitches)).toBeTrue();
    for (const candidate of [literal.replace('metadata:{}', 'metadata:{extra:true}'), literal.replace('useStoryTopicQuery', 'arbitraryRelayQuery'), literal.replace('text:null', 'text:"query"'), literal.replace('operationKind:"query"', 'operationKind:"mutation"')]) {
      expect(parseXWebNewsRelayBundleDescriptors(candidate)).toEqual([]);
    }
    expect(() => parseXWebNewsRelayBundleDescriptors("x".repeat(16_777_217))).toThrow("byte limit");
  });

  test("fixes the personalized topic request and keeps news separate from generic Trending", () => {
    expect(buildXWebNewsReadRequest("123")).toEqual({ subject: "123", operationId: "explore.news", operationName: "useStoryTopicQuery", method: "GET", variables: { limit: 3, rest_id: "Top Stories" } });
    expect(() => buildXWebNewsReadRequest("@fixture")).toThrow();
    const page = projectXWebNewsReadPage(newsResponse(newsStory()), "123", 20);
    expect(page).toEqual({ modelVersion: 1, source: "today-news", entries: [{ kind: "trend", id: "876", trend: {
      kind: "trend", id: "876", source: "todays-news", title: "Fixture news", description: "News context", category: "Personalized", postCount: 12345, query: null, url: "https://x.com/i/trending/876",
    } }], cursor: null, terminatedDirections: [], entriesTruncated: false, filtered: false });
    expect(page.entries[0]).not.toHaveProperty("target");
    expect(JSON.stringify(page)).not.toContain("private-unused-field");
    expect(JSON.stringify(page)).not.toContain("profile_images");
  });

  test("keeps unknown counts unknown, marks filtered pages and bounds malformed news", () => {
    const unknown = newsStory(); delete (unknown.trend_results.result as Record<string, unknown>).post_count;
    expect(projectXWebNewsReadPage(newsResponse(unknown), "123", 1).entries[0]).toMatchObject({ trend: { postCount: null } });
    const partial = projectXWebNewsReadPage(newsResponse(newsStory(), newsStory("877"), { trend_results: { result: null } }), "123", 1);
    expect(partial.entries).toHaveLength(1); expect(partial.filtered).toBeTrue(); expect(partial.entriesTruncated).toBeTrue(); expect(partial.cursor).toBeNull();
    const unsafe = newsStory(); unsafe.trend_results.result.post_count = "1.2K";
    expect(() => projectXWebNewsReadPage(newsResponse(unsafe), "123", 20)).toThrow("exact bounded integer");
    expect(() => projectXWebNewsReadPage(newsResponse(newsStory(), newsStory()), "123", 20)).toThrow("repeated");
    expect(() => projectXWebNewsReadPage({ ...newsResponse(), errors: [{ message: "rejected" }] }, "123", 20)).toThrow("GraphQL errors");
    expect(() => projectXWebNewsReadPage({ data: { explore_sidebar: {} } }, "123", 20)).toThrow();
    expect(() => projectXWebNewsReadPage(newsResponse(...Array.from({ length: 101 }, () => newsStory())), "123", 20)).toThrow("array");
  });
});

describe("captured read-only X notifications", () => {
  test("accepts only observed integer milliseconds or canonical UTC ISO timestamps without inferring read state", () => {
    for (const [timestamp, expected] of [["0", "1970-01-01T00:00:00.000Z"], ["1700000000000", "2023-11-14T22:13:20.000Z"], ["2020-02-29T12:34:56.789Z", "2020-02-29T12:34:56.789Z"]]) {
      const page = projectXWebNotificationsReadPage(notificationsResponse(notificationEntry("fixture", "heart_icon", timestamp!)), "123", 20);
      expect(page.entries[0]).toMatchObject({ kind: "notification", notification: { createdAt: expected, read: null } });
    }
    for (const timestamp of ["2020-02-30T12:34:56.789Z", "2020-02-29T25:34:56.789Z", "2020-02-29T12:34:56Z", "2020-02-29T12:34:56.789+00:00", "1969-12-31T23:59:59.999Z", "tomorrow", "1700000000000.5", "1.7e12", "9000000000000000"]) {
      expect(() => projectXWebNotificationsReadPage(notificationsResponse(notificationEntry("fixture", "heart_icon", timestamp)), "123", 20)).toThrow("timestamp");
    }
    const numeric = notificationEntry(); Object.assign(numeric.content.itemContent, { timestamp_ms: 1700000000000 });
    expect(() => projectXWebNotificationsReadPage(notificationsResponse(numeric), "123", 20)).toThrow("timestamp");
  });

  test("constructs one exact All query without polling, acknowledgement or target overrides", () => {
    expect(buildXWebNotificationsReadRequest("123", 20)).toEqual({
      subject: "123", operationId: "notifications.all", operationName: "NotificationsTimeline", method: "GET",
      variables: { timeline_type: "All", count: 20 },
    });
    expect(buildXWebNotificationsReadRequest("123", 2, "next-fixture").variables).toEqual({ timeline_type: "All", count: 2, cursor: "next-fixture" });
    expect(() => buildXWebNotificationsReadRequest("@fixture", 20)).toThrow();
    expect(() => buildXWebNotificationsReadRequest("123", 51)).toThrow();
    expect(() => buildXWebNotificationsReadRequest("123", 20, "")).toThrow();
  });

  test("projects observed events with exact actors/targets and unknown read state", () => {
    const response = notificationsResponse(notificationEntry(), notificationEntry("repost-fixture", "retweet_icon"), notificationEntry("other-fixture", "unreviewed_icon"));
    const page = projectXWebNotificationsReadPage(response, "123", 20);
    expect(page.source).toBe("notifications");
    expect(page.entries.map(entry => entry.kind === "notification" ? entry.notification.eventType : entry.kind)).toEqual(["like", "repost", "other"]);
    expect(page.entries[0]).toEqual({ kind: "notification", id: "notification-fixture", notification: {
      kind: "notification", id: "notification-fixture", eventType: "like", createdAt: "2023-11-14T22:13:20.000Z", text: "Fixture liked your post",
      actors: [{ id: "789", handle: "fixture", displayName: "Fixture" }], postIds: ["456"], read: null, url: null,
    } });
    expect(JSON.stringify(page)).not.toContain("provider-private-not-exported");
    expect(page.filtered).toBeFalse();
    expect(() => projectXWebNotificationsReadPage(response, "999", 20)).toThrow("requested user");
  });

  test("keeps direct post and unavailable rows, bounds partial pages, and rejects ambiguous event identities", () => {
    const postEntry = likesResponse().data.user.result.timeline.timeline.instructions[0]!.entries[0]!;
    const response = notificationsResponse(notificationEntry(), postEntry, {
      entryId: "unavailable-fixture", content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: { result: null } } },
    }, { entryId: "bottom", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "next-notifications" } });
    const complete = projectXWebNotificationsReadPage(response, "123", 20);
    expect(complete.entries.map(entry => entry.kind)).toEqual(["notification", "post", "unavailable"]);
    expect(complete.cursor).toBe("next-notifications");
    const partial = projectXWebNotificationsReadPage(response, "123", 1);
    expect(partial.entries).toHaveLength(1); expect(partial.entriesTruncated).toBeTrue(); expect(partial.filtered).toBeTrue(); expect(partial.cursor).toBeNull();
    const duplicate = notificationEntry(); duplicate.entryId = "another-occurrence";
    expect(() => projectXWebNotificationsReadPage(notificationsResponse(notificationEntry(), duplicate), "123", 20)).toThrow("repeated");
    const malformed = notificationEntry(); malformed.content.itemContent.timestamp_ms = "not-a-time";
    expect(() => projectXWebNotificationsReadPage(notificationsResponse(malformed), "123", 20)).toThrow("timestamp");
    expect(() => projectXWebNotificationsReadPage({ data: { home: {} } }, "123", 20)).toThrow();
  });
});

describe("captured Trending configuration and URT projection", () => {
  test("selects the unique provider-owned Trending tab independently of translated labels", () => {
    expect(buildXWebExplorePageReadRequest("123")).toEqual({ subject: "123", operationId: "explore.page", operationName: "ExplorePage", method: "GET", variables: { cursor: "" } });
    const tab = { id: "trending", labelText: "Localized label", timeline: { id: "provider-fixture" } };
    const config = (tabs: unknown[]) => ({ data: { explore_page: { body: { timelines: tabs } } } });
    expect(selectXWebTrendingTimeline(config([tab]))).toEqual({ source: "trending", kind: "timeline", value: "provider-fixture" });
    expect(() => selectXWebTrendingTimeline(config([{ ...tab, id: "news", labelText: "Trending" }]))).toThrow("one Trending");
    expect(() => selectXWebTrendingTimeline(config([tab, tab]))).toThrow("one Trending");
    expect(() => selectXWebTrendingTimeline(config([{ ...tab, timeline: { id: "bad\nvalue" } }]))).toThrow();
    expect(() => selectXWebTrendingTimeline({ data: { home: {} } })).toThrow();
  });

  test("projects captured trend fields and binds continuation to viewer and current provider timeline", () => {
    const response = trendingResponse(trendEntry("trend-fixture"), {
      entryId: "bottom", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "provider-next" },
    });
    const page = projectXWebTrendingReadPage(response, "123", "provider-fixture", 20);
    expect(page.entries).toEqual([{ kind: "trend", id: "trend-fixture", trend: {
      kind: "trend", id: "trend-fixture", source: "trending", title: "Fixture topic", description: "Fixture context",
      category: "Technology", postCount: null, query: null, url: "https://x.com/search?q=%23fixture",
    } }]);
    expect(page.filtered).toBeFalse();
    const request = buildXWebTrendingReadRequest("123", "provider-fixture", 20, page.cursor);
    expect(request).toMatchObject({ operationId: "explore.timeline", operationName: "GenericTimelineById", method: "GET", variables: { timelineId: "provider-fixture", count: 20, withQuickPromoteEligibilityTweetFields: true, cursor: "provider-next" } });
    expect(() => buildXWebTrendingReadRequest("456", "provider-fixture", 20, page.cursor)).toThrow("bind");
    expect(() => buildXWebTrendingReadRequest("123", "changed-timeline", 20, page.cursor)).toThrow("bind");
    expect(() => buildXWebTrendingReadRequest("123", "provider-fixture", 20, "provider-next")).toThrow("invalid");
    expect(Object.isFrozen(request.variables)).toBeTrue();
    expect(Object.isFrozen(page.entries)).toBeTrue();
  });

  test("retains module order, current URT replacements and unavailable occurrences without private payloads", () => {
    const moduleTrend = trendEntry("trend-module", "Module fixture");
    const moduleItem = { entryId: moduleTrend.entryId, item: { itemContent: moduleTrend.content.itemContent } };
    const response = trendingResponse(trendEntry("trend-replaced", "Old fixture"), {
      entryId: "module-fixture", content: { entryType: "TimelineTimelineModule", items: [moduleItem] },
    }, {
      entryId: "unavailable-fixture", content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: { result: null } } },
    });
    response.data.timeline.timeline.instructions.push({ type: "TimelineReplaceEntry", entry: trendEntry("trend-replaced", "New fixture") } as never);
    const page = projectXWebTrendingReadPage(response, "123", "provider-fixture", 20);
    expect(page.entries.map(entry => [entry.kind, entry.id])).toEqual([["trend", "trend-replaced"], ["trend", "trend-module"], ["unavailable", "unavailable-fixture"]]);
    expect(page.entries[0]).toMatchObject({ trend: { title: "New fixture" } });
    expect(page.entries[2]).toEqual({ kind: "unavailable", id: "unavailable-fixture", postId: null, reason: null });
  });

  test("turns only the reviewed native search DeepLink into a bounded semantic target", () => {
    const entry = trendEntry("native-search");
    entry.content.itemContent.trend_url.url = "twitter://search/?query=%23Rust%20%24RUST%20from%3Ahraness&src=trend_click&vertical=trends&pc=fixture";
    const page = projectXWebTrendingReadPage(trendingResponse(entry), "123", "provider-fixture", 20);
    expect(page.entries[0]).toMatchObject({ trend: { query: "#Rust $RUST from:hraness", url: "https://x.com/search?q=%23Rust+%24RUST+from%3Ahraness" },
      target: { source: "trending", kind: "search", value: "#Rust $RUST from:hraness" } });
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    const projected = page.entries[0];
    if (projected?.kind !== "trend" || projected.target === undefined) throw new Error("Missing search target");
    const token = store.issue(account, projected.target);
    expect(token).not.toContain("Rust");
    expect(store.resolve(token, account, "trending")).toEqual(projected.target);
  });

  test("unsupported, ambiguous or malformed native links remain unselectable", () => {
    for (const candidate of [
      "twitter://search?query=", "twitter://search?query=%20", "twitter://search?query=a&query=b", "twitter://search?query=%FF", "twitter://search?query=%ZZ", "twitter://search?query=%00",
      "twitter://search?query=a&endpoint=evil", "twitter://search?query=a&type=users", "twitter://search/path?query=a", "twitter://user@search?query=a", "twitter://search:443?query=a", "twitter://search?query=a#x",
      "twitter://search?query=" + "x".repeat(513), "twitter://settings?query=a", "javascript:alert(1)",
    ]) {
      const entry = trendEntry("unsupported-native"); entry.content.itemContent.trend_url.url = candidate;
      const projected = projectXWebTrendingReadPage(trendingResponse(entry), "123", "provider-fixture", 20).entries[0];
      expect(projected).toMatchObject({ trend: { query: null, url: null } });
      expect(projected).not.toHaveProperty("target");
    }
    const entry = trendEntry("wrong-type"); entry.content.itemContent.trend_url = { urlType: "ExternalUrl", url: "twitter://search?query=fixture" };
    expect(projectXWebTrendingReadPage(trendingResponse(entry), "123", "provider-fixture", 20).entries[0]).not.toHaveProperty("target");
    expect(() => parseXWebDiscoveryTarget({ source: "today-news", kind: "search", value: "fixture" })).toThrow("unsupported");
    expect(() => parseXWebDiscoveryTarget({ source: "trending", kind: "search", value: "x".repeat(513) })).toThrow("bounded");
  });

  test("property: native query decoding, public URL and opaque target preserve exact Unicode text", () => {
    assertProperty(fc.property(fc.array(fc.constantFrom("🦀", "中", "é", "#", "$", ":", "&", "+", "%", " ", "a"), { minLength: 1, maxLength: 80 }).map(parts => parts.join("")).filter(value => value.trim().length > 0), query => {
      const entry = trendEntry("query-property"); entry.content.itemContent.trend_url.url = "twitter://search?query=" + encodeURIComponent(query);
      const projected = projectXWebTrendingReadPage(trendingResponse(entry), "123", "provider-fixture", 20).entries[0];
      if (projected?.kind !== "trend") throw new Error("Missing trend");
      expect(projected.trend.query).toBe(query); expect(projected.target?.value).toBe(query);
      expect(new URL(projected.trend.url!).searchParams.get("q")).toBe(query);
    }));
  });

  test("marks bounded partial pages and rejects malformed roots, bounds and cursor contradictions", () => {
    const page = projectXWebTrendingReadPage(trendingResponse(trendEntry("trend-1"), trendEntry("trend-2")), "123", "provider-fixture", 1);
    expect(page.entries).toHaveLength(1); expect(page.entriesTruncated).toBeTrue(); expect(page.filtered).toBeTrue(); expect(page.cursor).toBeNull();
    expect(() => projectXWebTrendingReadPage({ data: { home: {} } }, "123", "provider-fixture", 20)).toThrow();
    expect(() => projectXWebTrendingReadPage(trendingResponse(trendEntry("trend-1")), "@fixture", "provider-fixture", 20)).toThrow();
    expect(() => buildXWebTrendingReadRequest("123", "provider-fixture", 51)).toThrow();
    const malformed = trendingResponse(trendEntry("trend-1"), { entryId: "bottom", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "next" } });
    malformed.data.timeline.timeline.instructions.push({ type: "TimelineTerminateTimeline", direction: "Bottom" } as never);
    expect(() => projectXWebTrendingReadPage(malformed, "123", "provider-fixture", 20)).toThrow("contradicted");
  });
});

function likesResponse(viewerId: string | null = "123") {
  return { data: { user: { result: {
    __typename: "User", ...(viewerId === null ? {} : { rest_id: viewerId }), timeline: { timeline: { instructions: [{
      type: "TimelineAddEntries", entries: [
        { entryId: "tweet-fixture", content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: { result: {
          __typename: "Tweet", rest_id: "456", legacy: { full_text: "A liked public post", user_id_str: "789" },
        } } } } },
        { entryId: "cursor-bottom", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "next-fixture" } },
      ],
    }] } },
  } } } };
}

describe("captured viewer-owned X likes", () => {
  test("builds the exact fixed route and flags with only a verified numeric viewer and bounded pagination", () => {
    expect(buildXWebLikesReadRequest("123", 20)).toEqual({
      subject: "123", operationId: "feeds.likes", operationName: "Likes", method: "GET",
      variables: { userId: "123", count: 20, includePromotedContent: false, withClientEventToken: false, withBirdwatchNotes: false, withVoice: true },
    });
    expect(buildXWebLikesReadRequest("123", 1, "next-fixture").variables.cursor).toBe("next-fixture");
    for (const viewer of ["", "@fixture", "123\n", "1".repeat(20)]) expect(() => buildXWebLikesReadRequest(viewer, 20)).toThrow();
    for (const limit of [0, 51, 1.5, Number.NaN]) expect(() => buildXWebLikesReadRequest("123", limit)).toThrow();
    for (const cursor of ["", "bad\nvalue", "x".repeat(4_097)]) expect(() => buildXWebLikesReadRequest("123", 20, cursor)).toThrow();
    const descriptor = { queryId: "mu4us66Q6RRNOywVQhGtRg", operationName: "Likes", operationType: "query" as const, metadata: { featureSwitches: [], fieldToggles: [] } };
    expect(authorizeXWebR1GraphQlRequest("feeds.likes", { method: "GET", url: `https://x.com/i/api/graphql/${descriptor.queryId}/Likes`, descriptor }).operationName).toBe("Likes");
    expect(() => authorizeXWebR1GraphQlRequest("feeds.likes", { method: "GET", url: `https://example.com/i/api/graphql/${descriptor.queryId}/Likes`, descriptor })).toThrow();
  });

  test("binds the collection to its viewer while retaining other authors and rich entries", () => {
    for (const response of [likesResponse(), likesResponse(null)]) {
      const page = projectXWebLikesReadPage(response, "123", 20);
      expect(page.posts[0]).toMatchObject({ id: "456", authorId: "789", text: "A liked public post" });
      expect(page.entries[0]).toMatchObject({ kind: "post", id: "456" });
      expect(page.cursor).toBe("next-fixture");
      expect(page.entriesTruncated).toBeFalse();
    }
    expect(() => projectXWebLikesReadPage(likesResponse("999"), "123", 20)).toThrow("requested user");
    expect(() => projectXWebLikesReadPage({ data: { home: {} } }, "123", 20)).toThrow();
    expect(() => projectXWebLikesReadPage({ errors: [{ message: "private provider text" }], data: likesResponse().data }, "123", 20)).toThrow();
  });
});

describe("X provider-issued discovery targets", () => {
  test("retains opaque target data only in the issuing host and returns an immutable copy", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    const mutable = { ...trend, value: String(trend.value) };
    const token = store.issue(account, mutable);
    mutable.value = "changed-after-issuance";
    expect(token).toMatch(/^xdt1_[0-9a-f-]{36}$/u);
    expect(token).not.toContain(trend.value);
    const result = store.resolve(token, account, "trending");
    expect(result).toEqual(trend);
    expect(Object.isFrozen(result)).toBeTrue();
    expect(() => new XWebDiscoveryTargetStore(() => 1_000).resolve(token, account, "trending"))
      .toThrow(XWebDiscoveryTargetUnavailableError);
  });

  test("binds the token to account namespace, exact subject, revision and source", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    const token = store.issue(account, trend);
    for (const changed of [{ ...account, accountId: "other" }, { ...account, subject: "456" }, { ...account, revision: "other" }]) {
      expect(() => store.resolve(token, changed, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
    }
    expect(() => store.resolve(token, account, "today-news")).toThrow(XWebDiscoveryTargetUnavailableError);
    expect(store.resolve(token, account, "trending")).toEqual(trend);
  });

  test("uses fixed expiry and never renews lifetime on resolution", () => {
    let now = 1_000;
    const store = new XWebDiscoveryTargetStore(() => now);
    const token = store.issue(account, trend);
    now += X_WEB_DISCOVERY_TARGET_BOUNDS.ttlMs - 1;
    expect(store.resolve(token, account, "trending")).toEqual(trend);
    now += 1;
    expect(() => store.resolve(token, account, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
  });

  test("bounds owner memory and evicts only the oldest derived selection", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    const oldest = store.issue(account, trend);
    let newest = oldest;
    for (let i = 0; i < X_WEB_DISCOVERY_TARGET_BOUNDS.maxEntries; i += 1) newest = store.issue(account, trend);
    expect(() => store.resolve(oldest, account, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
    expect(store.resolve(newest, account, "trending")).toEqual(trend);
  });

  test("account disconnect and host close revoke selections without affecting another account", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    const otherAccount = { ...account, accountId: "other-account" };
    const selected = store.issue(account, trend);
    const other = store.issue(otherAccount, trend);
    store.revokeAccount(account.accountId);
    expect(() => store.resolve(selected, account, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
    expect(store.resolve(other, otherAccount, "trending")).toEqual(trend);
    store.clear();
    expect(() => store.resolve(other, otherAccount, "trending")).toThrow(XWebDiscoveryTargetUnavailableError);
  });

  test("rejects malformed tokens without reflecting provider IDs or input", () => {
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    for (const value of [null, undefined, "", "https://x.com/i/news/private-target", "xdt1_not-a-uuid", { ...trend }]) {
      try { store.resolve(value, account, "trending"); throw new Error("unexpected resolution"); }
      catch (error) {
        expect(error).toBeInstanceOf(XWebDiscoveryTargetUnavailableError);
        expect((error as Error).message).not.toContain("private-target");
      }
    }
  });

  test("closes internal descriptors and account bindings before accepting a target", () => {
    for (const value of [null, [], {}, { ...trend, endpoint: "https://x.com" }, { ...trend, kind: "url" }, { ...trend, source: "all" }, { ...trend, value: "" }, { ...trend, value: "bad\nvalue" }, { ...trend, value: "x".repeat(4_097) }]) {
      expect(() => parseXWebDiscoveryTarget(value)).toThrow();
    }
    const store = new XWebDiscoveryTargetStore(() => 1_000);
    for (const changed of [{ ...account, subject: "@fixture" }, { ...account, revision: "" }, { ...account, extra: true }]) {
      expect(() => store.issue(changed, trend)).toThrow();
    }
    expect(() => new XWebDiscoveryTargetStore(() => Number.NaN).issue(account, trend)).toThrow("clock");
    expect(() => new XWebDiscoveryTargetStore(() => -1).issue(account, trend)).toThrow("clock");
  });

  test("target strings roundtrip as opaque values, never as caller request fields", () => {
    assertProperty(fc.property(fc.stringMatching(/^[A-Za-z0-9_:/?=&-]{1,100}$/u), value => {
      const store = new XWebDiscoveryTargetStore(() => 1_000);
      const target = { source: "today-news", kind: "story", value } as const;
      const token = store.issue(account, target);
      expect(store.resolve(token, account, "today-news")).toEqual(target);
      expect(() => store.resolve(value, account, "today-news")).toThrow(XWebDiscoveryTargetUnavailableError);
    }));
  });
});
