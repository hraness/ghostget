// @bun
// src/canonical-json.ts
import { createHash } from "crypto";
var compareUtf16CodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
var compareLegacyLocale = (left, right) => left.localeCompare(right);
function dataDescriptorValue(descriptor, member, fail) {
  if (descriptor.enumerable !== true || !("value" in descriptor)) {
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
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined)
      return fail("sparse or decorated array");
    items.push(dataDescriptorValue(descriptor, index, fail));
  }
  return items;
}
function plainJsonObjectMembers(value, fail, options = {}) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return fail("non-plain object");
  }
  const skipNonEnumerable = options.skipNonEnumerable === true;
  const members = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string")
      return fail("symbol field");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) {
      return fail("accessor or non-enumerable member", key);
    }
    if (skipNonEnumerable && descriptor.enumerable !== true)
      continue;
    members.push([key, dataDescriptorValue(descriptor, key, fail)]);
  }
  return members;
}
function encodeCanonicalRoot(value, encoding) {
  const path = [];
  return encodeCanonical(value, {
    encoding,
    path,
    ancestors: new Set,
    fail: (violation, member) => encoding.fail(violation, member === undefined ? path : [...path, member])
  });
}
function encodeCanonical(value, walk) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  const { encoding, path, ancestors, fail } = walk;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      return encoding.fail("non-finite number", path);
    return JSON.stringify(value);
  }
  if (typeof value !== "object")
    return encoding.fail("non-JSON value", path);
  const depth = ancestors.size;
  ancestors.add(value);
  if (ancestors.size === depth)
    return encoding.fail("cycle", path);
  let text;
  if (Array.isArray(value)) {
    const items = plainJsonArrayItems(value, fail);
    text = "[";
    for (let index = 0;index < items.length; index += 1) {
      if (index > 0)
        text += ",";
      path.push(index);
      text += encodeCanonical(items[index], walk);
      path.pop();
    }
    text += "]";
  } else {
    const members = plainJsonObjectMembers(value, fail, {
      skipNonEnumerable: encoding.skipNonEnumerable
    }).sort(([left], [right]) => encoding.compare(left, right));
    text = "{";
    let first = true;
    for (const [key, item] of members) {
      path.push(key);
      if (item === undefined) {
        if (encoding.rejectUndefinedMember !== undefined) {
          return encoding.rejectUndefinedMember(path);
        }
        path.pop();
        continue;
      }
      if (!first)
        text += ",";
      first = false;
      text += `${JSON.stringify(key)}:${encodeCanonical(item, walk)}`;
      path.pop();
    }
    text += "}";
  }
  ancestors.delete(value);
  return text;
}
function failCanonicalJson(violation) {
  if (violation === "non-finite number") {
    throw new Error("canonical JSON cannot represent a non-finite number");
  }
  throw new Error(`canonical JSON supports only JSON-compatible values: ${violation}`);
}
function canonicalJsonWithOrder(value, compare) {
  return encodeCanonicalRoot(value, { compare, skipNonEnumerable: true, fail: failCanonicalJson });
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
