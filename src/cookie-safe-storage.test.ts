import { describe, expect, test } from "bun:test";

import { classifyKeychainFailure } from "./cookie-access";
import {
  assembleLocalApp,
  CHROMIUM_SAFE_STORAGE,
  localAppEnabled,
  localAppHelperPath,
  localAppPath,
  safeStorageWarning,
} from "./cookie-safe-storage";

describe("localAppEnabled", () => {
  test("requires macOS and the explicit opt-in", () => {
    expect(localAppEnabled({ HRANESS_LOCAL_APP: "1" }, "darwin")).toBe(true);
    expect(localAppEnabled({ HRANESS_LOCAL_APP: "1" }, "linux")).toBe(false);
    expect(localAppEnabled({ HRANESS_LOCAL_APP: "1" }, "win32")).toBe(false);
    expect(localAppEnabled({ HRANESS_LOCAL_APP: "0" }, "darwin")).toBe(false);
    expect(localAppEnabled({}, "darwin")).toBe(false);
    expect(localAppEnabled({ HRANESS_LOCAL_APP: "yes" }, "darwin")).toBe(false);
  });
});

describe("local app paths", () => {
  test("the app lives under the user's Hraness folder with the helper inside", () => {
    expect(localAppPath("/Users/me")).toBe("/Users/me/Applications/Hraness/Ghostget.app");
    expect(localAppHelperPath("/Users/me/Applications/Hraness/Ghostget.app")).toBe(
      "/Users/me/Applications/Hraness/Ghostget.app/Contents/Helpers/ghostget-cookie-reader",
    );
  });
});

describe("CHROMIUM_SAFE_STORAGE", () => {
  test("each browser pins its exact account and service selectors", () => {
    expect(CHROMIUM_SAFE_STORAGE.chrome).toEqual({
      account: "Chrome", services: ["Chrome Safe Storage"], label: "Chrome Safe Storage",
    });
    expect(CHROMIUM_SAFE_STORAGE.brave?.account).toBe("Brave");
    expect(CHROMIUM_SAFE_STORAGE.arc?.account).toBe("Arc");
    expect(CHROMIUM_SAFE_STORAGE.chromium?.account).toBe("Chromium");
    expect(CHROMIUM_SAFE_STORAGE.dia?.account).toBe("Dia");
  });

  test("Edge tries its Safe Storage item, then the legacy account-named item", () => {
    expect(CHROMIUM_SAFE_STORAGE.edge?.services).toEqual(["Microsoft Edge Safe Storage", "Microsoft Edge"]);
    expect(CHROMIUM_SAFE_STORAGE.edge?.label).toBe("Microsoft Edge Safe Storage");
  });
});

describe("safeStorageWarning", () => {
  test("keeps the classifier's typed phrases", () => {
    expect(classifyKeychainFailure(safeStorageWarning("Chrome Safe Storage", "denied"))).toBe("denied");
    expect(classifyKeychainFailure(safeStorageWarning("Chrome Safe Storage", "unavailable"))).toBe("unavailable");
    expect(classifyKeychainFailure(safeStorageWarning("Chrome Safe Storage", "missing"))).toBe("missing");
    expect(classifyKeychainFailure(safeStorageWarning("Chrome Safe Storage", "error"))).toBe("unavailable");
  });

  test("names the browser's Safe Storage label", () => {
    expect(safeStorageWarning("Brave Safe Storage", "denied")).toContain("(Brave Safe Storage)");
  });
});

describe("assembleLocalApp", () => {
  const ready = JSON.stringify({ type: "signing-identity", version: 1, state: "ready", sha1: "ab".repeat(20) });

  function fakeRun(responses: Record<string, { code: number; stdout: string }>) {
    const calls: { args: readonly string[]; input?: string | undefined }[] = [];
    return {
      calls,
      run: async (_binary: string, args: readonly string[], input?: string) => {
        calls.push({ args, input });
        const key = args.join(" ");
        const response = responses[key] ?? { code: 1, stdout: "" };
        return { code: response.code, stdout: response.stdout, stderr: "" };
      },
    };
  }

  test("signs the packaged sidecar in as the helper and verifies the digest", async () => {
    const built = JSON.stringify({
      type: "app-result",
      version: 1,
      status: "built",
      path: "/Users/me/Applications/Hraness/Ghostget.app",
      signing: "local",
    });
    const { calls, run } = fakeRun({
      "--signing-identity ensure": { code: 0, stdout: `${ready}\n` },
      "--assemble-app": { code: 0, stdout: `${built}\n` },
    });
    const app = await assembleLocalApp({ HRANESS_LOCAL_APP: "1" }, {
      runnerBinary: "/runner/hraness-companion",
      sidecarPath: "/pkg/local-custody",
      run,
      fileSha256: async () => "aa".repeat(32),
      productVersion: "1.2.3",
    });
    expect(app).toEqual({
      appPath: "/Users/me/Applications/Hraness/Ghostget.app",
      helperPath: "/Users/me/Applications/Hraness/Ghostget.app/Contents/Helpers/ghostget-cookie-reader",
    });
    const request = JSON.parse(calls[1]?.input ?? "{}") as Record<string, unknown>;
    expect(request.type).toBe("app-request");
    expect(request.appId).toBe("ghostget");
    expect(request.name).toBe("Ghostget");
    expect(request.productVersion).toBe("1.2.3");
    expect(request.signing).toBe("local");
    expect(request.helpers).toEqual([{ name: "ghostget-cookie-reader", path: "/pkg/local-custody", sha256: "aa".repeat(32) }]);
  });

  test("an unchanged app still returns the helper path", async () => {
    const unchanged = JSON.stringify({
      type: "app-result",
      version: 1,
      status: "unchanged",
      path: "/Users/me/Applications/Hraness/Ghostget.app",
      signing: "local",
    });
    const { run } = fakeRun({
      "--signing-identity ensure": { code: 0, stdout: `${ready}\n` },
      "--assemble-app": { code: 0, stdout: `${unchanged}\n` },
    });
    const app = await assembleLocalApp({}, {
      runnerBinary: "/runner/hraness-companion",
      sidecarPath: "/pkg/local-custody",
      run,
      fileSha256: async () => "bb".repeat(32),
    });
    expect(app.helperPath).toContain("Contents/Helpers/ghostget-cookie-reader");
  });

  test("a missing signing identity fails closed", async () => {
    const missing = JSON.stringify({ type: "signing-identity", version: 1, state: "unavailable" });
    const { run } = fakeRun({
      "--signing-identity ensure": { code: 0, stdout: `${missing}\n` },
    });
    await expect(assembleLocalApp({}, {
      runnerBinary: "/runner/hraness-companion",
      sidecarPath: "/pkg/local-custody",
      run,
      fileSha256: async () => "cc".repeat(32),
    })).rejects.toMatchObject({ name: "LocalAppError", code: "identity-unavailable" });
  });

  test("a failed assembly surfaces the runner's code", async () => {
    const failed = JSON.stringify({ type: "app-result", version: 1, status: "failed", code: "quarantined-input" });
    const { run } = fakeRun({
      "--signing-identity ensure": { code: 0, stdout: `${ready}\n` },
      "--assemble-app": { code: 0, stdout: `${failed}\n` },
    });
    await expect(assembleLocalApp({}, {
      runnerBinary: "/runner/hraness-companion",
      sidecarPath: "/pkg/local-custody",
      run,
      fileSha256: async () => "dd".repeat(32),
    })).rejects.toMatchObject({ name: "LocalAppError", code: "assemble-failed" });
  });

  test("a helper that does not match the packaged digest is rejected", async () => {
    const built = JSON.stringify({
      type: "app-result",
      version: 1,
      status: "built",
      path: "/Users/me/Applications/Hraness/Ghostget.app",
      signing: "local",
    });
    const { run } = fakeRun({
      "--signing-identity ensure": { code: 0, stdout: `${ready}\n` },
      "--assemble-app": { code: 0, stdout: `${built}\n` },
    });
    let reads = 0;
    await expect(assembleLocalApp({}, {
      runnerBinary: "/runner/hraness-companion",
      sidecarPath: "/pkg/local-custody",
      run,
      fileSha256: async () => (reads++ === 0 ? "ee".repeat(32) : "ff".repeat(32)),
    })).rejects.toMatchObject({ name: "LocalAppError", code: "helper-mismatch" });
  });

  test("a relative maintainer override is refused", async () => {
    await expect(assembleLocalApp({ GHOSTGET_MENUBAR: "relative/runner" }, {
      run: async () => ({ code: 0, stdout: "", stderr: "" }),
    })).rejects.toMatchObject({ name: "LocalAppError", code: "runner-failed" });
  });
});
