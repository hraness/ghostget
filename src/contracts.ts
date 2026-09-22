/**
 * `@hraness/ghostget/contracts`: pure, side-effect-free parsers and schemas
 * for Ghostget's machine-checkable contract documents.
 *
 * Importing this module never starts the CLI, inspects local state, loads a
 * provider runtime, or touches the network. The CLI commands under
 * `ghostget contracts` combine the host-side catalog projection with the same
 * `checkCollectionPlan` exported here.
 */
export type {
  ContractCatalogAdapter,
  ContractCatalogInvalidAdapter,
  ContractCatalogOperation,
  ContractCatalogV1,
  ContractCatalogVocabulary,
  ContractInputField,
  ContractInputSchema,
} from "./contracts-catalog";
export type {
  CheckCollectionPlanOptions,
  ContractCheckBinding,
  ContractCheckGap,
  ContractCheckRead,
  ContractCheckV1,
} from "./contracts-check";
export type {
  InvokeReadCacheOutcome,
  InvokeReadFailure,
  InvokeReadReceipt,
  InvokeReadResultV1,
} from "./contracts-invoke-read";
export type {
  CollectionAccount,
  CollectionExpectedGap,
  CollectionPlanV1,
  CollectionRead,
  CollectionReadAuthority,
} from "./contracts-plan";
export type { JsonSchema } from "./contracts-schema";
export type {
  ContractGapReason,
  ContractOperationRisk,
  ContractSchemaName,
  ContractState,
  ContractTransport,
  InvokeStatus,
  OperationAuthority,
  ReadFailureCategory,
  RetryDisposition,
} from "./contracts-vocabulary";

import { parseContractCatalog as parseContractCatalogImplementation } from "./contracts-catalog";
import {
  checkCollectionPlan as checkCollectionPlanImplementation,
  parseContractCheck as parseContractCheckImplementation,
} from "./contracts-check";
import { parseInvokeReadResult as parseInvokeReadResultImplementation } from "./contracts-invoke-read";
import { parseCollectionPlan as parseCollectionPlanImplementation } from "./contracts-plan";
import { contractSchema as contractSchemaImplementation } from "./contracts-schema";
import { ContractParseError as ContractParseErrorImplementation } from "./contracts-shape";
import { readFailureDispositions as readFailureDispositionsImplementation } from "./contracts-vocabulary";

// Local bindings, as in `src/index.ts`, so the bundled entrypoint keeps its
// named exports after code splitting instead of a bare chunk import.
export const checkCollectionPlan = checkCollectionPlanImplementation;
export const ContractParseError = ContractParseErrorImplementation;
export type ContractParseError = ContractParseErrorImplementation;
export const contractSchema = contractSchemaImplementation;
export const parseCollectionPlan = parseCollectionPlanImplementation;
export const parseContractCatalog = parseContractCatalogImplementation;
export const parseContractCheck = parseContractCheckImplementation;
export const parseInvokeReadResult = parseInvokeReadResultImplementation;
export const readFailureDispositions = readFailureDispositionsImplementation;
