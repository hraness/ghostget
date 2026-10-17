import { join } from "node:path";
import { canonicalJson, isCanonicalJsonFileText, sha256 } from "./canonical-json";
import { createPrivateJsonIfAbsent, ensurePrivateStateDirectory, ghostgetStateHome, privateStateFilesMayExist, readPrivateStateFileIfPresent, writePrivateJsonIfUnchanged } from "./storage";
import { hasExactKeys } from "./contracts-shape.js";
import { OperationPermissionError, type PermissionEnvironment } from "./operation-permission-store";

/**
 * Standing owner grants for deleting a connected X account's own posts.
 * Each entry names one account and the exact x-web content.delete capability
 * digest the owner approved, so a changed account incarnation, manifest,
 * contract or code closure no longer matches. The record never enables
 * operation-permission management and grants nothing to any other operation.
 */
export type OwnerDeleteGrantEntry = Readonly<{ authId: string; digest: string }>;
export type OwnerDeleteGrants = Readonly<{ schemaVersion: 1; revision: number; entries: readonly OwnerDeleteGrantEntry[] }>;
export type OwnerDeleteGrantSnapshot = Readonly<{ revision: number; entries: readonly OwnerDeleteGrantEntry[]; contentSha256: string | null }>;

const COLLECTION = "owner-grants";
const FILE_NAME = "x-delete.json";
const MAX_BYTES = 16 * 1024;
const MAX_ENTRIES = 64;
const DIGEST = /^[a-f0-9]{64}$/u;
const AUTH_ID = /^[a-z][a-z0-9-]{0,47}$/u;

function invalid(): never {
  throw new OperationPermissionError("OPERATION_POLICY_INVALID", "The unattended deletion setting is invalid; turn it off and on again in GhostGet.");
}

function changed(): never {
  throw new OperationPermissionError("OPERATION_PERMISSION_CHANGED", "The unattended deletion setting changed; refresh GhostGet before editing it.");
}

export function parseOwnerDeleteGrants(value: unknown): OwnerDeleteGrants {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, ["entries", "revision", "schemaVersion"]) || record.schemaVersion !== 1
    || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1
    || !Array.isArray(record.entries) || record.entries.length > MAX_ENTRIES) return invalid();
  let previous = "";
  const entries = record.entries.map((candidate: unknown): OwnerDeleteGrantEntry => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return invalid();
    const entry = candidate as Record<string, unknown>;
    if (!hasExactKeys(entry, ["authId", "digest"]) || typeof entry.authId !== "string" || !AUTH_ID.test(entry.authId)
      || entry.authId <= previous || typeof entry.digest !== "string" || !DIGEST.test(entry.digest)) return invalid();
    previous = entry.authId;
    return Object.freeze({ authId: entry.authId, digest: entry.digest });
  });
  return Object.freeze({ schemaVersion: 1, revision: record.revision as number, entries: Object.freeze(entries) });
}

function paths(environment: PermissionEnvironment) {
  const directory = join(ghostgetStateHome(environment), COLLECTION);
  return { directory, file: join(directory, FILE_NAME) };
}

const EMPTY: OwnerDeleteGrantSnapshot = Object.freeze({ revision: 0, entries: Object.freeze([]), contentSha256: null });

/** Absent state is revision 0 with no grants. Any unreadable or noncanonical record fails closed. */
export function readOwnerDeleteGrants(environment: PermissionEnvironment = process.env): OwnerDeleteGrantSnapshot {
  try {
    if (!privateStateFilesMayExist(COLLECTION, [FILE_NAME], environment)) return EMPTY;
    const text = readPrivateStateFileIfPresent(paths(environment).file, MAX_BYTES, "unattended deletion setting", environment);
    if (text === null) return EMPTY;
    const grants = parseOwnerDeleteGrants(JSON.parse(text) as unknown);
    if (!isCanonicalJsonFileText(text, grants)) throw new Error("noncanonical grants");
    return Object.freeze({ revision: grants.revision, entries: grants.entries, contentSha256: sha256(text) });
  } catch {
    return invalid();
  }
}

/** True only for the exact account and capability digest the owner approved. */
export function ownerDeleteGranted(snapshot: OwnerDeleteGrantSnapshot, authId: string, digest: string): boolean {
  return snapshot.entries.some(entry => entry.authId === authId && entry.digest === digest);
}

/**
 * Compare-and-set one account's grant: a digest records it, null removes it.
 * The revision only increases, including after the last grant is removed.
 */
export function writeOwnerDeleteGrant(authId: string, digest: string | null, expectedRevision: number, environment: PermissionEnvironment = process.env): OwnerDeleteGrantSnapshot {
  if (!AUTH_ID.test(authId) || (digest !== null && !DIGEST.test(digest))) return invalid();
  const snapshot = readOwnerDeleteGrants(environment);
  if (!Number.isSafeInteger(expectedRevision) || snapshot.revision !== expectedRevision || snapshot.revision >= Number.MAX_SAFE_INTEGER) return changed();
  const entries = [...snapshot.entries.filter(entry => entry.authId !== authId), ...(digest === null ? [] : [{ authId, digest }])]
    .sort((a, b) => a.authId < b.authId ? -1 : a.authId > b.authId ? 1 : 0);
  const next = parseOwnerDeleteGrants({ schemaVersion: 1, revision: snapshot.revision + 1, entries });
  if (Buffer.byteLength(canonicalJson(next)) > MAX_BYTES - 1) return invalid();
  const selected = paths(environment);
  if (snapshot.contentSha256 === null) {
    ensurePrivateStateDirectory(selected.directory, environment);
    if (!createPrivateJsonIfAbsent(selected.file, next, { environment }).created) return changed();
  } else if (!writePrivateJsonIfUnchanged(selected.file, next, { expectedCurrentContentSha256: snapshot.contentSha256 })) {
    return changed();
  }
  return readOwnerDeleteGrants(environment);
}
