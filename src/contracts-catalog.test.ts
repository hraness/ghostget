import { describe, expect, test } from "bun:test";

import {
  catalogVocabularyValue,
  parseContractCatalog,
} from "./contracts-catalog";
import { contractSchema } from "./contracts-schema";
import { schemaViolations } from "./contracts-schema.test-support";
import { ContractParseError } from "./contracts-shape";
import {
  catalogArbitrary,
  exampleCatalog,
  mutable,
  objectPaths,
  pathLabel,
  withExtraKey,
} from "./contracts.test-support";
import { readFailureProjection } from "./web-session-execution";
import { assertProperty, fc } from "./test-support";

const schema = contractSchema("catalog");

describe("ghostget.contract-catalog.v1", () => {
  test("parses the example catalog, freezes it, and validates it against the published schema", () => {
    const catalog = parseContractCatalog(exampleCatalog());
    expect(catalog).toEqual(exampleCatalog());
    expect(Object.isFrozen(catalog.adapters)).toBeTrue();
    expect(schemaViolations(schema, exampleCatalog())).toEqual([]);
    expect(catalog.vocabulary.readFailure).toEqual(catalogVocabularyValue.readFailure);
  });

  test("pins the vocabulary verbatim so a widened runtime union cannot pass as v1", () => {
    const widened = mutable(exampleCatalog()) as { vocabulary: { risks: string[]; invokeStatuses: string[] } };
    widened.vocabulary.risks.push("R5");
    expect(() => parseContractCatalog(widened)).toThrow("catalog.vocabulary.risks must equal");
    const drifted = mutable(exampleCatalog()) as { vocabulary: { readFailure: Record<string, string> } };
    drifted.vocabulary.readFailure["provider-throttled"] = "do-not-retry";
    expect(() => parseContractCatalog(drifted)).toThrow("catalog.vocabulary.readFailure must equal");
    for (const category of Object.keys(catalogVocabularyValue.readFailure) as (keyof typeof catalogVocabularyValue.readFailure)[]) {
      expect(readFailureProjection(category).retryDisposition).toBe(catalogVocabularyValue.readFailure[category]);
    }
  });

  test("rejects unsorted or duplicate adapters, repeated operations, undeclared required fields, and a false ok with adapters", () => {
    const unsorted = mutable(exampleCatalog()) as { adapters: { id: string }[] };
    unsorted.adapters.reverse();
    expect(() => parseContractCatalog(unsorted)).toThrow("catalog.adapters must list unique adapter IDs in ascending order");

    const duplicate = mutable(exampleCatalog()) as { adapters: unknown[] };
    duplicate.adapters.push(structuredClone(duplicate.adapters[4]));
    expect(() => parseContractCatalog(duplicate)).toThrow("ascending order");

    const repeated = mutable(exampleCatalog()) as { adapters: { operations: unknown[] }[] };
    repeated.adapters[0]!.operations.push(structuredClone(repeated.adapters[0]!.operations[0]));
    expect(() => parseContractCatalog(repeated)).toThrow("catalog.adapters[0].operations[4] repeats an operation ID");

    const undeclared = mutable(exampleCatalog()) as { adapters: { operations: { input: { required: string[] } }[] }[] };
    undeclared.adapters[0]!.operations[0]!.input.required.push("missing");
    expect(() => parseContractCatalog(undeclared)).toThrow("catalog.adapters[0].operations[0].input.required names an undeclared field missing");

    const notOk = mutable(exampleCatalog()) as { ok: boolean };
    notOk.ok = false;
    expect(() => parseContractCatalog(notOk)).toThrow("catalog.ok must be true when adapters are listed");
    expect(parseContractCatalog({ ...exampleCatalog(), ok: false, adapters: [] }).ok).toBeFalse();
  });

  test("rejects local paths, subjects, and free-form fields the contract does not carry", () => {
    const withPath = mutable(exampleCatalog()) as { adapters: Record<string, unknown>[] };
    withPath.adapters[0]!.manifestPath = "/Users/someone/state/adapters/acme-web.json";
    expect(() => parseContractCatalog(withPath)).toThrow("catalog.adapters[0] has an unsupported key manifestPath");
    const withSubject = mutable(exampleCatalog()) as { adapters: { operations: Record<string, unknown>[] }[] };
    withSubject.adapters[0]!.operations[0]!.description = "prose";
    expect(() => parseContractCatalog(withSubject)).toThrow("catalog.adapters[0].operations[0] has an unsupported key description");
  });

  test("property: generated catalogs round-trip through JSON, stay equal, and validate against the schema", () => {
    assertProperty(fc.property(catalogArbitrary, (catalog) => {
      const parsed = parseContractCatalog(catalog);
      expect(parsed).toEqual(catalog);
      expect(parseContractCatalog(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
      expect(schemaViolations(schema, parsed)).toEqual([]);
    }));
  });

  test("property: an unsupported key at any object path is rejected by the parser and violates the schema", () => {
    assertProperty(fc.property(catalogArbitrary, fc.nat(), (catalog, seed) => {
      // `vocabulary` is a literal and `input.properties` is a keyed record; both
      // reject a stray key through a different rule than the exact-key rule.
      const paths = objectPaths(catalog).filter((path) => path[0] !== "vocabulary" && path.at(-1) !== "properties");
      const path = paths[seed % paths.length];
      if (path === undefined) throw new Error("no object path");
      const mutated = withExtraKey(catalog, path);
      expect(() => parseContractCatalog(mutated)).toThrow(ContractParseError);
      expect(() => parseContractCatalog(mutated)).toThrow("unsupported key __extra");
      expect(schemaViolations(schema, mutated).length).toBeGreaterThan(0);
      void pathLabel(path);
    }));
  });

  test("property: every parser rejection of a generated mutation is a schema violation or a documented semantic rule", () => {
    const semanticRules = [
      "ascending order",
      "repeats an operation ID",
      "names an undeclared field",
      "must be true when adapters are listed",
      "invalid JSON key",
    ];
    assertProperty(fc.property(catalogArbitrary, fc.jsonValue({ maxDepth: 2 }), fc.nat(), (catalog, junk, seed) => {
      const paths = objectPaths(catalog);
      const path = paths[seed % paths.length];
      if (path === undefined) throw new Error("no object path");
      const clone = mutable(catalog) as unknown;
      let target: Record<string, unknown> = clone as Record<string, unknown>;
      for (const segment of path) target = target[segment] as Record<string, unknown>;
      const keys = Object.keys(target);
      const key = keys[seed % Math.max(1, keys.length)];
      if (key === undefined) return;
      target[key] = junk;
      let message: string | null = null;
      try {
        parseContractCatalog(clone);
      } catch (error) {
        if (!(error instanceof ContractParseError)) throw error;
        message = error.message;
      }
      const violations = schemaViolations(schema, clone);
      if (message === null) {
        expect(violations).toEqual([]);
      } else {
        expect(violations.length > 0 || semanticRules.some((rule) => message?.includes(rule))).toBeTrue();
      }
    }));
  });
});
