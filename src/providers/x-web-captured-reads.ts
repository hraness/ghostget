import { randomUUID } from "node:crypto";

/** Discovery targets are provider data, never caller-selected URLs or routes. */
export type XWebDiscoveryTarget = {
  readonly source: "trending" | "today-news";
  readonly kind: "timeline" | "story";
  readonly value: string;
};

export type XWebDiscoveryTargetBinding = {
  readonly accountId: string;
  readonly subject: string;
  readonly revision: string;
};

export const X_WEB_DISCOVERY_TARGET_BOUNDS = Object.freeze({
  maxEntries: 128,
  ttlMs: 600_000,
  maxValueCharacters: 4_096,
});

type StoredTarget = {
  readonly binding: XWebDiscoveryTargetBinding;
  readonly target: XWebDiscoveryTarget;
  readonly expiresAt: number;
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("X discovery target must be an object");
  }
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, expected: readonly string[]): void {
  if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) {
    throw new Error("X discovery target has unreviewed fields");
  }
}

function bounded(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("X discovery target contains an invalid bounded value");
  }
  return value;
}

function source(value: unknown): XWebDiscoveryTarget["source"] {
  if (value !== "trending" && value !== "today-news") throw new Error("X discovery target source is unsupported");
  return value;
}

function binding(value: unknown): XWebDiscoveryTargetBinding {
  const item = record(value);
  keys(item, ["accountId", "subject", "revision"]);
  const subject = bounded(item.subject, 19);
  if (!/^\d{1,19}$/u.test(subject)) throw new Error("X discovery target subject must be numeric");
  return Object.freeze({ accountId: bounded(item.accountId, 512), subject, revision: bounded(item.revision, 512) });
}

/**
 * Validate only the internal descriptor emitted by an owned provider parser.
 * This does not qualify a route or authorize an executable provider request.
 */
export function parseXWebDiscoveryTarget(value: unknown): XWebDiscoveryTarget {
  const item = record(value);
  keys(item, ["source", "kind", "value"]);
  if (item.kind !== "timeline" && item.kind !== "story") throw new Error("X discovery target kind is unsupported");
  return Object.freeze({ source: source(item.source), kind: item.kind, value: bounded(item.value, X_WEB_DISCOVERY_TARGET_BOUNDS.maxValueCharacters) });
}

export class XWebDiscoveryTargetUnavailableError extends Error {
  readonly code = "X_DISCOVERY_TARGET_UNAVAILABLE";
  constructor() {
    super("This X discovery target is unavailable. Refresh its source to select it again.");
    this.name = "XWebDiscoveryTargetUnavailableError";
  }
}

/**
 * One app-host's bounded, ephemeral target capability map. Public tokens contain
 * neither the provider target nor an encoded query. Account replacement, source
 * switching, expiry, eviction and host restart all require a fresh selection.
 * The caller must issue targets only from admitted provider projections; this
 * store supplies no provider transport and never turns a URL into a request.
 */
export class XWebDiscoveryTargetStore {
  private readonly targets = new Map<string, StoredTarget>();

  constructor(private readonly now: () => number = Date.now) {}

  private sweep(now: number): void {
    for (const [token, target] of this.targets) {
      if (target.expiresAt <= now) this.targets.delete(token);
    }
  }

  issue(account: XWebDiscoveryTargetBinding, target: XWebDiscoveryTarget): string {
    const boundAccount = binding(account);
    const boundTarget = parseXWebDiscoveryTarget(target);
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - X_WEB_DISCOVERY_TARGET_BOUNDS.ttlMs) {
      throw new Error("X discovery target clock is invalid");
    }
    this.sweep(now);
    // Every entry is derived read data. Eviction never discards action state.
    if (this.targets.size >= X_WEB_DISCOVERY_TARGET_BOUNDS.maxEntries) {
      this.targets.delete(this.targets.keys().next().value!);
    }
    let token = `xdt1_${randomUUID()}`;
    for (let attempt = 0; this.targets.has(token) && attempt < 2; attempt += 1) token = `xdt1_${randomUUID()}`;
    if (this.targets.has(token)) throw new Error("X discovery target could not issue a unique selection");
    this.targets.set(token, Object.freeze({ binding: boundAccount, target: boundTarget, expiresAt: now + X_WEB_DISCOVERY_TARGET_BOUNDS.ttlMs }));
    return token;
  }

  resolve(token: unknown, account: XWebDiscoveryTargetBinding, requestedSource: XWebDiscoveryTarget["source"]): XWebDiscoveryTarget {
    const boundAccount = binding(account);
    const boundSource = source(requestedSource);
    if (typeof token !== "string" || !/^xdt1_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(token)) {
      throw new XWebDiscoveryTargetUnavailableError();
    }
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) throw new Error("X discovery target clock is invalid");
    this.sweep(now);
    const stored = this.targets.get(token);
    if (stored === undefined || stored.binding.accountId !== boundAccount.accountId
      || stored.binding.subject !== boundAccount.subject || stored.binding.revision !== boundAccount.revision
      || stored.target.source !== boundSource) {
      throw new XWebDiscoveryTargetUnavailableError();
    }
    return stored.target;
  }

  /** Release provider-derived targets when the host disconnects an account. */
  revokeAccount(accountId: string): void {
    const id = bounded(accountId, 512);
    for (const [token, target] of this.targets) if (target.binding.accountId === id) this.targets.delete(token);
  }

  /** Host shutdown leaves no target authority available to a new host. */
  clear(): void { this.targets.clear(); }
}
