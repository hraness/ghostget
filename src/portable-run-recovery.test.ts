import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "bun:test";

import { canonicalJson } from "./model";
import {
  parsePortableRunNotAppliedClaim,
  parsePortableRunReconciliationInput,
  readPortableRunNotAppliedClaim,
  readPortableRunResolution,
  reconcilePortableProviderPluginRun,
} from "./portable-run-recovery";
import { createProviderPluginRegistry } from "./provider-plugin-registry";
import { assertProperty, fc } from "./test-support";

const roots: string[] = [];
const runId = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function environment(): Readonly<Record<string, string | undefined>> {
  const root = mkdtempSync(join(tmpdir(), "wrench-portable-recovery-"));
  chmodSync(root, 0o700);
  roots.push(root);
  return { ...process.env, GHOSTGET_STATE_HOME: root };
}

function resolution() {
  return {
    schemaVersion: 1,
    runId,
    resolvedAt: "2026-07-25T12:00:00.000Z",
    receiptHash: "1".repeat(64),
    planDigest: "2".repeat(64),
    adapterHash: "3".repeat(64),
    inputHash: "4".repeat(64),
    authHash: "5".repeat(64),
    contractHash: "6".repeat(64),
    portablePluginContract: {
      pluginId: "example-portable",
      pluginVersion: "1.2.3",
      hostApiVersion: 1,
      bundleSha256: "7".repeat(64),
      manifestSha256: "8".repeat(64),
      adapterId: "example-portable-web",
      transport: "web-session-api",
      surfaceId: "example-portable",
      operation: "likes.set",
      contractVersion: 1,
      descriptorSha256: "9".repeat(64),
    },
    outcome: "not-applied",
    evidenceHash: "a".repeat(64),
  } as const;
}

function claim() {
  return {
    schemaVersion: 1,
    kind: "caller-asserted-not-applied",
    runId,
    claimedAt: "2026-07-25T12:00:00.000Z",
    receiptHash: "1".repeat(64),
    planDigest: "2".repeat(64),
    adapterHash: "3".repeat(64),
    inputHash: "4".repeat(64),
    authHash: "5".repeat(64),
    contractHash: "6".repeat(64),
    portablePluginContract: resolution().portablePluginContract,
    evidenceHash: "a".repeat(64),
  } as const;
}

const claimKeys = Object.keys(claim());
const claimHashKeys = [
  "receiptHash",
  "planDigest",
  "adapterHash",
  "inputHash",
  "authHash",
  "contractHash",
  "evidenceHash",
] as const;

function writeRecoveryRecord(
  directoryName: "portable-resolutions" | "portable-not-applied-claims",
  value: unknown,
  environmentValue: Readonly<Record<string, string | undefined>>,
): string {
  const root = environmentValue.GHOSTGET_STATE_HOME;
  if (root === undefined) throw new Error("test GHOSTGET_STATE_HOME is unavailable");
  const recovery = join(root, "recovery");
  const directory = join(recovery, directoryName);
  mkdirSync(recovery, { mode: 0o700, recursive: true });
  mkdirSync(directory, { mode: 0o700, recursive: true });
  const path = join(directory, `${runId}.json`);
  writeFileSync(path, `${canonicalJson(value)}\n`, { mode: 0o600 });
  return path;
}

function writeResolution(
  value: unknown,
  environmentValue: Readonly<Record<string, string | undefined>>,
): string {
  return writeRecoveryRecord("portable-resolutions", value, environmentValue);
}

function writeClaim(
  value: unknown,
  environmentValue: Readonly<Record<string, string | undefined>>,
): string {
  return writeRecoveryRecord(
    "portable-not-applied-claims",
    value,
    environmentValue,
  );
}

/** Write one unsettled portable receipt with the given dispatch counts. */
function writePortableReceipt(
  environmentValue: Readonly<Record<string, string | undefined>>,
  dispatch: {
    readonly planned: number;
    readonly started: number;
    readonly verified: number;
  },
): string {
  const root = environmentValue.GHOSTGET_STATE_HOME;
  if (root === undefined) throw new Error("test GHOSTGET_STATE_HOME is unavailable");
  const runs = join(root, "runs");
  mkdirSync(runs, { mode: 0o700 });
  writeFileSync(join(runs, `${runId}.json`), `${canonicalJson({
    schemaVersion: 6,
    runId,
    planDigest: "1".repeat(64),
    adapter: {
      id: "example-portable-web",
      version: "1.0.0",
      hash: "2".repeat(64),
    },
    operation: "likes.set",
    risk: "R2",
    inputHash: "3".repeat(64),
    auth: {
      id: "example-auth",
      hash: "4".repeat(64),
      kind: "cookies-file",
    },
    transport: "portable-provider-plugin",
    status: "indeterminate",
    dispatchStarted: true,
    dispatch,
    startedAt: "2026-07-25T12:00:00.000Z",
    finishedAt: "2026-07-25T12:00:01.000Z",
    finalOrigin: "https://example.com",
    error: "plugin outcome is unknown",
    portablePluginContract: resolution().portablePluginContract,
  })}\n`, { mode: 0o600 });
  return root;
}

test("parses only the exact frozen portable reconciliation observation", () => {
  const parsed = parsePortableRunReconciliationInput({
    outcome: "applied",
    evidenceHash: "a".repeat(64),
  });
  expect(parsed).toEqual({
    outcome: "applied",
    evidenceHash: "a".repeat(64),
  });
  expect(Object.isFrozen(parsed)).toBeTrue();

  for (const candidate of [
    null,
    [],
    { outcome: "unknown", evidenceHash: "a".repeat(64) },
    { outcome: "applied", evidenceHash: "A".repeat(64) },
    { outcome: "applied", evidenceHash: "a".repeat(63) },
    {
      outcome: "applied",
      evidenceHash: "a".repeat(64),
      result: "unsupported",
    },
    Object.assign(Object.create({ inherited: true }), {
      outcome: "applied",
      evidenceHash: "a".repeat(64),
    }),
  ]) {
    expect(() => parsePortableRunReconciliationInput(candidate)).toThrow();
  }

  const accessor = { outcome: "applied" };
  Object.defineProperty(accessor, "evidenceHash", {
    enumerable: true,
    get: () => {
      throw new Error("must not evaluate reconciliation accessors");
    },
  });
  expect(() => parsePortableRunReconciliationInput(accessor))
    .toThrow("unsupported accessor");
});

test("reads only a canonical resolution bound to its durable run coordinate", () => {
  const environmentValue = environment();
  const path = writeResolution(resolution(), environmentValue);
  expect(readPortableRunResolution(runId, environmentValue)).toEqual(
    resolution(),
  );

  writeFileSync(path, `${JSON.stringify(resolution(), null, 2)}\n`, {
    mode: 0o600,
  });
  expect(() => readPortableRunResolution(runId, environmentValue))
    .toThrow("durable coordinate");

  writeResolution({
    ...resolution(),
    runId: "22222222-2222-4222-8222-222222222222",
  }, environmentValue);
  expect(() => readPortableRunResolution(runId, environmentValue))
    .toThrow("durable coordinate");
});

test("reads only a canonical not-applied claim bound to its durable run coordinate", () => {
  const environmentValue = environment();
  const path = writeClaim(claim(), environmentValue);
  const parsed = readPortableRunNotAppliedClaim(runId, environmentValue);
  expect(parsed).toEqual(claim());
  expect(Object.isFrozen(parsed)).toBeTrue();

  writeFileSync(path, `${JSON.stringify(claim(), null, 2)}\n`, {
    mode: 0o600,
  });
  expect(() => readPortableRunNotAppliedClaim(runId, environmentValue))
    .toThrow("durable coordinate");

  writeClaim({
    ...claim(),
    runId: "22222222-2222-4222-8222-222222222222",
  }, environmentValue);
  expect(() => readPortableRunNotAppliedClaim(runId, environmentValue))
    .toThrow("durable coordinate");

  // A claim is never a resolution, in either direction.
  writeClaim(resolution(), environmentValue);
  expect(() => readPortableRunNotAppliedClaim(runId, environmentValue))
    .toThrow("unsupported fields");
  writeResolution(claim(), environmentValue);
  expect(() => readPortableRunResolution(runId, environmentValue))
    .toThrow("unsupported fields");
});

test("parses exactly the frozen not-applied claim record", () => {
  const sha256 = fc.stringMatching(/^[a-f0-9]{64}$/u);
  const validClaim = fc.record({
    runId: fc.uuid({ version: 4 }),
    claimedAt: fc.date({
      min: new Date("2000-01-01T00:00:00.000Z"),
      max: new Date("2099-12-31T23:59:59.999Z"),
      noInvalidDate: true,
    }).map((date) => date.toISOString()),
    receiptHash: sha256,
    planDigest: sha256,
    adapterHash: sha256,
    inputHash: sha256,
    authHash: sha256,
    contractHash: sha256,
    evidenceHash: sha256,
  }).map((fields): Record<string, unknown> => ({ ...claim(), ...fields }));

  // A canonically stored claim parses back to the same frozen record.
  assertProperty(fc.property(validClaim, (value) => {
    const parsed = parsePortableRunNotAppliedClaim(
      JSON.parse(canonicalJson(value)),
    );
    expect<unknown>(parsed).toEqual(value);
    expect(Object.isFrozen(parsed)).toBeTrue();
  }));

  // Arbitrary input is never mistaken for a claim.
  assertProperty(fc.property(fc.anything(), (value) => {
    expect(() => parsePortableRunNotAppliedClaim(value)).toThrow();
  }));

  // Any missing, extra, or malformed field is drift and rejects.
  type Drift = (value: Record<string, unknown>) => Record<string, unknown>;
  const drift: fc.Arbitrary<Drift> = fc.oneof(
    fc.constantFrom(...claimKeys).map((key): Drift => (value) => {
      const copy = { ...value };
      delete copy[key];
      return copy;
    }),
    fc.stringMatching(/^[a-z][A-Za-z]{0,12}$/u)
      .filter((key) => !claimKeys.includes(key))
      .map((key): Drift => (value) => ({ ...value, [key]: null })),
    fc.tuple(
      fc.constantFrom(...claimHashKeys),
      fc.oneof(
        fc.stringMatching(/^[A-F0-9]{63}[A-F]$/u),
        fc.stringMatching(/^[a-f0-9]{0,63}$/u),
        fc.stringMatching(/^[a-f0-9]{65,80}$/u),
        fc.constant(null),
      ),
    ).map(([key, malformed]): Drift => (value) => ({
      ...value,
      [key]: malformed,
    })),
    fc.constantFrom<Record<string, unknown>>(
      { schemaVersion: 2 },
      { schemaVersion: "1" },
      { kind: "not-applied" },
      { kind: "safe-retry" },
      { runId: "../private" },
      { runId: "11111111-1111-1111-8111-111111111111" },
      { claimedAt: "2026-07-25T12:00:00Z" },
      { claimedAt: "not-a-time" },
      { portablePluginContract: null },
    ).map((patch): Drift => (value) => ({ ...value, ...patch })),
  );
  assertProperty(fc.property(validClaim, drift, (value, mutate) => {
    expect(() => parsePortableRunNotAppliedClaim(mutate(value))).toThrow();
  }));
});

test("rejects malformed run coordinates before touching local state", () => {
  const environmentValue = environment();
  expect(() => readPortableRunResolution("../private", environmentValue))
    .toThrow("run ID is malformed");
  expect(() => readPortableRunNotAppliedClaim("../private", environmentValue))
    .toThrow("run ID is malformed");
});

test("never releases a verified dispatch for retry", () => {
  const environmentValue = environment();
  const root = writePortableReceipt(environmentValue, {
    planned: 2,
    started: 1,
    verified: 1,
  });

  expect(() => reconcilePortableProviderPluginRun(
    runId,
    { outcome: "not-applied", evidenceHash: "b".repeat(64) },
    {
      environment: environmentValue,
      registry: createProviderPluginRegistry([]),
    },
  )).toThrow("verified dispatch");
  expect(readPortableRunResolution(runId, environmentValue)).toBeNull();
  expect(readPortableRunNotAppliedClaim(runId, environmentValue)).toBeNull();
  expect(existsSync(join(root, "recovery", "portable-resolutions"))).toBeFalse();
  expect(existsSync(join(root, "recovery", "portable-not-applied-claims")))
    .toBeFalse();
});

test("never completes a release from a historical not-applied resolution", () => {
  // Before caller claims were fenced, a not-applied resolution could be
  // stored and its release interrupted. Neither outcome may finish that
  // release now, so the run stays fenced.
  const environmentValue = environment();
  const root = writePortableReceipt(environmentValue, {
    planned: 1,
    started: 1,
    verified: 0,
  });
  writeResolution(resolution(), environmentValue);
  const options = {
    environment: environmentValue,
    registry: createProviderPluginRegistry([]),
  };

  expect(() => reconcilePortableProviderPluginRun(
    runId,
    { outcome: "not-applied", evidenceHash: "a".repeat(64) },
    options,
  )).toThrow("already has a durable resolution");
  expect(() => reconcilePortableProviderPluginRun(
    runId,
    { outcome: "applied", evidenceHash: "a".repeat(64) },
    options,
  )).toThrow("different evidence or outcome");
  expect(readPortableRunResolution(runId, environmentValue))
    .toEqual(resolution());
  expect(existsSync(join(root, "recovery", "portable-not-applied-claims")))
    .toBeFalse();
});
