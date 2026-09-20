import { join } from "node:path";

import {
  createCliSession,
  createEncryptedFileTokenStorage,
  createKeychainTokenStorage,
  createMemoryTokenStorage,
  initiateDeviceLogin,
  type CliSession,
  type DeviceLoginResult,
  type TokenStorage,
} from "@hraness/accounts-cli";
import { sha256 } from "./canonical-json";
import { ghostgetStateHome } from "./storage";

const GHOSTGET_CLIENT_ID = "hraness:ghostget:production:v1";
const ACCOUNTS_ORIGIN = "https://account.hraness.com";
const DEVICE_AUTHORIZATION_ENDPOINT =
  `${ACCOUNTS_ORIGIN}/api/auth/oauth2/device_authorization`;
const DEVICE_TOKEN_ENDPOINT =
  `${ACCOUNTS_ORIGIN}/api/auth/oauth2/device/token`;
const TOKEN_ENDPOINT = `${ACCOUNTS_ORIGIN}/api/auth/oauth2/token`;

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

/** Names of the environment variables that select a separate state root. */
const STATE_HOME_VARIABLES = [
  "GHOSTGET_STATE_HOME",
  "WRENCH_STATE_HOME",
  "OH_STATE_HOME",
  "IO_HOME",
] as const;

/**
 * The Keychain slot for one state directory. The default state home keeps the
 * original slot so an existing sign-in survives; a deliberately separate state
 * directory gets its own, because two state directories are two accounts and
 * must not silently share one stored credential.
 */
export function accountsKeychainSlot(
  environment: Readonly<Record<string, string | undefined>>,
  stateHome: string,
): string {
  const selected = STATE_HOME_VARIABLES.some(
    (name) => (environment[name] ?? "").trim() !== "",
  );
  return selected
    ? `hraness-accounts-${sha256(stateHome).slice(0, 16)}`
    : "hraness-accounts";
}

export function createGhostgetTokenStorage(
  environment: Readonly<Record<string, string | undefined>>,
  storage?: TokenStorage,
): TokenStorage {
  if (storage !== undefined) return storage;
  const stateHome = ghostgetStateHome(environment);
  const keychain = createKeychainTokenStorage(
    "ghostget",
    accountsKeychainSlot(environment, stateHome),
  );
  const file = createEncryptedFileTokenStorage(
    join(stateHome, "accounts", "refresh-token.enc"),
  );
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
      let stored = false;
      try {
        await keychain.saveRefreshToken(token);
        stored = true;
      } catch {
        // Keychain may be unavailable in headless/CI; the encrypted file
        // fallback still gives a machine-bound local secret.
      }
      if (!stored) {
        await file.saveRefreshToken(token);
        return;
      }
      // The Keychain holds the credential. The weaker file copy is not kept
      // beside it, and an earlier fallback must not outlive the token it held.
      await file.deleteRefreshToken();
    },
  };
}

export async function runAccountsDeviceLogin(
  environment: Readonly<Record<string, string | undefined>>,
  handlers: AccountsAuthHandlers = {},
  storage?: TokenStorage,
  signal?: AbortSignal,
): Promise<AccountsAuthResult> {
  if (signal?.aborted) {
    return { kind: "error", message: "Login was cancelled." };
  }
  const tokenStorage = createGhostgetTokenStorage(environment, storage);
  const session = createCliSession({
    clientId: GHOSTGET_CLIENT_ID,
    storage: tokenStorage,
    tokenEndpoint: TOKEN_ENDPOINT,
  });

  const deviceHandlers: {
    onUserCode?: (userCode: string, verificationUri: string) => void;
    onPending?: () => void;
    onSlowDown?: (intervalMs: number) => void;
  } = {};
  if (handlers.onUserCode !== undefined) {
    deviceHandlers.onUserCode = handlers.onUserCode;
  }
  if (handlers.onPending !== undefined) {
    deviceHandlers.onPending = handlers.onPending;
  }
  if (handlers.onSlowDown !== undefined) {
    deviceHandlers.onSlowDown = handlers.onSlowDown;
  }

  const device = await initiateDeviceLogin(
    {
      deviceAuthorizationEndpoint: DEVICE_AUTHORIZATION_ENDPOINT,
      deviceTokenEndpoint: DEVICE_TOKEN_ENDPOINT,
    },
    {
      clientId: GHOSTGET_CLIENT_ID,
      scopes: ["openid", "profile", "email", "offline_access"],
    },
    deviceHandlers,
  );

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
    const result = (await Promise.race([device.poll(), abortPromise])) as DeviceLoginResult;
    return await handlePollResult(result, session);
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function handlePollResult(
  result: DeviceLoginResult,
  session: CliSession,
): Promise<AccountsAuthResult> {
  switch (result.kind) {
    case "token":
      // Sign-in is complete only once the refresh token is durably stored.
      // Reporting success before the write settled left the next command
      // signed out with no error to explain it.
      try {
        await session.saveRefreshToken(result.refreshToken);
      } catch (error) {
        return {
          kind: "error",
          message: `Signed in, but the credential could not be saved: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
      return {
        kind: "success",
        message: "Signed in to Hraness Accounts. You can return to your terminal.",
      };
    case "access_denied":
      return { kind: "denied" };
    case "expired_token":
      return { kind: "expired" };
    case "error":
      return {
        kind: "error",
        message: result.errorDescription ?? result.error,
      };
    default: {
      const _exhaustive: never = result;
      return { kind: "error", message: `unknown login result: ${_exhaustive}` };
    }
  }
}

export function loadAccountsSession(
  environment: Readonly<Record<string, string | undefined>>,
  storage?: TokenStorage,
): CliSession {
  const tokenStorage = createGhostgetTokenStorage(environment, storage);
  return createCliSession({
    clientId: GHOSTGET_CLIENT_ID,
    storage: tokenStorage,
    tokenEndpoint: TOKEN_ENDPOINT,
  });
}

export async function runAccountsSignOut(
  environment: Readonly<Record<string, string | undefined>>,
  storage?: TokenStorage,
): Promise<void> {
  await loadAccountsSession(environment, storage).signOut();
}

export const accountsAuthInternals = {
  DEVICE_AUTHORIZATION_ENDPOINT,
  DEVICE_TOKEN_ENDPOINT,
  TOKEN_ENDPOINT,
  GHOSTGET_CLIENT_ID,
  createMemoryTokenStorage,
  handlePollResult,
};
