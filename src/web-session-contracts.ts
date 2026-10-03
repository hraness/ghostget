import { createHash } from "node:crypto";

import { canonicalJsonWithDefinedMembers } from "./canonical-json";
import type {
  BrowserDispatchPlan,
  OperationInput,
  WebSessionRecipe,
  WebSessionSiteId,
} from "./model";
import type { WebSessionPluginOperationV1 } from "./provider-plugin";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";
import type { ProviderPluginOperationName } from "./provider-plugin-identifiers";
import type {
  WebSessionContract,
  WebSessionContractState,
} from "./web-session-contract-definitions";

export type { WebSessionContract, WebSessionContractState };

function stableJson(value: unknown): string {
  return canonicalJsonWithDefinedMembers(value, "authenticated web contract");
}

const currentMarketplaceCursorDescription =
  "wrench-issued authenticated cursor returned by a complete prior Marketplace page; one chain supports at most 48 provider pages";
const predecessorMarketplaceCursorDescription =
  "oh-issued authenticated cursor returned by a complete prior Marketplace page; one chain supports at most 48 provider pages";

const predecessorHackerNewsWriteOperations = new Set<string>([
  "comments.create",
  "content.save",
  "posts.publish",
  "reactions.set",
  "replies.create",
]);

function predecessorHackerNewsContractValue(
  contract: WebSessionContract,
): WebSessionContract {
  // Hacker News write contracts graduated from capture-required reservations
  // to observed mutations. Durable predecessor receipts carried the reserved
  // state and the generic capture-required implementation text, so stored
  // rows and compatibility checks must project the contract back to that
  // exact predecessor value.
  // The predecessor submission schema constrained the link URL to adapter
  // origins. Graduation widened it to the external submission payload, so
  // the projected predecessor input restores that exact field constraint.
  const url = contract.input.properties["url"];
  const input = contract.operation === "posts.publish"
    && url !== undefined && url.type === "string"
    ? {
      ...contract.input,
      properties: {
        ...contract.input.properties,
        url: { ...url, format: "url" as const },
      },
    }
    : contract.input;
  return Object.freeze({
    ...contract,
    state: "capture-required",
    implementation:
      `hacker-news ${contract.operation} requires a fresh reviewed authenticated first-party contract before execution`,
    input,
  });
}

function predecessorXWebContractValue(
  contract: WebSessionContract,
): WebSessionContract {
  // The X replies.create contract graduated from a capture-required
  // reservation to an observed mutation. Durable predecessor receipts carried
  // the reserved state and reservation implementation text, so stored rows
  // and compatibility checks must project the contract back to that exact
  // predecessor value.
  return Object.freeze({
    ...contract,
    state: "capture-required",
    implementation:
      "CreateTweet reply needs an authorized live fixture and reviewed transaction-header behavior",
  });
}

function predecessorBlueskyWebContractValue(
  contract: WebSessionContract,
): WebSessionContract {
  // The Bluesky replies.create contract graduated from a capture-required
  // reservation to an observed mutation. Durable predecessor receipts carried
  // the reserved state and reservation implementation text, so stored rows
  // and compatibility checks must project the contract back to that exact
  // predecessor value.
  return Object.freeze({
    ...contract,
    state: "capture-required",
    implementation:
      "bluesky replies.create requires a fresh reviewed authenticated first-party contract before execution",
  });
}

function predecessorBlueskyFeedsReadContractValue(
  contract: WebSessionContract,
): WebSessionContract {
  // The Bluesky feeds.read v1 manifest widened the input schema for the
  // search feed. Durable predecessor receipts bound the exact predecessor
  // schema, so compatibility checks must project the contract back to it.
  const feed = contract.input.properties["feed"];
  const properties = { ...contract.input.properties };
  if (feed !== undefined && feed.type === "string") {
    properties["feed"] = {
      ...feed,
      enum: ["home", "notifications", "bookmarks"],
    };
  }
  delete properties["query"];
  delete properties["sort"];
  return Object.freeze({
    ...contract,
    input: Object.freeze({ ...contract.input, properties: Object.freeze(properties) }),
  });
}

function predecessorCompatibleWebSessionContractValue(
  contract: WebSessionContract,
): unknown {
  if (
    contract.site === "hacker-news"
    && contract.contractVersion === 1
    && contract.state === "observed"
    && predecessorHackerNewsWriteOperations.has(contract.operation)
  ) return predecessorHackerNewsContractValue(contract);
  if (
    contract.site === "x"
    && contract.contractVersion === 1
    && contract.state === "observed"
    && contract.operation === "replies.create"
  ) return predecessorXWebContractValue(contract);
  if (
    contract.site === "bluesky"
    && contract.contractVersion === 1
    && contract.state === "observed"
    && contract.operation === "replies.create"
  ) return predecessorBlueskyWebContractValue(contract);
  if (
    contract.site === "bluesky"
    && contract.contractVersion === 1
    && contract.operation === "feeds.read"
  ) return predecessorBlueskyFeedsReadContractValue(contract);
  // The plugin advertises historical v1 and active v2 from one present
  // operation schema. Both exact predecessor rows carried the Oh cursor text.
  // Future versions must never inherit this compatibility projection.
  const isExactPredecessorMarketplaceFeedVersion =
    contract.contractVersion === 1 || contract.contractVersion === 2;
  if (
    contract.site !== "facebook-marketplace"
    || contract.operation !== "feeds.read"
    || !isExactPredecessorMarketplaceFeedVersion
  ) return contract;
  const project = (value: unknown): unknown => {
    if (value === currentMarketplaceCursorDescription) {
      return predecessorMarketplaceCursorDescription;
    }
    if (Array.isArray(value)) return value.map(project);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, project(entry)]),
    );
  };
  return project(contract);
}

function hashWebSessionContractWithImplementation(
  contract: WebSessionContract,
  implementationHash: Uint8Array,
): string {
  return createHash("sha256")
    .update(stableJson(predecessorCompatibleWebSessionContractValue(contract)))
    .update("\0")
    .update(implementationHash)
    .digest("hex");
}

function requireWebSessionOperation(
  recipe: Pick<WebSessionRecipe, "site" | "action" | "contractVersion">,
  registry: ProviderPluginRegistry,
) {
  const binding = registry.resolveSessionRoute(recipe.site);
  const resolution = binding === undefined
    ? undefined
    : registry.resolveOperationDefinition(
      binding.transport,
      recipe.site,
      recipe.action,
      recipe.contractVersion,
    );
  if (
    resolution === undefined
    || resolution.binding.transport === "provider-api"
  ) {
    throw new Error(
      `authenticated web contract ${recipe.site}/${recipe.action}@${recipe.contractVersion} is not installed`,
    );
  }
  return {
    ...resolution,
    operation: resolution.operation as WebSessionPluginOperationV1,
  };
}

function projectWebSessionContract(
  site: WebSessionSiteId,
  operationName: ProviderPluginOperationName,
  contractVersion: number,
  registry: ProviderPluginRegistry,
): WebSessionContract {
  const { operation } = requireWebSessionOperation({
    site,
    action: operationName,
    contractVersion,
  }, registry);
  return Object.freeze({
    site,
    operation: operation.name,
    contractVersion,
    risk: operation.risk,
    input: operation.input,
    sideEffect: operation.sideEffect,
    idempotency: operation.idempotency,
    dedupeWindowMs: operation.dedupeWindowMs,
    state: operation.state,
    dispatch: operation.dispatch,
    implementation: operation.implementation,
  });
}

const webSessionContractCaches = new WeakMap<
  ProviderPluginRegistry,
  Map<string, WebSessionContract>
>();

function webSessionContractCache(
  registry: ProviderPluginRegistry,
): Map<string, WebSessionContract> {
  const existing = webSessionContractCaches.get(registry);
  if (existing !== undefined) return existing;
  const created = new Map<string, WebSessionContract>();
  webSessionContractCaches.set(registry, created);
  return created;
}

function webSessionContractKey(
  recipe: Pick<WebSessionRecipe, "site" | "action" | "contractVersion">,
): string {
  return `${recipe.site}/${recipe.action}@${recipe.contractVersion}`;
}

export function getWebSessionContract(
  recipe: WebSessionRecipe,
  registry: ProviderPluginRegistry,
): WebSessionContract {
  const resolution = requireWebSessionOperation(recipe, registry);
  const key = webSessionContractKey(recipe);
  const existing = webSessionContractCache(registry).get(key);
  if (existing !== undefined) return existing;
  const projected = projectWebSessionContract(
    recipe.site,
    recipe.action,
    resolution.contractVersion,
    registry,
  );
  webSessionContractCache(registry).set(key, projected);
  return projected;
}

export function webSessionContractHash(
  contract: WebSessionContract,
  registry: ProviderPluginRegistry,
): string {
  const { binding } = requireWebSessionOperation({
    site: contract.site,
    action: contract.operation,
    contractVersion: contract.contractVersion,
  }, registry);
  return hashWebSessionContractWithImplementation(
    contract,
    registry.contractImplementationHash(binding),
  );
}

/** Accept only canonical writer identity or exact bounded predecessor aliases. */
export function isCompatibleWebSessionContractHash(
  contract: WebSessionContract,
  candidate: string,
  registry: ProviderPluginRegistry,
): boolean {
  if (candidate === webSessionContractHash(contract, registry)) return true;
  const { binding } = requireWebSessionOperation({
    site: contract.site,
    action: contract.operation,
    contractVersion: contract.contractVersion,
  }, registry);
  return registry.legacyContractImplementationHashes(
    binding,
    contract.operation,
    contract.contractVersion,
  ).some(
    (implementationHash) =>
      hashWebSessionContractWithImplementation(
        contract,
        implementationHash,
      ) === candidate,
  );
}

export function planWebSessionDispatches(
  recipe: WebSessionRecipe,
  input: OperationInput,
  registry: ProviderPluginRegistry,
): readonly BrowserDispatchPlan[] {
  getWebSessionContract(recipe, registry);
  return requireWebSessionOperation(recipe, registry).operation.planDispatches(input);
}

export function webSessionConditionalInputIssues(
  recipe: WebSessionRecipe,
  input: OperationInput,
  registry: ProviderPluginRegistry,
): readonly string[] {
  getWebSessionContract(recipe, registry);
  return requireWebSessionOperation(recipe, registry).operation.validateInput(input);
}
