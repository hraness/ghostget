// @bun
import {
  automationDigest,
  automationRecord,
  automationText
} from "./index-2ymnp8xv.js";
import {
  assertSafeStatePath,
  captureProcessOwnerIdentity,
  ensurePrivateStateDirectory,
  ghostgetStateHome,
  processOwnerStatus
} from "./index-yq6maz71.js";
import {
  startProviderPluginCleanupTrackedOperation
} from "./index-n4szk3nw.js";
import {
  canonicalJson
} from "./index-gwk7rbyj.js";
import"./index-z1w83f81.js";

// src/providers/whatsapp-automation-runtime.ts
import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "crypto";
import { constants } from "fs";
import { chmod as chmod2, link, lstat as lstat2, mkdtemp as mkdtemp2, open as open2, realpath as realpath2, rmdir as rmdir2, unlink as unlink2 } from "fs/promises";
import { createConnection } from "net";
import { tmpdir as tmpdir2 } from "os";
import { dirname as dirname3, isAbsolute as isAbsolute3, join as join3 } from "path";

// src/provider-plugin-cleanup-resource.ts
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmdirSync
} from "fs";
import { tmpdir } from "os";
import { basename, dirname, isAbsolute, join, resolve } from "path";
import { types as nodeTypes } from "util";
var decimalPattern = /^(?:0|[1-9][0-9]{0,39})$/u;
var privateRootNamePattern = /^wrench-[a-z0-9][a-z0-9._-]{0,126}$/u;
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
function recoverablePrivateRootStats(stats, currentUid) {
  return stats.isDirectory() && !stats.isSymbolicLink() && currentUid !== undefined && stats.uid === BigInt(currentUid) && (stats.mode & 0o777n) === 0o700n && stats.birthtimeNs > 0n;
}
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)) {
    throw new Error(`${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") {
      throw new Error(`${label} has unsupported symbol fields`);
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor) || !hasWellFormedUnicode(key) || /[\u0000-\u001f\u007f-\u009f]/u.test(key)) {
      throw new Error(`${label} has unsupported accessor fields`);
    }
    result[key] = descriptor.value;
  }
  return result;
}
function exactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(`${label} has unsupported fields`);
  }
}
function decimal(value, label) {
  if (typeof value !== "string" || !decimalPattern.test(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function pid(value, label) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function digest(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}
function parseProcessOwner(value) {
  const owner = record(value, "local CLI cleanup process owner");
  exactKeys(owner, ["pid", "bootId", "processStartId"], [], "local CLI cleanup process owner");
  return Object.freeze({
    pid: pid(owner.pid, "local CLI cleanup process owner PID"),
    bootId: digest(owner.bootId, "local CLI cleanup process boot identity"),
    processStartId: digest(owner.processStartId, "local CLI cleanup process start identity")
  });
}
function temporaryRootPath(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 || !isAbsolute(value) || resolve(value) !== value || dirname(value) !== realpathSync(tmpdir()) || !privateRootNamePattern.test(basename(value))) {
    throw new Error("local CLI cleanup private root path is malformed");
  }
  return value;
}
function parsePrivateRoot(value) {
  const root = record(value, "local CLI cleanup private root");
  exactKeys(root, ["path", "device", "inode", "birthtimeNs", "mode", "uid"], [], "local CLI cleanup private root");
  const mode = decimal(root.mode, "local CLI cleanup private root mode");
  if (mode !== "448") {
    throw new Error("local CLI cleanup private root must have mode 0700");
  }
  const birthtimeNs = decimal(root.birthtimeNs, "local CLI cleanup private root birth time");
  if (birthtimeNs === "0") {
    throw new Error("local CLI cleanup private root birth time is malformed");
  }
  return Object.freeze({
    path: temporaryRootPath(root.path),
    device: decimal(root.device, "local CLI cleanup private root device"),
    inode: decimal(root.inode, "local CLI cleanup private root inode"),
    birthtimeNs,
    mode: "448",
    uid: decimal(root.uid, "local CLI cleanup private root owner")
  });
}
function parseProcessGroup(value) {
  const group = record(value, "local CLI cleanup process group");
  exactKeys(group, ["kind", "platform", "processGroupId", "leader"], [], "local CLI cleanup process group");
  if (group.kind !== "posix-process-group-v1" || group.platform !== "darwin" && group.platform !== "linux") {
    throw new Error("local CLI cleanup process group is malformed");
  }
  const processGroupId = pid(group.processGroupId, "local CLI cleanup process group ID");
  const leader = parseProcessOwner(group.leader);
  if (leader.pid !== processGroupId) {
    throw new Error("local CLI cleanup process group does not match its leader");
  }
  return Object.freeze({
    kind: "posix-process-group-v1",
    platform: group.platform,
    processGroupId,
    leader
  });
}
function parseLocalCliCleanupResourceIdentityV1(value) {
  const resource = record(value, "local CLI cleanup resource identity");
  exactKeys(resource, ["kind", "root"], ["processGroups"], "local CLI cleanup resource identity");
  if (resource.kind !== "local-cli-private-root-v1") {
    throw new Error("local CLI cleanup resource identity kind is unsupported");
  }
  const root = parsePrivateRoot(resource.root);
  let processGroups;
  if (resource.processGroups !== undefined) {
    const rawGroups = resource.processGroups;
    if (!Array.isArray(rawGroups) || nodeTypes.isProxy(rawGroups) || Object.getPrototypeOf(rawGroups) !== Array.prototype || rawGroups.length < 1 || rawGroups.length > 64) {
      throw new Error("local CLI cleanup process group history is malformed");
    }
    const descriptors = Object.getOwnPropertyDescriptors(rawGroups);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string") || Object.keys(descriptors).length !== rawGroups.length + 1 || !Object.entries(descriptors).every(([key, descriptor]) => key === "length" ? !descriptor.enumerable && "value" in descriptor && descriptor.value === rawGroups.length : descriptor.enumerable && ("value" in descriptor))) {
      throw new Error("local CLI cleanup process group history is malformed");
    }
    processGroups = Object.freeze(Array.from({ length: rawGroups.length }, (_unused, index) => {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new Error("local CLI cleanup process group history is sparse");
      }
      return parseProcessGroup(descriptor.value);
    }));
  }
  return Object.freeze({
    kind: "local-cli-private-root-v1",
    root,
    ...processGroups === undefined ? {} : { processGroups }
  });
}
function captureLocalCliCleanupResource(path) {
  const canonical = realpathSync(path);
  const checkedPath = temporaryRootPath(canonical);
  const stats = lstatSync(checkedPath, { bigint: true });
  const currentUid = process.getuid?.();
  if (!recoverablePrivateRootStats(stats, currentUid)) {
    throw new Error("local CLI cleanup resource must be one owned mode-0700 temporary directory");
  }
  return parseLocalCliCleanupResourceIdentityV1({
    kind: "local-cli-private-root-v1",
    root: {
      path: checkedPath,
      device: stats.dev.toString(),
      inode: stats.ino.toString(),
      birthtimeNs: stats.birthtimeNs.toString(),
      mode: "448",
      uid: stats.uid.toString()
    }
  });
}
function processGroupIsPresent(processGroupId) {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return null;
    }
    if (error.code === "ESRCH")
      return false;
    if (error.code === "EPERM")
      return true;
    return null;
  }
}
function attachLocalCliCleanupProcessGroup(value, childPid) {
  const resource = parseLocalCliCleanupResourceIdentityV1(value);
  if ((resource.processGroups?.length ?? 0) >= 64) {
    throw new Error("local CLI cleanup process group history exceeded its bound");
  }
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error("local CLI cleanup process groups require a POSIX runtime");
  }
  const leader = captureProcessOwnerIdentity(childPid);
  if (processGroupIsPresent(childPid) !== true) {
    throw new Error("local CLI cleanup child does not own a live process group");
  }
  return parseLocalCliCleanupResourceIdentityV1({
    ...resource,
    processGroups: [
      ...resource.processGroups ?? [],
      {
        kind: "posix-process-group-v1",
        platform: process.platform,
        processGroupId: childPid,
        leader
      }
    ]
  });
}
function localCliCleanupProcessGroupStatus(resource, inspectOwner = processOwnerStatus) {
  const checked = parseLocalCliCleanupResourceIdentityV1(resource);
  const groups = checked.processGroups;
  if (groups === undefined) {
    return "unknown";
  }
  let unknown = false;
  for (const group of groups) {
    if (group.platform !== process.platform)
      return "unknown";
    const leader = inspectOwner(group.leader);
    if (leader === "exact-live-owner")
      return "active";
    if (leader === "unknown") {
      unknown = true;
      continue;
    }
    const present = processGroupIsPresent(group.processGroupId);
    if (present === true)
      return "active";
    if (present === null)
      unknown = true;
  }
  return unknown ? "unknown" : "quiescent";
}

// src/providers/whatsapp-web-runtime.ts
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readdir,
  realpath,
  rmdir,
  unlink
} from "fs/promises";
import { dirname as dirname2, isAbsolute as isAbsolute2, join as join2, resolve as resolve2 } from "path";
import { BoundedByteBuffer } from "@hraness/kb/clip/bounded-byte-buffer";
var MAX_STDERR_BYTES = 64 * 1024;
var MAX_STORE_ENTRIES = 1e4;
var MAX_CONTACT_PROJECTION_STDERR_BYTES = 16 * 1024;
var MESSAGE_EXPORT_SESSION_MAX_TOTAL_STDOUT_BYTES = 512 * 1024 * 1024;
var MESSAGE_EXPORT_SESSION_MAX_FRAMES = 1001;
var MESSAGE_EXPORT_SESSION_SPOOL_CHUNK_BYTES = 64 * 1024;
function ownedByCurrentUser(stats) {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  return uid === null || stats.uid === uid;
}
function assertPrivateOwned(stats, label, kind) {
  const matchesKind = kind === "directory" ? stats.isDirectory() : kind === "file" ? stats.isFile() : stats.isSocket();
  if (!matchesKind || !ownedByCurrentUser(stats)) {
    throw new Error(`${label} must be an owned ${kind}`);
  }
  if ((stats.mode & 63) !== 0) {
    throw new Error(`${label} must not grant group or world access`);
  }
}
async function validateWhatsAppStoreDirectory(pathValue, purpose) {
  if (!isAbsolute2(pathValue)) {
    throw new Error("WhatsApp linked-device store path must be absolute");
  }
  const lexical = resolve2(pathValue);
  let directoryStats;
  try {
    directoryStats = await lstat(lexical);
  } catch (error) {
    if (purpose === "pair" && typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      await mkdir(lexical, { recursive: true, mode: 448 });
      await chmod(lexical, 448);
      directoryStats = await lstat(lexical);
    } else {
      throw new Error("WhatsApp linked-device store is unavailable");
    }
  }
  if (directoryStats.isSymbolicLink()) {
    throw new Error("WhatsApp linked-device store must not be a symbolic link");
  }
  assertPrivateOwned(directoryStats, "WhatsApp linked-device store", "directory");
  const canonical = await realpath(lexical);
  if (canonical !== lexical) {
    throw new Error("WhatsApp linked-device store path must be canonical");
  }
  const entries = await readdir(canonical, { withFileTypes: true });
  if (entries.length > MAX_STORE_ENTRIES) {
    throw new Error("WhatsApp linked-device store has too many entries");
  }
  for (const entry of entries) {
    if (entry.name.length < 1 || entry.name.length > 255 || entry.name.includes("\x00") || entry.isSymbolicLink())
      throw new Error("WhatsApp linked-device store contains an unsafe entry");
    const entryPath = join2(canonical, entry.name);
    const stats = await lstat(entryPath);
    if (stats.isSymbolicLink()) {
      throw new Error("WhatsApp linked-device store contains a symbolic link");
    }
    if (stats.isDirectory()) {
      assertPrivateOwned(stats, "WhatsApp linked-device store entry", "directory");
    } else if (stats.isFile()) {
      assertPrivateOwned(stats, "WhatsApp linked-device store entry", "file");
    } else if (stats.isSocket()) {
      assertPrivateOwned(stats, "WhatsApp linked-device store entry", "socket");
    } else {
      throw new Error("WhatsApp linked-device store contains an unsupported entry");
    }
  }
  const requireRegular = async (name) => {
    let stats;
    try {
      stats = await lstat(join2(canonical, name));
    } catch {
      throw new Error(`WhatsApp linked-device store omitted ${name}`);
    }
    assertPrivateOwned(stats, `WhatsApp ${name}`, "file");
  };
  if (purpose === "sync" || purpose === "projection" || purpose === "contact-projection") {
    await requireRegular("session.db");
  }
  if (purpose === "projection") {
    await requireRegular("wacli.db");
  }
  return canonical;
}
class CanonicalSessionFrameDecoder {
  #maximumFrameBytes;
  #onFrame;
  #chunks = [];
  #pendingBytes = 0;
  #frameCount = 0;
  constructor(maximumFrameBytes, onFrame) {
    this.#maximumFrameBytes = maximumFrameBytes;
    this.#onFrame = onFrame;
  }
  get frameCount() {
    return this.#frameCount;
  }
  #append(bytes) {
    if (bytes.byteLength === 0)
      return;
    this.#pendingBytes += bytes.byteLength;
    if (this.#pendingBytes + 1 > this.#maximumFrameBytes) {
      throw new Error("WhatsApp projection session frame exceeded its bound");
    }
    this.#chunks.push(Buffer.from(bytes));
  }
  #finishLine() {
    if (this.#pendingBytes < 2 || this.#pendingBytes + 1 > this.#maximumFrameBytes || this.#frameCount >= MESSAGE_EXPORT_SESSION_MAX_FRAMES)
      throw new Error("WhatsApp projection session frame exceeded its bound");
    const bytes = this.#chunks.length === 1 ? this.#chunks[0] : Buffer.concat(this.#chunks, this.#pendingBytes);
    this.#chunks = [];
    this.#pendingBytes = 0;
    let line;
    try {
      line = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error("WhatsApp projection session frame was malformed");
    }
    if (line.includes("\r")) {
      throw new Error("WhatsApp projection session frame exceeded its bound");
    }
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error("WhatsApp projection session frame was malformed");
    }
    const canonical = canonicalJson(value);
    if (canonical !== line || !Buffer.from(canonical, "utf8").equals(bytes)) {
      throw new Error("WhatsApp projection session frame was not canonical");
    }
    this.#frameCount += 1;
    this.#onFrame(Object.freeze({
      index: this.#frameCount,
      canonical,
      value
    }));
  }
  push(bytes) {
    let start = 0;
    for (let index = 0;index < bytes.byteLength; index += 1) {
      if (bytes[index] !== 10)
        continue;
      this.#append(bytes.subarray(start, index));
      this.#finishLine();
      start = index + 1;
    }
    this.#append(bytes.subarray(start));
  }
  finish() {
    if (this.#pendingBytes !== 0 || this.#chunks.length !== 0) {
      throw new Error("WhatsApp projection session ended inside a frame");
    }
  }
}

// src/providers/whatsapp-automation-runtime.ts
var WHATSAPP_AUTOMATION_PROTOCOL = "ghostget.whatsapp-private/1";
var WHATSAPP_AUTOMATION_VERSION = "0.15.0+ghostget-private.1";
var WHATSAPP_AUTOMATION_BINARY_SHA256 = "9b77ffb810d028fde725ca02b1451f1725b5ff5312a46a54468a9a38533d4cea";
var directJid = /^(?:[1-9][0-9]{4,14}@s\.whatsapp\.net|[1-9][0-9]{4,19}@lid)$/u;
var sha = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
function linked(auth) {
  if (auth.kind !== "linked-device-store" || auth.provider !== "whatsapp" || !auth.subject)
    throw new Error("A bound WhatsApp linked-device account is required");
  return auth;
}
function accountSubject(jid) {
  if (!directJid.test(jid))
    throw new Error("Unsupported WhatsApp account identity");
  return `whatsapp:${jid.endsWith("@lid") ? "lid" : "pn"}:${jid.split("@")[0]}`;
}
function accountJid(value) {
  const jid = automationText(value, 128);
  const normalized = jid.replace(/:[0-9]{1,5}(?=@(?:s\.whatsapp\.net|lid)$)/u, "");
  accountSubject(normalized);
  return normalized;
}
async function privateFile(path) {
  const info = await lstat2(path, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== BigInt(process.getuid()) || info.nlink !== 1n || (info.mode & 0o777n) !== 0o600n || info.size < 1n || info.size > 4294967296n || info.birthtimeNs <= 0n || await realpath2(path) !== path)
    throw new Error("Unsafe WhatsApp source file");
  return { dev: String(info.dev), ino: String(info.ino), birthtimeNs: String(info.birthtimeNs) };
}
async function binaryBytes(path) {
  const file = await open2(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > 128 * 1024 * 1024 || (before.mode & 18) !== 0 || (before.mode & 73) === 0 || ![0, process.getuid()].includes(before.uid))
      throw new Error("Unsafe WhatsApp automation executable");
    const bytes = await file.readFile(), after = await file.stat();
    if (bytes.length !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs)
      throw new Error("WhatsApp automation executable changed");
    return bytes;
  } finally {
    await file.close();
  }
}
async function binaryDigest(path) {
  return createHash("sha256").update(await binaryBytes(path)).digest("hex");
}
function whatsappAutomationBinaryPath(environment = process.env) {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("The reviewed WhatsApp automation build requires Apple silicon macOS");
  return join3(ghostgetStateHome(environment), "tools", "wacli-private", WHATSAPP_AUTOMATION_VERSION, "darwin-arm64", "wacli");
}
async function resolveWhatsAppAutomationBinary(environment = process.env) {
  const path = whatsappAutomationBinaryPath(environment);
  if (await realpath2(path) !== path || await binaryDigest(path) !== WHATSAPP_AUTOMATION_BINARY_SHA256)
    throw new Error("The reviewed one-attempt WhatsApp automation runtime is not installed");
  return path;
}
async function installReviewedWhatsAppAutomationBinary(source, environment = process.env) {
  if (!isAbsolute3(source))
    throw new Error("WhatsApp automation install source must be absolute");
  const bytes = await binaryBytes(source);
  if (createHash("sha256").update(bytes).digest("hex") !== WHATSAPP_AUTOMATION_BINARY_SHA256)
    throw new Error("WhatsApp automation install source does not match the reviewed build");
  const destination = whatsappAutomationBinaryPath(environment);
  ensurePrivateStateDirectory(dirname3(destination), environment);
  assertSafeStatePath(destination, environment, false);
  try {
    await lstat2(destination);
    if (await binaryDigest(destination) !== WHATSAPP_AUTOMATION_BINARY_SHA256)
      throw new Error("WhatsApp automation install destination contains different bytes");
    return { version: WHATSAPP_AUTOMATION_VERSION, sha256: WHATSAPP_AUTOMATION_BINARY_SHA256 };
  } catch (error) {
    if (error.code !== "ENOENT")
      throw error;
  }
  const temporary = join3(dirname3(destination), `.wacli-install-${randomBytes(16).toString("hex")}`);
  const file = await open2(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 320);
  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await link(temporary, destination);
    } catch (error) {
      if (error.code !== "EEXIST")
        throw error;
    }
  } finally {
    await unlink2(temporary);
  }
  const directory = await open2(dirname3(destination), constants.O_RDONLY);
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  await resolveWhatsAppAutomationBinary(environment);
  return { version: WHATSAPP_AUTOMATION_VERSION, sha256: WHATSAPP_AUTOMATION_BINARY_SHA256 };
}
function parseWhatsAppPrivateResponse(value) {
  const row = automationRecord(value, ["protocol", "requestId", "generation", "account", "state", "to", "messageId", "connected"]);
  if (row.protocol !== WHATSAPP_AUTOMATION_PROTOCOL || !["ready", "accepted", "not-started", "indeterminate"].includes(String(row.state)) || typeof row.connected !== "boolean")
    throw new Error("Unsupported WhatsApp transport response");
  for (const field of ["requestId", "to", "messageId"])
    if (typeof row[field] !== "string" || Buffer.byteLength(row[field]) > 256 || /[\u0000-\u001f\u007f]/u.test(row[field]))
      throw new Error("Invalid WhatsApp receipt field");
  const generation = automationDigest(row.generation), account = automationText(row.account, 128);
  if (!directJid.test(account) || row.requestId !== "" && !/^[a-f0-9]{64}$/u.test(row.requestId) || row.to !== "" && !directJid.test(row.to) || row.state === "accepted" && (row.messageId === "" || row.requestId === "" || row.to === ""))
    throw new Error("Invalid WhatsApp receipt identity");
  return { protocol: WHATSAPP_AUTOMATION_PROTOCOL, requestId: row.requestId, generation, account, state: row.state, to: row.to, messageId: row.messageId, connected: row.connected };
}
var blankStatus = () => ({ protocol: WHATSAPP_AUTOMATION_PROTOCOL, kind: "status", requestId: "", generation: "", account: "", to: "", message: "", file: "", filename: "", mime: "", id: "", reaction: "", question: "", options: [], selectable: 0 });
async function socketRequest(path, identity, request, signal, beforeWrite) {
  signal?.throwIfAborted();
  const info = await lstat2(path);
  if (!info.isSocket() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 511) !== 384 || info.dev !== identity.dev || info.ino !== identity.ino)
    throw new Error("WhatsApp transport ownership changed");
  return new Promise((resolve3, reject) => {
    const socket = createConnection({ path });
    let bytes = Buffer.alloc(0), settled = false;
    const finish = (error, response) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      socket.destroy();
      error ? reject(error) : resolve3(response);
    };
    const abort = () => finish(new Error("WhatsApp transport request was interrupted"));
    const timer = setTimeout(() => finish(new Error("WhatsApp transport response deadline exceeded")), 55000);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    socket.on("error", () => finish(new Error("WhatsApp transport connection failed")));
    socket.on("close", () => {
      if (!settled)
        finish(new Error("WhatsApp transport closed without a receipt"));
    });
    socket.on("connect", () => {
      (async () => {
        await beforeWrite?.();
        signal?.throwIfAborted();
        if (settled)
          return;
        const current = await lstat2(path);
        if (!current.isSocket() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino || current.uid !== process.getuid() || (current.mode & 511) !== 384)
          throw new Error("WhatsApp socket changed after connection");
        signal?.throwIfAborted();
        if (settled)
          return;
        const payload = Buffer.from(JSON.stringify(request) + `
`);
        if (payload.length > 1048576)
          finish(new Error("WhatsApp request exceeds its byte bound"));
        else
          socket.write(payload);
      })().catch(() => finish(new Error("WhatsApp request admission changed before writing")));
    });
    socket.on("data", (chunk) => {
      if (!Buffer.isBuffer(chunk)) {
        finish(new Error("WhatsApp response was not bytes"));
        return;
      }
      if (bytes.length + chunk.length > 4096) {
        finish(new Error("WhatsApp response exceeds its byte bound"));
        return;
      }
      bytes = Buffer.concat([bytes, chunk]);
      const newline = bytes.indexOf(10);
      if (newline < 0)
        return;
      try {
        if (newline !== bytes.length - 1)
          throw new Error("Trailing WhatsApp response data");
        const response = parseWhatsAppPrivateResponse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, newline))));
        if (request.kind === "status" ? response.state !== "ready" || response.requestId !== "" || response.to !== "" || response.messageId !== "" : response.requestId !== request.requestId || response.to !== request.to || response.account !== request.account || response.generation !== request.generation || response.state === "ready")
          throw new Error("WhatsApp response did not bind its request");
        finish(undefined, response);
      } catch {
        finish(new Error("WhatsApp transport returned a malformed receipt"));
      }
    });
  });
}
var sleep = (milliseconds) => new Promise((resolve3) => setTimeout(resolve3, milliseconds));
function createWhatsAppAutomationRuntime(execution) {
  let child;
  let resource, cleanup;
  let socket;
  let authHash, root, closed = false, closing;
  const staged = new Set;
  const runtime = {
    async read(auth, work, signal) {
      signal?.throwIfAborted();
      if (closed)
        throw new Error("WhatsApp automation runtime is closed");
      const selected = linked(auth), store = await validateWhatsAppStoreDirectory(selected.path, "projection");
      const messagesPath = join3(store, "wacli.db"), sessionPath = join3(store, "session.db");
      const before = [await privateFile(messagesPath), await privateFile(sessionPath)];
      const session = new Database(sessionPath, { readonly: true, strict: true });
      let account;
      try {
        const devices = session.query("SELECT jid FROM whatsmeow_device LIMIT 2").all();
        if (devices.length !== 1)
          throw new Error("WhatsApp session must select exactly one account");
        account = accountJid(automationRecord(devices[0], ["jid"]).jid);
      } finally {
        session.close();
      }
      const subject = accountSubject(account);
      if (selected.subject !== subject)
        throw new Error("WhatsApp linked-device account changed");
      let connected = false, generation = null;
      if (socket && child && child.exitCode === null && authHash === sha(auth)) {
        const status = await runtime.request(blankStatus(), signal);
        if (status.account !== account)
          throw new Error("WhatsApp connection account changed");
        connected = status.connected;
        generation = status.generation;
      }
      const database = new Database(messagesPath, { readonly: true, strict: true });
      try {
        database.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN");
        const available = database.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ghostget_automation_state'").get();
        let ledger = null;
        if (available) {
          const state = automationRecord(database.query("SELECT version,generation FROM ghostget_automation_state WHERE singleton=1").get(), ["version", "generation"]);
          if (state.version !== 1)
            throw new Error("Unsupported WhatsApp event schema");
          ledger = automationDigest(state.generation);
        }
        const snapshot = { account, subject, sourceGeneration: sha({ files: before, ledger }), ledgerReady: ledger !== null, connected, generation };
        const result = work(database, snapshot);
        database.exec("COMMIT");
        if (sha(before) !== sha([await privateFile(messagesPath), await privateFile(sessionPath)]))
          throw new Error("WhatsApp database generation changed during the read");
        signal?.throwIfAborted();
        return result;
      } finally {
        database.close();
      }
    },
    async start(auth, beforeSpawn, signal) {
      if (closed || child || root)
        throw new Error("WhatsApp automation has already been started or closed");
      if (!execution.registerCleanupBarrier)
        throw new Error("WhatsApp automation requires durable process custody");
      const selected = linked(auth), store = await validateWhatsAppStoreDirectory(selected.path, "projection");
      await runtime.read(auth, () => {
        return;
      }, signal);
      const binary = await resolveWhatsAppAutomationBinary(execution.environment);
      await startProviderPluginCleanupTrackedOperation(execution.registerCleanupBarrier, async (publish, controller) => {
        cleanup = controller;
        try {
          root = await mkdtemp2(join3(await realpath2(tmpdir2()), "wrench-whatsapp-automation-"));
          await chmod2(root, 448);
          resource = captureLocalCliCleanupResource(root);
          publish?.(resource);
          const socketPath = join3(root, ".s");
          if (Buffer.byteLength(socketPath) > 100)
            throw new Error("WhatsApp private runtime directory exceeds the Unix socket path bound");
          await beforeSpawn();
          signal?.throwIfAborted();
          if (await binaryDigest(binary) !== WHATSAPP_AUTOMATION_BINARY_SHA256)
            throw new Error("WhatsApp automation binary changed before launch");
          child = Bun.spawn([binary, "--store", store, "--json", "--full", "sync", "--follow", "--presence-mode", "quiet", "--max-reconnect", "1m", "--max-messages", "200000", "--max-db-size", "2GB", "--ghostget-private-transport", "--ghostget-private-socket", socketPath], { stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true, env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });
          resource = attachLocalCliCleanupProcessGroup(resource, child.pid);
          publish?.(resource);
          authHash = sha(auth);
          const until = Date.now() + 30000;
          while (Date.now() < until) {
            signal?.throwIfAborted();
            if (child.exitCode !== null)
              throw new Error("WhatsApp connection exited during startup");
            try {
              const info = await lstat2(socketPath);
              if (!info.isSocket() || info.uid !== process.getuid() || (info.mode & 511) !== 384)
                throw new Error("Unsafe WhatsApp private socket");
              socket = { path: socketPath, dev: info.dev, ino: info.ino };
              const status = await runtime.request(blankStatus(), signal);
              if (status.connected && accountSubject(status.account) === selected.subject)
                return;
              throw new Error("WhatsApp connection did not match the selected account");
            } catch (error) {
              if (error.code !== "ENOENT")
                throw error;
            }
            await sleep(50);
          }
          throw new Error("WhatsApp connection did not become ready within its deadline");
        } catch (error) {
          await runtime.close();
          throw error;
        }
      });
    },
    async request(request, signal, beforeWrite) {
      if (closed || !socket || !child || child.exitCode !== null)
        throw new Error("The owned WhatsApp connection is unavailable");
      return socketRequest(socket.path, socket, request, signal, beforeWrite);
    },
    async stage(bytes, digest2) {
      const snapshot = Buffer.from(bytes);
      if (closed || !root || !child || child.exitCode !== null || snapshot.byteLength < 1 || snapshot.byteLength > 20 * 1024 * 1024 || createHash("sha256").update(snapshot).digest("hex") !== automationDigest(digest2))
        throw new Error("WhatsApp asset is unavailable or changed");
      const path = join3(root, `asset-${randomBytes(16).toString("hex")}`), file = await open2(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 384);
      try {
        await file.writeFile(snapshot);
        await file.sync();
      } finally {
        await file.close();
      }
      const identity = await lstat2(path);
      staged.add(path);
      return { path, async close() {
        if (!staged.has(path))
          return;
        const current = await lstat2(path);
        if (current.dev !== identity.dev || current.ino !== identity.ino || !current.isFile() || current.nlink !== 1)
          throw new Error("WhatsApp staged asset changed");
        await unlink2(path);
        staged.delete(path);
      } };
    },
    close() {
      if (closing)
        return closing;
      closed = true;
      closing = (async () => {
        try {
          if (child) {
            if (child.exitCode === null) {
              try {
                process.kill(-child.pid, "SIGTERM");
              } catch {
                child.kill("SIGTERM");
              }
            }
            const until = Date.now() + 55000;
            while (child.exitCode === null && Date.now() < until)
              await sleep(20);
            if (child.exitCode === null) {
              try {
                process.kill(-child.pid, "SIGKILL");
              } catch {
                child.kill("SIGKILL");
              }
            }
            const reapUntil = Date.now() + 5000;
            while (child.exitCode === null && Date.now() < reapUntil)
              await sleep(20);
            if (child.exitCode === null)
              throw new Error("WhatsApp process did not join");
            await child.exited;
            if (!resource || localCliCleanupProcessGroupStatus(resource) !== "quiescent")
              throw new Error("WhatsApp process group cleanup is unverified");
          }
          if (socket) {
            try {
              const current = await lstat2(socket.path);
              if (!current.isSocket() || current.dev !== socket.dev || current.ino !== socket.ino || current.uid !== process.getuid())
                throw new Error("WhatsApp private socket changed before cleanup");
              await unlink2(socket.path);
            } catch (error) {
              if (error.code !== "ENOENT")
                throw error;
            }
          }
          if (staged.size > 0)
            throw new Error("WhatsApp assets are still in use");
          if (root)
            await rmdir2(root);
          cleanup?.verified();
        } catch (error) {
          cleanup?.unsafe(error);
          throw error;
        }
      })();
      return closing;
    }
  };
  return runtime;
}
export {
  whatsappAutomationBinaryPath,
  resolveWhatsAppAutomationBinary,
  parseWhatsAppPrivateResponse,
  installReviewedWhatsAppAutomationBinary,
  createWhatsAppAutomationRuntime,
  WHATSAPP_AUTOMATION_VERSION,
  WHATSAPP_AUTOMATION_PROTOCOL,
  WHATSAPP_AUTOMATION_BINARY_SHA256
};
