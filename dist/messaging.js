// @bun
import {
  MESSAGING_CONTEXT_BINDING_CONTRACT_DESCRIPTOR,
  MESSAGING_CONTEXT_BINDING_CONTRACT_HASH,
  MESSAGING_CONTEXT_BINDING_CONTRACT_ID,
  MESSAGING_CONTEXT_BINDING_V1_CONTRACT_DESCRIPTOR,
  MESSAGING_CONTEXT_BINDING_V1_CONTRACT_HASH,
  MESSAGING_CONTEXT_BINDING_V1_CONTRACT_ID,
  MESSAGING_CONTEXT_BINDING_V2_CONTRACT_DESCRIPTOR,
  MESSAGING_CONTEXT_BINDING_V2_CONTRACT_HASH,
  MESSAGING_CONTEXT_BINDING_V2_CONTRACT_ID,
  MESSAGING_RECEIPT_BINDING_CONTRACT_DESCRIPTOR,
  MESSAGING_RECEIPT_BINDING_CONTRACT_HASH,
  MESSAGING_RECEIPT_BINDING_CONTRACT_ID,
  MESSAGING_RECEIPT_BINDING_V1_CONTRACT_DESCRIPTOR,
  MESSAGING_RECEIPT_BINDING_V1_CONTRACT_HASH,
  MESSAGING_RECEIPT_BINDING_V1_CONTRACT_ID,
  MESSAGING_RECEIPT_BINDING_V2_CONTRACT_DESCRIPTOR,
  MESSAGING_RECEIPT_BINDING_V2_CONTRACT_HASH,
  MESSAGING_RECEIPT_BINDING_V2_CONTRACT_ID,
  messagingTurnDigest,
  parseMessagingContextBinding,
  parseMessagingContextBindingV1,
  parseMessagingContextBindingV2,
  parseMessagingContextRequestV1,
  parseMessagingContextV1,
  parseMessagingPreviewV1,
  parseMessagingPrivateOutputReceiptV1,
  parseMessagingReceiptBinding,
  parseMessagingReceiptBindingV1,
  parseMessagingReceiptBindingV2,
  parseMessagingRouteResolveRequestV1,
  parseMessagingRouteResolveRequestV2,
  parseMessagingRouteV1,
  parseMessagingRouteV2,
  parseMessagingRoutesRequestV1,
  parseMessagingRoutesV1,
  parseMessagingRoutesV2,
  parseMessagingTurnV1
} from "./index-d5mzwdjp.js";
import"./index-hqk9cej0.js";
import {
  canonicalJson,
  sha256
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/messaging.ts
import { spawn } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
var MAX_STDOUT_BYTES = 64 * 1024;
var MAX_STDERR_BYTES = 64 * 1024;
var MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
var COMMAND_TIMEOUT_MS = 120000;
var COMMAND_TERMINATION_GRACE_MS = 1000;
function cliSourcePath() {
  const besideSource = fileURLToPath(new URL("./cli.ts", import.meta.url));
  if (existsSync(besideSource))
    return besideSource;
  const packagedSource = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
  if (existsSync(packagedSource))
    return packagedSource;
  throw new Error("the installed Ghostget CLI source is unavailable");
}
function environmentSnapshot(overrides) {
  const result = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined)
      result[key] = value;
  }
  if (overrides !== undefined) {
    if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides) || Object.getPrototypeOf(overrides) !== Object.prototype)
      throw new Error("Ghostget messaging environment must be a plain object");
    for (const [key, value] of Object.entries(overrides)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
        throw new Error("Ghostget messaging environment contains an invalid name");
      }
      if (value === undefined)
        delete result[key];
      else if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 128 * 1024 || value.includes("\x00"))
        throw new Error("Ghostget messaging environment contains an invalid value");
      else
        result[key] = value;
    }
  }
  return Object.freeze(result);
}
function options(value) {
  if (value === undefined)
    return Object.freeze({ environment: environmentSnapshot(undefined) });
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some((key) => key !== "environment" && key !== "signal"))
    throw new Error("Ghostget messaging options are malformed");
  if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) {
    throw new Error("Ghostget messaging signal is malformed");
  }
  return Object.freeze({
    environment: environmentSnapshot(value.environment),
    ...value.signal === undefined ? {} : { signal: value.signal }
  });
}
function boundedError(chunks) {
  return Buffer.concat(chunks).toString("utf8").slice(0, MAX_STDERR_BYTES).trim();
}
async function runCli(operation, request, clientOptions) {
  if (typeof process.versions.bun !== "string") {
    throw new Error("@hraness/ghostget/messaging requires Bun to run the installed Ghostget CLI");
  }
  const prepared = options(clientOptions);
  if (prepared.signal?.aborted === true) {
    throw prepared.signal.reason instanceof Error ? prepared.signal.reason : new DOMException("Ghostget messaging operation was aborted", "AbortError");
  }
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "wrench-messaging-"));
  const privateOutput = join(temporaryDirectory, "artifact.json");
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        cliSourcePath(),
        "messaging",
        operation,
        "--input",
        "-",
        "--private-output",
        privateOutput,
        "--json"
      ], {
        env: prepared.environment,
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32"
      });
      const stdout = [];
      const stderr = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;
      let pendingError = null;
      let terminationTimer = null;
      const settleFailure = (error) => {
        if (settled)
          return;
        settled = true;
        clearTimeout(timer);
        if (terminationTimer !== null)
          clearTimeout(terminationTimer);
        prepared.signal?.removeEventListener("abort", abort);
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const signalOwnedTree = (signal) => {
        try {
          if (process.platform !== "win32" && child.pid !== undefined) {
            process.kill(-child.pid, signal);
          } else {
            child.kill(signal);
          }
        } catch {}
      };
      const ownedTreeIsAlive = () => {
        if (process.platform === "win32" || child.pid === undefined)
          return false;
        try {
          process.kill(-child.pid, 0);
          return true;
        } catch {
          return false;
        }
      };
      const rejectAfterOwnedTreeExit = () => {
        signalOwnedTree("SIGKILL");
        if (!ownedTreeIsAlive()) {
          settleFailure(pendingError ?? new Error("Ghostget messaging operation failed"));
          return;
        }
        setTimeout(rejectAfterOwnedTreeExit, 10);
      };
      const requestTermination = (error) => {
        pendingError ??= error;
        if (child.pid === undefined) {
          settleFailure(pendingError);
          return;
        }
        if (terminationTimer !== null)
          return;
        signalOwnedTree("SIGTERM");
        terminationTimer = setTimeout(() => signalOwnedTree("SIGKILL"), COMMAND_TERMINATION_GRACE_MS);
        terminationTimer.unref?.();
      };
      const abort = () => {
        requestTermination(prepared.signal?.reason instanceof Error ? prepared.signal.reason : new DOMException("Ghostget messaging operation was aborted", "AbortError"));
      };
      const timer = setTimeout(() => {
        requestTermination(new Error("Ghostget messaging operation timed out"));
      }, COMMAND_TIMEOUT_MS);
      timer.unref?.();
      prepared.signal?.addEventListener("abort", abort, { once: true });
      child.on("error", (error) => requestTermination(error));
      child.stdout.on("data", (chunk) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > MAX_STDOUT_BYTES) {
          requestTermination(new Error("Ghostget messaging receipt exceeded its byte bound"));
          return;
        }
        stdout.push(Buffer.from(chunk));
      });
      child.stderr.on("data", (chunk) => {
        stderrBytes += chunk.byteLength;
        if (stderrBytes > MAX_STDERR_BYTES) {
          requestTermination(new Error("Ghostget messaging diagnostic exceeded its byte bound"));
          return;
        }
        stderr.push(Buffer.from(chunk));
      });
      child.on("close", (code) => {
        if (settled)
          return;
        clearTimeout(timer);
        if (terminationTimer !== null)
          clearTimeout(terminationTimer);
        prepared.signal?.removeEventListener("abort", abort);
        if (pendingError !== null) {
          rejectAfterOwnedTreeExit();
          return;
        }
        settled = true;
        resolve(Object.freeze({
          code: code ?? 3,
          stdout: Buffer.concat(stdout),
          stderr: Object.freeze(stderr)
        }));
      });
      child.stdin.on("error", (error) => requestTermination(error));
      child.stdin.end(`${canonicalJson(request)}
`, "utf8");
    });
    if (result.code !== 0) {
      throw new Error(boundedError(result.stderr) || `Ghostget messaging exited ${result.code}`);
    }
    let receiptValue;
    try {
      receiptValue = JSON.parse(result.stdout.toString("utf8"));
    } catch {
      throw new Error("Ghostget messaging returned a malformed receipt");
    }
    const receipt = parseMessagingPrivateOutputReceiptV1(receiptValue);
    const expectedFormat = operation === "routes" ? "wrench.messaging-routes" : operation === "resolve" ? "wrench.messaging-route" : operation === "context" ? "wrench.messaging-context" : "wrench.messaging-preview";
    if (receipt.artifactFormat !== expectedFormat) {
      throw new Error("Ghostget messaging returned another private artifact contract");
    }
    const stats = lstatSync(privateOutput);
    const currentUid = process.getuid?.();
    if (!stats.isFile() || currentUid === undefined || stats.uid !== currentUid || (stats.mode & 511) !== 384 || stats.size > MAX_ARTIFACT_BYTES)
      throw new Error("Ghostget messaging private artifact is not an owned mode-0600 file");
    const artifactText = readFileSync(privateOutput, "utf8");
    let artifact;
    try {
      artifact = JSON.parse(artifactText);
    } catch {
      throw new Error("Ghostget messaging private artifact is malformed JSON");
    }
    if (sha256(canonicalJson(artifact)) !== receipt.artifactSha256) {
      throw new Error("Ghostget messaging private artifact does not match its receipt");
    }
    return artifact;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
async function discoverMessagingRoutes(request, clientOptions) {
  const value = parseMessagingRoutesV2(await runCli("routes", parseMessagingRoutesRequestV1(request), clientOptions));
  return value;
}
async function resolveMessagingRoute(request, clientOptions) {
  return parseMessagingRouteV2(await runCli("resolve", parseMessagingRouteResolveRequestV2(request), clientOptions));
}
async function readMessagingContext(request, clientOptions) {
  return parseMessagingContextV1(await runCli("context", parseMessagingContextRequestV1(request), clientOptions));
}
async function previewMessagingTurn(request, clientOptions) {
  return parseMessagingPreviewV1(await runCli("preview", parseMessagingTurnV1(request), clientOptions));
}
export {
  resolveMessagingRoute,
  readMessagingContext,
  previewMessagingTurn,
  parseMessagingTurnV1,
  parseMessagingRoutesV2,
  parseMessagingRoutesV1,
  parseMessagingRoutesRequestV1,
  parseMessagingRouteV2,
  parseMessagingRouteV1,
  parseMessagingRouteResolveRequestV2,
  parseMessagingRouteResolveRequestV1,
  parseMessagingReceiptBindingV2,
  parseMessagingReceiptBindingV1,
  parseMessagingReceiptBinding,
  parseMessagingPrivateOutputReceiptV1,
  parseMessagingPreviewV1,
  parseMessagingContextV1,
  parseMessagingContextRequestV1,
  parseMessagingContextBindingV2,
  parseMessagingContextBindingV1,
  parseMessagingContextBinding,
  messagingTurnDigest,
  discoverMessagingRoutes,
  MESSAGING_RECEIPT_BINDING_V2_CONTRACT_ID,
  MESSAGING_RECEIPT_BINDING_V2_CONTRACT_HASH,
  MESSAGING_RECEIPT_BINDING_V2_CONTRACT_DESCRIPTOR,
  MESSAGING_RECEIPT_BINDING_V1_CONTRACT_ID,
  MESSAGING_RECEIPT_BINDING_V1_CONTRACT_HASH,
  MESSAGING_RECEIPT_BINDING_V1_CONTRACT_DESCRIPTOR,
  MESSAGING_RECEIPT_BINDING_CONTRACT_ID,
  MESSAGING_RECEIPT_BINDING_CONTRACT_HASH,
  MESSAGING_RECEIPT_BINDING_CONTRACT_DESCRIPTOR,
  MESSAGING_CONTEXT_BINDING_V2_CONTRACT_ID,
  MESSAGING_CONTEXT_BINDING_V2_CONTRACT_HASH,
  MESSAGING_CONTEXT_BINDING_V2_CONTRACT_DESCRIPTOR,
  MESSAGING_CONTEXT_BINDING_V1_CONTRACT_ID,
  MESSAGING_CONTEXT_BINDING_V1_CONTRACT_HASH,
  MESSAGING_CONTEXT_BINDING_V1_CONTRACT_DESCRIPTOR,
  MESSAGING_CONTEXT_BINDING_CONTRACT_ID,
  MESSAGING_CONTEXT_BINDING_CONTRACT_HASH,
  MESSAGING_CONTEXT_BINDING_CONTRACT_DESCRIPTOR
};
