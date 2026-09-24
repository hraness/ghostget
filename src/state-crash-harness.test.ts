import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAuth, saveAuth } from "./auth";
import type { GhostgetManifest } from "./model";
import type { ProviderExecution } from "./provider";
import { providerPluginRegistry } from "./provider-plugins";
import { listRunJournalSnapshots } from "./run-journal";
import {
  confirmInvocation,
  createInvocationPlan,
  prepareInvocation,
  repairInterruptedConfirmationClaims,
  repairInterruptedRunJournals,
  saveInvocationPlan,
} from "./runtime";
import { readSessionSecretSnapshot, writeSessionSecret } from "./session-secrets";
import type { CrashHarnessRequest } from "./state-crash-harness.fixture";
import {
  initialStateCrashPlan,
  readStateCrashPlan,
  STATE_CRASH_MODES,
  type StateCrashMode,
  type StateCrashMutant,
  type StateCrashPlan,
} from "./state-crash-port.test-support";
import { installManifest, readJsonFile, writePrivateJson } from "./storage";
import { assertAsyncProperty, fc, type AsyncCommand } from "./test-support";

// Laws, checked after every injected crash. A crash is a SIGKILL of the
// runtime process and its state helper at one durable boundary (a file
// create, data write, chmod, fsync, link, rename, unlink, mkdir, or rmdir):
// just before it, just after it, inside a data write (torn), or just after it
// with every effect no fsync has made durable rolled back (power loss).
//
// Confirmed writes
//   S  A provider request crosses at most once per intent.
//   R1 A crossing is never forgotten: the next confirmation of that intent
//      does not cross again.
//   R2 Repair converges: no issues, no invalid journal, no non-terminal
//      journal, no live claim, and every JSON file under the state root parses.
//   P  A crash that left no durable record of a started dispatch leaves the
//      intent open: the next confirmation crosses.
// Session secrets
//   A read never throws. After a crashed write it returns the old value, the
//   new value, or nothing; after a crashed removal, the old value or nothing;
//   after a completed operation, exactly its result. A completed removal is
//   never undone, and the next write succeeds.
// Private path files
//   The file holds the old or the new value, never a torn one, and the next
//   write succeeds.
//
// Assumptions: one runtime process mutates the state at a time; the provider
// is outside the machine, so its record of a request survives power loss;
// directory tree removals (rmSync) are durable when they return.

const FIXTURE = join(import.meta.dir, "state-crash-harness.fixture.ts");
const ACCOUNT = "x-official";
const SESSION_NAMESPACE = "bluesky";
const SESSION_AUTH_ID = "bluesky-crash";
const SESSION_AUTH_HASH = "5".repeat(64);
const FIXTURE_DEADLINE_MS = 120_000;

/** CI keeps each property small; raise these for a deeper local run. */
function boundedCount(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^[1-9]\d{0,4}$/u.test(raw)) throw new Error(`${name} must be 1 to 99999`);
  return Number(raw);
}
const CONFIRM_RUNS = boundedCount("GHOSTGET_CRASH_HARNESS_CONFIRM_RUNS", 1);
const STATE_RUNS = boundedCount("GHOSTGET_CRASH_HARNESS_STATE_RUNS", 2);
const MAX_COMMANDS = boundedCount("GHOSTGET_CRASH_HARNESS_COMMANDS", 3);
// A crash run spawns one runtime process and dozens of helpers, so the
// shared ten-second interrupt would cut every property short. A deeper local
// run also raises the runner's --timeout to match.
const PROPERTY_TIME_LIMIT_MS = boundedCount("GHOSTGET_CRASH_HARNESS_SECONDS", 170) * 1_000;

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

type Environment = Readonly<Record<string, string | undefined>>;

type Workspace = {
  readonly directory: string;
  readonly environment: Environment;
  runs: number;
};

type FixtureRun = {
  readonly plan: StateCrashPlan;
  readonly result:
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly message: string }
    | null;
};

function workspace(): Workspace {
  const directory = mkdtempSync(join(tmpdir(), "ghostget-crash-harness-"));
  chmodSync(directory, 0o700);
  directories.push(directory);
  return {
    directory,
    environment: { GHOSTGET_STATE_HOME: join(directory, "state") },
    runs: 0,
  };
}

type Crash = {
  readonly mode: StateCrashMode;
  /** 1-based boundary; past the last boundary the operation completes. */
  readonly target: number;
  readonly tornPerMille?: number;
  readonly mutant?: StateCrashMutant;
};

const NO_CRASH: Crash = { mode: "before", target: 0 };

/** Run one operation in a fresh runtime process that the crash port may kill. */
async function runFixture(
  space: Workspace,
  request: CrashHarnessRequest,
  crash: Crash,
): Promise<FixtureRun> {
  space.runs += 1;
  const runDirectory = join(space.directory, `crash-${String(space.runs)}`);
  const backups = join(runDirectory, "backups");
  mkdirSync(backups, { recursive: true, mode: 0o700 });
  const planPath = join(runDirectory, "plan.json");
  writeFileSync(
    planPath,
    `${JSON.stringify(initialStateCrashPlan(
      crash.target,
      crash.mode,
      backups,
      crash.tornPerMille ?? 500,
      crash.mutant ?? null,
    ))}\n`,
    { mode: 0o600 },
  );
  const requestPath = join(runDirectory, "request.json");
  writeFileSync(requestPath, JSON.stringify(request), { mode: 0o600 });
  const child = Bun.spawn([process.execPath, FIXTURE], {
    cwd: import.meta.dir,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? space.directory,
      TMPDIR: tmpdir(),
      NODE_ENV: "test",
      GHOSTGET_TEST_STATE_CRASH_PLAN: planPath,
    },
    stdin: Bun.file(requestPath),
    stdout: "pipe",
    stderr: "pipe",
  });
  const watchdog = setTimeout(() => child.kill("SIGKILL"), FIXTURE_DEADLINE_MS);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(watchdog);
  const plan = readStateCrashPlan({ readFileSync }, planPath);
  if (plan.fired !== null) {
    expect(child.signalCode).toBe("SIGKILL");
    expect(plan.undoError).toBeNull();
    return { plan, result: null };
  }
  if (exitCode !== 0) {
    throw new Error(`crash fixture exited ${String(exitCode)} without a crash: ${stderr.slice(-4000)}`);
  }
  return { plan, result: JSON.parse(stdout) as FixtureRun["result"] };
}

/** How many boundaries a clean run of one operation passes, by crash mode. */
async function calibrate(
  space: Workspace,
  request: CrashHarnessRequest,
): Promise<{ readonly all: number; readonly writes: number; readonly result: FixtureRun["result"] }> {
  const run = await runFixture(space, request, NO_CRASH);
  return { all: run.plan.seen, writes: run.plan.kinds.write ?? 0, result: run.result };
}

function crashTarget(
  counts: { readonly all: number; readonly writes: number },
  mode: StateCrashMode,
  fraction: number,
): number {
  const total = mode === "torn" ? counts.writes : counts.all;
  return Math.min(total, 1 + Math.floor(fraction * total));
}

const crashArbitrary = fc.record({
  mode: fc.constantFrom(...STATE_CRASH_MODES),
  fraction: fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
  tornPerMille: fc.integer({ min: 0, max: 999 }),
});

type CrashChoice = { readonly mode: StateCrashMode; readonly fraction: number; readonly tornPerMille: number };

function choose(
  choice: CrashChoice,
  counts: { readonly all: number; readonly writes: number },
): Crash {
  return {
    mode: choice.mode,
    target: crashTarget(counts, choice.mode, choice.fraction),
    tornPerMille: choice.tornPerMille,
  };
}

function stateJsonFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
    }
  };
  visit(root);
  return files;
}

/** R2: recovery after a crash converges to a clean, parseable state. */
function recoverAndCheck(space: Workspace): void {
  const claims = repairInterruptedConfirmationClaims(space.environment);
  expect(claims.invalid).toBe(0);
  expect(claims.active).toBe(0);
  const journals = repairInterruptedRunJournals(space.environment, new Date());
  expect(journals.issues).toEqual([]);
  expect(journals.invalid).toBe(0);
  for (const entry of listRunJournalSnapshots(space.environment)) {
    if ("invalid" in entry) throw new Error(`run journal ${entry.runId} is invalid after repair`);
    expect(entry.journal.phase).toBe("terminal");
  }
  for (const path of stateJsonFiles(space.environment.GHOSTGET_STATE_HOME ?? "")) {
    const text = readFileSync(path, "utf8");
    try {
      JSON.parse(text);
    } catch {
      throw new Error(`state file ${path} is torn after recovery (${String(text.length)} bytes)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Confirmed writes: dispatch, journal, fence, repair, and reconciliation.

type Outcome = "succeeded" | "indeterminate" | "failed";

function installWriteTarget(space: Workspace): void {
  const manifest = JSON.parse(readFileSync(
    join(import.meta.dir, "assets", "adapters", "x", "wrench-adapter.json"),
    "utf8",
  )) as GhostgetManifest;
  installManifest(manifest, {
    force: false,
    environment: space.environment,
    registry: providerPluginRegistry,
  });
  saveAuth(createAuth(ACCOUNT, {
    oauthProvider: "x",
    tokenFile: join(space.directory, "x-token.json"),
    scopes: ["tweet.read", "tweet.write", "users.read"],
    subject: "12345",
  }), space.environment);
}

function savedPlan(space: Workspace, body: string): string {
  const stored = createInvocationPlan(prepareInvocation(
    "x",
    "posts.publish",
    { body },
    ACCOUNT,
    space.environment,
  ));
  saveInvocationPlan(stored, space.environment);
  return stored.digest;
}

function crossings(effectsLog: string): number {
  if (!existsSync(effectsLog)) return 0;
  return readFileSync(effectsLog, "utf8").split("\n").filter((line) => line !== "").length;
}

function providerResult(outcome: Outcome): ProviderExecution {
  const started = outcome === "failed" ? 0 : 1;
  return {
    status: outcome,
    output: outcome === "failed" ? null : { observed: true },
    finalUrl: "https://example.com/crash-harness",
    dispatchStarted: started === 1,
    dispatch: { planned: 1, started, verified: outcome === "succeeded" ? 1 : 0 },
    ...(outcome === "succeeded" ? {} : { error: "synthetic crash-harness outcome" }),
  };
}

/** A clean confirmation in this process, recording any crossing in the same log. */
async function probeConfirm(space: Workspace, body: string, effectsLog: string): Promise<void> {
  const digest = savedPlan(space, body);
  try {
    await confirmInvocation(digest, {
      headed: false,
      environment: space.environment,
      executeProvider: async (_manifest, _recipe, _input, _auth, options) => {
        await options?.beforeDispatch?.({
          id: "posts-publish",
          index: 1,
          progress: { planned: 1, started: 0, verified: 0 },
        });
        writeFileSync(effectsLog, "crossed by probe\n", { flag: "a", mode: 0o600 });
        await options?.afterDispatchVerified?.({
          id: "posts-publish",
          index: 1,
          progress: { planned: 1, started: 1, verified: 1 },
        });
        return providerResult("succeeded");
      },
    });
  } catch {
    // A refusal is the fence closing; the crossing count is the evidence.
  }
}

/** Whether a journal of this plan durably records that its dispatch started. */
function durablyStarted(space: Workspace, digest: string): boolean {
  return listRunJournalSnapshots(space.environment).some((entry) =>
    !("invalid" in entry)
    && entry.journal.planDigest === digest
    && entry.journal.dispatch.started > 0);
}

type Intent = {
  readonly body: string;
  readonly effectsLog: string;
  readonly digests: string[];
  crossed: number;
};

type ConfirmModel = { intents: Intent[] };

type ConfirmReal = {
  readonly space: Workspace;
  readonly counts: { readonly all: number; readonly writes: number };
};

/**
 * Confirm a new intent under a crash, optionally crash the repair that
 * follows, recover, then probe the fence.
 */
class CrashConfirmNew implements AsyncCommand<ConfirmModel, ConfirmReal> {
  constructor(
    readonly outcome: Outcome,
    readonly choice: CrashChoice,
    readonly repairChoice: CrashChoice | null = null,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: ConfirmModel, real: ConfirmReal): Promise<void> {
    const index = model.intents.length;
    const intent: Intent = {
      body: `crash harness intent ${String(index)}`,
      effectsLog: join(real.space.directory, `provider-effects-${String(index)}.log`),
      digests: [],
      crossed: 0,
    };
    model.intents.push(intent);
    const digest = savedPlan(real.space, intent.body);
    intent.digests.push(digest);
    await runFixture(real.space, {
      scenario: "confirm",
      environment: real.space.environment,
      digest,
      now: new Date().toISOString(),
      outcome: this.outcome,
      effectsLog: intent.effectsLog,
    }, choose(this.choice, real.counts));
    if (this.repairChoice !== null) {
      const repair: CrashHarnessRequest = {
        scenario: "repair",
        environment: real.space.environment,
        now: new Date().toISOString(),
      };
      const counts = await calibrateWithoutEffect(real.space, repair);
      await runFixture(real.space, repair, choose(this.repairChoice, counts));
    }
    recoverAndCheck(real.space);
    const crashed = crossings(intent.effectsLog);
    expect(crashed).toBeLessThanOrEqual(1);
    const started = durablyStarted(real.space, digest);
    // R1: a crossing always leaves a durable started dispatch behind.
    if (crashed === 1) expect(started).toBe(true);
    await probeConfirm(real.space, intent.body, intent.effectsLog);
    const probed = crossings(intent.effectsLog);
    // S and R1: a crossing is never repeated.
    if (crashed === 1) expect(probed).toBe(1);
    // P: without a durable start, the intent stays open.
    if (crashed === 0 && !started) expect(probed).toBe(1);
    // S: a durable start that may have reached the provider keeps the fence closed.
    if (crashed === 0 && started) expect(probed).toBe(0);
    intent.crossed = probed;
    recoverAndCheck(real.space);
  }
  toString(): string {
    return `CrashConfirmNew(${this.outcome}, ${JSON.stringify(this.choice)}, ${JSON.stringify(this.repairChoice)})`;
  }
}

/** Confirm an earlier intent again under a crash; its fence must stay closed. */
class CrashConfirmAgain implements AsyncCommand<ConfirmModel, ConfirmReal> {
  constructor(readonly pick: number, readonly outcome: Outcome, readonly choice: CrashChoice) {}
  check(model: Readonly<ConfirmModel>): boolean {
    return model.intents.length > 0;
  }
  async run(model: ConfirmModel, real: ConfirmReal): Promise<void> {
    const intent = model.intents[this.pick % model.intents.length]!;
    const digest = savedPlan(real.space, intent.body);
    intent.digests.push(digest);
    await runFixture(real.space, {
      scenario: "confirm",
      environment: real.space.environment,
      digest,
      now: new Date().toISOString(),
      outcome: this.outcome,
      effectsLog: intent.effectsLog,
    }, choose(this.choice, real.counts));
    recoverAndCheck(real.space);
    expect(crossings(intent.effectsLog)).toBe(intent.crossed);
  }
  toString(): string {
    return `CrashConfirmAgain(${String(this.pick)}, ${this.outcome}, ${JSON.stringify(this.choice)})`;
  }
}

/** Crash reconciliation of an unsettled run; the fence never reopens. */
class CrashReconcile implements AsyncCommand<ConfirmModel, ConfirmReal> {
  constructor(readonly choice: CrashChoice) {}
  check(model: Readonly<ConfirmModel>): boolean {
    return model.intents.length > 0;
  }
  async run(model: ConfirmModel, real: ConfirmReal): Promise<void> {
    const unsettled = listRunJournalSnapshots(real.space.environment).flatMap((entry) =>
      "invalid" in entry
        || entry.journal.phase !== "terminal"
        || (entry.journal.status !== "indeterminate" && entry.journal.status !== "partial")
        || entry.journal.recoveryState === "released"
        ? []
        : [entry.journal]);
    const journal = unsettled[0];
    if (journal === undefined) return;
    const intent = model.intents.find((candidate) => candidate.digests.includes(journal.planDigest));
    if (intent === undefined) throw new Error("unsettled run has no modeled intent");
    const request: CrashHarnessRequest = {
      scenario: "reconcile",
      environment: real.space.environment,
      runId: journal.runId,
      now: new Date().toISOString(),
    };
    const counts = await calibrateWithoutEffect(real.space, request);
    await runFixture(real.space, request, choose(this.choice, counts));
    recoverAndCheck(real.space);
    const retried = await runFixture(real.space, request, NO_CRASH);
    expect(retried.result).toEqual({ ok: true, value: "journal-released" });
    recoverAndCheck(real.space);
    await probeConfirm(real.space, intent.body, intent.effectsLog);
    expect(crossings(intent.effectsLog)).toBe(intent.crossed);
  }
  toString(): string {
    return `CrashReconcile(${JSON.stringify(this.choice)})`;
  }
}

/**
 * Count a reconciliation's boundaries without releasing the run: a copy of
 * the state root runs it, so the crash run still has work to crash in.
 */
async function calibrateWithoutEffect(
  space: Workspace,
  request: CrashHarnessRequest & { readonly environment: Environment },
): Promise<{ readonly all: number; readonly writes: number }> {
  const copy = join(space.directory, `calibration-${String(space.runs + 1)}`);
  const source = space.environment.GHOSTGET_STATE_HOME ?? "";
  if (existsSync(source)) {
    const copied = Bun.spawnSync(["cp", "-Rp", source, copy]);
    if (copied.exitCode !== 0) throw new Error("could not copy the state root for calibration");
  }
  const counts = await calibrate(space, {
    ...request,
    environment: { GHOSTGET_STATE_HOME: copy },
  } as CrashHarnessRequest);
  return counts;
}

const outcomeArbitrary = fc.constantFrom<Outcome>("succeeded", "indeterminate", "failed");

function confirmCommands(mode: StateCrashMode) {
  const choice = crashArbitrary.map((value): CrashChoice => ({ ...value, mode }));
  return fc.commands([
    fc.tuple(outcomeArbitrary, choice, fc.option(crashArbitrary, { nil: null }))
      .map(([outcome, crash, repair]) => new CrashConfirmNew(outcome, crash, repair)),
    fc.tuple(fc.nat(), outcomeArbitrary, choice)
      .map(([pick, outcome, crash]) => new CrashConfirmAgain(pick, outcome, crash)),
    choice.map((crash) => new CrashReconcile(crash)),
  ], { maxCommands: MAX_COMMANDS });
}

async function confirmBaseline(space: Workspace): Promise<{ readonly all: number; readonly writes: number }> {
  installWriteTarget(space);
  const digest = savedPlan(space, "crash harness calibration");
  const counts = await calibrate(space, {
    scenario: "confirm",
    environment: space.environment,
    digest,
    now: new Date().toISOString(),
    outcome: "succeeded",
    effectsLog: join(space.directory, "provider-effects-calibration.log"),
  });
  expect(counts.result).toMatchObject({ ok: true });
  return counts;
}

/**
 * A fresh installed workspace. Every schedule starts by confirming a new
 * intent under a crash, so no generated schedule is empty of crashes.
 */
async function confirmSetup(mode: StateCrashMode): Promise<{
  readonly setup: () => { readonly model: ConfirmModel; readonly real: ConfirmReal };
  readonly first: AsyncCommand<ConfirmModel, ConfirmReal>;
}> {
  const space = workspace();
  const counts = await confirmBaseline(space);
  return {
    setup: () => ({ model: { intents: [] }, real: { space, counts } }),
    first: new CrashConfirmNew("indeterminate", { mode, fraction: 0.5, tornPerMille: 500 }),
  };
}

const CONFIRM_PROPERTY = { numRuns: CONFIRM_RUNS, interruptAfterTimeLimit: PROPERTY_TIME_LIMIT_MS };

describe("crash-injected confirmed writes", () => {
  test("a crash just before a durable boundary never repeats or forgets a crossing", async () => {
    await assertAsyncProperty(fc.asyncProperty(confirmCommands("before"), async (commands) => {
      const { setup, first } = await confirmSetup("before");
      await fc.asyncModelRun(setup, [first, ...commands]);
    }), CONFIRM_PROPERTY);
  });

  test("a crash just after a durable boundary never repeats or forgets a crossing", async () => {
    await assertAsyncProperty(fc.asyncProperty(confirmCommands("after"), async (commands) => {
      const { setup, first } = await confirmSetup("after");
      await fc.asyncModelRun(setup, [first, ...commands]);
    }), CONFIRM_PROPERTY);
  });

  test("a torn data write never repeats or forgets a crossing", async () => {
    await assertAsyncProperty(fc.asyncProperty(confirmCommands("torn"), async (commands) => {
      const { setup, first } = await confirmSetup("torn");
      await fc.asyncModelRun(setup, [first, ...commands]);
    }), CONFIRM_PROPERTY);
  });

  test("power loss at a durable boundary never repeats or forgets a crossing", async () => {
    await assertAsyncProperty(fc.asyncProperty(confirmCommands("power-loss"), async (commands) => {
      const { setup, first } = await confirmSetup("power-loss");
      await fc.asyncModelRun(setup, [first, ...commands]);
    }), CONFIRM_PROPERTY);
  });
});

// ---------------------------------------------------------------------------
// Session secrets.

type SessionModel = { value: unknown };
type SessionReal = { readonly space: Workspace };

function readSession(space: Workspace): unknown {
  return readSessionSecretSnapshot(
    SESSION_NAMESPACE,
    SESSION_AUTH_ID,
    SESSION_AUTH_HASH,
    space.environment,
  ).value;
}

function oneOf(actual: unknown, allowed: readonly unknown[]): void {
  expect(allowed.some((value) => Bun.deepEquals(value, actual))).toBe(true);
}

async function sessionOperation(
  real: SessionReal,
  request: CrashHarnessRequest,
  choice: CrashChoice,
): Promise<FixtureRun> {
  const counts = await calibrateWithoutEffect(
    real.space,
    request as CrashHarnessRequest & { readonly environment: Environment },
  );
  return await runFixture(real.space, request, choose(choice, counts));
}

class SessionWrite implements AsyncCommand<SessionModel, SessionReal> {
  constructor(readonly token: number, readonly compareAndSwap: boolean, readonly choice: CrashChoice) {}
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, real: SessionReal): Promise<void> {
    const value = { token: `session-${String(this.token)}` };
    const run = await sessionOperation(real, {
      scenario: "session-write",
      environment: real.space.environment,
      authHash: SESSION_AUTH_HASH,
      value,
      compareAndSwap: this.compareAndSwap,
    }, this.choice);
    const observed = readSession(real.space);
    if (run.result === null) {
      oneOf(observed, [model.value, value, null]);
    } else {
      expect(run.result).toMatchObject({ ok: true, value: { written: true } });
      expect(observed).toEqual(value);
    }
    expect(readSession(real.space)).toEqual(observed);
    model.value = observed;
  }
  toString(): string {
    return `SessionWrite(${String(this.token)}, ${String(this.compareAndSwap)}, ${JSON.stringify(this.choice)})`;
  }
}

class SessionRemove implements AsyncCommand<SessionModel, SessionReal> {
  constructor(readonly choice: CrashChoice) {}
  check(): boolean {
    return true;
  }
  async run(model: SessionModel, real: SessionReal): Promise<void> {
    const run = await sessionOperation(real, {
      scenario: "session-remove",
      environment: real.space.environment,
    }, this.choice);
    const observed = readSession(real.space);
    if (run.result === null) oneOf(observed, [model.value, null]);
    else {
      expect(run.result.ok).toBe(true);
      expect(observed).toBeNull();
    }
    model.value = observed;
  }
  toString(): string {
    return `SessionRemove(${JSON.stringify(this.choice)})`;
  }
}

describe("crash-injected session secrets", () => {
  test("a crash at any durable boundary leaves the old value, the new value, or nothing", async () => {
    await assertAsyncProperty(
      fc.asyncProperty(
        fc.commands([
          fc.tuple(fc.nat({ max: 999 }), fc.boolean(), crashArbitrary)
            .map(([token, cas, crash]) => new SessionWrite(token, cas, crash)),
          crashArbitrary.map((crash) => new SessionRemove(crash)),
        ], { maxCommands: MAX_COMMANDS + 1 }),
        async (commands) => {
          const space = workspace();
          await fc.asyncModelRun(
            () => ({ model: { value: null }, real: { space } }),
            commands,
          );
          // Recovery completes: the next write and read succeed.
          writeSessionSecret(
            SESSION_NAMESPACE,
            SESSION_AUTH_ID,
            SESSION_AUTH_HASH,
            { token: "final" },
            space.environment,
          );
          expect(readSession(space)).toEqual({ token: "final" });
        },
      ),
      { numRuns: STATE_RUNS, interruptAfterTimeLimit: PROPERTY_TIME_LIMIT_MS },
    );
  });
});

// ---------------------------------------------------------------------------
// Private files through the path helper.

type PathModel = { value: unknown };
type PathReal = { readonly space: Workspace; readonly path: string };

class PathWrite implements AsyncCommand<PathModel, PathReal> {
  constructor(
    readonly token: number,
    readonly kind: "replace" | "compare-and-swap" | "create-only",
    readonly choice: CrashChoice,
  ) {}
  check(): boolean {
    return true;
  }
  async run(model: PathModel, real: PathReal): Promise<void> {
    const value = { token: `file-${String(this.token)}` };
    const current = existsSync(real.path) ? readFileSync(real.path, "utf8") : null;
    const expected = this.kind === "compare-and-swap" && current !== null
      ? new Bun.CryptoHasher("sha256").update(current).digest("hex")
      : null;
    const request: CrashHarnessRequest = {
      scenario: "path-write",
      path: real.path,
      value,
      expectedContentSha256: expected,
      createOnly: this.kind === "create-only",
    };
    const counts = await calibrateOnCopy(real, request);
    const run = await runFixture(real.space, request, choose(this.choice, counts));
    const observed = existsSync(real.path) ? readJsonFile(real.path) : null;
    const applies = this.kind !== "create-only" || model.value === null;
    if (run.result === null) {
      oneOf(observed, applies ? [model.value, value] : [model.value]);
    } else {
      expect(run.result.ok).toBe(true);
      expect(observed).toEqual(applies ? value : model.value);
    }
    model.value = observed;
  }
  toString(): string {
    return `PathWrite(${String(this.token)}, ${this.kind}, ${JSON.stringify(this.choice)})`;
  }
}

/** Count a path write's boundaries against a copy of the file. */
async function calibrateOnCopy(
  real: PathReal,
  request: Extract<CrashHarnessRequest, { readonly scenario: "path-write" }>,
): Promise<{ readonly all: number; readonly writes: number }> {
  const copyDirectory = join(real.space.directory, `calibration-${String(real.space.runs + 1)}`);
  mkdirSync(copyDirectory, { mode: 0o700 });
  const copy = join(copyDirectory, "value.json");
  if (existsSync(real.path)) writeFileSync(copy, readFileSync(real.path), { mode: 0o600 });
  return await calibrate(real.space, { ...request, path: copy });
}

describe("crash-injected private files", () => {
  test("a crash at any durable boundary leaves the old or the new value, never a torn one", async () => {
    await assertAsyncProperty(
      fc.asyncProperty(
        fc.commands([
          fc.tuple(
            fc.nat({ max: 999 }),
            fc.constantFrom<"replace" | "compare-and-swap" | "create-only">(
              "replace",
              "compare-and-swap",
              "create-only",
            ),
            crashArbitrary,
          ).map(([token, kind, crash]) => new PathWrite(token, kind, crash)),
        ], { maxCommands: MAX_COMMANDS + 2 }),
        async (commands) => {
          const space = workspace();
          const path = join(space.directory, "files", "value.json");
          await fc.asyncModelRun(() => ({ model: { value: null }, real: { space, path } }), commands);
          writePrivateJson(path, { token: "final" }, { privateParent: true });
          expect(readJsonFile(path)).toEqual({ token: "final" });
        },
      ),
      { numRuns: STATE_RUNS, interruptAfterTimeLimit: PROPERTY_TIME_LIMIT_MS },
    );
  });
});

// ---------------------------------------------------------------------------
// Seeded defects: the harness must catch a helper that skips an fsync.

describe("crash harness seeded defects", () => {
  test("power loss at every boundary of a file replacement is safe, and finds a file never fsynced", async () => {
    const space = workspace();
    const path = join(space.directory, "files", "value.json");
    writePrivateJson(path, { token: "old" }, { privateParent: true });
    const request: CrashHarnessRequest = {
      scenario: "path-write",
      path,
      value: { token: "new" },
      expectedContentSha256: null,
      createOnly: false,
    };
    const counts = await calibrateOnCopy({ space, path }, request);
    const torn = async (mutant?: StateCrashMutant): Promise<number> => {
      let found = 0;
      for (let target = 1; target <= counts.all; target += 1) {
        writePrivateJson(path, { token: "old" }, { privateParent: true });
        await runFixture(space, request, { mode: "power-loss", target, ...(mutant === undefined ? {} : { mutant }) });
        const text = existsSync(path) ? readFileSync(path, "utf8") : "";
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
        const valid = Bun.deepEquals(parsed, { token: "old" }) || Bun.deepEquals(parsed, { token: "new" });
        if (!valid) {
          found += 1;
          if (mutant !== undefined) break;
        }
      }
      return found;
    };
    expect(await torn()).toBe(0);
    expect(await torn("drop-file-fsync")).toBeGreaterThan(0);
  });

  test("power loss finds a dispatch journal whose directory entry was never fsynced", async () => {
    const space = workspace();
    installWriteTarget(space);
    const violates = async (index: number, mutant?: StateCrashMutant): Promise<boolean> => {
      const body = `seeded defect intent ${String(index)}`;
      const effectsLog = join(space.directory, `provider-effects-seeded-${String(index)}.log`);
      const digest = savedPlan(space, body);
      const request: CrashHarnessRequest = {
        scenario: "confirm",
        environment: space.environment,
        digest,
        now: new Date().toISOString(),
        outcome: "succeeded",
        effectsLog,
      };
      // Find the boundary just after the request crosses on a copy of the state.
      const calibrationLog = join(space.directory, `provider-effects-seeded-calibration-${String(index)}.log`);
      const counts = await calibrateWithoutEffect(space, { ...request, effectsLog: calibrationLog });
      const crossedAfter = Number(/crossed after boundary (\d+)/u.exec(readFileSync(calibrationLog, "utf8"))?.[1]);
      expect(crossedAfter).toBeGreaterThan(0);
      expect(crossedAfter).toBeLessThan(counts.all);
      await runFixture(space, request, {
        mode: "power-loss",
        target: crossedAfter + 1,
        ...(mutant === undefined ? {} : { mutant }),
      });
      expect(crossings(effectsLog)).toBe(1);
      recoverAndCheck(space);
      await probeConfirm(space, body, effectsLog);
      return crossings(effectsLog) > 1;
    };
    expect(await violates(0)).toBe(false);
    expect(await violates(1, "drop-directory-fsync")).toBe(true);
  });
});
