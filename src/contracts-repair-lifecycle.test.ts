import { expect, test } from "bun:test";

import { sha256 } from "./canonical-json";
import type { ContractCatalogAdapter } from "./contracts-catalog";
import { contractRepairBinding, createContractRepairHandoff, createContractRepairSignal } from "./contracts-repair";
import { parseShape, type Shape } from "./contracts-shape";
import { exampleCatalog, mutable } from "./contracts.test-support";

const viewer: Shape = { kind: "string", minLength: 1, maxLength: 32 };
const count: Shape = { kind: "integer", minimum: 0, maximum: 1_000_000 };
const before: Shape = { kind: "object", properties: { viewer_id: viewer, followers: count } };
const after: Shape = { kind: "object", properties: { viewer_id: viewer, followers: { kind: "object", properties: { total: count } } } };

test("synthetic repair spike: a changed R1 projection must pass identity and negative fixtures before proposing a consumer update", () => {
  const raw = { viewer_id: "synthetic-viewer", followers: { total: 3 } };
  const original = (value: unknown): number => {
    const parsed = parseShape<{ viewer_id: string; followers: number }>(before, value, "profile");
    if (parsed.viewer_id !== "synthetic-viewer") throw new Error("viewer mismatch");
    return parsed.followers;
  };
  const unbound = (value: unknown): number => parseShape<{ followers: { total: number } }>(after, value, "profile").followers.total;
  const repaired = (value: unknown): number => {
    const parsed = parseShape<{ viewer_id: string; followers: { total: number } }>(after, value, "profile");
    if (parsed.viewer_id !== "synthetic-viewer") throw new Error("viewer mismatch");
    return parsed.followers.total;
  };
  expect(() => original(raw)).toThrow();
  const negative = [
    { ...raw, viewer_id: "another-viewer" },
    { ...raw, followers: { total: -1 } },
    { ...raw, followers: { total: 1_000_001 } },
    { ...raw, followers: { total: "3" } },
    { ...raw, private_content: "synthetic-private-content" },
    { ...raw, followers: { total: 3, messages: [] } },
  ];
  const qualifies = (candidate: (value: unknown) => number): boolean => {
    try { if (candidate(raw) !== 3) return false; } catch { return false; }
    return negative.every(value => {
      try { candidate(value); return false; } catch { return true; }
    });
  };
  expect([original, unbound, repaired].map(qualifies)).toEqual([false, false, true]);

  const catalog = exampleCatalog();
  const adapter = catalog.adapters[0] as ContractCatalogAdapter;
  const operation = adapter.operations.find(value => value.id === "profiles.read")!;
  const signal = createContractRepairSignal("contract-drift", contractRepairBinding(adapter, operation));
  expect(createContractRepairHandoff(signal, catalog).status).toBe("investigate");
  const candidate = mutable(catalog);
  const updated = (candidate.adapters[0] as ContractCatalogAdapter).operations.find(value => value.id === operation.id)!;
  Object.assign(updated, { contractVersion: operation.contractVersion + 1, contractHash: sha256("synthetic-reviewed-profile-projection-v2") });
  const proposal = createContractRepairHandoff(signal, candidate);
  expect(proposal.status).toBe("update-candidate");
  expect(proposal.consumerAction).toBe("suggest-update-pr");
  expect(proposal.steps).toEqual(["verify-current-contract", "propose-consumer-update", "run-consumer-gates"]);
  expect(Object.values(proposal.authority)).toEqual([false, false, false, false]);
  expect(JSON.stringify(proposal)).not.toContain("synthetic-viewer");
  expect(JSON.stringify(proposal)).not.toContain("synthetic-private-content");

  Object.assign(updated, { contractVersion: operation.contractVersion - 1 });
  expect(createContractRepairHandoff(signal, candidate).status).toBe("blocked");
});
