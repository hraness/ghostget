/**
 * A stateful model of helper custody over the production owner record.
 *
 * Several contender processes inspect and commit the real `control/owner.json`
 * in one state home. Inspection and commit are separate commands, so two
 * contenders can both see the same record before either writes, which is the
 * race the compare-and-swap write must settle. Processes crash without
 * releasing, restart as new process incarnations, and owner verification can
 * become unknown. After every command the model checks that each live
 * contender that believes it holds custody is the owner the record names, so
 * at most one live contender holds custody at a time.
 */
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { ProcessOwnerIdentity, ProcessOwnerStatus } from "../process-identity";
import { ghostgetStateHome } from "../storage";
import { assertProperty, fc } from "../test-support";
import { commitControlOwner, inspectControlOwner, type ControlOwnerInspection, type ControlOwnerProcesses } from "./helper";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });

const CONTENDERS = 3;
const BOOT = createHash("sha256").update("boot").digest("hex");

type Holder = Readonly<{ contender: number; incarnation: number }>;
type Model = {
  record: (Holder & { version: number }) | null;
  version: number;
  alive: boolean[];
  incarnation: number[];
  holds: boolean[];
  pending: ({ version: number | null } | null)[];
  unknown: boolean;
};
type Real = {
  environment: Record<string, string>;
  root: string;
  alive: boolean[];
  incarnation: number[];
  unknown: boolean;
  releases: ((() => void) | null)[];
  inspections: (ControlOwnerInspection | null)[];
};

function startId(contender: number, incarnation: number): string {
  return createHash("sha256").update(`${String(contender)}:${String(incarnation)}`).digest("hex");
}

function processes(real: Real, contender: number): ControlOwnerProcesses {
  return {
    capture: (): ProcessOwnerIdentity => ({ pid: 1000 + contender, bootId: BOOT, processStartId: startId(contender, real.incarnation[contender] ?? 0) }),
    status: (owner): ProcessOwnerStatus => {
      if (real.unknown) return "unknown";
      const other = owner.pid - 1000;
      return real.alive[other] === true && owner.bootId === BOOT && owner.processStartId === startId(other, real.incarnation[other] ?? 0)
        ? "exact-live-owner"
        : "different-or-dead";
    },
  };
}

function refused(run: () => unknown): boolean {
  try { run(); return false; } catch (error) {
    expect((error as { code?: unknown }).code).toBe("CONTROL_ALREADY_RUNNING");
    return true;
  }
}

/** The safety law, checked against the file on disk after every command. */
function checkCustody(model: Model, real: Real): void {
  let text: string | null = null;
  try { text = readFileSync(join(real.root, "control", "owner.json"), "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const onDisk = text === null ? null : JSON.parse(text) as { pid: number; processStartId: string };
  const liveHolders = model.holds.flatMap((holds, contender) => (holds && model.alive[contender] === true ? [contender] : []));
  expect(liveHolders.length).toBeLessThanOrEqual(1);
  for (const contender of liveHolders) {
    expect(onDisk).not.toBeNull();
    expect({ pid: onDisk?.pid, processStartId: onDisk?.processStartId })
      .toEqual({ pid: 1000 + contender, processStartId: startId(contender, model.incarnation[contender] ?? 0) });
  }
  expect(onDisk === null).toBe(model.record === null);
  if (model.record !== null) {
    expect({ pid: onDisk?.pid, processStartId: onDisk?.processStartId })
      .toEqual({ pid: 1000 + model.record.contender, processStartId: startId(model.record.contender, model.record.incarnation) });
  }
}

class Inspect implements fc.Command<Model, Real> {
  constructor(readonly contender: number) {}
  check(model: Readonly<Model>): boolean { return model.alive[this.contender] === true && !model.holds[this.contender]; }
  run(model: Model, real: Real): void {
    const record = model.record;
    const expectRefusal = record !== null
      && (model.unknown || (model.alive[record.contender] === true && model.incarnation[record.contender] === record.incarnation));
    let inspection: ControlOwnerInspection | null = null;
    const wasRefused = refused(() => { inspection = inspectControlOwner(real.environment, processes(real, this.contender)); });
    expect(wasRefused).toBe(expectRefusal);
    real.inspections[this.contender] = inspection;
    model.pending[this.contender] = wasRefused ? null : { version: record?.version ?? null };
    checkCustody(model, real);
  }
  toString(): string { return `inspect(${String(this.contender)})`; }
}

class Commit implements fc.Command<Model, Real> {
  constructor(readonly contender: number) {}
  check(model: Readonly<Model>): boolean { return model.alive[this.contender] === true && model.pending[this.contender] != null; }
  run(model: Model, real: Real): void {
    const seen = model.pending[this.contender];
    const inspection = real.inspections[this.contender];
    if (seen == null || inspection == null) throw new Error("commit without an inspection");
    const expectAcquired = (model.record?.version ?? null) === seen.version;
    let release: (() => void) | null = null;
    const wasRefused = refused(() => { release = commitControlOwner(real.environment, inspection, processes(real, this.contender)); });
    expect(!wasRefused).toBe(expectAcquired);
    model.pending[this.contender] = null;
    real.inspections[this.contender] = null;
    if (!wasRefused) {
      model.version += 1;
      model.record = { contender: this.contender, incarnation: model.incarnation[this.contender] ?? 0, version: model.version };
      model.holds[this.contender] = true;
      real.releases[this.contender] = release;
    }
    checkCustody(model, real);
  }
  toString(): string { return `commit(${String(this.contender)})`; }
}

class Release implements fc.Command<Model, Real> {
  constructor(readonly contender: number) {}
  check(model: Readonly<Model>): boolean { return model.alive[this.contender] === true && model.holds[this.contender] === true; }
  run(model: Model, real: Real): void {
    real.releases[this.contender]?.();
    real.releases[this.contender] = null;
    model.holds[this.contender] = false;
    const record = model.record;
    if (record !== null && record.contender === this.contender && record.incarnation === model.incarnation[this.contender]) model.record = null;
    checkCustody(model, real);
  }
  toString(): string { return `release(${String(this.contender)})`; }
}

class Crash implements fc.Command<Model, Real> {
  constructor(readonly contender: number) {}
  check(model: Readonly<Model>): boolean { return model.alive[this.contender] === true; }
  run(model: Model, real: Real): void {
    model.alive[this.contender] = false; real.alive[this.contender] = false;
    model.holds[this.contender] = false; model.pending[this.contender] = null;
    real.releases[this.contender] = null; real.inspections[this.contender] = null;
    checkCustody(model, real);
  }
  toString(): string { return `crash(${String(this.contender)})`; }
}

class Restart implements fc.Command<Model, Real> {
  constructor(readonly contender: number) {}
  check(model: Readonly<Model>): boolean { return model.alive[this.contender] === false; }
  run(model: Model, real: Real): void {
    model.alive[this.contender] = true; real.alive[this.contender] = true;
    model.incarnation[this.contender] = (model.incarnation[this.contender] ?? 0) + 1;
    real.incarnation[this.contender] = model.incarnation[this.contender] ?? 0;
    checkCustody(model, real);
  }
  toString(): string { return `restart(${String(this.contender)})`; }
}

/** Two contenders inspect before either commits, then both commit. */
class Race implements fc.Command<Model, Real> {
  constructor(readonly first: number, readonly second: number) {}
  check(model: Readonly<Model>): boolean {
    return this.first !== this.second && [this.first, this.second].every((index) => model.alive[index] === true && !model.holds[index]);
  }
  run(model: Model, real: Real): void {
    for (const step of [new Inspect(this.first), new Inspect(this.second), new Commit(this.first), new Commit(this.second)]) {
      if (step.check(model)) step.run(model, real);
    }
  }
  toString(): string { return `race(${String(this.first)},${String(this.second)})`; }
}

class ToggleUnknown implements fc.Command<Model, Real> {
  check(): boolean { return true; }
  run(model: Model, real: Real): void { model.unknown = !model.unknown; real.unknown = model.unknown; checkCustody(model, real); }
  toString(): string { return "toggle-unknown"; }
}

function stateHome(): { environment: Record<string, string>; root: string } {
  const raw = mkdtempSync("/tmp/ghostget-own-"); chmodSync(raw, 0o700);
  cleanups.push(() => { rmSync(raw, { recursive: true, force: true }); });
  const environment = { GHOSTGET_STATE_HOME: raw, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: process.env.HOME ?? "", TMPDIR: "/tmp" };
  return { environment, root: ghostgetStateHome(environment) };
}

test("property: at most one live contender holds helper custody across inspect and commit races, crashes, restarts, and unknown owners", () => {
  const contender = fc.nat({ max: CONTENDERS - 1 });
  // One state home serves every run; each run starts without an owner record.
  const { environment, root } = stateHome();
  assertProperty(fc.property(fc.commands([
    contender.map((index) => new Inspect(index)),
    contender.map((index) => new Commit(index)),
    contender.map((index) => new Commit(index)),
    fc.tuple(contender, contender).map(([first, second]) => new Race(first, second)),
    contender.map((index) => new Release(index)),
    contender.map((index) => new Crash(index)),
    contender.map((index) => new Restart(index)),
    fc.constant(new ToggleUnknown()),
  ], { maxCommands: 20, size: "+1" }), (commands) => {
    rmSync(join(root, "control"), { recursive: true, force: true });
    const real: Real = {
      environment, root, alive: Array(CONTENDERS).fill(true) as boolean[], incarnation: Array(CONTENDERS).fill(0) as number[],
      unknown: false, releases: Array(CONTENDERS).fill(null) as null[], inspections: Array(CONTENDERS).fill(null) as null[],
    };
    fc.modelRun(() => ({
      model: {
        record: null, version: 0, alive: Array(CONTENDERS).fill(true) as boolean[], incarnation: Array(CONTENDERS).fill(0) as number[],
        holds: Array(CONTENDERS).fill(false) as boolean[], pending: Array(CONTENDERS).fill(null) as null[], unknown: false,
      },
      real,
    }), commands);
  }), { numRuns: 30 });
});

test("two contenders that saw no owner cannot both take custody", () => {
  const { environment, root } = stateHome();
  const real: Real = { environment, root, alive: [true, true], incarnation: [0, 0], unknown: false, releases: [null, null], inspections: [null, null] };
  const first = inspectControlOwner(environment, processes(real, 0));
  const second = inspectControlOwner(environment, processes(real, 1));
  commitControlOwner(environment, first, processes(real, 0));
  expect(refused(() => commitControlOwner(environment, second, processes(real, 1)))).toBeTrue();
  expect(refused(() => inspectControlOwner(environment, processes(real, 1)))).toBeTrue();
});

test("a contender replaces a crashed owner's record, and the crashed owner's late release keeps the new record", () => {
  const { environment, root } = stateHome();
  const real: Real = { environment, root, alive: [true, true], incarnation: [0, 0], unknown: false, releases: [null, null], inspections: [null, null] };
  const staleRelease = commitControlOwner(environment, inspectControlOwner(environment, processes(real, 0)), processes(real, 0));
  real.alive[0] = false;
  commitControlOwner(environment, inspectControlOwner(environment, processes(real, 1)), processes(real, 1));
  staleRelease();
  const record = JSON.parse(readFileSync(join(root, "control", "owner.json"), "utf8")) as { pid: number };
  expect(record.pid).toBe(1001);
});
