import type { ControlResponse } from "../../src/control/protocol.ts";

type Check = (value: unknown) => boolean;
const string = (max = 2048): Check => value => typeof value === "string" && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const isoDate: Check = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value));
const integer: Check = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const bool: Check = value => typeof value === "boolean";
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
const approval = object({ id: string(), digest: string(), kind: one("provider", "web"), title: string(), account: nullable(string()), effect: string(), preview: string(240 * 1024), expiresAt: isoDate });
const outcome = one("started", "succeeded", "denied", "failed", "cancelled", "interrupted");
const row = object({ id: string(), sequence: integer, startedAt: isoDate, finishedAt: nullable(isoDate), durationMs: nullable(integer), method: one("GET", "HEAD"), origin: nullable(string()), ruleId: nullable(string()), endpoint: nullable(string()), decision, outcome, httpStatus: nullable(integer), responseBytes: integer, errorCode: nullable(string()) });
const snapshot = object({ version: string(), accountId: nullable(string()), accounts: list(account, 1024, "id"), capabilities: list(capability, 10000), interfaces: list(integration, 1024, "id"), policy: object({ managed: bool, revision: integer }), web: object({ revision: integer, gatewayOnly: bool, rules: list(rule, 256, "id") }), approvals: list(approval, 256, "id"), connectionProviders: list(object({ id: string(), title: string() }), 256, "id"), vault: object({ provider: one("1password"), available: bool, purpose: one("x-user-token-import") }) });
const data: Check = value => [
  object({ kind: one("snapshot"), snapshot }),
  object({ kind: one("approvals"), approvals: list(approval, 128, "id") }),
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
