import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import type { IAsyncProperty, IProperty, Parameters } from "fast-check";

export { fc };
export type * from "fast-check";

type PropertyReplayEnvironment = Readonly<Record<string, unknown>>;
export type PropertyReplayCoordinate =
  | Readonly<{ seed: number; path?: string }>
  | Readonly<{ path?: never; seed?: never }>;
type PropertyOverrides<Values> = Omit<Parameters<Values>, "path" | "seed">
  & Readonly<{ path?: never; seed?: never }>;

const MIN_FAST_CHECK_SEED = -2_147_483_648;
const MAX_FAST_CHECK_SEED = 2_147_483_647;
const MAX_FAST_CHECK_PATH_BYTES = 512;
const MAX_FAST_CHECK_PATH_SEGMENT = 10_000;
const MAX_FAST_CHECK_PATH_WORK = 100_000;

function isComputationallyBoundedFastCheckPath(path: string): boolean {
  if (!/^(?:0|[1-9]\d*)(?::(?:0|[1-9]\d*))*$/u.test(path)) return false;
  let work = 0;
  for (const segment of path.split(":")) {
    const skip = Number(segment);
    if (!Number.isSafeInteger(skip) || skip > MAX_FAST_CHECK_PATH_SEGMENT) {
      return false;
    }
    work += skip;
    if (work > MAX_FAST_CHECK_PATH_WORK) return false;
  }
  return true;
}

/**
 * Parse an opt-in fast-check replay coordinate without accepting ambiguous or
 * unbounded process input. A path is meaningful only with the seed that
 * produced it, so the pair fails closed instead of silently replaying a
 * different workload.
 */
export function propertyReplayParameters(
  environment: PropertyReplayEnvironment = process.env,
): PropertyReplayCoordinate {
  const rawSeed = environment.GHOSTGET_PROPERTY_SEED === undefined
    ? environment.WRENCH_PROPERTY_SEED
    : environment.GHOSTGET_PROPERTY_SEED;
  const rawPath = environment.GHOSTGET_PROPERTY_PATH === undefined
    ? environment.WRENCH_PROPERTY_PATH
    : environment.GHOSTGET_PROPERTY_PATH;
  if (rawSeed === undefined && rawPath === undefined) return Object.freeze({});
  if (rawSeed === undefined) {
    throw new Error(
      "GHOSTGET_PROPERTY_PATH requires GHOSTGET_PROPERTY_SEED",
    );
  }
  if (
    typeof rawSeed !== "string"
    || !/^-?(?:0|[1-9]\d{0,9})$/u.test(rawSeed)
  ) {
    throw new Error("GHOSTGET_PROPERTY_SEED must be a canonical 32-bit integer");
  }
  const seed = Number(rawSeed);
  if (
    !Number.isSafeInteger(seed)
    || Object.is(seed, -0)
    || seed < MIN_FAST_CHECK_SEED
    || seed > MAX_FAST_CHECK_SEED
  ) {
    throw new Error("GHOSTGET_PROPERTY_SEED must be a canonical 32-bit integer");
  }
  if (rawPath === undefined) return Object.freeze({ seed });
  if (
    typeof rawPath !== "string"
    || Buffer.byteLength(rawPath, "utf8") > MAX_FAST_CHECK_PATH_BYTES
    || !isComputationallyBoundedFastCheckPath(rawPath)
  ) {
    throw new Error("GHOSTGET_PROPERTY_PATH must be a bounded fast-check path");
  }
  return Object.freeze({ seed, path: rawPath });
}

const environmentReplayParameters = propertyReplayParameters();

export const propertyParameters = Object.freeze({
  numRuns: 200,
  interruptAfterTimeLimit: 10_000,
  markInterruptAsFailure: true,
  ...environmentReplayParameters,
}) satisfies Parameters<unknown>;

function validateExplicitReplayCoordinate(
  value: PropertyReplayCoordinate,
): PropertyReplayCoordinate {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("property replay coordinate must be one exact object");
  }
  const keys = Reflect.ownKeys(value).sort((left, right) =>
    String(left).localeCompare(String(right)));
  if (keys.some((key) => key !== "path" && key !== "seed")) {
    throw new Error("property replay coordinate has an unexpected field");
  }
  if (!("seed" in value)) {
    if ("path" in value) throw new Error("property replay path requires its seed");
    return Object.freeze({});
  }
  const seed = value.seed;
  if (
    typeof seed !== "number"
    || !Number.isSafeInteger(seed)
    || Object.is(seed, -0)
    || seed < MIN_FAST_CHECK_SEED
    || seed > MAX_FAST_CHECK_SEED
  ) {
    throw new Error("property replay seed must be a canonical 32-bit integer");
  }
  if (!("path" in value)) return Object.freeze({ seed });
  const path = value.path;
  if (
    typeof path !== "string"
    || Buffer.byteLength(path, "utf8") > MAX_FAST_CHECK_PATH_BYTES
    || !isComputationallyBoundedFastCheckPath(path)
  ) {
    throw new Error("property replay path must be a bounded fast-check path");
  }
  return Object.freeze({ seed, path });
}

const MAX_PROPERTY_RUN_MULTIPLIER = 100;

/**
 * Parse the opt-in soak multiplier. It scales every property's run count and
 * interruption budget together, so a nightly soak explores more cases without
 * turning the per-run time budget into a failure.
 */
export function propertyRunMultiplier(
  environment: PropertyReplayEnvironment = process.env,
): number {
  const raw = environment.GHOSTGET_PROPERTY_RUNS;
  if (raw === undefined) return 1;
  if (typeof raw !== "string" || !/^[1-9]\d{0,2}$/u.test(raw)) {
    throw new Error(
      `GHOSTGET_PROPERTY_RUNS must be a canonical integer from 1 to ${String(MAX_PROPERTY_RUN_MULTIPLIER)}`,
    );
  }
  const multiplier = Number(raw);
  if (multiplier > MAX_PROPERTY_RUN_MULTIPLIER) {
    throw new Error(
      `GHOSTGET_PROPERTY_RUNS must be a canonical integer from 1 to ${String(MAX_PROPERTY_RUN_MULTIPLIER)}`,
    );
  }
  return multiplier;
}

const environmentRunMultiplier = propertyRunMultiplier();

/** One recorded coordinate for a named property in the seed corpus. */
export type PropertyCorpusEntry = Readonly<{
  kind: "counterexample" | "workload";
  seed: number;
  path?: string;
  origin: string;
  /** The named example test that pins a counterexample; absent for a workload seed. */
  regression?: string;
}>;

/** One named property: the test file that runs it and its recorded coordinates. */
export type PropertyCorpusProperty = Readonly<{
  file: string;
  entries: readonly PropertyCorpusEntry[];
}>;

export type PropertyCorpus = ReadonlyMap<string, PropertyCorpusProperty>;

export const PROPERTY_CORPUS_SCHEMA = "ghostget-property-seeds-v1";
export const PROPERTY_CORPUS_PATH = "verification/seeds/corpus.json";
const PROPERTY_NAME = /^[a-z0-9]+(?:[-/.][a-z0-9]+)*$/u;
const CORPUS_FILE = /^(?:src|scripts|edge|website)\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.test\.ts$/u;
const MAX_CORPUS_PROPERTIES = 256;
const MAX_CORPUS_ENTRIES = 32;
const MAX_CORPUS_TEXT = 300;

function plainRecord(value: unknown, where: string): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${where} must be a plain object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(
  record: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[],
  where: string,
): void {
  for (const key of required) {
    if (!Object.hasOwn(record, key)) throw new Error(`${where} is missing ${key}`);
  }
  for (const key of Object.keys(record)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new Error(`${where} has an unsupported key ${key}`);
    }
  }
}

function corpusText(value: unknown, where: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MAX_CORPUS_TEXT
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${where} must be one trimmed line of at most ${String(MAX_CORPUS_TEXT)} characters`);
  }
  return value;
}

function parseCorpusEntry(value: unknown, where: string): PropertyCorpusEntry {
  const record = plainRecord(value, where);
  exactKeys(record, ["kind", "seed", "origin"], ["path", "regression"], where);
  const kind = record.kind;
  if (kind !== "counterexample" && kind !== "workload") {
    throw new Error(`${where}.kind must be counterexample or workload`);
  }
  const coordinate = validateExplicitReplayCoordinate(
    Object.hasOwn(record, "path")
      ? { seed: record.seed as number, path: record.path as string }
      : { seed: record.seed as number },
  );
  if (coordinate.seed === undefined) throw new Error(`${where}.seed is required`);
  const origin = corpusText(record.origin, `${where}.origin`);
  if (kind === "counterexample") {
    const regression = corpusText(record.regression, `${where}.regression`);
    return Object.freeze({ kind, ...coordinate, origin, regression });
  }
  if (Object.hasOwn(record, "regression")) {
    throw new Error(`${where} is a workload seed and names no regression`);
  }
  return Object.freeze({ kind, ...coordinate, origin });
}

/**
 * Parse the checked-in seed corpus: a strict map from a property name to the
 * test file that runs it and the seeds and shrink paths recorded for it.
 */
export function parsePropertyCorpus(value: unknown): PropertyCorpus {
  const root = plainRecord(value, "property corpus");
  exactKeys(root, ["schema", "properties"], [], "property corpus");
  if (root.schema !== PROPERTY_CORPUS_SCHEMA) {
    throw new Error(`property corpus schema must be ${PROPERTY_CORPUS_SCHEMA}`);
  }
  const properties = plainRecord(root.properties, "property corpus properties");
  const names = Object.keys(properties);
  if (names.length > MAX_CORPUS_PROPERTIES) {
    throw new Error(`property corpus holds at most ${String(MAX_CORPUS_PROPERTIES)} properties`);
  }
  const sorted = [...names].sort();
  if (names.some((name, index) => name !== sorted[index])) {
    throw new Error("property corpus names must be sorted");
  }
  const corpus = new Map<string, PropertyCorpusProperty>();
  for (const name of names) {
    const where = `property corpus ${name}`;
    if (name.length > 128 || !PROPERTY_NAME.test(name)) {
      throw new Error(`${where} has an invalid name`);
    }
    const record = plainRecord(properties[name], where);
    exactKeys(record, ["file", "entries"], [], where);
    const file = record.file;
    if (typeof file !== "string" || !CORPUS_FILE.test(file) || file.split("/").includes("..")) {
      throw new Error(`${where}.file must be a repository test file`);
    }
    const entries = record.entries;
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_CORPUS_ENTRIES) {
      throw new Error(`${where}.entries must hold 1 to ${String(MAX_CORPUS_ENTRIES)} coordinates`);
    }
    const parsed = entries.map((entry, index) => parseCorpusEntry(entry, `${where}.entries[${String(index)}]`));
    const coordinates = new Set(parsed.map((entry) => `${String(entry.seed)}/${entry.path ?? ""}`));
    if (coordinates.size !== parsed.length) throw new Error(`${where} repeats a coordinate`);
    corpus.set(name, Object.freeze({ file, entries: Object.freeze(parsed) }));
  }
  return corpus;
}

let loadedCorpus: PropertyCorpus | undefined;

/** The repository seed corpus, read and parsed once per process. */
export function propertyCorpus(): PropertyCorpus {
  loadedCorpus ??= parsePropertyCorpus(JSON.parse(
    readFileSync(join(import.meta.dir, "..", PROPERTY_CORPUS_PATH), "utf8"),
  ) as unknown);
  return loadedCorpus;
}

type PropertyRun<Values> = Readonly<{
  parameters: Parameters<Values>;
  label: string | null;
}>;

/** Scale a property's run count and interruption budget by a soak multiplier. */
export function soakParameters<Values>(
  parameters: Parameters<Values>,
  multiplier: number,
): Parameters<Values> {
  if (multiplier === 1) return parameters;
  return {
    ...parameters,
    numRuns: (parameters.numRuns ?? propertyParameters.numRuns) * multiplier,
    ...(parameters.interruptAfterTimeLimit === undefined
      ? {}
      : { interruptAfterTimeLimit: parameters.interruptAfterTimeLimit * multiplier }),
  };
}

function assertionRuns<Values>(
  overrides: PropertyOverrides<Values>,
  replay: PropertyReplayCoordinate | string | undefined,
): readonly PropertyRun<Values>[] {
  if (Object.hasOwn(overrides, "seed") || Object.hasOwn(overrides, "path")) {
    throw new Error(
      "seed and path must use the dedicated property replay coordinate",
    );
  }
  const base = soakParameters<Values>({ ...propertyParameters, ...overrides }, environmentRunMultiplier);
  if (typeof replay === "string") {
    const property = propertyCorpus().get(replay);
    if (property === undefined) {
      throw new Error(`property ${replay} has no entry in ${PROPERTY_CORPUS_PATH}`);
    }
    // An environment coordinate replays exactly one case; the corpus stays out of it.
    if (Object.keys(environmentReplayParameters).length > 0) return [{ parameters: base, label: null }];
    return [
      ...property.entries.map((entry) => ({
        parameters: {
          ...base,
          seed: entry.seed,
          ...(entry.path === undefined ? {} : { path: entry.path }),
        },
        label: `seed corpus ${replay} ${entry.kind} seed ${String(entry.seed)}`
          + (entry.path === undefined ? "" : ` path ${entry.path}`),
      })),
      { parameters: base, label: null },
    ];
  }
  const explicitReplay = replay === undefined
    ? undefined
    : validateExplicitReplayCoordinate(replay);
  if (
    explicitReplay !== undefined
    && Object.keys(environmentReplayParameters).length > 0
    && (
      explicitReplay.seed !== environmentReplayParameters.seed
      || explicitReplay.path !== environmentReplayParameters.path
    )
  ) {
    throw new Error(
      "explicit property replay coordinate conflicts with the environment replay coordinate",
    );
  }
  return [{ parameters: { ...base, ...explicitReplay }, label: null }];
}

function labelledFailure(label: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${label} failed again:\n${message}`, { cause: error });
}

/**
 * Run a synchronous property with repository defaults and native replay output.
 * Replay coordinates use their own argument so a generic override cannot split
 * the pair. A property name instead replays that property's seed corpus entries
 * before the ordinary random run.
 */
export function assertProperty<Values>(
  property: IProperty<Values>,
  overrides: PropertyOverrides<Values> = {},
  replay?: PropertyReplayCoordinate | string,
): void {
  for (const run of assertionRuns(overrides, replay)) {
    try {
      fc.assert(property, run.parameters);
    } catch (error) {
      if (run.label === null) throw error;
      throw labelledFailure(run.label, error);
    }
  }
}

/** Run an asynchronous property with the same bounded defaults, replay boundary, and corpus. */
export async function assertAsyncProperty<Values>(
  property: IAsyncProperty<Values>,
  overrides: PropertyOverrides<Values> = {},
  replay?: PropertyReplayCoordinate | string,
): Promise<void> {
  for (const run of assertionRuns(overrides, replay)) {
    try {
      await fc.assert(property, run.parameters);
    } catch (error) {
      if (run.label === null) throw error;
      throw labelledFailure(run.label, error);
    }
  }
}
