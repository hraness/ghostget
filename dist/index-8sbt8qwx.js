// @bun
// src/canonical-json.ts
import { createHash } from "crypto";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonical JSON cannot represent a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("canonical JSON supports only JSON-compatible values");
}
function canonicalJsonScriptLiteral(value) {
  return escapeScriptLiteral(canonicalJson(value));
}
function jsonScriptLiteral(value) {
  return escapeScriptLiteral(JSON.stringify(value));
}
function escapeScriptLiteral(json) {
  return json.replace(/[<>\u2028\u2029]/gu, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export { canonicalJson, canonicalJsonScriptLiteral, jsonScriptLiteral, sha256 };
