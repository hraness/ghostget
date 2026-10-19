import { connect, createServer, type Server, type Socket } from "node:net";
import { chmodSync, lstatSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { canonicalJson, sha256 } from "../canonical-json";
import { createPrivateJsonIfAbsent, ghostgetStateHome, readPrivateStateFileIfPresent, removePrivateStateFileIfUnchanged, snapshotPrivateStateDirectory, type PrivateDirectoryIdentity } from "../storage";
import type { HelperClient } from "./helper-client";
import { parseHelperEnvelope } from "./helper-client";
import { CONTROL_PROTOCOL, type ControlRequest, type ControlResponse } from "./protocol";
import { controlFailure } from "./service";
import { ControlError, controlResponseLine, identifier, keys, parseControlRequest, record } from "./validation";
import type { ControlEnvironment } from "./web-policy";

/**
 * The owner's administrative socket. It carries the same closed
 * `ControlRequest` union as the controller's private stdio channel, plus
 * `control.stop`. The socket is 0600 inside the 0700 control directory, and
 * every frame must carry the 0600 `admin.cap` capability that this owner
 * wrote at startup. Neither is a boundary against processes of the same
 * user: human-bound decisions are gated in the CLI verb (T1+T2), see
 * docs/cli-parity.md.
 */
export const ADMIN_STOP = "control.stop";
const MAX_FRAME = 262_144;
const MAX_RESPONSE = 4_194_304;
const CAP_PATTERN = /^[0-9a-f]{64}$/u;

export function controlDirectory(environment: ControlEnvironment): string { return join(ghostgetStateHome(environment), "control"); }
export function adminSocketPath(environment: ControlEnvironment): string { return join(controlDirectory(environment), "admin.sock"); }
export function adminCapabilityPath(environment: ControlEnvironment): string { return join(controlDirectory(environment), "admin.cap"); }

type AdminFrame = { readonly id: string; readonly request: ControlRequest | typeof ADMIN_STOP };

/** Parse one admin frame from `unknown`, checking the capability in constant time. */
export function parseAdminFrame(value: unknown, capability: string): AdminFrame {
  const v = record(value);
  keys(v, ["cap", "id", "protocol", "request"]);
  if (typeof v.cap !== "string" || !CAP_PATTERN.test(v.cap) || !timingSafeEqual(Buffer.from(v.cap), Buffer.from(capability))) throw new ControlError("CONTROL_CAPABILITY", "The control capability did not match this owner.");
  if (v.protocol !== CONTROL_PROTOCOL) throw new ControlError("INVALID_REQUEST", "The control protocol is not supported.");
  const id = identifier(v.id);
  const request = record(v.request);
  if (request.action === ADMIN_STOP) { keys(request, ["action"]); return { id, request: ADMIN_STOP }; }
  return { id, request: parseControlRequest(request) };
}

export interface AdminServer {
  /** Stop accepting and destroy open connections; running work is awaited by the caller through `active`. */
  close(): Promise<void>;
  /** Remove the socket and capability only while they are still this owner's. */
  removeOwned(): void;
}

export interface AdminServerOptions {
  readonly environment: ControlEnvironment;
  readonly directoryIdentity: PrivateDirectoryIdentity;
  readonly handle: (request: ControlRequest) => Promise<ControlResponse>;
  readonly stop: () => void;
  readonly active: Set<Promise<void>>;
  readonly closing: () => boolean;
}

function removeCapabilityIfPresent(path: string, environment: ControlEnvironment): void {
  const previous = readPrivateStateFileIfPresent(path, 2048, "control capability", environment);
  if (previous !== null) removePrivateStateFileIfUnchanged(path, { expectedCurrentContentSha256: sha256(previous) }, environment);
}

/**
 * Bind `admin.sock` and write a fresh `admin.cap`. The caller already holds
 * owner custody (owner.json), so a leftover socket or capability belongs to
 * an owner that is verifiably gone; a live socket still refuses.
 */
export async function startAdminServer(options: AdminServerOptions): Promise<AdminServer> {
  const { environment, directoryIdentity } = options;
  const directory = controlDirectory(environment);
  const socketPath = adminSocketPath(environment);
  const capPath = adminCapabilityPath(environment);
  if (Buffer.byteLength(socketPath) > 100) throw new ControlError("CONTROL_PATH_TOO_LONG", "Choose a shorter Ghostget state-home path for the control owner.");
  let stale: ReturnType<typeof lstatSync> | undefined;
  try { stale = lstatSync(socketPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (stale !== undefined) {
    if (!stale.isSocket() || stale.uid !== process.getuid?.() || (Number(stale.mode) & 0o777) !== 0o600 || await socketAnswers(socketPath)) throw new ControlError("CONTROL_ALREADY_RUNNING", "The admin socket is already in use or unsafe.");
    snapshotPrivateStateDirectory(directory, environment, directoryIdentity);
    const current = lstatSync(socketPath);
    if (current.dev !== stale.dev || current.ino !== stale.ino) throw new Error("socket changed");
    unlinkSync(socketPath);
  }
  removeCapabilityIfPresent(capPath, environment);
  const capability = randomBytes(32).toString("hex");
  const capRecord = { schema: 1, cap: capability };
  if (!createPrivateJsonIfAbsent(capPath, capRecord, { environment }).created) throw new ControlError("CONTROL_ALREADY_RUNNING", "Another Ghostget owner wrote the control capability.");
  const capDigest = sha256(`${canonicalJson(capRecord)}\n`);
  const clients = new Set<Socket>();
  const server: Server = createServer((socket) => {
    if (options.closing() || clients.size >= 16) { socket.destroy(); return; }
    clients.add(socket);
    let buffer = Buffer.alloc(0); let started = false;
    socket.setTimeout(150_000, () => socket.destroy());
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => undefined);
    socket.on("data", (chunk) => {
      if (started) { socket.destroy(); return; }
      buffer = Buffer.concat([buffer, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
      if (buffer.length > MAX_FRAME) { socket.destroy(); return; }
      const newline = buffer.indexOf(10); if (newline < 0) return;
      started = true;
      const work = (async () => {
        let id = "invalid"; let response: ControlResponse; let stop = false;
        try {
          if (newline !== buffer.length - 1) throw new ControlError("INVALID_REQUEST", "Send one control request per connection.");
          const frame = parseAdminFrame(JSON.parse(buffer.subarray(0, newline).toString("utf8")), capability);
          id = frame.id;
          if (frame.request === ADMIN_STOP) { stop = true; response = { ok: true, data: { kind: "success", message: "Ghostget control owner is stopping." } }; }
          else response = await options.handle(frame.request);
        } catch (error) { response = controlFailure(error); }
        if (!socket.destroyed) socket.end(controlResponseLine(id, response));
        if (stop) options.stop();
      })();
      options.active.add(work);
      void work.then(() => options.active.delete(work), () => options.active.delete(work));
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, () => { server.off("error", reject); resolve(); }); });
  chmodSync(socketPath, 0o600);
  const owned = lstatSync(socketPath);
  return {
    close: async () => {
      const closes: Promise<void>[] = [];
      for (const socket of clients) { if (socket.closed) continue; closes.push(new Promise<void>((resolve) => socket.once("close", () => resolve()))); socket.destroy(); }
      await Promise.all(closes);
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    },
    removeOwned: () => {
      snapshotPrivateStateDirectory(directory, environment, directoryIdentity);
      try { const stat = lstatSync(socketPath); if (stat.isSocket() && stat.dev === owned.dev && stat.ino === owned.ino) unlinkSync(socketPath); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      try { removePrivateStateFileIfUnchanged(capPath, { expectedCurrentContentSha256: capDigest }, environment); } catch { /* another owner's record is never removed */ }
    },
  };
}

function socketAnswers(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path });
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("socket state unknown")); }, 1000);
    socket.once("connect", () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.once("error", (error) => { clearTimeout(timer); socket.destroy(); const code = (error as NodeJS.ErrnoException).code; if (code === "ECONNREFUSED" || code === "ENOENT") resolve(false); else reject(new Error("socket state unknown")); });
  });
}

function readCapability(environment: ControlEnvironment): string | null {
  const text = readPrivateStateFileIfPresent(adminCapabilityPath(environment), 2048, "control capability", environment);
  if (text === null) return null;
  const v = record(JSON.parse(text)); keys(v, ["schema", "cap"]);
  if (v.schema !== 1 || typeof v.cap !== "string" || !CAP_PATTERN.test(v.cap)) throw new Error("invalid capability");
  return v.cap;
}

/** Whether a control owner answers on the admin socket. Never signals any process. */
export async function adminOwnerRunning(environment: ControlEnvironment): Promise<boolean> {
  try {
    snapshotPrivateStateDirectory(controlDirectory(environment), environment);
    const stat = lstatSync(adminSocketPath(environment));
    if (!stat.isSocket() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600) return false;
    if (readCapability(environment) === null) return false;
    return await socketAnswers(adminSocketPath(environment));
  } catch { return false; }
}

/** Send one admin request. Every failure becomes a typed `ControlResponse`; nothing is retried. */
export async function adminRequest(environment: ControlEnvironment, request: ControlRequest | typeof ADMIN_STOP, timeoutMs: number = 15_000): Promise<ControlResponse> {
  let capability: string | null;
  try {
    snapshotPrivateStateDirectory(controlDirectory(environment), environment);
    const stat = lstatSync(adminSocketPath(environment));
    if (!stat.isSocket() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600) throw new Error();
    capability = readCapability(environment);
    if (capability === null) throw new Error();
  } catch { return { ok: false, code: "CONTROL_OWNER_UNAVAILABLE", message: "No Ghostget control owner is running. Start one with ghostget control serve." }; }
  const id = randomUUID();
  const line = Buffer.from(`${JSON.stringify({ cap: capability, id, protocol: CONTROL_PROTOCOL, request: request === ADMIN_STOP ? { action: ADMIN_STOP } : request })}\n`);
  if (line.length > MAX_FRAME) return { ok: false, code: "INVALID_REQUEST", message: "The control request exceeds its size limit." };
  return await new Promise<ControlResponse>((resolve) => {
    const socket = connect({ path: adminSocketPath(environment) });
    let received = Buffer.alloc(0); let settled = false;
    const finish = (response: ControlResponse): void => { if (settled) return; settled = true; clearTimeout(timer); socket.destroy(); resolve(response); };
    const timer = setTimeout(() => finish({ ok: false, code: "CONTROL_TIMEOUT", message: "The control request did not finish in time. Its outcome may be uncertain. Refresh state before starting another action; do not retry it automatically." }), timeoutMs);
    socket.once("connect", () => socket.write(line));
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
      if (received.length > MAX_RESPONSE) { finish({ ok: false, code: "INVALID_RESPONSE", message: "The owner response exceeded its limit." }); return; }
      const end = received.indexOf(10); if (end < 0) return;
      try {
        if (received.length !== end + 1) throw new Error();
        const frame = parseHelperEnvelope(received.subarray(0, end).toString("utf8"));
        if (frame.id !== id) throw new Error();
        const { id: _id, protocol: _protocol, ...response } = frame;
        finish(response as ControlResponse);
      } catch { finish({ ok: false, code: "INVALID_RESPONSE", message: "The owner response was invalid." }); }
    });
    socket.once("error", () => finish({ ok: false, code: "CONTROL_DISCONNECTED", message: "The Ghostget control owner disconnected." }));
    socket.once("end", () => finish({ ok: false, code: "CONTROL_DISCONNECTED", message: "The Ghostget control owner disconnected." }));
  });
}

/** A `HelperClient` over the admin socket, so the TUI and verbs share one port. */
export function adminClient(environment: ControlEnvironment): HelperClient {
  return { request: (request, timeoutMs) => adminRequest(environment, request, timeoutMs), close: () => undefined };
}
