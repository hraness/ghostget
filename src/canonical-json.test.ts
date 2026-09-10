import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import { canonicalJson, canonicalJsonScriptLiteral } from "./canonical-json";

describe("canonicalJsonScriptLiteral", () => {
  test("escapes script-terminating characters and parses to the same value", () => {
    const value = { text: "</script>\u2028next\u2029<b>", count: 3, nested: ["<", ">"] };
    const literal = canonicalJsonScriptLiteral(value);
    expect(literal).toBe(
      '{"count":3,"nested":["\\u003c","\\u003e"],"text":"\\u003c/script\\u003e\\u2028next\\u2029\\u003cb\\u003e"}',
    );
    expect(JSON.parse(literal)).toEqual(value);
  });

  test("leaves canonical JSON without those characters unchanged", () => {
    const value = { stagingKey: "__ghostgetLinkedInPostImage_0123", expectedChunkCount: 4 };
    expect(canonicalJsonScriptLiteral(value)).toBe(canonicalJson(value));
  });

  test("never emits raw angle brackets or line separators and preserves the value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const literal = canonicalJsonScriptLiteral(value);
        expect(literal).not.toMatch(/[<>\u2028\u2029]/u);
        expect(canonicalJson(JSON.parse(literal))).toBe(canonicalJson(value));
      }),
    );
  });
});
