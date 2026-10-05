import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "hraness/ghostget";
const REPOSITORY_URL = `https://github.com/${REPOSITORY}.git`;
const MAIN_BRANCH = "main";
const MAIN_REF = `refs/heads/${MAIN_BRANCH}`;
const LOCAL_MAIN_REF = `refs/remotes/origin/${MAIN_BRANCH}`;
const MAXIMUM_SNAPSHOT_BYTES = 64 * 1_024;
const MAXIMUM_SNAPSHOT_ROWS = 500;
const MAXIMUM_GIT_OUTPUT_BYTES = 256 * 1_024;
const GIT_TIMEOUT_MILLISECONDS = 120_000;
const SHA = /^[0-9a-f]{40}$/u;
const STABLE_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const MAXIMUM_SAFE_SEMVER_COMPONENT = BigInt(Number.MAX_SAFE_INTEGER);
const TAG_REF = /^refs\/tags\/(v[A-Za-z0-9][A-Za-z0-9._-]{0,126})$/u;
const RELEASE_CONTROL_PATHS = Object.freeze([
  ".github/workflows",
  "scripts/release-ref-authority.ts",
  "scripts/release-source-ci.ts",
  "scripts/npm-provenance-identity.ts",
  "scripts/npm-package-identity.ts",
  "scripts/github-release-artifact.ts",
  "scripts/github-release-publish.ts",
  "scripts/package-artifact.ts",
  "scripts/package-budget.ts",
  "scripts/package-smoke.ts",
  "scripts/private-source-client-runtime-smoke.ts",
  "scripts/release-provider-outcome.mjs",
  "website/github-release-artifact.mjs",
  "website/release-notes.mjs",
] as const);

export type GitCommandResult = Readonly<{
  exitCode: number;
  stderr: Uint8Array;
  stdout: Uint8Array;
}>;

export type GitCommandRunner = (arguments_: readonly string[]) => GitCommandResult;

type RemoteRef = Readonly<{
  oid: string;
  ref: string;
}>;

export type RemoteTagSnapshot = Readonly<{
  canonical: string;
  entries: readonly RemoteRef[];
  requestedTagOid: string;
}>;

export type GovernedRemoteSnapshot = Readonly<{
  canonical: string;
  mainOid: string;
  requestedTagOid: string;
}>;

export type ReleaseRefAuthority = Readonly<{
  mainSha: string;
  sha: string;
  tag: string;
}>;

export type ReleaseRefAuthorityInput = Readonly<{
  requestedTag: string;
  runner?: GitCommandRunner;
  workingDirectory?: string;
}>;

function fail(message: string): never {
  throw new Error(message);
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decode(value: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    return fail(`${label} is not valid UTF-8.`);
  }
}

function createDefaultGitRunner(workingDirectory: string): GitCommandRunner {
  return (arguments_) => {
    const result = spawnSync(
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        "core.hooksPath=/dev/null",
        ...arguments_,
      ],
      {
        cwd: workingDirectory,
        encoding: "buffer",
        env: {
          ...process.env,
          GIT_ASKPASS: "/bin/false",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_TERMINAL_PROMPT: "0",
          LC_ALL: "C",
          SSH_ASKPASS: "/bin/false",
        },
        maxBuffer: MAXIMUM_GIT_OUTPUT_BYTES,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: GIT_TIMEOUT_MILLISECONDS,
      },
    );
    if (result.error !== undefined) {
      return fail("Git command could not complete within its fixed resource bounds.");
    }
    if (result.status === null) return fail("Git command did not report an exit status.");
    return Object.freeze({
      exitCode: result.status,
      stderr: new Uint8Array(result.stderr),
      stdout: new Uint8Array(result.stdout),
    });
  };
}

function command(
  runner: GitCommandRunner,
  arguments_: readonly string[],
  label: string,
): Uint8Array {
  const result = runner(arguments_);
  if (result.exitCode !== 0) fail(`${label} failed closed.`);
  return result.stdout;
}

function requireUnchangedReleaseControls(
  runner: GitCommandRunner,
  releaseSha: string,
  mainRef: string,
  label: string,
): void {
  if (runner([
    "diff",
    "--quiet",
    "--no-ext-diff",
    "--no-textconv",
    releaseSha,
    mainRef,
    "--",
    ...RELEASE_CONTROL_PATHS,
  ]).exitCode !== 0) {
    fail(`${label} have different release-control definitions.`);
  }
}

function stableVersion(tag: string): readonly [bigint, bigint, bigint] | undefined {
  const match = STABLE_TAG.exec(tag);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return undefined;
  }
  const version = [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])] as const;
  if (version.some(component => component > MAXIMUM_SAFE_SEMVER_COMPONENT)) return undefined;
  return Object.freeze(version);
}

function validTagRef(ref: string): boolean {
  const name = TAG_REF.exec(ref)?.[1];
  return name !== undefined
    && !name.includes("..")
    && !name.includes("@{")
    && !name.endsWith(".")
    && !name.endsWith(".lock");
}

function parseInventoryRows(
  value: Uint8Array | string,
  label: string,
  allowEmpty = false,
): Readonly<{ canonical: string; entries: readonly RemoteRef[] }> {
  const inputBytes = typeof value === "string" ? bytes(value) : value;
  if (inputBytes.byteLength > MAXIMUM_SNAPSHOT_BYTES) {
    fail(`${label} exceeds its byte bound.`);
  }
  if (inputBytes.byteLength === 0) {
    if (!allowEmpty) fail(`${label} is empty.`);
    return Object.freeze({ canonical: "", entries: Object.freeze([]) });
  }
  const input = typeof value === "string" ? value : decode(value, label);
  if (input.includes("\0") || input.includes("\r") || !input.endsWith("\n")) {
    fail(`${label} is not canonical line-oriented output.`);
  }
  const lines = input.slice(0, -1).split("\n");
  if (lines.length === 0 || lines.length > MAXIMUM_SNAPSHOT_ROWS || lines.some((line) => line === "")) {
    fail(`${label} has an invalid row count.`);
  }

  const entries: RemoteRef[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const fields = line.split("\t");
    if (fields.length !== 2) fail(`${label} row is malformed.`);
    const [oid, ref] = fields;
    if (oid === undefined || ref === undefined || !SHA.test(oid)) {
      fail(`${label} row has a malformed object ID.`);
    }
    if (seen.has(ref)) fail(`${label} contains duplicate ref ${ref}.`);
    seen.add(ref);
    entries.push(Object.freeze({ oid, ref }));
  }
  const canonical = entries
    .toSorted((left, right) => left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0)
    .map((entry) => `${entry.oid}\t${entry.ref}\n`)
    .join("");
  if (canonical !== input) fail(`${label} is not in canonical ref order.`);
  return Object.freeze({ canonical, entries: Object.freeze(entries) });
}

export function parseRemoteTagSnapshot(
  value: Uint8Array | string,
  requestedTag: string,
): RemoteTagSnapshot {
  if (stableVersion(requestedTag) === undefined) {
    fail("Requested release tag is not one canonical stable version.");
  }
  const parsed = parseInventoryRows(value, "Remote tag inventory");
  for (const entry of parsed.entries) {
    if (!validTagRef(entry.ref)) fail(`Remote tag inventory contains unexpected ref ${entry.ref}.`);
  }
  const requestedTagOid = parsed.entries.find(
    (entry) => entry.ref === `refs/tags/${requestedTag}`,
  )?.oid;
  if (requestedTagOid === undefined) {
    fail(`Remote tag inventory is missing refs/tags/${requestedTag}.`);
  }

  return Object.freeze({
    canonical: parsed.canonical,
    entries: parsed.entries,
    requestedTagOid,
  });
}

export function parseGovernedRemoteSnapshot(
  value: Uint8Array | string,
  requestedTag: string,
): GovernedRemoteSnapshot {
  const parsed = parseInventoryRows(value, "Combined governed remote ref inventory");
  const mainEntries = parsed.entries.filter((entry) => entry.ref === MAIN_REF);
  if (mainEntries.length !== 1) {
    fail(`Combined governed remote ref inventory must contain exactly ${MAIN_REF}.`);
  }
  const unexpected = parsed.entries.find(
    (entry) => entry.ref !== MAIN_REF && !entry.ref.startsWith("refs/tags/v"),
  );
  if (unexpected !== undefined) {
    fail(`Combined governed remote ref inventory contains unexpected ref ${unexpected.ref}.`);
  }
  const tagValue = parsed.entries
    .filter((entry) => entry.ref.startsWith("refs/tags/"))
    .map((entry) => `${entry.oid}\t${entry.ref}\n`)
    .join("");
  const tags = parseRemoteTagSnapshot(tagValue, requestedTag);
  const mainOid = mainEntries[0]?.oid;
  if (mainOid === undefined || !SHA.test(mainOid)) {
    fail("Combined governed remote ref inventory has no exact main commit.");
  }
  return Object.freeze({
    canonical: parsed.canonical,
    mainOid,
    requestedTagOid: tags.requestedTagOid,
  });
}

function readReleaseSnapshot(
  runner: GitCommandRunner,
  requestedTag: string,
): GovernedRemoteSnapshot {
  const value = command(
    runner,
    ["ls-remote", "--sort=refname", "--refs", REPOSITORY_URL, MAIN_REF, "refs/tags/v*"],
    "Combined governed remote ref inventory",
  );
  return parseGovernedRemoteSnapshot(value, requestedTag);
}

function removeStaleFetchHead(runner: GitCommandRunner): string {
  const gitDirectory = decode(command(
    runner,
    ["rev-parse", "--absolute-git-dir"],
    "Git directory identity",
  ), "Git directory identity").trim();
  const fetchHead = decode(command(
    runner,
    ["rev-parse", "--git-path", "FETCH_HEAD"],
    "FETCH_HEAD path identity",
  ), "FETCH_HEAD path identity").trim();
  if (gitDirectory === "" || fetchHead === "") fail("Git administrative paths are empty.");
  const expected = join(resolve(gitDirectory), "FETCH_HEAD");
  const actual = fetchHead.startsWith("/") ? resolve(fetchHead) : expected;
  if (!fetchHead.startsWith("/") && fetchHead !== ".git/FETCH_HEAD" && fetchHead !== "FETCH_HEAD") {
    fail("Relative FETCH_HEAD path is not canonical.");
  }
  if (actual !== expected) fail("FETCH_HEAD path escaped the exact Git administrative directory.");
  if (existsSync(actual)) {
    const information = lstatSync(actual);
    if (!information.isFile() || information.isSymbolicLink()) {
      fail("Preexisting FETCH_HEAD is not one removable regular file.");
    }
    unlinkSync(actual);
  }
  if (existsSync(actual)) fail("Preexisting FETCH_HEAD could not be removed.");
  return actual;
}

type LocalRef = Readonly<{
  objectName: string;
  objectType: string;
  peeledName: string;
  peeledType: string;
  ref: string;
}>;

function readLocalRefs(runner: GitCommandRunner): readonly LocalRef[] {
  const value = decode(command(
    runner,
    [
      "for-each-ref",
      "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)",
    ],
    "Local ref inventory",
  ), "Local ref inventory");
  if (value === "") return Object.freeze([]);
  if (value.includes("\r") || !value.endsWith("\n")) fail("Local ref inventory is malformed.");
  return Object.freeze(value.slice(0, -1).split("\n").map((line) => {
    const [ref, objectName, objectType, peeledName, peeledType, ...extra] = line.split("\0");
    if (
      extra.length > 0
      || ref === undefined
      || objectName === undefined
      || objectType === undefined
      || peeledName === undefined
      || peeledType === undefined
      || ref === ""
      || !SHA.test(objectName)
    ) fail("Local ref inventory record is incomplete.");
    return Object.freeze({ objectName, objectType, peeledName, peeledType, ref });
  }));
}

function expectExactLocalRefs(
  runner: GitCommandRunner,
  expected: readonly string[],
  label: string,
): readonly LocalRef[] {
  const refs = readLocalRefs(runner);
  const names = refs.map((entry) => entry.ref);
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    fail(`${label} does not contain the exact governed ref set.`);
  }
  return refs;
}

function checkedHead(runner: GitCommandRunner): string {
  const head = decode(command(
    runner,
    ["rev-parse", "--verify", "HEAD^{commit}"],
    "Checked-out workflow source identity",
  ), "Checked-out workflow source identity").trim();
  if (!SHA.test(head)) fail("Checked-out workflow source identity is malformed.");
  return head;
}

export function verifyReleaseRefAuthority(input: ReleaseRefAuthorityInput): ReleaseRefAuthority {
  if (stableVersion(input.requestedTag) === undefined) {
    fail("Requested release tag is not one canonical stable version.");
  }

  const runner = input.runner ?? createDefaultGitRunner(resolve(input.workingDirectory ?? process.cwd()));
  const first = readReleaseSnapshot(runner, input.requestedTag);
  const localTagRef = `refs/tags/${input.requestedTag}`;
  expectExactLocalRefs(
    runner,
    [localTagRef],
    "Local release-ref preflight",
  );
  const fetchHead = removeStaleFetchHead(runner);
  const shallow = decode(command(
    runner,
    ["rev-parse", "--is-shallow-repository"],
    "Repository shallow-state check",
  ), "Repository shallow-state check").trim();
  if (shallow !== "true" && shallow !== "false") fail("Repository shallow-state check was not exact.");
  command(
    runner,
    [
      "fetch",
      "--no-tags",
      "--no-write-fetch-head",
      "--no-recurse-submodules",
      ...(shallow === "true" ? ["--unshallow"] : []),
      REPOSITORY_URL,
      `${MAIN_REF}:${LOCAL_MAIN_REF}`,
      `${localTagRef}:${localTagRef}`,
    ],
    "Exact governed release-ref import",
  );
  if (existsSync(fetchHead)) fail("Exact governed import wrote forbidden FETCH_HEAD state.");

  const refs = expectExactLocalRefs(
    runner,
    [LOCAL_MAIN_REF, localTagRef],
    "Local release-ref post-import inventory",
  );
  const main = refs[0];
  const tag = refs[1];
  if (
    main === undefined
    || main.objectType !== "commit"
    || main.objectName !== first.mainOid
    || main.peeledName !== ""
    || main.peeledType !== ""
  ) fail("Imported main ref does not match the advertised exact commit.");
  if (
    tag === undefined
    || tag.objectType !== "commit"
    || tag.objectName !== first.requestedTagOid
    || tag.peeledName !== ""
    || tag.peeledType !== ""
  ) fail("Imported requested ref is not the advertised lightweight commit tag.");

  const head = checkedHead(runner);
  if (head !== tag.objectName) {
    fail("Release tag and checkout must name one commit.");
  }
  if (runner(["merge-base", "--is-ancestor", tag.objectName, LOCAL_MAIN_REF]).exitCode !== 0) {
    fail("Verified release commit is not an ancestor of exact advertised main.");
  }
  requireUnchangedReleaseControls(
    runner,
    tag.objectName,
    LOCAL_MAIN_REF,
    "Release commit and advertised main",
  );

  const second = readReleaseSnapshot(runner, input.requestedTag);
  if (second.canonical !== first.canonical) {
    fail("Remote release-ref inventory changed during verification.");
  }
  return Object.freeze({ mainSha: first.mainOid, sha: tag.objectName, tag: input.requestedTag });
}

function assertWorkflowIdentity(): void {
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.DEFAULT_BRANCH !== MAIN_BRANCH) {
    fail(`Release-ref authority must run for ${REPOSITORY} on exact default branch ${MAIN_BRANCH}.`);
  }
}

function main(): void {
  assertWorkflowIdentity();
  const [mode, first, ...extra] = process.argv.slice(2);
  if (extra.length > 0 || mode !== "release" || first === undefined) {
    fail("Usage: release-ref-authority.ts release TAG");
  }
  const authority = verifyReleaseRefAuthority({ requestedTag: first });
  process.stdout.write(`sha=${authority.sha}\ntag=${authority.tag}\nmain_sha=${authority.mainSha}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
