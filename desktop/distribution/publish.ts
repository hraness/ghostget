import { matchSignedManifest, parseHandoff } from "./handoff.ts";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { authorize, command, environmentAuthority, githubReader } from "./authority.ts";
import { archiveName, assetNames, buildNames, desktopTag, MAX_ARCHIVE_BYTES, MAX_JSON_BYTES, object, positive, regularBytes, REPOSITORY, requireValue, sha256, verifyAttestation, verifyDirectory, version, WORKFLOW, type DesktopManifest } from "./contract.ts";

export type PublicationPorts = Readonly<{
  read: (path: string) => unknown;
  mutate: (method: "POST" | "PATCH", path: string, body: unknown) => unknown;
  upload: (releaseId: number, name: string, bytes: Buffer) => unknown;
  download: (assetId: number, maximum: number) => Promise<Buffer>;
  authorize: () => void;
}>;
const prefix = `repos/${REPOSITORY}`;
export function releaseBody(m: DesktopManifest): string {
  return `ghostget-desktop-release-v1 source=${m.sourceSha} workflow=${WORKFLOW} run=${m.runId} attempt=${m.runAttempt}\n\nDeveloper ID signed, notarized and stapled macOS 14.5+ app for Apple Silicon.\n\nCanonical CLI/SDK: https://github.com/${REPOSITORY}/releases/tag/${m.canonicalTag}\n\nDownload ${m.archive.name}, extract it and move Ghostget.app to Applications. This desktop prerelease does not change the canonical package release or Latest.\n`;
}
function validateRelease(value: unknown, m: DesktopManifest, hashes: Readonly<Record<string, string>>, sizes: Readonly<Record<string, number>>, published: boolean): { release: Record<string, unknown>; assets: { id: number; name: string; bytes: number }[] } {
  const r = object(value); positive(r.id);
  requireValue(r.tag_name === m.desktopTag && r.target_commitish === m.sourceSha && r.body === releaseBody(m)
    && r.prerelease === true && r.draft === !published && object(r.author).id === 41898282 && object(r.author).type === "Bot"
    && (published ? r.immutable === true : r.immutable === false) && Array.isArray(r.assets) && r.assets.length <= 4, "desktop release identity differs; retained history is never overwritten");
  const seen = new Set<string>(), ids = new Set<number>();
  const assets = r.assets.map(raw => {
    const a = object(raw), name = String(a.name), id = positive(a.id);
    requireValue(assetNames(m.canonicalTag).includes(name) && !seen.has(name) && !ids.has(id) && a.state === "uploaded"
      && a.size === sizes[name] && a.digest === `sha256:${hashes[name]}`, "desktop asset identity differs; no clobber is permitted");
    const canonical = `https://github.com/${REPOSITORY}/releases/download/${m.desktopTag}/${name}`;
    const temporary = new RegExp(`^https://github\\.com/hraness/ghostget/releases/download/untagged-[a-f0-9]{20}/${name.replaceAll(".", "\\.")}$`, "u");
    requireValue(a.browser_download_url === canonical || (!published && typeof a.browser_download_url === "string" && temporary.test(a.browser_download_url)), "desktop asset URL differs");
    seen.add(name); ids.add(id); return { id, name, bytes: Number(a.size) };
  });
  if (published) requireValue(assets.length === 4, "published desktop inventory is incomplete");
  return { release: r, assets };
}
export async function publish(directory: string, m: DesktopManifest, hashes: Readonly<Record<string, string>>, ports: PublicationPorts): Promise<void> {
  const files = Object.fromEntries(assetNames(m.canonicalTag).map(name => [name, regularBytes(join(directory, name), name === archiveName(m.canonicalTag) ? MAX_ARCHIVE_BYTES : MAX_JSON_BYTES)]));
  const sizes = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, bytes.length]));
  requireValue(Object.entries(files).every(([name, bytes]) => hashes[name] === sha256(bytes)), "local publication bytes changed");
  ports.authorize(); let found: Record<string, unknown> | undefined; const seen = new Set<number>(); let exhausted = false;
  for (let page = 1; page <= 6; page++) {
    const values = ports.read(`${prefix}/releases?per_page=100&page=${page}`);
    requireValue(Array.isArray(values) && values.length <= 100 && (page <= 5 || values.length === 0), "retained release inventory is truncated");
    for (const raw of values) {
      const r = object(raw), id = positive(r.id); requireValue(!seen.has(id), "duplicate retained release identity"); seen.add(id);
      if (r.tag_name === m.desktopTag) { requireValue(found === undefined, "ambiguous desktop release"); found = r; }
    }
    if (values.length < 100) { exhausted = true; break; }
  }
  requireValue(exhausted, "retained release inventory is incomplete");
  if (found === undefined) {
    ports.authorize(); found = object(ports.mutate("POST", `${prefix}/releases`, { tag_name: m.desktopTag, target_commitish: m.sourceSha,
      name: `Ghostget ${version(m.canonicalTag)} for macOS (Apple Silicon)`, body: releaseBody(m), draft: true, prerelease: true, make_latest: "false" }));
  } else {
    const listedId = positive(found.id); found = object(ports.read(`${prefix}/releases/${listedId}`));
    requireValue(found.id === listedId, "listed desktop release ID changed");
  }
  const id = positive(found.id), originallyPublished = found.draft === false;
  const readback = async (published: boolean): Promise<Record<string, unknown>> => {
    const r = object(ports.read(`${prefix}/releases/${id}`)); requireValue(r.id === id, "desktop release ID changed");
    const checked = validateRelease(r, m, hashes, sizes, published);
    for (const asset of checked.assets) requireValue(sha256(await ports.download(asset.id, asset.bytes)) === hashes[asset.name], "uploaded desktop bytes differ");
    return r;
  };
  let checked = validateRelease(found, m, hashes, sizes, originallyPublished);
  if (!originallyPublished) {
    for (const name of assetNames(m.canonicalTag)) {
      if (checked.assets.some(asset => asset.name === name)) continue;
      ports.authorize(); await readback(false); ports.upload(id, name, files[name]!);
      checked = validateRelease(await readback(false), m, hashes, sizes, false);
    }
    requireValue(checked.assets.length === 4, "desktop draft is incomplete");
    ports.authorize(); await readback(false);
    ports.mutate("PATCH", `${prefix}/releases/${id}`, { draft: false, prerelease: true, make_latest: "false" });
  }
  await readback(true); ports.authorize(); await readback(true);
  // Canonical tag and its exact five assets were rechecked by every authority call.
}

if (import.meta.main) {
  requireValue(process.argv.length === 3, "expected the exact downloaded artifact directory");
  const directory = resolve(process.argv[2]!), a = environmentAuthority(), read = githubReader();
  const { manifest, hashes } = verifyDirectory(directory, a.tag, true);
  requireValue(manifest.sourceSha === a.source && manifest.workflowSha === a.source && manifest.workflowId === a.workflowId && manifest.runId === a.runId && manifest.runAttempt === a.runAttempt, "artifact belongs to another desktop run");
  matchSignedManifest(manifest, parseHandoff(JSON.parse(process.env.DESKTOP_SIGNED_HANDOFF ?? "null")));
  const expected = object(JSON.parse(process.env.DESKTOP_BUILD_HASHES ?? "null"));
  requireValue(isDeepStrictEqual(Object.keys(expected).sort(), buildNames(a.tag).sort()) && buildNames(a.tag).every(name => expected[name] === hashes[name])
    && process.env.DESKTOP_PROVENANCE_SHA256 === hashes["provenance.jsonl"], "artifact handoff differs");
  for (const name of buildNames(a.tag)) {
    const verified: unknown = JSON.parse(command("gh", ["attestation", "verify", join(directory, name), "--repo", REPOSITORY,
      "--signer-workflow", `${REPOSITORY}/${WORKFLOW}`, "--signer-digest", a.source, "--source-digest", a.source,
      "--source-ref", "refs/heads/main", "--deny-self-hosted-runners", "--bundle", join(directory, "provenance.jsonl"), "--format=json"]).toString("utf8"));
    verifyAttestation(verified, manifest, hashes);
  }
  const token = process.env.GH_TOKEN; requireValue(typeof token === "string" && token.length > 0, "publication token is required");
  const ports: PublicationPorts = {
    read, authorize: () => { authorize(a, read); },
    mutate: (method, path, body) => JSON.parse(command("gh", ["api", "--hostname", "github.com", "--method", method, path, "--input", "-"], { input: JSON.stringify(body) }).toString("utf8")),
    upload: (id, name, bytes) => JSON.parse(command("gh", ["api", "--hostname", "github.com", "--method", "POST", `https://uploads.github.com/repos/${REPOSITORY}/releases/${id}/assets?name=${encodeURIComponent(name)}`, "--header", "Content-Type: application/octet-stream", "--input", "-"], { input: bytes, timeout: 180_000 }).toString("utf8")),
    download: async (id, maximum) => {
      let url = `https://api.github.com/repos/${REPOSITORY}/releases/assets/${id}`;
      let response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/octet-stream", "X-GitHub-Api-Version": "2022-11-28" }, redirect: "manual", signal: AbortSignal.timeout(180_000) });
      if (response.status === 302) {
        const next = new URL(response.headers.get("location") ?? ""); await response.body?.cancel();
        requireValue(next.protocol === "https:" && next.hostname === "release-assets.githubusercontent.com" && next.username === "" && next.password === "", "foreign artifact redirect");
        url = next.href; response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(180_000) });
      }
      requireValue(response.status === 200 && response.body !== null, "desktop asset download failed");
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.length; requireValue(size <= maximum, "desktop asset exceeded exact bound"); chunks.push(next.value); } } finally { await reader.cancel(); }
      requireValue(size === maximum, "desktop asset length differs"); return Buffer.concat(chunks);
    },
  };
  await publish(directory, manifest, hashes, ports);
  console.log(`Verified immutable desktop prerelease: https://github.com/${REPOSITORY}/releases/tag/${desktopTag(a.tag)}`);
}
