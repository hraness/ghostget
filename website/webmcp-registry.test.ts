import { describe, expect, test } from "bun:test";

import {
  parseWebmcpRegistrySnapshot,
  renderWebmcpIndexList,
  renderWebmcpToolsTable,
  substituteTemplateValues,
  webmcpIndexTemplateValues,
  webmcpProviderPages,
  webmcpSiteCanonicalPath,
  webmcpSiteDescription,
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

  test("describes callable and non-callable sites honestly", () => {
    expect(webmcpSiteTitle(site())).toBe("Use Example Docs with your agent through Ghostget");
    expect(webmcpSiteDescription(site())).toContain("1 read-only tool");
    expect(webmcpSiteDescription(site({ readOnlyToolCount: 0, tools: [tool({ readOnly: false })] })))
      .toContain("no read-only-callable tools today");
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
    expect(values["{{WEBMCP_CALL_EXAMPLE}}"]).toContain("no read-only-callable tools");
    expect(values["{{WEBMCP_STATUS_LINE}}"]).toContain("cannot invoke them yet");
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
  });

  test("substitutes every provided placeholder", () => {
    const rendered = substituteTemplateValues(
      "a {{X_ONE}} b {{X_TWO}} c",
      Object.freeze({ "{{X_ONE}}": "1", "{{X_TWO}}": "2" }),
    );
    expect(rendered).toBe("a 1 b 2 c");
  });
});
