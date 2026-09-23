// @bun
// src/canonical-json.ts
import { createHash } from "crypto";
var compareUtf16CodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
var compareLegacyLocale = (left, right) => left.localeCompare(right);
function ownEnumerableDataValue(container, key, member, fail) {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (descriptor === undefined || descriptor.enumerable !== true || !("value" in descriptor)) {
    return fail("accessor or non-enumerable member", member);
  }
  return descriptor.value;
}
function plainJsonArrayItems(value, fail) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    return fail("non-plain array");
  }
  const length = value.length;
  if (Reflect.ownKeys(value).length !== length + 1) {
    return fail("sparse or decorated array");
  }
  const items = [];
  for (let index = 0;index < length; index += 1) {
    const key = String(index);
    if (!Object.hasOwn(value, key))
      return fail("sparse or decorated array");
    items.push(ownEnumerableDataValue(value, key, index, fail));
  }
  return items;
}
function plainJsonObjectMembers(value, fail, options = {}) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return fail("non-plain object");
  }
  const members = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string")
      return fail("symbol field");
    if (options.skipNonEnumerable === true && !Object.prototype.propertyIsEnumerable.call(value, key))
      continue;
    members.push([key, ownEnumerableDataValue(value, key, key, fail)]);
  }
  return members;
}
function encodeCanonical(value, encoding, path, ancestors) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      return encoding.fail("non-finite number", path);
    return JSON.stringify(value);
  }
  if (typeof value !== "object")
    return encoding.fail("non-JSON value", path);
  if (ancestors.has(value))
    return encoding.fail("cycle", path);
  const fail = (violation, member) => encoding.fail(violation, member === undefined ? path : [...path, member]);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = plainJsonArrayItems(value, fail);
      const encoded2 = [];
      for (let index = 0;index < items.length; index += 1) {
        path.push(index);
        encoded2.push(encodeCanonical(items[index], encoding, path, ancestors));
        path.pop();
      }
      return `[${encoded2.join(",")}]`;
    }
    const members = [...plainJsonObjectMembers(value, fail, {
      skipNonEnumerable: encoding.skipNonEnumerable
    })].sort(([left], [right]) => encoding.compare(left, right));
    const encoded = [];
    for (const [key, item] of members) {
      path.push(key);
      if (item === undefined) {
        if (encoding.rejectUndefinedMember !== undefined) {
          return encoding.rejectUndefinedMember(path);
        }
        path.pop();
        continue;
      }
      encoded.push(`${JSON.stringify(key)}:${encodeCanonical(item, encoding, path, ancestors)}`);
      path.pop();
    }
    return `{${encoded.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
function failCanonicalJson(violation) {
  if (violation === "non-finite number") {
    throw new Error("canonical JSON cannot represent a non-finite number");
  }
  throw new Error(`canonical JSON supports only JSON-compatible values: ${violation}`);
}
function canonicalJsonWithOrder(value, compare) {
  return encodeCanonical(value, { compare, skipNonEnumerable: true, fail: failCanonicalJson }, [], new Set);
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
