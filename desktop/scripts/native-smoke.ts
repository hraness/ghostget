import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { desktopRoot } from "./build.ts";
import { parseControlResponse } from "../src/response.ts";

/** Bun 1.3.14 can return bigint despite number declarations. Preserve exact counters. */
export function resourceCounter(value: unknown): string {
  if (typeof value === "bigint" && value >= 0n) return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new Error("Invalid subprocess resource counter");
}

/** Root mac-native owner only: no personal state, account login or live request. */
export async function smokePackagedHelper(): Promise<void> {
  const resources = join(desktopRoot, "out", "runtime");
  const scratch = await realpath(await mkdtemp("/tmp/ghostget-smoke-")); const stateHome = join(scratch, "state"); await mkdir(stateHome, { mode: 0o700 });
  const started = performance.now();
  const child = Bun.spawn([join(resources, "ghostget-bun"), "--no-env-file", "--no-install", "src/control/helper.ts"], { cwd: join(resources, "package"), env: { HOME: process.env.HOME ?? "", TMPDIR: scratch, USER: process.env.USER ?? "", LOGNAME: process.env.LOGNAME ?? "", PATH: "/usr/bin:/bin:/usr/sbin:/sbin", GHOSTGET_STATE_HOME: stateHome }, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const deadline = setTimeout(() => child.kill(), 70000);
  let closed = false;
  try {
    child.stdin.write(`${JSON.stringify({ id: "native-smoke", protocol: "ghostget.control/1", request: { action: "snapshot", accountId: null } })}\n`);
    const reader = child.stdout.getReader(); let bytes = new Uint8Array(); let newline = -1;
    while (newline < 0) { const chunk = await reader.read(); if (chunk.done) throw new Error("Packaged helper exited before its snapshot"); const next = new Uint8Array(bytes.length + chunk.value.length); next.set(bytes); next.set(chunk.value, bytes.length); bytes = next; if (bytes.length > 4194304) throw new Error("Packaged helper exceeded response bound"); newline = bytes.indexOf(10); }
    const snapshotReadyMs = performance.now() - started;
    assert.equal(newline, bytes.length - 1);
    reader.releaseLock();
    const frame: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, newline)));
    assert.ok(frame && typeof frame === "object" && !Array.isArray(frame)); const value = frame as Record<string, unknown>;
    assert.equal(value.id, "native-smoke"); assert.equal(value.protocol, "ghostget.control/1"); const { id: _id, protocol: _protocol, ...response } = value;
    const parsed = parseControlResponse(response); assert.ok(parsed.ok); assert.equal(parsed.data.kind, "snapshot"); if (parsed.data.kind === "snapshot") assert.equal(parsed.data.snapshot.accounts.length, 0);
    child.stdin.end(); assert.equal(await child.exited, 0); closed = true;
    await expectAbsent(join(stateHome, "control", "owner.json")); await expectAbsent(join(stateHome, "control", "agent.sock"));
    const usage = child.resourceUsage();
    await writeFile(join(desktopRoot, "out", "native-smoke.json"), JSON.stringify({ schema: "ghostget.packaged-helper-smoke/1", platform: process.platform, architecture: process.arch, bunVersion: Bun.version, snapshotReadyMs, totalWallMs: performance.now() - started, resourceCounterEncoding: "unsigned-decimal-string", maxRssBytes: usage ? resourceCounter(usage.maxRSS) : null, cpuTimeMicroseconds: usage ? { user: resourceCounter(usage.cpuTime.user), system: resourceCounter(usage.cpuTime.system), total: resourceCounter(usage.cpuTime.total) } : null, emptyState: true, accountActions: false, exitCode: 0, custodyRemoved: true }, null, 2));
    process.stdout.write("Packaged helper snapshot and orderly shutdown passed using isolated empty state.\n");
  } finally { clearTimeout(deadline); if (!closed) { child.kill(); await child.exited; } await rm(scratch, { recursive: true, force: true }); }
}
async function expectAbsent(path: string): Promise<void> { try { await access(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; } throw new Error("Packaged helper left live control custody behind"); }
if (import.meta.main) await smokePackagedHelper();
