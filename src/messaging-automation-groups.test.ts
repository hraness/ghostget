import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessagingAutomationHost } from "./messaging-automation";
import { AUTOMATION_ACTION_KINDS, AUTOMATION_BINDING_CHANGED_REASON, parseAutomationConversation, parseAutomationCoordinate } from "./messaging-automation-validation";
import type { AutomationConversation, AutomationIdentity, AutomationMessage, AutomationProviderStatus, MessagingAutomationProvider } from "./messaging-automation-types";
import { AutomationGroupBindingChangedError } from "./messaging-automation-types";
import { assertAsyncProperty, assertProperty, fc } from "./test-support";

const at = "2026-10-01T00:00:00.000Z";
const coordinate = { provider: "whatsapp", conversationJid: "120363012345678@g.us" } as const;
const identity: AutomationIdentity = { provider: "whatsapp", authId: "fixture", accountIdentity: "1".repeat(64), accountSubject: "whatsapp:pn:15550000000", implementationIdentity: "2".repeat(64), sourceGeneration: "fixture:1" };
const marker = AUTOMATION_BINDING_CHANGED_REASON;
function message(id: string, kind: AutomationMessage["kind"] = "message", relatedMessageId: string | null = null): AutomationMessage {
  return { id, coordinate, direction: "incoming", occurredAt: at, text: `Synthetic ${id}`, kind, relatedMessageId, attachments: [] };
}
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-group-contract-")));
  const environment = { GHOSTGET_STATE_HOME: join(directory, "state") };
  let roster = ["15551111111@s.whatsapp.net", "15552222222@s.whatsapp.net"];
  let current = identity; let title = "Synthetic group"; let unavailable = false, emptyProof = false; let now = Date.parse(at);
  const events: AutomationMessage[] = [], sends: Parameters<MessagingAutomationProvider["send"]>[0][] = [];
  const selected = (): AutomationConversation => ({ coordinate, title, kind: "group", participants: roster });
  const provider: MessagingAutomationProvider = {
    provider: "whatsapp", groupConversations: { version: 1 },
    inspect: async () => ({ identity: current, connected: true, events: { available: true, reason: null }, actions: Object.fromEntries(AUTOMATION_ACTION_KINDS.map(kind => [kind, { available: true, reason: null }])) as AutomationProviderStatus["actions"] }),
    conversations: async () => ({ identity: current, conversations: [selected()], complete: true }),
    resolve: async () => { if (unavailable) throw new Error("Synthetic lookup unavailable"); if (emptyProof && roster.length === 0) throw new AutomationGroupBindingChangedError(current, coordinate); return { identity: current, conversation: selected() }; },
    history: async () => ({ identity: current, messages: [message("old-private")], nextCursor: String(events.length), caughtUp: true, gap: false }),
    events: async input => ({ identity: current, messages: events.slice(Number(input.cursor)), nextCursor: String(events.length), caughtUp: true, gap: false }),
    send: async input => { sends.push(input); return { state: "accepted", messageId: `sent:${sends.length}`, providerReceiptId: null, delivery: "unknown" }; },
    close: async () => undefined,
  };
  let host = new MessagingAutomationHost([provider], environment, () => now);
  const close = async () => { await host.close(); rmSync(directory, { recursive: true, force: true }); };
  cleanup.push(close);
  return {
    get host() { return host; }, provider, sends, selected,
    roster: (value: string[]) => { roster = value; }, identity: (value: AutomationIdentity) => { current = value; }, title: (value: string) => { title = value; },
    unavailable: (value: boolean) => { unavailable = value; }, add: (value: AutomationMessage) => { events.push(value); },
    time: (value: number) => { now = value; },
    emptyProof: (value: boolean) => { emptyProof = value; },
    restart: async () => { await host.close(); host = new MessagingAutomationHost([provider], environment, () => now); },
    enroll: () => host.enroll({ provider: "whatsapp", coordinate }),
    grant: (enrollment: Awaited<ReturnType<MessagingAutomationHost["enroll"]>>) => host.grant({ enrollmentId: enrollment.id, expectedBindingDigest: enrollment.bindingDigest, actions: ["text"], expiresAt: "2026-10-02T00:00:00.000Z", maximumActions: 20, minimumIntervalMs: 0 }),
  };
}

test("group discovery and enrollment listings require explicit opt-in and a qualified provider", async () => {
  const f = fixture();
  const requests: unknown[] = [], list = f.provider.conversations;
  f.provider.conversations = async (...args) => { requests.push(args[0]); return list(...args); };
  expect(f.host.features()).toEqual({ groupConversations: { version: 1 } });
  expect((await f.host.conversations({ provider: "whatsapp", limit: 20 })).conversations).toEqual([]);
  expect((await f.host.conversations({ provider: "whatsapp", limit: 20, includeGroups: false })).conversations).toEqual([]);
  expect((await f.host.conversations({ provider: "whatsapp", limit: 20, includeGroups: true })).conversations).toHaveLength(1);
  expect(requests).toEqual([{ limit: 20 }, { limit: 20 }, { limit: 20, includeGroups: true }]);
  const enrollment = await f.enroll();
  expect(f.host.enrollments()).toEqual([]);
  expect(f.host.enrollments({ includeGroups: true })).toEqual([enrollment]);
  Object.defineProperty(f.provider, "groupConversations", { value: undefined });
  expect((await f.host.conversations({ provider: "whatsapp", limit: 20, includeGroups: true })).conversations).toEqual([]);
  await expect(f.enroll()).rejects.toThrow("unavailable");
});

test("group roster canonicalization preserves exact JIDs and rejects incomplete or ambiguous bindings", () => {
  const selected = { coordinate, title: null, kind: "group", participants: ["b", "a"] };
  expect(parseAutomationConversation(selected).participants).toEqual(["a", "b"]);
  for (const participants of [[], ["a", "a"], Array.from({ length: 501 }, (_, n) => String(n))]) expect(() => parseAutomationConversation({ ...selected, participants })).toThrow();
  expect(() => parseAutomationConversation({ ...selected, kind: "single" })).toThrow();
  expect(() => parseAutomationConversation({ ...selected, coordinate: { provider: "whatsapp", conversationJid: "15551111111@s.whatsapp.net" } })).toThrow();
  for (const conversationJid of ["120363012345678@g.us", "15551111111-1234567890@g.us"]) expect(parseAutomationCoordinate({ provider: "whatsapp", conversationJid })).toEqual({ provider: "whatsapp", conversationJid });
  for (const conversationJid of ["0120363012345678@g.us", "120363012345678@g.US", "120363012345678:1@g.us", "120363012345678@broadcast", "120363012345678@g.us "]) expect(() => parseAutomationCoordinate({ provider: "whatsapp", conversationJid })).toThrow();
  assertProperty(fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 100 }), members => {
    const roster = members.map(String);
    expect(parseAutomationConversation({ ...selected, participants: roster }).participants).toEqual(parseAutomationConversation({ ...selected, participants: [...roster].reverse() }).participants);
  }));
});

test("group live history excludes baseline bodies and mutations of unknown old messages", async () => {
  const f = fixture(); const enrolled = await f.enroll();
  expect(f.host.history({ enrollmentId: enrolled.id, limit: 200 }).messages).toEqual([]);
  f.add(message("old-private", "edit")); f.add(message("old-reaction", "reaction", "old-private"));
  f.add(message("new-live")); f.add(message("new-reaction", "reaction", "new-live"));
  await f.host.poll(enrolled.id);
  const ids = ["new-live", "new-reaction"];
  expect(f.host.history({ enrollmentId: enrolled.id, limit: 200 }).messages.map(m => m.id)).toEqual(ids);
  f.provider.history = async () => { throw new Error("Group history must never consult the provider archive"); };
  expect((await f.host.historyWindow({ enrollmentId: enrolled.id, limit: 200, before: null, after: null })).messages.map(m => m.id)).toEqual(ids);
  expect(f.host.events({ enrollmentIds: [enrolled.id], cursor: null, limit: 200 }).events.map(e => e.message.id)).toEqual(ids);
});

test("group baseline catchup remains silent and excludes all initial bodies", async () => {
  const f = fixture(); const history = f.provider.history;
  f.provider.history = async (...args) => ({ ...await history(...args), caughtUp: false });
  const enrollment = await f.enroll(); f.add(message("late-old-private"));
  expect((await f.host.poll(enrollment.id)).ready).toBe(true);
  expect(f.host.history({ enrollmentId: enrollment.id, limit: 200 }).messages).toEqual([]);
  f.add(message("post-boundary")); await f.host.poll(enrollment.id);
  expect(f.host.history({ enrollmentId: enrollment.id, limit: 200 }).messages.map(m => m.id)).toEqual(["post-boundary"]);
});
test("original creation time and durable exclusions reject late backfill and future-dated history", async () => {
  const f = fixture(); const enrollment = await f.enroll();
  const past = { ...message("late-backfill"), occurredAt: "2026-09-30T23:59:59.000Z" };
  const future = { ...message("future-original"), occurredAt: "2026-10-01T00:00:10.000Z" };
  f.add(past); f.add(future); await f.host.poll(enrollment.id);
  expect(f.host.history({ enrollmentId: enrollment.id, limit: 200 }).messages).toEqual([]);
  await f.restart(); f.time(Date.parse("2026-10-01T00:00:20.000Z"));
  f.add(future); f.add({ ...past, kind: "edit" }); f.add({ ...message("current-live"), occurredAt: "2026-10-01T00:00:15.000Z" });
  await f.host.poll(enrollment.id);
  expect(f.host.history({ enrollmentId: enrollment.id, limit: 200 }).messages.map(m => m.id)).toEqual(["current-live"]);
});

test("observed roster drift permanently revokes old authority across restoration and restart", async () => {
  const f = fixture(); const enrollment = await f.enroll(), grant = f.grant(enrollment);
  const plan = f.host.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: "before-drift", actions: [{ kind: "text", text: "Synthetic" }] });
  const original = [...f.selected().participants];
  f.roster([...original, "15553333333@s.whatsapp.net"]);
  const invalidated = await f.host.poll(enrollment.id);
  expect(invalidated).toMatchObject({ ready: false, reason: marker, bindingDigest: enrollment.bindingDigest });
  expect(f.host.grantStatus(grant.id).revoked).toBe(true);
  f.roster(original); await f.restart();
  expect(await f.host.poll(enrollment.id)).toMatchObject({ ready: false, reason: marker });
  expect(() => f.grant(enrollment)).toThrow();
  await expect(f.host.submit({ planId: plan.id, grantId: grant.id })).rejects.toThrow();
  const fresh = await f.enroll();
  expect(fresh.id).not.toBe(enrollment.id); expect(fresh.bindingDigest).toBe(enrollment.bindingDigest);
  expect(f.sends).toEqual([]);
});

test("new group roster and ID cannot inherit previous group history", async () => {
  const f = fixture(); const first = await f.enroll();
  f.add(message("first-roster-private")); await f.host.poll(first.id);
  f.roster(["15551111111@s.whatsapp.net", "15553333333@s.whatsapp.net"]);
  const second = await f.enroll();
  expect(second.id).not.toBe(first.id);
  expect(f.host.enrollments({ includeGroups: true }).find(e => e.id === first.id)).toMatchObject({ ready: false, reason: marker });
  f.add(message("first-roster-private", "edit")); await f.host.poll(second.id);
  expect(f.host.history({ enrollmentId: second.id, limit: 200 }).messages).toEqual([]);
  expect((await f.host.historyWindow({ enrollmentId: second.id, limit: 200, before: null, after: null })).messages).toEqual([]);
});
test("complete-empty group proof permanently invalidates A to empty to A but unavailable evidence does not", async () => {
  const f = fixture(); const enrolled = await f.enroll(), grant = f.grant(enrolled), roster = [...f.selected().participants];
  f.roster([]); await expect(f.host.poll(enrolled.id)).rejects.toThrow();
  expect(f.host.enrollments({ includeGroups: true })[0]?.reason).not.toBe(marker);
  f.roster(roster); expect((await f.host.poll(enrolled.id)).ready).toBe(true);
  f.emptyProof(true); f.roster([]);
  expect(await f.host.poll(enrolled.id)).toMatchObject({ ready: false, reason: marker });
  expect(f.host.grantStatus(grant.id)?.revoked).toBe(true);
  await expect(f.enroll()).rejects.toThrow(marker);
  f.roster(roster); await f.restart();
  expect(await f.host.poll(enrolled.id)).toMatchObject({ ready: false, reason: marker });
  expect((await f.enroll()).id).not.toBe(enrolled.id);
});
test("group invalidation proof cannot cross coordinate or account scope", async () => {
  const f = fixture(); const enrolled = await f.enroll(), resolve = f.provider.resolve;
  for (const [who, where] of [[identity, { ...coordinate, conversationJid: "120363099999999@g.us" }], [{ ...identity, authId: "another-account" }, coordinate]] as const) {
    f.provider.resolve = async () => { throw new AutomationGroupBindingChangedError(who, where); };
    await expect(f.host.poll(enrolled.id)).rejects.toThrow();
    expect(f.host.enrollments({ includeGroups: true })[0]?.reason).not.toBe(marker);
    f.provider.resolve = resolve; expect((await f.host.poll(enrolled.id)).ready).toBe(true);
  }
});
test("observed drift remains invalid even when replacement enrollment cannot finish", async () => {
  const f = fixture(); const enrolled = await f.enroll(); const roster = [...f.selected().participants];
  f.roster(["replacement"]);
  f.provider.history = async () => { throw new Error("Synthetic baseline failure"); };
  await expect(f.enroll()).rejects.toThrow("baseline failure");
  f.roster(roster);
  expect(await f.host.poll(enrolled.id)).toMatchObject({ ready: false, reason: marker });
});
test("group drift observed after baseline history cannot revive when the original roster returns", async () => {
  const f = fixture(); const enrolled = await f.enroll(), roster = [...f.selected().participants], history = f.provider.history;
  f.provider.history = async (...args) => { const page = await history(...args); f.roster(["replacement"]); return page; };
  await expect(f.enroll()).rejects.toThrow("binding changed");
  f.roster(roster); await f.restart();
  expect(await f.host.poll(enrolled.id)).toMatchObject({ ready: false, reason: marker });
});
test("group identity drift observed at enrollment status, route or history cannot revive old authority", async () => {
  for (const phase of ["status", "route", "history"] as const) {
    const f = fixture(); const enrolled = await f.enroll(), changed = { ...identity, sourceGeneration: "replacement-generation" };
    const resolve = f.provider.resolve, history = f.provider.history;
    if (phase === "status") { f.identity(changed); f.unavailable(true); }
    if (phase === "route") f.provider.resolve = async () => ({ identity: changed, conversation: f.selected() });
    if (phase === "history") f.provider.history = async (...args) => ({ ...await history(...args), identity: changed });
    await expect(f.enroll()).rejects.toThrow();
    f.identity(identity); f.unavailable(false); f.provider.resolve = resolve; f.provider.history = history;
    await f.restart(); expect(await f.host.poll(enrolled.id)).toMatchObject({ ready: false, reason: marker });
  }
});
test("group identity drift in a validated event page cannot revive after restoration or restart", async () => {
  const f = fixture(); const enrolled = await f.enroll(), events = f.provider.events;
  f.provider.events = async (...args) => ({ ...await events(...args), identity: { ...identity, sourceGeneration: "page-generation" } });
  await expect(f.host.poll(enrolled.id)).rejects.toThrow("identity changed");
  f.provider.events = events; await f.restart();
  expect(await f.host.poll(enrolled.id)).toMatchObject({ ready: false, reason: marker });
});
test("account drift permanently invalidates a group and a page spanning roster drift is discarded", async () => {
  const f = fixture(); const enrolled = await f.enroll(); f.identity({ ...identity, accountIdentity: "3".repeat(64) });
  await expect(f.host.poll(enrolled.id)).rejects.toThrow("identity changed");
  f.identity(identity);
  expect(await f.host.poll(enrolled.id)).toMatchObject({ ready: false, reason: marker });
  const fresh = await f.enroll();
  const events = f.provider.events;
  f.provider.events = async (...args) => { const page = await events(...args); f.roster(["replacement"]); return page; };
  f.add(message("crossed-roster-private"));
  expect(await f.host.poll(fresh.id)).toMatchObject({ ready: false, reason: marker });
  expect(f.host.history({ enrollmentId: fresh.id, limit: 200 }).messages).toEqual([]);
});

test("roster drift between batch actions stops the next effect and preserves accepted evidence", async () => {
  const f = fixture(); const enrolled = await f.enroll(), grant = f.grant(enrolled);
  const plan = f.host.prepare({ enrollmentId: enrolled.id, expectedRevision: 0, intentId: "group-batch", actions: [{ kind: "text", text: "First" }, { kind: "text", text: "Second" }] });
  const send = f.provider.send;
  f.provider.send = async (...args) => { const result = await send(...args); f.roster(["replacement"]); return result; };
  expect(await f.host.submit({ planId: plan.id, grantId: grant.id })).toMatchObject({ state: "partial", totalActions: 2, reason: marker });
  expect(f.sends).toHaveLength(1); expect(f.sends[0]?.conversation).toEqual(enrolled.conversation);
  expect(f.host.enrollments({ includeGroups: true })[0]).toMatchObject({ ready: false, reason: marker });
});

test("final provider-boundary drift invalidates group enrollment without pretending a send happened", async () => {
  const f = fixture(); const enrolled = await f.enroll(), grant = f.grant(enrolled);
  const plan = f.host.prepare({ enrollmentId: enrolled.id, expectedRevision: 0, intentId: "group-boundary", actions: [{ kind: "text", text: "Synthetic" }] });
  f.provider.send = async () => ({ state: "not-started", reason: marker });
  expect(await f.host.submit({ planId: plan.id, grantId: grant.id })).toMatchObject({ state: "failed", accepted: [], reason: marker });
  expect(f.host.enrollments({ includeGroups: true })[0]).toMatchObject({ ready: false, reason: marker });
});

test("title changes and transient lookup failures do not invent a new roster", async () => {
  const f = fixture(); const enrolled = await f.enroll(); f.title("Renamed group");
  expect((await f.host.poll(enrolled.id)).bindingDigest).toBe(enrolled.bindingDigest);
  f.unavailable(true); await expect(f.host.poll(enrolled.id)).rejects.toThrow();
  f.unavailable(false); expect(await f.host.poll(enrolled.id)).toMatchObject({ ready: true, bindingDigest: enrolled.bindingDigest });
});

test("bounded group lifecycle schedules never revive an observed old binding", async () => {
  await assertAsyncProperty(fc.asyncProperty(fc.array(fc.constantFrom("poll", "drift", "empty", "restore", "restart", "rename", "send", "lookup-fault"), { minLength: 1, maxLength: 14 }), async schedule => {
    const f = fixture(); const enrollment = await f.enroll(), grant = f.grant(enrollment); const original = [...f.selected().participants]; let changed = false, invalidated = false;
    for (const [index, action] of schedule.entries()) {
      const sentBefore = f.sends.length;
      if (action === "drift") { f.roster(["changed-member"]); changed = true; }
      if (action === "empty") { f.emptyProof(true); f.roster([]); changed = true; }
      if (action === "restore") { f.roster(original); changed = false; }
      if (action === "rename") f.title("Another title");
      if (action === "restart") await f.restart();
      if (action === "poll") { await f.host.poll(enrollment.id); if (changed) invalidated = true; }
      if (action === "lookup-fault" && !invalidated) { f.unavailable(true); await expect(f.host.poll(enrollment.id)).rejects.toThrow(); f.unavailable(false); }
      if (action === "send") {
        const shouldSend = !changed && !invalidated && f.host.enrollments({ includeGroups: true })[0]?.ready === true;
        try {
          const plan = f.host.prepare({ enrollmentId: enrollment.id, expectedRevision: 0, intentId: `schedule:${index}`, actions: [{ kind: "text", text: "Synthetic" }] });
          await f.host.submit({ planId: plan.id, grantId: grant.id });
        } catch { /* An unavailable or invalidated binding must refuse safely. */ }
        if (f.host.enrollments({ includeGroups: true })[0]?.reason === marker) invalidated = true;
        if (changed || invalidated) expect(f.sends.length).toBe(sentBefore);
        if (shouldSend) expect(f.sends.length).toBe(sentBefore + 1);
      }
      const current = f.host.enrollments({ includeGroups: true })[0]!;
      expect(current.bindingDigest).toBe(enrollment.bindingDigest);
      if (invalidated) expect(current).toMatchObject({ ready: false, reason: marker });
    }
    f.roster(original);
    expect((await f.host.poll(enrollment.id)).ready).toBe(!invalidated);
  }), { numRuns: 30, interruptAfterTimeLimit: 90_000 }, "messaging-automation/groups-lifecycle");
});
