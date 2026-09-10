import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { admitSourceCi, verifySourceCiLog, type SourceCiInput } from "./release-source-ci.js";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReleaseManifest, releaseAssetNames } from "../website/github-release-artifact.mjs";
import { attestationVerifyArguments, verifyBuildHandoff, verifyReleaseDirectory } from "./github-release-artifact.js";
import { publishCanonicalRelease, validateReleaseAssets } from "./github-release-publish.js";

const tag = "v0.17.0";
const sourceSha = "a".repeat(40);
const workflowSha = "b".repeat(40);
const manifest = parseReleaseManifest({ schema: "hraness-github-release-v1", repository: "hraness/ghostget", repositoryId: 1316443113,
  package: "@hraness/ghostget", version: "0.17.0", tag, sourceSha, workflowSha, workflow: ".github/workflows/release.yml",
  runId: 9001, runAttempt: 1, archive: { name: "hraness-ghostget-0.17.0.tgz", bytes: 4, sha256: "c".repeat(64), sha512: "d".repeat(128) } });
const body = `wrench-release-source-v1 repository=hraness/ghostget tag=${tag} source_sha=${sourceSha} workflow_run_id=9001\n\nghostget-release-attempt-v1 run_attempt=1`;
const names = releaseAssetNames(tag);
type Json = Record<string, any>;

function sourceCiFixture(attempt = 1, prNumber = 50) {
  const input: SourceCiInput = { source: "1".repeat(40), tree: "2".repeat(40), main: "3".repeat(40),
    workflowSha256: "4".repeat(64), lockSha256: "5".repeat(64) };
  const prefix = "repos/hraness/ghostget"; const head = "6".repeat(40);
  const repo = { id: 1316443113, full_name: "hraness/ghostget" };
  const responses: Json = {};
  responses[`${prefix}/git/ref/heads/main`] = { ref: "refs/heads/main", object: { type: "commit", sha: input.main } };
  for (const sha of [input.source, head]) responses[`${prefix}/git/commits/${sha}`] = { sha, tree: { sha: input.tree } };
  const ciNames = ["static", "package", "test 1/4", "test 2/4", "test 3/4", "test 4/4", "test-omni", "standalone", "macOS", "Required"];
  for (const [workflowId, path, event, runId, names] of [
    [323493607, ".github/workflows/ci.yml", "push", 100, ciNames],
    [351099999, "dynamic/github-code-scanning/codeql", "dynamic", 200, ["Analyze (javascript-typescript)", "Analyze (actions)"]],
  ] as const) {
    responses[`${prefix}/actions/workflows/${workflowId}`] = { id: workflowId, path, state: "active" };
    const run = { id: runId, workflow_id: workflowId, path, event, head_sha: input.source, head_branch: "main", run_attempt: attempt,
      repository: repo, head_repository: repo, status: "completed", conclusion: "success",
      run_started_at: "2026-09-09T01:00:00Z", updated_at: "2026-09-09T01:15:00Z" };
    responses[`${prefix}/actions/workflows/${workflowId}/runs?head_sha=${input.source}&branch=main&event=${event}&per_page=100`] = {
      total_count: 1, workflow_runs: [structuredClone(run)] };
    responses[`${prefix}/actions/runs/${runId}`] = structuredClone(run);
    responses[`${prefix}/actions/runs/${runId}/attempts/${attempt}`] = structuredClone(run);
    const jobs = names.map((name, index) => ({ id: runId * 10 + index, name, run_id: runId, run_attempt: attempt,
      head_sha: input.source, status: "completed", conclusion: "success",
      started_at: "2026-09-09T01:00:01Z", completed_at: "2026-09-09T01:14:00Z",
      steps: [{ name: "Record exact source CI identity", status: "completed", conclusion: "success" }] }));
    responses[`${prefix}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`] = { total_count: jobs.length, jobs };
    for (const job of jobs.filter(job => job.name !== "Required" && runId === 100)) {
      const identity = { schema: "wrench-source-ci-v1", repositoryId: repo.id, source: input.source, tree: input.tree,
        workflowCommit: input.source, workflowSha256: input.workflowSha256, lockSha256: input.lockSha256,
        runId, runAttempt: attempt, node: "24.20.0", npm: "11.19.0", bun: "1.3.14", platform: job.name === "macOS" ? "darwin" : "linux",
        runnerEnvironment: "github-hosted", event: "push", ref: "refs/heads/main" };
      responses[`${prefix}/actions/jobs/${job.id}/logs`] = `2026-09-09T01:00:01.123Z [command]/usr/bin/git log -1 --format=%H\n2026-09-09T01:00:01.124Z ${input.source}\n2026-09-09T01:00:02.000Z WRENCH_SOURCE_CI_IDENTITY=${JSON.stringify(identity)}\n`;
    }
  }
  const pr = { id: 9000, number: prNumber, merged: true, merged_at: "2026-09-09T00:50:00Z", state: "closed", merge_commit_sha: input.source,
    base: { ref: "main", repo }, head: { sha: head, repo } };
  responses[`${prefix}/commits/${input.source}/pulls?per_page=100`] = [pr];
  responses[`${prefix}/pulls/${prNumber}`] = pr;
  const associatedRepo = { id: repo.id, url: `https://api.github.com/${prefix}` };
  const securityCheck = { id: 700, head_sha: head, name: "CodeQL", app: { id: 57789 }, status: "completed", conclusion: "success",
    pull_requests: [{ number: prNumber, id: 9000, url: `https://api.github.com/${prefix}/pulls/${prNumber}`, head: { sha: head, repo: associatedRepo },
      base: { ref: "main", repo: associatedRepo } }] };
  responses[`${prefix}/commits/${head}/check-runs?per_page=100&filter=latest`] = { total_count: 1, check_runs: [securityCheck] };
  // The currently running Release is deliberately not a required source job.
  responses[`${prefix}/commits/${input.source}/check-runs?per_page=100&filter=latest`] = { total_count: 1,
    check_runs: [{ id: 701, name: "Verify", app: { id: 15368 }, head_sha: input.source, status: "in_progress", conclusion: null }] };
  const analyses = ["actions", "javascript-typescript"].map((language, index) => ({ id: 800 + index,
    commit_sha: input.source, category: `/language:${language}`, ref: "refs/heads/main", analysis_key: "dynamic/github-code-scanning/codeql:analyze",
    tool: { name: "CodeQL", version: "2.27.0" }, environment: JSON.stringify({ category: `/language:${language}`, language }),
    error: "", warning: "", created_at: "2026-09-09T01:10:00Z", url: `https://api.github.com/${prefix}/code-scanning/analyses/${800 + index}`, results_count: 41 }));
  responses[`${prefix}/code-scanning/analyses?ref=refs%2Fheads%2Fmain&tool_name=CodeQL&per_page=100`] = analyses;
  const calls: string[] = [];
  const read = (path: string): unknown => { calls.push(path); if (!(path in responses)) throw new Error(`Unexpected fixture path: ${path}`); return structuredClone(responses[path]); };
  return { input, responses, read, calls, prefix, head, analyses, clock: () => Date.parse("2026-09-09T02:00:00Z") };
}

describe("exact source CI admission", () => {
  test("admits all ten jobs and nine real checkouts with exact toolchains and distinct security evidence", () => {
    const fixture = sourceCiFixture(); const result = admitSourceCi(fixture.input, fixture.read, fixture.clock);
    expect(result.ci.jobs).toHaveLength(10); expect(result.checkouts).toHaveLength(9); expect(result.codeql.jobs).toHaveLength(2);
    expect(result.security.prComparison).toHaveLength(1); expect(result.security.mainComparison).toEqual([]);
    expect(result.security.exactAnalyses.map(value => value.resultsCount)).toEqual([41, 41]);
    expect(result.security.distinction).toContain("do not assert zero alerts");
    expect(fixture.calls.filter(path => path.endsWith("/logs"))).toHaveLength(9);
    expect(fixture.calls.filter(path => path.endsWith("/git/ref/heads/main"))).toHaveLength(2);
  });
  test("admits the renamed ghostget repository only with the exact immutable repository identity", () => {
    const renamed = (id: number) => {
      const fixture = sourceCiFixture();
      for (const runId of [100, 200]) for (const path of [`${fixture.prefix}/actions/runs/${runId}`, `${fixture.prefix}/actions/runs/${runId}/attempts/1`]) {
        for (const repo of [fixture.responses[path].repository, fixture.responses[path].head_repository]) { repo.id = id; repo.full_name = "hraness/ghostget"; }
      }
      for (const repo of [fixture.responses[`${fixture.prefix}/pulls/50`].base.repo, fixture.responses[`${fixture.prefix}/pulls/50`].head.repo]) {
        repo.id = id; repo.full_name = "hraness/ghostget";
      }
      return fixture;
    };
    const fixture = renamed(1316443113);
    expect(() => admitSourceCi(fixture.input, fixture.read, fixture.clock)).not.toThrow();
    const foreign = renamed(1);
    expect(() => admitSourceCi(foreign.input, foreign.read, foreign.clock)).toThrow("foreign repository");
  });
  test("admits only the current successful attempt while retaining older analyses", () => {
    const fixture = sourceCiFixture(2);
    fixture.analyses.push(...fixture.analyses.map(value => ({ ...value, id: value.id + 10, created_at: "2026-09-08T01:10:00Z" })));
    const result = admitSourceCi(fixture.input, fixture.read, fixture.clock);
    expect(result.ci.attempt).toBe(2); expect(result.codeql.attempt).toBe(2);
    expect(result.security.exactAnalyses.map(value => value.id)).toEqual([800, 801]);
  });
  test("admits a current-repository closed PR CodeQL response with an empty association and exact provider summary", () => {
    const fixture = sourceCiFixture(1, 203);
    const checks = fixture.responses[`${fixture.prefix}/commits/${fixture.head}/check-runs?per_page=100&filter=latest`];
    // Response shape follows GitHub check 102698893117; repository and source identity are fixture-local.
    // The historical Wrench summary is separately rejected below; it is not rewritten provider evidence.
    checks.check_runs = [{ id: 102698893117, name: "CodeQL", app: { id: 57789 }, head_sha: fixture.head,
      status: "completed", conclusion: "success", pull_requests: [], output: {
        summary: "[View all branch alerts](/hraness/ghostget/security/code-scanning?query=pr%3A203+tool%3ACodeQL+is%3Aopen).",
      } }];
    const result = admitSourceCi(fixture.input, fixture.read, fixture.clock);
    expect(result.security.pullRequest).toBe(203);
    expect(result.security.prComparison).toEqual([{ id: 102698893117, source: fixture.head, conclusion: "success" }]);
    expect(result.security.sameMergedTree).toBe(fixture.input.tree);
  });
  test("refuses malformed summary fallback and never rescues contradictory nonempty associations", () => {
    const summary = "[View all branch alerts](/hraness/ghostget/security/code-scanning?query=pr%3A50+tool%3ACodeQL+is%3Aopen).";
    const mutations: ((check: Json) => void)[] = [
      check => { delete check.pull_requests; },
      check => { check.pull_requests = null; },
      check => { check.pull_requests = {}; },
      check => { delete check.output; },
      check => { delete check.output.summary; },
      check => { check.output.summary = null; },
      check => { check.output.summary = 50; },
      ...[summary.replace("pr%3A50", "pr%3A51"), summary.replace("/hraness/", "/foreign/"),
        summary.replace("/ghostget/", "/other/"), summary.replace("/ghostget/", "/wrench/"), summary.replace("tool%3ACodeQL", "tool%3AOther"),
        summary.replace("is%3Aopen", "is%3Aclosed"), summary.replace("pr%3A50", "pr:50"),
        summary.replace("](/", "](https://github.com/"), summary + "\n", summary + summary, "extra " + summary,
      ].map(value => (check: Json) => { check.output.summary = value; }),
    ];
    for (const mutate of mutations) {
      const fixture = sourceCiFixture();
      const check = fixture.responses[`${fixture.prefix}/commits/${fixture.head}/check-runs?per_page=100&filter=latest`].check_runs[0];
      check.pull_requests = []; check.output = { summary }; mutate(check);
      expect(() => admitSourceCi(fixture.input, fixture.read, fixture.clock)).toThrow();
    }
    for (const mutate of [
      (associated: Json) => { associated.number = 51; },
      (associated: Json) => { associated.id = 1; },
      (associated: Json) => { associated.url += "/other"; },
      (associated: Json) => { associated.head.sha = "7".repeat(40); },
      (associated: Json) => { associated.base.ref = "other"; },
      (associated: Json) => { associated.head.repo.id = 1; },
      (associated: Json) => { associated.base.repo.url = "https://api.github.com/repos/foreign/ghostget"; },
    ]) {
      const fixture = sourceCiFixture();
      const check = fixture.responses[`${fixture.prefix}/commits/${fixture.head}/check-runs?per_page=100&filter=latest`].check_runs[0];
      check.output = { summary }; mutate(check.pull_requests[0]);
      expect(() => admitSourceCi(fixture.input, fixture.read, fixture.clock)).toThrow();
    }
  });
  test("requires terminal job evidence within 72 hours and the corresponding analysis interval", () => {
    const fixture = sourceCiFixture();
    const deadline = Date.parse("2026-09-09T01:14:00Z") + 72 * 60 * 60 * 1000;
    expect(() => admitSourceCi(fixture.input, fixture.read, () => deadline)).not.toThrow();
    expect(() => admitSourceCi(fixture.input, fixture.read, () => deadline + 1)).toThrow("stale");
    expect(() => admitSourceCi(fixture.input, fixture.read, () => Date.parse("2026-09-09T01:13:59Z"))).toThrow("future");
    for (const mutate of [
      (job: Json) => { job.completed_at = "not-a-date"; },
      (job: Json) => { job.started_at = "2026-09-09T01:14:01Z"; },
      (job: Json) => { job.started_at = "2026-09-08T01:00:00Z"; },
    ]) {
      const changed = sourceCiFixture(); mutate(changed.responses[`${changed.prefix}/actions/runs/100/attempts/1/jobs?per_page=100`].jobs[0]);
      expect(() => admitSourceCi(changed.input, changed.read, changed.clock)).toThrow();
    }
    fixture.responses[`${fixture.prefix}/actions/runs/200/attempts/1/jobs?per_page=100`].jobs[0].started_at = "2026-09-09T01:11:00Z";
    expect(() => admitSourceCi(fixture.input, fixture.read, fixture.clock)).toThrow("analysis");
    const calendar = sourceCiFixture();
    for (const path of Object.keys(calendar.responses)) calendar.responses[path] = JSON.parse(JSON.stringify(calendar.responses[path]).replaceAll("2026-09-09", "2026-03-02"));
    const marchClock = () => Date.parse("2026-03-02T02:00:00Z");
    expect(() => admitSourceCi(calendar.input, calendar.read, marchClock)).not.toThrow();
    calendar.responses[`${calendar.prefix}/actions/runs/100/attempts/1/jobs?per_page=100`].jobs[0].started_at = "2026-02-30T01:00:01Z";
    expect(() => admitSourceCi(calendar.input, calendar.read, marchClock)).toThrow("invalid provider timestamp");
  });
  test("rejects incomplete, foreign, stale, failed, skipped, and ambiguous provider evidence", () => {
    type Fixture = ReturnType<typeof sourceCiFixture>;
    const mutations: ((fixture: Fixture) => void)[] = [
      f => { f.responses[`${f.prefix}/git/ref/heads/main`].object.sha = f.head; },
      f => { f.responses[`${f.prefix}/git/commits/${f.input.source}`].tree.sha = f.head; },
      f => { f.responses[`${f.prefix}/actions/workflows/323493607`].state = "disabled_manually"; },
      f => { f.responses[`${f.prefix}/actions/workflows/323493607`].path = ".github/workflows/other.yml"; },
      f => { f.responses[`${f.prefix}/actions/runs/100`].workflow_id = 1; },
      f => { f.responses[`${f.prefix}/actions/runs/100`].head_sha = f.head; },
      f => { f.responses[`${f.prefix}/actions/runs/100`].event = "pull_request"; },
      f => { f.responses[`${f.prefix}/actions/runs/100`].head_branch = "other"; },
      f => { f.responses[`${f.prefix}/actions/runs/100`].head_repository.id = 1; },
      f => { f.responses[`${f.prefix}/actions/runs/100`].repository.full_name = "foreign/ghostget"; },
      f => { f.responses[`${f.prefix}/actions/runs/100`].run_attempt = 2; },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1`].run_attempt = 2; },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1`].status = "in_progress"; },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1`].conclusion = "failure"; },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1/jobs?per_page=100`].jobs.pop(); },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1/jobs?per_page=100`].jobs[0].name = "unknown"; },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1/jobs?per_page=100`].jobs[0].id = 1001; },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1/jobs?per_page=100`].jobs[0].run_attempt = 2; },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1/jobs?per_page=100`].jobs[0].head_sha = f.head; },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1/jobs?per_page=100`].jobs[0].conclusion = "skipped"; },
      f => { f.responses[`${f.prefix}/actions/runs/100/attempts/1/jobs?per_page=100`].jobs[0].steps = []; },
      f => { f.responses[`${f.prefix}/actions/runs/200/attempts/1/jobs?per_page=100`].jobs[0].conclusion = "failure"; },
      f => { f.responses[`${f.prefix}/pulls/50`].merged = false; },
      f => { f.responses[`${f.prefix}/pulls/50`].base.ref = "other"; },
      f => { f.responses[`${f.prefix}/git/commits/${f.head}`].tree.sha = f.head; },
      f => { f.responses[`${f.prefix}/commits/${f.head}/check-runs?per_page=100&filter=latest`].check_runs[0].conclusion = "failure"; },
      f => { f.responses[`${f.prefix}/commits/${f.head}/check-runs?per_page=100&filter=latest`].check_runs[0].app.id = 15368; },
      f => { f.responses[`${f.prefix}/commits/${f.head}/check-runs?per_page=100&filter=latest`].check_runs[0].pull_requests[0].number = 51; },
      f => { f.responses[`${f.prefix}/commits/${f.head}/check-runs?per_page=100&filter=latest`].check_runs[0].pull_requests[0].base.ref = "other"; },
      f => { f.responses[`${f.prefix}/commits/${f.head}/check-runs?per_page=100&filter=latest`].check_runs[0].pull_requests[0].head.repo.id = 1; },
      f => { f.responses[`${f.prefix}/commits/${f.input.source}/check-runs?per_page=100&filter=latest`].check_runs[0] = {
        id: 701, head_sha: f.input.source, name: "CodeQL", app: { id: 57789 }, status: "completed", conclusion: "failure" }; },
      f => { f.analyses[0]!.warning = "incomplete extraction"; },
      f => { f.analyses[0]!.error = "failed analysis"; },
      f => { f.analyses[0]!.commit_sha = f.head; },
      f => { f.analyses[0]!.created_at = "2026-09-08T01:10:00Z"; },
      f => { f.analyses[0]!.ref = "refs/heads/other"; },
      f => { f.analyses[0]!.analysis_key = "other:analyze"; },
      f => { f.analyses.push({ ...f.analyses[0]!, id: 810 }); },
      f => { const key = Object.keys(f.responses).find(path => path.includes("/323493607/runs?"))!; f.responses[key].workflow_runs = []; },
      f => { const key = Object.keys(f.responses).find(path => path.includes("/323493607/runs?"))!;
        f.responses[key].workflow_runs.push({ ...f.responses[key].workflow_runs[0], id: 101 }); f.responses[key].total_count = 2; },
    ];
    for (const mutate of mutations) { const fixture = sourceCiFixture(); mutate(fixture); expect(() => admitSourceCi(fixture.input, fixture.read, fixture.clock)).toThrow(); }
  });
  test("rejects checkout, lock, workflow, toolchain, platform, and log identity substitutions", () => {
    const f = sourceCiFixture(); const log = f.responses[`${f.prefix}/actions/jobs/1000/logs`] as string;
    for (const [before, after] of [[f.input.source, f.head], [f.input.tree, f.head], [f.input.workflowSha256, "7".repeat(64)],
      [f.input.lockSha256, "8".repeat(64)], ["24.20.0", "24.19.0"], ["11.19.0", "11.20.0"], ["1.3.14", "1.4.0"],
      ['"runAttempt":1', '"runAttempt":2'], ['"runId":100', '"runId":101'], ['"linux"', '"darwin"'],
      ['"github-hosted"', '"self-hosted"'], ['"push"', '"pull_request"'], ["refs/heads/main", "refs/heads/other"]]) {
      expect(() => verifySourceCiLog(log.replaceAll(before!, after!), f.input, 100, 1, "static")).toThrow();
    }
    expect(() => verifySourceCiLog(log + log, f.input, 100, 1, "static")).toThrow();
    expect(() => verifySourceCiLog(log.split("\n").slice(0, 2).join("\n"), f.input, 100, 1, "static")).toThrow();
    fc.assert(fc.property(fc.string(), extra => {
      const changed = log.replace('"schema":"wrench-source-ci-v1"', `"schema":"wrench-source-ci-v1","extra":${JSON.stringify(extra)}`);
      expect(() => verifySourceCiLog(changed, f.input, 100, 1, "static")).toThrow();
    }), { numRuns: 50 });
  });
  test("rechecks the exact attempt and source evidence after reading completed logs", () => {
    const fixture = sourceCiFixture(); let reads = 0;
    expect(() => admitSourceCi(fixture.input, path => {
      if (path === `${fixture.prefix}/actions/runs/100` && ++reads === 2) fixture.responses[path].conclusion = "failure";
      return fixture.read(path);
    }, fixture.clock)).toThrow();
    expect(reads).toBe(2);
  });
  test("retains unconditional fresh build, exact archive install and all later capability boundaries", async () => {
    const yaml = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
    const workflow = Bun.YAML.parse(yaml) as Json;
    const admission = { name: "Admit exact source CI and security", env: {
      GH_TOKEN: "${{ github.token }}", DEFAULT_BRANCH: "${{ github.event.repository.default_branch }}",
      VERIFIED_SOURCE_SHA: "${{ steps.identity.outputs.sha }}", VERIFIED_MAIN_SHA: "${{ steps.identity.outputs.main_sha }}",
    }, run: "bun run ./scripts/release-source-ci.ts admit" };
    const validate = (value: Json) => {
      const job = value.jobs.verify;
      if (job.if !== undefined || job["continue-on-error"] !== undefined || job.steps.some((step: Json) => step.if !== undefined || step["continue-on-error"] !== undefined)) throw new Error("conditional source acceptance");
      const steps: Json[] = job.steps; const index = steps.findIndex(step => step.name === admission.name);
      if (index < 0 || !isDeepStrictEqual(steps[index], admission) || steps.filter(step => step.run?.includes("release-source-ci.ts")).length !== 1
        || steps[index - 1]?.name !== "Verify release identity" || steps[index + 1]?.run !== "bun install --frozen-lockfile --ignore-scripts"
        || steps[index + 2]?.run !== "bun run build") throw new Error("admission ordering changed");
      const archive = steps.findIndex(step => step.name === "Prepare and install the exact canonical archive");
      if (archive <= index + 2 || !steps[archive]?.run.includes("github-release-artifact.ts prepare")
        || !steps[archive]?.run.includes("package-smoke.ts") || !steps[archive]?.run.startsWith("set -euo pipefail\n")) throw new Error("exact artifact admission changed");
    };
    expect(() => validate(workflow)).not.toThrow();
    for (const mutate of [
      (w: Json) => { w.jobs.verify["continue-on-error"] = true; },
      (w: Json) => { w.jobs.verify.steps.find((step: Json) => step.name === admission.name).if = "always()"; },
      (w: Json) => { w.jobs.verify.steps.find((step: Json) => step.name === admission.name).run += " || true"; },
      (w: Json) => { w.jobs.verify.steps.find((step: Json) => step.name === admission.name).env.VERIFIED_SOURCE_SHA = "${{ github.event.inputs.sha }}"; },
      (w: Json) => { w.jobs.verify.steps = w.jobs.verify.steps.filter((step: Json) => step.name !== admission.name); },
      (w: Json) => { w.jobs.verify.steps.find((step: Json) => step.run === "bun run build").run = "true"; },
    ]) { const changed = structuredClone(workflow); mutate(changed); expect(() => validate(changed)).toThrow(); }
  });
});

describe("canonical release publication and safe local input", () => {
  test("pins all documented cryptographic verifier coordinates", () => {
    const args = attestationVerifyArguments("/exact", manifest, "SHA256SUMS");
    expect(args).toEqual(["attestation", "verify", "/exact/SHA256SUMS", "--repo", "hraness/ghostget",
      "--signer-workflow", "hraness/ghostget/.github/workflows/release.yml", "--signer-digest", sourceSha,
      "--source-digest", sourceSha, "--source-ref", `refs/tags/${tag}`, "--deny-self-hosted-runners",
      "--bundle", "/exact/provenance.jsonl", "--format=json"]);
    expect(() => attestationVerifyArguments("/exact", manifest, "../different")).toThrow();
  });
  test("verifies historical certificates against Wrench while current API lookup remains Ghostget", () => {
    const historical = parseReleaseManifest({ ...manifest, tag: "v0.16.16", version: "0.16.16",
      package: "@hraness/wrench", repository: "hraness/wrench",
      archive: { ...manifest.archive, name: "hraness-wrench-0.16.16.tgz" } });
    const args = attestationVerifyArguments("/exact", historical, "SHA256SUMS");
    expect(args[args.indexOf("--repo") + 1]).toBe("hraness/wrench");
    expect(args[args.indexOf("--signer-workflow") + 1]).toBe("hraness/wrench/.github/workflows/release.yml");
    expect(() => parseReleaseManifest({ ...historical, repository: "hraness/ghostget" })).toThrow();
  });
  test("rejects a symlinked release directory before reading an artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "ghostget-canonical-directory-"));
    try {
      await symlink(root, join(root, "link"));
      await expect(verifyReleaseDirectory(join(root, "link"), {})).rejects.toThrow("ordinary directory");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test("publishes only the exact draft inventory and preserves mismatched or ambiguous drafts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ghostget-canonical-publisher-"));
    try {
      for (const name of names) await writeFile(join(directory, name), `fixture:${name}`);
      const assets = await Promise.all(names.map(async (name, index) => {
        const bytes = await readFile(join(directory, name));
        return { id: index + 10, name, size: bytes.length, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          state: "uploaded", browser_download_url: `https://github.com/hraness/ghostget/releases/download/${tag}/${name}`,
          url: `https://api.github.com/repos/hraness/ghostget/releases/assets/${index + 10}` };
      }));
      const temporaryAssets = assets.map(asset => ({ ...asset,
        browser_download_url: `https://github.com/hraness/ghostget/releases/download/untagged-ef6c1bd779e9dd4032bb/${asset.name}` }));
      const hashes = Object.fromEntries(assets.slice(0, 4).map(asset => [asset.name, asset.digest.slice(7)]));
      const bundleHash = assets[4]!.digest.slice(7);
      await verifyBuildHandoff(directory, tag, hashes, bundleHash);
      await expect(verifyBuildHandoff(directory, tag, { ...hashes, extra: "a".repeat(64) }, bundleHash)).rejects.toThrow();
      await expect(verifyBuildHandoff(directory, tag, { ...hashes, [names[0]!]: "a".repeat(64) }, bundleHash)).rejects.toThrow();
      await expect(verifyBuildHandoff(directory, tag, hashes, "b".repeat(64))).rejects.toThrow();
      const predecessor = { id: 99, tag_name: "v0.16.11", draft: false, prerelease: false, immutable: true,
        assets: [], published_at: "2026-09-08T01:00:00Z" };
      const draft = (): Json => ({ id: 100, name: `Ghostget ${tag}`, tag_name: tag, target_commitish: sourceSha, body,
        draft: true, prerelease: false, immutable: false, author: { id: 41898282, type: "Bot" }, assets: [] });
      const execute = async (initial?: Json, fault = ""): Promise<{ writes: string[]; downloads: number[]; release: Json | undefined; error?: unknown }> => {
        let release = initial === undefined ? undefined : structuredClone(initial); const writes: string[] = [];
        const downloads: number[] = [];
        const run = (args: readonly string[], input?: string): { status: number; stdout: string } => {
          if (args[0] === "node") {
            if (fault === "control-drift") throw new Error("release-control drift");
            return { status: 0, stdout: `sha=${sourceSha}\ntag=${tag}\nmain_sha=${workflowSha}\n` };
          }
          if (args[1] === "release" && args[2] === "upload") {
            const name = args[4]!.split("/").at(-1)!;
            if (release === undefined || release.draft !== true || release.assets.some((asset: Json) => asset.name === name)) throw new Error("unexpected overwrite");
            writes.push(`upload:${name}`); release.assets.push(structuredClone(temporaryAssets.find(asset => asset.name === name)!));
            return { status: 0, stdout: "" };
          }
          if (args[1] !== "api") throw new Error(`Unexpected command ${args.join(" ")}`);
          if (args[2] === "--include") {
            const visible = release?.draft === false;
            return { status: visible ? 0 : 1,
              stdout: `HTTP/2 ${visible ? 200 : 404}\n\n${JSON.stringify(visible ? release : { message: "Not Found" })}` };
          }
          const method = args[3]; const endpoint = args[4]!;
          if (method === "POST") { writes.push("create"); release = { ...draft(), ...JSON.parse(input!) }; return { status: 0, stdout: JSON.stringify(release) }; }
          if (method === "PATCH") {
            if (release?.assets.length !== 5) throw new Error("premature publication");
            writes.push("publish"); release = { ...release, draft: false, immutable: true, published_at: "2026-09-09T01:00:00Z",
              assets: fault === "published-temporary-url" ? release.assets : structuredClone(assets) };
            return { status: 0, stdout: JSON.stringify(release) };
          }
          if (method !== "GET") throw new Error("Unsupported mutation");
          let value: unknown;
          if (endpoint.includes("releases?per_page=100&page=")) {
            value = endpoint.endsWith("page=1") ? [predecessor, ...(release === undefined ? [] : [release])] : [];
            if (fault === "duplicate-tag" && endpoint.endsWith("page=1")) value = [draft(), { ...draft(), id: 101 }];
            if (fault === "duplicate-id" && endpoint.endsWith("page=1")) value = [draft(), draft()];
            if (fault === "resumed-page" && endpoint.endsWith("page=2")) value = [predecessor];
            if (fault === "nonempty-sentinel" && endpoint.endsWith("page=6")) value = [predecessor];
          }
          else if (endpoint.endsWith("/git/ref/heads/main")) value = { object: { type: "commit", sha: workflowSha } };
          else if (endpoint.endsWith("/releases/latest")) value = release?.draft === false ? release : predecessor;
          else if (endpoint.endsWith("/releases/100") || endpoint.endsWith(`/releases/tags/${tag}`)) {
            value = fault === "id-readback-drift" || (fault === "post-upload-id-drift" && writes.length > 0)
              ? { ...release, id: 101 } : release;
          }
          else throw new Error(`Unexpected API ${endpoint}`);
          return { status: 0, stdout: JSON.stringify(value) };
        };
        const download = (id: number, expectedBytes: number): Uint8Array => {
          const asset = assets.find(asset => asset.id === id);
          if (asset === undefined || expectedBytes !== asset.size || !release?.assets.some((current: Json) => current.id === id)) {
            throw new Error("Download must bind one admitted uploaded asset and byte count");
          }
          downloads.push(id);
          return fault === "remote-corrupt" || (fault === "published-corrupt" && release.draft === false)
            ? Buffer.alloc(expectedBytes) : Buffer.from(`fixture:${asset.name}`);
        };
        try { await publishCanonicalRelease(directory, manifest, run, download); return { writes, downloads, release }; }
        catch (error) { return { writes, downloads, release, error }; }
      };
      const fresh = await execute(); expect(fresh.error).toBeUndefined();
      expect(fresh.writes).toEqual(["create", ...names.map(name => `upload:${name}`), "publish"]);
      expect(fresh.downloads).toHaveLength(10);
      const partial = draft(); partial.assets = [temporaryAssets[0]];
      const resumed = await execute(partial); expect(resumed.error).toBeUndefined();
      expect(resumed.writes).toEqual([...names.slice(1).map(name => `upload:${name}`), "publish"]);
      const completed = await execute(fresh.release); expect(completed.error).toBeUndefined(); expect(completed.writes).toEqual([]);
      expect(completed.downloads).toHaveLength(5);
      for (const altered of [
        { ...draft(), target_commitish: workflowSha }, { ...draft(), body: `${body} different-attempt` },
        { ...draft(), immutable: true }, { ...draft(), author: { id: 894119, type: "User" } },
        { ...draft(), assets: [{ ...assets[0], digest: `sha256:${"0".repeat(64)}` }] },
        { ...draft(), assets: [assets[0], assets[0]] }, { ...draft(), assets: [{ ...assets[0], name: "unexpected" }] },
      ]) {
        const denied = await execute(altered); expect(denied.error).toBeDefined(); expect(denied.writes).toEqual([]);
      }
      const drift = await execute(undefined, "control-drift"); expect(drift.error).toBeDefined(); expect(drift.writes).toEqual([]);
      for (const fault of ["duplicate-tag", "duplicate-id", "resumed-page", "nonempty-sentinel", "id-readback-drift"]) {
        const denied = await execute(draft(), fault); expect(denied.error).toBeDefined(); expect(denied.writes).toEqual([]);
      }
      const readbackDrift = await execute(draft(), "post-upload-id-drift");
      expect(readbackDrift.error).toBeDefined(); expect(readbackDrift.writes).toEqual([`upload:${names[0]}`]);
      const temporaryPublished = await execute({ ...fresh.release, assets: temporaryAssets });
      expect(temporaryPublished.error).toBeDefined(); expect(temporaryPublished.writes).toEqual([]);
      const temporaryReadback = await execute({ ...draft(), assets: temporaryAssets }, "published-temporary-url");
      expect(temporaryReadback.error).toBeDefined(); expect(temporaryReadback.writes).toEqual(["publish"]);
      for (const browser_download_url of [
        `https://github.com/other/ghostget/releases/download/untagged-ef6c1bd779e9dd4032bb/${names[0]}`,
        "https://github.com/hraness/ghostget/releases/download/untagged-ef6c1bd779e9dd4032bb/wrong-name",
        `https://github.com/hraness/ghostget/releases/download/untagged-EF6C1BD779E9DD4032BB/${names[0]}`,
        `https://github.com/hraness/ghostget/releases/download/untagged-ef6c1bd779e9dd4032b/${names[0]}`,
        `https://github.com/hraness/ghostget/releases/download/untagged-ef6c1bd779e9dd4032bb/${names[0]}?download=1`,
        `https://github.com/hraness/ghostget/releases/download/untagged-ef6c1bd779e9dd4032bb/nested/${names[0]}`,
      ]) {
        const denied = await execute({ ...draft(), assets: [{ ...assets[0], browser_download_url }] });
        expect(denied.error).toBeDefined(); expect(denied.writes).toEqual([]); expect(denied.downloads).toEqual([]);
      }
      expect(() => validateReleaseAssets({ assets, draft: "true" }, manifest, directory)).toThrow();
      const completeDraft = { ...draft(), assets };
      const corruptDraft = await execute(completeDraft, "remote-corrupt");
      expect(corruptDraft.error).toBeDefined(); expect(corruptDraft.writes).toEqual([]);
      const corruptReadback = await execute(completeDraft, "published-corrupt");
      expect(corruptReadback.error).toBeDefined(); expect(corruptReadback.writes).toEqual(["publish"]);
      const corruptCompleted = await execute(fresh.release, "remote-corrupt");
      expect(corruptCompleted.error).toBeDefined(); expect(corruptCompleted.writes).toEqual([]);
      expect(() => validateReleaseAssets({ draft: true, assets: [{ ...assets[0], url: "https://example.com/asset" }] }, manifest, directory)).toThrow();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
