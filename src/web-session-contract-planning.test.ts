import { describe, expect, test } from "bun:test";

import { canonicalJson } from "./canonical-json";
import { linkedinWebPlugin } from "./plugins/linkedin-web/plugin";
import { webSessionContractDefinitions } from "./web-session-contract-definitions";
import { planWebSessionContractDispatches } from "./web-session-contract-planning";

describe("authenticated web contract planning", () => {
  test("requires Article adapters to own their bounded dispatch schedules", () => {
    const contract = webSessionContractDefinitions.linkedin["articles.draft.save"];
    expect(contract).toMatchObject({ contractVersion: 7, dispatch: "bounded-items", risk: "R2" });
    expect(() => planWebSessionContractDispatches(contract, {
      title: "Harnessing Puerto Rico",
      document: "{}",
    })).toThrow("provider-owned bounded dispatch planner");
  });

  test("the LinkedIn plugin plans one cover plus bounded inline images while retaining text-only recovery", () => {
    const contract = webSessionContractDefinitions.linkedin["articles.draft.save"];
    expect(contract).toMatchObject({
      contractVersion: 7,
      dispatch: "bounded-items",
      risk: "R2",
      state: "observed",
    });
    const operation = linkedinWebPlugin.bindings[0]?.operations.find((candidate) =>
      candidate.name === "articles.draft.save" && candidate.contractVersion === 7);
    expect(operation).toBeDefined();
    const cover_image = { kind: "file" as const, reference: "cover" };
    expect(operation!.planDispatches({
      title: "New private draft",
      document: "{}",
      cover_image,
      inline_images: [{ kind: "file" as const, reference: "one" }],
    }).map((dispatch) => dispatch.id)).toEqual([
      "articles.create",
      "articles.cover",
      "articles.image[1]",
      "articles.content",
    ]);
    expect(operation!.planDispatches({
      title: "Existing private draft",
      document: "{}",
      draft_id: "7000000000000000001",
      inline_images: [
        { kind: "file" as const, reference: "one" },
        { kind: "file" as const, reference: "two" },
      ],
    }).map((dispatch) => dispatch.id)).toEqual([
      "articles.image[1]",
      "articles.image[2]",
      "articles.replace",
    ]);
    expect(operation!.planDispatches({
      title: "Existing private draft",
      document: "{}",
      draft_id: "7000000000000000001",
      cover_image,
      inline_images: [
        { kind: "file" as const, reference: "one" },
        { kind: "file" as const, reference: "two" },
      ],
    }).map((dispatch) => dispatch.id)).toEqual([
      "articles.cover",
      "articles.image[1]",
      "articles.image[2]",
      "articles.replace",
    ]);
    const supported = canonicalJson({
      schemaVersion: 2,
      blocks: [
        { type: "paragraph", text: "Native link" },
        { type: "image", imageIndex: 0, altText: "A descriptive fixture" },
      ],
    });
    const inline_images = [{ kind: "file" as const, reference: "one" }];
    expect(operation!.validateInput({
      title: "Private",
      document: supported,
      cover_image,
      inline_images,
    })).toEqual([]);
    const unsupported = canonicalJson({
      schemaVersion: 2,
      blocks: [
        { type: "ordered-list-item", text: "Not captured" },
        { type: "image", imageIndex: 0, altText: "A descriptive fixture" },
      ],
    });
    expect(operation!.validateInput({
      title: "Private",
      document: unsupported,
      cover_image,
      inline_images,
    })).toContain(
      "LinkedIn Article drafts currently support only paragraph, heading1, heading2, and blockquote blocks",
    );
    expect(operation!.reconciliation).toBeUndefined();
    expect(operation!.validateInput({
      title: "Missing alt",
      document: canonicalJson({
        schemaVersion: 2,
        blocks: [
          { type: "paragraph", text: "Body" },
          { type: "image", imageIndex: 0 },
        ],
      }),
      cover_image,
      inline_images,
    })).toContain("LinkedIn Article inline images require descriptive altText");

    const historical = linkedinWebPlugin.bindings[0]?.operations.find((candidate) =>
      candidate.name === "articles.draft.save" && candidate.contractVersion === 2);
    expect(historical).toBeDefined();
    const historicalDocument = canonicalJson({
      schemaVersion: 1,
      blocks: [{ type: "paragraph", text: "Text-only recovery" }],
    });
    const historicalReconciliation = historical!.reconciliation;
    if (historicalReconciliation?.kind !== "boolean-desired-state") {
      throw new Error("expected boolean historical LinkedIn reconciliation");
    }
    expect(historicalReconciliation.desiredState({
      title: "Existing private draft",
      document: historicalDocument,
      draft_id: "7000000000000000001",
    })).toBeTrue();
  });
});
