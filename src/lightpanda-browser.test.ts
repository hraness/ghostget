import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { parseCaptureArguments, type CaptureArguments } from "@hraness/wordcell/capture";

import {
  LIGHTPANDA_VERSION,
  acquireLightpandaBrowser,
  assertLightpandaCdpIdentity,
  createLightpandaDependencies,
  lightpandaEligibility,
  lightpandaGlobalArguments,
  lightpandaServeArguments,
  resolveLightpandaExecutable,
  selectBrowserEngine,
} from "./lightpanda-browser";

function captureArguments(...extra: readonly string[]): CaptureArguments {
  const parsed = parseCaptureArguments([
    "capture",
    "https://example.com/article",
    "--mode",
    "browser",
    "--media",
    "none",
    "--scope",
    "page",
    ...extra,
  ]);
  if (!parsed.ok || parsed.value.command !== "capture") {
    throw new Error(parsed.ok ? "fixture did not parse as capture" : parsed.message);
  }
  return parsed.value;
}

describe("Ghostget Lightpanda semantic lane", () => {
  test("selects only an explicitly provisioned executable", () => {
    const directory = mkdtempSync(join(tmpdir(), "ghostget-lightpanda-test-"));
    const executable = join(directory, "lightpanda");
    try {
      writeFileSync(executable, "#!/bin/sh\nprintf '1.0.0\\n'\n");
      chmodSync(executable, 0o700);
      const selected = selectBrowserEngine(captureArguments(), "lightpanda", {
        GHOSTGET_LIGHTPANDA_PATH: executable,
      });
      expect(selected).toEqual({ engine: "lightpanda", executable: realpathSync(executable) });
      expect(LIGHTPANDA_VERSION).toBe("1.0.0");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("falls back to Chrome when no Lightpanda binary is provisioned", () => {
    expect(selectBrowserEngine(captureArguments(), "auto", {})).toEqual({ engine: "chrome" });
  });

  test("rejects visual, authenticated, and attached-browser claims", () => {
    expect(lightpandaEligibility(captureArguments("--evidence", "screenshot"))).toContain("visual");
    expect(lightpandaEligibility(captureArguments("--cookie-source", "chrome"))).toContain("cookie");
    const current = parseCaptureArguments(["capture", "current", "--browser-live", "--media", "none"]);
    if (!current.ok || current.value.command !== "capture") throw new Error("current fixture did not parse");
    expect(lightpandaEligibility(current.value)).toContain("current-tab");
  });

  test("keeps automatic and default capture on Chromium even with a provisioned path", () => {
    const environment = { GHOSTGET_LIGHTPANDA_PATH: "/no/such/lightpanda" };
    expect(selectBrowserEngine(captureArguments(), "auto", environment)).toEqual({ engine: "chrome" });
    expect(selectBrowserEngine(captureArguments(), undefined, environment)).toEqual({ engine: "chrome" });
    expect(selectBrowserEngine(captureArguments(), "chrome", environment)).toEqual({ engine: "chrome" });
    expect(() => selectBrowserEngine(captureArguments(), "lightpanda", {})).toThrow("requires");
  });

  test("launches the 1.0 server with the owned proxy rather than legacy driver flags", () => {
    expect(lightpandaServeArguments(9222, "http://127.0.0.1:1234")).toEqual([
      "serve", "--host", "127.0.0.1", "--port", "9222",
      "--http-proxy", "http://127.0.0.1:1234", "--disable-metrics",
      "--block-urls", "ws://*", "--block-urls", "wss://*",
      "--block-urls", "file:*", "--block-urls", "ftp:*", "--block-urls", "gopher:*",
      "--load-resources", "stylesheet",
    ]);
    for (const proxy of ["https://127.0.0.1:1234", "http://example.com:1234", "http://user:pass@127.0.0.1:1234", "http://127.0.0.1:1234/path"]) {
      expect(() => lightpandaServeArguments(9222, proxy)).toThrow("task-owned");
    }
  });

  test("connects the driver to the owned CDP endpoint without Chromium launch flags", () => {
    expect(lightpandaGlobalArguments([
      "--config", "/private/config.json", "--session", "owned",
      "--proxy", "http://127.0.0.1:1234", "--args", "--mute-audio",
      "--engine", "chrome", "--executable-path", "/private/chromium",
    ], "http://127.0.0.1:9222")).toEqual([
      "--config", "/private/config.json", "--session", "owned",
      "--proxy", "http://127.0.0.1:1234", "--engine", "lightpanda", "--cdp", "http://127.0.0.1:9222",
    ]);
  });

  test("rejects unqualified versions before any browser launch", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ghostget-lightpanda-version-test-"));
    const executable = join(directory, "lightpanda");
    try {
      writeFileSync(executable, "#!/bin/sh\nprintf '0.9.0\\n'\n", { mode: 0o700 });
      await expect(acquireLightpandaBrowser(captureArguments(), directory, {
        GHOSTGET_LIGHTPANDA_PATH: executable,
      })).rejects.toThrow("must report version 1.0.0");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("rejects expanded capture rather than silently claiming scrolling support", () => {
    expect(lightpandaEligibility(captureArguments("--scope", "thread"))).toContain("expanded");
    expect(lightpandaEligibility({ ...captureArguments(), scope: "auto" })).toContain("expanded");
    expect(lightpandaEligibility({ ...captureArguments(), mode: "http" })).toContain("--mode browser");
    expect(lightpandaEligibility({ ...captureArguments(), mode: "auto" })).toContain("--mode browser");
    expect(lightpandaEligibility({ ...captureArguments("--scope", "page"), url: new URL("https://github.com/hraness/ghostget") })).toBeNull();
  });

  test("rejects foreign engine values and invalid server ports", () => {
    expect(() => selectBrowserEngine(captureArguments(), "safari" as "chrome", {})).toThrow("browser engine");
    for (const port of [0, -1, 65536, Number.NaN, 1.5]) {
      expect(() => lightpandaServeArguments(port, "http://127.0.0.1:1234")).toThrow("port");
    }
  });

  test("binds readiness to the exact Lightpanda identity and loopback endpoint", () => {
    const identity = { Browser: "Lightpanda/1.0", "Lightpanda-Version": "1.0.0", webSocketDebuggerUrl: "ws://127.0.0.1:9222/" };
    expect(() => assertLightpandaCdpIdentity(identity, 9222)).not.toThrow();
    for (const candidate of [null, [], {}, { ...identity, Browser: "Chrome/145" },
      { ...identity, "Lightpanda-Version": "0.9.0" }, { ...identity, webSocketDebuggerUrl: "ws://example.com:9222/" }]) {
      expect(() => assertLightpandaCdpIdentity(candidate, 9222)).toThrow();
    }
  });

  test("cleanup does not start a new server and missing proxies fail before launch", async () => {
    let calls = 0;
    const dependencies = createLightpandaDependencies("/missing/lightpanda", performance.now() + 1000, async () => {
      calls += 1;
      return { exitCode: 0, stdout: "", stderr: "" };
    });
    const options = { cwd: tmpdir(), environment: {}, timeoutMs: 1000, maxOutputBytes: 1024 };
    expect(await dependencies.run!([], ["close"], options)).toEqual({ closed: true });
    await expect(dependencies.run!([], ["open", "about:blank"], options)).rejects.toThrow("proxy is missing");
    await dependencies.close();
    expect(calls).toBe(0);
  });

  test.each(["success", "driver-failure", "timeout", "identity-mismatch", "early-exit"] as const)("collects its owned server after %s", async (scenario) => {
    const directory = mkdtempSync(join(tmpdir(), "ghostget-lightpanda-lifecycle-"));
    const executable = join(directory, "lightpanda");
    const pidPath = join(directory, "server.pid");
    const exitPath = join(directory, "server.closed");
    writeFileSync(executable, `#!${process.execPath}\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(pidPath)}, String(process.pid));\nif (${JSON.stringify(scenario)} === "early-exit") process.exit(42);\nif (process.env.LIGHTPANDA_DISABLE_TELEMETRY !== "1") process.exit(43);\nconst port = Number(process.argv[process.argv.indexOf("--port") + 1]);\nconst server = Bun.serve({hostname:"127.0.0.1",port,fetch(){\nif (${JSON.stringify(scenario)} === "timeout") return new Promise(() => {});\nreturn Response.json({Browser:${JSON.stringify(scenario === "identity-mismatch" ? "Chrome/145" : "Lightpanda/1.0")},"Lightpanda-Version":"1.0.0",webSocketDebuggerUrl:\`ws://127.0.0.1:\${port}/\`});\n}});\nprocess.on("SIGTERM", () => { writeFileSync(${JSON.stringify(exitPath)}, "closed"); server.stop(true); process.exit(0); });\n`, { mode: 0o700 });
    let calls = 0;
    const dependencies = createLightpandaDependencies(executable, performance.now() + 1500, async () => {
      calls += 1;
      return { exitCode: scenario === "driver-failure" ? 1 : 0, stdout: '{"success":true,"data":{"url":"about:blank"}}', stderr: "" };
    });
    try {
      const operation = dependencies.run!(["--proxy", "http://127.0.0.1:1234"], ["open", "about:blank"], {
        cwd: directory, environment: { HTTP_PROXY: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1" }, timeoutMs: 1500, maxOutputBytes: 1024,
      });
      if (scenario === "success") expect(await operation).toEqual({ url: "about:blank" });
      else await expect(operation).rejects.toThrow();
      await dependencies.close();
      expect(existsSync(pidPath)).toBe(true);
      const pid = Number(readFileSync(pidPath, "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
      expect(calls).toBe(scenario === "success" || scenario === "driver-failure" ? 1 : 0);
      if (scenario !== "early-exit") expect(readFileSync(exitPath, "utf8")).toBe("closed");
    } finally {
      await dependencies.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("rejects Chromium executable overrides and symlinks before invoking them", () => {
    const directory = mkdtempSync(join(tmpdir(), "ghostget-lightpanda-browser-identity-"));
    const executable = join(directory, "Google Chrome");
    const alias = join(directory, "lightpanda");
    try {
      writeFileSync(executable, "#!/bin/sh\nprintf '1.0.0\\n'\n", { mode: 0o700 });
      symlinkSync(executable, alias);
      expect(() => resolveLightpandaExecutable({ GHOSTGET_LIGHTPANDA_PATH: executable })).toThrow("Chromium executables");
      expect(() => resolveLightpandaExecutable({ GHOSTGET_LIGHTPANDA_PATH: alias })).toThrow("Chromium executables");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("requires the explicit path to be absolute, executable, and available", () => {
    expect(() => resolveLightpandaExecutable({ GHOSTGET_LIGHTPANDA_PATH: "lightpanda" })).toThrow("absolute");
    expect(() => resolveLightpandaExecutable({ GHOSTGET_LIGHTPANDA_PATH: "/no/such/lightpanda" })).toThrow("unavailable");
  });
});
