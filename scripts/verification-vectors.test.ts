/**
 * Golden-vector tests: the shipped TypeScript must reproduce, byte for byte,
 * every vector that the independent Python generator
 * `verification/vectors/generate.py` commits under `verification/vectors/`.
 *
 * - `jcs.json`: RFC 8785 canonical forms, their SHA-256, their script-literal
 *   escaping, ECMAScript number text for IEEE 754 bit patterns, and inputs
 *   outside I-JSON.
 * - `hashes.json`: the length-framed SHA-256 identities for media provider and
 *   authorization-context keys, native runtime closures, and retained revision
 *   content, plus UTF-8 byte ordering.
 *
 * Seeded defects must each miss at least one vector. The generator's own
 * `--check` mode, run by `scripts/verification-oracles.ts`, keeps the files
 * equal to what it generates.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { canonicalJson, canonicalJsonScriptLiteral, legacyCanonicalJson, sha256 } from "../src/canonical-json.js";
import { authContextSha256, providerIdentitySha256, sourceAssetKey } from "../src/media/metadata.js";
import { revisionContentSha256 } from "../src/media/revision.js";
import { computeRuntimeClosureSha256 } from "../src/media/runtime-closure.js";
import { compareUtf8 } from "../src/media/utf8-order.js";
import { assertProperty, fc } from "../src/test-support.js";
import { REPOSITORY_ROOT, VECTOR_GENERATOR } from "./verification-tools.js";

type Generator = Readonly<{ path: string; version: number; runtime: string; command: string }>;

type JcsVectors = Readonly<{
  schema: 1;
  generator: Generator;
  cases: readonly Readonly<{ name: string; input: string; canonical: string; sha256: string; scriptLiteral: string }>[];
  numbers: readonly Readonly<{ source: string; bits: string; text: string | null }>[];
  rejected: readonly Readonly<{ name: string; input: string }>[];
}>;

type Closure = Parameters<typeof computeRuntimeClosureSha256>;
type Artifacts = Parameters<typeof revisionContentSha256>[0];

type HashVectors = Readonly<{
  schema: 1;
  generator: Generator;
  providerIdentity: readonly Readonly<{ extractor: string; providerId: string; sha256: string; sourceAssetKey: string }>[];
  authContext: readonly Readonly<{ name: string; sha256: string }>[];
  runtimeClosure: readonly Readonly<{
    platform: Closure[0];
    executableSha256: string;
    dependencies: Closure[2];
    sha256: string;
  }>[];
  revisionContent: readonly Readonly<{ artifacts: Artifacts; sha256: string }>[];
  utf8Order: readonly Readonly<{ left: string; right: string; sign: -1 | 0 | 1 }>[];
}>;

const readVectors = async <T>(name: string): Promise<T> =>
  (await Bun.file(join(REPOSITORY_ROOT, "verification/vectors", name)).json()) as T;

const jcs = await readVectors<JcsVectors>("jcs.json");
const hashes = await readVectors<HashVectors>("hashes.json");

function doubleFromBits(bits: string): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(`0x${bits}`));
  return view.getFloat64(0);
}

/** The vectors a canonicalizer misses, by case name. */
function canonicalMisses(canonicalize: (value: unknown) => string): readonly string[] {
  return jcs.cases.filter(({ input, canonical }) => canonicalize(JSON.parse(input)) !== canonical).map(({ name }) => name);
}

describe("golden vector files", () => {
  test("each file names its generator, version, and regeneration command", () => {
    for (const file of [jcs, hashes]) {
      expect(file.schema).toBe(1);
      expect(file.generator).toEqual({
        path: VECTOR_GENERATOR.path,
        version: 1,
        runtime: `CPython ${VECTOR_GENERATOR.minimumPython} or later, standard library only`,
        command: `python3 ${VECTOR_GENERATOR.path}`,
      });
    }
    expect(jcs.cases.length).toBeGreaterThanOrEqual(200);
    expect(jcs.numbers.length).toBeGreaterThanOrEqual(300);
    expect(hashes.providerIdentity.length + hashes.authContext.length + hashes.runtimeClosure.length
      + hashes.revisionContent.length).toBeGreaterThanOrEqual(50);
    expect(hashes.utf8Order.length).toBeGreaterThanOrEqual(100);
  });
});

describe("RFC 8785 canonical JSON vectors", () => {
  test("canonicalJson, sha256, and canonicalJsonScriptLiteral reproduce every case", () => {
    for (const vector of jcs.cases) {
      const value: unknown = JSON.parse(vector.input);
      expect({ name: vector.name, canonical: canonicalJson(value) }).toEqual({ name: vector.name, canonical: vector.canonical });
      expect({ name: vector.name, sha256: sha256(vector.canonical) }).toEqual({ name: vector.name, sha256: vector.sha256 });
      expect({ name: vector.name, literal: canonicalJsonScriptLiteral(value) })
        .toEqual({ name: vector.name, literal: vector.scriptLiteral });
    }
  });

  test("canonicalJson writes every finite bit pattern's number text and refuses the rest", () => {
    for (const { bits, text } of jcs.numbers) {
      const value = doubleFromBits(bits);
      if (text === null) {
        expect(Number.isFinite(value)).toBeFalse();
        expect(() => canonicalJson(value)).toThrow("non-finite");
      } else {
        expect({ bits, text: canonicalJson(value) }).toEqual({ bits, text });
      }
    }
  });

  test("the RFC 8785 appendix B samples are present", () => {
    const appendix = jcs.numbers.filter(({ source }) => source === "rfc8785-appendix-b");
    expect(appendix.length).toBeGreaterThanOrEqual(20);
    expect(appendix).toContainEqual({ source: "rfc8785-appendix-b", bits: "44b52d02c7e14af7", text: "1.0000000000000001e+23" });
  });

  test("inputs outside I-JSON either fail to canonicalize or fall outside the value domain", () => {
    const outcomes = Object.fromEntries(jcs.rejected.map(({ name, input }) => {
      const value: unknown = JSON.parse(input);
      try {
        return [name, `canonical ${canonicalJson(value)}`];
      } catch (error) {
        return [name, `refused: ${(error as Error).message}`];
      }
    }));
    expect(outcomes).toEqual({
      // JSON.parse keeps the last duplicate member, so the duplicate never
      // reaches canonicalJson's value domain.
      "duplicate-member": "canonical {\"a\":2}",
      // canonicalJson keeps JSON.stringify's escape for a lone surrogate,
      // where RFC 8785 refuses the input. The output still parses back to the
      // same string, so the encoding stays injective.
      "lone-high-surrogate": "canonical \"\\ud800\"",
      "lone-low-surrogate": "canonical \"\\udc00x\"",
      overflow: "refused: canonical JSON cannot represent a non-finite number",
      "negative-overflow": "refused: canonical JSON cannot represent a non-finite number",
    });
  });

  test("seeded defect: member order by locale collation misses vectors", () => {
    expect(canonicalMisses(legacyCanonicalJson).length).toBeGreaterThan(0);
  });

  test("seeded defect: an exponent without its plus sign misses vectors", () => {
    expect(canonicalMisses((value) => canonicalJson(value).replaceAll("e+", "e")).length).toBeGreaterThan(0);
    const numberMisses = jcs.numbers.filter(({ bits, text }) =>
      text !== null && canonicalJson(doubleFromBits(bits)).replaceAll("e+", "e") !== text);
    expect(numberMisses.length).toBeGreaterThan(0);
  });

  test("seeded defect: script-literal escaping without U+2028 and U+2029 misses vectors", () => {
    const partial = (value: unknown): string =>
      canonicalJson(value).replace(/[<>]/gu, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
    const misses = jcs.cases.filter(({ input, scriptLiteral }) => partial(JSON.parse(input)) !== scriptLiteral);
    expect(misses.length).toBeGreaterThan(0);
  });
});

describe("length-framed identity vectors", () => {
  test("providerIdentitySha256 and sourceAssetKey reproduce every vector", () => {
    for (const vector of hashes.providerIdentity) {
      expect({ ...vector, sha256: providerIdentitySha256(vector.extractor, vector.providerId) }).toEqual(vector);
      expect({ ...vector, sourceAssetKey: sourceAssetKey(vector.extractor, vector.providerId) }).toEqual(vector);
    }
  });

  test("authContextSha256 reproduces every vector", () => {
    for (const vector of hashes.authContext) {
      expect({ ...vector, sha256: authContextSha256(vector.name) }).toEqual(vector);
    }
  });

  test("computeRuntimeClosureSha256 reproduces every vector in any dependency order", () => {
    for (const vector of hashes.runtimeClosure) {
      expect({ ...vector, sha256: computeRuntimeClosureSha256(vector.platform, vector.executableSha256, vector.dependencies) })
        .toEqual(vector);
    }
    const withDependencies = hashes.runtimeClosure.filter(({ dependencies }) => dependencies.length > 1);
    expect(withDependencies.length).toBeGreaterThan(0);
    assertProperty(fc.property(
      fc.constantFrom(...withDependencies),
      fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })),
      (vector, keys) => {
        const shuffled = vector.dependencies.map((dependency) => [keys.next().value as number, dependency] as const)
          .sort(([left], [right]) => left - right)
          .map(([, dependency]) => dependency);
        expect(computeRuntimeClosureSha256(vector.platform, vector.executableSha256, shuffled)).toBe(vector.sha256);
      },
    ));
  });

  test("revisionContentSha256 reproduces every vector in any artifact order", () => {
    for (const vector of hashes.revisionContent) {
      expect({ ...vector, sha256: revisionContentSha256(vector.artifacts) }).toEqual(vector);
      expect(revisionContentSha256([...vector.artifacts].reverse())).toBe(vector.sha256);
    }
  });

  test("seeded defect: a changed length frame misses every provider identity", () => {
    // The generator frames every component as a big-endian u64 UTF-8 length
    // and its bytes behind a domain prefix. Each defect keeps the prefix, the
    // domain, and the bytes, and changes only the length frame.
    const framed = (frame: (length: number) => Uint8Array) => (extractor: string, providerId: string): string => {
      const hash = createHash("sha256");
      hash.update("wrench-media-identity-key\0", "utf8");
      for (const component of ["source", extractor, providerId]) {
        const bytes = new TextEncoder().encode(component);
        hash.update(frame(bytes.byteLength));
        hash.update(bytes);
      }
      return hash.digest("hex");
    };
    const u64 = (littleEndian: boolean) => (length: number): Uint8Array => {
      const frame = new Uint8Array(8);
      new DataView(frame.buffer).setBigUint64(0, BigInt(length), littleEndian);
      return frame;
    };
    const u32 = (length: number): Uint8Array => {
      const frame = new Uint8Array(4);
      new DataView(frame.buffer).setUint32(0, length, false);
      return frame;
    };
    // The unchanged frame reproduces the vectors, so each defect below is the
    // only difference.
    expect(hashes.providerIdentity.every(({ extractor, providerId, sha256: expected }) =>
      framed(u64(false))(extractor, providerId) === expected)).toBeTrue();
    for (const defect of [framed(u64(true)), framed(u32), framed((length) => new TextEncoder().encode(String(length)))]) {
      expect(hashes.providerIdentity.every(({ extractor, providerId, sha256: expected }) =>
        defect(extractor, providerId) !== expected)).toBeTrue();
    }
  });
});

describe("UTF-8 byte order vectors", () => {
  test("compareUtf8 has the recorded sign for every pair", () => {
    for (const vector of hashes.utf8Order) {
      expect({ ...vector, sign: Math.sign(compareUtf8(vector.left, vector.right)) }).toEqual(vector);
    }
  });

  test("seeded defect: UTF-16 code-unit order misses vectors", () => {
    const utf16 = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
    const misses = hashes.utf8Order.filter(({ left, right, sign }) => utf16(left, right) !== sign);
    expect(misses.length).toBeGreaterThan(0);
  });
});
