import { MessageChannel, Worker, receiveMessageOnPort, type MessagePort } from "node:worker_threads";

/**
 * Synchronous line-delimited requests to long-lived helper processes.
 *
 * Ghostget's private-state and path helpers are isolated processes bound to
 * one directory. Starting one per operation costs a runtime start and module
 * load each time, and the storage API is synchronous. This bridge keeps one
 * helper per exact key alive inside a worker thread and blocks the caller on
 * an Atomics wait until that helper answers the single outstanding request.
 * Callers keep every per-request validation; the bridge only moves bytes.
 */
export type PersistentHelperSpec = Readonly<{
  executable: string;
  arguments: readonly string[];
  cwd: string;
  environment: Readonly<Record<string, string>>;
}>;
export type PersistentHelperResult =
  | Readonly<{ kind: "response"; line: string }>
  | Readonly<{ kind: "failed"; detail: string }>;

const MAX_RESPONSE_BYTES = 180 * 1024 * 1024;
const IDLE_MS = 30_000;

const WORKER_SOURCE = `
const { workerData } = require("node:worker_threads");
const { spawn } = require("node:child_process");
const flag = new Int32Array(workerData.control);
const port = workerData.port;
const MAX = ${MAX_RESPONSE_BYTES}, IDLE = ${IDLE_MS};
const helpers = new Map();
const answer = (message) => { port.postMessage(message); Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); };
const retire = (key, helper) => {
  if (helpers.get(key) === helper) helpers.delete(key);
  clearTimeout(helper.idle);
  try { helper.child.stdin.end(); } catch {}
  try { process.kill(helper.child.pid, "SIGKILL"); } catch {}
};
const start = (key, spec) => {
  const child = spawn(spec.executable, spec.arguments, { cwd: spec.cwd, env: spec.environment, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const helper = { child, chunks: [], bytes: 0, stderr: "", waiting: null, idle: undefined };
  child.stdout.on("data", (chunk) => {
    helper.chunks.push(chunk); helper.bytes += chunk.length;
    if (helper.bytes > MAX) { const waiting = helper.waiting; helper.waiting = null; retire(key, helper); if (waiting) answer({ id: waiting, kind: "failed", detail: "helper response exceeded its byte bound" }); return; }
    const text = Buffer.concat(helper.chunks);
    const newline = text.indexOf(10);
    if (newline < 0) return;
    const line = text.subarray(0, newline).toString("utf8");
    const rest = text.subarray(newline + 1);
    helper.chunks = rest.length ? [rest] : []; helper.bytes = rest.length;
    const waiting = helper.waiting; helper.waiting = null;
    // A helper that answered with a failure exits by design; retire it now so
    // the next request never races its shutdown.
    if (!waiting || line.startsWith('{"ok":false')) retire(key, helper);
    if (waiting) answer({ id: waiting, kind: "response", line });
  });
  child.stderr.on("data", (chunk) => { if (helper.stderr.length < 4096) helper.stderr += chunk.toString("utf8"); });
  const lost = () => {
    if (helpers.get(key) === helper) helpers.delete(key);
    clearTimeout(helper.idle);
    const waiting = helper.waiting; helper.waiting = null;
    if (waiting) answer({ id: waiting, kind: "failed", detail: helper.stderr.trim().slice(0, 512) });
  };
  // "close" fires only after stdout drained, so a final answer line is never lost to "exit".
  child.on("error", lost); child.on("close", lost);
  child.stdin.on("error", () => {});
  helpers.set(key, helper);
  return helper;
};
port.on("message", (message) => {
  if (message.type === "retire") { const helper = helpers.get(message.key); if (helper) retire(message.key, helper); return; }
  let helper = helpers.get(message.key);
  if (!helper || helper.child.exitCode !== null || helper.child.signalCode !== null) helper = start(message.key, message.spec);
  clearTimeout(helper.idle);
  helper.idle = setTimeout(() => retire(message.key, helper), IDLE); helper.idle.unref?.();
  helper.waiting = message.id;
  helper.child.stdin.write(message.line + "\\n");
});
`;

type Bridge = { worker: Worker; port: MessagePort; flag: Int32Array; sequence: number };
let bridge: Bridge | undefined;
function current(): Bridge {
  if (bridge !== undefined) return bridge;
  const control = new SharedArrayBuffer(4);
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { control, port: port2 }, transferList: [port2] });
  worker.unref();
  bridge = { worker, port: port1, flag: new Int32Array(control), sequence: 0 };
  worker.on("exit", () => { if (bridge?.worker === worker) bridge = undefined; });
  return bridge;
}

/** Sends one request line and blocks until its helper answers, fails or times out. */
export function persistentHelperRequest(key: string, spec: PersistentHelperSpec, line: string, timeoutMs: number): PersistentHelperResult {
  if (line.includes("\n")) throw new Error("persistent helper requests must be one line");
  const active = current();
  const id = ++active.sequence;
  Atomics.store(active.flag, 0, 0);
  active.port.postMessage({ type: "request", id, key, spec, line });
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    for (let message = receiveMessageOnPort(active.port); message !== undefined; message = receiveMessageOnPort(active.port)) {
      const value = message.message as { id: number; kind: "response" | "failed"; line?: string; detail?: string };
      // A late answer to an abandoned request never satisfies a newer one.
      if (value.id !== id) continue;
      return value.kind === "response" ? { kind: "response", line: value.line ?? "" } : { kind: "failed", detail: value.detail ?? "" };
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      active.port.postMessage({ type: "retire", key });
      return { kind: "failed", detail: "helper did not answer within its deadline" };
    }
    Atomics.wait(active.flag, 0, 0, Math.min(remaining, 1_000));
    Atomics.store(active.flag, 0, 0);
  }
}
