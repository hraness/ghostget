/**
 * Differential test for `verification/lean/GhostgetVerification/WebPolicy.lean`.
 *
 * Each generated case saves a rule list through the production
 * `saveWebPolicy`, checks several requests through the production
 * `checkWebRequest`, and asks the Lean model for each request under the same
 * rules. The decision, both limits, the matching rules, and the endpoint must
 * agree. `bun run verify:lean` runs this file in its own test process against
 * the pinned toolchain; see `scripts/verification-lean-oracle.ts`.
 *
 * The private state store is replaced by an in-memory map. Every real save and
 * read spawns the bound state helper several times, and a generated property
 * over the real store does not fit the verification budget. `web-policy.ts`
 * runs unchanged, including its policy parser and compare-and-swap check; the
 * store's own tests cover the private file layer.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

import { sha256 } from "../src/canonical-json";
import type { WebRule } from "../src/control/protocol";
import { assertAsyncProperty, fc } from "../src/test-support";
import { startLeanOracle, type LeanOracle } from "./verification-lean-oracle";

type Method = "GET" | "HEAD";
type Outcome = Readonly<{
  decision: string;
  maxResponseBytes: number;
  timeoutMs: number;
  ruleIds: readonly string[];
  endpoint: string | null;
}>;
type Request = Readonly<{
  method: Method;
  origin: string;
  path: string;
  queryKeys: readonly string[];
}>;
type Case = Readonly<{ rules: readonly WebRule[]; request: Request }>;
type Compared = Readonly<{ rules: readonly WebRule[]; production: Outcome; model: Outcome }>;

const ORIGINS = ["https://alpha.example.com", "https://beta.example.com"] as const;
const SEGMENTS = ["a", "b", "ab"] as const;
const QUERY_KEYS = ["a", "b", "q", "x.y"] as const;

const segments = fc.array(fc.constantFrom(...SEGMENTS), { maxLength: 3 });
const exactPath = fc.tuple(segments, fc.boolean())
  .map(([parts, trailing]) => `/${parts.join("/")}${trailing && parts.length > 0 ? "/" : ""}`);
const prefixPath = segments.map((parts) => (parts.length === 0 ? "/" : `/${parts.join("/")}/`));
const method = fc.constantFrom<Method>("GET", "HEAD");

const rule = fc.record({
  origin: fc.constantFrom(...ORIGINS),
  path: fc.oneof(
    exactPath.map((value) => ({ kind: "exact" as const, value })),
    prefixPath.map((value) => ({ kind: "prefix" as const, value })),
  ),
  methods: fc.uniqueArray(method, { minLength: 1, maxLength: 2 }),
  queryKeys: fc.uniqueArray(fc.constantFrom(...QUERY_KEYS), { maxLength: 3 }),
  decision: fc.constantFrom("allow" as const, "ask" as const, "deny" as const),
  maxResponseBytes: fc.oneof(fc.integer({ min: 1, max: 2_000_000 }), fc.constantFrom(1, 1024, 2_000_000)),
  timeoutMs: fc.oneof(fc.integer({ min: 1000, max: 60_000 }), fc.constantFrom(1000, 30_000, 60_000)),
});

const request: fc.Arbitrary<Request> = fc.record({
  method,
  origin: fc.constantFrom(...ORIGINS),
  path: exactPath,
  queryKeys: fc.uniqueArray(fc.constantFrom(...QUERY_KEYS), { maxLength: 3 }),
});

const decision = fc.constantFrom("allow" as const, "ask" as const, "deny" as const);

/** A request aimed at one rule: its origin, a method it lists, its path or one below it, and keys it lists. */
function aimedAt(rules: readonly WebRule[]): fc.Arbitrary<Request> {
  return fc.record({
    index: fc.nat({ max: rules.length - 1 }),
    method,
    deeper: fc.boolean(),
    keys: fc.uniqueArray(fc.constantFrom(...QUERY_KEYS), { maxLength: 3 }),
  }).map(({ index, method: requested, deeper, keys }) => {
    const target = rules[index]!;
    const below = deeper && target.path.value.endsWith("/") ? `${target.path.value}a` : target.path.value;
    return {
      method: target.methods.includes(requested) ? requested : target.methods[0]!,
      origin: target.origin,
      path: below,
      queryKeys: keys.filter((key) => target.queryKeys.includes(key)),
    };
  });
}

/**
 * One rule list and several requests under it. Some rules repeat an earlier rule with another
 * decision, and some requests aim at a rule, so overlapping matches are common.
 */
const policies = fc.record({
  base: fc.array(rule, { maxLength: 5 }),
  copies: fc.array(fc.tuple(fc.nat(), decision), { maxLength: 2 }),
}).map(({ base, copies }) => [
  ...base,
  ...(base.length === 0 ? [] : copies.map(([index, changed]) => ({ ...base[index % base.length]!, decision: changed }))),
].map((value, index): WebRule => ({ id: `r${String(index).padStart(2, "0")}`, effect: "retrieval", ...value })))
  .chain((rules) => fc.record({
    rules: fc.constant(rules),
    requests: fc.array(rules.length === 0 ? request : fc.oneof(request, aimedAt(rules)), { minLength: 1, maxLength: 6 }),
  }));

function requestUrl(value: Request): string {
  const query = value.queryKeys.map((key) => `${key}=1`).join("&");
  return `${value.origin}${value.path}${query === "" ? "" : `?${query}`}`;
}

/** The runner's line for one case: see `WebPolicyDiff` in `verification/lean/Differential.lean`. */
function encode({ rules: ruleList, request: value }: Case): string {
  const rules = ruleList.map((entry) => [
    entry.origin,
    entry.path.kind,
    entry.path.value,
    String(entry.methods.length),
    ...entry.methods,
    String(entry.queryKeys.length),
    ...entry.queryKeys,
    entry.decision,
    String(entry.maxResponseBytes),
    String(entry.timeoutMs),
  ].join(" "));
  return [
    "policy",
    String(ruleList.length),
    ...rules,
    value.method,
    value.origin,
    value.path,
    String(value.queryKeys.length),
    ...value.queryKeys,
  ].join(" ");
}

function decodeModel(answer: string, rules: readonly WebRule[]): Outcome {
  const tokens = answer.split(" ");
  const matching = Number(tokens[3]);
  const indexes = tokens.slice(4, 4 + matching).map(Number);
  expect(tokens.length).toBe(5 + matching);
  const endpoint = tokens[4 + matching]!;
  return {
    decision: tokens[0]!,
    maxResponseBytes: Number(tokens[1]),
    timeoutMs: Number(tokens[2]),
    ruleIds: indexes.map((index) => rules[index]!.id).sort(),
    endpoint: endpoint === "-" ? null : endpoint,
  };
}

/** The in-memory private state store: path to stored text. */
const files = new Map<string, string>();
const STATE_HOME = "/state";

mock.module("../src/storage", () => ({
  ghostgetStateHome: () => STATE_HOME,
  ensurePrivateStateDirectory: () => undefined,
  privateStateFilesMayExist: (directory: string, names: readonly string[]) =>
    names.some((name) => files.has(`${STATE_HOME}/${directory}/${name}`)),
  readPrivateStateFileIfPresent: (path: string, maximumBytes: number) => {
    const text = files.get(path);
    if (text !== undefined && Buffer.byteLength(text) > maximumBytes) throw new Error("state file is too large");
    return text ?? null;
  },
  createPrivateJsonIfAbsent: (path: string, value: unknown) => {
    if (files.has(path)) return { created: false };
    files.set(path, `${JSON.stringify(value)}\n`);
    return { created: true };
  },
  writePrivateJsonIfUnchanged: (path: string, value: unknown, options: { expectedCurrentContentSha256: string }) => {
    const current = files.get(path);
    if (current === undefined || sha256(current) !== options.expectedCurrentContentSha256) return false;
    files.set(path, `${JSON.stringify(value)}\n`);
    return true;
  },
}));

const { checkWebRequest, saveWebPolicy } = await import("../src/control/web-policy");

let oracle: LeanOracle | undefined;
const environment: Record<string, string | undefined> = {};
let revision = 0;

beforeAll(async () => {
  oracle = await startLeanOracle();
});

afterAll(async () => {
  await oracle?.close();
});

/** Save the rules with the production code. */
function save(rules: readonly WebRule[]): void {
  revision = saveWebPolicy(rules, false, revision, environment).revision;
}

/** Check one request under the saved rules with the production code. */
function production(value: Request): Outcome {
  const checked = checkWebRequest(value.method, requestUrl(value), environment);
  return {
    decision: checked.approval.decision,
    maxResponseBytes: checked.maxResponseBytes,
    timeoutMs: checked.timeoutMs,
    ruleIds: checked.ruleIds,
    endpoint: checked.endpoint,
  };
}

async function model(value: Case): Promise<Outcome> {
  return decodeModel(await oracle!.query(encode(value)), value.rules);
}

/** Every production and model outcome the tests compared, for the seeded-defect check. */
const compared: Compared[] = [];

async function compare(rules: readonly WebRule[], value: Request): Promise<Outcome> {
  const outcome = production(value);
  const expected = await model({ rules, request: value });
  compared.push({ rules, production: outcome, model: expected });
  expect(outcome).toEqual(expected);
  return outcome;
}

/**
 * The seeded defect reports ask whenever a matching rule asks, as the Lean
 * mutant `decideAskFirst` does.
 */
function askFirst(rules: readonly WebRule[], outcome: Outcome): Outcome {
  const asks = rules.some((entry) => entry.decision === "ask" && outcome.ruleIds.includes(entry.id));
  return asks ? { ...outcome, decision: "ask" } : outcome;
}

describe("web policy: checkWebRequest agrees with the Lean model", () => {
  test("a matching deny beats ask and allow", async () => {
    const base = { origin: ORIGINS[0], path: { kind: "prefix" as const, value: "/a/" }, methods: ["GET" as const], queryKeys: ["q"], effect: "retrieval" as const, maxResponseBytes: 1024, timeoutMs: 1000 };
    const rules: WebRule[] = [
      { ...base, id: "r00", decision: "allow" },
      { ...base, id: "r01", decision: "ask", maxResponseBytes: 512 },
      { ...base, id: "r02", decision: "deny", queryKeys: [] },
    ];
    save(rules);
    expect(await compare(rules, { method: "GET", origin: ORIGINS[0], path: "/a/b", queryKeys: ["q"] }))
      .toEqual({ decision: "deny", maxResponseBytes: 512, timeoutMs: 1000, ruleIds: ["r00", "r01", "r02"], endpoint: null });
  });

  test("no matching rule denies at the gateway ceilings", async () => {
    save([]);
    expect(await compare([], { method: "HEAD", origin: ORIGINS[1], path: "/", queryKeys: [] }))
      .toEqual({ decision: "deny", maxResponseBytes: 2_000_000, timeoutMs: 30_000, ruleIds: [], endpoint: null });
  });

  test("generated rule lists and requests, and the comparison finds a seeded defect", async () => {
    compared.length = 0;
    await assertAsyncProperty(fc.asyncProperty(policies, async ({ rules, requests }) => {
      save(rules);
      for (const value of requests) await compare(rules, value);
    }), { numRuns: 300, interruptAfterTimeLimit: 300_000 });
    // The same comparison, with the ask-before-deny defect seeded into the
    // production outcome, must disagree with the model on a generated case.
    expect(compared.length).toBeGreaterThanOrEqual(300);
    // Every decision was reached, with one matching rule and with several.
    for (const reached of ["allow", "ask", "deny"]) {
      expect({ reached, single: compared.some(({ model: expected }) => expected.decision === reached && expected.ruleIds.length === 1) })
        .toEqual({ reached, single: true });
      expect({ reached, several: compared.some(({ model: expected }) => expected.decision === reached && expected.ruleIds.length > 1) })
        .toEqual({ reached, several: true });
    }
    expect(compared.some(({ rules, production: outcome, model: expected }) =>
      !Bun.deepEquals(askFirst(rules, outcome), expected))).toBeTrue();
  });
});
