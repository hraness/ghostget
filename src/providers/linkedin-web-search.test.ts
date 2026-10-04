import { describe, expect, test } from "bun:test";

import { assertProperty, fc } from "../test-support";
import {
  LINKEDIN_SEARCH_CURSOR_PREFIX,
  LINKEDIN_SEARCH_MAX_EMITTED,
  LINKEDIN_SEARCH_MAX_ITEMS,
  encodeLinkedInSearchCursor,
  linkedInSearchCard,
  linkedInSearchInputIssues,
  linkedInSearchKeywords,
  linkedInSearchSnapshot,
  linkedInSearchTarget,
  parseLinkedInSearchCursor,
  projectLinkedInSearchPage,
} from "./linkedin-web-search";

const OBSERVED_AT = "2026-10-04T00:00:00.000Z";

function card(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    activityUrn: "urn:li:activity:7511429088998297600",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7511429088998297600/",
    authorVanity: "j-hawkins",
    authorName: "J. Hawkins",
    authorHeadline: "Systems engineer",
    text: "one observed result",
    relativeTime: "2d",
    reactionCount: 42,
    commentCount: 7,
    ...overrides,
  };
}

describe("LinkedIn content-search contract", () => {
  test("binds the exact keywords into one reviewed search URL", () => {
    const target = linkedInSearchTarget("release engineering notes");
    expect(target.keywords).toBe("release engineering notes");
    const url = new URL(target.searchUrl);
    expect(url.origin).toBe("https://www.linkedin.com");
    expect(url.pathname).toBe("/search/results/content/");
    expect(url.searchParams.get("keywords")).toBe("release engineering notes");
    expect(url.searchParams.size).toBe(1);
    expect(linkedInSearchKeywords("  padded query  ")).toBe("padded query");
  });

  test("rejects unbounded or empty queries", () => {
    for (const value of ["", "   ", "x".repeat(201), "has\0nul", "carriage\rreturn", 42, null]) {
      expect(() => linkedInSearchKeywords(value)).toThrow();
    }
  });

  test("search cursors round-trip only inside their exact query", () => {
    const cursor = encodeLinkedInSearchCursor({ keywords: "exact query", emitted: 40 });
    expect(cursor.startsWith(`${LINKEDIN_SEARCH_CURSOR_PREFIX}:`)).toBeTrue();
    expect(parseLinkedInSearchCursor(cursor, "exact query")).toEqual({
      keywords: "exact query",
      emitted: 40,
    });
    expect(parseLinkedInSearchCursor(undefined, "exact query")).toEqual({
      keywords: "exact query",
      emitted: 0,
    });
    expect(() => parseLinkedInSearchCursor(cursor, "different query"))
      .toThrow("LinkedIn search cursor does not match the requested query");
    expect(() => parseLinkedInSearchCursor(`${LINKEDIN_SEARCH_CURSOR_PREFIX}:x:y`, "x"))
      .toThrow("LinkedIn search cursor is invalid");
    expect(() => parseLinkedInSearchCursor(
      `${LINKEDIN_SEARCH_CURSOR_PREFIX}:x:${LINKEDIN_SEARCH_MAX_EMITTED + 1}`,
      "x",
    )).toThrow("LinkedIn search cursor exceeded its reviewed bound");
    expect(encodeLinkedInSearchCursor({ keywords: "k", emitted: LINKEDIN_SEARCH_MAX_EMITTED }))
      .toContain(`:${LINKEDIN_SEARCH_MAX_EMITTED}`);
    expect(() => encodeLinkedInSearchCursor({
      keywords: "k",
      emitted: LINKEDIN_SEARCH_MAX_EMITTED + 1,
    })).toThrow("LinkedIn search cursor exceeded its reviewed bound");
  });

  test("search cursor round-trips across arbitrary reviewed queries and offsets", () => {
    assertProperty(fc.property(
      fc.string({
        minLength: 1,
        maxLength: 40,
      }).map((value) => value.replace(/[\0\r\n]/gu, " ").trim())
        .filter((value) => value.length > 0 && !value.includes(":")),
      fc.integer({ min: 0, max: LINKEDIN_SEARCH_MAX_EMITTED }),
      (keywords, emitted) => {
        const parsed = parseLinkedInSearchCursor(
          encodeLinkedInSearchCursor({ keywords, emitted }),
          keywords,
        );
        expect(parsed).toEqual({ keywords, emitted });
      },
    ));
  });

  test("search cards keep only the reviewed route shapes", () => {
    expect(linkedInSearchCard(card(), "card")).toMatchObject({
      activityUrn: "urn:li:activity:7511429088998297600",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7511429088998297600/",
      authorVanity: "j-hawkins",
      relativeTime: "2d",
      reactionCount: 42,
      commentCount: 7,
    });
    expect(() => linkedInSearchCard(card({ activityUrn: "urn:li:share:1" }), "card"))
      .toThrow("card.activityUrn is invalid");
    expect(() => linkedInSearchCard(card({ url: "https://evil.example/feed/update/urn:li:activity:7511429088998297600/" }), "card"))
      .toThrow("card.url escaped its exact reviewed route");
    expect(() => linkedInSearchCard(card({ url: "https://www.linkedin.com/feed/update/urn:li:activity:7511429088998297600/?utm=x" }), "card"))
      .toThrow("card.url escaped its exact reviewed route");
    expect(() => linkedInSearchCard(card({ url: "https://www.linkedin.com/in/j-hawkins/" }), "card"))
      .toThrow("card.url escaped its exact reviewed route");
    expect(() => linkedInSearchCard(card({ authorVanity: "not a vanity!" }), "card"))
      .toThrow();
    expect(() => linkedInSearchCard(card({ relativeTime: "yesterday-ish" }), "card"))
      .toThrow("card.relativeTime is invalid");
    expect(() => linkedInSearchCard(card({ reactionCount: -1 }), "card"))
      .toThrow("card.reactionCount must be a non-negative safe integer");
    expect(linkedInSearchCard(card({ url: null, text: null }), "card").url).toBeNull();
  });

  test("search snapshots require an exact bounded envelope", () => {
    expect(linkedInSearchSnapshot({
      cards: [card()],
      searchId: "0fb5c4c0-5f36-4c4c-9b6a-6dbcf7f3b6a1",
      nextPageRequest: true,
    })).toMatchObject({ nextPageRequest: true });
    expect(() => linkedInSearchSnapshot({ cards: [card()], nextPageRequest: "yes" }))
      .toThrow("LinkedIn search snapshot omitted its pager state");
    expect(() => linkedInSearchSnapshot({ cards: "not-array", nextPageRequest: true }))
      .toThrow("LinkedIn search snapshot cards are malformed");
    expect(() => linkedInSearchSnapshot({
      cards: [],
      searchId: "not-a-uuid",
      nextPageRequest: true,
    })).toThrow("LinkedIn search id is invalid");
    expect(() => linkedInSearchSnapshot({
      cards: Array.from({ length: 201 }, () => card()),
      nextPageRequest: true,
    })).toThrow("LinkedIn search snapshot cards are malformed");
  });

  test("projection dedupes cards and pages the exact emitted offset", () => {
    const target = linkedInSearchTarget("query");
    const first = linkedInSearchSnapshot({
      cards: [card(), card({ activityUrn: "urn:li:activity:7511429088998297601" })],
      nextPageRequest: true,
    });
    const second = linkedInSearchSnapshot({
      cards: [
        card({ activityUrn: "urn:li:activity:7511429088998297601" }),
        card({ activityUrn: "urn:li:activity:7511429088998297602" }),
      ],
      nextPageRequest: false,
    });
    const page = projectLinkedInSearchPage({
      snapshots: [first, second],
      target,
      emitted: 0,
      limit: LINKEDIN_SEARCH_MAX_ITEMS,
      observedAt: OBSERVED_AT,
      pagerExhausted: true,
    });
    expect(page.posts.map((post) => post.activityUrn)).toEqual([
      "urn:li:activity:7511429088998297600",
      "urn:li:activity:7511429088998297601",
      "urn:li:activity:7511429088998297602",
    ]);
    expect(page.complete).toBeTrue();
    expect(page.nextCursor).toBeNull();
    expect(page.query).toBe("query");
    expect(page.feed).toBe("search");

    const resumed = projectLinkedInSearchPage({
      snapshots: [first, second],
      target,
      emitted: 1,
      limit: 1,
      observedAt: OBSERVED_AT,
      pagerExhausted: true,
    });
    expect(resumed.posts.map((post) => post.activityUrn))
      .toEqual(["urn:li:activity:7511429088998297601"]);
    expect(resumed.complete).toBeFalse();
    expect(resumed.nextCursor).not.toBeNull();
    expect(parseLinkedInSearchCursor(resumed.nextCursor ?? undefined, "query"))
      .toEqual({ keywords: "query", emitted: 2 });
  });

  test("projection keeps a cursor only while the page genuinely has more", () => {
    const target = linkedInSearchTarget("query");
    const snapshot = linkedInSearchSnapshot({
      cards: [card()],
      nextPageRequest: true,
    });
    const more = projectLinkedInSearchPage({
      snapshots: [snapshot],
      target,
      emitted: 0,
      limit: 10,
      observedAt: OBSERVED_AT,
      pagerExhausted: false,
    });
    expect(more.nextCursor).not.toBeNull();
    expect(more.complete).toBeFalse();

    const exhausted = projectLinkedInSearchPage({
      snapshots: [snapshot],
      target,
      emitted: 0,
      limit: 10,
      observedAt: OBSERVED_AT,
      pagerExhausted: true,
    });
    expect(exhausted.nextCursor).toBeNull();
    expect(exhausted.complete).toBeTrue();
  });

  test("projection fails closed on missing URNs and undersized resumes", () => {
    const target = linkedInSearchTarget("query");
    expect(() => projectLinkedInSearchPage({
      snapshots: [linkedInSearchSnapshot({
        cards: [card({ activityUrn: null })],
        nextPageRequest: false,
      })],
      target,
      emitted: 0,
      limit: 10,
      observedAt: OBSERVED_AT,
      pagerExhausted: true,
    })).toThrow("LinkedIn search card omitted its activity URN");
    expect(() => projectLinkedInSearchPage({
      snapshots: [linkedInSearchSnapshot({ cards: [card()], nextPageRequest: false })],
      target,
      emitted: 5,
      limit: 10,
      observedAt: OBSERVED_AT,
      pagerExhausted: true,
    })).toThrow("LinkedIn search resumed fewer results than its cursor emitted");
  });

  test("input issues admit only the exact search variant", () => {
    expect(linkedInSearchInputIssues({ feed: "profile-activity" })).toEqual([]);
    expect(linkedInSearchInputIssues({ feed: "search", query: "exact" })).toEqual([]);
    expect(linkedInSearchInputIssues({ feed: "search" }))
      .toContain("input.query is required for the search feed");
    expect(linkedInSearchInputIssues({ feed: "search", query: "exact", vanity: "x" }))
      .toContain("input.vanity is not accepted for the search feed");
    expect(linkedInSearchInputIssues({ feed: "search", query: "exact", profile_url: "x" }))
      .toContain("input.profile_url is not accepted for the search feed");
    expect(linkedInSearchInputIssues({ feed: "search", query: "exact", cursor: "bogus" }))
      .toContain("LinkedIn search cursor is invalid");
    const cursor = encodeLinkedInSearchCursor({ keywords: "other", emitted: 3 });
    expect(linkedInSearchInputIssues({ feed: "search", query: "exact", cursor }))
      .toContain("LinkedIn search cursor does not match the requested query");
    expect(linkedInSearchInputIssues({
      feed: "search",
      query: "exact",
      cursor: encodeLinkedInSearchCursor({ keywords: "exact", emitted: 3 }),
    })).toEqual([]);
  });
});
