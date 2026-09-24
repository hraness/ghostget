/**
 * A stateful model of local browser admission across simulated processes that
 * share one real state home.
 *
 * Each simulated process gets its own process-start identity and boot identity
 * through the production dependency seams, and every one of them uses this
 * test's PID, so every new process is a PID reuse of every earlier one. The
 * injected liveness reading answers from the model exactly as
 * `processOwnerStatus` answers from a truthful operating system: an owner from
 * another boot is different-or-dead, and a same-boot owner is live, dead, or
 * unknown as the model says. The claims files are real, and every command
 * compares them with the model.
 *
 * The injected monotonic clock advances by each sleep and by a generated
 * amount on every read, so an acquisition can run out of time anywhere,
 * including between a durable create and its return.
 */
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { parseCaptureArguments, type CaptureArguments } from "@hraness/kb/capture";
import type { AcquiredPage } from "@hraness/kb/clip/acquire";

import {
  BROWSER_ADMISSION_STATE_DIRECTORY,
  BrowserAdmissionError,
  LOCAL_BROWSER_ADMISSION_LIMIT,
  acquireBrowserAdmission,
  acquireCaptureBrowserWithAdmission,
  type AcquireBrowserAdmissionOptions,
  type BrowserAdmission,
  type BrowserAdmissionDeadline,
  type BrowserAdmissionDependencies,
} from "./browser-admission";
import { sha256 } from "./canonical-json";
import type { ProcessOwnerIdentity, ProcessOwnerStatus } from "./process-identity";
import { assertAsyncProperty, fc } from "./test-support";

type Environment = Readonly<Record<string, string | undefined>>;
type Liveness = "live" | "dead" | "unknown";

/** The polling cap production documents: min(remaining capture time, 30 s). */
const POLLING_CAP_MS = 30_000;

type SimulatedProcess = {
  readonly id: number;
  readonly boot: number;
  readonly processStartId: string;
  status: Liveness;
};

type Model = {
  boot: number;
  /** The simulated process whose claim holds each slot, or null. */
  slots: [number | null, number | null];
  readonly processes: Map<number, { readonly boot: number; status: Liveness }>;
};

type Clock = {
  now: number;
  /** Extra time that passes on each successive read; 0 once exhausted. */
  increments: number[];
  reads: number;
  lastRead: number;
};

type Real = {
  readonly directory: string;
  readonly environment: Environment;
  boot: number;
  nextId: number;
  readonly processes: Map<number, SimulatedProcess>;
  /** Admissions returned and never released, by simulated owner. */
  readonly admissions: Map<number, BrowserAdmission>;
  readonly clock: Clock;
};

class DeadlineExpired extends Error {
  constructor() {
    super("capture deadline expired");
    this.name = "DeadlineExpired";
  }
}

function bootId(boot: number): string {
  return sha256(`model-boot-${String(boot)}`);
}

function processStartId(id: number): string {
  return sha256(`model-process-${String(id)}`);
}

function readClock(clock: Clock): number {
  clock.now += clock.increments[clock.reads] ?? 0;
  clock.reads += 1;
  clock.lastRead = clock.now;
  return clock.now;
}

/** The liveness reading a truthful operating system would give, per the model. */
function ownerStatus(real: Real, owner: ProcessOwnerIdentity): ProcessOwnerStatus {
  if (owner.bootId !== bootId(real.boot)) return "different-or-dead";
  const found = [...real.processes.values()].find((candidate) => candidate.processStartId === owner.processStartId);
  if (found === undefined) return "different-or-dead";
  return found.status === "live" ? "exact-live-owner" : found.status === "dead" ? "different-or-dead" : "unknown";
}

function spawnProcess(model: Model, real: Real): SimulatedProcess {
  const id = real.nextId;
  real.nextId += 1;
  const created: SimulatedProcess = { id, boot: real.boot, processStartId: processStartId(id), status: "live" };
  real.processes.set(id, created);
  model.processes.set(id, { boot: model.boot, status: "live" });
  return created;
}

/**
 * The slot production must pick: the first slot that is free or holds a
 * claim from an earlier boot. A same-boot claim stays occupied whatever its
 * owner's liveness, because a browser daemon can outlive its Ghostget owner.
 */
function predictedSlot(model: Model): 0 | 1 | null {
  for (const slot of [0, 1] as const) {
    const holder = model.slots[slot];
    if (holder === null || model.processes.get(holder)!.boot !== model.boot) return slot;
  }
  return null;
}

function claimDirectory(real: Real): string {
  return join(real.directory, ...BROWSER_ADMISSION_STATE_DIRECTORY.split("/"));
}

/** The simulated owner of each slot on disk. */
function slotsOnDisk(real: Real): [number | null, number | null] {
  const byStartId = new Map([...real.processes.values()].map((entry) => [entry.processStartId, entry.id]));
  const slots: [number | null, number | null] = [null, null];
  let names: string[];
  try {
    names = readdirSync(claimDirectory(real));
  } catch {
    return slots;
  }
  for (const slot of [0, 1] as const) {
    if (!names.includes(`slot-${String(slot)}.json`)) continue;
    const claim = JSON.parse(readFileSync(join(claimDirectory(real), `slot-${String(slot)}.json`), "utf8")) as {
      readonly owner: { readonly processStartId: string };
    };
    const owner = byStartId.get(claim.owner.processStartId);
    if (owner === undefined) throw new Error(`slot ${String(slot)} holds a claim no simulated process wrote`);
    slots[slot] = owner;
  }
  return slots;
}

/**
 * The law under test: at most two acquisitions run in the current boot. An
 * admission whose owner died in this boot still counts, because its browser
 * can outlive it; a reboot ends every earlier acquisition.
 */
function checkInvariants(model: Model, real: Real): void {
  const running = [...real.admissions.keys()].filter((id) => real.processes.get(id)!.boot === real.boot);
  expect(running.length).toBeLessThanOrEqual(LOCAL_BROWSER_ADMISSION_LIMIT);
  expect(slotsOnDisk(real)).toEqual(model.slots);
}

/**
 * After an acquisition that did not return a slot, a claim from an earlier
 * boot that production may already have removed is the one place the disk
 * may differ from the model. Adopt only that difference.
 */
function adoptReclaim(model: Model, real: Real): void {
  const disk = slotsOnDisk(real);
  for (const slot of [0, 1] as const) {
    const holder = model.slots[slot];
    if (holder !== null && disk[slot] === null && model.processes.get(holder)!.boot !== model.boot) {
      model.slots[slot] = null;
    }
  }
}

type Timing = Readonly<{
  timeoutMs: number;
  /** The capture deadline's remaining time at the start, or null for none. */
  captureRemainingMs: number | null;
  increments: readonly number[];
  /** Time that passes between a slot's durable create and its return. */
  commitDelayMs: number;
}>;

/**
 * One acquisition's polling budget. Production starts its local timer at its
 * first clock reading, so the budget does too.
 */
type Budget = { firstRead: number | null; readonly localMs: number; readonly captureExpiresAt: number | null };

/** The latest instant the acquisition may poll to or return before: min(remaining capture time, 30 s, its timeout). */
function bound(budget: Budget): number {
  if (budget.firstRead === null) throw new Error("the acquisition never read its clock");
  return Math.min(budget.firstRead + Math.min(budget.localMs, POLLING_CAP_MS), budget.captureExpiresAt ?? Infinity);
}

/** Admission dependencies for one simulated process, recording and checking every sleep. */
function dependenciesFor(
  real: Real,
  owner: SimulatedProcess,
  budget: Budget,
  commitDelayMs = 0,
): BrowserAdmissionDependencies {
  return {
    afterCreateCommitForTest: () => {
      real.clock.now += commitDelayMs;
    },
    monotonicNow: () => {
      const value = readClock(real.clock);
      budget.firstRead ??= value;
      return value;
    },
    random: () => 0.5,
    currentProcessIdentity: () => ({ bootId: bootId(owner.boot), processStartId: owner.processStartId }),
    ownerStatus: (identity) => ownerStatus(real, identity),
    sleep: (milliseconds) => {
      // A sleep never reaches past the polling budget: min(remaining capture
      // time, 30 s, the caller's timeout), measured from the last reading.
      expect(milliseconds).toBeGreaterThanOrEqual(1);
      expect(real.clock.now + milliseconds).toBeLessThanOrEqual(bound(budget));
      real.clock.now += milliseconds;
      return Promise.resolve();
    },
  };
}

function captureDeadline(real: Real, remainingMs: number): BrowserAdmissionDeadline {
  const expiresAt = real.clock.now + remainingMs;
  const controller = new AbortController();
  if (remainingMs <= 0) controller.abort();
  return {
    signal: controller.signal,
    remainingTimeMs: () => Math.max(0, Math.floor(expiresAt - real.clock.now)),
    throwIfUnavailable: () => {
      if (real.clock.now >= expiresAt) throw new DeadlineExpired();
    },
  };
}

function isTimeout(error: unknown): boolean {
  return error instanceof DeadlineExpired
    || (error instanceof BrowserAdmissionError && error.failure === "timed-out");
}

class AcquireCommand implements fc.AsyncCommand<Model, Real> {
  constructor(readonly timing: Timing) {}

  check(): boolean {
    return true;
  }

  async run(model: Model, real: Real): Promise<void> {
    const owner = spawnProcess(model, real);
    const predicted = predictedSlot(model);
    real.clock.increments = [...this.timing.increments];
    real.clock.reads = 0;
    const budget: Budget = {
      firstRead: null,
      localMs: this.timing.timeoutMs,
      captureExpiresAt: this.timing.captureRemainingMs === null ? null : real.clock.now + this.timing.captureRemainingMs,
    };
    const options: AcquireBrowserAdmissionOptions = {
      timeoutMs: this.timing.timeoutMs,
      environment: real.environment,
      dependencies: dependenciesFor(real, owner, budget, this.timing.commitDelayMs),
      ...(this.timing.captureRemainingMs === null
        ? {}
        : { deadline: captureDeadline(real, this.timing.captureRemainingMs) }),
    };
    let admission: BrowserAdmission;
    try {
      admission = await acquireBrowserAdmission(options);
    } catch (error) {
      if (!isTimeout(error)) throw error;
      // A refusal is a timeout: either no slot was free or reclaimable, or
      // time ran out first. Nothing it created may remain.
      if (predicted !== null) expect(real.clock.lastRead).toBeGreaterThanOrEqual(bound(budget));
      owner.status = "dead";
      model.processes.get(owner.id)!.status = "dead";
      adoptReclaim(model, real);
      checkInvariants(model, real);
      return;
    }
    // No admission is returned at or after the local or capture deadline,
    // even when that deadline passed while the slot was being created.
    expect(real.clock.lastRead).toBeLessThan(bound(budget));
    expect(real.clock.now).toBeLessThan(bound(budget));
    expect(predicted).not.toBeNull();
    expect(admission.slot).toBe(predicted!);
    model.slots[predicted!] = owner.id;
    real.admissions.set(owner.id, admission);
    checkInvariants(model, real);
  }

  toString(): string {
    return `acquire(${JSON.stringify(this.timing)})`;
  }
}

/** Pick the n-th live current-boot holder, if any. */
function liveHolder(model: Model, pick: number): number | null {
  const holders = model.slots.filter((holder): holder is number => {
    if (holder === null) return false;
    const entry = model.processes.get(holder)!;
    return entry.boot === model.boot && entry.status === "live";
  });
  return holders.length === 0 ? null : holders[pick % holders.length]!;
}

class ReleaseCommand implements fc.AsyncCommand<Model, Real> {
  constructor(readonly pick: number) {}

  check(model: Readonly<Model>): boolean {
    return liveHolder(model as Model, this.pick) !== null;
  }

  run(model: Model, real: Real): Promise<void> {
    const holder = liveHolder(model, this.pick)!;
    const admission = real.admissions.get(holder)!;
    admission.release();
    real.admissions.delete(holder);
    model.slots[admission.slot] = null;
    checkInvariants(model, real);
    return Promise.resolve();
  }

  toString(): string {
    return `release(${String(this.pick)})`;
  }
}

/** A holder dies, or its liveness becomes unreadable, in the current boot. */
class OwnerChangeCommand implements fc.AsyncCommand<Model, Real> {
  constructor(readonly pick: number, readonly status: Exclude<Liveness, "live">) {}

  check(model: Readonly<Model>): boolean {
    return liveHolder(model as Model, this.pick) !== null;
  }

  run(model: Model, real: Real): Promise<void> {
    const holder = liveHolder(model, this.pick)!;
    model.processes.get(holder)!.status = this.status;
    real.processes.get(holder)!.status = this.status;
    checkInvariants(model, real);
    return Promise.resolve();
  }

  toString(): string {
    return `${this.status}(${String(this.pick)})`;
  }
}

class RebootCommand implements fc.AsyncCommand<Model, Real> {
  check(): boolean {
    return true;
  }

  run(model: Model, real: Real): Promise<void> {
    model.boot += 1;
    real.boot += 1;
    checkInvariants(model, real);
    return Promise.resolve();
  }

  toString(): string {
    return "reboot";
  }
}

function captureArguments(timeoutMs: number): CaptureArguments {
  const parsed = parseCaptureArguments([
    "capture",
    "https://example.com/article",
    "--mode",
    "browser",
    "--stdout",
  ]);
  if (!parsed.ok || parsed.value.command !== "capture") {
    throw new Error(parsed.ok ? "fixture did not parse as capture" : parsed.message);
  }
  return { ...parsed.value, timeoutMs };
}

function acquiredPage(): AcquiredPage {
  return {
    body: "<article>bounded</article>",
    contentType: "text/html; charset=utf-8",
    finalUrl: new URL("https://example.com/article"),
    method: "browser-fresh",
    warnings: [],
  };
}

/**
 * A whole browser capture: admission, the launch, and the release. A launch
 * happens only while capture time remains, and it gets only what remains.
 */
class CaptureCommand implements fc.AsyncCommand<Model, Real> {
  constructor(readonly timeoutMs: number, readonly increments: readonly number[]) {}

  check(): boolean {
    return true;
  }

  async run(model: Model, real: Real): Promise<void> {
    const owner = spawnProcess(model, real);
    const predicted = predictedSlot(model);
    real.clock.increments = [...this.increments];
    real.clock.reads = 0;
    let startedAt: number | null = null;
    const launches: { readonly at: number; readonly timeoutMs: number; readonly held: boolean }[] = [];
    // The capture passes its whole timeout to admission, which starts its
    // own timer at its first reading, one synchronous reading after the
    // capture's.
    const budget: Budget = { firstRead: null, localMs: this.timeoutMs, captureExpiresAt: null };
    const monotonicNow = (): number => {
      const value = readClock(real.clock);
      startedAt ??= value;
      return value;
    };
    let outcome: "launched" | "timed-out";
    try {
      await acquireCaptureBrowserWithAdmission(
        captureArguments(this.timeoutMs),
        real.directory,
        false,
        real.environment,
        {
          monotonicNow,
          acquireAdmission: (options) => acquireBrowserAdmission({
            ...options,
            dependencies: dependenciesFor(real, owner, budget),
          }),
          acquireBrowser: (options) => {
            launches.push({
              at: real.clock.now,
              timeoutMs: options.timeoutMs,
              held: slotsOnDisk(real).includes(owner.id),
            });
            return Promise.resolve(acquiredPage());
          },
        },
      );
      outcome = "launched";
    } catch (error) {
      if (!isTimeout(error)) throw error;
      outcome = "timed-out";
    }
    expect(launches.length).toBe(outcome === "launched" ? 1 : 0);
    const launch = launches[0];
    if (launch !== undefined) {
      const elapsed = launch.at - startedAt!;
      // The launch happens before the capture deadline, under a held slot,
      // with no more time than remains.
      expect(elapsed).toBeLessThan(this.timeoutMs);
      expect(launch.held).toBe(true);
      expect(launch.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(launch.timeoutMs).toBeLessThanOrEqual(this.timeoutMs - elapsed);
    } else if (predicted !== null) {
      // A slot was available, so only time can have refused the launch.
      expect(real.clock.lastRead).toBeGreaterThanOrEqual(Math.min(bound(budget), startedAt! + this.timeoutMs));
    }
    // Either way the capture's own slot is released afterwards.
    owner.status = "dead";
    model.processes.get(owner.id)!.status = "dead";
    adoptReclaim(model, real);
    checkInvariants(model, real);
  }

  toString(): string {
    return `capture(${String(this.timeoutMs)}, ${JSON.stringify(this.increments)})`;
  }
}

// Most clock readings advance by nothing, so most acquisitions complete and
// the slots fill; the rest jump by up to 40 s, anywhere in an acquisition.
const jump = fc.oneof(
  { weight: 3, arbitrary: fc.constant(0) },
  { weight: 1, arbitrary: fc.integer({ min: 1, max: 40_000 }) },
);
const increments = fc.array(jump, { maxLength: 12 });
const timing: fc.Arbitrary<Timing> = fc.record({
  timeoutMs: fc.integer({ min: 1, max: 60_000 }),
  captureRemainingMs: fc.option(fc.integer({ min: 0, max: 60_000 }), { nil: null }),
  increments,
  commitDelayMs: jump,
});

const acquireCommand = timing.map((entry) => new AcquireCommand(entry));
const ownerChangeCommand = fc.tuple(fc.nat(3), fc.constantFrom<"dead" | "unknown">("dead", "unknown"))
  .map(([pick, status]) => new OwnerChangeCommand(pick, status));
// Acquisitions and owner deaths are listed twice so that full slots with a
// dead same-boot holder, the case PID reuse must not reclaim, come up often.
const commands = fc.commands([
  acquireCommand,
  acquireCommand,
  fc.nat(3).map((pick) => new ReleaseCommand(pick)),
  ownerChangeCommand,
  ownerChangeCommand,
  fc.constant(new RebootCommand()),
  fc.tuple(fc.integer({ min: 1, max: 60_000 }), increments)
    .map(([timeoutMs, extra]) => new CaptureCommand(timeoutMs, extra)),
], { maxCommands: 10 });

function acquireAt(timeoutMs: number, increments: readonly number[] = [], commitDelayMs = 0): AcquireCommand {
  return new AcquireCommand({ timeoutMs, captureRemainingMs: null, increments, commitDelayMs });
}

/**
 * Fixed schedules that every run checks before the generated ones, one per
 * boundary the law depends on, so a regression at any of them fails on every
 * run rather than only on a lucky seed.
 */
const boundarySchedules: readonly (readonly fc.AsyncCommand<Model, Real>[])[] = [
  // Both slots held in this boot, one holder dead: the third waits it out.
  [acquireAt(1_000), acquireAt(1_000), new OwnerChangeCommand(0, "dead"), acquireAt(100)],
  // The deadline passes while the slot is being created.
  [acquireAt(1_000, [], 5_000)],
  // A capture that reaches admission with no launch time left.
  [new CaptureCommand(378, [0, 29_490, 377])],
  // Full slots and a 60 s timeout: polling still stops at 30 s.
  [acquireAt(1_000), acquireAt(1_000), acquireAt(60_000, [0, 29_990])],
];

describe("browser admission stateful model", () => {
  test("never runs more than two acquisitions, never reclaims a same-boot claim, and never launches after expiry", async () => {
    await assertAsyncProperty(fc.asyncProperty(commands, async (sequence) => {
      const directory = mkdtempSync(join(tmpdir(), "ghostget-browser-admission-model-"));
      chmodSync(directory, 0o700);
      const real: Real = {
        directory,
        environment: { GHOSTGET_STATE_HOME: directory },
        boot: 0,
        nextId: 0,
        processes: new Map(),
        admissions: new Map(),
        clock: { now: 0, increments: [], reads: 0, lastRead: 0 },
      };
      try {
        await fc.asyncModelRun(() => ({
          model: { boot: 0, slots: [null, null] as [number | null, number | null], processes: new Map() },
          real,
        }), sequence);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }), {
      numRuns: 8,
      interruptAfterTimeLimit: 150_000,
      examples: boundarySchedules.map((schedule) => [schedule as unknown as Iterable<fc.AsyncCommand<Model, Real>>]),
    });
  });
});
