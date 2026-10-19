/**
 * ITF trace replay for the toolchain smoke model `verification/quint/lock.qnt`.
 *
 * Quint writes seeded model-based-testing traces, and each trace drives a
 * TypeScript lock one recorded action at a time, comparing the lock with the
 * model state after every step. `models.json` marks this model's replay target
 * `reference`: no production code implements this toy lock, so this test is
 * toolchain evidence, not conformance evidence. A production model reuses
 * this pattern with production code in place of the reference lock.
 */
import { describe, expect, test } from "bun:test";

import {
  itfOption,
  itfRecord,
  itfString,
  itfStringSet,
  itfVariable,
  parseItfTrace,
  type ItfState,
  type ItfTrace,
} from "./verification-itf.js";
import { quintModel, quintTraceCache } from "./verification-replay.js";

const MODEL_FILE = "lock.qnt";
const TRACE_VARIABLES = ["critical", "holder", "mbt::actionTaken", "mbt::nondetPicks"];

type Operation = "acquire" | "release";

/** Model action names and the lock operation each one drives. */
const OPERATIONS: Readonly<Record<string, Operation>> = Object.freeze({
  acquire: "acquire",
  acquireUnguarded: "acquire",
  release: "release",
});

type LockSnapshot = Readonly<{ holder: string; critical: ReadonlySet<string> }>;

type Lock = {
  /** Returns false when the lock refuses the operation. */
  apply(operation: Operation, process: string): boolean;
  snapshot(): LockSnapshot;
};

/**
 * The reference lock, plus a seeded defect: `release-keeps-holder` forgets to
 * free the lock, so the next acquire is refused.
 */
function referenceLock(defect: "none" | "release-keeps-holder" = "none"): Lock {
  let holder: string | null = null;
  const critical = new Set<string>();
  return {
    apply(operation, process) {
      if (operation === "acquire") {
        if (holder !== null) return false;
        holder = process;
        critical.add(process);
        return true;
      }
      if (!critical.has(process)) return false;
      if (holder === process && defect === "none") holder = null;
      critical.delete(process);
      return true;
    },
    snapshot: () => ({ holder: holder ?? "", critical: new Set(critical) }),
  };
}

class ReplayDivergence extends Error {}

function modelState(state: ItfState): LockSnapshot {
  return {
    holder: itfString(itfVariable(state, "holder"), "holder"),
    critical: itfStringSet(itfVariable(state, "critical"), "critical"),
  };
}

function sameState(left: LockSnapshot, right: LockSnapshot): boolean {
  return left.holder === right.holder
    && left.critical.size === right.critical.size
    && [...left.critical].every((process) => right.critical.has(process));
}

function describeState(state: LockSnapshot): string {
  return `holder ${JSON.stringify(state.holder)}, critical {${[...state.critical].sort().join(", ")}}`;
}

type RecordedStep = Readonly<{ action: string; process: string | null }>;

function recordedStep(state: ItfState): RecordedStep {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const picks = itfRecord(itfVariable(state, "mbt::nondetPicks"), ["p"], "mbt::nondetPicks");
  const pick = itfOption(picks.get("p")!, "mbt::nondetPicks.p");
  return { action, process: pick === null ? null : itfString(pick, "mbt::nondetPicks.p") };
}

/** Drive `lock` through every recorded action of `trace`, failing at the first divergence. */
function replay(trace: ItfTrace, lock: Lock): void {
  const [initial, ...steps] = trace.states;
  if (initial === undefined) throw new Error("A trace needs its initial state");
  if (recordedStep(initial).action !== "init") throw new Error("A trace must start with the init action");
  if (!sameState(lock.snapshot(), modelState(initial))) {
    throw new ReplayDivergence(`state 0: the lock starts at ${describeState(lock.snapshot())}`);
  }
  for (const state of steps) {
    const { action, process } = recordedStep(state);
    const operation = OPERATIONS[action];
    if (operation === undefined || process === null) {
      throw new Error(`state ${String(state.index)} records an unknown action or no process`);
    }
    if (!lock.apply(operation, process)) {
      throw new ReplayDivergence(`state ${String(state.index)}: the lock refused ${action}(${process})`);
    }
    const expected = modelState(state);
    const actual = lock.snapshot();
    if (!sameState(actual, expected)) {
      throw new ReplayDivergence(
        `state ${String(state.index)}: after ${action}(${process}) the lock has ${describeState(actual)}, the model ${describeState(expected)}`,
      );
    }
  }
}

function divergence(trace: ItfTrace, lock: Lock): string | null {
  try {
    replay(trace, lock);
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error.message;
    throw error;
  }
}

const lockModel = () => quintModel(MODEL_FILE);
const traces = quintTraceCache(MODEL_FILE);

describe("lock.qnt ITF replay", () => {
  test("replays every seeded model trace through the reference lock", async () => {
    const model = await lockModel();
    expect(model.replay.target).toBe("reference");
    expect(model.replay.test).toBe("scripts/verification-lock-replay.test.ts");
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const covered = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      expect(divergence(trace, referenceLock())).toBeNull();
      for (const state of trace.states.slice(1)) {
        const { action, process } = recordedStep(state);
        covered.add(`${action}(${String(process)})`);
      }
    }
    expect([...covered].sort()).toEqual(["acquire(a)", "acquire(b)", "release(a)", "release(b)"]);
  });

  test("a lock with a seeded defect diverges from the model traces", async () => {
    const model = await lockModel();
    const all = await traces(model.step);
    const divergences = all.map((trace) => divergence(trace, referenceLock("release-keeps-holder")));
    const first = divergences.find((message) => message !== null);
    expect(first).toMatch(/^state \d+: after release\(([ab])\) the lock has holder "\1", critical \{\}, the model holder "", critical \{\}$/u);
  });

  test("the reference lock rejects exactly the seeded mutant's traces that break mutual exclusion", async () => {
    const model = await lockModel();
    const mutant = model.mutants[0];
    if (mutant === undefined) throw new Error("lock.qnt needs a seeded mutant");
    const all = await traces(mutant.step);
    let violating = 0;
    for (const trace of all) {
      const breaks = trace.states.some((state) => modelState(state).critical.size > 1);
      if (breaks) violating += 1;
      const message = divergence(trace, referenceLock());
      expect(message === null).toBe(!breaks);
      if (breaks) expect(message).toMatch(/^state \d+: the lock refused acquireUnguarded\([ab]\)$/u);
    }
    expect(violating).toBeGreaterThan(0);
  });

  test("an unknown action or a missing process fails closed instead of skipping a step", () => {
    const trace = (action: string, pick: unknown): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [
        {
          "#meta": { index: 0 },
          holder: "",
          critical: { "#set": [] },
          "mbt::actionTaken": "init",
          "mbt::nondetPicks": { p: { tag: "None", value: { "#tup": [] } } },
        },
        {
          "#meta": { index: 1 },
          holder: "a",
          critical: { "#set": ["a"] },
          "mbt::actionTaken": action,
          "mbt::nondetPicks": { p: pick },
        },
      ],
    }));
    expect(divergence(trace("acquire", { tag: "Some", value: "a" }), referenceLock())).toBeNull();
    expect(() => divergence(trace("steal", { tag: "Some", value: "a" }), referenceLock())).toThrow("unknown action");
    expect(() => divergence(trace("acquire", { tag: "None", value: { "#tup": [] } }), referenceLock())).toThrow("no process");
    expect(() => divergence(trace("acquire", { tag: "Maybe", value: "a" }), referenceLock())).toThrow("Some(value) or None");
    expect(divergence(trace("release", { tag: "Some", value: "a" }), referenceLock())).toBe("state 1: the lock refused release(a)");
  });
});
