// @bun
import {
  MAX_WRENCH_JSON_BYTES,
  createPrivateJsonIfAbsent,
  currentProcessStartIdentity,
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  listPrivateStateDirectory,
  processOwnerStatus,
  readPrivateStateFileIfPresent,
  readPrivateStateFilesBatched,
  readRegularFile,
  removePrivateStateDirectoryTree,
  removePrivateStateFile,
  removePrivateStateFileIfUnchanged,
  snapshotPrivateStateDirectory,
  writePrivateJsonIfUnchanged
} from "./index-y5035239.js";
import"./index-gnc5dy8n.js";
import"./index-vwcgtdx2.js";
import {
  hasExactKeys
} from "./index-5m1wfgkw.js";
import {
  isPortableProviderPluginVersion,
  isProviderPluginId,
  isProviderPluginSurfaceId
} from "./index-26yq8q16.js";
import {
  canonicalJson,
  isCanonicalJsonFileText
} from "./index-pqsan2cn.js";
import"./index-z1w83f81.js";

// src/auth.ts
import { createHash as createHash6 } from "crypto";
import {
  existsSync,
  lstatSync as lstatSync2,
  realpathSync
} from "fs";
import {
  basename,
  dirname,
  isAbsolute,
  join as join6,
  resolve
} from "path";
import { cookieSources } from "@hraness/wordcell/clip/args";

// src/linked-device-lifecycle-admission.ts
import { createHash as createHash2 } from "crypto";
import { join as join2 } from "path";

// src/linked-device-lifecycle-journal.ts
import { createHash, randomUUID } from "crypto";
import { join } from "path";
var LINKED_DEVICE_LIFECYCLE_JOURNAL_SCHEMA_VERSION = 1;
var LINKED_DEVICE_LIFECYCLE_JOURNAL_STATE_DIRECTORY = "run-journals/linked-device-lifecycle";
var MAX_JOURNAL_BYTES = 32 * 1024;
var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
var sha256Pattern = /^[a-f0-9]{64}$/u;
var authIdPattern = /^[a-z][a-z0-9-]{0,47}$/u;
function dataRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} has an unsupported prototype`);
  }
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new Error(`${label} has unsupported symbol fields`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} has unsupported accessor fields`);
    }
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return result;
}
function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unsupported fields`);
  }
}
function canonicalTimestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be one canonical UTC timestamp`);
  }
  return value;
}
function nullableTimestamp(value, label) {
  return value === null ? null : canonicalTimestamp(value, label);
}
function digest(value, label) {
  if (typeof value !== "string" || !sha256Pattern.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}
function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}
function strictPluginVersion(value) {
  if (!isPortableProviderPluginVersion(value)) {
    throw new Error("linked-device lifecycle plugin version is malformed");
  }
  return value;
}
function journalId(value) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new Error("linked-device lifecycle journal ID is malformed");
  }
  return value;
}
function parseOwner(value) {
  const record = dataRecord(value, "linked-device lifecycle journal owner");
  exactKeys(record, ["pid", "token", "bootId", "processStartId", "leaseUntil"], "linked-device lifecycle journal owner");
  if (typeof record.pid !== "number" || !Number.isSafeInteger(record.pid) || record.pid < 1 || record.pid > 2147483647 || typeof record.token !== "string" || !uuidPattern.test(record.token)) {
    throw new Error("linked-device lifecycle journal owner is malformed");
  }
  return Object.freeze({
    pid: record.pid,
    token: record.token,
    bootId: digest(record.bootId, "linked-device lifecycle journal owner boot identity"),
    processStartId: digest(record.processStartId, "linked-device lifecycle journal owner process identity"),
    leaseUntil: canonicalTimestamp(record.leaseUntil, "linked-device lifecycle journal owner lease")
  });
}
function parseLinkedDeviceLifecycleOwner(value) {
  return parseOwner(value);
}
function parseResult(value) {
  const record = dataRecord(value, "linked-device lifecycle result");
  if (record.kind === "pair") {
    exactKeys(record, ["kind", "resultingAuthContentHash"], "linked-device pair result");
    return Object.freeze({
      kind: "pair",
      resultingAuthContentHash: digest(record.resultingAuthContentHash, "linked-device pair resulting auth content hash")
    });
  }
  if (record.kind === "sync") {
    exactKeys(record, ["kind", "itemsStored", "projection", "emitsProtocolAcknowledgements"], "linked-device sync result");
    if (typeof record.itemsStored !== "number" || !Number.isSafeInteger(record.itemsStored) || record.itemsStored < 0 || record.itemsStored > 1e9 || record.projection !== "linked-device-local-store" || record.emitsProtocolAcknowledgements !== true) {
      throw new Error("linked-device sync result is malformed");
    }
    return Object.freeze({
      kind: "sync",
      itemsStored: record.itemsStored,
      projection: record.projection,
      emitsProtocolAcknowledgements: record.emitsProtocolAcknowledgements
    });
  }
  throw new Error("linked-device lifecycle result kind is unsupported");
}
function nullableResult(value) {
  return value === null ? null : parseResult(value);
}
function resultMatchesJournalKind(result, kind) {
  return result.kind === "pair" && kind === "pair" || result.kind === "sync" && kind === "sync-once";
}
function reasonCode(value) {
  if (value === null)
    return null;
  if (value === "prepared" || value === "external-outcome-pending" || value === "external-returned-commit-pending" || value === "preflight-failed" || value === "cancelled-before-begin" || value === "owner-exited-before-begin" || value === "runtime-error-after-begin" || value === "cancelled-after-begin" || value === "deadline-after-begin" || value === "external-returned-before-completion-persisted" || value === "owner-exited-after-begin" || value === "reconciled-not-applied") {
    return value;
  }
  throw new Error("linked-device lifecycle reason code is unsupported");
}
function assertTimestampOrder(earlier, later, label) {
  if (Date.parse(later) < Date.parse(earlier)) {
    throw new Error(`${label} moved backward`);
  }
}
function assertJournalInvariants(journal) {
  assertTimestampOrder(journal.startedAt, journal.updatedAt, "linked-device lifecycle journal update");
  assertTimestampOrder(journal.startedAt, journal.owner.leaseUntil, "linked-device lifecycle journal owner lease");
  if (journal.kind === "sync-once" && (journal.phoneProvided || journal.initialSubjectState !== "bound")) {
    throw new Error("linked-device sync lifecycle requires bound auth and forbids phone input");
  }
  if (journal.result !== null && !resultMatchesJournalKind(journal.result, journal.kind)) {
    throw new Error("linked-device lifecycle result kind contradicts its journal");
  }
  if (journal.externalStartedAt !== null) {
    assertTimestampOrder(journal.startedAt, journal.externalStartedAt, "linked-device lifecycle external start");
    assertTimestampOrder(journal.externalStartedAt, journal.updatedAt, "linked-device lifecycle post-external update");
  }
  if (journal.externalCompletedAt !== null) {
    if (journal.externalStartedAt === null) {
      throw new Error("linked-device lifecycle completion has no external start");
    }
    assertTimestampOrder(journal.externalStartedAt, journal.externalCompletedAt, "linked-device lifecycle external completion");
    assertTimestampOrder(journal.externalCompletedAt, journal.updatedAt, "linked-device lifecycle post-completion update");
  }
  if (journal.finishedAt !== null) {
    assertTimestampOrder(journal.startedAt, journal.finishedAt, "linked-device lifecycle finish");
    assertTimestampOrder(journal.finishedAt, journal.updatedAt, "linked-device lifecycle post-finish update");
    if (journal.externalStartedAt !== null) {
      assertTimestampOrder(journal.externalStartedAt, journal.finishedAt, "linked-device lifecycle external-to-finish order");
    }
    if (journal.externalCompletedAt !== null) {
      assertTimestampOrder(journal.externalCompletedAt, journal.finishedAt, "linked-device lifecycle completion-to-finish order");
    }
  }
  if (journal.reconciledAt !== null) {
    if (journal.finishedAt === null) {
      throw new Error("linked-device lifecycle reconciliation has no finish");
    }
    assertTimestampOrder(journal.finishedAt, journal.reconciledAt, "linked-device lifecycle reconciliation");
    assertTimestampOrder(journal.reconciledAt, journal.updatedAt, "linked-device lifecycle post-reconciliation update");
  }
  if (journal.phase === "prepared") {
    if (journal.status !== "pending" || journal.reconciliation !== "not-required" || journal.reconciliationHash !== null || journal.externalStartedAt !== null || journal.externalCompletedAt !== null || journal.finishedAt !== null || journal.reconciledAt !== null || journal.result !== null || journal.reasonCode !== "prepared")
      throw new Error("prepared linked-device lifecycle journal is contradictory");
    return;
  }
  if (journal.phase === "external-begun") {
    if (journal.revision < 1 || journal.status !== "pending" || journal.reconciliation !== "not-required" || journal.reconciliationHash !== null || journal.externalStartedAt === null || journal.externalCompletedAt !== null || journal.finishedAt !== null || journal.reconciledAt !== null || journal.result !== null || journal.reasonCode !== "external-outcome-pending")
      throw new Error("begun linked-device lifecycle journal is contradictory");
    return;
  }
  if (journal.phase === "external-completed") {
    if (journal.revision < 2 || journal.status !== "pending" || journal.reconciliation !== "not-required" || journal.reconciliationHash !== null || journal.externalStartedAt === null || journal.externalCompletedAt === null || journal.finishedAt !== null || journal.reconciledAt !== null || journal.result === null || journal.reasonCode !== "external-returned-commit-pending")
      throw new Error("completed linked-device lifecycle journal is contradictory");
    return;
  }
  if (journal.status === "pending" || journal.finishedAt === null) {
    throw new Error("terminal linked-device lifecycle journal is contradictory");
  }
  if (journal.status === "indeterminate") {
    const returnedWithoutDurableBegin = journal.revision === 1 && journal.reasonCode === "external-returned-before-completion-persisted" && journal.externalCompletedAt === null && journal.result === null;
    if (journal.revision < 2 && !returnedWithoutDurableBegin || journal.externalStartedAt === null || journal.reconciliation !== "required" || journal.reconciliationHash !== null || journal.reconciledAt !== null || journal.reasonCode !== "runtime-error-after-begin" && journal.reasonCode !== "cancelled-after-begin" && journal.reasonCode !== "deadline-after-begin" && journal.reasonCode !== "external-returned-before-completion-persisted" && journal.reasonCode !== "owner-exited-after-begin" || journal.externalCompletedAt === null !== (journal.result === null)) {
      throw new Error("indeterminate linked-device lifecycle journal is contradictory");
    }
    return;
  }
  if (journal.status === "succeeded") {
    if (journal.revision < 3 || journal.externalStartedAt === null || journal.result === null || journal.reasonCode !== null || (journal.reconciliation === "not-required" ? journal.reconciliationHash !== null || journal.reconciledAt !== null || journal.externalCompletedAt === null : journal.reconciliation !== "resolved-applied" || journal.reconciliationHash === null || journal.reconciledAt === null)) {
      throw new Error("successful linked-device lifecycle journal is contradictory");
    }
    return;
  }
  if (journal.status !== "safe-retry" || journal.result !== null || (journal.reconciliation === "not-required" ? journal.revision < 1 || journal.reconciliationHash !== null || journal.reconciledAt !== null || journal.externalStartedAt !== null || journal.externalCompletedAt !== null || journal.reasonCode !== "preflight-failed" && journal.reasonCode !== "cancelled-before-begin" && journal.reasonCode !== "owner-exited-before-begin" : journal.reconciliation !== "resolved-not-applied" || journal.revision < 3 || journal.reconciliationHash === null || journal.reconciledAt === null || journal.externalStartedAt === null || journal.externalCompletedAt !== null || journal.reasonCode !== "reconciled-not-applied")) {
    throw new Error("retryable linked-device lifecycle journal is contradictory");
  }
}
function parseLinkedDeviceLifecycleJournal(value) {
  const record = dataRecord(value, "linked-device lifecycle journal");
  exactKeys(record, [
    "schemaVersion",
    "revision",
    "journalId",
    "kind",
    "pluginId",
    "pluginVersion",
    "pluginImplementationHash",
    "lifecycleContractVersion",
    "surfaceId",
    "authId",
    "authRealmHash",
    "authContentHash",
    "initialSubjectState",
    "phoneProvided",
    "phase",
    "status",
    "reconciliation",
    "reconciliationHash",
    "owner",
    "startedAt",
    "updatedAt",
    "externalStartedAt",
    "externalCompletedAt",
    "finishedAt",
    "reconciledAt",
    "result",
    "reasonCode"
  ], "linked-device lifecycle journal");
  if (record.schemaVersion !== LINKED_DEVICE_LIFECYCLE_JOURNAL_SCHEMA_VERSION || typeof record.revision !== "number" || !Number.isSafeInteger(record.revision) || record.revision < 0 || record.revision >= Number.MAX_SAFE_INTEGER || record.kind !== "pair" && record.kind !== "sync-once" || !isProviderPluginId(record.pluginId) || record.lifecycleContractVersion !== 1 || !isProviderPluginSurfaceId(record.surfaceId) || typeof record.authId !== "string" || !authIdPattern.test(record.authId) || record.initialSubjectState !== "bound" && record.initialSubjectState !== "unbound" || typeof record.phoneProvided !== "boolean" || record.phase !== "prepared" && record.phase !== "external-begun" && record.phase !== "external-completed" && record.phase !== "terminal" || record.status !== "pending" && record.status !== "succeeded" && record.status !== "safe-retry" && record.status !== "indeterminate" || record.reconciliation !== "not-required" && record.reconciliation !== "required" && record.reconciliation !== "resolved-applied" && record.reconciliation !== "resolved-not-applied") {
    throw new Error("linked-device lifecycle journal is malformed");
  }
  const journal = {
    schemaVersion: LINKED_DEVICE_LIFECYCLE_JOURNAL_SCHEMA_VERSION,
    revision: record.revision,
    journalId: journalId(record.journalId),
    kind: record.kind,
    pluginId: record.pluginId,
    pluginVersion: strictPluginVersion(record.pluginVersion),
    pluginImplementationHash: digest(record.pluginImplementationHash, "linked-device lifecycle plugin implementation hash"),
    lifecycleContractVersion: 1,
    surfaceId: record.surfaceId,
    authId: record.authId,
    authRealmHash: digest(record.authRealmHash, "linked-device lifecycle auth realm hash"),
    authContentHash: digest(record.authContentHash, "linked-device lifecycle auth content hash"),
    initialSubjectState: record.initialSubjectState,
    phoneProvided: record.phoneProvided,
    phase: record.phase,
    status: record.status,
    reconciliation: record.reconciliation,
    reconciliationHash: nullableDigest(record.reconciliationHash, "linked-device lifecycle reconciliation hash"),
    owner: parseOwner(record.owner),
    startedAt: canonicalTimestamp(record.startedAt, "linked-device lifecycle start"),
    updatedAt: canonicalTimestamp(record.updatedAt, "linked-device lifecycle update"),
    externalStartedAt: nullableTimestamp(record.externalStartedAt, "linked-device lifecycle external start"),
    externalCompletedAt: nullableTimestamp(record.externalCompletedAt, "linked-device lifecycle external completion"),
    finishedAt: nullableTimestamp(record.finishedAt, "linked-device lifecycle finish"),
    reconciledAt: nullableTimestamp(record.reconciledAt, "linked-device lifecycle reconciliation"),
    result: nullableResult(record.result),
    reasonCode: reasonCode(record.reasonCode)
  };
  assertJournalInvariants(journal);
  if (Buffer.byteLength(canonicalJson(journal), "utf8") > MAX_JOURNAL_BYTES) {
    throw new Error("linked-device lifecycle journal exceeds its byte bound");
  }
  return Object.freeze({
    ...journal,
    owner: Object.freeze({ ...journal.owner }),
    ...journal.result === null ? { result: null } : { result: Object.freeze({ ...journal.result }) }
  });
}
function createLinkedDeviceLifecycleOwner(leaseUntilValue) {
  const identity = currentProcessStartIdentity();
  return parseOwner({
    pid: process.pid,
    token: randomUUID(),
    bootId: identity.bootId,
    processStartId: identity.processStartId,
    leaseUntil: leaseUntilValue
  });
}
function journalDirectory(environment) {
  return join(ghostgetStateHome(environment), ...LINKED_DEVICE_LIFECYCLE_JOURNAL_STATE_DIRECTORY.split("/"));
}
function parseSnapshotText(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("linked-device lifecycle journal is malformed");
  }
  const parsed = parseLinkedDeviceLifecycleJournal(value);
  if (!isCanonicalJsonFileText(text, parsed)) {
    throw new Error("linked-device lifecycle journal is not canonical JSON");
  }
  return Object.freeze({
    journal: parsed,
    contentSha256: createHash("sha256").update(text).digest("hex")
  });
}
function listLinkedDeviceLifecycleJournalSnapshots(environment = process.env) {
  const directory = journalDirectory(environment);
  const identity = ensurePrivateStateDirectory(directory, environment);
  const directorySnapshot = snapshotPrivateStateDirectory(directory, environment, identity);
  if (directorySnapshot.identity === null)
    return Object.freeze([]);
  const expectedNamePattern = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/u;
  const fileNames = directorySnapshot.entries.filter((entry) => entry.kind === "file" && expectedNamePattern.test(entry.name)).map((entry) => entry.name);
  const fileByName = new Map(readPrivateStateFilesBatched(directory, fileNames, {
    maximumBytesPerFile: MAX_JOURNAL_BYTES,
    environment,
    expectedDirectoryIdentity: directorySnapshot.identity
  }).map((file) => [file.name, file]));
  return Object.freeze(directorySnapshot.entries.map((entry) => {
    const match = expectedNamePattern.exec(entry.name);
    if (match === null || match[1] === undefined) {
      return {
        journalId: `invalid-${createHash("sha256").update("linked-device-lifecycle-invalid-entry\x00", "utf8").update(entry.name, "utf8").digest("hex")}`,
        invalid: true
      };
    }
    const id = match[1];
    if (entry.kind !== "file") {
      return { journalId: id, invalid: true };
    }
    const file = fileByName.get(entry.name);
    if (file === undefined || file.status !== "present") {
      return { journalId: id, invalid: true };
    }
    try {
      const parsed = parseSnapshotText(file.content);
      return parsed.journal.journalId === id ? parsed : { journalId: id, invalid: true };
    } catch {
      return { journalId: id, invalid: true };
    }
  }));
}

// src/linked-device-lifecycle-admission.ts
var ADMISSION_SCHEMA_VERSION = 1;
var MAX_ADMISSION_BYTES = 4 * 1024;
var MAX_ACQUISITION_ATTEMPTS = 8;
var OWNER_LEASE_MILLISECONDS = 30 * 60000;
var authIdPattern2 = /^[a-z][a-z0-9-]{0,47}$/u;
var realmKeyPattern = /^[a-f0-9]{64}$/u;
var claimNamePattern = /^([a-f0-9]{64})\.json$/u;
var LINKED_DEVICE_LIFECYCLE_ADMISSION_STATE_DIRECTORY = "run-journals/linked-device-lifecycle-admissions";
function strictRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} has an unsupported prototype`);
  }
  const record = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      throw new Error(`${label} has unsupported symbol fields`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} has unsupported accessor fields`);
    }
    Object.defineProperty(record, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return record;
}
function exactKeys2(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    throw new Error(`${label} has unsupported fields`);
}
function authId(value) {
  if (typeof value !== "string" || !authIdPattern2.test(value)) {
    throw new Error("linked-device lifecycle admission auth ID is malformed");
  }
  return value;
}
function realmKey(value) {
  if (typeof value !== "string" || !realmKeyPattern.test(value)) {
    throw new Error("linked-device lifecycle admission realm key is malformed");
  }
  return value;
}
function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error("linked-device lifecycle admission time is not canonical UTC");
  }
  return value;
}
function parseClaim(value) {
  const record = strictRecord(value, "linked-device lifecycle admission");
  exactKeys2(record, ["schemaVersion", "realmKey", "authId", "acquiredAt", "owner"], "linked-device lifecycle admission");
  if (record.schemaVersion !== ADMISSION_SCHEMA_VERSION) {
    throw new Error("linked-device lifecycle admission version is invalid");
  }
  const acquiredAt = timestamp(record.acquiredAt);
  const owner = parseLinkedDeviceLifecycleOwner(record.owner);
  if (Date.parse(owner.leaseUntil) < Date.parse(acquiredAt)) {
    throw new Error("linked-device lifecycle admission lease is invalid");
  }
  return Object.freeze({
    schemaVersion: ADMISSION_SCHEMA_VERSION,
    realmKey: realmKey(record.realmKey),
    authId: authId(record.authId),
    acquiredAt,
    owner
  });
}
function directory(environment) {
  return join2(ghostgetStateHome(environment), ...LINKED_DEVICE_LIFECYCLE_ADMISSION_STATE_DIRECTORY.split("/"));
}
function pathFor(realmKeyValue, environment) {
  return join2(directory(environment), `${realmKey(realmKeyValue)}.json`);
}
function claimSnapshot(claim) {
  const content = `${canonicalJson(claim)}
`;
  return Object.freeze({
    claim,
    contentSha256: createHash2("sha256").update(content, "utf8").digest("hex")
  });
}
function readLinkedDeviceLifecycleAdmissionClaim(realmKeyValue, environment) {
  const content = readPrivateStateFileIfPresent(pathFor(realmKeyValue, environment), MAX_ADMISSION_BYTES, "linked-device lifecycle admission", environment);
  if (content === null)
    return null;
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("linked-device lifecycle admission is malformed JSON");
  }
  const claim = parseClaim(value);
  if (claim.realmKey !== realmKeyValue) {
    throw new Error("linked-device lifecycle admission does not match its filename");
  }
  if (!isCanonicalJsonFileText(content, claim)) {
    throw new Error("linked-device lifecycle admission is not canonical JSON");
  }
  return Object.freeze({
    claim,
    contentSha256: createHash2("sha256").update(content, "utf8").digest("hex")
  });
}
function assertLinkedDeviceLifecycleAdmissionHeld(admission, environment = process.env) {
  const existing = readLinkedDeviceLifecycleAdmissionClaim(admission.realmKey, environment);
  if (existing === null || existing.claim.authId !== admission.authId || existing.claim.acquiredAt !== admission.acquiredAt || existing.claim.owner.pid !== admission.owner.pid || existing.claim.owner.token !== admission.owner.token || existing.claim.owner.bootId !== admission.owner.bootId || existing.claim.owner.processStartId !== admission.owner.processStartId || existing.claim.owner.leaseUntil !== admission.owner.leaseUntil || processOwnerStatus(existing.claim.owner) !== "exact-live-owner") {
    throw new Error("linked-device lifecycle admission authority is not exact and live");
  }
}
function safeCoordinate(value) {
  return `admission-${createHash2("sha256").update("linked-device-lifecycle-admission-coordinate\x00", "utf8").update(value, "utf8").digest("hex")}`;
}
function issue(authIdValue, coordinate, kind) {
  return Object.freeze({
    authId: authIdValue,
    coordinate,
    kind
  });
}
function recoverLinkedDeviceLifecycleAdmissions(environment = process.env) {
  const claimDirectory = directory(environment);
  ensurePrivateStateDirectory(claimDirectory, environment);
  const entries = listPrivateStateDirectory(claimDirectory, environment);
  const issues = [];
  let live = 0;
  let repaired = 0;
  let invalid = 0;
  for (const entry of entries) {
    const match = claimNamePattern.exec(entry.name);
    const coordinate = safeCoordinate(entry.name);
    if (match === null || match[1] === undefined || entry.kind !== "file") {
      invalid += 1;
      issues.push(issue(null, coordinate, "invalid-admission"));
      continue;
    }
    const key = match[1];
    let snapshot;
    try {
      snapshot = readLinkedDeviceLifecycleAdmissionClaim(key, environment);
    } catch {
      invalid += 1;
      issues.push(issue(null, coordinate, "invalid-admission"));
      continue;
    }
    if (snapshot === null)
      continue;
    const ownerStatus = processOwnerStatus(snapshot.claim.owner);
    if (ownerStatus === "exact-live-owner") {
      live += 1;
      continue;
    }
    if (ownerStatus === "unknown") {
      issues.push(issue(snapshot.claim.authId, coordinate, "owner-unknown"));
      continue;
    }
    try {
      const removed = removePrivateStateFileIfUnchanged(pathFor(key, environment), { expectedCurrentContentSha256: snapshot.contentSha256 }, environment);
      if (removed) {
        repaired += 1;
        continue;
      }
      issues.push(issue(snapshot.claim.authId, coordinate, "recovery-conflict"));
    } catch {
      issues.push(issue(snapshot.claim.authId, coordinate, "recovery-conflict"));
    }
  }
  return Object.freeze({
    scanned: entries.length,
    live,
    repaired,
    invalid,
    issues: Object.freeze(issues)
  });
}
function acquireLinkedDeviceLifecycleAdmission(realmKeyValue, authIdValue, acquiredAtValue, environment = process.env) {
  const key = realmKey(realmKeyValue);
  const id = authId(authIdValue);
  const acquiredAt = timestamp(acquiredAtValue);
  ensurePrivateStateDirectory(directory(environment), environment);
  for (let attempt = 0;attempt < MAX_ACQUISITION_ATTEMPTS; attempt += 1) {
    const owner = createLinkedDeviceLifecycleOwner(new Date(Date.parse(acquiredAt) + OWNER_LEASE_MILLISECONDS).toISOString());
    const snapshot = claimSnapshot(parseClaim({
      schemaVersion: ADMISSION_SCHEMA_VERSION,
      realmKey: key,
      authId: id,
      acquiredAt,
      owner
    }));
    const created = createPrivateJsonIfAbsent(pathFor(key, environment), snapshot.claim, { environment, privateParent: true });
    if (created.created) {
      let released = false;
      return Object.freeze({
        realmKey: key,
        authId: id,
        acquiredAt,
        owner,
        release: () => {
          if (released)
            return;
          const removed = removePrivateStateFileIfUnchanged(pathFor(key, environment), { expectedCurrentContentSha256: snapshot.contentSha256 }, environment);
          if (!removed) {
            throw new Error("linked-device lifecycle admission changed before release");
          }
          released = true;
        }
      });
    }
    const existing = readLinkedDeviceLifecycleAdmissionClaim(key, environment);
    if (existing === null)
      continue;
    const ownerStatus = processOwnerStatus(existing.claim.owner);
    if (ownerStatus === "exact-live-owner") {
      throw new Error(`linked-device realm already has an active linked-device lifecycle through auth locator ${existing.claim.authId}`);
    }
    if (ownerStatus === "unknown") {
      throw new Error(`linked-device realm lifecycle owner for auth locator ${existing.claim.authId} cannot be inspected safely`);
    }
    removePrivateStateFileIfUnchanged(pathFor(key, environment), { expectedCurrentContentSha256: existing.contentSha256 }, environment);
  }
  throw new Error(`auth locator ${id} linked-device realm admission could not be acquired`);
}
var linkedDeviceLifecycleAdmissionStore = Object.freeze({
  recover: recoverLinkedDeviceLifecycleAdmissions,
  acquire: acquireLinkedDeviceLifecycleAdmission
});

// src/session-secrets.ts
import {
  createHash as createHash4,
  createCipheriv,
  createDecipheriv,
  randomBytes as randomBytes2
} from "crypto";
import { join as join4 } from "path";

// src/read-projection-admission.ts
import { createHash as createHash3, randomBytes, randomUUID as randomUUID2 } from "crypto";
import { join as join3 } from "path";
import { performance } from "perf_hooks";
var CONTROL_DIRECTORY = "read-projection-control";
var ADMISSION_DIRECTORY = "admissions";
var INCARNATION_DIRECTORY = "incarnations";
var MAX_CONTROL_RECORD_BYTES = 4 * 1024;
var MAX_ACQUISITION_ATTEMPTS2 = 16;
var READ_PROJECTION_SHORT_SETTLEMENT_WAIT_MS = 1e4;
var SETTLEMENT_WAIT_SLICE_MS = 10;
var settlementWaitState = new Int32Array(new SharedArrayBuffer(4));
var authIdPattern3 = /^[a-z][a-z0-9-]{0,47}$/u;
var digestPattern = /^[a-f0-9]{64}$/u;
var uuidPattern2 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

class ReadProjectionAdmissionContentionError extends Error {
  authId;
  owner;
  reason;
  constructor(authIdValue, ownerValue, reason, options = {}) {
    const detail = reason === "settlement-exhausted" ? "read projection transition did not settle within its bounded wait" : reason === "same-process-owner" ? "already has an active same-process read projection transition" : "already has an active read projection transition";
    super(`auth locator ${authIdValue} ${detail}`, options);
    this.name = "ReadProjectionAdmissionContentionError";
    this.authId = authIdValue;
    this.owner = ownerValue;
    this.reason = reason;
  }
}
var heldAdmissions = new Map;
function errorValue(value, fallback) {
  return value instanceof Error ? value : new Error(fallback, { cause: value });
}
function isThenable(value) {
  if (value === null || typeof value !== "object" && typeof value !== "function")
    return false;
  const visited = new Set;
  let current = value;
  while (current !== null) {
    if (visited.has(current))
      return true;
    visited.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, "then");
    if (descriptor !== undefined) {
      return !("value" in descriptor) || typeof descriptor.value === "function";
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}
function synchronousOperationResult(operation) {
  const value = operation();
  if (isThenable(value)) {
    throw new Error("read projection admission operations must be synchronous and must not return thenables");
  }
  return value;
}
function hash(value) {
  return createHash3("sha256").update(value, "utf8").digest("hex");
}
function strictRecord2(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} has an unsupported prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) {
    throw new Error(`${label} has unsupported symbol fields`);
  }
  const result = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} has unsupported accessor fields`);
    }
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return result;
}
function exactKeys3(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    throw new Error(`${label} has unsupported fields`);
}
function authId2(value) {
  if (typeof value !== "string" || !authIdPattern3.test(value)) {
    throw new Error("read projection auth ID must be lowercase kebab-case");
  }
  return value;
}
function digest2(value, label) {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function owner(value) {
  const record = strictRecord2(value, "read projection admission owner");
  exactKeys3(record, ["pid", "token", "bootId", "processStartId"], "read projection admission owner");
  if (typeof record.pid !== "number" || !Number.isSafeInteger(record.pid) || record.pid < 1 || record.pid > 2147483647 || typeof record.token !== "string" || !uuidPattern2.test(record.token))
    throw new Error("read projection admission owner is malformed");
  return Object.freeze({
    pid: record.pid,
    token: record.token,
    bootId: digest2(record.bootId, "read projection admission boot identity"),
    processStartId: digest2(record.processStartId, "read projection admission process identity")
  });
}
function admissionClaim(value) {
  const record = strictRecord2(value, "read projection admission");
  exactKeys3(record, ["schemaVersion", "authId", "owner"], "read projection admission");
  if (record.schemaVersion !== 1) {
    throw new Error("read projection admission version is unsupported");
  }
  return Object.freeze({
    schemaVersion: 1,
    authId: authId2(record.authId),
    owner: owner(record.owner)
  });
}
function incarnationRecord(value) {
  const record = strictRecord2(value, "read projection auth incarnation");
  exactKeys3(record, ["schemaVersion", "authId", "incarnation"], "read projection auth incarnation");
  if (record.schemaVersion !== 1) {
    throw new Error("read projection auth incarnation version is unsupported");
  }
  return Object.freeze({
    schemaVersion: 1,
    authId: authId2(record.authId),
    incarnation: digest2(record.incarnation, "read projection auth incarnation")
  });
}
function controlDirectory(environment) {
  return join3(ghostgetStateHome(environment), CONTROL_DIRECTORY);
}
function admissionsDirectory(environment) {
  return join3(controlDirectory(environment), ADMISSION_DIRECTORY);
}
function incarnationsDirectory(environment) {
  return join3(controlDirectory(environment), INCARNATION_DIRECTORY);
}
function authCoordinate(id) {
  return hash(`wrench-read-projection-auth-coordinate-v1\x00${id}`);
}
function admissionPath(id, environment) {
  return join3(admissionsDirectory(environment), `${authCoordinate(id)}.json`);
}
function incarnationPath(id, environment) {
  return join3(incarnationsDirectory(environment), `${authCoordinate(id)}.json`);
}
function canonicalSnapshot(value) {
  const content = `${canonicalJson(value)}
`;
  return Object.freeze({ value, contentSha256: hash(content) });
}
function parseCanonicalSnapshot(content, label, parse) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`${label} is malformed JSON`);
  }
  const value = parse(parsed);
  if (!isCanonicalJsonFileText(content, value)) {
    throw new Error(`${label} is not canonical JSON`);
  }
  return Object.freeze({ value, contentSha256: hash(content) });
}
function readAdmissionClaim(id, environment) {
  const content = readPrivateStateFileIfPresent(admissionPath(id, environment), MAX_CONTROL_RECORD_BYTES, "read projection admission", environment);
  if (content === null)
    return null;
  const snapshot = parseCanonicalSnapshot(content, "read projection admission", admissionClaim);
  if (snapshot.value.authId !== id) {
    throw new Error("read projection admission does not match its coordinate");
  }
  return snapshot;
}
function readRawIncarnation(id, environment) {
  const content = readPrivateStateFileIfPresent(incarnationPath(id, environment), MAX_CONTROL_RECORD_BYTES, "read projection auth incarnation", environment);
  if (content === null)
    return null;
  return Object.freeze({ content, contentSha256: hash(content) });
}
function newOwner() {
  const identity = currentProcessStartIdentity();
  return Object.freeze({
    pid: process.pid,
    token: randomUUID2(),
    bootId: identity.bootId,
    processStartId: identity.processStartId
  });
}
function sameOwner(left, right) {
  return left.pid === right.pid && left.token === right.token && left.bootId === right.bootId && left.processStartId === right.processStartId;
}
function assertAdmissionHeld(admission, environment) {
  const current = readAdmissionClaim(admission.authId, environment);
  if (current === null || !sameOwner(current.value.owner, admission.owner) || processOwnerStatus(current.value.owner) !== "exact-live-owner") {
    throw new Error("read projection admission authority is not exact and live");
  }
}
function acquiredAdmission(id, claim, snapshot, environment, options = {}) {
  let released = false;
  return Object.freeze({
    authId: id,
    owner: claim.owner,
    release: () => {
      if (released)
        return;
      const deadline = performance.now() + READ_PROJECTION_SHORT_SETTLEMENT_WAIT_MS;
      let contentionReported = false;
      for (;; ) {
        assertAdmissionHeld({ authId: id, owner: claim.owner, release: () => {} }, environment);
        if (removePrivateStateFileIfUnchanged(admissionPath(id, environment), { expectedCurrentContentSha256: snapshot.contentSha256 }, environment)) {
          released = true;
          return;
        }
        const current = readAdmissionClaim(id, environment);
        if (current === null || current.contentSha256 !== snapshot.contentSha256 || !sameOwner(current.value.owner, claim.owner)) {
          throw new Error("read projection admission changed before release");
        }
        if (!contentionReported) {
          options.afterReleaseContentionForTest?.();
          contentionReported = true;
        }
        const remaining = deadline - performance.now();
        if (remaining <= 0) {
          throw new Error("read projection admission could not be released within its bounded wait");
        }
        Atomics.wait(settlementWaitState, 0, 0, Math.min(SETTLEMENT_WAIT_SLICE_MS, Math.ceil(remaining)));
      }
    }
  });
}
function isStateMutationCreateContention(error) {
  return error instanceof Error && error.message.includes("state file mutation is already active");
}
function acquireReadProjectionAuthAdmission(authIdValue, environment = process.env, options = {}) {
  if (options.afterCreateCommitForTest !== undefined && typeof options.afterCreateCommitForTest !== "function") {
    throw new Error("read projection admission fault injection is malformed");
  }
  if (options.afterReleaseContentionForTest !== undefined && typeof options.afterReleaseContentionForTest !== "function") {
    throw new Error("read projection admission fault injection is malformed");
  }
  if ((options.afterCreateCommitForTest !== undefined || options.afterReleaseContentionForTest !== undefined) && true) {
    throw new Error("read projection admission fault injection is available only in tests");
  }
  const id = authId2(authIdValue);
  ensurePrivateStateDirectory(admissionsDirectory(environment), environment);
  for (let attempt = 0;attempt < MAX_ACQUISITION_ATTEMPTS2; attempt += 1) {
    const observed = readAdmissionClaim(id, environment);
    if (observed !== null) {
      const status2 = processOwnerStatus(observed.value.owner);
      if (status2 === "exact-live-owner") {
        throw new ReadProjectionAdmissionContentionError(id, observed.value.owner, "active-owner");
      }
      if (status2 === "unknown") {
        throw new Error(`auth locator ${id} read projection owner cannot be inspected safely`);
      }
      removePrivateStateFileIfUnchanged(admissionPath(id, environment), { expectedCurrentContentSha256: observed.contentSha256 }, environment);
      continue;
    }
    const claim = admissionClaim({
      schemaVersion: 1,
      authId: id,
      owner: newOwner()
    });
    const snapshot = canonicalSnapshot(claim);
    let created = false;
    let currentAfterCreate;
    try {
      created = createPrivateJsonIfAbsent(admissionPath(id, environment), claim, { environment }).created;
      if (created)
        options.afterCreateCommitForTest?.();
    } catch (error) {
      let committed;
      try {
        committed = readAdmissionClaim(id, environment);
      } catch (reconciliationError) {
        throw new AggregateError([
          errorValue(error, "read projection admission creation failed"),
          errorValue(reconciliationError, "read projection admission reconciliation failed")
        ], `auth locator ${id} read projection admission creation could not be reconciled`);
      }
      if (committed !== null && committed.contentSha256 === snapshot.contentSha256 && sameOwner(committed.value.owner, claim.owner)) {
        return acquiredAdmission(id, claim, snapshot, environment, options);
      }
      if (!isStateMutationCreateContention(error))
        throw error;
      currentAfterCreate = committed;
    }
    if (created) {
      return acquiredAdmission(id, claim, snapshot, environment, options);
    }
    const current = currentAfterCreate ?? readAdmissionClaim(id, environment);
    if (current === null)
      continue;
    const status = processOwnerStatus(current.value.owner);
    if (status === "exact-live-owner") {
      throw new ReadProjectionAdmissionContentionError(id, current.value.owner, "active-owner");
    }
    if (status === "unknown") {
      throw new Error(`auth locator ${id} read projection owner cannot be inspected safely`);
    }
    removePrivateStateFileIfUnchanged(admissionPath(id, environment), { expectedCurrentContentSha256: current.contentSha256 }, environment);
  }
  throw new Error(`auth locator ${id} read projection admission could not be acquired`);
}
function withAcquiredReadProjectionAuthAdmission(id, environment, operation, acquire) {
  const heldKey = `${ghostgetStateHome(environment)}\x00${id}`;
  const held = heldAdmissions.get(heldKey);
  if (held !== undefined) {
    assertAdmissionHeld(held.admission, environment);
    held.depth += 1;
    try {
      return synchronousOperationResult(operation);
    } finally {
      held.depth -= 1;
    }
  }
  const admission = acquire();
  const acquired = { depth: 1, admission };
  heldAdmissions.set(heldKey, acquired);
  let outcome;
  try {
    outcome = { ok: true, value: synchronousOperationResult(operation) };
  } catch (error) {
    outcome = {
      ok: false,
      error: errorValue(error, "read projection operation failed")
    };
  }
  acquired.depth -= 1;
  heldAdmissions.delete(heldKey);
  let releaseError = null;
  try {
    admission.release();
  } catch (error) {
    releaseError = errorValue(error, "read projection admission release failed");
  }
  if (!outcome.ok && releaseError !== null) {
    throw new AggregateError([outcome.error, releaseError], `auth locator ${id} read projection operation and admission release both failed`);
  }
  if (!outcome.ok)
    throw outcome.error;
  if (releaseError !== null)
    throw releaseError;
  return outcome.value;
}
function withReadProjectionAuthAdmission(authIdValue, environment, operation) {
  const id = authId2(authIdValue);
  return withAcquiredReadProjectionAuthAdmission(id, environment, operation, () => acquireReadProjectionAuthAdmission(id, environment));
}
function rotateReadProjectionAuthIncarnation(authIdValue, environment = process.env) {
  const id = authId2(authIdValue);
  return withReadProjectionAuthAdmission(id, environment, () => {
    ensurePrivateStateDirectory(incarnationsDirectory(environment), environment);
    const current = readRawIncarnation(id, environment);
    let previousIncarnation = null;
    if (current !== null) {
      try {
        const parsed = parseCanonicalSnapshot(current.content, "read projection auth incarnation", incarnationRecord);
        if (parsed.value.authId === id) {
          previousIncarnation = parsed.value.incarnation;
        }
      } catch {}
    }
    let incarnation;
    do {
      incarnation = randomBytes(32).toString("hex");
    } while (incarnation === previousIncarnation);
    const replacement = incarnationRecord({
      schemaVersion: 1,
      authId: id,
      incarnation
    });
    const replaced = current === null ? createPrivateJsonIfAbsent(incarnationPath(id, environment), replacement, { environment }).created : writePrivateJsonIfUnchanged(incarnationPath(id, environment), replacement, { expectedCurrentContentSha256: current.contentSha256 });
    if (!replaced) {
      throw new Error(`auth locator ${id} read projection incarnation changed concurrently`);
    }
    return replacement.incarnation;
  });
}
function removeReadProjectionAuthIncarnation(authIdValue, environment = process.env) {
  const id = authId2(authIdValue);
  return withReadProjectionAuthAdmission(id, environment, () => {
    ensurePrivateStateDirectory(incarnationsDirectory(environment), environment);
    const current = readRawIncarnation(id, environment);
    if (current === null)
      return false;
    if (!removePrivateStateFileIfUnchanged(incarnationPath(id, environment), { expectedCurrentContentSha256: current.contentSha256 }, environment)) {
      throw new Error(`auth locator ${id} read projection incarnation changed concurrently before removal`);
    }
    return true;
  });
}

// src/session-secrets.ts
var SESSION_SECRET_DIRECTORY = "session-secrets";
var SESSION_SECRET_COORDINATE_DIRECTORY = "coordinates";
var MAX_PLAINTEXT_BYTES = 64 * 1024;
var MAX_ENCRYPTED_BYTES = 128 * 1024;
var MAX_COORDINATE_BYTES = 4 * 1024;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}
function exactKeys4(value, expected, label) {
  if (!hasExactKeys(value, expected)) {
    throw new Error(`${label} has unsupported fields`);
  }
}
function validateCoordinate(namespace, authId3, authHash) {
  if (!/^[a-z][a-z0-9-]{0,47}$/u.test(namespace)) {
    throw new Error("session-secret namespace must be lowercase kebab-case");
  }
  if (!/^[a-z][a-z0-9-]{0,47}$/u.test(authId3)) {
    throw new Error("session-secret auth ID must be lowercase kebab-case");
  }
  if (!/^[a-f0-9]{64}$/u.test(authHash)) {
    throw new Error("session-secret auth hash is malformed");
  }
}
function directory2(environment) {
  return join4(ghostgetStateHome(environment), SESSION_SECRET_DIRECTORY);
}
function isSessionSecretNamePart(value) {
  return /^[a-z][a-z0-9-]{0,47}$/u.test(value);
}
function historicalStem(namespace, authId3) {
  return `${namespace}--${authId3}`;
}
function historicalFileName(namespace, authId3) {
  return `${historicalStem(namespace, authId3)}.json`;
}
function historicalStemCoordinates(stem) {
  const coordinates = [];
  for (let index = stem.indexOf("--");index !== -1; index = stem.indexOf("--", index + 1)) {
    const namespace = stem.slice(0, index);
    const authId3 = stem.slice(index + 2);
    if (isSessionSecretNamePart(namespace) && isSessionSecretNamePart(authId3)) {
      coordinates.push(Object.freeze({ namespace, authId: authId3 }));
    }
  }
  return Object.freeze(coordinates);
}
function sessionSecretFileName(namespace, authId3) {
  if (!isSessionSecretNamePart(namespace) || !isSessionSecretNamePart(authId3)) {
    throw new Error("session-secret coordinate must be lowercase kebab-case");
  }
  const stem = historicalStem(namespace, authId3);
  return historicalStemCoordinates(stem).length === 1 ? `${stem}.json` : `${namespace}.${authId3}.json`;
}
function parseSessionSecretFileName(name) {
  if (!name.endsWith(".json"))
    return null;
  const stem = name.slice(0, -".json".length);
  const separator = stem.indexOf(".");
  if (separator !== -1) {
    const namespace = stem.slice(0, separator);
    const authId3 = stem.slice(separator + 1);
    if (!isSessionSecretNamePart(namespace) || !isSessionSecretNamePart(authId3) || sessionSecretFileName(namespace, authId3) !== name)
      return null;
    return Object.freeze({ kind: "coordinate", namespace, authId: authId3 });
  }
  const candidates = historicalStemCoordinates(stem);
  if (candidates.length === 0)
    return null;
  if (candidates.length === 1) {
    return Object.freeze({ kind: "coordinate", ...candidates[0] });
  }
  return Object.freeze({ kind: "ambiguous-historical", candidates });
}
function coordinateDirectory(environment) {
  return join4(directory2(environment), SESSION_SECRET_COORDINATE_DIRECTORY);
}
function coordinatePath(namespace, authId3, environment) {
  return join4(coordinateDirectory(environment), sessionSecretFileName(namespace, authId3));
}
function coordinateSnapshot(value) {
  return Object.freeze({
    value,
    contentSha256: createHash4("sha256").update(`${canonicalJson(value)}
`, "utf8").digest("hex")
  });
}
function parseCoordinateState(text, namespace, authId3) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("session-secret coordinate state is malformed JSON");
  }
  const value = record(parsed, "session-secret coordinate state");
  exactKeys4(value, [
    "schemaVersion",
    "namespace",
    "authId",
    "authIdentityHash",
    "generation"
  ], "session-secret coordinate state");
  if (value.schemaVersion !== 1 || value.namespace !== namespace || value.authId !== authId3 || typeof value.authIdentityHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.authIdentityHash) || typeof value.generation !== "string" || !/^[a-f0-9]{64}$/u.test(value.generation))
    throw new Error("session-secret coordinate state is malformed");
  const normalized = Object.freeze({
    schemaVersion: 1,
    namespace,
    authId: authId3,
    authIdentityHash: value.authIdentityHash,
    generation: value.generation
  });
  if (!isCanonicalJsonFileText(text, normalized)) {
    throw new Error("session-secret coordinate state is not canonical JSON");
  }
  return Object.freeze({
    value: normalized,
    contentSha256: createHash4("sha256").update(text, "utf8").digest("hex")
  });
}
function newCoordinateState(namespace, authId3, authIdentityHash, previousGeneration = null) {
  let generation;
  do {
    generation = randomBytes2(32).toString("hex");
  } while (generation === previousGeneration);
  return Object.freeze({
    schemaVersion: 1,
    namespace,
    authId: authId3,
    authIdentityHash,
    generation
  });
}
function replaceCoordinateState(current, namespace, authId3, authIdentityHash, environment) {
  const replacement = newCoordinateState(namespace, authId3, authIdentityHash, current?.value.generation ?? null);
  const path = coordinatePath(namespace, authId3, environment);
  const written = current === null ? createPrivateJsonIfAbsent(path, replacement, { environment }).created : writePrivateJsonIfUnchanged(path, replacement, {
    expectedCurrentContentSha256: current.contentSha256
  });
  if (!written) {
    throw new Error("session-secret coordinate generation changed concurrently");
  }
  return coordinateSnapshot(replacement);
}
function textSha256(text) {
  return createHash4("sha256").update(text, "utf8").digest("hex");
}
function coordinateBodyNames(text, namespace, authId3) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  return isRecord(parsed) && parsed.namespace === namespace && parsed.authId === authId3;
}
function adoptHistoricalFile(historicalPath, historicalText, injectivePath, value, maximumBytes, label, environment) {
  if (createPrivateJsonIfAbsent(injectivePath, value, { environment }).created) {
    const readback = readPrivateStateFileIfPresent(injectivePath, maximumBytes, label, environment);
    if (readback !== `${canonicalJson(value)}
`) {
      throw new Error(`${label} changed during historical-name migration`);
    }
  }
  if (!removePrivateStateFileIfUnchanged(historicalPath, { expectedCurrentContentSha256: textSha256(historicalText) }, environment)) {
    throw new Error(`${label} changed during historical-name migration`);
  }
}
function adoptHistoricalCoordinateState(namespace, authId3, environment) {
  const historicalName = historicalFileName(namespace, authId3);
  if (sessionSecretFileName(namespace, authId3) === historicalName)
    return;
  const controlDirectory2 = coordinateDirectory(environment);
  ensurePrivateStateDirectory(controlDirectory2, environment);
  const historicalPath = join4(controlDirectory2, historicalName);
  const text = readPrivateStateFileIfPresent(historicalPath, MAX_COORDINATE_BYTES, "session-secret coordinate state", environment);
  if (text === null || !coordinateBodyNames(text, namespace, authId3))
    return;
  adoptHistoricalFile(historicalPath, text, coordinatePath(namespace, authId3, environment), parseCoordinateState(text, namespace, authId3).value, MAX_COORDINATE_BYTES, "session-secret coordinate state", environment);
}
function planSessionSecretRemoval(names, authId3) {
  const owned = [];
  const ambiguous = [];
  for (const name of names) {
    const parsed = parseSessionSecretFileName(name);
    if (parsed === null)
      continue;
    if (parsed.kind === "coordinate") {
      if (parsed.authId === authId3)
        owned.push(name);
    } else if (parsed.candidates.some((candidate) => candidate.authId === authId3)) {
      ambiguous.push(name);
    }
  }
  return Object.freeze({
    owned: Object.freeze(owned),
    ambiguous: Object.freeze(ambiguous)
  });
}
function coordinateStatesForAuth(authId3, environment) {
  const sessionIdentity = ensurePrivateStateDirectory(directory2(environment), environment);
  const controlDirectory2 = coordinateDirectory(environment);
  const controlIdentity = ensurePrivateStateDirectory(controlDirectory2, environment);
  const listEntryKinds = () => new Map(listPrivateStateDirectory(controlDirectory2, environment, controlIdentity).map((entry) => [entry.name, entry.kind]));
  let kinds = listEntryKinds();
  const ambiguous = planSessionSecretRemoval([...kinds.keys()], authId3).ambiguous;
  for (const name of ambiguous) {
    const parsed = parseSessionSecretFileName(name);
    if (parsed?.kind !== "ambiguous-historical")
      continue;
    for (const candidate of parsed.candidates) {
      if (candidate.authId !== authId3)
        continue;
      adoptHistoricalCoordinateState(candidate.namespace, authId3, environment);
    }
  }
  if (ambiguous.length > 0)
    kinds = listEntryKinds();
  const snapshots = [];
  for (const name of planSessionSecretRemoval([...kinds.keys()], authId3).owned) {
    const parsed = parseSessionSecretFileName(name);
    if (kinds.get(name) !== "file" || parsed?.kind !== "coordinate") {
      throw new Error("session-secret coordinate store is malformed");
    }
    const text = readPrivateStateFileIfPresent(join4(controlDirectory2, name), MAX_COORDINATE_BYTES, "session-secret coordinate state", environment, [sessionIdentity, controlIdentity]);
    if (text === null) {
      throw new Error("session-secret coordinate store changed during auth cleanup");
    }
    snapshots.push(parseCoordinateState(text, parsed.namespace, authId3));
  }
  return Object.freeze(snapshots);
}
function historicalSessionSecretOwner(text, name) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed))
    return null;
  const { namespace, authId: authId3 } = parsed;
  if (typeof namespace !== "string" || typeof authId3 !== "string" || !isSessionSecretNamePart(namespace) || !isSessionSecretNamePart(authId3) || historicalFileName(namespace, authId3) !== name)
    return null;
  return Object.freeze({ namespace, authId: authId3 });
}
function removeAmbiguousHistoricalSecret(name, owns, sessionDirectory, directoryIdentity, environment) {
  const path = join4(sessionDirectory, name);
  const text = readPrivateStateFileIfPresent(path, MAX_ENCRYPTED_BYTES, "encrypted session secret", environment, [directoryIdentity]);
  if (text === null)
    return false;
  const owner2 = historicalSessionSecretOwner(text, name);
  if (owner2 === null) {
    throw new Error("ambiguous historical session secret has no verifiable owner; it was left in place");
  }
  if (!owns(owner2))
    return false;
  if (!removePrivateStateFileIfUnchanged(path, { expectedCurrentContentSha256: textSha256(text) }, environment)) {
    throw new Error("ambiguous historical session secret changed during removal");
  }
  return true;
}
function removeSessionSecretsForAuth(authId3, environment = process.env) {
  validateCoordinate("plugin", authId3, "0".repeat(64));
  return withReadProjectionAuthAdmission(authId3, environment, () => {
    for (const coordinate of coordinateStatesForAuth(authId3, environment)) {
      replaceCoordinateState(coordinate, coordinate.value.namespace, authId3, coordinate.value.authIdentityHash, environment);
    }
    const sessionDirectory = directory2(environment);
    const directoryIdentity = ensurePrivateStateDirectory(sessionDirectory, environment);
    const plan = planSessionSecretRemoval(listPrivateStateDirectory(sessionDirectory, environment, directoryIdentity).filter((entry) => entry.kind === "file").map((entry) => entry.name), authId3);
    let removed = 0;
    for (const name of plan.owned) {
      if (removePrivateStateFile(join4(sessionDirectory, name), environment, directoryIdentity)) {
        removed += 1;
      }
    }
    for (const name of plan.ambiguous) {
      if (removeAmbiguousHistoricalSecret(name, (owner2) => owner2.authId === authId3, sessionDirectory, directoryIdentity, environment)) {
        removed += 1;
      }
    }
    return removed;
  });
}

// src/read-projections.ts
import {
  createCipheriv as createCipheriv2,
  createDecipheriv as createDecipheriv2,
  createHash as createHash5,
  createHmac,
  randomBytes as randomBytes3,
  randomUUID as randomUUID3,
  timingSafeEqual
} from "crypto";
import { lstatSync } from "fs";
import { join as join5 } from "path";
var STORE_DIRECTORY = "read-projections";
var OMNI_STORE_DIRECTORY = "omni-read-projections";
var CONTROL_DIRECTORY2 = "read-projection-control";
var KEY_FILE = ".projection-encryption-key";
var STORE_KEY_MARKER_FILE = "store-key.json";
var KEY_FILE_MAX_BYTES = 512;
var STORE_KEY_MARKER_MAX_BYTES = 512;
var INITIALIZATION_SETTLE_ATTEMPTS = 100;
var INITIALIZATION_SETTLE_WAIT_MS = 10;
var HEAD_MAX_BYTES = 16 * 1024;
var MANIFEST_MAX_BYTES = 64 * 1024;
var MAX_ATTRIBUTABLE_CORRUPT_FILE_BYTES = 4 * 1024 * 1024;
var MAX_PLAINTEXT_BYTES2 = 16 * 1024 * 1024;
var MAX_CHUNKS = 16;
var MAX_QUERY_DIRECTORY_ENTRIES = 2 * MAX_CHUNKS + 16;
var MAX_REALM_STORAGE_BYTES = 128 * 1024 * 1024;
var MAX_FRESH_FOR_MS = 365 * 24 * 60 * 60 * 1000;
var corruptionConstructorToken = Symbol("read-projection-corruption");
var corruptionEvidence = new WeakMap;

class ReadProjectionCorruptionError extends Error {
  #nominal = true;
  constructor(message, evidence, options, token) {
    if (token !== corruptionConstructorToken) {
      throw new TypeError("read projection corruption evidence is internal");
    }
    super(message, options);
    this.name = "ReadProjectionCorruptionError";
    corruptionEvidence.set(this, evidence);
  }
  get authenticatedOnDiskQueryCorruption() {
    return this.#nominal;
  }
  get queryKey() {
    return corruptionEvidence.get(this).queryKey;
  }
  get storageClass() {
    return corruptionEvidence.get(this).storageClass;
  }
  get realmKey() {
    return corruptionEvidence.get(this).realmKey;
  }
  get headContentSha256() {
    return corruptionEvidence.get(this).headContentSha256;
  }
  get headPublication() {
    return corruptionEvidence.get(this).headPublication;
  }
}
function record2(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} has an unsupported prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) {
    throw new Error(`${label} has unsupported symbol fields`);
  }
  const result = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} has unsupported accessor fields`);
    }
    Object.defineProperty(result, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return result;
}
function exactKeys5(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unsupported fields`);
  }
}
function hexDigest(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function hmac(key, domain, value) {
  return createHmac("sha256", key).update(domain, "utf8").update("\x00", "utf8").update(value).digest("hex");
}
function authenticated(left, right) {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right))
    return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
function storeDirectory(environment) {
  return join5(ghostgetStateHome(environment), STORE_DIRECTORY);
}
function omniStoreDirectory(environment) {
  return join5(ghostgetStateHome(environment), OMNI_STORE_DIRECTORY);
}
function storeDirectoryForClass(storageClass, environment) {
  return storageClass === "exact-v1" ? storeDirectory(environment) : omniStoreDirectory(environment);
}
function keyPath(environment) {
  return join5(ghostgetStateHome(environment), KEY_FILE);
}
function controlDirectory2(environment) {
  return join5(ghostgetStateHome(environment), CONTROL_DIRECTORY2);
}
function storeKeyMarkerPath(environment) {
  return join5(controlDirectory2(environment), STORE_KEY_MARKER_FILE);
}
function realmDirectory(realmKey2, environment, storageClass = "exact-v1") {
  return join5(storeDirectoryForClass(storageClass, environment), hexDigest(realmKey2, "projection realm key"));
}
function projectionKeyId(key) {
  return hmac(key, "wrench-read-projection-key-id-v1", key);
}
function projectionStoreKeyMarkerBody(keyId) {
  return Object.freeze({ schemaVersion: 1, keyId });
}
function projectionStoreKeyMarker(key) {
  const body = projectionStoreKeyMarkerBody(key.id);
  return Object.freeze({
    ...body,
    authentication: hmac(key.value, "wrench-read-projection-store-key-marker-v1", canonicalJson(body))
  });
}
function parseProjectionStoreKeyMarker(text, key) {
  let marker;
  try {
    const value = record2(JSON.parse(text), "read projection store key marker");
    exactKeys5(value, ["schemaVersion", "keyId", "authentication"], "read projection store key marker");
    if (value.schemaVersion !== 1) {
      throw new Error("unsupported read projection store key marker");
    }
    marker = Object.freeze({
      schemaVersion: 1,
      keyId: hexDigest(value.keyId, "read projection store key marker key ID"),
      authentication: hexDigest(value.authentication, "read projection store key marker authentication")
    });
    if (!isCanonicalJsonFileText(text, marker)) {
      throw new Error("read projection store key marker is not canonical");
    }
  } catch {
    throw new Error("read projection store key marker is malformed");
  }
  const expectedAuthentication = hmac(key.value, "wrench-read-projection-store-key-marker-v1", canonicalJson(projectionStoreKeyMarkerBody(marker.keyId)));
  if (marker.keyId !== key.id || !authenticated(marker.authentication, expectedAuthentication)) {
    throw new Error("read projection store key marker does not match the projection encryption key");
  }
  return marker;
}
function newProjectionKeyRecord() {
  const key = randomBytes3(32);
  return Object.freeze({
    schemaVersion: 1,
    keyId: projectionKeyId(key),
    key: key.toString("hex")
  });
}
function parseProjectionKey(text) {
  try {
    const value = record2(JSON.parse(text), "projection encryption key");
    exactKeys5(value, ["schemaVersion", "keyId", "key"], "projection encryption key");
    if (value.schemaVersion !== 1)
      throw new Error("unsupported projection encryption key");
    const id = hexDigest(value.keyId, "projection encryption key ID");
    const keyHex = hexDigest(value.key, "projection encryption key bytes");
    const key = Buffer.from(keyHex, "hex");
    if (projectionKeyId(key) !== id)
      throw new Error("projection encryption key is not identity-bound");
    return Object.freeze({ id, value: key });
  } catch {
    throw new Error("projection encryption key is malformed");
  }
}
function encryptedStoreHasState(environment) {
  const directory3 = storeDirectory(environment);
  const identity = ensureProjectionStateDirectory(directory3, environment);
  const exactHasState = listPrivateStateDirectory(directory3, environment, identity, { recoverOrphanedMutationClaims: true }).length > 0;
  if (exactHasState)
    return true;
  try {
    lstatSync(omniStoreDirectory(environment));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
  return snapshotPrivateStateDirectory(omniStoreDirectory(environment), environment, undefined, { recoverOrphanedMutationClaims: true }).entries.length > 0;
}
function readProjectionKeyIfPresent(environment) {
  try {
    return parseProjectionKey(readRegularFile(keyPath(environment), KEY_FILE_MAX_BYTES, "projection encryption key").trim());
  } catch (error) {
    if (error instanceof Error && error.message === "projection encryption key is malformed") {
      throw error;
    }
    return null;
  }
}
function readProjectionStoreKeyMarkerIfPresent(environment) {
  for (let attempt = 0;attempt < INITIALIZATION_SETTLE_ATTEMPTS; attempt += 1) {
    try {
      return readPrivateStateFileIfPresent(storeKeyMarkerPath(environment), STORE_KEY_MARKER_MAX_BYTES, "read projection store key marker", environment);
    } catch (error) {
      if (!isConcurrentDirectoryCreation(error))
        throw error;
      waitForProjectionInitialization();
    }
  }
  throw new Error("read projection store marker lookup did not settle");
}
function waitForProjectionInitialization() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, INITIALIZATION_SETTLE_WAIT_MS);
}
function isActiveStateMutation(error) {
  return error instanceof Error && error.message.includes("state file mutation is already active");
}
function isConcurrentDirectoryCreation(error) {
  return error instanceof Error && (error.message.includes("state directory appeared where absence was required") || error.message.includes("state directory appeared while being created") || error.message.includes("state directory appeared where absence was expected"));
}
function ensureProjectionStateDirectory(path, environment) {
  for (let attempt = 0;attempt < INITIALIZATION_SETTLE_ATTEMPTS; attempt += 1) {
    try {
      return ensurePrivateStateDirectory(path, environment);
    } catch (error) {
      if (!isConcurrentDirectoryCreation(error))
        throw error;
      waitForProjectionInitialization();
    }
  }
  throw new Error("read projection state-directory initialization did not settle");
}
function ensureProjectionStoreKeyMarker(key, environment, create) {
  for (let attempt = 0;attempt < INITIALIZATION_SETTLE_ATTEMPTS; attempt += 1) {
    const content = readProjectionStoreKeyMarkerIfPresent(environment);
    if (content !== null) {
      parseProjectionStoreKeyMarker(content, key);
      return true;
    }
    if (encryptedStoreHasState(environment)) {
      throw new Error("read projection store is missing its key ownership marker");
    }
    if (!create)
      return false;
    const controlIdentity = ensureProjectionStateDirectory(controlDirectory2(environment), environment);
    try {
      createPrivateJsonIfAbsent(storeKeyMarkerPath(environment), projectionStoreKeyMarker(key), {
        environment,
        expectedStateParent: controlIdentity
      });
    } catch (error) {
      if (!isActiveStateMutation(error))
        throw error;
      waitForProjectionInitialization();
      continue;
    }
    const settled = readPrivateStateFileIfPresent(storeKeyMarkerPath(environment), STORE_KEY_MARKER_MAX_BYTES, "read projection store key marker", environment, [controlIdentity]);
    if (settled !== null) {
      parseProjectionStoreKeyMarker(settled, key);
      return true;
    }
    waitForProjectionInitialization();
  }
  throw new Error("read projection store key marker did not settle");
}
function projectionKey(environment, create) {
  let key = readProjectionKeyIfPresent(environment);
  if (key === null) {
    const markerExists = readProjectionStoreKeyMarkerIfPresent(environment) !== null;
    const storeHasState = markerExists ? false : encryptedStoreHasState(environment);
    if (markerExists || storeHasState) {
      key = readProjectionKeyIfPresent(environment);
      if (key === null) {
        throw new Error("projection encryption key is unavailable while encrypted read projections exist");
      }
    }
    if (key === null && !create)
      return null;
  }
  if (key === null) {
    for (let attempt = 0;attempt < INITIALIZATION_SETTLE_ATTEMPTS; attempt += 1) {
      try {
        createPrivateJsonIfAbsent(keyPath(environment), newProjectionKeyRecord(), {
          environment,
          privateParent: true
        });
      } catch (error) {
        if (!isActiveStateMutation(error))
          throw error;
      }
      key = readProjectionKeyIfPresent(environment);
      if (key !== null)
        break;
      waitForProjectionInitialization();
    }
    if (key === null)
      throw new Error("projection encryption key is unavailable");
  }
  return ensureProjectionStoreKeyMarker(key, environment, create) ? key : null;
}
function removeReadProjectionsForAuth(authIdValue, environment = process.env) {
  return withReadProjectionAuthAdmission(authIdValue, environment, () => {
    const key = projectionKey(environment, false);
    if (key === null)
      return false;
    const exactRealmKey = hmac(key.value, "wrench-read-projection-realm-v1", authIdValue);
    const omniRealmKey = hmac(key.value, "wrench-omni-projection-realm-v1", authIdValue);
    let removed = false;
    const failures = [];
    for (const [storageClass, realmKey2] of [
      ["exact-v1", exactRealmKey],
      ["omni-v1", omniRealmKey]
    ]) {
      try {
        removed = removePrivateStateDirectoryTree(realmDirectory(realmKey2, environment, storageClass), environment) || removed;
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1)
      throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, "read projection auth cleanup failed for exact and omni stores");
    }
    return removed;
  });
}

// src/provider-subject.ts
function isGmailAccountSubject(value) {
  if (value.length < 3 || value.length > 254 || !/^[\x21-\x7e]+$/u.test(value)) {
    return false;
  }
  const separator = value.indexOf("@");
  if (separator < 1 || separator !== value.lastIndexOf("@"))
    return false;
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  if (local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..") || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u.test(local) || domain.length > 253 || !domain.includes(".")) {
    return false;
  }
  return domain.split(".").every((label) => label.length >= 1 && label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(label));
}
function isXAccountSubject(value) {
  return /^[0-9]{1,19}$/u.test(value);
}
function isLinkedInWebAccountSubject(value) {
  return /^urn:li:fsd_profile:[0-9]{1,32}$/u.test(value);
}
function isLinkedInProviderActorSubject(value) {
  return /^urn:li:(?:person:[A-Za-z0-9_-]{1,256}|organization:[0-9]{1,32})$/u.test(value);
}

// src/auth.ts
function authPath(id, environment) {
  if (!/^[a-z][a-z0-9-]{0,47}$/u.test(id))
    throw new Error("auth ID must be lowercase kebab-case");
  return join6(ghostgetStateHome(environment), "auth", `${id}.json`);
}
function canonicalLinkedDeviceStorePath(pathValue) {
  const suffix = [];
  let ancestor = resolve(pathValue);
  while (!existsSync(ancestor)) {
    try {
      if (lstatSync2(ancestor).isSymbolicLink()) {
        throw new Error("linked-device store path contains an unresolved symbolic link");
      }
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      throw new Error("linked-device store path has no existing ancestor");
    }
    suffix.unshift(ancestor.slice(parent.length + (parent.endsWith("/") ? 0 : 1)));
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), ...suffix);
}
function linkedDeviceRealmKey(auth) {
  const canonicalPath = canonicalLinkedDeviceStorePath(auth.path);
  if (auth.realmKey !== undefined && canonicalPath !== auth.path) {
    throw new Error("linked-device realm key requires a persisted canonical store path");
  }
  const expected = deriveLinkedDeviceRealmKey(auth.provider, canonicalPath);
  if (auth.realmKey !== undefined) {
    if (!/^[a-f0-9]{64}$/u.test(auth.realmKey)) {
      throw new Error("linked-device auth has a malformed stable realm key");
    }
    if (auth.realmKey !== expected) {
      throw new Error("linked-device auth realm key does not match its provider and canonical store path");
    }
  }
  return expected;
}
function deriveLinkedDeviceRealmKey(provider, canonicalStorePath) {
  return createHash6("sha256").update("io-linked-device-realm-v1\x00", "utf8").update(canonicalJson({
    kind: "linked-device-store",
    provider,
    storePath: canonicalStorePath
  }), "utf8").digest("hex");
}
function createAuth(id, input) {
  if (!/^[a-z][a-z0-9-]{0,47}$/u.test(id))
    throw new Error("auth ID must be lowercase kebab-case");
  const subject = input.subject === undefined ? undefined : normalizeAuthSubject(input.subject);
  if ("linkedDeviceProvider" in input) {
    if (!isProviderPluginSurfaceId(input.linkedDeviceProvider)) {
      throw new Error("linked-device auth has an invalid provider");
    }
    if (!isSafeAuthPath(input.deviceStore)) {
      throw new Error("linked-device auth has an invalid store path");
    }
    const path = canonicalLinkedDeviceStorePath(input.deviceStore);
    return {
      schemaVersion: 1,
      id,
      kind: "linked-device-store",
      provider: input.linkedDeviceProvider,
      path,
      realmKey: deriveLinkedDeviceRealmKey(input.linkedDeviceProvider, path),
      ...subject === undefined ? {} : { subject }
    };
  }
  if ("oauthProvider" in input) {
    if (!isProviderPluginSurfaceId(input.oauthProvider)) {
      throw new Error("OAuth token-file auth has an invalid provider");
    }
    if (!isSafeOAuthTokenPath(input.tokenFile))
      throw new Error("OAuth token-file auth has an invalid path");
    if (input.ownedImport === true && (input.managed === true || input.oauthProvider !== "x" || subject === undefined || !/^[0-9]{1,19}$/u.test(subject))) {
      throw new Error("owned token imports require an exact X subject and cannot be renewable");
    }
    return {
      schemaVersion: 1,
      id,
      kind: "oauth-token-file",
      provider: input.oauthProvider,
      path: resolve(input.tokenFile),
      scopes: normalizeOAuthScopes(input.scopes),
      ...input.managed === true ? { managed: true } : {},
      ...input.ownedImport === true ? { ownedImport: true } : {},
      ...subject === undefined ? {} : { subject }
    };
  }
  if ("browserProfile" in input) {
    if (!input.trustUnfilteredEgress) {
      throw new Error("browser profiles require --trust-profile-egress because profile sessions cannot use agent-browser domain containment");
    }
    if (!isSafeString(input.browserProfile, 4096) || !isSafeBrowserProfile(input.browserProfile)) {
      throw new Error("browser profile is invalid or unsafe");
    }
    if (input.browserExecutable !== undefined && (!isSafeAuthPath(input.browserExecutable) || input.browserExecutable.trim() !== input.browserExecutable)) {
      throw new Error("browser executable is invalid or unsafe");
    }
    if (input.storageState !== undefined && (!isSafeAuthPath(input.storageState) || input.storageState.trim() !== input.storageState)) {
      throw new Error("browser storage state is invalid or unsafe");
    }
    if (input.cookieSource !== undefined && !cookieSources.includes(input.cookieSource)) {
      throw new Error("browser-profile auth has an invalid cookie source");
    }
    if (input.cookieProfile !== undefined && (input.cookieSource === undefined || !isSafeString(input.cookieProfile, 4096))) {
      throw new Error("browser-profile cookie profile requires a valid cookie source");
    }
    return {
      schemaVersion: 1,
      id,
      kind: "browser-profile",
      profile: browserProfileLocator(input.browserProfile),
      ...input.browserExecutable === undefined ? {} : { browserExecutable: resolve(input.browserExecutable) },
      ...input.storageState === undefined ? {} : { storageState: resolve(input.storageState) },
      trustUnfilteredEgress: true,
      ...input.cookieSource === undefined ? {} : { cookieSource: input.cookieSource },
      ...input.cookieProfile === undefined ? {} : { cookieProfile: input.cookieProfile },
      ...subject === undefined ? {} : { subject }
    };
  }
  if ("source" in input) {
    if (!cookieSources.includes(input.source) || input.profile !== undefined && !isSafeString(input.profile, 4096)) {
      throw new Error("cookie-source auth has an invalid source or profile");
    }
    return {
      schemaVersion: 1,
      id,
      kind: "cookie-source",
      source: input.source,
      ...input.profile === undefined ? {} : { profile: browserProfileLocator(input.profile) },
      ...subject === undefined ? {} : { subject }
    };
  }
  if ("cookiesFile" in input) {
    if (!isSafeString(input.cookiesFile, 4096))
      throw new Error("cookies-file auth has an invalid path");
    return {
      schemaVersion: 1,
      id,
      kind: "cookies-file",
      path: resolve(input.cookiesFile),
      ...subject === undefined ? {} : { subject }
    };
  }
  throw new Error("auth locator kind is not supported");
}
function saveAuth(authValue, environment = process.env, options = {}) {
  const replacement = canonicalAuthSnapshot(authValue);
  const auth = replacement.auth;
  const path = authPath(auth.id, environment);
  let current;
  try {
    current = loadAuthSnapshotIfPresent(auth.id, environment);
  } catch {
    throw new Error(`auth locator ${auth.id} already exists but is invalid; inspect or remove it before replacement`);
  }
  if (current !== null && options.force !== true && current.contentSha256 !== replacement.contentSha256) {
    throw new Error(`auth locator ${auth.id} already names a different access realm; use a new ID or repeat with --force after reviewing cache and action identity`);
  }
  if (current !== null && current.contentSha256 === replacement.contentSha256)
    return path;
  return withLinkedDeviceAuthMutationAdmissions(current?.auth, auth, environment, () => withReadProjectionAuthAdmission(auth.id, environment, () => {
    const observed = loadAuthSnapshotIfPresent(auth.id, environment);
    if (current === null) {
      if (observed !== null) {
        throw new Error(`auth locator ${auth.id} changed concurrently before creation`);
      }
      rotateReadProjectionAuthIncarnation(auth.id, environment);
      removePrivateAuthState(auth.id, environment);
      if (!createPrivateJsonIfAbsent(path, auth, { privateParent: true, environment }).created) {
        throw new Error(`auth locator ${auth.id} changed concurrently before creation`);
      }
      return path;
    }
    if (observed === null || observed.contentSha256 !== current.contentSha256) {
      throw new Error(`auth locator ${auth.id} changed concurrently before replacement`);
    }
    const priorCredential = replacementCredentialSnapshot(current.auth, auth, environment);
    rotateReadProjectionAuthIncarnation(auth.id, environment);
    removePrivateAuthState(auth.id, environment);
    if (!writePrivateJsonIfUnchanged(path, auth, { expectedCurrentContentSha256: current.contentSha256 })) {
      throw new Error(`auth locator ${auth.id} changed concurrently before replacement`);
    }
    removeReplacedCredential(priorCredential, environment);
    return path;
  }));
}
function isSafeString(value, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum)
    return false;
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127)
      return false;
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343))
        return false;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return false;
  }
  return true;
}
function normalizeAuthSubject(value) {
  if (!isSafeString(value, 512) || value.trim() !== value || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~:@-]{1,512}$/u.test(value))
    throw new Error("auth locator has an invalid subject");
  return value;
}
function normalizeAuthDisplayName(value) {
  if (!isSafeString(value, 128) || value.trim() !== value || /[<>\\^`|{}\u202a-\u202e\u2066-\u2069]/u.test(value))
    throw new Error("auth record has an invalid displayName");
  return value;
}
var normalizeOAuthSubject = normalizeAuthSubject;
function isSafeAuthPath(value) {
  if (!isSafeString(value, 4096))
    return false;
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 128 && code <= 159 || code === 1564 || code === 8206 || code === 8207 || code >= 8232 && code <= 8238 || code >= 8294 && code <= 8297)
      return false;
  }
  return true;
}
var isSafeOAuthTokenPath = isSafeAuthPath;
function isCanonicalHttpsOAuthScope(value) {
  if (value === "https://mail.google.com/")
    return true;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" && url.search === "" && url.hash === "" && url.pathname !== "/" && url.href === value && /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(url.hostname) && url.hostname.includes(".") && /^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]+$/u.test(url.pathname);
}
function normalizeOAuthScopes(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 64) {
    throw new Error("OAuth token-file auth requires between 1 and 64 scopes");
  }
  const scopes = values.map((value) => {
    if (!isSafeString(value, 128) || value.trim() !== value || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value) && !isCanonicalHttpsOAuthScope(value)) {
      throw new Error("OAuth scopes must be provider scope names or canonical HTTPS scope URLs without whitespace or control characters");
    }
    return value;
  });
  if (new Set(scopes).size !== scopes.length)
    throw new Error("OAuth scopes must not contain duplicates");
  return [...scopes].sort();
}
function isSafeBrowserProfile(value) {
  const named = !value.includes("/") && !value.includes("\\");
  if (!named)
    return true;
  if (value.length > 256 || value.trim() !== value || value.startsWith("-") || value === "." || value === "..")
    return false;
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 128 && code <= 159 || code === 1564 || code === 8206 || code === 8207 || code >= 8232 && code <= 8238 || code >= 8294 && code <= 8297)
      return false;
  }
  return true;
}
function browserProfileLocator(value) {
  const pathLike = isAbsolute(value) || value.startsWith("./") || value.startsWith("../") || value.includes("/") || value.includes("\\");
  return pathLike ? resolve(value) : value;
}
function exactKeys6(value, expected) {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return keys.length === allowed.length && keys.every((key, index) => key === allowed[index]);
}
function parseAuth(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("auth record must be an object");
  const record3 = value;
  if (record3.schemaVersion !== 1 || !isSafeString(record3.id, 48) || !/^[a-z][a-z0-9-]*$/u.test(record3.id)) {
    throw new Error("auth record has an invalid schema version or ID");
  }
  if (record3.kind === "cookie-source") {
    const expected = ["schemaVersion", "id", "kind", "source"];
    if (record3.provider !== undefined)
      expected.push("provider");
    if (record3.profile !== undefined)
      expected.push("profile");
    if (record3.subject !== undefined)
      expected.push("subject");
    if (record3.displayName !== undefined)
      expected.push("displayName");
    if (!exactKeys6(record3, expected))
      throw new Error("auth record has unsupported fields");
    if (typeof record3.source !== "string" || !cookieSources.includes(record3.source)) {
      throw new Error("auth record has an invalid cookie source");
    }
    if (record3.provider !== undefined && !isProviderPluginSurfaceId(record3.provider)) {
      throw new Error("auth record has an invalid cookie-source provider");
    }
    if (record3.profile !== undefined && !isSafeString(record3.profile, 4096))
      throw new Error("auth record has an invalid profile");
    if (typeof record3.profile === "string" && (record3.profile.includes("/") || record3.profile.includes("\\")) && !isAbsolute(record3.profile))
      throw new Error("auth record cookie profile paths must be absolute");
    if (record3.subject !== undefined && typeof record3.subject !== "string") {
      throw new Error("auth record has an invalid subject");
    }
    const subject = typeof record3.subject === "string" ? normalizeAuthSubject(record3.subject) : undefined;
    if (record3.displayName !== undefined && typeof record3.displayName !== "string") {
      throw new Error("auth record has an invalid displayName");
    }
    const displayName = typeof record3.displayName === "string" ? normalizeAuthDisplayName(record3.displayName) : undefined;
    return {
      schemaVersion: 1,
      id: record3.id,
      kind: "cookie-source",
      source: record3.source,
      ...record3.provider === undefined ? {} : { provider: record3.provider },
      ...typeof record3.profile !== "string" ? {} : { profile: record3.profile },
      ...subject === undefined ? {} : { subject },
      ...displayName === undefined ? {} : { displayName }
    };
  }
  if (record3.kind === "cookies-file") {
    const expected = ["schemaVersion", "id", "kind", "path"];
    if (record3.subject !== undefined)
      expected.push("subject");
    if (!exactKeys6(record3, expected))
      throw new Error("auth record has unsupported fields");
    if (!isSafeString(record3.path, 4096) || !isAbsolute(record3.path))
      throw new Error("auth record has an invalid or non-absolute cookie file path");
    if (record3.subject !== undefined && typeof record3.subject !== "string") {
      throw new Error("auth record has an invalid subject");
    }
    const subject = typeof record3.subject === "string" ? normalizeAuthSubject(record3.subject) : undefined;
    return {
      schemaVersion: 1,
      id: record3.id,
      kind: "cookies-file",
      path: record3.path,
      ...subject === undefined ? {} : { subject }
    };
  }
  if (record3.kind === "browser-profile") {
    const expected = ["schemaVersion", "id", "kind", "profile", "trustUnfilteredEgress"];
    if (record3.browserExecutable !== undefined)
      expected.push("browserExecutable");
    if (record3.storageState !== undefined)
      expected.push("storageState");
    if (record3.cookieSource !== undefined)
      expected.push("cookieSource");
    if (record3.cookieProfile !== undefined)
      expected.push("cookieProfile");
    if (record3.subject !== undefined)
      expected.push("subject");
    if (!exactKeys6(record3, expected))
      throw new Error("auth record has unsupported fields");
    if (!isSafeString(record3.profile, 4096) || !isSafeBrowserProfile(record3.profile) || record3.trustUnfilteredEgress !== true) {
      throw new Error("auth record has an invalid browser profile or trust acknowledgement");
    }
    if ((record3.profile.includes("/") || record3.profile.includes("\\")) && !isAbsolute(record3.profile)) {
      throw new Error("auth record browser profile paths must be absolute");
    }
    if (record3.browserExecutable !== undefined && (!isSafeAuthPath(record3.browserExecutable) || !isAbsolute(record3.browserExecutable) || record3.browserExecutable.trim() !== record3.browserExecutable))
      throw new Error("auth record has an invalid browser executable");
    if (record3.storageState !== undefined && (!isSafeAuthPath(record3.storageState) || !isAbsolute(record3.storageState) || record3.storageState.trim() !== record3.storageState))
      throw new Error("auth record has an invalid browser storage state path");
    if (record3.cookieSource !== undefined && (typeof record3.cookieSource !== "string" || !cookieSources.includes(record3.cookieSource)))
      throw new Error("auth record has an invalid browser-profile cookie source");
    if (record3.cookieProfile !== undefined && (record3.cookieSource === undefined || !isSafeString(record3.cookieProfile, 4096)))
      throw new Error("auth record has an invalid browser-profile cookie profile");
    if (record3.subject !== undefined && typeof record3.subject !== "string") {
      throw new Error("auth record has an invalid subject");
    }
    const subject = typeof record3.subject === "string" ? normalizeAuthSubject(record3.subject) : undefined;
    return {
      schemaVersion: 1,
      id: record3.id,
      kind: "browser-profile",
      profile: record3.profile,
      ...typeof record3.browserExecutable !== "string" ? {} : { browserExecutable: record3.browserExecutable },
      ...typeof record3.storageState !== "string" ? {} : { storageState: record3.storageState },
      trustUnfilteredEgress: true,
      ...typeof record3.cookieSource !== "string" ? {} : { cookieSource: record3.cookieSource },
      ...typeof record3.cookieProfile !== "string" ? {} : { cookieProfile: record3.cookieProfile },
      ...subject === undefined ? {} : { subject }
    };
  }
  if (record3.kind === "oauth-token-file") {
    const expected = ["schemaVersion", "id", "kind", "provider", "path", "scopes"];
    if (record3.managed !== undefined)
      expected.push("managed");
    if (record3.ownedImport !== undefined)
      expected.push("ownedImport");
    if (record3.subject !== undefined)
      expected.push("subject");
    if (!exactKeys6(record3, expected))
      throw new Error("auth record has unsupported fields");
    if (!isProviderPluginSurfaceId(record3.provider)) {
      throw new Error("auth record has an invalid OAuth provider");
    }
    if (!isSafeOAuthTokenPath(record3.path) || !isAbsolute(record3.path)) {
      throw new Error("auth record has an invalid or non-absolute OAuth token file path");
    }
    if (record3.managed !== undefined && record3.managed !== true) {
      throw new Error("auth record has an invalid managed OAuth lifecycle marker");
    }
    if (record3.ownedImport !== undefined && (record3.ownedImport !== true || record3.managed !== undefined || record3.provider !== "x" || typeof record3.subject !== "string" || !/^[0-9]{1,19}$/u.test(record3.subject))) {
      throw new Error("auth record has an invalid owned token import marker");
    }
    const rawScopes = record3.scopes;
    if (!Array.isArray(rawScopes) || !rawScopes.every((scope) => typeof scope === "string")) {
      throw new Error("auth record has invalid OAuth scopes");
    }
    const scopes = normalizeOAuthScopes(rawScopes);
    if (scopes.some((scope, index) => scope !== rawScopes[index])) {
      throw new Error("auth record OAuth scopes must be sorted");
    }
    if (record3.subject !== undefined && typeof record3.subject !== "string") {
      throw new Error("auth record has an invalid OAuth subject");
    }
    const subject = typeof record3.subject === "string" ? normalizeAuthSubject(record3.subject) : undefined;
    return {
      schemaVersion: 1,
      id: record3.id,
      kind: "oauth-token-file",
      provider: record3.provider,
      path: record3.path,
      scopes,
      ...record3.managed === true ? { managed: true } : {},
      ...record3.ownedImport === true ? { ownedImport: true } : {},
      ...subject === undefined ? {} : { subject }
    };
  }
  if (record3.kind === "linked-device-store") {
    const expected = ["schemaVersion", "id", "kind", "provider", "path"];
    if (record3.realmKey !== undefined)
      expected.push("realmKey");
    if (record3.subject !== undefined)
      expected.push("subject");
    if (record3.boundVersion !== undefined)
      expected.push("boundVersion");
    if (!exactKeys6(record3, expected))
      throw new Error("auth record has unsupported fields");
    if (!isProviderPluginSurfaceId(record3.provider)) {
      throw new Error("auth record has an invalid linked-device provider");
    }
    if (!isSafeAuthPath(record3.path) || !isAbsolute(record3.path)) {
      throw new Error("auth record has an invalid or non-absolute linked-device store path");
    }
    const canonicalPath = canonicalLinkedDeviceStorePath(record3.path);
    if (record3.realmKey !== undefined && canonicalPath !== record3.path) {
      throw new Error("auth record linked-device store path must be canonical");
    }
    if (record3.realmKey !== undefined && (typeof record3.realmKey !== "string" || !/^[a-f0-9]{64}$/u.test(record3.realmKey))) {
      throw new Error("auth record has an invalid linked-device realm key");
    }
    const realmKey2 = deriveLinkedDeviceRealmKey(record3.provider, canonicalPath);
    if (typeof record3.realmKey === "string" && record3.realmKey !== realmKey2) {
      throw new Error("auth record linked-device realm key does not match its provider and canonical store path");
    }
    if (record3.subject !== undefined && typeof record3.subject !== "string") {
      throw new Error("auth record has an invalid linked-device subject");
    }
    const subject = typeof record3.subject === "string" ? normalizeAuthSubject(record3.subject) : undefined;
    if (record3.boundVersion !== undefined && (typeof record3.boundVersion !== "string" || record3.boundVersion.length < 1 || record3.boundVersion.length > 256 || !/^[\x21-\x7e]+$/u.test(record3.boundVersion))) {
      throw new Error("auth record has an invalid linked-device bound version");
    }
    const boundVersion = typeof record3.boundVersion === "string" ? record3.boundVersion : undefined;
    return {
      schemaVersion: 1,
      id: record3.id,
      kind: "linked-device-store",
      provider: record3.provider,
      path: record3.path,
      ...record3.realmKey === undefined ? {} : { realmKey: realmKey2 },
      ...subject === undefined ? {} : { subject },
      ...boundVersion === undefined ? {} : { boundVersion }
    };
  }
  throw new Error("auth record kind is not supported");
}
function canonicalAuthSnapshot(authValue) {
  const parsed = parseAuth(authValue);
  const auth = parsed.kind === "oauth-token-file" ? Object.freeze({
    ...parsed,
    scopes: Object.freeze([...parsed.scopes])
  }) : Object.freeze({ ...parsed });
  const content = `${canonicalJson(auth)}
`;
  return Object.freeze({
    auth,
    contentSha256: createHash6("sha256").update(content, "utf8").digest("hex")
  });
}
function parseAuthSnapshotText(id, content) {
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("auth record is malformed JSON");
  }
  const snapshot = canonicalAuthSnapshot(value);
  if (snapshot.auth.id !== id) {
    throw new Error("auth record ID does not match its filename");
  }
  if (!isCanonicalJsonFileText(content, snapshot.auth)) {
    throw new Error("auth record is not canonical JSON");
  }
  return Object.freeze({
    auth: snapshot.auth,
    contentSha256: createHash6("sha256").update(content, "utf8").digest("hex")
  });
}
function loadAuthSnapshotIfPresent(id, environment) {
  const content = readPrivateStateFileIfPresent(authPath(id, environment), MAX_WRENCH_JSON_BYTES, "auth record", environment);
  return content === null ? null : parseAuthSnapshotText(id, content);
}
function linkedDeviceMutationRealms(current, replacement, authIds, journals) {
  const byKey = new Map;
  for (const auth of [current, replacement]) {
    if (auth?.kind !== "linked-device-store")
      continue;
    const key = linkedDeviceRealmKey(auth);
    const existing = byKey.get(key);
    if (existing === undefined || auth.id < existing) {
      byKey.set(key, auth.id);
    }
  }
  for (const entry of journals) {
    if ("invalid" in entry) {
      throw new Error("linked-device lifecycle journals contain invalid state; auth mutation is blocked");
    }
    if (!authIds.has(entry.journal.authId))
      continue;
    const existing = byKey.get(entry.journal.authRealmHash);
    if (existing === undefined || entry.journal.authId < existing) {
      byKey.set(entry.journal.authRealmHash, entry.journal.authId);
    }
  }
  return Object.freeze([...byKey.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, authIdValue]) => Object.freeze({ key, authId: authIdValue })));
}
function assertLinkedDeviceMutationJournalsSettled(realmKeys, authIds, environment) {
  if (realmKeys.size === 0 && authIds.size === 0)
    return;
  for (const entry of listLinkedDeviceLifecycleJournalSnapshots(environment)) {
    if ("invalid" in entry) {
      throw new Error("linked-device lifecycle journals contain invalid state; auth mutation is blocked");
    }
    const { journal } = entry;
    if (!realmKeys.has(journal.authRealmHash) && !authIds.has(journal.authId))
      continue;
    if (journal.phase === "terminal" && journal.status !== "indeterminate")
      continue;
    throw new Error(`auth locator ${journal.authId} has an active or unreconciled linked-device lifecycle`);
  }
}
function withLinkedDeviceAuthMutationAdmissions(current, replacement, environment, operation) {
  const authIds = new Set([current?.id, replacement?.id].filter((id) => id !== undefined));
  const journals = listLinkedDeviceLifecycleJournalSnapshots(environment);
  const realms = linkedDeviceMutationRealms(current, replacement, authIds, journals);
  if (realms.length === 0)
    return operation();
  const recovery = linkedDeviceLifecycleAdmissionStore.recover(environment);
  if (recovery.issues.length > 0) {
    throw new Error("linked-device lifecycle admissions contain unresolved state; auth mutation is blocked");
  }
  const acquiredAt = new Date().toISOString();
  const admissions = [];
  let result;
  let operationError;
  let operationFailed = false;
  try {
    for (const realm of realms) {
      admissions.push(linkedDeviceLifecycleAdmissionStore.acquire(realm.key, realm.authId, acquiredAt, environment));
    }
    assertLinkedDeviceMutationJournalsSettled(new Set(realms.map((realm) => realm.key)), authIds, environment);
    result = operation();
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }
  const releaseErrors = [];
  for (const admission of admissions.reverse()) {
    try {
      admission.release();
    } catch (error) {
      releaseErrors.push(error);
    }
  }
  if (operationFailed) {
    if (releaseErrors.length === 0)
      throw operationError;
    throw new AggregateError([operationError, ...releaseErrors], "linked-device auth mutation failed and its admissions could not be released");
  }
  if (releaseErrors.length > 0) {
    throw new AggregateError(releaseErrors, "linked-device auth mutation admissions could not be released");
  }
  return result;
}
function assertAuthSnapshot(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !hasExactKeys(value, ["auth", "contentSha256"]) || typeof value.contentSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.contentSha256))
    throw new Error("auth snapshot is malformed");
  const canonical = canonicalAuthSnapshot(value.auth);
  if (canonical.contentSha256 !== value.contentSha256) {
    throw new Error("auth snapshot is not content-bound");
  }
  return canonical;
}
function loadAuthSnapshot(id, environment = process.env) {
  const snapshot = loadAuthSnapshotIfPresent(id, environment);
  if (snapshot === null)
    throw new Error(`auth locator ${id} was not found`);
  return snapshot;
}
function replaceAuthIfUnchanged(currentValue, replacementValue, environment = process.env, authority) {
  const current = assertAuthSnapshot(currentValue);
  const replacement = canonicalAuthSnapshot(replacementValue);
  if (replacement.auth.id !== current.auth.id) {
    throw new Error("auth replacement ID does not match its snapshot");
  }
  const replace = () => withReadProjectionAuthAdmission(current.auth.id, environment, () => {
    const observed = loadAuthSnapshotIfPresent(current.auth.id, environment);
    if (observed === null || observed.contentSha256 !== current.contentSha256)
      return Object.freeze({ replaced: false });
    const priorCredential = replacementCredentialSnapshot(current.auth, replacement.auth, environment);
    rotateReadProjectionAuthIncarnation(current.auth.id, environment);
    removePrivateAuthState(current.auth.id, environment);
    const replaced = writePrivateJsonIfUnchanged(authPath(current.auth.id, environment), replacement.auth, { expectedCurrentContentSha256: current.contentSha256 });
    if (!replaced)
      return Object.freeze({ replaced: false });
    removeReplacedCredential(priorCredential, environment);
    return Object.freeze({ replaced: true, snapshot: replacement });
  });
  const linkedMutation = current.auth.kind === "linked-device-store" || replacement.auth.kind === "linked-device-store";
  if (!linkedMutation)
    return replace();
  if (authority !== undefined) {
    if (current.auth.kind !== "linked-device-store" || replacement.auth.kind !== "linked-device-store" || current.auth.id !== authority.lifecycleAdmission.authId || linkedDeviceRealmKey(current.auth) !== authority.lifecycleAdmission.realmKey || linkedDeviceRealmKey(replacement.auth) !== authority.lifecycleAdmission.realmKey) {
      throw new Error("linked-device auth replacement authority does not match one stable realm");
    }
    assertLinkedDeviceLifecycleAdmissionHeld(authority.lifecycleAdmission, environment);
    return replace();
  }
  return withLinkedDeviceAuthMutationAdmissions(current.auth, replacement.auth, environment, replace);
}
function loadAuth(id, environment = process.env) {
  return loadAuthSnapshot(id, environment).auth;
}
function listAuthSnapshots(environment = process.env) {
  const directory3 = join6(ghostgetStateHome(environment), "auth");
  const snapshot = snapshotPrivateStateDirectory(directory3, environment);
  if (snapshot.identity === null)
    return [];
  const names = snapshot.entries.filter((entry) => entry.kind === "file" && entry.name.endsWith(".json")).map((entry) => entry.name);
  return readPrivateStateFilesBatched(directory3, names, {
    maximumBytesPerFile: MAX_WRENCH_JSON_BYTES,
    environment,
    expectedDirectoryIdentity: snapshot.identity
  }).flatMap((file) => {
    const id = basename(file.name, ".json");
    if (file.status !== "present")
      return [];
    try {
      return [parseAuthSnapshotText(id, file.content)];
    } catch {
      return [];
    }
  });
}
function listAuth(environment = process.env) {
  const directory3 = join6(ghostgetStateHome(environment), "auth");
  const snapshot = snapshotPrivateStateDirectory(directory3, environment);
  if (snapshot.identity === null)
    return [];
  const names = snapshot.entries.filter((entry) => entry.kind === "file" && entry.name.endsWith(".json")).map((entry) => entry.name);
  return readPrivateStateFilesBatched(directory3, names, {
    maximumBytesPerFile: MAX_WRENCH_JSON_BYTES,
    environment,
    expectedDirectoryIdentity: snapshot.identity
  }).flatMap((file) => {
    const id = basename(file.name, ".json");
    if (file.status !== "present")
      return [];
    try {
      return [parseAuthSnapshotText(id, file.content).auth];
    } catch {
      return [];
    }
  });
}
function managedOAuthCredentialSnapshot(auth, environment) {
  if (auth.kind !== "oauth-token-file" || auth.managed !== true && auth.ownedImport !== true)
    return null;
  const expectedDirectory = join6(ghostgetStateHome(environment), "auth", "oauth-tokens");
  if (dirname(auth.path) !== expectedDirectory || !new RegExp(`^${auth.id}-[0-9a-f-]{36}\\.json$`, "u").test(basename(auth.path)))
    throw new Error("managed OAuth credential path does not match its auth locator");
  const content = readPrivateStateFileIfPresent(auth.path, 64 * 1024, "managed OAuth credential", environment);
  return content === null ? null : Object.freeze({
    path: auth.path,
    contentSha256: createHash6("sha256").update(content, "utf8").digest("hex")
  });
}
function replacementCredentialSnapshot(previous, replacement, environment) {
  if (previous.kind === "oauth-token-file" && replacement.kind === "oauth-token-file" && previous.path === replacement.path)
    return null;
  return managedOAuthCredentialSnapshot(previous, environment);
}
function removeReplacedCredential(credential, environment) {
  if (credential !== null && !removePrivateStateFileIfUnchanged(credential.path, { expectedCurrentContentSha256: credential.contentSha256 }, environment)) {
    throw new Error("the account was replaced but its prior owned credential changed before cleanup");
  }
}
function removeAuth(id, environment = process.env) {
  const path = authPath(id, environment);
  let current;
  try {
    current = loadAuthSnapshotIfPresent(id, environment);
  } catch {
    throw new Error(`auth locator ${id} is invalid; removal cannot prove that no linked-device lifecycle owns it`);
  }
  if (current === null) {
    return withReadProjectionAuthAdmission(id, environment, () => {
      const observed = loadAuthSnapshotIfPresent(id, environment);
      if (observed !== null) {
        throw new Error(`auth locator ${id} changed concurrently before removal`);
      }
      removePrivateAuthState(id, environment);
      removeReadProjectionAuthIncarnation(id, environment);
      return false;
    });
  }
  const managedCredential = managedOAuthCredentialSnapshot(current.auth, environment);
  return withLinkedDeviceAuthMutationAdmissions(current.auth, undefined, environment, () => withReadProjectionAuthAdmission(id, environment, () => {
    const observed = loadAuthSnapshotIfPresent(id, environment);
    if (observed === null || observed.contentSha256 !== current.contentSha256) {
      throw new Error(`auth locator ${id} changed concurrently before removal`);
    }
    rotateReadProjectionAuthIncarnation(id, environment);
    removePrivateAuthState(id, environment);
    removeReadProjectionAuthIncarnation(id, environment);
    const removed = removePrivateStateFileIfUnchanged(path, { expectedCurrentContentSha256: current.contentSha256 }, environment);
    if (!removed) {
      throw new Error(`auth locator ${id} changed concurrently before removal`);
    }
    if (managedCredential !== null && !removePrivateStateFileIfUnchanged(managedCredential.path, { expectedCurrentContentSha256: managedCredential.contentSha256 }, environment)) {
      throw new Error(`managed OAuth credential for ${id} changed concurrently before removal`);
    }
    return true;
  }));
}
function removePrivateAuthState(id, environment) {
  const failures = [];
  try {
    removeSessionSecretsForAuth(id, environment);
  } catch (error) {
    failures.push(error);
  }
  try {
    removeReadProjectionsForAuth(id, environment);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1)
    throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, `private state cleanup for auth locator ${id} failed`);
  }
}
export {
  saveAuth,
  replaceAuthIfUnchanged,
  removeAuth,
  parseAuth,
  normalizeOAuthSubject,
  normalizeOAuthScopes,
  normalizeAuthSubject,
  normalizeAuthDisplayName,
  loadAuthSnapshotIfPresent,
  loadAuthSnapshot,
  loadAuth,
  listAuthSnapshots,
  listAuth,
  linkedDeviceRealmKey,
  isXAccountSubject,
  isLinkedInWebAccountSubject,
  isLinkedInProviderActorSubject,
  isGmailAccountSubject,
  createAuth,
  canonicalLinkedDeviceStorePath
};
