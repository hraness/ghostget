/**
 * ITF trace replay for `verification/quint/approvals.qnt` against the
 * production `ApprovalBroker` (src/control/approval-broker.ts).
 *
 * Quint writes seeded model-based-testing traces. Each trace drives one real
 * broker, one recorded action at a time. The policy recompute and recheck
 * callbacks are held open for each check until the model's `checkEnd`, so
 * other actions interleave with a check that is waiting on its recheck, as
 * they can in the control service. After every step the replay compares the
 * broker's response and its pending list with the model state.
 */
import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ApprovalBroker } from "../src/control/approval-broker.js";
import type { AgentApprovalResponse, ApprovalTarget, CheckedApproval } from "../src/control/protocol.js";
import { ControlError } from "../src/control/validation.js";
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

const MODEL_FILE = "approvals.qnt";
const TRACE_VARIABLES = [
  "allowedTo", "anonSeq", "bound", "claimed", "drift", "flight", "gen", "holder", "mbt::actionTaken",
  "mbt::nondetPicks", "requester", "response", "status",
];
const PICKS = ["c", "flag", "p", "withSecret"];
const ACTIONS = ["cancel", "checkBegin", "checkEnd", "crash", "decide", "expire", "policyChange"];
const GRANT = "grant";

const target: ApprovalTarget = { kind: "web", method: "GET", url: "https://docs.example.com/" };
const checked: CheckedApproval = {
  digest: "a".repeat(64),
  revision: 1,
  decision: "ask",
  kind: "web",
  title: "GET docs.example.com",
  account: null,
  effect: "retrieval",
  preview: "Bound exact URL",
};
/** What the policy recomputes after it changes: the same target under a different digest. */
const drifted: CheckedApproval = { ...checked, digest: "b".repeat(64) };

type Id = Readonly<{ who: string; gen: bigint }>;

function useSecret(id: Id): string | undefined {
  return id.who === "anon" ? undefined : `use-${id.who}-${id.gen.toString()}`;
}

/** Operations the broker can be driven through; the seeded defects wrap the production broker. */
type Broker = Pick<ApprovalBroker, "check" | "decide" | "cancel" | "list">
  & Readonly<{ request(id: string, digest: string, use?: string): Promise<AgentApprovalResponse> }>;

type Defect = "none" | "request-ignores-secret";

class ReplayDivergence extends Error {
  constructor(readonly index: number, message: string) {
    super(`state ${String(index)}: ${message}`);
  }
}

type Deferred = { resolve(value: CheckedApproval): void; readonly promise: Promise<CheckedApproval> };

function deferred(): Deferred {
  let resolve: (value: CheckedApproval) => void = () => undefined;
  const promise = new Promise<CheckedApproval>((settle) => {
    resolve = settle;
  });
  return { resolve, promise };
}

/** The production broker, its fake clock and policy, and the checks still waiting on a recheck. */
class Harness {
  now = 0;
  policyOk = true;
  anonSeq = 0n;
  readonly gen = new Map<string, bigint>([["a", 0n], ["b", 0n]]);
  /** The caller whose check() is on the stack, so the policy callback can hold its recheck open. */
  private caller: string | null = null;
  readonly waiting = new Map<string, Deferred>();
  readonly inFlight = new Map<string, Promise<AgentApprovalResponse>>();
  readonly broker: Broker;

  constructor(defect: Defect) {
    const policy = (): Promise<CheckedApproval> => {
      const caller = this.caller;
      if (caller === null) return Promise.resolve(this.policyOk ? checked : drifted);
      if (this.waiting.has(caller)) throw new Error(`${caller} already waits on a recheck`);
      const pending = deferred();
      this.waiting.set(caller, pending);
      return pending.promise;
    };
    const production = new ApprovalBroker(policy, () => this.now, policy, () => 1_800_000_000_000 + this.now);
    this.broker = {
      request: (id, digest, use) => production.request(id, target, digest, defect === "request-ignores-secret" ? undefined : use),
      check: (id, digest, use) => production.check(id, digest, use),
      decide: (id, digest, decision) => production.decide(id, digest, decision),
      cancel: (id, digest) => production.cancel(id, digest),
      list: () => production.list(),
    };
  }

  identity(caller: string): Id {
    if (caller === "anon") return { who: "anon", gen: this.anonSeq };
    const gen = this.gen.get(caller);
    if (gen === undefined) throw new Error(`unknown caller ${caller}`);
    return { who: caller, gen };
  }

  /** Start check() as `caller`; the policy callback runs synchronously inside it. */
  begin(caller: string): void {
    const id = this.identity(caller);
    if (caller === "anon") this.anonSeq += 1n;
    this.caller = caller;
    try {
      this.inFlight.set(caller, this.broker.check(GRANT, checked.digest, useSecret(id)));
    } finally {
      this.caller = null;
    }
  }

  /** Resolve the caller's recheck with the policy as it is now and collect the response. */
  async end(caller: string): Promise<string> {
    const response = this.inFlight.get(caller);
    if (response === undefined) throw new Error(`${caller} has no check in flight`);
    this.inFlight.delete(caller);
    const pending = this.waiting.get(caller);
    this.waiting.delete(caller);
    pending?.resolve(this.policyOk ? checked : drifted);
    return (await response).status;
  }

  async decide(allow: boolean): Promise<string> {
    try {
      await this.broker.decide(GRANT, checked.digest, allow ? "allow-once" : "deny");
      return "decided";
    } catch (error) {
      if (error instanceof ControlError && error.code === "APPROVAL_STALE") return "stale";
      throw error;
    }
  }

  /** Let every check that a trace left waiting finish, so nothing outlives the test. */
  async drain(): Promise<void> {
    for (const pending of this.waiting.values()) pending.resolve(drifted);
    this.waiting.clear();
    await Promise.allSettled(this.inFlight.values());
    this.inFlight.clear();
  }
}

type Flight = Readonly<{ active: boolean; awaiting: boolean }>;

type ModelState = Readonly<{
  status: string;
  response: string;
  bound: boolean;
  requester: Id;
  allowedTo: readonly Id[];
  flight: ReadonlyMap<string, Flight>;
}>;

function itfBool(value: ItfValue, label: string): boolean {
  if (value.kind !== "bool") throw new Error(`ITF ${label} must be a boolean`);
  return value.value;
}

function itfId(value: ItfValue, label: string): Id {
  const fields = itfRecord(value, ["who", "gen"], label);
  const gen = fields.get("gen")!;
  if (gen.kind !== "int") throw new Error(`ITF ${label}.gen must be an integer`);
  return { who: itfString(fields.get("who")!, `${label}.who`), gen: gen.value };
}

function modelState(state: ItfState): ModelState {
  const allowed = itfVariable(state, "allowedTo");
  if (allowed.kind !== "set") throw new Error("ITF allowedTo must be a set");
  const flights = itfVariable(state, "flight");
  if (flights.kind !== "map") throw new Error("ITF flight must be a map");
  const flight = new Map<string, Flight>();
  for (const [key, value] of flights.entries) {
    const fields = itfRecord(value, ["active", "id", "awaiting", "immediate"], "flight entry");
    flight.set(itfString(key, "flight key"), {
      active: itfBool(fields.get("active")!, "flight.active"),
      awaiting: itfBool(fields.get("awaiting")!, "flight.awaiting"),
    });
  }
  return {
    status: itfString(itfVariable(state, "status"), "status"),
    response: itfString(itfVariable(state, "response"), "response"),
    bound: itfBool(itfVariable(state, "bound"), "bound"),
    requester: itfId(itfVariable(state, "requester"), "requester"),
    allowedTo: allowed.items.map((item) => itfId(item, "allowedTo member")),
    flight,
  };
}

/** The model's two safety invariants, evaluated on one recorded state. */
function safe(state: ModelState): boolean {
  const atMostOneUse = state.allowedTo.length <= 1;
  const onlyHolderAllowed = !state.bound
    || state.allowedTo.every((id) => id.who === state.requester.who && id.gen === state.requester.gen);
  return atMostOneUse && onlyHolderAllowed;
}

type RecordedStep = Readonly<{ action: string; caller: string | null; process: string | null; flag: boolean | null; withSecret: boolean | null }>;

function recordedStep(state: ItfState): RecordedStep {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const picks = itfRecord(itfVariable(state, "mbt::nondetPicks"), PICKS, "mbt::nondetPicks");
  const text = (name: string): string | null => {
    const pick = itfOption(picks.get(name)!, `mbt::nondetPicks.${name}`);
    return pick === null ? null : itfString(pick, `mbt::nondetPicks.${name}`);
  };
  const bool = (name: string): boolean | null => {
    const pick = itfOption(picks.get(name)!, `mbt::nondetPicks.${name}`);
    return pick === null ? null : itfBool(pick, `mbt::nondetPicks.${name}`);
  };
  return { action, caller: text("c"), process: text("p"), flag: bool("flag"), withSecret: bool("withSecret") };
}

function need<T>(value: T | null, index: number, what: string): T {
  if (value === null) throw new Error(`state ${String(index)} records no ${what}`);
  return value;
}

/** Apply one recorded action to the broker and return the response it delivered, or "". */
async function apply(harness: Harness, step: RecordedStep, index: number): Promise<string> {
  switch (step.action) {
    case "decide":
      return harness.decide(need(step.flag, index, "decision"));
    case "checkBegin":
      harness.begin(need(step.caller, index, "caller"));
      return "";
    case "checkEnd":
      return harness.end(need(step.caller, index, "caller"));
    case "crash": {
      const process = need(step.process, index, "process");
      harness.gen.set(process, harness.identity(process).gen + 1n);
      return "";
    }
    case "cancel":
      return harness.broker.cancel(GRANT, checked.digest).status;
    case "expire":
      harness.now += 600_001;
      return "";
    case "policyChange":
      harness.policyOk = !harness.policyOk;
      return "";
    default:
      throw new Error(`state ${String(index)} records an unknown action ${step.action}`);
  }
}

function compare(harness: Harness, expected: ModelState, response: string, index: number, action: string): void {
  if (response !== expected.response) {
    throw new ReplayDivergence(index, `${action} answered ${JSON.stringify(response)}, the model ${JSON.stringify(expected.response)}`);
  }
  const pending = harness.broker.list().length;
  if (pending !== (expected.status === "pending" ? 1 : 0)) {
    throw new ReplayDivergence(index, `after ${action} the broker lists ${String(pending)} pending, the model status is ${expected.status}`);
  }
  for (const [caller, flight] of expected.flight) {
    const waits = harness.waiting.has(caller);
    if (waits !== (flight.active && flight.awaiting)) {
      throw new ReplayDivergence(index, `after ${action} ${caller} ${waits ? "waits" : "does not wait"} on a recheck, the model disagrees`);
    }
  }
}

/** Drive a fresh broker through every recorded action of `trace`, failing at the first divergence. */
async function replay(trace: ItfTrace, defect: Defect = "none"): Promise<void> {
  const [initial, ...steps] = trace.states;
  if (initial === undefined) throw new Error("A trace needs its initial state");
  const first = recordedStep(initial);
  if (first.action !== "init") throw new Error("A trace must start with the init action");
  const withSecret = need(first.withSecret, 0, "withSecret pick");
  const harness = new Harness(defect);
  try {
    const requested = await harness.broker.request(GRANT, checked.digest, withSecret ? useSecret(harness.identity("a")) : undefined);
    compare(harness, modelState(initial), requested.status, 0, "request");
    for (const state of steps) {
      const step = recordedStep(state);
      const response = await apply(harness, step, state.index);
      compare(harness, modelState(state), response, state.index, step.action);
    }
  } finally {
    await harness.drain();
  }
}

async function divergence(trace: ItfTrace, defect: Defect = "none"): Promise<ReplayDivergence | null> {
  try {
    await replay(trace, defect);
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error;
    throw error;
  }
}

async function approvalsModel(): Promise<QuintModel> {
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
  const model = await approvalsModel();
  const cached = cache.get(step) ?? generateTraces(model, step);
  cache.set(step, cached);
  return cached;
}

describe("approvals.qnt ITF replay", () => {
  test("replays every seeded model trace through the production broker", async () => {
    const model = await approvalsModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-approvals-replay.test.ts");
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const actions = new Set<string>();
    const responses = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      const failure = await divergence(trace);
      expect(failure?.message ?? null).toBeNull();
      for (const state of trace.states.slice(1)) {
        const { action, caller } = recordedStep(state);
        actions.add(action);
        const { response } = modelState(state);
        if (action === "checkEnd") responses.add(`${String(caller)}:${response}`);
      }
    }
    expect([...actions].sort()).toEqual(ACTIONS);
    // Every caller sees the grant allowed, refused and revoked somewhere in the traces.
    for (const caller of ["a", "b", "anon"]) {
      for (const response of ["allowed", "expired", "invalid", "pending"]) expect(responses).toContain(`${caller}:${response}`);
    }
  });

  test("a broker that drops the request's use secret diverges from the model traces", async () => {
    const model = await approvalsModel();
    let diverged = 0;
    for (const trace of await traces(model.step)) {
      const failure = await divergence(trace, "request-ignores-secret");
      if (failure === null) continue;
      diverged += 1;
      // Without the request's binding another caller is admitted where the model refuses it.
      expect(failure.message).toMatch(/^state \d+: (checkEnd answered "[a-z]+", the model "expired"|after checkBegin (a|b|anon) waits on a recheck, the model disagrees)$/u);
    }
    expect(diverged).toBeGreaterThan(0);
  });

  for (const mutant of ["stepShared", "stepFirstCheck", "stepAdmitBeforeAwait"]) {
    test(`the production broker refuses every ${mutant} trace that breaks a grant invariant`, async () => {
      const model = await approvalsModel();
      expect(model.mutants.map((entry) => entry.step)).toContain(mutant);
      let violating = 0;
      for (const trace of await traces(mutant)) {
        const firstUnsafe = trace.states.findIndex((state) => !safe(modelState(state)));
        const failure = await divergence(trace);
        if (firstUnsafe < 0) continue;
        violating += 1;
        // The broker must refuse at or before the state where the mutant hands out a second use.
        expect(failure).not.toBeNull();
        expect(failure!.index).toBeLessThanOrEqual(firstUnsafe);
      }
      expect(violating).toBeGreaterThan(0);
    });
  }

  test("an unknown action or a missing pick fails closed instead of skipping a step", async () => {
    const text = (action: string, drop: string | null): ItfTrace => {
      const encoded = {
        vars: TRACE_VARIABLES,
        states: [
          initialState(),
          { ...initialState(), "#meta": { index: 1 }, response: "cancelled", status: "gone", "mbt::actionTaken": action, "mbt::nondetPicks": picks(drop) },
        ],
      };
      return parseItfTrace(JSON.stringify(encoded));
    };
    expect(await divergence(text("cancel", null))).toBeNull();
    await expect(divergence(text("steal", null))).rejects.toThrow("unknown action steal");
    await expect(divergence(text("checkBegin", "c"))).rejects.toThrow("records no caller");
    await expect(divergence(text("decide", "flag"))).rejects.toThrow("records no decision");
  });
});

const none = { tag: "None", value: { "#tup": [] } };

function picks(drop: string | null): Record<string, unknown> {
  const all: Record<string, unknown> = {
    c: { tag: "Some", value: "a" },
    p: { tag: "Some", value: "a" },
    flag: { tag: "Some", value: true },
    withSecret: none,
  };
  if (drop !== null) all[drop] = none;
  return all;
}

function initialState(): Record<string, unknown> {
  const nobody = { who: "", gen: { "#bigint": "0" } };
  const idle = { active: false, id: nobody, awaiting: false, immediate: "" };
  return {
    "#meta": { index: 0 },
    allowedTo: { "#set": [] },
    anonSeq: { "#bigint": "0" },
    bound: true,
    claimed: false,
    flight: { "#map": [["a", idle], ["anon", idle], ["b", idle]] },
    gen: { "#map": [["a", { "#bigint": "0" }], ["b", { "#bigint": "0" }]] },
    holder: { who: "a", gen: { "#bigint": "0" } },
    drift: { "#bigint": "0" },
    requester: { who: "a", gen: { "#bigint": "0" } },
    response: "pending",
    status: "pending",
    "mbt::actionTaken": "init",
    "mbt::nondetPicks": { c: none, flag: none, p: none, withSecret: { tag: "Some", value: true } },
  };
}
