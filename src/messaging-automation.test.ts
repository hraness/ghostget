import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { fc, propertyParameters } from "./test-support";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessagingAutomationHost } from "./messaging-automation";
import { AUTOMATION_ACTION_KINDS, parseAutomationAction, parseAutomationCoordinate } from "./messaging-automation-validation";
import type { AutomationActionKind, AutomationCapability, AutomationCoordinate, AutomationIdentity, AutomationMessage, AutomationProviderSendResult, MessagingAutomationProvider } from "./messaging-automation-types";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const remove of cleanup.splice(0).reverse()) await remove(); });
const at = "2026-09-11T00:00:00.000Z";
const coordinate = { provider: "whatsapp", conversationJid: "15551234567@s.whatsapp.net" } as const;
const identity: AutomationIdentity = { provider: "whatsapp", authId: "fixture", accountIdentity: "1".repeat(64), accountSubject: "whatsapp:pn:15550000000", implementationIdentity: "2".repeat(64), sourceGeneration: "fixture:1" };
function message(id: string, selected: AutomationCoordinate = coordinate): AutomationMessage {
  return { id, coordinate: selected, direction: "incoming", occurredAt: at, text: "Synthetic fixture", kind: "message", relatedMessageId: null, attachments: [] };
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-automation-")));
  const environment = { GHOSTGET_STATE_HOME: join(root, "ghostget-state") };
  let events: AutomationMessage[] = []; let current = identity; let gap = false; let now = Date.parse(at); const calls: unknown[] = [];
  let send: MessagingAutomationProvider["send"] = async request => { calls.push(request); return { state: "accepted", messageId: `sent:${calls.length}`, providerReceiptId: null, delivery: "unknown" }; };
  const provider: MessagingAutomationProvider = {
    provider: "whatsapp",
    inspect: async () => ({ identity: current, connected: true, events: { available: true, reason: null }, actions: Object.fromEntries(AUTOMATION_ACTION_KINDS.map(kind => [kind, { available: true, reason: null }])) as Record<AutomationActionKind, AutomationCapability> }),
    conversations: async () => ({ identity: current, conversations: [], complete: true }),
    resolve: async selected => ({ identity: current, conversation: { coordinate: selected, title: "Synthetic contact", kind: "single", participants: ["15551234567@s.whatsapp.net"] } }),
    history: async () => ({ identity: current, messages: [message("history:1")], nextCursor: "0", caughtUp: true, gap: false }),
    events: async input => ({ identity: current, messages: events.slice(Number(input.cursor)), nextCursor: String(events.length), caughtUp: true, gap }),
    send: (request, signal) => send(request, signal), close: async () => undefined,
  };
  const host = new MessagingAutomationHost([provider], environment, () => now);
  cleanup.push(async () => { await host.close().catch(() => undefined); rmSync(root, { recursive: true, force: true }); });
  return { host, provider, environment, calls, add: (item: AutomationMessage) => events.push(item), replace: (next: AutomationIdentity) => { current = next; }, gap: () => { gap = true; }, time: (next: number) => { now = next; }, send: (next: typeof send) => { send = next; } };
}
async function prepared(f: ReturnType<typeof fixture>) {
  const enrollment = await f.host.enroll({ provider: "whatsapp", coordinate });
  const grant = f.host.grant({ enrollmentId: enrollment.id, expectedBindingDigest: enrollment.bindingDigest, actions: ["text", "reaction"], expiresAt: "2026-09-12T00:00:00.000Z", maximumActions: 5, minimumIntervalMs: 0 });
  const plan = f.host.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:turn", actions: [{ kind: "text", text: "Synthetic response" }] });
  return { enrollment, grant, plan };
}
test("bootstrap is historical; events deduplicate and cursor survives a host restart", async () => {
  const f = fixture(); const { enrollment } = await prepared(f);
  expect(f.host.events({ enrollmentIds: [enrollment.id], cursor: null, limit: 10 }).events).toEqual([]);
  f.add(message("new:1")); await f.host.poll(enrollment.id); f.add(message("new:1")); await f.host.poll(enrollment.id);
  const page = f.host.events({ enrollmentIds: [enrollment.id], cursor: null, limit: 10 }); expect(page.events).toHaveLength(1); expect(page.events[0]?.revision).toBe(1);
  await f.host.close(); const reopened = new MessagingAutomationHost([f.provider], f.environment, () => Date.parse(at));
  try { expect(reopened.events({ enrollmentIds: [enrollment.id], cursor: page.nextCursor, limit: 10 }).events).toEqual([]); } finally { await reopened.close(); }
});
test("a grant permits one exact ordered dispatch and exact replay never sends again", async () => {
  const f = fixture(); const { plan, grant } = await prepared(f);
  const run = await f.host.submit({ planId: plan.id, grantId: grant.id }); expect(run.state).toBe("accepted"); expect(run.accepted).toEqual([{ messageId: "sent:1", providerReceiptId: null }]);
  expect(await f.host.submit({ planId: plan.id, grantId: grant.id })).toEqual(run); expect(f.calls).toHaveLength(1);
});
test("grant intents survive an unknown response and cannot change scope or revive revoked authority", async () => {
  const f = fixture(); const { enrollment } = await prepared(f);
  const request = { enrollmentId: enrollment.id, expectedBindingDigest: enrollment.bindingDigest, actions: ["text"] as const, expiresAt: "2026-09-12T00:00:00.000Z", maximumActions: 5, minimumIntervalMs: 0 };
  expect(f.host.grantByIntent("intent:missing")).toBeNull();
  const grant = f.host.grant(request, "intent:grant");
  expect(f.host.grant(request, "intent:grant")).toEqual(grant);
  expect(() => f.host.grant({ ...request, maximumActions: 6 }, "intent:grant")).toThrow("changed");
  await f.host.close(); const reopened = new MessagingAutomationHost([f.provider], f.environment, () => Date.parse(at));
  try {
    expect(reopened.grantByIntent("intent:grant")).toEqual(grant);
    reopened.revoke(grant.id);
    expect(reopened.grant(request, "intent:grant").revoked).toBe(true);
    expect(reopened.grantByIntent("intent:grant")?.revoked).toBe(true);
  } finally { await reopened.close(); }
});
test("owner activity between batch actions stops undispatched rich actions", async () => {
  const f = fixture(); const { enrollment, grant } = await prepared(f);
  const plan = f.host.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:rich-turn", actions: [{ kind: "text", text: "Disclosed response" }, { kind: "reaction", messageId: "history:1", emoji: "👍", remove: false }] });
  let sends = 0;
  f.send(async () => { sends++; f.add({ ...message("owner:takeover"), direction: "outgoing" }); return { state: "accepted", messageId: "butler:disclosure", providerReceiptId: null, delivery: "unknown" }; });
  const result = await f.host.submit({ planId: plan.id, grantId: grant.id });
  expect(result.state).toBe("partial"); expect(result.accepted).toHaveLength(1); expect(sends).toBe(1);
});
test("confirmed own disclosure can precede another action in the same unchanged conversation", async () => {
  const f = fixture(); const { enrollment, grant } = await prepared(f);
  const plan = f.host.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:own-rich-turn", actions: [{ kind: "text", text: "Disclosed response" }, { kind: "reaction", messageId: "history:1", emoji: "👍", remove: false }] });
  let sends = 0;
  f.send(async () => { sends++; if (sends === 1) f.add({ ...message("butler:disclosure"), direction: "outgoing" }); return { state: "accepted", messageId: sends === 1 ? "butler:disclosure" : null, providerReceiptId: null, delivery: "unknown" }; });
  const result = await f.host.submit({ planId: plan.id, grantId: grant.id });
  expect(result.state).toBe("accepted"); expect(result.accepted).toHaveLength(2); expect(sends).toBe(2);
});
test("an owner edit or deletion of the accepted disclosure stops the rich batch", async () => {
  for (const kind of ["edit", "delete"] as const) {
    const f = fixture(); const { enrollment, grant } = await prepared(f);
    const plan = f.host.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:changed-disclosure", actions: [{ kind: "text", text: "Disclosed response" }, { kind: "reaction", messageId: "history:1", emoji: "👍", remove: false }] });
    let sends = 0;
    f.send(async () => { sends++; f.add({ ...message("butler:disclosure"), direction: "outgoing", kind }); return { state: "accepted", messageId: "butler:disclosure", providerReceiptId: null, delivery: "unknown" }; });
    expect((await f.host.submit({ planId: plan.id, grantId: grant.id })).state).toBe("partial"); expect(sends).toBe(1);
  }
});
test("incoming context, grant revocation, identity changes and gaps prevent dispatch", async () => {
  for (const change of ["message", "revoke", "identity", "gap"] as const) {
    const f = fixture(); const { plan, grant } = await prepared(f);
    if (change === "message") f.add(message("new:1"));
    if (change === "revoke") f.host.revoke(grant.id);
    if (change === "identity") f.replace({ ...identity, accountIdentity: "3".repeat(64) });
    if (change === "gap") f.gap();
    await expect(f.host.submit({ planId: plan.id, grantId: grant.id })).rejects.toThrow(); expect(f.calls).toHaveLength(0);
  }
});
test("uncertain provider outcomes fence new turns across a host restart", async () => {
  const f = fixture(); const { plan, grant, enrollment } = await prepared(f);
  f.send(async () => { throw new Error("Synthetic lost result"); });
  const run = await f.host.submit({ planId: plan.id, grantId: grant.id }); expect(run.state).toBe("indeterminate");
  await f.host.close(); const reopened = new MessagingAutomationHost([f.provider], f.environment, () => Date.parse(at));
  try { const next = reopened.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:later", actions: [{ kind: "text", text: "Later response" }] }); await expect(reopened.submit({ planId: next.id, grantId: grant.id })).rejects.toThrow("unresolved"); expect(reopened.run(run.id).state).toBe("indeterminate"); } finally { await reopened.close(); }
});
test("simultaneous hosts cannot both claim an enrollment across asynchronous preflight", async () => {
  const f = fixture(); const { plan, grant, enrollment } = await prepared(f);
  const second = new MessagingAutomationHost([f.provider], f.environment, () => Date.parse(at));
  let release!: (result: AutomationProviderSendResult) => void; const blocked = new Promise<AutomationProviderSendResult>(resolve => { release = resolve; });
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  f.send(async request => { f.calls.push(request); entered(); return blocked; });
  const sending = f.host.submit({ planId: plan.id, grantId: grant.id }); await started;
  try {
    const next = second.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:concurrent", actions: [{ kind: "text", text: "Concurrent response" }] });
    await expect(second.submit({ planId: next.id, grantId: grant.id })).rejects.toThrow("unresolved"); expect(f.calls).toHaveLength(1);
  } finally { release({ state: "indeterminate", reason: "Synthetic lost result" }); await sending; await second.close(); }
});
test("accepted reactions without a new message ID remain accepted", async () => {
  const f = fixture(); const { enrollment, grant } = await prepared(f);
  const plan = f.host.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:reaction", actions: [{ kind: "reaction", messageId: "history:1", emoji: "👍", remove: false }] });
  f.send(async () => ({ state: "accepted", messageId: null, providerReceiptId: null, delivery: "unknown" }));
  const run = await f.host.submit({ planId: plan.id, grantId: grant.id }); expect(run.state).toBe("accepted"); expect(run.accepted).toEqual([{ messageId: null, providerReceiptId: null }]);
});
test("foreign coordinates and unsupported fields fail before state or provider mutation", async () => {
  const f = fixture(); const { enrollment } = await prepared(f); f.add(message("wrong:1", { provider: "whatsapp", conversationJid: "15559876543@s.whatsapp.net" }));
  await expect(f.host.poll(enrollment.id)).rejects.toThrow("another conversation"); expect(f.host.enrollments()[0]?.revision).toBe(0);
  expect(() => parseAutomationAction({ kind: "text", text: "hello", shell: "no" })).toThrow();
  expect(() => parseAutomationCoordinate({ provider: "whatsapp", conversationJid: "12345@g.us" })).toThrow();
});
test("closed action parsers reject arbitrary additional properties", () => {
  fc.assert(fc.property(fc.string().filter(key => key !== "kind" && key !== "text" && key !== "__proto__"), fc.jsonValue(), (key, value) => {
    expect(() => parseAutomationAction({ kind: "text", text: "Synthetic", [key]: value })).toThrow();
  }), propertyParameters);
});

function journal(f: ReturnType<typeof fixture>) { return new Database(join(f.environment.GHOSTGET_STATE_HOME, "messaging", "automation", "host.sqlite")); }
test("incomplete initial history catches up silently even across restart", async () => {
  const f = fixture();
  f.provider.history = async () => ({ identity, messages: [message("recent:1")], nextCursor: "0", caughtUp: false, gap: false });
  let caughtUp = false;
  f.provider.events = async () => ({ identity, messages: [message(caughtUp ? "recent:2" : "old:1")], nextCursor: caughtUp ? "2" : "1", caughtUp, gap: false });
  const enrolled = await f.host.enroll({ provider: "whatsapp", coordinate });
  expect(enrolled.ready).toBe(false);
  await f.host.poll(enrolled.id);
  expect(f.host.events({ enrollmentIds: [enrolled.id], cursor: null, limit: 10 }).events).toHaveLength(0);
  await f.host.close();
  const reopened = new MessagingAutomationHost([f.provider], f.environment, () => Date.parse(at));
  try {
    caughtUp = true; expect((await reopened.poll(enrolled.id)).ready).toBe(true);
    expect(reopened.events({ enrollmentIds: [enrolled.id], cursor: null, limit: 10 }).events).toHaveLength(0);
    f.provider.events = async () => ({ identity, messages: [message("live:1")], nextCursor: "3", caughtUp: true, gap: false });
    await reopened.poll(enrolled.id);
    expect(reopened.events({ enrollmentIds: [enrolled.id], cursor: null, limit: 10 }).events.map(event => event.message.id)).toEqual(["live:1"]);
  } finally { await reopened.close(); }
});
test("a history gap remains a dispatch fence after a caught-up event page", async () => {
  const f = fixture(); f.provider.history = async () => ({ identity, messages: [], nextCursor: "0", caughtUp: true, gap: true });
  const enrolled = await f.host.enroll({ provider: "whatsapp", coordinate });
  expect((await f.host.poll(enrolled.id)).ready).toBe(false);
});
test("expiry or narrowed actions stop the remaining actions of an admitted plan", async () => {
  for (const change of ["expire", "narrow"] as const) {
    const f = fixture(); const { enrollment, grant } = await prepared(f);
    const plan = f.host.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: `fixture:${change}`, actions: [{ kind: "text", text: "Disclosure" }, { kind: "reaction", messageId: "history:1", emoji: "👍", remove: false }] });
    f.send(async request => {
      f.calls.push(request);
      if (change === "expire") f.time(Date.parse(grant.expiresAt));
      else { const db = journal(f); try { const row = db.query<{ data: string }, [string]>("SELECT data FROM grants WHERE id=?").get(grant.id)!; const data = JSON.parse(row.data); data.actions = ["text"]; db.query("UPDATE grants SET data=? WHERE id=?").run(JSON.stringify(data), grant.id); } finally { db.close(); } }
      return { state: "accepted", messageId: "sent:1", providerReceiptId: null, delivery: "unknown" };
    });
    const run = await f.host.submit({ planId: plan.id, grantId: grant.id });
    expect(run.state).toBe("partial"); expect(run.accepted).toHaveLength(1); expect(f.calls).toHaveLength(1);
  }
});
test("corrupted stored plan and grant fields fail closed before provider dispatch", async () => {
  for (const table of ["plans", "grants"] as const) {
    const f = fixture(); const { plan, grant } = await prepared(f); const db = journal(f);
    try { const id = table === "plans" ? plan.id : grant.id; const row = db.query<{ data: string }, [string]>(`SELECT data FROM ${table} WHERE id=?`).get(id)!; const data = JSON.parse(row.data); data.expiresAt = "not-a-date"; db.query(`UPDATE ${table} SET data=? WHERE id=?`).run(JSON.stringify(data), id); } finally { db.close(); }
    await expect(f.host.submit({ planId: plan.id, grantId: grant.id })).rejects.toThrow(); expect(f.calls).toHaveLength(0);
  }
});
test("capacity exhaustion neither dispatches nor evicts durable receipts", async () => {
  const f = fixture(); const { plan, grant } = await prepared(f); const db = journal(f);
  try { db.exec("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<50001) INSERT INTO events(enrollment_id,revision,data) SELECT 'synthetic',i,'{}' FROM n"); } finally { db.close(); }
  await expect(f.host.submit({ planId: plan.id, grantId: grant.id })).rejects.toThrow("capacity"); expect(f.calls).toHaveLength(0);
});

test("display-name changes preserve exact authority while participant changes revoke it", async () => {
  const f = fixture(); const { plan, grant } = await prepared(f);
  f.provider.resolve = async selected => ({ identity, conversation: { coordinate: selected, title: "Renamed contact", kind: "single", participants: [coordinate.conversationJid] } });
  expect((await f.host.submit({ planId: plan.id, grantId: grant.id })).state).toBe("accepted");
  const second = fixture(); const other = await prepared(second);
  second.provider.resolve = async selected => ({ identity, conversation: { coordinate: selected, title: "Synthetic contact", kind: "single", participants: ["different@s.whatsapp.net"] } });
  await expect(second.host.submit({ planId: other.plan.id, grantId: other.grant.id })).rejects.toThrow("identity"); expect(second.calls).toHaveLength(0);
});
test("A to B to A edits advance context each time and current history keeps the latest value", async () => {
  const f = fixture(); const { enrollment } = await prepared(f);
  for (const text of ["A", "B", "A"]) { f.add({ ...message("edited:1"), kind: "edit", text }); await f.host.poll(enrollment.id); }
  const page = f.host.events({ enrollmentIds: [enrollment.id], cursor: null, limit: 10 });
  expect(page.events.map(event => event.message.text)).toEqual(["A", "B", "A"]); expect(page.events.at(-1)?.revision).toBe(3);
  const history = f.host.history({ enrollmentId: enrollment.id, limit: 200 }); expect(history.messages.filter(message => message.id === "edited:1").map(message => message.text)).toEqual(["A"]);
});
test("priority cancellation stops remaining actions without discarding accepted work", async () => {
  const f = fixture(); const { enrollment, grant } = await prepared(f);
  const plan = f.host.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: "fixture:cancel", actions: [{ kind: "text", text: "Disclosure" }, { kind: "reaction", messageId: "history:1", emoji: "👍", remove: false }] });
  f.send(async request => { f.calls.push(request); expect(f.host.cancel(plan.id)).toBe(true); return { state: "accepted", messageId: "accepted:1", providerReceiptId: null, delivery: "unknown" }; });
  const run = await f.host.submit({ planId: plan.id, grantId: grant.id }); expect(run.state).toBe("partial"); expect(run.accepted).toHaveLength(1); expect(f.calls).toHaveLength(1); expect(f.host.cancel(plan.id)).toBe(false);
});
