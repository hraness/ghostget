import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import { QUINT_APALACHE_SCOPE, QUINT_SKIP_APALACHE_VARIABLE, quintApalacheScopeChanged } from "./verification-tools.js";

/**
 * Decide whether one CI `quint` shard may skip its Apalache checks, and write
 * `GHOSTGET_QUINT_SKIP_APALACHE=1` to `$GITHUB_ENV` only when it may. The
 * answer is "may skip" only on a `pull_request` event whose checked-out merge
 * commit has exactly two parents and whose diff against the first (base)
 * parent names no path in `QUINT_APALACHE_SCOPE`. Every other event, a
 * missing parent, or any Git failure runs every Apalache check.
 */
export type ApalacheScopeDecision = Readonly<{ skip: boolean; reason: string }>;

export type GitRunner = (argumentsList: readonly string[]) => string | null;

export function decideApalacheScope(eventName: string | undefined, git: GitRunner): ApalacheScopeDecision {
  if (eventName !== "pull_request") {
    return { skip: false, reason: `event ${eventName ?? "(unset)"} always runs every Apalache check` };
  }
  const parents = git(["rev-list", "--parents", "-n", "1", "HEAD"]);
  const fields = parents?.trim().split(" ") ?? [];
  if (fields.length !== 3 || fields.some((field) => !/^[0-9a-f]{40}$/u.test(field))) {
    return { skip: false, reason: "the checkout is not a two-parent pull-request merge commit; running every Apalache check" };
  }
  const changed = git(["diff", "--no-renames", "--name-only", "-z", `${fields[1]!}`, `${fields[0]!}`]);
  if (changed === null) return { skip: false, reason: "git diff against the base parent failed; running every Apalache check" };
  const paths = changed.split("\0").filter((path) => path !== "");
  if (quintApalacheScopeChanged(paths)) {
    return { skip: false, reason: `the pull request changes the Apalache scope (${QUINT_APALACHE_SCOPE.join(", ")}); running every Apalache check` };
  }
  return { skip: true, reason: `the pull request changes ${String(paths.length)} paths, none in the Apalache scope; skipping Apalache on this shard` };
}

function runGit(argumentsList: readonly string[]): string | null {
  const result = spawnSync("git", [...argumentsList], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

if (import.meta.main) {
  const decision = decideApalacheScope(process.env.GITHUB_EVENT_NAME, runGit);
  console.log(decision.reason);
  if (decision.skip) {
    const target = process.env.GITHUB_ENV;
    if (target === undefined || target === "") {
      console.error("GITHUB_ENV is unset; not skipping Apalache");
    } else {
      appendFileSync(target, `${QUINT_SKIP_APALACHE_VARIABLE}=1\n`);
    }
  }
}
