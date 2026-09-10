import { createHash } from "node:crypto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Canonical JSON for plan binding, content addressing, and provider-owned
 * semantic identities. This leaf has no catalog or runtime dependencies.
 */
export function canonicalJson(value: unknown): string {
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
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) =>
      `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("canonical JSON supports only JSON-compatible values");
}

/**
 * Canonical JSON that is safe to embed as a JavaScript expression inside a
 * generated page script. JSON permits raw U+2028, U+2029, and angle brackets
 * inside strings; escaping them keeps the literal from terminating a script
 * element or a JavaScript line. The escaped text parses to the same value.
 */
export function canonicalJsonScriptLiteral(value: unknown): string {
  return escapeScriptLiteral(canonicalJson(value));
}

/**
 * Plain JSON with the same script-embedding escapes, for generated page
 * scripts whose bindings keep their insertion order rather than the
 * canonical ordering.
 */
export function jsonScriptLiteral(value: unknown): string {
  return escapeScriptLiteral(JSON.stringify(value));
}

function escapeScriptLiteral(json: string): string {
  return json.replace(/[<>\u2028\u2029]/gu, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
