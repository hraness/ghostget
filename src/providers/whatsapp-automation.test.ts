import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createWhatsAppAutomationProvider, type WhatsAppAutomationOperation } from "./whatsapp-automation";
import { parseWhatsAppPrivateResponse, WHATSAPP_AUTOMATION_PROTOCOL, type WhatsAppAutomationRuntime, type WhatsAppPrivateRequest } from "./whatsapp-automation-runtime";
import type { AutomationAction, AutomationCoordinate } from "../messaging-automation-types";
import { AUTOMATION_BINDING_CHANGED_REASON } from "../messaging-automation-types";
import { assertProperty, fc } from "../test-support";

const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });
const target: Extract<AutomationCoordinate, { provider: "whatsapp" }> = { provider: "whatsapp", conversationJid: "15550000002@s.whatsapp.net" };
const groupTarget: typeof target = { provider: "whatsapp", conversationJid: "120363000000000000@g.us" };
function fixture(group = false) {
  const selected = group ? groupTarget : target;
  const database = new Database(":memory:"); databases.push(database);
  const fields = "chat_jid TEXT,msg_id TEXT,sender_jid TEXT,ts INTEGER,from_me INTEGER,text TEXT,display_text TEXT,quoted_msg_id TEXT,reaction_to_id TEXT,reaction_emoji TEXT,media_type TEXT,filename TEXT,mime_type TEXT,file_length INTEGER,revoked INTEGER,deleted_for_me INTEGER";
  database.exec(`CREATE TABLE chats(jid TEXT PRIMARY KEY,kind TEXT,name TEXT,last_message_ts INTEGER); CREATE TABLE messages(rowid INTEGER PRIMARY KEY AUTOINCREMENT,${fields}); CREATE TABLE ghostget_automation_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT,${fields});`);
  database.query("INSERT INTO chats VALUES(?,?,'Synthetic',100)").run(selected.conversationJid, group ? "group" : "dm");
  const snapshot = { account: "15550000001@s.whatsapp.net", subject: "whatsapp:pn:15550000001", sourceGeneration: "c".repeat(64), ledgerReady: true, connected: false, generation: "d".repeat(64) };
  const requests: WhatsAppPrivateRequest[] = [], operations: WhatsAppAutomationOperation[] = [];
  const state = { participants: ["15550000001@s.whatsapp.net", "15550000002@s.whatsapp.net"], missingRoster: false, changedBeforeEffect: false, accountIdentity: "a".repeat(64), revoke: false, revokeOnAsset: false, revokeBeforeWrite: false, started: 0, closed: false, staged: 0, removed: 0, failReceipt: false, pauseRequest: false, entered: (() => {}) as () => void };
  const runtime: WhatsAppAutomationRuntime = {
    async read(_auth, work, signal) { signal?.throwIfAborted(); return work(database, snapshot); },
    async start(_auth, beforeSpawn, signal) { signal?.throwIfAborted(); await beforeSpawn(); state.started++; snapshot.connected = true; },
    async request(request, signal, beforeWrite) {
      if (state.revokeBeforeWrite) state.revoke = true;
      await beforeWrite?.();
      requests.push(request); if (state.failReceipt) throw new Error("lost receipt");
      if (state.pauseRequest) { state.entered(); await new Promise<void>((_resolve, reject) => { signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }); if (signal?.aborted) reject(new Error("cancelled")); }); }
      const base = { protocol: WHATSAPP_AUTOMATION_PROTOCOL, requestId: request.requestId, generation: request.generation, account: request.account, to: request.to, connected: true };
      if (request.kind === "group-info") return state.missingRoster ? { ...base, state: "not-started", messageId: "" } : { ...base, state: "ready", messageId: "", participants: [...state.participants] };
      if (request.expectedParticipants && state.changedBeforeEffect) return { ...base, state: "not-started", messageId: "", bindingChanged: true };
      return { ...base, state: "accepted", messageId: "synthetic-sent" };
    },
    async stage(bytes, digest) { expect(createHash("sha256").update(bytes).digest("hex")).toBe(digest); state.staged++; return { path: "/synthetic/owned-asset", async close() { state.removed++; } }; },
    async close() { state.closed = true; },
  };
  const provider = createWhatsAppAutomationProvider({
    async authorize(operation) { operations.push(operation); if (state.revoke) throw new Error("revoked"); return { auth: { schemaVersion: 1, id: "whatsapp-fixture", kind: "linked-device-store", provider: "whatsapp", path: "/synthetic/linked-device", subject: snapshot.subject }, accountIdentity: state.accountIdentity, implementationIdentity: "b".repeat(64) }; },
    execution: {}, runtime,
    async resolveAsset() { if (state.revokeOnAsset) state.revoke = true; const bytes = Buffer.from("synthetic asset"); return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") }; },
  });
  function add(id: string, kind = "message", outgoing = false) {
    const fields = [selected.conversationJid, id, target.conversationJid, 1_789_128_000, outgoing ? 1 : 0, "butler synthetic", null, null, null, null, null, null, null, null, 0, 0];
    database.query("INSERT INTO messages(chat_jid,msg_id,sender_jid,ts,from_me,text,display_text,quoted_msg_id,reaction_to_id,reaction_emoji,media_type,filename,mime_type,file_length,revoked,deleted_for_me) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(...fields);
    database.query("INSERT INTO ghostget_automation_events(kind,chat_jid,msg_id,sender_jid,ts,from_me,text,display_text,quoted_msg_id,reaction_to_id,reaction_emoji,media_type,filename,mime_type,file_length,revoked,deleted_for_me) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(kind, ...fields);
  }
  return { provider, database, snapshot, state, requests, operations, add };
}

test("WhatsApp inspection never starts sync and reports real capability availability", async () => {
  const f = fixture(); expect((await f.provider.inspect()).connected).toBe(false); expect(f.state.started).toBe(0);
  expect((await f.provider.conversations({ limit: 10 })).conversations[0]?.coordinate).toEqual(target);
  await f.provider.start(); const status = await f.provider.inspect(); expect(status.connected).toBe(true); expect(status.actions.sticker.available).toBe(true); expect(status.actions["app-clip"].available).toBe(false); expect(status.actions.experience.available).toBe(false);
  await f.provider.close(); expect(f.state.closed).toBe(true);
});
test("WhatsApp baseline excludes old history and cursor pages preserve edits and self-authorship", async () => {
  const f = fixture(); f.add("old"); await f.provider.start(); const history = await f.provider.history({ coordinate: target, limit: 200 });
  expect(history.messages.map(value => value.id)).toEqual(["old"]); expect(history.caughtUp).toBe(true);
  f.add("new"); f.add("owner", "message", true); f.add("edited", "edit");
  const first = await f.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 2 });
  expect(first.messages.map(value => value.id)).toEqual(["new", "owner"]); expect(first.messages[1]?.direction).toBe("outgoing"); expect(first.caughtUp).toBe(false);
  const second = await f.provider.events({ coordinates: [target], cursor: first.nextCursor, limit: 2 }); expect(second.messages[0]?.kind).toBe("edit"); expect(second.caughtUp).toBe(true);
  const empty = await f.provider.events({ coordinates: [target], cursor: second.nextCursor, limit: 2 }); expect(empty.messages).toEqual([]);
});
test("WhatsApp expired and replaced cursor anchors produce an explicit gap", async () => {
  const f = fixture(); f.add("old"); await f.provider.start(); const history = await f.provider.history({ coordinate: target, limit: 2 }); f.add("new");
  f.database.query("UPDATE ghostget_automation_events SET text='changed' WHERE sequence=1").run();
  expect((await f.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 2 })).gap).toBe(true);
  f.database.query("DELETE FROM ghostget_automation_events WHERE sequence=1").run();
  expect((await f.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 2 })).gap).toBe(true);
  f.snapshot.sourceGeneration = "f".repeat(64);
  await expect(f.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 2 })).rejects.toThrow("identity");
});
test("WhatsApp rich sends use exact request IDs and private payloads", async () => {
  const f = fixture(); f.add("reaction-target"); await f.provider.start(); const identity = (await f.provider.inspect()).identity;
  const actions: AutomationAction[] = [{ kind: "text", text: "🤖{ synthetic }" }, { kind: "link", url: "https://example.test/path" }, { kind: "attachment", assetId: "asset-one", name: "synthetic.txt", mimeType: "text/plain" }, { kind: "sticker", assetId: "asset-two", messageId: null }, { kind: "reaction", messageId: "reaction-target", emoji: "👍", remove: false }, { kind: "poll", question: "Synthetic?", options: ["A", "B"], maximumSelections: 1 }];
  for (const [index, action] of actions.entries()) expect((await f.provider.send({ identity, coordinate: target, action, intentId: `intent-${index}` })).state).toBe("accepted");
  expect(f.requests.map(value => value.kind)).toEqual(["text", "text", "file", "sticker", "react", "poll"]);
  expect(f.requests.every(value => value.to === target.conversationJid && /^[a-f0-9]{64}$/u.test(value.requestId))).toBe(true); expect(f.state.staged).toBe(2); expect(f.state.removed).toBe(2);
});
test("WhatsApp revalidates permission after asynchronous asset resolution", async () => {
  const f = fixture(); await f.provider.start(); const identity = (await f.provider.inspect()).identity; f.state.revokeOnAsset = true;
  const result = await f.provider.send({ identity, coordinate: target, intentId: "revoked", action: { kind: "attachment", assetId: "asset", name: "file.txt", mimeType: "text/plain" } });
  expect(result.state).toBe("not-started"); expect(f.requests).toHaveLength(0); expect(f.state.removed).toBe(1);
});
test("WhatsApp permission revoked while connecting prevents request bytes", async () => {
  const f = fixture(); await f.provider.start(); const identity = (await f.provider.inspect()).identity; f.state.revokeBeforeWrite = true;
  const result = await f.provider.send({ identity, coordinate: target, intentId: "connection-revoked", action: { kind: "text", text: "synthetic" } });
  expect(result.state).toBe("indeterminate"); expect(f.requests).toHaveLength(0);
});
test("WhatsApp reaction events retain changes and removals in their public content", async () => {
  const f = fixture(); f.add("baseline"); await f.provider.start(); const history = await f.provider.history({ coordinate: target, limit: 200 });
  f.add("reaction-one", "reaction"); f.add("reaction-two", "reaction"); f.add("reaction-removed", "reaction");
  f.database.query("UPDATE ghostget_automation_events SET reaction_emoji=?,reaction_to_id='baseline' WHERE msg_id=?").run("👍", "reaction-one");
  f.database.query("UPDATE ghostget_automation_events SET reaction_emoji=?,reaction_to_id='baseline' WHERE msg_id=?").run("❤️", "reaction-two");
  f.database.query("UPDATE ghostget_automation_events SET reaction_to_id='baseline' WHERE msg_id='reaction-removed'").run();
  const page = await f.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 10 });
  expect(page.messages.map(value => [value.kind, value.text])).toEqual([["reaction", "👍"], ["reaction", "❤️"], ["reaction", null]]);
});
test("WhatsApp concurrent operations queue on the provider instead of rejecting", async () => {
  const f = fixture(); await f.provider.start(); const identity = (await f.provider.inspect()).identity;
  f.state.pauseRequest = true;
  const entered = new Promise<void>(resolve => { f.state.entered = resolve; });
  const controller = new AbortController();
  const sending = f.provider.send({ identity, coordinate: target, intentId: "queued", action: { kind: "text", text: "synthetic" } }, controller.signal);
  await entered;
  const inspected = f.provider.inspect();
  let settled = false; void inspected.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 25));
  // Queued behind the held send — neither rejected nor started early.
  expect(settled).toBe(false); expect(f.operations.filter(operation => operation === "inspect").length).toBe(2);
  controller.abort();
  await expect(inspected).resolves.toMatchObject({ connected: true });
  expect((await sending).state).toBe("indeterminate");
  await f.provider.close();
});
test("WhatsApp lost receipt stays indeterminate and close cancels then joins active work", async () => {
  const f = fixture(); await f.provider.start(); const identity = (await f.provider.inspect()).identity; f.state.failReceipt = true;
  const input = { identity, coordinate: target, intentId: "uncertain", action: { kind: "text" as const, text: "synthetic" } };
  expect((await f.provider.send(input)).state).toBe("indeterminate"); expect(f.requests).toHaveLength(1);
  f.state.failReceipt = false; f.state.pauseRequest = true;
  const entered = new Promise<void>(resolve => { f.state.entered = resolve; }); const pending = f.provider.send({ ...input, intentId: "cancel" }); await entered;
  await f.provider.close(); expect((await pending).state).toBe("indeterminate"); expect(f.state.closed).toBe(true);
});
test("WhatsApp changed account and group targets cannot dispatch", async () => {
  const f = fixture(); await f.provider.start(); const identity = (await f.provider.inspect()).identity; f.state.accountIdentity = "f".repeat(64);
  expect((await f.provider.send({ identity, coordinate: target, intentId: "changed", action: { kind: "text", text: "synthetic" } })).state).toBe("not-started");
  expect(f.requests).toHaveLength(0);
  expect(() => f.provider.resolve({ provider: "whatsapp", conversationJid: "15550000002@g.us" })).toThrow();
});
test("WhatsApp receipt parser rejects arbitrary extra fields", () => {
  const valid = { protocol: WHATSAPP_AUTOMATION_PROTOCOL, requestId: "a".repeat(64), generation: "b".repeat(64), account: "15550000001@s.whatsapp.net", to: target.conversationJid, state: "accepted", messageId: "synthetic", connected: true };
  expect(parseWhatsAppPrivateResponse(valid).state).toBe("accepted");
  assertProperty(fc.property(fc.string().filter(key => !Object.hasOwn(valid, key)), fc.jsonValue(), (key, value) => { expect(() => parseWhatsAppPrivateResponse({ ...valid, [key]: value })).toThrow(); }));
  for (const patch of [{ generation: "" }, { to: "15550000002@broadcast" }, { messageId: "" }, { connected: 1 }, { state: "delivered" }]) expect(() => parseWhatsAppPrivateResponse({ ...valid, ...patch })).toThrow();
});

test("WhatsApp refuses dated history windows instead of ignoring them", async () => {
  const f = fixture(); await f.provider.start();
  await expect(f.provider.history({ coordinate: target, limit: 10, before: "2026-09-01T00:00:00.000Z" })).rejects.toThrow("unavailable for WhatsApp");
  await expect(f.provider.history({ coordinate: target, limit: 10, after: "2026-06-01T00:00:00.000Z" })).rejects.toThrow("unavailable for WhatsApp");
});


test("WhatsApp groups require an explicit full roster and bind rich sends to it", async () => {
  const f = fixture(true);
  expect(f.provider.groupConversations).toEqual({ version: 1 });
  await f.provider.start();
  const resolved = await f.provider.resolve(groupTarget);
  expect(resolved.conversation).toMatchObject({ kind: "group", participants: f.state.participants });
  f.add("baseline");
  const history = await f.provider.history({ coordinate: groupTarget, limit: 20 });
  expect(history.messages.map(message => message.id)).toEqual(["baseline"]);
  f.add("live");
  expect((await f.provider.events({ coordinates: [groupTarget], cursor: history.nextCursor, limit: 20 })).messages.map(message => message.id)).toEqual(["live"]);
  const input = { identity: resolved.identity, coordinate: groupTarget, conversation: resolved.conversation, intentId: "group-synthetic", action: { kind: "text" as const, text: "Group reply" } };
  expect(await f.provider.send(input)).toMatchObject({ state: "accepted" });
  expect(f.requests.find(request => request.kind === "text")).toMatchObject({ to: groupTarget.conversationJid, expectedParticipants: f.state.participants });
  f.state.participants.push("15550000003@s.whatsapp.net");
  const sentCount = f.requests.filter(request => request.kind === "text").length;
  expect(await f.provider.send({ ...input, intentId: "changed" })).toEqual({ state: "not-started", reason: AUTOMATION_BINDING_CHANGED_REASON });
  expect(f.requests.filter(request => request.kind === "text")).toHaveLength(sentCount);
});

test("WhatsApp missing group evidence refuses without declaring membership changed", async () => {
  const f = fixture(true); await f.provider.start();
  const resolved = await f.provider.resolve(groupTarget);
  f.state.missingRoster = true;
  const input = { identity: resolved.identity, coordinate: groupTarget, conversation: resolved.conversation, intentId: "unavailable", action: { kind: "text" as const, text: "Never send" } };
  const result = await f.provider.send(input);
  expect(result.state).toBe("not-started");
  expect("reason" in result && result.reason).not.toBe(AUTOMATION_BINDING_CHANGED_REASON);
  expect(f.requests.filter(request => request.kind === "text")).toHaveLength(0);
});

test("WhatsApp forwards the native final-effect membership fence", async () => {
  const f = fixture(true); await f.provider.start();
  const resolved = await f.provider.resolve(groupTarget);
  f.state.changedBeforeEffect = true;
  expect(await f.provider.send({ identity: resolved.identity, coordinate: groupTarget, conversation: resolved.conversation, intentId: "final-fence", action: { kind: "text", text: "Never send" } })).toEqual({ state: "not-started", reason: AUTOMATION_BINDING_CHANGED_REASON });
});

test("WhatsApp group receipt extensions are closed and cannot decorate direct receipts", () => {
  const base = { protocol: WHATSAPP_AUTOMATION_PROTOCOL, requestId: "a".repeat(64), generation: "b".repeat(64), account: "15550000001@s.whatsapp.net", to: groupTarget.conversationJid, state: "ready", messageId: "", connected: true };
  const participants = ["15550000001@s.whatsapp.net", "15550000002@s.whatsapp.net"];
  expect(parseWhatsAppPrivateResponse({ ...base, participants }).participants).toEqual(participants);
  expect(parseWhatsAppPrivateResponse({ ...base, state: "not-started", bindingChanged: true }).bindingChanged).toBe(true);
  for (const roster of [[], [...participants].reverse(), [participants[0], participants[0]], ["123@broadcast"], Array.from({ length: 501 }, (_, index) => `${15550000001 + index}@s.whatsapp.net`)]) expect(() => parseWhatsAppPrivateResponse({ ...base, participants: roster })).toThrow();
  for (const patch of [{ to: target.conversationJid, participants }, { state: "accepted", messageId: "sent", participants }, { bindingChanged: false }, { bindingChanged: true }, { state: "not-started", participants, bindingChanged: true }]) expect(() => parseWhatsAppPrivateResponse({ ...base, ...patch })).toThrow();
});


test("WhatsApp direct discovery never fetches a group roster or spends its result limit on groups", async () => {
  const f = fixture(true);
  f.database.query("INSERT INTO chats VALUES(?,'dm','Direct',50)").run(target.conversationJid);
  expect((await f.provider.conversations({ limit: 1 })).conversations.map(item => item.coordinate)).toEqual([target]);
  expect(f.requests).toHaveLength(0);
  expect((await f.provider.conversations({ limit: 10, includeGroups: true })).complete).toBe(false);
  expect(f.requests).toHaveLength(0);
  await f.provider.start();
  const optedIn = await f.provider.conversations({ limit: 10, includeGroups: true });
  expect(optedIn.conversations.map(item => item.kind)).toEqual(["group", "single"]);
  expect(optedIn.complete).toBe(true);
  expect(f.requests.map(request => request.kind)).toEqual(["group-info"]);
});
