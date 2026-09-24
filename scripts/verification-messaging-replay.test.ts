/**
 * ITF trace replay for `verification/quint/messaging.qnt` against the
 * production messaging journal reducer.
 *
 * Quint writes seeded model-based-testing traces of the composite messaging
 * run lifecycle. Each recorded action becomes one `MessagingRunEventV1`, and
 * `transitionMessagingRun` applies it to a strictly parsed production run;
 * crash recovery goes through `messagingRecoveryEvent`, the same pure helper
 * the runtime uses to terminalize a pending run. After every step the replay
 * compares the production run with the model state, including a replay-side
 * count of accepted dispatch transitions per part, which mirrors the model's
 * ghost `dispatches` variable.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sha256 } from "../src/canonical-json.js";
import {
  messagingRecoveryEvent,
  parseMessagingRunV1,
  transitionMessagingRun,
  type MessagingRunEventV1,
} from "../src/messaging-action-store.js";
import type { MessagingRunV1 } from "../src/messaging-types.js";
import {
  itfOption,
  itfRecord,
  itfString,
  itfVariable,
  parseItfTrace,
  type ItfState,
  type ItfTrace,
  type ItfValue,
} from "./verification-itf.js";
import {
  QUINT,
  QUINT_TRACE_TIMEOUT_MS,
  REPOSITORY_ROOT,
  quintTraceArguments,
  readQuintModels,
  requireFinished,
  runTool,
  type QuintModel,
} from "./verification-tools.js";

const MODEL_FILE = "messaging.qnt";
const PART_COUNT = 3;
const STATE_VARIABLES = [
  "dispatches", "messageIds", "observed", "outcome", "parts", "possible", "proven", "reason", "runState",
];
const TRACE_VARIABLES = [...STATE_VARIABLES, "mbt::actionTaken", "mbt::nondetPicks"].sort();
const PICKS = ["faultRoll", "id", "indReason", "obs", "partState", "stopReason", "withOutcome"];
const PRIVATE_OUTCOME = Object.freeze({
  schemaVersion: 1 as const,
  messagingContractId: "ghostget.verification.messaging",
  code: "provider_timeout",
});

type ModelSnapshot = Readonly<{
  runState: string;
  parts: readonly string[];
  messageIds: readonly string[];
  proven: number;
  observed: number;
  possible: number;
  reason: string;
  outcome: boolean;
  dispatches: readonly number[];
}>;

type Picks = ReadonlyMap<string, ItfValue | null>;

/**
 * The production reducer, plus a seeded defect: `recovery-claims-dispatch`
 * treats a claimed part found at recovery as possibly dispatched, so the run
 * ends indeterminate where the model stops it categorically.
 */
type Defect = "none" | "recovery-claims-dispatch";

class ReplayDivergence extends Error {}

function initialRun(): MessagingRunV1 {
  const digest = (seed: string) => sha256(`ghostget-verification-${seed}`);
  const startedAt = "2026-09-23T00:00:00.000Z";
  return parseMessagingRunV1({
    schemaVersion: 1,
    format: "wrench.messaging-run",
    runId: "3f0c7a52-1d4e-4b8a-9c2f-6a1b0d9e8c70",
    planDigest: digest("plan"),
    routeRef: "wmroute_AAAAAAAAAAAAAAAAAAAAAA",
    contextRef: "wmcontext_BBBBBBBBBBBBBBBBBBBBBB",
    clientIntentSha256: digest("intent"),
    contextBindingSha256: digest("context"),
    sourceConversationCoordinateSha256: digest("coordinate"),
    turnDigest: digest("turn"),
    previewDigest: digest("preview"),
    state: "pending",
    partCount: PART_COUNT,
    provenPartCount: 0,
    observedAcceptedPrefixCount: 0,
    possibleSubmittedPartIndex: null,
    privateProviderOutcome: null,
    terminalReason: null,
    parts: Array.from({ length: PART_COUNT }, (_, index) => {
      const text = `part ${String(index + 1)}`;
      return {
        partId: `part-${String(index + 1)}`,
        text,
        replyRef: null,
        replyToProviderId: null,
        direction: "outgoing",
        bodySha256: sha256(text),
        state: "unattempted",
        providerMessageId: null,
        providerRevision: null,
        delivery: "unknown",
        read: "unknown",
      };
    }),
    startedAt,
    recordedAt: startedAt,
  });
}

function itfInt(value: ItfValue, label: string): number {
  if (value.kind !== "int") throw new Error(`ITF ${label} must be an integer`);
  const number = Number(value.value);
  if (!Number.isSafeInteger(number)) throw new Error(`ITF ${label} is out of range`);
  return number;
}

function itfBool(value: ItfValue, label: string): boolean {
  if (value.kind !== "bool") throw new Error(`ITF ${label} must be a boolean`);
  return value.value;
}

/** Read an `int -> V` map over exactly the part indices into an array. */
function itfPartArray<V>(value: ItfValue, label: string, read: (entry: ItfValue, label: string) => V): readonly V[] {
  if (value.kind !== "map" || value.entries.length !== PART_COUNT) {
    throw new Error(`ITF ${label} must map each of the ${String(PART_COUNT)} parts`);
  }
  const result = new Array<V | undefined>(PART_COUNT).fill(undefined);
  for (const [key, entry] of value.entries) {
    const index = itfInt(key, `${label} key`);
    if (index < 0 || index >= PART_COUNT || result[index] !== undefined) {
      throw new Error(`ITF ${label} has an unexpected key ${String(index)}`);
    }
    result[index] = read(entry, `${label}[${String(index)}]`);
  }
  return result as V[];
}

function modelState(state: ItfState): ModelSnapshot {
  return {
    runState: itfString(itfVariable(state, "runState"), "runState"),
    parts: itfPartArray(itfVariable(state, "parts"), "parts", itfString),
    messageIds: itfPartArray(itfVariable(state, "messageIds"), "messageIds", itfString),
    proven: itfInt(itfVariable(state, "proven"), "proven"),
    observed: itfInt(itfVariable(state, "observed"), "observed"),
    possible: itfInt(itfVariable(state, "possible"), "possible"),
    reason: itfString(itfVariable(state, "reason"), "reason"),
    outcome: itfBool(itfVariable(state, "outcome"), "outcome"),
    dispatches: itfPartArray(itfVariable(state, "dispatches"), "dispatches", itfInt),
  };
}

function productionState(run: MessagingRunV1, dispatches: readonly number[]): ModelSnapshot {
  return {
    runState: run.state,
    parts: run.parts.map((part) => part.state),
    messageIds: run.parts.map((part) => part.providerMessageId ?? ""),
    proven: run.provenPartCount,
    observed: run.observedAcceptedPrefixCount,
    possible: run.possibleSubmittedPartIndex ?? -1,
    reason: run.terminalReason ?? "",
    outcome: run.privateProviderOutcome !== null,
    dispatches: [...dispatches],
  };
}

const describeState = (state: ModelSnapshot): string => JSON.stringify(state);

/** The model's invariants, evaluated independently of Quint on a trace state. */
function invariantHolds(name: "orderedPrefix" | "noRedispatch", state: ModelSnapshot): boolean {
  const indices = [...state.parts.keys()];
  if (name === "orderedPrefix") {
    const ids = state.messageIds.filter((id) => id !== "");
    return state.observed >= 0
      && state.observed <= state.proven
      && state.proven <= PART_COUNT
      && indices.every((index) => (index < state.proven) === (state.parts[index] === "accepted"))
      && indices.every((index) => (state.parts[index] === "accepted") === (state.messageIds[index] !== ""))
      && new Set(ids).size === ids.length
      && indices.every((index) => index <= state.proven || state.parts[index] === "unattempted");
  }
  return indices.every((index) => {
    const count = state.dispatches[index]!;
    const part = state.parts[index]!;
    return count <= 1
      && (count !== 1 || ["dispatching", "accepted", "indeterminate"].includes(part))
      && (!["dispatching", "accepted"].includes(part) || count === 1);
  });
}

type RecordedStep = Readonly<{ action: string; picks: Picks }>;

function recordedStep(state: ItfState): RecordedStep {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const record = itfVariable(state, "mbt::nondetPicks");
  if (action === "init") return { action, picks: new Map() };
  const fields = itfRecord(record, PICKS, "mbt::nondetPicks");
  const picks = new Map<string, ItfValue | null>();
  for (const name of PICKS) picks.set(name, itfOption(fields.get(name)!, `mbt::nondetPicks.${name}`));
  return { action, picks };
}

function pick(picks: Picks, name: string, index: number): ItfValue {
  const value = picks.get(name);
  if (value === undefined || value === null) throw new Error(`state ${String(index)} records no ${name} pick`);
  return value;
}

/** Translate one recorded model action into the production event it drives. */
function productionEvent(
  step: RecordedStep,
  before: ModelSnapshot,
  run: MessagingRunV1,
  at: Date,
  stateIndex: number,
  defect: Defect,
): MessagingRunEventV1 | "terminal" {
  const iso = at.toISOString();
  const index = before.proven;
  switch (step.action) {
    case "claim":
      return {
        type: "claimed",
        index,
        observedAcceptedPrefixCount: itfInt(pick(step.picks, "obs", stateIndex), "obs"),
        at: iso,
      };
    case "dispatch":
    case "redispatch":
      return { type: "dispatching", index, at: iso };
    case "claimAhead":
      return {
        type: "claimed",
        index: index + 1,
        observedAcceptedPrefixCount: before.observed,
        at: iso,
      };
    case "accept":
      return {
        type: "accepted",
        index,
        providerMessageId: itfString(pick(step.picks, "id", stateIndex), "id"),
        providerRevision: null,
        at: iso,
      };
    case "stop": {
      const partState = itfString(pick(step.picks, "partState", stateIndex), "partState");
      const reason = itfString(pick(step.picks, "stopReason", stateIndex), "stopReason");
      if (partState !== "failed-before-dispatch" && partState !== "failed-permanent") {
        throw new Error(`state ${String(stateIndex)} records an unknown stop state ${partState}`);
      }
      if (
        reason !== "context-drift" && reason !== "prefix-freshness-unproven"
        && reason !== "provider-failed-before-dispatch" && reason !== "journal-recovery-required"
      ) throw new Error(`state ${String(stateIndex)} records an unknown stop reason ${reason}`);
      return { type: "categorical-stop", index, partState, reason, at: iso };
    }
    case "indeterminate": {
      const reason = itfString(pick(step.picks, "indReason", stateIndex), "indReason");
      const withOutcome = itfBool(pick(step.picks, "withOutcome", stateIndex), "withOutcome");
      if (reason === "provider-result-indeterminate") {
        return { type: "indeterminate", index, reason, privateProviderOutcome: withOutcome ? PRIVATE_OUTCOME : null, at: iso };
      }
      if (reason === "journal-recovery-required") return { type: "indeterminate", index, reason, at: iso };
      throw new Error(`state ${String(stateIndex)} records an unknown indeterminate reason ${reason}`);
    }
    case "recoverDispatching":
    case "recoverBeforeDispatch": {
      const event = messagingRecoveryEvent(run, at);
      if (event === null) throw new ReplayDivergence(`state ${String(stateIndex)}: production found nothing to recover`);
      if (defect === "recovery-claims-dispatch" && run.parts[run.provenPartCount]?.state === "claimed") {
        return { type: "indeterminate", index: event.index, reason: "journal-recovery-required", at: event.at };
      }
      return event;
    }
    case "done":
      return "terminal";
    default:
      throw new Error(`state ${String(stateIndex)} records an unknown action ${step.action}`);
  }
}

/** Drive the production reducer through every recorded action of `trace`. */
function replay(trace: ItfTrace, defect: Defect = "none"): void {
  const [initial, ...steps] = trace.states;
  if (initial === undefined) throw new Error("A trace needs its initial state");
  if (recordedStep(initial).action !== "init") throw new Error("A trace must start with the init action");
  let run = initialRun();
  const dispatches = new Array<number>(PART_COUNT).fill(0);
  let before = modelState(initial);
  if (describeState(productionState(run, dispatches)) !== describeState(before)) {
    throw new ReplayDivergence(`state 0: production starts at ${describeState(productionState(run, dispatches))}`);
  }
  for (const state of steps) {
    const step = recordedStep(state);
    const at = new Date(Date.parse(run.startedAt) + state.index * 1_000);
    const event = productionEvent(step, before, run, at, state.index, defect);
    if (event === "terminal") {
      if (run.state === "pending" || messagingRecoveryEvent(run, at) !== null) {
        throw new ReplayDivergence(`state ${String(state.index)}: production run is still pending at done`);
      }
    } else {
      try {
        run = transitionMessagingRun(run, event);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ReplayDivergence(`state ${String(state.index)}: production refused ${step.action}: ${message}`);
      }
      if (event.type === "dispatching") dispatches[event.index] = (dispatches[event.index] ?? 0) + 1;
    }
    const expected = modelState(state);
    const actual = productionState(run, dispatches);
    if (describeState(actual) !== describeState(expected)) {
      throw new ReplayDivergence(
        `state ${String(state.index)}: after ${step.action} production has ${describeState(actual)}, the model ${describeState(expected)}`,
      );
    }
    before = expected;
  }
}

function divergence(trace: ItfTrace, defect: Defect = "none"): string | null {
  try {
    replay(trace, defect);
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error.message;
    throw error;
  }
}

async function messagingModel(): Promise<QuintModel> {
  const model = (await readQuintModels()).find((candidate) => candidate.file === MODEL_FILE);
  if (model === undefined) throw new Error(`models.json does not list ${MODEL_FILE}`);
  return model;
}

/** Run Quint's model-based testing mode and strictly parse every trace it writes. */
async function generateTraces(model: QuintModel, step: string): Promise<readonly ItfTrace[]> {
  const node = Bun.which("node");
  if (node === null) throw new Error("node must be on PATH to run Quint");
  const directory = await mkdtemp(join(tmpdir(), "ghostget-quint-traces-"));
  try {
    const outcome = await runTool([
      node,
      join(REPOSITORY_ROOT, QUINT.cli),
      ...quintTraceArguments(model, step, model.replay.traces, model.replay.seed, directory),
    ], {
      cwd: join(REPOSITORY_ROOT, "verification", "quint"),
      environment: { HOME: directory, PATH: "/usr/bin:/bin", NO_COLOR: "1", FORCE_COLOR: "0", TZ: "UTC" },
      timeoutMs: QUINT_TRACE_TIMEOUT_MS,
    });
    const result = requireFinished("quint run --mbt", outcome);
    if (result.exitCode !== 0) throw new Error(`quint run --mbt exited with ${String(result.exitCode)}: ${result.stderr.slice(0, 2_000)}`);
    const names = (await readdir(directory)).filter((name) => name.endsWith(".itf.json"));
    const expected = Array.from({ length: model.replay.traces }, (_, index) => `trace_${String(index)}.itf.json`);
    expect(names.sort()).toEqual(expected.sort());
    return await Promise.all(expected.map(async (name) => parseItfTrace(await readFile(join(directory, name), "utf8"))));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const cache = new Map<string, Promise<readonly ItfTrace[]>>();
async function traces(step: string): Promise<readonly ItfTrace[]> {
  const model = await messagingModel();
  const cached = cache.get(step) ?? generateTraces(model, step);
  cache.set(step, cached);
  return cached;
}

/** A category of recorded action, detailed enough to show the replay reached each production branch. */
function coverageKey(trace: ItfTrace, position: number): string {
  const state = trace.states[position]!;
  const before = modelState(trace.states[position - 1]!);
  const after = modelState(state);
  const { action, picks } = recordedStep(state);
  const active = before.parts[before.proven] ?? "none";
  switch (action) {
    case "claim": return `claim(observed ${after.observed > before.observed ? "advances" : "holds"})`;
    case "accept": return `accept(${after.runState})`;
    case "stop": return `stop(${after.runState})`;
    case "indeterminate": {
      const reason = itfString(picks.get("indReason")!, "indReason");
      return `indeterminate(${active}, ${reason}, outcome ${String(after.outcome)})`;
    }
    case "recoverDispatching":
    case "recoverBeforeDispatch": return `${action}(${active}, ${after.runState})`;
    case "done": return `done(${after.runState})`;
    default: return action;
  }
}

describe("messaging.qnt ITF replay", () => {
  test("replays every seeded model trace through the production messaging reducer", async () => {
    const model = await messagingModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-messaging-replay.test.ts");
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const covered = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      expect(divergence(trace)).toBeNull();
      for (let position = 1; position < trace.states.length; position += 1) covered.add(coverageKey(trace, position));
    }
    expect([...covered].sort()).toEqual([
      "accept(pending)",
      "accept(submitted)",
      "claim(observed advances)",
      "claim(observed holds)",
      "dispatch",
      "done(failed)",
      "done(indeterminate)",
      "done(partial)",
      "done(submitted)",
      "indeterminate(claimed, journal-recovery-required, outcome false)",
      "indeterminate(claimed, provider-result-indeterminate, outcome false)",
      "indeterminate(dispatching, journal-recovery-required, outcome false)",
      "indeterminate(dispatching, provider-result-indeterminate, outcome false)",
      "indeterminate(dispatching, provider-result-indeterminate, outcome true)",
      "recoverBeforeDispatch(claimed, failed)",
      "recoverBeforeDispatch(claimed, partial)",
      "recoverBeforeDispatch(unattempted, failed)",
      "recoverBeforeDispatch(unattempted, partial)",
      "recoverDispatching(dispatching, indeterminate)",
      "stop(failed)",
      "stop(partial)",
    ]);
  });

  test("a reducer with a seeded recovery defect diverges from the model traces", async () => {
    const model = await messagingModel();
    const all = await traces(model.step);
    const divergences = all.map((trace) => divergence(trace, "recovery-claims-dispatch")).filter((message) => message !== null);
    expect(divergences.length).toBeGreaterThan(0);
    for (const message of divergences) {
      expect(message).toMatch(/^state \d+: after recoverBeforeDispatch production has \{"runState":"indeterminate",.*, the model \{"runState":"(?:failed|partial)",/u);
    }
  });

  for (const [step, invariant, refusal] of [
    ["stepRedispatch", "noRedispatch", /^state \d+: production refused redispatch: messaging (?:part was not claimed|run transition is outside the active prefix)$/u],
    ["stepSkip", "orderedPrefix", /^state \d+: production refused claimAhead: messaging run transition is outside the active prefix$/u],
  ] as const) {
    test(`the production reducer refuses exactly the ${step} traces that break ${invariant}`, async () => {
      const model = await messagingModel();
      expect(model.mutants).toContainEqual({ step, invariant });
      const all = await traces(step);
      let violating = 0;
      for (const trace of all) {
        const firstViolation = trace.states.findIndex((state) => !invariantHolds(invariant, modelState(state)));
        const message = divergence(trace);
        if (firstViolation === -1) {
          expect(message).toBeNull();
          continue;
        }
        violating += 1;
        expect(message).toMatch(refusal);
        expect(message!.startsWith(`state ${String(firstViolation)}:`)).toBe(true);
      }
      expect(violating).toBeGreaterThan(0);
    });
  }

  test("an unknown action or a missing pick fails closed instead of skipping a step", () => {
    const none = { tag: "None", value: { "#tup": [] } };
    const some = (value: unknown) => ({ tag: "Some", value });
    const partMap = (values: readonly unknown[]) => ({ "#map": values.map((value, index) => [{ "#bigint": String(index) }, value]) });
    const state = (index: number, action: string, picks: Record<string, unknown>, parts: readonly string[]) => ({
      "#meta": { index },
      runState: "pending",
      parts: partMap(parts),
      messageIds: partMap(["", "", ""]),
      proven: { "#bigint": "0" },
      observed: { "#bigint": "0" },
      possible: { "#bigint": "-1" },
      reason: "",
      outcome: false,
      dispatches: partMap([{ "#bigint": "0" }, { "#bigint": "0" }, { "#bigint": "0" }]),
      "mbt::actionTaken": action,
      "mbt::nondetPicks": picks,
    });
    const allPicks = (obs: unknown) => ({
      faultRoll: some({ "#bigint": "1" }),
      id: some("m1"),
      indReason: some("journal-recovery-required"),
      obs,
      partState: some("failed-permanent"),
      stopReason: some("context-drift"),
      withOutcome: some(false),
    });
    const trace = (action: string, obs: unknown): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [
        state(0, "init", Object.fromEntries(PICKS.map((name) => [name, none])), ["unattempted", "unattempted", "unattempted"]),
        state(1, action, allPicks(obs), ["claimed", "unattempted", "unattempted"]),
      ],
    }));
    expect(divergence(trace("claim", some({ "#bigint": "0" })))).toBeNull();
    expect(() => divergence(trace("send", some({ "#bigint": "0" })))).toThrow("unknown action send");
    expect(() => divergence(trace("claim", none))).toThrow("records no obs pick");
    expect(() => divergence(trace("claim", { tag: "Maybe", value: { "#bigint": "0" } }))).toThrow("Some(value) or None");
    expect(divergence(trace("dispatch", some({ "#bigint": "0" }))))
      .toBe("state 1: production refused dispatch: messaging part was not claimed");
  });
});
