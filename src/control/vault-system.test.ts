import { afterEach, expect, spyOn, test } from "bun:test";
import fc from "fast-check";
import { randomUUID } from "node:crypto";
import { canonicalJson } from "../canonical-json";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCredentialGrant, executeCredential, projectCredentialResponse } from "./credential-executor";
import { CredentialGateway } from "./credential-gateway";
import { ApprovalBroker } from "./approval-broker";
import { ActivityStore } from "./activity";
import { VaultStore, EMPTY_VAULT, VAULT_METADATA_MAX_BYTES, parseCredentialGrant, parseVaultControlRequest, parseVaultState } from "./vault-store";
import { manageVault, resolveVaultItem, type ConnectedVaultPort } from "./vault-runtime";
import type { CredentialGrant, VaultItem } from "./vault-model";
import type { SecretStorePort } from "./vault-process";
import { exchangeVault } from "./vault-process";
import { ControlError } from "./validation";
import { saveWebPolicy } from "./web-policy";

const cleanup: (() => void)[] = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); });
const signal = () => new AbortController().signal;
const query = { search: "", method: "all" as const, outcome: "all" as const, origin: null, since: null, order: "newest" as const, cursor: null, limit: 100 };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ghostget-vault-")); cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const environment = { ...process.env, GHOSTGET_STATE_HOME: join(root, "state"), WRENCH_STATE_HOME: undefined, OH_STATE_HOME: undefined, IO_HOME: undefined };
  const store = new VaultStore(environment);
  const values = new Map<string, string>();
  const operations: string[] = [];
  const secrets: SecretStorePort = {
    async create(id, purpose) { operations.push(`create:${purpose}:${id}`); expect(store.read().pending.some(p => p.id === id && p.purpose === purpose)).toBe(true); if (values.has(`${purpose}:${id}`)) throw new Error("duplicate"); values.set(`${purpose}:${id}`, purpose === "credential" ? "synthetic-long-password-密" : "ops_synthetic_token"); },
    async read(id, purpose) { operations.push(`read:${purpose}:${id}`); const result = values.get(`${purpose}:${id}`); if (result === undefined) throw new ControlError("VAULT_NOT_FOUND", "missing"); return result; },
    async delete(id, purpose) { operations.push(`delete:${purpose}:${id}`); expect(store.read().pending.some(p => p.id === id)).toBe(true); values.delete(`${purpose}:${id}`); },
  };
  const connected: ConnectedVaultPort = { async check() {}, async resolve() { return "connected-synthetic-password"; } };
  const unlock = () => store.update(store.read().revision, state => ({ ...state, locked: false }));
  const run = (request: Parameters<typeof manageVault>[0]) => manageVault(request, store, secrets, connected, signal());
  return { root, environment, store, values, operations, secrets, connected, unlock, run };
}
function ready() {
  const f = fixture();
  const item: VaultItem = { id: randomUUID(), title: "Example login", kind: "password", username: "person", source: { kind: "local", keyId: randomUUID() }, createdAt: new Date().toISOString() };
  const grant: CredentialGrant = { id: randomUUID(), title: "Read example name", itemId: item.id, decision: "allow", expiresAt: new Date(Date.now() + 86400000).toISOString(), use: { kind: "https-json", url: "https://api.example.com/profile", authentication: "basic", fields: ["/profile/name"] } };
  f.store.update(0, state => ({ ...state, locked: false, items: [item], grants: [grant] }));
  saveWebPolicy([{ id: "profile", origin: "https://api.example.com", path: { kind: "exact", value: "/profile" }, methods: ["GET"], queryKeys: [], decision: "allow", effect: "retrieval", maxResponseBytes: 1024, timeoutMs: 1000 }], false, 0, f.environment);
  return { ...f, item, grant };
}

test("local create records pending intent and stores no secret bytes in metadata", async () => {
  const f = fixture(); f.unlock();
  await f.run({ action: "vault.local.add", title: "My login", kind: "password", username: "person", expectedRevision: 1 });
  expect(f.store.read()).toMatchObject({ revision: 3, pending: [], items: [{ title: "My login", source: { kind: "local" } }] });
  const text = readFileSync(join(f.environment.GHOSTGET_STATE_HOME, "control", "vault.json"), "utf8");
  expect(text).not.toContain("synthetic-long-password");
  expect(f.operations.filter(op => op.startsWith("read:"))).toHaveLength(0);
  expect(() => f.store.update(1, state => state)).toThrow("changed");
});

test("cancelled native entry is recoverable without creating a grant or overwriting a key", async () => {
  const f = fixture(); f.unlock();
  f.secrets.create = async () => { throw new ControlError("VAULT_CANCELLED", "cancelled"); };
  await expect(f.run({ action: "vault.local.add", title: "Login", kind: "password", username: null, expectedRevision: 1 })).rejects.toMatchObject({ code: "VAULT_CANCELLED" });
  expect(f.store.read()).toMatchObject({ revision: 2, items: [], grants: [] }); expect(f.store.read().pending).toHaveLength(1);
  await expect(f.run({action:"vault.cleanup",expectedRevision:2})).rejects.toMatchObject({code:"VAULT_CUSTODY_UNCERTAIN"});
  // Simulate a prior boot: the creating helper is conclusively gone. In this
  // injected native port no request was sent and no native receipt exists.
  f.store.update(2,state=>({...state,pending:state.pending.map(p=>({...p,owner:{...p.owner,bootId:"0".repeat(64)}}))}));
  await f.run({ action: "vault.cleanup", expectedRevision: 3 }); expect(f.store.read().pending).toHaveLength(0);
});

test("a lock during native entry fences publication and retains an exact cleanup intent", async () => {
  const f = fixture(); f.unlock(); const original = f.secrets.create;
  f.secrets.create = async (...args) => { await original(...args); f.store.lock(); };
  await expect(f.run({ action: "vault.local.add", title: "Login", kind: "password", username: "person", expectedRevision: 1 })).rejects.toMatchObject({ code: "VAULT_CHANGED" });
  expect(f.store.read().locked).toBe(true); expect(f.store.read().items).toHaveLength(0); expect(f.store.read().pending).toHaveLength(1);
});

test("removal revokes authority before any failing native deletion; cleanup never restores it", async () => {
  const f = ready();
  f.secrets.delete = async () => { expect(f.store.read().items).toHaveLength(0); expect(f.store.read().grants).toHaveLength(0); throw new Error("storage unavailable"); };
  await expect(f.run({ action: "vault.remove", id: f.item.id, kind: "item", expectedRevision: 1 })).rejects.toThrow();
  expect(f.store.read().pending).toHaveLength(1); expect(() => checkCredentialGrant(f.grant.id, f.environment)).toThrow();
});

test("1Password bootstrap is separate, links resolve on use, and unlink never deletes remote data", async () => {
  const f = fixture(); f.unlock(); let checks = 0; let resolutions = 0;
  f.connected.check = async (token, vaultId) => { expect(token).toBe("ops_synthetic_token"); expect(vaultId).toBe("a".repeat(26)); checks++; };
  f.connected.resolve = async (token, vault, item, field) => { expect(token).toBe("ops_synthetic_token"); expect([vault, item, field]).toEqual(["a".repeat(26), "b".repeat(26), "password"]); resolutions++; return "synthetic-connected-secret"; };
  await f.run({ action: "vault.connect", title: "Shared vault", vaultId: "a".repeat(26), access: "dedicated-vault-read-only", expectedRevision: 1 });
  const connection = f.store.read().connections[0]!;
  await f.run({ action: "vault.link", title: "Linked login", kind: "password", username: "person", connectionId: connection.id, itemId: "b".repeat(26), fieldId: "password", expectedRevision: 3 });
  const state = f.store.read();
  expect(await resolveVaultItem(state.items[0]!, state, f.secrets, f.connected, signal())).toBe("synthetic-connected-secret");
  expect(checks).toBe(1); expect(resolutions).toBe(2); expect(f.values.size).toBe(1);
  expect(readFileSync(join(f.environment.GHOSTGET_STATE_HOME, "control", "vault.json"), "utf8")).not.toContain("synthetic-connected-secret");
  await f.run({ action: "vault.remove", kind: "connection", id: connection.id, expectedRevision: 4 });
  expect(f.store.read().items).toHaveLength(0); expect(f.store.read().connections).toHaveLength(0); expect(f.values.size).toBe(0);
});

test("initialized missing state blocks credentials; bootstrap IDs cannot alias generic items", () => {
  const f = ready(); unlinkSync(join(f.environment.GHOSTGET_STATE_HOME, "control", "vault.json"));
  expect(() => f.store.read()).toThrow("metadata");
  const id = randomUUID();
  expect(() => parseVaultState({ ...EMPTY_VAULT, connections: [{ id: randomUUID(), title: "Shared", vaultId: "a".repeat(26), keyId: id, access: "dedicated-vault-read-only", createdAt: new Date().toISOString() }], items: [{ ...f.item, source: { kind: "local", keyId: id } }] })).toThrow();
});

test("strict grant laws reject generated extra authority and preserve valid decisions", () => {
  const { grant } = ready();
  const options = { numRuns: 100, ...(process.env.GHOSTGET_PROPERTY_SEED ? { seed: Number(process.env.GHOSTGET_PROPERTY_SEED) } : {}), ...(process.env.GHOSTGET_PROPERTY_PATH ? { path: process.env.GHOSTGET_PROPERTY_PATH } : {}) };
  fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 32 }).filter(key => !Object.hasOwn(grant, key)), key => { expect(() => parseCredentialGrant({ ...grant, [key]: "extra" })).toThrow(); }), options);
  fc.assert(fc.property(fc.constantFrom("ask", "allow", "deny"), decision => { const value = { ...grant, decision }; expect(parseCredentialGrant(JSON.parse(JSON.stringify(value)))).toEqual(value); }), options);
  for (const fields of [[""], ["/password"], ["/__proto__/name"], ["/profile"], ["/a~1b"]]) {
    if (fields[0] === "/profile") continue;
    expect(() => parseCredentialGrant({ ...grant, use: { ...grant.use, fields } })).toThrow();
  }
  for (const url of ["http://api.example.com/profile", "https://user:password@api.example.com/profile", "https://127.0.0.1/profile", "https://api.example.com/profile?x=y"]) expect(() => parseCredentialGrant({ ...grant, use: { ...grant.use, url } })).toThrow();
  expect(() => parseVaultControlRequest({ action: "vault.local.add", title: "Login", kind: "password", username: null, expectedRevision: 0, value: "secret" })).toThrow();
});

test("only selected scalar result fields leave the broker; echoed and encoded credentials block the whole result", () => {
  const secret = "synthetic-password-密";
  expect(projectCredentialResponse('{"profile":{"name":"Ada","internal":"hidden"}}', ["/profile/name"], [secret])).toEqual({ "/profile/name": "Ada" });
  for (const echo of [secret, encodeURIComponent(secret), Buffer.from(secret).toString("base64"), Buffer.from(secret).toString("base64url")]) expect(() => projectCredentialResponse(JSON.stringify({ profile: { name: "Ada" }, hidden: echo }), ["/profile/name"], [secret])).toThrow();
  for (const body of ['{"profile":{"name":{}}}', '{"profile":{"name":[]}}', '{"profile":{}}', '{"profile":{"name":"a","name":"b"}}']) expect(() => projectCredentialResponse(body, ["/profile/name"], [secret])).toThrow();
});

test("credential and DNS rechecks stop revocation at every asynchronous boundary", async () => {
  for (const phase of ["resolve", "dns", "response"] as const) {
    const f = ready(); let dispatched = false; const hash = checkCredentialGrant(f.grant.id, f.environment).approval.digest;
    const revoke = () => f.store.update(f.store.read().revision, state => ({ ...state, grants: [] }));
    await expect(executeCredential(f.grant.id, hash, randomUUID(), f.environment, signal(), {
      async resolve() { if (phase === "resolve") revoke(); return "synthetic-password"; },
      async transport(_url, init, _timeout, beforeRequest) { expect(new Headers(init.headers).get("Authorization")).toBe(`Basic ${Buffer.from("person:synthetic-password").toString("base64")}`); expect(init.redirect).toBe("error"); if (phase === "dns") revoke(); beforeRequest(); dispatched = true; if (phase === "response") revoke(); return Response.json({ profile: { name: "Ada" } }); },
    })).rejects.toThrow();
    expect(dispatched).toBe(phase === "response");
  }
});

test("audit is durable before secret resolution and never contains credential or result values", async () => {
  const f = ready(); const activity = new ActivityStore(f.environment); cleanup.push(() => activity.close());
  const approvals = new ApprovalBroker(async target => { if (target.kind !== "credential") throw new Error(); return checkCredentialGrant(target.grantId, f.environment).approval; }); cleanup.push(() => approvals.close());
  let called = 0;
  const gateway = new CredentialGateway(activity, approvals, f.environment, async (request, environment, operationSignal) => {
    expect(activity.query(query).rows[0]?.outcome).toBe("started"); called++;
    const r = request as { grantId: string; digest: string; id: string };
    return await executeCredential(r.grantId, r.digest, r.id, environment, operationSignal!, { async resolve() { return "synthetic-secret-material"; }, async transport(_url, _init, _timeout, before) { before(); return Response.json({ profile: { name: "private-result-name" } }); } });
  });
  const result = await gateway.run(f.grant.id, signal()); expect(result.fields).toEqual({ "/profile/name": "private-result-name" });
  expect(activity.query(query).rows[0]?.responseBytes).toBe(Buffer.byteLength(JSON.stringify({ profile: { name: "private-result-name" } })));
  const bytes = readFileSync(join(f.environment.GHOSTGET_STATE_HOME, "control", "activity", "requests.sqlite"));
  expect(bytes.includes(Buffer.from("synthetic-secret-material"))).toBe(false); expect(bytes.includes(Buffer.from("private-result-name"))).toBe(false);
  const finish = spyOn(activity, "finish").mockImplementation(() => { throw new Error("disk full"); });
  await expect(gateway.run(f.grant.id, signal())).rejects.toMatchObject({ code: "ACTIVITY_COMMIT_FAILED" }); finish.mockRestore();
  gateway.pause(); await expect(gateway.run(f.grant.id, signal())).rejects.toMatchObject({ code: "CREDENTIAL_BUSY" }); expect(called).toBe(2); gateway.resume();
});

test("secret exchange joins process exit and rejects noisy/malformed output without exposing diagnostics", async () => {
  const child = (text: string, code: number) => ({ stdin: { write() {}, end() {} }, stdout: new Response(text).body!, exited: Promise.resolve(code), kill() {} });
  expect(await exchangeVault(child('{"ok":true}', 0), {})).toEqual({ ok: true });
  await expect(exchangeVault(child('{"ok":false,"code":"CANCELLED"}', 1), {})).rejects.toMatchObject({ code: "VAULT_CANCELLED" });
  await expect(exchangeVault(child('SDK SECRET LOG\n{"ok":true}', 0), {})).rejects.toMatchObject({ code: "VAULT_UNCERTAIN" });
  await expect(exchangeVault(child('{"ok":false,"code":"SECRET_VALUE"}', 1), {})).rejects.toMatchObject({ code: "VAULT_UNCERTAIN" });
  await expect(exchangeVault(child('{"ok":true}', 1), {})).rejects.toMatchObject({ code: "VAULT_UNCERTAIN" });
});


test("metadata capacity admits only readable UTF-8 bytes and preserves the prior state on refusal", () => {
  const f = ready();
  const grants = Array.from({ length: 512 }, (_, index): CredentialGrant => ({
    ...f.grant, id: randomUUID(), title: `界${index}`,
    use: { ...f.grant.use, fields: Array.from({ length: 16 }, (_, field) => `/${"a".repeat(63)}/${"b".repeat(63)}/${"c".repeat(63)}/${field}`) },
  }));
  const initial = f.store.read();
  const encoded = (count: number) => Buffer.byteLength(`${canonicalJson({ ...initial, revision: 2, grants: grants.slice(0, count) })}\n`);
  let count = 0; while (encoded(count + 1) <= VAULT_METADATA_MAX_BYTES) count++;
  expect(count).toBeGreaterThan(0); expect(count).toBeLessThan(512);
  f.store.update(1, state => ({ ...state, grants: grants.slice(0, count) }));
  const path = join(f.environment.GHOSTGET_STATE_HOME, "control", "vault.json");
  const before = readFileSync(path, "utf8");
  expect(Buffer.byteLength(before)).toBe(encoded(count));
  expect(() => f.store.update(2, state => ({ ...state, grants: grants.slice(0, count + 1) }))).toThrow("metadata is full");
  expect(readFileSync(path, "utf8")).toBe(before);
  expect(f.store.read().grants).toHaveLength(count);
  const empty = fixture();
  expect(() => empty.store.update(0, () => ({ ...initial, grants }))).toThrow("metadata is full");
  expect(existsSync(join(empty.environment.GHOSTGET_STATE_HOME, "control", "vault-managed.json"))).toBe(false);
  expect(empty.store.read()).toEqual(EMPTY_VAULT);
});

test("cleanup cannot race a live creating helper into an orphaned secret", async () => {
  const f = fixture(); f.unlock();
  let release!: () => void; const barrier = new Promise<void>(resolve => { release = resolve; });
  const original = f.secrets.create;
  f.secrets.create = async (...args) => { await barrier; await original(...args); };
  const creating = f.run({ action: "vault.local.add", title: "Delayed login", kind: "password", username: "person", expectedRevision: 1 });
  expect(f.store.read().pending).toHaveLength(1);
  await expect(f.run({ action: "vault.cleanup", expectedRevision: 2 })).rejects.toMatchObject({ code: "VAULT_CUSTODY_UNCERTAIN" });
  expect(f.operations).toEqual([]);
  release(); await creating;
  expect(f.store.read().items).toHaveLength(1); expect(f.store.read().pending).toHaveLength(0); expect(f.values.size).toBe(1);
});
