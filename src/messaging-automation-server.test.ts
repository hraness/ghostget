import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessagingAutomationHost } from "./messaging-automation";
import { discoveryDiagnostic } from "./messaging-automation-diagnostics";
import { MessagingAutomationRpcServer, AutomationHostRecoveryRequired } from "./messaging-automation-server";
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
    resolve: async input => ({ identity, conversation: { coordinate: input, title: "Synthetic", kind: "single", participants: [(input as typeof coordinate).conversationJid] } }),
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
  return { server, request, host, provider, setSend: (next: typeof send) => { send = next; }, starts: () => starts, options: () => options! };
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
  // Submit holds only its enrollment lane; unrelated ordinary work proceeds.
  expect(await f.request("status", { provider: "whatsapp" })).toMatchObject({ ok: true, result: status });
  // The ordinary lane still bounds itself: while one normal request runs, the
  // next is refused rather than queued.
  let releaseStatus!: () => void; const statusGate = new Promise<void>(resolve => { releaseStatus = resolve; });
  const originalStatus = f.host.providerStatus.bind(f.host); let statusCalls = 0;
  f.host.providerStatus = async (selected, signal) => { if (++statusCalls === 1) await statusGate; return originalStatus(selected, signal); };
  const held = f.request("status", { provider: "whatsapp" });
  while (statusCalls === 0) await new Promise<void>(resolve => setImmediate(resolve));
  expect(await f.request("events", { enrollmentIds: [enrollment.id], cursor: null, limit: 10 })).toMatchObject({ ok: false, error: { code: "not-ready" } });
  releaseStatus(); expect(await held).toMatchObject({ ok: true });
  expect(await f.request("revoke", { grantId: grant.id })).toMatchObject({ ok: true, result: { revoked: true } });
  expect(await f.request("cancel", { planId: plan.id })).toMatchObject({ ok: true, result: { cancelled: true } });
  expect((await sending).ok).toBe(true); expect(calls).toBe(1);
});
test("enrollment lanes overlap across conversations, serialize within one, and cover submit", async () => {
  const f = await fixture();
  const first = (await f.request("enroll", { provider: "whatsapp", coordinate })).result;
  const second = (await f.request("enroll", { provider: "whatsapp", coordinate: { provider: "whatsapp", conversationJid: "15559876543@s.whatsapp.net" } })).result;
  expect(second.id).not.toBe(first.id);
  const grant = (await f.request("grant", { intentId: "fixture:lane-grant", enrollmentId: first.id, expectedBindingDigest: first.bindingDigest, actions: ["text"], expiresAt: new Date(Date.now() + 300_000).toISOString(), maximumActions: 2, minimumIntervalMs: 0 })).result;
  const plan = (await f.request("prepare", { enrollmentId: first.id, expectedRevision: 0, intentId: "fixture:lane-plan", actions: [{ kind: "text", text: "Synthetic" }] })).result;
  const until = (check: () => boolean) => new Promise<void>((resolve, reject) => { const attempt = () => check() ? resolve() : setImmediate(attempt); attempt(); setTimeout(() => reject(new Error("Timed out waiting for lane state")), 5_000).unref(); });
  let releasePoll!: () => void; const pollGate = new Promise<void>(resolve => { releasePoll = resolve; });
  const polls: string[] = []; let submits = 0;
  const originalPoll = f.host.poll.bind(f.host); f.host.poll = async (id, signal) => { polls.push(id); if (id === first.id) await pollGate; return originalPoll(id, signal); };
  const originalSubmit = f.host.submit.bind(f.host); f.host.submit = (input, signal) => { submits++; return originalSubmit(input, signal); };
  try {
    const pending = f.request("poll", { enrollmentId: first.id });
    await until(() => polls.length === 1);
    // A different enrollment runs beside the held one and completes.
    await expect(f.request("poll", { enrollmentId: second.id })).resolves.toMatchObject({ ok: true });
    expect(polls).toEqual([first.id, second.id]);
    // Same-enrollment requests queue on the lane instead of racing the cursor claim.
    const queued = f.request("poll", { enrollmentId: first.id });
    const submission = f.request("submit", { planId: plan.id, grantId: grant.id });
    await new Promise<void>(resolve => setTimeout(resolve, 25));
    expect(polls).toEqual([first.id, second.id]); expect(submits).toBe(0);
    releasePoll();
    await expect(pending).resolves.toMatchObject({ ok: true });
    await expect(queued).resolves.toMatchObject({ ok: true });
    // The queued same-enrollment poll runs before submit reaches the lane;
    // submit's own internal poll may already have appended beside it.
    expect(polls.slice(0, 3)).toEqual([first.id, second.id, first.id]);
    await expect(submission).resolves.toMatchObject({ ok: true, result: { state: "accepted" } });
    expect(submits).toBe(1);
  } finally { releasePoll(); }
});

test("pollSet shares one scoped provider read, keeps per-scope cursors, and reports each enrollment", async () => {
  const f = await fixture();
  const first = (await f.request("enroll", { provider: "whatsapp", coordinate })).result;
  const second = (await f.request("enroll", { provider: "whatsapp", coordinate: { provider: "whatsapp", conversationJid: "15559876543@s.whatsapp.net" } })).result;
  let plainCalls = 0; const scopedCalls: number[] = [];
  const originalEvents = f.provider.events.bind(f.provider); f.provider.events = async input => { plainCalls++; return originalEvents(input); };
  // Without eventsScoped the host issues one events call per enrollment.
  const fallback = await f.request("pollSet", { enrollmentIds: [first.id, second.id] });
  expect(fallback).toMatchObject({ ok: true });
  expect(fallback.result.results).toHaveLength(2);
  expect(plainCalls).toBe(2);
  // With eventsScoped the whole set costs a single provider call; each scope
  // still returns its own cursor so later single-enrollment polls resume.
  f.provider.eventsScoped = async input => {
    scopedCalls.push(input.scopes.length);
    return { identity, results: input.scopes.map(() => ({ messages: [], nextCursor: "1", caughtUp: true, gap: false })) };
  };
  const scoped = await f.request("pollSet", { enrollmentIds: [first.id, second.id] });
  expect(scoped).toMatchObject({ ok: true });
  expect(scoped.result.results.map((entry: { enrollmentId: string }) => entry.enrollmentId).sort()).toEqual([first.id, second.id].sort());
  expect(scoped.result.results.every((entry: { error: string | null }) => entry.error === null)).toBe(true);
  expect(scopedCalls).toEqual([2]); expect(plainCalls).toBe(2);
  for (const entry of scoped.result.results as { enrollment: { ready: boolean } }[]) expect(entry.enrollment.ready).toBe(true);
  // A provider-side scope failure is isolated to that enrollment's result.
  f.provider.eventsScoped = async () => ({ identity, results: [{ messages: [], nextCursor: "1", caughtUp: true, gap: false }, { error: "synthetic scope failure" }] });
  const partial = await f.request("pollSet", { enrollmentIds: [first.id, second.id] });
  expect(partial).toMatchObject({ ok: true });
  const byId = new Map((partial.result.results as { enrollmentId: string; error: string | null }[]).map(entry => [entry.enrollmentId, entry.error]));
  expect(byId.size).toBe(2);
  expect([...byId.values()].filter(error => error === null)).toHaveLength(1);
  expect([...byId.values()]).toContain("synthetic scope failure");
});

test("pollSet skips an enrollment whose lane is running another operation", async () => {
  const f = await fixture();
  const first = (await f.request("enroll", { provider: "whatsapp", coordinate })).result;
  const second = (await f.request("enroll", { provider: "whatsapp", coordinate: { provider: "whatsapp", conversationJid: "15559876543@s.whatsapp.net" } })).result;
  const grant = (await f.request("grant", { intentId: "fixture:set-grant", enrollmentId: first.id, expectedBindingDigest: first.bindingDigest, actions: ["text"], expiresAt: new Date(Date.now() + 300_000).toISOString(), maximumActions: 2, minimumIntervalMs: 0 })).result;
  const plan = (await f.request("prepare", { enrollmentId: first.id, expectedRevision: 0, intentId: "fixture:set-plan", actions: [{ kind: "text", text: "Synthetic" }] })).result;
  let release!: () => void; let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  f.setSend(async (_input, signal) => { entered(); await Promise.race([gate, new Promise<void>(resolve => { if (signal?.aborted) resolve(); else signal?.addEventListener("abort", () => resolve(), { once: true }); })]); return { state: "not-started", reason: "Synthetic owner cancellation" }; });
  const sending = f.request("submit", { planId: plan.id, grantId: grant.id }); await started;
  try {
    const observed: string[][] = []; const original = f.host.pollEnrollments.bind(f.host);
    f.host.pollEnrollments = async (ids, signal) => { observed.push([...ids]); return original(ids, signal); };
    const set = await f.request("pollSet", { enrollmentIds: [first.id, second.id] });
    expect(set).toMatchObject({ ok: true });
    // The busy lane is not awaited or re-polled; it reports its current row.
    expect(observed).toEqual([[second.id]]);
    const byId = new Map((set.result.results as { enrollmentId: string; enrollment: { id: string } | null; error: string | null }[]).map(entry => [entry.enrollmentId, entry]));
    expect(byId.get(first.id)?.enrollment?.id).toBe(first.id); expect(byId.get(first.id)?.error).toBe(null);
    expect(byId.get(second.id)?.enrollment?.id).toBe(second.id); expect(byId.get(second.id)?.error).toBe(null);
  } finally { release(); expect((await sending).ok).toBe(true); }
});

test("concurrent submits on different enrollments keep their own plan-scoped assets", async () => {
  const f = await fixture();
  const first = (await f.request("enroll", { provider: "whatsapp", coordinate })).result;
  const second = (await f.request("enroll", { provider: "whatsapp", coordinate: { provider: "whatsapp", conversationJid: "15559876543@s.whatsapp.net" } })).result;
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const assetOne = (await f.request("asset", { bytesBase64: Buffer.from("one").toString("base64"), sha256: digest("one") })).result;
  const assetTwo = (await f.request("asset", { bytesBase64: Buffer.from("two").toString("base64"), sha256: digest("two") })).result;
  const grants = await Promise.all([first, second].map((enrollment, index) =>
    f.request("grant", { intentId: `fixture:pair-grant-${index}`, enrollmentId: enrollment.id, expectedBindingDigest: enrollment.bindingDigest, actions: ["attachment"], expiresAt: new Date(Date.now() + 300_000).toISOString(), maximumActions: 2, minimumIntervalMs: 0 })));
  const plans = await Promise.all([[first, assetOne], [second, assetTwo]].map(([enrollment, asset], index) =>
    f.request("prepare", { enrollmentId: enrollment.id, expectedRevision: 0, intentId: `fixture:pair-plan-${index}`, actions: [{ kind: "attachment", assetId: asset.assetId, name: "sample.txt", mimeType: "text/plain" }] })));
  let release!: () => void; let entered = 0; let both!: () => void;
  const started = new Promise<void>(resolve => { both = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
  // Both sends overlap while holding their own plans; a single executing-plan
  // slot would let the second submit evict the first's asset binding.
  f.setSend(async input => {
    if (++entered === 2) both(); await gate;
    const asset = input.action.kind === "attachment" ? await f.options().resolveAsset(input.action.assetId) : null;
    return { state: "accepted", messageId: `sent:${asset ? Buffer.from(asset.bytes).toString() : "none"}`, providerReceiptId: null, delivery: "unknown" };
  });
  const sending = Promise.all([f.request("submit", { planId: plans[0]!.result.id, grantId: grants[0]!.result.id }), f.request("submit", { planId: plans[1]!.result.id, grantId: grants[1]!.result.id })]);
  await started; release();
  const [a, b] = await sending;
  expect(a).toMatchObject({ ok: true, result: { state: "accepted" } });
  expect(b).toMatchObject({ ok: true, result: { state: "accepted" } });
  expect(a.result.accepted[0]?.messageId).toBe("sent:one"); expect(b.result.accepted[0]?.messageId).toBe("sent:two");
  await expect(f.options().resolveAsset(assetOne.assetId)).rejects.toThrow();
  await expect(f.options().resolveAsset(assetTwo.assetId)).rejects.toThrow();
});


test("discovery serializes only authored markers and preserves recovery precedence", async () => {
  const f = await fixture();
  for (const [error, code, expected] of [
    [new Error("Sensitive raw error /synthetic/private"), "unavailable", null],
    [new Error("ghostget.discovery.v1:native-chats:process-failed"), "unavailable", null],
    [Object.assign(new Error("Sensitive forged fields"), { phase: "native-chats", code: "process-failed" }), "unavailable", null],
    [discoveryDiagnostic(new Error("Sensitive typed cause"), "native-chats", "process-failed"), "unavailable", "ghostget.discovery.v1:native-chats:process-failed"],
    [discoveryDiagnostic(new AutomationHostRecoveryRequired("Sensitive recovery"), "native-finalization", "cleanup-unverified"), "recovery-required", null],
  ] as const) {
    f.host.conversations = async () => { throw error; };
    const reply = await f.request("conversations", { provider: "whatsapp", limit: 1 });
    expect(reply.ok).toBe(false); expect(reply.error?.code).toBe(code);
    expect(JSON.stringify(reply)).not.toContain("Sensitive");
    if (expected) expect(reply.error?.message).toBe(expected);
    else expect(reply.error?.message).not.toStartWith("ghostget.discovery.v1:");
  }
  const tagged = discoveryDiagnostic(new Error("Sensitive status cause"), "host-status");
  f.host.providerStatus = async () => { throw tagged; };
  expect((await f.request("status", { provider: "whatsapp" })).error?.message).not.toStartWith("ghostget.discovery.v1:");
});
