import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StartupResult } from "@hraness/cli-update";
import { runGhostgetExecutable } from "./cli";
import { saveWebPolicy } from "./control/web-policy";
import { ghostgetUpdateOptions } from "./update";
import { GHOSTGET_VERSION } from "./version";

const roots: string[] = [];
const originalDepth = process.env.GHOSTGET_CLI_DEPTH;
const originalExit = process.exitCode;
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (originalDepth === undefined) delete process.env.GHOSTGET_CLI_DEPTH;
  else process.env.GHOSTGET_CLI_DEPTH = originalDepth;
  process.exitCode = originalExit ?? 0;
});

function isolatedEnvironment(): NodeJS.ProcessEnv {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "ghostget-update-test-"));
  roots.push(root);
  return { GHOSTGET_STATE_HOME: join(root, "state") };
}

test("the executable keeps static help and version outside the updater", async () => {
  for (const args of [[], ["help"], ["--help"], ["--version"], ["-V", "--json"], ["help", "update"], ["update", "--help"], ["control", "--help"], ["web", "--help"], ["url-metadata", "--help"], ["media", "--help"], ["vault"], ["web"], ["interface"], ["vault", "import-x", "help"], ["menubar", "status", "--help"], ["support", "protocol"], ["support", "protocol", "--json"]]) {
    let ran = false;
    await runGhostgetExecutable(args, async () => { throw new Error("Static output must not load the updater"); }, async forwarded => {
      expect(forwarded).toEqual(args); ran = true;
    });
    expect(ran).toBeTrue();
  }
});

test("update handling stops before product work and preserves root depth for re-entry", async () => {
  delete process.env.GHOSTGET_CLI_DEPTH;
  await runGhostgetExecutable(["read", "https://example.com"], async (args, depth) => {
    expect(args).toEqual(["read", "https://example.com"]); expect(depth).toBe(0);
    expect(process.env.GHOSTGET_CLI_DEPTH).toBeUndefined();
    return { handled: true, exitCode: 37, release: async () => {} };
  }, async () => { throw new Error("The old executable must not run after an update"); });
  expect(process.exitCode).toBe(37); expect(process.env.GHOSTGET_CLI_DEPTH).toBeUndefined();
});

test("the executable holds its update lease through product completion and failure", async () => {
  for (const fails of [false, true]) {
    process.env.GHOSTGET_CLI_DEPTH = "1";
    const events: string[] = [];
    const invoke = () => runGhostgetExecutable(["read", "https://example.com"], async (_args, depth): Promise<StartupResult> => {
      expect(depth).toBe(1); events.push("update");
      return { handled: false, exitCode: 0, release: async () => { events.push("release"); } };
    }, async () => {
      expect(process.env.GHOSTGET_CLI_DEPTH).toBe("2"); events.push("product");
      if (fails) throw new Error("Product failed");
    });
    if (fails) await expect(invoke()).rejects.toThrow("Product failed"); else await invoke();
    expect(events).toEqual(["update", "product", "release"]);
  }
});

test("package replacement waits for telemetry initialization and preserves product results", async () => {
  for (const productFails of [false, true]) for (const telemetryFails of [false, true]) {
    delete process.env.GHOSTGET_CLI_DEPTH;
    const events: string[] = [];
    let finishTelemetry!: () => void, telemetryStarted!: () => void;
    const pending = new Promise<void>(resolve => { finishTelemetry = resolve; });
    const started = new Promise<void>(resolve => { telemetryStarted = resolve; });
    const running = runGhostgetExecutable(["read", "https://example.com"], async () => ({
      handled: false, exitCode: 0, release: async () => { events.push("release"); },
    }), async () => {
      events.push("product");
      if (productFails) throw new Error("Product failed");
    }, async () => {
      telemetryStarted();
      await pending;
      events.push("telemetry");
      if (telemetryFails) throw new Error("Optional telemetry failed");
    });
    await started;
    expect(events).toEqual(["product"]);
    finishTelemetry();
    if (productFails) await expect(running).rejects.toThrow("Product failed"); else await running;
    expect(events).toEqual(["product", "telemetry", "release"]);
  }
});

test("GhostGet fixes the release source and actual entrypoint without creating product state", () => {
  const environment = isolatedEnvironment();
  const options = ghostgetUpdateOptions(["read", "https://example.com"], 0, environment);
  expect(options.packageName).toBe("@hraness/ghostget"); expect(options.version).toBe(GHOSTGET_VERSION);
  expect(options.entrypoint).toBe(join(import.meta.dir, "cli.ts"));
  expect(options.provider).toEqual({ kind: "github", repository: "hraness/ghostget", assetName: "hraness-ghostget-{version}.tgz" });
  expect(options.effectFree).toBeFalse(); expect(options.nested).toBeFalse(); expect(options.suppressAutomatic).toBeFalse();
  expect(existsSync(environment.GHOSTGET_STATE_HOME!)).toBeFalse();
});

test("inspection and nested clients suppress incidental updates", () => {
  const environment = isolatedEnvironment();
  for (const args of [["status"], ["capabilities"], ["doctor"], ["operator", "doctor", "--json"], ["support", "offer", "--json"], ["commands", "--json"], ["control", "serve"], ["control", "stop"], ["tui", "--snapshot"], ["plugin", "list"], ["plugin", "show", "x-official"], ["invoke", "x", "read", "--cache-only"], ["invoke", "x", "read", "--projection-identity-only"]]) {
    expect(ghostgetUpdateOptions(args, 0, environment).suppressAutomatic).toBeTrue();
  }
  for (const depth of [1, 8, null]) expect(ghostgetUpdateOptions(["read", "https://example.com"], depth, environment).nested).toBeTrue();
  expect(ghostgetUpdateOptions(["media", "convert", "--help"], 0, environment).suppressAutomatic).toBeTrue();
  expect(ghostgetUpdateOptions(["read", "https://example.com", "--", "--help"], 0, environment).suppressAutomatic).toBeFalse();
});

test("gateway-only policy prevents update access and is unchanged by inspection", () => {
  const environment = isolatedEnvironment();
  saveWebPolicy([], true, 0, environment);
  const policy = join(environment.GHOSTGET_STATE_HOME!, "control", "web-policy.json"), before = readFileSync(policy, "utf8");
  expect(() => ghostgetUpdateOptions(["update"], 0, environment)).toThrow("web gateway requests only");
  expect(ghostgetUpdateOptions(["web", "request", "https://example.com"], 0, environment).suppressAutomatic).toBeTrue();
  expect(readFileSync(policy, "utf8")).toBe(before);
});
