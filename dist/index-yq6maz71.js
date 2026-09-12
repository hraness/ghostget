// @bun
// src/storage.ts
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  opendirSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "fs";
import { spawnSync } from "child_process";
import { homedir, tmpdir } from "os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";

// src/process-identity.ts
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { dlopen, ptr } from "bun:ffi";
var cachedBootId = null;
var cachedCurrentProcessStartIdentity = null;
var cachedDarwinProcPidInfo;
var DARWIN_PROCESS_STATE_PATTERN = /^[DIRSTUZ][+<>AELNSsVWX]*$/u;
var DARWIN_PROC_PID_T_BSDINFO_WITH_UNIQID = 18;
var DARWIN_PROC_BSDINFO_SIZE = 136;
var DARWIN_PROC_UNIQIDENTIFIERINFO_SIZE = 56;
var DARWIN_PROC_BSDINFO_WITH_UNIQID_SIZE = DARWIN_PROC_BSDINFO_SIZE + DARWIN_PROC_UNIQIDENTIFIERINFO_SIZE;
var DARWIN_PROC_BSDINFO_FLAGS_OFFSET = 0;
var DARWIN_PROC_BSDINFO_STATUS_OFFSET = 4;
var DARWIN_PROC_BSDINFO_PID_OFFSET = 12;
var DARWIN_PROC_BSDINFO_START_SECONDS_OFFSET = 120;
var DARWIN_PROC_BSDINFO_START_MICROSECONDS_OFFSET = 128;
var DARWIN_PROC_UNIQUE_ID_OFFSET = 16;
var DARWIN_PROC_ID_VERSION_OFFSET = 32;
var DARWIN_PROC_FLAG_INEXIT = 4;
var DARWIN_PROCESS_STATUS_IDLE = 1;
var DARWIN_PROCESS_STATUS_RUNNING = 2;
var DARWIN_PROCESS_STATUS_SLEEPING = 3;
var DARWIN_PROCESS_STATUS_STOPPED = 4;
var DARWIN_PROCESS_STATUS_ZOMBIE = 5;
var DARWIN_PROCESS_INSPECTION_ATTEMPTS = 3;
var UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
function identityDigest(kind, value) {
  return createHash("sha256").update(kind, "utf8").update("\x00", "utf8").update(value, "utf8").digest("hex");
}
function commandText(command, arguments_) {
  const environment = process.platform === "win32" ? {
    NODE_ENV: "production",
    SystemRoot: "C:\\Windows",
    WINDIR: "C:\\Windows",
    PATH: "C:\\Windows\\System32"
  } : { LANG: "C", LC_ALL: "C", NODE_ENV: "production", TZ: "UTC" };
  return execFileSync(command, arguments_, {
    encoding: "utf8",
    env: environment,
    timeout: 2000,
    windowsHide: true
  }).trim();
}
function windowsPowerShellPath() {
  return "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
}
function normalizeDarwinBootSessionUuid(raw) {
  const value = raw.trim();
  if (!UUID_PATTERN.test(value)) {
    throw new Error("system boot identity is malformed");
  }
  return value.toLowerCase();
}
function darwinBootId(raw) {
  return identityDigest("io-boot", normalizeDarwinBootSessionUuid(raw));
}
function currentBootId() {
  if (cachedBootId !== null)
    return cachedBootId;
  let raw;
  if (process.platform === "linux") {
    raw = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    if (!/^[a-f0-9-]{36}$/iu.test(raw)) {
      throw new Error("system boot identity is malformed");
    }
  } else if (process.platform === "darwin") {
    cachedBootId = darwinBootId(commandText("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"]));
    return cachedBootId;
  } else if (process.platform === "win32") {
    raw = commandText(windowsPowerShellPath(), [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().Ticks"
    ]);
    if (!/^\d{10,30}$/u.test(raw)) {
      throw new Error("system boot identity is malformed");
    }
  } else {
    throw new Error(`system boot identity is unsupported on ${process.platform}`);
  }
  cachedBootId = identityDigest("io-boot", raw);
  return cachedBootId;
}
function processIsDefinitelyMissing(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH";
  }
}
function inspectLinuxProcessRecord(raw) {
  const close = raw.lastIndexOf(")");
  if (close < 1)
    return { status: "unknown" };
  const fields = raw.slice(close + 1).trim().split(/\s+/u);
  const state = fields[0];
  if (state === "Z" || state === "X" || state === "x") {
    return { status: "dead" };
  }
  if (state !== "R" && state !== "S" && state !== "D" && state !== "T" && state !== "t" && state !== "W" && state !== "K" && state !== "P" && state !== "I") {
    return { status: "unknown" };
  }
  const startTicks = fields[19];
  if (startTicks === undefined || !/^\d+$/u.test(startTicks)) {
    return { status: "unknown" };
  }
  return { status: "alive", rawStartId: startTicks };
}
function inspectDarwinProcessInfo(raw, expectedPid) {
  if (raw.byteLength < DARWIN_PROC_BSDINFO_SIZE) {
    return { status: "unknown" };
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const flags = view.getUint32(DARWIN_PROC_BSDINFO_FLAGS_OFFSET, true);
  const status = view.getUint32(DARWIN_PROC_BSDINFO_STATUS_OFFSET, true);
  const pid = view.getUint32(DARWIN_PROC_BSDINFO_PID_OFFSET, true);
  if (pid !== expectedPid)
    return { status: "unknown" };
  if (status === DARWIN_PROCESS_STATUS_ZOMBIE || (flags & DARWIN_PROC_FLAG_INEXIT) !== 0) {
    return { status: "dead" };
  }
  if (status !== DARWIN_PROCESS_STATUS_IDLE && status !== DARWIN_PROCESS_STATUS_RUNNING && status !== DARWIN_PROCESS_STATUS_SLEEPING && status !== DARWIN_PROCESS_STATUS_STOPPED) {
    return { status: "unknown" };
  }
  const seconds = view.getBigUint64(DARWIN_PROC_BSDINFO_START_SECONDS_OFFSET, true);
  const microseconds = view.getBigUint64(DARWIN_PROC_BSDINFO_START_MICROSECONDS_OFFSET, true);
  if (seconds === 0n || microseconds >= 1000000n) {
    return { status: "unknown" };
  }
  return {
    status: "alive",
    rawStartId: `${seconds}:${microseconds}`
  };
}
function darwinUniqueProcessIdentity(raw) {
  if (raw.byteLength < DARWIN_PROC_UNIQIDENTIFIERINFO_SIZE)
    return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const uniqueId = view.getBigUint64(DARWIN_PROC_UNIQUE_ID_OFFSET, true);
  const idVersion = view.getUint32(DARWIN_PROC_ID_VERSION_OFFSET, true);
  if (uniqueId === 0n || idVersion === 0)
    return null;
  return `${uniqueId}:${idVersion}`;
}
function inspectDarwinProcessIdentity(raw, expectedPid) {
  if (raw.byteLength < DARWIN_PROC_BSDINFO_WITH_UNIQID_SIZE) {
    return { status: "unknown" };
  }
  const bsdInfo = raw.subarray(0, DARWIN_PROC_BSDINFO_SIZE);
  const uniqueInfo = raw.subarray(DARWIN_PROC_BSDINFO_SIZE, DARWIN_PROC_BSDINFO_WITH_UNIQID_SIZE);
  const record = inspectDarwinProcessInfo(bsdInfo, expectedPid);
  if (record.status !== "alive")
    return record;
  const uniqueIdentity = darwinUniqueProcessIdentity(uniqueInfo);
  if (uniqueIdentity === null)
    return { status: "unknown" };
  return {
    status: "alive",
    rawStartId: `${uniqueIdentity}:${record.rawStartId}`
  };
}
function darwinProcPidInfo() {
  if (cachedDarwinProcPidInfo !== undefined)
    return cachedDarwinProcPidInfo;
  try {
    const library = dlopen("/usr/lib/libproc.dylib", {
      proc_pidinfo: {
        args: ["int", "int", "u64", "ptr", "int"],
        returns: "int"
      }
    });
    cachedDarwinProcPidInfo = (pid, flavor, buffer) => library.symbols.proc_pidinfo(pid, flavor, 0, ptr(buffer), buffer.byteLength);
  } catch {
    return null;
  }
  return cachedDarwinProcPidInfo;
}
function darwinProcessIsDefinitelyDead(pid) {
  if (processIsDefinitelyMissing(pid))
    return true;
  try {
    const state = commandText("/bin/ps", [
      "-o",
      "state=",
      "-p",
      String(pid)
    ]);
    if (DARWIN_PROCESS_STATE_PATTERN.test(state) && state.startsWith("Z")) {
      return true;
    }
  } catch {}
  return processIsDefinitelyMissing(pid);
}
function inspectDarwinProcessWithReader(pid, readRecord, isDefinitelyDead) {
  for (let attempt = 0;attempt < DARWIN_PROCESS_INSPECTION_ATTEMPTS; attempt += 1) {
    let record = { status: "unknown" };
    try {
      const raw = readRecord(pid);
      if (raw !== null)
        record = inspectDarwinProcessIdentity(raw, pid);
    } catch {}
    if (record.status === "alive" || record.status === "dead") {
      return record;
    }
    if (isDefinitelyDead(pid))
      return { status: "dead" };
  }
  return { status: "unknown" };
}
function inspectDarwinProcess(pid) {
  return inspectDarwinProcessWithReader(pid, (targetPid) => {
    const inspect = darwinProcPidInfo();
    if (inspect === null)
      return null;
    const processInfo = Buffer.alloc(DARWIN_PROC_BSDINFO_WITH_UNIQID_SIZE);
    const bytesRead = inspect(targetPid, DARWIN_PROC_PID_T_BSDINFO_WITH_UNIQID, processInfo);
    if (!Number.isSafeInteger(bytesRead) || bytesRead < 0 || bytesRead > DARWIN_PROC_BSDINFO_WITH_UNIQID_SIZE) {
      return null;
    }
    return processInfo.subarray(0, bytesRead);
  }, darwinProcessIsDefinitelyDead);
}
function inspectProcessStartId(pid, bootId) {
  if (pid === process.pid && cachedCurrentProcessStartIdentity?.pid === pid && cachedCurrentProcessStartIdentity.bootId === bootId) {
    return {
      status: "alive",
      processStartId: cachedCurrentProcessStartIdentity.processStartId
    };
  }
  try {
    let raw;
    if (process.platform === "linux") {
      const record = inspectLinuxProcessRecord(readFileSync(`/proc/${pid}/stat`, "utf8").trim());
      if (record.status !== "alive")
        return record;
      raw = record.rawStartId;
    } else if (process.platform === "win32") {
      raw = commandText(windowsPowerShellPath(), [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$p=[int]$args[0]; (Get-Process -Id $p -ErrorAction Stop).StartTime.ToUniversalTime().Ticks",
        String(pid)
      ]);
      if (!/^\d{10,30}$/u.test(raw))
        return { status: "unknown" };
    } else if (process.platform === "darwin") {
      const record = inspectDarwinProcess(pid);
      if (record.status !== "alive")
        return record;
      raw = record.rawStartId;
    } else {
      return { status: "unknown" };
    }
    const processStartId = identityDigest("io-process-start", `${bootId}\x00${raw}`);
    if (pid === process.pid) {
      cachedCurrentProcessStartIdentity = { pid, bootId, processStartId };
    }
    return { status: "alive", processStartId };
  } catch (error) {
    if (processIsDefinitelyMissing(pid) || process.platform === "linux" && typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return { status: "missing" };
    }
    return { status: "unknown" };
  }
}
function captureProcessOwnerIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) {
    throw new Error("process identity PID is malformed");
  }
  const bootId = currentBootId();
  const inspection = inspectProcessStartId(pid, bootId);
  if (inspection.status !== "alive") {
    throw new Error("exact live process identity is unavailable");
  }
  return Object.freeze({
    pid,
    bootId,
    processStartId: inspection.processStartId
  });
}
function processOwnerStatus(owner) {
  const bootId = currentBootId();
  if (bootId !== owner.bootId)
    return "different-or-dead";
  const inspection = inspectProcessStartId(owner.pid, bootId);
  if (inspection.status !== "alive") {
    return inspection.status === "unknown" ? "unknown" : "different-or-dead";
  }
  return inspection.processStartId === owner.processStartId ? "exact-live-owner" : "different-or-dead";
}

// src/storage.ts
var MAX_WRENCH_JSON_BYTES = 1024 * 1024;
var MAX_PRIVATE_STATE_BATCH_FILES = 1000;
var MAX_PRIVATE_STATE_BATCH_FILE_BYTES = 2 * 1024 * 1024;
var MAX_PRIVATE_STATE_BATCH_TOTAL_BYTES = 64 * 1024 * 1024;
var DEFAULT_PRIVATE_STATE_EXPECTED_CONTENT_BYTES = 2 * 1024 * 1024;
var MAX_PRIVATE_STATE_EXPECTED_CONTENT_BYTES = 4 * 1024 * 1024;
var MAX_PRIVATE_STATE_BATCH_NAME_BYTES = 256 * 1024;
var MAX_PRIVATE_STATE_BATCH_STDOUT_BYTES = 96 * 1024 * 1024;
var TEST_STATE_HELPER_TIMEOUT_MS = 120000;
var knownStateRoots = new Map;
var stateDirectoryNames = [
  "adapter-generations",
  "adapters",
  "auth",
  "browser-snapshots",
  "captures",
  "control",
  "derivations",
  "idempotency",
  "linked-device-stores",
  "messaging",
  "omni-read-projections",
  "operation-permissions",
  "plan-assets",
  "plans",
  "provider-plugin-state",
  "provider-plugins",
  "read-projection-control",
  "read-projections",
  "recovery",
  "run-journals",
  "runs",
  "session-secrets",
  "tools"
];
var stateMarkerName = ".io-state.json";
var stateMarkerText = `{"kind":"io-state","schemaVersion":1}
`;
var stateHelperPath = join(dirname(fileURLToPath(import.meta.url)), "state-helper.ts");
var stateHelperConfigPath = join(dirname(fileURLToPath(import.meta.url)), "state-helper.bunfig.toml");
var pathHelperPath = join(dirname(fileURLToPath(import.meta.url)), "path-helper.ts");
var ghostgetSourcePackageRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
function isWithinPath(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}
function hasCode(error, code) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
function readDescriptorBounded(descriptor, maximumBytes) {
  const chunks = [];
  const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maximumBytes + 1));
  let total = 0;
  for (;; ) {
    const remaining = maximumBytes + 1 - total;
    const count = readSync(descriptor, buffer, 0, Math.min(buffer.byteLength, remaining), null);
    if (count === 0)
      return Buffer.concat(chunks, total);
    total += count;
    if (total > maximumBytes)
      throw new Error("file grew beyond its byte bound");
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
}
function pathInside(root, target) {
  const child = relative(root, target);
  return child === "" || !isAbsolute(child) && child !== ".." && !child.startsWith(`..${sep}`);
}
function sameIdentity(left, right) {
  return left === null || right === null ? left === right : left.device === right.device && left.inode === right.inode;
}
function exactObjectKeys(value, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isSafeBatchFileName(value) {
  if (typeof value !== "string" || value === "" || value === "." || value === ".." || value.includes("/") || value.includes("\\") || value.includes("\uFFFD") || Buffer.byteLength(value, "utf8") > 255)
    return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
      return false;
    }
  }
  return true;
}
function decodeCanonicalBase64(value, maximumBytes) {
  if (typeof value !== "string" || value.length > Math.ceil(maximumBytes / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value))
    return null;
  const decoded = Buffer.from(value, "base64");
  return decoded.byteLength <= maximumBytes && decoded.toString("base64") === value ? decoded : null;
}
function parseStateHelperBatchFiles(value) {
  if (!Array.isArray(value) || value.length > MAX_PRIVATE_STATE_BATCH_FILES) {
    throw new Error("state helper returned a malformed response");
  }
  const names = new Set;
  const files = [];
  let contentBytes = 0;
  const invalidReasons = new Set([
    "unsafe-file",
    "unreadable",
    "file-byte-bound",
    "aggregate-byte-bound",
    "changed-during-read"
  ]);
  for (const candidate of value) {
    if (!isRecord(candidate) || !isSafeBatchFileName(candidate.name)) {
      throw new Error("state helper returned a malformed response");
    }
    const name = candidate.name;
    if (names.has(name)) {
      throw new Error("state helper returned a malformed response");
    }
    names.add(name);
    if (candidate.status === "present" && exactObjectKeys(candidate, ["name", "status", "contentBase64"])) {
      const content = decodeCanonicalBase64(candidate.contentBase64, MAX_PRIVATE_STATE_BATCH_FILE_BYTES);
      if (content === null) {
        throw new Error("state helper returned a malformed response");
      }
      contentBytes += content.byteLength;
      if (contentBytes > MAX_PRIVATE_STATE_BATCH_TOTAL_BYTES) {
        throw new Error("state helper returned a malformed response");
      }
      files.push({
        name,
        status: "present",
        contentBase64: candidate.contentBase64
      });
      continue;
    }
    if (candidate.status === "absent" && exactObjectKeys(candidate, ["name", "status"])) {
      files.push({ name, status: "absent" });
      continue;
    }
    if (candidate.status === "invalid" && exactObjectKeys(candidate, ["name", "status", "reason"]) && invalidReasons.has(candidate.reason)) {
      files.push({
        name,
        status: "invalid",
        reason: candidate.reason
      });
      continue;
    }
    throw new Error("state helper returned a malformed response");
  }
  return files;
}
function parseStateHelperBatchChildFiles(value) {
  if (!Array.isArray(value) || value.length > MAX_PRIVATE_STATE_BATCH_FILES) {
    throw new Error("state helper returned a malformed response");
  }
  const keys = new Set;
  const files = [];
  let contentBytes = 0;
  const invalidReasons = new Set([
    "unsafe-file",
    "unreadable",
    "file-byte-bound",
    "aggregate-byte-bound",
    "changed-during-read"
  ]);
  for (const candidate of value) {
    if (!isRecord(candidate) || !isSafeBatchFileName(candidate.directoryName) || !isSafeBatchFileName(candidate.fileName)) {
      throw new Error("state helper returned a malformed response");
    }
    const directoryName = candidate.directoryName;
    const fileName = candidate.fileName;
    const key = `${directoryName}\x00${fileName}`;
    if (keys.has(key)) {
      throw new Error("state helper returned a malformed response");
    }
    keys.add(key);
    if (candidate.status === "present" && exactObjectKeys(candidate, [
      "directoryName",
      "fileName",
      "status",
      "contentBase64"
    ])) {
      const content = decodeCanonicalBase64(candidate.contentBase64, MAX_PRIVATE_STATE_BATCH_FILE_BYTES);
      if (content === null) {
        throw new Error("state helper returned a malformed response");
      }
      contentBytes += content.byteLength;
      if (contentBytes > MAX_PRIVATE_STATE_BATCH_TOTAL_BYTES) {
        throw new Error("state helper returned a malformed response");
      }
      files.push({
        directoryName,
        fileName,
        status: "present",
        contentBase64: candidate.contentBase64
      });
      continue;
    }
    if (candidate.status === "absent" && exactObjectKeys(candidate, [
      "directoryName",
      "fileName",
      "status"
    ])) {
      files.push({ directoryName, fileName, status: "absent" });
      continue;
    }
    if (candidate.status === "invalid" && exactObjectKeys(candidate, [
      "directoryName",
      "fileName",
      "status",
      "reason"
    ]) && invalidReasons.has(candidate.reason)) {
      files.push({
        directoryName,
        fileName,
        status: "invalid",
        reason: candidate.reason
      });
      continue;
    }
    throw new Error("state helper returned a malformed response");
  }
  return files;
}
function parseResponseIdentity(value) {
  if (!isRecord(value) || !exactObjectKeys(value, ["device", "inode"]) || typeof value.device !== "string" || !/^\d{1,40}$/u.test(value.device) || typeof value.inode !== "string" || !/^\d{1,40}$/u.test(value.inode))
    return null;
  return { device: value.device, inode: value.inode };
}
function parseStateHelperResponse(value) {
  if (!isRecord(value) || !exactObjectKeys(value, ["ok", "identity"], ["created", "removed", "present", "contentBase64", "entries", "files", "childFiles", "targetIdentity"])) {
    throw new Error("state helper returned a malformed response");
  }
  const identityValue = value.identity;
  const parsedIdentity = parseResponseIdentity(identityValue);
  if (value.ok !== true || parsedIdentity === null)
    throw new Error("state helper returned a malformed response");
  const created = value.created;
  const removed = value.removed;
  const present = value.present;
  const contentBase64 = value.contentBase64;
  const entries = value.entries;
  const files = value.files;
  const childFiles = value.childFiles;
  const targetIdentityValue = value.targetIdentity;
  const targetIdentity = targetIdentityValue === undefined ? undefined : parseResponseIdentity(targetIdentityValue);
  if (created !== undefined && typeof created !== "boolean")
    throw new Error("state helper returned a malformed response");
  if (removed !== undefined && typeof removed !== "boolean")
    throw new Error("state helper returned a malformed response");
  if (present !== undefined && typeof present !== "boolean")
    throw new Error("state helper returned a malformed response");
  if (contentBase64 !== undefined && typeof contentBase64 !== "string")
    throw new Error("state helper returned a malformed response");
  if (targetIdentityValue !== undefined && targetIdentity === null) {
    throw new Error("state helper returned a malformed response");
  }
  const responseShape = Object.keys(value).filter((key) => key !== "ok" && key !== "identity").sort().join(",");
  if (!new Set([
    "",
    "contentBase64",
    "contentBase64,present",
    "created",
    "created,targetIdentity",
    "entries",
    "entries,targetIdentity",
    "childFiles,targetIdentity",
    "files,targetIdentity",
    "present",
    "removed",
    "targetIdentity"
  ]).has(responseShape))
    throw new Error("state helper returned a malformed response");
  if (present === true !== (responseShape === "contentBase64,present")) {
    if (present !== undefined)
      throw new Error("state helper returned a malformed response");
  }
  if (entries !== undefined && (!Array.isArray(entries) || entries.length > 1e4 || entries.some((entry) => !isRecord(entry) || !exactObjectKeys(entry, ["name", "kind"], ["identity"]) || typeof entry.name !== "string" || entry.name === "" || entry.name === "." || entry.name === ".." || entry.name.includes("/") || entry.name.includes("\\") || entry.name.includes("\x00") || Buffer.byteLength(entry.name, "utf8") > 255 || entry.kind !== "file" && entry.kind !== "directory" && entry.kind !== "symbolic-link" && entry.kind !== "other" || entry.kind === "directory" !== (parseResponseIdentity(entry.identity) !== null))))
    throw new Error("state helper returned a malformed response");
  const parsedFiles = files === undefined ? undefined : parseStateHelperBatchFiles(files);
  const parsedChildFiles = childFiles === undefined ? undefined : parseStateHelperBatchChildFiles(childFiles);
  return {
    ok: true,
    identity: parsedIdentity,
    ...created === undefined ? {} : { created },
    ...removed === undefined ? {} : { removed },
    ...present === undefined ? {} : { present },
    ...contentBase64 === undefined ? {} : { contentBase64 },
    ...entries === undefined ? {} : { entries },
    ...parsedFiles === undefined ? {} : { files: parsedFiles },
    ...parsedChildFiles === undefined ? {} : { childFiles: parsedChildFiles },
    ...targetIdentity === undefined || targetIdentity === null ? {} : { targetIdentity }
  };
}
function runStateHelper(directory, expected, operation, expectCreatedIdentity = false, faultForTest) {
  const requestId = crypto.randomUUID();
  const child = spawnSync(process.execPath, [
    "--no-env-file",
    "--no-install",
    "--no-macros",
    "--no-addons",
    `--config=${stateHelperConfigPath}`,
    stateHelperPath
  ], {
    cwd: directory,
    encoding: "utf8",
    env: faultForTest === undefined ? { NODE_ENV: "production" } : {
      NODE_ENV: "test",
      ...faultForTest === "insert-after-quarantine" || faultForTest === "replace-target-after-validation" ? { GHOSTGET_TEST_EMPTY_DIRECTORY_REMOVAL_RACE: faultForTest } : faultForTest === "pause-after-cas-claim" || faultForTest === "pause-after-mutation-claim-read" || faultForTest === "fail-after-cas-commit" ? { GHOSTGET_TEST_CAS_FAULT: faultForTest } : { GHOSTGET_TEST_BATCH_READ_FAULT: faultForTest }
    },
    input: JSON.stringify({ schemaVersion: 1, requestId, expected, operation }),
    maxBuffer: operation.kind === "batch-read-files" || operation.kind === "batch-read-child-files" ? MAX_PRIVATE_STATE_BATCH_STDOUT_BYTES : 180 * 1024 * 1024,
    shell: false,
    timeout: faultForTest === "pause-after-cas-claim" || faultForTest === "pause-after-mutation-claim-read" ? TEST_STATE_HELPER_TIMEOUT_MS : 30000,
    windowsHide: true
  });
  const current = inspectRealDirectoryIdentity(directory);
  if (!sameIdentity(current, expected))
    throw new Error(`GHOSTGET_STATE_HOME changed identity after validation: ${directory}`);
  if (child.error !== undefined)
    throw new Error("bound state helper failed to start", { cause: child.error });
  if (child.status !== 0) {
    const detail = child.stderr.trim().slice(0, 512);
    throw new Error(detail === "" ? "bound state helper rejected the operation" : detail);
  }
  let parsed;
  try {
    parsed = JSON.parse(child.stdout);
  } catch (error) {
    throw new Error("state helper returned invalid JSON", { cause: error });
  }
  const response = parseStateHelperResponse(parsed);
  if (!expectCreatedIdentity && !sameIdentity(response.identity, expected)) {
    throw new Error("state helper response came from the wrong directory identity");
  }
  return response;
}
function stateSegments(root, path) {
  const child = relative(root, canonicalNonStatePath(path));
  if (child === "")
    return [];
  if (isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`))
    throw new Error(`state path escapes its root: ${path}`);
  return child.split(sep);
}
function captureStateDirectoryExpectations(root, segments) {
  const expectations = [];
  let current = root;
  let missing = false;
  for (const segment of segments) {
    current = join(current, segment);
    if (missing) {
      expectations.push(null);
      continue;
    }
    let stats;
    try {
      stats = lstatSync(current, { bigint: true });
    } catch (error) {
      if (!hasCode(error, "ENOENT"))
        throw error;
      missing = true;
      expectations.push(null);
      continue;
    }
    if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats) || (stats.mode & 0o777n) !== 0o700n) {
      throw new Error(`ghostget state directory must be an owned real directory with mode 0700: ${current}`);
    }
    expectations.push({ device: stats.dev.toString(), inode: stats.ino.toString() });
  }
  return expectations;
}
function inspectStateRootIdentity(root) {
  let stats;
  try {
    stats = lstatSync(root, { bigint: true });
  } catch (error) {
    if (hasCode(error, "ENOENT"))
      return null;
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats)) {
    throw new Error(`GHOSTGET_STATE_HOME must be an owned real directory: ${root}`);
  }
  return { device: stats.dev.toString(), inode: stats.ino.toString() };
}
function inspectRealDirectoryIdentity(path) {
  let stats;
  try {
    stats = lstatSync(path, { bigint: true });
  } catch (error) {
    if (hasCode(error, "ENOENT"))
      return null;
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink())
    throw new Error(`path must be a real directory: ${path}`);
  return { device: stats.dev.toString(), inode: stats.ino.toString() };
}
function findCreationAnchor(root) {
  const segments = [];
  let current = root;
  for (;; ) {
    let stats;
    try {
      stats = lstatSync(current, { bigint: true });
    } catch (error) {
      if (!hasCode(error, "ENOENT"))
        throw error;
      const parent = dirname(current);
      if (parent === current)
        throw new Error(`GHOSTGET_STATE_HOME has no real existing creation anchor: ${root}`);
      segments.unshift(basename(current));
      current = parent;
      continue;
    }
    if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats) || (stats.mode & 0o022n) !== 0n) {
      throw new Error(`GHOSTGET_STATE_HOME creation path contains a non-owned real directory: ${current}`);
    }
    return {
      identity: { device: stats.dev.toString(), inode: stats.ino.toString() },
      path: current,
      segments
    };
  }
}
function assertStateRootIdentity(root) {
  const expected = knownStateRoots.get(root);
  if (expected === undefined)
    throw new Error(`ghostget state root has not been validated: ${root}`);
  const actual = inspectStateRootIdentity(root);
  if (!sameIdentity(actual, expected.identity)) {
    throw new Error(`GHOSTGET_STATE_HOME changed identity after validation: ${root}`);
  }
  if (expected.identity === null) {
    const anchor = findCreationAnchor(root);
    if (expected.creationAnchor === null || anchor.path !== expected.creationAnchor.path || !sameIdentity(anchor.identity, expected.creationAnchor.identity) || anchor.segments.join("\x00") !== expected.creationAnchor.segments.join("\x00"))
      throw new Error(`GHOSTGET_STATE_HOME creation path changed after validation: ${root}`);
  }
  if (expected.claimed) {
    if (actual === null)
      throw new Error(`GHOSTGET_STATE_HOME disappeared after validation: ${root}`);
    const stats = lstatSync(root);
    if ((stats.mode & 511) !== 448)
      throw new Error(`GHOSTGET_STATE_HOME must remain private (mode 0700): ${root}`);
    readStateMarker(join(root, stateMarkerName));
  }
  return expected;
}
function assertNoSymbolicLinks(root, target, includeTarget, requirePrivateDirectories = false) {
  const canonicalRoot = resolve(root);
  const absoluteTarget = resolve(target);
  if (!pathInside(canonicalRoot, absoluteTarget))
    throw new Error(`state path escapes its root: ${absoluteTarget}`);
  const checkedTarget = includeTarget ? absoluteTarget : dirname(absoluteTarget);
  const child = relative(canonicalRoot, checkedTarget);
  const components = child === "" ? [] : child.split(sep);
  let current = canonicalRoot;
  const paths = [current, ...components.map((component) => {
    current = join(current, component);
    return current;
  })];
  for (const [index, path] of paths.entries()) {
    let stats;
    try {
      stats = lstatSync(path);
    } catch (error) {
      if (hasCode(error, "ENOENT"))
        return;
      throw error;
    }
    if (stats.isSymbolicLink())
      throw new Error(`ghostget state path contains a symbolic link: ${path}`);
    if (stats.isDirectory() && requirePrivateDirectories && (!ownedByCurrentUser(stats) || (stats.mode & 511) !== 448)) {
      throw new Error(`ghostget state directory must be owned and private (mode 0700): ${path}`);
    }
    if (index < paths.length - 1 && !stats.isDirectory()) {
      throw new Error(`ghostget state ancestor is not a directory: ${path}`);
    }
  }
}
function assertSafeStatePath(path, environment = process.env, includeTarget = true) {
  const root = ghostgetStateHome(environment);
  assertStateRootIdentity(root);
  assertNoSymbolicLinks(root, path, includeTarget, true);
  assertStateRootIdentity(root);
}
function canonicalPotentialPath(value) {
  const suffix = [];
  let ancestor = resolve(value);
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor)
      throw new Error(`path has no existing ancestor: ${value}`);
    suffix.unshift(ancestor.slice(parent.length + (parent.endsWith("/") ? 0 : 1)));
    ancestor = parent;
  }
  const stats = lstatSync(ancestor);
  if (stats.isSymbolicLink())
    return resolve(realpathSync(ancestor), ...suffix);
  return resolve(realpathSync(ancestor), ...suffix);
}
function ownedByCurrentUser(stats) {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return currentUid === undefined || stats.uid === (typeof stats.uid === "bigint" ? BigInt(currentUid) : currentUid);
}
function readStateMarker(path) {
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const nonBlocking = "O_NONBLOCK" in constants ? constants.O_NONBLOCK : 0;
  const descriptor = openSync(path, constants.O_RDONLY | noFollow | nonBlocking);
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.size > 256 || !ownedByCurrentUser(stats) || (stats.mode & 63) !== 0) {
      throw new Error("ghostget state marker must be a private, owned regular file");
    }
    const content = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true
    }).decode(readDescriptorBounded(descriptor, 256));
    if (content !== stateMarkerText)
      throw new Error("ghostget state marker is malformed");
    const value = JSON.parse(content);
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "kind,schemaVersion" || !("schemaVersion" in value) || value.schemaVersion !== 1 || !("kind" in value) || value.kind !== "io-state")
      throw new Error("ghostget state marker is malformed");
  } finally {
    closeSync(descriptor);
  }
}
function hasGhostgetPathIdentity(path) {
  return resolve(path).split(sep).filter((segment) => segment !== "").slice(-3).some((segment) => /(?:^|[^a-z0-9])(?:ghostget|wrench|oh|io)(?:[^a-z0-9]|$)/iu.test(segment));
}
function validateUnmarkedStateRoot(root) {
  if (!hasGhostgetPathIdentity(root)) {
    throw new Error(`GHOSTGET_STATE_HOME is not marked as wrench-owned and its path does not identify dedicated ghostget state: ${root}`);
  }
  const allowed = new Set([
    ...stateDirectoryNames,
    ".cursor-encryption-key",
    ".plan-encryption-key",
    ".projection-encryption-key",
    ".recovery-encryption-key",
    ".session-encryption-key"
  ]);
  const entries = [];
  const directory = opendirSync(root);
  try {
    for (;; ) {
      const entry = directory.readSync();
      if (entry === null)
        break;
      if (entries.length >= 1e4)
        throw new Error("GHOSTGET_STATE_HOME contains more than 10000 entries");
      if (entry.name.includes("\uFFFD") || Buffer.byteLength(entry.name, "utf8") > 255) {
        throw new Error("GHOSTGET_STATE_HOME contains an unsafe entry name");
      }
      entries.push(entry);
    }
  } finally {
    directory.closeSync();
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink())
      throw new Error(`GHOSTGET_STATE_HOME contains a symbolic link: ${join(root, entry.name)}`);
    if (/^\.io-state\.stage-\d+-[0-9a-f-]{36}\.json$/u.test(entry.name)) {
      const stats2 = lstatSync(join(root, entry.name));
      if (!stats2.isFile() || !ownedByCurrentUser(stats2) || (stats2.mode & 63) !== 0 || stats2.size > 256) {
        throw new Error(`GHOSTGET_STATE_HOME contains an invalid interrupted state-marker stage: ${entry.name}`);
      }
      continue;
    }
    if (!allowed.has(entry.name)) {
      throw new Error(`GHOSTGET_STATE_HOME is not an empty or recognizable dedicated ghostget state directory: ${root}`);
    }
    if (stateDirectoryNames.includes(entry.name) && !entry.isDirectory()) {
      throw new Error(`GHOSTGET_STATE_HOME contains an invalid state entry: ${entry.name}`);
    }
    if ((entry.name === ".plan-encryption-key" || entry.name === ".cursor-encryption-key" || entry.name === ".projection-encryption-key" || entry.name === ".recovery-encryption-key" || entry.name === ".session-encryption-key") && !entry.isFile()) {
      throw new Error("GHOSTGET_STATE_HOME contains an invalid encryption key entry");
    }
    const stats = lstatSync(join(root, entry.name));
    const hasPrivateMode = entry.isDirectory() ? (stats.mode & 511) === 448 : (stats.mode & 63) === 0;
    if (!ownedByCurrentUser(stats) || !hasPrivateMode) {
      throw new Error(`GHOSTGET_STATE_HOME contains a state entry that is not owned and private: ${entry.name}`);
    }
  }
  return entries.length > 0;
}
function validateStateRoot(root) {
  if (!existsSync(root))
    return { claimed: false, creationAnchor: findCreationAnchor(root), identity: null };
  const stats = lstatSync(root, { bigint: true });
  if (!stats.isDirectory() || stats.isSymbolicLink() || !ownedByCurrentUser(stats)) {
    throw new Error(`GHOSTGET_STATE_HOME must be an owned real directory: ${root}`);
  }
  const marker = join(root, stateMarkerName);
  const claimed = existsSync(marker);
  const hasUnmarkedState = claimed ? false : validateUnmarkedStateRoot(root);
  if (claimed)
    readStateMarker(marker);
  if (!claimed && !hasUnmarkedState && (stats.mode & 0o022n) !== 0n) {
    throw new Error(`an unclaimed GHOSTGET_STATE_HOME must not be group/world-writable: ${root}`);
  }
  if ((claimed || hasUnmarkedState) && (stats.mode & 0o777n) !== 0o700n) {
    throw new Error(`GHOSTGET_STATE_HOME must be private (mode 0700) before trusted state is read: ${root}`);
  }
  return { claimed, creationAnchor: null, identity: { device: stats.dev.toString(), inode: stats.ino.toString() } };
}
function selectStateHome(environment) {
  const configuredRoots = [
    ["GHOSTGET_STATE_HOME", environment.GHOSTGET_STATE_HOME],
    ["WRENCH_STATE_HOME", environment.WRENCH_STATE_HOME],
    ["OH_STATE_HOME", environment.OH_STATE_HOME],
    ["IO_HOME", environment.IO_HOME]
  ];
  const requestedRoots = configuredRoots.flatMap(([name, value]) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? [] : [{ name, root: canonicalPotentialPath(trimmed) }];
  });
  const distinctRequestedRoots = new Set(requestedRoots.map(({ root: root2 }) => root2));
  if (distinctRequestedRoots.size > 1) {
    throw new Error(`${requestedRoots.map(({ name }) => name).join(", ")} select different state roots`);
  }
  const dataRoot = environment.XDG_DATA_HOME !== undefined && environment.XDG_DATA_HOME.trim() !== "" ? resolve(environment.XDG_DATA_HOME) : join(homedir(), ".local", "share");
  const currentDefault = canonicalPotentialPath(join(dataRoot, "ghostget"));
  const legacyDefaults = [
    canonicalPotentialPath(join(dataRoot, "wrench")),
    canonicalPotentialPath(join(dataRoot, "oh")),
    canonicalPotentialPath(join(dataRoot, "io"))
  ];
  let root = requestedRoots[0]?.root ?? null;
  if (root === null) {
    const existingDefaults = [currentDefault, ...legacyDefaults].filter((candidate) => existsSync(candidate));
    if (existingDefaults.length > 1) {
      throw new Error(`multiple Ghostget and legacy state roots exist; set GHOSTGET_STATE_HOME explicitly after reconciling ${existingDefaults.join(", ")}`);
    }
    root = existingDefaults[0] ?? currentDefault;
  }
  const home = canonicalPotentialPath(homedir());
  const forbiddenRoots = new Set([
    parse(root).root,
    home,
    dirname(home),
    canonicalPotentialPath(tmpdir()),
    canonicalPotentialPath(process.cwd()),
    ...["Desktop", "Documents", "Downloads", "Library", ".cache", ".config", ".local"].map((name) => canonicalPotentialPath(join(home, name))),
    ...environment.XDG_DATA_HOME === undefined || environment.XDG_DATA_HOME.trim() === "" ? [] : [canonicalPotentialPath(environment.XDG_DATA_HOME)]
  ]);
  if (forbiddenRoots.has(root) || isWithinPath(ghostgetSourcePackageRoot, root)) {
    throw new Error(`GHOSTGET_STATE_HOME must be a dedicated child directory, not a filesystem, home, temporary, repository, or shared data root: ${root}`);
  }
  return root;
}
function ghostgetStateHome(environment = process.env) {
  const root = selectStateHome(environment);
  const inspected = validateStateRoot(root);
  const remembered = knownStateRoots.get(root);
  if (remembered !== undefined) {
    if (!sameIdentity(remembered.identity, inspected.identity)) {
      throw new Error(`GHOSTGET_STATE_HOME changed identity after validation: ${root}`);
    }
    if (remembered.identity === null && (remembered.creationAnchor === null || inspected.creationAnchor === null || remembered.creationAnchor.path !== inspected.creationAnchor.path || !sameIdentity(remembered.creationAnchor.identity, inspected.creationAnchor.identity) || remembered.creationAnchor.segments.join("\x00") !== inspected.creationAnchor.segments.join("\x00")))
      throw new Error(`GHOSTGET_STATE_HOME creation path changed after validation: ${root}`);
    if (remembered.claimed && !inspected.claimed) {
      throw new Error(`GHOSTGET_STATE_HOME lost its ownership marker after validation: ${root}`);
    }
    knownStateRoots.set(root, { ...inspected, claimed: remembered.claimed || inspected.claimed });
  } else {
    knownStateRoots.set(root, inspected);
  }
  for (const name of stateDirectoryNames)
    assertNoSymbolicLinks(root, join(root, name), true);
  return root;
}
function ensureClaimedStateRoot(root) {
  let remembered = assertStateRootIdentity(root);
  if (remembered.identity === null) {
    const anchor = remembered.creationAnchor;
    if (anchor === null)
      throw new Error(`GHOSTGET_STATE_HOME has no validated creation anchor: ${root}`);
    const response = runStateHelper(anchor.path, anchor.identity, { kind: "create-root", segments: anchor.segments }, true);
    const current = inspectStateRootIdentity(root);
    if (!sameIdentity(current, response.identity))
      throw new Error(`GHOSTGET_STATE_HOME changed identity while being created: ${root}`);
    remembered = { claimed: true, creationAnchor: null, identity: response.identity };
    knownStateRoots.set(root, remembered);
  } else if (!remembered.claimed) {
    validateUnmarkedStateRoot(root);
    const descriptor = openSync(root, constants.O_RDONLY | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0) | ("O_DIRECTORY" in constants ? constants.O_DIRECTORY : 0));
    try {
      const stats = fstatSync(descriptor, { bigint: true });
      const actual = { device: stats.dev.toString(), inode: stats.ino.toString() };
      if (!sameIdentity(actual, remembered.identity) || !ownedByCurrentUser(stats)) {
        throw new Error(`GHOSTGET_STATE_HOME changed identity while being claimed: ${root}`);
      }
      fchmodSync(descriptor, 448);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    if (!sameIdentity(inspectStateRootIdentity(root), remembered.identity)) {
      throw new Error(`GHOSTGET_STATE_HOME changed identity while being claimed: ${root}`);
    }
    runStateHelper(root, remembered.identity, { kind: "claim" });
    if (!sameIdentity(inspectStateRootIdentity(root), remembered.identity)) {
      throw new Error(`GHOSTGET_STATE_HOME changed identity while being claimed: ${root}`);
    }
    remembered = { claimed: true, creationAnchor: null, identity: remembered.identity };
    knownStateRoots.set(root, remembered);
  }
  if (remembered.identity === null)
    throw new Error(`GHOSTGET_STATE_HOME is unavailable after being claimed: ${root}`);
  assertStateRootIdentity(root);
  return remembered.identity;
}
function canonicalNonStatePath(value) {
  const absolute = resolve(value);
  const filesystemRoot = parse(absolute).root;
  const child = relative(filesystemRoot, absolute);
  const segments = child === "" ? [] : child.split(sep);
  let current = filesystemRoot;
  for (const [index, segment] of segments.entries()) {
    const candidate = join(current, segment);
    let stats;
    try {
      stats = lstatSync(candidate);
    } catch (error) {
      if (!hasCode(error, "ENOENT"))
        throw error;
      return join(current, ...segments.slice(index));
    }
    if (stats.isSymbolicLink()) {
      if (process.platform === "win32" || Number(stats.uid) !== 0) {
        throw new Error(`private path is not a real directory (symbolic link): ${candidate}`);
      }
      current = realpathSync(candidate);
      continue;
    }
    current = candidate;
  }
  return current;
}
function ensurePrivateStateDirectory(path, environment = process.env) {
  assertSafeStatePath(path, environment);
  const root = ghostgetStateHome(environment);
  const identity = ensureClaimedStateRoot(root);
  const segments = stateSegments(root, path);
  if (segments.length === 0)
    return identity;
  const response = runStateHelper(root, identity, {
    kind: "ensure-directories",
    segments,
    directoryExpectations: captureStateDirectoryExpectations(root, segments)
  });
  if (response.targetIdentity === undefined) {
    throw new Error("state helper omitted the ensured directory identity");
  }
  return response.targetIdentity;
}
function snapshotPrivateStateDirectory(path, environment = process.env, expectedTarget, options = {}) {
  const root = ghostgetStateHome(environment);
  const identity = ensureClaimedStateRoot(root);
  const segments = stateSegments(root, path);
  if (segments.length === 0)
    throw new Error("the ghostget state root cannot be listed as a state collection");
  const directoryExpectations = [...captureStateDirectoryExpectations(root, segments)];
  if (expectedTarget !== undefined && directoryExpectations.at(-1) !== null) {
    directoryExpectations[directoryExpectations.length - 1] = expectedTarget;
  }
  const response = runStateHelper(root, identity, {
    kind: "list-directory",
    segments,
    directoryExpectations,
    recoverOrphanedMutationClaims: options.recoverOrphanedMutationClaims === true
  });
  if (response.entries === undefined)
    throw new Error("state helper omitted its directory entries");
  return Object.freeze({
    identity: response.targetIdentity ?? null,
    entries: response.entries
  });
}
var adapterGenerationMaximumIndexBytes = 1024 * 1024;
var activeAdapterGenerationTransactions = new Map;

export { captureProcessOwnerIdentity, processOwnerStatus, assertSafeStatePath, ghostgetStateHome, ensurePrivateStateDirectory, snapshotPrivateStateDirectory };
