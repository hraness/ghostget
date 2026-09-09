import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { verifyBuildHandoff, verifyReleaseDirectory } from "./github-release-artifact.js";
import { parseReleaseAssetDescriptors, releaseAssetNames, verifyReleaseAssetBytes, type ReleaseManifest, type ReleaseAssetDescriptor } from "../website/github-release-artifact.mjs";
import {
  assertReleaseTagNewerThanPublished, exactLatestPredecessor, exactWorkflowPublishedRelease,
  parseOptionalIncludedGitHubResponse, releaseSourceReceipt, requireLatestRelease,
  waitForLatestRelease, revalidateLatestReleaseProjection,
} from "./release-provider-outcome.mjs";

const repository = "hraness/wrench";
const prefix = `/repos/${repository}`;
type CommandResult = { status: number; stdout: string };
type Runner = (args: readonly string[], input?: string) => CommandResult;
type AssetDownloader = (id: number, expectedBytes: number) => Uint8Array;
function downloadAsset(id: number, expectedBytes: number): Uint8Array {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(expectedBytes)
    || expectedBytes <= 0 || expectedBytes > 8 * 1024 * 1024) throw new Error("Release asset download is outside its admitted bound");
  const result = spawnSync("gh", ["api", "--method", "GET", `${prefix}/releases/assets/${id}`,
    "-H", "Accept: application/octet-stream"], {
    timeout: 120_000, maxBuffer: expectedBytes + 1,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("WRENCH_RELEASE_APP_"))),
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error !== undefined || result.status !== 0) throw new Error("Bounded release asset download did not complete");
  return result.stdout;
}
function command(args: readonly string[], input?: string): CommandResult {
  const result = spawnSync(args[0]!, args.slice(1), {
    encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("WRENCH_RELEASE_APP_"))),
    input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (result.error !== undefined || result.status === null) throw new Error("Bounded GitHub publication command did not complete");
  return { status: result.status, stdout: result.stdout };
}
function successful(run: Runner, args: readonly string[], input?: string): string {
  const result = run(args, input);
  if (result.status !== 0) throw new Error("GitHub publication command failed; preserve the draft and diagnose");
  return result.stdout;
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Release response is not an object");
  return value as Record<string, unknown>;
}

async function discoverRetainedRelease(get: (endpoint: string) => Promise<unknown>, tag: string): Promise<Record<string, unknown> | undefined> {
  // GitHub's by-tag endpoint can return 404 for an existing authenticated draft.
  // Exhaust the same 500-release inventory and empty sentinel used by ordering.
  const ids = new Set<number>(); let targetId: number | undefined; let exhausted = false;
  for (let page = 1; page <= 6; page += 1) {
    const releases = await get(`${prefix}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases) || releases.length > 100
      || ((page === 6 || exhausted) && releases.length !== 0)) {
      throw new Error("Retained release inventory is incomplete or exceeds its bound");
    }
    for (const raw of releases) {
      const release = object(raw); const id = release.id;
      if (!Number.isSafeInteger(id) || Number(id) <= 0 || ids.has(Number(id))
        || typeof release.tag_name !== "string" || typeof release.draft !== "boolean") {
        throw new Error("Retained release inventory has ambiguous identity");
      }
      ids.add(Number(id));
      if (release.tag_name === tag) {
        if (targetId !== undefined) throw new Error("Multiple retained releases claim the exact tag");
        targetId = Number(id);
      }
    }
    if (releases.length < 100) exhausted = true;
  }
  if (targetId === undefined) return undefined;
  const release = object(await get(`${prefix}/releases/${targetId}`));
  if (release.id !== targetId || release.tag_name !== tag) throw new Error("Retained release identity changed on readback");
  return release;
}

export function validateReleaseAssets(releaseValue: unknown, manifest: ReleaseManifest, directory: string): {
  missing: string[]; descriptors: readonly ReleaseAssetDescriptor[];
} {
  const release = object(releaseValue); const value = release.assets;
  if (typeof release.draft !== "boolean") throw new Error("Release asset admission requires an exact draft state");
  if (!Array.isArray(value) || value.length > 5) throw new Error("Draft assets exceed the exact inventory");
  const names = releaseAssetNames(manifest.tag); const found = new Set<string>(); const ids = new Set<number>();
  const descriptors: ReleaseAssetDescriptor[] = [];
  for (const raw of value) {
    const asset = object(raw); const name = asset.name;
    if (typeof name !== "string" || !names.includes(name) || found.has(name)
      || !Number.isSafeInteger(asset.id) || Number(asset.id) <= 0 || ids.has(Number(asset.id))
      || asset.state !== "uploaded") throw new Error("Draft contains an unexpected or incomplete asset; no replacement is permitted");
    const canonicalUrl = `https://github.com/${repository}/releases/download/${manifest.tag}/${name}`;
    const temporaryPrefix = `https://github.com/${repository}/releases/download/`;
    // GitHub exposes this temporary URL only while an uploaded asset is a draft.
    // Downloads remain authenticated requests to the exact numeric asset endpoint.
    const temporaryPath = typeof asset.browser_download_url === "string" && asset.browser_download_url.startsWith(temporaryPrefix)
      ? asset.browser_download_url.slice(temporaryPrefix.length) : "";
    const temporaryMatch = /^untagged-[0-9a-f]{20}\/([^/]+)$/u.exec(temporaryPath);
    const temporaryUrl = release.draft === true && temporaryMatch?.[1] === name;
    const bytes = readFileSync(join(directory, name));
    if (!Number.isSafeInteger(asset.size) || Number(asset.size) <= 0 || Number(asset.size) > 8 * 1024 * 1024
      || asset.size !== bytes.length || asset.digest !== `sha256:${createHash("sha256").update(bytes).digest("hex")}`
      || asset.url !== `https://api.github.com${prefix}/releases/assets/${asset.id}`
      || (asset.browser_download_url !== canonicalUrl && !temporaryUrl)) {
      throw new Error("Draft asset differs from the already verified canonical bytes; preserve it for diagnosis");
    }
    found.add(name); ids.add(Number(asset.id));
    descriptors.push({ id: Number(asset.id), name, bytes: bytes.length,
      sha256: String(asset.digest).slice(7), url: String(asset.browser_download_url) });
  }
  return { missing: names.filter(name => !found.has(name)), descriptors };
}

export async function publishCanonicalRelease(directory: string, manifest: ReleaseManifest, run: Runner = command, download: AssetDownloader = downloadAsset): Promise<void> {
  const get = async (endpoint: string): Promise<unknown> => JSON.parse(successful(run, ["gh", "api", "--method", "GET", endpoint]));
  const api = { get };
  const coordinates = { repository, verifiedSha: manifest.sourceSha, verifiedTag: manifest.tag, workflowRunId: String(manifest.runId) };
  const receipt = releaseSourceReceipt(coordinates);
  const body = `${receipt}\n\nwrench-release-attempt-v1 run_attempt=${manifest.runAttempt}`;
  const endpoint = `${prefix}/releases/tags/${manifest.tag}`;
  const lookup = run(["gh", "api", "--include", endpoint]);
  const response = parseOptionalIncludedGitHubResponse(lookup.stdout, "exact canonical release lookup");
  if (lookup.status !== (response.found ? 0 : 1)) throw new Error("Release lookup status is not exact");
  let release: Record<string, unknown> | undefined = response.found
    ? object(response.value) : await discoverRetainedRelease(get, manifest.tag);
  const verifyRemoteBytes = (value: Record<string, unknown>): void => {
    const admitted = validateReleaseAssets(value, manifest, directory);
    if (admitted.missing.length !== 0) throw new Error("Remote byte proof requires all canonical assets");
    const descriptors = value.draft === true ? admitted.descriptors : parseReleaseAssetDescriptors(value.assets, manifest.tag);
    for (const asset of descriptors) verifyReleaseAssetBytes(download(asset.id, asset.bytes), asset);
  };
  const authority = async (phase: "prewrite" | "postwrite"): Promise<void> => {
    const main = object(object(await get(`${prefix}/git/ref/heads/main`)).object).sha;
    if (typeof main !== "string" || !/^[a-f0-9]{40}$/u.test(main)) throw new Error("Current main is not exact");
    const actual = successful(run, ["node", "--experimental-strip-types", "./scripts/release-ref-authority.ts",
      `publication-${phase}`, manifest.tag, manifest.sourceSha, main]).trimEnd();
    if (actual !== `sha=${manifest.sourceSha}\ntag=${manifest.tag}\nmain_sha=${main}`) throw new Error("Publication authority receipt is not exact");
  };
  if (release !== undefined && release.draft === false) {
    exactWorkflowPublishedRelease({ ...coordinates, value: release });
    if (release.body !== body) throw new Error("Published release belongs to another attempt; do not relabel or rebuild it");
    if (validateReleaseAssets(release, manifest, directory).missing.length !== 0) throw new Error("Published release omits canonical assets");
    verifyRemoteBytes(release);
    await authority("prewrite");
    await requireLatestRelease({ api, repository, targetRelease: release, verifiedTag: manifest.tag });
    await authority("postwrite");
    return;
  }
  await assertReleaseTagNewerThanPublished({ api, repository, verifiedTag: manifest.tag });
  const predecessor = await get(`${prefix}/releases/latest`);
  exactLatestPredecessor(predecessor, manifest.tag);
  const mutate = (method: "POST" | "PATCH", path: string, value: unknown): Record<string, unknown> => object(JSON.parse(successful(run,
    ["gh", "api", "--method", method, path, "--input", "-"], JSON.stringify(value))));
  const validateDraft = (value: Record<string, unknown>): void => {
    const author = object(value.author);
    if (!Number.isSafeInteger(value.id) || Number(value.id) <= 0 || value.draft !== true || value.prerelease !== false
      || value.immutable === true || value.tag_name !== manifest.tag || value.target_commitish !== manifest.sourceSha
      || value.name !== `Wrench ${manifest.tag}` || value.body !== body || author.id !== 41898282 || author.type !== "Bot") {
      throw new Error("Existing draft is not this exact verified run attempt; preserve it for diagnosis");
    }
  };
  await authority("prewrite");
  if (release === undefined) release = mutate("POST", `${prefix}/releases`, {
    tag_name: manifest.tag, target_commitish: manifest.sourceSha, name: `Wrench ${manifest.tag}`,
    body, draft: true, prerelease: false, make_latest: "false",
  });
  validateDraft(release);
  const draftId = release.id;
  const readDraft = async (): Promise<Record<string, unknown>> => {
    const value = object(await get(`${prefix}/releases/${draftId}`));
    validateDraft(value);
    if (value.id !== draftId) throw new Error("Draft readback differs from the retained release identity");
    return value;
  };
  for (const name of validateReleaseAssets(release, manifest, directory).missing) {
    await authority("prewrite");
    successful(run, ["gh", "release", "upload", manifest.tag, join(directory, name), "--repo", repository]);
    const readback = await readDraft();
    validateReleaseAssets(readback, manifest, directory);
  }
  release = await readDraft();
  if (validateReleaseAssets(release, manifest, directory).missing.length !== 0) throw new Error("Draft is incomplete");
  verifyRemoteBytes(release);
  await assertReleaseTagNewerThanPublished({ api, repository, verifiedTag: manifest.tag });
  await authority("prewrite");
  const published = mutate("PATCH", `${prefix}/releases/${draftId}`, { draft: false, make_latest: "true" });
  exactWorkflowPublishedRelease({ ...coordinates, value: published });
  if (published.id !== draftId || validateReleaseAssets(published, manifest, directory).missing.length !== 0) throw new Error("Published identity or asset bytes differ from the exact draft");
  const readback = object(await get(endpoint));
  exactWorkflowPublishedRelease({ ...coordinates, value: readback });
  if (readback.id !== draftId || readback.published_at !== published.published_at
    || validateReleaseAssets(readback, manifest, directory).missing.length !== 0) throw new Error("Immutable publication readback differs");
  verifyRemoteBytes(readback);
  await waitForLatestRelease({ api, predecessorRelease: predecessor, repository, targetRelease: readback, verifiedTag: manifest.tag });
  await authority("postwrite");
  await revalidateLatestReleaseProjection({ api, repository, targetRelease: readback, verifiedTag: manifest.tag });
}

if (import.meta.main) {
  const [directoryValue, ...extra] = process.argv.slice(2);
  if (directoryValue === undefined || extra.length !== 0) throw new Error("Usage: github-release-publish.ts <verified-directory>");
  const directory = resolve(directoryValue);
  await verifyBuildHandoff(directory, process.env.VERIFIED_TAG ?? "",
    JSON.parse(process.env.EXPECTED_ARTIFACT_HASHES ?? "null") as unknown, process.env.EXPECTED_BUNDLE_SHA256);
  const manifest = await verifyReleaseDirectory(directory, { sourceSha: process.env.VERIFIED_SHA ?? "", tag: process.env.VERIFIED_TAG ?? "", workflowSha: process.env.WORKFLOW_SHA ?? "",
    runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) });
  await publishCanonicalRelease(directory, manifest);
}
