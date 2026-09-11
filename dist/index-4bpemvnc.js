// @bun
// src/transport-policy.ts
var DOM_ACTION_TRANSPORT_DISABLED_MESSAGE = "runtime DOM action recipes are disabled; browser and agent-browser are capture/bootstrap-only; use a code-owned schemaVersion 3 provider or schemaVersion 4 authenticated internal API contract";

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
function currentProcessStartIdentity() {
  const owner = captureProcessOwnerIdentity(process.pid);
  return Object.freeze({
    bootId: owner.bootId,
    processStartId: owner.processStartId
  });
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

export { DOM_ACTION_TRANSPORT_DISABLED_MESSAGE, currentProcessStartIdentity, captureProcessOwnerIdentity, processOwnerStatus };
