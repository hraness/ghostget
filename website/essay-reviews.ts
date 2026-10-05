import type { ArticleHumanReview, ArticleProvenanceRecord, ArticleReview } from "@hraness/design-kit";

/** Independent written-content reviews; indexing policy remains in edge/robots.ts. */
export const essayReviews = {
  "agentic-web-spoofing.html": {
    "drafting": "ai",
    "review": {
      "reviewer": "Codex editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-09-30"
    },
    "humanReview": {
      "reviewer": "Ben Guo",
      "reviewerType": "human-editor",
      "reviewedOn": "2026-10-04"
    },
    "observation": "Explains why a claimed crawler identity is separate from verification; preserves distinctions among self-identification, network-origin checks, and signed requests."
  },
  "vms-cannot-contain-agents.html": {
    "drafting": "ai",
    "review": {
      "reviewer": "Codex editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-09-30"
    },
    "humanReview": {
      "reviewer": "Ben Guo",
      "reviewerType": "human-editor",
      "reviewedOn": "2026-10-04"
    },
    "observation": "Explains VM containment through the resources and credentials crossing the boundary, without promising that isolation alone constrains an agent’s authorized actions."
  },
  "compare-personal-agents-browser-use.html": {
    "drafting": "ai",
    "review": {
      "reviewer": "Codex editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-09-30"
    },
    "humanReview": {
      "reviewer": "Ben Guo",
      "reviewerType": "human-editor",
      "reviewedOn": "2026-10-04"
    },
    "observation": "Makes the decision depend on named action availability versus visual navigation, rather than presenting either interface as universally better."
  },
  "paypal-grapheneos-attestation.html": {
    "drafting": "ai",
    "review": {
      "reviewer": "Codex editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-09-30"
    },
    "humanReview": {
      "reviewer": "Ben Guo",
      "reviewerType": "human-editor",
      "reviewedOn": "2026-10-04"
    },
    "observation": "Separates device-policy signals from a complete security assessment and gives the reader a concrete compatibility troubleshooting path."
  },
  "rumour-is-the-exploit.html": {
    "drafting": "ai",
    "review": {
      "reviewer": "Codex editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-09-30"
    },
    "humanReview": {
      "reviewer": "Ben Guo",
      "reviewerType": "human-editor",
      "reviewedOn": "2026-10-04"
    },
    "observation": "Explains why reproduction must fail on the broken behavior before passing on the fix; approved exact actionable final-paragraph replacement supplied to author."
  },
  "omarchy-root-escalation.html": {
    "drafting": "ai",
    "review": {
      "reviewer": "Codex editorial review (AI)",
      "reviewerType": "ai",
      "reviewedOn": "2026-09-30"
    },
    "humanReview": {
      "reviewer": "Ben Guo",
      "reviewerType": "human-editor",
      "reviewedOn": "2026-10-04"
    },
    "observation": "Distinguishes permission for a named operation from a persistent broad grant and includes revocation/background-service review as part of the decision."
  }
} as const satisfies Readonly<Record<string, ArticleProvenanceRecord & { review: ArticleReview; humanReview: ArticleHumanReview | null; observation: string }>>;
