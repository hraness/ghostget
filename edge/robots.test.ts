import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { assertProperty } from "../src/test-support";
import {
  isNoindexDocumentPath,
  NOINDEX_ESSAY_PATHS,
  NOINDEX_ROBOTS,
  WEBMCP_DOMAIN_HEADER_SOURCE,
} from "./robots";

describe("noindex document paths", () => {
  test("keeps the curated directory and guides indexable", () => {
    expect(NOINDEX_ROBOTS).toBe("noindex, follow");
    for (const path of [
      "/",
      "/providers/",
      "/providers/beeper/",
      "/providers/whatsapp/",
      "/webmcp/",
      "/docs/how-to/use-webmcp-sites/",
      "/compare/",
      "/compare/personal-agents-browser-use/",
    ]) {
      expect(isNoindexDocumentPath(path)).toBe(false);
    }
  });

  test("excludes the dated news takes and every registry domain page", () => {
    for (const path of NOINDEX_ESSAY_PATHS) expect(isNoindexDocumentPath(path)).toBe(true);
    for (const path of ["/providers/target.com/", "/providers/docs.example.co.uk/"]) {
      expect(isNoindexDocumentPath(path)).toBe(true);
    }
    expect(isNoindexDocumentPath("/providers/target.com/extra/")).toBe(false);
    expect(isNoindexDocumentPath("/providers/target.com")).toBe(false);
  });

  test("property: a dotted registry domain page is always noindex", () => {
    const label = fc.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,10}[a-z0-9])?$/u);
    assertProperty(
      fc.property(fc.array(label, { minLength: 2, maxLength: 4 }), (labels) =>
        isNoindexDocumentPath(`/providers/${labels.join(".")}/`)),
    );
  });

  test("the Vercel header source covers each domain page and Markdown sibling only", () => {
    // path-to-regexp compiles `/:site(<re>)(<re>)` to anchored groups; mirror
    // that so a source edit that stops matching the trailing-slash page fails.
    const compiled = new RegExp(`^${WEBMCP_DOMAIN_HEADER_SOURCE.replace(":site(", "(")}$`, "u");
    for (const path of [
      "/providers/target.com/",
      "/providers/target.com.md",
      "/providers/docs.example.co.uk/",
      "/providers/docs.example.co.uk.md",
    ]) {
      expect(compiled.test(path)).toBe(true);
    }
    for (const path of [
      "/providers/",
      "/providers.md",
      "/providers/index.html",
      "/providers/beeper/",
      "/providers/beeper.md",
      "/providers/whatsapp/",
      "/providers/target.com",
      "/providers/target.com/extra/",
    ]) {
      expect(compiled.test(path)).toBe(false);
    }
    assertProperty(
      fc.property(fc.stringMatching(/^\/providers\/[a-z0-9.-]{1,24}\/$/u), (path) =>
        compiled.test(path) === isNoindexDocumentPath(path)),
    );
  });

  test("property: an undotted provider guide slug is never noindex", () => {
    assertProperty(
      fc.property(fc.stringMatching(/^[a-z0-9-]{1,20}$/u), (slug) =>
        !isNoindexDocumentPath(`/providers/${slug}/`)),
    );
  });
});
