import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { bundledContractCatalog } from "./contracts-bundled.test-support";
import { parseContractCatalog } from "./contracts-catalog";
import { checkCollectionPlan, parseContractCheck } from "./contracts-check";
import {
  runContractsCatalog,
  runContractsCheck,
  runContractsSchema,
  type GhostgetContractsCommand,
} from "./contracts-cli";
import { parseCollectionPlan } from "./contracts-plan";
import { contractSchema } from "./contracts-schema";
import { schemaViolations } from "./contracts-schema.test-support";
import { main } from "./ghostget";
import { providerPluginRegistry } from "./provider-plugins";
import { syncBundledAdapters } from "./scripts/sync-bundled-adapters";
import { saveAuth } from "./auth";
import { adapterManifestPath, writePrivateJson } from "./storage";
import { GHOSTGET_VERSION } from "./version";

const hranessPlanPath = join(
  import.meta.dir,
  "..",
  "skills",
  "ghostget",
  "references",
  "hraness-social-profile-stats.json",
);
const NOW = new Date("2026-09-21T20:00:00.000Z");

type Captured = { readonly exitCode: number; readonly stdout: string; readonly stderr: string[] };

function contractsState() {
  const root = mkdtempSync(join(tmpdir(), "ghostget-contracts-"));
  chmodSync(root, 0o700);
  const environment = { GHOSTGET_STATE_HOME: join(root, "state"), HOME: root };
  const capture = () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
      output: { stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value) },
      result: (exitCode: number): Captured => ({ exitCode, stdout: stdout.join(""), stderr }),
    };
  };
  return {
    environment,
    root,
    dispose: () => rmSync(root, { recursive: true, force: true }),
    sync: () => syncBundledAdapters({
      environment,
      registry: providerPluginRegistry,
      output: { stdout: () => undefined, stderr: () => undefined },
    }),
    catalog: (options: Partial<Extract<GhostgetContractsCommand, { command: "contracts-catalog" }>> = {}): Captured => {
      const captured = capture();
      const exitCode = runContractsCatalog(
        { command: "contracts-catalog", adapterIds: [], json: true, ...options },
        environment,
        captured.output,
        providerPluginRegistry,
        { now: NOW },
      );
      return captured.result(exitCode);
    },
    check: async (
      options: Partial<Extract<GhostgetContractsCommand, { command: "contracts-check" }>> = {},
      stdin = "",
    ): Promise<Captured> => {
      const captured = capture();
      const exitCode = await runContractsCheck(
        { command: "contracts-check", planSource: hranessPlanPath, authState: false, json: true, ...options },
        environment,
        captured.output,
        providerPluginRegistry,
        { readStdin: () => Promise.resolve(stdin), now: NOW },
      );
      return captured.result(exitCode);
    },
  };
}

describe("ghostget contracts catalog", () => {
  test("projects the real bundled installation into a schema-valid catalog with code-owned authorities", async () => {
    const state = contractsState();
    try {
      await state.sync();
      const result = state.catalog();
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toEqual([]);
      const catalog = parseContractCatalog(JSON.parse(result.stdout));
      expect(schemaViolations(contractSchema("catalog"), JSON.parse(result.stdout))).toEqual([]);
      expect(catalog.ghostget.version).toBe(GHOSTGET_VERSION);
      expect(catalog.generatedAt).toBe(NOW.toISOString());
      expect(catalog.adapters.map((adapter) => adapter.id)).toEqual([...catalog.adapters.map((adapter) => adapter.id)].sort());
      const publicOperations = catalog.adapters.flatMap((adapter) =>
        "invalid" in adapter
          ? []
          : adapter.operations.filter((operation) => operation.authority === "public")
            .map((operation) => `${adapter.id}/${operation.id}`));
      expect(publicOperations).toEqual([
        "bluesky-web/profiles.read",
        "clasificados-web/listings.search",
        "github-web/organizations.read",
        "github-web/profiles.read",
      ]);
      for (const adapter of catalog.adapters) {
        if ("invalid" in adapter) throw new Error(`bundled adapter ${adapter.id} is invalid`);
        for (const operation of adapter.operations) {
          if (operation.authority === "public") {
            expect(operation).toMatchObject({ transport: "web-session-api", risk: "R1", state: "observed", sideEffect: "none" });
          }
        }
      }
      expect(result.stdout).not.toContain(state.root);
      expect(result.stdout).not.toMatch(/"(?:description|displayName|instructions|subject)"\s*:\s*"[^"]*"\s*,?\s*\n\s*"(?:risk|transport)"/u);
      expect(Buffer.byteLength(result.stdout)).toBeLessThan(500_000);
      expect(state.catalog().stdout).toBe(result.stdout);
      const bundled = bundledContractCatalog().adapters;
      expect(bundled.length).toBeGreaterThan(10);
      for (const adapter of bundled) {
        expect(catalog.adapters.find((installed) => installed.id === adapter.id)).toEqual(adapter);
      }
    } finally {
      state.dispose();
    }
  });

  test("filters adapters, exits 3 when a requested adapter is absent, and renders compact text", async () => {
    const state = contractsState();
    try {
      await state.sync();
      const filtered = state.catalog({ adapterIds: ["bluesky-web", "github-web"] });
      expect(filtered.exitCode).toBe(0);
      const catalog = parseContractCatalog(JSON.parse(filtered.stdout));
      expect(catalog.ok).toBeTrue();
      expect(catalog.adapters.map((adapter) => adapter.id)).toEqual(["bluesky-web", "github-web"]);
      const bluesky = catalog.adapters[0];
      if (bluesky === undefined || "invalid" in bluesky) throw new Error("bluesky-web missing");
      expect(bluesky).toMatchObject({ version: "1.7.0", surfaceId: "bluesky", origins: ["https://bsky.app"] });
      const profiles = bluesky.operations.find((operation) => operation.id === "profiles.read");
      expect(profiles).toMatchObject({
        transport: "web-session-api",
        authority: "public",
        risk: "R1",
        sideEffect: "none",
        idempotency: "none",
        dedupeWindowMs: 0,
        state: "observed",
        contractVersion: 2,
        input: { properties: { handle: { type: "string", minLength: 3, maxLength: 253 } }, required: ["handle"] },
      });
      expect(profiles?.contractHash).toMatch(/^[a-f0-9]{64}$/u);

      const partial = state.catalog({ adapterIds: ["bluesky-web", "missing-web"] });
      expect(partial.exitCode).toBe(0);
      expect(parseContractCatalog(JSON.parse(partial.stdout)).adapters.map((adapter) => adapter.id)).toEqual(["bluesky-web"]);
      const missing = state.catalog({ adapterIds: ["missing-web"] });
      expect(missing.exitCode).toBe(3);
      const none = parseContractCatalog(JSON.parse(missing.stdout));
      expect(none.ok).toBeFalse();
      expect(none.adapters).toEqual([]);

      const text = state.catalog({ adapterIds: ["bluesky-web"], json: false });
      expect(text.exitCode).toBe(0);
      expect(text.stdout).toContain(`Ghostget contract catalog ${GHOSTGET_VERSION} (1 adapters)`);
      expect(text.stdout).toContain("  bluesky-web 1.7.0: 19 operations;");
      expect(text.stdout).toContain("1 public");
    } finally {
      state.dispose();
    }
  });

  test("keeps invalid installed manifests visible without operations", () => {
    const state = contractsState();
    try {
      writePrivateJson(adapterManifestPath("broken", state.environment), { schemaVersion: 0 }, { privateParent: true });
      const result = state.catalog();
      expect(result.exitCode).toBe(0);
      const catalog = parseContractCatalog(JSON.parse(result.stdout));
      expect(catalog.adapters).toHaveLength(1);
      expect(catalog.adapters[0]).toMatchObject({ id: "broken", invalid: true });
      expect(result.stdout).not.toContain(state.root);
      const empty = contractsState();
      try {
        expect(parseContractCatalog(JSON.parse(empty.catalog().stdout)).adapters).toEqual([]);
      } finally {
        empty.dispose();
      }
    } finally {
      state.dispose();
    }
  });
});

describe("ghostget contracts check", () => {
  test("binds every read of the packaged Hraness plan to the bundled contracts", async () => {
    const state = contractsState();
    try {
      await state.sync();
      const result = await state.check();
      expect(result.exitCode).toBe(0);
      const check = parseContractCheck(JSON.parse(result.stdout));
      expect(schemaViolations(contractSchema("check"), JSON.parse(result.stdout))).toEqual([]);
      expect(check.ok).toBeTrue();
      expect(check.plan).toEqual({ collectionKey: "hraness-social-profile-statistics", reads: 15 });
      expect(check.reads.map((read) => read.verdict)).toEqual(Array.from({ length: 15 }, () => "ok"));
      expect(check.reads.map((read) => read.verdict === "ok" ? read.binding.authority : "gap")).toEqual([
        "auth", "auth", "auth", "auth", "auth", "auth", "public", "auth", "auth", "auth", "auth", "public", "public", "auth", "auth",
      ]);
      expect(result.stdout).not.toContain("x-chrome");
      const pure = checkCollectionPlan(
        parseCollectionPlan(JSON.parse(readFileSync(hranessPlanPath, "utf8"))),
        parseContractCatalog(JSON.parse(state.catalog().stdout)),
      );
      expect(pure).toEqual(check);
    } finally {
      state.dispose();
    }
  });

  test("reports gaps with exit 4, reads plans from stdin, and checks auth presence only on request", async () => {
    const state = contractsState();
    try {
      await state.sync();
      const plan = JSON.parse(readFileSync(hranessPlanPath, "utf8")) as { accounts: { reads: { adapter: string }[] }[] };
      plan.accounts[0]!.reads[0]!.adapter = "missing-web";
      const gap = await state.check({ planSource: "-" }, JSON.stringify(plan));
      expect(gap.exitCode).toBe(4);
      const check = parseContractCheck(JSON.parse(gap.stdout));
      expect(check.ok).toBeFalse();
      expect(check.reads[0]).toMatchObject({ verdict: "gap", gap: { reason: "adapter-missing" } });
      expect(check.reads.slice(1).every((read) => read.verdict === "ok")).toBeTrue();

      const authState = await state.check({ authState: true });
      expect(authState.exitCode).toBe(4);
      const missingAuth = parseContractCheck(JSON.parse(authState.stdout));
      expect(missingAuth.reads.map((read) => read.verdict === "gap" ? read.gap.reason : "ok")).toEqual([
        "auth-missing", "auth-missing", "auth-missing", "auth-missing", "auth-missing", "auth-missing", "ok",
        "auth-missing", "auth-missing", "auth-missing", "auth-missing", "ok", "ok", "auth-missing", "auth-missing",
      ]);
      expect(authState.stdout).not.toContain("x-chrome");

      saveAuth({
        schemaVersion: 1,
        id: "x-chrome",
        kind: "cookie-source",
        source: "chrome",
      }, state.environment);
      const partial = parseContractCheck(JSON.parse((await state.check({ authState: true })).stdout));
      expect(partial.reads.slice(0, 2).map((read) => read.verdict)).toEqual(["ok", "ok"]);
      expect(partial.reads[2]).toMatchObject({ verdict: "gap", gap: { reason: "auth-missing" } });

      const text = await state.check({ json: false });
      expect(text.exitCode).toBe(0);
      expect(text.stdout).toContain("Plan hraness-social-profile-statistics: 15 of 15 reads bind to installed contracts");
      expect(text.stdout).toContain("[6] bluesky-hraness bluesky-web profiles.read: ok (web-session-api; public; contract v2)");
    } finally {
      state.dispose();
    }
  });

  test("rejects an invalid or oversized plan before touching the catalog", async () => {
    const state = contractsState();
    try {
      await expect(state.check({ planSource: "-" }, "{")).rejects.toThrow("plan file must contain one JSON document");
      await expect(state.check({ planSource: "-" }, JSON.stringify({ schemaVersion: 1 }))).rejects.toThrow("plan is missing required key collectionKey");
      const planPath = join(state.root, "plan.json");
      writeFileSync(planPath, JSON.stringify({ ...JSON.parse(readFileSync(hranessPlanPath, "utf8")), rawResponse: true }));
      await expect(state.check({ planSource: planPath })).rejects.toThrow("plan has an unsupported key rawResponse");
      await expect(state.check({ planSource: join(state.root, "absent.json") })).rejects.toThrow();
    } finally {
      state.dispose();
    }
  });
});

describe("ghostget contracts schema and CLI dispatch", () => {
  test("prints each schema exactly as the SDK exposes it", () => {
    for (const name of ["catalog", "check", "plan", "invoke-read", "repair"] as const) {
      const stdout: string[] = [];
      const exitCode = runContractsSchema(
        { command: "contracts-schema", name, json: true },
        { stdout: (value) => stdout.push(value), stderr: () => undefined },
      );
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout.join(""))).toEqual(contractSchema(name));
    }
  });

  test("dispatches through ghostget main with the documented exit codes", async () => {
    const state = contractsState();
    try {
      await state.sync();
      const run = async (args: readonly string[]): Promise<Captured> => {
        const stdout: string[] = [];
        const stderr: string[] = [];
        const exitCode = await main(args, state.environment, {
          stdout: (value) => stdout.push(value),
          stderr: (value) => stderr.push(value),
        });
        return { exitCode, stdout: stdout.join(""), stderr };
      };
      const catalog = await run(["contracts", "catalog", "--adapter", "bluesky-web", "--json"]);
      expect(catalog.exitCode).toBe(0);
      expect(parseContractCatalog(JSON.parse(catalog.stdout)).adapters.map((adapter) => adapter.id)).toEqual(["bluesky-web"]);
      expect((await run(["contracts", "catalog", "--adapter", "missing-web", "--json"])).exitCode).toBe(3);
      const check = await run(["contracts", "check", "--plan", hranessPlanPath, "--json"]);
      expect(check.exitCode).toBe(0);
      expect(parseContractCheck(JSON.parse(check.stdout)).ok).toBeTrue();
      expect((await run(["contracts", "check", "--plan", hranessPlanPath, "--auth-state", "--json"])).exitCode).toBe(4);
      const schema = await run(["contracts", "schema", "invoke-read", "--json"]);
      expect(schema.exitCode).toBe(0);
      expect(JSON.parse(schema.stdout)).toEqual(contractSchema("invoke-read"));
      const usage = await run(["contracts", "nothing"]);
      expect(usage.exitCode).toBe(2);
      expect(usage.stderr.join("")).toContain("contracts requires catalog, check, repair, or schema");
    } finally {
      state.dispose();
    }
  });
});
