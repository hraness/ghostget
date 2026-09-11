import { join } from "node:path";
import { canonicalJson, sha256 } from "./canonical-json";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, privateStateFilesMayExist, readPrivateStateFileIfPresent, writePrivateJsonIfUnchanged } from "./storage";
import type { PermissionDecision } from "./control/protocol";

export type PermissionEnvironment = Readonly<Record<string, string | undefined>>;
export type OperationPolicyEntry = Readonly<{ digest: string; decision: PermissionDecision }>;
export type OperationPolicy = Readonly<{ schemaVersion: 1; revision: number; entries: readonly OperationPolicyEntry[] }>;
export type OperationPolicySnapshot = Readonly<{ managed: boolean; revision: number; entries: readonly OperationPolicyEntry[]; contentSha256: string | null }>;
const MAX_POLICY_BYTES = 512 * 1024;
const MAX_ENTRIES = 4096;
const DIGEST = /^[a-f0-9]{64}$/u;
const marker = Object.freeze({ schemaVersion: 1, managed: true });

export class OperationPermissionError extends Error {
  constructor(readonly code: "OPERATION_PERMISSION_DENIED" | "OPERATION_APPROVAL_REQUIRED" | "OPERATION_PERMISSION_CHANGED" | "OPERATION_POLICY_INVALID" | "OPERATION_APPROVAL_TOO_LARGE", message: string) {
    super(message);
    this.name = "OperationPermissionError";
  }
}

export function parseOperationPolicy(value: unknown): OperationPolicy {
  const fail = (): never => { throw new OperationPermissionError("OPERATION_POLICY_INVALID", "Operation permission policy is invalid; repair it in Ghostget before execution."); };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "entries,revision,schemaVersion" || record.schemaVersion !== 1
    || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1
    || !Array.isArray(record.entries) || record.entries.length > MAX_ENTRIES) return fail();
  let previous = "";
  const entries = record.entries.map((candidate: unknown): OperationPolicyEntry => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return fail();
    const entry = candidate as Record<string, unknown>;
    if (Object.keys(entry).sort().join(",") !== "decision,digest" || typeof entry.digest !== "string" || !DIGEST.test(entry.digest)
      || entry.digest <= previous || (entry.decision !== "allow" && entry.decision !== "deny" && entry.decision !== "ask")) return fail();
    previous = entry.digest;
    return Object.freeze({ digest: entry.digest, decision: entry.decision });
  });
  return Object.freeze({ schemaVersion: 1, revision: record.revision as number, entries: Object.freeze(entries) });
}

function paths(environment: PermissionEnvironment) {
  const directory = join(ghostgetStateHome(environment), "operation-permissions");
  return { directory, marker: join(directory, "managed.json"), policy: join(directory, "policy.json") };
}

export function readOperationPolicy(environment: PermissionEnvironment = process.env): OperationPolicySnapshot {
  try {
    if (!privateStateFilesMayExist("operation-permissions", ["managed.json", "policy.json"], environment)) {
      return Object.freeze({ managed: false, revision: 0, entries: Object.freeze([]), contentSha256: null });
    }
    const selected = paths(environment);
    const markerText = readPrivateStateFileIfPresent(selected.marker, 256, "operation policy marker", environment);
    if (markerText !== null && markerText !== `${canonicalJson(marker)}\n`) throw new Error("marker");
    const text = readPrivateStateFileIfPresent(selected.policy, MAX_POLICY_BYTES, "operation permission policy", environment);
    if (text === null) {
      if (markerText !== null) throw new Error("missing policy");
      return Object.freeze({ managed: false, revision: 0, entries: Object.freeze([]), contentSha256: null });
    }
    const policy = parseOperationPolicy(JSON.parse(text) as unknown);
    if (text !== `${canonicalJson(policy)}\n`) throw new Error("noncanonical policy");
    return Object.freeze({ managed: true, revision: policy.revision, entries: policy.entries, contentSha256: sha256(text) });
  } catch {
    throw new OperationPermissionError("OPERATION_POLICY_INVALID", "Operation permission state is missing or invalid; execution is blocked until it is repaired.");
  }
}

export function enableOperationPermissions(expectedRevision: number, environment: PermissionEnvironment = process.env): OperationPolicySnapshot {
  const snapshot = readOperationPolicy(environment);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== snapshot.revision) throw new OperationPermissionError("OPERATION_PERMISSION_CHANGED", "Operation policy changed; refresh Ghostget before editing it.");
  if (snapshot.managed) return snapshot;
  const selected = paths(environment);
  ensurePrivateStateDirectory(selected.directory, environment);
  // Publishing the marker first deliberately makes interrupted opt-in fail closed.
  const created = createPrivateJsonIfAbsent(selected.marker, marker, { environment });
  if (!created.created) throw new OperationPermissionError("OPERATION_PERMISSION_CHANGED", "Another control session enabled operation permissions.");
  if (!createPrivateJsonIfAbsent(selected.policy, { schemaVersion: 1, revision: 1, entries: [] }, { environment }).created) {
    throw new OperationPermissionError("OPERATION_PERMISSION_CHANGED", "Operation policy appeared concurrently; refresh Ghostget.");
  }
  return readOperationPolicy(environment);
}

export function setOperationPolicyEntry(digest: string, decision: PermissionDecision, expectedRevision: number, environment: PermissionEnvironment = process.env): OperationPolicySnapshot {
  if (!DIGEST.test(digest) || !["allow", "deny", "ask"].includes(decision)) throw new OperationPermissionError("OPERATION_POLICY_INVALID", "Operation permission update is invalid.");
  const snapshot = readOperationPolicy(environment);
  if (!snapshot.managed || snapshot.contentSha256 === null || !Number.isSafeInteger(expectedRevision) || snapshot.revision !== expectedRevision
    || snapshot.revision >= Number.MAX_SAFE_INTEGER) throw new OperationPermissionError("OPERATION_PERMISSION_CHANGED", "Enable operation permissions or refresh the policy before editing it.");
  const entries = [...snapshot.entries.filter(entry => entry.digest !== digest), { digest, decision }].sort((a, b) => a.digest.localeCompare(b.digest));
  const policy = parseOperationPolicy({ schemaVersion: 1, revision: snapshot.revision + 1, entries });
  if (Buffer.byteLength(canonicalJson(policy)) > MAX_POLICY_BYTES - 1) throw new OperationPermissionError("OPERATION_POLICY_INVALID", "Operation policy exceeds its size limit.");
  if (!writePrivateJsonIfUnchanged(paths(environment).policy, policy, { expectedCurrentContentSha256: snapshot.contentSha256 })) throw new OperationPermissionError("OPERATION_PERMISSION_CHANGED", "Operation policy changed; refresh Ghostget before editing it.");
  return readOperationPolicy(environment);
}
