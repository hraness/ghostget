/**
 * ITF trace replay for `verification/quint/promotion.qnt` against the
 * production website promotion.
 *
 * Quint writes seeded traces of one run of the website production workflow
 * after its verify job, interleaved with an adversarial GitHub, Vercel, and
 * public site. The replay runs the production functions of that workflow in
 * order, `revalidateReleaseAuthority`, `createProviderBaseline`,
 * `revalidateReleaseAuthority`, `promoteWebsiteProduction`,
 * `revalidateReleaseAuthority`, and `waitForProviderOutcome`, against a world
 * that serves the model's environment:
 *
 * - the production ref and the release tag live in a real bare Git
 *   repository whose commits have the model's ancestry, and the write is the
 *   production writer `advanceWebsiteProductionRef` running `/usr/bin/git`
 *   against it: a real shallow tag fetch, a real peel, and a real
 *   `--force-with-lease` push;
 * - protected main, the tag commit, the Release and Latest, comparisons,
 *   GraphQL and REST Production deployments, and deployment statuses are a
 *   read-only API stub computed from the model state;
 * - the apex marker, health routes, and `www` redirect are a public-site stub.
 *
 * The world takes the model's environment at each production step's boundary:
 * before each direct call, at `advanceRef`, and in the injected `sleep`
 * between observations. A drift the model arms lands between the two terminal
 * readbacks of the success confirmation. Each production verdict, its reason,
 * the step it stops at, and the real production ref must equal the model's.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { releaseIdentity } from "../website/github-release-artifact.mjs";
import {
  createProductionReleaseMarker,
  PRODUCTION_RELEASE_MARKER_PATH,
  serializeProductionReleaseMarker,
} from "../website/production-release-marker.mjs";
import {
  createProviderBaseline,
  promoteWebsiteProduction,
  releaseSourceReceipt,
  revalidateReleaseAuthority,
  waitForProviderOutcome,
} from "./release-provider-outcome.mjs";
import { advanceWebsiteProductionRef } from "./release-ref-writer.mjs";
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
import { itfBool, itfInt, quintModel, quintTraceCache } from "./verification-replay.js";

const MODEL_FILE = "promotion.qnt";
const TRACE_VARIABLES = ["env", "ghost", "job", "mbt::actionTaken", "mbt::nondetPicks"];
const ENV_FIELDS = ["deploy", "drift", "latestOk", "main", "marker", "prodRef", "tagAt"];
const JOB_FIELDS = ["baseRef", "lease", "pc", "polls", "reason", "steps", "targetSeen", "verdict"];
const GHOST_FIELDS = ["obsBad", "passedMains", "witness", "writeAuth", "writeFrom", "wrote"];

// The model's constants: commits 1..7 with this ancestry, C = 2, W = 3.
const C = 2;
const W = 3;
const PARENT: ReadonlyMap<number, number | null> = new Map([[1, null], [2, 1], [3, 2], [4, 3], [5, 4], [6, 2], [7, null]]);
const MAXP = 3;
const BOUND = 6 + MAXP;
const REASONS = new Set(["authority", "moved", "fastForward", "peel", "lease", "ref", "provider", "marker", "drift", "exhausted"]);
const DEPLOY_STATES = new Set(["none", "pending", "success", "failure"]);
const MARKERS = new Set(["base", "target", "targetAlt", "third"]);
const FAULT_KINDS = new Set(["main", "ref", "tag", "latest", "marker", "drift", "failure"]);
const DRIFTS = new Set(["none", "ref", "status", "marker", "latest", "route", "www", "tag", "release", "source", "inventory"]);
const PRODUCTION_ACTIONS = new Set(["authority", "baseline", "promote", "write", "poll"]);

const REPOSITORY = "hraness/ghostget";
const TAG = "v0.16.2";
const BASE_TAG = "v0.16.1";
const THIRD_TAG = "v0.16.0";
const RUN_ID = "88001";
const RELEASE_PUBLISHED_AT = "2026-08-29T14:00:00Z";
const FIXED_REMOTE = "https://github.com/hraness/ghostget.git";
const GIT = "/usr/bin/git";
const PRODUCTION_REF = "refs/heads/website-production";
const POLL_INTERVAL = 60_000;
const REVOCATION = Object.freeze({ converged: true, observationCount: 3, propagationObserved: true, stableDenials: 2 });
const VERCEL_BOT = Object.freeze({ id: 35613825, login: "vercel[bot]", type: "Bot" });
const VERCEL_GRAPHQL_BOT = Object.freeze({ __typename: "Bot", databaseId: 35613825, login: "vercel" });
const RELEASE_BOT = Object.freeze({ id: 41898282, login: "github-actions[bot]", type: "Bot" });
const HEALTH_ROUTES = new Set(["/", "/docs/how-to/connect-beeper/", "/llms.txt"]);
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const ancestors = (commit: number): ReadonlySet<number> => {
  const result = new Set<number>();
  for (let current: number | null = commit; current !== null; current = PARENT.get(current) ?? null) result.add(current);
  return result;
};
const anc = (a: number, b: number): boolean => ancestors(b).has(a);
const strictAnc = (a: number, b: number): boolean => a !== b && anc(a, b);

// ---------------------------------------------------------------------------
// Model states
// ---------------------------------------------------------------------------

type Env = Readonly<{
  main: number;
  prodRef: number;
  tagAt: number;
  latestOk: boolean;
  deploy: string;
  marker: string;
  drift: string;
}>;

type Job = Readonly<{
  pc: string;
  baseRef: number;
  lease: number;
  polls: number;
  targetSeen: string;
  verdict: string;
  reason: string;
  steps: number;
}>;

type Ghost = Readonly<{
  wrote: boolean;
  writeFrom: number;
  writeAuth: boolean;
  passedMains: ReadonlySet<number>;
  obsBad: boolean;
  witness: boolean;
}>;

type ModelState = Readonly<{ env: Env; job: Job; ghost: Ghost }>;

function member(value: string, allowed: ReadonlySet<string>, label: string): string {
  if (!allowed.has(value)) throw new Error(`ITF ${label} has the unexpected value ${value}`);
  return value;
}

function commit(value: ItfValue, label: string): number {
  const number = itfInt(value, label);
  if (!PARENT.has(number)) throw new Error(`ITF ${label} names no model commit`);
  return number;
}

function modelState(state: ItfState): ModelState {
  const env = itfRecord(itfVariable(state, "env"), ENV_FIELDS, "env");
  const job = itfRecord(itfVariable(state, "job"), JOB_FIELDS, "job");
  const ghost = itfRecord(itfVariable(state, "ghost"), GHOST_FIELDS, "ghost");
  const passed = ghost.get("passedMains")!;
  if (passed.kind !== "set") throw new Error("ITF ghost.passedMains must be a set");
  const int = (fields: ReadonlyMap<string, ItfValue>, name: string, label: string): number => itfInt(fields.get(name)!, `${label}.${name}`);
  const str = (fields: ReadonlyMap<string, ItfValue>, name: string, label: string): string => itfString(fields.get(name)!, `${label}.${name}`);
  return Object.freeze({
    env: Object.freeze({
      main: commit(env.get("main")!, "env.main"),
      prodRef: commit(env.get("prodRef")!, "env.prodRef"),
      tagAt: commit(env.get("tagAt")!, "env.tagAt"),
      latestOk: itfBool(env.get("latestOk")!, "env.latestOk"),
      deploy: member(str(env, "deploy", "env"), DEPLOY_STATES, "env.deploy"),
      marker: member(str(env, "marker", "env"), MARKERS, "env.marker"),
      drift: member(str(env, "drift", "env"), DRIFTS, "env.drift"),
    }),
    job: Object.freeze({
      pc: str(job, "pc", "job"),
      baseRef: int(job, "baseRef", "job"),
      lease: int(job, "lease", "job"),
      polls: int(job, "polls", "job"),
      targetSeen: str(job, "targetSeen", "job"),
      verdict: str(job, "verdict", "job"),
      reason: str(job, "reason", "job"),
      steps: int(job, "steps", "job"),
    }),
    ghost: Object.freeze({
      wrote: itfBool(ghost.get("wrote")!, "ghost.wrote"),
      writeFrom: int(ghost, "writeFrom", "ghost"),
      writeAuth: itfBool(ghost.get("writeAuth")!, "ghost.writeAuth"),
      passedMains: new Set(passed.items.map((item) => commit(item, "ghost.passedMains member"))),
      obsBad: itfBool(ghost.get("obsBad")!, "ghost.obsBad"),
      witness: itfBool(ghost.get("witness")!, "ghost.witness"),
    }),
  });
}

type Step = Readonly<{ action: string; picks: ReadonlyMap<string, ItfValue> }>;

function recordedStep(state: ItfState): Step {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const raw = itfVariable(state, "mbt::nondetPicks");
  if (raw.kind !== "record") throw new Error(`state ${String(state.index)}: mbt::nondetPicks must be a record`);
  const picks = new Map<string, ItfValue>();
  for (const [name, value] of raw.fields) {
    const picked = itfOption(value, `mbt::nondetPicks.${name}`);
    if (picked !== null) picks.set(name, picked);
  }
  return { action, picks };
}

function pick(step: Step, name: string, index: number): ItfValue {
  const value = step.picks.get(name);
  if (value === undefined) throw new Error(`state ${String(index)}: ${step.action} records no ${name} pick`);
  return value;
}

const authorityOk = (env: Env): boolean => anc(W, env.main) && env.tagAt === C && env.latestOk;

/** The model's invariants, evaluated on one state, for the mutant replays. */
function invariantHolds(invariant: string, { env, job, ghost }: ModelState): boolean {
  switch (invariant) {
    case "leasedFastForward":
      return !ghost.wrote || (ghost.writeFrom === job.baseRef && strictAnc(ghost.writeFrom, C));
    case "authorityChain":
      return anc(C, W) && [...ghost.passedMains].every((main) => anc(W, main));
    case "revalidatedBeforeWrite":
      return !ghost.wrote || (job.baseRef !== 0 && ghost.writeAuth);
    case "promotedStable":
      return job.verdict !== "promoted"
        || (env.drift === "none" && env.deploy === "success" && env.marker === "target" && env.prodRef === C && authorityOk(env));
    case "markerBaselineToTarget":
      return job.verdict !== "promoted" || !ghost.obsBad;
    case "boundedVerdict":
      return job.steps <= BOUND && (job.steps !== BOUND || job.verdict !== "none");
    case "stuckHasEvidence":
      return job.verdict !== "stuck" || (REASONS.has(job.reason) && ghost.witness);
    default:
      throw new Error(`unknown invariant ${invariant}`);
  }
}

/** One production step of the model: the environment it runs against and where the model halts. */
type ScheduledStep = Readonly<{ index: number; pc: string; env: Env; after: ModelState }>;

/**
 * Decode a trace into its production steps. Environment actions only change
 * the environment the next production step sees, and each must record the
 * picks its change needs.
 */
function schedule(trace: ItfTrace): Readonly<{ initial: ModelState; steps: readonly ScheduledStep[]; final: ModelState }> {
  const [first, ...rest] = trace.states;
  if (first === undefined) throw new Error("A trace needs its initial state");
  if (recordedStep(first).action !== "init") throw new Error("A trace must start with the init action");
  const initial = modelState(first);
  let before = initial;
  const steps: ScheduledStep[] = [];
  for (const state of rest) {
    const step = recordedStep(state);
    const after = modelState(state);
    if (PRODUCTION_ACTIONS.has(step.action)) {
      if (before.job.verdict !== "none") throw new Error(`state ${String(state.index)}: ${step.action} after the verdict`);
      steps.push(Object.freeze({ index: state.index, pc: before.job.pc, env: before.env, after }));
    } else if (step.action === "fault") {
      // promotion.qnt's lateFault: after the write, roll 1 draws a drift and
      // roll 2 a marker fault whatever the kind pick says.
      const roll = itfInt(pick(step, "roll", state.index), "roll");
      const picked = member(itfString(pick(step, "kind", state.index), "kind"), FAULT_KINDS, "kind");
      const kind = before.ghost.wrote && roll === 1 ? "drift" : before.ghost.wrote && roll === 2 ? "marker" : picked;
      if (roll !== 0 && !(before.ghost.wrote && roll <= 2)) {
        throw new Error(`state ${String(state.index)}: a fault fired on roll ${String(roll)}`);
      }
      if (kind === "drift" && after.env.drift !== itfString(pick(step, "d", state.index), "d")) {
        throw new Error(`state ${String(state.index)}: the drift fault does not arm its pick`);
      }
      if (kind === "marker" && after.env.marker !== itfString(pick(step, "mk", state.index), "mk")) {
        throw new Error(`state ${String(state.index)}: the marker fault does not set its pick`);
      }
      if (kind === "main" && after.env.main !== itfInt(pick(step, "m", state.index), "m")) {
        throw new Error(`state ${String(state.index)}: the main fault does not set its pick`);
      }
      if (kind === "ref" && after.env.prodRef !== itfInt(pick(step, "r", state.index), "r")) {
        throw new Error(`state ${String(state.index)}: the ref fault does not set its pick`);
      }
    } else if (step.action === "vercel") {
      member(itfString(pick(step, "pick", state.index), "pick"), new Set(["build", "expose"]), "pick");
    } else if (step.action !== "done") {
      throw new Error(`state ${String(state.index)}: unknown action ${step.action}`);
    }
    before = after;
  }
  return Object.freeze({ initial, steps, final: before });
}

// ---------------------------------------------------------------------------
// The real Git remote
// ---------------------------------------------------------------------------

type Repositories = Readonly<{
  directory: string;
  bare: string;
  work: string;
  remote: string;
  sha: ReadonlyMap<number, string>;
  tagObject: ReadonlyMap<number, string>;
}>;

const GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  LC_ALL: "C",
  PATH: "/usr/bin:/bin",
  TZ: "UTC",
});

function git(cwd: string, args: readonly string[], input?: string, environment: Readonly<Record<string, string>> = {}): string {
  const result = spawnSync(GIT, args, { cwd, encoding: "utf8", env: { ...GIT_ENVIRONMENT, HOME: cwd, ...environment }, input });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

/** A bare repository with commits 1..7 in the model's ancestry, an annotated tag object per tag target, and a work repository for the writer. */
async function createRepositories(): Promise<Repositories> {
  const directory = await mkdtemp(join(tmpdir(), "ghostget-promotion-replay-"));
  const bare = join(directory, "remote.git");
  const work = join(directory, "writer");
  git(directory, ["init", "--quiet", "--bare", bare]);
  git(directory, ["init", "--quiet", work]);
  const tree = git(bare, ["mktree"], "");
  const sha = new Map<number, string>();
  for (const [number, parent] of PARENT) {
    const stamp = `${String(1_788_000_000 + number)} +0000`;
    const args = ["commit-tree", tree, "-m", `model commit ${String(number)}`];
    if (parent !== null) args.push("-p", sha.get(parent)!);
    sha.set(number, git(bare, args, undefined, {
      GIT_AUTHOR_DATE: stamp,
      GIT_AUTHOR_EMAIL: "replay@example.invalid",
      GIT_AUTHOR_NAME: "Replay",
      GIT_COMMITTER_DATE: stamp,
      GIT_COMMITTER_EMAIL: "replay@example.invalid",
      GIT_COMMITTER_NAME: "Replay",
    }));
  }
  const tagObject = new Map<number, string>();
  for (const target of [C, 6]) {
    tagObject.set(target, git(bare, ["mktag"], [
      `object ${sha.get(target)!}`,
      "type commit",
      `tag ${TAG}`,
      "tagger Replay <replay@example.invalid> 1788000100 +0000",
      "",
      `release tag at model commit ${String(target)}`,
      "",
    ].join("\n")));
  }
  // Keep every model commit reachable so the writer's shallow fetch and push negotiate against the full graph.
  git(bare, ["update-ref", "--stdin"], [...sha].map(([number, value]) => `update refs/heads/model-${String(number)} ${value}`).join("\n") + "\n");
  return Object.freeze({ directory, bare, work, remote: `file://${bare}`, sha, tagObject });
}

// ---------------------------------------------------------------------------
// The world: the model environment served as GitHub, Vercel, and the site
// ---------------------------------------------------------------------------

/** Production went past the model's last recorded production step. */
class TraceEnd extends Error {}
class ReplayDivergence extends Error {}

/**
 * `force-push` is a seeded production defect: the writer's leased push
 * becomes a plain `--force` push, as a writer without the lease would do.
 */
type Defect = "none" | "force-push";

type Marker = ReturnType<typeof createProductionReleaseMarker>;

const vercelUrl = (tag: string, deploymentId: number): string =>
  `https://${releaseIdentity(tag).package === "@hraness/ghostget" ? "ghostget" : "wrench"}-${String(deploymentId)}-hraness.vercel.app`;

class World {
  readonly calls: string[] = [];
  readonly #repositories: Repositories;
  readonly #steps: readonly ScheduledStep[];
  readonly #defect: Defect;
  readonly #baseSha: string;
  #next = 0;
  #env: Env;
  #refSha: string;
  #tagTarget: number;
  #serverSeconds = 0;
  #monotonic = 0;
  #markerReads = 0;
  #graphqlRemaining = 5_000;
  drift: string | null = null;
  current: ScheduledStep | null = null;
  wroteAt: ScheduledStep | null = null;

  constructor(repositories: Repositories, initial: Env, steps: readonly ScheduledStep[], defect: Defect) {
    this.#repositories = repositories;
    this.#steps = steps;
    this.#defect = defect;
    this.#env = initial;
    this.#baseSha = this.sha(initial.prodRef);
    this.#refSha = this.#baseSha;
    this.#tagTarget = initial.tagAt;
    git(repositories.bare, ["update-ref", "--stdin"], [
      `update ${PRODUCTION_REF} ${this.#refSha}`,
      `update refs/tags/${TAG} ${this.#tagObject(initial.tagAt)}`,
      "",
    ].join("\n"));
  }

  sha(commit: number): string {
    const value = this.#repositories.sha.get(commit);
    if (value === undefined) throw new Error(`no commit ${String(commit)}`);
    return value;
  }

  #commitOf(sha: string): number {
    for (const [number, value] of this.#repositories.sha) if (value === sha) return number;
    throw new Error(`the world has no commit ${sha}`);
  }

  #tagObject(target: number): string {
    const value = this.#repositories.tagObject.get(target);
    if (value === undefined) throw new Error(`no tag object for commit ${String(target)}`);
    return value;
  }

  get env(): Env {
    return this.#env;
  }

  get consumed(): number {
    return this.#next;
  }

  realRef(): string {
    return git(this.#repositories.bare, ["rev-parse", "--verify", `${PRODUCTION_REF}^{commit}`]);
  }

  /** Take the environment of the model's next production step, which must be `pc`. */
  enter(pc: string): void {
    const step = this.#steps[this.#next];
    if (step === undefined) throw new TraceEnd(`production reached ${pc} after the model's last production step`);
    const phase = pc === "authority" ? ["auth1", "auth2", "auth3"] : [pc];
    if (!phase.includes(step.pc)) {
      throw new ReplayDivergence(`state ${String(step.index)}: production reached ${pc}, the model ${step.pc}`);
    }
    this.#next += 1;
    this.current = step;
    this.#env = step.env;
    const updates: string[] = [];
    const refSha = this.sha(step.env.prodRef);
    if (refSha !== this.#refSha) {
      updates.push(`update ${PRODUCTION_REF} ${refSha}`);
      this.#refSha = refSha;
    }
    if (step.env.tagAt !== this.#tagTarget) {
      updates.push(`update refs/tags/${TAG} ${this.#tagObject(step.env.tagAt)}`);
      this.#tagTarget = step.env.tagAt;
    }
    if (updates.length > 0) git(this.#repositories.bare, ["update-ref", "--stdin"], `${updates.join("\n")}\n`);
  }

  #drifted(kind: string): boolean {
    return this.drift === kind;
  }

  // -- clocks ---------------------------------------------------------------

  monotonicNow = (): number => {
    this.#monotonic += 1;
    return this.#monotonic;
  };

  sleep = async (milliseconds: number): Promise<void> => {
    this.#monotonic += milliseconds;
    this.enter("poll");
  };

  #serverDate(): string {
    this.#serverSeconds += 1;
    return new Date(Date.parse("2026-08-29T15:00:00Z") + this.#serverSeconds * 1_000).toISOString();
  }

  // -- GitHub REST ------------------------------------------------------------

  #release(): Record<string, unknown> {
    const receipt = releaseSourceReceipt({ repository: REPOSITORY, verifiedSha: this.sha(C), verifiedTag: TAG, workflowRunId: RUN_ID });
    return {
      assets: [],
      author: RELEASE_BOT,
      body: `${receipt}\n\n## What's Changed\nGenerated notes are not authority.`,
      draft: false,
      id: this.#drifted("release") ? 12 : 10,
      immutable: true,
      name: `Ghostget ${TAG}`,
      prerelease: false,
      published_at: RELEASE_PUBLISHED_AT,
      tag_name: TAG,
      target_commitish: "main",
    };
  }

  #comparison(ancestorSha: string, descendantSha: string): Record<string, unknown> {
    const a = this.#commitOf(ancestorSha);
    const b = this.#commitOf(descendantSha);
    const common = [...ancestors(b)].filter((candidate) => anc(candidate, a));
    if (common.length === 0) {
      throw new Error(`GET /repos/${REPOSITORY}/compare/${ancestorSha}...${descendantSha} failed: gh: No common ancestor between ${ancestorSha} and ${descendantSha}. (HTTP 404)`);
    }
    const mergeBase = common.reduce((best, candidate) => ancestors(candidate).size > ancestors(best).size ? candidate : best);
    const path = (from: number, to: number): number[] => {
      const result: number[] = [];
      for (let current: number | null = to; current !== null && current !== from; current = PARENT.get(current) ?? null) result.unshift(current);
      return result;
    };
    const ahead = path(mergeBase, b);
    const behind = path(mergeBase, a);
    const status = ahead.length === 0 && behind.length === 0 ? "identical"
      : behind.length === 0 ? "ahead" : ahead.length === 0 ? "behind" : "diverged";
    return {
      ahead_by: ahead.length,
      base_commit: { sha: ancestorSha },
      behind_by: behind.length,
      commits: ahead.map((number) => ({ sha: this.sha(number) })),
      merge_base_commit: { sha: this.sha(mergeBase) },
      status,
    };
  }

  #candidateStatuses(): Record<string, unknown>[] {
    const url = vercelUrl(TAG, 20);
    const status = (id: number, state: string, createdAt: string): Record<string, unknown> => ({
      created_at: createdAt,
      creator: VERCEL_BOT,
      deployment_url: `https://api.github.com/repos/${REPOSITORY}/deployments/20`,
      environment: "Production",
      environment_url: url,
      id,
      log_url: url,
      node_id: `status-${String(id)}`,
      state,
      target_url: url,
      updated_at: createdAt,
    });
    const statuses = [status(200, "pending", "2026-08-29T16:00:30Z")];
    if (this.#env.deploy === "success") statuses.unshift(status(201, "success", "2026-08-29T16:01:00Z"));
    if (this.#env.deploy === "failure") statuses.unshift(status(202, "failure", "2026-08-29T16:01:00Z"));
    if (this.#drifted("status")) statuses.unshift(status(203, "success", "2026-08-29T16:02:00Z"));
    return statuses;
  }

  #statuses(deploymentId: number): Record<string, unknown>[] {
    if (deploymentId === 20) return this.#env.deploy === "none" ? [] : this.#candidateStatuses();
    if (deploymentId === 10) {
      const url = vercelUrl(BASE_TAG, 10);
      return [{
        created_at: "2026-08-29T13:01:00Z",
        creator: VERCEL_BOT,
        deployment_url: `https://api.github.com/repos/${REPOSITORY}/deployments/10`,
        environment: "Production",
        environment_url: url,
        id: 100,
        log_url: url,
        node_id: "status-100",
        state: "success",
        target_url: url,
        updated_at: "2026-08-29T13:01:00Z",
      }];
    }
    if (deploymentId === 22) return [];
    throw new Error(`the world has no deployment ${String(deploymentId)}`);
  }

  #deployments(): Record<string, unknown>[] {
    const deployment = (id: number, sha: string, createdAt: string): Record<string, unknown> => ({
      created_at: createdAt,
      creator: VERCEL_BOT,
      environment: "Production",
      id,
      original_environment: "Production",
      ref: sha,
      sha,
      statuses_url: `https://api.github.com/repos/${REPOSITORY}/deployments/${String(id)}/statuses`,
      task: "deploy",
    });
    const result = [deployment(10, this.#baseSha, "2026-08-29T13:00:00Z")];
    if (this.#env.deploy !== "none") result.unshift(deployment(20, this.sha(C), "2026-08-29T16:00:00Z"));
    if (this.#drifted("inventory")) result.unshift(deployment(22, this.sha(C), "2026-08-29T16:05:00Z"));
    return result;
  }

  async get(endpoint: string): Promise<unknown> {
    this.calls.push(`GET ${endpoint}`);
    const prefix = `/repos/${REPOSITORY}`;
    if (endpoint === prefix) return { default_branch: "main" };
    if (endpoint === `${prefix}/git/ref/heads/main`) {
      const main = this.#drifted("source") ? 6 : this.#env.main;
      return { object: { sha: this.sha(main), type: "commit" }, ref: "refs/heads/main" };
    }
    if (endpoint === `${prefix}/git/ref/heads/website-production`) {
      return { object: { sha: this.#refSha, type: "commit" }, ref: PRODUCTION_REF };
    }
    if (endpoint === `${prefix}/releases/tags/${TAG}`) return this.#release();
    if (endpoint === `${prefix}/releases/latest`) {
      if (this.#env.latestOk && !this.#drifted("latest")) return this.#release();
      return { ...this.#release(), id: 11, name: "Ghostget v0.16.3", tag_name: "v0.16.3" };
    }
    if (endpoint === `${prefix}/commits/${encodeURIComponent(`refs/tags/${TAG}`)}`) {
      const target = this.#drifted("tag") ? 6 : this.#env.tagAt;
      return { commit: { message: "model commit", tree: { sha: "4".repeat(40) } }, parents: [], sha: this.sha(target) };
    }
    const compare = new RegExp(`^${prefix}/compare/([0-9a-f]{40})\\.\\.\\.([0-9a-f]{40})$`, "u").exec(endpoint);
    if (compare !== null) return this.#comparison(compare[1]!, compare[2]!);
    const statuses = new RegExp(`^${prefix}/deployments/([1-9][0-9]*)/statuses\\?per_page=100&page=([1-9][0-9]*)$`, "u").exec(endpoint);
    if (statuses !== null) return Number(statuses[2]) === 1 ? this.#statuses(Number(statuses[1])) : [];
    const detail = new RegExp(`^${prefix}/deployments/([1-9][0-9]*)$`, "u").exec(endpoint);
    if (detail !== null) {
      const found = this.#deployments().find((deployment) => deployment.id === Number(detail[1]));
      if (found === undefined) throw new Error(`GET ${endpoint} failed: gh: Not Found (HTTP 404)`);
      return found;
    }
    throw new Error(`the world serves no GET ${endpoint}`);
  }

  async getWithServerDate(endpoint: string): Promise<unknown> {
    return { body: await this.get(endpoint), serverDate: this.#serverDate() };
  }

  async graphql(): Promise<unknown> {
    const nodes = this.#deployments().map((deployment) => {
      const statuses = this.#statuses(deployment.id as number);
      const newest = statuses[0];
      const latestStatus = newest === undefined ? null : {
        createdAt: newest.created_at,
        creator: VERCEL_GRAPHQL_BOT,
        environment: newest.environment,
        environmentUrl: newest.environment_url,
        id: newest.node_id,
        logUrl: newest.log_url,
        state: String(newest.state).toUpperCase(),
        updatedAt: newest.updated_at,
      };
      return {
        commitOid: deployment.sha,
        createdAt: deployment.created_at,
        creator: VERCEL_GRAPHQL_BOT,
        databaseId: deployment.id,
        environment: "Production",
        latestStatus,
        originalEnvironment: "Production",
        ref: null,
        state: latestStatus === null ? "PENDING" : latestStatus.state === "SUCCESS" ? "ACTIVE" : latestStatus.state,
        task: "deploy",
        updatedAt: newest?.updated_at ?? deployment.created_at,
      };
    });
    this.#graphqlRemaining -= 1;
    return {
      data: {
        rateLimit: { cost: 1, remaining: this.#graphqlRemaining, resetAt: "2026-08-29T17:00:00Z" },
        repository: { deployments: { nodes, pageInfo: { endCursor: "end-1", hasNextPage: false }, totalCount: nodes.length } },
      },
    };
  }

  /** The model's write step: the real production writer against the real remote. */
  async advanceRef(repository: string, expectedOldSha: string, verifiedSha: string, verifiedTag: string): Promise<unknown> {
    this.enter("write");
    this.wroteAt = this.current;
    this.calls.push(`GIT CAS ${expectedOldSha} ${verifiedSha}`);
    let remotes = 0;
    advanceWebsiteProductionRef({
      environment: { WRENCH_RELEASE_APP_TOKEN: "replay-token" },
      expectedOldSha,
      repository,
      spawnImplementation: (command: string, args: readonly string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string> => {
        if (command !== GIT) throw new Error(`the writer ran ${command}`);
        const mapped = args.map((argument) => {
          if (argument === FIXED_REMOTE) {
            remotes += 1;
            return this.#repositories.remote;
          }
          if (this.#defect === "force-push" && argument.startsWith("--force-with-lease=")) return "--force";
          return argument;
        });
        return spawnSync(command, mapped, { ...options, cwd: this.#repositories.work });
      },
      verifiedSha,
      verifiedTag,
    });
    if (remotes !== 2) throw new Error(`the writer named the fixed remote ${String(remotes)} times`);
    this.#refSha = this.realRef();
    return REVOCATION;
  }

  // -- the public site -----------------------------------------------------

  #marker(kind: string): Marker {
    const identity = (sha: string, tag: string, deploymentId: number): Marker => createProductionReleaseMarker({
      deploymentUrl: vercelUrl(tag, deploymentId),
      name: releaseIdentity(tag).package,
      sourceSha: sha,
      tag,
      version: tag.slice(1),
    });
    switch (kind) {
      case "base": return identity(this.#baseSha, BASE_TAG, 10);
      case "target": return identity(this.sha(C), TAG, 20);
      case "targetAlt": return identity(this.sha(C), TAG, 21);
      case "third": return identity(this.sha(5), THIRD_TAG, 30);
      default: throw new Error(`unknown marker ${kind}`);
    }
  }

  readonly publicSite = {
    readMarker: async (tag: string, sha: string): Promise<unknown> => {
      this.calls.push("marker");
      this.#markerReads += 1;
      const marker = this.#marker(this.#drifted("marker") ? "targetAlt" : this.#env.marker);
      return {
        bodySha256: sha256(serializeProductionReleaseMarker(marker)),
        kind: "release",
        marker,
        requestPath: `${PRODUCTION_RELEASE_MARKER_PATH}?release=${tag}&source=${sha}&nonce=replay-${String(this.#markerReads).padStart(4, "0")}`,
      };
    },
    readHealthRoute: async (route: string): Promise<unknown> => {
      this.calls.push(`health ${route}`);
      if (!HEALTH_ROUTES.has(route)) throw new Error(`the world serves no health route ${route}`);
      return {
        bodyBytes: 64,
        bodySha256: sha256(`${this.#drifted("route") ? "changed" : "stable"} ${route}`),
        contentType: route === "/llms.txt" ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
        path: route,
        status: 200,
      };
    },
    readWwwRedirect: async (requestPath: string): Promise<unknown> => {
      this.calls.push("www");
      // An armed `www` drift changes the redirect body the second terminal snapshot reads.
      const redirect = {
        bodySha256: sha256(this.#drifted("www") ? "Redirecting elsewhere...\n" : "Redirecting...\n"),
        contentType: "text/plain",
        location: `https://ghostget.com${requestPath}`,
        status: 308,
      };
      // The first terminal snapshot is complete: an armed drift lands before the second.
      if (this.drift === null && this.#env.drift !== "none") {
        this.drift = this.#env.drift;
        if (this.drift === "ref") {
          this.#refSha = this.sha(5);
          git(this.#repositories.bare, ["update-ref", PRODUCTION_REF, this.#refSha]);
        }
      }
      return redirect;
    },
  };
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

/** Map a production refusal to the model's stuck reason. Unknown refusals fail the replay. */
function refusalReason(message: string, world: World): string {
  if (world.drift !== null) return "drift";
  const reasons: readonly (readonly [string, RegExp])[] = [
    ["authority", /release workflow source|release recovery default branch|moved from the verified release commit|is no longer Latest|no longer the exact immutable Latest Release|Release .* changed during authority verification|immutable Release identity changed/u],
    ["moved", /website-production moved (?:after the baseline snapshot|before promotion)/u],
    ["fastForward", /website-production does not fast-forward|compare\/[0-9a-f]{40}\.\.\.[0-9a-f]{40} failed: gh: No common ancestor/u],
    ["peel", /fetched release tag does not peel to the verified release SHA/u],
    ["lease", /website-production Git push (?:failed|did not update the ref from the leased SHA)/u],
    ["ref", /website-production moved during provider verification/u],
    ["provider", /candidate Production deployment (?:20 )?ended in failure/u],
    ["marker", /public production release marker (?:exposed a third release identity|regressed after exposing the target release|changed within the target release identity|does not bind the pinned candidate deployment URL)/u],
    ["exhausted", /provider observation poll budget exhausted before its monotonic deadline/u],
  ];
  for (const [reason, pattern] of reasons) if (pattern.test(message)) return reason;
  throw new Error(`the replay maps no reason to the production refusal: ${message}`);
}

type Outcome = Readonly<{ verdict: "promoted" | "stuck" | "none"; reason: string; message: string }>;

async function runProduction(world: World): Promise<Outcome> {
  const authority = {
    defaultBranch: "main",
    eventName: "workflow_run",
    recoveryWorkflowSha: world.sha(W),
    releaseWorkflowRunId: RUN_ID,
    repository: REPOSITORY,
    verifiedSha: world.sha(C),
    verifiedTag: TAG,
  };
  try {
    world.enter("authority");
    await revalidateReleaseAuthority({ api: world, ...authority });
    world.enter("baseline");
    const baselineReceipt = await createProviderBaseline({
      api: world,
      publicSite: world.publicSite,
      releaseWorkflowRunId: RUN_ID,
      repository: REPOSITORY,
      verifiedSha: world.sha(C),
      verifiedTag: TAG,
    });
    world.enter("authority");
    await revalidateReleaseAuthority({ api: world, ...authority });
    world.enter("promote");
    const promotionReceipt = await promoteWebsiteProduction({ api: world, baselineReceipt, ...authority });
    world.enter("authority");
    await revalidateReleaseAuthority({ api: world, ...authority });
    world.enter("wait");
    await waitForProviderOutcome({
      api: world,
      baselineReceipt,
      maxPolls: MAXP,
      monotonicNow: world.monotonicNow,
      pollIntervalMilliseconds: POLL_INTERVAL,
      promotionReceipt,
      publicSite: world.publicSite,
      sleep: world.sleep,
      ...authority,
    });
    return { verdict: "promoted", reason: "", message: "" };
  } catch (error) {
    if (error instanceof TraceEnd || error instanceof ReplayDivergence) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return { verdict: "stuck", reason: refusalReason(message, world), message };
  }
}

const outcomeText = (verdict: string, reason: string): string => verdict === "stuck" ? `stuck (${reason})` : verdict;

let repositories: Repositories | undefined;

/** Replay one trace; a divergence names the model state where production and the model part. */
async function replay(trace: ItfTrace, defect: Defect = "none"): Promise<Readonly<{ world: World; outcome: Outcome }>> {
  if (repositories === undefined) throw new Error("the replay repositories are not ready");
  const { initial, steps, final } = schedule(trace);
  const world = new World(repositories, initial.env, steps, defect);
  let outcome: Outcome;
  try {
    outcome = await runProduction(world);
  } catch (error) {
    if (!(error instanceof TraceEnd)) throw error;
    const last = steps.at(-1);
    if (last === undefined || last.after.job.verdict === "none") {
      // The trace ends before the model's verdict, and production agreed up to its last step.
      return { world, outcome: { verdict: "none", reason: "", message: "" } };
    }
    throw new ReplayDivergence(`state ${String(last.index)}: ${last.pc} production continued, the model ${outcomeText(last.after.job.verdict, last.after.job.reason)}`);
  }
  const at = world.current;
  if (at === null) throw new Error("production ran no step");
  const model = at.after.job;
  if (outcome.verdict !== model.verdict || outcome.reason !== model.reason) {
    throw new ReplayDivergence(`state ${String(at.index)}: ${at.pc} production ${outcomeText(outcome.verdict, outcome.reason)}, the model ${model.verdict === "none" ? "continued" : outcomeText(model.verdict, model.reason)}`);
  }
  if (world.consumed !== steps.length) throw new Error(`the model ran ${String(steps.length - world.consumed)} production steps after its verdict`);
  const expectedRef = world.drift === "ref" ? world.sha(5) : world.sha(final.env.prodRef);
  if (world.realRef() !== expectedRef) {
    throw new ReplayDivergence(`state ${String(at.index)}: the real website-production ref is ${world.realRef()}, the model's ${expectedRef}`);
  }
  return { world, outcome };
}

async function divergence(trace: ItfTrace, defect: Defect = "none"): Promise<string | null> {
  try {
    await replay(trace, defect);
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error.message;
    throw error;
  }
}

/** The production branch one replayed trace reached. */
function coverageKeys(trace: ItfTrace, world: World, outcome: Outcome): string[] {
  const { initial } = schedule(trace);
  const keys = [`baseline ref ${initial.env.prodRef === 7 ? "unrelated" : "ancestor"}`];
  if (outcome.verdict === "none") return [...keys, "truncated"];
  keys.push(outcomeText(outcome.verdict, outcome.reason));
  if (outcome.reason === "drift") keys.push(`drift ${world.drift!}`);
  if (outcome.reason === "marker") {
    keys.push(`marker ${/public production release marker (.*)$/u.exec(outcome.message)![1]!}`);
  }
  if (world.wroteAt !== null) keys.push("real leased push");
  return keys;
}

const promotionModel = () => quintModel(MODEL_FILE);
const traces = quintTraceCache(MODEL_FILE);

beforeAll(async () => {
  repositories = await createRepositories();
});

afterAll(async () => {
  if (repositories !== undefined) await rm(repositories.directory, { recursive: true, force: true });
});

describe("promotion.qnt ITF replay", () => {
  test("replays every seeded model trace through the production promotion and a real leased push", async () => {
    const model = await promotionModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-promotion-replay.test.ts");
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const covered = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      const { world, outcome } = await replay(trace);
      for (const key of coverageKeys(trace, world, outcome)) covered.add(key);
    }
    expect([...covered].filter((key) => key !== "truncated").sort()).toEqual([
      "baseline ref ancestor",
      "baseline ref unrelated",
      "drift inventory",
      "drift latest",
      "drift marker",
      "drift ref",
      "drift release",
      "drift route",
      "drift source",
      "drift status",
      "drift tag",
      "drift www",
      "marker changed within the target release identity",
      "marker does not bind the pinned candidate deployment URL",
      "marker exposed a third release identity",
      "marker regressed after exposing the target release",
      "promoted",
      "real leased push",
      "stuck (authority)",
      "stuck (drift)",
      "stuck (exhausted)",
      "stuck (fastForward)",
      "stuck (lease)",
      "stuck (marker)",
      "stuck (moved)",
      "stuck (peel)",
      "stuck (provider)",
      "stuck (ref)",
    ]);
  });

  test("the production promotion with the seeded force-push defect diverges from the model traces", async () => {
    const model = await promotionModel();
    const divergences: string[] = [];
    // Only a trace that reaches the write can tell a leased push from a
    // plain one; the others replay identically under both.
    for (const trace of (await traces(model.step)).filter((trace) => schedule(trace).steps.some((step) => step.pc === "write"))) {
      const message = await divergence(trace, "force-push");
      if (message !== null) divergences.push(message);
    }
    expect(divergences.length).toBeGreaterThan(0);
    for (const message of divergences) {
      // The writer's porcelain check refuses the forced update after Git has
      // already moved the ref, so the replay's real-ref check names the part.
      expect(message).toMatch(/^state \d+: (?:write production continued, the model stuck \(lease\)|the real website-production ref is [0-9a-f]{40}, the model's [0-9a-f]{40})$/u);
    }
  });

  for (const [step, invariant, pattern] of [
    ["stepNoSource", "authorityChain", /^state \d+: (?:auth[123]|promote|write|wait|poll) production stuck \(authority\), the model (?:continued|promoted|stuck \(\w+\))$/u],
    ["stepNoFastForward", "leasedFastForward", /^state \d+: promote production stuck \(fastForward\), the model continued$/u],
    ["stepNoLease", "leasedFastForward", /^state \d+: write production stuck \(lease\), the model (?:continued|stuck \(authority\))$/u],
    ["stepNoRecheck", "revalidatedBeforeWrite", /^state \d+: promote production stuck \(authority\), the model continued$/u],
    ["stepSingleReadback", "promotedStable", /^state \d+: (?:wait|poll) production stuck \(drift\), the model promoted$/u],
    ["stepLenientMarker", "markerBaselineToTarget", /^state \d+: (?:wait|poll) production stuck \(marker\), the model (?:continued|promoted|stuck \(\w+\))$/u],
    ["stepPendingIsFailure", "stuckHasEvidence", /^state \d+: (?:wait|poll) production (?:continued|stuck \((?:exhausted|marker)\)), the model stuck \(provider\)$/u],
    ["stepUnboundedPoll", "boundedVerdict", /^state \d+: poll production stuck \(exhausted\), the model continued$/u],
  ] as const) {
    test(`the production promotion refuses the ${step} traces at or before they break ${invariant}`, async () => {
      const model = await promotionModel();
      expect(model.mutants).toContainEqual({ step, invariant });
      let violating = 0;
      for (const trace of await traces(step)) {
        const firstViolation = trace.states.findIndex((state) => !invariantHolds(invariant, modelState(state)));
        if (firstViolation === -1) continue;
        violating += 1;
        const message = await divergence(trace);
        expect(message).toMatch(pattern);
        expect(Number(/^state (\d+):/u.exec(message!)![1])).toBeLessThanOrEqual(firstViolation);
      }
      expect(violating).toBeGreaterThan(0);
    });
  }

  test("an unknown action or a missing or malformed pick fails closed instead of skipping a step", async () => {
    const none = { tag: "None", value: { "#tup": [] } };
    const some = (value: unknown) => ({ tag: "Some", value });
    const int = (value: number) => ({ "#bigint": String(value) });
    const env = { deploy: "none", drift: "none", latestOk: true, main: int(4), marker: "base", prodRef: int(1), tagAt: int(2) };
    const job = (pc: string, steps: number) => ({
      baseRef: int(0), lease: int(0), pc, polls: int(0), reason: "", steps: int(steps), targetSeen: "", verdict: "none",
    });
    const ghost = { obsBad: false, passedMains: { "#set": [] }, witness: false, writeAuth: false, writeFrom: int(0), wrote: false };
    const picks = (kind: unknown) => ({
      d: some("ref"), kind, m: some(int(5)), main0: none, mk: some("third"), pick: some("build"), r: some(int(5)), refRoll: none, roll: some(int(0)),
    });
    const state = (index: number, action: string, pc: string, kind: unknown, main = 4) => ({
      "#meta": { index },
      env: { ...env, main: int(main) },
      ghost,
      job: job(pc, index === 0 ? 0 : 1),
      "mbt::actionTaken": action,
      "mbt::nondetPicks": picks(kind),
    });
    const trace = (action: string, kind: unknown, main = 4): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [state(0, "init", "auth1", none), state(1, action, "auth1", kind, main)],
    }));
    expect(schedule(trace("fault", some("main"), 5)).steps).toHaveLength(0);
    expect(() => schedule(trace("rebuild", some("main")))).toThrow("unknown action rebuild");
    expect(() => schedule(trace("fault", none, 5))).toThrow("records no kind pick");
    expect(() => schedule(trace("fault", "main", 5))).toThrow("must be a record");
    expect(() => schedule(trace("fault", some("main"), 3))).toThrow("the main fault does not set its pick");
    expect(() => refusalReason("an unforeseen refusal", { drift: null } as unknown as World)).toThrow("maps no reason");
  });
});
