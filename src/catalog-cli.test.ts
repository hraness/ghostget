import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { runCapabilities, type GhostgetCatalogCommand } from "./catalog-cli";
import { parseRuntimeManifest, type GhostgetManifest } from "./model";
import { providerPluginRegistry } from "./provider-plugins";
import { syncBundledAdapters } from "./scripts/sync-bundled-adapters";
import { adapterManifestPath, installManifest, writePrivateJson } from "./storage";
import { assertProperty, fc } from "./test-support";

function catalogState() {
  const root = mkdtempSync(join(tmpdir(), "ghostget-catalog-"));
  chmodSync(root, 0o700);
  const environment = { GHOSTGET_STATE_HOME: join(root, "state"), HOME: root };
  return {
    environment,
    dispose: () => rmSync(root, { recursive: true, force: true }),
    install: (surface: string, filename: string, transform?: (manifest: GhostgetManifest) => GhostgetManifest) => {
      const parsed = parseRuntimeManifest(JSON.parse(readFileSync(join(
        import.meta.dir, "assets/adapters", surface, filename,
      ), "utf8")) as unknown, providerPluginRegistry);
      if (!parsed.ok) throw new Error(parsed.issues.join("; "));
      const manifest = transform === undefined ? parsed.value : transform(parsed.value);
      installManifest(manifest, { force: false, environment, registry: providerPluginRegistry });
      return manifest;
    },
    run: (options: Omit<Extract<GhostgetCatalogCommand, { readonly command: "capabilities" }>, "command">) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const exitCode = runCapabilities(
        { command: "capabilities", ...options },
        environment,
        { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) },
        providerPluginRegistry,
      );
      return { exitCode, stdout: stdout.join(""), stderr };
    },
  };
}

test("an empty capability catalog offers a public read and optional adapter setup", () => {
  const state = catalogState();
  try {
    const result = state.run({ json: false });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(result.stdout).toBe(
      "No adapters installed.\n"
      + "Read a public page now: ghostget read https://example.com\n"
      + "Install bundled adapter contracts: ghostget adapter sync-bundled\n"
      + "Exact full contracts in JSON: ghostget capabilities --json\n",
    );
    expect(state.run({ json: true }).stdout).toBe('{\n  "ok": true,\n  "adapters": []\n}\n');
  } finally {
    state.dispose();
  }
});

test("missing adapters retain exit three and JSON semantics with actionable human guidance", () => {
  const state = catalogState();
  try {
    const result = state.run({ adapterId: "missing", json: false });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toEqual([]);
    expect(result.stdout).toContain("Adapter missing is not installed.\n");
    expect(result.stdout).toContain("'ghostget capabilities'");
    expect(result.stdout).toContain("'ghostget adapter sync-bundled'");
    expect(state.run({ adapterId: "missing", json: true })).toEqual({
      exitCode: 3,
      stdout: '{\n  "ok": false,\n  "adapters": []\n}\n',
      stderr: [],
    });
  } finally {
    state.dispose();
  }
});

test("the real bundled installation renders one compact row per adapter and keeps full contracts in JSON", async () => {
  const state = catalogState();
  try {
    const installed = await syncBundledAdapters({
      environment: state.environment,
      registry: providerPluginRegistry,
      output: { stdout: () => undefined, stderr: () => undefined },
    });
    const jsonBefore = state.run({ json: true });
    const result = state.run({ json: false });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toEqual([]);
    expect(result.stdout).toStartWith(`Installed adapters (${installed.installed})\n`);
    const rows = result.stdout.split("\n").filter((line) => line.startsWith("  "));
    expect(rows).toHaveLength(installed.installed);
    expect(rows.every((line) => line.length < 240)).toBeTrue();
    expect(Buffer.byteLength(result.stdout)).toBeLessThan(12_000);
    expect(result.stdout).toContain("  x: X (Official API)");
    expect(result.stdout).toContain("  x-web: X (Authenticated Web API)");
    expect(result.stdout).toContain("  beeper-local:");
    expect(result.stdout).toContain("Operation details: ghostget capabilities <adapter>");
    expect(result.stdout).toContain("ghostget capabilities --json");
    expect(result.stdout).not.toContain("manifestHash");
    expect(result.stdout).not.toContain('"properties"');
    expect(result.stdout).not.toContain("artifacts");
    expect(jsonBefore.exitCode).toBe(0);
    expect(Buffer.byteLength(jsonBefore.stdout)).toBeGreaterThan(200_000);
    expect(state.run({ json: true })).toEqual(jsonBefore);
  } finally {
    state.dispose();
  }
});

test("adapter details distinguish OAuth scope alternatives, web contract availability, and local owner automation", () => {
  const state = catalogState();
  try {
    state.install("linkedin", "wrench-adapter.json");
    state.install("linkedin", "wrench-web-adapter.json");
    state.install("gmail", "wrench-adapter.json");
    state.install("beeper", "wrench-web-adapter.json");
    const provider = state.run({ adapterId: "linkedin", json: false });
    expect(provider.exitCode).toBe(0);
    expect(provider.stdout).toContain("provider-api; contract observed; R1");
    expect(provider.stdout).toContain("OAuth scopes (one complete set): [r_1st_connections + r_liteprofile]");
    expect(provider.stdout).toContain("[r_member_social] or [r_organization_social]");
    expect(provider.stdout).toContain("* marks a required input.");
    expect(provider.stdout).toContain("ghostget capabilities linkedin --json");
    expect(provider.stdout).not.toContain("LinkedIn (Authenticated Web API)");
    const web = state.run({ adapterId: "linkedin-web", json: false });
    expect(web.exitCode).toBe(0);
    expect(web.stdout).toContain("messaging.read (web-session-api; contract capture-required; R1)");
    expect(web.stdout).toContain("Unavailable until its contract is captured and reviewed.");
    expect(web.stdout).not.toContain("OAuth scopes");
    const gmail = state.run({ adapterId: "gmail", json: false });
    expect(gmail.stdout).toContain("https://www.googleapis.com/auth/gmail.readonly");
    const local = state.run({ adapterId: "beeper-local", json: false });
    expect(local.exitCode).toBe(0);
    expect(local.stdout).toContain("messaging.send (local-cli; contract observed; R3)");
    expect(local.stdout).toContain("Scoped owner automation permission; use ghostget messaging automation serve --stdio. Generic invocation is unavailable.");
    expect(local.stdout).toContain("Effect:");
    expect(local.stdout).not.toContain("OAuth scopes");
    expect(local.stdout).not.toContain("artifacts");
  } finally {
    state.dispose();
  }
});

test("invalid installed manifests stay visible without masquerading as usable operations", () => {
  const state = catalogState();
  try {
    writePrivateJson(adapterManifestPath("broken", state.environment), { schemaVersion: 0 }, { privateParent: true });
    expect(state.run({ json: false }).stdout).toContain("  broken (invalid manifest)");
    const detail = state.run({ adapterId: "broken", json: false });
    expect(detail.exitCode).toBe(0);
    expect(detail.stdout).toContain("schemaVersion");
    expect(detail.stdout).toContain("ghostget capabilities broken --json");
    const json = state.run({ adapterId: "broken", json: true });
    expect(JSON.parse(json.stdout)).toMatchObject({
      ok: true,
      adapters: [{ id: "broken", invalid: true }],
    });
  } finally {
    state.dispose();
  }
});

test("installed terminal text cannot inject catalog rows or expose credential-shaped text", () => {
  const state = catalogState();
  try {
    state.install("beeper", "wrench-web-adapter.json", (manifest) => ({
      ...manifest,
      displayName: "Beeper\u009b31m red\u009b0m\u2028FORGED ROW\u202e",
      operations: Object.fromEntries(Object.entries(manifest.operations).map(([id, operation]) => [id, {
        ...operation,
        description: "Read\u009d0;forged title\u009c\u2029FORGED DETAIL Authorization: Bearer catalog-test-secret",
      }])),
    }));
    for (const options of [{ json: false }, { adapterId: "beeper-local", json: false }]) {
      const result = state.run(options);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
      expect(result.stdout).not.toContain("\nFORGED");
      expect(result.stdout).not.toContain("catalog-test-secret");
      expect(result.stdout).toContain("Beeper red FORGED ROW");
    }
  } finally {
    state.dispose();
  }
});

test("arbitrary missing adapter text stays on its own terminal line", () => {
  const state = catalogState();
  try {
    assertProperty(fc.property(
      fc.array(fc.oneof(fc.string({ maxLength: 16 }), fc.constantFrom(
        "\n", "\r", "\u001b[31m", "\u001b]0;title\u0007", "\u202e", "\u009b2J",
      )), { maxLength: 16 }),
      (parts) => {
        const result = state.run({ adapterId: parts.join(""), json: false });
        expect(result.exitCode).toBe(3);
        expect(result.stdout.split("\n")).toHaveLength(4);
        expect(result.stdout).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
      },
    ), { numRuns: 64 });
  } finally {
    state.dispose();
  }
});

test("catalogs the installed local CLI capability with its exact contract and tool pin", () => {
  const root = mkdtempSync(join(tmpdir(), "wrench-local-cli-catalog-"));
  chmodSync(root, 0o700);
  const stdout: string[] = [];
  const stderr: string[] = [];
  try {
    const environment = { GHOSTGET_STATE_HOME: join(root, "state"), HOME: root };
    const parsed = parseRuntimeManifest(JSON.parse(readFileSync(join(
      import.meta.dir,
      "assets/adapters/beeper/wrench-web-adapter.json",
    ), "utf8")) as unknown, providerPluginRegistry);
    expect(parsed.ok).toBeTrue();
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    installManifest(parsed.value, {
      force: false,
      environment,
      registry: providerPluginRegistry,
    });
    const exitCode = runCapabilities(
      { command: "capabilities", adapterId: "beeper-local", json: true },
      environment,
      {
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
      },
      providerPluginRegistry,
    );
    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const view = JSON.parse(stdout.join("")) as {
      readonly ok: boolean;
      readonly adapters: readonly {
        readonly id: string;
        readonly operations: readonly Record<string, unknown>[];
      }[];
    };
    expect(view.ok).toBeTrue();
    expect(view.adapters).toHaveLength(1);
    expect(view.adapters[0]?.id).toBe("beeper-local");
    const operation = view.adapters[0]?.operations.find((entry) =>
      entry.id === "messaging.send");
    expect(operation).toMatchObject({
      transport: "local-cli",
      surface: "beeper",
      localCliAction: "messaging.send",
      localCliContractVersion: 1,
      state: "observed",
      localCliTool: {
        schemaVersion: 1,
        id: "beeper-cli",
        versionScheme: "semver",
      },
    });
    expect(operation?.localCliContractHash).toMatch(/^[a-f0-9]{64}$/u);
    const tool = operation?.localCliTool as {
      readonly artifacts?: readonly unknown[];
    } | undefined;
    expect(tool?.artifacts).toHaveLength(4);
    for (const [operationId, contractVersion] of [
      ["accounts.list", 2],
      ["bridges.list", 2],
      ["contacts.list", 3],
      ["messaging.search", 2],
      ["conversations.read", 2],
      ["messaging.content.search", 2],
      ["messaging.read", 3],
    ] as const) {
      expect(view.adapters[0]?.operations.find((entry) =>
        entry.id === operationId)).toMatchObject({
          transport: "local-cli",
          surface: "beeper",
          localCliAction: operationId,
          localCliContractVersion: contractVersion,
          state: "observed",
        });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
