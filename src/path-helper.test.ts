import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  type BigIntStats,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

import { removePrivateDirectoryTree } from "./storage";
import { assertAsyncProperty, fc } from "./test-support";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const helperPath = join(sourceDirectory, "path-helper.ts");
const helperConfigPath = join(sourceDirectory, "state-helper.bunfig.toml");
const TEST_CHILD_SIGNAL_TIMEOUT_MS = 45_000;

type Identity = {
  readonly device: string;
  readonly inode: string;
};

function identity(stats: BigIntStats): Identity {
  return {
    device: stats.dev.toString(),
    inode: stats.ino.toString(),
  };
}

function fileExpectation(stats: BigIntStats) {
  return {
    identity: identity(stats),
    size: stats.size.toString(),
    mtimeNs: stats.mtimeNs.toString(),
    ctimeNs: stats.ctimeNs.toString(),
  };
}

function runHelper(
  root: string,
  expected: Identity,
  operation: Readonly<Record<string, unknown>>,
  environment: Readonly<Record<string, string>> = {},
) {
  return spawnSync(process.execPath, [
    "--no-env-file",
    "--no-install",
    "--no-macros",
    "--no-addons",
    `--config=${helperConfigPath}`,
    helperPath,
  ], {
    cwd: root,
    encoding: "utf8",
    env: { NODE_ENV: "test", ...environment },
    input: JSON.stringify({
      schemaVersion: 1,
      requestId: randomUUID(),
      expected,
      operation,
    }),
    maxBuffer: 1024 * 1024,
    shell: false,
    timeout: TEST_CHILD_SIGNAL_TIMEOUT_MS,
    windowsHide: true,
  });
}

const STEP_PREFIX = ".wrench-test-path-mutation-step-";
const CRITICAL_STEPS: ReadonlySet<string> = new Set(["claim-held", "claim-release"]);
const MAXIMUM_ACTOR_ADVANCES = 32;

type StepActor = {
  readonly label: string;
  readonly requestId: string;
  readonly child: ReturnType<typeof Bun.spawn>;
  step: string | null;
  exitCode: number | null;
  stderr: string;
  killed: boolean;
};

function pathMutationLockName(leaf: string): string {
  const targetSha256 = createHash("sha256")
    .update("io-path-mutation", "utf8")
    .update("\0", "utf8")
    .update(leaf, "utf8")
    .digest("hex");
  return `.io-path-mutation-${targetSha256}.lock`;
}

/** Leave the exact claim a SIGKILLed helper would leave for `leaf`. */
function writeDeadPathMutationClaim(root: string, leaf: string): void {
  // Above every platform's PID limit, so it can never name a live process.
  const deadPid = 2_147_483_647;
  expect(() => process.kill(deadPid, 0)).toThrow();
  const lockName = pathMutationLockName(leaf);
  const targetSha256 = lockName.slice(".io-path-mutation-".length, -".lock".length);
  writeFileSync(join(root, lockName), `${JSON.stringify({
    kind: "io-path-mutation-claim",
    schemaVersion: 1,
    targetSha256,
    requestId: randomUUID(),
    pid: deadPid,
  })}\n`, { mode: 0o600, flag: "wx" });
}

function spawnStepActor(
  root: string,
  expected: Identity,
  label: string,
  content: string,
): StepActor {
  const requestId = randomUUID();
  const child = Bun.spawn([
    process.execPath,
    "--no-env-file",
    "--no-install",
    "--no-macros",
    "--no-addons",
    `--config=${helperConfigPath}`,
    helperPath,
  ], {
    cwd: root,
    env: {
      NODE_ENV: "test",
      GHOSTGET_TEST_PATH_MUTATION_FAULT: "pause-at-every-step",
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  child.stdin.write(JSON.stringify({
    schemaVersion: 1,
    requestId,
    expected,
    operation: {
      kind: "write-file",
      segments: ["target.json"],
      directoryExpectations: [],
      content,
      createOnly: false,
    },
  }));
  child.stdin.end();
  return { label, requestId, child, step: "spawned", exitCode: null, stderr: "", killed: false };
}

/** Wait until the actor pauses at its next protocol step or exits. */
async function settleStepActor(root: string, actor: StepActor): Promise<void> {
  const prefix = `${STEP_PREFIX}${actor.requestId}-`;
  const deadline = performance.now() + TEST_CHILD_SIGNAL_TIMEOUT_MS;
  while (performance.now() < deadline) {
    const names = readdirSync(root).filter((name) => name.startsWith(prefix));
    if (!names.some((name) => name.endsWith("-release"))) {
      const ready = names.find((name) => name.endsWith("-ready"));
      if (ready !== undefined) {
        actor.step = ready.slice(prefix.length, -"-ready".length);
        return;
      }
      if (actor.child.exitCode !== null || actor.child.signalCode !== null) {
        actor.exitCode = await actor.child.exited;
        actor.stderr = await new Response(actor.child.stderr as ReadableStream).text();
        actor.step = null;
        return;
      }
    }
    await Bun.sleep(2);
  }
  throw new Error(`${actor.label} did not reach a path mutation step`);
}

function assertAtMostOneHolder(actors: readonly StepActor[]): void {
  const holders = actors
    .filter((actor) => actor.step !== null && CRITICAL_STEPS.has(actor.step))
    .map((actor) => `${actor.label}@${actor.step as string}`);
  if (holders.length > 1) {
    throw new Error(`path mutation claim has ${holders.length} live holders: ${holders.join(", ")}`);
  }
}

async function advanceStepActor(
  root: string,
  actors: readonly StepActor[],
  actor: StepActor,
): Promise<void> {
  if (actor.step === null) return;
  writeFileSync(
    join(root, `${STEP_PREFIX}${actor.requestId}-${actor.step}-release`),
    "release\n",
    { mode: 0o600, flag: "wx" },
  );
  await settleStepActor(root, actor);
  assertAtMostOneHolder(actors);
}

async function advanceStepActorUntil(
  root: string,
  actors: readonly StepActor[],
  actor: StepActor,
  reached: (step: string) => boolean,
): Promise<void> {
  for (let advance = 0; advance < MAXIMUM_ACTOR_ADVANCES; advance += 1) {
    if (actor.step === null || reached(actor.step)) return;
    await advanceStepActor(root, actors, actor);
  }
  throw new Error(`${actor.label} exceeded its path mutation step bound`);
}

async function killStepActor(actor: StepActor): Promise<void> {
  if (actor.step === null) return;
  actor.child.kill("SIGKILL");
  actor.exitCode = await actor.child.exited;
  actor.step = null;
  actor.killed = true;
}

async function drainStepActors(root: string, actors: readonly StepActor[]): Promise<void> {
  for (let round = 0; round < MAXIMUM_ACTOR_ADVANCES; round += 1) {
    const live = actors.filter((actor) => actor.step !== null);
    if (live.length === 0) return;
    for (const actor of live) await advanceStepActor(root, actors, actor);
  }
  throw new Error("path mutation actors did not finish within their step bound");
}

async function stopStepActors(actors: readonly StepActor[]): Promise<void> {
  for (const actor of actors) {
    if (actor.child.exitCode === null && actor.child.signalCode === null) {
      actor.child.kill("SIGKILL");
    }
    await actor.child.exited;
  }
}

function helperLeftovers(root: string): readonly string[] {
  return readdirSync(root).filter((name) =>
    name.startsWith(".io-")
    || name.startsWith(".wrench-test-")).sort();
}

describe("bound path helper traversal", () => {
  test("recovers an identity-bound recursive-removal quarantine after SIGKILL", async () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-remove-recovery-"));
    let child: ReturnType<typeof Bun.spawn> | null = null;
    try {
      const parent = join(root, "parent");
      const target = join(parent, "target");
      mkdirSync(parent, { mode: 0o755 });
      mkdirSync(target, { mode: 0o700 });
      writeFileSync(join(target, "secret.txt"), "sensitive");
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const expectedParent = identity(lstatSync(parent, { bigint: true }));
      const expectedTarget = identity(lstatSync(target, { bigint: true }));
      const request = JSON.stringify({
        schemaVersion: 1,
        requestId: randomUUID(),
        expected: expectedRoot,
        operation: {
          kind: "remove-directory-tree",
          segments: ["parent", "target"],
          directoryExpectations: [expectedParent, expectedTarget],
        },
      });
      const spawned = Bun.spawn([
        process.execPath,
        "--no-env-file",
        "--no-install",
        "--no-macros",
        "--no-addons",
        `--config=${helperConfigPath}`,
        helperPath,
      ], {
        cwd: root,
        env: {
          NODE_ENV: "test",
          GHOSTGET_TEST_REMOVE_DIRECTORY_FAULT: "pause-after-quarantine-fsync",
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      child = spawned;
      await spawned.stdin.write(request);
      await spawned.stdin.end();
      let quarantineName: string | undefined;
      const readyDeadline = performance.now() + TEST_CHILD_SIGNAL_TIMEOUT_MS;
      while (performance.now() < readyDeadline) {
        quarantineName = readdirSync(parent).find((name) =>
          name.startsWith(`.io-remove-${spawned.pid}-`));
        if (quarantineName !== undefined) break;
        await Bun.sleep(10);
      }
      expect(quarantineName).toBeDefined();
      expect(readdirSync(parent)).not.toContain("target");
      spawned.kill("SIGKILL");
      await spawned.exited;

      expect(removePrivateDirectoryTree(target, expectedTarget)).toBe(true);
      expect(readdirSync(parent)).toEqual([]);
    } finally {
      child?.kill("SIGKILL");
      if (child !== null) await child.exited;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("binds recursive removal to the directory generation as well as its inode", () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-remove-generation-"));
    try {
      const parent = join(root, "parent");
      const target = join(parent, "target");
      mkdirSync(parent, { mode: 0o700 });
      mkdirSync(target, { mode: 0o700 });
      const stats = lstatSync(target, { bigint: true });
      const expectedTarget = {
        ...identity(stats),
        birthtimeNs: stats.birthtimeNs.toString(),
      };
      const wrongGeneration = {
        ...expectedTarget,
        birthtimeNs: stats.birthtimeNs === 1n ? "2" : "1",
      };

      expect(() => removePrivateDirectoryTree(target, wrongGeneration))
        .toThrow("recursive removal target changed identity");
      expect(readdirSync(parent)).toContain("target");
      expect(removePrivateDirectoryTree(target, expectedTarget)).toBe(true);
      expect(readdirSync(parent)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("refuses an exact recursive-removal quarantine owned by a live helper", () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-remove-live-"));
    try {
      const parent = join(root, "parent");
      const target = join(parent, "target");
      mkdirSync(parent, { mode: 0o700 });
      mkdirSync(target, { mode: 0o700 });
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const expectedParent = identity(lstatSync(parent, { bigint: true }));
      const expectedTarget = identity(lstatSync(target, { bigint: true }));
      const quarantineName =
        `.io-remove-${process.pid}-11111111-1111-4111-8111-111111111111.quarantine`;
      renameSync(target, join(parent, quarantineName));

      const rejected = runHelper(root, expectedRoot, {
        kind: "remove-directory-tree",
        segments: ["parent", "target"],
        directoryExpectations: [expectedParent, expectedTarget],
      });
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain(
        "recursive removal quarantine owner is live or cannot be proven dead",
      );
      expect(readdirSync(parent)).toContain(quarantineName);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not remove a wrong-identity recursive-removal quarantine", () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-remove-wrong-"));
    try {
      const parent = join(root, "parent");
      const target = join(parent, "target");
      mkdirSync(parent, { mode: 0o700 });
      mkdirSync(target, { mode: 0o700 });
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const expectedParent = identity(lstatSync(parent, { bigint: true }));
      const expectedTarget = identity(lstatSync(target, { bigint: true }));
      const quarantineName =
        ".io-remove-2147483647-22222222-2222-4222-8222-222222222222.quarantine";
      const quarantine = join(parent, quarantineName);
      mkdirSync(quarantine, { mode: 0o700 });
      expect(identity(lstatSync(quarantine, { bigint: true }))).not.toEqual(
        expectedTarget,
      );
      rmSync(target, { recursive: true });

      const ignored = runHelper(root, expectedRoot, {
        kind: "remove-directory-tree",
        segments: ["parent", "target"],
        directoryExpectations: [expectedParent, expectedTarget],
      });
      expect(ignored.status).toBe(0);
      expect(JSON.parse(ignored.stdout)).toMatchObject({
        ok: true,
        removed: false,
      });
      expect(readdirSync(parent)).toContain(quarantineName);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("fails closed when recursive-removal recovery exceeds its scan bound", () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-remove-bound-"));
    try {
      const parent = join(root, "parent");
      const target = join(parent, "target");
      mkdirSync(parent, { mode: 0o700 });
      mkdirSync(target, { mode: 0o700 });
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const expectedParent = identity(lstatSync(parent, { bigint: true }));
      const expectedTarget = identity(lstatSync(target, { bigint: true }));
      rmSync(target, { recursive: true });
      writeFileSync(join(parent, "one"), "1");
      writeFileSync(join(parent, "two"), "2");

      const rejected = runHelper(
        root,
        expectedRoot,
        {
          kind: "remove-directory-tree",
          segments: ["parent", "target"],
          directoryExpectations: [expectedParent, expectedTarget],
        },
        { GHOSTGET_TEST_REMOVE_QUARANTINE_SCAN_MAXIMUM: "1" },
      );
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain(
        "recursive removal recovery exceeds its 1 entry bound",
      );
      expect(readdirSync(parent).sort()).toEqual(["one", "two"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("recovers only definitely orphaned atomic-write temporaries after SIGKILL", async () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-temp-recovery-"));
    let child: ReturnType<typeof Bun.spawn> | null = null;
    try {
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const request = JSON.stringify({
        schemaVersion: 1,
        requestId: randomUUID(),
        expected: expectedRoot,
        operation: {
          kind: "write-file",
          segments: ["target.txt"],
          directoryExpectations: [],
          content: "never published",
          createOnly: false,
        },
      });
      const spawned = Bun.spawn([
        process.execPath,
        "--no-env-file",
        "--no-install",
        "--no-macros",
        "--no-addons",
        `--config=${helperConfigPath}`,
        helperPath,
      ], {
        cwd: root,
        env: {
          NODE_ENV: "test",
          GHOSTGET_TEST_WRITE_TEMP_FAULT: "pause-after-temp-fsync",
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      child = spawned;
      await spawned.stdin.write(request);
      await spawned.stdin.end();
      let staleName: string | undefined;
      const readyDeadline = performance.now() + TEST_CHILD_SIGNAL_TIMEOUT_MS;
      while (performance.now() < readyDeadline) {
        staleName = readdirSync(root).find((name) =>
          name.startsWith(`.io-write-${spawned.pid}-`));
        if (staleName !== undefined) break;
        await Bun.sleep(10);
      }
      expect(staleName).toBeDefined();
      spawned.kill("SIGKILL");
      await spawned.exited;

      const liveName =
        `.io-write-${process.pid}-11111111-1111-4111-8111-111111111111.tmp`;
      writeFileSync(join(root, liveName), "live owner", { mode: 0o600 });
      const listed = runHelper(root, expectedRoot, {
        kind: "list-directory",
        segments: [],
        directoryExpectations: [],
        maximumEntries: 8,
      });
      expect(listed.status).toBe(0);
      const names = readdirSync(root);
      expect(names).not.toContain(staleName as string);
      expect(names).toContain(liveName);
      expect(names).not.toContain("target.txt");
    } finally {
      child?.kill("SIGKILL");
      if (child !== null) await child.exited;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("serializes compare-and-swap replacement through one per-leaf claim", async () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-cas-overlap-"));
    let child: ReturnType<typeof Bun.spawn> | null = null;
    try {
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const initial = "reserved\n";
      writeFileSync(join(root, "target.json"), initial, { mode: 0o600 });
      const expectedContentSha256 = createHash("sha256")
        .update(initial)
        .digest("hex");
      const request = JSON.stringify({
        schemaVersion: 1,
        requestId: randomUUID(),
        expected: expectedRoot,
        operation: {
          kind: "write-file",
          segments: ["target.json"],
          directoryExpectations: [],
          content: "winner\n",
          createOnly: false,
          expectedContentSha256,
          maximumExpectedContentBytes: 4_096,
        },
      });
      const spawned = Bun.spawn([
        process.execPath,
        "--no-env-file",
        "--no-install",
        "--no-macros",
        "--no-addons",
        `--config=${helperConfigPath}`,
        helperPath,
      ], {
        cwd: root,
        env: {
          NODE_ENV: "test",
          GHOSTGET_TEST_PATH_MUTATION_FAULT: "pause-after-claim",
        },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      child = spawned;
      await spawned.stdin.write(request);
      await spawned.stdin.end();

      let readyName: string | undefined;
      const readyDeadline = performance.now() + TEST_CHILD_SIGNAL_TIMEOUT_MS;
      while (performance.now() < readyDeadline) {
        readyName = readdirSync(root).find((name) =>
          name.startsWith(".wrench-test-path-mutation-")
          && name.endsWith("-ready"));
        if (readyName !== undefined) break;
        await Bun.sleep(10);
      }
      expect(readyName).toBeDefined();

      const competing = runHelper(root, expectedRoot, {
        kind: "write-file",
        segments: ["target.json"],
        directoryExpectations: [],
        content: "loser\n",
        createOnly: false,
        expectedContentSha256,
        maximumExpectedContentBytes: 4_096,
      });
      expect(competing.status).not.toBe(0);
      expect(competing.stderr).toContain(
        "file content no longer matches the expected hash",
      );
      expect(readFileSync(join(root, "target.json"), "utf8")).toBe(initial);

      const releaseName = (readyName as string).replace(/-ready$/u, "-release");
      writeFileSync(join(root, releaseName), "release\n", { mode: 0o600 });
      expect(await spawned.exited).toBe(0);
      expect(readFileSync(join(root, "target.json"), "utf8")).toBe("winner\n");
      expect(readdirSync(root).filter((name) =>
        name.startsWith(".io-path-mutation-")
        || name.startsWith(".wrench-test-path-mutation-"))).toEqual([]);
    } finally {
      child?.kill("SIGKILL");
      if (child !== null) await child.exited;
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps one holder when a stalled reaper resumes after another reaper reclaimed the dead claim", async () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-reaper-race-"));
    const actors: StepActor[] = [];
    try {
      writeFileSync(join(root, "target.json"), "initial\n", { mode: 0o600 });
      writeDeadPathMutationClaim(root, "target.json");
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const stalled = spawnStepActor(root, expectedRoot, "stalled reaper", "stalled\n");
      const holder = spawnStepActor(root, expectedRoot, "holder", "holder\n");
      const late = spawnStepActor(root, expectedRoot, "late writer", "late\n");
      actors.push(stalled, holder, late);
      for (const actor of actors) await settleStepActor(root, actor);
      const holdingOrDone = (step: string) => CRITICAL_STEPS.has(step);

      // The stalled reaper has proved the claim owner dead and is about to
      // move the lock name into its quarantine.
      await advanceStepActorUntil(root, actors, stalled, (step) => step === "claim-quarantine");
      await advanceStepActorUntil(root, actors, holder, holdingOrDone);
      await advanceStepActorUntil(root, actors, stalled, holdingOrDone);
      await advanceStepActorUntil(root, actors, late, holdingOrDone);
      await drainStepActors(root, actors);

      expect(actors.map((actor) => [actor.label, actor.exitCode])).toEqual([
        ["stalled reaper", 0],
        ["holder", 1],
        ["late writer", 1],
      ]);
      expect(holder.stderr).toContain("file mutation is already active");
      expect(late.stderr).toContain("file mutation is already active");
      expect(readFileSync(join(root, "target.json"), "utf8")).toBe("stalled\n");
      expect(helperLeftovers(root)).toEqual([]);
    } finally {
      await stopStepActors(actors);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("elects a successor when the reaper dies before moving the dead claim", async () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-reaper-successor-"));
    const actors: StepActor[] = [];
    try {
      writeFileSync(join(root, "target.json"), "initial\n", { mode: 0o600 });
      writeDeadPathMutationClaim(root, "target.json");
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const doomed = spawnStepActor(root, expectedRoot, "doomed reaper", "doomed\n");
      const successor = spawnStepActor(root, expectedRoot, "successor", "successor\n");
      actors.push(doomed, successor);
      for (const actor of actors) await settleStepActor(root, actor);

      await advanceStepActorUntil(root, actors, doomed, (step) => step === "claim-quarantine");
      await killStepActor(doomed);
      await advanceStepActorUntil(root, actors, successor, (step) => CRITICAL_STEPS.has(step));
      expect(successor.step).toBe("claim-held");
      await drainStepActors(root, actors);

      expect(successor.exitCode).toBe(0);
      expect(readFileSync(join(root, "target.json"), "utf8")).toBe("successor\n");
      expect(helperLeftovers(root).filter((name) =>
        name.startsWith(".io-path-mutation-"))).toEqual([]);
    } finally {
      await stopStepActors(actors);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("admits at most one live claim holder across bounded reaper schedules", async () => {
    await assertAsyncProperty(fc.asyncProperty(
      fc.oneof(
        { weight: 3, arbitrary: fc.constant(true) },
        { weight: 1, arbitrary: fc.constant(false) },
      ),
      fc.array(
        fc.record({
          actor: fc.integer({ min: 0, max: 2 }),
          crash: fc.oneof(
            { weight: 24, arbitrary: fc.constant(false) },
            { weight: 1, arbitrary: fc.constant(true) },
          ),
        }),
        { minLength: 4, maxLength: 24 },
      ),
      async (deadClaim, schedule) => {
        const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-reaper-schedule-"));
        const actors: StepActor[] = [];
        try {
          writeFileSync(join(root, "target.json"), "initial\n", { mode: 0o600 });
          if (deadClaim) writeDeadPathMutationClaim(root, "target.json");
          const expectedRoot = identity(lstatSync(root, { bigint: true }));
          for (const label of ["a", "b", "c"]) {
            actors.push(spawnStepActor(root, expectedRoot, label, `${label}\n`));
          }
          // Spawned with the others to save a serial spawn; it waits at its
          // first step until every scheduled actor has finished.
          const next = spawnStepActor(root, expectedRoot, "next", "next\n");
          actors.push(next);
          const scheduled = actors.slice(0, 3);
          for (const actor of actors) await settleStepActor(root, actor);
          for (const { actor: index, crash } of schedule) {
            const actor = scheduled[index] as StepActor;
            if (crash) await killStepActor(actor);
            else await advanceStepActor(root, actors, actor);
          }
          await drainStepActors(root, scheduled);

          // A helper killed inside its claim may already have renamed its
          // content into place.
          const possiblyWritten = scheduled
            .filter((actor) => actor.exitCode === 0 || actor.killed)
            .map((actor) => `${actor.label}\n`);
          expect([...possiblyWritten, "initial\n"]).toContain(
            readFileSync(join(root, "target.json"), "utf8"),
          );
          // Progress after every schedule: dead claims and dead reapers never
          // wedge the leaf for the next writer.
          await drainStepActors(root, actors);
          expect(next.stderr).toBe("");
          expect(next.exitCode).toBe(0);
          expect(readFileSync(join(root, "target.json"), "utf8")).toBe("next\n");
          if (actors.every((actor) => !actor.killed)) {
            expect(helperLeftovers(root)).toEqual([]);
          }
        } finally {
          await stopStepActors(actors);
          rmSync(root, { recursive: true, force: true });
        }
      },
    ), {
      // Each run spawns four helper processes; spawn cost dominates.
      numRuns: 8,
      interruptAfterTimeLimit: 120_000,
    });
  });

  test("lists one inode-bound directory and rejects a replaced ancestor", () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-list-"));
    try {
      const nested = join(root, "nested");
      mkdirSync(nested);
      writeFileSync(join(nested, "one.txt"), "one");
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const expectedNested = identity(lstatSync(nested, { bigint: true }));
      const operation = {
        kind: "list-directory",
        segments: ["nested"],
        directoryExpectations: [expectedNested],
        maximumEntries: 8,
      } as const;

      const listed = runHelper(root, expectedRoot, operation);
      expect(listed.status).toBe(0);
      expect(JSON.parse(listed.stdout)).toMatchObject({
        ok: true,
        identity: expectedRoot,
        targetIdentity: expectedNested,
        entries: [{
          name: "one.txt",
          kind: "file",
        }],
      });

      renameSync(nested, join(root, "original"));
      mkdirSync(nested);
      writeFileSync(join(nested, "two.txt"), "two");
      const rejected = runHelper(root, expectedRoot, operation);
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain(
        "directory path no longer matches its validated identity",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("stops before returning more entries than requested", () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-bound-"));
    try {
      writeFileSync(join(root, "one.txt"), "one");
      writeFileSync(join(root, "two.txt"), "two");
      const rejected = runHelper(
        root,
        identity(lstatSync(root, { bigint: true })),
        {
          kind: "list-directory",
          segments: [],
          directoryExpectations: [],
          maximumEntries: 1,
        },
      );
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain("directory exceeds its 1 entry bound");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a regular leaf replaced after its identity was captured", () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-leaf-"));
    try {
      const target = join(root, "target.txt");
      writeFileSync(target, "original");
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const expectedFile = fileExpectation(lstatSync(target, { bigint: true }));
      const operation = {
        kind: "read-file",
        segments: ["target.txt"],
        directoryExpectations: [],
        maximumBytes: 1024,
        fileExpectation: expectedFile,
      } as const;
      const read = runHelper(root, expectedRoot, operation);
      expect(read.status).toBe(0);
      expect(JSON.parse(read.stdout)).toMatchObject({
        ok: true,
        identity: expectedRoot,
        contentBase64: Buffer.from("original").toString("base64"),
      });

      renameSync(target, join(root, "original.txt"));
      writeFileSync(target, "replacement");
      const rejected = runHelper(root, expectedRoot, operation);
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain(
        "read target no longer matches its validated file identity",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("snapshots prefix-colliding paths and batch-reads bound leaves", () => {
    const root = mkdtempSync(join(tmpdir(), "wrench-path-helper-tree-"));
    try {
      const nested = join(root, "a");
      const nestedFile = join(nested, "x.txt");
      const rootFile = join(root, "a.txt");
      mkdirSync(nested);
      writeFileSync(nestedFile, "nested");
      writeFileSync(rootFile, "root");
      const expectedRoot = identity(lstatSync(root, { bigint: true }));
      const expectedNested = identity(lstatSync(nested, { bigint: true }));

      const snapshotted = runHelper(root, expectedRoot, {
        kind: "snapshot-tree",
        maximumEntries: 8,
        maximumDirectories: 2,
        maximumDepth: 2,
        maximumPathBytes: 128,
      });
      expect(snapshotted.status).toBe(0);
      const snapshot = JSON.parse(snapshotted.stdout) as {
        readonly treeEntries: readonly { readonly path: string }[];
      };
      expect(snapshot.treeEntries.map((entry) => entry.path)).toEqual([
        "a",
        "a.txt",
        "a/x.txt",
      ]);

      const read = runHelper(root, expectedRoot, {
        kind: "batch-read-files",
        files: [
          {
            segments: ["a", "x.txt"],
            directoryExpectations: [expectedNested],
            maximumBytes: 16,
            fileExpectation: fileExpectation(
              lstatSync(nestedFile, { bigint: true }),
            ),
          },
          {
            segments: ["a.txt"],
            directoryExpectations: [],
            maximumBytes: 16,
            fileExpectation: fileExpectation(
              lstatSync(rootFile, { bigint: true }),
            ),
          },
        ],
        maximumTotalBytes: 16,
      });
      expect(read.status).toBe(0);
      expect(JSON.parse(read.stdout)).toMatchObject({
        ok: true,
        identity: expectedRoot,
        fileContentsBase64: [
          Buffer.from("nested").toString("base64"),
          Buffer.from("root").toString("base64"),
        ],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
