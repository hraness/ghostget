import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createImsgAutomationProvider } from "./imessage-automation";

// A real long-lived child speaking line-delimited JSON-RPC like `imsg rpc`.
// It records each spawn and reads a mode file per request so a test can make
// the live helper fail, hang or write diagnostics without restarting it.
const FAKE_IMSG = `#!${process.execPath}
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const dir = import.meta.dir;
appendFileSync(join(dir, "spawns"), process.pid + "\\n");
const mode = () => existsSync(join(dir, "mode")) ? readFileSync(join(dir, "mode"), "utf8").trim() : "";
const chat = { id: 7, name: "Fixture", identifier: "fixture@example.test", service: "iMessage", last_message_at: "2026-09-11T12:00:00.000Z", guid: "iMessage;-;fixture@example.test", is_group: false, participants: ["fixture@example.test"] };
const methods = ["status", "chats.list", "chats.get", "messages.history", "messages.after", "send", "message.send_status"];
let buffer = "";
for await (const chunk of process.stdin) {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) >= 0) {
    const request = JSON.parse(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
    const current = mode();
    if (current === "exit") process.exit(3);
    if (current === "stderr") process.stderr.write("native diagnostic\\n");
    if (current === "hang") continue;
    let result;
    if (request.method === "status") result = { version: "0.14.1", protocol_version: 1, database: { ready: true, path: join(dir, "chat.db") }, bridge: { ready: false }, contacts: { available: true }, methods, supported_methods: methods };
    else if (request.method === "chats.get") result = { chat };
    else result = { ok: true };
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\\n");
  }
}
`;

const roots: string[] = [];
const providers: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const provider of providers.splice(0)) await provider.close().catch(() => undefined);
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture(sessionIdleMs = 60_000) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-imessage-session-"))); roots.push(directory); chmodSync(directory, 0o700);
  writeFileSync(join(directory, "chat.db"), "synthetic", { mode: 0o600 });
  const binary = join(directory, "imsg"); writeFileSync(binary, FAKE_IMSG, { mode: 0o700 });
  const barriers: { promise: Promise<void>; state: "pending" | "verified" | "unsafe" }[] = [];
  const custody: boolean[] = [];
  let authorizationError = false;
  const provider = createImsgAutomationProvider({
    async authorize() {
      if (authorizationError) throw new Error("revoked");
      return { auth: { schemaVersion: 1, id: "imessage-fixture", kind: "linked-device-store", provider: "imessage", path: directory }, accountIdentity: "a".repeat(64), implementationIdentity: "b".repeat(64) };
    },
    execution: {
      registerCleanupBarrier(promise) { const entry = { promise, state: "pending" as "pending" | "verified" | "unsafe" }; promise.then(() => { entry.state = "verified"; }, () => { entry.state = "unsafe"; }); barriers.push(entry); return () => {}; },
      retainCustody(held) { custody.push(held); },
    },
    async resolveAsset() { throw new Error("unused"); },
    dependencies: { binaryPath: binary, expectedMessagesStorePath: directory },
    sessionIdleMs,
  });
  providers.push(provider);
  const spawns = () => existsSync(join(directory, "spawns")) ? readFileSync(join(directory, "spawns"), "utf8").trim().split("\n").map(Number) : [];
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  return { provider, barriers, custody, spawns, alive, mode: (value: string) => writeFileSync(join(directory, "mode"), value), revoke: () => { authorizationError = true; } };
}
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 50));

test("consecutive operations reuse one verified helper until the provider closes", async () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) expect((await f.provider.inspect()).connected).toBe(true);
  expect(f.spawns()).toHaveLength(1);
  expect(f.barriers.map(entry => entry.state)).toEqual(["pending"]);
  expect(f.custody).toEqual([true]);
  const [pid] = f.spawns();
  await f.provider.close(); await settle();
  expect(f.barriers.map(entry => entry.state)).toEqual(["verified"]);
  expect(f.custody).toEqual([true, false]);
  expect(f.alive(pid!)).toBe(false);
});

test("a helper that exits, writes diagnostics or is abandoned is retired and replaced", async () => {
  const f = fixture();
  await f.provider.inspect();
  for (const fault of ["exit", "stderr"]) {
    f.mode(fault);
    await expect(f.provider.inspect()).rejects.toThrow();
    f.mode("");
    expect((await f.provider.inspect()).connected).toBe(true);
  }
  // A cancelled request retires the helper too: its answer can never bind later.
  f.mode("hang"); const controller = new AbortController();
  const hung = f.provider.inspect(controller.signal); await settle(); controller.abort();
  await expect(hung).rejects.toThrow(); f.mode("");
  expect((await f.provider.inspect()).connected).toBe(true);
  const pids = f.spawns();
  expect(pids).toHaveLength(4);
  await settle();
  for (const pid of pids.slice(0, 3)) expect(f.alive(pid)).toBe(false);
  // Every retired helper proved cleanup; only the live one still holds custody.
  expect(f.barriers.map(entry => entry.state)).toEqual(["verified", "verified", "verified", "pending"]);
  expect(f.custody.filter(Boolean).length - f.custody.filter(held => !held).length).toBe(1);
});

test("an unused helper closes after its idle window and releases custody", async () => {
  const f = fixture(100);
  await f.provider.inspect();
  const [pid] = f.spawns();
  await new Promise<void>(resolve => setTimeout(resolve, 400));
  expect(f.alive(pid!)).toBe(false);
  expect(f.barriers.map(entry => entry.state)).toEqual(["verified"]);
  expect(f.custody).toEqual([true, false]);
  // The next operation admits a fresh helper.
  expect((await f.provider.inspect()).connected).toBe(true);
  expect(f.spawns()).toHaveLength(2);
});

test("revoked authority never reaches the live helper", async () => {
  const f = fixture();
  await f.provider.inspect();
  f.revoke();
  await expect(f.provider.inspect()).rejects.toThrow("revoked");
  expect(f.spawns()).toHaveLength(1);
});
