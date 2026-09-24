import { describe, expect, test } from "bun:test";

import { join } from "node:path";

import {
  assertAsyncProperty,
  assertProperty,
  fc,
  parsePropertyCorpus,
  propertyCorpus,
  propertyParameters,
  propertyReplayParameters,
  propertyRunMultiplier,
  soakParameters,
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

const corpusProperty = "contracts-invoke-read/output-round-trip";

/**
 * A seeded defect: copying members by assignment turns an own `__proto__`
 * member into a prototype write and drops the key. The recorded CI coordinate
 * in the seed corpus generates exactly that input.
 */
function assignmentCopyRoundTrips(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) copy[key] = (value as Record<string, unknown>)[key];
  return JSON.stringify(copy) === JSON.stringify(value);
}

function corpusFixture(entries: unknown, extra: Record<string, unknown> = {}): unknown {
  return {
    schema: "ghostget-property-seeds-v1",
    properties: { "a/b": { file: "src/a.test.ts", entries, ...extra } },
  };
}

describe("property seed corpus", () => {
  test("parses the checked-in corpus", () => {
    const entry = propertyCorpus().get(corpusProperty);
    expect(entry?.file).toBe("src/contracts-invoke-read.test.ts");
    expect(entry?.entries).toContainEqual(expect.objectContaining({
      kind: "counterexample",
      seed: 455_347_073,
      path: "3:1:86:86",
    }));
  });

  test("replays a recorded counterexample before the random run and names it on failure", () => {
    const defect = fc.property(fc.jsonValue({ maxDepth: 6 }), assignmentCopyRoundTrips);
    expect(() => assertProperty(defect, { numRuns: 1 }, corpusProperty)).toThrow(
      `seed corpus ${corpusProperty} counterexample seed 455347073 path 3:1:86:86 failed again`,
    );
  });

  test("replays the corpus for asynchronous properties", async () => {
    const defect = fc.asyncProperty(fc.jsonValue({ maxDepth: 6 }), async (value) => assignmentCopyRoundTrips(value));
    await expect(assertAsyncProperty(defect, { numRuns: 1 }, corpusProperty)).rejects.toThrow(
      `seed corpus ${corpusProperty} counterexample seed 455347073`,
    );
  });

  test("runs every corpus coordinate and then the ordinary random run", () => {
    let runs = 0;
    assertProperty(fc.property(fc.jsonValue({ maxDepth: 6 }), () => {
      runs += 1;
    }), { numRuns: 5 }, corpusProperty);
    // A shrink path replays its counterexample, then continues along its shrink tree.
    expect(runs).toBeGreaterThan(5);
  });

  test("rejects a property name the corpus does not hold", () => {
    // A computed name keeps this deliberate miss out of the repository corpus policy scan.
    const unknownName = ["no", "such-property"].join("/");
    expect(() => assertProperty(fc.property(fc.constant(null), () => true), {}, unknownName)).toThrow(
      "property no/such-property has no entry in verification/seeds/corpus.json",
    );
  });

  test("rejects malformed, ambiguous, or unbounded corpus documents", () => {
    const counterexample = { kind: "counterexample", seed: 1, origin: "run 1", regression: "pins it" } as const;
    expect(parsePropertyCorpus(corpusFixture([counterexample])).get("a/b")?.entries).toEqual([counterexample]);
    const workload = { kind: "workload", seed: -5, path: "0:1", origin: "timing seed" } as const;
    expect(parsePropertyCorpus(corpusFixture([workload])).get("a/b")?.entries).toEqual([workload]);
    for (const [document, message] of [
      [{ schema: "other", properties: {} }, "schema"],
      [{ schema: "ghostget-property-seeds-v1", properties: {}, extra: 1 }, "unsupported key extra"],
      [corpusFixture([]), "1 to 32"],
      [corpusFixture(Array.from({ length: 33 }, (_, seed) => ({ ...counterexample, seed }))), "1 to 32"],
      [corpusFixture([counterexample, counterexample]), "repeats a coordinate"],
      [corpusFixture([{ ...counterexample, regression: undefined }]), "regression"],
      [corpusFixture([{ ...workload, regression: "pins it" }]), "names no regression"],
      [corpusFixture([{ ...counterexample, kind: "shrink" }]), "kind"],
      [corpusFixture([{ ...counterexample, seed: 2 ** 31 }]), "canonical 32-bit integer"],
      [corpusFixture([{ ...counterexample, seed: "1" }]), "canonical 32-bit integer"],
      [corpusFixture([{ ...counterexample, path: "01" }]), "bounded fast-check path"],
      [corpusFixture([{ ...counterexample, origin: " padded" }]), "trimmed line"],
      [corpusFixture([{ ...counterexample, origin: "two\nlines" }]), "trimmed line"],
      [corpusFixture([{ ...counterexample, extra: true }]), "unsupported key extra"],
      [corpusFixture([counterexample], { note: "x" }), "unsupported key note"],
      [{ schema: "ghostget-property-seeds-v1", properties: { "A/b": { file: "src/a.test.ts", entries: [counterexample] } } }, "invalid name"],
      [{ schema: "ghostget-property-seeds-v1", properties: { "a/b": { file: "../a.test.ts", entries: [counterexample] } } }, "repository test file"],
      [{ schema: "ghostget-property-seeds-v1", properties: { "a/b": { file: "src/a.ts", entries: [counterexample] } } }, "repository test file"],
      [{
        schema: "ghostget-property-seeds-v1",
        properties: {
          "b/a": { file: "src/a.test.ts", entries: [counterexample] },
          "a/b": { file: "src/a.test.ts", entries: [counterexample] },
        },
      }, "sorted"],
      [JSON.parse('{"schema":"ghostget-property-seeds-v1","properties":{"__proto__":{}}}'), "invalid name"],
    ] as const) {
      expect(() => parsePropertyCorpus(document)).toThrow(message);
    }
  });
});

describe("property soak mode", () => {
  test("parses one bounded canonical run multiplier", () => {
    expect(propertyRunMultiplier({})).toBe(1);
    expect(propertyRunMultiplier({ GHOSTGET_PROPERTY_RUNS: "20" })).toBe(20);
    expect(propertyRunMultiplier({ GHOSTGET_PROPERTY_RUNS: "100" })).toBe(100);
    for (const value of ["0", "01", "-1", "1.5", "101", "1000", "", " 2", "x", null, 2]) {
      expect(() => propertyRunMultiplier({ GHOSTGET_PROPERTY_RUNS: value })).toThrow(
        "GHOSTGET_PROPERTY_RUNS must be a canonical integer from 1 to 100",
      );
    }
  });

  test("scales run counts and interruption budgets together", () => {
    expect(soakParameters(propertyParameters, 1)).toBe(propertyParameters);
    expect(soakParameters({ ...propertyParameters, numRuns: 32 }, 20)).toMatchObject({
      numRuns: 640,
      interruptAfterTimeLimit: 200_000,
      markInterruptAsFailure: true,
    });
    expect(soakParameters({ numRuns: 5 }, 3)).toEqual({ numRuns: 15 });
    expect(soakParameters({}, 2)).toEqual({ numRuns: 400 });
  });

  test("the environment multiplier reaches every helper run, and an environment replay skips the corpus", () => {
    // The script text is constant; the module path and corpus property name
    // arrive through the child's environment rather than code construction.
    const script = [
      "const { assertProperty, fc } = await import(process.env.GHOSTGET_TEST_SUPPORT_MODULE);",
      "let runs = 0;",
      "assertProperty(fc.property(fc.integer(), () => { runs += 1; }), { numRuns: 7 });",
      "let replayed = 0;",
      "assertProperty(fc.property(fc.jsonValue({ maxDepth: 6 }), () => { replayed += 1; }), { numRuns: 1 }, process.env.GHOSTGET_TEST_CORPUS_PROPERTY);",
      "console.log(JSON.stringify({ runs, replayed }));",
    ].join("\n");
    const run = (environment: Record<string, string>) => {
      const child = Bun.spawnSync([process.execPath, "-e", script], {
        env: {
          PATH: process.env.PATH ?? "",
          GHOSTGET_TEST_SUPPORT_MODULE: join(import.meta.dir, "test-support.ts"),
          GHOSTGET_TEST_CORPUS_PROPERTY: corpusProperty,
          ...environment,
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(child.stderr.toString()).toBe("");
      expect(child.exitCode).toBe(0);
      return JSON.parse(child.stdout.toString()) as { runs: number; replayed: number };
    };
    const soak = run({ GHOSTGET_PROPERTY_RUNS: "3" });
    expect(soak.runs).toBe(21);
    expect(soak.replayed).toBeGreaterThan(3);
    // An exact environment replay runs only that coordinate: one case, no corpus.
    expect(run({ GHOSTGET_PROPERTY_SEED: "5", GHOSTGET_PROPERTY_PATH: "0" }).replayed).toBe(1);
  });
});
