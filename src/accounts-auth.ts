import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname, platform, userInfo } from "node:os";
import { join } from "node:path";

import {
  initiateSuiteOidcDeviceAuthorization,
  type SuiteOidcDevicePollOutcome,
} from "@hraness/suite-accounts/oidc-device-code";

import { wrenchStateHome } from "./storage";

const WRENCH_CLIENT_ID = "hraness:wrench:production:v1";
const ACCOUNTS_ORIGIN = "https://account.hraness.com";
const DEVICE_AUTHORIZATION_ENDPOINT =
  `${ACCOUNTS_ORIGIN}/api/auth/oauth2/device_authorization`;
const DEVICE_TOKEN_ENDPOINT =
  `${ACCOUNTS_ORIGIN}/api/auth/oauth2/device/token`;
const TOKEN_ENDPOINT = `${ACCOUNTS_ORIGIN}/api/auth/oauth2/token`;

export type TokenStorage = Readonly<{
  backend: "keychain" | "encrypted-file" | "memory";
  deleteRefreshToken: () => Promise<void>;
  loadRefreshToken: () => Promise<string | null>;
  saveRefreshToken: (token: string) => Promise<void>;
}>;

export type AccountsAuthResult =
  | Readonly<{ kind: "success"; message: string }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "expired" }>
  | Readonly<{ kind: "error"; message: string }>;

export type AccountsAuthHandlers = Readonly<{
  onUserCode?: (userCode: string, verificationUri: string) => void;
  onPending?: () => void;
  onSlowDown?: (intervalMs: number) => void;
}>;

/**
 * Create the token storage for the Wrench Accounts session.
 *
 * The storage backend is selected at runtime:
 * - On macOS, the OS keychain is preferred.
 * - On other platforms, an encrypted file in the Wrench state home is used.
 * - Tests may inject a memory backend through `storage`.
 */
export function createWrenchTokenStorage(
  environment: Readonly<Record<string, string | undefined>>,
  storage?: TokenStorage,
): TokenStorage {
  if (storage !== undefined) return storage;
  const keychain = createKeychainTokenStorage(
    "wrench",
    "hraness-accounts",
  );
  const stateHome = wrenchStateHome(environment);
  const file = createEncryptedFileTokenStorage(
    join(stateHome, "accounts", "refresh-token.enc"),
  );
  // Prefer the keychain when it is available; fall back to the encrypted
  // file so headless or non-macOS environments can still authenticate.
  return {
    backend: "keychain",
    deleteRefreshToken: async () => {
      await keychain.deleteRefreshToken();
      await file.deleteRefreshToken();
    },
    loadRefreshToken: async () => {
      const keychainToken = await keychain.loadRefreshToken();
      if (keychainToken !== null) return keychainToken;
      return file.loadRefreshToken();
    },
    saveRefreshToken: async (token) => {
      try {
        await keychain.saveRefreshToken(token);
      } catch {
        // Keychain may be unavailable (e.g., headless CI); the encrypted
        // file fallback still provides a secure local copy.
      }
      await file.saveRefreshToken(token);
    },
  };
}

function createKeychainTokenStorage(
  serviceName: string,
  accountName: string,
): TokenStorage {
  return {
    backend: "keychain",
    deleteRefreshToken: async () => {
      await deleteKeychainEntry(serviceName, accountName);
    },
    loadRefreshToken: async () => {
      return await readKeychainEntry(serviceName, accountName);
    },
    saveRefreshToken: async (token: string) => {
      await writeKeychainEntry(serviceName, accountName, token);
    },
  };
}

async function readKeychainEntry(
  service: string,
  account: string,
): Promise<string | null> {
  if (platform() !== "darwin") return null;
  const { execFile } = await import("node:child_process");
  return new Promise(resolve => {
    execFile(
      "security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      (error, stdout) => {
        if (error !== null) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

async function writeKeychainEntry(
  service: string,
  account: string,
  value: string,
): Promise<void> {
  if (platform() !== "darwin") {
    throw new Error("Keychain storage is only supported on macOS.");
  }
  const { execFile } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    execFile(
      "security",
      ["add-generic-password", "-s", service, "-a", account, "-w", value, "-U"],
      error => {
        if (error !== null) {
          reject(new Error("Failed to write to the keychain."));
          return;
        }
        resolve();
      },
    );
  });
}

async function deleteKeychainEntry(
  service: string,
  account: string,
): Promise<void> {
  if (platform() !== "darwin") return;
  const { execFile } = await import("node:child_process");
  return new Promise(resolve => {
    execFile(
      "security",
      ["delete-generic-password", "-s", service, "-a", account],
      () => resolve(),
    );
  });
}

function createEncryptedFileTokenStorage(filePath: string): TokenStorage {
  return {
    backend: "encrypted-file",
    deleteRefreshToken: async () => {
      try {
        unlinkSync(filePath);
      } catch {
        // File may not exist; that is fine.
      }
    },
    loadRefreshToken: async () => {
      if (!existsSync(filePath)) return null;
      const encrypted = readFileSync(filePath);
      const key = deriveMachineKey();
      return decryptToken(encrypted, key);
    },
    saveRefreshToken: async (token: string) => {
      const directory = join(filePath, "..");
      mkdirSync(directory, { recursive: true });
      const key = deriveMachineKey();
      const encrypted = encryptToken(token, key);
      writeFileSync(filePath, encrypted, { mode: 0o600 });
    },
  };
}

const ENCRYPTION_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveMachineKey(): Buffer {
  const material = [
    hostname(),
    userInfo().username,
    platform(),
    homedir(),
  ].join("|");
  return createHash("sha256").update(material).digest();
}

function encryptToken(token: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from([ENCRYPTION_VERSION]),
    iv,
    tag,
    ciphertext,
  ]);
}

function decryptToken(encrypted: Buffer, key: Buffer): string | null {
  if (encrypted.length < 1 + IV_LENGTH + TAG_LENGTH) return null;
  const version = encrypted[0];
  if (version !== ENCRYPTION_VERSION) return null;
  const iv = encrypted.subarray(1, 1 + IV_LENGTH);
  const tag = encrypted.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = encrypted.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function createMemoryTokenStorage(): TokenStorage {
  let stored: string | null = null;
  return {
    backend: "memory",
    deleteRefreshToken: async () => {
      stored = null;
    },
    loadRefreshToken: async () => {
      return stored;
    },
    saveRefreshToken: async (token: string) => {
      stored = token;
    },
  };
}

export type CliSession = Readonly<{
  deleteRefreshToken: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  loadRefreshToken: () => Promise<string | null>;
  saveRefreshToken: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}>;

export function createCliSession(
  clientId: string,
  storage: TokenStorage,
): CliSession {
  let accessToken: string | null = null;
  let accessTokenExpiresAt = 0;

  return {
    deleteRefreshToken: async () => {
      accessToken = null;
      accessTokenExpiresAt = 0;
      await storage.deleteRefreshToken();
    },
    getAccessToken: async () => {
      if (accessToken !== null && Date.now() < accessTokenExpiresAt) {
        return accessToken;
      }
      const refreshToken = await storage.loadRefreshToken();
      if (refreshToken === null) return null;
      const refreshed = await refreshAccessToken(clientId, refreshToken);
      if (refreshed === null) return null;
      accessToken = refreshed.accessToken;
      accessTokenExpiresAt = refreshed.expiresAtMs;
      if (refreshed.refreshToken !== null) {
        await storage.saveRefreshToken(refreshed.refreshToken);
      }
      return accessToken;
    },
    loadRefreshToken: async () => {
      return await storage.loadRefreshToken();
    },
    saveRefreshToken: async (token: string) => {
      await storage.saveRefreshToken(token);
    },
    signOut: async () => {
      accessToken = null;
      accessTokenExpiresAt = 0;
      await storage.deleteRefreshToken();
    },
  };
}

async function refreshAccessToken(
  clientId: string,
  refreshToken: string,
): Promise<Readonly<{
  accessToken: string;
  expiresAtMs: number;
  refreshToken: string | null;
}> | null> {
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);
  body.set("scope", "openid profile email offline_access");

  const response = await fetch(TOKEN_ENDPOINT, {
    body: body.toString(),
    headers: {
      "accept": "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) return null;
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null) return null;
  const accessToken = Reflect.get(data, "access_token");
  const expiresIn = Reflect.get(data, "expires_in");
  const newRefreshToken = Reflect.get(data, "refresh_token");
  if (
    typeof accessToken !== "string"
    || typeof expiresIn !== "number"
    || expiresIn <= 0
  ) {
    return null;
  }
  return {
    accessToken,
    expiresAtMs: Date.now() + expiresIn * 1_000,
    refreshToken: typeof newRefreshToken === "string" ? newRefreshToken : null,
  };
}


/**
 * Run the OAuth 2.0 Device Authorization Grant for Wrench.
 */
export async function runAccountsDeviceLogin(
  environment: Readonly<Record<string, string | undefined>>,
  handlers: AccountsAuthHandlers = {},
  storage?: TokenStorage,
  signal?: AbortSignal,
): Promise<AccountsAuthResult> {
  if (signal?.aborted) {
    return { kind: "error", message: "Login was cancelled." };
  }

  const tokenStorage = createWrenchTokenStorage(environment, storage);

  const { poll, response } = await initiateSuiteOidcDeviceAuthorization(
    {
      deviceAuthorizationEndpoint: DEVICE_AUTHORIZATION_ENDPOINT,
      deviceTokenEndpoint: DEVICE_TOKEN_ENDPOINT,
    },
    {
      clientId: WRENCH_CLIENT_ID,
      scopes: ["openid", "profile", "email", "offline_access"],
    },
  );

  if (handlers.onUserCode !== undefined) {
    handlers.onUserCode(
      response.userCode,
      response.verificationUriComplete ?? response.verificationUri,
    );
  }

  const abortPromise = new Promise<never>((_resolve, reject) => {
    if (signal === undefined) return;
    if (signal.aborted) {
      reject(new Error("Login was cancelled."));
      return;
    }
    signal.addEventListener("abort", () => {
      reject(new Error("Login was cancelled."));
    }, { once: true });
  });

  try {
    while (true) {
      const outcome = await Promise.race([poll(), abortPromise]);
      const terminal = await terminalPollOutcome(outcome, tokenStorage);
      if (terminal !== null) return terminal;
      const waitMs = outcome.kind === "slow_down"
        ? outcome.intervalMs
        : outcome.kind === "authorization_pending"
          ? outcome.intervalMs
          : 5_000;
      if (outcome.kind === "slow_down" && handlers.onSlowDown !== undefined) {
        handlers.onSlowDown(outcome.intervalMs);
      } else if (handlers.onPending !== undefined) {
        handlers.onPending();
      }
      await Promise.race([sleep(waitMs), abortPromise]);
    }
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function terminalPollOutcome(
  outcome: SuiteOidcDevicePollOutcome,
  storage: TokenStorage,
): Promise<AccountsAuthResult | null> {
  switch (outcome.kind) {
    case "token": {
      if (outcome.refreshToken === null) {
        return {
          kind: "error",
          message: "The token response did not include a refresh token.",
        };
      }
      await storage.saveRefreshToken(outcome.refreshToken);
      return {
        kind: "success",
        message: "Signed in to Hraness Accounts. You can return to your terminal.",
      };
    }
    case "authorization_pending":
    case "slow_down":
      return null;
    case "access_denied":
      return { kind: "denied" };
    case "expired_token":
      return { kind: "expired" };
    case "error":
      return {
        kind: "error",
        message: outcome.errorDescription ?? outcome.error,
      };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load the current Wrench Accounts session.
 */
export function loadAccountsSession(
  environment: Readonly<Record<string, string | undefined>>,
  storage?: TokenStorage,
): CliSession {
  const tokenStorage = createWrenchTokenStorage(environment, storage);
  return createCliSession(WRENCH_CLIENT_ID, tokenStorage);
}

/**
 * Sign out of the Wrench Accounts session.
 */
export async function runAccountsSignOut(
  environment: Readonly<Record<string, string | undefined>>,
  storage?: TokenStorage,
): Promise<void> {
  const session = loadAccountsSession(environment, storage);
  await session.signOut();
}

/** Exported for tests. */
export const accountsAuthInternals = {
  DEVICE_AUTHORIZATION_ENDPOINT,
  DEVICE_TOKEN_ENDPOINT,
  TOKEN_ENDPOINT,
  WRENCH_CLIENT_ID,
  createMemoryTokenStorage,
};
