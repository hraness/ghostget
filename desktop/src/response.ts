import type { ControlResponse } from "../../src/control/protocol.ts";
import type { VaultView } from "../../src/control/vault-model.ts";
import { parseBrowserDiscoveryView, parseSetupRequestViews } from "../../src/control/setup-model.ts";

type Check = (value: unknown) => boolean;
const string = (max = 2048): Check => value => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const isoDate: Check = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value));
const integer: Check = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const bool: Check = value => typeof value === "boolean";
const parsed = (parse: (value: unknown) => unknown): Check => value => { try { parse(value); return true; } catch { return false; } };
const one = (...values: readonly unknown[]): Check => value => values.includes(value);
const nullable = (check: Check): Check => value => value === null || check(value);
const list = (check: Check, max: number, uniqueKey?: string): Check => value => Array.isArray(value) && value.length <= max && value.every(check) && (!uniqueKey || new Set(value.map(item => (item as Record<string, unknown>)[uniqueKey])).size === value.length);
const object = (shape: Record<string, Check>): Check => value => {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).length === Object.keys(shape).length && Object.entries(shape).every(([key, check]) => { const descriptor = descriptors[key]; return descriptor !== undefined && "value" in descriptor && descriptor.enumerable && check(descriptor.value); });
};
const decision = one("allow", "deny", "ask");
const account = object({ id: string(), provider: nullable(string()), kind: string(), subject: nullable(string()), revision: string(), status: one("configured", "verified", "reconnect-required"), source: nullable(string()), tokenStorage: one(null, "external", "ghostget-import", "managed-oauth") });
const capability = object({ digest: string(), adapterId: string(), operationId: string(), pluginId: nullable(string()), surface: string(), transport: string(), risk: string(), effect: string(), state: one("available", "capture-required", "unsupported"), executorSource: one("built-in", "source", "portable", "unknown"), interfaceSource: one("bundled", "user", "imported"), permission: one("allow", "deny", "ask", "unmanaged", "unavailable") });
const integration = object({ id: string(), title: string(), source: one("user", "imported"), digest: string(), activeDigest: nullable(string()), state: one("draft", "active", "needs-executor"), operationCount: integer, adapterIds: list(string(), 512), activationTargets: list(object({ adapterId: string(), installedDigest: nullable(string()) }), 512, "adapterId"), issues: list(string(), 512) });
const rule = object({ id: string(), origin: string(), path: object({ kind: one("exact", "prefix"), value: string() }), methods: list(one("GET", "HEAD"), 2), queryKeys: list(string(), 64), decision, effect: one("retrieval"), maxResponseBytes: integer, timeoutMs: integer });
const approval = object({ id: string(), digest: string(), kind: one("provider", "web", "credential"), title: string(), account: nullable(string()), effect: string(), preview: string(240 * 1024), expiresAt: isoDate });
const vaultId: Check = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const onePasswordId: Check = value => typeof value === "string" && /^[a-z0-9]{26}$/u.test(value);
const vaultTitle: Check = value => string(96)(value) && typeof value === "string" && value.length > 0 && value.trim() === value && !/[\r\n\t\u007f]/u.test(value);
const vaultUsername: Check = value => value === null || typeof value === "string" && value.length > 0 && string(256)(value) && !/[:\r\n\t\u007f]/u.test(value);
const vaultDate: Check = value => isoDate(value) && new Date(value as string).toISOString() === value;
const vaultSource: Check = value => object({ kind: one("local"), keyId: vaultId })(value) || object({ kind: one("1password"), connectionId: vaultId, vaultId: onePasswordId, itemId: onePasswordId, fieldId: value => typeof value === "string" && value.length <= 128 && /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?$/u.test(value) })(value);
const vaultItem = object({ id: vaultId, title: vaultTitle, kind: one("password", "token"), username: vaultUsername, source: vaultSource, createdAt: vaultDate });
const vaultConnection = object({ id: vaultId, title: vaultTitle, vaultId: onePasswordId, keyId: vaultId, access: one("dedicated-vault-read-only"), createdAt: vaultDate });
const credentialUrl: Check = value => {
  if (typeof value !== "string" || value.length > 8192 || /\s|\\/u.test(value)) return false;
  try { const url = new URL(value); return url.href === value && url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && !url.port && !/%|;|\/\//u.test(url.pathname) && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(url.hostname) && !["localhost", "local", "internal", "test", "invalid", "example", "onion"].some(tld => url.hostname.endsWith(`.${tld}`)); } catch { return false; }
};
const credentialFields: Check = value => list(pointer => typeof pointer === "string" && pointer.length <= 256 && /^(?:\/[a-zA-Z0-9_.-]{1,64}){1,8}$/u.test(pointer) && !pointer.split("/").some(part => /^(?:__proto__|prototype|constructor|password|passwd|secret|token|access_token|refresh_token|authorization|cookie|credentials)$/iu.test(part)), 16)(value) && Array.isArray(value) && value.length > 0 && new Set(value).size === value.length;
const credentialGrant = object({ id: vaultId, title: vaultTitle, itemId: vaultId, decision, expiresAt: vaultDate, use: object({ kind: one("https-json"), url: credentialUrl, authentication: one("basic", "bearer"), fields: credentialFields }) });
const vaultShape = object({ schema: one(1), revision: integer, locked: bool, available: bool, storage: one("macos-keychain", "unavailable"), items: list(vaultItem, 256, "id"), connections: list(vaultConnection, 8, "id"), grants: list(credentialGrant, 512, "id"), pending: list(object({ id: vaultId, purpose: one("credential", "1password-bootstrap") }), 256, "id") });
const vault: Check = value => {
  if (!vaultShape(value)) return false;
  const state = value as VaultView;
  const keys = [...state.items.flatMap(item => item.source.kind === "local" ? [item.source.keyId] : []), ...state.connections.map(connection => connection.keyId), ...state.pending.map(pending => pending.id)];
  return new Set(keys).size === keys.length && state.items.every(item => (item.kind !== "token" || item.username === null) && (item.source.kind !== "1password" || state.connections.some(connection => item.source.kind === "1password" && connection.id === item.source.connectionId && connection.vaultId === item.source.vaultId))) && state.grants.every(grant => state.items.some(item => item.id === grant.itemId && (grant.use.authentication === "basic" ? item.kind === "password" && item.username !== null : item.kind === "token")));
};
const outcome = one("started", "succeeded", "denied", "failed", "cancelled", "interrupted");
const row = object({ id: string(), sequence: integer, startedAt: isoDate, finishedAt: nullable(isoDate), durationMs: nullable(integer), method: one("GET", "HEAD"), origin: nullable(string()), ruleId: nullable(string()), endpoint: nullable(string()), decision, outcome, httpStatus: nullable(integer), responseBytes: integer, errorCode: nullable(string()) });
const snapshot = object({ version: string(), accountId: nullable(string()), accounts: list(account, 1024, "id"), capabilities: list(capability, 10000), interfaces: list(integration, 1024, "id"), policy: object({ managed: bool, revision: integer }), web: object({ revision: integer, gatewayOnly: bool, rules: list(rule, 256, "id") }), approvals: list(approval, 256, "id"), connectionProviders: list(object({ id: string(), title: string() }), 256, "id"), vault, discovery: parsed(parseBrowserDiscoveryView), setupRequests: parsed(parseSetupRequestViews) });
const data: Check = value => [
  object({ kind: one("snapshot"), snapshot }),
  object({ kind: one("approvals"), approvals: list(approval, 128, "id") }),
  object({ kind: one("setup-requests"), setupRequests: parsed(parseSetupRequestViews) }),
  object({ kind: one("activity"), page: object({ rows: list(row, 100, "id"), nextCursor: nullable(string(4096)), snapshotSequence: integer, matchingCount: integer, newerCount: integer }) }),
  object({ kind: one("connection"), attemptId: string(), status: one("awaiting-sign-in", "verified"), subject: nullable(string()) }),
  object({ kind: one("document"), text: string(524288), filename: string() }),
  object({ kind: one("prompt"), text: string(65536) }),
  object({ kind: one("success"), message: string() }),
].some(check => check(value));
const response: Check = value => object({ ok: one(true), data })(value) || object({ ok: one(false), code: string(128), message: string() })(value);

export function parseControlResponse(value: unknown): ControlResponse {
  if (!response(value)) throw new Error("Invalid control response");
  return value as ControlResponse;
}
