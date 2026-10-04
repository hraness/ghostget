import { existsSync, realpathSync, statSync } from "node:fs";
import { basename } from "node:path";
import { createServer } from "node:net";
import { get } from "node:http";

import {
  agentBrowserCommand,
  acquireBrowser as acquireKbBrowser,
  type AcquiredPage,
  type BrowserAcquisitionDependencies,
} from "@hraness/wordcell/clip/acquire";
import { readBoundedByteStream } from "@hraness/wordcell/clip/bounded-byte-buffer";
import type { CaptureArguments } from "@hraness/wordcell/clip/args";

/** The Lightpanda version qualified by the Ghostget semantic browser lane. */
export const LIGHTPANDA_VERSION = "1.0.0" as const;

export type BrowserEngineSelection = "auto" | "chrome" | "lightpanda";
export type BrowserEngine = "chrome" | "lightpanda";

const LIGHTPANDA_PATH_ENVIRONMENT_KEYS = [
  "GHOSTGET_LIGHTPANDA_PATH",
  // Keep the Direct pilot's provisioning variable as a deliberate compatibility
  // path. The binary is still required to be explicitly provisioned.
  "LIGHTPANDA_PATH",
] as const;

type Environment = Readonly<Record<string, string | undefined>>;

type CommandOptions = {
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
};

type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

function configuredLightpandaPath(environment: Environment): string | null {
  for (const key of LIGHTPANDA_PATH_ENVIRONMENT_KEYS) {
    const value = environment[key]?.trim();
    if (value !== undefined && value !== "") return value;
  }
  return null;
}

/**
 * Resolve a task-owned Lightpanda binary without searching PATH or using an
 * ambient browser choice. A path is usable only when it is absolute, regular,
 * executable, and resolves to a stable file.
 */
export function resolveLightpandaExecutable(environment: Environment): string | null {
  const configured = configuredLightpandaPath(environment);
  if (configured === null) return null;
  if (!configured.startsWith("/")) {
    throw new Error("Lightpanda requires an absolute GHOSTGET_LIGHTPANDA_PATH or LIGHTPANDA_PATH");
  }
  let resolved: string;
  try {
    if (!existsSync(configured) || !statSync(configured).isFile()) {
      throw new Error("path is not a regular file");
    }
    resolved = realpathSync(configured);
    if (/^(?:Google Chrome(?: for Testing)?|Chromium|chrome(?:\.exe)?|google-chrome(?:-stable)?|chromium-browser)$/iu.test(basename(resolved))) {
      throw new Error("Chromium executables cannot be used as Lightpanda");
    }
    const details = statSync(resolved);
    if (!details.isFile() || (details.mode & 0o111) === 0) {
      throw new Error("path is not executable");
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`configured Lightpanda binary is unavailable: ${reason}`);
  }
  return resolved;
}

function unsupportedReason(options: CaptureArguments): string | null {
  if (options.currentTab) return "current-tab capture requires the attached Chromium lane";
  if (options.browserLive) return "live browser capture requires the attached Chromium lane";
  if (options.cdp !== undefined) return "CDP capture requires the Chromium lane";
  if (options.browserProfile !== undefined || options.browserProfileOwnership !== undefined) {
    return "profiles and persistent browser state are unsupported by Lightpanda";
  }
  if (options.browserExecutable !== undefined) return "an explicitly selected browser executable requires Chromium";
  if (options.cookieSources.length > 0 || options.cookieProfile !== undefined || options.cookiesFile !== undefined) {
    return "cookie and authenticated capture requires Chromium";
  }
  if (options.url === null) return "Lightpanda requires a fresh public URL";
  if (options.mode !== "browser") return "Lightpanda requires --mode browser";
  if (options.scope !== "page") {
    return "scrolling and expanded capture requires Chromium; use --scope page for Lightpanda";
  }
  if (options.allowPrivateNetwork) return "private-network capture requires Chromium";
  if (options.media !== "none") return "Lightpanda is semantic-only and cannot capture media or images";
  if (options.evidence !== "none" && options.evidence !== "source") {
    return "Lightpanda cannot provide screenshot or visual evidence";
  }
  if (options.htmlFile !== undefined) return "file capture does not use a browser engine";
  return null;
}

export function lightpandaEligibility(options: CaptureArguments): string | null {
  return unsupportedReason(options);
}

export function selectBrowserEngine(
  options: CaptureArguments,
  selection: BrowserEngineSelection = "auto",
  environment: Environment = process.env,
): { readonly engine: BrowserEngine; readonly executable?: string } {
  if (selection !== "auto" && selection !== "chrome" && selection !== "lightpanda") {
    throw new Error("browser engine must be auto, chrome, or lightpanda");
  }
  if (selection !== "lightpanda") return { engine: "chrome" };
  const reason = unsupportedReason(options);
  if (reason !== null) throw new Error(`Lightpanda capture is unavailable: ${reason}`);
  const executable = resolveLightpandaExecutable(environment);
  if (executable === null) {
    throw new Error("Lightpanda capture requires GHOSTGET_LIGHTPANDA_PATH or LIGHTPANDA_PATH pointing to Lightpanda 1.0.0");
  }
  return { engine: "lightpanda", executable };
}

function parseJsonValueOutput(output: string, label: string): unknown {
  const trimmed = output.trim();
  if (trimmed === "") throw new Error(`${label} returned no JSON`);
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const lines = trimmed.split(/\r?\n/u).filter((line) => line.trim() !== "");
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index]!) as unknown;
      } catch {
        // Some versions emit a bounded diagnostic line before JSON output.
      }
    }
  }
  throw new Error(`${label} did not return JSON`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} did not return a JSON object`);
  }
  return value as Record<string, unknown>;
}

async function readOutput(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const bytes = await readBoundedByteStream(stream, maxBytes, "agent-browser process output");
  return new TextDecoder().decode(bytes);
}

async function runCommand(
  command: readonly string[],
  options: CommandOptions,
  stdin?: string,
): Promise<CommandResult> {
  const child = Bun.spawn([...command], {
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
    cwd: options.cwd,
    env: options.environment,
  });
  let timedOut = false;
  let forceKill: ReturnType<typeof setTimeout> | null = null;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    forceKill = setTimeout(() => child.kill("SIGKILL"), 1_000);
  }, options.timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readOutput(child.stdout, options.maxOutputBytes),
      readOutput(child.stderr, Math.min(options.maxOutputBytes, 2 * 1024 * 1024)),
      child.exited,
    ]);
    if (timedOut) throw new Error(`command timed out after ${options.timeoutMs}ms`);
    return { stdout, stderr, exitCode };
  } catch (error) {
    child.kill("SIGKILL");
    await child.exited;
    throw error;
  } finally {
    clearTimeout(timeout);
    if (forceKill !== null) clearTimeout(forceKill);
  }
}

export function lightpandaGlobalArguments(
  globalArguments: readonly string[],
  cdpUrl: string,
): readonly string[] {
  const filtered: string[] = [];
  for (let index = 0; index < globalArguments.length; index += 1) {
    const argument = globalArguments[index];
    if (argument === "--args") {
      // Chromium-only switches are rejected by agent-browser's Lightpanda
      // adapter. Ghostget's explicit --proxy remains in the argument list.
      index += 1;
      continue;
    }
    if (argument === "--engine" || argument === "--executable-path") {
      index += 1;
      continue;
    }
    filtered.push(argument!);
  }
  return [
    ...filtered,
    "--engine", "lightpanda",
    "--cdp", cdpUrl,
  ];
}

export function lightpandaServeArguments(port: number, proxy: string): readonly string[] {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("invalid Lightpanda port");
  const target = new URL(proxy);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.port === ""
    || target.username !== "" || target.password !== "" || target.pathname !== "/"
    || target.search !== "" || target.hash !== "") {
    throw new Error("Lightpanda requires the task-owned loopback HTTP proxy");
  }
  return [
    "serve", "--host", "127.0.0.1", "--port", String(port),
    "--http-proxy", proxy, "--disable-metrics",
    "--block-urls", "ws://*", "--block-urls", "wss://*",
    "--block-urls", "file:*", "--block-urls", "ftp:*", "--block-urls", "gopher:*",
    "--load-resources", "stylesheet",
  ];
}

async function freeLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (address === null || typeof address === "string") throw new Error("could not allocate Lightpanda port");
  return address.port;
}

export function assertLightpandaCdpIdentity(value: unknown, port: number): void {
  const identity = asRecord(value, "Lightpanda CDP identity");
  if (identity.Browser !== "Lightpanda/1.0" || identity["Lightpanda-Version"] !== LIGHTPANDA_VERSION
    || identity.webSocketDebuggerUrl !== `ws://127.0.0.1:${port}/`) {
    throw new Error("Lightpanda CDP identity does not match the owned version and endpoint");
  }
}

function readLightpandaCdpIdentity(port: number, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const fail = (error: unknown): void => {
      clearTimeout(timer);
      reject(error);
      request.destroy();
    };
    const request = get(`http://127.0.0.1:${port}/json/version`, { agent: false }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > 64 * 1024) {
          fail(new Error("Lightpanda CDP identity exceeds its byte limit"));
          return;
        }
        chunks.push(chunk);
      });
      response.once("error", fail);
      response.once("aborted", () => fail(new Error("Lightpanda CDP identity response was aborted")));
      response.once("end", () => {
        clearTimeout(timer);
        try {
          if (response.statusCode !== 200) throw new Error("Lightpanda CDP identity is unavailable");
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
        } catch (error) {
          fail(error);
        }
      });
    });
    timer = setTimeout(() => fail(new Error("Lightpanda CDP identity timed out")), timeoutMs);
    request.once("error", fail);
  });
}

export function createLightpandaDependencies(
  executable: string,
  deadline: number,
  run: typeof runCommand = runCommand,
): BrowserAcquisitionDependencies & { readonly close: () => Promise<void> } {
  let server: Bun.Subprocess<"ignore", "ignore", "ignore"> | undefined;
  let startup: Promise<string> | undefined;
  const close = async (): Promise<void> => {
    if (server === undefined) return;
    const child = server;
    child.kill("SIGTERM");
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 1_000);
    try {
      await child.exited;
    } finally {
      clearTimeout(forceKill);
      server = undefined;
    }
  };
  const endpoint = (globalArguments: readonly string[], options: CommandOptions): Promise<string> => {
    startup ??= (async () => {
      const proxyIndex = globalArguments.indexOf("--proxy");
      const proxy = proxyIndex < 0 ? undefined : globalArguments[proxyIndex + 1];
      if (proxy === undefined) throw new Error("Lightpanda proxy is missing");
      const port = await freeLoopbackPort();
      server = Bun.spawn([executable, ...lightpandaServeArguments(port, proxy)], {
        cwd: options.cwd, env: { ...options.environment, LIGHTPANDA_DISABLE_TELEMETRY: "1" }, stdin: "ignore", stdout: "ignore", stderr: "ignore",
      });
      const cdpUrl = `ws://127.0.0.1:${port}/`;
      const startupDeadline = Math.min(deadline, performance.now() + Math.min(options.timeoutMs, 5_000));
      while (performance.now() < startupDeadline && server.exitCode === null) {
        try {
          const identity = await readLightpandaCdpIdentity(port, Math.max(1, Math.min(500, Math.ceil(startupDeadline - performance.now()))));
          assertLightpandaCdpIdentity(identity, port);
          if (server.exitCode === null) return cdpUrl;
        } catch {}
        await Bun.sleep(25);
      }
      throw new Error("Lightpanda CDP server did not become ready");
    })();
    return startup;
  };
  const remainingOptions = (options: CommandOptions, cleanup = false): CommandOptions => {
    const timeoutMs = cleanup ? options.timeoutMs : Math.min(options.timeoutMs, Math.floor(deadline - performance.now()));
    if (timeoutMs < 1) throw new Error("Lightpanda capture deadline expired");
    return { ...options, timeoutMs };
  };
  const invoke = async (
    globalArguments: readonly string[],
    command: readonly string[],
    options: CommandOptions,
  ): Promise<Record<string, unknown>> => {
    if (command[0] === "close" && startup === undefined) return { closed: true };
    const result = await run(
      [...agentBrowserCommand(), ...lightpandaGlobalArguments(globalArguments, await endpoint(globalArguments, remainingOptions(options, command[0] === "close"))), ...command, "--json"],
      remainingOptions(options, command[0] === "close"),
    );
    if (result.exitCode !== 0) {
      throw new Error(`agent-browser ${command[0] ?? "command"} failed with exit code ${result.exitCode}`);
    }
    const parsed = asRecord(parseJsonValueOutput(result.stdout, `agent-browser ${command[0] ?? "command"}`), "agent-browser result");
    if (parsed.success !== true || typeof parsed.data !== "object" || parsed.data === null || Array.isArray(parsed.data)) {
      throw new Error(`agent-browser ${command[0] ?? "command"} failed`);
    }
    return parsed.data as Record<string, unknown>;
  };
  const batch = async (
    globalArguments: readonly string[],
    commands: readonly (readonly string[])[],
    options: CommandOptions,
  ): Promise<void> => {
    const result = await run(
      [...agentBrowserCommand(), ...lightpandaGlobalArguments(globalArguments, await endpoint(globalArguments, remainingOptions(options))), "batch", "--bail", "--json"],
      remainingOptions(options),
      JSON.stringify(commands),
    );
    if (result.exitCode !== 0) {
      throw new Error(`agent-browser batch failed with exit code ${result.exitCode}`);
    }
    const parsed = parseJsonValueOutput(result.stdout, "agent-browser batch");
    if (!Array.isArray(parsed) || parsed.length !== commands.length || parsed.some((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return true;
      return (entry as Record<string, unknown>).success !== true;
    })) {
      throw new Error("agent-browser batch failed");
    }
  };
  return { run: invoke, runBatch: batch, close };
}

async function verifyLightpandaVersion(
  executable: string,
  temporaryDirectory: string,
  environment: Environment,
  timeoutMs: number,
): Promise<void> {
  const result = await runCommand(
    [executable, "version"],
    {
      cwd: temporaryDirectory,
      environment,
      timeoutMs: Math.min(timeoutMs, 5_000),
      maxOutputBytes: 64 * 1024,
    },
  );
  const version = result.stdout.trim();
  if (result.exitCode !== 0 || version !== LIGHTPANDA_VERSION) {
    throw new Error(
      `Lightpanda executable must report version ${LIGHTPANDA_VERSION}; received ${JSON.stringify(version || result.stderr.trim().slice(-200))}`,
    );
  }
}

/** Acquire a fresh public semantic page through the pinned Lightpanda lane. */
export async function acquireLightpandaBrowser(
  options: CaptureArguments,
  temporaryDirectory: string,
  environment: Environment = process.env,
): Promise<AcquiredPage> {
  const selected = selectBrowserEngine(options, "lightpanda", environment);
  if (selected.engine !== "lightpanda" || selected.executable === undefined) {
    throw new Error("Lightpanda browser selection did not resolve an executable");
  }
  const started = performance.now();
  await verifyLightpandaVersion(selected.executable, temporaryDirectory, environment, options.timeoutMs);
  const timeoutMs = options.timeoutMs - Math.ceil(performance.now() - started);
  if (timeoutMs < 1) throw new Error("Lightpanda capture deadline expired during version verification");
  const dependencies = createLightpandaDependencies(selected.executable, started + options.timeoutMs);
  let acquired: AcquiredPage;
  try {
    acquired = await acquireKbBrowser(
      { ...options, timeoutMs },
      temporaryDirectory,
      false,
      dependencies,
    );
  } finally {
    await dependencies.close();
  }
  return {
    ...acquired,
    warnings: [
      ...acquired.warnings,
      `Browser engine: Lightpanda ${LIGHTPANDA_VERSION} semantic capture (${basename(selected.executable)}); task-owned proxy and browser cleanup completed.`,
    ],
  };
}
