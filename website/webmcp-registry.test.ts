import { describe, expect, test } from "bun:test";

import {
  clipAtWordBoundary,
  countNoun,
  parseWebmcpRegistrySnapshot,
  presentWebmcpToolDescription,
  renderWebmcpIndexList,
  renderWebmcpToolsTable,
  substituteTemplateValues,
  webmcpIndexTemplateValues,
  webmcpProviderPages,
  webmcpSiteCanonicalPath,
  webmcpDisplayName,
  webmcpSiteDescription,
  webmcpSiteHeading,
  webmcpSiteTemplateValues,
  webmcpSiteTitle,
  type WebmcpRegistrySnapshot,
} from "./webmcp-registry";

const tool = (overrides: Partial<{
  name: string;
  description: string;
  readOnly: boolean;
}> = {}) => ({
  description: "Reads documentation.",
  name: "search",
  readOnly: true,
  ...overrides,
});

const site = (overrides: Partial<{
  checkedAt: string;
  description: string;
  domain: string;
  homepageUrl: string;
  name: string;
  readOnlyToolCount: number;
  registryUrl: string;
  tags: readonly string[];
  toolCount: number;
  tools: readonly ReturnType<typeof tool>[];
}> = {}) => ({
  checkedAt: "2026-09-23T00:00:00.000Z",
  description: "Developer documentation.",
  domain: "docs.example.com",
  homepageUrl: "https://docs.example.com/",
  name: "Example Docs",
  readOnlyToolCount: 1,
  registryUrl: "https://wmcp.ai/sites/docs.example.com",
  tags: ["docs"],
  toolCount: 1,
  tools: [tool()],
  ...overrides,
});

const snapshot = (
  sites: readonly ReturnType<typeof site>[] = [site()],
): WebmcpRegistrySnapshot => ({
  registryOrigin: "https://www.wmcp.ai",
  schemaVersion: 1,
  siteCount: sites.length,
  sites,
  syncedAt: "2026-09-23T01:00:00.000Z",
});

describe("webmcp registry snapshot", () => {
  test("parses the checked-in v1 snapshot shape", () => {
    const parsed = parseWebmcpRegistrySnapshot(snapshot([site(), site({
      domain: "sentry.io",
      name: "Sentry",
      readOnlyToolCount: 2,
      toolCount: 4,
      tools: [tool(), tool({ name: "issues", readOnly: true })],
    })]));
    expect(parsed.siteCount).toBe(2);
    expect(parsed.sites[1]?.readOnlyToolCount).toBe(2);
  });

  test("rejects drifted and malformed snapshots", () => {
    const good = snapshot();
    expect(() => parseWebmcpRegistrySnapshot({ ...good, siteCount: 99 }))
      .toThrow("siteCount drifted");
    expect(() => parseWebmcpRegistrySnapshot({ ...good, registryOrigin: "https://evil.example" }))
      .toThrow("reviewed v1 wmcp.ai format");
    expect(() => parseWebmcpRegistrySnapshot({ ...good, extra: true }))
      .toThrow("unsupported keys");
    expect(() => parseWebmcpRegistrySnapshot(snapshot([site({ domain: "UPPER.example" })])))
      .toThrow("domain is malformed");
    expect(() => parseWebmcpRegistrySnapshot(snapshot([site(), site()])))
      .toThrow("repeats docs.example.com");
    expect(() => parseWebmcpRegistrySnapshot(snapshot([
      site({ readOnlyToolCount: 5, toolCount: 2 }),
    ]))).toThrow("tool counts are malformed");
    expect(() => parseWebmcpRegistrySnapshot(snapshot([
      site({ tools: [tool({ name: "bad name!" })] }),
    ]))).toThrow("name is malformed");
    expect(() => parseWebmcpRegistrySnapshot(snapshot([
      site({ homepageUrl: "javascript:alert(1)" }),
    ]))).toThrow("homepageUrl is malformed");
    expect(() => parseWebmcpRegistrySnapshot(snapshot([
      site({ registryUrl: "http://insecure.example" }),
    ]))).toThrow("registryUrl is malformed");
  });

  test("promises use only for sites with a callable tool", () => {
    const uncallable = site({ readOnlyToolCount: 0, tools: [tool({ readOnly: false })] });
    expect(webmcpSiteTitle(site())).toBe("Use Example Docs with your agent through Ghostget");
    expect(webmcpSiteHeading(site())).toBe("Use Example Docs with your agent");
    expect(webmcpSiteTitle(uncallable)).toBe("Example Docs in the WebMCP Registry, read through Ghostget");
    expect(webmcpSiteHeading(uncallable)).toBe("Example Docs in the WebMCP Registry");
    expect(webmcpSiteDescription(site())).toContain("can call 1 read-only tool through");
    expect(webmcpSiteDescription(uncallable)).toContain("None is declared read-only");
    expect(webmcpSiteDescription(uncallable)).not.toMatch(/\btoday\b/u);
    expect(webmcpSiteCanonicalPath("docs.example.com")).toBe("/providers/docs.example.com/");
    expect(() => webmcpSiteCanonicalPath("bad_domain")).toThrow("malformed domain");
  });

  test("builds page descriptors for every site", () => {
    const pages = webmcpProviderPages(snapshot([site(), site({ domain: "sentry.io" })]));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual({
      canonicalPath: "/providers/docs.example.com/",
      description: expect.stringContaining("Example Docs"),
      outputFile: "providers/docs.example.com/index.html",
      sourceFile: "provider-webmcp-site.html",
      title: "Use Example Docs with your agent through Ghostget",
    });
    expect(pages[1]?.canonicalPath).toBe("/providers/sentry.io/");
  });

  test("escapes untrusted site text in template values and tables", () => {
    const hostile = site({
      name: "<script>alert(1)</script>",
      description: '"><img src=x onerror=alert(1)>',
      tools: [tool({ name: "search", description: "b</td><td>injected" })],
    });
    const values = webmcpSiteTemplateValues(hostile);
    const pageTitle = values["{{WEBMCP_PAGE_TITLE}}"];
    expect(pageTitle).not.toContain("<script>");
    const table = renderWebmcpToolsTable(hostile);
    expect(table).not.toContain("b</td><td>injected");
    expect(table).toContain("b&lt;/td&gt;");
    expect(values["{{WEBMCP_CALL_EXAMPLE}}"]).toContain("tools.call");
    expect(values["{{WEBMCP_CALL_EXAMPLE}}"]).toContain("&quot;domain&quot;:&quot;docs.example.com&quot;");
  });

  test("renders a fallback call example when no tool is read-only", () => {
    const values = webmcpSiteTemplateValues(site({
      readOnlyToolCount: 0,
      tools: [tool({ readOnly: false })],
    }));
    expect(values["{{WEBMCP_CALL_EXAMPLE}}"]).toContain("no read-only tools listed");
    expect(values["{{WEBMCP_STATUS_LINE}}"]).toContain("It isn't declared read-only, so <code>tools.call</code> can't invoke it.");
    expect(values["{{WEBMCP_HEADING}}"]).toBe("Example Docs in the WebMCP Registry");
  });

  test("makes every interpolated count agree with its noun for zero, one, and several", () => {
    const readOnly = tool();
    const listed = tool({ name: "listed", readOnly: false });
    const cases = [
      { toolCount: 0, readOnlyToolCount: 0, tools: [] },
      { toolCount: 1, readOnlyToolCount: 1, tools: [readOnly] },
      { toolCount: 13, readOnlyToolCount: 1, tools: [readOnly, listed] },
      { toolCount: 13, readOnlyToolCount: 5, tools: [readOnly, tool({ name: "b" }), tool({ name: "c" }), tool({ name: "d" }), tool({ name: "e" }), listed] },
    ] as const;
    const rendered = cases.map((counts) => {
      const values = webmcpSiteTemplateValues(site(counts));
      return [
        values["{{WEBMCP_TOOL_COUNT_PHRASE}}"],
        values["{{WEBMCP_STATUS_LINE}}"],
        values["{{WEBMCP_TOOLS_SUMMARY}}"],
        webmcpSiteDescription(site(counts)),
      ].join(" | ");
    });
    expect(rendered[0]).toContain("0 WebMCP tools");
    expect(rendered[0]).toContain("No tools are listed yet");
    expect(rendered[1]).toContain("1 WebMCP tool |");
    expect(rendered[1]).toContain("1 of 1 tool declares <code>readOnlyHint</code>");
    expect(rendered[1]).toContain("publishes 1 tool on docs.example.com; 1 declares");
    expect(rendered[2]).toContain("1 of 13 tools declares <code>readOnlyHint</code>");
    expect(rendered[3]).toContain("5 of 13 tools declare <code>readOnlyHint</code>");
    expect(rendered[3]).toContain("publishes 13 tools on docs.example.com; 5 declare");
    expect(rendered[3]).toContain("can call 5 read-only tools through");
    for (const line of rendered) {
      expect(line).not.toMatch(/\b1 (?:WebMCP )?tools\b|\b(?:[02-9]|\d{2,}) (?:WebMCP |read-only )?tool\b/u);
      expect(line).not.toContain("—");
    }
    expect(countNoun(1_802, "site", "sites")).toBe("1,802 sites");
  });

  test("clips third-party text at a word boundary", () => {
    expect(clipAtWordBoundary("short text", 240)).toBe("short text");
    const long = `${"word ".repeat(60)}end`;
    const clipped = clipAtWordBoundary(long, 240);
    expect([...clipped].length).toBeLessThanOrEqual(240);
    expect(clipped.endsWith("word…")).toBe(true);
    const legacyCut = `${"alpha ".repeat(39)}Use this wh`.slice(0, 240);
    expect(legacyCut).toHaveLength(240);
    expect(legacyCut.endsWith("alpha Use th")).toBe(true);
    expect(presentWebmcpToolDescription(legacyCut).endsWith("alpha Use…")).toBe(true);
    expect(presentWebmcpToolDescription("Reads documentation.")).toBe("Reads documentation.");
    const fullSentence = `${"x".repeat(238)}.`;
    expect(presentWebmcpToolDescription(`${fullSentence} `.trimEnd().padEnd(240, "."))).toMatch(/\.$/u);
    const table = renderWebmcpToolsTable(site({ tools: [tool({ description: legacyCut })] }));
    expect(table).not.toContain("Use th<");
    expect(table).toContain("Description from Example Docs");
  });

  test("names a site without its page-title tagline", () => {
    expect(webmcpDisplayName({ name: "Zapier: Automate AI Workflows, Agents, and Apps" })).toBe("Zapier");
    expect(webmcpDisplayName({ name: "Cookiebot - US" })).toBe("Cookiebot");
    expect(webmcpDisplayName({ name: "TEVEO Official Store | Sportbekleidung" })).toBe("TEVEO Official Store");
    expect(webmcpDisplayName({ name: "Example Docs" })).toBe("Example Docs");
    expect(webmcpSiteTitle(site({ name: "Zapier: Automate AI Workflows, Agents, and Apps" })))
      .toBe("Use Zapier with your agent through Ghostget");
  });

  test("renders the provider index totals and table", () => {
    const list = renderWebmcpIndexList(snapshot([site(), site({ domain: "ngrok.com" })]));
    expect(list).toContain('href="/providers/docs.example.com/"');
    expect(list).toContain('href="/providers/ngrok.com/"');
    const values = webmcpIndexTemplateValues(snapshot([
      site(),
      site({ domain: "ngrok.com", readOnlyToolCount: 3, toolCount: 5 }),
    ]));
    expect(values["{{WEBMCP_REGISTRY_SITE_COUNT}}"]).toBe("2");
    expect(values["{{WEBMCP_REGISTRY_TOOL_COUNT}}"]).toBe("6");
    expect(values["{{WEBMCP_REGISTRY_READONLY_TOOL_COUNT}}"]).toBe("4");
    const many = webmcpIndexTemplateValues(snapshot(Array.from({ length: 1_200 }, (_, index) =>
      site({ domain: `site${String(index)}.example.com` }))));
    expect(many["{{WEBMCP_REGISTRY_SITE_COUNT}}"]).toBe("1,200");
    expect(values["{{WEBMCP_SYNCED_AT}}"]).toBe("September 23, 2026");
  });

  test("substitutes every provided placeholder", () => {
    const rendered = substituteTemplateValues(
      "a {{X_ONE}} b {{X_TWO}} c",
      Object.freeze({ "{{X_ONE}}": "1", "{{X_TWO}}": "2" }),
    );
    expect(rendered).toBe("a 1 b 2 c");
  });
});
