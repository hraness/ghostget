import { describe, expect, test } from "bun:test";

import type { GhostgetAuth } from "../auth";
import type { BrowserSession } from "../browser";
import {
  createLinkedInCommentBrowserTransport,
  LinkedInCommentCreateResponseError,
} from "./linkedin-web-comment-browser";

const auth = {
  schemaVersion: 1,
  id: "linkedin-comment-browser-test",
  kind: "browser-profile",
  profile: "Disposable LinkedIn",
  browserExecutable: "/Applications/Chromium.app/Contents/MacOS/Chromium",
  trustUnfilteredEgress: true,
  subject: "urn:li:fsd_profile:123456789",
} as const satisfies GhostgetAuth;

const MEMBER_URN = "urn:li:fsd_profile:123456789";
const PROFILE_URN = "urn:li:fsd_profile:ACoAAExactCurrentProfile";
const MINI_PROFILE_URN = "urn:li:fs_miniProfile:ACoAAExactCurrentProfile";
const POST_URN = "urn:li:activity:7511809736883855360";
const PARENT_URN = "urn:li:comment:(activity:7511809736883855360,7511809736883855999)";
const QUERY_ID = "voyagerSocialDashComments.00112233445566778899aabbccddeeff";
const STALE_PAGE_INSTANCE = "urn:li:page:d_flagship3_stale;stale==";
const FRESH_PAGE_INSTANCE = "urn:li:page:d_flagship3_profile_view_base_recent_activity;fresh==";
const staleTrack = JSON.stringify({ mpName: "voyager-web", request: "stale" });
const freshTrack = JSON.stringify({ mpName: "voyager-web", request: "fresh" });

function browserRecord(
  result: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    success: true,
    result: { origin: "https://www.linkedin.com", result },
  };
}

function sourceInput(source: string): Readonly<Record<string, unknown>> {
  const match = /const input=(\{.*?\});if\(location\.origin/u.exec(source);
  if (match?.[1] === undefined) throw new Error("missing LinkedIn evaluation input");
  return JSON.parse(match[1]) as Readonly<Record<string, unknown>>;
}

function identityBody(vanity = "hraness"): unknown {
  return {
    data: { plainId: "123456789", "*miniProfile": MINI_PROFILE_URN },
    included: [{ entityUrn: MINI_PROFILE_URN, publicIdentifier: vanity }],
  };
}

function requestRecord(
  url: string,
  pageInstance: string,
  track: string,
): Readonly<Record<string, unknown>> {
  return {
    method: "GET",
    status: 200,
    url,
    headers: {
      "x-li-page-instance": pageInstance,
      "x-li-track": track,
    },
  };
}

const STALE_COMMENTS_URL =
  `https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(count:2,numReplies:1,socialDetailUrn:urn%3Ali%3Afsd_socialDetail%3A%28x%29,sortOrder:RELEVANCE,start:0)&queryId=${QUERY_ID}`;
const FRESH_COMMENTS_URL =
  `https://www.linkedin.com/voyager/api/graphql?includeWebMetadata=true&variables=(count:2,numReplies:1,socialDetailUrn:urn%3Ali%3Afsd_socialDetail%3A%28y%29,sortOrder:RELEVANCE,start:0)&queryId=${QUERY_ID}`;

function preTriggerRecord(): Readonly<Record<string, unknown>> {
  return {
    success: true,
    result: {
      requests: [
        requestRecord(STALE_COMMENTS_URL, STALE_PAGE_INSTANCE, staleTrack),
      ],
    },
  };
}

function postTriggerRecord(): Readonly<Record<string, unknown>> {
  return {
    success: true,
    result: {
      requests: [
        requestRecord(STALE_COMMENTS_URL, STALE_PAGE_INSTANCE, staleTrack),
        requestRecord(FRESH_COMMENTS_URL, FRESH_PAGE_INSTANCE, freshTrack),
      ],
    },
  };
}

type SessionStubOptions = Readonly<{
  clicked?: boolean;
  createResult?: Readonly<Record<string, unknown>>;
  createThrows?: Error;
  identityBody?: unknown;
  identityStatus?: number;
  readResult?: Readonly<Record<string, unknown>>;
}>;

function sessionStub(options: SessionStubOptions, captured: {
  createInput?: Readonly<Record<string, unknown>>;
  createSource?: string;
  readInput?: Readonly<Record<string, unknown>>;
  networkCalls: number;
}): { session: BrowserSession; closed: { value: boolean }; cleaned: { value: boolean } } {
  const closed = { value: false };
  const cleaned = { value: false };
  const session: BrowserSession = {
    runBatch: (commands) => {
      const first = commands[0];
      if (first?.[0] === "open") {
        expect(commands).toEqual([
          ["open", "https://www.linkedin.com/feed/"],
          ["wait", "5000"],
        ]);
        return Promise.resolve([{ success: true, result: { opened: true } }]);
      }
      if (first?.[0] === "network") {
        captured.networkCalls += 1;
        return Promise.resolve([
          captured.networkCalls === 1 ? preTriggerRecord() : postTriggerRecord(),
        ]);
      }
      if (
        commands.some((candidate) => candidate[0] !== "eval" && candidate[0] !== "wait")
      ) {
        throw new Error("unexpected LinkedIn comment browser command");
      }
      const source = String(first?.[1] ?? "");
      if (source.includes("return{body,contentType")) {
        return Promise.resolve([browserRecord({
          body: options.identityBody ?? identityBody(),
          contentType: "application/vnd.linkedin.normalized+json+2.1",
          status: options.identityStatus ?? 200,
        })]);
      }
      if (source.includes("input.activityUrl")) {
        return Promise.resolve([
          browserRecord({ navigated: true }),
          { success: true, result: { waited: true } },
        ]);
      }
      if (source.includes("comments? on ")) {
        return Promise.resolve([
          browserRecord({ clicked: options.clicked ?? true }),
          { success: true, result: { waited: true } },
        ]);
      }
      if (source.includes("fetch(input.createPath")) {
        if (options.createThrows !== undefined) {
          return Promise.reject(options.createThrows);
        }
        captured.createSource = source;
        captured.createInput = sourceInput(source);
        return Promise.resolve([browserRecord(options.createResult ?? {
          contentType: "application/vnd.linkedin.normalized+json+2.1",
          restliId: `urn:li:fsd_comment:(9001,${POST_URN})`,
          status: 201,
          text: JSON.stringify({
            data: {
              entityUrn: `urn:li:fsd_normComment:urn:li:fsd_comment:(9001,${POST_URN})`,
            },
          }),
        })]);
      }
      if (source.includes("requestJson(input.readPath")) {
        captured.readInput = sourceInput(source);
        return Promise.resolve([browserRecord(options.readResult ?? {
          comments: [{
            actorUrn: PROFILE_URN,
            text: "bounded comment",
            urn: `urn:li:fsd_comment:(9001,${POST_URN})`,
            urns: [`urn:li:fsd_comment:(9001,${POST_URN})`],
          }],
        })]);
      }
      throw new Error("unexpected LinkedIn comment evaluation source");
    },
    close: () => {
      closed.value = true;
      return Promise.resolve();
    },
    cleanup: () => {
      cleaned.value = true;
      return Promise.resolve();
    },
  };
  return { session, closed, cleaned };
}

describe("LinkedIn native comment contained-browser transport", () => {
  test("creates one comment with the fresh post-trigger bindings and binds its accepted target", async () => {
    const captured = { networkCalls: 0 } as {
      createInput?: Readonly<Record<string, unknown>>;
      createSource?: string;
      networkCalls: number;
      readInput?: Readonly<Record<string, unknown>>;
    };
    const { session, closed, cleaned } = sessionStub({}, captured);
    const transport = await createLinkedInCommentBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await transport.currentIdentityResponse();
    const created = await transport.createComment(MEMBER_URN, PROFILE_URN, {
      body: {
        commentary: {
          $type: "com.linkedin.voyager.dash.common.text.TextViewModel",
          attributesV2: [],
          text: "bounded comment",
        },
        threadUrn: POST_URN,
      },
      kind: "comment",
      postUrn: POST_URN,
    });
    expect(created).toEqual({
      commentUrn: `urn:li:fsd_comment:(9001,${POST_URN})`,
      entityConfirmed: true,
      status: 201,
    });
    expect(captured.createInput).toMatchObject({
      pageInstance: FRESH_PAGE_INSTANCE,
      pemMetadata: "Voyager - Feed - Comments=create-a-comment",
      referrer: "https://www.linkedin.com/in/hraness/recent-activity/all/",
      track: freshTrack,
    });
    expect(captured.createInput?.createPath).toBe(
      "/voyager/api/voyagerSocialDashNormComments"
        + "?decorationId=com.linkedin.voyager.dash.deco.social.NormComment-44",
    );
    expect(captured.createSource).toContain('delete mutationHeaders["x-requested-with"]');
    await transport.close();
    expect(closed.value).toBeTrue();
    expect(cleaned.value).toBeTrue();
  });

  test("creates one reply bound to the exact parent comment thread", async () => {
    const captured = { networkCalls: 0 } as {
      createInput?: Readonly<Record<string, unknown>>;
      networkCalls: number;
    };
    const { session } = sessionStub({}, captured);
    const transport = await createLinkedInCommentBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await transport.currentIdentityResponse();
    const created = await transport.createComment(MEMBER_URN, PROFILE_URN, {
      body: {
        commentary: {
          $type: "com.linkedin.voyager.dash.common.text.TextViewModel",
          attributesV2: [],
          text: "bounded reply",
        },
        threadUrn: PARENT_URN,
      },
      kind: "reply",
      postUrn: POST_URN,
    });
    expect(created.status).toBe(201);
    expect(captured.createInput).toMatchObject({
      pemMetadata: "Voyager - Feed - Comments=create-a-comment-reply",
      pageInstance: FRESH_PAGE_INSTANCE,
    });
    expect((captured.createInput?.body as { threadUrn?: string }).threadUrn)
      .toBe(PARENT_URN);
    await transport.close();
  });

  test("rejects a created identity bound to another thread", async () => {
    const captured = { networkCalls: 0 };
    const { session } = sessionStub({
      createResult: {
        contentType: "application/vnd.linkedin.normalized+json+2.1",
        restliId: "urn:li:fsd_comment:(9001,urn:li:activity:1)",
        status: 201,
        text: "{}",
      },
    }, captured);
    const transport = await createLinkedInCommentBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await transport.currentIdentityResponse();
    await expect(transport.createComment(MEMBER_URN, PROFILE_URN, {
      body: {},
      kind: "comment",
      postUrn: POST_URN,
    })).rejects.toThrow("mismatched thread binding");
    await transport.close();
  });

  test("wraps dispatch-evaluation failure in the create-response error without browser detail", async () => {
    const captured = { networkCalls: 0 };
    const { session } = sessionStub({
      createThrows: new Error("private browser evaluation detail"),
    }, captured);
    const transport = await createLinkedInCommentBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await transport.currentIdentityResponse();
    try {
      await transport.createComment(MEMBER_URN, PROFILE_URN, {
        body: {},
        kind: "comment",
        postUrn: POST_URN,
      });
      throw new Error("expected LinkedIn comment create failure");
    } catch (error) {
      expect(error).toBeInstanceOf(LinkedInCommentCreateResponseError);
      expect(error).toMatchObject({ stage: "comment create response" });
      expect((error as Error).message).not.toContain("private browser evaluation detail");
    }
    await transport.close();
  });

  test("fails closed when the comments trigger finds no reviewed control", async () => {
    const captured = { networkCalls: 0 };
    const { session } = sessionStub({ clicked: false }, captured);
    const transport = await createLinkedInCommentBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await transport.currentIdentityResponse();
    await expect(transport.readComments(MEMBER_URN, PROFILE_URN, {
      count: 20,
      maxComments: 20,
      numReplies: 1,
      postUrn: POST_URN,
      queryId: QUERY_ID,
      start: 0,
    })).rejects.toThrow("found no reviewed comments control");
    await transport.close();
  });

  test("reads comments through the strict-encoded reviewed variables and fresh donor bindings", async () => {
    const captured = { networkCalls: 0 } as {
      networkCalls: number;
      readInput?: Readonly<Record<string, unknown>>;
    };
    const { session } = sessionStub({}, captured);
    const transport = await createLinkedInCommentBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await transport.currentIdentityResponse();
    const result = await transport.readComments(MEMBER_URN, PROFILE_URN, {
      count: 20,
      maxComments: 20,
      numReplies: 1,
      postUrn: POST_URN,
      queryId: QUERY_ID,
      start: 0,
    }) as { comments: readonly unknown[] };
    expect(result.comments).toHaveLength(1);
    const readPath = String(captured.readInput?.readPath);
    expect(readPath).toContain("includeWebMetadata=true");
    expect(readPath).toContain(`queryId=${QUERY_ID}`);
    expect(readPath).toContain("count:20,numReplies:1");
    expect(readPath).toContain(
      "socialDetailUrn:urn%3Ali%3Afsd_socialDetail%3A%28"
        + "urn%3Ali%3Aactivity%3A7511809736883855360%2C"
        + "urn%3Ali%3Aactivity%3A7511809736883855360%2C"
        + "urn%3Ali%3AhighlightedReply%3A-%29",
    );
    expect(readPath).not.toContain("%3A(");
    expect(captured.readInput).toMatchObject({
      pageInstance: FRESH_PAGE_INSTANCE,
      referrer: "https://www.linkedin.com/in/hraness/recent-activity/all/",
      track: freshTrack,
    });
    expect(captured.readInput).not.toHaveProperty("pemMetadata");
    await transport.close();
  });

  test("rejects reads after close and refuses unbound member identifiers", async () => {
    const captured = { networkCalls: 0 };
    const { session } = sessionStub({
      identityBody: { data: { plainId: "123456789" } },
    }, captured);
    const transport = await createLinkedInCommentBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await transport.currentIdentityResponse();
    await expect(transport.readComments(MEMBER_URN, PROFILE_URN, {
      count: 20,
      maxComments: 20,
      numReplies: 1,
      postUrn: POST_URN,
      queryId: QUERY_ID,
      start: 0,
    })).rejects.toThrow("omitted its profile identifier");
    await transport.close();
    await expect(transport.readComments(MEMBER_URN, PROFILE_URN, {
      count: 20,
      maxComments: 20,
      numReplies: 1,
      postUrn: POST_URN,
      queryId: QUERY_ID,
      start: 0,
    })).rejects.toThrow("transport is closed");
  });

  test("rejects an unreviewed current-member response status", async () => {
    const captured = { networkCalls: 0 };
    const { session } = sessionStub({ identityStatus: 403 }, captured);
    const transport = await createLinkedInCommentBrowserTransport(auth, {
      timeoutMs: 10_000,
      dependencies: { createBrowserSession: () => Promise.resolve(session) },
    });
    await expect(transport.currentIdentityResponse())
      .rejects.toThrow("unreviewed response");
    await transport.close();
  });
});
