import { describe, expect, mock, test } from "bun:test";

import {
  accountsAuthInternals,
  createCliSession,
  createMemoryTokenStorage,
  runAccountsDeviceLogin,
  runAccountsSignOut,
} from "./accounts-auth";

const MOCK_ENV = Object.freeze({});

const originalFetch = globalThis.fetch;

async function mockTokenResponse(payload: object): Promise<Response> {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

describe("accounts-auth", () => {
  test("memory token storage round-trips", async () => {
    const storage = createMemoryTokenStorage();
    expect(await storage.loadRefreshToken()).toBeNull();
    await storage.saveRefreshToken("refresh-1");
    expect(await storage.loadRefreshToken()).toBe("refresh-1");
    await storage.deleteRefreshToken();
    expect(await storage.loadRefreshToken()).toBeNull();
  });

  test("cli session refreshes access token", async () => {
    const storage = createMemoryTokenStorage();
    await storage.saveRefreshToken("refresh-1");

    const session = createCliSession(
      accountsAuthInternals.WRENCH_CLIENT_ID,
      storage,
    );

    const fetchMock = mock(() =>
      mockTokenResponse({
        access_token: "access-1",
        expires_in: 3600,
        refresh_token: "refresh-2",
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const token = await session.getAccessToken();
    expect(token).toBe("access-1");
    expect(await storage.loadRefreshToken()).toBe("refresh-2");

    const cached = await session.getAccessToken();
    expect(cached).toBe("access-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    globalThis.fetch = originalFetch;
  });

  test("cli session returns null when refresh fails", async () => {
    const storage = createMemoryTokenStorage();
    await storage.saveRefreshToken("refresh-1");

    const session = createCliSession(
      accountsAuthInternals.WRENCH_CLIENT_ID,
      storage,
    );

    globalThis.fetch = (() =>
      new Response("bad request", { status: 400 })) as unknown as typeof fetch;

    const token = await session.getAccessToken();
    expect(token).toBeNull();

    globalThis.fetch = originalFetch;
  });

  test("runAccountsSignOut deletes tokens", async () => {
    const storage = createMemoryTokenStorage();
    await storage.saveRefreshToken("refresh-1");
    await runAccountsSignOut(MOCK_ENV, storage);
    expect(await storage.loadRefreshToken()).toBeNull();
  });

  test("runAccountsDeviceLogin errors immediately on aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runAccountsDeviceLogin(
      MOCK_ENV,
      {},
      createMemoryTokenStorage(),
      controller.signal,
    );
    expect(result).toEqual({
      kind: "error",
      message: "Login was cancelled.",
    });
  });
});
