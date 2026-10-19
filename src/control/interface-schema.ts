import { canonicalJson, type InputField, type InputSchema } from "../model";
import { interfaceKeys, interfaceRecord, interfaceText } from "./interface-json";

type Schema = Record<string, unknown>;

function fieldSchema(field: InputField): Schema {
  if (field.type === "file") return {
    type: "object", description: field.description, additionalProperties: false,
    properties: { kind: { type: "string", const: "file" }, reference: { type: "string", minLength: 1 } },
    required: ["kind", "reference"],
    "x-ghostget-file": { maxBytes: field.maxBytes, ...(field.mediaTypes === undefined ? {} : { mediaTypes: field.mediaTypes }) },
  };
  if (field.type === "array") return {
    type: "array", description: field.description, items: fieldSchema(field.items), minItems: field.minItems, maxItems: field.maxItems,
  };
  const { format, urlPathPrefixes, ...scalar } = field;
  return {
    ...scalar,
    ...(format === undefined ? {} : { format: format === "url" ? "uri" : "path-segment" }),
    ...(urlPathPrefixes === undefined ? {} : { "x-ghostget-url-path-prefixes": urlPathPrefixes }),
  };
}

export function interfaceInputSchema(input: InputSchema): Schema {
  return {
    type: "object", additionalProperties: false,
    properties: Object.fromEntries(Object.entries(input.properties).sort(([a], [b]) => a.localeCompare(b)).map(([key, field]) => [key, fieldSchema(field)])),
    required: [...input.required],
  };
}

function number(value: unknown, label: string, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && (!Number.isSafeInteger(value) || value < 0))) throw new Error(`${label} must be a bounded number`);
  return value;
}

function fieldFromSchema(value: unknown, nested = false): InputField {
  const field = interfaceRecord(value, "input field schema");
  const description = interfaceText(field.description, "input field description", 4_096);
  if (field.type === "object") {
    interfaceKeys(field, ["type", "description", "additionalProperties", "properties", "required", "x-ghostget-file"], [], "file reference schema");
    const binding = interfaceRecord(field["x-ghostget-file"], "file reference binding");
    interfaceKeys(binding, ["maxBytes"], ["mediaTypes"], "file reference binding");
    const maxBytes = number(binding.maxBytes, "file byte limit", true);
    let mediaTypes: string[] | undefined;
    if (binding.mediaTypes !== undefined) {
      if (!Array.isArray(binding.mediaTypes) || binding.mediaTypes.length > 32) throw new Error("file media types exceed their bound");
      mediaTypes = binding.mediaTypes.map((entry) => interfaceText(entry, "file media type", 128));
    }
    const result: InputField = { type: "file", description, maxBytes, ...(mediaTypes === undefined ? {} : { mediaTypes }) };
    if (canonicalJson(fieldSchema(result)) !== canonicalJson(field)) throw new Error("file reference schema changed its opaque input contract");
    return result;
  }
  if (field.type === "array") {
    if (nested) throw new Error("nested input arrays are unsupported");
    interfaceKeys(field, ["type", "description", "items", "minItems", "maxItems"], [], "array input schema");
    const items = fieldFromSchema(field.items, true);
    if (items.type === "array") throw new Error("nested input arrays are unsupported");
    const minItems = number(field.minItems, "minimum items", true);
    const maxItems = number(field.maxItems, "maximum items", true);
    if (minItems > maxItems || maxItems > 10_000) throw new Error("array bounds are invalid");
    return { type: "array", description, items, minItems, maxItems };
  }
  interfaceKeys(field, ["type", "description"], ["minLength", "maxLength", "minimum", "maximum", "enum", "format", "x-ghostget-url-path-prefixes"], "scalar input schema");
  if (field.type !== "string" && field.type !== "number" && field.type !== "boolean") throw new Error("input field type is unsupported");
  const result: Record<string, unknown> = { type: field.type, description };
  for (const key of ["minLength", "maxLength", "minimum", "maximum"] as const) {
    if (field[key] !== undefined) result[key] = number(field[key], key, key.endsWith("Length"));
  }
  if (field.enum !== undefined) {
    if (!Array.isArray(field.enum) || field.enum.length < 1 || field.enum.length > 256 || field.enum.some((entry) => typeof entry !== field.type)) throw new Error("input enum is invalid");
    result.enum = field.enum;
  }
  if (field.format !== undefined) {
    if (field.type !== "string" || (field.format !== "uri" && field.format !== "path-segment")) throw new Error("input format is unsupported");
    result.format = field.format === "uri" ? "url" : "path-segment";
  }
  if (field["x-ghostget-url-path-prefixes"] !== undefined) {
    const prefixes = field["x-ghostget-url-path-prefixes"];
    if (field.format !== "uri" || !Array.isArray(prefixes) || prefixes.length > 64) throw new Error("URL path prefixes are invalid");
    result.urlPathPrefixes = prefixes.map((entry) => interfaceText(entry, "URL path prefix", 2_048));
  }
  return result as InputField;
}

export function inputFromInterfaceSchema(value: unknown): InputSchema {
  const schema = interfaceRecord(value, "operation input schema");
  interfaceKeys(schema, ["type", "properties", "required", "additionalProperties"], [], "operation input schema");
  if (schema.type !== "object" || schema.additionalProperties !== false) throw new Error("operation input requires a closed object schema");
  const properties = interfaceRecord(schema.properties, "input properties");
  if (Object.keys(properties).length > 128) throw new Error("input properties exceed their bound");
  if (!Array.isArray(schema.required) || schema.required.length > 128) throw new Error("required inputs exceed their bound");
  const required = schema.required.map((entry) => interfaceText(entry, "required input", 128));
  if (new Set(required).size !== required.length || required.some((key) => !Object.hasOwn(properties, key))) throw new Error("required inputs are duplicate or missing");
  return {
    properties: Object.fromEntries(Object.entries(properties).map(([key, field]) => {
      if (!/^[a-z][a-z0-9_]{0,127}$/u.test(key)) throw new Error("input field name is invalid");
      return [key, fieldFromSchema(field)];
    })),
    required,
  };
}

/** Generic inert schemas are validated, never resolved or compiled into code. */
export function validateInertInterfaceSchema(value: unknown): void {
  const schema = interfaceRecord(value, "OpenAPI schema");
  interfaceKeys(schema, [], ["type", "description", "properties", "required", "additionalProperties", "items", "enum", "const", "format", "minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "x-ghostget-file", "x-ghostget-url-path-prefixes"], "OpenAPI schema");
  if (schema.type !== undefined && !["object", "array", "string", "number", "integer", "boolean", "null"].includes(String(schema.type))) throw new Error("OpenAPI schema type is unsupported");
  if (schema.description !== undefined) interfaceText(schema.description, "schema description", 4_096);
  if (schema.properties !== undefined) {
    const properties = interfaceRecord(schema.properties, "schema properties");
    if (Object.keys(properties).length > 128) throw new Error("schema properties exceed their bound");
    Object.values(properties).forEach(validateInertInterfaceSchema);
  }
  if (schema.items !== undefined) validateInertInterfaceSchema(schema.items);
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") throw new Error("schema additionalProperties must be boolean");
  for (const key of ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems"] as const) if (schema[key] !== undefined) number(schema[key], key, !["minimum", "maximum"].includes(key));
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.length > 128 || schema.required.some((entry) => typeof entry !== "string"))) throw new Error("schema required is invalid");
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length > 256)) throw new Error("schema enum is invalid");
}
