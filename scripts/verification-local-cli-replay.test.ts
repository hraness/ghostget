/**
 * ITF trace replay for `verification/quint/local-cli.qnt` against the
 * production local-CLI mutation runtimes.
 *
 * Quint writes seeded model-based-testing traces of one confirmed local-CLI
 * mutation. Each trace becomes a script for the injected child runner and the
 * kernel hooks: `gate` makes the dispatch boundary refuse before the next
 * child, `spawn` lets it pass, `accept` returns the child's exact acceptance,
 * and each fault kind returns what that failure looks like at the runner seam
 * (a thrown deadline or lost-response error, a signal or nonzero exit status,
 * malformed stdout, the child's own "not started" report, or a failure while
 * the runtime records the acceptance). The script then runs through
 * `executeImsgDirectOperation` for the one-child iMessage send and through
 * `executeBeeperLocalOperation` for Beeper `presence.set`, with one child when
 * the trace plans one and the bounded typing-then-paused pair when it plans
 * two. The replay compares each production result with the model's final
 * state: status, planned, started, and verified counts, and the runner's count
 * of child starts per child, which mirrors the model's ghost `spawns`.
 *
 * The runner seam stands in for `runImsgRpc` and `runBeeperCli`; how they turn
 * a real timeout or signal into an error is covered by their example tests.
 */
import { afterAll, describe, expect, jest, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GhostgetAuth } from "../src/auth.js";
import type { LocalCliExecution, LocalCliExecutionOptions } from "../src/local-cli-execution.js";
import type { LocalCliRecipe } from "../src/model.js";
import {
  beeperSubjectFromAccountsAndTarget,
  executeBeeperLocalOperation,
  parseBeeperExportAccounts,
  type BeeperCliInvocation,
  type BeeperCliInvocationResult,
} from "../src/providers/beeper-local-runtime.js";
import {
  executeImsgDirectOperation,
  type ImsgRpcInvocation,
  type ImsgRpcInvocationResult,
} from "../src/providers/imessage-direct-runtime.js";
import {
  itfOption,
  itfRecord,
  itfString,
  itfVariable,
  parseItfTrace,
  type ItfState,
  type ItfTrace,
} from "./verification-itf.js";
import { itfInt, quintModel, quintTraceCache } from "./verification-replay.js";

const MODEL_FILE = "local-cli.qnt";
const STATE_VARIABLES = ["failure", "planned", "runState", "spawns", "started", "verified"];
const TRACE_VARIABLES = [...STATE_VARIABLES, "mbt::actionTaken", "mbt::nondetPicks"].sort();
const PICKS = ["kind", "n"];
const FAULTS = ["timeout", "signal", "exit", "malformed", "lost", "not-started", "record"] as const;
type Fault = (typeof FAULTS)[number];
type ChildOutcome = "accept" | Fault;
type Target = "imessage" | "beeper";

/**
 * The production runtimes, plus a seeded defect: `trust-not-started` reports
 * a child that says it did not start as a categorical failure, which is what a
 * runtime that believed the child would return.
 */
type Defect = "none" | "trust-not-started";

type Snapshot = Readonly<{
  planned: number;
  runState: string;
  started: number;
  verified: number;
  spawns: readonly number[];
}>;

const describeSnapshot = (snapshot: Snapshot): string => JSON.stringify(snapshot);

function modelSnapshot(state: ItfState): Snapshot {
  const spawns = itfVariable(state, "spawns");
  if (spawns.kind !== "map" || spawns.entries.length !== 2) throw new Error("ITF spawns must map children 1 and 2");
  const counts = [0, 0];
  for (const [key, value] of spawns.entries) {
    const child = itfInt(key, "spawns key");
    if (child !== 1 && child !== 2) throw new Error(`ITF spawns has an unexpected child ${String(child)}`);
    counts[child - 1] = itfInt(value, `spawns[${String(child)}]`);
  }
  return {
    planned: itfInt(itfVariable(state, "planned"), "planned"),
    runState: itfString(itfVariable(state, "runState"), "runState"),
    started: itfInt(itfVariable(state, "started"), "started"),
    verified: itfInt(itfVariable(state, "verified"), "verified"),
    spawns: counts,
  };
}

type RecordedStep = Readonly<{ action: string; kind: string | null }>;

function recordedStep(state: ItfState): RecordedStep {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const fields = itfRecord(itfVariable(state, "mbt::nondetPicks"), PICKS, "mbt::nondetPicks");
  const kind = itfOption(fields.get("kind")!, "mbt::nondetPicks.kind");
  return { action, kind: kind === null ? null : itfString(kind, "kind") };
}

/** What production is asked to do: where the boundary refuses, and how each started child ends. */
type Script = Readonly<{
  planned: number;
  gateBefore: number | null;
  outcomes: ReadonlyMap<number, ChildOutcome>;
}>;

function isFault(value: string): value is Fault {
  return (FAULTS as readonly string[]).includes(value);
}

/** Translate the recorded actions into a runner script, failing closed on anything unknown. */
function script(trace: ItfTrace): Script {
  const [initial, ...steps] = trace.states;
  if (initial === undefined || recordedStep(initial).action !== "init") throw new Error("A trace must start with the init action");
  const planned = modelSnapshot(initial).planned;
  if (planned !== 1 && planned !== 2) throw new Error(`the model planned ${String(planned)} children`);
  let current = 0;
  let gateBefore: number | null = null;
  let ended = false;
  const outcomes = new Map<number, ChildOutcome>();
  const end = (outcome: ChildOutcome): void => {
    if (!outcomes.has(current)) outcomes.set(current, outcome);
  };
  for (const state of steps) {
    const { action, kind } = recordedStep(state);
    if (ended && action !== "done") continue;
    switch (action) {
      case "spawn":
        current += 1;
        break;
      case "gate":
        gateBefore = current + 1;
        ended = true;
        break;
      case "accept":
        end("accept");
        break;
      case "fault":
        if (kind === null || !isFault(kind)) throw new Error(`state ${String(state.index)} records an unknown fault ${String(kind)}`);
        end(kind);
        ended = true;
        break;
      // The seeded model defects. Production cannot retry, so its runner sees
      // the timeout that the model retries after; it sees the child's own
      // "not started" report that the model believes.
      case "retryTimeout":
        end("timeout");
        ended = true;
        break;
      case "trustNotStarted":
        end("not-started");
        ended = true;
        break;
      case "done":
        break;
      default:
        throw new Error(`state ${String(state.index)} records an unknown action ${action}`);
    }
  }
  return { planned, gateBefore, outcomes };
}

const temporaryRoots: string[] = [];

function temporaryRoot(prefix: string): string {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  chmodSync(path, 0o700);
  temporaryRoots.push(path);
  return path;
}

afterAll(() => {
  for (const path of temporaryRoots.splice(0)) rmSync(path, { recursive: true, force: true });
});

class GateRefusal extends Error {}
class RecordFailure extends Error {}

/** The runner result for a child that ended with `fault`, or null when the runner throws instead. */
function faultResult(fault: Fault, acceptedStdout: string, notStartedStdout: string): BeeperCliInvocationResult {
  switch (fault) {
    case "timeout":
      throw new Error("fixture child exceeded its deadline and its process group was stopped");
    case "lost":
      throw new Error("fixture child response was lost");
    case "signal":
      return { exitCode: 143, stdout: "", stderr: "" };
    case "exit":
      return { exitCode: 1, stdout: "", stderr: "fixture failure" };
    case "malformed":
      return { exitCode: 0, stdout: "{\"truncated\":\n", stderr: "" };
    case "not-started":
      return { exitCode: 0, stdout: notStartedStdout, stderr: "" };
    case "record":
      return { exitCode: 0, stdout: acceptedStdout, stderr: "" };
  }
}

type Observed = { spawns: number[] };

/** The kernel hooks: the boundary refuses where the script says, and acceptance recording fails on `record`. */
function hooks(plan: Script, observed: Observed, onVerified: (index: number) => void): LocalCliExecutionOptions {
  return {
    beforeDispatch: async (event) => {
      if (event.index === plan.gateBefore) throw new GateRefusal("fixture dispatch boundary refused");
    },
    afterProviderAcceptedMutationTarget: async (event) => {
      if (plan.outcomes.get(event.index) === "record") throw new RecordFailure("fixture target record failed");
    },
    afterDispatchVerified: async (event) => {
      if (plan.outcomes.get(event.index) === "record") throw new RecordFailure("fixture verified record failed");
      onVerified(event.index);
    },
  };
}

// iMessage: one `send` child after one `status` read.

const IMSG_CHAT_GUID = "iMessage;+;fixture-chat";
const IMSG_MESSAGE_GUID = "fixture-outgoing-guid";

function imsgRecipe(): LocalCliRecipe {
  return { surface: "imessage", action: "messaging.send", contractVersion: 1, timeoutMs: 5_000, maxOutputBytes: 1024 * 1024 };
}

function imsgAuth(storePath: string): Extract<GhostgetAuth, { readonly kind: "linked-device-store" }> {
  const databasePath = join(storePath, "chat.db");
  if (!existsSync(databasePath)) writeFileSync(databasePath, "", { mode: 0o600 });
  return { schemaVersion: 1, id: "imessage-fixture", kind: "linked-device-store", provider: "imessage", path: storePath };
}

function imsgStatus(databasePath: string): unknown {
  const methods = ["status", "chats.list", "chats.get", "messages.history", "send", "message.send_status"];
  return {
    version: "0.14.1",
    protocol_version: 1,
    database: { path: databasePath, ready: true, features: {} },
    bridge: { ready: false, error: "not running" },
    contacts: { available: true },
    methods,
    supported_methods: methods,
  };
}

const rpc = (id: string, result: unknown): string => JSON.stringify({ jsonrpc: "2.0", id, result });

async function runImessage(plan: Script, defect: Defect): Promise<Readonly<{ result: LocalCliExecution; observed: Observed }>> {
  const storePath = temporaryRoot("ghostget-local-cli-replay-imsg-");
  const observed: Observed = { spawns: [0, 0] };
  const run = async (invocation: ImsgRpcInvocation): Promise<ImsgRpcInvocationResult> => {
    const requests = invocation.stdin.trimEnd().split("\n").map((line) => JSON.parse(line) as { id: string; method: string });
    if (requests.length === 1 && requests[0]!.method === "status") {
      return { exitCode: 0, stdout: `${rpc(requests[0]!.id, imsgStatus(join(storePath, "chat.db")))}\n`, stderr: "" };
    }
    const send = requests.find((request) => request.method === "send");
    if (send === undefined) throw new Error(`unexpected fixture methods ${requests.map((request) => request.method).join(",")}`);
    await invocation.beforeSpawn?.();
    observed.spawns[0]! += 1;
    const accepted = `${requests.map((request) => request.method === "send"
      ? rpc(request.id, {
        ok: true, transport: "applescript", id: 99, guid: IMSG_MESSAGE_GUID, message_id: IMSG_MESSAGE_GUID,
        chat_guid: IMSG_CHAT_GUID, service: "iMessage",
      })
      : rpc(request.id, { chat: { id: 7, guid: IMSG_CHAT_GUID, service: "iMessage" } })).join("\n")}\n`;
    const notStarted = `${JSON.stringify({
      jsonrpc: "2.0",
      id: send.id,
      error: {
        code: -32001,
        message: "categorical fixture",
        data: { disposition: "not_started", retry_safe: true, transport: "applescript", operation: "send", detail: "fixture" },
      },
    })}\n`;
    const outcome = plan.outcomes.get(1);
    if (outcome === undefined) throw new Error("the script ended the child without an outcome");
    return outcome === "accept"
      ? { exitCode: 0, stdout: accepted, stderr: "" }
      : faultResult(outcome, accepted, notStarted);
  };
  let result = await executeImsgDirectOperation(
    imsgRecipe(),
    { chat_guid: IMSG_CHAT_GUID, service: "iMessage", observed_chat_row_id: 7, text: "replay canary" },
    imsgAuth(storePath),
    { dependencies: { binaryPath: "/fixture/reviewed-imsg", expectedMessagesStorePath: storePath, run }, ...hooks(plan, observed, () => undefined) },
  );
  if (defect === "trust-not-started" && isNotStartedReport(result)) result = { ...result, status: "failed" };
  return { result, observed };
}

function isNotStartedReport(result: LocalCliExecution): boolean {
  return typeof result.output === "object" && result.output !== null
    && (result.output as Record<string, unknown>).transportOutcome === "not_started";
}

// Beeper: `presence.set` after the version, target, account, and chat reads.

const BEEPER_ACCOUNT_ID = "account-signal";
const BEEPER_CHAT_ID = "!chat-synthetic:beeper.local";
const BEEPER_BUNDLE_ID = "com.automattic.beeper.desktop";
const BEEPER_BASE_URL = "http://127.0.0.1:23384";

function beeperEnvelope(data: unknown): BeeperCliInvocationResult {
  return { exitCode: 0, stdout: `${JSON.stringify({ success: true, data, error: null })}\n`, stderr: "" };
}

function beeperAccounts(): readonly unknown[] {
  return [{
    accountID: "account-beeper",
    bridge: { id: "beeper", provider: "cloud", type: "matrix" },
    loginID: "redacted-login",
    network: "Beeper",
    status: "connected",
    user: { fullName: "Fixture Self", id: "@self:beeper.local", isSelf: true },
  }, {
    accountID: BEEPER_ACCOUNT_ID,
    bridge: { id: "signal", provider: "cloud", type: "signal" },
    loginID: "+15550000000",
    network: "Signal",
    status: "connected",
    user: { fullName: "Fixture Self", id: "signal:self", isSelf: true },
  }];
}

function beeperChat(): unknown {
  return {
    accountID: BEEPER_ACCOUNT_ID,
    id: BEEPER_CHAT_ID,
    lastActivity: "2026-08-21T14:00:00.000Z",
    network: "Signal",
    participants: {
      hasMore: false,
      items: [
        { displayText: "Ada Fixture", fullName: "Ada Fixture", id: "signal:ada", isSelf: false },
        { fullName: "Fixture Self", id: "signal:self", isSelf: true },
      ],
      total: 2,
    },
    title: "Ada Fixture",
    type: "single",
    unreadCount: 0,
  };
}

function beeperStore(): string {
  const path = temporaryRoot("ghostget-local-cli-replay-beeper.");
  chmodSync(path, 0o755);
  mkdirSync(join(path, "targets"), { mode: 0o755 });
  writeFileSync(join(path, "config.json"), `${JSON.stringify({ defaultTarget: "desktop" })}\n`, { mode: 0o600 });
  writeFileSync(join(path, "targets", "desktop.json"), `${JSON.stringify({
    auth: { accessToken: "fixture-never-read-by-test-runner", source: "manual", tokenType: "Bearer" },
    baseURL: BEEPER_BASE_URL,
    id: "desktop",
    managed: false,
    name: "Desktop",
    runtime: { install: "desktop", port: 23_384 },
    type: "desktop",
  })}\n`, { mode: 0o600 });
  return path;
}

function beeperAuth(path: string): Extract<GhostgetAuth, { readonly kind: "linked-device-store" }> {
  return {
    schemaVersion: 1,
    id: "beeper-fixture",
    kind: "linked-device-store",
    provider: "beeper",
    path,
    subject: beeperSubjectFromAccountsAndTarget(parseBeeperExportAccounts(beeperAccounts()), BEEPER_BASE_URL, BEEPER_BUNDLE_ID, "4.2.0-fixture"),
  };
}

async function runBeeper(plan: Script, defect: Defect): Promise<Readonly<{ result: LocalCliExecution; observed: Observed }>> {
  const path = beeperStore();
  const observed: Observed = { spawns: [0, 0] };
  let child = 0;
  const run = async (invocation: BeeperCliInvocation): Promise<BeeperCliInvocationResult> => {
    const command = invocation.arguments.slice(0, 2).join(" ");
    if (invocation.arguments[0] === "version") return beeperEnvelope({ name: "@beeper/cli", version: "0.6.2" });
    if (command === "targets status") {
      return beeperEnvelope({
        target: { id: "desktop", type: "desktop", baseURL: BEEPER_BASE_URL, auth: { accessToken: "fixture", tokenType: "Bearer" }, managed: false },
        reachable: true,
        version: "4.2.0-fixture",
        bundleID: BEEPER_BUNDLE_ID,
        actualType: "desktop",
      });
    }
    if (command === "accounts list") return beeperEnvelope(beeperAccounts());
    if (command === "chats show") return beeperEnvelope(beeperChat());
    if (invocation.arguments[0] !== "presence") throw new Error(`unexpected fixture command ${command}`);
    await invocation.beforeSpawn?.();
    child += 1;
    observed.spawns[child - 1]! += 1;
    const state = child === 1 ? "typing" : "paused";
    const accepted = `${JSON.stringify({ success: true, data: { message: `Sent ${state} indicator`, chatID: BEEPER_CHAT_ID, state }, error: null })}\n`;
    const notStarted = `${JSON.stringify({ success: false, data: null, error: { message: "fixture presence was not started" } })}\n`;
    const outcome = plan.outcomes.get(child);
    if (outcome === undefined) throw new Error("the script ended the child without an outcome");
    return outcome === "accept"
      ? { exitCode: 0, stdout: accepted, stderr: "" }
      : faultResult(outcome, accepted, notStarted);
  };
  // The bounded pair waits one second between typing and paused. Fake timers
  // for that wait only: once the runtime arms its timer, fire it and restore
  // real timers. Bun fakes every timer source, so the watcher polls on
  // microtasks rather than on a timer.
  const skipPresenceWait = (index: number): void => {
    if (plan.planned !== 2 || index !== 1) return;
    jest.useFakeTimers();
    void (async () => {
      for (let turn = 0; turn < 100_000 && jest.getTimerCount() === 0; turn += 1) await Promise.resolve();
      jest.advanceTimersByTime(1_000);
      jest.useRealTimers();
    })();
  };
  const input = plan.planned === 2
    ? { account_id: BEEPER_ACCOUNT_ID, conversation_id: BEEPER_CHAT_ID, state: "typing", duration_seconds: 1 }
    : { account_id: BEEPER_ACCOUNT_ID, conversation_id: BEEPER_CHAT_ID, state: "typing" };
  let result = await executeBeeperLocalOperation(
    { surface: "beeper", action: "presence.set", contractVersion: 1, timeoutMs: 60_000, maxOutputBytes: 1024 * 1024 },
    input,
    beeperAuth(path),
    { dependencies: { binaryPath: "/fixture/beeper-0.6.2", run }, ...hooks(plan, observed, skipPresenceWait) },
  );
  if (defect === "trust-not-started" && plan.outcomes.get(result.dispatch.started) === "not-started") {
    result = { ...result, status: result.dispatch.verified > 0 ? "partial" : "failed" };
  }
  return { result, observed };
}

const statusOf = (result: LocalCliExecution): string => result.status;

/**
 * A production run depends only on its script, and many traces share one
 * script, so each distinct script runs once per runtime and defect and every
 * trace is compared with that run. Each run uses a fresh store.
 */
const productionRuns = new Map<string, Promise<Readonly<{ result: LocalCliExecution; observed: Observed }>>>();

function scriptKey(plan: Script): string {
  return JSON.stringify([plan.planned, plan.gateBefore, [...plan.outcomes.entries()].sort(([a], [b]) => a - b)]);
}

function productionRun(plan: Script, target: Target, defect: Defect): Promise<Readonly<{ result: LocalCliExecution; observed: Observed }>> {
  const key = `${target} ${defect} ${scriptKey(plan)}`;
  const cached = productionRuns.get(key) ?? (target === "imessage" ? runImessage(plan, defect) : runBeeper(plan, defect));
  productionRuns.set(key, cached);
  return cached;
}

class ReplayDivergence extends Error {}

/**
 * Replay `trace` through `target`, or return "running" when the trace ends
 * before the mutation does, which leaves the runner without an outcome.
 */
async function replay(trace: ItfTrace, target: Target, defect: Defect = "none"): Promise<"compared" | "running" | "skipped"> {
  const final = modelSnapshot(trace.states.at(-1)!);
  const plan = script(trace);
  if (target === "imessage" && plan.planned !== 1) return "skipped";
  const actuallyRunning = final.runState === "running"
    && !trace.states.some((state) => ["retryTimeout", "trustNotStarted"].includes(recordedStep(state).action));
  if (actuallyRunning) return "running";
  const { result, observed } = await productionRun(plan, target, defect);
  const production: Snapshot = {
    planned: result.dispatch.planned,
    runState: statusOf(result),
    started: result.dispatch.started,
    verified: result.dispatch.verified,
    spawns: observed.spawns,
  };
  if (result.dispatchStarted !== (result.dispatch.started > 0)) {
    throw new ReplayDivergence(`${target}: dispatchStarted disagrees with started ${String(result.dispatch.started)}`);
  }
  if (describeSnapshot(production) !== describeSnapshot(final)) {
    throw new ReplayDivergence(`${target}: production ends ${describeSnapshot(production)}, the model ${describeSnapshot(final)}`);
  }
  return "compared";
}

async function divergence(trace: ItfTrace, target: Target, defect: Defect = "none"): Promise<string | null> {
  try {
    await replay(trace, target, defect);
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error.message;
    throw error;
  }
}

/** The model's invariants, evaluated independently of Quint on a trace state. */
function invariantHolds(name: "postSpawnIndeterminate" | "noRespawn", state: Snapshot): boolean {
  if (name === "noRespawn") return state.spawns.every((count, index) => count === (index + 1 <= state.started ? 1 : 0));
  const terminal = state.runState !== "running";
  return state.verified <= state.started
    && state.started <= state.planned
    && (!terminal || state.started === state.verified || state.runState === "indeterminate")
    && (state.runState !== "failed" || state.started === 0)
    && (state.runState !== "partial" || (state.started === state.verified && state.verified > 0 && state.verified < state.planned))
    && (state.runState !== "succeeded" || state.verified === state.planned)
    && (state.runState !== "indeterminate" || state.started > state.verified);
}

const localCliModel = () => quintModel(MODEL_FILE);
const traces = quintTraceCache(MODEL_FILE);

/** The ending of a trace, detailed enough to show the replay reached each production branch. */
function coverageKey(trace: ItfTrace): string {
  const final = modelSnapshot(trace.states.at(-1)!);
  const failure = itfString(itfVariable(trace.states.at(-1)!, "failure"), "failure");
  return `${String(final.planned)}:${final.runState}:${String(final.started)}/${String(final.verified)}${failure === "" ? "" : `:${failure}`}`;
}

describe("local-cli.qnt ITF replay", () => {
  test("replays every seeded model trace through the iMessage and Beeper mutation runtimes", async () => {
    const model = await localCliModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-local-cli-replay.test.ts");
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const covered = new Set<string>();
    const counts = { imessage: 0, beeper: 0, running: 0 };
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      for (const target of ["imessage", "beeper"] as const) {
        const outcome = await replay(trace, target);
        if (outcome === "compared") {
          counts[target] += 1;
          covered.add(`${target} ${coverageKey(trace)}`);
        } else if (outcome === "running" && target === "beeper") counts.running += 1;
      }
    }
    // Every ending the model allows, through both runtimes where it applies.
    const expected = new Set<string>();
    for (const target of ["imessage", "beeper"] as const) {
      for (const planned of target === "imessage" ? [1] : [1, 2]) {
        expected.add(`${target} ${String(planned)}:failed:0/0:gate`);
        expected.add(`${target} ${String(planned)}:succeeded:${String(planned)}/${String(planned)}`);
        for (const fault of FAULTS) expected.add(`${target} ${String(planned)}:indeterminate:1/0:${fault}`);
        if (planned === 2) {
          expected.add(`${target} 2:partial:1/1:gate`);
          for (const fault of FAULTS) expected.add(`${target} 2:indeterminate:2/1:${fault}`);
        }
      }
    }
    expect([...covered].sort()).toEqual([...expected].sort());
    expect(counts.running).toBeLessThan(all.length / 10);
  });

  test("a runtime that believes a child's own not-started report diverges from the model traces", async () => {
    const model = await localCliModel();
    const all = await traces(model.step);
    let diverged = 0;
    for (const trace of all) {
      const failure = itfString(itfVariable(trace.states.at(-1)!, "failure"), "failure");
      for (const target of ["imessage", "beeper"] as const) {
        const message = await divergence(trace, target, "trust-not-started");
        if (failure !== "not-started" || (target === "imessage" && modelSnapshot(trace.states[0]!).planned !== 1)) {
          expect(message).toBeNull();
          continue;
        }
        diverged += 1;
        expect(message).toMatch(new RegExp(`^${target}: production ends \\{"planned":\\d,"runState":"(?:failed|partial)",.*, the model \\{"planned":\\d,"runState":"indeterminate",`, "u"));
      }
    }
    expect(diverged).toBeGreaterThan(0);
  });

  for (const [step, invariant] of [
    ["stepRetryTimeout", "noRespawn"],
    ["stepTrustNotStarted", "postSpawnIndeterminate"],
  ] as const) {
    test(`production diverges from exactly the ${step} traces that break ${invariant}`, async () => {
      const model = await localCliModel();
      expect(model.mutants).toContainEqual({ step, invariant });
      const all = await traces(step);
      let violating = 0;
      for (const trace of all) {
        const violates = trace.states.some((state) => !invariantHolds(invariant, modelSnapshot(state)));
        for (const target of ["imessage", "beeper"] as const) {
          if (target === "imessage" && modelSnapshot(trace.states[0]!).planned !== 1) continue;
          const message = await divergence(trace, target);
          if (!violates) {
            expect(message).toBeNull();
            continue;
          }
          violating += 1;
          expect(message).not.toBeNull();
        }
      }
      expect(violating).toBeGreaterThan(0);
    });
  }

  test("an unknown action or fault fails closed instead of skipping a step", () => {
    const none = { tag: "None", value: { "#tup": [] } };
    const some = (value: unknown) => ({ tag: "Some", value });
    const spawns = { "#map": [[{ "#bigint": "1" }, { "#bigint": "0" }], [{ "#bigint": "2" }, { "#bigint": "0" }]] };
    const state = (index: number, action: string, picks: Record<string, unknown>) => ({
      "#meta": { index },
      failure: "",
      planned: { "#bigint": "1" },
      runState: "running",
      spawns,
      started: { "#bigint": "0" },
      verified: { "#bigint": "0" },
      "mbt::actionTaken": action,
      "mbt::nondetPicks": picks,
    });
    const trace = (action: string, kind: unknown): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [state(0, "init", { kind: none, n: some({ "#bigint": "1" }) }), state(1, action, { kind, n: none })],
    }));
    expect(script(trace("spawn", some("lost"))).planned).toBe(1);
    expect(() => script(trace("respawn", some("lost")))).toThrow("unknown action respawn");
    expect(() => script(trace("fault", some("hang")))).toThrow("unknown fault hang");
    expect(() => script(trace("fault", none))).toThrow("unknown fault null");
  });
});
