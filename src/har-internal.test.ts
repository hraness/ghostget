import { describe, expect, test } from "bun:test";
import { assertProperty, fc } from "./test-support";

import {
  analyzeInternalHarValue,
  type InternalHarCandidate,
} from "./har-internal";

type HarEntryOptions = {
  readonly url: string;
  readonly method?: string;
  readonly status?: number;
  readonly requestHeaders?: readonly { readonly name: string; readonly value: string }[];
  readonly requestJson?: unknown;
  readonly requestParams?: readonly { readonly name: string; readonly value: string }[];
  readonly requestText?: string;
  readonly requestMimeType?: string;
  readonly responseJson?: unknown;
  readonly responseText?: string;
  readonly responseMimeType?: string;
};

function entry(options: HarEntryOptions): Record<string, unknown> {
  const postData = options.requestJson === undefined
      && options.requestParams === undefined
      && options.requestText === undefined
    ? undefined
    : options.requestJson !== undefined
      ? { mimeType: "application/json", text: JSON.stringify(options.requestJson) }
      : options.requestParams !== undefined
        ? { mimeType: "application/x-www-form-urlencoded", params: options.requestParams }
        : {
            mimeType: options.requestMimeType ?? "application/x-www-form-urlencoded",
            text: options.requestText,
          };
  return {
    request: {
      method: options.method ?? "GET",
      url: options.url,
      headers: options.requestHeaders ?? [],
      queryString: [...new URL(options.url).searchParams].map(([name, value]) => ({ name, value })),
      ...(postData === undefined ? {} : { postData }),
    },
    response: {
      status: options.status ?? 200,
      headers: [{ name: "set-cookie", value: "response-cookie-private" }],
      content: options.responseJson === undefined
        ? {
            mimeType: options.responseMimeType ?? "text/plain",
            text: options.responseText ?? "response-content-private",
          }
        : {
            mimeType: options.responseMimeType ?? "application/json; charset=utf-8",
            text: JSON.stringify(options.responseJson),
          },
    },
  };
}

function har(entries: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { log: { version: "1.2", creator: { name: "test", version: "1" }, entries } };
}

function oneCandidate(value: ReturnType<typeof analyzeInternalHarValue>): InternalHarCandidate {
  expect(value.candidates).toHaveLength(1);
  const candidate = value.candidates[0];
  if (candidate === undefined) throw new Error("missing internal HAR candidate");
  return candidate;
}


describe("private LinkedIn internal-API HAR evidence", () => {

  test("retains reviewed native Article route and document field structure without retaining draft or member values", () => {
    const draftId = "7000000000000000001";
    const profileUrn = "urn:li:fsd_profile:fixture-private";
    const title = "private fixture title";
    const text = "private fixture text";
    const hyperlink = "https://example.com/private-fixture";
    const coverAssetUrn = "urn:li:digitalmediaAsset:private-cover-fixture";
    const url = new URL(`https://www.linkedin.com/voyager/api/voyagerPublishingDashFirstPartyArticles/urn:li:fsd_firstPartyArticle:${draftId}`);
    url.searchParams.set("author", profileUrn);
    url.searchParams.set("q", "author");
    url.searchParams.set("start", "0");
    url.searchParams.set("state", "DRAFT");
    const evidence = analyzeInternalHarValue(har([entry({
      method: "POST",
      url: url.href,
      status: 200,
      requestHeaders: [
        { name: "Authorization", value: "Bearer private" },
      ],
      requestJson: {
        patch: {
          $set: {
            title,
            coverMediaV2Union: {
              coverImage: {
                $type: "com.linkedin.voyager.dash.publishing.CoverImage",
                caption: { text: "" },
                originalImageUrn: coverAssetUrn,
              },
            },
            content: [{
              textBlock: {
                type: "PARAGRAPH",
                content: {
                  text,
                  attributesV2: [{ start: 0, length: 7, detailDataUnion: { hyperlink } }],
                },
              },
            }],
          },
        },
      },
      responseJson: {
        data: { "*elements": [`urn:li:fsd_firstPartyArticle:${draftId}`] },
        included: [{
          entityUrn: `urn:li:fsd_firstPartyArticle:${draftId}`,
          linkedInArticleUrn: `urn:li:linkedInArticle:${draftId}`,
          authors: [{ profileUrn }],
          title,
          contentHtml: `<p>${text}</p>`,
          content: [{ textBlock: { type: "PARAGRAPH", content: { text, attributesV2: [] } } }],
          state: "DRAFT",
          articleType: "FIRST_PARTY_ARTICLE",
          publishedAt: null,
          activityUrn: null,
          ugcPostUrn: null,
          permalink: null,
          version: 2,
          createdAt: 1,
          updatedAt: 2,
        }],
      },
    })]), "linkedin-web", "https://www.linkedin.com", new Date("2026-08-15T12:00:00.000Z"));

    const candidate = oneCandidate(evidence);
    expect(candidate.path).toBe("/voyager/api/voyagerPublishingDashFirstPartyArticles/:segment1");
    expect(candidate.queryNames).toEqual(["author", "q", "start", "state"]);
    expect(candidate.headerNames).toEqual(["authorization"]);
    for (const path of [
      "patch.$set.title",
      "patch.$set.coverMediaV2Union.coverImage.$type",
      "patch.$set.coverMediaV2Union.coverImage.caption.text",
      "patch.$set.coverMediaV2Union.coverImage.originalImageUrn",
      "patch.$set.content[].textBlock.type",
      "patch.$set.content[].textBlock.content.text",
      "patch.$set.content[].textBlock.content.attributesV2[].start",
      "patch.$set.content[].textBlock.content.attributesV2[].length",
      "patch.$set.content[].textBlock.content.attributesV2[].detailDataUnion.hyperlink",
    ]) expect(candidate.requestFieldPaths).toContain(path);
    for (const path of [
      "data.:dynamic",
      "included[].entityUrn",
      "included[].linkedInArticleUrn",
      "included[].authors[].profileUrn",
      "included[].title",
      "included[].contentHtml",
      "included[].content[].textBlock.content.attributesV2",
      "included[].state",
      "included[].articleType",
      "included[].publishedAt",
      "included[].activityUrn",
      "included[].ugcPostUrn",
      "included[].permalink",
      "included[].version",
      "included[].createdAt",
      "included[].updatedAt",
    ]) expect(candidate.responseFieldPaths).toContain(path);
    const serialized = JSON.stringify(evidence);
    for (const forbidden of [
      draftId,
      profileUrn,
      title,
      text,
      hyperlink,
      coverAssetUrn,
      "fixture-private",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("private Facebook internal-API HAR evidence", () => {
  test("retains exact Meta routes, reviewed field names, bounded variables shape, and one registered operation without retaining private values", () => {
    const operationName = "CometNewsFeedPaginationQuery";
    const documentId = "9876543210123456789";
    const profileId = "100012345678901";
    const dynamicProfileKey = "pfbid02PrivateProfileKey";
    const variables = JSON.stringify({
      count: 25,
      cursor: "facebook-cursor-private",
      message: { text: "facebook-message-private" },
      users: {
        [dynamicProfileKey]: { name: "facebook-profile-private" },
      },
      [profileId]: { id: "facebook-dynamic-id-private" },
      accessToken: "facebook-variable-token-private",
      fb_dtsg: { message: "facebook-nested-proof-private" },
    });
    const reviewedParams = [
      { name: "variables", value: variables },
      { name: "doc_id", value: documentId },
      { name: "fb_api_req_friendly_name", value: operationName },
      { name: "fb_api_caller_class", value: "RelayModern-private" },
      { name: "av", value: "facebook-actor-private" },
      { name: "__user", value: "facebook-user-private" },
      { name: "__a", value: "facebook-async-private" },
      { name: "__req", value: "facebook-request-private" },
      { name: "__hs", value: "facebook-haste-private" },
      { name: "dpr", value: "facebook-density-private" },
      { name: "__ccg", value: "facebook-connection-private" },
      { name: "__rev", value: "facebook-revision-private" },
      { name: "__s", value: "facebook-session-shape-private" },
      { name: "__hsi", value: "facebook-hsi-private" },
      { name: "__dyn", value: "facebook-dyn-private" },
      { name: "__csr", value: "facebook-csr-private" },
      { name: "__comet_req", value: "facebook-comet-private" },
      { name: "fb_dtsg", value: "facebook-dtsg-private" },
      { name: "jazoest", value: "facebook-jazoest-private" },
      { name: "lsd", value: "facebook-lsd-private" },
      { name: "server_timestamps", value: "facebook-timestamps-private" },
      { name: "access_token", value: "facebook-form-token-private" },
    ] as const;
    const graphQlUrl = new URL("https://www.facebook.com/api/graphql/");
    graphQlUrl.searchParams.set("__a", "facebook-query-async-private");
    graphQlUrl.searchParams.set("__user", "facebook-query-user-private");
    graphQlUrl.searchParams.set("fb_dtsg", "facebook-query-dtsg-private");
    graphQlUrl.searchParams.set("access_token", "facebook-query-token-private");
    const ajaxUrl = new URL("https://www.facebook.com/ajax/qm/");
    ajaxUrl.searchParams.set("__a", "facebook-ajax-async-private");
    ajaxUrl.searchParams.set("__comet_req", "facebook-ajax-comet-private");
    ajaxUrl.searchParams.set("jazoest", "facebook-ajax-jazoest-private");
    ajaxUrl.searchParams.set("secret", "facebook-ajax-secret-private");

    const evidence = analyzeInternalHarValue(har([
      entry({
        method: "POST",
        url: graphQlUrl.href,
        status: 200,
        requestHeaders: [
          { name: "Cookie", value: "c_user=facebook-cookie-user-private; xs=facebook-cookie-xs-private" },
          { name: "Authorization", value: "Bearer facebook-header-token-private" },
          { name: "Content-Type", value: "application/x-www-form-urlencoded-private" },
        ],
        requestParams: reviewedParams,
        responseJson: {
          data: {
            result: {
              items: [{
                id: "facebook-response-id-private",
                message: { text: "facebook-response-message-private" },
                users: {
                  [dynamicProfileKey]: { name: "facebook-response-profile-private" },
                },
              }],
              paging: { cursor: "facebook-response-cursor-private" },
            },
          },
          accessToken: "facebook-response-token-private",
        },
      }),
      entry({
        method: "POST",
        url: ajaxUrl.href,
        status: 204,
        requestParams: [
          { name: "__a", value: "facebook-ajax-form-async-private" },
          { name: "fb_dtsg", value: "facebook-ajax-form-dtsg-private" },
        ],
        responseJson: { data: { result: true } },
      }),
      entry({
        url: "https://www.facebook.com/data/manifest/",
        status: 200,
        responseJson: { data: { items: [] } },
      }),
      entry({
        method: "POST",
        url: "https://evil.example/api/graphql/",
        requestParams: reviewedParams,
        responseJson: { data: { message: "facebook-cross-origin-private" } },
      }),
    ]), "facebook-internal", "https://www.facebook.com", new Date("2026-07-23T12:00:00.000Z"));

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      adapterId: "facebook-internal",
      targetOrigin: "https://www.facebook.com",
      analyzedAt: "2026-07-23T12:00:00.000Z",
      observedEntries: 4,
    });
    expect(evidence.candidates.map((candidate) => candidate.path)).toEqual([
      "/ajax/qm/",
      "/api/graphql/",
      "/data/manifest/",
    ]);
    expect(evidence.candidates.every((candidate) => candidate.reviewRequired)).toBeTrue();
    const graphQl = evidence.candidates.find((candidate) => candidate.path === "/api/graphql/");
    expect(graphQl).toMatchObject({
      method: "POST",
      origin: "https://www.facebook.com",
      sampleCount: 1,
      statuses: [200],
      queryNames: ["__a", "__user", "fb_dtsg"],
      revisions: [`meta=${operationName}.${documentId}`],
      reviewRequired: true,
    });
    for (const name of reviewedParams.slice(0, -1).map((parameter) => parameter.name)) {
      expect(graphQl?.requestFieldPaths).toContain(name);
    }
    expect(graphQl?.requestFieldPaths).toContain(":dynamic");
    for (const path of [
      "variables.count",
      "variables.cursor",
      "variables.message",
      "variables.message.text",
      "variables.users",
      "variables.users.:dynamic.name",
      "variables.fb_dtsg",
      "variables.:dynamic",
    ]) expect(graphQl?.requestFieldPaths).toContain(path);
    expect(graphQl?.requestFieldPaths).not.toContain("variables.fb_dtsg.message");
    for (const path of [
      "data.result.items[].id",
      "data.result.items[].message.text",
      "data.result.items[].users.:dynamic.name",
      "data.result.paging.cursor",
    ]) expect(graphQl?.responseFieldPaths).toContain(path);
    expect(evidence.warnings.some((warning) => warning.includes("inert"))).toBeTrue();

    const ajax = evidence.candidates.find((candidate) => candidate.path === "/ajax/qm/");
    expect(ajax).toMatchObject({
      queryNames: ["__a", "__comet_req", "jazoest"],
      requestFieldPaths: ["__a", "fb_dtsg"],
      revisions: [],
      reviewRequired: true,
    });
    expect(evidence.candidates.find((candidate) => candidate.path === "/data/manifest/")).toMatchObject({
      revisions: [],
      reviewRequired: true,
    });

    const serialized = JSON.stringify(evidence);
    for (const parameter of reviewedParams) {
      if (
        parameter.name !== "doc_id"
        && parameter.name !== "fb_api_req_friendly_name"
      ) expect(serialized).not.toContain(parameter.value);
    }
    for (const forbidden of [
      profileId,
      dynamicProfileKey,
      "facebook-cursor-private",
      "facebook-message-private",
      "facebook-profile-private",
      "facebook-dynamic-id-private",
      "facebook-variable-token-private",
      "facebook-nested-proof-private",
      "RelayModern-private",
      "facebook-actor-private",
      "facebook-user-private",
      "facebook-async-private",
      "facebook-request-private",
      "facebook-haste-private",
      "facebook-density-private",
      "facebook-connection-private",
      "facebook-revision-private",
      "facebook-session-shape-private",
      "facebook-hsi-private",
      "facebook-dyn-private",
      "facebook-csr-private",
      "facebook-comet-private",
      "facebook-dtsg-private",
      "facebook-jazoest-private",
      "facebook-lsd-private",
      "facebook-timestamps-private",
      "facebook-form-token-private",
      "facebook-query-async-private",
      "facebook-query-user-private",
      "facebook-query-dtsg-private",
      "facebook-query-token-private",
      "facebook-ajax-async-private",
      "facebook-ajax-comet-private",
      "facebook-ajax-jazoest-private",
      "facebook-ajax-secret-private",
      "facebook-cookie-user-private",
      "facebook-cookie-xs-private",
      "facebook-header-token-private",
      "facebook-response-id-private",
      "facebook-response-message-private",
      "facebook-response-profile-private",
      "facebook-response-cursor-private",
      "facebook-response-token-private",
      "facebook-cross-origin-private",
    ]) expect(serialized).not.toContain(forbidden);
  });

  test("parses agent-browser form text and Meta anti-XSSI response envelopes without retaining values", () => {
    const operationName = "CometNewsFeedPaginationQuery";
    const documentId = "9876543210123456789";
    const variables = JSON.stringify({
      count: 10,
      cursor: "facebook-live-cursor-private",
      users: {
        "100012345678901": { name: "facebook-live-profile-private" },
      },
      fb_dtsg: { message: "facebook-live-nested-proof-private" },
    });
    const body = new URLSearchParams([
      ["variables", variables],
      ["doc_id", documentId],
      ["fb_api_req_friendly_name", operationName],
      ["fb_dtsg", "facebook-live-proof-private"],
      ["lsd", "facebook-live-lsd-private"],
      ["access_token", "facebook-live-token-private"],
    ]).toString();
    const response = `for (;;);${JSON.stringify({
      data: {
        result: {
          items: [{ id: "facebook-live-response-private" }],
          paging: { cursor: "facebook-live-next-private" },
        },
      },
    })}`;
    const evidence = analyzeInternalHarValue(har([entry({
      method: "POST",
      url: "https://www.facebook.com/api/graphql/",
      requestText: body,
      responseText: response,
      responseMimeType: "text/html; charset=utf-8",
    })]), "facebook-live-shape", "https://www.facebook.com", new Date("2026-07-24T00:00:00.000Z"));

    const candidate = oneCandidate(evidence);
    expect(candidate).toMatchObject({
      path: "/api/graphql/",
      revisions: [`meta=${operationName}.${documentId}`],
    });
    for (const path of [
      "variables",
      "variables.count",
      "variables.cursor",
      "variables.users",
      "variables.users.:dynamic.name",
      "variables.fb_dtsg",
      "doc_id",
      "fb_api_req_friendly_name",
      "fb_dtsg",
      "lsd",
      ":dynamic",
    ]) expect(candidate.requestFieldPaths).toContain(path);
    expect(candidate.requestFieldPaths).not.toContain("variables.fb_dtsg.message");
    for (const path of [
      "data.result.items[].id",
      "data.result.paging.cursor",
    ]) expect(candidate.responseFieldPaths).toContain(path);

    const serialized = JSON.stringify(evidence);
    for (const forbidden of [
      "facebook-live-cursor-private",
      "100012345678901",
      "facebook-live-profile-private",
      "facebook-live-nested-proof-private",
      "facebook-live-proof-private",
      "facebook-live-lsd-private",
      "facebook-live-token-private",
      "facebook-live-response-private",
      "facebook-live-next-private",
    ]) expect(serialized).not.toContain(forbidden);
  });

  test("keeps same-route Meta operations correlated to their own variables and response shape", () => {
    const firstRevision = "meta=CometNewsFeedPaginationQuery.1111111111111111111";
    const secondRevision = "meta=CometPagesLaunchpointUpdateLastVisitTimeMutation.2222222222222222222";
    const form = (
      friendlyName: string,
      documentId: string,
      variables: Record<string, unknown>,
    ): string => new URLSearchParams([
      ["variables", JSON.stringify(variables)],
      ["fb_api_req_friendly_name", friendlyName],
      ["doc_id", documentId],
    ]).toString();
    const evidence = analyzeInternalHarValue(har([
      entry({
        method: "POST",
        url: "https://www.facebook.com/api/graphql/",
        requestText: form(
          "CometNewsFeedPaginationQuery",
          "1111111111111111111",
          { count: 10, cursor: "first-operation-private" },
        ),
        responseText: `for (;;);${JSON.stringify({
          data: { result: { items: [{ id: "first-response-private" }] } },
        })}`,
        responseMimeType: "text/javascript",
      }),
      entry({
        method: "POST",
        url: "https://www.facebook.com/api/graphql/",
        requestText: form(
          "CometPagesLaunchpointUpdateLastVisitTimeMutation",
          "2222222222222222222",
          { subject: "second-operation-private" },
        ),
        responseText: `for (;;);${JSON.stringify({
          data: { result: { messages: [{ text: "second-response-private" }] } },
        })}`,
        responseMimeType: "text/plain",
      }),
    ]), "facebook-correlated", "https://www.facebook.com", new Date("2026-07-24T00:00:00.000Z"));

    expect(evidence.candidates).toHaveLength(2);
    const first = evidence.candidates.find((candidate) => candidate.revisions.includes(firstRevision));
    const second = evidence.candidates.find((candidate) => candidate.revisions.includes(secondRevision));
    expect(first?.operationType).toBe("unknown");
    expect(second?.operationType).toBe("unknown");
    expect(first?.requestFieldPaths).toContain("variables.count");
    expect(first?.requestFieldPaths).not.toContain("variables.subject");
    expect(first?.responseFieldPaths).toContain("data.result.items[].id");
    expect(first?.responseFieldPaths).not.toContain("data.result.messages");
    expect(second?.requestFieldPaths).toContain("variables.subject");
    expect(second?.requestFieldPaths).not.toContain("variables.count");
    expect(second?.responseFieldPaths).toContain("data.result.messages[].text");
    expect(second?.responseFieldPaths).not.toContain("data.result.items");
    const serialized = JSON.stringify(evidence);
    for (const forbidden of [
      "first-operation-private",
      "first-response-private",
      "second-operation-private",
      "second-response-private",
    ]) expect(serialized).not.toContain(forbidden);
  });

  test("rejects missing, duplicate, malformed, oversized, wrong-method, wrong-route, and cross-origin registered-operation pairs", () => {
    const validPair = [
      { name: "fb_api_req_friendly_name", value: "CometFeedQuery" },
      { name: "doc_id", value: "1234567890" },
    ] as const;
    const invalidEntries = [
      [{ name: "fb_api_req_friendly_name", value: "CometFeedQuery" }],
      [
        ...validPair,
        { name: "fb_api_req_friendly_name", value: "CometFeedQuery" },
      ],
      [
        ...validPair,
        { name: "doc_id", value: "1234567890" },
      ],
      [
        { name: "fb_api_req_friendly_name", value: "1InvalidQuery" },
        { name: "doc_id", value: "1234567890" },
      ],
      [
        { name: "fb_api_req_friendly_name", value: "ab" },
        { name: "doc_id", value: "1234567890" },
      ],
      [
        { name: "fb_api_req_friendly_name", value: `A${"b".repeat(161)}` },
        { name: "doc_id", value: "1234567890" },
      ],
      [
        { name: "fb_api_req_friendly_name", value: "CometFeedQuery" },
        { name: "doc_id", value: "1234" },
      ],
      [
        { name: "fb_api_req_friendly_name", value: "CometFeedQuery" },
        { name: "doc_id", value: "12345notdecimal" },
      ],
      [
        { name: "fb_api_req_friendly_name", value: "CometFeedQuery" },
        { name: "doc_id", value: "1".repeat(33) },
      ],
    ];
    const facebookEvidence = analyzeInternalHarValue(har([
      ...invalidEntries.map((requestParams) => entry({
        method: "POST",
        url: "https://www.facebook.com/api/graphql/",
        requestParams,
        responseJson: { data: {} },
      })),
      entry({
        method: "GET",
        url: "https://www.facebook.com/api/graphql/",
        requestParams: validPair,
        responseJson: { data: {} },
      }),
      entry({
        method: "POST",
        url: "https://www.facebook.com/api/graphql",
        requestParams: validPair,
        responseJson: { data: {} },
      }),
      entry({
        method: "POST",
        url: "https://evil.example/api/graphql/",
        requestParams: validPair,
        responseJson: { data: { message: "cross-origin-private" } },
      }),
      entry({
        url: "https://www.facebook.com/AlicePrivateProfile/100012345678901",
        responseJson: { data: { message: "unknown-route-private" } },
      }),
    ]), "facebook-internal", "https://www.facebook.com", new Date("2026-07-23T12:00:00.000Z"));

    expect(facebookEvidence.candidates.every((candidate) => candidate.revisions.length === 0)).toBeTrue();
    expect(facebookEvidence.candidates.some((candidate) => candidate.path === "/:segment1/:segment2")).toBeTrue();
    expect(JSON.stringify(facebookEvidence)).not.toContain("CometFeedQuery");
    expect(JSON.stringify(facebookEvidence)).not.toContain("cross-origin-private");
    expect(JSON.stringify(facebookEvidence)).not.toContain("AlicePrivateProfile");
    expect(JSON.stringify(facebookEvidence)).not.toContain("100012345678901");
    expect(JSON.stringify(facebookEvidence)).not.toContain("unknown-route-private");

    const alternateOriginEvidence = analyzeInternalHarValue(har([entry({
      method: "POST",
      url: "https://m.facebook.com/api/graphql/",
      requestParams: validPair,
      responseJson: { data: {} },
    })]), "facebook-internal", "https://m.facebook.com", new Date("2026-07-23T12:00:00.000Z"));
    expect(oneCandidate(alternateOriginEvidence).revisions).toEqual([]);
    expect(JSON.stringify(alternateOriginEvidence)).not.toContain("CometFeedQuery");
    expect(JSON.stringify(alternateOriginEvidence)).not.toContain("1234567890");
  });
});

describe("private X internal-API HAR evidence", () => {
});

describe("internal HAR evidence fail-closed boundaries", () => {

  test("redacts opaque and human-readable path segments instead of treating their spelling as route semantics", () => {
    const evidence = analyzeInternalHarValue(har([
      entry({
        url: "https://www.linkedin.com/voyager/api/F2JM9rnivTO",
        responseJson: { data: [] },
      }),
      entry({
        url: "https://www.linkedin.com/messages/Alice",
        responseJson: { data: [] },
      }),
      entry({
        url: "https://www.linkedin.com/voyager/api/voyagerFeedDashMainFeed",
        responseJson: { data: [] },
      }),
    ]), "linkedin-internal", "https://www.linkedin.com", new Date("2026-07-22T00:00:00.000Z"));

    expect(evidence.candidates.map((candidate) => candidate.path)).toEqual([
      "/voyager/api/:segment1",
      "/messages/:segment1",
    ]);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("F2JM9rnivTO");
    expect(serialized).not.toContain("Alice");
    expect(serialized).not.toContain("voyagerFeedDashMainFeed");
  });

  test("redacts dynamic request and response map keys while retaining reviewed structural fields", () => {
    const evidence = analyzeInternalHarValue(har([entry({
      method: "POST",
      url: "https://www.linkedin.com/voyager/api/graphql",
      requestJson: {
        variables: {
          users: {
            Alice: { id: "request-value" },
            F2JM9rnivTO: { name: "request-name" },
          },
        },
      },
      responseJson: {
        data: {
          byId: {
            Alice: { entityUrn: "response-value" },
            F2JM9rnivTO: { subject: "response-subject" },
          },
        },
      },
    })]), "linkedin-internal", "https://www.linkedin.com", new Date("2026-07-22T00:00:00.000Z"));

    const candidate = oneCandidate(evidence);
    expect(candidate.requestFieldPaths).toContain("variables.users.:dynamic.id");
    expect(candidate.responseFieldPaths).toContain("data.byId.:dynamic.entityUrn");
    expect(candidate.responseFieldPaths).toContain("data.byId.:dynamic.subject");
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("Alice");
    expect(serialized).not.toContain("F2JM9rnivTO");
  });

  test("retains only exact reviewed Twitch registered-query revisions", () => {
    const viewerRevision = "a".repeat(64);
    const aboutRevision = "b".repeat(64);
    const request = (operationName: string, variables: Record<string, unknown>, revision: string) => ({
      extensions: { persistedQuery: { sha256Hash: revision, version: 1 } },
      operationName,
      variables,
    });
    const evidence = analyzeInternalHarValue(har([
      entry({
        method: "POST",
        url: "https://gql.twitch.tv/gql",
        requestText: JSON.stringify([
          request("TopNav_CurrentUser", {}, viewerRevision),
        ]),
        requestMimeType: "text/plain; charset=UTF-8",
        responseJson: [{ data: { currentUser: { id: "private-viewer-id" } } }],
      }),
      entry({
        method: "POST",
        url: "https://gql.twitch.tv/gql",
        requestText: JSON.stringify([
          request(
            "ChannelRoot_AboutPanel",
            { channelLogin: "private_target", skipSchedule: true },
            aboutRevision,
          ),
        ]),
        requestMimeType: "text/plain",
        responseJson: [{ data: { user: { followers: { totalCount: 1 } } } }],
      }),
    ]), "twitch-web", "https://gql.twitch.tv", new Date("2026-08-25T00:00:00.000Z"));

    expect(evidence.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operationType: "query",
        revisions: [`twitch=TopNav_CurrentUser.${viewerRevision}`],
      }),
      expect.objectContaining({
        operationType: "query",
        revisions: [`twitch=ChannelRoot_AboutPanel.${aboutRevision}`],
      }),
    ]));
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("UnreviewedOperation");
    expect(serialized).not.toContain("c".repeat(64));
    expect(serialized).not.toContain("private_target");
    expect(serialized).not.toContain("private-viewer-id");

    const viewer = request("TopNav_CurrentUser", {}, viewerRevision);
    const about = request(
      "ChannelRoot_AboutPanel",
      { channelLogin: "private_target", skipSchedule: true },
      aboutRevision,
    );
    const unreviewed = request("UnreviewedOperation", {}, "c".repeat(64));
    for (const malformedBody of [
      [viewer, unreviewed],
      [viewer, about],
      [unreviewed],
      [request(
        "ChannelRoot_AboutPanel",
        { channelLogin: "private_target", skipSchedule: false },
        aboutRevision,
      )],
      [request(
        "ChannelRoot_AboutPanel",
        { channelLogin: "private_target", skipSchedule: true, extra: true },
        aboutRevision,
      )],
      [request("TopNav_CurrentUser", { extra: true }, viewerRevision)],
      [{ ...viewer, unexpected: true }],
      [],
      viewer,
    ]) {
      const failedClosed = analyzeInternalHarValue(har([entry({
        method: "POST",
        url: "https://gql.twitch.tv/gql",
        requestText: JSON.stringify(malformedBody),
        requestMimeType: "text/plain",
        responseJson: [{ data: {} }],
      })]), "twitch-web", "https://gql.twitch.tv", new Date("2026-08-25T00:00:00.000Z"));
      expect(oneCandidate(failedClosed).revisions).toEqual([]);
      expect(oneCandidate(failedClosed).operationType).toBe("unknown");
    }
  });

  test("property: arbitrary identifier-shaped path segments and JSON map keys never survive evidence", () => {
    const suffix = fc.array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), {
      minLength: 3,
      maxLength: 30,
    }).map((characters) => characters.join(""));
    assertProperty(fc.property(suffix, (generatedSuffix) => {
      const dynamicValue = `Content${generatedSuffix}`;
      const evidence = analyzeInternalHarValue(har([entry({
        method: "POST",
        url: `https://www.linkedin.com/messages/${dynamicValue}`,
        requestJson: { variables: { users: { [dynamicValue]: { id: "request-value" } } } },
        responseJson: { data: { byId: { [dynamicValue]: { name: "response-value" } } } },
      })]), "linkedin-internal", "https://www.linkedin.com", new Date("2026-07-22T00:00:00.000Z"));

      const candidate = oneCandidate(evidence);
      expect(candidate.path).toBe("/messages/:segment1");
      expect(candidate.requestFieldPaths).toContain("variables.users.:dynamic.id");
      expect(candidate.responseFieldPaths).toContain("data.byId.:dynamic.name");
      expect(JSON.stringify(evidence)).not.toContain(dynamicValue);
    }));

    assertProperty(fc.property(
      fc.constantFrom("body", "data", "id", "messages", "name", "subject", "text", "users"),
      (dynamicValue) => {
        const evidence = analyzeInternalHarValue(har([entry({
          url: "https://www.linkedin.com/voyager/api/graphql",
          responseJson: { data: { users: { [dynamicValue]: { entityUrn: "response-value" } } } },
        })]), "linkedin-internal", "https://www.linkedin.com", new Date("2026-07-22T00:00:00.000Z"));
        const candidate = oneCandidate(evidence);
        expect(candidate.responseFieldPaths).toContain("data.users.:dynamic.entityUrn");
        expect(candidate.responseFieldPaths).not.toContain(`data.users.${dynamicValue}`);
      },
    ));

    assertProperty(fc.property(suffix, (generatedSuffix) => {
      const dynamicHeaderName = `x-user-${generatedSuffix}`.toLowerCase();
      const evidence = analyzeInternalHarValue(har([entry({
        url: "https://www.linkedin.com/voyager/api/graphql",
        requestHeaders: [{ name: dynamicHeaderName, value: "header-value" }],
        responseJson: { data: [] },
      })]), "linkedin-internal", "https://www.linkedin.com", new Date("2026-07-22T00:00:00.000Z"));
      expect(oneCandidate(evidence).headerNames).toEqual([":dynamic"]);
      expect(JSON.stringify(evidence)).not.toContain(dynamicHeaderName);
    }));
  });
});
