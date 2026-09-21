import { listAuthSnapshots } from "../auth";
import { connectionAccountRevision } from "./account-revision";
import { importVaultToken } from "./vault";
import { parseVaultImport, type VaultImportRequest } from "./vault-input";
import { ControlError } from "./validation";
import type { ControlEnvironment } from "./web-policy";

type Output = { readonly stdout: (text: string) => unknown; readonly stderr: (text: string) => unknown };
export const vaultUsage = `Usage: ghostget vault import-x --id <account-id> --account <1password-account-name-or-uuid>
         --reference <op://vault/item/field> --subject <numeric-x-user-id>
         --scopes <comma-list> [--refresh-reference <op://vault/item/field>
         --client-id <public-client-id>] [--expires-at <ISO-date>] [--replace]

Import an X OAuth 2.0 user access token from 1Password on a supported desktop.
Unlock the 1Password desktop app and enable its app integration first.
--account is the account name shown at the app's top left, or its UUID.
Pass field references, never the tokens themselves. Ghostget verifies the X user
before storing private local token copies.
Scopes must include tweet.read and users.read; declare the token's actual scopes.
For a renewable import, pass --refresh-reference and --client-id together and
declare offline.access; Ghostget proves the refresh token during import and
renews the access token itself as it nears expiry. --expires-at is only for a
non-renewable import that declares its own expiry.
An existing Ghostget account requires --replace and an unchanged account revision.
The TUI and menubar may stay open; the import binds the exact account revision.
This is a token importer, not a general password manager or a Markdown vault.
`;

export function parseVaultArguments(args: readonly string[]): { readonly request: VaultImportRequest; readonly replace: boolean } {
  if (args[0] !== "vault" || args[1] !== "import-x") throw new Error("invalid command");
  const allowed = new Set(["--id", "--account", "--reference", "--refresh-reference", "--client-id", "--subject", "--scopes", "--expires-at"]);
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
      reference: values.get("--reference"), refreshReference: values.get("--refresh-reference") ?? null,
      clientId: values.get("--client-id") ?? null, expectedSubject: values.get("--subject"),
      scopes: values.get("--scopes")?.split(","), expiresAt: values.get("--expires-at") ?? null,
      expectedRevision: null,
    }),
  };
}

export type VaultCommandDependencies = {
  readonly listSnapshots?: typeof listAuthSnapshots;
  readonly accountRevision?: typeof connectionAccountRevision;
  readonly importToken?: typeof importVaultToken;
};

/** The import runs the credential ceremony directly against private state: exact
 * account revision, staged token file, and conditional publication. It takes no
 * controller lock, so the TUI and menubar can keep running. Only import metadata
 * crosses private stdio; secret resolution stays in the credential helper. */
export async function runVaultCommand(
  args: readonly string[],
  environment: ControlEnvironment,
  output: Output,
  dependencies: VaultCommandDependencies = {},
  platform: NodeJS.Platform = process.platform,
): Promise<number> {
  if (args.length === 1 || args.length === 2 && ["help", "--help", "-h"].includes(args[1]!) || args.length === 3 && args[1] === "import-x" && ["help", "--help", "-h"].includes(args[2]!)) { output.stdout(vaultUsage); return 0; }
  let parsed: ReturnType<typeof parseVaultArguments>;
  try { parsed = parseVaultArguments(args); }
  catch { output.stderr(`Invalid X token import options. Run ghostget vault --help. Use an exact field reference, numeric X user ID, supported scopes, and a future ISO expiry.\n`); return 2; }
  if (!["darwin", "linux", "win32"].includes(platform)) { output.stderr("1Password desktop token import requires a desktop platform (macOS, Linux, or Windows).\n"); return 1; }
  const listSnapshots = dependencies.listSnapshots ?? listAuthSnapshots;
  const accountRevision = dependencies.accountRevision ?? connectionAccountRevision;
  const importToken = dependencies.importToken ?? importVaultToken;
  let interrupted = false;
  const controller = new AbortController();
  const stop = (): void => { interrupted = true; controller.abort(); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const existing = listSnapshots(environment).find((snapshot) => snapshot.auth.id === parsed.request.id);
    if (existing !== undefined && !parsed.replace) {
      output.stderr("That account already exists. Use a new --id, or review the account and explicitly pass --replace.\n"); return 2;
    }
    const expectedRevision = existing === undefined ? null : accountRevision(existing, environment);
    await importToken({ ...parsed.request, expectedRevision }, environment, controller.signal);
    output.stdout(parsed.request.refreshReference === null
      ? "Verified X token imported. Use this account with --auth and the account ID you supplied. Ghostget stores a private local copy; re-import it when it expires.\n"
      : "Verified renewable X token imported. Use this account with --auth and the account ID you supplied. Ghostget stores a private local copy and renews it before expiry.\n");
    return 0;
  } catch (error) {
    if (interrupted && controller.signal.aborted) { output.stderr("Token import was cancelled before the account was connected.\n"); return 130; }
    if (error instanceof ControlError) { output.stderr(`${error.message}\n`); return interrupted ? 130 : 1; }
    output.stderr("The import outcome could not be confirmed. Inspect ghostget auth list before starting another import. No action was retried.\n");
    return interrupted ? 130 : 1;
  } finally { process.off("SIGINT", stop); process.off("SIGTERM", stop); }
}
