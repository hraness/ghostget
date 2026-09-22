import type { ControlData } from "./protocol";
import { keys, record } from "./validation";

type Check = (value: unknown) => void;
const text: Check = value => { if (typeof value !== "string" || value.length > 524_288) throw new Error("invalid text"); };
const number: Check = value => { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("invalid number"); };
const bool: Check = value => { if (typeof value !== "boolean") throw new Error("invalid boolean"); };
const nullable = (check: Check): Check => value => { if (value !== null) check(value); };
const oneOf = (...values: readonly string[]): Check => value => { if (typeof value !== "string" || !values.includes(value)) throw new Error("invalid choice"); };
const list = (check: Check, limit = 32_768): Check => value => { if (!Array.isArray(value) || value.length > limit) throw new Error("invalid list"); for (const item of value) check(item); };
const object = (shape: Readonly<Record<string, Check>>): Check => value => { const item = record(value); keys(item, Object.keys(shape)); for (const [key, check] of Object.entries(shape)) check(item[key]); };
const permission = oneOf("allow", "deny", "ask");
const approval = object({ id: text, digest: text, kind: oneOf("provider", "web"), title: text, account: nullable(text), effect: text, preview: text, expiresAt: text });
const activity = object({ id: text, sequence: number, startedAt: text, finishedAt: nullable(text), durationMs: nullable(number), method: oneOf("GET", "HEAD"), origin: nullable(text), ruleId: nullable(text), endpoint: nullable(text), decision: permission, outcome: oneOf("started", "succeeded", "denied", "failed", "cancelled", "interrupted"), httpStatus: nullable(number), responseBytes: number, errorCode: nullable(text) });
const snapshot = object({
  version: text, accountId: nullable(text),
  accounts: list(object({ id: text, provider: nullable(text), kind: text, subject: nullable(text), revision: text, status: oneOf("configured", "verified", "reconnect-required"), source: nullable(text), tokenStorage: nullable(oneOf("external", "ghostget-import", "managed-oauth")), tokenExpiresAt: nullable(text), tokenRefreshable: bool })),
  capabilities: list(object({ digest: text, adapterId: text, operationId: text, pluginId: nullable(text), surface: text, transport: text, risk: text, effect: text, state: oneOf("available", "capture-required", "unsupported"), executorSource: oneOf("built-in", "source", "portable", "unknown"), interfaceSource: oneOf("bundled", "user", "imported"), permission: oneOf("allow", "deny", "ask", "unmanaged", "unavailable") })),
  interfaces: list(object({ id: text, title: text, source: oneOf("user", "imported"), digest: text, activeDigest: nullable(text), state: oneOf("draft", "active", "needs-executor"), operationCount: number, adapterIds: list(text), activationTargets: list(object({ adapterId: text, installedDigest: nullable(text) })), issues: list(text) })),
  policy: object({ managed: bool, revision: number }),
  web: object({ revision: number, gatewayOnly: bool, rules: list(object({ id: text, origin: text, path: object({ kind: oneOf("exact", "prefix"), value: text }), methods: list(oneOf("GET", "HEAD"), 2), queryKeys: list(text, 32), decision: permission, effect: oneOf("retrieval"), maxResponseBytes: number, timeoutMs: number }), 128) }),
  approvals: list(approval), connectionProviders: list(object({ id: text, title: text })),
  vault: object({ provider: oneOf("1password"), available: bool, purpose: oneOf("x-user-token-import") }),
});
const shapes: Readonly<Record<ControlData["kind"], Check>> = {
  snapshot: object({ kind: oneOf("snapshot"), snapshot }),
  approvals: object({ kind: oneOf("approvals"), approvals: list(approval) }),
  activity: object({ kind: oneOf("activity"), page: object({ rows: list(activity, 100), nextCursor: nullable(text), snapshotSequence: number, matchingCount: number, newerCount: number }) }),
  connection: object({ kind: oneOf("connection"), attemptId: text, status: oneOf("awaiting-sign-in", "verified"), subject: nullable(text) }),
  document: object({ kind: oneOf("document"), text, filename: text }),
  prompt: object({ kind: oneOf("prompt"), text }),
  success: object({ kind: oneOf("success"), message: text }),
};

/** The private helper is trusted code, but protocol drift must fail before a
 * frontend renders or constructs an administrative action from its response. */
export function assertControlData(value: unknown): asserts value is ControlData {
  const data = record(value);
  if (typeof data.kind !== "string" || !Object.hasOwn(shapes, data.kind)) throw new Error("invalid control data kind");
  shapes[data.kind as ControlData["kind"]](value);
}
