/**
 * ITF trace replay for `verification/quint/retained.qnt`: how an unsettled
 * portable write leaves the intent fence and its plugin bundle.
 *
 * Every seeded trace drives the production cores over an in-memory store:
 * - run journals through `initialRunJournal` and `transitionRunJournal`,
 *   including `duplicate-successor-claimed` and `duplicate-source-superseded`;
 * - an observed readback through `reconciledRecoveryRelease` (applied) and
 *   `observedNotAppliedRelease` (not applied), the events
 *   `reconcilePortableProviderPluginRunFromReadback` records;
 * - supersession through `duplicateSourceSupersession`, the decision
 *   `supersedeSettledDuplicateSources` makes;
 * - the retry's fence through `intentFenceBlocker`;
 * - bundle removal through `inspectPortableProviderPluginQuiescence` over the
 *   replayed journals.
 *
 * Whether the plugin declared a readback is the trace's own choice here; the
 * manifest parser and the readback port's `declares` check are covered by
 * their example tests.
 */
import { describe, expect, test } from "bun:test";

import { canonicalJson, sha256 } from "../src/canonical-json.js";
import type { ConfirmedWriteIntent } from "../src/confirmed-write-model.js";
import { inspectPortableProviderPluginQuiescence } from "../src/provider-plugin-lifecycle-kernel.js";
import type { PortableOperationIdentityV1 } from "../src/provider-plugin-portable-identity.js";
import {
  initialRunJournal,
  transitionRunJournal,
  type RunJournal,
  type RunJournalEvent,
} from "../src/run-journal.js";
import {
  duplicateSourceSupersession,
  intentFenceBlocker,
  observedNotAppliedRelease,
  reconciledRecoveryRelease,
} from "../src/runtime.js";
import {
  itfOption,
  itfRecord,
  itfString,
  itfVariable,
  type ItfState,
  type ItfTrace,
} from "./verification-itf.js";
import { itfBool, quintModel, quintTraceCache } from "./verification-replay.js";

const MODEL_FILE = "retained.qnt";
const TRACE_VARIABLES = [
  "declared", "elected", "mbt::actionTaken", "mbt::nondetPicks", "observed", "removed", "result", "retried",
  "retryApplied", "srcApplied", "srcLedger", "srcPhase", "srcRecovery", "srcStatus", "succApplied", "succPhase",
  "succRecovery", "succStatus", "superseded",
].sort();
const ACTIONS = [
  "dispatchSource", "finishSource", "readback", "electSuccessor", "finishSuccessor", "reconcileSuccessor", "supersede",
  "retry", "remove",
] as const;
type Action = (typeof ACTIONS)[number];
const MUTANT_STEPS = ["stepUntruthfulReadback", "stepSupersedeReleasesLedger"] as const;

const SOURCE = "11111111-1111-4111-8111-111111111111";
const SUCCESSOR = "22222222-2222-4222-8222-222222222222";
const RETRY = "33333333-3333-4333-8333-333333333333";
const STARTED_AT = Date.parse("2026-09-24T00:00:00.000Z");
const FAR_FUTURE = "2100-01-01T00:00:00.000Z";
const BUNDLE = "3".repeat(64);
const IDENTITY: PortableOperationIdentityV1 = Object.freeze({
  pluginId: "retained-portable",
  pluginVersion: "1.0.0",
  hostApiVersion: 1,
  bundleSha256: BUNDLE,
  manifestSha256: "4".repeat(64),
  adapterId: "retained-portable-web",
  transport: "web-session-api",
  surfaceId: "retained-portable",
  operation: "posts.publish",
  contractVersion: 1,
  descriptorSha256: "5".repeat(64),
});
const SUCCESSOR_INTENT = sha256(`retained-successor\0${SOURCE}`);
const OWNER = {
  pid: 4242,
  token: "44444444-4444-4444-8444-444444444444",
  bootId: "1".repeat(64),
  processStartId: "2".repeat(64),
  leaseUntil: FAR_FUTURE,
};

class ReplayDivergence extends Error {}

type Snapshot = Readonly<{
  declared: boolean;
  srcPhase: string;
  srcStatus: string;
  srcLedger: string;
  srcRecovery: string;
  srcApplied: boolean;
  observed: string;
  elected: boolean;
  superseded: boolean;
  succPhase: string;
  succStatus: string;
  succRecovery: string;
  succApplied: boolean;
  retried: boolean;
  retryApplied: boolean;
  removed: boolean;
  quiescent: boolean;
  result: string;
}>;

/** The model's phase for a journal: dispatching until terminal. */
function phaseOf(journal: RunJournal | undefined): string {
  if (journal === undefined) return "none";
  return journal.phase === "terminal" ? "terminal" : "dispatching";
}

function intentOf(journal: RunJournal): ConfirmedWriteIntent {
  return {
    adapterId: journal.adapter.id,
    authId: journal.auth.id,
    operationId: journal.operation,
    inputHashes: [journal.inputHash],
    ...(journal.duplicateIntent === undefined ? {} : { duplicateIntentHash: journal.duplicateIntent.intentHash }),
  };
}

/** Production quiescence over the replayed journals and no other state. */
function productionQuiescent(journals: readonly RunJournal[]): boolean {
  return inspectPortableProviderPluginQuiescence(BUNDLE, {}, {
    listPlans: () => [],
    loadPlan: () => {
      throw new Error("the replay stores no plans");
    },
    listConfirmationClaims: () => [],
    listInvocationLeases: () => [],
    invocationLeaseOwnerStatus: () => "different-or-dead",
    listStateDirectory: () => [],
    listReceipts: () => [],
    listJournals: () => journals.map((journal) => ({ journal, contentSha256: sha256(canonicalJson(journal)) })),
    listRecoveryCapsules: () => [],
    listLinkedDeviceLifecycles: () => [],
  }).quiescent;
}

class RetainedWorld {
  private readonly journals = new Map<string, RunJournal>();
  private declared = false;
  private srcApplied = false;
  private succApplied = false;
  private retryApplied = false;
  private observed = "none";
  private removed = false;
  private clock = 0;
  private result = "none";

  /**
   * `untruthful` seeds the pre-fix defect of trusting a readback that may
   * report not-applied after an applied effect.
   */
  constructor(private readonly untruthful = false) {}

  start(declared: boolean): void {
    this.declared = declared;
  }

  private at(): string {
    this.clock += 1;
    return new Date(STARTED_AT + this.clock * 1_000).toISOString();
  }

  private record(runId: string, event: RunJournalEvent): void {
    const journal = this.journals.get(runId);
    if (journal === undefined) throw new Error(`${runId} has no journal`);
    this.journals.set(runId, transitionRunJournal(journal, event));
  }

  /** Start a run and cross its claim, recovery, and optional dispatch boundary. */
  private open(runId: string, duplicate: boolean): RunJournal {
    const started = this.at();
    const journal = transitionRunJournal(initialRunJournal({
      runId,
      planDigest: sha256(`plan-${runId}`),
      adapter: { id: IDENTITY.adapterId, version: "1.0.0", hash: sha256("retained-manifest") },
      operation: "posts.publish",
      risk: "R3",
      inputHash: sha256("retained-input"),
      auth: { id: "retained-main", hash: sha256("retained-auth"), kind: "browser-profile" },
      contract: { transport: "portable-provider-plugin", identity: IDENTITY },
      ...(duplicate ? { duplicateIntent: { schemaVersion: 1 as const, intentHash: SUCCESSOR_INTENT, sourceRunId: SOURCE } } : {}),
      plannedDispatches: 1,
      hasPlanAssets: false,
      owner: OWNER,
      startedAt: started,
      dedupeExpiresAt: FAR_FUTURE,
    }), { type: "confirmation-consumed", at: started });
    const blocker = intentFenceBlocker([...this.journals.values()], intentOf(journal), runId, new Date(STARTED_AT + this.clock * 1_000));
    if (blocker !== null) throw new ReplayDivergence(`the intent fence refused ${runId}`);
    this.journals.set(runId, journal);
    this.record(runId, { type: "ledger-claimed", ledgerRelativePath: `idempotency/${sha256(runId).slice(0, 2)}/${sha256(runId)}.json`, at: this.at() });
    this.record(runId, { type: "recovery-stored", at: this.at() });
    return journal;
  }

  private finish(runId: string, outcome: string): void {
    if (outcome === "succeeded") {
      this.record(runId, { type: "dispatch-verified", index: 1, at: this.at() });
      this.record(runId, { type: "finished", status: "succeeded", finalOrigin: null, error: null, at: this.at() });
    } else {
      this.record(runId, {
        type: "finished", status: "indeterminate", finalOrigin: null,
        error: "a dispatch crossed its durable start boundary; a missing final outcome requires reconciliation", at: this.at(),
      });
    }
  }

  /** Whether production admits `action` now. Mutant replay skips what it refuses. */
  admits(action: Action): boolean {
    const source = this.journals.get(SOURCE);
    const successor = this.journals.get(SUCCESSOR);
    switch (action) {
      case "dispatchSource": return source === undefined && !this.removed;
      case "finishSource": return source !== undefined && source.phase !== "terminal";
      case "readback":
        // The CLI invokes a readback only for a declared write; the recovery
        // reconciler requires the retained, unelected, unsettled source.
        return this.declared && !this.removed && source?.status === "indeterminate"
          && source.recoveryState === "retained" && source.duplicateSuccessor === undefined && this.observed === "none";
      case "electSuccessor":
        return !this.removed && successor === undefined && source?.status === "indeterminate"
          && source.recoveryState === "retained" && source.duplicateSuccessor === undefined;
      case "finishSuccessor": return successor !== undefined && successor.phase !== "terminal";
      case "reconcileSuccessor":
        return !this.removed && successor?.status === "indeterminate" && successor.recoveryState === "retained" && this.succApplied;
      case "supersede":
        return source !== undefined && duplicateSourceSupersession(source, successor, new Date(STARTED_AT)) !== null;
      case "retry": {
        if (source?.phase !== "terminal" || this.journals.has(RETRY) || this.removed) return false;
        const probe = { ...source, runId: RETRY };
        return intentFenceBlocker([...this.journals.values()], intentOf(probe), RETRY, new Date(STARTED_AT)) === null;
      }
      case "remove": return !this.removed && productionQuiescent([...this.journals.values()]);
    }
  }

  apply(action: Action, outcome: string, observation: string): void {
    switch (action) {
      case "dispatchSource":
        this.open(SOURCE, false);
        this.record(SOURCE, { type: "dispatch-started", index: 1, at: this.at() });
        this.result = "dispatched";
        return;
      case "finishSource":
        this.finish(SOURCE, outcome);
        this.srcApplied = outcome !== "lost";
        this.result = outcome;
        return;
      case "readback": {
        if (observation === "unknown") {
          this.result = "fence-retained";
          return;
        }
        const source = this.journals.get(SOURCE)!;
        const notApplied = this.untruthful || !this.srcApplied;
        const now = new Date(STARTED_AT + (this.clock + 1) * 1_000);
        this.at();
        this.record(SOURCE, notApplied ? observedNotAppliedRelease(source, now) : reconciledRecoveryRelease(source, now));
        this.observed = notApplied ? "not-applied" : "applied";
        this.result = notApplied ? "released" : "settled";
        return;
      }
      case "electSuccessor":
        this.open(SUCCESSOR, true);
        // claimDuplicateRiskSource elects the source before the successor's dispatch boundary.
        this.record(SOURCE, { type: "duplicate-successor-claimed", intentHash: SUCCESSOR_INTENT, runId: SUCCESSOR, at: this.at() });
        this.record(SUCCESSOR, { type: "dispatch-started", index: 1, at: this.at() });
        this.result = "elected";
        return;
      case "finishSuccessor":
        this.finish(SUCCESSOR, outcome);
        this.succApplied = outcome !== "lost";
        this.result = outcome;
        return;
      case "reconcileSuccessor": {
        const successor = this.journals.get(SUCCESSOR)!;
        this.at();
        this.record(SUCCESSOR, reconciledRecoveryRelease(successor, new Date(STARTED_AT + this.clock * 1_000)));
        this.result = "settled";
        return;
      }
      case "supersede": {
        this.at();
        const event = duplicateSourceSupersession(
          this.journals.get(SOURCE)!,
          this.journals.get(SUCCESSOR),
          new Date(STARTED_AT + this.clock * 1_000),
        );
        if (event === null) throw new ReplayDivergence("supersession refused a settled elected successor");
        this.record(SOURCE, event);
        this.result = "superseded";
        return;
      }
      case "retry":
        this.open(RETRY, false);
        this.record(RETRY, { type: "dispatch-started", index: 1, at: this.at() });
        this.finish(RETRY, "succeeded");
        this.retryApplied = true;
        this.result = "retried";
        return;
      case "remove":
        this.removed = true;
        this.result = "removed";
        return;
    }
  }

  snapshot(): Snapshot {
    const source = this.journals.get(SOURCE);
    const successor = this.journals.get(SUCCESSOR);
    const recovery = (journal: RunJournal | undefined): string => journal === undefined ? "none" : journal.recoveryState;
    return {
      declared: this.declared,
      srcPhase: phaseOf(source),
      srcStatus: source?.status ?? "none",
      srcLedger: source === undefined ? "none" : source.ledgerState,
      srcRecovery: recovery(source),
      srcApplied: this.srcApplied,
      observed: this.observed,
      elected: source?.duplicateSuccessor !== undefined,
      superseded: source?.supersededBy !== undefined,
      succPhase: phaseOf(successor),
      succStatus: successor?.status ?? "none",
      succRecovery: recovery(successor),
      succApplied: this.succApplied,
      retried: this.journals.has(RETRY),
      retryApplied: this.retryApplied,
      removed: this.removed,
      quiescent: productionQuiescent([...this.journals.values()]),
      result: this.result,
    };
  }
}

function holds(phase: string, recovery: string): boolean {
  return phase === "dispatching" || recovery === "present" || recovery === "retained";
}

function modelState(state: ItfState): Snapshot {
  const text = (name: string) => itfString(itfVariable(state, name), name);
  const flag = (name: string) => itfBool(itfVariable(state, name), name);
  const srcPhase = text("srcPhase");
  const succPhase = text("succPhase");
  const srcRecovery = text("srcRecovery");
  const succRecovery = text("succRecovery");
  return {
    declared: flag("declared"),
    srcPhase,
    srcStatus: text("srcStatus"),
    srcLedger: text("srcLedger"),
    srcRecovery,
    srcApplied: flag("srcApplied"),
    observed: text("observed"),
    elected: flag("elected"),
    superseded: flag("superseded"),
    succPhase,
    succStatus: text("succStatus"),
    succRecovery,
    succApplied: flag("succApplied"),
    retried: flag("retried"),
    retryApplied: flag("retryApplied"),
    removed: flag("removed"),
    quiescent: !holds(srcPhase, srcRecovery) && !holds(succPhase, succRecovery),
    result: text("result"),
  };
}

/** The first clause of the model's `retainedSafety` that `state` breaks, or null. */
function safetyViolation(state: Snapshot): string | null {
  const effects = [state.srcApplied, state.succApplied, state.retryApplied].filter(Boolean).length;
  if (effects > 1 + (state.elected ? 1 : 0)) return `${String(effects)} effects with ${state.elected ? 1 : 0} elected successors`;
  if (state.srcStatus === "indeterminate" && state.observed !== "not-applied" && state.srcLedger !== "indeterminate") {
    return "the indeterminate source lost its ledger without an observed not-applied readback";
  }
  if (state.superseded && !(state.elected && state.succPhase === "terminal" && state.succRecovery === "released")) {
    return "the source was superseded before its elected successor settled";
  }
  if (state.observed !== "none" && state.elected) return "an elected source was read back";
  return null;
}

type Step = Readonly<{ action: Action; outcome: string; observation: string }>;

function pick(state: ItfState, name: string): string | null {
  const picks = itfRecord(itfVariable(state, "mbt::nondetPicks"), ["b", "d", "o"], "mbt::nondetPicks");
  const value = itfOption(picks.get(name)!, `mbt::nondetPicks.${name}`);
  return value === null ? null : itfString(value, `mbt::nondetPicks.${name}`);
}

function operation(state: ItfState): Step {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const outcome = pick(state, "o");
  const observation = pick(state, "b");
  if (!(ACTIONS as readonly string[]).includes(action) || outcome === null || observation === null) {
    throw new Error(`state ${String(state.index)} records an unknown action or a missing pick`);
  }
  if (!["succeeded", "applied", "lost"].includes(outcome) || !["truth", "unknown"].includes(observation)) {
    throw new Error(`state ${String(state.index)} picks an unknown outcome or observation`);
  }
  return { action: action as Action, outcome, observation };
}

function initialDeclared(trace: ItfTrace): boolean {
  const [initial] = trace.states;
  if (initial === undefined || itfString(itfVariable(initial, "mbt::actionTaken"), "mbt::actionTaken") !== "init") {
    throw new Error("A trace must start with the init action");
  }
  return itfBool(itfVariable(initial, "declared"), "declared");
}

function difference(actual: Snapshot, expected: Snapshot): string | null {
  for (const field of Object.keys(expected) as (keyof Snapshot)[]) {
    if (actual[field] !== expected[field]) {
      return `${field} is ${JSON.stringify(actual[field])} in production and ${JSON.stringify(expected[field])} in the model`;
    }
  }
  return null;
}

function replay(trace: ItfTrace, world: RetainedWorld): void {
  world.start(initialDeclared(trace));
  const start = difference(world.snapshot(), modelState(trace.states[0]!));
  if (start !== null) throw new ReplayDivergence(`state 0: ${start}`);
  for (const state of trace.states.slice(1)) {
    const { action, outcome, observation } = operation(state);
    if (!world.admits(action)) throw new ReplayDivergence(`state ${String(state.index)}: production does not admit ${action}`);
    try {
      world.apply(action, outcome, observation);
    } catch (error) {
      if (error instanceof ReplayDivergence) throw new ReplayDivergence(`state ${String(state.index)}: ${action}: ${error.message}`);
      throw error;
    }
    const found = difference(world.snapshot(), modelState(state));
    if (found !== null) throw new ReplayDivergence(`state ${String(state.index)}: after ${action} ${found}`);
  }
}

function divergence(trace: ItfTrace, world: RetainedWorld): string | null {
  try {
    replay(trace, world);
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error.message;
    throw error;
  }
}

/**
 * Drive fixed production through a mutant's trace, applying only what it
 * admits, and fail if production's own state ever breaks a safety clause.
 * Returns the actions the mutant takes that production refuses.
 */
function refusedActions(trace: ItfTrace): readonly string[] {
  const world = new RetainedWorld();
  world.start(initialDeclared(trace));
  const refused: string[] = [];
  for (const state of trace.states.slice(1)) {
    const { action, outcome, observation } = operation(state);
    if (world.admits(action)) world.apply(action, outcome, observation);
    else refused.push(`state ${String(state.index)}: ${action}`);
    const broken = safetyViolation(world.snapshot());
    if (broken !== null) throw new Error(`state ${String(state.index)}: production broke retained safety: ${broken}`);
  }
  return refused;
}

const lockedModel = () => quintModel(MODEL_FILE);
const traces = quintTraceCache(MODEL_FILE);

describe("retained.qnt ITF replay", () => {
  test("replays every seeded model trace through the production cores", async () => {
    const model = await lockedModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-retained-replay.test.ts");
    expect(model.mutants.map((mutant) => mutant.step).sort()).toEqual([...MUTANT_STEPS].sort());
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const covered = new Set<string>();
    let releasedAfterSupersession = 0;
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      expect(divergence(trace, new RetainedWorld())).toBeNull();
      for (const state of trace.states.slice(1)) {
        const snapshot = modelState(state);
        covered.add(`${operation(state).action} -> ${snapshot.result}`);
        expect(safetyViolation(snapshot)).toBeNull();
        if (snapshot.result === "removed" && snapshot.superseded && snapshot.srcStatus === "indeterminate") {
          releasedAfterSupersession += 1;
        }
      }
    }
    const expected = [
      "dispatchSource -> dispatched",
      "finishSource -> succeeded", "finishSource -> applied", "finishSource -> lost",
      "readback -> released", "readback -> settled", "readback -> fence-retained",
      "electSuccessor -> elected",
      "finishSuccessor -> succeeded", "finishSuccessor -> applied", "finishSuccessor -> lost",
      "reconcileSuccessor -> settled",
      "supersede -> superseded",
      "retry -> retried",
      "remove -> removed",
    ];
    expect(expected.filter((entry) => !covered.has(entry))).toEqual([]);
    // A superseded source with its indeterminate ledger still lets the bundle go.
    expect(releasedAfterSupersession).toBeGreaterThan(0);
  });

  test("trusting an untruthful readback diverges from the model traces", async () => {
    const model = await lockedModel();
    const all = await traces(model.step);
    const first = all.map((trace) => divergence(trace, new RetainedWorld(true))).find((message) => message !== null);
    expect(first).toMatch(/^state \d+: after readback (srcLedger|observed|result) is .* in production and .* in the model$/u);
  });

  for (const step of MUTANT_STEPS) {
    test(`production keeps retained safety through every ${step} trace, including those that break it`, async () => {
      const model = await lockedModel();
      expect(model.mutants).toContainEqual({ step, invariant: "retainedSafety" });
      const all = await traces(step);
      let violating = 0;
      for (const trace of all) {
        const refused = refusedActions(trace);
        if (!trace.states.some((state) => safetyViolation(modelState(state)) !== null)) continue;
        violating += 1;
        // Each breach needs a later retry of the base intent or a released
        // ledger that fixed production never takes.
        const retries = trace.states.slice(1).some((state) => operation(state).action === "retry");
        if (retries) expect(refused.length).toBeGreaterThan(0);
      }
      expect(violating).toBeGreaterThan(0);
    });
  }

  test("the safety clauses reject each seeded breach", () => {
    const base: Snapshot = {
      declared: true, srcPhase: "terminal", srcStatus: "indeterminate", srcLedger: "indeterminate", srcRecovery: "retained",
      srcApplied: true, observed: "none", elected: false, superseded: false, succPhase: "none", succStatus: "none",
      succRecovery: "none", succApplied: false, retried: false, retryApplied: false, removed: false, quiescent: false, result: "none",
    };
    expect(safetyViolation(base)).toBeNull();
    expect(safetyViolation({ ...base, retryApplied: true })).toBe("2 effects with 0 elected successors");
    expect(safetyViolation({ ...base, srcLedger: "released" }))
      .toBe("the indeterminate source lost its ledger without an observed not-applied readback");
    expect(safetyViolation({ ...base, srcLedger: "released", observed: "not-applied", srcApplied: false })).toBeNull();
    expect(safetyViolation({ ...base, elected: true, superseded: true, succPhase: "dispatching", succRecovery: "present" }))
      .toBe("the source was superseded before its elected successor settled");
    expect(safetyViolation({ ...base, elected: true, observed: "applied" })).toBe("an elected source was read back");
  });
});
