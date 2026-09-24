/**
 * JSON mutation helpers shared by the formal-verification tests. Every strict
 * manifest parser here must reject each mutation `invalidatingMutation`
 * generates from a valid document.
 */
import { fc } from "../src/test-support.js";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonPath = readonly (string | number)[];

export const isJsonObject = (value: JsonValue | undefined): value is { [key: string]: JsonValue } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function jsonType(value: JsonValue | undefined): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/** Every path below the root of `value`, parents before their children. */
export function jsonPaths(value: JsonValue, path: JsonPath = []): JsonPath[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => [[...path, index], ...jsonPaths(item, [...path, index])]);
  }
  if (isJsonObject(value)) {
    return Object.entries(value).flatMap(([key, item]) => [[...path, key], ...jsonPaths(item, [...path, key])]);
  }
  return [];
}

export function jsonAt(value: JsonValue, path: JsonPath): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === "number") current = current[key];
    else if (isJsonObject(current) && typeof key === "string") current = current[key];
    else return undefined;
  }
  return current;
}

/** A copy of `value` with the entry at `path` replaced, or removed when `replacement` is undefined. */
export function jsonWith(value: JsonValue, path: JsonPath, replacement: JsonValue | undefined): JsonValue {
  const copy = structuredClone(value);
  const parent = jsonAt(copy, path.slice(0, -1));
  const key = path.at(-1);
  if (Array.isArray(parent) && typeof key === "number") {
    if (replacement === undefined) parent.splice(key, 1);
    else parent[key] = replacement;
  } else if (isJsonObject(parent) && typeof key === "string") {
    if (replacement === undefined) delete parent[key];
    else parent[key] = replacement;
  } else {
    throw new Error("jsonWith needs an existing parent");
  }
  return copy;
}

const TYPE_SAMPLES: readonly JsonValue[] = Object.freeze([null, true, 0, 7, "", "x", [], {}, [1], { extra: 1 }]);

/**
 * Mutations that every strict manifest parser here must reject: a value of
 * another JSON type anywhere, a missing object field, or an unknown field.
 */
export function invalidatingMutation(document: JsonValue): fc.Arbitrary<JsonValue> {
  const paths = jsonPaths(document);
  const objectPaths = [[], ...paths].filter((path) => isJsonObject(jsonAt(document, path)));
  const fieldPaths = paths.filter((path) => typeof path.at(-1) === "string");
  return fc.oneof(
    fc.tuple(fc.constantFrom(...paths), fc.constantFrom(...TYPE_SAMPLES))
      .filter(([path, sample]) => jsonType(sample) !== jsonType(jsonAt(document, path)))
      .map(([path, sample]) => jsonWith(document, path, sample)),
    fc.constantFrom(...fieldPaths).map((path) => jsonWith(document, path, undefined)),
    fc.constantFrom(...objectPaths).map((path) => jsonWith(document, [...path, "unexpectedField"], true)),
  );
}

/** True when `parse` throws. */
export function rejects(parse: () => unknown): boolean {
  try {
    parse();
    return false;
  } catch {
    return true;
  }
}
