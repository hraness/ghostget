/**
 * The nightly property soak: every `src` unit test file that calls
 * `assertProperty` or `assertAsyncProperty`, run with `GHOSTGET_PROPERTY_RUNS`
 * multiplying each property's run count and interrupt limit. A failure prints
 * fast-check's seed and shrink path; replay it with `GHOSTGET_PROPERTY_SEED`
 * and `GHOSTGET_PROPERTY_PATH`. `src/test-harness-policy.test.ts` rejects any
 * other fast-check runner, so every property scales.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  BUN_TEST_TIMEOUT_MS,
  assignUnitTestShards,
  listSrcUnitTestFiles,
  parseShardRequest,
} from "./ci-test-shard.js";
import { propertyRunMultiplier } from "../src/test-support.js";

const SHARED_PROPERTY_CALL = /\bassert(?:Async)?Property\(/u;
/** A soak test may take its multiplied share of the runner timeout, up to this ceiling. */
export const MAX_SOAK_TEST_TIMEOUT_MS = 4 * 60 * 60_000;

/** Every src unit test file that runs at least one property through the shared helpers. */
export async function listSoakTestFiles(root: string): Promise<readonly string[]> {
  const files = await listSrcUnitTestFiles(root);
  const selected: string[] = [];
  for (const file of files) {
    if (SHARED_PROPERTY_CALL.test(await readFile(join(root, file), "utf8"))) selected.push(file);
  }
  if (selected.length === 0) throw new Error("the property soak found no property test files");
  return Object.freeze(selected);
}

/** Read the soak multiplier, which must be set explicitly and above 1. */
export function soakMultiplier(environment: Readonly<Record<string, unknown>>): number {
  if (environment.GHOSTGET_PROPERTY_RUNS === undefined) {
    throw new Error("the property soak requires GHOSTGET_PROPERTY_RUNS");
  }
  const multiplier = propertyRunMultiplier(environment);
  if (multiplier < 2) throw new Error("the property soak requires GHOSTGET_PROPERTY_RUNS of at least 2");
  return multiplier;
}

export function soakTestArguments(
  files: readonly string[],
  concurrency: number,
  multiplier: number,
): readonly string[] {
  if (files.length === 0) throw new Error("refusing to invoke bun test without files");
  return [
    "test",
    "--no-orphans",
    "--timeout",
    String(Math.min(BUN_TEST_TIMEOUT_MS * multiplier, MAX_SOAK_TEST_TIMEOUT_MS)),
    "--max-concurrency",
    String(concurrency),
    ...files,
  ];
}

async function runSoakFromProcess(): Promise<void> {
  const request = parseShardRequest({
    concurrency: process.env.GOMAXPROCS,
    shard: process.argv[2],
    shardCount: process.argv[3],
  });
  const multiplier = soakMultiplier(process.env);
  const root = process.cwd();
  const shards = assignUnitTestShards(await listSoakTestFiles(root), request.shardCount);
  const files = shards[request.shard - 1];
  if (files === undefined || files.length === 0) {
    throw new Error(`soak shard ${String(request.shard)} has no test files`);
  }
  process.stderr.write(
    `ghostget property soak ${String(request.shard)}/${String(request.shardCount)}: `
    + `${String(files.length)} files at ${String(multiplier)}x runs\n`,
  );
  const child = Bun.spawn([process.execPath, ...soakTestArguments(files, request.concurrency, multiplier)], {
    cwd: root,
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) process.exit(exitCode);
}

if (import.meta.main) {
  await runSoakFromProcess();
}
