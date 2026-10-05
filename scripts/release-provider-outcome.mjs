#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { parseReleaseAssetDescriptors, releaseIdentity, usesGithubReleaseAssets } from "../website/github-release-artifact.mjs";
import { parseReleaseBody } from "../website/release-notes.mjs";


const PAGE_SIZE = 100;
const MAX_ITEMS = 500;
export const GHOSTGET_REPOSITORY_ID = 1316443113;
const LATEST_RELEASE_CONVERGENCE_DEADLINE_MILLISECONDS = 60_000;
const LATEST_RELEASE_POLL_INTERVAL_MILLISECONDS = 5_000;
const LATEST_RELEASE_MAX_ATTEMPTS = 12;
const LATEST_RELEASE_REQUEST_TIMEOUT_MILLISECONDS = 10_000;

export const latestReleaseConvergenceBudget = Object.freeze({
  deadlineMilliseconds: LATEST_RELEASE_CONVERGENCE_DEADLINE_MILLISECONDS,
  maxAttempts: LATEST_RELEASE_MAX_ATTEMPTS,
  perRequestTimeoutMilliseconds: LATEST_RELEASE_REQUEST_TIMEOUT_MILLISECONDS,
  pollIntervalMilliseconds: LATEST_RELEASE_POLL_INTERVAL_MILLISECONDS,
});
const MAX_SLEEP_ATTEMPTS_PER_INTERVAL = 16;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const PAGINATED_READ_REQUESTS = MAX_ITEMS / PAGE_SIZE + 1;
const GITHUB_ACTIONS_RELEASE_BOT = Object.freeze({
  id: 41898282,
  type: "Bot",
});
const RELEASE_WORKFLOW = Object.freeze({
  id: 323493609,
  path: ".github/workflows/release.yml",
});
const RELEASE_OWNER = Object.freeze({ id: 894119, type: "User" });
// hraness-release-tagger[bot], which tags merged version bumps on main.
const RELEASE_TAGGER = Object.freeze({ id: 337004703, type: "Bot" });
const RELEASE_WORKFLOW_REQUEST_TIMEOUT_MILLISECONDS = 10_000;
/**
 * Recovery reads at most this many attempts strictly between a receipt attempt
 * that attested but did not publish and the run's latest attempt; a wider gap
 * fails closed before any of them is read.
 */
export const MAX_INTERMEDIATE_RELEASE_ATTEMPTS = 3;
const RELEASE_SOURCE_RECEIPT_SCHEMA = "wrench-release-source-v1";
const STABLE_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const MAXIMUM_SAFE_SEMVER_COMPONENT = BigInt(Number.MAX_SAFE_INTEGER);
const SHA = /^[0-9a-f]{40}$/u;
const SECOND_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/u;
const HTTP_DATE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value, label) {
  if (!isRecord(value)) fail(`${label} is not an object`);
  return value;
}

function expectArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} is not an array`);
  return value;
}

function expectExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} has an unexpected shape`);
  }
}

function expectString(value, label) {
  if (typeof value !== "string") fail(`${label} is not a string`);
  return value;
}

function expectBoolean(value, label) {
  if (typeof value !== "boolean") fail(`${label} is not a boolean`);
  return value;
}

function expectSafeId(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label} is not a positive safe integer`);
  return value;
}

function expectNonnegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} is not a nonnegative safe integer`);
  }
  return value;
}

function expectSha(value, label) {
  const sha = expectString(value, label);
  if (!SHA.test(sha)) fail(`${label} is not one lowercase 40-hex commit`);
  return sha;
}

function expectStableTag(value, label) {
  const tag = expectString(value, label);
  if (stableVersion(tag, label) === undefined) {
    fail(`${label} is not one stable semantic-version tag in npm's safe numeric range`);
  }
  return tag;
}

function expectRepository(value) {
  const repository = expectString(value, "repository");
  if (!REPOSITORY.test(repository)) fail("repository is not one owner/name coordinate");
  return repository;
}

function parseSecondTimestamp(value, label) {
  const timestamp = expectString(value, label);
  if (!SECOND_TIMESTAMP.test(timestamp)) fail(`${label} is not an exact second UTC timestamp`);
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) fail(`${label} is not a real timestamp`);
  if (new Date(milliseconds).toISOString().replace(".000Z", "Z") !== timestamp) {
    fail(`${label} is not a canonical timestamp`);
  }
  return Object.freeze({ milliseconds, timestamp });
}

function parseHttpDate(value, label) {
  const date = expectString(value, label);
  if (!HTTP_DATE.test(date)) fail(`${label} is not one canonical HTTP Date`);
  const milliseconds = Date.parse(date);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toUTCString() !== date) {
    fail(`${label} is not a real canonical HTTP Date`);
  }
  return Object.freeze({
    milliseconds,
    timestamp: new Date(milliseconds).toISOString(),
  });
}

function parseJson(text, label) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    fail(`${label} exceeds the bounded JSON response size`);
  }
  try {
    return JSON.parse(text);
  } catch {
    fail(`${label} is not valid JSON`);
  }
}

export function parseIncludedGitHubResponse(text, label = "included GitHub response") {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    fail(`${label} exceeds the bounded response size`);
  }
  const normalized = text.replaceAll("\r\n", "\n");
  const separator = normalized.indexOf("\n\n");
  if (separator <= 0) fail(`${label} has no exact header/body boundary`);
  const headers = normalized.slice(0, separator).split("\n");
  const bodyText = normalized.slice(separator + 2);
  if (!/^HTTP\/(?:1\.1|2(?:\.0)?) 200(?: .*)?$/u.test(headers[0] ?? "")) {
    fail(`${label} is not one successful HTTP response`);
  }
  const dates = [];
  for (const header of headers.slice(1)) {
    const colon = header.indexOf(":");
    if (colon <= 0) fail(`${label} has a malformed response header`);
    const name = header.slice(0, colon).trim().toLowerCase();
    const value = header.slice(colon + 1).trim();
    if (name.length === 0 || value.length === 0) fail(`${label} has an empty response header`);
    if (name === "date") dates.push(value);
  }
  if (dates.length !== 1) fail(`${label} does not have exactly one authenticated Date header`);
  const server = parseHttpDate(dates[0], `${label} Date header`);
  return Object.freeze({
    body: parseJson(bodyText, `${label} body`),
    serverDate: server.timestamp,
  });
}

export function parseOptionalIncludedGitHubResponse(
  text,
  label = "optional included GitHub response",
) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    fail(`${label} exceeds the bounded response size`);
  }
  const normalized = text.replaceAll("\r\n", "\n");
  const separator = normalized.indexOf("\n\n");
  if (separator <= 0) fail(`${label} has no exact header/body boundary`);
  const headers = normalized.slice(0, separator).split("\n");
  const statusMatch = /^HTTP\/(?:1\.1|2(?:\.0)?) (200|404)(?: .*)?$/u.exec(headers[0] ?? "");
  if (statusMatch === null) fail(`${label} is not one exact 200 or 404 HTTP response`);
  for (const header of headers.slice(1)) {
    const colon = header.indexOf(":");
    if (colon <= 0) fail(`${label} has a malformed response header`);
    const name = header.slice(0, colon).trim();
    const value = header.slice(colon + 1).trim();
    if (name.length === 0 || value.length === 0) fail(`${label} has an empty response header`);
  }
  const body = parseJson(normalized.slice(separator + 2), `${label} body`);
  if (statusMatch[1] === "404") {
    const missing = expectRecord(body, `${label} 404 body`);
    if (missing.message !== "Not Found") fail(`${label} is not an exact not-found response`);
    return Object.freeze({ found: false, value: null });
  }
  return Object.freeze({ found: true, value: body });
}

function stableVersion(tag, label) {
  const match = STABLE_TAG.exec(expectString(tag, label));
  if (match === null) return undefined;
  const version = match.slice(1).map((part) => BigInt(part));
  if (version.some(component => component > MAXIMUM_SAFE_SEMVER_COMPONENT)) return undefined;
  return Object.freeze(version);
}

function compareStableVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

export async function assertReleaseTagNewerThanPublished({
  allowExistingTarget = false,
  api,
  repository,
  verifiedTag,
}) {
  const coordinate = expectRepository(repository);
  const tag = expectStableTag(verifiedTag, "verified tag");
  const next = stableVersion(tag, "verified tag");
  const ids = new Set();
  let exhausted = false;
  let existingTargetCount = 0;

  for (let page = 1; page <= PAGINATED_READ_REQUESTS; page += 1) {
    const rawPage = expectArray(
      await api.get(
        `/repos/${coordinate}/releases?per_page=${String(PAGE_SIZE)}&page=${String(page)}`,
      ),
      `published releases page ${String(page)}`,
    );
    if (rawPage.length > PAGE_SIZE) {
      fail(`published releases page ${String(page)} exceeds ${String(PAGE_SIZE)} items`);
    }
    if (page === PAGINATED_READ_REQUESTS) {
      if (rawPage.length !== 0) fail(`published releases exceed the ${String(MAX_ITEMS)}-item audit cap`);
      break;
    }
    if (exhausted && rawPage.length !== 0) fail("published releases resumed after a truncated page");

    for (let index = 0; index < rawPage.length; index += 1) {
      const release = expectRecord(
        rawPage[index],
        `published releases page ${String(page)} item ${String(index)}`,
      );
      const id = expectSafeId(
        release.id,
        `published releases page ${String(page)} item ${String(index)} id`,
      );
      if (ids.has(id)) fail(`published releases contain duplicate id ${String(id)}`);
      ids.add(id);
      const draft = expectBoolean(
        release.draft,
        `published releases page ${String(page)} item ${String(index)} draft`,
      );
      const prerelease = expectBoolean(
        release.prerelease,
        `published releases page ${String(page)} item ${String(index)} prerelease`,
      );
      const currentTag = expectString(
        release.tag_name,
        `published releases page ${String(page)} item ${String(index)} tag_name`,
      );
      const current = stableVersion(currentTag, "published release tag");
      if (!draft && !prerelease && current !== undefined) {
        const immutable = expectBoolean(
          release.immutable,
          `published releases page ${String(page)} item ${String(index)} immutable`,
        );
        if (!immutable) {
          fail(`Published stable Release ${currentTag} is not immutable`);
        }
        parseSecondTimestamp(
          release.published_at,
          `published releases page ${String(page)} item ${String(index)} published_at`,
        );
        const order = compareStableVersions(next, current);
        if (order === 0 && allowExistingTarget && currentTag === tag) {
          existingTargetCount += 1;
          continue;
        }
        if (order <= 0) {
          fail(`Release ${tag} is not newer than ${currentTag}`);
        }
      }
    }
    if (rawPage.length < PAGE_SIZE) exhausted = true;
  }
  if (allowExistingTarget && existingTargetCount !== 1) {
    fail(`Published release history does not contain exactly one existing ${tag}`);
  }
}

async function readImmutableRelease(
  api,
  repository,
  tag,
  verifiedSha,
  workflowRunId,
) {
  const value = exactWorkflowPublishedRelease({
    repository,
    value: await api.get(`/repos/${repository}/releases/tags/${tag}`),
    verifiedSha,
    verifiedTag: tag,
    workflowRunId,
  }, `Release ${tag}`);
  const published = parseSecondTimestamp(value.published_at, `Release ${tag}.published_at`);
  return Object.freeze({
    id: value.id,
    publishedAt: published.timestamp,
    publishedMilliseconds: published.milliseconds,
  });
}

async function readLatestRelease(
  api,
  repository,
  tag,
  verifiedSha,
  workflowRunId,
  expectedRelease,
) {
  const latestValue = expectRecord(
    await api.get(`/repos/${repository}/releases/latest`),
    "Latest Release",
  );
  if (latestValue.tag_name !== tag) fail(`Release ${tag} is no longer Latest`);
  const value = exactWorkflowPublishedRelease({
    repository,
    value: latestValue,
    verifiedSha,
    verifiedTag: tag,
    workflowRunId,
  }, "Latest Release");
  if (
    value.id !== expectedRelease.id
    || value.published_at !== expectedRelease.publishedAt
  ) {
    fail(`Release ${tag} is no longer the exact immutable Latest Release`);
  }
}

export function exactPublishedRelease(value, tag, label = "published Release") {
  const stableTag = expectStableTag(tag, "published Release tag");
  const release = expectRecord(value, label);
  const assets = expectArray(release.assets, `${label}.assets`);
  expectSafeId(release.id, `${label}.id`);
  if (
    release.tag_name !== stableTag ||
    release.draft !== false ||
    release.prerelease !== false ||
    release.immutable !== true
  ) {
    fail(`Release ${stableTag} is not exact, published, and immutable`);
  }
  if (usesGithubReleaseAssets(stableTag)) parseReleaseAssetDescriptors(assets, stableTag);
  else if (assets.length !== 0) fail(`Historical Release ${stableTag} must remain asset-free`);
  parseSecondTimestamp(release.published_at, `${label}.published_at`);
  return release;
}

function expectWorkflowRunId(value, label = "workflow run id") {
  const text = expectString(value, label);
  if (!/^[1-9][0-9]*$/u.test(text) || !Number.isSafeInteger(Number(text))) {
    fail(`${label} is not a positive safe integer`);
  }
  return text;
}

function sourceReceiptRepository(repository, tag) {
  const coordinate = expectRepository(repository);
  // GitHub serves old releases at the renamed API coordinate; immutable receipt
  // text keeps the repository name that was authoritative when it was signed.
  return coordinate === "hraness/ghostget" ? releaseIdentity(tag).repository : coordinate;
}

export function releaseSourceReceipt({ repository, verifiedSha, verifiedTag, workflowRunId }) {
  const coordinate = expectRepository(repository);
  const sha = expectSha(verifiedSha, "release receipt source SHA");
  const tag = expectStableTag(verifiedTag, "release receipt tag");
  const runId = expectWorkflowRunId(workflowRunId, "release receipt workflow run id");
  return [
    RELEASE_SOURCE_RECEIPT_SCHEMA,
    `repository=${sourceReceiptRepository(coordinate, tag)}`,
    `tag=${tag}`,
    `source_sha=${sha}`,
    `workflow_run_id=${runId}`,
  ].join(" ");
}

/**
 * The identity record of a Release page: the trailing HTML comment after the
 * rendered notes, or the whole body for releases published before the notes.
 */
function releaseBodyIdentity(body, tag) {
  try {
    return parseReleaseBody(body, tag).identity;
  } catch {
    return undefined;
  }
}

export function exactWorkflowPublishedRelease({
  repository,
  value,
  verifiedSha,
  verifiedTag,
  workflowRunId,
}, label = "workflow-published Release") {
  const release = exactPublishedRelease(value, verifiedTag, label);
  const expectedReceipt = releaseSourceReceipt({
    repository,
    verifiedSha,
    verifiedTag,
    workflowRunId,
  });
  const body = expectString(release.body, `${label}.body`);
  const identity = releaseBodyIdentity(body, verifiedTag);
  if (
    release.author?.id !== GITHUB_ACTIONS_RELEASE_BOT.id
    || release.author?.type !== GITHUB_ACTIONS_RELEASE_BOT.type
    || identity === undefined
    || (identity !== expectedReceipt && !identity.startsWith(`${expectedReceipt}\n\n`))
  ) {
    fail(`Release ${verifiedTag} does not have the exact Actions workflow identity and source receipt`);
  }
  return release;
}

export function releaseWorkflowRunIdFromPublishedRelease({
  repository,
  value,
  verifiedSha,
  verifiedTag,
}, label = "workflow-published Release") {
  const coordinate = expectRepository(repository);
  const sha = expectSha(verifiedSha, "verified SHA");
  const tag = expectStableTag(verifiedTag, "verified tag");
  const release = exactPublishedRelease(value, tag, label);
  const body = expectString(release.body, `${label}.body`);
  const prefix = [
    RELEASE_SOURCE_RECEIPT_SCHEMA,
    `repository=${sourceReceiptRepository(coordinate, tag)}`,
    `tag=${tag}`,
    `source_sha=${sha}`,
    "workflow_run_id=",
  ].join(" ");
  const firstLine = releaseBodyIdentity(body, tag)?.split("\n", 1)[0] ?? "";
  if (!firstLine.startsWith(prefix)) {
    fail(`Release ${tag} does not have an anchored source receipt`);
  }
  const workflowRunId = expectWorkflowRunId(
    firstLine.slice(prefix.length),
    "Release receipt workflow run id",
  );
  exactWorkflowPublishedRelease({
    repository: coordinate,
    value: release,
    verifiedSha: sha,
    verifiedTag: tag,
    workflowRunId,
  }, label);
  return workflowRunId;
}

function expectReleaseOwner(value, label) {
  const actor = expectRecord(value, label);
  if (
    (actor.id !== RELEASE_OWNER.id || actor.type !== RELEASE_OWNER.type)
    && (actor.id !== RELEASE_TAGGER.id || actor.type !== RELEASE_TAGGER.type)
  ) {
    fail(`${label} is not the exact release owner or release tagger`);
  }
}

function expectReleaseRepository(value, repository, label) {
  const exact = expectRecord(value, label);
  if (
    exact.id !== GHOSTGET_REPOSITORY_ID
    || exact.full_name !== repository
    || exact.private !== false
  ) {
    fail(`${label} is not the exact public Ghostget repository`);
  }
}

/** The jobs that build, attest, and publish the canonical GitHub Release; later npm jobs cannot revoke a published Release. */
export const CANONICAL_RELEASE_JOBS = Object.freeze([
  "Authorize owner release tag",
  "Verify",
  "Attest exact canonical build files",
  "Publish immutable GitHub Release",
]);

/** The canonical jobs a failed-jobs rerun carries unchanged, with their outputs and attested artifact. */
const ATTESTING_RELEASE_JOBS = Object.freeze(CANONICAL_RELEASE_JOBS.slice(0, 3));
const PUBLISH_RELEASE_JOB = CANONICAL_RELEASE_JOBS[3];

function exactReleaseJobInventory(value, label) {
  const payload = expectRecord(value, label);
  const jobs = payload.jobs;
  if (!Array.isArray(jobs) || jobs.length > 20 || payload.total_count !== jobs.length) {
    fail(`${label} is not one complete bounded job inventory`);
  }
  return jobs.map((job, index) => expectRecord(job, `${label}.jobs[${index}]`));
}

function exactReleaseJob(records, name, label) {
  const matches = records.filter((job) => job.name === name);
  if (matches.length !== 1) fail(`${label} does not contain exactly one ${name} job`);
  return matches[0];
}

function completedReleaseJob(job, { runId, runAttempt, sha }) {
  return job.run_id === Number(runId)
    && job.run_attempt === runAttempt
    && job.head_sha === sha
    && job.status === "completed";
}

function exactSuccessfulReleaseJobs(records, names, binding, label, attempt) {
  for (const name of names) {
    const job = exactReleaseJob(records, name, label);
    if (!completedReleaseJob(job, binding) || job.conclusion !== "success") {
      fail(`${label} ${name} job did not succeed in ${attempt}`);
    }
  }
}

function exactCompletedReleaseWorkflowRun({
  expectedRunAttempt = "",
  repository,
  value,
  verifiedSha,
  verifiedTag,
  workflowRunId,
}, label = "Release workflow run") {
  const coordinate = expectRepository(repository);
  const sha = expectSha(verifiedSha, "verified SHA");
  const tag = expectStableTag(verifiedTag, "verified tag");
  const runId = expectWorkflowRunId(workflowRunId, "verified Release workflow run id");
  const run = expectRecord(value, label);
  const runAttempt = expectSafeId(run.run_attempt, `${label}.run_attempt`);
  const expectedAttemptText = expectString(expectedRunAttempt, "expected Release run attempt");
  if (
    expectedAttemptText !== ""
    && runAttempt !== Number(expectWorkflowRunId(expectedAttemptText, "expected Release run attempt"))
  ) {
    fail(`${label} does not match the triggering Release run attempt`);
  }
  expectReleaseOwner(run.actor, `${label}.actor`);
  expectReleaseOwner(run.triggering_actor, `${label}.triggering_actor`);
  expectReleaseRepository(run.repository, coordinate, `${label}.repository`);
  expectReleaseRepository(run.head_repository, coordinate, `${label}.head_repository`);
  if (
    run.id !== Number(runId)
    || run.workflow_id !== RELEASE_WORKFLOW.id
    || run.path !== RELEASE_WORKFLOW.path
    || run.event !== "push"
    || run.head_branch !== tag
    || run.head_sha !== sha
    || run.status !== "completed"
  ) {
    fail(`${label} does not have the exact successful Release workflow identity`);
  }
  return Object.freeze({ run, runAttempt, runId, sha });
}

/**
 * The first canonical job that is not a completed success of exactly this
 * run, attempt, and source SHA, or undefined when all four are. A missing or
 * duplicated canonical job fails closed.
 */
function firstUnprovenCanonicalJob(records, binding, label) {
  return CANONICAL_RELEASE_JOBS.find((name) => {
    const job = exactReleaseJob(records, name, label);
    return !completedReleaseJob(job, binding) || job.conclusion !== "success";
  });
}

/**
 * The attempts strictly between a receipt attempt that attested but did not
 * publish and the latest attempt, in ascending order. More than
 * MAX_INTERMEDIATE_RELEASE_ATTEMPTS fails closed before any read.
 */
function intermediateReleaseAttempts(receiptAttempt, latestAttempt, label) {
  const count = latestAttempt - receiptAttempt - 1;
  if (count <= 0) return [];
  if (count > MAX_INTERMEDIATE_RELEASE_ATTEMPTS) {
    fail(`${label} has ${String(count)} attempts after its receipt attempt, beyond the bounded ${String(MAX_INTERMEDIATE_RELEASE_ATTEMPTS)}`);
  }
  return Array.from({ length: count }, (_, index) => receiptAttempt + 1 + index);
}

/**
 * One intermediate attempt of this exact run: its own attempt record must
 * carry the exact owner actor and triggering actor, repository, workflow ID
 * and path, tag-push event, tag, and SHA, be completed, and name that attempt.
 * Any drift fails closed before its job inventory is read.
 */
function exactIntermediateReleaseAttempt(coordinates, attempt, runValue, label) {
  const { runId, sha } = exactCompletedReleaseWorkflowRun({
    ...coordinates,
    expectedRunAttempt: String(attempt),
    value: runValue,
  }, `${label} attempt ${String(attempt)}`);
  return Object.freeze({ runId, runAttempt: attempt, sha });
}

/**
 * Whether that attempt's own complete bounded job inventory proves all four
 * canonical jobs; an attempt that merely did not publish is not admitted.
 */
function intermediateAttemptPublished(binding, jobsValue, label) {
  const jobsLabel = `${label} attempt ${String(binding.runAttempt)} jobs`;
  return firstUnprovenCanonicalJob(exactReleaseJobInventory(jobsValue, jobsLabel), binding, jobsLabel) === undefined;
}

export function exactReleaseWorkflowRun({
  canonicalJobs,
  readAttemptJobs,
  readAttemptRun,
  readCurrentRun,
  ...coordinates
}, label = "Release workflow run") {
  const { run, runAttempt, runId, sha } = exactCompletedReleaseWorkflowRun(coordinates, label);
  if (run.conclusion === "success") return run;
  // A receipt attempt whose four canonical jobs succeeded published the
  // immutable Release even when a later npm job failed that attempt; the
  // caller must supply that attempt's job inventory to admit it.
  if (canonicalJobs === undefined) {
    fail(`${label} does not have the exact successful Release workflow identity`);
  }
  const jobsLabel = `${label} jobs`;
  const receipt = Object.freeze({ runId, runAttempt, sha });
  const jobs = exactReleaseJobInventory(canonicalJobs, jobsLabel);
  exactSuccessfulReleaseJobs(jobs, ATTESTING_RELEASE_JOBS, receipt, jobsLabel, "the receipt attempt");
  const publish = exactReleaseJob(jobs, PUBLISH_RELEASE_JOB, jobsLabel);
  if (completedReleaseJob(publish, receipt) && publish.conclusion === "success") return run;
  // Rerunning only the failed jobs of this same run carries the receipt
  // attempt's attested artifact unchanged, so a later attempt of this run may
  // complete its publication. That later attempt must itself prove all four
  // canonical jobs; any other run or rebuilt attempt stays inadmissible.
  if (
    !completedReleaseJob(publish, receipt)
    || typeof readCurrentRun !== "function"
    || typeof readAttemptJobs !== "function"
  ) {
    fail(`${jobsLabel} ${PUBLISH_RELEASE_JOB} job did not succeed in the receipt attempt`);
  }
  const current = exactCompletedReleaseWorkflowRun({
    ...coordinates,
    expectedRunAttempt: "",
    value: readCurrentRun(),
  }, `${label} current attempt`);
  if (current.runAttempt <= runAttempt) {
    fail(`${label} publication was not completed by a later attempt of the same run`);
  }
  const currentLabel = `${label} current attempt jobs`;
  const unproven = firstUnprovenCanonicalJob(
    exactReleaseJobInventory(readAttemptJobs(current.runAttempt), currentLabel),
    Object.freeze({ runId, runAttempt: current.runAttempt, sha }),
    currentLabel,
  );
  if (unproven === undefined) return run;
  // A failed-jobs rerun may have published before a later rerun of all jobs
  // failed; only an exact intermediate attempt whose own inventory proves all
  // four canonical jobs can then admit the receipt attempt (plan D15).
  const intermediates = intermediateReleaseAttempts(runAttempt, current.runAttempt, label);
  if (intermediates.length === 0) {
    fail(`${currentLabel} ${unproven} job did not succeed in the current attempt`);
  }
  const identity = Object.freeze({
    repository: coordinates.repository,
    verifiedSha: coordinates.verifiedSha,
    verifiedTag: coordinates.verifiedTag,
    workflowRunId: coordinates.workflowRunId,
  });
  if (typeof readAttemptRun === "function") {
    for (const attempt of intermediates) {
      const binding = exactIntermediateReleaseAttempt(identity, attempt, readAttemptRun(attempt), label);
      if (intermediateAttemptPublished(binding, readAttemptJobs(attempt), label)) return run;
    }
  }
  fail(`${currentLabel} ${unproven} job did not succeed in the current attempt, and no intermediate attempt proved the four canonical jobs`);
}

const RELEASE_ATTEMPT_RECEIPT = /^ghostget-release-attempt-v1 run_attempt=([1-9][0-9]{0,8})$/u;

/**
 * The attempt line the publisher writes after the source receipt. The body is
 * mutable control-plane data, so this only selects which bounded job inventory
 * to read; that inventory alone is authority.
 */
function releaseReceiptAttemptHint(value) {
  const release = expectRecord(value, "Release receipt");
  if (typeof release.body !== "string" || typeof release.tag_name !== "string") return undefined;
  const lines = releaseBodyIdentity(release.body, release.tag_name)?.split("\n", 3) ?? [];
  const match = lines[1] === "" ? RELEASE_ATTEMPT_RECEIPT.exec(lines[2] ?? "") : null;
  return match === null ? undefined : Number(match[1]);
}

function exactLatestRelease(value, label) {
  const release = expectRecord(value, label);
  const tag = expectStableTag(release.tag_name, `${label} tag`);
  return Object.freeze({
    release: exactPublishedRelease(release, tag, label),
    tag,
  });
}

export function exactLatestPredecessor(value, verifiedTag) {
  const tag = expectStableTag(verifiedTag, "verified tag");
  const predecessor = exactLatestRelease(value, "pre-publication Latest Release");
  if (
    compareStableVersions(
      stableVersion(predecessor.tag, "pre-publication Latest Release tag"),
      stableVersion(tag, "verified tag"),
    ) >= 0
  ) {
    fail(`pre-publication Latest Release must be strictly older than ${tag}`);
  }
  return predecessor;
}

function assertSameReleaseIdentity(actual, expected, label) {
  if (actual.id !== expected.id || actual.published_at !== expected.published_at) {
    fail(`${label} does not bind the immutable target Release`);
  }
}

export function validateMatchingPublishedReleases(
  actualValue,
  expectedValue,
  { repository, verifiedSha, verifiedTag, workflowRunId },
) {
  const tag = expectStableTag(verifiedTag, "verified tag");
  const coordinates = { repository, verifiedSha, verifiedTag: tag, workflowRunId };
  const actual = exactWorkflowPublishedRelease(
    { ...coordinates, value: actualValue },
    `Release ${tag} readback`,
  );
  const expected = exactWorkflowPublishedRelease(
    { ...coordinates, value: expectedValue },
    `created Release ${tag}`,
  );
  assertSameReleaseIdentity(actual, expected, `Release ${tag} readback`);
  return Object.freeze({ releaseId: actual.id, tag });
}

function readLatestConvergenceClock(monotonicNow, prior, label) {
  const value = monotonicNow();
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${label} is not a finite nonnegative monotonic timestamp`);
  }
  if (prior !== undefined && value < prior) {
    fail("Latest Release convergence monotonic clock regressed");
  }
  return value;
}

export async function waitForLatestRelease({
  api,
  maxAttempts = LATEST_RELEASE_MAX_ATTEMPTS,
  monotonicNow = () => performance.now(),
  pollIntervalMilliseconds = LATEST_RELEASE_POLL_INTERVAL_MILLISECONDS,
  predecessorRelease,
  repository,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  targetRelease,
  verifiedTag,
}) {
  const coordinate = expectRepository(repository);
  const tag = expectStableTag(verifiedTag, "verified tag");
  const target = exactPublishedRelease(targetRelease, tag, `Release ${tag}`);
  const predecessor = exactLatestPredecessor(predecessorRelease, tag);
  if (
    !Number.isSafeInteger(maxAttempts)
    || maxAttempts <= 0
    || maxAttempts > LATEST_RELEASE_MAX_ATTEMPTS
  ) {
    fail(`Latest Release maxAttempts must be between 1 and ${String(LATEST_RELEASE_MAX_ATTEMPTS)}`);
  }
  if (
    !Number.isSafeInteger(pollIntervalMilliseconds)
    || pollIntervalMilliseconds < 0
    || pollIntervalMilliseconds > LATEST_RELEASE_POLL_INTERVAL_MILLISECONDS
  ) {
    fail(
      `Latest Release poll interval must be between 0 and ${String(LATEST_RELEASE_POLL_INTERVAL_MILLISECONDS)} milliseconds`,
    );
  }
  if (typeof monotonicNow !== "function" || typeof sleep !== "function") {
    fail("Latest Release convergence clock or sleep is unavailable");
  }
  let prior = readLatestConvergenceClock(monotonicNow, undefined, "Latest Release convergence start");
  const startedAt = prior;
  const deadline = startedAt + LATEST_RELEASE_CONVERGENCE_DEADLINE_MILLISECONDS;
  if (!Number.isFinite(deadline) || deadline > Number.MAX_SAFE_INTEGER || deadline <= startedAt) {
    fail("Latest Release convergence deadline overflows the monotonic clock");
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const before = readLatestConvergenceClock(
      monotonicNow,
      prior,
      "Latest Release convergence request start",
    );
    prior = before;
    const remaining = deadline - before;
    if (remaining < 1) fail(`Release ${tag} did not converge as Latest within 60 seconds`);
    const rawLatest = expectRecord(
      await api.get(
        `/repos/${coordinate}/releases/latest`,
        Object.freeze({
          timeoutMilliseconds: Math.min(
            LATEST_RELEASE_REQUEST_TIMEOUT_MILLISECONDS,
            Math.floor(remaining),
          ),
        }),
      ),
      "Latest Release convergence response",
    );
    const after = readLatestConvergenceClock(
      monotonicNow,
      prior,
      "Latest Release convergence request completion",
    );
    prior = after;
    if (after > deadline) fail(`Release ${tag} did not converge as Latest within 60 seconds`);
    const latest = exactLatestRelease(rawLatest, "Latest Release convergence response");
    if (latest.tag === tag) {
      assertSameReleaseIdentity(latest.release, target, `Latest Release ${tag}`);
      return Object.freeze({
        attempts: attempt,
        releaseId: latest.release.id,
        tag,
      });
    }
    if (
      latest.tag !== predecessor.tag
      || latest.release.id !== predecessor.release.id
      || latest.release.published_at !== predecessor.release.published_at
    ) {
      fail(`Latest Release changed from the pinned predecessor before ${tag} converged`);
    }
    if (attempt === maxAttempts) {
      fail(`Release ${tag} did not converge as Latest within the bounded attempt budget`);
    }
    if (pollIntervalMilliseconds === 0) continue;
    const scheduleTarget = startedAt + attempt * pollIntervalMilliseconds;
    for (let sleepAttempt = 1; sleepAttempt <= MAX_SLEEP_ATTEMPTS_PER_INTERVAL; sleepAttempt += 1) {
      const now = readLatestConvergenceClock(
        monotonicNow,
        prior,
        "Latest Release convergence sleep start",
      );
      prior = now;
      if (now >= scheduleTarget) break;
      await sleep(scheduleTarget - now);
      const woke = readLatestConvergenceClock(
        monotonicNow,
        prior,
        "Latest Release convergence sleep completion",
      );
      prior = woke;
      if (woke >= scheduleTarget) break;
      if (sleepAttempt === MAX_SLEEP_ATTEMPTS_PER_INTERVAL) {
        fail("Latest Release convergence sleep did not reach its monotonic schedule");
      }
    }
  }
  fail(`Release ${tag} did not converge as Latest`);
}

export async function requireLatestRelease({
  api,
  repository,
  targetRelease,
  verifiedTag,
}) {
  const coordinate = expectRepository(repository);
  const tag = expectStableTag(verifiedTag, "verified tag");
  const target = exactPublishedRelease(targetRelease, tag, `Release ${tag}`);
  const latest = exactLatestRelease(
    await api.get(
      `/repos/${coordinate}/releases/latest`,
      Object.freeze({ timeoutMilliseconds: LATEST_RELEASE_REQUEST_TIMEOUT_MILLISECONDS }),
    ),
    "Latest Release",
  );
  if (latest.tag !== tag) {
    fail(`Release ${tag} is no longer Latest; recover from the current immutable Latest Release`);
  }
  assertSameReleaseIdentity(latest.release, target, `Latest Release ${tag}`);
  return Object.freeze({ releaseId: latest.release.id, tag });
}

export async function revalidateLatestReleaseProjection({
  api,
  repository,
  targetRelease,
  verifiedTag,
}) {
  const coordinate = expectRepository(repository);
  const tag = expectStableTag(verifiedTag, "verified tag");
  const target = exactPublishedRelease(targetRelease, tag, `Release ${tag}`);
  const options = Object.freeze({
    timeoutMilliseconds: LATEST_RELEASE_REQUEST_TIMEOUT_MILLISECONDS,
  });
  const exactRelease = exactPublishedRelease(
    await api.get(`/repos/${coordinate}/releases/tags/${tag}`, options),
    tag,
    `terminal Release ${tag}`,
  );
  assertSameReleaseIdentity(exactRelease, target, `terminal Release ${tag}`);
  const latest = exactLatestRelease(
    await api.get(`/repos/${coordinate}/releases/latest`, options),
    "terminal Latest Release",
  );
  if (latest.tag !== tag) {
    fail(`Release ${tag} is no longer Latest; recover from the current immutable Latest Release`);
  }
  assertSameReleaseIdentity(latest.release, target, `terminal Latest Release ${tag}`);
  return Object.freeze({
    releaseId: latest.release.id,
    tag,
  });
}

const invokedPath = process.argv[1];