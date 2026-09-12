import type { LocalCliPluginOperationDefinitionV1 } from "./provider-plugin";
import type { AutomationProviderId } from "./messaging-automation-types";

/** Account-wide permission ceiling. The owner host adds exact conversation,
 * action, expiry and capacity grants; generic invoke never dispatches these. */
export function automationPermissionOperation(operation: string): string {
  if (["inspect", "conversations", "resolve", "history", "events"].includes(operation)) return "messaging.automation.read";
  if (operation === "start") return "messaging.automation.sync";
  if (["text", "attachment", "reaction", "sticker", "link", "poll"].includes(operation)) return `messaging.automation.send.${operation}`;
  throw new Error("This messaging action has no admitted host permission.");
}

export function automationOperationDefinitions(provider: AutomationProviderId): readonly LocalCliPluginOperationDefinitionV1[] {
  const names = ["messaging.automation.read", ...(provider === "whatsapp" ? ["messaging.automation.sync"] : []), ...["text", "attachment", "reaction", "sticker", "link", "poll"].map(kind => `messaging.automation.send.${kind}`)];
  return names.map(name => ({
    name, contractVersion: 1, risk: name.endsWith(".read") ? "R1" : name.endsWith(".sync") ? "R2" : "R3",
    input: { properties: {}, required: [] },
    sideEffect: name.endsWith(".read") ? "none" : name.endsWith(".sync") ? "Maintain an explicitly started linked-device sync session; may emit protocol acknowledgements." : "Submit one exact action through an enrolled conversation and an unexpired bounded owner grant; delivery remains unknown.",
    idempotency: name.endsWith(".read") ? "none" : "local-at-most-once", dedupeWindowMs: name.endsWith(".read") ? 0 : 86_400_000, state: "observed", dispatch: name.endsWith(".read") ? "none" : "single",
    implementation: "ghostget.messaging-automation/1 scoped owner host; managed allow plus exact account incarnation, provider closure, route, expiry, capacity, durable action claim and cleanup custody",
    validateInput: () => ["This permission is available only through ghostget messaging automation serve --stdio."],
    planDispatches: () => { throw new Error("Use the scoped messaging automation host."); },
  }));
}

// The automatic plugin closure includes the concrete adapter, validation and
// pinned runtime. The owner permission kernel stays outside provider plugins.
export function loadImsgAutomationRuntime() { return import("./providers/imessage-automation"); }
export function loadWhatsAppAutomationRuntime() { return import("./providers/whatsapp-automation"); }
