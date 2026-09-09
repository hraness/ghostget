import { chmodSync, lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  agentBrowserCommand,
  browserCommandLifecycle,
  isolatedEnvironment,
  parseLastJsonWithExactLaunchHashes,
  runCommand,
  type CommandResult,
} from "./browser";
import { exactCdpEndpointStatus } from "./derive";
import {
  captureProcessOwnerIdentity,
  processOwnerStatus,
  type ProcessOwnerIdentity,
  type ProcessOwnerStatus,
} from "./process-identity";
import { DeriveBrowserHome, type DeriveBrowserToolchain } from "./derive-browser-toolchain.test-support";

// Pinned agent-browser 0.32.3 allows 30s for Chrome's DevToolsActivePort,
// plus daemon admission and IPC. Only a fresh fixture-owned launch gets this
// envelope; action/pin commands keep their existing 10s product deadlines.
export const fixtureColdLaunchTimeoutMs = 40_000;

/** Consume an explicit cold-launch grant once, before any command can start. */
export function createFixtureColdLaunchAdmission(sessions: readonly string[]): (session: string) => void {
  const owned = new Set(sessions);
  const admitted = new Set<string>();
  return (session) => {
    if (!owned.has(session) || session.startsWith("io-derive-pin-") || admitted.has(session)) {
      throw new Error("fixture cold launch is not fresh and owned");
    }
    admitted.add(session);
  };
}

export function fixtureCollectionTimeout(deadline: number, now: number): number {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) throw new Error("fixture cleanup clock is invalid");
  const remaining = Math.floor(deadline - now);
  if (remaining <= 0 || remaining > 30_000) throw new Error("fixture cleanup deadline expired or changed");
  return remaining;
}

/** Native output may contain paths or browser state: expose only fixed literals and byte custody. */
export function fixtureCommandDiagnostic(result: CommandResult): string {
  const diagnostic = ["Chrome not found.", "Failed to launch Chrome", "Failed to connect to browser",
    "Daemon failed to start", "action denied", "Action denied"]
    .filter((literal) => result.stderr.includes(literal) || result.stdout.includes(literal));
  return JSON.stringify({ exitCode: result.exitCode, stderrBytes: Buffer.byteLength(result.stderr),
    stderrSha256: createHash("sha256").update(result.stderr).digest("hex"),
    stdoutBytes: Buffer.byteLength(result.stdout), stdoutSha256: createHash("sha256").update(result.stdout).digest("hex"),
    diagnostic });
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("fixture session result is malformed");
  }
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, expected: readonly string[]): void {
  if (Object.keys(value).sort().join("\0") !== [...expected].sort().join("\0")) {
    throw new Error("fixture session result changed shape");
  }
}

/** Only the exact isolated session may supply a cleanup PID; inactive is explicit. */
export function fixtureSessionPid(value: unknown, session: string, socketDirectory: string): number | null {
  const root = record(value);
  keys(root, ["data", "success"]);
  const data = record(root.data);
  keys(data, ["active", "namespace", "pid", "runtime", "runtimeError", "session", "socketDir", "version"]);
  if (root.success !== true || data.namespace !== null || data.runtimeError !== null
    || data.session !== session || data.socketDir !== socketDirectory) {
    throw new Error("fixture session identity changed");
  }
  if (data.active === false && data.pid === null && data.runtime === null && data.version === null) return null;
  if (data.active !== true || typeof data.pid !== "number" || !Number.isSafeInteger(data.pid)
    || data.pid < 1 || data.version !== "0.32.3") throw new Error("fixture daemon identity is malformed");
  const runtime = record(data.runtime);
  keys(runtime, [
    "backgroundPid", "browserLaunched", "compatibilityStatus", "effectiveLaunch", "engine",
    "launchHash", "lifecycle", "namespace", "pageCount", "restoreCheckFn", "restoreCheckText",
    "restoreCheckUrl", "restoreKey", "restoreLoadedPath", "restoreSave", "restoreSavedPath",
    "restoreStatus", "restoreStatusDetail", "restoreValidationPending", "saveStatus", "session", "socketDir",
  ]);
  if (runtime.backgroundPid !== data.pid || runtime.namespace !== null || runtime.session !== session
    || runtime.socketDir !== socketDirectory || runtime.engine !== "chrome"
    || typeof runtime.browserLaunched !== "boolean") throw new Error("fixture daemon routing changed");
  return data.pid;
}

type CollectionPorts = {
  readonly deadline: number;
  readonly inspect: () => Promise<number | null>;
  readonly capture: (pid: number) => ProcessOwnerIdentity;
  readonly bound: (owner: ProcessOwnerIdentity) => void;
  readonly status: (owner: ProcessOwnerIdentity) => ProcessOwnerStatus;
  readonly close: () => Promise<number>;
  readonly terminate: (owner: ProcessOwnerIdentity) => void;
  readonly now: () => number;
  readonly sleep: () => Promise<void>;
};

/** Supported close first, then only an unchanged, still-routed native owner. */
export async function collectFixtureDaemon(
  previousOwner: ProcessOwnerIdentity | undefined,
  ports: CollectionPorts,
): Promise<ProcessOwnerIdentity | null> {
  const withinDeadline = (): void => { fixtureCollectionTimeout(ports.deadline, ports.now()); };
  withinDeadline();
  const pid = await ports.inspect();
  withinDeadline();
  if (pid === null) {
    if (previousOwner !== undefined && ports.status(previousOwner) !== "different-or-dead") {
      throw new Error("inactive fixture session still has an uncollected owner");
    }
    return previousOwner ?? null;
  }
  const owner = previousOwner ?? ports.capture(pid);
  ports.bound(owner);
  const exact = (): void => {
    withinDeadline();
    if (pid !== owner.pid || ports.status(owner) !== "exact-live-owner") {
      throw new Error("fixture daemon owner changed or became indeterminate");
    }
  };
  exact();
  if (await ports.inspect() !== pid) throw new Error("fixture daemon routing changed before close");
  exact();
  const closeErrors: unknown[] = [];
  try {
    if (await ports.close() !== 0) closeErrors.push(new Error("fixture session close failed"));
  } catch (error) {
    closeErrors.push(error);
  }
  try {
    if (ports.status(owner) === "exact-live-owner") {
      if (await ports.inspect() !== pid) throw new Error("fixture daemon routing changed after close");
      exact();
      ports.terminate(owner);
    }
    const deadline = Math.min(ports.deadline, ports.now() + 5_000);
    for (;;) {
      const status = ports.status(owner);
      if (status === "different-or-dead") break;
      if (status === "unknown") throw new Error("fixture daemon collection became indeterminate");
      if (ports.now() >= deadline) throw new Error("fixture daemon did not terminate");
      await ports.sleep();
    }
    withinDeadline();
    if (await ports.inspect() !== null) throw new Error("collected fixture session is still active");
    withinDeadline();
  } catch (error) {
    closeErrors.push(error);
  }
  if (closeErrors.length > 0) throw new AggregateError(closeErrors, "fixture daemon cleanup failed");
  return owner;
}

/** Test-local custody, never a default namespace or a reusable production cleaner. */
export class DerivationBrowserFixture {
  private readonly roots;
  private readonly owners = new Map<string, ProcessOwnerIdentity>();
  private readonly endpoints = new Set<string>();
  private readonly evidenceDirectory: string;
  private cleanupDeadline: number | null = null;
  private readonly admitColdLaunch: (session: string) => void;
  private readonly browserHome: DeriveBrowserHome;
  private readonly startupEvidence: unknown[] = [];
  private readonly commandFailures: unknown[] = [];

  constructor(
    private readonly directory: string,
    private readonly socketDirectory: string,
    private readonly sessions: readonly string[],
    toolchain: DeriveBrowserToolchain,
  ) {
    if (sessions.length < 2 || sessions.length > 3 || new Set(sessions).size !== sessions.length
      || sessions.some((session) => !/^io-(?:derive(?:-pin)?|replace)-[a-f0-9]{10,12}$/u.test(session))) {
      throw new Error("fixture session inventory is invalid");
    }
    this.admitColdLaunch = createFixtureColdLaunchAdmission(sessions);
    this.browserHome = new DeriveBrowserHome(directory, toolchain);
    this.roots = [directory, socketDirectory].map((path) => ({ path, stat: lstatSync(path, { bigint: true }) }));
    this.assertRoots();
    this.evidenceDirectory = realpathSync(mkdtempSync(join(tmpdir(), "wrench-derive-cleanup-proof-")));
    chmodSync(this.evidenceDirectory, 0o700);
  }

  private assertRoots(): void {
    this.browserHome.assertStable();
    for (const { path, stat } of this.roots) {
      const current = lstatSync(path, { bigint: true });
      if (!current.isDirectory() || current.isSymbolicLink() || realpathSync(path) !== path
        || current.dev !== stat.dev || current.ino !== stat.ino || current.uid !== stat.uid
        || current.uid !== BigInt(process.getuid!()) || (current.mode & 0o777n) !== 0o700n) {
        throw new Error("fixture cleanup roots changed");
      }
    }
  }

  browserEnvironment(): Readonly<Record<string, string>> {
    this.assertRoots();
    return { ...isolatedEnvironment(this.socketDirectory), ...this.browserHome.environment };
  }

  helperEnvironment(): Readonly<Record<string, string>> {
    this.assertRoots();
    return { NODE_ENV: "production", ...this.browserHome.environment };
  }

  recordCommandFailure(session: string | null, operation: "initial-cdp" | "body" | "session-info" | "session-close", error: unknown): void {
    try {
      const lifecycle = browserCommandLifecycle(error);
      if (lifecycle === null || this.commandFailures.length >= 32) return;
      if (session !== null && !this.sessions.includes(session)) return;
      const role = session === null ? "unattributed-body"
        : session.startsWith("io-derive-pin-") ? "pin"
        : session.startsWith("io-replace-") ? "replacement" : "owner";
      const value = Object.freeze({ operation, role, lifecycle });
      this.commandFailures.push(value);
      console.error(`[wrench-fixture-command] ${JSON.stringify(value)}`);
    } catch { /* Diagnostics cannot replace any primary or cleanup failure. */ }
  }

  private async inspect(session: string): Promise<number | null> {
    this.assertRoots();
    if (!this.sessions.includes(session)) throw new Error("fixture session is not owned");
    const timeoutMs = this.cleanupDeadline === null ? 3_000
      : fixtureCollectionTimeout(this.cleanupDeadline, performance.now());
    let result: Awaited<ReturnType<typeof runCommand>>;
    try {
      result = await runCommand([
        ...agentBrowserCommand(), "--config", "agent-browser.json", "--action-policy", "action-policy.json",
        "--session", session, "session", "info", "--json",
      ], {
        cwd: this.directory, environment: this.browserEnvironment(),
        timeoutMs, maxOutputBytes: 1024 * 1024,
      });
    } catch (error) {
      this.recordCommandFailure(session, "session-info", error);
      throw error;
    }
    this.assertRoots();
    if (result.exitCode !== 0) throw new Error(`fixture session inspection failed: ${fixtureCommandDiagnostic(result)}`);
    const value = parseLastJsonWithExactLaunchHashes(result.stdout);
    const pid = fixtureSessionPid(value, session, this.socketDirectory);
    const data = record(record(value).data);
    if (this.startupEvidence.length < 64) this.startupEvidence.push({
      phase: "inspection", sessionIndex: this.sessions.indexOf(session), active: pid !== null,
      browserLaunched: pid === null ? false : record(data.runtime).browserLaunched,
    });
    return pid;
  }

  /** One explicit cold launch per isolated owned session; never a pin or a retry. */
  async launch(session: string): Promise<CommandResult> {
    this.assertRoots();
    if (this.cleanupDeadline !== null || this.owners.has(session)) throw new Error("fixture cold launch is not fresh and owned");
    this.admitColdLaunch(session);
    if (await this.inspect(session) !== null) throw new Error("fixture cold launch session is already active");
    const started = performance.now();
    let result: CommandResult;
    try { result = await runCommand([
      ...agentBrowserCommand(), "--config", "agent-browser.json", "--action-policy", "action-policy.json",
      "--session", session, "--json", "get", "cdp-url",
    ], { cwd: this.directory, environment: this.browserEnvironment(),
      timeoutMs: fixtureColdLaunchTimeoutMs, maxOutputBytes: 1024 * 1024 });
    } catch (error) {
      this.startupEvidence.push({ phase: "cold-command-failed", sessionIndex: this.sessions.indexOf(session),
        elapsedMs: Math.ceil(performance.now() - started),
        deadline: error instanceof Error && error.message.includes("timed out after 40000ms") });
      throw error;
    }
    this.startupEvidence.push({ phase: "cold-command-returned", sessionIndex: this.sessions.indexOf(session),
      elapsedMs: Math.ceil(performance.now() - started), exitCode: result.exitCode });
    this.assertRoots();
    if (result.exitCode !== 0) throw new Error(`fixture cold launch failed: ${fixtureCommandDiagnostic(result)}`);
    return result;
  }

  async bind(session: string, cdpUrl: string): Promise<void> {
    this.endpoints.add(cdpUrl);
    const pid = await this.inspect(session);
    if (pid === null) throw new Error("launched fixture session is inactive");
    const owner = captureProcessOwnerIdentity(pid);
    const previous = this.owners.get(session);
    if (previous !== undefined && (previous.pid !== owner.pid || previous.bootId !== owner.bootId
      || previous.processStartId !== owner.processStartId)) throw new Error("fixture daemon was replaced");
    this.owners.set(session, owner);
    if (await this.inspect(session) !== pid || processOwnerStatus(owner) !== "exact-live-owner") {
      throw new Error("fixture daemon changed during binding");
    }
  }

  async run(body: () => Promise<void>): Promise<void> {
    const errors: unknown[] = [];
    try { await body(); } catch (error) {
      this.recordCommandFailure(null, "body", error);
      errors.push(error);
    }
    this.cleanupDeadline = performance.now() + 30_000;
    const cleanupDeadline = this.cleanupDeadline;
    const collected: string[] = [];
    // Pins close before the owned browser to which they were attached.
    for (const session of this.sessions) {
      try {
        await collectFixtureDaemon(this.owners.get(session), {
          deadline: cleanupDeadline,
          inspect: () => this.inspect(session),
          capture: captureProcessOwnerIdentity,
          bound: (owner) => { this.owners.set(session, owner); },
          status: processOwnerStatus,
          close: async () => {
            this.assertRoots();
            const timeoutMs = fixtureCollectionTimeout(cleanupDeadline, performance.now());
            // The exact CDP endpoint may intentionally be dead. Close the daemon session,
            // without --cdp, while its original routing and tripwire config still exist.
            let result: Awaited<ReturnType<typeof runCommand>>;
            try {
              result = await runCommand([
                ...agentBrowserCommand(), "--config", "agent-browser.json", "--action-policy", "action-policy.json",
                "--session", session, "close", "--json",
              ], {
                cwd: this.directory, environment: this.browserEnvironment(),
                timeoutMs, maxOutputBytes: 1024 * 1024,
              });
            } catch (error) {
              this.recordCommandFailure(session, "session-close", error);
              throw error;
            }
            this.assertRoots();
            if (result.exitCode !== 0) throw new Error(`fixture close failed: ${fixtureCommandDiagnostic(result)}`);
            return result.exitCode;
          },
          terminate: (owner) => {
            this.assertRoots();
            if (processOwnerStatus(owner) !== "exact-live-owner") throw new Error("fixture owner changed before SIGTERM");
            try { process.kill(owner.pid, "SIGTERM"); } catch (error) {
              if (processOwnerStatus(owner) !== "different-or-dead") throw error;
            }
          },
          now: () => performance.now(),
          sleep: () => Bun.sleep(25),
        });
        collected.push(session);
      } catch (error) { errors.push(error); }
    }
    let quiescent = false;
    try {
      if (collected.length !== this.sessions.length) throw new Error("fixture collection is incomplete");
      for (let round = 0; round < 3; round += 1) {
        fixtureCollectionTimeout(cleanupDeadline, performance.now());
        for (const session of this.sessions) {
          if (await this.inspect(session) !== null) throw new Error("fixture session became active after collection");
        }
        for (const owner of this.owners.values()) {
          if (processOwnerStatus(owner) !== "different-or-dead") throw new Error("fixture owner remains uncollected");
        }
        for (const endpoint of this.endpoints) {
          fixtureCollectionTimeout(cleanupDeadline, performance.now());
          if (await exactCdpEndpointStatus(endpoint) !== "unavailable") throw new Error("fixture CDP endpoint remains uncollected");
          fixtureCollectionTimeout(cleanupDeadline, performance.now());
        }
        this.assertRoots();
        if (round < 2) await Bun.sleep(25);
      }
      fixtureCollectionTimeout(cleanupDeadline, performance.now());
      await this.browserHome.toolchain.verify();
      fixtureCollectionTimeout(cleanupDeadline, performance.now());
      quiescent = true;
    } catch (error) { errors.push(error); }
    // No raw command output, browser state, endpoint, or original error is serialized.
    try {
      writeFileSync(join(this.evidenceDirectory, "cleanup.json"), `${JSON.stringify({
        schemaVersion: 1, quiescent, failed: errors.length > 0, collected,
        browserToolchain: { version: this.browserHome.toolchain.receipt.version,
          platform: this.browserHome.toolchain.receipt.platform,
          archiveSha256: this.browserHome.toolchain.receipt.archiveSha256,
          executableSha256: this.browserHome.toolchain.receipt.executableSha256,
          treeSha256: this.browserHome.toolchain.receipt.treeSha256 },
        startup: this.startupEvidence,
        commandFailures: this.commandFailures,
        owners: [...this.owners].map(([session, owner]) => ({ session, ...owner })),
        roots: this.roots.map(({ stat }) => ({ device: stat.dev.toString(), inode: stat.ino.toString() })),
      })}\n`, { mode: 0o600, flag: "wx" });
      if (errors.length > 0) process.stderr.write(`native fixture startup evidence: ${JSON.stringify({
        version: this.browserHome.toolchain.receipt.version, platform: this.browserHome.toolchain.receipt.platform,
        executableSha256: this.browserHome.toolchain.receipt.executableSha256,
        startup: this.startupEvidence, quiescent,
      })}\n`);
      if (quiescent && errors.length === 0) {
        this.assertRoots();
        rmSync(this.socketDirectory, { recursive: true });
        rmSync(this.directory, { recursive: true });
      }
    } catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "fixture failed; private cleanup evidence and roots retained");
  }
}
