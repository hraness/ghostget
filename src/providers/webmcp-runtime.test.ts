import { describe, expect, test } from "bun:test";

import type { PinnedHttpsFetch } from "../pinned-https";
import {
  executeWebmcpPublicOperation,
  WEBMCP_PUBLIC_USER_AGENT,
} from "./webmcp-runtime";

const recipe = {
  site: "webmcp",
  action: "sites.search",
  contractVersion: 1,
  timeoutMs: 30_000,
  maxOutputBytes: 4 * 1024 * 1024,
} as const;

const callRecipe = {
  site: "webmcp",
  action: "tools.call",
  contractVersion: 1,
  timeoutMs: 45_000,
  maxOutputBytes: 4 * 1024 * 1024,
} as const;

const getRecipe = {
  site: "webmcp",
  action: "sites.get",
  contractVersion: 1,
  timeoutMs: 30_000,
  maxOutputBytes: 4 * 1024 * 1024,
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const siteSummary = {
  domain: "zapier.com",
  name: "Zapier",
  description: "Automation platform.",
  status: "live",
  toolCount: 10,
  popularityRank: 2957,
  tags: ["yc"],
  listedAt: "2026-09-21T19:51:12.332Z",
  checkedAt: "2026-09-23T06:04:50.006Z",
  url: "https://wmcp.ai/sites/zapier.com",
  apiUrl: "https://wmcp.ai/api/v1/sites/zapier.com",
};

describe("webmcp public runtime", () => {
  test("GETs the reviewed registry search endpoint with the honest user agent", async () => {
    const seen: { url: string; init: RequestInit; timeoutMs: number }[] = [];
    const fetch: PinnedHttpsFetch = (url, init, timeoutMs) => {
      seen.push({ url: url.href, init, timeoutMs });
      return Promise.resolve(jsonResponse({
        sites: [siteSummary],
        nextCursor: "Mw",
      }));
    };
    const result = await executeWebmcpPublicOperation(
      recipe,
      { query: "automation", tag: "yc", limit: 5 },
      { fetch },
      undefined,
    );
    expect(seen).toHaveLength(1);
    const [request] = seen;
    expect(request?.url.startsWith("https://www.wmcp.ai/api/v1/sites?")).toBe(true);
    expect(request?.url).toContain("q=automation");
    expect(request?.url).toContain("tag=yc");
    expect(request?.url).toContain("limit=5");
    expect(request?.init).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: {
        accept: "application/json",
        "user-agent": WEBMCP_PUBLIC_USER_AGENT,
      },
    });
    expect(request?.timeoutMs).toBe(30_000);
    expect(result).toMatchObject({
      status: "succeeded",
      dispatchStarted: false,
      output: {
        nextCursor: "Mw",
        sites: [{ domain: "zapier.com", toolCount: 10 }],
      },
    });
  });

  test("fails closed on unreviewed registry responses", async () => {
    for (const response of [
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      jsonResponse({ sites: "nope", nextCursor: null }),
      jsonResponse({ error: { code: "x", message: "y" } }, 502),
      jsonResponse({}, 429),
    ]) {
      const fetch: PinnedHttpsFetch = () => Promise.resolve(response);
      const result = await executeWebmcpPublicOperation(
        recipe,
        {},
        { fetch },
        undefined,
      );
      expect(result.status).toBe("failed");
      expect(result.readFailure?.category).toBeDefined();
    }
  });

  test("maps an unlisted registry domain to target-unavailable", async () => {
    const fetch: PinnedHttpsFetch = (url) => {
      expect(url.pathname).toBe("/api/v1/sites/unknown.example");
      return Promise.resolve(jsonResponse(
        { error: { code: "not_found", message: "not in the registry." } },
        404,
      ));
    };
    const result = await executeWebmcpPublicOperation(
      getRecipe,
      { domain: "unknown.example" },
      { fetch },
      undefined,
    );
    expect(result.status).toBe("failed");
    expect(result.readFailure?.category).toBe("target-unavailable");
  });

  test("POSTs the fixed JSON-RPC envelope and projects untrusted tool content", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetch: PinnedHttpsFetch = (url, init) => {
      seen.push({ url: url.href, init });
      const envelope = JSON.parse(String(init.body)) as {
        method: string;
        params: { arguments: { domain: string } };
      };
      expect(envelope.method).toBe("tools/call");
      expect(envelope.params.arguments.domain).toBe("ngrok.com");
      const sse = `event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [{ type: "text", text: "doc contents" }],
          isError: false,
        },
      })}\n\n`;
      return Promise.resolve(new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }));
    };
    const result = await executeWebmcpPublicOperation(
      callRecipe,
      { domain: "ngrok.com", tool: "get_docs_page", input: "{\"slug\":\"intro\"}" },
      { fetch },
      undefined,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://www.wmcp.ai/mcp");
    expect(seen[0]?.init.method).toBe("POST");
    expect((seen[0]?.init.headers as Record<string, string>)["content-type"])
      .toBe("application/json");
    expect(result).toMatchObject({
      status: "succeeded",
      output: {
        domain: "ngrok.com",
        tool: "get_docs_page",
        isError: false,
        content: ["doc contents"],
        trust: "untrusted-site-content",
      },
    });
  });

  test("rejects an MCP response that is not event-stream or JSON", async () => {
    const fetch: PinnedHttpsFetch = () => Promise.resolve(new Response("ok", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }));
    const result = await executeWebmcpPublicOperation(
      callRecipe,
      { domain: "ngrok.com", tool: "get_docs_page" },
      { fetch },
      undefined,
    );
    expect(result.status).toBe("failed");
  });

  test("fails closed on malformed input before any request", async () => {
    let called = false;
    const fetch: PinnedHttpsFetch = () => {
      called = true;
      return Promise.resolve(jsonResponse({}));
    };
    const result = await executeWebmcpPublicOperation(
      getRecipe,
      { domain: "not a domain" },
      { fetch },
      undefined,
    );
    expect(called).toBe(false);
    expect(result.status).toBe("failed");
    await expect(executeWebmcpPublicOperation(
      { ...getRecipe, site: "elsewhere" },
      { domain: "zapier.com" },
      { fetch },
      undefined,
    )).rejects.toThrow("public contract is not installed");
    expect(called).toBe(false);
  });
});
