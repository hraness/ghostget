import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { assertProperty } from "../test-support";
import { ghostgetStateHome } from "../storage";
import { assertNativeCreateSettled, beginNativeCreate, finishNativeCreate, parseNativeCreateReceipt, type NativeCreateOutcome } from "./vault-custody";
import { exchangeNativeCreate, type VaultChild } from "./vault-process";

const ID = "a1234567-1234-4123-8123-123456789abc";
const owner = { pid: 4242, bootId: "a".repeat(64), processStartId: "b".repeat(64) };
const roots: string[] = [];
function fixture() {
  const raw = mkdtempSync(join(tmpdir(), "ghostget-vault-custody-")); chmodSync(raw, 0o700); roots.push(raw);
  const environment = { ...process.env, GHOSTGET_STATE_HOME: raw }; const root = ghostgetStateHome(environment);
  return { environment, root, file: join(root, "control", "vault-native-creates", `${ID}.json`) };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function child(text: string, exit = 0, beforeWrite: () => void = () => undefined) {
  const done = deferred<number>(); let output!: ReadableStreamDefaultController<Uint8Array>; let sent = false; let killed = false;
  const process: VaultChild & { readonly pid: number } = {
    pid: owner.pid,
    stdin: { write() { beforeWrite(); sent = true; }, end() { if (!killed) { output.enqueue(new TextEncoder().encode(text)); output.close(); done.resolve(exit); } } },
    stdout: new ReadableStream({ start(controller) { output = controller; } }), exited: done.promise,
    kill() { if (!killed) { killed = true; try { output.close(); } catch {} done.resolve(1); } },
  };
  return { process, sent: () => sent };
}
test("native create custody admits only exact joined terminal receipts", () => {
  const f = fixture(); expect(() => assertNativeCreateSettled(ID, f.environment)).not.toThrow();
  const handle = beginNativeCreate(ID, "credential", owner, f.environment);
  expect(() => assertNativeCreateSettled(ID, f.environment)).toThrow("Native credential creation could not be confirmed");
  expect(() => beginNativeCreate(ID, "credential", owner, f.environment)).toThrow();
  finishNativeCreate(handle, "SUCCESS", f.environment);
  expect(() => assertNativeCreateSettled(ID, f.environment)).not.toThrow();
  expect(parseNativeCreateReceipt(JSON.parse(readFileSync(f.file, "utf8")))).toEqual({ ...handle.receipt, state: "joined", outcome: "SUCCESS" });
  expect(() => finishNativeCreate(handle, "CANCELLED", f.environment)).toThrow();
});
test("receipt parsing is strict and custody never accepts corruption or a foreign filename", () => {
  const f = fixture(); const handle = beginNativeCreate(ID, "credential", owner, f.environment);
  for (const value of [ { ...handle.receipt, extra: true }, { ...handle.receipt, state: "joined" }, { ...handle.receipt, state: "started", outcome: "SUCCESS" }, { ...handle.receipt, nativeOwner: { ...owner, pid: 1 } }, { ...handle.receipt, nativeOwner: { ...owner, processStartId: "unknown" } }, { ...handle.receipt, id: "../escape" } ]) expect(() => parseNativeCreateReceipt(value)).toThrow();
  writeFileSync(f.file, JSON.stringify({ ...handle.receipt, id: "b1234567-1234-4123-8123-123456789abc", state: "joined", outcome: "SUCCESS" }), { mode: 0o600 });
  expect(() => assertNativeCreateSettled(ID, f.environment)).toThrow();
  expect(() => finishNativeCreate(handle, "SUCCESS", f.environment)).toThrow();
  writeFileSync(f.file, "{invalid", { mode: 0o600 }); expect(() => assertNativeCreateSettled(ID, f.environment)).toThrow();
});
test("private receipt reads reject symlink substitution and unsafe file permissions", () => {
  const f = fixture(); beginNativeCreate(ID, "credential", owner, f.environment);
  chmodSync(f.file, 0o644); expect(() => assertNativeCreateSettled(ID, f.environment)).toThrow(); chmodSync(f.file, 0o600);
  const original = readFileSync(f.file); const outside = join(f.root, "not-a-custody-receipt.json"); writeFileSync(outside, original, { mode: 0o600 });
  rmSync(f.file); symlinkSync(outside, f.file); expect(() => assertNativeCreateSettled(ID, f.environment)).toThrow();
});
test("dispatch cannot precede durable native ownership and every exact native outcome joins", async () => {
  for (const outcome of ["SUCCESS", "CANCELLED", "UNAVAILABLE", "EXISTS", "NOT_FOUND", "INVALID"] as const) {
    const f = fixture(); const response = outcome === "SUCCESS" ? { ok: true } : { ok: false, code: outcome };
    const c = child(`${JSON.stringify(response)}\n`, outcome === "SUCCESS" ? 0 : 1, () => {
      const receipt = parseNativeCreateReceipt(JSON.parse(readFileSync(f.file, "utf8")));
      expect(receipt.state).toBe("started"); expect(receipt.nativeOwner).toEqual(owner);
    });
    const execution = exchangeNativeCreate(c.process, { id: ID, purpose: "credential", kind: "password" }, f.environment, undefined, () => owner);
    if (outcome === "SUCCESS") await expect(execution).resolves.toEqual(response); else await expect(execution).rejects.toThrow();
    expect(c.sent()).toBe(true); expect(() => assertNativeCreateSettled(ID, f.environment)).not.toThrow();
    expect(JSON.parse(readFileSync(f.file, "utf8")).outcome).toBe(outcome);
  }
});
test("missing ownership or a duplicate receipt prevents all native request bytes", async () => {
  for (const mode of ["capture", "duplicate"] as const) {
    const f = fixture(); if (mode === "duplicate") beginNativeCreate(ID, "credential", owner, f.environment);
    const c = child('{"ok":false,"code":"INVALID"}\n', 1);
    await expect(exchangeNativeCreate(c.process, { id: ID, purpose: "credential", kind: "token" }, f.environment, undefined, () => { if (mode === "capture") throw new Error("private process diagnostic"); return owner; })).rejects.toThrow("Native credential creation could not be confirmed");
    expect(c.sent()).toBe(false);
  }
});
test("malformed, extra-field and mismatched-exit replies preserve unknown native intent", async () => {
  for (const [text, exit] of [['{"ok":true,"value":"must-not-cross"}\n', 0], ['{"ok":false,"code":"OTHER"}\n', 1], ['{"ok":true}\n', 1], ['invalid\n', 0]] as const) {
    const f = fixture(); const c = child(text, exit);
    await expect(exchangeNativeCreate(c.process, { id: ID, purpose: "credential", kind: "token" }, f.environment, undefined, () => owner)).rejects.toThrow();
    expect(() => assertNativeCreateSettled(ID, f.environment)).toThrow();
    expect(JSON.parse(readFileSync(f.file, "utf8")).state).toBe("started");
  }
});
test("a terminal-looking output alone cannot settle a still-running native process", async () => {
  const f = fixture(); const exit = deferred<number>(); const sent = deferred<void>();
  const c: VaultChild & { pid: number } = { pid: owner.pid, stdin: { write() { sent.resolve(); }, end() {} }, stdout: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"ok":true}\n')); controller.close(); } }), exited: exit.promise, kill() { exit.resolve(1); } };
  const run = exchangeNativeCreate(c, { id: ID, purpose: "credential", kind: "token" }, f.environment, undefined, () => owner);
  await sent.promise; expect(() => assertNativeCreateSettled(ID, f.environment)).toThrow();
  exit.resolve(0); await run; expect(() => assertNativeCreateSettled(ID, f.environment)).not.toThrow();
});
test("receipt terminal law permits only the closed outcome set", () => {
  const receipt = { protocol: "ghostget.native-create/1", id: ID, purpose: "credential", nativeOwner: owner, state: "joined" };
  const allowed: readonly NativeCreateOutcome[] = ["SUCCESS", "CANCELLED", "UNAVAILABLE", "EXISTS", "NOT_FOUND", "INVALID"];
  assertProperty(fc.property(fc.string(), outcome => {
    if (allowed.includes(outcome as NativeCreateOutcome)) expect(parseNativeCreateReceipt({ ...receipt, outcome }).state).toBe("joined");
    else expect(() => parseNativeCreateReceipt({ ...receipt, outcome })).toThrow();
  }), { numRuns: 100 });
});
