import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canonicalJson,
  parseDiagnosticManifest,
  parseRuntimeManifest,
  sha256,
  type WebSessionRecipe,
} from "./model";
import {
  getWebSessionContract as getWebSessionContractWithRegistry,
  isCompatibleWebSessionContractHash as isCompatibleWebSessionContractHashWithRegistry,
  webSessionContractHash as webSessionContractHashWithRegistry,
} from "./web-session-contracts";
import { providerPluginRegistry } from "./provider-plugins";

const webSessionContractHash = (
  contract: Parameters<typeof webSessionContractHashWithRegistry>[0],
) => webSessionContractHashWithRegistry(contract, providerPluginRegistry);
const isCompatibleWebSessionContractHash = (
  value: Parameters<typeof isCompatibleWebSessionContractHashWithRegistry>[0],
  candidate: Parameters<typeof isCompatibleWebSessionContractHashWithRegistry>[1],
) => isCompatibleWebSessionContractHashWithRegistry(
  value,
  candidate,
  providerPluginRegistry,
);

function contract(
  recipe: Pick<WebSessionRecipe, "site" | "action" | "contractVersion">,
) {
  return getWebSessionContractWithRegistry({
    ...recipe,
    timeoutMs: 60_000,
    maxOutputBytes: 2 * 1024 * 1024,
  }, providerPluginRegistry);
}

describe("authenticated web-session contract identity", () => {
  test("binds executable implementation sources as reviewed hash fixtures", () => {
    const linkedinFeed = contract({ site: "linkedin", action: "feeds.read", contractVersion: 1 });
    const facebookFeed = contract({ site: "facebook", action: "feeds.read", contractVersion: 2 });
    const facebookGroupFeed = contract({
      site: "facebook-group",
      action: "feeds.read",
      contractVersion: 2,
    });
    const marketplaceFeed = contract({
      site: "facebook-marketplace",
      action: "feeds.read",
      contractVersion: 2,
    });
    const marketplaceListing = contract({
      site: "facebook-marketplace",
      action: "listings.read",
      contractVersion: 2,
    });

    // Writers use reviewed durable distribution identities. Runtime source
    // closure is verified independently.
    expect(webSessionContractHash(linkedinFeed)).toBe(
      "58e0f01fdb4dc6345bbdbf9586f5d61db457c8b0825dbbee0c8eb699f6c87f1f",
    );
    expect(webSessionContractHash(facebookFeed)).toBe(
      "e21b1bd88344b3c4980e1d0a87094f69bfa56d5f78ad24c13985c545f838c818",
    );
    expect(webSessionContractHash(facebookGroupFeed)).toBe(
      "a32cf5eebf9f026702eef92eb48d58ad75edf025a49fed727692558375044477",
    );
    expect(webSessionContractHash(marketplaceFeed)).toBe(
      "1f3e08e9bcd2d5c9ff3ff546c534fcdd2d46320e23916d17db73f15243d0e491",
    );
    expect(webSessionContractHash(marketplaceListing)).toBe(
      "36e83d29e6dfb0a3bd550ba4d7e429c1cf295d72c32dbbf33c01d8c34fa2482f",
    );

    for (const value of [
      linkedinFeed,
      facebookFeed,
      facebookGroupFeed,
      marketplaceFeed,
      marketplaceListing,
    ]) {
      expect(webSessionContractHash(value)).not.toBe(sha256(canonicalJson(value)));
    }
  });

  test("accepts exact bounded predecessor hashes only as read aliases", () => {
    const linkedinFeed = contract({ site: "linkedin", action: "feeds.read", contractVersion: 1 });
    const facebookFeed = contract({ site: "facebook", action: "feeds.read", contractVersion: 2 });
    const facebookGroupFeed = contract({
      site: "facebook-group",
      action: "feeds.read",
      contractVersion: 2,
    });
    const marketplaceFeed = contract({
      site: "facebook-marketplace",
      action: "feeds.read",
      contractVersion: 2,
    });
    const marketplaceListing = contract({
      site: "facebook-marketplace",
      action: "listings.read",
      contractVersion: 2,
    });
    const historicalMarketplaceFeed = contract({
      site: "facebook-marketplace",
      action: "feeds.read",
      contractVersion: 1,
    });
    expect(isCompatibleWebSessionContractHash(
      linkedinFeed,
      "ac7a2f9e6c50b84cf51152b57d7d277b80c1a8fb2a87cd74ac5c4742098ea13c",
    )).toBeTrue();
    expect(isCompatibleWebSessionContractHash(
      facebookFeed,
      "208db74b57370fb1e5014cd65ac3f4df317a889147609f473524c11a7bd25b0a",
    )).toBeTrue();
    expect(isCompatibleWebSessionContractHash(
      facebookGroupFeed,
      "c4278bec1e4c44f60a99214a0a9662296345a6f9973ad332114da387f9bb4eaa",
    )).toBeTrue();
    expect(isCompatibleWebSessionContractHash(
      marketplaceFeed,
      "a9cad660c87a3bd8b112d9032560e93895ff26d7ae990b828dd580eb7a22d63e",
    )).toBeTrue();
    expect(isCompatibleWebSessionContractHash(
      marketplaceListing,
      "1541620ea7a56f072901d676fefbb24f55ce2fd63726c8c8ceeef7043d0deec6",
    )).toBeTrue();
    expect(isCompatibleWebSessionContractHash(
      historicalMarketplaceFeed,
      "c6a59efe3cd132112a3c4516007f0224e51af9f7288219b124c4820551ae89c7",
    )).toBeTrue();
    expect(isCompatibleWebSessionContractHash(
      marketplaceFeed,
      "2200d78efc2489cf7d00105e91f05691aaa75528d3f2ff49607b905eaf32df65",
    )).toBeTrue();
    expect(isCompatibleWebSessionContractHash(
      linkedinFeed,
      "f".repeat(64),
    )).toBeFalse();
  });

  test("keeps distinct contracts distinct even when they share one implementation bundle", () => {
    const feed = contract({ site: "linkedin", action: "feeds.read", contractVersion: 1 });
    const profile = contract({ site: "linkedin", action: "profiles.read", contractVersion: 1 });
    expect(webSessionContractHash(feed)).not.toBe(webSessionContractHash(profile));
  });

  test("preserves the exact durable identity of installed historical routes", () => {
    const historical = contract({
      site: "facebook-marketplace",
      action: "feeds.read",
      contractVersion: 1,
    });
    const active = contract({
      site: "facebook-marketplace",
      action: "feeds.read",
      contractVersion: 2,
    });
    expect(historical.contractVersion).toBe(1);
    expect(active.contractVersion).toBe(2);
    expect(webSessionContractHash(historical)).not.toBe(webSessionContractHash(active));

    const historicalMarketplaceFeed = contract({
      site: "facebook-marketplace",
      action: "feeds.read",
      contractVersion: 1,
    });
    expect(webSessionContractHash(historicalMarketplaceFeed)).toBe(
      "7f3729ec9f44079d8f34be1844f1979f25dc4b544c77558239d31fd00d269006",
    );
    expect(() => contract({
      site: "facebook-marketplace",
      action: "feeds.read",
      contractVersion: 3,
    })).toThrow("is not installed");

    const historicalLinkedInArticleDraft = contract({
      site: "linkedin",
      action: "articles.draft.save",
      contractVersion: 2,
    });
    const activeLinkedInArticleDraft = contract({
      site: "linkedin",
      action: "articles.draft.save",
      contractVersion: 7,
    });
    expect(historicalLinkedInArticleDraft.input.required).toEqual(["title", "document"]);
    expect(historicalLinkedInArticleDraft.input.properties.inline_images).toBeUndefined();
    expect(activeLinkedInArticleDraft.input.required).toEqual([
      "title",
      "document",
      "inline_images",
    ]);
    expect(activeLinkedInArticleDraft.input.properties.cover_image).toMatchObject({
      type: "file",
      maxBytes: 5 * 1024 * 1024,
    });
    expect(webSessionContractHash(historicalLinkedInArticleDraft)).not.toBe(
      webSessionContractHash(activeLinkedInArticleDraft),
    );
    expect(() => contract({
      site: "linkedin",
      action: "articles.draft.save",
      contractVersion: 3,
    })).toThrow("is not installed");
  });

  test("keeps uninstalled contracts diagnostic-only instead of projecting current semantics", () => {
    const archived = JSON.parse(readFileSync(join(
      import.meta.dir,
      "assets",
      "adapters",
      "linkedin",
      "wrench-web-adapter.json",
    ), "utf8")) as {
      version: string;
      operations: Record<string, { webSession: { contractVersion: number } }>;
    };
    archived.version = "0.9.0";
    archived.operations["feeds.read"]!.webSession.contractVersion = 999;
    expect(parseDiagnosticManifest(archived, providerPluginRegistry).ok).toBeTrue();
    expect(parseRuntimeManifest(archived, providerPluginRegistry)).toEqual({
      ok: false,
      issues: ["authenticated web contract linkedin/feeds.read@999 is not installed"],
    });
  });

  test("observes bounded LinkedIn profile reads while keeping unrelated discovery inert", () => {
    for (const action of [
      "messaging.list",
      "relationships.recommendations.read",
    ] as const) {
      expect(contract({ site: "linkedin", action, contractVersion: 1 })).toMatchObject({
        site: "linkedin",
        operation: action,
        risk: "R1",
        state: "capture-required",
        dispatch: "none",
        sideEffect: "none",
        idempotency: "none",
      });
    }

    for (const action of ["profiles.read", "organizations.read"] as const) {
      expect(contract({ site: "linkedin", action, contractVersion: 1 })).toMatchObject({
        site: "linkedin",
        operation: action,
        risk: "R1",
        state: "observed",
        dispatch: "none",
        sideEffect: "none",
        idempotency: "none",
      });
    }

    expect(contract({
      site: "linkedin",
      action: "relationships.connect",
      contractVersion: 1,
    })).toMatchObject({
      site: "linkedin",
      operation: "relationships.connect",
      risk: "R3",
      state: "capture-required",
      dispatch: "single",
      idempotency: "local-at-most-once",
      dedupeWindowMs: 86_400_000,
    });
  });

  test("observes exact Meta and Substack profile-stat reads", () => {
    for (const site of ["instagram", "threads"] as const) {
      expect(contract({ site, action: "profiles.read", contractVersion: 1 })).toMatchObject({
        site,
        operation: "profiles.read",
        risk: "R1",
        state: "observed",
        dispatch: "none",
        sideEffect: "none",
        idempotency: "none",
      });
    }

    for (const action of ["profiles.read", "organizations.read"] as const) {
      expect(contract({ site: "substack", action, contractVersion: 1 })).toMatchObject({
        site: "substack",
        operation: action,
        risk: "R1",
        state: "observed",
        dispatch: "none",
        sideEffect: "none",
        idempotency: "none",
      });
    }
  });

  test("observes exact public GitHub profile and organization statistic reads", () => {
    for (const action of ["profiles.read", "organizations.read"] as const) {
      expect(contract({ site: "github", action, contractVersion: 1 })).toMatchObject({
        site: "github",
        operation: action,
        risk: "R1",
        state: "observed",
        dispatch: "none",
        sideEffect: "none",
        idempotency: "none",
      });
    }
    const github = providerPluginRegistry.requireSessionRoute("github");
    expect(providerPluginRegistry.legacyContractImplementationHashes(
      github,
      "profiles.read",
      1,
    )
      .map((value) => value.toString("hex"))).toEqual([
      "2764fb3c746755b2453279b5a6672f1460a139717c45e83520dfa5d9f753025a",
      "a27e177eb3f874d46ad8ad29d71bc5a1b17b98fb966725a54e9b741f24c7bf9b",
    ]);
    expect(providerPluginRegistry.legacyContractImplementationHashes(
      github,
      "organizations.read",
      1,
    ).map((value) => value.toString("hex"))).toEqual([
      "2764fb3c746755b2453279b5a6672f1460a139717c45e83520dfa5d9f753025a",
    ]);
  });

  test("observes only the exact Twitch self-profile follower read", () => {
    expect(contract({
      site: "twitch",
      action: "profiles.read",
      contractVersion: 1,
    })).toMatchObject({
      site: "twitch",
      operation: "profiles.read",
      risk: "R1",
      state: "observed",
      dispatch: "none",
      sideEffect: "none",
      idempotency: "none",
      input: {
        properties: {
          profile: { type: "string", minLength: 4, maxLength: 25 },
        },
        required: ["profile"],
      },
    });
    const twitch = providerPluginRegistry.requireSessionRoute("twitch");
    expect(twitch.operations.map((operation) => operation.name)).toEqual([
      "profiles.read",
    ]);
    expect(providerPluginRegistry.legacyContractImplementationHashes(
      twitch,
      "profiles.read",
      1,
    ).map((value) => value.toString("hex"))).toEqual([
      "325065c463ecf8d7b5e6202780c0392c1f7556baeb4a0b33fec1d3af937e5eb9",
    ]);
  });

  test("keeps every Marketplace mutation capture-required", () => {
    const binding = providerPluginRegistry.requireSessionRoute(
      "facebook-marketplace",
    );
    for (const operation of binding.operations) {
      const value = contract({
        site: "facebook-marketplace",
        action: operation.name,
        contractVersion: operation.contractVersion,
      });
      if (value.sideEffect === "none") continue;
      expect(value.risk === "R2" || value.risk === "R3" || value.risk === "R4")
        .toBeTrue();
      expect(value.state).toBe("capture-required");
      expect(value.implementation).toContain(
        "requires a fresh reviewed authenticated first-party contract before execution",
      );
    }
  });
});
