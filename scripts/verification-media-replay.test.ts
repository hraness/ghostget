/**
 * ITF trace replay for `verification/quint/media.qnt` against production
 * `mediaUrl` (src/media/archive.ts) and its item lock (src/media/lock.ts).
 *
 * Quint writes seeded model-based-testing traces. Each trace drives real
 * `mediaUrl` runs for two processes in a fresh library directory, with fake
 * yt-dlp and FFmpeg adapters. Each run stops at two gates: inside the capture
 * adapter, and at the flush before promotion. The replay opens a gate when the
 * model records `captureDone` or `promote`, so other runs, heartbeat loss,
 * process death, cancellation and damage to the head interleave with a run
 * that holds the lock. After every step the replay compares each run's
 * result and gate, the revisions on disk, the quarantine, the lock file and
 * the staging item with the model state.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { chmod, mkdtemp, readdir, readFile, realpath, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MediaArchiveError,
  mediaUrl,
  revisionLineageIdentity,
  type MediaArchiveDependencies,
} from "../src/media/archive.js";
import type { MediaDerivativeReport } from "../src/media/ffmpeg.js";
import * as itemLock from "../src/media/lock.js";
import { parseProbeMetadata, type ProbeMetadata } from "../src/media/metadata.js";
import { compareUtf8 } from "../src/media/utf8-order.js";
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

const MODEL_FILE = "media.qnt";
const TRACE_VARIABLES = [
  "base", "cancelled", "cancelledCreated", "content", "lock", "lockId", "mbt::actionTaken", "mbt::nondetPicks",
  "myLock", "nextLockId", "phase", "promotedWithoutLock", "quarantined", "removedVerified", "response", "revisions",
  "staging",
];
const PICKS = ["c", "refresh", "x"];
const ACTIONS = ["cancel", "captureDone", "crash", "promote", "stale", "start", "stray", "tear"];
const PROCESSES = ["p", "q"] as const;
/** The lock module's default heartbeat period, which the replay stops so that only `stale` ages a lock. */
const HEARTBEAT_MS = 5_000;
/** Older than the lock module's five-minute stale limit. */
const STALE_AGE_MS = 10 * 60 * 1_000;

function fixtureMetadata(): ProbeMetadata {
  const canonicalUrl = "https://www.youtube.com/watch?v=video-id001";
  const parsed = parseProbeMetadata({ id: "video-id001", extractor: "Youtube", webpage_url: canonicalUrl }, canonicalUrl);
  if (!parsed.ok) throw new Error(parsed.message);
  return { ...parsed.metadata, canonicalUrl, title: "Fixture" };
}
const metadata = fixtureMetadata();
const lineage = revisionLineageIdentity(metadata, { mode: "video" });

type Deferred<T> = { resolve(value: T): void; reject(error: Error): void; readonly promise: Promise<T> };

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  // The run that awaits the gate sees the rejection; nothing else must.
  promise.catch(() => undefined);
  return { resolve, reject, promise };
}

// ---------------------------------------------------------------------------
// Seeded defects in the item lock
// ---------------------------------------------------------------------------

/**
 * `unfenced` renames without checking the lock, as promotion did before D11.
 * `lateCancel` checks the lock but skips the cancellation guard, as promotion
 * did before D9. `none` hands the production lock back unchanged.
 */
type Defect = "none" | "unfenced" | "lateCancel";
let lockDefect: Defect = "none";
const productionLock = { ...itemLock };
const LOCK_MODULE = "../src/media/lock.ts";

async function acquireWithDefect(...args: Parameters<typeof itemLock.acquireItemLock>): Promise<itemLock.ItemLock> {
  const lock = await productionLock.acquireItemLock(...args);
  const defect = lockDefect;
  if (defect === "none") return lock;
  return {
    ...lock,
    fencedRename: async (source, destination, guard) => {
      if (defect === "lateCancel") return lock.fencedRename(source, destination);
      guard?.();
      await rename(source, destination);
    },
  };
}

// ---------------------------------------------------------------------------
// The production harness
// ---------------------------------------------------------------------------

type Stop = "capture" | "sync";

type Run = {
  readonly controller: AbortController;
  readonly result: Promise<string>;
  readonly capture: Deferred<string>;
  readonly sync: Deferred<undefined>;
  stop: Deferred<Stop>;
  at: Stop | null;
  outcome: string | null;
};

const OUTCOMES: Readonly<Record<string, string>> = Object.freeze({
  BUSY: "busy",
  CANCELLED: "cancelled",
  ARCHIVE_INVALID: "invalid",
  IO_ERROR: "failed",
});

function outcomeOf(error: unknown): string {
  if (error instanceof MediaArchiveError) return OUTCOMES[error.code] ?? `error ${error.code}`;
  return `error ${error instanceof Error ? error.message : String(error)}`;
}

/** A process ID that no longer runs, so a lock naming it is reclaimable. */
function deadPid(): number {
  const child = Bun.spawnSync(["/usr/bin/true"]);
  if (child.pid <= 0 || !child.success) throw new Error("could not reap a child process");
  return child.pid;
}

class Harness {
  private readonly live = new Map<string, Run>();
  private readonly abandoned: Run[] = [];

  private constructor(readonly root: string, private readonly dead: number) {}

  static async create(dead: number): Promise<Harness> {
    return new Harness(await realpath(await mkdtemp(join(tmpdir(), "ghostget-media-replay-"))), dead);
  }

  get revisionParent(): string {
    return join(this.root, metadata.extractorDirectory, ...lineage.itemParentPathSegments);
  }

  get stagingItem(): string {
    return join(this.root, ".wrench-media-staging", ...lineage.storagePathSegments);
  }

  get lockFile(): string {
    return `${join(this.root, ".wrench-media-locks", ...lineage.storagePathSegments)}.lock`;
  }

  phase(process: string): string {
    const run = this.live.get(process);
    if (run === undefined) return "idle";
    return run.at === "capture" ? "capturing" : "flushing";
  }

  private dependencies(run: () => Run): MediaArchiveDependencies {
    return {
      findExecutable: (name) => Promise.resolve(`/fake/${name}`),
      probe: () => Promise.resolve({ ok: true, metadata }),
      capture: async (options) => {
        run().stop.resolve("capture");
        const content = await run().capture.promise;
        if (options.signal?.aborted === true) return { ok: false, diagnostic: "yt-dlp was cancelled", processReason: "aborted" };
        // Written into the attempt directory as yt-dlp would, without creating
        // it, so a staging reset under this run fails the capture.
        await writeFile(join(options.captureDirectory, "media.webm"), `media-${content}`);
        await writeFile(join(options.captureDirectory, "media.info.json"), "{}\n");
        await writeFile(join(options.captureDirectory, "media.description"), "description\n");
        await writeFile(join(options.captureDirectory, "media.webp"), "thumbnail");
        return { ok: true, identity: { ...metadata.acquisitionIdentity, ext: "webm" } };
      },
      derive: async (options) => {
        const video = join(options.derivativesDirectory, "video.mkv");
        const audio = join(options.derivativesDirectory, "audio.mka");
        await writeFile(video, "video-stream");
        return {
          probe: { ok: true, inspection: { streams: [], hasVideo: true, hasAudio: true, firstVideoStreamIndex: 0, firstAudioStreamIndex: 1 } },
          video: { role: "video", path: video, status: "created", sourceStreamIndex: 0 },
          audio: { role: "audio", path: audio, status: "not-requested" },
        } satisfies MediaDerivativeReport;
      },
      ytDlpVersion: () => Promise.resolve("2026.07.04"),
      ffmpegVersion: () => Promise.resolve("8.1.2"),
      probeDirectHttp: () => Promise.resolve({ ok: false, kind: "not-applicable", reason: "unrecognized-media" }),
      captureDirectHttp: () => Promise.resolve({ ok: false, error: { code: "transport", message: "not configured" } }),
      loadConfiguredTranscriber: () => Promise.resolve({ kind: "not-configured" }),
      transcribeAudioLocally: () => Promise.reject(new Error("local transcription is not configured")),
      now: () => new Date("2026-07-21T00:00:00.000Z"),
      durability: {
        syncTree: async () => {
          run().stop.resolve("sync");
          await run().sync.promise;
        },
        syncDirectory: () => Promise.resolve(),
      },
    };
  }

  /** Let `run` go on until it stops at its next gate or returns. */
  private async advance(run: Run): Promise<string> {
    const next = await Promise.race([
      run.result.then((outcome) => ({ outcome })),
      run.stop.promise.then((stop) => ({ stop })),
    ]);
    if ("outcome" in next) {
      run.outcome = next.outcome;
      run.at = null;
      return next.outcome;
    }
    run.at = next.stop;
    run.stop = deferred();
    return "";
  }

  private settle(process: string, run: Run, response: string): string {
    if (response !== "") this.live.delete(process);
    else this.live.set(process, run);
    return response;
  }

  async start(process: string, refresh: boolean): Promise<string> {
    if (this.live.has(process)) throw new Error(`${process} already runs`);
    let current: Run | null = null;
    const self = (): Run => {
      if (current === null) throw new Error("the run started before its harness");
      return current;
    };
    const controller = new AbortController();
    const result = mediaUrl({
      url: metadata.canonicalUrl,
      mode: "video",
      language: "en",
      libraryDirectory: this.root,
      inheritYtDlpConfig: false,
      refresh,
      signal: controller.signal,
    }, this.dependencies(self)).then((archived) => archived.status, outcomeOf);
    current = { controller, result, capture: deferred(), sync: deferred(), stop: deferred(), at: null, outcome: null };
    return this.settle(process, current, await this.advance(current));
  }

  private waiting(process: string, stop: Stop): Run | null {
    const run = this.live.get(process);
    return run?.at === stop ? run : null;
  }

  async captureDone(process: string, content: string): Promise<string | null> {
    const run = this.waiting(process, "capture");
    if (run === null) return null;
    run.capture.resolve(content);
    return this.settle(process, run, await this.advance(run));
  }

  async promote(process: string): Promise<string | null> {
    const run = this.waiting(process, "sync");
    if (run === null) return null;
    run.sync.resolve(undefined);
    return this.settle(process, run, await this.advance(run));
  }

  cancel(process: string): boolean {
    const run = this.live.get(process);
    if (run === undefined) return false;
    run.controller.abort();
    return true;
  }

  /** The process dies at its gate. A lock it owned now names a dead PID. */
  async crash(process: string, ownedLock: boolean): Promise<boolean> {
    const run = this.live.get(process);
    if (run === undefined) return false;
    this.live.delete(process);
    this.abandoned.push(run);
    if (ownedLock) {
      const owner = JSON.parse(await readFile(this.lockFile, "utf8")) as Record<string, unknown>;
      await writeFile(this.lockFile, `${JSON.stringify({ ...owner, pid: this.dead })}\n`);
    }
    return true;
  }

  async stale(): Promise<void> {
    const past = new Date(Date.now() - STALE_AGE_MS);
    await utimes(this.lockFile, past, past);
  }

  private async head(): Promise<string> {
    const leaves = (await readdir(this.revisionParent)).toSorted(compareUtf8);
    const leaf = leaves.at(-1);
    if (leaf === undefined) throw new Error("the lineage has no head to damage");
    return join(this.revisionParent, leaf);
  }

  /** A power loss after the rename but before the capture's bytes reached disk. */
  async tear(): Promise<void> {
    const capture = join(await this.head(), "data", "capture", "media.webm");
    await chmod(capture, 0o600);
    await writeFile(capture, "");
  }

  async stray(): Promise<void> {
    await writeFile(join(await this.head(), ".DS_Store"), "finder");
  }

  async observe(): Promise<Observed> {
    const revisions: ObservedRevision[] = [];
    for (const leaf of (await listOrEmpty(this.revisionParent)).toSorted(compareUtf8)) {
      const directory = join(this.revisionParent, leaf);
      const bytes = await readFile(join(directory, "data", "capture", "media.webm"), "utf8").catch(() => null);
      let assetKey: unknown = null;
      try {
        assetKey = (JSON.parse(await readFile(join(directory, "wrench-media.json"), "utf8")) as Record<string, unknown>)["assetKey"];
      } catch {
        assetKey = null;
      }
      const own = typeof assetKey === "string" && leaf.endsWith(`-${assetKey}`);
      const stray = await exists(join(directory, ".DS_Store"));
      revisions.push({
        state: bytes === null || !own ? "foreign" : stray ? "stray" : bytes === "" ? "torn" : "ok",
        content: bytes === "media-A" ? "A" : bytes === "media-B" ? "B" : "",
      });
    }
    return {
      revisions,
      quarantined: (await listOrEmpty(join(this.root, ".wrench-media-quarantine"))).length,
      lock: await exists(this.lockFile),
      staging: await exists(this.stagingItem),
    };
  }

  /** Fail every gate a trace left closed, wait for each run, and remove the library. */
  async close(): Promise<void> {
    const runs = [...this.live.values(), ...this.abandoned];
    for (const run of runs) {
      run.capture.reject(new Error("the replay ended"));
      run.sync.reject(new Error("the replay ended"));
    }
    await Promise.allSettled(runs.map(async (run) => await run.result));
    await rm(this.root, { recursive: true, force: true });
  }
}

async function listOrEmpty(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

type ObservedRevision = Readonly<{ state: string; content: string }>;
type Observed = Readonly<{ revisions: readonly ObservedRevision[]; quarantined: number; lock: boolean; staging: boolean }>;

// ---------------------------------------------------------------------------
// Model states
// ---------------------------------------------------------------------------

type ModelState = Readonly<{
  lock: string;
  lockId: bigint;
  myLock: ReadonlyMap<string, bigint>;
  phase: ReadonlyMap<string, string>;
  staging: string;
  revisions: readonly ObservedRevision[];
  quarantined: bigint;
  response: string;
  promotedWithoutLock: boolean;
  cancelledCreated: boolean;
  removedVerified: boolean;
}>;

function itfBool(value: ItfValue, label: string): boolean {
  if (value.kind !== "bool") throw new Error(`ITF ${label} must be a boolean`);
  return value.value;
}

function itfInt(value: ItfValue, label: string): bigint {
  if (value.kind !== "int") throw new Error(`ITF ${label} must be an integer`);
  return value.value;
}

function itfMap<T>(value: ItfValue, label: string, read: (entry: ItfValue, label: string) => T): ReadonlyMap<string, T> {
  if (value.kind !== "map") throw new Error(`ITF ${label} must be a map`);
  return new Map(value.entries.map(([key, entry]) => [itfString(key, `${label} key`), read(entry, `${label} value`)]));
}

function modelState(state: ItfState): ModelState {
  const revisions = itfVariable(state, "revisions");
  if (revisions.kind !== "list") throw new Error("ITF revisions must be a list");
  return {
    lock: itfString(itfVariable(state, "lock"), "lock"),
    lockId: itfInt(itfVariable(state, "lockId"), "lockId"),
    myLock: itfMap(itfVariable(state, "myLock"), "myLock", itfInt),
    phase: itfMap(itfVariable(state, "phase"), "phase", itfString),
    staging: itfString(itfVariable(state, "staging"), "staging"),
    revisions: revisions.items.map((item) => {
      const fields = itfRecord(item, ["content", "state"], "revision");
      return { content: itfString(fields.get("content")!, "revision.content"), state: itfString(fields.get("state")!, "revision.state") };
    }),
    quarantined: itfInt(itfVariable(state, "quarantined"), "quarantined"),
    response: itfString(itfVariable(state, "response"), "response"),
    promotedWithoutLock: itfBool(itfVariable(state, "promotedWithoutLock"), "promotedWithoutLock"),
    cancelledCreated: itfBool(itfVariable(state, "cancelledCreated"), "cancelledCreated"),
    removedVerified: itfBool(itfVariable(state, "removedVerified"), "removedVerified"),
  };
}

/** The model's invariants, evaluated on one recorded state. */
function safe(state: ModelState): boolean {
  const noForeignRevision = state.revisions.every((revision) => revision.state !== "foreign");
  return !state.promotedWithoutLock && !state.cancelledCreated && !state.removedVerified && noForeignRevision;
}

function owns(state: ModelState, process: string): boolean {
  return state.lock !== "none" && state.lockId === state.myLock.get(process);
}

type RecordedStep = Readonly<{ action: string; process: string | null; content: string | null; refresh: boolean | null }>;

function recordedStep(state: ItfState): RecordedStep {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const picks = itfRecord(itfVariable(state, "mbt::nondetPicks"), PICKS, "mbt::nondetPicks");
  const pick = (name: string): ItfValue | null => itfOption(picks.get(name)!, `mbt::nondetPicks.${name}`);
  const process = pick("x");
  const content = pick("c");
  const refresh = pick("refresh");
  return {
    action,
    process: process === null ? null : itfString(process, "mbt::nondetPicks.x"),
    content: content === null ? null : itfString(content, "mbt::nondetPicks.c"),
    refresh: refresh === null ? null : itfBool(refresh, "mbt::nondetPicks.refresh"),
  };
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

class ReplayDivergence extends Error {
  constructor(readonly index: number, message: string) {
    super(`state ${String(index)}: ${message}`);
  }
}

function need<T>(value: T | null, index: number, what: string): T {
  if (value === null) throw new Error(`state ${String(index)} records no ${what}`);
  return value;
}

/** Apply one recorded action and return the response the acting run gave, or "". */
async function apply(harness: Harness, step: RecordedStep, before: ModelState, index: number): Promise<string> {
  const label = `${step.action}(${String(step.process)})`;
  const refused = (): never => {
    throw new ReplayDivergence(index, `${label} found no run at the matching gate`);
  };
  switch (step.action) {
    case "start":
      return harness.start(need(step.process, index, "process"), need(step.refresh, index, "refresh"));
    case "captureDone":
      return await harness.captureDone(need(step.process, index, "process"), need(step.content, index, "content")) ?? refused();
    case "promote":
      return await harness.promote(need(step.process, index, "process")) ?? refused();
    case "cancel":
      if (!harness.cancel(need(step.process, index, "process"))) refused();
      return "";
    case "crash": {
      const process = need(step.process, index, "process");
      if (!await harness.crash(process, owns(before, process))) refused();
      return "";
    }
    case "stale":
      await harness.stale();
      return "";
    case "tear":
      await harness.tear();
      return "";
    case "stray":
      await harness.stray();
      return "";
    default:
      throw new Error(`state ${String(index)} records an unknown action ${step.action}`);
  }
}

function describeRevisions(revisions: readonly ObservedRevision[]): string {
  return `[${revisions.map((revision) => `${revision.state}${revision.state === "ok" || revision.state === "stray" ? ` ${revision.content}` : ""}`).join(", ")}]`;
}

/** A torn or foreign revision's bytes are not its content, so only state is compared for those. */
function sameRevisions(actual: readonly ObservedRevision[], expected: readonly ObservedRevision[]): boolean {
  return actual.length === expected.length && actual.every((revision, index) => {
    const model = expected[index]!;
    if (revision.state !== model.state) return false;
    return (revision.state !== "ok" && revision.state !== "stray") || revision.content === model.content;
  });
}

async function compare(harness: Harness, expected: ModelState, response: string, index: number, label: string, responseOnly: boolean): Promise<void> {
  if (response !== expected.response) {
    throw new ReplayDivergence(index, `${label} answered ${JSON.stringify(response)}, the model ${JSON.stringify(expected.response)}`);
  }
  if (responseOnly) return;
  for (const process of PROCESSES) {
    const phase = harness.phase(process);
    if (phase !== expected.phase.get(process)) {
      throw new ReplayDivergence(index, `after ${label} ${process} is ${phase}, the model ${String(expected.phase.get(process))}`);
    }
  }
  const observed = await harness.observe();
  if (!sameRevisions(observed.revisions, expected.revisions)) {
    throw new ReplayDivergence(index, `after ${label} the lineage is ${describeRevisions(observed.revisions)}, the model ${describeRevisions(expected.revisions)}`);
  }
  if (BigInt(observed.quarantined) !== expected.quarantined) {
    throw new ReplayDivergence(index, `after ${label} the quarantine holds ${String(observed.quarantined)}, the model ${expected.quarantined.toString()}`);
  }
  if (observed.lock !== (expected.lock !== "none")) {
    throw new ReplayDivergence(index, `after ${label} the lock file ${observed.lock ? "exists" : "is absent"}, the model lock is ${expected.lock}`);
  }
  if (observed.staging !== (expected.staging !== "")) {
    throw new ReplayDivergence(index, `after ${label} the staging item ${observed.staging ? "exists" : "is absent"}, the model staging is ${JSON.stringify(expected.staging)}`);
  }
}

/**
 * Drive production through `trace`, failing at the first divergence. At
 * `lastIndex`, when given, only the response is compared and the replay stops.
 */
async function replay(trace: ItfTrace, dead: number, defect: Defect = "none", lastIndex?: number): Promise<void> {
  const [initial, ...steps] = trace.states;
  if (initial === undefined) throw new Error("A trace needs its initial state");
  if (recordedStep(initial).action !== "init") throw new Error("A trace must start with the init action");
  const harness = await Harness.create(dead);
  lockDefect = defect;
  try {
    let before = modelState(initial);
    await compare(harness, before, "", 0, "init", false);
    for (const state of steps) {
      if (lastIndex !== undefined && state.index > lastIndex) break;
      const step = recordedStep(state);
      const response = await apply(harness, step, before, state.index);
      const expected = modelState(state);
      await compare(harness, expected, response, state.index, `${step.action}(${String(step.process)})`, state.index === lastIndex);
      before = expected;
    }
  } finally {
    lockDefect = "none";
    await harness.close();
  }
}

async function divergence(trace: ItfTrace, dead: number, defect: Defect = "none", lastIndex?: number): Promise<ReplayDivergence | null> {
  try {
    await replay(trace, dead, defect, lastIndex);
    return null;
  } catch (error) {
    if (error instanceof ReplayDivergence) return error;
    throw error;
  }
}

async function mediaModel(): Promise<QuintModel> {
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
  const model = await mediaModel();
  const cached = cache.get(step) ?? generateTraces(model, step);
  cache.set(step, cached);
  return cached;
}

describe("media.qnt ITF replay", () => {
  const realSetInterval = globalThis.setInterval;
  let dead = 0;

  beforeAll(async () => {
    dead = deadPid();
    // Only the model's `stale` action ages a lock during a replay.
    globalThis.setInterval = ((handler: () => void, timeout?: number) =>
      realSetInterval(handler, timeout === HEARTBEAT_MS ? 2 ** 31 - 1 : timeout)) as unknown as typeof setInterval;
    await mock.module(LOCK_MODULE, () => ({ ...productionLock, acquireItemLock: acquireWithDefect }));
  });

  afterAll(async () => {
    globalThis.setInterval = realSetInterval;
    await mock.module(LOCK_MODULE, () => productionLock);
  });

  test("replays every seeded model trace through production mediaUrl and its item lock", async () => {
    const model = await mediaModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-media-replay.test.ts");
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const actions = new Set<string>();
    const covered = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      const failure = await divergence(trace, dead);
      expect(failure?.message ?? null).toBeNull();
      for (const state of trace.states.slice(1)) {
        const { action } = recordedStep(state);
        const { response } = modelState(state);
        actions.add(action);
        if (response !== "") covered.add(`${action}:${response}`);
      }
    }
    expect([...actions].sort()).toEqual(ACTIONS);
    for (const outcome of [
      "start:busy", "start:existing", "start:invalid",
      "captureDone:cancelled", "captureDone:existing", "captureDone:failed",
      "promote:busy", "promote:cancelled", "promote:created",
    ]) expect(covered).toContain(outcome);
  });

  for (const defect of ["unfenced", "lateCancel"] as const) {
    test(`an item lock with the seeded ${defect} defect diverges from the model traces`, async () => {
      const model = await mediaModel();
      let diverged = 0;
      for (const trace of await traces(model.step)) {
        const failure = await divergence(trace, dead, defect);
        if (failure === null) continue;
        diverged += 1;
        // The defect goes past the check that production makes at the rename.
        expect(failure.message).toMatch(/^state \d+: promote\([pq]\) answered "(created|cancelled|failed)", the model "(busy|cancelled)"$/u);
      }
      expect(diverged).toBeGreaterThan(0);
    });
  }

  const MUTANTS: Readonly<Record<string, Defect | null>> = {
    stepUnfenced: "unfenced",
    stepLateCancel: "lateCancel",
    stepQuarantineAny: null,
  };
  for (const [mutant, defect] of Object.entries(MUTANTS)) {
    test(`production refuses every ${mutant} trace that breaks an invariant${defect === null ? "" : `, and the ${defect} defect reproduces it`}`, async () => {
      const model = await mediaModel();
      expect(model.mutants.map((entry) => entry.step)).toContain(mutant);
      let violating = 0;
      for (const trace of await traces(mutant)) {
        const firstUnsafe = trace.states.findIndex((state) => !safe(modelState(state)));
        if (firstUnsafe < 0) continue;
        violating += 1;
        const failure = await divergence(trace, dead);
        expect(failure).not.toBeNull();
        expect(failure!.index).toBeLessThanOrEqual(firstUnsafe);
        if (defect !== null) {
          // The pre-fix lock follows the mutant up to and including the state
          // where it breaks the invariant.
          const reproduced = await divergence(trace, dead, defect, firstUnsafe);
          expect(reproduced?.message ?? null).toBeNull();
        }
      }
      expect(violating).toBeGreaterThan(0);
    });
  }

  test("an unknown action or a missing pick fails closed instead of skipping a step", async () => {
    const none = { tag: "None", value: { "#tup": [] } };
    const initial = {
      "#meta": { index: 0 },
      base: { "#map": [["p", ""], ["q", ""]] },
      cancelled: { "#map": [["p", false], ["q", false]] },
      cancelledCreated: false,
      content: { "#map": [["p", ""], ["q", ""]] },
      lock: "none",
      lockId: { "#bigint": "0" },
      myLock: { "#map": [["p", { "#bigint": "0" }], ["q", { "#bigint": "0" }]] },
      nextLockId: { "#bigint": "1" },
      phase: { "#map": [["p", "idle"], ["q", "idle"]] },
      promotedWithoutLock: false,
      quarantined: { "#bigint": "0" },
      removedVerified: false,
      response: "",
      revisions: [],
      staging: "",
      "mbt::actionTaken": "init",
      "mbt::nondetPicks": { c: none, refresh: none, x: none },
    };
    const trace = (action: string, x: unknown): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [
        initial,
        {
          ...initial,
          "#meta": { index: 1 },
          "mbt::actionTaken": action,
          "mbt::nondetPicks": { c: none, refresh: { tag: "Some", value: false }, x },
        },
      ],
    }));
    const p = { tag: "Some", value: "p" };
    await expect(divergence(trace("steal", p), dead)).rejects.toThrow("unknown action steal");
    await expect(divergence(trace("start", none), dead)).rejects.toThrow("records no process");
    expect((await divergence(trace("promote", p), dead))?.message).toBe("state 1: promote(p) found no run at the matching gate");
  });
});
