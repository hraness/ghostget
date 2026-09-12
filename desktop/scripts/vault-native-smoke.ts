import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { processOwnerStatus, type ProcessOwnerIdentity } from "../../src/process-identity.ts";

// Verification only; this file is never copied into the app or exposed by its CLI.
// The nested interpreter roles exercise the real packaged native entry guard.
const script = fileURLToPath(import.meta.url);
const desktop = resolve(dirname(script), "..");
const app = join(desktop, "src-tauri/target/release/bundle/macos/Ghostget.app");
const runtime = join(app, "Contents/Resources/ghostget-runtime");
const guiExecutable = join(app, "Contents/MacOS/ghostget-desktop");
const secureEntryApp = join(app, "Contents/Helpers/Ghostget Secure Entry.app");
const secureEntryExecutable = join(secureEntryApp, "Contents/MacOS/ghostget-desktop");
const control = join(runtime, "ghostget-bun"), credential = join(runtime, "ghostget-credential-bun");
const protocol = "ghostget.vault-native-proof/1";
const cases = ["direct-parent", "wrong-ancestor", "bun-trampoline", "helper-no-flag", "outer-vault-stdio"] as const;
type Case = typeof cases[number];
/** Cancellation starts the real GUI; other commands probe the fixed native entry guards. */
export function nativeVaultProofCommand(which: Case | "cancel-entry"): { executable: string; args: readonly string[] } {
  if (which === "cancel-entry") return { executable: guiExecutable, args: [] };
  if (which === "direct-parent") return { executable: secureEntryExecutable, args: ["--vault-stdio"] };
  if (which === "helper-no-flag") return { executable: secureEntryExecutable, args: [] };
  if (which === "outer-vault-stdio") return { executable: guiExecutable, args: ["--vault-stdio"] };
  return {
    executable: which === "wrong-ancestor" ? credential : control,
    args: ["--no-env-file", "--no-install", script, which === "wrong-ancestor" ? "--credential-role" : "--control-role", which],
  };
}
async function bundleDigests(): Promise<{ guiSha256: string; secureEntrySha256: string; runtimeManifestSha256: string }> {
  const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const [gui, secureEntry, manifest] = await Promise.all([readFile(guiExecutable), readFile(secureEntryExecutable), readFile(join(runtime, "runtime-manifest.json"))]);
  return { guiSha256: hash(gui), secureEntrySha256: hash(secureEntry), runtimeManifestSha256: hash(manifest) };
}
const delay = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
const same = (a: unknown, b: unknown) => assert.deepEqual(a, b);
const categorical = (text: string, code: string) => same(JSON.parse(text), { ok: false, code });
const fixtureFrame = () => `${JSON.stringify({ protocol: "ghostget.secret-store/1", action: "read", purpose: "credential", id: randomUUID(), unexpected: true })}\n`;
async function emit(value: unknown): Promise<void> { await Bun.write(Bun.stdout, `${JSON.stringify({ protocol, ...value as object })}\n`); }
function environment(scratch: string, cancel: boolean): Record<string, string> {
  return { HOME: cancel ? process.env.HOME ?? "" : scratch, TMPDIR: scratch, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", GHOSTGET_STATE_HOME: join(scratch, "state") };
}
function spawn(executable: string, args: readonly string[], env: Record<string, string>, inheritOutput = false) {
  return Bun.spawn([executable, ...args], { cwd: dirname(script), env, stdin: "pipe", stdout: inheritOutput ? "inherit" : "pipe", stderr: "ignore" });
}
async function bounded<T>(operation: Promise<T>, milliseconds: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let interrupt = () => {};
  const cancelled = new Promise<never>((_, reject) => { interrupt = () => reject(new Error("Native vault proof was cancelled")); });
  signal?.addEventListener("abort", interrupt, { once: true }); if (signal?.aborted) interrupt();
  try { return await Promise.race([operation, cancelled, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Native vault proof exceeded its deadline")), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); signal?.removeEventListener("abort", interrupt); }
}
async function output(stream: ReadableStream<Uint8Array>, onFrame?: (frame: Record<string, unknown>) => void): Promise<string> {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0; let pending = "";
  const decoder = new TextDecoder("utf-8", { fatal: true }); let failure: unknown;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      // Reject malformed/noisy output after draining EOF, so a failed assertion
      // cannot itself discard our descendant-exit proof pipe.
      if (failure !== undefined) continue;
      try {
        size += next.value.byteLength; assert.ok(size <= 16384, "Native proof output exceeded its bound"); chunks.push(next.value);
        if (onFrame) {
          pending += decoder.decode(next.value, { stream: true });
          while (pending.includes("\n")) { const end = pending.indexOf("\n"); const value: unknown = JSON.parse(pending.slice(0, end)); assert.ok(value && typeof value === "object" && !Array.isArray(value)); onFrame(value as Record<string, unknown>); pending = pending.slice(end + 1); }
        }
      } catch (error) { failure = error; }
    }
    if (failure !== undefined) throw failure;
    if (onFrame) assert.equal(pending + decoder.decode(), "", "Proof frame did not end cleanly");
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally { reader.releaseLock(); }
}
function identity(value: unknown): ProcessOwnerIdentity {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  const v = value as Record<string, unknown>; same(Object.keys(v).sort(), ["bootId", "pid", "processStartId"]);
  assert.ok(Number.isSafeInteger(v.pid) && (v.pid as number) > 1);
  assert.match(String(v.bootId), /^[a-f0-9]{64}$/u); assert.match(String(v.processStartId), /^[a-f0-9]{64}$/u);
  return { pid: v.pid as number, bootId: v.bootId as string, processStartId: v.processStartId as string };
}
async function gone(owner: ProcessOwnerIdentity, milliseconds = 2500): Promise<boolean> {
  const deadline = performance.now() + milliseconds;
  do { if (processOwnerStatus(owner) === "different-or-dead") return true; await delay(25); } while (performance.now() < deadline);
  return false;
}
async function retire(owner: ProcessOwnerIdentity): Promise<void> {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    const status = processOwnerStatus(owner); if (status === "different-or-dead") return;
    assert.equal(status, "exact-live-owner", "Native proof process ownership is uncertain");
    process.kill(owner.pid, signal); if (await gone(owner)) return;
  }
  throw new Error("Native proof custody is uncertain; its private scratch was retained");
}
async function joinChild(child: { exited: Promise<number>; kill(signal: "SIGTERM" | "SIGKILL"): unknown }): Promise<void> {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    try { child.kill(signal); } catch { /* A joined child may already be gone. */ }
    try { await bounded(child.exited, 3000); return; } catch { /* Escalate once. */ }
  }
  throw new Error("Native proof child could not be joined; private scratch was retained");
}

async function credentialRole(which: Case): Promise<void> {
  assert.equal(await realpath(process.execPath), credential);
  const child = spawn(secureEntryExecutable, ["--vault-stdio"], process.env as Record<string, string>);
  let complete = false;
  const read = output(child.stdout!);
  try {
    child.stdin.write(fixtureFrame()); await child.stdin.end();
    const [text, code] = await bounded(Promise.all([read, child.exited]), 8000);
    assert.equal(code, 1); categorical(text, "UNAVAILABLE");
    await emit({ kind: "result", case: which, nativeExit: code, category: "UNAVAILABLE", joined: true });
    complete = true;
  } finally { if (!complete) { await joinChild(child); await bounded(read.catch(() => ""), 3000); } }
}
async function controlRole(which: Case): Promise<void> {
  assert.equal(await realpath(process.execPath), control);
  const child = spawn(credential, ["--no-env-file", "--no-install", script, "--credential-role", which], process.env as Record<string, string>, true);
  let complete = false;
  try { await child.stdin.end(); assert.equal(await bounded(child.exited, 15000), 0); complete = true; }
  finally { if (!complete) await joinChild(child); }
}
async function observeCancellation(child: ReturnType<typeof spawn>, stateHome: string, owners: ProcessOwnerIdentity[], signal: AbortSignal): Promise<void> {
  const module = (name: string) => import(pathToFileURL(join(runtime, "package/src/control", name)).href);
  const { parseVaultState } = await module("vault-store.ts");
  const { parseNativeCreateReceipt } = await module("vault-custody.ts");
  let exited = false; void child.exited.then(() => { exited = true; });
  const optional = async (path: string): Promise<unknown | null> => { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } };
  const remember = (owner: ProcessOwnerIdentity) => { if (!owners.some(old => old.pid === owner.pid && old.bootId === owner.bootId && old.processStartId === owner.processStartId)) owners.push(owner); };
  let announced = false;
  while (!exited) {
    signal.throwIfAborted();
    const controlOwner = await optional(join(stateHome, "control/owner.json"));
    if (controlOwner && typeof controlOwner === "object") { const v = controlOwner as Record<string, unknown>; remember(identity({ pid: v.pid, bootId: v.bootId, processStartId: v.processStartId })); }
    const raw = await optional(join(stateHome, "control/vault.json"));
    if (raw !== null) {
      const state = parseVaultState(raw); same(state.items, []); same(state.grants, []); same(state.connections, []); assert.ok(state.pending.length <= 1);
      if (state.pending.length === 1) {
        const pending = state.pending[0]; assert.equal(pending.operation, "create"); assert.equal(pending.purpose, "credential"); remember(identity(pending.owner));
        const rawReceipt = await optional(join(stateHome, "control/vault-native-creates", `${pending.id}.json`));
        if (rawReceipt !== null) {
          const receipt = parseNativeCreateReceipt(rawReceipt); assert.equal(receipt.id, pending.id); assert.equal(receipt.purpose, pending.purpose); remember(identity(receipt.nativeOwner));
          if (!announced) { process.stdout.write(`Owned Ghostget Secure Entry process: ${receipt.nativeOwner.pid}. Click Cancel without entering a value.\n`); announced = true; }
          if (receipt.state === "joined") { assert.equal(receipt.outcome, "CANCELLED", "The owned UI must cancel without saving a value"); assert.ok(await gone(pending.owner)); assert.ok(await gone(receipt.nativeOwner)); return; }
        }
      }
    }
    await delay(100);
  }
  throw new Error("The owned GUI exited before a joined native cancellation was observed");
}

/** No Keychain calls in the default suite: every request is rejected before Store::default. */
export async function smokeNativeVault(cancelEntry = false): Promise<void> {
  assert.equal(process.platform, "darwin"); assert.equal(process.arch, "arm64"); assert.equal(Bun.version, "1.3.14");
  for (const path of [app, guiExecutable, secureEntryApp, secureEntryExecutable, control, credential]) assert.equal(await realpath(path), path, "Proof requires the exact canonical built bundle");
  const digests = await bundleDigests();
  const scratch = await realpath(await mkdtemp("/private/tmp/ghostget-vault-native-proof-")); await mkdir(join(scratch, "state"), { mode: 0o700 });
  const env = environment(scratch, cancelEntry); const results: Record<string, unknown>[] = []; let cleanupSafe = false;
  const interrupted = new AbortController(); let activeChild: ReturnType<typeof spawn> | undefined;
  const stop = () => { interrupted.abort(); try { activeChild?.kill("SIGTERM"); } catch { /* Main finally still joins custody. */ } };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    for (const which of cancelEntry ? ["cancel-entry" as const] : cases) {
      interrupted.signal.throwIfAborted();
      const direct = which === "direct-parent" || which === "outer-vault-stdio", gui = which === "cancel-entry", noFlag = which === "helper-no-flag";
      const { executable, args } = nativeVaultProofCommand(which);
      const child = spawn(executable, args, env); const owners: ProcessOwnerIdentity[] = []; let settled = false;
      activeChild = child;
      const read = output(child.stdout!, direct || gui || noFlag ? undefined : frame => {
        assert.equal(frame.protocol, protocol);
        assert.equal(frame.kind, "result"); assert.equal(frame.case, which); assert.equal(frame.joined, true); results.push(frame);
      });
      try {
        if (direct) child.stdin.write(fixtureFrame()); await child.stdin.end();
        if (gui) {
          process.stdout.write(`Owned Ghostget GUI process: ${child.pid}. Isolated state: ${env.GHOSTGET_STATE_HOME}. Open Vault, unlock, add one local password, then click Cancel in the secure native entry without typing a secret.\n`);
          await bounded(observeCancellation(child, env.GHOSTGET_STATE_HOME!, owners, interrupted.signal), 180000, interrupted.signal);
          process.stdout.write("Joined native cancellation observed. Close this owned Ghostget window to complete the proof.\n");
        }
        const [text, code] = await bounded(Promise.all([read, child.exited]), gui ? 30000 : 18000, interrupted.signal);
        if (direct) { assert.equal(code, 1); categorical(text, "UNAVAILABLE"); results.push({ case: which, category: "UNAVAILABLE", joined: true }); }
        else if (noFlag) { assert.equal(code, 1); assert.equal(text, ""); results.push({ case: which, exitCode: code, stdoutEmpty: true, joined: true }); }
        else assert.equal(code, 0);
        if (!gui) same(await readdir(env.GHOSTGET_STATE_HOME!), []);
        for (const owner of owners) assert.ok(await gone(owner), "A native proof descendant remains alive");
        if (gui) {
          assert.equal(text, "");
          const names = await readdir(join(env.GHOSTGET_STATE_HOME!, "control")); assert.ok(!names.includes("owner.json") && !names.includes("agent.sock"));
          results.push({ case: which, nativeOutcome: "CANCELLED", joined: true, items: 0, grants: 0, pending: 1, guiClosed: true, controlCustodyRemoved: true });
        }
        settled = true;
      } finally {
        if (!settled) { for (const owner of owners) await retire(owner); await joinChild(child); await bounded(read.catch(() => ""), 3000); }
        activeChild = undefined;
      }
    }
    assert.equal(results.length, cancelEntry ? 1 : cases.length);
    same(await bundleDigests(), digests);
    const receipt = { schema: "ghostget.native-vault-smoke/2", mode: cancelEntry ? "cancel-entry" : "ancestry", ...digests, keychainItemReads: false, secretValuesEntered: false, providerRequests: false, results };
    await writeFile(join(desktop, "out", cancelEntry ? "vault-native-cancel.json" : "vault-native-smoke.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    cleanupSafe = true;
    process.stdout.write(cancelEntry ? "Genuine GUI native cancellation and durable joined receipt passed.\n" : "Packaged native ancestry and arbitrary-interpreter rejection passed without Keychain item access.\n");
  } finally { process.off("SIGTERM", stop); process.off("SIGINT", stop); if (cleanupSafe) await rm(scratch, { recursive: true, force: true }); }
}

if (import.meta.main) {
  const [mode, which, ...extra] = process.argv.slice(2); assert.equal(extra.length, 0);
  if (mode === "--credential-role" || mode === "--control-role") { assert.ok(cases.includes(which as Case)); if (mode === "--credential-role") await credentialRole(which as Case); else await controlRole(which as Case); }
  else { assert.ok(mode === undefined || mode === "--cancel-entry"); assert.equal(which, undefined); await smokeNativeVault(mode === "--cancel-entry"); }
}
