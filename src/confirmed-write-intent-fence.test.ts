import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAuth, saveAuth } from "./auth";
import { canonicalJson, sha256, type GhostgetManifest } from "./model";
import type { ProviderExecution } from "./provider";
import { providerPluginRegistry } from "./provider-plugins";
import { readRecoveryCapsule } from "./recovery";
import { listRunJournalSnapshots } from "./run-journal";
import {
  confirmInvocation,
  createInvocationPlan,
  inspectConfirmedWriteIntentFences,
  prepareInvocation,
  readRunReceipt,
  releaseReconciledRunRecovery,
  repairInterruptedRunJournals,
  saveInvocationPlan,
  type InvocationResult,
} from "./runtime";
import { installManifest, writePrivateJsonIfUnchanged } from "./storage";
import { assertAsyncProperty, fc } from "./test-support";

// Law: a confirmed write crosses its dispatch boundary at most once per
// intent, where the intent is the account realm (auth locator), provider
// target (adapter ID), operation, and canonical input. Reconnecting the same
// account rewrites its auth record bytes and a manifest revision changes the
// adapter hash; neither may reopen an unsettled or recently fulfilled intent.

type FenceState = {
  readonly directory: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
};

type ProviderExecutor = NonNullable<
  Parameters<typeof confirmInvocation>[1]["executeProvider"]
>;

type Outcome = "succeeded" | "indeterminate" | "failed";

type Settled =
  | { readonly ok: true; readonly value: InvocationResult }
  | { readonly ok: false; readonly message: string };

const ACCOUNT = "x-official";
const SECOND_ACCOUNT = "x-second";
const MESSAGE = "intent fence fixture";
const DEDUPE_WINDOW_MS = 86_400_000;
const DEAD_OWNER = {
  pid: 2_147_483_647,
  bootId: "f".repeat(64),
  processStartId: "0".repeat(64),
} as const;

function fenceState(): FenceState {
  const directory = mkdtempSync(join(tmpdir(), "ghostget-intent-fence-test-"));
  chmodSync(directory, 0o700);
  return { directory, environment: { GHOSTGET_STATE_HOME: directory } };
}

function xManifest(revision: number): GhostgetManifest {
  const manifest = JSON.parse(readFileSync(
    join(import.meta.dir, "assets", "adapters", "x", "wrench-adapter.json"),
    "utf8",
  )) as GhostgetManifest;
  return revision === 0
    ? manifest
    : { ...manifest, displayName: `X (Official API) revision ${revision}` };
}

/** Install or revise the adapter; a revision changes only the manifest hash. */
function installAdapter(testState: FenceState, revision: number): void {
  installManifest(xManifest(revision), {
    force: revision !== 0,
    environment: testState.environment,
    registry: providerPluginRegistry,
  });
}

/**
 * Connect or reconnect the same account; each generation has new record
 * bytes, and reconnecting with an earlier generation's settings restores
 * that generation's exact record.
 */
function connectAccount(testState: FenceState, generation: number, force = generation !== 0): void {
  saveAuth(createAuth(ACCOUNT, {
    oauthProvider: "x",
    tokenFile: join(testState.directory, `x-token-${generation}.json`),
    scopes: ["tweet.read", "tweet.write", "users.read"],
    subject: "12345",
  }), testState.environment, force ? { force: true } : {});
}

/**
 * Connect the same X account under a second locator ID. With `subject`
 * undefined the record names no provider subject.
 */
function connectSecondLocator(testState: FenceState, subject: string | undefined): void {
  saveAuth(createAuth(SECOND_ACCOUNT, {
    oauthProvider: "x",
    tokenFile: join(testState.directory, "x-token-second.json"),
    scopes: ["tweet.read", "tweet.write", "users.read"],
    ...(subject === undefined ? {} : { subject }),
  }), testState.environment);
}

function install(testState: FenceState): void {
  installAdapter(testState, 0);
  connectAccount(testState, 0);
}

function savedPlan(testState: FenceState, at?: Date, account = ACCOUNT): string {
  const invocation = prepareInvocation(
    "x",
    "posts.publish",
    { body: MESSAGE },
    account,
    testState.environment,
  );
  const stored = at === undefined
    ? createInvocationPlan(invocation)
    : createInvocationPlan(invocation, at);
  saveInvocationPlan(stored, testState.environment);
  return stored.digest;
}

function providerResult(outcome: Outcome): ProviderExecution {
  const started = outcome === "failed" ? 0 : 1;
  return {
    status: outcome,
    output: outcome === "failed" ? null : { observed: true },
    finalUrl: "https://example.com/intent-fence",
    dispatchStarted: started === 1,
    dispatch: {
      planned: 1,
      started,
      verified: outcome === "succeeded" ? 1 : 0,
    },
    ...(outcome === "succeeded" ? {} : { error: "synthetic intent fence outcome" }),
  };
}

/**
 * Count provider requests: a request is sent only after the durable
 * dispatch-start boundary accepts it.
 */
type Probe = { crossings: number };

function executor(
  outcome: Outcome,
  probe: Probe,
  hold?: { readonly afterBoundary: boolean; readonly reached: () => void; readonly released: Promise<void> },
): ProviderExecutor {
  return async (_manifest, _recipe, _input, _auth, options) => {
    const execution = providerResult(outcome);
    if (hold !== undefined && !hold.afterBoundary) {
      hold.reached();
      await hold.released;
      return providerResult("failed");
    }
    if (execution.dispatch.started === 1) {
      await options?.beforeDispatch?.({
        id: "posts-publish",
        index: 1,
        progress: { planned: 1, started: 0, verified: 0 },
      });
      probe.crossings += 1;
      if (hold !== undefined) {
        hold.reached();
        await hold.released;
        return providerResult("indeterminate");
      }
      if (execution.dispatch.verified === 1) {
        await options?.afterDispatchVerified?.({
          id: "posts-publish",
          index: 1,
          progress: { planned: 1, started: 1, verified: 1 },
        });
      }
    }
    return execution;
  };
}

async function settle(promise: Promise<InvocationResult>): Promise<Settled> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function confirm(
  testState: FenceState,
  outcome: Outcome,
  probe: Probe,
  at?: Date,
  account = ACCOUNT,
): Promise<Settled> {
  const digest = savedPlan(testState, at, account);
  return settle(confirmInvocation(digest, {
    headed: false,
    environment: testState.environment,
    ...(at === undefined ? {} : { now: at }),
    executeProvider: executor(outcome, probe),
  }));
}

function requireResult(settled: Settled): InvocationResult {
  if (!settled.ok) throw new Error(`expected a completed confirmation: ${settled.message}`);
  return settled.value;
}

function refusal(settled: Settled): string {
  if (settled.ok) {
    throw new Error(
      `expected a refused confirmation, received ${settled.value.receipt.status} run ${settled.value.receipt.runId}`,
    );
  }
  return settled.message;
}

/** Simulate the owning process dying: the journal owner no longer names a live process. */
function killRunOwner(testState: FenceState, runId: string): void {
  const entry = listRunJournalSnapshots(testState.environment).find((candidate) =>
    !("invalid" in candidate) && candidate.journal.runId === runId);
  if (entry === undefined || "invalid" in entry) throw new Error("crashed run journal is missing");
  const written = writePrivateJsonIfUnchanged(
    join(testState.directory, "run-journals", `${runId}.json`),
    { ...entry.journal, owner: { ...entry.journal.owner, ...DEAD_OWNER } },
    { expectedCurrentContentSha256: entry.contentSha256 },
  );
  if (!written) throw new Error("crashed run journal changed concurrently");
}

function inFlightRunIds(testState: FenceState): readonly string[] {
  return listRunJournalSnapshots(testState.environment).flatMap((entry) => {
    if ("invalid" in entry) throw new Error("run journal is invalid");
    return entry.journal.phase === "terminal" ? [] : [entry.journal.runId];
  });
}

function stateFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".json")) files.push(path);
    }
  };
  visit(root);
  return files;
}

type Crash = {
  readonly runId: string;
  readonly release: () => void;
  readonly settled: Promise<Settled>;
};

/**
 * Start a confirmation whose owner dies inside the executor, before or after
 * the durable dispatch boundary. Returns null when the fence refused it first.
 */
async function crashConfirm(
  testState: FenceState,
  afterBoundary: boolean,
  probe: Probe,
  at?: Date,
): Promise<{ readonly crash: Crash | null; readonly settled?: Settled }> {
  const digest = savedPlan(testState, at);
  let reached!: () => void;
  const reachedHold = new Promise<void>((resolve) => { reached = resolve; });
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const before = new Set(inFlightRunIds(testState));
  const settled = settle(confirmInvocation(digest, {
    headed: false,
    environment: testState.environment,
    ...(at === undefined ? {} : { now: at }),
    executeProvider: executor(afterBoundary ? "indeterminate" : "failed", probe, {
      afterBoundary,
      reached,
      released,
    }),
  }));
  const first = await Promise.race([
    reachedHold.then(() => "held" as const),
    settled.then(() => "settled" as const),
  ]);
  if (first === "settled") {
    release();
    return { crash: null, settled: await settled };
  }
  const runIds = inFlightRunIds(testState).filter((runId) => !before.has(runId));
  const [runId] = runIds;
  if (runId === undefined || runIds.length !== 1) {
    release();
    await settled;
    throw new Error("expected exactly one in-flight run for the crashed confirmation");
  }
  killRunOwner(testState, runId);
  return { crash: { runId, release, settled } };
}

async function releaseCrashes(crashes: readonly Crash[]): Promise<void> {
  for (const crash of crashes) crash.release();
  await Promise.all(crashes.map((crash) => crash.settled));
}

type Step =
  | { readonly kind: "confirm"; readonly outcome: Outcome }
  | { readonly kind: "crash"; readonly afterBoundary: boolean }
  | { readonly kind: "reauth" }
  | { readonly kind: "revise" }
  | { readonly kind: "advance" }
  | { readonly kind: "repair" }
  | { readonly kind: "reconcile" };

/**
 * What earlier steps allow for the one intent. `unsettled` may have reached
 * the provider, `applied` was reconciled as reached and stays settled as
 * such, and `fulfilled` succeeded inside its dedupe window.
 */
type IntentModel = {
  unsettled: string | null;
  applied: string | null;
  fulfilled: { readonly runId: string; readonly until: number; readonly authGeneration: number } | null;
};

type Schedule = {
  readonly state: FenceState;
  readonly probe: Probe;
  readonly crashes: Crash[];
  readonly model: IntentModel;
  clock: Date;
  authGeneration: number;
  manifestRevision: number;
};

const dispatchStep = fc.oneof(
  fc.constantFrom<Outcome>("succeeded", "indeterminate", "failed")
    .map((outcome): Step => ({ kind: "confirm", outcome })),
  fc.boolean().map((afterBoundary): Step => ({ kind: "crash", afterBoundary })),
);

const identityChange = fc.constantFrom<readonly Step[]>(
  [{ kind: "reauth" }],
  [{ kind: "revise" }],
  [{ kind: "reauth" }, { kind: "revise" }],
);

const scheduleStep = fc.oneof(
  { weight: 3, arbitrary: fc.constant<Step>({ kind: "reauth" }) },
  { weight: 2, arbitrary: fc.constant<Step>({ kind: "revise" }) },
  { weight: 1, arbitrary: fc.constant<Step>({ kind: "advance" }) },
  { weight: 1, arbitrary: fc.constant<Step>({ kind: "repair" }) },
  {
    weight: 2,
    arbitrary: fc.constant<Step>({ kind: "reconcile" }),
  },
  { weight: 2, arbitrary: dispatchStep },
);

function expectedFence(model: IntentModel, at: Date, authGeneration: number):
  | { readonly kind: "refused" | "replayed" | "withheld"; readonly runId: string }
  | null {
  const unsettled = model.unsettled ?? model.applied;
  if (unsettled !== null) return { kind: "refused", runId: unsettled };
  if (model.fulfilled !== null && at.getTime() <= model.fulfilled.until) {
    // Another auth record may be another account, so its receipt is withheld.
    return {
      kind: model.fulfilled.authGeneration === authGeneration ? "replayed" : "withheld",
      runId: model.fulfilled.runId,
    };
  }
  return null;
}

async function runScheduleStep(schedule: Schedule, step: Step): Promise<void> {
  const { environment } = schedule.state;
  switch (step.kind) {
    case "reauth":
      schedule.authGeneration += 1;
      connectAccount(schedule.state, schedule.authGeneration);
      return;
    case "revise":
      schedule.manifestRevision += 1;
      installAdapter(schedule.state, schedule.manifestRevision);
      return;
    case "advance":
      schedule.clock = new Date(schedule.clock.getTime() + DEDUPE_WINDOW_MS + 1);
      return;
    case "repair":
      expect(repairInterruptedRunJournals(environment, schedule.clock).issues).toEqual([]);
      return;
    case "reconcile": {
      const runId = schedule.model.unsettled;
      if (runId === null) return;
      expect(repairInterruptedRunJournals(environment, schedule.clock).issues).toEqual([]);
      expect(releaseReconciledRunRecovery(
        runId,
        sha256(canonicalJson(readRunReceipt(runId, environment))),
        environment,
        schedule.clock,
      )).toBe("journal-released");
      schedule.model.unsettled = null;
      schedule.model.applied = runId;
      return;
    }
    case "confirm":
    case "crash": {
      const fence = expectedFence(schedule.model, schedule.clock, schedule.authGeneration);
      const before = schedule.probe.crossings;
      let settled: Settled | undefined;
      let crashed: Crash | null = null;
      if (step.kind === "confirm") {
        settled = await confirm(schedule.state, step.outcome, schedule.probe, schedule.clock);
      } else {
        const started = await crashConfirm(schedule.state, step.afterBoundary, schedule.probe, schedule.clock);
        crashed = started.crash;
        if (crashed !== null) schedule.crashes.push(crashed);
        settled = started.settled;
      }
      if (fence !== null) {
        expect(schedule.probe.crossings).toBe(before);
        if (settled === undefined) throw new Error("a fenced confirmation reached the provider executor");
        if (fence.kind === "refused") {
          expect(refusal(settled)).toContain(`a prior attempt (${fence.runId}) may have reached the provider`);
        } else if (fence.kind === "withheld") {
          expect(refusal(settled)).toContain(`a prior run (${fence.runId}) already fulfilled this intent under a different auth record`);
        } else {
          const replay = requireResult(settled);
          expect(replay.replayed).toBeTrue();
          expect(replay.receipt.runId).toBe(fence.runId);
        }
        return;
      }
      if (step.kind === "crash") {
        if (crashed === null) throw new Error("an open intent refused a confirmation");
        expect(schedule.probe.crossings).toBe(before + (step.afterBoundary ? 1 : 0));
        if (step.afterBoundary) schedule.model.unsettled = crashed.runId;
        return;
      }
      if (settled === undefined) throw new Error("confirmation did not settle");
      const result = requireResult(settled);
      expect(result.replayed).toBeFalse();
      expect(schedule.probe.crossings).toBe(before + (step.outcome === "failed" ? 0 : 1));
      if (step.outcome === "succeeded") {
        schedule.model.fulfilled = {
          runId: result.receipt.runId,
          until: schedule.clock.getTime() + DEDUPE_WINDOW_MS,
          authGeneration: schedule.authGeneration,
        };
      } else if (step.outcome === "indeterminate") {
        schedule.model.unsettled = result.receipt.runId;
      }
      return;
    }
  }
}

describe("intent-level confirmed-write fence", () => {
  test("reconnecting the account does not reopen an indeterminate intent", async () => {
    const testState = fenceState();
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const first = requireResult(await confirm(testState, "indeterminate", probe));
      expect(first.receipt).toMatchObject({ status: "indeterminate", dispatchStarted: true });

      connectAccount(testState, 1);
      const retry = refusal(await confirm(testState, "succeeded", probe));

      expect(probe.crossings).toBe(1);
      expect(retry).toContain(`a prior attempt (${first.receipt.runId}) may have reached the provider`);
      // Reconciliation needs the run's exact auth record, so the refusal says
      // how to restore it instead of pointing only at a reconcile that fails.
      expect(retry).toContain(`reconnect '${ACCOUNT}' with the settings that run used first`);

      connectAccount(testState, 0, true);
      const restored = refusal(await confirm(testState, "succeeded", probe));
      expect(probe.crossings).toBe(1);
      expect(restored).toContain("reconcile it before retrying");
      expect(restored).not.toContain("with the settings that run used");
    } finally {
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("doctor readback reports each claim's fence state without account or input detail", async () => {
    const testState = fenceState();
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      expect(inspectConfirmedWriteIntentFences(testState.environment)).toEqual({
        claims: 0, active: 0, unsettled: 0, fulfilled: 0, journalOnly: 0, issues: [],
      });
      const first = requireResult(await confirm(testState, "indeterminate", probe));
      // The encrypted capsule records the provider subject the run used.
      expect(readRecoveryCapsule(
        first.receipt.runId,
        first.receipt.auth.id,
        first.receipt.auth.hash,
        testState.environment,
      )?.authSubject).toBe("12345");
      const readback = inspectConfirmedWriteIntentFences(testState.environment);
      expect(readback).toEqual({
        claims: 1, active: 0, unsettled: 1, fulfilled: 0, journalOnly: 0, issues: [],
      });
      const serialized = JSON.stringify(readback);
      for (const secret of [ACCOUNT, MESSAGE, testState.directory, "12345"]) {
        expect(serialized).not.toContain(secret);
      }

      // A later generation is reachable only through fulfilled generations
      // from the intent's base claim. The same claim moved off that chain
      // fences nothing, so readback reports it as misplaced.
      const intents = join(testState.directory, "idempotency", "intents");
      const [bucket] = readdirSync(intents);
      if (bucket === undefined) throw new Error("intent claim bucket missing");
      const [base] = readdirSync(join(intents, bucket));
      if (base === undefined) throw new Error("intent claim missing");
      const offChain = `${base.slice(0, -".json".length)}.${sha256("no prior generation")}`;
      renameSync(join(intents, bucket, base), join(intents, bucket, `${offChain}.json`));
      expect(inspectConfirmedWriteIntentFences(testState.environment)).toEqual({
        claims: 1, active: 0, unsettled: 0, fulfilled: 0, journalOnly: 0,
        issues: [{ claim: offChain, runId: first.receipt.runId, reason: "misplaced-claim" }],
      });

      // Runs recorded before the fence have a journal and no claim; the
      // journal scan still fences them, so readback counts them apart.
      rmSync(join(testState.directory, "idempotency", "intents"), { recursive: true, force: true });
      expect(inspectConfirmedWriteIntentFences(testState.environment)).toEqual({
        claims: 0, active: 0, unsettled: 0, fulfilled: 0, journalOnly: 1, issues: [],
      });
      expect(probe.crossings).toBe(1);
    } finally {
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("a manifest revision does not reopen an indeterminate intent", async () => {
    const testState = fenceState();
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const first = requireResult(await confirm(testState, "indeterminate", probe));
      expect(first.receipt.status).toBe("indeterminate");

      installAdapter(testState, 1);
      const retry = await confirm(testState, "succeeded", probe);

      expect(probe.crossings).toBe(1);
      expect(refusal(retry)).toContain("reconcile it before retrying");
    } finally {
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("replays a fulfilled intent inside its window after a manifest revision", async () => {
    const testState = fenceState();
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const first = requireResult(await confirm(testState, "succeeded", probe));
      expect(first.receipt.status).toBe("submitted");

      installAdapter(testState, 1);
      const replay = requireResult(await confirm(testState, "succeeded", probe));

      expect(probe.crossings).toBe(1);
      expect(replay.replayed).toBeTrue();
      expect(replay.receipt.runId).toBe(first.receipt.runId);
    } finally {
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  // `auth add --force` can point the same locator at another account, and a
  // journal records no subject to tell the two apart. The fence still holds,
  // but the other record's receipt must not read as this account's success.
  test("a fulfilled intent under another auth record refuses without dispatching or replaying", async () => {
    const testState = fenceState();
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const first = requireResult(await confirm(testState, "succeeded", probe));

      connectAccount(testState, 1);
      installAdapter(testState, 1);
      const withheld = refusal(await confirm(testState, "succeeded", probe));
      expect(probe.crossings).toBe(1);
      expect(withheld).toContain(`a prior run (${first.receipt.runId}) already fulfilled this intent under a different auth record for locator '${ACCOUNT}'`);
      expect(withheld).toContain("retry after its dedupe window ends");

      connectAccount(testState, 0, true);
      const replay = requireResult(await confirm(testState, "succeeded", probe));
      expect(probe.crossings).toBe(1);
      expect(replay.replayed).toBeTrue();
      expect(replay.receipt.runId).toBe(first.receipt.runId);
    } finally {
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("an unsettled run recorded before the intent fence existed still blocks after a reconnect", async () => {
    const testState = fenceState();
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const first = requireResult(await confirm(testState, "indeterminate", probe));
      expect(first.receipt.status).toBe("indeterminate");
      // Earlier releases kept only the hash-keyed ledger and the run journal.
      rmSync(join(testState.directory, "idempotency", "intents"), { recursive: true, force: true });

      connectAccount(testState, 1);
      installAdapter(testState, 1);
      const retry = await confirm(testState, "succeeded", probe);

      expect(probe.crossings).toBe(1);
      expect(refusal(retry)).toContain(`a prior attempt (${first.receipt.runId}) may have reached the provider`);
    } finally {
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("an owner that died after the dispatch boundary blocks the intent across a reconnect", async () => {
    const testState = fenceState();
    const crashes: Crash[] = [];
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const started = await crashConfirm(testState, true, probe);
      if (started.crash === null) throw new Error("expected the first confirmation to reach the provider");
      crashes.push(started.crash);
      expect(probe.crossings).toBe(1);

      connectAccount(testState, 1);
      const retry = await confirm(testState, "succeeded", probe);

      expect(probe.crossings).toBe(1);
      expect(refusal(retry)).toContain(`a prior attempt (${started.crash.runId}) may have reached the provider`);
    } finally {
      await releaseCrashes(crashes);
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("a crash, repair, expired window, and reconnect still leave the intent fenced", async () => {
    const testState = fenceState();
    const crashes: Crash[] = [];
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const started = new Date();
      const crashed = await crashConfirm(testState, true, probe, started);
      if (crashed.crash === null) throw new Error("expected the first confirmation to reach the provider");
      crashes.push(crashed.crash);
      expect(repairInterruptedRunJournals(testState.environment, started).issues).toEqual([]);

      const later = new Date(started.getTime() + DEDUPE_WINDOW_MS + 1);
      connectAccount(testState, 1);
      const retry = await confirm(testState, "succeeded", probe, later);

      expect(probe.crossings).toBe(1);
      expect(refusal(retry)).toContain(`a prior attempt (${crashed.crash.runId}) may have reached the provider`);
    } finally {
      await releaseCrashes(crashes);
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("one repair pass projects every generation of a repeatedly fulfilled intent", async () => {
    const testState = fenceState();
    const crashes: Crash[] = [];
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const start = Date.now();
      const at = (generation: number) => new Date(start + generation * (DEDUPE_WINDOW_MS + 1));
      const fulfilled: string[] = [];
      for (let generation = 0; generation < 3; generation += 1) {
        const result = requireResult(await confirm(testState, "succeeded", probe, at(generation)));
        expect(result.replayed).toBeFalse();
        fulfilled.push(result.receipt.runId);
      }
      const crashed = await crashConfirm(testState, true, probe, at(3));
      if (crashed.crash === null) throw new Error("expected the fourth generation to reach the provider");
      crashes.push(crashed.crash);
      expect(probe.crossings).toBe(4);

      const report = repairInterruptedRunJournals(testState.environment, at(3));
      expect(report.issues).toEqual([]);
      expect(report.repaired).toBe(1);

      const intents = stateFiles(join(testState.directory, "idempotency", "intents")).map((path) =>
        JSON.parse(readFileSync(path, "utf8")) as { readonly runId: string; readonly status: string });
      expect(intents.map(({ runId, status }) => `${runId}:${status}`).sort()).toEqual([
        ...fulfilled.map((runId) => `${runId}:succeeded`),
        `${crashed.crash.runId}:indeterminate`,
      ].sort());
      expect(refusal(await confirm(testState, "succeeded", probe, at(4))))
        .toContain(`a prior attempt (${crashed.crash.runId}) may have reached the provider`);
      expect(probe.crossings).toBe(4);
    } finally {
      await releaseCrashes(crashes);
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("a pre-dispatch failure leaves no idempotency state behind", async () => {
    const testState = fenceState();
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const failed = requireResult(await confirm(testState, "failed", probe));
      expect(failed.receipt).toMatchObject({ status: "failed", dispatchStarted: false });
      expect(stateFiles(join(testState.directory, "idempotency"))).toEqual([]);

      connectAccount(testState, 1);
      const retry = requireResult(await confirm(testState, "succeeded", probe));
      expect(retry.receipt.status).toBe("submitted");
      expect(probe.crossings).toBe(1);
    } finally {
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("elects one successor after an expired fulfilled intent across a reconnect", async () => {
    const testState = fenceState();
    const control: { release?: () => void } = {};
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const started = new Date();
      requireResult(await confirm(testState, "succeeded", probe, started));

      connectAccount(testState, 1);
      const nextWindow = new Date(started.getTime() + DEDUPE_WINDOW_MS + 1);
      const gate = new Promise<void>((resolve) => { control.release = resolve; });
      let entered!: () => void;
      const enteredExecutor = new Promise<void>((resolve) => { entered = resolve; });
      const secondDigest = savedPlan(testState, nextWindow);
      const second = settle(confirmInvocation(secondDigest, {
        headed: false,
        environment: testState.environment,
        now: nextWindow,
        executeProvider: async (manifest, recipe, input, auth, options) => {
          entered();
          await gate;
          return executor("succeeded", probe)(manifest, recipe, input, auth, options);
        },
      }));
      await enteredExecutor;
      const third = await confirm(testState, "succeeded", probe, nextWindow);
      expect(refusal(third)).toContain("may have reached the provider");
      control.release?.();
      expect(requireResult(await second).receipt.status).toBe("submitted");
      expect(probe.crossings).toBe(2);
    } finally {
      control.release?.();
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  test("the same provider subject under a second locator cannot redispatch an unsettled intent", async () => {
    const testState = fenceState();
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const first = requireResult(await confirm(testState, "indeterminate", probe));
      expect(first.receipt.status).toBe("indeterminate");
      const journal = listRunJournalSnapshots(testState.environment).flatMap((entry) =>
        "invalid" in entry || entry.journal.runId !== first.receipt.runId ? [] : [entry.journal])[0];
      // The journal records the provider subject of the auth record it ran under.
      expect(journal?.authSubject).toBe("12345");

      connectSecondLocator(testState, "12345");
      const retry = refusal(await confirm(testState, "succeeded", probe, undefined, SECOND_ACCOUNT));

      expect(probe.crossings).toBe(1);
      expect(retry).toContain(`a prior attempt (${first.receipt.runId}) may have reached the provider under auth locator '${ACCOUNT}', which records the same provider subject`);
      // The refused run leaves no idempotency claim of its own behind.
      const holders = stateFiles(join(testState.directory, "idempotency")).map((path) =>
        (JSON.parse(readFileSync(path, "utf8")) as { readonly runId: string }).runId);
      expect(new Set(holders)).toEqual(new Set([first.receipt.runId]));
    } finally {
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  for (const setup of ["other-subject", "no-subject", "legacy-journal", "fulfilled"] as const) {
    test(`a second locator keeps the per-locator fence: ${setup}`, async () => {
      const testState = fenceState();
      try {
        install(testState);
        const probe: Probe = { crossings: 0 };
        const first = requireResult(await confirm(testState, setup === "fulfilled" ? "succeeded" : "indeterminate", probe));
        if (setup === "legacy-journal") {
          // Journals written before the subject field existed carry none.
          const entry = listRunJournalSnapshots(testState.environment).find((candidate) =>
            !("invalid" in candidate) && candidate.journal.runId === first.receipt.runId);
          if (entry === undefined || "invalid" in entry) throw new Error("run journal is missing");
          const { authSubject: _dropped, ...legacy } = entry.journal as typeof entry.journal & { authSubject?: string };
          expect(writePrivateJsonIfUnchanged(
            join(testState.directory, "run-journals", `${first.receipt.runId}.json`),
            legacy,
            { expectedCurrentContentSha256: entry.contentSha256 },
          )).toBeTrue();
        }
        connectSecondLocator(testState, setup === "other-subject" ? "67890" : setup === "no-subject" ? undefined : "12345");
        const second = requireResult(await confirm(testState, "succeeded", probe, undefined, SECOND_ACCOUNT));
        expect(second.replayed).toBeFalse();
        expect(probe.crossings).toBe(2);
      } finally {
        rmSync(testState.directory, { recursive: true, force: true });
      }
    });
  }

  test("a legacy ledger without a run journal still blocks its exact scope and leaves no intent claim", async () => {
    const testState = fenceState();
    try {
      install(testState);
      const probe: Probe = { crossings: 0 };
      const first = requireResult(await confirm(testState, "indeterminate", probe));
      // Releases before run journals kept only the receipt and hash-keyed ledger.
      rmSync(join(testState.directory, "run-journals", `${first.receipt.runId}.json`));
      rmSync(join(testState.directory, "idempotency", "intents"), { recursive: true, force: true });

      const retry = await confirm(testState, "succeeded", probe);

      expect(probe.crossings).toBe(1);
      expect(refusal(retry)).toContain(`a prior attempt (${first.receipt.runId}) may have reached the provider`);
      expect(stateFiles(join(testState.directory, "idempotency", "intents"))).toEqual([]);
    } finally {
      rmSync(testState.directory, { recursive: true, force: true });
    }
  });

  // Safety law over bounded schedules: while the intent is unsettled, was
  // reconciled as applied, or succeeded inside its dedupe window, no
  // confirmation crosses the dispatch boundary, whatever reconnects and
  // manifest revisions came between. Every crossing therefore needs a prior
  // pre-dispatch failure or expired window; reconciliation only settles a run
  // as applied, because caller not-applied claims never release the fence.
  // Assumptions: one state home, an injected clock that only moves forward,
  // owners die only at crash steps, and reconciliation reports exact evidence.
  test("property: reconnects and manifest revisions never reopen a fenced intent", async () => {
    await assertAsyncProperty(fc.asyncProperty(
      dispatchStep,
      fc.array(scheduleStep, { maxLength: 2 }),
      identityChange,
      async (first, middle, change) => {
        const schedule: Schedule = {
          state: fenceState(),
          probe: { crossings: 0 },
          crashes: [],
          model: { unsettled: null, applied: null, fulfilled: null },
          clock: new Date(),
          authGeneration: 0,
          manifestRevision: 0,
        };
        try {
          install(schedule.state);
          const last: Step = { kind: "confirm", outcome: "succeeded" };
          for (const step of [first, ...middle, ...change, last]) {
            await runScheduleStep(schedule, step);
          }
        } finally {
          await releaseCrashes(schedule.crashes);
          rmSync(schedule.state.directory, { recursive: true, force: true });
        }
      },
    ), { numRuns: 6, interruptAfterTimeLimit: 150_000 });
  });
});
