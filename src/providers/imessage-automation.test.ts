import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createImsgAutomationProvider, type ImsgAutomationOperation } from "./imessage-automation";
import type { AutomationAction, AutomationCoordinate } from "../messaging-automation-types";
import { fc, propertyParameters } from "../test-support";

const roots: string[] = [];
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
const target: Extract<AutomationCoordinate, { provider: "imessage" }> = { provider: "imessage", chatGuid: "iMessage;-;fixture@example.test", observedChatRowId: 7, service: "iMessage" };
const chat = { id: 7, name: "Fixture", identifier: "fixture@example.test", service: "iMessage", last_message_at: "2026-09-11T12:00:00.000Z", guid: target.chatGuid, is_group: false, participants: ["fixture@example.test"] };
function rawMessage(id = 10, guid = "fixture-guid"): Record<string, unknown> { return { id, guid, chat_id: 7, sender: "fixture@example.test", is_from_me: false, text: "butler hello", created_at: "2026-09-11T12:00:00.000Z", attachments: [], reactions: [], chat_identifier: chat.identifier, chat_guid: target.chatGuid, chat_name: "Fixture", participants: chat.participants, is_group: false }; }
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-imessage-automation-"))); roots.push(directory); chmodSync(directory, 0o700);
  const database = join(directory, "chat.db"); writeFileSync(database, "synthetic", { mode: 0o600 });
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const admissions: ImsgAutomationOperation[] = []; const barriers: Promise<void>[] = [];
  const state = { bridge: true, malformed: false, linkQueued: false, linkConflict: false, accountIdentity: "a".repeat(64), foreign: false, replace: false, anchorChanged: false, authorizationError: false, revokeOnAsset: false, bytes: Buffer.from("test attachment"), hash: "" };
  state.hash = createHash("sha256").update(state.bytes).digest("hex");
  const readMethods = ["status", "chats.list", "chats.get", "messages.history", "messages.after", "send", "message.send_status"];
  const provider = createImsgAutomationProvider({
    async authorize(operation) { admissions.push(operation); if (state.authorizationError) throw new Error("revoked"); return { auth: { schemaVersion: 1, id: "imessage-fixture", kind: "linked-device-store", provider: "imessage", path: directory }, accountIdentity: state.accountIdentity, implementationIdentity: "b".repeat(64) }; },
    execution: { registerCleanupBarrier(barrier) { barriers.push(barrier); return () => {}; } },
    async resolveAsset() { if (state.revokeOnAsset) state.authorizationError = true; return { bytes: state.bytes, sha256: state.hash }; },
    dependencies: {
      binaryPath: "/synthetic/imsg", expectedMessagesStorePath: directory,
      async run(invocation) {
        await invocation.beforeSpawn?.();
        const replies = [];
        for (const line of invocation.stdin.trim().split("\n")) {
          const request = JSON.parse(line) as { id: string; method: string; params: Record<string, unknown> }; calls.push(request);
          let result: unknown;
          if (request.method === "status") { const methods = [...readMethods, ...(state.bridge ? ["tapback", "send.sticker", "send.rich", "poll.send"] : [])]; result = { version: "0.14.1", protocol_version: 1, database: { ready: true, path: database }, bridge: { ready: state.bridge }, contacts: { available: true }, methods, supported_methods: methods }; }
          else if (request.method === "chats.list") result = { chats: [chat] };
          else if (request.method === "chats.get") result = { chat: { ...chat, ...(state.foreign ? { guid: "iMessage;-;another@example.test" } : {}) } };
          else if (request.method === "messages.history") result = { messages: [rawMessage()] };
          else if (request.method === "messages.after") {
            const since = Number(request.params.since_rowid);
            result = { messages: since < 10 ? [rawMessage(10, state.anchorChanged ? "replaced-guid" : "fixture-guid")] : [], next_rowid: Math.max(10, since), has_more: false };
          } else if (request.method === "tapback") result = { ok: true, reaction: 2000 };
          else if (request.method === "send.sticker") result = { ok: true, transfer_guid: "fixture-transfer" };
          else if (request.method === "poll.send") result = { ok: true, event: "imessage.poll.created", guid: "fixture-poll" };
          else if (request.method === "send.rich") result = state.linkQueued ? { ok: true, queued: true, chat_guid: target.chatGuid } : { ok: true, messageGuid: state.linkConflict ? "conflicting-guid" : "fixture-link", guid: "fixture-link", message_id: "fixture-link", chat_guid: target.chatGuid };
          else result = state.malformed ? { ok: true, unexpected: true } : request.method === "send" ? { ok: true, transport: "applescript", id: 11, guid: "fixture-sent", message_id: "fixture-sent", chat_guid: target.chatGuid, service: "iMessage" } : { ok: true, guid: "fixture-sent" };
          if (state.replace && request.method === "send") { rmSync(database); writeFileSync(database, "replacement", { mode: 0o600 }); }
          replies.push(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
        }
        return { exitCode: 0, stdout: `${replies.join("\n")}\n`, stderr: "" };
      },
    },
  });
  return { provider, state, calls, admissions, async send(action: AutomationAction) { const { identity } = await provider.inspect(); return provider.send({ identity, coordinate: target, action, intentId: "fixture-intent" }); }, async close() { await provider.close(); await Promise.all(barriers); } };
}
test("iMessage capabilities reflect current helper methods without starting bridge", async () => {
  const f = fixture(); expect(f.calls).toHaveLength(0);
  const live = await f.provider.inspect(); expect(live.actions.reaction.available).toBe(true); expect(live.actions.attachment.available).toBe(true); expect(live.actions["app-clip"].available).toBe(false);
  f.state.bridge = false; const disconnected = await f.provider.inspect(); expect(disconnected.actions.reaction.available).toBe(false); expect(disconnected.actions.sticker.available).toBe(false);
  expect(f.calls.every(call => call.method === "status")).toBe(true); await f.close();
});
test("iMessage bounded reads preserve exact coordinates and source generation", async () => {
  const f = fixture(); const list = await f.provider.conversations({ limit: 10 }); expect(list.conversations[0]!.coordinate).toEqual(target);
  const history = await f.provider.history({ coordinate: target, limit: 10 }); expect(history.identity).toEqual(list.identity); expect(history.messages[0]!.id).toBe("fixture-guid"); expect(history.caughtUp).toBe(false);
  f.state.foreign = true; await expect(f.provider.resolve(target)).rejects.toThrow("exact"); await f.close();
});
test("iMessage cursor resumes physical rows and validates its old anchor", async () => {
  const f = fixture(); const first = await f.provider.events({ coordinates: [target], cursor: null, limit: 10 }); expect(first.messages).toHaveLength(1); expect(first.caughtUp).toBe(true);
  const next = await f.provider.events({ coordinates: [target], cursor: first.nextCursor, limit: 10 }); expect(next.messages).toHaveLength(0);
  expect(f.calls.some(call => call.method === "messages.after" && call.params.since_rowid === 9 && call.params.limit === 1)).toBe(true);
  f.state.anchorChanged = true; await expect(f.provider.events({ coordinates: [target], cursor: first.nextCursor, limit: 10 })).rejects.toThrow("anchor");
  f.state.anchorChanged = false; f.state.accountIdentity = "c".repeat(64); await expect(f.provider.events({ coordinates: [target], cursor: first.nextCursor, limit: 10 })).rejects.toThrow("generation"); await f.close();
});
test("text and attachment dispatch use stdin and explicit iMessage AppleScript with SMS disabled", async () => {
  const f = fixture(); expect((await f.send({ kind: "text", text: "test body" })).state).toBe("accepted");
  expect((await f.send({ kind: "attachment", assetId: "asset-1", name: "fixture.txt", mimeType: "text/plain" })).state).toBe("accepted");
  const writes = f.calls.filter(call => call.method === "send"); expect(writes).toHaveLength(2);
  for (const call of writes) { expect(call.params.chat_guid).toBe(target.chatGuid); expect(call.params.transport).toBe("applescript"); expect(call.params.allow_sms_fallback).toBe(false); expect(call.params.service).toBe("imessage"); }
  expect(writes[1]!.params.file).toEndWith("/fixture.txt"); await f.close();
});
test("reaction acceptance needs no invented new message ID", async () => {
  const f = fixture(); expect(await f.send({ kind: "reaction", messageId: "fixture-guid", emoji: "❤️", remove: false })).toEqual({ state: "accepted", messageId: null, providerReceiptId: null, delivery: "unknown" });
  expect((await f.send({ kind: "reaction", messageId: "foreign-guid", emoji: "❤️", remove: false })).state).toBe("not-started");
  expect(f.calls.filter(call => call.method === "tapback")).toHaveLength(1); await f.close();
});
test("sticker transfer acceptance and native polls preserve one action semantics", async () => {
  const f = fixture(); expect(await f.send({ kind: "sticker", assetId: "asset-1", messageId: "fixture-guid" })).toEqual({ state: "accepted", messageId: null, providerReceiptId: "fixture-transfer", delivery: "unknown" });
  expect((await f.send({ kind: "poll", question: "Choose", options: ["One", "Two"], maximumSelections: null })).state).toBe("accepted");
  expect(f.calls.find(call => call.method === "poll.send")!.params.suppress_comment).toBe(true);
  expect((await f.send({ kind: "poll", question: "Choose", options: ["One", "Two"], maximumSelections: 1 })).state).toBe("not-started"); await f.close();
});
test("rich links parse the pinned enriched bridge response and leave unresolved queue receipts indeterminate", async () => {
  const f = fixture(); const action: AutomationAction = { kind: "link", url: "https://example.test/link" };
  expect(await f.send(action)).toEqual({ state: "accepted", messageId: "fixture-link", providerReceiptId: null, delivery: "unknown" });
  f.state.linkConflict = true; expect((await f.send(action)).state).toBe("indeterminate");
  f.state.linkConflict = false; f.state.linkQueued = true; expect((await f.send(action)).state).toBe("indeterminate");
  expect(f.calls.filter(call => call.method === "send.rich")).toHaveLength(3); await f.close();
});
test("unsupported actions and changed asset bytes fail before mutation", async () => {
  const f = fixture(); expect((await f.send({ kind: "app-clip", url: "https://example.test/clip" })).state).toBe("not-started");
  f.state.hash = "0".repeat(64); expect((await f.send({ kind: "attachment", assetId: "asset-1", name: "fixture.txt", mimeType: "text/plain" })).state).toBe("not-started");
  expect(f.calls.filter(call => call.method.startsWith("send"))).toHaveLength(0); await f.close();
});
test("malformed acceptance and database replacement never become retryable failures", async () => {
  const f = fixture(); f.state.malformed = true; expect((await f.send({ kind: "text", text: "test" })).state).toBe("indeterminate");
  f.state.malformed = false; f.state.replace = true; expect((await f.send({ kind: "text", text: "test" })).state).toBe("indeterminate");
  expect(f.calls.filter(call => call.method === "send")).toHaveLength(2); await f.close();
});
test("wrong network, invalid cursors and revoked owner permission do no send work", async () => {
  const f = fixture(); expect(() => f.provider.resolve({ provider: "whatsapp", conversationJid: "15551234567@s.whatsapp.net" })).toThrow("network");
  await expect(f.provider.events({ coordinates: [target], cursor: "not-json", limit: 1 })).rejects.toThrow();
  f.state.authorizationError = true; await expect(f.provider.inspect()).rejects.toThrow("revoked"); expect(f.calls.filter(call => call.method === "send")).toHaveLength(0); await f.close();
});
test("arbitrary malformed iMessage coordinates never reach provider authorization", () => {
  const f = fixture();
  fc.assert(fc.property(fc.jsonValue(), value => {
    if (value && typeof value === "object" && !Array.isArray(value) && value.provider === "imessage") return;
    expect(() => f.provider.resolve(value as AutomationCoordinate)).toThrow();
    expect(f.admissions).toHaveLength(0);
  }), propertyParameters);
});

test("permission revoked during attachment admission prevents the provider send", async () => {
  const f = fixture(); f.state.revokeOnAsset = true;
  expect((await f.send({ kind: "attachment", assetId: "asset-1", name: "fixture.txt", mimeType: "text/plain" })).state).toBe("not-started");
  expect(f.calls.filter(call => call.method === "send")).toHaveLength(0); await f.close();
});
