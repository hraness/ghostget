import { basename, dirname, join, resolve } from "node:path";

import {
  loadOAuthCredential,
  loadOAuthToken,
  ProviderHttpClient,
  type LoadedOAuthToken,
  type OAuthTokenAuth,
  type ProviderFetch,
  type XPublicClientRefresh,
} from "./provider-http";
import { pinnedHttpsFetch, type PinnedHttpsFetch } from "./pinned-https";
import { ghostgetStateHome, writePrivateJsonIfUnchanged } from "./storage";

const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_TOKEN_HOSTS = ["api.x.com"] as const;
const X_OAUTH_TIMEOUT_MS = 15_000;
const MAX_X_RESPONSE_BYTES = 16 * 1024;
const DEFAULT_MINIMUM_TOKEN_VALIDITY_MS = 30_000;

type JsonRecord = Record<string, unknown>;

function strictRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function safeText(
  value: unknown,
  label: string,
  minimumBytes: number,
  maximumBytes: number,
): string {
  if (
    typeof value !== "string"
    || Buffer.byteLength(value, "utf8") < minimumBytes
    || Buffer.byteLength(value, "utf8") > maximumBytes
    || [...value].some((character) => {
      const code = character.codePointAt(0) ?? -1;
      return code <= 0x20 || code === 0x7f;
    })
  ) throw new Error(`${label} must be bounded text without whitespace or control characters`);
  return value;
}

function safeInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) throw new Error(`${label} must be an integer from ${minimum} through ${maximum}`);
  return value;
}

function isoAfter(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

function scopedFetch(
  injected: ProviderFetch | undefined,
  pinned: PinnedHttpsFetch,
  signal: AbortSignal | undefined,
): ProviderFetch {
  const base: ProviderFetch = injected ?? ((input, init = {}) => {
    const url = input instanceof URL
      ? new URL(input)
      : new URL(typeof input === "string" ? input : input.url);
    return pinned(url, init, X_OAUTH_TIMEOUT_MS);
  });
  return (input, init = {}) => {
    if (signal?.aborted === true) return Promise.reject(new Error("X OAuth request was cancelled"));
    const requestSignal = init.signal;
    const combined = signal === undefined
      ? requestSignal
      : requestSignal === undefined || requestSignal === null
        ? signal
        : AbortSignal.any([signal, requestSignal]);
    return base(input, {
      ...init,
      ...(combined === undefined || combined === null ? {} : { signal: combined }),
    });
  };
}

export function ownedTokenDirectory(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  return join(ghostgetStateHome(environment), "auth", "oauth-tokens");
}

function isOwnedTokenPath(
  auth: OAuthTokenAuth,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  if (auth.managed !== true && auth.ownedImport !== true) return false;
  const path = resolve(auth.path);
  return dirname(path) === ownedTokenDirectory(environment)
    && new RegExp(`^${auth.id}-[0-9a-f-]{36}\\.json$`, "u").test(basename(path));
}

type XTokenRefreshExchange = Readonly<{
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
}>;

function parseXTokenResponse(
  value: unknown,
  locatorScopes: readonly string[],
): XTokenRefreshExchange {
  const response = strictRecord(value, "X OAuth token response");
  const allowed = new Set([
    "access_token",
    "expires_in",
    "refresh_token",
    "scope",
    "token_type",
  ]);
  const keys = Object.keys(response);
  if (
    !["access_token", "expires_in", "token_type"].every((key) => keys.includes(key))
    || keys.some((key) => !allowed.has(key))
  ) throw new Error("X OAuth token response has unsupported fields");
  if (typeof response.token_type !== "string" || response.token_type.toLowerCase() !== "bearer") {
    throw new Error("X OAuth token response has an unsupported token type");
  }
  const accessToken = safeText(response.access_token, "X OAuth access token", 8, 16 * 1_024);
  const expiresInSeconds = safeInteger(response.expires_in, "X OAuth expires_in", 60, 86_400);
  const refreshToken = response.refresh_token === undefined
    ? null
    : safeText(response.refresh_token, "X OAuth refresh token", 8, 16 * 1_024);
  if (typeof response.scope !== "string") {
    throw new Error("X OAuth token response omitted its granted scope set");
  }
  const granted = new Set(response.scope.split(" ").filter((scope) => scope.length > 0));
  if (granted.size === 0 || locatorScopes.some((scope) => !granted.has(scope))) {
    throw new Error("X OAuth refresh narrowed the account's authorized scopes");
  }
  return Object.freeze({ accessToken, refreshToken, expiresInSeconds });
}

export function xCredentialDocument(
  auth: OAuthTokenAuth,
  accessToken: string,
  expiresAt: string,
  refresh: XPublicClientRefresh,
): Readonly<{
  schemaVersion: 2;
  provider: "x";
  subject: string;
  scopes: readonly string[];
  accessToken: string;
  expiresAt: string;
  refresh: XPublicClientRefresh;
}> {
  if (auth.subject === undefined || !/^[0-9]{1,19}$/u.test(auth.subject)) {
    throw new Error("owned-import X OAuth auth requires an exact numeric subject");
  }
  return Object.freeze({
    schemaVersion: 2 as const,
    provider: "x" as const,
    subject: auth.subject,
    scopes: auth.scopes,
    accessToken,
    expiresAt,
    refresh,
  });
}

/** Exchange a rotated X refresh token and durably replace the owned credential. */
export async function exchangeXRefreshToken(
  auth: OAuthTokenAuth,
  refresh: XPublicClientRefresh,
  expectedContentSha256: string,
  now: Date,
  options: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    fetch?: ProviderFetch;
    pinnedFetch?: PinnedHttpsFetch;
    signal?: AbortSignal;
  }> = {},
): Promise<LoadedOAuthToken> {
  const environment = options.environment ?? process.env;
  if (!isOwnedTokenPath(auth, environment)) {
    throw new Error("imported X OAuth credential is not under owned token custody");
  }
  const fetch_ = scopedFetch(
    options.fetch,
    options.pinnedFetch ?? pinnedHttpsFetch,
    options.signal,
  );
  const http = new ProviderHttpClient(fetch_, X_OAUTH_TIMEOUT_MS, MAX_X_RESPONSE_BYTES);
  const response = await http.request(
    X_TOKEN_URL,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: refresh.clientId,
        grant_type: "refresh_token",
        refresh_token: refresh.refreshToken,
      }).toString(),
    },
    [200],
    X_TOKEN_HOSTS,
    MAX_X_RESPONSE_BYTES,
    "application/json",
  );
  const refreshed = parseXTokenResponse(response.body, auth.scopes);
  const expiresAt = isoAfter(now, refreshed.expiresInSeconds);
  // X rotates refresh tokens on each exchange. A response that omits the
  // rotated value keeps the current one per RFC 6749 section 6.
  const nextRefresh: XPublicClientRefresh = Object.freeze({
    kind: "x-oauth2-public-client" as const,
    clientId: refresh.clientId,
    refreshToken: refreshed.refreshToken ?? refresh.refreshToken,
    refreshTokenExpiresAt: refresh.refreshTokenExpiresAt,
  });
  const replacement = xCredentialDocument(auth, refreshed.accessToken, expiresAt, nextRefresh);
  if (
    !writePrivateJsonIfUnchanged(auth.path, replacement, {
      expectedCurrentContentSha256: expectedContentSha256,
    })
  ) throw new Error("imported X OAuth credential changed concurrently before refresh");
  return Object.freeze({ accessToken: refreshed.accessToken, expiresAt });
}

/**
 * Return a usable access token for an owned-import X locator, renewing through
 * the stored rotated refresh credential when the access token is inside its
 * validity budget. Mirrors the managed Google renewal contract: durable writes
 * are compare-and-swap bound and a concurrent change reloads once.
 */
export function resolveXOAuthToken(
  auth: OAuthTokenAuth,
  options: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    now?: Date;
    minimumValidityMs?: number;
    force?: boolean;
    fetch?: ProviderFetch;
    pinnedFetch?: PinnedHttpsFetch;
    signal?: AbortSignal;
  }> = {},
): LoadedOAuthToken | Promise<LoadedOAuthToken> {
  const environment = options.environment ?? process.env;
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const minimumValidityMs = options.minimumValidityMs ?? DEFAULT_MINIMUM_TOKEN_VALIDITY_MS;
  const force = options.force === true;
  if (
    !Number.isFinite(nowMs)
    || !Number.isSafeInteger(minimumValidityMs)
    || minimumValidityMs < 0
  ) throw new Error("OAuth token refresh validity budget is invalid");
  const credential = loadOAuthCredential(auth);
  const refresh = credential.schemaVersion === 2
    && credential.refresh?.kind === "x-oauth2-public-client"
    && isOwnedTokenPath(auth, environment)
    ? credential.refresh
    : null;
  if (
    !force
    && credential.expiresAt !== null
    && Date.parse(credential.expiresAt) - nowMs > minimumValidityMs
  ) return Object.freeze({ accessToken: credential.accessToken, expiresAt: credential.expiresAt });
  if (refresh === null) {
    if (credential.schemaVersion === 2 && credential.refresh !== null) throw new Error("imported X refresh credential is not under owned token custody");
    if (force) throw new Error("the imported X credential does not carry a refresh token; import again with --refresh-reference");
    return loadOAuthToken(auth, now, minimumValidityMs);
  }
  if (
    refresh.refreshTokenExpiresAt !== null
    && Date.parse(refresh.refreshTokenExpiresAt) <= nowMs
  ) throw new Error("the imported X refresh credential expired; import a fresh token with ghostget vault import-x --replace");
  return (async (): Promise<LoadedOAuthToken> => {
    try {
      return await exchangeXRefreshToken(auth, refresh, credential.contentSha256, now, options);
    } catch (error) {
      const observed = loadOAuthCredential(auth);
      if (
        observed.expiresAt !== null
        && Date.parse(observed.expiresAt) - nowMs > minimumValidityMs
      ) return Object.freeze({ accessToken: observed.accessToken, expiresAt: observed.expiresAt });
      throw error;
    }
  })();
}
