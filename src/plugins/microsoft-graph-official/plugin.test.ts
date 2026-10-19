import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import rawManifest from "../../assets/adapters/microsoft-graph/wrench-adapter.json";
import type { GhostgetAuth } from "../../auth";
import { isProviderOperation, parseRuntimeManifest, type GhostgetManifest, type ProviderRecipe } from "../../model";
import { microsoftGraphContracts } from "../../provider-contract-definitions-microsoft-graph";
import { executeProviderOperation } from "../../provider";
import type { ProviderActionContext } from "../../provider-context";
import { loadOAuthToken } from "../../provider-http";
import { providerPluginRegistry } from "../../provider-plugins";
import { executeMicrosoftGraphProvider } from "../../providers/microsoft-graph";
import { discoverBundledAdapters } from "../../scripts/sync-bundled-adapters";
import { microsoftGraphOfficialPlugin } from "./plugin";

const manifest = rawManifest as GhostgetManifest;
function recipe(operation: string): ProviderRecipe {
  const selected = manifest.operations[operation];
  if (selected === undefined || !isProviderOperation(selected)) throw new Error("missing Graph manifest operation");
  return selected.provider;
}

describe("Microsoft Graph official candidate plugin", () => {
  test("catalog and packaged manifest discover two unavailable R1 contracts with exact scope sets", () => {
    const binding = microsoftGraphOfficialPlugin.bindings[0]!;
    expect(binding).toMatchObject({ transport: "provider-api", surfaceId: "microsoft-graph", origin: "https://graph.microsoft.com", authKinds: ["oauth-token-file"] });
    expect(binding.operations.map((operation) => [operation.name, operation.contractVersion, operation.state, operation.risk, operation.dispatch])).toEqual([
      ["calendar.attendees.list", 1, "capture-required", "R1", "none"],
      ["contacts.list", 1, "capture-required", "R1", "none"],
    ]);
    expect(microsoftGraphContracts.map((operation) => operation.requiredScopeSets)).toEqual([
      [["User.Read", "Contacts.Read"]], [["User.Read", "Calendars.ReadBasic"]],
    ]);
    const parsed = parseRuntimeManifest(rawManifest, providerPluginRegistry);
    expect(parsed.ok).toBeTrue();
    expect(discoverBundledAdapters().find((adapter) => adapter.id === "microsoft-graph")?.current.manifest).toEqual(manifest);
    for (const contract of microsoftGraphContracts) {
      expect(manifest.operations[contract.operation]?.input).toEqual(contract.input);
      expect(providerPluginRegistry.requireOperationDefinition("provider-api", "microsoft-graph", contract.operation, 1).operation.state).toBe("capture-required");
    }
  });

  test("the public kernel refuses both routes before touching credentials or HTTP", async () => {
    for (const contract of microsoftGraphContracts) {
      let authReads = 0;
      let requests = 0;
      const auth = new Proxy({}, { get() { authReads += 1; throw new Error("credential access must not occur"); } }) as GhostgetAuth;
      const execution = await executeProviderOperation(manifest, recipe(contract.operation), {}, auth, {
        registry: providerPluginRegistry,
        fetch: async () => { requests += 1; throw new Error("network access must not occur"); },
      });
      expect(execution).toMatchObject({ status: "failed", output: null, dispatchStarted: false, dispatch: { planned: 0, started: 0, verified: 0 } });
      expect(execution.error).toContain("requires a reviewed provider contract");
      expect(authReads).toBe(0);
      expect(requests).toBe(0);
    }
  });

  test("the runtime cannot be enabled through a forged context state", async () => {
    for (const contract of microsoftGraphContracts) {
      let accesses = 0;
      const context = new Proxy({ recipe: recipe(contract.operation), contract: { ...contract, state: "observed" } }, {
        get(target, key) {
          if (key === "recipe" || key === "contract") return target[key];
          accesses += 1;
          throw new Error("credential and HTTP context must stay untouched");
        },
      }) as unknown as ProviderActionContext;
      await expect(executeMicrosoftGraphProvider(context)).rejects.toThrow("capture-required");
      expect(accesses).toBe(0);
    }
  });

  test("the existing private schema-1 OAuth loader supports the exact Graph provider and subject without renewal", () => {
    const root = mkdtempSync(join(tmpdir(), "ghostget-graph-token-test-"));
    chmodSync(root, 0o700);
    const path = join(root, "token.json");
    const auth = { schemaVersion: 1, id: "synthetic-graph", kind: "oauth-token-file", provider: "microsoft-graph", path,
      subject: "microsoft-graph:synthetic-account", scopes: ["User.Read", "Contacts.Read"] } as const;
    const document = { schemaVersion: 1, provider: auth.provider, subject: auth.subject, scopes: auth.scopes,
      accessToken: "synthetic-token", expiresAt: "2099-01-01T00:00:00.000Z" };
    try {
      writeFileSync(path, JSON.stringify(document), { mode: 0o600 });
      expect(loadOAuthToken(auth).accessToken).toBe("synthetic-token");
      for (const changed of [{ ...document, subject: "microsoft-graph:another" }, { ...document, provider: "gmail" }, { ...document, scopes: ["User.Read"] }]) {
        writeFileSync(path, JSON.stringify(changed), { mode: 0o600 });
        expect(() => loadOAuthToken(auth)).toThrow();
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
