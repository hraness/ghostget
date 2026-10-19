import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { assertProperty } from "../src/test-support";
import {
  isNoindexDocumentPath,
  NOINDEX_ESSAY_PATHS,
  NOINDEX_ROBOTS,
} from "./robots";

describe("noindex document paths", () => {
  test("keeps the curated directory and guides indexable", () => {
    expect(NOINDEX_ROBOTS).toBe("noindex, follow");
    for (const path of [
      "/",
      "/providers/",
      "/providers/beeper/",
      "/providers/whatsapp/",
      "/compare/",
      "/compare/personal-agents-browser-use/",
    ]) {
      expect(isNoindexDocumentPath(path)).toBe(false);
    }
  });

  test("excludes the dated news takes", () => {
    for (const path of NOINDEX_ESSAY_PATHS) expect(isNoindexDocumentPath(path)).toBe(true);
  });

  test("property: an undotted provider guide slug is never noindex", () => {
    assertProperty(
      fc.property(fc.stringMatching(/^[a-z0-9-]{1,20}$/u), (slug) =>
        !isNoindexDocumentPath(`/providers/${slug}/`)),
    );
  });
});
