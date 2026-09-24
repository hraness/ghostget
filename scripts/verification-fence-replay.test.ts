/**
 * ITF trace replay for `verification/quint/fence.qnt`, the confirmed-write
 * intent fence with duplicate-risk successors.
 *
 * Every trace drives production one recorded action at a time, twice:
 *
 * 1. Through the pure fence cores over an in-memory store:
 *    - run journals through `initialRunJournal` and `transitionRunJournal`,
 *      including the `duplicate-successor-claimed` election;
 *    - the journal scan through `intentFenceBlocker` and `journalFencesIntent`;
 *    - the intent ledger's name through `intentLedgerPath`;
 *    - a blocked confirm's outcome through `priorRunDisposition`, the decision
 *      the confirmed-write program makes;
 *    - an applied reconciliation through `reconciledRecoveryRelease`.
 *    The ledger is a map from `intentLedgerPath` to its holder with the
 *    exclusive-create rule of `acquireLedger`. This world also hosts the
 *    seeded pre-fix defects.
 * 2. Through the file-backed state layer on a real state home, where every
 *    effect goes through the state helper and `node:fs`, the production
 *    `StatePort`:
 *    - journals through `createRunJournal`, `updateRunJournal`, and
 *      `listRunJournalSnapshots`;
 *    - the claim through `acquireConfirmedWriteLedgers`, the intent fence and
 *      hash-keyed ledger claim the confirmed-write platform makes;
 *    - a lost outcome as an owner crash that `repairInterruptedRunJournals`
 *      settles, and every terminal journal's receipt and ledgers through the
 *      same repair pass;
 *    - an applied reconciliation through `releaseReconciledRunRecovery`.
 *
 * A not-applied claim changes no journal in either world, as
 * `recordNotAppliedClaim` changes none. What neither world drives is listed in
 * the claims register's not-verified entries for this model.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

import { canonicalJson, sha256 } from "../src/canonical-json.js";
import type { ConfirmedWriteIntent, LedgerEntry } from "../src/confirmed-write-model.js";
import { priorRunDisposition } from "../src/confirmed-write-program.js";
import { currentProcessStartIdentity } from "../src/process-identity.js";
import {
  createRunJournal,
  initialRunJournal,
  listRunJournalSnapshots,
  readRunJournal,
  transitionRunJournal,
  updateRunJournal,
  type RunJournal,
  type RunJournalEvent,
} from "../src/run-journal.js";
import {
  acquireConfirmedWriteLedgers,
  confirmedWriteLedgerPath,
  intentFenceBlocker,
  intentLedgerPath,
  readRunReceipt,
  reconciledRecoveryRelease,
  releaseReconciledRunRecovery,
  repairInterruptedRunJournals,
  runJournalLedgerEntry,
} from "../src/runtime.js";
import { ghostgetStateHome, writePrivateJsonIfUnchanged } from "../src/storage.js";
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
  "applied", "authGen", "claimed", "dispatched", "elected", "ledger", "ledgerState", "mbt::actionTaken",
  "mbt::nondetPicks", "phase", "reconciled", "result", "rev", "runAuth", "runRev", "scanned", "source", "status",
].sort();
const ACTIONS = [
  "scan", "scanSuccessor", "claim", "dispatch", "finish", "reconnect", "upgrade", "reconcile", "claimNotApplied",
] as const;
type Action = (typeof ACTIONS)[number];
const MUTANT_STEPS = ["stepHashKeyed", "stepCallerRelease", "stepUnelected", "stepElectInFlight"] as const;

const RUN_IDS: Readonly<Record<string, string>> = Object.freeze({
  r1: "11111111-1111-4111-8111-111111111111",
  r2: "22222222-2222-4222-8222-222222222222",
  r3: "33333333-3333-4333-8333-333333333333",
});
const RUN_LABELS: ReadonlyMap<string, string> = new Map(Object.entries(RUN_IDS).map(([label, id]) => [id, label]));
const ADAPTER_ID = "fence-provider";
const AUTH_ID = "fence-main";
// Duplicate-risk successors exist only for one-dispatch authenticated-session
// posts.publish writes, so every replayed run is one.
const OPERATION = "posts.publish";
const INPUT_HASH = sha256("fence-replay-input");
const STARTED_AT = Date.parse("2026-09-23T00:00:00.000Z");
const FAR_FUTURE = "2100-01-01T00:00:00.000Z";
const DEAD_OWNER = { pid: 2_147_483_647, bootId: "f".repeat(64), processStartId: "0".repeat(64) } as const;

const scratch = mkdtempSync(join(tmpdir(), "ghostget-fence-replay-"));
const memoryEnvironment = Object.freeze({ GHOSTGET_STATE_HOME: join(scratch, "memory") });
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * Seeded defects in the in-memory world around the production cores:
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
  source: ReadonlyMap<string, string>;
  elected: ReadonlyMap<string, string>;
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

function labelOf(runId: string): string {
  const label = RUN_LABELS.get(runId);
  if (label === undefined) throw new Error(`run ${runId} is not a replayed run`);
  return label;
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

/** Whether a source journal may elect a duplicate-risk successor, as `resolveInvocationDuplicateRisk` checks it. */
function electable(journal: RunJournal | undefined): journal is RunJournal {
  return journal !== undefined
    && journal.operation === "posts.publish"
    && journal.phase === "terminal"
    && journal.status === "indeterminate"
    && journal.dispatch.planned === 1
    && journal.dispatch.started === 1
    && journal.ledgerState === "indeterminate"
    && journal.recoveryState === "retained"
    && journal.duplicateSuccessor === undefined;
}

type Claim =
  | Readonly<{ acquired: true; ledgerRelativePath: string }>
  | Readonly<{ acquired: false; existing: LedgerEntry }>;

/** Where a world keeps its journals and ledgers. */
interface FenceStore {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly owner: RunJournal["owner"];
  list(): readonly RunJournal[];
  get(runId: string): RunJournal | undefined;
  create(journal: RunJournal): void;
  record(runId: string, event: RunJournalEvent): void;
  claim(journal: RunJournal, intent: ConfirmedWriteIntent, entry: LedgerEntry, at: Date): Claim;
  /** A dispatch whose outcome never arrives. */
  lose(runId: string, at: Date): void;
  settle(runId: string, at: Date): void;
  release(runId: string): void;
  /** Intent ledger holders by run ID, and the number of intent ledger names. */
  ledgers(): Readonly<{ holders: ReadonlySet<string>; names: number }>;
  afterStep(at: Date): void;
}

/** The pure cores over maps. */
class MemoryStore implements FenceStore {
  readonly environment = memoryEnvironment;
  readonly owner = {
    pid: 4242,
    token: "44444444-4444-4444-8444-444444444444",
    bootId: "1".repeat(64),
    processStartId: "2".repeat(64),
    leaseUntil: FAR_FUTURE,
  };
  private readonly journals = new Map<string, RunJournal>();
  private readonly ledger = new Map<string, string>();

  list(): readonly RunJournal[] {
    return [...this.journals.values()];
  }

  get(runId: string): RunJournal | undefined {
    return this.journals.get(runId);
  }

  create(journal: RunJournal): void {
    this.journals.set(journal.runId, journal);
  }

  record(runId: string, event: RunJournalEvent): void {
    const journal = this.journals.get(runId);
    if (journal === undefined) throw new Error(`${runId} has no journal`);
    this.journals.set(runId, transitionRunJournal(journal, event));
  }

  claim(journal: RunJournal, intent: ConfirmedWriteIntent, _entry: LedgerEntry, _at: Date): Claim {
    const path = intentLedgerPath(
      intent.adapterId, intent.authId, intent.operationId, journal.inputHash, this.environment, intent.duplicateIntentHash,
    );
    const holder = this.ledger.get(path);
    if (holder !== undefined) return { acquired: false, existing: runJournalLedgerEntry(this.journals.get(holder)!) };
    this.ledger.set(path, journal.runId);
    const bucket = sha256(`${journal.adapter.hash}\0${journal.auth.hash}\0${journal.inputHash}`);
    return { acquired: true, ledgerRelativePath: `idempotency/${bucket.slice(0, 2)}/${bucket}.json` };
  }

  lose(runId: string, at: Date): void {
    this.record(runId, {
      type: "finished", status: "indeterminate", finalOrigin: null,
      error: "a dispatch crossed its durable start boundary; a missing final outcome requires reconciliation", at: at.toISOString(),
    });
  }

  settle(runId: string, at: Date): void {
    this.record(runId, reconciledRecoveryRelease(this.get(runId)!, at));
  }

  release(runId: string): void {
    for (const [path, holder] of this.ledger) if (holder === runId) this.ledger.delete(path);
  }

  ledgers(): Readonly<{ holders: ReadonlySet<string>; names: number }> {
    return { holders: new Set(this.ledger.values()), names: this.ledger.size };
  }

  afterStep(): void {}
}

/** The file-backed state layer on a real state home. */
class FileStore implements FenceStore {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly owner: RunJournal["owner"];
  private readonly home: string;

  constructor() {
    this.home = mkdtempSync(join(scratch, "state-"));
    this.environment = Object.freeze({ GHOSTGET_STATE_HOME: this.home });
    // The owner is this live process, so the repair pass after each step
    // leaves every in-flight run alone until the trace loses its outcome.
    this.owner = {
      pid: process.pid,
      token: "55555555-5555-4555-8555-555555555555",
      ...currentProcessStartIdentity(),
      leaseUntil: FAR_FUTURE,
    };
  }

  list(): readonly RunJournal[] {
    return listRunJournalSnapshots(this.environment).map((entry) => {
      if ("invalid" in entry) throw new ReplayDivergence(`run journal ${entry.runId} is invalid on disk`);
      return entry.journal;
    });
  }

  get(runId: string): RunJournal | undefined {
    return readRunJournal(runId, this.environment)?.journal;
  }

  create(journal: RunJournal): void {
    createRunJournal(journal, this.environment);
  }

  record(runId: string, event: RunJournalEvent): void {
    const snapshot = readRunJournal(runId, this.environment);
    if (snapshot === null) throw new Error(`${runId} has no journal on disk`);
    updateRunJournal(snapshot, event, this.environment);
  }

  claim(journal: RunJournal, intent: ConfirmedWriteIntent, entry: LedgerEntry, at: Date): Claim {
    const path = confirmedWriteLedgerPath(
      journal.adapter.hash, journal.auth.hash, journal.operation, journal.inputHash, this.environment, intent.duplicateIntentHash,
    );
    const claimed = acquireConfirmedWriteLedgers({ path, entry, intent }, this.environment, at);
    if (!claimed.acquired) {
      if (!("viaIntent" in claimed)) {
        throw new ReplayDivergence(`the hash-keyed ledger refused ${labelOf(journal.runId)} after its intent claim`);
      }
      return { acquired: false, existing: claimed.existing };
    }
    // relativeStatePath: the ledger path is relative to the canonical state home.
    return { acquired: true, ledgerRelativePath: relative(ghostgetStateHome(this.environment), claimed.snapshot.path).split(sep).join("/") };
  }

  /** The owner dies inside its dispatch; the repair pass settles the journal. */
  lose(runId: string, at: Date): void {
    const snapshot = readRunJournal(runId, this.environment);
    if (snapshot === null) throw new Error(`${runId} has no journal on disk`);
    const written = writePrivateJsonIfUnchanged(
      join(this.home, "run-journals", `${runId}.json`),
      { ...snapshot.journal, owner: { ...snapshot.journal.owner, ...DEAD_OWNER } },
      { expectedCurrentContentSha256: snapshot.contentSha256 },
    );
    if (!written) throw new Error(`${runId} changed while its owner crashed`);
    const report = repairInterruptedRunJournals(this.environment, at);
    if (report.repaired !== 1 || report.issues.length !== 0) {
      throw new ReplayDivergence(`repair after ${labelOf(runId)} crashed reported ${JSON.stringify(report)}`);
    }
  }

  settle(runId: string, at: Date): void {
    const receipt = readRunReceipt(runId, this.environment);
    const settled = releaseReconciledRunRecovery(runId, sha256(canonicalJson(receipt)), this.environment, at);
    if (settled !== "journal-released") throw new ReplayDivergence(`reconciling ${labelOf(runId)} returned ${settled}`);
  }

  release(): void {
    throw new Error("the file-backed world hosts no seeded defect");
  }

  ledgers(): Readonly<{ holders: ReadonlySet<string>; names: number }> {
    const root = join(this.home, "idempotency", "intents");
    const holders = new Set<string>();
    let names = 0;
    if (!existsSync(root)) return { holders, names };
    const journals = new Map(this.list().map((journal) => [journal.runId, journal]));
    for (const bucket of readdirSync(root)) {
      for (const name of readdirSync(join(root, bucket))) {
        const entry = JSON.parse(readFileSync(join(root, bucket, name), "utf8")) as { runId: string; status: string };
        names += 1;
        holders.add(entry.runId);
        // Projection keeps each terminal run's intent ledger in step with its journal.
        const journal = journals.get(entry.runId);
        if (journal?.phase === "terminal" && journal.ledgerState !== entry.status) {
          throw new ReplayDivergence(`${labelOf(entry.runId)}'s intent ledger says ${entry.status} and its journal ${journal.ledgerState}`);
        }
      }
    }
    return { holders, names };
  }

  /** Every step ends with the repair pass a later process would run. */
  afterStep(at: Date): void {
    const report = repairInterruptedRunJournals(this.environment, at);
    if (report.repaired !== 0 || report.issues.length !== 0) {
      throw new ReplayDivergence(`the repair pass reported ${JSON.stringify(report)}`);
    }
  }
}

class FenceWorld {
  private readonly scanned = new Set<string>();
  private readonly applied = new Set<string>();
  private readonly claims = new Set<string>();
  private readonly store: FenceStore;
  private authGen = 0;
  private rev = 0;
  private clock = 0;
  private result = "none";

  constructor(private readonly defect: Defect = "none", store?: FenceStore) {
    this.store = store ?? new MemoryStore();
    if (defect !== "none" && !(this.store instanceof MemoryStore)) throw new Error("seeded defects live in the in-memory world");
  }

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

  private journal(run: string): RunJournal {
    const journal = this.store.get(RUN_IDS[run]!);
    if (journal === undefined) throw new Error(`${run} has no journal`);
    return journal;
  }

  private record(run: string, event: RunJournalEvent): void {
    this.store.record(RUN_IDS[run]!, event);
  }

  private bound(journal: RunJournal): boolean {
    return journal.auth.hash === hashFor("auth", this.authGen) && journal.adapter.hash === hashFor("manifest", this.rev);
  }

  /** The intent a journal belongs to. */
  private intentOf(journal: RunJournal): ConfirmedWriteIntent {
    return {
      adapterId: journal.adapter.id, authId: journal.auth.id, operationId: journal.operation, inputHashes: [journal.inputHash],
      ...(journal.duplicateIntent === undefined ? {} : { duplicateIntentHash: journal.duplicateIntent.intentHash }),
    };
  }

  private refuse(run: string, existing: LedgerEntry): void {
    const journal = this.journal(run);
    const disposition = priorRunDisposition(
      { existing, viaIntent: true },
      { inputHash: journal.inputHash, adapterHash: journal.adapter.hash, authHash: journal.auth.hash, authId: journal.auth.id },
    );
    this.result = blockedResult(disposition);
    this.scanned.delete(run);
    this.record(run, { type: "finished", status: "failed", finalOrigin: null, error: "another run already owns this idempotency scope", at: this.at() });
  }

  /** Whether production may apply `action` to `run` (with successor source `source`) now; mutant replay skips the rest. */
  admits(action: Action, run: string, source: string): boolean {
    const journal = this.store.get(RUN_IDS[run]!);
    switch (action) {
      case "scan": return journal === undefined;
      case "scanSuccessor": {
        if (journal !== undefined || source === run) return false;
        const origin = this.store.get(RUN_IDS[source]!);
        return electable(origin) && this.bound(origin);
      }
      case "claim": return journal?.phase === "prepared" && this.scanned.has(run);
      case "dispatch": {
        if (journal?.phase !== "claimed") return false;
        if (journal.duplicateIntent === undefined) return true;
        // claimDuplicateRiskSource elects only an unchanged, unelected source.
        const origin = this.store.get(journal.duplicateIntent.sourceRunId);
        return origin !== undefined && origin.duplicateSuccessor === undefined && origin.recoveryState === "retained";
      }
      case "finish": return journal?.phase === "dispatching";
      case "reconnect": case "upgrade": return true;
      case "reconcile":
        // releaseReconciledRunRecovery retains a source that elected a successor.
        return journal?.status === "indeterminate" && journal.recoveryState !== "released" && this.bound(journal)
          && journal.duplicateSuccessor === undefined;
      case "claimNotApplied":
        return journal?.status === "indeterminate" && journal.recoveryState !== "released" && this.bound(journal);
    }
  }

  private start(run: string, source: string | null): void {
    const started = this.now().toISOString();
    const authHash = hashFor("auth", this.authGen);
    const adapterHash = hashFor("manifest", this.rev);
    const duplicateIntent = source === null ? undefined : {
      schemaVersion: 1 as const,
      intentHash: sha256(`fence-successor\0${RUN_IDS[source]!}\0${authHash}\0${adapterHash}`),
      sourceRunId: RUN_IDS[source]!,
    };
    const journal = transitionRunJournal(initialRunJournal({
      runId: RUN_IDS[run]!,
      planDigest: sha256(`plan-${run}`),
      adapter: { id: this.adapterId(this.rev), version: `1.${String(this.rev)}.0`, hash: adapterHash },
      operation: OPERATION,
      risk: "R3",
      inputHash: INPUT_HASH,
      auth: { id: this.authId(this.authGen), hash: authHash, kind: "browser-profile" },
      contract: { transport: "web-session-api", hash: sha256("fence-contract") },
      ...(duplicateIntent === undefined ? {} : { duplicateIntent }),
      plannedDispatches: 1,
      hasPlanAssets: false,
      owner: this.store.owner,
      startedAt: started,
      dedupeExpiresAt: FAR_FUTURE,
    }), { type: "confirmation-consumed", at: started });
    this.store.create(journal);
    const blocker = intentFenceBlocker(this.store.list(), this.intentOf(journal), journal.runId, this.now());
    if (blocker !== null) {
      this.refuse(run, runJournalLedgerEntry(blocker));
    } else {
      this.scanned.add(run);
      this.result = "clear";
    }
  }

  apply(action: Action, run: string, outcome: string, source: string): void {
    this.step(action, run, outcome, source);
    this.store.afterStep(this.now());
  }

  private step(action: Action, run: string, outcome: string, source: string): void {
    switch (action) {
      case "scan":
        this.start(run, null);
        return;
      case "scanSuccessor":
        this.start(run, source);
        return;
      case "claim": {
        const journal = this.journal(run);
        const entry: LedgerEntry = {
          ...runJournalLedgerEntry({ ...journal, ledgerState: "pending" }),
          status: "pending",
        };
        const claimed = this.store.claim(journal, this.intentOf(journal), entry, this.now());
        if (!claimed.acquired) {
          this.refuse(run, claimed.existing);
          return;
        }
        this.scanned.delete(run);
        this.record(run, { type: "ledger-claimed", ledgerRelativePath: claimed.ledgerRelativePath, at: this.at() });
        this.result = "claimed";
        return;
      }
      case "dispatch": {
        const journal = this.journal(run);
        this.record(run, { type: "recovery-stored", at: this.at() });
        if (journal.duplicateIntent !== undefined) {
          // claimDuplicateRiskSource elects the source before the successor's dispatch boundary.
          this.store.record(journal.duplicateIntent.sourceRunId, {
            type: "duplicate-successor-claimed", intentHash: journal.duplicateIntent.intentHash, runId: journal.runId, at: this.at(),
          });
        }
        this.record(run, { type: "dispatch-started", index: 1, at: this.at() });
        this.result = journal.duplicateIntent === undefined ? "dispatched" : "elected";
        return;
      }
      case "finish":
        if (outcome === "succeeded") {
          this.record(run, { type: "dispatch-verified", index: 1, at: this.at() });
          this.record(run, { type: "finished", status: "succeeded", finalOrigin: null, error: null, at: this.at() });
        } else if (outcome === "lost") {
          this.store.lose(RUN_IDS[run]!, this.now());
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
        this.store.settle(journal.runId, this.now());
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
          // The pre-fix reconciler released the journal too, except where the
          // journal itself refuses: a source that elected a successor.
          if (journal.duplicateSuccessor === undefined) {
            this.record(run, { type: "recovery-released", outcome: "not-applied", at: this.at() });
          }
          this.store.release(journal.runId);
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
    const source = new Map<string, string>();
    const elected = new Map<string, string>();
    const dispatched = new Set<string>();
    const reconciled = new Set<string>();
    const journals = new Map(this.store.list().map((journal) => [journal.runId, journal]));
    for (const run of RUNS) {
      const journal = journals.get(RUN_IDS[run]!);
      phase.set(run, journal?.phase ?? "none");
      status.set(run, journal?.status ?? "none");
      ledgerState.set(run, journal?.ledgerState ?? "none");
      elected.set(run, journal?.duplicateSuccessor === undefined ? "" : labelOf(journal.duplicateSuccessor.runId));
      if (journal === undefined) continue;
      runAuth.set(run, generationOf(journal.auth.hash, "auth"));
      runRev.set(run, generationOf(journal.adapter.hash, "manifest"));
      source.set(run, journal.duplicateIntent === undefined ? "" : labelOf(journal.duplicateIntent.sourceRunId));
      if (journal.dispatch.started > 0) dispatched.add(run);
      if (journal.status === "indeterminate" && journal.recoveryState === "released") reconciled.add(run);
    }
    const ledgers = this.store.ledgers();
    return {
      phase, status, ledgerState, runAuth, runRev, source, elected,
      authGen: this.authGen,
      rev: this.rev,
      scanned: new Set(this.scanned),
      ledgerHolders: new Set([...ledgers.holders].map(labelOf)),
      ledgerNames: ledgers.names,
      dispatched,
      applied: new Set(this.applied),
      reconciled,
      claimed: new Set(this.claims),
      result: this.result,
    };
  }

  phaseOf(run: string): string {
    return this.store.get(RUN_IDS[run]!)?.phase ?? "none";
  }
}

function modelState(state: ItfState): Snapshot {
  const ledger = itfVariable(state, "ledger");
  if (ledger.kind !== "set") throw new Error("ITF ledger must be a set");
  const entries = ledger.items.map((item) => {
    if (item.kind !== "tuple" || item.items.length !== 4) throw new Error("ITF ledger entries must be 4-tuples");
    const [auth, revision, source, holder] = item.items as readonly [ItfValue, ItfValue, ItfValue, ItfValue];
    return {
      key: `${String(itfInt(auth, "ledger auth key"))}/${String(itfInt(revision, "ledger revision key"))}/${itfString(source, "ledger source key")}`,
      holder: itfString(holder, "ledger holder"),
    };
  });
  const phase = itfStringMap(itfVariable(state, "phase"), "phase", itfString);
  // A run without a journal has no binding or source to compare.
  const journaled = <T>(all: ReadonlyMap<string, T>): ReadonlyMap<string, T> =>
    new Map([...all].filter(([run]) => phase.get(run) !== "none"));
  return {
    phase,
    status: itfStringMap(itfVariable(state, "status"), "status", itfString),
    ledgerState: itfStringMap(itfVariable(state, "ledgerState"), "ledgerState", itfString),
    runAuth: journaled(itfStringMap(itfVariable(state, "runAuth"), "runAuth", itfInt)),
    runRev: journaled(itfStringMap(itfVariable(state, "runRev"), "runRev", itfInt)),
    source: journaled(itfStringMap(itfVariable(state, "source"), "source", itfString)),
    elected: itfStringMap(itfVariable(state, "elected"), "elected", itfString),
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

/**
 * The first clause of the model's `fenceSafety` that `state` breaks, or null:
 * effects stay within one plus the elected successors, each intent dispatches
 * at most once, only an indeterminate run elects a successor, and an
 * indeterminate run keeps its ledger.
 */
function safetyViolation(state: Snapshot): string | null {
  const elected = [...state.elected.values()].filter((successor) => successor !== "").length;
  if (state.dispatched.size > 1 + elected) return `${String(state.dispatched.size)} dispatches with ${String(elected)} elected successors`;
  for (const run of state.applied) if (!state.dispatched.has(run)) return `${run} applied without a dispatch`;
  for (const key of ["", ...RUNS]) {
    const runs = [...state.dispatched].filter((run) => (state.source.get(run) ?? "") === key);
    if (runs.length > 1) return `the intent ${key === "" ? "base" : `successor of ${key}`} dispatched ${runs.sort().join(", ")}`;
  }
  for (const [run, successor] of state.elected) {
    if (successor !== "" && state.status.get(run) !== "indeterminate") return `${run} elected ${successor} while ${String(state.status.get(run))}`;
  }
  for (const [run, status] of state.status) {
    if (status === "indeterminate" && state.ledgerState.get(run) !== "indeterminate") return `${run} is indeterminate without its ledger`;
  }
  return null;
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

type RecordedStep = Readonly<{ action: string; run: string | null; outcome: string | null; source: string | null }>;

function recordedStep(state: ItfState): RecordedStep {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  const picks = itfRecord(itfVariable(state, "mbt::nondetPicks"), ["r", "o", "s"], "mbt::nondetPicks");
  const pick = (name: string): string | null => {
    const value = itfOption(picks.get(name)!, `mbt::nondetPicks.${name}`);
    return value === null ? null : itfString(value, `mbt::nondetPicks.${name}`);
  };
  return { action, run: pick("r"), outcome: pick("o"), source: pick("s") };
}

function operation(state: ItfState): Readonly<{ action: Action; run: string; outcome: string; source: string }> {
  const { action, run, outcome, source } = recordedStep(state);
  if (!(ACTIONS as readonly string[]).includes(action) || run === null || outcome === null || source === null) {
    throw new Error(`state ${String(state.index)} records an unknown action or a missing pick`);
  }
  if (![run, source].every((name) => (RUNS as readonly string[]).includes(name)) || !(OUTCOMES as readonly string[]).includes(outcome)) {
    throw new Error(`state ${String(state.index)} picks an unknown run or outcome`);
  }
  return { action: action as Action, run, outcome, source };
}

function label(action: string, run: string, outcome: string, source: string): string {
  if (action === "reconnect" || action === "upgrade") return action;
  if (action === "finish") return `finish(${run}, ${outcome})`;
  if (action === "scanSuccessor") return `scanSuccessor(${run} of ${source})`;
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
    const { action, run, outcome, source } = operation(state);
    const step = label(action, run, outcome, source);
    if (!world.admits(action, run, source)) {
      throw new ReplayDivergence(`state ${String(state.index)}: production does not admit ${step}`);
    }
    try {
      world.apply(action, run, outcome, source);
    } catch (error) {
      if (error instanceof ReplayDivergence) throw new ReplayDivergence(`state ${String(state.index)}: ${step}: ${error.message}`);
      throw error;
    }
    const found = difference(world.snapshot(), modelState(state));
    if (found !== null) {
      throw new ReplayDivergence(`state ${String(state.index)}: after ${step} ${found}`);
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
 * Drive production through a mutant's trace. Production keeps its own state
 * and applies each action it admits, so it may refuse a run the mutant lets
 * through. Returns every action the mutant takes that production refuses,
 * and fails if production's own state ever breaks the model's safety clauses.
 */
function refusedActions(trace: ItfTrace): readonly string[] {
  const world = new FenceWorld();
  const refused: string[] = [];
  for (const state of trace.states.slice(1)) {
    const { action, run, outcome, source } = operation(state);
    if (world.admits(action, run, source)) {
      world.apply(action, run, outcome, source);
    } else if (action === "dispatch" || action === "scanSuccessor") {
      refused.push(`state ${String(state.index)}: the mutant takes ${label(action, run, outcome, source)}, which production refuses with ${run} ${world.phaseOf(run)}`);
    }
    const broken = safetyViolation(world.snapshot());
    if (broken !== null) throw new Error(`state ${String(state.index)}: production broke fence safety: ${broken}`);
  }
  return refused;
}

const lockedModel = () => quintModel(MODEL_FILE);
const traces = quintTraceCache(MODEL_FILE);

/**
 * A restriction of `step` whose transitions are all `step` transitions. Its
 * traces reach duplicate-risk successors that fence each other, which
 * uniform sampling of `step` almost never does.
 */
const SUCCESSOR_STEP = "stepSuccessors";

describe("fence.qnt ITF replay", () => {
  test("replays every seeded model trace through the production fence cores", async () => {
    const model = await lockedModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-fence-replay.test.ts");
    expect(model.mutants.map((mutant) => mutant.step).sort()).toEqual([...MUTANT_STEPS].sort());
    const all = [...await traces(model.step), ...await traces(SUCCESSOR_STEP)];
    expect(all).toHaveLength(2 * model.replay.traces);
    const covered = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      expect(divergence(trace, new FenceWorld())).toBeNull();
      for (const state of trace.states.slice(1)) {
        const { action, run, outcome } = operation(state);
        covered.add(action === "scanSuccessor" ? `scanSuccessor(${run})` : label(action, run, outcome, run));
        covered.add(`${action} -> ${modelState(state).result}`);
        expect(safetyViolation(modelState(state))).toBeNull();
      }
    }
    const expected = [
      ...RUNS.flatMap((run) => [
        `scan(${run})`, `scanSuccessor(${run})`, `claim(${run})`, `dispatch(${run})`, `reconcile(${run})`, `claimNotApplied(${run})`,
        ...OUTCOMES.map((outcome) => `finish(${run}, ${outcome})`),
      ]),
      "reconnect", "upgrade",
      "scan -> clear", "scan -> refused", "scan -> replayed", "scan -> withheld",
      "scanSuccessor -> clear", "scanSuccessor -> refused",
      "claim -> claimed", "claim -> refused", "claim -> replayed",
      "dispatch -> dispatched", "dispatch -> elected",
    ];
    expect(expected.filter((entry) => !covered.has(entry))).toEqual([]);
  });

  test("replays every seeded model trace through the file-backed state layer", async () => {
    const model = await lockedModel();
    const all = [...await traces(model.step), ...await traces(SUCCESSOR_STEP)];
    let successors = 0;
    let crashes = 0;
    for (const trace of all) {
      expect(divergence(trace, new FenceWorld("none", new FileStore()))).toBeNull();
      for (const state of trace.states.slice(1)) {
        const { action, outcome } = operation(state);
        if (action === "dispatch" && modelState(state).result === "elected") successors += 1;
        if (action === "finish" && outcome === "lost") crashes += 1;
      }
    }
    expect(successors).toBeGreaterThan(0);
    expect(crashes).toBeGreaterThan(0);
  });

  test("a fence keyed by auth and adapter bytes diverges from the model traces", async () => {
    const model = await lockedModel();
    const all = await traces(model.step);
    const first = all.map((trace) => divergence(trace, new FenceWorld("hash-keyed-intent"))).find((message) => message !== null);
    expect(first).toMatch(/^state \d+: after (scan|scanSuccessor|claim)\(r[123]( of r[123])?\) /u);
  });

  test("a reconciler that releases on a caller's claim diverges from the model traces", async () => {
    const model = await lockedModel();
    const all = await traces(model.step);
    const first = all.map((trace) => divergence(trace, new FenceWorld("caller-release"))).find((message) => message !== null);
    expect(first).toMatch(/^state \d+: after claimNotApplied\(r[123]\) (ledgerState|ledgerHolders) is \{.*\} in production and \{.*\} in the model$/u);
  });

  for (const step of MUTANT_STEPS) {
    test(`production keeps fence safety through every ${step} trace, including those that break it`, async () => {
      const model = await lockedModel();
      expect(model.mutants).toContainEqual({ step, invariant: "fenceSafety" });
      const all = await traces(step);
      let violating = 0;
      for (const trace of all) {
        const refused = refusedActions(trace);
        const breaks = trace.states.some((state) => safetyViolation(modelState(state)) !== null);
        if (!breaks) continue;
        violating += 1;
        // A mutant that dispatches beyond the bound takes an action production
        // refuses, except an unelected successor: production elects its
        // source at the dispatch boundary. A breach of the ledger clause alone
        // needs no refusal, since production's own state keeps its ledger.
        const dispatchBreach = trace.states.some((state) => {
          const breach = safetyViolation(modelState(state));
          return breach !== null && !breach.endsWith("without its ledger");
        });
        if (dispatchBreach && step !== "stepUnelected") expect(refused.length).toBeGreaterThan(0);
        for (const message of refused) {
          expect(message).toMatch(/^state \d+: the mutant takes (dispatch\(r[123]\)|scanSuccessor\(r[123] of r[123]\)), which production refuses with r[123] (none|terminal|prepared|claimed)$/u);
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
      runAuth: runs({ "#bigint": "0" }), runRev: runs({ "#bigint": "0" }), source: runs(""), elected: runs(""),
      authGen: { "#bigint": "0" }, rev: { "#bigint": "0" },
      scanned: { "#set": [] }, ledger: { "#set": [] }, dispatched: { "#set": [] }, applied: { "#set": [] },
      reconciled: { "#set": [] }, claimed: { "#set": [] },
    };
    const trace = (action: string, r: unknown, o: unknown, s: unknown): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [
        { "#meta": { index: 0 }, ...initial, result: "none", "mbt::actionTaken": "init", "mbt::nondetPicks": { r: none, o: none, s: none } },
        {
          "#meta": { index: 1 }, ...initial, result: "reconnected", authGen: { "#bigint": "1" },
          "mbt::actionTaken": action, "mbt::nondetPicks": { r, o, s },
        },
      ],
    }));
    const some = (value: string) => ({ tag: "Some", value });
    expect(divergence(trace("reconnect", some("r1"), some("lost"), some("r2")), new FenceWorld())).toBeNull();
    expect(divergence(trace("reconnect", some("r1"), some("lost"), some("r2")), new FenceWorld("none", new FileStore()))).toBeNull();
    expect(() => divergence(trace("steal", some("r1"), some("lost"), some("r2")), new FenceWorld())).toThrow("unknown action");
    expect(() => divergence(trace("reconnect", none, some("lost"), some("r2")), new FenceWorld())).toThrow("missing pick");
    expect(() => divergence(trace("reconnect", some("r1"), some("lost"), none), new FenceWorld())).toThrow("missing pick");
    expect(() => divergence(trace("reconnect", some("r9"), some("lost"), some("r2")), new FenceWorld())).toThrow("unknown run");
    expect(() => divergence(trace("reconnect", some("r1"), some("lost"), some("r9")), new FenceWorld())).toThrow("unknown run");
    expect(divergence(trace("upgrade", some("r1"), some("lost"), some("r2")), new FenceWorld()))
      .toBe("state 1: after upgrade authGen is 0 in production and 1 in the model");
  });

  test("the safety clauses reject each seeded breach", () => {
    const base = modelStateFor({});
    expect(safetyViolation(base)).toBeNull();
    expect(safetyViolation(modelStateFor({ dispatched: ["r1", "r2"], source: { r1: "", r2: "" }, status: { r1: "indeterminate", r2: "pending" }, ledgerState: { r1: "indeterminate", r2: "pending" } })))
      .toBe("2 dispatches with 0 elected successors");
    expect(safetyViolation(modelStateFor({
      dispatched: ["r1", "r2", "r3"], source: { r1: "", r2: "r1", r3: "r1" }, elected: { r1: "r3" },
      status: { r1: "indeterminate", r2: "pending", r3: "pending" }, ledgerState: { r1: "indeterminate", r2: "pending", r3: "pending" },
    }))).toBe("3 dispatches with 1 elected successors");
    expect(safetyViolation(modelStateFor({
      dispatched: ["r1", "r2", "r3"], source: { r1: "", r2: "r1", r3: "r1" }, elected: { r1: "r3", r2: "r3" },
      status: { r1: "indeterminate", r2: "indeterminate", r3: "pending" }, ledgerState: { r1: "indeterminate", r2: "indeterminate", r3: "pending" },
    }))).toBe("the intent successor of r1 dispatched r2, r3");
    expect(safetyViolation(modelStateFor({
      dispatched: ["r1", "r2"], source: { r1: "", r2: "r1" }, elected: { r1: "r2" },
      status: { r1: "pending", r2: "pending" }, ledgerState: { r1: "pending", r2: "pending" },
    }))).toBe("r1 elected r2 while pending");
    expect(safetyViolation(modelStateFor({ applied: ["r1"] }))).toBe("r1 applied without a dispatch");
    expect(safetyViolation(modelStateFor({
      dispatched: ["r1"], source: { r1: "" }, status: { r1: "indeterminate" }, ledgerState: { r1: "released" },
    }))).toBe("r1 is indeterminate without its ledger");
  });
});

function modelStateFor(values: Readonly<{
  dispatched?: readonly string[];
  applied?: readonly string[];
  source?: Readonly<Record<string, string>>;
  elected?: Readonly<Record<string, string>>;
  status?: Readonly<Record<string, string>>;
  ledgerState?: Readonly<Record<string, string>>;
}>): Snapshot {
  const perRun = (record: Readonly<Record<string, string>> | undefined, fallback: string) =>
    new Map(RUNS.map((run) => [run, record?.[run] ?? fallback]));
  return {
    phase: perRun(undefined, "none"),
    status: perRun(values.status, "none"),
    ledgerState: perRun(values.ledgerState, "none"),
    runAuth: new Map(),
    runRev: new Map(),
    source: new Map(Object.entries(values.source ?? {})),
    elected: perRun(values.elected, ""),
    authGen: 0,
    rev: 0,
    scanned: new Set(),
    ledgerHolders: new Set(),
    ledgerNames: 0,
    dispatched: new Set(values.dispatched ?? []),
    applied: new Set(values.applied ?? []),
    reconciled: new Set(),
    claimed: new Set(),
    result: "none",
  };
}
