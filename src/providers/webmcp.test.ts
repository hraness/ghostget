import { describe, expect, test } from "bun:test";

import {
  parseWebmcpDomain,
  parseWebmcpSitesGetInput,
  parseWebmcpSitesGetResponse,
  parseWebmcpSitesSearchInput,
  parseWebmcpSitesSearchResponse,
  parseWebmcpToolName,
  parseWebmcpToolsCallInput,
  parseWebmcpToolsCallResponse,
  webmcpMcpCallBody,
  webmcpSitesGetUrl,
  webmcpSitesSearchUrl,
} from "./webmcp";

const listedTool = Object.freeze({
  name: "search",
  title: "Search docs",
  description: "Search the documentation.",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
  annotations: { readOnlyHint: true },
  surface: "navigator",
  pageUrl: "https://developers.cloudflare.com/",
  firstSeenAt: "2026-09-21T21:34:40.583Z",
  lastSeenAt: "2026-09-21T21:34:40.583Z",
});

const listedSite = Object.freeze({
  domain: "developers.cloudflare.com",
  name: "Cloudflare Docs",
  description: "Developer documentation.",
  homepageUrl: "https://developers.cloudflare.com/",
  listed: true,
  status: "live",
  popularityRank: 150,
  tags: ["devtools"],
  listedAt: "2026-09-21T21:34:40.583Z",
  checkedAt: "2026-09-23T06:04:50.006Z",
  lastSeenLiveAt: "2026-09-21T22:24:59.108Z",
  url: "https://wmcp.ai/sites/developers.cloudflare.com",
  tools: [listedTool],
});

const siteSummary = Object.freeze({
  domain: "zapier.com",
  name: "Zapier",
  description: "Automation platform.",
  status: "live",
  toolCount: 10,
  popularityRank: 2957,
  tags: ["yc", "saas"],
  listedAt: "2026-09-21T19:51:12.332Z",
  checkedAt: "2026-09-23T06:04:50.006Z",
  url: "https://wmcp.ai/sites/zapier.com",
  apiUrl: "https://wmcp.ai/api/v1/sites/zapier.com",
});

describe("webmcp input parsing", () => {
  test("applies documented defaults to sites.search input", () => {
    expect(parseWebmcpSitesSearchInput({})).toEqual({
      query: "",
      tag: null,
      sort: "popular",
      limit: 20,
      cursor: null,
    });
    expect(parseWebmcpSitesSearchInput({
      query: "flights",
      tag: "yc",
      sort: "tools",
      limit: 5,
      cursor: "Mw",
    })).toEqual({
      query: "flights",
      tag: "yc",
      sort: "tools",
      limit: 5,
      cursor: "Mw",
    });
  });

  test("rejects malformed sites.search input", () => {
    expect(() => parseWebmcpSitesSearchInput({ unknown: 1 }))
      .toThrow("unsupported key");
    expect(() => parseWebmcpSitesSearchInput({ tag: "not-a-tag" }))
      .toThrow("tag is malformed");
    expect(() => parseWebmcpSitesSearchInput({ sort: "random" }))
      .toThrow("sort is malformed");
    expect(() => parseWebmcpSitesSearchInput({ limit: 0 }))
      .toThrow("limit is malformed");
    expect(() => parseWebmcpSitesSearchInput({ limit: 101 }))
      .toThrow("limit is malformed");
    expect(() => parseWebmcpSitesSearchInput({ limit: 1.5 }))
      .toThrow("limit is malformed");
  });

  test("parses and bounds sites.get and tools.call inputs", () => {
    expect(parseWebmcpSitesGetInput({ domain: "zapier.com" }))
      .toBe("zapier.com");
    expect(() => parseWebmcpSitesGetInput({ domain: "Zapier.com" }))
      .toThrow("dotted hostname");
    expect(() => parseWebmcpSitesGetInput({ domain: "localhost" }))
      .toThrow("dotted hostname");
    expect(() => parseWebmcpSitesGetInput({ domain: "https://zapier.com" }))
      .toThrow("dotted hostname");
    expect(() => parseWebmcpSitesGetInput({ domain: "zapier.com", extra: 1 }))
      .toThrow("unsupported key");

    expect(parseWebmcpToolsCallInput({
      domain: "ngrok.com",
      tool: "get_docs_page",
    })).toEqual({ domain: "ngrok.com", tool: "get_docs_page", input: {} });
    expect(parseWebmcpToolsCallInput({
      domain: "ngrok.com",
      tool: "get_docs_page",
      input: "{\"slug\":\"intro\"}",
    }).input).toEqual({ slug: "intro" });
    expect(() => parseWebmcpToolsCallInput({
      domain: "ngrok.com",
      tool: "get_docs_page",
      input: "[1,2]",
    })).toThrow("JSON object literal");
    expect(() => parseWebmcpToolsCallInput({
      domain: "ngrok.com",
      tool: "get_docs_page",
      input: "{invalid",
    })).toThrow("JSON object literal");
    expect(() => parseWebmcpToolsCallInput({
      domain: "ngrok.com",
      tool: "bad name!",
    })).toThrow("tool name");
  });

  test("validates public hostnames and tool names exactly", () => {
    expect(parseWebmcpDomain("webmcp.flightsweeper.com"))
      .toBe("webmcp.flightsweeper.com");
    expect(() => parseWebmcpDomain("")).toThrow("public dotted hostname");
    expect(() => parseWebmcpDomain("example.com:443")).toThrow("dotted hostname");
    expect(() => parseWebmcpDomain("ex_ample.com")).toThrow("dotted hostname");
    expect(parseWebmcpToolName("vercel.open_documentation"))
      .toBe("vercel.open_documentation");
    expect(() => parseWebmcpToolName(" spaceship")).toThrow("tool name");
  });

  test("builds reviewed URLs", () => {
    expect(webmcpSitesGetUrl("zapier.com").href)
      .toBe("https://www.wmcp.ai/api/v1/sites/zapier.com");
    const search = webmcpSitesSearchUrl({
      query: "a b",
      tag: "yc",
      sort: "newest",
      limit: 7,
      cursor: "Mw",
    });
    expect(search.origin).toBe("https://www.wmcp.ai");
    expect(search.pathname).toBe("/api/v1/sites");
    expect(search.searchParams.get("q")).toBe("a b");
    expect(search.searchParams.get("tag")).toBe("yc");
    expect(search.searchParams.get("sort")).toBe("newest");
    expect(search.searchParams.get("limit")).toBe("7");
    expect(search.searchParams.get("cursor")).toBe("Mw");
    const defaults = webmcpSitesSearchUrl({
      query: "",
      tag: null,
      sort: "popular",
      limit: 20,
      cursor: null,
    });
    expect(defaults.search).toBe("?limit=20");
  });
});

describe("webmcp registry response parsing", () => {
  test("projects one bounded search page", () => {
    const result = parseWebmcpSitesSearchResponse({
      sites: [siteSummary],
      nextCursor: "Mw",
    });
    expect(result.nextCursor).toBe("Mw");
    expect(result.sites).toHaveLength(1);
    expect(result.sites[0]).toMatchObject({
      domain: "zapier.com",
      toolCount: 10,
      tags: ["yc", "saas"],
    });
    expect(parseWebmcpSitesSearchResponse({
      sites: [],
      nextCursor: null,
    }).nextCursor).toBeNull();
  });

  test("rejects malformed or widened search responses", () => {
    expect(() => parseWebmcpSitesSearchResponse(null)).toThrow("malformed");
    expect(() => parseWebmcpSitesSearchResponse({ sites: [], extra: 1 }))
      .toThrow("unsupported keys");
    expect(() => parseWebmcpSitesSearchResponse({
      sites: [{ ...siteSummary, domain: "UPPER.com" }],
      nextCursor: null,
    })).toThrow("dotted hostname");
    expect(() => parseWebmcpSitesSearchResponse({
      sites: [{ ...siteSummary, injected: true }],
      nextCursor: null,
    })).toThrow("unsupported keys");
  });

  test("projects a listed site with its tools", () => {
    const site = parseWebmcpSitesGetResponse(listedSite);
    expect(site.listed).toBe(true);
    if (!site.listed) throw new Error("expected a listed site");
    expect(site.domain).toBe("developers.cloudflare.com");
    expect(site.tools).toHaveLength(1);
    expect(site.tools[0]?.annotations).toEqual({ readOnlyHint: true });
    expect(site.tools[0]?.inputSchema).toEqual(listedTool.inputSchema);
  });

  test("projects an unlisted checked site", () => {
    const site = parseWebmcpSitesGetResponse({
      domain: "example.com",
      name: null,
      listed: false,
      status: "no_tools",
      statusText: "No WebMCP tools yet",
      popularityRank: 172,
      tags: [],
      checkedAt: "2026-09-22T01:50:46.504Z",
      url: "https://wmcp.ai/sites/example.com",
      tools: [],
    });
    expect(site).toMatchObject({
      listed: false,
      domain: "example.com",
      status: "no_tools",
      tools: [],
    });
  });

  test("rejects drift in either sites.get variant", () => {
    expect(() => parseWebmcpSitesGetResponse({ listed: "yes" }))
      .toThrow("malformed");
    expect(() => parseWebmcpSitesGetResponse({
      ...listedSite,
      status: "unknown-state",
    })).toThrow("malformed");
    expect(() => parseWebmcpSitesGetResponse({
      domain: "example.com",
      name: null,
      listed: false,
      status: "live",
      statusText: "x",
      popularityRank: 1,
      tags: [],
      checkedAt: "2026-09-22T01:50:46.504Z",
      url: "https://wmcp.ai/sites/example.com",
      tools: [],
    })).toThrow("malformed");
    expect(() => parseWebmcpSitesGetResponse({
      ...listedSite,
      tools: [{ ...listedTool, inputSchema: 42 }],
    })).toThrow("inputSchema");
    expect(() => parseWebmcpSitesGetResponse({
      ...listedSite,
      tools: [{ ...listedTool, lastSeenAt: "not-a-time" }],
    })).toThrow("malformed");
  });
});

describe("webmcp tools.call envelope", () => {
  const callInput = parseWebmcpToolsCallInput({
    domain: "developers.cloudflare.com",
    tool: "search",
    input: "{\"query\":\"workers\"}",
  });

  test("emits the fixed JSON-RPC call body", () => {
    expect(JSON.parse(webmcpMcpCallBody(callInput))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "call_site_tool",
        arguments: {
          domain: "developers.cloudflare.com",
          tool: "search",
          input: { query: "workers" },
        },
      },
    });
  });

  test("projects the matching SSE message frame as untrusted content", () => {
    const body = [
      "event: message",
      `data: {"jsonrpc":"2.0","id":9,"result":{"content":[{"type":"text","text":"other"}]}}`,
      "",
      "event: message",
      `data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"first"},{"type":"image","data":"xx"},{"type":"text","text":"second"}],"isError":false}}`,
      "",
    ].join("\n");
    expect(parseWebmcpToolsCallResponse(body, callInput)).toEqual({
      domain: "developers.cloudflare.com",
      tool: "search",
      isError: false,
      content: ["first", "second"],
      nonTextItems: 1,
      trust: "untrusted-site-content",
    });
  });

  test("projects registry tool errors as isError content", () => {
    const body = `event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Only tools that declare readOnlyHint can be called."}],"isError":true}}`;
    expect(parseWebmcpToolsCallResponse(body, callInput).isError).toBe(true);
  });

  test("surfaces a JSON-RPC error envelope", () => {
    const body = `event: message\ndata: {"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"not found"}}`;
    expect(() => parseWebmcpToolsCallResponse(body, callInput))
      .toThrow("rejected by the registry: not found");
  });

  test("rejects a stream without a matching frame or with drifted content", () => {
    expect(() => parseWebmcpToolsCallResponse(
      "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{\"content\":[]}}",
      callInput,
    )).toThrow("no matching message frame");
    expect(() => parseWebmcpToolsCallResponse("no frames here", callInput))
      .toThrow("no matching message frame");
    expect(() => parseWebmcpToolsCallResponse(
      `event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text"}]}}`,
      callInput,
    )).toThrow("malformed");
  });
});
