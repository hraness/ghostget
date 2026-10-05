import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const UNIT_TEST_FILE_PATTERN = /[._](?:test|spec)\.(?:js|jsx|ts|tsx)$/u;
const OMNI_RUNTIME_TEST_FILE = "src/omni-runtime.test.ts";
const DEFAULT_CONCURRENCY = 4;
const MAX_SHARD_COUNT = 16;
const DEFAULT_FILE_WEIGHT = 2;

// Wall seconds observed for the heaviest `./src` files during Linux main CI
// on GitHub-hosted ubuntu-latest (run 37333666216, eight shards). Rounded up
// from each file group in the complete job logs; used only to pack shards.
// Every discovered file still runs exactly once. Rounded weights below ten
// seconds use the default. Refresh when a shard drifts over a minute from the rest.
const MEASURED_FILE_WEIGHTS = Object.freeze({
  "src/messaging-runtime-execution.test.ts": 515,
  "src/runtime.test.ts": 502,
  "src/state-crash-harness.test.ts": 272,
  "src/provider-plugin-portable-runtime.test.ts": 178,
  "src/ghostget.test.ts": 169,
  "src/messaging-automation-groups.test.ts": 152,
  "src/control/interface-cli.test.ts": 141,
  "src/read-client.test.ts": 125,
  "src/read-projections.test.ts": 122,
  "src/operation-permission.test.ts": 115,
  "src/support-cli.test.ts": 76,
  "src/session-secrets.test.ts": 69,
  "src/web-session-recovery.test.ts": 69,
  "src/contracts-cli.test.ts": 59,
  "src/derive.test.ts": 44,
  "src/scripts/sync-bundled-adapters.test.ts": 43,
  "src/control/helper-lifecycle.test.ts": 41,
  "src/messaging-automation.test.ts": 40,
  "src/auth-storage.test.ts": 35,
  "src/control/registry-helper.test.ts": 32,
  "src/control/vault.test.ts": 31,
  "src/linked-device-lifecycle-runtime.test.ts": 31,
  "src/provider-plugin-store.test.ts": 28,
  "src/contract-repair-cli.test.ts": 27,
  "src/control/read-capability.test.ts": 27,
  "src/read-projections-omni.test.ts": 26,
  "src/messaging-provider-identity-collision.test.ts": 24,
  "src/read-path-incarnation.test.ts": 23,
  "src/cli.test.ts": 21,
  "src/messaging-confirmation-recovery.test.ts": 21,
  "src/providers/beeper-local-runtime.internal.test.ts": 21,
  "src/messaging-automation-server.test.ts": 20,
  "src/read-path-preparation.test.ts": 20,
  "src/confirmed-write-intent-fence.test.ts": 19,
  "src/provider-plugin-host.test.ts": 17,
  "src/client.test.ts": 16,
  "src/web-session-cleanup-admission.test.ts": 15,
  "src/control/helper-client.test.ts": 14,
  "src/catalog-cli.test.ts": 13,
  "src/provider-contract-inventory.test.ts": 13,
  "src/adapter-generation.test.ts": 12,
  "src/browser-admission.test.ts": 11,
  "src/provider-plugin-invocation-lease.test.ts": 11,
  "src/provider-plugin-lifecycle.test.ts": 11,
  "src/run-journal.property.test.ts": 11,
  "src/auth-output.test.ts": 10,
  "src/control/account-revision.test.ts": 10,
});

export const CI_UNIT_TEST_SHARD_COUNT = 8;
export const BUN_TEST_TIMEOUT_MS = 180_000;

export type ShardRequest = {
  readonly concurrency: number;
  readonly shard: number;
  readonly shardCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePositiveInteger(value: unknown, label: string, maximum: number): number {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > maximum) {
      throw new Error(`${label} must be an integer from 1 to ${String(maximum)}`);
    }
    return value;
  }
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`${label} must be an integer from 1 to ${String(maximum)}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new Error(`${label} must be an integer from 1 to ${String(maximum)}`);
  }
  return parsed;
}

export function parseShardRequest(input: unknown): ShardRequest {
  if (!isRecord(input)) {
    throw new Error("shard request must be one object");
  }
  const allowed = new Set(["concurrency", "shard", "shardCount"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`shard request has unexpected field ${key}`);
    }
  }
  if (!Object.hasOwn(input, "shard") || !Object.hasOwn(input, "shardCount")) {
    throw new Error("shard request requires shard and shardCount");
  }
  const shard = parsePositiveInteger(input.shard, "shard", MAX_SHARD_COUNT);
  const shardCount = parsePositiveInteger(input.shardCount, "shardCount", MAX_SHARD_COUNT);
  if (shard > shardCount) {
    throw new Error(`shard ${String(shard)} is outside 1..${String(shardCount)}`);
  }
  const concurrency = input.concurrency === undefined
    ? DEFAULT_CONCURRENCY
    : parsePositiveInteger(input.concurrency, "concurrency", 64);
  return { concurrency, shard, shardCount };
}

export function posixRepoPath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}

export function isSrcUnitTestFile(relativePath: string): boolean {
  return relativePath.startsWith("src/")
    && UNIT_TEST_FILE_PATTERN.test(relativePath)
    && relativePath !== OMNI_RUNTIME_TEST_FILE;
}

async function collectFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
      continue;
    }
    if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function listSrcUnitTestFiles(root: string): Promise<readonly string[]> {
  const srcRoot = join(root, "src");
  const files = (await collectFiles(srcRoot))
    .map((path) => posixRepoPath(root, path))
    .filter((path) => isSrcUnitTestFile(path))
    .sort((left, right) => left.localeCompare(right));
  if (files.length === 0) {
    throw new Error("src unit-test inventory is empty");
  }
  return files;
}

export function fileWeight(relativePath: string): number {
  return MEASURED_FILE_WEIGHTS[relativePath as keyof typeof MEASURED_FILE_WEIGHTS]
    ?? DEFAULT_FILE_WEIGHT;
}

export function assignUnitTestShards(
  files: readonly string[],
  shardCount: number,
): readonly (readonly string[])[] {
  if (!Number.isInteger(shardCount) || shardCount < 1 || shardCount > MAX_SHARD_COUNT) {
    throw new Error(`shardCount must be an integer from 1 to ${String(MAX_SHARD_COUNT)}`);
  }
  const unique = new Set(files);
  if (unique.size !== files.length) {
    throw new Error("unit-test inventory contains duplicate paths");
  }
  for (const file of files) {
    if (!isSrcUnitTestFile(file)) {
      throw new Error(`refusing to shard non-unit test file ${file}`);
    }
  }
  const shards: string[][] = Array.from({ length: shardCount }, () => []);
  const weights = Array.from({ length: shardCount }, () => 0);
  const ordered = [...files].sort((left, right) => {
    const weightDelta = fileWeight(right) - fileWeight(left);
    return weightDelta !== 0 ? weightDelta : left.localeCompare(right);
  });
  for (const file of ordered) {
    let index = 0;
    for (let candidate = 1; candidate < shardCount; candidate += 1) {
      const current = weights[index];
      const next = weights[candidate];
      if (current === undefined || next === undefined) {
        throw new Error("shard weight inventory drifted");
      }
      if (next < current || (next === current && candidate < index)) {
        index = candidate;
      }
    }
    const shard = shards[index];
    const currentWeight = weights[index];
    if (shard === undefined || currentWeight === undefined) {
      throw new Error("shard inventory drifted");
    }
    shard.push(file);
    weights[index] = currentWeight + fileWeight(file);
  }
  return shards.map((shard) => Object.freeze([...shard].sort((left, right) =>
    left.localeCompare(right)
  )));
}

export async function filesForShard(
  root: string,
  request: ShardRequest,
): Promise<readonly string[]> {
  const files = await listSrcUnitTestFiles(root);
  const shards = assignUnitTestShards(files, request.shardCount);
  const selected = shards[request.shard - 1];
  if (selected === undefined || selected.length === 0) {
    throw new Error(`shard ${String(request.shard)} has no test files`);
  }
  return selected;
}

export function bunUnitTestArguments(
  files: readonly string[],
  concurrency: number,
): readonly string[] {
  if (files.length === 0) {
    throw new Error("refusing to invoke bun test without files");
  }
  return [
    "test",
    "--no-orphans",
    "--timeout",
    String(BUN_TEST_TIMEOUT_MS),
    "--max-concurrency",
    String(concurrency),
    ...files,
  ];
}

async function runShardFromProcess(): Promise<void> {
  const request = parseShardRequest({
    concurrency: process.env.GOMAXPROCS,
    shard: process.argv[2],
    shardCount: process.argv[3],
  });
  const root = process.cwd();
  const files = await filesForShard(root, request);
  process.stderr.write(
    `ghostget ci-test-shard ${String(request.shard)}/${String(request.shardCount)}: `
    + `${String(files.length)} files\n`,
  );
  const child = Bun.spawn([process.execPath, ...bunUnitTestArguments(files, request.concurrency)], {
    cwd: root,
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

if (import.meta.main) {
  await runShardFromProcess();
}
