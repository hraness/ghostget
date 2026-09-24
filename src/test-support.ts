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

export const MAX_PROPERTY_RUNS_MULTIPLIER = 100;
const FAST_CHECK_DEFAULT_NUM_RUNS = 100;

/**
 * Parse `GHOSTGET_PROPERTY_RUNS`, the soak multiplier for every property's run
 * count and interrupt time limit. Unset means 1. The nightly soak sets it; a
 * replayed seed and path still select exactly one counterexample.
 */
export function propertyRunsMultiplier(
  environment: PropertyReplayEnvironment = process.env,
): number {
  const raw = environment.GHOSTGET_PROPERTY_RUNS;
  if (raw === undefined) return 1;
  if (typeof raw !== "string" || !/^[1-9]\d{0,2}$/u.test(raw)) {
    throw new Error(
      `GHOSTGET_PROPERTY_RUNS must be an integer from 1 to ${String(MAX_PROPERTY_RUNS_MULTIPLIER)}`,
    );
  }
  const multiplier = Number(raw);
  if (multiplier > MAX_PROPERTY_RUNS_MULTIPLIER) {
    throw new Error(
      `GHOSTGET_PROPERTY_RUNS must be an integer from 1 to ${String(MAX_PROPERTY_RUNS_MULTIPLIER)}`,
    );
  }
  return multiplier;
}

/**
 * Scale a property's run count and interrupt limit by the soak multiplier. The
 * limit scales too, so a soak run is interrupted, and fails, only when it runs
 * slower per case than the unscaled property.
 */
export function scalePropertyRuns<Values>(
  parameters: Parameters<Values>,
  multiplier: number,
): Parameters<Values> {
  if (
    !Number.isSafeInteger(multiplier)
    || multiplier < 1
    || multiplier > MAX_PROPERTY_RUNS_MULTIPLIER
  ) {
    throw new Error("property runs multiplier is out of range");
  }
  if (multiplier === 1) return parameters;
  return {
    ...parameters,
    numRuns: (parameters.numRuns ?? FAST_CHECK_DEFAULT_NUM_RUNS) * multiplier,
    ...parameters.interruptAfterTimeLimit === undefined
      ? {}
      : { interruptAfterTimeLimit: parameters.interruptAfterTimeLimit * multiplier },
  };
}

const environmentReplayParameters = propertyReplayParameters();
const environmentRunsMultiplier = propertyRunsMultiplier();

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

function assertionParameters<Values>(
  overrides: PropertyOverrides<Values>,
  replay: PropertyReplayCoordinate | undefined,
): Parameters<Values> {
  if (Object.hasOwn(overrides, "seed") || Object.hasOwn(overrides, "path")) {
    throw new Error(
      "seed and path must use the dedicated property replay coordinate",
    );
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
  return scalePropertyRuns({
    ...propertyParameters,
    ...overrides,
    ...explicitReplay,
  }, environmentRunsMultiplier);
}

/**
 * Run a synchronous property with repository defaults and native replay output.
 * Replay coordinates use their own argument so a generic override cannot split the pair.
 */
export function assertProperty<Values>(
  property: IProperty<Values>,
  overrides: PropertyOverrides<Values> = {},
  replay?: PropertyReplayCoordinate,
): void {
  fc.assert(property, assertionParameters(overrides, replay));
}

/** Run an asynchronous property with the same bounded defaults and replay boundary. */
export async function assertAsyncProperty<Values>(
  property: IAsyncProperty<Values>,
  overrides: PropertyOverrides<Values> = {},
  replay?: PropertyReplayCoordinate,
): Promise<void> {
  await fc.assert(property, assertionParameters(overrides, replay));
}
