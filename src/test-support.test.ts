import { describe, expect, test } from "bun:test";

import {
  assertAsyncProperty,
  assertProperty,
  fc,
  MAX_PROPERTY_RUNS_MULTIPLIER,
  propertyParameters,
  propertyReplayParameters,
  propertyRunsMultiplier,
  scalePropertyRuns,
} from "./test-support";

describe("property replay coordinates", () => {
  test("preserves the bounded fail-closed property defaults", () => {
    expect(propertyParameters).toMatchObject({
      numRuns: 200,
      interruptAfterTimeLimit: 10_000,
      markInterruptAsFailure: true,
    });
  });

  test.each(["GHOSTGET", "WRENCH"] as const)("accepts one exact %s seed with an optional shrink path", (prefix) => {
    expect(propertyReplayParameters({
      [`${prefix}_PROPERTY_SEED`]: "-17",
    })).toEqual({ seed: -17 });
    expect(propertyReplayParameters({
      [`${prefix}_PROPERTY_SEED`]: "2147483647",
      [`${prefix}_PROPERTY_PATH`]: "3:0",
    })).toEqual({ seed: 2_147_483_647, path: "3:0" });
    expect(propertyReplayParameters({
      [`${prefix}_PROPERTY_SEED`]: "1",
      [`${prefix}_PROPERTY_PATH`]: "0:1:10000",
    })).toEqual({ seed: 1, path: "0:1:10000" });
  });

  test.each(["GHOSTGET", "WRENCH"] as const)("fails closed on ambiguous, noncanonical, or unbounded %s input", (prefix) => {
    expect(() => propertyReplayParameters({
      [`${prefix}_PROPERTY_PATH`]: "1:0",
    })).toThrow("requires GHOSTGET_PROPERTY_SEED");
    for (const seed of ["-0", "01", "+1", "2147483648", "1.5", "seed"]) {
      expect(() => propertyReplayParameters({
        [`${prefix}_PROPERTY_SEED`]: seed,
      })).toThrow("canonical 32-bit integer");
    }
    for (const seed of [null, 1, true, {}]) {
      expect(() => propertyReplayParameters({
        [`${prefix}_PROPERTY_SEED`]: seed,
      })).toThrow("canonical 32-bit integer");
    }
    for (const path of [
      "",
      "1::2",
      "-1",
      "1/a",
      "01:0",
      "1:00",
      "10001",
      "9007199254740991",
      "9007199254740992",
      Array.from({ length: 11 }, () => "10000").join(":"),
      `1:${"2".repeat(513)}`,
    ]) {
      expect(() => propertyReplayParameters({
        [`${prefix}_PROPERTY_SEED`]: "1",
        [`${prefix}_PROPERTY_PATH`]: path,
      })).toThrow("bounded fast-check path");
    }
    for (const path of [null, 1, true, {}]) {
      expect(() => propertyReplayParameters({
        [`${prefix}_PROPERTY_SEED`]: "1",
        [`${prefix}_PROPERTY_PATH`]: path,
      })).toThrow("bounded fast-check path");
    }
  });

  test("uses legacy replay values only when canonical values are undefined", () => {
    expect(propertyReplayParameters({})).toEqual({});
    expect(propertyReplayParameters({
      GHOSTGET_PROPERTY_SEED: undefined,
      GHOSTGET_PROPERTY_PATH: undefined,
      WRENCH_PROPERTY_SEED: "-17",
      WRENCH_PROPERTY_PATH: "3:0",
    })).toEqual({ seed: -17, path: "3:0" });
    expect(propertyReplayParameters({
      GHOSTGET_PROPERTY_SEED: "1",
      GHOSTGET_PROPERTY_PATH: "0:1",
      WRENCH_PROPERTY_SEED: "-17",
      WRENCH_PROPERTY_PATH: "3:0",
    })).toEqual({ seed: 1, path: "0:1" });
    expect(() => propertyReplayParameters({
      GHOSTGET_PROPERTY_SEED: null,
      WRENCH_PROPERTY_SEED: "-17",
    })).toThrow("canonical 32-bit integer");
    expect(() => propertyReplayParameters({
      GHOSTGET_PROPERTY_SEED: "1",
      GHOSTGET_PROPERTY_PATH: null,
      WRENCH_PROPERTY_PATH: "3:0",
    })).toThrow("bounded fast-check path");
  });

  test("rejects partial or crossed replay coordinates in synchronous overrides", () => {
    const property = fc.property(fc.constant(null), () => true);
    for (const overrides of [
      { seed: -17 },
      { path: "3:0" },
      { seed: -17, path: "3:0" },
      { seed: undefined },
      { path: undefined },
      { seed: undefined, path: undefined },
    ]) {
      expect(() => assertProperty(property, overrides as never)).toThrow(
        "dedicated property replay coordinate",
      );
    }
  });

  test("rejects partial or crossed replay coordinates in asynchronous overrides", async () => {
    const property = fc.asyncProperty(fc.constant(null), async () => true);
    for (const overrides of [
      { seed: -17 },
      { path: "3:0" },
      { seed: -17, path: "3:0" },
      { seed: undefined },
      { path: undefined },
      { seed: undefined, path: undefined },
    ]) {
      await expect(assertAsyncProperty(property, overrides as never)).rejects.toThrow(
        "dedicated property replay coordinate",
      );
    }
  });
});

describe("property soak multiplier", () => {
  test("reads GHOSTGET_PROPERTY_RUNS as a bounded canonical integer", () => {
    expect(propertyRunsMultiplier({})).toBe(1);
    expect(propertyRunsMultiplier({ GHOSTGET_PROPERTY_RUNS: "1" })).toBe(1);
    expect(propertyRunsMultiplier({ GHOSTGET_PROPERTY_RUNS: "20" })).toBe(20);
    expect(propertyRunsMultiplier({ GHOSTGET_PROPERTY_RUNS: "100" })).toBe(MAX_PROPERTY_RUNS_MULTIPLIER);
    for (const raw of ["", "0", "01", "101", "1000", "-1", "2.5", "1e1", " 2", "2 ", "+2", 20]) {
      expect(() => propertyRunsMultiplier({ GHOSTGET_PROPERTY_RUNS: raw })).toThrow(
        "GHOSTGET_PROPERTY_RUNS must be an integer from 1 to 100",
      );
    }
  });

  test("scales the run count and interrupt limit and leaves everything else", () => {
    expect(scalePropertyRuns(propertyParameters, 1)).toBe(propertyParameters);
    expect(scalePropertyRuns({ ...propertyParameters, seed: 7, path: "1:2" }, 20)).toEqual({
      ...propertyParameters,
      numRuns: 4_000,
      interruptAfterTimeLimit: 200_000,
      seed: 7,
      path: "1:2",
    });
    expect(scalePropertyRuns({ markInterruptAsFailure: true }, 3)).toEqual({
      markInterruptAsFailure: true,
      numRuns: 300,
    });
    for (const multiplier of [0, 101, 1.5, Number.NaN]) {
      expect(() => scalePropertyRuns(propertyParameters, multiplier)).toThrow("out of range");
    }
  });

  test("property: a soak multiplies each run count exactly", () => {
    assertProperty(fc.property(
      fc.integer({ min: 1, max: 10_000 }),
      fc.integer({ min: 1, max: MAX_PROPERTY_RUNS_MULTIPLIER }),
      (numRuns, multiplier) => {
        const scaled = scalePropertyRuns({ numRuns, interruptAfterTimeLimit: 1_000 }, multiplier);
        expect(scaled.numRuns).toBe(numRuns * multiplier);
        expect(scaled.interruptAfterTimeLimit).toBe(1_000 * multiplier);
        expect(propertyRunsMultiplier({ GHOSTGET_PROPERTY_RUNS: String(multiplier) })).toBe(multiplier);
      },
    ));
  });
});
