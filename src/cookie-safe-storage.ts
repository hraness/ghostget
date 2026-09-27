/**
 * The signed-helper path for Chromium "Safe Storage" keys (GG-8).
 *
 * With `HRANESS_LOCAL_APP=1` on macOS, Ghostget builds
 * `~/Applications/Hraness/Ghostget.app` once, signs a copy of the packaged
 * `local-custody` sidecar into `Contents/Helpers`, and reads Safe Storage
 * items through it. macOS then names Ghostget — not `/usr/bin/security` — in
 * the keychain prompt and in the item's access list.
 *
 * Without the opt-in nothing here runs: the cookie reader keeps its default
 * store, which goes through Sweet Cookie and the system `security` tool.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// The desktop-foundation installer runs inside a spawned resolver process
// (`cookie-companion-resolve.ts`), and the local-custody sidecar import sits
// inside the opt-in assembly path: the local-app route is opt-in, so the
// analyzed dependency graph for every ordinary command stays unchanged.

/** Environment subset the local-app path reads. */
export type LocalAppEnvironment = Readonly<Record<string, string | undefined>>;

/** The helper's file name inside `Contents/Helpers` and its signing suffix. */
export const COOKIE_READER_HELPER_NAME = "ghostget-cookie-reader";

const APP_NAME = "Ghostget";
const APP_ID = "ghostget";
const RUNNER_TIMEOUT_MS = 30_000;

/** Whether the signed local app and helper path are opted in. */
export function localAppEnabled(
  environment: LocalAppEnvironment,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === "darwin" && environment.HRANESS_LOCAL_APP === "1";
}

/** Directory the local app is assembled into. */
export function localAppDirectory(home: string = homedir()): string {
  return join(home, "Applications", "Hraness");
}

export function localAppPath(home?: string): string {
  return join(localAppDirectory(home), `${APP_NAME}.app`);
}

export function localAppHelperPath(appPath: string, helperName = COOKIE_READER_HELPER_NAME): string {
  return join(appPath, "Contents", "Helpers", helperName);
}

/**
 * Safe Storage selectors per Chromium-family store, matching the items each
 * browser creates. `services` is tried in order, like the system-tool path:
 * Edge also answers a legacy item named after the account.
 */
const CHROME_SAFE_STORAGE = {
  account: "Chrome",
  services: ["Chrome Safe Storage"],
  label: "Chrome Safe Storage",
} as const;

export const CHROMIUM_SAFE_STORAGE: Readonly<Record<string, {
  readonly account: string;
  readonly services: readonly string[];
  readonly label: string;
}>> = Object.freeze({
  chrome: CHROME_SAFE_STORAGE,
  brave: { account: "Brave", services: ["Brave Safe Storage"], label: "Brave Safe Storage" },
  arc: { account: "Arc", services: ["Arc Safe Storage"], label: "Arc Safe Storage" },
  chromium: { account: "Chromium", services: ["Chromium Safe Storage"], label: "Chromium Safe Storage" },
  dia: { account: "Dia", services: ["Dia Safe Storage"], label: "Dia Safe Storage" },
  edge: { account: "Microsoft Edge", services: ["Microsoft Edge Safe Storage", "Microsoft Edge"], label: "Microsoft Edge Safe Storage" },
});

export type SafeStorageSelector = {
  readonly account: string;
  readonly services: readonly string[];
  readonly label: string;
};

/** How a Safe Storage read can fail, in the classifier's own vocabulary. */
export type SafeStorageFailureKind = "denied" | "unavailable" | "missing" | "error";

/**
 * Render a failed helper read in the same phrasing the system-tool path
 * produces, so the existing warning classifier keeps typing the failure.
 */
export function safeStorageWarning(label: string, kind: SafeStorageFailureKind): string {
  const reason =
    kind === "denied" ? "user canceled"
    : kind === "unavailable" ? "interaction is not allowed"
    : kind === "missing" ? "could not be found"
    : "the keychain could not be read";
  return `Failed to read macOS Keychain (${label}): ${reason}.`;
}

// ---------------------------------------------------------------------------
// App assembly
// ---------------------------------------------------------------------------

const APP_RESULT_FRAME_BYTES = 64 * 1024;

export class LocalAppError extends Error {
  override readonly name = "LocalAppError";
  constructor(
    readonly code: "identity-unavailable" | "assemble-failed" | "helper-mismatch" | "runner-failed",
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
  }
}

type RunnerResult = {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

function runRunner(
  binary: string,
  args: readonly string[],
  input?: string,
  timeoutMs = RUNNER_TIMEOUT_MS,
): Promise<RunnerResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
    if (child.stdin === null || child.stdout === null || child.stderr === null) {
      child.kill("SIGKILL");
      rejectPromise(new LocalAppError("runner-failed", "The local app runner could not be started."));
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* gone */ }
      finish(null);
    }, timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new LocalAppError("runner-failed", "The local app runner could not be started.", { cause: error }));
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > APP_RESULT_FRAME_BYTES) {
        try { child.kill("SIGKILL"); } catch { /* gone */ }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("close", (code) => finish(code));
    if (input === undefined) child.stdin.end();
    else child.stdin.end(`${input}\n`);
  });
}

function firstJsonLine(stdout: string): Record<string, unknown> | null {
  const line = stdout.split("\n", 1)[0]?.trim() ?? "";
  if (line === "") return null;
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export type AssembledLocalApp = {
  readonly appPath: string;
  readonly helperPath: string;
};

export type LocalAppDependencies = {
  /** Runner binary override (maintainer path like `GHOSTGET_MENUBAR`). */
  readonly runnerBinary?: string;
  readonly resolveRunnerBinary?: () => Promise<string>;
  readonly resolveSidecarPath?: () => string | Promise<string>;
  readonly sidecarPath?: string;
  readonly run?: typeof runRunner;
  readonly fileSha256?: (path: string) => Promise<string>;
  readonly productVersion?: string;
};

async function defaultFileSha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function defaultRunnerBinary(environment: LocalAppEnvironment): Promise<string> {
  const override = environment.GHOSTGET_MENUBAR;
  if (override !== undefined && override !== "") {
    if (!isAbsolute(override) || normalize(override) !== override) {
      throw new LocalAppError("runner-failed", "GHOSTGET_MENUBAR must be an absolute, normalized path to a reviewed companion executable.");
    }
    return override;
  }
  // The pinned-release installer runs in its own process so this opt-in path
  // adds no dependency edge to the analyzed module graph. The resolver script
  // is addressed by its own file URL, never through PATH or a shell.
  const resolver = fileURLToPath(new URL("./cookie-companion-resolve.ts", import.meta.url));
  const result = await runRunner(process.execPath, ["--no-env-file", "--no-install", resolver]);
  const line = firstJsonLine(result.stdout);
  if (
    result.code !== 0
    || line?.type !== "runner-result"
    || typeof line.path !== "string"
    || !isAbsolute(line.path)
    || normalize(line.path) !== line.path
  ) {
    throw new LocalAppError(
      "runner-failed",
      "The reviewed companion executable could not be resolved, so Ghostget can't build its app yet.",
    );
  }
  return line.path;
}

/**
 * Locate the packaged local-custody sidecar. The import is inside the opt-in
 * assembly path; the package is already part of the dependency closure
 * (`custody-engine.ts`), so the edge adds no new package to the analyzed
 * graph, and the helper digest check below still verifies the resolved bytes.
 */
async function defaultSidecarPath(environment: LocalAppEnvironment): Promise<string> {
  const override = environment.HRANESS_LOCAL_CUSTODY_CLI_PATH;
  if (override !== undefined && override !== "") return resolve(override);
  try {
    return (await import("@hraness/local-custody/custody-rust")).sidecarBinaryPath();
  } catch (error) {
    throw new LocalAppError(
      "assemble-failed",
      `The packaged cookie reader is not installed with Ghostget or has no build for ${process.platform}-${process.arch}.`,
      { cause: error },
    );
  }
}

/**
 * Build or refresh `~/Applications/Hraness/Ghostget.app` with the signed
 * cookie-reader helper inside it. Both inputs are digest-verified: the runner
 * checks the helper digest inside `--assemble-app`, and the installed copy is
 * hashed again before its path is handed out. Any failure is a typed
 * `LocalAppError`; nothing falls back to the system `security` tool.
 */
export async function assembleLocalApp(
  environment: LocalAppEnvironment,
  dependencies: LocalAppDependencies = {},
): Promise<AssembledLocalApp> {
  const runner =
    dependencies.runnerBinary
    ?? await (dependencies.resolveRunnerBinary ?? (() => defaultRunnerBinary(environment)))();
  const run = dependencies.run ?? runRunner;
  const fileSha256 = dependencies.fileSha256 ?? defaultFileSha256;

  const identity = await run(runner, ["--signing-identity", "ensure"]);
  const identityLine = firstJsonLine(identity.stdout);
  if (
    identity.code !== 0
    || identityLine?.type !== "signing-identity"
    || identityLine.state !== "ready"
  ) {
    throw new LocalAppError(
      "identity-unavailable",
      "The local signing identity is not available, so Ghostget can't build its app yet.",
    );
  }

  const sidecarPath = dependencies.sidecarPath
    ?? await (dependencies.resolveSidecarPath ?? (() => defaultSidecarPath(environment)))();
  const sidecarSha256 = await fileSha256(sidecarPath);
  const request = JSON.stringify({
    type: "app-request",
    version: 1,
    appId: APP_ID,
    name: APP_NAME,
    productVersion: dependencies.productVersion ?? "0.0.0",
    helpers: [{ name: COOKIE_READER_HELPER_NAME, path: sidecarPath, sha256: sidecarSha256 }],
    signing: "local",
  });
  const result = await run(runner, ["--assemble-app"], request);
  const line = firstJsonLine(result.stdout);
  const status = line?.status;
  const appPath = typeof line?.path === "string" ? line.path : undefined;
  if (
    result.code !== 0
    || line?.type !== "app-result"
    || (status !== "built" && status !== "unchanged")
    || appPath === undefined
    || !isAbsolute(appPath)
  ) {
    const code = typeof line?.code === "string" ? line.code : "assemble-failed";
    throw new LocalAppError(
      code === "identity-unavailable" ? "identity-unavailable" : "assemble-failed",
      `Ghostget's local app could not be built (${code}).`,
    );
  }

  const helperPath = localAppHelperPath(appPath);
  if (await fileSha256(helperPath) !== sidecarSha256) {
    throw new LocalAppError(
      "helper-mismatch",
      "The signed cookie reader inside Ghostget's app did not match the packaged helper.",
    );
  }
  return { appPath, helperPath };
}

let assemblyPromise: Promise<AssembledLocalApp> | undefined;

/**
 * The process-wide assembled app, built lazily on first use. Test-only reset
 * goes through `resetLocalAppAssembly`.
 */
export function ensureLocalApp(
  environment: LocalAppEnvironment,
  dependencies: LocalAppDependencies = {},
): Promise<AssembledLocalApp> {
  assemblyPromise ??= assembleLocalApp(environment, dependencies);
  return assemblyPromise;
}

export function resetLocalAppAssembly(): void {
  assemblyPromise = undefined;
}
