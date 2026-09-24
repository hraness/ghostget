import type * as NodeFs from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * The durable filesystem effects the state and path helpers perform. Each
 * call is one crash boundary: a crash can land just before it, just after it,
 * inside a data write, or at power loss after it.
 */
export type StatePort = Pick<
  typeof NodeFs,
  | "fchmodSync"
  | "fsyncSync"
  | "linkSync"
  | "mkdirSync"
  | "openSync"
  | "renameSync"
  | "rmSync"
  | "rmdirSync"
  | "unlinkSync"
  | "writeFileSync"
>;

export type StateCrashMode = "before" | "after" | "torn" | "power-loss";

export const STATE_CRASH_MODES: readonly StateCrashMode[] = Object.freeze([
  "before",
  "after",
  "torn",
  "power-loss",
]);

/**
 * A seeded durability defect for the harness's own mutant check: the port
 * skips the named fsync while still counting its boundary, as a helper that
 * forgot it would.
 */
export type StateCrashMutant = "drop-directory-fsync" | "drop-file-fsync";

export type StateBoundaryKind =
  | "create"
  | "write"
  | "chmod"
  | "fsync"
  | "link"
  | "rename"
  | "unlink"
  | "mkdir"
  | "rmdir"
  | "rm";

/**
 * A pending effect is one the filesystem may still lose at power loss: its
 * directory entry or its data has not been fsynced yet.
 */
type PendingEffect =
  | {
    readonly kind: "created";
    readonly path: string;
    readonly directories: string[];
  }
  | {
    readonly kind: "created-directory";
    readonly path: string;
    readonly directories: string[];
  }
  | {
    readonly kind: "renamed";
    readonly from: string;
    readonly to: string;
    readonly replacedBackup: string | null;
    readonly directories: string[];
  }
  | {
    readonly kind: "unlinked";
    readonly path: string;
    readonly backup: string;
    readonly directories: string[];
  }
  | {
    readonly kind: "removed-directory";
    readonly path: string;
    readonly directories: string[];
  }
  | {
    readonly kind: "data";
    path: string;
    readonly device: string;
    readonly inode: string;
  };

/**
 * The crash plan is one JSON file shared by the victim process and every
 * helper it spawns. Helpers run one at a time under `spawnSync`, so each
 * boundary reads, advances, and rewrites it without a lock.
 */
export type StateCrashPlan = {
  readonly schemaVersion: 1;
  /** The 1-based boundary to crash at; 0 counts boundaries and never crashes. */
  readonly target: number;
  readonly mode: StateCrashMode;
  /** Per-mille of a torn write's bytes that reach the file. */
  readonly tornPerMille: number;
  readonly mutant: StateCrashMutant | null;
  /** The process that dies with the helper; it must be the helper's parent. */
  victim: number | null;
  /** Boundaries seen; in torn mode only data writes count. */
  seen: number;
  kinds: Partial<Record<StateBoundaryKind, number>>;
  fired: null | {
    readonly boundary: number;
    readonly kind: StateBoundaryKind;
    readonly name: string;
  };
  pending: PendingEffect[];
  backupDirectory: string;
  backups: number;
  undoError: string | null;
};

export function initialStateCrashPlan(
  target: number,
  mode: StateCrashMode,
  backupDirectory: string,
  tornPerMille = 500,
  mutant: StateCrashMutant | null = null,
): StateCrashPlan {
  if (!Number.isSafeInteger(target) || target < 0) {
    throw new Error("crash target must be a non-negative integer");
  }
  if (!Number.isSafeInteger(tornPerMille) || tornPerMille < 0 || tornPerMille > 999) {
    throw new Error("torn write fraction must be 0 to 999 per mille");
  }
  if (!isAbsolute(backupDirectory)) {
    throw new Error("crash backup directory must be absolute");
  }
  return {
    schemaVersion: 1,
    target,
    mode,
    tornPerMille,
    mutant,
    victim: null,
    seen: 0,
    kinds: {},
    fired: null,
    pending: [],
    backupDirectory,
    backups: 0,
    undoError: null,
  };
}

export function readStateCrashPlan(
  fs: Pick<typeof NodeFs, "readFileSync">,
  planPath: string,
): StateCrashPlan {
  const value: unknown = JSON.parse(fs.readFileSync(planPath, "utf8"));
  if (
    typeof value !== "object"
    || value === null
    || (value as { schemaVersion?: unknown }).schemaVersion !== 1
  ) throw new Error("state crash plan is malformed");
  return value as StateCrashPlan;
}

function writePlan(
  fs: Pick<typeof NodeFs, "renameSync" | "writeFileSync">,
  planPath: string,
  plan: StateCrashPlan,
): void {
  const temporary = `${planPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(plan)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, planPath);
}

/**
 * Wrap the real filesystem so that boundary `plan.target` crashes the helper
 * and its victim with SIGKILL, which runs no `finally` block, exit handler, or
 * later write. In power-loss mode the crash also rolls back, newest first,
 * every effect no fsync has made durable, which is one outcome POSIX allows.
 * Directory tree removals (`rmSync`) are treated as durable at once.
 */
export function crashInjectingStatePort(
  fs: typeof NodeFs,
  planPath: string,
): StatePort {
  const descriptorPaths = new Map<number, string>();
  const absolute = (path: NodeFs.PathLike): string => {
    if (typeof path !== "string") {
      throw new Error("the crash port accepts string paths only");
    }
    return resolve(process.cwd(), path);
  };
  const read = (): StateCrashPlan => readStateCrashPlan(fs, planPath);
  const tracking = (plan: StateCrashPlan): boolean => plan.mode === "power-loss";

  const die = (plan: StateCrashPlan): never => {
    if (plan.victim !== null && plan.victim === process.ppid) {
      process.kill(plan.victim, "SIGKILL");
    }
    process.kill(process.pid, "SIGKILL");
    throw new Error("the crash port could not kill its process");
  };

  // A helper that starts after the crash belongs to a dead machine.
  const startup = read();
  if (startup.fired !== null) die(startup);

  const backup = (plan: StateCrashPlan, path: string): string => {
    plan.backups += 1;
    const target = join(plan.backupDirectory, `backup-${String(plan.backups)}`);
    fs.linkSync(path, target);
    return target;
  };

  // A backup is an extra hard link, and helpers check link counts, so each
  // one lives only while its effect can still be lost.
  const dropBackup = (effect: PendingEffect): void => {
    const saved = effect.kind === "unlinked"
      ? effect.backup
      : effect.kind === "renamed" ? effect.replacedBackup : null;
    if (saved !== null) fs.rmSync(saved, { force: true });
  };

  const settleDirectory = (plan: StateCrashPlan, directory: string): void => {
    plan.pending = plan.pending.filter((effect) => {
      if (effect.kind === "data") return true;
      const index = effect.directories.indexOf(directory);
      if (index !== -1) effect.directories.splice(index, 1);
      if (effect.directories.length > 0) return true;
      dropBackup(effect);
      return false;
    });
  };

  const undo = (plan: StateCrashPlan): void => {
    for (const effect of [...plan.pending].reverse()) {
      switch (effect.kind) {
        case "created":
          fs.rmSync(effect.path, { force: true });
          break;
        case "created-directory":
          fs.rmSync(effect.path, { recursive: true, force: true });
          break;
        case "renamed":
          fs.renameSync(effect.to, effect.from);
          for (const data of plan.pending) {
            if (data.kind === "data" && data.path === effect.to) data.path = effect.from;
          }
          if (effect.replacedBackup !== null) fs.linkSync(effect.replacedBackup, effect.to);
          break;
        case "unlinked":
          fs.linkSync(effect.backup, effect.path);
          break;
        case "removed-directory":
          fs.mkdirSync(effect.path, { mode: 0o700 });
          break;
        case "data": {
          let stats: NodeFs.BigIntStats;
          try {
            stats = fs.lstatSync(effect.path, { bigint: true });
          } catch {
            break;
          }
          if (
            stats.dev.toString() === effect.device
            && stats.ino.toString() === effect.inode
          ) fs.truncateSync(effect.path, 0);
          break;
        }
      }
    }
    for (const effect of plan.pending) dropBackup(effect);
    plan.pending = [];
  };

  /**
   * Run one boundary. `perform` does the real effect and returns what the
   * power-loss model must remember; `tear` writes a prefix instead.
   */
  const boundary = <T>(
    kind: StateBoundaryKind,
    name: string,
    perform: (plan: StateCrashPlan) => T,
    tear?: (plan: StateCrashPlan) => void,
  ): T => {
    const plan = read();
    if (plan.fired !== null) die(plan);
    plan.kinds[kind] = (plan.kinds[kind] ?? 0) + 1;
    const counted = plan.mode !== "torn" || kind === "write";
    if (counted) plan.seen += 1;
    if (!counted || plan.seen !== plan.target) {
      const result = perform(plan);
      writePlan(fs, planPath, plan);
      return result;
    }
    plan.fired = { boundary: plan.seen, kind, name };
    writePlan(fs, planPath, plan);
    if (plan.mode === "before") die(plan);
    if (plan.mode === "torn") {
      if (tear === undefined) throw new Error("a torn crash landed on a non-write boundary");
      tear(plan);
      die(plan);
    }
    perform(plan);
    if (plan.mode === "power-loss") {
      try {
        undo(plan);
      } catch (error) {
        plan.undoError = error instanceof Error ? error.message : String(error);
      }
    }
    writePlan(fs, planPath, plan);
    return die(plan);
  };

  const port: StatePort = {
    openSync(path, flags, mode) {
      const target = absolute(path);
      const creates = typeof flags === "number" && (flags & fs.constants.O_CREAT) !== 0;
      const open = (): number => {
        const descriptor = fs.openSync(path, flags, mode);
        descriptorPaths.set(descriptor, target);
        return descriptor;
      };
      if (!creates) return open();
      return boundary("create", target, (plan) => {
        const existed = fs.existsSync(target);
        const descriptor = open();
        if (tracking(plan) && !existed) {
          plan.pending.push({ kind: "created", path: target, directories: [dirname(target)] });
        }
        return descriptor;
      });
    },
    writeFileSync(file, data, options) {
      const target = typeof file === "number"
        ? descriptorPaths.get(file) ?? `descriptor ${String(file)}`
        : absolute(file as NodeFs.PathLike);
      const recordData = (plan: StateCrashPlan): void => {
        if (!tracking(plan) || typeof file !== "number") return;
        const stats = fs.fstatSync(file, { bigint: true });
        plan.pending.push({
          kind: "data",
          path: target,
          device: stats.dev.toString(),
          inode: stats.ino.toString(),
        });
      };
      boundary(
        "write",
        target,
        (plan) => {
          fs.writeFileSync(file, data, options);
          recordData(plan);
        },
        (plan) => {
          const bytes = typeof data === "string"
            ? Buffer.from(data, "utf8")
            : Buffer.from(data as Uint8Array);
          const kept = Math.floor(bytes.byteLength * plan.tornPerMille / 1000);
          fs.writeFileSync(file, bytes.subarray(0, kept), options);
        },
      );
    },
    fchmodSync(descriptor, mode) {
      boundary("chmod", descriptorPaths.get(descriptor) ?? "descriptor", () => {
        fs.fchmodSync(descriptor, mode);
      });
    },
    fsyncSync(descriptor) {
      boundary("fsync", descriptorPaths.get(descriptor) ?? "descriptor", (plan) => {
        const stats = fs.fstatSync(descriptor, { bigint: true });
        if (plan.mutant === (stats.isDirectory() ? "drop-directory-fsync" : "drop-file-fsync")) return;
        fs.fsyncSync(descriptor);
        if (!tracking(plan)) return;
        if (stats.isDirectory()) {
          const path = descriptorPaths.get(descriptor);
          if (path !== undefined) settleDirectory(plan, path);
          return;
        }
        plan.pending = plan.pending.filter((effect) =>
          effect.kind !== "data"
          || effect.device !== stats.dev.toString()
          || effect.inode !== stats.ino.toString());
      });
    },
    linkSync(existingPath, newPath) {
      const target = absolute(newPath);
      boundary("link", target, (plan) => {
        fs.linkSync(existingPath, newPath);
        if (tracking(plan)) {
          plan.pending.push({ kind: "created", path: target, directories: [dirname(target)] });
        }
      });
    },
    renameSync(oldPath, newPath) {
      const from = absolute(oldPath);
      const to = absolute(newPath);
      boundary("rename", `${from} -> ${to}`, (plan) => {
        let replacedBackup: string | null = null;
        if (tracking(plan)) {
          try {
            if (fs.lstatSync(to).isFile()) replacedBackup = backup(plan, to);
          } catch {
            replacedBackup = null;
          }
        }
        fs.renameSync(oldPath, newPath);
        if (!tracking(plan)) return;
        for (const effect of plan.pending) {
          if (effect.kind === "data" && effect.path === from) effect.path = to;
        }
        plan.pending.push({
          kind: "renamed",
          from,
          to,
          replacedBackup,
          directories: [...new Set([dirname(from), dirname(to)])],
        });
      });
    },
    unlinkSync(path) {
      const target = absolute(path);
      boundary("unlink", target, (plan) => {
        const saved = tracking(plan) && fs.lstatSync(target).isFile()
          ? backup(plan, target)
          : null;
        fs.unlinkSync(path);
        if (saved !== null) {
          plan.pending.push({
            kind: "unlinked",
            path: target,
            backup: saved,
            directories: [dirname(target)],
          });
        }
      });
    },
    mkdirSync(path, options) {
      const target = absolute(path);
      return boundary("mkdir", target, (plan) => {
        const result = fs.mkdirSync(path, options);
        if (tracking(plan)) {
          plan.pending.push({
            kind: "created-directory",
            path: target,
            directories: [dirname(target)],
          });
        }
        return result;
      });
    },
    rmdirSync(path) {
      const target = absolute(path);
      boundary("rmdir", target, (plan) => {
        fs.rmdirSync(path);
        if (tracking(plan)) {
          plan.pending.push({
            kind: "removed-directory",
            path: target,
            directories: [dirname(target)],
          });
        }
      });
    },
    rmSync(path, options) {
      boundary("rm", absolute(path), () => {
        fs.rmSync(path, options);
      });
    },
  } as StatePort;
  return port;
}
