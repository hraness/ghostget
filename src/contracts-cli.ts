/**
 * Host side of `ghostget contracts`: projects the installed catalog into
 * `ghostget.contract-catalog.v1`, runs the pure `checkCollectionPlan`, and
 * prints contract schemas. The projection reads installed manifests and the
 * code-owned registry; it never binds an account or contacts a provider.
 */
import { resolve } from "node:path";

import { listAuth } from "./auth";
import {
  installedOperationTransport,
  listRuntimeManifests,
  reviewedTemplateHash,
} from "./catalog-cli";
import {
  catalogVocabularyValue,
  parseContractCatalog,
  type ContractCatalogAdapter,
  type ContractCatalogInvalidAdapter,
  type ContractCatalogOperation,
  type ContractCatalogV1,
} from "./contracts-catalog";
import { checkCollectionPlan, type ContractCheckV1 } from "./contracts-check";
import { parseCollectionPlan } from "./contracts-plan";
import { contractSchema } from "./contracts-schema";
import {
  CONTRACT_CATALOG_V1,
  type ContractSchemaName,
  type OperationAuthority,
} from "./contracts-vocabulary";
import {
  getLocalCliContract,
  localCliContractHash,
} from "./local-cli-contracts";
import {
  isLocalCliOperation,
  isProviderOperation,
  isReviewedTemplateOperation,
  isWebSessionOperation,
  manifestHash,
  type GhostgetManifest,
  type GhostgetOperation,
} from "./model";
import {
  getProviderContract,
  providerContractHash,
} from "./provider-contracts";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";
import { readRegularFile } from "./storage";
import { GHOSTGET_VERSION } from "./version";
import { resolvedWebSessionOperationAuthenticationPolicy } from "./web-session-authentication-policy";
import {
  getWebSessionContract,
  webSessionContractHash,
} from "./web-session-contracts";

export type GhostgetContractsCommand =
  | {
      readonly command: "contracts-catalog";
      readonly adapterIds: readonly string[];
      readonly json: boolean;
    }
  | {
      readonly command: "contracts-check";
      /** A plan file path, or `-` for stdin. */
      readonly planSource: string;
      readonly authState: boolean;
      readonly json: boolean;
    }
  | {
      readonly command: "contracts-schema";
      readonly name: ContractSchemaName;
      readonly json: boolean;
    };

export type GhostgetContractsOutput = {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
};

export type ContractCatalogProjectionOptions = {
  readonly version?: string;
  readonly now?: Date;
  /** When present, only these adapters are projected; `ok` is false when none is installed. */
  readonly adapterIds?: readonly string[];
};

const MAX_PLAN_BYTES = 1024 * 1024;

/** JSON escapes keep the value exact while terminal-control characters stay inert. */
function exactContractJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  return `${json.replace(/[\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/gu, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)}\n`;
}

/**
 * Authority is decided by the same code-owned policy the invoke path uses. A
 * web-session operation is `public` only when its active descriptor declares
 * `access: "public"` and satisfies the kernel's public-read invariants; every
 * other transport requires a persisted auth locator.
 */
function operationAuthority(
  adapterId: string,
  operationId: string,
  operation: GhostgetOperation,
  registry: ProviderPluginRegistry,
): OperationAuthority {
  if (!isWebSessionOperation(operation)) return "auth";
  const binding = registry.requireSessionRoute(operation.webSession.site);
  const resolution = registry.requireOperationDefinition(
    binding.transport,
    operation.webSession.site,
    operation.webSession.action,
    operation.webSession.contractVersion,
  );
  const policy = resolvedWebSessionOperationAuthenticationPolicy(
    adapterId,
    operationId,
    operation.webSession,
    resolution,
  );
  return policy.kind === "public" ? "public" : "auth";
}

function projectOperation(
  adapterId: string,
  operationId: string,
  operation: GhostgetOperation,
  registry: ProviderPluginRegistry,
): ContractCatalogOperation {
  const transport = installedOperationTransport(operation);
  const contract = isProviderOperation(operation)
    ? (() => {
        const provider = getProviderContract(operation.provider, registry);
        return {
          state: provider.state,
          contractVersion: provider.contractVersion,
          contractHash: providerContractHash(provider, registry),
        };
      })()
    : isWebSessionOperation(operation)
      ? (() => {
          const webSession = getWebSessionContract(operation.webSession, registry);
          return {
            state: webSession.state,
            contractVersion: webSession.contractVersion,
            contractHash: webSessionContractHash(webSession, registry),
          };
        })()
      : isLocalCliOperation(operation)
        ? (() => {
            const localCli = getLocalCliContract(operation.localCli, registry);
            return {
              state: localCli.state,
              contractVersion: localCli.contractVersion,
              contractHash: localCliContractHash(localCli, registry),
            };
          })()
        : isReviewedTemplateOperation(operation)
          ? {
              state: operation.reviewedTemplate.state === "reviewed"
                ? "observed" as const
                : "capture-required" as const,
              contractVersion: operation.reviewedTemplate.contractVersion,
              contractHash: reviewedTemplateHash(operation.reviewedTemplate),
            }
          : null;
  if (contract === null) throw new Error(`operation ${operationId} has no durable contract`);
  return {
    id: operationId,
    transport,
    authority: operationAuthority(adapterId, operationId, operation, registry),
    risk: operation.risk,
    sideEffect: operation.sideEffect,
    idempotency: operation.idempotency,
    dedupeWindowMs: operation.dedupeWindowMs,
    state: contract.state,
    contractVersion: contract.contractVersion,
    contractHash: contract.contractHash,
    input: operation.input,
  };
}

function projectAdapter(
  manifest: GhostgetManifest,
  registry: ProviderPluginRegistry,
): ContractCatalogAdapter {
  return {
    id: manifest.id,
    version: manifest.version,
    surfaceId: manifest.surfaceId ?? null,
    manifestHash: manifestHash(manifest),
    origins: manifest.origins,
    // Sorted by ID so the projection is stable across manifest serializations.
    operations: Object.entries(manifest.operations)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([operationId, operation]) =>
        projectOperation(manifest.id, operationId, operation, registry)),
  };
}

/** Project installed manifests into a parsed, schema-valid contract catalog. */
export function projectContractCatalog(
  manifests: ReturnType<typeof listRuntimeManifests>,
  registry: ProviderPluginRegistry,
  options: ContractCatalogProjectionOptions = {},
): ContractCatalogV1 {
  const requested = options.adapterIds === undefined ? null : new Set(options.adapterIds);
  const selected = requested === null
    ? manifests
    : manifests.filter((entry) => requested.has(entry.id));
  // Exit 3 when a filter matches nothing at all; a partially matching filter
  // still lists what is installed so a consumer can see which IDs are absent.
  const ok = requested === null || selected.length > 0;
  const adapters: (ContractCatalogAdapter | ContractCatalogInvalidAdapter)[] = selected.map(
    ({ id, result }) => result.ok
      ? projectAdapter(result.value, registry)
      : { id, invalid: true as const, issues: result.issues },
  );
  return parseContractCatalog({
    ok,
    contract: CONTRACT_CATALOG_V1,
    ghostget: { version: options.version ?? GHOSTGET_VERSION },
    generatedAt: (options.now ?? new Date()).toISOString(),
    vocabulary: catalogVocabularyValue,
    adapters,
  });
}

function renderCatalogText(catalog: ContractCatalogV1): string {
  const lines = [
    `Ghostget contract catalog ${catalog.ghostget.version} (${String(catalog.adapters.length)} adapters)`,
    "Installed contracts do not confirm account access or runtime readiness.",
  ];
  for (const adapter of catalog.adapters) {
    if ("invalid" in adapter) {
      lines.push(`  ${adapter.id} (invalid manifest; ${String(adapter.issues.length)} issues)`);
      continue;
    }
    const observed = adapter.operations.filter((operation) => operation.state === "observed").length;
    const publicReads = adapter.operations.filter((operation) => operation.authority === "public").length;
    lines.push(
      `  ${adapter.id} ${adapter.version}: ${String(adapter.operations.length)} operations; ${String(observed)} observed; ${String(publicReads)} public`,
    );
  }
  if (!catalog.ok) lines.push("A requested adapter is not installed.");
  lines.push("Exact document: ghostget contracts catalog --json");
  return `${lines.join("\n")}\n`;
}

function renderCheckText(check: ContractCheckV1): string {
  const okCount = check.reads.filter((read) => read.verdict === "ok").length;
  const lines = [
    `Plan ${check.plan.collectionKey}: ${String(okCount)} of ${String(check.plan.reads)} reads bind to installed contracts`,
  ];
  for (const read of check.reads) {
    const prefix = `  [${String(read.index)}] ${read.accountKey} ${read.adapter} ${read.operation}:`;
    lines.push(read.verdict === "ok"
      ? `${prefix} ok (${read.binding.transport}; ${read.binding.authority}; contract v${String(read.binding.contractVersion)})`
      : `${prefix} gap ${read.gap.reason}: ${read.gap.detail}`);
  }
  lines.push("Exact document: ghostget contracts check --plan <file> --json");
  return `${lines.join("\n")}\n`;
}

export function runContractsCatalog(
  command: Extract<GhostgetContractsCommand, { readonly command: "contracts-catalog" }>,
  environment: Readonly<Record<string, string | undefined>>,
  output: GhostgetContractsOutput,
  registry: ProviderPluginRegistry,
  options: Pick<ContractCatalogProjectionOptions, "now" | "version"> = {},
): number {
  const catalog = projectContractCatalog(listRuntimeManifests(environment, registry), registry, {
    ...options,
    ...(command.adapterIds.length === 0 ? {} : { adapterIds: command.adapterIds }),
  });
  output.stdout(command.json ? exactContractJson(catalog) : renderCatalogText(catalog));
  return catalog.ok ? 0 : 3;
}

export type ContractsCheckDependencies = {
  readonly readStdin: (maxBytes: number) => Promise<string>;
  readonly now?: Date;
  readonly version?: string;
};

async function readPlanSource(
  source: string,
  readStdin: ContractsCheckDependencies["readStdin"],
): Promise<unknown> {
  const text = source === "-"
    ? await readStdin(MAX_PLAN_BYTES)
    : readRegularFile(resolve(source), MAX_PLAN_BYTES, "plan file");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("plan file must contain one JSON document");
  }
}

export async function runContractsCheck(
  command: Extract<GhostgetContractsCommand, { readonly command: "contracts-check" }>,
  environment: Readonly<Record<string, string | undefined>>,
  output: GhostgetContractsOutput,
  registry: ProviderPluginRegistry,
  dependencies: ContractsCheckDependencies,
): Promise<number> {
  const plan = parseCollectionPlan(await readPlanSource(command.planSource, dependencies.readStdin));
  const catalog = projectContractCatalog(listRuntimeManifests(environment, registry), registry, {
    ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
    ...(dependencies.version === undefined ? {} : { version: dependencies.version }),
  });
  const check = checkCollectionPlan(plan, catalog, command.authState
    ? { storedAuthIds: listAuth(environment).map((auth) => auth.id) }
    : {});
  output.stdout(command.json ? exactContractJson(check) : renderCheckText(check));
  return check.ok ? 0 : 4;
}

export function runContractsSchema(
  command: Extract<GhostgetContractsCommand, { readonly command: "contracts-schema" }>,
  output: GhostgetContractsOutput,
): number {
  output.stdout(exactContractJson(contractSchema(command.name)));
  return 0;
}
