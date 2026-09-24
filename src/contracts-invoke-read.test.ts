import { describe, expect, test } from "bun:test";

import { parseInvokeReadResult, type InvokeReadResultV1 } from "./contracts-invoke-read";
import { contractSchema } from "./contracts-schema";
import { schemaViolations } from "./contracts-schema.test-support";
import { ContractParseError } from "./contracts-shape";
import { readFailureCategories, readFailureDispositions } from "./contracts-vocabulary";
import { mutable, objectPaths, RUN_ID, withExtraKey } from "./contracts.test-support";
import { readFailureProjection, type ReadFailureProjection } from "./web-session-execution";
import { assertProperty, fc } from "./test-support";

const schema = contractSchema("invoke-read");

/** A real `ghostget invoke bluesky-web profiles.read --json` envelope (public authority, schemaVersion 4). */
function succeededEnvelope(): Record<string, unknown> {
  return {
    ok: true,
    status: "succeeded",
    runId: "7d1c2f3a-5b6e-4a7f-8c9d-0e1f2a3b4c5d",
    replayed: false,
    receipt: {
      schemaVersion: 4,
      runId: "7d1c2f3a-5b6e-4a7f-8c9d-0e1f2a3b4c5d",
      planDigest: null,
      adapter: {
        id: "bluesky-web",
        version: "1.7.0",
        hash: "f8b840544d63796e1445806e3a85ca1153e64c3097a8c6c68fa9f3725e953d43",
      },
      operation: "profiles.read",
      risk: "R1",
      inputHash: "4c2b3e5d6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
      auth: {
        id: "public-2cc10c27e1265d26f16f724487abfe11",
        hash: "1b23de37616a51b1ea38505f29669e06d74d6b40a8c3f8583a9ddc35a5df65ea",
        kind: "public-web-session",
      },
      transport: "web-session-api",
      webSessionContractHash: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d",
      status: "succeeded",
      dispatchStarted: false,
      dispatch: { planned: 0, started: 0, verified: 0 },
      startedAt: "2026-09-21T20:39:47.101Z",
      finishedAt: "2026-09-21T20:39:48.520Z",
      finalOrigin: "https://bsky.app",
      error: null,
    },
    output: {
      schemaVersion: 1,
      provider: "bluesky",
      target: { handle: "hraness.bsky.social" },
      observedAt: "2026-09-21T20:39:48.500Z",
      completeness: "complete",
      metrics: {
        followers: { status: "available", precision: "exact", unit: "count", value: 12 },
      },
      metadata: { displayName: "Hraness" },
    },
    source: "live",
    cache: {
      status: "stored",
      publication: {
        key: "de0d8b9f714ed84abf64b4b3f889c039c077e8d9dec27e80e18c1e01924e8986",
        dataRevision: "4d72ec8aa7929de4662e36bc47c1e860e1b54260ee3d472f4e357757b5836855",
        validatedAt: "2026-09-21T20:39:48.520Z",
        dataChangedAt: "2026-09-21T20:39:48.520Z",
        disposition: "created",
      },
    },
  };
}

function failedEnvelope(category: ReadFailureProjection["category"] = "provider-throttled"): Record<string, unknown> {
  const receipt = succeededEnvelope().receipt as Record<string, unknown>;
  return {
    ok: false,
    status: "failed",
    runId: RUN_ID,
    replayed: false,
    receipt: {
      ...receipt,
      runId: RUN_ID,
      status: "failed",
      finalOrigin: null,
      error: "authenticated web operation failed before the dispatch boundary; reason: provider read was throttled by bounded response metadata",
    },
    output: null,
    readFailure: readFailureProjection(category),
    source: "live",
    cache: { status: "retained", reason: "live-read-failed" },
  };
}

describe("parseInvokeReadResult", () => {
  test("accepts a real succeeded envelope and narrows it in ordinary control flow", () => {
    const result = parseInvokeReadResult(succeededEnvelope());
    expect(result).toEqual(succeededEnvelope() as unknown as InvokeReadResultV1);
    expect(Object.isFrozen(result.receipt)).toBeTrue();
    if (result.status === "succeeded") {
      expect(result.receipt.schemaVersion).toBe(4);
      expect(result.receipt.transport).toBe("web-session-api");
      expect((result.output as { provider: string }).provider).toBe("bluesky");
      expect(result.cache.status).toBe("stored");
    } else {
      throw new Error("expected a succeeded result");
    }
    expect(schemaViolations(schema, succeededEnvelope())).toEqual([]);
  });

  test("accepts a failed envelope with its read failure and every other receipt transport", () => {
    const failed = parseInvokeReadResult(failedEnvelope());
    expect(failed.status).toBe("failed");
    if (failed.status === "failed") {
      expect(failed.readFailure).toEqual({ category: "provider-throttled", retryDisposition: "retry-once-after-60s" });
      expect(failed.output).toBeNull();
    }
    expect(schemaViolations(schema, failedEnvelope())).toEqual([]);

    const base = succeededEnvelope();
    const receipt = base.receipt as Record<string, unknown>;
    const { webSessionContractHash: _omitted, ...common } = receipt;
    const hash = "1234567890abcdef".repeat(4);
    const variants: Record<string, unknown>[] = [
      { ...common, schemaVersion: 3, transport: "provider-api", providerContractHash: hash },
      { ...common, schemaVersion: 5, transport: "reviewed-template-api", reviewedTemplateContractHash: hash },
      {
        ...common,
        schemaVersion: 6,
        transport: "portable-provider-plugin",
        portablePluginContract: {
          pluginId: "acme",
          pluginVersion: "1.0.0",
          hostApiVersion: 1,
          bundleSha256: hash,
          manifestSha256: hash,
          adapterId: "acme-web",
          transport: "web-session-api",
          surfaceId: "acme",
          operation: "profiles.read",
          contractVersion: 1,
          descriptorSha256: hash,
        },
      },
      {
        ...common,
        schemaVersion: 7,
        transport: "local-cli",
        localCliContract: {
          surface: "beeper",
          action: "contacts.list",
          version: 1,
          hash,
          tool: {
            schemaVersion: 1,
            id: "beeper-cli",
            implementation: "github.com/beeper/cli",
            versionScheme: "semver",
            version: "0.4.0",
            artifacts: [{ platform: "darwin", arch: "arm64", executableSha256: hash }],
          },
        },
      },
    ];
    for (const variant of variants) {
      const parsed = parseInvokeReadResult({ ...base, receipt: variant });
      expect(parsed.receipt.schemaVersion as number).toBe(variant.schemaVersion as number);
      expect(schemaViolations(schema, { ...base, receipt: variant })).toEqual([]);
    }
  });

  test("rejects drift: mismatched status, retained output, wrong disposition, missing cache, and extra keys", () => {
    const statusDrift = mutable(succeededEnvelope());
    (statusDrift.receipt as { status: string }).status = "failed";
    expect(() => parseInvokeReadResult(statusDrift)).toThrow("result.receipt.status must equal the top-level status");

    const runDrift = mutable(succeededEnvelope());
    (runDrift.receipt as { runId: string }).runId = RUN_ID;
    expect(() => parseInvokeReadResult(runDrift)).toThrow("result.receipt.runId must equal the top-level runId");

    const retainedOutput = { ...failedEnvelope(), output: { leaked: true } };
    expect(() => parseInvokeReadResult(retainedOutput)).toThrow("result.output must be null");

    const wrongDisposition = { ...failedEnvelope(), readFailure: { category: "provider-throttled", retryDisposition: "do-not-retry" } };
    expect(() => parseInvokeReadResult(wrongDisposition)).toThrow("result.readFailure");

    const successWithFailure = { ...succeededEnvelope(), readFailure: readFailureProjection("contract-drift") };
    expect(() => parseInvokeReadResult(successWithFailure)).toThrow("result has an unsupported key readFailure");

    const { cache: _cache, ...withoutCache } = succeededEnvelope();
    expect(() => parseInvokeReadResult(withoutCache)).toThrow("result is missing required key cache");

    const cacheDrift = { ...succeededEnvelope(), cache: { status: "retained", reason: "live-read-failed" } };
    expect(() => parseInvokeReadResult(cacheDrift)).toThrow("result.cache is inconsistent with the receipt status");

    const cachedEnvelope = { ok: true, status: "cached", source: "cache", projection: { key: "x" }, output: {} };
    expect(() => parseInvokeReadResult(cachedEnvelope)).toThrow(ContractParseError);

    const previewEnvelope = { ok: true, status: "preview", requiresConfirmation: false };
    expect(() => parseInvokeReadResult(previewEnvelope)).toThrow(ContractParseError);
  });

  test("every runtime read-failure category has exactly the disposition the runtime assigns", () => {
    expect(readFailureCategories).toHaveLength(8);
    for (const category of readFailureCategories) {
      expect<unknown>(readFailureProjection(category)).toEqual({ category, retryDisposition: readFailureDispositions[category] });
      const parsed = parseInvokeReadResult(failedEnvelope(category));
      if (parsed.status === "failed") expect(parsed.readFailure.retryDisposition).toBe(readFailureDispositions[category]);
    }
  });

  test("round-trips an output with an own __proto__ member (CI seed 455347073, path 3:1:86:86)", () => {
    // The minimized counterexample from Required run 35687468171. JSON.parse
    // makes "__proto__" an own data member; a parser that copies members by
    // assignment would instead write the copy's prototype and drop the key.
    for (const text of ['{"__proto__":0}', '{"__proto__":{"nested":[1]},"b":2}']) {
      const output = JSON.parse(text) as unknown;
      const parsed = parseInvokeReadResult({ ...succeededEnvelope(), output });
      if (parsed.status !== "succeeded") throw new Error("expected a succeeded result");
      expect(parsed.output).toEqual(output);
      expect(Object.hasOwn(parsed.output as object, "__proto__")).toBeTrue();
      expect([Object.prototype, null]).toContain(Object.getPrototypeOf(parsed.output));
      expect(JSON.stringify(parsed.output)).toBe(text);
      expect(parseInvokeReadResult(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    }
  });

  test("the recorded CI coordinate still generates the own __proto__ counterexample", () => {
    // If a fast-check upgrade moves this coordinate, the seed corpus entry no
    // longer replays the failure it records and must be re-derived.
    const generated = fc.sample(fc.jsonValue({ maxDepth: 6 }), { seed: 455347073, path: "3:1:86:86", numRuns: 1 });
    expect(generated).toHaveLength(1);
    expect(JSON.stringify(generated[0])).toBe('{"__proto__":0}');
    expect(Object.hasOwn(generated[0] as object, "__proto__")).toBeTrue();
  });

  test("property: bounded arbitrary outputs round-trip; an unsupported key at any envelope path is rejected", () => {
    assertProperty(fc.property(fc.jsonValue({ maxDepth: 6 }), (generated) => {
      // JSON has no negative zero; compare what a consumer can actually receive.
      const output = JSON.parse(JSON.stringify(generated)) as unknown;
      const envelope = { ...succeededEnvelope(), output };
      const parsed = parseInvokeReadResult(envelope);
      expect(parsed.output).toEqual(output);
      expect(parseInvokeReadResult(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
      expect(schemaViolations(schema, envelope)).toEqual([]);
    }), {}, "contracts-invoke-read/output-round-trip");
    assertProperty(fc.property(fc.boolean(), fc.nat(), (succeeded, seed) => {
      const envelope = succeeded ? succeededEnvelope() : failedEnvelope();
      const paths = objectPaths(envelope).filter((path) => path[0] !== "output");
      const path = paths[seed % paths.length];
      if (path === undefined) throw new Error("no object path");
      const mutated = withExtraKey(envelope, path);
      expect(() => parseInvokeReadResult(mutated)).toThrow("unsupported key __extra");
      expect(schemaViolations(schema, mutated).length).toBeGreaterThan(0);
    }));
  });
});
