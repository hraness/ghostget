/**
 * Differential test for `verification/lean/GhostgetVerification/RunJournal.lean`.
 *
 * Each generated case walks one run journal through a schedule of events.
 * Before every event it asks the production `parseRunJournal` whether the
 * journal is valid and the Lean model whether `invariant` holds, then applies
 * the event with the production `transitionRunJournal` and with the Lean
 * `transition`. Both must accept or reject together, and an accepted
 * journal must project to the model's next journal field for field. Some
 * schedule steps overwrite one journal field with an arbitrary value, so
 * invalid journals are compared too. `bun run verify:lean` runs this file
 * against the pinned toolchain; see `scripts/verification-lean-oracle.ts`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  parseRunJournal,
  transitionRunJournal,
  type RunJournal,
  type RunJournalEvent,
} from "../src/run-journal";
import { assertAsyncProperty, fc } from "../src/test-support";
import { startLeanOracle, type LeanOracle } from "./verification-lean-oracle";

const PHASES = ["prepared", "claimed", "ready", "dispatching", "terminal"] as const;
const STATUSES = ["pending", "succeeded", "submitted", "failed", "partial", "indeterminate"] as const;
const PLAN_STATES = ["available", "consumed"] as const;
const LEDGER_STATES = ["unclaimed", "pending", "succeeded", "partial", "indeterminate", "released"] as const;
const RECOVERY_STATES = ["absent", "present", "retained", "released"] as const;
const ASSET_STATES = ["none", "bound", "retained", "released"] as const;
const OUTCOMES = ["succeeded", "submitted", "failed", "partial", "indeterminate"] as const;
const RECONCILED = ["unstated", "applied", "not-applied"] as const;
const EVENT_TYPES = [
  "confirmation-consumed",
  "ledger-claimed",
  "recovery-stored",
  "dispatch-started",
  "dispatch-verified",
  "finished",
  "recovery-released",
  "lease-renewed",
  "duplicate-successor-claimed",
] as const;

type EventType = typeof EVENT_TYPES[number];
type Successor = Readonly<{ intentHash: number; sourceRunId: number; runId: number; claimedAt: number }>;

/** The journal fields of the Lean `Journal`, with times in milliseconds after `BASE`. */
type Model = Readonly<{
  revision: number;
  runId: number;
  publishR3Web: boolean;
  duplicateIntent: number | null;
  successor: Successor | null;
  planHasAssets: boolean;
  planState: typeof PLAN_STATES[number];
  phase: typeof PHASES[number];
  status: typeof STATUSES[number];
  planned: number;
  started: number;
  verified: number;
  ledgerPath: boolean;
  ledgerState: typeof LEDGER_STATES[number];
  recoveryState: typeof RECOVERY_STATES[number];
  assetState: typeof ASSET_STATES[number];
  startedAt: number;
  updatedAt: number;
  dedupeExpiresAt: number;
  leaseUntil: number;
}>;

/** Which of the three fields that `publishR3Web` stands for differs when it is false. */
type Variant = "operation" | "risk" | "transport";

/** A model event, as the Lean `Event` carries it. */
type ModelEvent = Readonly<{
  type: EventType;
  index: number;
  outcome: typeof OUTCOMES[number];
  noOp: boolean;
  reconciled: typeof RECONCILED[number];
  leaseUntil: number;
  intentHash: number;
  runId: number;
  time: number;
}>;

const BASE = Date.UTC(2026, 0, 1);

function iso(offset: number): string {
  return new Date(BASE + offset).toISOString();
}

function offset(value: string): number {
  return Date.parse(value) - BASE;
}

function runIdText(value: number): string {
  return `${value.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
}

function runIdNumber(value: string): number {
  expect(value).toMatch(/^[0-9a-f]{8}-0000-4000-8000-000000000000$/u);
  return Number.parseInt(value.slice(0, 8), 16);
}

function digestText(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function digestNumber(value: string): number {
  return Number.parseInt(value, 16);
}

/** The production journal that the model journal stands for. */
function journalOf(model: Model, variant: Variant): RunJournal {
  const web = model.publishR3Web;
  return {
    schemaVersion: 1,
    revision: model.revision,
    runId: runIdText(model.runId),
    planDigest: digestText(0xa),
    adapter: { id: "example-web", version: "1.0.0", hash: digestText(0xb) },
    operation: web || variant !== "operation" ? "posts.publish" : "likes.set",
    risk: web || variant !== "risk" ? "R3" : "R2",
    inputHash: digestText(0xc),
    auth: { id: "example-main", hash: digestText(0xd), kind: "cookies-file" },
    contract: {
      transport: web || variant !== "transport" ? "web-session-api" : "provider-api",
      hash: digestText(0xe),
    },
    ...(model.duplicateIntent === null
      ? {}
      : { duplicateIntent: { schemaVersion: 1, intentHash: digestText(0xf), sourceRunId: runIdText(model.duplicateIntent) } }),
    ...(model.successor === null
      ? {}
      : {
          duplicateSuccessor: {
            schemaVersion: 1,
            intentHash: digestText(model.successor.intentHash),
            sourceRunId: runIdText(model.successor.sourceRunId),
            runId: runIdText(model.successor.runId),
            claimedAt: iso(model.successor.claimedAt),
          },
        }),
    planHasAssets: model.planHasAssets,
    planState: model.planState,
    phase: model.phase,
    status: model.status,
    dispatch: { planned: model.planned, started: model.started, verified: model.verified },
    ledgerRelativePath: model.ledgerPath ? `idempotency/ff/${"f".repeat(64)}.json` : null,
    ledgerState: model.ledgerState,
    recoveryState: model.recoveryState,
    assetState: model.assetState,
    owner: {
      pid: 1234,
      token: "22222222-2222-4222-8222-222222222222",
      bootId: "1".repeat(64),
      processStartId: "2".repeat(64),
      leaseUntil: iso(model.leaseUntil),
    },
    startedAt: iso(model.startedAt),
    updatedAt: iso(model.updatedAt),
    dedupeExpiresAt: iso(model.dedupeExpiresAt),
    finalOrigin: null,
    error: null,
  };
}

/** The model journal that a production journal projects to. */
function modelOf(journal: RunJournal): Model {
  return {
    revision: journal.revision,
    runId: runIdNumber(journal.runId),
    publishR3Web: journal.operation === "posts.publish" && journal.risk === "R3"
      && journal.contract.transport === "web-session-api",
    duplicateIntent: journal.duplicateIntent === undefined ? null : runIdNumber(journal.duplicateIntent.sourceRunId),
    successor: journal.duplicateSuccessor === undefined
      ? null
      : {
          intentHash: digestNumber(journal.duplicateSuccessor.intentHash),
          sourceRunId: runIdNumber(journal.duplicateSuccessor.sourceRunId),
          runId: runIdNumber(journal.duplicateSuccessor.runId),
          claimedAt: offset(journal.duplicateSuccessor.claimedAt),
        },
    planHasAssets: journal.planHasAssets,
    planState: journal.planState,
    phase: journal.phase,
    status: journal.status,
    planned: journal.dispatch.planned,
    started: journal.dispatch.started,
    verified: journal.dispatch.verified,
    ledgerPath: journal.ledgerRelativePath !== null,
    ledgerState: journal.ledgerState,
    recoveryState: journal.recoveryState,
    assetState: journal.assetState,
    startedAt: offset(journal.startedAt),
    updatedAt: offset(journal.updatedAt),
    dedupeExpiresAt: offset(journal.dedupeExpiresAt),
    leaseUntil: offset(journal.owner.leaseUntil),
  };
}

function eventOf(event: ModelEvent): RunJournalEvent {
  const at = iso(event.time);
  switch (event.type) {
    case "confirmation-consumed":
    case "recovery-stored":
      return { type: event.type, at };
    case "ledger-claimed":
      return { type: event.type, ledgerRelativePath: `idempotency/ff/${"f".repeat(64)}.json`, at };
    case "dispatch-started":
    case "dispatch-verified":
      return { type: event.type, index: event.index, at };
    case "finished":
      return {
        type: event.type,
        status: event.outcome,
        finalOrigin: null,
        error: null,
        ...(event.noOp ? { noOp: true as const } : {}),
        at,
      };
    case "recovery-released":
      return {
        type: event.type,
        ...(event.reconciled === "unstated" ? {} : { outcome: event.reconciled }),
        at,
      };
    case "lease-renewed":
      return { type: event.type, leaseUntil: iso(event.leaseUntil), at };
    case "duplicate-successor-claimed":
      return { type: event.type, intentHash: digestText(event.intentHash), runId: runIdText(event.runId), at };
  }
}

function modelTokens(model: Model): string[] {
  const flag = (value: boolean): string => (value ? "1" : "0");
  return [
    String(model.revision),
    String(model.runId),
    flag(model.publishR3Web),
    model.duplicateIntent === null ? "-" : String(model.duplicateIntent),
    ...(model.successor === null
      ? ["-"]
      : ["s", String(model.successor.intentHash), String(model.successor.sourceRunId), String(model.successor.runId), String(model.successor.claimedAt)]),
    flag(model.planHasAssets),
    model.planState,
    model.phase,
    model.status,
    String(model.planned),
    String(model.started),
    String(model.verified),
    flag(model.ledgerPath),
    model.ledgerState,
    model.recoveryState,
    model.assetState,
    String(model.startedAt),
    String(model.updatedAt),
    String(model.dedupeExpiresAt),
    String(model.leaseUntil),
  ];
}

function eventTokens(event: ModelEvent): string[] {
  const time = String(event.time);
  switch (event.type) {
    case "confirmation-consumed":
    case "ledger-claimed":
    case "recovery-stored":
      return [event.type, time];
    case "dispatch-started":
    case "dispatch-verified":
      return [event.type, String(event.index), time];
    case "finished":
      return [event.type, event.outcome, event.noOp ? "1" : "0", time];
    case "recovery-released":
      return [event.type, event.reconciled, time];
    case "lease-renewed":
      return [event.type, String(event.leaseUntil), time];
    case "duplicate-successor-claimed":
      return [event.type, String(event.intentHash), String(event.runId), time];
  }
}

function member<T extends string>(values: readonly T[], value: string | undefined): T {
  expect(values).toContain(value as T);
  return value as T;
}

/** Parse the runner's journal tokens back into a model journal. */
function parseModel(tokens: readonly string[]): Model {
  let at = 0;
  const next = (): string => {
    const value = tokens[at];
    at += 1;
    if (value === undefined) throw new Error("the Lean answer ended early");
    return value;
  };
  const nat = (): number => {
    const value = next();
    expect(value).toMatch(/^\d+$/u);
    return Number(value);
  };
  const flag = (): boolean => member(["0", "1"], next()) === "1";
  const revision = nat();
  const runId = nat();
  const publishR3Web = flag();
  const duplicate = next();
  const successorTag = next();
  const successor = successorTag === "-"
    ? null
    : { intentHash: nat(), sourceRunId: nat(), runId: nat(), claimedAt: nat() };
  const model: Model = {
    revision,
    runId,
    publishR3Web,
    duplicateIntent: duplicate === "-" ? null : Number(duplicate),
    successor,
    planHasAssets: flag(),
    planState: member(PLAN_STATES, next()),
    phase: member(PHASES, next()),
    status: member(STATUSES, next()),
    planned: nat(),
    started: nat(),
    verified: nat(),
    ledgerPath: flag(),
    ledgerState: member(LEDGER_STATES, next()),
    recoveryState: member(RECOVERY_STATES, next()),
    assetState: member(ASSET_STATES, next()),
    startedAt: nat(),
    updatedAt: nat(),
    dedupeExpiresAt: nat(),
    leaseUntil: nat(),
  };
  expect(at).toBe(tokens.length);
  return model;
}

type Verdict = Readonly<{ valid: boolean; next: Model | null }>;

function production(model: Model, variant: Variant, event: ModelEvent): Verdict {
  const journal = journalOf(model, variant);
  let valid = true;
  try {
    parseRunJournal(journal);
  } catch {
    valid = false;
  }
  try {
    return { valid, next: modelOf(transitionRunJournal(journal, eventOf(event))) };
  } catch {
    return { valid, next: null };
  }
}

async function leanVerdict(model: Model, event: ModelEvent): Promise<Verdict> {
  const [valid, verdict, ...rest] = (await oracle!.query(["journal", ...modelTokens(model), ...eventTokens(event)].join(" "))).split(" ");
  expect(["0", "1"]).toContain(valid ?? "");
  if (verdict === "rejected") {
    expect(rest).toEqual([]);
    return { valid: valid === "1", next: null };
  }
  expect(verdict).toBe("accepted");
  return { valid: valid === "1", next: parseModel(rest) };
}

let oracle: LeanOracle | undefined;

beforeAll(async () => {
  oracle = await startLeanOracle();
});

afterAll(async () => {
  await oracle?.close();
});

type Compared = Readonly<{ before: Model; event: ModelEvent; production: Verdict; model: Verdict }>;
const compared: Compared[] = [];

async function compare(model: Model, variant: Variant, event: ModelEvent): Promise<Verdict> {
  const actual = production(model, variant, event);
  const expected = await leanVerdict(model, event);
  compared.push({ before: model, event, production: actual, model: expected });
  expect({ model, event, verdict: actual }).toEqual({ model, event, verdict: expected });
  return actual;
}

/** A schedule step: an event chosen relative to the current journal, or a field overwrite. */
type Step =
  | Readonly<{
      kind: "event";
      /** Follow the lifecycle to its next step instead of `type`. */
      advance: boolean;
      type: EventType;
      index: "start" | "verify" | "same" | "zero" | "beyond";
      outcome: typeof OUTCOMES[number];
      noOp: boolean;
      reconciled: typeof RECONCILED[number];
      leaseDelta: number;
      intentHash: number;
      successor: "own" | "other";
      delta: number;
    }>
  | Readonly<{ kind: "overwrite"; field: keyof Model; value: number }>;

const FIELDS: readonly (keyof Model)[] = [
  "revision", "runId", "publishR3Web", "duplicateIntent", "successor", "planHasAssets", "planState", "phase",
  "status", "planned", "started", "verified", "ledgerPath", "ledgerState", "recoveryState", "assetState",
  "startedAt", "updatedAt", "dedupeExpiresAt", "leaseUntil",
];

const step: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 40,
    arbitrary: fc.record({
      kind: fc.constant("event" as const),
      advance: fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
      type: fc.constantFrom(...EVENT_TYPES),
      index: fc.constantFrom("start" as const, "verify" as const, "same" as const, "zero" as const, "beyond" as const),
      outcome: fc.constantFrom(...OUTCOMES),
      noOp: fc.boolean(),
      reconciled: fc.constantFrom(...RECONCILED),
      leaseDelta: fc.integer({ min: -2, max: 5000 }),
      intentHash: fc.nat({ max: 2 }),
      successor: fc.oneof({ weight: 1, arbitrary: fc.constant("own" as const) }, { weight: 3, arbitrary: fc.constant("other" as const) }),
      delta: fc.oneof({ weight: 9, arbitrary: fc.nat({ max: 1000 }) }, { weight: 1, arbitrary: fc.constant(-1) }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("overwrite" as const),
      field: fc.constantFrom(...FIELDS),
      value: fc.nat({ max: 30 }),
    }),
  },
);

/** The next lifecycle event for the journal, so that schedules reach every phase. */
function lifecycle(model: Model, outcome: typeof OUTCOMES[number]): EventType {
  if (model.phase === "prepared") return model.planState === "available" ? "confirmation-consumed" : "ledger-claimed";
  if (model.phase === "claimed") return "recovery-stored";
  if (model.phase === "ready") return "dispatch-started";
  if (model.phase === "dispatching") {
    if (model.started > model.verified) {
      return outcome === "indeterminate" || outcome === "submitted" ? "finished" : "dispatch-verified";
    }
    return model.started < model.planned && outcome !== "partial" ? "dispatch-started" : "finished";
  }
  return model.publishR3Web && model.status === "indeterminate" && model.successor === null && outcome !== "failed"
    ? "duplicate-successor-claimed"
    : "recovery-released";
}

function resolve(model: Model, chosen: Extract<Step, { kind: "event" }>): ModelEvent {
  const type = chosen.advance ? lifecycle(model, chosen.outcome) : chosen.type;
  const index = {
    start: model.started + 1,
    verify: model.verified + 1,
    same: model.started,
    zero: 0,
    beyond: model.planned + 1,
  }[chosen.index];
  const time = chosen.delta < 0 ? Math.max(0, model.updatedAt - 1) : model.updatedAt + chosen.delta;
  let outcome = chosen.outcome;
  if (chosen.advance && type === "finished") {
    // Pick the outcome the dispatch counters admit, so advancing reaches every terminal status.
    if (model.started === 0) outcome = chosen.noOp ? "succeeded" : "failed";
    else if (model.started > model.verified) outcome = "indeterminate";
    else if (model.verified === model.planned) {
      outcome = chosen.outcome === "submitted" || chosen.outcome === "partial" ? "submitted" : "succeeded";
    }
    else outcome = chosen.outcome === "indeterminate" ? "indeterminate" : "partial";
  }
  return {
    type,
    index,
    outcome,
    noOp: chosen.advance && type === "finished" ? model.started === 0 : chosen.noOp,
    reconciled: chosen.reconciled,
    leaseUntil: Math.max(0, time + chosen.leaseDelta),
    intentHash: chosen.intentHash,
    runId: chosen.successor === "own" ? model.runId : model.runId + 1,
    time,
  };
}

function overwrite(model: Model, field: keyof Model, value: number): Model {
  const pick = <T,>(values: readonly T[]): T => values[value % values.length]!;
  switch (field) {
    case "publishR3Web":
    case "planHasAssets":
    case "ledgerPath":
      return { ...model, [field]: value % 2 === 1 };
    case "duplicateIntent":
      return { ...model, duplicateIntent: value % 3 === 0 ? null : value % 3 === 1 ? model.runId : model.runId + 1 };
    case "successor":
      return {
        ...model,
        successor: value % 3 === 0
          ? null
          : { intentHash: 1, sourceRunId: model.runId, runId: value % 3 === 1 ? model.runId : model.runId + 1, claimedAt: model.updatedAt + value },
      };
    case "planState":
      return { ...model, planState: pick(PLAN_STATES) };
    case "phase":
      return { ...model, phase: pick(PHASES) };
    case "status":
      return { ...model, status: pick(STATUSES) };
    case "ledgerState":
      return { ...model, ledgerState: pick(LEDGER_STATES) };
    case "recoveryState":
      return { ...model, recoveryState: pick(RECOVERY_STATES) };
    case "assetState":
      return { ...model, assetState: pick(ASSET_STATES) };
    case "planned":
      return { ...model, planned: value };
    default:
      return { ...model, [field]: value };
  }
}

const start: fc.Arbitrary<Start> = fc.record({
  planned: fc.oneof(
    { weight: 3, arbitrary: fc.constant(1) },
    { weight: 3, arbitrary: fc.integer({ min: 2, max: 3 }) },
    { weight: 1, arbitrary: fc.integer({ min: 1, max: 25 }) },
  ),
  planHasAssets: fc.boolean(),
  publishR3Web: fc.boolean(),
  variant: fc.constantFrom<Variant>("operation", "risk", "transport"),
  duplicate: fc.oneof({ weight: 6, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  startedAt: fc.nat({ max: 1000 }),
  dedupe: fc.nat({ max: 100_000 }),
  lease: fc.nat({ max: 100_000 }),
});

type Start = Readonly<{
  planned: number;
  planHasAssets: boolean;
  publishR3Web: boolean;
  variant: Variant;
  duplicate: boolean;
  startedAt: number;
  dedupe: number;
  lease: number;
}>;

function initial(value: Start): Model {
  return {
    revision: 0,
    runId: 1,
    publishR3Web: value.publishR3Web,
    duplicateIntent: value.duplicate ? 2 : null,
    successor: null,
    planHasAssets: value.planHasAssets,
    planState: "available",
    phase: "prepared",
    status: "pending",
    planned: value.planned,
    started: 0,
    verified: 0,
    ledgerPath: false,
    ledgerState: "unclaimed",
    recoveryState: "absent",
    assetState: "none",
    startedAt: value.startedAt,
    updatedAt: value.startedAt,
    dedupeExpiresAt: value.startedAt + value.dedupe,
    leaseUntil: value.startedAt + value.lease,
  };
}

const READY: Model = {
  revision: 3,
  runId: 1,
  publishR3Web: true,
  duplicateIntent: null,
  successor: null,
  planHasAssets: false,
  planState: "consumed",
  phase: "ready",
  status: "pending",
  planned: 1,
  started: 0,
  verified: 0,
  ledgerPath: true,
  ledgerState: "pending",
  recoveryState: "present",
  assetState: "none",
  startedAt: 0,
  updatedAt: 10,
  dedupeExpiresAt: 1000,
  leaseUntil: 1000,
};

const EVENT: ModelEvent = {
  type: "finished",
  index: 0,
  outcome: "succeeded",
  noOp: false,
  reconciled: "unstated",
  leaseUntil: 0,
  intentHash: 1,
  runId: 2,
  time: 20,
};

/**
 * Schedules that walk the lifecycle to each terminal status the advancing
 * path reaches, and on to a duplicate successor. Random schedules reach a
 * submitted run only after every planned dispatch is verified, and a seed
 * that never did failed the coverage check below without a defect, so these
 * run first on every seed.
 */
type Advance = readonly [typeof OUTCOMES[number], "start" | "verify"];

function advancing([outcome, index]: Advance): Extract<Step, { kind: "event" }> {
  return {
    kind: "event",
    advance: true,
    type: "finished",
    index,
    outcome,
    noOp: false,
    reconciled: "unstated",
    leaseDelta: 5000,
    intentHash: 1,
    successor: "other",
    delta: 1,
  };
}

function walk(planned: number, publishR3Web: boolean, advances: readonly Advance[]): [Start, Step[]] {
  return [
    { planned, planHasAssets: false, publishR3Web, variant: "operation", duplicate: false, startedAt: 0, dedupe: 100_000, lease: 100_000 },
    advances.map(advancing),
  ];
}

// Consume the confirmation, claim the ledger, store recovery, then start and verify one dispatch.
const READY_STEPS: readonly Advance[] = [["succeeded", "start"], ["succeeded", "start"], ["succeeded", "start"]];
const VERIFIED_ONE: readonly Advance[] = [...READY_STEPS, ["succeeded", "start"], ["succeeded", "verify"]];
const LIFECYCLE_EXAMPLES: [Start, Step[]][] = [
  walk(1, false, [...VERIFIED_ONE, ["submitted", "start"]]),
  walk(1, false, [...VERIFIED_ONE, ["succeeded", "start"]]),
  walk(2, false, [...VERIFIED_ONE, ["partial", "start"]]),
  // Indeterminate, then a duplicate successor on the web publishing path.
  walk(1, true, [...READY_STEPS, ["succeeded", "start"], ["indeterminate", "start"], ["succeeded", "start"]]),
];

describe("run journal: transitionRunJournal agrees with the Lean model", () => {
  test("a started dispatch cannot finish as failed", async () => {
    const started = await compare(READY, "operation", { ...EVENT, type: "dispatch-started", index: 1 });
    expect(started.next?.started).toBe(1);
    expect((await compare(started.next!, "operation", { ...EVENT, outcome: "failed", time: 30 })).next).toBeNull();
  });

  test("the final parse rejects an explicit no-op success before the confirmation was consumed", async () => {
    const prepared: Model = { ...READY, revision: 0, planState: "available", phase: "prepared", ledgerPath: false, ledgerState: "unclaimed", recoveryState: "absent" };
    const verdict = await compare(prepared, "operation", { ...EVENT, noOp: true });
    expect(verdict).toEqual({ valid: true, next: null });
  });

  test("the final parse rejects a duplicate successor that names its own run", async () => {
    const terminal: Model = { ...READY, phase: "terminal", status: "indeterminate", started: 1, ledgerState: "indeterminate", recoveryState: "retained" };
    expect(await compare(terminal, "operation", { ...EVENT, type: "duplicate-successor-claimed", runId: 1 })).toEqual({ valid: true, next: null });
    expect((await compare(terminal, "operation", { ...EVENT, type: "duplicate-successor-claimed", runId: 2 })).next?.successor)
      .toEqual({ intentHash: 1, sourceRunId: 1, runId: 2, claimedAt: 20 });
  });

  test("generated schedules, and the comparison finds a seeded defect", async () => {
    compared.length = 0;
    await assertAsyncProperty(fc.asyncProperty(start, fc.array(step, { minLength: 1, maxLength: 24 }), async (begin, schedule) => {
      let model = initial(begin);
      for (const entry of schedule) {
        if (entry.kind === "overwrite") {
          model = overwrite(model, entry.field, entry.value);
          continue;
        }
        const verdict = await compare(model, begin.variant, resolve(model, entry));
        if (verdict.next !== null) model = verdict.next;
      }
    }), { numRuns: 500 + LIFECYCLE_EXAMPLES.length, interruptAfterTimeLimit: 300_000, examples: LIFECYCLE_EXAMPLES });

    // Every event type was accepted and rejected, and invalid journals were compared.
    for (const type of EVENT_TYPES) {
      expect({ type, accepted: compared.some((entry) => entry.event.type === type && entry.model.next !== null) })
        .toEqual({ type, accepted: true });
      expect({ type, rejected: compared.some((entry) => entry.event.type === type && entry.model.next === null) })
        .toEqual({ type, rejected: true });
    }
    for (const status of STATUSES) {
      expect({ status, reached: compared.some((entry) => entry.model.next?.status === status && entry.model.next.phase === "terminal") })
        .toEqual({ status, reached: status !== "pending" });
    }
    expect(compared.some((entry) => !entry.model.valid)).toBeTrue();
    expect(compared.some((entry) => (entry.model.next?.successor ?? null) !== null)).toBeTrue();

    // The same comparison, with a verification that does not advance the
    // verified count seeded into the production result, must disagree.
    const skipsVerified = (entry: Compared): Verdict => entry.event.type === "dispatch-verified" && entry.production.next !== null
      ? { ...entry.production, next: { ...entry.production.next, verified: entry.before.verified } }
      : entry.production;
    expect(compared.some((entry) => !Bun.deepEquals(skipsVerified(entry), entry.model))).toBeTrue();
  });
});
