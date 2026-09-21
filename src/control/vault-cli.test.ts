import { expect, test } from "bun:test";
import fc from "fast-check";
import { propertyParameters } from "../test-support";
import { createAuth, saveAuth } from "../auth";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseVaultArguments, runVaultCommand, type VaultCommandDependencies } from "./vault-cli";
import { ControlError } from "./validation";

const roots: string[] = [];
const cleanup = () => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); };

const flags = ["--id", "x-main", "--account", "account.example.com", "--reference", "op://Private/X/access-token", "--subject", "12345", "--scopes", "tweet.read,users.read"];
const args = ["vault", "import-x", ...flags];

function fixture(environment?: Readonly<Record<string, string | undefined>>) {
  const raw = mkdtempSync(join(tmpdir(), "ghostget-vault-cli-")); chmodSync(raw, 0o700); roots.push(raw);
  let stdout = "", stderr = "", imports = 0;
  const requests: unknown[] = [];
  const dependencies: VaultCommandDependencies = {
    importToken: async (request) => { imports++; requests.push(request); },
  };
  return {
    environment: environment ?? { GHOSTGET_STATE_HOME: raw }, dependencies, requests,
    output: { stdout: (text: string) => { stdout += text; }, stderr: (text: string) => { stderr += text; } },
    read: () => ({ stdout, stderr, imports }),
  };
}

test("vault help and invalid metadata never touch state or echo supplied values", async () => {
  try {
    const f = fixture();
    expect(await runVaultCommand(["vault", "--help"], f.environment, f.output, f.dependencies, "darwin")).toBe(0);
    expect(await runVaultCommand(["vault", "import-x", "--help"], f.environment, f.output, f.dependencies, "darwin")).toBe(0);
    for (const bad of [[...args, "--id", "duplicate"], [...args, "--token", "secret-never-print"], ["vault", "import-x", "--reference", "secret-never-print"], [...args, "--replace", "--replace"], [...args, "--refresh-reference", "op://Private/X/refresh-token"], [...args, "--client-id", "publicClient1"], [...args, "--refresh-reference", "op://Private/X/refresh-token", "--client-id", "publicClient1", "--expires-at", "2030-01-01T00:00:00.000Z"]]) {
      expect(await runVaultCommand(bad, f.environment, f.output, f.dependencies, "darwin")).toBe(2);
    }
    expect(f.read().imports).toBe(0); expect(f.read().stderr).not.toContain("secret-never-print");
  } finally { cleanup(); }
});

test("import passes only validated metadata and reports no secret material", async () => {
  try {
    const f = fixture();
    expect(await runVaultCommand(args, f.environment, f.output, f.dependencies, "darwin")).toBe(0);
    expect(f.requests).toEqual([{ ...parseVaultArguments(args).request, expectedRevision: null }]);
    expect(f.read().stdout).not.toContain("op://");
  } finally { cleanup(); }
});

test("existing account requires explicit replacement bound to the recorded revision", async () => {
  try {
    const state = fixture();
    saveAuth(createAuth("x-main", { source: "chrome", subject: "12345" }), state.environment);
    expect(await runVaultCommand(args, state.environment, state.output, state.dependencies, "darwin")).toBe(2);
    expect(state.read().imports).toBe(0);
    const revision = "a".repeat(64);
    const accepted = fixture(state.environment);
    const dependencies: VaultCommandDependencies = { accountRevision: () => revision, importToken: async (request) => { accepted.requests.push(request); } };
    expect(await runVaultCommand([...args, "--replace"], accepted.environment, accepted.output, dependencies, "darwin")).toBe(0);
    expect(accepted.requests[0]).toMatchObject({ action: "vault.import", expectedRevision: revision });
  } finally { cleanup(); }
});

test("a renewable import pairs its fields and reaches the credential ceremony", async () => {
  try {
    const f = fixture();
    const renewable = ["vault", "import-x", ...flags.slice(0, -2), "--scopes", "tweet.read,users.read,offline.access", "--refresh-reference", "op://Private/X/refresh-token", "--client-id", "publicClient1"];
    expect(await runVaultCommand(renewable, f.environment, f.output, f.dependencies, "linux")).toBe(0);
    expect(f.requests[0]).toMatchObject({ refreshReference: "op://Private/X/refresh-token", clientId: "publicClient1", scopes: ["offline.access", "tweet.read", "users.read"] });
    expect(f.read().stdout).toContain("renews it before expiry");
  } finally { cleanup(); }
});

test("an uncertain import is not retried and unsupported platforms never touch state", async () => {
  try {
    const f = fixture();
    const failing: VaultCommandDependencies = { importToken: async (request) => { f.requests.push(request); throw new ControlError("IMPORT_UNCERTAIN", "Inspect Accounts before retrying."); } };
    expect(await runVaultCommand(args, f.environment, f.output, failing, "darwin")).toBe(1);
    expect(f.requests).toHaveLength(1);
    const unsupported = fixture();
    expect(await runVaultCommand(args, unsupported.environment, unsupported.output, unsupported.dependencies, "freebsd")).toBe(1);
    expect(unsupported.read().imports).toBe(0);
  } finally { cleanup(); }
});

test("metadata flag ordering does not change the exact import", () => {
  const pairs = Array.from({ length: flags.length / 2 }, (_, index) => flags.slice(index * 2, index * 2 + 2));
  const expected = parseVaultArguments(args);
  fc.assert(fc.property(fc.shuffledSubarray(pairs, { minLength: pairs.length, maxLength: pairs.length }), order => {
    expect(parseVaultArguments(["vault", "import-x", ...order.flat()])).toEqual(expected);
  }), propertyParameters);
});
