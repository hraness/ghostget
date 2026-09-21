/**
 * `ghostget.contract-check.v1`: the verdict of one collection plan against one
 * contract catalog. `checkCollectionPlan` is the pure function the CLI uses;
 * it never reads a provider, binds an account, or prints a subject.
 */
import {
  CONTRACT_CHECK_V1,
  contractGapReasons,
  contractPatterns,
  contractTransports,
  operationAuthorities,
  type ContractGapReason,
  type ContractTransport,
  type OperationAuthority,
} from "./contracts-vocabulary";
import {
  isInvalidCatalogAdapter,
  type ContractCatalogAdapter,
  type ContractCatalogOperation,
  type ContractCatalogV1,
} from "./contracts-catalog";
import {
  COLLECTION_PLAN_MAX_READS,
  collectionPlanReads,
  type CollectionPlanV1,
  type CollectionRead,
} from "./contracts-plan";
import {
  ContractParseError,
  parseShape,
  type Shape,
} from "./contracts-shape";
import { validateOperationInput } from "./model";

export type ContractCheckBinding = {
  readonly adapterVersion: string;
  readonly contractVersion: number;
  readonly contractHash: string;
  readonly transport: ContractTransport;
  readonly authority: OperationAuthority;
};

export type ContractCheckGap = {
  readonly reason: ContractGapReason;
  readonly detail: string;
};

type ContractCheckReadCommon = {
  readonly index: number;
  readonly accountKey: string;
  readonly adapter: string;
  readonly operation: string;
};

export type ContractCheckRead = ContractCheckReadCommon & (
  | { readonly verdict: "ok"; readonly binding: ContractCheckBinding }
  | { readonly verdict: "gap"; readonly gap: ContractCheckGap }
);

export type ContractCheckV1 = {
  readonly ok: boolean;
  readonly contract: typeof CONTRACT_CHECK_V1;
  readonly ghostget: { readonly version: string };
  readonly plan: { readonly collectionKey: string; readonly reads: number };
  readonly reads: readonly ContractCheckRead[];
};

export type CheckCollectionPlanOptions = {
  /**
   * Auth locator IDs present in the local auth store. When supplied, a read
   * whose `auth` authority names a locator outside this list is an
   * `auth-missing` gap. When omitted, auth presence is not checked.
   */
  readonly storedAuthIds?: readonly string[];
};

const MAX_DETAIL_LENGTH = 2_000;

const readCommon = {
  index: { kind: "integer", minimum: 0, maximum: COLLECTION_PLAN_MAX_READS - 1 },
  accountKey: { kind: "string", minLength: 1, maxLength: 128, pattern: contractPatterns.kebabKey },
  adapter: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
  operation: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
} satisfies Readonly<Record<string, Shape>>;

export const checkShape: Shape = {
  kind: "object",
  properties: {
    ok: { kind: "boolean", description: "True only when every read is `ok`." },
    contract: { kind: "literal", value: CONTRACT_CHECK_V1 },
    ghostget: {
      kind: "object",
      properties: {
        version: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
      },
    },
    plan: {
      kind: "object",
      properties: {
        collectionKey: { kind: "string", minLength: 1, maxLength: 128, pattern: contractPatterns.kebabKey },
        reads: { kind: "integer", minimum: 0, maximum: COLLECTION_PLAN_MAX_READS },
      },
    },
    reads: {
      kind: "array",
      items: {
        kind: "union",
        variants: [
          {
            kind: "object",
            properties: {
              ...readCommon,
              verdict: { kind: "literal", value: "ok" },
              binding: {
                kind: "object",
                properties: {
                  adapterVersion: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
                  contractVersion: { kind: "integer", minimum: 1, maximum: 1_000_000 },
                  contractHash: { kind: "string", minLength: 64, maxLength: 64, pattern: contractPatterns.sha256 },
                  transport: { kind: "enum", values: contractTransports },
                  authority: { kind: "enum", values: operationAuthorities },
                },
                description: "The exact installed contract the read binds to.",
              },
            },
          },
          {
            kind: "object",
            properties: {
              ...readCommon,
              verdict: { kind: "literal", value: "gap" },
              gap: {
                kind: "object",
                properties: {
                  reason: { kind: "enum", values: contractGapReasons },
                  detail: { kind: "string", minLength: 1, maxLength: MAX_DETAIL_LENGTH },
                },
                description: "One closed gap reason with a bounded, subject-free detail.",
              },
            },
          },
        ],
      },
      maxItems: COLLECTION_PLAN_MAX_READS,
      description: "One verdict per plan read, in execution order.",
    },
  },
};

/**
 * Semantic rules beyond the shape: `reads` has exactly `plan.reads` entries,
 * indexes are the sequence 0..n-1, and `ok` equals "every verdict is ok".
 */
export function parseContractCheck(value: unknown): ContractCheckV1 {
  const check = parseShape<ContractCheckV1>(checkShape, value, "check");
  if (check.reads.length !== check.plan.reads) {
    throw new ContractParseError("check.reads", "must hold exactly plan.reads entries");
  }
  for (const [index, read] of check.reads.entries()) {
    if (read.index !== index) {
      throw new ContractParseError(`check.reads[${String(index)}].index`, "must follow execution order");
    }
  }
  const everyOk = check.reads.every((read) => read.verdict === "ok");
  if (check.ok !== everyOk) {
    throw new ContractParseError("check.ok", "must be true exactly when every read is ok");
  }
  return check;
}

function boundedDetail(detail: string): string {
  return detail.length > MAX_DETAIL_LENGTH
    ? `${detail.slice(0, MAX_DETAIL_LENGTH - 1)}…`
    : detail;
}

function gap(reason: ContractGapReason, detail: string): ContractCheckGap {
  return Object.freeze({ reason, detail: boundedDetail(detail) });
}

function readGap(
  read: CollectionRead,
  adapter: ContractCatalogAdapter | undefined,
  invalidIssues: readonly string[] | undefined,
  storedAuthIds: readonly string[] | undefined,
): ContractCheckGap | ContractCatalogOperation {
  if (invalidIssues !== undefined) {
    return gap(
      "adapter-invalid",
      `installed manifest is invalid: ${invalidIssues.slice(0, 3).join("; ")}`,
    );
  }
  if (adapter === undefined) return gap("adapter-missing", "adapter is not installed");
  const operation = adapter.operations.find((candidate) => candidate.id === read.operation);
  if (operation === undefined) {
    return gap("operation-missing", "adapter does not own the operation");
  }
  if (operation.transport === "reviewed-template-api") {
    return gap(
      "transport-disabled",
      "installed transport reviewed-template-api is not invocable",
    );
  }
  if (operation.state !== read.semantics.state) {
    return gap(
      "state-mismatch",
      `installed state is ${operation.state}; plan requires ${read.semantics.state}`,
    );
  }
  if (operation.risk !== read.semantics.risk) {
    return gap("risk-mismatch", `installed risk is ${operation.risk}; plan requires ${read.semantics.risk}`);
  }
  if (operation.sideEffect !== read.semantics.sideEffect) {
    return gap(
      "side-effect-mismatch",
      `installed operation declares a side effect; plan requires ${read.semantics.sideEffect}`,
    );
  }
  if (operation.authority !== read.authority.kind) {
    return gap(
      "authority-mismatch",
      `installed authority is ${operation.authority}; plan requires ${read.authority.kind}`,
    );
  }
  const input = validateOperationInput(operation.input, read.input, adapter.origins);
  if (!input.ok) return gap("input-invalid", input.issues.join("; "));
  if (
    storedAuthIds !== undefined
    && read.authority.kind === "auth"
    && !storedAuthIds.includes(read.authority.authId)
  ) {
    return gap("auth-missing", "plan names an auth locator that is not stored");
  }
  return operation;
}

/**
 * Check every plan read against the catalog. Deterministic and idempotent:
 * the same plan and catalog always produce the same document, and checking
 * again changes nothing. Each read carries at most one gap reason, chosen in
 * the fixed order adapter-missing, adapter-invalid, operation-missing,
 * transport-disabled, state-mismatch, risk-mismatch, side-effect-mismatch,
 * authority-mismatch, input-invalid, auth-missing.
 */
export function checkCollectionPlan(
  plan: CollectionPlanV1,
  catalog: ContractCatalogV1,
  options: CheckCollectionPlanOptions = {},
): ContractCheckV1 {
  const adapters = new Map<string, ContractCatalogAdapter>();
  const invalid = new Map<string, readonly string[]>();
  for (const adapter of catalog.adapters) {
    if (isInvalidCatalogAdapter(adapter)) invalid.set(adapter.id, adapter.issues);
    else adapters.set(adapter.id, adapter);
  }
  const storedAuthIds = options.storedAuthIds === undefined
    ? undefined
    : Object.freeze([...options.storedAuthIds]);
  const reads = collectionPlanReads(plan).map(({ index, accountKey, read }): ContractCheckRead => {
    const common = {
      index,
      accountKey,
      adapter: read.adapter,
      operation: read.operation,
    };
    const outcome = readGap(read, adapters.get(read.adapter), invalid.get(read.adapter), storedAuthIds);
    if ("reason" in outcome) return Object.freeze({ ...common, verdict: "gap", gap: outcome });
    const adapter = adapters.get(read.adapter);
    if (adapter === undefined) throw new Error("checked adapter disappeared");
    return Object.freeze({
      ...common,
      verdict: "ok",
      binding: Object.freeze({
        adapterVersion: adapter.version,
        contractVersion: outcome.contractVersion,
        contractHash: outcome.contractHash,
        transport: outcome.transport,
        authority: outcome.authority,
      }),
    });
  });
  return parseContractCheck({
    ok: reads.every((read) => read.verdict === "ok"),
    contract: CONTRACT_CHECK_V1,
    ghostget: { version: catalog.ghostget.version },
    plan: { collectionKey: plan.collectionKey, reads: reads.length },
    reads,
  });
}
