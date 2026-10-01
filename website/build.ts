import { renderArticleProvenanceHtml } from "@hraness/design-kit";
import { essayReviews } from "./essay-reviews";
import { marketing, renderMarketingCopy } from "./portfolio-copy";
import { releaseArchiveUrl } from "./github-release-artifact.mjs";
import { snapshotMarketingPreset } from "./marketing-preset";
import { createHash } from "node:crypto";
import {
  cp,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  renderHranessSiteFooter,
  type HranessMailingListConfig,
} from "@hraness/site-footer";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LAUNCH_SERVICE_COUNT } from "./launch/facts.ts";

/**
 * The launch renderer (website/launch/render.tsx) uses the design kit's React
 * entry, which needs the DOM lib that the root typecheck leaves out. It is
 * loaded through this typed seam; website/tsconfig.json typechecks the module
 * itself, and website/launch/launch.test.ts checks it against this shape.
 */
export type LaunchRenderer = Readonly<{
  launchServicesFrom(entries: readonly Readonly<{ name: string; supportedActionCount: number }>[]): readonly Readonly<{ name: string; actions: number }>[];
  renderLaunchMockupSlots(html: string, services: readonly Readonly<{ name: string; actions: number }>[]): string;
  renderLaunchPostBody(fragment: string, services: readonly Readonly<{ name: string; actions: number }>[]): string;
}>;
const LAUNCH_RENDER_MODULE: string = "./launch/render.tsx";
const launchRenderer = (await import(LAUNCH_RENDER_MODULE)) as LaunchRenderer;
const { launchServicesFrom, renderLaunchMockupSlots, renderLaunchPostBody } = launchRenderer;
import { ghostgetSupportProfile } from "../src/support-profile";

import { AskAiAboutThis } from "./ask-ai-runtime.js";
import {
  CLAIMS_JSON_OUTPUT,
  CLAIMS_PAGE_PATH,
  claimsTemplateValues,
  readClaimsRegisterSource,
} from "./claims-register";
import { portfolioRelatedGroups, type PortfolioProductId } from "@hraness/design-kit/portfolio";
import { highlightCode, type SyntaxLanguage } from "@hraness/design-kit/syntax-highlighting";
import { renderStatusPageHtml, type StatusPageLink } from "@hraness/design-kit";
import { renderPlatformBadges, renderPlatformInstall } from "./platform-install";
import {
  EDITORIAL_ARTICLE_IMAGE_SIZES,
  EDITORIAL_CARD_IMAGE_SIZES,
  editorialImage,
  editorialImages,
  editorialImageSrcSet,
  editorialImageUrl,
  type EditorialImage,
} from "./editorial-images";
import { htmlMainToMarkdown } from "./html-to-markdown";
import {
  BLOG_FEED_PATH,
  BLOG_PATH,
  BLOG_POSTS,
  BLOG_DESCRIPTION,
  BLOG_TITLE,
  blogIndexJsonLd,
  blogPostJsonLd,
  blogPostPath,
  blogSitemapPaths,
  fillBlogShell,
  isIndexablePost,
  renderBlogAtomFeed,
  renderBlogIndexMain,
  renderBlogLlmsEntries,
  renderBlogPostMain,
  type BlogPost,
  type BlogSite,
} from "./blog";
import type { SitemapPath } from "@hraness/web-discovery";
import {
  loadProviderCapabilityAttestation,
  type ProviderCapabilityAttestation,
} from "./provider-capability-attestation";
import {
  BEEPER_PAGE_METADATA,
  WHATSAPP_PAGE_METADATA,
  createBeeperPresentationFacts,
  createProviderDirectory,
  createWhatsAppPresentationFacts,
  renderProviderAttestationGroups,
  renderProviderOverviewCards,
  type BeeperPresentationFacts,
  type ProviderDirectory,
  type WhatsAppPresentationFacts,
} from "./provider-presentation";
import webmcpRegistrySource from "./source/webmcp-registry.json";
import { isNoindexDocumentPath, NOINDEX_ROBOTS } from "../edge/robots";
import { SOCIAL_IMAGE_ALT } from "./social-image";
import { ANALYTICS_ROUTE_META } from "./source/analytics-contract";
import {
  parseWebmcpRegistrySnapshot,
  substituteTemplateValues,
  webmcpIndexTemplateValues,
  webmcpProviderPages,
  webmcpSharedTemplateValues,
  webmcpSiteCanonicalPath,
  webmcpSiteTemplateValues,
  type WebmcpRegistrySnapshot,
} from "./webmcp-registry";

/** Alt text for the static `/og.png` card, from the one social-image declaration. */
export { SOCIAL_IMAGE_ALT };
export const SITE_ORIGIN = "https://ghostget.com" as const;
export const SITE_TITLE = `${marketing.names.name} · ${marketing.tagline}`;
/** The home page title: the product name plus the job and audience searchers use. */
export const HOME_TITLE = SITE_TITLE;
export const SITE_DESCRIPTION =
  marketing.meta;
export const BLOG_SITE: BlogSite = {
  description: SITE_DESCRIPTION,
  name: marketing.names.name,
  origin: SITE_ORIGIN,
  socialImageAlt: SOCIAL_IMAGE_ALT,
  title: SITE_TITLE,
};
export const REPOSITORY_URL = "https://github.com/hraness/ghostget" as const;
export const GITHUB_RELEASES_URL = "https://github.com/hraness/ghostget/releases" as const;
export const SKILLS_URL = "https://www.skills.sh/hraness/ghostget/ghostget" as const;
export const PUBLISHER_URL = "https://github.com/hraness" as const;
export const HRANESS_URL = "https://hraness.com/" as const;
export const HRANESS_ORGANIZATION_ID = `${HRANESS_URL}#organization` as const;
export const HRANESS_LOGO_URL = "https://hraness.com/icon.png" as const;
export const HRANESS_LINKEDIN_URL = "https://www.linkedin.com/company/hraness" as const;
export const NPM_PACKAGE_URL = "https://www.npmjs.com/package/@hraness/ghostget" as const;
export const SKILL_REPOSITORY = "hraness/ghostget" as const;
export const CONTENT_REVIEWED_RELEASE = "v0.18.68" as const;
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com" as const;
export const DEMO_PUBLIC_FILES = [
  "wrench-first-capture.gif",
  "wrench-first-capture.mp4",
  "wrench-first-capture.png",
  "wrench-first-capture.vtt",
  "wrench-first-capture.webm",
] as const;

export const PUBLIC_PAGES = [
  {
    canonicalPath: "/",
    description: SITE_DESCRIPTION,
    outputFile: "index.html",
    sourceFile: "index.html",
    title: HOME_TITLE,
  },
  {
    canonicalPath: "/docs/",
    description:
      "GhostGet documentation organized by job: a getting-started tutorial, task how-to guides, security explanation, and the provider capability reference.",
    outputFile: "docs/index.html",
    sourceFile: "docs-index.html",
    title: "GhostGet documentation: tutorials, how-to guides, explanation, and reference",
  },
  {
    canonicalPath: "/docs/tutorials/getting-started/",
    description:
      "Install GhostGet and read a public page with no account or API key. Then choose page saving, an agent skill, or connected services.",
    outputFile: "docs/tutorials/getting-started/index.html",
    sourceFile: "docs-tutorials-getting-started.html",
    title: "Get started with GhostGet: install the CLI and read your first page",
  },
  {
    canonicalPath: "/docs/how-to/capture-and-archive/",
    description:
      "Capture public URLs as Markdown and preserve one authorized media item with manifests, transcripts, provenance, and SHA-256 verification.",
    outputFile: "docs/how-to/capture-and-archive/index.html",
    sourceFile: "docs-how-to-capture-and-archive.html",
    title: "Capture URLs and create verified media archives with GhostGet",
  },
  {
    canonicalPath: "/docs/reference/provider-capabilities/",
    description:
      "See which provider actions GhostGet supports in the current release and how each service connects.",
    outputFile: "docs/reference/provider-capabilities/index.html",
    sourceFile: "docs-reference-provider-capabilities.html",
    title: "Provider support in GhostGet",
  },
  {
    canonicalPath: "/docs/how-to/connect-beeper/",
    description: BEEPER_PAGE_METADATA.description,
    outputFile: "docs/how-to/connect-beeper/index.html",
    sourceFile: "docs-how-to-connect-beeper.html",
    title: BEEPER_PAGE_METADATA.title,
  },
  {
    canonicalPath: "/docs/how-to/export-whatsapp/",
    description: WHATSAPP_PAGE_METADATA.description,
    outputFile: "docs/how-to/export-whatsapp/index.html",
    sourceFile: "docs-how-to-export-whatsapp.html",
    title: WHATSAPP_PAGE_METADATA.title,
  },
  {
    canonicalPath: "/docs/how-to/use-webmcp-sites/",
    description:
      "Search the WebMCP Registry, read one site's tool schema, and call its read-only tools through GhostGet's bundled webmcp adapter, with no account or API key.",
    outputFile: "docs/how-to/use-webmcp-sites/index.html",
    sourceFile: "docs-how-to-use-webmcp-sites.html",
    title: "Use WebMCP sites with your agent through GhostGet",
  },
  {
    canonicalPath: "/providers/",
    description:
      "Every service GhostGet supports: its built-in providers, plus sites in the public WebMCP Registry whose read-only tools your agent can call.",
    outputFile: "providers/index.html",
    sourceFile: "providers.html",
    title: "Providers GhostGet works with: supported services and the WebMCP Registry",
  },
  {
    canonicalPath: "/webmcp/",
    description:
      "WebMCP lets a website publish tools through navigator.modelContext. GhostGet reads them from the public WebMCP Registry and calls only tools declared read-only.",
    outputFile: "webmcp/index.html",
    sourceFile: "webmcp.html",
    title: "WebMCP for agents: call website-published tools through GhostGet",
  },
  {
    canonicalPath: "/docs/explanation/security-model/",
    description:
      "How GhostGet keeps sign-ins on your machine, ties each action to one account, and handles a write whose outcome is unknown.",
    outputFile: "docs/explanation/security-model/index.html",
    sourceFile: "docs-explanation-security-model.html",
    title: "GhostGet security model: accounts, credentials, and writes",
  },
  {
    canonicalPath: "/docs/how-to/author-provider-plugin/",
    description:
      "Write a GhostGet provider plugin, prove one operation, and install the exact content-addressed bundle after it passes checks, tests, and your trust decision.",
    outputFile: "docs/how-to/author-provider-plugin/index.html",
    sourceFile: "docs-how-to-author-provider-plugin.html",
    title: "Author and verify GhostGet provider plugins",
  },
  {
    canonicalPath: CLAIMS_PAGE_PATH,
    description:
      "Every claim in GhostGet's public register with its current verification status, generated from the repository's verification/claims.json on each release.",
    outputFile: "claims/index.html",
    sourceFile: "claims.html",
    title: "GhostGet claims register: what is checked and what is not",
  },
  {
    canonicalPath: "/about/",
    description:
      "GhostGet is an open-source CLI and TypeScript SDK that lets any agent that can run commands read pages, archive media, and use connected accounts.",
    outputFile: "about/index.html",
    sourceFile: "about.html",
    title: "About GhostGet: open-source web actions for AI agents",
  },
  {
    canonicalPath: "/contact/",
    description:
      "Contact GhostGet through public GitHub issues or private vulnerability reporting. No telephone, postal address, or support inbox is published.",
    outputFile: "contact/index.html",
    sourceFile: "contact.html",
    title: "Contact GhostGet maintainers and report security issues",
  },
  {
    canonicalPath: "/privacy/",
    description:
      "How GhostGet stores CLI and provider state locally, when requested work contacts third parties, how to remove data, and what ghostget.com measures.",
    outputFile: "privacy/index.html",
    sourceFile: "privacy.html",
    title: "GhostGet privacy and data custody: CLI, providers, and website",
  },
  {
    canonicalPath: "/compare/",
    description:
      "Choose a page reader, browser tool, or account integration around the work the agent needs to do.",
    outputFile: "compare/index.html",
    sourceFile: "compare-index.html",
    title: "How agents reach the web",
  },
  {
    canonicalPath: "/compare/browser-use/",
    description:
      "browser-use lets a model drive a browser through an observe, plan, and click loop. GhostGet gives agents named, reviewed actions that each return one result.",
    outputFile: "compare/browser-use/index.html",
    sourceFile: "compare-browser-use.html",
    title: "GhostGet vs browser-use: named operations instead of a model-driven browser",
  },
  {
    canonicalPath: "/compare/browserbase/",
    description:
      "Browserbase hosts cloud browser sessions for Playwright, Puppeteer, and Stagehand. GhostGet runs named, reviewed actions on your own machine instead.",
    outputFile: "compare/browserbase/index.html",
    sourceFile: "compare-browserbase.html",
    title: "GhostGet vs Browserbase: local named operations instead of hosted browser sessions",
  },
  {
    canonicalPath: "/compare/playwright-mcp/",
    description:
      "Playwright MCP sends a page's accessibility tree into your agent's context on every step. GhostGet returns one result per named action.",
    outputFile: "compare/playwright-mcp/index.html",
    sourceFile: "compare-playwright-mcp.html",
    title: "GhostGet vs Playwright MCP: one result per action instead of streamed page state",
  },
  {
    canonicalPath: "/compare/agent-browser/",
    description:
      "agent-browser lets an agent open, click, type in, and snapshot a real browser. GhostGet runs it internally for page capture, where the agent can't steer it.",
    outputFile: "compare/agent-browser/index.html",
    sourceFile: "compare-agent-browser.html",
    title: "GhostGet vs agent-browser: a browser the agent can never steer",
  },
  {
    canonicalPath: "/compare/firecrawl/",
    description:
      "A Firecrawl alternative for one-page reads: GhostGet turns a URL into Markdown on your machine with no key or credits. Firecrawl adds crawls and proxies.",
    outputFile: "compare/firecrawl/index.html",
    sourceFile: "compare-firecrawl.html",
    title: "GhostGet vs Firecrawl: a free, local Firecrawl alternative",
  },
  {
    canonicalPath: "/compare/jina-reader/",
    description:
      "A Jina Reader alternative that turns a URL into Markdown on your machine with no key or rate limit. Jina's hosted r.jina.ai prefix needs no install.",
    outputFile: "compare/jina-reader/index.html",
    sourceFile: "compare-jina-reader.html",
    title: "GhostGet vs Jina Reader: a local Jina Reader alternative",
  },
  {
    canonicalPath: "/compare/personal-agents-browser-use/",
    description:
      "Choose browser control for unfamiliar visual work and named actions for repeated tasks with known inputs, outputs, and account permissions.",
    outputFile: "compare/personal-agents-browser-use/index.html",
    sourceFile: "compare-personal-agents-browser-use.html",
    title: "Browser control or named actions: choosing an agent tool",
  },
  {
    canonicalPath: "/agentic-web-spoofing/",
    description:
      "A bot name in an HTTP request is a claim. Learn how identity checks work and why authentication and permission answer separate questions.",
    outputFile: "agentic-web-spoofing/index.html",
    sourceFile: "agentic-web-spoofing.html",
    title: "How to verify a web agent’s identity",
  },
  {
    canonicalPath: "/vms-cannot-contain-agents/",
    description:
      "Virtual machines isolate a computing environment. Network access, account permissions, and shared files determine what an agent can reach outside it.",
    outputFile: "vms-cannot-contain-agents/index.html",
    sourceFile: "vms-cannot-contain-agents.html",
    title: "What a virtual machine isolates, and what an agent can still do",
  },
  {
    canonicalPath: "/paypal-grapheneos-attestation/",
    description:
      "Device checks establish whether a phone matches an app\u2019s requirements. Understand the policy before choosing a supported way to use the service.",
    outputFile: "paypal-grapheneos-attestation/index.html",
    sourceFile: "paypal-grapheneos-attestation.html",
    title: "What a device integrity check tells an app",
  },
  {
    canonicalPath: "/rumour-is-the-exploit/",
    description:
      "A reported flaw gives a starting point. Establish the affected behavior, reduce the reproduction, and check the fix against the original failure.",
    outputFile: "rumour-is-the-exploit/index.html",
    sourceFile: "rumour-is-the-exploit.html",
    title: "Turn a bug report into a reproducible test",
  },
  {
    canonicalPath: "/omarchy-root-escalation/",
    description:
      "Administrator access changes what a program can affect. Separate installation needs from everyday work and keep recurring permissions specific.",
    outputFile: "omarchy-root-escalation/index.html",
    sourceFile: "omarchy-root-escalation.html",
    title: "Review the administrator access a tool needs",
  },
] as const;

export type PublicPage = Readonly<{
  canonicalPath: string;
  description: string;
  outputFile: string;
  sourceFile: string;
  title: string;
}>;

/** Public pages that search engines may index; the rest stay readable with `noindex, follow`. */
export const INDEXABLE_PUBLIC_PAGES: readonly PublicPage[] = PUBLIC_PAGES.filter(
  (page) => !isNoindexDocumentPath(page.canonicalPath),
);

/** Editorial images whose pages are indexable, for homepage cards and the image sitemap. */
export const INDEXABLE_EDITORIAL_IMAGES = editorialImages.filter(
  (image) => !image.canonicalPath.startsWith("/blog/") && !isNoindexDocumentPath(image.canonicalPath),
);

const ROBOTS_META = /<meta name="robots" content="([^"]*)">/gu;

/**
 * Require exactly one robots meta whose directive matches the page's index
 * policy, so a source edit can't quietly index a noindex page or drop one.
 */
export function assertPageRobots(page: Pick<PublicPage, "canonicalPath">, html: string): void {
  const directives = [...html.matchAll(ROBOTS_META)].map((match) => match[1]);
  const noindex = isNoindexDocumentPath(page.canonicalPath);
  if (directives.length !== 1) {
    throw new Error(`${page.canonicalPath} must declare exactly one robots meta tag.`);
  }
  if (noindex ? directives[0] !== NOINDEX_ROBOTS : directives[0]!.includes("noindex")) {
    throw new Error(
      `${page.canonicalPath} robots meta must be ${noindex ? `"${NOINDEX_ROBOTS}"` : "indexable"}, not "${directives[0]}".`,
    );
  }
}

export function renderAskAiAboutThis(canonicalUrl: string): string {
  return renderToStaticMarkup(createElement(AskAiAboutThis, {
    className: "ghostget-ask-ai",
    url: canonicalUrl,
  }));
}

export function markdownSiblingPath(canonicalPath: string): string {
  return canonicalPath === "/" ? "/index.md" : `${canonicalPath.slice(0, -1)}.md`;
}

const websiteRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(websiteRoot, "..");
const sourceRoot = join(websiteRoot, "source");
const publicRoot = join(websiteRoot, "public");
const outputRoot = join(websiteRoot, "dist");
const designKitFontsStylesPath = fileURLToPath(
  import.meta.resolve("@hraness/design-kit/fonts.css"),
);
const designKitProductMarketingStylesPath = fileURLToPath(
  import.meta.resolve("@hraness/design-kit/product-marketing.css"),
);
const designKitFontsDirectory = join(dirname(designKitFontsStylesPath), "fonts");
const designKitTypographyStylesPath = fileURLToPath(
  import.meta.resolve("@hraness/design-kit/typography.css"),
);
const designKitPlainSiteStylesPath = fileURLToPath(
  import.meta.resolve("@hraness/design-kit/plain-site.css"),
);
const designKitPlainPublicationStylesPath = fileURLToPath(
  import.meta.resolve("@hraness/design-kit/plain-publication.css"),
);

const uiStylesheetImports = {
  "./tokens.css": "@hraness/ui/tokens.css",
  "./reset.css": "@hraness/ui/reset.css",
  "./components.css": "@hraness/ui/components.css",
  "../dist/stylex.css": "@hraness/ui/stylex.css",
} as const;

export type UiStylesheetImport = keyof typeof uiStylesheetImports;

/** Inline the pinned package's facade before placing it in one static asset. */
export function compileUiStylesheet(
  facade: string,
  imports: Readonly<Record<UiStylesheetImport, string>>,
): string {
  const remaining = new Set(Object.keys(uiStylesheetImports));
  const compiled = facade.replace(
    /^[\t ]*@import\s+(["'])([^"'\r\n]+)\1\s*;[\t ]*$/gmu,
    (_statement: string, _quote: string, source: string): string => {
      if (!remaining.delete(source)) {
        throw new Error(`Unsupported or repeated UI stylesheet import: ${source}`);
      }
      return imports[source as UiStylesheetImport].trim();
    },
  );
  if (remaining.size !== 0 || /@import\b/iu.test(compiled)) {
    throw new Error("UI stylesheet imports must match the complete pinned public CSS exports.");
  }
  return compiled.trim();
}

const designKitMarketingStylesImports = {
  "./syntax-highlighting.css": "@hraness/design-kit/syntax-highlighting.css",
  "./site-shell.css": "@hraness/design-kit/site-shell.css",
} as const;

/** Resolve one complete, explicitly registered public stylesheet profile. */
function compileDesignKitStyles(
  grammar: string,
  expectedImports: readonly string[],
  imports: Readonly<Record<string, string>>,
): string {
  const remaining = new Set(expectedImports);
  const compiled = grammar.replace(
    /^[\t ]*@import\s+(["'])([^"'\r\n]+)\1\s*;[\t ]*$/gmu,
    (_statement: string, _quote: string, source: string): string => {
      if (!remaining.delete(source) || typeof imports[source] !== "string") {
        throw new Error(`Unsupported or repeated marketing stylesheet import: ${source}`);
      }
      return imports[source].trim();
    },
  );
  if (remaining.size !== 0 || /@import\b/iu.test(compiled)) {
    throw new Error("Marketing stylesheet imports must match the complete pinned public CSS exports.");
  }
  return compiled.trim();
}

/** Inline the pinned marketing grammar's bounded imports before bundling. */
export function compileDesignKitMarketingStyles(
  grammar: string,
  imports: Readonly<Record<keyof typeof designKitMarketingStylesImports, string>>,
): string {
  return compileDesignKitStyles(grammar, Object.keys(designKitMarketingStylesImports), imports);
}

/** The shared shell is emitted once after its retained bytes match the public export. */
function compileDesignKitPlainSiteStyles(grammar: string): string {
  return compileDesignKitStyles(grammar, ["./site-shell.css"], { "./site-shell.css": "" });
}

async function readUiStylesheet(): Promise<string> {
  const entries = Object.entries(uiStylesheetImports);
  const [facade, ...stylesheets] = await Promise.all([
    readFile(fileURLToPath(import.meta.resolve("@hraness/ui/styles.css")), "utf8"),
    ...entries.map(([, exportedPath]) => readFile(
      fileURLToPath(import.meta.resolve(exportedPath)),
      "utf8",
    )),
  ]);
  return compileUiStylesheet(
    facade!,
    Object.fromEntries(
      entries.map(([source], index) => [source, stylesheets[index]!]),
    ) as Record<UiStylesheetImport, string>,
  );
}

const supportedPostHogHosts = new Set([
  "https://eu.i.posthog.com",
  "https://us.i.posthog.com",
]);

export type PackageIdentity = Readonly<{
  description: typeof SITE_DESCRIPTION;
  homepage: typeof SITE_ORIGIN;
  name: "@hraness/ghostget";
  release: `v${string}`;
  repositoryUrl: "git+https://github.com/hraness/ghostget.git";
  version: string;
}>;

export function versionedPackageArtifactUrl(identity: Pick<PackageIdentity, "version">): string {
  return releaseArchiveUrl(`v${identity.version}`);
}

export function agentSkillInstallCommands(
  identity: Pick<PackageIdentity, "release">,
): Readonly<{ bunx: string; npx: string }> {
  const source = `${SKILL_REPOSITORY}#${identity.release}`;
  return Object.freeze({
    bunx: `bunx skills add ${source}`,
    npx: `npx skills add ${source}`,
  });
}

type RenderOptions = Readonly<{
  analyticsAsset: string;
  attestation: ProviderCapabilityAttestation;
  beeperFacts: BeeperPresentationFacts;
  claimsValues: Readonly<Record<string, string>>;
  cssAsset: string;
  foilAsset: string;
  ghostgetContentFooter: string;
  hranessSiteFooter: string;
  packageIdentity: PackageIdentity;
  postHogHost: string;
  postHogKey: string;
  providerAttestationGroups: string;
  providerDirectory: ProviderDirectory;
  providerOverviewCards: string;
  skillInstallAsset: string;
  platformInstallAsset: string;
  webmcpValues: (canonicalPath: string) => Readonly<Record<string, string>> | undefined;
  whatsappFacts: WhatsAppPresentationFacts;
}>;

function unknownRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function parsePackageIdentity(value: unknown): PackageIdentity {
  const manifest = unknownRecord(value, "package.json");
  const repository = unknownRecord(manifest.repository, "package.json repository");
  const version = manifest.version;
  if (
    typeof version !== "string"
    || !/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u.test(version)
  ) {
    throw new TypeError("package.json version must be a stable semantic version.");
  }
  if (manifest.name !== "@hraness/ghostget") {
    throw new TypeError("The website can only describe @hraness/ghostget.");
  }
  if (manifest.description !== SITE_DESCRIPTION) {
    throw new TypeError("The package and website descriptions must stay identical.");
  }
  if (manifest.homepage !== SITE_ORIGIN) {
    throw new TypeError("The package homepage must be the canonical GhostGet origin.");
  }
  if (repository.url !== "git+https://github.com/hraness/ghostget.git") {
    throw new TypeError("The package repository must be the canonical public GhostGet repository.");
  }
  return {
    description: SITE_DESCRIPTION,
    homepage: SITE_ORIGIN,
    name: "@hraness/ghostget",
    release: `v${version}`,
    repositoryUrl: "git+https://github.com/hraness/ghostget.git",
    version,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXml(value: string): string {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

function imageObject(image: EditorialImage): Readonly<Record<string, unknown>> {
  return {
    "@type": "ImageObject",
    caption: image.caption,
    contentUrl: editorialImageUrl(image),
    creditText: image.credit,
    height: image.height,
    url: editorialImageUrl(image),
    width: image.width,
  };
}

export function renderEditorialFigure(image: EditorialImage): string {
  return `<figure class="editorial-figure">
            <img alt="${escapeHtml(image.alt)}" decoding="async"
              height="${image.height}" sizes="${EDITORIAL_ARTICLE_IMAGE_SIZES}"
              src="${image.src}" srcset="${editorialImageSrcSet(image)}" width="${image.width}">
            <figcaption>${image.caption ? `<span>${escapeHtml(image.caption)}</span>` : ""}<small>Generated with <a href="${escapeHtml(image.creditUrl)}">SlopCamera</a>.</small></figcaption>
          </figure>`;
}

/** The homepage keeps its curated siblings; the registry owns their categories. */
export const RELATED_PRODUCT_IDS = ["gobstopper", "xcb", "aicharts", "peopleblade", "soulscrape", "message-like-me", "kb"] as const satisfies readonly PortfolioProductId[];

/** Static equivalent of the shared MarketingRelated category and card markup. */
export function renderRelatedGroups(ids: readonly PortfolioProductId[]): string {
  return portfolioRelatedGroups(ids).map((group) => {
    const cards = group.items.map(({ href, mark, name, role, domain, productId }) => {
      if (!mark.startsWith("data:image/svg+xml,")) throw new Error(`The ${productId} portfolio mark must be an inert SVG data URL.`);
      return `<li class="hraness-marketing-related__item"><a class="hraness-marketing-related__card" data-foil="" data-hraness-marketing="card" data-product-id="${escapeHtml(productId)}" href="${escapeHtml(href)}">`
        + `<span aria-hidden="true" class="hraness-marketing-related__card-mark"><span aria-hidden="true" class="hraness-foil-mark" data-foil=""><img alt="" class="hraness-foil-mark__image" decoding="async" height="28" src="${escapeHtml(mark)}" width="28"><span aria-hidden="true" class="hraness-foil-mark__paint"></span></span></span>`
        + `<div class="hraness-marketing-related__card-text"><div class="hraness-marketing-related__card-heading"><h4 class="hraness-marketing-related__card-name">${escapeHtml(name)}</h4>`
        + `<span class="hraness-marketing-related__card-domain">${escapeHtml(domain)}</span></div>`
        + `<span class="hraness-marketing-related__card-role">${escapeHtml(role)}</span></div></a></li>`;
    }).join("\n");
    return `<div class="hraness-marketing-related__group" data-tone="${group.tone}">`
      + `<div class="hraness-marketing-related__group-header"><h3 class="hraness-marketing-related__group-heading" id="${escapeHtml(group.headingId)}">${escapeHtml(group.heading)}</h3></div>`
      + `<ul aria-labelledby="${escapeHtml(group.headingId)}" class="hraness-marketing-related__list">${cards}</ul></div>`;
  }).join("\n");
}

/** Keep portfolio masks in the hashed stylesheet under the site’s strict CSP. */
function renderRelatedStyles(ids: readonly PortfolioProductId[]): string {
  const masks = portfolioRelatedGroups(ids).flatMap((group) => group.items.map(({ productId, mark }) =>
    `.hraness-marketing-related__card[data-product-id="${productId}"] .hraness-foil-mark__paint { --hraness-foil-mask: url(${JSON.stringify(mark)}); }`,
  ));
  return [".hraness-marketing-related__card .hraness-foil-mark { --hraness-foil-size: 28px; }", ...masks].join("\n");
}

function renderEditorialCards(): string {
  return INDEXABLE_EDITORIAL_IMAGES.map((image) => `<article class="card editorial-card">
              <a href="${image.canonicalPath}">
                <img alt="" decoding="async" height="${image.height}" loading="lazy"
                  sizes="${EDITORIAL_CARD_IMAGE_SIZES}" src="${image.src}"
                  srcset="${editorialImageSrcSet(image)}" width="${image.width}">
                <div class="editorial-card-copy">
                  <h3>${escapeHtml(image.cardTitle)}</h3>
                  <p class="editorial-card-description">${escapeHtml(image.cardDescription)}</p>
                </div>
              </a>
            </article>`).join("\n");
}

function replaceRequired(template: string, placeholder: string, value: string): string {
  if (!template.includes(placeholder)) {
    throw new Error(`Template is missing ${placeholder}.`);
  }
  return template.replaceAll(placeholder, value);
}

function isHtmlTemplate(template: string): boolean {
  return /<!doctype html/iu.test(template);
}

function replaceHtmlRequired(template: string, placeholder: string, value: string): string {
  if (!isHtmlTemplate(template)) {
    return template.includes(placeholder) ? template.replaceAll(placeholder, value) : template;
  }
  return replaceRequired(template, placeholder, value);
}

function sharedJsonLd(identity: PackageIdentity): ReadonlyArray<Readonly<Record<string, unknown>>> {
  return [
    {
      "@id": HRANESS_ORGANIZATION_ID,
      "@type": "Organization",
      logo: HRANESS_LOGO_URL,
      name: "Hraness",
      sameAs: [PUBLISHER_URL, HRANESS_LINKEDIN_URL],
      url: HRANESS_URL,
    },
    {
      "@id": `${SITE_ORIGIN}/#website`,
      "@type": "WebSite",
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      name: marketing.names.name,
      publisher: { "@id": HRANESS_ORGANIZATION_ID },
      url: `${SITE_ORIGIN}/`,
    },
    {
      "@id": `${SITE_ORIGIN}/#software`,
      "@type": "SoftwareApplication",
      applicationCategory: "DeveloperApplication",
      author: { "@id": HRANESS_ORGANIZATION_ID },
      description: SITE_DESCRIPTION,
      featureList: [
        "Save web pages as Markdown",
        "Archive one media item with SHA-256 verification",
        "Encrypted local copies of account reads",
        "Named actions in connected services",
        "Beeper actions through a pinned official CLI",
        "Actions stop when a service changes",
      ],
      installUrl: `${SITE_ORIGIN}/docs/tutorials/getting-started/`,
      isAccessibleForFree: true,
      license: "https://opensource.org/license/mit",
      name: marketing.names.name,
      offers: {
        "@type": "Offer",
        availability: "https://schema.org/InStock",
        price: 0,
        priceCurrency: "USD",
      },
      operatingSystem: ["macOS", "Linux"],
      publisher: { "@id": HRANESS_ORGANIZATION_ID },
      sameAs: [REPOSITORY_URL, NPM_PACKAGE_URL, SKILLS_URL],
      softwareRequirements: "Bun 1.3.14 on macOS or Linux",
      softwareVersion: identity.version,
      url: `${SITE_ORIGIN}/`,
    },
    {
      "@id": `${SITE_ORIGIN}/#source`,
      "@type": "SoftwareSourceCode",
      codeRepository: REPOSITORY_URL,
      license: "https://opensource.org/license/mit",
      name: "GhostGet source code",
      programmingLanguage: {
        "@type": "ComputerLanguage",
        name: "TypeScript",
      },
      runtimePlatform: "Bun 1.3.14",
      targetProduct: { "@id": `${SITE_ORIGIN}/#software` },
      version: identity.version,
    },
  ];
}

function jsonLd(identity: PackageIdentity, page: PublicPage): Readonly<Record<string, unknown>> {
  const url = `${SITE_ORIGIN}${page.canonicalPath}`;
  const pageId = `${url}#webpage`;
  const isHome = page.canonicalPath === "/";
  const homeCrumb = { item: `${SITE_ORIGIN}/`, name: marketing.names.name } as const;
  const providerSegment = page.canonicalPath.startsWith("/providers/")
    ? page.canonicalPath.slice("/providers/".length, -1)
    : undefined;
  const breadcrumbItems = isHome
    ? undefined
    : page.canonicalPath !== "/docs/" && page.canonicalPath.startsWith("/docs/")
      ? [
        homeCrumb,
        { item: `${SITE_ORIGIN}/docs/`, name: "Documentation" },
        { item: url, name: page.title },
      ]
      : page.canonicalPath !== "/compare/" && page.canonicalPath.startsWith("/compare/")
        ? [
          homeCrumb,
          { item: `${SITE_ORIGIN}/compare/`, name: "Comparisons" },
          { item: url, name: page.title },
        ]
        : page.canonicalPath === "/providers/"
          ? [homeCrumb, { item: url, name: "Providers" }]
          : providerSegment !== undefined
            ? [
              homeCrumb,
              { item: `${SITE_ORIGIN}/providers/`, name: "Providers" },
              { item: url, name: providerSegment },
            ]
            : [homeCrumb, { item: url, name: page.title }];
  const pageGraph: Array<Readonly<Record<string, unknown>>> = [
    {
      "@id": pageId,
      "@type": "WebPage",
      breadcrumb: isHome ? undefined : { "@id": `${url}#breadcrumb` },
      description: page.description,
      inLanguage: "en",
      isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
      mainEntity: { "@id": isHome ? `${SITE_ORIGIN}/#software` : `${url}#article` },
      name: page.title,
      url,
    },
  ];

  if (!isHome) {
    const image = editorialImage(page.canonicalPath);
    pageGraph.push(
      {
        "@id": `${url}#article`,
        "@type": "TechArticle",
        about: { "@id": `${SITE_ORIGIN}/#software` },
        author: { "@id": HRANESS_ORGANIZATION_ID },
        description: page.description,
        headline: page.title,
        image: image === undefined ? undefined : imageObject(image),
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        mainEntityOfPage: { "@id": pageId },
        publisher: { "@id": HRANESS_ORGANIZATION_ID },
      },
      {
        "@id": `${url}#breadcrumb`,
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems?.map((item, index) => ({
          "@type": "ListItem",
          ...item,
          position: index + 1,
        })),
      },
    );
  }

  return {
    "@context": "https://schema.org",
    "@graph": [...sharedJsonLd(identity), ...pageGraph],
  };
}

const CONTENT_FOOTER_LINKS = [
  { href: "/docs/", label: "Docs" },
  { href: "/docs/reference/provider-capabilities/", label: "Providers" },
  { href: "/compare/", label: "Compare" },
  { href: BLOG_PATH, label: "Blog" },
  { href: "/about/", label: "About" },
  { href: "/contact/", label: "Contact" },
  { href: "/privacy/", label: "Privacy" },
  { href: "/llms.txt", label: "llms.txt" },
  { href: REPOSITORY_URL, label: 'GitHub <span aria-hidden="true">↗</span>' },
] as const;

// The in-flow product footer is GhostGet's own composition around the shared
// Hraness network footer: same row contract and GhostGet brand.
function renderGhostgetContentFooter(): string {
  const links = CONTENT_FOOTER_LINKS
    .map(({ href, label }) => `<a class="hraness-marketing-footer__link" href="${href}">${label}</a>`)
    .join("\n      ");
  return `<footer aria-label="GhostGet" class="hraness-marketing-footer" data-hraness-marketing="footer">
  <div class="hraness-marketing-footer__inner">
    <a class="hraness-marketing-footer__brand" data-foil="" href="/" aria-label="GhostGet home"><span aria-hidden="true" class="brand-mark hraness-foil-mark" data-foil=""><img alt="" class="hraness-foil-mark__image" decoding="async" height="20" src="/marks/wrench.svg" width="20" /><span aria-hidden="true" class="hraness-foil-mark__paint"></span></span><span class="hraness-marketing-footer__name">GhostGet</span></a>
    <nav aria-label="Footer navigation" class="hraness-marketing-footer__nav">
      ${links}
    </nav>
  </div>
</footer>`;
}

// Every page carries the product's content footer immediately before the
// shared Hraness network footer so the two read as one band; indexable pages
// keep the Ask AI row above the pair. Templates must not add another project
// information row or duplicate this navigation.
function renderInFlowFooters(options: RenderOptions, page?: PublicPage): string {
  const above = page === undefined
    ? ""
    : `${renderAskAiAboutThis(`${SITE_ORIGIN}${page.canonicalPath}`)}\n`;
  return `${above}${options.ghostgetContentFooter}\n${options.hranessSiteFooter}`;
}

const GHOSTGET_BUN_NOTE = 'Requires <a href="https://bun.sh/docs/installation">Bun 1.3.14</a>.';
const GHOSTGET_PLATFORM_BADGES = renderPlatformBadges(["macos", "linux", { id: "windows", note: "via WSL2" }]);

/**
 * The install command for each platform, in the portfolio order macOS, Linux,
 * Windows. The command is the same Bun install everywhere GhostGet runs.
 */
function renderGhostgetPlatformInstall(installCommand: string): string {
  return renderPlatformInstall({
    analyticsCommand: "cli",
    id: "ghostget-install",
    platforms: [
      {
        command: installCommand,
        id: "macos",
        noteHtml: `${GHOSTGET_BUN_NOTE} The optional iMessage and WhatsApp helpers and the menu bar app need Apple silicon.`,
        shell: "Terminal",
      },
      {
        command: installCommand,
        id: "linux",
        noteHtml: `${GHOSTGET_BUN_NOTE} The iMessage and WhatsApp helpers and the menu bar app are macOS only.`,
        shell: "Terminal",
      },
      {
        command: installCommand,
        id: "windows",
        noteHtml: GHOSTGET_BUN_NOTE,
        shell: "WSL2 terminal",
        unavailable: true,
        unavailableNoteHtml: "GhostGet isn’t tested on Windows. It runs in WSL2 with the Linux command.",
      },
    ],
  });
}

function renderTemplate(
  template: string,
  options: RenderOptions,
  page?: PublicPage,
  structuredDataOverride?: Readonly<Record<string, unknown>>,
): string {
  const { packageIdentity: identity } = options;
  const installCommand = `bun add --global ${versionedPackageArtifactUrl(identity)}`;
  const skillInstallCommands = agentSkillInstallCommands(identity);
  let rendered = template.includes("{{LAUNCH_MOCKUP:")
    ? renderLaunchMockupSlots(template, launchServicesFrom(options.providerDirectory.entries))
    : template;
  rendered = renderMarketingCopy(rendered);
  rendered = replaceHtmlRequired(rendered, "{{ANALYTICS_ASSET}}", escapeHtml(options.analyticsAsset));
  rendered = replaceHtmlRequired(rendered, "{{CSS_ASSET}}", escapeHtml(options.cssAsset));
  rendered = replaceHtmlRequired(rendered, "{{FOIL_ASSET}}", escapeHtml(options.foilAsset));
  if (rendered.includes("{{HRANESS_SITE_FOOTER}}")) {
    rendered = replaceRequired(rendered, "<body>", '<body class="hraness-site-shell">');
    rendered = replaceRequired(
      rendered,
      "{{HRANESS_SITE_FOOTER}}",
      renderInFlowFooters(options, page),
    );
  }
  if (page) {
    if (Object.hasOwn(essayReviews, page.sourceFile)) {
      rendered = replaceRequired(rendered, "{{ESSAY_PROVENANCE}}", renderArticleProvenanceHtml(essayReviews[page.sourceFile as keyof typeof essayReviews]));
    }
    const structuredData = JSON.stringify(structuredDataOverride ?? jsonLd(identity, page)).replaceAll("<", "\\u003c");
    rendered = replaceRequired(rendered, "{{JSON_LD}}", structuredData);
    rendered = replaceRequired(
      rendered,
      "{{MARKDOWN_ALTERNATE}}",
      `<link rel="alternate" type="text/markdown" title="Markdown" href="${SITE_ORIGIN}${markdownSiblingPath(page.canonicalPath)}">`,
    );
    const image = editorialImage(page.canonicalPath);
    if (image === undefined) {
      if (/\{\{EDITORIAL_(?:FIGURE|IMAGE_)/u.test(rendered)) {
        throw new Error(`Only registered editorial pages may use editorial image placeholders: ${page.canonicalPath}`);
      }
    } else if (!page.canonicalPath.startsWith("/blog/")) {
      const editorialValues = new Map([
        ["{{EDITORIAL_FIGURE}}", renderEditorialFigure(image)],
        ["{{EDITORIAL_IMAGE_ALT}}", escapeHtml(image.alt)],
        ["{{EDITORIAL_IMAGE_HEIGHT}}", String(image.height)],
        ["{{EDITORIAL_IMAGE_URL}}", editorialImageUrl(image)],
        ["{{EDITORIAL_IMAGE_WIDTH}}", String(image.width)],
      ]);
      for (const [placeholder, value] of editorialValues) {
        rendered = replaceRequired(rendered, placeholder, value);
      }
    }
    if (page.canonicalPath === "/") {
      rendered = replaceRequired(rendered, "{{EDITORIAL_CARDS}}", renderEditorialCards());
      rendered = replaceRequired(rendered, "{{RELATED_GROUPS}}", renderRelatedGroups(RELATED_PRODUCT_IDS));
    } else if (/\{\{(?:EDITORIAL_CARDS|RELATED_GROUPS)\}\}/u.test(rendered)) {
      throw new Error("Editorial and related cards belong only on the homepage.");
    }
  } else if (rendered.includes("{{JSON_LD}}")) {
    throw new Error("A non-indexable page must not include structured data.");
  } else if (rendered.includes("{{MARKDOWN_ALTERNATE}}")) {
    throw new Error("A non-indexable page must not advertise a markdown alternate.");
  }
  rendered = replaceHtmlRequired(rendered, "{{POSTHOG_HOST}}", escapeHtml(options.postHogHost));
  rendered = replaceHtmlRequired(rendered, "{{POSTHOG_KEY}}", escapeHtml(options.postHogKey));
  // The analytics client classifies a page from this build-time route, so a
  // new public page can never be reported as a not-found render. The 404
  // template renders without a page and so carries an empty route.
  rendered = rendered.replace(
    /<meta name="ghostget-posthog-key" content="[^"]*">/u,
    (meta) => `${meta}\n    <meta name="${ANALYTICS_ROUTE_META}" content="${escapeHtml(page?.canonicalPath ?? "")}">`,
  );
  if (page?.canonicalPath === "/" || page?.canonicalPath === "/docs/reference/provider-capabilities/" || page?.canonicalPath === "/providers/") {
    rendered = replaceRequired(
      rendered,
      "{{PROVIDER_OVERVIEW_CARDS}}",
      options.providerOverviewCards,
    );
  } else if (rendered.includes("{{PROVIDER_OVERVIEW_CARDS}}")) {
    throw new Error("Only the homepage and provider capability page may include provider cards.");
  }
  if (page?.canonicalPath === "/docs/reference/provider-capabilities/") {
    rendered = replaceRequired(
      rendered,
      "{{PROVIDER_ATTESTATION_GROUPS}}",
      options.providerAttestationGroups,
    );
  } else if (rendered.includes("{{PROVIDER_ATTESTATION_GROUPS}}")) {
    throw new Error("Only the provider capability page may include provider operation groups.");
  }
  if (page?.canonicalPath === "/docs/how-to/connect-beeper/") {
    rendered = replaceRequired(
      rendered,
      "{{BEEPER_ARTIFACT_TABLE}}",
      options.beeperFacts.artifactTable,
    );
  } else if (rendered.includes("{{BEEPER_ARTIFACT_TABLE}}")) {
    throw new Error("Only the Beeper provider page may include the Beeper artifact table.");
  }
  const attestationCounts = new Map([
    ["{{PROVIDER_CAPABILITY_ADAPTER_COUNT}}", String(options.attestation.adapterCount)],
    [
      "{{PROVIDER_CAPABILITY_CAPTURE_REQUIRED_COUNT}}",
      String(options.attestation.captureRequiredCount),
    ],
    ["{{PROVIDER_CAPABILITY_OBSERVED_COUNT}}", String(options.attestation.observedCount)],
    ["{{PROVIDER_CALLABLE_ACTION_COUNT}}", String(options.providerDirectory.entries.reduce((sum, entry) => sum + entry.supportedActionCount, 0))],
    ["{{PROVIDER_CAPABILITY_OPERATION_COUNT}}", String(options.attestation.operationCount)],
    ["{{PROVIDER_SURFACE_COUNT}}", String(options.providerDirectory.providerCount)],
  ]);
  for (const [placeholder, value] of attestationCounts) {
    if (rendered.includes(placeholder)) {
      rendered = replaceRequired(rendered, placeholder, value);
    }
  }
  if (rendered.includes("{{PROVIDER_CAPABILITY")) {
    throw new Error("Unknown provider capability placeholder.");
  }
  const optionalValues = new Map([
    ["{{GHOSTGET_DESCRIPTION}}", identity.description],
    ["{{GHOSTGET_SOCIAL_IMAGE_ALT}}", SOCIAL_IMAGE_ALT],
    ["{{GHOSTGET_INSTALL_COMMAND}}", installCommand],
    ["{{GHOSTGET_PACKAGE_ARTIFACT}}", versionedPackageArtifactUrl(identity)],
    ["{{GHOSTGET_RELEASE}}", identity.release],
    ["{{GHOSTGET_REPOSITORY}}", REPOSITORY_URL],
    ["{{GHOSTGET_SKILLS}}", SKILLS_URL],
    ["{{GHOSTGET_SKILL_INSTALL_ASSET}}", options.skillInstallAsset],
    ["{{GHOSTGET_PLATFORM_INSTALL_ASSET}}", options.platformInstallAsset],
    ["{{GHOSTGET_SKILL_INSTALL_COMMAND}}", skillInstallCommands.npx],
    ["{{GHOSTGET_SKILL_INSTALL_COMMAND_BUNX}}", skillInstallCommands.bunx],
    ["{{GHOSTGET_VERSION}}", identity.version],
    ["{{BEEPER_ADAPTER_VERSION}}", options.beeperFacts.adapterVersion],
    [
      "{{BEEPER_CLI_BACKED_OPERATION_COUNT}}",
      String(options.beeperFacts.cliBackedOperationCount),
    ],
    ["{{BEEPER_CLI_COMMAND_COUNT}}", String(options.beeperFacts.cliCommandCount)],
    ["{{BEEPER_CLI_COMMIT}}", options.beeperFacts.cliCommit],
    ["{{BEEPER_CLI_RELEASE_MANIFEST_SHA256}}", options.beeperFacts.cliReleaseManifestSha256],
    ["{{BEEPER_CLI_RELEASE_URL}}", options.beeperFacts.cliReleaseUrl],
    ["{{BEEPER_CLI_SOURCE_DECLARED_VERSION}}", options.beeperFacts.cliSourceDeclaredVersion],
    ["{{BEEPER_CLI_SOURCE_PACKAGE_PATH}}", options.beeperFacts.cliSourcePackagePath],
    ["{{BEEPER_CLI_SOURCE_VERSION_DISCREPANCY}}", options.beeperFacts.cliSourceVersionDiscrepancy],
    ["{{BEEPER_CLI_VERSION}}", options.beeperFacts.cliVersion],
    ["{{BEEPER_DESKTOP_API_COMMIT}}", options.beeperFacts.desktopApiCommit],
    ["{{BEEPER_DESKTOP_API_VERSION}}", options.beeperFacts.desktopApiVersion],
    [
      "{{BEEPER_DESKTOP_LOOPBACK_OPERATION_COUNT}}",
      String(options.beeperFacts.desktopLoopbackOperationCount),
    ],
    ["{{BEEPER_OBSERVED_OPERATION_COUNT}}", String(options.beeperFacts.observedOperationCount)],
    ["{{BEEPER_PAGE_DESCRIPTION}}", options.beeperFacts.pageDescription],
    ["{{BEEPER_PAGE_TITLE}}", options.beeperFacts.pageTitle],
    ["{{BEEPER_SEMANTIC_CONTRACT_VERSION_LABEL}}", options.beeperFacts.semanticContractVersionLabel],
    ["{{WHATSAPP_ADAPTER_VERSION}}", options.whatsappFacts.adapterVersion],
    ["{{WHATSAPP_ARCHIVE_SHA256}}", options.whatsappFacts.archiveSha256],
    ["{{WHATSAPP_BINARY_SHA256}}", options.whatsappFacts.binarySha256],
    ["{{WHATSAPP_OBSERVED_OPERATION_COUNT}}", String(options.whatsappFacts.observedOperationCount)],
    ["{{WHATSAPP_PAGE_DESCRIPTION}}", options.whatsappFacts.pageDescription],
    ["{{WHATSAPP_PAGE_TITLE}}", options.whatsappFacts.pageTitle],
    ["{{WHATSAPP_WACLI_COMMIT}}", options.whatsappFacts.wacliCommit],
    ["{{WHATSAPP_WACLI_VERSION}}", options.whatsappFacts.wacliVersion],
  ]);
  for (const [placeholder, value] of optionalValues) {
    if (rendered.includes(placeholder)) {
      rendered = rendered.replaceAll(placeholder, escapeHtml(value));
    }
  }
  if (rendered.includes("{{GHOSTGET_PLATFORM_INSTALL}}")) {
    rendered = rendered.replaceAll("{{GHOSTGET_PLATFORM_INSTALL}}", renderGhostgetPlatformInstall(installCommand));
  }
  if (rendered.includes("{{GHOSTGET_PLATFORM_BADGES}}")) {
    rendered = rendered.replaceAll("{{GHOSTGET_PLATFORM_BADGES}}", GHOSTGET_PLATFORM_BADGES);
  }
  const codeExamples = new Map<string, readonly [string, SyntaxLanguage]>([
    ["{{GHOSTGET_READ_CODE}}", ["ghostget read https://example.com", "shell"]],
    ["{{GHOSTGET_SKILL_CODE}}", [skillInstallCommands.npx, "shell"]],
    ["{{GHOSTGET_CAPABILITIES_CODE}}", ["ghostget capabilities --json", "shell"]],
    ["{{GHOSTGET_SDK_CODE}}", ['import { isProviderPluginId } from "@hraness/ghostget"', "typescript"]],
  ]);
  for (const [placeholder, [source, language]] of codeExamples) {
    if (!rendered.includes(placeholder)) continue;
    const code = highlightCode(source, language, { styles: "classes" });
    const tag = placeholder === "{{GHOSTGET_READ_CODE}}" ? "span" : "code";
    const markup = `<${tag} class="${code.className}" data-language="${code.language}">${code.html}</${tag}>`;
    rendered = rendered.replaceAll(placeholder, () => markup);
  }
  if (page !== undefined && rendered.includes("{{WEBMCP_")) {
    const webmcpValues = options.webmcpValues(page.canonicalPath);
    if (webmcpValues === undefined) {
      throw new Error(`No WebMCP template values exist for ${page.canonicalPath}.`);
    }
    rendered = substituteTemplateValues(rendered, webmcpValues);
  }
  if (page?.canonicalPath === CLAIMS_PAGE_PATH) {
    for (const [placeholder, value] of Object.entries(options.claimsValues)) {
      if (!rendered.includes(placeholder)) {
        throw new Error(`The claims register page is missing ${placeholder}.`);
      }
      // A function replacement keeps `$` sequences in register text literal.
      rendered = rendered.replaceAll(placeholder, () => value);
    }
  } else if (rendered.includes("{{CLAIMS_")) {
    throw new Error("Only the claims register page may include claims template values.");
  }
  if (/\{\{[A-Z0-9_]+\}\}/u.test(rendered)) {
    throw new Error("The rendered page contains an unresolved template value.");
  }
  return rendered;
}

/**
 * The shared design-kit 404 body. The primary action matches the homepage
 * hero; the three next links cover what GhostGet is, the install guide, and
 * the provider reference. `routes` feeds "Did you mean" and is never listed.
 */
export function renderGhostgetStatusPage(routes: readonly StatusPageLink[]): string {
  return renderStatusPageHtml({
    agentIndexHref: "/llms.txt",
    next: [
      {
        description: "Install the CLI, read your first page, and watch the recorded demo.",
        href: "/docs/tutorials/getting-started/",
        label: "Getting started",
      },
      {
        description: "Every site and named action your agent can call, and how each one runs.",
        href: "/docs/reference/provider-capabilities/",
        label: "Supported sites and actions",
      },
      {
        description: "What the CLI and SDK do, and what they leave to your agent.",
        href: "/about/",
        label: "About GhostGet",
      },
    ],
    primaryAction: { href: "/#start", label: "Install GhostGet" },
    rootElement: "div",
    routes,
    siteName: marketing.names.name,
  });
}

const STATUS_ROUTE_LABEL_LIMIT = 48;

/** A page title cut to the lead clause the "Did you mean" hint can show. */
export function statusRouteLabel(title: string): string {
  const lead = title.split(":")[0]!.split(", and ")[0]!.trim();
  if (lead.length <= STATUS_ROUTE_LABEL_LIMIT) return lead;
  const cut = lead.slice(0, STATUS_ROUTE_LABEL_LIMIT - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

/** Known pages for "Did you mean": every public page, the blog, and each listed post. */
export function statusPageRoutes(
  pages: readonly Pick<PublicPage, "canonicalPath" | "title">[],
  posts: readonly Pick<BlogPost, "slug" | "title">[],
): StatusPageLink[] {
  return [
    ...pages.map((page) => {
      // WebMCP registry pages carry long registry titles; the domain reads better.
      const provider = /^\/providers\/([^/]+)\/$/u.exec(page.canonicalPath)?.[1];
      return {
        href: page.canonicalPath,
        label: statusRouteLabel(provider === undefined ? page.title : `${provider} on GhostGet`),
      };
    }),
    { href: BLOG_PATH, label: statusRouteLabel(BLOG_TITLE) },
    ...posts.map((post) => ({ href: blogPostPath(post.slug), label: statusRouteLabel(post.title) })),
  ];
}

export function renderPreview(template: string, cssAsset: string): string {
  const rendered = replaceRequired(template, "{{CSS_ASSET}}", escapeHtml(cssAsset));
  if (/\{\{[A-Z0-9_]+\}\}/u.test(rendered)) {
    throw new Error("The rendered preview contains an unresolved template value.");
  }
  return rendered;
}

export function renderSitemapXml(
  pages: readonly PublicPage[] = PUBLIC_PAGES,
  datedPaths: readonly SitemapPath[] = [],
): string {
  const dated = datedPaths.map((entry) => {
    const lastModified = entry.lastModified === undefined
      ? ""
      : `
    <lastmod>${escapeXml(typeof entry.lastModified === "string" ? entry.lastModified : entry.lastModified.toISOString())}</lastmod>`;
    const image = editorialImage(entry.path);
    const imageMarkup = image === undefined ? "" : `
    <image:image><image:loc>${escapeXml(editorialImageUrl(image))}</image:loc><image:title>${escapeXml(image.title)}</image:title></image:image>`;
    return `  <url>
    <loc>${SITE_ORIGIN}${entry.path}</loc>${lastModified}${imageMarkup}
  </url>`;
  });
  const urls = [...pages.filter((page) => !isNoindexDocumentPath(page.canonicalPath)).map((page) => {
    const image = editorialImage(page.canonicalPath);
    const imageMarkup = image === undefined ? "" : `
    <image:image>
      <image:loc>${escapeXml(editorialImageUrl(image))}</image:loc>
      <image:title>${escapeXml(image.title)}</image:title>
      <image:caption>${escapeXml(image.caption)}</image:caption>
    </image:image>`;
    return `  <url>
    <loc>${SITE_ORIGIN}${page.canonicalPath}</loc>${imageMarkup}
  </url>`;
  }), ...dated].join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;
}

export type RenderedBlogPage = Readonly<{
  html: string;
  indexable: boolean;
  page: PublicPage;
}>;

/** The blog index plus one page per post; non-indexable posts render with noindex and no structured data. */
function renderBlogPages(
  shell: string,
  fragments: ReadonlyMap<string, string>,
  options: RenderOptions,
): RenderedBlogPage[] {
  const shared = sharedJsonLd(options.packageIdentity);
  const indexPage: PublicPage = {
    canonicalPath: BLOG_PATH,
    description: BLOG_DESCRIPTION,
    outputFile: "blog/index.html",
    sourceFile: "blog.html",
    title: BLOG_TITLE,
  };
  const pages: RenderedBlogPage[] = [{
    html: renderTemplate(
      fillBlogShell(shell, BLOG_SITE, {
        canonicalPath: BLOG_PATH,
        description: BLOG_DESCRIPTION,
        indexable: true,
        ogType: "website",
        title: BLOG_TITLE,
      }, renderBlogIndexMain()),
      options,
      indexPage,
      blogIndexJsonLd(BLOG_SITE, shared, HRANESS_ORGANIZATION_ID),
    ),
    indexable: true,
    page: indexPage,
  }];
  for (const post of BLOG_POSTS) {
    const fragment = fragments.get(post.bodyFile);
    if (fragment === undefined) throw new Error(`Missing blog body ${post.bodyFile}.`);
    const canonicalPath = blogPostPath(post.slug);
    const page: PublicPage = {
      canonicalPath,
      description: post.dek,
      outputFile: `${canonicalPath.slice(1)}index.html`,
      sourceFile: `blog/${post.bodyFile}`,
      title: post.title,
    };
    const indexable = isIndexablePost(post);
    const filled = fillBlogShell(shell, BLOG_SITE, {
      canonicalPath,
      description: post.dek,
      indexable,
      ogType: "article",
      publishedTime: `${post.published}T00:00:00.000Z`,
      title: post.title,
    }, renderBlogPostMain(post, renderLaunchPostBody(fragment, launchServicesFrom(options.providerDirectory.entries))));
    pages.push({
      html: indexable
        ? renderTemplate(filled, options, page, blogPostJsonLd(post, BLOG_SITE, shared, HRANESS_ORGANIZATION_ID))
        : renderTemplate(filled, options),
      indexable,
      page,
    });
  }
  return pages;
}

export function renderIndex(template: string, options: RenderOptions): string {
  return renderTemplate(template, options, PUBLIC_PAGES[0]);
}

function contentHash(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function postHogEnvironment(environment: Readonly<Record<string, string | undefined>>): {
  host: string;
  key: string;
} {
  const host = environment.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST;
  if (!supportedPostHogHosts.has(host)) {
    throw new Error(`Unsupported NEXT_PUBLIC_POSTHOG_HOST: ${host}`);
  }
  const key = environment.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? "";
  if (key !== "" && !/^phc_[A-Za-z0-9_-]+$/u.test(key)) {
    throw new Error("NEXT_PUBLIC_POSTHOG_KEY must be empty or a public phc_ project token.");
  }
  return { host, key };
}

export function ghostgetMailingListConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): HranessMailingListConfig {
  if (environment.VERCEL_ENV !== "production") return { kind: "none" };
  return {
    audience: "wrench",
    kind: "signup",
  };
}

export async function buildWebsite(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  const marketingPreset = await snapshotMarketingPreset(join(repositoryRoot, "website/vendor/marketing-preset"));
  const [
    manifest,
    publicTemplates,
    previewTemplate,
    notFoundTemplate,
    notFoundMarkdown,
    llmsTemplate,
    css,
    paperThemeCss,
    marketingForcedColorsCss,
    paletteSystemCss,
    paletteBridgeCss,
    uiCss,
    designKitFontsCss,
    designKitTypographyCss,
    designKitProductMarketingCss,
    designKitPlainSiteCss,
    designKitPlainPublicationCss,
    designKitStatusPageCss,
    designKitMockupsCss,
    hranessSiteFooterCss,
    blogShell,
    blogFragments,
    browserBuild,
    attestation,
    claimsSource,
  ] = await Promise.all([
    Bun.file(join(repositoryRoot, "package.json")).json(),
    Promise.all(PUBLIC_PAGES.map((page) => readFile(join(sourceRoot, page.sourceFile), "utf8"))),
    readFile(join(sourceRoot, "preview.html"), "utf8"),
    readFile(join(sourceRoot, "404.html"), "utf8"),
    readFile(join(sourceRoot, "404.md"), "utf8"),
    readFile(join(sourceRoot, "llms.txt"), "utf8"),
    Promise.all([
      readFile(join(sourceRoot, "styles.css"), "utf8"),
      readFile(join(websiteRoot, "launch/mockups.css"), "utf8"),
    ]).then((parts) => parts.map((part) => part.trimEnd()).join("\n\n")),
    readFile(join(repositoryRoot, "website/vendor/paper-theme/paper-theme.css"), "utf8"),
    readFile(join(repositoryRoot, "website/vendor/marketing-forced-colors/marketing-forced-colors.css"), "utf8"),
    readFile(fileURLToPath(import.meta.resolve("@hraness/design-kit/palette-system.css")), "utf8"),
    readFile(fileURLToPath(import.meta.resolve("@hraness/design-kit/palette-bridge.css")), "utf8"),
    readUiStylesheet(),
    readFile(designKitFontsStylesPath, "utf8"),
    readFile(designKitTypographyStylesPath, "utf8"),
    Promise.all([
      readFile(designKitProductMarketingStylesPath, "utf8"),
      readFile(fileURLToPath(import.meta.resolve(designKitMarketingStylesImports["./syntax-highlighting.css"])), "utf8"),
      readFile(fileURLToPath(import.meta.resolve(designKitMarketingStylesImports["./site-shell.css"])), "utf8"),
    ]).then(([grammar, syntax, siteShell]) => compileDesignKitMarketingStyles(grammar, {
      "./syntax-highlighting.css": syntax,
      "./site-shell.css": siteShell,
    })),
    readFile(designKitPlainSiteStylesPath, "utf8").then(compileDesignKitPlainSiteStyles),
    readFile(designKitPlainPublicationStylesPath, "utf8"),
    readFile(fileURLToPath(import.meta.resolve("@hraness/design-kit/status-page.css")), "utf8"),
    readFile(fileURLToPath(import.meta.resolve("@hraness/design-kit/mockups.css")), "utf8"),
    readFile(
      fileURLToPath(import.meta.resolve("@hraness/site-footer/stylex.css")),
      "utf8",
    ),
    readFile(join(sourceRoot, "blog.html"), "utf8"),
    Promise.all(BLOG_POSTS.map(async (post) => [
      post.bodyFile,
      await readFile(join(sourceRoot, "blog", post.bodyFile), "utf8"),
    ] as const)).then((entries) => new Map(entries)),
    // One shared build keeps every package file on one parse: bun's in-process
    // bundler reuses a closed resolver-cache fd when sibling builds revisit a
    // symlinked dependency inside a `bun test` process (oven-sh/bun#33099).
    Bun.build({
      entrypoints: [
        join(sourceRoot, "analytics.ts"),
        join(sourceRoot, "skill-install-command.ts"),
        join(sourceRoot, "platform-install.ts"),
        join(sourceRoot, "foil.ts"),
        join(sourceRoot, "status-page.ts"),
      ],
      format: "esm",
      minify: true,
      sourcemap: "none",
      target: "browser",
    }),
    loadProviderCapabilityAttestation(repositoryRoot),
    readClaimsRegisterSource(repositoryRoot),
  ]);
  const webmcpSnapshot: WebmcpRegistrySnapshot = parseWebmcpRegistrySnapshot(
    webmcpRegistrySource,
  );
  const webmcpPages = webmcpProviderPages(webmcpSnapshot);
  const webmcpSitesByPath = new Map(
    webmcpSnapshot.sites.map((site) => [webmcpSiteCanonicalPath(site.domain), site] as const),
  );
  const webmcpIndexValues = webmcpIndexTemplateValues(webmcpSnapshot);
  const allPages: readonly PublicPage[] = [...PUBLIC_PAGES, ...webmcpPages];
  if (!browserBuild.success || browserBuild.outputs.length !== 5) {
    const messages = browserBuild.logs.map((log) => log.message).join("\n");
    throw new Error(`Browser script build failed: ${messages || "no browser output"}`);
  }
  const browserAssets = new Map(browserBuild.outputs.map((output) => [basename(output.path, ".js"), output]));
  const scriptAsset = async (name: string) => {
    const output = browserAssets.get(name);
    if (output === undefined) throw new Error(`Browser script ${name} missing from the shared build.`);
    return output.arrayBuffer();
  };
  const analytics = new Uint8Array(await scriptAsset("analytics"));
  const skillInstall = new Uint8Array(await scriptAsset("skill-install-command"));
  const platformInstall = new Uint8Array(await scriptAsset("platform-install"));
  const foil = new Uint8Array(await scriptAsset("foil"));
  const statusPage = new Uint8Array(await scriptAsset("status-page"));
  const identity = parsePackageIdentity(manifest);
  if (identity.release !== CONTENT_REVIEWED_RELEASE) {
    throw new Error(
      `Website content is reviewed for ${CONTENT_REVIEWED_RELEASE}, not ${identity.release}. Review every public page before updating CONTENT_REVIEWED_RELEASE.`,
    );
  }
  const postHog = postHogEnvironment(environment);
  // The UI facade establishes its complete layer order before the static
  // marketing grammar and footer. Product tokens and composition follow them.
  const compiledCss = `${uiCss}\n\n${designKitFontsCss.trim()}\n\n${designKitTypographyCss.trim()}\n\n${designKitProductMarketingCss.trim()}\n\n${designKitPlainSiteCss.replace('@import "./site-shell.css";', "").trim()}\n\n${designKitPlainPublicationCss.trim()}\n\n${designKitStatusPageCss.trim()}\n\n${designKitMockupsCss.trim()}\n\n${hranessSiteFooterCss.trim()}\n\n${paperThemeCss.trim()}\n\n${paletteSystemCss.trim()}\n\n${paletteBridgeCss.replace('@import "./palette-system.css";', "").trim()}\n\n${renderRelatedStyles(RELATED_PRODUCT_IDS)}\n\n${css.trimEnd()}\n\n${marketingPreset.files.get("product-marketing-preset.css")!.toString("utf8")}\n\n${marketingForcedColorsCss.trim()}\n`;
  const cssAsset = `/assets/styles-${contentHash(compiledCss)}.css`;
  const analyticsAsset = `/assets/analytics-${contentHash(analytics)}.js`;
  const skillInstallAsset = `/assets/skill-install-${contentHash(skillInstall)}.js`;
  const platformInstallAsset = `/assets/platform-install-${contentHash(platformInstall)}.js`;
  const foilAsset = `/assets/foil-${contentHash(foil)}.js`;
  const statusPageAsset = `/assets/status-page-${contentHash(statusPage)}.js`;
  const providerDirectory = createProviderDirectory(attestation);
  const beeperFacts = createBeeperPresentationFacts(providerDirectory);
  const whatsappFacts = createWhatsAppPresentationFacts(providerDirectory, attestation);
  if (providerDirectory.providerCount !== LAUNCH_SERVICE_COUNT) {
    throw new Error(
      `The launch facts say ${LAUNCH_SERVICE_COUNT} services but the provider directory lists ${providerDirectory.providerCount}. Update website/launch/facts.ts.`,
    );
  }
  const renderOptions = {
    analyticsAsset,
    attestation,
    beeperFacts,
    claimsValues: claimsTemplateValues(
      claimsSource.register,
      (path) => `${REPOSITORY_URL}/blob/${identity.release}/${path}`,
    ),
    cssAsset,
    foilAsset,
    ghostgetContentFooter: renderGhostgetContentFooter(),
    hranessSiteFooter: renderHranessSiteFooter({
      mailingList: ghostgetMailingListConfig(environment),
      support: ghostgetSupportProfile,
    }),
    packageIdentity: identity,
    postHogHost: postHog.host,
    postHogKey: postHog.key,
    providerAttestationGroups: renderProviderAttestationGroups(providerDirectory, attestation),
    providerDirectory,
    providerOverviewCards: renderProviderOverviewCards(providerDirectory),
    skillInstallAsset,
    platformInstallAsset,
    webmcpValues: (canonicalPath: string) => {
      const shared = webmcpSharedTemplateValues(webmcpSnapshot);
      if (canonicalPath === "/providers/") return webmcpIndexValues;
      const site = webmcpSitesByPath.get(canonicalPath);
      return site === undefined
        ? shared
        : { ...shared, ...webmcpSiteTemplateValues(site) };
    },
    whatsappFacts,
  } as const;

  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(join(outputRoot, "assets"), { recursive: true });
  await mkdir(join(outputRoot, "preview"), { recursive: true });
  for (const [path, bytes] of marketingPreset.files) {
    if (path === "product-marketing-preset.css" || path === "check.mjs" || path === "check.d.mts") continue;
    const publicPath = path === "LICENSE" ? "marketing-assets/LICENSE" : path;
    const destination = join(outputRoot, "assets", publicPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  const webmcpSiteTemplate = await readFile(join(sourceRoot, "provider-webmcp-site.html"), "utf8");
  await Promise.all(allPages.map((page) => mkdir(dirname(join(outputRoot, page.outputFile)), {
    recursive: true,
  })));
  const renderedPages: { page: PublicPage; html: string }[] = PUBLIC_PAGES.map((page, index) => ({
    page,
    html: renderTemplate(publicTemplates[index]!, renderOptions, page),
  }));
  const blogPages = renderBlogPages(blogShell, blogFragments, renderOptions);
  await Promise.all(blogPages.map(({ page }) => mkdir(dirname(join(outputRoot, page.outputFile)), {
    recursive: true,
  })));
  for (const page of webmcpPages) {
    renderedPages.push({
      page,
      html: renderTemplate(webmcpSiteTemplate, renderOptions, page),
    });
  }
  for (const { page, html } of renderedPages) assertPageRobots(page, html);
  await Promise.all([
    cp(designKitFontsDirectory, join(outputRoot, "assets/fonts"), {
      dereference: true,
      recursive: true,
      // Retain every file while avoiding Bun's stalled native recursive copy.
      filter: () => true,
    }),
    ...renderedPages.map(({ page, html }) => writeFile(join(outputRoot, page.outputFile), html)),
    ...renderedPages.map(({ page, html }) => writeFile(
      join(outputRoot, markdownSiblingPath(page.canonicalPath).slice(1)),
      htmlMainToMarkdown(html, `${SITE_ORIGIN}${page.canonicalPath}`),
    )),
    ...blogPages.map(({ page, html }) => writeFile(join(outputRoot, page.outputFile), html)),
    ...blogPages.filter(({ indexable }) => indexable).map(({ page, html }) => writeFile(
      join(outputRoot, markdownSiblingPath(page.canonicalPath).slice(1)),
      htmlMainToMarkdown(html, `${SITE_ORIGIN}${page.canonicalPath}`),
    )),
    writeFile(join(outputRoot, BLOG_FEED_PATH.slice(1)), renderBlogAtomFeed(BLOG_SITE)),
    writeFile(join(outputRoot, CLAIMS_JSON_OUTPUT), claimsSource.json),
    writeFile(join(outputRoot, "preview/index.html"), renderPreview(previewTemplate, cssAsset)),
    writeFile(join(outputRoot, "404.html"), renderTemplate(
      // A function replacement keeps "$" in route labels literal.
      replaceHtmlRequired(notFoundTemplate, "{{STATUS_PAGE_ASSET}}", escapeHtml(statusPageAsset)).replace(
        "{{STATUS_PAGE}}",
        () => renderGhostgetStatusPage(statusPageRoutes(allPages, BLOG_POSTS.filter(isIndexablePost))),
      ),
      renderOptions,
    )),
    writeFile(join(outputRoot, "404.md"), renderTemplate(notFoundMarkdown, renderOptions)),
    writeFile(join(outputRoot, "llms.txt"), renderTemplate(
      replaceRequired(llmsTemplate, "{{BLOG_LLMS_ENTRIES}}", renderBlogLlmsEntries(BLOG_SITE)),
      renderOptions,
    )),
    writeFile(join(outputRoot, cssAsset.slice(1)), compiledCss),
    writeFile(join(outputRoot, analyticsAsset.slice(1)), analytics),
    writeFile(join(outputRoot, skillInstallAsset.slice(1)), skillInstall),
    writeFile(join(outputRoot, platformInstallAsset.slice(1)), platformInstall),
    writeFile(join(outputRoot, foilAsset.slice(1)), foil),
    writeFile(join(outputRoot, statusPageAsset.slice(1)), statusPage),
    writeFile(
      join(outputRoot, "robots.txt"),
      `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
    ),
    writeFile(
      join(outputRoot, "sitemap.xml"),
      renderSitemapXml(allPages, blogSitemapPaths(BLOG_SITE)),
    ),
    cp(join(publicRoot, "images"), join(outputRoot, "images"), {
      dereference: true,
      recursive: true,
      filter: () => true,
    }),
    cp(join(publicRoot, "icons"), join(outputRoot, "icons"), {
      dereference: true,
      recursive: true,
      filter: () => true,
    }),
    cp(join(publicRoot, "marks"), join(outputRoot, "marks"), {
      dereference: true,
      recursive: true,
      filter: () => true,
    }),
    copyFile(join(publicRoot, "icon.png"), join(outputRoot, "icon.png")),
    copyFile(join(publicRoot, "icon-96.png"), join(outputRoot, "icon-96.png")),
    copyFile(join(publicRoot, "apple-icon.png"), join(outputRoot, "apple-icon.png")),
    copyFile(join(publicRoot, "og.png"), join(outputRoot, "og.png")),
    cp(join(publicRoot, "launch"), join(outputRoot, "launch"), { force: false, recursive: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }),
    ...DEMO_PUBLIC_FILES.map((file) => copyFile(
      join(publicRoot, file),
      join(outputRoot, file),
    )),
    copyFile(
      join(publicRoot, "dc84ee4863539f2fff50ef5f0a164168.txt"),
      join(outputRoot, "dc84ee4863539f2fff50ef5f0a164168.txt"),
    ),
  ]);
}

if (import.meta.main) {
  await buildWebsite();
}
