// @bun
import {
  summarizePlanFile
} from "./index-81sjy26h.js";
import {
  inspectLocalCliCleanupFilesystemReadiness,
  localCliCleanupProcessGroupStatus,
  localCliCleanupResourceExtends,
  parseLocalCliCleanupResourceIdentityV1
} from "./index-r9zhe6em.js";
import {
  projectionAuthIdentityHash,
  withSettledReadProjectionAuthAdmission
} from "./index-8qr77as7.js";
import {
  PreservedBrowserArtifactsError,
  browserCleanupResourceExtends,
  browserCleanupResourceRootStatus,
  parseBrowserCleanupResourceIdentity
} from "./index-d5mavmrj.js";
import {
  MAX_WRENCH_JSON_BYTES,
  createPrivateJsonIfAbsent,
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  isLocalCliOperation,
  isProviderOperation,
  isWebSessionOperation,
  listPrivateStateDirectory,
  loadInstalledManifest,
  manifestHash,
  parseRuntimeManifest,
  privateStateFilesMayExist,
  readPrivateStateFileIfPresent,
  readRegularFile,
  removePrivateDirectoryTree,
  removePrivateStateFileIfUnchanged,
  snapshotPrivateStateDirectory,
  writePrivateJsonIfUnchanged
} from "./index-0ywm1fj9.js";
import {
  currentProcessStartIdentity,
  processOwnerStatus
} from "./index-4bpemvnc.js";
import {
  localCliToolArtifactForCurrentRuntime,
  parseLocalCliToolIdentityV1
} from "./index-1r44fcqj.js";
import {
  isPortableProviderPluginVersion,
  isProviderPluginId,
  isProviderPluginOperationName,
  isProviderPluginSurfaceId
} from "./index-26yq8q16.js";
import {
  canonicalJson,
  sha256
} from "./index-8sbt8qwx.js";
import {
  __require
} from "./index-z1w83f81.js";

// src/messaging-automation-descriptors.ts
function automationPermissionOperation(operation) {
  if (["inspect", "conversations", "resolve", "history", "events"].includes(operation))
    return "messaging.automation.read";
  if (operation === "start")
    return "messaging.automation.sync";
  if (["text", "attachment", "reaction", "sticker", "link", "poll"].includes(operation))
    return `messaging.automation.send.${operation}`;
  throw new Error("This messaging action has no admitted host permission.");
}
function automationOperationDefinitions(provider) {
  const names = ["messaging.automation.read", ...provider === "whatsapp" ? ["messaging.automation.sync"] : [], ...["text", "attachment", "reaction", "sticker", "link", "poll"].map((kind) => `messaging.automation.send.${kind}`)];
  return names.map((name) => ({
    name,
    contractVersion: 1,
    risk: name.endsWith(".read") ? "R1" : name.endsWith(".sync") ? "R2" : "R3",
    input: { properties: {}, required: [] },
    sideEffect: name.endsWith(".read") ? "none" : name.endsWith(".sync") ? "Maintain an explicitly started linked-device sync session; may emit protocol acknowledgements." : "Submit one exact action through an enrolled conversation and an unexpired bounded owner grant; delivery remains unknown.",
    idempotency: name.endsWith(".read") ? "none" : "local-at-most-once",
    dedupeWindowMs: name.endsWith(".read") ? 0 : 86400000,
    state: "observed",
    dispatch: name.endsWith(".read") ? "none" : "single",
    implementation: "ghostget.messaging-automation/1 scoped owner host; managed allow plus exact account incarnation, provider closure, route, expiry, capacity, durable action claim and cleanup custody",
    validateInput: () => ["This permission is available only through ghostget messaging automation serve --stdio."],
    planDispatches: () => {
      throw new Error("Use the scoped messaging automation host.");
    }
  }));
}
function loadImsgAutomationRuntime() {
  return import("./imessage-automation-fes7fjf1.js");
}
function loadWhatsAppAutomationRuntime() {
  return import("./whatsapp-automation-ckmvtqxa.js");
}

// src/read-projections.ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "crypto";
import { lstatSync } from "fs";
import { join } from "path";
var STORE_DIRECTORY = "read-projections";
var OMNI_STORE_DIRECTORY = "omni-read-projections";
var CONTROL_DIRECTORY = "read-projection-control";
var KEY_FILE = ".projection-encryption-key";
var STORE_KEY_MARKER_FILE = "store-key.json";
var KEY_FILE_MAX_BYTES = 512;
var STORE_KEY_MARKER_MAX_BYTES = 512;
var INITIALIZATION_SETTLE_ATTEMPTS = 100;
var INITIALIZATION_SETTLE_WAIT_MS = 10;
var HEAD_MAX_BYTES = 16 * 1024;
var MANIFEST_MAX_BYTES = 64 * 1024;
var MAX_ATTRIBUTABLE_CORRUPT_FILE_BYTES = 4 * 1024 * 1024;
var MAX_PLAINTEXT_BYTES = 16 * 1024 * 1024;
var MAX_CHUNKS = 16;
var MAX_QUERY_DIRECTORY_ENTRIES = 2 * MAX_CHUNKS + 16;
var MAX_REALM_STORAGE_BYTES = 128 * 1024 * 1024;
var MAX_JSON_DEPTH = 64;
var MAX_JSON_NODES = 110000;
var MAX_FRESH_FOR_MS = 365 * 24 * 60 * 60 * 1000;
var authIdPattern = /^[a-z][a-z0-9-]{0,47}$/u;
var stateHelperArtifactNamePatterns = Object.freeze([
  /^\.io-write-[1-9][0-9]{0,9}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/u,
  /^\.io-mutation-[a-f0-9]{64}-(?:waiting|candidate|held)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.lock$/u,
  /^\.io-mutation-stage-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[1-9][0-9]{0,9}\.tmp$/u,
  /^\.io-remove-file-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.quarantine$/u,
  /^\.io-remove(?:-tree)?-[1-9][0-9]{0,9}-[1-9][0-9]{0,15}-[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}\.quarantine$/u
]);
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
function record(value, label) {
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
function safeString(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value.trim() !== value || [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  }))
    throw new Error(`${label} is malformed`);
  return value;
}
function authId(value) {
  if (typeof value !== "string" || !authIdPattern.test(value)) {
    throw new Error("read projection auth ID must be lowercase kebab-case");
  }
  return value;
}
function boundedJson(value, label) {
  let nodes = 0;
  const ancestors = new WeakSet;
  const visit = (candidate, depth) => {
    nodes += 1;
    if (nodes > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
      throw new Error(`${label} exceeds its structural bound`);
    }
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "string")
      return candidate;
    if (typeof candidate === "number" && Number.isFinite(candidate))
      return candidate;
    if (typeof candidate !== "object") {
      throw new Error(`${label} must contain only JSON data`);
    }
    if (ancestors.has(candidate))
      throw new Error(`${label} must not be circular`);
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        if (Object.getPrototypeOf(candidate) !== Array.prototype) {
          throw new Error(`${label} arrays must use the standard prototype`);
        }
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) {
          throw new Error(`${label} arrays have unsupported symbol fields`);
        }
        const lengthDescriptor = descriptors.length;
        if (lengthDescriptor === undefined || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number" || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0)
          throw new Error(`${label} arrays are malformed`);
        const length = lengthDescriptor.value;
        const keys = Object.keys(descriptors).filter((key) => key !== "length");
        if (keys.length !== length || keys.some((key, index) => key !== String(index)))
          throw new Error(`${label} arrays must be dense data arrays`);
        const cloned3 = [];
        for (let index = 0;index < length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor))
            throw new Error(`${label} arrays must contain only data elements`);
          cloned3.push(visit(descriptor.value, depth + 1));
        }
        return cloned3;
      }
      const data = record(candidate, label);
      const cloned2 = {};
      for (const [key, item] of Object.entries(data).sort(([left], [right]) => left.localeCompare(right))) {
        Object.defineProperty(cloned2, key, {
          value: visit(item, depth + 1),
          enumerable: true,
          configurable: false,
          writable: false
        });
      }
      return cloned2;
    } finally {
      ancestors.delete(candidate);
    }
  };
  const cloned = visit(value, 0);
  if (Buffer.byteLength(canonicalJson(cloned), "utf8") > MAX_PLAINTEXT_BYTES) {
    throw new Error(`${label} exceeds its byte bound`);
  }
  return cloned;
}
function hashBytes(value) {
  return createHash("sha256").update(value).digest("hex");
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
  return join(ghostgetStateHome(environment), STORE_DIRECTORY);
}
function omniStoreDirectory(environment) {
  return join(ghostgetStateHome(environment), OMNI_STORE_DIRECTORY);
}
function keyPath(environment) {
  return join(ghostgetStateHome(environment), KEY_FILE);
}
function controlDirectory(environment) {
  return join(ghostgetStateHome(environment), CONTROL_DIRECTORY);
}
function storeKeyMarkerPath(environment) {
  return join(controlDirectory(environment), STORE_KEY_MARKER_FILE);
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
    const value = record(JSON.parse(text), "read projection store key marker");
    exactKeys(value, ["schemaVersion", "keyId", "authentication"], "read projection store key marker");
    if (value.schemaVersion !== 1) {
      throw new Error("unsupported read projection store key marker");
    }
    marker = Object.freeze({
      schemaVersion: 1,
      keyId: hexDigest(value.keyId, "read projection store key marker key ID"),
      authentication: hexDigest(value.authentication, "read projection store key marker authentication")
    });
    if (text !== `${canonicalJson(marker)}
`) {
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
  const key = randomBytes(32);
  return Object.freeze({
    schemaVersion: 1,
    keyId: projectionKeyId(key),
    key: key.toString("hex")
  });
}
function parseProjectionKey(text) {
  try {
    const value = record(JSON.parse(text), "projection encryption key");
    exactKeys(value, ["schemaVersion", "keyId", "key"], "projection encryption key");
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
  const directory = storeDirectory(environment);
  const identity = ensureProjectionStateDirectory(directory, environment);
  const exactHasState = listPrivateStateDirectory(directory, environment, identity, { recoverOrphanedMutationClaims: true }).length > 0;
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
    const controlIdentity = ensureProjectionStateDirectory(controlDirectory(environment), environment);
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
function parseIdentity(value) {
  const identity = record(value, "read projection query identity");
  exactKeys(identity, ["adapter", "operation", "input", "inputHash", "auth", "contract"], "read projection query identity");
  const adapter = record(identity.adapter, "read projection adapter");
  exactKeys(adapter, ["id", "version", "hash"], "read projection adapter");
  const auth = record(identity.auth, "read projection auth");
  exactKeys(auth, ["id", "kind", "hash", "subject"], "read projection auth");
  const contract = record(identity.contract, "read projection contract");
  exactKeys(contract, contract.transport === "local-cli" ? ["transport", "hash", "tool"] : ["transport", "hash"], "read projection contract");
  const input = boundedJson(identity.input, "read projection input");
  const inputHash = hexDigest(identity.inputHash, "read projection input hash");
  if (hashBytes(canonicalJson(input)) !== inputHash) {
    throw new Error("read projection input is not hash-bound");
  }
  const transport = contract.transport;
  if (transport !== "browser" && transport !== "portable-provider-plugin" && transport !== "provider-api" && transport !== "reviewed-template-api" && transport !== "web-session-api" && transport !== "local-cli")
    throw new Error("read projection contract transport is malformed");
  const contractHash = hexDigest(contract.hash, "read projection contract hash");
  const parsedContract = transport === "local-cli" ? Object.freeze({
    transport,
    hash: contractHash,
    tool: parseLocalCliToolIdentityV1(contract.tool)
  }) : Object.freeze({ transport, hash: contractHash });
  return Object.freeze({
    adapter: Object.freeze({
      id: safeString(adapter.id, "read projection adapter ID", 64),
      version: safeString(adapter.version, "read projection adapter version", 64),
      hash: hexDigest(adapter.hash, "read projection adapter hash")
    }),
    operation: safeString(identity.operation, "read projection operation", 128),
    input,
    inputHash,
    auth: Object.freeze({
      id: authId(auth.id),
      kind: safeString(auth.kind, "read projection auth kind", 64),
      hash: hexDigest(auth.hash, "read projection auth hash"),
      subject: safeString(auth.subject, "read projection auth subject", 512)
    }),
    contract: parsedContract
  });
}
function queryForIdentity(identityValue, environment, projectionKeyValue) {
  const identity = parseIdentity(identityValue);
  const key = projectionKeyValue ?? projectionKey(environment, true);
  if (key === null)
    throw new Error("projection encryption key is unavailable");
  return Object.freeze({
    key: hmac(key.value, "wrench-read-projection-query-v1", canonicalJson(identity)),
    realmKey: hmac(key.value, "wrench-read-projection-realm-v1", identity.auth.id),
    identity
  });
}
function createReadProjectionQuery(identity, environment = process.env) {
  return queryForIdentity(identity, environment);
}
function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is malformed`);
  }
}
function privatePayloadAdditionalData(keyId, domain) {
  if (domain.length < 1 || Buffer.byteLength(domain, "utf8") > 256 || /[\0\r\n]/u.test(domain))
    throw new Error("authenticated private payload domain is malformed");
  return Buffer.from(canonicalJson({
    schemaVersion: 1,
    format: "wrench.authenticated-private-payload-aad",
    keyId,
    domain
  }), "utf8");
}
function sealAuthenticatedPrivatePayload(value, domain, environment = process.env, maximumPlaintextBytes = 2 * 1024 * 1024) {
  const plaintext = Buffer.from(canonicalJson(value), "utf8");
  if (!Number.isSafeInteger(maximumPlaintextBytes) || maximumPlaintextBytes < 1 || plaintext.byteLength > maximumPlaintextBytes)
    throw new Error("authenticated private payload exceeds its plaintext bound");
  const key = projectionKey(environment, true);
  if (key === null)
    throw new Error("projection encryption key is unavailable");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key.value, iv);
  cipher.setAAD(privatePayloadAdditionalData(key.id, domain));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Object.freeze({
    schemaVersion: 1,
    encryption: "aes-256-gcm",
    keyId: key.id,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  });
}
function privatePayloadBase64(value, label, maximumBytes) {
  if (typeof value !== "string" || value.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value))
    throw new Error(`${label} is malformed`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength > maximumBytes || decoded.toString("base64") !== value)
    throw new Error(`${label} is malformed`);
  return decoded;
}
function openAuthenticatedPrivatePayload(value, domain, environment = process.env, maximumPlaintextBytes = 2 * 1024 * 1024) {
  const source = record(value, "authenticated private payload");
  exactKeys(source, [
    "schemaVersion",
    "encryption",
    "keyId",
    "iv",
    "ciphertext",
    "tag"
  ], "authenticated private payload");
  if (source.schemaVersion !== 1 || source.encryption !== "aes-256-gcm" || !Number.isSafeInteger(maximumPlaintextBytes) || maximumPlaintextBytes < 1)
    throw new Error("authenticated private payload is malformed");
  const keyId = hexDigest(source.keyId, "authenticated private payload key ID");
  const key = projectionKey(environment, false);
  if (key === null || key.id !== keyId) {
    throw new Error("authenticated private payload encryption key is unavailable");
  }
  const iv = privatePayloadBase64(source.iv, "authenticated private payload IV", 12);
  const tag = privatePayloadBase64(source.tag, "authenticated private payload tag", 16);
  const ciphertext = privatePayloadBase64(source.ciphertext, "authenticated private payload ciphertext", maximumPlaintextBytes + 16);
  if (iv.byteLength !== 12 || tag.byteLength !== 16) {
    throw new Error("authenticated private payload is malformed");
  }
  let plaintext;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key.value, iv);
    decipher.setAAD(privatePayloadAdditionalData(key.id, domain));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("authenticated private payload failed authentication");
  }
  if (plaintext.byteLength > maximumPlaintextBytes) {
    throw new Error("authenticated private payload exceeds its plaintext bound");
  }
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw new Error("authenticated private payload plaintext is malformed");
  }
  return parseJson(decoded, "authenticated private payload plaintext");
}

// src/auth.ts
import { createHash as createHash2 } from "crypto";
import {
  existsSync,
  lstatSync as lstatSync2,
  realpathSync
} from "fs";
import {
  basename,
  dirname,
  isAbsolute,
  join as join2,
  resolve
} from "path";
import { cookieSources } from "@hraness/kb/clip/args";
function authPath(id, environment) {
  if (!/^[a-z][a-z0-9-]{0,47}$/u.test(id))
    throw new Error("auth ID must be lowercase kebab-case");
  return join2(ghostgetStateHome(environment), "auth", `${id}.json`);
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
function deriveLinkedDeviceRealmKey(provider, canonicalStorePath) {
  return createHash2("sha256").update("io-linked-device-realm-v1\x00", "utf8").update(canonicalJson({
    kind: "linked-device-store",
    provider,
    storePath: canonicalStorePath
  }), "utf8").digest("hex");
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
function exactKeys2(value, expected) {
  const keys = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return keys.length === allowed.length && keys.every((key, index) => key === allowed[index]);
}
function parseAuth(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("auth record must be an object");
  const record2 = value;
  if (record2.schemaVersion !== 1 || !isSafeString(record2.id, 48) || !/^[a-z][a-z0-9-]*$/u.test(record2.id)) {
    throw new Error("auth record has an invalid schema version or ID");
  }
  if (record2.kind === "cookie-source") {
    const expected = ["schemaVersion", "id", "kind", "source"];
    if (record2.profile !== undefined)
      expected.push("profile");
    if (record2.subject !== undefined)
      expected.push("subject");
    if (!exactKeys2(record2, expected))
      throw new Error("auth record has unsupported fields");
    if (typeof record2.source !== "string" || !cookieSources.includes(record2.source)) {
      throw new Error("auth record has an invalid cookie source");
    }
    if (record2.profile !== undefined && !isSafeString(record2.profile, 4096))
      throw new Error("auth record has an invalid profile");
    if (typeof record2.profile === "string" && (record2.profile.includes("/") || record2.profile.includes("\\")) && !isAbsolute(record2.profile))
      throw new Error("auth record cookie profile paths must be absolute");
    if (record2.subject !== undefined && typeof record2.subject !== "string") {
      throw new Error("auth record has an invalid subject");
    }
    const subject = typeof record2.subject === "string" ? normalizeAuthSubject(record2.subject) : undefined;
    return {
      schemaVersion: 1,
      id: record2.id,
      kind: "cookie-source",
      source: record2.source,
      ...typeof record2.profile !== "string" ? {} : { profile: record2.profile },
      ...subject === undefined ? {} : { subject }
    };
  }
  if (record2.kind === "cookies-file") {
    const expected = ["schemaVersion", "id", "kind", "path"];
    if (record2.subject !== undefined)
      expected.push("subject");
    if (!exactKeys2(record2, expected))
      throw new Error("auth record has unsupported fields");
    if (!isSafeString(record2.path, 4096) || !isAbsolute(record2.path))
      throw new Error("auth record has an invalid or non-absolute cookie file path");
    if (record2.subject !== undefined && typeof record2.subject !== "string") {
      throw new Error("auth record has an invalid subject");
    }
    const subject = typeof record2.subject === "string" ? normalizeAuthSubject(record2.subject) : undefined;
    return {
      schemaVersion: 1,
      id: record2.id,
      kind: "cookies-file",
      path: record2.path,
      ...subject === undefined ? {} : { subject }
    };
  }
  if (record2.kind === "browser-profile") {
    const expected = ["schemaVersion", "id", "kind", "profile", "trustUnfilteredEgress"];
    if (record2.browserExecutable !== undefined)
      expected.push("browserExecutable");
    if (record2.cookieSource !== undefined)
      expected.push("cookieSource");
    if (record2.cookieProfile !== undefined)
      expected.push("cookieProfile");
    if (record2.subject !== undefined)
      expected.push("subject");
    if (!exactKeys2(record2, expected))
      throw new Error("auth record has unsupported fields");
    if (!isSafeString(record2.profile, 4096) || !isSafeBrowserProfile(record2.profile) || record2.trustUnfilteredEgress !== true) {
      throw new Error("auth record has an invalid browser profile or trust acknowledgement");
    }
    if ((record2.profile.includes("/") || record2.profile.includes("\\")) && !isAbsolute(record2.profile)) {
      throw new Error("auth record browser profile paths must be absolute");
    }
    if (record2.browserExecutable !== undefined && (!isSafeAuthPath(record2.browserExecutable) || !isAbsolute(record2.browserExecutable) || record2.browserExecutable.trim() !== record2.browserExecutable))
      throw new Error("auth record has an invalid browser executable");
    if (record2.cookieSource !== undefined && (typeof record2.cookieSource !== "string" || !cookieSources.includes(record2.cookieSource)))
      throw new Error("auth record has an invalid browser-profile cookie source");
    if (record2.cookieProfile !== undefined && (record2.cookieSource === undefined || !isSafeString(record2.cookieProfile, 4096)))
      throw new Error("auth record has an invalid browser-profile cookie profile");
    if (record2.subject !== undefined && typeof record2.subject !== "string") {
      throw new Error("auth record has an invalid subject");
    }
    const subject = typeof record2.subject === "string" ? normalizeAuthSubject(record2.subject) : undefined;
    return {
      schemaVersion: 1,
      id: record2.id,
      kind: "browser-profile",
      profile: record2.profile,
      ...typeof record2.browserExecutable !== "string" ? {} : { browserExecutable: record2.browserExecutable },
      trustUnfilteredEgress: true,
      ...typeof record2.cookieSource !== "string" ? {} : { cookieSource: record2.cookieSource },
      ...typeof record2.cookieProfile !== "string" ? {} : { cookieProfile: record2.cookieProfile },
      ...subject === undefined ? {} : { subject }
    };
  }
  if (record2.kind === "oauth-token-file") {
    const expected = ["schemaVersion", "id", "kind", "provider", "path", "scopes"];
    if (record2.managed !== undefined)
      expected.push("managed");
    if (record2.ownedImport !== undefined)
      expected.push("ownedImport");
    if (record2.subject !== undefined)
      expected.push("subject");
    if (!exactKeys2(record2, expected))
      throw new Error("auth record has unsupported fields");
    if (!isProviderPluginSurfaceId(record2.provider)) {
      throw new Error("auth record has an invalid OAuth provider");
    }
    if (!isSafeOAuthTokenPath(record2.path) || !isAbsolute(record2.path)) {
      throw new Error("auth record has an invalid or non-absolute OAuth token file path");
    }
    if (record2.managed !== undefined && record2.managed !== true) {
      throw new Error("auth record has an invalid managed OAuth lifecycle marker");
    }
    if (record2.ownedImport !== undefined && (record2.ownedImport !== true || record2.managed !== undefined || record2.provider !== "x" || typeof record2.subject !== "string" || !/^[0-9]{1,19}$/u.test(record2.subject))) {
      throw new Error("auth record has an invalid owned token import marker");
    }
    const rawScopes = record2.scopes;
    if (!Array.isArray(rawScopes) || !rawScopes.every((scope) => typeof scope === "string")) {
      throw new Error("auth record has invalid OAuth scopes");
    }
    const scopes = normalizeOAuthScopes(rawScopes);
    if (scopes.some((scope, index) => scope !== rawScopes[index])) {
      throw new Error("auth record OAuth scopes must be sorted");
    }
    if (record2.subject !== undefined && typeof record2.subject !== "string") {
      throw new Error("auth record has an invalid OAuth subject");
    }
    const subject = typeof record2.subject === "string" ? normalizeAuthSubject(record2.subject) : undefined;
    return {
      schemaVersion: 1,
      id: record2.id,
      kind: "oauth-token-file",
      provider: record2.provider,
      path: record2.path,
      scopes,
      ...record2.managed === true ? { managed: true } : {},
      ...record2.ownedImport === true ? { ownedImport: true } : {},
      ...subject === undefined ? {} : { subject }
    };
  }
  if (record2.kind === "linked-device-store") {
    const expected = ["schemaVersion", "id", "kind", "provider", "path"];
    if (record2.realmKey !== undefined)
      expected.push("realmKey");
    if (record2.subject !== undefined)
      expected.push("subject");
    if (!exactKeys2(record2, expected))
      throw new Error("auth record has unsupported fields");
    if (!isProviderPluginSurfaceId(record2.provider)) {
      throw new Error("auth record has an invalid linked-device provider");
    }
    if (!isSafeAuthPath(record2.path) || !isAbsolute(record2.path)) {
      throw new Error("auth record has an invalid or non-absolute linked-device store path");
    }
    const canonicalPath = canonicalLinkedDeviceStorePath(record2.path);
    if (record2.realmKey !== undefined && canonicalPath !== record2.path) {
      throw new Error("auth record linked-device store path must be canonical");
    }
    if (record2.realmKey !== undefined && (typeof record2.realmKey !== "string" || !/^[a-f0-9]{64}$/u.test(record2.realmKey))) {
      throw new Error("auth record has an invalid linked-device realm key");
    }
    const realmKey = deriveLinkedDeviceRealmKey(record2.provider, canonicalPath);
    if (typeof record2.realmKey === "string" && record2.realmKey !== realmKey) {
      throw new Error("auth record linked-device realm key does not match its provider and canonical store path");
    }
    if (record2.subject !== undefined && typeof record2.subject !== "string") {
      throw new Error("auth record has an invalid linked-device subject");
    }
    const subject = typeof record2.subject === "string" ? normalizeAuthSubject(record2.subject) : undefined;
    return {
      schemaVersion: 1,
      id: record2.id,
      kind: "linked-device-store",
      provider: record2.provider,
      path: record2.path,
      ...record2.realmKey === undefined ? {} : { realmKey },
      ...subject === undefined ? {} : { subject }
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
    contentSha256: createHash2("sha256").update(content, "utf8").digest("hex")
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
  if (content !== `${canonicalJson(snapshot.auth)}
`) {
    throw new Error("auth record is not canonical JSON");
  }
  return Object.freeze({
    auth: snapshot.auth,
    contentSha256: createHash2("sha256").update(content, "utf8").digest("hex")
  });
}
function loadAuthSnapshotIfPresent(id, environment) {
  const content = readPrivateStateFileIfPresent(authPath(id, environment), MAX_WRENCH_JSON_BYTES, "auth record", environment);
  return content === null ? null : parseAuthSnapshotText(id, content);
}
function loadAuthSnapshot(id, environment = process.env) {
  const snapshot = loadAuthSnapshotIfPresent(id, environment);
  if (snapshot === null)
    throw new Error(`auth locator ${id} was not found`);
  return snapshot;
}
function loadAuth(id, environment = process.env) {
  return loadAuthSnapshot(id, environment).auth;
}

// src/provider-contracts.ts
import { createHash as createHash3 } from "crypto";
function stableJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("provider contract contains a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const record2 = value;
    return `{${Object.keys(record2).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record2[key])}`).join(",")}}`;
  }
  throw new Error("provider contract contains an unsupported value");
}
function requireProviderOperation(recipe, registry) {
  const resolution = registry.resolveOperationDefinition("provider-api", recipe.provider, recipe.action, recipe.contractVersion);
  if (resolution === undefined || resolution.binding.transport !== "provider-api") {
    throw new Error(`official provider contract ${recipe.provider}/${recipe.action}@${recipe.contractVersion} is not installed`);
  }
  return {
    ...resolution,
    operation: resolution.operation
  };
}
function projectProviderContract(provider, operationName, contractVersion, registry) {
  const recipe = {
    provider,
    action: operationName,
    contractVersion
  };
  const { operation } = requireProviderOperation(recipe, registry);
  return Object.freeze({
    provider,
    operation: operation.name,
    contractVersion,
    risk: operation.risk,
    sideEffect: operation.sideEffect,
    idempotency: operation.idempotency,
    dedupeWindowMs: operation.dedupeWindowMs,
    input: operation.input,
    state: operation.state,
    requiredScopeSets: operation.requiredScopeSets,
    dispatch: operation.dispatch,
    coverage: operation.coverage,
    implementation: operation.implementation
  });
}
var providerContractCaches = new WeakMap;
function providerContractCache(registry) {
  const existing = providerContractCaches.get(registry);
  if (existing !== undefined)
    return existing;
  const created = new Map;
  providerContractCaches.set(registry, created);
  return created;
}
function providerContractKey(recipe) {
  return `${recipe.provider}/${recipe.action}@${recipe.contractVersion}`;
}
function getProviderContract(recipe, registry) {
  const resolution = requireProviderOperation(recipe, registry);
  const key = providerContractKey(recipe);
  const existing = providerContractCache(registry).get(key);
  if (existing !== undefined)
    return existing;
  const projected = projectProviderContract(recipe.provider, resolution.operation.name, resolution.contractVersion, registry);
  providerContractCache(registry).set(key, projected);
  return projected;
}
function providerContractHash(contract, registry) {
  const { binding } = requireProviderOperation({
    provider: contract.provider,
    action: contract.operation,
    contractVersion: contract.contractVersion
  }, registry);
  return createHash3("sha256").update(stableJson(contract)).update("\x00").update(registry.contractImplementationHash(binding)).digest("hex");
}
function planProviderDispatches(recipe, input, registry) {
  getProviderContract(recipe, registry);
  return requireProviderOperation(recipe, registry).operation.planDispatches(input);
}
function providerConditionalInputIssues(recipe, input, registry) {
  getProviderContract(recipe, registry);
  return requireProviderOperation(recipe, registry).operation.validateInput(input);
}

// src/web-session-contracts.ts
import { createHash as createHash4 } from "crypto";
function stableJson2(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("authenticated web contract contains a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map(stableJson2).join(",")}]`;
  if (typeof value === "object") {
    const record2 = value;
    return `{${Object.keys(record2).sort().map((key) => `${JSON.stringify(key)}:${stableJson2(record2[key])}`).join(",")}}`;
  }
  throw new Error("authenticated web contract contains an unsupported value");
}
var currentMarketplaceCursorDescription = "wrench-issued authenticated cursor returned by a complete prior Marketplace page; one chain supports at most 48 provider pages";
var predecessorMarketplaceCursorDescription = "oh-issued authenticated cursor returned by a complete prior Marketplace page; one chain supports at most 48 provider pages";
function predecessorCompatibleWebSessionContractValue(contract) {
  const isExactPredecessorMarketplaceFeedVersion = contract.contractVersion === 1 || contract.contractVersion === 2;
  if (contract.site !== "facebook-marketplace" || contract.operation !== "feeds.read" || !isExactPredecessorMarketplaceFeedVersion)
    return contract;
  const project = (value) => {
    if (value === currentMarketplaceCursorDescription) {
      return predecessorMarketplaceCursorDescription;
    }
    if (Array.isArray(value))
      return value.map(project);
    if (typeof value !== "object" || value === null)
      return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, project(entry)]));
  };
  return project(contract);
}
function hashWebSessionContractWithImplementation(contract, implementationHash) {
  return createHash4("sha256").update(stableJson2(predecessorCompatibleWebSessionContractValue(contract))).update("\x00").update(implementationHash).digest("hex");
}
function requireWebSessionOperation(recipe, registry) {
  const binding = registry.resolveSessionRoute(recipe.site);
  const resolution = binding === undefined ? undefined : registry.resolveOperationDefinition(binding.transport, recipe.site, recipe.action, recipe.contractVersion);
  if (resolution === undefined || resolution.binding.transport === "provider-api") {
    throw new Error(`authenticated web contract ${recipe.site}/${recipe.action}@${recipe.contractVersion} is not installed`);
  }
  return {
    ...resolution,
    operation: resolution.operation
  };
}
function projectWebSessionContract(site, operationName, contractVersion, registry) {
  const { operation } = requireWebSessionOperation({
    site,
    action: operationName,
    contractVersion
  }, registry);
  return Object.freeze({
    site,
    operation: operation.name,
    contractVersion,
    risk: operation.risk,
    input: operation.input,
    sideEffect: operation.sideEffect,
    idempotency: operation.idempotency,
    dedupeWindowMs: operation.dedupeWindowMs,
    state: operation.state,
    dispatch: operation.dispatch,
    implementation: operation.implementation
  });
}
var webSessionContractCaches = new WeakMap;
function webSessionContractCache(registry) {
  const existing = webSessionContractCaches.get(registry);
  if (existing !== undefined)
    return existing;
  const created = new Map;
  webSessionContractCaches.set(registry, created);
  return created;
}
function webSessionContractKey(recipe) {
  return `${recipe.site}/${recipe.action}@${recipe.contractVersion}`;
}
function getWebSessionContract(recipe, registry) {
  const resolution = requireWebSessionOperation(recipe, registry);
  const key = webSessionContractKey(recipe);
  const existing = webSessionContractCache(registry).get(key);
  if (existing !== undefined)
    return existing;
  const projected = projectWebSessionContract(recipe.site, recipe.action, resolution.contractVersion, registry);
  webSessionContractCache(registry).set(key, projected);
  return projected;
}
function webSessionContractHash(contract, registry) {
  const { binding } = requireWebSessionOperation({
    site: contract.site,
    action: contract.operation,
    contractVersion: contract.contractVersion
  }, registry);
  return hashWebSessionContractWithImplementation(contract, registry.contractImplementationHash(binding));
}

// src/local-cli-contracts.ts
import { createHash as createHash5 } from "crypto";
import { types as nodeTypes } from "util";
function hasWellFormedUnicode(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      if (index + 1 >= value.length)
        return false;
      const next = value.charCodeAt(index + 1);
      if (next < 56320 || next > 57343)
        return false;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return false;
  }
  return true;
}
function strictIdentityRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)) {
    throw new Error("local CLI contract identity must be an object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("local CLI contract identity has an unsupported prototype");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) {
    throw new Error("local CLI contract identity has unsupported symbol fields");
  }
  const result = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !("value" in descriptor) || !hasWellFormedUnicode(key) || /[\u0000-\u001f\u007f-\u009f]/u.test(key)) {
      throw new Error("local CLI contract identity has unsupported accessor fields");
    }
    result[key] = descriptor.value;
  }
  return result;
}
function parseLocalCliContractIdentityV1(value) {
  const record2 = strictIdentityRecord(value);
  const keys = Object.keys(record2).sort();
  if (keys.join("\x00") !== ["action", "hash", "surface", "tool", "version"].sort().join("\x00")) {
    throw new Error("local CLI contract identity has unsupported fields");
  }
  if (!isProviderPluginSurfaceId(record2.surface) || !isProviderPluginOperationName(record2.action) || typeof record2.version !== "number" || !Number.isSafeInteger(record2.version) || record2.version < 1 || record2.version > 1e6 || typeof record2.hash !== "string" || !/^[a-f0-9]{64}$/u.test(record2.hash)) {
    throw new Error("local CLI contract identity is malformed");
  }
  return Object.freeze({
    surface: record2.surface,
    action: record2.action,
    version: record2.version,
    hash: record2.hash,
    tool: parseLocalCliToolIdentityV1(record2.tool)
  });
}
function stableJson3(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("local CLI contract contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map(stableJson3).join(",")}]`;
  if (typeof value === "object") {
    const record2 = value;
    return `{${Object.keys(record2).sort().map((key) => `${JSON.stringify(key)}:${stableJson3(record2[key])}`).join(",")}}`;
  }
  throw new Error("local CLI contract contains an unsupported value");
}
function requireLocalCliOperation(recipe, registry) {
  const resolution = registry.resolveOperationDefinition("local-cli", recipe.surface, recipe.action, recipe.contractVersion);
  if (resolution === undefined || resolution.binding.transport !== "local-cli") {
    throw new Error(`local CLI contract ${recipe.surface}/${recipe.action}@${recipe.contractVersion} is not installed`);
  }
  return {
    ...resolution,
    binding: resolution.binding,
    operation: resolution.operation
  };
}
var caches = new WeakMap;
function cache(registry) {
  const current = caches.get(registry);
  if (current !== undefined)
    return current;
  const created = new Map;
  caches.set(registry, created);
  return created;
}
function key(recipe) {
  return `${recipe.surface}/${recipe.action}@${recipe.contractVersion}`;
}
function getLocalCliContract(recipe, registry) {
  const resolution = requireLocalCliOperation(recipe, registry);
  const contractKey = key(recipe);
  const current = cache(registry).get(contractKey);
  if (current !== undefined)
    return current;
  const contract = Object.freeze({
    surface: recipe.surface,
    operation: resolution.operation.name,
    contractVersion: resolution.contractVersion,
    risk: resolution.operation.risk,
    input: resolution.operation.input,
    sideEffect: resolution.operation.sideEffect,
    idempotency: resolution.operation.idempotency,
    dedupeWindowMs: resolution.operation.dedupeWindowMs,
    state: resolution.operation.state,
    dispatch: resolution.operation.dispatch,
    implementation: resolution.operation.implementation,
    tool: resolution.binding.tool
  });
  cache(registry).set(contractKey, contract);
  return contract;
}
function localCliContractHash(contract, registry) {
  const { binding } = requireLocalCliOperation({
    surface: contract.surface,
    action: contract.operation,
    contractVersion: contract.contractVersion
  }, registry);
  return createHash5("sha256").update(stableJson3(contract)).update("\x00").update(registry.contractImplementationHash(binding)).digest("hex");
}
function localCliContractIdentity(recipe, registry) {
  const contract = getLocalCliContract(recipe, registry);
  return Object.freeze({
    surface: contract.surface,
    action: contract.operation,
    version: contract.contractVersion,
    hash: localCliContractHash(contract, registry),
    tool: contract.tool
  });
}

// src/provider-plugin-auth.ts
function requireProviderPluginAuth(binding, auth) {
  if (!binding.authKinds.includes(auth.kind)) {
    throw new Error(`provider plugin surface ${binding.surfaceId} does not accept ${auth.kind} auth`);
  }
  if ((auth.kind === "oauth-token-file" || auth.kind === "linked-device-store") && auth.provider !== binding.surfaceId) {
    throw new Error(`auth locator ${auth.id} is for ${auth.provider}, not ${binding.surfaceId}`);
  }
}

// src/web-session-authentication-policy.ts
var PUBLIC_WEB_SESSION_AUTHORITY_KIND = "public-web-session";
var requiredPolicy = Object.freeze({ kind: "required" });
function publicWebSessionInvocationAuthority(adapterId, operationId) {
  const coordinate = Object.freeze({
    adapter: adapterId,
    operation: operationId
  });
  return Object.freeze({
    schemaVersion: 1,
    id: `public-${sha256(canonicalJson(coordinate)).slice(0, 32)}`,
    kind: PUBLIC_WEB_SESSION_AUTHORITY_KIND,
    subject: `public:${adapterId}:${operationId}`
  });
}
function webSessionAuthenticationPolicy(context) {
  if (context.access === "public") {
    if (context.pluginSourceKind !== "built-in" || context.portable || context.risk !== "R1" || context.state !== "observed" || context.dispatch !== "none") {
      throw new Error("public web-session access requires an observed dispatch-free built-in R1 operation");
    }
    return Object.freeze({
      kind: "public",
      authority: publicWebSessionInvocationAuthority(context.adapterId, context.operationId)
    });
  }
  return requiredPolicy;
}
function isPublicWebSessionInvocationAuthority(value) {
  return value.kind === PUBLIC_WEB_SESSION_AUTHORITY_KIND;
}
function parsePublicWebSessionInvocationAuthority(value, expected) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("public web-session invocation authority must be an object");
  const record2 = value;
  const keys = Object.keys(record2).sort();
  if (keys.length !== 4 || keys[0] !== "id" || keys[1] !== "kind" || keys[2] !== "schemaVersion" || keys[3] !== "subject" || record2.schemaVersion !== 1 || record2.id !== expected.id || record2.kind !== expected.kind || record2.subject !== expected.subject) {
    throw new Error("public web-session invocation authority is malformed");
  }
  return expected;
}
function publicWebSessionAuthorityIdentityHash(authority) {
  return sha256(`wrench-public-web-session-authority-v1\x00${canonicalJson(authority)}`);
}
function persistedAuthAuthority(authority, message = "operation requires a persisted auth locator") {
  if (isPublicWebSessionInvocationAuthority(authority)) {
    throw new Error(message);
  }
  return authority;
}

// src/operation-permission-store.ts
import { join as join3 } from "path";
var MAX_POLICY_BYTES = 512 * 1024;
var MAX_ENTRIES = 4096;
var DIGEST = /^[a-f0-9]{64}$/u;
var marker = Object.freeze({ schemaVersion: 1, managed: true });

class OperationPermissionError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "OperationPermissionError";
  }
}
function parseOperationPolicy(value) {
  const fail = () => {
    throw new OperationPermissionError("OPERATION_POLICY_INVALID", "Operation permission policy is invalid; repair it in Ghostget before execution.");
  };
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return fail();
  const record2 = value;
  if (Object.keys(record2).sort().join(",") !== "entries,revision,schemaVersion" || record2.schemaVersion !== 1 || !Number.isSafeInteger(record2.revision) || record2.revision < 1 || !Array.isArray(record2.entries) || record2.entries.length > MAX_ENTRIES)
    return fail();
  let previous = "";
  const entries = record2.entries.map((candidate) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
      return fail();
    const entry = candidate;
    if (Object.keys(entry).sort().join(",") !== "decision,digest" || typeof entry.digest !== "string" || !DIGEST.test(entry.digest) || entry.digest <= previous || entry.decision !== "allow" && entry.decision !== "deny" && entry.decision !== "ask")
      return fail();
    previous = entry.digest;
    return Object.freeze({ digest: entry.digest, decision: entry.decision });
  });
  return Object.freeze({ schemaVersion: 1, revision: record2.revision, entries: Object.freeze(entries) });
}
function paths(environment) {
  const directory = join3(ghostgetStateHome(environment), "operation-permissions");
  return { directory, marker: join3(directory, "managed.json"), policy: join3(directory, "policy.json") };
}
function readOperationPolicy(environment = process.env) {
  try {
    if (!privateStateFilesMayExist("operation-permissions", ["managed.json", "policy.json"], environment)) {
      return Object.freeze({ managed: false, revision: 0, entries: Object.freeze([]), contentSha256: null });
    }
    const selected = paths(environment);
    const markerText = readPrivateStateFileIfPresent(selected.marker, 256, "operation policy marker", environment);
    if (markerText !== null && markerText !== `${canonicalJson(marker)}
`)
      throw new Error("marker");
    const text = readPrivateStateFileIfPresent(selected.policy, MAX_POLICY_BYTES, "operation permission policy", environment);
    if (text === null) {
      if (markerText !== null)
        throw new Error("missing policy");
      return Object.freeze({ managed: false, revision: 0, entries: Object.freeze([]), contentSha256: null });
    }
    const policy = parseOperationPolicy(JSON.parse(text));
    if (text !== `${canonicalJson(policy)}
`)
      throw new Error("noncanonical policy");
    return Object.freeze({ managed: true, revision: policy.revision, entries: policy.entries, contentSha256: sha256(text) });
  } catch {
    throw new OperationPermissionError("OPERATION_POLICY_INVALID", "Operation permission state is missing or invalid; execution is blocked until it is repaired.");
  }
}

// src/provider-plugin.ts
import { createHash as createHash8 } from "crypto";
import {
  closeSync,
  constants,
  existsSync as existsSync2,
  fstatSync,
  lstatSync as lstatSync4,
  openSync,
  opendirSync,
  readFileSync,
  readlinkSync,
  readSync,
  realpathSync as realpathSync2
} from "fs";
import { builtinModules, createRequire } from "module";
import {
  basename as basename2,
  dirname as dirname3,
  extname,
  isAbsolute as isAbsolute2,
  parse,
  relative,
  resolve as resolve3,
  sep
} from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// src/provider-plugin-import-analysis.ts
import { createHash as createHash6 } from "crypto";
var scanners = Object.freeze({
  js: new Bun.Transpiler({ loader: "js" }),
  ts: new Bun.Transpiler({ loader: "ts" })
});
var MAX_MEMO_ENTRIES = 2048;
var MAX_MEMO_TEXT_BYTES = 4 * 1024 * 1024;
var importsMemo = new Map;
var memoTextBytes = 0;
function scanProviderPluginValueImports(source, loader) {
  const key2 = `${loader}\x00${createHash6("sha256").update(source).digest("hex")}`;
  const cached = importsMemo.get(key2);
  if (cached !== undefined)
    return cached.imports;
  const imports = Object.freeze(scanners[loader].scanImports(source).map(({ kind, path }) => Object.freeze({ kind, path })));
  const textBytes = key2.length + imports.reduce((total, entry) => total + Buffer.byteLength(entry.kind) + Buffer.byteLength(entry.path), 0);
  if (imports.length > 4096 || textBytes > MAX_MEMO_TEXT_BYTES)
    return imports;
  while (importsMemo.size >= MAX_MEMO_ENTRIES || memoTextBytes + textBytes > MAX_MEMO_TEXT_BYTES) {
    const oldest = importsMemo.entries().next().value;
    if (oldest === undefined)
      break;
    importsMemo.delete(oldest[0]);
    memoTextBytes -= oldest[1].textBytes;
  }
  importsMemo.set(key2, { imports, textBytes });
  memoTextBytes += textBytes;
  return imports;
}

// src/provider-plugin-package.ts
import { spawnSync } from "child_process";
import { createHash as createHash7, randomUUID as randomUUID2 } from "crypto";
import {
  lstatSync as lstatSync3
} from "fs";
import { isIP } from "net";
import { dirname as dirname2, join as join4, resolve as resolve2 } from "path";
import { fileURLToPath } from "url";
import ts from "typescript";
var PORTABLE_PROVIDER_PLUGIN_MANIFEST_SCHEMA_VERSION = 1;
var PORTABLE_PROVIDER_PLUGIN_HOST_API_VERSION = 1;
var PORTABLE_PROVIDER_PLUGIN_MANIFEST_NAME = "ghostget-plugin.json";
var WRENCH_PORTABLE_PROVIDER_PLUGIN_MANIFEST_NAME = "wrench-plugin.json";
var LEGACY_PORTABLE_PROVIDER_PLUGIN_MANIFEST_NAME = "oh-plugin.json";
var portableProviderPluginManifestNames = new Set([
  PORTABLE_PROVIDER_PLUGIN_MANIFEST_NAME,
  WRENCH_PORTABLE_PROVIDER_PLUGIN_MANIFEST_NAME,
  LEGACY_PORTABLE_PROVIDER_PLUGIN_MANIFEST_NAME
]);
var portableProviderPluginTransports = [
  "provider-api",
  "web-session-api",
  "linked-device"
];
var portableProviderPluginAuthKinds = [
  "cookie-source",
  "cookies-file",
  "browser-profile",
  "oauth-token-file",
  "linked-device-store"
];
var portableProviderPluginSessionMaterialNames = [
  "cookie-jar",
  "oauth-access-token"
];
var verifiedPortableProviderPluginPackages = new WeakSet;
var MAX_MANIFEST_BYTES = 256 * 1024;
var MAX_PLUGIN_FILES = 256;
var MAX_PLUGIN_FILE_BYTES = 8 * 1024 * 1024;
var MAX_PLUGIN_PAYLOAD_BYTES = 32 * 1024 * 1024;
var MAX_BINDINGS = 64;
var MAX_OPERATIONS_PER_BINDING = 256;
var MAX_NETWORK_ORIGINS = 64;
var MAX_SESSION_MATERIAL_NAMES = 64;
var MAX_PLUGIN_DIRECTORIES = MAX_PLUGIN_FILES * 15;
var MAX_PLUGIN_PACKAGE_ENTRIES = 1 + MAX_PLUGIN_FILES + MAX_PLUGIN_DIRECTORIES;
var allowedPortableRuntimeImports = new Set([
  "node:readline"
]);
var portableRuntimeImportScanner = new Bun.Transpiler({ loader: "js" });
var pathHelperPath = join4(dirname2(fileURLToPath(import.meta.url)), "path-helper.ts");
var pathHelperConfigPath = join4(dirname2(fileURLToPath(import.meta.url)), "state-helper.bunfig.toml");
var pathHelperSpawnObserverForTest;
var pluginIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
var operationNamePattern = /^[a-z][a-z0-9-]{0,39}(?:\.[a-z][a-z0-9-]{0,39}){1,3}$/u;
var materialNamePattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
var packagePathSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
var sha256Pattern = /^[a-f0-9]{64}$/u;
var gitRevisionPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
var forbiddenPackageBasenames = new Set([
  ".env",
  ".npmrc",
  ".yarnrc",
  "bun.lock",
  "bun.lockb",
  "bunfig.toml",
  "deno.json",
  "deno.jsonc",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock"
]);
var forbiddenPackageExtensions = new Set([
  ".cmd",
  ".dll",
  ".dylib",
  ".exe",
  ".node",
  ".ps1",
  ".sh",
  ".so"
]);
var forbiddenPortablePathStems = /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])$/iu;
function isRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    return false;
  return Reflect.ownKeys(value).every((key2) => {
    if (typeof key2 !== "string")
      return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key2);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
}
function exactKeys3(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key2, index) => key2 !== wanted[index])) {
    throw new Error(`${label} must contain exactly: ${wanted.join(", ")}`);
  }
}
function allowedKeys(value, allowed, label) {
  const accepted = new Set(allowed);
  const unexpected = Object.keys(value).filter((key2) => !accepted.has(key2)).sort();
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unsupported keys: ${unexpected.join(", ")}`);
  }
}
function compareCanonicalText(left, right) {
  if (left < right)
    return -1;
  if (left > right)
    return 1;
  return 0;
}
function record2(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function boundedString(value, label, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r\n]/u.test(value)) {
    throw new Error(`${label} must be bounded single-line text`);
  }
  return value;
}
function boundedSemanticText(value, label, maximumBytes) {
  if (typeof value !== "string" || value.length < 1 || Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new Error(`${label} must be bounded text`);
  }
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      throw new Error(`${label} must not contain control characters`);
    }
  }
  return value;
}
function boundedArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    throw new Error(`${label} must contain between 1 and ${maximum} items`);
  }
  return value;
}
function safePluginId(value, label) {
  const id = boundedString(value, label, 63);
  if (!pluginIdPattern.test(id)) {
    throw new Error(`${label} must be strict lowercase kebab-case`);
  }
  return id;
}
function safeVersion(value) {
  const version = boundedString(value, "plugin version", 128);
  if (!isPortableProviderPluginVersion(version)) {
    throw new Error("plugin version must be strict semantic version text");
  }
  return version;
}
function safeOperationName(value) {
  const name = boundedString(value, "plugin operation name", 163);
  if (!operationNamePattern.test(name)) {
    throw new Error("plugin operation name must be a bounded dotted semantic outcome");
  }
  return name;
}
function safeSha256(value, label) {
  const sha2562 = boundedString(value, label, 64);
  if (!sha256Pattern.test(sha2562)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return sha2562;
}
function exactPublicHttpsOrigin(value, label) {
  const text = boundedString(value, label, 2048);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} must be an exact public HTTPS origin`);
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "" || url.origin !== text || hostname.endsWith(".") || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || !hostname.includes(".") || isIP(hostname) !== 0) {
    throw new Error(`${label} must be an exact public HTTPS origin`);
  }
  return text;
}
function exactHttpsRepository(value) {
  const text = boundedString(value, "plugin provenance repository", 2048);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("plugin git provenance repository must identify an HTTPS repository");
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || url.pathname === "/" || url.pathname.endsWith("/") || hostname.endsWith(".") || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") || !hostname.includes(".") || isIP(hostname) !== 0 || url.toString() !== text) {
    throw new Error("plugin git provenance repository must identify an exact credential-free HTTPS repository");
  }
  return text;
}
function safePackagePath(value, label) {
  const path = boundedString(value, label, 512);
  if (path.startsWith("/") || path.endsWith("/") || path.includes("\\") || path.includes("//")) {
    throw new Error(`${label} must be a normalized relative package path`);
  }
  const segments = path.split("/");
  if (segments.length > 16 || segments.some((segment) => segment === "." || segment === ".." || segment.endsWith(".") || !packagePathSegmentPattern.test(segment) || forbiddenPortablePathStems.test(segment.split(".")[0] ?? ""))) {
    throw new Error(`${label} contains an unsafe path segment`);
  }
  if (segments.some((segment) => segment.toLowerCase() === "node_modules")) {
    throw new Error(`${label} cannot contain node_modules`);
  }
  const basename2 = segments.at(-1)?.toLowerCase();
  if (basename2 === undefined || forbiddenPackageBasenames.has(basename2)) {
    throw new Error(`${label} names a forbidden package-manager or environment file`);
  }
  const dot = basename2.lastIndexOf(".");
  const extension = dot < 0 ? "" : basename2.slice(dot);
  if (forbiddenPackageExtensions.has(extension)) {
    throw new Error(`${label} names a native or shell executable`);
  }
  if (portableProviderPluginManifestNames.has(path)) {
    throw new Error(`${label} cannot redeclare the package manifest`);
  }
  return path;
}
var operationRiskRank = Object.freeze({
  R1: 1,
  R2: 2,
  R3: 3,
  R4: 4
});
var readOperationSuffixes = new Set([
  "get",
  "inspect",
  "list",
  "lookup",
  "probe",
  "read",
  "search",
  "status"
]);
var reversibleMutationSuffixes = new Set([
  "edit",
  "follow",
  "like",
  "save",
  "unfollow",
  "unlike",
  "unsave",
  "update"
]);
var outwardMutationSuffixes = new Set([
  "comment",
  "create",
  "post",
  "publish",
  "reply",
  "send",
  "upload"
]);
var highAuthorityOperationSegments = new Set([
  "admin",
  "administrator",
  "ban",
  "billing",
  "charge",
  "charges",
  "delete",
  "destroy",
  "erase",
  "financial",
  "funds",
  "invoice",
  "invoices",
  "money",
  "payment",
  "payments",
  "permission",
  "permissions",
  "purchase",
  "purge",
  "refund",
  "remove",
  "role",
  "roles",
  "subscription",
  "subscriptions",
  "suspend",
  "transfer",
  "transfers",
  "withdraw",
  "withdrawal"
]);
function derivePortableProviderPluginMinimumRisk(operationName) {
  const name = safeOperationName(operationName);
  const segments = name.split(/[.-]/u);
  if (segments.some((segment) => highAuthorityOperationSegments.has(segment))) {
    return "R4";
  }
  const suffix = name.split(".").at(-1);
  if (suffix !== undefined && readOperationSuffixes.has(suffix))
    return "R1";
  if (suffix !== undefined && reversibleMutationSuffixes.has(suffix))
    return "R2";
  if (suffix !== undefined && outwardMutationSuffixes.has(suffix))
    return "R3";
  return "R4";
}
function parseDescription(value, label) {
  return boundedSemanticText(value, label, 500);
}
function parseMediaTypes(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new Error(`${label} must contain between 1 and 32 media types`);
  }
  const mediaTypes = value.map((candidate, index) => {
    const mediaType = boundedString(candidate, `${label}[${index}]`, 256);
    if (!/^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*)$/u.test(mediaType)) {
      throw new Error(`${label}[${index}] is malformed`);
    }
    return mediaType;
  });
  if (new Set(mediaTypes).size !== mediaTypes.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return Object.freeze([...mediaTypes].sort());
}
function parseScalarInputField(field, label) {
  allowedKeys(field, [
    "type",
    "description",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "enum",
    "format",
    "urlPathPrefixes"
  ], label);
  if (field.type !== "string" && field.type !== "number" && field.type !== "boolean") {
    throw new Error(`${label}.type is unsupported`);
  }
  const type = field.type;
  const description = parseDescription(field.description, `${label}.description`);
  let minLength;
  let maxLength;
  if (field.minLength !== undefined || field.maxLength !== undefined) {
    if (type !== "string") {
      throw new Error(`${label} length bounds require a string field`);
    }
    if (field.minLength !== undefined && (!Number.isSafeInteger(field.minLength) || field.minLength < 0 || field.minLength > 1e6)) {
      throw new Error(`${label}.minLength is invalid`);
    }
    if (field.maxLength !== undefined && (!Number.isSafeInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 1e6)) {
      throw new Error(`${label}.maxLength is invalid`);
    }
    minLength = field.minLength;
    maxLength = field.maxLength;
    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
      throw new Error(`${label}.minLength cannot exceed maxLength`);
    }
  }
  let minimum;
  let maximum;
  if (field.minimum !== undefined || field.maximum !== undefined) {
    if (type !== "number") {
      throw new Error(`${label} numeric bounds require a number field`);
    }
    if (field.minimum !== undefined && (typeof field.minimum !== "number" || !Number.isFinite(field.minimum))) {
      throw new Error(`${label}.minimum is invalid`);
    }
    if (field.maximum !== undefined && (typeof field.maximum !== "number" || !Number.isFinite(field.maximum))) {
      throw new Error(`${label}.maximum is invalid`);
    }
    minimum = field.minimum;
    maximum = field.maximum;
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      throw new Error(`${label}.minimum cannot exceed maximum`);
    }
  }
  let enumValues;
  if (field.enum !== undefined) {
    if (!Array.isArray(field.enum) || field.enum.length < 1 || field.enum.length > 100 || field.enum.some((candidate) => typeof candidate !== type || typeof candidate === "number" && !Number.isFinite(candidate))) {
      throw new Error(`${label}.enum must contain bounded values matching its type`);
    }
    const values = field.enum;
    if (new Set(values.map((candidate) => JSON.stringify(candidate))).size !== values.length) {
      throw new Error(`${label}.enum must not contain duplicates`);
    }
    enumValues = Object.freeze([...values]);
  }
  let format;
  if (field.format !== undefined) {
    if (type !== "string" || field.format !== "url" && field.format !== "path-segment") {
      throw new Error(`${label}.format is invalid`);
    }
    format = field.format;
  }
  let urlPathPrefixes;
  if (field.urlPathPrefixes !== undefined) {
    if (type !== "string" || format !== "url" || !Array.isArray(field.urlPathPrefixes) || field.urlPathPrefixes.length < 1 || field.urlPathPrefixes.length > 20) {
      throw new Error(`${label}.urlPathPrefixes requires a URL string field and 1-20 prefixes`);
    }
    const prefixes = field.urlPathPrefixes.map((candidate, index) => {
      const prefix = boundedString(candidate, `${label}.urlPathPrefixes[${index}]`, 2048);
      if (!prefix.startsWith("/") || prefix.startsWith("//") || prefix.includes("\\") || prefix.includes("?") || prefix.includes("#") || /%(?:25|2e|2f|5c)/iu.test(prefix) || prefix.split("/").some((segment) => segment === "." || segment === "..")) {
        throw new Error(`${label}.urlPathPrefixes[${index}] is ambiguous`);
      }
      return prefix;
    });
    if (new Set(prefixes).size !== prefixes.length) {
      throw new Error(`${label}.urlPathPrefixes must not contain duplicates`);
    }
    urlPathPrefixes = Object.freeze([...prefixes].sort());
  }
  return Object.freeze({
    type,
    description,
    ...minLength === undefined ? {} : { minLength },
    ...maxLength === undefined ? {} : { maxLength },
    ...minimum === undefined ? {} : { minimum },
    ...maximum === undefined ? {} : { maximum },
    ...enumValues === undefined ? {} : { enum: enumValues },
    ...format === undefined ? {} : { format },
    ...urlPathPrefixes === undefined ? {} : { urlPathPrefixes }
  });
}
function parseInputField(value, label, maximumArrayItems, nested = false) {
  const field = record2(value, label);
  if (field.type === "file") {
    allowedKeys(field, ["type", "description", "maxBytes", "mediaTypes"], label);
    const description = parseDescription(field.description, `${label}.description`);
    if (!Number.isSafeInteger(field.maxBytes) || field.maxBytes < 1 || field.maxBytes > 1024 * 1024 * 1024) {
      throw new Error(`${label}.maxBytes must be a bounded positive integer`);
    }
    const result = {
      type: "file",
      description,
      maxBytes: field.maxBytes,
      ...field.mediaTypes === undefined ? {} : { mediaTypes: parseMediaTypes(field.mediaTypes, `${label}.mediaTypes`) }
    };
    return Object.freeze(result);
  }
  if (field.type === "array") {
    allowedKeys(field, ["type", "description", "items", "minItems", "maxItems"], label);
    if (nested)
      throw new Error(`${label} cannot contain a nested array`);
    if (!Number.isSafeInteger(field.minItems) || !Number.isSafeInteger(field.maxItems) || field.minItems < 0 || field.maxItems < 1 || field.maxItems < field.minItems || field.maxItems > maximumArrayItems) {
      throw new Error(`${label} must declare valid bounded item counts`);
    }
    const result = {
      type: "array",
      description: parseDescription(field.description, `${label}.description`),
      items: parseInputField(field.items, `${label}.items`, maximumArrayItems, true),
      minItems: field.minItems,
      maxItems: field.maxItems
    };
    return Object.freeze(result);
  }
  return parseScalarInputField(field, label);
}
function parseInputSchema(value, label, maximumArrayItems) {
  const schema = record2(value, label);
  exactKeys3(schema, ["properties", "required"], label);
  const rawProperties = record2(schema.properties, `${label}.properties`);
  const propertyEntries = Object.entries(rawProperties).sort(([left], [right]) => compareCanonicalText(left, right));
  if (propertyEntries.length > 100) {
    throw new Error(`${label}.properties may contain at most 100 fields`);
  }
  const properties = Object.create(null);
  for (const [name, field] of propertyEntries) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(name)) {
      throw new Error(`${label}.properties contains invalid field ${name}`);
    }
    properties[name] = parseInputField(field, `${label}.properties.${name}`, maximumArrayItems);
  }
  if (!Array.isArray(schema.required) || schema.required.length > 100 || schema.required.some((name) => typeof name !== "string")) {
    throw new Error(`${label}.required must contain at most 100 field names`);
  }
  const required = schema.required;
  if (new Set(required).size !== required.length) {
    throw new Error(`${label}.required must not contain duplicates`);
  }
  for (const name of required) {
    if (properties[name] === undefined) {
      throw new Error(`${label}.required references unknown field ${name}`);
    }
  }
  return Object.freeze({
    properties: Object.freeze(properties),
    required: Object.freeze([...required].sort())
  });
}
function containsFileInput(field) {
  return field.type === "file" || field.type === "array" && field.items.type === "file";
}
function parseScope(value, label) {
  const scope = boundedString(value, label, 256);
  if (!/^[\x21-\x7e]+$/u.test(scope)) {
    throw new Error(`${label} must be printable non-whitespace ASCII`);
  }
  return scope;
}
function parseRequiredScopeSets(value, label) {
  const rawSets = boundedArray(value, label, 32);
  const scopeSets = rawSets.map((rawSet, setIndex) => {
    const rawScopes = boundedArray(rawSet, `${label}[${setIndex}]`, 32);
    const scopes = rawScopes.map((scope, scopeIndex) => parseScope(scope, `${label}[${setIndex}][${scopeIndex}]`));
    if (new Set(scopes).size !== scopes.length) {
      throw new Error(`${label}[${setIndex}] must not repeat a scope`);
    }
    return Object.freeze([...scopes].sort());
  });
  const identities = scopeSets.map((scopes) => scopes.join("\x00"));
  if (new Set(identities).size !== identities.length) {
    throw new Error(`${label} must not repeat an equivalent scope set`);
  }
  return Object.freeze([...scopeSets].sort((left, right) => compareCanonicalText(left.join("\x00"), right.join("\x00"))));
}
function parseCoverage(value, label) {
  const rawCoverage = boundedArray(value, label, 64);
  const coverage = rawCoverage.map((candidate, index) => {
    const item = boundedString(candidate, `${label}[${index}]`, 128);
    if (!/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/u.test(item)) {
      throw new Error(`${label}[${index}] is malformed`);
    }
    return item;
  });
  if (new Set(coverage).size !== coverage.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return Object.freeze([...coverage].sort());
}
function parseOperation(value, transport) {
  const operation = record2(value, "plugin operation");
  const providerApi = transport === "provider-api";
  exactKeys3(operation, [
    "name",
    "contractVersion",
    "timeoutMs",
    "maxOutputBytes",
    "state",
    "risk",
    "dispatch",
    "sideEffect",
    "idempotency",
    "dedupeWindowMs",
    "input",
    "implementation",
    ...providerApi ? ["requiredScopeSets", "coverage"] : []
  ], "plugin operation");
  const name = safeOperationName(operation.name);
  if (!Number.isSafeInteger(operation.contractVersion) || operation.contractVersion < 1 || operation.contractVersion > 1e6) {
    throw new Error(`plugin operation ${name} contractVersion is invalid`);
  }
  if (!Number.isSafeInteger(operation.timeoutMs) || operation.timeoutMs < 1000 || operation.timeoutMs > 120000) {
    throw new Error(`plugin operation ${name} timeoutMs is invalid`);
  }
  if (!Number.isSafeInteger(operation.maxOutputBytes) || operation.maxOutputBytes < 1024 || operation.maxOutputBytes > 512 * 1024) {
    throw new Error(`plugin operation ${name} maxOutputBytes is invalid`);
  }
  if (operation.state !== "observed" && operation.state !== "capture-required") {
    throw new Error(`plugin operation ${name} state is invalid`);
  }
  if (operation.risk !== "R1" && operation.risk !== "R2" && operation.risk !== "R3" && operation.risk !== "R4") {
    throw new Error(`plugin operation ${name} risk is invalid`);
  }
  const risk = operation.risk;
  const minimumRisk = derivePortableProviderPluginMinimumRisk(name);
  if (operationRiskRank[risk] < operationRiskRank[minimumRisk]) {
    throw new Error(`plugin operation ${name} requires at least ${minimumRisk} authority, not ${risk}`);
  }
  if (operation.dispatch !== "none" && operation.dispatch !== "single") {
    throw new Error(`plugin operation ${name} dispatch is invalid`);
  }
  if (operation.idempotency !== "none" && operation.idempotency !== "local-at-most-once") {
    throw new Error(`plugin operation ${name} idempotency is invalid`);
  }
  if (!Number.isSafeInteger(operation.dedupeWindowMs) || operation.dedupeWindowMs < 0 || operation.dedupeWindowMs > 30 * 24 * 60 * 60000) {
    throw new Error(`plugin operation ${name} dedupeWindowMs is invalid`);
  }
  const sideEffect = boundedSemanticText(operation.sideEffect, `plugin operation ${name} sideEffect`, 500);
  const implementation = boundedSemanticText(operation.implementation, `plugin operation ${name} implementation`, 500);
  const input = parseInputSchema(operation.input, `plugin operation ${name} input`, providerApi ? 100 : 25);
  if (risk === "R1" && (sideEffect !== "none" || operation.dispatch !== "none" || operation.idempotency !== "none" || operation.dedupeWindowMs !== 0 || Object.values(input.properties).some(containsFileInput))) {
    throw new Error(`plugin operation ${name} must keep R1 semantics side-effect-free, file-free, and dispatch-free`);
  }
  if ((risk === "R2" || risk === "R3") && (sideEffect === "none" || operation.dispatch !== "single" || operation.idempotency !== "local-at-most-once" || operation.dedupeWindowMs < 60000)) {
    throw new Error(`plugin operation ${name} must bind R2/R3 authority to one at-most-once dispatch and a 60-second minimum dedupe window`);
  }
  if (risk === "R4" && operation.state !== "capture-required") {
    throw new Error(`plugin operation ${name} must keep R4 authority capture-required`);
  }
  const common = {
    name,
    contractVersion: operation.contractVersion,
    timeoutMs: operation.timeoutMs,
    maxOutputBytes: operation.maxOutputBytes,
    state: operation.state,
    risk,
    dispatch: operation.dispatch,
    sideEffect,
    idempotency: operation.idempotency,
    dedupeWindowMs: operation.dedupeWindowMs,
    input,
    implementation
  };
  if (!providerApi) {
    return Object.freeze(common);
  }
  return Object.freeze({
    ...common,
    requiredScopeSets: parseRequiredScopeSets(operation.requiredScopeSets, `plugin operation ${name} requiredScopeSets`),
    coverage: parseCoverage(operation.coverage, `plugin operation ${name} coverage`)
  });
}
function parseSubject(value, operations, transport, surfaceId) {
  const subject = record2(value, `plugin binding ${surfaceId} subject`);
  exactKeys3(subject, ["format", "kind", "probe"], `plugin binding ${surfaceId} subject`);
  const format = boundedSemanticText(subject.format, `plugin binding ${surfaceId} subject format`, 200);
  if (subject.kind !== "opaque-token" && subject.kind !== "decimal" && subject.kind !== "did" && subject.kind !== "uuid" && subject.kind !== "e164") {
    throw new Error(`plugin binding ${surfaceId} subject kind is unsupported`);
  }
  if (subject.probe === null) {
    if (transport !== "provider-api" && operations.some((operation2) => operation2.state === "observed")) {
      throw new Error(`plugin binding ${surfaceId} must declare an observed R1 subject probe before session operations become executable`);
    }
    return Object.freeze({ format, kind: subject.kind, probe: null });
  }
  const probe = record2(subject.probe, `plugin binding ${surfaceId} subject probe`);
  exactKeys3(probe, ["operation", "contractVersion"], `plugin binding ${surfaceId} subject probe`);
  const operationName = safeOperationName(probe.operation);
  if (!Number.isSafeInteger(probe.contractVersion) || probe.contractVersion < 1 || probe.contractVersion > 1e6) {
    throw new Error(`plugin binding ${surfaceId} subject probe contractVersion is invalid`);
  }
  const operation = operations.find((candidate) => candidate.name === operationName && candidate.contractVersion === probe.contractVersion);
  if (operation === undefined || operation.state !== "observed" || operation.risk !== "R1" || operation.dispatch !== "none" || Object.keys(operation.input.properties).length !== 0 || operation.input.required.length !== 0) {
    throw new Error(`plugin binding ${surfaceId} subject probe must reference one input-free observed dispatch-free R1 operation`);
  }
  return Object.freeze({
    format,
    kind: subject.kind,
    probe: Object.freeze({
      operation: operationName,
      contractVersion: probe.contractVersion
    })
  });
}
function parseBinding(value) {
  const binding = record2(value, "plugin binding");
  exactKeys3(binding, [
    "transport",
    "adapterId",
    "surfaceId",
    "origin",
    "authKinds",
    "subject",
    "operations"
  ], "plugin binding");
  if (typeof binding.transport !== "string" || !portableProviderPluginTransports.includes(binding.transport)) {
    throw new Error("plugin binding transport is unsupported");
  }
  const transport = binding.transport;
  const adapterId = safePluginId(binding.adapterId, "plugin binding adapterId");
  const surfaceId = safePluginId(binding.surfaceId, "plugin binding surfaceId");
  const origin = exactPublicHttpsOrigin(binding.origin, `plugin binding ${surfaceId} origin`);
  const authKinds = boundedArray(binding.authKinds, `plugin binding ${surfaceId} authKinds`, portableProviderPluginAuthKinds.length).map((kind) => {
    if (typeof kind !== "string" || !portableProviderPluginAuthKinds.includes(kind)) {
      throw new Error(`plugin binding ${surfaceId} accepts an unsupported auth kind`);
    }
    return kind;
  });
  if (new Set(authKinds).size !== authKinds.length) {
    throw new Error(`plugin binding ${surfaceId} repeats an auth kind`);
  }
  const sortedAuthKinds = [...authKinds].sort();
  if (sortedAuthKinds.some((kind, index) => kind !== authKinds[index])) {
    throw new Error(`plugin binding ${surfaceId} auth kinds must be sorted`);
  }
  if (transport === "provider-api" && (sortedAuthKinds.length !== 1 || sortedAuthKinds[0] !== "oauth-token-file")) {
    throw new Error(`plugin binding ${surfaceId} provider-api requires only oauth-token-file auth`);
  }
  if (transport === "linked-device" && (sortedAuthKinds.length !== 1 || sortedAuthKinds[0] !== "linked-device-store")) {
    throw new Error(`plugin binding ${surfaceId} linked-device requires only linked-device-store auth`);
  }
  if (transport === "web-session-api" && sortedAuthKinds.some((kind) => kind === "oauth-token-file" || kind === "linked-device-store")) {
    throw new Error(`plugin binding ${surfaceId} web-session-api requires browser-session auth`);
  }
  const operations = boundedArray(binding.operations, `plugin binding ${surfaceId} operations`, MAX_OPERATIONS_PER_BINDING).map((operation) => parseOperation(operation, transport));
  if (transport === "linked-device" && operations.some((operation) => operation.state !== "capture-required")) {
    throw new Error(`plugin binding ${surfaceId} linked-device operations must remain capture-required until a portable lifecycle protocol is available`);
  }
  const operationKeys = operations.map((operation) => `${operation.name}@${operation.contractVersion}`);
  if (new Set(operationKeys).size !== operationKeys.length) {
    throw new Error(`plugin binding ${surfaceId} repeats an operation contract`);
  }
  if (new Set(operations.map((operation) => operation.name)).size !== operations.length) {
    throw new Error(`plugin binding ${surfaceId} v1 permits only one current contract version per operation name`);
  }
  const sortedOperations = [...operations].sort((left, right) => {
    const nameOrder = compareCanonicalText(left.name, right.name);
    return nameOrder === 0 ? left.contractVersion - right.contractVersion : nameOrder;
  });
  if (sortedOperations.some((operation, index) => operation !== operations[index])) {
    throw new Error(`plugin binding ${surfaceId} operations must be sorted by name and contract version`);
  }
  const common = {
    adapterId,
    surfaceId,
    origin,
    authKinds: Object.freeze(sortedAuthKinds),
    subject: parseSubject(binding.subject, sortedOperations, transport, surfaceId)
  };
  if (transport === "provider-api") {
    return Object.freeze({
      ...common,
      transport,
      operations: Object.freeze(sortedOperations)
    });
  }
  if (transport === "web-session-api") {
    return Object.freeze({
      ...common,
      transport,
      operations: Object.freeze(sortedOperations)
    });
  }
  return Object.freeze({
    ...common,
    transport,
    operations: Object.freeze(sortedOperations)
  });
}
function parseCapabilities(value, bindingOrigins, bindings) {
  const capabilities = record2(value, "plugin capabilities");
  exactKeys3(capabilities, ["networkOrigins", "planFiles", "state", "sessionMaterial"], "plugin capabilities");
  if (capabilities.planFiles !== "none" && capabilities.planFiles !== "read") {
    throw new Error("plugin capabilities planFiles must be none or read");
  }
  if (capabilities.state !== "none" && capabilities.state !== "namespaced") {
    throw new Error("plugin capabilities state must be none or namespaced");
  }
  if (!Array.isArray(capabilities.networkOrigins) || capabilities.networkOrigins.length > MAX_NETWORK_ORIGINS) {
    throw new Error(`plugin capabilities networkOrigins must contain at most ${MAX_NETWORK_ORIGINS} entries`);
  }
  const networkOrigins = capabilities.networkOrigins.map((origin, index) => exactPublicHttpsOrigin(origin, `plugin capabilities networkOrigins[${index}]`));
  if (new Set(networkOrigins).size !== networkOrigins.length) {
    throw new Error("plugin capabilities repeat a network origin");
  }
  const sortedOrigins = [...networkOrigins].sort();
  if (sortedOrigins.some((origin, index) => origin !== networkOrigins[index])) {
    throw new Error("plugin capability network origins must be sorted");
  }
  for (const origin of bindingOrigins) {
    if (!networkOrigins.includes(origin)) {
      throw new Error(`plugin capability network origins omit binding origin ${origin}`);
    }
  }
  if (!Array.isArray(capabilities.sessionMaterial) || capabilities.sessionMaterial.length > MAX_SESSION_MATERIAL_NAMES) {
    throw new Error(`plugin capabilities sessionMaterial must contain at most ${MAX_SESSION_MATERIAL_NAMES} entries`);
  }
  const sessionMaterial = capabilities.sessionMaterial.map((name, index) => {
    const normalized = boundedString(name, `plugin capabilities sessionMaterial[${index}]`, 128);
    if (!materialNamePattern.test(normalized)) {
      throw new Error("plugin session material names must use lowercase dotted or dashed identifiers");
    }
    if (!portableProviderPluginSessionMaterialNames.includes(normalized)) {
      throw new Error(`plugin session material ${normalized} is unsupported by host API v1`);
    }
    return normalized;
  });
  if (new Set(sessionMaterial).size !== sessionMaterial.length) {
    throw new Error("plugin capabilities repeat a session material name");
  }
  const sortedMaterial = [...sessionMaterial].sort();
  if (sortedMaterial.some((name, index) => name !== sessionMaterial[index])) {
    throw new Error("plugin session material names must be sorted");
  }
  const executableSessionMaterial = new Set;
  for (const binding of bindings) {
    if (binding.transport === "provider-api" && binding.authKinds.includes("oauth-token-file")) {
      executableSessionMaterial.add("oauth-access-token");
    }
    if (binding.transport === "web-session-api" && binding.authKinds.some((kind) => kind === "cookie-source" || kind === "cookies-file" || kind === "browser-profile")) {
      executableSessionMaterial.add("cookie-jar");
    }
  }
  for (const name of sortedMaterial) {
    if (!executableSessionMaterial.has(name)) {
      throw new Error(`plugin session material ${name} is not executable by any declared binding`);
    }
  }
  return Object.freeze({
    networkOrigins: Object.freeze(sortedOrigins),
    planFiles: capabilities.planFiles,
    state: capabilities.state,
    sessionMaterial: Object.freeze(sortedMaterial)
  });
}
function parseFile(value) {
  const file = record2(value, "plugin file");
  exactKeys3(file, ["path", "kind", "bytes", "sha256"], "plugin file");
  const path = safePackagePath(file.path, "plugin file path");
  if (file.kind !== "runtime" && file.kind !== "data") {
    throw new Error(`plugin file ${path} kind must be runtime or data`);
  }
  if (!Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_PLUGIN_FILE_BYTES) {
    throw new Error(`plugin file ${path} bytes must be between 1 and ${MAX_PLUGIN_FILE_BYTES}`);
  }
  const sha2562 = safeSha256(file.sha256, `plugin file ${path} sha256`);
  return Object.freeze({
    path,
    kind: file.kind,
    bytes: file.bytes,
    sha256: sha2562
  });
}
function runtimeRequireReference(node) {
  if (ts.isIdentifier(node))
    return node.text === "require";
  if (ts.isPropertyAccessExpression(node)) {
    return node.name.text === "require";
  }
  return ts.isElementAccessExpression(node) && node.argumentExpression !== undefined && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "require";
}
function assertSelfContainedPortableRuntime(path, bytes) {
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`portable plugin runtime ${path} must be valid UTF-8`);
  }
  let imports;
  try {
    imports = portableRuntimeImportScanner.scanImports(source);
  } catch {
    throw new Error(`portable plugin runtime ${path} must contain valid JavaScript`);
  }
  for (const imported of imports) {
    if (imported.kind === "dynamic-import") {
      throw new Error(`portable plugin runtime ${path} must not use dynamic import`);
    }
    if (imported.kind === "require-call") {
      throw new Error(`portable plugin runtime ${path} must not use require`);
    }
    if (imported.kind !== "import-statement" || !allowedPortableRuntimeImports.has(imported.path)) {
      throw new Error(`portable plugin runtime ${path} imports unsupported module ${imported.path}`);
    }
  }
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  let nonLiteralImport = false;
  let requireReference = false;
  const visit = (node) => {
    if (nonLiteralImport || requireReference)
      return;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      nonLiteralImport = true;
      return;
    }
    if (runtimeRequireReference(node)) {
      requireReference = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (nonLiteralImport) {
    throw new Error(`portable plugin runtime ${path} must not use dynamic import`);
  }
  if (requireReference) {
    throw new Error(`portable plugin runtime ${path} must not use require`);
  }
}
function parseProvenance(value) {
  const provenance = record2(value, "plugin provenance");
  if (provenance.kind === "local") {
    exactKeys3(provenance, ["kind"], "local plugin provenance");
    return Object.freeze({ kind: "local" });
  }
  if (provenance.kind !== "git") {
    throw new Error("plugin provenance kind must be local or git");
  }
  exactKeys3(provenance, ["kind", "repository", "revision"], "git plugin provenance");
  const repository = exactHttpsRepository(provenance.repository);
  const repositoryHostname = new URL(repository).hostname.toLowerCase();
  if (!repository.endsWith(".git") && repositoryHostname !== "github.com" && repositoryHostname !== "gitlab.com") {
    throw new Error("plugin git provenance repository must identify an HTTPS repository");
  }
  const revision = boundedString(provenance.revision, "plugin provenance revision", 64);
  if (!gitRevisionPattern.test(revision)) {
    throw new Error("plugin git provenance revision must be a full lowercase commit digest");
  }
  return Object.freeze({
    kind: "git",
    repository,
    revision
  });
}
function parseManifestOrThrow(value) {
  const manifest = record2(value, "portable provider plugin manifest");
  exactKeys3(manifest, [
    "schemaVersion",
    "hostApiVersion",
    "id",
    "version",
    "displayName",
    "runtime",
    "provenance",
    "capabilities",
    "bindings",
    "files"
  ], "portable provider plugin manifest");
  if (manifest.schemaVersion !== PORTABLE_PROVIDER_PLUGIN_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`portable provider plugin schemaVersion must be ${PORTABLE_PROVIDER_PLUGIN_MANIFEST_SCHEMA_VERSION}`);
  }
  if (manifest.hostApiVersion !== PORTABLE_PROVIDER_PLUGIN_HOST_API_VERSION) {
    throw new Error(`portable provider plugin hostApiVersion must be ${PORTABLE_PROVIDER_PLUGIN_HOST_API_VERSION}`);
  }
  const id = safePluginId(manifest.id, "plugin ID");
  const version = safeVersion(manifest.version);
  const displayName = boundedString(manifest.displayName, "plugin displayName", 160);
  const runtime = record2(manifest.runtime, "plugin runtime");
  exactKeys3(runtime, ["kind", "entrypoint"], "plugin runtime");
  if (runtime.kind !== "bun-js") {
    throw new Error("plugin runtime kind must be bun-js");
  }
  const entrypoint = safePackagePath(runtime.entrypoint, "plugin runtime entrypoint");
  if (!entrypoint.endsWith(".mjs")) {
    throw new Error("plugin runtime entrypoint must be a bundled .mjs file");
  }
  const provenance = parseProvenance(manifest.provenance);
  const bindings = boundedArray(manifest.bindings, "plugin bindings", MAX_BINDINGS).map(parseBinding);
  const routeKeys = bindings.map((binding) => `${binding.transport}/${binding.surfaceId}`);
  if (new Set(routeKeys).size !== routeKeys.length) {
    throw new Error("portable provider plugin repeats a transport route");
  }
  const adapterIds = bindings.map((binding) => binding.adapterId);
  if (new Set(adapterIds).size !== adapterIds.length) {
    throw new Error("portable provider plugin repeats an adapter ID");
  }
  const sortedBindings = [...bindings].sort((left, right) => compareCanonicalText(`${left.transport}/${left.surfaceId}`, `${right.transport}/${right.surfaceId}`));
  if (sortedBindings.some((binding, index) => binding !== bindings[index])) {
    throw new Error("plugin bindings must be sorted by transport and surface");
  }
  const bindingOrigins = new Set(bindings.map((binding) => binding.origin));
  const capabilities = parseCapabilities(manifest.capabilities, bindingOrigins, bindings);
  const files = boundedArray(manifest.files, "plugin files", MAX_PLUGIN_FILES).map(parseFile);
  const pathKeys = files.map((file) => file.path);
  const caseFoldedPathKeys = pathKeys.map((path) => path.toLowerCase());
  if (new Set(pathKeys).size !== pathKeys.length || new Set(caseFoldedPathKeys).size !== caseFoldedPathKeys.length) {
    throw new Error("portable provider plugin repeats a file path");
  }
  const sortedFiles = [...files].sort((left, right) => compareCanonicalText(left.path, right.path));
  if (sortedFiles.some((file, index) => file !== files[index])) {
    throw new Error("plugin files must be sorted by path");
  }
  const payloadBytes = files.reduce((total, file) => total + file.bytes, 0);
  if (payloadBytes > MAX_PLUGIN_PAYLOAD_BYTES) {
    throw new Error(`plugin payload exceeds ${MAX_PLUGIN_PAYLOAD_BYTES} bytes`);
  }
  const runtimeFiles = files.filter((file) => file.kind === "runtime");
  if (runtimeFiles.length !== 1 || runtimeFiles[0]?.path !== entrypoint) {
    throw new Error("plugin package must declare exactly one runtime file, its entrypoint");
  }
  return Object.freeze({
    schemaVersion: PORTABLE_PROVIDER_PLUGIN_MANIFEST_SCHEMA_VERSION,
    hostApiVersion: PORTABLE_PROVIDER_PLUGIN_HOST_API_VERSION,
    id,
    version,
    displayName,
    runtime: Object.freeze({ kind: "bun-js", entrypoint }),
    provenance,
    capabilities,
    bindings: Object.freeze(sortedBindings),
    files: Object.freeze(sortedFiles)
  });
}
function parsePortableProviderPluginManifest(value) {
  try {
    return { ok: true, value: parseManifestOrThrow(value) };
  } catch (error) {
    return {
      ok: false,
      issues: Object.freeze([
        error instanceof Error ? error.message : "invalid portable provider plugin manifest"
      ])
    };
  }
}
function renderPortableProviderPluginManifest(manifest) {
  const parsed = parsePortableProviderPluginManifest(manifest);
  if (!parsed.ok) {
    throw new Error(`invalid portable provider plugin manifest: ${parsed.issues.join("; ")}`);
  }
  return `${JSON.stringify(parsed.value, null, 2)}
`;
}
function sha2562(bytes) {
  return createHash7("sha256").update(bytes).digest("hex");
}
function sameRootStats(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
function rootIdentity(stats) {
  return {
    device: stats.dev.toString(),
    inode: stats.ino.toString()
  };
}
function sameBoundPathIdentity(left, right) {
  return left.device === right.device && left.inode === right.inode;
}
function parseBoundPathIdentity(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  exactKeys3(value, ["device", "inode"], label);
  if (typeof value.device !== "string" || !/^[0-9]{1,40}$/u.test(value.device) || typeof value.inode !== "string" || !/^[0-9]{1,40}$/u.test(value.inode))
    throw new Error(`${label} is invalid`);
  return {
    device: value.device,
    inode: value.inode
  };
}
function parseBoundPathTreeEntry(value) {
  if (!isRecord(value))
    throw new Error("path helper tree entry must be an object");
  exactKeys3(value, ["path", "kind", "identity", "size", "mtimeNs", "ctimeNs"], "path helper tree entry");
  if (typeof value.path !== "string" || value.path === "" || value.path.startsWith("/") || value.path.endsWith("/") || value.path.includes("\\") || value.path.includes("\x00") || Buffer.byteLength(value.path, "utf8") > 512 || value.path.split("/").some((segment) => segment === "" || segment === "." || segment === "..") || value.kind !== "file" && value.kind !== "directory" && value.kind !== "symbolic-link" && value.kind !== "other" || typeof value.size !== "string" || !/^[0-9]{1,40}$/u.test(value.size) || typeof value.mtimeNs !== "string" || !/^-?[0-9]{1,40}$/u.test(value.mtimeNs) || typeof value.ctimeNs !== "string" || !/^-?[0-9]{1,40}$/u.test(value.ctimeNs))
    throw new Error("path helper returned an invalid tree entry");
  return {
    path: value.path,
    kind: value.kind,
    identity: parseBoundPathIdentity(value.identity, "path helper tree entry identity"),
    size: value.size,
    mtimeNs: value.mtimeNs,
    ctimeNs: value.ctimeNs
  };
}
function runBoundPathHelper(root, expectedRoot, operation) {
  pathHelperSpawnObserverForTest?.();
  const child = spawnSync(process.execPath, [
    "--no-env-file",
    "--no-install",
    "--no-macros",
    "--no-addons",
    `--config=${pathHelperConfigPath}`,
    pathHelperPath
  ], {
    cwd: root,
    encoding: "utf8",
    env: { NODE_ENV: "production" },
    input: JSON.stringify({
      schemaVersion: 1,
      requestId: randomUUID2(),
      expected: expectedRoot,
      operation
    }),
    maxBuffer: operation.kind === "read-file" ? Math.max(1024 * 1024, Math.ceil(operation.maximumBytes / 3) * 4 + 64 * 1024) : operation.kind === "batch-read-files" ? Math.ceil(operation.maximumTotalBytes / 3) * 4 + 1024 * 1024 : 8 * 1024 * 1024,
    shell: false,
    timeout: 30000,
    windowsHide: true
  });
  let current;
  try {
    current = lstatSync3(root, { bigint: true });
  } catch {
    throw new Error("portable provider plugin package root disappeared during verification");
  }
  if (current.isSymbolicLink() || !current.isDirectory() || !sameBoundPathIdentity(rootIdentity(current), expectedRoot)) {
    throw new Error("portable provider plugin package root changed identity during verification");
  }
  if (child.error !== undefined) {
    throw new Error("bound package path helper failed to start", { cause: child.error });
  }
  if (child.status !== 0) {
    const detail = child.stderr.trim().slice(0, 512);
    throw new Error(detail === "" ? "bound package path helper rejected the operation" : detail);
  }
  try {
    return JSON.parse(child.stdout);
  } catch (error) {
    throw new Error("bound package path helper returned invalid JSON", { cause: error });
  }
}
function snapshotBoundPackageTree(root, expectedRoot) {
  const response = runBoundPathHelper(root, expectedRoot, {
    kind: "snapshot-tree",
    maximumEntries: MAX_PLUGIN_PACKAGE_ENTRIES,
    maximumDirectories: MAX_PLUGIN_DIRECTORIES,
    maximumDepth: 15,
    maximumPathBytes: 512
  });
  if (!isRecord(response))
    throw new Error("path helper tree response must be an object");
  exactKeys3(response, ["ok", "identity", "treeEntries"], "path helper tree response");
  if (response.ok !== true || !Array.isArray(response.treeEntries)) {
    throw new Error("path helper returned a malformed tree response");
  }
  const identity = parseBoundPathIdentity(response.identity, "path helper root identity");
  if (!sameBoundPathIdentity(identity, expectedRoot)) {
    throw new Error("path helper tree response came from the wrong package root");
  }
  if (response.treeEntries.length > MAX_PLUGIN_PACKAGE_ENTRIES) {
    throw new Error("path helper tree response exceeds its entry bound");
  }
  const entries = response.treeEntries.map(parseBoundPathTreeEntry);
  if (entries.some((entry, index) => index > 0 && compareCanonicalText(entries[index - 1].path, entry.path) >= 0)) {
    throw new Error("path helper tree response is not strictly sorted");
  }
  return Object.freeze(entries);
}
function readBoundPackageFile(root, expectedRoot, relativePath, directoryExpectations, fileExpectation, maximumBytes, label) {
  let response;
  try {
    response = runBoundPathHelper(root, expectedRoot, {
      kind: "read-file",
      segments: relativePath.split("/"),
      directoryExpectations,
      fileExpectation: {
        identity: fileExpectation.identity,
        size: fileExpectation.size,
        mtimeNs: fileExpectation.mtimeNs,
        ctimeNs: fileExpectation.ctimeNs
      },
      maximumBytes
    });
  } catch (error) {
    throw new Error(`${label} could not be safely read`, { cause: error });
  }
  if (!isRecord(response))
    throw new Error("path helper read response must be an object");
  exactKeys3(response, ["ok", "identity", "contentBase64"], "path helper read response");
  if (response.ok !== true || typeof response.contentBase64 !== "string") {
    throw new Error("path helper returned a malformed read response");
  }
  const identity = parseBoundPathIdentity(response.identity, "path helper root identity");
  if (!sameBoundPathIdentity(identity, expectedRoot)) {
    throw new Error("path helper read response came from the wrong package root");
  }
  const maximumEncodedBytes = Math.ceil(maximumBytes / 3) * 4;
  if (response.contentBase64.length > maximumEncodedBytes || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(response.contentBase64))
    throw new Error("path helper returned malformed bounded file content");
  const bytes = Buffer.from(response.contentBase64, "base64");
  if (bytes.byteLength < 1 || bytes.byteLength > maximumBytes || bytes.toString("base64") !== response.contentBase64) {
    throw new Error(`${label} must be a regular file between 1 and ${maximumBytes} bytes`);
  }
  return bytes;
}
function readBoundPackageFiles(root, expectedRoot, files, maximumTotalBytes) {
  const response = runBoundPathHelper(root, expectedRoot, {
    kind: "batch-read-files",
    files: files.map((file) => ({
      segments: file.path.split("/"),
      directoryExpectations: file.directoryExpectations,
      maximumBytes: file.maximumBytes,
      fileExpectation: {
        identity: file.fileExpectation.identity,
        size: file.fileExpectation.size,
        mtimeNs: file.fileExpectation.mtimeNs,
        ctimeNs: file.fileExpectation.ctimeNs
      }
    })),
    maximumTotalBytes
  });
  if (!isRecord(response))
    throw new Error("path helper batch read response must be an object");
  exactKeys3(response, ["ok", "identity", "fileContentsBase64"], "path helper batch read response");
  if (response.ok !== true || !Array.isArray(response.fileContentsBase64) || response.fileContentsBase64.length !== files.length)
    throw new Error("path helper returned a malformed batch read response");
  const identity = parseBoundPathIdentity(response.identity, "path helper root identity");
  if (!sameBoundPathIdentity(identity, expectedRoot)) {
    throw new Error("path helper batch read response came from the wrong package root");
  }
  let totalBytes = 0;
  return Object.freeze(response.fileContentsBase64.map((encoded, index) => {
    const file = files[index];
    if (file === undefined || typeof encoded !== "string") {
      throw new Error("path helper returned malformed batch file content");
    }
    const maximumEncodedBytes = Math.ceil(file.maximumBytes / 3) * 4;
    if (encoded.length > maximumEncodedBytes || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded))
      throw new Error("path helper returned malformed bounded batch file content");
    const bytes = Buffer.from(encoded, "base64");
    totalBytes += bytes.byteLength;
    if (bytes.byteLength < 1 || bytes.byteLength > file.maximumBytes || totalBytes > maximumTotalBytes || bytes.toString("base64") !== encoded)
      throw new Error("path helper batch file content violates its byte bound");
    return bytes;
  }));
}
function walkPackage(root, expectedRoot) {
  const files = [];
  const directories = [];
  const entries = [];
  const entryByPath = new Map;
  const treeEntries = snapshotBoundPackageTree(root, expectedRoot);
  for (const entry of treeEntries) {
    if (entryByPath.has(entry.path)) {
      throw new Error(`portable provider plugin package contains duplicate entry ${entry.path}`);
    }
    const segments = entry.path.split("/");
    const directoryExpectations = [];
    for (let index = 1;index < segments.length; index += 1) {
      const parentPath = segments.slice(0, index).join("/");
      const parent = entryByPath.get(parentPath);
      if (parent === undefined || parent.kind !== "directory") {
        throw new Error(`portable provider plugin tree omits directory ${parentPath}`);
      }
      directoryExpectations.push(parent.identity);
    }
    if (entry.kind === "symbolic-link") {
      throw new Error(`portable provider plugin package contains symlink ${entry.path}`);
    }
    const walkedEntry = Object.freeze({
      ...entry,
      directoryExpectations: Object.freeze(directoryExpectations)
    });
    entries.push(walkedEntry);
    entryByPath.set(entry.path, walkedEntry);
    if (entry.kind === "directory") {
      safePackagePath(`${entry.path}/placeholder`, "plugin directory path");
      directories.push(entry.path);
      if (directories.length > MAX_PLUGIN_DIRECTORIES) {
        throw new Error(`portable provider plugin package exceeds ${MAX_PLUGIN_DIRECTORIES} directories`);
      }
      continue;
    }
    if (entry.kind !== "file") {
      throw new Error(`portable provider plugin package contains unsupported entry ${entry.path}`);
    }
    if (!portableProviderPluginManifestNames.has(entry.path)) {
      safePackagePath(entry.path, "plugin package file path");
    }
    files.push(entry.path);
    if (files.length > MAX_PLUGIN_FILES + 1) {
      throw new Error(`portable provider plugin package exceeds ${MAX_PLUGIN_FILES} declared files`);
    }
  }
  return {
    files: Object.freeze(files.sort(compareCanonicalText)),
    directories: Object.freeze(directories.sort(compareCanonicalText)),
    entries: Object.freeze(entries),
    entryByPath
  };
}
function sameWalkedPackage(left, right) {
  return left.entries.length === right.entries.length && left.entries.every((entry, index) => {
    const candidate = right.entries[index];
    return candidate !== undefined && entry.path === candidate.path && entry.kind === candidate.kind && sameBoundPathIdentity(entry.identity, candidate.identity) && entry.size === candidate.size && entry.mtimeNs === candidate.mtimeNs && entry.ctimeNs === candidate.ctimeNs;
  });
}
function expectedDirectories(paths2) {
  const expected = new Set;
  for (const path of paths2) {
    const segments = path.split("/");
    for (let index = 1;index < segments.length; index += 1) {
      expected.add(segments.slice(0, index).join("/"));
    }
  }
  return [...expected].sort();
}
function verifyPortableProviderPluginPackageDirectory(path) {
  const root = resolve2(path);
  let rootStats;
  try {
    rootStats = lstatSync3(root, { bigint: true });
  } catch {
    throw new Error("portable provider plugin package directory does not exist");
  }
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error("portable provider plugin package root must be a regular non-symlink directory");
  }
  const expectedRoot = rootIdentity(rootStats);
  const walked = walkPackage(root, expectedRoot);
  const manifestNames = walked.files.filter((file) => portableProviderPluginManifestNames.has(file));
  if (manifestNames.length === 0) {
    throw new Error(`portable provider plugin package is missing ${PORTABLE_PROVIDER_PLUGIN_MANIFEST_NAME}`);
  }
  if (manifestNames.length > 1) {
    throw new Error(`portable provider plugin package must contain exactly one of ${[...portableProviderPluginManifestNames].join(" or ")}`);
  }
  const manifestName = manifestNames[0];
  if (manifestName === undefined) {
    throw new Error("portable provider plugin package manifest selection failed");
  }
  const manifestEntry = walked.entryByPath.get(manifestName);
  if (manifestEntry === undefined || manifestEntry.kind !== "file") {
    throw new Error(`portable provider plugin package is missing ${manifestName}`);
  }
  const manifestBytes = readBoundPackageFile(root, expectedRoot, manifestName, manifestEntry.directoryExpectations, manifestEntry, MAX_MANIFEST_BYTES, "portable provider plugin manifest");
  let manifestValue;
  try {
    manifestValue = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("portable provider plugin manifest must contain valid UTF-8 JSON");
  }
  const parsed = parsePortableProviderPluginManifest(manifestValue);
  if (!parsed.ok) {
    throw new Error(`invalid portable provider plugin manifest: ${parsed.issues.join("; ")}`);
  }
  const canonicalManifest = renderPortableProviderPluginManifest(parsed.value);
  if (!manifestBytes.equals(Buffer.from(canonicalManifest, "utf8"))) {
    throw new Error("portable provider plugin manifest must use canonical rendered JSON");
  }
  const expectedFiles = [
    manifestName,
    ...parsed.value.files.map((file) => file.path)
  ].sort();
  const actualFiles = [...walked.files].sort();
  if (expectedFiles.length !== actualFiles.length || expectedFiles.some((file, index) => file !== actualFiles[index])) {
    throw new Error("portable provider plugin package files differ from its exact manifest");
  }
  const declaredDirectories = expectedDirectories(parsed.value.files.map((file) => file.path));
  const actualDirectories = [...walked.directories].sort();
  if (declaredDirectories.length !== actualDirectories.length || declaredDirectories.some((directory, index) => directory !== actualDirectories[index])) {
    throw new Error("portable provider plugin package contains an undeclared or empty directory");
  }
  const walkedFiles = parsed.value.files.map((file) => {
    const walkedEntry = walked.entryByPath.get(file.path);
    if (walkedEntry === undefined || walkedEntry.kind !== "file") {
      throw new Error(`portable provider plugin package no longer contains file ${file.path}`);
    }
    return walkedEntry;
  });
  const payloadFileBytes = readBoundPackageFiles(root, expectedRoot, walkedFiles.map((walkedEntry) => ({
    path: walkedEntry.path,
    directoryExpectations: walkedEntry.directoryExpectations,
    fileExpectation: walkedEntry,
    maximumBytes: MAX_PLUGIN_FILE_BYTES
  })), MAX_PLUGIN_PAYLOAD_BYTES);
  let payloadBytes = 0;
  const files = parsed.value.files.map((file, index) => {
    const bytes = payloadFileBytes[index];
    if (bytes === undefined) {
      throw new Error(`portable provider plugin file ${file.path} was not read`);
    }
    payloadBytes += bytes.byteLength;
    if (bytes.byteLength !== file.bytes) {
      throw new Error(`portable provider plugin file ${file.path} byte length does not match its manifest`);
    }
    const digest = sha2562(bytes);
    if (digest !== file.sha256) {
      throw new Error(`portable provider plugin file ${file.path} digest does not match its manifest`);
    }
    return Object.freeze({
      path: file.path,
      kind: file.kind,
      bytes,
      sha256: digest
    });
  });
  const runtimeFile = files.find((file) => file.kind === "runtime");
  if (runtimeFile === undefined) {
    throw new Error("portable provider plugin runtime file was not read");
  }
  assertSelfContainedPortableRuntime(runtimeFile.path, runtimeFile.bytes);
  if (payloadBytes > MAX_PLUGIN_PAYLOAD_BYTES) {
    throw new Error(`portable provider plugin payload exceeds ${MAX_PLUGIN_PAYLOAD_BYTES} bytes`);
  }
  const rootAfter = lstatSync3(root, { bigint: true });
  const walkedAfter = walkPackage(root, expectedRoot);
  if (!sameRootStats(rootStats, rootAfter) || !sameWalkedPackage(walked, walkedAfter)) {
    throw new Error("portable provider plugin package changed while it was being verified");
  }
  const bundleHash = createHash7("sha256").update("io-portable-provider-plugin-v1\x00").update(canonicalManifest);
  for (const file of files) {
    bundleHash.update("\x00").update(file.path).update("\x00").update(file.kind).update("\x00").update(file.sha256);
  }
  const verified = Object.freeze({
    root,
    manifest: parsed.value,
    manifestBytes: Buffer.from(manifestBytes),
    manifestSha256: sha2562(manifestBytes),
    bundleSha256: bundleHash.digest("hex"),
    payloadBytes,
    files: Object.freeze(files)
  });
  verifiedPortableProviderPluginPackages.add(verified);
  return verified;
}

// src/provider-plugin.ts
var PROVIDER_PLUGIN_API_VERSION = 1;
var providerPluginTransports = [
  "provider-api",
  "web-session-api",
  "linked-device",
  "local-cli"
];
var MAX_PROVIDER_PLUGIN_PLAN_DISPATCHES = 25;
var MAX_PROVIDER_PLUGIN_PLAN_BYTES = 16 * 1024;
var MAX_PROVIDER_PLUGIN_IMPLEMENTATION_SOURCES = 512;
var MAX_PROVIDER_PLUGIN_BINDINGS = 64;
var MAX_PROVIDER_PLUGIN_OPERATIONS_PER_BINDING = 256;
var MAX_PROVIDER_PLUGIN_CONTRACT_VERSIONS_PER_OPERATION = 256;
var MAX_PROVIDER_PLUGIN_OPERATIONS = 4096;
var providerPluginDispatchIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*(?:\[[1-9][0-9]*\])?$/u;
var conformedProviderPluginPlanHooks = new WeakSet;
function hasUnpairedSurrogate(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isFinite(next) || next < 56320 || next > 57343)
        return true;
      index += 1;
    } else if (code >= 56320 && code <= 57343) {
      return true;
    }
  }
  return false;
}
function ownDataProperty(value, key2, label) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key2);
  if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
    throw new Error(`${label} must be an enumerable data property`);
  }
  return descriptor.value;
}
function requirePlainRecord(value, label) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain JSON object`);
  }
}
function cloneFrozenPlanInputValue(value, label) {
  if (typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new Error(`${label} must be a plain JSON array`);
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const rawLength = lengthDescriptor !== undefined && "value" in lengthDescriptor ? lengthDescriptor.value : Number.NaN;
    if (typeof rawLength !== "number" || !Number.isSafeInteger(rawLength) || rawLength < 0 || rawLength > 1000) {
      throw new Error(`${label} must be a bounded dense array`);
    }
    const length = rawLength;
    const expectedKeys = new Set([
      "length",
      ...Array.from({ length }, (_unused, index) => String(index))
    ]);
    const actualKeys = Reflect.ownKeys(value);
    if (actualKeys.length !== expectedKeys.size || actualKeys.some((key2) => !expectedKeys.has(key2))) {
      throw new Error(`${label} must be a bounded dense array`);
    }
    return Object.freeze(Array.from({ length }, (_unused, index) => cloneFrozenPlanInputScalar(ownDataProperty(value, String(index), `${label}[${index}]`), `${label}[${index}]`)));
  }
  return cloneFrozenPlanInputFile(value, label);
}
function cloneFrozenPlanInputScalar(value, label) {
  if (typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  return cloneFrozenPlanInputFile(value, label);
}
function cloneFrozenPlanInputFile(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not JSON-compatible plugin input`);
  }
  requirePlainRecord(value, label);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || !keys.includes("kind") || !keys.includes("reference")) {
    throw new Error(`${label} is not a valid file input`);
  }
  const kind = ownDataProperty(value, "kind", `${label}.kind`);
  const reference = ownDataProperty(value, "reference", `${label}.reference`);
  if (kind !== "file" || typeof reference !== "string") {
    throw new Error(`${label} is not a valid file input`);
  }
  return Object.freeze({ kind: "file", reference });
}
function detachedFrozenPlanInput(input) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("provider plugin plan input must be a JSON object");
  }
  requirePlainRecord(input, "provider plugin plan input");
  const keys = Reflect.ownKeys(input);
  if (keys.length > 100 || keys.some((key2) => typeof key2 !== "string")) {
    throw new Error("provider plugin plan input must be a bounded JSON object");
  }
  const result = {};
  for (const key2 of keys) {
    Object.defineProperty(result, key2, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: cloneFrozenPlanInputValue(ownDataProperty(input, key2, `provider plugin plan input.${key2}`), `provider plugin plan input.${key2}`)
    });
  }
  return Object.freeze(result);
}
function parseProviderPluginDispatches(value, operation, input) {
  const label = `provider plugin operation ${operation.name} planDispatches`;
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${label} must return a plain JSON array`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const rawLength = lengthDescriptor !== undefined && "value" in lengthDescriptor ? lengthDescriptor.value : Number.NaN;
  if (typeof rawLength !== "number" || !Number.isSafeInteger(rawLength) || rawLength < 0 || rawLength > MAX_PROVIDER_PLUGIN_PLAN_DISPATCHES) {
    throw new Error(`${label} may return at most ${MAX_PROVIDER_PLUGIN_PLAN_DISPATCHES} dispatches`);
  }
  const length = rawLength;
  const expectedKeys = new Set([
    "length",
    ...Array.from({ length }, (_unused, index) => String(index))
  ]);
  const actualKeys = Reflect.ownKeys(value);
  if (actualKeys.length !== expectedKeys.size || actualKeys.some((key2) => !expectedKeys.has(key2))) {
    throw new Error(`${label} must return a dense array without extra properties`);
  }
  const dispatches = [];
  const ids = new Set;
  for (let index = 0;index < length; index += 1) {
    const candidate = ownDataProperty(value, String(index), `${label}[${index}]`);
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new Error(`${label}[${index}] must be a plain JSON object`);
    }
    requirePlainRecord(candidate, `${label}[${index}]`);
    const keys = Reflect.ownKeys(candidate);
    if (keys.length !== 2 || !keys.includes("id") || !keys.includes("description")) {
      throw new Error(`${label}[${index}] must contain only id and description`);
    }
    const id = ownDataProperty(candidate, "id", `${label}[${index}].id`);
    const description = ownDataProperty(candidate, "description", `${label}[${index}].description`);
    if (typeof id !== "string" || id.length > 80 || !providerPluginDispatchIdPattern.test(id)) {
      throw new Error(`${label}[${index}] has an invalid dispatch ID`);
    }
    if (ids.has(id)) {
      throw new Error(`${label} returned duplicate dispatch ID ${id}`);
    }
    if (typeof description !== "string" || description.length < 1 || description.length > 500 || hasControlCharacters(description) || hasUnpairedSurrogate(description)) {
      throw new Error(`${label}[${index}] has an invalid description`);
    }
    ids.add(id);
    dispatches.push(Object.freeze({ id, description }));
  }
  if (operation.risk === "R1" && dispatches.length !== 0) {
    throw new Error("R1 operations must not schedule remote dispatches");
  }
  if ((operation.risk === "R2" || operation.risk === "R3") && dispatches.length === 0) {
    throw new Error(`${label} must return at least one dispatch for ${operation.risk}`);
  }
  if (operation.dispatch === "none" && dispatches.length !== 0) {
    throw new Error(`${label} must return no dispatches for dispatch policy none`);
  }
  if (operation.dispatch === "single" && dispatches.length !== 1) {
    throw new Error(`${label} must return exactly one dispatch for dispatch policy single`);
  }
  if (operation.dispatch === "thread-items") {
    const items = input.items;
    if (!Array.isArray(items) || items.length < 1 || dispatches.length !== items.length) {
      throw new Error(`${label} must return exactly one dispatch for each input.items value`);
    }
  }
  const result = Object.freeze(dispatches);
  const encoded = JSON.stringify(result);
  if (Buffer.byteLength(encoded, "utf8") > MAX_PROVIDER_PLUGIN_PLAN_BYTES) {
    throw new Error(`${label} exceeds its ${MAX_PROVIDER_PLUGIN_PLAN_BYTES}-byte canonical JSON bound`);
  }
  return result;
}
function runUntrustedProviderPluginPlanConformance(operation, input) {
  const plan = () => {
    const detachedInput = detachedFrozenPlanInput(input);
    const returned = operation.planDispatches(detachedInput);
    return parseProviderPluginDispatches(returned, operation, detachedInput);
  };
  const first = plan();
  const second = plan();
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error(`provider plugin operation ${operation.name} planDispatches is unstable for identical input`);
  }
  return first;
}
function runProviderPluginPlanConformance(operation, input) {
  if (conformedProviderPluginPlanHooks.has(operation.planDispatches)) {
    return operation.planDispatches(input);
  }
  return runUntrustedProviderPluginPlanConformance(operation, input);
}
function conformingProviderPluginPlanDispatches(operation) {
  const cache2 = new WeakMap;
  const planDispatches = (input) => {
    const existing = cache2.get(input);
    if (existing !== undefined)
      return existing;
    const planned = runUntrustedProviderPluginPlanConformance(operation, input);
    cache2.set(input, planned);
    return planned;
  };
  conformedProviderPluginPlanHooks.add(planDispatches);
  return planDispatches;
}
var pluginVersionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;
var sourceLabelPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/u;
var authKinds = new Set([
  "cookie-source",
  "cookies-file",
  "browser-profile",
  "oauth-token-file",
  "linked-device-store"
]);
var validatedProviderPlugins = new WeakSet;
var portableProviderPluginArtifacts = new WeakMap;
var portableProviderPluginAdapters = new WeakMap;
var portableProviderPluginOperationIdentities = new WeakMap;
var portableProviderPluginSubjectProbeIdentities = new WeakMap;
var providerPluginEvaluationSourceDigests = new WeakMap;
var providerPluginEvaluationInstalledPackageDigests = new WeakMap;
var providerPluginSourceRoot = realpathSync2(fileURLToPath2(new URL(".", import.meta.url)));
function recordValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function packageUsesWorkspaceDependencies(packageRoot) {
  let value;
  try {
    value = JSON.parse(readFileSync(resolve3(packageRoot, "package.json"), "utf8"));
  } catch {
    return false;
  }
  if (!recordValue(value))
    return false;
  const protocol = ["workspace", ":"].join("");
  return ["dependencies", "devDependencies", "optionalDependencies"].some((field) => {
    const dependencies = value[field];
    return recordValue(dependencies) && Object.values(dependencies).some((specifier) => typeof specifier === "string" && specifier.startsWith(protocol));
  });
}
function enclosingWorkspaceRoot(packageRoot) {
  if (!packageUsesWorkspaceDependencies(packageRoot))
    return packageRoot;
  let candidate = dirname3(packageRoot);
  for (;; ) {
    const manifestPath = resolve3(candidate, "package.json");
    if (existsSync2(manifestPath)) {
      try {
        const value = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (recordValue(value) && (Array.isArray(value.workspaces) || recordValue(value.workspaces))) {
          return realpathSync2(candidate);
        }
      } catch {}
    }
    const parent = dirname3(candidate);
    if (parent === candidate) {
      throw new Error("Ghostget workspace dependencies have no enclosing workspace root");
    }
    candidate = parent;
  }
}
function isWithinProviderPluginPhysicalRoot(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || path !== ".." && !path.startsWith(`..${sep}`);
}
function physicalNodeModulesPackage(entryPath) {
  const parsed = parse(entryPath);
  const segments = entryPath.slice(parsed.root.length).split(sep);
  for (let index = segments.length - 1;index >= 0; index -= 1) {
    if (segments[index] !== "node_modules")
      continue;
    const first = segments[index + 1];
    if (first === undefined || first === "")
      continue;
    const packageSegments = first.startsWith("@") ? segments[index + 2] === undefined ? undefined : [first, segments[index + 2]] : [first];
    if (packageSegments === undefined)
      continue;
    const root = resolve3(parsed.root, ...segments.slice(0, index + 1 + packageSegments.length));
    if (isWithinProviderPluginPhysicalRoot(root, entryPath) && existsSync2(resolve3(root, "package.json"))) {
      return Object.freeze({
        nodeModulesDirectory: resolve3(parsed.root, ...segments.slice(0, index + 1)),
        root
      });
    }
  }
  return;
}
function enclosingNodeModulesBoundary(packageRoot) {
  const owner = physicalNodeModulesPackage(packageRoot);
  if (owner === undefined || owner.root !== packageRoot)
    return;
  const bunInstanceDirectory = dirname3(owner.nodeModulesDirectory);
  const bunStoreDirectory = dirname3(bunInstanceDirectory);
  const bunInstallNodeModules = dirname3(bunStoreDirectory);
  return basename2(bunStoreDirectory) === ".bun" && basename2(bunInstallNodeModules) === "node_modules" ? bunInstallNodeModules : owner.nodeModulesDirectory;
}
var providerPluginPackageRoot = realpathSync2(resolve3(providerPluginSourceRoot, ".."));
var providerPluginRepositoryRoot = enclosingWorkspaceRoot(providerPluginPackageRoot);
var providerPluginInstallationNodeModulesBoundary = enclosingNodeModulesBoundary(providerPluginPackageRoot);
function isProviderPluginRepositorySourcePath(repositoryRoot, path) {
  const repositoryRelative = relative(repositoryRoot, path);
  return (repositoryRelative === "" || repositoryRelative !== ".." && !repositoryRelative.startsWith(`..${sep}`)) && (repositoryRelative === "" || !repositoryRelative.split(sep).includes("node_modules"));
}
function classifyProviderPluginPhysicalPath(path) {
  const repositoryRelative = relative(providerPluginRepositoryRoot, path);
  const withinRepository = repositoryRelative === "" || repositoryRelative !== ".." && !repositoryRelative.startsWith(`..${sep}`);
  if (isProviderPluginRepositorySourcePath(providerPluginRepositoryRoot, path)) {
    return Object.freeze({ kind: "repository" });
  }
  if (!withinRepository && (providerPluginInstallationNodeModulesBoundary === undefined || !isWithinProviderPluginPhysicalRoot(providerPluginInstallationNodeModulesBoundary, path))) {
    throw new Error("provider plugin physical path resolves outside the repository and checked package installation");
  }
  const owner = physicalNodeModulesPackage(path);
  if (owner === undefined || providerPluginInstallationNodeModulesBoundary !== undefined && !withinRepository && !isWithinProviderPluginPhysicalRoot(providerPluginInstallationNodeModulesBoundary, owner.root)) {
    throw new Error("provider plugin physical path has no physical node_modules owner");
  }
  return Object.freeze({ kind: "installed-package", root: owner.root });
}
var providerPluginApiBoundaryPath = realpathSync2(resolve3(providerPluginSourceRoot, "provider-plugin.ts"));
var MAX_PROVIDER_PLUGIN_EVALUATION_SOURCE_BYTES = 16 * 1024 * 1024;
var MAX_PROVIDER_PLUGIN_EVALUATION_CLOSURE_SOURCES = 2000;
var MAX_PROVIDER_PLUGIN_EVALUATION_CLOSURE_BYTES = 128 * 1024 * 1024;
var MAX_PROVIDER_PLUGIN_EVALUATION_IMPORTS_PER_MODULE = 4096;
var MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGES = 128;
var MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_FILES = 4096;
var MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_DIRECTORIES = 1024;
var MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_DEPTH = 32;
var MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_PATH_BYTES = 1024;
var MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_BYTES = 128 * 1024 * 1024;
var MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_CACHE_ENTRIES = 256;
var providerPluginEvaluationModuleExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".mjs",
  ".mts",
  ".ts"
]);
var providerPluginEvaluationRuntimeBuiltins = new Set(builtinModules.flatMap((name) => name.startsWith("node:") ? [name, name.slice("node:".length)] : [name]));
var providerPluginEvaluationPackageCache = new Map;
function sameEvaluationSourceSnapshot(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mode === right.mode && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
function isProviderPluginInstalledBinaryDirectory(relativeDirectory) {
  return relativeDirectory === "node_modules/.bin" || relativeDirectory.endsWith("/node_modules/.bin");
}
function providerPluginInstalledGuardDirectorySnapshot(path, label) {
  let before;
  try {
    before = lstatSync4(path, { bigint: true });
  } catch {
    throw new Error(`${label} changed while it was bound`);
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (before.isSymbolicLink() || !before.isDirectory() || uid !== undefined && before.uid !== BigInt(uid) || (before.mode & 0o022n) !== 0n) {
    throw new Error(`${label} is unsafe`);
  }
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0) | ("O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0));
  } catch {
    throw new Error(`${label} changed while it was bound`);
  }
  try {
    const bound = fstatSync(descriptor, { bigint: true });
    let current;
    try {
      current = lstatSync4(path, { bigint: true });
    } catch {
      throw new Error(`${label} changed while it was bound`);
    }
    if (current.isSymbolicLink() || !current.isDirectory() || !sameEvaluationSourceSnapshot(before, bound) || !sameEvaluationSourceSnapshot(bound, current)) {
      throw new Error(`${label} changed while it was bound`);
    }
    return before;
  } finally {
    closeSync(descriptor);
  }
}
function providerPluginCanonicalInstalledBinaryLinkTarget(root, linkPath, initialStats, maximumPathBytes, label) {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (!initialStats.isSymbolicLink() || uid !== undefined && initialStats.uid !== BigInt(uid)) {
    throw new Error(`${label} is not an owned symbolic link`);
  }
  let firstTargetBytes;
  let secondTargetBytes;
  let middleStats;
  let finalStats;
  try {
    firstTargetBytes = readlinkSync(linkPath, { encoding: "buffer" });
    middleStats = lstatSync4(linkPath, { bigint: true });
    secondTargetBytes = readlinkSync(linkPath, { encoding: "buffer" });
    finalStats = lstatSync4(linkPath, { bigint: true });
  } catch {
    throw new Error(`${label} changed while it was read`);
  }
  if (firstTargetBytes.byteLength < 1 || firstTargetBytes.byteLength > maximumPathBytes || !firstTargetBytes.equals(secondTargetBytes) || !middleStats.isSymbolicLink() || !finalStats.isSymbolicLink() || !sameEvaluationSourceSnapshot(initialStats, middleStats) || !sameEvaluationSourceSnapshot(middleStats, finalStats)) {
    throw new Error(`${label} changed while it was read`);
  }
  let targetText;
  try {
    targetText = new TextDecoder("utf-8", { fatal: true }).decode(firstTargetBytes);
  } catch {
    throw new Error(`${label} has invalid target text`);
  }
  if (targetText.includes("\x00") || targetText.includes("\\") || isAbsolute2(targetText)) {
    throw new Error(`${label} has an unsafe target`);
  }
  const lexicalTarget = resolve3(dirname3(linkPath), targetText);
  const targetPath = relative(root, lexicalTarget).split(sep).join("/");
  const canonicalTargetText = relative(dirname3(linkPath), lexicalTarget).split(sep).join("/");
  if (targetText !== canonicalTargetText || targetPath === "" || targetPath === "." || targetPath.includes("\\") || targetPath.includes("\x00") || Buffer.byteLength(targetPath, "utf8") > maximumPathBytes || !isWithinProviderPluginPhysicalRoot(root, lexicalTarget)) {
    throw new Error(`${label} has a noncanonical or escaping target`);
  }
  let physicalTarget;
  let targetStats;
  try {
    physicalTarget = realpathSync2(linkPath);
    targetStats = lstatSync4(lexicalTarget, { bigint: true });
  } catch {
    throw new Error(`${label} target is missing`);
  }
  if (physicalTarget !== lexicalTarget || !targetStats.isFile() || targetStats.isSymbolicLink() || uid !== undefined && targetStats.uid !== BigInt(uid)) {
    throw new Error(`${label} target is not one canonical owned regular file`);
  }
  return Object.freeze({ path: targetPath, stats: targetStats });
}
function readOwnedBoundedProviderPluginEvaluationFile(path, maximumBytes, label) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0) | ("O_NONBLOCK" in constants ? constants.O_NONBLOCK : 0));
  } catch {
    throw new Error(`${label} is unreadable`);
  }
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    if (!before.isFile() || uid !== undefined && before.uid !== BigInt(uid) || before.size < 0n || before.size > BigInt(maximumBytes)) {
      throw new Error(`${label} is not an owned bounded regular file`);
    }
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      if (count === 0)
        break;
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    let current;
    try {
      current = lstatSync4(path, { bigint: true });
    } catch {
      throw new Error(`${label} changed while its definition was evaluated`);
    }
    if (offset !== bytes.byteLength || current.isSymbolicLink() || !current.isFile() || !sameEvaluationSourceSnapshot(before, after) || !sameEvaluationSourceSnapshot(after, current)) {
      throw new Error(`${label} changed while its definition was evaluated`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}
function readProviderPluginEvaluationSource(pluginId, path, label) {
  return readOwnedBoundedProviderPluginEvaluationFile(path, MAX_PROVIDER_PLUGIN_EVALUATION_SOURCE_BYTES, `provider plugin ${pluginId} implementation source ${label}`);
}
function compareProviderPluginEvaluationText(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
function walkProviderPluginEvaluationPackageTree(root) {
  const entries = [];
  const capturedFiles = new Map;
  const capturedGuardDirectories = new Map;
  let fileCount = 0;
  let linkCount = 0;
  let directoryCount = 0;
  let totalBytes = 0;
  const captureFile = (relativePath, stats) => {
    const existing = capturedFiles.get(relativePath);
    if (existing !== undefined) {
      if (!sameEvaluationSourceSnapshot(existing, stats)) {
        throw new Error(`provider plugin evaluation package file ${relativePath} changed while it was walked`);
      }
      return;
    }
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    if (!stats.isFile() || stats.isSymbolicLink() || uid !== undefined && stats.uid !== BigInt(uid)) {
      throw new Error(`provider plugin evaluation package tree contains unsupported entry ${relativePath}`);
    }
    fileCount += 1;
    if (fileCount + linkCount > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_FILES) {
      throw new Error("provider plugin evaluation package tree exceeds its file bound");
    }
    if (stats.size < 0n || stats.size > BigInt(MAX_PROVIDER_PLUGIN_EVALUATION_SOURCE_BYTES)) {
      throw new Error(`provider plugin evaluation package file ${relativePath} exceeds its byte bound`);
    }
    totalBytes += Number(stats.size);
    if (totalBytes > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_BYTES) {
      throw new Error("provider plugin evaluation package tree exceeds its total byte bound");
    }
    capturedFiles.set(relativePath, stats);
    entries.push(Object.freeze({
      path: relativePath,
      kind: "file",
      stats
    }));
  };
  const captureGuardDirectory = (relativePath) => {
    const stats = providerPluginInstalledGuardDirectorySnapshot(resolve3(root, relativePath), `provider plugin evaluation package directory ${relativePath}`);
    const existing = capturedGuardDirectories.get(relativePath);
    if (existing !== undefined) {
      if (!sameEvaluationSourceSnapshot(existing, stats)) {
        throw new Error(`provider plugin evaluation installed binary directory ${relativePath} changed while it was walked`);
      }
      return;
    }
    directoryCount += 1;
    if (directoryCount > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_DIRECTORIES) {
      throw new Error("provider plugin evaluation package tree exceeds its directory bound");
    }
    capturedGuardDirectories.set(relativePath, stats);
    entries.push(Object.freeze({
      path: relativePath,
      kind: "guard-directory",
      stats
    }));
  };
  const captureTargetGuardDirectories = (targetPath) => {
    const parent = dirname3(targetPath).split(sep).join("/");
    if (parent === ".")
      return;
    const segments = parent.split("/");
    if (segments.length > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_DEPTH) {
      throw new Error("provider plugin evaluation package tree exceeds its depth bound");
    }
    for (let index = 1;index <= segments.length; index += 1) {
      captureGuardDirectory(segments.slice(0, index).join("/"));
    }
  };
  const visit = (directoryPath, relativeDirectory, depth) => {
    if (depth > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_DEPTH) {
      throw new Error("provider plugin evaluation package tree exceeds its depth bound");
    }
    let before;
    try {
      before = lstatSync4(directoryPath, { bigint: true });
    } catch {
      throw new Error(`provider plugin evaluation package directory ${relativeDirectory || "."} changed while it was walked`);
    }
    const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
    if (before.isSymbolicLink() || !before.isDirectory() || uid !== undefined && before.uid !== BigInt(uid) || (before.mode & 0o022n) !== 0n) {
      throw new Error(`provider plugin evaluation package directory ${relativeDirectory || "."} is unsafe`);
    }
    directoryCount += 1;
    if (directoryCount > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_DIRECTORIES) {
      throw new Error("provider plugin evaluation package tree exceeds its directory bound");
    }
    entries.push(Object.freeze({
      path: relativeDirectory === "" ? "." : relativeDirectory,
      kind: "directory",
      stats: before
    }));
    const descriptor = openSync(directoryPath, constants.O_RDONLY | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0) | ("O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0));
    try {
      const bound = fstatSync(descriptor, { bigint: true });
      if (!bound.isDirectory() || !sameEvaluationSourceSnapshot(before, bound)) {
        throw new Error(`provider plugin evaluation package directory ${relativeDirectory || "."} changed while it was bound`);
      }
      const names = [];
      const directory = opendirSync(directoryPath);
      try {
        for (;; ) {
          const entry = directory.readSync();
          if (entry === null)
            break;
          names.push(entry.name);
          if (names.length > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_FILES + MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_DIRECTORIES || entries.length + names.length > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_FILES + MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_DIRECTORIES) {
            throw new Error("provider plugin evaluation package tree exceeds its entry bound");
          }
        }
      } finally {
        directory.closeSync();
      }
      names.sort(compareProviderPluginEvaluationText);
      for (const name of names) {
        const relativePath = relativeDirectory === "" ? name : `${relativeDirectory}/${name}`;
        if (name === "." || name === ".." || name.includes("/") || relativePath.includes("\\") || relativePath.includes("\x00") || Buffer.byteLength(relativePath, "utf8") > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_PATH_BYTES) {
          throw new Error("provider plugin evaluation package tree contains an unsafe path");
        }
        const path = resolve3(directoryPath, name);
        let stats;
        try {
          stats = lstatSync4(path, { bigint: true });
        } catch {
          throw new Error(`provider plugin evaluation package entry ${relativePath} changed while it was walked`);
        }
        if (stats.isSymbolicLink()) {
          if (!isProviderPluginInstalledBinaryDirectory(relativeDirectory)) {
            throw new Error(`provider plugin evaluation package tree contains symlink ${relativePath}`);
          }
          linkCount += 1;
          if (fileCount + linkCount > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_FILES) {
            throw new Error("provider plugin evaluation package tree exceeds its file bound");
          }
          const target = providerPluginCanonicalInstalledBinaryLinkTarget(root, path, stats, MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_PATH_BYTES, `provider plugin evaluation npm binary link ${relativePath}`);
          totalBytes += Buffer.byteLength(target.path, "utf8");
          if (totalBytes > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_BYTES) {
            throw new Error("provider plugin evaluation package tree exceeds its total byte bound");
          }
          entries.push(Object.freeze({
            path: relativePath,
            kind: "link",
            stats,
            targetPath: target.path
          }));
          captureTargetGuardDirectories(target.path);
          captureFile(target.path, target.stats);
          continue;
        }
        if (stats.isDirectory()) {
          if (isProviderPluginInstalledBinaryDirectory(relativeDirectory)) {
            throw new Error(`provider plugin evaluation package tree contains unsupported entry ${relativePath}`);
          }
          if (name === "node_modules") {
            const binaryDirectory = resolve3(path, ".bin");
            const binaryStats = lstatSync4(binaryDirectory, {
              bigint: true,
              throwIfNoEntry: false
            });
            if (binaryStats !== undefined) {
              captureGuardDirectory(relativePath);
              visit(binaryDirectory, `${relativePath}/.bin`, depth + 2);
            }
            continue;
          }
          visit(path, relativePath, depth + 1);
          continue;
        }
        captureFile(relativePath, stats);
      }
      const after = fstatSync(descriptor, { bigint: true });
      let current;
      try {
        current = lstatSync4(directoryPath, { bigint: true });
      } catch {
        throw new Error(`provider plugin evaluation package directory ${relativeDirectory || "."} changed while it was walked`);
      }
      if (current.isSymbolicLink() || !current.isDirectory() || !sameEvaluationSourceSnapshot(before, after) || !sameEvaluationSourceSnapshot(after, current)) {
        throw new Error(`provider plugin evaluation package directory ${relativeDirectory || "."} changed while it was walked`);
      }
    } finally {
      closeSync(descriptor);
    }
  };
  visit(root, "", 0);
  entries.sort((left, right) => compareProviderPluginEvaluationText(left.path, right.path) || compareProviderPluginEvaluationText(left.kind, right.kind));
  return Object.freeze({
    entries: Object.freeze(entries),
    fileCount,
    linkCount,
    directoryCount,
    totalBytes
  });
}
function sameProviderPluginEvaluationPackageTree(left, right) {
  return left.fileCount === right.fileCount && left.linkCount === right.linkCount && left.directoryCount === right.directoryCount && left.totalBytes === right.totalBytes && left.entries.length === right.entries.length && left.entries.every((entry, index) => {
    const current = right.entries[index];
    return current !== undefined && entry.path === current.path && entry.kind === current.kind && (entry.kind !== "link" || current.kind === "link" && entry.targetPath === current.targetPath) && sameEvaluationSourceSnapshot(entry.stats, current.stats);
  });
}
function updateProviderPluginEvaluationTreeHash(hash, label, bytes) {
  const labelBytes = Buffer.from(label, "utf8");
  const lengths = Buffer.alloc(12);
  lengths.writeUInt32BE(labelBytes.byteLength, 0);
  lengths.writeBigUInt64BE(BigInt(bytes.byteLength), 4);
  hash.update(lengths).update(labelBytes).update(bytes);
}
function providerPluginDurableInstalledPackageMode(kind, mode) {
  if (kind === "directory")
    return 493;
  return (mode & 73) === 0 ? 420 : 493;
}
function snapshotProviderPluginEvaluationPackage(root) {
  const firstWalk = walkProviderPluginEvaluationPackageTree(root);
  const cached = providerPluginEvaluationPackageCache.get(root);
  if (cached !== undefined && sameProviderPluginEvaluationPackageTree(cached.verificationWalk, firstWalk))
    return cached;
  const files = [];
  const links = [];
  const directories = [];
  for (const entry of firstWalk.entries) {
    if (entry.kind === "guard-directory")
      continue;
    if (entry.kind === "directory") {
      directories.push(Object.freeze({
        path: entry.path,
        mode: Number(entry.stats.mode & 0o777n)
      }));
      continue;
    }
    if (entry.kind === "link") {
      links.push(Object.freeze({
        path: entry.path,
        targetPath: entry.targetPath
      }));
      continue;
    }
    const path = resolve3(root, entry.path);
    const bytes = readOwnedBoundedProviderPluginEvaluationFile(path, MAX_PROVIDER_PLUGIN_EVALUATION_SOURCE_BYTES, `provider plugin evaluation package file ${entry.path}`);
    let current;
    try {
      current = lstatSync4(path, { bigint: true });
    } catch {
      throw new Error(`provider plugin evaluation package file ${entry.path} changed while it was snapshotted`);
    }
    if (bytes.byteLength !== Number(entry.stats.size) || current.isSymbolicLink() || !current.isFile() || !sameEvaluationSourceSnapshot(entry.stats, current)) {
      throw new Error(`provider plugin evaluation package file ${entry.path} changed while it was snapshotted`);
    }
    files.push(Object.freeze({
      path: entry.path,
      bytes,
      mode: Number(entry.stats.mode & 0o777n)
    }));
  }
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  for (const link of links) {
    if (!filesByPath.has(link.targetPath)) {
      throw new Error(`provider plugin evaluation npm binary link ${link.path} target is not part of the captured package tree`);
    }
  }
  const secondWalk = walkProviderPluginEvaluationPackageTree(root);
  if (!sameProviderPluginEvaluationPackageTree(firstWalk, secondWalk)) {
    throw new Error("provider plugin evaluation package tree changed while it was snapshotted");
  }
  const manifest = files.find((file) => file.path === "package.json");
  let manifestValue;
  try {
    manifestValue = manifest === undefined ? undefined : JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifest.bytes));
  } catch {
    throw new Error(`provider plugin evaluation package manifest ${root} is invalid`);
  }
  if (typeof manifestValue !== "object" || manifestValue === null || Array.isArray(manifestValue)) {
    throw new Error(`provider plugin evaluation package manifest ${root} has no identity`);
  }
  const packageName = manifestValue.name;
  const packageVersion = manifestValue.version;
  if (typeof packageName !== "string" || typeof packageVersion !== "string") {
    throw new Error(`provider plugin evaluation package manifest ${root} has no identity`);
  }
  const treeHash = createHash8("sha256");
  treeHash.update("provider-plugin-installed-package-tree@2\x00");
  updateProviderPluginEvaluationTreeHash(treeHash, "identity", Buffer.from(`${packageName}@${packageVersion}`, "utf8"));
  for (const directory of directories) {
    const durableMode = providerPluginDurableInstalledPackageMode("directory", directory.mode);
    updateProviderPluginEvaluationTreeHash(treeHash, `directory/${directory.path}`, Buffer.from(`mode:${durableMode.toString(8)}`, "utf8"));
  }
  for (const file of files) {
    const durableMode = providerPluginDurableInstalledPackageMode("file", file.mode);
    updateProviderPluginEvaluationTreeHash(treeHash, `file-mode/${file.path}`, Buffer.from(`mode:${durableMode.toString(8)}`, "utf8"));
    updateProviderPluginEvaluationTreeHash(treeHash, `file/${file.path}`, file.bytes);
  }
  for (const link of links) {
    if (!filesByPath.has(link.targetPath)) {
      throw new Error(`provider plugin evaluation npm binary link ${link.path} target is unavailable`);
    }
    updateProviderPluginEvaluationTreeHash(treeHash, `link/${link.path}`, Buffer.from(link.targetPath, "utf8"));
  }
  const snapshot = Object.freeze({
    treeSha256: treeHash.digest("hex"),
    totalBytes: firstWalk.totalBytes,
    verificationWalk: secondWalk
  });
  if (!providerPluginEvaluationPackageCache.has(root) && providerPluginEvaluationPackageCache.size >= MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_CACHE_ENTRIES) {
    providerPluginEvaluationPackageCache.clear();
  }
  providerPluginEvaluationPackageCache.set(root, snapshot);
  return snapshot;
}
function providerPluginEvaluationValueImports(bytes, path) {
  const extension = extname(path);
  if (extension === ".jsx" || extension === ".tsx") {
    throw new Error(`provider plugin evaluation module ${path} uses configuration-dependent JSX or TSX`);
  }
  if (!providerPluginEvaluationModuleExtensions.has(extension)) {
    return Object.freeze([]);
  }
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^#![^\r\n]*(?:\r?\n|$)/u, "");
  } catch {
    throw new Error(`provider plugin evaluation module ${path} must be valid UTF-8`);
  }
  const loader = extension === ".ts" || extension === ".mts" || extension === ".cts" ? "ts" : "js";
  const imports = scanProviderPluginValueImports(source, loader);
  if (imports.length > MAX_PROVIDER_PLUGIN_EVALUATION_IMPORTS_PER_MODULE) {
    throw new Error(`provider plugin evaluation module ${path} has too many static imports`);
  }
  return imports;
}
function resolveProviderPluginEvaluationImport(importerPath, specifier, importKind) {
  if (specifier.startsWith("node:") || specifier.startsWith("bun:") || providerPluginEvaluationRuntimeBuiltins.has(specifier))
    return;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(specifier)) {
    throw new Error(`provider plugin evaluation module ${importerPath} imports unsupported absolute or URL dependency ${specifier}`);
  }
  let resolvedPath;
  try {
    if (isAbsolute2(specifier)) {
      resolvedPath = specifier;
    } else {
      resolvedPath = importKind === "require-call" ? createRequire(importerPath).resolve(specifier) : Bun.resolveSync(specifier, dirname3(importerPath));
    }
  } catch (error) {
    throw new Error(`provider plugin evaluation module ${importerPath} has unresolved static dependency ${specifier}`, { cause: error });
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(resolvedPath) || !isAbsolute2(resolvedPath)) {
    throw new Error(`provider plugin evaluation dependency ${specifier} did not resolve to a local file`);
  }
  let path;
  try {
    path = realpathSync2(resolvedPath);
  } catch (error) {
    throw new Error(`provider plugin evaluation dependency ${specifier} resolved to an unreadable path`, { cause: error });
  }
  classifyProviderPluginPhysicalPath(path);
  if (path === providerPluginApiBoundaryPath)
    return;
  return path;
}
function captureProviderPluginEvaluationIdentity(pluginId, sources) {
  const sourceDigests = new Map;
  const sourceBytes = new Map;
  let totalSourceBytes = 0;
  const captureRepositorySource = (path, label) => {
    const existing = sourceBytes.get(path);
    if (existing !== undefined)
      return existing;
    if (sourceDigests.size >= MAX_PROVIDER_PLUGIN_EVALUATION_CLOSURE_SOURCES) {
      throw new Error(`provider plugin ${pluginId} evaluation source closure exceeds its file bound`);
    }
    const bytes = readProviderPluginEvaluationSource(pluginId, path, label);
    if (totalSourceBytes + bytes.byteLength > MAX_PROVIDER_PLUGIN_EVALUATION_CLOSURE_BYTES) {
      throw new Error(`provider plugin ${pluginId} evaluation source closure exceeds its byte bound`);
    }
    totalSourceBytes += bytes.byteLength;
    sourceBytes.set(path, bytes);
    sourceDigests.set(path, createHash8("sha256").update(bytes).digest("hex"));
    return bytes;
  };
  for (const source of sources) {
    captureRepositorySource(source.path, source.label);
  }
  const pluginEntry = sources.find((source) => source.label === "plugin.ts");
  if (pluginEntry === undefined) {
    throw new Error(`provider plugin ${pluginId} must bind its plugin.ts implementation source`);
  }
  const pending = [pluginEntry.path];
  const analyzedModules = new Set;
  const installedPackageDigests = new Map;
  let installedPackageBytes = 0;
  while (pending.length > 0) {
    pending.sort(compareProviderPluginEvaluationText);
    const path = pending.pop();
    if (path === undefined || analyzedModules.has(path))
      continue;
    analyzedModules.add(path);
    let bytes;
    const physicalPath = classifyProviderPluginPhysicalPath(path);
    if (physicalPath.kind === "installed-package") {
      const root = physicalPath.root;
      if (!installedPackageDigests.has(root)) {
        if (installedPackageDigests.size >= MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGES) {
          throw new Error(`provider plugin ${pluginId} evaluation package closure exceeds its package bound`);
        }
        const snapshot = snapshotProviderPluginEvaluationPackage(root);
        if (installedPackageBytes + snapshot.totalBytes > MAX_PROVIDER_PLUGIN_EVALUATION_PACKAGE_BYTES) {
          throw new Error(`provider plugin ${pluginId} evaluation package closure exceeds its byte bound`);
        }
        installedPackageBytes += snapshot.totalBytes;
        installedPackageDigests.set(root, snapshot.treeSha256);
      }
      bytes = readOwnedBoundedProviderPluginEvaluationFile(path, MAX_PROVIDER_PLUGIN_EVALUATION_SOURCE_BYTES, `provider plugin ${pluginId} evaluation package module ${relative(providerPluginRepositoryRoot, path)}`);
    } else {
      bytes = captureRepositorySource(path, relative(providerPluginRepositoryRoot, path).split(sep).join("/"));
    }
    for (const dependency of providerPluginEvaluationValueImports(bytes, path)) {
      const child = resolveProviderPluginEvaluationImport(path, dependency.path, dependency.kind);
      if (child !== undefined && !analyzedModules.has(child)) {
        pending.push(child);
      }
    }
  }
  return Object.freeze({
    sourceDigests: new Map([...sourceDigests.entries()].sort(([left], [right]) => compareProviderPluginEvaluationText(left, right))),
    installedPackageDigests: new Map([...installedPackageDigests.entries()].sort(([left], [right]) => compareProviderPluginEvaluationText(left, right)))
  });
}
function isValidatedProviderPlugin(value) {
  return validatedProviderPlugins.has(value);
}
function providerPluginEvaluationSourceSha256(plugin) {
  return providerPluginEvaluationSourceDigests.get(plugin);
}
function providerPluginEvaluationInstalledPackageSha256(plugin) {
  return providerPluginEvaluationInstalledPackageDigests.get(plugin);
}
function portableProviderPluginArtifactSha256(plugin) {
  return portableProviderPluginArtifacts.get(plugin) ?? null;
}
function portableProviderPluginAdapter(binding) {
  return portableProviderPluginAdapters.get(binding) ?? null;
}
function portableProviderPluginOperationIdentity(binding, operation, contractVersion) {
  return portableProviderPluginOperationIdentities.get(binding)?.get(`${operation.name}@${contractVersion}`) ?? null;
}
function requireExactKeys(value, allowed, label) {
  const allowedKeys2 = new Set(allowed);
  const unexpected = Object.keys(value).filter((key2) => !allowedKeys2.has(key2)).sort();
  if (unexpected.length > 0) {
    throw new Error(`${label} contains unsupported keys: ${unexpected.join(", ")}`);
  }
}
function snapshotExactEnumerableDataProperties(value, keys, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object`);
  }
  const expectedKeys = new Set(keys);
  const actualKeys = Reflect.ownKeys(value);
  if (actualKeys.length !== expectedKeys.size || actualKeys.some((key2) => !expectedKeys.has(key2))) {
    throw new Error(`${label} must contain exactly ${keys.join(", ")}`);
  }
  return Object.freeze(keys.map((key2) => ownDataProperty(value, key2, `${label}.${key2}`)));
}
function parseProviderPluginReconciliationContextV1(value) {
  const [schemaVersion, kind, dispatchValue, targetValue] = snapshotExactEnumerableDataProperties(value, ["schemaVersion", "kind", "dispatch", "target"], "provider plugin reconciliation context");
  if (schemaVersion !== 1 || kind !== "provider-accepted-target-presence" && kind !== "provider-bound-target-desired-state") {
    throw new Error("provider plugin reconciliation context is malformed");
  }
  const [dispatchId, dispatchIndex, dispatchPlanned] = snapshotExactEnumerableDataProperties(dispatchValue, ["id", "index", "planned"], "provider plugin reconciliation context dispatch");
  if (typeof dispatchId !== "string" || dispatchId.length > 256 || !providerPluginDispatchIdPattern.test(dispatchId) || !Number.isSafeInteger(dispatchIndex) || !Number.isSafeInteger(dispatchPlanned) || dispatchIndex < 1 || dispatchPlanned !== 1 || dispatchIndex !== dispatchPlanned) {
    throw new Error("provider plugin reconciliation context dispatch is malformed");
  }
  const [targetSchemaVersion, targetIdentifier] = snapshotExactEnumerableDataProperties(targetValue, ["schemaVersion", "identifier"], "provider plugin reconciliation context target");
  if (targetSchemaVersion !== 1 || typeof targetIdentifier !== "string" || targetIdentifier.length < 1 || Buffer.byteLength(targetIdentifier, "utf8") > 8 * 1024 || hasUnpairedSurrogate(targetIdentifier) || [...targetIdentifier].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint === undefined || codePoint === 127 || codePoint < 32;
  })) {
    throw new Error("provider plugin reconciliation context target is malformed");
  }
  return Object.freeze({
    schemaVersion: 1,
    kind,
    dispatch: Object.freeze({
      id: dispatchId,
      index: dispatchIndex,
      planned: dispatchPlanned
    }),
    target: Object.freeze({
      schemaVersion: 1,
      identifier: targetIdentifier
    })
  });
}
function requireNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new Error(`${label} must be a non-empty array`);
  }
}
function requireBoundedNonEmptyArray(value, label, maximumItems) {
  requireNonEmptyArray(value, label);
  if (value.length > maximumItems) {
    throw new Error(`${label} may contain at most ${maximumItems} items`);
  }
}
function freezeStringList(values, label, maximumItems, allowEmpty = false) {
  if (!Array.isArray(values) || !allowEmpty && values.length < 1 || values.length > maximumItems) {
    throw new Error(`${label} must contain ${allowEmpty ? "at most" : "between 1 and"} ${maximumItems} strings`);
  }
  const result = [];
  for (const value of values) {
    if (typeof value !== "string" || value.length < 1) {
      throw new Error(`${label} must contain non-empty strings`);
    }
    result.push(value);
  }
  if (new Set(result).size !== result.length)
    throw new Error(`${label} must not contain duplicates`);
  return Object.freeze(result);
}
function freezeInputField(field, label, maximumArrayItems, nested = false) {
  if (typeof field !== "object" || field === null || typeof field.description !== "string" || field.description.length < 1 || field.description.length > 500) {
    throw new Error(`${label} must declare a bounded description`);
  }
  if (field.type === "file") {
    requireExactKeys(field, ["type", "description", "maxBytes", "mediaTypes"], label);
    if (!Number.isSafeInteger(field.maxBytes) || field.maxBytes < 1 || field.maxBytes > 1024 * 1024 * 1024) {
      throw new Error(`${label}.maxBytes must be a bounded positive integer`);
    }
    if (field.mediaTypes !== undefined && (field.mediaTypes.length < 1 || field.mediaTypes.length > 32 || field.mediaTypes.some((value) => !/^[a-z0-9!#$&^_.+-]+\/(?:[a-z0-9!#$&^_.+-]+|\*)$/u.test(value)))) {
      throw new Error(`${label}.mediaTypes must contain bounded media types`);
    }
    return Object.freeze({
      ...field,
      ...field.mediaTypes === undefined ? {} : {
        mediaTypes: freezeStringList(field.mediaTypes, `${label}.mediaTypes`, 32)
      }
    });
  }
  if (field.type === "array") {
    requireExactKeys(field, ["type", "description", "items", "minItems", "maxItems"], label);
    if (!Number.isSafeInteger(field.minItems) || !Number.isSafeInteger(field.maxItems) || nested || field.minItems < 0 || field.maxItems < field.minItems || field.maxItems < 1 || field.maxItems > maximumArrayItems) {
      throw new Error(`${label} must declare valid bounded item counts`);
    }
    return Object.freeze({
      ...field,
      items: freezeInputField(field.items, `${label}.items`, maximumArrayItems, true)
    });
  }
  requireExactKeys(field, [
    "type",
    "description",
    "minLength",
    "maxLength",
    "minimum",
    "maximum",
    "enum",
    "format",
    "urlPathPrefixes"
  ], label);
  if (field.type !== "string" && field.type !== "number" && field.type !== "boolean") {
    throw new Error(`${label}.type is unsupported`);
  }
  const lengthBounds = field.minLength !== undefined || field.maxLength !== undefined;
  if (lengthBounds && (field.type !== "string" || field.minLength !== undefined && (!Number.isSafeInteger(field.minLength) || field.minLength < 0 || field.minLength > 1e6) || field.maxLength !== undefined && (!Number.isSafeInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 1e6) || field.minLength !== undefined && field.maxLength !== undefined && field.minLength > field.maxLength)) {
    throw new Error(`${label} has invalid string length bounds`);
  }
  const numericBounds = field.minimum !== undefined || field.maximum !== undefined;
  if (numericBounds && (field.type !== "number" || field.minimum !== undefined && !Number.isFinite(field.minimum) || field.maximum !== undefined && !Number.isFinite(field.maximum) || field.minimum !== undefined && field.maximum !== undefined && field.minimum > field.maximum)) {
    throw new Error(`${label} has invalid numeric bounds`);
  }
  if (field.format !== undefined && (field.type !== "string" || field.format !== "url" && field.format !== "path-segment")) {
    throw new Error(`${label}.format is invalid`);
  }
  if (field.urlPathPrefixes !== undefined && (field.type !== "string" || field.format !== "url" || field.urlPathPrefixes.length < 1 || field.urlPathPrefixes.length > 20 || field.urlPathPrefixes.some((prefix) => !prefix.startsWith("/") || prefix.startsWith("//") || prefix.length > 2048 || prefix.includes(String.fromCharCode(0))) || field.urlPathPrefixes.some((prefix) => prefix.includes("\\") || prefix.includes("?") || prefix.includes("#") || /%(?:25|2e|2f|5c)/iu.test(prefix) || prefix.split("/").some((segment) => segment === "." || segment === "..")))) {
    throw new Error(`${label}.urlPathPrefixes is invalid`);
  }
  if (field.enum !== undefined) {
    if (field.enum.length < 1 || field.enum.length > 100 || field.enum.some((value) => typeof value !== field.type || typeof value === "number" && !Number.isFinite(value)) || new Set(field.enum.map((value) => JSON.stringify(value))).size !== field.enum.length) {
      throw new Error(`${label}.enum is invalid`);
    }
  }
  return Object.freeze({
    ...field,
    ...field.enum === undefined ? {} : { enum: Object.freeze([...field.enum]) },
    ...field.urlPathPrefixes === undefined ? {} : {
      urlPathPrefixes: freezeStringList(field.urlPathPrefixes, `${label}.urlPathPrefixes`, 20)
    }
  });
}
function freezeInputSchema(schema, label, maximumArrayItems) {
  requireExactKeys(schema, ["properties", "required"], label);
  if (typeof schema.properties !== "object" || schema.properties === null || Array.isArray(schema.properties)) {
    throw new Error(`${label}.properties must be an object`);
  }
  const propertyEntries = [];
  for (const name in schema.properties) {
    if (!Object.hasOwn(schema.properties, name))
      continue;
    if (propertyEntries.length === 100) {
      throw new Error(`${label}.properties may contain at most 100 fields`);
    }
    propertyEntries.push([name, schema.properties[name]]);
  }
  propertyEntries.sort(([left], [right]) => left.localeCompare(right));
  const properties = {};
  for (const [name, field] of propertyEntries) {
    if (!/^[a-z][a-z0-9_]{0,63}$/u.test(name)) {
      throw new Error(`${label}.properties contains invalid field ${name}`);
    }
    properties[name] = freezeInputField(field, `${label}.properties.${name}`, maximumArrayItems);
  }
  const required = freezeStringList(schema.required, `${label}.required`, 100, true);
  for (const name of required) {
    if (properties[name] === undefined)
      throw new Error(`${label}.required references ${name}`);
  }
  return Object.freeze({
    properties: Object.freeze(properties),
    required
  });
}
function containsFileInput2(field) {
  return field.type === "file" || field.type === "array" && field.items.type === "file";
}
function hasControlCharacters(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127)
      return true;
  }
  return false;
}
function freezeOperation(operation, transport, sourceKind) {
  const official = transport === "provider-api";
  requireExactKeys(operation, [
    "name",
    "contractVersion",
    "historicalContractVersions",
    "risk",
    "input",
    "sideEffect",
    "idempotency",
    "dedupeWindowMs",
    "state",
    "dispatch",
    "implementation",
    "planDispatches",
    "validateInput",
    "validateSubjectInput",
    "reconciliation",
    "omni",
    "access",
    ...official ? ["requiredScopeSets", "coverage"] : []
  ], "provider plugin operation");
  if (!isProviderPluginOperationName(operation.name)) {
    throw new Error(`provider plugin operation ${String(operation.name)} must be a bounded dotted semantic name`);
  }
  if (!Number.isSafeInteger(operation.contractVersion) || operation.contractVersion < 1 || operation.contractVersion > 1e6) {
    throw new Error(`provider plugin operation ${operation.name} has an invalid contract version`);
  }
  if (operation.historicalContractVersions !== undefined && (!Array.isArray(operation.historicalContractVersions) || operation.historicalContractVersions.length >= MAX_PROVIDER_PLUGIN_CONTRACT_VERSIONS_PER_OPERATION)) {
    throw new Error(`provider plugin operation ${operation.name} may declare at most ${MAX_PROVIDER_PLUGIN_CONTRACT_VERSIONS_PER_OPERATION - 1} historical contract versions`);
  }
  const rawHistoricalContractVersions = operation.historicalContractVersions === undefined ? [] : operation.historicalContractVersions;
  const copiedHistoricalContractVersions = [];
  for (const version of rawHistoricalContractVersions) {
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1 || version > 1e6 || version >= operation.contractVersion) {
      throw new Error(`provider plugin operation ${operation.name} has an invalid historical contract version`);
    }
    copiedHistoricalContractVersions.push(version);
  }
  const historicalContractVersions = Object.freeze(copiedHistoricalContractVersions);
  if (new Set(historicalContractVersions).size !== historicalContractVersions.length) {
    throw new Error(`provider plugin operation ${operation.name} repeats a historical contract version`);
  }
  if (!["R1", "R2", "R3", "R4"].includes(operation.risk)) {
    throw new Error(`provider plugin operation ${operation.name} has an invalid risk`);
  }
  if (operation.state !== "observed" && operation.state !== "capture-required") {
    throw new Error(`provider plugin operation ${operation.name} has an invalid state`);
  }
  if (operation.access !== undefined && (operation.access !== "public" || official || sourceKind !== "built-in" || transport !== "web-session-api" || operation.risk !== "R1" || operation.state !== "observed" || operation.dispatch !== "none")) {
    throw new Error(`provider plugin operation ${operation.name} public access requires an observed dispatch-free built-in web-session R1 operation`);
  }
  if (operation.dispatch !== "none" && operation.dispatch !== "single" && operation.dispatch !== "thread-items" && operation.dispatch !== "bounded-items") {
    throw new Error(`provider plugin operation ${operation.name} has an invalid dispatch policy`);
  }
  if (typeof operation.sideEffect !== "string" || operation.sideEffect.length < 1 || operation.sideEffect.length > 500 || hasControlCharacters(operation.sideEffect) || typeof operation.implementation !== "string" || operation.implementation.length < 1 || operation.implementation.length > 500 || hasControlCharacters(operation.implementation)) {
    throw new Error(`provider plugin operation ${operation.name} has incomplete semantics`);
  }
  if (operation.idempotency !== "none" && operation.idempotency !== "local-at-most-once" || !Number.isSafeInteger(operation.dedupeWindowMs) || operation.dedupeWindowMs < 0 || operation.dedupeWindowMs > 30 * 24 * 60 * 60000 || typeof operation.planDispatches !== "function" || typeof operation.validateInput !== "function") {
    throw new Error(`provider plugin operation ${operation.name} has invalid host hooks`);
  }
  if (operation.risk === "R1" && (operation.sideEffect !== "none" || operation.dispatch !== "none" || operation.idempotency !== "none" || operation.dedupeWindowMs !== 0 || operation.reconciliation !== undefined || Object.values(operation.input.properties).some(containsFileInput2))) {
    throw new Error(`provider plugin operation ${operation.name} must keep R1 read semantics side-effect-free and dispatch-free`);
  }
  if ((operation.risk === "R2" || operation.risk === "R3") && (operation.dispatch === "none" || operation.idempotency !== "local-at-most-once" || operation.dedupeWindowMs < 60000)) {
    throw new Error(`provider plugin operation ${operation.name} must bind every R2/R3 write to a confirmed dispatch and positive at-most-once window`);
  }
  if (operation.risk === "R4" && operation.state !== "capture-required") {
    throw new Error(`provider plugin operation ${operation.name} must keep R4 authority capture-required`);
  }
  if (operation.validateSubjectInput !== undefined && typeof operation.validateSubjectInput !== "function") {
    throw new Error(`provider plugin operation ${operation.name} has an invalid subject-input hook`);
  }
  if (operation.reconciliation !== undefined) {
    if (typeof operation.reconciliation !== "object" || operation.reconciliation === null) {
      throw new Error(`provider plugin operation ${operation.name} has an invalid reconciliation contract`);
    }
    const reconciliationLabel = `provider plugin operation ${operation.name} reconciliation`;
    if (operation.reconciliation.kind === "boolean-desired-state") {
      requireExactKeys(operation.reconciliation, ["kind", "desiredState"], reconciliationLabel);
      if (typeof operation.reconciliation.desiredState !== "function") {
        throw new Error(`provider plugin operation ${operation.name} has an invalid reconciliation contract`);
      }
    } else if (operation.reconciliation.kind === "provider-accepted-target-presence" || operation.reconciliation.kind === "provider-bound-target-desired-state") {
      requireExactKeys(operation.reconciliation, operation.reconciliation.kind === "provider-accepted-target-presence" ? ["kind"] : ["kind", "desiredState"], reconciliationLabel);
      if (operation.reconciliation.kind === "provider-bound-target-desired-state" && operation.reconciliation.desiredState !== false) {
        throw new Error(`provider plugin operation ${operation.name} has an invalid reconciliation contract`);
      }
      if (operation.dispatch !== "single") {
        const targetKind = operation.reconciliation.kind === "provider-accepted-target-presence" ? "provider-accepted" : "provider-bound";
        throw new Error(`provider plugin operation ${operation.name} ${targetKind} target reconciliation requires one exact dispatch`);
      }
    } else {
      throw new Error(`provider plugin operation ${operation.name} has an invalid reconciliation contract`);
    }
  }
  const isOmniInboxRead = operation.name === "messaging.list" || operation.name === "messaging.read";
  if (isOmniInboxRead && operation.omni === undefined) {
    throw new Error(`provider plugin operation ${operation.name} must declare supported or unsupported omni normalization`);
  }
  if (!isOmniInboxRead && operation.omni !== undefined) {
    throw new Error(`provider plugin operation ${operation.name} cannot declare inbox normalization`);
  }
  let omni;
  if (operation.omni !== undefined) {
    if (typeof operation.omni !== "object" || operation.omni === null) {
      throw new Error(`provider plugin operation ${operation.name} has an invalid omni normalization contract`);
    }
    if (operation.omni.state === "supported") {
      requireExactKeys(operation.omni, ["state", "schemaVersion", "materializerId", "materializerVersion", "materialize"], `provider plugin operation ${operation.name} omni normalization`);
      if (operation.state !== "observed" || operation.risk !== "R1" || operation.omni.schemaVersion !== 1 || typeof operation.omni.materializerId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(operation.omni.materializerId) || !Number.isSafeInteger(operation.omni.materializerVersion) || operation.omni.materializerVersion < 1 || operation.omni.materializerVersion > 1e6 || typeof operation.omni.materialize !== "function") {
        throw new Error(`provider plugin operation ${operation.name} has an invalid supported omni normalization contract`);
      }
      omni = Object.freeze({
        state: "supported",
        schemaVersion: 1,
        materializerId: operation.omni.materializerId,
        materializerVersion: operation.omni.materializerVersion,
        materialize: operation.omni.materialize
      });
    } else if (operation.omni.state === "unsupported") {
      requireExactKeys(operation.omni, ["state", "reason"], `provider plugin operation ${operation.name} omni normalization`);
      if (typeof operation.omni.reason !== "string" || operation.omni.reason.length < 1 || operation.omni.reason.length > 1000 || hasControlCharacters(operation.omni.reason)) {
        throw new Error(`provider plugin operation ${operation.name} has an invalid unsupported omni normalization reason`);
      }
      omni = Object.freeze({
        state: "unsupported",
        reason: operation.omni.reason
      });
    } else {
      throw new Error(`provider plugin operation ${operation.name} has an invalid omni normalization state`);
    }
  }
  const {
    historicalContractVersions: ignoredHistoricalContractVersions,
    ...operationWithoutHistory
  } = operation;
  const common = {
    ...operationWithoutHistory,
    ...historicalContractVersions.length === 0 ? {} : { historicalContractVersions },
    contractVersions: Object.freeze([
      ...historicalContractVersions,
      operation.contractVersion
    ].sort((left, right) => left - right)),
    input: freezeInputSchema(operation.input, `provider plugin operation ${operation.name}.input`, official ? 100 : 25),
    planDispatches: conformingProviderPluginPlanDispatches(operation),
    ...operation.reconciliation === undefined ? {} : operation.reconciliation.kind === "boolean-desired-state" ? {
      reconciliation: Object.freeze({
        kind: operation.reconciliation.kind,
        desiredState: operation.reconciliation.desiredState
      })
    } : operation.reconciliation.kind === "provider-bound-target-desired-state" ? {
      reconciliation: Object.freeze({
        kind: operation.reconciliation.kind,
        desiredState: operation.reconciliation.desiredState
      })
    } : {
      reconciliation: Object.freeze({
        kind: operation.reconciliation.kind
      })
    },
    ...omni === undefined ? {} : { omni }
  };
  if (!official)
    return Object.freeze(common);
  const providerOperation = operation;
  requireBoundedNonEmptyArray(providerOperation.requiredScopeSets, `provider plugin operation ${operation.name} requiredScopeSets`, 32);
  for (const scopeSet of providerOperation.requiredScopeSets) {
    requireBoundedNonEmptyArray(scopeSet, `provider plugin operation ${operation.name} scope set`, 32);
  }
  const requiredScopeSets = providerOperation.requiredScopeSets.map((scopeSet) => freezeStringList(scopeSet, `provider plugin operation ${operation.name} scope set`, 32));
  requireBoundedNonEmptyArray(providerOperation.coverage, `provider plugin operation ${operation.name} coverage`, 64);
  return Object.freeze({
    ...common,
    requiredScopeSets: Object.freeze(requiredScopeSets),
    coverage: freezeStringList(providerOperation.coverage, `provider plugin operation ${operation.name} coverage`, 64)
  });
}
function validateProviderRuntime(value) {
  requireExactKeys(value, ["execute", "executeMessagingPart"], "provider plugin runtime");
  if (typeof value.execute !== "function")
    throw new Error("provider plugin runtime must declare execute");
  if (value.executeMessagingPart !== undefined && typeof value.executeMessagingPart !== "function")
    throw new Error("provider plugin messaging action runtime hook is invalid");
  return Object.freeze({
    execute: value.execute,
    ...value.executeMessagingPart === undefined ? {} : { executeMessagingPart: value.executeMessagingPart }
  });
}
function validateWebRuntime(value) {
  requireExactKeys(value, ["probe", "execute", "executeMessagingPart", "executePublic", "reconcile", "linkedDeviceLifecycle"], "web-session plugin runtime");
  if (typeof value.probe !== "function" || typeof value.execute !== "function") {
    throw new Error("web-session plugin runtime must declare probe and execute");
  }
  if (value.executePublic !== undefined && typeof value.executePublic !== "function") {
    throw new Error("web-session plugin public runtime hook is invalid");
  }
  if (value.executeMessagingPart !== undefined && typeof value.executeMessagingPart !== "function")
    throw new Error("web-session plugin messaging action runtime hook is invalid");
  if (value.reconcile !== undefined && typeof value.reconcile !== "function") {
    throw new Error("web-session plugin runtime reconciliation hook is invalid");
  }
  let linkedDeviceLifecycle;
  if (value.linkedDeviceLifecycle !== undefined) {
    requireExactKeys(value.linkedDeviceLifecycle, ["inspect", "pair", "syncOnce"], "linked-device plugin lifecycle runtime");
    if (typeof value.linkedDeviceLifecycle.inspect !== "function" || typeof value.linkedDeviceLifecycle.pair !== "function" || typeof value.linkedDeviceLifecycle.syncOnce !== "function") {
      throw new Error("linked-device plugin lifecycle runtime is invalid");
    }
    linkedDeviceLifecycle = Object.freeze({
      inspect: value.linkedDeviceLifecycle.inspect,
      pair: value.linkedDeviceLifecycle.pair,
      syncOnce: value.linkedDeviceLifecycle.syncOnce
    });
  }
  return Object.freeze({
    probe: value.probe,
    execute: value.execute,
    ...value.executeMessagingPart === undefined ? {} : { executeMessagingPart: value.executeMessagingPart },
    ...value.executePublic === undefined ? {} : { executePublic: value.executePublic },
    ...value.reconcile === undefined ? {} : { reconcile: value.reconcile },
    ...linkedDeviceLifecycle === undefined ? {} : { linkedDeviceLifecycle }
  });
}
function validateLocalCliRuntime(value) {
  requireExactKeys(value, ["inspect", "probe", "execute", "executeMessagingPart", "reconcile"], "local CLI plugin runtime");
  if (typeof value.inspect !== "function" || typeof value.probe !== "function" || typeof value.execute !== "function") {
    throw new Error("local CLI plugin runtime must declare inspect, probe, and execute");
  }
  if (value.reconcile !== undefined && typeof value.reconcile !== "function") {
    throw new Error("local CLI plugin runtime reconciliation hook is invalid");
  }
  if (value.executeMessagingPart !== undefined && typeof value.executeMessagingPart !== "function")
    throw new Error("local CLI plugin messaging action runtime hook is invalid");
  return Object.freeze({
    inspect: value.inspect,
    probe: value.probe,
    execute: value.execute,
    ...value.executeMessagingPart === undefined ? {} : { executeMessagingPart: value.executeMessagingPart },
    ...value.reconcile === undefined ? {} : { reconcile: value.reconcile }
  });
}
function memoizedRuntime(loader, validate) {
  let pending;
  const loadRuntime = () => {
    providerPluginStartedRuntimeLoaders.add(loadRuntime);
    if (pending === undefined) {
      pending = Promise.resolve().then(async () => {
        const identity = providerPluginRuntimeLoadIdentities.get(loadRuntime);
        await identity?.verify("before");
        const runtime = validate(await loader());
        await identity?.verify("after");
        return runtime;
      });
    }
    return pending;
  };
  return loadRuntime;
}
var providerPluginRuntimeLoadIdentities = new WeakMap;
var providerPluginLazyRuntimeLoaders = new WeakSet;
var providerPluginStartedRuntimeLoaders = new WeakSet;
function bindProviderPluginRuntimeLoadIdentity(loadRuntime, identity) {
  const current = providerPluginRuntimeLoadIdentities.get(loadRuntime);
  if (current !== undefined) {
    if (current.token !== identity.token) {
      throw new Error("provider plugin runtime loader is already bound to a different implementation identity");
    }
    return;
  }
  if (providerPluginStartedRuntimeLoaders.has(loadRuntime)) {
    throw new Error("provider plugin runtime loader was invoked before its implementation identity was bound");
  }
  providerPluginRuntimeLoadIdentities.set(loadRuntime, Object.freeze(identity));
}
async function loadProviderPluginExtensionRuntime(loadRuntime, loader) {
  const identity = providerPluginRuntimeLoadIdentities.get(loadRuntime);
  if (identity === undefined)
    throw new Error("Provider extension has no registered implementation identity");
  providerPluginStartedRuntimeLoaders.add(loadRuntime);
  await identity.verify("before");
  const runtime = await loader();
  await identity.verify("after");
  return runtime;
}
function lazyProviderApiRuntime(loader) {
  const loadRuntime = memoizedRuntime(loader, validateProviderRuntime);
  providerPluginLazyRuntimeLoaders.add(loadRuntime);
  return Object.freeze({ loadRuntime });
}
function lazyWebSessionRuntime(loader) {
  const loadRuntime = memoizedRuntime(loader, validateWebRuntime);
  providerPluginLazyRuntimeLoaders.add(loadRuntime);
  return Object.freeze({ loadRuntime });
}
function lazyLocalCliRuntime(loader) {
  const loadRuntime = memoizedRuntime(loader, validateLocalCliRuntime);
  providerPluginLazyRuntimeLoaders.add(loadRuntime);
  return Object.freeze({ loadRuntime });
}
function freezeProviderPluginMessaging(value, operations, surfaceId) {
  if (value === undefined)
    return;
  requireExactKeys(value, [
    "schemaVersion",
    "contractId",
    "network",
    "contextLiveness",
    "listOperation",
    "contextOperation",
    "enumerateRoutes",
    "resolveRoute",
    "parseTarget",
    "contextInput",
    "action"
  ], `provider plugin surface ${surfaceId} messaging SPI`);
  if (value.schemaVersion !== 1 || typeof value.contractId !== "string" || !/^[a-z][a-z0-9.-]{0,127}\.v1$/u.test(value.contractId) || typeof value.network !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(value.network) || value.contextLiveness !== "fresh-as-of-live-preflight" && value.contextLiveness !== "freshness-unproven" || value.listOperation !== "messaging.list" || value.contextOperation !== "messaging.read" || typeof value.enumerateRoutes !== "function" || typeof value.resolveRoute !== "object" || value.resolveRoute === null || typeof value.parseTarget !== "function" || typeof value.contextInput !== "function") {
    throw new Error(`provider plugin surface ${surfaceId} has an invalid messaging SPI`);
  }
  requireExactKeys(value.resolveRoute, ["operation", "input", "candidates", "sourceConversationCoordinate"], `provider plugin surface ${surfaceId} messaging exact route resolution`);
  if (typeof value.resolveRoute.operation !== "string" || !isProviderPluginOperationName(value.resolveRoute.operation) || typeof value.resolveRoute.input !== "function" || typeof value.resolveRoute.candidates !== "function" || typeof value.resolveRoute.sourceConversationCoordinate !== "function")
    throw new Error(`provider plugin surface ${surfaceId} has an invalid exact messaging route resolver`);
  const exactResolutionOperation = operations.find((candidate) => candidate.name === value.resolveRoute.operation && candidate.contractVersion === 1);
  if (exactResolutionOperation === undefined || exactResolutionOperation.state !== "observed" || exactResolutionOperation.risk !== "R1") {
    throw new Error(`provider plugin surface ${surfaceId} messaging SPI requires one observed R1 exact route resolver`);
  }
  for (const operationName of [value.listOperation, value.contextOperation]) {
    const operation = operations.find((candidate) => candidate.name === operationName && candidate.contractVersion === 1);
    if (operation === undefined || operation.state !== "observed" || operation.risk !== "R1" || operation.omni?.state !== "supported") {
      throw new Error(`provider plugin surface ${surfaceId} messaging SPI requires observed normalized ${operationName}@1`);
    }
  }
  if (typeof value.action !== "object" || value.action === null) {
    throw new Error(`provider plugin surface ${surfaceId} messaging SPI has an invalid action declaration`);
  }
  if (value.action.state === "unavailable") {
    requireExactKeys(value.action, ["state", "reason", "reply"], `provider plugin surface ${surfaceId} messaging action`);
    if (value.action.reply !== "unsupported" || typeof value.action.reason !== "string" || value.action.reason.length < 1 || value.action.reason.length > 1000 || hasControlCharacters(value.action.reason)) {
      throw new Error(`provider plugin surface ${surfaceId} messaging action unavailability is invalid`);
    }
    return Object.freeze({
      schemaVersion: 1,
      contractId: value.contractId,
      network: value.network,
      contextLiveness: value.contextLiveness,
      listOperation: value.listOperation,
      contextOperation: value.contextOperation,
      enumerateRoutes: value.enumerateRoutes,
      resolveRoute: Object.freeze({
        operation: value.resolveRoute.operation,
        input: value.resolveRoute.input,
        candidates: value.resolveRoute.candidates,
        sourceConversationCoordinate: value.resolveRoute.sourceConversationCoordinate
      }),
      parseTarget: value.parseTarget,
      contextInput: value.contextInput,
      action: Object.freeze({
        state: "unavailable",
        reason: value.action.reason,
        reply: "unsupported"
      })
    });
  }
  if (value.action.state !== "supported") {
    throw new Error(`provider plugin surface ${surfaceId} messaging action has an invalid state`);
  }
  if (value.resolveRoute.operation !== "conversations.read") {
    throw new Error(`provider plugin surface ${surfaceId} actionable messaging requires exact conversations.read route resolution`);
  }
  const action = value.action;
  requireExactKeys(action, [
    "state",
    "operation",
    "reply",
    "livePreflight",
    "compileTurnPart",
    "mapAcceptedResult",
    "proveExpectedOwnPrefix",
    "reconciliation"
  ], `provider plugin surface ${surfaceId} messaging action`);
  const actionOperation = operations.find((candidate) => candidate.name === action.operation && candidate.contractVersion === 1);
  if (actionOperation === undefined || actionOperation.state !== "observed" || actionOperation.risk !== "R3" || action.reply !== "supported" && action.reply !== "unsupported" || typeof action.livePreflight !== "object" || action.livePreflight === null || typeof action.compileTurnPart !== "function" || typeof action.mapAcceptedResult !== "function" || typeof action.proveExpectedOwnPrefix !== "function" || typeof action.reconciliation !== "function") {
    throw new Error(`provider plugin surface ${surfaceId} messaging action must bind one observed R3 operation`);
  }
  requireExactKeys(action.livePreflight, ["operation", "input", "snapshot"], `provider plugin surface ${surfaceId} messaging action live preflight`);
  const livePreflightOperation = operations.find((candidate) => candidate.name === action.livePreflight.operation && candidate.contractVersion === 1);
  if (livePreflightOperation === undefined || livePreflightOperation.state !== "observed" || livePreflightOperation.risk !== "R1" || typeof action.livePreflight.input !== "function" || typeof action.livePreflight.snapshot !== "function")
    throw new Error(`provider plugin surface ${surfaceId} messaging action requires one observed R1 live preflight`);
  return Object.freeze({
    schemaVersion: 1,
    contractId: value.contractId,
    network: value.network,
    contextLiveness: value.contextLiveness,
    listOperation: value.listOperation,
    contextOperation: value.contextOperation,
    enumerateRoutes: value.enumerateRoutes,
    resolveRoute: Object.freeze({
      operation: value.resolveRoute.operation,
      input: value.resolveRoute.input,
      candidates: value.resolveRoute.candidates,
      sourceConversationCoordinate: value.resolveRoute.sourceConversationCoordinate
    }),
    parseTarget: value.parseTarget,
    contextInput: value.contextInput,
    action: Object.freeze({
      state: "supported",
      operation: action.operation,
      reply: action.reply,
      livePreflight: Object.freeze({
        operation: action.livePreflight.operation,
        input: action.livePreflight.input,
        snapshot: action.livePreflight.snapshot
      }),
      compileTurnPart: action.compileTurnPart,
      mapAcceptedResult: action.mapAcceptedResult,
      proveExpectedOwnPrefix: action.proveExpectedOwnPrefix,
      reconciliation: action.reconciliation
    })
  });
}
function freezeBinding(binding, sourceKind) {
  requireExactKeys(binding, [
    "transport",
    "surfaceId",
    "origin",
    ...binding.transport === "provider-api" ? ["runtimeOrigins"] : [],
    ...binding.transport === "local-cli" ? ["tool"] : [],
    "manifestOrigins",
    "protectedHostnameFamilies",
    "authKinds",
    "operations",
    "subject",
    "messaging",
    ...binding.transport === "linked-device" ? ["linkedDeviceLifecycle"] : [],
    "runtime"
  ], "provider plugin binding");
  if (!providerPluginTransports.includes(binding.transport)) {
    throw new Error("provider plugin binding has an unsupported transport");
  }
  if (!isProviderPluginSurfaceId(binding.surfaceId)) {
    throw new Error(`provider plugin surface ID ${binding.surfaceId} must be strict lowercase kebab-case with at most 63 characters`);
  }
  let origin;
  try {
    origin = new URL(binding.origin);
  } catch {
    throw new Error(`provider plugin surface ${binding.surfaceId} has an invalid origin`);
  }
  if (origin.protocol !== "https:" || origin.username !== "" || origin.password !== "" || origin.pathname !== "/" || origin.search !== "" || origin.hash !== "" || binding.origin !== origin.origin) {
    throw new Error(`provider plugin surface ${binding.surfaceId} must declare an exact credential-free HTTPS origin`);
  }
  let runtimeOrigins = [];
  if (binding.transport === "provider-api") {
    const declaredRuntimeOrigins = binding.runtimeOrigins ?? [binding.origin];
    requireBoundedNonEmptyArray(declaredRuntimeOrigins, `provider plugin surface ${binding.surfaceId} runtimeOrigins`, 20);
    runtimeOrigins = [...declaredRuntimeOrigins];
    for (const runtimeOrigin of runtimeOrigins) {
      let parsed;
      try {
        parsed = new URL(runtimeOrigin);
      } catch {
        throw new Error(`provider plugin surface ${binding.surfaceId} has an invalid runtime origin`);
      }
      if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" || runtimeOrigin !== parsed.origin) {
        throw new Error(`provider plugin surface ${binding.surfaceId} must declare exact credential-free HTTPS runtime origins`);
      }
    }
    if (new Set(runtimeOrigins).size !== runtimeOrigins.length) {
      throw new Error(`provider plugin surface ${binding.surfaceId} repeats a runtime origin`);
    }
    if (!runtimeOrigins.includes(binding.origin)) {
      throw new Error(`provider plugin surface ${binding.surfaceId} runtime origins must include its primary origin`);
    }
    runtimeOrigins.sort();
  }
  const declaredManifestOrigins = binding.manifestOrigins === undefined ? [binding.origin] : binding.manifestOrigins;
  requireBoundedNonEmptyArray(declaredManifestOrigins, `provider plugin surface ${binding.surfaceId} manifestOrigins`, 20);
  const manifestOrigins = [...declaredManifestOrigins];
  for (const manifestOrigin of manifestOrigins) {
    let parsed;
    try {
      parsed = new URL(manifestOrigin);
    } catch {
      throw new Error(`provider plugin surface ${binding.surfaceId} has an invalid manifest origin`);
    }
    if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" || manifestOrigin !== parsed.origin) {
      throw new Error(`provider plugin surface ${binding.surfaceId} must declare exact credential-free HTTPS manifest origins`);
    }
  }
  if (new Set(manifestOrigins).size !== manifestOrigins.length) {
    throw new Error(`provider plugin surface ${binding.surfaceId} repeats a manifest origin`);
  }
  const endpointHostnames = [
    ...runtimeOrigins.map((runtimeOrigin) => new URL(runtimeOrigin).hostname.toLowerCase()),
    ...binding.transport === "provider-api" ? [] : [origin.hostname.toLowerCase()],
    ...manifestOrigins.map((manifestOrigin) => new URL(manifestOrigin).hostname.toLowerCase())
  ];
  const declaredProtectedHostnameFamilies = binding.protectedHostnameFamilies === undefined ? [...new Set(endpointHostnames)] : binding.protectedHostnameFamilies;
  requireBoundedNonEmptyArray(declaredProtectedHostnameFamilies, `provider plugin surface ${binding.surfaceId} protectedHostnameFamilies`, 20);
  const protectedHostnameFamilies = [...declaredProtectedHostnameFamilies];
  for (const family of protectedHostnameFamilies) {
    if (typeof family !== "string" || family !== family.toLowerCase() || family.length > 253 || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(family) || family.includes("..")) {
      throw new Error(`provider plugin surface ${binding.surfaceId} has an invalid protected hostname family`);
    }
  }
  if (new Set(protectedHostnameFamilies).size !== protectedHostnameFamilies.length) {
    throw new Error(`provider plugin surface ${binding.surfaceId} repeats a protected hostname family`);
  }
  for (const hostname of endpointHostnames) {
    if (!protectedHostnameFamilies.some((family) => hostname === family || hostname.endsWith(`.${family}`))) {
      throw new Error(`provider plugin surface ${binding.surfaceId} protected hostname families do not cover ${hostname}`);
    }
  }
  requireBoundedNonEmptyArray(binding.authKinds, `provider plugin surface ${binding.surfaceId} authKinds`, binding.transport === "web-session-api" || binding.transport === "local-cli" ? 5 : 1);
  const acceptedAuthKinds = [...binding.authKinds];
  for (const kind of acceptedAuthKinds) {
    if (!authKinds.has(kind)) {
      throw new Error(`provider plugin surface ${binding.surfaceId} accepts unsupported auth kind ${String(kind)}`);
    }
  }
  if (new Set(acceptedAuthKinds).size !== acceptedAuthKinds.length) {
    throw new Error(`provider plugin surface ${binding.surfaceId} repeats an auth kind`);
  }
  acceptedAuthKinds.sort();
  if (binding.transport === "provider-api" && (acceptedAuthKinds.length !== 1 || acceptedAuthKinds[0] !== "oauth-token-file")) {
    throw new Error(`provider plugin surface ${binding.surfaceId} provider-api auth must be oauth-token-file`);
  }
  if (binding.transport === "linked-device" && (acceptedAuthKinds.length !== 1 || acceptedAuthKinds[0] !== "linked-device-store")) {
    throw new Error(`provider plugin surface ${binding.surfaceId} linked-device auth must be linked-device-store`);
  }
  if (binding.transport === "web-session-api" && acceptedAuthKinds.some((kind) => kind === "oauth-token-file" || kind === "linked-device-store")) {
    throw new Error(`provider plugin surface ${binding.surfaceId} web-session-api auth must use browser-session credentials`);
  }
  const localCliTool = binding.transport === "local-cli" ? parseLocalCliToolIdentityV1(binding.tool) : undefined;
  requireBoundedNonEmptyArray(binding.operations, `provider plugin surface ${binding.surfaceId} operations`, MAX_PROVIDER_PLUGIN_OPERATIONS_PER_BINDING);
  const operations = [...binding.operations].map((operation) => freezeOperation(operation, binding.transport, sourceKind));
  operations.sort((left, right) => left.name.localeCompare(right.name) || left.contractVersion - right.contractVersion);
  const operationKeys = operations.map((operation) => `${operation.name}@${operation.contractVersion}`);
  if (new Set(operationKeys).size !== operationKeys.length) {
    throw new Error(`provider plugin surface ${binding.surfaceId} repeats an exact operation contract`);
  }
  const messaging = freezeProviderPluginMessaging(binding.messaging, operations, binding.surfaceId);
  if (messaging?.action.state === "supported" && binding.transport === "provider-api") {
    throw new Error(`provider plugin surface ${binding.surfaceId} messaging actions require a cleanup-qualified session or local CLI transport`);
  }
  if (typeof binding.subject !== "object" || binding.subject === null || typeof binding.subject.format !== "string" || binding.subject.format.length < 1 || typeof binding.subject.matches !== "function") {
    throw new Error(`provider plugin surface ${binding.surfaceId} must declare a subject matcher`);
  }
  requireExactKeys(binding.subject, ["format", "matches"], "provider plugin subject");
  if (typeof binding.runtime !== "object" || binding.runtime === null || typeof binding.runtime.loadRuntime !== "function") {
    throw new Error(`provider plugin surface ${binding.surfaceId} must declare a lazy runtime loader`);
  }
  const common = {
    surfaceId: binding.surfaceId,
    origin: binding.origin,
    manifestOrigins: Object.freeze(manifestOrigins),
    protectedHostnameFamilies: Object.freeze(protectedHostnameFamilies.sort()),
    authKinds: Object.freeze(acceptedAuthKinds),
    ...messaging === undefined ? {} : { messaging }
  };
  if (binding.transport === "provider-api") {
    requireExactKeys(binding.runtime, ["loadRuntime"], "provider plugin runtime hooks");
    const loadRuntime2 = binding.runtime.loadRuntime;
    const result2 = Object.freeze({
      ...common,
      transport: "provider-api",
      runtimeOrigins: Object.freeze(runtimeOrigins),
      operations: Object.freeze(operations),
      subject: Object.freeze({ ...binding.subject }),
      loadRuntime: loadRuntime2,
      execute: async (context) => (await loadRuntime2()).execute(context),
      ...messaging?.action.state === "supported" ? {
        executeMessagingPart: async (operation, input, auth, attempt) => {
          const hook = (await loadRuntime2()).executeMessagingPart;
          if (hook === undefined) {
            throw new Error(`provider plugin surface ${binding.surfaceId} declared messaging actions without a runtime hook`);
          }
          return hook(operation, input, auth, attempt);
        }
      } : {}
    });
    return result2;
  }
  if (binding.transport === "local-cli") {
    requireExactKeys(binding.runtime, ["loadRuntime"], "local CLI plugin runtime hooks");
    const loadRuntime2 = binding.runtime.loadRuntime;
    const reconciles2 = operations.some((operation) => operation.reconciliation !== undefined);
    const reconcile2 = async (operationName, input, auth, context, options) => {
      const selectedOperation = operations.find((operation) => operation.name === operationName && operation.reconciliation !== undefined);
      if (selectedOperation === undefined) {
        throw new Error(`provider plugin surface ${binding.surfaceId} has no reconciliation contract for ${operationName}`);
      }
      const reconciliationKind = selectedOperation.reconciliation?.kind;
      const reconciliationContext = reconciliationKind === "provider-accepted-target-presence" || reconciliationKind === "provider-bound-target-desired-state" ? (() => {
        const parsed = parseProviderPluginReconciliationContextV1(context);
        if (parsed.kind !== reconciliationKind) {
          throw new Error(`provider plugin surface ${binding.surfaceId} reconciliation target context kind changed`);
        }
        return parsed;
      })() : (() => {
        if (context !== undefined) {
          throw new Error(`provider plugin surface ${binding.surfaceId} boolean reconciliation does not accept target context`);
        }
        return;
      })();
      const hook = (await loadRuntime2()).reconcile;
      if (hook === undefined) {
        throw new Error(`provider plugin surface ${binding.surfaceId} declared reconciliation without a runtime hook`);
      }
      const value = await hook(operationName, input, auth, reconciliationContext, options);
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("provider plugin reconciliation returned an invalid readback");
      }
      requireExactKeys(value, ["actualState", "reason"], "provider plugin reconciliation readback");
      if (typeof value.actualState !== "boolean" || typeof value.reason !== "string" || value.reason.length < 1 || value.reason.length > 200) {
        throw new Error("provider plugin reconciliation returned an invalid readback");
      }
      return Object.freeze({
        actualState: value.actualState,
        reason: value.reason
      });
    };
    const result2 = Object.freeze({
      ...common,
      transport: "local-cli",
      tool: localCliTool,
      operations: Object.freeze(operations),
      loadRuntime: loadRuntime2,
      subject: Object.freeze({
        ...binding.subject,
        probe: async (auth, options) => {
          const subject = await (await loadRuntime2()).probe(auth, options);
          if (typeof subject !== "string" || !binding.subject.matches(subject)) {
            throw new Error(`provider plugin surface ${binding.surfaceId} returned a subject outside ${binding.subject.format}`);
          }
          return subject;
        }
      }),
      inspect: async (environment, options) => {
        let artifact;
        try {
          artifact = localCliToolArtifactForCurrentRuntime(localCliTool);
        } catch {
          return Object.freeze({
            ready: false,
            platform: process.platform,
            arch: process.arch,
            version: null,
            executableSha256: null,
            reason: `unsupported-runtime:${process.platform}/${process.arch}`
          });
        }
        const cleanupFilesystem = inspectLocalCliCleanupFilesystemReadiness();
        if (!cleanupFilesystem.ready) {
          return Object.freeze({
            ready: false,
            platform: process.platform,
            arch: process.arch,
            version: null,
            executableSha256: null,
            reason: cleanupFilesystem.reason
          });
        }
        const [ready, platform, arch, version, executableSha256, reason] = snapshotExactEnumerableDataProperties(await (await loadRuntime2()).inspect(environment, options), [
          "ready",
          "platform",
          "arch",
          "version",
          "executableSha256",
          "reason"
        ], "local CLI runtime inspection status");
        if (typeof ready !== "boolean" || typeof platform !== "string" || platform !== process.platform || typeof arch !== "string" || arch !== process.arch || version !== null && (typeof version !== "string" || version.length < 1 || version.length > 128 || /[\u0000-\u001f\u007f-\u009f]/u.test(version) || hasUnpairedSurrogate(version)) || executableSha256 !== null && (typeof executableSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(executableSha256)) || reason !== null && (typeof reason !== "string" || reason.length < 1 || reason.length > 500 || /[\u0000-\u001f\u007f-\u009f]/u.test(reason) || hasUnpairedSurrogate(reason)) || ready && (version !== localCliTool.version || executableSha256 !== artifact.executableSha256 || reason !== null) || !ready && reason === null) {
          throw new Error("local CLI runtime inspection returned an invalid status");
        }
        return Object.freeze({
          ready,
          platform,
          arch,
          version,
          executableSha256,
          reason
        });
      },
      execute: async (manifest, recipe, input, auth, options) => (await loadRuntime2()).execute(manifest, recipe, input, auth, options),
      ...messaging?.action.state === "supported" ? {
        executeMessagingPart: async (operation, input, auth, attempt) => {
          const hook = (await loadRuntime2()).executeMessagingPart;
          if (hook === undefined) {
            throw new Error(`provider plugin surface ${binding.surfaceId} declared messaging actions without a runtime hook`);
          }
          return hook(operation, input, auth, attempt);
        }
      } : {},
      ...reconciles2 ? { reconcile: reconcile2 } : {}
    });
    return result2;
  }
  requireExactKeys(binding.runtime, ["loadRuntime"], "web-session plugin runtime hooks");
  const loadRuntime = binding.runtime.loadRuntime;
  const execute = async (manifest, recipe, input, auth, options) => (await loadRuntime()).execute(manifest, recipe, input, auth, options);
  const hasPublicOperations = operations.some((operation) => operation.access === "public");
  const executePublic = async (manifest, recipe, input, options) => {
    const runtime = await loadRuntime();
    if (runtime.executePublic === undefined) {
      throw new Error(`provider plugin surface ${binding.surfaceId} is missing its reviewed public runtime hook`);
    }
    return runtime.executePublic(manifest, recipe, input, options);
  };
  const reconciles = operations.some((operation) => operation.reconciliation !== undefined);
  const reconcile = async (operationName, input, auth, context) => {
    const selectedOperation = operations.find((operation) => operation.name === operationName && operation.reconciliation !== undefined);
    if (selectedOperation === undefined) {
      throw new Error(`provider plugin surface ${binding.surfaceId} has no reconciliation contract for ${operationName}`);
    }
    const reconciliationKind = selectedOperation.reconciliation?.kind;
    const reconciliationContext = reconciliationKind === "provider-accepted-target-presence" || reconciliationKind === "provider-bound-target-desired-state" ? (() => {
      const parsed = parseProviderPluginReconciliationContextV1(context);
      if (parsed.kind !== reconciliationKind) {
        throw new Error(`provider plugin surface ${binding.surfaceId} reconciliation target context kind changed`);
      }
      return parsed;
    })() : (() => {
      if (context !== undefined) {
        throw new Error(`provider plugin surface ${binding.surfaceId} boolean reconciliation does not accept target context`);
      }
      return;
    })();
    const hook = (await loadRuntime()).reconcile;
    if (hook === undefined) {
      throw new Error(`provider plugin surface ${binding.surfaceId} declared reconciliation without a runtime hook`);
    }
    const value = await hook(operationName, input, auth, reconciliationContext);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("provider plugin reconciliation returned an invalid readback");
    }
    requireExactKeys(value, ["actualState", "reason"], "provider plugin reconciliation readback");
    if (typeof value.actualState !== "boolean" || typeof value.reason !== "string" || value.reason.length < 1 || value.reason.length > 200) {
      throw new Error("provider plugin reconciliation returned an invalid readback");
    }
    return Object.freeze({
      actualState: value.actualState,
      reason: value.reason
    });
  };
  let linkedDeviceLifecycle;
  if (binding.transport === "linked-device") {
    const declaration = binding.linkedDeviceLifecycle;
    if (declaration !== undefined) {
      requireExactKeys(declaration, ["inspect", "pair", "syncOnce"], "linked-device plugin lifecycle");
      if (declaration.inspect !== true || declaration.pair !== true || declaration.syncOnce !== true) {
        throw new Error(`provider plugin surface ${binding.surfaceId} has an invalid linked-device lifecycle declaration`);
      }
      const requireLifecycle = async () => {
        const lifecycle = (await loadRuntime()).linkedDeviceLifecycle;
        if (lifecycle === undefined) {
          throw new Error(`provider plugin surface ${binding.surfaceId} declared linked-device lifecycle capabilities without runtime hooks`);
        }
        return lifecycle;
      };
      linkedDeviceLifecycle = Object.freeze({
        inspect: async (environment) => {
          const value = await (await requireLifecycle()).inspect(environment);
          if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new Error("linked-device lifecycle inspection returned invalid status");
          }
          const keys = [
            "ready",
            "implementation",
            "version",
            "integrity",
            ...value.setupCommand === undefined ? [] : ["setupCommand"]
          ];
          requireExactKeys(value, keys, "linked-device lifecycle inspection status");
          if (typeof value.ready !== "boolean" || typeof value.implementation !== "string" || value.implementation.length < 1 || typeof value.version !== "string" || value.version.length < 1 || typeof value.integrity !== "string" || value.integrity.length < 1 || value.setupCommand !== undefined && (typeof value.setupCommand !== "string" || value.setupCommand.length < 1)) {
            throw new Error("linked-device lifecycle inspection returned invalid status");
          }
          return Object.freeze({ ...value });
        },
        pair: async (auth, options) => {
          const subject = await (await requireLifecycle()).pair(auth, options);
          if (typeof subject !== "string" || !binding.subject.matches(subject)) {
            throw new Error("linked-device lifecycle pairing returned an invalid subject");
          }
          return subject;
        },
        syncOnce: async (auth, options) => {
          const value = await (await requireLifecycle()).syncOnce(auth, options);
          if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new Error("linked-device lifecycle sync returned an invalid result");
          }
          requireExactKeys(value, ["itemsStored", "projection", "emitsProtocolAcknowledgements"], "linked-device lifecycle sync result");
          if (!Number.isSafeInteger(value.itemsStored) || value.itemsStored < 0 || typeof value.projection !== "string" || value.projection.length < 1 || value.emitsProtocolAcknowledgements !== true) {
            throw new Error("linked-device lifecycle sync returned an invalid result");
          }
          return Object.freeze({ ...value });
        }
      });
    }
  }
  const result = Object.freeze({
    ...common,
    transport: binding.transport,
    operations: Object.freeze(operations),
    loadRuntime,
    subject: Object.freeze({
      ...binding.subject,
      probe: async (auth, options) => {
        const subject = await (await loadRuntime()).probe(auth, options);
        if (typeof subject !== "string" || !binding.subject.matches(subject)) {
          throw new Error(`provider plugin surface ${binding.surfaceId} returned a subject outside ${binding.subject.format}`);
        }
        return subject;
      }
    }),
    execute,
    ...messaging?.action.state === "supported" ? {
      executeMessagingPart: async (operation, input, auth, attempt) => {
        const hook = (await loadRuntime()).executeMessagingPart;
        if (hook === undefined) {
          throw new Error(`provider plugin surface ${binding.surfaceId} declared messaging actions without a runtime hook`);
        }
        return hook(operation, input, auth, attempt);
      }
    } : {},
    ...hasPublicOperations ? { executePublic } : {},
    ...reconciles ? { reconcile } : {},
    ...linkedDeviceLifecycle === undefined ? {} : { linkedDeviceLifecycle }
  });
  return result;
}
function defineProviderPlugin(plugin) {
  requireExactKeys(plugin, [
    "apiVersion",
    "id",
    "version",
    "displayName",
    "sourceKind",
    "implementationSources",
    "bindings"
  ], "provider plugin");
  if (plugin.apiVersion !== PROVIDER_PLUGIN_API_VERSION) {
    throw new Error(`provider plugin ${String(plugin.id)} uses unsupported API version ${String(plugin.apiVersion)}`);
  }
  if (!isProviderPluginId(plugin.id)) {
    throw new Error("provider plugin ID must be strict lowercase kebab-case with at most 63 characters");
  }
  if (!pluginVersionPattern.test(plugin.version)) {
    throw new Error(`provider plugin ${plugin.id} must declare a semantic version`);
  }
  if (typeof plugin.displayName !== "string" || plugin.displayName.length < 1 || plugin.displayName.length > 100) {
    throw new Error(`provider plugin ${plugin.id} must declare a display name`);
  }
  if (plugin.sourceKind !== "built-in" && plugin.sourceKind !== "source") {
    throw new Error(`provider plugin ${plugin.id} has an unsupported source kind`);
  }
  requireBoundedNonEmptyArray(plugin.implementationSources, `provider plugin ${plugin.id} implementationSources`, MAX_PROVIDER_PLUGIN_IMPLEMENTATION_SOURCES);
  const sources = [...plugin.implementationSources].map((source) => {
    requireExactKeys(source, ["label", "url"], `provider plugin ${plugin.id} implementation source`);
    if (!sourceLabelPattern.test(source.label) || source.label.includes("..") || source.label.startsWith("/")) {
      throw new Error(`provider plugin ${plugin.id} has an unsafe implementation source label`);
    }
    const localFileProtocol = ["file", ":"].join("");
    if (!(source.url instanceof URL) || source.url.protocol !== localFileProtocol) {
      throw new Error(`provider plugin ${plugin.id} implementation sources must be file URLs`);
    }
    let stats;
    let realPath;
    try {
      const path = fileURLToPath2(source.url);
      stats = lstatSync4(path);
      realPath = realpathSync2(path);
    } catch {
      throw new Error(`provider plugin ${plugin.id} implementation source ${source.label} is unreadable`);
    }
    const relativePath = relative(providerPluginSourceRoot, realPath);
    if (stats.isSymbolicLink() || !stats.isFile() || relativePath === "" || relativePath.startsWith("..") || isAbsolute2(relativePath)) {
      throw new Error(`provider plugin ${plugin.id} implementation source ${source.label} must be a regular file under the Ghostget source root`);
    }
    return Object.freeze({ label: source.label, path: realPath });
  });
  sources.sort((left, right) => left.label.localeCompare(right.label));
  if (new Set(sources.map((source) => source.label)).size !== sources.length) {
    throw new Error(`provider plugin ${plugin.id} repeats an implementation source label`);
  }
  if (!sources.some((source) => source.label === "plugin.ts")) {
    throw new Error(`provider plugin ${plugin.id} must bind its plugin.ts implementation source`);
  }
  requireBoundedNonEmptyArray(plugin.bindings, `provider plugin ${plugin.id} bindings`, MAX_PROVIDER_PLUGIN_BINDINGS);
  let operationCount = 0;
  for (const binding of plugin.bindings) {
    requireBoundedNonEmptyArray(binding.operations, `provider plugin surface ${String(binding.surfaceId)} operations`, MAX_PROVIDER_PLUGIN_OPERATIONS_PER_BINDING);
    operationCount += binding.operations.length;
    if (operationCount > MAX_PROVIDER_PLUGIN_OPERATIONS) {
      throw new Error(`provider plugin ${plugin.id} may declare at most ${MAX_PROVIDER_PLUGIN_OPERATIONS} operations`);
    }
  }
  const bindings = [...plugin.bindings].map((binding) => freezeBinding(binding, plugin.sourceKind));
  for (const binding of bindings) {
    if (!providerPluginLazyRuntimeLoaders.has(binding.loadRuntime)) {
      throw new Error(`provider plugin ${plugin.id} runtime must use the branded lazy runtime helper`);
    }
  }
  bindings.sort((left, right) => left.transport.localeCompare(right.transport) || left.surfaceId.localeCompare(right.surfaceId));
  const result = Object.freeze({
    ...plugin,
    implementationSources: Object.freeze(sources),
    bindings: Object.freeze(bindings)
  });
  const evaluationIdentity = captureProviderPluginEvaluationIdentity(plugin.id, sources);
  providerPluginEvaluationSourceDigests.set(result, evaluationIdentity.sourceDigests);
  providerPluginEvaluationInstalledPackageDigests.set(result, evaluationIdentity.installedPackageDigests);
  validatedProviderPlugins.add(result);
  return result;
}

// src/web-session-cleanup-admission.ts
import { randomUUID as randomUUID3 } from "crypto";
import { join as join5 } from "path";
import { types as nodeTypes2 } from "util";
var LEGACY_ADMISSION_SCHEMA_VERSION = 1;
var ADMISSION_SCHEMA_VERSION = 2;
var MAX_ADMISSION_BYTES = 64 * 1024;
var MAX_ACQUISITION_ATTEMPTS = 8;
var digestPattern = /^[a-f0-9]{64}$/u;
var idPattern = /^[a-z][a-z0-9-]{0,127}$/u;
var authIdPattern2 = /^[a-z][a-z0-9-]{0,47}$/u;
var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
var storageHelperArtifactPatterns = Object.freeze([
  /^\.io-write-[1-9][0-9]{0,9}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/u,
  /^\.io-mutation-[a-f0-9]{64}-(?:waiting|candidate|held)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.lock$/u,
  /^\.io-mutation-stage-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[1-9][0-9]{0,9}\.tmp$/u,
  /^\.io-remove-file-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.quarantine$/u
]);
var WEB_SESSION_CLEANUP_ADMISSION_STATE_DIRECTORY = "provider-plugin-state/.web-session-cleanup-admissions";
function record3(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes2.isProxy(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = {};
  for (const key2 of Reflect.ownKeys(descriptors)) {
    if (typeof key2 !== "string") {
      throw new Error(`${label} has unsupported symbol fields`);
    }
    const descriptor = descriptors[key2];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(`${label} has unsupported accessor fields`);
    }
    result[key2] = descriptor.value;
  }
  return result;
}
function exactKeys4(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key2, index) => key2 !== expected[index])) {
    throw new Error(`${label} has unsupported fields`);
  }
}
function digest(value, label) {
  if (typeof value !== "string" || !digestPattern.test(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function identifier(value, label, pattern = idPattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function uuid(value, label) {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function timestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function parseOwner(value) {
  const owner = record3(value, "web-session cleanup admission owner");
  exactKeys4(owner, ["pid", "token", "bootId", "processStartId"], "web-session cleanup admission owner");
  if (typeof owner.pid !== "number" || !Number.isSafeInteger(owner.pid) || owner.pid < 1) {
    throw new Error("web-session cleanup admission owner PID is malformed");
  }
  return Object.freeze({
    pid: owner.pid,
    token: uuid(owner.token, "web-session cleanup admission owner token"),
    bootId: digest(owner.bootId, "web-session cleanup admission owner boot identity"),
    processStartId: digest(owner.processStartId, "web-session cleanup admission owner process identity")
  });
}
function parseRecovery(value) {
  const recovery = record3(value, "web-session cleanup admission recovery");
  if (recovery.status === "idle") {
    exactKeys4(recovery, ["status"], "web-session cleanup admission recovery");
    return Object.freeze({ status: "idle" });
  }
  exactKeys4(recovery, ["status", "owner", "acquiredAt"], "web-session cleanup admission recovery");
  if (recovery.status !== "active") {
    throw new Error("web-session cleanup admission recovery is malformed");
  }
  return Object.freeze({
    status: "active",
    owner: parseOwner(recovery.owner),
    acquiredAt: timestamp(recovery.acquiredAt, "web-session cleanup admission recovery acquisition time")
  });
}
function parseContainment(value) {
  const containment = record3(value, "web-session cleanup admission containment");
  exactKeys4(containment, ["status"], "web-session cleanup admission containment");
  if (containment.status !== "parent-owned" && containment.status !== "resource-active" && containment.status !== "cleanup-complete" && containment.status !== "cleanup-unsafe") {
    throw new Error("web-session cleanup admission containment is malformed");
  }
  return Object.freeze({ status: containment.status });
}
function parseCleanupResourceIdentity(value) {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? Object.getOwnPropertyDescriptor(value, "kind") : undefined;
  if (kind === undefined || !kind.enumerable || !("value" in kind)) {
    throw new Error("provider cleanup resource identity kind is malformed");
  }
  return kind.value === "local-cli-private-root-v1" ? parseLocalCliCleanupResourceIdentityV1(value) : parseBrowserCleanupResourceIdentity(value);
}
function parseCleanupResources(value) {
  if (!Array.isArray(value) || value.length > 8) {
    throw new Error("web-session cleanup resource collection is malformed");
  }
  const resources = [];
  const resourceIds = new Set;
  for (const valueEntry of value) {
    const entry = record3(valueEntry, "web-session cleanup resource");
    if (entry.status === "unpublished") {
      exactKeys4(entry, ["resourceId", "status"], "web-session cleanup resource");
      const resourceId2 = uuid(entry.resourceId, "web-session cleanup resource ID");
      if (resourceIds.has(resourceId2)) {
        throw new Error("web-session cleanup resource ID is duplicated");
      }
      resourceIds.add(resourceId2);
      resources.push(Object.freeze({
        resourceId: resourceId2,
        status: "unpublished"
      }));
      continue;
    }
    if (entry.status !== "active" && entry.status !== "browser-closed-artifacts" && entry.status !== "browser-quiescent-artifacts") {
      throw new Error("web-session cleanup resource status is malformed");
    }
    if (entry.status === "browser-quiescent-artifacts") {
      exactKeys4(entry, ["resourceId", "status", "identity", "removedRoots"], "web-session cleanup resource");
      const resourceId2 = uuid(entry.resourceId, "web-session cleanup resource ID");
      if (resourceIds.has(resourceId2)) {
        throw new Error("web-session cleanup resource ID is duplicated");
      }
      resourceIds.add(resourceId2);
      const identity = parseBrowserCleanupResourceIdentity(entry.identity);
      if (identity.kind !== "agent-browser-session-v2" || !Array.isArray(entry.removedRoots) || entry.removedRoots.length > 2 || entry.removedRoots.some((root, index) => root !== ["artifacts", "socket"][index])) {
        throw new Error("web-session cleanup browser root-removal journal is malformed");
      }
      resources.push(Object.freeze({
        resourceId: resourceId2,
        status: "browser-quiescent-artifacts",
        identity,
        removedRoots: Object.freeze([...entry.removedRoots])
      }));
      continue;
    }
    exactKeys4(entry, ["resourceId", "status", "identity"], "web-session cleanup resource");
    const resourceId = uuid(entry.resourceId, "web-session cleanup resource ID");
    if (resourceIds.has(resourceId)) {
      throw new Error("web-session cleanup resource ID is duplicated");
    }
    resourceIds.add(resourceId);
    resources.push(entry.status === "browser-closed-artifacts" ? Object.freeze({
      resourceId,
      status: "browser-closed-artifacts",
      identity: parseBrowserCleanupResourceIdentity(entry.identity)
    }) : Object.freeze({
      resourceId,
      status: "active",
      identity: parseCleanupResourceIdentity(entry.identity)
    }));
  }
  return Object.freeze(resources);
}
function webSessionCleanupRealmKey(surfaceIdValue, authIdValue) {
  const surfaceId = identifier(surfaceIdValue, "web-session cleanup surface ID");
  const authId2 = identifier(authIdValue, "web-session cleanup auth ID", authIdPattern2);
  return sha256(`io-web-session-cleanup-realm-v1\x00${canonicalJson({
    surfaceId,
    authId: authId2
  })}`);
}
function parseWebSessionCleanupAdmissionClaim(value) {
  const claim = record3(value, "web-session cleanup admission");
  if (claim.schemaVersion !== LEGACY_ADMISSION_SCHEMA_VERSION && claim.schemaVersion !== ADMISSION_SCHEMA_VERSION) {
    throw new Error("web-session cleanup admission version is unsupported");
  }
  exactKeys4(claim, [
    "schemaVersion",
    "realmKey",
    "runId",
    "pluginId",
    "pluginVersion",
    "pluginImplementationHash",
    "adapterId",
    "adapterHash",
    "surfaceId",
    "authId",
    "authHash",
    "owner",
    "acquiredAt",
    "containment",
    "resources",
    ...claim.schemaVersion === ADMISSION_SCHEMA_VERSION ? ["recovery"] : [],
    ...claim.transport === undefined ? [] : ["transport"],
    ...claim.executionIdentityHash === undefined ? [] : ["executionIdentityHash"]
  ], "web-session cleanup admission");
  if (claim.transport === undefined !== (claim.executionIdentityHash === undefined) || claim.transport !== undefined && claim.transport !== "web-session-api" && claim.transport !== "local-cli") {
    throw new Error("web-session cleanup execution identity is malformed");
  }
  const pluginVersion = claim.pluginVersion;
  if (typeof pluginVersion !== "string" || pluginVersion.length < 1 || pluginVersion.length > 128 || /[\0\r\n]/u.test(pluginVersion)) {
    throw new Error("web-session cleanup plugin version is malformed");
  }
  const parsedFields = Object.freeze({
    realmKey: digest(claim.realmKey, "web-session cleanup admission realm key"),
    runId: uuid(claim.runId, "web-session cleanup admission run ID"),
    pluginId: identifier(claim.pluginId, "web-session cleanup admission plugin ID"),
    pluginVersion,
    pluginImplementationHash: digest(claim.pluginImplementationHash, "web-session cleanup admission implementation hash"),
    adapterId: identifier(claim.adapterId, "web-session cleanup admission adapter ID", authIdPattern2),
    adapterHash: digest(claim.adapterHash, "web-session cleanup admission adapter hash"),
    surfaceId: identifier(claim.surfaceId, "web-session cleanup admission surface ID"),
    authId: identifier(claim.authId, "web-session cleanup admission auth ID", authIdPattern2),
    authHash: digest(claim.authHash, "web-session cleanup admission auth hash"),
    ...claim.transport === undefined ? {} : {
      transport: claim.transport,
      executionIdentityHash: digest(claim.executionIdentityHash, "web-session cleanup admission execution identity hash")
    },
    owner: parseOwner(claim.owner),
    acquiredAt: timestamp(claim.acquiredAt, "web-session cleanup admission acquisition time"),
    containment: parseContainment(claim.containment),
    resources: parseCleanupResources(claim.resources)
  });
  const parsed = claim.schemaVersion === LEGACY_ADMISSION_SCHEMA_VERSION ? Object.freeze({
    schemaVersion: LEGACY_ADMISSION_SCHEMA_VERSION,
    ...parsedFields
  }) : Object.freeze({
    schemaVersion: ADMISSION_SCHEMA_VERSION,
    ...parsedFields,
    recovery: parseRecovery(claim.recovery)
  });
  if (parsed.schemaVersion === LEGACY_ADMISSION_SCHEMA_VERSION && parsed.resources.some((resource) => resource.status === "browser-quiescent-artifacts" || resource.status !== "unpublished" && resource.identity.kind === "agent-browser-session-v2")) {
    throw new Error("legacy web-session cleanup admission contains a future resource state");
  }
  if (parsed.realmKey !== webSessionCleanupRealmKey(parsed.surfaceId, parsed.authId)) {
    throw new Error("web-session cleanup admission realm does not match its surface and auth");
  }
  for (const resource of parsed.resources) {
    if (resource.status !== "unpublished" && resource.identity.kind !== "local-cli-private-root-v1" && !resource.identity.session.startsWith(`io-${parsed.owner.pid}-`)) {
      throw new Error("web-session cleanup browser resource does not match its owning process");
    }
    if (resource.status !== "unpublished" && parsed.transport === "local-cli" !== (resource.identity.kind === "local-cli-private-root-v1")) {
      throw new Error("provider cleanup resource does not match its admitted transport");
    }
  }
  if (parsed.containment.status === "parent-owned" && parsed.resources.length !== 0) {
    throw new Error("parent-owned web-session cleanup admission cannot own resources");
  }
  if ((parsed.containment.status === "resource-active" || parsed.containment.status === "cleanup-unsafe") && parsed.resources.length === 0) {
    throw new Error("resource-owning web-session cleanup admission omitted its resources");
  }
  return parsed;
}
function directory(environment) {
  return join5(ghostgetStateHome(environment), WEB_SESSION_CLEANUP_ADMISSION_STATE_DIRECTORY);
}
function pathFor(realmKeyValue, environment) {
  return join5(directory(environment), `${digest(realmKeyValue, "web-session cleanup admission realm key")}.json`);
}
function claimSnapshot(claimValue) {
  const claim = parseWebSessionCleanupAdmissionClaim(claimValue);
  const content = `${canonicalJson(claim)}
`;
  if (Buffer.byteLength(content, "utf8") > MAX_ADMISSION_BYTES) {
    throw new Error("web-session cleanup admission exceeds its byte bound");
  }
  return Object.freeze({
    claim,
    contentSha256: sha256(content)
  });
}
function readWebSessionCleanupAdmission(realmKeyValue, environment) {
  const realmKey = digest(realmKeyValue, "web-session cleanup admission realm key");
  const path = pathFor(realmKey, environment);
  let content;
  try {
    content = readPrivateStateFileIfPresent(path, MAX_ADMISSION_BYTES, "web-session cleanup admission", environment);
  } catch (error) {
    throw new Error("requested web-session cleanup admission is unreadable or unsafe; run ghostget doctor before continuing", { cause: error });
  }
  if (content === null)
    return null;
  try {
    const claim = parseWebSessionCleanupAdmissionClaim(JSON.parse(content));
    if (claim.realmKey !== realmKey || content !== `${canonicalJson(claim)}
`) {
      throw new Error("web-session cleanup admission does not match its canonical realm");
    }
    return Object.freeze({
      claim,
      contentSha256: sha256(content)
    });
  } catch (error) {
    throw new Error("requested web-session cleanup admission is invalid; run ghostget doctor before continuing", { cause: error });
  }
}
function replaceClaim(current, claim, environment) {
  const checked = claimSnapshot(current.claim);
  if (checked.contentSha256 !== current.contentSha256) {
    throw new Error("web-session cleanup admission snapshot is not content-bound");
  }
  const next = claimSnapshot(claim);
  if (next.claim.realmKey !== checked.claim.realmKey || next.claim.runId !== checked.claim.runId || next.claim.owner.token !== checked.claim.owner.token) {
    throw new Error("web-session cleanup admission replacement changed its identity");
  }
  if (!writePrivateJsonIfUnchanged(pathFor(checked.claim.realmKey, environment), next.claim, { expectedCurrentContentSha256: checked.contentSha256 })) {
    throw new Error("web-session cleanup admission changed before containment update");
  }
  return next;
}
function replaceClaimOrAdoptCommitted(current, claim, environment, afterCommitForTest) {
  const desired = claimSnapshot(claim);
  try {
    const committed = replaceClaim(current, desired.claim, environment);
    afterCommitForTest?.();
    return committed;
  } catch (error) {
    let observed;
    try {
      observed = readWebSessionCleanupAdmission(desired.claim.realmKey, environment);
    } catch (reconciliationError) {
      throw new AggregateError([error, reconciliationError], "web-session cleanup publication could not be reconciled");
    }
    if (observed?.contentSha256 === desired.contentSha256) {
      return observed;
    }
    throw error;
  }
}
function replaceContainment(current, containment, environment) {
  return replaceClaim(current, Object.freeze({
    ...current.claim,
    containment
  }), environment);
}
function recoverableBrowserResource(reason, resource) {
  if (!(reason instanceof PreservedBrowserArtifactsError) || reason.cleanupEvidence?.kind !== "agent-browser-closed-artifacts-v1") {
    return null;
  }
  let identity;
  try {
    identity = parseBrowserCleanupResourceIdentity(reason.cleanupEvidence.resource);
  } catch {
    return null;
  }
  if (resource.status !== "unpublished" && (resource.status !== "active" || resource.identity.kind === "local-cli-private-root-v1" || canonicalJson(identity) !== canonicalJson(resource.identity)))
    return null;
  return Object.freeze({
    resourceId: resource.resourceId,
    status: "browser-closed-artifacts",
    identity
  });
}
function controller(initial, environment, dependencies = {}) {
  let current = claimSnapshot(initial.claim);
  if (current.contentSha256 !== initial.contentSha256) {
    throw new Error("web-session cleanup admission snapshot is not content-bound");
  }
  let accepting = true;
  let released = false;
  const barriers = [];
  const result = {
    get current() {
      return current;
    },
    get barriers() {
      return Object.freeze(barriers.map((barrier) => barrier.promise));
    },
    registerCleanupBarrier: (barrier) => {
      if (!accepting) {
        throw new Error("web-session cleanup admission registration is closed");
      }
      if (current.claim.containment.status !== "parent-owned" && current.claim.containment.status !== "resource-active") {
        throw new Error("web-session cleanup admission is not accepting resources");
      }
      if (current.claim.resources.length >= 8) {
        throw new Error("web-session cleanup admission resource count exceeds its bound");
      }
      const resourceId = randomUUID3();
      current = replaceClaim(current, Object.freeze({
        ...current.claim,
        containment: Object.freeze({ status: "resource-active" }),
        resources: Object.freeze([
          ...current.claim.resources,
          Object.freeze({
            resourceId,
            status: "unpublished"
          })
        ])
      }), environment);
      const tracked = {
        status: "pending",
        promise: Promise.resolve(),
        resourceId
      };
      tracked.promise = Promise.resolve(barrier).then(() => {
        tracked.status = "fulfilled";
      }, (cause) => {
        tracked.status = "rejected";
        tracked.reason = cause;
        throw cause;
      });
      tracked.promise.catch(() => {
        return;
      });
      barriers.push(tracked);
      const publishResource = (resourceValue) => {
        const resourceIdentity = parseCleanupResourceIdentity(resourceValue);
        const resources = current.claim.resources.map((resource) => {
          if (resource.resourceId !== resourceId)
            return resource;
          if (resource.status === "unpublished") {
            return Object.freeze({
              resourceId,
              status: "active",
              identity: resourceIdentity
            });
          }
          if (resource.status === "active" && canonicalJson(resource.identity) === canonicalJson(resourceIdentity)) {
            return resource;
          }
          if (resource.status === "active" && resource.identity.kind === "local-cli-private-root-v1" && resourceIdentity.kind === "local-cli-private-root-v1" && localCliCleanupResourceExtends(resource.identity, resourceIdentity)) {
            return Object.freeze({
              resourceId,
              status: "active",
              identity: resourceIdentity
            });
          }
          if (resource.status === "active" && resource.identity.kind !== "local-cli-private-root-v1" && resourceIdentity.kind !== "local-cli-private-root-v1" && browserCleanupResourceExtends(resource.identity, resourceIdentity)) {
            return Object.freeze({
              resourceId,
              status: "active",
              identity: resourceIdentity
            });
          }
          throw new Error("web-session cleanup resource identity changed after publication");
        });
        current = replaceClaimOrAdoptCommitted(current, Object.freeze({
          ...current.claim,
          resources: Object.freeze(resources)
        }), environment, dependencies.afterResourceStateCommitForTest);
      };
      const exactPublishedBrowserIdentity = (resourceValue, status) => {
        const identity = parseBrowserCleanupResourceIdentity(resourceValue);
        const selected = current.claim.resources.find((resource) => resource.resourceId === resourceId);
        if (identity.kind !== "agent-browser-session-v2" || selected?.status !== status || canonicalJson(selected.identity) !== canonicalJson(identity)) {
          throw new Error("web-session cleanup browser journal changed resource identity");
        }
        return identity;
      };
      return Object.assign(publishResource, {
        markBrowserCleanupQuiescent: (resourceValue) => {
          const identity = exactPublishedBrowserIdentity(resourceValue, "active");
          if (browserCleanupResourceRootStatus(identity, "artifacts") !== "match" || browserCleanupResourceRootStatus(identity, "socket") !== "match") {
            throw new Error("web-session cleanup browser roots changed before quiescence");
          }
          current = replaceBrowserResource(current, resourceId, identity, "browser-quiescent-artifacts", environment, dependencies.afterResourceStateCommitForTest);
        },
        markBrowserCleanupRootRemoved: (resourceValue, root) => {
          const identity = exactPublishedBrowserIdentity(resourceValue, "browser-quiescent-artifacts");
          const selected = current.claim.resources.find((resource) => resource.resourceId === resourceId);
          const expectedRoot = selected?.status === "browser-quiescent-artifacts" ? ["artifacts", "socket"][selected.removedRoots.length] : undefined;
          const companionRoot = root === "artifacts" ? "socket" : "artifacts";
          const companionStatus = root === "artifacts" ? "match" : "absent";
          if (expectedRoot !== root || browserCleanupResourceRootStatus(identity, root) !== "absent" || browserCleanupResourceRootStatus(identity, companionRoot) !== companionStatus) {
            throw new Error("web-session cleanup browser root removal is not exact");
          }
          current = journalBrowserRootRemoved(current, resourceId, root, environment, dependencies.afterResourceStateCommitForTest);
        }
      });
    },
    closeRegistration: () => {
      accepting = false;
    },
    cleanupComplete: () => {
      if (current.claim.containment.status === "cleanup-complete")
        return;
      if (accepting) {
        throw new Error("web-session cleanup admission registration must close before cleanup completion");
      }
      if (current.claim.containment.status === "cleanup-unsafe") {
        throw new Error("web-session cleanup admission cannot complete after becoming unsafe");
      }
      if (barriers.some((barrier) => barrier.status === "pending")) {
        throw new Error("web-session cleanup admission barriers have not all settled");
      }
      if (barriers.some((barrier) => barrier.status === "rejected")) {
        throw new Error("web-session cleanup admission cannot complete after a rejected barrier");
      }
      current = replaceContainment(current, Object.freeze({ status: "cleanup-complete" }), environment);
    },
    cleanupUnsafe: () => {
      if (current.claim.containment.status === "cleanup-unsafe")
        return;
      if (accepting) {
        throw new Error("web-session cleanup admission registration must close before cleanup is marked unsafe");
      }
      if (current.claim.containment.status === "cleanup-complete") {
        throw new Error("web-session cleanup admission became unsafe after completion");
      }
      const byResourceId = new Map(barriers.map((barrier) => [barrier.resourceId, barrier]));
      const resources = current.claim.resources.flatMap((resource) => {
        const tracked = byResourceId.get(resource.resourceId);
        if (tracked?.status === "fulfilled")
          return [];
        if (tracked?.status === "rejected") {
          return [
            recoverableBrowserResource(tracked.reason, resource) ?? resource
          ];
        }
        return [resource];
      });
      current = replaceClaim(current, Object.freeze({
        ...current.claim,
        containment: Object.freeze({ status: "cleanup-unsafe" }),
        resources: Object.freeze(resources)
      }), environment);
    },
    release: () => {
      if (released)
        return;
      if (current.claim.containment.status !== "cleanup-complete") {
        throw new Error("web-session cleanup admission cannot be released before cleanup completion");
      }
      removePrivateStateFileIfUnchanged(pathFor(current.claim.realmKey, environment), { expectedCurrentContentSha256: current.contentSha256 }, environment);
      released = true;
    }
  };
  return Object.freeze(result);
}
function createClaim(identity, acquiredAt) {
  const realmKey = webSessionCleanupRealmKey(identity.surfaceId, identity.authId);
  const processIdentity = currentProcessStartIdentity();
  return parseWebSessionCleanupAdmissionClaim({
    schemaVersion: ADMISSION_SCHEMA_VERSION,
    realmKey,
    runId: identity.runId,
    pluginId: identity.pluginId,
    pluginVersion: identity.pluginVersion,
    pluginImplementationHash: identity.pluginImplementationHash,
    adapterId: identity.adapterId,
    adapterHash: identity.adapterHash,
    surfaceId: identity.surfaceId,
    authId: identity.authId,
    authHash: identity.authHash,
    ...identity.transport === undefined || identity.executionIdentityHash === undefined ? {} : {
      transport: identity.transport,
      executionIdentityHash: identity.executionIdentityHash
    },
    owner: {
      pid: process.pid,
      token: randomUUID3(),
      ...processIdentity
    },
    acquiredAt: acquiredAt.toISOString(),
    containment: { status: "parent-owned" },
    resources: [],
    recovery: { status: "idle" }
  });
}
function acquireCleanupRecoveryLease(entry, environment, inspectOwner, acquiredAt = new Date) {
  const ownerStatus = inspectOwner(entry.claim.owner);
  if (ownerStatus === "exact-live-owner") {
    return { status: "live-owner" };
  }
  if (ownerStatus === "unknown") {
    return { status: "owner-unknown" };
  }
  if (entry.claim.schemaVersion === ADMISSION_SCHEMA_VERSION && entry.claim.recovery.status === "active") {
    const recoveryOwnerStatus = inspectOwner(entry.claim.recovery.owner);
    if (recoveryOwnerStatus === "exact-live-owner") {
      return { status: "recovery-active" };
    }
    if (recoveryOwnerStatus === "unknown") {
      return { status: "owner-unknown" };
    }
  }
  const processIdentity = currentProcessStartIdentity();
  try {
    const snapshot = replaceClaim(entry, parseWebSessionCleanupAdmissionClaim({
      ...entry.claim,
      schemaVersion: ADMISSION_SCHEMA_VERSION,
      recovery: {
        status: "active",
        owner: {
          pid: process.pid,
          token: randomUUID3(),
          ...processIdentity
        },
        acquiredAt: acquiredAt.toISOString()
      }
    }), environment);
    return { status: "acquired", snapshot };
  } catch {
    return { status: "claim-conflict" };
  }
}
function releaseCleanupRecoveryLease(expected, environment) {
  if (expected.claim.schemaVersion !== ADMISSION_SCHEMA_VERSION || expected.claim.recovery.status !== "active")
    return false;
  try {
    replaceClaim(expected, parseWebSessionCleanupAdmissionClaim({
      ...expected.claim,
      recovery: { status: "idle" }
    }), environment);
    return true;
  } catch {
    return false;
  }
}
function replaceBrowserResource(current, resourceId, identity, status, environment, afterCommitForTest) {
  let found = false;
  const resources = current.claim.resources.map((resource) => {
    if (resource.resourceId !== resourceId)
      return resource;
    if (resource.status === "unpublished" || resource.status === "browser-quiescent-artifacts" || resource.identity.kind === "local-cli-private-root-v1" || !browserCleanupResourceExtends(resource.identity, identity)) {
      throw new Error("web-session cleanup browser recovery changed resource identity");
    }
    found = true;
    return status === "browser-quiescent-artifacts" ? Object.freeze({
      resourceId,
      status,
      identity,
      removedRoots: Object.freeze([])
    }) : Object.freeze({ resourceId, status, identity });
  });
  if (!found) {
    throw new Error("web-session cleanup browser recovery resource is absent");
  }
  return replaceClaimOrAdoptCommitted(current, parseWebSessionCleanupAdmissionClaim({
    ...current.claim,
    resources
  }), environment, afterCommitForTest);
}
function journalBrowserRootRemoved(current, resourceId, root, environment, afterCommitForTest) {
  let found = false;
  const resources = current.claim.resources.map((resource) => {
    if (resource.resourceId !== resourceId)
      return resource;
    if (resource.status !== "browser-quiescent-artifacts") {
      throw new Error("web-session cleanup browser root removal is not quiescent");
    }
    const expected = ["artifacts", "socket"][resource.removedRoots.length];
    if (expected !== root) {
      throw new Error("web-session cleanup browser root removal order changed");
    }
    found = true;
    return Object.freeze({
      ...resource,
      removedRoots: Object.freeze([
        ...resource.removedRoots,
        root
      ])
    });
  });
  if (!found) {
    throw new Error("web-session cleanup browser recovery resource is absent");
  }
  return replaceClaimOrAdoptCommitted(current, parseWebSessionCleanupAdmissionClaim({
    ...current.claim,
    resources
  }), environment, afterCommitForTest);
}
function removeRecoverableLocalCliRoots(claim, inspectOwner) {
  if (claim.resources.length === 0 || claim.resources.some((resource) => resource.status !== "active" || resource.identity.kind !== "local-cli-private-root-v1")) {
    return "proof-unavailable";
  }
  const owner = inspectOwner(claim.owner);
  if (owner === "exact-live-owner")
    return "live-owner";
  if (owner === "unknown")
    return "owner-unknown";
  for (const resource of claim.resources) {
    if (resource.status !== "active" || resource.identity.kind !== "local-cli-private-root-v1") {
      return "proof-unavailable";
    }
    const groupStatus = localCliCleanupProcessGroupStatus(resource.identity, inspectOwner);
    if (groupStatus === "active")
      return "live-owner";
    if (groupStatus !== "quiescent")
      return "proof-unavailable";
  }
  try {
    for (const resource of claim.resources) {
      if (resource.status !== "active" || resource.identity.kind !== "local-cli-private-root-v1") {
        return "proof-unavailable";
      }
      removePrivateDirectoryTree(resource.identity.root.path, {
        device: resource.identity.root.device,
        inode: resource.identity.root.inode,
        birthtimeNs: resource.identity.root.birthtimeNs
      });
    }
  } catch {
    return "artifact-conflict";
  }
  return "repaired";
}
function removePriorBootQuiescentLocalCliRoots(claim) {
  if (claim.resources.length === 0 || claim.resources.some((resource) => resource.status !== "active" || resource.identity.kind !== "local-cli-private-root-v1"))
    return false;
  try {
    for (const resource of claim.resources) {
      if (resource.status !== "active" || resource.identity.kind !== "local-cli-private-root-v1") {
        return false;
      }
      removePrivateDirectoryTree(resource.identity.root.path, {
        device: resource.identity.root.device,
        inode: resource.identity.root.inode,
        birthtimeNs: resource.identity.root.birthtimeNs
      });
    }
    return true;
  } catch {
    return false;
  }
}
function recoverSameBootCleanupUnsafe(entry, environment, inspectOwner) {
  if (entry.claim.containment.status !== "cleanup-unsafe" && entry.claim.containment.status !== "resource-active") {
    return "proof-unavailable";
  }
  if (entry.claim.transport !== "local-cli") {
    return "proof-unavailable";
  }
  const lease = acquireCleanupRecoveryLease(entry, environment, inspectOwner);
  if (lease.status !== "acquired")
    return lease.status;
  const localRecovery = removeRecoverableLocalCliRoots(lease.snapshot.claim, inspectOwner);
  if (localRecovery !== "repaired") {
    return releaseCleanupRecoveryLease(lease.snapshot, environment) ? localRecovery : "claim-conflict";
  }
  return removePrivateStateFileIfUnchanged(pathFor(lease.snapshot.claim.realmKey, environment), { expectedCurrentContentSha256: lease.snapshot.contentSha256 }, environment) ? "repaired" : "claim-conflict";
}
function blockedAdmissionGuidance(claim, recovery) {
  const realm = `${claim.surfaceId}/${claim.authId}`;
  const transport = claim.transport === "local-cli" ? "local CLI" : "authenticated web";
  if (recovery === "live-owner") {
    return `${transport} auth realm ${realm} has active or cleanup-unsafe state still owned by an active run; wait for it to finish`;
  }
  if (recovery === "recovery-active") {
    return `${transport} auth realm ${realm} cleanup recovery is active; wait for ghostget doctor to finish`;
  }
  if (recovery === "owner-unknown") {
    return `${transport} auth realm ${realm} owner liveness cannot be proved; run ghostget doctor again after process inspection becomes available`;
  }
  if (recovery === "artifact-conflict") {
    return `${transport} auth realm ${realm} has identity-changed private cleanup artifacts; retry is unsafe until exact session recovery succeeds`;
  }
  if (recovery === "claim-conflict") {
    return `${transport} auth realm ${realm} cleanup recovery changed concurrently; run ghostget doctor before retrying`;
  }
  if (claim.containment.status === "cleanup-unsafe" && recovery === "proof-unavailable") {
    return `${transport} auth realm ${realm} has cleanup-unsafe state without exact quiescence evidence; run ghostget doctor to recover the exact private session before retrying`;
  }
  if (claim.containment.status === "resource-active") {
    return `${transport} auth realm ${realm} has a resource-active crash boundary; run ghostget doctor to recover the exact private session before retrying`;
  }
  return `${transport} auth realm ${realm} has active or cleanup-unsafe state; wait for the active run, or run ghostget doctor before retrying`;
}

class WebSessionCleanupAdmissionBlockedError extends Error {
  constructor(message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "WebSessionCleanupAdmissionBlockedError";
  }
}
function cleanupAdmissionBlocked(error) {
  if (error instanceof WebSessionCleanupAdmissionBlockedError)
    return error;
  return new WebSessionCleanupAdmissionBlockedError(error instanceof Error ? error.message : "web-session cleanup admission could not be acquired", error);
}
function acquireWebSessionCleanupAdmissionCore(claim, environment, dependencies = {}) {
  const admissionDirectory = directory(environment);
  ensurePrivateStateDirectory(admissionDirectory, environment);
  for (let attempt = 0;attempt < MAX_ACQUISITION_ATTEMPTS; attempt += 1) {
    const existing = readWebSessionCleanupAdmission(claim.realmKey, environment);
    if (existing !== null) {
      if (existing.claim.schemaVersion === ADMISSION_SCHEMA_VERSION && existing.claim.recovery.status === "active") {
        throw new WebSessionCleanupAdmissionBlockedError(blockedAdmissionGuidance(existing.claim, "recovery-active"));
      }
      const containment = existing.claim.containment.status;
      const currentBootId = claim.owner.bootId;
      let sameBootUnsafeRecovery = null;
      if (existing.claim.transport === "local-cli" && (containment === "cleanup-unsafe" || containment === "resource-active") && existing.claim.owner.bootId === currentBootId) {
        sameBootUnsafeRecovery = recoverSameBootCleanupUnsafe(existing, environment, processOwnerStatus);
        if (sameBootUnsafeRecovery === "repaired")
          continue;
        if (sameBootUnsafeRecovery === "claim-conflict")
          continue;
      }
      const priorBootQuiescent = (containment === "resource-active" || containment === "cleanup-unsafe") && existing.claim.owner.bootId !== currentBootId;
      const automaticallyRepairable = containment === "cleanup-complete" || containment === "parent-owned" && processOwnerStatus(existing.claim.owner) === "different-or-dead" || (containment === "resource-active" || containment === "cleanup-unsafe") && existing.claim.transport === "local-cli" && existing.claim.owner.bootId !== currentBootId;
      if (automaticallyRepairable) {
        if (priorBootQuiescent && !removePriorBootQuiescentLocalCliRoots(existing.claim)) {
          throw new WebSessionCleanupAdmissionBlockedError(blockedAdmissionGuidance(existing.claim, "artifact-conflict"));
        }
        removePrivateStateFileIfUnchanged(pathFor(claim.realmKey, environment), { expectedCurrentContentSha256: existing.contentSha256 }, environment);
        continue;
      }
      throw new WebSessionCleanupAdmissionBlockedError(blockedAdmissionGuidance(existing.claim, sameBootUnsafeRecovery));
    }
    let created;
    try {
      created = createPrivateJsonIfAbsent(pathFor(claim.realmKey, environment), claim, { environment });
    } catch (error) {
      if (error instanceof Error && error.message.includes("state file mutation is already active")) {
        continue;
      }
      throw error;
    }
    if (created.created) {
      return controller(claimSnapshot(claim), environment, dependencies);
    }
  }
  throw new WebSessionCleanupAdmissionBlockedError(`${claim.transport === "local-cli" ? "local CLI" : "authenticated web"} auth realm ${claim.surfaceId}/${claim.authId} cleanup admission could not be acquired`);
}
function acquireWebSessionCleanupAdmission(identity, environment = process.env, acquiredAt = new Date, dependencies = {}) {
  const claim = createClaim(identity, acquiredAt);
  try {
    return acquireWebSessionCleanupAdmissionCore(claim, environment, dependencies);
  } catch (error) {
    throw cleanupAdmissionBlocked(error);
  }
}
async function withWebSessionCleanupAdmission(identity, environment, operation, acquiredAt = new Date, onAdmissionBlocked) {
  let admission;
  try {
    admission = acquireWebSessionCleanupAdmission(identity, environment, acquiredAt);
  } catch (error) {
    if (error instanceof WebSessionCleanupAdmissionBlockedError && onAdmissionBlocked !== undefined) {
      return onAdmissionBlocked(error);
    }
    throw error;
  }
  let outcome;
  try {
    try {
      outcome = {
        status: "fulfilled",
        value: await operation(admission.registerCleanupBarrier)
      };
    } catch (reason) {
      outcome = { status: "rejected", reason };
    }
    admission.closeRegistration();
    const cleanup = await Promise.allSettled(admission.barriers);
    if (cleanup.some((result) => result.status === "rejected")) {
      admission.cleanupUnsafe();
    } else {
      admission.cleanupComplete();
      admission.release();
    }
    if (outcome.status === "rejected")
      throw outcome.reason;
    return outcome.value;
  } catch (error) {
    admission.closeRegistration();
    if (admission.current.claim.containment.status === "parent-owned") {
      admission.cleanupComplete();
      admission.release();
    }
    throw error;
  }
}

// src/operation-permission.ts
import { AsyncLocalStorage } from "async_hooks";
var admissions = new AsyncLocalStorage;
var checkedCapabilities = new WeakMap;
var MAX_APPROVAL_BYTES = 240 * 1024;
function changed() {
  throw new OperationPermissionError("OPERATION_PERMISSION_CHANGED", "Operation, account, input, or permissions changed; request fresh authorization.");
}
function denied() {
  throw new OperationPermissionError("OPERATION_PERMISSION_DENIED", "This operation is denied in Ghostget. Review its account and operation permissions in the app.");
}
function approvalRequired() {
  throw new OperationPermissionError("OPERATION_APPROVAL_REQUIRED", "This operation requires human approval in Ghostget. Run a live invocation with the app open; cached reads never wait for approval.");
}
function resolutionFor(manifest, operationId, registry) {
  const operation = manifest.operations[operationId];
  if (operation === undefined)
    throw new Error("Operation is not installed.");
  if (isProviderOperation(operation))
    return registry.requireOperationDefinition("provider-api", operation.provider.provider, operation.provider.action, operation.provider.contractVersion);
  if (isLocalCliOperation(operation))
    return registry.requireOperationDefinition("local-cli", operation.localCli.surface, operation.localCli.action, operation.localCli.contractVersion);
  if (isWebSessionOperation(operation))
    return registry.requireOperationDefinition(registry.requireSessionRoute(operation.webSession.site).transport, operation.webSession.site, operation.webSession.action, operation.webSession.contractVersion);
  throw new OperationPermissionError("OPERATION_PERMISSION_DENIED", "This legacy transport does not support managed operation permissions.");
}
function currentManifest(adapterId, options) {
  const owned = options.registry.resolveOwnedManifest(adapterId);
  const selected = owned === undefined ? loadInstalledManifest(adapterId, options.environment, options.registry) : parseRuntimeManifest(owned, options.registry);
  if (!selected.ok)
    throw new Error("The selected adapter is unavailable or invalid.");
  return selected.value;
}
function publicAuthority(manifest, operationId, resolution) {
  const operation = manifest.operations[operationId];
  if (!isWebSessionOperation(operation))
    return null;
  const policy = webSessionAuthenticationPolicy({
    adapterId: manifest.id,
    operationId,
    recipe: operation.webSession,
    pluginSourceKind: resolution.plugin.sourceKind,
    portable: resolution.portableIdentity !== null,
    risk: resolution.operation.risk,
    state: resolution.operation.state,
    dispatch: resolution.operation.dispatch,
    ...resolution.contractVersion === resolution.operation.contractVersion && resolution.operation.access !== undefined ? { access: resolution.operation.access } : {}
  });
  return policy.kind === "public" ? policy.authority : null;
}
function accountIdentity(id, options) {
  return withSettledReadProjectionAuthAdmission(id, options.environment, () => {
    const auth = loadAuth(id, options.environment);
    return { auth, incarnation: projectionAuthIdentityHash(auth.id, sha256(canonicalJson(auth)), options.environment) };
  });
}
function inspectedAccount(id, options, inspection) {
  if (!inspection.accounts.has(id)) {
    try {
      inspection.accounts.set(id, accountIdentity(id, options));
    } catch {
      inspection.accounts.set(id, null);
    }
  }
  const account = inspection.accounts.get(id);
  if (account === null || account === undefined)
    throw new Error("The selected account is unavailable.");
  return account;
}
function describe(adapterId, operationId, authId2, options, inspection) {
  const { policy } = inspection;
  const manifest = inspection.manifests.get(adapterId) ?? currentManifest(adapterId, options);
  inspection.manifests.set(adapterId, manifest);
  const resolution = resolutionFor(manifest, operationId, options.registry);
  const operation = manifest.operations[operationId];
  const publicAuth = publicAuthority(manifest, operationId, resolution);
  if (publicAuth !== null && authId2 !== null)
    throw new Error("Public operations do not accept an account.");
  if (publicAuth === null && authId2 === null)
    throw new Error("Select an explicit account to inspect private operation permissions.");
  const selectedId = authId2 ?? adapterId;
  const authority = publicAuth !== null ? { auth: publicAuth, incarnation: publicWebSessionAuthorityIdentityHash(publicAuth) } : inspectedAccount(selectedId, options, inspection);
  if (publicAuth === null) {
    requireProviderPluginAuth(resolution.binding, authority.auth);
  }
  const contractKey = canonicalJson([resolution.binding.transport, resolution.binding.surfaceId, resolution.operation.name, resolution.contractVersion]);
  const contractHash = inspection.contracts.get(contractKey) ?? (isProviderOperation(operation) ? providerContractHash(getProviderContract(operation.provider, options.registry), options.registry) : isWebSessionOperation(operation) ? webSessionContractHash(getWebSessionContract(operation.webSession, options.registry), options.registry) : isLocalCliOperation(operation) ? localCliContractHash(getLocalCliContract(operation.localCli, options.registry), options.registry) : denied());
  inspection.contracts.set(contractKey, contractHash);
  const closureHash = inspection.closures.get(resolution.binding) ?? options.registry.implementationClosureHash(resolution.binding);
  inspection.closures.set(resolution.binding, closureHash);
  const coordinate = Object.freeze({
    schemaVersion: 1,
    pluginId: resolution.plugin.id,
    transport: resolution.binding.transport,
    surfaceId: resolution.binding.surfaceId,
    operation: resolution.operation.name,
    contractVersion: resolution.contractVersion,
    adapterId,
    manifestHash: manifestHash(manifest),
    authId: authority.auth.id,
    authIncarnation: authority.incarnation,
    contractHash,
    closureHash,
    portableHash: resolution.portableIdentity === null ? null : sha256(canonicalJson(resolution.portableIdentity))
  });
  const digest2 = sha256(canonicalJson(coordinate));
  return Object.freeze({ digest: digest2, coordinate, revision: policy.revision, decision: policy.managed ? policy.entries.find((entry) => entry.digest === digest2)?.decision ?? "deny" : "unmanaged", manifest, resolution, auth: authority.auth });
}
function inspection(options) {
  return { policy: readOperationPolicy(options.environment), manifests: new Map, accounts: new Map, closures: new Map, contracts: new Map };
}
function describeOperationPermission(adapterId, operationId, authId2, options) {
  return describe(adapterId, operationId, authId2, options, inspection(options));
}
function describeInvocation(invocation, options) {
  const description = describeOperationPermission(invocation.manifest.id, invocation.operationId, invocation.auth.kind === "public-web-session" ? null : invocation.auth.id, options);
  if (manifestHash(invocation.manifest) !== description.coordinate.manifestHash || canonicalJson(invocation.auth) !== canonicalJson(description.auth) || invocation.readProjectionAuthIdentityHash !== description.coordinate.authIncarnation)
    return changed();
  if (invocation.auth.kind !== "public-web-session")
    parseAuth(invocation.auth);
  return description;
}
function activeAdmission(description, input, options) {
  const hash = sha256(canonicalJson(input));
  const stateHome = ghostgetStateHome(options.environment);
  return admissions.getStore()?.findLast((admission) => admission.stateHome === stateHome && admission.capability === description.digest && admission.revision === description.revision && admission.inputs.has(hash));
}
function assertOperationPreparationPermission(invocation, options) {
  if (!readOperationPolicy(options.environment).managed)
    return;
  if (describeInvocation(invocation, options).decision === "deny")
    denied();
}
function assertOperationPermission(invocation, options) {
  const policy = readOperationPolicy(options.environment);
  if (!policy.managed) {
    if (admissions.getStore()?.some((admission) => admission.revision !== 0))
      changed();
    return;
  }
  const description = describeInvocation(invocation, options);
  if (admissions.getStore()?.some((admission) => admission.capability === description.digest && admission.revision !== description.revision))
    changed();
  if (description.decision === "deny")
    denied();
  if (description.decision === "ask" && activeAdmission(description, invocation.input, options) === undefined)
    approvalRequired();
}
async function checkOperationPermission(invocation, options) {
  assertOperationPermission(invocation, options);
  if (!readOperationPolicy(options.environment).managed)
    return;
  const description = describeInvocation(invocation, options);
  const admission = activeAdmission(description, invocation.input, options);
  if (admission?.lease !== null && admission?.lease !== undefined) {
    const { checkApproval } = await import("./approval-client-wtf17gqf.js");
    await checkApproval(admission.lease, { environment: options.environment, ...options.signal === undefined ? {} : { signal: options.signal } });
    assertOperationPermission(invocation, options);
  }
}
function inputForTarget(input) {
  return JSON.parse(canonicalJson(Object.fromEntries(Object.entries(input).map(([key2, value]) => [
    key2,
    Array.isArray(value) ? value.map((item) => typeof item === "object" ? item.reference : item) : typeof value === "object" && ("reference" in value) ? value.reference : value
  ]))));
}
function checkedApproval(invocation, description, stored) {
  const previewOf = (input) => Object.fromEntries(Object.entries(input).map(([key2, value]) => [
    key2,
    Array.isArray(value) ? value.map((item) => typeof item === "object" ? summarizePlanFile(item) : item) : typeof value === "object" ? summarizePlanFile(value) : value
  ]));
  const composite = stored?.plan.messagingComposite;
  const previewInput = composite === undefined ? previewOf(invocation.input) : {
    recipient: composite.recipient,
    routeRef: composite.routeRef,
    contextRef: composite.contextRef,
    parts: composite.parts.map((part) => ({ part: part.partId, text: part.text, input: previewOf(part.input) }))
  };
  const preview = canonicalJson(previewInput);
  if (Buffer.byteLength(preview) > MAX_APPROVAL_BYTES)
    throw new OperationPermissionError("OPERATION_APPROVAL_TOO_LARGE", "This operation exceeds the human approval preview size limit; no request was executed.");
  const digest2 = sha256(canonicalJson({
    protocol: "ghostget.operation-approval/1",
    capability: description.digest,
    revision: description.revision,
    inputHash: sha256(canonicalJson(invocation.input)),
    planDigest: stored?.digest ?? null,
    previewHash: sha256(preview)
  }));
  return Object.freeze({
    digest: digest2,
    revision: description.revision,
    decision: description.decision === "unmanaged" ? "allow" : description.decision,
    kind: "provider",
    title: `${description.manifest.displayName}: ${invocation.operationId}`,
    account: invocation.auth.kind === "public-web-session" ? null : invocation.auth.id,
    effect: description.manifest.operations[invocation.operationId].sideEffect,
    preview
  });
}
async function withOperationPermission(invocation, optionsValue, work) {
  const options = { ...optionsValue, environment: Object.freeze({ ...optionsValue.environment }) };
  const policy = readOperationPolicy(options.environment);
  if (!policy.managed)
    return withUnmanagedOperationPermission(options.environment, work);
  const description = describeInvocation(invocation, options);
  if (description.decision === "deny")
    denied();
  const existing = activeAdmission(description, invocation.input, options);
  if (existing !== undefined) {
    if (options.plan !== undefined && existing.planDigest !== options.plan.digest)
      return changed();
    await checkOperationPermission(invocation, options);
    const result = await work();
    await checkOperationPermission(invocation, options);
    return result;
  }
  const checked = description.decision === "ask" ? checkedApproval(invocation, description, options.plan ?? null) : null;
  const inputHashes = [sha256(canonicalJson(invocation.input)), ...options.plan?.plan.messagingComposite?.parts.map((part) => sha256(canonicalJson(part.input))) ?? []];
  const planDigest = options.plan?.digest ?? null;
  const stateHome = ghostgetStateHome(options.environment);
  let lease = null;
  if (description.decision === "ask") {
    const target = {
      kind: "provider",
      adapterId: invocation.manifest.id,
      operationId: invocation.operationId,
      authId: invocation.auth.kind === "public-web-session" ? null : invocation.auth.id,
      input: options.plan === undefined ? inputForTarget(invocation.input) : null,
      planDigest: options.plan?.digest ?? null
    };
    const { requestApproval } = await import("./approval-client-wtf17gqf.js");
    if (checked === null)
      return changed();
    lease = await requestApproval(target, checked.digest, { environment: options.environment, ...options.signal === undefined ? {} : { signal: options.signal } });
  }
  const admission = Object.freeze({
    capability: description.digest,
    requestDigest: checked?.digest ?? description.digest,
    revision: description.revision,
    inputs: new Set(inputHashes),
    planDigest,
    lease,
    stateHome
  });
  try {
    return await admissions.run([...admissions.getStore() ?? [], admission], async () => {
      const current = describeInvocation(invocation, options);
      if (current.digest !== description.digest || current.revision !== description.revision)
        changed();
      await checkOperationPermission(invocation, options);
      const result = await work();
      await checkOperationPermission(invocation, options);
      return result;
    });
  } finally {
    if (lease !== null) {
      const { releaseApproval } = await import("./approval-client-wtf17gqf.js");
      await releaseApproval(lease, { environment: options.environment });
    }
  }
}
async function withUnmanagedOperationPermission(environment, work) {
  const result = await work();
  if (readOperationPolicy(environment).managed)
    changed();
  return result;
}

export { automationPermissionOperation, automationOperationDefinitions, loadImsgAutomationRuntime, loadWhatsAppAutomationRuntime, createReadProjectionQuery, sealAuthenticatedPrivatePayload, openAuthenticatedPrivatePayload, parseAuth, loadAuth, getProviderContract, providerContractHash, planProviderDispatches, providerConditionalInputIssues, getWebSessionContract, webSessionContractHash, parseLocalCliContractIdentityV1, getLocalCliContract, localCliContractHash, localCliContractIdentity, requireProviderPluginAuth, publicWebSessionInvocationAuthority, webSessionAuthenticationPolicy, isPublicWebSessionInvocationAuthority, parsePublicWebSessionInvocationAuthority, publicWebSessionAuthorityIdentityHash, persistedAuthAuthority, readOperationPolicy, scanProviderPluginValueImports, PORTABLE_PROVIDER_PLUGIN_HOST_API_VERSION, verifyPortableProviderPluginPackageDirectory, PROVIDER_PLUGIN_API_VERSION, MAX_PROVIDER_PLUGIN_IMPLEMENTATION_SOURCES, MAX_PROVIDER_PLUGIN_BINDINGS, MAX_PROVIDER_PLUGIN_OPERATIONS_PER_BINDING, MAX_PROVIDER_PLUGIN_OPERATIONS, runProviderPluginPlanConformance, providerPluginPackageRoot, providerPluginRepositoryRoot, classifyProviderPluginPhysicalPath, isProviderPluginInstalledBinaryDirectory, providerPluginInstalledGuardDirectorySnapshot, providerPluginCanonicalInstalledBinaryLinkTarget, providerPluginDurableInstalledPackageMode, isValidatedProviderPlugin, providerPluginEvaluationSourceSha256, providerPluginEvaluationInstalledPackageSha256, portableProviderPluginArtifactSha256, portableProviderPluginAdapter, portableProviderPluginOperationIdentity, bindProviderPluginRuntimeLoadIdentity, loadProviderPluginExtensionRuntime, lazyProviderApiRuntime, lazyWebSessionRuntime, lazyLocalCliRuntime, defineProviderPlugin, WebSessionCleanupAdmissionBlockedError, acquireWebSessionCleanupAdmission, withWebSessionCleanupAdmission, describeOperationPermission, assertOperationPreparationPermission, assertOperationPermission, checkOperationPermission, withOperationPermission, withUnmanagedOperationPermission };
