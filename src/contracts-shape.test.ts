import { describe, expect, test } from "bun:test";

import { schemaViolations } from "./contracts-schema.test-support";
import {
  ContractParseError,
  parseShape,
  shapeJsonSchema,
  type Shape,
  type ShapeDefinitions,
} from "./contracts-shape";
import { assertProperty, fc } from "./test-support";

const definitions: ShapeDefinitions = {
  leaf: {
    kind: "object",
    properties: {
      name: { kind: "string", minLength: 1, maxLength: 8, pattern: /^[a-z]+$/u },
      count: { kind: "integer", minimum: 0, maximum: 10 },
      note: { kind: "string", maxLength: 4 },
    },
    optional: ["note"],
  },
};

const sink: Shape = {
  kind: "object",
  properties: {
    kind: { kind: "literal", value: "sink" },
    mode: { kind: "enum", values: ["a", "b", 3] },
    flag: { kind: "boolean" },
    nothing: { kind: "null" },
    ratio: { kind: "number" },
    when: { kind: "string", minLength: 24, maxLength: 24, format: "date-time" },
    leaves: { kind: "array", items: { kind: "ref", name: "leaf" }, maxItems: 3, uniqueItems: true },
    tags: { kind: "record", values: { kind: "boolean" }, keyPattern: /^[a-z]{1,3}$/u, maxProperties: 2 },
    choice: {
      kind: "union",
      variants: [
        { kind: "object", properties: { kind: { kind: "literal", value: "x" } } },
        { kind: "object", properties: { kind: { kind: "literal", value: "y" }, size: { kind: "integer", minimum: 1, maximum: 3 } } },
      ],
    },
    payload: { kind: "json", maxDepth: 3, maxNodes: 12 },
  },
  optional: ["ratio"],
};

const schema = shapeJsonSchema(sink, { title: "sink", description: "kitchen sink", definitions });

const leafArbitrary = fc.record({
  name: fc.stringMatching(/^[a-z]{1,8}$/u),
  count: fc.integer({ min: 0, max: 10 }),
  note: fc.string({ maxLength: 4 }),
}, { requiredKeys: ["name", "count"] });

const validSinkArbitrary = fc.record({
  kind: fc.constant("sink"),
  mode: fc.constantFrom("a", "b", 3),
  flag: fc.boolean(),
  nothing: fc.constant(null),
  ratio: fc.double({ noNaN: true, noDefaultInfinity: true }).map((ratio) => Object.is(ratio, -0) ? 0 : ratio),
  when: fc.date({ min: new Date(0), max: new Date("2099-01-01"), noInvalidDate: true }).map((date) => date.toISOString()),
  leaves: fc.uniqueArray(leafArbitrary, { maxLength: 3, selector: (leaf) => JSON.stringify(leaf) }),
  tags: fc.dictionary(fc.stringMatching(/^[a-z]{1,3}$/u), fc.boolean(), { maxKeys: 2 }),
  choice: fc.oneof(
    fc.constant({ kind: "x" }),
    fc.record({ kind: fc.constant("y"), size: fc.integer({ min: 1, max: 3 }) }),
  ),
  payload: fc.oneof(
    fc.string({ maxLength: 5 }),
    fc.integer(),
    fc.array(fc.integer(), { maxLength: 3 }),
    fc.dictionary(fc.stringMatching(/^[a-z]{1,3}$/u), fc.integer(), { maxKeys: 3 }),
  ),
}, { requiredKeys: ["kind", "mode", "flag", "nothing", "when", "leaves", "tags", "choice", "payload"] });

/** Arbitrary JSON-ish values, including ones outside the shape. */
const anyJsonArbitrary = fc.jsonValue({ maxDepth: 4 });

describe("contract shape parsing", () => {
  test("accepts a complete document and returns a deep-frozen copy with only declared keys", () => {
    const value = {
      kind: "sink",
      mode: 3,
      flag: true,
      nothing: null,
      when: "2026-09-21T20:00:00.000Z",
      leaves: [{ name: "abc", count: 2 }],
      tags: { ab: true },
      choice: { kind: "y", size: 2 },
      payload: { nested: [1, 2, { deep: "x" }] },
    };
    const parsed = parseShape<Record<string, unknown>>(sink, value, "doc", definitions);
    expect(parsed).toEqual(value);
    expect(Object.isFrozen(parsed)).toBeTrue();
    expect(Object.isFrozen(parsed.leaves)).toBeTrue();
    expect(Object.isFrozen((parsed.payload as { nested: unknown[] }).nested[2])).toBeTrue();
    expect(schemaViolations(schema, value)).toEqual([]);
  });

  test("names the offending path in each rejection", () => {
    const cases: readonly [unknown, string][] = [
      [{ ...base(), extra: 1 }, "doc has an unsupported key extra"],
      [{ ...base(), leaves: [{ name: "abc" }] }, "doc.leaves[0] is missing required key count"],
      [{ ...base(), leaves: [{ name: "ABC", count: 1 }] }, "doc.leaves[0].name does not match its required pattern"],
      [{ ...base(), when: "2026-09-21T20:00:00Z" }, "doc.when must be a string of 24 to 24 characters"],
      [{ ...base(), when: "2026-13-21T20:00:00.000Z" }, "doc.when must be a canonical UTC ISO 8601 timestamp"],
      [{ ...base(), tags: { abcd: true } }, "doc.tags has a key that does not match its required pattern"],
      [{ ...base(), tags: { a: true, b: true, c: true } }, "doc.tags must have at most 2 keys"],
      [{ ...base(), choice: { kind: "z" } }, "doc.choice.kind must equal \"y\""],
      [{ ...base(), payload: { a: { b: { c: { d: 1 } } } } }, "doc.payload.a.b.c exceeds the JSON depth bound of 3"],
      [{ ...base(), payload: Number.POSITIVE_INFINITY }, "doc.payload must be a finite number"],
      [{ ...base(), payload: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }, "doc.payload[11] exceeds the bound of 12 JSON nodes"],
      [{ ...base(), leaves: [{ name: "a", count: 1 }, { name: "a", count: 1 }] }, "doc.leaves must not contain duplicate items"],
      [{ ...base(), mode: "c" }, "doc.mode must be one of \"a\", \"b\", 3"],
      [{ ...base(), nothing: undefined }, "doc.nothing must be null"],
      [{ ...base(), flag: "true" }, "doc.flag must be a boolean"],
      [{ ...base(), leaves: [{ name: "abc", count: 11 }] }, "doc.leaves[0].count must be an integer from 0 to 10"],
    ];
    for (const [value, message] of cases) {
      expect(() => parseShape(sink, value, "doc", definitions)).toThrow(new ContractParseError("", "").constructor);
      expect(() => parseShape(sink, value, "doc", definitions)).toThrow(message);
    }
  });

  test("rejects prototype-bearing objects, NUL and unpaired surrogates", () => {
    class Foreign { kind = "sink"; }
    expect(() => parseShape(sink, new Foreign(), "doc", definitions)).toThrow("doc must be a JSON object");
    expect(() => parseShape({ kind: "string", maxLength: 8 }, `a${String.fromCharCode(0)}b`, "doc")).toThrow("must not contain NUL");
    expect(() => parseShape({ kind: "string", maxLength: 8 }, `a${String.fromCharCode(0xd800)}`, "doc")).toThrow("well-formed Unicode");
  });

  test("keeps a literal __proto__ key as an own data property in JSON and record values", () => {
    const protoKeyed = JSON.parse('{"__proto__":0,"b":2}') as Record<string, unknown>;
    const jsonParsed = parseShape<Record<string, unknown>>(
      { kind: "json", maxDepth: 4, maxNodes: 16 }, protoKeyed, "doc");
    expect(jsonParsed).toEqual(protoKeyed);
    expect(Object.hasOwn(jsonParsed, "__proto__")).toBeTrue();
    expect(Object.getPrototypeOf(jsonParsed)).toBe(Object.prototype);

    const objectValued = JSON.parse('{"__proto__":{"nested":1}}') as Record<string, unknown>;
    const jsonObjectParsed = parseShape<Record<string, unknown>>(
      { kind: "json", maxDepth: 4, maxNodes: 16 }, objectValued, "doc");
    expect(Object.hasOwn(jsonObjectParsed, "__proto__")).toBeTrue();
    expect(Object.getPrototypeOf(jsonObjectParsed)).toBe(Object.prototype);

    const recordParsed = parseShape<Record<string, unknown>>(
      { kind: "record", values: { kind: "integer", minimum: 0, maximum: 8 }, maxProperties: 4 },
      protoKeyed, "doc");
    expect(recordParsed).toEqual(protoKeyed);
    expect(Object.hasOwn(recordParsed, "__proto__")).toBeTrue();
    expect(Object.getPrototypeOf(recordParsed)).toBe(Object.prototype);
  });

  test("literal shapes compare arrays and objects deeply and reject reordered keys only by value", () => {
    const literal: Shape = { kind: "literal", value: { a: [1, 2], b: "x" } };
    expect(parseShape<unknown>(literal, { b: "x", a: [1, 2] }, "doc")).toEqual({ a: [1, 2], b: "x" });
    expect(() => parseShape(literal, { a: [2, 1], b: "x" }, "doc")).toThrow("must equal");
  });

  test("unresolved references fail loudly instead of accepting anything", () => {
    expect(() => parseShape({ kind: "ref", name: "missing" }, {}, "doc")).toThrow("not defined");
  });

  test("property: valid documents round-trip and validate; parse and schema agree on arbitrary values", () => {
    assertProperty(fc.property(validSinkArbitrary, (value) => {
      const parsed = parseShape<unknown>(sink, value, "doc", definitions);
      expect(parsed).toEqual(value);
      expect(parseShape<unknown>(sink, JSON.parse(JSON.stringify(parsed)), "doc", definitions)).toEqual(parsed);
      expect(schemaViolations(schema, value)).toEqual([]);
    }));
    assertProperty(fc.property(anyJsonArbitrary, (value) => {
      let accepted = true;
      try {
        parseShape(sink, value, "doc", definitions);
      } catch (error) {
        if (!(error instanceof ContractParseError)) throw error;
        accepted = false;
      }
      // The schema cannot express the JSON depth and node bounds of `payload`.
      const violations = schemaViolations(schema, value);
      if (accepted) expect(violations).toEqual([]);
      else expect(violations.length > 0 || isPayloadBoundRejection(value)).toBeTrue();
    }));
  });

  test("property: an unsupported key at any object path is rejected by the parser and the schema", () => {
    assertProperty(fc.property(validSinkArbitrary, fc.nat(), (value, seed) => {
      const paths = objectPathsOutsidePayload(value);
      const path = paths[seed % paths.length];
      if (path === undefined) throw new Error("no object path");
      const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
      let target: Record<string, unknown> = clone;
      for (const segment of path) target = target[segment] as Record<string, unknown>;
      target.__extra = 1;
      expect(() => parseShape(sink, clone, "doc", definitions)).toThrow("unsupported key __extra");
      expect(schemaViolations(schema, clone).length).toBeGreaterThan(0);
    }));
  });
});

function base(): Record<string, unknown> {
  return {
    kind: "sink",
    mode: "a",
    flag: false,
    nothing: null,
    when: "2026-09-21T20:00:00.000Z",
    leaves: [],
    tags: {},
    choice: { kind: "x" },
    payload: 1,
  };
}

function isPayloadBoundRejection(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const payload = (value as { payload?: unknown }).payload;
  return payload !== undefined && (depth(payload) > 3 || nodes(payload) > 12);
}

function depth(value: unknown): number {
  if (Array.isArray(value)) return 1 + Math.max(0, ...value.map(depth));
  if (typeof value === "object" && value !== null) return 1 + Math.max(0, ...Object.values(value).map(depth));
  return 0;
}

function nodes(value: unknown): number {
  if (Array.isArray(value)) return 1 + value.reduce<number>((sum, item) => sum + nodes(item), 0);
  if (typeof value === "object" && value !== null) {
    return 1 + Object.values(value).reduce<number>((sum, item) => sum + nodes(item), 0);
  }
  return 1;
}

function objectPathsOutsidePayload(value: Record<string, unknown>): readonly (readonly (string | number)[])[] {
  const paths: (readonly (string | number)[])[] = [[]];
  const leaves = value.leaves as readonly unknown[];
  leaves.forEach((_, index) => paths.push(["leaves", index]));
  paths.push(["choice"]);
  return paths;
}
