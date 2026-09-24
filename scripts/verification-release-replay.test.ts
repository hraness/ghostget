/**
 * ITF trace replay for `verification/quint/release.qnt` against the
 * production release validators.
 *
 * Quint writes seeded traces of Release run attempts, re-runs, publication,
 * promotion, and the canonical download. The provider state each trace state
 * holds becomes the input of the production validator that reads it:
 *
 * - a publish job's handoff is a real five-file release directory, built from
 *   one `bun pm pack` of this checkout, that `verifyPublicationHandoff` checks
 *   against a `gh attestation verify` stub serving exactly the attestations the
 *   model says exist;
 * - website promotion is `resolveReleaseAuthority` over a read-only API stub
 *   serving the synthetic run, its attempt job inventories, and the Release;
 * - the canonical download is `verifyCanonicalReleaseRun` over a `gh api` stub
 *   serving the same inventories.
 *
 * Each production verdict must equal the model's. The Release draft, resume,
 * and Latest convergence in `publishCanonicalRelease` are model-only.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  GITHUB_RELEASE_REPOSITORY,
  GITHUB_RELEASE_REPOSITORY_ID,
  GITHUB_RELEASE_WORKFLOW,
  parseReleaseManifest,
  releaseAssetNames,
  releaseIdentity,
  type ReleaseManifest,
} from "../website/github-release-artifact.mjs";
import { verifyCanonicalReleaseRun } from "./github-release-artifact.js";
import { verifyPublicationHandoff } from "./github-release-publish.js";
import { inspectPackageArtifact } from "./package-artifact.js";
import {
  CANONICAL_RELEASE_JOBS,
  exactReleaseWorkflowRun,
  releaseSourceReceipt,
  resolveReleaseAuthority,
} from "./release-provider-outcome.mjs";
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
import { quintModel, quintTraceCache } from "./verification-replay.js";
import { REPOSITORY_ROOT } from "./verification-tools.js";

const MODEL_FILE = "release.qnt";
const MAX_ATTEMPTS = 3;
const RUN = 88001;
const FOREIGN_RUN = 88002;
const STATE_VARIABLES = [
  "artifactOf", "attested", "draftAttempt", "handoff", "handoffAttempt", "handoffRun", "jobs", "latest",
  "promotionBlocked", "refusedExact", "relAttempt", "relState", "verdict", "verdictPath",
];
const TRACE_VARIABLES = [...STATE_VARIABLES, "mbt::actionTaken", "mbt::nondetPicks"].sort();
const PICKS = ["failAt", "kind", "mode", "source", "sourceRoll"];
const SOURCE_SHA = "2".repeat(40);
const WORKFLOW_SHA = "4".repeat(40);
const RELEASE_OWNER = Object.freeze({ id: 894119, login: "0thernet", type: "User" });
const REPOSITORY = Object.freeze({ id: GITHUB_RELEASE_REPOSITORY_ID, full_name: GITHUB_RELEASE_REPOSITORY, private: false });
const NPM_JOBS = ["Publish exact npm package through OIDC", "Admit exact public npm package"];
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

type Json = Record<string, unknown>;

type ModelSnapshot = Readonly<{
  latest: number;
  jobs: readonly (readonly string[])[];
  artifactOf: readonly number[];
  attested: ReadonlySet<string>;
  relState: string;
  draftAttempt: number;
  relAttempt: number;
  handoff: string;
  handoffRun: number;
  handoffAttempt: number;
  verdict: string;
  verdictPath: string;
  refusedExact: boolean;
  promotionBlocked: boolean;
}>;

/**
 * The production validators, plus seeded defects that restore a pre-fix
 * form: `handoff-requires-current-attempt` binds the handoff manifest to the
 * current attempt, as the publisher did before D7 was fixed,
 * `download-ignores-later-attempt` admits the canonical download only through
 * its receipt attempt, as it did before a failed-jobs rerun could complete a
 * publication, and `recovery-ignores-intermediate-attempt` serves no attempt
 * record between the receipt attempt and the latest attempt, so recovery
 * cannot read one, as before D15 was fixed.
 */
type Defect = "none" | "handoff-requires-current-attempt" | "download-ignores-later-attempt"
  | "recovery-ignores-intermediate-attempt";

const PRE_D15_REFUSAL = "pre-D15 recovery reads no intermediate attempt";

/** Whether `attempt` lies strictly between the Release's receipt attempt and the latest attempt. */
const intermediateAttempt = (state: ModelSnapshot, attempt: number): boolean =>
  attempt > state.relAttempt && attempt < state.latest;

class ReplayDivergence extends Error {}
class StubMiss extends Error {}

const coordinate = (run: number, attempt: number): string => `${String(run)}/${String(attempt)}`;

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

/** Read an `int -> V` map over exactly the keys 0..size-1 into an array. */
function itfIndexed<V>(value: ItfValue, size: number, label: string, read: (entry: ItfValue, label: string) => V): readonly V[] {
  if (value.kind !== "map" || value.entries.length !== size) throw new Error(`ITF ${label} must map exactly ${String(size)} keys`);
  const result = new Array<V | undefined>(size).fill(undefined);
  for (const [key, entry] of value.entries) {
    const index = itfInt(key, `${label} key`);
    if (index < 0 || index >= size || result[index] !== undefined) throw new Error(`ITF ${label} has an unexpected key ${String(index)}`);
    result[index] = read(entry, `${label}[${String(index)}]`);
  }
  return result as V[];
}

function itfCoordinates(value: ItfValue, label: string): ReadonlySet<string> {
  if (value.kind !== "set") throw new Error(`ITF ${label} must be a set`);
  return new Set(value.items.map((item, index) => {
    if (item.kind !== "tuple" || item.items.length !== 2) throw new Error(`ITF ${label}[${String(index)}] must be a pair`);
    return coordinate(itfInt(item.items[0]!, label), itfInt(item.items[1]!, label));
  }));
}

function modelState(state: ItfState): ModelSnapshot {
  const int = (name: string): number => itfInt(itfVariable(state, name), name);
  const str = (name: string): string => itfString(itfVariable(state, name), name);
  const bool = (name: string): boolean => itfBool(itfVariable(state, name), name);
  return {
    latest: int("latest"),
    jobs: itfIndexed(itfVariable(state, "jobs"), MAX_ATTEMPTS + 1, "jobs",
      (entry, label) => itfIndexed(entry, CANONICAL_RELEASE_JOBS.length + 1, label, itfString)),
    artifactOf: itfIndexed(itfVariable(state, "artifactOf"), MAX_ATTEMPTS + 1, "artifactOf", itfInt),
    attested: itfCoordinates(itfVariable(state, "attested"), "attested"),
    relState: str("relState"),
    draftAttempt: int("draftAttempt"),
    relAttempt: int("relAttempt"),
    handoff: str("handoff"),
    handoffRun: int("handoffRun"),
    handoffAttempt: int("handoffAttempt"),
    verdict: str("verdict"),
    verdictPath: str("verdictPath"),
    refusedExact: bool("refusedExact"),
    promotionBlocked: bool("promotionBlocked"),
  };
}

const jobsSucceeded = (state: ModelSnapshot, attempt: number, count: number): boolean =>
  attempt >= 1 && state.jobs[attempt]!.slice(0, count).every((conclusion) => conclusion === "success");

/** The model's invariants, evaluated independently of Quint on a trace state. */
function invariantHolds(name: string, state: ModelSnapshot): boolean {
  switch (name) {
    case "publishedBytesAttested":
      return (state.handoff !== "admitted"
          || (state.handoffRun === RUN && state.attested.has(coordinate(state.handoffRun, state.handoffAttempt))))
        && (state.relState !== "published"
          || (state.relAttempt >= 1 && state.relAttempt <= state.latest && state.attested.has(coordinate(RUN, state.relAttempt))));
    case "promotionSound":
      return state.verdict !== "admitted"
        || (state.relState === "published" && Array.from({ length: MAX_ATTEMPTS + 1 }, (_, attempt) => attempt)
          .some((attempt) => attempt >= state.relAttempt && attempt <= state.latest && jobsSucceeded(state, attempt, 4)));
    case "exactHandoffPublishes": return !state.refusedExact;
    case "promotionNotBlocked": return !state.promotionBlocked;
    default: throw new Error(`unknown invariant ${name}`);
  }
}

type RecordedStep = Readonly<{ action: string; picks: ReadonlyMap<string, ItfValue | null> }>;

function recordedStep(state: ItfState): RecordedStep {
  const action = itfString(itfVariable(state, "mbt::actionTaken"), "mbt::actionTaken");
  if (action === "init") return { action, picks: new Map() };
  const fields = itfRecord(itfVariable(state, "mbt::nondetPicks"), PICKS, "mbt::nondetPicks");
  const picks = new Map<string, ItfValue | null>();
  for (const name of PICKS) picks.set(name, itfOption(fields.get(name)!, `mbt::nondetPicks.${name}`));
  return { action, picks };
}

function pick(step: RecordedStep, name: string, index: number): string {
  const value = step.picks.get(name);
  if (value === undefined || value === null) throw new Error(`state ${String(index)} records no ${name} pick`);
  return itfString(value, name);
}

// ---------------------------------------------------------------------------
// Provider fixtures
// ---------------------------------------------------------------------------

type Fixture = Readonly<{
  root: string;
  tag: string;
  archiveName: string;
  archivePath: string;
  packJson: string;
  /** The four attested files a build of (run, attempt) produces, by name. */
  files: (run: number, attempt: number) => ReadonlyMap<string, Buffer>;
  manifest: (run: number, attempt: number) => ReleaseManifest;
  /** The SHA-256 of one of those files, without rehashing the archive. */
  digest: (bytes: Buffer) => string;
}>;

async function run(command: readonly string[], cwd: string): Promise<void> {
  const child = Bun.spawn([...command], { cwd, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (exitCode !== 0) throw new Error(`${command.join(" ")} exited with ${String(exitCode)}: ${stderr.slice(0, 2_000)}`);
}

/** Pack this checkout once and derive the exact canonical files of any build coordinates from it. */
async function createFixture(): Promise<Fixture> {
  const { version } = JSON.parse(await readFile(join(REPOSITORY_ROOT, "package.json"), "utf8")) as { version: string };
  const tag = `v${version}`;
  const names = releaseAssetNames(tag);
  const archiveName = names[0]!;
  const root = await mkdtemp(join(tmpdir(), "ghostget-release-replay-"));
  const archivePath = join(root, archiveName);
  await run([process.execPath, "pm", "pack", "--filename", archivePath, "--ignore-scripts", "--quiet"], REPOSITORY_ROOT);
  const archive = await readFile(archivePath);
  const inventory = await inspectPackageArtifact(archivePath);
  const name = releaseIdentity(tag).package;
  const packJson = `${JSON.stringify([{
    bundled: [],
    entryCount: inventory.fileCount,
    filename: archiveName,
    files: inventory.files.map((file) => ({ mode: file.mode, path: file.path, size: file.size })),
    id: `${name}@${version}`,
    integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    name,
    shasum: createHash("sha1").update(archive).digest("hex"),
    size: archive.byteLength,
    unpackedSize: inventory.unpackedBytes,
    version,
  }], null, 2)}\n`;
  const archiveDigest = { name: archiveName, bytes: archive.byteLength, sha256: sha256(archive),
    sha512: createHash("sha512").update(archive).digest("hex") };
  const manifests = new Map<string, ReleaseManifest>();
  const manifest = (runId: number, runAttempt: number): ReleaseManifest => {
    const key = coordinate(runId, runAttempt);
    const cached = manifests.get(key);
    if (cached !== undefined) return cached;
    const value = parseReleaseManifest({
      schema: "hraness-github-release-v1", repository: GITHUB_RELEASE_REPOSITORY, repositoryId: GITHUB_RELEASE_REPOSITORY_ID,
      package: name, version, tag, sourceSha: SOURCE_SHA, workflowSha: WORKFLOW_SHA, workflow: GITHUB_RELEASE_WORKFLOW,
      runId, runAttempt, archive: archiveDigest,
    });
    manifests.set(key, value);
    return value;
  };
  const builds = new Map<string, ReadonlyMap<string, Buffer>>();
  const files = (runId: number, runAttempt: number): ReadonlyMap<string, Buffer> => {
    const key = coordinate(runId, runAttempt);
    const cached = builds.get(key);
    if (cached !== undefined) return cached;
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest(runId, runAttempt))}\n`);
    const packBytes = Buffer.from(packJson);
    const result = new Map<string, Buffer>([
      [archiveName, archive],
      ["npm-pack.json", packBytes],
      ["release-manifest.json", manifestBytes],
      ["SHA256SUMS", Buffer.from([[archiveName, archiveDigest.sha256], ["npm-pack.json", sha256(packBytes)],
        ["release-manifest.json", sha256(manifestBytes)]].map(([file, digest]) => `${digest!}  ${file!}\n`).join(""))],
    ]);
    builds.set(key, result);
    return result;
  };
  const digest = (bytes: Buffer): string => bytes === archive ? archiveDigest.sha256 : sha256(bytes);
  return { root, tag, archiveName, archivePath, packJson, files, manifest, digest };
}

let fixturePromise: Promise<Fixture> | undefined;
const fixture = (): Promise<Fixture> => (fixturePromise ??= createFixture());

afterAll(async () => {
  if (fixturePromise !== undefined) await rm((await fixturePromise).root, { recursive: true, force: true });
});

/** The verified-output shape of `gh attestation verify` for one genuine attestation of (run, attempt). */
function attestationOutput(f: Fixture, runId: number, runAttempt: number): string {
  const signedRepository = releaseIdentity(f.tag).repository;
  const workflowUri = `https://github.com/${signedRepository}/${GITHUB_RELEASE_WORKFLOW}@refs/tags/${f.tag}`;
  const subjects = [...f.files(runId, runAttempt)].map(([name, bytes]) => ({ name, digest: { sha256: f.digest(bytes) } }));
  return JSON.stringify([{ verificationResult: {
    signature: { certificate: {
      issuer: "https://token.actions.githubusercontent.com", buildSignerURI: workflowUri, buildSignerDigest: SOURCE_SHA,
      runnerEnvironment: "github-hosted", sourceRepositoryURI: `https://github.com/${signedRepository}`,
      sourceRepositoryIdentifier: String(GITHUB_RELEASE_REPOSITORY_ID), sourceRepositoryOwnerIdentifier: "307125679",
      sourceRepositoryOwnerURI: "https://github.com/hraness", sourceRepositoryVisibilityAtSigning: "public",
      buildConfigURI: workflowUri, buildConfigDigest: SOURCE_SHA, sourceRepositoryDigest: SOURCE_SHA,
      sourceRepositoryRef: `refs/tags/${f.tag}`, buildTrigger: "push",
      runInvocationURI: `https://github.com/${signedRepository}/actions/runs/${String(runId)}/attempts/${String(runAttempt)}`,
    } },
    verifiedTimestamps: [{ type: "fixture" }],
    statement: { _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1", subject: subjects },
  } }]);
}

const handoffCache = new Map<string, Promise<string | null>>();
let handoffDirectories = 0;

/**
 * Hand `verifyPublicationHandoff` the files a build of (run, attempt) produced,
 * with a provenance bundle naming those coordinates, in the publish job of
 * attempt `current`. The `gh` stub verifies a bundle only when the model says
 * that attestation exists. Returns null on admission or the refusal message.
 */
function productionHandoff(runId: number, attempt: number, current: number, genuine: boolean, defect: Defect): Promise<string | null> {
  const key = `${coordinate(runId, attempt)}@${String(current)}:${String(genuine)}:${defect}`;
  const cached = handoffCache.get(key);
  if (cached !== undefined) return cached;
  const result = (async (): Promise<string | null> => {
    const f = await fixture();
    handoffDirectories += 1;
    const directory = join(f.root, `handoff-${String(handoffDirectories)}`);
    await mkdir(directory, { mode: 0o700 });
    const files = f.files(runId, attempt);
    for (const [name, bytes] of files) {
      if (name === f.archiveName) await link(f.archivePath, join(directory, name));
      else await writeFile(join(directory, name), bytes, { mode: 0o600 });
    }
    const bundle = Buffer.from(`${JSON.stringify({ run: runId, attempt })}\n`);
    await writeFile(join(directory, "provenance.jsonl"), bundle, { mode: 0o600 });
    const gh = (args: readonly string[]): string => {
      const bundleIndex = args.indexOf("--bundle");
      if (args[0] !== "attestation" || args[1] !== "verify" || args[bundleIndex + 1] !== join(directory, "provenance.jsonl")) {
        throw new StubMiss(`unexpected gh ${args.join(" ")}`);
      }
      if (!genuine) throw new Error("Bounded read-only GitHub artifact verification failed");
      return attestationOutput(f, runId, attempt);
    };
    const environment = {
      GITHUB_RUN_ID: String(RUN),
      GITHUB_RUN_ATTEMPT: String(current),
      VERIFIED_TAG: f.tag,
      VERIFIED_SHA: SOURCE_SHA,
      WORKFLOW_SHA,
      EXPECTED_ARTIFACT_HASHES: JSON.stringify(Object.fromEntries([...files].map(([name, bytes]) => [name, f.digest(bytes)]))),
      EXPECTED_BUNDLE_SHA256: sha256(bundle),
    };
    try {
      if (defect === "handoff-requires-current-attempt") {
        // Pre-fix D7: the manifest had to name the current attempt.
        const manifest = await verifyPublicationHandoff(directory, environment, gh);
        if (manifest.runAttempt !== current) throw new Error("Canonical release manifest does not name the current attempt");
      } else {
        await verifyPublicationHandoff(directory, environment, gh);
      }
      return null;
    } catch (error) {
      if (error instanceof StubMiss) throw error;
      return error instanceof Error ? error.message : String(error);
    }
  })();
  handoffCache.set(key, result);
  return result;
}

function attemptRun(f: Fixture, state: ModelSnapshot, attempt: number): Json {
  const succeeded = state.jobs[attempt]!.every((conclusion) => conclusion === "success");
  return {
    actor: RELEASE_OWNER, conclusion: succeeded ? "success" : "failure", event: "push", head_branch: f.tag,
    head_repository: REPOSITORY, head_sha: SOURCE_SHA, id: RUN, name: "Release", path: GITHUB_RELEASE_WORKFLOW,
    repository: REPOSITORY, run_attempt: attempt, status: "completed", triggering_actor: RELEASE_OWNER, workflow_id: 323493609,
  };
}

/** One complete bounded job inventory; every job of an attempt, carried or not, reports that attempt. */
function attemptJobs(state: ModelSnapshot, attempt: number): Json {
  const conclusions = state.jobs[attempt]!;
  const jobs = [...CANONICAL_RELEASE_JOBS, ...NPM_JOBS].map((name, index) => ({
    conclusion: conclusions[Math.min(index, CANONICAL_RELEASE_JOBS.length)],
    head_sha: SOURCE_SHA, id: 5000 + attempt * 10 + index, name, run_attempt: attempt, run_id: RUN, status: "completed",
  }));
  return { jobs, total_count: jobs.length };
}

function publishedRelease(f: Fixture, state: ModelSnapshot): Json {
  const receipt = releaseSourceReceipt({ repository: GITHUB_RELEASE_REPOSITORY, verifiedSha: SOURCE_SHA,
    verifiedTag: f.tag, workflowRunId: String(RUN) });
  const files = new Map(f.files(RUN, state.relAttempt));
  files.set("provenance.jsonl", Buffer.from(`${JSON.stringify({ run: RUN, attempt: state.relAttempt })}\n`));
  const assets = releaseAssetNames(f.tag).map((name, index) => ({
    browser_download_url: `https://github.com/${GITHUB_RELEASE_REPOSITORY}/releases/download/${f.tag}/${name}`,
    digest: `sha256:${f.digest(files.get(name)!)}`, id: 20 + index, name, size: files.get(name)!.byteLength, state: "uploaded",
    url: `https://api.github.com/repos/${GITHUB_RELEASE_REPOSITORY}/releases/assets/${String(20 + index)}`,
  }));
  return {
    assets, author: { id: 41898282, login: "github-actions[bot]", type: "Bot" },
    body: `${receipt}\n\nghostget-release-attempt-v1 run_attempt=${String(state.relAttempt)}`,
    draft: false, id: 10, immutable: true, name: `Ghostget ${f.tag}`, prerelease: false,
    published_at: "2026-09-23T00:00:00Z", tag_name: f.tag, target_commitish: SOURCE_SHA,
  };
}

/** `resolveReleaseAuthority` over a read-only API stub serving the model's provider state. */
async function productionPromotion(state: ModelSnapshot, mode: string, defect: Defect): Promise<string | null> {
  const f = await fixture();
  const repository = `/repos/${GITHUB_RELEASE_REPOSITORY}`;
  const runPath = `${repository}/actions/runs/${String(RUN)}`;
  const release = publishedRelease(f, state);
  const responses = new Map<string, unknown>([
    [repository, { default_branch: "main" }],
    [`${repository}/git/ref/heads/main`, { object: { sha: WORKFLOW_SHA, type: "commit" }, ref: "refs/heads/main" }],
    [`${repository}/commits/${encodeURIComponent(`refs/tags/${f.tag}`)}`, { sha: SOURCE_SHA }],
    [`${repository}/releases/tags/${f.tag}`, release],
    [`${repository}/releases/latest`, release],
    [runPath, attemptRun(f, state, state.latest)],
  ]);
  for (let attempt = 1; attempt <= state.latest; attempt += 1) {
    responses.set(`${runPath}/attempts/${String(attempt)}`, attemptRun(f, state, attempt));
    responses.set(`${runPath}/attempts/${String(attempt)}/jobs?per_page=100`, attemptJobs(state, attempt));
  }
  const api = {
    get: async (endpoint: string): Promise<unknown> => {
      const attempt = /\/attempts\/([1-9][0-9]*)$/u.exec(endpoint);
      if (defect === "recovery-ignores-intermediate-attempt" && attempt !== null && intermediateAttempt(state, Number(attempt[1]))) {
        throw new Error(PRE_D15_REFUSAL);
      }
      if (!responses.has(endpoint)) throw new StubMiss(`unexpected GET ${endpoint}`);
      return structuredClone(responses.get(endpoint));
    },
  };
  const trigger = mode === "automatic"
    ? { eventName: "workflow_run", requestedReleaseWorkflowRunId: String(RUN), requestedReleaseWorkflowRunAttempt: String(state.latest) }
    : { eventName: "workflow_dispatch" };
  try {
    await resolveReleaseAuthority({ api, defaultBranch: "main", recoveryWorkflowSha: WORKFLOW_SHA,
      repository: GITHUB_RELEASE_REPOSITORY, verifiedSha: SOURCE_SHA, verifiedTag: f.tag, ...trigger });
    return null;
  } catch (error) {
    if (error instanceof StubMiss) throw error;
    return error instanceof Error ? error.message : String(error);
  }
}

/** `verifyCanonicalReleaseRun` over a `gh api` stub serving the model's run and inventories. */
async function productionDownload(state: ModelSnapshot, defect: Defect): Promise<string | null> {
  const f = await fixture();
  const runPath = `repos/${GITHUB_RELEASE_REPOSITORY}/actions/runs/${String(RUN)}`;
  const responses = new Map<string, unknown>([[runPath, attemptRun(f, state, state.latest)]]);
  for (let attempt = 1; attempt <= state.latest; attempt += 1) {
    responses.set(`${runPath}/attempts/${String(attempt)}`, attemptRun(f, state, attempt));
    responses.set(`${runPath}/attempts/${String(attempt)}/jobs?per_page=100`, attemptJobs(state, attempt));
  }
  const gh = (args: readonly string[]): string => {
    const attempt = /\/attempts\/([1-9][0-9]*)$/u.exec(args[1] ?? "");
    if (defect === "recovery-ignores-intermediate-attempt" && attempt !== null && intermediateAttempt(state, Number(attempt[1]))) {
      throw new Error(PRE_D15_REFUSAL);
    }
    if (args.length !== 2 || args[0] !== "api" || !responses.has(args[1]!)) throw new StubMiss(`unexpected gh ${args.join(" ")}`);
    return JSON.stringify(responses.get(args[1]!));
  };
  const manifest = f.manifest(RUN, state.relAttempt);
  try {
    if (defect === "download-ignores-later-attempt") {
      // The receipt attempt alone, without the current attempt's inventory.
      const attemptPath = `${runPath}/attempts/${String(manifest.runAttempt)}`;
      exactReleaseWorkflowRun({ repository: GITHUB_RELEASE_REPOSITORY, value: JSON.parse(gh(["api", attemptPath])),
        canonicalJobs: JSON.parse(gh(["api", `${attemptPath}/jobs?per_page=100`])), readCurrentRun: undefined, readAttemptJobs: undefined, readAttemptRun: undefined,
        verifiedSha: SOURCE_SHA, verifiedTag: f.tag, workflowRunId: String(RUN), expectedRunAttempt: String(manifest.runAttempt) });
    } else {
      verifyCanonicalReleaseRun(String(RUN), manifest, { tag: f.tag, sourceSha: SOURCE_SHA }, gh);
    }
    return null;
  } catch (error) {
    if (error instanceof StubMiss) throw error;
    return error instanceof Error ? error.message : String(error);
  }
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

const verdictText = (refusal: string | null): string => refusal === null ? "admitted" : `refused (${refusal})`;

/** Check every recorded provider read of `trace` against the production validator that performs it. */
async function replay(trace: ItfTrace, defect: Defect = "none"): Promise<void> {
  const [initial, ...steps] = trace.states;
  if (initial === undefined) throw new Error("A trace needs its initial state");
  if (recordedStep(initial).action !== "init") throw new Error("A trace must start with the init action");
  for (const state of steps) {
    const step = recordedStep(state);
    const after = modelState(state);
    let refusal: string | null;
    let expected: string;
    switch (step.action) {
      case "startAttempt":
        pick(step, "kind", state.index);
        if (after.handoff === "none") continue;
        refusal = await productionHandoff(after.handoffRun, after.handoffAttempt, after.latest,
          after.attested.has(coordinate(after.handoffRun, after.handoffAttempt)), defect);
        expected = after.handoff;
        break;
      case "promote":
        refusal = await productionPromotion(after, pick(step, "mode", state.index), defect);
        expected = after.verdict;
        break;
      case "download":
        refusal = await productionDownload(after, defect);
        expected = after.verdict;
        break;
      case "done":
        continue;
      default:
        throw new Error(`state ${String(state.index)}: unknown action ${step.action}`);
    }
    if ((refusal === null) !== (expected === "admitted")) {
      throw new ReplayDivergence(`state ${String(state.index)}: ${step.action} production ${verdictText(refusal)}, the model ${expected}`);
    }
  }
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

const releaseModel = () => quintModel(MODEL_FILE);
const traces = quintTraceCache(MODEL_FILE);

/** Whether an attempt strictly between the receipt attempt and the latest attempt proved all four canonical jobs. */
const intermediatePublished = (state: ModelSnapshot): boolean =>
  Array.from({ length: MAX_ATTEMPTS + 1 }, (_, attempt) => attempt)
    .some((attempt) => intermediateAttempt(state, attempt) && jobsSucceeded(state, attempt, 4));

/** A category of recorded provider read, detailed enough to show the replay reached each production branch. */
function coverageKey(trace: ItfTrace, position: number): string | null {
  const state = trace.states[position]!;
  const after = modelState(state);
  const { action, picks } = recordedStep(state);
  switch (action) {
    case "startAttempt": {
      if (after.handoff === "none") return null;
      const source = after.handoffRun !== RUN ? "another run"
        : after.handoffAttempt > after.latest ? "a later attempt"
          : after.handoffAttempt < after.latest ? "an earlier attempt" : "this attempt";
      const signed = after.attested.has(coordinate(after.handoffRun, after.handoffAttempt)) ? "attested" : "unattested";
      return `handoff(${source}, ${signed}, ${after.handoff})`;
    }
    case "promote": {
      const mode = itfString(picks.get("mode")!, "mode");
      const latestSucceeded = after.jobs[after.latest]!.every((conclusion) => conclusion === "success");
      const route = latestSucceeded ? "latest succeeded"
        : jobsSucceeded(after, after.latest, 4) ? "latest proved four"
          : after.relAttempt < after.latest && jobsSucceeded(after, after.relAttempt, 4) ? "receipt proved four"
            : intermediatePublished(after) ? "intermediate proved four" : "unproven";
      return `promote(${mode}, ${route}, ${after.verdict})`;
    }
    case "download": {
      const m = after.relAttempt;
      const route = after.jobs[m]!.every((conclusion) => conclusion === "success") ? "receipt succeeded"
        : jobsSucceeded(after, m, 4) ? "receipt published"
          : after.latest > m && jobsSucceeded(after, after.latest, 4) ? "later attempt published"
            : intermediatePublished(after) ? "intermediate attempt published" : "unproven";
      return `download(${route}, ${after.verdict})`;
    }
    default: return null;
  }
}

describe("release.qnt ITF replay", () => {
  test("replays every seeded model trace through the production release validators", async () => {
    const model = await releaseModel();
    expect(model.replay.target).toBe("production");
    expect(model.replay.test).toBe("scripts/verification-release-replay.test.ts");
    const all = await traces(model.step);
    expect(all).toHaveLength(model.replay.traces);
    const covered = new Set<string>();
    for (const trace of all) {
      expect(trace.source).toBe(MODEL_FILE);
      expect([...trace.vars].sort()).toEqual(TRACE_VARIABLES);
      expect(trace.states.length).toBeGreaterThan(1);
      expect(trace.states.length).toBeLessThanOrEqual(model.replay.maxSteps + 1);
      expect(await divergence(trace)).toBeNull();
      for (let position = 1; position < trace.states.length; position += 1) {
        const key = coverageKey(trace, position);
        if (key !== null) covered.add(key);
      }
    }
    expect([...covered].sort()).toEqual([
      "download(intermediate attempt published, admitted)",
      "download(later attempt published, admitted)",
      "download(receipt published, admitted)",
      "download(receipt succeeded, admitted)",
      "download(unproven, refused)",
      "handoff(a later attempt, unattested, refused)",
      "handoff(an earlier attempt, attested, admitted)",
      "handoff(another run, attested, refused)",
      "handoff(this attempt, attested, admitted)",
      "handoff(this attempt, unattested, refused)",
      "promote(automatic, intermediate proved four, refused)",
      "promote(automatic, latest proved four, refused)",
      "promote(automatic, latest succeeded, admitted)",
      "promote(automatic, receipt proved four, refused)",
      "promote(automatic, unproven, refused)",
      "promote(manual, intermediate proved four, admitted)",
      "promote(manual, latest proved four, admitted)",
      "promote(manual, latest succeeded, admitted)",
      "promote(manual, receipt proved four, admitted)",
      "promote(manual, unproven, refused)",
    ]);
  });

  for (const [defect, pattern] of [
    ["handoff-requires-current-attempt",
      /^state \d+: startAttempt production refused \(Canonical release manifest does not name the current attempt\), the model admitted$/u],
    ["download-ignores-later-attempt",
      /^state \d+: download production refused \(Release workflow run jobs Publish immutable GitHub Release job did not succeed in the receipt attempt\), the model admitted$/u],
    ["recovery-ignores-intermediate-attempt",
      /^state \d+: (?:promote|download) production refused \(pre-D15 recovery reads no intermediate attempt\), the model admitted$/u],
  ] as const) {
    test(`production validators with the seeded ${defect} defect diverge from the model traces`, async () => {
      const model = await releaseModel();
      const divergences: string[] = [];
      for (const trace of await traces(model.step)) {
        const message = await divergence(trace, defect);
        if (message !== null) divergences.push(message);
      }
      expect(divergences.length).toBeGreaterThan(0);
      for (const message of divergences) expect(message).toMatch(pattern);
    });
  }

  for (const [step, invariant, pattern] of [
    ["stepD7", "exactHandoffPublishes", /^state \d+: startAttempt production admitted, the model refused$/u],
    ["stepD8", "promotionNotBlocked", /^state \d+: promote production admitted, the model refused$/u],
    ["stepD15", "promotionNotBlocked", /^state \d+: (?:promote|download) production admitted, the model refused$/u],
    ["stepUnbound", "publishedBytesAttested",
      /^state \d+: startAttempt production refused \(Bounded read-only GitHub artifact verification failed\), the model admitted$/u],
    ["stepEarlyDownload", "promotionSound",
      /^state \d+: download production refused \((?:Release workflow run current attempt jobs .+ job did not succeed in the current attempt(?:, and no intermediate attempt proved the four canonical jobs)?|Release workflow run publication was not completed by a later attempt of the same run)\), the model admitted$/u],
  ] as const) {
    test(`the production validators refuse exactly the ${step} verdicts that break ${invariant}`, async () => {
      const model = await releaseModel();
      expect(model.mutants).toContainEqual({ step, invariant });
      let violating = 0;
      for (const trace of await traces(step)) {
        const firstViolation = trace.states.findIndex((state) => !invariantHolds(invariant, modelState(state)));
        const message = await divergence(trace);
        if (firstViolation === -1) {
          expect(message).toBeNull();
          continue;
        }
        violating += 1;
        expect(message).toMatch(pattern);
        expect(message!.startsWith(`state ${String(firstViolation)}:`)).toBe(true);
      }
      expect(violating).toBeGreaterThan(0);
    });
  }

  test("an unknown action or a missing or malformed pick fails closed instead of skipping a step", async () => {
    const none = { tag: "None", value: { "#tup": [] } };
    const some = (value: unknown) => ({ tag: "Some", value });
    const int = (value: number) => ({ "#bigint": String(value) });
    const indexed = (values: readonly unknown[]) => ({ "#map": values.map((value, index) => [int(index), value]) });
    const noJobs = indexed(["none", "none", "none", "none", "none"]);
    const state = (index: number, action: string, picks: Record<string, unknown>) => ({
      "#meta": { index },
      latest: int(0),
      jobs: indexed([noJobs, noJobs, noJobs, noJobs]),
      artifactOf: indexed([int(0), int(0), int(0), int(0)]),
      attested: { "#set": [{ "#tup": [int(FOREIGN_RUN), int(1)] }] },
      relState: "none",
      draftAttempt: int(0),
      relAttempt: int(0),
      handoff: "none",
      handoffRun: int(0),
      handoffAttempt: int(0),
      verdict: "none",
      verdictPath: "",
      refusedExact: false,
      promotionBlocked: false,
      "mbt::actionTaken": action,
      "mbt::nondetPicks": picks,
    });
    const trace = (action: string, kind: unknown): ItfTrace => parseItfTrace(JSON.stringify({
      vars: TRACE_VARIABLES,
      states: [
        state(0, "init", Object.fromEntries(PICKS.map((name) => [name, none]))),
        state(1, action, { failAt: some("auth"), kind, mode: some("manual"), source: some("carried"), sourceRoll: some(int(1)) }),
      ],
    }));
    expect(await divergence(trace("startAttempt", some("first")))).toBeNull();
    await expect(divergence(trace("rebuild", some("first")))).rejects.toThrow("unknown action rebuild");
    await expect(divergence(trace("startAttempt", none))).rejects.toThrow("records no kind pick");
    await expect(divergence(trace("startAttempt", "first"))).rejects.toThrow("must be a record");
  });
});
