/**
 * Scripted source mutants over the production reducers, behind the nightly
 * mutation check.
 *
 * StrykerJS 10.0.0 runs under Bun only through its generic command runner,
 * which reruns a whole test command for every generated mutant with coverage
 * analysis off (see `docs/claims-review.md`). This runner instead applies each
 * named defect from `verification/mutants.json` to a private copy of the
 * repository and requires the one test the entry names to fail on the defect
 * and pass without it. A mutant counts as killed only when that exact test
 * fails; a timeout, a crash, a compile error, or a failure elsewhere is not
 * evidence. This script and `verification/` are development-only and are
 * never packaged.
 */
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  REPOSITORY_ROOT,
  VERIFICATION_ARTIFACTS,
  exactObject,
  runTool,
  sanitizeCheckerOutput,
  type ToolOutcome,
} from "./verification-tools.js";

export type SourceMutant = Readonly<{
  id: string;
  file: string;
  defect: string;
  search: string;
  replace: string;
  test: string;
  killedBy: readonly string[];
}>;

const MUTANT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/u;
const SOURCE_FILE = /^src\/(?:[a-z0-9][a-z0-9-]*\/)*[a-z0-9][a-z0-9.-]*\.ts$/u;
const TEST_FILE = /^src\/(?:[a-z0-9][a-z0-9-]*\/)*[a-z0-9][a-z0-9.-]*\.test\.ts$/u;
const MAX_SNIPPET_BYTES = 2_048;
const MAX_NAME_BYTES = 512;
/** Each test command runs one selected test; this bound is generous for that. */
export const MUTANT_TEST_TIMEOUT_MS = 5 * 60_000;

function boundedText(value: unknown, maximumBytes: number, label: string): string {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw new Error(`${label} must be a non-empty string of at most ${String(maximumBytes)} bytes`);
  }
  return value;
}

function repositoryPath(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value) || value.split("/").some((part) => part === "..")) {
    throw new Error(`${label} must be a repository source path`);
  }
  return value;
}

/** Parse `verification/mutants.json`. Every mutant names one production file, one defect, and its killing test. */
export function parseSourceMutants(value: unknown): readonly SourceMutant[] {
  const manifest = exactObject(value, ["schema", "mutants"], "mutants.json");
  if (manifest.schema !== "ghostget-source-mutants-v1") throw new Error("mutants.json has an unknown schema");
  if (!Array.isArray(manifest.mutants) || manifest.mutants.length === 0 || manifest.mutants.length > 128) {
    throw new Error("mutants.json must list between 1 and 128 mutants");
  }
  const mutants = manifest.mutants.map((entry, index): SourceMutant => {
    const label = `mutants[${String(index)}]`;
    const mutant = exactObject(entry, ["id", "file", "defect", "search", "replace", "test", "killedBy"], label);
    if (typeof mutant.id !== "string" || !MUTANT_ID.test(mutant.id)) throw new Error(`${label}.id must be a kebab-case name`);
    const file = repositoryPath(mutant.file, SOURCE_FILE, `${label}.file`);
    if (file.endsWith(".test.ts")) throw new Error(`${label}.file must be production code, not a test`);
    const search = boundedText(mutant.search, MAX_SNIPPET_BYTES, `${label}.search`);
    const replace = typeof mutant.replace === "string" && Buffer.byteLength(mutant.replace, "utf8") <= MAX_SNIPPET_BYTES
      ? mutant.replace
      : (() => { throw new Error(`${label}.replace must be a string of at most ${String(MAX_SNIPPET_BYTES)} bytes`); })();
    if (replace === search) throw new Error(`${label}.replace must change the source`);
    if (!Array.isArray(mutant.killedBy) || mutant.killedBy.length === 0 || mutant.killedBy.length > 8) {
      throw new Error(`${label}.killedBy must list the describe blocks and test name`);
    }
    const killedBy = mutant.killedBy.map((name, nameIndex) => {
      const text = boundedText(name, MAX_NAME_BYTES, `${label}.killedBy[${String(nameIndex)}]`);
      if (text !== text.trim() || /[\r\n]/u.test(text)) {
        throw new Error(`${label}.killedBy[${String(nameIndex)}] must be one trimmed line`);
      }
      return text;
    });
    return Object.freeze({
      id: mutant.id,
      file,
      defect: boundedText(mutant.defect, MAX_SNIPPET_BYTES, `${label}.defect`),
      search,
      replace,
      test: repositoryPath(mutant.test, TEST_FILE, `${label}.test`),
      killedBy: Object.freeze(killedBy),
    });
  });
  const ids = mutants.map((mutant) => mutant.id);
  if (new Set(ids).size !== ids.length) throw new Error("mutants.json must not repeat a mutant id");
  return Object.freeze(mutants);
}

export async function readSourceMutants(root: string = REPOSITORY_ROOT): Promise<readonly SourceMutant[]> {
  return parseSourceMutants(JSON.parse(await readFile(join(root, "verification/mutants.json"), "utf8")) as unknown);
}

/** Apply one mutant to its file's source. The search text must occur exactly once. */
export function applySourceMutant(source: string, mutant: SourceMutant): string {
  const first = source.indexOf(mutant.search);
  if (first < 0) throw new Error(`${mutant.id}: the search text no longer occurs in ${mutant.file}`);
  if (source.indexOf(mutant.search, first + 1) >= 0) {
    throw new Error(`${mutant.id}: the search text occurs more than once in ${mutant.file}`);
  }
  const mutated = `${source.slice(0, first)}${mutant.replace}${source.slice(first + mutant.search.length)}`;
  try {
    new Bun.Transpiler({ loader: "ts" }).transformSync(mutated);
  } catch (error) {
    // A mutant that does not compile would be "killed" by any test run.
    throw new Error(`${mutant.id}: the mutated ${mutant.file} does not compile: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return mutated;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** The anchored `--test-name-pattern` that selects exactly the killing test. */
export function mutantTestNamePattern(mutant: SourceMutant): string {
  return `^${escapeRegExp(mutant.killedBy.join(" "))}$`;
}

export function mutantTestArguments(mutant: SourceMutant): readonly string[] {
  return [
    "test",
    "--no-orphans",
    "--timeout", String(MUTANT_TEST_TIMEOUT_MS),
    "--max-concurrency", "1",
    "--test-name-pattern", mutantTestNamePattern(mutant),
    `./${mutant.test}`,
  ];
}

export type MutantRunVerdict = "pass" | "killed" | "inconclusive";

function summaryCount(output: string, label: "pass" | "fail"): number | null {
  const matches = [...output.matchAll(new RegExp(`^\\s*(\\d+) ${label}$`, "gmu"))];
  if (matches.length !== 1) return null;
  return Number(matches[0]![1]);
}

/**
 * Classify one run of a mutant's selected test. `pass` needs exactly one
 * passing test and no failure. `killed` needs exactly the named test to fail
 * and nothing to pass. Anything else, including a timeout, is inconclusive.
 */
export function mutantRunVerdict(outcome: ToolOutcome, mutant: SourceMutant): MutantRunVerdict {
  if (outcome.kind !== "exited") return "inconclusive";
  const output = `${outcome.stdout}\n${outcome.stderr}`;
  const passed = summaryCount(output, "pass");
  const failed = summaryCount(output, "fail");
  if (passed === null || failed === null) return "inconclusive";
  const failLine = `(fail) ${mutant.killedBy.join(" > ")} [`;
  const failLines = output.split(/\r?\n/u).filter((line) => line.startsWith("(fail) "));
  if (outcome.exitCode === 0 && passed === 1 && failed === 0 && failLines.length === 0) return "pass";
  if (
    outcome.exitCode !== 0
    && passed === 0
    && failed === 1
    && failLines.length === 1
    && failLines[0]!.startsWith(failLine)
  ) return "killed";
  return "inconclusive";
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function trackedFiles(root: string): Promise<readonly string[]> {
  const outcome = await runTool(["git", "ls-files", "-z"], {
    cwd: root,
    environment: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/" },
    timeoutMs: 60_000,
  });
  if (outcome.kind !== "exited" || outcome.exitCode !== 0) throw new Error("git ls-files failed");
  return outcome.stdout.split("\0").filter((path) => path.length > 0);
}

/**
 * Copy the tracked tree into `sandbox` and install the locked dependencies
 * into it, so mutation never touches the checkout. A `node_modules` symlink
 * would resolve a provider plugin's physical path back into the checkout,
 * which the plugin boundary check rejects as outside the sandbox repository.
 */
async function prepareSandbox(
  root: string,
  sandbox: string,
  environment: Readonly<Record<string, string>>,
): Promise<void> {
  for (const path of await trackedFiles(root)) {
    const source = join(root, path);
    const stat = await lstat(source).catch(() => null);
    if (stat === null || !stat.isFile()) continue;
    await mkdir(dirname(join(sandbox, path)), { recursive: true });
    await copyFile(source, join(sandbox, path));
  }
  const install = await runTool(
    [process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"],
    { cwd: sandbox, environment, timeoutMs: MUTANT_TEST_TIMEOUT_MS },
  );
  if (install.kind !== "exited" || install.exitCode !== 0) {
    throw new Error(`sandbox dependency installation failed: ${sanitizeCheckerOutput(install.stderr, [[sandbox, "<sandbox>"], [root, "<repository>"]]).slice(-2_000)}`);
  }
}

export async function runSourceMutants(root: string = REPOSITORY_ROOT): Promise<void> {
  const mutants = await readSourceMutants(root);
  const artifacts = join(root, VERIFICATION_ARTIFACTS, "mutants");
  await rm(artifacts, { recursive: true, force: true });
  await mkdir(artifacts, { recursive: true });
  const sandbox = await mkdtemp(join(tmpdir(), "ghostget-mutants-"));
  const replacements = [[sandbox, "<sandbox>"], [root, "<repository>"]] as const;
  const clean = (text: string): string => sanitizeCheckerOutput(text, replacements);
  const results: Record<string, unknown>[] = [];
  const failures: string[] = [];
  const environment = Object.freeze({
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? sandbox,
    TMPDIR: tmpdir(),
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
    NO_COLOR: "1",
  });
  try {
    await prepareSandbox(root, sandbox, environment);
    for (const mutant of mutants) {
      const target = join(sandbox, mutant.file);
      const original = await readFile(target, "utf8");
      const mutated = applySourceMutant(original, mutant);
      const run = async (label: "baseline" | "mutant"): Promise<MutantRunVerdict> => {
        const command = [process.execPath, ...mutantTestArguments(mutant)];
        const outcome = await runTool(command, { cwd: sandbox, environment, timeoutMs: MUTANT_TEST_TIMEOUT_MS + 60_000 });
        const verdict = mutantRunVerdict(outcome, mutant);
        const status = outcome.kind === "exited" ? `exit ${String(outcome.exitCode)}` : `${outcome.kind}: ${outcome.detail}`;
        await writeFile(join(artifacts, `${mutant.id}-${label}.log`), clean([
          `$ bun ${mutantTestArguments(mutant).join(" ")}`,
          `# ${status}; verdict ${verdict}`,
          "## stdout", outcome.stdout, "## stderr", outcome.stderr, "",
        ].join("\n")));
        return verdict;
      };
      const baseline = await run("baseline");
      await writeFile(target, mutated);
      let mutantVerdict: MutantRunVerdict;
      try {
        mutantVerdict = await run("mutant");
      } finally {
        await writeFile(target, original);
      }
      const killed = baseline === "pass" && mutantVerdict === "killed";
      results.push({ id: mutant.id, file: mutant.file, test: mutant.test, killedBy: mutant.killedBy, baseline, mutant: mutantVerdict, killed });
      console.log(`${mutant.id}: baseline ${baseline}, mutant ${mutantVerdict}${killed ? "" : " (NOT KILLED)"}`);
      if (!killed) failures.push(mutant.id);
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true });
    await writeFile(join(artifacts, "summary.json"), `${JSON.stringify({ mutants: results }, null, 2)}\n`);
  }
  if (failures.length > 0) {
    throw new Error(`${String(failures.length)} of ${String(mutants.length)} mutants were not killed: ${failures.join(", ")}`);
  }
  console.log(`all ${String(mutants.length)} source mutants were killed by their named tests`);
}

if (import.meta.main) {
  if (process.argv.length !== 2) {
    console.error("usage: bun run ./scripts/verification-mutants.ts");
    process.exit(2);
  }
  try {
    await runSourceMutants();
  } catch (error) {
    console.error(`verification mutants failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
