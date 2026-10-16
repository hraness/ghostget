import { describe, expect, test } from "bun:test";

import { canonicalJson, sha256 } from "../../canonical-json";
import { contractSemanticIdentity } from "../../provider-contract-semantic-identity";
import { reviewedBuiltInContractIdentity } from "../../provider-plugin-contract-identity";
import { webSessionContractDefinitions } from "../../web-session-contract-definitions";
import { xWebPlugin } from "./plugin";

const binding = xWebPlugin.bindings[0];
if (binding?.transport !== "web-session-api") {
  throw new Error("X web-session binding is unavailable");
}

describe("X web provider plugin", () => {
  test("versions the rich workspace source closure independently", () => {
    expect(xWebPlugin.version).toBe("1.7.0");
  });

  test("pins the reviewed distribution to its version and current contract semantics", () => {
    // Reproducible reviewed identity, independent of source layout and runtime
    // closure. Keep the exact canonical preimage stable for this distribution.
    const preimage = canonicalJson({
      schemaVersion: 1,
      kind: "ghostget-reviewed-built-in-contract-distribution",
      pluginId: "x-web",
      pluginVersion: "1.7.0",
      semanticSha256: contractSemanticIdentity(Object.values(webSessionContractDefinitions.x)),
    });
    expect(sha256(preimage)).toBe("802de506e8b20f6423510683da933f1b0c9e0cef762a7cb35fd3f49248d73397");
    expect(reviewedBuiltInContractIdentity("x-web", "1.7.0").implementationSha256).toBe(sha256(preimage));
  });

  test("retains old feed contracts beside new dedicated repost and Story reads", () => {
    expect(binding.operations.filter(operation => operation.name === "feeds.read")
      .map(operation => operation.contractVersion)).toEqual([1, 2, 3]);
    expect(binding.operations.filter(operation => operation.name === "explore.read")
      .map(operation => operation.contractVersion)).toEqual([1, 2]);
  });

  test("keeps the generic Article reservation inert beside the exact private-draft read", () => {
    const reads = binding.operations.filter((operation) =>
      operation.name === "articles.read");
    expect(reads.map((operation) => operation.contractVersion)).toEqual([1, 2]);
    const current = reads.find((operation) => operation.contractVersion === 2);
    const archived = reads.find((operation) => operation.contractVersion === 1);
    expect(current).toMatchObject({
      contractVersion: 2,
      risk: "R1",
      state: "observed",
      dispatch: "none",
      input: {
        properties: {
          article_id: { type: "string", minLength: 1, maxLength: 19 },
        },
        required: ["article_id"],
      },
    });
    expect(archived).toMatchObject({
      contractVersion: 1,
      risk: "R1",
      state: "capture-required",
      dispatch: "none",
    });
  });

  test("advertises the observed exact handle-bound profile read", () => {
    const profile = binding.operations.find((operation) =>
      operation.name === "profiles.read");
    expect(profile).toMatchObject({
      contractVersion: 1,
      risk: "R1",
      state: "observed",
      dispatch: "none",
      input: {
        properties: {
          handle: { type: "string", minLength: 1, maxLength: 15 },
        },
        required: ["handle"],
      },
    });
  });

  test("declares exact accepted-target reconciliation for current post publishing", () => {
    const publish = binding.operations.filter((operation) =>
      operation.name === "posts.publish");
    expect(publish.map((operation) => operation.contractVersion)).toEqual([2, 3, 4, 5, 6]);
    const current = publish.find((operation) => operation.contractVersion === 5);
    expect(current).toMatchObject({
      contractVersion: 5,
      risk: "R3",
      state: "observed",
      dispatch: "single",
      reconciliation: {
        kind: "provider-accepted-target-presence",
      },
    });
    expect(current?.historicalContractVersions).toBeUndefined();
    expect(current?.input.properties.media).toMatchObject({
      mediaTypes: ["image/png", "video/mp4"],
    });
    expect(current?.input.properties.body).toMatchObject({
      minLength: 1,
      maxLength: 25_000,
    });
    expect(binding.reconcile).toBeFunction();
  });

  test("keeps ordered-media publishing reserved beside the observed scalar contract", () => {
    const publish = binding.operations.filter((operation) =>
      operation.name === "posts.publish");
    const reserved = publish.find((operation) => operation.contractVersion === 6);
    expect(reserved).toMatchObject({
      contractVersion: 6,
      risk: "R3",
      state: "capture-required",
    });
    expect(reserved?.input.properties.media).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "file", mediaTypes: ["image/png", "image/jpeg", "video/mp4"] },
    });
    expect(publish.filter((operation) => operation.state === "observed")
      .map((operation) => operation.contractVersion)).toEqual([2, 3, 4, 5]);
  });

  test("keeps PNG-only posts.publish recovery distinct from current MP4 admission", () => {
    const publish = binding.operations.filter((operation) =>
      operation.name === "posts.publish");
    const archivedV2 = publish.find((operation) => operation.contractVersion === 2);
    const archivedV3 = publish.find((operation) => operation.contractVersion === 3);
    const archivedV4 = publish.find((operation) => operation.contractVersion === 4);
    expect(archivedV2).toMatchObject({
      contractVersion: 2,
      risk: "R3",
      state: "observed",
      dispatch: "single",
      reconciliation: {
        kind: "provider-accepted-target-presence",
      },
    });
    expect(archivedV3).toMatchObject({
      contractVersion: 3,
      risk: "R3",
      state: "observed",
      dispatch: "single",
      reconciliation: {
        kind: "provider-accepted-target-presence",
      },
    });
    expect(archivedV2?.input.properties.media).toMatchObject({
      mediaTypes: ["image/png"],
    });
    expect(archivedV3?.input.properties.media).toMatchObject({
      mediaTypes: ["image/png"],
    });
    expect(archivedV4).toMatchObject({
      contractVersion: 4,
      risk: "R3",
      state: "observed",
      dispatch: "single",
      reconciliation: {
        kind: "provider-accepted-target-presence",
      },
    });
    expect(archivedV4?.input.properties.body).toMatchObject({
      minLength: 1,
      maxLength: 280,
    });
    expect(archivedV4?.input.properties.media).toMatchObject({
      mediaTypes: ["image/png", "video/mp4"],
    });
    expect(archivedV2?.historicalContractVersions).toBeUndefined();
    expect(archivedV3?.historicalContractVersions).toBeUndefined();
    expect(archivedV4?.historicalContractVersions).toBeUndefined();
  });

  test("keeps thread items and replies on the short-item 280 bound", () => {
    const threads = binding.operations.find((operation) =>
      operation.name === "threads.publish");
    const replies = binding.operations.find((operation) =>
      operation.name === "replies.create");
    expect(threads).toMatchObject({
      contractVersion: 1,
      state: "capture-required",
    });
    expect(threads?.input.properties.items).toMatchObject({
      items: { minLength: 1, maxLength: 280 },
    });
    expect(replies).toMatchObject({
      contractVersion: 1,
      state: "observed",
      reconciliation: { kind: "provider-accepted-target-presence" },
    });
    expect(replies?.input.properties.body).toMatchObject({
      minLength: 1,
      maxLength: 280,
    });
  });
});
