import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { agentRequest } from "./approval-client";
import { saveWebPolicy } from "./web-policy";
import { parseAgentSetupResponse } from "./setup-model";

const roots: string[] = []; afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() { const root = realpathSync(mkdtempSync(join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "gg-setup-"))); chmodSync(root, 0o700); roots.push(root); const home = join(root, "home"); mkdirSync(home, { mode: 0o700 }); return { root, environment: { HOME: home, PATH: "/usr/bin:/bin", GHOSTGET_STATE_HOME: join(root, "state") } }; }
async function cli(f: ReturnType<typeof fixture>, args: string[]) {
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", fileURLToPath(new URL("../cli.ts", import.meta.url)), ...args], { cwd: f.root, env: f.environment, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
  try { const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]); return { exit, stdout, stderr }; } finally { clearTimeout(timer); }
}
test("public setup help and absent-app status are ergonomic without creating state", async () => {
  const f = fixture();
  const help = await cli(f, ["setup", "--help"]); expect(help.exit).toBe(0); expect(help.stdout).toContain("Stage a service suggestion"); expect(help.stderr).toBe("");
  const status = await cli(f, ["setup", "--json"]); expect(status.exit).toBe(0); expect(status.stderr).toBe("");
  expect(JSON.parse(status.stdout)).toMatchObject({ app: "unavailable", configuredAccountCount: null, setupRequests: [], nextActions: [{ action: "open-app", command: null }] });
  // The runtime may create macOS HOME/Library caches; product state must remain absent.
  expect(readdirSync(f.root)).toEqual(["home"]);
  const bad = await cli(f, ["setup", "request", "x-web", "--scan"]); expect(bad.exit).toBe(2); expect(bad.stdout).toBe(""); expect(readdirSync(f.root)).toEqual(["home"]);
});
test("gateway-only setup routes stay inert and reject extra mutation or profile arguments", async () => {
  const f = fixture(); saveWebPolicy([], true, 0, f.environment);
  expect((await cli(f, ["setup", "status", "--json"])).exit).toBe(0);
  expect((await cli(f, ["setup", "request", "x-web", "--json"])).exit).toBe(1);
  for (const args of [["setup", "permission.enable"], ["setup", "request", "x-web", "--profile", "Default"], ["setup", "discovery.configure", "true"]]) expect((await cli(f, args)).exit).toBe(1);
  expect(existsSync(join(f.environment.GHOSTGET_STATE_HOME, "control", "browser-discovery.json"))).toBe(false);
});
test("actual helper stages bounded CLI suggestions while rejecting agent administrative actions", async () => {
  const f = fixture();
  const helper = Bun.spawn([process.execPath, "--no-env-file", "--no-install", fileURLToPath(new URL("./helper.ts", import.meta.url))], { cwd: f.root, env: f.environment, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  const helperOutput = new Response(helper.stdout).text(); const helperErrors = new Response(helper.stderr).text();
  const limit = setTimeout(() => helper.kill("SIGKILL"), 30000);
  try {
    const deadline = performance.now() + 15000;
    while (!existsSync(join(f.environment.GHOSTGET_STATE_HOME, "control", "agent.sock"))) { if (performance.now() >= deadline) throw new Error("Helper startup deadline"); await Bun.sleep(20); }
    const request = await cli(f, ["setup", "request", "x-web", "--json"]); expect(request.exit).toBe(0); expect(request.stderr).toBe("");
    const value = JSON.parse(request.stdout) as { requestId: string; setupRequests: unknown[]; configuredAccountCount: number };
    expect(value.setupRequests).toHaveLength(1); expect(value.configuredAccountCount).toBe(0);
    const duplicate = JSON.parse((await cli(f, ["setup", "request", "x-web", "--json"])).stdout) as { requestId: string }; expect(duplicate.requestId).toBe(value.requestId);
    for (const action of ["discovery.configure", "permission.enable", "connection.begin"]) {
      const response = await agentRequest({ protocol: "ghostget.setup/1", action, enabled: true }, { environment: f.environment });
      expect(response).toMatchObject({ ok: false });
    }
    expect(existsSync(join(f.environment.GHOSTGET_STATE_HOME, "control", "browser-discovery.json"))).toBe(false);
    expect((await cli(f, ["setup", "cancel", value.requestId, "--json"])).exit).toBe(0);
    expect(parseAgentSetupResponse(await agentRequest({ protocol: "ghostget.setup/1", action: "status" }, { environment: f.environment })).setupRequests).toEqual([]);
  } finally {
    await helper.stdin.end(); const cleanup = setTimeout(() => helper.kill("SIGKILL"), 5000);
    try { expect(await helper.exited).toBe(0); expect(await helperOutput).toBe(""); expect(await helperErrors).toBe(""); expect(existsSync(join(f.environment.GHOSTGET_STATE_HOME, "control", "owner.json"))).toBe(false); }
    finally { clearTimeout(cleanup); clearTimeout(limit); }
  }
});
