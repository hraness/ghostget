import { afterAll, describe, expect, test } from "bun:test";
import { connect } from "node:net";
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateStateDirectory } from "../storage";
import { ADMIN_STOP, adminCapabilityPath, adminOwnerRunning, adminRequest, adminSocketPath, controlDirectory, parseAdminFrame, startAdminServer } from "./admin-socket";
import { CONTROL_PROTOCOL, type ControlRequest } from "./protocol";

// Unix socket paths are capped near 104 bytes, and /tmp is a symlink on macOS.
const ROOT = realpathSync(mkdtempSync("/tmp/gga-"));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));
let n = 0;

async function owner() {
  const environment = { GHOSTGET_STATE_HOME: join(ROOT, `s${n++}`) };
  const directoryIdentity = ensurePrivateStateDirectory(controlDirectory(environment), environment);
  const handled: ControlRequest[] = []; let stops = 0;
  const server = await startAdminServer({
    environment, directoryIdentity, active: new Set(), closing: () => false,
    handle: async (request) => { handled.push(request); return { ok: true, data: { kind: "success", message: "handled" } }; },
    stop: () => { stops++; },
  });
  return { environment, directoryIdentity, server, handled, stops: () => stops };
}

function raw(path: string, line: string): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect({ path }); let out = "";
    socket.once("connect", () => socket.write(line));
    socket.on("data", (c) => { out += c.toString(); });
    socket.once("close", () => resolve(out));
    socket.once("error", () => resolve(out));
  });
}

describe("admin socket", () => {
  test("socket and capability are owner-only files", async () => {
    const o = await owner();
    expect(lstatSync(adminSocketPath(o.environment)).mode & 0o777).toBe(0o600);
    expect(lstatSync(adminCapabilityPath(o.environment)).mode & 0o777).toBe(0o600);
    expect(await adminOwnerRunning(o.environment)).toBe(true);
    await o.server.close(); o.server.removeOwned();
    expect(await adminOwnerRunning(o.environment)).toBe(false);
    expect(() => lstatSync(adminCapabilityPath(o.environment))).toThrow();
  });

  test("requests with the capability reach the handler; stop calls stop", async () => {
    const o = await owner();
    const response = await adminRequest(o.environment, { action: "approval.list" });
    expect(response).toEqual({ ok: true, data: { kind: "success", message: "handled" } });
    expect(o.handled).toEqual([{ action: "approval.list" }]);
    const stop = await adminRequest(o.environment, ADMIN_STOP);
    expect(stop.ok).toBe(true);
    expect(o.stops()).toBe(1);
    await o.server.close(); o.server.removeOwned();
  });

  test("a frame without the right capability never reaches the handler", async () => {
    const o = await owner();
    const line = (cap: string) => `${JSON.stringify({ cap, id: "x1", protocol: CONTROL_PROTOCOL, request: { action: "approval.list" } })}\n`;
    const wrong = JSON.parse(await raw(adminSocketPath(o.environment), line("0".repeat(64))));
    expect(wrong.ok).toBe(false);
    expect(wrong.code).toBe("CONTROL_CAPABILITY");
    const missing = JSON.parse(await raw(adminSocketPath(o.environment), `${JSON.stringify({ id: "x2", protocol: CONTROL_PROTOCOL, request: { action: "approval.list" } })}\n`));
    expect(missing.ok).toBe(false);
    expect(o.handled).toEqual([]);
    await o.server.close(); o.server.removeOwned();
  });

  test("the capability file is a fresh 32-byte secret per owner", async () => {
    const a = await owner(); const b = await owner();
    const capA = JSON.parse(readFileSync(adminCapabilityPath(a.environment), "utf8")).cap;
    const capB = JSON.parse(readFileSync(adminCapabilityPath(b.environment), "utf8")).cap;
    expect(capA).toMatch(/^[0-9a-f]{64}$/u);
    expect(capA).not.toBe(capB);
    for (const o of [a, b]) { await o.server.close(); o.server.removeOwned(); }
  });

  test("a live admin socket refuses a second owner", async () => {
    const o = await owner();
    await expect(startAdminServer({ environment: o.environment, directoryIdentity: o.directoryIdentity, active: new Set(), closing: () => false, handle: async () => ({ ok: false, code: "X", message: "x" }), stop: () => undefined })).rejects.toMatchObject({ code: "CONTROL_ALREADY_RUNNING" });
    await o.server.close(); o.server.removeOwned();
  });

  test("parseAdminFrame rejects extra keys, other protocols, and extra stop fields", () => {
    const cap = "c".repeat(64);
    expect(() => parseAdminFrame({ cap, id: "a", protocol: CONTROL_PROTOCOL, request: { action: "approval.list" }, extra: 1 }, cap)).toThrow();
    expect(() => parseAdminFrame({ cap, id: "a", protocol: "other/1", request: { action: "approval.list" } }, cap)).toThrow();
    expect(() => parseAdminFrame({ cap, id: "a", protocol: CONTROL_PROTOCOL, request: { action: ADMIN_STOP, now: true } }, cap)).toThrow();
    expect(parseAdminFrame({ cap, id: "a", protocol: CONTROL_PROTOCOL, request: { action: ADMIN_STOP } }, cap).request).toBe(ADMIN_STOP);
  });

  test("no owner means a typed owner-unavailable answer, never a throw", async () => {
    const environment = { GHOSTGET_STATE_HOME: join(ROOT, "none") };
    expect(await adminOwnerRunning(environment)).toBe(false);
    expect((await adminRequest(environment, { action: "approval.list" })).ok).toBe(false);
  });
});
