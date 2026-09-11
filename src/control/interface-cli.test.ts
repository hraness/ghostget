import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { manifestHash, parseRuntimeManifest, type GhostgetManifest } from "../model";
import { providerPluginRegistry as registry } from "../provider-plugins";
import { ghostgetStateHome, installManifest, loadInstalledManifestSnapshot } from "../storage";
import { ghostgetUsage } from "../usage";
import { parseInterfaceDocument, type InterfaceContext } from "./interfaces";
import type { InterfaceView } from "./protocol";
import { saveWebPolicy } from "./web-policy";

const cliPath = fileURLToPath(new URL("../cli.ts", import.meta.url));
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-interface-cli-")));
  chmodSync(root, 0o700); roots.push(root);
  const environment = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: process.env.HOME ?? "", TMPDIR: tmpdir(), GHOSTGET_STATE_HOME: join(root, "state") };
  return { root, environment, stateHome: ghostgetStateHome(environment), registry };
}

async function run(f: ReturnType<typeof fixture>, args: readonly string[], entrypoint = cliPath) {
  const child = Bun.spawn([process.execPath, "--no-env-file", "--no-install", entrypoint, ...args], { cwd: f.root, env: f.environment, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  // An unexpected parser/transport regression must not leave a test child alive.
  const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { exitCode, stdout, stderr };
  } finally { clearTimeout(timer); }
}

function installed(f: InterfaceContext, id: string): GhostgetManifest {
  const source: unknown = JSON.parse(readFileSync(new URL("../assets/adapters/x/wrench-adapter.json", import.meta.url), "utf8"));
  const parsed = parseRuntimeManifest({ ...(source as Record<string, unknown>), id }, registry);
  if (!parsed.ok) throw new Error("Invalid synthetic adapter");
  installManifest(parsed.value, { force: false, ...f });
  return parsed.value;
}

function json<T>(result: Awaited<ReturnType<typeof run>>): T {
  expect(result.exitCode).toBe(0); expect(result.stderr).toBe("");
  return JSON.parse(result.stdout) as T;
}

describe("public interface CLI", () => {
  test("the actual entrypoint advertises draft-only activation and routes subcommand help", async () => {
    const f = fixture();
    const help = await run(f, ["--help"]);
    expect(help).toEqual({ exitCode: 0, stdout: ghostgetUsage, stderr: "" });
    expect(help.stdout).toContain("ghostget web request <https-url> [--method GET|HEAD]");
    expect(help.stdout).toContain("ghostget interface import <openapi.json>");
    expect(help.stdout).toContain("Save an inert draft; review and activate it in the native app");
    for (const args of [["interface"], ["interface", "--help"]]) {
      const result = await run(f, args);
      expect(result.exitCode).toBe(0); expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Import saves an inert draft. Review and activate it in the native app.");
    }
    expect((await run(f, ["web", "--help"])).stdout).toContain("Configure rules and approvals in the Ghostget native app.");
  });

  test("export, import and list round-trip an editable draft without activating it", async () => {
    const f = fixture(); const original = installed(f, "cli-source");
    const exported = await run(f, ["interface", "export", original.id]);
    expect(exported.exitCode).toBe(0); expect(exported.stderr).toBe("");
    expect(parseInterfaceDocument(exported.stdout, registry).adapters[0]?.manifest).toEqual(original);
    const composed = await run(f, ["interface", "export"]);
    expect(composed.exitCode).toBe(0);
    expect(parseInterfaceDocument(composed.stdout, registry).adapters.map(adapter => adapter.id)).toContain(original.id);
    const path = join(f.root, "draft.openapi.json");
    writeFileSync(path, exported.stdout.replaceAll("cli-source", "cli-draft"), { mode: 0o600 });
    const first = json<{ draft: InterfaceView }>(await run(f, ["interface", "import", "draft.openapi.json"])).draft;
    expect(first).toMatchObject({ id: "cli-draft", source: "user", state: "draft", activeDigest: null, adapterIds: ["cli-draft"] });
    expect(loadInstalledManifestSnapshot("cli-draft", f.environment, registry).availability).toBe("absent");
    expect(json<{ interfaces: InterfaceView[] }>(await run(f, ["interface", "list"])).interfaces).toEqual([first]);

    const updated = JSON.parse(readFileSync(path, "utf8")) as { info: { title: string } };
    updated.info.title = "Edited in user space"; writeFileSync(path, JSON.stringify(updated));
    const conflict = await run(f, ["interface", "import", path]);
    expect(conflict.exitCode).toBe(1); expect(conflict.stdout).toBe("");
    expect(JSON.parse(conflict.stderr)).toMatchObject({ ok: false, code: "INTERFACE_INVALID" });
    expect(conflict.stderr).not.toContain(path);
    const second = json<{ draft: InterfaceView }>(await run(f, ["interface", "import", path, "--expected-digest", first.digest])).draft;
    expect(second.title).toBe("Edited in user space"); expect(second.digest).not.toBe(first.digest);
    expect(second.activeDigest).toBeNull();
    expect((await run(f, ["interface", "import", path, "--expected-digest", first.digest])).exitCode).toBe(1);
    expect((await run(f, ["interface", "activate", first.id])).exitCode).toBe(1);
    expect(loadInstalledManifestSnapshot("cli-draft", f.environment, registry).availability).toBe("absent");
    const before = loadInstalledManifestSnapshot(original.id, f.environment, registry);
    expect(before.result.ok && manifestHash(before.result.value)).toBe(manifestHash(original));
  });

  test("unsupported endpoints remain visible and inert after public import", async () => {
    const f = fixture(); const path = join(f.root, "future.openapi.json");
    writeFileSync(path, JSON.stringify({ openapi: "3.1.1", info: { title: "Future local interface", version: "1.0.0" }, servers: [{ url: "https://uncontacted.invalid" }], paths: { "/items": { get: { operationId: "readItems", responses: { "200": { description: "Items" } } } } } }), { mode: 0o600 });
    const draft = json<{ draft: InterfaceView }>(await run(f, ["interface", "import", path])).draft;
    expect(draft).toMatchObject({ source: "user", state: "needs-executor", operationCount: 1, activationTargets: [], adapterIds: [] });
    expect(draft.issues[0]).toContain("HTTP description is inert");
    expect(json<{ interfaces: InterfaceView[] }>(await run(f, ["interface", "list"])).interfaces).toEqual([draft]);
  });

  test("foreign file bounds, duplicate keys and unsupported CLI options fail without activation or path disclosure", async () => {
    const f = fixture(); const oversized = join(f.root, "oversized-private-file.json"); const malformed = join(f.root, "malformed-private-file.json"); const link = join(f.root, "linked-private-file.json");
    writeFileSync(oversized, " ".repeat(524_289), { mode: 0o600 });
    writeFileSync(malformed, '{"openapi":"3.1.1","openapi":"3.1.0"}', { mode: 0o600 });
    symlinkSync(malformed, link);
    for (const args of [
      ["interface", "import", oversized], ["interface", "import", malformed], ["interface", "import", link],
      ["interface", "import", f.root], ["interface", "import", malformed, "--force"],
      ["interface", "list", "--activate"], ["interface", "export", "../private"],
    ]) {
      const result = await run(f, args); expect(result.exitCode).toBe(1); expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr)).toMatchObject({ ok: false }); expect(result.stderr).not.toContain(f.root);
    }
    expect(json<{ interfaces: InterfaceView[] }>(await run(f, ["interface", "list"])).interfaces).toEqual([]);
  });

  test("gateway-only policy blocks raw URLs, aliases and private routes before any downstream command loader", async () => {
    const f = fixture(); saveWebPolicy([], true, 0, f.environment);
    const commands = [
      ["https://docs.example.com/"], ["clip", "https://docs.example.com/"], ["read", "https://docs.example.com/"],
      ["archive", "https://docs.example.com/"], ["pdf", "https://docs.example.com/"], ["url-metadata", "backfill"],
      ["operator", "doctor"], ["x", "posts.read"], ["invoke", "x", "posts.read"], ["confirm", "0".repeat(64)],
      ["auth", "login", "synthetic"], ["derive", "start", "synthetic", "https://docs.example.com/"],
      ["adapter", "scaffold"], ["plugins", "install", "synthetic"], ["interface", "import", "synthetic.openapi.json"],
    ];
    const entrypoint = join(f.root, "guard-entrypoint.ts");
    writeFileSync(entrypoint, `import { runGhostgetCliProcess } from ${JSON.stringify(cliPath)};\nconst results=[];\nfor(const args of ${JSON.stringify(commands)}){let stdout="";let stderr="";let loads=0;process.exitCode=0;const forbidden=()=>{loads++;throw new Error("Synthetic command loader must not execute");};await runGhostgetCliProcess(args,{stdout:value=>{stdout+=value;},stderr:value=>{stderr+=value;}},forbidden,forbidden,forbidden);results.push({args,stdout,stderr,loads,exitCode:process.exitCode});}\nprocess.exitCode=0;process.stdout.write(JSON.stringify(results));\n`, { mode: 0o600 });
    const results = json<{ args: string[]; stdout: string; stderr: string; loads: number; exitCode: number }[]>(await run(f, [], entrypoint));
    expect(results.map(result => result.args)).toEqual(commands);
    for (const result of results) { expect(result.loads).toBe(0); expect(result.exitCode).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).toContain("gateway-only policy blocks this command"); }
    expect((await run(f, ["web", "--help"])).exitCode).toBe(0);
    const request = await run(f, ["web", "request", "https://docs.example.com/"]);
    expect(request.exitCode).toBe(1); expect(JSON.parse(request.stderr)).toMatchObject({ code: "CONTROL_APP_REQUIRED" });
    for (const args of [["capabilities", "--json"], ["plugins", "list", "--json"], ["plugin", "show", "x-official", "--json"]]) expect((await run(f, args)).exitCode).toBe(0);
    rmSync(join(f.stateHome, "control", "web-policy.json"));
    const broken = await run(f, ["capabilities", "--json"]);
    expect(broken.exitCode).toBe(1); expect(broken.stdout).toBe(""); expect(broken.stderr).toContain("policy state is unavailable");
    expect((await run(f, ["--help"])).stdout).toBe(ghostgetUsage);
  });
});
