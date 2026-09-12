import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exchangeDiscovery, type DiscoveryChild } from "./discovery-process";
import { captureProcessOwnerIdentity, processOwnerStatus } from "../process-identity";

const roots: string[] = []; afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const start = '{"protocol":"ghostget.discovery/1","action":"scan"}\n';
function fixture(timeoutMs = 400) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-discovery-watchdog-"))); roots.push(root); chmodSync(root, 0o700);
  const module = fileURLToPath(new URL("./discovery-helper.ts", import.meta.url));
  const blocked = join(root, "blocked.ts"); writeFileSync(blocked, "for (;;) {}\n", { mode: 0o600 });
  const wrapper = join(root, "wrapper.ts");
  writeFileSync(wrapper, `import { Worker } from 'node:worker_threads';
const { runDiscoveryHelper } = await import(process.argv[2]);
await runDiscoveryHelper(() => new Worker(process.argv[3]), Number(process.argv[4]));
`, { mode: 0o600 });
  return { root, wrapper, args: [module, blocked, String(timeoutMs)] };
}
function spawn(script: string, cwd: string, args: readonly string[] = []) { return Bun.spawn([process.execPath, "--no-env-file", "--no-install", script, ...args], { cwd, env: { PATH: "/usr/bin:/bin", HOME: cwd }, stdin: "pipe", stdout: "pipe", stderr: "pipe" }); }
async function finish(child: ReturnType<typeof spawn>) {
  const kill = setTimeout(() => child.kill("SIGKILL"), 5000);
  try { const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]); return { exit, stdout, stderr }; }
  finally { clearTimeout(kill); }
}
test("independent watchdog stops blocked SQLite work at its deadline and when parent input closes", async () => {
  const f = fixture();
  for (const closeParent of [false, true]) {
    const child = spawn(f.wrapper, f.root, f.args); const before = performance.now(); child.stdin.write(start);
    if (closeParent) await child.stdin.end();
    const result = await finish(child);
    expect(result.exit).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).toBe("");
    expect(performance.now() - before).toBeLessThan(4000);
  }
});
test("watchdog rejects extra frames and missing worker responses without leaking diagnostics", async () => {
  const f = fixture();
  const extra = spawn(f.wrapper, f.root, f.args); extra.stdin.write(`${start}${start}`);
  expect(await finish(extra)).toEqual({ exit: 1, stdout: "", stderr: "" });
  const empty = join(f.root, "empty.ts"); writeFileSync(empty, "export {};\n", { mode: 0o600 });
  const missing = spawn(f.wrapper, f.root, [f.args[0]!, empty, "20000"]); missing.stdin.write(start);
  expect(await finish(missing)).toEqual({ exit: 1, stdout: "", stderr: "" });
});
test("abrupt controlling-parent death leaves no blocked scanner process", async () => {
  const f = fixture(30000);
  const parent = join(f.root, "parent.ts");
  writeFileSync(parent, String.raw`const [wrapper, ...args] = process.argv.slice(2);
const child = Bun.spawn([process.execPath, '--no-env-file', '--no-install', wrapper, ...args], { stdin: 'pipe', stdout: 'pipe', stderr: 'ignore', env: { PATH: '/usr/bin:/bin', HOME: process.cwd() } });
child.stdin.write('{"protocol":"ghostget.discovery/1","action":"scan"}\n');
process.stdout.write(String(child.pid) + '\n');
for await (const chunk of process.stdin) { if (chunk.toString() === 'exit\n') process.exit(0); }
`, { mode: 0o600 });
  const controller = spawn(parent, f.root, [f.wrapper, ...f.args]); const reader = controller.stdout.getReader(); let owner: ReturnType<typeof captureProcessOwnerIdentity> | undefined;
  const timeout = setTimeout(() => controller.kill("SIGKILL"), 5000);
  try {
    const first = await reader.read(); const pid = Number(new TextDecoder().decode(first.value).trim());
    expect(Number.isSafeInteger(pid) && pid > 0).toBe(true); owner = captureProcessOwnerIdentity(pid);
    controller.stdin.write("exit\n"); expect(await controller.exited).toBe(0);
    const deadline = performance.now() + 4000;
    while (processOwnerStatus(owner) !== "different-or-dead" && performance.now() < deadline) await Bun.sleep(20);
    expect(processOwnerStatus(owner)).toBe("different-or-dead"); expect(await new Response(controller.stderr).text()).toBe("");
  } finally {
    clearTimeout(timeout); reader.releaseLock(); try { controller.kill("SIGKILL"); } catch { /* Already exited. */ } await controller.exited;
    if (owner && processOwnerStatus(owner) === "exact-live-owner") { try { process.kill(owner.pid, "SIGKILL"); } catch { /* Raced normal exit. */ } }
  }
});
test("real fixed discovery helper returns only categorical metadata for a synthetic absent browser", async () => {
  const f = fixture(); const child = spawn(fileURLToPath(new URL("./discovery-helper.ts", import.meta.url)), f.root);
  const stderr = new Response(child.stderr).text();
  expect(await exchangeDiscovery(child)).toEqual({ status: "unavailable", profiles: [] });
  expect(await stderr).toBe(""); expect(await child.exited).toBe(0);
});
test("unjoined pipes or process produce a custody error after bounded escalation", async () => {
  const signals: string[] = []; let ended = false;
  const child: DiscoveryChild = { stdin: { write() {}, end() { ended = true; } }, stdout: new ReadableStream(), exited: new Promise(() => {}), kill(signal) { signals.push(signal); } };
  const before = performance.now();
  await expect(exchangeDiscovery(child, undefined, 1)).rejects.toThrow("disabled until the app restarts");
  expect(signals).toEqual(["SIGTERM", "SIGKILL"]); expect(ended).toBe(true); expect(performance.now() - before).toBeLessThan(4000);
});
