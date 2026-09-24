import { join } from "node:path";

import { loadAuth } from "./auth";
import {
  canonicalJson,
  isCanonicalJsonFileText,
  sha256,
} from "./canonical-json";
import {
  parsePortableOperationIdentityV1,
  type PortableOperationIdentityV1,
} from "./provider-plugin-portable-identity";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";
import {
  readRecoveryCapsule,
  recoveryAuthContinuity,
  recoveryContractHash,
  type RecoveryCapsule,
} from "./recovery";
import {
  readRunReceipt,
  releaseReconciledRunRecovery,
  type RunReceipt,
} from "./runtime";
import {
  createPrivateJsonIfAbsent,
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  readPrivateStateFileIfPresent,
} from "./storage";

type Environment = Readonly<Record<string, string | undefined>>;
type PortableReceipt = Extract<
  RunReceipt,
  { readonly schemaVersion: 6 }
>;
type RecoverablePortableReceipt = PortableReceipt & {
  readonly risk: "R2" | "R3";
  readonly planDigest: string;
};

const RESOLUTION_DIRECTORY = "recovery/portable-resolutions";
const NOT_APPLIED_CLAIM_DIRECTORY = "recovery/portable-not-applied-claims";
const MAX_RECORD_BYTES = 32 * 1024;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const runIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type PortableRunReconciliationInput = {
  readonly outcome: "applied" | "not-applied";
  readonly evidenceHash: string;
};

/**
 * The create-once record that settles a run as applied. Before caller claims
 * were fenced, `not-applied` was also written here and released the ledger.
 * Those historical records stay readable, but Ghostget never writes one again.
 */
export type PortableRunResolutionV1 = {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly resolvedAt: string;
  readonly receiptHash: string;
  readonly planDigest: string;
  readonly adapterHash: string;
  readonly inputHash: string;
  readonly authHash: string;
  readonly contractHash: string;
  readonly portablePluginContract: PortableOperationIdentityV1;
  readonly outcome: PortableRunReconciliationInput["outcome"];
  readonly evidenceHash: string;
};

/**
 * A caller's create-once `not-applied` assertion. Ghostget did not observe the
 * provider state, so the claim is kept on record only. It never releases the
 * ledger, the recovery capsule, or the plugin bundle.
 */
export type PortableRunNotAppliedClaimV1 = {
  readonly schemaVersion: 1;
  readonly kind: "caller-asserted-not-applied";
  readonly runId: string;
  readonly claimedAt: string;
  readonly receiptHash: string;
  readonly planDigest: string;
  readonly adapterHash: string;
  readonly inputHash: string;
  readonly authHash: string;
  readonly contractHash: string;
  readonly portablePluginContract: PortableOperationIdentityV1;
  readonly evidenceHash: string;
};

type ReconcilePortableRunCommon = {
  readonly kind: "portable-provider-plugin-reconciliation";
  readonly runId: string;
  readonly originalReceiptStatus: PortableReceipt["status"];
  readonly receiptUnchanged: true;
  readonly providerWriteDispatched: false;
  readonly evidenceHash: string;
};

export type ReconcilePortableRunResult =
  | ReconcilePortableRunCommon & {
    readonly ok: true;
    readonly outcome: "applied";
    readonly status: "succeeded";
    readonly recoveryArtifactsReleased: true;
  }
  | ReconcilePortableRunCommon & {
    readonly ok: false;
    readonly outcome: "not-applied";
    readonly status: "fence-retained";
    readonly claimRecorded: true;
    readonly recoveryArtifactsReleased: false;
  };

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length
    || keys.some((key) =>
      typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    throw new Error(`${label} has unsupported fields`);
  }
  const result: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      throw new Error(`${label} has unsupported accessor fields`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

export function parsePortableRunReconciliationInput(
  value: unknown,
): PortableRunReconciliationInput {
  const record = strictRecord(
    value,
    ["outcome", "evidenceHash"],
    "portable run reconciliation input",
  );
  if (
    (record.outcome !== "applied" && record.outcome !== "not-applied")
    || typeof record.evidenceHash !== "string"
    || !sha256Pattern.test(record.evidenceHash)
  ) {
    throw new Error("portable run reconciliation input is malformed");
  }
  return Object.freeze({
    outcome: record.outcome,
    evidenceHash: record.evidenceHash,
  });
}

function canonicalTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} timestamp is malformed`);
  }
  return value;
}

const BOUND_HASH_FIELDS = [
  ["receipt", "receiptHash"],
  ["plan", "planDigest"],
  ["adapter", "adapterHash"],
  ["input", "inputHash"],
  ["auth", "authHash"],
  ["contract", "contractHash"],
  ["evidence", "evidenceHash"],
] as const;

function assertBoundHashes(
  record: Readonly<Record<string, unknown>>,
  label: string,
): void {
  for (const [name, key] of BOUND_HASH_FIELDS) {
    const candidate = record[key];
    if (typeof candidate !== "string" || !sha256Pattern.test(candidate)) {
      throw new Error(`${label} ${name} hash is malformed`);
    }
  }
}

function parseResolution(value: unknown): PortableRunResolutionV1 {
  const record = strictRecord(
    value,
    [
      "schemaVersion",
      "runId",
      "resolvedAt",
      "receiptHash",
      "planDigest",
      "adapterHash",
      "inputHash",
      "authHash",
      "contractHash",
      "portablePluginContract",
      "outcome",
      "evidenceHash",
    ],
    "portable run resolution",
  );
  if (
    record.schemaVersion !== 1
    || typeof record.runId !== "string"
    || !runIdPattern.test(record.runId)
    || (
      record.outcome !== "applied"
      && record.outcome !== "not-applied"
    )
  ) {
    throw new Error("portable run resolution is malformed");
  }
  assertBoundHashes(record, "portable run resolution");
  return Object.freeze({
    schemaVersion: 1,
    runId: record.runId,
    resolvedAt: canonicalTimestamp(
      record.resolvedAt,
      "portable run resolution",
    ),
    receiptHash: record.receiptHash as string,
    planDigest: record.planDigest as string,
    adapterHash: record.adapterHash as string,
    inputHash: record.inputHash as string,
    authHash: record.authHash as string,
    contractHash: record.contractHash as string,
    portablePluginContract: parsePortableOperationIdentityV1(
      record.portablePluginContract,
    ),
    outcome: record.outcome,
    evidenceHash: record.evidenceHash as string,
  });
}

export function parsePortableRunNotAppliedClaim(
  value: unknown,
): PortableRunNotAppliedClaimV1 {
  const label = "portable run not-applied claim";
  const record = strictRecord(
    value,
    [
      "schemaVersion",
      "kind",
      "runId",
      "claimedAt",
      "receiptHash",
      "planDigest",
      "adapterHash",
      "inputHash",
      "authHash",
      "contractHash",
      "portablePluginContract",
      "evidenceHash",
    ],
    label,
  );
  if (
    record.schemaVersion !== 1
    || record.kind !== "caller-asserted-not-applied"
    || typeof record.runId !== "string"
    || !runIdPattern.test(record.runId)
  ) {
    throw new Error(`${label} is malformed`);
  }
  assertBoundHashes(record, label);
  return Object.freeze({
    schemaVersion: 1,
    kind: "caller-asserted-not-applied",
    runId: record.runId,
    claimedAt: canonicalTimestamp(record.claimedAt, label),
    receiptHash: record.receiptHash as string,
    planDigest: record.planDigest as string,
    adapterHash: record.adapterHash as string,
    inputHash: record.inputHash as string,
    authHash: record.authHash as string,
    contractHash: record.contractHash as string,
    portablePluginContract: parsePortableOperationIdentityV1(
      record.portablePluginContract,
    ),
    evidenceHash: record.evidenceHash as string,
  });
}

function recordDirectory(directory: string, environment: Environment): string {
  return join(ghostgetStateHome(environment), ...directory.split("/"));
}

function recordPath(
  directory: string,
  runId: string,
  environment: Environment,
): string {
  if (!runIdPattern.test(runId)) {
    throw new Error("portable reconciliation run ID is malformed");
  }
  return join(recordDirectory(directory, environment), `${runId}.json`);
}

function readRunRecord<Value extends { readonly runId: string }>(
  directory: string,
  runId: string,
  label: string,
  parse: (value: unknown) => Value,
  environment: Environment,
): Value | null {
  const text = readPrivateStateFileIfPresent(
    recordPath(directory, runId, environment),
    MAX_RECORD_BYTES,
    label,
    environment,
  );
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is malformed JSON`);
  }
  const record = parse(value);
  if (record.runId !== runId || !isCanonicalJsonFileText(text, record)) {
    throw new Error(`${label} does not match its durable coordinate`);
  }
  return record;
}

/** Publish a create-once run record, or return the one that already exists. */
function publishRunRecordOnce<Value extends { readonly runId: string }>(
  directory: string,
  record: Value,
  label: string,
  parse: (value: unknown) => Value,
  environment: Environment,
): Value {
  const directoryIdentity = ensurePrivateStateDirectory(
    recordDirectory(directory, environment),
    environment,
  );
  const created = createPrivateJsonIfAbsent(
    recordPath(directory, record.runId, environment),
    record,
    {
      environment,
      expectedStateParent: directoryIdentity,
    },
  );
  if (created.created) return record;
  const existing = readRunRecord(
    directory,
    record.runId,
    label,
    parse,
    environment,
  );
  if (existing === null) {
    throw new Error(`${label} disappeared during publication`);
  }
  return existing;
}

export function readPortableRunResolution(
  runId: string,
  environment: Environment = process.env,
): PortableRunResolutionV1 | null {
  return readRunRecord(
    RESOLUTION_DIRECTORY,
    runId,
    "portable run resolution",
    parseResolution,
    environment,
  );
}

export function readPortableRunNotAppliedClaim(
  runId: string,
  environment: Environment = process.env,
): PortableRunNotAppliedClaimV1 | null {
  return readRunRecord(
    NOT_APPLIED_CLAIM_DIRECTORY,
    runId,
    "portable run not-applied claim",
    parsePortableRunNotAppliedClaim,
    environment,
  );
}

function assertPortableReceipt(
  receipt: RunReceipt,
): asserts receipt is RecoverablePortableReceipt {
  if (
    receipt.schemaVersion !== 6
    || receipt.transport !== "portable-provider-plugin"
  ) {
    throw new Error(
      "portable reconciliation requires a portable provider plugin run",
    );
  }
  if (
    receipt.status !== "partial"
    && receipt.status !== "indeterminate"
  ) {
    throw new Error(
      "only an unsettled portable provider plugin run can be reconciled",
    );
  }
  if (
    (receipt.risk !== "R2" && receipt.risk !== "R3")
    || receipt.planDigest === null
    || receipt.dispatch.started < 1
    || receipt.dispatch.started > receipt.dispatch.planned
    || receipt.dispatch.verified < 0
    || receipt.dispatch.verified > receipt.dispatch.started
  ) {
    throw new Error(
      "portable run has no exact recoverable write schedule",
    );
  }
}

function assertCurrentContract(
  receipt: PortableReceipt,
  registry: ProviderPluginRegistry,
): void {
  const identity = receipt.portablePluginContract;
  const resolution = registry.requireOperationDefinition(
    identity.transport,
    identity.surfaceId,
    identity.operation,
    identity.contractVersion,
  );
  if (
    resolution.portableIdentity === null
    || canonicalJson(resolution.portableIdentity) !== canonicalJson(identity)
  ) {
    throw new Error(
      "portable plugin artifact or operation no longer matches the unsettled run",
    );
  }
}

function assertCapsuleMatchesReceipt(
  receipt: RecoverablePortableReceipt,
  environment: Environment,
): RecoveryCapsule {
  const capsule = readRecoveryCapsule(
    receipt.runId,
    receipt.auth.id,
    receipt.auth.hash,
    environment,
  );
  if (
    capsule === null
    || capsule.runId !== receipt.runId
    || capsule.planDigest !== receipt.planDigest
    || canonicalJson(capsule.adapter) !== canonicalJson(receipt.adapter)
    || capsule.operation !== receipt.operation
    || capsule.risk !== receipt.risk
    || capsule.inputHash !== receipt.inputHash
    || canonicalJson(capsule.auth) !== canonicalJson(receipt.auth)
    || capsule.contract.transport !== "portable-provider-plugin"
    || canonicalJson(capsule.contract.identity)
      !== canonicalJson(receipt.portablePluginContract)
  ) {
    throw new Error(
      "encrypted recovery capsule does not match the portable run receipt",
    );
  }
  return capsule;
}

/**
 * Bind a first record to the exact current contract, auth locator, and
 * encrypted recovery capsule of the unsettled run.
 */
function assertRunStillBound(
  receipt: RecoverablePortableReceipt,
  registry: ProviderPluginRegistry,
  environment: Environment,
): void {
  assertCurrentContract(receipt, registry);
  const capsule = assertCapsuleMatchesReceipt(receipt, environment);
  // A reconnect of the same provider subject may stand in for the run's
  // exact auth record; see recoveryAuthContinuity.
  const auth = loadAuth(receipt.auth.id, environment);
  if (
    recoveryAuthContinuity(capsule.auth, capsule.authSubject, auth) === null
  ) {
    throw new Error(
      "current auth locator no longer matches the unsettled portable run",
    );
  }
}

function recordTimestamp(now: Date): string {
  if (!Number.isFinite(now.valueOf())) {
    throw new Error("portable reconciliation clock is invalid");
  }
  return now.toISOString();
}

function runBinding(receipt: RecoverablePortableReceipt) {
  return {
    runId: receipt.runId,
    receiptHash: sha256(canonicalJson(receipt)),
    planDigest: receipt.planDigest,
    adapterHash: receipt.adapter.hash,
    inputHash: receipt.inputHash,
    authHash: receipt.auth.hash,
    contractHash: recoveryContractHash({
      transport: "portable-provider-plugin",
      identity: receipt.portablePluginContract,
    }),
    portablePluginContract: receipt.portablePluginContract,
  };
}

function appliedResolutionFor(
  receipt: RecoverablePortableReceipt,
  evidenceHash: string,
  now: Date,
): PortableRunResolutionV1 {
  return parseResolution({
    schemaVersion: 1,
    ...runBinding(receipt),
    resolvedAt: recordTimestamp(now),
    outcome: "applied",
    evidenceHash,
  });
}

function notAppliedClaimFor(
  receipt: RecoverablePortableReceipt,
  evidenceHash: string,
  now: Date,
): PortableRunNotAppliedClaimV1 {
  return parsePortableRunNotAppliedClaim({
    schemaVersion: 1,
    kind: "caller-asserted-not-applied",
    ...runBinding(receipt),
    claimedAt: recordTimestamp(now),
    evidenceHash,
  });
}

function assertResolutionMatches(
  current: PortableRunResolutionV1,
  expected: PortableRunResolutionV1,
): void {
  const currentComparable = {
    ...current,
    resolvedAt: expected.resolvedAt,
  };
  if (canonicalJson(currentComparable) !== canonicalJson(expected)) {
    throw new Error(
      "portable run is already resolved with different evidence or outcome",
    );
  }
}

/**
 * Keep a caller's `not-applied` assertion without acting on it. The caller
 * typed the evidence hash, and a provider's current absence of a target does
 * not prove that an earlier write never applied. Only evidence that Ghostget
 * observes itself, or an owner approval, could release the fence, and the
 * portable protocol has neither, so the ledger, capsule, and journal stay
 * exactly as they are.
 */
function recordNotAppliedClaim(
  receipt: RecoverablePortableReceipt,
  evidenceHash: string,
  registry: ProviderPluginRegistry,
  environment: Environment,
  now: Date,
): void {
  if (receipt.dispatch.verified !== 0) {
    throw new Error(
      "a not-applied claim contradicts a verified dispatch of this portable run",
    );
  }
  if (readPortableRunResolution(receipt.runId, environment) !== null) {
    throw new Error(
      "portable run already has a durable resolution; a not-applied claim cannot change it",
    );
  }
  const expected = notAppliedClaimFor(receipt, evidenceHash, now);
  let claim = readPortableRunNotAppliedClaim(receipt.runId, environment);
  if (claim === null) {
    assertRunStillBound(receipt, registry, environment);
    claim = publishRunRecordOnce(
      NOT_APPLIED_CLAIM_DIRECTORY,
      expected,
      "portable run not-applied claim",
      parsePortableRunNotAppliedClaim,
      environment,
    );
  }
  if (
    canonicalJson({ ...claim, claimedAt: expected.claimedAt })
      !== canonicalJson(expected)
  ) {
    throw new Error(
      "a different not-applied claim is already recorded for this portable run",
    );
  }
}

/**
 * Reconcile an unsettled portable write from explicit external evidence.
 *
 * `applied` settles the run: Ghostget publishes a create-once resolution,
 * releases the recovery material, and keeps the at-most-once ledger, so the
 * same intent stays refused. A caller-asserted `not-applied` is recorded as a
 * create-once claim and reported as `fence-retained`; it releases nothing.
 * Neither outcome starts plugin code, calls a provider, or changes the receipt.
 */
export function reconcilePortableProviderPluginRun(
  runId: string,
  inputValue: unknown,
  options: {
    readonly registry: ProviderPluginRegistry;
    readonly environment?: Environment;
    readonly now?: Date;
  },
): ReconcilePortableRunResult {
  const input = parsePortableRunReconciliationInput(inputValue);
  const environment = options.environment ?? process.env;
  const now = options.now ?? new Date();
  const receipt = readRunReceipt(runId, environment);
  assertPortableReceipt(receipt);
  if (input.outcome === "not-applied") {
    recordNotAppliedClaim(
      receipt,
      input.evidenceHash,
      options.registry,
      environment,
      now,
    );
    return Object.freeze({
      ok: false,
      kind: "portable-provider-plugin-reconciliation",
      runId: receipt.runId,
      originalReceiptStatus: receipt.status,
      receiptUnchanged: true,
      providerWriteDispatched: false,
      outcome: "not-applied",
      status: "fence-retained",
      evidenceHash: input.evidenceHash,
      claimRecorded: true,
      recoveryArtifactsReleased: false,
    });
  }
  const expected = appliedResolutionFor(receipt, input.evidenceHash, now);
  let resolution = readPortableRunResolution(runId, environment);
  if (resolution === null) {
    assertRunStillBound(receipt, options.registry, environment);
    resolution = publishRunRecordOnce(
      RESOLUTION_DIRECTORY,
      expected,
      "portable run resolution",
      parseResolution,
      environment,
    );
  }
  assertResolutionMatches(resolution, expected);
  try {
    const released = releaseReconciledRunRecovery(
      receipt.runId,
      expected.receiptHash,
      environment,
      now,
    );
    if (released !== "journal-released") {
      throw new Error(
        "portable run is missing its mandatory recovery journal",
      );
    }
  } catch (error) {
    throw new Error(
      "portable run evidence was stored, but recovery artifacts could not be fully released; rerun reconciliation",
      { cause: error },
    );
  }
  return Object.freeze({
    ok: true,
    kind: "portable-provider-plugin-reconciliation",
    runId: receipt.runId,
    originalReceiptStatus: receipt.status,
    receiptUnchanged: true,
    providerWriteDispatched: false,
    outcome: "applied",
    status: "succeeded",
    evidenceHash: input.evidenceHash,
    recoveryArtifactsReleased: true,
  });
}
