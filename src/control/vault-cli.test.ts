import { expect, test } from "bun:test";
import fc from "fast-check";
import { propertyParameters } from "../test-support";
import { parseVaultArguments, runVaultCommand } from "./vault-cli";
import type { ControlRequest, ControlResponse, ControlSnapshot } from "./protocol";

const flags = ["--id", "x-main", "--account", "account.example.com", "--reference", "op://Private/X/access-token", "--subject", "12345", "--scopes", "tweet.read,users.read"];
const args = ["vault", "import-x", ...flags];
const snapshot: ControlSnapshot = { version: "test", accountId: null, accounts: [], capabilities: [], interfaces: [], policy: { managed: false, revision: 0 }, web: { revision: 0, gatewayOnly: false, rules: [] }, approvals: [], connectionProviders: [], vault: { provider: "1password", available: true, purpose: "x-user-token-import" } };
function fixture(state = snapshot, result: ControlResponse = { ok: true, data: { kind: "success", message: "done" } }) {
  let stdout = "", stderr = "", closes = 0, opens = 0;
  const requests: ControlRequest[] = [];
  const client = () => { opens++; return { request: async (request: ControlRequest): Promise<ControlResponse> => { requests.push(request); return request.action === "snapshot" ? { ok: true, data: { kind: "snapshot", snapshot: state } } : result; }, close: async () => { closes++; } }; };
  return { client, requests, output: { stdout: (text: string) => { stdout += text; }, stderr: (text: string) => { stderr += text; } }, read: () => ({ stdout, stderr, closes, opens }) };
}

test("vault help and invalid metadata never open a controller or echo supplied values", async () => {
  const f = fixture();
  expect(await runVaultCommand(["vault", "--help"], {}, f.output, f.client, "darwin")).toBe(0);
  expect(await runVaultCommand(["vault", "import-x", "--help"], {}, f.output, f.client, "darwin")).toBe(0);
  for (const bad of [[...args, "--id", "duplicate"], [...args, "--token", "secret-never-print"], ["vault", "import-x", "--reference", "secret-never-print"], [...args, "--replace", "--replace"]]) {
    expect(await runVaultCommand(bad, {}, f.output, f.client, "darwin")).toBe(2);
  }
  expect(f.read().opens).toBe(0); expect(f.read().stderr).not.toContain("secret-never-print");
});

test("import copies only validated metadata and closes its controller", async () => {
  const f = fixture(); expect(await runVaultCommand(args, {}, f.output, f.client, "darwin")).toBe(0);
  expect(f.requests[1]).toEqual(parseVaultArguments(args).request);
  expect(f.read().closes).toBe(1); expect(f.read().stdout).not.toContain("op://");
});

test("existing account requires explicit replacement bound to the displayed revision", async () => {
  const existing = { ...snapshot, accounts: [{ id: "x-main", provider: "x", kind: "oauth-token-file", subject: "12345", revision: "a".repeat(64), status: "configured" as const, source: null, tokenStorage: "external" as const }] };
  const refused = fixture(existing); expect(await runVaultCommand(args, {}, refused.output, refused.client, "darwin")).toBe(2);
  expect(refused.requests).toHaveLength(1); expect(refused.read().closes).toBe(1);
  const accepted = fixture(existing); expect(await runVaultCommand([...args, "--replace"], {}, accepted.output, accepted.client, "darwin")).toBe(0);
  expect(accepted.requests[1]).toMatchObject({ action: "vault.import", expectedRevision: "a".repeat(64) });
});

test("an uncertain import is not retried and unsupported platforms never open a controller", async () => {
  const f = fixture(snapshot, { ok: false, code: "IMPORT_UNCERTAIN", message: "Inspect Accounts before retrying." });
  expect(await runVaultCommand(args, {}, f.output, f.client, "darwin")).toBe(1);
  expect(f.requests.filter(request => request.action === "vault.import")).toHaveLength(1);
  expect(f.read().closes).toBe(1);
  const linux = fixture(); expect(await runVaultCommand(args, {}, linux.output, linux.client, "linux")).toBe(1); expect(linux.read().opens).toBe(0);
});

test("metadata flag ordering does not change the exact import", () => {
  const pairs = Array.from({ length: flags.length / 2 }, (_, index) => flags.slice(index * 2, index * 2 + 2));
  const expected = parseVaultArguments(args);
  fc.assert(fc.property(fc.shuffledSubarray(pairs, { minLength: pairs.length, maxLength: pairs.length }), order => {
    expect(parseVaultArguments(["vault", "import-x", ...order.flat()])).toEqual(expected);
  }), propertyParameters);
});
