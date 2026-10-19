/**
 * Shared pieces of the Quint ITF replay tests: seeded trace generation and
 * strict readers for the values those tests decode. Each replay test owns its
 * mapping from model actions to production operations.
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { itfString, parseItfTrace, type ItfTrace, type ItfValue } from "./verification-itf.js";
import {
  QUINT,
  QUINT_TRACE_TIMEOUT_MS,
  REPOSITORY_ROOT,
  quintTraceArguments,
  readQuintModels,
  requireFinished,
  runTool,
  type QuintModel,
} from "./verification-tools.js";

/** The `models.json` entry for `file`, failing when the manifest does not list it. */
export async function quintModel(file: string): Promise<QuintModel> {
  const model = (await readQuintModels()).find((candidate) => candidate.file === file);
  if (model === undefined) throw new Error(`models.json does not list ${file}`);
  return model;
}

/**
 * Run Quint's model-based testing mode for `step` with the manifest's trace
 * count, seed, and length, and strictly parse every trace it writes. The
 * traces live in a temporary directory and never enter Git.
 */
export async function generateQuintTraces(model: QuintModel, step: string): Promise<readonly ItfTrace[]> {
  const node = Bun.which("node");
  if (node === null) throw new Error("node must be on PATH to run Quint");
  const directory = await mkdtemp(join(tmpdir(), "ghostget-quint-traces-"));
  try {
    const outcome = await runTool([
      node,
      join(REPOSITORY_ROOT, QUINT.cli),
      ...quintTraceArguments(model, step, model.replay.traces, model.replay.seed, directory),
    ], {
      cwd: join(REPOSITORY_ROOT, "verification", "quint"),
      environment: { HOME: directory, PATH: "/usr/bin:/bin", NO_COLOR: "1", FORCE_COLOR: "0", TZ: "UTC" },
      timeoutMs: QUINT_TRACE_TIMEOUT_MS,
    });
    const result = requireFinished("quint run --mbt", outcome);
    if (result.exitCode !== 0) {
      throw new Error(`quint run --mbt exited with ${String(result.exitCode)}: ${result.stderr.slice(0, 2_000)}`);
    }
    const names = (await readdir(directory)).filter((name) => name.endsWith(".itf.json")).sort();
    const expected = Array.from({ length: model.replay.traces }, (_, index) => `trace_${String(index)}.itf.json`).sort();
    if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
      throw new Error(`quint run --mbt wrote ${String(names.length)} traces, not the ${String(expected.length)} requested`);
    }
    return await Promise.all(expected.map(async (name) => parseItfTrace(await readFile(join(directory, name), "utf8"))));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Generate each step's traces once per test file. */
export function quintTraceCache(file: string): (step: string) => Promise<readonly ItfTrace[]> {
  const cache = new Map<string, Promise<readonly ItfTrace[]>>();
  return (step) => {
    const cached = cache.get(step) ?? quintModel(file).then((model) => generateQuintTraces(model, step));
    cache.set(step, cached);
    return cached;
  };
}

export function itfInt(value: ItfValue, label: string): number {
  if (value.kind !== "int" || value.value < BigInt(Number.MIN_SAFE_INTEGER) || value.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`ITF ${label} must be a safe integer`);
  }
  return Number(value.value);
}

export function itfBool(value: ItfValue, label: string): boolean {
  if (value.kind !== "bool") throw new Error(`ITF ${label} must be a boolean`);
  return value.value;
}

/** Decode a Quint map with string keys, reading each value with `read`. */
export function itfStringMap<T>(
  value: ItfValue,
  label: string,
  read: (entry: ItfValue, label: string) => T,
): ReadonlyMap<string, T> {
  if (value.kind !== "map") throw new Error(`ITF ${label} must be a map`);
  const entries = new Map<string, T>();
  for (const [key, entry] of value.entries) {
    const name = itfString(key, `${label} key`);
    entries.set(name, read(entry, `${label}.${name}`));
  }
  return entries;
}
