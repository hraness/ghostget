/**
 * `ghostget.contract-catalog.v1`: the compact, typed projection of the
 * installed capability catalog. The shape table below is the single source for
 * `parseContractCatalog` and `contractSchema("catalog")`.
 */
import {
  CONTRACT_CATALOG_V1,
  contractPatterns,
  contractStates,
  contractTransports,
  idempotencyKinds,
  invokeStatuses,
  operationAuthorities,
  operationRisks,
  readFailureDispositions,
  type ContractIdempotencyKind,
  type ContractOperationRisk,
  type ContractState,
  type ContractTransport,
  type InvokeStatus,
  type OperationAuthority,
  type ReadFailureCategory,
  type RetryDisposition,
} from "./contracts-vocabulary";
import {
  ContractParseError,
  parseShape,
  type Shape,
  type ShapeDefinitions,
} from "./contracts-shape";

export type ContractScalarInputField = {
  readonly type: "string" | "boolean" | "number";
  readonly description: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly enum?: readonly (string | number | boolean)[];
  readonly format?: "url" | "path-segment";
  readonly urlPathPrefixes?: readonly string[];
};

export type ContractFileInputField = {
  readonly type: "file";
  readonly description: string;
  readonly maxBytes: number;
  readonly mediaTypes?: readonly string[];
};

export type ContractArrayInputField = {
  readonly type: "array";
  readonly description: string;
  readonly items: ContractScalarInputField | ContractFileInputField;
  readonly minItems: number;
  readonly maxItems: number;
};

export type ContractInputField =
  | ContractScalarInputField
  | ContractFileInputField
  | ContractArrayInputField;

export type ContractInputSchema = {
  readonly properties: Readonly<Record<string, ContractInputField>>;
  readonly required: readonly string[];
};

export type ContractCatalogOperation = {
  readonly id: string;
  readonly transport: ContractTransport;
  readonly authority: OperationAuthority;
  readonly risk: ContractOperationRisk;
  readonly sideEffect: string;
  readonly idempotency: ContractIdempotencyKind;
  readonly dedupeWindowMs: number;
  readonly state: ContractState;
  readonly contractVersion: number;
  readonly contractHash: string;
  readonly input: ContractInputSchema;
};

export type ContractCatalogAdapter = {
  readonly id: string;
  readonly version: string;
  readonly surfaceId: string | null;
  readonly manifestHash: string;
  readonly origins: readonly string[];
  readonly operations: readonly ContractCatalogOperation[];
};

export type ContractCatalogInvalidAdapter = {
  readonly id: string;
  readonly invalid: true;
  readonly issues: readonly string[];
};

export type ContractCatalogVocabulary = {
  readonly risks: readonly ContractOperationRisk[];
  readonly states: readonly ContractState[];
  readonly transports: readonly ContractTransport[];
  readonly authorities: readonly OperationAuthority[];
  readonly readFailure: Readonly<Record<ReadFailureCategory, RetryDisposition>>;
  readonly invokeStatuses: readonly InvokeStatus[];
};

export type ContractCatalogV1 = {
  readonly ok: boolean;
  readonly contract: typeof CONTRACT_CATALOG_V1;
  readonly ghostget: { readonly version: string };
  readonly generatedAt: string;
  readonly vocabulary: ContractCatalogVocabulary;
  readonly adapters: readonly (ContractCatalogAdapter | ContractCatalogInvalidAdapter)[];
};

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_ISSUE_LENGTH = 2_000;
const MAX_SIDE_EFFECT_LENGTH = 500;
/** Manifests bound dedupe windows to 30 days. */
const MAX_DEDUPE_WINDOW_MS = 30 * 24 * 60 * 60_000;
const MAX_CATALOG_ADAPTERS = 512;
const MAX_ADAPTER_OPERATIONS = 512;
const MAX_ADAPTER_ORIGINS = 64;
const MAX_INPUT_FIELDS = 100;
const MAX_INPUT_ARRAY_ITEMS = 100;
const MAX_INPUT_LENGTH_BOUND = 1_000_000;
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const MAX_CONTRACT_VERSION = 1_000_000;

const description: Shape = {
  kind: "string",
  minLength: 1,
  maxLength: MAX_DESCRIPTION_LENGTH,
  description: "Reviewed manifest description of the input field.",
};

const scalarInputField: Shape = {
  kind: "object",
  properties: {
    type: { kind: "enum", values: ["string", "boolean", "number"] },
    description,
    minLength: { kind: "integer", minimum: 0, maximum: MAX_INPUT_LENGTH_BOUND },
    maxLength: { kind: "integer", minimum: 1, maximum: MAX_INPUT_LENGTH_BOUND },
    minimum: { kind: "number" },
    maximum: { kind: "number" },
    enum: {
      kind: "array",
      items: {
        kind: "union",
        variants: [{ kind: "string", maxLength: 4_096 }, { kind: "number" }, { kind: "boolean" }],
      },
      minItems: 1,
      maxItems: 256,
    },
    format: { kind: "enum", values: ["url", "path-segment"] },
    urlPathPrefixes: {
      kind: "array",
      items: { kind: "string", minLength: 1, maxLength: 2_048 },
      minItems: 1,
      maxItems: 20,
    },
  },
  optional: ["minLength", "maxLength", "minimum", "maximum", "enum", "format", "urlPathPrefixes"],
};

const fileInputField: Shape = {
  kind: "object",
  properties: {
    type: { kind: "literal", value: "file" },
    description,
    maxBytes: { kind: "integer", minimum: 1, maximum: MAX_FILE_BYTES },
    mediaTypes: {
      kind: "array",
      items: { kind: "string", minLength: 3, maxLength: 255 },
      minItems: 1,
      maxItems: 32,
    },
  },
  optional: ["mediaTypes"],
};

const arrayInputField: Shape = {
  kind: "object",
  properties: {
    type: { kind: "literal", value: "array" },
    description,
    items: { kind: "union", variants: [scalarInputField, fileInputField] },
    minItems: { kind: "integer", minimum: 0, maximum: MAX_INPUT_ARRAY_ITEMS },
    maxItems: { kind: "integer", minimum: 1, maximum: MAX_INPUT_ARRAY_ITEMS },
  },
};

/** Definitions reused by the catalog and check documents. */
export const contractInputDefinitions: ShapeDefinitions = Object.freeze({
  inputField: {
    kind: "union",
    variants: [scalarInputField, fileInputField, arrayInputField],
    description: "One reviewed operation input field, exactly as the installed manifest declares it.",
  },
  inputSchema: {
    kind: "object",
    properties: {
      properties: {
        kind: "record",
        values: { kind: "ref", name: "inputField" },
        keyPattern: contractPatterns.inputFieldName,
        maxProperties: MAX_INPUT_FIELDS,
      },
      required: {
        kind: "array",
        items: { kind: "string", minLength: 1, maxLength: 64, pattern: contractPatterns.inputFieldName },
        maxItems: MAX_INPUT_FIELDS,
        uniqueItems: true,
      },
    },
    description: "Operation input schema; `required` names a subset of `properties`.",
  },
});

export const catalogVocabularyValue: ContractCatalogVocabulary = Object.freeze({
  risks: operationRisks,
  states: contractStates,
  transports: contractTransports,
  authorities: operationAuthorities,
  readFailure: readFailureDispositions,
  invokeStatuses,
});

const operationShape: Shape = {
  kind: "object",
  properties: {
    id: { kind: "string", minLength: 3, maxLength: 163, pattern: contractPatterns.operationId },
    transport: { kind: "enum", values: contractTransports },
    authority: {
      kind: "enum",
      values: operationAuthorities,
      description: "`public` when Ghostget runs the operation without an auth locator; otherwise `auth`.",
    },
    risk: { kind: "enum", values: operationRisks },
    sideEffect: { kind: "string", minLength: 1, maxLength: MAX_SIDE_EFFECT_LENGTH },
    idempotency: { kind: "enum", values: idempotencyKinds },
    dedupeWindowMs: { kind: "integer", minimum: 0, maximum: MAX_DEDUPE_WINDOW_MS },
    state: { kind: "enum", values: contractStates },
    contractVersion: { kind: "integer", minimum: 1, maximum: MAX_CONTRACT_VERSION },
    contractHash: {
      kind: "string",
      minLength: 64,
      maxLength: 64,
      pattern: contractPatterns.sha256,
      description: "Durable contract hash for the operation's transport.",
    },
    input: { kind: "ref", name: "inputSchema" },
  },
};

const adapterShape: Shape = {
  kind: "object",
  properties: {
    id: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
    version: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
    surfaceId: {
      kind: "union",
      variants: [
        { kind: "string", minLength: 1, maxLength: 63, pattern: contractPatterns.surfaceId },
        { kind: "null" },
      ],
    },
    manifestHash: { kind: "string", minLength: 64, maxLength: 64, pattern: contractPatterns.sha256 },
    origins: {
      kind: "array",
      items: { kind: "string", minLength: 9, maxLength: 2_048, pattern: contractPatterns.httpsOrigin },
      maxItems: MAX_ADAPTER_ORIGINS,
      uniqueItems: true,
    },
    operations: { kind: "array", items: operationShape, maxItems: MAX_ADAPTER_OPERATIONS },
  },
};

const invalidAdapterShape: Shape = {
  kind: "object",
  properties: {
    id: { kind: "string", minLength: 1, maxLength: 48, pattern: contractPatterns.adapterId },
    invalid: { kind: "literal", value: true },
    issues: {
      kind: "array",
      items: { kind: "string", minLength: 1, maxLength: MAX_ISSUE_LENGTH },
      minItems: 1,
      maxItems: 64,
    },
  },
  description: "An installed manifest that no longer parses; it exposes no operations.",
};

export const catalogShape: Shape = {
  kind: "object",
  properties: {
    ok: {
      kind: "boolean",
      description: "False only when a requested adapter filter matched no installed adapter.",
    },
    contract: { kind: "literal", value: CONTRACT_CATALOG_V1 },
    ghostget: {
      kind: "object",
      properties: {
        version: { kind: "string", minLength: 5, maxLength: 64, pattern: contractPatterns.semanticVersion },
      },
    },
    generatedAt: { kind: "string", minLength: 24, maxLength: 24, format: "date-time" },
    vocabulary: {
      kind: "object",
      properties: {
        risks: { kind: "literal", value: [...operationRisks] },
        states: { kind: "literal", value: [...contractStates] },
        transports: { kind: "literal", value: [...contractTransports] },
        authorities: { kind: "literal", value: [...operationAuthorities] },
        readFailure: { kind: "literal", value: { ...readFailureDispositions } },
        invokeStatuses: { kind: "literal", value: [...invokeStatuses] },
      },
      description: "Closed vocabularies of this contract version; a consumer pins them verbatim.",
    },
    adapters: {
      kind: "array",
      items: { kind: "union", variants: [adapterShape, invalidAdapterShape] },
      maxItems: MAX_CATALOG_ADAPTERS,
    },
  },
};

export const catalogDefinitions: ShapeDefinitions = contractInputDefinitions;

export function isInvalidCatalogAdapter(
  adapter: ContractCatalogAdapter | ContractCatalogInvalidAdapter,
): adapter is ContractCatalogInvalidAdapter {
  return "invalid" in adapter;
}

/**
 * Semantic rules beyond the shape: adapter IDs are unique and sorted, operation
 * IDs are unique within an adapter, `required` names declared fields, and an
 * `ok: false` catalog lists no adapters.
 */
export function parseContractCatalog(value: unknown): ContractCatalogV1 {
  const catalog = parseShape<ContractCatalogV1>(catalogShape, value, "catalog", catalogDefinitions);
  const ids = catalog.adapters.map((adapter) => adapter.id);
  for (const [index, id] of ids.entries()) {
    const previous = ids[index - 1];
    if (previous !== undefined && previous.localeCompare(id) >= 0) {
      throw new ContractParseError("catalog.adapters", "must list unique adapter IDs in ascending order");
    }
  }
  if (!catalog.ok && catalog.adapters.length > 0) {
    throw new ContractParseError("catalog.ok", "must be true when adapters are listed");
  }
  for (const [adapterIndex, adapter] of catalog.adapters.entries()) {
    if (isInvalidCatalogAdapter(adapter)) continue;
    const seen = new Set<string>();
    for (const [operationIndex, operation] of adapter.operations.entries()) {
      const path = `catalog.adapters[${String(adapterIndex)}].operations[${String(operationIndex)}]`;
      if (seen.has(operation.id)) {
        throw new ContractParseError(path, "repeats an operation ID");
      }
      seen.add(operation.id);
      assertInputSchemaConsistent(operation.input, `${path}.input`);
    }
  }
  return catalog;
}

export function assertInputSchemaConsistent(schema: ContractInputSchema, path: string): void {
  for (const name of schema.required) {
    if (!Object.hasOwn(schema.properties, name)) {
      throw new ContractParseError(`${path}.required`, `names an undeclared field ${name}`);
    }
  }
}
