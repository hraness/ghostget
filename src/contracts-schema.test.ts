import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checkCollectionPlan } from "./contracts-check";
import { contractSchema, isContractSchemaName } from "./contracts-schema";
import { assertSchemaResolves, schemaViolations } from "./contracts-schema.test-support";
import { contractSchemaNames } from "./contracts-vocabulary";
import { exampleCatalog, examplePlan } from "./contracts.test-support";

const hranessPlan = JSON.parse(readFileSync(join(
  import.meta.dir,
  "..",
  "skills",
  "ghostget",
  "references",
  "hraness-social-profile-stats.json",
), "utf8")) as unknown;

describe("contractSchema", () => {
  test("emits draft 2020-12 schemas whose references all resolve and whose titles name the documents", () => {
    const titles: Record<string, string> = {};
    for (const name of contractSchemaNames) {
      const schema = contractSchema(name);
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(typeof schema.title).toBe("string");
      expect(typeof schema.description).toBe("string");
      expect(Object.isFrozen(schema)).toBeTrue();
      assertSchemaResolves(schema);
      titles[name] = schema.title as string;
      expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
      expect(contractSchema(name)).toEqual(schema);
    }
    expect(titles).toEqual({
      catalog: "ghostget.contract-catalog.v1",
      check: "ghostget.contract-check.v1",
      plan: "ghostget.collection-plan.v1",
      "invoke-read": "ghostget.invoke-read.v1",
    });
  });

  test("names exactly the four documents", () => {
    expect([...contractSchemaNames]).toEqual(["catalog", "check", "plan", "invoke-read"]);
    expect(isContractSchemaName("plan")).toBeTrue();
    expect(isContractSchemaName("receipt")).toBeFalse();
    expect(() => contractSchema("receipt" as never)).toThrow("unknown contract schema");
  });

  test("validates every example document and the packaged Hraness plan", () => {
    expect(schemaViolations(contractSchema("catalog"), exampleCatalog())).toEqual([]);
    expect(schemaViolations(contractSchema("plan"), examplePlan())).toEqual([]);
    expect(schemaViolations(contractSchema("plan"), hranessPlan)).toEqual([]);
    expect(schemaViolations(contractSchema("check"), checkCollectionPlan(examplePlan(), exampleCatalog()))).toEqual([]);
  });

  test("keeps every object closed and every string, array, and integer bounded", () => {
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => walk(item, `${path}[${String(index)}]`));
        return;
      }
      if (typeof node !== "object" || node === null) return;
      const record = node as Record<string, unknown>;
      if (record.type === "object" && record.properties !== undefined) {
        expect(record.additionalProperties).toBe(false);
      }
      if (record.type === "object" && record.properties === undefined && !path.endsWith("propertyNames")) {
        expect(typeof record.maxProperties).toBe("number");
      }
      if (record.type === "string") expect(typeof record.maxLength).toBe("number");
      if (record.type === "array") expect(typeof record.maxItems).toBe("number");
      if (record.type === "integer") {
        expect(typeof record.minimum).toBe("number");
        expect(typeof record.maximum).toBe("number");
      }
      for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`);
    };
    for (const name of contractSchemaNames) walk(contractSchema(name), name);
  });
});
