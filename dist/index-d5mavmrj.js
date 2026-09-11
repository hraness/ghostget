// @bun
import {
  DOM_ACTION_TRANSPORT_DISABLED_MESSAGE,
  captureProcessOwnerIdentity,
  processOwnerStatus
} from "./index-4bpemvnc.js";

// src/browser.ts
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "fs";
import { spawnSync } from "child_process";
import { createConnection } from "net";
import { tmpdir } from "os";
import { basename, dirname, isAbsolute, join, resolve } from "path";
import { types as nodeTypes } from "util";
import {
  acquireCookieRecords,
  agentBrowserCommand as packageAgentBrowserCommand,
  browserCookieCommands,
  browserProxyArguments
} from "@hraness/kb/clip/acquire";
import { BoundedByteBuffer } from "@hraness/kb/clip/bounded-byte-buffer";
import {
  cloneBrowserProfile,
  cloneProfile,
  copyBoundedLocalState,
  isSafeNamedProfile,
  profilePath
} from "@hraness/kb/browser-profiles";
import { startNetworkProxy } from "@hraness/kb/clip/network-proxy";
import { redactSensitiveText } from "@hraness/kb/clip/persist";
import { sanitizeTerminalLine } from "@hraness/kb/clip/terminal";

// src/derivation-file-chooser.ts
var cdpMessageMaximumBytes = 1024 * 1024;
var cdpCommandTimeoutMs = 1e4;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
    throw new Error(`${label} changed shape`);
  }
}
function localBrowserCdpUrl(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096) {
    throw new Error("managed browser returned an invalid private CDP URL");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("managed browser returned an invalid private CDP URL");
  }
  if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" && url.hostname !== "[::1]" && url.hostname !== "localhost" || url.port === "" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "" || !/^\/devtools\/browser\/[A-Za-z0-9_-]{1,256}$/u.test(url.pathname))
    throw new Error("managed browser returned an invalid private CDP URL");
  return url.href;
}
class PrivateCdpClient {
  #events = new Set;
  #pending = new Map;
  #socket;
  #closed = false;
  #nextId = 1;
  constructor(socket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => this.#onMessage(event));
    socket.addEventListener("close", () => this.#fail(new Error("private CDP connection closed")));
    socket.addEventListener("error", () => this.#fail(new Error("private CDP connection failed")));
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("private CDP connection timed out")), cdpCommandTimeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("private CDP connection failed"));
      }, { once: true });
    });
    return new PrivateCdpClient(socket);
  }
  #fail(error) {
    if (this.#closed)
      return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
    for (const event of this.#events) {
      clearTimeout(event.timer);
      event.reject(error);
    }
    this.#events.clear();
  }
  #onMessage(event) {
    if (typeof event.data !== "string" || Buffer.byteLength(event.data, "utf8") > cdpMessageMaximumBytes) {
      this.#fail(new Error("private CDP message changed shape"));
      return;
    }
    let value;
    try {
      value = JSON.parse(event.data);
    } catch {
      this.#fail(new Error("private CDP message changed shape"));
      return;
    }
    if (!isRecord(value)) {
      this.#fail(new Error("private CDP message changed shape"));
      return;
    }
    if (Number.isSafeInteger(value.id)) {
      const pending = this.#pending.get(value.id);
      if (pending === undefined)
        return;
      this.#pending.delete(value.id);
      clearTimeout(pending.timer);
      const hasResult = Object.hasOwn(value, "result");
      const hasError = Object.hasOwn(value, "error");
      const expectedKeys = pending.sessionId === undefined ? ["id", hasResult ? "result" : "error"] : ["id", hasResult ? "result" : "error", "sessionId"];
      if (hasResult === hasError || pending.sessionId !== undefined && value.sessionId !== pending.sessionId) {
        pending.reject(new Error("private CDP response changed shape"));
        return;
      }
      try {
        exactKeys(value, expectedKeys, "private CDP response");
      } catch {
        pending.reject(new Error("private CDP response changed shape"));
        return;
      }
      if (hasError) {
        if (!isRecord(value.error)) {
          pending.reject(new Error("private CDP response changed shape"));
          return;
        }
        pending.reject(new Error("private CDP command failed"));
        return;
      }
      pending.resolve(value.result);
      return;
    }
    if (typeof value.method !== "string" || !isRecord(value.params))
      return;
    for (const waiter of this.#events) {
      if (waiter.method !== value.method || value.sessionId !== waiter.sessionId)
        continue;
      this.#events.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(value.params);
      return;
    }
  }
  send(method, parameters = {}, sessionId) {
    if (this.#closed || this.#socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("private CDP connection is unavailable"));
    }
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("private CDP command timed out"));
      }, cdpCommandTimeoutMs);
      this.#pending.set(id, { reject, resolve, sessionId, timer });
      this.#socket.send(JSON.stringify({ id, method, params: parameters, ...sessionId === undefined ? {} : { sessionId } }));
    });
  }
  event(method, sessionId) {
    return new Promise((resolve, reject) => {
      const waiter = {
        method,
        reject,
        resolve,
        sessionId,
        timer: setTimeout(() => {
          this.#events.delete(waiter);
          reject(new Error("managed file chooser event timed out"));
        }, cdpCommandTimeoutMs)
      };
      this.#events.add(waiter);
    });
  }
  close() {
    if (this.#socket.readyState === WebSocket.OPEN || this.#socket.readyState === WebSocket.CONNECTING) {
      this.#socket.close();
    }
    this.#fail(new Error("private CDP connection closed"));
  }
}

// src/browser.ts
class PreservedBrowserArtifactsError extends Error {
  recoveryHandle;
  cleanupEvidence;
  constructor(message, recoveryHandle, cause, cleanupEvidence) {
    super(message, { cause });
    this.name = "PreservedBrowserArtifactsError";
    this.recoveryHandle = recoveryHandle;
    if (cleanupEvidence !== undefined) {
      this.cleanupEvidence = cleanupEvidence;
    }
  }
}

class AgentBrowserLiveControlUnavailableError extends Error {
  constructor() {
    super("agent-browser live control identity is unavailable");
    this.name = "AgentBrowserLiveControlUnavailableError";
  }
}
var browserCommandObservations = new WeakMap;
class BrowserCommandCleanupError extends Error {
  constructor(message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "BrowserCommandCleanupError";
  }
}

class AgentBrowserLifecycleCommandUnavailableError extends Error {
  constructor(label) {
    super(`agent-browser ${label} could not be verified`);
    this.name = "AgentBrowserLifecycleCommandUnavailableError";
  }
}

class AgentBrowserCleanupOwnerStillLiveError extends Error {
  constructor() {
    super("browser cleanup pinned owner is not quiescent");
    this.name = "AgentBrowserCleanupOwnerStillLiveError";
  }
}

class AgentBrowserPostCloseTransitionStillSettlingError extends Error {
  constructor() {
    super("browser cleanup post-close transition is still settling");
    this.name = "AgentBrowserPostCloseTransitionStillSettlingError";
  }
}
function recoveryHandleComponent(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}
function browserRecoveryHandle(input) {
  return [
    "v1",
    `session=${recoveryHandleComponent(input.session)}`,
    `config=${recoveryHandleComponent(input.configPath)}`,
    `socket=${input.socketDirectory === null ? "" : recoveryHandleComponent(input.socketDirectory)}`,
    `artifacts=${recoveryHandleComponent(input.artifactsDirectory)}`
  ].join(";");
}
var encodedRecoveryHandleComponentPattern = /^[A-Za-z0-9_-]{1,4096}$/u;
var browserSessionPattern = /^io-([1-9][0-9]{0,9})-[a-f0-9-]{12}$/u;
function decodeRecoveryHandleComponent(value, label) {
  if (!encodedRecoveryHandleComponentPattern.test(value)) {
    throw new Error(`browser recovery ${label} is malformed`);
  }
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) {
    throw new Error(`browser recovery ${label} is not canonical`);
  }
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true
    }).decode(bytes);
  } catch {
    throw new Error(`browser recovery ${label} is not UTF-8`);
  }
  if (decoded === "" || decoded.includes("\x00")) {
    throw new Error(`browser recovery ${label} is malformed`);
  }
  return decoded;
}
function canonicalAbsolutePath(value, label) {
  if (!isAbsolute(value) || resolve(value) !== value) {
    throw new Error(`browser recovery ${label} is not canonical`);
  }
  return value;
}
function parseBrowserRecoveryHandle(value) {
  if (value.length < 1 || value.length > 16 * 1024) {
    throw new Error("browser recovery handle is malformed");
  }
  const parts = value.split(";");
  if (parts.length !== 5 || parts[0] !== "v1" || !parts[1]?.startsWith("session=") || !parts[2]?.startsWith("config=") || !parts[3]?.startsWith("socket=") || !parts[4]?.startsWith("artifacts=")) {
    throw new Error("browser recovery handle is malformed");
  }
  const session = decodeRecoveryHandleComponent(parts[1].slice("session=".length), "session");
  if (!browserSessionPattern.test(session)) {
    throw new Error("browser recovery session is malformed");
  }
  const configPath = canonicalAbsolutePath(decodeRecoveryHandleComponent(parts[2].slice("config=".length), "config path"), "config path");
  const encodedSocket = parts[3].slice("socket=".length);
  if (encodedSocket === "") {
    throw new Error("browser recovery socket directory is unavailable");
  }
  const socketDirectory = canonicalAbsolutePath(decodeRecoveryHandleComponent(encodedSocket, "socket directory"), "socket directory");
  const artifactsDirectory = canonicalAbsolutePath(decodeRecoveryHandleComponent(parts[4].slice("artifacts=".length), "artifacts directory"), "artifacts directory");
  if (basename(socketDirectory).match(/^io-ab-[A-Za-z0-9_-]{6,64}$/u) === null || dirname(socketDirectory) !== "/tmp" || basename(artifactsDirectory).match(/^io-browser-[A-Za-z0-9_-]{6,64}$/u) === null || dirname(artifactsDirectory) !== resolve(tmpdir()) || configPath !== join(artifactsDirectory, "agent-browser.json") || dirname(configPath) !== artifactsDirectory) {
    throw new Error("browser recovery handle does not bind owned private roots");
  }
  return Object.freeze({
    session,
    configPath,
    socketDirectory,
    artifactsDirectory
  });
}
var browserIdentityDecimalPattern = /^(?:0|[1-9][0-9]{0,39})$/u;
var processIdentityDigestPattern = /^[a-f0-9]{64}$/u;
var agentBrowserBoundaryNoncePattern = /^[a-f0-9]{32}$/u;
var agentBrowserLaunchHashPattern = /^(?:0|[1-9][0-9]{0,19})$/u;
var maximumAgentBrowserControlLaunchHash = (1n << 64n) - 1n;
function browserIdentityRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value))
    throw new Error(`${label} is malformed`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} is malformed`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string")
      throw new Error(`${label} is malformed`);
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor) || /[\u0000-\u001f\u007f-\u009f]/u.test(key))
      throw new Error(`${label} is malformed`);
    output[key] = descriptor.value;
  }
  return output;
}
function browserIdentityExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    throw new Error(`${label} is malformed`);
}
function unwrapAgentBrowserIdentityResult(value, label) {
  const root = browserIdentityRecord(value, label);
  const keys = Object.keys(root).sort();
  if (keys.length === 2 && keys[0] === "data" && keys[1] === "success") {
    return Object.freeze({
      data: root.data,
      success: root.success
    });
  }
  browserIdentityExactKeys(root, ["_boundary", "data", "error", "success"], label);
  const boundary = browserIdentityRecord(root._boundary, `${label} boundary`);
  browserIdentityExactKeys(boundary, ["nonce", "origin"], `${label} boundary`);
  if (typeof boundary.nonce !== "string" || !agentBrowserBoundaryNoncePattern.test(boundary.nonce) || boundary.origin !== "unknown")
    throw new Error(`${label} is malformed`);
  return Object.freeze({
    data: root.data,
    success: root.success
  });
}
function browserIdentityDecimal(value, label) {
  if (typeof value !== "string" || !browserIdentityDecimalPattern.test(value))
    throw new Error(`${label} is malformed`);
  return value;
}
function parseBrowserPrivateDirectoryIdentityV1(value, label) {
  const identity = browserIdentityRecord(value, label);
  browserIdentityExactKeys(identity, ["device", "inode"], label);
  return Object.freeze({
    device: browserIdentityDecimal(identity.device, `${label} device`),
    inode: browserIdentityDecimal(identity.inode, `${label} inode`)
  });
}
function parseBrowserPrivateDirectoryIdentityV2(value, label) {
  const identity = browserIdentityRecord(value, label);
  browserIdentityExactKeys(identity, ["birthtimeNs", "device", "inode", "mode", "uid"], label);
  const birthtimeNs = browserIdentityDecimal(identity.birthtimeNs, `${label} birth time`);
  if (birthtimeNs === "0" || identity.mode !== "448") {
    throw new Error(`${label} is malformed`);
  }
  return Object.freeze({
    device: browserIdentityDecimal(identity.device, `${label} device`),
    inode: browserIdentityDecimal(identity.inode, `${label} inode`),
    birthtimeNs,
    mode: "448",
    uid: browserIdentityDecimal(identity.uid, `${label} owner`)
  });
}
function parseBrowserProcessOwner(value) {
  const owner = browserIdentityRecord(value, "browser cleanup daemon owner");
  browserIdentityExactKeys(owner, ["bootId", "pid", "processStartId"], "browser cleanup daemon owner");
  if (typeof owner.pid !== "number" || !Number.isSafeInteger(owner.pid) || owner.pid < 1 || typeof owner.bootId !== "string" || !processIdentityDigestPattern.test(owner.bootId) || typeof owner.processStartId !== "string" || !processIdentityDigestPattern.test(owner.processStartId))
    throw new Error("browser cleanup daemon owner is malformed");
  return Object.freeze({
    pid: owner.pid,
    bootId: owner.bootId,
    processStartId: owner.processStartId
  });
}
function canonicalAgentBrowserLaunchHash(value) {
  if (typeof value !== "string" || !agentBrowserLaunchHashPattern.test(value) || BigInt(value) > maximumAgentBrowserControlLaunchHash)
    throw new Error("browser cleanup launch identity is malformed");
  return value;
}
function literalLoopbackAgentBrowserCdpUrl(value) {
  let cdpUrl;
  try {
    cdpUrl = localBrowserCdpUrl(value);
  } catch {
    throw new Error("browser cleanup control witness is malformed");
  }
  const hostname = new URL(cdpUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "[::1]") {
    throw new Error("browser cleanup control witness is malformed");
  }
  return cdpUrl;
}
function parseAgentBrowserControlWitness(value) {
  const control = browserIdentityRecord(value, "browser cleanup control witness");
  browserIdentityExactKeys(control, [
    "cdpUrl",
    "daemonOwner",
    "engine",
    "kind",
    "launchHash",
    "session",
    "socketDirectory",
    "version"
  ], "browser cleanup control witness");
  if (control.kind !== "agent-browser-control-v1" || control.version !== "0.32.3" || typeof control.session !== "string" || !browserSessionPattern.test(control.session) || typeof control.socketDirectory !== "string" || control.engine !== "chrome" || typeof control.cdpUrl !== "string")
    throw new Error("browser cleanup control witness is malformed");
  const cdpUrl = literalLoopbackAgentBrowserCdpUrl(control.cdpUrl);
  if (cdpUrl !== control.cdpUrl) {
    throw new Error("browser cleanup control witness is malformed");
  }
  return Object.freeze({
    kind: "agent-browser-control-v1",
    version: "0.32.3",
    session: control.session,
    socketDirectory: canonicalAbsolutePath(control.socketDirectory, "control socket directory"),
    daemonOwner: parseBrowserProcessOwner(control.daemonOwner),
    engine: "chrome",
    launchHash: canonicalAgentBrowserLaunchHash(control.launchHash),
    cdpUrl
  });
}
function browserCleanupResourceBase(value) {
  if (typeof value.recoveryHandle !== "string" || typeof value.session !== "string" || typeof value.socketDirectory !== "string" || typeof value.artifactsDirectory !== "string")
    throw new Error("browser cleanup resource identity is malformed");
  const recovery = parseBrowserRecoveryHandle(value.recoveryHandle);
  if (recovery.session !== value.session || recovery.socketDirectory !== value.socketDirectory || recovery.artifactsDirectory !== value.artifactsDirectory)
    throw new Error("browser cleanup resource does not match its recovery handle");
  return {
    recoveryHandle: value.recoveryHandle,
    session: recovery.session,
    socketDirectory: recovery.socketDirectory,
    artifactsDirectory: recovery.artifactsDirectory
  };
}
function parseBrowserCleanupResourceIdentity(value) {
  const identity = browserIdentityRecord(value, "browser cleanup resource identity");
  const commonKeys = [
    "artifactsDirectory",
    "artifactsDirectoryIdentity",
    "kind",
    "recoveryHandle",
    "session",
    "socketDirectory",
    "socketDirectoryIdentity"
  ];
  if (identity.kind === "agent-browser-session-v1") {
    browserIdentityExactKeys(identity, commonKeys, "browser cleanup resource identity");
    const base2 = browserCleanupResourceBase(identity);
    return Object.freeze({
      kind: "agent-browser-session-v1",
      ...base2,
      socketDirectoryIdentity: parseBrowserPrivateDirectoryIdentityV1(identity.socketDirectoryIdentity, "browser cleanup socket identity"),
      artifactsDirectoryIdentity: parseBrowserPrivateDirectoryIdentityV1(identity.artifactsDirectoryIdentity, "browser cleanup artifacts identity")
    });
  }
  if (identity.kind !== "agent-browser-session-v2") {
    throw new Error("browser cleanup resource identity kind is unsupported");
  }
  browserIdentityExactKeys(identity, [...commonKeys, "control", "phase"], "browser cleanup resource identity");
  const base = browserCleanupResourceBase(identity);
  const roots = Object.freeze({
    kind: "agent-browser-session-v2",
    ...base,
    socketDirectoryIdentity: parseBrowserPrivateDirectoryIdentityV2(identity.socketDirectoryIdentity, "browser cleanup socket identity"),
    artifactsDirectoryIdentity: parseBrowserPrivateDirectoryIdentityV2(identity.artifactsDirectoryIdentity, "browser cleanup artifacts identity")
  });
  if (identity.phase === "prepared" || identity.phase === "launch-intent") {
    if (identity.control !== null) {
      throw new Error("browser cleanup phase and control witness are inconsistent");
    }
    return Object.freeze({
      ...roots,
      phase: identity.phase,
      control: null
    });
  }
  if (identity.phase !== "controlled" || identity.control === null) {
    throw new Error("browser cleanup phase is malformed");
  }
  const control = parseAgentBrowserControlWitness(identity.control);
  if (control.session !== base.session || control.socketDirectory !== base.socketDirectory)
    throw new Error("browser cleanup control witness changed resource identity");
  return Object.freeze({
    ...roots,
    phase: "controlled",
    control
  });
}
function privateBrowserDirectoryIdentityV2(path) {
  const stats = lstatSync(path, { bigint: true });
  const currentUid = process.getuid?.();
  if (stats.isSymbolicLink() || !stats.isDirectory() || currentUid === undefined || stats.uid !== BigInt(currentUid) || (stats.mode & 0o777n) !== 0o700n || stats.birthtimeNs <= 0n) {
    throw new Error("browser cleanup resource is not a recoverable private directory");
  }
  return Object.freeze({
    device: stats.dev.toString(),
    inode: stats.ino.toString(),
    birthtimeNs: stats.birthtimeNs.toString(),
    mode: "448",
    uid: stats.uid.toString()
  });
}
function sameBrowserIdentity(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function sameBrowserCleanupResourceBase(left, right) {
  return left.recoveryHandle === right.recoveryHandle && left.session === right.session && left.socketDirectory === right.socketDirectory && left.artifactsDirectory === right.artifactsDirectory;
}
function browserCleanupResourceExtends(current, next) {
  const left = parseBrowserCleanupResourceIdentity(current);
  const right = parseBrowserCleanupResourceIdentity(next);
  if (!sameBrowserCleanupResourceBase(left, right))
    return false;
  if (left.kind === "agent-browser-session-v1") {
    if (right.kind === "agent-browser-session-v1") {
      return sameBrowserIdentity(left, right);
    }
    const matchesLegacyRoots = right.control !== null && left.socketDirectoryIdentity.device === right.socketDirectoryIdentity.device && left.socketDirectoryIdentity.inode === right.socketDirectoryIdentity.inode && left.artifactsDirectoryIdentity.device === right.artifactsDirectoryIdentity.device && left.artifactsDirectoryIdentity.inode === right.artifactsDirectoryIdentity.inode;
    if (!matchesLegacyRoots)
      return false;
    try {
      assertBrowserCleanupResourceRootsMatch(right);
      return true;
    } catch {
      return false;
    }
  }
  if (right.kind !== "agent-browser-session-v2" || !sameBrowserIdentity(left.socketDirectoryIdentity, right.socketDirectoryIdentity) || !sameBrowserIdentity(left.artifactsDirectoryIdentity, right.artifactsDirectoryIdentity))
    return false;
  if (left.phase === "prepared") {
    return right.phase === "prepared" || right.phase === "launch-intent";
  }
  if (left.phase === "launch-intent") {
    return right.phase === "launch-intent" || right.phase === "controlled";
  }
  return right.phase === "controlled" && sameBrowserIdentity(left.control, right.control);
}
function browserCleanupResourceRootStatus(value, root) {
  const resource = parseBrowserCleanupResourceIdentity(value);
  if (resource.kind !== "agent-browser-session-v2") {
    throw new Error("browser cleanup resource does not have recoverable roots");
  }
  const path = root === "socket" ? resource.socketDirectory : resource.artifactsDirectory;
  const expected = root === "socket" ? resource.socketDirectoryIdentity : resource.artifactsDirectoryIdentity;
  let actual;
  try {
    actual = privateBrowserDirectoryIdentityV2(path);
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT" ? "absent" : "conflict";
  }
  return sameBrowserIdentity(actual, expected) ? "match" : "conflict";
}
function assertBrowserCleanupResourceRootsMatch(value) {
  const resource = parseBrowserCleanupResourceIdentity(value);
  if (resource.kind !== "agent-browser-session-v2") {
    throw new Error("browser cleanup resource does not have recoverable roots");
  }
  if (browserCleanupResourceRootStatus(resource, "socket") !== "match" || browserCleanupResourceRootStatus(resource, "artifacts") !== "match")
    throw new Error("browser cleanup private root identity changed");
}
function browserCleanupResourceIdentity(input) {
  const parsed = parseBrowserRecoveryHandle(input.recoveryHandle);
  if (parsed.session !== input.session || parsed.socketDirectory !== input.socketDirectory || parsed.artifactsDirectory !== input.artifactsDirectory) {
    throw new Error("browser cleanup resource does not match its recovery handle");
  }
  return parseBrowserCleanupResourceIdentity({
    kind: "agent-browser-session-v2",
    recoveryHandle: input.recoveryHandle,
    session: parsed.session,
    socketDirectory: parsed.socketDirectory,
    socketDirectoryIdentity: privateBrowserDirectoryIdentityV2(parsed.socketDirectory),
    artifactsDirectory: parsed.artifactsDirectory,
    artifactsDirectoryIdentity: privateBrowserDirectoryIdentityV2(parsed.artifactsDirectory),
    phase: "prepared",
    control: null
  });
}
function browserCleanupBarrier(operation) {
  return operation.then(() => {
    return;
  }, (error) => {
    if (error instanceof PreservedBrowserArtifactsError)
      throw error;
  });
}
function classifyBrowserProcessGroupProbe(status, stderr) {
  if (status === 0)
    return "live";
  if (status === 1 && stderr.includes("No such process"))
    return "gone";
  if (status === 1 && stderr.includes("Operation not permitted"))
    return "live";
  return "unknown";
}
var inheritedProxyKeys = new Set([
  "ALL_PROXY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "all_proxy",
  "http_proxy",
  "https_proxy",
  "no_proxy"
]);
var runtimeBrowserPolicyActions = [
  "launch",
  "navigate",
  "snapshot",
  "click",
  "fill",
  "scroll",
  "wait",
  "read",
  "get",
  "interact",
  "state",
  "type",
  "hover",
  "focus",
  "press",
  "url",
  "inputvalue",
  "waitfortext",
  "waitforurl",
  "cookies_set",
  "close",
  "session_info",
  "cdp_url",
  "upload",
  "select",
  "check",
  "uncheck",
  "ischecked",
  "getbyrole",
  "getbytext",
  "getbylabel",
  "getbyplaceholder",
  "getbyalttext",
  "getbytitle",
  "getbytestid"
];
function agentBrowserCommand() {
  return packageAgentBrowserCommand();
}
var ownedChromeOnboardingArguments = Object.freeze([
  "--no-first-run",
  "--no-default-browser-check"
]);
var reviewedOwnedChromeArguments = new Set([
  "--profile-directory=Default",
  "--disable-quic",
  "--disable-dns-prefetch",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-features=AsyncDns",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--proxy-bypass-list=<-loopback>"
]);
function ownedChromeLaunchArguments(additional = []) {
  if (additional.some((argument) => !reviewedOwnedChromeArguments.has(argument) || /[\0\r\n,]/u.test(argument))) {
    throw new Error("owned Chrome launch arguments are not reviewed");
  }
  return [...new Set([
    ...additional,
    ...ownedChromeOnboardingArguments
  ])].join(`
`);
}
function ownedBrowserProxyArguments(proxyUrl, profileDirectory) {
  const generated = browserProxyArguments(proxyUrl, profileDirectory);
  if (generated.length !== 4 || generated[0] !== "--proxy" || generated[1] !== proxyUrl || generated[2] !== "--args" || typeof generated[3] !== "string") {
    throw new Error("pinned browser proxy arguments are malformed");
  }
  return Object.freeze([
    "--proxy",
    proxyUrl,
    "--args",
    ownedChromeLaunchArguments(generated[3].split(`
`))
  ]);
}
function isolatedEnvironment(socketDirectory, inheritedEnvironment = process.env) {
  const output = {};
  for (const [key, value] of Object.entries(inheritedEnvironment)) {
    if (value === undefined || key.startsWith("AGENT_BROWSER_") || inheritedProxyKeys.has(key))
      continue;
    output[key] = value;
  }
  output.AGENT_BROWSER_SOCKET_DIR = socketDirectory;
  return output;
}
var BROWSER_COMMAND_RESOURCE_SETTLEMENT_TIMEOUT_MS = 1000;
async function promiseSettlesWithin(promise, maximumMs) {
  let timer;
  try {
    return await Promise.race([
      promise.then(() => true, () => true),
      new Promise((resolve2) => {
        timer = setTimeout(() => resolve2(false), maximumMs);
      })
    ]);
  } finally {
    if (timer !== undefined)
      clearTimeout(timer);
  }
}
async function readBoundedStream(stream, maxBytes, cancellation, observation) {
  const bytes = new BoundedByteBuffer(maxBytes);
  const reader = stream.getReader();
  const cancel = () => {
    reader.cancel("browser command was terminated").catch(() => {
      return;
    });
  };
  cancellation.addEventListener("abort", cancel, { once: true });
  try {
    if (cancellation.aborted)
      cancel();
    for (;; ) {
      const result = await reader.read();
      if (result.done) {
        observation.naturalEof = !cancellation.aborted;
        break;
      }
      observation.bytes = Math.min(Number.MAX_SAFE_INTEGER, observation.bytes + result.value.byteLength);
      if (!bytes.append(result.value)) {
        throw new Error(`process output exceeded ${maxBytes} bytes`);
      }
    }
  } finally {
    cancellation.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  return new TextDecoder().decode(bytes.toUint8Array());
}
async function runCommand(command, options) {
  if (process.platform === "win32") {
    throw new Error("contained browser commands require process-tree containment that is unavailable on Windows");
  }
  const isCancelled = () => options.signal?.aborted === true;
  if (isCancelled()) {
    throw new Error("agent-browser command was cancelled");
  }
  const startedAt = performance.now();
  const ownsProcessGroup = true;
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    detached: ownsProcessGroup,
    env: options.environment,
    stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
    stdout: "pipe",
    stderr: "pipe"
  });
  let childExited = false;
  let wrapperExitCode = null;
  const exited = child.exited.then((exitCode) => {
    childExited = true;
    wrapperExitCode = exitCode;
    return exitCode;
  });
  const stdoutObservation = { bytes: 0, naturalEof: false, failed: false };
  const stderrObservation = { bytes: 0, naturalEof: false, failed: false };
  const observe = () => Object.freeze({
    elapsedMs: Math.max(0, performance.now() - startedAt),
    wrapperExited: childExited,
    wrapperExitCode,
    stdout: Object.freeze({ ...stdoutObservation }),
    stderr: Object.freeze({ ...stderrObservation })
  });
  let firstStop = null;
  const diagnosed = (error, originalGroupTerminationSucceeded, resourcesSettled) => {
    try {
      if (firstStop !== null)
        browserCommandObservations.set(error, Object.freeze({
          schemaVersion: 1,
          stopReason: firstStop.reason,
          beforeStop: firstStop.observation,
          terminal: Object.freeze({ ...observe(), originalGroupTerminationSucceeded, resourcesSettled })
        }));
    } catch {}
    return error;
  };
  const outputCancellation = new AbortController;
  const signalProcessTree = (signal) => {
    if (ownsProcessGroup) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {}
    }
    try {
      child.kill(signal);
    } catch {}
  };
  const processTreeIsLive = () => {
    if (!ownsProcessGroup)
      return !childExited;
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH")
        return false;
      if (typeof error === "object" && error !== null && "code" in error && error.code === "EPERM") {
        const probe = spawnSync("/bin/kill", ["-0", `-${child.pid}`], {
          encoding: "utf8",
          env: {
            LANG: "C",
            LC_ALL: "C",
            NODE_ENV: "production",
            PATH: "/usr/bin:/bin"
          }
        });
        if (probe.error === undefined) {
          const result = classifyBrowserProcessGroupProbe(probe.status, probe.stderr);
          if (result === "live")
            return true;
          if (result === "gone")
            return false;
        }
      }
      return true;
    }
  };
  const waitUntilStopped = async (maximumMs) => {
    const deadline = performance.now() + maximumMs;
    for (;; ) {
      if (!processTreeIsLive())
        return true;
      if (performance.now() >= deadline)
        return false;
      await new Promise((resolve2) => {
        setTimeout(resolve2, 10);
      });
    }
  };
  const terminate = async () => {
    signalProcessTree("SIGTERM");
    if (!await waitUntilStopped(1000)) {
      signalProcessTree("SIGKILL");
      if (!await waitUntilStopped(1000)) {
        throw new BrowserCommandCleanupError("agent-browser process group survived forced termination");
      }
    }
  };
  const state = {
    failure: null,
    termination: null
  };
  let rejectForStop;
  const stopped = new Promise((_resolve, reject) => {
    rejectForStop = reject;
  });
  const requestStop = (error, reason = "command-error") => {
    if (state.failure !== null)
      return;
    state.failure = error;
    try {
      firstStop = { reason, observation: observe() };
    } catch {}
    outputCancellation.abort();
    state.termination = terminate();
    state.termination.catch(() => {
      return;
    });
    rejectForStop?.(error);
  };
  const onAbort = () => {
    requestStop(new Error("agent-browser command was cancelled"), "cancelled");
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (isCancelled())
    onAbort();
  const timeout = setTimeout(() => {
    requestStop(new Error(`agent-browser timed out after ${options.timeoutMs}ms`), "timeout");
  }, options.timeoutMs);
  const stdout = readBoundedStream(child.stdout, options.maxOutputBytes, outputCancellation.signal, stdoutObservation).catch((error) => {
    stdoutObservation.failed = true;
    requestStop(error instanceof Error ? error : new Error(String(error)), "stdout-error");
    throw error;
  });
  const stderr = readBoundedStream(child.stderr, Math.min(options.maxOutputBytes, 2 * 1024 * 1024), outputCancellation.signal, stderrObservation).catch((error) => {
    stderrObservation.failed = true;
    requestStop(error instanceof Error ? error : new Error(String(error)), "stderr-error");
    throw error;
  });
  const completed = Promise.all([stdout, stderr, exited]);
  try {
    const [stdoutText, stderrText, exitCode] = await Promise.race([
      completed,
      stopped
    ]);
    if (state.failure !== null)
      throw state.failure;
    return { stdout: stdoutText, stderr: stderrText, exitCode };
  } catch (error) {
    requestStop(error instanceof Error ? error : new Error(String(error)));
    let terminationFailure;
    let originalGroupTerminationSucceeded = false;
    try {
      await state.termination;
      originalGroupTerminationSucceeded = true;
    } catch (terminationError) {
      terminationFailure = terminationError;
    }
    if (terminationFailure !== undefined)
      child.unref();
    const resourcesSettled = await promiseSettlesWithin(Promise.allSettled([stdout, stderr, exited]), BROWSER_COMMAND_RESOURCE_SETTLEMENT_TIMEOUT_MS);
    if (!resourcesSettled)
      child.unref();
    if (terminationFailure !== undefined) {
      throw diagnosed(terminationFailure instanceof BrowserCommandCleanupError ? terminationFailure : new BrowserCommandCleanupError("agent-browser termination failed", terminationFailure), originalGroupTerminationSucceeded, resourcesSettled);
    }
    if (!resourcesSettled) {
      throw diagnosed(new BrowserCommandCleanupError("agent-browser resources did not settle after process termination"), originalGroupTerminationSucceeded, resourcesSettled);
    }
    const failure = state.failure ?? error;
    const normalizedFailure = failure instanceof Error ? failure : new Error(String(failure));
    if (normalizedFailure instanceof BrowserCommandCleanupError) {
      throw diagnosed(normalizedFailure, originalGroupTerminationSucceeded, resourcesSettled);
    }
    throw diagnosed(new BrowserCommandCleanupError(`${normalizedFailure.message}; descendant process cleanup could not be verified`, normalizedFailure), originalGroupTerminationSucceeded, resourcesSettled);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
function parseLastJson(output) {
  let lineEnd = output.length;
  while (lineEnd >= 0) {
    const newline = output.lastIndexOf(`
`, lineEnd - 1);
    const line = output.slice(newline + 1, lineEnd).trim();
    lineEnd = newline;
    if (line.startsWith("[") || line.startsWith("{")) {
      try {
        return JSON.parse(line);
      } catch {}
    }
  }
  throw new Error("agent-browser did not return JSON");
}
var maximumAgentBrowserLaunchHash = (1n << 64n) - 1n;
var maximumAgentBrowserJsonNesting = 256;

class AgentBrowserLaunchHashParseError extends Error {
}

class AgentBrowserLaunchHashRewriter {
  #input;
  #replacements = [];
  #index = 0;
  constructor(input) {
    this.#input = input;
  }
  rewrite() {
    this.#parseValue(false, 0);
    this.#skipWhitespace();
    if (this.#index !== this.#input.length) {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
    }
    let rewritten = this.#input;
    for (const replacement of this.#replacements.toReversed()) {
      rewritten = `${rewritten.slice(0, replacement.start)}${replacement.value}${rewritten.slice(replacement.end)}`;
    }
    return rewritten;
  }
  #parseValue(launchHash, depth) {
    this.#skipWhitespace();
    if (launchHash) {
      if (this.#input.startsWith("null", this.#index)) {
        this.#parseLiteral("null");
        return;
      }
      this.#parseLaunchHash();
      return;
    }
    const token = this.#input[this.#index];
    if (token === "{") {
      this.#parseObject(depth + 1);
      return;
    }
    if (token === "[") {
      this.#parseArray(depth + 1);
      return;
    }
    if (token === '"') {
      this.#parseString();
      return;
    }
    if (token === "t") {
      this.#parseLiteral("true");
      return;
    }
    if (token === "f") {
      this.#parseLiteral("false");
      return;
    }
    if (token === "n") {
      this.#parseLiteral("null");
      return;
    }
    this.#parseNumber();
  }
  #parseObject(depth) {
    this.#assertNesting(depth);
    let sawLaunchHash = false;
    this.#index += 1;
    this.#skipWhitespace();
    if (this.#input[this.#index] === "}") {
      this.#index += 1;
      return;
    }
    for (;; ) {
      this.#skipWhitespace();
      const key = this.#parseString();
      if (key === "launchHash") {
        if (sawLaunchHash) {
          throw new AgentBrowserLaunchHashParseError("agent-browser JSON contains a duplicate launchHash field");
        }
        sawLaunchHash = true;
      }
      this.#skipWhitespace();
      if (this.#input[this.#index] !== ":") {
        throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
      }
      this.#index += 1;
      this.#parseValue(key === "launchHash", depth);
      this.#skipWhitespace();
      const separator = this.#input[this.#index];
      if (separator === "}") {
        this.#index += 1;
        return;
      }
      if (separator !== ",") {
        throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
      }
      this.#index += 1;
    }
  }
  #parseArray(depth) {
    this.#assertNesting(depth);
    this.#index += 1;
    this.#skipWhitespace();
    if (this.#input[this.#index] === "]") {
      this.#index += 1;
      return;
    }
    for (;; ) {
      this.#parseValue(false, depth);
      this.#skipWhitespace();
      const separator = this.#input[this.#index];
      if (separator === "]") {
        this.#index += 1;
        return;
      }
      if (separator !== ",") {
        throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
      }
      this.#index += 1;
    }
  }
  #parseString() {
    const start = this.#index;
    if (this.#input[this.#index] !== '"') {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
    }
    this.#index += 1;
    for (;; ) {
      const token = this.#input[this.#index];
      if (token === undefined) {
        throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
      }
      if (token === '"') {
        this.#index += 1;
        return JSON.parse(this.#input.slice(start, this.#index));
      }
      if (token === "\\") {
        this.#index += 2;
      } else {
        this.#index += 1;
      }
    }
  }
  #parseLiteral(literal) {
    if (!this.#input.startsWith(literal, this.#index)) {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
    }
    this.#index += literal.length;
  }
  #parseNumber() {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(this.#input.slice(this.#index));
    if (match === null) {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON is malformed");
    }
    this.#index += match[0].length;
  }
  #parseLaunchHash() {
    const start = this.#index;
    const match = /^(?:0|[1-9][0-9]*)/u.exec(this.#input.slice(start));
    if (match === null) {
      throw new AgentBrowserLaunchHashParseError("agent-browser launchHash is not an unsigned 64-bit integer");
    }
    const value = match[0];
    this.#index += value.length;
    const following = this.#input[this.#index];
    if (following !== undefined && following !== "," && following !== "}" && following !== "]" && following !== " " && following !== "\t" && following !== "\r" && following !== `
`) {
      throw new AgentBrowserLaunchHashParseError("agent-browser launchHash is not an unsigned 64-bit integer");
    }
    if (BigInt(value) > maximumAgentBrowserLaunchHash) {
      throw new AgentBrowserLaunchHashParseError("agent-browser launchHash exceeds an unsigned 64-bit integer");
    }
    this.#replacements.push({
      start,
      end: this.#index,
      value: JSON.stringify(value)
    });
  }
  #skipWhitespace() {
    while (this.#input[this.#index] === " " || this.#input[this.#index] === "\t" || this.#input[this.#index] === "\r" || this.#input[this.#index] === `
`)
      this.#index += 1;
  }
  #assertNesting(depth) {
    if (depth > maximumAgentBrowserJsonNesting) {
      throw new AgentBrowserLaunchHashParseError("agent-browser JSON exceeds its nesting bound");
    }
  }
}
function parseLastJsonWithExactLaunchHashes(output) {
  let lineEnd = output.length;
  while (lineEnd >= 0) {
    const newline = output.lastIndexOf(`
`, lineEnd - 1);
    const line = output.slice(newline + 1, lineEnd).trim();
    lineEnd = newline;
    if (line.startsWith("[") || line.startsWith("{")) {
      try {
        JSON.parse(line);
      } catch {
        continue;
      }
      const rewritten = new AgentBrowserLaunchHashRewriter(line).rewrite();
      return JSON.parse(rewritten);
    }
  }
  throw new Error("agent-browser did not return JSON");
}
function boundedAgentBrowserText(value) {
  return value === null || typeof value === "string" && value.length <= 64 * 1024 && !/[\0\r\n]/u.test(value);
}
function parseAgentBrowserEffectiveLaunch(value, label) {
  const launch = browserIdentityRecord(value, label);
  browserIdentityExactKeys(launch, ["browserLaunched", "engine", "launchHash"], label);
  if (launch.engine !== "chrome") {
    throw new Error("agent-browser control identity changed");
  }
  if (launch.browserLaunched === false) {
    if (launch.launchHash !== null) {
      throw new Error("agent-browser control identity changed");
    }
    return Object.freeze({
      browserLaunched: false,
      engine: "chrome",
      launchHash: null
    });
  }
  if (launch.browserLaunched !== true) {
    throw new Error("agent-browser control identity changed");
  }
  return Object.freeze({
    browserLaunched: true,
    engine: "chrome",
    launchHash: canonicalAgentBrowserLaunchHash(launch.launchHash)
  });
}
function parseAgentBrowserLifecycle(value, requireNonMutatingCdpSemantics = false) {
  const lifecycle = browserIdentityRecord(value, "agent-browser lifecycle");
  browserIdentityExactKeys(lifecycle, [
    "effectiveLaunch",
    "launched",
    "relaunchedBrowser",
    "restartedBackground",
    "restoreStatus",
    "reused",
    "saveStatus"
  ], "agent-browser lifecycle");
  if (typeof lifecycle.launched !== "boolean" || typeof lifecycle.relaunchedBrowser !== "boolean" || typeof lifecycle.restartedBackground !== "boolean" || typeof lifecycle.reused !== "boolean" || typeof lifecycle.restoreStatus !== "string" || lifecycle.restoreStatus.length < 1 || lifecycle.restoreStatus.length > 256 || typeof lifecycle.saveStatus !== "string" || lifecycle.saveStatus.length < 1 || lifecycle.saveStatus.length > 256 || requireNonMutatingCdpSemantics && (lifecycle.launched !== false || lifecycle.relaunchedBrowser !== false || lifecycle.restartedBackground !== false || lifecycle.restoreStatus !== "not_configured" || lifecycle.saveStatus !== "not_attempted"))
    throw new Error("agent-browser lifecycle changed shape");
  return parseAgentBrowserEffectiveLaunch(lifecycle.effectiveLaunch, "agent-browser lifecycle launch");
}
function parseAgentBrowserSessionState(value, resource) {
  const root = unwrapAgentBrowserIdentityResult(value, "agent-browser session result");
  const data = browserIdentityRecord(root.data, "agent-browser session data");
  browserIdentityExactKeys(data, [
    "active",
    "namespace",
    "pid",
    "runtime",
    "runtimeError",
    "session",
    "socketDir",
    "version"
  ], "agent-browser session data");
  if (root.success !== true || data.namespace !== null || data.runtimeError !== null || data.session !== resource.session || data.socketDir !== resource.socketDirectory)
    throw new Error("agent-browser session identity changed");
  if (data.active === false) {
    if (data.pid !== null || data.runtime !== null || data.version !== null)
      throw new Error("agent-browser inactive session changed shape");
    return Object.freeze({ state: "inactive" });
  }
  if (data.active !== true || typeof data.pid !== "number" || !Number.isSafeInteger(data.pid) || data.pid < 1 || data.version !== "0.32.3")
    throw new Error("agent-browser active session changed shape");
  const runtime = browserIdentityRecord(data.runtime, "agent-browser session runtime");
  browserIdentityExactKeys(runtime, [
    "backgroundPid",
    "browserLaunched",
    "compatibilityStatus",
    "effectiveLaunch",
    "engine",
    "launchHash",
    "lifecycle",
    "namespace",
    "pageCount",
    "restoreCheckFn",
    "restoreCheckText",
    "restoreCheckUrl",
    "restoreKey",
    "restoreLoadedPath",
    "restoreSave",
    "restoreSavedPath",
    "restoreStatus",
    "restoreStatusDetail",
    "restoreValidationPending",
    "saveStatus",
    "session",
    "socketDir"
  ], "agent-browser session runtime");
  const launch = parseAgentBrowserEffectiveLaunch(runtime.effectiveLaunch, "agent-browser session effective launch");
  const lifecycle = parseAgentBrowserLifecycle(runtime.lifecycle, true);
  const browserLaunched = launch.browserLaunched;
  if (runtime.backgroundPid !== data.pid || runtime.browserLaunched !== browserLaunched || runtime.compatibilityStatus !== "current" || runtime.engine !== "chrome" || runtime.launchHash !== launch.launchHash || runtime.namespace !== null || typeof runtime.pageCount !== "number" || !Number.isSafeInteger(runtime.pageCount) || runtime.pageCount < 0 || runtime.pageCount > 100 || !boundedAgentBrowserText(runtime.restoreCheckFn) || !boundedAgentBrowserText(runtime.restoreCheckText) || !boundedAgentBrowserText(runtime.restoreCheckUrl) || !boundedAgentBrowserText(runtime.restoreKey) || !boundedAgentBrowserText(runtime.restoreLoadedPath) || !["auto", "always", "never"].includes(typeof runtime.restoreSave === "string" ? runtime.restoreSave : "") || !boundedAgentBrowserText(runtime.restoreSavedPath) || typeof runtime.restoreStatus !== "string" || runtime.restoreStatus.length < 1 || runtime.restoreStatus.length > 256 || !boundedAgentBrowserText(runtime.restoreStatusDetail) || typeof runtime.restoreValidationPending !== "boolean" || typeof runtime.saveStatus !== "string" || runtime.saveStatus.length < 1 || runtime.saveStatus.length > 256 || runtime.session !== resource.session || runtime.socketDir !== resource.socketDirectory || lifecycle.browserLaunched !== browserLaunched || lifecycle.engine !== launch.engine || lifecycle.launchHash !== launch.launchHash || !browserLaunched && runtime.pageCount !== 0)
    throw new Error("agent-browser active session identity changed");
  if (launch.browserLaunched) {
    return Object.freeze({
      state: "active",
      pid: data.pid,
      browserLaunched: true,
      engine: "chrome",
      launchHash: launch.launchHash
    });
  }
  return Object.freeze({
    state: "active",
    pid: data.pid,
    browserLaunched: false,
    engine: "chrome",
    launchHash: null
  });
}
function parseAgentBrowserCdpControl(value) {
  const root = unwrapAgentBrowserIdentityResult(value, "agent-browser CDP result");
  const data = browserIdentityRecord(root.data, "agent-browser CDP data");
  browserIdentityExactKeys(data, ["cdpUrl", "lifecycle"], "agent-browser CDP data");
  if (root.success !== true || typeof data.cdpUrl !== "string") {
    throw new Error("agent-browser CDP identity changed");
  }
  const lifecycle = parseAgentBrowserLifecycle(data.lifecycle, true);
  if (!lifecycle.browserLaunched) {
    throw new Error("agent-browser CDP identity changed");
  }
  return Object.freeze({
    cdpUrl: literalLoopbackAgentBrowserCdpUrl(data.cdpUrl),
    engine: lifecycle.engine,
    launchHash: lifecycle.launchHash
  });
}
function browserLifecycleCommandContext(resource, dependencies) {
  const recovery = parseBrowserRecoveryHandle(resource.recoveryHandle);
  const runner = dependencies.runCommand ?? runCommand;
  const environment = isolatedEnvironment(resource.socketDirectory);
  const common = [
    ...agentBrowserCommand(),
    "--config",
    recovery.configPath,
    "--session",
    resource.session,
    "--content-boundaries",
    "--max-output",
    "1048576"
  ];
  const invoke = async (suffix, label) => {
    try {
      return await runner([...common, ...suffix], {
        cwd: resource.artifactsDirectory,
        environment,
        timeoutMs: dependencies.commandTimeoutMs?.() ?? 1e4,
        maxOutputBytes: 1024 * 1024,
        ...dependencies.commandSignal === undefined ? {} : { signal: dependencies.commandSignal }
      });
    } catch (error) {
      if (error instanceof BrowserCommandCleanupError)
        throw error;
      throw new AgentBrowserLifecycleCommandUnavailableError(label);
    }
  };
  return Object.freeze({
    inspectSession: async () => {
      const result = await invoke(["session", "info", "--json"], "session inspection");
      if (result.exitCode !== 0) {
        throw new AgentBrowserLifecycleCommandUnavailableError("session inspection");
      }
      try {
        return parseLastJsonWithExactLaunchHashes(result.stdout);
      } catch {
        throw new Error("agent-browser session inspection changed shape");
      }
    },
    inspectCdp: async () => {
      const result = await invoke([
        "--action-policy",
        join(resource.artifactsDirectory, "action-policy.json"),
        "--json",
        "get",
        "cdp-url"
      ], "control inspection");
      if (result.exitCode !== 0) {
        throw new AgentBrowserLifecycleCommandUnavailableError("control inspection");
      }
      try {
        return parseLastJsonWithExactLaunchHashes(result.stdout);
      } catch {
        throw new Error("agent-browser control inspection changed shape");
      }
    },
    close: async () => {
      const result = await invoke(["close", "--json"], "graceful close");
      return result.exitCode === 0;
    }
  });
}
async function provePreparedAgentBrowserCleanupResourceQuiescent(value, dependencies = {}) {
  const resource = parseBrowserCleanupResourceIdentity(value);
  if (resource.kind !== "agent-browser-session-v2" || resource.phase !== "prepared") {
    throw new Error("browser cleanup resource is not prepared");
  }
  const lifecycle = browserLifecycleCommandContext(resource, dependencies);
  assertBrowserCleanupResourceRootsMatch(resource);
  const first = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
  if (first.state !== "inactive") {
    throw new Error("prepared browser cleanup session became active");
  }
  assertBrowserCleanupResourceRootsMatch(resource);
  const second = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
  if (second.state !== "inactive") {
    throw new Error("prepared browser cleanup session state changed");
  }
  assertBrowserCleanupResourceRootsMatch(resource);
  return resource;
}
function exactActiveAgentBrowserControl(state, control) {
  if (state.state !== "active" || !state.browserLaunched || state.pid !== control.daemonOwner.pid || state.engine !== control.engine || state.launchHash !== control.launchHash)
    throw new Error("agent-browser control identity changed");
  return state;
}
function exactClosedAgentBrowserDaemon(state, control) {
  if (state.state !== "active" || state.browserLaunched || state.pid !== control.daemonOwner.pid || state.engine !== control.engine || state.launchHash !== null)
    throw new Error("agent-browser control identity changed");
  return state;
}
function exactPinnedAgentBrowserCdpControl(value, control) {
  const current = parseAgentBrowserCdpControl(value);
  if (current.cdpUrl !== control.cdpUrl || current.engine !== control.engine || current.launchHash !== control.launchHash)
    throw new Error("agent-browser CDP control identity changed");
}
async function bindLiveAgentBrowserCleanupResource(value, dependencies = {}) {
  const resource = parseBrowserCleanupResourceIdentity(value);
  if (resource.kind !== "agent-browser-session-v2" || resource.phase !== "launch-intent") {
    throw new Error("browser cleanup resource cannot accept a control witness");
  }
  assertBrowserCleanupResourceRootsMatch(resource);
  const lifecycle = browserLifecycleCommandContext(resource, dependencies);
  const first = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
  if (first.state !== "active" || !first.browserLaunched) {
    throw new AgentBrowserLiveControlUnavailableError;
  }
  const captureOwner = dependencies.captureOwner ?? captureProcessOwnerIdentity;
  let owner;
  try {
    owner = captureOwner(first.pid);
  } catch {
    throw new Error("agent-browser live control identity is unavailable");
  }
  const cdp = parseAgentBrowserCdpControl(await lifecycle.inspectCdp());
  const second = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
  const repeatedCdp = parseAgentBrowserCdpControl(await lifecycle.inspectCdp());
  const third = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
  const inspectOwner = dependencies.ownerStatus ?? processOwnerStatus;
  if (second.state !== "active" || !second.browserLaunched || second.pid !== first.pid || second.engine !== first.engine || second.launchHash !== first.launchHash || cdp.engine !== first.engine || cdp.launchHash !== first.launchHash || repeatedCdp.cdpUrl !== cdp.cdpUrl || repeatedCdp.engine !== cdp.engine || repeatedCdp.launchHash !== cdp.launchHash || third.state !== "active" || !third.browserLaunched || third.pid !== first.pid || third.engine !== first.engine || third.launchHash !== first.launchHash || owner.pid !== first.pid || inspectOwner(owner) !== "exact-live-owner")
    throw new Error("agent-browser control identity changed while it was bound");
  assertBrowserCleanupResourceRootsMatch(resource);
  const next = parseBrowserCleanupResourceIdentity({
    ...resource,
    phase: "controlled",
    control: {
      kind: "agent-browser-control-v1",
      version: "0.32.3",
      session: resource.session,
      socketDirectory: resource.socketDirectory,
      daemonOwner: owner,
      engine: "chrome",
      launchHash: first.launchHash,
      cdpUrl: cdp.cdpUrl
    }
  });
  if (next.kind !== "agent-browser-session-v2" || !browserCleanupResourceExtends(resource, next))
    throw new Error("browser cleanup control identity is not monotonic");
  return next;
}
async function exactAgentBrowserCdpEndpointStatus(cdpUrl) {
  let endpoint;
  try {
    endpoint = literalLoopbackAgentBrowserCdpUrl(cdpUrl);
  } catch {
    return "indeterminate";
  }
  const url = new URL(endpoint);
  const port = Number(url.port);
  const host = url.hostname === "[::1]" ? "::1" : url.hostname;
  if (host !== "127.0.0.1" && host !== "::1") {
    return "indeterminate";
  }
  return new Promise((resolveStatus) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (status) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolveStatus(status);
    };
    const timer = setTimeout(() => finish("indeterminate"), 250);
    socket.once("connect", () => finish("available"));
    socket.once("error", (error) => {
      finish(error.code === "ECONNREFUSED" ? "unavailable" : "indeterminate");
    });
    socket.once("close", () => finish("indeterminate"));
  });
}
async function provePinnedAgentBrowserCleanupResourceQuiescentWithoutEffects(value, dependencies = {}) {
  const resource = parseBrowserCleanupResourceIdentity(value);
  if (resource.kind !== "agent-browser-session-v2" || resource.phase !== "controlled") {
    throw new Error("browser cleanup resource does not have an exact control witness");
  }
  const control = resource.control;
  const lifecycle = browserLifecycleCommandContext(resource, dependencies);
  const inspectOwner = dependencies.ownerStatus ?? processOwnerStatus;
  const sleep = dependencies.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  const endpointStatus = dependencies.cdpEndpointStatus ?? exactAgentBrowserCdpEndpointStatus;
  assertBrowserCleanupResourceRootsMatch(resource);
  let ownerStatus = inspectOwner(control.daemonOwner);
  if (ownerStatus === "unknown") {
    throw new Error("browser cleanup daemon state is indeterminate");
  }
  if (ownerStatus === "exact-live-owner") {
    let transitionUnavailable = null;
    try {
      const transition = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
      if (transition.state === "active") {
        if (transition.browserLaunched) {
          exactActiveAgentBrowserControl(transition, control);
        } else {
          exactClosedAgentBrowserDaemon(transition, control);
        }
      }
    } catch (error) {
      if (!(error instanceof AgentBrowserLifecycleCommandUnavailableError)) {
        throw error;
      }
      transitionUnavailable = error;
    }
    ownerStatus = inspectOwner(control.daemonOwner);
    if (ownerStatus === "unknown") {
      throw new Error("browser cleanup daemon state is indeterminate");
    }
    if (ownerStatus === "exact-live-owner") {
      assertBrowserCleanupResourceRootsMatch(resource);
      if (transitionUnavailable !== null)
        throw transitionUnavailable;
      throw new AgentBrowserCleanupOwnerStillLiveError;
    }
    assertBrowserCleanupResourceRootsMatch(resource);
  }
  for (let read = 0;read < 2; read += 1) {
    const inactive = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
    if (inactive.state !== "inactive") {
      throw new Error(read === 0 ? "browser cleanup session remained active" : "browser cleanup session quiescence changed");
    }
    assertBrowserCleanupResourceRootsMatch(resource);
  }
  for (let refusal = 0;refusal < 3; refusal += 1) {
    const status = await endpointStatus(control.cdpUrl);
    if (status === "indeterminate") {
      throw new Error("browser cleanup endpoint state is indeterminate");
    }
    if (status !== "unavailable") {
      throw new Error("browser cleanup endpoint remained available");
    }
    assertBrowserCleanupResourceRootsMatch(resource);
    if (refusal < 2)
      await sleep(25);
  }
  if (inspectOwner(control.daemonOwner) !== "different-or-dead") {
    throw new Error("browser cleanup daemon quiescence changed");
  }
  const finalInactive = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
  if (finalInactive.state !== "inactive") {
    throw new Error("browser cleanup session quiescence changed");
  }
  assertBrowserCleanupResourceRootsMatch(resource);
  return resource;
}
async function recoverPinnedAgentBrowserCleanupResourceCore(value, dependencies, mode, postCloseEffectDeadline = null, admitPostCloseTermination = null) {
  const resource = parseBrowserCleanupResourceIdentity(value);
  if (resource.kind !== "agent-browser-session-v2" || resource.phase !== "controlled") {
    throw new Error("browser cleanup resource does not have an exact control witness");
  }
  const control = resource.control;
  const postClose = mode === "close-already-attempted";
  const lifecycle = browserLifecycleCommandContext(resource, dependencies);
  const inspectOwner = dependencies.ownerStatus ?? processOwnerStatus;
  const sleep = dependencies.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  const now = dependencies.now ?? Date.now;
  const endpointStatus = dependencies.cdpEndpointStatus ?? exactAgentBrowserCdpEndpointStatus;
  const terminateOwner = dependencies.terminateOwner ?? ((owner) => {
    process.kill(owner.pid, "SIGTERM");
  });
  const proveNaturalExitAtBoundary = async (boundaryFailure) => {
    const status = inspectOwner(control.daemonOwner);
    if (status === "unknown") {
      throw new Error("browser cleanup daemon state became indeterminate");
    }
    if (status === "exact-live-owner") {
      assertBrowserCleanupResourceRootsMatch(resource);
      if (postClose && boundaryFailure instanceof AgentBrowserLifecycleCommandUnavailableError) {
        throw new AgentBrowserPostCloseTransitionStillSettlingError;
      }
      throw boundaryFailure;
    }
    return provePinnedAgentBrowserCleanupResourceQuiescentWithoutEffects(resource, dependencies);
  };
  const observeSessionAtBoundary = async () => {
    try {
      return Object.freeze({
        kind: "session",
        value: parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource)
      });
    } catch (error) {
      if (error instanceof AgentBrowserLifecycleCommandUnavailableError) {
        return Object.freeze({
          kind: "quiescent",
          resource: await proveNaturalExitAtBoundary(error)
        });
      }
      throw error;
    }
  };
  const observePinnedCdpAtBoundary = async () => {
    let observed;
    try {
      observed = await lifecycle.inspectCdp();
    } catch (error) {
      if (error instanceof AgentBrowserLifecycleCommandUnavailableError) {
        return Object.freeze({
          kind: "quiescent",
          resource: await proveNaturalExitAtBoundary(error)
        });
      }
      throw error;
    }
    exactPinnedAgentBrowserCdpControl(observed, control);
    return Object.freeze({ kind: "control" });
  };
  assertBrowserCleanupResourceRootsMatch(resource);
  const initialOwnerStatus = inspectOwner(control.daemonOwner);
  if (initialOwnerStatus === "unknown") {
    throw new Error("browser cleanup daemon state is indeterminate");
  }
  if (initialOwnerStatus === "different-or-dead") {
    return provePinnedAgentBrowserCleanupResourceQuiescentWithoutEffects(resource, dependencies);
  }
  if (initialOwnerStatus === "exact-live-owner") {
    const initialObservation = await observeSessionAtBoundary();
    if (initialObservation.kind === "quiescent") {
      return initialObservation.resource;
    }
    const initialSession = initialObservation.value;
    if (initialSession.state === "inactive") {
      if (postClose) {
        const transitionOwnerStatus = inspectOwner(control.daemonOwner);
        if (transitionOwnerStatus === "unknown") {
          throw new Error("browser cleanup daemon state became indeterminate");
        }
        if (transitionOwnerStatus === "exact-live-owner") {
          assertBrowserCleanupResourceRootsMatch(resource);
          throw new AgentBrowserPostCloseTransitionStillSettlingError;
        }
      }
      return proveNaturalExitAtBoundary(new Error("browser cleanup daemon and session identity disagree"));
    } else if (initialSession.browserLaunched && postClose) {
      exactActiveAgentBrowserControl(initialSession, control);
      assertBrowserCleanupResourceRootsMatch(resource);
      throw new AgentBrowserPostCloseTransitionStillSettlingError;
    } else if (initialSession.browserLaunched) {
      exactActiveAgentBrowserControl(initialSession, control);
      const firstCdp = await observePinnedCdpAtBoundary();
      if (firstCdp.kind === "quiescent")
        return firstCdp.resource;
      const repeatedActiveObservation = await observeSessionAtBoundary();
      if (repeatedActiveObservation.kind === "quiescent") {
        return repeatedActiveObservation.resource;
      }
      const repeatedActive = repeatedActiveObservation.value;
      if (repeatedActive.state === "inactive") {
        return proveNaturalExitAtBoundary(new Error("browser cleanup daemon identity changed before close"));
      }
      exactActiveAgentBrowserControl(repeatedActive, control);
      const beforeCloseStatus = inspectOwner(control.daemonOwner);
      if (beforeCloseStatus === "unknown") {
        throw new Error("browser cleanup daemon state became indeterminate");
      }
      if (beforeCloseStatus === "different-or-dead") {
        return provePinnedAgentBrowserCleanupResourceQuiescentWithoutEffects(resource, dependencies);
      }
      assertBrowserCleanupResourceRootsMatch(resource);
      let closeSucceeded = false;
      try {
        closeSucceeded = await lifecycle.close();
      } catch (error) {
        if (error instanceof AgentBrowserLifecycleCommandUnavailableError) {
          return proveNaturalExitAtBoundary(error);
        }
        throw error;
      }
      const afterCloseObservation = await observeSessionAtBoundary();
      if (afterCloseObservation.kind === "quiescent") {
        return afterCloseObservation.resource;
      }
      const afterClose = afterCloseObservation.value;
      if (afterClose.state === "active") {
        if (afterClose.browserLaunched) {
          exactActiveAgentBrowserControl(afterClose, control);
        } else {
          exactClosedAgentBrowserDaemon(afterClose, control);
        }
      }
      const afterCloseOwnerStatus = inspectOwner(control.daemonOwner);
      if (afterCloseOwnerStatus === "unknown") {
        throw new Error("browser cleanup daemon state became indeterminate");
      }
      if (afterCloseOwnerStatus === "different-or-dead") {
        return provePinnedAgentBrowserCleanupResourceQuiescentWithoutEffects(resource, dependencies);
      }
      if (afterCloseOwnerStatus === "exact-live-owner") {
        if (afterClose.state === "active" && afterClose.browserLaunched) {
          const afterCloseCdp = await observePinnedCdpAtBoundary();
          if (afterCloseCdp.kind === "quiescent") {
            return afterCloseCdp.resource;
          }
          const repeatedAfterCloseObservation = await observeSessionAtBoundary();
          if (repeatedAfterCloseObservation.kind === "quiescent") {
            return repeatedAfterCloseObservation.resource;
          }
          const repeatedAfterClose = repeatedAfterCloseObservation.value;
          if (repeatedAfterClose.state === "inactive") {
            return proveNaturalExitAtBoundary(new Error("browser cleanup control identity changed"));
          }
          exactActiveAgentBrowserControl(repeatedAfterClose, control);
        } else if (afterClose.state === "active") {
          if (!closeSucceeded) {
            throw new Error("agent-browser graceful close could not be verified");
          }
          const repeatedClosedObservation = await observeSessionAtBoundary();
          if (repeatedClosedObservation.kind === "quiescent") {
            return repeatedClosedObservation.resource;
          }
          const repeatedClosed = repeatedClosedObservation.value;
          if (repeatedClosed.state === "inactive") {
            return proveNaturalExitAtBoundary(new Error("browser cleanup control identity changed"));
          }
          exactClosedAgentBrowserDaemon(repeatedClosed, control);
        } else {
          const repeatedInactiveObservation = await observeSessionAtBoundary();
          if (repeatedInactiveObservation.kind === "quiescent") {
            return repeatedInactiveObservation.resource;
          }
          const repeatedInactive = repeatedInactiveObservation.value;
          if (repeatedInactive.state !== "inactive") {
            throw new Error("browser cleanup session state changed before termination");
          }
        }
      }
    } else {
      exactClosedAgentBrowserDaemon(initialSession, control);
      const repeatedClosedObservation = await observeSessionAtBoundary();
      if (repeatedClosedObservation.kind === "quiescent") {
        return repeatedClosedObservation.resource;
      }
      const repeatedClosed = repeatedClosedObservation.value;
      if (repeatedClosed.state === "inactive") {
        return proveNaturalExitAtBoundary(new Error("browser cleanup control identity changed"));
      }
      exactClosedAgentBrowserDaemon(repeatedClosed, control);
    }
    if (initialSession.state === "active") {
      const beforeTermination = inspectOwner(control.daemonOwner);
      if (beforeTermination === "unknown") {
        throw new Error("browser cleanup daemon state became indeterminate");
      }
      if (beforeTermination === "exact-live-owner") {
        assertBrowserCleanupResourceRootsMatch(resource);
        if (postClose && postCloseEffectDeadline !== null && now() >= postCloseEffectDeadline) {
          throw new Error("browser cleanup post-close convergence deadline expired");
        }
        admitPostCloseTermination?.();
        try {
          terminateOwner(control.daemonOwner);
        } catch {
          if (inspectOwner(control.daemonOwner) === "exact-live-owner") {
            throw new Error("browser cleanup daemon did not accept graceful termination");
          }
        }
        const ownerDeadline = postClose && postCloseEffectDeadline !== null ? Math.min(now() + 5000, postCloseEffectDeadline) : now() + 5000;
        let ownerSleeps = 0;
        for (;; ) {
          const status = inspectOwner(control.daemonOwner);
          if (status === "unknown") {
            throw new Error("browser cleanup daemon state became indeterminate");
          }
          if (status === "different-or-dead")
            break;
          if (ownerSleeps >= (postClose ? 80 : 200) || now() >= ownerDeadline) {
            throw new Error("browser cleanup daemon did not stop after SIGTERM");
          }
          ownerSleeps += 1;
          await sleep(25);
        }
      } else {
        return provePinnedAgentBrowserCleanupResourceQuiescentWithoutEffects(resource, dependencies);
      }
    }
  }
  const finalOwnerStatus = inspectOwner(control.daemonOwner);
  if (finalOwnerStatus !== "different-or-dead") {
    throw new Error("browser cleanup daemon quiescence is unproved");
  }
  const inactive = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
  if (inactive.state !== "inactive") {
    throw new Error("browser cleanup session remained active");
  }
  const endpointDeadline = postClose && postCloseEffectDeadline !== null ? Math.min(now() + 5000, postCloseEffectDeadline) : now() + 5000;
  let consecutiveRefusals = 0;
  let endpointSleeps = 0;
  while (consecutiveRefusals < 3) {
    const status = await endpointStatus(control.cdpUrl);
    if (status === "indeterminate") {
      throw new Error("browser cleanup endpoint state is indeterminate");
    }
    consecutiveRefusals = status === "unavailable" ? consecutiveRefusals + 1 : 0;
    if (consecutiveRefusals >= 3)
      break;
    if (endpointSleeps >= (postClose ? 80 : 200) || now() >= endpointDeadline) {
      throw new Error("browser cleanup endpoint remained available");
    }
    endpointSleeps += 1;
    await sleep(25);
  }
  if (inspectOwner(control.daemonOwner) !== "different-or-dead") {
    throw new Error("browser cleanup daemon quiescence changed");
  }
  const finalInactive = parseAgentBrowserSessionState(await lifecycle.inspectSession(), resource);
  if (finalInactive.state !== "inactive") {
    throw new Error("browser cleanup session quiescence changed");
  }
  assertBrowserCleanupResourceRootsMatch(resource);
  return resource;
}
async function recoverPinnedAgentBrowserCleanupResource(value, dependencies = {}) {
  return recoverPinnedAgentBrowserCleanupResourceCore(value, dependencies, "may-close-browser");
}
async function recoverPinnedAgentBrowserCleanupResourceAfterCloseAttempt(value, dependencies = {}) {
  const sleep = dependencies.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  const suppliedNow = dependencies.now ?? (() => performance.now());
  let lastNow = Number.NEGATIVE_INFINITY;
  const now = () => {
    const value2 = suppliedNow();
    if (!Number.isFinite(value2) || value2 < lastNow) {
      throw new Error("browser cleanup monotonic clock is invalid");
    }
    lastNow = value2;
    return value2;
  };
  const deadline = now() + BROWSER_RESOURCE_TEARDOWN_TIMEOUT_MS;
  const retryIntervalMs = 25;
  const maximumAttempts = Math.ceil(BROWSER_RESOURCE_TEARDOWN_TIMEOUT_MS / retryIntervalMs) + 1;
  let attempts = 0;
  let lastTransitionFailure = new Error("browser cleanup post-close convergence did not start");
  let terminationAttempted = false;
  const originalCommandTimeoutMs = dependencies.commandTimeoutMs;
  const boundedDependencies = {
    ...dependencies,
    now,
    commandTimeoutMs: () => Math.max(1, Math.min(originalCommandTimeoutMs?.() ?? 1e4, Math.max(0, deadline - now())))
  };
  while (attempts < maximumAttempts && (attempts === 0 || now() < deadline)) {
    attempts += 1;
    try {
      return await recoverPinnedAgentBrowserCleanupResourceCore(value, boundedDependencies, "close-already-attempted", deadline, () => {
        if (terminationAttempted) {
          throw new Error("browser cleanup post-close termination was already attempted");
        }
        terminationAttempted = true;
      });
    } catch (error) {
      if (terminationAttempted)
        throw error;
      let retryable = error instanceof AgentBrowserPostCloseTransitionStillSettlingError;
      if (error instanceof AgentBrowserLifecycleCommandUnavailableError) {
        const resource = parseBrowserCleanupResourceIdentity(value);
        if (resource.kind !== "agent-browser-session-v2" || resource.phase !== "controlled")
          throw error;
        assertBrowserCleanupResourceRootsMatch(resource);
        const inspectOwner = dependencies.ownerStatus ?? processOwnerStatus;
        const ownerStatus = inspectOwner(resource.control.daemonOwner);
        if (ownerStatus === "unknown") {
          throw new Error("browser cleanup daemon state became indeterminate");
        }
        retryable = true;
      }
      if (!retryable)
        throw error;
      lastTransitionFailure = error;
      if (attempts >= maximumAttempts || now() >= deadline)
        throw error;
      await sleep(retryIntervalMs);
    }
  }
  throw lastTransitionFailure;
}
async function refreshBrowserCleanupResourceQuiescence(value, dependencies = {}) {
  const resource = parseBrowserCleanupResourceIdentity(value);
  if (resource.kind !== "agent-browser-session-v2") {
    throw new Error("browser cleanup resource is not recoverable");
  }
  if (resource.phase === "prepared") {
    return provePreparedAgentBrowserCleanupResourceQuiescent(resource, dependencies);
  }
  if (resource.phase === "controlled") {
    return recoverPinnedAgentBrowserCleanupResource(resource, dependencies);
  }
  throw new Error("browser cleanup launch intent is not durably controlled");
}
function assertBrowserDeletionBoundaryRoots(resource) {
  if (browserCleanupResourceRootStatus(resource, "socket") !== "match" || browserCleanupResourceRootStatus(resource, "artifacts") !== "absent") {
    throw new Error("browser cleanup deletion-boundary roots changed");
  }
}
async function proveControlledDeletionBoundary(resource, dependencies) {
  if (resource.phase !== "controlled") {
    throw new Error("browser cleanup resource is not durably controlled");
  }
  const inspectOwner = dependencies.ownerStatus ?? processOwnerStatus;
  if (inspectOwner(resource.control.daemonOwner) !== "different-or-dead") {
    throw new Error("browser cleanup pinned owner is not quiescent");
  }
  const endpointStatus = dependencies.cdpEndpointStatus ?? exactAgentBrowserCdpEndpointStatus;
  for (let attempt = 0;attempt < 3; attempt += 1) {
    if (await endpointStatus(resource.control.cdpUrl) !== "unavailable") {
      throw new Error("browser cleanup endpoint refusal is unproved");
    }
  }
  if (inspectOwner(resource.control.daemonOwner) !== "different-or-dead") {
    throw new Error("browser cleanup pinned owner quiescence changed");
  }
}
async function reproveBrowserCleanupAfterArtifactsRemoval(value, dependencies = {}) {
  const resource = parseBrowserCleanupResourceIdentity(value);
  if (resource.kind !== "agent-browser-session-v2" || resource.phase === "launch-intent") {
    throw new Error("browser cleanup resource is ineligible for deletion reproof");
  }
  assertBrowserDeletionBoundaryRoots(resource);
  if (resource.phase === "controlled") {
    await proveControlledDeletionBoundary(resource, dependencies);
  }
  const temporaryConfig = join(resource.socketDirectory, `.wrench-cleanup-${crypto.randomUUID()}.json`);
  try {
    try {
      writeFileSync(temporaryConfig, `{}
`, {
        flag: "wx",
        mode: 384
      });
      const stats = lstatSync(temporaryConfig, { bigint: true });
      const currentUid = process.getuid?.();
      if (stats.isSymbolicLink() || !stats.isFile() || currentUid === undefined || stats.uid !== BigInt(currentUid) || (stats.mode & 0o777n) !== 0o600n)
        throw new Error("temporary cleanup config identity changed");
    } catch {
      throw new Error("browser cleanup session inspection could not be prepared");
    }
    assertBrowserDeletionBoundaryRoots(resource);
    const runner = dependencies.runCommand ?? runCommand;
    const environment = isolatedEnvironment(resource.socketDirectory);
    const inspectSession = async () => {
      let result;
      try {
        result = await runner([
          ...agentBrowserCommand(),
          "--config",
          temporaryConfig,
          "--session",
          resource.session,
          "--content-boundaries",
          "--max-output",
          "1048576",
          "session",
          "info",
          "--json"
        ], {
          cwd: resource.socketDirectory,
          environment,
          timeoutMs: dependencies.commandTimeoutMs?.() ?? 1e4,
          maxOutputBytes: 1024 * 1024,
          ...dependencies.commandSignal === undefined ? {} : { signal: dependencies.commandSignal }
        });
      } catch {
        throw new Error("browser cleanup session inspection could not be verified");
      }
      if (result.exitCode !== 0) {
        throw new Error("browser cleanup session inspection could not be verified");
      }
      let parsed;
      try {
        parsed = parseLastJsonWithExactLaunchHashes(result.stdout);
      } catch {
        throw new Error("browser cleanup session inspection changed shape");
      }
      return parseAgentBrowserSessionState(parsed, resource);
    };
    const first = await inspectSession();
    if (first.state !== "inactive") {
      throw new Error("browser cleanup session remained active");
    }
    assertBrowserDeletionBoundaryRoots(resource);
    const second = await inspectSession();
    if (second.state !== "inactive") {
      throw new Error("browser cleanup session quiescence changed");
    }
    assertBrowserDeletionBoundaryRoots(resource);
    if (resource.phase === "controlled") {
      await proveControlledDeletionBoundary(resource, dependencies);
    }
  } finally {
    try {
      rmSync(temporaryConfig, { force: true });
    } catch {}
  }
  assertBrowserDeletionBoundaryRoots(resource);
  return resource;
}
function agentBrowserFailure(result, context) {
  let detail = null;
  try {
    const parsed = parseLastJson(result.stdout);
    const failures = Array.isArray(parsed) ? parsed : [parsed];
    for (const failure of failures) {
      if (typeof failure !== "object" || failure === null || Array.isArray(failure))
        continue;
      const record = failure;
      if (record.success === false && typeof record.error === "string") {
        detail = sanitizeTerminalLine(redactSensitiveText(record.error)).slice(0, 1000);
        break;
      }
    }
  } catch {}
  return new Error(`${context} failed with exit code ${result.exitCode}${detail === null || detail === "" ? "" : `: ${detail}`}`);
}
function parsedBatch(output, expected) {
  const parsed = parseLastJson(output);
  if (!Array.isArray(parsed) || parsed.length !== expected)
    throw new Error("agent-browser returned a malformed batch result");
  const records = [];
  for (const value of parsed) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error("agent-browser returned a malformed batch entry");
    records.push(value);
  }
  return records;
}
function browserResultData(record) {
  if (record.success !== true) {
    const error = typeof record.error === "string" ? record.error : "agent-browser command failed";
    throw new Error(error);
  }
  if (Object.hasOwn(record, "result"))
    return record.result;
  if (Object.hasOwn(record, "data"))
    return record.data;
  throw new Error("agent-browser command omitted its result");
}
var BROWSER_SETUP_DEADLINE_LABEL = "browser session setup";
var BROWSER_CLOSE_TEARDOWN_TIMEOUT_MS = 17500;
var BROWSER_RESOURCE_TEARDOWN_TIMEOUT_MS = 2000;
var BROWSER_ACTIVE_BATCH_SETTLEMENT_TIMEOUT_MS = 2500;
function guardBrowserSetup(deadline) {
  deadline?.throwIfUnavailable(BROWSER_SETUP_DEADLINE_LABEL);
}
function remainingBrowserSetupTime(requestedTimeoutMs, deadline) {
  if (deadline === undefined)
    return requestedTimeoutMs;
  deadline.throwIfUnavailable(BROWSER_SETUP_DEADLINE_LABEL);
  const remaining = Math.min(requestedTimeoutMs, deadline.remainingTimeMs());
  if (remaining < 1) {
    deadline.throwIfUnavailable(BROWSER_SETUP_DEADLINE_LABEL);
    throw new Error(`${BROWSER_SETUP_DEADLINE_LABEL} timed out`);
  }
  return remaining;
}
function runBrowserSetupStep(deadline, work) {
  if (deadline === undefined)
    return work();
  deadline.throwIfUnavailable(BROWSER_SETUP_DEADLINE_LABEL);
  return deadline.run(() => work(), BROWSER_SETUP_DEADLINE_LABEL);
}
async function teardownCompletesWithin(teardown, maximumMs) {
  let timer;
  const observed = teardown.then(() => true, () => false);
  try {
    return await Promise.race([
      observed,
      new Promise((resolve2) => {
        timer = setTimeout(() => resolve2(false), maximumMs);
      })
    ]);
  } finally {
    if (timer !== undefined)
      clearTimeout(timer);
  }
}
function removePrivateArtifacts(paths, remove) {
  const failures = [];
  for (const path of paths) {
    if (path === null)
      continue;
    try {
      remove(path);
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}
function cleanupFailureCause(operationFailure, cleanupFailures) {
  if (cleanupFailures.length === 0)
    return operationFailure;
  return new AggregateError([operationFailure, ...cleanupFailures], "browser private-artifact cleanup failed");
}
async function createBrowserSession(manifest, auth, options) {
  if (process.platform === "win32") {
    throw new Error("contained browser sessions require process-tree containment that is unavailable on Windows");
  }
  const operationDeadline = options.operationDeadline;
  guardBrowserSetup(operationDeadline);
  const runBrowserCommand = options.dependencies?.runCommand ?? runCommand;
  const createNetworkProxy = options.dependencies?.startNetworkProxy ?? startNetworkProxy;
  const readCookies = options.dependencies?.acquireCookieRecords ?? acquireCookieRecords;
  const removePrivateArtifact = options.dependencies?.removePrivateArtifact ?? ((path) => rmSync(path, { recursive: true, force: true }));
  guardBrowserSetup(operationDeadline);
  const session = `io-${process.pid}-${crypto.randomUUID().slice(0, 12)}`;
  const directory = mkdtempSync(join(tmpdir(), "io-browser-"));
  const configPath = join(directory, "agent-browser.json");
  const policyPath = join(directory, "action-policy.json");
  const globalArguments = [];
  let selectedProfileDirectory = null;
  let socketDirectory = null;
  let cleanupResourceIdentity = null;
  let cleanupResourcePublication = "unpublished";
  const recoveryHandle = () => browserRecoveryHandle({
    session,
    configPath,
    socketDirectory,
    artifactsDirectory: directory
  });
  const failInitialization = (error, cleanupEvidenceResource = cleanupResourceIdentity) => {
    if (cleanupResourcePublication !== "unpublished") {
      throw new PreservedBrowserArtifactsError("browser session initialization failed after its cleanup roots may have been durably published", recoveryHandle(), error, cleanupEvidenceResource === null ? undefined : Object.freeze({
        kind: "agent-browser-closed-artifacts-v1",
        resource: cleanupEvidenceResource
      }));
    }
    const cleanupFailures = removePrivateArtifacts([socketDirectory, directory], removePrivateArtifact);
    if (cleanupFailures.length > 0) {
      throw new PreservedBrowserArtifactsError("browser session initialization failed and private artifacts were preserved because rollback was incomplete", recoveryHandle(), cleanupFailureCause(error, cleanupFailures));
    }
    throw error;
  };
  try {
    globalArguments.push("--config", configPath, "--session", session, "--content-boundaries", "--max-output", String(options.maxOutputBytes), "--action-policy", policyPath, ...auth.kind === "browser-profile" && auth.browserExecutable !== undefined ? ["--executable-path", auth.browserExecutable] : [], ...options.headed ? ["--headed"] : []);
    if (auth.kind !== "browser-profile") {
      globalArguments.push("--allowed-domains", manifest.browserDomains.join(","));
    }
    guardBrowserSetup(operationDeadline);
    chmodSync(directory, 448);
    guardBrowserSetup(operationDeadline);
    socketDirectory = mkdtempSync(join("/tmp", "io-ab-"));
    guardBrowserSetup(operationDeadline);
    chmodSync(socketDirectory, 448);
    guardBrowserSetup(operationDeadline);
    writeFileSync(configPath, `{}
`, { mode: 384, flag: "wx" });
    guardBrowserSetup(operationDeadline);
    writeFileSync(policyPath, `${JSON.stringify({
      default: "deny",
      allow: [
        ...runtimeBrowserPolicyActions,
        ...options.allowCodeOwnedEvaluation === true ? ["evaluate"] : [],
        ...options.allowCodeOwnedNetworkObservation === true ? ["network", "requests", "request"] : []
      ]
    })}
`, { mode: 384, flag: "wx" });
  } catch (error) {
    failInitialization(error);
  }
  const initializedSocketDirectory = socketDirectory ?? failInitialization(new Error("browser socket directory was not initialized"));
  cleanupResourceIdentity = (() => {
    let identity = null;
    try {
      identity = browserCleanupResourceIdentity({
        recoveryHandle: recoveryHandle(),
        session,
        socketDirectory: initializedSocketDirectory,
        artifactsDirectory: directory
      });
      cleanupResourcePublication = options.publishCleanupResource === undefined ? "unpublished" : "uncertain";
      options.publishCleanupResource?.(identity);
      cleanupResourcePublication = options.publishCleanupResource === undefined ? "unpublished" : "published";
      return identity;
    } catch (error) {
      return failInitialization(error, identity);
    }
  })();
  try {
    guardBrowserSetup(operationDeadline);
    const sourceProfile = auth.kind === "browser-profile" ? profilePath(auth.profile) : null;
    if (sourceProfile !== null) {
      guardBrowserSetup(operationDeadline);
      const clonedProfile = cloneBrowserProfile(sourceProfile, directory);
      guardBrowserSetup(operationDeadline);
      globalArguments.push("--profile", clonedProfile.userDataPath);
      selectedProfileDirectory = clonedProfile.profileDirectory ?? null;
    } else if (auth.kind === "browser-profile") {
      guardBrowserSetup(operationDeadline);
      globalArguments.push("--profile", auth.profile);
    }
  } catch (error) {
    failInitialization(error);
  }
  if (cleanupResourceIdentity === null) {
    failInitialization(new Error("browser cleanup resource was not initialized"));
  }
  const publishCleanupResourceExtension = (next) => {
    const current = cleanupResourceIdentity;
    if (current === null || !browserCleanupResourceExtends(current, next)) {
      throw new Error("browser cleanup resource extension is not monotonic");
    }
    if (options.publishCleanupResource !== undefined) {
      cleanupResourcePublication = "uncertain";
      options.publishCleanupResource(next);
      cleanupResourcePublication = "published";
    }
    cleanupResourceIdentity = next;
  };
  let environment;
  try {
    environment = isolatedEnvironment(initializedSocketDirectory);
  } catch (error) {
    failInitialization(error);
  }
  let networkProxy = null;
  const networkProxyCreation = { pending: null };
  let closeDisposition = "open";
  let closeRecoveryDisposition = "ineligible";
  let cleanupConvergenceAttempted = false;
  const sessionIsClosed = () => closeDisposition !== "open";
  let closeOperation = null;
  let launchAttempted = false;
  const activeBatches = new Set;
  let unsafeCommandCleanup = null;
  const runBatch = async (commands, timeoutMs, maxOutputBytes) => {
    if (sessionIsClosed() || closeOperation !== null) {
      throw new Error("browser session is closed");
    }
    return runBrowserSetupStep(operationDeadline, () => {
      const batch = (async () => {
        const result = await runBrowserCommand([...agentBrowserCommand(), ...globalArguments, "batch", "--bail", "--json"], {
          cwd: directory,
          environment,
          timeoutMs: remainingBrowserSetupTime(timeoutMs, operationDeadline),
          maxOutputBytes,
          stdin: JSON.stringify(commands),
          ...operationDeadline === undefined ? {} : { signal: operationDeadline.signal }
        });
        if (result.exitCode !== 0)
          throw agentBrowserFailure(result, "agent-browser batch");
        const entries = parsedBatch(result.stdout, commands.length);
        for (const entry of entries)
          browserResultData(entry);
        return entries;
      })();
      activeBatches.add(batch);
      batch.then(() => activeBatches.delete(batch), (error) => {
        if (error instanceof BrowserCommandCleanupError) {
          unsafeCommandCleanup = error;
        }
        activeBatches.delete(batch);
      });
      return batch;
    });
  };
  const close = () => {
    if (sessionIsClosed())
      return Promise.resolve();
    if (closeOperation !== null)
      return closeOperation;
    closeOperation = (async () => {
      if (activeBatches.size > 0) {
        const settled = await teardownCompletesWithin(Promise.allSettled([...activeBatches]), BROWSER_ACTIVE_BATCH_SETTLEMENT_TIMEOUT_MS);
        if (!settled || activeBatches.size > 0) {
          throw new Error("refusing to close the browser while a batch command remains active");
        }
      }
      if (unsafeCommandCleanup !== null) {
        throw unsafeCommandCleanup;
      }
      let closeFailure;
      try {
        const result = await runBrowserCommand([...agentBrowserCommand(), ...globalArguments, "close", "--json"], { cwd: directory, environment, timeoutMs: 15000, maxOutputBytes: 1024 * 1024 });
        if (result.exitCode === 0) {
          closeDisposition = "acknowledged";
          return;
        }
        closeFailure = agentBrowserFailure(result, "agent-browser close");
      } catch (error) {
        if (error instanceof BrowserCommandCleanupError)
          throw error;
        closeFailure = error;
      }
      const resource = cleanupResourceIdentity;
      if (resource === null || resource.kind !== "agent-browser-session-v2" || resource.phase !== "controlled")
        throw closeFailure;
      try {
        await provePinnedAgentBrowserCleanupResourceQuiescentWithoutEffects(resource, {
          ...options.dependencies?.cleanupLifecycle,
          runCommand: runBrowserCommand
        });
      } catch (quiescenceFailure) {
        if (quiescenceFailure instanceof AgentBrowserCleanupOwnerStillLiveError || quiescenceFailure instanceof AgentBrowserLifecycleCommandUnavailableError) {
          closeRecoveryDisposition = "retry-after-close-attempt";
        }
        throw new AggregateError([closeFailure, quiescenceFailure], "browser session close was neither acknowledged nor independently proved quiescent");
      }
      closeDisposition = "independently-proved-quiescent";
    })();
    return closeOperation;
  };
  const cleanup = async () => {
    if (!sessionIsClosed() && closeOperation === null) {
      throw new Error("refusing to delete private browser artifacts before the session closes");
    }
    const failures = [];
    if (!sessionIsClosed() && closeOperation !== null) {
      try {
        await closeOperation;
      } catch {}
      if (!sessionIsClosed() && closeRecoveryDisposition === "retry-after-close-attempt" && !cleanupConvergenceAttempted && unsafeCommandCleanup === null && activeBatches.size === 0) {
        cleanupConvergenceAttempted = true;
        const resource = cleanupResourceIdentity;
        if (resource === null || resource.kind !== "agent-browser-session-v2" || resource.phase !== "controlled") {
          failures.push(new Error("browser cleanup resource identity is unavailable for close convergence"));
        } else {
          try {
            await recoverPinnedAgentBrowserCleanupResourceAfterCloseAttempt(resource, {
              ...options.dependencies?.cleanupLifecycle,
              runCommand: runBrowserCommand
            });
            closeDisposition = "independently-proved-quiescent";
          } catch (error) {
            failures.push(error);
          }
        }
      }
    }
    let resourcesQuiescent = true;
    if (networkProxy !== null) {
      const proxy = networkProxy;
      if (await teardownCompletesWithin(Promise.resolve().then(() => proxy.close()), BROWSER_RESOURCE_TEARDOWN_TIMEOUT_MS)) {
        if (networkProxy === proxy)
          networkProxy = null;
      } else {
        resourcesQuiescent = false;
        failures.push(new Error("browser network proxy cleanup did not settle safely"));
      }
    }
    const rootsAreUnused = sessionIsClosed() && activeBatches.size === 0;
    if (!rootsAreUnused) {
      failures.push(new Error("refusing to delete private browser artifacts before the session closes"));
    }
    if (resourcesQuiescent && rootsAreUnused) {
      const resource = cleanupResourceIdentity;
      const publisher = options.publishCleanupResource;
      const markQuiescent = publisher?.markBrowserCleanupQuiescent;
      const markRootRemoved = publisher?.markBrowserCleanupRootRemoved;
      if (resource === null) {
        failures.push(new Error("browser cleanup resource identity is unavailable"));
      } else if (publisher !== undefined) {
        if (markQuiescent === undefined || markRootRemoved === undefined) {
          failures.push(new Error("durable browser cleanup journaling is unavailable"));
        } else {
          try {
            await refreshBrowserCleanupResourceQuiescence(resource, {
              ...options.dependencies?.cleanupLifecycle,
              runCommand: runBrowserCommand
            });
            markQuiescent(resource);
          } catch (error) {
            failures.push(error);
          }
        }
      }
      if (failures.length === 0 && resource !== null) {
        for (const [rootName, path] of [
          ["artifacts", directory],
          ["socket", initializedSocketDirectory]
        ]) {
          try {
            removePrivateArtifact(path);
            if (browserCleanupResourceRootStatus(resource, rootName) !== "absent") {
              throw new Error("browser cleanup root removal could not be verified");
            }
          } catch (error) {
            failures.push(error);
            break;
          }
          if (publisher !== undefined && markRootRemoved !== undefined) {
            try {
              markRootRemoved(resource, rootName);
            } catch (error) {
              failures.push(error);
              break;
            }
          }
          if (rootName === "artifacts" && publisher !== undefined) {
            try {
              await reproveBrowserCleanupAfterArtifactsRemoval(resource, {
                ...options.dependencies?.cleanupLifecycle,
                runCommand: runBrowserCommand
              });
            } catch (error) {
              failures.push(error);
              break;
            }
          }
        }
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "browser session cleanup did not remove every private resource");
    }
  };
  try {
    networkProxy = await runBrowserSetupStep(operationDeadline, () => {
      const creation = createNetworkProxy({
        allowPrivateNetwork: false,
        timeoutMs: remainingBrowserSetupTime(options.timeoutMs, operationDeadline),
        maxTransferredBytes: 1024 * 1024 * 1024
      });
      networkProxyCreation.pending = creation;
      return creation;
    });
    networkProxyCreation.pending = null;
    guardBrowserSetup(operationDeadline);
    const proxyArguments = ownedBrowserProxyArguments(networkProxy.url, selectedProfileDirectory ?? undefined);
    guardBrowserSetup(operationDeadline);
    globalArguments.push(...proxyArguments);
    const launchUrl = auth.kind === "browser-profile" ? "about:blank" : manifest.origins[0];
    if (launchUrl === undefined)
      throw new Error("contained browser session requires one reviewed origin");
    guardBrowserSetup(operationDeadline);
    const preparedResource = cleanupResourceIdentity;
    if (preparedResource === null || preparedResource.phase !== "prepared") {
      throw new Error("browser cleanup resource is not prepared for launch");
    }
    const launchIntentResource = parseBrowserCleanupResourceIdentity({
      ...preparedResource,
      phase: "launch-intent",
      control: null
    });
    if (launchIntentResource.kind !== "agent-browser-session-v2") {
      throw new Error("browser cleanup launch intent is malformed");
    }
    publishCleanupResourceExtension(launchIntentResource);
    launchAttempted = true;
    await runBatch([["open", launchUrl]], remainingBrowserSetupTime(options.timeoutMs, operationDeadline), options.maxOutputBytes);
    if (options.publishCleanupResource !== undefined) {
      guardBrowserSetup(operationDeadline);
      const pinnedCleanupResource = await runBrowserSetupStep(operationDeadline, () => bindLiveAgentBrowserCleanupResource(launchIntentResource, {
        runCommand: runBrowserCommand,
        ...operationDeadline === undefined ? {} : {
          commandSignal: operationDeadline.signal,
          commandTimeoutMs: () => remainingBrowserSetupTime(options.timeoutMs, operationDeadline)
        }
      }));
      guardBrowserSetup(operationDeadline);
      publishCleanupResourceExtension(pinnedCleanupResource);
    }
    if (auth.kind === "cookie-source" || auth.kind === "cookies-file" || auth.kind === "browser-profile" && auth.cookieSource !== undefined) {
      for (const origin of manifest.origins) {
        guardBrowserSetup(operationDeadline);
        const target = new URL(origin);
        const cookieResult = await runBrowserSetupStep(operationDeadline, () => readCookies({
          cookieSources: auth.kind === "cookie-source" ? [auth.source] : auth.kind === "browser-profile" && auth.cookieSource !== undefined ? [auth.cookieSource] : [],
          cookieProfile: auth.kind === "cookie-source" ? auth.profile : auth.kind === "browser-profile" ? auth.cookieProfile : undefined,
          cookiesFile: auth.kind === "cookies-file" ? auth.path : undefined,
          timeoutMs: remainingBrowserSetupTime(options.timeoutMs, operationDeadline),
          requireExplicitCookieScope: true
        }, target));
        guardBrowserSetup(operationDeadline);
        const cookieCommands = browserCookieCommands(cookieResult.cookies, target);
        guardBrowserSetup(operationDeadline);
        await runBatch(cookieCommands, remainingBrowserSetupTime(options.timeoutMs, operationDeadline), options.maxOutputBytes);
      }
    }
    guardBrowserSetup(operationDeadline);
    return {
      runBatch,
      close,
      cleanup,
      recoveryHandle: recoveryHandle(),
      ...options.publishCleanupResource === undefined ? {} : {
        cleanupResourceIdentity: cleanupResourceIdentity ?? failInitialization(new Error("browser cleanup resource identity is unavailable"))
      }
    };
  } catch (error) {
    const cleanupFailures = [];
    let resourcesQuiescent = true;
    let commandCleanupUnsafe = error instanceof BrowserCommandCleanupError;
    if (networkProxyCreation.pending !== null) {
      const closeLateProxy = networkProxyCreation.pending.then((proxy) => proxy.close(), () => {
        return;
      });
      if (!await teardownCompletesWithin(closeLateProxy, BROWSER_RESOURCE_TEARDOWN_TIMEOUT_MS)) {
        resourcesQuiescent = false;
        cleanupFailures.push(new Error("browser setup proxy creation did not settle safely"));
      }
      networkProxyCreation.pending = null;
    }
    if (!launchAttempted)
      closeDisposition = "acknowledged";
    if (launchAttempted && !commandCleanupUnsafe) {
      if (!await teardownCompletesWithin(close(), BROWSER_CLOSE_TEARDOWN_TIMEOUT_MS)) {
        cleanupFailures.push(new Error("browser close could not be verified after setup failure"));
      }
      if (unsafeCommandCleanup !== null) {
        commandCleanupUnsafe = true;
        cleanupFailures.push(new Error("a late browser command cleanup failure was preserved"));
      }
    } else if (commandCleanupUnsafe) {
      cleanupFailures.push(new Error("browser command cleanup could not be verified"));
    }
    if (networkProxy !== null) {
      const proxy = networkProxy;
      if (await teardownCompletesWithin(Promise.resolve().then(() => proxy.close()), BROWSER_RESOURCE_TEARDOWN_TIMEOUT_MS)) {
        if (networkProxy === proxy)
          networkProxy = null;
      } else {
        resourcesQuiescent = false;
        cleanupFailures.push(new Error("browser network proxy could not be closed safely"));
      }
    }
    if (cleanupResourcePublication !== "unpublished") {
      cleanupFailures.push(new Error("durably published browser roots require exact recovery"));
    } else if (resourcesQuiescent && sessionIsClosed() && activeBatches.size === 0 && !commandCleanupUnsafe) {
      cleanupFailures.push(...removePrivateArtifacts([initializedSocketDirectory, directory], removePrivateArtifact));
    } else {
      cleanupFailures.push(new Error("browser private roots remain in use by an unclosed session"));
    }
    if (cleanupFailures.length > 0) {
      throw new PreservedBrowserArtifactsError("browser session setup failed and private artifacts were preserved because cleanup could not be verified", recoveryHandle(), cleanupFailureCause(error, cleanupFailures));
    }
    throw error;
  }
}
function executeBrowserRecipe(manifest, recipe, input, auth, options) {
  return Promise.reject(new Error(DOM_ACTION_TRANSPORT_DISABLED_MESSAGE));
}

export { isSafeNamedProfile, PreservedBrowserArtifactsError, parseBrowserCleanupResourceIdentity, browserCleanupResourceExtends, browserCleanupResourceRootStatus, browserCleanupBarrier, runCommand, browserResultData, createBrowserSession, executeBrowserRecipe };
