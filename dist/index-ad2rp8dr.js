// @bun
// src/canonical-json.ts
import { createHash } from "crypto";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var compareUtf16CodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
var compareLegacyLocale = (left, right) => left.localeCompare(right);
function canonicalJsonWithOrder(value, compare) {
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
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => compare(left, right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJsonWithOrder(item, compare)}`).join(",")}}`;
  }
  throw new Error("canonical JSON supports only JSON-compatible values");
}
function canonicalJson(value) {
  return canonicalJsonWithOrder(value, compareUtf16CodeUnits);
}
function legacyCanonicalJson(value) {
  return canonicalJsonWithOrder(value, compareLegacyLocale);
}
function canonicalJsonSerializations(value) {
  const current = canonicalJson(value);
  const legacy = legacyCanonicalJson(value);
  return legacy === current ? [current] : [current, legacy];
}
function isCanonicalJsonText(text, value) {
  return canonicalJsonSerializations(value).includes(text);
}
function canonicalJsonSha256Variants(value) {
  return canonicalJsonSerializations(value).map((serialization) => sha256(serialization));
}
function canonicalJsonSha256Matches(digest, value) {
  return canonicalJsonSha256Variants(value).includes(digest);
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export { canonicalJson, isCanonicalJsonText, canonicalJsonSha256Variants, canonicalJsonSha256Matches, sha256 };
