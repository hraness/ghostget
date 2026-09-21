import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createAuth, loadAuthSnapshotIfPresent, replaceAuthIfUnchanged, saveAuth } from "../auth";
import { canonicalJson } from "../canonical-json";
import { OperationDeadline } from "../operation-deadline";
import { createPinnedHttpsFetchScope, type PinnedHttpsFetch } from "../pinned-https";
import { bearerHeaders, loadOAuthCredential, loadOAuthToken, ProviderHttpClient, type OAuthTokenAuth, type XPublicClientRefresh } from "../provider-http";
import { isXAccountSubject } from "../provider-subject";
import { exchangeXRefreshToken } from "../oauth-x";
import { withReadProjectionAuthAdmission } from "../read-projections";
import { createPrivateJsonIfAbsent, ghostgetStateHome, removePrivateStateFileIfUnchanged } from "../storage";
import { GHOSTGET_VERSION } from "../version";
import type { ControlRequest } from "./protocol";
import { readInterfaceJson } from "./interface-json";
import { parseVaultImport } from "./vault-input";
export { parseVaultImport } from "./vault-input";
import { connectionAccountRevision } from "./account-revision";

export type VaultImportRequest = Extract<ControlRequest, { action: "vault.import" }>;
export type VaultImportCode = "INVALID_IMPORT" | "ACCOUNT_CHANGED" | "VAULT_UNAVAILABLE" | "TOKEN_UNVERIFIED" | "IMPORT_CANCELLED" | "IMPORT_FAILED" | "IMPORT_UNCERTAIN";
export type VaultImportResult = { readonly ok: true } | { readonly ok: false; readonly code: VaultImportCode };
type Environment = Readonly<Record<string, string | undefined>>;
export const VAULT_IMPORT_TIMEOUT_MS = 120_000;
/** Trusted fixed sink: no registry, supplied URL, dynamic executor, redirect or retry. */
export async function probeImportedXToken(auth: OAuthTokenAuth, signal: AbortSignal, transport?: PinnedHttpsFetch): Promise<string> {
  const deadline = new OperationDeadline(15_000, { signal });
  const scope = transport === undefined ? createPinnedHttpsFetchScope("https://api.x.com") : null;
  const fetch = transport ?? scope!.fetch;
  try {
    const token = loadOAuthToken(auth);
    const http = new ProviderHttpClient((input, init) => fetch(new URL(String(input)), init ?? {}, 15_000), deadline, 16_384);
    const response = await http.request("https://api.x.com/2/users/me", { method: "GET", headers: bearerHeaders(token.accessToken, { Accept: "application/json" }), credentials: "omit" }, [200], ["api.x.com"], 16_384, "application/json");
    const body = response.body as { data?: { id?: unknown }; errors?: unknown } | null;
    const subject = body?.data?.id;
    if (typeof subject !== "string" || !isXAccountSubject(subject) || body?.errors !== undefined) throw new Error("unverified account");
    deadline.throwIfUnavailable("account verification");
    return subject;
  } finally { deadline.dispose(); scope?.close(); }
}

async function resolveDesktopSecret(account: string, reference: string): Promise<string> {
  const sdk = await import("@1password/sdk");
  const client = await sdk.createClient({ auth: new sdk.DesktopAuth(account), integrationName: "Ghostget", integrationVersion: GHOSTGET_VERSION });
  return client.secrets.resolve(reference);
}

export type CredentialImportDependencies = {
  readonly resolve?: (account: string, reference: string) => Promise<string>;
  readonly probe?: (auth: OAuthTokenAuth, signal: AbortSignal) => Promise<string>;
  readonly exchange?: (
    auth: OAuthTokenAuth,
    refresh: XPublicClientRefresh,
    expectedContentSha256: string,
    now: Date,
    options: { readonly environment: Environment; readonly signal?: AbortSignal },
  ) => Promise<{ readonly accessToken: string; readonly expiresAt: string }>;
};

const OAUTH_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/u;
function validTokenBytes(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 8
    && Buffer.byteLength(value) <= 16_384
    && OAUTH_TOKEN_PATTERN.test(value);
}

/** Runs only in the credential process. Never returns secret values or raw errors. */
export async function runCredentialImport(value: unknown, environment: Environment, signal: AbortSignal, dependencies: CredentialImportDependencies = {}): Promise<VaultImportResult> {
  let request: VaultImportRequest;
  try { request = parseVaultImport(value); } catch { return { ok: false, code: "INVALID_IMPORT" }; }
  const deadline = new OperationDeadline(VAULT_IMPORT_TIMEOUT_MS, { signal });
  let stage: { path: string; contentSha256: string | null } | null = null;
  let failure: VaultImportCode = "IMPORT_FAILED";
  try {
    deadline.throwIfUnavailable("token import");
    failure = "ACCOUNT_CHANGED";
    const current = withReadProjectionAuthAdmission(request.id, environment, () => {
      const snapshot = loadAuthSnapshotIfPresent(request.id, environment);
      if ((snapshot === null ? null : connectionAccountRevision(snapshot, environment)) !== request.expectedRevision) throw new Error();
      return snapshot;
    });
    failure = "VAULT_UNAVAILABLE";
    const accessToken = await deadline.run(() => (dependencies.resolve ?? resolveDesktopSecret)(request.account, request.reference), "vault access");
    if (!validTokenBytes(accessToken)) return { ok: false, code: "TOKEN_UNVERIFIED" };
    const renewing = request.refreshReference !== null && request.clientId !== null;
    let refresh: XPublicClientRefresh | null = null;
    if (renewing) {
      const refreshToken = await deadline.run(() => (dependencies.resolve ?? resolveDesktopSecret)(request.account, request.refreshReference!), "vault access");
      if (!validTokenBytes(refreshToken)) return { ok: false, code: "TOKEN_UNVERIFIED" };
      refresh = Object.freeze({
        kind: "x-oauth2-public-client" as const,
        clientId: request.clientId!,
        refreshToken,
        refreshTokenExpiresAt: null,
      });
    }
    deadline.throwIfUnavailable("token import");
    failure = "IMPORT_FAILED";
    const path = join(ghostgetStateHome(environment), "auth", "oauth-tokens", `${request.id}-${randomUUID()}.json`);
    const credential = refresh === null
      ? { schemaVersion: 1, provider: "x", subject: request.expectedSubject, scopes: request.scopes, accessToken, expiresAt: request.expiresAt }
      : { schemaVersion: 2, provider: "x", subject: request.expectedSubject, scopes: request.scopes, accessToken, expiresAt: null, refresh };
    const expectedContent = `${canonicalJson(credential)}\n`;
    stage = { path, contentSha256: null };
    if (!createPrivateJsonIfAbsent(path, credential, { privateParent: true, environment }).created) { stage = null; throw new Error(); }
    const auth = createAuth(request.id, { oauthProvider: "x", tokenFile: path, subject: request.expectedSubject, scopes: request.scopes, ownedImport: true });
    if (auth.kind !== "oauth-token-file") throw new Error();
    const { contentSha256 } = loadOAuthCredential(auth, { expectedContent });
    stage = { path, contentSha256 };
    failure = "TOKEN_UNVERIFIED";
    if (refresh !== null) {
      // Prove the imported refresh token is live before commit: one exchange
      // yields a rotated pair and the real access-token expiry.
      await deadline.run(
        activeSignal => (dependencies.exchange ?? exchangeXRefreshToken)(
          auth,
          refresh,
          stage!.contentSha256!,
          new Date(),
          { environment, signal: activeSignal },
        ),
        "token renewal",
      );
      stage = { path, contentSha256: loadOAuthCredential(auth).contentSha256 };
    }
    const subject = await deadline.run(activeSignal => (dependencies.probe ?? probeImportedXToken)(auth, activeSignal), "account verification");
    if (subject !== request.expectedSubject) throw new Error();
    failure = "ACCOUNT_CHANGED";
    withReadProjectionAuthAdmission(request.id, environment, () => {
      deadline.throwIfUnavailable("token import");
      // Validation is repeated after both external ceremonies and before the only commit.
      parseVaultImport(request);
      const observed = loadAuthSnapshotIfPresent(request.id, environment);
      if ((observed === null ? null : connectionAccountRevision(observed, environment)) !== request.expectedRevision) throw new Error();
      if (loadOAuthCredential(auth, refresh === null ? { expectedContent } : {}).contentSha256 !== stage!.contentSha256) throw new Error();
      if (current === null) saveAuth(auth, environment);
      else if (!replaceAuthIfUnchanged(current, auth, environment).replaced) throw new Error();
    });
    stage = null;
    return { ok: true };
  } catch {
    if (stage !== null) {
      try {
        const observed = loadAuthSnapshotIfPresent(request.id, environment)?.auth;
        // A cleanup failure after locator publication must never erase its live token.
        if (stage.contentSha256 === null || observed?.kind === "oauth-token-file" && observed.path === stage.path) return { ok: false, code: "IMPORT_UNCERTAIN" };
        if (!removePrivateStateFileIfUnchanged(stage.path, { expectedCurrentContentSha256: stage.contentSha256 }, environment)) return { ok: false, code: "IMPORT_UNCERTAIN" };
      } catch { return { ok: false, code: "IMPORT_UNCERTAIN" }; }
    }
    return { ok: false, code: deadline.signal.aborted ? "IMPORT_CANCELLED" : failure };
  } finally { deadline.dispose(); }
}

async function main(): Promise<void> {
  // Install before the lazy SDK import, including any SDK module-loader output.
  // Native library stderr is discarded by the parent; malformed stdout is never
  // surfaced and cannot be accepted as a successful credential receipt.
  for (const name of Object.getOwnPropertyNames(console)) {
    const value: unknown = Reflect.get(console, name);
    if (typeof value === "function") Reflect.set(console, name, () => undefined);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on("SIGTERM", abort); process.on("SIGINT", abort);
  const timer = setTimeout(abort, VAULT_IMPORT_TIMEOUT_MS);
  let result: VaultImportResult = { ok: false, code: "INVALID_IMPORT" };
  try {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of process.stdin) {
      const bytes = Buffer.from(chunk); size += bytes.byteLength;
      if (size > 16_384 || controller.signal.aborted) throw new Error();
      chunks.push(bytes);
    }
    const value = readInterfaceJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), 16_384);
    result = await runCredentialImport(value, process.env, controller.signal);
  } catch { /* Categorical output only, including SDK and filesystem failures. */ }
  finally { clearTimeout(timer); process.off("SIGTERM", abort); process.off("SIGINT", abort); }
  await Bun.write(Bun.stdout, `${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.main) await main();
