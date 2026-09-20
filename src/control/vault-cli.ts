import { spawnHelper, type HelperClient } from "./helper-client";
import { parseVaultImport, type VaultImportRequest } from "./vault-input";
import type { ControlEnvironment } from "./web-policy";

type Output = { readonly stdout: (text: string) => unknown; readonly stderr: (text: string) => unknown };
export const vaultUsage = `Usage: ghostget vault import-x --id <account-id> --account <1password-account-name-or-uuid>
         --reference <op://vault/item/field> --subject <numeric-x-user-id>
         --scopes <comma-list> [--expires-at <ISO-date>] [--replace]

Import an X OAuth 2.0 user access token from 1Password on macOS.
Unlock the 1Password desktop app and enable its app integration first.
--account is the account name shown at the app's top left, or its UUID.
Pass the field reference, never the token itself. Ghostget verifies the X user
before storing a private local token copy. It does not renew imported tokens.
Scopes must include tweet.read and users.read; declare the token's actual scopes.
An existing Ghostget account requires --replace and an unchanged account revision.
Quit the TUI or run ghostget menubar stop before importing.
This is a token importer, not a general password manager or a Markdown vault.
`;

export function parseVaultArguments(args: readonly string[]): { readonly request: VaultImportRequest; readonly replace: boolean } {
  if (args[0] !== "vault" || args[1] !== "import-x") throw new Error("invalid command");
  const allowed = new Set(["--id", "--account", "--reference", "--subject", "--scopes", "--expires-at"]);
  const values = new Map<string, string>();
  let replace = false;
  for (let index = 2; index < args.length; index++) {
    const key = args[index]!;
    if (key === "--replace") { if (replace) throw new Error("duplicate option"); replace = true; continue; }
    const value = args[++index];
    if (!allowed.has(key) || values.has(key) || value === undefined || value.startsWith("--")) throw new Error("invalid option");
    values.set(key, value);
  }
  return {
    replace,
    request: parseVaultImport({
      action: "vault.import", id: values.get("--id"), account: values.get("--account"),
      reference: values.get("--reference"), expectedSubject: values.get("--subject"),
      scopes: values.get("--scopes")?.split(","), expiresAt: values.get("--expires-at") ?? null,
      expectedRevision: null,
    }),
  };
}

/** Only import metadata crosses private stdio. Secret resolution stays in the
 * isolated credential helper, which verifies the expected X subject. */
export async function runVaultCommand(
  args: readonly string[], environment: ControlEnvironment, output: Output,
  createClient: (environment: ControlEnvironment) => HelperClient = spawnHelper,
  platform: NodeJS.Platform = process.platform,
): Promise<number> {
  if (args.length === 1 || args.length === 2 && ["help", "--help", "-h"].includes(args[1]!) || args.length === 3 && args[1] === "import-x" && ["help", "--help", "-h"].includes(args[2]!)) { output.stdout(vaultUsage); return 0; }
  let parsed: ReturnType<typeof parseVaultArguments>;
  try { parsed = parseVaultArguments(args); }
  catch { output.stderr(`Invalid X token import options. Run ghostget vault --help. Use an exact field reference, numeric X user ID, supported scopes, and a future ISO expiry.\n`); return 2; }
  if (platform !== "darwin") { output.stderr("1Password desktop token import currently requires macOS.\n"); return 1; }
  const client = createClient(environment);
  let interrupted = false;
  const stop = (): void => { interrupted = true; void Promise.resolve(client.close()).catch(() => undefined); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const state = await client.request({ action: "snapshot", accountId: null });
    if (!state.ok) { output.stderr(`${state.message}\n`); return interrupted ? 130 : 1; }
    if (state.data.kind !== "snapshot") throw new Error("unexpected response");
    const existing = state.data.snapshot.accounts.find(account => account.id === parsed.request.id);
    if (existing !== undefined && !parsed.replace) {
      output.stderr("That account already exists. Use a new --id, or review the account and explicitly pass --replace.\n"); return 2;
    }
    const response = await client.request({ ...parsed.request, expectedRevision: existing?.revision ?? null }, 135_000);
    if (!response.ok) { output.stderr(`${response.message}\n`); return interrupted ? 130 : 1; }
    if (response.data.kind !== "success") throw new Error("unexpected response");
    output.stdout("Verified X token imported. Use this account with --auth and the account ID you supplied. Ghostget stores a private local copy; refresh it when it expires.\n");
    return 0;
  } catch {
    output.stderr("The import outcome could not be confirmed. Inspect ghostget auth list before starting another import. No action was retried.\n");
    return interrupted ? 130 : 1;
  } finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); await client.close(); }
}
