/**
 * Strict reader for the Informal Trace Format (ITF) that Quint and Apalache
 * write. It accepts only the value encodings those tools emit, bounds every
 * dimension, and rejects extra fields, so a replay test never compares
 * production state with a silently misread trace.
 */

export const ITF_MAX_BYTES = 16 * 1024 * 1024;
export const ITF_MAX_STATES = 10_000;
export const ITF_MAX_VARIABLES = 64;
export const ITF_MAX_DEPTH = 32;
export const ITF_MAX_NODES = 1_000_000;
export const ITF_MAX_STRING_BYTES = 4_096;

export type ItfValue =
  | Readonly<{ kind: "bool"; value: boolean }>
  | Readonly<{ kind: "int"; value: bigint }>
  | Readonly<{ kind: "str"; value: string }>
  | Readonly<{ kind: "list"; items: readonly ItfValue[] }>
  | Readonly<{ kind: "tuple"; items: readonly ItfValue[] }>
  | Readonly<{ kind: "set"; items: readonly ItfValue[] }>
  | Readonly<{ kind: "map"; entries: readonly (readonly [ItfValue, ItfValue])[] }>
  | Readonly<{ kind: "record"; fields: ReadonlyMap<string, ItfValue> }>;

export type ItfState = Readonly<{
  index: number;
  values: ReadonlyMap<string, ItfValue>;
}>;

export type ItfTrace = Readonly<{
  source: string | null;
  vars: readonly string[];
  states: readonly ItfState[];
  loop: number | null;
}>;

const META_STRING_FIELDS = new Set([
  "format-description",
  "source",
  "status",
  "description",
]);
const VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*$/u;
const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const BIGINT_PATTERN = /^-?(?:0|[1-9][0-9]{0,77})$/u;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function boundedString(value: unknown, label: string): string {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > ITF_MAX_STRING_BYTES) {
    throw new Error(`ITF ${label} must be a bounded string`);
  }
  return value;
}

/** Canonical text of a value, used only to reject duplicate set members and map keys. */
export function itfValueKey(value: ItfValue): string {
  switch (value.kind) {
    case "bool": return value.value ? "b:1" : "b:0";
    case "int": return `i:${value.value.toString()}`;
    case "str": return `s:${JSON.stringify(value.value)}`;
    case "list": return `l:[${value.items.map(itfValueKey).join(",")}]`;
    case "tuple": return `t:[${value.items.map(itfValueKey).join(",")}]`;
    case "set": return `S:[${value.items.map(itfValueKey).sort().join(",")}]`;
    case "map": return `M:[${value.entries.map(([key, entry]) => `${itfValueKey(key)}=${itfValueKey(entry)}`).sort().join(",")}]`;
    case "record": return `r:{${[...value.fields].map(([name, entry]) => `${JSON.stringify(name)}:${itfValueKey(entry)}`).sort().join(",")}}`;
  }
}

class ValueReader {
  private nodes = 0;

  read(value: unknown, depth: number): ItfValue {
    this.nodes += 1;
    if (this.nodes > ITF_MAX_NODES) throw new Error("ITF trace exceeds its value bound");
    if (depth > ITF_MAX_DEPTH) throw new Error("ITF value exceeds its depth bound");
    if (typeof value === "boolean") return Object.freeze({ kind: "bool", value });
    if (typeof value === "string") return Object.freeze({ kind: "str", value: boundedString(value, "string") });
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new Error("ITF numbers must be safe integers; larger values use #bigint");
      }
      return Object.freeze({ kind: "int", value: BigInt(value) });
    }
    if (Array.isArray(value)) {
      return Object.freeze({ kind: "list", items: this.items(value, depth) });
    }
    if (!isPlainRecord(value)) throw new Error("ITF value has an unsupported encoding");
    const keys = Object.keys(value);
    const only = keys.length === 1 ? keys[0] : undefined;
    if (only === "#bigint") {
      const text = value["#bigint"];
      if (typeof text !== "string" || !BIGINT_PATTERN.test(text) || text === "-0") {
        throw new Error("ITF #bigint must be a canonical decimal integer");
      }
      return Object.freeze({ kind: "int", value: BigInt(text) });
    }
    if (only === "#tup") {
      const items = value["#tup"];
      if (!Array.isArray(items)) throw new Error("ITF #tup must hold an array");
      return Object.freeze({ kind: "tuple", items: this.items(items, depth) });
    }
    if (only === "#set") {
      const items = value["#set"];
      if (!Array.isArray(items)) throw new Error("ITF #set must hold an array");
      const members = this.items(items, depth);
      if (new Set(members.map(itfValueKey)).size !== members.length) {
        throw new Error("ITF #set holds a duplicate member");
      }
      return Object.freeze({ kind: "set", items: members });
    }
    if (only === "#map") {
      const pairs = value["#map"];
      if (!Array.isArray(pairs)) throw new Error("ITF #map must hold an array");
      const entries = pairs.map((pair): readonly [ItfValue, ItfValue] => {
        if (!Array.isArray(pair) || pair.length !== 2) throw new Error("ITF #map entries must be pairs");
        return Object.freeze([this.read(pair[0], depth + 1), this.read(pair[1], depth + 1)] as const);
      });
      if (new Set(entries.map(([key]) => itfValueKey(key))).size !== entries.length) {
        throw new Error("ITF #map holds a duplicate key");
      }
      return Object.freeze({ kind: "map", entries: Object.freeze(entries) });
    }
    if (keys.some((key) => !FIELD_PATTERN.test(key))) {
      throw new Error("ITF record fields must be plain identifiers");
    }
    const fields = new Map<string, ItfValue>();
    for (const key of keys) fields.set(key, this.read(value[key], depth + 1));
    return Object.freeze({ kind: "record", fields });
  }

  private items(values: readonly unknown[], depth: number): readonly ItfValue[] {
    return Object.freeze(values.map((item) => this.read(item, depth + 1)));
  }
}

function parseTraceMeta(value: unknown): string | null {
  if (!isPlainRecord(value)) throw new Error("ITF #meta must be an object");
  for (const [key, entry] of Object.entries(value)) {
    if (key === "format") {
      if (entry !== "ITF") throw new Error("ITF #meta.format must be ITF");
    } else if (META_STRING_FIELDS.has(key)) {
      boundedString(entry, `#meta.${key}`);
    } else if (key === "timestamp") {
      if (typeof entry !== "number" || !Number.isSafeInteger(entry) || entry < 0) {
        throw new Error("ITF #meta.timestamp must be a non-negative integer");
      }
    } else if (key === "varTypes") {
      if (!isPlainRecord(entry)) throw new Error("ITF #meta.varTypes must be an object");
      for (const [name, type] of Object.entries(entry)) {
        if (!VARIABLE_PATTERN.test(name)) throw new Error("ITF #meta.varTypes names a malformed variable");
        boundedString(type, "#meta.varTypes entry");
      }
    } else {
      throw new Error(`ITF #meta has an unexpected field ${JSON.stringify(key).slice(0, 64)}`);
    }
  }
  const source = value.source;
  return typeof source === "string" ? source : null;
}

function parseState(value: unknown, position: number, vars: readonly string[], reader: ValueReader): ItfState {
  if (!isPlainRecord(value)) throw new Error("ITF states must be objects");
  const meta = value["#meta"];
  if (!isPlainRecord(meta) || Object.keys(meta).length !== 1 || meta.index !== position) {
    throw new Error(`ITF state ${String(position)} must carry exactly its own #meta.index`);
  }
  const keys = Object.keys(value).filter((key) => key !== "#meta").sort();
  const expected = [...vars].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`ITF state ${String(position)} must assign exactly the declared variables`);
  }
  const values = new Map<string, ItfValue>();
  for (const name of vars) values.set(name, reader.read(value[name], 1));
  return Object.freeze({ index: position, values });
}

/** Parse one ITF trace document from its UTF-8 text. */
export function parseItfTrace(text: string): ItfTrace {
  if (Buffer.byteLength(text, "utf8") > ITF_MAX_BYTES) throw new Error("ITF trace exceeds its byte bound");
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error("ITF trace is not JSON");
  }
  if (!isPlainRecord(document)) throw new Error("ITF trace must be an object");
  for (const key of Object.keys(document)) {
    if (!["#meta", "params", "vars", "states", "loop"].includes(key)) {
      throw new Error(`ITF trace has an unexpected field ${JSON.stringify(key).slice(0, 64)}`);
    }
  }
  const source = document["#meta"] === undefined ? null : parseTraceMeta(document["#meta"]);
  if (document.params !== undefined) {
    if (!Array.isArray(document.params) || document.params.length !== 0) {
      throw new Error("ITF parameterized traces are not supported");
    }
  }
  const vars = document.vars;
  if (
    !Array.isArray(vars) || vars.length === 0 || vars.length > ITF_MAX_VARIABLES
    || vars.some((name) => typeof name !== "string" || !VARIABLE_PATTERN.test(name))
    || new Set(vars).size !== vars.length
  ) {
    throw new Error("ITF vars must be a bounded list of unique variable names");
  }
  const states = document.states;
  if (!Array.isArray(states) || states.length === 0 || states.length > ITF_MAX_STATES) {
    throw new Error("ITF states must be a bounded non-empty list");
  }
  const reader = new ValueReader();
  const parsed = states.map((state, index) => parseState(state, index, vars as string[], reader));
  let loop: number | null = null;
  if (document.loop !== undefined) {
    if (typeof document.loop !== "number" || !Number.isSafeInteger(document.loop)
      || document.loop < 0 || document.loop >= parsed.length) {
      throw new Error("ITF loop must index an existing state");
    }
    loop = document.loop;
  }
  return Object.freeze({
    source,
    vars: Object.freeze([...(vars as string[])]),
    states: Object.freeze(parsed),
    loop,
  });
}

/** Read one variable from a state, failing closed when the trace does not carry it. */
export function itfVariable(state: ItfState, name: string): ItfValue {
  const value = state.values.get(name);
  if (value === undefined) throw new Error(`ITF state ${String(state.index)} has no variable ${name}`);
  return value;
}

export function itfString(value: ItfValue, label: string): string {
  if (value.kind !== "str") throw new Error(`ITF ${label} must be a string`);
  return value.value;
}

export function itfStringSet(value: ItfValue, label: string): ReadonlySet<string> {
  if (value.kind !== "set") throw new Error(`ITF ${label} must be a set`);
  return new Set(value.items.map((item) => itfString(item, `${label} member`)));
}

export function itfRecord(value: ItfValue, fields: readonly string[], label: string): ReadonlyMap<string, ItfValue> {
  if (value.kind !== "record") throw new Error(`ITF ${label} must be a record`);
  const names = [...value.fields.keys()].sort();
  const expected = [...fields].sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    throw new Error(`ITF ${label} must have exactly the fields ${expected.join(", ")}`);
  }
  return value.fields;
}

/**
 * Decode Quint's `Option` encoding, `{ tag: "Some", value }` or
 * `{ tag: "None", value: #tup[] }`, which `--mbt` uses for nondeterministic picks.
 */
export function itfOption(value: ItfValue, label: string): ItfValue | null {
  const fields = itfRecord(value, ["tag", "value"], label);
  const tag = itfString(fields.get("tag")!, `${label}.tag`);
  const payload = fields.get("value")!;
  if (tag === "Some") return payload;
  if (tag === "None" && payload.kind === "tuple" && payload.items.length === 0) return null;
  throw new Error(`ITF ${label} must be Some(value) or None`);
}
