import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { createAuth, saveAuth } from "./auth";
import { invokeCapabilitySync } from "./client";
import { readContractRepairInbox } from "./contract-repair-inbox";
import { runContractsRepair, projectContractRepairSignal } from "./contracts-cli";
import { parseInvokeReadResult } from "./contracts-invoke-read";
import { parseContractRepairHandoff } from "./contracts-repair";
import { contractSchema } from "./contracts-schema";
import { schemaViolations } from "./contracts-schema.test-support";
import { examplePlan, exampleRead } from "./contracts.test-support";
import { main, type GhostgetDependencies } from "./ghostget";
import { installManifest } from "./storage";
import { canonicalJson, manifestHash, sha256, type GhostgetManifest } from "./model";
import { providerPluginRegistry } from "./provider-plugins";
import { readFailureProjection, type ReadFailureProjection } from "./web-session-execution";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { output: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) }, stdout: () => stdout.join(""), stderr: () => stderr.join("") };
}
function state(site: "linkedin" | "x" = "linkedin") {
  const root = mkdtempSync(join(tmpdir(), "ghostget-repair-cli-"));
  chmodSync(root, 0o700);
  const environment = { HOME: root, GHOSTGET_STATE_HOME: join(root, "state") };
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "assets", "adapters", site, "wrench-web-adapter.json"), "utf8")) as GhostgetManifest;
  installManifest(manifest, { force: false, environment, registry: providerPluginRegistry });
  saveAuth(createAuth("private-account", { source: "arc", profile: "Default", subject: site === "x" ? "12345" : "urn:li:fsd_profile:123" }), environment);
  return { root, environment, manifest, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
const missingArgs = ["invoke", "linkedin-web", "messaging.list", "--input", '{"folder":"focused","limit":1}', "--auth", "private-account", "--json"];

describe("usage-driven repair signals", () => {
  test("cache and identity inspection stay read-only; a real attempt or SDK preview records one missing-coverage lead", async () => {
    const s = state();
    let calls = 0;
    const dependencies: Partial<GhostgetDependencies> = { revalidatePreparedCapability: () => { calls += 1; throw new Error("must not execute"); } };
    try {
      for (const flag of ["--cache-only", "--projection-identity-only"]) {
        expect(await main([...missingArgs, flag], s.environment, capture().output, dependencies)).toBe(3);
        expect(readContractRepairInbox(s.environment).entries).toHaveLength(0);
      }
      const attempt = capture();
      expect(await main(missingArgs, s.environment, attempt.output, dependencies)).toBe(3);
      expect(attempt.stderr()).toContain("ghostget contracts repair --id");
      expect(attempt.stdout()).toBe("");
      expect(calls).toBe(0);
      const entries = readContractRepairInbox(s.environment).entries;
      expect(entries).toHaveLength(1);
      expect(entries[0]!.signal.reason).toBe("capture-required");
      expect(JSON.stringify(entries)).not.toContain("private-account");
      expect(JSON.stringify(entries)).not.toContain("focused");
      expect(existsSync(join(s.environment.GHOSTGET_STATE_HOME, "runs"))).toBeFalse();
      expect(() => invokeCapabilitySync({ adapterId: "linkedin-web", operationId: "messaging.list", authId: "private-account", input: { folder: "focused", limit: 1 } }, { environment: s.environment })).toThrow("capture-required");
      expect(readContractRepairInbox(s.environment).entries).toEqual(entries);
      const listing = capture();
      expect(await main(["contracts", "repair", "--id", entries[0]!.signal.id, "--json"], s.environment, listing.output)).toBe(0);
      const report = JSON.parse(listing.stdout());
      const handoff = parseContractRepairHandoff(report.repairs[0].handoff);
      expect(handoff.status).toBe("capture-required");
      expect(schemaViolations(contractSchema("repair"), handoff)).toEqual([]);
    } finally { s.dispose(); }
  });

  test("only suspected drift is collected; failure JSON, categories and provider-call counts stay unchanged", async () => {
    const s = state("x");
    let calls = 0;
    try {
      const categories: readonly ReadFailureProjection["category"][] = ["target-unavailable", "auth-repair-required", "account-mismatch", "cleanup-required", "provider-throttled", "provider-temporary", "operation-timeout", "contract-drift"];
      for (const category of categories) {
        const captured = capture();
        const code = await main(["invoke", "x-web", "profiles.read", "--input", '{"handle":"example"}', "--auth", "private-account", "--json"], s.environment, captured.output, {
          revalidatePreparedCapability: invocation => {
            calls += 1;
            const binding = projectContractRepairSignal(invocation.manifest, invocation.operationId, "contract-drift", providerPluginRegistry).binding;
            return Promise.resolve({ live: {
              receipt: {
                schemaVersion: 4, runId: "00000000-0000-4000-8000-000000000001", planDigest: null,
                adapter: { id: invocation.manifest.id, version: invocation.manifest.version, hash: manifestHash(invocation.manifest) },
                operation: invocation.operationId, risk: "R1", inputHash: sha256(canonicalJson(invocation.input)),
                auth: { id: invocation.auth.id, kind: invocation.auth.kind, hash: sha256(canonicalJson(invocation.auth)) },
                status: "failed", dispatchStarted: false, dispatch: { planned: 0, started: 0, verified: 0 },
                startedAt: "2026-09-22T12:00:00.000Z", finishedAt: "2026-09-22T12:00:01.000Z",
                finalOrigin: "https://x.com", error: "synthetic-private-diagnostic",
                transport: "web-session-api", webSessionContractHash: binding.contractHash,
              }, output: null, replayed: false, privateArtifactsPreserved: false, readFailure: readFailureProjection(category),
            }, cachedBefore: null, cache: { status: "miss", reason: "no-cached-snapshot" } });
          },
        });
        expect(code).toBe(3);
        expect(parseInvokeReadResult(JSON.parse(captured.stdout())).readFailure).toEqual(readFailureProjection(category));
        const inbox = readContractRepairInbox(s.environment);
        expect(inbox.entries.length).toBe(category === "contract-drift" ? 1 : 0);
        expect(JSON.stringify(inbox)).not.toContain("synthetic-private-diagnostic");
      }
      expect(calls).toBe(categories.length);
    } finally { s.dispose(); }
  });

  test("plan diagnosis records demand only with --record and leaves the plan's private fields behind", async () => {
    const s = state();
    try {
      const plan = { ...examplePlan(), accounts: [{ accountKey: "private-person", reads: [exampleRead({ adapter: "linkedin-web", operation: "messaging.list", authority: { kind: "auth", authId: "private-account" }, input: { folder: "focused", limit: 1 } })] }] };
      for (const record of [false, true]) {
        const result = capture();
        expect(await runContractsRepair({ command: "contracts-repair", planSource: "-", record, json: true }, s.environment, result.output, providerPluginRegistry, { readStdin: async () => JSON.stringify(plan) })).toBe(0);
        const report = JSON.parse(result.stdout());
        expect(report.repairs).toHaveLength(1);
        expect(JSON.stringify(report)).not.toContain("private-person");
        expect(JSON.stringify(report)).not.toContain("private-account");
        expect(readContractRepairInbox(s.environment).entries.length).toBe(record ? 1 : 0);
      }
      const missing = capture();
      expect(await main(["contracts", "repair", "--id", "0".repeat(64), "--json"], s.environment, missing.output)).toBe(3);
      expect(JSON.parse(missing.stdout()).status).toBe("not-found");
    } finally { s.dispose(); }
  });

  test("opting out preserves the original refusal without caching or suggesting a missing inbox entry", async () => {
    const s = state();
    try {
      const result = capture();
      expect(await main(missingArgs, { ...s.environment, GHOSTGET_REPAIR_SIGNALS: "off" }, result.output)).toBe(3);
      expect(result.stderr()).toContain("capture-required");
      expect(result.stderr()).not.toContain("repair lead");
      expect(existsSync(join(s.environment.GHOSTGET_STATE_HOME, "repair-signals"))).toBeFalse();
    } finally { s.dispose(); }
  });
});
