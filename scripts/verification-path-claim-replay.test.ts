/**
 * ITF trace replay for `verification/quint/path-claim.qnt`, the path
 * helper's per-leaf mutation claim and its dead-claim reaper election.
 *
 * Every trace drives three real `src/path-helper.ts` processes that write
 * one leaf. The helpers run with the `pause-at-every-step` test fault, so
 * each stops at every claim-protocol pause point until the replay releases
 * it. A model action moves one process to its next pause point or kills it
 * there. After every action the replay compares each process's pause point
 * or exit, the claim at the lock name, the reaper files, and the leaf's
 * content with the model state.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID, createHash } from "node:crypto";
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  itfOption,
  itfRecord,
  itfString,
  itfVariable,
  parseItfTrace,
  type ItfState,
  type ItfTrace,
} from "./verification-itf.js";
import { itfBool, itfInt, itfStringMap, quintModel, quintTraceCache } from "./verification-replay.js";
import { REPOSITORY_ROOT } from "./verification-tools.js";

const MODEL_FILE = "path-claim.qnt";
const ACTORS = ["a", "b", "c"] as const;
const ACTIONS = ["link", "reap", "quarantine", "hold", "release", "kill"] as const;
type Action = (typeof ACTIONS)[number];
const TRACE_VARIABLES = [
  "attempt", "generation", "kills", "lockId", "lockOwner", "mbt::actionTaken", "mbt::nondetPicks", "nextId", "pc",
  "reapers", "seen",
].sort();
/** The pause point each action starts from. */
const ACTION_POINT: Readonly<Record<Exclude<Action, "kill">, string>> = Object.freeze({
  link: "claim-link",
  reap: "reaper-link",
  quarantine: "claim-quarantine",
  hold: "claim-held",
  release: "claim-release",
});
const LEAF = "target.json";
const INITIAL_CONTENT = "initial\n";
// Above every platform's PID limit, so it never names a live process.
const DEAD_PID = 2_147_483_647;
const STEP_PREFIX = ".wrench-test-path-mutation-step-";
const HOLDING: ReadonlySet<string> = new Set(["claim-held", "claim-release"]);
const SETTLE_DEADLINE_MS = 45_000;
const MAXIMUM_DRAIN_ROUNDS = 32;
/** Traces replayed at once; each owns its own directory and processes. */
const CONCURRENCY = 3;

const helperPath = join(REPOSITORY_ROOT, "src", "path-helper.ts");
const helperConfigPath = join(REPOSITORY_ROOT, "src", "state-helper.bunfig.toml");
const workRoot = mkdtempSync(join(tmpdir(), "ghostget-path-claim-replay-"));
afterAll(() => rmSync(workRoot, { recursive: true, force: true }));

const lockName = (() => {
  const targetSha256 = createHash("sha256")
    .update("io-path-mutation", "utf8")
    .update("\0", "utf8")
    .update(LEAF, "utf8")
    .digest("hex");
  return `.io-path-mutation-${targetSha256}.lock`;
})();
const targetSha256 = lockName.slice(".io-path-mutation-".length, -".lock".length);

type Actor = {
  readonly label: string;
  readonly requestId: string;
  readonly child: ReturnType<typeof Bun.spawn>;
  step: string | null;
  exitCode: number | null;
  stderr: string;
  killed: boolean;
};

/**
 * Seeded defect: `no-election` deletes every reaper file after each step,
 * as if recovery elected no reaper, and compares only what the processes
 * do, not the reaper files it deleted.
 */
type Defect = "none" | "no-election";

type Observation = Readonly<{
  pc: ReadonlyMap<string, string>;
  lockOwner: string;
  reapers: ReadonlySet<string>;
  content: string;
}>;

class ReplayDivergence extends Error {}

class HelperWorld {
  readonly actors: Actor[] = [];
  private content = INITIAL_CONTENT;

  private constructor(readonly root: string, private readonly defect: Defect) {}

  /** Spawn the three helpers and wait until each pauses at its first step. */
  static async start(deadClaim: boolean, defect: Defect = "none"): Promise<HelperWorld> {
    const root = mkdtempSync(join(workRoot, "trace-"));
    const world = new HelperWorld(root, defect);
    writeFileSync(join(root, LEAF), INITIAL_CONTENT, { mode: 0o600 });
    if (deadClaim) {
      writeFileSync(join(root, lockName), `${JSON.stringify({
        kind: "io-path-mutation-claim",
        schemaVersion: 1,
        targetSha256,
        requestId: randomUUID(),
        pid: DEAD_PID,
      })}\n`, { mode: 0o600, flag: "wx" });
    }
    const stats = lstatSync(root, { bigint: true });
    const expected = { device: stats.dev.toString(), inode: stats.ino.toString() };
    for (const label of ACTORS) world.actors.push(world.spawn(expected, label));
    for (const actor of world.actors) await world.settle(actor);
    return world;
  }

  private spawn(expected: Readonly<{ device: string; inode: string }>, label: string): Actor {
    const requestId = randomUUID();
    const child = Bun.spawn([
      process.execPath, "--no-env-file", "--no-install", "--no-macros", "--no-addons",
      `--config=${helperConfigPath}`, helperPath,
    ], {
      cwd: this.root,
      env: { NODE_ENV: "test", GHOSTGET_TEST_PATH_MUTATION_FAULT: "pause-at-every-step" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    child.stdin.write(JSON.stringify({
      schemaVersion: 1,
      requestId,
      expected,
      operation: {
        kind: "write-file",
        segments: [LEAF],
        directoryExpectations: [],
        content: `${label}\n`,
        createOnly: false,
      },
    }));
    child.stdin.end();
    return { label, requestId, child, step: "spawned", exitCode: null, stderr: "", killed: false };
  }

  /** Wait until the helper pauses at its next step or exits. */
  private async settle(actor: Actor): Promise<void> {
    const prefix = `${STEP_PREFIX}${actor.requestId}-`;
    const deadline = performance.now() + SETTLE_DEADLINE_MS;
    while (performance.now() < deadline) {
      const names = readdirSync(this.root).filter((name) => name.startsWith(prefix));
      if (!names.some((name) => name.endsWith("-release"))) {
        const ready = names.find((name) => name.endsWith("-ready"));
        if (ready !== undefined) {
          actor.step = ready.slice(prefix.length, -"-ready".length);
          return;
        }
        if (actor.child.exitCode !== null || actor.child.signalCode !== null) {
          actor.exitCode = await actor.child.exited;
          actor.stderr = await new Response(actor.child.stderr as ReadableStream).text();
          actor.step = null;
          return;
        }
      }
      await Bun.sleep(2);
    }
    throw new Error(`helper ${actor.label} did not reach a claim-protocol step`);
  }

  private actor(label: string): Actor {
    const actor = this.actors.find((candidate) => candidate.label === label);
    if (actor === undefined) throw new Error(`no helper ${label}`);
    return actor;
  }

  /** Release the helper from its pause point and wait for its next one. */
  async advance(label: string): Promise<void> {
    const actor = this.actor(label);
    if (actor.step === null) throw new ReplayDivergence(`helper ${label} already exited`);
    const from = actor.step;
    writeFileSync(join(this.root, `${STEP_PREFIX}${actor.requestId}-${from}-release`), "release\n", {
      mode: 0o600,
      flag: "wx",
    });
    await this.settle(actor);
    // The helper writes the leaf between claim-held and claim-release.
    if (from === "claim-held" && actor.step === "claim-release") this.content = `${label}\n`;
    if (this.defect === "no-election") this.deleteReapers();
  }

  async kill(label: string): Promise<void> {
    const actor = this.actor(label);
    if (actor.step === null) throw new ReplayDivergence(`helper ${label} already exited`);
    actor.child.kill("SIGKILL");
    actor.exitCode = await actor.child.exited;
    actor.step = null;
    actor.killed = true;
  }

  stepOf(label: string): string | null {
    return this.actor(label).step;
  }

  holders(): readonly string[] {
    return this.actors.filter((actor) => actor.step !== null && HOLDING.has(actor.step)).map((actor) => actor.label);
  }

  private deleteReapers(): void {
    for (const name of readdirSync(this.root)) {
      if (name.startsWith(".io-path-mutation-reaper-")) unlinkSync(join(this.root, name));
    }
  }

  private ownerOfPid(pid: unknown): string {
    const actor = this.actors.find((candidate) => candidate.child.pid === pid);
    if (actor === undefined) throw new Error("a claim-protocol file names a process outside the replay");
    return actor.label;
  }

  private status(actor: Actor): string {
    if (actor.step !== null) return actor.step;
    if (actor.killed) return "killed";
    if (actor.exitCode === 0 && actor.stderr === "") return "exited-ok";
    if (actor.exitCode === 1 && actor.stderr === "path helper: file mutation is already active\n") return "exited-busy";
    if (actor.exitCode === 1 && /^path helper: path mutation claim (changed|recovery exceeds)/u.test(actor.stderr)) {
      return "exited-failed";
    }
    throw new Error(`helper ${actor.label} exited with ${String(actor.exitCode)}: ${actor.stderr.slice(0, 500)}`);
  }

  /** The helper whose claim holds the lock name, "ghost" for the dead claim, or "none". */
  lockOwner(): string {
    let lockOwner = "none";
    try {
      const claim = JSON.parse(readFileSync(join(this.root, lockName), "utf8")) as { pid?: unknown; requestId?: unknown };
      if (claim.pid === DEAD_PID) {
        lockOwner = "ghost";
      } else {
        const actor = this.actors.find((candidate) => candidate.requestId === claim.requestId);
        if (actor === undefined || actor.child.pid !== claim.pid) throw new Error("the claim names no replay helper");
        lockOwner = actor.label;
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    return lockOwner;
  }

  observe(): Observation {
    const lockOwner = this.lockOwner();
    const reapers = new Set<string>();
    for (const name of readdirSync(this.root)) {
      if (!name.startsWith(".io-path-mutation-reaper-")) continue;
      const reaper = JSON.parse(readFileSync(join(this.root, name), "utf8")) as { generation?: unknown; pid?: unknown };
      if (typeof reaper.generation !== "number") throw new Error("a reaper file has no generation");
      reapers.add(`${String(reaper.generation)}:${this.ownerOfPid(reaper.pid)}`);
    }
    return {
      pc: new Map(this.actors.map((actor) => [actor.label, this.status(actor)])),
      lockOwner,
      reapers,
      content: readFileSync(join(this.root, LEAF), "utf8"),
    };
  }

  /** Let every live helper finish, then remove the trace's directory. */
  async stop(): Promise<void> {
    for (let round = 0; round < MAXIMUM_DRAIN_ROUNDS; round += 1) {
      const live = this.actors.filter((actor) => actor.step !== null);
      if (live.length === 0) break;
      for (const actor of live) {
        try {
          await this.advance(actor.label);
        } catch {
          await this.kill(actor.label);
        }
      }
    }
    for (const actor of this.actors) {
      if (actor.child.exitCode === null && actor.child.signalCode === null) actor.child.kill("SIGKILL");
      await actor.child.exited;
    }
    rmSync(this.root, { recursive: true, force: true });
  }

  expectedContent(): string {
    return this.content;
  }
}

function modelState(state: ItfState, content: string): Observation {
  const reapers = itfVariable(state, "reapers");
  if (reapers.kind !== "set") throw new Error("ITF reapers must be a set");
  return {
    pc: itfStringMap(itfVariable(state, "pc"), "pc", itfString),
    lockOwner: itfString(itfVariable(state, "lockOwner"), "lockOwner"),
    reapers: new Set(reapers.items.map((item) => {
      if (item.kind !== "tuple" || item.items.length !== 3) throw new Error("ITF reaper entries must be triples");
      return `${String(itfInt(item.items[1]!, "reaper generation"))}:${itfString(item.items[2]!, "reaper holder")}`;
    })),
    content,
  };
}

function describeValue(value: unknown): string {
  if (value instanceof Map) return `{${[...value].map(([key, entry]) => `${String(key)}: ${String(entry)}`).sort().join(", ")}}`;
  if (value instanceof Set) return `{${[...value].map(String).sort().join(", ")}}`;
  return JSON.stringify(value);
}

function difference(actual: Observation, expected: Observation, fields: readonly (keyof Observation)[]): string | null {
  for (const field of fields) {
    const left = describeValue(actual[field]);
    const right = describeValue(expected[field]);
    if (left !== right) return `${field} is ${left} in production and ${right} in the model`;
  }
  return null;
}

function deadClaimOf(trace: ItfTrace): boolean {
  const initial = trace.states[0];
  if (initial === undefined || itfString(itfVariable(initial, "mbt::actionTaken"), "mbt::actionTaken") !== "init") {
    throw new Error("A trace must start with the init action");
  }
  const picks = itfRecord(itfVariable(initial, "mbt::nondetPicks"), ["a", "deadClaim"], "mbt::nondetPicks");
  const pick = itfOption(picks.get("deadClaim")!, "mbt::nondetPicks.deadClaim");
  if (pick === null) throw new Error("state 0 records no deadClaim pick");
  return itfBool(pick, "mbt::nondetPicks.deadClaim");
}

function operation(state: ItfState): Readonly<{ action: Action; actor: string }> {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const picks = itfRecord(itfVariable(state, "mbt::nondetPicks"), ["a", "deadClaim"], "mbt::nondetPicks");
  const pick = itfOption(picks.get("a")!, "mbt::nondetPicks.a");
  if (!(ACTIONS as readonly string[]).includes(action) || pick === null) {
    throw new Error(`state ${String(state.index)} records an unknown action or a missing pick`);
  }
  const actor = itfString(pick, "mbt::nondetPicks.a");
  if (!(ACTORS as readonly string[]).includes(actor)) throw new Error(`state ${String(state.index)} picks an unknown helper`);
  return { action: action as Action, actor };
}

const ALL_FIELDS: readonly (keyof Observation)[] = ["pc", "lockOwner", "reapers", "content"];
const BEHAVIOUR_FIELDS: readonly (keyof Observation)[] = ["pc", "lockOwner", "content"];

/** Replay `trace` through real helpers, returning the first divergence or null. */
async function divergence(trace: ItfTrace, defect: Defect = "none"): Promise<string | null> {
  const fields = defect === "none" ? ALL_FIELDS : BEHAVIOUR_FIELDS;
  const world = await HelperWorld.start(deadClaimOf(trace), defect);
  try {
    const start = difference(world.observe(), modelState(trace.states[0]!, INITIAL_CONTENT), fields);
    if (start !== null) return `state 0: ${start}`;
    for (const state of trace.states.slice(1)) {
      const { action, actor } = operation(state);
      if (action === "kill") {
        await world.kill(actor);
      } else {
        const step = world.stepOf(actor);
        if (step !== ACTION_POINT[action]) {
          return `state ${String(state.index)}: ${action}(${actor}) starts at ${ACTION_POINT[action]}, but the helper is at ${String(step)}`;
        }
        await world.advance(actor);
      }
      const found = difference(world.observe(), modelState(state, world.expectedContent()), fields);
      if (found !== null) return `state ${String(state.index)}: after ${action}(${actor}) ${found}`;
    }
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error.message;
    throw error;
  } finally {
    await world.stop();
  }
}

/** Map `items` through `run` with at most CONCURRENCY in flight, keeping order. */
async function pooled<T, R>(items: readonly T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]!);
    }
  }));
  return results;
}

const pathClaimModel = () => quintModel(MODEL_FILE);
const traces = quintTraceCache(MODEL_FILE);

/** Whether `state` breaks `claimSafety`: two holders, or a holder that does not own the lock name. */
function breaksClaimSafety(state: ItfState): boolean {
  const holders = [...itfStringMap(itfVariable(state, "pc"), "pc", itfString)].filter(([, pc]) => HOLDING.has(pc));
  const owner = itfString(itfVariable(state, "lockOwner"), "lockOwner");
  return holders.length > 1 || holders.some(([actor]) => actor !== owner);
}

describe("path-claim.qnt ITF replay", () => {
  test("replays every seeded model trace through real path helpers", async () => {
    const model = await pathClaimModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-path-claim-replay.test.ts");
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const covered = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      covered.add(`deadClaim=${String(deadClaimOf(trace))}`);
      for (const [before, after] of trace.states.slice(0, -1).map((state, index) => [state, trace.states[index + 1]!] as const)) {
        const { action, actor } = operation(after);
        const from = itfStringMap(itfVariable(before, "pc"), "pc", itfString).get(actor);
        const to = itfStringMap(itfVariable(after, "pc"), "pc", itfString).get(actor);
        covered.add(`${action}(${actor})`);
        covered.add(`${String(from)} -> ${String(to)}`);
      }
    }
    const messages = await pooled(all, (trace) => divergence(trace));
    expect(messages.filter((message) => message !== null)).toEqual([]);
    const expected = [
      "deadClaim=true", "deadClaim=false",
      ...ACTORS.flatMap((actor) => ACTIONS.map((action) => `${action}(${actor})`)),
      "claim-link -> claim-held", "claim-link -> exited-busy", "claim-link -> reaper-link",
      "reaper-link -> claim-quarantine", "reaper-link -> exited-busy", "reaper-link -> reaper-link",
      "reaper-link -> claim-link", "claim-quarantine -> claim-link",
      "claim-held -> claim-release", "claim-release -> exited-ok",
    ];
    expect(expected.filter((entry) => !covered.has(entry))).toEqual([]);
  });

  test("helpers that elect no reaper diverge from the model traces", async () => {
    const model = await pathClaimModel();
    const all = await traces(model.step);
    // Only traces where two helpers contend for one reaper name can tell
    // the defect apart; replay those, first to last, until one diverges.
    const contended = all.filter((trace) => trace.states.some((state, index) =>
      index > 0 && operation(state).action === "reap"
      && itfStringMap(itfVariable(state, "pc"), "pc", itfString).get(operation(state).actor) === "exited-busy"));
    expect(contended.length).toBeGreaterThan(0);
    let first: string | null = null;
    for (const trace of contended) {
      first = await divergence(trace, "no-election");
      if (first !== null) break;
    }
    expect(first).toMatch(/^state \d+: (after reap\([abc]\) pc is |.* but the helper is at )/u);
  });

  test("real helpers keep one holder that owns the lock under the pre-fix schedules that break claimSafety", async () => {
    const model = await pathClaimModel();
    expect(model.mutants.map((mutant) => mutant.step)).toContain("stepPreFix");
    const all = await traces("stepPreFix");
    const violating = all.filter((trace) => trace.states.some(breaksClaimSafety));
    expect(violating.length).toBeGreaterThan(0);
    const results = await pooled(violating, async (trace) => {
      const world = await HelperWorld.start(deadClaimOf(trace));
      try {
        let most = 0;
        const strays: string[] = [];
        for (const state of trace.states.slice(1)) {
          const { action, actor } = operation(state);
          if (world.stepOf(actor) === null) continue;
          if (action === "kill") await world.kill(actor);
          else await world.advance(actor);
          const holders = world.holders();
          most = Math.max(most, holders.length);
          const owner = holders.length === 0 ? null : world.lockOwner();
          for (const holder of holders) {
            if (holder !== owner) strays.push(`state ${String(state.index)}: ${holder} holds while the lock names ${String(owner)}`);
          }
        }
        return { most, strays };
      } finally {
        await world.stop();
      }
    });
    expect(results.flatMap((result) => result.strays)).toEqual([]);
    expect(results.every((result) => result.most <= 1)).toBe(true);
    expect(results.some((result) => result.most === 1)).toBe(true);
  });

  test("an unknown action or a missing pick fails closed instead of skipping a step", () => {
    const none = { tag: "None", value: { "#tup": [] } };
    const actors = (value: unknown) => ({ "#map": ACTORS.map((actor) => [actor, value]) });
    const initial = {
      pc: actors("claim-link"), attempt: actors({ "#bigint": "0" }), seen: actors({ "#bigint": "0" }),
      generation: actors({ "#bigint": "0" }), lockOwner: "none", lockId: { "#bigint": "0" },
      nextId: { "#bigint": "1" }, reapers: { "#set": [] }, kills: { "#bigint": "0" },
    };
    const trace = (action: string, a: unknown): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [
        { "#meta": { index: 0 }, ...initial, "mbt::actionTaken": "init", "mbt::nondetPicks": { a: none, deadClaim: { tag: "Some", value: false } } },
        { "#meta": { index: 1 }, ...initial, "mbt::actionTaken": action, "mbt::nondetPicks": { a, deadClaim: none } },
      ],
    }));
    expect(operation(trace("link", { tag: "Some", value: "a" }).states[1]!)).toEqual({ action: "link", actor: "a" });
    expect(() => operation(trace("steal", { tag: "Some", value: "a" }).states[1]!)).toThrow("unknown action");
    expect(() => operation(trace("link", none).states[1]!)).toThrow("missing pick");
    expect(() => operation(trace("link", { tag: "Some", value: "z" }).states[1]!)).toThrow("unknown helper");
    expect(deadClaimOf(trace("link", none))).toBe(false);
  });
});
