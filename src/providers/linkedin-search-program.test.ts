import { expect, test } from "bun:test";
import { Effect } from "effect";

import { assertProperty, fc } from "../test-support";
import {
  linkedInSearchDiagnostic,
  linkedInSearchReadFailure,
} from "./linkedin-search-failure";
import {
  LinkedInSearchPlatformLive,
  type LinkedInSearchNative,
} from "./linkedin-search-platform";
import { linkedInSearchReadProgram } from "./linkedin-search-program";
import {
  LinkedInSearchBrowserFailure,
  type LinkedInSearchBrowserTransport,
} from "./linkedin-web-search-browser";
import { linkedInSearchTarget, type LinkedInSearchPage } from "./linkedin-web-search";

const target = linkedInSearchTarget("exact query");

function card(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    activityUrn: `urn:li:activity:7511429088998297${600 + Math.floor(Math.random() * 90)}`,
    url: null,
    authorVanity: "j-hawkins",
    authorName: "J. Hawkins",
    authorHeadline: null,
    text: "observed result text",
    relativeTime: "1w",
    reactionCount: null,
    commentCount: null,
    ...overrides,
  };
}

function page(cards: readonly Readonly<Record<string, unknown>>[], nextPageRequest = false) {
  return { cards, searchId: null, nextPageRequest };
}

function program(transport: LinkedInSearchBrowserTransport, emitted = 0, limit = 25) {
  const native: LinkedInSearchNative = {
    openBrowser: () => Promise.resolve(transport),
    observedAt: () => "2026-10-04T00:00:00.000Z",
  };
  return linkedInSearchReadProgram(target, emitted, limit)
    .pipe(Effect.provide(LinkedInSearchPlatformLive(native)));
}

async function run(transport: LinkedInSearchBrowserTransport, emitted = 0, limit = 25) {
  return Effect.runPromise(program(transport, emitted, limit));
}

test("search read pages one bound query through the page pager", async () => {
  const first = page([card({ activityUrn: "urn:li:activity:7511429088998297601" })], true);
  const second = page([
    card({ activityUrn: "urn:li:activity:7511429088998297601" }),
    card({ activityUrn: "urn:li:activity:7511429088998297602" }),
  ], false);
  let closes = 0;
  let advances = 0;
  const execution = await run({
    openSearch: (bound) => {
      expect(bound).toBe(target);
      return Promise.resolve(first);
    },
    advancePager: () => {
      advances += 1;
      return Promise.resolve(second);
    },
    close: () => { closes += 1; return Promise.resolve(); },
  });
  expect(execution.status).toBe("succeeded");
  expect(advances).toBe(1);
  expect(closes).toBe(1);
  if (execution.status !== "succeeded") return;
  const output = execution.output as LinkedInSearchPage;
  expect(output.feed).toBe("search");
  expect(output.query).toBe("exact query");
  expect(output.posts.map((post) => post.activityUrn)).toEqual([
    "urn:li:activity:7511429088998297601",
    "urn:li:activity:7511429088998297602",
  ]);
  expect(output.complete).toBeTrue();
  expect(output.nextCursor).toBeNull();
});

test("search read stops paging once the bounded limit is satisfied", async () => {
  const pages = [
    page([card({ activityUrn: "urn:li:activity:7511429088998297601" })], true),
    page([card({ activityUrn: "urn:li:activity:7511429088998297602" })], true),
    page([card({ activityUrn: "urn:li:activity:7511429088998297603" })], true),
  ];
  let advances = 0;
  const execution = await run({
    openSearch: () => Promise.resolve(pages[0]),
    advancePager: () => Promise.resolve(pages[Math.min(++advances, 2)]),
    close: () => Promise.resolve(),
  }, 0, 2);
  expect(execution.status).toBe("succeeded");
  expect(advances).toBe(1);
  if (execution.status !== "succeeded") return;
  const output = execution.output as LinkedInSearchPage;
  expect(output.posts).toHaveLength(2);
  expect(output.complete).toBeFalse();
  expect(output.nextCursor).not.toBeNull();
});

test("search read terminates a non-advancing pager", async () => {
  const first = page([card({ activityUrn: "urn:li:activity:7511429088998297601" })], true);
  let advances = 0;
  const execution = await run({
    openSearch: () => Promise.resolve(first),
    advancePager: () => { advances += 1; return Promise.resolve(first); },
    close: () => Promise.resolve(),
  });
  expect(execution.status).toBe("succeeded");
  expect(advances).toBe(1);
  if (execution.status !== "succeeded") return;
  expect((execution.output as LinkedInSearchPage).complete).toBeTrue();
});

test("search read maps browser failures to bounded read projections and still closes", async () => {
  let closes = 0;
  for (const category of ["authwall", "session-cookie", "pager", "startup"] as const) {
    const failure = new LinkedInSearchBrowserFailure(category, "detail");
    const execution = await run({
      openSearch: () => Promise.reject(failure),
      advancePager: () => Promise.reject(new Error("unreachable")),
      close: () => { closes += 1; return Promise.resolve(); },
    });
    expect(execution.status).toBe("failed");
    if (execution.status !== "failed") continue;
    expect(execution.output).toBeNull();
    expect(execution.readFailure?.category).toBe(
      category === "authwall" || category === "session-cookie"
        ? "auth-repair-required"
        : category === "startup"
          ? "provider-temporary"
          : "contract-drift",
    );
    expect(execution.error).toContain("no remote write occurred");
  }
  expect(closes).toBe(4);
});

test("search read projects malformed snapshots as contract drift", async () => {
  const execution = await run({
    openSearch: () => Promise.resolve({ cards: "not-an-array", nextPageRequest: false }),
    advancePager: () => Promise.reject(new Error("unreachable")),
    close: () => Promise.resolve(),
  });
  expect(execution.status).toBe("failed");
  if (execution.status !== "failed") return;
  expect(execution.readFailure?.category).toBe("contract-drift");
});

test("search diagnostic cannot inherit account or auth authority from error text", () => {
  assertProperty(fc.property(
    fc.string({ maxLength: 256 }),
    fc.constantFrom("authwall", "session-cookie", "startup", "pager") as fc.Arbitrary<
      ConstructorParameters<typeof LinkedInSearchBrowserFailure>[0]
    >,
    (detail, category) => {
      const error = new LinkedInSearchBrowserFailure(category, detail);
      const projection = linkedInSearchReadFailure(error);
      expect(projection.category).toBe(
        category === "authwall" || category === "session-cookie"
          ? "auth-repair-required"
          : category === "startup"
            ? "provider-temporary"
            : "contract-drift",
      );
      const diagnostic = linkedInSearchDiagnostic(error, "page");
      expect(diagnostic).toContain("LinkedIn search read failed");
      expect(diagnostic).toContain("no remote write occurred");
    },
  ));
});
