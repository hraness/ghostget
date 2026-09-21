/**
 * Minimal JSON Schema draft 2020-12 evaluator for the keyword subset the
 * contract schema generator emits. Tests use it to prove that every document
 * the parsers accept validates, and that every parser rejection is either a
 * schema violation or a documented semantic rule. It is not a general
 * validator and is never shipped.
 */
import { isCanonicalDateTime, type JsonSchema } from "./contracts-shape";

type SchemaNode = JsonSchema;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left)) {
    return Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return deepEqual(leftKeys, rightKeys)
      && leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

function resolveRef(root: SchemaNode, ref: string): SchemaNode {
  const prefix = "#/$defs/";
  if (!ref.startsWith(prefix)) throw new Error(`unsupported $ref ${ref}`);
  const definitions = root.$defs;
  const name = ref.slice(prefix.length);
  if (!isRecord(definitions) || !isRecord(definitions[name])) {
    throw new Error(`unresolved $ref ${ref}`);
  }
  return definitions[name] as SchemaNode;
}

const supportedKeywords = new Set([
  "$schema", "$defs", "$ref", "title", "description",
  "type", "const", "enum", "properties", "required", "additionalProperties",
  "propertyNames", "maxProperties", "items", "minItems", "maxItems", "uniqueItems",
  "minimum", "maximum", "minLength", "maxLength", "pattern", "format", "oneOf",
]);

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case "object": return isRecord(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    default: throw new Error(`unsupported type ${type}`);
  }
}

function evaluate(
  root: SchemaNode,
  schema: SchemaNode,
  value: unknown,
  path: string,
  errors: string[],
  depth: number,
): void {
  if (depth > 128) throw new Error("schema evaluation exceeded its depth bound");
  for (const keyword of Object.keys(schema)) {
    if (!supportedKeywords.has(keyword)) throw new Error(`unsupported keyword ${keyword} at ${path}`);
  }
  if (typeof schema.$ref === "string") {
    evaluate(root, resolveRef(root, schema.$ref), value, path, errors, depth + 1);
  }
  if (typeof schema.type === "string" && !typeMatches(schema.type, value)) {
    errors.push(`${path}: expected type ${schema.type}`);
    return;
  }
  if ("const" in schema && !deepEqual(schema.const, value)) {
    errors.push(`${path}: expected const`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => deepEqual(candidate, value))) {
    errors.push(`${path}: not in enum`);
  }
  if (Array.isArray(schema.oneOf)) {
    let matches = 0;
    for (const variant of schema.oneOf) {
      const variantErrors: string[] = [];
      evaluate(root, variant as SchemaNode, value, path, variantErrors, depth + 1);
      if (variantErrors.length === 0) matches += 1;
    }
    if (matches !== 1) errors.push(`${path}: oneOf matched ${String(matches)} variants`);
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path}: longer than maxLength`);
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
      errors.push(`${path}: pattern mismatch`);
    }
    if (schema.format === "date-time" && !isCanonicalDateTime(value)) {
      errors.push(`${path}: not a canonical date-time`);
    }
    if (schema.format === "uri") {
      try {
        new URL(value);
      } catch {
        errors.push(`${path}: not a uri`);
      }
    }
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (typeof schema.maximum === "number" && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) errors.push(`${path}: fewer than minItems`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) errors.push(`${path}: more than maxItems`);
    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) errors.push(`${path}: duplicate items`);
    }
    if (isRecord(schema.items)) {
      value.forEach((item, index) =>
        evaluate(root, schema.items as SchemaNode, item, `${path}[${String(index)}]`, errors, depth + 1));
    }
  }
  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === "string" && !Object.hasOwn(value, key)) errors.push(`${path}: missing ${key}`);
      }
    }
    if (typeof schema.maxProperties === "number" && Object.keys(value).length > schema.maxProperties) {
      errors.push(`${path}: more than maxProperties`);
    }
    for (const [key, item] of Object.entries(value)) {
      if (isRecord(schema.propertyNames) && typeof schema.propertyNames.pattern === "string") {
        if (!new RegExp(schema.propertyNames.pattern, "u").test(key)) errors.push(`${path}: key ${key} pattern mismatch`);
      }
      if (Object.hasOwn(properties, key)) {
        evaluate(root, properties[key] as SchemaNode, item, `${path}.${key}`, errors, depth + 1);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: additional key ${key}`);
      } else if (isRecord(schema.additionalProperties)) {
        evaluate(root, schema.additionalProperties as SchemaNode, item, `${path}.${key}`, errors, depth + 1);
      }
    }
  }
}

/** Return every violation of `schema` by `value`; an empty list means valid. */
export function schemaViolations(schema: JsonSchema, value: unknown): readonly string[] {
  const errors: string[] = [];
  evaluate(schema, schema, value, "$", errors, 0);
  return errors;
}

/** Collect every `$ref` in a schema so tests can prove each resolves. */
export function schemaReferences(schema: JsonSchema): readonly string[] {
  const references: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isRecord(node)) return;
    if (typeof node.$ref === "string") references.push(node.$ref);
    Object.values(node).forEach(walk);
  };
  walk(schema);
  return references;
}

export function assertSchemaResolves(schema: JsonSchema): void {
  for (const reference of schemaReferences(schema)) resolveRef(schema, reference);
}
