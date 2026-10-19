import type { GhostgetManifest, InputSchema, OperationInput } from "./model";
import { defineProviderPlugin, lazyProviderApiRuntime, lazyWebSessionRuntime, type WebSessionPluginOperationDefinitionV1 } from "./provider-plugin";
import { createProviderPluginRegistry } from "./provider-plugin-registry";
import { generatedProviderPlugins } from "./provider-plugins.generated";

const text = { type: "string", description: "Synthetic bounded text", minLength: 1, maxLength: 25_000 } as const;
const identifier = { type: "string", description: "Synthetic target identifier", minLength: 1, maxLength: 64 } as const;
const boolean = { type: "boolean", description: "Synthetic desired state" } as const;
const schemas: Readonly<Record<string, InputSchema>> = {
  "content.save": { properties: { post_id: identifier, saved: boolean }, required: ["post_id", "saved"] },
  "likes.set": { properties: { post_id: identifier, liked: boolean }, required: ["post_id", "liked"] },
  "posts.publish": { properties: { body: text, media: { type: "array", description: "Synthetic attachments", minItems: 1, maxItems: 4, items: { type: "file", description: "Synthetic bounded attachment", maxBytes: 1_048_576, mediaTypes: ["image/png"] } }, media_types: { type: "array", description: "Synthetic content types", minItems: 1, maxItems: 4, items: { type: "string", description: "Synthetic content type", enum: ["image/png"] } } }, required: ["body"] },
  "posts.read": { properties: { post_id: identifier }, required: ["post_id"] },
  "feeds.read": { properties: { feed: text, limit: { type: "number", description: "Synthetic page size", minimum: 1, maximum: 100 } }, required: ["feed"] },
  "articles.publish": { properties: { title: text, body: text, draft_id: identifier }, required: ["title", "body"] },
};
const definitions: readonly WebSessionPluginOperationDefinitionV1[] = Object.entries(schemas).map(([name, input]) => {
  const read = name.endsWith(".read");
  return {
    name, contractVersion: name === "likes.set" || name === "posts.read" ? 2 : name === "posts.publish" ? 7 : name === "articles.publish" ? 4 : 1,
    risk: read ? "R1" : name === "posts.publish" || name === "articles.publish" ? "R3" : "R2",
    input, sideEffect: read ? "none" : "Changes one synthetic target", idempotency: read ? "none" : "local-at-most-once", dedupeWindowMs: read ? 0 : 86_400_000,
    state: name === "articles.publish" ? "capture-required" : "observed", dispatch: read ? "none" : "single", implementation: "inert kernel boundary fixture",
    planDispatches: () => read ? [] : [{ id: name, description: `Dispatch one reviewed ${name} internal API action` }],
    validateInput: () => [],
    ...(name === "content.save" || name === "likes.set" ? { reconciliation: { kind: "boolean-desired-state" as const, desiredState: (value: OperationInput) => value[name === "content.save" ? "saved" : "liked"] === true } }
      : name === "posts.publish" ? { reconciliation: { kind: "provider-accepted-target-presence" as const } } : {}),
  };
});
const kernelWebPlugin = defineProviderPlugin({
  apiVersion: 1, id: "kernel-web", version: "1.0.0", displayName: "Kernel fixture", sourceKind: "source",
  implementationSources: [{ label: "plugin.ts", url: new URL("./provider-plugin-test-fixture.ts", import.meta.url) }],
  bindings: [{ transport: "web-session-api", surfaceId: "kernel-fixture", origin: "https://kernel.example", authKinds: ["cookie-source", "browser-profile", "cookies-file"],
    operations: definitions, subject: { format: "numeric fixture ID", matches: value => /^[0-9]{1,19}$/u.test(value) },
    runtime: lazyWebSessionRuntime(async () => ({ probe: async () => "12345", execute: async () => { throw new Error("inert kernel fixture has no provider transport"); }, reconcile: async () => ({actualState: true, reason: "synthetic fixture"}) })),
  }],
});
const threadInput: InputSchema = { properties: { items: { type: "array", description: "Synthetic dispatch items", minItems: 1, maxItems: 20, items: { type: "string", description: "Synthetic item", minLength: 1, maxLength: 2_000 } } }, required: ["items"] };
const kernelOfficialPlugin = defineProviderPlugin({
  apiVersion: 1, id: "kernel-official", version: "1.0.0", displayName: "Kernel provider fixture", sourceKind: "source",
  implementationSources: [{ label: "plugin.ts", url: new URL("./provider-plugin-test-fixture.ts", import.meta.url) }],
  bindings: [{ transport: "provider-api", surfaceId: "kernel-provider", origin: "https://provider.kernel.example", authKinds: ["oauth-token-file"],
    operations: [{ name: "threads.publish", contractVersion: 1, risk: "R3", input: threadInput, sideEffect: "Changes bounded synthetic targets", idempotency: "local-at-most-once", dedupeWindowMs: 86_400_000,
      state: "observed", dispatch: "thread-items", implementation: "inert provider dispatch fixture", requiredScopeSets: [["fixture.write"]], coverage: ["synthetic-dispatch-boundaries"], validateInput: () => [],
      planDispatches: value => (value.items as readonly string[]).map((_, index) => ({id: `publish-item[${index + 1}]`, description: `Dispatch synthetic item ${index + 1}`})),
    }],
    subject: { format: "numeric fixture ID", matches: value => /^[0-9]{1,19}$/u.test(value) },
    runtime: lazyProviderApiRuntime(async () => ({execute: async () => { throw new Error("inert provider fixture has no transport"); }})),
  }],
});
export const kernelFixtureRegistry = createProviderPluginRegistry([...generatedProviderPlugins, kernelWebPlugin, kernelOfficialPlugin]);
export function kernelProviderManifest(): GhostgetManifest {
  return { schemaVersion: 3, id: "kernel-provider", version: "1.0.0", displayName: "Kernel provider fixture", surfaceId: "kernel-provider", origins: ["https://provider.kernel.example"], browserDomains: ["provider.kernel.example"], operations: {
    "threads.publish": { description: "Dispatch bounded synthetic items", risk: "R3", sideEffect: "Changes bounded synthetic targets", idempotency: "local-at-most-once", dedupeWindowMs: 86_400_000, input: threadInput,
      provider: { provider: "kernel-provider", action: "threads.publish", contractVersion: 1, timeoutMs: 30_000, maxOutputBytes: 1_048_576 } },
  } } as GhostgetManifest;
}
export function kernelWebManifest(): GhostgetManifest {
  return {
    schemaVersion: 4, id: "kernel-web", version: "1.0.0", displayName: "Kernel fixture", surfaceId: "kernel-fixture", origins: ["https://kernel.example"], browserDomains: ["kernel.example"],
    operations: Object.fromEntries(definitions.map(operation => [operation.name, {
      description: operation.state === "observed" ? "Observed synthetic operation" : "Capture-required synthetic operation", risk: operation.risk, sideEffect: operation.sideEffect,
      idempotency: operation.idempotency, dedupeWindowMs: operation.dedupeWindowMs, input: operation.input,
      webSession: { site: "kernel-fixture", action: operation.name, contractVersion: operation.contractVersion, timeoutMs: 600_000, maxOutputBytes: 2_097_152 },
    }])),
  } as GhostgetManifest;
}
