/**
 * ITF trace replay for `verification/quint/fence.qnt`, the confirmed-write
 * intent fence.
 *
 * Every trace drives the production fence cores one recorded action at a
 * time:
 *
 * - run journals through `initialRunJournal` and `transitionRunJournal`;
 * - the journal scan through `intentFenceBlocker` and `journalFencesIntent`;
 * - the intent ledger's name through `intentLedgerPath`;
 * - a blocked confirm's outcome through `priorRunDisposition`, the decision
 *   the confirmed-write program makes;
 * - an applied reconciliation through `reconciledRecoveryRelease`.
 *
 * The world around those cores is in memory. The ledger is a map from
 * `intentLedgerPath` to its holder with the exclusive-create rule of
 * `acquireLedger`, and a not-applied claim changes no journal, as
 * `recordNotAppliedClaim` changes none. The file-backed wrappers (storage,
 * the state helper, receipts, and capsules) are outside this replay; the
 * end-to-end tests in `src/confirmed-write-intent-fence.test.ts` and
 * `src/provider-plugin-portable-runtime.test.ts` cover them.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sha256 } from "../src/canonical-json.js";
import type { ConfirmedWriteIntent } from "../src/confirmed-write-model.js";
import { priorRunDisposition } from "../src/confirmed-write-program.js";
import { initialRunJournal, transitionRunJournal, type RunJournal, type RunJournalEvent } from "../src/run-journal.js";
import {
  intentFenceBlocker,
  intentLedgerPath,
  reconciledRecoveryRelease,
  runJournalLedgerEntry,
} from "../src/runtime.js";
import {
  itfOption,
  itfRecord,
  itfString,
  itfStringSet,
  itfVariable,
  parseItfTrace,
  type ItfState,
  type ItfTrace,
  type ItfValue,
} from "./verification-itf.js";
import { itfInt, itfStringMap, quintModel, quintTraceCache } from "./verification-replay.js";

const MODEL_FILE = "fence.qnt";
const RUNS = ["r1", "r2", "r3"] as const;
const OUTCOMES = ["succeeded", "applied", "lost"] as const;
const TRACE_VARIABLES = [
  "applied", "authGen", "claimed", "dispatched", "ledger", "ledgerState", "mbt::actionTaken", "mbt::nondetPicks",
  "phase", "reconciled", "result", "rev", "runAuth", "runRev", "scanned", "status",
].sort();
const ACTIONS = ["scan", "claim", "dispatch", "finish", "reconnect", "upgrade", "reconcile", "claimNotApplied"] as const;
type Action = (typeof ACTIONS)[number];

const RUN_IDS: Readonly<Record<string, string>> = Object.freeze({
  r1: "11111111-1111-4111-8111-111111111111",
  r2: "22222222-2222-4222-8222-222222222222",
  r3: "33333333-3333-4333-8333-333333333333",
});
const ADAPTER_ID = "fence-provider";
const AUTH_ID = "fence-main";
const OPERATION = "content.save";
const INPUT_HASH = sha256("fence-replay-input");
const STARTED_AT = Date.parse("2026-09-23T00:00:00.000Z");
const FAR_FUTURE = "2100-01-01T00:00:00.000Z";

const stateHome = mkdtempSync(join(tmpdir(), "ghostget-fence-replay-"));
const environment = Object.freeze({ GHOSTGET_STATE_HOME: stateHome });
afterAll(() => rmSync(stateHome, { recursive: true, force: true }));

/**
 * Seeded defects in the world around the production cores:
 * - `hash-keyed-intent` keys the intent by the auth and adapter bytes, as
 *   the fence did before D1 was fixed;
 * - `caller-release` releases the ledger on a caller's not-applied claim, as
 *   the reconciler did before D2 was fixed.
 */
type Defect = "none" | "hash-keyed-intent" | "caller-release";

type Snapshot = Readonly<{
  phase: ReadonlyMap<string, string>;
  status: ReadonlyMap<string, string>;
  ledgerState: ReadonlyMap<string, string>;
  runAuth: ReadonlyMap<string, number>;
  runRev: ReadonlyMap<string, number>;
  authGen: number;
  rev: number;
  scanned: ReadonlySet<string>;
  ledgerHolders: ReadonlySet<string>;
  ledgerNames: number;
  dispatched: ReadonlySet<string>;
  applied: ReadonlySet<string>;
  reconciled: ReadonlySet<string>;
  claimed: ReadonlySet<string>;
  result: string;
}>;

class ReplayDivergence extends Error {}

/** The generation that a hash names, from `hashFor`. */
function generationOf(hash: string, prefix: string): number {
  for (let generation = 0; generation < 8; generation += 1) {
    if (hashFor(prefix, generation) === hash) return generation;
  }
  throw new Error(`${prefix} hash names no known generation`);
}

function hashFor(prefix: string, generation: number): string {
  return sha256(`${prefix}-${String(generation)}`);
}

/** Classify the confirmed-write program's decision for a blocked confirm. */
function blockedResult(disposition: ReturnType<typeof priorRunDisposition>): string {
  if (disposition.kind === "replay") return "replayed";
  if (/^a prior attempt \([0-9a-f-]{36}\) may have reached the provider;/u.test(disposition.message)) return "refused";
  if (/^a prior run \([0-9a-f-]{36}\) already fulfilled this intent under a different auth record/u.test(disposition.message)) {
    return "withheld";
  }
  throw new Error(`the confirmed-write program refused for an unexpected reason: ${disposition.message}`);
}

class FenceWorld {
  private readonly journals = new Map<string, RunJournal>();
  private readonly ledger = new Map<string, string>();
  private readonly scanned = new Set<string>();
  private readonly applied = new Set<string>();
  private readonly claims = new Set<string>();
  private authGen = 0;
  private rev = 0;
  private clock = 0;
  private result = "none";

  constructor(private readonly defect: Defect = "none") {}

  private now(): Date {
    this.clock += 1;
    return new Date(STARTED_AT + this.clock * 1_000);
  }

  private at(): string {
    return this.now().toISOString();
  }

  private adapterId(generation: number): string {
    return this.defect === "hash-keyed-intent" ? `${ADAPTER_ID}-${String(generation)}` : ADAPTER_ID;
  }

  private authId(generation: number): string {
    return this.defect === "hash-keyed-intent" ? `${AUTH_ID}-${String(generation)}` : AUTH_ID;
  }

  /** The intent of a confirm bound to auth generation `auth` and revision `revision`. */
  private intent(auth: number, revision: number): ConfirmedWriteIntent {
    return { adapterId: this.adapterId(revision), authId: this.authId(auth), operationId: OPERATION, inputHashes: [INPUT_HASH] };
  }

  private journal(run: string): RunJournal {
    const journal = this.journals.get(run);
    if (journal === undefined) throw new Error(`${run} has no journal`);
    return journal;
  }

  private record(run: string, event: RunJournalEvent): void {
    this.journals.set(run, transitionRunJournal(this.journal(run), event));
  }

  private bound(journal: RunJournal): boolean {
    return journal.auth.hash === hashFor("auth", this.authGen) && journal.adapter.hash === hashFor("manifest", this.rev);
  }

  private refuse(run: string, existing: RunJournal): void {
    const journal = this.journal(run);
    const disposition = priorRunDisposition(
      { existing: runJournalLedgerEntry(existing), viaIntent: true },
      { inputHash: journal.inputHash, adapterHash: journal.adapter.hash, authHash: journal.auth.hash, authId: journal.auth.id },
    );
    this.result = blockedResult(disposition);
    this.scanned.delete(run);
    this.record(run, { type: "finished", status: "failed", finalOrigin: null, error: "another run already owns this idempotency scope", at: this.at() });
  }

  /** Whether production may apply `action` to `run` now; mutant replay skips the rest. */
  admits(action: Action, run: string): boolean {
    const journal = this.journals.get(run);
    switch (action) {
      case "scan": return journal === undefined;
      case "claim": return journal?.phase === "prepared" && this.scanned.has(run);
      case "dispatch": return journal?.phase === "claimed";
      case "finish": return journal?.phase === "dispatching";
      case "reconnect": case "upgrade": return true;
      case "reconcile": case "claimNotApplied":
        return journal?.status === "indeterminate" && journal.recoveryState !== "released" && this.bound(journal);
    }
  }

  apply(action: Action, run: string, outcome: string): void {
    switch (action) {
      case "scan": {
        const started = this.now().toISOString();
        const journal = transitionRunJournal(initialRunJournal({
          runId: RUN_IDS[run]!,
          planDigest: sha256(`plan-${run}`),
          adapter: { id: this.adapterId(this.rev), version: `1.${String(this.rev)}.0`, hash: hashFor("manifest", this.rev) },
          operation: OPERATION,
          risk: "R2",
          inputHash: INPUT_HASH,
          auth: { id: this.authId(this.authGen), hash: hashFor("auth", this.authGen), kind: "oauth-token-file" },
          contract: { transport: "provider-api", hash: sha256("fence-contract") },
          plannedDispatches: 1,
          hasPlanAssets: false,
          owner: {
            pid: 4242,
            token: "44444444-4444-4444-8444-444444444444",
            bootId: "1".repeat(64),
            processStartId: "2".repeat(64),
            leaseUntil: FAR_FUTURE,
          },
          startedAt: started,
          dedupeExpiresAt: FAR_FUTURE,
        }), { type: "confirmation-consumed", at: started });
        this.journals.set(run, journal);
        const blocker = intentFenceBlocker(
          [...this.journals.values()],
          this.intent(this.authGen, this.rev),
          journal.runId,
          this.now(),
        );
        if (blocker !== null) {
          this.refuse(run, blocker);
        } else {
          this.scanned.add(run);
          this.result = "clear";
        }
        return;
      }
      case "claim": {
        const journal = this.journal(run);
        const path = intentLedgerPath(
          journal.adapter.id, journal.auth.id, journal.operation, journal.inputHash, environment,
        );
        const holder = this.ledger.get(path);
        if (holder !== undefined) {
          this.refuse(run, this.journal(holder));
          return;
        }
        this.ledger.set(path, run);
        this.scanned.delete(run);
        const bucket = sha256(`${journal.adapter.hash}\0${journal.auth.hash}\0${journal.inputHash}`);
        this.record(run, { type: "ledger-claimed", ledgerRelativePath: `idempotency/${bucket.slice(0, 2)}/${bucket}.json`, at: this.at() });
        this.result = "claimed";
        return;
      }
      case "dispatch":
        this.record(run, { type: "recovery-stored", at: this.at() });
        this.record(run, { type: "dispatch-started", index: 1, at: this.at() });
        this.result = "dispatched";
        return;
      case "finish":
        if (outcome === "succeeded") {
          this.record(run, { type: "dispatch-verified", index: 1, at: this.at() });
          this.record(run, { type: "finished", status: "succeeded", finalOrigin: null, error: null, at: this.at() });
        } else {
          this.record(run, {
            type: "finished", status: "indeterminate", finalOrigin: null,
            error: "a dispatch crossed its durable start boundary; a missing final outcome requires reconciliation", at: this.at(),
          });
        }
        if (outcome !== "lost") this.applied.add(run);
        this.result = outcome;
        return;
      case "reconnect":
        this.authGen += 1;
        this.result = "reconnected";
        return;
      case "upgrade":
        this.rev += 1;
        this.result = "upgraded";
        return;
      case "reconcile": {
        const journal = this.journal(run);
        if (!this.bound(journal)) throw new ReplayDivergence(`reconciliation refused ${run}: it is no longer bound to its auth record and manifest`);
        this.record(run, reconciledRecoveryRelease(journal, this.now()));
        this.result = "settled";
        return;
      }
      case "claimNotApplied": {
        const journal = this.journal(run);
        // recordNotAppliedClaim refuses a claim after a verified dispatch or a resolution.
        if (journal.dispatch.verified !== 0 || journal.recoveryState === "released" || !this.bound(journal)) {
          throw new ReplayDivergence(`the reconciler refused a not-applied claim for ${run}`);
        }
        this.claims.add(run);
        if (this.defect === "caller-release") {
          this.record(run, { type: "recovery-released", outcome: "not-applied", at: this.at() });
          for (const [path, holder] of this.ledger) if (holder === run) this.ledger.delete(path);
          this.result = "released";
        } else {
          this.result = "fence-retained";
        }
        return;
      }
    }
  }

  snapshot(): Snapshot {
    const phase = new Map<string, string>();
    const status = new Map<string, string>();
    const ledgerState = new Map<string, string>();
    const runAuth = new Map<string, number>();
    const runRev = new Map<string, number>();
    const dispatched = new Set<string>();
    const reconciled = new Set<string>();
    for (const run of RUNS) {
      const journal = this.journals.get(run);
      phase.set(run, journal?.phase ?? "none");
      status.set(run, journal?.status ?? "none");
      ledgerState.set(run, journal?.ledgerState ?? "none");
      if (journal === undefined) continue;
      runAuth.set(run, generationOf(journal.auth.hash, "auth"));
      runRev.set(run, generationOf(journal.adapter.hash, "manifest"));
      if (journal.dispatch.started > 0) dispatched.add(run);
      if (journal.status === "indeterminate" && journal.recoveryState === "released") reconciled.add(run);
    }
    return {
      phase, status, ledgerState, runAuth, runRev,
      authGen: this.authGen,
      rev: this.rev,
      scanned: new Set(this.scanned),
      ledgerHolders: new Set(this.ledger.values()),
      ledgerNames: this.ledger.size,
      dispatched,
      applied: new Set(this.applied),
      reconciled,
      claimed: new Set(this.claims),
      result: this.result,
    };
  }

  dispatchedRuns(): ReadonlySet<string> {
    return this.snapshot().dispatched;
  }

  phaseOf(run: string): string {
    return this.journals.get(run)?.phase ?? "none";
  }
}

function modelState(state: ItfState): Snapshot {
  const ledger = itfVariable(state, "ledger");
  if (ledger.kind !== "set") throw new Error("ITF ledger must be a set");
  const entries = ledger.items.map((item) => {
    if (item.kind !== "tuple" || item.items.length !== 3) throw new Error("ITF ledger entries must be triples");
    const [auth, revision, holder] = item.items as readonly [ItfValue, ItfValue, ItfValue];
    return { key: `${String(itfInt(auth, "ledger auth key"))}/${String(itfInt(revision, "ledger revision key"))}`, holder: itfString(holder, "ledger holder") };
  });
  const phase = itfStringMap(itfVariable(state, "phase"), "phase", itfString);
  const bound = (name: string): ReadonlyMap<string, number> => {
    const all = itfStringMap(itfVariable(state, name), name, itfInt);
    // A run without a journal has no binding to compare.
    return new Map([...all].filter(([run]) => phase.get(run) !== "none"));
  };
  return {
    phase,
    status: itfStringMap(itfVariable(state, "status"), "status", itfString),
    ledgerState: itfStringMap(itfVariable(state, "ledgerState"), "ledgerState", itfString),
    runAuth: bound("runAuth"),
    runRev: bound("runRev"),
    authGen: itfInt(itfVariable(state, "authGen"), "authGen"),
    rev: itfInt(itfVariable(state, "rev"), "rev"),
    scanned: itfStringSet(itfVariable(state, "scanned"), "scanned"),
    ledgerHolders: new Set(entries.map((entry) => entry.holder)),
    ledgerNames: new Set(entries.map((entry) => entry.key)).size,
    dispatched: itfStringSet(itfVariable(state, "dispatched"), "dispatched"),
    applied: itfStringSet(itfVariable(state, "applied"), "applied"),
    reconciled: itfStringSet(itfVariable(state, "reconciled"), "reconciled"),
    claimed: itfStringSet(itfVariable(state, "claimed"), "claimed"),
    result: itfString(itfVariable(state, "result"), "result"),
  };
}

function describeValue(value: unknown): string {
  if (value instanceof Map) return `{${[...value].sort(([left], [right]) => String(left).localeCompare(String(right))).map(([key, entry]) => `${String(key)}: ${String(entry)}`).join(", ")}}`;
  if (value instanceof Set) return `{${[...value].map(String).sort().join(", ")}}`;
  return JSON.stringify(value);
}

/** The first field where the production snapshot differs from the model, or null. */
function difference(actual: Snapshot, expected: Snapshot): string | null {
  for (const field of Object.keys(expected) as (keyof Snapshot)[]) {
    const left = describeValue(actual[field]);
    const right = describeValue(expected[field]);
    if (left !== right) return `${field} is ${left} in production and ${right} in the model`;
  }
  return null;
}

type RecordedStep = Readonly<{ action: string; run: string | null; outcome: string | null }>;

function recordedStep(state: ItfState): RecordedStep {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const picks = itfRecord(itfVariable(state, "mbt::nondetPicks"), ["r", "o"], "mbt::nondetPicks");
  const run = itfOption(picks.get("r")!, "mbt::nondetPicks.r");
  const outcome = itfOption(picks.get("o")!, "mbt::nondetPicks.o");
  return {
    action,
    run: run === null ? null : itfString(run, "mbt::nondetPicks.r"),
    outcome: outcome === null ? null : itfString(outcome, "mbt::nondetPicks.o"),
  };
}

function operation(state: ItfState): Readonly<{ action: Action; run: string; outcome: string }> {
  const { action, run, outcome } = recordedStep(state);
  if (!(ACTIONS as readonly string[]).includes(action) || run === null || outcome === null) {
    throw new Error(`state ${String(state.index)} records an unknown action or a missing pick`);
  }
  if (!(RUNS as readonly string[]).includes(run) || !(OUTCOMES as readonly string[]).includes(outcome)) {
    throw new Error(`state ${String(state.index)} picks an unknown run or outcome`);
  }
  return { action: action as Action, run, outcome };
}

function label(action: string, run: string, outcome: string): string {
  if (action === "reconnect" || action === "upgrade") return action;
  if (action === "finish") return `finish(${run}, ${outcome})`;
  return `${action}(${run})`;
}

/** Drive production through every recorded action of `trace`, failing at the first divergence. */
function replay(trace: ItfTrace, world: FenceWorld): void {
  const [initial, ...steps] = trace.states;
  if (initial === undefined) throw new Error("A trace needs its initial state");
  if (recordedStep(initial).action !== "init") throw new Error("A trace must start with the init action");
  const start = difference(world.snapshot(), modelState(initial));
  if (start !== null) throw new ReplayDivergence(`state 0: ${start}`);
  for (const state of steps) {
    const { action, run, outcome } = operation(state);
    if (!world.admits(action, run)) {
      throw new ReplayDivergence(`state ${String(state.index)}: production does not admit ${label(action, run, outcome)}`);
    }
    world.apply(action, run, outcome);
    const found = difference(world.snapshot(), modelState(state));
    if (found !== null) {
      throw new ReplayDivergence(`state ${String(state.index)}: after ${label(action, run, outcome)} ${found}`);
    }
  }
}

function divergence(trace: ItfTrace, world: FenceWorld): string | null {
  try {
    replay(trace, world);
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error.message;
    throw error;
  }
}

/**
 * Drive production through a pre-fix variant's trace. Production keeps its
 * own state and applies each action it admits, so it may refuse a run the
 * variant lets through. Returns every dispatch the variant makes that
 * production refuses, and fails if production ever dispatches the intent
 * twice or dispatches a run the variant did not.
 */
function refusedDispatches(trace: ItfTrace): readonly string[] {
  const world = new FenceWorld();
  const refused: string[] = [];
  for (const state of trace.states.slice(1)) {
    const { action, run, outcome } = operation(state);
    if (action === "dispatch" && !world.admits("dispatch", run)) {
      refused.push(`state ${String(state.index)}: the variant dispatches ${run}, which production left ${world.phaseOf(run)}`);
    }
    if (world.admits(action, run)) world.apply(action, run, outcome);
    const variant = itfStringSet(itfVariable(state, "dispatched"), "dispatched");
    const production = world.dispatchedRuns();
    if (production.size > 1 || [...production].some((entry) => !variant.has(entry))) {
      throw new Error(`state ${String(state.index)}: production dispatched ${describeValue(production)} where the variant dispatched ${describeValue(variant)}`);
    }
  }
  return refused;
}

const lockedModel = () => quintModel(MODEL_FILE);
const traces = quintTraceCache(MODEL_FILE);

describe("fence.qnt ITF replay", () => {
  test("replays every seeded model trace through the production fence", async () => {
    const model = await lockedModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-fence-replay.test.ts");
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const covered = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      expect(divergence(trace, new FenceWorld())).toBeNull();
      for (const state of trace.states.slice(1)) {
        const { action, run, outcome } = operation(state);
        covered.add(label(action, run, outcome));
        covered.add(`${action} -> ${modelState(state).result}`);
      }
    }
    const expected = [
      ...RUNS.flatMap((run) => [
        `scan(${run})`, `claim(${run})`, `dispatch(${run})`, `reconcile(${run})`, `claimNotApplied(${run})`,
        ...OUTCOMES.map((outcome) => `finish(${run}, ${outcome})`),
      ]),
      "reconnect", "upgrade",
      "scan -> clear", "scan -> refused", "scan -> replayed", "scan -> withheld",
      "claim -> claimed", "claim -> refused", "claim -> replayed",
    ];
    expect(expected.filter((entry) => !covered.has(entry))).toEqual([]);
  });

  test("a fence keyed by auth and adapter bytes diverges from the model traces", async () => {
    const model = await lockedModel();
    const all = await traces(model.step);
    const first = all.map((trace) => divergence(trace, new FenceWorld("hash-keyed-intent"))).find((message) => message !== null);
    expect(first).toMatch(/^state \d+: after (scan|claim)\(r[123]\) /u);
  });

  test("a reconciler that releases on a caller's claim diverges from the model traces", async () => {
    const model = await lockedModel();
    const all = await traces(model.step);
    const first = all.map((trace) => divergence(trace, new FenceWorld("caller-release"))).find((message) => message !== null);
    expect(first).toMatch(/^state \d+: after claimNotApplied\(r[123]\) ledgerState is \{.*\} in production and \{.*\} in the model$/u);
  });

  for (const step of ["stepHashKeyed", "stepCallerRelease"]) {
    test(`production refuses the second dispatch in every ${step} trace that dispatches the intent twice`, async () => {
      const model = await lockedModel();
      expect(model.mutants.map((mutant) => mutant.step)).toContain(step);
      const all = await traces(step);
      let violating = 0;
      for (const trace of all) {
        const refused = refusedDispatches(trace);
        const breaks = trace.states.some((state) => itfStringSet(itfVariable(state, "dispatched"), "dispatched").size > 1);
        if (!breaks) continue;
        violating += 1;
        expect(refused.length).toBeGreaterThan(0);
        for (const message of refused) {
          expect(message).toMatch(/^state \d+: the variant dispatches r[123], which production left (terminal|prepared)$/u);
        }
      }
      expect(violating).toBeGreaterThan(0);
    });
  }

  test("an unknown action or a missing pick fails closed instead of skipping a step", () => {
    const none = { tag: "None", value: { "#tup": [] } };
    const runs = (value: unknown) => ({ "#map": RUNS.map((run) => [run, value]) });
    const initial = {
      phase: runs("none"), status: runs("none"), ledgerState: runs("none"),
      runAuth: runs({ "#bigint": "0" }), runRev: runs({ "#bigint": "0" }),
      authGen: { "#bigint": "0" }, rev: { "#bigint": "0" },
      scanned: { "#set": [] }, ledger: { "#set": [] }, dispatched: { "#set": [] }, applied: { "#set": [] },
      reconciled: { "#set": [] }, claimed: { "#set": [] },
    };
    const trace = (action: string, r: unknown, o: unknown): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [
        { "#meta": { index: 0 }, ...initial, result: "none", "mbt::actionTaken": "init", "mbt::nondetPicks": { r: none, o: none } },
        {
          "#meta": { index: 1 }, ...initial, result: "reconnected", authGen: { "#bigint": "1" },
          "mbt::actionTaken": action, "mbt::nondetPicks": { r, o },
        },
      ],
    }));
    const some = (value: string) => ({ tag: "Some", value });
    expect(divergence(trace("reconnect", some("r1"), some("lost")), new FenceWorld())).toBeNull();
    expect(() => divergence(trace("steal", some("r1"), some("lost")), new FenceWorld())).toThrow("unknown action");
    expect(() => divergence(trace("reconnect", none, some("lost")), new FenceWorld())).toThrow("missing pick");
    expect(() => divergence(trace("reconnect", some("r9"), some("lost")), new FenceWorld())).toThrow("unknown run");
    expect(divergence(trace("upgrade", some("r1"), some("lost")), new FenceWorld()))
      .toBe("state 1: after upgrade authGen is 0 in production and 1 in the model");
  });
});
