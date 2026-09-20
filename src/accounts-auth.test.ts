import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";

import { accountsAuthInternals, accountsKeychainSlot, runAccountsDeviceLogin } from "./accounts-auth";

const roots: string[] = [];

function stateHome(): string {
  const root = mkdtempSync("/tmp/ghostget-accounts-");
  chmodSync(root, 0o700);
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("accounts Keychain slot", () => {
  test("the default state home keeps the original slot so an existing sign-in survives", () => {
    expect(accountsKeychainSlot({}, "/Users/example/.local/share/ghostget")).toBe("hraness-accounts");
  });

  test("a deliberately separate state directory gets its own slot", () => {
    const first = accountsKeychainSlot({ GHOSTGET_STATE_HOME: "/tmp/a" }, "/tmp/a");
    const second = accountsKeychainSlot({ GHOSTGET_STATE_HOME: "/tmp/b" }, "/tmp/b");
    expect(first).not.toBe("hraness-accounts");
    expect(first).not.toBe(second);
    expect(first).toMatch(/^hraness-accounts-[0-9a-f]{16}$/u);
  });

  test("the slot depends only on the resolved state home", () => {
    expect(accountsKeychainSlot({ GHOSTGET_STATE_HOME: "/tmp/a" }, "/tmp/a"))
      .toBe(accountsKeychainSlot({ WRENCH_STATE_HOME: "/tmp/a" }, "/tmp/a"));
  });
});

describe("device login persistence", () => {
  /** A storage whose save resolves only after the caller has awaited it. */
  function deferredStorage() {
    let saved: string | null = null;
    let settled = false;
    return {
      get saved() { return saved; },
      get settled() { return settled; },
      storage: {
        backend: "memory" as const,
        deleteRefreshToken: async () => { saved = null; },
        loadRefreshToken: async () => saved,
        saveRefreshToken: async (token: string) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          saved = token;
          settled = true;
        },
      },
    };
  }

  test("a cancelled login never reports success", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runAccountsDeviceLogin(
      { GHOSTGET_STATE_HOME: stateHome() },
      {},
      deferredStorage().storage,
      controller.signal,
    );
    expect(result.kind).toBe("error");
  });

  test("success is reported only after the credential is durably stored", async () => {
    const deferred = deferredStorage();
    const session = { saveRefreshToken: deferred.storage.saveRefreshToken } as unknown as Parameters<typeof accountsAuthInternals.handlePollResult>[1];
    const result = await accountsAuthInternals.handlePollResult(
      { kind: "token", refreshToken: "refresh-value" } as Parameters<typeof accountsAuthInternals.handlePollResult>[0],
      session,
    );
    expect(result.kind).toBe("success");
    // The write had already settled when success was returned.
    expect(deferred.settled).toBe(true);
    expect(deferred.saved).toBe("refresh-value");
  });

  test("a failed credential write is reported instead of a false success", async () => {
    const session = {
      saveRefreshToken: async () => { throw new Error("keychain refused the write"); },
    } as unknown as Parameters<typeof accountsAuthInternals.handlePollResult>[1];
    const result = await accountsAuthInternals.handlePollResult(
      { kind: "token", refreshToken: "refresh-value" } as Parameters<typeof accountsAuthInternals.handlePollResult>[0],
      session,
    );
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toContain("could not be saved");
  });

});
