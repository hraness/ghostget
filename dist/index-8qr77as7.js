// @bun
import {
  createPrivateJsonIfAbsent,
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  listPrivateStateDirectory,
  readPrivateStateFileIfPresent,
  readRegularFile,
  removePrivateStateFileIfUnchanged,
  writePrivateJsonIfUnchanged
} from "./index-0ywm1fj9.js";
import {
  currentProcessStartIdentity,
  processOwnerStatus
} from "./index-4bpemvnc.js";
import {
  canonicalJson
} from "./index-8sbt8qwx.js";

// src/read-projection-admission.ts
import { createHash, randomBytes, randomUUID } from "crypto";
import { join } from "path";
import { performance } from "perf_hooks";
var CONTROL_DIRECTORY = "read-projection-control";
var ADMISSION_DIRECTORY = "admissions";
var INCARNATION_DIRECTORY = "incarnations";
var MAX_CONTROL_RECORD_BYTES = 4 * 1024;
var MAX_ACQUISITION_ATTEMPTS = 16;
var READ_PROJECTION_SHORT_SETTLEMENT_WAIT_MS = 1e4;
var READ_PROJECTION_TRANSITION_SETTLEMENT_WAIT_MS = 120000;
var SETTLEMENT_WAIT_SLICE_MS = 10;
var settlementWaitState = new Int32Array(new SharedArrayBuffer(4));
var authIdPattern = /^[a-z][a-z0-9-]{0,47}$/u;
var digestPattern = /^[a-f0-9]{64}$/u;
var uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

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
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function strictRecord(value, label) {
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
function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    throw new Error(`${label} has unsupported fields`);
}
function authId(value) {
  if (typeof value !== "string" || !authIdPattern.test(value)) {
    throw new Error("read projection auth ID must be lowercase kebab-case");
  }
  return value;
}
function digest(value, label) {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function owner(value) {
  const record = strictRecord(value, "read projection admission owner");
  exactKeys(record, ["pid", "token", "bootId", "processStartId"], "read projection admission owner");
  if (typeof record.pid !== "number" || !Number.isSafeInteger(record.pid) || record.pid < 1 || record.pid > 2147483647 || typeof record.token !== "string" || !uuidPattern.test(record.token))
    throw new Error("read projection admission owner is malformed");
  return Object.freeze({
    pid: record.pid,
    token: record.token,
    bootId: digest(record.bootId, "read projection admission boot identity"),
    processStartId: digest(record.processStartId, "read projection admission process identity")
  });
}
function admissionClaim(value) {
  const record = strictRecord(value, "read projection admission");
  exactKeys(record, ["schemaVersion", "authId", "owner"], "read projection admission");
  if (record.schemaVersion !== 1) {
    throw new Error("read projection admission version is unsupported");
  }
  return Object.freeze({
    schemaVersion: 1,
    authId: authId(record.authId),
    owner: owner(record.owner)
  });
}
function incarnationRecord(value) {
  const record = strictRecord(value, "read projection auth incarnation");
  exactKeys(record, ["schemaVersion", "authId", "incarnation"], "read projection auth incarnation");
  if (record.schemaVersion !== 1) {
    throw new Error("read projection auth incarnation version is unsupported");
  }
  return Object.freeze({
    schemaVersion: 1,
    authId: authId(record.authId),
    incarnation: digest(record.incarnation, "read projection auth incarnation")
  });
}
function controlDirectory(environment) {
  return join(ghostgetStateHome(environment), CONTROL_DIRECTORY);
}
function admissionsDirectory(environment) {
  return join(controlDirectory(environment), ADMISSION_DIRECTORY);
}
function incarnationsDirectory(environment) {
  return join(controlDirectory(environment), INCARNATION_DIRECTORY);
}
function authCoordinate(id) {
  return hash(`wrench-read-projection-auth-coordinate-v1\x00${id}`);
}
function admissionPath(id, environment) {
  return join(admissionsDirectory(environment), `${authCoordinate(id)}.json`);
}
function incarnationPath(id, environment) {
  return join(incarnationsDirectory(environment), `${authCoordinate(id)}.json`);
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
  if (content !== `${canonicalJson(value)}
`) {
    throw new Error(`${label} is not canonical JSON`);
  }
  return canonicalSnapshot(value);
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
function readIncarnation(id, environment) {
  const content = readRawIncarnation(id, environment);
  if (content === null)
    return null;
  const snapshot = parseCanonicalSnapshot(content.content, "read projection auth incarnation", incarnationRecord);
  if (snapshot.value.authId !== id) {
    throw new Error("read projection auth incarnation does not match its coordinate");
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
    token: randomUUID(),
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
  const id = authId(authIdValue);
  ensurePrivateStateDirectory(admissionsDirectory(environment), environment);
  for (let attempt = 0;attempt < MAX_ACQUISITION_ATTEMPTS; attempt += 1) {
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
  const id = authId(authIdValue);
  return withAcquiredReadProjectionAuthAdmission(id, environment, operation, () => acquireReadProjectionAuthAdmission(id, environment));
}
function settlementWaitMilliseconds(options) {
  const value = options.maximumWaitMs ?? READ_PROJECTION_SHORT_SETTLEMENT_WAIT_MS;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > READ_PROJECTION_TRANSITION_SETTLEMENT_WAIT_MS) {
    throw new Error(`read projection admission settlement wait must be an integer from 0 to ${READ_PROJECTION_TRANSITION_SETTLEMENT_WAIT_MS} milliseconds`);
  }
  return value;
}
function acquireSettledReadProjectionAuthAdmission(id, environment, options) {
  const maximumWaitMs = settlementWaitMilliseconds(options);
  const deadline = performance.now() + maximumWaitMs;
  let active;
  while (true) {
    try {
      return acquireReadProjectionAuthAdmission(id, environment);
    } catch (error) {
      if (!(error instanceof ReadProjectionAdmissionContentionError)) {
        throw error;
      }
      active = error;
    }
    if (active.owner.pid === process.pid) {
      throw new ReadProjectionAdmissionContentionError(id, active.owner, "same-process-owner", { cause: active });
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      throw new ReadProjectionAdmissionContentionError(id, active.owner, "settlement-exhausted", { cause: active });
    }
    Atomics.wait(settlementWaitState, 0, 0, Math.min(SETTLEMENT_WAIT_SLICE_MS, Math.ceil(remaining)));
  }
}
function withSettledReadProjectionAuthAdmission(authIdValue, environment, operation, options = {}) {
  const id = authId(authIdValue);
  settlementWaitMilliseconds(options);
  return withAcquiredReadProjectionAuthAdmission(id, environment, operation, () => acquireSettledReadProjectionAuthAdmission(id, environment, options));
}
function ensureIncarnationUnderAdmission(id, environment) {
  ensurePrivateStateDirectory(incarnationsDirectory(environment), environment);
  const current = readIncarnation(id, environment);
  if (current !== null)
    return current;
  const value = incarnationRecord({
    schemaVersion: 1,
    authId: id,
    incarnation: randomBytes(32).toString("hex")
  });
  createPrivateJsonIfAbsent(incarnationPath(id, environment), value, { environment });
  const created = readIncarnation(id, environment);
  if (created === null) {
    throw new Error("read projection auth incarnation could not be ensured");
  }
  return created;
}
function projectionAuthIdentityHash(authIdValue, exactAuthContentHashValue, environment = process.env) {
  const id = authId(authIdValue);
  const exactAuthContentHash = digest(exactAuthContentHashValue, "exact auth content hash");
  return withReadProjectionAuthAdmission(id, environment, () => {
    const incarnation = ensureIncarnationUnderAdmission(id, environment).value.incarnation;
    return hash(`wrench-read-projection-auth-identity-v1\x00${id}\x00${exactAuthContentHash}\x00${incarnation}`);
  });
}

// src/session-secrets.ts
import {
  createHash as createHash2,
  createCipheriv,
  createDecipheriv,
  randomBytes as randomBytes2
} from "crypto";
import { join as join2 } from "path";
var SESSION_SECRET_DIRECTORY = "session-secrets";
var SESSION_SECRET_COORDINATE_DIRECTORY = "coordinates";
var SESSION_SECRET_KEY = ".session-encryption-key";
var MAX_KEY_BYTES = 512;
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
function exactKeys2(value, expected, label) {
  if (Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} has unsupported fields`);
  }
}
function validateCoordinate(namespace, authId2, authHash) {
  if (!/^[a-z][a-z0-9-]{0,47}$/u.test(namespace)) {
    throw new Error("session-secret namespace must be lowercase kebab-case");
  }
  if (!/^[a-z][a-z0-9-]{0,47}$/u.test(authId2)) {
    throw new Error("session-secret auth ID must be lowercase kebab-case");
  }
  if (!/^[a-f0-9]{64}$/u.test(authHash)) {
    throw new Error("session-secret auth hash is malformed");
  }
}
function directory(environment) {
  return join2(ghostgetStateHome(environment), SESSION_SECRET_DIRECTORY);
}
function secretPath(namespace, authId2, environment) {
  return join2(directory(environment), `${namespace}--${authId2}.json`);
}
function coordinateDirectory(environment) {
  return join2(directory(environment), SESSION_SECRET_COORDINATE_DIRECTORY);
}
function coordinatePath(namespace, authId2, environment) {
  return join2(coordinateDirectory(environment), `${namespace}--${authId2}.json`);
}
function coordinateSnapshot(value) {
  return Object.freeze({
    value,
    contentSha256: createHash2("sha256").update(`${canonicalJson(value)}
`, "utf8").digest("hex")
  });
}
function parseCoordinateState(text, namespace, authId2) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("session-secret coordinate state is malformed JSON");
  }
  const value = record(parsed, "session-secret coordinate state");
  exactKeys2(value, [
    "schemaVersion",
    "namespace",
    "authId",
    "authIdentityHash",
    "generation"
  ], "session-secret coordinate state");
  if (value.schemaVersion !== 1 || value.namespace !== namespace || value.authId !== authId2 || typeof value.authIdentityHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.authIdentityHash) || typeof value.generation !== "string" || !/^[a-f0-9]{64}$/u.test(value.generation))
    throw new Error("session-secret coordinate state is malformed");
  const normalized = Object.freeze({
    schemaVersion: 1,
    namespace,
    authId: authId2,
    authIdentityHash: value.authIdentityHash,
    generation: value.generation
  });
  if (text !== `${canonicalJson(normalized)}
`) {
    throw new Error("session-secret coordinate state is not canonical JSON");
  }
  return coordinateSnapshot(normalized);
}
function readCoordinateState(namespace, authId2, environment) {
  ensurePrivateStateDirectory(coordinateDirectory(environment), environment);
  const text = readPrivateStateFileIfPresent(coordinatePath(namespace, authId2, environment), MAX_COORDINATE_BYTES, "session-secret coordinate state", environment);
  return text === null ? null : parseCoordinateState(text, namespace, authId2);
}
function newCoordinateState(namespace, authId2, authIdentityHash, previousGeneration = null) {
  let generation;
  do {
    generation = randomBytes2(32).toString("hex");
  } while (generation === previousGeneration);
  return Object.freeze({
    schemaVersion: 1,
    namespace,
    authId: authId2,
    authIdentityHash,
    generation
  });
}
function replaceCoordinateState(current, namespace, authId2, authIdentityHash, environment) {
  const replacement = newCoordinateState(namespace, authId2, authIdentityHash, current?.value.generation ?? null);
  const path = coordinatePath(namespace, authId2, environment);
  const written = current === null ? createPrivateJsonIfAbsent(path, replacement, { environment }).created : writePrivateJsonIfUnchanged(path, replacement, {
    expectedCurrentContentSha256: current.contentSha256
  });
  if (!written) {
    throw new Error("session-secret coordinate generation changed concurrently");
  }
  return coordinateSnapshot(replacement);
}
function ensureCoordinateState(namespace, authId2, authIdentityHash, environment) {
  const current = readCoordinateState(namespace, authId2, environment);
  if (current !== null)
    return current;
  return replaceCoordinateState(null, namespace, authId2, authIdentityHash, environment);
}
function keyPath(environment) {
  return join2(ghostgetStateHome(environment), SESSION_SECRET_KEY);
}
function sessionKeyId(key) {
  return createHash2("sha256").update("io-session-key-id-v1\x00", "utf8").update(key).digest("hex");
}
function newSessionKeyRecord() {
  const key = randomBytes2(32);
  return Object.freeze({
    schemaVersion: 2,
    keyId: sessionKeyId(key),
    key: key.toString("hex")
  });
}
function encryptedStoreHasState(environment) {
  const sessionDirectory = directory(environment);
  const identity = ensurePrivateStateDirectory(sessionDirectory, environment);
  return listPrivateStateDirectory(sessionDirectory, environment, identity).some((entry) => entry.name !== SESSION_SECRET_COORDINATE_DIRECTORY || entry.kind !== "directory");
}
function parseSessionKey(text) {
  try {
    const parsed = JSON.parse(text);
    const value = record(parsed, "session encryption key");
    if (value.schemaVersion === 1) {
      exactKeys2(value, ["schemaVersion", "key"], "session encryption key");
    } else if (value.schemaVersion === 2) {
      exactKeys2(value, ["schemaVersion", "keyId", "key"], "session encryption key");
    } else {
      throw new Error("unsupported session encryption-key schema");
    }
    if (typeof value.key !== "string" || !/^[a-f0-9]{64}$/u.test(value.key))
      throw new Error("invalid session encryption-key bytes");
    const key = Buffer.from(value.key, "hex");
    const derivedId = sessionKeyId(key);
    if (value.schemaVersion === 2 && (typeof value.keyId !== "string" || !/^[a-f0-9]{64}$/u.test(value.keyId) || value.keyId !== derivedId))
      throw new Error("invalid session encryption-key identity");
    return Object.freeze({ id: derivedId, value: key });
  } catch {
    throw new Error("session encryption key is malformed");
  }
}
function sessionKey(environment) {
  const path = keyPath(environment);
  try {
    return parseSessionKey(readRegularFile(path, MAX_KEY_BYTES, "session encryption key").trim());
  } catch (error) {
    if (error instanceof Error && error.message === "session encryption key is malformed")
      throw error;
    if (encryptedStoreHasState(environment)) {
      throw new Error("session encryption key is unavailable while encrypted session state exists");
    }
  }
  createPrivateJsonIfAbsent(path, newSessionKeyRecord(), {
    environment,
    privateParent: true
  });
  try {
    return parseSessionKey(readRegularFile(path, MAX_KEY_BYTES, "session encryption key").trim());
  } catch {
    throw new Error("session encryption key is unavailable");
  }
}
function additionalData(schemaVersion, keyId, namespace, authId2, authIdentityHash, generation) {
  return Buffer.from(schemaVersion === 1 ? `io-session-secret-v1\x00${namespace}\x00${authId2}\x00${authIdentityHash}` : schemaVersion === 2 ? `io-session-secret-v2\x00${keyId ?? ""}\x00${namespace}\x00${authId2}\x00${authIdentityHash}` : `io-session-secret-v3\x00${keyId ?? ""}\x00${namespace}\x00${authId2}\x00${authIdentityHash}\x00${generation ?? ""}`, "utf8");
}
function boundedBase64(value, label, maximumBytes) {
  if (typeof value !== "string" || value.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value))
    throw new Error(`${label} is malformed`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength > maximumBytes || bytes.toString("base64") !== value)
    throw new Error(`${label} is malformed`);
  return bytes;
}
function encryptedSessionSecret(namespace, authId2, authIdentityHash, generation, value, environment = process.env) {
  validateCoordinate(namespace, authId2, authIdentityHash);
  if (!/^[a-f0-9]{64}$/u.test(generation)) {
    throw new Error("session-secret coordinate generation is malformed");
  }
  const plaintext = Buffer.from(canonicalJson(value), "utf8");
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error("session secret exceeded its plaintext byte bound");
  }
  ensurePrivateStateDirectory(directory(environment), environment);
  const iv = randomBytes2(12);
  const key = sessionKey(environment);
  assertSessionKeyOwnsEncryptedStore(key, environment);
  const cipher = createCipheriv("aes-256-gcm", key.value, iv);
  cipher.setAAD(additionalData(3, key.id, namespace, authId2, authIdentityHash, generation));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Object.freeze({
    schemaVersion: 3,
    encryption: "aes-256-gcm",
    keyId: key.id,
    namespace,
    authId: authId2,
    authIdentityHash,
    generation,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  });
}
function encryptedContentSha256(encrypted) {
  return createHash2("sha256").update(`${canonicalJson(encrypted)}
`, "utf8").digest("hex");
}
function absentContentSha256(namespace, authId2, authIdentityHash, generation) {
  return createHash2("sha256").update(`io-session-secret-absent-revision-v2\x00${namespace}\x00${authId2}\x00${authIdentityHash}\x00${generation}`, "utf8").digest("hex");
}
function writeSessionSecretIfUnchanged(namespace, authId2, authHash, value, expectedContentSha256, environment = process.env) {
  validateCoordinate(namespace, authId2, authHash);
  if (expectedContentSha256 !== null && !/^[a-f0-9]{64}$/u.test(expectedContentSha256))
    throw new Error("expected session-secret content hash is malformed");
  return withReadProjectionAuthAdmission(authId2, environment, () => {
    const authIdentityHash = projectionAuthIdentityHash(authId2, authHash, environment);
    if (expectedContentSha256 === null) {
      return Object.freeze({ written: false });
    }
    const coordinate = ensureCoordinateState(namespace, authId2, authIdentityHash, environment);
    let publicationCoordinate = coordinate;
    const path = secretPath(namespace, authId2, environment);
    const currentText = readPrivateStateFileIfPresent(path, MAX_ENCRYPTED_BYTES, "encrypted session secret", environment);
    if (currentText === null) {
      if (coordinate.value.authIdentityHash !== authIdentityHash) {
        publicationCoordinate = replaceCoordinateState(coordinate, namespace, authId2, authIdentityHash, environment);
      }
      if (expectedContentSha256 !== absentContentSha256(namespace, authId2, authIdentityHash, publicationCoordinate.value.generation))
        return Object.freeze({ written: false });
      publicationCoordinate = replaceCoordinateState(publicationCoordinate, namespace, authId2, authIdentityHash, environment);
    } else {
      const currentContentSha256 = createHash2("sha256").update(currentText, "utf8").digest("hex");
      if (currentContentSha256 !== expectedContentSha256) {
        return Object.freeze({ written: false });
      }
      const current = parseEncryptedSessionSecret(currentText);
      if (current.namespace !== namespace || current.authId !== authId2)
        throw new Error("encrypted session secret is malformed");
      parsedPlaintext(decryptSessionSecret(current, sessionKey(environment)));
      if (encryptedCoordinateGeneration(current) !== coordinate.value.generation) {
        reclaimStaleEncryptedCoordinate(coordinate, namespace, authId2, currentContentSha256, environment);
        return Object.freeze({ written: false });
      }
      if (coordinate.value.authIdentityHash !== authIdentityHash) {
        return Object.freeze({ written: false });
      }
      if (encryptedAuthIdentityHash(current) !== authIdentityHash) {
        reclaimStaleEncryptedCoordinate(coordinate, namespace, authId2, currentContentSha256, environment);
        return Object.freeze({ written: false });
      }
    }
    const encrypted = encryptedSessionSecret(namespace, authId2, authIdentityHash, publicationCoordinate.value.generation, value, environment);
    let written;
    if (currentText === null) {
      written = createPrivateJsonIfAbsent(path, encrypted, { environment }).created;
    } else {
      written = writePrivateJsonIfUnchanged(path, encrypted, {
        expectedCurrentContentSha256: expectedContentSha256
      });
    }
    return written ? Object.freeze({
      written: true,
      contentSha256: encryptedContentSha256(encrypted)
    }) : Object.freeze({ written: false });
  });
}
function parseEncryptedSessionSecret(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("encrypted session secret is malformed");
  }
  const encrypted = record(parsed, "encrypted session secret");
  if (encrypted.schemaVersion === 1) {
    exactKeys2(encrypted, [
      "schemaVersion",
      "encryption",
      "namespace",
      "authId",
      "authHash",
      "iv",
      "ciphertext",
      "tag"
    ], "encrypted session secret");
  } else if (encrypted.schemaVersion === 2) {
    exactKeys2(encrypted, [
      "schemaVersion",
      "encryption",
      "keyId",
      "namespace",
      "authId",
      "authHash",
      "iv",
      "ciphertext",
      "tag"
    ], "encrypted session secret");
  } else if (encrypted.schemaVersion === 3) {
    exactKeys2(encrypted, [
      "schemaVersion",
      "encryption",
      "keyId",
      "namespace",
      "authId",
      "authIdentityHash",
      "generation",
      "iv",
      "ciphertext",
      "tag"
    ], "encrypted session secret");
  } else {
    throw new Error("encrypted session secret is malformed");
  }
  if (encrypted.encryption !== "aes-256-gcm" || typeof encrypted.namespace !== "string" || !/^[a-z][a-z0-9-]{0,47}$/u.test(encrypted.namespace) || typeof encrypted.authId !== "string" || !/^[a-z][a-z0-9-]{0,47}$/u.test(encrypted.authId) || typeof encrypted.iv !== "string" || typeof encrypted.ciphertext !== "string" || typeof encrypted.tag !== "string" || (encrypted.schemaVersion === 2 || encrypted.schemaVersion === 3) && (typeof encrypted.keyId !== "string" || !/^[a-f0-9]{64}$/u.test(encrypted.keyId)))
    throw new Error("encrypted session secret is malformed");
  if (encrypted.schemaVersion === 3 && (typeof encrypted.authIdentityHash !== "string" || !/^[a-f0-9]{64}$/u.test(encrypted.authIdentityHash) || typeof encrypted.generation !== "string" || !/^[a-f0-9]{64}$/u.test(encrypted.generation)))
    throw new Error("encrypted session secret is malformed");
  if ((encrypted.schemaVersion === 1 || encrypted.schemaVersion === 2) && (typeof encrypted.authHash !== "string" || !/^[a-f0-9]{64}$/u.test(encrypted.authHash)))
    throw new Error("encrypted session secret is malformed");
  if (encrypted.schemaVersion === 1) {
    const authHash = encrypted.authHash;
    if (typeof authHash !== "string") {
      throw new Error("encrypted session secret is malformed");
    }
    return {
      schemaVersion: 1,
      encryption: "aes-256-gcm",
      namespace: encrypted.namespace,
      authId: encrypted.authId,
      authHash,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      tag: encrypted.tag
    };
  }
  const keyId = encrypted.keyId;
  if (typeof keyId !== "string") {
    throw new Error("encrypted session secret is malformed");
  }
  if (encrypted.schemaVersion === 2) {
    const authHash = encrypted.authHash;
    if (typeof authHash !== "string") {
      throw new Error("encrypted session secret is malformed");
    }
    return {
      schemaVersion: 2,
      encryption: "aes-256-gcm",
      keyId,
      namespace: encrypted.namespace,
      authId: encrypted.authId,
      authHash,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      tag: encrypted.tag
    };
  }
  const authIdentityHash = encrypted.authIdentityHash;
  const generation = encrypted.generation;
  if (typeof authIdentityHash !== "string" || typeof generation !== "string") {
    throw new Error("encrypted session secret is malformed");
  }
  return {
    schemaVersion: 3,
    encryption: "aes-256-gcm",
    keyId,
    namespace: encrypted.namespace,
    authId: encrypted.authId,
    authIdentityHash,
    generation,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    tag: encrypted.tag
  };
}
function encryptedAuthIdentityHash(encrypted) {
  return encrypted.schemaVersion === 3 ? encrypted.authIdentityHash : encrypted.authHash;
}
function encryptedCoordinateGeneration(encrypted) {
  return encrypted.schemaVersion === 3 ? encrypted.generation : null;
}
function reclaimStaleEncryptedCoordinate(coordinate, namespace, authId2, expectedContentSha256, environment) {
  const advanced = replaceCoordinateState(coordinate, namespace, authId2, coordinate.value.authIdentityHash, environment);
  if (!removePrivateStateFileIfUnchanged(secretPath(namespace, authId2, environment), { expectedCurrentContentSha256: expectedContentSha256 }, environment)) {
    throw new Error("stale encrypted session secret changed during generation recovery");
  }
  return advanced;
}
function decryptSessionSecret(encrypted, key) {
  const iv = boundedBase64(encrypted.iv, "session-secret IV", 12);
  const ciphertext = boundedBase64(encrypted.ciphertext, "session-secret ciphertext", MAX_PLAINTEXT_BYTES + 16);
  const tag = boundedBase64(encrypted.tag, "session-secret authentication tag", 16);
  if (iv.byteLength !== 12 || tag.byteLength !== 16) {
    throw new Error("encrypted session secret is malformed");
  }
  if (encrypted.schemaVersion !== 1 && encrypted.keyId !== key.id) {
    throw new Error("encrypted session state belongs to a different encryption key");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.value, iv);
    decipher.setAAD(additionalData(encrypted.schemaVersion, encrypted.schemaVersion === 1 ? null : encrypted.keyId, encrypted.namespace, encrypted.authId, encryptedAuthIdentityHash(encrypted), encrypted.schemaVersion === 3 ? encrypted.generation : null));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
      throw new Error("decrypted session secret exceeded its byte bound");
    }
    return plaintext;
  } catch (error) {
    if (error instanceof Error && error.message === "decrypted session secret exceeded its byte bound")
      throw error;
    throw new Error("encrypted session secret failed authentication");
  }
}
function parsedPlaintext(plaintext) {
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
    return value;
  } catch {
    throw new Error("decrypted session secret is malformed");
  }
}
function assertSessionKeyOwnsEncryptedStore(key, environment) {
  const sessionDirectory = directory(environment);
  const identity = ensurePrivateStateDirectory(sessionDirectory, environment);
  for (const entry of listPrivateStateDirectory(sessionDirectory, environment, identity)) {
    if (entry.name === SESSION_SECRET_COORDINATE_DIRECTORY && entry.kind === "directory")
      continue;
    if (entry.kind !== "file") {
      throw new Error("encrypted session store is malformed");
    }
    const text = readPrivateStateFileIfPresent(join2(sessionDirectory, entry.name), MAX_ENCRYPTED_BYTES, "encrypted session secret", environment, [identity]);
    if (text === null) {
      throw new Error("encrypted session store changed while validating its key");
    }
    const encrypted = parseEncryptedSessionSecret(text);
    if (entry.name !== `${encrypted.namespace}--${encrypted.authId}.json`) {
      throw new Error("encrypted session store is malformed");
    }
    parsedPlaintext(decryptSessionSecret(encrypted, key));
  }
}
function readSessionSecretSnapshot(namespace, authId2, authHash, environment = process.env) {
  validateCoordinate(namespace, authId2, authHash);
  return withReadProjectionAuthAdmission(authId2, environment, () => {
    const authIdentityHash = projectionAuthIdentityHash(authId2, authHash, environment);
    let coordinate = ensureCoordinateState(namespace, authId2, authIdentityHash, environment);
    ensurePrivateStateDirectory(directory(environment), environment);
    const text = readPrivateStateFileIfPresent(secretPath(namespace, authId2, environment), MAX_ENCRYPTED_BYTES, "encrypted session secret", environment);
    if (text === null) {
      if (coordinate.value.authIdentityHash !== authIdentityHash) {
        coordinate = replaceCoordinateState(coordinate, namespace, authId2, authIdentityHash, environment);
      }
      return Object.freeze({
        value: null,
        contentSha256: absentContentSha256(namespace, authId2, authIdentityHash, coordinate.value.generation)
      });
    }
    const contentSha256 = createHash2("sha256").update(text, "utf8").digest("hex");
    const encrypted = parseEncryptedSessionSecret(text);
    if (encrypted.namespace !== namespace || encrypted.authId !== authId2) {
      throw new Error("encrypted session secret is malformed");
    }
    const value = parsedPlaintext(decryptSessionSecret(encrypted, sessionKey(environment)));
    if (encryptedCoordinateGeneration(encrypted) !== coordinate.value.generation || coordinate.value.authIdentityHash === authIdentityHash && encryptedAuthIdentityHash(encrypted) !== authIdentityHash) {
      const recovered = reclaimStaleEncryptedCoordinate(coordinate, namespace, authId2, contentSha256, environment);
      return Object.freeze({
        value: null,
        contentSha256: absentContentSha256(namespace, authId2, recovered.value.authIdentityHash, recovered.value.generation)
      });
    }
    if (coordinate.value.authIdentityHash !== authIdentityHash) {
      return Object.freeze({ value: null, contentSha256 });
    }
    return Object.freeze({ value, contentSha256 });
  });
}

export { withSettledReadProjectionAuthAdmission, projectionAuthIdentityHash, writeSessionSecretIfUnchanged, readSessionSecretSnapshot };
