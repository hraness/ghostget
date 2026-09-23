import { describe, expect, test } from "bun:test";

import { checkCollectionPlan, parseContractCheck, type ContractCheckV1 } from "./contracts-check";
import { contractSchema } from "./contracts-schema";
import { schemaViolations } from "./contracts-schema.test-support";
import { ContractParseError } from "./contracts-shape";
import { contractGapReasons, type ContractGapReason } from "./contracts-vocabulary";
import {
  catalogArbitrary,
  conformingPlanArbitrary,
  exampleCatalog,
  examplePlan,
  exampleRead,
  HASH_E,
  mutable,
  objectPaths,
  planArbitrary,
  withExtraKey,
} from "./contracts.test-support";
import type { CollectionRead } from "./contracts-plan";
import { assertProperty, fc } from "./test-support";

const schema = contractSchema("check");

function singleRead(read: Partial<CollectionRead>, options?: { readonly storedAuthIds?: readonly string[] }): ContractCheckV1["reads"][number] {
  const plan = { ...examplePlan(), accounts: [{ accountKey: "one", reads: [exampleRead(read)] }] };
  const check = checkCollectionPlan(plan, exampleCatalog(), options);
  const first = check.reads[0];
  if (first === undefined) throw new Error("no read");
  return first;
}

describe("checkCollectionPlan", () => {
  test("binds every example read to its installed contract", () => {
    const check = checkCollectionPlan(examplePlan(), exampleCatalog());
    expect(check.ok).toBeTrue();
    expect(check.contract).toBe("ghostget.contract-check.v1");
    expect(check.ghostget).toEqual({ version: "0.18.34" });
    expect(check.plan).toEqual({ collectionKey: "example-social-statistics", reads: 3 });
    expect(check.reads[0]).toEqual({
      index: 0,
      accountKey: "acme-public",
      adapter: "acme-web",
      operation: "profiles.read",
      verdict: "ok",
      binding: {
        adapterVersion: "1.4.0",
        contractVersion: 2,
        contractHash: HASH_E,
        transport: "web-session-api",
        authority: "public",
      },
    });
    expect(check.reads.map((read) => read.verdict)).toEqual(["ok", "ok", "ok"]);
    expect(schemaViolations(schema, check)).toEqual([]);
    expect(Object.isFrozen(check.reads)).toBeTrue();
  });

  test("reports one gap reason per read from the closed set, in the fixed priority order", () => {
    const cases: readonly [Partial<CollectionRead>, ContractGapReason, string][] = [
      [{ adapter: "missing-web" }, "adapter-missing", "adapter is not installed"],
      [{ adapter: "broken-web" }, "adapter-invalid", "installed manifest is invalid: manifest.schemaVersion must be 4"],
      [{ operation: "missing.read" }, "operation-missing", "adapter does not own the operation"],
      [{ adapter: "template-web", operation: "articles.publish" }, "transport-disabled", "installed transport reviewed-template-api is not invocable"],
      [{ operation: "messaging.list", authority: { kind: "auth", authId: "acme-chrome" }, input: {} }, "state-mismatch", "installed state is capture-required; plan requires observed"],
      [{ operation: "posts.publish", authority: { kind: "auth", authId: "acme-chrome" }, input: { body: "x" } }, "risk-mismatch", "installed risk is R3; plan requires R1"],
      [{ operation: "feeds.read", input: { feed: "home" } }, "authority-mismatch", "installed authority is auth; plan requires public"],
      [{ input: { handle: "" } }, "input-invalid", "input.handle has an invalid length"],
      [{ input: { handle: "x", extra: 1 } }, "input-invalid", "input.extra is not supported"],
    ];
    for (const [read, reason, detail] of cases) {
      const verdict = singleRead(read);
      expect(verdict.verdict).toBe("gap");
      if (verdict.verdict === "gap") expect(verdict.gap).toEqual({ reason, detail });
    }
    const sideEffect = singleRead({ operation: "posts.publish", authority: { kind: "auth", authId: "acme-chrome" }, input: { body: "x" }, semantics: { state: "observed", risk: "R1", sideEffect: "none" } });
    expect(sideEffect.verdict).toBe("gap");
  });

  test("checks auth locator presence only when the caller supplies the stored IDs", () => {
    const authRead: Partial<CollectionRead> = {
      operation: "feeds.read",
      authority: { kind: "auth", authId: "acme-chrome" },
      input: { feed: "home", limit: 5 },
    };
    expect(singleRead(authRead).verdict).toBe("ok");
    expect(singleRead(authRead, { storedAuthIds: ["acme-chrome"] }).verdict).toBe("ok");
    const missing = singleRead(authRead, { storedAuthIds: [] });
    expect(missing).toMatchObject({ verdict: "gap", gap: { reason: "auth-missing", detail: "plan names an auth locator that is not stored" } });
    expect(JSON.stringify(missing)).not.toContain("acme-chrome");
    expect(singleRead({}, { storedAuthIds: [] }).verdict).toBe("ok");
  });

  test("keeps the whole document when any read has a gap and sets ok only when every read binds", () => {
    const plan = mutable(examplePlan());
    (plan.accounts[0]!.reads[0] as { adapter: string }).adapter = "missing-web";
    const check = checkCollectionPlan(plan, exampleCatalog());
    expect(check.ok).toBeFalse();
    expect(check.reads).toHaveLength(3);
    expect(check.reads.map((read) => read.verdict)).toEqual(["gap", "ok", "ok"]);
    expect(schemaViolations(schema, check)).toEqual([]);
  });

  test("property: checking is deterministic and idempotent and never leaves the closed gap set", () => {
    assertProperty(fc.property(planArbitrary, catalogArbitrary, fc.option(fc.array(fc.string()), { nil: undefined }), (plan, catalog, storedAuthIds) => {
      const options = storedAuthIds === undefined ? {} : { storedAuthIds };
      const first = checkCollectionPlan(plan, catalog, options);
      const second = checkCollectionPlan(plan, catalog, options);
      expect(second).toEqual(first);
      expect(parseContractCheck(JSON.parse(JSON.stringify(first)))).toEqual(first);
      expect(schemaViolations(schema, first)).toEqual([]);
      expect(first.plan.reads).toBe(first.reads.length);
      expect(first.ok).toBe(first.reads.every((read) => read.verdict === "ok"));
      for (const read of first.reads) {
        if (read.verdict === "gap") expect(contractGapReasons).toContain(read.gap.reason);
      }
    }));
  });

  test("property: reads derived from the catalog bind ok with the exact installed contract", () => {
    assertProperty(fc.property(catalogArbitrary.chain((catalog) => {
      const plans = conformingPlanArbitrary(catalog);
      return plans === null ? fc.constant(null) : fc.tuple(fc.constant(catalog), plans);
    }), (pair) => {
      if (pair === null) return;
      const [catalog, plan] = pair;
      const check = checkCollectionPlan(plan, catalog);
      expect(check.ok).toBeTrue();
      for (const read of check.reads) {
        expect(read.verdict).toBe("ok");
        if (read.verdict !== "ok") continue;
        const adapter = catalog.adapters.find((candidate) => candidate.id === read.adapter);
        if (adapter === undefined || "invalid" in adapter) throw new Error("bound adapter missing");
        const operation = adapter.operations.find((candidate) => candidate.id === read.operation);
        expect(read.binding).toEqual({
          adapterVersion: adapter.version,
          contractVersion: operation?.contractVersion ?? -1,
          contractHash: operation?.contractHash ?? "",
          transport: operation?.transport ?? "web-session-api",
          authority: operation?.authority ?? "auth",
        });
      }
    }));
  });
});

describe("parseContractCheck", () => {
  test("rejects inconsistent counts, indexes, ok flags, and unsupported keys", () => {
    const check = checkCollectionPlan(examplePlan(), exampleCatalog());
    const shortCount = { ...mutable(check), plan: { ...check.plan, reads: 2 } };
    expect(() => parseContractCheck(shortCount)).toThrow("check.reads must hold exactly plan.reads entries");
    const reordered = mutable(check) as { reads: { index: number }[] };
    reordered.reads[1]!.index = 0;
    expect(() => parseContractCheck(reordered)).toThrow("check.reads[1].index must follow execution order");
    const wrongOk = { ...mutable(check), ok: false };
    expect(() => parseContractCheck(wrongOk)).toThrow("check.ok must be true exactly when every read is ok");
    const unknownReason = mutable(check) as { reads: Record<string, unknown>[] };
    unknownReason.reads[0] = { ...unknownReason.reads[0], verdict: "gap", gap: { reason: "unknown", detail: "x" } };
    delete unknownReason.reads[0].binding;
    expect(() => parseContractCheck(unknownReason)).toThrow("check.reads[0].gap.reason must be one of");
  });

  test("property: an unsupported key at any object path is rejected by the parser and the schema", () => {
    assertProperty(fc.property(planArbitrary, catalogArbitrary, fc.nat(), (plan, catalog, seed) => {
      const check = checkCollectionPlan(plan, catalog);
      const paths = objectPaths(check);
      const path = paths[seed % paths.length];
      if (path === undefined) throw new Error("no object path");
      const mutated = withExtraKey(check, path);
      expect(() => parseContractCheck(mutated)).toThrow(ContractParseError);
      expect(() => parseContractCheck(mutated)).toThrow("unsupported key __extra");
      expect(schemaViolations(schema, mutated).length).toBeGreaterThan(0);
    }));
  });
});
