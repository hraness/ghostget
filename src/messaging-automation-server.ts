import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Readable, Writable } from "node:stream";
import { canonicalJson } from "./canonical-json";
import { MessagingAutomationHost } from "./messaging-automation";
import { MESSAGING_AUTOMATION_PROTOCOL as protocol, type AutomationGrantRequest, type AutomationProviderId, type AutomationProviderStatus } from "./messaging-automation-types";
import { automationArray, automationDigest, automationId, automationInteger, automationRecord, automationText, parseAutomationAction } from "./messaging-automation-validation";
import { createMessagingAutomationSession } from "./messaging-automation-factory";
import type { ProviderPluginRegistry } from "./provider-plugin-registry";

type Environment = Readonly<Record<string, string | undefined>>;
export type AutomationHostAccount = Readonly<{ provider: AutomationProviderId; authId: string }>;
export type AutomationHostSession = Readonly<{ host: MessagingAutomationHost; start(provider: AutomationProviderId, signal?: AbortSignal): Promise<AutomationProviderStatus> }>;
type Asset = { bytes: Uint8Array; sha256: string; expires: number; plan: string | null };
const MAX_ASSET = 16 * 1024 * 1024;
const MAX_FRAME = 24 * 1024 * 1024;
const MAX_RESPONSE = 32 * 1024 * 1024;
const provider = (value: unknown): AutomationProviderId => { if (value !== "imessage" && value !== "whatsapp") throw new Error("Invalid provider"); return value; };
export class AutomationHostRecoveryRequired extends Error {}

/** One trusted owner connection. No agent receives this port. */
export class MessagingAutomationRpcServer {
  private session: AutomationHostSession | undefined;
  private initialized = false;
  private initializing: Promise<AutomationHostSession> | undefined;
  private closed = false;
  private normalBusy = false;
  private priorityBusy = 0;
  private readonly requests = new Set<string>();
  private readonly assets = new Map<string, Asset>();
  private executingPlan: string | null = null;
  private readonly abort = new AbortController();
  private closing: Promise<void> | undefined;
  constructor(private readonly options: Readonly<{
    environment: Environment; registry: ProviderPluginRegistry;
    now?: () => number;
    createSession?: typeof createMessagingAutomationSession;
  }>) {}
  private now() { return this.options.now?.() ?? Date.now(); }
  private sweep() { for (const [id, asset] of this.assets) if (asset.expires <= this.now() && asset.plan !== this.executingPlan) this.assets.delete(id); }
  private host() { if (!this.session || this.closed) throw new Error("Host not ready"); return this.session.host; }
  private async dispatch(method: string, raw: unknown): Promise<unknown> {
    this.sweep();
    if (method === "initialize") {
      if (this.initialized || this.closed) throw new Error("Already initialized");
      const r = automationRecord(raw, ["providers"]);
      const accounts = automationArray(r.providers, 2).map(value => {
        const item = automationRecord(value, ["provider", "authId"]); const authId = automationText(item.authId, 48);
        if (!/^[a-z][a-z0-9-]{0,47}$/u.test(authId)) throw new Error("Invalid account identifier");
        return { provider: provider(item.provider), authId };
      });
      if (accounts.length === 0 || new Set(accounts.map(item => item.provider)).size !== accounts.length) throw new Error("Distinct configured providers required");
      this.initialized = true;
      this.initializing = (this.options.createSession ?? createMessagingAutomationSession)({
        providers: accounts, environment: this.options.environment, registry: this.options.registry,
        resolveAsset: async id => {
          this.sweep(); const asset = this.assets.get(id);
          if (!asset || !this.executingPlan || asset.plan !== this.executingPlan || asset.expires <= this.now()) throw new Error("Asset is unavailable for this plan");
          return { bytes: new Uint8Array(asset.bytes), sha256: asset.sha256 };
        },
      });
      this.session = await this.initializing;
      if (this.closed) throw new Error("Host closed during initialization");
      return { initialized: true };
    }
    if (method === "close") { automationRecord(raw, []); await this.close(); return { closed: true }; }
    const host = this.host();
    if (method === "status" || method === "start") {
      const r = automationRecord(raw, ["provider"]); const selected = provider(r.provider);
      return method === "status" ? host.providerStatus(selected, this.abort.signal) : this.session!.start(selected, this.abort.signal);
    }
    if (method === "conversations") { const r = automationRecord(raw, ["provider", "limit"]); return host.conversations({ provider: provider(r.provider), limit: automationInteger(r.limit, 1, 200) }, this.abort.signal); }
    if (method === "enroll") { const r = automationRecord(raw, ["provider", "coordinate"]); return host.enroll({ provider: provider(r.provider), coordinate: r.coordinate }, this.abort.signal); }
    if (method === "enrollments") { automationRecord(raw, []); return host.enrollments(); }
    if (method === "grant") {
      const r = automationRecord(raw, ["intentId", "enrollmentId", "expectedBindingDigest", "actions", "expiresAt", "maximumActions", "minimumIntervalMs"]);
      const { intentId, ...request } = r; return host.grant(request as AutomationGrantRequest, automationId(intentId));
    }
    if (method === "grant.by-intent") { const r = automationRecord(raw, ["intentId"]); return { grant: host.grantByIntent(automationId(r.intentId)) }; }
    if (method === "grant.get") { const r = automationRecord(raw, ["grantId"]); return host.grantStatus(automationId(r.grantId)); }
    if (method === "revoke") { const r = automationRecord(raw, ["grantId"]); host.revoke(automationId(r.grantId)); return { revoked: true }; }
    if (method === "cancel") { const r = automationRecord(raw, ["planId"]); return { cancelled: host.cancel(automationId(r.planId)) }; }
    if (method === "poll") { const r = automationRecord(raw, ["enrollmentId"]); return host.poll(automationId(r.enrollmentId), this.abort.signal); }
    if (method === "history") { const r = automationRecord(raw, ["enrollmentId", "limit"]); return host.history({ enrollmentId: automationId(r.enrollmentId), limit: automationInteger(r.limit, 1, 200) }); }
    if (method === "events") {
      const r = automationRecord(raw, ["enrollmentIds", "cursor", "limit"]);
      return host.events({ enrollmentIds: automationArray(r.enrollmentIds, 50).map(automationId), cursor: r.cursor === null ? null : automationText(r.cursor, 16_384), limit: automationInteger(r.limit, 1, 500) });
    }
    if (method === "asset") {
      const r = automationRecord(raw, ["bytesBase64", "sha256"]); const digest = automationDigest(r.sha256);
      if (typeof r.bytesBase64 !== "string" || r.bytesBase64.length > Math.ceil(MAX_ASSET / 3) * 4) throw new Error("Invalid asset length");
      const bytes = Buffer.from(r.bytesBase64, "base64");
      if (!bytes.length || bytes.length > MAX_ASSET || bytes.toString("base64") !== r.bytesBase64 || createHash("sha256").update(bytes).digest("hex") !== digest) throw new Error("Invalid asset");
      if (this.assets.size >= 32 || [...this.assets.values()].reduce((sum, asset) => sum + asset.bytes.length, bytes.length) > 64 * 1024 * 1024) throw new Error("Asset capacity exceeded");
      const assetId = `asset:${randomUUID()}`, expires = this.now() + 300_000;
      this.assets.set(assetId, { bytes, sha256: digest, expires, plan: null });
      return { assetId, bytes: bytes.length, sha256: digest, expiresAt: new Date(expires).toISOString() };
    }
    if (method === "prepare") {
      const r = automationRecord(raw, ["enrollmentId", "expectedRevision", "intentId", "actions"]);
      const actions = automationArray(r.actions, 8).map(parseAutomationAction);
      const ids = new Set(actions.flatMap(action => action.kind === "attachment" || action.kind === "sticker" ? [action.assetId] : []));
      for (const id of ids) { const asset = this.assets.get(id); if (!asset || asset.plan !== null) throw new Error("Missing or already-bound asset"); }
      const plan = host.prepare({ enrollmentId: automationId(r.enrollmentId), expectedRevision: automationInteger(r.expectedRevision, 0, Number.MAX_SAFE_INTEGER), intentId: automationId(r.intentId), actions });
      for (const id of ids) { const asset = this.assets.get(id)!; asset.plan = plan.id; asset.expires = Date.parse(plan.expiresAt); }
      return plan;
    }
    if (method === "submit") {
      const r = automationRecord(raw, ["planId", "grantId"]); const planId = automationId(r.planId); this.executingPlan = planId;
      try { return await host.submit({ planId, grantId: automationId(r.grantId) }, this.abort.signal); }
      finally { this.executingPlan = null; for (const [id, asset] of this.assets) if (asset.plan === planId) this.assets.delete(id); }
    }
    if (method === "run") { const r = automationRecord(raw, ["runId"]); return host.run(automationId(r.runId)); }
    throw new Error("Unknown method");
  }
  async handle(value: unknown): Promise<unknown> {
    let id = "invalid", priority = false, admitted = false;
    try {
      const r = automationRecord(value, ["protocol", "id", "method", "params"]);
      id = automationText(r.id, 64); if (!/^[A-Za-z0-9._:-]+$/u.test(id) || r.protocol !== protocol) throw new Error("Invalid envelope");
      const method = automationText(r.method, 32); priority = ["cancel", "revoke", "close"].includes(method);
      if (this.requests.has(id) || (priority ? this.priorityBusy >= 8 : this.normalBusy)) return { protocol, id, ok: false, error: { code: "not-ready", message: "The owner host is busy or this request is already active." } };
      this.requests.add(id); admitted = true;
      if (priority) this.priorityBusy++; else this.normalBusy = true;
      const result = await this.dispatch(method, r.params);
      return { protocol, id, ok: true, result };
    } catch (error) {
      return { protocol, id, ok: false, error: { code: error instanceof AutomationHostRecoveryRequired ? "recovery-required" : this.closed ? "not-ready" : "unavailable", message: error instanceof AutomationHostRecoveryRequired ? "Provider cleanup requires explicit host recovery; this instance cannot continue." : "The requested operation is unavailable. Review account permissions, provider setup, scope and current state." } };
    } finally { if (admitted) { this.requests.delete(id); if (priority) this.priorityBusy--; else this.normalBusy = false; } }
  }
  close(): Promise<void> {
    this.closed = true; this.abort.abort(); this.assets.clear();
    return this.closing ??= (async () => {
      const session = this.session ?? await this.initializing?.catch(() => undefined);
      if (session) { try { await session.host.close(); } catch { throw new AutomationHostRecoveryRequired("Host cleanup requires recovery"); } }
    })();
  }
}

export async function serveMessagingAutomationStdio(options: Readonly<{
  input: Readable; output: Writable; environment: Environment; registry: ProviderPluginRegistry; signal?: AbortSignal;
}>): Promise<void> {
  const server = new MessagingAutomationRpcServer(options);
  const pending = new Set<Promise<void>>(); let writing = Promise.resolve();
  const write = (value: unknown) => writing = writing.then(async () => {
    const frame = canonicalJson(value) + "\n";
    if (Buffer.byteLength(frame) > MAX_RESPONSE) throw new Error("Owner response exceeds bound");
    if (!options.output.write(frame)) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 30_000);
      try { await once(options.output, "drain", { signal: abort.signal }); }
      finally { clearTimeout(timer); }
    }
  });
  const stop = () => { options.input.destroy(); void server.close().catch(() => undefined); };
  options.signal?.addEventListener("abort", stop, { once: true });
  let buffer = Buffer.alloc(0); let failure: unknown;
  try {
    options.signal?.throwIfAborted();
    for await (const chunk of options.input) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      if (buffer.length + bytes.length > MAX_FRAME * 2) throw new Error("Owner frame exceeds bound");
      buffer = Buffer.concat([buffer, bytes]);
      for (;;) {
        const newline = buffer.indexOf(10); if (newline < 0) break;
        if (newline > MAX_FRAME || pending.size >= 10) throw new Error("Owner request capacity exceeded");
        const line = buffer.subarray(0, newline); buffer = buffer.subarray(newline + 1);
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
        let task: Promise<void>;
        task = server.handle(value).then(write).catch(error => { failure ??= error; stop(); }).finally(() => pending.delete(task));
        pending.add(task);
      }
      if (buffer.length > MAX_FRAME) throw new Error("Owner frame exceeds bound");
    }
    if (buffer.length) throw new Error("Owner request was truncated");
  } catch (error) { failure ??= error; }
  finally {
    options.signal?.removeEventListener("abort", stop);
    try { await server.close(); } catch (error) { failure ??= error; }
    await Promise.allSettled(pending); await writing;
  }
  if (failure) throw failure;
}
