import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import oldX from "./assets/adapters/x/wrench-web-adapter.v1.17.0.json";
import currentX from "./assets/adapters/x/wrench-web-adapter.json";
import { upgradeAppHostXAdapter } from "./app-host-adapter";
import { AppHostService } from "./app-host-service";
import { appHostXActionTickets } from "./app-host-x-service";
import { saveAuth, loadAuthSnapshot } from "./auth";
import { createProviderPluginRegistry } from "./provider-plugin-registry";
import xPlugin from "./plugins/x-web/plugin";
import { installManifest, loadInstalledManifest, adapterManifestPath, writePrivateJson } from "./storage";
import { manifestHash, parseRuntimeManifest, type GhostgetManifest } from "./model";
import { cancelUnstartedInvocationPlan, confirmInvocation, createAndSaveInvocationPlan, loadInvocationPlan, prepareInvocation, prepareReadInvocation } from "./runtime";
import { createRunJournal, initialRunJournal } from "./run-journal";
import { getWebSessionContract, webSessionContractHash } from "./web-session-contracts";

const registry = createProviderPluginRegistry([xPlugin]);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function parsed(raw: unknown): GhostgetManifest {
  const result = parseRuntimeManifest(raw, registry);
  if (!result.ok) throw new Error(result.issues.join("; "));
  return result.value;
}
function fixture(manifest: GhostgetManifest = parsed(oldX)) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-app-upgrade-")));
  chmodSync(root, 0o700); roots.push(root);
  const environment = { GHOSTGET_STATE_HOME: root };
  installManifest(manifest, { force: false, environment, registry });
  saveAuth({ schemaVersion: 1, id: "fixture", provider: "x", kind: "cookie-source", source: "chrome", profile: "Default", subject: "123", displayName: "@fixture" }, environment);
  return { root, environment };
}
function stateFiles(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const name = join(path, entry.name), rel = relative(root, name);
      if (rel === "adapters" || rel === "adapter-generations") continue;
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) files[rel] = createHash("sha256").update(readFileSync(name)).digest("hex");
      else throw new Error("Unexpected test state entry");
    }
  };
  walk(root); return files;
}

test("startup upgrades exact archived X state without changing account identity or action evidence", async () => {
  const f = fixture();
  const beforeHost = new AppHostService("com.example.product", f.environment);
  const listed = await beforeHost.handle({ action: "accounts.list" });
  beforeHost.close();
  if (listed.kind !== "accounts") throw new Error("wrong account response");
  const account = listed.accounts[0]!;
  // Restore the older adapter to model the original app's persisted interface.
  installManifest(parsed(oldX), { force: true, environment: f.environment, registry });
  const invocation = prepareInvocation("x-web", "likes.set", { post_id: "42", liked: true }, account.id, f.environment, registry);
  const stored = createAndSaveInvocationPlan(invocation, f.environment, new Date(), registry);
  appHostXActionTickets(f.environment).save({ schemaVersion: 1, digest: stored.digest, accountId: account.id, revision: account.revision,
    authHash: stored.plan.auth.hash, incarnationHash: stored.plan.auth.incarnationHash!, operation: "likes.set" });
  const operation = invocation.manifest.operations["likes.set"]!;
  if (!("webSession" in operation)) throw new Error("expected web contract");
  const startedAt = new Date().toISOString();
  const runId = "60000000-0000-4000-8000-000000000006";
  const journal = initialRunJournal({ runId, planDigest: stored.digest, adapter: stored.plan.adapter, operation: "likes.set", risk: "R2", inputHash: stored.plan.inputHash,
    auth: { id: account.id, hash: stored.plan.auth.hash, kind: "cookie-source" },
    authSubject: "123", contract: { transport: "web-session-api", hash: webSessionContractHash(getWebSessionContract(operation.webSession, registry), registry) },
    plannedDispatches: 1, hasPlanAssets: false,
    owner: { pid: 2_147_483_647, token: runId, bootId: "a".repeat(64), processStartId: "b".repeat(64), leaseUntil: startedAt },
    startedAt, dedupeExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  createRunJournal(journal, f.environment);
  if (journal.contract.transport !== "web-session-api") throw new Error("expected web contract");
  writePrivateJson(join(f.root, "runs", `${runId}.json`), {
    schemaVersion: 4, transport: "web-session-api", webSessionContractHash: journal.contract.hash,
    runId, planDigest: journal.planDigest, adapter: journal.adapter, operation: journal.operation, risk: journal.risk,
    inputHash: journal.inputHash, auth: journal.auth, status: journal.status, dispatchStarted: false, dispatch: journal.dispatch,
    startedAt: journal.startedAt, finishedAt: journal.updatedAt, finalOrigin: journal.finalOrigin, error: journal.error,
  }, { privateParent: true });
  writePrivateJson(join(f.root, "recovery", "retained.json"), { synthetic: "retained recovery evidence" }, { privateParent: true });
  writePrivateJson(join(f.root, "plan-assets", stored.digest, "retained.json"), { synthetic: "retained attachment evidence" }, { privateParent: true });
  const authBefore = loadAuthSnapshot(account.id, f.environment), before = stateFiles(f.root);

  const host = new AppHostService("com.example.product", f.environment);
  try {
    expect(loadInstalledManifest("x-web", f.environment, registry)).toEqual({ ok: true, value: parsed(currentX) });
    expect(loadAuthSnapshot(account.id, f.environment)).toEqual(authBefore);
    const afterAccounts = await host.handle({ action: "accounts.list" });
    expect(afterAccounts).toMatchObject({ kind: "accounts", accounts: [{ id: account.id, revision: account.revision }] });
    expect(stateFiles(f.root)).toEqual(before);
    expect(loadInvocationPlan(stored.digest, f.environment)).toEqual(stored);
    for (const [operation, input] of [["explore.read", { source: "trending", limit: 20 }], ["notifications.list", { limit: 20 }]] as const) {
      expect(prepareReadInvocation("x-web", operation, input, account.id, f.environment, registry).operationId).toBe(operation);
    }
    const binding = { accountId: account.id, expectedAccountRevision: account.revision };
    expect(await host.handle({ ...binding, action: "x.action.status", runId: `plan-${stored.digest}` })).toMatchObject({ kind: "x-action", state: "uncertain" });
    expect(await host.handle({ ...binding, action: "x.action.cancel", preparationId: `plan-${stored.digest}` })).toMatchObject({ kind: "x-action", state: "uncertain" });
    expect(stateFiles(f.root)).toEqual(before);
  } finally { host.close(); }
});

test("an unused pre-upgrade plan cannot dispatch and remains explicitly cancellable", async () => {
  const f = fixture();
  const invocation = prepareInvocation("x-web", "likes.set", { post_id: "42", liked: true }, "fixture", f.environment, registry);
  const stored = createAndSaveInvocationPlan(invocation, f.environment, new Date(), registry);
  const cancellable = createAndSaveInvocationPlan(prepareInvocation("x-web", "likes.set", { post_id: "43", liked: true }, "fixture", f.environment, registry), f.environment, new Date(), registry);
  expect(upgradeAppHostXAdapter(f.environment, registry)).toBe("upgraded");
  expect(loadInvocationPlan(stored.digest, f.environment)).toEqual(stored);
  expect(cancelUnstartedInvocationPlan(cancellable.digest, f.environment)).toBe(true);
  let dispatches = 0;
  await expect(confirmInvocation(stored.digest, { headed: false, environment: f.environment, registry,
    executeWebSession: async () => { dispatches++; throw new Error("must not dispatch"); } })).rejects.toThrow("adapter changed after preview");
  expect(dispatches).toBe(0);
});

test("custom and newer X adapters remain byte-identical, including edits to an archived version", () => {
  for (const manifest of [{ ...parsed(oldX), displayName: "Owner customization" }, { ...parsed(currentX), version: "999.0.0" }]) {
    const f = fixture(manifest);
    const before = readFileSync(adapterManifestPath("x-web", f.environment));
    expect(upgradeAppHostXAdapter(f.environment, registry)).toBe("preserved");
    expect(readFileSync(adapterManifestPath("x-web", f.environment))).toEqual(before);
    expect(loadInstalledManifest("x-web", f.environment, registry)).toEqual({ ok: true, value: manifest });
  }
});

test("portable-owned X interfaces are left to their own lifecycle", () => {
  const f = fixture();
  const before = readFileSync(adapterManifestPath("x-web", f.environment));
  const portableRegistry = { ...registry, resolveOwnedManifest: (id: string) => id === "x-web" ? parsed(currentX) : registry.resolveOwnedManifest(id) };
  expect(upgradeAppHostXAdapter(f.environment, portableRegistry)).toBe("preserved");
  expect(readFileSync(adapterManifestPath("x-web", f.environment))).toEqual(before);
});

test("malformed custom state is preserved and unsafe snapshots fail before publication", () => {
  const malformed = fixture(), path = adapterManifestPath("x-web", malformed.environment);
  const invalid = "{\"owner-custom-data\":true}\n";
  writeFileSync(path, invalid);
  expect(upgradeAppHostXAdapter(malformed.environment, registry)).toBe("preserved");
  expect(readFileSync(path, "utf8")).toBe(invalid);
  expect(existsSync(join(malformed.root, "adapter-generations", "current.json"))).toBe(false);

  const unsafe = fixture(), unsafePath = adapterManifestPath("x-web", unsafe.environment);
  const retained = readFileSync(unsafePath), target = join(unsafe.root, "retained-source.json");
  writeFileSync(target, retained, { mode: 0o600 }); unlinkSync(unsafePath); symlinkSync(target, unsafePath);
  let failure: unknown;
  try { upgradeAppHostXAdapter(unsafe.environment, registry); } catch (error) { failure = error; }
  expect(failure).toMatchObject({ code: "ADAPTER_UNAVAILABLE" });
  expect(readFileSync(target)).toEqual(retained);
  expect(existsSync(join(unsafe.root, "adapter-generations", "current.json"))).toBe(false);
});

test("current adapters do not create another generation or modify any product state", () => {
  const f = fixture(parsed(currentX));
  const indexPath = join(f.root, "adapter-generations", "current.json");
  const before = stateFiles(f.root), manifest = readFileSync(adapterManifestPath("x-web", f.environment));
  const index = existsSync(indexPath) ? readFileSync(indexPath) : null;
  expect(upgradeAppHostXAdapter(f.environment, registry)).toBe("current");
  expect(existsSync(indexPath) ? readFileSync(indexPath) : null).toEqual(index);
  expect(readFileSync(adapterManifestPath("x-web", f.environment))).toEqual(manifest);
  expect(stateFiles(f.root)).toEqual(before);
  expect(manifestHash(parsed(currentX))).not.toBe(manifestHash(parsed(oldX)));
});
