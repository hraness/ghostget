import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { assertAsyncProperty } from "./test-support";
import { listAuth, loadAuthSnapshot, removeAuth, saveAuth } from "./auth";
import { providerPluginRegistry as registry } from "./provider-plugins";
import { Connections } from "./control/connections";
import { AppHostService } from "./app-host-service";
import type { AppHostData } from "./app-host-protocol";
import type { AppHostDecision } from "./app-host-confirmation";

const roots: string[] = [];
const services: AppHostService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-app-host-")));
  chmodSync(root, 0o700); roots.push(root);
  const environment = { GHOSTGET_STATE_HOME: root };
  let subject = "12345";
  let now = 100;
  let confirmation: (decision: AppHostDecision, signal: AbortSignal) => Promise<boolean> = async () => true;
  const decisions: AppHostDecision[] = [];
  const testRegistry = { ...registry, requireSessionRoute: (site: Parameters<typeof registry.requireSessionRoute>[0]) => {
    const binding = registry.requireSessionRoute(site);
    return { ...binding, subject: { ...binding.subject, probe: async () => subject,
      probeIdentity: async () => ({ subject, displayName: "@fixture" }) } };
  } };
  const connections = new Connections(environment, () => testRegistry, async () => {}, () => now);
  const service = new AppHostService("com.example.product", environment, { connections, now: () => now,
    confirm: async (decision, signal) => { decisions.push(decision); return confirmation(decision, signal); } });
  services.push(service);
  const begin = async () => connection(await service.handle({ action: "connection.begin", browser: "chrome", profile: "Default", id: null, expectedRevision: null }));
  const verify = async (attemptId: string) => connection(await service.handle({ action: "connection.verify", attemptId }));
  const commit = async (verified: Extract<AppHostData, { kind: "connection" }>) => service.handle({ action: "connection.commit", attemptId: verified.attemptId, expectedSubject: verified.subject!, expectedDigest: verified.commitDigest! });
  return { environment, service, decisions, begin, verify, commit, setSubject: (value: string) => { subject = value; },
    setNow: (value: number) => { now = value; }, setConfirmation: (value: typeof confirmation) => { confirmation = value; } };
}
function connection(value: AppHostData): Extract<AppHostData, { kind: "connection" }> {
  if (value.kind !== "connection") throw new Error("Expected connection");
  return value;
}

test("connection requires exact native confirmation, persists provider identity, and is not a live-health claim", async () => {
  const f = fixture();
  const begun = await f.begin();
  const verified = await f.verify(begun.attemptId);
  expect(listAuth(f.environment)).toEqual([]);
  expect(await f.commit(verified)).toEqual({ kind: "success" });
  expect(f.decisions).toEqual([{ action: "connect", appId: "com.example.product", id: begun.id, subject: "12345", displayName: "@fixture", browser: "chrome", profile: "Default" }]);
  const listed = await f.service.handle({ action: "accounts.list" });
  expect(listed).toMatchObject({ kind: "accounts", accounts: [{ id: begun.id, provider: "x", subject: "12345", status: "configured", identityVerification: "at-connection" }] });
  expect(loadAuthSnapshot(begun.id, f.environment).auth).toMatchObject({ provider: "x" });
  await expect(f.commit(verified)).rejects.toThrow("expired");
  await expect(f.begin()).rejects.toThrow("browser profile is already connected");
});

test("denial, cancellation, expiry, and viewer drift cannot persist a connection", async () => {
  for (const failure of ["denied", "cancelled", "expired", "switched"] as const) {
    const f = fixture();
    const verified = await f.verify((await f.begin()).attemptId);
    f.setConfirmation(async () => {
      if (failure === "cancelled") await f.service.handle({ action: "connection.cancel", attemptId: verified.attemptId });
      if (failure === "expired") f.setNow(600_101);
      if (failure === "switched") f.setSubject("98765");
      return failure !== "denied";
    });
    await expect(f.commit(verified)).rejects.toThrow();
    expect(listAuth(f.environment)).toEqual([]);
    await expect(f.commit(verified)).rejects.toThrow();
    expect(f.decisions).toHaveLength(1);
  }
});

test("stale or forged decision digests never open the native prompt", async () => {
  const f = fixture();
  const verified = await f.verify((await f.begin()).attemptId);
  await expect(f.commit({ ...verified, commitDigest: "0".repeat(64) })).rejects.toThrow("Verify");
  await expect(f.commit(verified)).rejects.toThrow("Verify");
  expect(f.decisions).toEqual([]);
  expect(listAuth(f.environment)).toEqual([]);
});

test("disconnect rechecks the exact account incarnation after native confirmation", async () => {
  const f = fixture();
  const verified = await f.verify((await f.begin()).attemptId);
  await f.commit(verified);
  const list = await f.service.handle({ action: "accounts.list" });
  if (list.kind !== "accounts") throw new Error("Expected accounts");
  const account = list.accounts[0]!;
  f.setConfirmation(async () => {
    const saved = loadAuthSnapshot(account.id, f.environment).auth;
    removeAuth(account.id, f.environment);
    saveAuth(saved, f.environment);
    return true;
  });
  const request = { action: "connection.disconnect" as const, id: account.id, expectedRevision: account.revision, expectedDigest: account.disconnectDigest };
  await expect(f.service.handle(request)).rejects.toThrow("account changed");
  expect(listAuth(f.environment)).toHaveLength(1);
  await expect(f.service.handle(request)).rejects.toThrow("Refresh");
});

test("close aborts an active native prompt and prevents a delayed affirmative result", async () => {
  const f = fixture();
  const verified = await f.verify((await f.begin()).attemptId);
  let opened!: () => void;
  const ready = new Promise<void>(resolve => { opened = resolve; });
  f.setConfirmation(async (_decision, signal) => {
    opened();
    return await new Promise<boolean>(resolve => signal.addEventListener("abort", () => resolve(true), { once: true }));
  });
  const commit = f.commit(verified);
  await ready;
  await f.service.handle({ action: "close" });
  await expect(commit).rejects.toThrow();
  expect(listAuth(f.environment)).toEqual([]);
});

test("generated changed numeric subjects cannot inherit the verified decision", async () => {
  await assertAsyncProperty(fc.asyncProperty(fc.integer({ min: 20000, max: 99999 }), async subject => {
    const f = fixture();
    const verified = await f.verify((await f.begin()).attemptId);
    f.setConfirmation(async () => { f.setSubject(String(subject)); return true; });
    await expect(f.commit(verified)).rejects.toThrow("account changed");
    expect(listAuth(f.environment)).toEqual([]);
    f.service.close();
  }), { numRuns: 8 });
});
