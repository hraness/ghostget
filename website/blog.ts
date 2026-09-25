/**
 * The Ghostget blog at /blog/.
 *
 * Every post carries an admission record (`ArticleAdmission` from
 * `@hraness/design-kit`). The record decides where the post may appear: an
 * `indexable` post enters the blog index, sitemap, Atom feed, llms.txt, and
 * the Markdown twin surface; any other lifecycle renders a readable page with
 * `noindex` and stays out of every discovery surface. The visible provenance
 * note is rendered from the same record, so it always names the recorded
 * reviewer and never calls an AI review human.
 */
import {
  articleProvenanceFromAdmission,
  assertArticleAdmissions,
  escapeArticleHtml,
  renderArticleHtml,
  renderArticleIndexHtml,
  renderArticleRelatedHtml,
  renderArticleSourcesHtml,
  type ArticleAdmission,
  type ArticleAuthor,
  type ArticleIsoDate,
  type ArticleSourceItem,
} from "@hraness/design-kit";
import { relatedFor, type PortfolioRelatedItem } from "@hraness/design-kit/portfolio";
import {
  articleJsonLd,
  blogJsonLd,
  createAtomFeed,
  createBlogSitemapPaths,
  createFeedEntry,
  type ArticleDiscovery,
  type ArticleParty,
  type SearchSite,
  type SitemapPath,
} from "@hraness/web-discovery";

export const BLOG_PATH = "/blog/" as const;
export const BLOG_FEED_PATH = "/blog/feed.xml" as const;
export const BLOG_TITLE = "Ghostget blog" as const;
export const BLOG_DESCRIPTION =
  "Posts about how Ghostget works, how its releases and tests are checked, and which products use it." as const;
/** The Portfolio product id Ghostget still carries in the registry. */
export const GHOSTGET_PORTFOLIO_ID = "wrench" as const;

const EVIDENCE_COMMIT = "76a79fc" as const;
const GHOSTGET_BLOB = `https://github.com/hraness/ghostget/blob/${EVIDENCE_COMMIT}` as const;

export const BLOG_AUTHOR: ArticleAuthor = { kind: "organization", name: "Hraness" };
const BLOG_PARTY: ArticleParty = { kind: "Organization", name: "Hraness" };
const AI_REVIEWER = "Claude Opus 5.5 (claude-opus-5-5) editorial review" as const;
const REVIEWED_ON: ArticleIsoDate = "2026-09-24";
const REASSESS_ON: ArticleIsoDate = "2026-11-05";
const OWNER = "Hraness, maintainers of hraness/ghostget" as const;

export type BlogPost = Readonly<{
  slug: string;
  title: string;
  dek: string;
  eyebrow: string;
  published: ArticleIsoDate;
  updated?: ArticleIsoDate;
  keywords: readonly string[];
  /** The body fragment in website/source/blog/, converted from the reviewed Markdown draft. */
  bodyFile: string;
  /** Sources shown on the page. The admission record keeps the reviewed evidence list. */
  sources: readonly ArticleSourceItem[];
  admission: ArticleAdmission;
}>;

export function blogPostPath(slug: string): `/blog/${string}/` {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new RangeError(`Invalid blog slug: ${slug}`);
  return `/blog/${slug}/`;
}

function ghostgetSource(title: string, path: string): ArticleSourceItem {
  return { title, href: `${GHOSTGET_BLOB}/${path}`, publisher: "GitHub", checkedOn: REVIEWED_ON };
}

function webSource(title: string, href: string, publisher?: string): ArticleSourceItem {
  return publisher === undefined
    ? { title, href, checkedOn: REVIEWED_ON }
    : { title, href, publisher, checkedOn: REVIEWED_ON };
}

function sourceRecords(sources: readonly ArticleSourceItem[]): ArticleAdmission["sources"] {
  return sources.map((source) => ({ title: source.title, url: source.href, checkedOn: source.checkedOn }));
}

function review(): NonNullable<ArticleAdmission["review"]> {
  return { reviewer: AI_REVIEWER, reviewerType: "ai", reviewedOn: REVIEWED_ON };
}

const introducingSources = [
  ghostgetSource("Ghostget README", "README.md"),
  ghostgetSource("Ghostget assurance case, rendered from the claims register", "docs/assurance.md"),
  ghostgetSource("Ghostget claims register", "verification/claims.json"),
  ghostgetSource("Beeper message bundle export", "src/beeper-message-bundle-v1.ts"),
  ghostgetSource("Ghostget website maintainer rules", "website/AGENTS.md"),
  webSource("Ghostget supported services and actions", "https://ghostget.com/docs/reference/provider-capabilities/", "Ghostget"),
  webSource("Ghostget getting-started guide", "https://ghostget.com/docs/tutorials/getting-started/", "Ghostget"),
] as const satisfies readonly ArticleSourceItem[];

const builtOnSources = [
  ghostgetSource("Ghostget's Beeper bundle writer, built on Textbutler's bundle format", "src/beeper-message-bundle-v1.ts"),
  ghostgetSource("Ghostget README: Beeper and WhatsApp export commands, recorded limits, and truncation", "README.md"),
  ghostgetSource("Ghostget website rule: describe other products only as the registry or their README records", "website/AGENTS.md"),
  webSource("Textbutler bundle format v1 (Beeper)", "https://github.com/hraness/textbutler/blob/0f83a82/docs/local-message-bundle-v1.md", "GitHub"),
] as const satisfies readonly ArticleSourceItem[];

const claimsRegisterSources = [
  ghostgetSource("Ghostget claims register", "verification/claims.json"),
  ghostgetSource("Ghostget assurance case, rendered from the register", "docs/assurance.md"),
  ghostgetSource("Allow-once approval model", "verification/quint/approvals.qnt"),
  ghostgetSource("Confirmed-write fence model (at-most-once and no-retry invariants)", "verification/quint/fence.qnt"),
  ghostgetSource("Formal verification plan, defect D13 (allow-once enforced by the client)", "kb/plans/formal-verification-assurance.md"),
  ghostgetSource("Ghostget website maintainer rules", "website/AGENTS.md"),
] as const satisfies readonly ArticleSourceItem[];

const releaseSources = [
  ghostgetSource("Ghostget release workflow", ".github/workflows/release.yml"),
  ghostgetSource("Ghostget publishing notes", "docs/publishing.md"),
  ghostgetSource("ghostget.com production release verifier", "website/production-release-verifier.ts"),
  ghostgetSource("Claims register: release rerun and npm recovery entries", "verification/claims.json"),
  ghostgetSource("Quint model of a release run and its attempts", "verification/quint/release.qnt"),
  webSource("Ghostget Latest GitHub Release", "https://github.com/hraness/ghostget/releases/latest", "GitHub"),
  webSource("GitHub CLI: gh attestation verify", "https://cli.github.com/manual/gh_attestation_verify", "GitHub"),
] as const satisfies readonly ArticleSourceItem[];

const propertyTestSources = [
  ghostgetSource("Ghostget property test helpers (replay coordinates, seed corpus, soak multiplier)", "src/test-support.ts"),
  ghostgetSource("Ghostget claims register (property, stateful-model, and differential layers)", "verification/claims.json"),
  ghostgetSource("Ghostget property seed corpus", "verification/seeds/corpus.json"),
  ghostgetSource("Named regression and coordinate pin for the __proto__ counterexample", "src/contracts-invoke-read.test.ts"),
  webSource("Commit adding the __proto__ regression (#341)", "https://github.com/hraness/ghostget/commit/aa8cce0", "GitHub"),
  ghostgetSource("Crash-schedule command-sequence tests", "src/state-crash-harness.test.ts"),
  ghostgetSource("Differential tests against the Rust oracles, with planted defects", "scripts/verification-oracles.test.ts"),
  ghostgetSource("Independent oracles README (RFC 8785 canonicalizer and url-crate policy)", "verification/oracles/README.md"),
  ghostgetSource("Contributor guide: replaying one property", "CONTRIBUTING.md"),
  ghostgetSource("Nightly verification workflow (soak multiplier default)", ".github/workflows/verification-nightly.yml"),
  webSource("RFC 8785: JSON Canonicalization Scheme", "https://www.rfc-editor.org/rfc/rfc8785", "RFC Editor"),
  webSource("WHATWG URL Standard", "https://url.spec.whatwg.org/", "WHATWG"),
  webSource("Rust url crate 2.5.8", "https://docs.rs/url/2.5.8/url/", "docs.rs"),
  webSource("fast-check model-based testing", "https://fast-check.dev/docs/advanced/model-based-testing/", "fast-check"),
] as const satisfies readonly ArticleSourceItem[];

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: "introducing-ghostget",
    title: "Introducing Ghostget",
    dek: "Ghostget lets your AI agent work in your own accounts through named, reviewed actions, without handing it your passwords, tokens, or a signed-in browser.",
    eyebrow: "Introducing",
    published: "2026-09-24",
    keywords: ["ghostget", "agents", "accounts", "previews", "verification", "claims register"],
    bodyFile: "introducing-ghostget.html",
    sources: introducingSources,
    admission: {
      href: "/blog/introducing-ghostget/",
      lifecycle: "indexable",
      readerJob: "Decide whether to let an AI agent act in my own accounts through Ghostget, and see how to start.",
      nonObviousAnswer: "Ghostget hands the agent named, reviewed actions instead of credentials or a browser, previews every write above a read, and never resends a write whose result is unknown; its own claims register says which of those rules are checked and which are still planned.",
      originalContribution: "States the Gmail read-only and WhatsApp no-send limits, the unencrypted Gmail refresh credential, and the claims register's evidenced, planned, and unverified counts next to the product pitch, taken from the source tree at 76a79fc.",
      hostFit: "The product's own introduction on the product's own site, linking to the getting-started guide and the provider reference already on ghostget.com.",
      nearestUrls: [
        { url: "https://ghostget.com/", distinction: "The homepage sells and installs; this post explains the account-safety model and its stated limits in prose." },
        { url: "https://ghostget.com/about/", distinction: "About states what Ghostget is and is not; this post walks one account workflow and the preview and no-resend rules." },
        { url: "https://ghostget.com/docs/explanation/security-model/", distinction: "The security guide is reference depth; this post is the first read that links to it." },
      ],
      sources: sourceRecords(introducingSources),
      observations: [
        "The fact check corrected four overclaims before review: Gmail actions only read, the README runs adapter sync-bundled before capabilities, Ghostget never asks the agent to copy a token rather than making copying impossible, and the duplicate-risk re-send is limited to one web-session post named by its source run.",
        "On 2026-09-24 the claims register at 76a79fc held 244 claims: 180 evidenced, 45 planned, and 19 not verified, 15 of them resting on configuration readback.",
      ],
      scores: { readerUtility: 2, originalEvidence: 2, factualConfidence: 2, hostFit: 2, voiceIntegrity: 2, maintenanceValue: 1 },
      owner: OWNER,
      drafting: "ai-from-source",
      review: review(),
      humanReview: null,
      reassessOn: REASSESS_ON,
      harmIfWrong: "A reader could connect an account believing a write or storage guarantee exists that does not, such as encrypted Gmail credentials or WhatsApp sending.",
      refreshTriggers: [
        "Ghostget release tag bump",
        "Change to verification/claims.json totals or to the status of the indeterminate-never-retried or mutation-exact-preview-confirmation claims",
        "Change to the service count or to the Gmail or WhatsApp actions",
        "Change to the risk classes, preview-and-confirm flow, or duplicate-risk re-send rule in the README",
        "Rename of Ghostget or Textbutler, or a change to the registered Textbutler relation detail",
      ],
    },
  },
  {
    slug: "built-on-ghostget",
    title: "Built on Ghostget",
    dek: "PeopleBlade reads contacts and messages through Ghostget, and Textbutler imports the Beeper history that Ghostget exports.",
    eyebrow: "Integration",
    published: "2026-09-24",
    keywords: ["ghostget", "integrations", "peopleblade", "textbutler", "local-first"],
    bodyFile: "built-on-ghostget.html",
    sources: builtOnSources,
    admission: {
      href: "/blog/built-on-ghostget/",
      lifecycle: "indexable",
      readerJob: "Find out which Hraness products use Ghostget and what each one uses it for.",
      nonObviousAnswer: "PeopleBlade reads contacts and message search results through a pinned Ghostget release and checks each result before saving it; Textbutler imports Beeper exports that Ghostget writes in Textbutler's own bundle format and marks as complete, truncated, or unknown.",
      originalContribution: "A provider hub whose entries render from the registered relation sentences, so the list changes when the registry changes rather than when someone edits copy.",
      hostFit: "The provider hub belongs on the provider's own site and links out to each consumer's post along a registered relation.",
      nearestUrls: [
        { url: "https://peopleblade.com/blog/how-peopleblade-uses-ghostget", distinction: "The consumer's own post explains the integration in depth; the hub only indexes it." },
        { url: "https://textbutler.app/blog/how-textbutler-uses-ghostget", distinction: "The consumer's own post explains the import; the hub only indexes it." },
      ],
      sources: sourceRecords(builtOnSources),
      observations: [
        "On 2026-09-24 relatedFor('wrench') in design-kit v0.17.0 returned exactly two relations with detail sentences: PeopleBlade provider transport and the Textbutler private bundle export.",
        "A Sponge relation exists in code but was not registered on the portfolio registry's main branch on 2026-09-24, so the hub leaves it out until it is.",
      ],
      scores: { readerUtility: 1, originalEvidence: 1, factualConfidence: 2, hostFit: 2, voiceIntegrity: 1, maintenanceValue: 2 },
      owner: OWNER,
      drafting: "ai-from-source",
      review: review(),
      humanReview: null,
      reassessOn: REASSESS_ON,
      harmIfWrong: "A reader could believe a product reads or imports data through Ghostget that it does not, or miss a product that does.",
      refreshTriggers: [
        "Any portfolio registry change to a relation with Ghostget as source or target, including a reword of the Textbutler detail",
        "A Sponge relation registered with Ghostget and a Ghostget release that emits the capture bundle it imports",
        "PeopleBlade changes its Ghostget pin or the providers it reads through Ghostget",
        "Ghostget changes the Beeper export limits, truncation marking, or the Textbutler bundle format version",
        "Ghostget's homepage related cards move to the registry render",
      ],
    },
  },
  {
    slug: "ghostget-claims-register",
    title: "What Ghostget has and has not verified",
    dek: "On 24 September 2026, 180 of the 244 claims in Ghostget's public register had a check that runs on every change, and 19 had no automated check.",
    eyebrow: "Technique",
    published: "2026-09-24",
    keywords: ["ghostget", "claims register", "verification", "quint", "lean", "property testing", "agents"],
    bodyFile: "ghostget-claims-register.html",
    sources: claimsRegisterSources,
    admission: {
      href: "/blog/ghostget-claims-register/",
      lifecycle: "indexable",
      readerJob: "Decide how far to trust Ghostget before letting an agent write in your own accounts: which of its safety promises have a running check, what kind, and where each check stops.",
      nonObviousAnswer: "The three promises that matter most for agent writes (allow-once approval, at-most-once writes, no resend after an unknown outcome) are checked by small Quint models replayed against the real code, each with a stated size, while preview-before-write, messaging reconciliation, local-program writes, and idempotency keys are still planned, and 19 claims, mostly hosting settings, have no automated check at all.",
      originalContribution: "Reads the register entry by entry and names the stated model sizes and the planned gaps, instead of summarising the product as verified.",
      hostFit: "The register and its checks live in the Ghostget repository; the post is the reader-facing guide to it on the product's site.",
      nearestUrls: [
        { url: "https://github.com/hraness/ghostget/blob/main/docs/assurance.md", distinction: "The assurance case is the generated register listing; the post selects the entries a reader deciding on account writes needs." },
        { url: "https://hraness.com/reference/correctness/claims-ledgers", distinction: "The general technique page; this is the Ghostget instance with real counts." },
      ],
      sources: sourceRecords(claimsRegisterSources),
      observations: [
        "Every count in the post was re-derived from verification/claims.json at 76a79fc on 2026-09-24 and carries that date in the body.",
        "The allow-once approval rule is enforced by the client (defect D13 in the formal verification plan), which the post states rather than implying a server-side guarantee.",
      ],
      scores: { readerUtility: 2, originalEvidence: 2, factualConfidence: 2, hostFit: 1, voiceIntegrity: 2, maintenanceValue: 1 },
      owner: OWNER,
      drafting: "ai-from-source",
      review: review(),
      humanReview: null,
      reassessOn: REASSESS_ON,
      harmIfWrong: "A reader could trust an agent write path more than its checks justify, or overlook an unverified claim that matters for their accounts.",
      refreshTriggers: [
        "verification/claims.json totals or per-layer counts change",
        "Status or notVerified text of approval-allow-once, confirmed-write-at-most-once, indeterminate-never-retried, mutation-exact-preview-confirmation, messaging-uncertain-not-resubmitted, or local-cli-post-spawn-indeterminate changes",
        "Bounds in verification/quint/approvals.qnt or fence.qnt change",
        "Status definitions or verify:claims checks in docs/assurance.md change",
        "Release tag bump (re-derive counts from the tag)",
      ],
    },
  },
  {
    slug: "releases-that-prove-their-origin",
    title: "How to check a Ghostget download",
    dek: "One gh command checks that a downloaded Ghostget tarball was signed by the release workflow at its version tag.",
    eyebrow: "Technique",
    published: "2026-09-24",
    keywords: ["ghostget", "releases", "provenance", "supply chain", "github releases", "npm", "quint"],
    bodyFile: "releases-that-prove-their-origin.html",
    sources: releaseSources,
    admission: {
      href: "/blog/releases-that-prove-their-origin/",
      lifecycle: "indexable",
      readerJob: "Confirm that a downloaded Ghostget tarball was built and signed by the public release workflow at its version tag, then install that exact file.",
      nonObviousAnswer: "The release ships its own signature bundle (provenance.jsonl), so gh attestation verify can pin the signer workflow, tag, and GitHub-hosted runner offline; a failed-jobs rerun republishes the already-signed bytes instead of rebuilding; releases before v0.17.0 are signed under the Wrench name or not at all.",
      originalContribution: "A command sequence run against the real Latest Release on 2026-09-24, including the observation that gh attestation verify prints nothing when stdout is not a terminal.",
      hostFit: "Install verification for the product's own release, next to its getting-started guide.",
      nearestUrls: [
        { url: "https://ghostget.com/docs/tutorials/getting-started/", distinction: "The guide installs; this post checks the file before installing it." },
        { url: "https://hraness.com/reference/correctness/release-provenance", distinction: "The general technique page; this is the Ghostget command sequence." },
      ],
      sources: sourceRecords(releaseSources),
      observations: [
        "2026-09-24: all five assets of the Latest GitHub Release were downloaded; shasum -a 256 -c SHA256SUMS passed and gh attestation verify with --bundle provenance.jsonl and the release.yml signer workflow exited 0.",
        "2026-09-24: gh attestation verify printed nothing when stdout was not a terminal; the exit status and --format json were the reliable signals.",
        "2026-09-24: the npm latest dist-tag integrity decoded to the archive SHA-512 recorded in that Release's release-manifest.json.",
      ],
      scores: { readerUtility: 2, originalEvidence: 2, factualConfidence: 2, hostFit: 2, voiceIntegrity: 2, maintenanceValue: 1 },
      owner: OWNER,
      drafting: "ai-from-source",
      review: review(),
      humanReview: null,
      reassessOn: REASSESS_ON,
      harmIfWrong: "A reader could accept a tampered download as genuine, or reject a genuine one, if a command or flag in the post is wrong.",
      refreshTriggers: [
        "Release tag bump (status line only; the body has no typed version)",
        "Status, statement, or notVerified text of release-failed-jobs-rerun-recovers-publish or npm-failure-never-blocks-canonical changes",
        "Canonical five-file asset set, signer workflow path, tarball name, npm publication path, or npm package coordinate changes",
        "gh attestation verify, gh release verify, or npm audit signatures flags or output change",
        "website-production.yml or production-release-verifier.ts changes what the site checks before going live",
      ],
    },
  },
  {
    slug: "replayable-property-tests",
    title: "How Ghostget replays a failing generated test",
    dek: "When one of Ghostget's generated tests fails, the report gives a seed and a shrink path, and passing both back reruns that exact case on any machine.",
    eyebrow: "Technique",
    published: "2026-09-24",
    keywords: ["ghostget", "property testing", "fast-check", "model-based testing", "differential testing", "rfc 8785", "verification"],
    bodyFile: "replayable-property-tests.html",
    sources: propertyTestSources,
    admission: {
      href: "/blog/replayable-property-tests/",
      lifecycle: "indexable",
      readerJob: "Understand how Ghostget makes a failing generated test rerun exactly, and what its property, crash, and comparison tests do and do not prove.",
      nonObviousAnswer: "Every property goes through shared helpers that validate a seed-and-shrink-path coordinate, a checked-in corpus replays a named failure (the {\"__proto__\":0} counterexample) before the random run, a pin test fails if a fast-check upgrade moves that coordinate, and planted defects show the Rust comparison would catch a wrong key order.",
      originalContribution: "Traces one real counterexample from the failing report to its permanent corpus entry and pin test, with the commit that added it.",
      hostFit: "Describes the test harness in the Ghostget repository for readers evaluating or contributing to Ghostget.",
      nearestUrls: [
        { url: "https://hraness.com/reference/correctness/property-tests", distinction: "The general technique page; this post is the Ghostget harness and its real counterexample." },
        { url: "https://hraness.com/reference/correctness/two-implementations-one-spec", distinction: "The general differential-testing page; this post covers only Ghostget's Rust oracles." },
      ],
      sources: sourceRecords(propertyTestSources),
      observations: [
        "The {\"__proto__\":0} counterexample was added as a named regression in #341 (aa8cce0) with a coordinate pin test in src/contracts-invoke-read.test.ts.",
        "On 2026-09-24 the seed corpus at 76a79fc held one entry, and property defaults were 200 runs with a 10 second interrupt and a x20 nightly soak multiplier.",
      ],
      scores: { readerUtility: 2, originalEvidence: 2, factualConfidence: 2, hostFit: 2, voiceIntegrity: 2, maintenanceValue: 1 },
      owner: OWNER,
      drafting: "ai-from-source",
      review: review(),
      humanReview: null,
      reassessOn: REASSESS_ON,
      harmIfWrong: "A contributor could replay a failure with the wrong coordinate format or trust a test layer for a property it does not cover.",
      refreshTriggers: [
        "Ghostget release tag bump",
        "Change to verification/claims.json property, stateful-model, or differential claim counts or statuses",
        "New entry in verification/seeds/corpus.json or a change to the replay coordinate format or env vars in src/test-support.ts",
        "Change to property defaults (runs, interrupt time) or the nightly soak multiplier",
        "Change to the crash harness fault modes or the Rust oracles in verification/oracles",
      ],
    },
  },
];

assertArticleAdmissions(BLOG_POSTS.map((post) => post.admission));

/* ------------------------------------------------------------------------ */
/* Discovery                                                                 */
/* ------------------------------------------------------------------------ */

export function isIndexablePost(post: BlogPost): boolean {
  return post.admission.lifecycle === "indexable";
}

/** Posts that may appear in the index, sitemap, feed, llms.txt, and Markdown twins, newest first. */
export function indexablePosts(posts: readonly BlogPost[] = BLOG_POSTS): readonly BlogPost[] {
  return posts
    .filter(isIndexablePost)
    .toSorted((left, right) => right.published.localeCompare(left.published));
}

function isoTimestamp(date: ArticleIsoDate): string {
  return `${date}T00:00:00.000Z`;
}

export type BlogSite = Readonly<{
  origin: `https://${string}`;
  name: string;
  title: string;
  description: string;
  socialImageAlt: string;
}>;

function searchSite(site: BlogSite): SearchSite {
  return {
    description: site.description,
    language: "en",
    name: site.name,
    origin: site.origin,
    title: site.title,
  };
}

export function blogArticleDiscovery(post: BlogPost, site: BlogSite): ArticleDiscovery {
  return {
    authors: [BLOG_PARTY],
    blogPath: BLOG_PATH,
    canonicalPath: blogPostPath(post.slug),
    description: post.dek,
    image: {
      alt: site.socialImageAlt,
      contentType: "image/png",
      height: 630,
      path: "/og.png",
      width: 1200,
    },
    isAccessibleForFree: true,
    keywords: post.keywords,
    ...(post.updated === undefined ? {} : { modifiedTime: isoTimestamp(post.updated) }),
    publishedTime: isoTimestamp(post.published),
    publisher: BLOG_PARTY,
    section: post.eyebrow,
    title: post.title,
    type: "BlogPosting",
  };
}

/** Sitemap rows for the blog index and indexable posts only, each with a lastmod. */
export function blogSitemapPaths(site: BlogSite, posts: readonly BlogPost[] = BLOG_POSTS): SitemapPath[] {
  return createBlogSitemapPaths(
    { path: BLOG_PATH },
    indexablePosts(posts).map((post) => blogArticleDiscovery(post, site)),
  );
}

export function renderBlogAtomFeed(site: BlogSite, posts: readonly BlogPost[] = BLOG_POSTS): string {
  const listed = indexablePosts(posts);
  const newest = listed[0];
  return createAtomFeed(
    searchSite(site),
    {
      authors: [BLOG_PARTY],
      description: BLOG_DESCRIPTION,
      homePath: BLOG_PATH,
      path: BLOG_FEED_PATH,
      title: BLOG_TITLE,
      ...(newest === undefined ? { updated: isoTimestamp(REVIEWED_ON) } : {}),
    },
    listed.map((post) => createFeedEntry(blogArticleDiscovery(post, site))),
  );
}

export function renderBlogLlmsEntries(site: BlogSite, posts: readonly BlogPost[] = BLOG_POSTS): string {
  const lines = indexablePosts(posts).map((post) =>
    `- [${post.title}](${site.origin}${blogPostPath(post.slug)}): ${post.dek}`);
  return [
    `- [Ghostget blog](${site.origin}${BLOG_PATH}): every listed post, newest first, with an [Atom feed](${site.origin}${BLOG_FEED_PATH})`,
    ...lines,
  ].join("\n");
}

type JsonObject = Readonly<Record<string, unknown>>;

function withoutContext(value: JsonObject): JsonObject {
  const { "@context": _context, ...rest } = value;
  return rest;
}

function breadcrumbNode(url: string, items: readonly (readonly [string, string])[]): JsonObject {
  return {
    "@id": `${url}#breadcrumb`,
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, item], index) => ({
      "@type": "ListItem",
      item,
      name,
      position: index + 1,
    })),
  };
}

/**
 * The page graph for one post: the site's shared nodes, a WebPage, the
 * BlogPosting from web-discovery's articleJsonLd (author and publisher point
 * at the shared Hraness organization node), and a breadcrumb trail.
 */
export function blogPostJsonLd(
  post: BlogPost,
  site: BlogSite,
  sharedGraph: readonly JsonObject[],
  organizationId: string,
): JsonObject {
  const url = `${site.origin}${blogPostPath(post.slug)}`;
  const article = withoutContext(articleJsonLd(searchSite(site), blogArticleDiscovery(post, site)));
  return {
    "@context": "https://schema.org",
    "@graph": [
      ...sharedGraph,
      {
        "@id": url,
        "@type": "WebPage",
        breadcrumb: { "@id": `${url}#breadcrumb` },
        description: post.dek,
        inLanguage: "en",
        isPartOf: { "@id": `${site.origin}/#website` },
        mainEntity: { "@id": `${url}#article` },
        name: post.title,
        url,
      },
      {
        ...article,
        about: { "@id": `${site.origin}/#software` },
        author: [{ "@id": organizationId }],
        publisher: { "@id": organizationId },
      },
      breadcrumbNode(url, [
        ["Ghostget", `${site.origin}/`],
        ["Blog", `${site.origin}${BLOG_PATH}`],
        [post.title, url],
      ]),
    ],
  };
}

export function blogIndexJsonLd(
  site: BlogSite,
  sharedGraph: readonly JsonObject[],
  organizationId: string,
  posts: readonly BlogPost[] = BLOG_POSTS,
): JsonObject {
  const url = `${site.origin}${BLOG_PATH}`;
  const listed = indexablePosts(posts);
  const blog = withoutContext(blogJsonLd(
    searchSite(site),
    { description: BLOG_DESCRIPTION, name: BLOG_TITLE, path: BLOG_PATH },
    listed.map((post) => blogArticleDiscovery(post, site)),
  ));
  return {
    "@context": "https://schema.org",
    "@graph": [
      ...sharedGraph,
      { ...blog, publisher: { "@id": organizationId } },
      breadcrumbNode(url, [["Ghostget", `${site.origin}/`], ["Blog", url]]),
    ],
  };
}

/* ------------------------------------------------------------------------ */
/* Page bodies                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The consumer post for each registered relation the hub lists. A relation
 * that relatedFor() returns but this map does not classify fails the build,
 * so a registry change is reviewed here before the hub changes.
 */
export const BUILT_ON_RELATIONS: Readonly<Record<string, Readonly<{ href: string; label: string }> | null>> = {
  "runtime:peopleblade:wrench:provider-transport": {
    href: "https://peopleblade.com/blog/how-peopleblade-uses-ghostget",
    label: "How PeopleBlade uses Ghostget to read contacts from your accounts",
  },
  "contract:wrench:message-like-me:exports-private-bundles": {
    href: "https://textbutler.app/blog/how-textbutler-uses-ghostget",
    label: "How Textbutler imports Beeper and WhatsApp history via Ghostget",
  },
};

export function ghostgetRelations(): readonly PortfolioRelatedItem[] {
  return relatedFor(GHOSTGET_PORTFOLIO_ID);
}

function headingId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

export function renderBuiltOnEntries(items: readonly PortfolioRelatedItem[] = ghostgetRelations()): string {
  return items.map((item) => {
    if (!(item.relationId in BUILT_ON_RELATIONS)) {
      throw new Error(`Review the new Ghostget relation ${item.relationId} before the Built on Ghostget hub lists it.`);
    }
    const post = BUILT_ON_RELATIONS[item.relationId];
    if (post === null || post === undefined) return "";
    return [
      `<h3 id="${headingId(item.name)}">${escapeArticleHtml(item.name)}</h3>`,
      `<blockquote><p>${escapeArticleHtml(item.relationship)}</p></blockquote>`,
      `<p>Read more: <a href="${escapeArticleHtml(post.href)}">${escapeArticleHtml(post.label)}</a></p>`,
    ].join("\n");
  }).filter((entry) => entry !== "").join("\n");
}

function tocFromBody(bodyHtml: string): { href: `#${string}`; label: string }[] {
  return [...bodyHtml.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/gu)].map((match) => ({
    href: `#${match[1]!}` as const,
    label: match[2]!.replace(/<[^>]+>/gu, "").replaceAll("&#39;", "’").replaceAll("&amp;", "&"),
  }));
}

export function renderBlogPostMain(post: BlogPost, bodyFragment: string): string {
  const bodyHtml = bodyFragment.includes("{{BLOG_RELATION_ENTRIES}}")
    ? bodyFragment.replace("{{BLOG_RELATION_ENTRIES}}", () => renderBuiltOnEntries())
    : bodyFragment;
  const related = ghostgetRelations().map((item) => ({
    href: item.href,
    name: item.name,
    relationship: item.relationship,
  }));
  const article = renderArticleHtml({
    afterHtml: renderArticleSourcesHtml({ sources: post.sources }) + renderArticleRelatedHtml({ items: related }),
    author: BLOG_AUTHOR,
    bodyHtml,
    dek: post.dek,
    eyebrow: post.eyebrow,
    heading: post.title,
    provenance: articleProvenanceFromAdmission(post.admission),
    published: post.published,
    toc: tocFromBody(bodyHtml),
    ...(post.updated === undefined ? {} : { updated: post.updated }),
  });
  return [
    `<nav aria-label="Breadcrumb" class="breadcrumbs"><ol><li><a href="/">Ghostget</a></li><li><a href="${BLOG_PATH}">Blog</a></li><li aria-current="page">${escapeArticleHtml(post.title)}</li></ol></nav>`,
    article,
  ].join("\n");
}

export function renderBlogIndexMain(posts: readonly BlogPost[] = BLOG_POSTS): string {
  const listed = indexablePosts(posts);
  return [
    `<nav aria-label="Breadcrumb" class="breadcrumbs"><ol><li><a href="/">Ghostget</a></li><li aria-current="page">Blog</li></ol></nav>`,
    renderArticleIndexHtml({
      heading: BLOG_TITLE,
      headingId: "blog-title",
      headingLevel: 1,
      items: listed.map((post) => ({
        dek: post.dek,
        eyebrow: post.eyebrow,
        href: blogPostPath(post.slug),
        published: post.published,
        title: post.title,
        ...(post.updated === undefined ? {} : { updated: post.updated }),
      })),
      summary: BLOG_DESCRIPTION,
    }),
    `<p class="blog-feed-link"><a href="${BLOG_FEED_PATH}">Atom feed</a></p>`,
  ].join("\n");
}

export type BlogPageHead = Readonly<{
  canonicalPath: string;
  description: string;
  indexable: boolean;
  ogType: "article" | "website";
  publishedTime?: string;
  title: string;
}>;

/**
 * Fills the blog shell's own placeholders. Shared placeholders such as
 * {{CSS_ASSET}} are left for the site renderer. A page that is not indexable
 * loses its structured data and Markdown alternate lines and gains `noindex`.
 */
export function fillBlogShell(shell: string, site: BlogSite, head: BlogPageHead, mainHtml: string): string {
  const url = `${site.origin}${head.canonicalPath}`;
  let page = shell;
  if (!head.indexable) {
    page = page
      .replace(/^\s*<script type="application\/ld\+json">\{\{JSON_LD\}\}<\/script>\n/mu, "")
      .replace(/^\s*\{\{MARKDOWN_ALTERNATE\}\}\n/mu, "");
  }
  const values = new Map<string, string>([
    ["{{BLOG_ARTICLE_META}}", head.publishedTime === undefined
      ? ""
      : `<meta property="article:published_time" content="${escapeArticleHtml(head.publishedTime)}">`],
    ["{{BLOG_CANONICAL_URL}}", escapeArticleHtml(url)],
    ["{{BLOG_FEED_URL}}", escapeArticleHtml(`${site.origin}${BLOG_FEED_PATH}`)],
    ["{{BLOG_MAIN}}", mainHtml],
    ["{{BLOG_OG_TYPE}}", head.ogType],
    ["{{BLOG_PAGE_DESCRIPTION}}", escapeArticleHtml(head.description)],
    ["{{BLOG_PAGE_TITLE}}", escapeArticleHtml(head.title)],
    ["{{BLOG_ROBOTS}}", head.indexable ? "max-image-preview:large" : "noindex"],
  ]);
  for (const [placeholder, value] of values) {
    if (!page.includes(placeholder)) throw new Error(`The blog shell is missing ${placeholder}.`);
    // A function replacement keeps `$` sequences in shell examples literal.
    page = page.replaceAll(placeholder, () => value);
  }
  if (/\{\{BLOG_[A-Z_]+\}\}/u.test(page)) throw new Error("The blog shell has an unknown placeholder.");
  return page;
}
