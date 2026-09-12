import { randomUUID } from "node:crypto";
import { GHOSTGET_VERSION } from "../version";
import type { VaultControlRequest, VaultItem, VaultState } from "./vault-model";
import { VaultStore } from "./vault-store";
import { assertNativeCreateSettled } from "./vault-custody";
import type { SecretStorePort } from "./vault-process";
import { credentialFailure } from "./credential-executor";
import { ControlError } from "./validation";
import { captureProcessOwnerIdentity, processOwnerStatus } from "../process-identity";

export interface ConnectedVaultPort {
  check(token: string, vaultId: string, signal: AbortSignal): Promise<void>;
  resolve(token: string, vaultId: string, itemId: string, fieldId: string, signal: AbortSignal): Promise<string>;
}
/** The SDK exists only in this isolated process. No DesktopAuth or implicit account access. */
export const onePasswordSource: ConnectedVaultPort = {
  async check(token, vaultId, signal) { await restrictedClient(token, vaultId, signal); },
  async resolve(token, vaultId, itemId, fieldId, signal) {
    const client = await restrictedClient(token, vaultId, signal);
    const value = await client.secrets.resolve(`op://${vaultId}/${itemId}/${fieldId}`);
    signal.throwIfAborted(); return value;
  },
};
async function restrictedClient(token: string, vaultId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (Buffer.byteLength(token) > 16384 || !/^ops_[\x21-\x7e]+$/u.test(token)) return credentialFailure("VAULT_SCOPE");
  try {
    const sdk = await import("@1password/sdk");
    const client = await sdk.createClient({ auth: token, integrationName: "Ghostget", integrationVersion: GHOSTGET_VERSION });
    signal.throwIfAborted();
    const vaults = await client.vaults.list({ decryptDetails: false });
    signal.throwIfAborted();
    // The user sets Read Items in 1Password. This API verifies the accessible
    // vault inventory, not all token capabilities (e.g. write or Environments).
    if (vaults.length !== 1 || vaults[0]?.id !== vaultId) return credentialFailure("VAULT_SCOPE");
    return client;
  } catch (error) {
    if (error instanceof ControlError) throw error;
    return credentialFailure("VAULT_PROVIDER_UNAVAILABLE");
  }
}

function current(store: VaultStore, revision: number, signal: AbortSignal, unlocked = true): VaultState {
  signal.throwIfAborted(); const state = store.read();
  if (state.revision !== revision) return credentialFailure("VAULT_CHANGED");
  if (unlocked && state.locked) return credentialFailure("VAULT_LOCKED");
  return state;
}
export async function resolveVaultItem(item: VaultItem, state: VaultState, secrets: SecretStorePort, connected: ConnectedVaultPort, signal: AbortSignal): Promise<string> {
  if (item.source.kind === "local") return await secrets.read(item.source.keyId, "credential", signal);
  const source = item.source;
  const connection = state.connections.find(connection => connection.id === source.connectionId && connection.vaultId === source.vaultId);
  if (!connection) return credentialFailure("VAULT_NOT_FOUND");
  const token = await secrets.read(connection.keyId, "1password-bootstrap", signal);
  signal.throwIfAborted();
  try { return await connected.resolve(token, source.vaultId, source.itemId, source.fieldId, signal); }
  catch (error) { if (error instanceof ControlError) throw error; return credentialFailure("VAULT_PROVIDER_UNAVAILABLE"); }
}

/** Consequential ordering: pending intent -> native write -> conditional activation.
 * Removal reverses authority first, then deletes only exact owned keys. */
export async function manageVault(request: VaultControlRequest, store: VaultStore, secrets: SecretStorePort, connected: ConnectedVaultPort, signal: AbortSignal, now = Date.now()): Promise<void> {
  const initial = current(store, request.expectedRevision, signal, !["vault.lock", "vault.revoke", "vault.remove", "vault.cleanup"].includes(request.action));
  const createdAt = new Date(now).toISOString();
  switch (request.action) {
    case "vault.lock": store.update(initial.revision, state => ({ ...state, locked: request.locked })); return;
    case "vault.grant": {
      const expiry = Date.parse(request.grant.expiresAt);
      if (expiry <= now || expiry > now + 30 * 86400000) return credentialFailure("INVALID_REQUEST");
      store.update(initial.revision, state => ({ ...state, grants: [...state.grants.filter(grant => grant.id !== request.grant.id), request.grant] })); return;
    }
    case "vault.revoke": {
      if (!initial.grants.some(grant => grant.id === request.id)) return credentialFailure("VAULT_NOT_FOUND");
      store.update(initial.revision, state => ({ ...state, grants: state.grants.filter(grant => grant.id !== request.id) })); return;
    }
    case "vault.local.add": case "vault.connect": {
      if (request.action === "vault.local.add" && request.kind === "token" && request.username !== null) return credentialFailure("INVALID_REQUEST");
      const purpose = request.action === "vault.connect" ? "1password-bootstrap" : "credential";
      const prepared = store.prepare(initial.revision, purpose);
      // Cancellation, a process crash, or stale commit leaves a visible pending
      // entry. Recovery never overwrites a key or automatically grants its use.
      await secrets.create(prepared.id, purpose, request.action === "vault.connect" ? "token" : request.kind, signal);
      current(store, prepared.state.revision, signal);
      if (request.action === "vault.connect") {
        const token = await secrets.read(prepared.id, purpose, signal);
        await connected.check(token, request.vaultId, signal);
        current(store, prepared.state.revision, signal);
        store.update(prepared.state.revision, state => ({ ...state, pending: state.pending.filter(p => p.id !== prepared.id), connections: [...state.connections, { id: randomUUID(), title: request.title, vaultId: request.vaultId, keyId: prepared.id, access: request.access, createdAt }] }));
      } else {
        store.update(prepared.state.revision, state => ({ ...state, pending: state.pending.filter(p => p.id !== prepared.id), items: [...state.items, { id: randomUUID(), title: request.title, kind: request.kind, username: request.username, source: { kind: "local", keyId: prepared.id }, createdAt }] }));
      }
      return;
    }
    case "vault.link": {
      const connection = initial.connections.find(connection => connection.id === request.connectionId);
      if (!connection) return credentialFailure("VAULT_NOT_FOUND");
      const item: VaultItem = { id: randomUUID(), title: request.title, kind: request.kind, username: request.username, source: { kind: "1password", connectionId: connection.id, vaultId: connection.vaultId, itemId: request.itemId, fieldId: request.fieldId }, createdAt };
      const value = await resolveVaultItem(item, initial, secrets, connected, signal);
      if (value.length === 0 || Buffer.byteLength(value) > 16384 || value.includes("\0")) return credentialFailure("VAULT_SECRET_INVALID");
      current(store, initial.revision, signal);
      store.update(initial.revision, state => ({ ...state, items: [...state.items, item] })); return;
    }
    case "vault.remove": {
      if (request.kind === "item" && !initial.items.some(item => item.id === request.id) || request.kind === "connection" && !initial.connections.some(connection => connection.id === request.id)) return credentialFailure("VAULT_NOT_FOUND");
      const removed = initial.items.filter(item => request.kind === "item" ? item.id === request.id : item.source.kind === "1password" && item.source.connectionId === request.id);
      const removedIds = new Set(removed.map(item => item.id));
      const custody={operation:"delete" as const,owner:captureProcessOwnerIdentity(process.pid)};
      const pending = [...initial.pending, ...removed.flatMap(item => item.source.kind === "local" ? [{ id: item.source.keyId, purpose: "credential" as const,...custody }] : []), ...initial.connections.filter(connection => request.kind === "connection" && connection.id === request.id).map(connection => ({ id: connection.keyId, purpose: "1password-bootstrap" as const,...custody }))];
      const next = store.update(initial.revision, state => ({ ...state, items: state.items.filter(item => !removedIds.has(item.id)), connections: state.connections.filter(connection => !(request.kind === "connection" && connection.id === request.id)), grants: state.grants.filter(grant => !removedIds.has(grant.itemId)), pending }));
      await cleanupVault(store, next.revision, secrets, signal); return;
    }
    case "vault.cleanup": await cleanupVault(store, initial.revision, secrets, signal); return;
  }
}

async function cleanupVault(store: VaultStore, expectedRevision: number, secrets: SecretStorePort, signal: AbortSignal): Promise<void> {
  let state = current(store, expectedRevision, signal, false);
  for (const pending of state.pending) {
    current(store, state.revision, signal, false);
    const ownDelete=pending.operation==="delete"&&pending.owner.pid===process.pid&&processOwnerStatus(pending.owner)==="exact-live-owner";
    if(!ownDelete&&processOwnerStatus(pending.owner)!=="different-or-dead")return credentialFailure("VAULT_CUSTODY_UNCERTAIN");
    if(pending.operation==="create")assertNativeCreateSettled(pending.id,store.environment);
    try { await secrets.delete(pending.id, pending.purpose, signal); }
    catch (error) { if (!(error instanceof ControlError) || error.code !== "VAULT_NOT_FOUND") throw error; }
    current(store, state.revision, signal, false);
    state = store.update(state.revision, current => ({ ...current, pending: current.pending.filter(item => item.id !== pending.id) }));
  }
}
