/**
 * Differential test for `verification/lean/GhostgetVerification/MessagingRun.lean`.
 *
 * Each generated case walks one multipart messaging run through a schedule
 * of events. Before every event it asks the production `parseMessagingRunV1`
 * whether the run is valid and the Lean model whether `invariant` holds. For a
 * valid run it applies the event with the production `transitionMessagingRun`
 * to the parsed run, as the store does, and with the Lean `transition`. Both
 * must accept or reject together, and an accepted run must project to the
 * model's next run field for field. Some schedule steps overwrite one run
 * field with an arbitrary value, so invalid runs are compared too. `bun run
 * verify:lean` runs this file against the pinned toolchain; see
 * `scripts/verification-lean-oracle.ts`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { sha256 } from "../src/canonical-json";
import {
  parseMessagingRunV1,
  transitionMessagingRun,
  type MessagingRunEventV1,
} from "../src/messaging-action-store";
import type { MessagingRunV1 } from "../src/messaging-types";
import { assertAsyncProperty, fc } from "../src/test-support";
import { startLeanOracle, type LeanOracle } from "./verification-lean-oracle";

const PART_STATES = [
  "unattempted", "claimed", "dispatching", "accepted", "failed-before-dispatch", "failed-permanent", "indeterminate",
] as const;
const RUN_STATES = ["pending", "submitted", "failed", "partial", "indeterminate"] as const;
const REASONS = [
  "context-drift",
  "prefix-freshness-unproven",
  "provider-failed-before-dispatch",
  "provider-result-indeterminate",
  "journal-recovery-required",
] as const;
const STOP_REASONS = [
  "context-drift", "prefix-freshness-unproven", "provider-failed-before-dispatch", "journal-recovery-required",
] as const;
const EVENT_TYPES = ["claimed", "dispatching", "accepted", "categorical-stop", "indeterminate"] as const;

type EventType = typeof EVENT_TYPES[number];
type Part = Readonly<{ state: typeof PART_STATES[number]; msgId: number | null; hasRevision: boolean }>;

/** The run fields of the Lean `Run`, with times in milliseconds after `BASE`. */
type Model = Readonly<{
  state: typeof RUN_STATES[number];
  proven: number;
  observed: number;
  possibleSubmitted: number | null;
  privateOutcome: boolean;
  terminalReason: typeof REASONS[number] | null;
  parts: readonly Part[];
  startedAt: number;
  recordedAt: number;
}>;

/** A model event, as the Lean `Event` carries it. */
type ModelEvent = Readonly<{
  type: EventType;
  index: number;
  observed: number;
  msgId: number;
  hasRevision: boolean;
  permanent: boolean;
  reason: typeof STOP_REASONS[number];
  recovery: boolean;
  privateOutcome: boolean;
  time: number;
}>;

const BASE = Date.UTC(2026, 0, 1);
const PRIVATE_OUTCOME = Object.freeze({ schemaVersion: 1 as const, messagingContractId: "example.messaging", code: "result_unknown" });

function iso(offset: number): string {
  return new Date(BASE + offset).toISOString();
}

function digestText(value: number): string {
  return value.toString(16).padStart(64, "0");
}

/** The production run that the model run stands for. */
function runOf(model: Model): unknown {
  return {
    schemaVersion: 1,
    format: "wrench.messaging-run",
    runId: "00000001-0000-4000-8000-000000000000",
    planDigest: digestText(0xa),
    routeRef: `wmroute_${"r".repeat(22)}`,
    contextRef: `wmcontext_${"c".repeat(22)}`,
    clientIntentSha256: digestText(0xb),
    turnDigest: digestText(0xc),
    previewDigest: digestText(0xd),
    state: model.state,
    partCount: model.parts.length,
    provenPartCount: model.proven,
    observedAcceptedPrefixCount: model.observed,
    possibleSubmittedPartIndex: model.possibleSubmitted,
    terminalReason: model.terminalReason,
    parts: model.parts.map((part, index) => {
      const text = `part ${String(index)}`;
      return {
        partId: `p${String(index)}`,
        text,
        replyRef: null,
        replyToProviderId: null,
        direction: "outgoing",
        bodySha256: sha256(text),
        state: part.state,
        providerMessageId: part.msgId === null ? null : `m${String(part.msgId)}`,
        providerRevision: part.hasRevision ? "revision" : null,
        delivery: "unknown",
        read: "unknown",
      };
    }),
    privateProviderOutcome: model.privateOutcome ? PRIVATE_OUTCOME : null,
    startedAt: iso(model.startedAt),
    recordedAt: iso(model.recordedAt),
  };
}

/** The model run that a production run projects to. */
function modelOf(run: MessagingRunV1): Model {
  return {
    state: run.state,
    proven: run.provenPartCount,
    observed: run.observedAcceptedPrefixCount,
    possibleSubmitted: run.possibleSubmittedPartIndex,
    privateOutcome: run.privateProviderOutcome !== null,
    terminalReason: run.terminalReason,
    parts: run.parts.map((part) => {
      if (part.providerMessageId !== null) expect(part.providerMessageId).toMatch(/^m\d+$/u);
      return {
        state: part.state,
        msgId: part.providerMessageId === null ? null : Number(part.providerMessageId.slice(1)),
        hasRevision: part.providerRevision !== null,
      };
    }),
    startedAt: Date.parse(run.startedAt) - BASE,
    recordedAt: Date.parse(run.recordedAt) - BASE,
  };
}

function eventOf(event: ModelEvent): MessagingRunEventV1 {
  const at = iso(event.time);
  switch (event.type) {
    case "claimed":
      return { type: "claimed", index: event.index, observedAcceptedPrefixCount: event.observed, at };
    case "dispatching":
      return { type: "dispatching", index: event.index, at };
    case "accepted":
      return {
        type: "accepted",
        index: event.index,
        providerMessageId: `m${String(event.msgId)}`,
        providerRevision: event.hasRevision ? "revision" : null,
        at,
      };
    case "categorical-stop":
      return {
        type: "categorical-stop",
        index: event.index,
        partState: event.permanent ? "failed-permanent" : "failed-before-dispatch",
        reason: event.reason,
        at,
      };
    case "indeterminate":
      return event.recovery
        ? { type: "indeterminate", index: event.index, reason: "journal-recovery-required", at }
        : {
            type: "indeterminate",
            index: event.index,
            reason: "provider-result-indeterminate",
            privateProviderOutcome: event.privateOutcome ? PRIVATE_OUTCOME : null,
            at,
          };
  }
}

function modelTokens(model: Model): string[] {
  const flag = (value: boolean): string => (value ? "1" : "0");
  return [
    model.state,
    String(model.proven),
    String(model.observed),
    model.possibleSubmitted === null ? "-" : String(model.possibleSubmitted),
    flag(model.privateOutcome),
    model.terminalReason ?? "-",
    String(model.parts.length),
    ...model.parts.flatMap((part) => [part.state, part.msgId === null ? "-" : String(part.msgId), flag(part.hasRevision)]),
    String(model.startedAt),
    String(model.recordedAt),
  ];
}

function eventTokens(event: ModelEvent): string[] {
  const flag = (value: boolean): string => (value ? "1" : "0");
  const time = String(event.time);
  switch (event.type) {
    case "claimed":
      return [event.type, String(event.index), String(event.observed), time];
    case "dispatching":
      return [event.type, String(event.index), time];
    case "accepted":
      return [event.type, String(event.index), String(event.msgId), flag(event.hasRevision), time];
    case "categorical-stop":
      return [event.type, String(event.index), flag(event.permanent), event.reason, time];
    case "indeterminate":
      return [event.type, String(event.index), flag(event.recovery), flag(event.privateOutcome), time];
  }
}

function member<T extends string>(values: readonly T[], value: string | undefined): T {
  expect(values).toContain(value as T);
  return value as T;
}

/** Parse the runner's run tokens back into a model run. */
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
  const optionalNat = (): number | null => {
    const value = next();
    if (value === "-") return null;
    expect(value).toMatch(/^\d+$/u);
    return Number(value);
  };
  const flag = (): boolean => member(["0", "1"], next()) === "1";
  const state = member(RUN_STATES, next());
  const proven = nat();
  const observed = nat();
  const possibleSubmitted = optionalNat();
  const privateOutcome = flag();
  const reason = next();
  const count = nat();
  const parts: Part[] = [];
  for (let index = 0; index < count; index += 1) {
    parts.push({ state: member(PART_STATES, next()), msgId: optionalNat(), hasRevision: flag() });
  }
  const model: Model = {
    state,
    proven,
    observed,
    possibleSubmitted,
    privateOutcome,
    terminalReason: reason === "-" ? null : member(REASONS, reason),
    parts,
    startedAt: nat(),
    recordedAt: nat(),
  };
  expect(at).toBe(tokens.length);
  return model;
}

type Verdict = Readonly<{ valid: boolean; next: Model | null }>;

/** Parse the run as the store does, then apply the event to the parsed run. */
function production(model: Model, event: ModelEvent): Verdict {
  let parsed: MessagingRunV1;
  try {
    parsed = parseMessagingRunV1(runOf(model));
  } catch {
    return { valid: false, next: null };
  }
  try {
    return { valid: true, next: modelOf(transitionMessagingRun(parsed, eventOf(event))) };
  } catch {
    return { valid: true, next: null };
  }
}

let oracle: LeanOracle | undefined;

beforeAll(async () => {
  oracle = await startLeanOracle();
});

afterAll(async () => {
  await oracle?.close();
});

async function leanVerdict(model: Model, event: ModelEvent): Promise<Verdict> {
  const [valid, verdict, ...rest] = (await oracle!.query(["messaging", ...modelTokens(model), ...eventTokens(event)].join(" "))).split(" ");
  expect(["0", "1"]).toContain(valid ?? "");
  if (verdict === "rejected") {
    expect(rest).toEqual([]);
    return { valid: valid === "1", next: null };
  }
  expect(verdict).toBe("accepted");
  return { valid: valid === "1", next: parseModel(rest) };
}

type Compared = Readonly<{ before: Model; event: ModelEvent; production: Verdict; model: Verdict }>;
const compared: Compared[] = [];

async function compare(model: Model, event: ModelEvent): Promise<Verdict> {
  const actual = production(model, event);
  const expected = await leanVerdict(model, event);
  compared.push({ before: model, event, production: actual, model: expected });
  expect({ model, event, verdict: actual }).toEqual({ model, event, verdict: expected });
  return actual;
}

/** A schedule step: an event chosen relative to the current run, or a field overwrite. */
type Step =
  | Readonly<{
      kind: "event";
      /** Follow the active part to its next step instead of `type`. */
      advance: boolean;
      type: EventType;
      index: "active" | "zero" | "beyond";
      observed: "same" | "proven" | "behind" | "ahead";
      msgId: number;
      hasRevision: boolean;
      permanent: boolean;
      reason: typeof STOP_REASONS[number];
      recovery: boolean;
      privateOutcome: boolean;
      delta: number;
    }>
  | Readonly<{ kind: "overwrite"; field: keyof Model | "part"; value: number; part: number }>;

const FIELDS: readonly (keyof Model | "part")[] = [
  "state", "proven", "observed", "possibleSubmitted", "privateOutcome", "terminalReason", "parts", "part",
  "startedAt", "recordedAt",
];

const step: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 40,
    arbitrary: fc.record({
      kind: fc.constant("event" as const),
      advance: fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
      type: fc.constantFrom(...EVENT_TYPES),
      index: fc.oneof(
        { weight: 6, arbitrary: fc.constant("active" as const) },
        { weight: 1, arbitrary: fc.constantFrom("zero" as const, "beyond" as const) },
      ),
      observed: fc.constantFrom("same" as const, "proven" as const, "behind" as const, "ahead" as const),
      // A small pool, so that a provider message ID often repeats one in the accepted prefix.
      msgId: fc.nat({ max: 5 }),
      hasRevision: fc.boolean(),
      permanent: fc.boolean(),
      reason: fc.constantFrom(...STOP_REASONS),
      recovery: fc.boolean(),
      privateOutcome: fc.boolean(),
      delta: fc.oneof({ weight: 9, arbitrary: fc.nat({ max: 1000 }) }, { weight: 1, arbitrary: fc.constant(-1) }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("overwrite" as const),
      field: fc.constantFrom(...FIELDS),
      value: fc.nat({ max: 30 }),
      part: fc.nat({ max: 7 }),
    }),
  },
);

/** The next event for the active part, so that schedules reach every run state. */
function lifecycle(model: Model, chosen: Extract<Step, { kind: "event" }>): EventType {
  const active = model.parts[model.proven]?.state;
  if (active === "unattempted") return chosen.type === "categorical-stop" ? "categorical-stop" : "claimed";
  if (active === "claimed") {
    return chosen.type === "categorical-stop" || chosen.type === "indeterminate" ? chosen.type : "dispatching";
  }
  if (active === "dispatching") return chosen.type === "indeterminate" ? "indeterminate" : "accepted";
  return chosen.type;
}

function resolve(model: Model, chosen: Extract<Step, { kind: "event" }>): ModelEvent {
  const type = chosen.advance ? lifecycle(model, chosen) : chosen.type;
  const index = { active: model.proven, zero: 0, beyond: model.parts.length }[chosen.index];
  const observed = {
    same: model.observed,
    proven: model.proven,
    behind: Math.max(0, model.observed - 1),
    ahead: model.proven + 1,
  }[chosen.observed];
  const time = chosen.delta < 0 ? Math.max(0, model.recordedAt - 1) : model.recordedAt + chosen.delta;
  return {
    type,
    index,
    observed,
    msgId: chosen.msgId,
    hasRevision: chosen.hasRevision,
    permanent: chosen.permanent,
    reason: chosen.reason,
    recovery: chosen.recovery,
    privateOutcome: chosen.privateOutcome,
    time,
  };
}

function overwrite(model: Model, field: keyof Model | "part", value: number, part: number): Model {
  const pick = <T,>(values: readonly T[]): T => values[value % values.length]!;
  switch (field) {
    case "state":
      return { ...model, state: pick(RUN_STATES) };
    case "possibleSubmitted":
      return { ...model, possibleSubmitted: value % 4 === 0 ? null : value % 9 };
    case "privateOutcome":
      return { ...model, privateOutcome: value % 2 === 1 };
    case "terminalReason":
      return { ...model, terminalReason: value % 6 === 0 ? null : pick(REASONS) };
    case "parts":
      // Grow or shrink the run with unattempted parts, from none to the bound of eight.
      return {
        ...model,
        parts: Array.from({ length: value % 9 }, (_unused, index) =>
          model.parts[index] ?? { state: "unattempted" as const, msgId: null, hasRevision: false }),
      };
    case "part": {
      if (model.parts.length === 0) return model;
      const index = part % model.parts.length;
      const current = model.parts[index]!;
      const changed: Part = value % 3 === 0
        ? { ...current, state: pick(PART_STATES) }
        : value % 3 === 1
          ? { ...current, msgId: current.msgId === null ? value % 10 : null }
          : { ...current, hasRevision: !current.hasRevision };
      return { ...model, parts: model.parts.map((entry, position) => (position === index ? changed : entry)) };
    }
    default:
      return { ...model, [field]: value };
  }
}

type Start = Readonly<{ parts: number; startedAt: number }>;

const start: fc.Arbitrary<Start> = fc.record({
  parts: fc.oneof({ weight: 3, arbitrary: fc.integer({ min: 1, max: 3 }) }, { weight: 1, arbitrary: fc.integer({ min: 1, max: 8 }) }),
  startedAt: fc.nat({ max: 1000 }),
});

function initial(value: Start): Model {
  return {
    state: "pending",
    proven: 0,
    observed: 0,
    possibleSubmitted: null,
    privateOutcome: false,
    terminalReason: null,
    parts: Array.from({ length: value.parts }, () => ({ state: "unattempted" as const, msgId: null, hasRevision: false })),
    startedAt: value.startedAt,
    recordedAt: value.startedAt,
  };
}

const EVENT: ModelEvent = {
  type: "accepted",
  index: 1,
  observed: 0,
  msgId: 7,
  hasRevision: false,
  permanent: false,
  reason: "context-drift",
  recovery: false,
  privateOutcome: false,
  time: 20,
};

const DISPATCHING: Model = {
  state: "pending",
  proven: 1,
  observed: 1,
  possibleSubmitted: null,
  privateOutcome: false,
  terminalReason: null,
  parts: [
    { state: "accepted", msgId: 7, hasRevision: true },
    { state: "dispatching", msgId: null, hasRevision: false },
    { state: "unattempted", msgId: null, hasRevision: false },
  ],
  startedAt: 0,
  recordedAt: 10,
};

describe("messaging run: transitionMessagingRun agrees with the Lean model", () => {
  test("an accepted part extends the prefix and the last one submits the run", async () => {
    const accepted = await compare(DISPATCHING, { ...EVENT, msgId: 8 });
    expect(accepted.next?.proven).toBe(2);
    expect(accepted.next?.state).toBe("pending");
    const last: Model = { ...accepted.next!, parts: accepted.next!.parts.map((part, index) => (index === 2 ? { ...part, state: "dispatching" as const } : part)) };
    expect((await compare(last, { ...EVENT, index: 2, msgId: 9, time: 30 })).next?.state).toBe("submitted");
  });

  test("the final parse rejects a provider message ID that repeats the accepted prefix", async () => {
    expect(await compare(DISPATCHING, EVENT)).toEqual({ valid: true, next: null });
  });

  test("a private provider outcome must cross dispatch", async () => {
    const claimed: Model = { ...DISPATCHING, parts: DISPATCHING.parts.map((part, index) => (index === 1 ? { ...part, state: "claimed" as const } : part)) };
    expect((await compare(claimed, { ...EVENT, type: "indeterminate", privateOutcome: true })).next).toBeNull();
    expect((await compare(DISPATCHING, { ...EVENT, type: "indeterminate", privateOutcome: true })).next?.privateOutcome).toBeTrue();
  });

  test("generated schedules, and the comparison finds a seeded defect", async () => {
    compared.length = 0;
    await assertAsyncProperty(fc.asyncProperty(start, fc.array(step, { minLength: 1, maxLength: 24 }), async (begin, schedule) => {
      let model = initial(begin);
      for (const entry of schedule) {
        if (entry.kind === "overwrite") {
          model = overwrite(model, entry.field, entry.value, entry.part);
          continue;
        }
        const verdict = await compare(model, resolve(model, entry));
        if (verdict.next !== null) model = verdict.next;
      }
    }), { numRuns: 1000, interruptAfterTimeLimit: 300_000 });

    // Every event type was accepted and rejected, every run state was reached,
    // a repeated provider message ID was rejected, and invalid runs were compared.
    for (const type of EVENT_TYPES) {
      expect({ type, accepted: compared.some((entry) => entry.event.type === type && entry.model.next !== null) })
        .toEqual({ type, accepted: true });
      expect({ type, rejected: compared.some((entry) => entry.event.type === type && entry.model.next === null) })
        .toEqual({ type, rejected: true });
    }
    for (const state of RUN_STATES) {
      expect({ state, reached: compared.some((entry) => entry.model.next?.state === state) }).toEqual({ state, reached: true });
    }
    expect(compared.some((entry) => entry.model.valid && entry.event.type === "accepted" && entry.model.next === null
      && entry.before.parts[entry.before.proven]?.state === "dispatching" && entry.event.index === entry.before.proven
      && entry.event.time >= entry.before.recordedAt
      && entry.before.parts.slice(0, entry.before.proven).some((part) => part.msgId === entry.event.msgId))).toBeTrue();
    expect(compared.some((entry) => !entry.model.valid)).toBeTrue();

    // The same comparison, with an accepted part that does not extend the
    // prefix seeded into the production result, must disagree.
    const keepsPrefix = (entry: Compared): Verdict => entry.event.type === "accepted" && entry.production.next !== null
      ? { ...entry.production, next: { ...entry.production.next, proven: entry.before.proven } }
      : entry.production;
    expect(compared.some((entry) => !Bun.deepEquals(keepsPrefix(entry), entry.model))).toBeTrue();
  });
});
