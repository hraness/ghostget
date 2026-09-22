/**
 * Closed vocabularies shared by the contract documents.
 *
 * Every value is derived from, or type-bound to, the runtime source it
 * projects, so a change in the runtime union fails typechecking here instead of
 * silently widening a published contract. This module has no runtime imports.
 */
import type { GhostgetClientInvocationResult } from "./client-types";
import type { ReadFailureProjection } from "./web-session-execution";

export const CONTRACT_CATALOG_V1 = "ghostget.contract-catalog.v1" as const;
export const CONTRACT_CHECK_V1 = "ghostget.contract-check.v1" as const;
export const COLLECTION_PLAN_SCHEMA_VERSION = 1 as const;

export const operationRisks = Object.freeze(["R1", "R2", "R3", "R4"] as const);
export type ContractOperationRisk = (typeof operationRisks)[number];

export const contractStates = Object.freeze(["observed", "capture-required"] as const);
export type ContractState = (typeof contractStates)[number];

export const contractTransports = Object.freeze([
  "web-session-api",
  "provider-api",
  "local-cli",
  "reviewed-template-api",
] as const);
export type ContractTransport = (typeof contractTransports)[number];

export const operationAuthorities = Object.freeze(["public", "auth"] as const);
export type OperationAuthority = (typeof operationAuthorities)[number];

export const idempotencyKinds = Object.freeze(["none", "local-at-most-once"] as const);
export type ContractIdempotencyKind = (typeof idempotencyKinds)[number];

export type ReadFailureCategory = ReadFailureProjection["category"];
export type RetryDisposition = ReadFailureProjection["retryDisposition"];

/**
 * Category-exact dispositions. The mapped type binds each category to the one
 * disposition `src/web-session-execution.ts` assigns it, so drift fails to
 * compile; the runtime parity test replays the same table.
 */
type ReadFailureDispositionTable = {
  readonly [P in ReadFailureProjection as P["category"]]: P["retryDisposition"];
};

export const readFailureDispositions: Readonly<Record<ReadFailureCategory, RetryDisposition>> =
  Object.freeze({
    "target-unavailable": "do-not-retry",
    "auth-repair-required": "repair-auth",
    "account-mismatch": "do-not-retry",
    "contract-drift": "do-not-retry",
    "cleanup-required": "do-not-retry",
    "provider-throttled": "retry-once-after-60s",
    "provider-temporary": "retry-once-after-60s",
    "operation-timeout": "retry-once-after-60s",
  } satisfies ReadFailureDispositionTable);

export const readFailureCategories = Object.freeze(
  Object.keys(readFailureDispositions) as readonly ReadFailureCategory[],
);

export const retryDispositions = Object.freeze([
  "do-not-retry",
  "repair-auth",
  "retry-once-after-60s",
] as const satisfies readonly RetryDisposition[]);

/**
 * Statuses of the R1 `ghostget invoke … --json` envelope. The read program in
 * `src/invocation-read-program.ts` coerces every other execution status to
 * `failed`, and `src/client-types.ts` pins the same union for SDK consumers.
 */
const invokeStatusTable = Object.freeze({
  succeeded: true,
  failed: true,
} satisfies Readonly<Record<GhostgetClientInvocationResult["status"], true>>);
export const invokeStatuses = Object.freeze(
  Object.keys(invokeStatusTable) as readonly GhostgetClientInvocationResult["status"][],
);
export type InvokeStatus = (typeof invokeStatuses)[number];

export const contractGapReasons = Object.freeze([
  "adapter-missing",
  "adapter-invalid",
  "operation-missing",
  "state-mismatch",
  "risk-mismatch",
  "side-effect-mismatch",
  "authority-mismatch",
  "input-invalid",
  "auth-missing",
  "transport-disabled",
] as const);
export type ContractGapReason = (typeof contractGapReasons)[number];

export const contractSchemaNames = Object.freeze([
  "catalog",
  "check",
  "plan",
  "invoke-read",
  "repair",
] as const);
export type ContractSchemaName = (typeof contractSchemaNames)[number];

/** Patterns shared by several documents; each is also the JSON Schema `pattern`. */
export const contractPatterns = Object.freeze({
  /** Adapter and auth locator IDs as `ghostget invoke` accepts them. */
  adapterId: /^[a-z][a-z0-9-]{0,47}$/u,
  authId: /^[a-z][a-z0-9-]{0,47}$/u,
  /** Two to four strict kebab-case segments, as `isProviderPluginOperationName` requires. */
  operationId: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*){1,3}$/u,
  surfaceId: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u,
  sha256: /^[a-f0-9]{64}$/u,
  semanticVersion: /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u,
  kebabKey: /^[a-z0-9]+(?:-[a-z0-9]+)*$/u,
  metricKey: /^[a-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$/u,
  inputFieldName: /^[a-z][a-z0-9_]{0,63}$/u,
  httpsOrigin: /^https:\/\/[^/?#\s]+$/u,
  httpsUrl: /^https:\/\/[^\s]+$/u,
  runId: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
});
