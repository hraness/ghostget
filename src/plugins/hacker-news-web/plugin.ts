import type { OperationInput } from "../../model";
import {
  defineProviderPlugin,
  lazyWebSessionRuntime,
} from "../../provider-plugin";
import {
  browserSessionAuthKinds,
  webSessionContractOperations,
  webImplementationSources,
} from "../../provider-plugin-builtins";
import { webSessionContractDefinitions } from "../../web-session-contract-definitions";

const hackerNewsContracts = webSessionContractDefinitions["hacker-news"];
if (hackerNewsContracts === undefined) {
  throw new Error("Hacker News web-session contracts are not installed");
}

function booleanDesiredState(
  name: "saved" | "upvoted",
): (input: OperationInput) => boolean {
  return (input) => {
    const value = input[name];
    if (typeof value !== "boolean") {
      throw new Error(
        `Hacker News reconciliation requires boolean input.${name}`,
      );
    }
    return value;
  };
}

const operations = webSessionContractOperations(
  Object.values(hackerNewsContracts),
  "e4dd2df83eb091a936ebf8d4339a25fae7ae123a037872ad2089cace949dff6e",
).map((operation) => {
  if (
    operation.name === "comments.create"
    || operation.name === "replies.create"
    || operation.name === "posts.publish"
  ) {
    return Object.freeze({
      ...operation,
      reconciliation: Object.freeze({
        kind: "boolean-desired-state" as const,
        desiredState: (): boolean => true,
      }),
    });
  }
  if (operation.name === "content.save" || operation.name === "reactions.set") {
    return Object.freeze({
      ...operation,
      reconciliation: Object.freeze({
        kind: "boolean-desired-state" as const,
        desiredState: booleanDesiredState(
          operation.name === "content.save" ? "saved" : "upvoted",
        ),
      }),
    });
  }
  return operation;
});

export const hackerNewsWebPlugin = defineProviderPlugin({
  apiVersion: 1,
  id: "hacker-news-web",
  version: "1.2.0",
  displayName: "Hacker News Authenticated Web",
  sourceKind: "built-in",
  implementationSources: webImplementationSources(import.meta.url, [
    ["providers/hacker-news-web.ts", "../../providers/hacker-news-web.ts"],
    ["providers/hacker-news-web-runtime.ts", "../../providers/hacker-news-web-runtime.ts"],
  ]),
  bindings: [{
    transport: "web-session-api",
    surfaceId: "hacker-news",
    origin: "https://news.ycombinator.com",
    protectedHostnameFamilies: ["news.ycombinator.com"],
    authKinds: browserSessionAuthKinds,
    operations,
    subject: {
      format: "hacker-news:<username>",
      matches: (value) => /^hacker-news:[A-Za-z0-9_-]{1,64}$/u.test(value),
    },
    runtime: lazyWebSessionRuntime(async () => {
      const runtime = await import("../../providers/hacker-news-web-runtime");
      return {
        probe: runtime.probeHackerNewsWebSubject,
        execute: (_manifest, recipe, input, auth, options) =>
          runtime.executeHackerNewsWebOperation(recipe, input, auth, options),
        reconcile: async (operation, input, auth, _context) => {
          if (
            operation === "comments.create"
            || operation === "replies.create"
            || operation === "posts.publish"
          ) {
            const recipe = {
              site: "hacker-news",
              action: operation,
              contractVersion: 1,
              timeoutMs: 60_000,
              maxOutputBytes: 4 * 1024 * 1024,
            };
            const readback = operation === "posts.publish"
              ? await runtime.readHackerNewsWebPublishedPostPresence(
                  recipe, input, auth,
                )
              : await runtime.readHackerNewsWebPublishedCommentPresence(
                  recipe, input, auth,
                );
            return {
              actualState: readback.present,
              reason: "exact-discovered-readback",
            };
          }
          if (
            operation === "content.save"
            || operation === "reactions.set"
          ) {
            const readback = await runtime.readHackerNewsWebDesiredState({
              site: "hacker-news",
              action: operation,
              contractVersion: 1,
              timeoutMs: 60_000,
              maxOutputBytes: 4 * 1024 * 1024,
            }, input, auth);
            return {
              actualState: readback.enabled,
              reason: "exact-readback",
            };
          }
          throw new Error(`Hacker News ${operation} has no reconciliation hook`);
        },
      };
    }),
  }],
});

export default hackerNewsWebPlugin;
