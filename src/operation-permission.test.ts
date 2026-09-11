import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAuth, saveAuth, removeAuth } from "./auth";
import { canonicalJson, type GhostgetManifest } from "./model";
import { ensurePrivateStateDirectory, installManifest, removePrivateStateFile } from "./storage";
import { createServer, type Socket } from "node:net";
import { messagingTurnDigest, parseMessagingTurnV1 } from "./messaging-types";
import { providerPluginRegistry as registry } from "./provider-plugins";
import { confirmInvocation, createAndSaveInvocationPlan, createMessagingCompositeInvocationPlan, executeReadInvocation, loadInvocationPlan, prepareInvocation, listRunReceipts } from "./runtime";
import { readCachedPreparedCapability, revalidatePreparedCapability } from "./read-client";
import { describeOperationPermission, describeOperationPermissions, setOperationPermission, checkProviderApproval, recheckProviderApproval, checkOperationPermission, withOperationPermission } from "./operation-permission";
import { enableOperationPermissions, readOperationPolicy, parseOperationPolicy, setOperationPolicyEntry } from "./operation-permission-store";
import type { ProviderExecution } from "./provider";
import type { PermissionDecision } from "./control/protocol";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function state() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-permission-test-")));
  chmodSync(directory, 0o700); directories.push(directory);
  const environment = { GHOSTGET_STATE_HOME: directory };
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "assets/adapters/x/wrench-adapter.json"), "utf8")) as GhostgetManifest;
  installManifest(manifest, { force: false, environment, registry });
  const auth = createAuth("permission-account", { oauthProvider: "x", tokenFile: join(directory, "token.json"), scopes: ["tweet.read", "tweet.write", "users.read"], subject: "12345" });
  saveAuth(auth, environment);
  const options = { environment, registry };
  const prepare = (operation = "posts.read") => prepareInvocation("x", operation, operation === "posts.read" ? { post_ids: ["2078889282404569267"] } : { body: "permission test" }, auth.id, environment, registry);
  const grant = (decision: PermissionDecision, operation = "posts.read") => {
    const description = describeOperationPermission("x", operation, auth.id, options);
    return setOperationPermission({ adapterId: "x", operationId: operation, authId: auth.id, decision,
      expectedRevision: description.revision, expectedCapabilityDigest: description.digest }, options);
  };
  return { directory, environment, options, manifest, auth, prepare, grant };
}
function execution(output: unknown = { text: "private-result" }): ProviderExecution {
  return { status: "succeeded", output, finalUrl: null, dispatchStarted: false, dispatch: { planned: 0, started: 0, verified: 0 } };
}

// This private fixture admits the exact socket request; broker recomputation is tested separately below.
async function approvalFixture(s: ReturnType<typeof state>, onRequest?: () => void) {
  const directory = join(s.directory, "control"); ensurePrivateStateDirectory(directory, s.environment);
  const requests: string[] = []; const releases: string[] = []; const sockets = new Set<Socket>();
  const admitted = new Map<string, string>();
  const server = createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    let text = "";
    socket.on("data", chunk => {
      text += chunk.toString(); if (!text.includes("\n")) return;
      const request = JSON.parse(text) as { action: string; id: string; digest?: string; expectedDigest?: string };
      const digest = request.expectedDigest ?? request.digest!;
      let status = "expired";
      if (request.action === "request") { requests.push(request.id); admitted.set(request.id, digest); onRequest?.(); status = "allowed"; }
      else if (request.action === "check" && admitted.get(request.id) === digest) status = "allowed";
      else if (request.action === "cancel") { releases.push(request.id); admitted.delete(request.id); status = "cancelled"; }
      socket.end(`${JSON.stringify({ protocol: "ghostget.approval/1", id: request.id, digest, status })}\n`);
    });
  });
  const path = join(directory, "agent.sock");
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(path, resolve); }); chmodSync(path, 0o600);
  return { requests, releases, async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

test("operation policy: unmanaged compatibility, opt-in default deny, and strict CAS revisions", () => {
  const s = state();
  expect(readOperationPolicy(s.environment)).toMatchObject({ managed: false, revision: 0 });
  expect(s.prepare().operationId).toBe("posts.read");
  enableOperationPermissions(0, s.environment);
  expect(() => s.prepare()).toThrow("denied");
  s.grant("allow");
  expect(s.prepare().operationId).toBe("posts.read");
  expect(() => setOperationPolicyEntry("a".repeat(64), "allow", 1, s.environment)).toThrow("refresh");
  expect(readOperationPolicy(s.environment).revision).toBe(2);
});

test("operation policy: deleted or corrupt managed policy never falls back to unmanaged", () => {
  const s = state(); enableOperationPermissions(0, s.environment);
  const path = join(s.directory, "operation-permissions/policy.json");
  rmSync(path);
  expect(() => readOperationPolicy(s.environment)).toThrow("blocked");
  writeFileSync(path, "{}\n", { mode: 0o600 });
  expect(() => readOperationPolicy(s.environment)).toThrow("blocked");
});

test("operation policy: rejects extra fields, duplicates, unsorted keys and unsafe revisions", () => {
  const a = { digest: "a".repeat(64), decision: "allow" };
  const b = { digest: "b".repeat(64), decision: "ask" };
  for (const value of [null, { schemaVersion: 1, revision: 1, entries: [], bypass: true }, { schemaVersion: 1, revision: 1, entries: [a, a] },
    { schemaVersion: 1, revision: 1, entries: [b, a] }, { schemaVersion: 1, revision: 1.5, entries: [] }]) expect(() => parseOperationPolicy(value)).toThrow();
  expect(parseOperationPolicy({ schemaVersion: 1, revision: 1, entries: [a, b] }).entries).toHaveLength(2);
});

test("operation policy: managed deny blocks a previously prepared live invocation before executor", async () => {
  const s = state(); const invocation = s.prepare(); enableOperationPermissions(0, s.environment);
  let calls = 0;
  await expect(executeReadInvocation(invocation, { ...s.options, headed: false, executeProvider: async () => { calls++; return execution(); } })).rejects.toThrow("denied");
  expect(calls).toBe(0);
});

test("operation policy: ask cached disclosure is synchronous and never reveals retained data", async () => {
  const s = state(); const invocation = s.prepare();
  await revalidatePreparedCapability(invocation, { ...s.options, executeRead: async () => executeReadInvocation(invocation, { ...s.options, headed: false, executeProvider: async () => execution() }) });
  expect(readCachedPreparedCapability(invocation, s.options).status).toBe("hit");
  enableOperationPermissions(0, s.environment); s.grant("ask");
  expect(() => readCachedPreparedCapability(invocation, s.options)).toThrow("human approval");
});

test("operation policy: revocation during network latency withholds output but preserves receipt", async () => {
  const s = state(); enableOperationPermissions(0, s.environment); s.grant("allow"); const invocation = s.prepare();
  let reached = false;
  await expect(executeReadInvocation(invocation, { ...s.options, headed: false, executeProvider: async () => {
    reached = true; s.grant("deny"); return execution();
  } })).rejects.toThrow();
  expect(reached).toBe(true);
  const policy = readOperationPolicy(s.environment);
  expect(policy.entries.some(entry => entry.decision === "deny")).toBe(true);
  const receipts = listRunReceipts(s.environment);
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({ status: "succeeded", operation: "posts.read" });
});

test("operation policy: account A-to-B-to-A invalidates grants and previewed plans", async () => {
  const s = state(); enableOperationPermissions(0, s.environment); s.grant("allow", "posts.publish");
  const invocation = s.prepare("posts.publish");
  const stored = createAndSaveInvocationPlan(invocation, s.environment, new Date(), registry);
  expect(stored.plan.auth.incarnationHash).toBe(invocation.readProjectionAuthIdentityHash);
  removeAuth(s.auth.id, s.environment); saveAuth(s.auth, s.environment);
  let calls = 0;
  await expect(confirmInvocation(stored.digest, { ...s.options, headed: false, executeProvider: async () => { calls++; return execution(); } })).rejects.toThrow("lifetime");
  expect(calls).toBe(0);
  expect(loadInvocationPlan(stored.digest, s.environment).digest).toBe(stored.digest);
});

test("operation policy: capability digest binds adapter, account and current closure", () => {
  const s = state(); const initial = describeOperationPermission("x", "posts.read", s.auth.id, s.options);
  const alteredRegistry = { ...registry, implementationClosureHash: () => "f".repeat(64) };
  expect(describeOperationPermission("x", "posts.read", s.auth.id, { ...s.options, registry: alteredRegistry }).digest).not.toBe(initial.digest);
  installManifest({ ...s.manifest, displayName: "User interface" }, { force: true, environment: s.environment, registry });
  expect(describeOperationPermission("x", "posts.read", s.auth.id, s.options).digest).not.toBe(initial.digest);
});

test("operation policy: helper recomputes preview and retained plan approval survives plan consumption only with unchanged authority", async () => {
  const s = state(); enableOperationPermissions(0, s.environment); s.grant("ask", "posts.publish");
  const stored = createAndSaveInvocationPlan(s.prepare("posts.publish"), s.environment, new Date(), registry);
  const target = { kind: "provider" as const, adapterId: "x", operationId: "posts.publish", authId: s.auth.id, input: null, planDigest: stored.digest };
  await expect(checkProviderApproval({ ...target, input: { body: "permission test" }, planDigest: null }, s.options)).rejects.toThrow("exact saved confirmation plan");
  const checked = await checkProviderApproval(target, s.options);
  expect(checked.preview).toContain("permission test");
  expect(removePrivateStateFile(join(s.directory, "plans", `${stored.digest}.json`), s.environment)).toBe(true);
  await expect(checkProviderApproval(target, s.options)).rejects.toThrow();
  expect(await recheckProviderApproval(target, checked, s.options)).toBe(checked);
  s.grant("deny", "posts.publish");
  await expect(recheckProviderApproval(target, checked, s.options)).rejects.toThrow("changed");
  expect(() => canonicalJson(checked)).not.toThrow();
});

test("operation policy: batch descriptions match single inspection and reuse binding closure work", () => {
  const s = state();
  const request = { adapterId: "x", operationId: "posts.read", authId: s.auth.id };
  let closures = 0;
  const counted = { ...registry, implementationClosureHash: (binding: Parameters<typeof registry.implementationClosureHash>[0]) => { closures++; return registry.implementationClosureHash(binding); } };
  const result = describeOperationPermissions(Array.from({ length: 100 }, () => request), { ...s.options, registry: counted });
  expect(closures).toBe(2);
  expect(result).toHaveLength(100);
  expect(result.every(item => item?.digest === result[0]?.digest)).toBe(true);
  expect(result[0]?.digest).toBe(describeOperationPermission("x", "posts.read", s.auth.id, s.options).digest);
  expect(describeOperationPermissions([{ ...request, operationId: "missing" }], s.options)).toEqual([null]);
});

test("operation policy: one live revalidation approval covers nested cache disclosure and is released before later calls", async () => {
  const s = state(); enableOperationPermissions(0, s.environment); s.grant("ask"); const invocation = s.prepare();
  const approvals = await approvalFixture(s);
  try {
    const result = await revalidatePreparedCapability(invocation, { ...s.options,
      executeRead: async () => executeReadInvocation(invocation, { ...s.options, headed: false, executeProvider: async () => execution() }) });
    expect(result.live.receipt.status).toBe("succeeded");
    expect(approvals.requests).toHaveLength(1);
    expect(approvals.releases).toEqual(approvals.requests);
    expect(() => readCachedPreparedCapability(invocation, s.options)).toThrow("human approval");
    await withOperationPermission(invocation, s.options, async () => {
      await expect(checkOperationPermission({ ...invocation, input: { post_ids: ["2078889282404569268"] } }, s.options)).rejects.toThrow("human approval");
    });
    expect(new Set(approvals.requests).size).toBe(2);
    expect(approvals.releases).toEqual(approvals.requests);
  } finally { await approvals.close(); }
});

test("operation policy: management enabled during an unmanaged request withholds its result", async () => {
  const s = state(); const invocation = s.prepare();
  await expect(executeReadInvocation(invocation, { ...s.options, headed: false, executeProvider: async () => {
    enableOperationPermissions(0, s.environment); return execution();
  } })).rejects.toThrow("changed");
  expect(listRunReceipts(s.environment)).toHaveLength(1);
});

test("operation policy: input mutation while awaiting approval never changes the admitted request", async () => {
  const s = state(); enableOperationPermissions(0, s.environment); s.grant("ask"); const invocation = s.prepare();
  const approvals = await approvalFixture(s, () => { (invocation.input as Record<string, unknown>).post_ids = ["2078889282404569268"]; });
  let called = false;
  try {
    await expect(withOperationPermission(invocation, s.options, async () => { called = true; })).rejects.toThrow("human approval");
    expect(called).toBe(false);
    expect(approvals.releases).toEqual(approvals.requests);
  } finally { await approvals.close(); }
});

test("operation policy: revocation during write preflight blocks durable dispatch and retains its outcome", async () => {
  const s = state(); enableOperationPermissions(0, s.environment); s.grant("allow", "posts.publish");
  const stored = createAndSaveInvocationPlan(s.prepare("posts.publish"), s.environment, new Date(), registry);
  let submitted = false;
  await expect(confirmInvocation(stored.digest, { ...s.options, headed: false, executeProvider: async (_manifest, _recipe, _input, _auth, options) => {
    s.grant("deny", "posts.publish");
    await options?.beforeDispatch?.({ id: stored.plan.dispatches[0]!.id, index: 1, progress: { planned: 1, started: 0, verified: 0 } });
    submitted = true; return execution();
  } })).rejects.toThrow();
  expect(submitted).toBe(false);
  expect(listRunReceipts(s.environment)).toHaveLength(1);
  expect(listRunReceipts(s.environment)[0]).toMatchObject({ status: "failed", dispatchStarted: false });
});

test("operation policy: composite exact parts share one approval and a changed part cannot reuse it", async () => {
  const s = state(); enableOperationPermissions(0, s.environment); s.grant("ask", "posts.publish");
  const first = s.prepare("posts.publish"); const second = { ...first, input: { body: "second exact part" } };
  const parts = [first, second].map((invocation, index) => ({
    partId: `part-${index + 1}`, text: String(invocation.input.body), replyRef: null, replyToProviderId: null, invocation,
  }));
  const turnDigest = messagingTurnDigest(parseMessagingTurnV1({schemaVersion: 1, format: "wrench.messaging-turn", clientIntentSha256: "a".repeat(64), routeRef: "wmroute_ABCDEFGHIJKLMNOPQRSTUV", contextRef: "wmcontext_ABCDEFGHIJKLMNOPQRSTUV", parts: parts.map(({partId, text, replyRef}) => ({partId, text, replyRef}))}));
  const stored = createMessagingCompositeInvocationPlan(parts, {
    routeRef: "wmroute_ABCDEFGHIJKLMNOPQRSTUV", contextRef: "wmcontext_ABCDEFGHIJKLMNOPQRSTUV", clientIntentSha256: "a".repeat(64),
    contextBindingSha256: "b".repeat(64), sourceConversationCoordinateSha256: "c".repeat(64), turnDigest, contextLimit: 20,
    baseExactDataRevision: "e".repeat(64), baseLatestMessageRevision: "f".repeat(64), baseRouteStateRevision: "0".repeat(64), baseMessages: [],
    recipient: { network: "synthetic", conversation: { kind: "single", title: "Exact recipient", participantCount: 1 } },
  }, new Date(), registry);
  const approvals = await approvalFixture(s);
  try {
    await withOperationPermission(first, { ...s.options, plan: stored }, async () => {
      await checkOperationPermission(first, s.options);
      await checkOperationPermission(second, s.options);
      await expect(checkOperationPermission({ ...second, input: { body: "altered" } }, s.options)).rejects.toThrow("human approval");
    });
    expect(approvals.requests).toHaveLength(1);
    expect(approvals.releases).toEqual(approvals.requests);
  } finally { await approvals.close(); }
});
