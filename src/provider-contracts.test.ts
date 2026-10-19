import { describe, expect, test } from "bun:test";

import {
  type OfficialProviderId,
  type OperationInput,
  type ProviderRecipe,
} from "./model";
import {
  officialProviderOperations,
  providerContracts,
} from "./provider-catalog-views";
import type { SemanticOperationName } from "./platform-catalog";
import {
  gmailProviderContractDefinitionsV4,
  providerContractDefinitions,
} from "./provider-contract-definitions";
import {
  contractSemanticIdentity,
} from "./provider-contract-semantic-identity";
import {
  getProviderContract as getProviderContractWithRegistry,
  isCompatibleProviderContractHash as isCompatibleProviderContractHashWithRegistry,
  planProviderDispatches as planProviderDispatchesWithRegistry,
  providerConditionalInputIssues as providerConditionalInputIssuesWithRegistry,
  providerContractHash as providerContractHashWithRegistry,
  type ProviderContract,
} from "./provider-contracts";
import { providerPluginRegistry } from "./provider-plugins";

const getProviderContract = (
  value: Parameters<typeof getProviderContractWithRegistry>[0],
) => getProviderContractWithRegistry(value, providerPluginRegistry);
const providerContractHash = (
  value: Parameters<typeof providerContractHashWithRegistry>[0],
) => providerContractHashWithRegistry(value, providerPluginRegistry);
const isCompatibleProviderContractHash = (
  value: Parameters<typeof isCompatibleProviderContractHashWithRegistry>[0],
  candidate: Parameters<typeof isCompatibleProviderContractHashWithRegistry>[1],
) => isCompatibleProviderContractHashWithRegistry(
  value,
  candidate,
  providerPluginRegistry,
);
const planProviderDispatches = (
  value: Parameters<typeof planProviderDispatchesWithRegistry>[0],
  input: Parameters<typeof planProviderDispatchesWithRegistry>[1],
) => planProviderDispatchesWithRegistry(value, input, providerPluginRegistry);
const providerConditionalInputIssues = (
  value: Parameters<typeof providerConditionalInputIssuesWithRegistry>[0],
  input: Parameters<typeof providerConditionalInputIssuesWithRegistry>[1],
) => providerConditionalInputIssuesWithRegistry(
  value,
  input,
  providerPluginRegistry,
);

function recipe(provider: OfficialProviderId, action: SemanticOperationName, contractVersion = 1): ProviderRecipe {
  return { provider, action, contractVersion, timeoutMs: 30_000, maxOutputBytes: 1024 * 1024 };
}

describe("official provider contract registry", () => {
  test("exhaustively binds every advertised action to one provider, operation, version, and risk", () => {
    for (const provider of ["linkedin"] as const) {
      const contracts = providerContracts[provider] as Readonly<Record<string, ProviderContract>>;
      const advertised = officialProviderOperations[provider];
      if (advertised === undefined) {
        throw new Error(`provider plugin surface ${provider} is not registered`);
      }
      expect(Object.keys(contracts).sort()).toEqual([...advertised].sort());
      for (const [operation, contract] of Object.entries(contracts)) {
        expect(contract).toMatchObject({ provider, operation });
        expect(getProviderContract(recipe(
          provider,
          operation as SemanticOperationName,
          contract.contractVersion,
        ))).toBe(contract);
        expect(contract.requiredScopeSets.length).toBeGreaterThan(0);
        expect(contract.requiredScopeSets.every((set) => set.length > 0 && new Set(set).size === set.length)).toBeTrue();
        expect(contract.coverage.length).toBeGreaterThan(0);
      }
    }
  });

  test("hashes canonical contract semantics deterministically", () => {
    // Writers use the exact predecessor runtime identities produced with
    // NODE_ENV unset. Runtime source closure is verified independently.
    expect(providerContractHash(providerContracts.linkedin["posts.read"]))
      .toBe("9556a8001eaeddf5c29830af38c537f7865609d2692e32939b6e7390a799add9");

    const contracts: readonly ProviderContract[] = [
      ...Object.values(providerContracts.linkedin),
    ];
    const hashes = contracts.map((contract) => providerContractHash(contract));
    expect(hashes.every((hash) => /^[a-f0-9]{64}$/u.test(hash))).toBeTrue();
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  test("keeps Gmail contacts v4 exact while v5 alone owns date metadata", () => {
    const v4 = getProviderContract(recipe("gmail", "contacts.list", 4));
    const v5 = getProviderContract(recipe("gmail", "contacts.list", 5));
    expect(v4).toEqual(gmailProviderContractDefinitionsV4["contacts.list"]);
    expect(v4.input.properties).not.toHaveProperty("include_dates");
    expect(v4.coverage).not.toContain("optional-saved-contact-birthdays");
    expect(v4.implementation).toBe(
      "subject-bound People contacts plus Gmail interactions; saved contacts expand by batchGet; Other contacts retain their limited projection; interactions use one fixed half-open epoch window, list send-as aliases on page one, disable spam/trash, read metadata only, skip drafts/chats and lower-bound overlap, derive direction from SENT, dedupe addresses per message, expose rolling counts and undated lower bounds, emit opaque ID evidence, and never read bodies",
    );
    expect(v5).toBe(providerContracts.gmail["contacts.list"]);
    expect(v5.input.properties.include_dates).toMatchObject({ type: "boolean" });
    expect(providerContractHash(v4)).toBe(
      "1580251063470ed6a0b326fd7dec748fa70ae8d88ed6c1ca7dd275026fb0d078",
    );
    expect(providerContractHash(v5)).toBe(
      "00fd339dc60286f2ebe2d88f34b5f29625cf986e20e862021e6979e3e03d5ae8",
    );
    expect(isCompatibleProviderContractHash(
      v4,
      "1580251063470ed6a0b326fd7dec748fa70ae8d88ed6c1ca7dd275026fb0d078",
    )).toBeTrue();
    expect(providerConditionalInputIssues(
      recipe("gmail", "contacts.list", 4),
      { collection: "contacts", include_dates: false },
    )).toEqual([
      "input.include_dates is available only in contacts.list contract v5",
    ]);
    expect(providerConditionalInputIssues(
      recipe("gmail", "contacts.list", 5),
      { collection: "contacts", include_dates: true },
    )).toEqual([]);
  });

  test("pins both exact Gmail contacts descriptors into semantic identity", () => {
    const v4 = gmailProviderContractDefinitionsV4["contacts.list"];
    const current = Object.values(providerContractDefinitions.gmail);
    expect(contractSemanticIdentity([v4])).toBe(
      "5a259ca50a82f0103b0350dab7f05f683d54608c6c0392cbca2a177b978b1e66",
    );
    expect(contractSemanticIdentity([
      providerContractDefinitions.gmail["contacts.list"],
    ])).toBe(
      "5d3740a2d766fa15ac0f51180a97401b083af0c83c6b68e2118e4cfd992b6f92",
    );
    expect(contractSemanticIdentity([v4, ...current])).toBe(
      "e7cffcefe3dd00f292a0e71cf2fa3f3286b763656b746e44dbb841eed3e61d6d",
    );
  });

  test("accepts exact bounded predecessor hashes only as read aliases", () => {
    expect(isCompatibleProviderContractHash(
      providerContracts.linkedin["posts.read"],
      "9430dad8b4014a2159966c85e230c6659b6da2704c965830a81f892323ad6146",
    )).toBeTrue();
    // Arbitrary predecessor NODE_ENV values are intentionally not wildcarded:
    // retained work from such a mode must be previewed again before execution.
    expect(isCompatibleProviderContractHash(
      providerContracts.linkedin["posts.read"],
      "386355fbf6d512b5e63b94785fa01b1554883d7b6b1ca7b5e2ada31926b6042f",
    )).toBeFalse();
  });

  test("plans zero, one, and exact ordered thread dispatches without provider input drift", () => {
    expect(planProviderDispatches(recipe("linkedin", "comments.create"), {
      actor: "urn:li:person:1",
      target_urn: "urn:li:share:2",
      object_urn: "urn:li:activity:2",
      body: "hello",
    })).toEqual([{ id: "comments-create", description: "Execute linkedin comments.create" }]);
  });
});

describe("provider conditional input laws", () => {
  const conditionalIssues = (
    provider: OfficialProviderId,
    action: SemanticOperationName,
    input: OperationInput,
  ): readonly string[] => providerConditionalInputIssues(recipe(provider, action), input);

  test("makes LinkedIn post lookup modes and post content unions unambiguous", () => {
    expect(conditionalIssues("linkedin", "posts.read", { mode: "one", post_urn: "urn:li:share:1" })).toEqual([]);
    expect(conditionalIssues("linkedin", "posts.read", { mode: "author", author: "urn:li:person:1" })).toEqual([]);
    expect(conditionalIssues("linkedin", "posts.read", { mode: "one" })).toContain("input.post_urn is required when mode is one");
    expect(conditionalIssues("linkedin", "posts.read", {
      mode: "one",
      post_urn: "urn:li:share:1",
      author: "urn:li:person:1",
    })).toContain("input.author is not accepted when mode is one");
    expect(conditionalIssues("linkedin", "posts.read", {
      mode: "author",
      author: "urn:li:person:1",
      post_urn: "urn:li:share:1",
    })).toContain("input.post_urn is not accepted when mode is author");

    expect(conditionalIssues("linkedin", "posts.publish", {
      author: "urn:li:person:1",
      body: "post",
      article_url: "http://example.com/article",
    })).toContain("input.article_url must be a credential-free HTTPS URL");
    expect(conditionalIssues("linkedin", "posts.publish", {
      author: "urn:li:person:1",
      body: "post",
      article_url: "https://example.com/article",
    })).toContain("input.article_title is required with input.article_url");
    expect(conditionalIssues("linkedin", "posts.publish", {
      author: "urn:li:person:1",
      body: "post",
      article_title: "orphaned title",
    })).toContain("input.article_title and input.article_description require input.article_url");
    expect(conditionalIssues("linkedin", "posts.publish", {
      author: "urn:li:person:1",
      body: "post",
      article_url: "https://example.com/article",
      media: [{ kind: "file", reference: "asset:1" }],
    })).toContain("input.media and input.article_url are mutually exclusive");
  });

  test("requires a reaction only for create and forbids a misleading type for clear", () => {
    expect(conditionalIssues("linkedin", "reactions.set", {
      actor: "urn:li:person:1",
      target_urn: "urn:li:share:2",
      enabled: true,
    })).toContain("input.reaction is required when input.enabled is true");
    expect(conditionalIssues("linkedin", "reactions.set", {
      actor: "urn:li:person:1",
      target_urn: "urn:li:share:2",
      reaction: "LIKE",
      enabled: false,
    })).toContain("input.reaction is not accepted when input.enabled is false because the operation clears any current reaction");
    expect(conditionalIssues("linkedin", "reactions.set", {
      actor: "urn:li:person:1",
      target_urn: "urn:li:share:2",
      reaction: "LIKE",
      enabled: true,
    })).toEqual([]);
    expect(conditionalIssues("linkedin", "reactions.set", {
      actor: "urn:li:person:1",
      target_urn: "urn:li:share:2",
      enabled: false,
    })).toEqual([]);
  });
});
