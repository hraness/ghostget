import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GhostgetAuth } from "../auth";
import type { AutomationAction, AutomationCoordinate } from "../messaging-automation-types";
import { createBeeperAutomationProvider, type BeeperAutomationAdmission, type BeeperAutomationOperation } from "./beeper-automation";
import { BEEPER_CLI_PIN } from "./beeper-local";
import { beeperSubjectFromAccountsAndTarget, parseBeeperExportAccounts, type BeeperCliInvocation } from "./beeper-local-runtime";

const roots: string[] = [];
const baseUrl = "http://127.0.0.1:23373/";
const bundleId = "com.automattic.beeper.desktop" as const;
const desktopVersion = "4.2.999";
const selfAccount = Object.freeze({
  accountID: "account-1",
  bridge: Object.freeze({ id: "matrix", provider: "local", type: "matrix" }),
  network: "beeper",
  status: "connected",
  user: Object.freeze({ id: "@self:beeper.test", isSelf: true }),
});
const targetChat = Object.freeze({
  id: "!room:beeper.test",
  accountID: "account-1",
  network: "beeper",
  title: "Friend",
  type: "single",
  unreadCount: 0,
  participants: Object.freeze({
    hasMore: false,
    total: 2,
    items: Object.freeze([
      Object.freeze({ id: "@self:beeper.test", isSelf: true }),
      Object.freeze({ id: "@friend:beeper.test", isSelf: false }),
    ]),
  }),
});
const target: Extract<AutomationCoordinate, { provider: "beeper" }> = Object.freeze({
  provider: "beeper", accountId: "account-1", conversationId: "!room:beeper.test",
});

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function apiMessage(id: string, sortKey: string, options: { outgoing?: boolean; deleted?: boolean; hidden?: boolean; edited?: string; text?: string } = {}): Record<string, unknown> {
  const deleted = options.deleted === true || options.hidden === true;
  return {
    id, accountID: "account-1", chatID: "!room:beeper.test",
    senderID: options.outgoing === true ? "@self:beeper.test" : "@friend:beeper.test",
    senderName: options.outgoing === true ? "Self" : "Friend",
    isSender: options.outgoing === true,
    sortKey,
    timestamp: new Date(1_788_000_000_000 + Number.parseInt(sortKey, 10) * 1000).toISOString(),
    ...(options.edited === undefined ? {} : { editedTimestamp: options.edited }),
    ...(deleted ? {} : { text: options.text ?? `body ${id}` }),
    type: "TEXT",
    ...(options.deleted === true ? { isDeleted: true } : {}),
    ...(options.hidden === true ? { isHidden: true } : {}),
  };
}

function info(): unknown {
  return {
    app: { bundle_id: bundleId, name: "Beeper", version: desktopVersion },
    endpoints: {},
    platform: {},
    server: { base_url: baseUrl, hostname: "127.0.0.1", mcp_enabled: true, port: 23_373, remote_access: false, status: "ready" },
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

interface World {
  accounts: readonly Record<string, unknown>[];
  chats: readonly Record<string, unknown>[];
  /** Ascending sortKey order, like the provider's local history. */
  messages: Record<string, unknown>[];
  pageSize: number;
  sendAccepts: boolean;
  offline: boolean;
}

function fixture(overrides: Partial<World> = {}) {
  const world: World = {
    accounts: [selfAccount as Record<string, unknown>],
    chats: [targetChat as Record<string, unknown>],
    messages: [],
    pageSize: 3,
    sendAccepts: true,
    offline: false,
    ...overrides,
  };
  const subject = beeperSubjectFromAccountsAndTarget(parseBeeperExportAccounts(world.accounts), baseUrl, bundleId, desktopVersion);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "wrench-beeper-automation-")));
  roots.push(root);
  mkdirSync(join(root, "targets"), { mode: 0o700 });
  chmodSync(root, 0o700);
  writeFileSync(join(root, "config.json"), `${JSON.stringify({ defaultTarget: "desktop" })}\n`, { mode: 0o600 });
  writeFileSync(join(root, "targets", "desktop.json"), `${JSON.stringify({
    id: "desktop", type: "desktop", baseURL: baseUrl,
    auth: { accessToken: "fixture-secret", tokenType: "Bearer" },
    managed: false, port: 23_373, runtime: { install: "desktop", port: 23_373 },
  })}\n`, { mode: 0o600 });
  const auth: GhostgetAuth = Object.freeze({
    schemaVersion: 1, id: "beeper-fixture", kind: "linked-device-store",
    provider: "beeper", path: root, subject,
  });

  const cliCalls: string[] = [];
  const httpCalls: string[] = [];
  const sorted = () => [...world.messages].sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const route = `${init?.method ?? "GET"} ${url.pathname}`;
    httpCalls.push(route);
    if (world.offline) return Promise.reject(new Error("fixture offline"));
    if (route === "GET /v1/info") return Promise.resolve(jsonResponse(info()));
    if (route === "GET /v1/accounts") return Promise.resolve(jsonResponse(world.accounts));
    const chatMatch = /^\/v1\/chats\/([^/]+)$/u.exec(url.pathname);
    if (route.startsWith("GET") && chatMatch !== null) {
      const chat = world.chats.find(value => value.id === decodeURIComponent(chatMatch[1]!));
      return Promise.resolve(chat === undefined ? jsonResponse({ errcode: "M_NOT_FOUND", error: "not found" }) : jsonResponse(chat));
    }
    const messagesMatch = /^\/v1\/chats\/([^/]+)\/messages$/u.exec(url.pathname);
    if (messagesMatch !== null && (init?.method ?? "GET") === "GET") {
      const cursor = url.searchParams.get("cursor");
      const direction = url.searchParams.get("direction") ?? "before";
      let page = sorted();
      if (cursor !== null) {
        const boundary = cursor.replace(/^cursor:/u, "");
        page = direction === "before" ? page.filter(value => String(value.sortKey) < boundary) : page.filter(value => String(value.sortKey) > boundary);
      }
      page = direction === "before" ? page.reverse() : page;
      const items = page.slice(0, world.pageSize);
      const rest = page.slice(items.length);
      return Promise.resolve(jsonResponse({
        items, hasMore: rest.length > 0,
        oldestCursor: items.length === 0 ? null : `cursor:${String(items[items.length - 1]!.sortKey)}`,
        newestCursor: items.length === 0 ? null : `cursor:${String(items[0]!.sortKey)}`,
      }));
    }
    if (messagesMatch !== null && init?.method === "POST") {
      if (!world.sendAccepts) return Promise.resolve(jsonResponse({ errcode: "M_UNKNOWN", error: "fixture send failure" }));
      return Promise.resolve(jsonResponse({ chatID: decodeURIComponent(messagesMatch[1]!), pendingMessageID: `pending-${httpCalls.length}` }));
    }
    return Promise.resolve(jsonResponse({ errcode: "M_UNRECOGNIZED", error: `unrouted ${route}` }));
  };
  const run = (invocation: BeeperCliInvocation): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
    cliCalls.push(invocation.arguments.join(" "));
    if (world.offline) return Promise.resolve({ exitCode: 1, stdout: "", stderr: "offline" });
    const ok = (data: unknown) => Promise.resolve({ exitCode: 0, stdout: `${JSON.stringify({ success: true, data, error: null })}\n`, stderr: "" });
    const command = invocation.arguments.slice(0, 2).join(" ");
    if (invocation.arguments[0] === "version") return ok({ name: "@beeper/cli", version: BEEPER_CLI_PIN.version });
    if (command === "targets status") return ok({
      target: { id: "desktop", type: "desktop", baseURL: baseUrl, auth: { accessToken: "fixture-secret", tokenType: "Bearer" }, managed: false },
      reachable: true, version: desktopVersion, bundleID: bundleId, actualType: "desktop",
    });
    if (command === "accounts list") return ok(world.accounts);
    if (command === "chats list") return ok(world.chats);
    if (command === "chats show") {
      const index = invocation.arguments.indexOf("--chat");
      const id = index === -1 ? null : invocation.arguments[index + 1];
      return ok(world.chats.find(chat => chat.id === id));
    }
    return ok(null);
  };
  const operations: BeeperAutomationOperation[] = [];
  const state = { revoked: false, accountIdentity: "a".repeat(64), implementationIdentity: "b".repeat(64) };
  const provider = createBeeperAutomationProvider({
    authorize(operation: BeeperAutomationOperation): Promise<BeeperAutomationAdmission> {
      operations.push(operation);
      if (state.revoked) return Promise.reject(new Error("revoked"));
      return Promise.resolve({ auth, accountIdentity: state.accountIdentity, implementationIdentity: state.implementationIdentity });
    },
    execution: {},
    dependencies: {
      run,
      binaryPath: join(root, "fixture-beeper-cli"),
      createCacheDirectory: () => {
        const path = join(tmpdir(), `wrench-beeper-cli-${randomUUID().replaceAll("-", "")}`);
        mkdirSync(path, { mode: 0o700 });
        const directory = realpathSync(path);
        roots.push(directory);
        return Promise.resolve(directory);
      },
      removeCacheDirectory: (path: string) => { rmSync(path, { recursive: true, force: true }); return Promise.resolve(); },
    },
    directDependencies: { fetch },
    messagingDependencies: { fetch },
  });
  return { provider, world, state, cliCalls, httpCalls, operations };
}

function seedMessages(world: World, count: number, start = 1): void {
  for (let index = 0; index < count; index += 1) {
    const n = String(start + index).padStart(4, "0");
    world.messages.push(apiMessage(`m${n}`, n));
  }
}

describe("Beeper automation provider", () => {
  test("inspection reports the bound realm and text-only capability", async () => {
    const f = fixture();
    const status = await f.provider.inspect();
    expect(status.connected).toBe(true);
    expect(status.identity.provider).toBe("beeper");
    expect(status.identity.authId).toBe("beeper-fixture");
    expect(status.actions.text.available).toBe(true);
    expect(status.actions.reaction.available).toBe(false);
    expect(status.events.available).toBe(true);
    await f.provider.close();
  });

  test("offline Desktop reports an unavailable status instead of throwing", async () => {
    const f = fixture({ offline: true });
    const status = await f.provider.inspect();
    expect(status.connected).toBe(false);
    expect(status.actions.text.available).toBe(false);
    expect(status.events.reason).toContain("not reachable");
  });

  test("conversations projects exact single coordinates and demotes groups", async () => {
    const f = fixture({
      chats: [
        targetChat as Record<string, unknown>,
        { ...targetChat, id: "!group:beeper.test", title: "Group", type: "group" } as Record<string, unknown>,
      ],
    });
    const page = await f.provider.conversations({ limit: 50 });
    expect(page.conversations).toHaveLength(2);
    expect(page.conversations[0]?.coordinate).toEqual(target);
    expect(page.conversations[0]?.kind).toBe("single");
    expect(page.conversations[1]?.kind).toBe("group");
    expect(page.complete).toBe(true);
    const resolved = await f.provider.resolve(target);
    expect(resolved.conversation.coordinate).toEqual(target);
    await expect(f.provider.resolve({ provider: "beeper", accountId: "account-1", conversationId: "!missing:beeper.test" })).rejects.toThrow();
  });

  test("conversations excludes chats bound outside the account realm", async () => {
    const stale = { ...targetChat, id: "!stale:beeper.test", accountID: "imessage_stale_account", title: "Stale" } as Record<string, unknown>;
    const f = fixture({
      chats: [targetChat as Record<string, unknown>, stale],
      accounts: [selfAccount as Record<string, unknown>],
    });
    const page = await f.provider.conversations({ limit: 50 });
    expect(page.conversations.map(value => "conversationId" in value.coordinate ? value.coordinate.conversationId : null)).toEqual([target.conversationId]);
    expect(page.complete).toBe(true);
    // A full remote window with exclusions cannot prove completeness.
    const full = fixture({
      chats: [
        { ...targetChat, id: "!a:beeper.test" } as Record<string, unknown>,
        { ...targetChat, id: "!b:beeper.test" } as Record<string, unknown>,
        stale,
      ],
    });
    const window = await full.provider.conversations({ limit: 3 });
    expect(window.conversations).toHaveLength(2);
    expect(window.complete).toBe(false);
    await f.provider.close();
    await full.provider.close();
  });

  test("outgoing messages bind to the realm's canonical Matrix self identity", async () => {
    // Desktop reports the owner as the canonical Matrix user, not the
    // bridge-scoped account user ID, on every network's message senders.
    const signalAccount = Object.freeze({
      accountID: "account-signal",
      bridge: Object.freeze({ id: "signal", provider: "local", type: "signal" }),
      network: "Signal",
      status: "connected",
      user: Object.freeze({ id: "ba_bridge_scoped_self", isSelf: true }),
    });
    const signalChat = Object.freeze({
      ...targetChat,
      id: "!signal-room:beeper.test",
      accountID: "account-signal",
      network: "Signal",
    });
    const f = fixture({
      accounts: [signalAccount as Record<string, unknown>, selfAccount as Record<string, unknown>],
      chats: [signalChat as Record<string, unknown>],
    });
    f.world.messages.push({
      ...apiMessage("m-out", "0001", { outgoing: true, text: "mine" }),
      accountID: "account-signal",
      chatID: "!signal-room:beeper.test",
    });
    const signalTarget: Extract<AutomationCoordinate, { provider: "beeper" }> = {
      provider: "beeper", accountId: "account-signal", conversationId: "!signal-room:beeper.test",
    };
    const history = await f.provider.history({ coordinate: signalTarget, limit: 10 });
    expect(history.messages.map(value => value.direction)).toEqual(["outgoing"]);
    await f.provider.close();
  });

  test("history emits ascending order and seeds a forward watermark", async () => {
    const f = fixture();
    seedMessages(f.world, 5);
    const history = await f.provider.history({ coordinate: target, limit: 200 });
    expect(history.messages.map(value => value.id)).toEqual(["m0001", "m0002", "m0003", "m0004", "m0005"]);
    expect(history.caughtUp).toBe(true);
    expect(history.gap).toBe(false);
    f.world.messages.push(apiMessage("m0006", "0006"));
    const page = await f.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 10 });
    expect(page.messages.map(value => value.id)).toEqual(["m0006"]);
    expect(page.caughtUp).toBe(true);
    const quiet = await f.provider.events({ coordinates: [target], cursor: page.nextCursor, limit: 10 });
    expect(quiet.messages).toEqual([]);
  });

  test("deleted and edited messages project their true states", async () => {
    const f = fixture();
    f.world.messages.push(apiMessage("gone", "001", { deleted: true }));
    f.world.messages.push(apiMessage("edited", "002", { edited: "2026-08-31T03:00:00.000Z" }));
    const history = await f.provider.history({ coordinate: target, limit: 200 });
    expect(history.messages.map(value => [value.kind, value.text])).toEqual([["delete", null], ["edit", "body edited"]]);
  });

  test("a full fresh window drains older pages until the watermark is proven", async () => {
    const f = fixture({ pageSize: 100 });
    seedMessages(f.world, 210);
    const history = await f.provider.history({ coordinate: target, limit: 10 });
    expect(history.messages.map(value => value.id)).toEqual(["m0201", "m0202", "m0203", "m0204", "m0205", "m0206", "m0207", "m0208", "m0209", "m0210"]);
    seedMessages(f.world, 205, 211);
    const first = await f.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 200 });
    expect(first.messages).toHaveLength(200);
    expect(first.messages[0]?.id).toBe("m0216");
    expect(first.messages[199]?.id).toBe("m0415");
    expect(first.caughtUp).toBe(false);
    expect(first.gap).toBe(false);
    const second = await f.provider.events({ coordinates: [target], cursor: first.nextCursor, limit: 200 });
    expect(second.messages.map(value => value.id)).toEqual(["m0211", "m0212", "m0213", "m0214", "m0215"]);
    expect(second.caughtUp).toBe(true);
    expect(second.gap).toBe(false);
  });

  test("a pruned drain boundary still covers every surviving message", async () => {
    const f = fixture({ pageSize: 100 });
    seedMessages(f.world, 210);
    const history = await f.provider.history({ coordinate: target, limit: 10 });
    seedMessages(f.world, 205, 211);
    const first = await f.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 200 });
    expect(first.caughtUp).toBe(false);
    // Local history below the watermark is pruned before the drain reaches it.
    f.world.messages = f.world.messages.filter(value => String(value.sortKey) > "0210");
    const second = await f.provider.events({ coordinates: [target], cursor: first.nextCursor, limit: 200 });
    expect(second.messages.map(value => value.id)).toEqual(["m0211", "m0212", "m0213", "m0214", "m0215"]);
    expect(second.caughtUp).toBe(true);
    expect(second.gap).toBe(false);
  });

  test("a cursor bound to another identity or scope is rejected", async () => {
    const f = fixture();
    seedMessages(f.world, 3);
    const history = await f.provider.history({ coordinate: target, limit: 10 });
    const other = fixture({
      accounts: [
        selfAccount as Record<string, unknown>,
        Object.freeze({
          accountID: "account-2",
          bridge: Object.freeze({ id: "telegram", provider: "cloud", type: "telegram" }),
          network: "telegram", status: "connected",
          user: Object.freeze({ id: "telegram:other", isSelf: true }),
        }) as Record<string, unknown>,
      ],
    });
    seedMessages(other.world, 3);
    await expect(other.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 10 })).rejects.toThrow("cursor");
    f.state.accountIdentity = "f".repeat(64);
    await expect(f.provider.events({ coordinates: [target], cursor: history.nextCursor, limit: 10 })).rejects.toThrow();
  });

  test("text sends cross the fence once and report unknown delivery", async () => {
    const f = fixture();
    seedMessages(f.world, 2);
    const status = await f.provider.inspect();
    const result = await f.provider.send({ identity: status.identity, coordinate: target, intentId: "intent-1", action: { kind: "text", text: "synthetic reply" } });
    expect(result).toEqual({ state: "accepted", messageId: `pending-${f.httpCalls.length}`, providerReceiptId: null, delivery: "unknown" });
    expect(f.httpCalls.filter(route => route.startsWith("POST"))).toHaveLength(1);
  });

  test("non-text actions and changed identities never reach the fence", async () => {
    const f = fixture();
    seedMessages(f.world, 2);
    const status = await f.provider.inspect();
    const rich: AutomationAction = { kind: "reaction", messageId: "m0001", emoji: "👍", remove: false };
    expect((await f.provider.send({ identity: status.identity, coordinate: target, intentId: "i-rich", action: rich })).state).toBe("not-started");
    f.state.accountIdentity = "f".repeat(64);
    expect((await f.provider.send({ identity: status.identity, coordinate: target, intentId: "i-drift", action: { kind: "text", text: "x" } })).state).toBe("not-started");
    expect(f.httpCalls.filter(route => route.startsWith("POST"))).toHaveLength(0);
  });

  test("revoked permission before the write stays not-started; a lost acceptance is indeterminate", async () => {
    const f = fixture();
    seedMessages(f.world, 2);
    const status = await f.provider.inspect();
    f.state.revoked = true;
    expect((await f.provider.send({ identity: status.identity, coordinate: target, intentId: "i-revoked", action: { kind: "text", text: "x" } })).state).toBe("not-started");
    f.state.revoked = false;
    f.world.sendAccepts = false;
    const result = await f.provider.send({ identity: status.identity, coordinate: target, intentId: "i-uncertain", action: { kind: "text", text: "x" } });
    expect(result.state).toBe("indeterminate");
    expect(f.httpCalls.filter(route => route.startsWith("POST"))).toHaveLength(1);
  });

  test("close joins active work and blocks later operations", async () => {
    const f = fixture();
    await f.provider.close();
    await expect(f.provider.inspect()).rejects.toThrow();
  });
});
