// @bun
import {
  validateOperationInput
} from "./index-dw20pbkj.js";
import"./index-26yq8q16.js";
import {
  canonicalJson,
  sha256
} from "./index-xa1qz35x.js";
import"./index-z1w83f81.js";

// src/contracts-vocabulary.ts
var CONTRACT_CATALOG_V1 = "ghostget.contract-catalog.v1";
var CONTRACT_CHECK_V1 = "ghostget.contract-check.v1";
var COLLECTION_PLAN_SCHEMA_VERSION = 1;
var operationRisks = Object.freeze(["R1", "R2", "R3", "R4"]);
var contractStates = Object.freeze(["observed", "capture-required"]);
var contractTransports = Object.freeze([
  "web-session-api",
  "provider-api",
  "local-cli",
  "reviewed-template-api"
]);
var operationAuthorities = Object.freeze(["public", "auth"]);
var idempotencyKinds = Object.freeze(["none", "local-at-most-once"]);
var readFailureDispositions = Object.freeze({
  "target-unavailable": "do-not-retry",
  "auth-repair-required": "repair-auth",
  "account-mismatch": "do-not-retry",
  "contract-drift": "do-not-retry",
  "cleanup-required": "do-not-retry",
  "provider-throttled": "retry-once-after-60s",
  "provider-temporary": "retry-once-after-60s",
  "operation-timeout": "retry-once-after-60s"
});
var readFailureCategories = Object.freeze(Object.keys(readFailureDispositions));
var retryDispositions = Object.freeze([
  "do-not-retry",
  "repair-auth",
  "retry-once-after-60s"
]);
var invokeStatusTable = Object.freeze({
  succeeded: true,
  failed: true
});
var invokeStatuses = Object.freeze(Object.keys(invokeStatusTable));
var contractGapReasons = Object.freeze([
  "adapter-missing",
  "adapter-invalid",
  "operation-missing",
  "state-mismatch",
  "risk-mismatch",
  "side-effect-mismatch",
  "authority-mismatch",
  "input-invalid",
  "auth-missing",
  "transport-disabled"
]);
var contractSchemaNames = Object.freeze([
  "catalog",
  "check",
  "plan",
  "invoke-read",
  "repair"
]);
var contractPatterns = Object.freeze({
  adapterId: /^[a-z][a-z0-9-]{0,47}$/u,
  authId: /^[a-z][a-z0-9-]{0,47}$/u,
  operationId: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*){1,3}$/u,
  surfaceId: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u,
  sha256: /^[a-f0-9]{64}$/u,
  semanticVersion: /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u,
  kebabKey: /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
  metricKey: /^[a-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$/u,
  inputFieldName: /^[a-z][a-z0-9_]{0,63}$/u,
  httpsOrigin: /^https:\/\/[^/?#\s]+$/u,
  httpsUrl: /^https:\/\/[^\s]+$/u,
  runId: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
});

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

// src/contracts-catalog.ts
var MAX_DESCRIPTION_LENGTH = 500;
var MAX_ISSUE_LENGTH = 2000;
var MAX_SIDE_EFFECT_LENGTH = 500;
var MAX_DEDUPE_WINDOW_MS = 30 * 24 * 60 * 60000;
var MAX_CATALOG_ADAPTERS = 512;
var MAX_ADAPTER_OPERATIONS = 512;
var MAX_ADAPTER_ORIGINS = 64;
var MAX_INPUT_FIELDS = 100;
var MAX_INPUT_ARRAY_ITEMS = 100;
var MAX_INPUT_LENGTH_BOUND = 1e6;
var MAX_FILE_BYTES = 1024 * 1024 * 1024;
var MAX_CONTRACT_VERSION = 1e6;
var description = {
  kind: "string",
  minLength: 1,
  maxLength: MAX_DESCRIPTION_LENGTH,
  description: "Reviewed manifest description of the input field."
};
var scalarInputField = {
  kind: "object",
  properties: {
    type: { kind: "enum", values: ["string", "boolean", "number"] },
    description,
    minLength: { kind: "integer", minimum: 0, maximum: MAX_INPUT_LENGTH_BOUND },
    maxLength: { kind: "integer", minimum: 1, maximum: MAX_INPUT_LENGTH_BOUND },
    minimum: { kind: "number" },
    maximum: { kind: "number" },
    enum: {
      kind: "array",
      items: {
        kind: "union",
        variants: [{ kind: "string", maxLength: 4096 }, { kind: "number" }, { kind: "boolean" }]
      },
      minItems: 1,
      maxItems: 256
    },
    format: { kind: "enum", values: ["url", "path-segment"] },
    urlPathPrefixes: {
      kind: "array",
      items: { kind: "string", minLength: 1, maxLength: 2048 },
      minItems: 1,
      maxItems: 20
    }
  },
  optional: ["minLength", "maxLength", "minimum", "maximum", "enum", "format", "urlPathPrefixes"]
};
var fileInputField = {
  kind: "object",
  properties: {
    type: { kind: "literal", value: "file" },
    description,
    maxBytes: { kind: "integer", minimum: 1, maximum: MAX_FILE_BYTES },
    mediaTypes: {
      kind: "array",
      items: { kind: "string", minLength: 3, maxLength: 255 },
      minItems: 1,
      maxItems: 32
    }
  },
  optional: ["mediaTypes"]
};
var arrayInputField = {
  kind: "object",
  properties: {
    type: { kind: "literal", value: "array" },
    description,
    items: { kind: "union", variants: [scalarInputField, fileInputField] },
    minItems: { kind: "integer", minimum: 0, maximum: MAX_INPUT_ARRAY_ITEMS },
    maxItems: { kind: "integer", minimum: 1, maximum: MAX_INPUT_ARRAY_ITEMS }
  }
};
var contractInputDefinitions = Object.freeze({
  inputField: {
    kind: "union",
    variants: [scalarInputField, fileInputField, arrayInputField],
    description: "One reviewed operation input field, exactly as the installed manifest declares it."
  },
  inputSchema: {
    kind: "object",
    properties: {
      properties: {
        kind: "record",
        values: { kind: "ref", name: "inputField" },
        keyPattern: contractPatterns.inputFieldName,
        maxProperties: MAX_INPUT_FIELDS
      },
      required: {
        kind: "array",
        items: { kind: "string", minLength: 1, maxLength: 64, pattern: contractPatterns.inputFieldName },
        maxItems: MAX_INPUT_FIELDS,
        uniqueItems: true
      }
    },
    description: "Operation input schema; `required` names a subset of `properties`."
  }
});
var catalogVocabularyValue = Object.freeze({
  risks: operationRisks,
  states: contractStates,
  transports: contractTransports,
  authorities: operationAuthorities,
  readFailure: readFailureDispositions,
  invokeStatuses
});
var operationShape = {
  kind: "object",
  properties: {
    id: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
    transport: { kind: "enum", values: contractTransports },
    authority: {
      kind: "enum",
      values: operationAuthorities,
      description: "`public` when Ghostget runs the operation without an auth locator; otherwise `auth`."
    },
    risk: { kind: "enum", values: operationRisks },
    sideEffect: { kind: "string", minLength: 1, maxLength: MAX_SIDE_EFFECT_LENGTH },
    idempotency: { kind: "enum", values: idempotencyKinds },
    dedupeWindowMs: { kind: "integer", minimum: 0, maximum: MAX_DEDUPE_WINDOW_MS },
    state: { kind: "enum", values: contractStates },
    contractVersion: { kind: "integer", minimum: 1, maximum: MAX_CONTRACT_VERSION },
    contractHash: {
      kind: "string",
      minLength: 64,
      maxLength: 64,
      pattern: contractPatterns.sha256,
      description: "Durable contract hash for the operation's transport."
    },
    input: { kind: "ref", name: "inputSchema" }
  }
};
var adapterShape = {
  kind: "object",
  properties: {
    id: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
    version: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
    surfaceId: {
      kind: "union",
      variants: [
        { kind: "string", minLength: 1, maxLength: 63, pattern: contractPatterns.surfaceId },
        { kind: "null" }
      ]
    },
    manifestHash: { kind: "string", minLength: 64, maxLength: 64, pattern: contractPatterns.sha256 },
    origins: {
      kind: "array",
      items: { kind: "string", minLength: 9, maxLength: 2048, pattern: contractPatterns.httpsOrigin },
      maxItems: MAX_ADAPTER_ORIGINS,
      uniqueItems: true
    },
    operations: { kind: "array", items: operationShape, maxItems: MAX_ADAPTER_OPERATIONS }
  }
};
var invalidAdapterShape = {
  kind: "object",
  properties: {
    id: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
    invalid: { kind: "literal", value: true },
    issues: {
      kind: "array",
      items: { kind: "string", minLength: 1, maxLength: MAX_ISSUE_LENGTH },
      minItems: 1,
      maxItems: 64
    }
  },
  description: "An installed manifest that no longer parses; it exposes no operations."
};
var catalogShape = {
  kind: "object",
  properties: {
    ok: {
      kind: "boolean",
      description: "False only when a requested adapter filter matched no installed adapter."
    },
    contract: { kind: "literal", value: CONTRACT_CATALOG_V1 },
    ghostget: {
      kind: "object",
      properties: {
        version: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion }
      }
    },
    generatedAt: { kind: "string", minLength: 24, maxLength: 24, format: "date-time" },
    vocabulary: {
      kind: "object",
      properties: {
        risks: { kind: "literal", value: [...operationRisks] },
        states: { kind: "literal", value: [...contractStates] },
        transports: { kind: "literal", value: [...contractTransports] },
        authorities: { kind: "literal", value: [...operationAuthorities] },
        readFailure: { kind: "literal", value: { ...readFailureDispositions } },
        invokeStatuses: { kind: "literal", value: [...invokeStatuses] }
      },
      description: "Closed vocabularies of this contract version; a consumer pins them verbatim."
    },
    adapters: {
      kind: "array",
      items: { kind: "union", variants: [adapterShape, invalidAdapterShape] },
      maxItems: MAX_CATALOG_ADAPTERS
    }
  }
};
var catalogDefinitions = contractInputDefinitions;
function isInvalidCatalogAdapter(adapter) {
  return "invalid" in adapter;
}
function parseContractCatalog(value) {
  const catalog = parseShape(catalogShape, value, "catalog", catalogDefinitions);
  const ids = catalog.adapters.map((adapter) => adapter.id);
  for (const [index, id] of ids.entries()) {
    const previous = ids[index - 1];
    if (previous !== undefined && previous.localeCompare(id) >= 0) {
      throw new ContractParseError("catalog.adapters", "must list unique adapter IDs in ascending order");
    }
  }
  if (!catalog.ok && catalog.adapters.length > 0) {
    throw new ContractParseError("catalog.ok", "must be true when adapters are listed");
  }
  for (const [adapterIndex, adapter] of catalog.adapters.entries()) {
    if (isInvalidCatalogAdapter(adapter))
      continue;
    const seen = new Set;
    for (const [operationIndex, operation] of adapter.operations.entries()) {
      const path = `catalog.adapters[${String(adapterIndex)}].operations[${String(operationIndex)}]`;
      if (seen.has(operation.id)) {
        throw new ContractParseError(path, "repeats an operation ID");
      }
      seen.add(operation.id);
      assertInputSchemaConsistent(operation.input, `${path}.input`);
    }
  }
  return catalog;
}
function assertInputSchemaConsistent(schema, path) {
  for (const name of schema.required) {
    if (!Object.hasOwn(schema.properties, name)) {
      throw new ContractParseError(`${path}.required`, `names an undeclared field ${name}`);
    }
  }
}

// src/contracts-plan.ts
var COLLECTION_PLAN_MAX_ACCOUNTS = 64;
var COLLECTION_PLAN_MAX_READS_PER_ACCOUNT = 8;
var COLLECTION_PLAN_MAX_READS = 128;
var COLLECTION_PLAN_MAX_DELAY_MS = 600000;
var COLLECTION_PLAN_MAX_METRIC_KEYS = 16;
var MAX_INPUT_KEYS = 32;
var MAX_INPUT_DEPTH = 8;
var MAX_INPUT_NODES = 1024;
var MAX_TARGET_URL_LENGTH = 2048;
var kebabKey = (maxLength, description2) => ({
  kind: "string",
  minLength: 1,
  maxLength,
  pattern: contractPatterns.kebabKey,
  description: description2
});
var metricKey = {
  kind: "string",
  minLength: 1,
  maxLength: 128,
  pattern: contractPatterns.metricKey
};
var readShape = {
  kind: "object",
  properties: {
    adapter: {
      kind: "string",
      minLength: 1,
      maxLength: 48,
      pattern: contractPatterns.adapterId,
      description: "Installed adapter ID, as `ghostget invoke <adapter>` accepts it."
    },
    operation: {
      kind: "string",
      minLength: 3,
      maxLength: 163,
      pattern: contractPatterns.operationId,
      description: "Semantic operation ID owned by the adapter."
    },
    authority: {
      kind: "union",
      variants: [
        {
          kind: "object",
          properties: { kind: { kind: "literal", value: "public" } },
          description: "The operation runs without an auth locator."
        },
        {
          kind: "object",
          properties: {
            kind: { kind: "literal", value: "auth" },
            authId: {
              kind: "string",
              minLength: 1,
              maxLength: 48,
              pattern: contractPatterns.authId,
              description: "Local Ghostget auth locator ID; never a credential."
            }
          }
        }
      ]
    },
    input: {
      kind: "record",
      values: {
        kind: "json",
        maxDepth: MAX_INPUT_DEPTH,
        maxNodes: MAX_INPUT_NODES,
        description: "One operation input value; bounded JSON."
      },
      keyPattern: contractPatterns.inputFieldName,
      maxProperties: MAX_INPUT_KEYS,
      description: "Exact operation input; `contracts check` validates it against the installed schema."
    },
    expectedOutput: {
      kind: "object",
      properties: {
        provider: kebabKey(64, "Provider the read must bind to."),
        targetUrl: {
          kind: "string",
          minLength: 9,
          maxLength: MAX_TARGET_URL_LENGTH,
          pattern: contractPatterns.httpsUrl,
          format: "uri",
          description: "Canonical credential-free HTTPS target the read must bind to."
        }
      }
    },
    metricKeys: {
      kind: "array",
      items: metricKey,
      minItems: 1,
      maxItems: COLLECTION_PLAN_MAX_METRIC_KEYS,
      uniqueItems: true
    },
    expectedCategoricalGaps: {
      kind: "array",
      items: {
        kind: "object",
        properties: {
          metricKey,
          reason: { kind: "literal", value: "not-authorized" },
          until: { kind: "literal", value: "account-eligible" }
        }
      },
      maxItems: COLLECTION_PLAN_MAX_METRIC_KEYS,
      description: "Metrics the consumer expects to stay categorically unavailable; each names one of `metricKeys`."
    },
    requiredDelayBeforeMs: {
      kind: "integer",
      minimum: 0,
      maximum: COLLECTION_PLAN_MAX_DELAY_MS,
      description: "Idle time the caller must wait before this read."
    },
    semantics: {
      kind: "object",
      properties: {
        state: { kind: "enum", values: contractStates },
        risk: { kind: "literal", value: "R1" },
        sideEffect: { kind: "literal", value: "none" }
      },
      description: "Installed semantics the read requires; v1 plans are read-only by construction."
    }
  }
};
var planShape = {
  kind: "object",
  properties: {
    schemaVersion: { kind: "literal", value: COLLECTION_PLAN_SCHEMA_VERSION },
    collectionKey: kebabKey(128, "Consumer-owned collection identifier."),
    execution: {
      kind: "object",
      properties: {
        order: { kind: "literal", value: "sequential" },
        observationMode: { kind: "literal", value: "live-only" }
      }
    },
    accounts: {
      kind: "array",
      items: {
        kind: "object",
        properties: {
          accountKey: kebabKey(128, "Unique consumer-owned account key."),
          reads: {
            kind: "array",
            items: readShape,
            minItems: 1,
            maxItems: COLLECTION_PLAN_MAX_READS_PER_ACCOUNT
          }
        }
      },
      minItems: 1,
      maxItems: COLLECTION_PLAN_MAX_ACCOUNTS
    }
  }
};
function assertCanonicalTarget(url, path) {
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new ContractParseError(path, "must be a canonical HTTPS URL");
  }
  if (target.protocol !== "https:" || target.username !== "" || target.password !== "" || target.search !== "" || target.hash !== "" || target.href !== url) {
    throw new ContractParseError(path, "must be a canonical credential-free HTTPS URL without query or fragment");
  }
}
function parseCollectionPlan(value) {
  const plan = parseShape(planShape, value, "plan");
  const accountKeys = new Set;
  let reads = 0;
  for (const [accountIndex, account] of plan.accounts.entries()) {
    const accountPath = `plan.accounts[${String(accountIndex)}]`;
    if (accountKeys.has(account.accountKey)) {
      throw new ContractParseError(`${accountPath}.accountKey`, "repeats an account key");
    }
    accountKeys.add(account.accountKey);
    reads += account.reads.length;
    for (const [readIndex, read] of account.reads.entries()) {
      const readPath = `${accountPath}.reads[${String(readIndex)}]`;
      assertCanonicalTarget(read.expectedOutput.targetUrl, `${readPath}.expectedOutput.targetUrl`);
      const gapKeys = new Set;
      for (const [gapIndex, gap] of read.expectedCategoricalGaps.entries()) {
        const gapPath = `${readPath}.expectedCategoricalGaps[${String(gapIndex)}].metricKey`;
        if (!read.metricKeys.includes(gap.metricKey)) {
          throw new ContractParseError(gapPath, "must name one of the read's metric keys");
        }
        if (gapKeys.has(gap.metricKey)) {
          throw new ContractParseError(gapPath, "repeats a metric key");
        }
        gapKeys.add(gap.metricKey);
      }
    }
  }
  if (reads > COLLECTION_PLAN_MAX_READS) {
    throw new ContractParseError("plan.accounts", `must hold at most ${String(COLLECTION_PLAN_MAX_READS)} reads in total`);
  }
  return plan;
}
function collectionPlanReads(plan) {
  const flattened = [];
  for (const account of plan.accounts) {
    for (const read of account.reads) {
      flattened.push(Object.freeze({ index: flattened.length, accountKey: account.accountKey, read }));
    }
  }
  return Object.freeze(flattened);
}

// src/contracts-check.ts
var MAX_DETAIL_LENGTH = 2000;
var readCommon = {
  index: { kind: "integer", minimum: 0, maximum: COLLECTION_PLAN_MAX_READS - 1 },
  accountKey: { kind: "string", minLength: 1, maxLength: 128, pattern: contractPatterns.kebabKey },
  adapter: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
  operation: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId }
};
var checkShape = {
  kind: "object",
  properties: {
    ok: { kind: "boolean", description: "True only when every read is `ok`." },
    contract: { kind: "literal", value: CONTRACT_CHECK_V1 },
    ghostget: {
      kind: "object",
      properties: {
        version: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion }
      }
    },
    plan: {
      kind: "object",
      properties: {
        collectionKey: { kind: "string", minLength: 1, maxLength: 128, pattern: contractPatterns.kebabKey },
        reads: { kind: "integer", minimum: 0, maximum: COLLECTION_PLAN_MAX_READS }
      }
    },
    reads: {
      kind: "array",
      items: {
        kind: "union",
        variants: [
          {
            kind: "object",
            properties: {
              ...readCommon,
              verdict: { kind: "literal", value: "ok" },
              binding: {
                kind: "object",
                properties: {
                  adapterVersion: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
                  contractVersion: { kind: "integer", minimum: 1, maximum: 1e6 },
                  contractHash: { kind: "string", minLength: 64, maxLength: 64, pattern: contractPatterns.sha256 },
                  transport: { kind: "enum", values: contractTransports },
                  authority: { kind: "enum", values: operationAuthorities }
                },
                description: "The exact installed contract the read binds to."
              }
            }
          },
          {
            kind: "object",
            properties: {
              ...readCommon,
              verdict: { kind: "literal", value: "gap" },
              gap: {
                kind: "object",
                properties: {
                  reason: { kind: "enum", values: contractGapReasons },
                  detail: { kind: "string", minLength: 1, maxLength: MAX_DETAIL_LENGTH }
                },
                description: "One closed gap reason with a bounded, subject-free detail."
              }
            }
          }
        ]
      },
      maxItems: COLLECTION_PLAN_MAX_READS,
      description: "One verdict per plan read, in execution order."
    }
  }
};
function parseContractCheck(value) {
  const check = parseShape(checkShape, value, "check");
  if (check.reads.length !== check.plan.reads) {
    throw new ContractParseError("check.reads", "must hold exactly plan.reads entries");
  }
  for (const [index, read] of check.reads.entries()) {
    if (read.index !== index) {
      throw new ContractParseError(`check.reads[${String(index)}].index`, "must follow execution order");
    }
  }
  const everyOk = check.reads.every((read) => read.verdict === "ok");
  if (check.ok !== everyOk) {
    throw new ContractParseError("check.ok", "must be true exactly when every read is ok");
  }
  return check;
}
function boundedDetail(detail) {
  return detail.length > MAX_DETAIL_LENGTH ? `${detail.slice(0, MAX_DETAIL_LENGTH - 1)}\u2026` : detail;
}
function gap(reason, detail) {
  return Object.freeze({ reason, detail: boundedDetail(detail) });
}
function readGap(read, adapter, invalidIssues, storedAuthIds) {
  if (invalidIssues !== undefined) {
    return gap("adapter-invalid", `installed manifest is invalid: ${invalidIssues.slice(0, 3).join("; ")}`);
  }
  if (adapter === undefined)
    return gap("adapter-missing", "adapter is not installed");
  const operation = adapter.operations.find((candidate) => candidate.id === read.operation);
  if (operation === undefined) {
    return gap("operation-missing", "adapter does not own the operation");
  }
  if (operation.transport === "reviewed-template-api") {
    return gap("transport-disabled", "installed transport reviewed-template-api is not invocable");
  }
  if (operation.state !== read.semantics.state) {
    return gap("state-mismatch", `installed state is ${operation.state}; plan requires ${read.semantics.state}`);
  }
  if (operation.risk !== read.semantics.risk) {
    return gap("risk-mismatch", `installed risk is ${operation.risk}; plan requires ${read.semantics.risk}`);
  }
  if (operation.sideEffect !== read.semantics.sideEffect) {
    return gap("side-effect-mismatch", `installed operation declares a side effect; plan requires ${read.semantics.sideEffect}`);
  }
  if (operation.authority !== read.authority.kind) {
    return gap("authority-mismatch", `installed authority is ${operation.authority}; plan requires ${read.authority.kind}`);
  }
  const input = validateOperationInput(operation.input, read.input, adapter.origins);
  if (!input.ok)
    return gap("input-invalid", input.issues.join("; "));
  if (storedAuthIds !== undefined && read.authority.kind === "auth" && !storedAuthIds.includes(read.authority.authId)) {
    return gap("auth-missing", "plan names an auth locator that is not stored");
  }
  return operation;
}
function checkCollectionPlan(plan, catalog, options = {}) {
  const adapters = new Map;
  const invalid = new Map;
  for (const adapter of catalog.adapters) {
    if (isInvalidCatalogAdapter(adapter))
      invalid.set(adapter.id, adapter.issues);
    else
      adapters.set(adapter.id, adapter);
  }
  const storedAuthIds = options.storedAuthIds === undefined ? undefined : Object.freeze([...options.storedAuthIds]);
  const reads = collectionPlanReads(plan).map(({ index, accountKey, read }) => {
    const common = {
      index,
      accountKey,
      adapter: read.adapter,
      operation: read.operation
    };
    const outcome = readGap(read, adapters.get(read.adapter), invalid.get(read.adapter), storedAuthIds);
    if ("reason" in outcome)
      return Object.freeze({ ...common, verdict: "gap", gap: outcome });
    const adapter = adapters.get(read.adapter);
    if (adapter === undefined)
      throw new Error("checked adapter disappeared");
    return Object.freeze({
      ...common,
      verdict: "ok",
      binding: Object.freeze({
        adapterVersion: adapter.version,
        contractVersion: outcome.contractVersion,
        contractHash: outcome.contractHash,
        transport: outcome.transport,
        authority: outcome.authority
      })
    });
  });
  return parseContractCheck({
    ok: reads.every((read) => read.verdict === "ok"),
    contract: CONTRACT_CHECK_V1,
    ghostget: { version: catalog.ghostget.version },
    plan: { collectionKey: plan.collectionKey, reads: reads.length },
    reads
  });
}

// src/contracts-invoke-read.ts
var MAX_OUTPUT_DEPTH = 64;
var MAX_OUTPUT_NODES = 4000000;
var MAX_TEXT_LENGTH = 4096;
var MAX_ERROR_LENGTH = 8192;
var MAX_KEY_LENGTH = 512;
var sha2562 = { kind: "string", minLength: 64, maxLength: 64, pattern: contractPatterns.sha256 };
var text = (maxLength, description2) => ({
  kind: "string",
  minLength: 1,
  maxLength,
  ...description2 === undefined ? {} : { description: description2 }
});
var dateTime = { kind: "string", minLength: 24, maxLength: 24, format: "date-time" };
var nullable = (shape) => ({ kind: "union", variants: [shape, { kind: "null" }] });
var receiptCommon = {
  runId: { kind: "string", minLength: 36, maxLength: 36, pattern: contractPatterns.runId },
  planDigest: { kind: "null", description: "R1 reads never carry a confirmation plan." },
  adapter: {
    kind: "object",
    properties: {
      id: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
      version: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
      hash: sha2562
    }
  },
  operation: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
  risk: { kind: "literal", value: "R1" },
  inputHash: sha2562,
  auth: {
    kind: "object",
    properties: {
      id: text(128, "Auth locator ID, or the kernel-owned public authority ID; never a credential."),
      hash: sha2562,
      kind: {
        kind: "enum",
        values: [
          "browser-profile",
          "cookie-source",
          "cookies-file",
          "linked-device-store",
          "oauth-token-file",
          "public-web-session"
        ]
      }
    }
  },
  status: { kind: "enum", values: ["succeeded", "failed"] },
  dispatchStarted: { kind: "literal", value: false },
  dispatch: {
    kind: "object",
    properties: {
      planned: { kind: "literal", value: 0 },
      started: { kind: "literal", value: 0 },
      verified: { kind: "literal", value: 0 }
    },
    description: "R1 reads prove zero dispatch."
  },
  startedAt: dateTime,
  finishedAt: dateTime,
  finalOrigin: nullable(text(MAX_TEXT_LENGTH)),
  error: nullable(text(MAX_ERROR_LENGTH, "Bounded redacted diagnostic; never a retry policy."))
};
function receiptVariant(schemaVersion, transport, extra) {
  return {
    kind: "object",
    properties: {
      schemaVersion: { kind: "literal", value: schemaVersion },
      ...receiptCommon,
      transport: { kind: "literal", value: transport },
      ...extra
    }
  };
}
var portableContract = {
  kind: "object",
  properties: {
    pluginId: text(63),
    pluginVersion: text(64),
    hostApiVersion: { kind: "literal", value: 1 },
    bundleSha256: sha2562,
    manifestSha256: sha2562,
    adapterId: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
    transport: { kind: "enum", values: ["linked-device", "provider-api", "web-session-api"] },
    surfaceId: text(63),
    operation: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
    contractVersion: { kind: "integer", minimum: 1, maximum: 1e6 },
    descriptorSha256: sha2562
  }
};
var localCliContract = {
  kind: "object",
  properties: {
    surface: text(63),
    action: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
    version: { kind: "integer", minimum: 1, maximum: 1e6 },
    hash: sha2562,
    tool: {
      kind: "object",
      properties: {
        schemaVersion: { kind: "literal", value: 1 },
        id: text(128),
        implementation: text(MAX_TEXT_LENGTH),
        versionScheme: { kind: "enum", values: ["semver", "opaque"] },
        version: text(128),
        releaseCommit: text(128),
        releaseManifestSha256: sha2562,
        releaseManifestUrl: text(MAX_TEXT_LENGTH),
        sourceUrl: text(MAX_TEXT_LENGTH),
        artifacts: {
          kind: "array",
          items: {
            kind: "object",
            properties: {
              platform: text(64),
              arch: text(64),
              executableSha256: sha2562,
              archiveSha256: sha2562,
              downloadUrl: text(MAX_TEXT_LENGTH)
            },
            optional: ["archiveSha256", "downloadUrl"]
          },
          maxItems: 32
        }
      },
      optional: ["releaseCommit", "releaseManifestSha256", "releaseManifestUrl", "sourceUrl"]
    }
  }
};
var receipt = {
  kind: "union",
  variants: [
    receiptVariant(2, "browser", {}),
    receiptVariant(3, "provider-api", { providerContractHash: sha2562 }),
    receiptVariant(4, "web-session-api", { webSessionContractHash: sha2562 }),
    receiptVariant(5, "reviewed-template-api", { reviewedTemplateContractHash: sha2562 }),
    receiptVariant(6, "portable-provider-plugin", { portablePluginContract: portableContract }),
    receiptVariant(7, "local-cli", { localCliContract })
  ],
  description: "Durable R1 run receipt; `schemaVersion` and `transport` select the contract-hash field."
};
var cacheOutcome = {
  kind: "union",
  variants: [
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "stored" },
        publication: {
          kind: "object",
          properties: {
            key: text(MAX_KEY_LENGTH),
            dataRevision: text(MAX_KEY_LENGTH),
            validatedAt: dateTime,
            dataChangedAt: dateTime,
            disposition: { kind: "enum", values: ["created", "changed", "unchanged", "superseded"] },
            currentDataRevision: text(MAX_KEY_LENGTH)
          },
          optional: ["currentDataRevision"]
        }
      }
    },
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "retained" },
        reason: { kind: "literal", value: "live-read-failed" }
      }
    },
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "miss" },
        reason: { kind: "literal", value: "no-cached-snapshot" }
      }
    },
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "skipped" },
        reason: { kind: "literal", value: "auth-subject-unbound" }
      }
    },
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "error" },
        message: text(MAX_TEXT_LENGTH)
      }
    }
  ],
  description: "What happened to the exact R1 projection cache after the live read."
};
var readFailure = {
  kind: "union",
  variants: Object.entries(readFailureDispositions).map(([category, retryDisposition]) => ({
    kind: "object",
    properties: {
      category: { kind: "literal", value: category },
      retryDisposition: { kind: "literal", value: retryDisposition }
    }
  })),
  description: "Closed failure category with its only valid retry disposition."
};
var invokeReadDefinitions = Object.freeze({
  receipt,
  cacheOutcome,
  readFailure
});
var resultCommon = {
  runId: { kind: "string", minLength: 36, maxLength: 36, pattern: contractPatterns.runId },
  replayed: { kind: "boolean" },
  source: { kind: "literal", value: "live" },
  cache: { kind: "ref", name: "cacheOutcome" }
};
var invokeReadShape = {
  kind: "union",
  variants: [
    {
      kind: "object",
      properties: {
        ok: { kind: "literal", value: true },
        status: { kind: "literal", value: "succeeded" },
        ...resultCommon,
        receipt: { kind: "ref", name: "receipt" },
        output: {
          kind: "json",
          maxDepth: MAX_OUTPUT_DEPTH,
          maxNodes: MAX_OUTPUT_NODES,
          description: "Provider-shaped output; typed by the operation, bounded here to depth 64 and 4,000,000 nodes."
        }
      }
    },
    {
      kind: "object",
      properties: {
        ok: { kind: "literal", value: false },
        status: { kind: "literal", value: "failed" },
        ...resultCommon,
        receipt: { kind: "ref", name: "receipt" },
        output: { kind: "null" },
        readFailure: { kind: "ref", name: "readFailure" }
      }
    }
  ],
  description: "R1 result envelope printed by `ghostget invoke <adapter> <operation> --json`."
};
function parseInvokeReadResult(value) {
  const result = parseShape(invokeReadShape, value, "result", invokeReadDefinitions);
  if (result.receipt.status !== result.status) {
    throw new ContractParseError("result.receipt.status", "must equal the top-level status");
  }
  if (result.receipt.runId !== result.runId) {
    throw new ContractParseError("result.receipt.runId", "must equal the top-level runId");
  }
  const cacheMatches = result.status === "succeeded" ? result.cache.status === "stored" || result.cache.status === "error" || result.cache.status === "skipped" : result.cache.status === "retained" || result.cache.status === "miss" || result.cache.status === "error" || result.cache.status === "skipped";
  if (!cacheMatches) {
    throw new ContractParseError("result.cache", "is inconsistent with the receipt status");
  }
  return result;
}

// src/contracts-repair.ts
var statuses = ["capture-required", "investigate", "update-candidate", "blocked", "unavailable"];
var steps = [
  "reproduce-with-synthetic-fixture",
  "review-authorized-evidence",
  "propose-provider-patch",
  "run-provider-gates",
  "verify-current-contract",
  "propose-consumer-update",
  "run-consumer-gates",
  "review-authority-boundary",
  "inspect-installed-catalog"
];
var hash = { kind: "string", minLength: 64, maxLength: 64, pattern: contractPatterns.sha256 };
var contractRepairBindingShape = {
  kind: "object",
  properties: {
    adapterId: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
    adapterVersion: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
    manifestHash: hash,
    operationId: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
    transport: { kind: "enum", values: contractTransports },
    authority: { kind: "enum", values: operationAuthorities },
    risk: { kind: "enum", values: operationRisks },
    readOnly: { kind: "boolean" },
    state: { kind: "enum", values: contractStates },
    contractVersion: { kind: "integer", minimum: 1, maximum: 1e6 },
    contractHash: hash
  }
};
var contractRepairSignalShape = {
  kind: "object",
  properties: {
    contract: { kind: "literal", value: "ghostget.contract-repair-signal.v1" },
    id: hash,
    reason: { kind: "enum", values: ["capture-required", "contract-drift"] },
    binding: contractRepairBindingShape
  }
};
var contractRepairShape = {
  kind: "object",
  properties: {
    contract: { kind: "literal", value: "ghostget.contract-repair.v1" },
    signal: contractRepairSignalShape,
    current: { kind: "union", variants: [contractRepairBindingShape, { kind: "null" }] },
    status: { kind: "enum", values: statuses },
    steps: { kind: "array", items: { kind: "enum", values: steps }, maxItems: steps.length },
    consumerAction: { kind: "enum", values: ["none", "suggest-update-pr"] },
    authority: {
      kind: "object",
      properties: {
        recapture: { kind: "literal", value: false },
        retry: { kind: "literal", value: false },
        activate: { kind: "literal", value: false },
        publish: { kind: "literal", value: false }
      }
    }
  }
};
function checkBinding(binding) {
  if (binding.readOnly && binding.risk !== "R1") {
    throw new ContractParseError("repair.binding.readOnly", "requires R1");
  }
}
function contractRepairBinding(adapter, operation) {
  const binding = parseShape(contractRepairBindingShape, {
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    manifestHash: adapter.manifestHash,
    operationId: operation.id,
    transport: operation.transport,
    authority: operation.authority,
    risk: operation.risk,
    readOnly: operation.risk === "R1" && operation.sideEffect === "none",
    state: operation.state,
    contractVersion: operation.contractVersion,
    contractHash: operation.contractHash
  }, "repair.binding");
  checkBinding(binding);
  return binding;
}
function createContractRepairSignal(reason, bindingValue) {
  const binding = parseShape(contractRepairBindingShape, bindingValue, "repair.binding");
  const identity = { contract: "ghostget.contract-repair-signal.v1", reason, binding };
  return parseContractRepairSignal({ ...identity, id: sha256(canonicalJson(identity)) });
}
function parseContractRepairSignal(value) {
  const signal = parseShape(contractRepairSignalShape, value, "repair.signal");
  checkBinding(signal.binding);
  const { id, ...identity } = signal;
  if (id !== sha256(canonicalJson(identity))) {
    throw new ContractParseError("repair.signal.id", "does not bind the exact signal");
  }
  if (signal.reason === "capture-required" !== (signal.binding.state === "capture-required")) {
    throw new ContractParseError("repair.signal.reason", "does not match the contract state");
  }
  return signal;
}
function assessment(signal, current) {
  if (current === null)
    return "unavailable";
  const previous = signal.binding;
  if (current.adapterId !== previous.adapterId || current.operationId !== previous.operationId) {
    throw new ContractParseError("repair.current", "does not match the signal route");
  }
  checkBinding(current);
  if (!previous.readOnly || !current.readOnly || current.risk !== previous.risk || current.transport !== previous.transport || current.authority !== previous.authority || current.transport === "reviewed-template-api" || current.contractVersion < previous.contractVersion)
    return "blocked";
  if (current.state === "capture-required")
    return "capture-required";
  if (current.contractHash !== previous.contractHash || current.contractVersion !== previous.contractVersion) {
    return "update-candidate";
  }
  return signal.reason === "capture-required" ? "blocked" : "investigate";
}
function nextSteps(status) {
  if (status === "blocked")
    return ["review-authority-boundary"];
  if (status === "unavailable")
    return ["inspect-installed-catalog"];
  if (status === "update-candidate")
    return ["verify-current-contract", "propose-consumer-update", "run-consumer-gates"];
  return ["reproduce-with-synthetic-fixture", "review-authorized-evidence", "propose-provider-patch", "run-provider-gates"];
}
function parseContractRepairHandoff(value) {
  const handoff = parseShape(contractRepairShape, value, "repair");
  const signal = parseContractRepairSignal(handoff.signal);
  const status = assessment(signal, handoff.current);
  if (handoff.status !== status || canonicalJson(handoff.steps) !== canonicalJson(nextSteps(status)) || handoff.consumerAction !== (status === "update-candidate" ? "suggest-update-pr" : "none")) {
    throw new ContractParseError("repair", "assessment or next steps are inconsistent");
  }
  return handoff;
}
function createContractRepairHandoff(signalValue, catalogValue) {
  const signal = parseContractRepairSignal(signalValue);
  const catalog = parseContractCatalog(catalogValue);
  const adapter = catalog.adapters.find((entry) => entry.id === signal.binding.adapterId);
  const operation = adapter === undefined || isInvalidCatalogAdapter(adapter) ? undefined : adapter.operations.find((entry) => entry.id === signal.binding.operationId);
  const current = adapter === undefined || isInvalidCatalogAdapter(adapter) || operation === undefined ? null : contractRepairBinding(adapter, operation);
  const status = assessment(signal, current);
  return parseContractRepairHandoff({
    contract: "ghostget.contract-repair.v1",
    signal,
    current,
    status,
    steps: nextSteps(status),
    consumerAction: status === "update-candidate" ? "suggest-update-pr" : "none",
    authority: { recapture: false, retry: false, activate: false, publish: false }
  });
}
function contractRepairSignalsForPlan(planValue, catalogValue) {
  const plan = parseCollectionPlan(planValue);
  const catalog = parseContractCatalog(catalogValue);
  const signals = new Map;
  for (const { read } of collectionPlanReads(plan)) {
    const adapter = catalog.adapters.find((entry) => entry.id === read.adapter);
    if (adapter === undefined || isInvalidCatalogAdapter(adapter))
      continue;
    const operation = adapter.operations.find((entry) => entry.id === read.operation);
    if (operation === undefined || operation.state !== "capture-required" || operation.risk !== "R1" || operation.sideEffect !== "none" || operation.authority !== read.authority.kind || !validateOperationInput(operation.input, read.input, adapter.origins).ok)
      continue;
    const signal = createContractRepairSignal("capture-required", contractRepairBinding(adapter, operation));
    signals.set(signal.id, signal);
  }
  return Object.freeze([...signals.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

// src/contracts-schema.ts
var schemas = Object.freeze({
  catalog: () => shapeJsonSchema(catalogShape, {
    title: CONTRACT_CATALOG_V1,
    description: "Compact projection of the installed Ghostget capability catalog, printed by `ghostget contracts catalog --json`.",
    definitions: catalogDefinitions
  }),
  check: () => shapeJsonSchema(checkShape, {
    title: CONTRACT_CHECK_V1,
    description: "Verdict of one collection plan against one contract catalog, printed by `ghostget contracts check --plan <file> --json`."
  }),
  plan: () => shapeJsonSchema(planShape, {
    title: "ghostget.collection-plan.v1",
    description: "Read-only collection plan accepted by `ghostget contracts check --plan <file>`."
  }),
  "invoke-read": () => shapeJsonSchema(invokeReadShape, {
    title: "ghostget.invoke-read.v1",
    description: "R1 result envelope printed by `ghostget invoke <adapter> <operation> --json`.",
    definitions: invokeReadDefinitions
  }),
  repair: () => shapeJsonSchema(contractRepairShape, {
    title: "ghostget.contract-repair.v1",
    description: "An advisory, revision-bound repair handoff. It grants no capture, retry, activation, or publication authority."
  })
});
function contractSchema(name) {
  const build = schemas[name];
  if (build === undefined)
    throw new Error("unknown contract schema");
  return build();
}

// src/contracts.ts
var checkCollectionPlan2 = checkCollectionPlan;
var ContractParseError2 = ContractParseError;
var contractSchema2 = contractSchema;
var parseCollectionPlan2 = parseCollectionPlan;
var parseContractCatalog2 = parseContractCatalog;
var parseContractCheck2 = parseContractCheck;
var parseInvokeReadResult2 = parseInvokeReadResult;
var readFailureDispositions2 = readFailureDispositions;
var contractRepairSignalsForPlan2 = contractRepairSignalsForPlan;
var createContractRepairHandoff2 = createContractRepairHandoff;
var parseContractRepairHandoff2 = parseContractRepairHandoff;
var parseContractRepairSignal2 = parseContractRepairSignal;
export {
  readFailureDispositions2 as readFailureDispositions,
  parseInvokeReadResult2 as parseInvokeReadResult,
  parseContractRepairSignal2 as parseContractRepairSignal,
  parseContractRepairHandoff2 as parseContractRepairHandoff,
  parseContractCheck2 as parseContractCheck,
  parseContractCatalog2 as parseContractCatalog,
  parseCollectionPlan2 as parseCollectionPlan,
  createContractRepairHandoff2 as createContractRepairHandoff,
  contractSchema2 as contractSchema,
  contractRepairSignalsForPlan2 as contractRepairSignalsForPlan,
  checkCollectionPlan2 as checkCollectionPlan,
  ContractParseError2 as ContractParseError
};
