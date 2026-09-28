import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { persistentHelperRequest, type PersistentHelperSpec } from "./persistent-helper-bridge";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root(prefix = "ghostget-helper-bridge-") { const path = realpathSync(mkdtempSync(join(tmpdir(), prefix))); chmodSync(path, 0o700); roots.push(path); return path; }

// A line helper: answers {"pid","echo"} per line; "exit" exits without an
// answer after writing stderr; "fail" answers ok:false like a failing helper;
// "big:N" answers N bytes; "sleep" never answers.
const ECHO = `
import { readSync, writeSync } from "node:fs";
const input = Buffer.alloc(65536); let pending = "";
for (;;) {
  let index = pending.indexOf("\\n");
  while (index < 0) { const n = readSync(0, input, 0, input.length, null); if (n === 0) process.exit(0); pending += input.subarray(0, n).toString(); index = pending.indexOf("\\n"); }
  const line = pending.slice(0, index); pending = pending.slice(index + 1);
  if (line === "exit") { process.stderr.write("helper diagnostic"); process.exit(1); }
  if (line === "sleep") { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000); }
  const answer = line === "fail" ? { ok: false, error: "helper failed" } : line.startsWith("big:") ? { ok: true, data: "x".repeat(Number(line.slice(4))) } : { ok: true, pid: process.pid, echo: line };
  writeSync(1, JSON.stringify(answer) + "\\n");
  if (line === "fail") process.exit(1);
}`;
function spec(directory: string): PersistentHelperSpec {
  const script = join(directory, "echo.ts"); writeFileSync(script, ECHO);
  return { executable: process.execPath, arguments: ["--no-env-file", "--no-install", script], cwd: directory, environment: { NODE_ENV: "production" } };
}
const answer = (result: ReturnType<typeof persistentHelperRequest>) => { expect(result.kind).toBe("response"); return JSON.parse((result as { line: string }).line) as Record<string, unknown>; };

test("sequential requests reuse one helper process and keep request order", () => {
  const directory = root(), key = randomUUID(), helper = spec(directory);
  const first = answer(persistentHelperRequest(key, helper, "one", 10_000));
  const second = answer(persistentHelperRequest(key, helper, "two", 10_000));
  expect(first.echo).toBe("one"); expect(second.echo).toBe("two"); expect(second.pid).toBe(first.pid);
  // A distinct key is a distinct bound helper.
  expect(answer(persistentHelperRequest(randomUUID(), helper, "three", 10_000)).pid).not.toBe(first.pid);
  expect((answer(persistentHelperRequest(key, helper, `big:${4 * 1024 * 1024}`, 10_000)).data as string).length).toBe(4 * 1024 * 1024);
});

test("an exited, failed or unresponsive helper is replaced and never answers a later request", () => {
  const directory = root(), key = randomUUID(), helper = spec(directory);
  const first = answer(persistentHelperRequest(key, helper, "one", 10_000)).pid;
  expect(persistentHelperRequest(key, helper, "exit", 10_000)).toEqual({ kind: "failed", detail: "helper diagnostic" });
  const second = answer(persistentHelperRequest(key, helper, "two", 10_000)).pid;
  expect(second).not.toBe(first);
  expect(answer(persistentHelperRequest(key, helper, "fail", 10_000))).toEqual({ ok: false, error: "helper failed" });
  const third = answer(persistentHelperRequest(key, helper, "three", 10_000)).pid;
  expect(third).not.toBe(second);
  expect(persistentHelperRequest(key, helper, "sleep", 300)).toEqual({ kind: "failed", detail: "helper did not answer within its deadline" });
  const fourth = answer(persistentHelperRequest(key, helper, "four", 10_000));
  expect(fourth.echo).toBe("four"); expect(fourth.pid).not.toBe(third);
});

test("multi-line requests are refused before reaching a helper", () => {
  const directory = root();
  expect(() => persistentHelperRequest(randomUUID(), spec(directory), "a\nb", 1_000)).toThrow("one line");
});

test("a persistent state helper refuses its next request once its root is replaced", () => {
  const parent = root("ghostget-state-serve-"), state = join(parent, "ghostget-state");
  mkdirSync(state, { mode: 0o700 }); writeFileSync(join(state, ".io-state.json"), '{"kind":"io-state","schemaVersion":1}\n', { mode: 0o600 });
  mkdirSync(join(state, "auth"), { mode: 0o700 });
  const identity = () => { const stats = statSync(state, { bigint: true }); return { device: String(stats.dev), inode: String(stats.ino) }; };
  const helper: PersistentHelperSpec = {
    executable: process.execPath,
    arguments: ["--no-env-file", "--no-install", "--no-macros", "--no-addons", `--config=${join(import.meta.dir, "state-helper.bunfig.toml")}`, join(import.meta.dir, "state-helper.ts"), "--serve"],
    cwd: state, environment: { NODE_ENV: "production" },
  };
  const expected = identity(), key = randomUUID();
  const authStats = statSync(join(state, "auth"), { bigint: true }), auth = { device: String(authStats.dev), inode: String(authStats.ino) };
  const request = (value: { device: string; inode: string }) => JSON.stringify({ schemaVersion: 1, requestId: randomUUID(), expected: value, operation: { kind: "read-file-if-present", segments: ["auth", "absent.json"], directoryExpectations: [auth], maximumBytes: 1024 } });
  const ok = answer(persistentHelperRequest(key, helper, request(expected), 10_000));
  expect(ok).toMatchObject({ ok: true, present: false });
  renameSync(state, `${state}-moved`); mkdirSync(state, { mode: 0o700 });
  const refused = answer(persistentHelperRequest(key, helper, request(expected), 10_000));
  expect(refused).toEqual({ ok: false, error: "state helper: bound state directory identity does not match" });
});
