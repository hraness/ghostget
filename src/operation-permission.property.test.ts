import { expect, test } from "bun:test";
import { assertProperty, fc } from "./test-support";
import { canonicalJson, sha256 } from "./canonical-json";
import { parseOperationPolicy } from "./operation-permission-store";

test("operation policy canonical round trips retain decisions and strict digest order", () => {
  assertProperty(fc.property(
    fc.uniqueArray(fc.string({ maxLength: 100 }).map(sha256), { maxLength: 100 }),
    fc.constantFrom("allow", "deny", "ask"), fc.integer({ min: 1, max: 1_000_000 }),
    (digests, decision, revision) => {
      const value = { schemaVersion: 1, revision, entries: digests.sort().map(digest => ({ digest, decision })) };
      const parsed = parseOperationPolicy(value);
      expect(parseOperationPolicy(JSON.parse(canonicalJson(parsed)) as unknown)).toEqual(parsed);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.entries)).toBe(true);
    },
  ));
});

test("operation policy arbitrary values are rejected or normalized to a strict bounded canonical policy", () => {
  assertProperty(fc.property(fc.jsonValue(), value => {
    let parsed: ReturnType<typeof parseOperationPolicy>;
    try { parsed = parseOperationPolicy(value); } catch { return; }
    expect(parsed.schemaVersion).toBe(1);
    expect(Number.isSafeInteger(parsed.revision) && parsed.revision > 0).toBe(true);
    expect(parsed.entries.length).toBeLessThanOrEqual(4096);
    expect(new Set(parsed.entries.map(entry => entry.digest)).size).toBe(parsed.entries.length);
    expect(parseOperationPolicy(JSON.parse(canonicalJson(parsed)) as unknown)).toEqual(parsed);
  }));
});

test("operation policy duplicate ownership is rejected independent of decision", () => {
  assertProperty(fc.property(fc.string().map(sha256), fc.constantFrom("allow", "deny", "ask"), fc.constantFrom("allow", "deny", "ask"), (digest, left, right) => {
    expect(() => parseOperationPolicy({ schemaVersion: 1, revision: 1, entries: [{ digest, decision: left }, { digest, decision: right }] })).toThrow();
  }));
});
