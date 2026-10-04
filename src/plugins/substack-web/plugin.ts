import {
  defineProviderPlugin,
  lazyWebSessionRuntime,
} from "../../provider-plugin";
import {
  browserSessionAuthKinds,
  webSessionContractOperations,
  webImplementationSources,
} from "../../provider-plugin-builtins";
import archivedSubstackWebManifest from "../../assets/adapters/substack/wrench-web-adapter.v1.8.0.json";
import type { OperationInput } from "../../model";
import {
  planWebSessionContractDispatches,
  reviewedArchivedWebSessionContract,
  webSessionContractDefinitions,
} from "../../web-session-contract-definitions";
import { materializeSubstackMessagingList } from "../../providers/substack-omni";

const substackContracts = webSessionContractDefinitions.substack;
if (substackContracts === undefined) {
  throw new Error("Substack web-session contracts are not installed");
}

// Keep the original v1 reservations byte-for-byte compatible with prior
// receipts. Each is a separate disabled route, never an alias to v2 input.
function archivedSubscriberOperation(
  operation: "subscribers.export" | "subscribers.import" | "subscribers.import.status",
  risk: "R1" | "R3",
) {
  const contract = reviewedArchivedWebSessionContract(
    archivedSubstackWebManifest,
    {
      adapterId: "substack-web",
      adapterVersion: "1.8.0",
      site: "substack",
      operation,
      contractVersion: 1,
      risk,
      state: "capture-required",
      implementation:
        `substack ${operation} requires a fresh reviewed authenticated first-party contract before execution`,
    },
  );
  return Object.freeze({
    name: contract.operation,
    contractVersion: contract.contractVersion,
    risk: contract.risk,
    input: contract.input,
    sideEffect: contract.sideEffect,
    idempotency: contract.idempotency,
    dedupeWindowMs: contract.dedupeWindowMs,
    state: contract.state,
    dispatch: contract.dispatch,
    implementation: contract.implementation,
    planDispatches: (input: OperationInput) =>
      planWebSessionContractDispatches(contract, input),
    validateInput: () => Object.freeze([]),
  });
}

const archivedSubscriberOperations = Object.freeze([
  archivedSubscriberOperation("subscribers.export", "R1"),
  archivedSubscriberOperation("subscribers.import", "R3"),
  archivedSubscriberOperation("subscribers.import.status", "R1"),
]);

export const substackWebPlugin = defineProviderPlugin({
  apiVersion: 1,
  id: "substack-web",
  version: "1.7.0",
  displayName: "Substack Authenticated Web",
  sourceKind: "built-in",
  implementationSources: webImplementationSources(import.meta.url, [
    ["providers/read-failure.ts", "../../providers/read-failure.ts"],
    ["providers/substack-web.ts", "../../providers/substack-web.ts"],
    ["providers/substack-web-runtime.ts", "../../providers/substack-web-runtime.ts"],
    ["providers/substack-video-mp4.ts", "../../providers/substack-video-mp4.ts"],
    ["providers/iso-bmff.ts", "../../providers/iso-bmff.ts"],
    ["providers/substack-omni.ts", "../../providers/substack-omni.ts"],
  ]),
  bindings: [{
    transport: "web-session-api",
    surfaceId: "substack",
    origin: "https://substack.com",
    protectedHostnameFamilies: ["substack.com"],
    authKinds: browserSessionAuthKinds,
    operations: [...webSessionContractOperations(
      Object.values(substackContracts),
      "094ccfba4f96ee1deed26201cab94154b8471f4f80db5d6e273c4f4117601427",
      {
        "posts.publish": [2],
      },
      {
        "messaging.list": {
          state: "supported",
          schemaVersion: 1,
          materializerId: "substack-messaging-list",
          materializerVersion: 1,
          materialize: materializeSubstackMessagingList,
        },
        "messaging.read": {
          state: "unsupported",
          reason: "Substack message reads remain capture-required",
        },
      },
    ).map((operation) => {
      if (
        operation.name === "posts.publish"
        || operation.name === "comments.create"
        || operation.name === "replies.create"
      ) {
        return Object.freeze({
          ...operation,
          reconciliation: Object.freeze({
            kind: "provider-accepted-target-presence" as const,
          }),
        });
      }
      if (operation.name === "content.delete") {
        return Object.freeze({
          ...operation,
          reconciliation: Object.freeze({
            kind: "boolean-desired-state" as const,
            desiredState: (): boolean => false,
          }),
        });
      }
      return operation;
    }), ...archivedSubscriberOperations],
    subject: {
      format: "substack:<numeric-id>",
      matches: (value) => /^substack:[0-9]{1,32}$/u.test(value),
    },
    runtime: lazyWebSessionRuntime(async () => {
      const runtime = await import("../../providers/substack-web-runtime");
      return {
        probe: runtime.probeSubstackWebSubject,
        execute: (_manifest, recipe, input, auth, options) =>
          runtime.executeSubstackWebOperation(recipe, input, auth, options),
        reconcile: async (operation, input, auth, context) => {
          if (operation === "content.delete") {
            const readback = await runtime.readSubstackWebContentDeleteDesiredState({
              site: "substack",
              action: operation,
              contractVersion: 1,
              timeoutMs: 60_000,
              maxOutputBytes: 8 * 1024 * 1024,
            }, input, auth);
            return {
              actualState: readback.present,
              reason: "exact-target-absence-readback",
            };
          }
          if (operation === "comments.create" || operation === "replies.create") {
            if (context?.kind !== "provider-accepted-target-presence") {
              throw new Error(`Substack ${operation} reconciliation requires one exact accepted target`);
            }
            const readback = await runtime.readSubstackWebAcceptedCommentTargetPresence({
              site: "substack",
              action: operation,
              contractVersion: 1,
              timeoutMs: 60_000,
              maxOutputBytes: 8 * 1024 * 1024,
            }, input, auth, context.target.identifier);
            return {
              actualState: readback.present,
              reason: "exact-target-readback",
            };
          }
          if (operation !== "posts.publish") {
            throw new Error(`Substack ${operation} has no reconciliation hook`);
          }
          if (context?.kind !== "provider-accepted-target-presence") {
            throw new Error("Substack posts.publish reconciliation requires one exact accepted target");
          }
          const readback = await runtime.readSubstackWebAcceptedNoteTargetPresence({
            site: "substack",
            action: operation,
            contractVersion: 3,
            timeoutMs: 60_000,
            maxOutputBytes: 8 * 1024 * 1024,
          }, input, auth, context.target.identifier);
          return {
            actualState: readback.present,
            reason: "exact-target-readback",
          };
        },
      };
    }),
  }],
});

export default substackWebPlugin;
