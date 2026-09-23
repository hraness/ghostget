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

/**
 * One way a value falls outside the strict JSON value domain that every
 * canonical encoder in this module shares: null, booleans, strings, finite
 * numbers, dense plain arrays, and plain or null-prototype objects whose
 * string-keyed own members are enumerable data properties.
 */
export type JsonDomainViolation =
  | "non-finite number"
  | "non-JSON value"
  | "non-plain array"
  | "sparse or decorated array"
  | "non-plain object"
  | "symbol field"
  | "accessor or non-enumerable member"
  | "cycle";

/**
 * Report a violation. `member` names the array index or object key whose own
 * property descriptor is at fault, when the violation belongs to one member.
 */
export type JsonDomainFailure = (
  violation: JsonDomainViolation,
  member?: string | number,
) => never;

function ownEnumerableDataValue(
  container: object,
  key: string,
  member: string | number,
  fail: JsonDomainFailure,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(container, key);
  if (
    descriptor === undefined
    || descriptor.enumerable !== true
    || !("value" in descriptor)
  ) {
    return fail("accessor or non-enumerable member", member);
  }
  return descriptor.value as unknown;
}

/**
 * The elements of a dense, undecorated array with the ordinary array
 * prototype. Holes, extra own keys, and accessor elements are rejected, and no
 * getter runs. Elements are returned without validating their own domain.
 */
export function plainJsonArrayItems(
  value: readonly unknown[],
  fail: JsonDomainFailure,
): readonly unknown[] {
  if ((Object.getPrototypeOf(value) as unknown) !== Array.prototype) {
    return fail("non-plain array");
  }
  const length = value.length;
  if (Reflect.ownKeys(value).length !== length + 1) {
    return fail("sparse or decorated array");
  }
  const items: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!Object.hasOwn(value, key)) return fail("sparse or decorated array");
    items.push(ownEnumerableDataValue(value, key, index, fail));
  }
  return items;
}

/**
 * The members of a plain or null-prototype object, in own-key order. Symbol
 * keys and enumerable accessors are rejected, and no getter runs. A
 * non-enumerable member is rejected too unless `skipNonEnumerable` is set, in
 * which case it is left out exactly as JSON.stringify leaves it out; some
 * parsed projections hide a member that way on purpose. A literal
 * "__proto__" own key is an ordinary member. Member values, including
 * `undefined`, are returned without validating their own domain.
 */
export function plainJsonObjectMembers(
  value: object,
  fail: JsonDomainFailure,
  options: { readonly skipNonEnumerable?: boolean } = {},
): readonly (readonly [string, unknown])[] {
  const prototype: unknown = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return fail("non-plain object");
  }
  const members: (readonly [string, unknown])[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return fail("symbol field");
    if (
      options.skipNonEnumerable === true
      && !Object.prototype.propertyIsEnumerable.call(value, key)
    ) continue;
    members.push([key, ownEnumerableDataValue(value, key, key, fail)]);
  }
  return members;
}

type JsonPath = readonly (string | number)[];

type CanonicalEncoding = {
  readonly compare: KeyCompare;
  /**
   * Drop `undefined` and non-enumerable object members, as JSON.stringify
   * does (true), or reject them (false).
   */
  readonly omitLikeJsonStringify: boolean;
  readonly fail: (violation: JsonDomainViolation, path: JsonPath) => never;
};

function encodeCanonical(
  value: unknown,
  encoding: CanonicalEncoding,
  path: (string | number)[],
  ancestors: Set<object>,
): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return encoding.fail("non-finite number", path);
    return JSON.stringify(value);
  }
  if (typeof value !== "object") return encoding.fail("non-JSON value", path);
  if (ancestors.has(value)) return encoding.fail("cycle", path);
  const fail: JsonDomainFailure = (violation, member) =>
    encoding.fail(violation, member === undefined ? path : [...path, member]);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = plainJsonArrayItems(value, fail);
      const encoded: string[] = [];
      for (let index = 0; index < items.length; index += 1) {
        path.push(index);
        encoded.push(encodeCanonical(items[index], encoding, path, ancestors));
        path.pop();
      }
      return `[${encoded.join(",")}]`;
    }
    const members = [...plainJsonObjectMembers(value, fail, {
      skipNonEnumerable: encoding.omitLikeJsonStringify,
    })]
      .sort(([left], [right]) => encoding.compare(left, right));
    const encoded: string[] = [];
    for (const [key, item] of members) {
      if (item === undefined && encoding.omitLikeJsonStringify) continue;
      path.push(key);
      encoded.push(`${JSON.stringify(key)}:${encodeCanonical(item, encoding, path, ancestors)}`);
      path.pop();
    }
    return `{${encoded.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function failCanonicalJson(violation: JsonDomainViolation): never {
  // Member names can carry caller data, so this general-purpose encoder
  // reports only the violation kind.
  if (violation === "non-finite number") {
    throw new Error("canonical JSON cannot represent a non-finite number");
  }
  throw new Error(
    `canonical JSON supports only JSON-compatible values: ${violation}`,
  );
}

function canonicalJsonWithOrder(value: unknown, compare: KeyCompare): string {
  return encodeCanonical(
    value,
    { compare, omitLikeJsonStringify: true, fail: failCanonicalJson },
    [],
    new Set(),
  );
}

const strictViolationText: Readonly<Record<JsonDomainViolation, string>> = {
  "non-finite number": "a non-finite number",
  "non-JSON value": "a non-JSON value",
  "non-plain array": "a non-plain array",
  "sparse or decorated array": "a sparse or decorated array",
  "non-plain object": "a non-plain object",
  "symbol field": "a symbol field",
  "accessor or non-enumerable member": "unsupported accessor state",
  "cycle": "a cycle",
};

/**
 * Canonical JSON over the same strict value domain and member ordering as
 * {@link canonicalJson}, except that an `undefined` or non-enumerable member
 * is rejected rather than dropped. Errors name the offending path under
 * `label`, so use it only for reviewed descriptors whose member names are not
 * private data. The output is byte-identical to canonicalJson for every value
 * it accepts.
 */
export function strictCanonicalJson(value: unknown, label: string): string {
  return encodeCanonical(
    value,
    {
      compare: compareUtf16CodeUnits,
      omitLikeJsonStringify: false,
      fail: (violation, path) => {
        const location = path.map((segment) =>
          typeof segment === "number" ? `[${segment}]` : `.${segment}`).join("");
        throw new Error(`${label}${location} contains ${strictViolationText[violation]}`);
      },
    },
    [],
    new Set(),
  );
}

/**
 * Canonical JSON for plan binding, content addressing, and provider-owned
 * semantic identities, with RFC 8785-compatible UTF-16 code-unit member
 * ordering. This leaf has no catalog or runtime dependencies.
 *
 * Only the strict JSON value domain encodes. Like JSON.stringify, it drops
 * `undefined` and non-enumerable object members. Sparse or decorated arrays,
 * class instances such as Map, Date, and typed arrays, enumerable accessors,
 * symbol-keyed members, cycles, and non-finite numbers are rejected, so
 * distinct inputs cannot collapse onto one encoding and the output always
 * parses as JSON.
 */
export function canonicalJson(value: unknown): string {
  return canonicalJsonWithOrder(value, compareUtf16CodeUnits);
}

function assertDefinedJsonMembers(value: unknown, context: string): void {
  if (Array.isArray(value)) {
    for (const item of value) assertDefinedJsonMembers(item, context);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      if (item === undefined) {
        throw new Error(`${context} contains an unsupported value`);
      }
      assertDefinedJsonMembers(item, context);
    }
  }
}

/**
 * Canonical JSON requiring every nested object member to be defined.
 * canonicalJson drops `undefined` members before serializing; a serializer
 * whose preimage is a reviewed durable contract must instead reject them
 * exactly as the retired sorted-key serializers did, so this validates
 * membership first and then delegates to the shared encoder. `context`
 * names the contract vocabulary in the raised error.
 */
export function canonicalJsonWithDefinedMembers(
  value: unknown,
  context: string,
): string {
  assertDefinedJsonMembers(value, context);
  return canonicalJson(value);
}

/**
 * The pre-migration canonical JSON encoding whose members are ordered by
 * locale collation. Retained exclusively for verifying data persisted before
 * the RFC 8785 ordering migration; it must never feed new writes.
 *
 * Its bytes are frozen as written: collation depends on the runtime's ICU
 * data, and keys that collate as equal keep insertion order. Collation also
 * differs from code-unit order on ordinary ASCII names (case, and
 * punctuation such as "_" and "-"), so it cannot be replaced by the current
 * ordering without breaking verification of that state. It shares the strict
 * value domain of canonicalJson.
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
