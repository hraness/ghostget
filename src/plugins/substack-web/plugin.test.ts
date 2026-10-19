import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalJsonWithDefinedMembers } from "../../canonical-json";
import { contractSemanticIdentity } from "../../provider-contract-semantic-identity";
import { reviewedBuiltInContractIdentity } from "../../provider-plugin-contract-identity";
import { providerPluginRegistry } from "../../provider-plugins";
import { webSessionContractDefinitions } from "../../web-session-contract-definitions";
import { getWebSessionContract, isCompatibleWebSessionContractHash } from "../../web-session-contracts";

import { substackWebPlugin } from "./plugin";

const binding = substackWebPlugin.bindings[0];
if (binding?.transport !== "web-session-api") {
  throw new Error("Substack web-session binding is unavailable");
}

describe("Substack web provider plugin", () => {
  test("keeps each original subscriber reservation separate from its v2 route", () => {
    expect(substackWebPlugin.version).toBe("1.7.0");
    for (const [name, risk, currentState] of [
      ["subscribers.export", "R1", "observed"],
      ["subscribers.import", "R3", "observed"],
      ["subscribers.import.status", "R1", "observed"],
    ] as const) {
      const routes = binding.operations.filter((operation) => operation.name === name);
      expect(routes.map((operation) => operation.contractVersion).sort()).toEqual([1, 2]);
      const current = routes.find((operation) => operation.contractVersion === 2);
      const archived = routes.find((operation) => operation.contractVersion === 1);
      expect(current).toMatchObject({ risk, state: currentState });
      expect(archived).toMatchObject({ risk, state: "capture-required" });
      for (const operation of routes) expect(operation).not.toHaveProperty("historicalContractVersions");
      expect(current?.input.properties.publication).toMatchObject({ type: "string", minLength: 1, maxLength: 63 });
      expect(archived?.input.properties).not.toHaveProperty("publication");
    }
    const exports = binding.operations.filter((operation) => operation.name === "subscribers.export");
    const current = exports.find((operation) => operation.contractVersion === 2);
    const archived = exports.find((operation) => operation.contractVersion === 1);
    expect(current?.input.required).toEqual(["publication", "limit"]);
    expect(current?.input.properties.limit).toMatchObject({ minimum: 1, maximum: 100 });
    expect(current?.input.properties.cursor).toMatchObject({ maxLength: 32768 });
    expect(archived?.input.properties.limit).toMatchObject({ minimum: 1, maximum: 500 });
    expect(archived?.input.properties.cursor).toMatchObject({ maxLength: 64 });
    const imports = binding.operations.filter((operation) => operation.name === "subscribers.import");
    expect(imports.find((operation) => operation.contractVersion === 2)?.input).toMatchObject({
      required: ["publication", "emails", "send_welcome_email"],
      properties: { emails: { minItems: 1, maxItems: 1 } },
    });
    expect(imports.find((operation) => operation.contractVersion === 1)?.input.properties.emails)
      .toMatchObject({ maxItems: 25 });
    const statuses = binding.operations.filter((operation) => operation.name === "subscribers.import.status");
    expect(statuses.find((operation) => operation.contractVersion === 2)?.input.required).toEqual(["publication"]);
    expect(statuses.find((operation) => operation.contractVersion === 1)?.input.properties).toEqual({});
  });

  test("derives the v1.7 durable writer identity from the reviewed v1.11 adapter and semantics", () => {
    const adapterBytes = readFileSync(new URL("../../assets/adapters/substack/wrench-web-adapter.json", import.meta.url));
    const contracts = webSessionContractDefinitions.substack;
    if (contracts === undefined) throw new Error("Substack contracts unavailable");
    const derived = createHash("sha256").update(JSON.stringify({
      format: "wrench.reviewed-built-in-contract-identity",
      schemaVersion: 1,
      pluginId: "substack-web",
      pluginVersion: "1.7.0",
      adapterId: "substack-web",
      adapterVersion: "1.11.0",
      adapterSha256: createHash("sha256").update(adapterBytes).digest("hex"),
      contractSemanticSha256: contractSemanticIdentity(Object.values(contracts)),
    })).digest("hex");
    expect(reviewedBuiltInContractIdentity("substack-web", "1.7.0").implementationSha256).toBe(derived);
    expect(createHash("sha256").update(readFileSync(new URL(
      "../../assets/adapters/substack/wrench-web-adapter.v1.8.0.json", import.meta.url,
    ))).digest("hex")).toBe("93719a86fbab8a832d203fe05fc8446d26b09e46add2d566439a27eba957be8c");
    // The retained v1.9 snapshot still derives the 1.5.0 identity it shipped with.
    expect(createHash("sha256").update(JSON.stringify({
      format: "wrench.reviewed-built-in-contract-identity",
      schemaVersion: 1,
      pluginId: "substack-web",
      pluginVersion: "1.5.0",
      adapterId: "substack-web",
      adapterVersion: "1.9.0",
      adapterSha256: createHash("sha256").update(readFileSync(new URL(
        "../../assets/adapters/substack/wrench-web-adapter.v1.9.0.json", import.meta.url,
      ))).digest("hex"),
      contractSemanticSha256: "bff781c7c4c908e8d5ec8639c20420f8756ee4d05ce786431cf56a98675e5533",
    })).digest("hex")).toBe("7e12bbfffb9629b9195b98fc42394d6c5163ae3e2efa8063a1086ff1cc3dde1b");
  });

  test("accepts predecessor receipts only on their exact historical routes", () => {
    const registered = providerPluginRegistry.requireRoute("web-session-api", "substack");
    const originalExport = getWebSessionContract({
      site: "substack", action: "subscribers.export", contractVersion: 1,
      timeoutMs: 60_000, maxOutputBytes: 8 * 1024 * 1024,
    }, providerPluginRegistry);
    const originalReceipt = createHash("sha256")
      .update(canonicalJsonWithDefinedMembers(originalExport, "original export reservation"))
      .update("\0")
      .update(Buffer.from("58438f60cf9b2d2db9363cb7dece0c6ca56e60c2178fe4bcbd60c844fc8893ba", "hex"))
      .digest("hex");
    expect(originalReceipt).toBe("f0a20609b1d0a0c902b52bdb99483a4115a1f2ad61c40d797e45e92f803bc796");
    const identity = reviewedBuiltInContractIdentity("substack-web", "1.7.0");
    const predecessors = identity.legacyDistributionReadImplementationSha256 ?? [];
    expect(predecessors).toHaveLength(13);
    expect(predecessors[0]?.implementationSha256).toBe("1ff335a9f8d2f4d071dfa0c197bd2fcf7d5c59884e815db230a357891e02080f");
    const subscriberV2 = new Set(["subscribers.export", "subscribers.import", "subscribers.import.status"]);
    for (const distribution of predecessors) {
      for (const operation of registered.operations) {
        for (const contractVersion of operation.contractVersions) {
          const contract = getWebSessionContract({
            site: "substack", action: operation.name, contractVersion,
            timeoutMs: 60_000, maxOutputBytes: 8 * 1024 * 1024,
          }, providerPluginRegistry);
          const priorHash = createHash("sha256")
            .update(canonicalJsonWithDefinedMembers(contract, "test Substack receipt"))
            .update("\0")
            .update(Buffer.from(distribution.implementationSha256, "hex"))
            .digest("hex");
          const isNewRoute = subscriberV2.has(operation.name) && contractVersion === 2;
          expect(isCompatibleWebSessionContractHash(contract, priorHash, providerPluginRegistry)).toBe(!isNewRoute);
        }
      }
    }
    for (const name of subscriberV2) {
      expect(providerPluginRegistry.legacyContractImplementationHashes(registered, name as "subscribers.export", 2)).toEqual([]);
    }
  });

  test("declares exact accepted-target reconciliation for current Note publishing", () => {
    const publish = binding.operations.find((operation) =>
      operation.name === "posts.publish");
    expect(publish).toMatchObject({
      contractVersion: 3,
      risk: "R3",
      state: "observed",
      dispatch: "single",
      historicalContractVersions: [2],
      reconciliation: {
        kind: "provider-accepted-target-presence",
      },
    });
    for (const name of ["comments.create", "replies.create"] as const) {
      const operation = binding.operations.find((candidate) => candidate.name === name);
      expect(operation).toMatchObject({
        contractVersion: 1,
        risk: "R3",
        state: "observed",
        dispatch: "single",
        reconciliation: {
          kind: "provider-accepted-target-presence",
        },
      });
    }
    expect(binding.reconcile).toBeFunction();
  });

  test("graduates exact MP4 Note publication and personal-Note deletion", () => {
    const video = binding.operations.find((candidate) => candidate.name === "media.publish");
    expect(video).toMatchObject({
      contractVersion: 1,
      risk: "R3",
      state: "observed",
      dispatch: "single",
      reconciliation: {
        kind: "provider-accepted-target-presence",
      },
    });
    const deletion = binding.operations.find((candidate) => candidate.name === "content.delete");
    expect(deletion).toMatchObject({
        contractVersion: 1,
        risk: "R3",
        state: "observed",
        dispatch: "single",
        reconciliation: { kind: "boolean-desired-state" },
      });
    expect(deletion?.planDispatches({
      expected_body: "temporary",
      note_id: 404,
    })).toEqual([{
      id: "content.delete",
      description: "Dispatch one reviewed content.delete internal API action",
    }]);
    expect(deletion?.reconciliation?.kind === "boolean-desired-state"
      ? deletion.reconciliation.desiredState({})
      : null).toBeFalse();
    expect(binding.operations.find((operation) => operation.name === "media.publish")
      ?.input.properties.media).toMatchObject({
        maxBytes: 128 * 1024 * 1024,
        mediaTypes: ["video/mp4"],
        type: "file",
      });
    expect(binding.operations.find((operation) => operation.name === "articles.publish")
      ?.input.properties.media).toMatchObject({ maxBytes: 512 * 1024 * 1024 });
  });
});
