import { describe, expect, test } from "bun:test";

import { canonicalJson } from "./canonical-json";
import { providerPluginSemanticIdentityText } from "./provider-plugin-registry";
import { assertProperty, fc } from "./test-support";

function rejects(action: () => unknown): boolean {
  try {
    action();
    return false;
  } catch {
    return true;
  }
}

describe("provider plugin semantic identity value domain", () => {
  test("keeps the reviewed bytes for plain definitions with functions and mixed member names", () => {
    // Integer-like names enumerate first under JSON.stringify; the rest keep
    // UTF-8 byte order (U+FFFF before U+1F600). Built-in implementation
    // identities hash exactly this text, so it must not move.
    const definition = {
      b: 1,
      a: [() => 1, { d: undefined, c: "x" }],
      10: true,
      2: null,
      "\u{1f600}": 1,
      "￿": 2,
    };
    expect(providerPluginSemanticIdentityText(definition)).toBe(
      '{"2":null,"10":true,"a":["@provider-plugin-function",{"c":"x"}],"b":1,"￿":2,"\u{1f600}":1}',
    );
  });

  test("rejects Map, Date, typed arrays, and class instances instead of collapsing them onto {}", () => {
    class Matcher {
      constructor(readonly pattern: string) {}
    }
    for (const value of [
      new Map([["a", 1]]),
      new Date(0),
      new Uint8Array([1]),
      new Matcher("a"),
      /a/u,
    ]) {
      expect(() => providerPluginSemanticIdentityText({ bindings: [{ value }] }))
        .toThrow("JSON-compatible: non-plain object");
    }
  });

  test("rejects holes, accessors, and symbol-keyed members", () => {
    // A hole previously encoded as null, colliding with an explicit null.
    expect(() => providerPluginSemanticIdentityText([, null]))
      .toThrow("JSON-compatible: sparse or decorated array");
    expect(() => providerPluginSemanticIdentityText(
      Object.defineProperty({}, "a", { get: () => 1, enumerable: true }),
    )).toThrow("JSON-compatible: accessor or non-enumerable member");
    // Hidden members stay out of the identity, as they always have.
    expect(providerPluginSemanticIdentityText(
      Object.defineProperty({ b: 1 }, "a", { value: 1 }),
    )).toBe('{"b":1}');
    expect(() => providerPluginSemanticIdentityText({ [Symbol("s")]: 1 }))
      .toThrow("JSON-compatible: symbol field");
  });

  test("keeps a literal __proto__ member instead of writing the prototype", () => {
    const primitive = JSON.parse('{"__proto__":0,"a":1}') as unknown;
    expect(providerPluginSemanticIdentityText(primitive)).toBe('{"__proto__":0,"a":1}');
    const nested = JSON.parse('{"__proto__":{"x":1},"a":1}') as unknown;
    expect(providerPluginSemanticIdentityText(nested)).toBe('{"__proto__":{"x":1},"a":1}');
    expect(providerPluginSemanticIdentityText(nested))
      .not.toBe(providerPluginSemanticIdentityText({ a: 1 }));
  });

  test("property: accepts exactly the canonical JSON value domain and round-trips it", () => {
    assertProperty(fc.property(
      fc.anything({
        maxDepth: 3,
        withBigInt: true,
        withBoxedValues: true,
        withDate: true,
        withMap: true,
        withNullPrototype: true,
        withSet: true,
        withSparseArray: true,
        withTypedArray: true,
      }),
      (value) => {
        let text: string | undefined;
        try {
          text = providerPluginSemanticIdentityText(value);
        } catch {
          text = undefined;
        }
        expect(text === undefined).toBe(rejects(() => canonicalJson(value)));
        if (text === undefined) return;
        expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(value)));
      },
    ));
  });
});
