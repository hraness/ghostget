// @bun
import {
  MessagingAutomationHost
} from "./index-r0h6fr9y.js";
import {
  acquireWebSessionCleanupAdmission,
  automationPermissionOperation,
  describeOperationPermission,
  loadImsgAutomationRuntime,
  loadProviderPluginExtensionRuntime,
  loadWhatsAppAutomationRuntime
} from "./index-ng3hr4kj.js";
import"./index-3sdtfztq.js";
import {
  AUTOMATION_ACTION_KINDS,
  automationArray,
  automationDigest,
  automationId,
  automationInteger,
  automationRecord,
  automationText,
  parseAutomationAction
} from "./index-2ymnp8xv.js";
import"./index-81sjy26h.js";
import"./index-r9zhe6em.js";
import"./index-8qr77as7.js";
import"./index-d5mavmrj.js";
import"./index-0ywm1fj9.js";
import"./index-4bpemvnc.js";
import"./index-1r44fcqj.js";
import"./index-619vcbhe.js";
import"./index-26yq8q16.js";
import {
  canonicalJson,
  sha256
} from "./index-8sbt8qwx.js";
import {
  MESSAGING_AUTOMATION_PROTOCOL
} from "./index-01eeae9e.js";
import"./index-z1w83f81.js";

// src/messaging-automation-factory.ts
import { randomUUID as randomUUID2 } from "crypto";

// src/messaging-automation-server.ts
import { createHash, randomUUID } from "crypto";
var MAX_ASSET = 16 * 1024 * 1024;
var MAX_FRAME = 24 * 1024 * 1024;
var MAX_RESPONSE = 32 * 1024 * 1024;
var provider = (value) => {
  if (value !== "imessage" && value !== "whatsapp")
    throw new Error("Invalid provider");
  return value;
};

class AutomationHostRecoveryRequired extends Error {
}

class MessagingAutomationRpcServer {
  options;
  session;
  initialized = false;
  initializing;
  closed = false;
  normalBusy = false;
  priorityBusy = 0;
  requests = new Set;
  assets = new Map;
  executingPlan = null;
  abort = new AbortController;
  closing;
  constructor(options) {
    this.options = options;
  }
  now() {
    return this.options.now?.() ?? Date.now();
  }
  sweep() {
    for (const [id, asset] of this.assets)
      if (asset.expires <= this.now() && asset.plan !== this.executingPlan)
        this.assets.delete(id);
  }
  host() {
    if (!this.session || this.closed)
      throw new Error("Host not ready");
    return this.session.host;
  }
  async dispatch(method, raw) {
    this.sweep();
    if (method === "initialize") {
      if (this.initialized || this.closed)
        throw new Error("Already initialized");
      const r = automationRecord(raw, ["providers"]);
      const accounts = automationArray(r.providers, 2).map((value) => {
        const item = automationRecord(value, ["provider", "authId"]);
        const authId = automationText(item.authId, 48);
        if (!/^[a-z][a-z0-9-]{0,47}$/u.test(authId))
          throw new Error("Invalid account identifier");
        return { provider: provider(item.provider), authId };
      });
      if (accounts.length === 0 || new Set(accounts.map((item) => item.provider)).size !== accounts.length)
        throw new Error("Distinct configured providers required");
      this.initialized = true;
      this.initializing = (this.options.createSession ?? createMessagingAutomationSession)({
        providers: accounts,
        environment: this.options.environment,
        registry: this.options.registry,
        resolveAsset: async (id) => {
          this.sweep();
          const asset = this.assets.get(id);
          if (!asset || !this.executingPlan || asset.plan !== this.executingPlan || asset.expires <= this.now())
            throw new Error("Asset is unavailable for this plan");
          return { bytes: new Uint8Array(asset.bytes), sha256: asset.sha256 };
        }
      });
      this.session = await this.initializing;
      if (this.closed)
        throw new Error("Host closed during initialization");
      return { initialized: true };
    }
    if (method === "close") {
      automationRecord(raw, []);
      await this.close();
      return { closed: true };
    }
    const host = this.host();
    if (method === "status" || method === "start") {
      const r = automationRecord(raw, ["provider"]);
      const selected = provider(r.provider);
      return method === "status" ? host.providerStatus(selected, this.abort.signal) : this.session.start(selected, this.abort.signal);
    }
    if (method === "conversations") {
      const r = automationRecord(raw, ["provider", "limit"]);
      return host.conversations({ provider: provider(r.provider), limit: automationInteger(r.limit, 1, 200) }, this.abort.signal);
    }
    if (method === "enroll") {
      const r = automationRecord(raw, ["provider", "coordinate"]);
      return host.enroll({ provider: provider(r.provider), coordinate: r.coordinate }, this.abort.signal);
    }
    if (method === "enrollments") {
      automationRecord(raw, []);
      return host.enrollments();
    }
    if (method === "grant") {
      const r = automationRecord(raw, ["intentId", "enrollmentId", "expectedBindingDigest", "actions", "expiresAt", "maximumActions", "minimumIntervalMs"]);
      const { intentId, ...request } = r;
      return host.grant(request, automationId(intentId));
    }
    if (method === "grant.by-intent") {
      const r = automationRecord(raw, ["intentId"]);
      return { grant: host.grantByIntent(automationId(r.intentId)) };
    }
    if (method === "grant.get") {
      const r = automationRecord(raw, ["grantId"]);
      return host.grantStatus(automationId(r.grantId));
    }
    if (method === "revoke") {
      const r = automationRecord(raw, ["grantId"]);
      host.revoke(automationId(r.grantId));
      return { revoked: true };
    }
    if (method === "cancel") {
      const r = automationRecord(raw, ["planId"]);
      return { cancelled: host.cancel(automationId(r.planId)) };
    }
    if (method === "poll") {
      const r = automationRecord(raw, ["enrollmentId"]);
      return host.poll(automationId(r.enrollmentId), this.abort.signal);
    }
    if (method === "history") {
      const r = automationRecord(raw, ["enrollmentId", "limit"]);
      return host.history({ enrollmentId: automationId(r.enrollmentId), limit: automationInteger(r.limit, 1, 200) });
    }
    if (method === "events") {
      const r = automationRecord(raw, ["enrollmentIds", "cursor", "limit"]);
      return host.events({ enrollmentIds: automationArray(r.enrollmentIds, 50).map(automationId), cursor: r.cursor === null ? null : automationText(r.cursor, 16384), limit: automationInteger(r.limit, 1, 500) });
    }
    if (method === "asset") {
      const r = automationRecord(raw, ["bytesBase64", "sha256"]);
      const digest = automationDigest(r.sha256);
      if (typeof r.bytesBase64 !== "string" || r.bytesBase64.length > Math.ceil(MAX_ASSET / 3) * 4)
        throw new Error("Invalid asset length");
      const bytes = Buffer.from(r.bytesBase64, "base64");
      if (!bytes.length || bytes.length > MAX_ASSET || bytes.toString("base64") !== r.bytesBase64 || createHash("sha256").update(bytes).digest("hex") !== digest)
        throw new Error("Invalid asset");
      if (this.assets.size >= 32 || [...this.assets.values()].reduce((sum, asset) => sum + asset.bytes.length, bytes.length) > 64 * 1024 * 1024)
        throw new Error("Asset capacity exceeded");
      const assetId = `asset:${randomUUID()}`, expires = this.now() + 300000;
      this.assets.set(assetId, { bytes, sha256: digest, expires, plan: null });
      return { assetId, bytes: bytes.length, sha256: digest, expiresAt: new Date(expires).toISOString() };
    }
    if (method === "prepare") {
      const r = automationRecord(raw, ["enrollmentId", "expectedRevision", "intentId", "actions"]);
      const actions = automationArray(r.actions, 8).map(parseAutomationAction);
      const ids = new Set(actions.flatMap((action) => action.kind === "attachment" || action.kind === "sticker" ? [action.assetId] : []));
      for (const id of ids) {
        const asset = this.assets.get(id);
        if (!asset || asset.plan !== null)
          throw new Error("Missing or already-bound asset");
      }
      const plan = host.prepare({ enrollmentId: automationId(r.enrollmentId), expectedRevision: automationInteger(r.expectedRevision, 0, Number.MAX_SAFE_INTEGER), intentId: automationId(r.intentId), actions });
      for (const id of ids) {
        const asset = this.assets.get(id);
        asset.plan = plan.id;
        asset.expires = Date.parse(plan.expiresAt);
      }
      return plan;
    }
    if (method === "submit") {
      const r = automationRecord(raw, ["planId", "grantId"]);
      const planId = automationId(r.planId);
      this.executingPlan = planId;
      try {
        return await host.submit({ planId, grantId: automationId(r.grantId) }, this.abort.signal);
      } finally {
        this.executingPlan = null;
        for (const [id, asset] of this.assets)
          if (asset.plan === planId)
            this.assets.delete(id);
      }
    }
    if (method === "run") {
      const r = automationRecord(raw, ["runId"]);
      return host.run(automationId(r.runId));
    }
    throw new Error("Unknown method");
  }
  async handle(value) {
    let id = "invalid", priority = false, admitted = false;
    try {
      const r = automationRecord(value, ["protocol", "id", "method", "params"]);
      id = automationText(r.id, 64);
      if (!/^[A-Za-z0-9._:-]+$/u.test(id) || r.protocol !== MESSAGING_AUTOMATION_PROTOCOL)
        throw new Error("Invalid envelope");
      const method = automationText(r.method, 32);
      priority = ["cancel", "revoke", "close"].includes(method);
      if (this.requests.has(id) || (priority ? this.priorityBusy >= 8 : this.normalBusy))
        return { protocol: MESSAGING_AUTOMATION_PROTOCOL, id, ok: false, error: { code: "not-ready", message: "The owner host is busy or this request is already active." } };
      this.requests.add(id);
      admitted = true;
      if (priority)
        this.priorityBusy++;
      else
        this.normalBusy = true;
      const result = await this.dispatch(method, r.params);
      return { protocol: MESSAGING_AUTOMATION_PROTOCOL, id, ok: true, result };
    } catch (error) {
      return { protocol: MESSAGING_AUTOMATION_PROTOCOL, id, ok: false, error: { code: error instanceof AutomationHostRecoveryRequired ? "recovery-required" : this.closed ? "not-ready" : "unavailable", message: error instanceof AutomationHostRecoveryRequired ? "Provider cleanup requires explicit host recovery; this instance cannot continue." : "The requested operation is unavailable. Review account permissions, provider setup, scope and current state." } };
    } finally {
      if (admitted) {
        this.requests.delete(id);
        if (priority)
          this.priorityBusy--;
        else
          this.normalBusy = false;
      }
    }
  }
  close() {
    this.closed = true;
    this.abort.abort();
    this.assets.clear();
    return this.closing ??= (async () => {
      const session = this.session ?? await this.initializing?.catch(() => {
        return;
      });
      if (session) {
        try {
          await session.host.close();
        } catch {
          throw new AutomationHostRecoveryRequired("Host cleanup requires recovery");
        }
      }
    })();
  }
}

// src/messaging-automation-factory.ts
async function createMessagingAutomationSession(options) {
  const providers = [];
  const starts = new Map;
  try {
    for (const selected of options.providers) {
      const adapterId = selected.provider === "imessage" ? "imessage-direct" : "whatsapp-web";
      let custody;
      let custodyIdentity;
      let poisoned = false, persistent = false, closed = false, started = false;
      let watching;
      let closing;
      const describe = (operation, signal) => describeOperationPermission(adapterId, automationPermissionOperation(operation), selected.authId, { registry: options.registry, environment: options.environment, ...signal ? { signal } : {} });
      const identity = (description) => sha256(canonicalJson({
        protocol: "ghostget.messaging-automation/1",
        provider: selected.provider,
        pluginId: description.coordinate.pluginId,
        manifestHash: description.coordinate.manifestHash,
        closureHash: description.coordinate.closureHash,
        portableHash: description.coordinate.portableHash
      }));
      const authorize = async (operation, signal) => {
        signal?.throwIfAborted();
        if (poisoned)
          throw new AutomationHostRecoveryRequired("Host custody unavailable");
        if (closed)
          throw new Error("Host closed");
        const description = describe(operation, signal);
        if (description.decision !== "allow")
          throw new Error("Explicit managed operation allow required");
        const auth = description.auth;
        if (auth.kind !== "linked-device-store" || auth.provider !== selected.provider || auth.id !== selected.authId)
          throw new Error("Exact linked-device account required");
        const implementationIdentity = identity(description);
        const coordinate = sha256(canonicalJson({ auth, incarnation: description.coordinate.authIncarnation, implementationIdentity }));
        if (custody && coordinate !== custodyIdentity)
          throw new Error("Account or implementation changed during host custody");
        if (!custody) {
          const plugin = description.resolution.plugin;
          custody = acquireWebSessionCleanupAdmission({
            runId: randomUUID2(),
            pluginId: plugin.id,
            pluginVersion: plugin.version,
            pluginImplementationHash: options.registry.implementationHash(description.resolution.binding).toString("hex"),
            adapterId,
            adapterHash: description.coordinate.manifestHash,
            surfaceId: selected.provider,
            authId: selected.authId,
            authHash: sha256(canonicalJson(auth)),
            transport: selected.provider === "imessage" ? "local-cli" : "web-session-api",
            executionIdentityHash: implementationIdentity
          }, options.environment);
          custodyIdentity = coordinate;
        }
        return { auth, accountIdentity: description.coordinate.authIncarnation, implementationIdentity };
      };
      const registerCleanupBarrier = (barrier) => {
        if (!custody || poisoned || closed)
          throw new AutomationHostRecoveryRequired("Provider cleanup has no durable admission");
        return custody.registerCleanupBarrier(barrier);
      };
      let finishing;
      const finishCustody = () => {
        if (finishing)
          return finishing;
        finishing = (async () => {
          if (!custody)
            return;
          const owned = custody;
          owned.closeRegistration();
          const settled = await Promise.allSettled(owned.barriers);
          if (settled.some((item) => item.status === "rejected")) {
            poisoned = true;
            owned.cleanupUnsafe();
            throw new AutomationHostRecoveryRequired("Provider cleanup remains uncertain");
          }
          owned.cleanupComplete();
          owned.release();
          custody = undefined;
          custodyIdentity = undefined;
        })().finally(() => {
          finishing = undefined;
        });
        return finishing;
      };
      const execution = { environment: options.environment, registerCleanupBarrier };
      const binding = options.registry.requireOperationDefinition(selected.provider === "imessage" ? "local-cli" : "linked-device", selected.provider, "messaging.automation.read", 1).binding;
      const concrete = await loadProviderPluginExtensionRuntime(binding.loadRuntime, async () => selected.provider === "imessage" ? (await loadImsgAutomationRuntime()).createImsgAutomationProvider({ authorize, execution, resolveAsset: options.resolveAsset }) : (await loadWhatsAppAutomationRuntime()).createWhatsAppAutomationProvider({ authorize, execution, resolveAsset: options.resolveAsset }));
      const call = async (work) => {
        if (poisoned)
          throw new AutomationHostRecoveryRequired("Host is fenced");
        if (closed)
          throw new Error("Host closed");
        try {
          return await work();
        } finally {
          if (!persistent)
            await finishCustody();
        }
      };
      const status = async (signal) => call(async () => {
        const status2 = await concrete.inspect(signal);
        const actions = Object.fromEntries(AUTOMATION_ACTION_KINDS.map((kind) => {
          let allowed = false;
          try {
            const admission = describe(kind, signal);
            allowed = admission.decision === "allow" && identity(admission) === status2.identity.implementationIdentity && admission.coordinate.authIncarnation === status2.identity.accountIdentity;
          } catch {}
          return [kind, allowed || !status2.actions[kind].available ? status2.actions[kind] : { available: false, reason: "Enable this exact account operation in Ghostget permissions before granting a contact access." }];
        }));
        return { ...status2, actions };
      });
      const wrapped = {
        provider: selected.provider,
        inspect: status,
        conversations: (input, signal) => call(() => concrete.conversations(input, signal)),
        resolve: (input, signal) => call(() => concrete.resolve(input, signal)),
        history: (input, signal) => call(() => concrete.history(input, signal)),
        events: (input, signal) => call(() => concrete.events(input, signal)),
        send: (input, signal) => call(() => concrete.send(input, signal)),
        close: () => {
          if (closing)
            return closing;
          if (watching) {
            clearInterval(watching);
            watching = undefined;
          }
          closing = (async () => {
            try {
              await concrete.close();
              await finishCustody();
              closed = true;
            } catch {
              poisoned = true;
              custody?.closeRegistration();
              custody?.cleanupUnsafe();
              throw new AutomationHostRecoveryRequired("Provider cleanup requires recovery");
            }
          })();
          return closing;
        }
      };
      providers.push(wrapped);
      starts.set(selected.provider, async (signal) => {
        if (!concrete.start || selected.provider !== "whatsapp" || closed || poisoned)
          throw new Error("This provider has no start operation");
        if (started)
          return status(signal);
        persistent = true;
        try {
          const ceiling = describe("start", signal);
          if (ceiling.decision !== "allow")
            throw new Error("Explicit sync permission required");
          await concrete.start(signal);
          started = true;
          const check = () => {
            let allowed = false;
            try {
              const current = describe("start");
              allowed = current.decision === "allow" && current.digest === ceiling.digest && current.coordinate.authIncarnation === ceiling.coordinate.authIncarnation;
            } catch {}
            if (!allowed)
              wrapped.close().catch(() => {
                return;
              });
          };
          watching = setInterval(check, 1000);
          watching.unref();
          check();
          return await status(signal);
        } catch (error) {
          try {
            await wrapped.close();
          } catch {
            throw new AutomationHostRecoveryRequired("Provider start cleanup requires recovery");
          }
          throw error;
        }
      });
    }
    const host = new MessagingAutomationHost(providers, options.environment);
    return { host, start: (provider2, signal) => {
      const start = starts.get(provider2);
      if (!start)
        throw new Error("Provider not configured");
      return start(signal);
    } };
  } catch (error) {
    await Promise.allSettled(providers.map((provider2) => provider2.close()));
    throw error;
  }
}
export {
  createMessagingAutomationSession
};
