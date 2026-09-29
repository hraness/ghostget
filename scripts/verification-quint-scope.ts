import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

import {
  APALACHE_ALL,
  type ApalacheSelection,
  QUINT_APALACHE_SCOPE,
  apalacheSelectionEnvironmentLine,
  quintApalacheScopeChanged,
  quintLockClosure,
  quintPackagePins,
} from "./verification-tools.js";

/**
 * Decide which Apalache checks one CI `quint` shard runs, and write the one
 * `$GITHUB_ENV` line that narrows them only when it may. The selection is
 * narrower than every model only on a `pull_request` event whose checked-out
 * merge commit has exactly two parents. Its diff against the first (base)
 * parent is then read path by path:
 *
 * - a path outside `QUINT_APALACHE_SCOPE` cannot change a verdict;
 * - `package.json` and `bun.lock` count only when `quintPackagePins` or
 *   `quintLockClosure` differs between the base parent and the merge commit,
 *   so release version bumps and unrelated dependency updates do not count;
 * - `verification/quint/<file>` for a model file the merge commit's manifest
 *   lists selects only that model, since models import nothing from each
 *   other;
 * - every other path in the scope, including the manifest, the checker
 *   scripts, and the workflows, selects every model.
 *
 * Every other event, a missing parent, any Git failure, and any unreadable or
 * malformed manifest, package manifest, or lockfile selects every model.
 */
export type ApalacheScopeDecision = Readonly<{ selection: ApalacheSelection; reason: string }>;

export type GitRunner = (argumentsList: readonly string[]) => string | null;

const MODEL_DIRECTORY = "verification/quint/";
const MODEL_MANIFEST = `${MODEL_DIRECTORY}models.json`;

function all(reason: string): ApalacheScopeDecision {
  return { selection: APALACHE_ALL, reason: `${reason}; running every Apalache check` };
}

function manifestModelFiles(text: string | null): ReadonlySet<string> | null {
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as { models?: unknown };
    if (!Array.isArray(parsed.models)) return null;
    const files = parsed.models.map((model: unknown) =>
      typeof model === "object" && model !== null && typeof (model as { file?: unknown }).file === "string"
        ? (model as { file: string }).file
        : null);
    if (files.some((file) => file === null || file.includes("/"))) return null;
    return new Set(files as string[]);
  } catch {
    return null;
  }
}

function projectionChanged(
  git: GitRunner,
  base: string,
  merge: string,
  path: string,
  project: (text: string) => string,
): boolean {
  const before = git(["show", `${base}:${path}`]);
  const after = git(["show", `${merge}:${path}`]);
  if (before === null || after === null) return true;
  try {
    return project(before) !== project(after);
  } catch {
    return true;
  }
}

export function decideApalacheScope(eventName: string | undefined, git: GitRunner): ApalacheScopeDecision {
  if (eventName !== "pull_request") return all(`event ${eventName ?? "(unset)"} always runs every Apalache check`);
  const parents = git(["rev-list", "--parents", "-n", "1", "HEAD"]);
  const fields = parents?.trim().split(" ") ?? [];
  if (fields.length !== 3 || fields.some((field) => !/^[0-9a-f]{40}$/u.test(field))) {
    return all("the checkout is not a two-parent pull-request merge commit");
  }
  const merge = fields[0]!;
  const base = fields[1]!;
  const changed = git(["diff", "--no-renames", "--name-only", "-z", base, merge]);
  if (changed === null) return all("git diff against the base parent failed");
  const paths = changed.split("\0").filter((path) => path !== "");
  const scoped = paths.filter((path) => quintApalacheScopeChanged([path]));
  let modelFiles: ReadonlySet<string> | null | undefined;
  const models = new Set<string>();
  for (const path of scoped) {
    if (path === "package.json") {
      if (projectionChanged(git, base, merge, path, quintPackagePins)) return all("the pull request changes the Quint pins in package.json");
      continue;
    }
    if (path === "bun.lock") {
      if (projectionChanged(git, base, merge, path, quintLockClosure)) return all("the pull request changes the Quint closure in bun.lock");
      continue;
    }
    const file = path.startsWith(MODEL_DIRECTORY) ? path.slice(MODEL_DIRECTORY.length) : null;
    if (file !== null && path !== MODEL_MANIFEST) {
      if (modelFiles === undefined) modelFiles = manifestModelFiles(git(["show", `${merge}:${MODEL_MANIFEST}`]));
      if (modelFiles === null) return all("the model manifest could not be read");
      if (modelFiles.has(file)) {
        models.add(file);
        continue;
      }
    }
    return all(`the pull request changes ${path} in the Apalache scope (${QUINT_APALACHE_SCOPE.join(", ")})`);
  }
  if (models.size > 0) {
    const files = [...models].sort();
    return {
      selection: Object.freeze({ kind: "models", files: Object.freeze(files) }),
      reason: `the pull request changes only these models in the Apalache scope: ${files.join(", ")}; checking only their Apalache work on this shard`,
    };
  }
  return {
    selection: Object.freeze({ kind: "none" }),
    reason: `the pull request changes ${String(paths.length)} paths, none of which can change an Apalache verdict; skipping Apalache on this shard`,
  };
}

function runGit(argumentsList: readonly string[]): string | null {
  const result = spawnSync("git", [...argumentsList], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

if (import.meta.main) {
  const decision = decideApalacheScope(process.env.GITHUB_EVENT_NAME, runGit);
  console.log(decision.reason);
  const line = apalacheSelectionEnvironmentLine(decision.selection);
  if (line !== null) {
    const target = process.env.GITHUB_ENV;
    if (target === undefined || target === "") {
      console.error("GITHUB_ENV is unset; running every Apalache check");
    } else {
      appendFileSync(target, `${line}\n`);
    }
  }
}
