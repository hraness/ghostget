import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { parseCaptureArguments, type CaptureArguments } from "@hraness/wordcell/capture";

import {
  LIGHTPANDA_VERSION,
  LightpandaCompatibilityError,
  acquireLightpandaWithFallback,
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

  test("prefers provisioned Lightpanda only for eligible automatic capture", () => {
    const directory = mkdtempSync(join(tmpdir(), "ghostget-lightpanda-auto-"));
    const executable = join(directory, "lightpanda");
    try {
      writeFileSync(executable, "#!/bin/sh\nprintf '1.0.0\\n'\n", { mode: 0o700 });
      const environment = { GHOSTGET_LIGHTPANDA_PATH: executable };
      for (const selection of ["auto", undefined] as const) {
        expect(selectBrowserEngine(captureArguments(), selection, environment)).toEqual({ engine: "lightpanda", executable: realpathSync(executable) });
        expect(selectBrowserEngine({ ...captureArguments(), mode: "auto" }, selection, environment).engine).toBe("lightpanda");
        for (const options of [captureArguments("--evidence", "screenshot"), captureArguments("--cookie-source", "chrome"), { ...captureArguments(), scope: "thread" as const }]) {
          expect(selectBrowserEngine(options, selection, environment)).toEqual({ engine: "chrome" });
        }
      }
      expect(selectBrowserEngine(captureArguments(), "chrome", environment)).toEqual({ engine: "chrome" });
      expect(() => selectBrowserEngine(captureArguments(), "lightpanda", {})).toThrow("requires");
      expect(() => selectBrowserEngine(captureArguments(), "auto", { LIGHTPANDA_PATH: "/missing/lightpanda" })).toThrow("unavailable");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("falls back once after a collected compatibility failure within the original deadline", async () => {
    const events: string[] = [];
    const acquired = await acquireLightpandaWithFallback(captureArguments(), tmpdir(), {}, true,
      async (options, _directory, discovered) => {
        events.push("chrome");
        expect(discovered).toBe(false);
        expect(options.timeoutMs).toBeGreaterThan(0);
        expect(options.timeoutMs).toBeLessThanOrEqual(captureArguments().timeoutMs);
        return { body: "article", contentType: "text/html", finalUrl: new URL("https://example.com/article"), method: "browser-fresh", warnings: [] };
      },
      async () => {
        events.push("lightpanda", "collected");
        throw new LightpandaCompatibilityError(true);
      });
    expect(events).toEqual(["lightpanda", "collected", "chrome"]);
    expect(acquired.warnings.join(" ")).toContain("Browser engine: Chromium");
    expect(acquired.warnings.join(" ")).toContain("before navigation");
  });

  test("collects a distinct Lightpanda config directory before Chromium fallback", async () => {
    const parent = mkdtempSync(join(tmpdir(), "ghostget-engine-fallback-"));
    const executable = join(parent, "lightpanda");
    writeFileSync(executable, "#!/bin/sh\nprintf '1.0.0\\n'\n", { mode: 0o700 });
    let lightpandaDirectory = "";
    try {
      const result = await acquireLightpandaWithFallback(captureArguments(), parent, { GHOSTGET_LIGHTPANDA_PATH: executable }, true,
        async (_options, directory) => {
          expect(directory).toBe(parent);
          expect(existsSync(lightpandaDirectory)).toBe(false);
          writeFileSync(join(directory, "agent-browser.config.json"), "{}", { flag: "wx" });
          return { body: "article", contentType: "text/html", finalUrl: new URL("https://example.com/article"), method: "browser-fresh", warnings: [] };
        },
        (options, directory, environment) => acquireLightpandaBrowser(options, directory, environment, async (_options, attempt) => {
          expect(attempt).not.toBe(parent);
          lightpandaDirectory = attempt;
          writeFileSync(join(attempt, "agent-browser.config.json"), "{}", { flag: "wx" });
          throw new LightpandaCompatibilityError(true);
        }));
      expect(result.body).toBe("article");
    } finally { rmSync(parent, { recursive: true, force: true }); }
  });

  test("does not retry explicit selection, assertions, denials, identity drift, or cleanup failures", async () => {
    for (const [automatic, error] of [
      [false, new LightpandaCompatibilityError(true)],
      [true, new LightpandaCompatibilityError()],
      [true, new Error("assertion failed")],
      [true, new Error("private network denied")],
      [true, new Error("CDP identity mismatch")],
      [true, new AggregateError([new LightpandaCompatibilityError()], "cleanup failed")],
    ] as const) {
      let chromeCalls = 0;
      await expect(acquireLightpandaWithFallback(captureArguments(), tmpdir(), {}, automatic,
        async () => { chromeCalls += 1; throw new Error("unexpected fallback"); },
        async () => { throw error; })).rejects.toBe(error);
      expect(chromeCalls).toBe(0);
    }
  });

  test("launches the 1.0 server with the owned proxy rather than legacy driver flags", () => {
    expect(lightpandaServeArguments(9222, "http://127.0.0.1:1234")).toEqual([
      "serve", "--host", "127.0.0.1", "--port", "9222",
      "--http-proxy", "http://127.0.0.1:1234", "--disable-metrics",
      "--block-urls", "ws://*", "--block-urls", "wss://*",
      "--block-urls", "file:*", "--block-urls", "ftp:*", "--block-urls", "gopher:*",
      "--block-urls", "data:*", "--block-urls", "javascript:*", "--block-urls", "blob:*",
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

  test.each(["success", "driver-failure", "preflight-unsupported", "unsupported-after-navigation", "timeout", "identity-mismatch", "early-exit"] as const)("collects its owned server after %s", async (scenario) => {
    const directory = mkdtempSync(join(tmpdir(), "ghostget-lightpanda-lifecycle-"));
    const executable = join(directory, "lightpanda");
    const pidPath = join(directory, "server.pid");
    const exitPath = join(directory, "server.closed");
    writeFileSync(executable, `#!${process.execPath}\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(pidPath)}, String(process.pid));\nif (${JSON.stringify(scenario)} === "early-exit") process.exit(42);\nif (process.env.LIGHTPANDA_DISABLE_TELEMETRY !== "1") process.exit(43);\nif (process.env.HTTP_PROXY || process.env.ALL_PROXY || process.env.LIGHTPANDA_FIXTURE_UNSAFE) process.exit(44);\nconst port = Number(process.argv[process.argv.indexOf("--port") + 1]);\nconst server = Bun.serve({hostname:"127.0.0.1",port,fetch(){\nif (${JSON.stringify(scenario)} === "timeout") return new Promise(() => {});\nreturn Response.json({Browser:${JSON.stringify(scenario === "identity-mismatch" ? "Chrome/145" : "Lightpanda/1.0")},"Lightpanda-Version":"1.0.0",webSocketDebuggerUrl:\`ws://127.0.0.1:\${port}/\`});\n}});\nprocess.on("SIGTERM", () => { writeFileSync(${JSON.stringify(exitPath)}, "closed"); server.stop(true); process.exit(0); });\n`, { mode: 0o700 });
    let calls = 0;
    const timeoutMs = scenario === "timeout" ? 1500 : 5000;
    const dependencies = createLightpandaDependencies(executable, performance.now() + timeoutMs, async (_arguments, _options, input) => {
      calls += 1;
      return { exitCode: scenario === "driver-failure" ? 1 : 0,
        stdout: input !== undefined
          ? '[{"success":false,"error":"Protocol error (Runtime.enable): Method not found"}]'
          : scenario === "preflight-unsupported" || scenario === "unsupported-after-navigation"
          ? '{"success":false,"error":"Protocol error (Runtime.enable): Method not found"}'
          : '{"success":true,"data":{"url":"about:blank"}}', stderr: "" };
    });
    try {
      const commandOptions = { cwd: directory, environment: { HTTP_PROXY: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1", LIGHTPANDA_FIXTURE_UNSAFE: "fixture" }, timeoutMs, maxOutputBytes: 1024 };
      const operation = dependencies.run!(["--proxy", "http://127.0.0.1:1234"], ["open", scenario === "unsupported-after-navigation" ? "https://example.com/article" : "about:blank"], commandOptions);
      if (scenario === "success") expect(await operation).toEqual({ url: "about:blank" });
      else await expect(operation).rejects.toThrow();
      if (scenario === "preflight-unsupported") {
        await expect(dependencies.runBatch!(["--proxy", "http://127.0.0.1:1234"], [["open", "https://example.com/article"]], commandOptions)).rejects.toMatchObject({ beforeNavigation: true });
      }
      if (scenario === "unsupported-after-navigation") {
        await expect(dependencies.runBatch!(["--proxy", "http://127.0.0.1:1234"], [["open", "https://example.com/article"]], commandOptions)).rejects.toMatchObject({ beforeNavigation: false });
      }
      await dependencies.close();
      expect(existsSync(pidPath)).toBe(true);
      const pid = Number(readFileSync(pidPath, "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
      expect(calls).toBe(scenario === "unsupported-after-navigation" ? 2 : ["success", "driver-failure", "preflight-unsupported"].includes(scenario) ? 1 : 0);
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
