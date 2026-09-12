// @bun
import {
  ensureImsgNativeResources,
  verifyImsgNativeResources
} from "./index-en5hycxp.js";
import {
  ensurePrivateStateDirectory,
  ghostgetStateHome
} from "./index-yq6maz71.js";
import"./index-gwk7rbyj.js";
import"./index-z1w83f81.js";

// src/providers/imessage-direct-install.ts
import { createHash, randomBytes } from "crypto";
import { constants, createReadStream } from "fs";
import {
  chmod,
  link,
  lstat,
  open,
  realpath,
  unlink
} from "fs/promises";
import { isAbsolute, join } from "path";

// src/providers/imessage-direct.ts
var IMSG_UPSTREAM_VERSION = "0.14.1";
var IMSG_UPSTREAM_COMMIT = "25beb76c902b0acf2dd7ae392f1b0792f6813240";
var IMSG_PRIVATE_TRANSPORT_PATCH_COMMIT = "292db82d89293867ef847a2875667fea0fdd5dc1";
var IMSG_PRIVATE_TRANSPORT_PATCH_SHA256 = "99cf18953470e85a62a226f207e6a5c0452d3997675c99eabf4d5cb73c6411fd";
var IMSG_EXACT_CHAT_PATCH_COMMIT = "c5994f00d17969fd7772fd2772e7b3591089513a";
var IMSG_EXACT_CHAT_PATCH_SHA256 = "b05aa92a078930f96fda611c674436638843f7b148d7bfa3b65ed1ccb0885c13";
var IMSG_NO_FETCH_RICH_CARDS_PATCH_COMMIT = "520b82ab025c1d4d57333b552aa65c9ae3fdb5fd";
var IMSG_NO_FETCH_RICH_CARDS_PATCH_SHA256 = "c2346afca4dd0f9721c235db4f692d6a2d6dece36481e074d94b5ce78f2e019b";
var IMSG_REVIEWED_PATCH_COMMIT = IMSG_NO_FETCH_RICH_CARDS_PATCH_COMMIT;
var IMSG_REVIEWED_PATCHES = Object.freeze([
  Object.freeze({
    commit: IMSG_PRIVATE_TRANSPORT_PATCH_COMMIT,
    sha256: IMSG_PRIVATE_TRANSPORT_PATCH_SHA256
  }),
  Object.freeze({
    commit: IMSG_EXACT_CHAT_PATCH_COMMIT,
    sha256: IMSG_EXACT_CHAT_PATCH_SHA256
  }),
  Object.freeze({
    commit: IMSG_NO_FETCH_RICH_CARDS_PATCH_COMMIT,
    sha256: IMSG_NO_FETCH_RICH_CARDS_PATCH_SHA256
  })
]);
var IMSG_REVIEWED_VERSION = "0.14.1+private-transport.3";
var IMSG_DARWIN_ARM64_EXECUTABLE_SHA256 = "46c4c73c81c7db2d516c2d467c66aff03c73de196996d646bc8afce0ea85cff6";
var IMSG_TOOL_PIN = Object.freeze({
  id: "imsg-private-transport",
  implementation: "github.com/openclaw/imsg+reviewed-patch",
  version: IMSG_REVIEWED_VERSION,
  upstreamVersion: IMSG_UPSTREAM_VERSION,
  upstreamCommit: IMSG_UPSTREAM_COMMIT,
  reviewedPatchCommit: IMSG_REVIEWED_PATCH_COMMIT,
  reviewedPatches: IMSG_REVIEWED_PATCHES,
  sourceUrl: `https://github.com/openclaw/imsg/tree/${IMSG_UPSTREAM_COMMIT}`,
  artifacts: Object.freeze([Object.freeze({
    platform: "darwin",
    arch: "arm64",
    executableSha256: IMSG_DARWIN_ARM64_EXECUTABLE_SHA256
  })])
});
var IMSG_DIRECT_OPERATION_NAMES = Object.freeze([
  "messaging.list",
  "conversations.read",
  "messaging.read",
  "messaging.send",
  "messaging.delivery.read"
]);
var IMSG_DIRECT_OPERATIONS = Object.freeze({
  "messaging.list": Object.freeze({
    effect: "read",
    risk: "R1",
    reason: "list a bounded current local Messages conversation window"
  }),
  "conversations.read": Object.freeze({
    effect: "read",
    risk: "R1",
    reason: "resolve one exact live iMessage chat GUID, service, and database row"
  }),
  "messaging.read": Object.freeze({
    effect: "read",
    risk: "R1",
    reason: "read bounded current context from one exact live iMessage chat"
  }),
  "messaging.send": Object.freeze({
    effect: "write",
    risk: "R3",
    reason: "submit one confirmed text bubble through explicit AppleScript iMessage transport with SMS fallback disabled"
  }),
  "messaging.delivery.read": Object.freeze({
    effect: "read",
    risk: "R1",
    reason: "read the local Messages status row for one exact observed outgoing GUID"
  })
});

// src/providers/imessage-direct-install.ts
var MAX_IMSG_BINARY_BYTES = 256 * 1024 * 1024;

class ImsgInstallFailure extends Error {
}
function installFailure(message) {
  return new ImsgInstallFailure(message);
}
function filesystemErrorCode(error) {
  if (typeof error !== "object" || error === null || !("code" in error) || typeof error.code !== "string")
    return null;
  return error.code;
}
function sourceOpenFailure(error) {
  const code = filesystemErrorCode(error);
  if (code === "ENOENT") {
    return installFailure("imsg install source file does not exist");
  }
  if (code === "EACCES" || code === "EPERM") {
    return installFailure("imsg install source file is unreadable");
  }
  if (code === "ELOOP") {
    return installFailure("imsg install source is not a trusted executable file");
  }
  return installFailure("imsg install source file could not be opened safely");
}
function imsgArtifactForCurrentRuntime() {
  const artifact = IMSG_TOOL_PIN.artifacts.find((candidate) => candidate.platform === process.platform && candidate.arch === process.arch);
  if (artifact === undefined) {
    throw new Error(`reviewed imsg transport has no artifact for ${process.platform}/${process.arch}`);
  }
  return artifact;
}
async function sha256File(path) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
async function pinnedBinaryCandidate(path, executableSha256) {
  try {
    const canonical = await realpath(path);
    if (canonical !== path)
      return null;
    const stats = await lstat(canonical);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > MAX_IMSG_BINARY_BYTES || (stats.mode & 18) !== 0 || (stats.mode & 73) === 0 || stats.uid !== process.getuid?.() && stats.uid !== 0)
      return null;
    return await sha256File(canonical) === executableSha256 ? canonical : null;
  } catch {
    return null;
  }
}
function imsgInstalledBinaryPath(environment = process.env) {
  return join(ghostgetStateHome(environment), "tools", "imsg", IMSG_REVIEWED_VERSION, "imsg");
}
async function resolvePinnedImsgBinary(environment = process.env) {
  const artifact = imsgArtifactForCurrentRuntime();
  let candidate;
  try {
    candidate = imsgInstalledBinaryPath(environment);
  } catch {
    throw installFailure(`reviewed imsg transport ${IMSG_REVIEWED_VERSION} is unavailable or failed integrity verification`);
  }
  const resolved = await pinnedBinaryCandidate(candidate, artifact.executableSha256);
  if (resolved === null) {
    throw new Error(`reviewed imsg transport ${IMSG_REVIEWED_VERSION} is unavailable or failed integrity verification`);
  }
  try {
    await verifyImsgNativeResources(join(ghostgetStateHome(environment), "tools", "imsg", IMSG_REVIEWED_VERSION));
  } catch {
    throw installFailure("reviewed imsg resources are unavailable or failed integrity verification");
  }
  return resolved;
}
async function validateInstallDirectory(path) {
  try {
    const canonical = await realpath(path);
    const stats = await lstat(path);
    if (canonical !== path || !stats.isDirectory() || stats.isSymbolicLink() || stats.uid !== process.getuid?.() || (stats.mode & 63) !== 0) {
      throw installFailure("imsg install directory must be an owned physical private directory");
    }
  } catch (error) {
    if (error instanceof ImsgInstallFailure)
      throw error;
    throw installFailure("imsg install state directory is unavailable or unsafe");
  }
}
async function copyPinnedBinary(sourcePath, destinationPath, expectedSha256) {
  let source;
  try {
    source = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    throw sourceOpenFailure(error);
  }
  let destination;
  try {
    const before = await source.stat();
    if (!before.isFile() || before.size < 1 || before.size > MAX_IMSG_BINARY_BYTES || (before.mode & 18) !== 0 || (before.mode & 73) === 0 || before.uid !== process.getuid?.() && before.uid !== 0)
      throw installFailure("imsg install source is not a trusted executable file");
    destination = await open(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 320);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let offset = 0;
    while (offset < before.size) {
      const read = await source.read(buffer, 0, Math.min(buffer.byteLength, before.size - offset), offset);
      if (read.bytesRead < 1) {
        throw installFailure("imsg install source changed while copied");
      }
      const chunk = buffer.subarray(0, read.bytesRead);
      hash.update(chunk);
      let written = 0;
      while (written < chunk.byteLength) {
        const result = await destination.write(chunk, written, chunk.byteLength - written, offset + written);
        if (result.bytesWritten < 1) {
          throw installFailure("imsg install copy failed");
        }
        written += result.bytesWritten;
      }
      offset += read.bytesRead;
    }
    const extra = await source.read(Buffer.allocUnsafe(1), 0, 1, offset);
    const after = await source.stat();
    if (extra.bytesRead !== 0 || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || hash.digest("hex") !== expectedSha256) {
      throw installFailure("imsg install source changed or did not match the reviewed digest");
    }
    await destination.sync();
  } finally {
    await destination?.close();
    await source.close();
  }
  await chmod(destinationPath, 320);
  if (await sha256File(destinationPath) !== expectedSha256) {
    throw installFailure("installed imsg transport failed its reviewed digest");
  }
}
async function installReviewedImsgBinary(sourcePath, environment = process.env) {
  if (!isAbsolute(sourcePath)) {
    throw installFailure("imsg install source must be an absolute path");
  }
  const artifact = imsgArtifactForCurrentRuntime();
  let stateHome;
  try {
    stateHome = ghostgetStateHome(environment);
  } catch {
    throw installFailure("imsg install state directory is unavailable or unsafe");
  }
  const installDirectory = join(stateHome, "tools", "imsg", IMSG_REVIEWED_VERSION);
  const destinationPath = join(installDirectory, "imsg");
  try {
    ensurePrivateStateDirectory(installDirectory, environment);
    await validateInstallDirectory(installDirectory);
    await ensureImsgNativeResources(installDirectory, environment);
  } catch (error) {
    if (error instanceof ImsgInstallFailure)
      throw error;
    throw installFailure("imsg install state directory is unavailable or unsafe");
  }
  const existing = await pinnedBinaryCandidate(destinationPath, artifact.executableSha256);
  if (existing !== null) {
    return Object.freeze({
      path: existing,
      executableSha256: artifact.executableSha256,
      version: IMSG_REVIEWED_VERSION,
      alreadyPresent: true
    });
  }
  try {
    await lstat(destinationPath);
    throw installFailure("existing imsg install does not match the reviewed artifact");
  } catch (error) {
    if (error instanceof ImsgInstallFailure)
      throw error;
    if (filesystemErrorCode(error) !== "ENOENT") {
      throw installFailure("existing imsg install could not be inspected safely");
    }
  }
  const temporaryPath = join(installDirectory, `.imsg-install-${randomBytes(16).toString("hex")}`);
  try {
    try {
      await copyPinnedBinary(sourcePath, temporaryPath, artifact.executableSha256);
    } catch (error) {
      if (error instanceof ImsgInstallFailure)
        throw error;
      throw installFailure("imsg install I/O failed safely");
    }
    try {
      await link(temporaryPath, destinationPath);
    } catch (error) {
      if (filesystemErrorCode(error) !== "EEXIST") {
        throw installFailure("imsg install I/O failed safely");
      }
      if (await pinnedBinaryCandidate(destinationPath, artifact.executableSha256) === null)
        throw installFailure("concurrent imsg install produced unreviewed bytes");
    }
  } finally {
    try {
      await unlink(temporaryPath);
    } catch (error) {
      if (filesystemErrorCode(error) !== "ENOENT") {
        throw installFailure("imsg install I/O cleanup failed safely");
      }
    }
  }
  const installed = await pinnedBinaryCandidate(destinationPath, artifact.executableSha256);
  if (installed === null) {
    throw installFailure("imsg install could not be verified");
  }
  return Object.freeze({
    path: installed,
    executableSha256: artifact.executableSha256,
    version: IMSG_REVIEWED_VERSION,
    alreadyPresent: false
  });
}
export {
  resolvePinnedImsgBinary,
  installReviewedImsgBinary,
  imsgInstalledBinaryPath,
  imsgArtifactForCurrentRuntime
};
