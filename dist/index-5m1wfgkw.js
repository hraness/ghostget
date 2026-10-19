// @bun
// src/contracts-shape.ts
class ContractParseError extends Error {
  path;
  constructor(path, detail) {
    super(`${path} ${detail}`);
    this.name = "ContractParseError";
    this.path = path;
  }
}
var MAX_JSON_KEY_LENGTH = 1024;
function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function setJsonField(target, key, value) {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}
function jsonEquals(left, right) {
  if (left === null || typeof left !== "object")
    return Object.is(left, right);
  if (Array.isArray(left)) {
    return Array.isArray(right) && right.length === left.length && left.every((item, index) => jsonEquals(item, right[index]));
  }
  if (!isPlainObject(right))
    return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && jsonEquals(left[key], right[key]));
}
function freezeJson(value) {
  if (value === null || typeof value !== "object")
    return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezeJson(item)));
  }
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeJson(item)])));
}
function parseJson(value, path, maxDepth, maxNodes, depth, budget) {
  budget.nodes += 1;
  if (budget.nodes > maxNodes) {
    throw new ContractParseError(path, `exceeds the bound of ${String(maxNodes)} JSON nodes`);
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new ContractParseError(path, "must be a finite number");
    return value;
  }
  if (depth >= maxDepth) {
    throw new ContractParseError(path, `exceeds the JSON depth bound of ${String(maxDepth)}`);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => parseJson(item, `${path}[${String(index)}]`, maxDepth, maxNodes, depth + 1, budget));
  }
  if (!isPlainObject(value)) {
    throw new ContractParseError(path, "must be a JSON value");
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.length > MAX_JSON_KEY_LENGTH || key.includes("\x00")) {
      throw new ContractParseError(path, "has an invalid JSON key");
    }
    setJsonField(result, key, parseJson(item, `${path}.${key}`, maxDepth, maxNodes, depth + 1, budget));
  }
  return result;
}
function parseString(shape, value, path) {
  if (typeof value !== "string")
    throw new ContractParseError(path, "must be a string");
  const minLength = shape.minLength ?? 0;
  if (value.length < minLength || value.length > shape.maxLength) {
    throw new ContractParseError(path, `must be a string of ${String(minLength)} to ${String(shape.maxLength)} characters`);
  }
  if (value.includes("\x00"))
    throw new ContractParseError(path, "must not contain NUL");
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
function hasUnpairedSurrogate(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343))
        return true;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return true;
  }
  return false;
}
function isCanonicalDateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value))
    return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
function isAbsoluteUri(value) {
  try {
    return new URL(value).href.length > 0;
  } catch {
    return false;
  }
}
function resolveShape(shape, definitions) {
  let current = shape;
  for (let hops = 0;current.kind === "ref"; hops += 1) {
    const next = definitions[current.name];
    if (next === undefined || hops > 8) {
      throw new Error(`contract shape reference ${current.name} is not defined`);
    }
    current = next;
  }
  return current;
}
function discriminatedVariant(shape, value, definitions) {
  if (!isPlainObject(value))
    return null;
  const variants = shape.variants.map((variant) => resolveShape(variant, definitions));
  if (!variants.every((variant) => variant.kind === "object"))
    return null;
  const objects = variants;
  const keys = new Set(objects.flatMap((variant) => Object.keys(variant.properties)));
  for (const key of keys) {
    const classified = objects.map((variant) => {
      const property = variant.properties[key];
      if (property === undefined)
        return { kind: "absent" };
      if ((variant.optional ?? []).includes(key))
        return { kind: "other" };
      if (property.kind === "literal")
        return { kind: "values", values: [property.value] };
      if (property.kind === "enum")
        return { kind: "values", values: [...property.values] };
      return { kind: "other" };
    });
    if (classified.some((entry) => entry.kind === "other"))
      continue;
    const literals = classified.flatMap((entry) => entry.kind === "values" ? entry.values.map((literal) => JSON.stringify(literal)) : []);
    if (new Set(literals).size !== literals.length)
      continue;
    const matched = Object.hasOwn(value, key) ? objects.filter((_, index) => {
      const entry = classified[index];
      return entry?.kind === "values" && entry.values.some((literal) => jsonEquals(literal, value[key]));
    }) : objects.filter((_, index) => classified[index]?.kind === "absent");
    if (matched.length === 1)
      return matched[0] ?? null;
  }
  return null;
}
function parseResolved(shape, value, path, definitions, depth) {
  if (depth > 64)
    throw new ContractParseError(path, "exceeds the document nesting bound");
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
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < shape.minimum || value > shape.maximum) {
        throw new ContractParseError(path, `must be an integer from ${String(shape.minimum)} to ${String(shape.maximum)}`);
      }
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ContractParseError(path, "must be a finite number");
      }
      return value;
    case "boolean":
      if (typeof value !== "boolean")
        throw new ContractParseError(path, "must be a boolean");
      return value;
    case "null":
      if (value !== null)
        throw new ContractParseError(path, "must be null");
      return null;
    case "object": {
      if (!isPlainObject(value))
        throw new ContractParseError(path, "must be a JSON object");
      const optional = new Set(shape.optional ?? []);
      const result = {};
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(shape.properties, key)) {
          throw new ContractParseError(path, `has an unsupported key ${key}`);
        }
      }
      for (const [key, property] of Object.entries(shape.properties)) {
        if (!Object.hasOwn(value, key)) {
          if (optional.has(key))
            continue;
          throw new ContractParseError(path, `is missing required key ${key}`);
        }
        setJsonField(result, key, parseResolved(property, value[key], `${path}.${key}`, definitions, depth + 1));
      }
      return Object.freeze(result);
    }
    case "record": {
      if (!isPlainObject(value))
        throw new ContractParseError(path, "must be a JSON object");
      const keys = Object.keys(value);
      if (keys.length > shape.maxProperties) {
        throw new ContractParseError(path, `must have at most ${String(shape.maxProperties)} keys`);
      }
      const result = {};
      for (const key of keys) {
        if (key.length === 0 || key.length > MAX_JSON_KEY_LENGTH || shape.keyPattern !== undefined && !shape.keyPattern.test(key)) {
          throw new ContractParseError(path, "has a key that does not match its required pattern");
        }
        setJsonField(result, key, parseResolved(shape.values, value[key], `${path}.${key}`, definitions, depth + 1));
      }
      return Object.freeze(result);
    }
    case "array": {
      if (!Array.isArray(value))
        throw new ContractParseError(path, "must be an array");
      const minItems = shape.minItems ?? 0;
      if (value.length < minItems || value.length > shape.maxItems) {
        throw new ContractParseError(path, `must have ${String(minItems)} to ${String(shape.maxItems)} items`);
      }
      const items = value.map((item, index) => parseResolved(shape.items, item, `${path}[${String(index)}]`, definitions, depth + 1));
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
      const accepted = [];
      let lastError = null;
      for (const variant of shape.variants) {
        try {
          accepted.push(parseResolved(variant, value, path, definitions, depth + 1));
        } catch (error) {
          if (!(error instanceof ContractParseError))
            throw error;
          lastError = error;
        }
      }
      if (accepted.length === 1)
        return accepted[0];
      if (accepted.length > 1) {
        throw new ContractParseError(path, "matches more than one variant");
      }
      throw lastError ?? new ContractParseError(path, "matches no variant");
    }
    case "json":
      return freezeJson(parseJson(value, path, shape.maxDepth, shape.maxNodes, 0, { nodes: 0 }));
    default: {
      const exhaustive = shape;
      throw new Error(`unknown contract shape ${String(exhaustive)}`);
    }
  }
}
function parseShape(shape, value, path, definitions = {}) {
  return parseResolved(shape, value, path, definitions, 0);
}
function withDescription(schema, description) {
  return Object.freeze(description === undefined ? schema : { ...schema, description });
}
function schemaFor(shape) {
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
        ...shape.minLength === undefined ? {} : { minLength: shape.minLength },
        maxLength: shape.maxLength,
        ...shape.pattern === undefined ? {} : { pattern: shape.pattern.source },
        ...shape.format === undefined ? {} : { format: shape.format }
      }, shape.description);
    case "integer":
      return withDescription({
        type: "integer",
        minimum: shape.minimum,
        maximum: shape.maximum
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
        properties: Object.fromEntries(Object.entries(shape.properties).map(([key, property]) => [key, schemaFor(property)])),
        required: Object.keys(shape.properties).filter((key) => !optional.has(key)),
        additionalProperties: false
      }, shape.description);
    }
    case "record":
      return withDescription({
        type: "object",
        ...shape.keyPattern === undefined ? {} : { propertyNames: { pattern: shape.keyPattern.source } },
        additionalProperties: schemaFor(shape.values),
        maxProperties: shape.maxProperties
      }, shape.description);
    case "array":
      return withDescription({
        type: "array",
        items: schemaFor(shape.items),
        ...shape.minItems === undefined ? {} : { minItems: shape.minItems },
        maxItems: shape.maxItems,
        ...shape.uniqueItems === true ? { uniqueItems: true } : {}
      }, shape.description);
    case "union":
      return withDescription({
        oneOf: shape.variants.map((variant) => schemaFor(variant))
      }, shape.description);
    case "json":
      return withDescription({}, shape.description ?? `Any JSON value; parsers bound it to depth ${String(shape.maxDepth)} and ${String(shape.maxNodes)} nodes.`);
    default: {
      const exhaustive = shape;
      throw new Error(`unknown contract shape ${String(exhaustive)}`);
    }
  }
}
function shapeJsonSchema(shape, options) {
  const definitions = options.definitions ?? {};
  const $defs = Object.fromEntries(Object.entries(definitions).sort(([left], [right]) => left.localeCompare(right)).map(([name, definition]) => [name, schemaFor(definition)]));
  return Object.freeze({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: options.title,
    description: options.description,
    ...schemaFor(shape),
    ...Object.keys($defs).length === 0 ? {} : { $defs }
  });
}
function hasExactKeys(value, keys) {
  return hasSameKeys(Object.keys(value), keys);
}
function hasSameKeys(actual, keys) {
  const expected = new Set(keys);
  const list = Array.from(actual);
  return expected.size === keys.length && list.length === expected.size && list.every((key) => expected.has(key));
}

export { ContractParseError, parseShape, shapeJsonSchema, hasExactKeys };
