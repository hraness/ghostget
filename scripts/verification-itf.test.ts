/**
 * Tests for the strict ITF reader in `scripts/verification-itf.ts`: the value
 * encodings Quint and Apalache write, every bound at its edge, the exact shape
 * of traces and states, duplicate set members and map keys, and the typed
 * accessors that replay tests use.
 */
import { describe, expect, test } from "bun:test";

import { assertProperty, fc } from "../src/test-support.js";
import {
  ITF_MAX_BYTES,
  ITF_MAX_DEPTH,
  ITF_MAX_NODES,
  ITF_MAX_STATES,
  ITF_MAX_STRING_BYTES,
  ITF_MAX_VARIABLES,
  itfOption,
  itfRecord,
  itfString,
  itfStringSet,
  itfValueKey,
  itfVariable,
  parseItfTrace,
  type ItfState,
  type ItfTrace,
  type ItfValue,
} from "./verification-itf.js";
import type { JsonValue } from "./verification-test-support.js";

// ---------------------------------------------------------------------------
// Expected values and trace builders
// ---------------------------------------------------------------------------

const bool = (value: boolean): ItfValue => ({ kind: "bool", value });
const int = (value: bigint): ItfValue => ({ kind: "int", value });
const str = (value: string): ItfValue => ({ kind: "str", value });
const list = (...items: ItfValue[]): ItfValue => ({ kind: "list", items });
const tuple = (...items: ItfValue[]): ItfValue => ({ kind: "tuple", items });
const set = (...items: ItfValue[]): ItfValue => ({ kind: "set", items });
const map = (...entries: (readonly [ItfValue, ItfValue])[]): ItfValue => ({ kind: "map", entries });
const record = (...fields: (readonly [string, ItfValue])[]): ItfValue => ({ kind: "record", fields: new Map(fields) });

type JsonObject = { [key: string]: JsonValue };

/** A trace of one variable `v` whose states assign `values` in order. */
const traceOf = (...values: JsonValue[]): JsonObject => ({
  vars: ["v"],
  states: values.map((value, index) => ({ "#meta": { index }, v: value })),
});

const parse = (document: JsonValue): ItfTrace => parseItfTrace(JSON.stringify(document));

/** The value that `encoded` reads as when it is the whole value of a state variable. */
const read = (encoded: JsonValue): ItfValue => itfVariable(parse(traceOf(encoded)).states[0]!, "v");

/** The same from raw JSON text, for encodings `JSON.stringify` cannot write, such as `-0`. */
const readText = (encoded: string): ItfValue =>
  itfVariable(parseItfTrace(`{"vars":["v"],"states":[{"#meta":{"index":0},"v":${encoded}}]}`).states[0]!, "v");

const FORMAT_DESCRIPTION = "https://apalache-mc.org/docs/adr/015adr-trace.html";

/** The shape `quint run --mbt` writes. */
const quintTrace = (): JsonObject => ({
  "#meta": {
    format: "ITF",
    "format-description": FORMAT_DESCRIPTION,
    source: "lock.qnt",
    status: "ok",
    description: "Created by Quint",
    timestamp: 1_790_204_411_519,
  },
  vars: ["holder", "critical", "mbt::actionTaken", "mbt::nondetPicks"],
  states: [
    {
      "#meta": { index: 0 },
      critical: { "#set": [] },
      holder: "",
      "mbt::actionTaken": "init",
      "mbt::nondetPicks": { p: { tag: "None", value: { "#tup": [] } } },
    },
    {
      "#meta": { index: 1 },
      critical: { "#set": ["b"] },
      holder: "b",
      "mbt::actionTaken": "acquire",
      "mbt::nondetPicks": { p: { tag: "Some", value: "b" } },
    },
  ],
});

/** The shape Apalache writes for a counterexample. */
const apalacheTrace = (): JsonObject => ({
  "#meta": {
    format: "ITF",
    "format-description": FORMAT_DESCRIPTION,
    description: "Created by Apalache",
    varTypes: { critical: "Set(Str)", holder: "Str" },
  },
  vars: ["critical", "holder"],
  states: [
    { "#meta": { index: 0 }, critical: { "#set": [] }, holder: "" },
    { "#meta": { index: 1 }, critical: { "#set": ["a"] }, holder: "a" },
    { "#meta": { index: 2 }, critical: { "#set": ["a", "b"] }, holder: "b" },
  ],
});

// ---------------------------------------------------------------------------
// An independent value model
// ---------------------------------------------------------------------------

function sameSequence(left: readonly ItfValue[], right: readonly ItfValue[]): boolean {
  return left.length === right.length && left.every((item, index) => itfEqual(item, right[index]!));
}

function sameMembers<T>(left: readonly T[], right: readonly T[], equal: (a: T, b: T) => boolean): boolean {
  return left.length === right.length
    && left.every((a) => right.some((b) => equal(a, b)))
    && right.every((b) => left.some((a) => equal(a, b)));
}

/** Equality of the values two ITF values denote: sets, maps, and records ignore order. */
function itfEqual(left: ItfValue, right: ItfValue): boolean {
  switch (left.kind) {
    case "bool": return right.kind === "bool" && left.value === right.value;
    case "int": return right.kind === "int" && left.value === right.value;
    case "str": return right.kind === "str" && left.value === right.value;
    case "list": return right.kind === "list" && sameSequence(left.items, right.items);
    case "tuple": return right.kind === "tuple" && sameSequence(left.items, right.items);
    case "set": return right.kind === "set" && sameMembers(left.items, right.items, itfEqual);
    case "map":
      return right.kind === "map"
        && sameMembers(left.entries, right.entries, ([leftKey, leftValue], [rightKey, rightValue]) =>
          itfEqual(leftKey, rightKey) && itfEqual(leftValue, rightValue));
    case "record":
      return right.kind === "record" && left.fields.size === right.fields.size
        && [...left.fields].every(([name, value]) => {
          const other = right.fields.get(name);
          return other !== undefined && itfEqual(value, other);
        });
  }
}

/** The same value with every set, map, and record written in reverse order. */
function reordered(value: ItfValue): ItfValue {
  switch (value.kind) {
    case "list": return list(...value.items.map(reordered));
    case "tuple": return tuple(...value.items.map(reordered));
    case "set": return set(...value.items.map(reordered).reverse());
    case "map": return map(...value.entries.map(([key, entry]) => [reordered(key), reordered(entry)] as const).reverse());
    case "record": return record(...[...value.fields].map(([name, entry]) => [name, reordered(entry)] as const).reverse());
    default: return value;
  }
}

/** A value and one of its ITF encodings. */
type Encoded = readonly [ItfValue, JsonValue];

const SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const LARGEST_BIGINT = 10n ** 78n - 1n;

const encodedInteger = fc.tuple(
  fc.oneof(fc.bigInt({ min: -3n, max: 3n }), fc.bigInt({ min: -LARGEST_BIGINT, max: LARGEST_BIGINT })),
  fc.boolean(),
).map(([value, asBigint]): Encoded => [
  int(value),
  asBigint || value > SAFE_INTEGER || value < -SAFE_INTEGER ? { "#bigint": value.toString() } : Number(value),
]);

const smallValue = fc.oneof(
  fc.boolean().map((flag): Encoded => [bool(flag), flag]),
  fc.tuple(fc.bigInt({ min: -2n, max: 2n }), fc.boolean())
    .map(([value, asBigint]): Encoded => [int(value), asBigint ? { "#bigint": value.toString() } : Number(value)]),
  fc.constantFrom("", "a").map((text): Encoded => [str(text), text]),
);

const fieldName = fc.oneof(
  fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,5}$/u),
  fc.constantFrom("__proto__", "constructor", "toString", "tag", "value"),
);

const unique = { selector: ([model]: Encoded) => model, comparator: itfEqual } as const;

const { value: encodedValue } = fc.letrec<{ value: Encoded }>((tie) => ({
  value: fc.oneof(
    { maxDepth: 3, depthSize: "small", withCrossShrink: true },
    fc.boolean().map((flag): Encoded => [bool(flag), flag]),
    encodedInteger,
    fc.string({ unit: "binary", maxLength: 12 }).map((text): Encoded => [str(text), text]),
    fc.array(tie("value"), { maxLength: 3 })
      .map((items): Encoded => [list(...items.map(([model]) => model)), items.map(([, json]) => json)]),
    fc.array(tie("value"), { maxLength: 3 })
      .map((items): Encoded => [tuple(...items.map(([model]) => model)), { "#tup": items.map(([, json]) => json) }]),
    fc.uniqueArray(tie("value"), { maxLength: 3, ...unique })
      .map((items): Encoded => [set(...items.map(([model]) => model)), { "#set": items.map(([, json]) => json) }]),
    fc.uniqueArray(fc.tuple(tie("value"), tie("value")), { maxLength: 3, selector: ([[key]]) => key, comparator: itfEqual })
      .map((entries): Encoded => [
        map(...entries.map(([[key], [value]]) => [key, value] as const)),
        { "#map": entries.map(([[, key], [, value]]) => [key, value]) },
      ]),
    fc.uniqueArray(fc.tuple(fieldName, tie("value")), { maxLength: 3, selector: ([name]) => name })
      .map((fields): Encoded => [
        record(...fields.map(([name, [model]]) => [name, model] as const)),
        Object.fromEntries(fields.map(([name, [, json]]) => [name, json])),
      ]),
  ),
}));

const variableName = fc.oneof(
  fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,5}$/u),
  fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,3}::[A-Za-z_][A-Za-z0-9_]{0,3}$/u),
  fc.constantFrom("__proto__", "mbt::actionTaken", "mbt::nondetPicks"),
);

/** Declared variables and, per state, one encoded value per variable. */
const generatedTrace = fc.uniqueArray(variableName, { minLength: 1, maxLength: 4 }).chain((vars) => fc.record({
  vars: fc.constant(vars),
  states: fc.array(fc.array(encodedValue, { minLength: vars.length, maxLength: vars.length }), { minLength: 1, maxLength: 4 }),
}));

function traceDocument(vars: readonly string[], states: readonly (readonly Encoded[])[]): JsonObject {
  return {
    vars: [...vars],
    states: states.map((values, index) => Object.fromEntries([
      ["#meta", { index }],
      ...vars.map((name, position) => [name, values[position]![1]] as const),
    ])),
  };
}

// ---------------------------------------------------------------------------
// Reading traces
// ---------------------------------------------------------------------------

describe("ITF traces", () => {
  test("reads the traces Quint and Apalache write", () => {
    const quint = parse(quintTrace());
    expect(quint.source).toBe("lock.qnt");
    expect(quint.vars).toEqual(["holder", "critical", "mbt::actionTaken", "mbt::nondetPicks"]);
    expect(quint.loop).toBeNull();
    expect(quint.states.map((state) => state.index)).toEqual([0, 1]);
    const [initial, acquired] = quint.states;
    expect([...initial!.values.keys()]).toEqual([...quint.vars]);
    expect(itfVariable(acquired!, "critical")).toEqual(set(str("b")));
    expect(itfVariable(acquired!, "mbt::nondetPicks")).toEqual(record(["p", record(["tag", str("Some")], ["value", str("b")])]));
    const pick = (state: ItfState | undefined): ItfValue | null =>
      itfOption(itfRecord(itfVariable(state!, "mbt::nondetPicks"), ["p"], "picks").get("p")!, "p");
    expect(pick(initial)).toBeNull();
    expect(pick(acquired)).toEqual(str("b"));

    const apalache = parse(apalacheTrace());
    expect(apalache.source).toBeNull();
    expect(apalache.states).toHaveLength(3);
    expect(itfStringSet(itfVariable(apalache.states[2]!, "critical"), "critical")).toEqual(new Set(["a", "b"]));
    expect(parse({ ...apalacheTrace(), loop: 1 }).loop).toBe(1);
    expect(parse({ ...apalacheTrace(), params: [] }).states).toHaveLength(3);
  });

  test("reads each value encoding into its kind", () => {
    const cases: readonly (readonly [JsonValue, ItfValue])[] = [
      [true, bool(true)],
      [false, bool(false)],
      [0, int(0n)],
      [-7, int(-7n)],
      [Number.MAX_SAFE_INTEGER, int(SAFE_INTEGER)],
      [Number.MIN_SAFE_INTEGER, int(-SAFE_INTEGER)],
      [{ "#bigint": "0" }, int(0n)],
      [{ "#bigint": "-12345678901234567890" }, int(-12345678901234567890n)],
      [{ "#bigint": "9".repeat(78) }, int(LARGEST_BIGINT)],
      ["", str("")],
      ["é\u0000\"\\", str("é\u0000\"\\")],
      [[], list()],
      [[1, [true]], list(int(1n), list(bool(true)))],
      [{ "#tup": [] }, tuple()],
      [{ "#tup": ["a", 1] }, tuple(str("a"), int(1n))],
      [{ "#set": [] }, set()],
      [{ "#set": [2, 1] }, set(int(2n), int(1n))],
      [{ "#set": [[1, 2], [2, 1]] }, set(list(int(1n), int(2n)), list(int(2n), int(1n)))],
      [{ "#set": [{ "#set": [1, 2] }, { "#set": [3] }] }, set(set(int(1n), int(2n)), set(int(3n)))],
      [{ "#map": [] }, map()],
      [{ "#map": [[1, "one"], [{ "#tup": [] }, { "#set": [] }]] }, map([int(1n), str("one")], [tuple(), set()])],
      [{}, record()],
      [{ a: 1, _b: "x", C9: [] }, record(["a", int(1n)], ["_b", str("x")], ["C9", list()])],
      [{ tag: "None", value: { "#tup": [] } }, record(["tag", str("None")], ["value", tuple()])],
    ];
    for (const [encoded, expected] of cases) expect({ encoded, value: read(encoded) }).toEqual({ encoded, value: expected });
    expect(readText("{\"__proto__\":{\"#set\":[]},\"constructor\":1}")).toEqual(record(["__proto__", set()], ["constructor", int(1n)]));
  });

  test("returns frozen traces, states, and values", () => {
    const trace = parse(traceOf([{ "#tup": [1] }, { "#set": ["a"] }, { "#map": [[1, 2]] }, { f: true }]));
    const frozen = (value: ItfValue): boolean => {
      if (!Object.isFrozen(value)) return false;
      switch (value.kind) {
        case "list": case "tuple": case "set": return Object.isFrozen(value.items) && value.items.every(frozen);
        case "map": return Object.isFrozen(value.entries) && value.entries.every((entry) => Object.isFrozen(entry) && entry.every(frozen));
        case "record": return [...value.fields.values()].every(frozen);
        default: return true;
      }
    };
    expect([trace, trace.vars, trace.states, trace.states[0]].every((part) => Object.isFrozen(part))).toBe(true);
    expect(frozen(itfVariable(trace.states[0]!, "v"))).toBe(true);
  });

  test("rejects each malformed trace with its reason", () => {
    const withField = (key: string, value: JsonValue): string => JSON.stringify({ ...traceOf(1), [key]: value });
    const vars = "ITF vars must be a bounded list of unique variable names";
    const states = "ITF states must be a bounded non-empty list";
    const loop = "ITF loop must index an existing state";
    const indexed = "ITF state 0 must carry exactly its own #meta.index";
    const assigned = "ITF state 0 must assign exactly the declared variables";
    const cases: readonly (readonly [string, string])[] = [
      ["", "ITF trace is not JSON"],
      ["{", "ITF trace is not JSON"],
      ["{\"vars\":[\"v\"],}", "ITF trace is not JSON"],
      ["[]", "ITF trace must be an object"],
      ["null", "ITF trace must be an object"],
      ["\"trace\"", "ITF trace must be an object"],
      [withField("extra", 1), "ITF trace has an unexpected field \"extra\""],
      [withField("__proto__", {}), "ITF trace has an unexpected field \"__proto__\""],
      [withField("x".repeat(200), 1), `ITF trace has an unexpected field "${"x".repeat(63)}`],
      [withField("#meta", null), "ITF #meta must be an object"],
      [withField("#meta", []), "ITF #meta must be an object"],
      [withField("#meta", { format: "TLA" }), "ITF #meta.format must be ITF"],
      [withField("#meta", { source: 1 }), "ITF #meta.source must be a bounded string"],
      [withField("#meta", { status: null }), "ITF #meta.status must be a bounded string"],
      [withField("#meta", { timestamp: -1 }), "ITF #meta.timestamp must be a non-negative integer"],
      [withField("#meta", { timestamp: 1.5 }), "ITF #meta.timestamp must be a non-negative integer"],
      [withField("#meta", { timestamp: "1" }), "ITF #meta.timestamp must be a non-negative integer"],
      [withField("#meta", { varTypes: [] }), "ITF #meta.varTypes must be an object"],
      [withField("#meta", { varTypes: { "a-b": "Int" } }), "ITF #meta.varTypes names a malformed variable"],
      [withField("#meta", { varTypes: { v: 1 } }), "ITF #meta.varTypes entry must be a bounded string"],
      [withField("#meta", { index: 0 }), "ITF #meta has an unexpected field \"index\""],
      [withField("params", ["N"]), "ITF parameterized traces are not supported"],
      [withField("params", null), "ITF parameterized traces are not supported"],
      [withField("vars", []), vars],
      [withField("vars", "v"), vars],
      [withField("vars", ["v", "v"]), vars],
      [withField("vars", ["v", 1]), vars],
      ...["1v", "a-b", "a::", "::a", "a:::b", "a::b::", "", "é", "a b"].map((name) => [withField("vars", ["v", name]), vars] as const),
      [withField("vars", Array.from({ length: ITF_MAX_VARIABLES + 1 }, (_, index) => `v${String(index)}`)), vars],
      [withField("states", []), states],
      [withField("states", {}), states],
      [withField("states", [1]), "ITF states must be objects"],
      [withField("states", [[]]), "ITF states must be objects"],
      [withField("states", [{ v: 1 }]), indexed],
      [withField("states", [{ "#meta": [], v: 1 }]), indexed],
      [withField("states", [{ "#meta": { index: 1 }, v: 1 }]), indexed],
      [withField("states", [{ "#meta": { index: "0" }, v: 1 }]), indexed],
      [withField("states", [{ "#meta": { index: 0, extra: 1 }, v: 1 }]), indexed],
      [withField("states", [{ "#meta": { index: 0 }, v: 1 }, { "#meta": { index: 0 }, v: 1 }]), "ITF state 1 must carry exactly its own #meta.index"],
      [withField("states", [{ "#meta": { index: 0 } }]), assigned],
      [withField("states", [{ "#meta": { index: 0 }, w: 1 }]), assigned],
      [withField("states", [{ "#meta": { index: 0 }, v: 1, w: 2 }]), assigned],
      [withField("loop", 1), loop],
      [withField("loop", -1), loop],
      [withField("loop", 0.5), loop],
      [withField("loop", null), loop],
      [withField("loop", "0"), loop],
    ];
    for (const [text, message] of cases) expect(() => parseItfTrace(text)).toThrow(message);
  });

  test("rejects each malformed value with its reason", () => {
    const numbers = "ITF numbers must be safe integers; larger values use #bigint";
    const bigint = "ITF #bigint must be a canonical decimal integer";
    const fields = "ITF record fields must be plain identifiers";
    const cases: readonly (readonly [string, string])[] = [
      ["null", "ITF value has an unsupported encoding"],
      ["1.5", numbers],
      ["-0", numbers],
      ["9007199254740992", numbers],
      ["-9007199254740992", numbers],
      ["1e300", numbers],
      ...["01", "-0", "+1", " 1", "1 ", "1e3", "1.0", "", "0x1", "9".repeat(79)].map((text) => [`{"#bigint":${JSON.stringify(text)}}`, bigint] as const),
      ["{\"#bigint\":1}", bigint],
      ["{\"#tup\":{}}", "ITF #tup must hold an array"],
      ["{\"#set\":\"ab\"}", "ITF #set must hold an array"],
      ["{\"#set\":[1,1]}", "ITF #set holds a duplicate member"],
      ["{\"#set\":[1,{\"#bigint\":\"1\"}]}", "ITF #set holds a duplicate member"],
      ["{\"#set\":[{\"#set\":[1,2]},{\"#set\":[2,1]}]}", "ITF #set holds a duplicate member"],
      ["{\"#set\":[{\"a\":1,\"b\":2},{\"b\":2,\"a\":1}]}", "ITF #set holds a duplicate member"],
      ["{\"#map\":{}}", "ITF #map must hold an array"],
      ["{\"#map\":[[1]]}", "ITF #map entries must be pairs"],
      ["{\"#map\":[[1,2,3]]}", "ITF #map entries must be pairs"],
      ["{\"#map\":[{\"k\":1}]}", "ITF #map entries must be pairs"],
      ["{\"#map\":[[1,\"a\"],[{\"#bigint\":\"1\"},\"b\"]]}", "ITF #map holds a duplicate key"],
      ["{\"#set\":[],\"extra\":1}", fields],
      ["{\"#unserializable\":\"x\"}", fields],
      ["{\"a-b\":1}", fields],
      ["{\"1a\":1}", fields],
      ["{\"\":1}", fields],
      [JSON.stringify("x".repeat(ITF_MAX_STRING_BYTES + 1)), "ITF string must be a bounded string"],
      [JSON.stringify("é".repeat(ITF_MAX_STRING_BYTES / 2 + 1)), "ITF string must be a bounded string"],
    ];
    for (const [text, message] of cases) expect(() => readText(text)).toThrow(message);
  });
});

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

describe("ITF bounds", () => {
  test("bounds the trace in UTF-8 bytes before parsing", () => {
    const text = JSON.stringify(traceOf(1));
    const padded = `${text}${" ".repeat(ITF_MAX_BYTES - text.length)}`;
    expect(parseItfTrace(padded).states).toHaveLength(1);
    expect(() => parseItfTrace(`${padded} `)).toThrow("ITF trace exceeds its byte bound");
    expect(() => parseItfTrace("x".repeat(ITF_MAX_BYTES / 2 + 1))).toThrow("ITF trace is not JSON");
    expect(() => parseItfTrace("é".repeat(ITF_MAX_BYTES / 2 + 1))).toThrow("ITF trace exceeds its byte bound");
  });

  test("bounds the number of states and variables", () => {
    const zeros = (count: number): JsonObject => traceOf(...Array.from({ length: count }, () => 0));
    expect(parse(zeros(ITF_MAX_STATES)).states).toHaveLength(ITF_MAX_STATES);
    expect(() => parse(zeros(ITF_MAX_STATES + 1))).toThrow("ITF states must be a bounded non-empty list");
    const variables = (count: number): JsonObject => {
      const names = Array.from({ length: count }, (_, index) => `v${String(index)}`);
      return { vars: names, states: [Object.fromEntries([["#meta", { index: 0 }], ...names.map((name) => [name, 0])])] };
    };
    expect(parse(variables(ITF_MAX_VARIABLES)).vars).toHaveLength(ITF_MAX_VARIABLES);
    expect(() => parse(variables(ITF_MAX_VARIABLES + 1))).toThrow("ITF vars must be a bounded list of unique variable names");
  });

  test("bounds the values in the whole trace, not per state", () => {
    const zeros = (count: number): string => `[${Array.from({ length: count }, () => "0").join(",")}]`;
    const trace = (...values: string[]): string =>
      `{"vars":["v"],"states":[${values.map((value, index) => `{"#meta":{"index":${String(index)}},"v":${value}}`).join(",")}]}`;
    expect(() => parseItfTrace(trace(zeros(ITF_MAX_NODES - 1)))).not.toThrow();
    expect(() => parseItfTrace(trace(zeros(ITF_MAX_NODES)))).toThrow("ITF trace exceeds its value bound");
    const half = ITF_MAX_NODES / 2;
    expect(() => parseItfTrace(trace(zeros(half - 1), zeros(half - 1)))).not.toThrow();
    expect(() => parseItfTrace(trace(zeros(half - 1), zeros(half)))).toThrow("ITF trace exceeds its value bound");
  });

  test("every container level counts once against the depth bound", () => {
    const wrappers = [["[", "]"], ["{\"#tup\":[", "]}"], ["{\"#set\":[", "]}"], ["{\"#map\":[[0,", "]]}"], ["{\"f\":", "}"]] as const;
    const levels = fc.integer({ min: 0, max: ITF_MAX_DEPTH + 3 })
      .chain((count) => fc.array(fc.constantFrom(...wrappers), { minLength: count, maxLength: count }));
    const leaf = fc.constantFrom("1", "\"s\"", "true", "{\"#bigint\":\"2\"}", "[]", "{}", "{\"#set\":[]}");
    assertProperty(fc.property(levels, leaf, (chosen, innermost) => {
      const text = `${chosen.map(([open]) => open).join("")}${innermost}${chosen.map(([, close]) => close).reverse().join("")}`;
      if (chosen.length < ITF_MAX_DEPTH) expect(() => readText(text)).not.toThrow();
      else expect(() => readText(text)).toThrow("ITF value exceeds its depth bound");
    }));
  });

  test("bounds every string in UTF-8 bytes wherever the trace holds one", () => {
    const text = fc.tuple(
      fc.integer({ min: ITF_MAX_STRING_BYTES - 24, max: ITF_MAX_STRING_BYTES + 4 }),
      fc.constantFrom("x", "é", "€", "😀"),
      fc.integer({ min: 0, max: 6 }),
    ).map(([ascii, wide, count]) => `${"a".repeat(ascii)}${wide.repeat(count)}`);
    const places = [
      ["value", (value: string): JsonValue => traceOf(value), "ITF string must be a bounded string"],
      ["source", (value: string): JsonValue => ({ ...traceOf(1), "#meta": { source: value } }), "ITF #meta.source must be a bounded string"],
      ["description", (value: string): JsonValue => ({ ...traceOf(1), "#meta": { description: value } }), "ITF #meta.description must be a bounded string"],
      ["varTypes", (value: string): JsonValue => ({ ...traceOf(1), "#meta": { varTypes: { v: value } } }), "ITF #meta.varTypes entry must be a bounded string"],
    ] as const;
    assertProperty(fc.property(text, fc.constantFrom(...places), (value, [, place, message]) => {
      const document = place(value);
      if (Buffer.byteLength(value, "utf8") <= ITF_MAX_STRING_BYTES) expect(() => parse(document)).not.toThrow();
      else expect(() => parse(document)).toThrow(message);
    }));
  });
});

// ---------------------------------------------------------------------------
// Laws over generated traces
// ---------------------------------------------------------------------------

describe("ITF laws", () => {
  test("reads every generated trace back exactly", () => {
    assertProperty(fc.property(generatedTrace, ({ vars, states }) => {
      const trace = parse(traceDocument(vars, states));
      expect(trace.vars).toEqual(vars);
      expect(trace.states.map((state) => state.index)).toEqual(states.map((_, index) => index));
      trace.states.forEach((state, index) => {
        expect([...state.values.keys()]).toEqual(vars);
        vars.forEach((name, position) => expect(itfVariable(state, name)).toEqual(states[index]![position]![0]));
      });
    }));
  });

  test("value keys are equal exactly when the values are", () => {
    const value = encodedValue.map(([model]) => model);
    assertProperty(fc.property(value, value, (left, right) => {
      expect(itfValueKey(reordered(left))).toBe(itfValueKey(left));
      expect(itfEqual(reordered(left), left)).toBe(true);
      expect(itfValueKey(left) === itfValueKey(right)).toBe(itfEqual(left, right));
      for (const wrapped of [list(left), tuple(left), set(left), map([left, left]), record(["f", left])]) {
        expect(itfValueKey(wrapped) === itfValueKey(right)).toBe(itfEqual(wrapped, right));
      }
    }));
  });

  test("a set or map is rejected exactly when two members or keys denote the same value", () => {
    const member = fc.oneof(smallValue, encodedValue);
    assertProperty(fc.property(
      fc.array(member, { maxLength: 5 }),
      fc.array(encodedValue, { minLength: 5, maxLength: 5 }),
      (members, payloads) => {
        const duplicate = members.some(([left], index) => members.slice(index + 1).some(([right]) => itfEqual(left, right)));
        const asSet = (): ItfValue => read({ "#set": members.map(([, json]) => json) });
        const asMap = (): ItfValue => read({ "#map": members.map(([, json], index) => [json, payloads[index]![1]]) });
        if (duplicate) {
          expect(asSet).toThrow("ITF #set holds a duplicate member");
          expect(asMap).toThrow("ITF #map holds a duplicate key");
        } else {
          expect(asSet()).toEqual(set(...members.map(([model]) => model)));
          expect(asMap()).toEqual(map(...members.map(([model], index) => [model, payloads[index]![0]] as const)));
        }
      },
    ));
  });

  test("a JSON number is read exactly when it is a safe integer other than -0", () => {
    const number = fc.oneof(
      fc.integer(),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom(-0, 0.5, 2 ** 53, 2 ** 53 - 1, -(2 ** 53), -(2 ** 53 - 1), 1e21, 5e-324),
    );
    assertProperty(fc.property(number, (value) => {
      const text = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (Number.isSafeInteger(value) && !Object.is(value, -0)) expect(readText(text)).toEqual(int(BigInt(value)));
      else expect(() => readText(text)).toThrow("ITF numbers must be safe integers; larger values use #bigint");
    }));
  });

  test("#bigint text is read exactly when it is a canonical decimal integer of at most 78 digits", () => {
    const text = fc.oneof(
      fc.bigInt({ min: -(10n ** 80n), max: 10n ** 80n }).map((value) => value.toString()),
      fc.tuple(
        fc.constantFrom("", "-", "+", " ", "--", "0"),
        fc.stringMatching(/^[0-9]{1,80}$/u),
        fc.constantFrom("", " ", "e3", ".0", "n"),
      ).map((parts) => parts.join("")),
      fc.string({ unit: "binary", maxLength: 6 }),
    );
    assertProperty(fc.property(text, (value) => {
      const canonical = /^-?(?:0|[1-9][0-9]*)$/u.test(value) && value !== "-0" && value.replace(/^-/u, "").length <= 78;
      if (canonical) expect(read({ "#bigint": value })).toEqual(int(BigInt(value)));
      else expect(() => read({ "#bigint": value })).toThrow("ITF #bigint must be a canonical decimal integer");
    }));
  });

  test("loop is read exactly when it indexes an existing state", () => {
    const loop = fc.oneof(fc.integer({ min: -3, max: 8 }), fc.double(), fc.constantFrom<JsonValue>(null, "0", true, [0]));
    assertProperty(fc.property(fc.integer({ min: 1, max: 5 }), loop, (count, value) => {
      const text = JSON.stringify({ ...traceOf(...Array.from({ length: count }, () => 0)), loop: value });
      const parsed = JSON.parse(text) as { loop: unknown };
      const valid = typeof parsed.loop === "number" && Number.isSafeInteger(parsed.loop) && parsed.loop >= 0 && parsed.loop < count;
      if (valid) expect(parseItfTrace(text).loop).toBe(parsed.loop as number);
      else expect(() => parseItfTrace(text)).toThrow("ITF loop must index an existing state");
    }));
  });

  test("every state must carry its own index and assign exactly the declared variables", () => {
    const rootFields = new Set(["#meta", "params", "vars", "states", "loop"]);
    const metaFields = new Set(["format", "format-description", "source", "status", "description", "timestamp", "varTypes"]);
    const name = fc.string({ unit: "binary", maxLength: 80 });
    const mutation = fc.oneof(
      fc.record({ kind: fc.constant("root-field" as const), name: name.filter((key) => !rootFields.has(key)) }),
      fc.record({ kind: fc.constant("meta-field" as const), name: name.filter((key) => !metaFields.has(key)) }),
      fc.record({ kind: fc.constant("state-meta-field" as const), state: fc.nat(), name: name.filter((key) => key !== "index") }),
      fc.record({ kind: fc.constant("index" as const), state: fc.nat(), shift: fc.integer({ min: -3, max: 3 }).filter((shift) => shift !== 0) }),
      fc.record({ kind: fc.constant("drop-variable" as const), state: fc.nat(), variable: fc.nat() }),
      fc.record({ kind: fc.constant("extra-variable" as const), state: fc.nat(), name: variableName }),
      fc.record({ kind: fc.constant("swap-states" as const), first: fc.nat(), second: fc.nat() }),
      fc.record({ kind: fc.constant("undeclare" as const), variable: fc.nat() }),
      fc.record({ kind: fc.constant("redeclare" as const), variable: fc.nat() }),
    );
    assertProperty(fc.property(generatedTrace, mutation, ({ vars, states }, change) => {
      const document = traceDocument(vars, states);
      const stateList = document.states as JsonObject[];
      const at = (index: number): number => index % stateList.length;
      let message: string;
      switch (change.kind) {
        case "root-field":
          Object.defineProperty(document, change.name, { value: 1, enumerable: true, writable: true, configurable: true });
          message = `ITF trace has an unexpected field ${JSON.stringify(change.name).slice(0, 64)}`;
          break;
        case "meta-field":
          document["#meta"] = Object.fromEntries([[change.name, "x"]]);
          message = `ITF #meta has an unexpected field ${JSON.stringify(change.name).slice(0, 64)}`;
          break;
        case "state-meta-field":
          stateList[at(change.state)]!["#meta"] = Object.fromEntries([["index", at(change.state)], [change.name, 0]]);
          message = `ITF state ${String(at(change.state))} must carry exactly its own #meta.index`;
          break;
        case "index":
          stateList[at(change.state)]!["#meta"] = { index: at(change.state) + change.shift };
          message = `ITF state ${String(at(change.state))} must carry exactly its own #meta.index`;
          break;
        case "drop-variable": {
          const state = stateList[at(change.state)]!;
          delete state[vars[change.variable % vars.length]!];
          message = `ITF state ${String(at(change.state))} must assign exactly the declared variables`;
          break;
        }
        case "extra-variable": {
          const extra = vars.includes(change.name) ? `${change.name}_extra` : change.name;
          if (vars.includes(extra)) return;
          Object.defineProperty(stateList[at(change.state)]!, extra, { value: 0, enumerable: true, writable: true, configurable: true });
          message = `ITF state ${String(at(change.state))} must assign exactly the declared variables`;
          break;
        }
        case "swap-states": {
          const first = at(change.first);
          const second = at(change.second);
          if (first === second) return;
          [stateList[first], stateList[second]] = [stateList[second]!, stateList[first]!];
          message = `ITF state ${String(Math.min(first, second))} must carry exactly its own #meta.index`;
          break;
        }
        case "undeclare":
          document.vars = vars.filter((_, index) => index !== change.variable % vars.length);
          message = vars.length === 1
            ? "ITF vars must be a bounded list of unique variable names"
            : "ITF state 0 must assign exactly the declared variables";
          break;
        case "redeclare":
          document.vars = [...vars, vars[change.variable % vars.length]!];
          message = "ITF vars must be a bounded list of unique variable names";
          break;
      }
      expect(() => parse(document)).toThrow(message);
    }));
  });
});

// ---------------------------------------------------------------------------
// Typed accessors
// ---------------------------------------------------------------------------

describe("ITF accessors", () => {
  const state = parse(quintTrace()).states[1]!;

  test("read a variable only when the state carries it", () => {
    expect(itfVariable(state, "holder")).toEqual(str("b"));
    expect(() => itfVariable(state, "owner")).toThrow("ITF state 1 has no variable owner");
  });

  test("read strings and string sets only from their own kinds", () => {
    expect(itfString(str("x"), "holder")).toBe("x");
    for (const value of [int(1n), bool(true), list(str("x")), set(str("x")), record(["x", str("x")])]) {
      expect(() => itfString(value, "holder")).toThrow("ITF holder must be a string");
    }
    expect(itfStringSet(set(str("a"), str("b")), "critical")).toEqual(new Set(["a", "b"]));
    expect(itfStringSet(set(), "critical")).toEqual(new Set());
    for (const value of [list(str("a")), tuple(str("a")), str("a"), map()]) {
      expect(() => itfStringSet(value, "critical")).toThrow("ITF critical must be a set");
    }
    expect(() => itfStringSet(set(str("a"), int(1n)), "critical")).toThrow("ITF critical member must be a string");
  });

  test("read a record only with exactly the expected fields", () => {
    const value = record(["b", int(2n)], ["a", int(1n)]);
    expect([...itfRecord(value, ["a", "b"], "pair")]).toEqual([["b", int(2n)], ["a", int(1n)]]);
    expect(() => itfRecord(value, ["a"], "pair")).toThrow("ITF pair must have exactly the fields a");
    expect(() => itfRecord(value, ["c", "b", "a"], "pair")).toThrow("ITF pair must have exactly the fields a, b, c");
    expect(() => itfRecord(value, ["a", "c"], "pair")).toThrow("ITF pair must have exactly the fields a, c");
    expect(() => itfRecord(map(), [], "pair")).toThrow("ITF pair must be a record");
    expect(itfRecord(record(), [], "pair").size).toBe(0);
  });

  test("decode Quint's Option encoding and nothing else", () => {
    const option = (tag: ItfValue, value: ItfValue): ItfValue => record(["tag", tag], ["value", value]);
    expect(itfOption(option(str("Some"), int(1n)), "p")).toEqual(int(1n));
    expect(itfOption(option(str("Some"), tuple()), "p")).toEqual(tuple());
    expect(itfOption(option(str("None"), tuple()), "p")).toBeNull();
    for (const value of [option(str("None"), tuple(int(1n))), option(str("None"), list()), option(str("Maybe"), int(1n)), option(str("some"), int(1n))]) {
      expect(() => itfOption(value, "p")).toThrow("ITF p must be Some(value) or None");
    }
    expect(() => itfOption(option(int(1n), int(1n)), "p")).toThrow("ITF p.tag must be a string");
    expect(() => itfOption(record(["tag", str("Some")]), "p")).toThrow("ITF p must have exactly the fields tag, value");
    expect(() => itfOption(tuple(str("Some"), int(1n)), "p")).toThrow("ITF p must be a record");
  });
});
