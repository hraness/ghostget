import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "bun:test";
import { runCli, type CliIO } from "@hraness/desktop-foundation/registry";
import type { requireHuman } from "@hraness/desktop-foundation/human-gate";
import type { HelperClient } from "./helper-client";
import type { ControlRequest, ControlResponse, ControlSnapshot } from "./protocol";
import { ghostgetRegistry, ghostgetVerbs, type ControlPorts } from "./registry";
import { REGISTRY_WORDS, registryOwns } from "./registry-words";

const DIGEST = "a".repeat(64);
const ROOT = realpathSync(mkdtempSync(join(tmpdir(), "gg-reg-")));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));
const snapshot: ControlSnapshot = JSON.parse(JSON.stringify({
  version: "0.0.0-test", accountId: null, accounts: [], capabilities: [], interfaces: [
    { id: "draft1", title: "Draft", digest: DIGEST, activationTargets: [{ adapterId: "x", installedDigest: null }] },
  ], policy: { managed: true, revision: 3 }, web: { revision: 1, gatewayOnly: false, rules: [] },
  approvals: [], connectionProviders: [], vault: { provider: "1password", available: false, purpose: "x-user-token-import" },
}));

function harness(options: { owner?: boolean; answer?: (request: ControlRequest) => ControlResponse } = {}) {
  const sent: ControlRequest[] = [];
  const client: HelperClient = {
    request: async (request) => {
      sent.push(request);
      if (options.answer !== undefined) return options.answer(request);
      if (request.action === "snapshot") return { ok: true, data: { kind: "snapshot", snapshot } };
      if (request.action === "approval.list") return { ok: true, data: { kind: "approvals", approvals: [] } };
      return { ok: true, data: { kind: "success", message: `did ${request.action}` } };
    },
    close: () => undefined,
  };
  const ports: ControlPorts = {
    environment: { GHOSTGET_STATE_HOME: join(ROOT, "state") },
    owner: async () => (options.owner === false ? null : client),
    transient: () => client,
    startOwner: async () => client,
    platform: "linux",
    now: () => 0,
  };
  const registry = ghostgetRegistry(() => ports);
  const run = async (args: string[], io: Partial<CliIO> = {}) => {
    let stdout = ""; let stderr = "";
    const code = await runCli(registry, args, { stdout: { write: (t: string) => { stdout += t; } }, stderr: { write: (t: string) => { stderr += t; } }, env: { NODE_ENV: "test" }, audience: "agent", ...io });
    return { code, stdout, stderr, json: stdout.trim().startsWith("{") ? JSON.parse(stdout) : null };
  };
  return { sent, run };
}

const confirmingGate: typeof requireHuman = async (opts) => ({ ok: true, proof: { tier: "T1T2", digest: opts.digest, confirmedAt: new Date(0).toISOString() } });

describe("ghostget control registry", () => {
  test("REGISTRY_WORDS names exactly the first words of registry verbs", () => {
    const firsts = new Set(ghostgetVerbs(() => { throw new Error("unused"); }).map((verb) => verb.path[0]!));
    // `commands` belongs to the shared grammar; `web` and `interface` are shared with existing dispatchers.
    const shared = new Set(["web", "interface"]);
    expect(new Set([...firsts].filter((w) => !shared.has(w)))).toEqual(new Set([...REGISTRY_WORDS].filter((w) => w !== "commands")));
    for (const verb of ghostgetVerbs(() => { throw new Error("unused"); })) expect(registryOwns(verb.path)).toBe(true);
    expect(registryOwns(["web", "fetch"])).toBe(false);
    expect(registryOwns(["interface", "list"])).toBe(false);
  });

  test("every administrative control action has a CLI route (menu parity)", () => {
    const protocol = readFileSync(new URL("./protocol.ts", import.meta.url), "utf8");
    const union = protocol.slice(protocol.indexOf("export type ControlRequest ="), protocol.indexOf("export type ControlData ="));
    const actions = [...union.matchAll(/action: "([a-z.]+)"/gu)].map((m) => m[1]!);
    const routes: Record<string, string> = {
      snapshot: "status", "approval.list": "approvals list", "approval.decide": "approvals decide",
      "permission.enable": "permissions enable", "permission.set": "permissions set", "web.save": "web rules set",
      "activity.query": "activity", "interface.save": "interface import", "interface.activate": "interface activate",
      "interface.export": "interface export", "connection.begin": "connections begin", "connection.verify": "connections verify",
      "connection.commit": "connections commit", "connection.cancel": "connections cancel", "connection.disconnect": "connections disconnect",
      "vault.import": "vault import-x", prompt: "prompt",
    };
    expect(new Set(actions)).toEqual(new Set(Object.keys(routes)));
    const verbPaths = new Set(ghostgetVerbs(() => { throw new Error("unused"); }).map((verb) => verb.path.join(" ")));
    const existing = new Set(["interface import", "interface export", "vault import-x"]);
    for (const route of Object.values(routes)) expect(verbPaths.has(route) || existing.has(route)).toBe(true);
  });

  test("commands --json lists every verb with its op class", async () => {
    const { run } = harness();
    const out = await run(["commands", "--json"]);
    expect(out.code).toBe(0);
    const paths = out.json.data.verbs.map((v: { path: string[] }) => v.path.join(" "));
    for (const expected of ["status", "approvals decide", "permissions set", "control serve", "control install", "interface activate"]) expect(paths).toContain(expected);
  });

  test("status --json carries the ghostget.status schema", async () => {
    const { run } = harness();
    const out = await run(["status", "--json"]);
    expect(out.code).toBe(0);
    expect(out.json.schema).toBe("ghostget.status/1");
  });

  test("allow-once needs a person; deny runs without one", async () => {
    const h = harness();
    const allow = await h.run(["approvals", "decide", "req1", "--digest", DIGEST, "allow-once", "--json"]);
    expect(allow.code).toBe(3);
    expect(allow.json.error.code).toBe("human-required");
    expect(h.sent).toEqual([]);
    const deny = await h.run(["approvals", "decide", "req1", "--digest", DIGEST, "deny", "--json"]);
    expect(deny.code).toBe(0);
    expect(h.sent).toEqual([{ action: "approval.decide", id: "req1", digest: DIGEST, decision: "deny" }]);
  });

  test("a confirmed gate lets allow-once through with the exact digest", async () => {
    const h = harness();
    const out = await h.run(["approvals", "decide", "req1", "--digest", DIGEST, "allow-once", "--json"], { audience: "human", gate: confirmingGate });
    expect(out.code).toBe(0);
    expect(h.sent).toEqual([{ action: "approval.decide", id: "req1", digest: DIGEST, decision: "allow-once" }]);
  });

  test("permissions set: only deny skips the gate", async () => {
    const h = harness();
    const base = ["permissions", "set", "x", "read", "--expected-revision", "3", "--capability-digest", DIGEST, "--json"];
    for (const loosening of ["allow", "ask"]) {
      const out = await h.run([...base.slice(0, 4), loosening, ...base.slice(4)]);
      expect(out.json.error.code).toBe("human-required");
    }
    expect(h.sent).toEqual([]);
    const deny = await h.run([...base.slice(0, 4), "deny", ...base.slice(4)]);
    expect(deny.code).toBe(0);
    expect(h.sent[0]).toMatchObject({ action: "permission.set", decision: "deny", expectedRevision: 3 });
  });

  test("interface activate reads the installed digest from the live snapshot and refuses a changed draft", async () => {
    const h = harness();
    const stale = await h.run(["interface", "activate", "draft1", "x", "--digest", "b".repeat(64), "--json"], { audience: "human", gate: confirmingGate });
    expect(stale.json.error.code).toBe("digest-mismatch");
    const ok = await h.run(["interface", "activate", "draft1", "x", "--digest", DIGEST, "--json"], { audience: "human", gate: confirmingGate });
    expect(ok.code).toBe(0);
    expect(h.sent.at(-1)).toEqual({ action: "interface.activate", id: "draft1", digest: DIGEST, adapterId: "x", expectedInstalledDigest: null });
  });

  test("owner-only verbs report owner-unavailable with a next step and exit 4", async () => {
    const h = harness({ owner: false });
    const out = await h.run(["approvals", "list", "--json"]);
    expect(out.code).toBe(4);
    expect(out.json.error.code).toBe("owner-unavailable");
    expect(out.json.error.next[0].command).toBe("ghostget control serve");
  });

  test("owner failures map to shared and ghostget.* codes", async () => {
    const conflict = harness({ answer: () => ({ ok: false, code: "STALE_REVISION", message: "stale" }) });
    const out = await conflict.run(["permissions", "set", "x", "read", "deny", "--expected-revision", "3", "--capability-digest", DIGEST, "--json"]);
    expect(out.code).toBe(5);
    expect(out.json.error.code).toBe("conflict");
    const locked = harness({ answer: () => ({ ok: false, code: "POLICY_LOCKED", message: "locked" }) });
    const other = await locked.run(["permissions", "set", "x", "read", "deny", "--expected-revision", "3", "--capability-digest", DIGEST, "--json"]);
    expect(other.json.error.code).toBe("ghostget.policy-locked");
  });

  test("malformed arguments are usage errors before any request", async () => {
    const h = harness();
    const out = await h.run(["permissions", "set", "x", "read", "deny", "--expected-revision", "01", "--capability-digest", DIGEST, "--json"]);
    expect(out.code).toBe(2);
    expect(h.sent).toEqual([]);
  });
});
