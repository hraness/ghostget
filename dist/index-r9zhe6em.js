// @bun
import {
  captureProcessOwnerIdentity,
  processOwnerStatus
} from "./index-4bpemvnc.js";

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
var unsupportedCleanupFilesystemReason = "the temporary filesystem does not expose an immutable local CLI cleanup directory identity";
function recoverablePrivateRootStats(stats, currentUid) {
  return stats.isDirectory() && !stats.isSymbolicLink() && currentUid !== undefined && stats.uid === BigInt(currentUid) && (stats.mode & 0o777n) === 0o700n && stats.birthtimeNs > 0n;
}
function inspectLocalCliCleanupFilesystemReadiness() {
  let probePath;
  try {
    probePath = mkdtempSync(join(realpathSync(tmpdir()), "wrench-local-cli-readiness-"));
    chmodSync(probePath, 448);
    const supported = recoverablePrivateRootStats(lstatSync(probePath, { bigint: true }), process.getuid?.());
    rmdirSync(probePath);
    probePath = undefined;
    return supported ? Object.freeze({ ready: true, reason: null }) : Object.freeze({
      ready: false,
      reason: unsupportedCleanupFilesystemReason
    });
  } catch {
    return Object.freeze({
      ready: false,
      reason: unsupportedCleanupFilesystemReason
    });
  } finally {
    if (probePath !== undefined) {
      try {
        rmdirSync(probePath);
      } catch {}
    }
  }
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
function localCliCleanupResourceExtends(current, next) {
  const left = parseLocalCliCleanupResourceIdentityV1(current);
  const right = parseLocalCliCleanupResourceIdentityV1(next);
  if (JSON.stringify(left.root) !== JSON.stringify(right.root))
    return false;
  const leftGroups = left.processGroups ?? [];
  const rightGroups = right.processGroups ?? [];
  return rightGroups.length >= leftGroups.length && leftGroups.every((group, index) => JSON.stringify(group) === JSON.stringify(rightGroups[index]));
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

export { inspectLocalCliCleanupFilesystemReadiness, parseLocalCliCleanupResourceIdentityV1, captureLocalCliCleanupResource, attachLocalCliCleanupProcessGroup, localCliCleanupResourceExtends, localCliCleanupProcessGroupStatus };
