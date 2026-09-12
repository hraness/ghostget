import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, link, lstat, mkdtemp, open, realpath, rmdir, unlink } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { GhostgetAuth } from "../auth";
import { canonicalJson } from "../canonical-json";
import type { LocalCliExecutionOptions } from "../local-cli-execution";
import { automationDigest, automationRecord, automationText } from "../messaging-automation-validation";
import { startProviderPluginCleanupTrackedOperation, type ProviderPluginCleanupProofController } from "../provider-plugin-cleanup-execution";
import { attachLocalCliCleanupProcessGroup, captureLocalCliCleanupResource, localCliCleanupProcessGroupStatus, type LocalCliCleanupResourceIdentityV1 } from "../provider-plugin-cleanup-resource";
import { assertSafeStatePath, ensurePrivateStateDirectory, ghostgetStateHome } from "../storage";
import { validateWhatsAppStoreDirectory } from "./whatsapp-web-runtime";

export const WHATSAPP_AUTOMATION_PROTOCOL = "ghostget.whatsapp-private/1" as const;
export const WHATSAPP_AUTOMATION_VERSION = "0.15.0+ghostget-private.1" as const;
// Pinned from the exact vendored patch, full plain/FTS suites, vet, and two
// byte-identical builds recorded in the private transport provenance.
export const WHATSAPP_AUTOMATION_BINARY_SHA256 = "9b77ffb810d028fde725ca02b1451f1725b5ff5312a46a54468a9a38533d4cea";
const directJid = /^(?:[1-9][0-9]{4,14}@s\.whatsapp\.net|[1-9][0-9]{4,19}@lid)$/u;
const sha = (value: unknown): string => createHash("sha256").update(canonicalJson(value)).digest("hex");
type LinkedAuth = Extract<GhostgetAuth, { kind: "linked-device-store" }>;
export type WhatsAppAutomationSnapshot = Readonly<{ account: string; subject: string; sourceGeneration: string; ledgerReady: boolean; connected: boolean; generation: string | null }>;
export type WhatsAppPrivateRequest = Readonly<{ protocol: typeof WHATSAPP_AUTOMATION_PROTOCOL; kind: "status" | "text" | "file" | "react" | "sticker" | "poll"; requestId: string; generation: string; account: string; to: string; message: string; file: string; filename: string; mime: string; id: string; reaction: string; question: string; options: readonly string[]; selectable: number }>;
export type WhatsAppPrivateResponse = Readonly<{ protocol: typeof WHATSAPP_AUTOMATION_PROTOCOL; requestId: string; generation: string; account: string; state: "ready" | "accepted" | "not-started" | "indeterminate"; to: string; messageId: string; connected: boolean }>;
export interface WhatsAppAutomationRuntime {
  read<T>(auth: GhostgetAuth, work: (database: Database, snapshot: WhatsAppAutomationSnapshot) => T, signal?: AbortSignal): Promise<T>;
  start(auth: GhostgetAuth, beforeSpawn: () => Promise<void>, signal?: AbortSignal): Promise<void>;
  request(request: WhatsAppPrivateRequest, signal?: AbortSignal, beforeWrite?: () => Promise<void>): Promise<WhatsAppPrivateResponse>;
  stage(bytes: Uint8Array, digest: string): Promise<{ path: string; close(): Promise<void> }>;
  close(): Promise<void>;
}

function linked(auth: GhostgetAuth): LinkedAuth {
  if (auth.kind !== "linked-device-store" || auth.provider !== "whatsapp" || !auth.subject) throw new Error("A bound WhatsApp linked-device account is required");
  return auth;
}
function accountSubject(jid: string): string {
  if (!directJid.test(jid)) throw new Error("Unsupported WhatsApp account identity");
  return `whatsapp:${jid.endsWith("@lid") ? "lid" : "pn"}:${jid.split("@")[0]}`;
}
function accountJid(value: unknown): string {
  const jid = automationText(value, 128);
  // The session table stores the current device suffix. Only this account
  // coordinate is normalized; recipient JIDs are never rewritten.
  const normalized = jid.replace(/:[0-9]{1,5}(?=@(?:s\.whatsapp\.net|lid)$)/u, "");
  accountSubject(normalized); return normalized;
}
async function privateFile(path: string): Promise<{ dev: string; ino: string; birthtimeNs: string }> {
  const info = await lstat(path, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== BigInt(process.getuid!()) || info.nlink !== 1n || (info.mode & 0o777n) !== 0o600n || info.size < 1n || info.size > 4_294_967_296n || info.birthtimeNs <= 0n || await realpath(path) !== path) throw new Error("Unsafe WhatsApp source file");
  return { dev: String(info.dev), ino: String(info.ino), birthtimeNs: String(info.birthtimeNs) };
}
async function binaryBytes(path: string): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > 128 * 1024 * 1024 || (before.mode & 0o022) !== 0 || (before.mode & 0o111) === 0 || ![0, process.getuid!()].includes(before.uid)) throw new Error("Unsafe WhatsApp automation executable");
    const bytes = await file.readFile(), after = await file.stat();
    if (bytes.length !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error("WhatsApp automation executable changed");
    return bytes;
  } finally { await file.close(); }
}
async function binaryDigest(path: string): Promise<string> { return createHash("sha256").update(await binaryBytes(path)).digest("hex"); }
export function whatsappAutomationBinaryPath(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("The reviewed WhatsApp automation build requires Apple silicon macOS");
  return join(ghostgetStateHome(environment), "tools", "wacli-private", WHATSAPP_AUTOMATION_VERSION, "darwin-arm64", "wacli");
}
export async function resolveWhatsAppAutomationBinary(environment: Readonly<Record<string, string | undefined>> = process.env): Promise<string> {
  const path = whatsappAutomationBinaryPath(environment);
  if (await realpath(path) !== path || await binaryDigest(path) !== WHATSAPP_AUTOMATION_BINARY_SHA256) throw new Error("The reviewed one-attempt WhatsApp automation runtime is not installed");
  return path;
}
/** Owner setup installs only the admitted bytes. It never replaces a different
 * existing runtime or starts the linked-device session. */
export async function installReviewedWhatsAppAutomationBinary(source: string, environment: Readonly<Record<string, string | undefined>> = process.env): Promise<{ version: string; sha256: string }> {
  if (!isAbsolute(source)) throw new Error("WhatsApp automation install source must be absolute");
  const bytes = await binaryBytes(source);
  if (createHash("sha256").update(bytes).digest("hex") !== WHATSAPP_AUTOMATION_BINARY_SHA256) throw new Error("WhatsApp automation install source does not match the reviewed build");
  const destination = whatsappAutomationBinaryPath(environment);
  ensurePrivateStateDirectory(dirname(destination), environment); assertSafeStatePath(destination, environment, false);
  try { await lstat(destination); if (await binaryDigest(destination) !== WHATSAPP_AUTOMATION_BINARY_SHA256) throw new Error("WhatsApp automation install destination contains different bytes"); return { version: WHATSAPP_AUTOMATION_VERSION, sha256: WHATSAPP_AUTOMATION_BINARY_SHA256 }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temporary = join(dirname(destination), `.wacli-install-${randomBytes(16).toString("hex")}`);
  const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o500);
  try {
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    try { await link(temporary, destination); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  } finally { await unlink(temporary); }
  const directory = await open(dirname(destination), constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); }
  await resolveWhatsAppAutomationBinary(environment);
  return { version: WHATSAPP_AUTOMATION_VERSION, sha256: WHATSAPP_AUTOMATION_BINARY_SHA256 };
}

export function parseWhatsAppPrivateResponse(value: unknown): WhatsAppPrivateResponse {
  const row = automationRecord(value, ["protocol", "requestId", "generation", "account", "state", "to", "messageId", "connected"]);
  if (row.protocol !== WHATSAPP_AUTOMATION_PROTOCOL || !["ready", "accepted", "not-started", "indeterminate"].includes(String(row.state)) || typeof row.connected !== "boolean") throw new Error("Unsupported WhatsApp transport response");
  for (const field of ["requestId", "to", "messageId"] as const) if (typeof row[field] !== "string" || Buffer.byteLength(row[field]) > 256 || /[\u0000-\u001f\u007f]/u.test(row[field])) throw new Error("Invalid WhatsApp receipt field");
  const generation = automationDigest(row.generation), account = automationText(row.account, 128);
  if (!directJid.test(account) || row.requestId !== "" && !/^[a-f0-9]{64}$/u.test(row.requestId as string) || row.to !== "" && !directJid.test(row.to as string) || row.state === "accepted" && (row.messageId === "" || row.requestId === "" || row.to === "")) throw new Error("Invalid WhatsApp receipt identity");
  return { protocol: WHATSAPP_AUTOMATION_PROTOCOL, requestId: row.requestId as string, generation, account, state: row.state as WhatsAppPrivateResponse["state"], to: row.to as string, messageId: row.messageId as string, connected: row.connected };
}
const blankStatus = (): WhatsAppPrivateRequest => ({ protocol: WHATSAPP_AUTOMATION_PROTOCOL, kind: "status", requestId: "", generation: "", account: "", to: "", message: "", file: "", filename: "", mime: "", id: "", reaction: "", question: "", options: [], selectable: 0 });
async function socketRequest(path: string, identity: { dev: number; ino: number }, request: WhatsAppPrivateRequest, signal?: AbortSignal, beforeWrite?: () => Promise<void>): Promise<WhatsAppPrivateResponse> {
  signal?.throwIfAborted();
  const info = await lstat(path);
  if (!info.isSocket() || info.isSymbolicLink() || info.uid !== process.getuid!() || (info.mode & 0o777) !== 0o600 || info.dev !== identity.dev || info.ino !== identity.ino) throw new Error("WhatsApp transport ownership changed");
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path }); let bytes = Buffer.alloc(0), settled = false;
    const finish = (error?: Error, response?: WhatsAppPrivateResponse): void => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); socket.destroy(); error ? reject(error) : resolve(response!); };
    const abort = (): void => finish(new Error("WhatsApp transport request was interrupted"));
    const timer = setTimeout(() => finish(new Error("WhatsApp transport response deadline exceeded")), 55_000);
    signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) { abort(); return; }
    socket.on("error", () => finish(new Error("WhatsApp transport connection failed")));
    socket.on("close", () => { if (!settled) finish(new Error("WhatsApp transport closed without a receipt")); });
    socket.on("connect", () => { void (async () => {
      await beforeWrite?.(); signal?.throwIfAborted(); if (settled) return;
      const current = await lstat(path);
      if (!current.isSocket() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino || current.uid !== process.getuid!() || (current.mode & 0o777) !== 0o600) throw new Error("WhatsApp socket changed after connection");
      signal?.throwIfAborted(); if (settled) return;
      const payload = Buffer.from(JSON.stringify(request) + "\n"); if (payload.length > 1_048_576) finish(new Error("WhatsApp request exceeds its byte bound")); else socket.write(payload);
    })().catch(() => finish(new Error("WhatsApp request admission changed before writing"))); });
    socket.on("data", chunk => {
      if (!Buffer.isBuffer(chunk)) { finish(new Error("WhatsApp response was not bytes")); return; }
      if (bytes.length + chunk.length > 4096) { finish(new Error("WhatsApp response exceeds its byte bound")); return; }
      bytes = Buffer.concat([bytes, chunk]); const newline = bytes.indexOf(10);
      if (newline < 0) return;
      try {
        if (newline !== bytes.length - 1) throw new Error("Trailing WhatsApp response data");
        const response = parseWhatsAppPrivateResponse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, newline))));
        if (request.kind === "status" ? response.state !== "ready" || response.requestId !== "" || response.to !== "" || response.messageId !== "" : response.requestId !== request.requestId || response.to !== request.to || response.account !== request.account || response.generation !== request.generation || response.state === "ready") throw new Error("WhatsApp response did not bind its request");
        finish(undefined, response);
      } catch { finish(new Error("WhatsApp transport returned a malformed receipt")); }
    });
  });
}
const sleep = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Owns only an explicitly started, exact pinned child. Existing sockets are
 * never adopted or removed. A failed cleanup retains its durable resource. */
export function createWhatsAppAutomationRuntime(execution: Pick<LocalCliExecutionOptions, "registerCleanupBarrier" | "environment">): WhatsAppAutomationRuntime {
  let child: Bun.Subprocess<"ignore", "ignore", "ignore"> | undefined;
  let resource: LocalCliCleanupResourceIdentityV1 | undefined, cleanup: ProviderPluginCleanupProofController | undefined;
  let socket: { path: string; dev: number; ino: number } | undefined;
  let authHash: string | undefined, root: string | undefined, closed = false, closing: Promise<void> | undefined;
  const staged = new Set<string>();
  const runtime: WhatsAppAutomationRuntime = {
    async read(auth, work, signal) {
      signal?.throwIfAborted(); if (closed) throw new Error("WhatsApp automation runtime is closed");
      const selected = linked(auth), store = await validateWhatsAppStoreDirectory(selected.path, "projection");
      const messagesPath = join(store, "wacli.db"), sessionPath = join(store, "session.db");
      const before = [await privateFile(messagesPath), await privateFile(sessionPath)];
      const session = new Database(sessionPath, { readonly: true, strict: true });
      let account: string;
      try { const devices = session.query("SELECT jid FROM whatsmeow_device LIMIT 2").all(); if (devices.length !== 1) throw new Error("WhatsApp session must select exactly one account"); account = accountJid(automationRecord(devices[0], ["jid"]).jid); } finally { session.close(); }
      const subject = accountSubject(account); if (selected.subject !== subject) throw new Error("WhatsApp linked-device account changed");
      let connected = false, generation: string | null = null;
      if (socket && child && child.exitCode === null && authHash === sha(auth)) { const status = await runtime.request(blankStatus(), signal); if (status.account !== account) throw new Error("WhatsApp connection account changed"); connected = status.connected; generation = status.generation; }
      const database = new Database(messagesPath, { readonly: true, strict: true });
      try {
        database.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=1000; BEGIN");
        const available = database.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ghostget_automation_state'").get();
        let ledger: string | null = null;
        if (available) { const state = automationRecord(database.query("SELECT version,generation FROM ghostget_automation_state WHERE singleton=1").get(), ["version", "generation"]); if (state.version !== 1) throw new Error("Unsupported WhatsApp event schema"); ledger = automationDigest(state.generation); }
        const snapshot = { account, subject, sourceGeneration: sha({ files: before, ledger }), ledgerReady: ledger !== null, connected, generation };
        const result = work(database, snapshot); database.exec("COMMIT");
        if (sha(before) !== sha([await privateFile(messagesPath), await privateFile(sessionPath)])) throw new Error("WhatsApp database generation changed during the read");
        signal?.throwIfAborted(); return result;
      } finally { database.close(); }
    },
    async start(auth, beforeSpawn, signal) {
      if (closed || child || root) throw new Error("WhatsApp automation has already been started or closed");
      if (!execution.registerCleanupBarrier) throw new Error("WhatsApp automation requires durable process custody");
      const selected = linked(auth), store = await validateWhatsAppStoreDirectory(selected.path, "projection");
      await runtime.read(auth, () => undefined, signal);
      const binary = await resolveWhatsAppAutomationBinary(execution.environment);
      await startProviderPluginCleanupTrackedOperation(execution.registerCleanupBarrier, async (publish, controller) => {
        cleanup = controller;
        try {
          root = await mkdtemp(join(await realpath(tmpdir()), "wrench-whatsapp-automation-")); await chmod(root, 0o700);
          resource = captureLocalCliCleanupResource(root); publish?.(resource);
          const socketPath = join(root, ".s");
          if (Buffer.byteLength(socketPath) > 100) throw new Error("WhatsApp private runtime directory exceeds the Unix socket path bound");
          await beforeSpawn(); signal?.throwIfAborted();
          if (await binaryDigest(binary) !== WHATSAPP_AUTOMATION_BINARY_SHA256) throw new Error("WhatsApp automation binary changed before launch");
          child = Bun.spawn([binary, "--store", store, "--json", "--full", "sync", "--follow", "--presence-mode", "quiet", "--max-reconnect", "1m", "--max-messages", "200000", "--max-db-size", "2GB", "--ghostget-private-transport", "--ghostget-private-socket", socketPath], { stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true, env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" } });
          resource = attachLocalCliCleanupProcessGroup(resource, child.pid); publish?.(resource); authHash = sha(auth);
          const until = Date.now() + 30_000;
          while (Date.now() < until) {
            signal?.throwIfAborted(); if (child.exitCode !== null) throw new Error("WhatsApp connection exited during startup");
            try { const info = await lstat(socketPath); if (!info.isSocket() || info.uid !== process.getuid!() || (info.mode & 0o777) !== 0o600) throw new Error("Unsafe WhatsApp private socket"); socket = { path: socketPath, dev: info.dev, ino: info.ino }; const status = await runtime.request(blankStatus(), signal); if (status.connected && accountSubject(status.account) === selected.subject) return; throw new Error("WhatsApp connection did not match the selected account"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
            await sleep(50);
          }
          throw new Error("WhatsApp connection did not become ready within its deadline");
        } catch (error) { await runtime.close(); throw error; }
      });
    },
    async request(request, signal, beforeWrite) {
      if (closed || !socket || !child || child.exitCode !== null) throw new Error("The owned WhatsApp connection is unavailable");
      return socketRequest(socket.path, socket, request, signal, beforeWrite);
    },
    async stage(bytes, digest) {
      const snapshot = Buffer.from(bytes);
      if (closed || !root || !child || child.exitCode !== null || snapshot.byteLength < 1 || snapshot.byteLength > 20 * 1024 * 1024 || createHash("sha256").update(snapshot).digest("hex") !== automationDigest(digest)) throw new Error("WhatsApp asset is unavailable or changed");
      const path = join(root, `asset-${randomBytes(16).toString("hex")}`), file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await file.writeFile(snapshot); await file.sync(); } finally { await file.close(); }
      const identity = await lstat(path); staged.add(path);
      return { path, async close() { if (!staged.has(path)) return; const current = await lstat(path); if (current.dev !== identity.dev || current.ino !== identity.ino || !current.isFile() || current.nlink !== 1) throw new Error("WhatsApp staged asset changed"); await unlink(path); staged.delete(path); } };
    },
    close() {
      if (closing) return closing;
      closed = true;
      closing = (async () => {
        try {
          if (child) {
            if (child.exitCode === null) { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); } }
            const until = Date.now() + 55_000;
            while (child.exitCode === null && Date.now() < until) await sleep(20);
            if (child.exitCode === null) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
            const reapUntil = Date.now() + 5_000;
            while (child.exitCode === null && Date.now() < reapUntil) await sleep(20);
            if (child.exitCode === null) throw new Error("WhatsApp process did not join");
            await child.exited;
            if (!resource || localCliCleanupProcessGroupStatus(resource) !== "quiescent") throw new Error("WhatsApp process group cleanup is unverified");
          }
          if (socket) {
            try { const current = await lstat(socket.path); if (!current.isSocket() || current.dev !== socket.dev || current.ino !== socket.ino || current.uid !== process.getuid!()) throw new Error("WhatsApp private socket changed before cleanup"); await unlink(socket.path); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
          }
          if (staged.size > 0) throw new Error("WhatsApp assets are still in use");
          if (root) await rmdir(root);
          cleanup?.verified();
        } catch (error) { cleanup?.unsafe(error); throw error; }
      })(); return closing;
    },
  };
  return runtime;
}
