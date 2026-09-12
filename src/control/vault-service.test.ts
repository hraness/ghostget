import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlService } from "./service";
import { VaultStore, parseVaultControlRequest } from "./vault-store";
import { manageVault, type ConnectedVaultPort } from "./vault-runtime";
import type { CredentialGrant, VaultItem } from "./vault-model";
import { ControlError, keys, record } from "./validation";
import type { SecretStorePort, runVaultHelper } from "./vault-process";

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function barrier() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-vault-service-")));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const environment = { ...process.env, GHOSTGET_STATE_HOME: join(root, "state"), WRENCH_STATE_HOME: undefined, OH_STATE_HOME: undefined, IO_HOME: undefined };
  const store = new VaultStore(environment), entered = barrier(), release = barrier();
  const values = new Set<string>(); let calls = 0; let operationSignal: AbortSignal | undefined;
  let failure: Error | undefined;
  const secrets: SecretStorePort = {
    async create(id) { entered.resolve(); await release.promise; if (failure) throw failure; values.add(id); },
    async read() { throw Error("No credential reads belong to these management tests"); },
    async delete(id) { values.delete(id); },
  };
  const connected: ConnectedVaultPort = { async check() { throw Error("No remote provider calls belong to these tests"); }, async resolve() { throw Error("No remote provider calls belong to these tests"); } };
  const helper: typeof runVaultHelper = async (value, actualEnvironment, signal) => {
    expect(actualEnvironment).toBe(environment); expect(signal).toBeDefined(); operationSignal = signal; calls++;
    const request = record(value); keys(request, ["action", "request"]); expect(request.action).toBe("manage");
    try { await manageVault(parseVaultControlRequest(request.request), store, secrets, connected, signal!); }
    catch (error) { if (error instanceof ControlError) throw error; if (signal!.aborted) throw new ControlError("VAULT_UNCERTAIN", "Interrupted native operation"); throw error; }
    return { ok: true };
  };
  const service = new ControlService(environment, helper);
  const active = new Set<Promise<unknown>>();
  cleanups.push(async () => { service.beginShutdown(); release.resolve(); await Promise.allSettled(active); service.close(); });
  const unlock = () => service.request({ action: "vault.lock", locked: false, expectedRevision: store.read().revision });
  const add = () => { const result = service.request({ action: "vault.local.add", title: "Synthetic local item", kind: "password", username: "synthetic-person", expectedRevision: store.read().revision }); active.add(result); void result.finally(() => active.delete(result)); return result; };
  const seed = () => {
    const item: VaultItem = { id: randomUUID(), title: "Existing synthetic login", kind: "password", username: "synthetic-person", source: { kind: "local", keyId: randomUUID() }, createdAt: new Date().toISOString() };
    const grant: CredentialGrant = { id: randomUUID(), title: "Read synthetic profile", itemId: item.id, decision: "allow", expiresAt: new Date(Date.now() + 86400000).toISOString(), use: { kind: "https-json", url: "https://api.example.com/profile", authentication: "basic", fields: ["/profile/name"] } };
    store.update(store.read().revision, state => ({ ...state, items: [item], grants: [grant] })); return { item, grant };
  };
  return { service, store, entered, release, values, unlock, add, seed, calls: () => calls, signal: () => operationSignal, fail: (error: Error) => { failure = error; } };
}

test("the actual service serializes native additions until the prior helper is joined", async () => {
  const f = fixture(); expect(await f.unlock()).toMatchObject({ ok: true });
  const first = f.add(); await f.entered.promise;
  expect(f.calls()).toBe(1); expect(f.store.read().pending).toHaveLength(1);
  expect(await f.add()).toMatchObject({ ok: false, code: "VAULT_CUSTODY_UNCERTAIN" }); expect(f.calls()).toBe(1);
  await expect(f.service.credentials.run(randomUUID(), new AbortController().signal)).rejects.toMatchObject({ code: "CREDENTIAL_BUSY" });
  f.release.resolve(); expect(await first).toMatchObject({ ok: true });
  expect(f.store.read().items).toHaveLength(1); expect(f.store.read().pending).toHaveLength(0); expect(f.values.size).toBe(1);
  expect(await f.add()).toMatchObject({ ok: true }); expect(f.calls()).toBe(2); expect(f.store.read().items).toHaveLength(2);
});

test("lock aborts a pending addition and its late native success cannot activate an item", async () => {
  const f = fixture(); await f.unlock(); const { grant } = f.seed(); const first = f.add(); await f.entered.promise;
  expect(await f.service.request({ action: "vault.lock", locked: true, expectedRevision: f.store.read().revision })).toMatchObject({ ok: true });
  expect(f.signal()?.aborted).toBe(true); expect(f.store.read().locked).toBe(true);
  expect(await f.unlock()).toMatchObject({ ok: false, code: "VAULT_CUSTODY_UNCERTAIN" });
  expect(await f.service.request({ action: "vault.revoke", id: grant.id, expectedRevision: f.store.read().revision })).toMatchObject({ ok: true });
  expect(f.store.read().grants).toEqual([]);
  f.release.resolve(); expect(await first).toMatchObject({ ok: false, code: "VAULT_UNCERTAIN" });
  expect(f.store.read().locked).toBe(true); expect(f.store.read().grants).toEqual([]); expect(f.store.read().items).toHaveLength(1); expect(f.store.read().pending).toHaveLength(1);
  expect(f.values.size).toBe(1); // The uncertain native write remains an exact cleanup intent.
});

test("revoke remains available during management and after uncertain custody poisons new changes", async () => {
  const f = fixture(); await f.unlock(); const { grant } = f.seed(); f.fail(new ControlError("VAULT_CUSTODY_UNCERTAIN", "Native process could not be joined"));
  const first = f.add(); await f.entered.promise;
  expect(await f.service.request({ action: "vault.revoke", id: grant.id, expectedRevision: f.store.read().revision })).toMatchObject({ ok: true });
  expect(f.signal()?.aborted).toBe(true); expect(f.store.read().grants).toEqual([]);
  f.release.resolve(); expect(await first).toMatchObject({ ok: false, code: "VAULT_CUSTODY_UNCERTAIN" });
  expect(await f.add()).toMatchObject({ ok: false, code: "VAULT_CUSTODY_UNCERTAIN" }); expect(f.calls()).toBe(1);
  await expect(f.service.credentials.run(randomUUID(), new AbortController().signal)).rejects.toMatchObject({ code: "CREDENTIAL_BUSY" });
  expect(await f.service.request({ action: "vault.lock", locked: true, expectedRevision: f.store.read().revision })).toMatchObject({ ok: true });
  expect(await f.service.request({ action: "vault.revoke", id: grant.id, expectedRevision: f.store.read().revision })).toMatchObject({ ok: true });
  expect(await f.unlock()).toMatchObject({ ok: false, code: "VAULT_CUSTODY_UNCERTAIN" });
  expect(f.store.read().locked).toBe(true); expect(f.store.read().grants).toEqual([]); expect(f.store.read().items).toHaveLength(1); expect(f.store.read().pending).toHaveLength(1);
});

test("an ordinary joined helper failure releases serialization without restoring a revoked grant", async () => {
  const f = fixture(); await f.unlock(); const { grant } = f.seed(); f.fail(new ControlError("VAULT_CANCELLED", "Native input cancelled"));
  const first = f.add(); await f.entered.promise;
  expect(await f.service.request({ action: "vault.revoke", id: grant.id, expectedRevision: f.store.read().revision })).toMatchObject({ ok: true });
  f.release.resolve(); expect(await first).toMatchObject({ ok: false, code: "VAULT_CANCELLED" });
  expect(await f.unlock()).toMatchObject({ ok: true });
  expect(await f.add()).toMatchObject({ ok: false, code: "VAULT_CANCELLED" }); expect(f.calls()).toBe(2);
  expect(f.store.read().grants).toEqual([]); expect(f.store.read().items).toHaveLength(1); expect(f.store.read().pending).toHaveLength(2);
});

test("shutdown aborts management and late helper work cannot reactivate credential authority", async () => {
  const f = fixture(); await f.unlock(); const first = f.add(); await f.entered.promise;
  f.service.beginShutdown(); expect(f.signal()?.aborted).toBe(true);
  f.release.resolve(); expect(await first).toMatchObject({ ok: false, code: "VAULT_UNCERTAIN" });
  expect(f.store.read().items).toEqual([]); expect(f.store.read().grants).toEqual([]); expect(f.store.read().pending).toHaveLength(1);
});
