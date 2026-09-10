import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

// No package imports: both entry points run before the frozen dependency install.
const REPOSITORY = "hraness/wrench";
const REPOSITORY_ID = 1316443113;
const PREFIX = `repos/${REPOSITORY}`;
const MAIN_REF = "refs/heads/main";
const CI_WORKFLOW = 323493607;
const CI_PATH = ".github/workflows/ci.yml";
const CODEQL_WORKFLOW = 351099999;
const CODEQL_PATH = "dynamic/github-code-scanning/codeql";
const MARKER = "WRENCH_SOURCE_CI_IDENTITY=";
const SHA = /^[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const JOBS = ["static", "package", "test 1/4", "test 2/4", "test 3/4", "test 4/4", "test-omni", "standalone", "macOS", "Required"];
const CODEQL_JOBS = ["Analyze (javascript-typescript)", "Analyze (actions)"];
const TOOLCHAIN = { node: "24.20.0", npm: "11.19.0", bun: "1.3.14" } as const;
const MAXIMUM_EVIDENCE_AGE = 72 * 60 * 60 * 1000;
type ObjectValue = Record<string, unknown>;
export type SourceCiInput = Readonly<{ source: string; tree: string; main: string; workflowSha256: string; lockSha256: string }>;
export type SourceCiReader = (path: string, format?: "log") => unknown;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Source CI admission: ${message}`);
}
function object(value: unknown): ObjectValue {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), "expected an object");
  return value as ObjectValue;
}
function array(value: unknown): unknown[] {
  requireValue(Array.isArray(value) && value.length < 100, "missing or truncated inventory");
  return value;
}
function integer(value: unknown): number {
  requireValue(Number.isSafeInteger(value) && (value as number) > 0, "invalid positive identity");
  return value as number;
}
function text(value: unknown): string {
  requireValue(typeof value === "string" && value.length > 0 && value.length <= 512, "invalid text identity");
  return value;
}
function digest(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function repository(value: unknown): void {
  const data = object(value);
  requireValue(data.id === REPOSITORY_ID && data.full_name === REPOSITORY, "foreign repository");
}
function inventory(value: unknown, key: string): ObjectValue[] {
  const data = object(value); const entries = array(data[key]).map(object);
  requireValue(data.total_count === entries.length, "incomplete inventory");
  requireValue(new Set(entries.map(entry => integer(entry.id))).size === entries.length, "duplicate provider identity");
  return entries;
}
function timestamp(value: unknown): number {
  const encoded = text(value);
  requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(encoded), "invalid provider timestamp");
  const result = Date.parse(encoded);
  requireValue(Number.isFinite(result) && new Date(result).toISOString() === `${encoded.slice(0, -1)}.000Z`, "invalid provider timestamp");
  return result;
}

/** Validate the one pre-install record against provider-owned run/job coordinates. */
export function verifySourceCiLog(log: unknown, input: SourceCiInput, runId: number, attempt: number, job: string): ObjectValue {
  requireValue(typeof log === "string" && Buffer.byteLength(log) <= 16 * 1024 * 1024, "missing or oversized job log");
  const lines = log.split(/\r?\n/u);
  const checkouts = lines.flatMap((line, index) => /\[command\].*\/git log -1 --format=%H$/u.test(line)
    ? [lines[index + 1]?.trim().split(/\s+/u).at(-1)] : []);
  requireValue(isDeepStrictEqual(checkouts, [input.source]), "actual checkout does not bind exact source");
  const records = lines.filter(line => /^\d{4}-\d\d-\d\dT[^ ]+Z WRENCH_SOURCE_CI_IDENTITY=/u.test(line));
  requireValue(records.length === 1, "missing or duplicate pre-install identity");
  const record = object(JSON.parse(records[0]!.slice(records[0]!.indexOf(MARKER) + MARKER.length)) as unknown);
  const expected = {
    schema: "wrench-source-ci-v1", repositoryId: REPOSITORY_ID, source: input.source, tree: input.tree,
    workflowCommit: input.source, workflowSha256: input.workflowSha256, lockSha256: input.lockSha256,
    runId, runAttempt: attempt, ...TOOLCHAIN, platform: job === "macOS" ? "darwin" : "linux",
    runnerEnvironment: "github-hosted", event: "push", ref: MAIN_REF,
  };
  requireValue(isDeepStrictEqual(record, expected), "source, workflow, lock, toolchain, runner, or attempt record differs");
  return { job, source: input.source, tree: input.tree, logSha256: digest(log), identity: record };
}

function selectRun(read: SourceCiReader, input: SourceCiInput, workflowId: number, path: string, event: string, now: number) {
  const workflow = object(read(`${PREFIX}/actions/workflows/${workflowId}`));
  requireValue(workflow.id === workflowId && workflow.path === path && workflow.state === "active", "workflow authority changed");
  const candidates = inventory(read(`${PREFIX}/actions/workflows/${workflowId}/runs?head_sha=${input.source}&branch=main&event=${event}&per_page=100`), "workflow_runs");
  requireValue(candidates.length === 1, "exact-source workflow run is missing or ambiguous");
  const runId = integer(candidates[0]!.id);
  const current = object(read(`${PREFIX}/actions/runs/${runId}`));
  const attempt = integer(current.run_attempt);
  const run = object(read(`${PREFIX}/actions/runs/${runId}/attempts/${attempt}`));
  for (const value of [current, run]) {
    requireValue(value.id === runId && value.run_attempt === attempt && value.workflow_id === workflowId && value.path === path && value.event === event
      && value.head_sha === input.source && value.head_branch === "main" && value.status === "completed" && value.conclusion === "success",
    "source run is not the successful current main attempt");
    repository(value.repository); repository(value.head_repository);
  }
  requireValue(candidates[0]!.run_attempt === attempt && candidates[0]!.head_sha === input.source, "listed run attempt drifted");
  requireValue(timestamp(run.run_started_at) <= timestamp(run.updated_at), "invalid run interval");
  const jobs = inventory(read(`${PREFIX}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`), "jobs");
  const expected = workflowId === CI_WORKFLOW ? JOBS : CODEQL_JOBS;
  requireValue(isDeepStrictEqual(jobs.map(job => job.name).sort(), [...expected].sort()), "complete successful job union is required");
  for (const job of jobs) {
    requireValue(job.run_id === runId && job.run_attempt === attempt && job.head_sha === input.source
      && job.status === "completed" && job.conclusion === "success", "job source, attempt, or result differs");
    const started = timestamp(job.started_at); const completed = timestamp(job.completed_at);
    requireValue(started >= timestamp(run.run_started_at) && started <= completed && completed <= now
      && now - completed <= MAXIMUM_EVIDENCE_AGE, "job evidence is future, stale, or outside its attempt");
    if (workflowId === CI_WORKFLOW && job.name !== "Required") {
      const records = array(job.steps).map(object).filter(step => step.name === "Record exact source CI identity");
      requireValue(records.length === 1 && records[0]!.status === "completed" && records[0]!.conclusion === "success",
        "pre-install identity step did not succeed");
    }
  }
  return { workflow, run, jobs, runId, attempt };
}

function comparison(read: SourceCiReader, source: string, pr?: ObjectValue) {
  const checks = inventory(read(`${PREFIX}/commits/${source}/check-runs?per_page=100&filter=latest`), "check_runs");
  const matching = checks.filter(check => check.name === "CodeQL" && object(check.app).id === 57789);
  requireValue(pr === undefined ? matching.length <= 1 : matching.length === 1, "missing or ambiguous CodeQL comparison");
  for (const check of matching) {
    requireValue(check.head_sha === source && check.status === "completed" && check.conclusion === "success",
      "CodeQL security comparison did not succeed");
    if (pr !== undefined) {
      const associations = array(check.pull_requests).map(object).filter(value => value.number === pr.number);
      requireValue(associations.length === 1, "security comparison belongs to another pull request");
      const associated = associations[0]!; const head = object(associated.head); const base = object(associated.base);
      requireValue(associated.id === integer(pr.id) && associated.url === `https://api.github.com/${PREFIX}/pulls/${integer(pr.number)}`
        && head.sha === source && base.ref === "main", "security pull request association differs");
      for (const value of [head.repo, base.repo]) {
        const repo = object(value);
        requireValue(repo.id === REPOSITORY_ID && repo.url === `https://api.github.com/${PREFIX}`, "foreign security comparison repository");
      }
    }
  }
  return matching.map(check => ({ id: integer(check.id), source, conclusion: check.conclusion }));
}

function security(read: SourceCiReader, input: SourceCiInput, codeql: ReturnType<typeof selectRun>) {
  const candidates = array(read(`${PREFIX}/commits/${input.source}/pulls?per_page=100`)).map(object)
    .filter(pr => pr.merge_commit_sha === input.source && pr.merged_at !== null);
  requireValue(candidates.length === 1, "source must belong to exactly one merged pull request");
  const number = integer(candidates[0]!.number);
  const pr = object(read(`${PREFIX}/pulls/${number}`));
  const base = object(pr.base); const head = object(pr.head);
  requireValue(pr.number === number && pr.merged === true && pr.state === "closed" && pr.merge_commit_sha === input.source
    && base.ref === "main", "merged pull request identity differs");
  repository(base.repo); repository(head.repo);
  const headSha = text(head.sha); requireValue(SHA.test(headSha), "invalid reviewed PR source");
  const headCommit = object(read(`${PREFIX}/git/commits/${headSha}`));
  requireValue(headCommit.sha === headSha && object(headCommit.tree).sha === input.tree, "reviewed PR tree differs from release source");
  const prComparison = comparison(read, headSha, pr);
  const mainComparison = comparison(read, input.source);
  const intervalStart = Math.min(...codeql.jobs.map(job => timestamp(job.started_at)));
  const intervalEnd = Math.max(...codeql.jobs.map(job => timestamp(job.completed_at)));
  const analyses = array(read(`${PREFIX}/code-scanning/analyses?ref=refs%2Fheads%2Fmain&tool_name=CodeQL&per_page=100`))
    .map(object).filter(analysis => analysis.commit_sha === input.source
      && timestamp(analysis.created_at) >= intervalStart && timestamp(analysis.created_at) <= intervalEnd);
  requireValue(analyses.length === 2 && new Set(analyses.map(analysis => integer(analysis.id))).size === 2
    && isDeepStrictEqual(analyses.map(analysis => analysis.category).sort(), ["/language:actions", "/language:javascript-typescript"]),
  "exact main CodeQL analyses are missing or ambiguous");
  const exactAnalyses = analyses.map(analysis => {
    const id = integer(analysis.id); const category = text(analysis.category); const tool = object(analysis.tool);
    const environment = object(JSON.parse(text(analysis.environment)) as unknown);
    const languageJob = codeql.jobs.find(job => job.name === `Analyze (${category.slice("/language:".length)})`)!;
    requireValue(analysis.ref === MAIN_REF && analysis.analysis_key === `${CODEQL_PATH}:analyze` && tool.name === "CodeQL"
      && analysis.error === "" && analysis.warning === "" && environment.category === category
      && environment.language === category.slice("/language:".length)
      && timestamp(analysis.created_at) >= timestamp(languageJob.started_at)
      && timestamp(analysis.created_at) <= timestamp(languageJob.completed_at)
      && analysis.url === `https://api.github.com/${PREFIX}/code-scanning/analyses/${id}`,
    "CodeQL analysis source, configuration, time, or outcome differs");
    requireValue(Number.isSafeInteger(analysis.results_count) && (analysis.results_count as number) >= 0, "invalid analysis result count");
    return { id, category, source: input.source, ref: MAIN_REF, createdAt: analysis.created_at,
      toolVersion: text(tool.version), resultsCount: analysis.results_count };
  }).sort((left, right) => left.category.localeCompare(right.category));
  return { pullRequest: number, reviewedHead: headSha, sameMergedTree: input.tree, prComparison, mainComparison, exactAnalyses,
    distinction: "Successful PR security comparison and successful exact-main analyses; result counts do not assert zero alerts." };
}

/** One read-only admission, with a fresh second control snapshot; never polls or dispatches CI. */
export function admitSourceCi(input: SourceCiInput, read: SourceCiReader, clock: () => number = Date.now) {
  requireValue([input.source, input.tree, input.main].every(value => SHA.test(value))
    && [input.workflowSha256, input.lockSha256].every(value => HASH.test(value)), "invalid source coordinates");
  const snapshot = () => {
    const now = clock(); requireValue(Number.isSafeInteger(now) && now > 0, "invalid admission clock");
    const main = object(read(`${PREFIX}/git/ref/heads/main`));
    requireValue(main.ref === MAIN_REF && object(main.object).type === "commit" && object(main.object).sha === input.main, "current main moved");
    const source = object(read(`${PREFIX}/git/commits/${input.source}`));
    requireValue(source.sha === input.source && object(source.tree).sha === input.tree, "provider source tree differs");
    const ci = selectRun(read, input, CI_WORKFLOW, CI_PATH, "push", now);
    const codeql = selectRun(read, input, CODEQL_WORKFLOW, CODEQL_PATH, "dynamic", now);
    const securityEvidence = security(read, input, codeql);
    return { ci, codeql, security: securityEvidence };
  };
  const first = snapshot();
  const checkouts = first.ci.jobs.filter(job => job.name !== "Required").map(job => ({
    id: integer(job.id), ...verifySourceCiLog(read(`${PREFIX}/actions/jobs/${integer(job.id)}/logs`, "log"), input,
      first.ci.runId, first.ci.attempt, text(job.name)),
  }));
  requireValue(isDeepStrictEqual(first, snapshot()), "source or provider evidence changed during admission");
  const receiptRun = (value: ReturnType<typeof selectRun>) => ({ id: value.runId, attempt: value.attempt,
    workflowId: value.run.workflow_id, jobs: value.jobs.map(job => ({ id: job.id, name: job.name, conclusion: job.conclusion,
      startedAt: job.started_at, completedAt: job.completed_at })) });
  return { schema: "wrench-release-source-admission-v1", repository: REPOSITORY, ...input,
    maximumEvidenceAgeHours: 72, ci: receiptRun(first.ci), codeql: receiptRun(first.codeql), security: first.security, checkouts };
}

function environment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("WRENCH_RELEASE_APP_")));
}
function command(program: string, args: readonly string[], maxBuffer = 256 * 1024, timeout = 60_000): string {
  const result = spawnSync(program, args, { env: environment(), encoding: "utf8", timeout, maxBuffer, stdio: ["ignore", "pipe", "pipe"] });
  requireValue(result.error === undefined && result.status === 0 && result.signal === null, "bounded read-only command failed");
  return result.stdout;
}
function localSource(): Omit<SourceCiInput, "main"> {
  requireValue(command("git", ["status", "--porcelain=v1", "--untracked-files=all"]).trim() === "", "checkout is not clean");
  const source = command("git", ["rev-parse", "HEAD"]).trim();
  const tree = command("git", ["rev-parse", "HEAD^{tree}"]).trim();
  requireValue(SHA.test(source) && SHA.test(tree) && source === process.env.GITHUB_SHA, "local checkout differs from event source");
  return { source, tree, workflowSha256: digest(readFileSync(CI_PATH)), lockSha256: digest(readFileSync("bun.lock")) };
}
function githubEnvironment(): void {
  requireValue(process.env.GITHUB_REPOSITORY === REPOSITORY && process.env.GITHUB_REPOSITORY_ID === String(REPOSITORY_ID)
    && process.env.RUNNER_ENVIRONMENT === "github-hosted", "requires the exact GitHub-hosted repository");
}
function toolchain() {
  const actual = { node: command("node", ["--version"]).trim().replace(/^v/u, ""), npm: command("npm", ["--version"]).trim(),
    bun: command("bun", ["--version"]).trim() };
  requireValue(isDeepStrictEqual(actual, TOOLCHAIN), "actual Node/npm/Bun versions differ"); return actual;
}

if (import.meta.main) {
  try {
    githubEnvironment();
    const mode = process.argv[2];
    requireValue(process.argv.length === 3 && (mode === "record" || mode === "admit"), "expected record or admit");
    const local = localSource();
    if (mode === "record") {
      requireValue(process.env.GITHUB_WORKFLOW_SHA === local.source && (process.env.GITHUB_EVENT_NAME === "push"
        || process.env.GITHUB_EVENT_NAME === "pull_request"), "unexpected CI workflow source or event");
      const runId = integer(Number(process.env.GITHUB_RUN_ID)); const runAttempt = integer(Number(process.env.GITHUB_RUN_ATTEMPT));
      requireValue(process.platform === "linux" || process.platform === "darwin", "unsupported source platform");
      console.log(MARKER + JSON.stringify({ schema: "wrench-source-ci-v1", repositoryId: REPOSITORY_ID, ...local,
        workflowCommit: local.source, runId, runAttempt, ...toolchain(), platform: process.platform,
        runnerEnvironment: "github-hosted", event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF }));
    } else {
      requireValue(process.env.GITHUB_EVENT_NAME === "push" && /^refs\/tags\/v\d+\.\d+\.\d+$/u.test(process.env.GITHUB_REF ?? "")
        && process.env.DEFAULT_BRANCH === "main" && local.source === process.env.VERIFIED_SOURCE_SHA, "requires verified tag-source authority");
      toolchain();
      const deadline = performance.now() + 600_000; let requests = 0;
      const reader: SourceCiReader = (path, format) => {
        requireValue(path.startsWith(`${PREFIX}/`) && !/[\r\n#]/u.test(path) && ++requests <= 80, "read request exceeds authority or bound");
        const remaining = deadline - performance.now(); requireValue(remaining > 0, "read admission deadline expired");
        const result = command("gh", ["api", "--method", "GET", "--hostname", "github.com", path],
          format === "log" ? 16 * 1024 * 1024 : 2 * 1024 * 1024, Math.min(60_000, Math.ceil(remaining)));
        return format === "log" ? result : JSON.parse(result) as unknown;
      };
      const receipt = admitSourceCi({ ...local, main: process.env.VERIFIED_MAIN_SHA ?? "" }, reader);
      requireValue(isDeepStrictEqual(local, localSource()), "local source changed during admission");
      console.log(JSON.stringify(receipt));
    }
  } catch (error) {
    console.error(error instanceof Error && error.message.startsWith("Source CI admission:") ? error.message : "Source CI admission: malformed evidence");
    process.exitCode = 1;
  }
}
