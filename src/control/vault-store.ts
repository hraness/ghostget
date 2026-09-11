import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { canonicalJson, sha256 } from "../canonical-json";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, privateStateFilesMayExist, readPrivateStateFileIfPresent, writePrivateJsonIfUnchanged } from "../storage";
import { boolean, ControlError, decision, digest, integer, invalid, keys, nullable, oneOf, publicUrl, record, string, strings } from "./validation";
import { captureProcessOwnerIdentity } from "../process-identity";
import { readInterfaceJson } from "./interface-json";
import type { CredentialGrant, VaultConnection, VaultControlRequest, VaultItem, VaultSource, VaultState } from "./vault-model";
import type { ControlEnvironment } from "./web-policy";

export const VAULT_METADATA_MAX_BYTES = 1_048_576;
export const EMPTY_VAULT: VaultState = { schema: 1, revision: 0, locked: true, items: [], connections: [], grants: [], pending: [] };
export function vaultId(value: unknown): string {
  const id = string(value, 36);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(id)) invalid();
  return id;
}
export function onePasswordId(value: unknown): string {
  const id = string(value, 26);
  if (!/^[a-z0-9]{26}$/u.test(id)) invalid();
  return id;
}
export function fieldId(value: unknown): string {
  const id = string(value, 128);
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?$/u.test(id)) invalid();
  return id;
}
function date(value: unknown): string {
  const result = string(value, 32);
  if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) invalid();
  return result;
}
function title(value: unknown): string {
  const result = string(value, 96);
  if (result.trim() !== result || /[\r\n\t]/u.test(result)) invalid();
  return result;
}
function username(value: unknown): string | null {
  const result = nullable(value, 256);
  if (result !== null && /[:\r\n\t]/u.test(result)) invalid();
  return result;
}
function source(value: unknown): VaultSource {
  const v = record(value);
  if (v.kind === "local") { keys(v, ["kind", "keyId"]); return { kind: "local", keyId: vaultId(v.keyId) }; }
  keys(v, ["kind", "connectionId", "vaultId", "itemId", "fieldId"]);
  return { kind: oneOf(v.kind, ["1password"]), connectionId: vaultId(v.connectionId), vaultId: onePasswordId(v.vaultId), itemId: onePasswordId(v.itemId), fieldId: fieldId(v.fieldId) };
}
export function parseVaultItem(value: unknown): VaultItem {
  const v = record(value); keys(v, ["id", "title", "kind", "username", "source", "createdAt"]);
  const item = { id: vaultId(v.id), title: title(v.title), kind: oneOf(v.kind, ["password", "token"]), username: username(v.username), source: source(v.source), createdAt: date(v.createdAt) };
  if (item.kind === "token" && item.username !== null) invalid();
  return item;
}
function connection(value: unknown): VaultConnection {
  const v = record(value); keys(v, ["id", "title", "vaultId", "keyId", "access", "createdAt"]);
  return { id: vaultId(v.id), title: title(v.title), vaultId: onePasswordId(v.vaultId), keyId: vaultId(v.keyId), access: oneOf(v.access, ["dedicated-vault-read-only"]), createdAt: date(v.createdAt) };
}
export function parseCredentialGrant(value: unknown): CredentialGrant {
  const v = record(value); keys(v, ["id", "title", "itemId", "decision", "expiresAt", "use"]);
  const use = record(v.use); keys(use, ["kind", "url", "authentication", "fields"]);
  const url = publicUrl(use.url);
  // A grant contains no query material and never authorizes URL substitutions.
  if (url.search) invalid();
  const fields = strings(use.fields, 16, 256);
  if (fields.length === 0 || fields.some(pointer => !/^(?:\/[a-zA-Z0-9_.-]{1,64}){1,8}$/u.test(pointer) || pointer.split("/").some(part => /^(?:__proto__|prototype|constructor|password|passwd|secret|token|access_token|refresh_token|authorization|cookie|credentials)$/iu.test(part)))) invalid();
  return { id: vaultId(v.id), title: title(v.title), itemId: vaultId(v.itemId), decision: decision(v.decision), expiresAt: date(v.expiresAt), use: { kind: oneOf(use.kind, ["https-json"]), url: url.href, authentication: oneOf(use.authentication, ["basic", "bearer"]), fields } };
}
function list<T>(value: unknown, parser: (value: unknown) => T, max: number): T[] {
  if (!Array.isArray(value) || value.length > max) invalid();
  return value.map(parser);
}
export function parseVaultState(value: unknown): VaultState {
  const v = record(value); keys(v, ["schema", "revision", "locked", "items", "connections", "grants", "pending"]);
  if (v.schema !== 1) invalid();
  const items = list(v.items, parseVaultItem, 256);
  const connections = list(v.connections, connection, 8);
  const grants = list(v.grants, parseCredentialGrant, 512);
  const pending = list(v.pending, value => { const p = record(value); keys(p, ["id", "purpose", "operation", "owner"]); const owner=record(p.owner);keys(owner,["pid","bootId","processStartId"]);return { id: vaultId(p.id), purpose: oneOf(p.purpose, ["credential", "1password-bootstrap"]),operation:oneOf(p.operation,["create","delete"]),owner:{pid:integer(owner.pid,1,2**31-1),bootId:digest(owner.bootId),processStartId:digest(owner.processStartId)} }; }, 256);
  const unique = (ids: readonly string[]) => { if (new Set(ids).size !== ids.length) invalid(); };
  unique(items.map(item => item.id)); unique(connections.map(item => item.id)); unique(grants.map(item => item.id));
  const keyIds = [...items.flatMap(item => item.source.kind === "local" ? [item.source.keyId] : []), ...connections.map(item => item.keyId), ...pending.map(item => item.id)];
  unique(keyIds);
  for (const item of items) if (item.source.kind === "1password") {
    const origin = item.source;
    if (!connections.some(connection => connection.id === origin.connectionId && connection.vaultId === origin.vaultId)) invalid();
  }
  for (const grant of grants) {
    const item = items.find(item => item.id === grant.itemId);
    if (!item || grant.use.authentication === "basic" && (item.kind !== "password" || item.username === null) || grant.use.authentication === "bearer" && item.kind !== "token") invalid();
  }
  return { schema: 1, revision: integer(v.revision, 0, Number.MAX_SAFE_INTEGER), locked: boolean(v.locked), items, connections, grants, pending };
}

export function parseVaultControlRequest(value: unknown): VaultControlRequest {
  const v = record(value); const action = string(v.action, 32);
  const exact = (...fields: string[]) => keys(v, ["action", "expectedRevision", ...fields]);
  const expectedRevision = integer(v.expectedRevision, 0, Number.MAX_SAFE_INTEGER);
  switch (action) {
    case "vault.lock": exact("locked"); return { action, locked: boolean(v.locked), expectedRevision };
    case "vault.local.add": exact("title", "kind", "username"); return { action, title: title(v.title), kind: oneOf(v.kind, ["password", "token"]), username: username(v.username), expectedRevision };
    case "vault.connect": exact("title", "vaultId", "access"); return { action, title: title(v.title), vaultId: onePasswordId(v.vaultId), access: oneOf(v.access, ["dedicated-vault-read-only"]), expectedRevision };
    case "vault.link": exact("title", "kind", "username", "connectionId", "itemId", "fieldId"); return { action, title: title(v.title), kind: oneOf(v.kind, ["password", "token"]), username: username(v.username), connectionId: vaultId(v.connectionId), itemId: onePasswordId(v.itemId), fieldId: fieldId(v.fieldId), expectedRevision };
    case "vault.remove": exact("id", "kind"); return { action, id: vaultId(v.id), kind: oneOf(v.kind, ["item", "connection"]), expectedRevision };
    case "vault.grant": exact("grant"); return { action, grant: parseCredentialGrant(v.grant), expectedRevision };
    case "vault.revoke": exact("id"); return { action, id: vaultId(v.id), expectedRevision };
    case "vault.cleanup": exact(); return { action, expectedRevision };
    default: return invalid();
  }
}

/** Marker + exact-content CAS: missing or corrupt initialized state fails closed. */
export class VaultStore {
  constructor(readonly environment: ControlEnvironment = process.env) {}
  private paths() { const directory = join(ghostgetStateHome(this.environment), "control"); return { directory, state: join(directory, "vault.json"), marker: join(directory, "vault-managed.json") }; }
  private snapshot(): { state: VaultState; text: string | null } {
    try {
      if (!privateStateFilesMayExist("control", ["vault.json", "vault-managed.json"], this.environment)) return { state: EMPTY_VAULT, text: null };
      const p = this.paths();
      const marker = readPrivateStateFileIfPresent(p.marker, 128, "vault marker", this.environment);
      const text = readPrivateStateFileIfPresent(p.state, VAULT_METADATA_MAX_BYTES, "vault metadata", this.environment);
      if (marker === null && text === null) return { state: EMPTY_VAULT, text: null };
      if (marker === null || text === null || canonicalJson(readInterfaceJson(marker, 128)) !== canonicalJson({ schema: 1, managed: true })) throw new Error();
      return { state: parseVaultState(readInterfaceJson(text, VAULT_METADATA_MAX_BYTES)), text };
    } catch { throw new ControlError("VAULT_STATE_UNAVAILABLE", "Vault metadata is missing, invalid or inaccessible. Credential use is blocked."); }
  }
  read(): VaultState { return this.snapshot().state; }
  update(expectedRevision: number, change: (current: VaultState) => VaultState): VaultState {
    const previous = this.snapshot();
    if (previous.state.revision !== expectedRevision) throw new ControlError("VAULT_CHANGED", "The vault changed. Refresh before trying again.");
    const next = parseVaultState({ ...change(previous.state), schema: 1, revision: expectedRevision + 1 });
    // Admit the exact UTF-8 storage encoding and newline before any state write.
    if (Buffer.byteLength(`${canonicalJson(next)}\n`) > VAULT_METADATA_MAX_BYTES) throw new ControlError("VAULT_CAPACITY", "Vault metadata is full. Remove unused grants or items before adding more.");
    const p = this.paths(); ensurePrivateStateDirectory(p.directory, this.environment);
    createPrivateJsonIfAbsent(p.marker, { schema: 1, managed: true }, { environment: this.environment });
    const committed = previous.text === null ? createPrivateJsonIfAbsent(p.state, next, { environment: this.environment }).created : writePrivateJsonIfUnchanged(p.state, next, { expectedCurrentContentSha256: sha256(previous.text) });
    if (!committed) throw new ControlError("VAULT_CHANGED", "The vault changed. Refresh before trying again.");
    return next;
  }
  prepare(expectedRevision: number, purpose: "credential" | "1password-bootstrap"): { id: string; state: VaultState } {
    const id = randomUUID();
    return { id, state: this.update(expectedRevision, current => ({ ...current, pending: [...current.pending, { id, purpose, operation:"create",owner:captureProcessOwnerIdentity(process.pid) }] })) };
  }
  lock(): void { const state = this.read(); if (!state.locked) this.update(state.revision, current => ({ ...current, locked: true })); }
}
