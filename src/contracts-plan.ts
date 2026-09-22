/**
 * `ghostget.collection-plan.v1`: a read-only collection plan that names the
 * adapters, operations, inputs, authorities and expected semantics a consumer
 * intends to invoke. The shape table is the single source for
 * `parseCollectionPlan` and `contractSchema("plan")`.
 */
import {
  COLLECTION_PLAN_SCHEMA_VERSION,
  contractPatterns,
  contractStates,
  type ContractState,
} from "./contracts-vocabulary";
import {
  ContractParseError,
  parseShape,
  type JsonValue,
  type Shape,
} from "./contracts-shape";

export type CollectionReadAuthority =
  | { readonly kind: "public" }
  | { readonly kind: "auth"; readonly authId: string };

export type CollectionExpectedGap = {
  readonly metricKey: string;
  readonly reason: "not-authorized";
  readonly until: "account-eligible";
};

export type CollectionRead = {
  readonly adapter: string;
  readonly operation: string;
  readonly authority: CollectionReadAuthority;
  readonly input: { readonly [key: string]: JsonValue };
  readonly expectedOutput: { readonly provider: string; readonly targetUrl: string };
  readonly metricKeys: readonly string[];
  readonly expectedCategoricalGaps: readonly CollectionExpectedGap[];
  readonly requiredDelayBeforeMs: number;
  readonly semantics: {
    readonly state: ContractState;
    readonly risk: "R1";
    readonly sideEffect: "none";
  };
};

export type CollectionAccount = {
  readonly accountKey: string;
  readonly reads: readonly CollectionRead[];
};

export type CollectionPlanV1 = {
  readonly schemaVersion: typeof COLLECTION_PLAN_SCHEMA_VERSION;
  readonly collectionKey: string;
  readonly execution: {
    readonly order: "sequential";
    readonly observationMode: "live-only";
  };
  readonly accounts: readonly CollectionAccount[];
};

export const COLLECTION_PLAN_MAX_ACCOUNTS = 64;
export const COLLECTION_PLAN_MAX_READS_PER_ACCOUNT = 8;
export const COLLECTION_PLAN_MAX_READS = 128;
export const COLLECTION_PLAN_MAX_DELAY_MS = 600_000;
export const COLLECTION_PLAN_MAX_METRIC_KEYS = 16;
const MAX_INPUT_KEYS = 32;
const MAX_INPUT_DEPTH = 8;
const MAX_INPUT_NODES = 1_024;
const MAX_TARGET_URL_LENGTH = 2_048;

const kebabKey = (maxLength: number, description: string): Shape => ({
  kind: "string",
  minLength: 1,
  maxLength,
  pattern: contractPatterns.kebabKey,
  description,
});

const metricKey: Shape = {
  kind: "string",
  minLength: 1,
  maxLength: 128,
  pattern: contractPatterns.metricKey,
};

const readShape: Shape = {
  kind: "object",
  properties: {
    adapter: {
      kind: "string",
      minLength: 1,
      maxLength: 48,
      pattern: contractPatterns.adapterId,
      description: "Installed adapter ID, as `ghostget invoke <adapter>` accepts it.",
    },
    operation: {
      kind: "string",
      minLength: 3,
      maxLength: 163,
      pattern: contractPatterns.operationId,
      description: "Semantic operation ID owned by the adapter.",
    },
    authority: {
      kind: "union",
      variants: [
        {
          kind: "object",
          properties: { kind: { kind: "literal", value: "public" } },
          description: "The operation runs without an auth locator.",
        },
        {
          kind: "object",
          properties: {
            kind: { kind: "literal", value: "auth" },
            authId: {
              kind: "string",
              minLength: 1,
              maxLength: 48,
              pattern: contractPatterns.authId,
              description: "Local Ghostget auth locator ID; never a credential.",
            },
          },
        },
      ],
    },
    input: {
      kind: "record",
      values: {
        kind: "json",
        maxDepth: MAX_INPUT_DEPTH,
        maxNodes: MAX_INPUT_NODES,
        description: "One operation input value; bounded JSON.",
      },
      keyPattern: contractPatterns.inputFieldName,
      maxProperties: MAX_INPUT_KEYS,
      description: "Exact operation input; `contracts check` validates it against the installed schema.",
    },
    expectedOutput: {
      kind: "object",
      properties: {
        provider: kebabKey(64, "Provider the read must bind to."),
        targetUrl: {
          kind: "string",
          minLength: 9,
          maxLength: MAX_TARGET_URL_LENGTH,
          pattern: contractPatterns.httpsUrl,
          format: "uri",
          description: "Canonical credential-free HTTPS target the read must bind to.",
        },
      },
    },
    metricKeys: {
      kind: "array",
      items: metricKey,
      minItems: 1,
      maxItems: COLLECTION_PLAN_MAX_METRIC_KEYS,
      uniqueItems: true,
    },
    expectedCategoricalGaps: {
      kind: "array",
      items: {
        kind: "object",
        properties: {
          metricKey,
          reason: { kind: "literal", value: "not-authorized" },
          until: { kind: "literal", value: "account-eligible" },
        },
      },
      maxItems: COLLECTION_PLAN_MAX_METRIC_KEYS,
      description: "Metrics the consumer expects to stay categorically unavailable; each names one of `metricKeys`.",
    },
    requiredDelayBeforeMs: {
      kind: "integer",
      minimum: 0,
      maximum: COLLECTION_PLAN_MAX_DELAY_MS,
      description: "Idle time the caller must wait before this read.",
    },
    semantics: {
      kind: "object",
      properties: {
        state: { kind: "enum", values: contractStates },
        risk: { kind: "literal", value: "R1" },
        sideEffect: { kind: "literal", value: "none" },
      },
      description: "Installed semantics the read requires; v1 plans are read-only by construction.",
    },
  },
};

export const planShape: Shape = {
  kind: "object",
  properties: {
    schemaVersion: { kind: "literal", value: COLLECTION_PLAN_SCHEMA_VERSION },
    collectionKey: kebabKey(128, "Consumer-owned collection identifier."),
    execution: {
      kind: "object",
      properties: {
        order: { kind: "literal", value: "sequential" },
        observationMode: { kind: "literal", value: "live-only" },
      },
    },
    accounts: {
      kind: "array",
      items: {
        kind: "object",
        properties: {
          accountKey: kebabKey(128, "Unique consumer-owned account key."),
          reads: {
            kind: "array",
            items: readShape,
            minItems: 1,
            maxItems: COLLECTION_PLAN_MAX_READS_PER_ACCOUNT,
          },
        },
      },
      minItems: 1,
      maxItems: COLLECTION_PLAN_MAX_ACCOUNTS,
    },
  },
};

function assertCanonicalTarget(url: string, path: string): void {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new ContractParseError(path, "must be a canonical HTTPS URL");
  }
  if (
    target.protocol !== "https:"
    || target.username !== ""
    || target.password !== ""
    || target.search !== ""
    || target.hash !== ""
    || target.href !== url
  ) {
    throw new ContractParseError(path, "must be a canonical credential-free HTTPS URL without query or fragment");
  }
}

/**
 * Semantic rules beyond the shape: account keys are unique, the plan holds at
 * most 128 reads, every expected gap names one distinct metric key, and each
 * target URL is canonical.
 */
export function parseCollectionPlan(value: unknown): CollectionPlanV1 {
  const plan = parseShape<CollectionPlanV1>(planShape, value, "plan");
  const accountKeys = new Set<string>();
  let reads = 0;
  for (const [accountIndex, account] of plan.accounts.entries()) {
    const accountPath = `plan.accounts[${String(accountIndex)}]`;
    if (accountKeys.has(account.accountKey)) {
      throw new ContractParseError(`${accountPath}.accountKey`, "repeats an account key");
    }
    accountKeys.add(account.accountKey);
    reads += account.reads.length;
    for (const [readIndex, read] of account.reads.entries()) {
      const readPath = `${accountPath}.reads[${String(readIndex)}]`;
      assertCanonicalTarget(read.expectedOutput.targetUrl, `${readPath}.expectedOutput.targetUrl`);
      const gapKeys = new Set<string>();
      for (const [gapIndex, gap] of read.expectedCategoricalGaps.entries()) {
        const gapPath = `${readPath}.expectedCategoricalGaps[${String(gapIndex)}].metricKey`;
        if (!read.metricKeys.includes(gap.metricKey)) {
          throw new ContractParseError(gapPath, "must name one of the read's metric keys");
        }
        if (gapKeys.has(gap.metricKey)) {
          throw new ContractParseError(gapPath, "repeats a metric key");
        }
        gapKeys.add(gap.metricKey);
      }
    }
  }
  if (reads > COLLECTION_PLAN_MAX_READS) {
    throw new ContractParseError(
      "plan.accounts",
      `must hold at most ${String(COLLECTION_PLAN_MAX_READS)} reads in total`,
    );
  }
  return plan;
}

/** Flatten a plan's reads in execution order with their zero-based index. */
export function collectionPlanReads(
  plan: CollectionPlanV1,
): readonly { readonly index: number; readonly accountKey: string; readonly read: CollectionRead }[] {
  const flattened: { readonly index: number; readonly accountKey: string; readonly read: CollectionRead }[] = [];
  for (const account of plan.accounts) {
    for (const read of account.reads) {
      flattened.push(Object.freeze({ index: flattened.length, accountKey: account.accountKey, read }));
    }
  }
  return Object.freeze(flattened);
}
