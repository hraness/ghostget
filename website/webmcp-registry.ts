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
  return `Use ${site.name} with your agent through Ghostget`;
}

export function webmcpSiteDescription(site: WebmcpSnapshotSite): string {
  const callable = site.readOnlyToolCount;
  const base = `${site.name} (${site.domain}) registers ${String(site.toolCount)} WebMCP ${site.toolCount === 1 ? "tool" : "tools"}.`;
  if (callable < 1) {
    return `${base} Ghostget reads its live registry schema; the registry lists no read-only-callable tools today.`;
  }
  return `${base} Ghostget calls ${String(callable)} read-only ${callable === 1 ? "tool" : "tools"} through the WebMCP Registry with the live schema.`;
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
    `<td>${escapeHtml(tool.description)}</td>`,
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
    '<th scope="col">What it does</th>',
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
    ? `# no read-only-callable tools listed today; sites.get shows the live status`
    : `ghostget webmcp tools.call --input '${JSON.stringify({
      domain: site.domain,
      tool: example.name,
      input: "{}",
    })}' --json`;
  const statusLine = callable < 1
    ? `${escapeHtml(site.name)} lists ${String(site.toolCount)} ${site.toolCount === 1 ? "tool" : "tools"} but declares none as read-only today, so <code>tools.call</code> cannot invoke them yet. Ask <code>sites.get</code> for the live status before planning a call.`
    : `${String(callable)} of ${String(site.toolCount)} ${site.toolCount === 1 ? "tool" : "tools"} declares <code>readOnlyHint</code>, so an agent can invoke ${callable === 1 ? "it" : "them"} through <code>tools.call</code>. The registry runs the tool in a fresh headless page on ${escapeHtml(site.domain)} and returns untrusted site content.`;
  const values: Record<string, string> = {
    "{{WEBMCP_CALL_EXAMPLE}}": escapeHtml(callExample),
    "{{WEBMCP_CHECKED_AT}}": escapeHtml(site.checkedAt),
    "{{WEBMCP_DOMAIN}}": escapeHtml(site.domain),
    "{{WEBMCP_GET_EXAMPLE}}": escapeHtml(
      `ghostget webmcp sites.get --input '{"domain":"${site.domain}"}' --json`,
    ),
    "{{WEBMCP_HOMEPAGE_URL}}": escapeHtml(site.homepageUrl),
    "{{WEBMCP_NAME}}": escapeHtml(site.name),
    "{{WEBMCP_PAGE_DESCRIPTION}}": escapeHtml(webmcpSiteDescription(site)),
    "{{WEBMCP_PAGE_TITLE}}": escapeHtml(webmcpSiteTitle(site)),
    "{{WEBMCP_READONLY_COUNT}}": String(callable),
    "{{WEBMCP_REGISTRY_URL}}": escapeHtml(site.registryUrl),
    "{{WEBMCP_SITE_DESCRIPTION}}": escapeHtml(site.description),
    "{{WEBMCP_STATUS_LINE}}": statusLine,
    "{{WEBMCP_TAGS}}": escapeHtml(site.tags.join(", ")),
    "{{WEBMCP_TOOL_COUNT}}": String(site.toolCount),
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

// Registry-wide counts any public page may quote; per-site and index values
// layer their own placeholders on top of this base.
export function webmcpSharedTemplateValues(
  snapshot: WebmcpRegistrySnapshot,
): Readonly<Record<string, string>> {
  const totalTools = snapshot.sites.reduce((sum, site) => sum + site.toolCount, 0);
  const readOnlyTools = snapshot.sites.reduce((sum, site) => sum + site.readOnlyToolCount, 0);
  return Object.freeze({
    "{{WEBMCP_REGISTRY_READONLY_TOOL_COUNT}}": String(readOnlyTools),
    "{{WEBMCP_REGISTRY_SITE_COUNT}}": String(snapshot.siteCount),
    "{{WEBMCP_REGISTRY_TOOL_COUNT}}": String(totalTools),
    "{{WEBMCP_SYNCED_AT}}": escapeHtml(snapshot.syncedAt),
  });
}

export function webmcpIndexTemplateValues(snapshot: WebmcpRegistrySnapshot): Readonly<Record<string, string>> {
  return Object.freeze({
    ...webmcpSharedTemplateValues(snapshot),
    "{{WEBMCP_INDEX_TABLE}}": renderWebmcpIndexList(snapshot),
  });
}
