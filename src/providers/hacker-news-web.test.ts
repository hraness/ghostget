import { describe, expect, test } from "bun:test";

import { assertProperty, fc } from "../test-support";
import hackerNewsWebManifest from "../assets/adapters/hacker-news/wrench-web-adapter.json";
import {
  HACKER_NEWS_WEB_OPERATION_NAMES,
  HACKER_NEWS_WEB_OPERATIONS,
  authorizeHackerNewsReadRequest,
  findHackerNewsCommentRow,
  findHackerNewsSubmittedRow,
  normalizeHackerNewsCommentsHtml,
  normalizeHackerNewsFeedHtml,
  normalizeHackerNewsPostHtml,
  parseHackerNewsCommentForm,
  parseHackerNewsFavoriteAction,
  parseHackerNewsFavoritesPresence,
  parseHackerNewsSubmissionForm,
  parseHackerNewsViewerHtml,
  parseHackerNewsVoteAction,
  scanHackerNewsCommentRows,
} from "./hacker-news-web";

const POST_ID = "49020868";
const SECOND_POST_ID = "49020869";
const COMMENT_ID = "49021000";
const REPLY_ID = "49021001";
const AUTH = "synthetic-request-bound-auth";
const HMAC = "synthetic-request-bound-hmac";
const FNID = "synthetic-request-bound-fnid";
const FNOP = "submit-page";

function viewer(): string {
  return `<span class="pagetop"><a href="user?id=wrench_user" id="me">wrench_user</a></span>`;
}

function submission(
  id: string,
  title = "A useful story",
  extra = "",
): string {
  return [
    `<tr class="athing submission" id="${id}">`,
    "<td class=\"title\">",
    `<span class="titleline"><a href="https://example.com/${id}">${title}</a><span class="sitebit"> (example.com)</span></span>`,
    "</td>",
    "</tr>",
    "<tr><td class=\"subtext\">",
    `<span class="score" id="score_${id}">42 points</span> by `,
    `<a href="user?id=author_${id}" class="hnuser">author_${id}</a> `,
    `<span class="age" title="2026-07-23T12:00:00 1784808000"><a href="item?id=${id}">1 hour ago</a></span> | `,
    `<a href="item?id=${id}">3&nbsp;comments</a>`,
    "</td></tr>",
    extra,
  ].join("");
}

function comment(
  id: string,
  depth: number,
  body: string,
  parentId: string | null,
): string {
  return [
    `<tr class="athing comtr" id="${id}">`,
    "<td><table><tr>",
    `<td class="ind" indent="${depth}"><img src="s.gif" width="${depth * 40}"></td>`,
    "<td class=\"default\">",
    `<span class="comhead"><a href="user?id=user_${id}" class="hnuser">user_${id}</a> `,
    `<span class="age" title="2026-07-23T12:01:00 1784808060"><a href="item?id=${id}">59 minutes ago</a></span>`,
    parentId === null ? "" : `<span class="navs"> | <a href="#${parentId}">parent</a></span>`,
    "</span>",
    `<div class="comment"><div class="commtext c00">${body}</div></div>`,
    "</td></tr></table></td></tr>",
  ].join("");
}

function itemPage(): string {
  return [
    "<html><body>",
    viewer(),
    submission(POST_ID, "Ask HN: A &amp; B?", `<tr><td><div class="toptext">Line one<p>Line two</div></td></tr>`),
    comment(COMMENT_ID, 0, "First &lt;comment&gt;", null),
    comment(REPLY_ID, 1, "Nested<br>reply", COMMENT_ID),
    "</body></html>",
  ].join("");
}

describe("Hacker News internal-web operation registry", () => {
  test("ships one schema-v4 semantic manifest entry for every provider operation", () => {
    expect(hackerNewsWebManifest.schemaVersion).toBe(4);
    expect(hackerNewsWebManifest.id).toBe("hacker-news-web");
    expect(hackerNewsWebManifest.surfaceId).toBe("hacker-news");
    expect(hackerNewsWebManifest.origins).toEqual(["https://news.ycombinator.com"]);
    expect(Object.keys(hackerNewsWebManifest.operations).sort()).toEqual(
      [...HACKER_NEWS_WEB_OPERATION_NAMES].sort(),
    );
    for (const action of HACKER_NEWS_WEB_OPERATION_NAMES) {
      const operation = hackerNewsWebManifest.operations[action];
      const state = HACKER_NEWS_WEB_OPERATIONS[action].state;
      expect(operation.description.startsWith(
        state === "observed"
          ? "Observed contract:"
          : "Capture-required contract reservation:",
      )).toBe(true);
      expect(operation.webSession).toMatchObject({
        site: "hacker-news",
        action,
        contractVersion: 1,
      });
      expect("browser" in operation).toBe(false);
      expect("provider" in operation).toBe(false);
    }
  });

  test("covers the full surface and keeps only content.edit capture-required", () => {
    expect(Object.keys(HACKER_NEWS_WEB_OPERATIONS).sort()).toEqual(
      [...HACKER_NEWS_WEB_OPERATION_NAMES].sort(),
    );
    expect(
      Object.entries(HACKER_NEWS_WEB_OPERATIONS)
        .filter(([, contract]) => contract.state === "observed")
        .map(([name]) => name)
        .sort(),
    ).toEqual([
      "comments.create",
      "comments.read",
      "content.save",
      "feeds.read",
      "posts.publish",
      "posts.read",
      "reactions.set",
      "replies.create",
    ]);
    for (const [name, contract] of Object.entries(HACKER_NEWS_WEB_OPERATIONS)) {
      if (contract.effect === "write") {
        expect(contract.state).toBe(name === "content.edit" ? "capture-required" : "observed");
      }
    }
    expect(HACKER_NEWS_WEB_OPERATIONS["content.edit"].reason).toContain("unobserved");
  });
});

describe("Hacker News exact R1 request authorization", () => {
  test("authorizes the viewer probe and canonical feed read separately on the exact /news route", () => {
    expect(authorizeHackerNewsReadRequest({
      operation: "viewer.current",
      url: "https://news.ycombinator.com/news",
      method: "get",
    })).toEqual({
      operation: "viewer.current",
      method: "GET",
      path: "/news",
      queryNames: [],
    });
    expect(authorizeHackerNewsReadRequest({
      operation: "feeds.read",
      url: "https://news.ycombinator.com/news",
      method: "GET",
    })).toEqual({
      operation: "feeds.read",
      method: "GET",
      path: "/news",
      queryNames: [],
    });
  });

  test("authorizes one exact decimal /item target", () => {
    expect(authorizeHackerNewsReadRequest({
      operation: "comments.read",
      url: `https://news.ycombinator.com/item?id=${POST_ID}`,
      method: "GET",
      targetId: POST_ID,
    })).toEqual({
      operation: "comments.read",
      method: "GET",
      path: "/item",
      queryNames: ["id"],
    });
  });

  test("rejects origin, path, method, duplicate query, body, and target drift", () => {
    const candidates: readonly Parameters<typeof authorizeHackerNewsReadRequest>[0][] = [
      {
        operation: "feeds.read",
        url: "https://news.ycombinator.com/newest",
        method: "GET",
      },
      {
        operation: "viewer.current",
        url: "https://www.ycombinator.com/news",
        method: "GET",
      },
      {
        operation: "posts.read",
        url: `https://news.ycombinator.com/item?id=${POST_ID}`,
        method: "POST",
        targetId: POST_ID,
      },
      {
        operation: "posts.read",
        url: `https://news.ycombinator.com/item?id=${POST_ID}&id=${POST_ID}`,
        method: "GET",
        targetId: POST_ID,
      },
      {
        operation: "posts.read",
        url: `https://news.ycombinator.com/item?id=${SECOND_POST_ID}`,
        method: "GET",
        targetId: POST_ID,
      },
      {
        operation: "posts.read",
        url: `https://news.ycombinator.com/item?id=${POST_ID}`,
        method: "GET",
        body: "",
        targetId: POST_ID,
      },
    ];
    for (const candidate of candidates) {
      expect(() => authorizeHackerNewsReadRequest(candidate)).toThrow();
    }
  });
});

describe("Hacker News bounded HTML projection", () => {
  test("binds exactly one signed-in current-account anchor", () => {
    expect(parseHackerNewsViewerHtml(`<html>${viewer()}</html>`)).toBe("wrench_user");
    expect(() => parseHackerNewsViewerHtml("<html><a href=\"login\">login</a></html>")).toThrow(
      "current-account",
    );
    expect(() => parseHackerNewsViewerHtml(
      `<html>${viewer()}${viewer()}</html>`,
    )).toThrow("exactly one");
  });

  test("projects a bounded front page without action tokens", () => {
    const html = [
      "<html>",
      viewer(),
      submission(POST_ID, "One &amp; only"),
      submission(SECOND_POST_ID, "Second"),
      "<a class=\"morelink\" href=\"news?p=2\">More</a>",
      "</html>",
    ].join("");
    const result = normalizeHackerNewsFeedHtml(html, 1);
    expect(result).toEqual({
      posts: [{
        id: POST_ID,
        title: "One & only",
        url: `https://example.com/${POST_ID}`,
        author: `author_${POST_ID}`,
        body: "",
        createdAt: "2026-07-23T12:00:00Z",
        score: 42,
        commentCount: 3,
      }],
      hasMore: true,
    });
    expect(JSON.stringify(result)).not.toContain("auth=");
    expect(() => normalizeHackerNewsFeedHtml(html, 31)).toThrow("between 1 and 30");
  });

  test("binds one post and validates ordered comment ancestry", () => {
    expect(normalizeHackerNewsPostHtml(itemPage(), POST_ID)).toMatchObject({
      post: {
        id: POST_ID,
        title: "Ask HN: A & B?",
        body: "Line one\n\nLine two",
      },
    });
    const comments = normalizeHackerNewsCommentsHtml(itemPage(), POST_ID, 1);
    expect(comments).toMatchObject({
      post: { id: POST_ID },
      comments: [{
        id: COMMENT_ID,
        postId: POST_ID,
        parentId: POST_ID,
        body: "First <comment>",
        depth: 0,
      }],
      truncated: true,
    });
    expect(() => normalizeHackerNewsPostHtml(itemPage(), SECOND_POST_ID)).toThrow("requested post");
    const skippedDepth = [
      submission(POST_ID),
      comment(REPLY_ID, 1, "No depth-zero parent", null),
    ].join("");
    expect(() => normalizeHackerNewsCommentsHtml(skippedDepth, POST_ID, 10)).toThrow("parent depth");
  });
});

describe("Hacker News request-bound proof parsing", () => {
  test("parses exact favorite and un-favorite actions", () => {
    for (const state of [
      { un: null, nextSavedState: true },
      { un: "t", nextSavedState: false },
    ] as const) {
      // The reviewed item page omits goto; the listing-proven form carries it.
      // Un-favorite is the same /fave endpoint carrying the provider's un=t
      // marker.
      const un = state.un === null ? "" : `&amp;un=${state.un}`;
      for (const [href, goto] of [
        [
          `fave?id=${POST_ID}&amp;auth=${AUTH}${un}`,
          null,
        ],
        [
          `fave?id=${POST_ID}&amp;auth=${AUTH}${un}&amp;goto=item%3Fid%3D${POST_ID}`,
          `item?id=${POST_ID}`,
        ],
      ] as const) {
        const html = submission(
          POST_ID,
          "Favorite fixture",
          `<a href="${href}">${state.un === null ? "favorite" : "un-favorite"}</a>`,
        );
        expect(parseHackerNewsFavoriteAction(html, POST_ID)).toEqual({
          path: "/fave",
          targetId: POST_ID,
          auth: AUTH,
          goto,
          un: state.un,
          nextSavedState: state.nextSavedState,
        });
      }
    }
  });

  test("rejects ambiguous, mismatched, or malformed favorite proofs", () => {
    const action = `<a href="fave?id=${POST_ID}&amp;auth=${AUTH}&amp;goto=news">favorite</a>`;
    expect(() => parseHackerNewsFavoriteAction(
      submission(POST_ID, "Ambiguous", action + action),
      POST_ID,
    )).toThrow("exactly one");
    expect(() => parseHackerNewsFavoriteAction(
      submission(POST_ID, "Mismatch", `<a href="fave?id=${SECOND_POST_ID}&amp;auth=${AUTH}&amp;goto=news">favorite</a>`),
      POST_ID,
    )).toThrow("bind");
    expect(() => parseHackerNewsFavoriteAction(
      submission(POST_ID, "Extra", `<a href="fave?id=${POST_ID}&amp;auth=${AUTH}&amp;goto=news&amp;extra=1">favorite</a>`),
      POST_ID,
    )).toThrow("unsupported");
  });

  test("parses exact comment and submission form proof fields and rejects drift", () => {
    const commentForm = [
      "<form method=\"post\" action=\"comment\">",
      `<input type="hidden" name="parent" value="${POST_ID}">`,
      `<input type="hidden" name="goto" value="item?id=${POST_ID}">`,
      `<input type="hidden" name="hmac" value="${HMAC}">`,
      "<textarea name=\"text\"></textarea>",
      "</form>",
    ].join("");
    expect(parseHackerNewsCommentForm(commentForm, POST_ID)).toEqual({
      parentId: POST_ID,
      goto: `item?id=${POST_ID}`,
      hmac: HMAC,
    });
    expect(() => parseHackerNewsCommentForm(commentForm, SECOND_POST_ID)).toThrow("parent");

    const submitForm = [
      "<form method=\"post\" action=\"r\">",
      `<input type="hidden" name="fnid" value="${FNID}">`,
      `<input type="hidden" name="fnop" value="${FNOP}">`,
      "<input name=\"title\"><input name=\"url\"><textarea name=\"text\"></textarea>",
      "</form>",
    ].join("");
    expect(parseHackerNewsSubmissionForm(submitForm)).toEqual({
      fnid: FNID,
      fnop: FNOP,
    });
    expect(() => parseHackerNewsSubmissionForm(
      submitForm.replace("</form>", `<input type="hidden" name="fnid" value="duplicate"></form>`),
    )).toThrow("repeated");
  });
});

describe("Hacker News write-path read authorization", () => {
  test("authorizes one exact reply form bound to its parent", () => {
    expect(authorizeHackerNewsReadRequest({
      operation: "reply.form",
      url: `https://news.ycombinator.com/reply?id=${COMMENT_ID}&goto=item%3Fid%3D${COMMENT_ID}`,
      method: "GET",
      targetId: COMMENT_ID,
    })).toEqual({
      operation: "reply.form",
      method: "GET",
      path: "/reply",
      queryNames: ["goto", "id"],
    });
  });

  test("authorizes the bare submit form and viewer-bound listing pages", () => {
    expect(authorizeHackerNewsReadRequest({
      operation: "submit.form",
      url: "https://news.ycombinator.com/submit",
      method: "GET",
    })).toEqual({
      operation: "submit.form",
      method: "GET",
      path: "/submit",
      queryNames: [],
    });
    for (const [operation, path] of [
      ["favorites.list", "/favorites"],
      ["submitted.list", "/submitted"],
    ] as const) {
      expect(authorizeHackerNewsReadRequest({
        operation,
        url: `https://news.ycombinator.com${path}?id=wrench_user`,
        method: "GET",
        subject: "wrench_user",
      })).toEqual({
        operation,
        method: "GET",
        path,
        queryNames: ["id"],
      });
    }
  });

  test("rejects write-path reads that lose their exact binding", () => {
    const candidates: readonly Parameters<typeof authorizeHackerNewsReadRequest>[0][] = [
      {
        operation: "reply.form",
        url: `https://news.ycombinator.com/reply?id=${COMMENT_ID}&goto=news`,
        method: "GET",
        targetId: COMMENT_ID,
      },
      {
        operation: "reply.form",
        url: `https://news.ycombinator.com/reply?id=${SECOND_POST_ID}&goto=item%3Fid%3D${COMMENT_ID}`,
        method: "GET",
        targetId: COMMENT_ID,
      },
      {
        operation: "reply.form",
        url: `https://news.ycombinator.com/reply?id=${COMMENT_ID}`,
        method: "GET",
        targetId: COMMENT_ID,
      },
      {
        operation: "submit.form",
        url: "https://news.ycombinator.com/submit?x=1",
        method: "GET",
      },
      {
        operation: "favorites.list",
        url: "https://news.ycombinator.com/favorites?id=another_user",
        method: "GET",
        subject: "wrench_user",
      },
      {
        operation: "submitted.list",
        url: "https://news.ycombinator.com/submitted",
        method: "GET",
        subject: "wrench_user",
      },
      {
        operation: "state.readback",
        url: `https://news.ycombinator.com/item?id=${SECOND_POST_ID}`,
        method: "GET",
        targetId: POST_ID,
      },
    ];
    for (const candidate of candidates) {
      expect(() => authorizeHackerNewsReadRequest(candidate)).toThrow();
    }
  });
});

describe("Hacker News write-path proof and readback parsing", () => {
  function voteHtml(how: "up" | "un" | "down", extraAnchor = ""): string {
    return submission(
      POST_ID,
      "Vote fixture",
      `<a href="vote?id=${POST_ID}&amp;how=${how}&amp;auth=${AUTH}&amp;goto=item%3Fid%3D${POST_ID}">${how}</a>${extraAnchor}`,
    );
  }

  test("parses exact upvote and un-upvote actions", () => {
    expect(parseHackerNewsVoteAction(voteHtml("up"), POST_ID)).toEqual({
      path: "/vote",
      targetId: POST_ID,
      how: "up",
      auth: AUTH,
      goto: `item?id=${POST_ID}`,
      nextUpvotedState: true,
    });
    expect(parseHackerNewsVoteAction(voteHtml("un"), POST_ID)).toEqual({
      path: "/vote",
      targetId: POST_ID,
      how: "un",
      auth: AUTH,
      goto: `item?id=${POST_ID}`,
      nextUpvotedState: false,
    });
    // The reviewed post-upvote page keeps the hidden up arrow beside the live
    // unvote link; the unvote action is the offered one.
    const unAnchor = `<a href="vote?id=${POST_ID}&amp;how=un&amp;auth=${AUTH}&amp;goto=item%3Fid%3D${POST_ID}">un</a>`;
    expect(parseHackerNewsVoteAction(voteHtml("up", unAnchor), POST_ID)).toEqual({
      path: "/vote",
      targetId: POST_ID,
      how: "un",
      auth: AUTH,
      goto: `item?id=${POST_ID}`,
      nextUpvotedState: false,
    });
  });

  test("never substitutes a downvote link for an upvote action", () => {
    const withDown = voteHtml(
      "up",
      `<a href="vote?id=${POST_ID}&amp;how=down&amp;auth=${AUTH}&amp;goto=item%3Fid%3D${POST_ID}">down</a>`,
    );
    expect(parseHackerNewsVoteAction(withDown, POST_ID).how).toBe("up");
    expect(() => parseHackerNewsVoteAction(voteHtml("down"), POST_ID)).toThrow("exactly one");
  });

  test("rejects ambiguous, mismatched, or malformed vote proofs", () => {
    const up = `<a href="vote?id=${POST_ID}&amp;how=up&amp;auth=${AUTH}&amp;goto=news">up</a>`;
    expect(() => parseHackerNewsVoteAction(
      submission(POST_ID, "Ambiguous", up + up),
      POST_ID,
    )).toThrow("ambiguous");
    expect(() => parseHackerNewsVoteAction(
      voteHtml(
        "un",
        `<a href="vote?id=${POST_ID}&amp;how=un&amp;auth=${AUTH}&amp;goto=news">un</a>`,
      ),
      POST_ID,
    )).toThrow("ambiguous");
    expect(() => parseHackerNewsVoteAction(
      submission(
        POST_ID,
        "Mismatch",
        `<a href="vote?id=${SECOND_POST_ID}&amp;how=up&amp;auth=${AUTH}&amp;goto=news">up</a>`,
      ),
      POST_ID,
    )).toThrow("bind");
    expect(() => parseHackerNewsVoteAction(
      submission(
        POST_ID,
        "Extra",
        `<a href="vote?id=${POST_ID}&amp;how=up&amp;auth=${AUTH}&amp;goto=news&amp;extra=1">up</a>`,
      ),
      POST_ID,
    )).toThrow("unsupported");
  });

  test("detects exact item presence on a favorites page", () => {
    const present = [submission(POST_ID), submission(SECOND_POST_ID)].join("");
    expect(parseHackerNewsFavoritesPresence(present, POST_ID)).toBe(true);
    expect(parseHackerNewsFavoritesPresence(present, "49029999")).toBe(false);
    expect(() => parseHackerNewsFavoritesPresence(
      [submission(POST_ID), submission(POST_ID)].join(""),
      POST_ID,
    )).toThrow("repeated");
  });

  test("scans comment rows on both post-rooted and comment-rooted item pages", () => {
    const postRows = scanHackerNewsCommentRows(itemPage(), POST_ID);
    expect(postRows.map((row) => [row.id, row.parentId, row.depth])).toEqual([
      [COMMENT_ID, POST_ID, 0],
      [REPLY_ID, COMMENT_ID, 1],
    ]);

    const commentRooted = [
      viewer(),
      comment(COMMENT_ID, 0, "First &lt;comment&gt;", null),
      comment(REPLY_ID, 1, "Nested<br>reply", COMMENT_ID),
    ].join("");
    const replyRows = scanHackerNewsCommentRows(commentRooted, COMMENT_ID);
    expect(replyRows.map((row) => [row.id, row.parentId, row.depth])).toEqual([
      [COMMENT_ID, null, 0],
      [REPLY_ID, COMMENT_ID, 1],
    ]);
  });

  test("rejects unreviewed comment-page roots and skipped ancestry", () => {
    const secondRoot = [
      comment(COMMENT_ID, 0, "Root", null),
      comment(REPLY_ID, 0, "Second root", null),
    ].join("");
    expect(() => scanHackerNewsCommentRows(secondRoot, COMMENT_ID)).toThrow("second root");
    expect(() => scanHackerNewsCommentRows(
      comment(COMMENT_ID, 1, "No root", null),
      COMMENT_ID,
    )).toThrow("root");
    const skipped = [
      submission(POST_ID),
      comment(COMMENT_ID, 1, "Skipped parent", null),
    ].join("");
    expect(() => scanHackerNewsCommentRows(skipped, POST_ID)).toThrow("parent depth");
  });

  test("finds exactly one comment matching parent, actor, body, and dispatch window", () => {
    const rows = scanHackerNewsCommentRows(itemPage(), POST_ID);
    const window = {
      parentId: POST_ID,
      author: `user_${COMMENT_ID}`,
      body: "First <comment>",
      notBeforeSeconds: Math.floor(Date.parse("2026-07-23T11:00:00Z") / 1_000),
      nowSeconds: Math.floor(Date.parse("2026-07-23T13:00:00Z") / 1_000),
    };
    expect(findHackerNewsCommentRow(rows, window)?.id).toBe(COMMENT_ID);
    expect(findHackerNewsCommentRow(rows, {
      ...window,
      body: "Never posted",
    })).toBe(null);
    expect(findHackerNewsCommentRow(rows, {
      ...window,
      notBeforeSeconds: Math.floor(Date.parse("2026-07-23T13:00:00Z") / 1_000),
    })).toBe(null);
    const doubled = [
      submission(POST_ID),
      comment(COMMENT_ID, 0, "Same", null),
      comment(REPLY_ID, 0, "Same", null).replaceAll(`user_${REPLY_ID}`, `user_${COMMENT_ID}`),
    ].join("");
    expect(() => findHackerNewsCommentRow(
      scanHackerNewsCommentRows(doubled, POST_ID),
      { ...window, body: "Same", author: `user_${COMMENT_ID}` },
    )).toThrow("ambiguous");
  });

  test("finds exactly one submitted row matching actor, title, link, and window", () => {
    const listing = [
      viewer(),
      submission(POST_ID, "Shipped feature"),
      submission(SECOND_POST_ID, "Other story"),
    ].join("");
    const window = {
      author: `author_${POST_ID}`,
      title: "Shipped feature",
      url: `https://example.com/${POST_ID}`,
      notBeforeSeconds: Math.floor(Date.parse("2026-07-23T11:00:00Z") / 1_000),
      nowSeconds: Math.floor(Date.parse("2026-07-23T13:00:00Z") / 1_000),
    };
    expect(findHackerNewsSubmittedRow(listing, window)?.id).toBe(POST_ID);
    expect(findHackerNewsSubmittedRow(listing, {
      ...window,
      url: "https://wrong.example.com/",
    })).toBe(null);
    expect(findHackerNewsSubmittedRow(listing, {
      ...window,
      author: "another_user",
    })).toBe(null);
    const textPost = submission(POST_ID, "Ask HN: fixture")
      .replace(`https://example.com/${POST_ID}`, `item?id=${POST_ID}`);
    expect(findHackerNewsSubmittedRow(textPost, {
      ...window,
      title: "Ask HN: fixture",
      url: null,
    })?.id).toBe(POST_ID);
  });
});

describe("Hacker News write-path strict-input laws", () => {
  const safeParamChar = fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split(""),
  );
  const safeParam = fc.string({ unit: safeParamChar, minLength: 1, maxLength: 24 });
  const validItemId = fc
    .bigInt({ min: 1n, max: 99_999_999_999_999_999_999n })
    .map((value) => value.toString(10));

  test("rejects every vote direction outside the two reviewed actions", () => {
    assertProperty(fc.property(
      safeParam.filter((how) => how !== "up" && how !== "un"),
      (how) => {
        const html = submission(
          POST_ID,
          "Vote law",
          `<a href="vote?id=${POST_ID}&amp;how=${how}&amp;auth=${AUTH}&amp;goto=news">${how}</a>`,
        );
        expect(() => parseHackerNewsVoteAction(html, POST_ID)).toThrow();
      },
    ));
  });

  test("rejects every malformed item identifier before any page is read", () => {
    const decimal = /^[1-9][0-9]{0,19}$/u;
    assertProperty(fc.property(
      fc.string({ maxLength: 40 }).filter((id) => !decimal.test(id)),
      (id) => {
        expect(() => parseHackerNewsVoteAction("", id)).toThrow();
        expect(() => parseHackerNewsFavoriteAction("", id)).toThrow();
        expect(() => authorizeHackerNewsReadRequest({
          operation: "state.readback",
          url: `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`,
          method: "GET",
          targetId: POST_ID,
        })).toThrow();
      },
    ));
  });

  test("binds listing reads to the one confirmed viewer and nothing else", () => {
    assertProperty(fc.property(
      fc.string({ maxLength: 80 }).filter((name) => name !== "wrench_user"),
      (name) => {
        for (const [operation, path] of [
          ["favorites.list", "/favorites"],
          ["submitted.list", "/submitted"],
        ] as const) {
          expect(() => authorizeHackerNewsReadRequest({
            operation,
            url: `https://news.ycombinator.com${path}?id=wrench_user`,
            method: "GET",
            subject: name,
          })).toThrow();
        }
      },
    ));
  });

  test("never accepts a submission form carrying unreviewed hidden fields", () => {
    assertProperty(fc.property(
      safeParam.filter((name) => name !== "fnid" && name !== "fnop"),
      (name) => {
        const form = [
          "<form method=\"post\" action=\"r\">",
          `<input type="hidden" name="fnid" value="${FNID}">`,
          `<input type="hidden" name="fnop" value="${FNOP}">`,
          `<input type="hidden" name="${name}" value="extra">`,
          "<input name=\"title\"><input name=\"url\"><textarea name=\"text\"></textarea>",
          "</form>",
        ].join("");
        expect(() => parseHackerNewsSubmissionForm(form)).toThrow();
      },
    ));
  });

  test("binds the parsed favorite action to whichever exact item the page offers", () => {
    assertProperty(fc.property(validItemId, (id) => {
      const html = submission(
        id,
        "Favorite law",
        `<a href="fave?id=${id}&amp;auth=${AUTH}&amp;goto=news">favorite</a>`,
      );
      const action = parseHackerNewsFavoriteAction(html, id);
      expect(action.targetId).toBe(id);
      expect(action.nextSavedState).toBe(true);
    }));
  });
});
