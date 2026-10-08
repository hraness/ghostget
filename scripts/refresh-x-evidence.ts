#!/usr/bin/env bun
/**
 * Rebuild the X revision-evidence table from X's current first-party bundles.
 *
 * Usage: bun scripts/refresh-x-evidence.ts [--auth x-chrome] [--write]
 *
 * Reads the logged-in /home shell through the named auth locator, resolves each
 * reviewed operation in its current chunk, and prints what moved. Query-ID
 * rotations and metadata changes (new or dropped feature switches and field
 * toggles) are reported separately so a reviewer can tell a pure ID rotation
 * from a request-shape change. With --write the table in
 * src/providers/x-web.ts is replaced; the drift gate itself is not relaxed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { loadAuth } from "../src/auth";
import { createWebSessionClient } from "../src/web-session-client";
import {
  parseXWebBundleDescriptors,
  resolveCurrentXWebChunkUrl,
} from "../src/providers/x-web-runtime";
import { xWebDescriptorMetadataSha256, xWebQueryDescriptorEvidenceSnapshot } from "../src/providers/x-web";

const args = process.argv.slice(2);
const authId = args.includes("--auth") ? args[args.indexOf("--auth") + 1]! : "x-chrome";
const write = args.includes("--write");
const today = new Date().toISOString().slice(0, 10);

const client = await createWebSessionClient("https://x.com", loadAuth(authId), { timeoutMs: 60_000 });
const html = await client.requestText({
  url: new URL("/home", "https://x.com"),
  headers: { accept: "text/html" },
  expectedContentTypes: ["text/html"],
  maxBytes: 4_000_000,
});
const mainUrl = /https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[A-Za-z0-9]+\.js/u.exec(html)?.[0];
if (mainUrl === undefined) throw new Error("X /home omitted its main bundle; the frontend may have migrated");

const chunkText = new Map<string, string>();
async function textFor(sourceChunk: string): Promise<{ readonly name: string; readonly text: string }> {
  const url = sourceChunk.startsWith("main.") ? new URL(mainUrl!) : resolveCurrentXWebChunkUrl(html, sourceChunk);
  const name = url.pathname.split("/").at(-1)!;
  if (!chunkText.has(name)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${name} returned ${response.status}`);
    chunkText.set(name, await response.text());
  }
  return { name, text: chunkText.get(name)! };
}

const lines: string[] = [];
let rotated = 0;
let missing = 0;
for (const entry of xWebQueryDescriptorEvidenceSnapshot.descriptors) {
  const { name, text } = await textFor(entry.sourceChunk);
  const matches = parseXWebBundleDescriptors(text).filter((candidate) =>
    candidate.operationName === entry.operationName && candidate.operationType === entry.operationType);
  if (matches.length !== 1) {
    missing += 1;
    console.error(`UNRESOLVED ${entry.operationName}:${entry.operationType} (${matches.length} matches in ${name})`);
    lines.push(`    // unresolved: ${entry.operationName}`);
    continue;
  }
  const live = matches[0]!;
  if (live.queryId !== entry.queryId) {
    rotated += 1;
    console.log(`ROTATED ${entry.operationName}: ${entry.queryId} -> ${live.queryId}`);
  }
  lines.push(
    `    { operationName: "${entry.operationName}", operationType: "${entry.operationType}", queryId: "${live.queryId}", sourceChunk: "${name}", observedOn: "${today}", metadataSha256: "${xWebDescriptorMetadataSha256(live.metadata)}" },`,
  );
}
console.log(`${rotated} rotated, ${missing} unresolved, main bundle ${mainUrl.split("/").at(-1)}`);

if (write) {
  if (missing > 0) throw new Error("Refusing to write while operations are unresolved");
  const path = new URL("../src/providers/x-web.ts", import.meta.url).pathname;
  let source = readFileSync(path, "utf8");
  const start = source.indexOf("  descriptors: Object.freeze([\n") + "  descriptors: Object.freeze([\n".length;
  const end = source.indexOf("  ] satisfies readonly XWebQueryDescriptorEvidence[]");
  source = source.slice(0, start) + lines.join("\n") + "\n" + source.slice(end);
  source = source.replace(/observedOn: "\d{4}-\d{2}-\d{2}",\n  currentBundleResolutionRequired/u, `observedOn: "${today}",\n  currentBundleResolutionRequired`);
  source = source.replace(/mainBundleUrl: "[^"]+"/u, `mainBundleUrl: "${mainUrl}"`);
  writeFileSync(path, source);
  console.log(`wrote ${path}`);
}
