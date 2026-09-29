import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, type CliIO } from "@hraness/desktop-foundation/registry";
import type { requireHuman } from "@hraness/desktop-foundation/human-gate";
import { ghostgetStateHome } from "../storage";
import { readOperationPolicy } from "../operation-permission-store";
import { spawnHelper } from "./helper-client";
import { ghostgetRegistry, type ControlPorts } from "./registry";

// The CLI verbs against the real control helper: the evidence the retired menu
// adapter's real-helper tests used to carry.
const cleanups: (() => void)[] = [];
// Short, physical temp roots: macOS /tmp is a symlink and socket paths are capped at 104 bytes.
const tempBase = process.platform === "darwin" ? "/private/tmp" : realpathSync(tmpdir());
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });

function fixture() {
  const raw = realpathSync(mkdtempSync(join(tempBase, "ghostget-rh-"))); chmodSync(raw, 0o700);
  cleanups.push(() => rmSync(raw, { recursive: true, force: true }));
  const environment = { GHOSTGET_STATE_HOME: raw, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: process.env.HOME ?? "", USER: process.env.USER ?? "", LOGNAME: process.env.LOGNAME ?? "", TMPDIR: tempBase };
  ghostgetStateHome(environment);
  const ports: ControlPorts = {
    environment,
    owner: async () => null,
    transient: () => spawnHelper(environment),
    startOwner: async () => spawnHelper(environment),
    platform: process.platform,
    now: () => Date.now(),
    retireTray: async () => [],
    legacyTrayItems: () => [],
  };
  const registry = ghostgetRegistry(() => ports);
  const gate: typeof requireHuman = async (opts) => ({ ok: true, proof: { tier: "T1T2", digest: opts.digest, confirmedAt: new Date(0).toISOString() } });
  const run = async (args: string[], io: Partial<CliIO> = {}) => {
    let stdout = ""; let stderr = "";
    const code = await runCli(registry, args, { stdout: { write: (t: string) => { stdout += t; } }, stderr: { write: (t: string) => { stderr += t; } }, env: { NODE_ENV: "test" }, audience: "human", gate, ...io });
    return { code, stdout, stderr, json: stdout.trim().startsWith("{") ? JSON.parse(stdout) : null };
  };
  return { environment, run };
}

describe("control verbs through the real helper", () => {
  test("permissions enable applies one revision-checked mutation; a stale revision is rejected, not retried", async () => {
    const { environment, run } = fixture();
    const before = await run(["permissions", "list", "--json"]);
    expect(before.code).toBe(0);
    expect(before.json.data.policy.managed).toBe(false);
    const revision = String(before.json.data.policy.revision);
    const enabled = await run(["permissions", "enable", "--expected-revision", revision, "--json"]);
    expect(enabled.code).toBe(0);
    const after = await run(["permissions", "list", "--json"]);
    expect(after.json.data.policy.managed).toBe(true);
    expect(after.json.data.policy.revision).not.toBe(before.json.data.policy.revision);
    const policy = JSON.stringify(readOperationPolicy(environment));
    const stale = await run(["permissions", "enable", "--expected-revision", revision, "--json"]);
    expect(stale.code).not.toBe(0);
    expect(stale.json.ok).toBe(false);
    expect(JSON.stringify(readOperationPolicy(environment))).toBe(policy);
  });

  test("gateway-only web rules round-trip through the helper and show in status", async () => {
    const { run } = fixture();
    const status = await run(["status", "--json"]);
    expect(status.code).toBe(0);
    const revision = String(status.json.data.web.revision);
    expect(status.json.data.web.gatewayOnly).toBe(false);
    const rules = realpathSync(mkdtempSync(join(tempBase, "gg-rh-rules-")));
    cleanups.push(() => rmSync(rules, { recursive: true, force: true }));
    await Bun.write(`${rules}/rules.json`, "[]");
    const saved = await run(["web", "rules", "set", "--file", `${rules}/rules.json`, "--expected-revision", revision, "--gateway-only", "--json"]);
    expect(saved.code).toBe(0);
    const listed = await run(["status", "--json"]);
    expect(listed.code).toBe(0);
    expect(listed.json.data.web).toEqual({ revision: status.json.data.web.revision + 1, gatewayOnly: true, rules: 0 });
  });
});
