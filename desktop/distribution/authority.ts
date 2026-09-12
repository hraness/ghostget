import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { admitSourceCi } from "../../scripts/release-source-ci.ts";
import { downloadReleaseDirectory } from "../../scripts/github-release-artifact.ts";
import { parseReleaseAssetDescriptors } from "../../website/github-release-artifact.mjs";
import { releaseWorkflowRunIdFromPublishedRelease } from "../../scripts/release-provider-outcome.mjs";
import { desktopTag, digest, object, positive, REPOSITORY, REPOSITORY_ID, requireValue, sha256, version, WORKFLOW } from "./contract.ts";

export type Reader = (path: string, format?: "log") => unknown;
export type Authority = Readonly<{ tag: string; source: string; workflowId: number; runId: number; runAttempt: number }>;
const prefix = `repos/${REPOSITORY}`;
export function environmentAuthority(environment: NodeJS.ProcessEnv = process.env): Authority {
  const source = digest(environment.GITHUB_SHA, 40), tag = environment.DESKTOP_CANONICAL_TAG ?? ""; version(tag);
  requireValue(environment.GITHUB_REPOSITORY === REPOSITORY && environment.GITHUB_REPOSITORY_ID === String(REPOSITORY_ID)
    && environment.GITHUB_EVENT_NAME === "workflow_dispatch" && environment.GITHUB_REF === "refs/heads/main"
    && environment.GITHUB_WORKFLOW_REF === `${REPOSITORY}/${WORKFLOW}@refs/heads/main` && environment.GITHUB_WORKFLOW_SHA === source
    && environment.GITHUB_ACTOR_ID === "894119" && environment.RUNNER_ENVIRONMENT === "github-hosted", "requires exact owner-dispatched main workflow");
  return { tag, source, workflowId: positive(Number(environment.DESKTOP_RELEASE_WORKFLOW_ID)), runId: positive(Number(environment.GITHUB_RUN_ID)), runAttempt: positive(Number(environment.GITHUB_RUN_ATTEMPT)) };
}

/** Fresh provider authority before signing, attestation and each publication effect. */
export function authorize(a: Authority, read: Reader): Record<string, unknown> {
  version(a.tag); digest(a.source, 40); positive(a.workflowId); positive(a.runId); positive(a.runAttempt);
  const repo = object(read(prefix));
  requireValue(repo.id === REPOSITORY_ID && repo.full_name === REPOSITORY && repo.private === false && repo.visibility === "public" && repo.default_branch === "main", "repository authority differs");
  const main = object(read(`${prefix}/git/ref/heads/main`));
  requireValue(main.ref === "refs/heads/main" && object(main.object).type === "commit" && object(main.object).sha === a.source, "current main moved");
  for (const tag of [a.tag, desktopTag(a.tag)]) {
    const ref = object(read(`${prefix}/git/ref/tags/${tag}`));
    requireValue(ref.ref === `refs/tags/${tag}` && object(ref.object).type === "commit" && object(ref.object).sha === a.source, "owner-created direct tag differs");
  }
  const workflow = object(read(`${prefix}/actions/workflows/${a.workflowId}`));
  requireValue(workflow.id === a.workflowId && workflow.path === WORKFLOW && workflow.state === "active", "workflow identity differs");
  const current = object(read(`${prefix}/actions/runs/${a.runId}`));
  const attempt = object(read(`${prefix}/actions/runs/${a.runId}/attempts/${a.runAttempt}`));
  for (const run of [current, attempt]) {
    requireValue(run.id === a.runId && run.run_attempt === a.runAttempt && run.workflow_id === a.workflowId && run.path === WORKFLOW
      && run.event === "workflow_dispatch" && run.head_branch === "main" && run.head_sha === a.source && run.status === "in_progress" && run.conclusion === null
      && object(run.actor).id === 894119 && object(run.actor).type === "User" && object(run.triggering_actor).id === 894119 && object(run.triggering_actor).type === "User", "current desktop attempt differs");
    for (const raw of [run.repository, run.head_repository]) { const r = object(raw); requireValue(r.id === REPOSITORY_ID && r.full_name === REPOSITORY && r.private === false, "foreign run repository"); }
  }
  const canonical = object(read(`${prefix}/releases/tags/${a.tag}`));
  requireValue(canonical.tag_name === a.tag && canonical.target_commitish === a.source && canonical.draft === false && canonical.prerelease === false && canonical.immutable === true, "canonical immutable release differs");
  parseReleaseAssetDescriptors(canonical.assets, a.tag);
  releaseWorkflowRunIdFromPublishedRelease({ repository: REPOSITORY, value: canonical, verifiedSha: a.source, verifiedTag: a.tag });
  const latest = object(read(`${prefix}/releases/latest`));
  requireValue(latest.id === canonical.id && latest.published_at === canonical.published_at && latest.tag_name === a.tag && latest.target_commitish === a.source
    && latest.draft === false && latest.prerelease === false && latest.immutable === true
    && isDeepStrictEqual(parseReleaseAssetDescriptors(latest.assets, a.tag), parseReleaseAssetDescriptors(canonical.assets, a.tag)), "canonical Latest changed");
  releaseWorkflowRunIdFromPublishedRelease({ repository: REPOSITORY, value: latest, verifiedSha: a.source, verifiedTag: a.tag });
  return canonical;
}

export function command(program: string, args: readonly string[], options: { timeout?: number; maximum?: number; input?: string | Buffer; environment?: NodeJS.ProcessEnv } = {}): Buffer {
  // Signing values never reach git, gh, build scripts, verifiers or runtime probes.
  const environment = options.environment ?? Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:APPLE_|DESKTOP_SIGN_|WRENCH_RELEASE_APP_)/u.test(key) && !["GH_HOST", "GH_DEBUG", "GH_FORCE_TTY"].includes(key)));
  const result = spawnSync(program, args, { env: environment, timeout: options.timeout ?? 60_000, killSignal: "SIGKILL", maxBuffer: options.maximum ?? 2 * 1024 * 1024, input: options.input, stdio: ["pipe", "pipe", "pipe"] });
  requireValue(result.error === undefined && result.status === 0 && result.signal === null, "bounded command failed");
  return result.stdout;
}
export function githubReader(): Reader {
  const deadline = performance.now() + 600_000; let requests = 0;
  return (path, format) => {
    const remaining = deadline - performance.now();
    requireValue(path.startsWith(`${prefix}/`) || path === prefix, "foreign API path");
    requireValue(!/[\r\n#]/u.test(path) && ++requests <= 160 && remaining > 0, "API admission exceeded its bound");
    const result = command("gh", ["api", "--method", "GET", "--hostname", "github.com", ...(format === "log" ? ["--allow-escape-sequences"] : []), path], { timeout: Math.min(60_000, Math.ceil(remaining)), maximum: format === "log" ? 16 * 1024 * 1024 : 2 * 1024 * 1024 }).toString("utf8");
    requireValue(performance.now() < deadline, "API admission deadline exceeded");
    return format === "log" ? result : JSON.parse(result) as unknown;
  };
}

if (import.meta.main) {
  const mode = process.argv[2]; requireValue(process.argv.length === 3 && ["check", "source"].includes(mode ?? ""), "expected check or source");
  const a = environmentAuthority(), read = githubReader();
  const canonical = authorize(a, read);
  requireValue(command("git", ["rev-parse", "HEAD"]).toString("utf8").trim() === a.source, "checkout differs");
  const metadata = JSON.parse(readFileSync("package.json", "utf8")) as unknown;
  requireValue(object(metadata).version === version(a.tag), "package version differs from tag");
  if (mode === "source") {
    const tree = command("git", ["rev-parse", `${a.source}^{tree}`]).toString("utf8").trim();
    admitSourceCi({ source: a.source, main: a.source, tree, workflowSha256: sha256(readFileSync(".github/workflows/ci.yml")), lockSha256: sha256(readFileSync("bun.lock")) }, read);
    await downloadReleaseDirectory(resolve(process.env.RUNNER_TEMP ?? "", `ghostget-desktop-canonical-${a.runId}-${a.runAttempt}`), canonical, { tag: a.tag, sourceSha: a.source });
    authorize(a, read);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${a.tag}\nsource=${a.source}\ndesktop_tag=${desktopTag(a.tag)}\n`);
  console.log("Exact current-main desktop authority admitted.");
}
