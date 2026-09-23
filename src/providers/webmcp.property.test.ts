import { expect, test } from "bun:test";

import { assertProperty, fc } from "../test-support";
import {
  parseWebmcpDomain,
  parseWebmcpSitesGetResponse,
  parseWebmcpSitesSearchResponse,
  parseWebmcpToolName,
  parseWebmcpToolsCallResponse,
  WEBMCP_MAX_DOMAIN_LENGTH,
  WEBMCP_MAX_PROJECTED_CONTENT_ITEMS,
  WEBMCP_MAX_PROJECTED_SITES,
  WEBMCP_MAX_PROJECTED_TOOLS,
  WEBMCP_MAX_TOOL_NAME_LENGTH,
} from "./webmcp";

const isoTimestamp: fc.Arbitrary<string> = fc.integer({
  min: 0,
  max: 86_400_000 * 400,
}).map((offset) =>
  new Date(Date.parse("2026-01-01T00:00:00.000Z") + offset).toISOString());

const hostnameLabel = fc.stringMatching(/^[a-z0-9](?:[a-z0-9-]{0,10}[a-z0-9])?$/);
const domainArbitrary: fc.Arbitrary<string> = fc.tuple(
  fc.array(hostnameLabel, { minLength: 1, maxLength: 4 }),
  fc.stringMatching(/^[a-z]{2,10}$/),
).map(([labels, tld]) => `${labels.join(".")}.${tld}`);

const toolNameArbitrary: fc.Arbitrary<string> = fc.stringMatching(
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,40}$/,
);

const jsonScalar: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.boolean(),
  fc.integer({ min: -1_000_000, max: 1_000_000 }),
  fc.string({ maxLength: 40 }),
);

const annotationsArbitrary = fc.option(
  fc.dictionary(fc.string({ maxLength: 20 }), jsonScalar, { maxKeys: 4 }),
  { nil: null },
);

const registryToolArbitrary: fc.Arbitrary<unknown> = fc.record({
  name: toolNameArbitrary,
  title: fc.option(fc.string({ maxLength: 60 }), { nil: null }),
  description: fc.string({ maxLength: 200 }),
  inputSchema: fc.dictionary(fc.string({ maxLength: 12 }), jsonScalar, {
    maxKeys: 5,
  }),
  annotations: annotationsArbitrary,
  surface: fc.constantFrom("navigator", "document", "form"),
  pageUrl: fc.webUrl(),
  firstSeenAt: isoTimestamp,
  lastSeenAt: isoTimestamp,
});

const listedSiteArbitrary: fc.Arbitrary<unknown> = fc.record({
  domain: domainArbitrary,
  name: fc.string({ maxLength: 100 }),
  description: fc.string({ maxLength: 300 }),
  homepageUrl: fc.webUrl(),
  listed: fc.constant(true),
  status: fc.constantFrom("live", "unreachable"),
  popularityRank: fc.option(
    fc.integer({ min: 1, max: 50_000_000 }),
    { nil: null },
  ),
  tags: fc.array(fc.string({ maxLength: 20 }), { maxLength: 8 }),
  listedAt: isoTimestamp,
  checkedAt: isoTimestamp,
  lastSeenLiveAt: fc.option(isoTimestamp, { nil: null }),
  url: fc.webUrl(),
  tools: fc.array(registryToolArbitrary, { maxLength: 6 }),
});

const unlistedSiteArbitrary: fc.Arbitrary<unknown> = fc.record({
  domain: domainArbitrary,
  name: fc.constant(null),
  listed: fc.constant(false),
  status: fc.constant("no_tools"),
  statusText: fc.string({ maxLength: 100 }),
  popularityRank: fc.option(
    fc.integer({ min: 1, max: 50_000_000 }),
    { nil: null },
  ),
  tags: fc.array(fc.string({ maxLength: 20 }), { maxLength: 4 }),
  checkedAt: isoTimestamp,
  url: fc.webUrl(),
  tools: fc.constant([]),
});

const siteSummaryArbitrary: fc.Arbitrary<unknown> = fc.record({
  domain: domainArbitrary,
  name: fc.string({ maxLength: 100 }),
  description: fc.string({ maxLength: 300 }),
  status: fc.constantFrom("live", "unreachable"),
  toolCount: fc.integer({ min: 0, max: 500 }),
  popularityRank: fc.option(
    fc.integer({ min: 1, max: 50_000_000 }),
    { nil: null },
  ),
  tags: fc.array(fc.string({ maxLength: 20 }), { maxLength: 8 }),
  listedAt: isoTimestamp,
  checkedAt: isoTimestamp,
  url: fc.webUrl(),
  apiUrl: fc.webUrl(),
});

const toolsCallRequest = Object.freeze({
  domain: "ngrok.com",
  tool: "get_docs_page",
  input: Object.freeze({}),
});

test("domain and tool-name validators are total and round-trip honest values", () => {
  assertProperty(fc.property(
    fc.oneof(domainArbitrary, fc.string({ maxLength: 80 }), jsonScalar),
    (value) => {
      try {
        const parsed = parseWebmcpDomain(value);
        expect(typeof parsed).toBe("string");
        expect(parsed.length).toBeLessThanOrEqual(WEBMCP_MAX_DOMAIN_LENGTH);
        expect(parsed).not.toContain("/");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    },
  ));
  assertProperty(fc.property(
    fc.oneof(toolNameArbitrary, fc.string({ maxLength: 80 }), jsonScalar),
    (value) => {
      try {
        const parsed = parseWebmcpToolName(value);
        expect(typeof parsed).toBe("string");
        expect(parsed.length).toBeLessThanOrEqual(WEBMCP_MAX_TOOL_NAME_LENGTH);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    },
  ));
  assertProperty(fc.property(domainArbitrary, (domain) => {
    expect(parseWebmcpDomain(domain)).toBe(domain);
  }));
  assertProperty(fc.property(toolNameArbitrary, (name) => {
    expect(parseWebmcpToolName(name)).toBe(name);
  }));
});

test("every generated listed or unlisted site parses canonically", () => {
  assertProperty(fc.property(
    fc.oneof(listedSiteArbitrary, unlistedSiteArbitrary),
    (site) => {
      const parsed = parseWebmcpSitesGetResponse(site);
      expect(parsed.tools.length)
        .toBeLessThanOrEqual(WEBMCP_MAX_PROJECTED_TOOLS);
      expect(parsed.domain).toContain(".");
      if (parsed.listed) {
        expect(["live", "unreachable"]).toContain(parsed.status);
      } else {
        expect(parsed.status).toBe("no_tools");
      }
    },
  ));
});

test("every generated search page parses within projection bounds", () => {
  assertProperty(fc.property(
    fc.array(siteSummaryArbitrary, { maxLength: 12 }),
    fc.option(fc.string({ maxLength: 40 }), { nil: null }),
    (sites, nextCursor) => {
      const parsed = parseWebmcpSitesSearchResponse({ sites, nextCursor });
      expect(parsed.sites.length).toBeLessThanOrEqual(WEBMCP_MAX_PROJECTED_SITES);
      expect(parsed.sites.length).toBe(sites.length);
      expect(parsed.nextCursor).toBe(nextCursor);
    },
  ));
});

test("arbitrary foreign JSON either rejects or stays within projection bounds", () => {
  assertProperty(fc.property(fc.jsonValue(), (value) => {
    try {
      const site = parseWebmcpSitesGetResponse(value);
      expect(site.tools.length)
        .toBeLessThanOrEqual(WEBMCP_MAX_PROJECTED_TOOLS);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
    try {
      const page = parseWebmcpSitesSearchResponse(value);
      expect(page.sites.length).toBeLessThanOrEqual(WEBMCP_MAX_PROJECTED_SITES);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  }));
});

test("MCP content items stay within the reviewed projection cap", () => {
  assertProperty(fc.property(
    fc.integer({ min: 0, max: WEBMCP_MAX_PROJECTED_CONTENT_ITEMS + 4 }),
    (count) => {
      const content = Array.from(
        { length: count },
        (_, index) => ({ type: "text", text: `item ${index}` }),
      );
      const body = `event: message\ndata: ${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { content, isError: false },
      })}`;
      try {
        const result = parseWebmcpToolsCallResponse(body, toolsCallRequest);
        expect(result.content.length)
          .toBeLessThanOrEqual(WEBMCP_MAX_PROJECTED_CONTENT_ITEMS);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(count).toBeGreaterThan(WEBMCP_MAX_PROJECTED_CONTENT_ITEMS);
      }
    },
  ));
});
