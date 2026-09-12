import { randomUUID } from "node:crypto";
import { canonicalJson, sha256 } from "./canonical-json";
import type { GhostgetAuth } from "./auth";
import { MessagingAutomationHost } from "./messaging-automation";
import type { AutomationActionKind, AutomationProviderId, AutomationProviderStatus, MessagingAutomationProvider } from "./messaging-automation-types";
import { AUTOMATION_ACTION_KINDS } from "./messaging-automation-validation";
import { automationPermissionOperation, loadImsgAutomationRuntime, loadWhatsAppAutomationRuntime } from "./messaging-automation-descriptors";
import { describeOperationPermission, type OperationPermissionDescription } from "./operation-permission";
import { loadProviderPluginExtensionRuntime } from "./provider-plugin";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";
import { acquireWebSessionCleanupAdmission, type WebSessionCleanupAdmissionController } from "./web-session-cleanup-admission";
import type { ProviderPluginCleanupBarrierRegistrar } from "./provider-plugin-cleanup-execution";
import { AutomationHostRecoveryRequired, type AutomationHostAccount, type AutomationHostSession } from "./messaging-automation-server";

type Environment = Readonly<Record<string, string | undefined>>;
type Concrete = MessagingAutomationProvider & { start?(signal?: AbortSignal): Promise<void> };
type Admission = Readonly<{ auth: GhostgetAuth; accountIdentity: string; implementationIdentity: string }>;
export type MessagingAutomationSessionOptions = Readonly<{
  providers: readonly AutomationHostAccount[];
  environment: Environment;
  registry: ProviderPluginRegistry;
  resolveAsset(assetId: string, signal?: AbortSignal): Promise<Readonly<{ bytes: Uint8Array; sha256: string }>>;
}>;

/** Reads account metadata only when an explicit owner operation calls authorize.
 * Creation never starts a network connection or reads a conversation. */
export async function createMessagingAutomationSession(options: MessagingAutomationSessionOptions): Promise<AutomationHostSession> {
  const providers: MessagingAutomationProvider[] = [];
  const starts = new Map<AutomationProviderId, (signal?: AbortSignal) => Promise<AutomationProviderStatus>>();
  try {
    for (const selected of options.providers) {
      const adapterId = selected.provider === "imessage" ? "imessage-direct" : "whatsapp-web";
      let custody: WebSessionCleanupAdmissionController | undefined;
      let custodyIdentity: string | undefined;
      let poisoned = false, persistent = false, closed = false, started = false;
      let watching: ReturnType<typeof setInterval> | undefined;
      let closing: Promise<void> | undefined;
      const describe = (operation: string, signal?: AbortSignal) => describeOperationPermission(adapterId, automationPermissionOperation(operation), selected.authId, { registry: options.registry, environment: options.environment, ...(signal ? { signal } : {}) });
      const identity = (description: OperationPermissionDescription) => sha256(canonicalJson({
        protocol: "ghostget.messaging-automation/1", provider: selected.provider,
        pluginId: description.coordinate.pluginId, manifestHash: description.coordinate.manifestHash,
        closureHash: description.coordinate.closureHash, portableHash: description.coordinate.portableHash,
      }));
      const authorize = async (operation: string, signal?: AbortSignal): Promise<Admission> => {
        signal?.throwIfAborted();
        if (poisoned) throw new AutomationHostRecoveryRequired("Host custody unavailable");
        if (closed) throw new Error("Host closed");
        const description = describe(operation, signal);
        if (description.decision !== "allow") throw new Error("Explicit managed operation allow required");
        const auth = description.auth as GhostgetAuth;
        if (auth.kind !== "linked-device-store" || auth.provider !== selected.provider || auth.id !== selected.authId) throw new Error("Exact linked-device account required");
        const implementationIdentity = identity(description);
        const coordinate = sha256(canonicalJson({ auth, incarnation: description.coordinate.authIncarnation, implementationIdentity }));
        if (custody && coordinate !== custodyIdentity) throw new Error("Account or implementation changed during host custody");
        if (!custody) {
          const plugin = description.resolution.plugin;
          custody = acquireWebSessionCleanupAdmission({
            runId: randomUUID(), pluginId: plugin.id, pluginVersion: plugin.version,
            pluginImplementationHash: options.registry.implementationHash(description.resolution.binding).toString("hex"),
            adapterId, adapterHash: description.coordinate.manifestHash, surfaceId: selected.provider,
            authId: selected.authId, authHash: sha256(canonicalJson(auth)),
            transport: selected.provider === "imessage" ? "local-cli" : "web-session-api",
            executionIdentityHash: implementationIdentity,
          }, options.environment);
          custodyIdentity = coordinate;
        }
        return { auth, accountIdentity: description.coordinate.authIncarnation, implementationIdentity };
      };
      const registerCleanupBarrier: ProviderPluginCleanupBarrierRegistrar = barrier => {
        if (!custody || poisoned || closed) throw new AutomationHostRecoveryRequired("Provider cleanup has no durable admission");
        return custody.registerCleanupBarrier(barrier);
      };
      let finishing: Promise<void> | undefined;
      const finishCustody = (): Promise<void> => {
        if (finishing) return finishing;
        finishing = (async () => {
        if (!custody) return;
        const owned = custody; owned.closeRegistration();
        const settled = await Promise.allSettled(owned.barriers);
        if (settled.some(item => item.status === "rejected")) {
          poisoned = true; owned.cleanupUnsafe(); throw new AutomationHostRecoveryRequired("Provider cleanup remains uncertain");
        }
        owned.cleanupComplete(); owned.release(); custody = undefined; custodyIdentity = undefined;
        })().finally(() => { finishing = undefined; });
        return finishing;
      };
      const execution = { environment: options.environment, registerCleanupBarrier };
      const binding = options.registry.requireOperationDefinition(selected.provider === "imessage" ? "local-cli" : "linked-device", selected.provider, "messaging.automation.read", 1).binding;
      const concrete: Concrete = await loadProviderPluginExtensionRuntime(binding.loadRuntime, async () => selected.provider === "imessage"
        ? (await loadImsgAutomationRuntime()).createImsgAutomationProvider({ authorize, execution, resolveAsset: options.resolveAsset })
        : (await loadWhatsAppAutomationRuntime()).createWhatsAppAutomationProvider({ authorize, execution, resolveAsset: options.resolveAsset }));
      const call = async <T>(work: () => Promise<T>): Promise<T> => {
        if (poisoned) throw new AutomationHostRecoveryRequired("Host is fenced");
        if (closed) throw new Error("Host closed");
        try { return await work(); } finally { if (!persistent) await finishCustody(); }
      };
      const status = async (signal?: AbortSignal) => call(async () => {
        const status = await concrete.inspect(signal);
        const actions = Object.fromEntries(AUTOMATION_ACTION_KINDS.map((kind: AutomationActionKind) => {
          let allowed = false;
          try { const admission = describe(kind, signal); allowed = admission.decision === "allow" && identity(admission) === status.identity.implementationIdentity && admission.coordinate.authIncarnation === status.identity.accountIdentity; } catch { /* unsupported operation has no authority */ }
          return [kind, allowed || !status.actions[kind].available ? status.actions[kind] : { available: false, reason: "Enable this exact account operation in Ghostget permissions before granting a contact access." }];
        })) as AutomationProviderStatus["actions"];
        return { ...status, actions };
      });
      const wrapped: MessagingAutomationProvider = {
        provider: selected.provider, inspect: status,
        conversations: (input, signal) => call(() => concrete.conversations(input, signal)),
        resolve: (input, signal) => call(() => concrete.resolve(input, signal)),
        history: (input, signal) => call(() => concrete.history(input, signal)),
        events: (input, signal) => call(() => concrete.events(input, signal)),
        send: (input, signal) => call(() => concrete.send(input, signal)),
        close: () => {
          if (closing) return closing;
          if (watching) { clearInterval(watching); watching = undefined; }
          closing = (async () => {
            try { await concrete.close(); await finishCustody(); closed = true; }
            catch { poisoned = true; custody?.closeRegistration(); custody?.cleanupUnsafe(); throw new AutomationHostRecoveryRequired("Provider cleanup requires recovery"); }
          })();
          return closing;
        },
      };
      providers.push(wrapped);
      starts.set(selected.provider, async signal => {
        if (!concrete.start || selected.provider !== "whatsapp" || closed || poisoned) throw new Error("This provider has no start operation");
        if (started) return status(signal);
        persistent = true;
        try {
          // The sync ceiling is independent of send/read allows. Watch its
          // exact decision while the linked-device process remains alive.
          const ceiling = describe("start", signal);
          if (ceiling.decision !== "allow") throw new Error("Explicit sync permission required");
          await concrete.start(signal); started = true;
          const check = () => {
            let allowed = false;
            try { const current = describe("start"); allowed = current.decision === "allow" && current.digest === ceiling.digest && current.coordinate.authIncarnation === ceiling.coordinate.authIncarnation; } catch { /* changed/missing auth or policy revokes active sync */ }
            if (!allowed) void wrapped.close().catch(() => undefined);
          };
          watching = setInterval(check, 1_000); watching.unref(); check();
          return await status(signal);
        }
        catch (error) { try { await wrapped.close(); } catch { throw new AutomationHostRecoveryRequired("Provider start cleanup requires recovery"); } throw error; }
      });
    }
    const host = new MessagingAutomationHost(providers, options.environment);
    return { host, start: (provider, signal) => { const start = starts.get(provider); if (!start) throw new Error("Provider not configured"); return start(signal); } };
  } catch (error) { await Promise.allSettled(providers.map(provider => provider.close())); throw error; }
}
