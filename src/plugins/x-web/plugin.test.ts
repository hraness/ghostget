import { describe, expect, test } from "bun:test";

import { canonicalJson, sha256 } from "../../canonical-json";
import { contractSemanticIdentity } from "../../provider-contract-semantic-identity";
import { reviewedBuiltInContractIdentity } from "../../provider-plugin-contract-identity";
import { webSessionContractDefinitions } from "../../web-session-contract-definitions";
import { xWebPlugin } from "./plugin";
import archivedStoryManifest from "../../assets/adapters/x/wrench-web-adapter.v1.20.0.json";

const binding = xWebPlugin.bindings[0];
if (binding?.transport !== "web-session-api") {
  throw new Error("X web-session binding is unavailable");
}

describe("X web provider plugin", () => {
  test("versions the rich workspace source closure independently", () => {
    expect(xWebPlugin.version).toBe("1.8.0");
  });

  test("exposes all four qualified write successors at their exact versions", () => {
    for (const [name, contractVersion] of [
      ["posts.publish", 7], ["posts.quote", 3], ["posts.repost", 2], ["relationships.follow.set", 2],
    ] as const) {
      expect(webSessionContractDefinitions.x[name]).toMatchObject({ contractVersion, state: "observed" });
      expect(binding.operations.filter(operation => operation.name === name && operation.contractVersion === contractVersion))
        .toMatchObject([{ contractVersion, state: "observed" }]);
    }
  });

  test("pins the reviewed distribution to its version and current contract semantics", () => {
    // Reproducible reviewed identity, independent of source layout and runtime
    // closure. Keep the exact canonical preimage stable for this distribution.
    const preimage = canonicalJson({
      schemaVersion: 1,
      kind: "ghostget-reviewed-built-in-contract-distribution",
      pluginId: "x-web",
      pluginVersion: "1.8.0",
      semanticSha256: contractSemanticIdentity(Object.values(webSessionContractDefinitions.x)),
    });
    expect(sha256(preimage)).toBe("70a348f10812ddd64a2863b629de3eb511e77d8df67b1310117077f2a61fba5b");
    expect(reviewedBuiltInContractIdentity("x-web", "1.8.0").implementationSha256).toBe(sha256(preimage));
  });

  test("retains old feed contracts beside new dedicated repost and Story reads", () => {
    expect(binding.operations.filter(operation => operation.name === "feeds.read")
      .map(operation => operation.contractVersion)).toEqual([1, 2, 3]);
    expect(binding.operations.filter(operation => operation.name === "explore.read")
      .map(operation => operation.contractVersion)).toEqual([1, 2]);
  });

  for (const [name, predecessorVersion, successorVersion, risk, implementation] of [
    ["posts.quote", 2, 3, "R3", "CreateTweet quote needs an authorized live fixture and reviewed transaction-header behavior; quote text uses the same reviewed 25000-unit CreateTweet bound as posts.publish"],
    ["posts.repost", 1, 2, "R3", "repost desired-state mutation needs an authorized live fixture and reviewed transaction-header behavior"],
    ["relationships.follow.set", 1, 2, "R2", "fixed numeric-target desired-state follow/unfollow request and independent readback require qualification"],
  ] as const) test(`retains the exact shipped ${name}@${predecessorVersion} reservation across successor activation`, () => {
    const shipped = archivedStoryManifest.operations[name];
    const current = webSessionContractDefinitions.x[name];
    expect(shipped.webSession.contractVersion).toBe(predecessorVersion);
    expect([predecessorVersion, successorVersion].some(version => version === current.contractVersion)).toBeTrue();
    const declarations = binding.operations.filter(operation => operation.name === name);
    expect(declarations.filter(operation => operation.contractVersion === predecessorVersion)).toHaveLength(1);
    const predecessor = declarations.find(operation => operation.contractVersion === predecessorVersion);
    expect(predecessor).toMatchObject({
      risk, state: "capture-required", dispatch: "single", implementation,
      input: shipped.input, sideEffect: shipped.sideEffect,
      idempotency: shipped.idempotency, dedupeWindowMs: shipped.dedupeWindowMs,
    });
    expect(predecessor?.reconciliation).toBeUndefined();
    expect(predecessor?.historicalContractVersions).toBeUndefined();
    if (current.contractVersion === predecessorVersion) {
      expect(declarations.some(operation => operation.contractVersion === successorVersion)).toBeFalse();
    } else {
      const successor = declarations.find(operation => operation.contractVersion === successorVersion);
      expect(declarations.filter(operation => operation.contractVersion === successorVersion)).toHaveLength(1);
      expect(successor).toMatchObject({ risk, state: "observed", dispatch: "single", reconciliation: {
        kind: name === "posts.quote" ? "provider-accepted-target-presence" : "boolean-desired-state",
      } });
      const reconciliation = successor?.reconciliation;
      if (reconciliation?.kind === "boolean-desired-state") {
        const stateKey = name === "posts.repost" ? "reposted" : "following";
        for (const desired of [false, true]) expect(reconciliation.desiredState({ [stateKey]: desired })).toBe(desired);
        expect(() => reconciliation.desiredState({ [stateKey]: "true" })).toThrow("boolean");
      }
    }
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
    expect(publish.map((operation) => operation.contractVersion)).toEqual([2, 3, 4, 5, 6, 7]);
    const current = publish.find((operation) => operation.contractVersion === 7);
    expect(current).toMatchObject({
      contractVersion: 7,
      risk: "R3",
      state: "observed",
      dispatch: "single",
      reconciliation: {
        kind: "provider-accepted-target-presence",
      },
    });
    expect(current?.historicalContractVersions).toBeUndefined();
    expect(current?.input.properties.media).toMatchObject({
      type: "array", minItems: 1, maxItems: 4,
      items: { type: "file", mediaTypes: ["image/png", "image/jpeg", "video/mp4"] },
    });
    expect(current?.input.properties.body).toMatchObject({
      minLength: 1,
      maxLength: 25_000,
    });
    expect(binding.reconcile).toBeFunction();
  });

  const unreadableSyntheticAuth = {
    schemaVersion: 1 as const,
    id: "synthetic-reconciliation-only",
    kind: "cookies-file" as const,
    path: "/ghostget-nonexistent-synthetic-auth/never-read.json",
    subject: "123",
  };
  const acceptedTarget = (identifier: string, operation = "posts.publish") => ({
    schemaVersion: 1 as const,
    kind: "provider-accepted-target-presence" as const,
    dispatch: { id: operation, index: 1, planned: 1 },
    target: { schemaVersion: 1 as const, identifier },
  });

  // Exercise the real lazy hook, not only its target-format helper. Each case
  // must stop at input validation before the deliberately nonexistent auth path.
  test("lazy publish reconciliation selects the v7 ordered reader for text-only accepted targets before auth", async () => {
    await expect(binding.reconcile!("posts.publish", {}, unreadableSyntheticAuth,
      acceptedTarget(canonicalJson({ postId: "123", mediaIds: [] }))))
      .rejects.toThrow("input.body must be a bounded string");
  });

  test("lazy publish reconciliation v7 ordered reader refuses legacy scalar media before auth", async () => {
    await expect(binding.reconcile!("posts.publish", {
      body: "Synthetic ordered recovery", media: { kind: "file", reference: "synthetic" }, media_type: "image/png",
    }, unreadableSyntheticAuth, acceptedTarget(canonicalJson({ postId: "123", mediaIds: ["456", "789"] }))))
      .rejects.toThrow("X array media requires media_types, not legacy media_type");
  });

  test("lazy publish reconciliation preserves scalar predecessor target parsing before auth", async () => {
    await expect(binding.reconcile!("posts.publish", {}, unreadableSyntheticAuth,
      acceptedTarget(canonicalJson({ postId: "123", mediaId: null }))))
      .rejects.toThrow("input.body must be a bounded string");
  });

  test("lazy quote reconciliation requires exact accepted text-only target evidence before auth", async () => {
    await expect(binding.reconcile!("posts.quote", {}, unreadableSyntheticAuth))
      .rejects.toThrow("provider plugin reconciliation context must be a plain data object");
    await expect(binding.reconcile!("posts.quote", { body: "Exact quote", post_id: "123" }, unreadableSyntheticAuth,
      acceptedTarget(canonicalJson({ postId: "456", mediaId: "789" }), "posts.quote")))
      .rejects.toThrow("text-only accepted target");
    await expect(binding.reconcile!("posts.quote", { body: "Exact quote", post_id: "123", media_type: "image/png" }, unreadableSyntheticAuth,
      acceptedTarget(canonicalJson({ postId: "456", mediaId: null }), "posts.quote")))
      .rejects.toThrow("requires only body and post_id");
  });

  test("lazy follow and repost reconciliation reject malformed desired state before auth", async () => {
    await expect(binding.reconcile!("relationships.follow.set", { user_id: "123", following: "true" }, unreadableSyntheticAuth))
      .rejects.toThrow("X follow input requires only user_id and following");
    await expect(binding.reconcile!("posts.repost", { post_id: "123", reposted: "true" }, unreadableSyntheticAuth))
      .rejects.toThrow("X repost input requires only post_id and reposted");
  });

  test("retains the ordered-media reservation beside its qualified successor and scalar predecessor", () => {
    const publish = binding.operations.filter((operation) =>
      operation.name === "posts.publish");
    const reserved = publish.find((operation) => operation.contractVersion === 6);
    expect(reserved).toMatchObject({
      contractVersion: 6,
      risk: "R3",
      state: "capture-required",
    });
    expect(publish.find(operation => operation.contractVersion === 7)?.state).toBe("observed");
    expect(publish.find(operation => operation.contractVersion === 5)?.input.properties.media)
      .toMatchObject({ type: "file", mediaTypes: ["image/png", "video/mp4"] });
    expect(reserved?.input.properties.media).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "file", mediaTypes: ["image/png", "image/jpeg", "video/mp4"] },
    });
    expect(publish.filter((operation) => operation.state === "observed")
      .map((operation) => operation.contractVersion)).toEqual([2, 3, 4, 5, 7]);
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
