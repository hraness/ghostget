import {
  chmodSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  afterEach,
  describe,
  expect,
  test,
} from "bun:test";

import {
  initialLinkedDeviceLifecycleJournal,
  type LinkedDeviceLifecycleJournalSnapshot,
} from "./linked-device-lifecycle-journal";
import type { PortableOperationIdentityV1 } from "./provider-plugin-portable-identity";
import type {
  PortableProviderPluginInvocationLeaseSnapshot,
} from "./provider-plugin-invocation-lease";
import {
  inspectPortableProviderPluginQuiescence,
  type PortableProviderPluginQuiescenceDependencies,
} from "./provider-plugin-lifecycle-kernel";
import type { RecoveryCapsule } from "./recovery";
import type { RunJournalSnapshot } from "./run-journal";
import { assertProperty, fc, type Command } from "./test-support";
import type {
  ConfirmationClaimSnapshot,
  RunReceipt,
  StoredPlan,
} from "./runtime";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const runId = "12345678-1234-4123-8123-123456789abc";
const planDigest = "d".repeat(64);
const at = "2026-07-25T12:00:00.000Z";

const identity: PortableOperationIdentityV1 = Object.freeze({
  pluginId: "portable-test",
  pluginVersion: "1.0.0",
  hostApiVersion: 1,
  bundleSha256: hashA,
  manifestSha256: hashB,
  adapterId: "portable-test",
  transport: "web-session-api",
  surfaceId: "portable-test",
  operation: "records.write",
  contractVersion: 1,
  descriptorSha256: hashC,
});

const storedPlan: StoredPlan = Object.freeze({
  digest: planDigest,
  plan: Object.freeze({
    schemaVersion: 6,
    id: runId,
    createdAt: at,
    expiresAt: "2026-07-25T12:05:00.000Z",
    adapter: {
      id: "portable-test",
      version: "1.0.0",
      hash: hashB,
    },
    operation: "records.write",
    risk: "R2",
    sideEffect: "writes one record",
    input: {},
    inputHash: hashC,
    dispatches: [{
      id: "records.write",
      description: "writes one record",
    }],
    auth: {
      id: "portable-auth",
      hash: hashA,
      kind: "cookies-file" as const,
    },
    transport: "portable-provider-plugin",
    portablePluginContract: identity,
  }),
});

function journalSnapshot(
  settled: boolean,
): RunJournalSnapshot {
  return {
    journal: {
      schemaVersion: 1,
      revision: settled ? 8 : 0,
      runId,
      planDigest,
      adapter: {
        id: "portable-test",
        version: "1.0.0",
        hash: hashB,
      },
      operation: "records.write",
      risk: "R2",
      inputHash: hashC,
      auth: {
        id: "portable-auth",
        hash: hashA,
        kind: "cookies-file",
      },
      contract: {
        transport: "portable-provider-plugin",
        identity,
      },
      planHasAssets: false,
      planState: settled ? "consumed" : "available",
      phase: settled ? "terminal" : "prepared",
      status: settled ? "partial" : "pending",
      dispatch: {
        planned: 2,
        started: settled ? 1 : 0,
        verified: settled ? 1 : 0,
      },
      ledgerRelativePath: settled ? "idempotency/example.json" : null,
      ledgerState: settled ? "partial" : "unclaimed",
      recoveryState: settled ? "released" : "absent",
      assetState: "none",
      owner: {
        pid: 123,
        token: runId,
        bootId: hashA,
        processStartId: hashB,
        leaseUntil: "2026-07-25T12:10:00.000Z",
      },
      startedAt: at,
      updatedAt: at,
      dedupeExpiresAt: "2026-07-25T12:10:00.000Z",
      finalOrigin: null,
      error: settled ? "requires reconciliation" : null,
    },
    contentSha256: hashC,
  };
}

const pendingReceipt: RunReceipt = Object.freeze({
  schemaVersion: 6,
  runId,
  planDigest,
  adapter: {
    id: "portable-test",
    version: "1.0.0",
    hash: hashB,
  },
  operation: "records.write",
  risk: "R2",
  inputHash: hashC,
  auth: {
    id: "portable-auth",
    hash: hashA,
    kind: "cookies-file" as const,
  },
  transport: "portable-provider-plugin",
  portablePluginContract: identity,
  status: "partial",
  dispatchStarted: true,
  dispatch: { planned: 2, started: 1, verified: 1 },
  startedAt: at,
  finishedAt: at,
  finalOrigin: null,
  error: "requires reconciliation",
});

const capsule: RecoveryCapsule = Object.freeze({
  schemaVersion: 1,
  runId,
  createdAt: at,
  planDigest,
  adapter: {
    id: "portable-test",
    version: "1.0.0",
    hash: hashB,
  },
  operation: "records.write",
  risk: "R2",
  input: {},
  inputHash: hashC,
  auth: {
    id: "portable-auth",
    hash: hashA,
    kind: "cookies-file" as const,
  },
  contract: {
    transport: "portable-provider-plugin" as const,
    identity,
  },
});

function linkedSnapshot(): LinkedDeviceLifecycleJournalSnapshot {
  return {
    journal: initialLinkedDeviceLifecycleJournal({
      journalId: runId,
      kind: "sync-once",
      pluginId: "portable-test",
      pluginVersion: "1.0.0",
      pluginImplementationHash: hashA,
      lifecycleContractVersion: 1,
      surfaceId: "portable-test",
      authId: "portable-auth",
      authRealmHash: hashB,
      authContentHash: hashC,
      initialSubjectState: "bound",
      phoneProvided: false,
      owner: {
        pid: 123,
        token: runId,
        bootId: hashA,
        processStartId: hashB,
        leaseUntil: "2026-07-25T12:10:00.000Z",
      },
      startedAt: at,
    }),
    contentSha256: hashA,
  };
}

function leaseSnapshot(): PortableProviderPluginInvocationLeaseSnapshot {
  return {
    lease: {
      schemaVersion: 1,
      leaseId: runId,
      runId,
      identity,
      owner: {
        pid: 123,
        token: runId,
        bootId: hashA,
        processStartId: hashB,
      },
      acquiredAt: at,
    },
    contentSha256: hashA,
  };
}

function confirmationClaim(): ConfirmationClaimSnapshot {
  return {
    claim: {
      schemaVersion: 1,
      digest: planDigest,
      runId,
      owner: {
        pid: 123,
        token: runId,
        bootId: hashA,
        processStartId: hashB,
        leaseUntil: "2026-07-25T12:10:00.000Z",
      },
      createdAt: at,
    },
    contentSha256: hashA,
  };
}

function dependencies(
  overrides: Partial<PortableProviderPluginQuiescenceDependencies> = {},
): PortableProviderPluginQuiescenceDependencies {
  return {
    listPlans: () => [],
    loadPlan: () => {
      throw new Error("unexpected plan load");
    },
    listConfirmationClaims: () => [],
    listInvocationLeases: () => [],
    invocationLeaseOwnerStatus: () => "different-or-dead",
    listStateDirectory: () => [],
    listReceipts: () => [],
    listJournals: () => [],
    listRecoveryCapsules: () => [],
    listLinkedDeviceLifecycles: () => [],
    ...overrides,
  };
}

const roots: string[] = [];

function environment(): Readonly<Record<string, string | undefined>> {
  const root = mkdtempSync(join(tmpdir(), "wrench-plugin-lifecycle-kernel-"));
  chmodSync(root, 0o700);
  roots.push(root);
  return { GHOSTGET_STATE_HOME: join(root, "wrench-home"), HOME: root };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("portable provider plugin lifecycle kernel", () => {
  test("fails closed on every malformed or unexpected durable coordinate", () => {
    const report = inspectPortableProviderPluginQuiescence(
      hashA,
      environment(),
      dependencies({
        listStateDirectory: () => [{
          name: "mystery",
          kind: "symbolic-link",
        }],
        listPlans: () => [{ digest: planDigest, invalid: true }],
        listConfirmationClaims: () => [{
          digest: planDigest,
          invalid: true,
        }],
        listInvocationLeases: () => [{
          leaseId: runId,
          invalid: true,
        }],
        listReceipts: () => [{ runId, invalid: true }],
        listJournals: () => [{ runId, invalid: true }],
        listRecoveryCapsules: () => [{ runId, invalid: true }],
        listLinkedDeviceLifecycles: () => [{
          journalId: runId,
          invalid: true,
        }],
      }),
    );
    expect(report.quiescent).toBeFalse();
    expect(new Set(report.blockers.map((blocker) => blocker.kind))).toEqual(
      new Set([
        "unexpected-state-entry",
        "invalid-plan",
        "invalid-confirmation-claim",
        "invalid-invocation-lease",
        "invalid-run-receipt",
        "invalid-run-journal",
        "invalid-recovery-capsule",
        "invalid-linked-device-lifecycle",
      ]),
    );
  });

  test("blocks every direct or indirect live reference to the exact bundle", () => {
    const report = inspectPortableProviderPluginQuiescence(
      hashA,
      environment(),
      dependencies({
        listPlans: () => [{
          digest: planDigest,
          createdAt: at,
          expiresAt: "2026-07-25T12:05:00.000Z",
          adapter: { id: "portable-test", version: "1.0.0" },
          operation: "records.write",
          risk: "R2",
          auth: { id: "portable-auth", kind: "cookies-file" },
        }],
        loadPlan: () => storedPlan,
        listConfirmationClaims: () => [confirmationClaim()],
        listInvocationLeases: () => [leaseSnapshot()],
        invocationLeaseOwnerStatus: () => "exact-live-owner",
        listReceipts: () => [pendingReceipt],
        listJournals: () => [journalSnapshot(false)],
        listRecoveryCapsules: () => [{ capsule }],
        listLinkedDeviceLifecycles: () => [linkedSnapshot()],
      }),
    );
    expect(report.quiescent).toBeFalse();
    expect(new Set(report.blockers.map((blocker) => blocker.kind))).toEqual(
      new Set([
        "invocation-lease",
        "confirmation-plan",
        "confirmation-claim",
        "run-journal",
        "run-receipt",
        "recovery-capsule",
        "linked-device-lifecycle",
      ]),
    );
  });

  test("blocks a matching v2 host-active tombstone with unknown ownership", () => {
    const activeLease: PortableProviderPluginInvocationLeaseSnapshot = {
      lease: {
        schemaVersion: 2,
        leaseId: runId,
        runId,
        identity,
        owner: {
          pid: 123,
          token: runId,
          bootId: hashA,
          processStartId: hashB,
        },
        acquiredAt: at,
        containment: {
          status: "host-active",
          host: {
            pid: 456,
            bootId: hashA,
            processStartId: hashC,
          },
        },
      },
      contentSha256: hashA,
    };
    const report = inspectPortableProviderPluginQuiescence(
      hashA,
      environment(),
      dependencies({
        listInvocationLeases: () => [activeLease],
        invocationLeaseOwnerStatus: () => "unknown",
      }),
    );

    expect(report).toMatchObject({
      quiescent: false,
      blockerCount: 1,
      blockers: [{
        kind: "invocation-lease",
        coordinate: runId,
      }],
    });
  });

  test("accepts historical receipts once their exact journal released recovery", () => {
    const report = inspectPortableProviderPluginQuiescence(
      hashA,
      environment(),
      dependencies({
        listInvocationLeases: () => [leaseSnapshot()],
        invocationLeaseOwnerStatus: () => "different-or-dead",
        listReceipts: () => [pendingReceipt],
        listJournals: () => [journalSnapshot(true)],
      }),
    );
    expect(report).toMatchObject({
      bundleSha256: hashA,
      quiescent: true,
      blockerCount: 0,
      blockers: [],
    });
  });

  test("whitelists the linked-device admission directory but inspects its exact shape", () => {
    const valid = inspectPortableProviderPluginQuiescence(
      hashA,
      environment(),
      dependencies({
        listStateDirectory: (path) => {
          if (path.endsWith("/run-journals")) {
            return [
              { name: "linked-device-lifecycle", kind: "directory" },
              {
                name: "linked-device-lifecycle-admissions",
                kind: "directory",
              },
            ];
          }
          if (path.endsWith("/linked-device-lifecycle-admissions")) {
            return [{ name: `${hashB}.json`, kind: "file" }];
          }
          return [];
        },
      }),
    );
    expect(valid).toMatchObject({
      quiescent: true,
      blockerCount: 0,
    });

    const invalid = inspectPortableProviderPluginQuiescence(
      hashA,
      environment(),
      dependencies({
        listStateDirectory: (path) =>
          path.endsWith("/linked-device-lifecycle-admissions")
            ? [{ name: "mystery", kind: "symbolic-link" }]
            : [],
      }),
    );
    expect(invalid.blockers).toContainEqual({
      kind: "unexpected-state-entry",
      coordinate: "linked-device lifecycle admissions/mystery",
      reason: "unexpected symbolic-link state can hide portable plugin ownership",
    });
  });
});

// ---------------------------------------------------------------------------
// A stateful model of lifecycle serialization.
//
// Each schedule adds and settles durable work for two bundles, including
// malformed entries whose ownership is unknown, and asks the kernel whether
// either bundle may change. The model states the law from `docs/plugins.md`
// independently of the kernel: a bundle may change only when it owns no live
// or unknown work. Its predicate is written from the claim, work item by work
// item, and every transition must agree with it exactly, both on the verdict
// and on the kinds of blocker reported.

type Bundle = "a" | "b";
const bundleHash = (bundle: Bundle): string => bundle === "a" ? hashA : hashB;

type Work =
  | { readonly kind: "lease"; readonly bundle: Bundle; readonly owner: "exact-live-owner" | "different-or-dead" | "unknown" }
  | { readonly kind: "plan"; readonly bundle: Bundle }
  | { readonly kind: "journal"; readonly bundle: Bundle; readonly state: "active" | "released" | "recovery-present" | "recovery-retained" | "asset-bound" }
  | { readonly kind: "receipt"; readonly bundle: Bundle; readonly status: "pending" | "partial" | "indeterminate" | "succeeded"; readonly journal: number | null }
  | { readonly kind: "claim"; readonly of: number }
  | { readonly kind: "capsule"; readonly bundle: Bundle }
  | { readonly kind: "linked"; readonly bundle: Bundle; readonly state: "active" | "succeeded" | "indeterminate" }
  | { readonly kind: "invalid"; readonly of: "plan" | "claim" | "lease" | "journal" | "receipt" | "capsule" | "linked" }
  | { readonly kind: "unexpected-entry" };

type Item = { readonly id: number; work: Work };
type LifecycleModel = { items: Item[]; next: number };
type LifecycleReal = { readonly environment: Readonly<Record<string, string | undefined>> };

const itemRunId = (id: number): string => `00000000-0000-4000-8000-${id.toString(16).padStart(12, "0")}`;
const itemDigest = (id: number): string => id.toString(16).padStart(64, "0");

function modelBlockers(model: Readonly<LifecycleModel>, target: Bundle): ReadonlySet<string> {
  const kinds = new Set<string>();
  const byId = new Map(model.items.map((item) => [item.id, item.work]));
  const owns = (work: Work | undefined): boolean =>
    work !== undefined && (work.kind === "plan" || work.kind === "journal") && work.bundle === target;
  for (const { work } of model.items) {
    switch (work.kind) {
      case "lease":
        if (work.bundle === target && work.owner !== "different-or-dead") kinds.add("invocation-lease");
        break;
      case "plan":
        if (work.bundle === target) kinds.add("confirmation-plan");
        break;
      case "journal":
        if (work.bundle === target && work.state !== "released") kinds.add("run-journal");
        break;
      case "receipt": {
        const journal = work.journal === null ? undefined : byId.get(work.journal);
        const settled = journal?.kind === "journal" && journal.bundle === target && journal.state === "released";
        if (work.bundle === target && work.status !== "succeeded" && !settled) kinds.add("run-receipt");
        break;
      }
      case "claim":
        if (owns(byId.get(work.of))) kinds.add("confirmation-claim");
        break;
      case "capsule":
        if (work.bundle === target) kinds.add("recovery-capsule");
        break;
      case "linked":
        if (work.bundle === target && work.state !== "succeeded") kinds.add("linked-device-lifecycle");
        break;
      case "invalid":
        kinds.add(`invalid-${({
          plan: "plan", claim: "confirmation-claim", lease: "invocation-lease", journal: "run-journal",
          receipt: "run-receipt", capsule: "recovery-capsule", linked: "linked-device-lifecycle",
        } as const)[work.of]}`);
        break;
      case "unexpected-entry":
        kinds.add("unexpected-state-entry");
        break;
    }
  }
  return kinds;
}

function identityFor(bundle: Bundle): PortableOperationIdentityV1 {
  return Object.freeze({ ...identity, bundleSha256: bundleHash(bundle) });
}

/** The durable listings the kernel reads, built from the model's items. */
/** What one injected listing returns. */
type Listed<Key extends keyof PortableProviderPluginQuiescenceDependencies> =
  PortableProviderPluginQuiescenceDependencies[Key] extends (...args: never[]) => infer Result ? Result : never;

function modelDependencies(model: Readonly<LifecycleModel>): PortableProviderPluginQuiescenceDependencies {
  const items = model.items;
  const journalOf = (id: number): number | null => {
    const work = items.find((item) => item.id === id)?.work;
    return work?.kind === "journal" ? id : null;
  };
  return dependencies({
    listStateDirectory: (path) => path.endsWith("/plans")
      ? items.filter((item) => item.work.kind === "unexpected-entry").map((item) => ({ name: `mystery-${String(item.id)}`, kind: "other" as const }))
      : [],
    listPlans: () => items.flatMap((item): Listed<"listPlans"> => {
      if (item.work.kind === "invalid" && item.work.of === "plan") return [{ digest: itemDigest(item.id), invalid: true as const }];
      if (item.work.kind !== "plan") return [];
      return [{
        digest: itemDigest(item.id), createdAt: at, expiresAt: "2026-07-25T12:05:00.000Z",
        adapter: { id: "portable-test", version: "1.0.0" }, operation: "records.write", risk: "R2" as const,
        auth: { id: "portable-auth", kind: "cookies-file" as const },
      }];
    }),
    loadPlan: (digestValue) => {
      const item = items.find((candidate) => itemDigest(candidate.id) === digestValue);
      if (item?.work.kind !== "plan") throw new Error("unexpected plan load");
      return {
        digest: digestValue,
        plan: { ...storedPlan.plan, portablePluginContract: identityFor(item.work.bundle) },
      } as StoredPlan;
    },
    listConfirmationClaims: () => items.flatMap((item): Listed<"listConfirmationClaims"> => {
      if (item.work.kind === "invalid" && item.work.of === "claim") return [{ digest: itemDigest(item.id), invalid: true as const }];
      if (item.work.kind !== "claim") return [];
      const base = confirmationClaim();
      const of = item.work.of;
      // A claim names its plan by digest, or its journal's run by run ID.
      const target = items.find((candidate) => candidate.id === of)?.work;
      return [{
        ...base,
        claim: {
          ...base.claim,
          digest: target?.kind === "plan" ? itemDigest(of) : itemDigest(item.id),
          runId: target?.kind === "journal" ? itemRunId(of) : itemRunId(item.id),
        },
      }];
    }),
    listInvocationLeases: () => items.flatMap((item): Listed<"listInvocationLeases"> => {
      if (item.work.kind === "invalid" && item.work.of === "lease") return [{ leaseId: itemRunId(item.id), invalid: true as const }];
      if (item.work.kind !== "lease") return [];
      const base = leaseSnapshot();
      return [{ ...base, lease: { ...base.lease, leaseId: itemRunId(item.id), identity: identityFor(item.work.bundle) } }];
    }),
    invocationLeaseOwnerStatus: (snapshot) => {
      const work = items.find((item) => itemRunId(item.id) === snapshot.lease.leaseId)?.work;
      if (work?.kind !== "lease") throw new Error("unexpected lease owner check");
      return work.owner;
    },
    listJournals: () => items.flatMap((item): Listed<"listJournals"> => {
      if (item.work.kind === "invalid" && item.work.of === "journal") return [{ runId: itemRunId(item.id), invalid: true as const }];
      if (item.work.kind !== "journal") return [];
      const state = item.work.state;
      const base = journalSnapshot(state !== "active");
      return [{
        ...base,
        journal: {
          ...base.journal,
          runId: itemRunId(item.id),
          planDigest: itemDigest(item.id),
          contract: { transport: "portable-provider-plugin" as const, identity: identityFor(item.work.bundle) },
          recoveryState: state === "recovery-present" ? "present" as const
            : state === "recovery-retained" ? "retained" as const
              : state === "active" ? "absent" as const : "released" as const,
          assetState: state === "asset-bound" ? "bound" as const : "none" as const,
        },
      } as RunJournalSnapshot];
    }),
    listReceipts: () => items.flatMap((item): Listed<"listReceipts"> => {
      if (item.work.kind === "invalid" && item.work.of === "receipt") return [{ runId: itemRunId(item.id), invalid: true as const }];
      if (item.work.kind !== "receipt") return [];
      const journal = item.work.journal === null ? null : journalOf(item.work.journal);
      return [{
        ...pendingReceipt,
        runId: itemRunId(journal ?? item.id),
        planDigest: itemDigest(journal ?? item.id),
        portablePluginContract: identityFor(item.work.bundle),
        status: item.work.status,
      } as RunReceipt];
    }),
    listRecoveryCapsules: () => items.flatMap((item): Listed<"listRecoveryCapsules"> => {
      if (item.work.kind === "invalid" && item.work.of === "capsule") return [{ runId: itemRunId(item.id), invalid: true as const }];
      if (item.work.kind !== "capsule") return [];
      return [{
        capsule: {
          ...capsule,
          runId: itemRunId(item.id),
          contract: { transport: "portable-provider-plugin" as const, identity: identityFor(item.work.bundle) },
        },
      }];
    }),
    listLinkedDeviceLifecycles: () => items.flatMap((item): Listed<"listLinkedDeviceLifecycles"> => {
      if (item.work.kind === "invalid" && item.work.of === "linked") return [{ journalId: itemRunId(item.id), invalid: true as const }];
      if (item.work.kind !== "linked") return [];
      const base = linkedSnapshot();
      const state = item.work.state;
      return [{
        ...base,
        journal: {
          ...base.journal,
          journalId: itemRunId(item.id),
          pluginImplementationHash: bundleHash(item.work.bundle),
          ...(state === "active" ? {} : { phase: "terminal", status: state }),
        },
      } as LinkedDeviceLifecycleJournalSnapshot];
    }),
  });
}

class AddWork implements Command<LifecycleModel, LifecycleReal> {
  constructor(readonly work: (model: Readonly<LifecycleModel>) => Work) {}
  check(): boolean {
    return true;
  }
  run(model: LifecycleModel): void {
    const work = this.work(model);
    model.items.push({ id: model.next, work });
    model.next += 1;
    this.described = JSON.stringify(work);
  }
  described = "?";
  toString(): string {
    return `AddWork(${this.described})`;
  }
}

/** Finish or discard one item, which is how work stops blocking. */
class SettleWork implements Command<LifecycleModel, LifecycleReal> {
  constructor(readonly pick: number, readonly discard: boolean) {}
  check(model: Readonly<LifecycleModel>): boolean {
    return model.items.length > 0;
  }
  run(model: LifecycleModel): void {
    const index = this.pick % model.items.length;
    const item = model.items[index]!;
    if (!this.discard && item.work.kind === "journal") item.work = { ...item.work, state: "released" };
    else if (!this.discard && item.work.kind === "lease") item.work = { ...item.work, owner: "different-or-dead" };
    else if (!this.discard && item.work.kind === "linked") item.work = { ...item.work, state: "succeeded" };
    else model.items.splice(index, 1);
  }
  toString(): string {
    return `SettleWork(${String(this.pick)}, ${String(this.discard)})`;
  }
}

/** Ask whether a bundle may be updated, disabled, or removed. */
class Transition implements Command<LifecycleModel, LifecycleReal> {
  constructor(readonly target: Bundle) {}
  check(): boolean {
    return true;
  }
  run(model: LifecycleModel, real: LifecycleReal): void {
    const expected = modelBlockers(model, this.target);
    const report = inspectPortableProviderPluginQuiescence(bundleHash(this.target), real.environment, modelDependencies(model));
    expect(new Set<string>(report.blockers.map((blocker) => blocker.kind))).toEqual(new Set<string>(expected));
    expect(report.quiescent).toBe(expected.size === 0);
  }
  toString(): string {
    return `Transition(${this.target})`;
  }
}

const bundleArbitrary = fc.constantFrom<Bundle>("a", "b");
const workArbitrary = fc.oneof(
  fc.tuple(bundleArbitrary, fc.constantFrom("exact-live-owner", "different-or-dead", "unknown") as fc.Arbitrary<"exact-live-owner" | "different-or-dead" | "unknown">)
    .map(([bundle, owner]) => (): Work => ({ kind: "lease", bundle, owner })),
  bundleArbitrary.map((bundle) => (): Work => ({ kind: "plan", bundle })),
  fc.tuple(bundleArbitrary, fc.constantFrom("active", "released", "recovery-present", "recovery-retained", "asset-bound") as fc.Arbitrary<"active" | "released" | "recovery-present" | "recovery-retained" | "asset-bound">)
    .map(([bundle, state]) => (): Work => ({ kind: "journal", bundle, state })),
  fc.tuple(bundleArbitrary, fc.constantFrom("pending", "partial", "indeterminate", "succeeded") as fc.Arbitrary<"pending" | "partial" | "indeterminate" | "succeeded">, fc.nat())
    .map(([bundle, status, pick]) => (model: Readonly<LifecycleModel>): Work => {
      // A receipt belongs to a journal of its own bundle when one exists.
      const journals = model.items.filter((item) => item.work.kind === "journal" && item.work.bundle === bundle);
      return { kind: "receipt", bundle, status, journal: journals.length === 0 ? null : journals[pick % journals.length]!.id };
    }),
  fc.nat().map((pick) => (model: Readonly<LifecycleModel>): Work => {
    const owners = model.items.filter((item) => item.work.kind === "plan" || item.work.kind === "journal");
    return owners.length === 0 ? { kind: "unexpected-entry" } : { kind: "claim", of: owners[pick % owners.length]!.id };
  }),
  bundleArbitrary.map((bundle) => (): Work => ({ kind: "capsule", bundle })),
  fc.tuple(bundleArbitrary, fc.constantFrom("active", "succeeded", "indeterminate") as fc.Arbitrary<"active" | "succeeded" | "indeterminate">)
    .map(([bundle, state]) => (): Work => ({ kind: "linked", bundle, state })),
  fc.constantFrom("plan", "claim", "lease", "journal", "receipt", "capsule", "linked")
    .map((of) => (): Work => ({ kind: "invalid", of: of as "plan" })),
  fc.constant((): Work => ({ kind: "unexpected-entry" })),
);

const lifecycleCommands = fc.commands([
  workArbitrary.map((work) => new AddWork(work)),
  fc.tuple(fc.nat(), fc.boolean()).map(([pick, discard]) => new SettleWork(pick, discard)),
  bundleArbitrary.map((bundle) => new Transition(bundle)),
], { maxCommands: 24, size: "max" });

describe("portable provider plugin lifecycle model", () => {
  // The model's shrink against a kernel that ignored retained recovery:
  // a journal that retains recovery, and a pending receipt of its run.
  test("a terminal journal that retains recovery blocks, and so does its pending receipt", () => {
    const model: LifecycleModel = {
      items: [
        { id: 1, work: { kind: "journal", bundle: "a", state: "recovery-retained" } },
        { id: 2, work: { kind: "receipt", bundle: "a", status: "pending", journal: 1 } },
      ],
      next: 3,
    };
    const report = inspectPortableProviderPluginQuiescence(hashA, environment(), modelDependencies(model));
    expect(report.quiescent).toBeFalse();
    expect(new Set(report.blockers.map((blocker) => blocker.kind))).toEqual(new Set(["run-journal", "run-receipt"]));
  });


  test("a bundle may change exactly when it owns no live or unknown work", () => {
    const real = { environment: environment() };
    assertProperty(fc.property(lifecycleCommands, (commands) => {
      fc.modelRun(() => ({ model: { items: [], next: 1 }, real }), [...commands, new Transition("a"), new Transition("b")]);
    }));
  });
});
