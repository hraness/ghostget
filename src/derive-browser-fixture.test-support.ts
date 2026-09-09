import { chmodSync, lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentBrowserCommand,
  browserCommandLifecycle,
  isolatedEnvironment,
  parseLastJsonWithExactLaunchHashes,
  runCommand,
} from "./browser";
import { exactCdpEndpointStatus } from "./derive";
import {
  captureProcessOwnerIdentity,
  processOwnerStatus,
  type ProcessOwnerIdentity,
  type ProcessOwnerStatus,
} from "./process-identity";

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
  const pid = await ports.inspect();
  if (pid === null) {
    if (previousOwner !== undefined && ports.status(previousOwner) !== "different-or-dead") {
      throw new Error("inactive fixture session still has an uncollected owner");
    }
    return previousOwner ?? null;
  }
  const owner = previousOwner ?? ports.capture(pid);
  ports.bound(owner);
  const exact = (): void => {
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
    const deadline = ports.now() + 5_000;
    for (;;) {
      const status = ports.status(owner);
      if (status === "different-or-dead") break;
      if (status === "unknown") throw new Error("fixture daemon collection became indeterminate");
      if (ports.now() >= deadline) throw new Error("fixture daemon did not terminate");
      await ports.sleep();
    }
    if (await ports.inspect() !== null) throw new Error("collected fixture session is still active");
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
  private cleanupDeadline = Infinity;
  private readonly commandFailures: unknown[] = [];

  constructor(
    private readonly directory: string,
    private readonly socketDirectory: string,
    private readonly sessions: readonly string[],
  ) {
    if (sessions.length < 2 || sessions.length > 3 || new Set(sessions).size !== sessions.length
      || sessions.some((session) => !/^io-(?:derive(?:-pin)?|replace)-[a-f0-9]{10,12}$/u.test(session))) {
      throw new Error("fixture session inventory is invalid");
    }
    this.roots = [directory, socketDirectory].map((path) => ({ path, stat: lstatSync(path, { bigint: true }) }));
    this.assertRoots();
    this.evidenceDirectory = realpathSync(mkdtempSync(join(tmpdir(), "wrench-derive-cleanup-proof-")));
    chmodSync(this.evidenceDirectory, 0o700);
  }

  private assertRoots(): void {
    for (const { path, stat } of this.roots) {
      const current = lstatSync(path, { bigint: true });
      if (!current.isDirectory() || current.isSymbolicLink() || realpathSync(path) !== path
        || current.dev !== stat.dev || current.ino !== stat.ino || current.uid !== stat.uid
        || current.uid !== BigInt(process.getuid!()) || (current.mode & 0o777n) !== 0o700n) {
        throw new Error("fixture cleanup roots changed");
      }
    }
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
    const remaining = this.cleanupDeadline - performance.now();
    if (remaining <= 0) throw new Error("fixture cleanup deadline expired");
    let result: Awaited<ReturnType<typeof runCommand>>;
    try {
      result = await runCommand([
        ...agentBrowserCommand(), "--config", "agent-browser.json", "--action-policy", "action-policy.json",
        "--session", session, "session", "info", "--json",
      ], {
        cwd: this.directory, environment: isolatedEnvironment(this.socketDirectory),
        timeoutMs: Math.min(3_000, remaining), maxOutputBytes: 1024 * 1024,
      });
    } catch (error) {
      this.recordCommandFailure(session, "session-info", error);
      throw error;
    }
    this.assertRoots();
    if (result.exitCode !== 0) throw new Error("fixture session inspection failed");
    return fixtureSessionPid(parseLastJsonWithExactLaunchHashes(result.stdout), session, this.socketDirectory);
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
    const collected: string[] = [];
    // Pins close before the owned browser to which they were attached.
    for (const session of this.sessions) {
      try {
        await collectFixtureDaemon(this.owners.get(session), {
          inspect: () => this.inspect(session),
          capture: captureProcessOwnerIdentity,
          bound: (owner) => { this.owners.set(session, owner); },
          status: processOwnerStatus,
          close: async () => {
            this.assertRoots();
            const remaining = this.cleanupDeadline - performance.now();
            if (remaining <= 0) throw new Error("fixture cleanup deadline expired");
            // The exact CDP endpoint may intentionally be dead. Close the daemon session,
            // without --cdp, while its original routing and tripwire config still exist.
            let result: Awaited<ReturnType<typeof runCommand>>;
            try {
              result = await runCommand([
                ...agentBrowserCommand(), "--config", "agent-browser.json", "--action-policy", "action-policy.json",
                "--session", session, "close", "--json",
              ], {
                cwd: this.directory, environment: isolatedEnvironment(this.socketDirectory),
                timeoutMs: Math.min(3_000, remaining), maxOutputBytes: 1024 * 1024,
              });
            } catch (error) {
              this.recordCommandFailure(session, "session-close", error);
              throw error;
            }
            this.assertRoots();
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
        for (const session of this.sessions) {
          if (await this.inspect(session) !== null) throw new Error("fixture session became active after collection");
        }
        for (const owner of this.owners.values()) {
          if (processOwnerStatus(owner) !== "different-or-dead") throw new Error("fixture owner remains uncollected");
        }
        for (const endpoint of this.endpoints) {
          if (await exactCdpEndpointStatus(endpoint) !== "unavailable") throw new Error("fixture CDP endpoint remains uncollected");
        }
        this.assertRoots();
        if (round < 2) await Bun.sleep(25);
      }
      quiescent = true;
    } catch (error) { errors.push(error); }
    // No raw command output, browser state, endpoint, or original error is serialized.
    try {
      writeFileSync(join(this.evidenceDirectory, "cleanup.json"), `${JSON.stringify({
        schemaVersion: 1, quiescent, failed: errors.length > 0, collected,
        commandFailures: this.commandFailures,
        owners: [...this.owners].map(([session, owner]) => ({ session, ...owner })),
        roots: this.roots.map(({ stat }) => ({ device: stat.dev.toString(), inode: stat.ino.toString() })),
      })}\n`, { mode: 0o600, flag: "wx" });
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
