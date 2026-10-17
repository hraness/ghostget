import { describe, expect, test } from "bun:test";
import { assertProperty, fc } from "../test-support";

import {
  assertExactXWebGraphQlBinding,
  authorizeXWebLegacyDmR1Read,
  authorizeXWebMutationRequest,
  authorizeXWebR1GraphQlRequest,
  bindXWebOperationMetadataValues,
  buildXWebGraphQlPath,
  classifyXWebHeaderNamesForEvidence,
  enforceXWebHeaderSinkPolicy,
  assertXWebUserFeedTargetBound,
  extractXWebGraphQlReadResponseRoot,
  extractXWebUrtBottomCursor,
  MAX_X_CREATE_TWEET_TEXT_LENGTH,
  normalizeXWebGraphQlTimelineResponse,
  normalizeXWebProfileHandle,
  parseXWebBookmarkExportPage,
  parseXWebBookmarkExportRecord,
  projectXWebBookmarkExportPage,
  projectXWebBookmarkExportRecord,
  projectXWebContactPage,
  projectXWebFeedPage,
  projectXWebFeedPost,
  projectXWebProfileStats,
  normalizeXWebUrtTimeline,
  resolveUniqueXWebBundleDescriptor,
  xWebDescriptorMetadataSha256,
  resolveXWebLegacyDmInbox,
  validateXWebDesiredStateMutation,
  xWebHeaderSinkPolicy,
  xWebLegacyDmInboxMapping,
  xWebQueryDescriptorEvidenceSnapshot,
  xWebQueryDescriptorKey,
  xWebSemanticOperationRegistry,
  type XWebBundleQueryDescriptor,
  type XWebQueryDescriptorEvidence,
  type XWebSemanticOperationId,
} from "./x-web";

function evidence(operationName: string): XWebQueryDescriptorEvidence {
  const matches = xWebQueryDescriptorEvidenceSnapshot.descriptors.filter(
    (candidate) => candidate.operationName === operationName,
  );
  if (matches.length !== 1) throw new Error(`test expected one evidence descriptor for ${operationName}`);
  return matches[0]!;
}

function descriptor(
  operationName: string,
  options: {
    readonly operationType?: "query" | "mutation";
    readonly queryId?: string;
    readonly features?: readonly string[];
    readonly toggles?: readonly string[];
  } = {},
): XWebBundleQueryDescriptor {
  const captured = evidence(operationName);
  return {
    operationName,
    operationType: options.operationType ?? captured.operationType,
    queryId: options.queryId ?? captured.queryId,
    metadata: {
      featureSwitches: options.features ?? ["responsive_web_graphql_timeline_navigation_enabled"],
      fieldToggles: options.toggles ?? ["withAuxiliaryUserLabels"],
    },
  };
}

function graphqlUrl(value: XWebBundleQueryDescriptor, query = ""): string {
  return `https://x.com${buildXWebGraphQlPath(value)}${query}`;
}

function timelineItemEntry(
  entryId: string,
  result: unknown,
  options: { readonly sortIndex?: string; readonly itemType?: string } = {},
): unknown {
  return {
    entryId,
    sortIndex: options.sortIndex ?? "100",
    content: {
      entryType: "TimelineTimelineItem",
      itemContent: {
        itemType: options.itemType ?? "TimelineTweet",
        ...(options.itemType === undefined || options.itemType === "TimelineTweet"
          ? { tweet_results: { result } }
          : {}),
      },
    },
  };
}

function cursorEntry(entryId: string, cursorType: string, value: string): unknown {
  return {
    entryId,
    sortIndex: "1",
    content: { entryType: "TimelineTimelineCursor", cursorType, value },
  };
}

function timelineUserEntry(
  id: string,
  userResult: unknown,
  options: { readonly sortIndex?: string } = {},
): unknown {
  return {
    entryId: `user-${id}`,
    sortIndex: options.sortIndex ?? "100",
    content: {
      entryType: "TimelineTimelineItem",
      itemContent: {
        itemType: "TimelineUser",
        user_results: userResult,
      },
    },
  };
}

function timeline(...entries: readonly unknown[]): unknown {
  return { instructions: [{ type: "TimelineAddEntries", entries }] };
}

describe("X query descriptor revision evidence", () => {
  test("marks the snapshot as evidence that can never authorize dispatch by itself", () => {
    expect(xWebQueryDescriptorEvidenceSnapshot.role).toBe("revision-evidence-only");
    expect(xWebQueryDescriptorEvidenceSnapshot.currentBundleResolutionRequired).toBe(true);
    expect(xWebQueryDescriptorEvidenceSnapshot.observedOn).toBe("2026-10-08");
    expect(xWebQueryDescriptorEvidenceSnapshot.mainBundleUrl).toStartWith("https://abs.twimg.com/");
  });

  test("contains unique exact operation/type/query-ID evidence", () => {
    const keys = xWebQueryDescriptorEvidenceSnapshot.descriptors.map(xWebQueryDescriptorKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const item of xWebQueryDescriptorEvidenceSnapshot.descriptors) {
      expect(item.operationName).toMatch(/^[A-Za-z][A-Za-z0-9_]+$/u);
      expect(item.operationType === "query" || item.operationType === "mutation").toBe(true);
      expect(item.queryId).toMatch(/^[A-Za-z0-9_-]{8,128}$/u);
      expect(item.sourceChunk.endsWith(".js")).toBe(true);
    }
  });

  test("records the current reviewed Bookmarks observation", () => {
    const bookmarks = evidence("Bookmarks");
    expect(bookmarks).toMatchObject({
      queryId: "OAtFv0SIZt6v3rZsF4gvJA",
      sourceChunk: "shared~bundle.BookmarkFolders~bundle.Bookmarks.cdf420f8928d5b0ea.js",
      observedOn: "2026-10-08",
    });
    expect(bookmarks.queryId).not.toBe("iblrFnKr6PZUR-dWpfXG6g");
    expect(bookmarks.queryId).not.toBe("tF6KOjmZM0WGcB2Q0mfwhw");
    expect(bookmarks.queryId).not.toBe("LoLaMO4GuHLEPJGhostgetH9kjAw");
    expect(bookmarks.queryId).not.toBe("-dgKZ58Dr9YSJYrcgEb5KA");
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("iblrFnKr6PZUR-dWpfXG6g");
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("tF6KOjmZM0WGcB2Q0mfwhw");
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("LoLaMO4GuHLEPJGhostgetH9kjAw");
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("-dgKZ58Dr9YSJYrcgEb5KA");
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("433463ce78e2afaba");
  });

  test("records the current reviewed UserTweets and SearchTimeline observations", () => {
    expect(evidence("UserTweets")).toMatchObject({
      queryId: "P4MigfQQcQgVgHNg1_H5lA",
      sourceChunk: "main.ec728870257106e0a.js",
      observedOn: "2026-10-08",
    });
    expect(evidence("SearchTimeline")).toMatchObject({
      queryId: "ph2fARFabkwfxqmSKQ1OPw",
      sourceChunk: "main.ec728870257106e0a.js",
      observedOn: "2026-10-08",
    });
    expect(xWebSemanticOperationRegistry["feeds.user"]).toEqual({
      semanticOperation: "feeds.read",
      risk: "R1",
      transport: "graphql-query",
      operationName: "UserTweets",
      operationType: "query",
      responseRoot: ["user", "result", "timeline", "timeline"],
    });
    expect(xWebSemanticOperationRegistry["feeds.search"]).toEqual({
      semanticOperation: "feeds.read",
      risk: "R1",
      transport: "graphql-query",
      operationName: "SearchTimeline",
      operationType: "query",
      responseRoot: ["search_by_raw_query", "search_timeline", "timeline"],
    });
    const serialized = JSON.stringify(xWebQueryDescriptorEvidenceSnapshot);
    expect(serialized).not.toContain("6r5OLCC_wFH4CpRyXKuAmQ");
    expect(serialized).not.toContain("SXVCYB8XHSS25nzIljNtZA");
    expect(serialized).not.toContain("eviprbEPLvNG88V3smUngQ");
    expect(serialized).not.toContain("hyPfJYJ_XAtDYoslQc-Rgg");
    expect(serialized).not.toContain("hz_94eVAtrtQo_vO3my7Rw");
    expect(serialized).not.toContain("auLkqtmHqYEpRvflfvLhyQ");
    expect(serialized).not.toContain("jeAA-59Y9FL7FmjgBNIVPw");
  });

  test("records the current reviewed HomeLatestTimeline observation", () => {
    expect(evidence("HomeLatestTimeline")).toMatchObject({
      queryId: "5URyiXQyz6_8NZnoV37OVQ",
      sourceChunk: "shared~bundle.Compose~bundle.HomeTimeline~bundle.LoggedInMain.47781478b7ea71d8a.js",
      observedOn: "2026-10-08",
    });
    expect(evidence("HomeTimeline")).toMatchObject({
      queryId: "V0wMxbYBxdrkfmV3kJSyRQ",
      sourceChunk: "shared~bundle.Compose~bundle.HomeTimeline~bundle.LoggedInMain.47781478b7ea71d8a.js",
      observedOn: "2026-10-08",
    });
  });

  test("records the current reviewed CreateTweet observation", () => {
    expect(evidence("CreateTweet")).toMatchObject({
      queryId: "5pUpVEnRC2yGK7jaguF11w",
      sourceChunk: "main.ec728870257106e0a.js",
      observedOn: "2026-10-08",
    });
    expect(evidence("CreateTweet").queryId).not.toBe("GYdIGqVWfZNho79bQ2XDoA");
  });

  test("records the current reviewed Viewer and Article descriptor observations", () => {
    expect(evidence("Viewer")).toMatchObject({
      queryId: "TpQxQtWMTMnIAMPlMGMqNw",
      sourceChunk: "main.ec728870257106e0a.js",
      observedOn: "2026-10-08",
    });
    expect(evidence("Viewer").queryId).not.toBe("5XShkXk2oO2J7SYmTu6pvw");
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("5XShkXk2oO2J7SYmTu6pvw");
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("main.cd39a626fdb81748a.js");
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("main.52fc4dd0aada586aa.js");
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("main.a9c37180a4c75840a.js");
    expect(evidence("ArticleEntityDraftCreate")).toMatchObject({
      queryId: "fCkdrI6zrnw_UtVa3WDHhw",
      sourceChunk: "bundle.TwitterArticles.a46d1c2f8088ffbaa.js",
      observedOn: "2026-10-08",
    });
  });

  test("records the current reviewed UserByScreenName observation", () => {
    expect(evidence("UserByScreenName")).toMatchObject({
      queryId: "AMIBMjtxEEATh4z8V9GtRg",
      sourceChunk: "main.ec728870257106e0a.js",
      observedOn: "2026-10-08",
    });
    expect(JSON.stringify(xWebQueryDescriptorEvidenceSnapshot))
      .not.toContain("Gb-d6r0vxPOADdG62OEBpQ");
    expect(xWebSemanticOperationRegistry["profiles.by-handle"]).toEqual({
      semanticOperation: "profiles.read",
      risk: "R1",
      transport: "graphql-query",
      operationName: "UserByScreenName",
      operationType: "query",
      responseRoot: ["user", "result"],
    });
  });

  test("records the observed numeric-target UserByRestId query without adding a public profile route", () => {
    expect(evidence("UserByRestId")).toEqual({
      operationName: "UserByRestId", operationType: "query", queryId: "mxaYWwt52eAb6OAzYHMVzg",
      sourceChunk: "main.3999c6d7f4dbb6c7a.js", observedOn: "2026-10-17",
      metadataSha256: "81ae66e15cf12e2581a6fe8df84921f30aca115186fb85ca29c8c28e8b390506",
    });
    const publicQueries: readonly string[] = Object.values(xWebSemanticOperationRegistry)
      .flatMap(definition => definition.transport === "graphql-query" ? [definition.operationName] : []);
    expect(publicQueries).not.toContain("UserByRestId");
  });

  test("keeps transport query IDs out of the semantic registry", () => {
    const serialized = JSON.stringify(xWebSemanticOperationRegistry);
    for (const captured of xWebQueryDescriptorEvidenceSnapshot.descriptors) {
      expect(serialized.includes(captured.queryId)).toBe(false);
    }
    for (const definition of Object.values(xWebSemanticOperationRegistry)) {
      expect(Object.hasOwn(definition, "queryId")).toBe(false);
    }
  });

  test("has evidence for every GraphQL operation referenced by the registry", () => {
    for (const definition of Object.values(xWebSemanticOperationRegistry)) {
      const operationNames = definition.transport === "graphql-query"
        ? [definition.operationName]
        : definition.transport === "graphql-desired-state"
          ? [definition.enabled.operationName, definition.disabled.operationName]
          : [];
      for (const operationName of operationNames) expect(() => evidence(operationName)).not.toThrow();
    }
  });
});

describe("exact current-bundle descriptor resolution", () => {
  test("returns one exact reviewed descriptor and freezes parsed metadata", () => {
    const current = descriptor("HomeTimeline", {
      features: ["responsive_web_graphql_timeline_navigation_enabled", "verified_phone_label_enabled"],
      toggles: ["withPayments"],
    });
    const resolved = resolveUniqueXWebBundleDescriptor([current], evidence("HomeTimeline"));
    expect(resolved).toEqual(current);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.metadata)).toBe(true);
    expect(Object.isFrozen(resolved.metadata.featureSwitches)).toBe(true);
  });

  test("selects the exact operation among unrelated descriptors", () => {
    const current = descriptor("SearchTimeline");
    const resolved = resolveUniqueXWebBundleDescriptor(
      [descriptor("Bookmarks"), current, descriptor("FavoriteTweet")],
      evidence("SearchTimeline"),
    );
    expect(resolved.operationName).toBe("SearchTimeline");
  });

  test("fails when the operation disappeared", () => {
    expect(() => resolveUniqueXWebBundleDescriptor(
      [descriptor("Bookmarks")],
      evidence("HomeTimeline"),
    )).toThrow("omitted operation HomeTimeline");
  });

  test("fails explicit operation-type drift", () => {
    expect(() => resolveUniqueXWebBundleDescriptor(
      [descriptor("HomeTimeline", { operationType: "mutation" })],
      evidence("HomeTimeline"),
    )).toThrow("operation-type drift");
  });

  test("fails explicit query-ID drift without revealing or adopting the new ID", () => {
    let failure: Error | null = null;
    try {
      resolveUniqueXWebBundleDescriptor(
        [descriptor("HomeTimeline", { queryId: "ChangedQueryId_12345" })],
        evidence("HomeTimeline"),
      );
    } catch (error) {
      failure = error instanceof Error ? error : null;
    }
    expect(failure?.message).toContain("query-ID drift");
    expect(failure?.message).not.toContain("ChangedQueryId_12345");
  });

  test("follows a pure query-ID rotation whose reviewed metadata fingerprint still matches", () => {
    const metadata = {
      features: ["responsive_web_graphql_timeline_navigation_enabled"],
      toggles: ["withPayments"],
    };
    const reviewed = {
      ...evidence("HomeTimeline"),
      metadataSha256: xWebDescriptorMetadataSha256({
        featureSwitches: metadata.features,
        fieldToggles: metadata.toggles,
      }),
    };
    const resolved = resolveUniqueXWebBundleDescriptor(
      [descriptor("HomeTimeline", { queryId: "RotatedQueryId_12345", ...metadata })],
      reviewed,
    );
    expect(resolved.queryId).toBe("RotatedQueryId_12345");
    expect(resolved.rotatedFrom).toBe(reviewed.queryId);
    // The resolved descriptor is re-parsed when the request path is built, so it must survive that.
    expect(buildXWebGraphQlPath(resolved)).toContain("RotatedQueryId_12345/HomeTimeline");
  });

  test("still fails a rotation whose feature or toggle set also changed", () => {
    const reviewed = {
      ...evidence("HomeTimeline"),
      metadataSha256: xWebDescriptorMetadataSha256({
        featureSwitches: ["responsive_web_graphql_timeline_navigation_enabled"],
        fieldToggles: ["withPayments"],
      }),
    };
    expect(() => resolveUniqueXWebBundleDescriptor(
      [descriptor("HomeTimeline", {
        queryId: "RotatedQueryId_12345",
        features: ["responsive_web_graphql_timeline_navigation_enabled"],
        toggles: ["withPayments", "withDmBlocks"],
      })],
      reviewed,
    )).toThrow("feature or field-toggle set also changed");
  });

  test("fails a rotation when the evidence carries no metadata fingerprint", () => {
    const { metadataSha256: _omit, ...unfingerprinted } = evidence("HomeTimeline") as ReturnType<typeof evidence> & { metadataSha256?: string };
    expect(() => resolveUniqueXWebBundleDescriptor(
      [descriptor("HomeTimeline", { queryId: "RotatedQueryId_12345" })],
      unfingerprinted,
    )).toThrow("no reviewed metadata fingerprint");
  });

  test("rejects duplicate copies of the same descriptor", () => {
    const current = descriptor("HomeTimeline");
    expect(() => resolveUniqueXWebBundleDescriptor(
      [current, structuredClone(current)],
      evidence("HomeTimeline"),
    )).toThrow("duplicate descriptor");
  });

  test("rejects multiple query IDs for the same logical operation as ambiguous drift", () => {
    expect(() => resolveUniqueXWebBundleDescriptor(
      [
        descriptor("HomeTimeline"),
        descriptor("HomeTimeline", { queryId: "AnotherQueryId_12345" }),
      ],
      evidence("HomeTimeline"),
    )).toThrow("ambiguous query-ID drift");
  });

  test("rejects malformed descriptors before matching", () => {
    const base = descriptor("HomeTimeline");
    const cases: readonly unknown[] = [
      { ...base, extra: true },
      { ...base, queryId: "bad id" },
      { ...base, operationName: "Home-Timeline" },
      { ...base, operationType: "subscription" },
      { ...base, metadata: [] },
      { ...base, metadata: { featureSwitches: ["ok", "ok"], fieldToggles: [] } },
      { ...base, metadata: { featureSwitches: [], fieldToggles: ["Bad-Toggle"] } },
      { ...base, metadata: { featureSwitches: [], fieldToggles: [], extra: true } },
    ];
    for (const candidate of cases) {
      expect(() => resolveUniqueXWebBundleDescriptor([candidate], evidence("HomeTimeline"))).toThrow();
    }
  });

  test("requires an exact descriptor-key object", () => {
    expect(() => resolveUniqueXWebBundleDescriptor(
      [descriptor("HomeTimeline")],
      { ...evidence("HomeTimeline"), unexpected: "not-part-of-the-key" },
    )).toThrow("unsupported field");
  });

  test("binds feature and field-toggle values to the descriptor's exact declared sets", () => {
    const current = descriptor("HomeTimeline", {
      features: ["feature_b", "feature_a"],
      toggles: ["withPayments", "withAuxiliaryUserLabels"],
    });
    expect(bindXWebOperationMetadataValues(current, {
      features: { feature_a: false, feature_b: true },
      fieldToggles: { withAuxiliaryUserLabels: false, withPayments: true },
    })).toEqual({
      features: { feature_a: false, feature_b: true },
      fieldToggles: { withAuxiliaryUserLabels: false, withPayments: true },
    });
  });

  test("rejects missing, borrowed, extra, non-boolean, and structurally invalid metadata values", () => {
    const current = descriptor("HomeTimeline", {
      features: ["feature_a"],
      toggles: ["withPayments"],
    });
    const failures: readonly unknown[] = [
      null,
      {},
      { features: {}, fieldToggles: { withPayments: true } },
      { features: { feature_a: true, borrowed_feature: false }, fieldToggles: { withPayments: true } },
      { features: { feature_a: "true" }, fieldToggles: { withPayments: true } },
      { features: { feature_a: true }, fieldToggles: {} },
      { features: { feature_a: true }, fieldToggles: { withPayments: true, withUnknown: false } },
      { features: { feature_a: true }, fieldToggles: { withPayments: true }, extra: true },
    ];
    for (const candidate of failures) {
      expect(() => bindXWebOperationMetadataValues(current, candidate)).toThrow();
    }
  });
});

describe("X browser-session header sink policy", () => {
  test("allows only exact code-owned fixed headers on the network sink", () => {
    const authorized = enforceXWebHeaderSinkPolicy({
      source: "code",
      sink: "network-request",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Twitter-Auth-Type": "OAuth2Session",
        "X-Twitter-Active-User": "yes",
        "X-Twitter-Client-Language": "en-US",
      },
    });
    expect(authorized.names).toEqual([
      "accept",
      "content-type",
      "x-twitter-active-user",
      "x-twitter-auth-type",
      "x-twitter-client-language",
    ]);
    expect(authorized.values.authorization).toBeUndefined();
  });

  test("allows only Ghostget-owned deterministic multipart boundaries for image upload", () => {
    expect(enforceXWebHeaderSinkPolicy({
      source: "code",
      sink: "network-request",
      headers: {
        "Content-Type": `multipart/form-data; boundary=wrench-x-media-${"a".repeat(32)}`,
      },
    }).names).toEqual(["content-type"]);
    for (const value of [
      "multipart/form-data",
      "multipart/form-data; boundary=user-selected",
      `multipart/form-data; boundary=wrench-x-media-${"A".repeat(32)}`,
    ]) {
      expect(() => enforceXWebHeaderSinkPolicy({
        source: "code",
        sink: "network-request",
        headers: { "Content-Type": value },
      })).toThrow("unsupported value");
    }
  });

  test("allows ephemeral authorization, CSRF, and transaction values only in origin", () => {
    const authorized = enforceXWebHeaderSinkPolicy({
      source: "in-origin-session",
      sink: "network-request",
      headers: {
        Authorization: "Bearer public-first-party-web-token",
        "X-CSRF-Token": "csrf_token_value_123456",
        "X-Client-Transaction-Id": "transaction_id-123456",
      },
    });
    expect(authorized.names).toEqual([
      "authorization",
      "x-client-transaction-id",
      "x-csrf-token",
    ]);
  });

  test("rejects ephemeral values from code, manifests, adapters, and user input", () => {
    for (const source of ["code", "manifest", "adapter", "user-input"] as const) {
      expect(() => enforceXWebHeaderSinkPolicy({
        source,
        sink: "network-request",
        headers: { Authorization: "Bearer must-not-cross" },
      })).toThrow();
    }
  });

  test("rejects all raw headers from persistent sinks without echoing values", () => {
    for (const sink of xWebHeaderSinkPolicy.persistentSinks) {
      let failure: Error | null = null;
      try {
        enforceXWebHeaderSinkPolicy({
          source: "in-origin-session",
          sink,
          headers: { "X-CSRF-Token": "secret_csrf_value_123456" },
        });
      } catch (error) {
        failure = error instanceof Error ? error : null;
      }
      expect(failure?.message).toContain(`may not flow to ${sink}`);
      expect(failure?.message).not.toContain("secret_csrf_value_123456");
    }
  });

  test("permits an empty persistent header record", () => {
    expect(enforceXWebHeaderSinkPolicy({ source: "code", sink: "fixture", headers: {} })).toEqual({
      names: [],
      values: {},
    });
  });

  test("rejects browser-owned, proxy, unknown, and case-duplicate headers", () => {
    for (const headers of [
      { Cookie: "auth_token=nope" },
      { Origin: "https://x.com" },
      { Referer: "https://x.com/home" },
      { "Sec-Fetch-Site": "same-origin" },
      { "Proxy-Authorization": "nope" },
      { "X-Unreviewed": "value" },
      { Accept: "application/json", accept: "application/json" },
    ]) {
      expect(() => enforceXWebHeaderSinkPolicy({
        source: "code",
        sink: "network-request",
        headers,
      })).toThrow();
    }
  });

  test("rejects malformed or incorrect fixed and ephemeral values", () => {
    const cases: readonly ["code" | "in-origin-session", Readonly<Record<string, string>>][] = [
      ["code", { Accept: "*/*" }],
      ["code", { "Content-Type": "text/plain" }],
      ["code", { "X-Twitter-Auth-Type": "OAuth" }],
      ["code", { "X-Twitter-Active-User": "true" }],
      ["code", { "X-Twitter-Client-Language": "not a locale" }],
      ["in-origin-session", { Authorization: "Basic nope" }],
      ["in-origin-session", { "X-CSRF-Token": "short" }],
      ["in-origin-session", { "X-Client-Transaction-Id": "short" }],
      ["in-origin-session", { "X-CSRF-Token": "valid_value_123456\nsmuggled" }],
    ];
    for (const [source, headers] of cases) {
      expect(() => enforceXWebHeaderSinkPolicy({ source, sink: "network-request", headers })).toThrow();
    }
  });

  test("rejects LF in request header values after public tweet text admits newlines", () => {
    expect(() => enforceXWebHeaderSinkPolicy({
      source: "in-origin-session",
      sink: "network-request",
      headers: { "X-CSRF-Token": "valid_value_123456\nsmuggled" },
    })).toThrow("X request header x-csrf-token had an invalid value");
  });

  test("classifies names for evidence without accepting or returning values", () => {
    expect(classifyXWebHeaderNamesForEvidence([
      "X-CSRF-Token",
      "Cookie",
      "Accept",
      "X-Unreviewed",
    ])).toEqual([
      { name: "accept", ownership: "fixed-code" },
      { name: "cookie", ownership: "browser-managed" },
      { name: "x-csrf-token", ownership: "in-origin-ephemeral" },
      { name: "x-unreviewed", ownership: "forbidden" },
    ]);
    expect(() => classifyXWebHeaderNamesForEvidence(["Accept", "accept"])).toThrow("duplicate");
  });
});

describe("strict GraphQL operation/path/query-ID binding", () => {
  test("authorizes every registered R1 GraphQL query against its current resolved descriptor", () => {
    for (const [operationId, definition] of Object.entries(xWebSemanticOperationRegistry)) {
      if (definition.transport !== "graphql-query") continue;
      const resolved = descriptor(definition.operationName);
      const binding = authorizeXWebR1GraphQlRequest(operationId as XWebSemanticOperationId, {
        method: "GET",
        url: graphqlUrl(resolved, "?variables=%7B%7D&features=%7B%7D"),
        descriptor: resolved,
      });
      expect(binding.operationName).toBe(definition.operationName);
      expect(binding.operationType).toBe("query");
      expect(binding.queryId).toBe(resolved.queryId);
    }
  });

  test("binds a POST query body to the same path descriptor", () => {
    const resolved = descriptor("HomeTimeline");
    const binding = authorizeXWebR1GraphQlRequest("feeds.for-you", {
      method: "POST",
      url: graphqlUrl(resolved),
      descriptor: resolved,
      body: JSON.stringify({
        queryId: resolved.queryId,
        operationName: resolved.operationName,
        operationType: "query",
        variables: { count: 20 },
        features: {},
      }),
    });
    expect(binding.method).toBe("POST");
  });

  test("allows mutation binding only with POST while keeping it outside R1", () => {
    const resolved = descriptor("FavoriteTweet");
    const binding = assertExactXWebGraphQlBinding({
      method: "POST",
      url: graphqlUrl(resolved),
      descriptor: resolved,
      body: { queryId: resolved.queryId, variables: { tweet_id: "123" } },
    });
    expect(binding.operationType).toBe("mutation");
    expect(() => authorizeXWebR1GraphQlRequest("likes.set", {
      method: "POST",
      url: graphqlUrl(resolved),
      descriptor: resolved,
      body: {},
    })).toThrow("not an allowlisted X R1");
    expect(() => assertExactXWebGraphQlBinding({
      method: "GET",
      url: graphqlUrl(resolved),
      descriptor: resolved,
    })).toThrow("mutations require POST");
  });

  test("keeps historical repost variables separate from the guarded current ordinary-target shape", () => {
    for (const enabled of [true, false]) {
      const operationId = enabled ? "reposts.enable" : "reposts.disable";
      const resolved = descriptor(enabled ? "CreateRetweet" : "DeleteRetweet", { features: [], toggles: [] });
      const key = enabled ? "tweet_id" : "source_tweet_id";
      const bound = (variables: unknown) => ({ method: "POST" as const, url: graphqlUrl(resolved), descriptor: resolved,
        body: { variables, features: {}, queryId: resolved.queryId } });
      const current = { [key]: "9876543210123456789" };
      const historical = { ...current, dark_request: false };
      expect(authorizeXWebMutationRequest(operationId, bound(historical))).toMatchObject({ operationName: resolved.operationName });
      expect(() => authorizeXWebMutationRequest(operationId, bound(current))).toThrow("dark_request");
      expect(authorizeXWebMutationRequest(operationId, bound(current), { postsRepostContractVersion: 2 }))
        .toMatchObject({ operationName: resolved.operationName });
      expect(() => authorizeXWebMutationRequest(operationId, bound(historical), { postsRepostContractVersion: 2 })).toThrow("dark_request");
      for (const variables of [{ [key]: 123 }, { [key]: "1".repeat(20) }, { [key]: "123&other=456" },
        { [enabled ? "source_tweet_id" : "tweet_id"]: "123" }, { ...current, engagement_request: {} },
        { ...current, impression_id: "123" }, { ...current, queryId: resolved.queryId }]) {
        expect(() => authorizeXWebMutationRequest(operationId, bound(variables), { postsRepostContractVersion: 2 })).toThrow();
      }
      for (const dark_request of [undefined, true, null, "false"]) {
        expect(() => authorizeXWebMutationRequest(operationId, bound({ ...current, dark_request }))).toThrow("dark_request");
      }
    }
  });

  test("quote3 binds a handle-form attachment to exact observed parent context while historical quote stays separate", () => {
    const resolved = descriptor("CreateTweet");
    const target = { postId: "9876543210123456789", authorUsername: "quoted_author" };
    const bound = (attachment_url: string) => ({ method: "POST" as const, url: graphqlUrl(resolved), descriptor: resolved,
      body: { variables: { tweet_text: "Exact quote", dark_request: false,
        media: { media_entities: [], possibly_sensitive: false }, semantic_annotation_ids: [], attachment_url },
      features: Object.fromEntries(resolved.metadata.featureSwitches.map(name => [name, false])),
      ...(resolved.metadata.fieldToggles.length === 0 ? {} : { fieldToggles: Object.fromEntries(resolved.metadata.fieldToggles.map(name => [name, false])) }),
      queryId: resolved.queryId } });
    const current = { postsQuoteContractVersion: 3 as const, postsQuoteTarget: target };
    const handleUrl = `https://x.com/${target.authorUsername}/status/${target.postId}`;
    const historicalUrl = `https://x.com/i/status/${target.postId}`;
    expect(authorizeXWebMutationRequest("posts.quote", bound(historicalUrl))).toMatchObject({ operationName: "CreateTweet" });
    expect(() => authorizeXWebMutationRequest("posts.quote", bound(handleUrl))).toThrow("exact X post");
    expect(authorizeXWebMutationRequest("posts.quote", bound(handleUrl), current)).toMatchObject({ operationName: "CreateTweet" });
    expect(() => authorizeXWebMutationRequest("posts.quote", bound(historicalUrl), current)).toThrow("observed parent and author");
    for (const url of [handleUrl + "?x=1", handleUrl + "#x", handleUrl + "/", handleUrl.replace("https:", "http:"),
      handleUrl.replace("x.com", "owner@x.com"), handleUrl.replace("x.com", "x.com.example.test"),
      handleUrl.replace(target.postId, "123"), handleUrl.replace(target.authorUsername, "other_author")]) {
      expect(() => authorizeXWebMutationRequest("posts.quote", bound(url), current)).toThrow("observed parent and author");
    }
    for (const authorUsername of ["", "a".repeat(16), "invalid/handle", "invalid?x", "invalid@handle", "invalid\nhandle"]) {
      expect(() => authorizeXWebMutationRequest("posts.quote", bound(handleUrl),
        { ...current, postsQuoteTarget: { ...target, authorUsername } })).toThrow("bounded author handle");
    }
    for (const postId of ["", "a", "1".repeat(20), "123&other=456"]) {
      expect(() => authorizeXWebMutationRequest("posts.quote", bound(handleUrl),
        { ...current, postsQuoteTarget: { ...target, postId } })).toThrow();
    }
    for (const options of [{ postsQuoteContractVersion: 3 }, { postsQuoteTarget: target },
      { postsQuoteContractVersion: 2, postsQuoteTarget: target }]) {
      expect(() => authorizeXWebMutationRequest("posts.quote", bound(handleUrl),
        options as Parameters<typeof authorizeXWebMutationRequest>[2])).toThrow("exact version and observed parent context");
    }
    for (const operation of ["posts.publish", "replies.create", "threads.publish"] as const) {
      expect(() => authorizeXWebMutationRequest(operation, bound(handleUrl), current)).toThrow("exact version and observed parent context");
    }
    const id = fc.bigInt({ min: 1n, max: 9_999_999_999_999_999_999n }).map(String);
    const handle = fc.array(fc.constantFrom(...Array.from("abcdefghijklmnopqrstuvwxyz0123456789_")), { minLength: 1, maxLength: 15 }).map(value => value.join(""));
    assertProperty(fc.property(id, handle, (postId, authorUsername) => {
      const options = { postsQuoteContractVersion: 3 as const, postsQuoteTarget: { postId, authorUsername } };
      const url = `https://x.com/${authorUsername}/status/${postId}`;
      expect(authorizeXWebMutationRequest("posts.quote", bound(url), options)).toMatchObject({ operationName: "CreateTweet" });
      expect(() => authorizeXWebMutationRequest("posts.quote", bound(url + "0"), options)).toThrow("observed parent and author");
    }));
  });

  test("authorizes one exact posts.publish media entity and rejects media on other CreateTweet routes", () => {
    const resolved = descriptor("CreateTweet");
    const features = Object.fromEntries(resolved.metadata.featureSwitches.map((name) => [name, false]));
    const fieldToggles = Object.fromEntries(resolved.metadata.fieldToggles.map((name) => [name, false]));
    const body = (mediaEntities: readonly unknown[]) => ({
      variables: {
        tweet_text: "Exact post",
        dark_request: false,
        media: { media_entities: mediaEntities, possibly_sensitive: false },
        semantic_annotation_ids: [],
      },
      features,
      ...(resolved.metadata.fieldToggles.length === 0 ? {} : { fieldToggles }),
      queryId: resolved.queryId,
    });
    expect(authorizeXWebMutationRequest("posts.publish", {
      method: "POST",
      url: graphqlUrl(resolved),
      descriptor: resolved,
      body: body([{ media_id: "12345", tagged_users: [] }]),
    })).toMatchObject({ operationName: "CreateTweet" });
    expect(() => authorizeXWebMutationRequest("posts.publish", {
      method: "POST",
      url: graphqlUrl(resolved),
      descriptor: resolved,
      body: body([
        { media_id: "12345", tagged_users: [] },
        { media_id: "67890", tagged_users: [] },
      ]),
    })).toThrow("at most one");
    expect(() => authorizeXWebMutationRequest("threads.publish", {
      method: "POST",
      url: graphqlUrl(resolved),
      descriptor: resolved,
      body: body([{ media_id: "12345", tagged_users: [] }]),
    })).toThrow("text-only");
    const bound = (ids: readonly string[]) => ({ method: "POST" as const, url: graphqlUrl(resolved), descriptor: resolved,
      body: body(ids.map(media_id => ({ media_id, tagged_users: [] }))) });
    for (const postsPublishContractVersion of [6, 7] as const) {
      expect(authorizeXWebMutationRequest("posts.publish", bound(["12345", "12346", "12347", "12348"]),
        { postsPublishContractVersion })).toMatchObject({ operationName: "CreateTweet" });
      expect(() => authorizeXWebMutationRequest("posts.publish", bound(["12345", "12346", "12347", "12348", "12349"]),
        { postsPublishContractVersion })).toThrow("at most four");
      expect(() => authorizeXWebMutationRequest("posts.publish", bound(["12345", "12345"]),
        { postsPublishContractVersion })).toThrow("unique");
    }
  });

  test("rejects CreateTweet AI or content-disclosure fields and nonempty annotations", () => {
    const resolved = descriptor("CreateTweet");
    const features = Object.fromEntries(resolved.metadata.featureSwitches.map((name) => [name, false]));
    const fieldToggles = Object.fromEntries(resolved.metadata.fieldToggles.map((name) => [name, false]));
    const body = (variables: Readonly<Record<string, unknown>>) => ({
      variables: {
        tweet_text: "Exact post",
        dark_request: false,
        media: { media_entities: [], possibly_sensitive: false },
        semantic_annotation_ids: [],
        ...variables,
      },
      features,
      ...(resolved.metadata.fieldToggles.length === 0 ? {} : { fieldToggles }),
      queryId: resolved.queryId,
    });
    const request = (variables: Readonly<Record<string, unknown>>) =>
      authorizeXWebMutationRequest("posts.publish", {
        method: "POST",
        url: graphqlUrl(resolved),
        descriptor: resolved,
        body: body(variables),
      });
    expect(() => request({ made_with_ai: false })).toThrow(
      "made_with_ai is outside the reviewed CreateTweet contract",
    );
    expect(() => request({ content_disclosure: false })).toThrow(
      "content_disclosure is outside the reviewed CreateTweet contract",
    );
    expect(() => request({ ai_generated_disclosure: false })).toThrow(
      "ai_generated_disclosure is outside the reviewed CreateTweet contract",
    );
    expect(() => request({ semantic_annotation_ids: ["ai-label"] })).toThrow(
      "semantic annotations are outside the reviewed contract",
    );
  });

  test("authorizes CreateTweet tweet_text up to the reviewed long-post bound and rejects overflow", () => {
    const resolved = descriptor("CreateTweet");
    const features = Object.fromEntries(resolved.metadata.featureSwitches.map((name) => [name, false]));
    const fieldToggles = Object.fromEntries(resolved.metadata.fieldToggles.map((name) => [name, false]));
    const body = (tweetText: string) => ({
      variables: {
        tweet_text: tweetText,
        dark_request: false,
        media: { media_entities: [], possibly_sensitive: false },
        semantic_annotation_ids: [],
      },
      features,
      ...(resolved.metadata.fieldToggles.length === 0 ? {} : { fieldToggles }),
      queryId: resolved.queryId,
    });
    const authorize = (tweetText: string) => authorizeXWebMutationRequest("posts.publish", {
      method: "POST",
      url: graphqlUrl(resolved),
      descriptor: resolved,
      body: body(tweetText),
    });
    expect(authorize("A".repeat(1158))).toMatchObject({ operationName: "CreateTweet" });
    expect(authorize("B".repeat(MAX_X_CREATE_TWEET_TEXT_LENGTH))).toMatchObject({
      operationName: "CreateTweet",
    });
    expect(() => authorize("C".repeat(MAX_X_CREATE_TWEET_TEXT_LENGTH + 1))).toThrow(
      "X CreateTweet text must be bounded and contain no NUL or carriage return",
    );
  });

  test("authorizes exact native Article links, styles, and inline MEDIA entities", () => {
    const contentState = {
      blocks: [
        {
          data: {},
          text: "Hraness",
          key: "00000",
          type: "unstyled",
          entity_ranges: [{ key: 0, offset: 0, length: 7 }],
          inline_style_ranges: [{ length: 7, offset: 0, style: "Bold" }],
        },
        {
          data: {},
          text: " ",
          key: "00001",
          type: "atomic",
          entity_ranges: [{ key: 1, offset: 0, length: 1 }],
          inline_style_ranges: [],
        },
      ],
      entity_map: [
        {
          key: "0",
          value: {
            data: { url: "https://hraness.com/" },
            type: "LINK",
            mutability: "Mutable",
          },
        },
        {
          key: "1",
          value: {
            data: {
              caption: "Puerto Rico",
              entity_key: "1",
              media_items: [{
                local_media_id: 1,
                media_category: "DraftTweetImage",
                media_id: "700000000000000002",
              }],
            },
            type: "MEDIA",
            mutability: "Immutable",
          },
        },
      ],
    };
    const cases = [
      ["articles.create", "ArticleEntityDraftCreate", { content_state: contentState, title: "Private draft" }],
      ["articles.title", "ArticleEntityUpdateTitle", { articleEntityId: "700000000000000001", title: "Private draft" }],
      ["articles.content", "ArticleEntityUpdateContent", { content_state: contentState, article_entity: "700000000000000001" }],
    ] as const;
    for (const [operationId, operationName, variables] of cases) {
      const resolved = descriptor(operationName);
      const features = Object.fromEntries(resolved.metadata.featureSwitches.map((name) => [name, false]));
      const fieldToggles = Object.fromEntries(resolved.metadata.fieldToggles.map((name) => [name, false]));
      expect(authorizeXWebMutationRequest(operationId, {
        method: "POST",
        url: graphqlUrl(resolved),
        descriptor: resolved,
        body: {
          variables,
          features,
          ...(resolved.metadata.fieldToggles.length === 0 ? {} : { fieldToggles }),
          queryId: resolved.queryId,
        },
      })).toMatchObject({ operationName, method: "POST" });
    }

    const create = descriptor("ArticleEntityDraftCreate");
    const createFeatures = Object.fromEntries(create.metadata.featureSwitches.map((name) => [name, false]));
    const createToggles = Object.fromEntries(create.metadata.fieldToggles.map((name) => [name, false]));
    for (const invalidState of [
      { ...contentState, blocks: [{ ...contentState.blocks[0], key: "" }] },
      { ...contentState, entity_map: [{ ...contentState.entity_map[0], key: "1" }] },
      {
        ...contentState,
        entity_map: [{
          key: "0",
          value: {
            data: {
              entity_key: "0",
              media_items: [{ local_media_id: 1, media_category: "tweet_image", media_id: "2" }],
            },
            type: "MEDIA",
            mutability: "Immutable",
          },
        }],
      },
      {
        ...contentState,
        blocks: [contentState.blocks[0], {
          ...contentState.blocks[1],
          text: "not-atomic",
        }],
      },
    ]) {
      expect(() => authorizeXWebMutationRequest("articles.create", {
        method: "POST",
        url: graphqlUrl(create),
        descriptor: create,
        body: {
          variables: { content_state: invalidState, title: "Private draft" },
          features: createFeatures,
          ...(create.metadata.fieldToggles.length === 0 ? {} : { fieldToggles: createToggles }),
          queryId: create.queryId,
        },
      })).toThrow();
    }
  });

  test("rejects origin, credential, fragment, path, and method confusion", () => {
    const resolved = descriptor("HomeTimeline");
    const exactPath = buildXWebGraphQlPath(resolved);
    const cases: readonly { readonly url: string; readonly method: string; readonly message: string }[] = [
      { url: `http://x.com${exactPath}`, method: "GET", message: "exact https://x.com origin" },
      { url: `https://api.x.com${exactPath}`, method: "GET", message: "exact https://x.com origin" },
      { url: `https://user:pass@x.com${exactPath}`, method: "GET", message: "exact https://x.com origin" },
      { url: `https://x.com${exactPath}#fragment`, method: "GET", message: "fragment" },
      { url: `https://x.com/i/api/graphql/WrongQueryId123/${resolved.operationName}`, method: "GET", message: "did not bind" },
      { url: `https://x.com/i/api/graphql/${resolved.queryId}/WrongOperation`, method: "GET", message: "did not bind" },
      { url: graphqlUrl(resolved), method: "DELETE", message: "GET or POST" },
    ];
    for (const candidate of cases) {
      expect(() => assertExactXWebGraphQlBinding({
        url: candidate.url,
        method: candidate.method,
        descriptor: resolved,
      })).toThrow(candidate.message);
    }
  });

  test("rejects URL and body identity disagreement", () => {
    const resolved = descriptor("SearchTimeline");
    const failures: readonly { readonly url: string; readonly body?: unknown; readonly message: string }[] = [
      { url: graphqlUrl(resolved, "?queryId=WrongQueryId123"), message: "URL queryId" },
      { url: graphqlUrl(resolved, "?operationName=HomeTimeline"), message: "URL operationName" },
      { url: graphqlUrl(resolved, "?variables=%7B%7D&variables=%7B%7D"), message: "repeated parameter" },
      { url: graphqlUrl(resolved, "?unsafe=true"), message: "unsupported parameter" },
      { url: graphqlUrl(resolved), body: { queryId: "WrongQueryId123" }, message: "body queryId" },
      { url: graphqlUrl(resolved), body: { operationName: "HomeTimeline" }, message: "body operationName" },
      { url: graphqlUrl(resolved), body: { operationType: "mutation" }, message: "body operationType" },
      { url: graphqlUrl(resolved), body: "not-json", message: "valid JSON" },
      { url: graphqlUrl(resolved), body: [], message: "must be an object" },
    ];
    for (const candidate of failures) {
      expect(() => assertExactXWebGraphQlBinding({
        url: candidate.url,
        method: candidate.body === undefined ? "GET" : "POST",
        descriptor: resolved,
        ...(candidate.body === undefined ? {} : { body: candidate.body }),
      })).toThrow(candidate.message);
    }
  });

  test("rejects a GET body and a descriptor that does not match the semantic operation", () => {
    const home = descriptor("HomeTimeline");
    expect(() => assertExactXWebGraphQlBinding({
      method: "GET",
      url: graphqlUrl(home),
      descriptor: home,
      body: {},
    })).toThrow("GET may not contain a body");
    const search = descriptor("SearchTimeline");
    expect(() => authorizeXWebR1GraphQlRequest("feeds.for-you", {
      method: "GET",
      url: graphqlUrl(search),
      descriptor: search,
    })).toThrow("did not bind its reviewed");
  });

  test("extracts the reviewed response root and feeds it into URT normalization", () => {
    const response = {
      data: {
        home: {
          home_timeline_urt: timeline(
            timelineItemEntry("tweet-1", { __typename: "Tweet", rest_id: "800" }),
            cursorEntry("cursor-bottom", "Bottom", "next-home-page"),
          ),
        },
      },
      errors: [],
    };
    expect(extractXWebGraphQlReadResponseRoot("feeds.for-you", response)).toEqual(
      (response.data.home.home_timeline_urt),
    );
    const normalized = normalizeXWebGraphQlTimelineResponse("feeds.for-you", response);
    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]).toMatchObject({ kind: "tweet", tweetId: "800" });
    expect(normalized.cursors.bottom?.value).toBe("next-home-page");
  });

  test("rejects provider errors, malformed errors, missing roots, and non-timeline operations", () => {
    expect(() => extractXWebGraphQlReadResponseRoot("feeds.for-you", {
      data: { home: { home_timeline_urt: { instructions: [] } } },
      errors: [{ message: "partial failure" }],
    })).toThrow("provider errors");
    expect(() => extractXWebGraphQlReadResponseRoot("feeds.for-you", {
      data: { home: { home_timeline_urt: { instructions: [] } } },
      errors: {},
    })).toThrow("errors must be an array");
    expect(() => extractXWebGraphQlReadResponseRoot("feeds.for-you", {
      data: { home: {} },
    })).toThrow("omitted reviewed root");
    expect(() => extractXWebGraphQlReadResponseRoot("likes.set", { data: {} })).toThrow(
      "not an X GraphQL read response contract",
    );
    expect(() => normalizeXWebGraphQlTimelineResponse("posts.by-id", {
      data: { tweetResult: { result: {} } },
    })).toThrow("not an X URT timeline response contract");
  });
});

describe("X exact profile projection", () => {
  const response = (overrides: Readonly<Record<string, unknown>> = {}) => ({
    data: {
      user: {
        result: {
          __typename: "User",
          rest_id: "123456789",
          core: { name: "Hraness", screen_name: "Hraness" },
          legacy: {
            screen_name: "hraness",
            description: "Public bio",
            followers_count: 1234,
            friends_count: 56,
            entities: {
              url: {
                urls: [{ expanded_url: "https://hraness.com" }],
              },
            },
          },
          ...overrides,
        },
      },
    },
  });

  test("normalizes handles and projects exact target-bound follower metrics", () => {
    expect(normalizeXWebProfileHandle("Hra_ness1")).toBe("hra_ness1");
    expect(() => normalizeXWebProfileHandle("https://x.com/hraness"))
      .toThrow("1-15 letters, digits, or underscores");
    expect(projectXWebProfileStats(
      response(),
      "hraness",
      "2026-08-21T15:00:00.000Z",
    )).toEqual({
      schemaVersion: 1,
      provider: "x",
      target: {
        kind: "profile",
        id: "123456789",
        url: "https://x.com/hraness",
      },
      observedAt: "2026-08-21T15:00:00.000Z",
      completeness: "complete",
      metrics: {
        followers: { status: "available", value: 1234, precision: "exact", unit: "count" },
        following: { status: "available", value: 56, precision: "exact", unit: "count" },
      },
      metadata: {
        handle: "hraness",
        displayName: "Hraness",
        bio: "Public bio",
        websiteUrl: "https://hraness.com/",
      },
      profile: {
        modelVersion: 1, id: "123456789", handle: "hraness", displayName: "Hraness",
        bio: "Public bio", bioContent: { text: "Public bio", source: "profile", offsetEncoding: "utf16", entities: { status: "unknown", mentions: [], hashtags: [], cashtags: [], links: [] } }, websiteUrl: "https://hraness.com/", joinedAt: null, location: null,
        verification: { verified: null, blueVerified: null, type: null },
        counts: { followers: 1234, following: 56 }, relationship: { following: null, followedBy: null },
        url: "https://x.com/hraness",
      },
    });
  });

  test("projects the current relationship-count profile shape without rounding", () => {
    const modern = response({
      legacy: undefined,
      relationship_counts: { followers: 2345, following: 67 },
      profile_bio: { description: "Current public bio\nwith another line", entities: {} },
      website: { url: "https://hraness.com/about" },
    });
    expect(projectXWebProfileStats(
      modern,
      "hraness",
      "2026-08-21T15:00:00.000Z",
    )).toMatchObject({
      metrics: {
        followers: { status: "available", value: 2345, precision: "exact", unit: "count" },
        following: { status: "available", value: 67, precision: "exact", unit: "count" },
      },
      metadata: {
        bio: "Current public bio\nwith another line",
        websiteUrl: "https://hraness.com/about",
      },
    });
    expect(() => projectXWebProfileStats(
      response({
        legacy: undefined,
        relationship_counts: { followers: "2.3K", following: 67 },
        profile_bio: { description: "Current public bio", entities: {} },
        website: null,
      }),
      "hraness",
      "2026-08-21T15:00:00.000Z",
    )).toThrow("exact nonnegative safe integer");
  });

  test("rejects switched targets, unavailable users, and rounded counts", () => {
    expect(() => projectXWebProfileStats(
      response({ core: { name: "Other", screen_name: "other" } }),
      "hraness",
      "2026-08-21T15:00:00.000Z",
    )).toThrow("did not bind the requested handle");
    expect(() => projectXWebProfileStats(
      response({ __typename: "UserUnavailable" }),
      "hraness",
      "2026-08-21T15:00:00.000Z",
    )).toThrow("X profile target is unavailable");
    expect(() => projectXWebProfileStats(
      response({
        legacy: {
          screen_name: "hraness",
          description: "Public bio",
          followers_count: "1.2K",
          friends_count: 56,
        },
      }),
      "hraness",
      "2026-08-21T15:00:00.000Z",
    )).toThrow("exact nonnegative safe integer");
  });

  test("omits unusable website metadata consistently in legacy and modern profile statistics", () => {
    for (const url of ["", "not a URL", "file:///tmp/private", "http://localhost/", "https://user:password@example.com/"]) {
      for (const raw of [
        response({ legacy: { screen_name: "hraness", followers_count: 1234, friends_count: 56, entities: { url: { urls: [{ expanded_url: url }] } } } }),
        response({ legacy: undefined, relationship_counts: { followers: 1234, following: 56 }, website: { url } }),
      ]) {
        const result = projectXWebProfileStats(raw, "hraness", "2026-08-21T15:00:00.000Z");
        expect(result.metadata.websiteUrl).toBeNull();
        expect(result.profile.websiteUrl).toBeNull();
        expect(result.metrics.followers.value).toBe(1234);
      }
    }
    const result = projectXWebProfileStats(response({
      website: { url: "https://example.com/" },
      legacy: { screen_name: "hraness", followers_count: 1234, friends_count: 56, entities: { url: { urls: [{ expanded_url: "not a URL" }] } } },
    }), "hraness", "2026-08-21T15:00:00.000Z");
    expect(result.metadata.websiteUrl).toBe("https://example.com/");
    expect(result.profile.websiteUrl).toBe(result.metadata.websiteUrl);
    expect(() => projectXWebProfileStats(response({ website: { url: "https://different.example/" } }), "hraness", "2026-08-21T15:00:00.000Z")).toThrow("disagreed");
  });

  test("retains the profile-statistics website shape and 2048-character bounds", () => {
    for (const url of [{}, 42, "x".repeat(2_049), "https://example.com/\n"]) {
      for (const raw of [
        response({ legacy: { screen_name: "hraness", followers_count: 1234, friends_count: 56, entities: { url: { urls: [{ expanded_url: url }] } } } }),
        response({ legacy: undefined, relationship_counts: { followers: 1234, following: 56 }, website: { url } }),
      ]) expect(() => projectXWebProfileStats(raw, "hraness", "2026-08-21T15:00:00.000Z")).toThrow("bounded public text");
    }
  });

  test("an unusable optional website on a user row does not poison a mixed feed", () => {
    const normalized = normalizeXWebUrtTimeline({ instructions: [{ type: "TimelineAddEntries", entries: [
      { entryId: "user-fixture", content: { entryType: "TimelineTimelineItem", itemContent: {
        itemType: "TimelineUser", user_results: { result: { __typename: "User", rest_id: "42",
          core: { screen_name: "fixture", name: "Fixture" }, website: { url: "not a URL" } } },
      } } },
      { entryId: "post-fixture", content: { entryType: "TimelineTimelineItem", itemContent: {
        itemType: "TimelineTweet", tweet_results: { result: { __typename: "Tweet", rest_id: "77", legacy: { full_text: "Synthetic feed post", user_id_str: "42" } } },
      } } },
    ] }] });
    expect(normalized.items).toHaveLength(2);
    expect(normalized.items[0]).toMatchObject({ kind: "user", userId: "42", profile: { websiteUrl: null } });
    expect(normalized.items[1]).toMatchObject({ kind: "tweet", tweetId: "77", social: { text: "Synthetic feed post" } });
  });
});

describe("legacy DM R1 allowlists and inbox mapping", () => {
  test("maps all three visible inbox classes without conflating their cursors", () => {
    expect(resolveXWebLegacyDmInbox("primary")).toEqual(xWebLegacyDmInboxMapping.primary);
    expect(resolveXWebLegacyDmInbox("requests")).toEqual(xWebLegacyDmInboxMapping.requests);
    expect(resolveXWebLegacyDmInbox("additional")).toEqual(xWebLegacyDmInboxMapping.additional);
    expect(xWebLegacyDmInboxMapping.primary.providerClass).toBe("PRIMARY");
    expect(xWebLegacyDmInboxMapping.requests.providerClass).toBe("SECONDARY");
    expect(xWebLegacyDmInboxMapping.additional.providerClass).toBe("TERTIARY");
    expect(new Set(Object.values(xWebLegacyDmInboxMapping).map((item) => item.cursorSelector)).size).toBe(3);
    expect(xWebLegacyDmInboxMapping.primary.uiMayUpdateLastSeen).toBe(true);
    expect(xWebLegacyDmInboxMapping.requests.uiMayUpdateLastSeen).toBe(true);
    expect(xWebLegacyDmInboxMapping.additional.uiMayUpdateLastSeen).toBe(false);
    expect(() => resolveXWebLegacyDmInbox("all")).toThrow("primary, requests, or additional");
  });

  test("allows only the category's exact one-shot GET endpoint", () => {
    const cases = [
      ["primary", "/i/api/1.1/dm/inbox_initial_state.json"],
      ["primary", "/i/api/1.1/dm/inbox_timeline/trusted.json"],
      ["requests", "/i/api/1.1/dm/inbox_timeline/untrusted.json"],
      ["additional", "/i/api/1.1/dm/inbox_timeline/untrusted_low_quality.json"],
    ] as const;
    for (const [surface, path] of cases) {
      const result = authorizeXWebLegacyDmR1Read({
        surface,
        method: "get",
        url: `https://x.com${path}?count=20&cursor=opaque&include_quality=all&filter_low_quality=true`,
        polling: false,
      });
      expect(result).toEqual({
        surface,
        method: "GET",
        path,
        conversationId: null,
        queryParameterNames: ["count", "cursor", "filter_low_quality", "include_quality"],
      });
    }
  });

  test("allows a bounded exact conversation read and binds its ID", () => {
    expect(authorizeXWebLegacyDmR1Read({
      surface: "conversation",
      method: "GET",
      url: "https://x.com/i/api/1.1/dm/conversation/123456789-987654321.json?max_id=55&count=20",
    })).toEqual({
      surface: "conversation",
      method: "GET",
      path: "/i/api/1.1/dm/conversation/123456789-987654321.json",
      conversationId: "123456789-987654321",
      queryParameterNames: ["count", "max_id"],
    });
  });

  test("rejects cross-inbox and conversation endpoint confusion", () => {
    const cases = [
      { surface: "requests", path: "/i/api/1.1/dm/inbox_timeline/trusted.json" },
      { surface: "additional", path: "/i/api/1.1/dm/inbox_timeline/untrusted.json" },
      { surface: "primary", path: "/i/api/1.1/dm/conversation/1-2.json" },
      { surface: "conversation", path: "/i/api/1.1/dm/inbox_timeline/trusted.json" },
    ] as const;
    for (const candidate of cases) {
      expect(() => authorizeXWebLegacyDmR1Read({
        surface: candidate.surface,
        method: "GET",
        url: `https://x.com${candidate.path}`,
      })).toThrow();
    }
  });

  test("forbids mark-read, last-seen, accept, send, delete, and update-poll routes", () => {
    const paths = [
      "/i/api/1.1/dm/conversation/1-2/mark_read.json",
      "/i/api/1.1/dm/conversation/1-2/accept.json",
      "/i/api/1.1/dm/new2.json",
      "/i/api/1.1/dm/conversation/1-2/delete.json",
      "/i/api/1.1/dm/user_updates.json",
      "/i/api/1.1/dm/last_seen_event.json",
    ];
    for (const path of paths) {
      expect(() => authorizeXWebLegacyDmR1Read({
        surface: "conversation",
        method: "GET",
        url: `https://x.com${path}`,
      })).toThrow("forbid");
    }
  });

  test("forbids polling and every non-GET method", () => {
    expect(() => authorizeXWebLegacyDmR1Read({
      surface: "primary",
      method: "GET",
      url: "https://x.com/i/api/1.1/dm/inbox_timeline/trusted.json",
      polling: true,
    })).toThrow("may not enable polling");
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
      expect(() => authorizeXWebLegacyDmR1Read({
        surface: "primary",
        method,
        url: "https://x.com/i/api/1.1/dm/inbox_timeline/trusted.json",
      })).toThrow("require GET");
    }
  });

  test("forbids action parameters, unknown parameters, duplicates, and invalid values", () => {
    const queries = [
      "?mark_read=true",
      "?MARK_READ=true",
      "?last_seen_event_id=55",
      "?accept=true",
      "?watch=true",
      "?unreviewed=true",
      "?count=1&count=2",
      `?cursor=${encodeURIComponent("bad\nvalue")}`,
    ];
    for (const query of queries) {
      expect(() => authorizeXWebLegacyDmR1Read({
        surface: "primary",
        method: "GET",
        url: `https://x.com/i/api/1.1/dm/inbox_timeline/trusted.json${query}`,
      })).toThrow();
    }
  });

  test("rejects alternate origins, fragments, and malformed conversation IDs", () => {
    for (const url of [
      "http://x.com/i/api/1.1/dm/conversation/1-2.json",
      "https://api.x.com/i/api/1.1/dm/conversation/1-2.json",
      "https://x.com/i/api/1.1/dm/conversation/1-2.json#fragment",
      "https://x.com/i/api/1.1/dm/conversation/1-1.json",
      "https://x.com/i/api/1.1/dm/conversation/not-an-id.json",
      "https://x.com/i/api/1.1/dm/conversation/1%2F2.json",
    ]) {
      expect(() => authorizeXWebLegacyDmR1Read({
        surface: "conversation",
        method: "GET",
        url,
      })).toThrow();
    }
  });
});

describe("URT timeline normalization and cursor extraction", () => {
  test("normalizes direct/wrapped/preview tweets, modules, tombstones, and cursors", () => {
    const fixture = {
      instructions: [
        {
          type: "TimelineAddEntries",
          entries: [
            timelineItemEntry("tweet-1", { __typename: "Tweet", rest_id: "101", legacy: { full_text: "one" } }, { sortIndex: "500" }),
            timelineItemEntry("tweet-2", { __typename: "TweetWithVisibilityResults", tweet: { rest_id: "102", legacy: { full_text: "two" } } }, { sortIndex: "400" }),
            timelineItemEntry("tweet-3", { __typename: "TweetPreviewDisplay", tweet_results: { result: { rest_id: "103", legacy: { full_text: "three" } } } }, { sortIndex: "300" }),
            timelineItemEntry("unavailable-1", { __typename: "TweetUnavailable", reason: "Protected" }),
            timelineItemEntry("user-1", {}, { itemType: "TimelineUser" }),
            {
              entryId: "module-1",
              sortIndex: "200",
              content: {
                entryType: "TimelineTimelineModule",
                items: [
                  {
                    entryId: "module-tweet-4",
                    item: {
                      itemContent: {
                        itemType: "TimelineTweet",
                        tweet_results: { result: { __typename: "Tweet", rest_id: "104", legacy: { full_text: "four" } } },
                      },
                    },
                  },
                ],
              },
            },
            cursorEntry("cursor-top", "Top", "top-token"),
            cursorEntry("cursor-bottom", "Bottom", "bottom-token"),
            cursorEntry("cursor-gap", "Gap", "gap-token"),
          ],
        },
        { type: "TimelineTerminateTimeline", direction: "Bottom" },
      ],
    };

    const normalized = normalizeXWebUrtTimeline(fixture);
    expect(normalized.items.map((item) => item.kind)).toEqual([
      "tweet",
      "tweet",
      "tweet",
      "unavailable",
      "unavailable",
      "tweet",
    ]);
    expect(normalized.items.filter((item) => item.kind === "tweet").map((item) => item.tweetId)).toEqual([
      "101",
      "102",
      "103",
      "104",
    ]);
    expect(normalized.items[3]).toMatchObject({ kind: "unavailable", typename: "TweetUnavailable", reason: "Protected" });
    expect(normalized.items[4]).toMatchObject({ kind: "unavailable", typename: "MissingUserResult" });
    expect(normalized.items[5]).toMatchObject({ moduleEntryId: "module-1", entryId: "module-tweet-4" });
    expect(normalized.cursors.top?.value).toBe("top-token");
    expect(normalized.cursors.bottom?.value).toBe("bottom-token");
    expect(normalized.cursors.other).toEqual([{ entryId: "cursor-gap", cursorType: "Gap", value: "gap-token" }]);
    expect(normalized.terminatedDirections).toEqual(["Bottom"]);
    expect(extractXWebUrtBottomCursor(fixture)).toBe("bottom-token");
  });

  test("applies add, replace, pin, remove, and terminate instructions in order", () => {
    const fixture = {
      instructions: [
        {
          type: "TimelineAddEntries",
          entries: [
            timelineItemEntry("tweet-old", { __typename: "Tweet", rest_id: "10" }),
            cursorEntry("cursor-bottom-old", "Bottom", "old"),
          ],
        },
        {
          type: "TimelineReplaceEntry",
          entryIdToReplace: "cursor-bottom-old",
          entry: cursorEntry("cursor-bottom-new", "Bottom", "new"),
        },
        {
          type: "TimelinePinEntry",
          entry: timelineItemEntry("tweet-pinned", { __typename: "Tweet", rest_id: "11" }),
        },
        { type: "TimelineRemoveEntries", entryIds: ["tweet-old"] },
        { type: "TimelineTerminateTimeline", direction: "Top" },
      ],
    };
    const normalized = normalizeXWebUrtTimeline(fixture);
    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]).toMatchObject({ kind: "tweet", tweetId: "11" });
    expect(normalized.cursors.bottom?.value).toBe("new");
    expect(normalized.terminatedDirections).toEqual(["Top"]);
    expect(normalized.finalEntryCount).toBe(2);
  });

  test("clear-cache removes prior entries before accepting replacements", () => {
    const fixture = {
      instructions: [
        { type: "TimelineAddEntries", entries: [timelineItemEntry("tweet-old", { __typename: "Tweet", rest_id: "10" })] },
        { type: "TimelineClearCache" },
        { type: "TimelineAddEntries", entries: [timelineItemEntry("tweet-new", { __typename: "Tweet", rest_id: "12" })] },
      ],
    };
    expect(normalizeXWebUrtTimeline(fixture).items).toEqual([
      expect.objectContaining({ kind: "tweet", tweetId: "12" }),
    ]);
  });

  test("deduplicates tweet IDs without discarding cursor evolution", () => {
    const fixture = timeline(
      timelineItemEntry("tweet-1", { __typename: "Tweet", rest_id: "20" }),
      timelineItemEntry("tweet-duplicate", { __typename: "Tweet", rest_id: "20" }),
      cursorEntry("cursor-bottom", "Bottom", "next-page"),
    );
    const normalized = normalizeXWebUrtTimeline(fixture);
    expect(normalized.items).toHaveLength(1);
    expect(normalized.duplicateTweetIds).toEqual(["20"]);
    expect(normalized.cursors.bottom?.value).toBe("next-page");
    expect(normalized.finalEntryCount).toBe(3);
  });

  test("returns null when there is no bottom cursor", () => {
    expect(extractXWebUrtBottomCursor(timeline(
      timelineItemEntry("tweet-1", { __typename: "Tweet", rest_id: "21" }),
    ))).toBeNull();
  });

  test("preserves first-party null and omitted tweet results as unavailable rows", () => {
    const normalized = normalizeXWebUrtTimeline(timeline(
      timelineItemEntry("tweet-null", null),
      {
        entryId: "tweet-omitted",
        sortIndex: "99",
        content: {
          entryType: "TimelineTimelineItem",
          itemContent: { itemType: "TimelineTweet", tweet_results: {} },
        },
      },
    ));
    expect(normalized.items).toEqual([
      expect.objectContaining({ kind: "unavailable", entryId: "tweet-null", typename: "MissingTweetResult" }),
      expect.objectContaining({ kind: "unavailable", entryId: "tweet-omitted", typename: "MissingTweetResult" }),
    ]);
  });

  test("rejects ambiguous directional cursors instead of guessing", () => {
    expect(() => normalizeXWebUrtTimeline(timeline(
      cursorEntry("cursor-bottom-1", "Bottom", "one"),
      cursorEntry("cursor-bottom-2", "Bottom", "two"),
    ))).toThrow("ambiguous bottom cursors");
    expect(() => normalizeXWebUrtTimeline(timeline(
      cursorEntry("cursor-top-1", "Top", "same"),
      cursorEntry("cursor-top-2", "Top", "same"),
    ))).toThrow("ambiguous top cursors");
  });

  test("rejects unknown instruction and entry types as contract drift", () => {
    expect(() => normalizeXWebUrtTimeline({ instructions: [{ type: "TimelineSurprise" }] })).toThrow("not reviewed");
    expect(() => normalizeXWebUrtTimeline(timeline({
      entryId: "unknown-entry",
      content: { entryType: "TimelineUnknown" },
    }))).toThrow("entry type TimelineUnknown is not reviewed");
  });

  test("rejects malformed instruction, entry, module, result, ID, and cursor shapes", () => {
    const cases: readonly unknown[] = [
      null,
      {},
      { instructions: {} },
      { instructions: [null] },
      { instructions: [{ type: "TimelineAddEntries", entries: {} }] },
      timeline({ content: { entryType: "TimelineTimelineItem", itemContent: {} } }),
      timeline(timelineItemEntry("bad-tweet", { __typename: "Tweet", rest_id: "not-an-id" })),
      timeline(timelineItemEntry("primitive-result", "not-an-object")),
      timeline(timelineItemEntry("bad-wrapper", { __typename: "TweetWithVisibilityResults" })),
      timeline({ entryId: "bad-module", content: { entryType: "TimelineTimelineModule", items: {} } }),
      timeline({ entryId: "bad-cursor", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "" } }),
      { instructions: [{ type: "TimelineRemoveEntries", entryIds: [1] }] },
      { instructions: [{ type: "TimelineTerminateTimeline" }] },
    ];
    for (const candidate of cases) expect(() => normalizeXWebUrtTimeline(candidate)).toThrow();
  });
});

describe("X bookmark export projection", () => {
  const createdAt = "Tue Jul 22 12:00:00 +0000 2026";

  function tweetResult(
    id: string,
    options: {
      readonly text?: string;
      readonly createdAt?: string;
      readonly author?: { readonly id: string; readonly username: string; readonly name: string };
      readonly core?: unknown;
    } = {},
  ): unknown {
    return {
      __typename: "Tweet",
      rest_id: id,
      ...(options.core === undefined && options.author === undefined
        ? {}
        : {
            core: options.core ?? {
              user_results: {
                result: {
                  __typename: "User",
                  rest_id: options.author!.id,
                  core: {
                    name: options.author!.name,
                    screen_name: options.author!.username,
                  },
                },
              },
            },
          }),
      legacy: {
        full_text: options.text ?? `text-${id}`,
        created_at: options.createdAt ?? createdAt,
        ...(options.author === undefined ? {} : { user_id_str: options.author.id }),
      },
    };
  }

  function bookmarksResponse(...entries: readonly unknown[]): unknown {
    return {
      data: {
        bookmark_timeline_v2: {
          timeline: timeline(...entries),
        },
      },
    };
  }

  test("extracts author identity from GraphQL core.user_results and projects a stable export record", () => {
    const normalized = normalizeXWebUrtTimeline(timeline(
      timelineItemEntry("tweet-1", tweetResult("800", {
        text: "bookmarked post",
        author: { id: "42", username: "Hraness", name: "Hraness" },
      })),
    ));
    expect(normalized.items[0]).toMatchObject({
      kind: "tweet",
      tweetId: "800",
      author: { id: "42", username: "hraness", name: "Hraness" },
    });
    const post = projectXWebFeedPost(normalized.items[0]!);
    expect(post).toEqual({
      kind: "post",
      id: "800",
      text: "bookmarked post",
      createdAt,
      authorId: "42",
      authorUsername: "hraness",
      authorName: "Hraness",
      replyToPostId: null,
      liked: null,
      reposted: null,
      saved: null,
      metrics: { replies: null, reposts: null, likes: null, bookmarks: null },
      url: "https://x.com/i/status/800",
      modelVersion: 1,
      content: { text: "bookmarked post", source: "legacy", offsetEncoding: "utf16", entities: { status: "unknown", mentions: [], hashtags: [], cashtags: [], links: [] } },
      media: { status: "unknown", items: [] }, moderation: { status: "unknown", labels: [] },
      quote: { status: "unknown", postId: null, post: null }, repost: { status: "unknown", postId: null, post: null },
      promotion: { status: "unknown", source: null },
    });
    expect(projectXWebBookmarkExportRecord(post!)).toEqual({
      post_id: "800",
      url: "https://x.com/i/status/800",
      author_username: "hraness",
      author_name: "Hraness",
      text: "bookmarked post",
      created_at: createdAt,
      folder_id: null,
      bookmarked_at: null,
    });
  });

  test("keeps author fields null when the tweet omits core.user_results", () => {
    const normalized = normalizeXWebUrtTimeline(timeline(
      timelineItemEntry("tweet-1", tweetResult("801", { text: "no author nest" })),
    ));
    expect(normalized.items[0]).toMatchObject({
      kind: "tweet",
      author: { id: null, username: null, name: null },
    });
  });

  test("projects full note entities, quoted media and visibility/promotion evidence before URT fields are discarded", () => {
    const raw = {
      __typename: "TweetWithVisibilityResults",
      tweet: {
        __typename: "Tweet", rest_id: "810",
        legacy: { full_text: "truncated…", quoted_status_id_str: "809", is_quote_status: true },
        note_tweet: { note_tweet_results: { result: {
          text: "Full note @Hraness #Rust", entity_set: {
            user_mentions: [{ indices: [10, 18], screen_name: "Hraness", id_str: "42" }],
            hashtags: [{ indices: [19, 24], text: "Rust" }],
          },
        } } },
        quoted_status_result: { result: {
          __typename: "Tweet", rest_id: "809", legacy: {
            full_text: "Quoted media", extended_entities: { media: [{
              id_str: "11", type: "photo", media_url_https: "https://pbs.twimg.com/media/quoted.jpg",
            }] },
          },
        } },
      },
      tweet_interstitial: { display_type: "Sensitive", text: { text: "Sensitive content" } },
    };
    const response = bookmarksResponse({
      entryId: "tweet-810", content: { entryType: "TimelineTimelineItem", itemContent: {
        itemType: "TimelineTweet", promotedMetadata: { private_field: "not public" }, tweet_results: { result: raw },
      } },
    });
    const page = projectXWebBookmarkExportPage(response, 10);
    const post = page.posts[0]!;
    expect(post.text).toBe("Full note @Hraness #Rust");
    expect(post.content.source).toBe("note");
    expect(post.content.entities.mentions).toEqual([{ start: 10, end: 18, handle: "hraness", userId: "42" }]);
    expect(post.content.entities.hashtags).toEqual([{ start: 19, end: 24, tag: "Rust" }]);
    expect(post.quote.post?.media.items[0]?.url).toBe("https://pbs.twimg.com/media/quoted.jpg");
    expect(post.moderation.labels).toEqual([{ kind: "interstitial", source: "visibility.tweet_interstitial", text: "Sensitive content", reason: "Sensitive" }]);
    expect(post.promotion).toEqual({ status: "present", source: "promotedMetadata" });
    expect(page.items[0]!.text).toBe(post.text);
    expect(parseXWebBookmarkExportPage(JSON.parse(JSON.stringify(page)))).toEqual(page);
    expect(JSON.stringify(page)).not.toContain("private_field");
    expect(JSON.stringify(page)).not.toContain("tweet_results");
  });

  test("fails closed when author ids or handles disagree", () => {
    expect(() => normalizeXWebUrtTimeline(timeline(
      timelineItemEntry("tweet-mismatch-id", {
        __typename: "Tweet",
        rest_id: "802",
        core: {
          user_results: {
            result: {
              __typename: "User",
              rest_id: "1",
              core: { name: "A", screen_name: "alpha" },
            },
          },
        },
        legacy: { full_text: "x", user_id_str: "2" },
      }),
    ))).toThrow("author id disagreed");
    expect(() => normalizeXWebUrtTimeline(timeline(
      timelineItemEntry("tweet-mismatch-handle", {
        __typename: "Tweet",
        rest_id: "803",
        core: {
          user_results: {
            result: {
              __typename: "User",
              rest_id: "1",
              core: { name: "A", screen_name: "alpha" },
              legacy: { screen_name: "beta" },
            },
          },
        },
        legacy: { full_text: "x", user_id_str: "1" },
      }),
    ))).toThrow("author handle disagreed");
    expect(() => normalizeXWebUrtTimeline(timeline(
      timelineItemEntry("tweet-bad-handle", tweetResult("804", {
        author: { id: "1", username: "not a handle", name: "A" },
      })),
    ))).toThrow("valid X handle");
  });

  test("pages bookmarks with a next cursor and hides that cursor after truncation", () => {
    const response = bookmarksResponse(
      timelineItemEntry("tweet-1", tweetResult("11", {
        author: { id: "1", username: "one", name: "One" },
      })),
      timelineItemEntry("tweet-2", tweetResult("12", {
        author: { id: "2", username: "two", name: "Two" },
      })),
      cursorEntry("cursor-bottom", "Bottom", "next-bookmarks-page"),
    );
    const complete = projectXWebBookmarkExportPage(response, 2);
    expect(complete).toEqual({
      feed: "bookmarks",
      items: [
        {
          post_id: "11",
          url: "https://x.com/i/status/11",
          author_username: "one",
          author_name: "One",
          text: "text-11",
          created_at: createdAt,
          folder_id: null,
          bookmarked_at: null,
        },
        {
          post_id: "12",
          url: "https://x.com/i/status/12",
          author_username: "two",
          author_name: "Two",
          text: "text-12",
          created_at: createdAt,
          folder_id: null,
          bookmarked_at: null,
        },
      ],
      posts: [
        expect.objectContaining({ id: "11", authorUsername: "one" }),
        expect.objectContaining({ id: "12", authorUsername: "two" }),
      ],
      cursor: "next-bookmarks-page",
      terminatedDirections: [],
    });
    expect(parseXWebBookmarkExportPage(complete)).toEqual(complete);
    const truncated = projectXWebBookmarkExportPage(response, 1);
    expect(truncated.items.map((item) => item.post_id)).toEqual(["11"]);
    expect(truncated.cursor).toBeNull();
    expect(JSON.stringify(truncated)).not.toContain("next-bookmarks-page");
    expect(parseXWebBookmarkExportPage(truncated).items[0]!.post_id).toBe("11");
  });

  test("admits only TAB, LF, and CR among C0 and DEL in post text while keeping createdAt strict", () => {
    const multiline = "line one\nline two\rwith tab\there";
    const page = projectXWebBookmarkExportPage(bookmarksResponse(
      timelineItemEntry("tweet-1", tweetResult("900", {
        text: multiline,
        author: { id: "9", username: "nine", name: "Nine" },
      })),
    ), 10);
    expect(page.posts[0]!.text).toBe(multiline);
    expect(page.items[0]!.text).toBe(multiline);
    expect(parseXWebBookmarkExportPage(page)).toEqual(page);

    const empty = projectXWebBookmarkExportPage(bookmarksResponse(
      timelineItemEntry("tweet-empty", tweetResult("903", { text: "" })),
    ), 10);
    expect(empty.posts[0]!.text).toBe("");
    expect(parseXWebBookmarkExportPage(empty)).toEqual(empty);

    const allowedControls = new Set([0x09, 0x0a, 0x0d]);
    const controlCodes = [
      ...Array.from({ length: 0x20 }, (_, code) => code),
      0x7f,
    ];
    for (const code of controlCodes) {
      const text = `before${String.fromCharCode(code)}after`;
      const response = bookmarksResponse(
        timelineItemEntry(`tweet-control-${code}`, tweetResult("901", { text })),
      );
      if (allowedControls.has(code)) {
        const controlPage = projectXWebBookmarkExportPage(response, 10);
        expect(controlPage.posts[0]!.text).toBe(text);
        expect(controlPage.items[0]!.text).toBe(text);
        expect(parseXWebBookmarkExportPage(controlPage)).toEqual(controlPage);
        continue;
      }
      expect(() => projectXWebBookmarkExportPage(response, 10))
        .toThrow("X post text must be bounded public text");
      expect(() => parseXWebBookmarkExportRecord({
        ...page.items[0]!,
        text,
      })).toThrow("X bookmark export record.text must be bounded public text");
    }

    expect(() => projectXWebBookmarkExportPage(bookmarksResponse(
      timelineItemEntry("tweet-created", tweetResult("904", {
        text: "ok",
        createdAt: `${createdAt}\n`,
      })),
    ), 10)).toThrow("X post createdAt must be bounded public text");
  });

  test("fails without exposing a cursor when an over-limit bookmark page has no continuation", () => {
    expect(() => projectXWebBookmarkExportPage(bookmarksResponse(
      timelineItemEntry("tweet-1", tweetResult("21")),
      timelineItemEntry("tweet-2", tweetResult("22")),
    ), 1)).toThrow("no continuation cursor was exposed");
  });

  test("additive feed entries preserve ordered distinct unavailable occurrences without inventing post IDs", () => {
    const response = bookmarksResponse(
      timelineItemEntry("unavailable-first", { __typename: "TweetUnavailable", reason: "Protected\ncontent" }),
      timelineItemEntry("tweet-middle", tweetResult("21")),
      timelineItemEntry("unavailable-last", null),
      cursorEntry("cursor-bottom", "Bottom", "next-feed-page"),
    );
    const page = projectXWebFeedPage("feeds.bookmarks", response, 3);
    expect(page.posts.map(post => post.id)).toEqual(["21"]);
    expect(page.entries).toEqual([
      { kind: "unavailable", id: "unavailable-first", postId: null, reason: "Protected\ncontent" },
      { kind: "post", id: "21", post: page.posts[0]! },
      { kind: "unavailable", id: "unavailable-last", postId: null, reason: null },
    ]);
    expect(page.entriesTruncated).toBeFalse();
    expect(page.cursor).toBe("next-feed-page");
    const truncated = projectXWebFeedPage("feeds.bookmarks", response, 1);
    expect(truncated.posts.map(post => post.id)).toEqual(["21"]);
    expect(truncated.entries).toEqual([page.entries[0]!]);
    expect(truncated.entriesTruncated).toBeTrue();
    expect(truncated.cursor).toBeNull();
    expect(Object.isFrozen(page.entries)).toBeTrue();
    expect(() => projectXWebFeedPage("feeds.bookmarks", bookmarksResponse(
      timelineItemEntry("unavailable", { __typename: "TweetUnavailable", reason: "x".repeat(10_001) }),
    ), 1)).toThrow("X unavailable reason");
  });

  test("additive unavailable overflow does not break legacy feed pages lacking continuation", () => {
    const page = projectXWebFeedPage("feeds.bookmarks", bookmarksResponse(
      timelineItemEntry("unavailable", null),
      timelineItemEntry("tweet", tweetResult("21")),
    ), 1);
    expect(page.posts.map(post => post.id)).toEqual(["21"]);
    expect(page.entries).toEqual([{ kind: "unavailable", id: "unavailable", postId: null, reason: null }]);
    expect(page.entriesTruncated).toBeTrue();
    expect(page.cursor).toBeNull();
  });

  test("bookmark exports roundtrip additive unavailable entries and retain legacy pages unchanged", () => {
    const response = bookmarksResponse(
      timelineItemEntry("unavailable-first", { __typename: "TweetUnavailable", reason: "Protected" }),
      timelineItemEntry("tweet-middle", tweetResult("21")),
      timelineItemEntry("unavailable-last", null),
      cursorEntry("cursor-bottom", "Bottom", "next-bookmark-page"),
    );
    const page = projectXWebBookmarkExportPage(response, 3);
    expect(page.entries?.map(entry => [entry.kind, entry.id])).toEqual([
      ["unavailable", "unavailable-first"], ["post", "21"], ["unavailable", "unavailable-last"],
    ]);
    expect(page.entriesTruncated).toBeFalse();
    expect(parseXWebBookmarkExportPage(JSON.parse(JSON.stringify(page)))).toEqual(page);
    const { entries: _entries, entriesTruncated: _truncated, ...legacy } = page;
    expect(parseXWebBookmarkExportPage(legacy)).toEqual(legacy);
    const truncated = projectXWebBookmarkExportPage(response, 1);
    expect(truncated.entries).toEqual([page.entries![0]!]);
    expect(truncated.entriesTruncated).toBeTrue();
    expect(truncated.posts.map(post => post.id)).toEqual(["21"]);
    expect(parseXWebBookmarkExportPage(truncated)).toEqual(truncated);
    expect(Object.hasOwn(projectXWebBookmarkExportPage(bookmarksResponse(
      timelineItemEntry("tweet", tweetResult("21")),
    ), 1), "entries")).toBeFalse();
    for (const malformed of [
      { ...legacy, entries: page.entries },
      { ...legacy, entriesTruncated: false },
      { ...page, entriesTruncated: "false" },
      { ...page, entriesTruncated: true },
      { ...page, entries: [page.entries![0], page.entries![0], page.entries![1]] },
      { ...page, entries: [page.entries![0], { ...page.entries![1]!, id: "22" }, page.entries![2]] },
      { ...page, entries: [page.entries![0], page.entries![2]] },
      { ...page, entries: [{ ...page.entries![0]!, postId: "21" }, page.entries![1], page.entries![2]] },
      { ...page, entries: [{ ...page.entries![0]!, extra: true }, page.entries![1], page.entries![2]] },
      { ...page, entries: Array.from({ length: 101 }, () => page.entries![0]) },
    ]) expect(() => parseXWebBookmarkExportPage(malformed)).toThrow();
  });

  test("keeps user and search feed pages on public-text and over-limit cursor contracts", () => {
    const userResponse = {
      data: {
        user: {
          result: {
            rest_id: "1401049881070997506",
            timeline: {
              timeline: timeline(
                timelineItemEntry("tweet-1", tweetResult("51", {
                  text: "user post\nwith newline",
                  author: { id: "1401049881070997506", username: "CathPoaster", name: "Cath" },
                })),
                timelineItemEntry("tweet-2", tweetResult("52", { text: "second" })),
                cursorEntry("cursor-bottom", "Bottom", "next-user-page"),
              ),
            },
          },
        },
      },
    };
    const searchResponse = {
      data: {
        search_by_raw_query: {
          search_timeline: {
            timeline: timeline(
              timelineItemEntry("tweet-1", tweetResult("61", { text: "search hit" })),
              timelineItemEntry("tweet-2", tweetResult("62", { text: "second hit" })),
              cursorEntry("cursor-bottom", "Bottom", "next-search-page"),
            ),
          },
        },
      },
    };
    expect(extractXWebGraphQlReadResponseRoot("feeds.user", userResponse)).toEqual(
      userResponse.data.user.result.timeline.timeline,
    );
    expect(extractXWebGraphQlReadResponseRoot("feeds.search", searchResponse)).toEqual(
      searchResponse.data.search_by_raw_query.search_timeline.timeline,
    );
    const completeUser = projectXWebFeedPage("feeds.user", userResponse, 2);
    expect(completeUser.posts[0]).toMatchObject({
      id: "51",
      text: "user post\nwith newline",
      authorId: "1401049881070997506",
    });
    expect(completeUser.cursor).toBe("next-user-page");
    const truncatedUser = projectXWebFeedPage("feeds.user", userResponse, 1);
    expect(truncatedUser.posts.map((post) => post.id)).toEqual(["51"]);
    expect(truncatedUser.cursor).toBeNull();
    expect(JSON.stringify(truncatedUser)).not.toContain("next-user-page");
    expect(() => projectXWebFeedPage("feeds.user", {
      data: {
        user: {
          result: {
            rest_id: "1401049881070997506",
            timeline: {
              timeline: timeline(
                timelineItemEntry("tweet-1", tweetResult("51")),
                timelineItemEntry("tweet-2", tweetResult("52")),
              ),
            },
          },
        },
      },
    }, 1)).toThrow("no continuation cursor was exposed");
    const completeSearch = projectXWebFeedPage("feeds.search", searchResponse, 2);
    expect(completeSearch.cursor).toBe("next-search-page");
    const truncatedSearch = projectXWebFeedPage("feeds.search", searchResponse, 1);
    expect(truncatedSearch.cursor).toBeNull();
    expect(JSON.stringify(truncatedSearch)).not.toContain("next-search-page");
    expect(() => projectXWebFeedPage("feeds.search", {
      data: {
        search_by_raw_query: {
          search_timeline: {
            timeline: timeline(
              timelineItemEntry("tweet-1", tweetResult("61")),
              timelineItemEntry("tweet-2", tweetResult("62")),
            ),
          },
        },
      },
    }, 1)).toThrow("no continuation cursor was exposed");
    expect(() => projectXWebFeedPage("feeds.user", {
      data: {
        user: {
          result: {
            rest_id: "1401049881070997506",
            timeline: {
              timeline: timeline(
                timelineItemEntry("tweet-bad", tweetResult("71", { text: "bad\u0001text" })),
              ),
            },
          },
        },
      },
    }, 10)).toThrow("X post text must be bounded public text");
  });

  test("binds the current UserTweets User node when rest_id moved off the result", () => {
    const userId = "1173552893003255808";
    const relayId = Buffer.from(`User:${userId}`, "utf8").toString("base64");
    const timelineEntries = timeline(
      timelineItemEntry("tweet-1", tweetResult("81", {
        text: "from yacinemtb",
        author: { id: userId, username: "yacinemtb", name: "Yacine" },
      })),
    );
    const currentShape = {
      data: {
        user: {
          result: {
            __typename: "User",
            id: relayId,
            timeline: { timeline: timelineEntries },
          },
        },
      },
    };
    const wrappedShape = {
      data: {
        user: {
          result: {
            __typename: "UserWithVisibilityResults",
            user: {
              __typename: "User",
              rest_id: userId,
              timeline: { timeline: timelineEntries },
            },
          },
        },
      },
    };
    const timelineV2Shape = {
      data: {
        user: {
          result: {
            __typename: "User",
            legacy: { id_str: userId },
            timeline_v2: { timeline: timelineEntries },
          },
        },
      },
    };
    assertXWebUserFeedTargetBound(currentShape, userId);
    assertXWebUserFeedTargetBound(wrappedShape, userId);
    assertXWebUserFeedTargetBound(timelineV2Shape, userId);
    expect(extractXWebGraphQlReadResponseRoot("feeds.user", currentShape)).toEqual(timelineEntries);
    expect(extractXWebGraphQlReadResponseRoot("feeds.user", wrappedShape)).toEqual(timelineEntries);
    expect(extractXWebGraphQlReadResponseRoot("feeds.user", timelineV2Shape)).toEqual(timelineEntries);
    expect(projectXWebFeedPage("feeds.user", currentShape, 1).posts[0]).toMatchObject({
      id: "81",
      authorId: userId,
    });
  });

  test("binds the current UserTweets User node from authored timeline posts when the User omits every identity field", () => {
    const userId = "1173552893003255808";
    const identityLessUser = {
      data: {
        user: {
          result: {
            __typename: "User",
            timeline: {
              timeline: timeline(
                timelineItemEntry("tweet-1", tweetResult("91", {
                  text: "from yacinemtb",
                  author: { id: userId, username: "yacinemtb", name: "Yacine" },
                })),
              ),
            },
          },
        },
      },
    };
    const identityLessLegacyOnly = {
      data: {
        user: {
          result: {
            __typename: "User",
            timeline: {
              timeline: timeline(
                timelineItemEntry("tweet-1", {
                  __typename: "Tweet",
                  rest_id: "92",
                  legacy: { full_text: "legacy author only", user_id_str: userId },
                }),
              ),
            },
          },
        },
      },
    };
    assertXWebUserFeedTargetBound(identityLessUser, userId);
    assertXWebUserFeedTargetBound(identityLessLegacyOnly, userId);
    expect(extractXWebGraphQlReadResponseRoot("feeds.user", identityLessUser)).toEqual(
      identityLessUser.data.user.result.timeline.timeline,
    );
    expect(projectXWebFeedPage("feeds.user", identityLessUser, 1).posts[0]).toMatchObject({
      id: "91",
      authorId: userId,
    });
  });

  test("rejects an unbound or mismatched UserTweets user", () => {
    const userId = "1173552893003255808";
    const timelineEntries = timeline(
      timelineItemEntry("tweet-1", tweetResult("82", { text: "unbound" })),
    );
    expect(() => assertXWebUserFeedTargetBound({
      data: {
        user: {
          result: {
            __typename: "User",
            timeline: { timeline: timelineEntries },
          },
        },
      },
    }, userId)).toThrow("omitted a bindable user rest_id");
    expect(() => assertXWebUserFeedTargetBound({
      data: {
        user: {
          result: {
            __typename: "User",
            timeline: { timeline: timeline() },
          },
        },
      },
    }, userId)).toThrow("omitted a bindable user rest_id");
    expect(() => assertXWebUserFeedTargetBound({
      data: {
        user: {
          result: {
            __typename: "User",
            timeline: {
              timeline: timeline(
                timelineItemEntry("tweet-other", tweetResult("93", {
                  text: "other author",
                  author: { id: "999", username: "other", name: "Other" },
                })),
              ),
            },
          },
        },
      },
    }, userId)).toThrow("did not bind the requested user");
    expect(() => assertXWebUserFeedTargetBound({
      data: {
        user: {
          result: {
            __typename: "User",
            rest_id: "999",
            timeline: { timeline: timelineEntries },
          },
        },
      },
    }, userId)).toThrow("did not bind the requested user");
    expect(() => assertXWebUserFeedTargetBound({
      data: {
        user: {
          result: {
            __typename: "UserUnavailable",
          },
        },
      },
    }, userId)).toThrow("X user feed target is unavailable");
    expect(() => assertXWebUserFeedTargetBound({
      data: {
        user: {
          result: {
            __typename: "FutureUserShape",
            rest_id: userId,
          },
        },
      },
    }, userId)).toThrow("unreviewed result typename");
  });

  test("rejects extra fields, duplicate post ids, and a mismatched feed on the export page", () => {
    const page = projectXWebBookmarkExportPage(bookmarksResponse(
      timelineItemEntry("tweet-1", tweetResult("31", {
        author: { id: "3", username: "three", name: "Three" },
      })),
    ), 10);
    expect(() => parseXWebBookmarkExportRecord({ ...page.items[0], extra: true }))
      .toThrow("unsupported field");
    expect(() => parseXWebBookmarkExportPage({ ...page, feed: "for-you" }))
      .toThrow("must be bookmarks");
    expect(() => parseXWebBookmarkExportPage({
      ...page,
      items: [...page.items, page.items[0]],
      posts: [...page.posts, page.posts[0]],
    })).toThrow("duplicate post_id");
    expect(() => parseXWebBookmarkExportRecord({
      ...page.items[0],
      url: "https://x.com/three/status/31",
    })).toThrow("status permalink");
  });

  test("projects a viewer-bound contact page and keeps non-user rows out", () => {
    const contactsResponse = {
      data: {
        user: {
          result: {
            __typename: "User",
            rest_id: "1401049881070997506",
            timeline: {
              timeline: {
                instructions: [
                  {
                    type: "TimelineAddEntries",
                    entries: [
                      timelineUserEntry("41", {
                        result: {
                          __typename: "User",
                          rest_id: "41",
                          core: { name: "Ana", screen_name: "anahandle" },
                          legacy: { name: "Ana", screen_name: "anahandle" },
                          relationship_perspectives: { following: true, followed_by: true },
                        },
                      }),
                      timelineUserEntry("42", {
                        result: { __typename: "UserUnavailable", reason: "Suspended" },
                      }),
                      timelineUserEntry("43", {
                        result: {
                          __typename: "User",
                          rest_id: "43",
                          legacy: { name: "Legacy Name", screen_name: "legacyhandle" },
                        },
                      }),
                      timelineItemEntry("tweet-44", tweetResult("44", { text: "promoted" })),
                      cursorEntry("cursor-bottom", "Bottom", "contacts-next"),
                    ],
                  },
                  { type: "TimelineTerminateTimeline", direction: "Top" },
                ],
              },
            },
          },
        },
      },
    };
    const page = projectXWebContactPage("contacts.followers", contactsResponse, 10);
    expect(page.users).toEqual([
      {
        providerId: "41",
        handle: "anahandle",
        displayName: "Ana",
        followsViewer: true,
        followedByViewer: true,
        sentCount: null,
        sentCountComplete: false,
        sentCountLowerBound: false,
        sentCountTruncated: false,
        receivedCount: null,
        receivedCountComplete: false,
        receivedCountLowerBound: false,
        receivedCountTruncated: false,
        lastSentAt: null,
        lastSentAtComplete: false,
        lastSentAtBasis: "unavailable",
        sentStatsIncompleteReasons: ["message-history-capture-required"],
        lastReceivedAt: null,
        lastReceivedAtComplete: false,
        lastReceivedAtBasis: "unavailable",
        receivedStatsIncompleteReasons: ["message-history-capture-required"],
      },
      {
        providerId: "43",
        handle: "legacyhandle",
        displayName: "Legacy Name",
        followsViewer: null,
        followedByViewer: null,
        sentCount: null,
        sentCountComplete: false,
        sentCountLowerBound: false,
        sentCountTruncated: false,
        receivedCount: null,
        receivedCountComplete: false,
        receivedCountLowerBound: false,
        receivedCountTruncated: false,
        lastSentAt: null,
        lastSentAtComplete: false,
        lastSentAtBasis: "unavailable",
        sentStatsIncompleteReasons: ["message-history-capture-required"],
        lastReceivedAt: null,
        lastReceivedAtComplete: false,
        lastReceivedAtBasis: "unavailable",
        receivedStatsIncompleteReasons: ["message-history-capture-required"],
      },
    ]);
    expect(page.cursor).toBe("contacts-next");
    expect(page.terminatedDirections).toEqual(["Top"]);
    expect(page.entries.map(entry => [entry.kind, entry.id])).toEqual([
      ["profile", "41"], ["unavailable", "user-42"], ["profile", "43"],
    ]);
    expect(page.entries[1]).toEqual({ kind: "unavailable", id: "user-42", postId: null, reason: "Suspended" });
    expect(page.entriesTruncated).toBeFalse();
    const followingPage = projectXWebContactPage("contacts.following", contactsResponse, 10);
    expect(followingPage.users).toEqual(page.users);
    const truncated = projectXWebContactPage("contacts.followers", contactsResponse, 1);
    expect(truncated.users.map((user) => user.providerId)).toEqual(["41"]);
    expect(truncated.cursor).toBeNull();
    expect(JSON.stringify(truncated)).not.toContain("contacts-next");
    expect(() => projectXWebContactPage("contacts.followers", {
      data: {
        user: {
          result: {
            __typename: "User",
            rest_id: "1401049881070997506",
            timeline: {
              timeline: timeline(
                timelineUserEntry("41", {
                  result: { __typename: "User", rest_id: "41", core: { screen_name: "a" } },
                }),
                timelineUserEntry("42", {
                  result: { __typename: "User", rest_id: "42", core: { screen_name: "b" } },
                }),
              ),
            },
          },
        },
      },
    }, 1)).toThrow("no continuation cursor was exposed");
    expect(() => projectXWebContactPage("contacts.followers", {
      data: {
        user: {
          result: {
            __typename: "User",
            rest_id: "1401049881070997506",
            timeline: {
              timeline: timeline(
                timelineUserEntry("45", {
                  result: {
                    __typename: "User",
                    rest_id: "45",
                    core: { name: "Drifted", screen_name: "one" },
                    legacy: { name: "Drifted", screen_name: "two" },
                  },
                }),
              ),
            },
          },
        },
      },
    }, 10)).toThrow("handle disagreed across core and legacy");
    const controlName = projectXWebContactPage("contacts.followers", {
      data: {
        user: {
          result: {
            __typename: "User",
            rest_id: "1401049881070997506",
            timeline: {
              timeline: timeline(
                timelineUserEntry("47", {
                  result: {
                    __typename: "User",
                    rest_id: "47",
                    core: { name: "Ab\u0005cd", screen_name: "controlname" },
                    legacy: { name: "Ab\u0005cd", screen_name: "controlname" },
                  },
                }),
              ),
            },
          },
        },
      },
    }, 10);
    expect(controlName.users.map(({ providerId, handle, displayName }) => ({ providerId, handle, displayName })))
      .toEqual([{ providerId: "47", handle: "controlname", displayName: null }]);
    for (const name of ["", "x".repeat(1_001), 5]) {
      expect(() => projectXWebContactPage("contacts.followers", {
        data: {
          user: {
            result: {
              __typename: "User",
              rest_id: "1401049881070997506",
              timeline: {
                timeline: timeline(
                  timelineUserEntry("48", {
                    result: { __typename: "User", rest_id: "48", core: { name, screen_name: "drift" } },
                  }),
                ),
              },
            },
          },
        },
      }, 10)).toThrow("core.name must be bounded public text");
    }
    expect(() => projectXWebContactPage("contacts.followers", {
      data: {
        user: {
          result: {
            __typename: "User",
            rest_id: "1401049881070997506",
            timeline: {
              timeline: timeline(
                timelineUserEntry("46", {
                  result: {
                    __typename: "User",
                    rest_id: "46",
                    core: { name: "Flag", screen_name: "flag" },
                    relationship_perspectives: { following: "yes" },
                  },
                }),
              ),
            },
          },
        },
      },
    }, 10)).toThrow("X viewer following must be boolean");
  });

  test("additive contact entries retain missing handles and unavailable users as distinct source occurrences", () => {
    const response = { data: { user: { result: { __typename: "User", rest_id: "123", timeline: { timeline: timeline(
      timelineUserEntry("41", { result: { __typename: "User", rest_id: "41", core: { name: "No handle" } } }),
      timelineUserEntry("42", { result: { __typename: "UserUnavailable", reason: "Suspended" } }),
      timelineUserEntry("43", { result: null }),
    ) } } } } };
    const page = projectXWebContactPage("contacts.followers", response, 3);
    expect(page.users.map(user => user.providerId)).toEqual(["41"]);
    expect(page.profiles).toEqual([]);
    expect(page.entries).toEqual([
      { kind: "unavailable", id: "user-41", postId: null, reason: null },
      { kind: "unavailable", id: "user-42", postId: null, reason: "Suspended" },
      { kind: "unavailable", id: "user-43", postId: null, reason: null },
    ]);
    const truncated = projectXWebContactPage("contacts.followers", response, 1);
    expect(truncated.users.map(user => user.providerId)).toEqual(["41"]);
    expect(truncated.entries).toEqual([page.entries[0]!]);
    expect(truncated.entriesTruncated).toBeTrue();
    expect(truncated.cursor).toBeNull();
  });
});

describe("desired-state mutation response validation", () => {
  test("validates exact like and unlike Done markers while requiring readback", () => {
    expect(validateXWebDesiredStateMutation({
      kind: "like",
      enabled: true,
      targetPostId: "100",
      response: { data: { favorite_tweet: "Done" } },
    })).toEqual({
      kind: "like",
      enabled: true,
      targetPostId: "100",
      providerResultId: null,
      requiresReadback: true,
    });
    expect(validateXWebDesiredStateMutation({
      kind: "like",
      enabled: false,
      targetPostId: "100",
      response: { data: { unfavorite_tweet: "Done" }, errors: [] },
    })).toMatchObject({ enabled: false, requiresReadback: true });
  });

  test("validates exact bookmark and unbookmark Done markers while requiring readback", () => {
    expect(validateXWebDesiredStateMutation({
      kind: "bookmark",
      enabled: true,
      targetPostId: "200",
      response: { data: { tweet_bookmark_put: "Done" } },
    })).toMatchObject({ kind: "bookmark", enabled: true, requiresReadback: true });
    expect(validateXWebDesiredStateMutation({
      kind: "bookmark",
      enabled: false,
      targetPostId: "200",
      response: { data: { tweet_bookmark_delete: "Done" } },
    })).toMatchObject({ kind: "bookmark", enabled: false, requiresReadback: true });
  });

  test("binds a returned repost to its created ID and nested source target", () => {
    const validated = validateXWebDesiredStateMutation({
      kind: "repost",
      enabled: true,
      targetPostId: "300",
      response: {
        data: {
          create_retweet: {
            retweet_results: {
              result: {
                rest_id: "301",
                legacy: {
                  retweeted_status_result: { result: { rest_id: "300" } },
                },
              },
            },
          },
        },
      },
    });
    expect(validated).toEqual({
      kind: "repost",
      enabled: true,
      targetPostId: "300",
      providerResultId: "301",
      requiresReadback: false,
    });
  });

  test("requires readback when a valid repost result omits source identity", () => {
    expect(validateXWebDesiredStateMutation({
      kind: "repost",
      enabled: true,
      targetPostId: "300",
      response: {
        data: {
          create_retweet: {
            retweet_results: { result: { legacy: { id_str: "301" } } },
          },
        },
      },
    })).toMatchObject({ providerResultId: "301", requiresReadback: true });
  });

  test("binds unrepost success to the exact source post", () => {
    expect(validateXWebDesiredStateMutation({
      kind: "repost",
      enabled: false,
      targetPostId: "400",
      response: {
        data: {
          unretweet: { source_tweet_results: { result: { legacy: { id_str: "400" } } } },
        },
      },
    })).toEqual({
      kind: "repost",
      enabled: false,
      targetPostId: "400",
      providerResultId: null,
      requiresReadback: false,
    });
  });

  test("rejects provider errors, malformed error fields, and inexact markers", () => {
    const cases: readonly unknown[] = [
      { data: { favorite_tweet: "Done" }, errors: [{ message: "failed" }] },
      { data: { favorite_tweet: "Done" }, errors: {} },
      { data: { favorite_tweet: "done" } },
      { data: { favorite_tweet: true } },
      { data: {} },
      {},
      null,
    ];
    for (const response of cases) {
      expect(() => validateXWebDesiredStateMutation({
        kind: "like",
        enabled: true,
        targetPostId: "500",
        response,
      })).toThrow();
    }
  });

  test("rejects missing repost results, mismatched targets, and invalid IDs", () => {
    const failures: readonly { readonly enabled: boolean; readonly targetPostId: string; readonly response: unknown }[] = [
      { enabled: true, targetPostId: "600", response: { data: { create_retweet: {} } } },
      { enabled: true, targetPostId: "600", response: { data: { create_retweet: { retweet_results: { result: {} } } } } },
      {
        enabled: true,
        targetPostId: "600",
        response: { data: { create_retweet: { retweet_results: { result: { rest_id: "601", retweeted_status_result: { result: { rest_id: "999" } } } } } } },
      },
      { enabled: false, targetPostId: "600", response: { data: { unretweet: { source_tweet_results: { result: {} } } } } },
      { enabled: false, targetPostId: "600", response: { data: { unretweet: { source_tweet_results: { result: { rest_id: "999" } } } } } },
      { enabled: false, targetPostId: "not-an-id", response: { data: {} } },
    ];
    for (const failure of failures) {
      expect(() => validateXWebDesiredStateMutation({
        kind: "repost",
        ...failure,
      })).toThrow();
    }
  });

  test("rejects an unreviewed desired-state kind", () => {
    expect(() => validateXWebDesiredStateMutation({
      kind: "follow" as "like",
      enabled: true,
      targetPostId: "700",
      response: { data: {} },
    })).toThrow("not reviewed");
  });
});


test("local unread-state URT instructions neither discard entries nor imply a read acknowledgement", () => {
  const empty = normalizeXWebUrtTimeline({ instructions: [
    { type: "TimelineAddEntries", entries: [timelineItemEntry("tweet-123", { __typename: "Tweet", rest_id: "123", legacy: { full_text: "Fixture post" } })] },
    { type: "TimelineClearEntriesUnreadState" },
    { type: "TimelineMarkEntriesUnreadGreaterThanSortIndex", sort_index: "1234567890" },
    { type: "TimelineAddEntries", entries: [] },
  ] });
  expect(empty.items).toMatchObject([{ kind: "tweet", tweetId: "123" }]);
  expect(empty.cursors.bottom).toBeNull();
  expect(empty.terminatedDirections).toEqual([]);
  expect(() => normalizeXWebUrtTimeline({ instructions: [{ type: "TimelineAcknowledgeNotifications" }] })).toThrow("not reviewed");
});
