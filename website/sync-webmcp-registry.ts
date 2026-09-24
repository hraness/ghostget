#!/usr/bin/env bun
/**
 * Synchronize the checked-in WebMCP Registry snapshot.
 *
 * Reads every listed site page and each site's current tool detail from
 * https://www.wmcp.ai/api/v1, projects the exact public fields the website
 * needs, and rewrites website/source/webmcp-registry.json deterministically.
 *
 * Usage: bun run website/sync-webmcp-registry.ts [--max-sites N] [--out PATH]
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseWebmcpSitesGetResponse,
  parseWebmcpSitesSearchResponse,
} from "../src/providers/webmcp";
import {
  clipAtWordBoundary,
  WEBMCP_SITE_DESCRIPTION_LIMIT,
  WEBMCP_TOOL_DESCRIPTION_LIMIT,
} from "./webmcp-registry";

const REGISTRY_API = "https://www.wmcp.ai";
const LIST_PAGE_LIMIT = 100;
const MAX_LIST_PAGES = 200;
const MAX_SITES = 5_000;
const MAX_SITE_TOOLS = 40;
const CONCURRENCY = 12;
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = "ghostget-website-webmcp-sync/1.0 (+https://ghostget.com)";

type SnapshotTool = {
  readonly name: string;
  readonly description: string;
  readonly readOnly: boolean;
};

type SnapshotSite = {
  readonly domain: string;
  readonly name: string;
  readonly description: string;
  readonly toolCount: number;
  readonly readOnlyToolCount: number;
  readonly tags: readonly string[];
  readonly checkedAt: string;
  readonly homepageUrl: string;
  readonly registryUrl: string;
  readonly tools: readonly SnapshotTool[];
};

type Snapshot = {
  readonly schemaVersion: 1;
  readonly syncedAt: string;
  readonly registryOrigin: string;
  readonly siteCount: number;
  readonly sites: readonly SnapshotSite[];
};

async function registryFetch(pathname: string): Promise<unknown> {
  const response = await fetch(`${REGISTRY_API}${pathname}`, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`registry ${pathname} returned HTTP ${String(response.status)}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|\s*$)/iu.test(contentType)) {
    throw new Error(`registry ${pathname} returned ${contentType || "no"} content type`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error(`registry ${pathname} exceeded its response bound`);
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function listSiteDomains(): Promise<readonly string[]> {
  const domains: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: String(LIST_PAGE_LIMIT) });
    if (cursor !== null) query.set("cursor", cursor);
    const body = parseWebmcpSitesSearchResponse(
      await registryFetch(`/api/v1/sites?${query.toString()}`),
    );
    for (const site of body.sites) domains.push(site.domain);
    cursor = body.nextCursor;
    if (cursor === null) break;
  }
  if (domains.length > MAX_SITES) {
    throw new Error(`registry lists ${String(domains.length)} sites; review before widening`);
  }
  return Object.freeze(domains);
}

async function siteDetail(domain: string): Promise<SnapshotSite> {
  const site = parseWebmcpSitesGetResponse(
    await registryFetch(`/api/v1/sites/${encodeURIComponent(domain)}`),
  );
  if (site.domain !== domain) {
    throw new Error(`registry detail for ${domain} returned ${site.domain}`);
  }
  if (!site.listed) {
    return Object.freeze({
      domain,
      name: domain,
      description: site.statusText,
      toolCount: 0,
      readOnlyToolCount: 0,
      tags: Object.freeze(site.tags),
      checkedAt: site.checkedAt,
      homepageUrl: "",
      registryUrl: site.url,
      tools: Object.freeze([]),
    });
  }
  const tools = site.tools.slice(0, MAX_SITE_TOOLS).map((tool) => Object.freeze({
    name: tool.name,
    description: clipAtWordBoundary(tool.description ?? "", WEBMCP_TOOL_DESCRIPTION_LIMIT),
    readOnly: tool.annotations?.readOnlyHint === true,
  }));
  return Object.freeze({
    domain,
    name: site.name ?? domain,
    description: clipAtWordBoundary(site.description ?? "", WEBMCP_SITE_DESCRIPTION_LIMIT),
    toolCount: site.tools.length,
    readOnlyToolCount: tools.filter((tool) => tool.readOnly).length,
    tags: Object.freeze(site.tags),
    checkedAt: site.checkedAt,
    homepageUrl: site.homepageUrl ?? "",
    registryUrl: site.url,
    tools: Object.freeze(tools),
  });
}

export async function syncWebmcpRegistrySnapshot(options: Readonly<{
  maxSites: number;
  outPath: string;
  now: () => Date;
}>): Promise<Snapshot> {
  const allDomains = await listSiteDomains();
  const domains = allDomains.slice(0, options.maxSites);
  const sites: (SnapshotSite | undefined)[] = new Array(domains.length);
  const failures: string[] = [];
  let next = 0;
  let completed = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (next < domains.length) {
      const index = next;
      next += 1;
      const domain = domains[index];
      if (domain === undefined) continue;
      try {
        sites[index] = await siteDetail(domain);
      } catch (firstError) {
        const message = firstError instanceof Error ? firstError.message : String(firstError);
        if (message.startsWith("registry ")) {
          try {
            sites[index] = await siteDetail(domain);
          } catch (retryError) {
            failures.push(`${domain}: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
          }
        } else {
          failures.push(`${domain}: ${message}`);
        }
      }
      completed += 1;
      if (completed % 100 === 0) {
        process.stderr.write(`webmcp sync: ${String(completed)}/${String(domains.length)} sites\n`);
      }
    }
  });
  await Promise.all(workers);
  const written = sites.filter((site): site is SnapshotSite => site !== undefined);
  if (failures.length > 0) {
    process.stderr.write(`webmcp sync: ${String(failures.length)} sites failed after retry:\n${failures.join("\n")}\n`);
  }
  const snapshot: Snapshot = Object.freeze({
    schemaVersion: 1,
    syncedAt: options.now().toISOString(),
    registryOrigin: REGISTRY_API,
    siteCount: written.length,
    sites: Object.freeze(written),
  });
  await writeFile(options.outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

function parseArguments(raw: readonly string[]): { maxSites: number; outPath: string } {
  const websiteRoot = dirname(fileURLToPath(import.meta.url));
  let maxSites = MAX_SITES;
  let outPath = join(websiteRoot, "source", "webmcp-registry.json");
  for (let index = 0; index < raw.length; index += 1) {
    const argument = raw[index];
    if (argument === "--max-sites") {
      const value = Number(raw[index + 1]);
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error("--max-sites needs a positive integer");
      }
      maxSites = value;
      index += 1;
      continue;
    }
    if (argument === "--out") {
      const value = raw[index + 1];
      if (typeof value !== "string" || value.length < 1) {
        throw new Error("--out needs a path");
      }
      outPath = value;
      index += 1;
      continue;
    }
    throw new Error(
      "usage: bun run website/sync-webmcp-registry.ts [--max-sites N] [--out PATH]",
    );
  }
  return { maxSites, outPath };
}

if (import.meta.main) {
  const options = parseArguments(process.argv.slice(2));
  const snapshot = await syncWebmcpRegistrySnapshot({ ...options, now: () => new Date() });
  const readOnlyTools = snapshot.sites.reduce((sum, site) => sum + site.readOnlyToolCount, 0);
  const totalTools = snapshot.sites.reduce((sum, site) => sum + site.toolCount, 0);
  process.stdout.write(
    `webmcp registry snapshot: ${String(snapshot.siteCount)} sites, ${String(totalTools)} tools, ${String(readOnlyTools)} read-only → ${options.outPath}\n`,
  );
}
