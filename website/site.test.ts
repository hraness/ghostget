import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  HRANESS_HOME_URL,
  HRANESS_MAILING_SUBSCRIBE_URL,
  hranessSocialLinks,
  renderHranessSiteFooter,
  type HranessMailingListConfig,
} from "@hraness/site-footer";
import { HranessSiteFooter } from "@hraness/site-footer/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  agentSkillInstallCommands,
  buildWebsite,
  compileUiStylesheet,
  CONTENT_REVIEWED_RELEASE,
  DEFAULT_POSTHOG_HOST,
  DEMO_PUBLIC_FILES,
  markdownSiblingPath,
  GITHUB_RELEASES_URL,
  HRANESS_ORGANIZATION_ID,
  HRANESS_URL,
  parsePackageIdentity,
  PUBLIC_PAGES,
  PUBLISHER_URL,
  REPOSITORY_URL,
  SITE_DESCRIPTION,
  SITE_ORIGIN,
  SITE_TITLE,
  SKILLS_URL,
  SOCIAL_IMAGE_ALT,
  versionedPackageArtifactUrl,
  ghostgetMailingListConfig,
  type UiStylesheetImport,
} from "./build";
import webmcpRegistrySource from "./source/webmcp-registry.json";
import {
  parseWebmcpRegistrySnapshot,
  webmcpProviderPages,
} from "./webmcp-registry";
import { handleDocumentNegotiation } from "../edge/negotiation";
import { ghostgetSupportProfile } from "../src/support-profile";
import {
  EDITORIAL_ARTICLE_IMAGE_SIZES,
  EDITORIAL_CARD_IMAGE_SIZES,
  editorialImageSrcSet,
  editorialImageUrl,
  editorialImages,
} from "./editorial-images";
import {
  loadProviderCapabilityAttestation,
} from "./provider-capability-attestation";
import {
  BEEPER_PRESENTATION_TRANSPORT_COUNTS,
  createBeeperPresentationFacts,
  createProviderDirectory,
  createWhatsAppPresentationFacts,
  renderProviderAttestationGroups,
  renderProviderOverviewCards,
} from "./provider-presentation";
import { PRODUCTION_RELEASE_MARKER_PATH } from "./production-release-marker.mjs";
import {
  BEEPER_LOCAL_OPERATION_CONTRACT_VERSIONS,
  BEEPER_LOCAL_OPERATION_NAMES,
  BEEPER_LOCAL_OPERATION_RUNTIME_TRANSPORTS,
} from "../src/providers/beeper-local";

const repositoryRoot = resolve(import.meta.dir, "..");
const websiteRoot = import.meta.dir;

function cssPropertyValues(css: string, selector: string, property: string): string[] {
  const values: string[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    const selectors = (match[1] ?? "").split(",").map((value) => value.trim());
    if (!selectors.includes(selector)) continue;
    const declarations = match[2] ?? "";
    const value = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "u")
      .exec(declarations)?.[1]?.trim();
    if (value !== undefined) values.push(value);
  }
  return values;
}

test("Ask AI preserves product typography while retaining shared line-height and wrapping atoms", async () => {
  const css = await readFile(join(websiteRoot, "source/styles.css"), "utf8");
  const label = '.ghostget-ask-ai [data-slot="ask-ai-about-this-label"]';
  const link = '.ghostget-ask-ai [data-slot="ask-ai-about-this-link"]';
  for (const [selector, property, value] of [
    [label, "color", "inherit"], [label, "font-family", "inherit"],
    [label, "letter-spacing", "normal"], [label, "text-transform", "none"],
    [link, "font-family", "inherit"], [link, "background-color", "transparent"],
    [`${link}:hover`, "background-color", "transparent"],
    [`${link}:focus-visible`, "outline", "2px solid var(--focus)"],
    [`${link}:focus-visible`, "outline-offset", "2px"],
  ] as const) expect(cssPropertyValues(css, selector, property)).toEqual([value]);
  expect(cssPropertyValues(css, label, "line-height")).toEqual([]);
  for (const selector of [label, link]) expect(cssPropertyValues(css, selector, "white-space")).toEqual([]);
});

function lossyWebpDimensions(bytes: Uint8Array): Readonly<{ height: number; width: number }> {
  const ascii = (start: number, end: number): string =>
    String.fromCharCode(...bytes.subarray(start, end));
  if (
    bytes.byteLength < 30
    || ascii(0, 4) !== "RIFF"
    || ascii(8, 12) !== "WEBP"
    || ascii(12, 16) !== "VP8 "
    || bytes[23] !== 0x9d
    || bytes[24] !== 0x01
    || bytes[25] !== 0x2a
  ) {
    throw new Error("Editorial image must be a canonical lossy WebP frame.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    height: view.getUint16(28, true) & 0x3fff,
    width: view.getUint16(26, true) & 0x3fff,
  };
}

describe("ghostget.com static site", () => {
  test("inlines the complete UI stylesheet after its layer declarations", () => {
    const imports = {
      "./tokens.css": ":root { --ui-foreground: CanvasText; }",
      "./reset.css": "@layer base { button { font: inherit; } }",
      "./components.css": "@layer components.hraness-ui.legacy { .hook { color: inherit; } }",
      "../dist/stylex.css": "@layer components.hraness-ui.priority1 { .compiled { display: flex; } }",
    } satisfies Record<UiStylesheetImport, string>;
    const prelude = "@layer base, components;\n@layer components.hraness-ui.legacy, components.hraness-ui.priority1;";
    const facade = `${prelude}\n${Object.keys(imports).map((source) => `@import "${source}";`).join("\n")}\n`;

    expect(compileUiStylesheet(facade, imports)).toBe(
      `${prelude}\n${Object.values(imports).join("\n")}`,
    );
    expect(() => compileUiStylesheet(
      `${facade}@import "./components.css";\n`,
      imports,
    )).toThrow("repeated UI stylesheet import");
    expect(() => compileUiStylesheet(
      facade.replace('@import "../dist/stylex.css";', ""),
      imports,
    )).toThrow("complete pinned public CSS exports");
    expect(() => compileUiStylesheet(
      facade.replace('@import "./tokens.css";', '@import "https://example.com/tokens.css";'),
      imports,
    )).toThrow("Unsupported");
    expect(() => compileUiStylesheet(
      facade.replace('@import "./tokens.css";', '@import "./tokens.css" screen;'),
      imports,
    )).toThrow("complete pinned public CSS exports");
    expect(() => compileUiStylesheet(facade, {
      ...imports,
      "./components.css": '@import "./unbundled.css";',
    })).toThrow("complete pinned public CSS exports");
  });

  test("derives the public release from strict root package identity", async () => {
    const [manifest, lockfile]: [unknown, string] = await Promise.all([
      Bun.file(join(repositoryRoot, "package.json")).json(),
      Bun.file(join(repositoryRoot, "bun.lock")).text(),
    ]);
    const identity = parsePackageIdentity(manifest);
    expect(identity).toMatchObject({
      description: SITE_DESCRIPTION,
      homepage: SITE_ORIGIN,
      name: "@hraness/ghostget",
      repositoryUrl: "git+https://github.com/hraness/ghostget.git",
    });
    expect(identity.version).toBe((manifest as { version: string }).version);
    expect(identity.release).toBe(`v${identity.version}`);
    expect(identity.release).toBe(CONTENT_REVIEWED_RELEASE);
    const packageFiles = (manifest as { files?: unknown }).files;
    expect(Array.isArray(packageFiles)).toBe(true);
    expect(packageFiles).not.toContain("website");
    expect(packageFiles).not.toContain("vercel.json");
    expect(manifest).toMatchObject({
      devDependencies: {
        "@hraness/design-kit": "github:hraness/design-kit#v0.16.2",
        "@hraness/site-footer": "github:hraness/site-footer#v0.15.0",
        "@hraness/ui": "github:hraness/ui#v0.5.18",
      },
    });
    expect(lockfile).toContain('"@hraness/design-kit": "github:hraness/design-kit#v0.16.2"');
    expect(lockfile).toContain('"@hraness/ui": "github:hraness/ui#v0.5.18"');
    expect(lockfile).toContain('"@hraness/site-footer": "github:hraness/site-footer#v0.15.0"');
    expect(lockfile).toContain(
      '"@hraness/site-footer": ["@hraness/site-footer@github:hraness/site-footer#8b6336d"', 
    );
  });

  test("keeps handwritten Beeper transport and contract counts bound to source", async () => {
    const [readme, localCliGuide] = await Promise.all([
      Bun.file(join(repositoryRoot, "README.md")).text(),
      Bun.file(join(repositoryRoot, "docs/local-cli-providers.md")).text(),
    ]);
    const desktopLoopbackOperations = BEEPER_LOCAL_OPERATION_NAMES.filter(
      (operation) => BEEPER_LOCAL_OPERATION_RUNTIME_TRANSPORTS[operation]
        === "desktop-loopback",
    );
    const contractVersionCounts = ([1, 2, 3] as const).map(
      (version) => BEEPER_LOCAL_OPERATION_NAMES.filter(
        (operation) => BEEPER_LOCAL_OPERATION_CONTRACT_VERSIONS[operation] === version,
      ).length,
    );

    expect(BEEPER_PRESENTATION_TRANSPORT_COUNTS).toEqual({
      cliBackedOperationCount: 26,
      desktopLoopbackOperationCount: 6,
    });
    expect(desktopLoopbackOperations).toEqual([
      "accounts.list",
      "contacts.list",
      "messaging.search",
      "conversations.read",
      "messaging.read",
      "messaging.content.search",
    ]);
    expect(contractVersionCounts).toEqual([25, 5, 2]);

    const normalizedReadme = readme.replace(/\s+/gu, " ");
    const normalizedLocalCliGuide = localCliGuide.replace(/\s+/gu, " ");
    expect(normalizedReadme).toContain(
      "Of those, 26 operations use the authoritative `@beeper/cli` 0.6.2 executable; six reads use fixed Beeper Desktop loopback endpoints.",
    );
    expect(normalizedReadme).toContain(
      "25 at contract version 1, five at contract version 2, and two at contract version 3: `contacts.list` and `messaging.read`.",
    );
    expect(normalizedReadme).toContain(
      "Six fixed Desktop loopback reads are `accounts.list`, `contacts.list`, `messaging.search`, `conversations.read`, `messaging.read`, and `messaging.content.search`",
    );
    expect(normalizedLocalCliGuide).toContain(
      "pinned official `@beeper/cli` 0.6.2 executable into 26 CLI-backed operations and adds six fixed Beeper Desktop loopback reads, for 32 named operations in all.",
    );
    expect(normalizedLocalCliGuide).toContain(
      "25 operations at contract version 1, five at version 2, and two at version 3: `contacts.list` and `messaging.read`.",
    );
    expect(normalizedLocalCliGuide).toContain(
      "six direct loopback reads are `accounts.list`, `contacts.list`, `messaging.search`, `conversations.read`, `messaging.read`, and `messaging.content.search`",
    );
  });

  test("rejects metadata drift and non-release versions", () => {
    const base = {
      description: SITE_DESCRIPTION,
      homepage: SITE_ORIGIN,
      name: "@hraness/ghostget",
      repository: { url: "git+https://github.com/hraness/ghostget.git" },
      version: "9.8.7",
    };
    expect(() => parsePackageIdentity({ ...base, homepage: "https://hraness.com/ghostget" }))
      .toThrow("canonical Ghostget origin");
    expect(() => parsePackageIdentity({ ...base, version: "9.8.7-beta.1" }))
      .toThrow("stable semantic version");
    expect(() => parsePackageIdentity({ ...base, description: "drift" }))
      .toThrow("descriptions must stay identical");
  });

  test("binds signup to Ghostget in production only", () => {
    expect(ghostgetMailingListConfig({
      VERCEL_ENV: "production",
    })).toEqual({
      audience: "wrench",
      kind: "signup",
    });
    expect(ghostgetMailingListConfig({})).toEqual({ kind: "none" });
    expect(ghostgetMailingListConfig({ VERCEL_ENV: "preview" }))
      .toEqual({ kind: "none" });
    expect(ghostgetMailingListConfig({ VERCEL_ENV: "development" }))
      .toEqual({ kind: "none" });
  });

  test("renders the shared Hraness attribution through the HranessSiteFooter contract in every mode", () => {
    const mailingLists: ReadonlyArray<HranessMailingListConfig> = [
      ghostgetMailingListConfig({ VERCEL_ENV: "production" }),
      ghostgetMailingListConfig({ VERCEL_ENV: "preview" }),
      ghostgetMailingListConfig({}),
    ];
    for (const mailingList of mailingLists) {
      for (const support of [ghostgetSupportProfile, undefined]) {
        for (const showBrand of [true, false]) {
          const options = { mailingList, showBrand, ...(support === undefined ? {} : { support }) };
          const staticHtml = renderHranessSiteFooter(options);
          // The framework-neutral renderer the static build uses is the same
          // contract as the React adapter once the client-only enrollment
          // experiment is off; the React default instead ships an "arming"
          // veil that only hydration lifts, which a React-free page must not emit.
          expect(staticHtml).toBe(
            renderToStaticMarkup(createElement(HranessSiteFooter, { ...options, experiment: false })),
          );
          expect(staticHtml).not.toContain("data-experiment=");
          // The organization attribution folds into the canonical home lockup.
          expect(staticHtml.match(/aria-label="Hraness home"/gu) ?? []).toHaveLength(showBrand ? 1 : 0);
          expect(staticHtml.match(/>by Hraness</gu) ?? []).toHaveLength(showBrand ? 1 : 0);
          expect(staticHtml.match(/data-slot="hraness-mark"/gu) ?? []).toHaveLength(showBrand ? 1 : 0);
          expect(staticHtml).not.toContain('data-slot="hraness-attribution"');
          expect(staticHtml).not.toMatch(/Ben Guo|Built by Ben/u);
          expect(staticHtml.match(/<footer\b/gu)).toHaveLength(1);
          expect(staticHtml.match(/class="hraness-site-footer__social-link[\s"]/gu)).toHaveLength(hranessSocialLinks.length);
        }
      }
    }
  });

  test("builds canonical discovery, semantic content, and private-key-free analytics", async () => {
    const packageIdentity = parsePackageIdentity(
      await Bun.file(join(repositoryRoot, "package.json")).json(),
    );
    const npmPackageUrl = versionedPackageArtifactUrl(packageIdentity);
    const skillInstallCommands = agentSkillInstallCommands(packageIdentity);
    const beeperOperationCount =
      BEEPER_PRESENTATION_TRANSPORT_COUNTS.cliBackedOperationCount
      + BEEPER_PRESENTATION_TRANSPORT_COUNTS.desktopLoopbackOperationCount;
    const staleMarkerPath = join(
      websiteRoot,
      "dist",
      PRODUCTION_RELEASE_MARKER_PATH.slice(1),
    );
    await mkdir(join(websiteRoot, "dist/.well-known"), { recursive: true });
    await writeFile(staleMarkerPath, "stale marker must not survive preview/local output\n");
    await buildWebsite({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_POSTHOG_HOST: DEFAULT_POSTHOG_HOST,
      NEXT_PUBLIC_POSTHOG_KEY: "phc_public_project_token",
    });
    const [pages, preview, notFound, notFoundMarkdown, llms, robots, sitemap, indexNowKey, favicon, sourceCss, demoFiles, vercel, middleware] = await Promise.all([
      Promise.all(PUBLIC_PAGES.map(async (page) => ({
        definition: page,
        html: await readFile(join(websiteRoot, "dist", page.outputFile), "utf8"),
      }))),
      readFile(join(websiteRoot, "dist/preview/index.html"), "utf8"),
      readFile(join(websiteRoot, "dist/404.html"), "utf8"),
      readFile(join(websiteRoot, "dist/404.md"), "utf8"),
      readFile(join(websiteRoot, "dist/llms.txt"), "utf8"),
      readFile(join(websiteRoot, "dist/robots.txt"), "utf8"),
      readFile(join(websiteRoot, "dist/sitemap.xml"), "utf8"),
      readFile(join(websiteRoot, "dist/dc84ee4863539f2fff50ef5f0a164168.txt"), "utf8"),
      readFile(join(websiteRoot, "dist/icon.png")),
      readFile(join(websiteRoot, "source/styles.css"), "utf8"),
      Promise.all(DEMO_PUBLIC_FILES.map(async (file) => ({
        file,
        output: new Uint8Array(await Bun.file(join(websiteRoot, "dist", file)).arrayBuffer()),
        source: new Uint8Array(await Bun.file(join(websiteRoot, "public", file)).arrayBuffer()),
      }))),
      Bun.file(join(repositoryRoot, "vercel.json")).json(),
      readFile(join(repositoryRoot, "middleware.ts"), "utf8"),
    ]);
    const html = pages[0]!.html;
    expect(await Bun.file(staleMarkerPath).exists()).toBe(false);
    const readme = await readFile(join(repositoryRoot, "README.md"), "utf8");
    const cssAsset = /<link rel="stylesheet" href="([^"?]+)">/u.exec(html)?.[1];
    expect(cssAsset).toMatch(/^\/assets\/styles-[a-f0-9]{12}\.css$/u);
    const builtCss = await readFile(join(websiteRoot, "dist", cssAsset!.slice(1)), "utf8");
    expect(builtCss).not.toMatch(/@import\b/iu);
    expect(builtCss.startsWith("@layer base, components;")).toBe(true);
    const presetCss = await readFile(join(websiteRoot, "vendor/marketing-preset/product-marketing-preset.css"), "utf8");
    const lanternCss = await readFile(join(websiteRoot, "vendor/lantern-material/lantern-material.css"), "utf8");
    expect(builtCss.endsWith(`${sourceCss.trimEnd()}\n\n${presetCss}\n\n${lanternCss}\n`)).toBe(true);
    expect(builtCss.split(lanternCss)).toHaveLength(2);
    expect(html).toContain('data-hraness-marketing-preset="editorial"');
    expect(html).toContain('data-hraness-material="lantern"');
    expect(html).toContain('<main id="main">');
    expect(html).not.toContain('class="hraness-marketing-field"');
    for (const page of pages.slice(1)) expect(page.html).not.toContain('data-hraness-material="lantern"');
    for (const path of ["LICENSE", "provenance.json"]) {
      expect(Buffer.compare(await readFile(join(websiteRoot, "dist/assets/lantern-material", path)),
        await readFile(join(websiteRoot, "vendor/lantern-material", path)))).toBe(0);
    }
    for (const path of ["fonts/instrument-serif/instrument-serif-latin-400.woff2", "fonts/instrument-serif/OFL.txt", "marketing-assets/grain.svg", "marketing-assets/cells.svg"]) {
      expect(await readFile(join(websiteRoot, "dist/assets", path))).toEqual(await readFile(join(websiteRoot, "vendor/marketing-preset", path)));
    }
    for (const publicStylesheet of [
      "@hraness/ui/tokens.css",
      "@hraness/ui/reset.css",
      "@hraness/ui/components.css",
      "@hraness/ui/stylex.css",
      "@hraness/design-kit/syntax-highlighting.css",
      "@hraness/site-footer/stylex.css",
    ]) {
      const stylesheet = (await readFile(
        new URL(import.meta.resolve(publicStylesheet)),
        "utf8",
      )).trim();
      expect(builtCss.split(stylesheet)).toHaveLength(2);
    }
    const marketingGrammar = (await readFile(
      new URL(import.meta.resolve("@hraness/design-kit/product-marketing.css")),
      "utf8",
    )).trim();
    expect(marketingGrammar).toMatch(/^@import\b/iu);
    const grammarWithoutImport = marketingGrammar.replace(/^@import[^\n]*\n/u, "").trim();
    expect(builtCss.split(grammarWithoutImport)).toHaveLength(2);

    expect(vercel.git).toEqual({
      deploymentEnabled: {
        "website-production-canary": false,
      },
    });

    expect(sourceCss).toContain('--font-sans: "Nebula Sans", ui-sans-serif, system-ui');
    expect(sourceCss).not.toContain("--font-serif");
    expect(sourceCss).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\)/su);
    expect(sourceCss).toMatch(/\.wordmark\s*\{[^}]*font-family:\s*var\(--font-sans\)/su);
    expect(sourceCss).toMatch(/\.hero h1,[\s\S]*?\.preview-copy h1\s*\{[^}]*font-family:\s*var\(--font-sans\)/u);
    expect(sourceCss).toMatch(/\.hero h1,[\s\S]*?\.preview-copy h1\s*\{[^}]*font-weight:\s*500/u);
    expect(sourceCss).toContain("--hraness-site-accent: var(--ghostget-action);");
    expect(sourceCss).toContain("--hraness-site-accent-ink: var(--ghostget-action-ink);");
    expect(sourceCss).toContain("--ghostget-action: var(--primary);");
    expect(sourceCss).toContain("--ghostget-action-ink: var(--primary-foreground);");
    expect(sourceCss).toContain("--ghostget-action-soft: var(--accent);");
    expect(sourceCss).not.toMatch(/--accent\s*:/u);
    expect(cssPropertyValues(sourceCss, ".registry-domain-strip a:hover", "color").at(-1))
      .toBe("var(--ghostget-action)");
    expect(cssPropertyValues(sourceCss, ".registry-domain-strip a:focus-visible", "outline").at(-1))
      .toBe("2px solid var(--ghostget-action)");
    expect(sourceCss).toMatch(/\.preview-copy > p:last-child\s*\{(?![^}]*font-family)[^}]*\}/su);
    expect(sourceCss).toMatch(/\.preview-eyebrow\s*\{[^}]*font-family:\s*var\(--font-mono\)/su);
    expect(sourceCss).toMatch(/\.preview-flow li\s*\{[^}]*font-family:\s*var\(--font-mono\)/su);
    expect(cssPropertyValues(sourceCss, ".artifact-table table", "table-layout")).toEqual([
      "fixed",
    ]);
    expect(cssPropertyValues(sourceCss, ".version-table table", "min-width")).toEqual([
      "58rem",
    ]);
    expect(cssPropertyValues(sourceCss, ".guide-article", "max-width").at(-1)).toBe("58rem");
    expect(cssPropertyValues(sourceCss, ".content", "max-width").at(-1)).toBe("80rem");
    expect(cssPropertyValues(sourceCss, ".card-grid", "grid-template-columns")).toEqual([
      "repeat(2, minmax(0, 1fr))",
      "1fr",
    ]);
    expect(EDITORIAL_ARTICLE_IMAGE_SIZES).toBe(
      "(max-width: 31.25rem) calc(100vw - 2.5rem), (max-width: 63rem) 92vw, 58rem",
    );
    expect(EDITORIAL_CARD_IMAGE_SIZES).toBe(
      "(max-width: 31.25rem) calc(100vw - 2.5rem), (max-width: 45rem) 92vw, (max-width: 80rem) 46vw, (max-width: 100rem) calc(40rem - 4vw), 36rem",
    );
    expect(cssPropertyValues(
      sourceCss,
      ".artifact-table td:nth-child(4)",
      "width",
    )).toEqual(["33%"]);
    expect(builtCss).toContain('font-family: "Nebula Sans";');
    expect(builtCss).toContain('./fonts/nebula-sans/NebulaSans-Book.woff2');
    expect((await readFile(
      join(websiteRoot, "dist/assets/fonts/nebula-sans/NebulaSans-Book.woff2"),
    )).byteLength).toBeGreaterThan(60_000);
    expect(await readFile(
      join(websiteRoot, "dist/assets/fonts/nebula-sans/PROVENANCE.md"),
      "utf8",
    )).toContain("https://www.nebulasans.com/download/NebulaSans-1.010.zip");
    const fontsStylesheetUrl = new URL(import.meta.resolve("@hraness/design-kit/fonts.css"));
    const fontsCss = await readFile(fontsStylesheetUrl, "utf8");
    const fontReferences = [...fontsCss.matchAll(/url\("([^"\r\n]+)"\)/gu)];
    expect(fontReferences.length).toBeGreaterThan(1);
    for (const reference of fontReferences) {
      const relativeFont = reference[1]!;
      expect(relativeFont).toMatch(/^\.\/fonts\/.+\.woff2$/u);
      expect(await readFile(join(websiteRoot, "dist/assets", relativeFont))).toEqual(
        await readFile(new URL(relativeFont, fontsStylesheetUrl)),
      );
    }

    expect(html).toContain(`<title>${SITE_TITLE}</title>`);
    /* The shared brand lockup on every page: the pointer-tracked foil-text
       name plus the foil-mark icon whose paint is masked by the product
       mark's alpha — the same header convention across Hraness sites. */
    expect(sourceCss).toContain('--hraness-foil-mask: url("/marks/wrench.svg")');
    for (const page of pages) {
      const brand = page.html.match(
        /<a[^>]*aria-label="Ghostget home"[^>]*>[\s\S]*?<\/a>/u,
      )?.[0];
      expect(brand).toBeDefined();
      expect(brand).toContain('data-foil=""');
      expect(brand).toMatch(/hraness-foil-text|hraness-marketing-header__brand/u);
      expect(brand).toContain('hraness-foil-mark');
      expect(brand).toContain('hraness-foil-mark__image');
      expect(brand).toContain('hraness-foil-mark__paint');
      expect(brand).toContain('src="/marks/wrench.svg"');
    }
    for (const page of pages) {
      expect(page.html.match(/data-slot="ask-ai-about-this"/gu)).toHaveLength(1);
      const destination = new URL("https://chatgpt.com/");
      destination.searchParams.set(
        "q",
        `Tell me about ${SITE_ORIGIN}${page.definition.canonicalPath}`,
      );
      expect(page.html).toContain(destination.href.replaceAll("&", "&amp;"));
    }
    expect(preview).not.toContain('data-slot="ask-ai-about-this"');
    expect(notFound).not.toContain('data-slot="ask-ai-about-this"');
    expect(html).toContain(`<meta name="description" content="${SITE_DESCRIPTION}">`);
    expect(html).toContain('<link rel="canonical" href="https://ghostget.com/">');
    expect(html).toContain('<link rel="icon" href="/icon.png" type="image/png" sizes="512x512">');
    expect(html).toContain('<meta property="og:image" content="https://ghostget.com/og.png">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta name="robots" content="max-image-preview:large">');
    expect(html).not.toContain('<meta name="keywords"');
    expect(html).toContain(`hraness-ghostget-${packageIdentity.version}.tgz`);
    expect(html).toContain(`Install Ghostget ${packageIdentity.release}`);
    expect(html).toContain(`>${skillInstallCommands.npx}</code>`);
    expect(html).toContain(`<code>${skillInstallCommands.bunx}</code>`);
    expect(html).toContain(
      `<a href="${SKILLS_URL}">View the Ghostget Agent Skill on skills.sh.</a>`,
    );
    expect(html).toContain(
      `<a href="${npmPackageUrl}"><code>@hraness/ghostget</code> canonical release archive</a>`,
    );
    expect(html).not.toContain(`value="${skillInstallCommands.npx}"`);
    expect(html).not.toContain(`href="${GITHUB_RELEASES_URL}"`);
    expect(html).not.toContain("skills add hraness/ghostget</code>");
    expect(html).toContain('class="skill-install" data-skill-install');
    expect(html).toContain("data-skill-install-copy");
    expect(html).toMatch(/data-skill-install-copy\s+hidden/gu);
    expect(html).toContain('aria-label="Copy Agent Skill install command"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(html).toContain('/assets/skill-install-');
    expect(html.indexOf('class="hero-explainer"')).toBeLessThan(
      html.indexOf('class="skill-install"'),
    );
    expect(html).not.toContain("{{");
    expect(html).not.toContain("@jungle/");
    expect(html).not.toContain("hraness.com/ghostget");
    expect(html.match(/<h1\b/gu)).toHaveLength(1);
    expect(html.match(/<details\b/gu)).toHaveLength(18);
    expect(html.match(/<iframe\b/gu)).toBeNull();
    // The decorative hero field: provider cards, ghosts, edges, and blur
    // blobs, all inert to readers and input devices.
    const fieldStart = html.indexOf('aria-hidden="true" class="ghostget-field"');
    const copyStart = html.indexOf('class="hraness-marketing-hero__copy"');
    const field = fieldStart >= 0 && copyStart > fieldStart
      ? html.slice(fieldStart, copyStart)
      : undefined;
    expect(field).toBeDefined();
    expect(field?.match(/class="ghostget-card /gu)).toHaveLength(10);
    expect(field?.match(/class="ghostget-spirit /gu)).toHaveLength(3);
    expect(field?.match(/class="ghostget-blob /gu)).toHaveLength(3);
    expect(field?.match(/class="ghostget-edge"/gu)).toHaveLength(8);
    expect(field?.match(/data-hraness-hero-item/gu)).toHaveLength(13);
    expect(field).toContain('class="ghostget-card__name">Beeper<');
    expect(field).toContain('class="ghostget-card__name">Gmail<');
    expect(field).toContain('class="ghostget-card__name">WhatsApp<');
    expect(field).toContain('class="ghostget-card__name">iMessage<');
    expect(field).toContain('class="ghostget-spirit__eyes"');
    expect(field).not.toContain("<a ");
    expect(html.indexOf('class="ghostget-field"')).toBeLessThan(
      html.indexOf('class="hraness-marketing-hero__copy"'),
    );
    expect(html).toContain('/assets/field-');
    for (const page of pages) {
      if (page.definition.canonicalPath === "/") continue;
      expect(page.html).not.toContain("ghostget-field");
      expect(page.html).not.toContain("/assets/field-");
    }
    expect(html).toContain("ghostget menubar");
    expect(html).toContain("Review connected accounts, permissions, pending approvals, and recent activity in your menu bar or terminal");
    expect(html).toContain("ghostget tui");
    expect(html).toContain("Only one control client runs at a time");
    expect(html).toContain('class="table-scroll" role="region" tabindex="0"');
    expect(html).toContain('<a class="skip-link" href="#main">');
    expect(html.match(/data-analytics-event="project link opened"/gu)).toHaveLength(2);
    // The two analytics-tagged GitHub links plus the untagged content-footer link.
    expect(html.match(new RegExp(`href="${REPOSITORY_URL}"`, "gu"))).toHaveLength(3);
    expect(html).toContain("Privacy: cookieless PostHog analytics");
    expect(html).toContain('href="/compare/personal-agents-browser-use/"');
    expect(html).toContain('href="/agentic-web-spoofing/"');
    expect(html).toContain('href="/vms-cannot-contain-agents/"');
    expect(html).toContain('href="/paypal-grapheneos-attestation/"');
    expect(html).toContain('href="/rumour-is-the-exploit/"');
    expect(html).toContain('href="/omarchy-root-escalation/"');
    expect(html).toContain('href="/docs/how-to/connect-beeper/"');
    expect(html).toContain('href="/docs/how-to/export-whatsapp/"');
    const argumentsSection = /<section aria-labelledby="arguments-title" class="section editorial-cluster">[\s\S]*?<\/section>/u
      .exec(html)?.[0];
    const guidesSection = /<section aria-labelledby="guides-title" class="section guide-cluster">[\s\S]*?<\/section>/u
      .exec(html)?.[0];
    expect(argumentsSection).toBeDefined();
    expect(guidesSection).toBeDefined();
    expect(argumentsSection).toContain('<h2 id="arguments-title">Arguments and comparisons</h2>');
    expect(argumentsSection).toContain('<div class="card-grid editorial-card-grid">');
    expect(argumentsSection?.match(/<article class="card(?: editorial-card)?">/gu)).toHaveLength(8);
    expect(guidesSection?.match(/<article class="card">/gu)).toHaveLength(6);
    expect(argumentsSection).toContain('href="/paypal-grapheneos-attestation/"');
    expect(argumentsSection).toContain('href="/rumour-is-the-exploit/"');
    expect(argumentsSection).toContain('href="/omarchy-root-escalation/"');
    expect(guidesSection).not.toContain('href="/paypal-grapheneos-attestation/"');
    expect(guidesSection).not.toContain('href="/rumour-is-the-exploit/"');
    expect(guidesSection).not.toContain('href="/omarchy-root-escalation/"');
    for (const image of editorialImages) {
      expect(argumentsSection).toContain(`href="${image.canonicalPath}"`);
      expect(guidesSection).not.toContain(`href="${image.canonicalPath}"`);
    }
    expect(guidesSection).not.toContain('class="card editorial-card"');
    expect(html.indexOf(argumentsSection ?? "")).toBeLessThan(html.indexOf(guidesSection ?? ""));
    expect(html).toContain(
      '<h1 class="hraness-marketing-hero__heading" id="brand-name">Let your agent read pages, save media, and use your accounts through named actions.</h1>',
    );
    expect(html).not.toContain("Give your coding agent bounded access to the web.");
    // The limit on uncertain writes: never resent, and unsettled until
    // separate evidence arrives. Home page and README state it in the same words.
    const indeterminateWriteBoundary =
      "If a write went out and its result is unknown, Ghostget won't send it again. It stays marked unsettled until separate evidence shows what happened.";
    for (const surface of [html.replaceAll("’", "'"), readme]) {
      expect(surface.replaceAll(/\s+/gu, " ")).toContain(indeterminateWriteBoundary);
      expect(surface).not.toContain("An indeterminate write is reconciled");
    }
    expect(html).toContain('data-hraness-marketing="header"');
    expect(html).toContain('data-hraness-marketing="hero"');
    expect(html).toContain('data-hraness-marketing="proof-frame"');
    expect(html).toContain('data-hraness-marketing="pillars"');
    expect(html).toContain('data-hraness-marketing="maker"');
    // The maker section is product-owned biography in page content; network
    // attribution belongs to the shared footer and is never repeated here.
    const makerSection = /<section\b[^>]*data-hraness-marketing="maker"[\s\S]*?<\/section>/u.exec(html)?.[0];
    expect(makerSection).toBeDefined();
    expect(makerSection).toContain('<h2 class="hraness-marketing-maker__heading" id="maker-title">Ben Guo</h2>');
    expect(makerSection).not.toContain("hraness-attribution");
    expect(makerSection).not.toMatch(/Built by\b/u);
    expect(html).toContain('clipped: "2026-09-05"');
    expect(html).toContain("Public-page read recorded on September 5, 2026; command updated for Ghostget.");
    expect(html).toContain('<a href="https://hraness.com">hraness.com</a>');
    expect(html).toContain('<a href="https://x.com/hraness">@hraness</a>');
    expect(html).not.toMatch(/\bstyle="/u);
    expect(html).toContain('data-hraness-marketing="install"');
    expect(html).toContain('data-hraness-marketing="interfaces"');
    expect(html).toContain('data-hraness-marketing="trust"');
    expect(html).toContain('data-hraness-marketing="questions"');
    expect(html).toContain('data-hraness-marketing="related"');
    const relatedSection = /<section\b[^>]*data-hraness-marketing="related"[\s\S]*?<\/section>/u.exec(html)?.[0];
    expect(relatedSection).toBeDefined();
    expect(relatedSection).toContain('hraness-marketing-related__group-heading');
    for (const href of ["https://gobstopper.sh", "https://xcb.sh", "https://aicharts.io", "https://peopleblade.com", "https://soulscrape.com", "https://textbutler.app", "https://wordcell.io"]) {
      expect(relatedSection).toContain(`href="${href}"`);
    }
    expect(html.indexOf('data-hraness-marketing="related"')).toBeLessThan(html.indexOf('data-hraness-marketing="cta"'));
    expect(html).toContain('data-hraness-marketing="cta"');
    expect(html).toContain("Use an Agent Skill, CLI, or TypeScript SDK");
    expect(html).not.toContain('class="hraness-marketing-hero__eyebrow"');
    expect(html).toContain('data-align="start"');
    expect(html).not.toContain('class="hraness-marketing-hero__example"');
    expect(html).toContain('import { isProviderPluginId } from "@hraness/ghostget"');
    expect(html).toMatch(/Reviewed actions across \d+ services\./u);
    expect(html).toContain('aria-label="Ghostget home" class="hraness-marketing-header__brand" data-foil="" href="/"><span aria-hidden="true" class="brand-mark hraness-foil-mark" data-foil=""><img alt="" class="hraness-foil-mark__image" decoding="async" height="20" src="/marks/wrench.svg" width="20" /><span aria-hidden="true" class="hraness-foil-mark__paint"></span></span> Ghostget</a>');
    expect(html).not.toMatch(/hero-field|hero-orbit|hero-glyph/u);
    expect(html).not.toMatch(/observed provider operations|capture-required|unavailable reservations/iu);
    expect(html).not.toContain("🔧");
    expect(html).toContain(`href="${PUBLISHER_URL}">Hraness GitHub organization</a>`);
    expect(preview).toContain("<title>Ghostget preview</title>");
    expect(preview).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(preview).toContain('<link rel="canonical" href="https://ghostget.com/">');
    expect(preview).toContain(`<link rel="stylesheet" href="${cssAsset}">`);
    expect(preview).toContain('<body class="preview-body">');
    expect(preview).toContain("Let your agent read pages, save media, and use your accounts through named actions.");
    expect(preview).not.toContain("Give your coding agent bounded access to the web.");
    expect(preview).toContain('class="preview-wordmark">Ghostget</p>');
    expect(preview).not.toMatch(/preview-field|preview-orbit|src="\/favicon\.svg"/u);
    expect(preview.match(/<h1\b/gu)).toHaveLength(1);
    expect(preview).not.toContain("{{");
    expect(preview).not.toMatch(/<(?:a|button|form|input|script)\b/iu);
    expect(preview).not.toContain("data-analytics");
    expect(preview).not.toContain("PostHog");
    expect(preview).not.toContain('type="application/ld+json"');
    expect(preview).not.toContain('rel="alternate"');
    expect(preview).not.toMatch(/\b(?:account|authentication|log in|sign in|user data)\b/iu);
    expect(await Bun.file(join(websiteRoot, "dist/preview.md")).exists()).toBe(false);
    expect(notFound).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(notFound).toContain(
      '<meta name="theme-color" content="#fbf1c7" media="(prefers-color-scheme: light)">',
    );
    expect(notFound).toContain(
      '<meta name="theme-color" content="#282828" media="(prefers-color-scheme: dark)">',
    );
    expect(notFound).toContain("Privacy: this page uses cookieless, personless PostHog analytics");
    expect(notFound).toContain('href="/llms.txt"');
    expect(notFound).toContain('href="/sitemap.xml"');
    expect(notFound).toContain('href="/docs/tutorials/getting-started/"');
    expect(notFound).not.toContain('type="application/ld+json"');
    expect(notFoundMarkdown).toContain("# Page not found");
    expect(notFound).toContain("<h1>Page not found</h1>");
    expect(notFound).not.toContain(`<meta name="description" content="${SITE_DESCRIPTION}">`);
    expect(notFoundMarkdown).toContain("https://ghostget.com/llms.txt");
    expect(notFoundMarkdown).toContain("https://ghostget.com/sitemap.xml");
    expect(llms).toContain("# Ghostget");
    expect(llms).toContain(`> ${SITE_DESCRIPTION}`);
    expect(llms).not.toContain("—");
    expect(llms).toContain("nine public entrypoints");
    expect(llms).toContain("`@hraness/ghostget/contracts`");
    expect(llms).toContain("## When to use Ghostget");
    expect(llms).toContain("## Ghostget developer resources");
    expect(llms).toContain("Do not use Ghostget as an AI agent");
    expect(llms).toContain(`${SITE_ORIGIN}/docs/tutorials/getting-started/`);
    expect(llms).toContain(`${SITE_ORIGIN}/compare/personal-agents-browser-use/`);
    expect(llms).toContain(`${SITE_ORIGIN}/paypal-grapheneos-attestation/`);
    expect(llms).toContain(`${SITE_ORIGIN}/rumour-is-the-exploit/`);
    expect(llms).toContain(`${SITE_ORIGIN}/omarchy-root-escalation/`);
    expect(llms).not.toContain(`${SITE_ORIGIN}/agentic-web-spoofing/`);
    expect(llms).not.toContain(`${SITE_ORIGIN}/vms-cannot-contain-agents/`);
    expect(llms).toContain(`${SITE_ORIGIN}/docs/how-to/connect-beeper/`);
    expect(llms).toContain(
      `${String(beeperOperationCount)} supported actions. ${String(BEEPER_PRESENTATION_TRANSPORT_COUNTS.cliBackedOperationCount)} run through the pinned \`@beeper/cli\` 0.6.2 executable and ${String(BEEPER_PRESENTATION_TRANSPORT_COUNTS.desktopLoopbackOperationCount)} use fixed Desktop loopback reads.`,
    );
    expect(llms).toContain("Message mutations require preview and confirmation.");
    expect(llms).not.toContain("Message actions are previewed and confirmed.");
    expect(llms).not.toContain("actions\u201427");
    expect(llms).toContain("pending message ID proves submission to Desktop only, not network delivery");
    expect(llms).toContain("Tagged `packages/cli/package.json` declares 0.6.1 and is provenance-only");
    expect(llms).toContain("exact executable runtime identity remains authoritative");
    expect(llms).toContain(`${SITE_ORIGIN}/docs/how-to/export-whatsapp/`);
    expect(llms).toContain("does not pair, sync, or send");
    expect(llms).toContain("submission is not a delivery claim");
    expect(llms.replaceAll(/https:\/\/ghostget\.com\/[a-z0-9-/]+/gu, "")).not.toMatch(
      /observed|capture-required|reservation|attestation/iu,
    );
    expect(llms).toContain(skillInstallCommands.npx);
    expect(llms).toContain(skillInstallCommands.bunx);
    expect(llms).not.toContain("skills add hraness/ghostget`");
    expect(llms).toContain("Accept: text/markdown");
    expect(llms).not.toContain("{{");
    expect(robots).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
    const webmcpPages = webmcpProviderPages(
      parseWebmcpRegistrySnapshot(webmcpRegistrySource),
    );
    expect(sitemap.match(/<url>/gu)).toHaveLength(PUBLIC_PAGES.length + webmcpPages.length);
    expect(sitemap).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(sitemap.match(/<image:image>/gu)).toHaveLength(editorialImages.length);
    for (const page of PUBLIC_PAGES) {
      expect(sitemap).toContain(`<loc>${SITE_ORIGIN}${page.canonicalPath}</loc>`);
    }
    expect(sitemap).toContain(`<loc>${SITE_ORIGIN}/providers/</loc>`);
    for (const page of webmcpPages.slice(0, 25)) {
      expect(sitemap).toContain(`<loc>${SITE_ORIGIN}${page.canonicalPath}</loc>`);
    }
    for (const image of editorialImages) {
      expect(sitemap).toContain(`<image:loc>${editorialImageUrl(image)}</image:loc>`);
      expect(sitemap).toContain(`<image:title>${image.title}</image:title>`);
      expect(sitemap).toContain(`<image:caption>${image.caption}</image:caption>`);
    }
    expect(sitemap).not.toContain("paypal-grapheneos-attestation.webp");
    expect(sitemap).not.toContain("rumour-is-the-exploit.webp");
    expect(sitemap).not.toContain("omarchy-root-escalation.webp");
    expect(sitemap).not.toContain("<lastmod>");
    expect(sitemap).not.toContain("<changefreq>");
    expect(sitemap).not.toContain("<priority>");
    expect(sitemap).not.toContain("hraness.com");
    expect(sitemap).not.toContain("/preview/");
    expect(llms).not.toContain("/preview/");
    expect(indexNowKey).toBe("dc84ee4863539f2fff50ef5f0a164168\n");
    expect(createHash("sha256").update(favicon).digest("hex")).toBe("09931384427416761a2e2d064d41532b8432dfb3c2d2f60d02bb54ed460ee3b4");
    expect(favicon).toEqual(await readFile(join(websiteRoot, "public/icon.png")));
    expect(await readFile(join(websiteRoot, "dist/apple-icon.png"))).toEqual(await readFile(join(websiteRoot, "public/apple-icon.png")));
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180">');
    expect(sourceCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(sourceCss).toContain("@media (forced-colors: active)");
    expect(sourceCss).toContain(
      "code:not(pre code):not(.hraness-marketing-flow__code)",
    );
    expect(sourceCss).not.toContain(".footer {");
    expect(builtCss).toContain("--hraness-site-footer-social-target");
    expect(builtCss).not.toContain('@import "./dist/stylex.css"');
    expect(builtCss).toContain(".hraness-marketing-hero {");
    expect(sourceCss).toContain("grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr)");
    expect(sourceCss).toContain("min-block-size: 2.75rem");
    expect(builtCss).toContain("@media (pointer: coarse)");
    for (const css of [sourceCss, builtCss]) {
      expect(css).toMatch(
        /\.ghostget-product-hero\s*\{[^{}]*\bgrid-column:\s*1\s*\/\s*-1\s*;/u,
      );
      for (const keyframes of [
        "ghostget-card-drift",
        "ghostget-blob-drift",
        "ghostget-spirit-bob",
        "ghostget-edge-flow",
      ]) {
        expect(css).toContain(`@keyframes ${keyframes}`);
      }
      expect(css).toContain(".ghostget-field");
      expect(css).toContain("--prox");
      expect(css).toMatch(/prefers-reduced-motion: reduce[^}]*\}[^}]*\.ghostget-card/u);
      expect(cssPropertyValues(css, ".ghostget-product-hero .hero-explainer", "color").at(-1))
        .toBe("var(--hraness-material-muted, var(--muted))");
      expect(cssPropertyValues(css, '.hraness-marketing-action[data-emphasis="primary"]', "color").at(-1))
        .toBe("var(--ghostget-action-ink)");
      const providerMarkDisplay = cssPropertyValues(css, ".provider-mark", "display");
      expect(providerMarkDisplay.length).toBeGreaterThan(0);
      expect(providerMarkDisplay).not.toContain("none");
      expect(providerMarkDisplay.at(-1)).toBe("inline-flex");
      const providerFeatureDisplay = cssPropertyValues(css, ".provider-feature-copy", "display");
      expect(providerFeatureDisplay.length).toBeGreaterThan(0);
      expect(providerFeatureDisplay).not.toContain("none");
      expect(providerFeatureDisplay.at(-1)).toBe("block");
    }
    const expectedFooterHrefs = [
      HRANESS_HOME_URL,
      "https://account.hraness.com/support?product=wrench&amp;source=web#support",
      "https://hraness.com/privacy",
      ...hranessSocialLinks.map(({ href }) => href),
    ];
    const productionFooter = renderHranessSiteFooter({
      mailingList: ghostgetMailingListConfig({ VERCEL_ENV: "production" }),
      support: ghostgetSupportProfile,
    });
    for (const document of [...pages.map(({ html: pageHtml }) => pageHtml), notFound]) {
      const footers = [...document.matchAll(/<footer\b[\s\S]*?<\/footer>/gu)]
        .map((match) => match[0]);
      expect(footers).toHaveLength(2);
      const [contentFooter, footer] = footers;
      expect(contentFooter).toContain('aria-label="Ghostget" class="hraness-marketing-footer" data-hraness-marketing="footer"');
      expect(contentFooter).toContain('<a class="hraness-marketing-footer__brand" href="/" aria-label="Ghostget home"><img alt="" height="20" src="/icon.png" width="20" /><span class="hraness-marketing-footer__name">Ghostget</span></a>');
      expect(contentFooter).toContain('<nav aria-label="Footer navigation" class="hraness-marketing-footer__nav">');
      expect(contentFooter).toContain('class="hraness-marketing-footer__link" href="/docs/"');
      expect(contentFooter).toContain('class="hraness-marketing-footer__link" href="/docs/reference/provider-capabilities/"');
      expect(contentFooter).toContain('class="hraness-marketing-footer__link" href="/about/"');
      expect(contentFooter).toContain('class="hraness-marketing-footer__link" href="/contact/"');
      expect(contentFooter).toContain('class="hraness-marketing-footer__link" href="/privacy/"');
      expect(contentFooter).toContain('class="hraness-marketing-footer__link" href="https://github.com/hraness/ghostget"');
      expect(document.indexOf('data-hraness-marketing="footer"'))
        .toBeLessThan(document.indexOf('data-slot="hraness-site-footer"'));
      expect(footer).toBeDefined();
      expect(footer).toBe(productionFooter);
      expect(footer).toContain('data-slot="hraness-site-footer"');
      expect(footer).not.toContain("hraness-site-footer__wordmark");
      expect(footer).toContain("by Hraness");
      expect(footer).toContain('data-mailing-list="signup"');
      expect(footer).toContain('data-slot="hraness-support-link"');
      // Shared network attribution folds into the package footer's canonical
      // home lockup; it is the only organization credit on the page.
      expect(document.match(/aria-label="Hraness home"/gu)).toHaveLength(1);
      expect(document.match(/>by Hraness</gu)).toHaveLength(1);
      expect(footer).toContain('aria-label="Hraness home"');
      expect(footer).toContain('>by Hraness</span>');
      expect(footer).not.toContain('data-slot="hraness-attribution"');
      expect(footer).not.toMatch(/Ben Guo|Built by Ben/u);
      expect(footer).not.toContain('data-experiment="arming"');
      const footerOrder = [
        'aria-label="Hraness home"',
        'data-slot="hraness-support-link"',
        'data-slot="hraness-cookie-consent"',
        'aria-label="Hraness links"',
      ].map((marker) => footer!.indexOf(marker));
      expect(footerOrder.every((offset) => offset >= 0)).toBe(true);
      expect(footerOrder).toEqual([...footerOrder].sort((left, right) => left - right));
      expect(footer).toContain(`action="${HRANESS_MAILING_SUBSCRIBE_URL}"`);
      expect(footer).toContain('name="audience" type="hidden" value="wrench"');
      expect(footer).toContain('name="website"');
      expect(footer).not.toContain("challenges.cloudflare.com");
      expect(footer).not.toContain("turnstile");
      expect(footer?.match(/data-slot="hraness-mark"/gu)).toHaveLength(1);
      expect(footer?.match(/data-slot="social-icon"/gu)).toHaveLength(
        hranessSocialLinks.length,
      );
      expect(
        [...(footer?.matchAll(/<a\b[^>]*\shref="([^"]+)"/gu) ?? [])]
          .map((match) => match[1]),
      ).toEqual(expectedFooterHrefs);
    }
    for (const demo of demoFiles) expect(demo.output).toEqual(demo.source);
    const demoPng = demoFiles.find(({ file }) => file.endsWith(".png"))?.output;
    const demoGif = demoFiles.find(({ file }) => file.endsWith(".gif"))?.output;
    const demoMp4 = demoFiles.find(({ file }) => file.endsWith(".mp4"))?.output;
    const demoWebm = demoFiles.find(({ file }) => file.endsWith(".webm"))?.output;
    const demoVtt = demoFiles.find(({ file }) => file.endsWith(".vtt"))?.output;
    expect(Array.from(demoPng?.slice(1, 4) ?? [])).toEqual([80, 78, 71]);
    const demoPngView = new DataView(demoPng!.buffer, demoPng!.byteOffset, demoPng!.byteLength);
    expect(demoPngView.getUint32(16)).toBe(1280);
    expect(demoPngView.getUint32(20)).toBe(720);
    expect(new TextDecoder().decode(demoGif?.slice(0, 6))).toBe("GIF89a");
    const demoGifView = new DataView(demoGif!.buffer, demoGif!.byteOffset, demoGif!.byteLength);
    expect(demoGifView.getUint16(6, true)).toBe(960);
    expect(demoGifView.getUint16(8, true)).toBe(540);
    expect(new TextDecoder().decode(demoMp4?.slice(4, 8))).toBe("ftyp");
    expect(Array.from(demoWebm?.slice(0, 4) ?? [])).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(new TextDecoder().decode(demoVtt?.slice(0, 6))).toBe("WEBVTT");
    expect(vercel).toMatchObject({
      buildCommand: "WRENCH_VERCEL_BUILD=release-bound-v1 bunx bun@1.3.14 run website:vercel-build",
      framework: null,
      outputDirectory: "website/dist",
    });
    expect(vercel.rewrites).toEqual(expect.arrayContaining([
      {
        destination: "/index.md",
        has: [{ key: "accept", type: "header", value: "text/markdown" }],
        source: "/",
      },
      {
        destination: "/:path.md",
        has: [{ key: "accept", type: "header", value: "text/markdown" }],
        source: "/:path((?!preview/).*)/",
      },
    ]));
    const markdownRewrite = vercel.rewrites.find((rule: { source: string }) =>
      rule.source === "/:path((?!preview/).*)/");
    expect(markdownRewrite?.destination).toBe("/:path.md");
    const markdownRewritePattern = /^\/((?!preview\/).*)\/$/u;
    expect(markdownRewritePattern.test("/preview/")).toBe(false);
    for (const path of ["/docs/tutorials/getting-started/", "/docs/how-to/connect-beeper/", "/missing/"]) {
      expect(markdownRewritePattern.test(path)).toBe(true);
    }
    const commonHeaders = vercel.headers.find((rule: { source: string }) =>
      rule.source === "/(.*)");
    expect(commonHeaders?.headers).toEqual([
      {
        key: "Permissions-Policy",
        value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Vary", value: "Accept" },
    ]);
    const releaseMarkerHeaders = vercel.headers.find((rule: { source: string }) =>
      rule.source === PRODUCTION_RELEASE_MARKER_PATH);
    expect(releaseMarkerHeaders?.headers).toEqual([
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "Content-Type", value: "application/json; charset=utf-8" },
    ]);

    const frameDenyHeaders = vercel.headers.find((rule: { source: string }) =>
      rule.source === "/((?!preview/$).*)");
    expect(frameDenyHeaders?.headers).toEqual([
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Content-Security-Policy",
        value: "form-action 'self' https://account.hraness.com; frame-src 'self'; script-src 'self' 'unsafe-inline' https://*.posthog.com https://*.posthogusercontent.com",
      },
    ]);
    const frameDenyPattern = /^\/((?!preview\/$).*)$/u;
    expect(frameDenyPattern.test("/preview/")).toBe(false);
    for (const deniedPath of [
      "/",
      "/preview",
      "/preview/index.html",
      "/preview/anything",
      "/docs/explanation/security-model/",
      "/assets/example.css",
    ]) {
      expect(frameDenyPattern.test(deniedPath)).toBe(true);
    }

    const previewHeaders = vercel.headers.find((rule: { source: string }) =>
      rule.source === "/preview/");
    expect(previewHeaders?.headers).toEqual([
      {
        key: "Content-Security-Policy",
        value: "default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors https://hraness.com https://www.hraness.com",
      },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]);
    expect(vercel.headers.filter((rule: { headers: Array<{ key: string }> }) =>
      rule.headers.some((header) => header.key === "X-Frame-Options"))).toEqual([
      frameDenyHeaders,
    ]);
    expect(vercel.headers.filter((rule: { headers: Array<{ key: string }> }) =>
      rule.headers.some((header) => header.key === "Content-Security-Policy"))).toEqual([
      frameDenyHeaders,
      previewHeaders,
    ]);

    expect(vercel.headers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        headers: expect.arrayContaining([
          expect.objectContaining({
            key: "Content-Type",
            value: "text/markdown; charset=utf-8",
          }),
        ]),
        source: "/(.*).md",
      }),
    ]));
    const notFoundMarkdownHeaders = vercel.headers.find((rule: { source: string }) =>
      rule.source === "/404.md");
    expect(notFoundMarkdownHeaders?.headers).toEqual([
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]);
    expect(middleware).toContain("handleDocumentNegotiation");
    expect(middleware).toContain("./edge/negotiation");
    expect(middleware).not.toContain("website/");
    expect(vercel.redirects).toEqual(expect.arrayContaining([
      { destination: "/", permanent: true, source: "/index.html" },
      { destination: "/preview/", permanent: true, source: "/preview" },
      { destination: "/preview/", permanent: true, source: "/preview/index.html" },
      ...PUBLIC_PAGES.slice(1).map((page) => ({
        destination: page.canonicalPath,
        permanent: true,
        source: page.canonicalPath.slice(0, -1),
      })),
      ...PUBLIC_PAGES.slice(1).map((page) => ({
        destination: page.canonicalPath,
        permanent: true,
        source: `/${page.outputFile}`,
      })),
    ]));

    const structuredMatch = /<script type="application\/ld\+json">([^<]+)<\/script>/u.exec(html);
    expect(structuredMatch?.[1]).toBeDefined();
    const structured: unknown = JSON.parse(structuredMatch?.[1] ?? "null");
    const graph = (structured as { "@graph"?: unknown })["@graph"];
    expect(Array.isArray(graph)).toBe(true);
    expect(graph).toEqual(expect.arrayContaining([
      expect.objectContaining({ "@id": `${SITE_ORIGIN}/#website`, "@type": "WebSite" }),
      expect.objectContaining({
        "@id": HRANESS_ORGANIZATION_ID,
        "@type": "Organization",
        url: HRANESS_URL,
      }),
      expect.objectContaining({
        "@id": `${SITE_ORIGIN}/#webpage`,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        mainEntity: { "@id": `${SITE_ORIGIN}/#software` },
      }),
      expect.objectContaining({
        "@id": `${SITE_ORIGIN}/#software`,
        sameAs: [
          "https://github.com/hraness/ghostget",
          npmPackageUrl,
          SKILLS_URL,
        ],
        softwareVersion: packageIdentity.version,
      }),
      expect.objectContaining({
        "@id": `${SITE_ORIGIN}/#source`,
        codeRepository: REPOSITORY_URL,
        targetProduct: { "@id": `${SITE_ORIGIN}/#software` },
        version: packageIdentity.version,
      }),
    ]));

    const descriptions = new Set<string>();
    for (const { definition, html: pageHtml } of pages) {
      const canonicalUrl = `${SITE_ORIGIN}${definition.canonicalPath}`;
      expect(pageHtml).toContain(`<title>${definition.title}</title>`);
      expect(pageHtml).toContain(`<meta name="description" content="${definition.description}">`);
      expect(pageHtml).toMatch(/aria-label="Ghostget home" class="(?:hraness-marketing-header__brand|wordmark hraness-foil-text)" data-foil="" href="\/"><span aria-hidden="true" class="brand-mark hraness-foil-mark" data-foil=""><img alt="" class="hraness-foil-mark__image" decoding="async" height="20" src="\/marks\/wrench\.svg" width="20" \/><span aria-hidden="true" class="hraness-foil-mark__paint"><\/span><\/span> Ghostget<\/a>/u);
      expect(pageHtml).not.toContain('class="wordmark" href="/">GHOSTGET</a>');
      expect(pageHtml).toContain(`<link rel="canonical" href="${canonicalUrl}">`);
      expect(pageHtml).toContain(`<meta property="og:title" content="${definition.title}">`);
      expect(pageHtml).toContain(`<meta property="og:description" content="${definition.description}">`);
      expect(pageHtml).toContain(`<meta property="og:url" content="${canonicalUrl}">`);
      expect(pageHtml).toContain(`<meta name="twitter:title" content="${definition.title}">`);
      expect(pageHtml).toContain(`<meta name="twitter:description" content="${definition.description}">`);
      expect(pageHtml).toContain('<meta name="robots" content="max-image-preview:large">');
      expect(pageHtml).toContain(`<link rel="alternate" type="text/markdown" title="Markdown" href="${SITE_ORIGIN}${markdownSiblingPath(definition.canonicalPath)}">`);
      expect(pageHtml).toContain('href="/about/"');
      expect(pageHtml).toContain('href="/contact/"');
      expect(pageHtml).toContain('href="/privacy/"');
      expect(pageHtml).toContain('href="/llms.txt"');
      expect(pageHtml).toContain(
        '<meta name="theme-color" content="#fbf1c7" media="(prefers-color-scheme: light)">',
      );
      expect(pageHtml).toContain(
        '<meta name="theme-color" content="#282828" media="(prefers-color-scheme: dark)">',
      );
      expect(pageHtml.match(/<meta name="theme-color"/gu)).toHaveLength(2);
      expect(pageHtml.match(/<h1\b/gu)).toHaveLength(1);
      expect(pageHtml).not.toContain('<meta name="keywords"');
      expect(pageHtml).not.toContain("{{");
      expect(pageHtml).not.toContain("FAQPage");
      descriptions.add(definition.description);

      const markdown = await readFile(
        join(websiteRoot, "dist", markdownSiblingPath(definition.canonicalPath).slice(1)),
        "utf8",
      );
      expect(markdown.startsWith("# ")).toBe(true);
      expect(markdown).toContain("Ghostget");
      expect(markdown).not.toMatch(/<\/[a-z]+>/i);
      expect(markdown.length).toBeGreaterThan(400);

      const jsonMatch = /<script type="application\/ld\+json">([^<]+)<\/script>/u.exec(pageHtml);
      expect(jsonMatch?.[1]).toBeDefined();
      const pageStructured: unknown = JSON.parse(jsonMatch?.[1] ?? "null");
      const pageGraph = (pageStructured as { "@graph"?: unknown })["@graph"];
      expect(Array.isArray(pageGraph)).toBe(true);
      expect(pageGraph).toEqual(expect.arrayContaining([
        expect.objectContaining({
          "@id": `${canonicalUrl}#webpage`,
          "@type": "WebPage",
          name: definition.title,
          url: canonicalUrl,
        }),
        expect.objectContaining({ "@id": `${SITE_ORIGIN}/#software` }),
        expect.objectContaining({ "@id": HRANESS_ORGANIZATION_ID }),
      ]));

      if (definition.canonicalPath !== "/") {
        expect(pageHtml).toContain('class="answer-lede"');
        expect(pageHtml).toContain('aria-label="Breadcrumb"');
        expect(pageHtml.match(/<h2\b/gu)?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(pageGraph).toEqual(expect.arrayContaining([
          expect.objectContaining({
            "@id": `${canonicalUrl}#article`,
            "@type": "TechArticle",
            mainEntityOfPage: { "@id": `${canonicalUrl}#webpage` },
          }),
          expect.objectContaining({
            "@id": `${canonicalUrl}#breadcrumb`,
            "@type": "BreadcrumbList",
          }),
        ]));
      }
    }
    expect(descriptions.size).toBe(PUBLIC_PAGES.length);
    // Pages state their release; none claims a review that has no record.
    for (const { html: pageHtml } of pages) {
      expect(pageHtml).not.toMatch(/checked against (?:the public|each project|public sources|that immutable)/u);
    }
    // One alt text for the shared social card, describing the card itself.
    expect(SOCIAL_IMAGE_ALT.length).toBeLessThanOrEqual(125);
    expect(SOCIAL_IMAGE_ALT).toContain(SITE_TITLE);
    expect(html).toContain(`<meta property="og:image:alt" content="${SOCIAL_IMAGE_ALT}">`);
    expect(html).toContain(`<meta name="twitter:image:alt" content="${SOCIAL_IMAGE_ALT}">`);
    for (const { html: pageHtml } of pages) {
      expect(pageHtml).not.toContain('image:alt" content="Ghostget: precise web capabilities for AI agents"');
    }

    const homepageMarkdown = await readFile(
      join(websiteRoot, "dist", markdownSiblingPath("/").slice(1)),
      "utf8",
    );
    expect(homepageMarkdown).not.toContain("![](");
    for (const image of editorialImages) {
      expect(homepageMarkdown).toContain(image.cardTitle);
      expect(homepageMarkdown).not.toContain(editorialImageUrl(image));
    }

    const editorialCards = html.match(
      /<article class="card editorial-card">[\s\S]*?<\/article>/gu,
    ) ?? [];
    expect(editorialCards).toHaveLength(editorialImages.length);
    for (const [index, image] of editorialImages.entries()) {
      const card = editorialCards[index] ?? "";
      expect(card).toMatch(
        /^<article class="card editorial-card">\s*<a href="[^"]+">[\s\S]*<\/a>\s*<\/article>$/u,
      );
      expect(card.match(/<a\b/gu)).toHaveLength(1);
      expect(card).toContain(`<a href="${image.canonicalPath}">`);
      expect(card.match(/<h[1-6]\b/gu)).toHaveLength(1);
      expect(card.match(/<h3\b/gu)).toHaveLength(1);
      expect(card.match(/<\/h3>/gu)).toHaveLength(1);
      expect(card).toContain(`<h3>${image.cardTitle}</h3>`);
      expect(card).toContain(
        `<p class="editorial-card-description">${image.cardDescription}</p>`,
      );
      expect(card).toMatch(/<\/h3>\s*<p class="editorial-card-description">/u);
      expect(card).not.toContain(`</strong>${image.cardDescription}`);
      expect(card).not.toMatch(/<\/h3>[^<\s]/u);
      const linkEnd = card.lastIndexOf("</a>");
      expect(card.indexOf("<img ")).toBeLessThan(linkEnd);
      expect(card).toContain(`sizes="${EDITORIAL_CARD_IMAGE_SIZES}"`);
      expect(card.indexOf("<h3>")).toBeLessThan(linkEnd);
      expect(card.indexOf('<p class="editorial-card-description">')).toBeLessThan(linkEnd);

      const page = pages.find(({ definition }) =>
        definition.canonicalPath === image.canonicalPath);
      expect(page).toBeDefined();
      const imageUrl = editorialImageUrl(image);
      expect(page?.html).toContain(`<meta property="og:image" content="${imageUrl}">`);
      expect(page?.html).toContain(`<meta property="og:image:width" content="${image.width}">`);
      expect(page?.html).toContain(`<meta property="og:image:height" content="${image.height}">`);
      expect(page?.html).toContain(`<meta property="og:image:alt" content="${image.alt}">`);
      expect(page?.html).toContain(`<meta name="twitter:image" content="${imageUrl}">`);
      expect(page?.html).toContain(`<meta name="twitter:image:alt" content="${image.alt}">`);
      expect(page?.html).toContain(`class="editorial-figure"`);
      expect(page?.html).toContain(`src="${image.src}"`);
      expect(page?.html).toContain(`srcset="${editorialImageSrcSet(image)}"`);
      expect(page?.html).toContain(`sizes="${EDITORIAL_ARTICLE_IMAGE_SIZES}"`);
      expect(page?.html).not.toContain('fetchpriority="high"');
      expect(page?.html).toContain(`alt="${image.alt}"`);
      expect(page?.html).toContain(image.caption);
      expect(page?.html).toContain(image.credit);
      expect(image.credit).toMatch(
        /^Editorial illustration generated with (?:Atet|Slopcamera)\.$/u,
      );
      expect(page?.html).not.toContain("editorial-provenance/");
      expect(page?.html).not.toContain("gateway_");
      const answerLedeIndex = page?.html.indexOf('class="answer-lede"') ?? -1;
      const figureIndex = page?.html.indexOf('class="editorial-figure"') ?? -1;
      const reviewNoteIndex = page?.html.indexOf('class="review-note"') ?? -1;
      expect(answerLedeIndex).toBeGreaterThan(-1);
      expect(figureIndex).toBeGreaterThan(answerLedeIndex);
      expect(reviewNoteIndex).toBeGreaterThan(figureIndex);

      const editorialMarkdown = await readFile(
        join(websiteRoot, "dist", markdownSiblingPath(image.canonicalPath).slice(1)),
        "utf8",
      );
      expect(editorialMarkdown).toContain(`![${image.alt}](${imageUrl})`);
      expect(editorialMarkdown).toContain(`${image.caption} ${image.credit}`);

      const structuredMatch = /<script type="application\/ld\+json">([^<]+)<\/script>/u
        .exec(page?.html ?? "");
      const structured = JSON.parse(structuredMatch?.[1] ?? "null") as {
        "@graph"?: Array<{ "@type"?: string; image?: unknown }>;
      };
      const article = structured["@graph"]?.find((entry) => entry["@type"] === "TechArticle");
      expect(article?.image).toEqual({
        "@type": "ImageObject",
        caption: image.caption,
        contentUrl: imageUrl,
        creditText: image.credit,
        height: image.height,
        url: imageUrl,
        width: image.width,
      });

      const fileBytes = new Uint8Array(await Bun.file(join(websiteRoot, "public", image.src)).arrayBuffer());
      expect(createHash("sha256").update(fileBytes).digest("hex")).toBe(image.imageSha256);
      expect(lossyWebpDimensions(fileBytes)).toEqual({ height: image.height, width: image.width });
      const derivativeByteLengths: number[] = [];
      for (const derivative of image.derivatives) {
        const derivativeBytes = new Uint8Array(
          await Bun.file(join(websiteRoot, "public", derivative.src)).arrayBuffer(),
        );
        expect(createHash("sha256").update(derivativeBytes).digest("hex"))
          .toBe(derivative.sha256);
        expect(lossyWebpDimensions(derivativeBytes)).toEqual({
          height: derivative.height,
          width: derivative.width,
        });
        derivativeByteLengths.push(derivativeBytes.byteLength);
      }
      expect(derivativeByteLengths[0]).toBeLessThan(derivativeByteLengths[1] ?? 0);
      expect(derivativeByteLengths[1]).toBeLessThan(fileBytes.byteLength);
      const receipt = await Bun.file(join(websiteRoot, image.provenance.receipt)).json() as {
        localValidation?: { status?: string };
        outputs?: Array<{ sha256?: string }>;
        request?: { promptSha256?: string };
      };
      const job = await Bun.file(join(websiteRoot, image.provenance.job)).json() as {
        clientMaxRetries?: number;
        noAtetRetry?: boolean;
        noSlopcameraRetry?: boolean;
        request?: { promptSha256?: string };
        state?: string;
      };
      const prompt = await Bun.file(join(websiteRoot, image.provenance.prompt)).text();
      expect(receipt.outputs?.[0]?.sha256).toBe(image.imageSha256);
      expect(receipt.localValidation?.status).toBe("decode-passed");
      expect(job).toMatchObject({
        clientMaxRetries: 0,
        state: "completed",
      });
      expect(job.noAtetRetry === true || job.noSlopcameraRetry === true).toBe(true);
      // Atet pinned the trimmed prompt text; Slopcamera pins the exact file
      // bytes. Either derivation is valid as long as the generator's own
      // receipt and job record the registered value.
      const promptHashes = new Set([
        createHash("sha256").update(prompt).digest("hex"),
        createHash("sha256").update(prompt.trim()).digest("hex"),
      ]);
      expect(promptHashes.has(image.provenance.promptSha256)).toBe(true);
      expect(job.request?.promptSha256).toBe(image.provenance.promptSha256);
      expect(receipt.request?.promptSha256).toBe(image.provenance.promptSha256);
    }
    expect(editorialImages.some(({ canonicalPath }) =>
      canonicalPath === ("/paypal-grapheneos-attestation/" as never))).toBe(false);
    expect(editorialImages.some(({ canonicalPath }) =>
      canonicalPath === ("/rumour-is-the-exploit/" as never))).toBe(false);
    expect(editorialImages.some(({ canonicalPath }) =>
      canonicalPath === ("/omarchy-root-escalation/" as never))).toBe(false);

    expect(html).toContain('href="https://pipedream.com/docs/connect">Pipedream Connect</a>');
    expect(html).toContain("Hosted integration breadth and managed end-user authentication");
    expect(html).toContain('href="https://docs.apify.com/integrations/mcp">Apify MCP</a>');
    expect(html).toContain("Discovering and running eligible Apify Store Actors");
    expect(html).toContain('href="/compare/browserbase/">Browserbase + Stagehand</a>');
    expect(html).toContain("Managed cloud browser sessions at scale, with proxies, stealth, and session replay");
    expect(html).toContain(
      "Encrypted local copies of reads, a preview and a record for every write, and actions that stop when a service changes",
    );

    const gettingStarted = pages.find((page) => page.definition.canonicalPath === "/docs/tutorials/getting-started/");
    expect(gettingStarted?.html).toContain("Ghostget developer resources");
    expect(gettingStarted?.html).toContain(
      `<a href="${npmPackageUrl}">Install the <code>@hraness/ghostget</code> CLI and TypeScript SDK from GitHub Releases</a>`,
    );
    expect(gettingStarted?.html).toContain(
      `<a href="${SKILLS_URL}">Install the Ghostget Agent Skill from skills.sh</a>`,
    );
    expect(gettingStarted?.html).toContain(`<code>${skillInstallCommands.npx}</code>`);
    expect(gettingStarted?.html).toContain("does not publish a hosted API");
    expect(gettingStarted?.html).toContain('id="demo"');
    expect(gettingStarted?.html).toContain('poster="/wrench-first-capture.png"');
    expect(gettingStarted?.html).toContain('src="/wrench-first-capture.webm"');
    expect(gettingStarted?.html).toContain('src="/wrench-first-capture.mp4"');
    expect(gettingStarted?.html).toContain('src="/wrench-first-capture.vtt"');
    expect(gettingStarted?.html).toContain('href="/wrench-first-capture.gif"');
    expect(gettingStarted?.html).not.toContain('class="editorial-figure"');
    expect(gettingStarted?.html).toContain("successful Wrench 0.13.5 run on August 25, 2026");
    expect(gettingStarted?.html).toContain("before the project became Ghostget");
    expect(gettingStarted?.html).toContain("The terminal text is actual CLI output");

    const privacy = pages.find((page) => page.definition.canonicalPath === "/privacy/");
    expect(privacy?.html).toContain("The CLI stores state on the operator's machine");
    expect(privacy?.html).toContain("Local custody does not mean that every stored byte is encrypted");
    expect(privacy?.html).toContain("Ghostget-managed Gmail OAuth JSON file");
    expect(privacy?.html).toContain("The CLI and SDK do not send ghostget.com analytics");
    expect(privacy?.html).toContain("ghostget auth remove ID --yes");
    expect(privacy?.html).toContain("it is not a hostile native-code sandbox");
    expect(privacy?.html).toContain(
      "transient full copies of the private Photos and Contacts SQLite databases",
    );
    expect(privacy?.html).toContain("Those copies can include unselected columns and raw blobs");
    expect(privacy?.html).toContain("The privacy exclusions apply only to the returned JSON");
    expect(privacy?.html).toContain(
      "does not open, copy, or ask Photos to materialize referenced photo or video asset files",
    );
    const privacyMarkdown = await readFile(
      join(websiteRoot, "dist", markdownSiblingPath("/privacy/").slice(1)),
      "utf8",
    );
    const mailingHtml = /<section aria-labelledby="website-mailing-list">[\s\S]*?<\/section>/u
      .exec(privacy?.html ?? "")?.[0];
    const mailingMarkdown = /## Ghostget mailing-list subscriptions are separate[\s\S]*?(?=\n\n## )/u
      .exec(privacyMarkdown)?.[0];
    const normalizeMailingCopy = (value: string | undefined): string =>
      (value ?? "")
        .replaceAll(/<[^>]+>/gu, " ")
        .replaceAll(/[`#]/gu, "")
        .replaceAll(/\s+/gu, " ")
        .replaceAll(/\s+([,.;:!?])/gu, "$1")
        .trim();
    const expectedMailingCopy = [
      "Ghostget mailing-list subscriptions are separate",
      "The optional footer form submits to Hraness Accounts, which processes the email address at https://account.hraness.com/api/mailing/subscribe. Each request uses the fixed wrench audience and source=hraness-site-footer. An eligible request records a pending Ghostget membership. Resend processes the email address to deliver a confirmation message from newsletter@news.hraness.com. The emailed link opens the Hraness Accounts confirmation page. Only the page's explicit Confirm subscription POST records consent and changes the membership to subscribed.",
      "Subscribed members can receive later Ghostget mail through Resend from news.hraness.com. Unsubscribing retains the Ghostget membership and consent history, changes only that membership to unsubscribed, and leaves every other Hraness audience unchanged. The mailing list is optional: using the Ghostget CLI, SDK, or ghostget.com does not require a subscription, and a Ghostget subscription does not enroll the address in another Hraness audience.",
    ].join(" ");
    const normalizedMailingCopies = [mailingHtml, mailingMarkdown].map(normalizeMailingCopy);
    expect(normalizedMailingCopies).toEqual([expectedMailingCopy, expectedMailingCopy]);
    const lifecycleStages = [
      "pending Ghostget membership",
      "emailed link opens the Hraness Accounts confirmation page",
      "explicit Confirm subscription POST records consent",
      "membership to subscribed",
      "retains the Ghostget membership and consent history",
      "membership to unsubscribed",
      "leaves every other Hraness audience unchanged",
    ];
    for (const copy of normalizedMailingCopies) {
      const lifecycleOffsets = lifecycleStages.map((stage) => copy.indexOf(stage));
      expect(lifecycleOffsets.every((offset) => offset >= 0)).toBe(true);
      expect(lifecycleOffsets).toEqual([...lifecycleOffsets].sort((left, right) => left - right));
    }

    const providerCapabilities = pages.find((page) =>
      page.definition.canonicalPath === "/docs/reference/provider-capabilities/");
    const attestation = await loadProviderCapabilityAttestation(repositoryRoot);
    const providerDirectory = createProviderDirectory(attestation);
    const providerCards = renderProviderOverviewCards(providerDirectory);
    const providerGroups = renderProviderAttestationGroups(providerDirectory, attestation);
    const providerMarkdown = await readFile(
      join(websiteRoot, "dist", markdownSiblingPath("/docs/reference/provider-capabilities/").slice(1)),
      "utf8",
    );
    expect(providerCapabilities?.html).toContain(
      "This directory lists the current release's generic actions and, separately, owner-only messaging permissions.",
    );
    expect(html).toContain(providerCards);
    expect(providerCapabilities?.html).toContain(providerCards);
    expect(html.match(/class="provider-mark"/gu)).toHaveLength(providerDirectory.providerCount);
    expect(providerCapabilities?.html.match(/class="provider-mark"/gu))
      .toHaveLength(providerDirectory.providerCount);
    expect(html.match(/class="provider-feature-copy"/gu)).toHaveLength(1);
    expect(providerCapabilities?.html.match(/class="provider-feature-copy"/gu)).toHaveLength(1);
    expect(html).toContain(
      `${String(BEEPER_PRESENTATION_TRANSPORT_COUNTS.cliBackedOperationCount)} actions run through a pinned version of Beeper's official CLI, and ${String(BEEPER_PRESENTATION_TRANSPORT_COUNTS.desktopLoopbackOperationCount)} are fixed reads from Beeper Desktop. Writes need a preview first, and Ghostget never resends a write whose outcome is unknown.`,
    );
    expect(providerCapabilities?.html).toContain(
      `${String(BEEPER_PRESENTATION_TRANSPORT_COUNTS.cliBackedOperationCount)} actions run through a pinned version of Beeper's official CLI, and ${String(BEEPER_PRESENTATION_TRANSPORT_COUNTS.desktopLoopbackOperationCount)} are fixed reads from Beeper Desktop. Writes need a preview first, and Ghostget never resends a write whose outcome is unknown.`,
    );
    expect(html).toContain(
      `<h2 id="providers-title">Reviewed actions across ${String(providerDirectory.providerCount)} services.</h2>`,
    );
    expect(html).toContain("Each card shows how Ghostget connects to that service and links to");
    expect(html).toContain("its supported actions in this release.");
    expect(html).not.toContain("Each card names the actions");
    for (const entry of providerDirectory.entries) {
      expect(html).toContain(`data-provider-icon="${entry.icon}"`);
      expect(providerCapabilities?.html).toContain(`data-provider-icon="${entry.icon}"`);
    }
    expect(providerCapabilities?.html).toContain(providerGroups);
    expect(providerCapabilities?.html).toContain("Owner messaging permissions");
    expect(providerCapabilities?.html).toContain("unavailable through generic invoke");
    expect(providerMarkdown).toContain("owner host only");
    expect(providerCapabilities?.html).toContain("Supported actions by service");
    expect(providerCapabilities?.html).toContain("Official API");
    expect(providerCapabilities?.html).toContain(`<code>contacts.list</code>`);
    expect(providerCapabilities?.html).toContain(
      "transient full copies of the current macOS account's private Photos and Contacts SQLite databases",
    );
    expect(providerCapabilities?.html).toContain("can include unselected columns and raw blobs");
    expect(providerCapabilities?.html).toContain("The listed exclusions apply only to the returned JSON");
    expect(providerCapabilities?.html).toContain(
      "does not open, copy, or ask Photos to materialize referenced photo or video asset files",
    );
    expect(providerCapabilities?.html).toContain("distinct <code>ZASSET</code>-row counts");
    expect(providerMarkdown).toContain("unselected columns and raw blobs");
    expect(providerMarkdown).toContain("exclusions apply only to the returned JSON");
    expect(providerMarkdown).toContain(
      "does not open, copy, or ask Photos to materialize referenced photo or video asset files",
    );
    expect(providerCapabilities?.html).not.toMatch(/observed|capture-required|reservation|completeness|adapter/iu);
    expect(providerCapabilities?.html).not.toContain("Telegram");
    expect(providerCapabilities?.html).not.toContain("{{PROVIDER_CAPABILITY");
    expect(providerMarkdown).toContain("### Beeper");
    expect(providerMarkdown).toContain("32 supported actions");
    expect(providerMarkdown).toContain("- **List accounts** (`accounts.list`) · Local app");
    expect(providerMarkdown).toContain(
      "- **Focus conversation** (`conversations.focus`) · Local app",
    );
    expect(providerMarkdown).toContain(
      "- **Send Notify Anyway** (`conversations.notify`) · Local app",
    );
    expect(providerMarkdown).toContain("- **Send message** (`messaging.send`) · Local app");
    expect(providerMarkdown).toContain("Public web, no sign-in");
    const providerActionLines = providerMarkdown.split("\n").filter((line) =>
      line.startsWith("- **"));
    expect(providerActionLines.length).toBeGreaterThan(0);
    expect(providerActionLines.every((line) =>
      /^- \*\*[^*]+\*\* \(`[^`]+`\) · [^\s].+$/u.test(line))).toBe(true);
    expect(providerMarkdown).not.toMatch(/observed|capture-required|reservation|completeness|adapter/iu);

    const beeper = pages.find((page) => page.definition.canonicalPath === "/docs/how-to/connect-beeper/");
    const beeperFacts = createBeeperPresentationFacts(providerDirectory);
    expect(beeper?.html).toContain(`<title>${beeperFacts.pageTitle}</title>`);
    expect(beeper?.html).toContain(
      `<meta name="description" content="${beeperFacts.pageDescription}">`,
    );
    expect(beeper?.html).toContain(
      `<h1>Use Beeper through ${beeperFacts.observedOperationCount} supported actions</h1>`,
    );
    expect(beeper?.html).toContain(`adapter <code>beeper-local</code> ${beeperFacts.adapterVersion}`);
    expect(beeper?.html).toContain(`official Beeper CLI ${beeperFacts.cliVersion}`);
    expect(beeper?.html).toContain(
      `The tagged source path is <code>${beeperFacts.cliSourcePackagePath}</code>, and its declared ${beeperFacts.cliSourceDeclaredVersion} is provenance only`,
    );
    expect(beeper?.html).toContain(beeperFacts.cliSourceVersionDiscrepancy);
    expect(beeper?.html).toContain(
      `href="${beeperFacts.cliReleaseUrl}">official ${beeperFacts.cliVersion} release</a>`,
    );
    expect(beeper?.html).toContain(
      `${beeperFacts.semanticContractVersionLabel} across the current ${beeperFacts.observedOperationCount} operations`,
    );
    expect(beeper?.html).toContain(beeperFacts.artifactTable);
    expect(beeper?.html).toContain(
      `&lt;GHOSTGET_STATE_HOME&gt;/tools/beeper/${beeperFacts.cliVersion}/beeper`,
    );
    expect(beeper?.html).toContain('aria-current="location" href="/docs/reference/provider-capabilities/"');
    expect(beeper?.html).toContain("one fixed POST");
    expect(beeper?.html).toContain("pendingMessageID");
    expect(beeper?.html).toContain("proves submission to Desktop only, not network delivery");
    expect(beeper?.html).toContain("does not call the CLI or SDK and never retries");
    expect(beeper?.html).toContain("A separately obtained exact read may be inspected");
    expect(beeper?.html).toContain(
      "Without an already accepted exact provider message identity, the run remains indeterminate and unretriable",
    );
    expect(beeper?.html).toContain("only that identity could make reconciliation categorical");
    expect(beeper?.html).not.toContain(
      "reconcile the same run from a separately obtained exact read",
    );
    expect(beeper?.html).not.toContain("--wait");
    expect(beeper?.html).not.toContain("terminal returned message ID");
    expect(beeper?.html).toContain("Use Beeper directly when you want its first-party breadth");
    expect(beeper?.html).not.toContain("lowest-friction");
    expect(beeper?.html).toContain(
      'href="https://developers.beeper.com/desktop-api/mcp/">built-in Beeper Desktop MCP</a>',
    );
    expect(beeper?.html).toContain('href="https://github.com/beeper/cli">official Beeper CLI</a>');
    expect(beeper?.html).toContain("exact executable and adapter-version pinning");
    expect(beeper?.html).toContain(
      "write previews, durable receipts, contract-specific reconciliation for generic CLI mutations, and no blind retry",
    );
    expect(beeper?.html).toContain("encrypted snapshots");
    expect(beeper?.html).toContain("versioned Message Like Me and contact-interaction exports");
    expect(beeper?.html).toContain("It wraps only the actions listed for this release");
    expect(beeper?.html).toContain(`all ${beeperFacts.cliCommandCount} public manual command paths`);
    expect(beeper?.html.match(/Beeper's supported action names and access methods/gu))
      .toHaveLength(2);
    expect(beeper?.html).not.toContain("operation-level contracts, risks, and limits");
    expect(beeper?.html).not.toContain("all Beeper contracts");
    expect(beeper?.html).toContain("<code>targets status</code>, <code>version</code>, and top-level <code>export</code> are internal");
    expect(beeper?.html).toContain("plain <code>status</code> is among the 53 unsupported paths");
    expect(beeper?.html).toContain("<code>messages delete</code> are R4 and unavailable to provider dispatch");
    expect(beeper?.html).toContain("None of those three R4 paths appears in the selected 32-operation provider adapter");
    expect(beeper?.html).not.toContain("R4/capture-required");
    expect(beeper?.html).toContain("messages.delete");
    expect(beeper?.html).toContain("fall back to deletion for only the authenticated user");
    expect(beeper?.html).toContain("returns a void success response");
    expect(beeper?.html).toContain("never dispatches this action");
    expect(beeper?.html).toContain("media.download");
    expect(beeper?.html).toContain("buffers the complete media body to stdout");
    expect(beeper?.html).toContain("no reviewed finite supervisor and proven termination contract");
    expect(beeper?.html).toContain("top-level CLI export is internal-only");
    expect(beeper?.html).toContain("--no-attachments");
    expect(beeper?.html).toContain('href="https://developers.beeper.com/desktop-api/"');
    expect(beeper?.html).toContain("sending too many messages may result in suspension");
    expect(beeper?.html).toContain("network's throttling, automation, or suspension rules");
    expect(beeper?.html).toContain("These workflows are not part of the 32 supported actions");
    expect(beeper?.html).not.toMatch(/all Beeper (?:CLI )?features/iu);
    expect(beeper?.html).not.toMatch(/all (?:your )?chats/iu);
    expect(beeper?.html).not.toContain("exactly once");
    expect(beeper?.html).not.toContain("seamless");
    expect(beeper?.html).not.toContain("Provider capabilities attestation");
    expect(beeper?.html).toContain("wrench.messaging-route-resolve-request");
    const beeperJsonMatch = /<script type="application\/ld\+json">([^<]+)<\/script>/u.exec(
      beeper?.html ?? "",
    );
    const beeperStructured = JSON.parse(beeperJsonMatch?.[1] ?? "null") as {
      "@graph"?: ReadonlyArray<Readonly<Record<string, unknown>>>;
    };
    const beeperBreadcrumb = beeperStructured["@graph"]?.find((node) =>
      node["@id"] === `${SITE_ORIGIN}/docs/how-to/connect-beeper/#breadcrumb`);
    expect(beeperBreadcrumb).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: "Ghostget", position: 1, item: `${SITE_ORIGIN}/` },
        { name: "Documentation", position: 2, item: `${SITE_ORIGIN}/docs/` },
        { name: beeperFacts.pageTitle, position: 3, item: `${SITE_ORIGIN}/docs/how-to/connect-beeper/` },
      ],
    });
    const agentFacingMessagingDocs = [
      beeper?.html ?? "",
      readme,
      await readFile(
        join(repositoryRoot, "skills/ghostget/references/messaging.md"),
        "utf8",
      ),
    ];
    for (const document of agentFacingMessagingDocs) {
      expect(document).not.toContain("ghostget beeper-local messaging.send");
      expect(document).toContain(
        '{"schemaVersion":2,"format":"wrench.messaging-route-resolve-request"',
      );
      expect(document).not.toContain(
        '{"schemaVersion":1,"format":"wrench.messaging-route-resolve-request"',
      );
      for (const command of [
        "ghostget messaging routes",
        "ghostget messaging resolve",
        "ghostget messaging context",
        "ghostget messaging preview",
      ]) expect(document).toContain(command);
    }

    const whatsapp = pages.find((page) =>
      page.definition.canonicalPath === "/docs/how-to/export-whatsapp/");
    const whatsappFacts = createWhatsAppPresentationFacts(providerDirectory, attestation);
    expect(whatsapp?.html).toContain(`<title>${whatsappFacts.pageTitle}</title>`);
    expect(whatsapp?.html).toContain(
      `<meta name="description" content="${whatsappFacts.pageDescription}">`,
    );
    expect(whatsapp?.html).toContain(
      "<h1>Export WhatsApp history for Textbutler</h1>",
    );
    expect(whatsapp?.html).toContain(
      "one private bundle for Textbutler (formerly Message Like Me) in the Message Like Me schema-2 format",
    );
    expect(whatsapp?.html).toContain("six NDJSON files plus <code>manifest.json</code>");
    expect(whatsapp?.html).toContain("local-message schema <code>2</code>");
    expect(whatsapp?.html).toContain("<code>wacli-local@1.0.0</code>");
    expect(whatsapp?.html).toContain("<code>whatsapp@0.15.0</code>");
    expect(whatsapp?.html).toContain("Message Like Me v0.7.0");
    expect(whatsapp?.html).toContain("phone-number (PN) and linked-identity (LID)");
    expect(whatsapp?.html).toContain("Reaction rows are excluded");
    expect(whatsapp?.html).toContain("<code>reaction-state-unproven</code>");
    expect(whatsapp?.html).toContain("<code>remote-history-incomplete</code>");
    expect(whatsapp?.html).toContain(whatsappFacts.wacliCommit);
    expect(whatsapp?.html).toContain(whatsappFacts.archiveSha256);
    expect(whatsapp?.html).toContain(whatsappFacts.binarySha256);
    expect(whatsapp?.html).toContain("Runtime reads do not claim to repeat online notarization");
    expect(whatsapp?.html).not.toMatch(/retains? reaction/iu);
    expect(whatsapp?.html).not.toContain("runtime notarization");
    expect(whatsapp?.html).not.toContain("ghostget auth pair");
    expect(whatsapp?.html).not.toContain("ghostget auth sync");
    const whatsappJsonMatch = /<script type="application\/ld\+json">([^<]+)<\/script>/u.exec(
      whatsapp?.html ?? "",
    );
    const whatsappStructured = JSON.parse(whatsappJsonMatch?.[1] ?? "null") as {
      "@graph"?: ReadonlyArray<Readonly<Record<string, unknown>>>;
    };
    const whatsappBreadcrumb = whatsappStructured["@graph"]?.find((node) =>
      node["@id"] === `${SITE_ORIGIN}/docs/how-to/export-whatsapp/#breadcrumb`);
    expect(whatsappBreadcrumb).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: "Ghostget", position: 1, item: `${SITE_ORIGIN}/` },
        { name: "Documentation", position: 2, item: `${SITE_ORIGIN}/docs/` },
        { name: whatsappFacts.pageTitle, position: 3, item: `${SITE_ORIGIN}/docs/how-to/export-whatsapp/` },
      ],
    });

    const personalAgents = pages.find((page) =>
      page.definition.canonicalPath === "/compare/personal-agents-browser-use/");
    expect(personalAgents?.html).toContain(
      "<h1>Browser-using personal agents and Ghostget’s named web actions</h1>",
    );
    expect(personalAgents?.html).toContain(
      "https://hraness.com/reading/personal-agents-notes-instinct-grok-bots-chatgpt-work",
    );
    expect(personalAgents?.html).toContain("https://ghostget.com/");
    expect(personalAgents?.html).toContain("https://ghostget.com/docs/reference/provider-capabilities/");
    expect(personalAgents?.html).toContain("https://ghostget.com/docs/explanation/security-model/");
    expect(personalAgents?.html).toContain(
      `The current release offers ${providerDirectory.entries.reduce((sum, entry) => sum + entry.supportedActionCount, 0)} supported provider actions.`,
    );
    expect(personalAgents?.html).toContain("Telegram is not supported in this release");
    expect(personalAgents?.html).toContain("Instinct");
    expect(personalAgents?.html).toContain("Grok Bots");
    expect(personalAgents?.html).toContain("ChatGPT Work");
    expect(personalAgents?.html).toContain("never switches to a browser fallback silently");
    expect(personalAgents?.html).toContain("https://ghostget.com/agentic-web-spoofing/");
    expect(personalAgents?.html).toContain("https://ghostget.com/vms-cannot-contain-agents/");
    expect(personalAgents?.html).not.toContain("{{PROVIDER_CAPABILITY");
    expect(personalAgents?.html).not.toMatch(/capture-required|<code>observed<\/code>/iu);

    const agenticWebSpoofing = pages.find((page) =>
      page.definition.canonicalPath === "/agentic-web-spoofing/");
    expect(agenticWebSpoofing?.html).toContain(
      "<h1>A claimed agent name is not an attested web operation.</h1>",
    );
    expect(agenticWebSpoofing?.html).toContain("https://knownagents.com/insights");
    expect(agenticWebSpoofing?.html).toContain(
      "https://hraness.com/reading/agentic-web-index-spoofing-and-security",
    );
    expect(agenticWebSpoofing?.html).toContain("https://hraness.com");
    expect(agenticWebSpoofing?.html).toContain("https://ghostget.com/");
    expect(agenticWebSpoofing?.html).toContain("https://ghostget.com/docs/reference/provider-capabilities/");
    expect(agenticWebSpoofing?.html).toContain("https://ghostget.com/docs/explanation/security-model/");
    expect(agenticWebSpoofing?.html).toContain(
      "https://ghostget.com/compare/personal-agents-browser-use/",
    );
    expect(agenticWebSpoofing?.html).toContain(
      "A visit is considered spoofed when it claims a recognized agent identity but fails that agent's supported authentication method, such as verified IP or Web Bot Auth.",
    );
    expect(agenticWebSpoofing?.html).toContain(
      "A failed check indicates that the visit was likely impersonating the named agent; it does not identify the software or operator that actually made the request.",
    );
    expect(agenticWebSpoofing?.html).toContain(
      "Agents without a supported authentication method are not included in these measurements.",
    );
    expect(agenticWebSpoofing?.html).toContain(
      "Results characterize the observed network and broader directional trends; they should not be interpreted as a precise census of global web traffic.",
    );
    expect(agenticWebSpoofing?.html).toContain(
      "We are observing a widespread campaign impersonating AI bots to scan websites for vulnerabilities.",
    );
    expect(agenticWebSpoofing?.html).toContain(
      `The current release attests ${attestation.operationCount} operations across ${attestation.adapterCount} bundled public adapters.`,
    );
    expect(agenticWebSpoofing?.html).toContain(
      `${attestation.observedCount} are <code>observed</code>. ${attestation.captureRequiredCount} remain <code>capture-required</code>.`,
    );
    expect(agenticWebSpoofing?.html).toContain("Telegram is absent from those manifests");
    expect(agenticWebSpoofing?.html).toContain("this page does not invent those names");
    expect(agenticWebSpoofing?.html).toContain("The pages do not reprint one another.");
    expect(agenticWebSpoofing?.html).toContain("https://ghostget.com/vms-cannot-contain-agents/");
    expect(agenticWebSpoofing?.html).not.toContain("{{PROVIDER_CAPABILITY");

    const vmsCannotContainAgents = pages.find((page) =>
      page.definition.canonicalPath === "/vms-cannot-contain-agents/");
    expect(vmsCannotContainAgents?.html).toContain(
      "<h1>A VM is not an attested web operation.</h1>",
    );
    expect(vmsCannotContainAgents?.html).toContain(
      "https://blog.trailofbits.com/2026/08/26/vms-wont-contain-cyber-capable-agents/",
    );
    expect(vmsCannotContainAgents?.html).toContain("VMs won’t contain cyber-capable agents");
    expect(vmsCannotContainAgents?.html).toContain("https://rough.day");
    expect(vmsCannotContainAgents?.html).toContain("https://rough.day/info");
    expect(vmsCannotContainAgents?.html).toContain("Wednesday 26 August 2026");
    expect(vmsCannotContainAgents?.html).toContain("Trail of Bits argues VMs cannot reliably contain cyber-capable AI agents");
    expect(vmsCannotContainAgents?.html).toContain("https://hraness.com");
    expect(vmsCannotContainAgents?.html).toContain("https://ghostget.com/");
    expect(vmsCannotContainAgents?.html).toContain("https://ghostget.com/docs/reference/provider-capabilities/");
    expect(vmsCannotContainAgents?.html).toContain("https://ghostget.com/agentic-web-spoofing/");
    expect(vmsCannotContainAgents?.html).toContain(
      "https://ghostget.com/compare/personal-agents-browser-use/",
    );
    expect(vmsCannotContainAgents?.html).toContain(
      `The current release attests ${attestation.operationCount} operations across ${attestation.adapterCount} bundled public adapters.`,
    );
    expect(vmsCannotContainAgents?.html).toContain(
      `${attestation.observedCount} are <code>observed</code>. ${attestation.captureRequiredCount} remain <code>capture-required</code>.`,
    );
    expect(vmsCannotContainAgents?.html).toContain("Telegram is absent from those manifests");
    expect(vmsCannotContainAgents?.html).toContain("does not sell a hypervisor, a microVM, or a hostile-code sandbox");
    expect(vmsCannotContainAgents?.html).toContain("The pages do not reprint one another.");
    expect(vmsCannotContainAgents?.html).toContain("https://ghostget.com/paypal-grapheneos-attestation/");
    expect(vmsCannotContainAgents?.html).toContain("https://ghostget.com/rumour-is-the-exploit/");
    expect(vmsCannotContainAgents?.html).toContain("https://ghostget.com/omarchy-root-escalation/");
    expect(vmsCannotContainAgents?.html).not.toContain("{{PROVIDER_CAPABILITY");
    expect(vmsCannotContainAgents?.html).not.toContain("stripedex.com");
    expect(vmsCannotContainAgents?.html).not.toContain("spongeresearch.com");

    const paypalGrapheneOsAttestation = pages.find((page) =>
      page.definition.canonicalPath === "/paypal-grapheneos-attestation/");
    expect(paypalGrapheneOsAttestation?.html).toContain(
      "<h1>Device policy is not a named web operation.</h1>",
    );
    expect(paypalGrapheneOsAttestation?.html).toContain(
      "https://news.ycombinator.com/item?id=49462253",
    );
    expect(paypalGrapheneOsAttestation?.html).toContain("Tell HN: PayPal blocks GrapheneOS");
    expect(paypalGrapheneOsAttestation?.html).toContain("https://rough.day");
    expect(paypalGrapheneOsAttestation?.html).toContain("https://rough.day/info");
    expect(paypalGrapheneOsAttestation?.html).toContain("Thursday 27 August 2026");
    expect(paypalGrapheneOsAttestation?.html).toContain(
      "PayPal app crashes on GrapheneOS, citing a root-detection security violation",
    );
    expect(paypalGrapheneOsAttestation?.html).toContain(
      "com.paypal.oslo.app.rasp.RootDetectionSecurityException: Security policy violation: s=root",
    );
    expect(paypalGrapheneOsAttestation?.html).toContain("https://hraness.com");
    expect(paypalGrapheneOsAttestation?.html).toContain("https://ghostget.com/");
    expect(paypalGrapheneOsAttestation?.html).toContain("https://ghostget.com/docs/reference/provider-capabilities/");
    expect(paypalGrapheneOsAttestation?.html).toContain("https://ghostget.com/agentic-web-spoofing/");
    expect(paypalGrapheneOsAttestation?.html).toContain("https://ghostget.com/vms-cannot-contain-agents/");
    expect(paypalGrapheneOsAttestation?.html).toContain(
      `The current release attests ${attestation.operationCount} operations across ${attestation.adapterCount} bundled public adapters.`,
    );
    expect(paypalGrapheneOsAttestation?.html).toContain(
      `${attestation.observedCount} are <code>observed</code>. ${attestation.captureRequiredCount} remain <code>capture-required</code>.`,
    );
    expect(paypalGrapheneOsAttestation?.html).toContain("Telegram is absent from those manifests");
    expect(paypalGrapheneOsAttestation?.html).toContain("does not invent a PayPal API");
    expect(paypalGrapheneOsAttestation?.html).toContain("The pages do not reprint one another.");
    expect(paypalGrapheneOsAttestation?.html).toContain("https://ghostget.com/rumour-is-the-exploit/");
    expect(paypalGrapheneOsAttestation?.html).toContain("https://ghostget.com/omarchy-root-escalation/");
    expect(paypalGrapheneOsAttestation?.html).not.toContain("{{PROVIDER_CAPABILITY");
    expect(paypalGrapheneOsAttestation?.html).not.toContain("stripedex.com");
    expect(paypalGrapheneOsAttestation?.html).not.toContain("spongeresearch.com");

    const rumourIsTheExploit = pages.find((page) =>
      page.definition.canonicalPath === "/rumour-is-the-exploit/");
    expect(rumourIsTheExploit?.html).toContain(
      "<h1>A rumour is not a named web operation.</h1>",
    );
    expect(rumourIsTheExploit?.html).toContain("Sourced take");
    expect(rumourIsTheExploit?.html).toContain(
      "https://anil.recoil.org/notes/rumour-is-the-exploit",
    );
    expect(rumourIsTheExploit?.html).toContain(
      "https://hraness.com/reading/rumour-is-the-exploit",
    );
    expect(rumourIsTheExploit?.html).toContain(
      "Just a rumour of a bug is enough to find a security exploit these days",
    );
    expect(rumourIsTheExploit?.html).toContain("Monday 31 August 2026");
    expect(rumourIsTheExploit?.html).toContain("22 August 2026");
    expect(rumourIsTheExploit?.html).toContain("https://hraness.com");
    expect(rumourIsTheExploit?.html).toContain("https://ghostget.com/");
    expect(rumourIsTheExploit?.html).toContain("https://ghostget.com/docs/reference/provider-capabilities/");
    expect(rumourIsTheExploit?.html).toContain("https://ghostget.com/vms-cannot-contain-agents/");
    expect(rumourIsTheExploit?.html).toContain("https://ghostget.com/paypal-grapheneos-attestation/");
    expect(rumourIsTheExploit?.html).toContain(
      `The current release attests ${attestation.operationCount} operations across ${attestation.adapterCount} bundled public adapters.`,
    );
    expect(rumourIsTheExploit?.html).toContain(
      `${attestation.observedCount} are <code>observed</code>. ${attestation.captureRequiredCount} remain <code>capture-required</code>.`,
    );
    expect(rumourIsTheExploit?.html).toContain("Telegram is absent from those manifests");
    expect(rumourIsTheExploit?.html).toContain("does not reconstruct exploits");
    expect(rumourIsTheExploit?.html).toContain("does not reprint the essay");
    expect(rumourIsTheExploit?.html).toContain("The pages do not reprint one another.");
    expect(rumourIsTheExploit?.html).toContain("https://ghostget.com/omarchy-root-escalation/");
    expect(rumourIsTheExploit?.html).not.toContain("{{PROVIDER_CAPABILITY");
    expect(rumourIsTheExploit?.html).not.toContain("stripedex.com");
    expect(rumourIsTheExploit?.html).not.toContain("spongeresearch.com");
    expect(rumourIsTheExploit?.html).not.toMatch(/percent-encod|proof.of.concept|PoC|payload|exploit step/iu);

    const omarchyRootEscalation = pages.find((page) =>
      page.definition.canonicalPath === "/omarchy-root-escalation/");
    expect(omarchyRootEscalation?.html).toContain(
      "<h1>A root-capable desktop is not a named web operation.</h1>",
    );
    expect(omarchyRootEscalation?.html).toContain("News take");
    expect(omarchyRootEscalation?.html).toContain("https://0xcc.io/posts/omarchy-root-creds/");
    expect(omarchyRootEscalation?.html).toContain("Omarchy: Any User Process Can Escalate to Root");
    expect(omarchyRootEscalation?.html).toContain("https://rough.day");
    expect(omarchyRootEscalation?.html).toContain("https://rough.day/info");
    expect(omarchyRootEscalation?.html).toContain("Sunday 30 August 2026");
    expect(omarchyRootEscalation?.html).toContain(
      "Omarchy desktop environment allows any user process to escalate to root",
    );
    expect(omarchyRootEscalation?.html).toContain("https://hraness.com");
    expect(omarchyRootEscalation?.html).toContain("https://ghostget.com/");
    expect(omarchyRootEscalation?.html).toContain("https://ghostget.com/docs/reference/provider-capabilities/");
    expect(omarchyRootEscalation?.html).toContain("https://ghostget.com/vms-cannot-contain-agents/");
    expect(omarchyRootEscalation?.html).toContain("https://ghostget.com/paypal-grapheneos-attestation/");
    expect(omarchyRootEscalation?.html).toContain("https://ghostget.com/rumour-is-the-exploit/");
    expect(omarchyRootEscalation?.html).toContain(
      `The current release attests ${attestation.operationCount} operations across ${attestation.adapterCount} bundled public adapters.`,
    );
    expect(omarchyRootEscalation?.html).toContain(
      `${attestation.observedCount} are <code>observed</code>. ${attestation.captureRequiredCount} remain <code>capture-required</code>.`,
    );
    expect(omarchyRootEscalation?.html).toContain("Telegram is absent from those manifests");
    expect(omarchyRootEscalation?.html).toContain("does not decide which desktop processes may become root");
    expect(omarchyRootEscalation?.html).toContain("does not reprint the post");
    expect(omarchyRootEscalation?.html).toContain("The pages do not reprint one another.");
    expect(omarchyRootEscalation?.html).not.toContain("{{PROVIDER_CAPABILITY");
    expect(omarchyRootEscalation?.html).not.toContain("stripedex.com");
    expect(omarchyRootEscalation?.html).not.toContain("spongeresearch.com");
    expect(omarchyRootEscalation?.html).not.toMatch(
      /percent-encod|proof.of.concept|PoC|payload|exploit step|docker\.sock|\/etc\/shadow/iu,
    );
    const docsIndex = pages.find((page) =>
      page.definition.canonicalPath === "/docs/");
    expect(docsIndex?.html).toContain(
      "<h1>Ghostget documentation</h1>",
    );
    for (const quadrant of ["Tutorials", "How-to guides", "Explanation", "Reference"]) {
      expect(docsIndex?.html).toContain(`<h2 id="${quadrant === "How-to guides" ? "how-to" : quadrant.toLowerCase()}">${quadrant}</h2>`);
    }
    for (const movedPath of [
      "/docs/tutorials/getting-started/",
      "/docs/how-to/capture-and-archive/",
      "/docs/how-to/connect-beeper/",
      "/docs/how-to/export-whatsapp/",
      "/docs/how-to/author-provider-plugin/",
      "/docs/explanation/security-model/",
      "/docs/reference/provider-capabilities/",
    ]) {
      const moved = pages.find((page) => page.definition.canonicalPath === movedPath);
      expect(moved).toBeDefined();
      expect(moved?.html).toContain('aria-label="Breadcrumb"');
      expect(moved?.html).toContain('href="/docs/"');
      expect(moved?.html).toContain(`<link rel="canonical" href="${SITE_ORIGIN}${movedPath}">`);
      const movedJson = /<script type="application\/ld\+json">([^<]+)<\/script>/u
        .exec(moved?.html ?? "");
      const movedGraph = JSON.parse(movedJson?.[1] ?? "null") as {
        "@graph"?: ReadonlyArray<Readonly<Record<string, unknown>>>;
      };
      const movedBreadcrumb = movedGraph["@graph"]?.find((node) =>
        node["@id"] === `${SITE_ORIGIN}${movedPath}#breadcrumb`) as
        { itemListElement?: ReadonlyArray<Readonly<Record<string, unknown>>> } | undefined;
      expect(movedBreadcrumb?.itemListElement).toHaveLength(3);
      expect(movedBreadcrumb?.itemListElement?.slice(0, 2)).toEqual([
        { "@type": "ListItem", item: `${SITE_ORIGIN}/`, name: "Ghostget", position: 1 },
        { "@type": "ListItem", item: `${SITE_ORIGIN}/docs/`, name: "Documentation", position: 2 },
      ]);
      expect(movedBreadcrumb?.itemListElement?.[2]).toMatchObject({
        item: `${SITE_ORIGIN}${movedPath}`,
        position: 3,
      });
      const movedMarkdown = await readFile(
        join(websiteRoot, "dist", markdownSiblingPath(movedPath).slice(1)),
        "utf8",
      );
      expect(movedMarkdown.length).toBeGreaterThan(400);
    }
    for (const [source, destination] of [
      ["/getting-started", "/docs/tutorials/getting-started/"],
      ["/getting-started/", "/docs/tutorials/getting-started/"],
      ["/getting-started/index.html", "/docs/tutorials/getting-started/"],
      ["/getting-started/:path*", "/docs/tutorials/getting-started/:path*"],
      ["/capture-and-archives", "/docs/how-to/capture-and-archive/"],
      ["/capture-and-archives/", "/docs/how-to/capture-and-archive/"],
      ["/capture-and-archives/:path*", "/docs/how-to/capture-and-archive/:path*"],
      ["/provider-capabilities", "/docs/reference/provider-capabilities/"],
      ["/provider-capabilities/", "/docs/reference/provider-capabilities/"],
      ["/provider-capabilities/:path*", "/docs/reference/provider-capabilities/:path*"],
      ["/providers/beeper", "/docs/how-to/connect-beeper/"],
      ["/providers/beeper/", "/docs/how-to/connect-beeper/"],
      ["/providers/beeper/:path*", "/docs/how-to/connect-beeper/:path*"],
      ["/providers/whatsapp", "/docs/how-to/export-whatsapp/"],
      ["/providers/whatsapp/", "/docs/how-to/export-whatsapp/"],
      ["/providers/whatsapp/:path*", "/docs/how-to/export-whatsapp/:path*"],
      ["/security", "/docs/explanation/security-model/"],
      ["/security/", "/docs/explanation/security-model/"],
      ["/security/:path*", "/docs/explanation/security-model/:path*"],
      ["/plugins", "/docs/how-to/author-provider-plugin/"],
      ["/plugins/", "/docs/how-to/author-provider-plugin/"],
      ["/plugins/:path*", "/docs/how-to/author-provider-plugin/:path*"],
      ["/getting-started.md", "/docs/tutorials/getting-started.md"],
      ["/security.md", "/docs/explanation/security-model.md"],
    ] as const) {
      expect(vercel.redirects).toEqual(expect.arrayContaining([
        { destination, permanent: true, source },
      ]));
    }

    const compareIndex = pages.find((page) =>
      page.definition.canonicalPath === "/compare/");
    expect(compareIndex?.html).toContain(
      "<h1>Four ways agents reach the web, and where Ghostget fits</h1>",
    );
    for (const comparePath of [
      "/compare/browser-use/",
      "/compare/browserbase/",
      "/compare/playwright-mcp/",
      "/compare/agent-browser/",
    ]) {
      const comparison = pages.find((page) =>
        page.definition.canonicalPath === comparePath);
      expect(comparison).toBeDefined();
      expect(compareIndex?.html).toContain(`href="${comparePath}"`);
      expect(comparison?.html).toContain(
        `<link rel="canonical" href="${SITE_ORIGIN}${comparePath}">`,
      );
      expect(comparison?.html).toContain('href="/compare/"');
      expect(comparison?.html).toContain(
        '<meta property="og:image" content="https://ghostget.com/og.png">',
      );
      expect(comparison?.html.match(/<meta name="twitter:image"/gu)).toHaveLength(1);
      const compareJson = /<script type="application\/ld\+json">([^<]+)<\/script>/u
        .exec(comparison?.html ?? "");
      const compareGraph = JSON.parse(compareJson?.[1] ?? "null") as {
        "@graph"?: ReadonlyArray<Readonly<Record<string, unknown>>>;
      };
      const compareBreadcrumb = compareGraph["@graph"]?.find((node) =>
        node["@id"] === `${SITE_ORIGIN}${comparePath}#breadcrumb`) as
        { itemListElement?: ReadonlyArray<Readonly<Record<string, unknown>>> } | undefined;
      expect(compareBreadcrumb?.itemListElement).toHaveLength(3);
      expect(compareBreadcrumb?.itemListElement?.slice(0, 2)).toEqual([
        { "@type": "ListItem", item: `${SITE_ORIGIN}/`, name: "Ghostget", position: 1 },
        { "@type": "ListItem", item: `${SITE_ORIGIN}/compare/`, name: "Comparisons", position: 2 },
      ]);
      expect(compareBreadcrumb?.itemListElement?.[2]).toMatchObject({
        item: `${SITE_ORIGIN}${comparePath}`,
        position: 3,
      });
      const comparisonMarkdown = await readFile(
        join(websiteRoot, "dist", markdownSiblingPath(comparePath).slice(1)),
        "utf8",
      );
      expect(comparisonMarkdown.length).toBeGreaterThan(400);
    }
    const agentBrowser = pages.find((page) =>
      page.definition.canonicalPath === "/compare/agent-browser/");
    expect(agentBrowser?.html).toContain("agent-browser");
    expect(agentBrowser?.html).toContain("0.32.3");
    expect(agentBrowser?.html).toContain("the agent can never steer");
    const browserUsePage = pages.find((page) =>
      page.definition.canonicalPath === "/compare/browser-use/");
    expect(browserUsePage?.html).toContain("model-driven");
    const playwrightMcpPage = pages.find((page) =>
      page.definition.canonicalPath === "/compare/playwright-mcp/");
    expect(playwrightMcpPage?.html).toContain("accessibility tree");
    const browserbasePage = pages.find((page) =>
      page.definition.canonicalPath === "/compare/browserbase/");
    expect(browserbasePage?.html).toContain("Stagehand");

    expect(html).toContain('id="measured"');
    expect(html).toContain("145,617 bytes");
    expect(html).toContain("9.7×");
    expect(html).toContain('id="boundary"');
    expect(html).toContain("Your agent never steers a browser.");
    expect(html).toContain("ghostget vault import-x");
    expect(html).toContain('href="/compare/"');

    const software = (graph as ReadonlyArray<Readonly<Record<string, unknown>>>).find((node) =>
      node["@id"] === `${SITE_ORIGIN}/#software`);
    expect(software).toMatchObject({
      "@type": "SoftwareApplication",
      featureList: [
        "Save web pages as Markdown",
        "Archive one media item with SHA-256 verification",
        "Encrypted local copies of account reads",
        "Named actions in connected services",
        "Beeper actions through a pinned official CLI",
        "Actions stop when a service changes",
      ],
      softwareVersion: packageIdentity.version,
    });

    const files = new Map<string, string>();
    for (const page of PUBLIC_PAGES) {
      files.set(
        markdownSiblingPath(page.canonicalPath),
        await readFile(join(websiteRoot, "dist", markdownSiblingPath(page.canonicalPath).slice(1)), "utf8"),
      );
    }
    files.set("/404.md", notFoundMarkdown);
    const retrieve = async (url: URL): Promise<Response> => {
      const body = files.get(url.pathname);
      return body === undefined
        ? new Response("missing", { status: 404 })
        : new Response(body, { status: 200 });
    };
    const negotiated = await handleDocumentNegotiation(
      new Request(`${SITE_ORIGIN}/docs/tutorials/getting-started/`, { headers: { Accept: "text/markdown" } }),
      retrieve,
    );
    expect(negotiated?.status).toBe(200);
    expect(negotiated?.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(negotiated?.headers.get("vary")).toBe("Accept");
    expect(negotiated?.headers.get("link")).toBe(
      '<https://ghostget.com/docs/tutorials/getting-started/>; rel="canonical", </docs/tutorials/getting-started.md>; rel="alternate"; type="text/markdown"',
    );
    expect(await negotiated?.text()).toContain("# Install Ghostget and read your first page");

    const direct = await handleDocumentNegotiation(
      new Request(`${SITE_ORIGIN}/docs/tutorials/getting-started.md`),
      retrieve,
    );
    expect(direct?.status).toBe(200);
    expect(direct?.headers.get("link")).toBe(negotiated?.headers.get("link"));
    expect(await direct?.text()).toContain("# Install Ghostget and read your first page");
  });

  test("keeps every README release reference aligned with package identity", async () => {
    const [manifest, readme, attestation] = await Promise.all([
      Bun.file(join(repositoryRoot, "package.json")).json(),
      readFile(join(repositoryRoot, "README.md"), "utf8"),
      loadProviderCapabilityAttestation(repositoryRoot),
    ]);
    const identity = parsePackageIdentity(manifest);
    const catalogServiceCount = new Set(attestation.rows.map((row) => row.surfaceId)).size;
    const executableServiceCount = createProviderDirectory(attestation).providerCount;
    const referencedReleases = [...readme.matchAll(/\bv[0-9]+\.[0-9]+\.[0-9]+\b/gu)]
      .map((match) => match[0]);
    expect(referencedReleases.length).toBeGreaterThan(0);
    expect(new Set(referencedReleases)).toEqual(new Set([identity.release]));
    expect(catalogServiceCount).toBe(22);
    expect(executableServiceCount).toBe(21);
    expect(readme).toContain(
      `This ${identity.release} source tree supports executable actions for ${String(executableServiceCount)} services:`,
    );
    expect(readme).not.toContain(
      `This ${identity.release} source tree defines actions for ${String(executableServiceCount)} services:`,
    );
    expect(readme).toContain(
      "[built-in Beeper Desktop MCP server](https://developers.beeper.com/desktop-api/mcp/)",
    );
    expect(readme).not.toContain("https://github.com/beeper/desktop-api-mcp");
  });

  test("ships a correctly sized original social card", async () => {
    const image = new Uint8Array(await Bun.file(join(websiteRoot, "public/og.png")).arrayBuffer());
    expect(Array.from(image.slice(1, 4))).toEqual([80, 78, 71]);
    const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(630);
  });
});
