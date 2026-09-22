/**
 * JSON Schema draft 2020-12 for the four contract documents, generated from
 * the same shape tables the parsers use.
 */
import { catalogDefinitions, catalogShape } from "./contracts-catalog";
import { checkShape } from "./contracts-check";
import { invokeReadDefinitions, invokeReadShape } from "./contracts-invoke-read";
import { planShape } from "./contracts-plan";
import { shapeJsonSchema, type JsonSchema } from "./contracts-shape";
import {
  CONTRACT_CATALOG_V1,
  CONTRACT_CHECK_V1,
  contractSchemaNames,
  type ContractSchemaName,
} from "./contracts-vocabulary";

export type { JsonSchema };

const schemas: Readonly<Record<ContractSchemaName, () => JsonSchema>> = Object.freeze({
  catalog: () => shapeJsonSchema(catalogShape, {
    title: CONTRACT_CATALOG_V1,
    description: "Compact projection of the installed Ghostget capability catalog, printed by `ghostget contracts catalog --json`.",
    definitions: catalogDefinitions,
  }),
  check: () => shapeJsonSchema(checkShape, {
    title: CONTRACT_CHECK_V1,
    description: "Verdict of one collection plan against one contract catalog, printed by `ghostget contracts check --plan <file> --json`.",
  }),
  plan: () => shapeJsonSchema(planShape, {
    title: "ghostget.collection-plan.v1",
    description: "Read-only collection plan accepted by `ghostget contracts check --plan <file>`.",
  }),
  "invoke-read": () => shapeJsonSchema(invokeReadShape, {
    title: "ghostget.invoke-read.v1",
    description: "R1 result envelope printed by `ghostget invoke <adapter> <operation> --json`.",
    definitions: invokeReadDefinitions,
  }),
});

export function isContractSchemaName(value: unknown): value is ContractSchemaName {
  return typeof value === "string"
    && (contractSchemaNames as readonly string[]).includes(value);
}

/** Return the JSON Schema for one named contract document. */
export function contractSchema(name: ContractSchemaName): JsonSchema {
  const build = schemas[name];
  if (build === undefined) throw new Error("unknown contract schema");
  return build();
}
