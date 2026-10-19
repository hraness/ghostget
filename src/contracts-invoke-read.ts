/**
 * The R1 `ghostget invoke … --json` result envelope, documented as it already
 * exists. Nothing here changes what `invoke` prints; the shape table describes
 * the envelope `src/ghostget.ts` emits through `revalidatedInvocationView` and
 * that `@hraness/ghostget/client` parses.
 */
import {
  contractPatterns,
  readFailureDispositions,
  type ReadFailureCategory,
  type RetryDisposition,
} from "./contracts-vocabulary";
import {
  ContractParseError,
  parseShape,
  type Shape,
  type ShapeDefinitions,
} from "./contracts-shape";

export type InvokeReadAuthKind =
  | "browser-profile"
  | "cookie-source"
  | "cookies-file"
  | "linked-device-store"
  | "oauth-token-file"
  | "public-web-session";

export type InvokeReadPortableContract = {
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly hostApiVersion: 1;
  readonly bundleSha256: string;
  readonly manifestSha256: string;
  readonly adapterId: string;
  readonly transport: "linked-device" | "provider-api" | "web-session-api";
  readonly surfaceId: string;
  readonly operation: string;
  readonly contractVersion: number;
  readonly descriptorSha256: string;
};

export type InvokeReadLocalCliContract = {
  readonly surface: string;
  readonly action: string;
  readonly version: number;
  readonly hash: string;
  readonly tool: {
    readonly schemaVersion: 1;
    readonly id: string;
    readonly implementation: string;
    readonly versionScheme: "semver" | "opaque";
    readonly version: string;
    readonly releaseCommit?: string;
    readonly releaseManifestSha256?: string;
    readonly releaseManifestUrl?: string;
    readonly sourceUrl?: string;
    readonly artifacts: readonly {
      readonly platform: string;
      readonly arch: string;
      readonly executableSha256: string;
      readonly archiveSha256?: string;
      readonly downloadUrl?: string;
    }[];
  };
};

type InvokeReadReceiptCommon = {
  readonly runId: string;
  readonly planDigest: null;
  readonly adapter: { readonly id: string; readonly version: string; readonly hash: string };
  readonly operation: string;
  readonly risk: "R1";
  readonly inputHash: string;
  readonly auth: { readonly id: string; readonly hash: string; readonly kind: InvokeReadAuthKind };
  readonly status: "succeeded" | "failed";
  readonly dispatchStarted: false;
  readonly dispatch: { readonly planned: 0; readonly started: 0; readonly verified: 0 };
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly finalOrigin: string | null;
  readonly error: string | null;
};

export type InvokeReadReceipt = InvokeReadReceiptCommon & (
  | { readonly schemaVersion: 2; readonly transport: "browser" }
  | { readonly schemaVersion: 3; readonly transport: "provider-api"; readonly providerContractHash: string }
  | { readonly schemaVersion: 4; readonly transport: "web-session-api"; readonly webSessionContractHash: string }
  | { readonly schemaVersion: 5; readonly transport: "reviewed-template-api"; readonly reviewedTemplateContractHash: string }
  | { readonly schemaVersion: 6; readonly transport: "portable-provider-plugin"; readonly portablePluginContract: InvokeReadPortableContract }
  | { readonly schemaVersion: 7; readonly transport: "local-cli"; readonly localCliContract: InvokeReadLocalCliContract }
);

export type InvokeReadCacheOutcome =
  | {
      readonly status: "stored";
      readonly publication: {
        readonly key: string;
        readonly dataRevision: string;
        readonly validatedAt: string;
        readonly dataChangedAt: string;
        readonly disposition: "created" | "changed" | "unchanged" | "superseded";
        readonly currentDataRevision?: string;
      };
    }
  | { readonly status: "retained"; readonly reason: "live-read-failed" }
  | { readonly status: "miss"; readonly reason: "no-cached-snapshot" }
  | { readonly status: "skipped"; readonly reason: "auth-subject-unbound" }
  | { readonly status: "error"; readonly message: string };

export type InvokeReadFailure = {
  readonly category: ReadFailureCategory;
  readonly retryDisposition: RetryDisposition;
};

type InvokeReadResultCommon = {
  readonly runId: string;
  readonly replayed: boolean;
  readonly source: "live";
  readonly cache: InvokeReadCacheOutcome;
};

export type InvokeReadResultV1 = InvokeReadResultCommon & (
  | {
      readonly ok: true;
      readonly status: "succeeded";
      readonly receipt: InvokeReadReceipt & { readonly status: "succeeded" };
      readonly output: unknown;
      readonly readFailure?: never;
    }
  | {
      readonly ok: false;
      readonly status: "failed";
      readonly receipt: InvokeReadReceipt & { readonly status: "failed" };
      readonly output: null;
      readonly readFailure: InvokeReadFailure;
    }
);

const MAX_OUTPUT_DEPTH = 64;
const MAX_OUTPUT_NODES = 4_000_000;
const MAX_TEXT_LENGTH = 4_096;
const MAX_ERROR_LENGTH = 8_192;
const MAX_KEY_LENGTH = 512;

const sha256: Shape = { kind: "string", minLength: 64, maxLength: 64, pattern: contractPatterns.sha256 };
const text = (maxLength: number, description?: string): Shape => ({
  kind: "string",
  minLength: 1,
  maxLength,
  ...(description === undefined ? {} : { description }),
});
const dateTime: Shape = { kind: "string", minLength: 24, maxLength: 24, format: "date-time" };
const nullable = (shape: Shape): Shape => ({ kind: "union", variants: [shape, { kind: "null" }] });

const receiptCommon = {
  runId: { kind: "string", minLength: 36, maxLength: 36, pattern: contractPatterns.runId },
  planDigest: { kind: "null", description: "R1 reads never carry a confirmation plan." },
  adapter: {
    kind: "object",
    properties: {
      id: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
      version: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
      hash: sha256,
    },
  },
  operation: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
  risk: { kind: "literal", value: "R1" },
  inputHash: sha256,
  auth: {
    kind: "object",
    properties: {
      id: text(128, "Auth locator ID, or the kernel-owned public authority ID; never a credential."),
      hash: sha256,
      kind: {
        kind: "enum",
        values: [
          "browser-profile",
          "cookie-source",
          "cookies-file",
          "linked-device-store",
          "oauth-token-file",
          "public-web-session",
        ],
      },
    },
  },
  status: { kind: "enum", values: ["succeeded", "failed"] },
  dispatchStarted: { kind: "literal", value: false },
  dispatch: {
    kind: "object",
    properties: {
      planned: { kind: "literal", value: 0 },
      started: { kind: "literal", value: 0 },
      verified: { kind: "literal", value: 0 },
    },
    description: "R1 reads prove zero dispatch.",
  },
  startedAt: dateTime,
  finishedAt: dateTime,
  finalOrigin: nullable(text(MAX_TEXT_LENGTH)),
  error: nullable(text(MAX_ERROR_LENGTH, "Bounded redacted diagnostic; never a retry policy.")),
} satisfies Readonly<Record<string, Shape>>;

function receiptVariant(
  schemaVersion: number,
  transport: string,
  extra: Readonly<Record<string, Shape>>,
): Shape {
  return {
    kind: "object",
    properties: {
      schemaVersion: { kind: "literal", value: schemaVersion },
      ...receiptCommon,
      transport: { kind: "literal", value: transport },
      ...extra,
    },
  };
}

const portableContract: Shape = {
  kind: "object",
  properties: {
    pluginId: text(63),
    pluginVersion: text(64),
    hostApiVersion: { kind: "literal", value: 1 },
    bundleSha256: sha256,
    manifestSha256: sha256,
    adapterId: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
    transport: { kind: "enum", values: ["linked-device", "provider-api", "web-session-api"] },
    surfaceId: text(63),
    operation: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
    contractVersion: { kind: "integer", minimum: 1, maximum: 1_000_000 },
    descriptorSha256: sha256,
  },
};

const localCliContract: Shape = {
  kind: "object",
  properties: {
    surface: text(63),
    action: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
    version: { kind: "integer", minimum: 1, maximum: 1_000_000 },
    hash: sha256,
    tool: {
      kind: "object",
      properties: {
        schemaVersion: { kind: "literal", value: 1 },
        id: text(128),
        implementation: text(MAX_TEXT_LENGTH),
        versionScheme: { kind: "enum", values: ["semver", "opaque"] },
        version: text(128),
        releaseCommit: text(128),
        releaseManifestSha256: sha256,
        releaseManifestUrl: text(MAX_TEXT_LENGTH),
        sourceUrl: text(MAX_TEXT_LENGTH),
        artifacts: {
          kind: "array",
          items: {
            kind: "object",
            properties: {
              platform: text(64),
              arch: text(64),
              executableSha256: sha256,
              archiveSha256: sha256,
              downloadUrl: text(MAX_TEXT_LENGTH),
            },
            optional: ["archiveSha256", "downloadUrl"],
          },
          maxItems: 32,
        },
      },
      optional: ["releaseCommit", "releaseManifestSha256", "releaseManifestUrl", "sourceUrl"],
    },
  },
};

const receipt: Shape = {
  kind: "union",
  variants: [
    receiptVariant(2, "browser", {}),
    receiptVariant(3, "provider-api", { providerContractHash: sha256 }),
    receiptVariant(4, "web-session-api", { webSessionContractHash: sha256 }),
    receiptVariant(5, "reviewed-template-api", { reviewedTemplateContractHash: sha256 }),
    receiptVariant(6, "portable-provider-plugin", { portablePluginContract: portableContract }),
    receiptVariant(7, "local-cli", { localCliContract }),
  ],
  description: "Durable R1 run receipt; `schemaVersion` and `transport` select the contract-hash field.",
};

const cacheOutcome: Shape = {
  kind: "union",
  variants: [
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "stored" },
        publication: {
          kind: "object",
          properties: {
            key: text(MAX_KEY_LENGTH),
            dataRevision: text(MAX_KEY_LENGTH),
            validatedAt: dateTime,
            dataChangedAt: dateTime,
            disposition: { kind: "enum", values: ["created", "changed", "unchanged", "superseded"] },
            currentDataRevision: text(MAX_KEY_LENGTH),
          },
          optional: ["currentDataRevision"],
        },
      },
    },
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "retained" },
        reason: { kind: "literal", value: "live-read-failed" },
      },
    },
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "miss" },
        reason: { kind: "literal", value: "no-cached-snapshot" },
      },
    },
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "skipped" },
        reason: { kind: "literal", value: "auth-subject-unbound" },
      },
    },
    {
      kind: "object",
      properties: {
        status: { kind: "literal", value: "error" },
        message: text(MAX_TEXT_LENGTH),
      },
    },
  ],
  description: "What happened to the exact R1 projection cache after the live read.",
};

const readFailure: Shape = {
  kind: "union",
  variants: Object.entries(readFailureDispositions).map(([category, retryDisposition]): Shape => ({
    kind: "object",
    properties: {
      category: { kind: "literal", value: category },
      retryDisposition: { kind: "literal", value: retryDisposition },
    },
  })),
  description: "Closed failure category with its only valid retry disposition.",
};

export const invokeReadDefinitions: ShapeDefinitions = Object.freeze({
  receipt,
  cacheOutcome,
  readFailure,
});

const resultCommon = {
  runId: { kind: "string", minLength: 36, maxLength: 36, pattern: contractPatterns.runId },
  replayed: { kind: "boolean" },
  source: { kind: "literal", value: "live" },
  cache: { kind: "ref", name: "cacheOutcome" },
} satisfies Readonly<Record<string, Shape>>;

export const invokeReadShape: Shape = {
  kind: "union",
  variants: [
    {
      kind: "object",
      properties: {
        ok: { kind: "literal", value: true },
        status: { kind: "literal", value: "succeeded" },
        ...resultCommon,
        receipt: { kind: "ref", name: "receipt" },
        output: {
          kind: "json",
          maxDepth: MAX_OUTPUT_DEPTH,
          maxNodes: MAX_OUTPUT_NODES,
          description: "Provider-shaped output; typed by the operation, bounded here to depth 64 and 4,000,000 nodes.",
        },
      },
    },
    {
      kind: "object",
      properties: {
        ok: { kind: "literal", value: false },
        status: { kind: "literal", value: "failed" },
        ...resultCommon,
        receipt: { kind: "ref", name: "receipt" },
        output: { kind: "null" },
        readFailure: { kind: "ref", name: "readFailure" },
      },
    },
  ],
  description: "R1 result envelope printed by `ghostget invoke <adapter> <operation> --json`.",
};

/**
 * Semantic rules beyond the shape, mirroring `@hraness/ghostget/client`: the
 * receipt status and run ID equal the top-level fields, and the cache outcome
 * is consistent with the receipt status.
 */
export function parseInvokeReadResult(value: unknown): InvokeReadResultV1 {
  const result = parseShape<InvokeReadResultV1>(invokeReadShape, value, "result", invokeReadDefinitions);
  if (result.receipt.status !== result.status) {
    throw new ContractParseError("result.receipt.status", "must equal the top-level status");
  }
  if (result.receipt.runId !== result.runId) {
    throw new ContractParseError("result.receipt.runId", "must equal the top-level runId");
  }
  const cacheMatches = result.status === "succeeded"
    ? result.cache.status === "stored"
      || result.cache.status === "error"
      || result.cache.status === "skipped"
    : result.cache.status === "retained"
      || result.cache.status === "miss"
      || result.cache.status === "error"
      || result.cache.status === "skipped";
  if (!cacheMatches) {
    throw new ContractParseError("result.cache", "is inconsistent with the receipt status");
  }
  return result;
}
