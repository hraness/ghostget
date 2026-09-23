/**
 * Shared fixtures and fast-check arbitraries for the contract document tests.
 * Never shipped.
 */
import {
  catalogVocabularyValue,
  type ContractCatalogAdapter,
  type ContractCatalogOperation,
  type ContractCatalogV1,
  type ContractInputSchema,
} from "./contracts-catalog";
import type { CollectionPlanV1, CollectionRead } from "./contracts-plan";
import {
  CONTRACT_CATALOG_V1,
  contractStates,
  contractTransports,
  idempotencyKinds,
  operationAuthorities,
  operationRisks,
} from "./contracts-vocabulary";
import { fc } from "./test-support";

export const HASH_A = "a1".repeat(32);
export const HASH_B = "b2".repeat(32);
export const HASH_C = "c3".repeat(32);
export const HASH_D = "d4".repeat(32);
export const HASH_E = "e5".repeat(32);
export const RUN_ID = "0f2c1a6e-4b7d-4c1e-8f3a-9d6b5c4a3e2f";

function operation(
  id: string,
  overrides: Partial<ContractCatalogOperation>,
): ContractCatalogOperation {
  return {
    id,
    transport: "web-session-api",
    authority: "auth",
    risk: "R1",
    sideEffect: "none",
    idempotency: "none",
    dedupeWindowMs: 0,
    state: "observed",
    contractVersion: 1,
    contractHash: HASH_A,
    input: { properties: {}, required: [] },
    ...overrides,
  };
}

export const handleInput: ContractInputSchema = {
  properties: {
    handle: { type: "string", description: "Exact handle", minLength: 1, maxLength: 64 },
  },
  required: ["handle"],
};

export function exampleCatalog(): ContractCatalogV1 {
  const acmeWeb: ContractCatalogAdapter = {
    id: "acme-web",
    version: "1.4.0",
    surfaceId: "acme",
    manifestHash: HASH_B,
    origins: ["https://acme.example"],
    operations: [
      operation("feeds.read", {
        input: {
          properties: {
            feed: { type: "string", description: "Reviewed feed", enum: ["home", "saved"] },
            limit: { type: "number", description: "Page size", minimum: 1, maximum: 100 },
          },
          required: ["feed"],
        },
      }),
      operation("messaging.list", { state: "capture-required", contractHash: HASH_C }),
      operation("posts.publish", {
        risk: "R3",
        sideEffect: "Publishes one externally visible post.",
        idempotency: "local-at-most-once",
        dedupeWindowMs: 86_400_000,
        contractVersion: 3,
        contractHash: HASH_D,
        input: {
          properties: { body: { type: "string", description: "Post body", minLength: 1, maxLength: 280 } },
          required: ["body"],
        },
      }),
      operation("profiles.read", {
        authority: "public",
        contractVersion: 2,
        contractHash: HASH_E,
        input: handleInput,
      }),
    ],
  };
  return {
    ok: true,
    contract: CONTRACT_CATALOG_V1,
    ghostget: { version: "0.18.34" },
    generatedAt: "2026-09-21T20:00:00.000Z",
    vocabulary: catalogVocabularyValue,
    adapters: [
      acmeWeb,
      { id: "broken-web", invalid: true, issues: ["manifest.schemaVersion must be 4"] },
      {
        id: "gmail",
        version: "2.0.0",
        surfaceId: "gmail",
        manifestHash: HASH_C,
        origins: ["https://mail.google.com"],
        operations: [operation("contacts.list", { transport: "provider-api", contractHash: HASH_B })],
      },
      {
        id: "local-tool",
        version: "1.0.0",
        surfaceId: null,
        manifestHash: HASH_D,
        origins: [],
        operations: [operation("contacts.list", { transport: "local-cli" })],
      },
      {
        id: "template-web",
        version: "1.0.0",
        surfaceId: "template",
        manifestHash: HASH_E,
        origins: ["https://template.example"],
        operations: [operation("articles.publish", {
          transport: "reviewed-template-api",
          risk: "R3",
          sideEffect: "Publishes one article.",
          idempotency: "local-at-most-once",
          dedupeWindowMs: 86_400_000,
          state: "capture-required",
        })],
      },
    ],
  };
}

export function exampleRead(overrides: Partial<CollectionRead> = {}): CollectionRead {
  return {
    adapter: "acme-web",
    operation: "profiles.read",
    authority: { kind: "public" },
    input: { handle: "hraness" },
    expectedOutput: { provider: "acme", targetUrl: "https://acme.example/hraness" },
    metricKeys: ["followers", "following"],
    expectedCategoricalGaps: [],
    requiredDelayBeforeMs: 0,
    semantics: { state: "observed", risk: "R1", sideEffect: "none" },
    ...overrides,
  };
}

export function examplePlan(): CollectionPlanV1 {
  return {
    schemaVersion: 1,
    collectionKey: "example-social-statistics",
    execution: { order: "sequential", observationMode: "live-only" },
    accounts: [
      { accountKey: "acme-public", reads: [exampleRead()] },
      {
        accountKey: "acme-personal",
        reads: [
          exampleRead({
            operation: "feeds.read",
            authority: { kind: "auth", authId: "acme-chrome" },
            input: { feed: "home", limit: 10 },
            metricKeys: ["items"],
            requiredDelayBeforeMs: 60_000,
          }),
        ],
      },
      {
        accountKey: "gmail-main",
        reads: [
          exampleRead({
            adapter: "gmail",
            operation: "contacts.list",
            authority: { kind: "auth", authId: "gmail-main" },
            input: {},
            expectedOutput: { provider: "gmail", targetUrl: "https://mail.google.com/" },
            metricKeys: ["contacts", "recentViews"],
            expectedCategoricalGaps: [
              { metricKey: "recentViews", reason: "not-authorized", until: "account-eligible" },
            ],
          }),
        ],
      },
    ],
  };
}

export type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

/** A structural clone with every object made mutable, for mutation tests. */
export function mutable<T>(value: T): DeepMutable<T> {
  return JSON.parse(JSON.stringify(value)) as DeepMutable<T>;
}

export type ObjectPath = readonly (string | number)[];

/** Every path to a plain object inside a JSON document, root first. */
export function objectPaths(value: unknown, prefix: ObjectPath = []): readonly ObjectPath[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => objectPaths(item, [...prefix, index]));
  }
  if (typeof value !== "object" || value === null) return [];
  return [
    prefix,
    ...Object.entries(value).flatMap(([key, item]) => objectPaths(item, [...prefix, key])),
  ];
}

export function atPath(value: unknown, path: ObjectPath): Record<string, unknown> {
  let current: unknown = value;
  for (const segment of path) current = (current as Record<string | number, unknown>)[segment];
  return current as Record<string, unknown>;
}

/** Add one unsupported key at a chosen object path of a cloned document. */
export function withExtraKey<T>(document: T, path: ObjectPath): T {
  const clone = mutable(document);
  atPath(clone, path).__extra = true;
  return clone as unknown as T;
}

export function pathLabel(path: ObjectPath): string {
  return path.map((segment) => typeof segment === "number" ? `[${String(segment)}]` : `.${segment}`).join("");
}

const kebabSegment = fc.stringMatching(/^[a-z][a-z0-9]{0,4}$/u);
export const kebabArbitrary = fc.array(kebabSegment, { minLength: 1, maxLength: 3 })
  .map((segments) => segments.join("-"));
export const operationIdArbitrary = fc.array(kebabSegment, { minLength: 2, maxLength: 3 })
  .map((segments) => segments.join("."));
export const sha256Arbitrary = fc.stringMatching(/^[a-f0-9]{64}$/u);
const fieldNameArbitrary = fc.stringMatching(/^[a-z][a-z0-9_]{0,6}$/u);
const asciiText = (maxLength: number) => fc.string({ minLength: 1, maxLength });
const versionArbitrary = fc.tuple(fc.nat({ max: 20 }), fc.nat({ max: 20 }), fc.nat({ max: 20 }))
  .map(([major, minor, patch]) => `${String(major)}.${String(minor)}.${String(patch)}`);
const dateTimeArbitrary = fc.date({
  min: new Date("2020-01-01T00:00:00.000Z"),
  max: new Date("2099-12-31T00:00:00.000Z"),
  noInvalidDate: true,
}).map((date) => date.toISOString());

const scalarFieldArbitrary = fc.oneof(
  fc.record({
    type: fc.constant("string" as const),
    description: asciiText(20),
    minLength: fc.nat({ max: 3 }),
    maxLength: fc.integer({ min: 4, max: 32 }),
  }),
  fc.record({
    type: fc.constant("number" as const),
    description: asciiText(20),
    minimum: fc.integer({ min: 0, max: 5 }),
    maximum: fc.integer({ min: 6, max: 100 }),
  }),
  fc.record({ type: fc.constant("boolean" as const), description: asciiText(20) }),
  fc.record({
    type: fc.constant("string" as const),
    description: asciiText(20),
    enum: fc.uniqueArray(kebabSegment, { minLength: 1, maxLength: 3 }),
  }),
);

export const inputSchemaArbitrary: fc.Arbitrary<ContractInputSchema> = fc
  .dictionary(fieldNameArbitrary, scalarFieldArbitrary, { maxKeys: 3 })
  .chain((properties) => fc.subarray(Object.keys(properties))
    .map((required) => ({ properties, required })));

export const catalogOperationArbitrary: fc.Arbitrary<ContractCatalogOperation> = fc.record({
  id: operationIdArbitrary,
  transport: fc.constantFrom(...contractTransports),
  authority: fc.constantFrom(...operationAuthorities),
  risk: fc.constantFrom(...operationRisks),
  sideEffect: fc.oneof(fc.constant("none"), asciiText(30)),
  idempotency: fc.constantFrom(...idempotencyKinds),
  dedupeWindowMs: fc.nat({ max: 30 * 24 * 60 * 60_000 }),
  state: fc.constantFrom(...contractStates),
  contractVersion: fc.integer({ min: 1, max: 9 }),
  contractHash: sha256Arbitrary,
  input: inputSchemaArbitrary,
});

export const catalogAdapterArbitrary: fc.Arbitrary<ContractCatalogV1["adapters"][number]> = fc.oneof(
  { weight: 4, arbitrary: fc.record({
    id: kebabArbitrary,
    version: versionArbitrary,
    surfaceId: fc.oneof(kebabArbitrary, fc.constant(null)),
    manifestHash: sha256Arbitrary,
    origins: fc.uniqueArray(kebabArbitrary.map((host) => `https://${host}.example`), { maxLength: 2 }),
    operations: fc.uniqueArray(catalogOperationArbitrary, {
      selector: (candidate) => candidate.id,
      maxLength: 4,
    }),
  }) },
  { weight: 1, arbitrary: fc.record({
    id: kebabArbitrary,
    invalid: fc.constant(true as const),
    issues: fc.array(asciiText(40), { minLength: 1, maxLength: 3 }),
  }) },
);

export const catalogArbitrary: fc.Arbitrary<ContractCatalogV1> = fc.record({
  ok: fc.constant(true),
  contract: fc.constant(CONTRACT_CATALOG_V1),
  ghostget: fc.record({ version: versionArbitrary }),
  generatedAt: dateTimeArbitrary,
  vocabulary: fc.constant(catalogVocabularyValue),
  adapters: fc.uniqueArray(catalogAdapterArbitrary, { selector: (adapter) => adapter.id, maxLength: 4 })
    .map((adapters) => [...adapters].sort((left, right) => left.id.localeCompare(right.id))),
});

const metricKeyArbitrary = fc.stringMatching(/^[a-z][A-Za-z0-9]{0,8}$/u);
const inputValueArbitrary = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.integer({ min: -100, max: 100 }),
  fc.boolean(),
  fc.constant(null),
);

export const collectionReadArbitrary: fc.Arbitrary<CollectionRead> = fc.record({
  adapter: kebabArbitrary,
  operation: operationIdArbitrary,
  authority: fc.oneof(
    fc.constant({ kind: "public" as const }),
    fc.record({ kind: fc.constant("auth" as const), authId: kebabArbitrary }),
  ),
  input: fc.dictionary(fieldNameArbitrary, inputValueArbitrary, { maxKeys: 3 }),
  expectedOutput: fc.record({
    provider: kebabArbitrary,
    targetUrl: kebabArbitrary.map((host) => `https://${host}.example/`),
  }),
  metricKeys: fc.uniqueArray(metricKeyArbitrary, { minLength: 1, maxLength: 3 }),
  requiredDelayBeforeMs: fc.nat({ max: 600_000 }),
  semantics: fc.record({
    state: fc.constantFrom(...contractStates),
    risk: fc.constant("R1" as const),
    sideEffect: fc.constant("none" as const),
  }),
}).chain((read) => fc.subarray(read.metricKeys).map((gapKeys) => ({
  ...read,
  expectedCategoricalGaps: gapKeys.map((metricKey) => ({
    metricKey,
    reason: "not-authorized" as const,
    until: "account-eligible" as const,
  })),
})));

export const planArbitrary: fc.Arbitrary<CollectionPlanV1> = fc.record({
  schemaVersion: fc.constant(1 as const),
  collectionKey: kebabArbitrary,
  execution: fc.constant({ order: "sequential" as const, observationMode: "live-only" as const }),
  accounts: fc.uniqueArray(
    fc.record({
      accountKey: kebabArbitrary,
      reads: fc.array(collectionReadArbitrary, { minLength: 1, maxLength: 2 }),
    }),
    { selector: (account) => account.accountKey, minLength: 1, maxLength: 3 },
  ),
});

/** Build an input that satisfies a generated scalar-only schema. */
export function conformingInput(schema: ContractInputSchema): Record<string, string | number | boolean> {
  const input: Record<string, string | number | boolean> = {};
  for (const name of schema.required) {
    const field = schema.properties[name];
    if (field === undefined || field.type === "file" || field.type === "array") continue;
    if (field.type === "boolean") input[name] = true;
    else if (field.type === "number") input[name] = field.minimum ?? 0;
    else if (field.enum !== undefined && field.enum.length > 0) input[name] = field.enum[0] as string;
    else input[name] = "x".repeat(Math.max(1, field.minLength ?? 1));
  }
  return input;
}

/** Reads that must bind `ok` against the catalog they were derived from. */
export function conformingPlanArbitrary(catalog: ContractCatalogV1): fc.Arbitrary<CollectionPlanV1> | null {
  const candidates: { readonly adapter: ContractCatalogAdapter; readonly operation: ContractCatalogOperation }[] = [];
  for (const adapter of catalog.adapters) {
    if ("invalid" in adapter) continue;
    for (const candidate of adapter.operations) {
      if (
        candidate.risk === "R1"
        && candidate.sideEffect === "none"
        && candidate.transport !== "reviewed-template-api"
      ) candidates.push({ adapter, operation: candidate });
    }
  }
  if (candidates.length === 0) return null;
  const readArbitrary = fc.constantFrom(...candidates).map(({ adapter, operation: candidate }): CollectionRead => ({
    adapter: adapter.id,
    operation: candidate.id,
    authority: candidate.authority === "public"
      ? { kind: "public" }
      : { kind: "auth", authId: `${adapter.id}-auth` },
    input: conformingInput(candidate.input),
    expectedOutput: { provider: adapter.surfaceId ?? adapter.id, targetUrl: `https://${adapter.id}.example/` },
    metricKeys: ["followers"],
    expectedCategoricalGaps: [],
    requiredDelayBeforeMs: 0,
    semantics: { state: candidate.state, risk: "R1", sideEffect: "none" },
  }));
  return fc.record({
    schemaVersion: fc.constant(1 as const),
    collectionKey: kebabArbitrary,
    execution: fc.constant({ order: "sequential" as const, observationMode: "live-only" as const }),
    accounts: fc.uniqueArray(
      fc.record({
        accountKey: kebabArbitrary,
        reads: fc.array(readArbitrary, { minLength: 1, maxLength: 2 }),
      }),
      { selector: (account) => account.accountKey, minLength: 1, maxLength: 3 },
    ),
  });
}
