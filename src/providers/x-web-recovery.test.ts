import { describe, expect, test } from "bun:test";
import { assertAsyncProperty, fc } from "../test-support";
import type { CookieRecordReader } from "@hraness/wordcell/clip/acquire";
import type { StrictCookie } from "@hraness/wordcell/clip/cookies";
import type { GhostgetAuth } from "../auth";
import { canonicalJson } from "../canonical-json";
import type { OperationInput, WebSessionRecipe } from "../model";
import {
  readXWebDesiredState,
  readXWebFollowingState,
  readXWebPublishedMutationTarget,
  type XWebRuntimeDependencies,
} from "./x-web-runtime";

const MAIN = "https://abs.twimg.com/responsive-web/client-web/main.abcdef12.js";
const ACTOR = "123456789012345678";
const POST = "2078889282404569266";
const PARENT = "2078889282404569265";
const USER = "998877665544332211";
const TEXT = "One exact quote";
const auth = { schemaVersion: 1, id: "x-test", kind: "cookie-source", source: "arc", profile: "Profile 1", subject: ACTOR } as const satisfies GhostgetAuth;
const recipe = (action: WebSessionRecipe["action"], contractVersion: number): WebSessionRecipe => ({
  site: "x", action, contractVersion, timeoutMs: 1_000, maxOutputBytes: 2 * 1024 * 1024,
});
const accepted = canonicalJson({ postId: POST, mediaId: null });
const descriptor = (name: string, id: string) => `queryId:"${id}",operationName:"${name}",operationType:"query",metadata:{featureSwitches:[],fieldToggles:[]}`;
const FOLLOW_FEATURES = ["hidden_profile_subscriptions_enabled", "profile_label_improvements_pcf_label_in_post_enabled",
  "responsive_web_profile_redirect_enabled", "rweb_tipjar_consumption_enabled", "verified_phone_label_enabled",
  "highlights_tweets_tab_ui_enabled", "responsive_web_twitter_article_notes_tab_enabled", "subscriptions_feature_can_gift_premium",
  "creator_subscriptions_tweet_preview_api_enabled", "responsive_web_graphql_timeline_navigation_enabled"];
const followDescriptor = (metadataDrift = false) => `queryId:"mxaYWwt52eAb6OAzYHMVzg",operationName:"UserByRestId",operationType:"query",metadata:{featureSwitches:${JSON.stringify(metadataDrift ? [] : FOLLOW_FEATURES)},fieldToggles:["withPayments","withDmBlocks","withAuxiliaryUserLabels"]}`;

function tweet(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { __typename: "Tweet", rest_id: POST, legacy: { full_text: TEXT,
    quoted_status_id_str: PARENT, retweeted: false },
    core: { user_results: { result: { __typename: "User", rest_id: ACTOR } } }, ...overrides };
}
function user(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { __typename: "User", rest_id: USER, follow_request_sent: false,
    relationship_perspectives: { following: false }, ...overrides };
}
type Request = { url: URL; method: string; headers: Headers; body: RequestInit["body"] };
function transport(options: {
  tweet?: unknown;
  user?: unknown;
  viewer?: string;
  afterViewer?: string;
  metadataDrift?: boolean;
  responseErrors?: boolean;
} = {}) {
  const calls: Request[] = [];
  let transactions = 0;
  let viewerReads = 0;
  let cookieReads = 0;
  const cookie = (name: string, value: string): StrictCookie => ({ name, value, domain: ".x.com", hostOnly: false,
    path: "/", secure: true, httpOnly: true, sameSite: "Lax", expires: 0 });
  const acquireCookies: CookieRecordReader = async () => {
    cookieReads++;
    return { cookies: [cookie("ct0", "csrf_token_0123456789abcdef"), cookie("auth_token", "synthetic-auth-cookie")], warnings: [] };
  };
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  const dependencies: XWebRuntimeDependencies = {
    acquireCookies,
    createBrowserSession: async () => { transactions++; throw new Error("Recovery must never acquire a transaction browser"); },
    fetch: (async (value: string | URL | globalThis.Request, init?: RequestInit) => {
      const url = new URL(typeof value === "string" ? value : value instanceof URL ? value.href : value.url);
      calls.push({ url, method: init?.method ?? "GET", headers: new Headers(init?.headers), body: init?.body });
      if (url.href === "https://x.com/home") return new Response(`<!doctype html><script src="${MAIN}"></script><script>window.__INITIAL_STATE__={"featureSwitch":{"user":{"config":{}}}};window.__META_DATA__={};</script>`, { headers: { "content-type": "text/html" } });
      if (url.href === MAIN) return new Response([
        `const authorization="AAAA${"b".repeat(88)}=="`,
        descriptor("Viewer", "TpQxQtWMTMnIAMPlMGMqNw"),
        descriptor("TweetResultByRestId", "CxpIrb-Lt2oBpojNjvDatg"), followDescriptor(options.metadataDrift),
      ].join(";"), { headers: { "content-type": "application/javascript" } });
      if (url.pathname.endsWith("/Viewer")) {
        const id = viewerReads++ > 0 ? options.afterViewer ?? options.viewer ?? ACTOR : options.viewer ?? ACTOR;
        return json({ data: { viewer: { user_results: { result: { rest_id: id, core: { screen_name: "synthetic" } } } } } });
      }
      if (url.pathname.endsWith("/TweetResultByRestId")) return json({ data: { tweetResult: { result: options.tweet ?? tweet() } },
        ...(options.responseErrors ? { errors: [{ code: 1 }] } : {}) });
      if (url.pathname.endsWith("/UserByRestId")) return json({ data: { user: { result: options.user ?? user() } },
        ...(options.responseErrors ? { errors: [{ code: 1 }] } : {}) });
      throw new Error("Recovery attempted an unreviewed route");
    }) as typeof globalThis.fetch,
  };
  return { calls, dependencies, counts: () => ({ transactions, cookieReads, viewerReads }) };
}
function assertOnlyReads(observed: ReturnType<typeof transport>, target: "TweetResultByRestId" | "UserByRestId") {
  expect(observed.calls.every(call => call.method === "GET" && call.body === undefined)).toBeTrue();
  expect(observed.calls.every(call => call.headers.get("x-client-transaction-id") === null)).toBeTrue();
  expect(observed.calls.filter(call => call.url.pathname.endsWith(`/${target}`))).toHaveLength(1);
  expect(observed.calls.filter(call => call.url.pathname.endsWith("/Viewer"))).toHaveLength(2);
  expect(observed.calls.every(call => call.url.href === "https://x.com/home" || call.url.href === MAIN
    || call.url.pathname.endsWith("/Viewer") || call.url.pathname.endsWith(`/${target}`))).toBeTrue();
  expect(observed.counts().transactions).toBe(0);
}
function noAuthority() {
  let effects = 0;
  const refuse = async (): Promise<never> => { effects++; throw new Error("Input must refuse before authority"); };
  return { dependencies: { acquireCookies: refuse, fetch: refuse, createBrowserSession: refuse } satisfies XWebRuntimeDependencies,
    effects: () => effects };
}

describe("X qualified quote recovery", () => {
  test("binds text, author, parent and exact scalar accepted target using independent reads only", async () => {
    const observed = transport();
    expect(await readXWebPublishedMutationTarget(recipe("posts.quote", 3), { body: TEXT, post_id: PARENT }, auth,
      accepted, observed)).toEqual({ present: true, postId: POST });
    assertOnlyReads(observed, "TweetResultByRestId");
    const read = observed.calls.find(call => call.url.pathname.endsWith("/TweetResultByRestId"))!;
    expect(JSON.parse(read.url.searchParams.get("variables")!)).toEqual({ tweetId: POST, withCommunity: false,
      includePromotedContent: false, withVoice: false });
  });

  test("does not decode expected authored copy or strip an arbitrary terminal quote URL", async () => {
    const wire = transport({ tweet: tweet({ legacy: { full_text: "literal &amp;gt;", user_id_str: ACTOR,
      quoted_status_id_str: PARENT } }) });
    expect(await readXWebPublishedMutationTarget(recipe("posts.quote", 3), { body: "literal &gt;", post_id: PARENT }, auth,
      accepted, wire)).toEqual({ present: true, postId: POST });
    const suffix = transport({ tweet: tweet({ legacy: { full_text: `${TEXT} https://t.co/quote`, user_id_str: ACTOR,
      quoted_status_id_str: PARENT } }) });
    await expect(readXWebPublishedMutationTarget(recipe("posts.quote", 3), { body: TEXT, post_id: PARENT }, auth,
      accepted, suffix)).rejects.toThrow("confirmed text");
  });

  test("rejects target, actor, text, quote, reply, media and unavailable-result drift", async () => {
    const legacy = tweet().legacy as Record<string, unknown>;
    for (const result of [tweet({ rest_id: PARENT }),
      ...[USER, null, true].map(user_id_str => tweet({ legacy: { ...legacy, user_id_str } })),
      ...[undefined, {}, { user_results: { result: { rest_id: USER } } },
        { user_results: { result: { rest_id: null } } },
        { user_results: { result: { rest_id: ACTOR, __typename: "UserUnavailable" } } }]
        .map(core => tweet({ core })),
      tweet({ legacy: { ...legacy, full_text: "changed" } }), tweet({ legacy: { ...legacy, quoted_status_id_str: POST } }),
      tweet({ legacy: { ...legacy, quoted_status_id_str: undefined } }),
      tweet({ legacy: { ...legacy, in_reply_to_status_id_str: PARENT } }),
      tweet({ legacy: { ...legacy, entities: { media: [{ id_str: "123", type: "photo" }] } } }),
      tweet({ __typename: "TweetUnavailable" }), tweet({ __typename: undefined })]) {
      const observed = transport({ tweet: result });
      await expect(readXWebPublishedMutationTarget(recipe("posts.quote", 3), { body: TEXT, post_id: PARENT }, auth,
        accepted, observed)).rejects.toThrow();
      expect(observed.calls.every(call => call.method === "GET")).toBeTrue();
      expect(observed.counts().transactions).toBe(0);
    }
    for (const drift of [{ viewer: USER }, { afterViewer: USER }]) {
      const observed = transport(drift);
      await expect(readXWebPublishedMutationTarget(recipe("posts.quote", 3), { body: TEXT, post_id: PARENT }, auth,
        accepted, observed)).rejects.toThrow("viewer no longer matches");
      expect(observed.counts().transactions).toBe(0);
    }
  });

  test("refuses unsupported versions, cross-route inputs and noncanonical targets before auth", async () => {
    const observed = noAuthority();
    for (const version of [0, 1, 2, 4, -1, 1.5, Number.NaN]) {
      await expect(readXWebPublishedMutationTarget(recipe("posts.quote", version), { body: TEXT, post_id: PARENT }, auth,
        accepted, observed)).rejects.toThrow("supports only");
    }
    for (const input of [{ body: TEXT }, { body: TEXT, post_id: "1".repeat(20) }, { body: "", post_id: PARENT },
      { body: TEXT, post_id: PARENT, media: { kind: "file" as const, reference: "fixture" } },
      { body: TEXT, post_id: PARENT, media_type: "image/png" }, { body: TEXT, post_id: PARENT, media_types: [] },
      { body: TEXT, post_id: PARENT, reply_to: POST }, { body: TEXT, post_id: PARENT, items: [TEXT] }]) {
      await expect(readXWebPublishedMutationTarget(recipe("posts.quote", 3), input, auth, accepted, observed)).rejects.toThrow();
    }
    for (const identifier of [`${accepted} `, JSON.stringify({ postId: POST, mediaId: null }),
      canonicalJson({ postId: POST, mediaIds: [] }), canonicalJson({ postId: POST, mediaId: "123" }),
      canonicalJson({ postId: POST, mediaId: null, extra: true }), canonicalJson({ postId: "x", mediaId: null }),
      `{${" ".repeat(1_025)}}`]) {
      await expect(readXWebPublishedMutationTarget(recipe("posts.quote", 3), { body: TEXT, post_id: PARENT }, auth,
        identifier, observed)).rejects.toThrow();
    }
    expect(observed.effects()).toBe(0);
  });

  test("arbitrary extra quote input keys always refuse before auth", async () => {
    await assertAsyncProperty(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }).filter(key => !["body", "post_id"].includes(key)),
      async key => {
        const observed = noAuthority();
        const input: OperationInput = { body: TEXT, post_id: PARENT, [key]: true };
        await expect(readXWebPublishedMutationTarget(recipe("posts.quote", 3), input, auth, accepted, observed)).rejects.toThrow();
        expect(observed.effects()).toBe(0);
      }), { numRuns: 100 });
  });
});

describe("X qualified repost recovery", () => {
  for (const reposted of [true, false]) test(`observes actual repost=${reposted} independently of desired state`, async () => {
    const observed = transport({ tweet: tweet({ legacy: { retweeted: reposted } }) });
    expect(await readXWebDesiredState(recipe("posts.repost", 2), { post_id: POST, reposted: !reposted }, auth,
      observed)).toEqual({ kind: "repost", enabled: reposted, postId: POST });
    assertOnlyReads(observed, "TweetResultByRestId");
  });

  test("preserves the prior like and bookmark read paths", async () => {
    for (const [action, version, input, field, kind] of [
      ["likes.set", 1, { post_id: POST, liked: true }, "favorited", "like"],
      ["likes.set", 2, { post_id: POST, liked: true }, "favorited", "like"],
      ["content.save", 1, { post_id: POST, saved: true }, "bookmarked", "bookmark"],
    ] as const) {
      const observed = transport({ tweet: tweet({ legacy: { [field]: false } }) });
      expect(await readXWebDesiredState(recipe(action, version), input, auth, observed)).toEqual({ kind, enabled: false, postId: POST });
      expect(observed.calls.every(call => call.method === "GET")).toBeTrue();
      expect(observed.counts().transactions).toBe(0);
    }
  });

  test("refuses target, type, state, error and viewer drift without mutations", async () => {
    for (const options of [{ tweet: tweet({ rest_id: PARENT }) }, { tweet: tweet({ __typename: "TweetUnavailable" }) },
      { tweet: tweet({ __typename: undefined }) }, { tweet: tweet({ legacy: { retweeted: "true" } }) },
      { tweet: tweet({ legacy: { favorited: true } }) }, { tweet: tweet({ legacy: { retweeted: null } }) },
      { responseErrors: true }, { viewer: USER }, { afterViewer: USER }]) {
      const observed = transport(options);
      await expect(readXWebDesiredState(recipe("posts.repost", 2), { post_id: POST, reposted: true }, auth,
        observed)).rejects.toThrow();
      expect(observed.calls.every(call => call.method === "GET")).toBeTrue();
      expect(observed.counts().transactions).toBe(0);
    }
  });

  test("closes versions, exact fields and canonical targets before auth", async () => {
    const observed = noAuthority();
    for (const version of [0, 1, 3, -1, 1.5, Number.NaN]) {
      await expect(readXWebDesiredState(recipe("posts.repost", version), { post_id: POST, reposted: true }, auth,
        observed)).rejects.toThrow("supports only");
    }
    for (const input of [{ post_id: POST }, { post_id: POST, reposted: "true" }, { post_id: "1".repeat(20), reposted: true },
      { post_id: "123&other=456", reposted: true }, { post_id: POST, reposted: true, dark_request: false },
      { post_id: POST, reposted: true, media: [] }]) {
      await expect(readXWebDesiredState(recipe("posts.repost", 2), input, auth, observed)).rejects.toThrow();
    }
    for (const [action, version, input] of [
      ["likes.set", 3, { post_id: POST, liked: true }], ["content.save", 2, { post_id: POST, saved: true }],
      ["likes.set", 2, { post_id: POST, liked: "true" }], ["content.save", 1, { post_id: "bad", saved: true }],
      ["content.save", 1, { post_id: POST, saved: true, reposted: true }],
    ] as const) await expect(readXWebDesiredState(recipe(action, version), input, auth, observed)).rejects.toThrow();
    expect(observed.effects()).toBe(0);
  });
});

describe("X qualified follow recovery", () => {
  for (const following of [true, false]) test(`observes actual following=${following} through only the fixed numeric read`, async () => {
    const observed = transport({ user: user({ relationship_perspectives: { following } }) });
    expect(await readXWebFollowingState(recipe("relationships.follow.set", 2), { user_id: USER, following: !following }, auth,
      observed)).toEqual({ userId: USER, following });
    assertOnlyReads(observed, "UserByRestId");
    const read = observed.calls.find(call => call.url.pathname.endsWith("/UserByRestId"))!;
    expect(read.url.pathname).toBe("/i/api/graphql/mxaYWwt52eAb6OAzYHMVzg/UserByRestId");
    expect([...read.url.searchParams.keys()].sort()).toEqual(["features", "variables"]);
    expect(JSON.parse(read.url.searchParams.get("variables")!)).toEqual({ userId: USER });
    expect(Object.keys(JSON.parse(read.url.searchParams.get("features")!))).toEqual(FOLLOW_FEATURES);
  });

  test("refuses pending, unknown, contradictory, unavailable and wrong-target follow state", async () => {
    for (const result of [user({ rest_id: POST }), user({ __typename: "UserUnavailable" }), user({ __typename: undefined }),
      { __typename: "UserWithVisibilityResults", user: user() }, user({ relationship_perspectives: { following: "false" } }),
      user({ relationship_perspectives: {} }), user({ follow_request_sent: true }), user({ follow_request_sent: undefined }),
      user({ follow_request_sent: null }), user({ follow_request_sent: "false" }),
      user({ legacy: { following: true } }), user({ legacy: { follow_request_sent: true } })]) {
      const observed = transport({ user: result });
      await expect(readXWebFollowingState(recipe("relationships.follow.set", 2), { user_id: USER, following: true }, auth,
        observed)).rejects.toThrow();
      expect(observed.calls.every(call => call.method === "GET")).toBeTrue();
      expect(observed.counts().transactions).toBe(0);
    }
  });

  test("refuses actor, metadata and provider error drift without mutation or transaction helpers", async () => {
    for (const options of [{ viewer: USER }, { afterViewer: USER }, { metadataDrift: true }, { responseErrors: true }]) {
      const observed = transport(options);
      await expect(readXWebFollowingState(recipe("relationships.follow.set", 2), { user_id: USER, following: true }, auth,
        observed)).rejects.toThrow();
      expect(observed.calls.every(call => call.method === "GET")).toBeTrue();
      expect(observed.counts().transactions).toBe(0);
      if (options.metadataDrift) expect(observed.calls.some(call => call.url.pathname.endsWith("/UserByRestId"))).toBeFalse();
    }
  });

  test("refuses unrelated operations, versions and malformed inputs before auth", async () => {
    const observed = noAuthority();
    for (const version of [0, 1, 3, -1, 1.5, Number.NaN]) {
      await expect(readXWebFollowingState(recipe("relationships.follow.set", version), { user_id: USER, following: true }, auth,
        observed)).rejects.toThrow("supports only");
    }
    for (const input of [{ user_id: USER }, { user_id: USER, following: "true" }, { user_id: "1".repeat(20), following: true },
      { user_id: "123&other=456", following: true }, { user_id: USER, following: true, screen_name: "other" },
      { user_id: USER, following: true, post_id: POST }]) {
      await expect(readXWebFollowingState(recipe("relationships.follow.set", 2), input, auth, observed)).rejects.toThrow();
    }
    await expect(readXWebFollowingState(recipe("profiles.read", 2), { user_id: USER, following: true }, auth,
      observed)).rejects.toThrow("supports only");
    await expect(readXWebFollowingState({ ...recipe("relationships.follow.set", 2), site: "bluesky" },
      { user_id: USER, following: true }, auth, observed)).rejects.toThrow("supports only");
    expect(observed.effects()).toBe(0);
  });
});
