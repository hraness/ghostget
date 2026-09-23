export const HTML_MEDIA_TYPE = "text/html" as const;
export const MARKDOWN_MEDIA_TYPE = "text/markdown" as const;
const MARKDOWN_CONTENT_TYPE = `${MARKDOWN_MEDIA_TYPE}; charset=utf-8` as const;
const PLAIN_CONTENT_TYPE = "text/plain; charset=utf-8" as const;
const STATIC_ASSET = /\.[a-z0-9]+$/iu;
const CANONICAL_SITE_ORIGIN = "https://ghostget.com";
const MARKDOWN_NOT_FOUND_PATH = "/404.md";

export type DocumentRepresentation = "html" | "markdown";
type DocumentRepresentations = readonly [
  DocumentRepresentation,
  ...DocumentRepresentation[],
];

export type DocumentNegotiation =
  | { readonly kind: "html" }
  | { readonly kind: "markdown" }
  | { readonly kind: "not-acceptable"; readonly accept: string };

export type DocumentRetrieve = (url: URL) => Promise<Response>;

type MediaRange = Readonly<{
  index: number;
  q: number;
  specificity: number;
  subtype: string;
  type: string;
}>;

const REPRESENTATION_CANDIDATES = {
  html: { preference: 0, representation: "html", subtype: "html", type: "text" },
  markdown: { preference: 1, representation: "markdown", subtype: "markdown", type: "text" },
} as const;

const DOCUMENT_REPRESENTATIONS = ["html", "markdown"] as const;
const HTML_ONLY_REPRESENTATIONS = ["html"] as const;

function parseQuality(value: string | undefined): number | null {
  if (value === undefined) return 1000;
  if (!/^(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/u.test(value)) return null;
  return Math.round(Number.parseFloat(value) * 1000);
}

function parseMediaRange(value: string, index: number): MediaRange | null {
  const parts = value.split(";").map((part) => part.trim()).filter((part) => part !== "");
  const media = parts[0]?.toLowerCase();
  if (media === undefined || media === "") return null;
  const [type, subtype, ...rest] = media.split("/");
  if (type === undefined || subtype === undefined || rest.length > 0) return null;
  if (type !== "*" && !/^[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(type)) return null;
  if (subtype !== "*" && !/^[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(subtype)) return null;
  if (type === "*" && subtype !== "*") return null;

  let q = 1000;
  for (const parameter of parts.slice(1)) {
    const separator = parameter.indexOf("=");
    if (separator <= 0) continue;
    const name = parameter.slice(0, separator).trim().toLowerCase();
    if (name !== "q") continue;
    const parsed = parseQuality(parameter.slice(separator + 1).trim());
    if (parsed === null) return null;
    q = parsed;
  }
  return {
    index,
    q,
    specificity: type === "*" ? 1 : subtype === "*" ? 2 : 3,
    subtype,
    type,
  };
}

export function parseAcceptMediaRanges(header: string | null): readonly MediaRange[] {
  if (header === null) return [];
  const ranges: MediaRange[] = [];
  for (const [index, value] of header.split(",").entries()) {
    const range = parseMediaRange(value, index);
    if (range !== null) ranges.push(range);
  }
  return ranges;
}

function rangeMatches(range: MediaRange, type: string, subtype: string): boolean {
  return (range.type === "*" || range.type === type)
    && (range.subtype === "*" || range.subtype === subtype);
}

function bestRangeFor(
  ranges: readonly MediaRange[],
  type: string,
  subtype: string,
): MediaRange | null {
  let best: MediaRange | null = null;
  for (const range of ranges) {
    if (!rangeMatches(range, type, subtype)) continue;
    if (best === null) {
      best = range;
      continue;
    }
    if (range.specificity !== best.specificity) {
      if (range.specificity > best.specificity) best = range;
      continue;
    }
    if (range.q !== best.q) {
      if (range.q > best.q) best = range;
      continue;
    }
    if (range.index < best.index) best = range;
  }
  return best;
}

export function negotiateDocumentRepresentation(
  acceptHeader: string | null,
  representations: DocumentRepresentations = DOCUMENT_REPRESENTATIONS,
): DocumentNegotiation {
  const ranges = parseAcceptMediaRanges(acceptHeader);
  if (ranges.length === 0) return { kind: "html" };

  let selected: {
    preference: number;
    q: number;
    rangeIndex: number;
    representation: DocumentRepresentation;
    specificity: number;
  } | null = null;

  for (const representation of representations) {
    const candidate = REPRESENTATION_CANDIDATES[representation];
    const range = bestRangeFor(ranges, candidate.type, candidate.subtype);
    if (range === null || range.q === 0) continue;
    const next = {
      preference: candidate.preference,
      q: range.q,
      rangeIndex: range.index,
      representation: candidate.representation,
      specificity: range.specificity,
    };
    if (selected === null) {
      selected = next;
      continue;
    }
    if (next.q !== selected.q) {
      if (next.q > selected.q) selected = next;
      continue;
    }
    if (next.specificity !== selected.specificity) {
      if (next.specificity > selected.specificity) selected = next;
      continue;
    }
    if (next.rangeIndex !== selected.rangeIndex) {
      if (next.rangeIndex < selected.rangeIndex) selected = next;
      continue;
    }
    if (next.preference < selected.preference) selected = next;
  }

  if (selected === null) {
    return { kind: "not-acceptable", accept: acceptHeader ?? "" };
  }
  return { kind: selected.representation };
}

export function notAcceptableBody(
  accept: string,
  representations: DocumentRepresentations = DOCUMENT_REPRESENTATIONS,
): string {
  return [
    "This resource is available in:",
    ...representations.map((representation) => (
      `- ${representation === "html" ? HTML_MEDIA_TYPE : MARKDOWN_MEDIA_TYPE}`
    )),
    "",
    `You requested: ${accept}`,
    "",
  ].join("\n");
}

export function isHtmlOnlyDocumentPath(pathname: string): boolean {
  return pathname === "/preview"
    || pathname === "/preview/"
    || pathname === "/preview/index.html";
}

export function isNegotiableDocumentPath(pathname: string): boolean {
  return pathname === "/" || !pathname.includes(".") && !pathname.includes("\\") && !pathname.includes("\0");
}

export function markdownAssetPath(pathname: string): string | null {
  if (
    isHtmlOnlyDocumentPath(pathname)
    || !isNegotiableDocumentPath(pathname)
    || pathname.includes("..")
  ) return null;
  if (pathname === "/") return "/index.md";
  const trimmed = pathname.replace(/\/+$/u, "");
  if (trimmed === "" || !trimmed.startsWith("/") || trimmed.includes("//")) return null;
  return `${trimmed}.md`;
}

// Every retrieval stays on the request origin. A path that starts with "//" or
// holds a backslash would parse as a protocol-relative reference to another
// host, so it is rejected before URL resolution, and the resolved origin is
// checked again after it.
function sameOriginAssetUrl(path: string, url: URL): URL | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  const resolved = new URL(path, url.origin);
  return resolved.origin === url.origin ? resolved : null;
}

function markdownHeaders(): Headers {
  return new Headers({
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Content-Type": MARKDOWN_CONTENT_TYPE,
    Vary: "Accept",
  });
}

function markdownDocumentLink(markdownPath: string): string {
  const stem = markdownPath.slice(0, -".md".length);
  const canonicalPath = stem === "/index" ? "/" : `${stem}/`;
  return `<${CANONICAL_SITE_ORIGIN}${canonicalPath}>; rel="canonical", <${markdownPath}>; rel="alternate"; type="${MARKDOWN_MEDIA_TYPE}"`;
}

async function markdownNotFound(
  request: Request,
  url: URL,
  retrieve: DocumentRetrieve,
): Promise<Response> {
  const notFoundUrl = sameOriginAssetUrl(MARKDOWN_NOT_FOUND_PATH, url);
  if (notFoundUrl === null) {
    throw new Error("The markdown 404 document path left the request origin.");
  }
  const missing = await retrieve(notFoundUrl);
  if (!missing.ok) {
    throw new Error("The markdown 404 document is missing.");
  }
  const headers = markdownHeaders();
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(await readBody(missing, request.method), {
    headers,
    status: 404,
  });
}

function notAcceptableHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Type": PLAIN_CONTENT_TYPE,
    Vary: "Accept",
  });
}

async function readBody(response: Response, method: string): Promise<string | null> {
  if (method === "HEAD") return null;
  return await response.text();
}

export async function handleDocumentNegotiation(
  request: Request,
  retrieve: DocumentRetrieve,
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const htmlOnly = isHtmlOnlyDocumentPath(url.pathname);
  if (url.pathname.startsWith("/assets/")) return null;

  // A direct request for a published markdown sibling serves the same sealed
  // bytes with the canonical document and alternate representation headers the
  // negotiated response carries. Missing markdown stays an HTTP 404.
  if (!htmlOnly && url.pathname.endsWith(".md")) {
    const assetUrl = sameOriginAssetUrl(url.pathname, url);
    if (assetUrl === null) return await markdownNotFound(request, url, retrieve);
    const asset = await retrieve(assetUrl);
    if (!asset.ok) return await markdownNotFound(request, url, retrieve);
    const headers = markdownHeaders();
    if (url.pathname === MARKDOWN_NOT_FOUND_PATH) {
      headers.set("X-Robots-Tag", "noindex, nofollow");
    } else {
      headers.set("Link", markdownDocumentLink(url.pathname));
    }
    return new Response(await readBody(asset, request.method), {
      headers,
      status: 200,
    });
  }
  if (STATIC_ASSET.test(url.pathname) && !htmlOnly) return null;

  const representations = htmlOnly
    ? HTML_ONLY_REPRESENTATIONS
    : DOCUMENT_REPRESENTATIONS;
  const decision = negotiateDocumentRepresentation(
    request.headers.get("accept"),
    representations,
  );
  if (decision.kind === "html") return null;
  if (decision.kind === "not-acceptable") {
    return new Response(
      request.method === "HEAD"
        ? null
        : notAcceptableBody(decision.accept, representations),
      {
        headers: notAcceptableHeaders(),
        status: 406,
      },
    );
  }

  const assetPath = markdownAssetPath(url.pathname);
  const assetUrl = assetPath === null ? null : sameOriginAssetUrl(assetPath, url);
  if (assetPath !== null && assetUrl !== null) {
    const asset = await retrieve(assetUrl);
    if (asset.ok) {
      const headers = markdownHeaders();
      headers.set("Link", markdownDocumentLink(assetPath));
      return new Response(await readBody(asset, request.method), {
        headers,
        status: 200,
      });
    }
  }

  return await markdownNotFound(request, url, retrieve);
}

export const DOCUMENT_MEDIA_TYPES = [HTML_MEDIA_TYPE, MARKDOWN_MEDIA_TYPE] as const;
