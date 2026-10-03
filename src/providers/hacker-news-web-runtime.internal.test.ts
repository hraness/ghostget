import { describe, expect, test } from "bun:test";

import type { CookieRecordReader } from "@hraness/wordcell/clip/acquire";
import type { StrictCookie } from "@hraness/wordcell/clip/cookies";
import type { GhostgetAuth } from "../auth";
import type { OperationInput, WebSessionRecipe } from "../model";
import {
  OperationDeadline,
  type OperationDeadlineClock,
} from "../operation-deadline";
import { createWebSessionClient } from "../web-session-client";
import {
  dispatchHackerNewsCommentForm,
  dispatchHackerNewsFavoriteAction,
  dispatchHackerNewsSubmissionForm,
  dispatchHackerNewsVoteAction,
  parseHackerNewsCommentForm,
  parseHackerNewsFavoriteAction,
  parseHackerNewsSubmissionForm,
  parseHackerNewsVoteAction,
} from "./hacker-news-web";
import {
  executeHackerNewsWebOperation,
  prepareHackerNewsWebDesiredState,
  probeHackerNewsWebSubject,
  readHackerNewsWebDesiredState,
  readHackerNewsWebPublishedCommentTarget,
  readHackerNewsWebPublishedPostTarget,
  type HackerNewsWebRuntimeDependencies,
} from "./hacker-news-web-runtime";

const USERNAME = "wrench_user";
const SUBJECT = `hacker-news:${USERNAME}`;
const POST_ID = "49020868";
const COMMENT_ID = "49021000";
const AUTH = "synthetic-request-bound-auth";

const hackerNewsAuth = {
  schemaVersion: 1,
  id: "hacker-news-test",
  kind: "cookie-source",
  source: "arc",
  profile: "Profile 1",
  subject: SUBJECT,
} as const satisfies GhostgetAuth;

const unboundHackerNewsAuth = {
  schemaVersion: 1,
  id: "hacker-news-test-unbound",
  kind: "cookie-source",
  source: "arc",
  profile: "Profile 1",
} as const satisfies GhostgetAuth;

type CapturedRequest = {
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | null;
  readonly redirect: string | undefined;
  readonly signal: AbortSignal | null;
};

class FakeMonotonicClock implements OperationDeadlineClock {
  #nowMs = 0;
  #nextId = 1;
  readonly #scheduled = new Map<number, {
    readonly at: number;
    readonly callback: () => void;
  }>();

  readonly now = (): number => this.#nowMs;

  readonly schedule = (callback: () => void, delayMs: number): (() => void) => {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#scheduled.set(id, { at: this.#nowMs + delayMs, callback });
    return () => {
      this.#scheduled.delete(id);
    };
  };

  advance(milliseconds: number): void {
    this.#nowMs += milliseconds;
    for (;;) {
      const due = [...this.#scheduled.entries()]
        .filter(([, value]) => value.at <= this.#nowMs)
        .sort((left, right) =>
          left[1].at - right[1].at || left[0] - right[0])[0];
      if (due === undefined) return;
      this.#scheduled.delete(due[0]);
      due[1].callback();
    }
  }

  pendingTimers(): number {
    return this.#scheduled.size;
  }
}

function strictCookie(): StrictCookie {
  return {
    name: "user",
    value: "private-hacker-news-cookie",
    domain: "news.ycombinator.com",
    hostOnly: true,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    expires: 0,
  };
}

function requestUrl(value: string | URL | Request): URL {
  return new URL(typeof value === "string" ? value : value instanceof URL ? value.href : value.url);
}

function dependencies(
  calls: CapturedRequest[],
  handler: (request: CapturedRequest) => Response | Promise<Response>,
  onAcquire?: (selection: Parameters<CookieRecordReader>[0]) => void,
): HackerNewsWebRuntimeDependencies & {
  readonly acquireCookies: CookieRecordReader;
  readonly fetch: typeof globalThis.fetch;
} {
  const acquireCookies: CookieRecordReader = (selection) => {
    onAcquire?.(selection);
    return Promise.resolve({ cookies: [strictCookie()], warnings: [] });
  };
  const fetch = (async (value: string | URL | Request, init?: RequestInit) => {
    const request: CapturedRequest = {
      url: requestUrl(value),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : null,
      redirect: typeof init?.redirect === "string" ? init.redirect : undefined,
      signal: init?.signal instanceof AbortSignal ? init.signal : null,
    };
    calls.push(request);
    return handler(request);
  }) as typeof globalThis.fetch;
  return { acquireCookies, fetch };
}

function htmlResponse(value: string): Response {
  return new Response(value, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function viewer(username = USERNAME): string {
  return `<a href="user?id=${username}" id="me">${username}</a>`;
}

function submission(id = POST_ID, extra = ""): string {
  return [
    `<tr class="athing submission" id="${id}">`,
    `<td><span class="titleline"><a href="https://example.com/${id}">Runtime story</a></span></td>`,
    "</tr>",
    "<tr><td class=\"subtext\">",
    `<span class="score">7 points</span> by <a href="user?id=author" class="hnuser">author</a> `,
    `<span class="age" title="2026-07-23T12:00:00 1784808000"><a href="item?id=${id}">one hour ago</a></span> | `,
    `<a href="item?id=${id}">1 comment</a>`,
    "</td></tr>",
    extra,
  ].join("");
}

function comment(): string {
  return [
    `<tr class="athing comtr" id="${COMMENT_ID}">`,
    "<td><table><tr><td class=\"ind\" indent=\"0\"></td><td>",
    `<a href="user?id=commenter" class="hnuser">commenter</a> `,
    `<span class="age" title="2026-07-23T12:01:00 1784808060"><a href="item?id=${COMMENT_ID}">59 minutes ago</a></span>`,
    "<div class=\"commtext c00\">Runtime comment</div>",
    "</td></tr></table></td></tr>",
  ].join("");
}

function newsHtml(username = USERNAME): string {
  return `<html><body>${viewer(username)}${submission()}</body></html>`;
}

function itemHtml(username = USERNAME): string {
  return `<html><body>${viewer(username)}${submission()}${comment()}</body></html>`;
}

function recipe(action: WebSessionRecipe["action"]): WebSessionRecipe {
  return {
    site: "hacker-news",
    action,
    contractVersion: 1,
    timeoutMs: 1_000,
    maxOutputBytes: 4 * 1024 * 1024,
  };
}

describe("Hacker News authenticated first-party runtime", () => {
  test("probes the current username through the exact signed-in /news page", async () => {
    const calls: CapturedRequest[] = [];
    const subject = await probeHackerNewsWebSubject(
      unboundHackerNewsAuth,
      {
        dependencies: dependencies(calls, (request) => {
          expect(request.url.href).toBe("https://news.ycombinator.com/news");
          expect(request.method).toBe("GET");
          expect(request.redirect).toBe("error");
          expect(request.headers.get("cookie")).toContain("user=");
          return htmlResponse(newsHtml());
        }),
      },
    );
    expect(subject).toBe(SUBJECT);
    expect(calls).toHaveLength(1);
  });

  test("executes every observed R1 operation without mutation callbacks", async () => {
    const scenarios: readonly {
      readonly action: WebSessionRecipe["action"];
      readonly input: OperationInput;
      readonly verify: (output: unknown) => void;
    }[] = [
      {
        action: "feeds.read",
        input: { feed: "news", limit: 1 },
        verify: (output) => expect(output).toMatchObject({
          posts: [{ id: POST_ID, title: "Runtime story" }],
        }),
      },
      {
        action: "posts.read",
        input: { item_id: POST_ID },
        verify: (output) => expect(output).toMatchObject({
          post: { id: POST_ID, score: 7 },
        }),
      },
      {
        action: "comments.read",
        input: { post_id: POST_ID, limit: 10 },
        verify: (output) => expect(output).toMatchObject({
          post: { id: POST_ID },
          comments: [{ id: COMMENT_ID, parentId: POST_ID }],
        }),
      },
    ];
    for (const scenario of scenarios) {
      const calls: CapturedRequest[] = [];
      let callbacks = 0;
      const result = await executeHackerNewsWebOperation(
        recipe(scenario.action),
        scenario.input,
        hackerNewsAuth,
        {
          dependencies: dependencies(calls, (request) => {
            if (request.url.pathname === "/news") return htmlResponse(newsHtml());
            if (request.url.pathname === "/item") {
              expect(request.url.searchParams.get("id")).toBe(POST_ID);
              expect([...request.url.searchParams.keys()]).toEqual(["id"]);
              return htmlResponse(itemHtml());
            }
            throw new Error(`unexpected request ${request.url.href}`);
          }),
          beforeDispatch: () => {
            callbacks += 1;
            return Promise.resolve();
          },
          afterDispatchVerified: () => {
            callbacks += 1;
            return Promise.resolve();
          },
        },
      );
      expect(result.status).toBe("succeeded");
      expect(result.dispatch).toEqual({ planned: 0, started: 0, verified: 0 });
      expect(callbacks).toBe(0);
      scenario.verify(result.output);
      expect(calls.map((request) => request.url.pathname)).toEqual(
        scenario.action === "feeds.read" ? ["/news"] : ["/news", "/item"],
      );
    }
  });

  test("shares one inherited deadline across a built-in multi-request read", async () => {
    const clock = new FakeMonotonicClock();
    const operationDeadline = new OperationDeadline(100, { clock });
    const calls: CapturedRequest[] = [];
    const remainingBudgets: number[] = [];
    try {
      const result = await executeHackerNewsWebOperation(
        recipe("posts.read"),
        { item_id: POST_ID },
        hackerNewsAuth,
        {
          signal: operationDeadline.signal,
          operationDeadline,
          dependencies: dependencies(
            calls,
            (request) => {
              remainingBudgets.push(operationDeadline.remainingTimeMs());
              clock.advance(request.url.pathname === "/news" ? 25 : 20);
              return htmlResponse(
                request.url.pathname === "/news" ? newsHtml() : itemHtml(),
              );
            },
            (selection) => {
              expect(selection.timeoutMs).toBe(100);
              clock.advance(10);
            },
          ),
        },
      );

      expect(result.status).toBe("succeeded");
      expect(calls.map((request) => request.url.pathname)).toEqual([
        "/news",
        "/item",
      ]);
      expect(calls.map((request) => request.signal)).toEqual([
        operationDeadline.signal,
        operationDeadline.signal,
      ]);
      expect(remainingBudgets).toEqual([90, 65]);
      expect(operationDeadline.remainingTimeMs()).toBe(45);
      expect(clock.pendingTimers()).toBe(1);
    } finally {
      operationDeadline.dispose();
    }
    expect(clock.pendingTimers()).toBe(0);
  });

  test("rejects an account mismatch before fetching the requested item", () => {
    const calls: CapturedRequest[] = [];
    expect(executeHackerNewsWebOperation(
      recipe("posts.read"),
      { item_id: POST_ID },
      hackerNewsAuth,
      {
        dependencies: dependencies(calls, () => htmlResponse(newsHtml("another_user"))),
      },
    )).rejects.toThrow("no longer matches");
    expect(calls.map((request) => request.url.pathname)).toEqual(["/news"]);
  });

  test("keeps every write reservation network-inert", () => {
    for (const action of [
      "content.save",
      "reactions.set",
      "comments.create",
      "replies.create",
      "posts.publish",
      "content.edit",
    ] as const) {
      let acquisitions = 0;
      expect(executeHackerNewsWebOperation(
        recipe(action),
        {},
        hackerNewsAuth,
        {
          dependencies: dependencies([], () => {
            throw new Error("network must not run");
          }, () => {
            acquisitions += 1;
          }),
        },
      )).rejects.toThrow("capture-required");
      expect(acquisitions).toBe(0);
    }
  });
});

describe("Hacker News request-bound manual redirect transport", () => {
  function favoriteHtml(path: "fave" | "unfave"): string {
    return submission(
      POST_ID,
      `<a href="${path}?id=${POST_ID}&amp;auth=${AUTH}&amp;goto=item%3Fid%3D${POST_ID}">${path}</a>`,
    );
  }

  test("sends one ephemeral favorite token with redirect manual and returns only a safe location", async () => {
    const calls: CapturedRequest[] = [];
    const network = dependencies(calls, (request) => {
      expect(request.redirect).toBe("manual");
      expect(request.method).toBe("GET");
      expect(request.url.pathname).toBe("/fave");
      expect([...request.url.searchParams.keys()]).toEqual(["id", "auth", "goto"]);
      expect(request.url.searchParams.get("id")).toBe(POST_ID);
      expect(request.url.searchParams.get("auth")).toBe(AUTH);
      expect(request.url.searchParams.get("goto")).toBe(`item?id=${POST_ID}`);
      expect(request.headers.get("cookie")).toContain("user=");
      return new Response(null, {
        status: 302,
        headers: { location: `/item?id=${POST_ID}` },
      });
    });
    const client = await createWebSessionClient(
      "https://news.ycombinator.com",
      hackerNewsAuth,
      {
        timeoutMs: 1_000,
        dependencies: network,
      },
    );
    let dispatches = 0;
    const result = await dispatchHackerNewsFavoriteAction(
      client,
      parseHackerNewsFavoriteAction(favoriteHtml("fave"), POST_ID),
      true,
      () => {
        dispatches += 1;
        return Promise.resolve();
      },
      { timeoutMs: 1_000, fetch: network.fetch },
    );
    expect(result).toEqual({ status: 302, location: `/item?id=${POST_ID}` });
    expect(dispatches).toBe(1);
    expect(JSON.stringify(result)).not.toContain(AUTH);
    expect(calls).toHaveLength(1);
  });

  test("rejects desired-state mismatch before dispatch and cross-origin redirects after one dispatch", async () => {
    const noOpCalls: CapturedRequest[] = [];
    const noOpClient = await createWebSessionClient(
      "https://news.ycombinator.com",
      hackerNewsAuth,
      {
        timeoutMs: 1_000,
        dependencies: dependencies(noOpCalls, () => {
          throw new Error("network must not run");
        }),
      },
    );
    let mismatchDispatches = 0;
    expect(dispatchHackerNewsFavoriteAction(
      noOpClient,
      parseHackerNewsFavoriteAction(favoriteHtml("fave"), POST_ID),
      false,
      () => {
        mismatchDispatches += 1;
        return Promise.resolve();
      },
    )).rejects.toThrow("does not match");
    expect(mismatchDispatches).toBe(0);
    expect(noOpCalls).toHaveLength(0);

    const redirectCalls: CapturedRequest[] = [];
    const redirectNetwork = dependencies(redirectCalls, () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/leak" },
      }));
    const redirectClient = await createWebSessionClient(
      "https://news.ycombinator.com",
      hackerNewsAuth,
      {
        timeoutMs: 1_000,
        dependencies: redirectNetwork,
      },
    );
    let redirectDispatches = 0;
    expect(dispatchHackerNewsFavoriteAction(
      redirectClient,
      parseHackerNewsFavoriteAction(favoriteHtml("fave"), POST_ID),
      true,
      () => {
        redirectDispatches += 1;
        return Promise.resolve();
      },
      { timeoutMs: 1_000, fetch: redirectNetwork.fetch },
    )).rejects.toThrow("unreviewed redirect");
    expect(redirectDispatches).toBe(1);
    expect(redirectCalls).toHaveLength(1);
  });

  test("rejects forged and already-consumed request-bound favorite actions", async () => {
    const calls: CapturedRequest[] = [];
    const network = dependencies(calls, () =>
      new Response(null, {
        status: 302,
        headers: { location: `/item?id=${POST_ID}` },
      }));
    const client = await createWebSessionClient(
      "https://news.ycombinator.com",
      hackerNewsAuth,
      {
        timeoutMs: 1_000,
        dependencies: network,
      },
    );
    expect(dispatchHackerNewsFavoriteAction(
      client,
      {
        path: "/fave",
        targetId: POST_ID,
        auth: AUTH,
        goto: `item?id=${POST_ID}`,
        nextSavedState: true,
      },
      true,
      () => Promise.resolve(),
      { timeoutMs: 1_000, fetch: network.fetch },
    )).rejects.toThrow("immediate parsed provider page");
    const parsed = parseHackerNewsFavoriteAction(favoriteHtml("fave"), POST_ID);
    await dispatchHackerNewsFavoriteAction(
      client,
      parsed,
      true,
      () => Promise.resolve(),
      { timeoutMs: 1_000, fetch: network.fetch },
    );
    expect(dispatchHackerNewsFavoriteAction(
      client,
      parsed,
      true,
      () => Promise.resolve(),
      { timeoutMs: 1_000, fetch: network.fetch },
    )).rejects.toThrow("immediate parsed provider page");
    expect(calls).toHaveLength(1);
  });

  test("rejects request-bound proof in redirect URLs", async () => {
    const proofNetwork = dependencies([], () =>
      new Response(null, {
        status: 302,
        headers: { location: `/item?id=${POST_ID}&auth=${AUTH}` },
      }));
    const client = await createWebSessionClient(
      "https://news.ycombinator.com",
      hackerNewsAuth,
      {
        timeoutMs: 1_000,
        dependencies: proofNetwork,
      },
    );
    expect(dispatchHackerNewsFavoriteAction(
      client,
      parseHackerNewsFavoriteAction(favoriteHtml("fave"), POST_ID),
      true,
      () => Promise.resolve(),
      { timeoutMs: 1_000, fetch: proofNetwork.fetch },
    )).rejects.toThrow("request-bound proof");
  });
});

describe("Hacker News request-bound vote and form dispatch", () => {
  const HMAC = "synthetic-request-bound-hmac";
  const FNID = "synthetic-request-bound-fnid";

  function voteHtml(how: "up" | "un"): string {
    return submission(
      POST_ID,
      `<a href="vote?id=${POST_ID}&amp;how=${how}&amp;auth=${AUTH}&amp;goto=item%3Fid%3D${POST_ID}">${how}</a>`,
    );
  }

  function commentForm(parentId = POST_ID, goto = `item?id=${POST_ID}`): string {
    return [
      "<form method=\"post\" action=\"comment\">",
      `<input type="hidden" name="parent" value="${parentId}">`,
      `<input type="hidden" name="goto" value="${goto}">`,
      `<input type="hidden" name="hmac" value="${HMAC}">`,
      "<textarea name=\"text\"></textarea>",
      "</form>",
    ].join("");
  }

  function submitForm(): string {
    return [
      "<form method=\"post\" action=\"r\">",
      `<input type="hidden" name="fnid" value="${FNID}">`,
      "<input type=\"hidden\" name=\"fnop\" value=\"submit-page\">",
      "<input name=\"title\"><input name=\"url\"><textarea name=\"text\"></textarea>",
      "</form>",
    ].join("");
  }

  async function boundClient(
    calls: CapturedRequest[],
    handler: (request: CapturedRequest) => Response | Promise<Response>,
  ) {
    const network = dependencies(calls, handler);
    const client = await createWebSessionClient(
      "https://news.ycombinator.com",
      hackerNewsAuth,
      { timeoutMs: 1_000, dependencies: network },
    );
    return { client, fetch: network.fetch };
  }

  test("sends one ephemeral vote token with redirect manual", async () => {
    const calls: CapturedRequest[] = [];
    const { client, fetch } = await boundClient(calls, (request) => {
      expect(request.redirect).toBe("manual");
      expect(request.method).toBe("GET");
      expect(request.url.pathname).toBe("/vote");
      expect([...request.url.searchParams.keys()]).toEqual(["id", "how", "auth", "goto"]);
      expect(request.url.searchParams.get("id")).toBe(POST_ID);
      expect(request.url.searchParams.get("how")).toBe("up");
      expect(request.url.searchParams.get("auth")).toBe(AUTH);
      return new Response(null, {
        status: 302,
        headers: { location: `/item?id=${POST_ID}` },
      });
    });
    let dispatches = 0;
    const result = await dispatchHackerNewsVoteAction(
      client,
      parseHackerNewsVoteAction(voteHtml("up"), POST_ID),
      true,
      () => {
        dispatches += 1;
        return Promise.resolve();
      },
      { timeoutMs: 1_000, fetch },
    );
    expect(result).toEqual({ status: 302, location: `/item?id=${POST_ID}` });
    expect(dispatches).toBe(1);
    expect(JSON.stringify(result)).not.toContain(AUTH);
    expect(calls).toHaveLength(1);
  });

  test("rejects forged, consumed, and state-mismatched vote actions", async () => {
    const calls: CapturedRequest[] = [];
    const { client, fetch } = await boundClient(calls, () =>
      new Response(null, {
        status: 302,
        headers: { location: `/item?id=${POST_ID}` },
      }));
    expect(dispatchHackerNewsVoteAction(
      client,
      {
        path: "/vote",
        targetId: POST_ID,
        how: "up",
        auth: AUTH,
        goto: `item?id=${POST_ID}`,
        nextUpvotedState: true,
      },
      true,
      () => Promise.resolve(),
      { timeoutMs: 1_000, fetch },
    )).rejects.toThrow("immediate parsed provider page");

    let mismatchDispatches = 0;
    expect(dispatchHackerNewsVoteAction(
      client,
      parseHackerNewsVoteAction(voteHtml("up"), POST_ID),
      false,
      () => {
        mismatchDispatches += 1;
        return Promise.resolve();
      },
      { timeoutMs: 1_000, fetch },
    )).rejects.toThrow("does not match");
    expect(mismatchDispatches).toBe(0);

    const consumed = parseHackerNewsVoteAction(voteHtml("un"), POST_ID);
    await dispatchHackerNewsVoteAction(
      client,
      consumed,
      false,
      () => Promise.resolve(),
      { timeoutMs: 1_000, fetch },
    );
    expect(dispatchHackerNewsVoteAction(
      client,
      consumed,
      false,
      () => Promise.resolve(),
      { timeoutMs: 1_000, fetch },
    )).rejects.toThrow("immediate parsed provider page");
    expect(calls).toHaveLength(1);
  });

  test("posts one bound comment form with the exact reviewed fields", async () => {
    const calls: CapturedRequest[] = [];
    const { client, fetch } = await boundClient(calls, (request) => {
      expect(request.redirect).toBe("manual");
      expect(request.method).toBe("POST");
      expect(request.url.href).toBe("https://news.ycombinator.com/comment");
      expect(request.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
      expect(request.headers.get("referer")).toBe(`https://news.ycombinator.com/item?id=${POST_ID}`);
      const body = new URLSearchParams(request.body ?? "");
      expect([...body.keys()]).toEqual(["parent", "goto", "hmac", "text"]);
      expect(body.get("parent")).toBe(POST_ID);
      expect(body.get("goto")).toBe(`item?id=${POST_ID}`);
      expect(body.get("hmac")).toBe(HMAC);
      expect(body.get("text")).toBe("Runtime comment");
      return new Response(null, {
        status: 302,
        headers: { location: `/item?id=${POST_ID}` },
      });
    });
    const result = await dispatchHackerNewsCommentForm(
      client,
      parseHackerNewsCommentForm(commentForm(), POST_ID),
      { text: "Runtime comment", referer: `https://news.ycombinator.com/item?id=${POST_ID}` },
      () => Promise.resolve(),
      { timeoutMs: 1_000, fetch },
    );
    expect(result).toEqual({ status: 302, location: `/item?id=${POST_ID}` });
    expect(JSON.stringify(result)).not.toContain(HMAC);
    expect(calls).toHaveLength(1);
  });

  test("rejects forged comment proofs and goto drift before any request", async () => {
    const calls: CapturedRequest[] = [];
    const { client, fetch } = await boundClient(calls, () => {
      throw new Error("network must not run");
    });
    let dispatches = 0;
    const beforeRequest = () => {
      dispatches += 1;
      return Promise.resolve();
    };
    expect(dispatchHackerNewsCommentForm(
      client,
      { parentId: POST_ID, goto: `item?id=${POST_ID}`, hmac: HMAC },
      { text: "body", referer: `https://news.ycombinator.com/item?id=${POST_ID}` },
      beforeRequest,
      { timeoutMs: 1_000, fetch },
    )).rejects.toThrow("immediate parsed provider page");
    expect(dispatchHackerNewsCommentForm(
      client,
      parseHackerNewsCommentForm(commentForm(POST_ID, "news"), POST_ID),
      { text: "body", referer: `https://news.ycombinator.com/item?id=${POST_ID}` },
      beforeRequest,
      { timeoutMs: 1_000, fetch },
    )).rejects.toThrow("goto did not bind");
    expect(dispatches).toBe(0);
    expect(calls).toHaveLength(0);
  });

  test("posts one bound submission form with the exact reviewed fields", async () => {
    const calls: CapturedRequest[] = [];
    const { client, fetch } = await boundClient(calls, (request) => {
      expect(request.redirect).toBe("manual");
      expect(request.method).toBe("POST");
      expect(request.url.href).toBe("https://news.ycombinator.com/r");
      expect(request.headers.get("referer")).toBe("https://news.ycombinator.com/submit");
      const body = new URLSearchParams(request.body ?? "");
      expect([...body.keys()]).toEqual(["fnid", "fnop", "title", "url", "text"]);
      expect(body.get("fnid")).toBe(FNID);
      expect(body.get("title")).toBe("Runtime story");
      expect(body.get("url")).toBe("https://example.com/story");
      expect(body.get("text")).toBe("");
      return new Response(null, {
        status: 302,
        headers: { location: "/newest" },
      });
    });
    const result = await dispatchHackerNewsSubmissionForm(
      client,
      parseHackerNewsSubmissionForm(submitForm()),
      { title: "Runtime story", url: "https://example.com/story", text: null },
      () => Promise.resolve(),
      { timeoutMs: 1_000, fetch },
    );
    expect(result).toEqual({ status: 302, location: "/newest" });
    expect(JSON.stringify(result)).not.toContain(FNID);
    expect(calls).toHaveLength(1);
  });

  test("rejects forged submission proofs and empty content before any request", async () => {
    const calls: CapturedRequest[] = [];
    const { client, fetch } = await boundClient(calls, () => {
      throw new Error("network must not run");
    });
    let dispatches = 0;
    const beforeRequest = () => {
      dispatches += 1;
      return Promise.resolve();
    };
    expect(dispatchHackerNewsSubmissionForm(
      client,
      { fnid: FNID, fnop: "submit-page" },
      { title: "Runtime story", url: "https://example.com/story", text: null },
      beforeRequest,
      { timeoutMs: 1_000, fetch },
    )).rejects.toThrow("immediate parsed provider page");
    expect(dispatchHackerNewsSubmissionForm(
      client,
      parseHackerNewsSubmissionForm(submitForm()),
      { title: "Runtime story", url: null, text: null },
      beforeRequest,
      { timeoutMs: 1_000, fetch },
    )).rejects.toThrow("exactly");
    expect(dispatches).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("Hacker News desired-state preparation and readback", () => {
  function itemPageWithAction(extra: string): string {
    return `<html><body>${submission(POST_ID, extra)}</body></html>`;
  }

  const faveAnchor = `<a href="fave?id=${POST_ID}&amp;auth=${AUTH}&amp;goto=item%3Fid%3D${POST_ID}">favorite</a>`;
  const unfaveAnchor = `<a href="unfave?id=${POST_ID}&amp;auth=${AUTH}&amp;goto=item%3Fid%3D${POST_ID}">un-favorite</a>`;
  const upAnchor = `<a href="vote?id=${POST_ID}&amp;how=up&amp;auth=${AUTH}&amp;goto=item%3Fid%3D${POST_ID}">up</a>`;
  const unAnchor = `<a href="vote?id=${POST_ID}&amp;how=un&amp;auth=${AUTH}&amp;goto=item%3Fid%3D${POST_ID}">un</a>`;

  test("prepares exact offered-state for save and upvote", async () => {
    const calls: CapturedRequest[] = [];
    const network = dependencies(calls, (request) => {
      if (request.url.pathname === "/news") return htmlResponse(newsHtml());
      if (request.url.pathname === "/item") {
        expect(request.url.searchParams.get("id")).toBe(POST_ID);
        return htmlResponse(itemPageWithAction(faveAnchor));
      }
      throw new Error(`unexpected request ${request.url.href}`);
    });
    const save = await prepareHackerNewsWebDesiredState(
      recipe("content.save"),
      { item_id: POST_ID, saved: true },
      hackerNewsAuth,
      { dependencies: network },
    );
    expect(save).toEqual({
      operation: "content.save",
      itemId: POST_ID,
      desiredState: true,
      actualState: false,
      alreadyDesired: false,
    });

    const upvote = await prepareHackerNewsWebDesiredState(
      recipe("reactions.set"),
      { item_id: POST_ID, upvoted: false },
      hackerNewsAuth,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/item") return htmlResponse(itemPageWithAction(unAnchor));
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(upvote).toEqual({
      operation: "reactions.set",
      itemId: POST_ID,
      desiredState: false,
      actualState: true,
      alreadyDesired: false,
    });

    const already = await prepareHackerNewsWebDesiredState(
      recipe("content.save"),
      { item_id: POST_ID, saved: true },
      hackerNewsAuth,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/item") return htmlResponse(itemPageWithAction(unfaveAnchor));
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(already.alreadyDesired).toBe(true);

    const alreadyUnvoted = await prepareHackerNewsWebDesiredState(
      recipe("reactions.set"),
      { item_id: POST_ID, upvoted: false },
      hackerNewsAuth,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/item") return htmlResponse(itemPageWithAction(upAnchor));
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(alreadyUnvoted).toMatchObject({ desiredState: false, actualState: false, alreadyDesired: true });
  });

  test("rejects preparation when the viewer no longer matches the subject", () => {
    const calls: CapturedRequest[] = [];
    expect(prepareHackerNewsWebDesiredState(
      recipe("content.save"),
      { item_id: POST_ID, saved: true },
      hackerNewsAuth,
      {
        dependencies: dependencies(calls, () => htmlResponse(newsHtml("another_user"))),
      },
    )).rejects.toThrow("no longer matches");
    expect(calls.map((request) => request.url.pathname)).toEqual(["/news"]);
  });

  test("reads exact saved state from the bound viewer's favorites", async () => {
    const calls: CapturedRequest[] = [];
    const present = await readHackerNewsWebDesiredState(
      recipe("content.save"),
      { item_id: POST_ID, saved: true },
      hackerNewsAuth,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/favorites") {
            expect(request.url.searchParams.get("id")).toBe(USERNAME);
            expect([...request.url.searchParams.keys()]).toEqual(["id"]);
            return htmlResponse(`<html><body>${submission(POST_ID)}</body></html>`);
          }
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(present).toEqual({ kind: "saved", enabled: true, itemId: POST_ID });

    const absent = await readHackerNewsWebDesiredState(
      recipe("content.save"),
      { item_id: POST_ID, saved: true },
      hackerNewsAuth,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/favorites") {
            return htmlResponse(`<html><body>${submission("49029999")}</body></html>`);
          }
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(absent.enabled).toBe(false);
  });

  test("reads exact upvote state from the offered action", async () => {
    const calls: CapturedRequest[] = [];
    const upvoted = await readHackerNewsWebDesiredState(
      recipe("reactions.set"),
      { item_id: POST_ID, upvoted: true },
      hackerNewsAuth,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/item") return htmlResponse(itemPageWithAction(unAnchor));
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(upvoted).toEqual({ kind: "upvoted", enabled: true, itemId: POST_ID });
  });
});

describe("Hacker News accepted-target reconciliation reads", () => {
  function commentRow(id: string, depth: number, author: string, body: string): string {
    return [
      `<tr class="athing comtr" id="${id}">`,
      "<td><table><tr>",
      `<td class="ind" indent="${depth}"></td>`,
      "<td>",
      `<a href="user?id=${author}" class="hnuser">${author}</a> `,
      `<span class="age" title="2026-07-23T12:01:00 1784808060"><a href="item?id=${id}">59 minutes ago</a></span>`,
      `<div class="commtext c00">${body}</div>`,
      "</td></tr></table></td></tr>",
    ].join("");
  }

  function submissionBy(id: string, author: string, href = `https://example.com/${id}`): string {
    return [
      `<tr class="athing submission" id="${id}">`,
      `<td><span class="titleline"><a href="${href}">Runtime story</a></span></td>`,
      "</tr>",
      "<tr><td class=\"subtext\">",
      `<span class="score">7 points</span> by <a href="user?id=${author}" class="hnuser">${author}</a> `,
      `<span class="age" title="2026-07-23T12:00:00 1784808000"><a href="item?id=${id}">one hour ago</a></span>`,
      "</td></tr>",
    ].join("");
  }

  test("confirms an exact authored comment under its post", async () => {
    const calls: CapturedRequest[] = [];
    const present = await readHackerNewsWebPublishedCommentTarget(
      recipe("comments.create"),
      { post_id: POST_ID, body: "Runtime comment" },
      hackerNewsAuth,
      `{"commentId":"${COMMENT_ID}"}`,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/item") {
            expect(request.url.searchParams.get("id")).toBe(POST_ID);
            return htmlResponse(
              `<html><body>${submission()}${commentRow(COMMENT_ID, 0, USERNAME, "Runtime comment")}</body></html>`,
            );
          }
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(present).toEqual({ present: true, commentId: COMMENT_ID });
  });

  test("rejects forged identifiers and unbound comment matches", async () => {
    const calls: CapturedRequest[] = [];
    const network = dependencies(calls, (request) => {
      if (request.url.pathname === "/news") return htmlResponse(newsHtml());
      if (request.url.pathname === "/item") {
        return htmlResponse(
          `<html><body>${submission()}${commentRow(COMMENT_ID, 0, "other_user", "Runtime comment")}</body></html>`,
        );
      }
      throw new Error(`unexpected request ${request.url.href}`);
    });
    expect(readHackerNewsWebPublishedCommentTarget(
      recipe("comments.create"),
      { post_id: POST_ID, body: "Runtime comment" },
      hackerNewsAuth,
      `{"commentId":"${COMMENT_ID}","extra":1}`,
      { dependencies: network },
    )).rejects.toThrow("accepted target");
    expect(readHackerNewsWebPublishedCommentTarget(
      recipe("comments.create"),
      { post_id: POST_ID, body: "Runtime comment" },
      hackerNewsAuth,
      `{"commentId":"abc"}`,
      { dependencies: network },
    )).rejects.toThrow("accepted target");

    const unbound = await readHackerNewsWebPublishedCommentTarget(
      recipe("comments.create"),
      { post_id: POST_ID, body: "Runtime comment" },
      hackerNewsAuth,
      `{"commentId":"${COMMENT_ID}"}`,
      { dependencies: network },
    );
    expect(unbound).toEqual({ present: false, commentId: COMMENT_ID });
  });

  test("confirms an exact authored reply under its parent comment", async () => {
    const calls: CapturedRequest[] = [];
    const present = await readHackerNewsWebPublishedCommentTarget(
      recipe("replies.create"),
      { parent_id: COMMENT_ID, body: "Nested reply" },
      hackerNewsAuth,
      `{"commentId":"49021001"}`,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/item") {
            expect(request.url.searchParams.get("id")).toBe(COMMENT_ID);
            return htmlResponse(
              `<html><body>${commentRow(COMMENT_ID, 0, "someone", "Parent")}${commentRow("49021001", 1, USERNAME, "Nested reply")}</body></html>`,
            );
          }
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(present).toEqual({ present: true, commentId: "49021001" });
  });

  test("confirms an exact authored submission through its item page", async () => {
    const calls: CapturedRequest[] = [];
    const present = await readHackerNewsWebPublishedPostTarget(
      recipe("posts.publish"),
      { title: "Runtime story", url: `https://example.com/${POST_ID}` },
      hackerNewsAuth,
      `{"postId":"${POST_ID}"}`,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/item") {
            return htmlResponse(`<html><body>${submissionBy(POST_ID, USERNAME)}</body></html>`);
          }
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(present).toEqual({ present: true, postId: POST_ID });

    const wrongActor = await readHackerNewsWebPublishedPostTarget(
      recipe("posts.publish"),
      { title: "Runtime story", url: `https://example.com/${POST_ID}` },
      hackerNewsAuth,
      `{"postId":"${POST_ID}"}`,
      {
        dependencies: dependencies(calls, (request) => {
          if (request.url.pathname === "/news") return htmlResponse(newsHtml());
          if (request.url.pathname === "/item") {
            return htmlResponse(`<html><body>${submissionBy(POST_ID, "other_user")}</body></html>`);
          }
          throw new Error(`unexpected request ${request.url.href}`);
        }),
      },
    );
    expect(wrongActor).toEqual({ present: false, postId: POST_ID });
  });
});
