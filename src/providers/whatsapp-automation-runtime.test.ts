import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, realpath, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWhatsAppAutomationRuntime } from "./whatsapp-automation-runtime";
import type { GhostgetAuth } from "../auth";

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "ghostget-whatsapp-synthetic-"))); directories.push(directory); await chmod(directory, 0o700);
  const session = new Database(join(directory, "session.db")); session.exec("CREATE TABLE whatsmeow_device(jid TEXT,lid TEXT)"); session.query("INSERT INTO whatsmeow_device VALUES(?,NULL)").run("15550000001:7@s.whatsapp.net"); session.close(); await chmod(join(directory, "session.db"), 0o600);
  const messages = new Database(join(directory, "wacli.db")); messages.exec("CREATE TABLE ghostget_automation_state(singleton INTEGER,version INTEGER,generation TEXT)"); messages.query("INSERT INTO ghostget_automation_state VALUES(1,1,?)").run("c".repeat(64)); messages.close(); await chmod(join(directory, "wacli.db"), 0o600);
  const auth: GhostgetAuth = { schemaVersion: 1, id: "synthetic-account", kind: "linked-device-store", provider: "whatsapp", path: directory, subject: "whatsapp:pn:15550000001" };
  return { directory, auth, runtime: createWhatsAppAutomationRuntime({}) };
}
test("real WhatsApp store read binds only the selected public session identity", async () => {
  const f = await fixture(); const snapshot = await f.runtime.read(f.auth, (_database, value) => value);
  expect(snapshot.account).toBe("15550000001@s.whatsapp.net"); expect(snapshot.connected).toBe(false); expect(snapshot.generation).toBeNull(); expect(snapshot.ledgerReady).toBe(true); expect(snapshot.sourceGeneration).toMatch(/^[a-f0-9]{64}$/u);
  await expect(f.runtime.read({ ...f.auth, subject: "whatsapp:pn:15550000009" }, () => undefined)).rejects.toThrow("account changed");
  await f.runtime.close(); await expect(f.runtime.read(f.auth, () => undefined)).rejects.toThrow("closed");
});
test("real WhatsApp read rejects wider ownership and ambiguous accounts", async () => {
  const f = await fixture(); await chmod(join(f.directory, "session.db"), 0o644);
  await expect(f.runtime.read(f.auth, () => undefined)).rejects.toThrow(); await chmod(join(f.directory, "session.db"), 0o600);
  const session = new Database(join(f.directory, "session.db")); session.query("INSERT INTO whatsmeow_device VALUES(?,NULL)").run("15550000009:8@s.whatsapp.net"); session.close();
  await expect(f.runtime.read(f.auth, () => undefined)).rejects.toThrow("exactly one account"); await f.runtime.close();
});
test("real WhatsApp source replacement changes enrollment generation", async () => {
  const f = await fixture(); const before = await f.runtime.read(f.auth, (_database, value) => value.sourceGeneration);
  await unlink(join(f.directory, "wacli.db")); const messages = new Database(join(f.directory, "wacli.db")); messages.exec("CREATE TABLE ghostget_automation_state(singleton INTEGER,version INTEGER,generation TEXT)"); messages.query("INSERT INTO ghostget_automation_state VALUES(1,1,?)").run("c".repeat(64)); messages.close(); await chmod(join(f.directory, "wacli.db"), 0o600);
  expect(await f.runtime.read(f.auth, (_database, value) => value.sourceGeneration)).not.toBe(before); await f.runtime.close();
});
test("real WhatsApp start refuses absent durable custody before provider launch", async () => {
  const f = await fixture(); let called = false;
  await expect(f.runtime.start(f.auth, async () => { called = true; })).rejects.toThrow("durable process custody"); expect(called).toBe(false); await f.runtime.close();
});
