/**
 * WebMCP Registry (wmcp.ai) public policy. Ghostget owns the reviewed registry
 * JSON routes, the fixed JSON-RPC tool-call envelope, bounded projections, and
 * domain/tool-name validation. Tool results are untrusted site content and are
 * projected as data only.
 */

import type { WebSessionContract } from "../web-session-contract-definitions";
import type { InputSchema, OperationInput } from "../model";

export const WEBMCP_SITE = "webmcp";
export const WEBMCP_ORIGIN = "https://www.wmcp.ai";
export const WEBMCP_SITES_PATH = "/api/v1/sites";
export const WEBMCP_MCP_PATH = "/mcp";
export const WEBMCP_MAX_SITES_RESPONSE_BYTES = 4 * 1024 * 1024;
export const WEBMCP_MAX_SITE_RESPONSE_BYTES = 4 * 1024 * 1024;
export const WEBMCP_MAX_MCP_RESPONSE_BYTES = 4 * 1024 * 1024;
export const WEBMCP_MAX_SITES_LIMIT = 100;
export const WEBMCP_MAX_PROJECTED_SITES = 100;
export const WEBMCP_MAX_PROJECTED_TOOLS = 200;
export const WEBMCP_MAX_PROJECTED_CONTENT_ITEMS = 50;
export const WEBMCP_MAX_DOMAIN_LENGTH = 253;
export const WEBMCP_MAX_TOOL_NAME_LENGTH = 200;
export const WEBMCP_MAX_TOOL_INPUT_BYTES = 16 * 1024;
export const WEBMCP_MAX_QUERY_LENGTH = 200;
export const WEBMCP_MAX_CURSOR_LENGTH = 256;

export const WEBMCP_OPERATION_NAMES = Object.freeze([
  "sites.search",
  "sites.get",
  "tools.call",
] as const);

export type WebmcpOperationName = (typeof WEBMCP_OPERATION_NAMES)[number];

export const WEBMCP_OPERATIONS = Object.freeze({
  "sites.search": Object.freeze({
    effect: "read" as const,
    risk: "R1" as const,
    state: "observed" as const,
    reason:
      "fixed credential-free registry GET returns one bounded page of WebMCP-listed sites with a provider-owned continuation cursor",
  }),
  "sites.get": Object.freeze({
    effect: "read" as const,
    risk: "R1" as const,
    state: "observed" as const,
    reason:
      "fixed credential-free registry GET returns one exact site's live-checked WebMCP tools with their input schemas, annotations, and page URLs",
  }),
  "tools.call": Object.freeze({
    effect: "read" as const,
    risk: "R1" as const,
    state: "observed" as const,
    reason:
      "fixed JSON-RPC envelope asks the registry to run one site's readOnlyHint-declared WebMCP tool in its own headless page; the registry refuses non-read-only tools and the result is projected as untrusted site content",
  }),
});

const domainPattern =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/u;
const toolNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
const isoTimestampPattern =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new Error(`${path} contains unsupported keys: ${unexpected.join(", ")}`);
  }
}

function requireString(
  value: unknown,
  path: string,
  options?: { readonly maxLength?: number; readonly nullable?: boolean },
): string {
  if (value === null && options?.nullable === true) return "";
  if (
    typeof value !== "string"
    || (options?.maxLength !== undefined && value.length > options.maxLength)
  ) {
    throw new Error(`${path} is malformed`);
  }
  return value;
}

function optionalString(
  value: unknown,
  path: string,
  options?: { readonly maxLength?: number },
): string | null {
  if (value === null) return null;
  return requireString(value, path, options);
}

function optionalRank(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 1
    || value > 100_000_000
  ) {
    throw new Error(`${path} is malformed`);
  }
  return value;
}

function optionalTimestamp(value: unknown, path: string): string | null {
  if (value === null) return null;
  const text = requireString(value, path, { maxLength: 40 });
  if (!isoTimestampPattern.test(text)) {
    throw new Error(`${path} is malformed`);
  }
  return text;
}

function requireTimestamp(value: unknown, path: string): string {
  const text = optionalTimestamp(value, path);
  if (text === null) throw new Error(`${path} is malformed`);
  return text;
}

function tags(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.length > 32) {
    throw new Error(`${path} is malformed`);
  }
  return Object.freeze(value.map((tag, index) =>
    requireString(tag, `${path}[${index}]`, { maxLength: 64 })
  ));
}

/** Exact public registry domain: lowercase dotted hostname, no userinfo/port. */
export function parseWebmcpDomain(value: unknown, path = "domain"): string {
  const domain = requireString(value, path, {
    maxLength: WEBMCP_MAX_DOMAIN_LENGTH,
  });
  if (!domainPattern.test(domain)) {
    throw new Error(`${path} must be a public dotted hostname`);
  }
  return domain;
}

export function parseWebmcpToolName(value: unknown, path = "tool"): string {
  const tool = requireString(value, path, {
    maxLength: WEBMCP_MAX_TOOL_NAME_LENGTH,
  });
  if (!toolNamePattern.test(tool)) {
    throw new Error(`${path} must be a bounded WebMCP tool name`);
  }
  return tool;
}

export type WebmcpSitesSearchInput = Readonly<{
  query: string;
  tag: string | null;
  sort: "popular" | "newest" | "tools";
  limit: number;
  cursor: string | null;
}>;

export type WebmcpToolsCallInput = Readonly<{
  domain: string;
  tool: string;
  input: Readonly<Record<string, unknown>>;
}>;

export const WEBMCP_TOOL_TAGS = Object.freeze([
  "yc",
  "ai",
  "saas",
  "devtools",
  "fintech",
  "ecommerce",
  "security",
  "health",
  "shopify",
] as const);

export type WebmcpToolTag = (typeof WEBMCP_TOOL_TAGS)[number];

const toolTagSet: ReadonlySet<string> = new Set(WEBMCP_TOOL_TAGS);
const sortValues = new Set(["popular", "newest", "tools"]);

export const WEBMCP_SITES_SEARCH_INPUT: InputSchema = Object.freeze({
  properties: Object.freeze({
    query: Object.freeze({
      type: "string" as const,
      description:
        "Words to match by domain, name, or what the tools do; empty lists the most popular",
      minLength: 0,
      maxLength: WEBMCP_MAX_QUERY_LENGTH,
    }),
    tag: Object.freeze({
      type: "string" as const,
      description: "Only sites with this registry tag",
      enum: WEBMCP_TOOL_TAGS,
    }),
    sort: Object.freeze({
      type: "string" as const,
      description: "Result ordering",
      enum: Object.freeze(["popular", "newest", "tools"] as const),
    }),
    limit: Object.freeze({
      type: "number" as const,
      description: "Maximum sites to return",
      minimum: 1,
      maximum: WEBMCP_MAX_SITES_LIMIT,
    }),
    cursor: Object.freeze({
      type: "string" as const,
      description: "Continuation cursor from a prior search's nextCursor",
      minLength: 1,
      maxLength: WEBMCP_MAX_CURSOR_LENGTH,
    }),
  }),
  required: Object.freeze([]),
});

export const WEBMCP_SITES_GET_INPUT: InputSchema = Object.freeze({
  properties: Object.freeze({
    domain: Object.freeze({
      type: "string" as const,
      description: "Exact site domain as the registry lists it",
      minLength: 4,
      maxLength: WEBMCP_MAX_DOMAIN_LENGTH,
    }),
  }),
  required: Object.freeze(["domain"]),
});

export const WEBMCP_TOOLS_CALL_INPUT: InputSchema = Object.freeze({
  properties: Object.freeze({
    domain: Object.freeze({
      type: "string" as const,
      description: "Exact site domain as the registry lists it",
      minLength: 4,
      maxLength: WEBMCP_MAX_DOMAIN_LENGTH,
    }),
    tool: Object.freeze({
      type: "string" as const,
      description: "Tool name exactly as sites.get lists it",
      minLength: 1,
      maxLength: WEBMCP_MAX_TOOL_NAME_LENGTH,
    }),
    input: Object.freeze({
      type: "string" as const,
      description:
        "Tool input as a JSON object literal matching the tool's input schema; defaults to {}",
      minLength: 0,
      maxLength: WEBMCP_MAX_TOOL_INPUT_BYTES,
    }),
  }),
  required: Object.freeze(["domain", "tool"]),
});

export const WEBMCP_SITES_SEARCH_CONTRACT: WebSessionContract = Object.freeze({
  site: WEBMCP_SITE,
  operation: "sites.search",
  contractVersion: 1,
  risk: "R1",
  input: WEBMCP_SITES_SEARCH_INPUT,
  sideEffect: "none",
  idempotency: "none",
  dedupeWindowMs: 0,
  state: "observed",
  dispatch: "none",
  implementation: WEBMCP_OPERATIONS["sites.search"].reason,
});

export const WEBMCP_SITES_GET_CONTRACT: WebSessionContract = Object.freeze({
  site: WEBMCP_SITE,
  operation: "sites.get",
  contractVersion: 1,
  risk: "R1",
  input: WEBMCP_SITES_GET_INPUT,
  sideEffect: "none",
  idempotency: "none",
  dedupeWindowMs: 0,
  state: "observed",
  dispatch: "none",
  implementation: WEBMCP_OPERATIONS["sites.get"].reason,
});

export const WEBMCP_TOOLS_CALL_CONTRACT: WebSessionContract = Object.freeze({
  site: WEBMCP_SITE,
  operation: "tools.call",
  contractVersion: 1,
  risk: "R1",
  input: WEBMCP_TOOLS_CALL_INPUT,
  sideEffect: "none",
  idempotency: "none",
  dedupeWindowMs: 0,
  state: "observed",
  dispatch: "none",
  implementation: WEBMCP_OPERATIONS["tools.call"].reason,
});

export const WEBMCP_CONTRACTS = Object.freeze([
  WEBMCP_SITES_SEARCH_CONTRACT,
  WEBMCP_SITES_GET_CONTRACT,
  WEBMCP_TOOLS_CALL_CONTRACT,
]);

function scalarInput(
  input: OperationInput,
  name: string,
): string | number | boolean | undefined {
  const value = input[name];
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number"
    || typeof value === "boolean") {
    return value;
  }
  throw new Error(`webmcp input ${name} is malformed`);
}

export function parseWebmcpSitesSearchInput(
  input: OperationInput,
): WebmcpSitesSearchInput {
  const allowed = new Set(["query", "tag", "sort", "limit", "cursor"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`webmcp sites.search input contains unsupported key ${key}`);
    }
  }
  const query = scalarInput(input, "query") ?? "";
  if (typeof query !== "string" || query.length > WEBMCP_MAX_QUERY_LENGTH) {
    throw new Error("webmcp sites.search query is malformed");
  }
  const tag = scalarInput(input, "tag");
  if (tag !== undefined && (typeof tag !== "string" || !toolTagSet.has(tag))) {
    throw new Error("webmcp sites.search tag is malformed");
  }
  const sort = scalarInput(input, "sort") ?? "popular";
  if (typeof sort !== "string" || !sortValues.has(sort)) {
    throw new Error("webmcp sites.search sort is malformed");
  }
  const limit = scalarInput(input, "limit") ?? 20;
  if (
    typeof limit !== "number"
    || !Number.isSafeInteger(limit)
    || limit < 1
    || limit > WEBMCP_MAX_SITES_LIMIT
  ) {
    throw new Error("webmcp sites.search limit is malformed");
  }
  const cursor = scalarInput(input, "cursor");
  if (
    cursor !== undefined
    && (typeof cursor !== "string"
      || cursor.length < 1
      || cursor.length > WEBMCP_MAX_CURSOR_LENGTH)
  ) {
    throw new Error("webmcp sites.search cursor is malformed");
  }
  return Object.freeze({
    query,
    tag: tag === undefined ? null : tag as string,
    sort: sort as WebmcpSitesSearchInput["sort"],
    limit,
    cursor: cursor === undefined ? null : cursor as string,
  });
}

export function parseWebmcpSitesGetInput(
  input: OperationInput,
): string {
  const allowed = new Set(["domain"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`webmcp sites.get input contains unsupported key ${key}`);
    }
  }
  return parseWebmcpDomain(scalarInput(input, "domain"), "webmcp sites.get domain");
}

export function parseWebmcpToolsCallInput(
  input: OperationInput,
): WebmcpToolsCallInput {
  const allowed = new Set(["domain", "tool", "input"]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`webmcp tools.call input contains unsupported key ${key}`);
    }
  }
  const domain = parseWebmcpDomain(
    scalarInput(input, "domain"),
    "webmcp tools.call domain",
  );
  const tool = parseWebmcpToolName(
    scalarInput(input, "tool"),
    "webmcp tools.call tool",
  );
  const rawInput = scalarInput(input, "input");
  let toolInput: Readonly<Record<string, unknown>> = Object.freeze({});
  if (rawInput !== undefined) {
    if (
      typeof rawInput !== "string"
      || rawInput.length > WEBMCP_MAX_TOOL_INPUT_BYTES
    ) {
      throw new Error("webmcp tools.call input is malformed");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawInput === "" ? "{}" : rawInput);
    } catch {
      throw new Error("webmcp tools.call input must be a JSON object literal");
    }
    if (!isRecord(parsed)) {
      throw new Error("webmcp tools.call input must be a JSON object literal");
    }
    toolInput = Object.freeze(parsed);
  }
  return Object.freeze({ domain, tool, input: toolInput });
}

export function webmcpSitesSearchUrl(
  input: WebmcpSitesSearchInput,
): URL {
  const url = new URL(`${WEBMCP_ORIGIN}${WEBMCP_SITES_PATH}`);
  if (input.query !== "") url.searchParams.set("q", input.query);
  if (input.tag !== null) url.searchParams.set("tag", input.tag);
  if (input.sort !== "popular") url.searchParams.set("sort", input.sort);
  url.searchParams.set("limit", String(input.limit));
  if (input.cursor !== null) url.searchParams.set("cursor", input.cursor);
  return url;
}

export function webmcpSitesGetUrl(domain: string): URL {
  return new URL(
    `${WEBMCP_ORIGIN}${WEBMCP_SITES_PATH}/${encodeURIComponent(domain)}`,
  );
}

export function webmcpMcpUrl(): URL {
  return new URL(`${WEBMCP_ORIGIN}${WEBMCP_MCP_PATH}`);
}

export function webmcpMcpCallBody(
  request: WebmcpToolsCallInput,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "call_site_tool",
      arguments: {
        domain: request.domain,
        tool: request.tool,
        input: request.input,
      },
    },
  });
}

export type WebmcpRegistrySiteSummary = Readonly<{
  domain: string;
  name: string | null;
  description: string | null;
  status: string;
  toolCount: number;
  popularityRank: number | null;
  tags: readonly string[];
  listedAt: string;
  checkedAt: string;
  url: string;
  apiUrl: string;
}>;

export type WebmcpRegistryTool = Readonly<{
  name: string;
  title: string | null;
  description: string | null;
  inputSchema: Readonly<Record<string, unknown>> | null;
  annotations: Readonly<Record<string, unknown>> | null;
  surface: string;
  pageUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
}>;

export type WebmcpRegistryListedSite = Readonly<{
  listed: true;
  domain: string;
  name: string | null;
  description: string | null;
  homepageUrl: string | null;
  status: string;
  popularityRank: number | null;
  tags: readonly string[];
  listedAt: string;
  checkedAt: string;
  lastSeenLiveAt: string | null;
  url: string;
  tools: readonly WebmcpRegistryTool[];
}>;

export type WebmcpRegistryUnlistedSite = Readonly<{
  listed: false;
  domain: string;
  name: string;
  status: "no_tools";
  statusText: string;
  popularityRank: number | null;
  tags: readonly string[];
  checkedAt: string;
  url: string;
  tools: readonly WebmcpRegistryTool[];
}>;

export type WebmcpRegistrySite =
  | WebmcpRegistryListedSite
  | WebmcpRegistryUnlistedSite;

const registryStatusValues = new Set(["live", "unreachable"]);

function parseRegistryStatus(value: unknown, path: string): string {
  const status = requireString(value, path, { maxLength: 32 });
  if (!registryStatusValues.has(status)) {
    throw new Error(`${path} is malformed`);
  }
  return status;
}

function parseRegistrySiteSummary(
  value: unknown,
  path: string,
): WebmcpRegistrySiteSummary {
  if (!isRecord(value)) throw new Error(`${path} is malformed`);
  requireExactKeys(value, [
    "domain",
    "name",
    "description",
    "status",
    "toolCount",
    "popularityRank",
    "tags",
    "listedAt",
    "checkedAt",
    "url",
    "apiUrl",
  ], path);
  const toolCount = value.toolCount;
  if (
    typeof toolCount !== "number"
    || !Number.isSafeInteger(toolCount)
    || toolCount < 0
    || toolCount > 10_000
  ) {
    throw new Error(`${path}.toolCount is malformed`);
  }
  return Object.freeze({
    domain: parseWebmcpDomain(value.domain, `${path}.domain`),
    name: optionalString(value.name, `${path}.name`, { maxLength: 300 }),
    description: optionalString(value.description, `${path}.description`, {
      maxLength: 2000,
    }),
    status: parseRegistryStatus(value.status, `${path}.status`),
    toolCount,
    popularityRank: optionalRank(value.popularityRank, `${path}.popularityRank`),
    tags: tags(value.tags, `${path}.tags`),
    listedAt: requireTimestamp(value.listedAt, `${path}.listedAt`),
    checkedAt: requireTimestamp(value.checkedAt, `${path}.checkedAt`),
    url: requireString(value.url, `${path}.url`, { maxLength: 300 }),
    apiUrl: requireString(value.apiUrl, `${path}.apiUrl`, { maxLength: 300 }),
  });
}

function parseRegistryTool(
  value: unknown,
  path: string,
): WebmcpRegistryTool {
  if (!isRecord(value)) throw new Error(`${path} is malformed`);
  requireExactKeys(value, [
    "name",
    "title",
    "description",
    "inputSchema",
    "annotations",
    "surface",
    "pageUrl",
    "firstSeenAt",
    "lastSeenAt",
  ], path);
  if (value.inputSchema !== null && !isRecord(value.inputSchema)) {
    throw new Error(`${path}.inputSchema is malformed`);
  }
  if (value.annotations !== null && !isRecord(value.annotations)) {
    throw new Error(`${path}.annotations is malformed`);
  }
  return Object.freeze({
    name: parseWebmcpToolName(value.name, `${path}.name`),
    title: optionalString(value.title, `${path}.title`, { maxLength: 300 }),
    description: optionalString(value.description, `${path}.description`, {
      maxLength: 4000,
    }),
    inputSchema: value.inputSchema === null
      ? null
      : Object.freeze(value.inputSchema),
    annotations: value.annotations === null
      ? null
      : Object.freeze(value.annotations),
    surface: requireString(value.surface, `${path}.surface`, { maxLength: 32 }),
    pageUrl: requireString(value.pageUrl, `${path}.pageUrl`, { maxLength: 1000 }),
    firstSeenAt: requireTimestamp(value.firstSeenAt, `${path}.firstSeenAt`),
    lastSeenAt: requireTimestamp(value.lastSeenAt, `${path}.lastSeenAt`),
  });
}

export type WebmcpSitesSearchResult = Readonly<{
  sites: readonly WebmcpRegistrySiteSummary[];
  nextCursor: string | null;
}>;

export function parseWebmcpSitesSearchResponse(
  value: unknown,
): WebmcpSitesSearchResult {
  if (!isRecord(value)) {
    throw new Error("webmcp sites.search response is malformed");
  }
  requireExactKeys(value, ["sites", "nextCursor"], "webmcp sites.search response");
  const raw = value.sites;
  if (!Array.isArray(raw) || raw.length > WEBMCP_MAX_SITES_LIMIT) {
    throw new Error("webmcp sites.search response.sites is malformed");
  }
  const sites = raw.slice(0, WEBMCP_MAX_PROJECTED_SITES).map((site, index) =>
    parseRegistrySiteSummary(site, `webmcp sites.search response.sites[${index}]`)
  );
  const cursor = value.nextCursor;
  const nextCursor = cursor === undefined || cursor === null
    ? null
    : requireString(cursor, "webmcp sites.search response.nextCursor", {
      maxLength: WEBMCP_MAX_CURSOR_LENGTH,
    });
  return Object.freeze({
    sites: Object.freeze(sites),
    nextCursor,
  });
}

function parseRegistryTools(
  value: unknown,
  path: string,
): readonly WebmcpRegistryTool[] {
  if (!Array.isArray(value) || value.length > WEBMCP_MAX_PROJECTED_TOOLS) {
    throw new Error(`${path} is malformed`);
  }
  return Object.freeze(value.map((tool, index) =>
    parseRegistryTool(tool, `${path}[${index}]`)
  ));
}

export function parseWebmcpSitesGetResponse(
  value: unknown,
): WebmcpRegistrySite {
  const path = "webmcp sites.get response";
  if (!isRecord(value)) throw new Error(`${path} is malformed`);
  if (value.listed === true) {
    requireExactKeys(value, [
      "domain",
      "name",
      "description",
      "homepageUrl",
      "listed",
      "status",
      "popularityRank",
      "tags",
      "listedAt",
      "checkedAt",
      "lastSeenLiveAt",
      "url",
      "tools",
    ], path);
    return Object.freeze({
      listed: true as const,
      domain: parseWebmcpDomain(value.domain, `${path}.domain`),
      name: optionalString(value.name, `${path}.name`, { maxLength: 300 }),
      description: optionalString(value.description, `${path}.description`, {
        maxLength: 2000,
      }),
      homepageUrl: optionalString(value.homepageUrl, `${path}.homepageUrl`, {
        maxLength: 1000,
      }),
      status: parseRegistryStatus(value.status, `${path}.status`),
      popularityRank: optionalRank(
        value.popularityRank,
        `${path}.popularityRank`,
      ),
      tags: tags(value.tags, `${path}.tags`),
      listedAt: requireTimestamp(value.listedAt, `${path}.listedAt`),
      checkedAt: requireTimestamp(value.checkedAt, `${path}.checkedAt`),
      lastSeenLiveAt: optionalTimestamp(
        value.lastSeenLiveAt,
        `${path}.lastSeenLiveAt`,
      ),
      url: requireString(value.url, `${path}.url`, { maxLength: 300 }),
      tools: parseRegistryTools(value.tools, `${path}.tools`),
    });
  }
  if (value.listed === false) {
    requireExactKeys(value, [
      "domain",
      "name",
      "listed",
      "status",
      "statusText",
      "popularityRank",
      "tags",
      "checkedAt",
      "url",
      "tools",
    ], path);
    if (value.status !== "no_tools") {
      throw new Error(`${path}.status is malformed`);
    }
    return Object.freeze({
      listed: false as const,
      domain: parseWebmcpDomain(value.domain, `${path}.domain`),
      name: optionalString(value.name, `${path}.name`, { maxLength: 300 }) ?? "",
      status: "no_tools" as const,
      statusText: requireString(value.statusText, `${path}.statusText`, {
        maxLength: 300,
      }),
      popularityRank: optionalRank(
        value.popularityRank,
        `${path}.popularityRank`,
      ),
      tags: tags(value.tags, `${path}.tags`),
      checkedAt: requireTimestamp(value.checkedAt, `${path}.checkedAt`),
      url: requireString(value.url, `${path}.url`, { maxLength: 300 }),
      tools: parseRegistryTools(value.tools, `${path}.tools`),
    });
  }
  throw new Error(`${path}.listed is malformed`);
}

export type WebmcpToolCallResult = Readonly<{
  domain: string;
  tool: string;
  isError: boolean;
  content: readonly string[];
  nonTextItems: number;
  trust: "untrusted-site-content";
}>;

/**
 * Scan one bounded SSE body for the JSON-RPC response addressed to our fixed
 * request id. The registry emits `event: message` frames whose `data:` payload
 * is one JSON-RPC envelope; unrelated frames are ignored, a matching envelope
 * is then checked strictly.
 */
export function parseWebmcpToolsCallResponse(
  body: string,
  request: WebmcpToolsCallInput,
): WebmcpToolCallResult {
  const path = "webmcp tools.call response";
  const frames = body.split(/\r?\n\r?\n/u);
  for (const frame of frames) {
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/u)) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /u, ""));
      }
    }
    if (dataLines.length === 0) continue;
    let envelope: unknown;
    try {
      envelope = JSON.parse(dataLines.join("\n"));
    } catch {
      continue;
    }
    if (!isRecord(envelope) || envelope.jsonrpc !== "2.0" || envelope.id !== 1) {
      continue;
    }
    requireExactKeys(envelope, ["jsonrpc", "id", "result", "error"], path);
    if (envelope.error !== undefined) {
      const error = envelope.error;
      if (!isRecord(error)) throw new Error(`${path}.error is malformed`);
      requireExactKeys(error, ["code", "message", "data"], `${path}.error`);
      const message = requireString(error.message, `${path}.error.message`, {
        maxLength: 1000,
      });
      throw new Error(
        `webmcp tools.call was rejected by the registry: ${message}`,
      );
    }
    return projectWebmcpToolCallResult(envelope.result, request, path);
  }
  throw new Error("webmcp tools.call response carried no matching message frame");
}

function projectWebmcpToolCallResult(
  result: unknown,
  request: WebmcpToolsCallInput,
  path: string,
): WebmcpToolCallResult {
  if (!isRecord(result)) throw new Error(`${path}.result is malformed`);
  requireExactKeys(
    result,
    ["content", "isError", "structuredContent", "_meta"],
    `${path}.result`,
  );
  const content = result.content;
  if (
    !Array.isArray(content)
    || content.length > WEBMCP_MAX_PROJECTED_CONTENT_ITEMS
  ) {
    throw new Error(`${path}.result.content is malformed`);
  }
  const texts: string[] = [];
  let nonTextItems = 0;
  for (const [index, item] of content.entries()) {
    if (!isRecord(item)) {
      throw new Error(`${path}.result.content[${index}] is malformed`);
    }
    if (item.type !== "text") {
      if (typeof item.type !== "string" || item.type.length > 40) {
        throw new Error(`${path}.result.content[${index}].type is malformed`);
      }
      nonTextItems += 1;
      continue;
    }
    texts.push(requireString(
      item.text,
      `${path}.result.content[${index}].text`,
      { maxLength: WEBMCP_MAX_MCP_RESPONSE_BYTES },
    ));
  }
  if (result.isError !== undefined && typeof result.isError !== "boolean") {
    throw new Error(`${path}.result.isError is malformed`);
  }
  return Object.freeze({
    domain: request.domain,
    tool: request.tool,
    isError: result.isError === true,
    content: Object.freeze(texts),
    nonTextItems,
    trust: "untrusted-site-content",
  });
}
