import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  COLLECTION_PLAN_MAX_READS,
  collectionPlanReads,
  parseCollectionPlan,
} from "./contracts-plan";
import { contractSchema } from "./contracts-schema";
import { schemaViolations } from "./contracts-schema.test-support";
import { ContractParseError } from "./contracts-shape";
import {
  examplePlan,
  exampleRead,
  mutable,
  objectPaths,
  planArbitrary,
  withExtraKey,
} from "./contracts.test-support";
import { assertProperty, fc } from "./test-support";

const schema = contractSchema("plan");
const hranessPlanPath = join(
  import.meta.dir,
  "..",
  "skills",
  "ghostget",
  "references",
  "hraness-social-profile-stats.json",
);

function planWithReads(reads: Record<string, unknown>[]): Record<string, unknown> {
  return {
    ...examplePlan(),
    accounts: [{ accountKey: "one", reads }],
  };
}

describe("ghostget.collection-plan.v1", () => {
  test("parses the example plan and the packaged Hraness plan and validates both against the schema", () => {
    expect(parseCollectionPlan(examplePlan())).toEqual(examplePlan());
    expect(schemaViolations(schema, examplePlan())).toEqual([]);
    const hraness = JSON.parse(readFileSync(hranessPlanPath, "utf8")) as unknown;
    const parsed = parseCollectionPlan(hraness);
    expect(parsed.collectionKey).toBe("hraness-social-profile-statistics");
    expect(collectionPlanReads(parsed)).toHaveLength(15);
    expect(collectionPlanReads(parsed).map((entry) => entry.index)).toEqual([...Array(15).keys()]);
    expect(schemaViolations(schema, hraness)).toEqual([]);
  });

  test("rejects the documented bounds", () => {
    const tooMany = { ...examplePlan(), accounts: Array.from({ length: 65 }, (_, index) => ({
      accountKey: `account-${String(index)}`,
      reads: [exampleRead()],
    })) };
    expect(() => parseCollectionPlan(tooMany)).toThrow("plan.accounts must have 1 to 64 items");
    const tooManyReads = planWithReads(Array.from({ length: 9 }, () => exampleRead() as unknown as Record<string, unknown>));
    expect(() => parseCollectionPlan(tooManyReads)).toThrow("plan.accounts[0].reads must have 1 to 8 items");
    const overTotal = { ...examplePlan(), accounts: Array.from({ length: 17 }, (_, index) => ({
      accountKey: `account-${String(index)}`,
      reads: Array.from({ length: 8 }, () => exampleRead()),
    })) };
    expect(() => parseCollectionPlan(overTotal)).toThrow(`must hold at most ${String(COLLECTION_PLAN_MAX_READS)} reads in total`);
    expect(() => parseCollectionPlan(planWithReads([{ ...exampleRead(), requiredDelayBeforeMs: 600_001 }])))
      .toThrow("plan.accounts[0].reads[0].requiredDelayBeforeMs must be an integer from 0 to 600000");
    expect(() => parseCollectionPlan(planWithReads([{
      ...exampleRead(),
      metricKeys: Array.from({ length: 17 }, (_, index) => `metric${String(index)}`),
    }]))).toThrow("metricKeys must have 1 to 16 items");
    expect(() => parseCollectionPlan(planWithReads([{ ...exampleRead(), metricKeys: ["a", "a"] }])))
      .toThrow("metricKeys must not contain duplicate items");
  });

  test("keeps v1 plans read-only and pins the execution mode", () => {
    for (const [field, value] of [["risk", "R2"], ["sideEffect", "changes remote state"], ["state", "reviewed"]] as const) {
      const plan = planWithReads([{ ...exampleRead(), semantics: { ...exampleRead().semantics, [field]: value } }]);
      expect(() => parseCollectionPlan(plan)).toThrow(`plan.accounts[0].reads[0].semantics.${field}`);
    }
    expect(() => parseCollectionPlan({ ...examplePlan(), execution: { order: "parallel", observationMode: "live-only" } }))
      .toThrow("plan.execution.order must equal \"sequential\"");
    expect(() => parseCollectionPlan({ ...examplePlan(), schemaVersion: 2 })).toThrow("plan.schemaVersion must equal 1");
  });

  test("rejects duplicate account keys, unknown gap metrics, credentials in targets, and extra fields", () => {
    const duplicate = mutable(examplePlan()) as { accounts: unknown[] };
    duplicate.accounts.push(structuredClone(duplicate.accounts[0]));
    expect(() => parseCollectionPlan(duplicate)).toThrow("plan.accounts[3].accountKey repeats an account key");

    expect(() => parseCollectionPlan(planWithReads([{
      ...exampleRead(),
      expectedCategoricalGaps: [{ metricKey: "views", reason: "not-authorized", until: "account-eligible" }],
    }]))).toThrow("expectedCategoricalGaps[0].metricKey must name one of the read's metric keys");
    expect(() => parseCollectionPlan(planWithReads([{
      ...exampleRead(),
      expectedCategoricalGaps: [
        { metricKey: "followers", reason: "not-authorized", until: "account-eligible" },
        { metricKey: "followers", reason: "not-authorized", until: "account-eligible" },
      ],
    }]))).toThrow("expectedCategoricalGaps[1].metricKey repeats a metric key");
    expect(() => parseCollectionPlan(planWithReads([{
      ...exampleRead(),
      expectedCategoricalGaps: [{ metricKey: "followers", reason: "provider-drift", until: "account-eligible" }],
    }]))).toThrow("reason must equal \"not-authorized\"");

    for (const targetUrl of [
      "https://user:secret@acme.example/hraness",
      "https://acme.example/hraness?token=1",
      "https://acme.example/hraness#x",
      "https://acme.example/../hraness",
      "http://acme.example/hraness",
    ]) {
      expect(() => parseCollectionPlan(planWithReads([{ ...exampleRead(), expectedOutput: { provider: "acme", targetUrl } }])))
        .toThrow("targetUrl");
    }

    expect(() => parseCollectionPlan(planWithReads([{ ...exampleRead(), rawResponse: true }])))
      .toThrow("plan.accounts[0].reads[0] has an unsupported key rawResponse");
    expect(() => parseCollectionPlan(planWithReads([{ ...exampleRead(), authority: { kind: "auth" } }])))
      .toThrow("plan.accounts[0].reads[0].authority is missing required key authId");
    expect(() => parseCollectionPlan(planWithReads([{ ...exampleRead(), authority: { kind: "public", authId: "x" } }])))
      .toThrow("plan.accounts[0].reads[0].authority has an unsupported key authId");
    expect(() => parseCollectionPlan(planWithReads([{ ...exampleRead(), input: { "Bad Key": 1 } }])))
      .toThrow("plan.accounts[0].reads[0].input has a key that does not match its required pattern");
    expect(() => parseCollectionPlan(planWithReads([{ ...exampleRead(), input: { handle: { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } } } }])))
      .toThrow("exceeds the JSON depth bound of 8");
  });

  test("property: generated plans round-trip through JSON, flatten in order, and validate against the schema", () => {
    assertProperty(fc.property(planArbitrary, (plan) => {
      const parsed = parseCollectionPlan(plan);
      expect(parsed).toEqual(plan);
      expect(parseCollectionPlan(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
      expect(schemaViolations(schema, parsed)).toEqual([]);
      const reads = collectionPlanReads(parsed);
      expect(reads.map((entry) => entry.index)).toEqual([...Array(reads.length).keys()]);
      expect(reads.map((entry) => entry.accountKey)).toEqual(
        plan.accounts.flatMap((account) => account.reads.map(() => account.accountKey)),
      );
    }));
  });

  test("property: an unsupported key at any structural object path is rejected", () => {
    assertProperty(fc.property(planArbitrary, fc.nat(), (plan, seed) => {
      const paths = objectPaths(plan).filter((path) => !path.includes("input"));
      const path = paths[seed % paths.length];
      if (path === undefined) throw new Error("no object path");
      const mutated = withExtraKey(plan, path);
      expect(() => parseCollectionPlan(mutated)).toThrow(ContractParseError);
      expect(() => parseCollectionPlan(mutated)).toThrow("unsupported key __extra");
      expect(schemaViolations(schema, mutated).length).toBeGreaterThan(0);
    }));
  });

  test("property: every parser rejection of a generated mutation is a schema violation or a documented semantic rule", () => {
    const semanticRules = [
      "repeats an account key",
      "reads in total",
      "must name one of the read's metric keys",
      "repeats a metric key",
      "canonical",
      "JSON depth bound",
      "JSON nodes",
      "invalid JSON key",
    ];
    assertProperty(fc.property(planArbitrary, fc.jsonValue({ maxDepth: 2 }), fc.nat(), (plan, junk, seed) => {
      const paths = objectPaths(plan);
      const path = paths[seed % paths.length];
      if (path === undefined) throw new Error("no object path");
      const clone = mutable(plan) as unknown;
      let target: Record<string, unknown> = clone as Record<string, unknown>;
      for (const segment of path) target = target[segment] as Record<string, unknown>;
      const keys = Object.keys(target);
      const key = keys[seed % Math.max(1, keys.length)];
      if (key === undefined) return;
      target[key] = junk;
      let message: string | null = null;
      try {
        parseCollectionPlan(clone);
      } catch (error) {
        if (!(error instanceof ContractParseError)) throw error;
        message = error.message;
      }
      const violations = schemaViolations(schema, clone);
      if (message === null) expect(violations).toEqual([]);
      else expect(violations.length > 0 || semanticRules.some((rule) => message?.includes(rule))).toBeTrue();
    }));
  });
});
