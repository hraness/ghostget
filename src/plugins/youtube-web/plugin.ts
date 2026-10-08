import {
  defineProviderPlugin,
  lazyWebSessionRuntime,
} from "../../provider-plugin";
import {
  browserSessionAuthKinds,
  webSessionContractOperations,
  webImplementationSources,
} from "../../provider-plugin-builtins";
import archivedYouTubeWebManifestV1_4 from "../../assets/adapters/youtube/wrench-web-adapter.v1.4.0.json";
import type { OperationInput } from "../../model";
import {
  planWebSessionContractDispatches,
  reviewedArchivedWebSessionContract,
  webSessionContractDefinitions,
} from "../../web-session-contract-definitions";

const youtubeContracts = webSessionContractDefinitions.youtube;
if (youtubeContracts === undefined) {
  throw new Error("YouTube web-session contracts are not installed");
}

const archivedRepliesCreateV1Contract = reviewedArchivedWebSessionContract(
  archivedYouTubeWebManifestV1_4,
  {
    adapterId: "youtube-web",
    adapterVersion: "1.4.0",
    site: "youtube",
    operation: "replies.create",
    contractVersion: 1,
    risk: "R3",
    state: "capture-required",
    implementation:
      "current reply mutation, parent binding, and an authorized live fixture remain required",
  },
);

const archivedRepliesCreateV1Operation = Object.freeze({
  name: archivedRepliesCreateV1Contract.operation,
  contractVersion: archivedRepliesCreateV1Contract.contractVersion,
  risk: archivedRepliesCreateV1Contract.risk,
  input: archivedRepliesCreateV1Contract.input,
  sideEffect: archivedRepliesCreateV1Contract.sideEffect,
  idempotency: archivedRepliesCreateV1Contract.idempotency,
  dedupeWindowMs: archivedRepliesCreateV1Contract.dedupeWindowMs,
  state: archivedRepliesCreateV1Contract.state,
  dispatch: archivedRepliesCreateV1Contract.dispatch,
  implementation: archivedRepliesCreateV1Contract.implementation,
  planDispatches: (input: OperationInput) =>
    planWebSessionContractDispatches(archivedRepliesCreateV1Contract, input),
  validateInput: () => Object.freeze([]),
});

const desiredStateKeys = Object.freeze({
  "likes.set": "liked",
  "content.save": "saved",
  "relationships.follow.set": "followed",
} as const);

const currentOperations = webSessionContractOperations(
  Object.values(youtubeContracts),
  "d22e1737e2dc1eb0153e3d5e8330d60e706370b849ef01fc856cba3cf4dc93ae",
  {
    "media.publish": [1],
  },
).map((operation) => {
  if (!Object.hasOwn(desiredStateKeys, operation.name)) return operation;
  const stateKey = desiredStateKeys[
    operation.name as keyof typeof desiredStateKeys
  ];
  return Object.freeze({
    ...operation,
    reconciliation: Object.freeze({
      kind: "boolean-desired-state" as const,
      desiredState: (input: Readonly<Record<string, unknown>>): boolean => {
        const value = input[stateKey];
        if (typeof value !== "boolean") {
          throw new Error(
            `YouTube ${operation.name} reconciliation requires boolean input.${stateKey}`,
          );
        }
        return value;
      },
    }),
  });
});

const operations = Object.freeze([
  ...currentOperations,
  archivedRepliesCreateV1Operation,
]);

export const youtubeWebPlugin = defineProviderPlugin({
  apiVersion: 1,
  id: "youtube-web",
  version: "1.4.0",
  displayName: "YouTube Authenticated Web",
  sourceKind: "built-in",
  implementationSources: webImplementationSources(import.meta.url, [
    ["providers/read-failure.ts", "../../providers/read-failure.ts"],
    ["providers/iso-bmff.ts", "../../providers/iso-bmff.ts"],
    ["providers/youtube-web.ts", "../../providers/youtube-web.ts"],
    ["providers/youtube-web-runtime.ts", "../../providers/youtube-web-runtime.ts"],
  ]),
  bindings: [{
    transport: "web-session-api",
    surfaceId: "youtube",
    origin: "https://www.youtube.com",
    protectedHostnameFamilies: ["youtube.com"],
    authKinds: browserSessionAuthKinds,
    operations,
    subject: {
      format: "youtube:channel:<channel-id> with optional Gaia/delegate suffixes",
      matches: (value) => /^youtube:channel:UC[A-Za-z0-9_-]{22}(?:\/gaia:[0-9]{1,32})?(?:\/delegate:[A-Za-z0-9_-]{1,128})?$/u.test(value),
    },
    runtime: lazyWebSessionRuntime(async () => {
      const runtime = await import("../../providers/youtube-web-runtime");
      return {
        probe: runtime.probeYouTubeWebSubject,
        execute: (_manifest, recipe, input, auth, options) =>
          runtime.executeYouTubeWebOperation(recipe, input, auth, options),
        reconcile: async (operation, input, auth) => {
          if (!Object.hasOwn(desiredStateKeys, operation)) {
            throw new Error(`YouTube ${operation} has no reconciliation hook`);
          }
          const readback = await runtime.readYouTubeWebDesiredState({
            site: "youtube",
            action: operation,
            contractVersion: 1,
            timeoutMs: 60_000,
            maxOutputBytes: 4 * 1024 * 1024,
          }, input, auth);
          return {
            actualState: readback.enabled,
            reason: "exact-readback",
          };
        },
      };
    }),
  }],
});

export default youtubeWebPlugin;
