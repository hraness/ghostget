/** The robots directive for readable pages kept out of search indexes. */
export const NOINDEX_ROBOTS = "noindex, follow" as const;

/**
 * Dated news takes that stay published and linked but leave search indexes,
 * the sitemap, the homepage cards, and llms.txt.
 */
export const NOINDEX_ESSAY_PATHS = [
  "/agentic-web-spoofing/",
  "/vms-cannot-contain-agents/",
  "/paypal-grapheneos-attestation/",
  "/rumour-is-the-exploit/",
  "/omarchy-root-escalation/",
] as const;

export type NoindexEssayPath = (typeof NOINDEX_ESSAY_PATHS)[number];

// One page per WebMCP Registry domain. Registry domains always hold a dot, so
// the curated `/providers/` index and first-party provider guides stay indexable.
const WEBMCP_DOMAIN = "[a-z0-9-]+(?:\\.[a-z0-9-]+)+";
const WEBMCP_DOMAIN_PAGE = new RegExp(`^/providers/${WEBMCP_DOMAIN}/$`, "u");

/**
 * The `vercel.json` header source that sends `X-Robots-Tag` for each registry
 * domain page and its Markdown sibling. Vercel compiles it with
 * path-to-regexp to `^/providers/(DOMAIN)(/|\.md)$`, so the redirected
 * `/providers/beeper/`-style guides and the `/providers/` index never match.
 */
export const WEBMCP_DOMAIN_HEADER_SOURCE = `/providers/:site(${WEBMCP_DOMAIN})(/|\\.md)` as const;

/** Whether a canonical document path is readable but excluded from search indexes. */
export function isNoindexDocumentPath(canonicalPath: string): boolean {
  return (NOINDEX_ESSAY_PATHS as readonly string[]).includes(canonicalPath)
    || WEBMCP_DOMAIN_PAGE.test(canonicalPath);
}
