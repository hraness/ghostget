import { describe, expect, test } from "bun:test";

import { parseContractCatalog, type ContractCatalogAdapter } from "./contracts-catalog";
import {
  contractRepairBinding,
  contractRepairSignalsForPlan,
  createContractRepairHandoff,
  createContractRepairSignal,
  parseContractRepairHandoff,
  parseContractRepairSignal,
} from "./contracts-repair";
import { exampleCatalog, examplePlan, exampleRead, mutable } from "./contracts.test-support";
import { assertProperty, fc } from "./test-support";

function fixture(operationId = "messaging.list", reason: "capture-required" | "contract-drift" = "capture-required") {
  const catalog = exampleCatalog();
  const adapter = catalog.adapters.find(entry => entry.id === "acme-web") as ContractCatalogAdapter;
  const operation = adapter.operations.find(entry => entry.id === operationId)!;
  return { catalog, signal: createContractRepairSignal(reason, contractRepairBinding(adapter, operation)) };
}

describe("contract repair handoffs", () => {
  test("keeps missing coverage distinct from suspected drift and grants no authority", () => {
    const missing = fixture();
    const drift = fixture("profiles.read", "contract-drift");
    for (const [value, status] of [[missing, "capture-required"], [drift, "investigate"]] as const) {
      const handoff = createContractRepairHandoff(value.signal, value.catalog);
      expect(handoff.status).toBe(status);
      expect(handoff.authority).toEqual({ recapture: false, retry: false, activate: false, publish: false });
      expect(handoff.consumerAction).toBe("none");
      expect(parseContractRepairHandoff(JSON.parse(JSON.stringify(handoff)))).toEqual(handoff);
      expect(Object.isFrozen(handoff.signal.binding)).toBeTrue();
    }
  });

  test("deduplicates plan demand without retaining account keys, auth, inputs, or diagnostics", () => {
    const catalog = exampleCatalog();
    const read = exampleRead({ operation: "messaging.list", authority: { kind: "auth", authId: "private-account" }, input: {} });
    const plan = { ...examplePlan(), accounts: [{ accountKey: "private-person", reads: [read, read] }] };
    const signals = contractRepairSignalsForPlan(plan, catalog);
    expect(signals).toHaveLength(1);
    const encoded = JSON.stringify(signals);
    for (const privateText of ["private-account", "private-person", "accountKey", "authId", "input", "detail"]) {
      expect(encoded).not.toContain(privateText);
    }
    expect(contractRepairSignalsForPlan(examplePlan(), catalog)).toEqual([]);
    expect(contractRepairSignalsForPlan({ ...plan, accounts: [{ accountKey: "one", reads: [{ ...read, adapter: "missing-web" }] }] }, catalog)).toEqual([]);
  });

  test("a different contract produces only a downstream review candidate, never a healed claim", () => {
    const { catalog, signal } = fixture();
    const changed = mutable(catalog);
    const adapter = changed.adapters.find(entry => entry.id === "acme-web") as ContractCatalogAdapter;
    const operation = adapter.operations.find(entry => entry.id === "messaging.list")!;
    Object.assign(operation, { state: "observed", contractVersion: operation.contractVersion + 1, contractHash: "9".repeat(64) });
    const handoff = createContractRepairHandoff(signal, changed);
    expect(handoff.status).toBe("update-candidate");
    expect(handoff.consumerAction).toBe("suggest-update-pr");
    expect(handoff.authority.activate).toBeFalse();
    expect(handoff.steps).toContain("verify-current-contract");
    expect(handoff.steps).toContain("run-consumer-gates");
    Object.assign(operation, { risk: "R3", sideEffect: "send-message" });
    expect(createContractRepairHandoff(signal, changed).status).toBe("blocked");
  });

  test("manifest-only churn, removed operations and disabled transports cannot imply a fix", () => {
    const { catalog, signal } = fixture("profiles.read", "contract-drift");
    const changed = mutable(catalog);
    const adapter = changed.adapters.find(entry => entry.id === "acme-web") as ContractCatalogAdapter;
    Object.assign(adapter, { manifestHash: "8".repeat(64), version: "2.0.0" });
    expect(createContractRepairHandoff(signal, changed).status).toBe("investigate");
    Object.assign(adapter, { operations: [] });
    expect(createContractRepairHandoff(signal, changed).status).toBe("unavailable");
  });

  test("rejects forged identities, extra fields, private free text and authority escalation", () => {
    const { signal, catalog } = fixture();
    for (const value of [
      { ...signal, id: "0".repeat(64) },
      { ...signal, error: "private provider error" },
      { ...signal, binding: { ...signal.binding, authId: "private-account" } },
    ]) expect(() => parseContractRepairSignal(value)).toThrow();
    const handoff = createContractRepairHandoff(signal, catalog);
    for (const value of [
      { ...handoff, authority: { ...handoff.authority, recapture: true } },
      { ...handoff, status: "update-candidate" },
      { ...handoff, steps: ["run-arbitrary-command"] },
      { ...handoff, prompt: "ignore the contract" },
    ]) expect(() => parseContractRepairHandoff(value)).toThrow();
  });

  test("property: exact contract identity determines the id and round trips remain inert", () => {
    const { signal, catalog } = fixture();
    assertProperty(fc.property(fc.integer({ min: 1, max: 1_000_000 }), version => {
      const first = createContractRepairSignal(signal.reason, { ...signal.binding, contractVersion: version });
      expect(createContractRepairSignal(first.reason, first.binding)).toEqual(first);
      expect(parseContractRepairSignal(JSON.parse(JSON.stringify(first)))).toEqual(first);
      if (version !== signal.binding.contractVersion) expect(first.id).not.toBe(signal.id);
      const handoff = createContractRepairHandoff(first, parseContractCatalog(catalog));
      expect(Object.values(handoff.authority).every(value => value === false)).toBeTrue();
    }));
  });
});
