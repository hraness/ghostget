import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { createAuth } from "./auth";
import { canonicalJson } from "./canonical-json";
import { resolveOAuthToken } from "./oauth-google";
import { resolveXOAuthToken } from "./oauth-x";
import { loadOAuthCredential, type OAuthTokenAuth, type XPublicClientRefresh } from "./provider-http";
import { createPrivateJsonIfAbsent, ghostgetStateHome } from "./storage";

const roots: string[] = [];
const cleanup = () => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); };

const CLIENT_ID = "publicClient-1x";
const SUBJECT = "12345";
const SCOPES = ["offline.access", "tweet.read", "users.read"];

function state(): { readonly environment: Readonly<Record<string, string>> } {
  const raw = mkdtempSync(join(tmpdir(), "ghostget-x-oauth-")); chmodSync(raw, 0o700); roots.push(raw);
  const environment = { GHOSTGET_STATE_HOME: ghostgetStateHome({ GHOSTGET_STATE_HOME: raw }) };
  return { environment };
}

function ownedLocator(
  environment: Readonly<Record<string, string | undefined>>,
  id = "x-private",
  path?: string,
): OAuthTokenAuth {
  const tokenFile = path ?? join(ghostgetStateHome(environment), "auth", "oauth-tokens", `${id}-${crypto.randomUUID()}.json`);
  const auth = createAuth(id, { oauthProvider: "x", tokenFile, scopes: SCOPES, subject: SUBJECT, ownedImport: true });
  if (auth.kind !== "oauth-token-file") throw new Error("locator fixture failed");
  return auth;
}

function refreshCredential(refreshToken = "private-x-refresh-token", expiresAt: string | null = null): XPublicClientRefresh {
  return Object.freeze({ kind: "x-oauth2-public-client", clientId: CLIENT_ID, refreshToken, refreshTokenExpiresAt: expiresAt });
}

function stage(
  auth: OAuthTokenAuth,
  environment: Readonly<Record<string, string | undefined>>,
  document: Record<string, unknown>,
): string {
  const result = createPrivateJsonIfAbsent(auth.path, document, { privateParent: true, environment });
  if (!result.created) throw new Error("staged fixture collision");
  return auth.path;
}

function xTokenResponse(extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    token_type: "Bearer",
    access_token: "private-x-refreshed-access-token",
    expires_in: 7200,
    refresh_token: "private-x-rotated-refresh-token",
    scope: SCOPES.join(" "),
    ...extra,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

const v1Document = (accessToken = "private-x-access-token", expiresAt: string | null = null) =>
  ({ schemaVersion: 1, provider: "x", subject: SUBJECT, scopes: SCOPES, accessToken, expiresAt });
const v2Document = (accessToken = "private-x-access-token", expiresAt: string | null, refresh = refreshCredential()) =>
  ({ schemaVersion: 2, provider: "x", subject: SUBJECT, scopes: SCOPES, accessToken, expiresAt, refresh });

describe("X public-client refresh credentials", () => {
  test("a fresh stored access token returns without any token-endpoint call", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      stage(auth, environment, v2Document("private-x-access-token", "2030-01-01T00:00:00.000Z"));
      const token = await resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"),
        fetch: async () => { throw new Error("refresh must not run for a fresh token"); },
      });
      expect(token).toEqual({ accessToken: "private-x-access-token", expiresAt: "2030-01-01T00:00:00.000Z" });
    } finally { cleanup(); }
  });

  test("a near-expiry token renews once with the public-client grant and persists rotation", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      stage(auth, environment, v2Document("private-x-access-token", "2026-01-01T00:00:10.000Z"));
      const requests: { url: string; form: URLSearchParams; init: RequestInit | undefined }[] = [];
      const token = await resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"), minimumValidityMs: 30_000,
        fetch: async (input, init) => {
          requests.push({ url: String(input), form: new URLSearchParams(String(init?.body)), init });
          return xTokenResponse();
        },
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]!.url).toBe("https://api.x.com/2/oauth2/token");
      expect(requests[0]!.init?.method).toBe("POST");
      expect(requests[0]!.form.get("grant_type")).toBe("refresh_token");
      expect(requests[0]!.form.get("refresh_token")).toBe("private-x-refresh-token");
      expect(requests[0]!.form.get("client_id")).toBe(CLIENT_ID);
      expect(requests[0]!.form.get("client_secret")).toBeNull();
      expect(token).toEqual({ accessToken: "private-x-refreshed-access-token", expiresAt: "2026-01-01T02:00:00.000Z" });
      const stored = loadOAuthCredential(auth);
      expect(stored.accessToken).toBe("private-x-refreshed-access-token");
      expect(stored.expiresAt).toBe("2026-01-01T02:00:00.000Z");
      expect(stored.refresh).toMatchObject({ kind: "x-oauth2-public-client", refreshToken: "private-x-rotated-refresh-token" });
    } finally { cleanup(); }
  });

  test("an omitted rotated refresh token keeps the current grant per RFC 6749", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      stage(auth, environment, v2Document("private-x-access-token", "2026-01-01T00:00:10.000Z"));
      await resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"),
        fetch: async () => xTokenResponse({ refresh_token: undefined }),
      });
      expect(loadOAuthCredential(auth).refresh).toMatchObject({ refreshToken: "private-x-refresh-token" });
    } finally { cleanup(); }
  });

  test("a refresh cannot narrow the account's declared scopes", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      const before = readFileSync(stage(auth, environment, v2Document("private-x-access-token", "2026-01-01T00:00:10.000Z")), "utf8");
      await expect(resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"),
        fetch: async () => xTokenResponse({ scope: "tweet.read users.read" }),
      })).rejects.toThrow("narrowed");
      expect(readFileSync(auth.path, "utf8")).toBe(before);
    } finally { cleanup(); }
  });

  test("malformed token responses and non-200 statuses never replace the stored credential", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      const before = readFileSync(stage(auth, environment, v2Document("private-x-access-token", "2026-01-01T00:00:10.000Z")), "utf8");
      for (const response of [
        xTokenResponse({ expires_in: undefined }),
        xTokenResponse({ token_type: "bearer-not" }),
        xTokenResponse({ unexpected: true }),
        xTokenResponse({ access_token: "short" }),
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "Content-Type": "application/json" } }),
      ]) {
        await expect(resolveXOAuthToken(auth, {
          environment, now: new Date("2026-01-01T00:00:00.000Z"),
          fetch: async () => response,
        })).rejects.toThrow();
        expect(readFileSync(auth.path, "utf8")).toBe(before);
      }
    } finally { cleanup(); }
  });

  test("an expired refresh credential fails closed instead of calling the endpoint", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      stage(auth, environment, v2Document("private-x-access-token", "2026-01-01T00:00:10.000Z", refreshCredential("private-x-refresh-token", "2025-12-31T23:59:00.000Z")));
      await expect((async () => resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"),
        fetch: async () => { throw new Error("an expired refresh credential must not reach the endpoint"); },
      }))()).rejects.toThrow("refresh credential expired");
    } finally { cleanup(); }
  });

  test("a concurrent credential rewrite wins once and the loser returns the fresh token", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      stage(auth, environment, v2Document("private-x-access-token", "2026-01-01T00:00:10.000Z"));
      const token = await resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"),
        fetch: async () => {
          // A parallel refresh committed a fresher credential before our write.
          writeFileSync(auth.path, `${canonicalJson(v2Document("private-x-concurrent-access-token", "2026-01-01T04:00:00.000Z", refreshCredential("private-x-concurrent-refresh")))}\n`, { mode: 0o600 });
          return xTokenResponse();
        },
      });
      expect(token).toEqual({ accessToken: "private-x-concurrent-access-token", expiresAt: "2026-01-01T04:00:00.000Z" });
      expect(loadOAuthCredential(auth).refresh).toMatchObject({ refreshToken: "private-x-concurrent-refresh" });
    } finally { cleanup(); }
  });

  test("a concurrent rewrite to a still-expired token fails instead of reporting success", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      stage(auth, environment, v2Document("private-x-access-token", "2026-01-01T00:00:10.000Z"));
      await expect(resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"),
        fetch: async () => {
          writeFileSync(auth.path, `${canonicalJson(v2Document("private-x-stale-token", "2026-01-01T00:00:05.000Z"))}\n`, { mode: 0o600 });
          return xTokenResponse();
        },
      })).rejects.toThrow();
    } finally { cleanup(); }
  });

  test("non-renewable imports keep one-shot semantics and force explains the remedy", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      stage(auth, environment, v1Document("private-x-access-token", "2026-01-01T00:00:10.000Z"));
      await expect((async () => resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"), minimumValidityMs: 30_000,
        fetch: async () => { throw new Error("non-renewable tokens never reach the endpoint"); },
      }))()).rejects.toThrow("expires within");
      await expect((async () => resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"), force: true,
      }))()).rejects.toThrow("--refresh-reference");
    } finally { cleanup(); }
  });

  test("a null-expiry renewable document renews instead of living forever", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      stage(auth, environment, v2Document("private-x-access-token", null));
      const token = await resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"),
        fetch: async () => xTokenResponse(),
      });
      expect(token.accessToken).toBe("private-x-refreshed-access-token");
    } finally { cleanup(); }
  });

  test("credentials outside owned token custody cannot refresh", async () => {
    try {
      const { environment } = state();
      const outside = join(ghostgetStateHome(environment), "auth", "caller-controlled.json");
      mkdirSync(dirname(outside), { recursive: true, mode: 0o700 });
      writeFileSync(outside, `${canonicalJson(v2Document("private-x-access-token", "2026-01-01T00:00:10.000Z"))}\n`, { mode: 0o600 });
      const auth = ownedLocator(environment, "x-private", outside);
      await expect((async () => resolveXOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"),
        fetch: async () => { throw new Error("custody violation must not reach the endpoint"); },
      }))()).rejects.toThrow("custody");
    } finally { cleanup(); }
  });

  test("resolveOAuthToken dispatches owned X imports through the renewal path", async () => {
    try {
      const { environment } = state();
      const auth = ownedLocator(environment);
      stage(auth, environment, v2Document("private-x-access-token", "2026-01-01T00:00:10.000Z"));
      const token = await resolveOAuthToken(auth, {
        environment, now: new Date("2026-01-01T00:00:00.000Z"),
        fetch: async () => xTokenResponse(),
      });
      expect(token.accessToken).toBe("private-x-refreshed-access-token");
    } finally { cleanup(); }
  });
});
