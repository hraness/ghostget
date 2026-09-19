import { describe, expect, test } from "bun:test";
import fc from "fast-check";

import {
  canonicalJson,
  canonicalJsonFileSerializations,
  canonicalJsonFileSha256Matches,
  canonicalJsonFileSha256Variants,
  canonicalJsonScriptLiteral,
  canonicalJsonSerializations,
  canonicalJsonSha256Matches,
  canonicalJsonSha256Variants,
  isCanonicalJsonFileText,
  isCanonicalJsonText,
  jsonScriptLiteral,
  legacyCanonicalJson,
  sha256,
} from "./canonical-json";

// fast-check dictionaries cannot represent a "__proto__" member as an own
// property, so exclude it from generated objects. Array-index-like member
// names are excluded as well: JavaScript always enumerates them first, so a
// JSON.parse round trip could not observe their serialized document order.
const memberNameArbitrary = fc
  .string()
  .filter((key) => key !== "__proto__" && !/^(0|[1-9]\d*)$/.test(key));
const dictionaryArbitrary = fc.dictionary(memberNameArbitrary, fc.jsonValue());

describe("canonicalJson RFC 8785 member ordering", () => {
  test("orders members by UTF-16 code units", () => {
    // ASCII uppercase sorts before lowercase under UTF-16, while locale
    // collation sorts alphabetically regardless of case.
    expect(canonicalJson({ a: 1, Z: 2 })).toBe('{"Z":2,"a":1}');
    expect(
      canonicalJson({ "€": "euro", "é": "e", "a": "A", "1": "one", "\r": "cr" }),
    ).toBe('{"\\r":"cr","1":"one","a":"A","é":"e","€":"euro"}');
  });

  test("sorts astral-plane keys by their UTF-16 surrogate-pair units", () => {
    // U+10000 encodes as D800 DC00, so under UTF-16 code-unit ordering it
    // precedes U+FFFF even though its code point is larger.
    expect(canonicalJson({ "￿": 1, "𐀀": 2 })).toBe(
      '{"𐀀":2,"￿":1}',
    );
    expect(canonicalJson({ "😀": 1, "☃": 2 })).toBe('{"☃":2,"😀":1}');
  });

  test("serializes members in exactly the same order as the default string sort", () => {
    fc.assert(
      fc.property(dictionaryArbitrary, (value) => {
        expect(Object.keys(JSON.parse(canonicalJson(value)))).toEqual(
          Object.keys(value).sort(),
        );
      }),
    );
  });

  test("is independent of property insertion order", () => {
    fc.assert(
      fc.property(dictionaryArbitrary, (value) => {
        const reversed = Object.fromEntries(Object.entries(value).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(value));
      }),
    );
  });

  test("round-trips generated JSON values", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        // JSON cannot represent -0 distinctly: RFC 8785 serializes it as 0,
        // so the round trip is measured against the value the standard
        // JSON.stringify/JSON.parse pair produces, not the raw input.
        expect(JSON.parse(canonicalJson(value))).toEqual(
          JSON.parse(JSON.stringify(value)),
        );
      }),
    );
  });

  test("keeps golden nested-object ordering", () => {
    expect(canonicalJson({ b: 1, a: { d: 4, c: [3, { f: 6, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":6}],"d":4},"b":1}',
    );
  });

  test("drops members whose value is undefined and recurses", () => {
    expect(
      canonicalJson({ b: undefined, a: [{ d: undefined, c: 1 }] }),
    ).toBe('{"a":[{"c":1}]}');
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(-0)).toBe("0");
  });

  test("rejects non-JSON-compatible values", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow("non-finite");
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow("non-finite");
    expect(() => canonicalJson(1n)).toThrow("supports only JSON-compatible");
    expect(() => canonicalJson(() => 1)).toThrow("supports only JSON-compatible");
    expect(() => canonicalJson(Symbol.for("x"))).toThrow(
      "supports only JSON-compatible",
    );
  });
});

describe("canonicalJson locale-collapse fix", () => {
  const precomposed = "\u00e4"; // NFC
  const decomposed = "a\u0308"; // NFD: "a" + combining diaeresis

  test("orders keys locale collation reports as equal by code units", () => {
    // UTF-16 compares the first code unit: "a" (0x61) < "ä" (0xE4), so the
    // decomposed spelling always sorts first regardless of insertion order.
    const forward = canonicalJson({ [decomposed]: 1, [precomposed]: 2 });
    const backward = canonicalJson({ [precomposed]: 2, [decomposed]: 1 });
    expect(forward).toBe('{"a\u0308":1,"\u00e4":2}');
    expect(backward).toBe(forward);
    // The dual-read list always carries the current encoding first and the
    // legacy encoding second when it differs; whether it differs depends on
    // the runtime collation.
    const reordered = { [precomposed]: 2, [decomposed]: 1 };
    const serializations = canonicalJsonSerializations(reordered);
    expect(serializations[0]).toBe(forward);
    expect(serializations.at(-1)).toBe(legacyCanonicalJson(reordered));
    if (precomposed.localeCompare(decomposed) === 0) {
      expect(serializations).toEqual([forward, '{"\u00e4":2,"a\u0308":1}']);
    }
  });

  test("documents the legacy encoding's insertion-order dependence", () => {
    // The migration exists because localeCompare can report distinct keys as
    // equal; JavaScript's stable sort then emits them in insertion order.
    const forward = legacyCanonicalJson({ [decomposed]: 1, [precomposed]: 2 });
    const backward = legacyCanonicalJson({ [precomposed]: 2, [decomposed]: 1 });
    expect(forward === backward).toBe(precomposed.localeCompare(decomposed) !== 0);
  });
});

describe("legacyCanonicalJson", () => {
  test("retains the historical locale-collation member ordering", () => {
    // Locale collation sorts alphabetically ("a" before "Z"), the reverse of
    // UTF-16 code-unit ordering, so this value always has two serializations.
    expect(legacyCanonicalJson({ a: 1, Z: 2 })).toBe('{"a":1,"Z":2}');
    expect(legacyCanonicalJson({ Z: 2, a: 1 })).toBe('{"a":1,"Z":2}');
    expect(canonicalJsonSerializations({ a: 1, Z: 2 })).toEqual([
      '{"Z":2,"a":1}',
      '{"a":1,"Z":2}',
    ]);
  });
});

describe("canonicalJson dual-read helpers", () => {
  // Every locale sorts "a" before "Z", so this value serializes differently
  // under the two orderings in any runtime.
  const divergent = { a: 1, Z: 2 };
  const currentText = canonicalJson(divergent);
  const legacyText = legacyCanonicalJson(divergent);

  test("returns one serialization when the orderings agree", () => {
    const value = { b: 1, a: { d: 4, c: 3 }, nested: [{ y: 1, x: 2 }] };
    expect(canonicalJsonSerializations(value)).toEqual([canonicalJson(value)]);
    expect(canonicalJsonSha256Variants(value)).toEqual([
      sha256(canonicalJson(value)),
    ]);
  });

  test("accepts a legacy-persisted serialization of the same value", () => {
    expect(currentText).not.toBe(legacyText);
    expect(isCanonicalJsonText(legacyText, divergent)).toBeTrue();
    expect(isCanonicalJsonText(currentText, divergent)).toBeTrue();
  });

  test("rejects malformed and noncanonical text", () => {
    expect(isCanonicalJsonText('{"a":1,"Z":2,"extra":3}', divergent)).toBeFalse();
    expect(isCanonicalJsonText('{ "Z": 2, "a": 1 }', divergent)).toBeFalse();
    expect(isCanonicalJsonText("", divergent)).toBeFalse();
    expect(isCanonicalJsonText("not json", divergent)).toBeFalse();
    expect(isCanonicalJsonText(legacyText, { a: 1, Z: 3 })).toBeFalse();
  });

  test("accepts either newline-terminated state-file serialization", () => {
    expect(isCanonicalJsonFileText(`${currentText}\n`, divergent)).toBeTrue();
    expect(isCanonicalJsonFileText(`${legacyText}\n`, divergent)).toBeTrue();
    expect(isCanonicalJsonFileText(currentText, divergent)).toBeFalse();
    expect(isCanonicalJsonFileText(`${currentText}\n\n`, divergent)).toBeFalse();
    expect(canonicalJsonFileSerializations(divergent)).toEqual([
      `${currentText}\n`,
      `${legacyText}\n`,
    ]);
  });

  test("matches semantic digests under either serialization", () => {
    expect(canonicalJsonSha256Variants(divergent)).toEqual([
      sha256(currentText),
      sha256(legacyText),
    ]);
    expect(canonicalJsonSha256Matches(sha256(currentText), divergent)).toBeTrue();
    expect(canonicalJsonSha256Matches(sha256(legacyText), divergent)).toBeTrue();
    expect(canonicalJsonSha256Matches(sha256("{}"), divergent)).toBeFalse();
    expect(canonicalJsonFileSha256Variants(divergent)).toEqual([
      sha256(`${currentText}\n`),
      sha256(`${legacyText}\n`),
    ]);
    expect(
      canonicalJsonFileSha256Matches(sha256(`${legacyText}\n`), divergent),
    ).toBeTrue();
    expect(
      canonicalJsonFileSha256Matches(sha256(`${legacyText}`), divergent),
    ).toBeFalse();
  });

  test("keeps actual-byte content hashes bound to the exact encoding", () => {
    // Semantic digests may match either encoding, but a hash of stored bytes
    // still authenticates exactly those bytes: the legacy file cannot pass as
    // the v2 file.
    expect(sha256(currentText)).not.toBe(sha256(legacyText));
    expect(canonicalJsonFileSha256Variants(divergent)).not.toContain(
      sha256(currentText) === sha256(`${currentText}\n`)
        ? sha256(legacyText)
        : sha256(legacyText),
    );
    expect(sha256(`${currentText}\n`)).not.toBe(sha256(`${legacyText}\n`));
  });

  test("accepts the legacy serialization for arbitrary generated values", () => {
    fc.assert(
      fc.property(dictionaryArbitrary, (value) => {
        const serializations = canonicalJsonSerializations(value);
        expect(serializations.length).toBeLessThanOrEqual(2);
        expect(serializations[0]).toBe(canonicalJson(value));
        expect(isCanonicalJsonText(legacyCanonicalJson(value), value)).toBeTrue();
        expect(
          canonicalJsonSha256Matches(sha256(legacyCanonicalJson(value)), value),
        ).toBeTrue();
        expect(
          isCanonicalJsonFileText(`${legacyCanonicalJson(value)}\n`, value),
        ).toBeTrue();
      }),
    );
  });
});

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

  test("uses the RFC 8785 member ordering", () => {
    expect(canonicalJsonScriptLiteral({ a: 1, Z: 2 })).toBe('{"Z":2,"a":1}');
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

describe("jsonScriptLiteral", () => {
  test("keeps insertion order while escaping script-terminating characters", () => {
    const value = { z: "</script>", a: "\u2028<", n: 1 };
    const literal = jsonScriptLiteral(value);
    expect(literal).toBe('{"z":"\\u003c/script\\u003e","a":"\\u2028\\u003c","n":1}');
    expect(JSON.parse(literal)).toEqual(value);
    expect(jsonScriptLiteral("__key_0123")).toBe(JSON.stringify("__key_0123"));
  });

  test("never emits raw angle brackets or line separators and preserves the value", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const literal = jsonScriptLiteral(value);
        expect(literal).not.toMatch(/[<>\u2028\u2029]/u);
        expect(JSON.stringify(JSON.parse(literal))).toBe(JSON.stringify(value));
      }),
    );
  });
});
