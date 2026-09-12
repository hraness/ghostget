import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agentRequest } from "./approval-client";
import { ApprovalBroker } from "./approval-broker";
import { ActivityStore } from "./activity";
import { beginControlHelperShutdown } from "./helper";
import { WebGateway } from "./web-gateway";
import { checkWebRequest, saveWebPolicy } from "./web-policy";
import type { ControlRequest, ControlResponse, ControlSnapshot } from "./protocol";
import { ghostgetStateHome } from "../storage";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const activityQuery = { search: "", method: "all", outcome: "all", origin: null, since: null, order: "newest", cursor: null, limit: 100 } as const;
function fixture() {
  const raw = mkdtempSync("/tmp/ghostget-hlp-"); chmodSync(raw, 0o700);
  cleanups.push(async () => { rmSync(raw, { recursive: true, force: true }); });
  const environment = { GHOSTGET_STATE_HOME: raw, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: process.env.HOME ?? "", USER: process.env.USER ?? "", LOGNAME: process.env.LOGNAME ?? "", TMPDIR: "/tmp" };
  const root = ghostgetStateHome(environment);
  return { environment, root };
}
async function bounded<T>(promise: Promise<T>, ms = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Synthetic helper test exceeded its bound")), ms); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
function launch(environment: Record<string, string>) {
  const script = fileURLToPath(new URL("./helper.ts", import.meta.url));
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", script], { cwd: dirname(script), env: environment, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const reader = child.stdout.getReader(); const stderr = new Response(child.stderr).text(); let buffer = Buffer.alloc(0); let sequence = 0; let closed = false;
  cleanups.push(async () => {
    if (!closed) { child.kill("SIGKILL"); await bounded(child.exited, 2000); }
    await reader.cancel().catch(() => undefined); reader.releaseLock();
    await bounded(stderr, 2000);
  });
  const response = async (): Promise<unknown> => {
    while (!buffer.includes(10)) {
      const next = await reader.read(); if (next.done) throw new Error("Helper exited before a response");
      buffer = Buffer.concat([buffer, next.value]); if (buffer.length > 4_194_304) throw new Error("Oversized helper response");
    }
    const end = buffer.indexOf(10); const line = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
  };
  return {
    child,
    async request(request: ControlRequest): Promise<ControlResponse> {
      const id = `test-${++sequence}`; child.stdin.write(`${JSON.stringify({ id, protocol: "ghostget.control/1", request })}\n`);
      const value = await bounded(response()) as { id: string; protocol: string } & ControlResponse;
      expect(value.id).toBe(id); expect(value.protocol).toBe("ghostget.control/1"); return value;
    },
    async end(signal?: "SIGTERM") {
      if (signal) child.kill(signal); else child.stdin.end();
      const code = await bounded(child.exited); closed = true; return { code, stderr: await bounded(stderr) };
    },
    async exited() { const code = await bounded(child.exited); closed = true; return { code, stderr: await bounded(stderr) }; },
  };
}
function snapshot(response: ControlResponse): ControlSnapshot {
  if (!response.ok || response.data.kind !== "snapshot") throw new Error("Expected synthetic snapshot");
  return response.data.snapshot;
}
function assertNoOwner(root: string) {
  expect(existsSync(join(root, "control", "owner.json"))).toBe(false);
  expect(existsSync(join(root, "control", "agent.sock"))).toBe(false);
}

test("helper shutdown records cancellation when an approval recheck outpaces socket close delivery", async () => {
  const { environment } = fixture();
  saveWebPolicy([{ id: "synthetic-docs", origin: "https://docs.example.com", path: { kind: "exact", value: "/reference" }, methods: ["GET"], queryKeys: [], decision: "ask", effect: "retrieval", maxResponseBytes: 1024, timeoutMs: 1000 }], false, 0, environment);
  const activity = new ActivityStore(environment);
  const checking = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let checks = 0;
  const approvals = new ApprovalBroker(async target => {
    if (target.kind !== "web") throw new Error("Unexpected synthetic approval target");
    if (++checks === 2) { checking.resolve(); await release.promise; }
    return checkWebRequest(target.method, target.url, environment).approval;
  });
  let transportCalls = 0;
  const gateway = new WebGateway(activity, approvals, environment, async () => {
    transportCalls++;
    throw new Error("Pending synthetic approval reached transport");
  });
  const controller = new AbortController();
  let destroyed = false;
  // Deliberately withhold the socket's close event until after the request settles.
  const socket = { destroy: () => { destroyed = true; } };
  const pending = gateway.run("GET", "https://docs.example.com/reference", controller.signal)
    .then(value => ({ value }), (error: unknown) => ({ error }));
  try {
    await bounded(checking.promise);
    expect(activity.query(activityQuery).rows[0]?.outcome).toBe("started");
    beginControlHelperShutdown(new Map([[socket, controller]]), {
      beginShutdown: () => approvals.close(),
    });
    expect(destroyed).toBe(true);
    release.resolve();
    expect(await bounded(pending)).toMatchObject({ error: { code: "REQUEST_CANCELLED" } });
    expect(activity.query(activityQuery).rows[0]).toMatchObject({ outcome: "cancelled", errorCode: "REQUEST_CANCELLED" });
    expect(transportCalls).toBe(0);
  } finally {
    controller.abort(); release.resolve();
    await bounded(pending);
    approvals.close(); activity.close();
  }
});

test("actual helper separates admin and agent channels, rejects a second owner, and settles pending work before EOF cleanup", async () => {
  const fixtureState = fixture(); const helper = launch(fixtureState.environment);
  const initial = snapshot(await helper.request({ action: "snapshot", accountId: null }));
  expect(initial.accounts).toEqual([]); expect(initial.policy.managed).toBe(false);
  expect(existsSync(join(fixtureState.root, "control", "owner.json"))).toBe(true);
  expect((await helper.request({ action: "permission.enable", expectedRevision: initial.policy.revision })).ok).toBe(true);
  for (const payload of [
    { protocol: "ghostget.control/1", request: { action: "permission.enable", expectedRevision: 0 } },
    { protocol: "ghostget.approval/1", action: "approve", id: "fake", digest: "0".repeat(64) },
    { protocol: "ghostget.approval/1", action: "approval.list" },
    { protocol: "ghostget.approval/1", action: "vault.import", reference: "op://synthetic/private/token" },
  ]) {
    expect(await agentRequest(payload, { environment: fixtureState.environment })).toMatchObject({ ok: false });
  }
  const denied = await agentRequest({ protocol: "ghostget.web/1", action: "request", method: "GET", url: "https://blocked.example.com/private?token=synthetic-query-marker" }, { environment: fixtureState.environment });
  expect(denied).toMatchObject({ ok: false, code: "WEB_DENIED" });
  const current = snapshot(await helper.request({ action: "snapshot", accountId: null })); expect(current.policy.managed).toBe(true);
  expect((await helper.request({ action: "web.save", gatewayOnly: false, expectedRevision: current.web.revision, rules: [{ id: "synthetic-docs", origin: "https://docs.example.com", path: { kind: "exact", value: "/reference" }, methods: ["GET"], queryKeys: ["q"], decision: "ask", effect: "retrieval", maxResponseBytes: 1024, timeoutMs: 1000 }] })).ok).toBe(true);
  // No approval is granted, so this request cannot reach DNS or the public network.
  const pending = agentRequest({ protocol: "ghostget.web/1", action: "request", method: "GET", url: "https://docs.example.com/reference?q=synthetic-pending-marker" }, { environment: fixtureState.environment, timeoutMs: 30_000 });
  const settledPending = pending.then(value => ({ value }), error => ({ error }));
  let approvals: ControlSnapshot["approvals"] = [];
  for (let attempt = 0; attempt < 20 && approvals.length === 0; attempt++) {
    const response = await helper.request({ action: "approval.list" });
    if (!response.ok || response.data.kind !== "approvals") throw new Error("Expected administrative approval list");
    approvals = response.data.approvals;
    if (!approvals.length) await new Promise(resolve => setTimeout(resolve, 50));
  }
  expect(approvals).toHaveLength(1);
  const beforeSecond = await helper.request({ action: "activity.query", query: activityQuery });
  expect(beforeSecond).toMatchObject({ ok: true, data: { kind: "activity", page: { rows: expect.arrayContaining([expect.objectContaining({ outcome: "started", ruleId: "synthetic-docs" })]) } } });
  const second = launch(fixtureState.environment); const rejected = await second.exited();
  expect(rejected.code).toBe(1); expect(rejected.stderr).toBe("Ghostget control helper stopped safely.\n");
  // A rejected owner must not recover the active process's SQLite intents.
  const afterSecond = await helper.request({ action: "activity.query", query: activityQuery });
  expect(afterSecond).toMatchObject({ ok: true, data: { kind: "activity", page: { rows: expect.arrayContaining([expect.objectContaining({ outcome: "started", ruleId: "synthetic-docs" })]) } } });
  const stopped = await helper.end(); expect(stopped).toEqual({ code: 0, stderr: "" });
  expect(await settledPending).toHaveProperty("error"); assertNoOwner(fixtureState.root);
  const path = join(fixtureState.root, "control", "activity", "requests.sqlite");
  const db = new Database(path, { readonly: true });
  try { expect(db.query("SELECT outcome FROM requests WHERE rule_id = 'synthetic-docs'").get()).toEqual({ outcome: "cancelled" }); }
  finally { db.close(); }
  const stored = readFileSync(path); expect(stored.includes(Buffer.from("synthetic-query-marker"))).toBe(false); expect(stored.includes(Buffer.from("synthetic-pending-marker"))).toBe(false);
  const restarted = launch(fixtureState.environment); expect(snapshot(await restarted.request({ action: "snapshot", accountId: null })).approvals).toEqual([]);
  expect((await restarted.end()).code).toBe(0); assertNoOwner(fixtureState.root);
});

test("actual helper SIGTERM and truncated control frames remove only their owned socket and claim", async () => {
  for (const shutdown of ["signal", "partial"] as const) {
    const fixtureState = fixture(); const helper = launch(fixtureState.environment);
    snapshot(await helper.request({ action: "snapshot", accountId: null }));
    if (shutdown === "partial") helper.child.stdin.write('{"id":"truncated"');
    const result = await helper.end(shutdown === "signal" ? "SIGTERM" : undefined);
    expect([0, 1]).toContain(result.code); assertNoOwner(fixtureState.root);
    if (shutdown === "partial") expect(result.code).toBe(1);
  }
});
