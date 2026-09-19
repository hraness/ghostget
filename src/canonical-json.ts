import { createHash } from "node:crypto";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type KeyCompare = (left: string, right: string) => number;

/**
 * UTF-16 code-unit ordering, the RFC 8785 JCS member ordering. Unlike
 * locale-aware collation this order is total, deterministic, and identical in
 * every runtime: collation can report distinct keys (for example the NFC and
 * NFD spellings of "ä") as equal, which silently made the previous ordering
 * depend on property insertion order.
 */
const compareUtf16CodeUnits: KeyCompare = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * The historical locale-collation ordering. It is retained only so that data
 * serialized before the RFC 8785 migration remains verifiable; new writes
 * never use it.
 */
const compareLegacyLocale: KeyCompare = (left, right) =>
  left.localeCompare(right);

function canonicalJsonWithOrder(value: unknown, compare: KeyCompare): string {
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
    return `[${value.map((item) => canonicalJsonWithOrder(item, compare)).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compare(left, right));
    return `{${entries.map(([key, item]) =>
      `${JSON.stringify(key)}:${canonicalJsonWithOrder(item, compare)}`).join(",")}}`;
  }
  throw new Error("canonical JSON supports only JSON-compatible values");
}

/**
 * Canonical JSON for plan binding, content addressing, and provider-owned
 * semantic identities, with RFC 8785-compatible UTF-16 code-unit member
 * ordering. This leaf has no catalog or runtime dependencies.
 */
export function canonicalJson(value: unknown): string {
  return canonicalJsonWithOrder(value, compareUtf16CodeUnits);
}

/**
 * The pre-migration canonical JSON encoding whose members are ordered by
 * locale collation. Retained exclusively for verifying data persisted before
 * the RFC 8785 ordering migration; it must never feed new writes.
 */
export function legacyCanonicalJson(value: unknown): string {
  return canonicalJsonWithOrder(value, compareLegacyLocale);
}

/**
 * Every canonical serialization a value may legitimately have on disk: the
 * current encoding first, then the legacy encoding when it differs. Most
 * values have a single serialization because the two orderings agree on
 * ordinary member names.
 */
export function canonicalJsonSerializations(value: unknown): readonly string[] {
  const current = canonicalJson(value);
  const legacy = legacyCanonicalJson(value);
  return legacy === current ? [current] : [current, legacy];
}

/**
 * The newline-terminated serializations used by private JSON state files.
 */
export function canonicalJsonFileSerializations(
  value: unknown,
): readonly string[] {
  return canonicalJsonSerializations(value).map(
    (serialization) => `${serialization}\n`,
  );
}

/**
 * Whether `content` is an accepted canonical serialization of `value`,
 * tolerating either the current or the legacy member ordering.
 */
export function isCanonicalJsonText(text: string, value: unknown): boolean {
  return canonicalJsonSerializations(value).includes(text);
}

/**
 * Whether `content` is an accepted newline-terminated canonical state-file
 * serialization of `value`, tolerating either member ordering.
 */
export function isCanonicalJsonFileText(
  content: string,
  value: unknown,
): boolean {
  return canonicalJsonFileSerializations(value).includes(content);
}

/**
 * The SHA-256 digest of each accepted canonical serialization, current first.
 */
export function canonicalJsonSha256Variants(
  value: unknown,
): readonly string[] {
  return canonicalJsonSerializations(value).map(
    (serialization) => sha256(serialization),
  );
}

/**
 * The SHA-256 digest of each accepted newline-terminated canonical
 * serialization, current first.
 */
export function canonicalJsonFileSha256Variants(
  value: unknown,
): readonly string[] {
  return canonicalJsonFileSerializations(value).map(
    (serialization) => sha256(serialization),
  );
}

/**
 * Whether `digest` authenticates `value` under any accepted canonical
 * serialization.
 */
export function canonicalJsonSha256Matches(
  digest: string,
  value: unknown,
): boolean {
  return canonicalJsonSha256Variants(value).includes(digest);
}

/**
 * Whether `digest` authenticates a canonical state-file serialization of
 * `value` under any accepted member ordering.
 */
export function canonicalJsonFileSha256Matches(
  digest: string,
  value: unknown,
): boolean {
  return canonicalJsonFileSha256Variants(value).includes(digest);
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
