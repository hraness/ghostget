// @bun
import {
  ghostgetStateHome,
  snapshotPrivateStateDirectory
} from "./index-0ywm1fj9.js";
import"./index-4bpemvnc.js";
import"./index-26yq8q16.js";
import"./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/control/approval-client.ts
import { connect } from "net";
import { lstatSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

// src/control/validation.ts
class ControlError extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
function invalid() {
  throw new ControlError("INVALID_REQUEST", "The request is invalid or exceeds its limits.");
}
function record(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return invalid();
  return value;
}
function keys(value, expected) {
  if (Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key)))
    invalid();
}
function string(value, max = 256, min = 1) {
  if (typeof value !== "string" || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))
    return invalid();
  return value;
}
function identifier(value) {
  const result = string(value, 128);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(result))
    return invalid();
  return result;
}
function oneOf(value, values) {
  if (typeof value !== "string" || !values.includes(value))
    return invalid();
  return value;
}
function digest(value) {
  const result = string(value, 64);
  if (!/^[a-f0-9]{64}$/u.test(result))
    invalid();
  return result;
}

// src/control/approval-client.ts
function controlSocketPath(environment = process.env) {
  return join(ghostgetStateHome(environment), "control", "agent.sock");
}
async function agentRequest(payload, options) {
  const path = controlSocketPath(options.environment);
  const data = Buffer.from(`${JSON.stringify(payload)}
`);
  if (data.length > 262144)
    throw new ControlError("REQUEST_TOO_LARGE", "The agent request is too large.");
  try {
    snapshotPrivateStateDirectory(join(ghostgetStateHome(options.environment), "control"), options.environment);
    const stat = lstatSync(path);
    if (!stat.isSocket() || stat.uid !== process.getuid?.() || (stat.mode & 511) !== 384)
      throw new Error;
  } catch {
    throw new ControlError("CONTROL_APP_REQUIRED", "Open the Ghostget app to use the gateway or request human approval.");
  }
  return await new Promise((resolve, reject) => {
    const socket = connect({ path });
    let received = Buffer.alloc(0);
    let settled = false;
    const finish = (error, value) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      socket.destroy();
      if (error)
        reject(error);
      else
        resolve(value);
    };
    const abort = () => finish(new ControlError("REQUEST_CANCELLED", "The request was cancelled."));
    const timer = setTimeout(() => finish(new ControlError("CONTROL_TIMEOUT", "The app did not respond before the request deadline.")), options.timeoutMs ?? 5000);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    socket.once("connect", () => socket.write(data));
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
      if (received.length > 4194304) {
        finish(new ControlError("INVALID_RESPONSE", "The app response exceeded its limit."));
        return;
      }
      const end = received.indexOf(10);
      if (end < 0)
        return;
      try {
        if (received.subarray(end + 1).length)
          throw new Error;
        finish(null, JSON.parse(received.subarray(0, end).toString("utf8")));
      } catch {
        finish(new ControlError("INVALID_RESPONSE", "The app response was invalid."));
      }
    });
    socket.once("error", () => finish(new ControlError("CONTROL_DISCONNECTED", "The Ghostget app disconnected.")));
    socket.once("end", () => finish(new ControlError("CONTROL_DISCONNECTED", "The Ghostget app disconnected.")));
  });
}
function response(value, lease) {
  const v = record(value);
  keys(v, ["protocol", "status", "id", "digest"]);
  if (v.protocol !== "ghostget.approval/1" || v.id !== lease.id || v.digest !== lease.digest)
    throw new ControlError("INVALID_RESPONSE", "The approval response did not match this request.");
  return { protocol: "ghostget.approval/1", id: identifier(v.id), digest: digest(v.digest), status: oneOf(v.status, ["pending", "allowed", "denied", "expired", "cancelled", "invalid"]) };
}
async function requestApproval(target, expectedDigest, options) {
  const lease = { id: randomUUID(), digest: expectedDigest };
  try {
    let current = response(await agentRequest({ protocol: "ghostget.approval/1", action: "request", id: lease.id, target, expectedDigest }, options), lease);
    const deadline = Date.now() + 120000;
    while (current.status === "pending" && Date.now() < deadline) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          options.signal?.removeEventListener("abort", abort);
          resolve();
        }, 400);
        const abort = () => {
          clearTimeout(timer);
          reject(new ControlError("REQUEST_CANCELLED", "The request was cancelled."));
        };
        if (options.signal?.aborted) {
          abort();
          return;
        }
        options.signal?.addEventListener("abort", abort, { once: true });
      });
      current = response(await agentRequest({ protocol: "ghostget.approval/1", action: "check", ...lease }, options), lease);
    }
    if (current.status !== "allowed")
      throw new ControlError("APPROVAL_REQUIRED", "This operation was not approved. Review it in Ghostget and retry explicitly.");
    return lease;
  } catch (error) {
    await releaseApproval(lease, options).catch(() => {
      return;
    });
    throw error;
  }
}
async function checkApproval(lease, options) {
  if (response(await agentRequest({ protocol: "ghostget.approval/1", action: "check", ...lease }, options), lease).status !== "allowed")
    throw new ControlError("APPROVAL_EXPIRED", "The exact approval is no longer valid.");
}
async function releaseApproval(lease, options) {
  await agentRequest({ protocol: "ghostget.approval/1", action: "cancel", ...lease }, options);
}
export {
  requestApproval,
  releaseApproval,
  controlSocketPath,
  checkApproval,
  agentRequest
};
