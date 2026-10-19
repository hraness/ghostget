import type {
  IdempotencyKind,
  InputSchema,
  OfficialProviderId,
  OperationInput,
  OperationRisk,
  ProviderRecipe,
} from "./model";
import type { ProviderPluginOperationName } from "./provider-plugin-identifiers";
import type { ProviderPluginContractStateV1 } from "./provider-plugin";

/** Provider-owned bounded coverage label; the kernel does not close this set. */
export type ProviderCoverage = string;

export type ProviderContract = {
  readonly provider: OfficialProviderId;
  readonly operation: ProviderPluginOperationName;
  readonly contractVersion: number;
  readonly risk: OperationRisk;
  readonly sideEffect: string;
  readonly idempotency: IdempotencyKind;
  readonly dedupeWindowMs: number;
  readonly input: InputSchema;
  readonly state: ProviderPluginContractStateV1;
  /** Any one complete set authorizes the base operation. */
  readonly requiredScopeSets: readonly (readonly string[])[];
  readonly dispatch: "none" | "single" | "thread-items";
  readonly coverage: readonly ProviderCoverage[];
  /** Fixed endpoint families and semantic caveats bound into confirmation plans. */
  readonly implementation: string;
};

type ProviderContractDefinition = Omit<
  ProviderContract,
  "sideEffect" | "idempotency" | "dedupeWindowMs" | "state"
>;

const string = (
  description: string,
  options: {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly enum?: readonly string[];
  } = {},
) => ({ type: "string", description, ...options }) as const;

const number = (
  description: string,
  minimum: number,
  maximum: number,
) => ({ type: "number", description, minimum, maximum }) as const;

const boolean = (description: string, allowed?: readonly boolean[]) => ({
  type: "boolean",
  description,
  ...(allowed === undefined ? {} : { enum: allowed }),
}) as const;

const file = (
  description: string,
  maxBytes: number,
  mediaTypes: readonly string[],
) => ({ type: "file", description, maxBytes, mediaTypes }) as const;

const array = <T extends ReturnType<typeof string> | ReturnType<typeof number> | ReturnType<typeof file>>(
  description: string,
  items: T,
  minItems: number,
  maxItems: number,
) => ({ type: "array", description, items, minItems, maxItems }) as const;

const linkedinDefinitions = {
  "contacts.list": {
    provider: "linkedin",
    operation: "contacts.list",
    contractVersion: 1,
    risk: "R1",
    input: {
      properties: {
        start: number("Zero-based first-degree connection offset; defaults to 0", 0, 100_000),
        count: number("Bounded first-degree connection count; defaults to 10", 1, 50),
      },
      required: [],
    },
    requiredScopeSets: [["r_1st_connections", "r_liteprofile"]],
    dispatch: "none",
    coverage: [
      "first-degree-connections",
      "authenticated-viewer-binding",
      "connection-localized-names",
      "locale-selection-evidence",
      "connection-set-total",
      "offset-paging",
      "unavailable-message-statistics",
    ],
    implementation: "pre-network scope and person-URN validation, then subject-bound GET /v2/me?projection=(id) and an exact byte comparison between the authenticated person URN and OAuth locator before GET /v2/connections?q=viewer&projection=(elements(*(to~)),paging); exact offset-page, decorated person identity, locale-selection evidence, and total-count validation; restricted r_1st_connections and r_liteprofile approval required; no inbox or web fallback; message statistics are explicitly unavailable",
  },
  "posts.read": {
    provider: "linkedin",
    operation: "posts.read",
    contractVersion: 1,
    risk: "R1",
    input: {
      properties: {
        mode: string("Read one post or list posts by one author", { enum: ["one", "author"] }),
        post_urn: string("Exact LinkedIn share or UGC Post URN", { minLength: 1, maxLength: 500 }),
        author: string("Exact person or organization author URN", { minLength: 1, maxLength: 500 }),
        start: number("Zero-based author-list offset", 0, 100_000),
        count: number("Bounded result count", 1, 100),
        sort: string("Author-list ordering", { enum: ["LAST_MODIFIED", "CREATED"] }),
        view: string("Reader-visible or author-visible representation", { enum: ["READER", "AUTHOR"] }),
      },
      required: ["mode"],
    },
    requiredScopeSets: [["r_member_social"], ["r_organization_social"]],
    dispatch: "none",
    coverage: ["post", "author-posts"],
    implementation: "GET /rest/posts/{urn}; FINDER /rest/posts?q=author; LinkedIn-Version 202606; no home-feed reconstruction",
  },
  "posts.publish": {
    provider: "linkedin",
    operation: "posts.publish",
    contractVersion: 1,
    risk: "R3",
    input: {
      properties: {
        author: string("Exact authenticated person or administered organization URN", { minLength: 1, maxLength: 500 }),
        body: string("Exact post commentary", { minLength: 1, maxLength: 3_000 }),
        visibility: string("Post visibility", { enum: ["PUBLIC", "CONNECTIONS"] }),
        media: array(
          "Images, or one video/document",
          file("One reviewed post attachment; video must be MP4 and at least 75,000 bytes, with duration and codec validated by LinkedIn processing", 500 * 1024 * 1024, [
            "image/jpeg",
            "image/png",
            "image/gif",
            "video/mp4",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ]),
          1,
          20,
        ),
        media_title: string("Required title for a document; optional video title", { minLength: 1, maxLength: 200 }),
        alt_text: string("Optional image alternative text", { minLength: 1, maxLength: 4_000 }),
        article_url: string("Optional exact HTTPS source for an external article-card post", { minLength: 1, maxLength: 8_192 }),
        article_title: string("Optional external article-card title", { minLength: 1, maxLength: 399 }),
        article_description: string("Optional external article-card description", { minLength: 1, maxLength: 4_000 }),
      },
      required: ["author", "body"],
    },
    requiredScopeSets: [["w_member_social"], ["w_organization_social"]],
    dispatch: "single",
    coverage: ["write-result"],
    implementation: "initialize fixed LinkedIn image/document/video upload; upload bytes without OAuth on signed video parts; poll assets to AVAILABLE with actor-specific read scope; finalize video; POST /rest/posts; external article cards require explicit source/title and omit thumbnail; no URL scraping",
  },
  "posts.repost": {
    provider: "linkedin",
    operation: "posts.repost",
    contractVersion: 1,
    risk: "R3",
    input: {
      properties: {
        author: string("Exact authenticated person or administered organization URN", { minLength: 1, maxLength: 500 }),
        target_urn: string("Exact LinkedIn share or UGC Post URN to reshare", { minLength: 1, maxLength: 500 }),
        body: string("Exact reshare commentary", { minLength: 1, maxLength: 3_000 }),
        visibility: string("Reshare visibility", { enum: ["PUBLIC", "CONNECTIONS"] }),
      },
      required: ["author", "target_urn", "body"],
    },
    requiredScopeSets: [["w_member_social"], ["w_organization_social"]],
    dispatch: "single",
    coverage: ["write-result"],
    implementation: "POST /rest/posts with exact reshareContext.parent; main-feed distribution; actor- and subject-bound",
  },
  "comments.read": {
    provider: "linkedin",
    operation: "comments.read",
    contractVersion: 1,
    risk: "R1",
    input: {
      properties: {
        target_urn: string("Exact post or composite parent-comment URN", { minLength: 1, maxLength: 1_000 }),
        start: number("Zero-based comment offset", 0, 100_000),
        count: number("Bounded comment count", 1, 100),
      },
      required: ["target_urn"],
    },
    requiredScopeSets: [["r_member_social_feed"], ["r_organization_social_feed"]],
    dispatch: "none",
    coverage: ["comments"],
    implementation: "GET /rest/socialActions/{target}/comments; one level per request; explicit parent query for replies",
  },
  "comments.create": {
    provider: "linkedin",
    operation: "comments.create",
    contractVersion: 1,
    risk: "R3",
    input: {
      properties: {
        actor: string("Exact authenticated person or administered organization URN", { minLength: 1, maxLength: 500 }),
        target_urn: string("Exact post URN used in the endpoint path", { minLength: 1, maxLength: 1_000 }),
        object_urn: string("Exact root activity/object URN required by LinkedIn", { minLength: 1, maxLength: 1_000 }),
        body: string("Exact comment text", { minLength: 1, maxLength: 500 }),
      },
      required: ["actor", "target_urn", "object_urn", "body"],
    },
    requiredScopeSets: [["w_member_social_feed"], ["w_organization_social_feed"]],
    dispatch: "single",
    coverage: ["write-result"],
    implementation: "POST /rest/socialActions/{post}/comments with explicit actor and object URNs; text only",
  },
  "replies.create": {
    provider: "linkedin",
    operation: "replies.create",
    contractVersion: 1,
    risk: "R3",
    input: {
      properties: {
        actor: string("Exact authenticated person or administered organization URN", { minLength: 1, maxLength: 500 }),
        parent_comment_urn: string("Exact composite parent-comment URN", { minLength: 1, maxLength: 1_000 }),
        object_urn: string("Exact root post/object URN", { minLength: 1, maxLength: 1_000 }),
        body: string("Exact reply text", { minLength: 1, maxLength: 500 }),
      },
      required: ["actor", "parent_comment_urn", "object_urn", "body"],
    },
    requiredScopeSets: [["w_member_social_feed"], ["w_organization_social_feed"]],
    dispatch: "single",
    coverage: ["write-result"],
    implementation: "POST /rest/socialActions/{parent-comment}/comments with explicit parentComment and object; text only",
  },
  "reactions.set": {
    provider: "linkedin",
    operation: "reactions.set",
    contractVersion: 1,
    risk: "R2",
    input: {
      properties: {
        actor: string("Exact authenticated person or administered organization URN", { minLength: 1, maxLength: 500 }),
        target_urn: string("Exact post or comment URN", { minLength: 1, maxLength: 1_000 }),
        reaction: string("Required reaction type when enabled is true; omitted when false", { enum: ["LIKE", "PRAISE", "EMPATHY", "INTEREST", "APPRECIATION", "ENTERTAINMENT"] }),
        enabled: boolean("Create the named reaction when true; clear any current actor reaction when false"),
      },
      required: ["actor", "target_urn", "enabled"],
    },
    requiredScopeSets: [["w_member_social_feed"], ["w_organization_social_feed"]],
    dispatch: "single",
    coverage: ["write-result"],
    implementation: "POST /rest/reactions?actor=... for a named reaction; DELETE composite reaction key clears any current actor reaction",
  },
} as const satisfies Readonly<Record<string, ProviderContractDefinition>>;

const gmailDefinitions = {
  "contacts.list": {
    provider: "gmail",
    operation: "contacts.list",
    contractVersion: 5,
    risk: "R1",
    input: {
      properties: {
        collection: string("Google contact projection; defaults to saved contacts", { enum: ["contacts", "other-contacts", "interactions"] }),
        after: string("Optional inclusive whole-second UTC lower bound for incremental interactions", { minLength: 24, maxLength: 24 }),
        before: string("Fixed whole-second UTC cutoff required only for the interactions projection", { minLength: 24, maxLength: 24 }),
        cursor: string("Opaque Google People or Gmail API next-page token", { minLength: 1, maxLength: 4_096 }),
        include_dates: boolean("Include selected saved-contact display, given, middle, family, prefix, and suffix name fields, birthdays, and contact events; defaults to false and is unavailable for Other contacts"),
        include_stats: boolean("Compute bounded sent and received Gmail statistics; defaults to true"),
        limit: number("Bounded page count; defaults to 20 for contacts and 100 for interactions", 1, 100),
        stats_scan_limit: number("Maximum messages scanned per contact and direction when include_stats is true; defaults to 100; limit multiplied by this value cannot exceed 2000", 1, 2_000),
      },
      required: [],
    },
    requiredScopeSets: [
      [
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/contacts.other.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      [
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/contacts.other.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
      ],
      [
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/contacts.other.readonly",
        "https://mail.google.com/",
      ],
      [
        "https://www.googleapis.com/auth/contacts",
        "https://www.googleapis.com/auth/contacts.other.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      [
        "https://www.googleapis.com/auth/contacts",
        "https://www.googleapis.com/auth/contacts.other.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
      ],
      [
        "https://www.googleapis.com/auth/contacts",
        "https://www.googleapis.com/auth/contacts.other.readonly",
        "https://mail.google.com/",
      ],
    ],
    dispatch: "none",
    coverage: [
      "contacts",
      "other-contacts",
      "contact-metadata",
      "contact-email-addresses",
      "optional-saved-contact-name-components",
      "optional-saved-contact-birthdays",
      "optional-saved-contact-events",
      "optional-sent-counts",
      "optional-received-counts",
      "optional-last-sent-at",
      "optional-last-received-at",
      "bounded-stat-completeness",
      "messages-in-fixed-half-open-window",
      "spam-and-trash-excluded",
      "draft-and-chat-excluded",
      "sent-and-received-message-counts",
      "first-and-last-interaction-times",
      "30-90-365-day-counts",
      "per-direction-completeness",
      "opaque-pagination-evidence",
      "send-as-alias-exclusion",
    ],
    implementation: "subject-bound People contacts and Gmail interactions; saved contacts optionally batchGet selected display, given, middle, family, prefix, and suffix fields, birthdays, and events; Other contacts stay limited; interactions use a fixed half-open epoch window, list send-as aliases on page one, exclude spam/trash/drafts/chats, read metadata only, derive direction from SENT, dedupe addresses per message, expose rolling counts and explicit lower bounds, emit opaque ID evidence, and never read bodies",
  },
  "messaging.list": {
    provider: "gmail",
    operation: "messaging.list",
    contractVersion: 1,
    risk: "R1",
    input: {
      properties: {
        view: string("List the inbox or execute one explicit Gmail search", { enum: ["inbox", "search"] }),
        query: string("Exact Gmail search expression; required only for search", { minLength: 1, maxLength: 512 }),
        cursor: string("Opaque Gmail next-page token", { minLength: 1, maxLength: 4_096 }),
        limit: number("Bounded thread count", 1, 100),
        include_spam_trash: boolean("Include matching spam and trash threads for search"),
      },
      required: ["view"],
    },
    requiredScopeSets: [
      ["https://www.googleapis.com/auth/gmail.readonly"],
      ["https://www.googleapis.com/auth/gmail.modify"],
      ["https://mail.google.com/"],
    ],
    dispatch: "none",
    coverage: ["inbox-threads", "search-threads", "thread-metadata", "thread-urls", "replayable-read-input"],
    implementation: "subject-bound GET Gmail /gmail/v1/users/me/threads with fixed INBOX selection or one bounded query, followed by bounded metadata reads that emit exact thread URLs and messaging.read input; no modify, acknowledgement, or read-receipt request",
  },
  "messaging.read": {
    provider: "gmail",
    operation: "messaging.read",
    contractVersion: 1,
    risk: "R1",
    input: {
      properties: {
        thread_id: string("Exact Gmail thread ID", { minLength: 1, maxLength: 256 }),
      },
      required: ["thread_id"],
    },
    requiredScopeSets: [
      ["https://www.googleapis.com/auth/gmail.readonly"],
      ["https://www.googleapis.com/auth/gmail.modify"],
      ["https://mail.google.com/"],
    ],
    dispatch: "none",
    coverage: ["thread", "message-metadata", "render-safe-bodies", "attachment-metadata", "thread-url"],
    implementation: "subject-bound GET Gmail /gmail/v1/users/me/threads/{thread} with exact response identity, bounded MIME projection, stable part identities, attachment metadata, and an exact Gmail thread URL; no modify, acknowledgement, or read-receipt request",
  },
} as const satisfies Readonly<Record<string, ProviderContractDefinition>>;

const gmailContactsListV4Definition = {
  provider: "gmail",
  operation: "contacts.list",
  contractVersion: 4,
  risk: "R1",
  input: {
    properties: {
      collection: string("Google contact projection; defaults to saved contacts", { enum: ["contacts", "other-contacts", "interactions"] }),
      after: string("Optional inclusive whole-second UTC lower bound for incremental interactions", { minLength: 24, maxLength: 24 }),
      before: string("Fixed whole-second UTC cutoff required only for the interactions projection", { minLength: 24, maxLength: 24 }),
      cursor: string("Opaque Google People or Gmail API next-page token", { minLength: 1, maxLength: 4_096 }),
      include_stats: boolean("Compute bounded sent and received Gmail statistics; defaults to true"),
      limit: number("Bounded page count; defaults to 20 for contacts and 100 for interactions", 1, 100),
      stats_scan_limit: number("Maximum messages scanned per contact and direction when include_stats is true; defaults to 100; limit multiplied by this value cannot exceed 2000", 1, 2_000),
    },
    required: [],
  },
  requiredScopeSets: [
    [
      "https://www.googleapis.com/auth/contacts.readonly",
      "https://www.googleapis.com/auth/contacts.other.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    [
      "https://www.googleapis.com/auth/contacts.readonly",
      "https://www.googleapis.com/auth/contacts.other.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    [
      "https://www.googleapis.com/auth/contacts.readonly",
      "https://www.googleapis.com/auth/contacts.other.readonly",
      "https://mail.google.com/",
    ],
    [
      "https://www.googleapis.com/auth/contacts",
      "https://www.googleapis.com/auth/contacts.other.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    [
      "https://www.googleapis.com/auth/contacts",
      "https://www.googleapis.com/auth/contacts.other.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    [
      "https://www.googleapis.com/auth/contacts",
      "https://www.googleapis.com/auth/contacts.other.readonly",
      "https://mail.google.com/",
    ],
  ],
  dispatch: "none",
  coverage: [
    "contacts",
    "other-contacts",
    "contact-metadata",
    "contact-email-addresses",
    "optional-sent-counts",
    "optional-received-counts",
    "optional-last-sent-at",
    "optional-last-received-at",
    "bounded-stat-completeness",
    "messages-in-fixed-half-open-window",
    "spam-and-trash-excluded",
    "draft-and-chat-excluded",
    "sent-and-received-message-counts",
    "first-and-last-interaction-times",
    "30-90-365-day-counts",
    "per-direction-completeness",
    "opaque-pagination-evidence",
    "send-as-alias-exclusion",
  ],
  implementation: "subject-bound People contacts plus Gmail interactions; saved contacts expand by batchGet; Other contacts retain their limited projection; interactions use one fixed half-open epoch window, list send-as aliases on page one, disable spam/trash, read metadata only, skip drafts/chats and lower-bound overlap, derive direction from SENT, dedupe addresses per message, expose rolling counts and undated lower bounds, emit opaque ID evidence, and never read bodies",
} as const satisfies ProviderContractDefinition;

type BoundProviderContracts<
  Definitions extends Readonly<Record<string, ProviderContractDefinition>>,
> = {
  readonly [Operation in keyof Definitions]: Definitions[Operation] & Pick<
    ProviderContract,
    "sideEffect" | "idempotency" | "dedupeWindowMs" | "state"
  >;
};

function bindProviderSemantics<
  Definitions extends Readonly<Record<string, ProviderContractDefinition>>,
>(definitions: Definitions): BoundProviderContracts<Definitions> {
  return Object.fromEntries(Object.entries(definitions).map(([operation, definition]) => {
    const mutating = definition.risk === "R2" || definition.risk === "R3";
    return [operation, Object.freeze({
      ...definition,
      sideEffect: mutating
        ? `Mutates ${definition.provider} through the exact confirmed ${definition.operation} official API contract.`
        : "none",
      idempotency: mutating ? "local-at-most-once" : "none",
      dedupeWindowMs: mutating ? 86_400_000 : 0,
      state: "observed",
    })];
  })) as BoundProviderContracts<Definitions>;
}

const linkedin = bindProviderSemantics(linkedinDefinitions);
const gmail = bindProviderSemantics(gmailDefinitions);
const gmailContactsListV4 = bindProviderSemantics({
  "contacts.list": gmailContactsListV4Definition,
})["contacts.list"];

export const providerContractDefinitions = { gmail, linkedin } as const;
export const gmailProviderContractDefinitionsV4 = Object.freeze({
  ...gmail,
  "contacts.list": gmailContactsListV4,
});

export { planProviderContractDispatches } from "./provider-contract-planning";

export function providerContractConditionalInputIssues(
  recipe: Pick<ProviderRecipe, "provider" | "action">,
  input: OperationInput,
): readonly string[] {
  const issues: string[] = [];
  if (recipe.provider === "linkedin" && recipe.action === "posts.read") {
    if (input.mode === "one") {
      if (typeof input.post_urn !== "string") issues.push("input.post_urn is required when mode is one");
      if (input.author !== undefined) issues.push("input.author is not accepted when mode is one");
    }
    if (input.mode === "author") {
      if (typeof input.author !== "string") issues.push("input.author is required when mode is author");
      if (input.post_urn !== undefined) issues.push("input.post_urn is not accepted when mode is author");
    }
  }
  if (recipe.provider === "linkedin" && recipe.action === "posts.publish") {
    const media = input.media;
    if (Array.isArray(media) && typeof input.article_url === "string") issues.push("input.media and input.article_url are mutually exclusive");
    if (typeof input.article_url === "string") {
      try {
        const url = new URL(input.article_url);
        if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
          issues.push("input.article_url must be a credential-free HTTPS URL");
        }
      } catch {
        issues.push("input.article_url must be a credential-free HTTPS URL");
      }
      if (typeof input.article_title !== "string") issues.push("input.article_title is required with input.article_url");
    } else if (input.article_title !== undefined || input.article_description !== undefined) {
      issues.push("input.article_title and input.article_description require input.article_url");
    }
    if (input.alt_text !== undefined && !Array.isArray(media)) issues.push("input.alt_text requires input.media");
    if (input.media_title !== undefined && !Array.isArray(media)) issues.push("input.media_title requires input.media");
  }
  if (recipe.provider === "linkedin" && recipe.action === "reactions.set") {
    if (input.enabled === true && typeof input.reaction !== "string") {
      issues.push("input.reaction is required when input.enabled is true");
    }
    if (input.enabled === false && input.reaction !== undefined) {
      issues.push("input.reaction is not accepted when input.enabled is false because the operation clears any current reaction");
    }
  }
  return issues;
}
