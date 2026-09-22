/**
 * Shape tables shared by the contract parsers and the JSON Schema generator.
 *
 * Every public contract document is described once as a `Shape`. The same
 * table drives `parseShape` (strict parsing from `unknown`, exact keys, deep
 * frozen copies) and `shapeJsonSchema` (JSON Schema draft 2020-12), so the
 * published schema cannot drift from what the parser accepts. Rules a shape
 * cannot express (uniqueness across siblings, cross-field binding, JSON depth)
 * are semantic rules stated beside each document parser and documented in
 * `docs/contracts.md`.
 *
 * This module is dependency-free and side-effect free.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type Shape =
  | {
      readonly kind: "literal";
      readonly value: JsonValue;
      readonly description?: string;
    }
  | {
      readonly kind: "enum";
      readonly values: readonly (string | number | boolean)[];
      readonly description?: string;
    }
  | {
      readonly kind: "string";
      readonly minLength?: number;
      readonly maxLength: number;
      readonly pattern?: RegExp;
      readonly format?: "date-time" | "uri";
      readonly description?: string;
    }
  | {
      readonly kind: "integer";
      readonly minimum: number;
      readonly maximum: number;
      readonly description?: string;
    }
  | {
      readonly kind: "number";
      readonly description?: string;
    }
  | { readonly kind: "boolean"; readonly description?: string }
  | { readonly kind: "null"; readonly description?: string }
  | {
      readonly kind: "object";
      readonly properties: Readonly<Record<string, Shape>>;
      /** Keys that may be absent. Every other key is required. */
      readonly optional?: readonly string[];
      readonly description?: string;
    }
  | {
      readonly kind: "record";
      readonly values: Shape;
      readonly keyPattern?: RegExp;
      readonly maxProperties: number;
      readonly description?: string;
    }
  | {
      readonly kind: "array";
      readonly items: Shape;
      readonly minItems?: number;
      readonly maxItems: number;
      readonly uniqueItems?: boolean;
      readonly description?: string;
    }
  | {
      /** Disjoint variants; exactly one must accept the value. */
      readonly kind: "union";
      readonly variants: readonly Shape[];
      readonly description?: string;
    }
  | { readonly kind: "ref"; readonly name: string }
  | {
      /**
       * Any JSON value. The schema documents it as unconstrained; the parser
       * bounds its depth and node count and rejects non-JSON values.
       */
      readonly kind: "json";
      readonly maxDepth: number;
      readonly maxNodes: number;
      readonly description?: string;
    };

export type ShapeDefinitions = Readonly<Record<string, Shape>>;

export class ContractParseError extends Error {
  readonly path: string;

  constructor(path: string, detail: string) {
    super(`${path} ${detail}`);
    this.name = "ContractParseError";
    this.path = path;
  }
}

/** Foreign JSON keys stay bounded; provider outputs may legitimately use empty keys. */
const MAX_JSON_KEY_LENGTH = 1_024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function jsonEquals(left: JsonValue, right: unknown): boolean {
  if (left === null || typeof left !== "object") return Object.is(left, right);
  if (Array.isArray(left)) {
    return Array.isArray(right)
      && right.length === left.length
      && left.every((item, index) => jsonEquals(item, right[index]));
  }
  if (!isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) =>
      key === rightKeys[index]
      && jsonEquals((left as Record<string, JsonValue>)[key] as JsonValue, right[key]));
}

function freezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezeJson(item)));
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, freezeJson(item)]),
  ));
}

type JsonBudget = { nodes: number };

function parseJson(
  value: unknown,
  path: string,
  maxDepth: number,
  maxNodes: number,
  depth: number,
  budget: JsonBudget,
): JsonValue {
  budget.nodes += 1;
  if (budget.nodes > maxNodes) {
    throw new ContractParseError(path, `exceeds the bound of ${String(maxNodes)} JSON nodes`);
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ContractParseError(path, "must be a finite number");
    return value;
  }
  if (depth >= maxDepth) {
    throw new ContractParseError(path, `exceeds the JSON depth bound of ${String(maxDepth)}`);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      parseJson(item, `${path}[${String(index)}]`, maxDepth, maxNodes, depth + 1, budget));
  }
  if (!isPlainObject(value)) {
    throw new ContractParseError(path, "must be a JSON value");
  }
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.length > MAX_JSON_KEY_LENGTH || key.includes("\0")) {
      throw new ContractParseError(path, "has an invalid JSON key");
    }
    result[key] = parseJson(item, `${path}.${key}`, maxDepth, maxNodes, depth + 1, budget);
  }
  return result;
}

function parseString(
  shape: Extract<Shape, { readonly kind: "string" }>,
  value: unknown,
  path: string,
): string {
  if (typeof value !== "string") throw new ContractParseError(path, "must be a string");
  const minLength = shape.minLength ?? 0;
  if (value.length < minLength || value.length > shape.maxLength) {
    throw new ContractParseError(
      path,
      `must be a string of ${String(minLength)} to ${String(shape.maxLength)} characters`,
    );
  }
  if (value.includes("\0")) throw new ContractParseError(path, "must not contain NUL");
  if (hasUnpairedSurrogate(value)) {
    throw new ContractParseError(path, "must be well-formed Unicode");
  }
  if (shape.pattern !== undefined && !shape.pattern.test(value)) {
    throw new ContractParseError(path, "does not match its required pattern");
  }
  if (shape.format === "date-time" && !isCanonicalDateTime(value)) {
    throw new ContractParseError(path, "must be a canonical UTC ISO 8601 timestamp");
  }
  if (shape.format === "uri" && !isAbsoluteUri(value)) {
    throw new ContractParseError(path, "must be an absolute URI");
  }
  return value;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

export function isCanonicalDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isAbsoluteUri(value: string): boolean {
  try {
    return new URL(value).href.length > 0;
  } catch {
    return false;
  }
}

function resolveShape(shape: Shape, definitions: ShapeDefinitions): Shape {
  let current = shape;
  for (let hops = 0; current.kind === "ref"; hops += 1) {
    const next = definitions[current.name];
    if (next === undefined || hops > 8) {
      throw new Error(`contract shape reference ${current.name} is not defined`);
    }
    current = next;
  }
  return current;
}

/**
 * Object unions are usually discriminated by one key that each variant either
 * pins to a distinct literal or enum set, or omits entirely. That key selects
 * the variant so errors name the real defect instead of the last variant tried.
 */
function discriminatedVariant(
  shape: Extract<Shape, { readonly kind: "union" }>,
  value: unknown,
  definitions: ShapeDefinitions,
): Shape | null {
  if (!isPlainObject(value)) return null;
  const variants = shape.variants.map((variant) => resolveShape(variant, definitions));
  if (!variants.every((variant) => variant.kind === "object")) return null;
  const objects = variants as Extract<Shape, { readonly kind: "object" }>[];
  const keys = new Set(objects.flatMap((variant) => Object.keys(variant.properties)));
  for (const key of keys) {
    const classified = objects.map((variant) => {
      const property = variant.properties[key];
      if (property === undefined) return { kind: "absent" as const };
      if ((variant.optional ?? []).includes(key)) return { kind: "other" as const };
      if (property.kind === "literal") return { kind: "values" as const, values: [property.value] };
      if (property.kind === "enum") return { kind: "values" as const, values: [...property.values] };
      return { kind: "other" as const };
    });
    if (classified.some((entry) => entry.kind === "other")) continue;
    const literals = classified.flatMap((entry) =>
      entry.kind === "values" ? entry.values.map((literal) => JSON.stringify(literal)) : []);
    if (new Set(literals).size !== literals.length) continue;
    const matched = Object.hasOwn(value, key)
      ? objects.filter((_, index) => {
          const entry = classified[index];
          return entry?.kind === "values"
            && entry.values.some((literal) => jsonEquals(literal, value[key]));
        })
      : objects.filter((_, index) => classified[index]?.kind === "absent");
    if (matched.length === 1) return matched[0] ?? null;
  }
  return null;
}

function parseResolved(
  shape: Shape,
  value: unknown,
  path: string,
  definitions: ShapeDefinitions,
  depth: number,
): unknown {
  if (depth > 64) throw new ContractParseError(path, "exceeds the document nesting bound");
  switch (shape.kind) {
    case "ref":
      return parseResolved(resolveShape(shape, definitions), value, path, definitions, depth);
    case "literal":
      if (!jsonEquals(shape.value, value)) {
        throw new ContractParseError(path, `must equal ${JSON.stringify(shape.value)}`);
      }
      return freezeJson(shape.value);
    case "enum":
      if (!shape.values.some((candidate) => Object.is(candidate, value))) {
        throw new ContractParseError(path, `must be one of ${shape.values.map((candidate) => JSON.stringify(candidate)).join(", ")}`);
      }
      return value;
    case "string":
      return parseString(shape, value, path);
    case "integer":
      if (
        typeof value !== "number"
        || !Number.isSafeInteger(value)
        || value < shape.minimum
        || value > shape.maximum
      ) {
        throw new ContractParseError(
          path,
          `must be an integer from ${String(shape.minimum)} to ${String(shape.maximum)}`,
        );
      }
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ContractParseError(path, "must be a finite number");
      }
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw new ContractParseError(path, "must be a boolean");
      return value;
    case "null":
      if (value !== null) throw new ContractParseError(path, "must be null");
      return null;
    case "object": {
      if (!isPlainObject(value)) throw new ContractParseError(path, "must be a JSON object");
      const optional = new Set(shape.optional ?? []);
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(shape.properties, key)) {
          throw new ContractParseError(path, `has an unsupported key ${key}`);
        }
      }
      for (const [key, property] of Object.entries(shape.properties)) {
        if (!Object.hasOwn(value, key)) {
          if (optional.has(key)) continue;
          throw new ContractParseError(path, `is missing required key ${key}`);
        }
        result[key] = parseResolved(property, value[key], `${path}.${key}`, definitions, depth + 1);
      }
      return Object.freeze(result);
    }
    case "record": {
      if (!isPlainObject(value)) throw new ContractParseError(path, "must be a JSON object");
      const keys = Object.keys(value);
      if (keys.length > shape.maxProperties) {
        throw new ContractParseError(path, `must have at most ${String(shape.maxProperties)} keys`);
      }
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (
          key.length === 0
          || key.length > MAX_JSON_KEY_LENGTH
          || (shape.keyPattern !== undefined && !shape.keyPattern.test(key))
        ) {
          throw new ContractParseError(path, "has a key that does not match its required pattern");
        }
        result[key] = parseResolved(shape.values, value[key], `${path}.${key}`, definitions, depth + 1);
      }
      return Object.freeze(result);
    }
    case "array": {
      if (!Array.isArray(value)) throw new ContractParseError(path, "must be an array");
      const minItems = shape.minItems ?? 0;
      if (value.length < minItems || value.length > shape.maxItems) {
        throw new ContractParseError(
          path,
          `must have ${String(minItems)} to ${String(shape.maxItems)} items`,
        );
      }
      const items = value.map((item, index) =>
        parseResolved(shape.items, item, `${path}[${String(index)}]`, definitions, depth + 1));
      if (shape.uniqueItems === true) {
        const seen = new Set(items.map((item) => JSON.stringify(item)));
        if (seen.size !== items.length) {
          throw new ContractParseError(path, "must not contain duplicate items");
        }
      }
      return Object.freeze(items);
    }
    case "union": {
      const discriminated = discriminatedVariant(shape, value, definitions);
      if (discriminated !== null) {
        return parseResolved(discriminated, value, path, definitions, depth + 1);
      }
      const accepted: unknown[] = [];
      let lastError: ContractParseError | null = null;
      for (const variant of shape.variants) {
        try {
          accepted.push(parseResolved(variant, value, path, definitions, depth + 1));
        } catch (error) {
          if (!(error instanceof ContractParseError)) throw error;
          lastError = error;
        }
      }
      if (accepted.length === 1) return accepted[0];
      if (accepted.length > 1) {
        throw new ContractParseError(path, "matches more than one variant");
      }
      throw lastError ?? new ContractParseError(path, "matches no variant");
    }
    case "json":
      return freezeJson(parseJson(value, path, shape.maxDepth, shape.maxNodes, 0, { nodes: 0 }));
    default: {
      const exhaustive: never = shape;
      throw new Error(`unknown contract shape ${String(exhaustive)}`);
    }
  }
}

/**
 * Parse a foreign value against a shape. Rejects extra keys, missing keys,
 * malformed bounds and non-JSON values, and returns a deep-frozen copy that
 * contains only the shape's keys.
 */
export function parseShape<T>(
  shape: Shape,
  value: unknown,
  path: string,
  definitions: ShapeDefinitions = {},
): T {
  return parseResolved(shape, value, path, definitions, 0) as T;
}

export type JsonSchema = { readonly [key: string]: JsonValue };

function withDescription(
  schema: Record<string, JsonValue>,
  description: string | undefined,
): JsonSchema {
  return Object.freeze(
    description === undefined ? schema : { ...schema, description },
  );
}

function schemaFor(shape: Shape): JsonSchema {
  switch (shape.kind) {
    case "ref":
      return Object.freeze({ $ref: `#/$defs/${shape.name}` });
    case "literal":
      return withDescription({ const: shape.value }, shape.description);
    case "enum":
      return withDescription({ enum: [...shape.values] }, shape.description);
    case "string":
      return withDescription({
        type: "string",
        ...(shape.minLength === undefined ? {} : { minLength: shape.minLength }),
        maxLength: shape.maxLength,
        ...(shape.pattern === undefined ? {} : { pattern: shape.pattern.source }),
        ...(shape.format === undefined ? {} : { format: shape.format }),
      }, shape.description);
    case "integer":
      return withDescription({
        type: "integer",
        minimum: shape.minimum,
        maximum: shape.maximum,
      }, shape.description);
    case "number":
      return withDescription({ type: "number" }, shape.description);
    case "boolean":
      return withDescription({ type: "boolean" }, shape.description);
    case "null":
      return withDescription({ type: "null" }, shape.description);
    case "object": {
      const optional = new Set(shape.optional ?? []);
      return withDescription({
        type: "object",
        properties: Object.fromEntries(
          Object.entries(shape.properties).map(([key, property]) => [key, schemaFor(property)]),
        ),
        required: Object.keys(shape.properties).filter((key) => !optional.has(key)),
        additionalProperties: false,
      }, shape.description);
    }
    case "record":
      return withDescription({
        type: "object",
        ...(shape.keyPattern === undefined
          ? {}
          : { propertyNames: { pattern: shape.keyPattern.source } }),
        additionalProperties: schemaFor(shape.values),
        maxProperties: shape.maxProperties,
      }, shape.description);
    case "array":
      return withDescription({
        type: "array",
        items: schemaFor(shape.items),
        ...(shape.minItems === undefined ? {} : { minItems: shape.minItems }),
        maxItems: shape.maxItems,
        ...(shape.uniqueItems === true ? { uniqueItems: true } : {}),
      }, shape.description);
    case "union":
      return withDescription({
        oneOf: shape.variants.map((variant) => schemaFor(variant)),
      }, shape.description);
    case "json":
      return withDescription({}, shape.description
        ?? `Any JSON value; parsers bound it to depth ${String(shape.maxDepth)} and ${String(shape.maxNodes)} nodes.`);
    default: {
      const exhaustive: never = shape;
      throw new Error(`unknown contract shape ${String(exhaustive)}`);
    }
  }
}

/** Emit one JSON Schema draft 2020-12 document for a root shape and its definitions. */
export function shapeJsonSchema(
  shape: Shape,
  options: {
    readonly title: string;
    readonly description: string;
    readonly definitions?: ShapeDefinitions;
  },
): JsonSchema {
  const definitions = options.definitions ?? {};
  const $defs = Object.fromEntries(
    Object.entries(definitions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, definition]) => [name, schemaFor(definition)]),
  );
  return Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: options.title,
    description: options.description,
    ...schemaFor(shape),
    ...(Object.keys($defs).length === 0 ? {} : { $defs }),
  });
}

/** Deep-freeze a JSON document produced by a projection before it leaves a module. */
export function frozenJson<T extends JsonValue>(value: T): T {
  return freezeJson(value) as T;
}
