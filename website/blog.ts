/**
 * The GhostGet blog at /blog/.
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

import { editorialImage, editorialImageUrl, editorialImageSrcSet, EDITORIAL_ARTICLE_IMAGE_SIZES } from "./editorial-images";
import { product as canonicalProduct } from "./portfolio-copy";

export const BLOG_PATH = "/blog/" as const;
export const BLOG_FEED_PATH = "/blog/feed.xml" as const;
export const BLOG_TITLE = "GhostGet blog" as const;
export const BLOG_DESCRIPTION =
  "Practical guides to web access, account actions, software verification, and repeatable tests." as const;
/** The Portfolio product id GhostGet still carries in the registry. */
export const GHOSTGET_PORTFOLIO_ID = "wrench" as const;

export const BLOG_AUTHOR: ArticleAuthor = { kind: "organization", name: "Hraness", href: "https://hraness.com" };
const BLOG_PARTY: ArticleParty = {
  kind: "Organization",
  name: "Hraness",
  url: "https://hraness.com",
  sameAs: ["https://github.com/hraness"],
};
const REVIEWED_ON: ArticleIsoDate = "2026-09-30";

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

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    "slug": "introducing-ghostget",
    "title": "Introducing GhostGet",
    "dek": "Read web pages, work with connected accounts, and review consequential actions before they run.",
    "eyebrow": "Getting started",
    "published": "2026-09-24",
    "updated": "2026-09-30",
    "keywords": [
      "getting started",
      "agents",
      "web"
    ],
    "bodyFile": "introducing-ghostget.html",
    "sources": [
      {
        "title": "GhostGet getting-started guide",
        "href": "https://ghostget.com/docs/tutorials/getting-started/",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "GhostGet supported services",
        "href": "https://ghostget.com/docs/reference/provider-capabilities/",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "GhostGet security model",
        "href": "https://ghostget.com/docs/explanation/security-model/",
        "checkedOn": "2026-09-30"
      }
    ],
    "admission": {
      "href": "/blog/introducing-ghostget/",
      "lifecycle": "indexable",
      "readerJob": "Understand how named actions fit into an agent setup.",
      "nonObviousAnswer": "A named action lets an agent request a specific result while the tool handles account selection and the underlying connection.",
      "originalContribution": "A concrete worked example and practical next step, edited for a reader who has not seen the product source or development history.",
      "hostFit": "Explains a recurring decision for readers using agents to work with web pages and accounts.",
      "nearestUrls": [
        {
          "url": "https://ghostget.com/docs/",
          "distinction": "Documentation gives product procedures and reference; this article explains the decision or mechanism."
        }
      ],
      "sources": [
        {
          "title": "GhostGet getting-started guide",
          "url": "https://ghostget.com/docs/tutorials/getting-started/",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "GhostGet supported services",
          "url": "https://ghostget.com/docs/reference/provider-capabilities/",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "GhostGet security model",
          "url": "https://ghostget.com/docs/explanation/security-model/",
          "checkedOn": "2026-09-30"
        }
      ],
      "observations": [
        "The email-thread example explains when a named action saves navigation while pointing unfamiliar visual tasks to browser control; it establishes fit before listing features.",
        "Reading and consequential writes are separated through concrete account, preview, and unknown-outcome behavior, with exact public commands supplying a complete first step."
      ],
      "scores": {
        "readerUtility": 2,
        "originalEvidence": 1,
        "factualConfidence": 2,
        "hostFit": 2,
        "voiceIntegrity": 2,
        "maintenanceValue": 2
      },
      "owner": "Hraness, maintainers of hraness/ghostget",
      "drafting": "ai",
      "review": {
        "reviewer": "Codex editorial review (AI)",
        "reviewerType": "ai",
        "reviewedOn": "2026-09-30"
      },
      "humanReview": null,
      "reassessOn": "2026-11-11",
      "harmIfWrong": "A reader could make the wrong tool, retry, verification, or data-import decision.",
      "refreshTriggers": [
        "A documented interface or relevant service behavior changes",
        "A product rename or registered relationship changes",
        "A cited primary source changes its explanation"
      ]
    }
  },
  {
    "slug": "built-on-ghostget",
    "title": "How other tools use GhostGet",
    "dek": "Account reads, message exports, and signed-in page captures supply information for contact search, writing, and research.",
    "eyebrow": "Connections",
    "published": "2026-09-24",
    "updated": "2026-09-30",
    "keywords": [
      "connections",
      "agents",
      "web"
    ],
    "bodyFile": "built-on-ghostget.html",
    "sources": [
      {
        "title": "GhostGet message exports",
        "href": "https://github.com/hraness/ghostget/blob/20c1f999/README.md",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "TextButler account connections",
        "href": "https://github.com/hraness/textbutler",
        "checkedOn": "2026-09-30"
      }
    ],
    "admission": {
      "href": "/blog/built-on-ghostget/",
      "lifecycle": "indexable",
      "readerJob": "Understand which tools use GhostGet and what information they receive.",
      "nonObviousAnswer": "A connection and the data it returns are separate from the receiving tool’s task; source context and completeness need to travel with an export.",
      "originalContribution": "A concrete worked example and practical next step, edited for a reader who has not seen the product source or development history.",
      "hostFit": "Explains a recurring decision for readers using agents to work with web pages and accounts.",
      "nearestUrls": [
        {
          "url": "https://ghostget.com/docs/",
          "distinction": "Documentation gives product procedures and reference; this article explains the decision or mechanism."
        }
      ],
      "sources": [
        {
          "title": "GhostGet message exports",
          "url": "https://github.com/hraness/ghostget/blob/20c1f999/README.md",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "TextButler account connections",
          "url": "https://github.com/hraness/textbutler",
          "checkedOn": "2026-09-30"
        }
      ],
      "observations": [
        "The hub now uses current runtime relations, avoiding the stale export relationship that incorrectly assigned the legacy importer to the current TextButler product.",
        "The incomplete-conversation example explains why source context and truncation metadata matter downstream, giving the hub a useful lesson beyond a product list."
      ],
      "scores": {
        "readerUtility": 2,
        "originalEvidence": 1,
        "factualConfidence": 2,
        "hostFit": 2,
        "voiceIntegrity": 2,
        "maintenanceValue": 2
      },
      "owner": "Hraness, maintainers of hraness/ghostget",
      "drafting": "ai",
      "review": {
        "reviewer": "Codex editorial review (AI)",
        "reviewerType": "ai",
        "reviewedOn": "2026-09-30"
      },
      "humanReview": null,
      "reassessOn": "2026-11-11",
      "harmIfWrong": "A reader could make the wrong tool, retry, verification, or data-import decision.",
      "refreshTriggers": [
        "A documented interface or relevant service behavior changes",
        "A product rename or registered relationship changes",
        "A cited primary source changes its explanation"
      ]
    }
  },
  {
    "slug": "ghostget-claims-register",
    "title": "Why a failed send can still have succeeded",
    "dek": "A timeout can hide a completed action. Check the result and understand idempotency before repeating a consequential request.",
    "eyebrow": "Reliability",
    "published": "2026-09-24",
    "updated": "2026-09-30",
    "keywords": [
      "reliability",
      "agents",
      "web"
    ],
    "bodyFile": "ghostget-claims-register.html",
    "sources": [
      {
        "title": "Amazon EC2 API idempotency",
        "href": "https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-idempotency.html",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "GhostGet send and recovery behavior",
        "href": "https://ghostget.com/docs/explanation/security-model/",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "GhostGet claims register",
        "href": "https://ghostget.com/claims/",
        "checkedOn": "2026-09-30"
      }
    ],
    "admission": {
      "href": "/blog/ghostget-claims-register/",
      "lifecycle": "indexable",
      "readerJob": "Decide what to do after a send returns a timeout.",
      "nonObviousAnswer": "A failed response and a failed action are different states; replaying the request can duplicate an effect that already happened.",
      "originalContribution": "A concrete worked example and practical next step, edited for a reader who has not seen the product source or development history.",
      "hostFit": "Explains a recurring decision for readers using agents to work with web pages and accounts.",
      "nearestUrls": [
        {
          "url": "https://ghostget.com/docs/",
          "distinction": "Documentation gives product procedures and reference; this article explains the decision or mechanism."
        }
      ],
      "sources": [
        {
          "title": "Amazon EC2 API idempotency",
          "url": "https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-idempotency.html",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "GhostGet send and recovery behavior",
          "url": "https://ghostget.com/docs/explanation/security-model/",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "GhostGet claims register",
          "url": "https://ghostget.com/claims/",
          "checkedOn": "2026-09-30"
        }
      ],
      "observations": [
        "The timeout example separates loss of the reply from failure of the action and explains why an empty search result may not settle the outcome.",
        "The idempotency discussion identifies both reusing a key and service-side behavior as necessary, avoiding the mistaken implication that a locally generated identifier prevents remote duplicates."
      ],
      "scores": {
        "readerUtility": 2,
        "originalEvidence": 1,
        "factualConfidence": 2,
        "hostFit": 2,
        "voiceIntegrity": 2,
        "maintenanceValue": 2
      },
      "owner": "Hraness, maintainers of hraness/ghostget",
      "drafting": "ai",
      "review": {
        "reviewer": "Codex editorial review (AI)",
        "reviewerType": "ai",
        "reviewedOn": "2026-09-30"
      },
      "humanReview": null,
      "reassessOn": "2026-11-11",
      "harmIfWrong": "A reader could make the wrong tool, retry, verification, or data-import decision.",
      "refreshTriggers": [
        "A documented interface or relevant service behavior changes",
        "A product rename or registered relationship changes",
        "A cited primary source changes its explanation"
      ]
    }
  },
  {
    "slug": "releases-that-prove-their-origin",
    "title": "How to verify where a download came from",
    "dek": "Check the file fingerprint and signed build record, then install the exact package you verified.",
    "eyebrow": "Software provenance",
    "published": "2026-09-24",
    "updated": "2026-09-30",
    "keywords": [
      "software provenance",
      "agents",
      "web"
    ],
    "bodyFile": "releases-that-prove-their-origin.html",
    "sources": [
      {
        "title": "GitHub CLI attestation verification",
        "href": "https://cli.github.com/manual/gh_attestation_verify",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "GhostGet releases",
        "href": "https://github.com/hraness/ghostget/releases",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "GhostGet release format",
        "href": "https://github.com/hraness/ghostget/blob/20c1f999/docs/publishing.md",
        "checkedOn": "2026-09-30"
      }
    ],
    "admission": {
      "href": "/blog/releases-that-prove-their-origin/",
      "lifecycle": "indexable",
      "readerJob": "Verify that a package was built by the expected project and workflow.",
      "nonObviousAnswer": "A checksum establishes matching bytes; a signed build record connects those bytes to the repository, workflow, and selected version.",
      "originalContribution": "A concrete worked example and practical next step, edited for a reader who has not seen the product source or development history.",
      "hostFit": "Explains a recurring decision for readers using agents to work with web pages and accounts.",
      "nearestUrls": [
        {
          "url": "https://ghostget.com/docs/",
          "distinction": "Documentation gives product procedures and reference; this article explains the decision or mechanism."
        }
      ],
      "sources": [
        {
          "title": "GitHub CLI attestation verification",
          "url": "https://cli.github.com/manual/gh_attestation_verify",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "GhostGet releases",
          "url": "https://github.com/hraness/ghostget/releases",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "GhostGet release format",
          "url": "https://github.com/hraness/ghostget/blob/20c1f999/docs/publishing.md",
          "checkedOn": "2026-09-30"
        }
      ],
      "observations": [
        "The article distinguishes byte integrity from builder identity before showing verification commands, so a matching checksum is not presented as proof of origin.",
        "Installing the exact verified local archive completes the trust chain; downloading or installing a different file would break the connection the earlier checks establish."
      ],
      "scores": {
        "readerUtility": 2,
        "originalEvidence": 1,
        "factualConfidence": 2,
        "hostFit": 2,
        "voiceIntegrity": 2,
        "maintenanceValue": 2
      },
      "owner": "Hraness, maintainers of hraness/ghostget",
      "drafting": "ai",
      "review": {
        "reviewer": "Codex editorial review (AI)",
        "reviewerType": "ai",
        "reviewedOn": "2026-09-30"
      },
      "humanReview": null,
      "reassessOn": "2026-11-11",
      "harmIfWrong": "A reader could make the wrong tool, retry, verification, or data-import decision.",
      "refreshTriggers": [
        "A documented interface or relevant service behavior changes",
        "A product rename or registered relationship changes",
        "A cited primary source changes its explanation"
      ]
    }
  },
  {
    "slug": "replayable-property-tests",
    "title": "Turn an unexpected input into a repeatable test",
    "dek": "Generate inputs from a rule, reduce a failure, and keep both the replay recipe and the smallest example.",
    "eyebrow": "Testing",
    "published": "2026-09-24",
    "updated": "2026-09-30",
    "keywords": [
      "testing",
      "agents",
      "web"
    ],
    "bodyFile": "replayable-property-tests.html",
    "sources": [
      {
        "title": "fast-check runners",
        "href": "https://fast-check.dev/docs/core-blocks/runners/",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "fast-check model-based testing",
        "href": "https://fast-check.dev/docs/advanced/model-based-testing/",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "JSON key regression example",
        "href": "https://github.com/hraness/ghostget/blob/20c1f999/src/contracts-invoke-read.test.ts",
        "checkedOn": "2026-09-30"
      },
      {
        "title": "JSON Canonicalization Scheme",
        "href": "https://www.rfc-editor.org/rfc/rfc8785",
        "checkedOn": "2026-09-30"
      }
    ],
    "admission": {
      "href": "/blog/replayable-property-tests/",
      "lifecycle": "indexable",
      "readerJob": "Understand how generated tests find and preserve unexpected cases.",
      "nonObviousAnswer": "A seed and shrink path reproduce a discovery for the same generator, while an explicit regression preserves its meaning across library changes.",
      "originalContribution": "A concrete worked example and practical next step, edited for a reader who has not seen the product source or development history.",
      "hostFit": "Explains a recurring decision for readers using agents to work with web pages and accounts.",
      "nearestUrls": [
        {
          "url": "https://ghostget.com/docs/",
          "distinction": "Documentation gives product procedures and reference; this article explains the decision or mechanism."
        }
      ],
      "sources": [
        {
          "title": "fast-check runners",
          "url": "https://fast-check.dev/docs/core-blocks/runners/",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "fast-check model-based testing",
          "url": "https://fast-check.dev/docs/advanced/model-based-testing/",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "JSON key regression example",
          "url": "https://github.com/hraness/ghostget/blob/20c1f999/src/contracts-invoke-read.test.ts",
          "checkedOn": "2026-09-30"
        },
        {
          "title": "JSON Canonicalization Scheme",
          "url": "https://www.rfc-editor.org/rfc/rfc8785",
          "checkedOn": "2026-09-30"
        }
      ],
      "observations": [
        "The real __proto__ regression supplies a concrete reason to generate awkward structured values, and the public fast-check sample makes the replay mechanism portable.",
        "The article pairs a seed/path recipe with a permanent minimal example, explaining why a dependency upgrade can change replay while the explicit regression remains useful."
      ],
      "scores": {
        "readerUtility": 2,
        "originalEvidence": 2,
        "factualConfidence": 2,
        "hostFit": 2,
        "voiceIntegrity": 2,
        "maintenanceValue": 2
      },
      "owner": "Hraness, maintainers of hraness/ghostget",
      "drafting": "ai",
      "review": {
        "reviewer": "Codex editorial review (AI)",
        "reviewerType": "ai",
        "reviewedOn": "2026-09-30"
      },
      "humanReview": null,
      "reassessOn": "2026-11-11",
      "harmIfWrong": "A reader could make the wrong tool, retry, verification, or data-import decision.",
      "refreshTriggers": [
        "A documented interface or relevant service behavior changes",
        "A product rename or registered relationship changes",
        "A cited primary source changes its explanation"
      ]
    }
  }
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
    image: (() => {
      const image = editorialImage(blogPostPath(post.slug));
      return image === undefined
        ? { alt: site.socialImageAlt, contentType: "image/png" as const, height: 630, path: "/og.png" as const, width: 1200 }
        : { alt: image.alt, contentType: "image/webp" as const, height: image.height, path: image.src, width: image.width };
    })(),
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
    `- [GhostGet blog](${site.origin}${BLOG_PATH}): every listed post, newest first, with an [Atom feed](${site.origin}${BLOG_FEED_PATH})`,
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
  const image = editorialImage(blogPostPath(post.slug));
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
        ...(image === undefined ? {} : { image: { ...(article.image as JsonObject), creditText: image.credit } }),
        about: { "@id": `${site.origin}/#software` },
        author: [{ "@id": organizationId }],
        publisher: { "@id": organizationId },
      },
      breadcrumbNode(url, [
        ["GhostGet", `${site.origin}/`],
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
      breadcrumbNode(url, [["GhostGet", `${site.origin}/`], ["Blog", url]]),
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
    label: "How PeopleBlade uses GhostGet to read contacts from your accounts",
  },
  "contract:wrench:message-like-me:exports-private-bundles": null,
  "runtime:message-like-me:wrench:reads-and-sends-messages-through": {
    href: "https://textbutler.app",
    label: "TextButler messaging assistant",
  },
  // Registered in design-kit v0.18.2. The hub lists it once a GhostGet release
  // emits the text-only capture bundle Sponge imports; no release does yet.
  "contract:sponge:wrench:imports-captures-from": null,
  // Registered in design-kit v0.30.3. Listed by owner decision on 2026-09-30;
  // the link is Sponge's canonical page from the portfolio registry until a
  // public "How Sponge uses GhostGet" post exists.
  "runtime:sponge:wrench:captures-signed-in-pages-through": {
    href: "https://hraness.com/writing/the-knowledge-pack",
    label: "Sponge, a local research service that keeps its sources and writes cited reports",
  },
  // Registered in design-kit v0.31.0. GhostGet Skills is a thin wrapper around
  // the CLI rather than a product built on GhostGet; unlisted until a consumer post exists.
  "runtime:ghostget-skills:wrench:uses": null,
};

export function ghostgetRelations(): readonly PortfolioRelatedItem[] {
  return relatedFor(GHOSTGET_PORTFOLIO_ID, { kinds: ["runtime"] });
}

function headingId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

export function renderBuiltOnEntries(items: readonly PortfolioRelatedItem[] = ghostgetRelations()): string {
  return items.map((item) => {
    if (!(item.relationId in BUILT_ON_RELATIONS)) {
      throw new Error(`Review the new GhostGet relation ${item.relationId} before the Built on GhostGet hub lists it.`);
    }
    const post = BUILT_ON_RELATIONS[item.relationId];
    if (post === null || post === undefined) return "";
    const name = canonicalProduct(item.productId).name;
    return [
      `<h3 id="${headingId(name)}">${escapeArticleHtml(name)}</h3>`,
      `<p>${escapeArticleHtml(item.relationship)}</p>`,
      `<p>Read more: <a href="${escapeArticleHtml(post.href)}">${escapeArticleHtml(post.label)}</a></p>`,
    ].join("\n");
  }).filter((entry) => entry !== "").join("\n");
}

/** The visible text of a heading's inner HTML: every tag dropped, then the two entities the sources use decoded. */
function headingLabel(innerHtml: string): string {
  let text = "";
  let inTag = false;
  for (const character of innerHtml) {
    if (character === "<") inTag = true;
    else if (character === ">") inTag = false;
    else if (!inTag) text += character;
  }
  return text.replaceAll("&#39;", "’").replaceAll("&amp;", "&");
}

function tocFromBody(bodyHtml: string): { href: `#${string}`; label: string }[] {
  return [...bodyHtml.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/gu)].map((match) => ({
    href: `#${match[1]!}` as const,
    label: headingLabel(match[2]!),
  }));
}

export function renderBlogPostMain(post: BlogPost, bodyFragment: string): string {
  const bodyHtml = bodyFragment.includes("{{BLOG_RELATION_ENTRIES}}")
    ? bodyFragment.replace("{{BLOG_RELATION_ENTRIES}}", () => renderBuiltOnEntries())
    : bodyFragment;
  const image = editorialImage(blogPostPath(post.slug));
  const figure = image === undefined ? "" : `<figure class="editorial-figure"><img alt="${escapeArticleHtml(image.alt)}" decoding="async" height="${image.height}" width="${image.width}" src="${image.src}" srcset="${editorialImageSrcSet(image)}" sizes="${EDITORIAL_ARTICLE_IMAGE_SIZES}"><figcaption><small>Generated with <a href="${escapeArticleHtml(image.creditUrl)}">SlopCamera</a>.</small></figcaption></figure>`;
  const article = renderArticleHtml({
    afterHtml: renderArticleSourcesHtml({ sources: post.sources, showDates: false }),
    author: BLOG_AUTHOR,
    bodyHtml: figure + bodyHtml,
    dek: post.dek,
    heading: post.title,
    provenance: articleProvenanceFromAdmission(post.admission),
    published: post.published,
    showDates: false,
    toc: tocFromBody(bodyHtml),
    ...(post.updated === undefined ? {} : { updated: post.updated }),
  });
  return [
    `<nav aria-label="More articles" class="breadcrumbs"><a href="${BLOG_PATH}">Blog</a></nav>`,
    article,
  ].join("\n");
}

export function renderBlogIndexMain(posts: readonly BlogPost[] = BLOG_POSTS): string {
  const listed = indexablePosts(posts);
  const indexHtml = renderArticleIndexHtml({
    heading: BLOG_TITLE,
    headingId: "blog-title",
    headingLevel: 1,
    items: listed.map((post) => ({
      dek: post.dek,
      href: blogPostPath(post.slug),
      published: post.published,
      title: post.title,
      ...(post.updated === undefined ? {} : { updated: post.updated }),
    })),
    showDates: false,
    summary: BLOG_DESCRIPTION,
  });
  let entryIndex = 0;
  const illustratedIndex = new HTMLRewriter().on(".plain-publication__entry", {
    element(entry) {
      const post = listed[entryIndex++];
      if (post === undefined) throw new Error("Article index rendered an unexpected entry");
      const href = blogPostPath(post.slug);
      const image = editorialImage(href);
      if (image !== undefined) {
        entry.prepend(`<a class="blog-entry-image" href="${escapeArticleHtml(href)}" aria-hidden="true" tabindex="-1"><img alt="" decoding="async" loading="lazy" height="${image.height}" width="${image.width}" src="${image.derivatives[1]?.src ?? image.src}" srcset="${editorialImageSrcSet(image)}" sizes="(max-width: 45rem) 92vw, 28rem"></a>`, { html: true });
      }
    },
  }).transform(indexHtml);
  if (entryIndex !== listed.length) throw new Error("Article index omitted an expected entry");
  return [
    `<nav aria-label="Breadcrumb" class="breadcrumbs"><ol><li><a href="/">GhostGet</a></li><li aria-current="page">Blog</li></ol></nav>`,
    illustratedIndex,
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
  const image = editorialImage(head.canonicalPath);
  if (image !== undefined) {
    page = page.replaceAll('content="https://ghostget.com/og.png"', `content="${editorialImageUrl(image)}"`)
      .replaceAll('{{GHOSTGET_SOCIAL_IMAGE_ALT}}', escapeArticleHtml(image.alt))
      .replace('property="og:image:width" content="1200"', `property="og:image:width" content="${image.width}"`)
      .replace('property="og:image:height" content="630"', `property="og:image:height" content="${image.height}"`);
  }
  if (/\{\{BLOG_[A-Z_]+\}\}/u.test(page)) throw new Error("The blog shell has an unknown placeholder.");
  return page;
}
