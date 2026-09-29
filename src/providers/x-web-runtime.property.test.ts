import { expect, test } from "bun:test";

import { assertProperty, fc } from "../test-support";
import { projectXWebContactPage } from "./x-web";
import { resolveCurrentXWebChunkUrl } from "./x-web-runtime";

const BOOKMARKS_FAMILY = "shared~bundle.BookmarkFolders~bundle.Bookmarks";
const REVIEWED_SOURCE_CHUNK = `${BOOKMARKS_FAMILY}.12cb1875a99ef5b3a.js`;
const HEX = "0123456789abcdef";

const hexOfWidth = (width: number) =>
  fc.array(fc.constantFrom(...HEX), { minLength: width, maxLength: width })
    .map((characters) => characters.join(""));

function webpackMapHtml(hash: string): string {
  return [
    `prefix;p.u=e=>({202:"${BOOKMARKS_FAMILY}"}`,
    `)[e]||e)+"."+({202:"${hash}"}`,
    `)[e]+"a.js";suffix`,
  ].join("");
}

test("current webpack hash maps resolve Bookmarks for reviewed 7-hex and 16-hex widths", () => {
  assertProperty(fc.property(
    fc.oneof(hexOfWidth(7), hexOfWidth(16)),
    (hash) => {
      expect(resolveCurrentXWebChunkUrl(webpackMapHtml(hash), REVIEWED_SOURCE_CHUNK).href).toBe(
        `https://abs.twimg.com/responsive-web/client-web/${BOOKMARKS_FAMILY}.${hash}a.js`,
      );
    },
  ));
});

test("current webpack hash maps fail closed for unreviewed hash widths", () => {
  assertProperty(fc.property(
    fc.integer({ min: 1, max: 24 }).filter((width) => width !== 7 && width !== 16),
    hexOfWidth(24),
    (width, pad) => {
      expect(() => resolveCurrentXWebChunkUrl(
        webpackMapHtml(pad.slice(0, width)),
        REVIEWED_SOURCE_CHUNK,
      )).toThrow("omitted the reviewed logical chunk hash");
    },
  ));
});

test("revision evidence accepts historical 8-hex and current 17-hex asset names", () => {
  assertProperty(fc.property(
    fc.oneof(hexOfWidth(8), hexOfWidth(17)),
    (assetHash) => {
      expect(resolveCurrentXWebChunkUrl(
        webpackMapHtml("deadbee"),
        `${BOOKMARKS_FAMILY}.${assetHash}.js`,
      ).href).toBe(
        `https://abs.twimg.com/responsive-web/client-web/${BOOKMARKS_FAMILY}.deadbeea.js`,
      );
    },
  ));
});

test("revision evidence fails closed for unreviewed asset-name hash widths", () => {
  assertProperty(fc.property(
    fc.integer({ min: 1, max: 24 }).filter((width) => width !== 8 && width !== 17),
    hexOfWidth(24),
    (width, pad) => {
      expect(() => resolveCurrentXWebChunkUrl(
        webpackMapHtml("deadbee"),
        `${BOOKMARKS_FAMILY}.${pad.slice(0, width)}.js`,
      )).toThrow("source chunk is not a reviewed hashed JavaScript asset");
    },
  ));
});

const digitId = fc.array(fc.constantFrom(..."0123456789"), { minLength: 1, maxLength: 19 })
  .map((digits) => digits.join(""));

const timelineEntry = fc.oneof(
  digitId.map((id) => ({
    entryId: `user-${id}`,
    sortIndex: "100",
    content: {
      entryType: "TimelineTimelineItem",
      itemContent: {
        itemType: "TimelineUser",
        user_results: { result: { __typename: "User", rest_id: id } },
      },
    },
  })),
  digitId.map((id) => ({
    entryId: `user-${id}`,
    sortIndex: "100",
    content: {
      entryType: "TimelineTimelineItem",
      itemContent: {
        itemType: "TimelineUser",
        user_results: { result: { __typename: "UserUnavailable" } },
      },
    },
  })),
  fc.constant({
    entryId: "prompt-1",
    sortIndex: "50",
    content: {
      entryType: "TimelineTimelineItem",
      itemContent: { itemType: "TimelinePrompt" },
    },
  }),
);

function contactsResponse(
  entries: readonly unknown[],
  bottomCursor: string | null,
): unknown {
  return {
    data: {
      user: {
        result: {
          __typename: "User",
          rest_id: "123456789012345678",
          timeline: {
            timeline: {
              instructions: [{
                type: "TimelineAddEntries",
                entries: [
                  ...entries,
                  ...(bottomCursor === null ? [] : [{
                    entryId: "cursor-bottom",
                    sortIndex: "1",
                    content: {
                      entryType: "TimelineTimelineCursor",
                      cursorType: "Bottom",
                      value: bottomCursor,
                    },
                  }]),
                ],
              }],
            },
          },
        },
      },
    },
  };
}

test("contact pages never expose a cursor after truncation and project only users", () => {
  assertProperty(fc.property(
    fc.array(timelineEntry, { minLength: 0, maxLength: 30 }),
    fc.integer({ min: 1, max: 40 }),
    fc.option(fc.string({ minLength: 1, maxLength: 32 }), { nil: null }),
    (entries, limit, bottomCursor) => {
      const response = contactsResponse(entries, bottomCursor);
      let page: ReturnType<typeof projectXWebContactPage> | null = null;
      let threw = false;
      try {
        page = projectXWebContactPage("contacts.following", response, limit);
      } catch {
        threw = true;
      }
      // Users come only from TimelineUser rows that resolve real User results;
      // the normalizer deduplicates repeated entryIds, last write wins.
      const deduped = [...new Map(entries.map((entry) =>
        [(entry as { entryId: string }).entryId, entry] as const)).values()];
      const realUsers = deduped.filter((entry) => {
        const content = (entry as { content: { itemContent: { itemType: string; user_results?: { result?: { __typename?: string } } } } }).content.itemContent;
        return content.itemType === "TimelineUser" && content.user_results?.result?.__typename === "User";
      });
      if (realUsers.length > limit && bottomCursor === null) {
        expect(threw).toBe(true);
        return;
      }
      expect(threw).toBe(false);
      expect(page?.users.length).toBe(Math.min(realUsers.length, limit));
      if (realUsers.length > limit) {
        expect(page?.cursor).toBeNull();
      } else {
        expect(page?.cursor ?? null).toBe(bottomCursor);
      }
    },
  ));
});
