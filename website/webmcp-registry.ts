/**
 * Checked-in WebMCP Registry snapshot: strict parsing and static page
 * descriptors for /providers/<domain>/.
 *
 * The snapshot is produced by website/sync-webmcp-registry.ts from the live
 * wmcp.ai registry; the build treats it as foreign input and revalidates it.
 */

import type { PublicPage } from "./build";

export const WEBMCP_REGISTRY_SNAPSHOT_PATH = "source/webmcp-registry.json" as const;
export const WEBMCP_SITE_TEMPLATE = "provider-webmcp-site.html" as const;
export const WEBMCP_INDEX_SOURCE = "providers.html" as const;
export const WEBMCP_MAX_SNAPSHOT_SITES = 5_000;
export const WEBMCP_MAX_SNAPSHOT_TOOLS = 40;
/** Snapshot sync limits for third-party text; see clipAtWordBoundary. */
export const WEBMCP_TOOL_DESCRIPTION_LIMIT = 240;
export const WEBMCP_SITE_DESCRIPTION_LIMIT = 300;

/** "1 tool", "0 tools", "12 tools": the count and a noun that agrees with it. */
export function countNoun(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

/** "September 23, 2026" for an ISO timestamp, read in UTC. */
export function formatRegistryDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  });
}

const TERMINAL_PUNCTUATION = /[.!?…)\]"'”’]$/u;

/**
 * Shortens third-party text to at most `limit` characters without cutting a
 * word: it keeps whole words and ends with "…" when anything was removed.
 */
export function clipAtWordBoundary(text: string, limit: number): string {
  const chars = [...text];
  if (chars.length <= limit) return text;
  const head = chars.slice(0, limit - 1).join("");
  const lastSpace = head.search(/\s\S*$/u);
  const kept = (lastSpace > 0 ? head.slice(0, lastSpace) : head).replace(/[\s,;:]+$/u, "");
  return `${kept}…`;
}

/**
 * Earlier snapshots cut tool descriptions at exactly 240 characters, often
 * mid-word. Treat such a description as cut and re-clip it at a word
 * boundary so a page never ends a sentence mid-word.
 */
export function presentWebmcpToolDescription(description: string): string {
  // The earlier sync cut with String.prototype.slice, so compare UTF-16 length.
  if (description.length !== WEBMCP_TOOL_DESCRIPTION_LIMIT || TERMINAL_PUNCTUATION.test(description)) {
    return description;
  }
  const lastSpace = description.search(/\s\S*$/u);
  if (lastSpace < 1) return `${[...description].slice(0, -1).join("")}…`;
  return `${description.slice(0, lastSpace).replace(/[\s,;:]+$/u, "")}…`;
}

/**
 * The registry name is often the site's own page title ("Zapier: Automate AI
 * Workflows, Agents, and Apps"). Headings use the part before the first
 * title separator so a page names the site, not its tagline.
 */
export function webmcpDisplayName(site: Pick<WebmcpSnapshotSite, "name">): string {
  const match = /^(.{2,}?)(?:: | \| | - | – | — )/u.exec(site.name);
  return match?.[1]?.trim() ?? site.name;
}

export type WebmcpSnapshotTool = Readonly<{
  name: string;
  description: string;
  readOnly: boolean;
}>;

export type WebmcpSnapshotSite = Readonly<{
  domain: string;
  name: string;
  description: string;
  toolCount: number;
  readOnlyToolCount: number;
  tags: readonly string[];
  checkedAt: string;
  homepageUrl: string;
  registryUrl: string;
  tools: readonly WebmcpSnapshotTool[];
}>;

export type WebmcpRegistrySnapshot = Readonly<{
  schemaVersion: 1;
  syncedAt: string;
  registryOrigin: string;
  siteCount: number;
  sites: readonly WebmcpSnapshotSite[];
}>;

const domainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;
const toolNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u;
const tagPattern = /^[a-z0-9][a-z0-9-]{0,31}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${path} has unsupported keys ${actual.join(",")}`);
  }
}

function requireString(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength) {
    throw new Error(`${path} is malformed`);
  }
  return value;
}

function boundedString(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(`${path} is malformed`);
  }
  return value;
}

function requireTimestamp(value: unknown, path: string): string {
  const timestamp = requireString(value, path, 64);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`${path} is malformed`);
  }
  return timestamp;
}

function optionalUrl(value: unknown, path: string): string {
  if (value === "") return "";
  const url = requireString(value, path, 2048);
  if (!/^https:\/\/[^\s"<>]+$/u.test(url)) {
    throw new Error(`${path} is malformed`);
  }
  return url;
}

function parseSnapshotTool(value: unknown, path: string): WebmcpSnapshotTool {
  if (!isRecord(value)) throw new Error(`${path} is malformed`);
  exactKeys(value, ["description", "name", "readOnly"], path);
  const name = requireString(value.name, `${path}.name`, 200);
  if (!toolNamePattern.test(name)) {
    throw new Error(`${path}.name is malformed`);
  }
  if (typeof value.readOnly !== "boolean") {
    throw new Error(`${path}.readOnly is malformed`);
  }
  return Object.freeze({
    name,
    description: boundedString(value.description, `${path}.description`, 300),
    readOnly: value.readOnly,
  });
}

function parseSnapshotSite(value: unknown, path: string): WebmcpSnapshotSite {
  if (!isRecord(value)) throw new Error(`${path} is malformed`);
  exactKeys(value, [
    "checkedAt",
    "description",
    "domain",
    "homepageUrl",
    "name",
    "readOnlyToolCount",
    "registryUrl",
    "tags",
    "toolCount",
    "tools",
  ], path);
  const domain = requireString(value.domain, `${path}.domain`, 253);
  if (!domainPattern.test(domain)) {
    throw new Error(`${path}.domain is malformed`);
  }
  if (
    typeof value.toolCount !== "number"
    || !Number.isSafeInteger(value.toolCount)
    || value.toolCount < 0
    || typeof value.readOnlyToolCount !== "number"
    || !Number.isSafeInteger(value.readOnlyToolCount)
    || value.readOnlyToolCount < 0
    || value.readOnlyToolCount > value.toolCount
  ) {
    throw new Error(`${path} tool counts are malformed`);
  }
  if (!Array.isArray(value.tags) || value.tags.length > 24) {
    throw new Error(`${path}.tags is malformed`);
  }
  const tags = value.tags.map((tag, index) => {
    const parsed = requireString(tag, `${path}.tags[${String(index)}]`, 32);
    if (!tagPattern.test(parsed)) {
      throw new Error(`${path}.tags[${String(index)}] is malformed`);
    }
    return parsed;
  });
  if (!Array.isArray(value.tools) || value.tools.length > WEBMCP_MAX_SNAPSHOT_TOOLS) {
    throw new Error(`${path}.tools is malformed`);
  }
  const tools = value.tools.map((tool, index) =>
    parseSnapshotTool(tool, `${path}.tools[${String(index)}]`));
  const readOnly = tools.filter((tool) => tool.readOnly).length;
  if (value.toolCount > 0 && readOnly > value.readOnlyToolCount) {
    throw new Error(`${path} read-only tool count drifted`);
  }
  return Object.freeze({
    domain,
    name: requireString(value.name, `${path}.name`, 200),
    description: boundedString(value.description, `${path}.description`, 320),
    toolCount: value.toolCount,
    readOnlyToolCount: value.readOnlyToolCount,
    tags: Object.freeze(tags),
    checkedAt: requireTimestamp(value.checkedAt, `${path}.checkedAt`),
    homepageUrl: optionalUrl(value.homepageUrl, `${path}.homepageUrl`),
    registryUrl: optionalUrl(value.registryUrl, `${path}.registryUrl`),
    tools: Object.freeze(tools),
  });
}

export function parseWebmcpRegistrySnapshot(value: unknown): WebmcpRegistrySnapshot {
  if (!isRecord(value)) throw new Error("webmcp registry snapshot is malformed");
  exactKeys(value, [
    "registryOrigin",
    "schemaVersion",
    "siteCount",
    "sites",
    "syncedAt",
  ], "webmcp registry snapshot");
  if (value.schemaVersion !== 1 || value.registryOrigin !== "https://www.wmcp.ai") {
    throw new Error("webmcp registry snapshot is not the reviewed v1 wmcp.ai format");
  }
  const syncedAt = requireTimestamp(value.syncedAt, "webmcp registry snapshot.syncedAt");
  if (!Array.isArray(value.sites) || value.sites.length > WEBMCP_MAX_SNAPSHOT_SITES) {
    throw new Error("webmcp registry snapshot.sites is malformed");
  }
  const sites = value.sites.map((site, index) =>
    parseSnapshotSite(site, `webmcp registry snapshot.sites[${String(index)}]`));
  const domains = new Set<string>();
  for (const site of sites) {
    if (domains.has(site.domain)) {
      throw new Error(`webmcp registry snapshot repeats ${site.domain}`);
    }
    domains.add(site.domain);
  }
  if (value.siteCount !== sites.length) {
    throw new Error("webmcp registry snapshot.siteCount drifted");
  }
  return Object.freeze({
    schemaVersion: 1,
    syncedAt,
    registryOrigin: "https://www.wmcp.ai",
    siteCount: sites.length,
    sites: Object.freeze(sites),
  });
}

export function webmcpSiteCanonicalPath(domain: string): string {
  if (!domainPattern.test(domain)) {
    throw new Error(`cannot publish a page for malformed domain ${domain}`);
  }
  return `/providers/${domain}/`;
}

export function webmcpSiteTitle(site: WebmcpSnapshotSite): string {
  const name = webmcpDisplayName(site);
  return site.readOnlyToolCount > 0
    ? `Use ${name} with your agent through Ghostget`
    : `${name} in the WebMCP Registry, read through Ghostget`;
}

/** The page's H1: a promise of use only when the agent can call a tool. */
export function webmcpSiteHeading(site: WebmcpSnapshotSite): string {
  const name = webmcpDisplayName(site);
  return site.readOnlyToolCount > 0
    ? `Use ${name} with your agent`
    : `${name} in the WebMCP Registry`;
}

export function webmcpSiteDescription(site: WebmcpSnapshotSite): string {
  const callable = site.readOnlyToolCount;
  const base = `${webmcpDisplayName(site)} (${site.domain}) registers ${countNoun(site.toolCount, "WebMCP tool", "WebMCP tools")}.`;
  if (callable < 1) {
    return `${base} None is declared read-only, so Ghostget can read the tool schema from the registry but can't call a tool.`;
  }
  return `${base} Ghostget can call ${countNoun(callable, "read-only tool", "read-only tools")} through the WebMCP Registry, using the schema from its latest check.`;
}

export function webmcpProviderPages(snapshot: WebmcpRegistrySnapshot): readonly PublicPage[] {
  return snapshot.sites.map((site) => Object.freeze({
    canonicalPath: webmcpSiteCanonicalPath(site.domain),
    description: webmcpSiteDescription(site),
    outputFile: `providers/${site.domain}/index.html`,
    sourceFile: WEBMCP_SITE_TEMPLATE,
    title: webmcpSiteTitle(site),
  }));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function firstReadOnlyTool(site: WebmcpSnapshotSite): WebmcpSnapshotTool | undefined {
  return site.tools.find((tool) => tool.readOnly);
}

export function renderWebmcpToolsTable(site: WebmcpSnapshotSite): string {
  const rows = site.tools.map((tool) => [
    "<tr>",
    `<th scope="row"><code>${escapeHtml(tool.name)}</code></th>`,
    `<td>${escapeHtml(presentWebmcpToolDescription(tool.description))}</td>`,
    tool.readOnly
      ? "<td>Callable read-only tool</td>"
      : "<td>Listed for discovery; the registry allows read-only calls only</td>",
    "</tr>",
  ].join("")).join("");
  return [
    '<div aria-labelledby="site-tools" class="table-scroll" role="region" tabindex="0">',
    "<table>",
    "<thead><tr>",
    '<th scope="col">Tool</th>',
    `<th scope="col">Description from ${escapeHtml(webmcpDisplayName(site))}</th>`,
    '<th scope="col">Callable through Ghostget</th>',
    "</tr></thead>",
    `<tbody>${rows}</tbody>`,
    "</table>",
    "</div>",
  ].join("");
}

export function webmcpSiteTemplateValues(site: WebmcpSnapshotSite): Readonly<Record<string, string>> {
  const callable = site.readOnlyToolCount;
  const example = firstReadOnlyTool(site);
  const callExample = example === undefined
    ? `# no read-only tools listed; sites.get shows the registry's latest status`
    : `ghostget webmcp tools.call --input '${JSON.stringify({
      domain: site.domain,
      tool: example.name,
      input: "{}",
    })}' --json`;
  const name = webmcpDisplayName(site);
  const statusLine = site.toolCount < 1
    ? "No tools are listed yet, so there is nothing to call through <code>tools.call</code>. Ask <code>sites.get</code> for the registry's latest status."
    : callable < 1
    ? `${site.toolCount === 1 ? "It isn't" : "None is"} declared read-only, so <code>tools.call</code> can't invoke ${site.toolCount === 1 ? "it" : "them"}. Ask <code>sites.get</code> for the registry's latest status before planning a call.`
    : `${String(callable)} of ${countNoun(site.toolCount, "tool", "tools")} ${callable === 1 ? "declares" : "declare"} <code>readOnlyHint</code>, so an agent can invoke ${callable === 1 ? "it" : "them"} through <code>tools.call</code>. The registry runs the tool in a fresh headless page on ${escapeHtml(site.domain)} and returns untrusted site content.`;
  const toolsSummary = `${escapeHtml(name)} publishes ${countNoun(site.toolCount, "tool", "tools")} on ${escapeHtml(site.domain)}; ${String(callable)} ${callable === 1 ? "declares" : "declare"} <code>readOnlyHint</code>.`;
  const values: Record<string, string> = {
    "{{WEBMCP_CALL_EXAMPLE}}": escapeHtml(callExample),
    "{{WEBMCP_CHECKED_AT}}": escapeHtml(formatRegistryDate(site.checkedAt)),
    "{{WEBMCP_DOMAIN}}": escapeHtml(site.domain),
    "{{WEBMCP_GET_EXAMPLE}}": escapeHtml(
      `ghostget webmcp sites.get --input '{"domain":"${site.domain}"}' --json`,
    ),
    "{{WEBMCP_HEADING}}": escapeHtml(webmcpSiteHeading(site)),
    "{{WEBMCP_HOMEPAGE_URL}}": escapeHtml(site.homepageUrl),
    "{{WEBMCP_NAME}}": escapeHtml(name),
    "{{WEBMCP_PAGE_DESCRIPTION}}": escapeHtml(webmcpSiteDescription(site)),
    "{{WEBMCP_PAGE_TITLE}}": escapeHtml(webmcpSiteTitle(site)),
    "{{WEBMCP_READONLY_COUNT}}": String(callable),
    "{{WEBMCP_REGISTRY_URL}}": escapeHtml(site.registryUrl),
    "{{WEBMCP_SITE_DESCRIPTION}}": escapeHtml(site.description),
    "{{WEBMCP_STATUS_LINE}}": statusLine,
    "{{WEBMCP_TAGS}}": escapeHtml(site.tags.join(", ")),
    "{{WEBMCP_TOOL_COUNT}}": String(site.toolCount),
    "{{WEBMCP_TOOL_COUNT_PHRASE}}": countNoun(site.toolCount, "WebMCP tool", "WebMCP tools"),
    "{{WEBMCP_TOOLS_SUMMARY}}": toolsSummary,
    "{{WEBMCP_TOOLS_TABLE}}": renderWebmcpToolsTable(site),
  };
  if (example !== undefined) {
    values["{{WEBMCP_CALLABLE_TOOL}}"] = escapeHtml(example.name);
  }
  return Object.freeze(values);
}

export function substituteTemplateValues(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  let rendered = template;
  for (const [placeholder, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(placeholder, value);
  }
  return rendered;
}

export function renderWebmcpIndexList(snapshot: WebmcpRegistrySnapshot): string {
  const rows = snapshot.sites.map((site) => [
    "<tr>",
    `<th scope="row"><a href="${webmcpSiteCanonicalPath(site.domain)}">${escapeHtml(site.domain)}</a></th>`,
    `<td>${escapeHtml(site.name)}</td>`,
    `<td>${String(site.toolCount)}</td>`,
    `<td>${String(site.readOnlyToolCount)}</td>`,
    "</tr>",
  ].join("")).join("");
  return [
    '<div aria-labelledby="webmcp-registry" class="table-scroll" role="region" tabindex="0">',
    "<table>",
    "<thead><tr>",
    '<th scope="col">Domain</th>',
    '<th scope="col">Site</th>',
    '<th scope="col">Tools</th>',
    '<th scope="col">Read-only</th>',
    "</tr></thead>",
    `<tbody>${rows}</tbody>`,
    "</table>",
    "</div>",
  ].join("");
}

export function webmcpIndexTemplateValues(snapshot: WebmcpRegistrySnapshot): Readonly<Record<string, string>> {
  const totalTools = snapshot.sites.reduce((sum, site) => sum + site.toolCount, 0);
  const readOnlyTools = snapshot.sites.reduce((sum, site) => sum + site.readOnlyToolCount, 0);
  return Object.freeze({
    "{{WEBMCP_INDEX_TABLE}}": renderWebmcpIndexList(snapshot),
    "{{WEBMCP_REGISTRY_READONLY_TOOL_COUNT}}": readOnlyTools.toLocaleString("en-US"),
    "{{WEBMCP_REGISTRY_SITE_COUNT}}": snapshot.siteCount.toLocaleString("en-US"),
    "{{WEBMCP_REGISTRY_TOOL_COUNT}}": totalTools.toLocaleString("en-US"),
    "{{WEBMCP_SYNCED_AT}}": escapeHtml(formatRegistryDate(snapshot.syncedAt)),
  });
}
