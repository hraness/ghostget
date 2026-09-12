import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessagingAutomationHost } from "./messaging-automation";
import { MessagingAutomationRpcServer } from "./messaging-automation-server";
import { AUTOMATION_ACTION_KINDS } from "./messaging-automation-validation";
import { MESSAGING_AUTOMATION_PROTOCOL as protocol, type AutomationProviderStatus, type MessagingAutomationProvider } from "./messaging-automation-types";
import { providerPluginRegistry as registry } from "./provider-plugins";
import { parseGhostgetArguments } from "./args";
import { automationOperationDefinitions, automationPermissionOperation } from "./messaging-automation-descriptors";
import type { MessagingAutomationSessionOptions } from "./messaging-automation-factory";
import { createMessagingAutomationSession } from "./messaging-automation-factory";
import { parseRuntimeManifest } from "./model";
import imessageManifest from "./assets/adapters/imessage/wrench-web-adapter.json";
import whatsappManifest from "./assets/adapters/whatsapp/wrench-web-adapter.json";
import { createAuth, saveAuth } from "./auth";
import { installManifest } from "./storage";
import { describeOperationPermission, setOperationPermission } from "./operation-permission";
import { enableOperationPermissions } from "./operation-permission-store";
import { bindProviderPluginRuntimeLoadIdentity, loadProviderPluginExtensionRuntime } from "./provider-plugin";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const remove of cleanup.splice(0).reverse()) await remove(); });
const coordinate = { provider: "whatsapp", conversationJid: "15551234567@s.whatsapp.net" } as const;
const identity = { provider: "whatsapp", authId: "fixture", accountIdentity: "1".repeat(64), accountSubject: "whatsapp:pn:15550000000", implementationIdentity: "2".repeat(64), sourceGeneration: "fixture:1" } as const;
const status: AutomationProviderStatus = { identity, connected: true, events: { available: true, reason: null }, actions: Object.fromEntries(AUTOMATION_ACTION_KINDS.map(kind => [kind, { available: true, reason: null }])) as AutomationProviderStatus["actions"] };
async function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-owner-rpc-"))); const environment = { GHOSTGET_STATE_HOME: directory };
  let options: MessagingAutomationSessionOptions | undefined; let sends = 0, starts = 0;
  let send: MessagingAutomationProvider["send"] = async input => {
    sends++;
    if (input.action.kind === "attachment") expect(await options!.resolveAsset(input.action.assetId)).toMatchObject({ sha256: createHash("sha256").update("synthetic").digest("hex") });
    return { state: "accepted", messageId: `sent:${sends}`, providerReceiptId: null, delivery: "unknown" };
  };
  const provider: MessagingAutomationProvider = {
    provider: "whatsapp", inspect: async () => status, conversations: async () => ({ identity, conversations: [], complete: true }),
    resolve: async () => ({ identity, conversation: { coordinate, title: "Synthetic", kind: "single", participants: [coordinate.conversationJid] } }),
    history: async () => ({ identity, messages: [], nextCursor: "0", caughtUp: true, gap: false }),
    events: async () => ({ identity, messages: [], nextCursor: "0", caughtUp: true, gap: false }),
    send: (input, signal) => send(input, signal), close: async () => undefined,
  };
  const host = new MessagingAutomationHost([provider], environment);
  const server = new MessagingAutomationRpcServer({ environment, registry, createSession: async input => { options = input; return { host, start: async () => { starts++; return status; } }; } });
  let sequence = 0;
  const request = async (method: string, params: unknown) => await server.handle({ protocol, id: String(++sequence), method, params }) as { ok: boolean; result: any; error?: { message: string; code: string } };
  cleanup.push(async () => { await server.close().catch(() => undefined); rmSync(directory, { recursive: true, force: true }); });
  expect(await request("initialize", { providers: [{ provider: "whatsapp", authId: "fixture" }] })).toMatchObject({ ok: true, result: { initialized: true } });
  return { server, request, host, setSend: (next: typeof send) => { send = next; }, starts: () => starts, options: () => options! };
}
test("fixed stdin-only CLI and non-dispatching action permission descriptors", () => {
  expect(parseGhostgetArguments(["messaging", "automation", "serve", "--stdio"])).toEqual({ ok: true, value: { command: "messaging-automation-serve" } });
  for (const extra of ["--auth", "--input", "--json", "secret"]) expect(parseGhostgetArguments(["messaging", "automation", "serve", "--stdio", extra]).ok).toBe(false);
  expect(automationPermissionOperation("events")).toBe("messaging.automation.read");
  expect(automationPermissionOperation("attachment")).toBe("messaging.automation.send.attachment");
  expect(() => automationPermissionOperation("app-clip")).toThrow();
  expect(automationOperationDefinitions("imessage").some(operation => operation.name.endsWith(".sync"))).toBe(false);
  for (const operation of automationOperationDefinitions("whatsapp")) { expect(operation.validateInput?.({})).not.toEqual([]); expect(() => operation.planDispatches({})).toThrow(); }
  expect(parseRuntimeManifest(imessageManifest, registry).ok).toBe(true);
  expect(parseRuntimeManifest(whatsappManifest, registry).ok).toBe(true);
  expect(parseGhostgetArguments(["whatsapp", "automation", "install", "--binary", "/tmp/reviewed-wacli", "--json"])).toMatchObject({ ok: true, value: { command: "whatsapp-automation-install" } });
  expect(parseGhostgetArguments(["whatsapp", "automation", "install", "--binary", "relative", "--json"]).ok).toBe(false);
});

test("extension runtime cannot bypass registered pre/post source checks", async () => {
  const loader = async () => ({}); let loads = 0; const phases: string[] = [];
  await expect(loadProviderPluginExtensionRuntime(loader, async () => { loads++; return {}; })).rejects.toThrow("no registered");
  expect(loads).toBe(0);
  bindProviderPluginRuntimeLoadIdentity(loader, { token: "synthetic:1", verify: phase => { phases.push(phase); if (phase === "after") throw new Error("Synthetic source drift"); } });
  await expect(loadProviderPluginExtensionRuntime(loader, async () => { loads++; return {}; })).rejects.toThrow("Synthetic source drift");
  expect(phases).toEqual(["before", "after"]); expect(loads).toBe(1);
});

test("production factory initializes without reading accounts and missing explicit setup cannot dispatch", async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-owner-factory-"))); const environment = { GHOSTGET_STATE_HOME: directory };
  const session = await createMessagingAutomationSession({ providers: [{ provider: "imessage", authId: "synthetic-account" }, { provider: "whatsapp", authId: "synthetic-account" }], environment, registry, resolveAsset: async () => { throw new Error("No synthetic assets"); } });
  cleanup.push(async () => { await session.host.close(); rmSync(directory, { recursive: true, force: true }); });
  expect(session.host.enrollments()).toEqual([]);
  for (const provider of ["imessage", "whatsapp"] as const) await expect(session.host.providerStatus(provider)).rejects.toThrow();
  // Synthetic metadata only. Every attempt below must fail before a helper can
  // inspect the empty fake store or any private provider source.
  const store = join(directory, "synthetic-store"); mkdirSync(store, { mode: 0o700 });
  const parsed = parseRuntimeManifest(imessageManifest, registry); if (!parsed.ok) throw new Error("Fixture manifest failed");
  installManifest(parsed.value, { force: false, environment, registry });
  saveAuth(createAuth("synthetic-account", { linkedDeviceProvider: "imessage", deviceStore: store, subject: `imessage:device-default:${"a".repeat(64)}` }), environment);
  await expect(session.host.providerStatus("imessage")).rejects.toThrow("Explicit managed operation allow required");
  enableOperationPermissions(0, environment);
  await expect(session.host.providerStatus("imessage")).rejects.toThrow("Explicit managed operation allow required");
  const description = describeOperationPermission("imessage-direct", "messaging.automation.read", "synthetic-account", { environment, registry });
  setOperationPermission({ adapterId: "imessage-direct", operationId: "messaging.automation.read", authId: "synthetic-account", decision: "ask", expectedRevision: description.revision, expectedCapabilityDigest: description.digest }, { environment, registry });
  await expect(session.host.providerStatus("imessage")).rejects.toThrow("Explicit managed operation allow required");
});
test("initialize and inspection never imply sync; malformed fields fail without private diagnostics", async () => {
  const f = await fixture(); expect(f.starts()).toBe(0);
  expect(await f.request("status", { provider: "whatsapp" })).toMatchObject({ ok: true, result: status }); expect(f.starts()).toBe(0);
  expect(await f.request("start", { provider: "whatsapp" })).toMatchObject({ ok: true, result: status }); expect(f.starts()).toBe(1);
  for (const [method, params] of [["status", { provider: "whatsapp", secret: "private" }], ["unknown", {}], ["initialize", { providers: [] }]]) {
    const result = await f.request(method as string, params); expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("private");
  }
});
test("asset bytes are canonical, digest-bound, plan-scoped and removed after terminal submit", async () => {
  const f = await fixture(); const bytesBase64 = Buffer.from("synthetic").toString("base64"), sha256 = createHash("sha256").update("synthetic").digest("hex");
  expect((await f.request("asset", { bytesBase64: bytesBase64 + "\n", sha256 })).ok).toBe(false);
  expect((await f.request("asset", { bytesBase64, sha256: "0".repeat(64) })).ok).toBe(false);
  const asset = (await f.request("asset", { bytesBase64, sha256 })).result;
  await expect(f.options().resolveAsset(asset.assetId)).rejects.toThrow();
  const enrollment = (await f.request("enroll", { provider: "whatsapp", coordinate })).result;
  const grant = (await f.request("grant", { intentId: "fixture:grant", enrollmentId: enrollment.id, expectedBindingDigest: enrollment.bindingDigest, actions: ["attachment"], expiresAt: new Date(Date.now() + 300_000).toISOString(), maximumActions: 2, minimumIntervalMs: 0 })).result;
  expect(await f.request("grant.by-intent", { intentId: "fixture:grant" })).toMatchObject({ ok: true, result: { grant: { id: grant.id } } });
  const plan = (await f.request("prepare", { enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:asset", actions: [{ kind: "attachment", assetId: asset.assetId, name: "sample.txt", mimeType: "text/plain" }] })).result;
  let preparedAgain = false;
  const original = f.host.prepare.bind(f.host); f.host.prepare = input => { preparedAgain = true; return original(input); };
  expect((await f.request("prepare", { enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:reused-asset", actions: [{ kind: "attachment", assetId: asset.assetId, name: "sample.txt", mimeType: "text/plain" }] })).ok).toBe(false);
  expect(preparedAgain).toBe(false);
  expect(await f.request("submit", { planId: plan.id, grantId: grant.id })).toMatchObject({ ok: true, result: { state: "accepted" } });
  expect(await f.request("grant.get", { grantId: grant.id })).toMatchObject({ ok: true, result: { id: grant.id, consumedActions: 1 } });
  await expect(f.options().resolveAsset(asset.assetId)).rejects.toThrow();
});
test("priority cancel and revoke run during pending submit, while ordinary work is bounded", async () => {
  const f = await fixture();
  const enrollment = (await f.request("enroll", { provider: "whatsapp", coordinate })).result;
  const grant = (await f.request("grant", { intentId: "fixture:grant", enrollmentId: enrollment.id, expectedBindingDigest: enrollment.bindingDigest, actions: ["text"], expiresAt: new Date(Date.now() + 300_000).toISOString(), maximumActions: 2, minimumIntervalMs: 0 })).result;
  const plan = (await f.request("prepare", { enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:cancel", actions: [{ kind: "text", text: "Synthetic" }, { kind: "text", text: "Never dispatched" }] })).result;
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; }); let calls = 0;
  f.setSend(async (_input, signal) => { calls++; entered(); await new Promise<void>(resolve => { if (signal?.aborted) resolve(); else signal?.addEventListener("abort", () => resolve(), { once: true }); }); return { state: "not-started", reason: "Synthetic owner cancellation" }; });
  const sending = f.request("submit", { planId: plan.id, grantId: grant.id }); await started;
  expect(await f.request("status", { provider: "whatsapp" })).toMatchObject({ ok: false, error: { code: "not-ready" } });
  expect(await f.request("revoke", { grantId: grant.id })).toMatchObject({ ok: true, result: { revoked: true } });
  expect(await f.request("cancel", { planId: plan.id })).toMatchObject({ ok: true, result: { cancelled: true } });
  expect((await sending).ok).toBe(true); expect(calls).toBe(1);
});
