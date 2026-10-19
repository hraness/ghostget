/**
 * ITF trace replay for `verification/quint/state-claim.qnt`, the state
 * helper's three-phase mutation claim.
 *
 * Every `list` action in a trace runs the production listing and decision
 * of `src/state-helper.ts` on real claim files. The replay writes what the
 * model's listing reports into a fresh directory with
 * `writeStateMutationClaim`: the listing process's own claim, and the other
 * process's claim at the phase the listing picked, or no file when it picked
 * nothing. A live process's claim carries this test process's exact identity
 * and a dead one's a different start identity, so `processOwnerStatus` tells
 * them apart as it does in the helper. `listLiveStateMutationClaims` then
 * lists the directory, removing dead claims, and
 * `decideStateMutationClaimStage` decides on its result. The other actions
 * (publish, release, and kill) only move the process's position and claim
 * phase, which the replay tracks itself.
 *
 * A static directory stands for one outcome of a listing that ran beside
 * other processes; the model chooses which outcome. The concurrent helpers
 * themselves are exercised by `src/storage-cas.test.ts`.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { currentProcessStartIdentity } from "../src/process-identity.js";
import {
  decideStateMutationClaimStage,
  listLiveStateMutationClaims,
  stateMutationClaimName,
  writeStateMutationClaim,
  type StateMutationClaim,
  type StateMutationClaimPhase,
  type StateMutationClaimStageDecision,
} from "../src/state-helper.js";
import {
  itfOption,
  itfRecord,
  itfString,
  itfVariable,
  parseItfTrace,
  type ItfState,
  type ItfTrace,
} from "./verification-itf.js";
import { itfInt, itfStringMap, quintModel, quintTraceCache } from "./verification-replay.js";

const MODEL_FILE = "state-claim.qnt";
const ACTORS = ["a", "b"] as const;
type Actor = (typeof ACTORS)[number];
const ACTIONS = ["publish", "list", "release", "kill"] as const;
type Action = (typeof ACTIONS)[number];
const TRACE_VARIABLES = [
  "kills", "mbt::actionTaken", "mbt::nondetPicks", "observed", "pc", "phase", "result",
].sort();
const PICKS = ["a", "seeA", "seeB"] as const;
const PHASES: readonly string[] = ["waiting", "candidate", "held"];
const REPORTS: readonly string[] = ["absent", "self", ...PHASES];
/** Claim IDs in the model's order: a's is the smaller. */
const CLAIM_IDS: Readonly<Record<Actor, string>> = Object.freeze({
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
});
const TARGET_SHA256 = "5".repeat(64);
const LISTING_STAGE: Readonly<Record<string, StateMutationClaimPhase>> = Object.freeze({
  "list-waiting": "waiting",
  "list-candidate": "candidate",
  "list-held": "held",
});
const EXITED: ReadonlySet<string> = new Set(["exited-ok", "exited-busy", "exited-failed", "killed"]);

const workRoot = mkdtempSync(join(tmpdir(), "ghostget-state-claim-replay-"));
afterAll(() => rmSync(workRoot, { recursive: true, force: true }));
const identity = currentProcessStartIdentity();
const deadStartId = identity.processStartId === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64);
let directories = 0;

/**
 * Seeded defects in the replay's use of production:
 * - `ignore-held` enters the critical section on a `held` listing whatever it
 *   reports, as stepNoHeldCheck does;
 * - `keep-dead` writes a dead process's claim with a live identity, so the
 *   listing never removes it.
 */
type Defect = "none" | "ignore-held" | "keep-dead";
type Snapshot = Readonly<{
  pc: ReadonlyMap<string, string>;
  phase: ReadonlyMap<string, string>;
  result: string;
  kills: number;
}>;
type Step = Readonly<{ action: Action; actor: Actor; seen: ReadonlyMap<Actor, string> }>;

class ReplayDivergence extends Error {}

function claimFor(actor: Actor, live: boolean): StateMutationClaim {
  return {
    kind: "io-state-mutation-claim",
    schemaVersion: 1,
    targetSha256: TARGET_SHA256,
    claimId: CLAIM_IDS[actor],
    pid: process.pid,
    bootId: identity.bootId,
    processStartId: live ? identity.processStartId : deadStartId,
  };
}

/**
 * Write the claims a listing reports into a fresh directory and run the
 * production listing there. Returns what it listed and which claim files it
 * left.
 */
function productionListing(files: readonly Readonly<{ actor: Actor; phase: StateMutationClaimPhase; live: boolean }>[]): Readonly<{
  live: ReturnType<typeof listLiveStateMutationClaims>;
  left: readonly string[];
}> {
  directories += 1;
  const directory = mkdtempSync(join(workRoot, `listing-${String(directories)}-`));
  const previous = process.cwd();
  process.chdir(directory);
  try {
    for (const file of files) {
      writeStateMutationClaim(stateMutationClaimName(TARGET_SHA256, file.phase, CLAIM_IDS[file.actor]), claimFor(file.actor, file.live));
    }
    const live = listLiveStateMutationClaims(TARGET_SHA256);
    return { live, left: readdirSync(".").sort() };
  } finally {
    process.chdir(previous);
    rmSync(directory, { recursive: true, force: true });
  }
}

class ClaimWorld {
  private readonly pc = new Map<Actor, string>(ACTORS.map((actor) => [actor, "start"]));
  private readonly phase = new Map<Actor, string>(ACTORS.map((actor) => [actor, "absent"]));
  private result = "none";
  private kills = 0;

  constructor(private readonly defect: Defect = "none") {}

  pcOf(actor: Actor): string {
    return this.pc.get(actor)!;
  }

  /** Whether the process is at the point `action` starts from. */
  admits(action: Action, actor: Actor): boolean {
    const at = this.pcOf(actor);
    switch (action) {
      case "publish": return at === "start";
      case "list": return at in LISTING_STAGE;
      case "release": return at === "critical";
      case "kill": return !EXITED.has(at) && this.kills < 1;
    }
  }

  apply(step: Step): void {
    const { action, actor } = step;
    switch (action) {
      case "publish":
        this.pc.set(actor, "list-waiting");
        this.phase.set(actor, "waiting");
        this.result = "published";
        return;
      case "release":
        this.pc.set(actor, "exited-ok");
        this.phase.set(actor, "absent");
        this.result = "released";
        return;
      case "kill":
        this.pc.set(actor, "killed");
        this.kills += 1;
        this.result = "killed";
        return;
      case "list":
        this.list(actor, step.seen);
        return;
    }
  }

  private list(actor: Actor, seen: ReadonlyMap<Actor, string>): void {
    const stage = LISTING_STAGE[this.pcOf(actor)]!;
    if (this.phase.get(actor) !== stage) throw new Error(`${actor} lists at ${stage} with a ${String(this.phase.get(actor))} claim`);
    const files: { actor: Actor; phase: StateMutationClaimPhase; live: boolean }[] = [{ actor, phase: stage, live: true }];
    for (const other of ACTORS) {
      if (other === actor) continue;
      const report = seen.get(other)!;
      if (report === "absent") continue;
      if (!PHASES.includes(report)) throw new Error(`the listing reports ${report} for ${other}`);
      const dead = this.pcOf(other) === "killed";
      files.push({ actor: other, phase: report as StateMutationClaimPhase, live: !dead || this.defect === "keep-dead" });
    }
    const { live, left } = productionListing(files);
    const liveFiles = files.filter((file) => file.live);
    const expectedLeft = liveFiles.map((file) => stateMutationClaimName(TARGET_SHA256, file.phase, CLAIM_IDS[file.actor])).sort();
    if (JSON.stringify(left) !== JSON.stringify(expectedLeft)) {
      throw new ReplayDivergence(`the listing left ${JSON.stringify(left)} instead of the live claims ${JSON.stringify(expectedLeft)}`);
    }
    const listed = live.map((entry) => `${entry.phase}:${entry.claim.claimId}`).sort();
    const expectedListed = liveFiles.map((file) => `${file.phase}:${CLAIM_IDS[file.actor]}`).sort();
    if (JSON.stringify(listed) !== JSON.stringify(expectedListed)) {
      throw new ReplayDivergence(`the listing returned ${JSON.stringify(listed)} instead of ${JSON.stringify(expectedListed)}`);
    }
    const removed = files.filter((file) => !file.live);
    if (removed.length > 0) {
      // The helper lists again after it removes a dead claim.
      for (const file of removed) this.phase.set(file.actor, "absent");
      this.result = "reaped";
      return;
    }
    let decision: StateMutationClaimStageDecision = decideStateMutationClaimStage(stage, CLAIM_IDS[actor], live);
    if (this.defect === "ignore-held" && stage === "held") decision = "proceed";
    this.result = decision;
    if (decision === "busy") {
      this.pc.set(actor, "exited-busy");
      this.phase.set(actor, "absent");
    } else if (decision === "two-owners") {
      this.pc.set(actor, "exited-failed");
      this.phase.set(actor, "absent");
    } else if (stage === "waiting") {
      this.pc.set(actor, "list-candidate");
      this.phase.set(actor, "candidate");
    } else if (stage === "candidate") {
      this.pc.set(actor, "list-held");
      this.phase.set(actor, "held");
    } else {
      this.pc.set(actor, "critical");
    }
  }

  snapshot(): Snapshot {
    return { pc: new Map(this.pc), phase: new Map(this.phase), result: this.result, kills: this.kills };
  }
}

function modelState(state: ItfState): Snapshot {
  return {
    pc: itfStringMap(itfVariable(state, "pc"), "pc", itfString),
    phase: itfStringMap(itfVariable(state, "phase"), "phase", itfString),
    result: itfString(itfVariable(state, "result"), "result"),
    kills: itfInt(itfVariable(state, "kills"), "kills"),
  };
}

function describeValue(value: unknown): string {
  if (value instanceof Map) {
    return `{${[...value].sort(([left], [right]) => String(left).localeCompare(String(right))).map(([key, entry]) => `${String(key)}: ${String(entry)}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

function difference(actual: Snapshot, expected: Snapshot): string | null {
  for (const field of Object.keys(expected) as (keyof Snapshot)[]) {
    const left = describeValue(actual[field]);
    const right = describeValue(expected[field]);
    if (left !== right) return `${field} is ${left} in production and ${right} in the model`;
  }
  return null;
}

function recordedAction(state: ItfState): string {
  return itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
}

function operation(state: ItfState): Step {
  const action = recordedAction(state);
  const picks = itfRecord(itfVariable(state, "mbt::nondetPicks"), PICKS, "mbt::nondetPicks");
  const values = new Map<string, string | null>();
  for (const name of PICKS) {
    const picked = itfOption(picks.get(name)!, `mbt::nondetPicks.${name}`);
    values.set(name, picked === null ? null : itfString(picked, `mbt::nondetPicks.${name}`));
  }
  const actor = values.get("a");
  const seeA = values.get("seeA");
  const seeB = values.get("seeB");
  if (!(ACTIONS as readonly string[]).includes(action) || actor == null || seeA == null || seeB == null) {
    throw new Error(`state ${String(state.index)} records an unknown action or a missing pick`);
  }
  if (!(ACTORS as readonly string[]).includes(actor) || !REPORTS.includes(seeA) || !REPORTS.includes(seeB)) {
    throw new Error(`state ${String(state.index)} picks an unknown process or report`);
  }
  return { action: action as Action, actor: actor as Actor, seen: new Map<Actor, string>([["a", seeA], ["b", seeB]]) };
}

function label(step: Step, stage: string): string {
  return step.action === "list" ? `list(${step.actor}) at ${stage}` : `${step.action}(${step.actor})`;
}

/** Drive production through every recorded action of `trace`, failing at the first divergence. */
function replay(trace: ItfTrace, world: ClaimWorld): void {
  const [initial, ...steps] = trace.states;
  if (initial === undefined) throw new Error("A trace needs its initial state");
  if (recordedAction(initial) !== "init") throw new Error("A trace must start with the init action");
  const start = difference(world.snapshot(), modelState(initial));
  if (start !== null) throw new ReplayDivergence(`state 0: ${start}`);
  for (const state of steps) {
    const step = operation(state);
    const stage = world.pcOf(step.actor);
    if (!world.admits(step.action, step.actor)) {
      throw new ReplayDivergence(`state ${String(state.index)}: production does not admit ${label(step, stage)}`);
    }
    try {
      world.apply(step);
    } catch (error) {
      if (error instanceof ReplayDivergence) throw new ReplayDivergence(`state ${String(state.index)}: ${error.message}`);
      throw error;
    }
    const found = difference(world.snapshot(), modelState(state));
    if (found !== null) throw new ReplayDivergence(`state ${String(state.index)}: after ${label(step, stage)} ${found}`);
  }
}

function divergence(trace: ItfTrace, world: ClaimWorld): string | null {
  try {
    replay(trace, world);
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error.message;
    throw error;
  }
}

function criticalCount(state: ItfState): number {
  return [...itfStringMap(itfVariable(state, "pc"), "pc", itfString).values()].filter((at) => at === "critical").length;
}

const lockedModel = () => quintModel(MODEL_FILE);
const traces = quintTraceCache(MODEL_FILE);

describe("state-claim.qnt ITF replay", () => {
  test("replays every seeded model trace through the production claim listing and decision", async () => {
    const model = await lockedModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-state-claim-replay.test.ts");
    // A kill ends most random traces before the rarer races, so the replay
    // also covers the model's kill-free step.
    const all = [...await traces(model.step), ...await traces("stepNoKill")];
    expect(all).toHaveLength(2 * model.replay.traces);
    const covered = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      const world = new ClaimWorld();
      expect(divergence(trace, world)).toBeNull();
      let previous = trace.states[0]!;
      for (const state of trace.states.slice(1)) {
        const step = operation(state);
        const stage = modelState(previous).pc.get(step.actor)!;
        covered.add(label(step, stage));
        if (step.action === "list") covered.add(`${stage} -> ${modelState(state).result}`);
        previous = state;
      }
    }
    const expected = [
      ...ACTORS.flatMap((actor) => [
        `publish(${actor})`, `release(${actor})`, `kill(${actor})`,
        ...Object.keys(LISTING_STAGE).map((stage) => `list(${actor}) at ${stage}`),
      ]),
      "list-waiting -> proceed", "list-waiting -> busy", "list-waiting -> reaped",
      "list-candidate -> proceed", "list-candidate -> busy", "list-candidate -> reaped",
      "list-held -> proceed", "list-held -> two-owners", "list-held -> reaped",
    ];
    expect(expected.filter((entry) => !covered.has(entry))).toEqual([]);
  });

  test("a held listing that ignores another held claim diverges from the model traces", async () => {
    const all = await traces("stepNoKill");
    const first = all.map((trace) => divergence(trace, new ClaimWorld("ignore-held"))).find((message) => message !== null);
    expect(first).toMatch(/^state \d+: after list\([ab]\) at list-held pc is \{.*\} in production and \{.*\} in the model$/u);
  });

  test("a listing that keeps a dead claim diverges from the model traces", async () => {
    const model = await lockedModel();
    const all = await traces(model.step);
    const first = all.map((trace) => divergence(trace, new ClaimWorld("keep-dead"))).find((message) => message !== null);
    expect(first).toMatch(/^state \d+: after list\([ab]\) at list-[a-z]+ /u);
  });

  for (const step of ["stepNoHeldListing", "stepNoHeldCheck"]) {
    test(`production refuses to enter the critical section in every ${step} trace that admits two owners`, async () => {
      const model = await lockedModel();
      expect(model.mutants.map((mutant) => mutant.step)).toContain(step);
      const all = await traces(step);
      let violating = 0;
      for (const trace of all) {
        const breaks = trace.states.findIndex((state) => criticalCount(state) > 1);
        if (breaks < 0) continue;
        violating += 1;
        const message = divergence(trace, new ClaimWorld());
        expect(message).not.toBeNull();
        const match = /^state (\d+): after list\([ab]\) at list-(candidate|held) pc is \{(.*)\} in production and \{(.*)\} in the model$/u.exec(message!);
        expect(match).not.toBeNull();
        // Production diverges no later than the step that admits the second
        // owner, and it diverges by keeping a process out of the critical
        // section that the variant lets in.
        expect(Number(match![1])).toBeLessThanOrEqual(breaks);
        const productionCritical = (match![3]!.match(/critical/gu) ?? []).length;
        const variantCritical = (match![4]!.match(/critical/gu) ?? []).length;
        expect(productionCritical).toBeLessThan(variantCritical);
      }
      expect(violating).toBeGreaterThan(0);
    });
  }

  test("an unknown action or a missing pick fails closed instead of skipping a step", () => {
    const none = { tag: "None", value: { "#tup": [] } };
    const some = (value: string) => ({ tag: "Some", value });
    const byActor = (value: unknown) => ({ "#map": ACTORS.map((actor) => [actor, value]) });
    const observed = {
      "#map": ACTORS.map((listener) => [listener, {
        "#map": ACTORS.map((other) => [other, { "#set": [other === listener ? "self" : "absent"] }]),
      }]),
    };
    const trace = (action: string, a: unknown, seeA: unknown, pc: string, result: string): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [
        {
          "#meta": { index: 0 }, pc: byActor("start"), phase: byActor("absent"), observed, result: "none",
          kills: { "#bigint": "0" }, "mbt::actionTaken": "init", "mbt::nondetPicks": { a: none, seeA: none, seeB: none },
        },
        {
          "#meta": { index: 1 }, pc: { "#map": [["a", pc], ["b", "start"]] },
          phase: { "#map": [["a", pc === "list-waiting" ? "waiting" : "absent"], ["b", "absent"]] }, observed, result,
          kills: { "#bigint": "0" }, "mbt::actionTaken": action, "mbt::nondetPicks": { a, seeA, seeB: some("absent") },
        },
      ],
    }));
    expect(divergence(trace("publish", some("a"), some("self"), "list-waiting", "published"), new ClaimWorld())).toBeNull();
    expect(() => divergence(trace("steal", some("a"), some("self"), "list-waiting", "published"), new ClaimWorld())).toThrow("unknown action");
    expect(() => divergence(trace("publish", none, some("self"), "list-waiting", "published"), new ClaimWorld())).toThrow("missing pick");
    expect(() => divergence(trace("publish", some("c"), some("self"), "list-waiting", "published"), new ClaimWorld())).toThrow("unknown process");
    expect(divergence(trace("publish", some("a"), some("self"), "start", "published"), new ClaimWorld()))
      .toBe("state 1: after publish(a) pc is {a: list-waiting, b: start} in production and {a: start, b: start} in the model");
  });
});
