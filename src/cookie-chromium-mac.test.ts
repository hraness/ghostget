import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createSignedCookieStore,
  ensureKeychainBridge,
  keychainBridgeScript,
} from "./cookie-chromium-mac";

const env = { HRANESS_LOCAL_APP: "1" };

const assembled = {
  appPath: "/Users/me/Applications/Hraness/Ghostget.app",
  helperPath: "/Users/me/Applications/Hraness/Ghostget.app/Contents/Helpers/ghostget-cookie-reader",
};

describe("keychainBridgeScript", () => {
  test("answers only find-generic-password and forwards to the signed helper", () => {
    const script = keychainBridgeScript("/Applications/Ghostget.app/Contents/Helpers/ghostget-cookie-reader");
    expect(script).toContain('"$1" != "find-generic-password"');
    expect(script).toContain("generic_password_read");
    expect(script).toContain("'/Applications/Ghostget.app/Contents/Helpers/ghostget-cookie-reader'");
    expect(script).toContain("exit 128"); // denial keeps the security exit shape
    expect(script).toContain("exit 44");
    expect(script).toContain("exit 36");
  });

  test("whitelists the exact Safe Storage selectors", () => {
    const script = keychainBridgeScript("/h/helper");
    // Unknown accounts and services exit instead of reaching the helper.
    for (const service of [
      '"Chrome Safe Storage"', '"Brave Safe Storage"', '"Arc Safe Storage"',
      '"Chromium Safe Storage"', '"Dia Safe Storage"',
      '"Microsoft Edge Safe Storage"', '"Microsoft Edge"',
    ]) {
      expect(script).toContain(service);
    }
    expect(script).toContain('Chrome|Brave|Arc|Chromium|Dia|"Microsoft Edge") ;;');
  });

  test("rejects helper paths that are not safely embeddable", () => {
    expect(() => keychainBridgeScript("relative/helper")).toThrow();
    expect(() => keychainBridgeScript("/tmp/it's-here")).toThrow();
    expect(() => keychainBridgeScript("/tmp/a\nb")).toThrow();
    expect(() => keychainBridgeScript("")).toThrow();
  });
});

describe("ensureKeychainBridge", () => {
  test("writes an owner-only `security` script in a private dir", () => {
    const directory = mkdtempSync(join(tmpdir(), "gg-bridge-test-"));
    try {
      const resolved = ensureKeychainBridge(assembled.helperPath, () => directory);
      const shimPath = join(resolved, "security");
      const stats = statSync(shimPath);
      expect(stats.mode & 0o777).toBe(0o700);
      const content = readFileSync(shimPath, "utf8");
      expect(content).toBe(keychainBridgeScript(assembled.helperPath));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("createSignedCookieStore", () => {
  test("without the opt-in every call delegates untouched", async () => {
    let calls = 0;
    const store = createSignedCookieStore({}, {
      platform: "darwin",
      getCookies: async () => { calls++; return { cookies: [], warnings: [] }; },
      ensureApp: async () => { throw new Error("must not assemble"); },
    });
    await store({ url: "https://example.com", browsers: ["chrome"] });
    expect(calls).toBe(1);
  });

  test("off macOS the opt-in still delegates", async () => {
    let calls = 0;
    const store = createSignedCookieStore(env, {
      platform: "linux",
      getCookies: async () => { calls++; return { cookies: [], warnings: [] }; },
      ensureApp: async () => { throw new Error("must not assemble"); },
    });
    await store({ url: "https://example.com", browsers: ["chrome"] });
    expect(calls).toBe(1);
  });

  test("selections that cannot touch the keychain skip assembly", async () => {
    let assemblies = 0;
    const store = createSignedCookieStore(env, {
      platform: "darwin",
      getCookies: async () => ({ cookies: [], warnings: [] }),
      ensureApp: async () => { assemblies++; return assembled; },
      bridgeDirectory: () => mkdtempSync(join(tmpdir(), "gg-bridge-test-")),
    });
    await store({ url: "https://example.com", browsers: ["safari"] });
    await store({ url: "https://example.com", browsers: ["firefox"] });
    expect(assemblies).toBe(0);
  });

  test("a Chromium read runs the base store under the bridge PATH", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gg-bridge-test-"));
    let seenPath = "";
    try {
      const store = createSignedCookieStore(env, {
        platform: "darwin",
        ensureApp: async () => assembled,
        bridgeDirectory: () => directory,
        getCookies: async () => {
          seenPath = process.env.PATH ?? "";
          return { cookies: [{ name: "sid" }], warnings: [] };
        },
      });
      const before = process.env.PATH;
      const result = await store({ url: "https://example.com", browsers: ["chrome"] }) as { cookies: unknown[] };
      expect(seenPath.startsWith(`${directory}:`)).toBe(true);
      expect(process.env.PATH).toBe(before);
      expect(result.cookies).toHaveLength(1);
      expect(readFileSync(join(directory, "security"), "utf8")).toContain("ghostget-cookie-reader");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("an explicit Chromium browser selection bridges too", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gg-bridge-test-"));
    let seenPath = "";
    try {
      const store = createSignedCookieStore(env, {
        platform: "darwin",
        ensureApp: async () => assembled,
        bridgeDirectory: () => directory,
        getCookies: async () => {
          seenPath = process.env.PATH ?? "";
          return { cookies: [], warnings: [] };
        },
      });
      await store({ url: "https://example.com", browsers: ["chrome"], chromiumBrowser: "arc" });
      expect(seenPath.startsWith(`${directory}:`)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("assembly failure fails closed with typed keychain warnings", async () => {
    let baseCalls = 0;
    const store = createSignedCookieStore(env, {
      platform: "darwin",
      ensureApp: async () => { throw new Error("no identity"); },
      getCookies: async () => { baseCalls++; return { cookies: [], warnings: [] }; },
    });
    const result = await store({ url: "https://example.com", browsers: ["chrome"] }) as { cookies: unknown[]; warnings: string[] };
    expect(baseCalls).toBe(0);
    expect(result.cookies).toEqual([]);
    expect(result.warnings).toEqual(["Failed to read macOS Keychain (Chrome Safe Storage): the keychain could not be read."]);
  });

  test("assembly failure labels an explicit browser selection", async () => {
    const store = createSignedCookieStore(env, {
      platform: "darwin",
      ensureApp: async () => { throw new Error("no identity"); },
      getCookies: async () => ({ cookies: [], warnings: [] }),
    });
    const result = await store({ url: "https://example.com", browsers: ["chrome"], chromiumBrowser: "brave" }) as { warnings: string[] };
    expect(result.warnings).toEqual(["Failed to read macOS Keychain (Brave Safe Storage): the keychain could not be read."]);
  });
});
