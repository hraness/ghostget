import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuth, loadAuth, loadAuthSnapshot, loadAuthSnapshotIfPresent, parseAuth, removeAuth, saveAuth } from "../auth";
import { loadOAuthCredential, type OAuthTokenAuth } from "../provider-http";
import { ghostgetStateHome } from "../storage";
import { parseVaultImport, probeImportedXToken, runCredentialImport, type VaultImportRequest } from "./credential-helper";
import { credentialProcessSpec, exchangeCredentialRequest, parseCredentialResult, type CredentialProcess } from "./vault";
import { connectionAccountRevision } from "./account-revision";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const token = "synthetic-token-never-a-real-credential";
const request: VaultImportRequest = { action: "vault.import", id: "x-private", account: "Synthetic account", reference: "op://Private Vault/X token/credential", expectedSubject: "12345", scopes: ["tweet.read", "users.read"], expiresAt: null, expectedRevision: null };
function state() {
  const raw = mkdtempSync(join(tmpdir(), "ghostget-vault-")); chmodSync(raw, 0o700); roots.push(raw);
  const environment = { ...process.env, GHOSTGET_STATE_HOME: raw };
  return { environment, root: ghostgetStateHome(environment) };
}
function tokens(root: string): string[] { const path = join(root, "auth", "oauth-tokens"); return existsSync(path) ? readdirSync(path) : []; }
const dependencies = { resolve: async () => token, probe: async () => request.expectedSubject };
const signal = () => new AbortController().signal;

describe("1Password exact X token import", () => {
  test("rejects unsupported purposes, ambiguous references, invalid IDs, scopes and expiry before any vault call", async () => {
    let calls = 0; const fixture = state();
    for (const invalid of [
      { action: "vault.get" }, { id: "../escape" }, { reference: "op://vault/item/password?attribute=otp" },
      { reference: "op://vault/item/password\n" }, { reference: "op://vault/item%2fother/password" },
      { expectedSubject: "some-handle" }, { scopes: ["tweet.read"] }, { scopes: ["tweet.read", "users.read", "admin.all"] },
      { expiresAt: "2000-01-01T00:00:00.000Z" }, { expiresAt: "not-a-date" }, { account: "account\n" },
    ]) {
      expect(await runCredentialImport({ ...request, ...invalid }, fixture.environment, signal(), { resolve: async () => { calls++; return token; } })).toEqual({ ok: false, code: "INVALID_IMPORT" });
    }
    expect(calls).toBe(0); expect(tokens(fixture.root)).toEqual([]);
    expect(parseVaultImport(request).reference).toBe(request.reference);
  });

  test("resolves only the selected account and field, privately stages and proves the exact subject before commit", async () => {
    const fixture = state(); let probed = false;
    const result = await runCredentialImport(request, fixture.environment, signal(), {
      resolve: async (account, reference) => { expect(account).toBe(request.account); expect(reference).toBe(request.reference); return token; },
      probe: async auth => {
        probed = true; expect(loadAuthSnapshotIfPresent(request.id, fixture.environment)).toBeNull();
        expect(auth.ownedImport).toBe(true); expect(auth.managed).toBeUndefined();
        expect(lstatSync(auth.path).mode & 0o777).toBe(0o600); expect(loadOAuthCredential(auth).accessToken).toBe(token);
        return request.expectedSubject;
      },
    });
    expect(result).toEqual({ ok: true }); expect(probed).toBe(true);
    const auth = loadAuth(request.id, fixture.environment); expect(auth.kind).toBe("oauth-token-file");
    expect(JSON.stringify(result)).not.toContain(token); expect(JSON.stringify(auth)).not.toContain(request.reference);
    expect(tokens(fixture.root)).toHaveLength(1);
    expect(removeAuth(request.id, fixture.environment)).toBe(true); expect(tokens(fixture.root)).toEqual([]);
  });

  test("wrong account, app-only rejection and raw provider errors preserve the old binding and remove only the stage", async () => {
    for (const probe of [async () => "999", async () => { throw new Error(`provider echoed ${token} ${request.reference}`); }]) {
      const fixture = state(); saveAuth(createAuth(request.id, { source: "chrome", subject: "old-account" }), fixture.environment);
      const before = loadAuthSnapshot(request.id, fixture.environment);
      const result = await runCredentialImport({ ...request, expectedRevision: connectionAccountRevision(before, fixture.environment) }, fixture.environment, signal(), { ...dependencies, probe });
      expect(result).toEqual({ ok: false, code: "TOKEN_UNVERIFIED" });
      expect(loadAuthSnapshot(request.id, fixture.environment)).toEqual(before); expect(tokens(fixture.root)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(token); expect(JSON.stringify(result)).not.toContain(request.reference);
    }
  });

  test("vault denial and malformed tokens never stage or commit credentials", async () => {
    for (const resolve of [async () => { throw new Error(`SDK secret ${token}`); }, async () => "short", async () => `${token}\n`, async () => "x".repeat(16_385)]) {
      const fixture = state(); const result = await runCredentialImport(request, fixture.environment, signal(), { ...dependencies, resolve });
      expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain(token);
      expect(loadAuthSnapshotIfPresent(request.id, fixture.environment)).toBeNull(); expect(tokens(fixture.root)).toEqual([]);
    }
  });

  test("a stale request cannot prompt the vault and a concurrent replacement cannot be overwritten", async () => {
    const fixture = state(); saveAuth(createAuth(request.id, { source: "chrome" }), fixture.environment);
    let calls = 0;
    expect(await runCredentialImport(request, fixture.environment, signal(), { resolve: async () => { calls++; return token; } })).toEqual({ ok: false, code: "ACCOUNT_CHANGED" });
    expect(calls).toBe(0);
    const before = loadAuthSnapshot(request.id, fixture.environment);
    const replacement = createAuth(request.id, { source: "safari", subject: "newer-account" });
    expect(await runCredentialImport({ ...request, expectedRevision: connectionAccountRevision(before, fixture.environment) }, fixture.environment, signal(), {
      ...dependencies, probe: async () => { saveAuth(replacement, fixture.environment, { force: true }); return request.expectedSubject; },
    })).toEqual({ ok: false, code: "ACCOUNT_CHANGED" });
    expect(loadAuth(request.id, fixture.environment)).toEqual(replacement); expect(tokens(fixture.root)).toEqual([]);
  });

  test("cancellation before a vault call and during a staged probe never commits", async () => {
    const before = new AbortController(); before.abort(); const first = state(); let calls = 0;
    expect(await runCredentialImport(request, first.environment, before.signal, { resolve: async () => { calls++; return token; } })).toEqual({ ok: false, code: "IMPORT_CANCELLED" });
    expect(calls).toBe(0);
    const controller = new AbortController(); const fixture = state();
    const result = await runCredentialImport(request, fixture.environment, controller.signal, { ...dependencies, probe: async () => { controller.abort(); return new Promise(() => undefined); } });
    expect(result).toEqual({ ok: false, code: "IMPORT_CANCELLED" }); expect(tokens(fixture.root)).toEqual([]);
    expect(loadAuthSnapshotIfPresent(request.id, fixture.environment)).toBeNull();
  });

  test("account metadata changing away and back cannot revive an old import revision", async () => {
    const fixture = state(); const original = createAuth(request.id, { source: "chrome" }); saveAuth(original, fixture.environment);
    const before = loadAuthSnapshot(request.id, fixture.environment);
    const revision = connectionAccountRevision(before, fixture.environment);
    expect(await runCredentialImport({ ...request, expectedRevision: revision }, fixture.environment, signal(), {
      ...dependencies, probe: async () => {
        saveAuth(createAuth(request.id, { source: "safari" }), fixture.environment, { force: true });
        saveAuth(original, fixture.environment, { force: true });
        expect(loadAuthSnapshot(request.id, fixture.environment).contentSha256).toBe(before.contentSha256);
        return request.expectedSubject;
      },
    })).toEqual({ ok: false, code: "ACCOUNT_CHANGED" });
    expect(loadAuth(request.id, fixture.environment)).toEqual(original); expect(tokens(fixture.root)).toEqual([]);
  });

  test("replacement and browser reconnect clean only a prior owned import", async () => {
    const fixture = state(); expect(await runCredentialImport(request, fixture.environment, signal(), dependencies)).toEqual({ ok: true });
    const previous = loadAuthSnapshot(request.id, fixture.environment); const oldPath = (previous.auth as OAuthTokenAuth).path;
    expect(await runCredentialImport({ ...request, expectedRevision: connectionAccountRevision(previous, fixture.environment) }, fixture.environment, signal(), dependencies)).toEqual({ ok: true });
    expect(existsSync(oldPath)).toBe(false); expect(tokens(fixture.root)).toHaveLength(1);
    saveAuth(createAuth(request.id, { source: "safari" }), fixture.environment, { force: true }); expect(tokens(fixture.root)).toEqual([]);
    const external = join(fixture.root, "caller-token.json"); writeFileSync(external, "synthetic owned-by-caller", { mode: 0o600 });
    saveAuth(createAuth(request.id, { oauthProvider: "x", tokenFile: external, scopes: request.scopes }), fixture.environment, { force: true });
    removeAuth(request.id, fixture.environment); expect(existsSync(external)).toBe(true);
  });

  test("an altered staged credential retains uncertain cleanup evidence instead of deleting changed bytes", async () => {
    const fixture = state();
    expect(await runCredentialImport(request, fixture.environment, signal(), {
      ...dependencies, probe: async auth => { writeFileSync(auth.path, "changed-private-evidence\n"); throw new Error(); },
    })).toEqual({ ok: false, code: "IMPORT_UNCERTAIN" });
    expect(tokens(fixture.root)).toHaveLength(1); expect(loadAuthSnapshotIfPresent(request.id, fixture.environment)).toBeNull();
    expect(readFileSync(join(fixture.root, "auth", "oauth-tokens", tokens(fixture.root)[0]!), "utf8")).toBe("changed-private-evidence\n");
  });

  test("owned imports cannot claim renewal or a different provider/subject", () => {
    const auth = { schemaVersion: 1, id: request.id, kind: "oauth-token-file", provider: "x", path: "/private/synthetic.json", scopes: request.scopes, subject: request.expectedSubject, ownedImport: true } as const;
    expect(parseAuth(auth)).toEqual(auth);
    for (const changed of [{ managed: true }, { provider: "gmail" }, { subject: "name" }, { ownedImport: false }]) expect(() => parseAuth({ ...auth, ...changed })).toThrow();
  });

  test("a successful subject probe cannot publish changed token bytes", async () => {
    const fixture = state();
    expect(await runCredentialImport(request, fixture.environment, signal(), {
      ...dependencies, probe: async auth => {
        const document = JSON.parse(readFileSync(auth.path, "utf8")) as Record<string, unknown>;
        writeFileSync(auth.path, `${JSON.stringify({ ...document, accessToken: "unverified-replacement-token" })}\n`);
        return request.expectedSubject;
      },
    })).toEqual({ ok: false, code: "IMPORT_UNCERTAIN" });
    expect(loadAuthSnapshotIfPresent(request.id, fixture.environment)).toBeNull(); expect(tokens(fixture.root)).toHaveLength(1);
  });
});

describe("fixed token probe and credential IPC", () => {
  test("probe sends only a bearer to the fixed X account endpoint with bounded trusted transport", async () => {
    const fixture = state(); const path = join(fixture.root, "synthetic-token.json");
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, provider: "x", subject: request.expectedSubject, scopes: request.scopes, accessToken: token, expiresAt: null }), { mode: 0o600 });
    const auth = createAuth(request.id, { oauthProvider: "x", tokenFile: path, scopes: request.scopes, subject: request.expectedSubject }) as OAuthTokenAuth;
    const subject = await probeImportedXToken(auth, signal(), async (url, init, timeout) => {
      expect(url.href).toBe("https://api.x.com/2/users/me"); expect(init.method).toBe("GET"); expect(init.redirect).toBe("error");
      expect(init.credentials).toBe("omit"); expect(init.body).toBeUndefined(); expect(init.signal).toBeDefined(); expect(timeout).toBe(15_000);
      expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${token}`);
      return Response.json({ data: { id: request.expectedSubject, username: "ignored-private-name" } });
    });
    expect(subject).toBe(request.expectedSubject);
    await expect(probeImportedXToken(auth, signal(), async () => Response.json({ token }, { status: 403 }))).rejects.toThrow();
    await expect(probeImportedXToken(auth, signal(), async () => Response.json({ data: { id: request.expectedSubject }, padding: "x".repeat(16_384) }))).rejects.toThrow();
  });

  test("credential receipts reject raw SDK output, unknown fields/codes, duplicate keys and oversized output", () => {
    expect(parseCredentialResult('{"ok":true}')).toEqual({ ok: true });
    expect(parseCredentialResult('{"ok":false,"code":"VAULT_UNAVAILABLE"}')).toEqual({ ok: false, code: "VAULT_UNAVAILABLE" });
    for (const output of [token, JSON.stringify({ ok: true, token }), '{"ok":false,"code":"RAW_SECRET"}', '{"ok":false,"ok":true}', " ".repeat(1025) + '{"ok":true}']) expect(() => parseCredentialResult(output)).toThrow();
  });

  test("valid child receipts are joined and private input stays solely in stdin", async () => {
    const writes: string[] = []; const kills: string[] = [];
    const child: CredentialProcess = { stdin: { write: value => writes.push(value), end() {} }, stdout: new Response('{"ok":true}\n').body!, exited: Promise.resolve(0), kill: value => kills.push(value) };
    await exchangeCredentialRequest(child, request); expect(writes).toEqual([`${JSON.stringify(request)}\n`]); expect(kills).toEqual([]);
  });

  test("the actual helper rejects an unsupported purpose without loading a vault or provider", async () => {
    const fixture = state();
    const launch = credentialProcessSpec(fixture.environment);
    const child = Bun.spawn(launch.command, { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: launch.environment, cwd: launch.cwd });
    const errorOutput = new Response(child.stderr).text();
    await expect(exchangeCredentialRequest(child, { action: "vault.get", reference: request.reference })).rejects.toMatchObject({ code: "INVALID_IMPORT" });
    expect(await errorOutput).toBe(""); expect(tokens(fixture.root)).toEqual([]);
  });

  test("credential launch refuses ambient env files, runtime preloads and automatic installation", async () => {
    const fixture = state();
    const launch = credentialProcessSpec({ ...fixture.environment, OP_SERVICE_ACCOUNT_TOKEN: "synthetic-ambient-secret", NODE_OPTIONS: "untrusted-preload", BUN_OPTIONS: "untrusted-preload", HTTPS_PROXY: "https://untrusted.invalid" });
    expect(launch.command.slice(1, 3)).toEqual(["--no-env-file", "--no-install"]);
    expect(launch.cwd).toBe(new URL(".", new URL("./credential-helper.ts", import.meta.url)).pathname.replace(/\/$/u, ""));
    for (const key of ["OP_SERVICE_ACCOUNT_TOKEN", "NODE_OPTIONS", "BUN_OPTIONS", "HTTPS_PROXY"]) expect(launch.environment[key]).toBeUndefined();
    const sentinel = "GHOSTGET_SYNTHETIC_ENV_SENTINEL";
    writeFileSync(join(fixture.root, ".env"), `${sentinel}=must-not-load\n`, { mode: 0o600 });
    const child = Bun.spawn([launch.command[0]!, ...launch.command.slice(1, 3), "--eval", `process.stdout.write(process.env.${sentinel} === undefined ? 'absent' : 'loaded')`], { cwd: fixture.root, env: launch.environment, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code).toBe(0); expect(stderr).toBe(""); expect(stdout).toBe("absent");
  });

  test("cancellation escalates a stuck child to SIGKILL and returns no untrusted diagnostics", async () => {
    const kills: string[] = []; let finish: (code: number) => void = () => undefined; let close: () => void = () => undefined;
    const exited = new Promise<number>(resolve => { finish = resolve; });
    const child: CredentialProcess = { stdin: { write() {}, end() {} }, stdout: new ReadableStream({ start(controller) { close = () => controller.close(); } }), exited,
      kill: value => { kills.push(value); if (value === "SIGKILL") { close(); finish(137); } } };
    await expect(exchangeCredentialRequest(child, request, undefined, 1)).rejects.toMatchObject({ code: "IMPORT_UNCERTAIN" });
    expect(kills).toEqual(["SIGTERM", "SIGKILL"]);
  });

  test("oversized and lost child output become categorical uncertainty without echoing secrets", async () => {
    for (const output of [token.repeat(40), ""]) {
      const child: CredentialProcess = { stdin: { write() {}, end() {} }, stdout: new Response(output).body!, exited: Promise.resolve(0), kill() {} };
      await expect(exchangeCredentialRequest(child, request)).rejects.toMatchObject({ code: "IMPORT_UNCERTAIN" });
    }
  });
});
