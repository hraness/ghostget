import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { verifyPackArtifact } from "./npm-package-identity.js";
import { exactReleaseWorkflowRun, releaseWorkflowRunIdFromPublishedRelease } from "./release-provider-outcome.mjs";
import {
  GITHUB_RELEASE_REPOSITORY,
  GITHUB_RELEASE_REPOSITORY_ID,
  GITHUB_RELEASE_WORKFLOW,
  parseReleaseAssetDescriptors,
  parseReleaseManifest,
  releaseAssetNames,
  releaseVersion,
  verifyAttestationResult,
  verifyReleaseAssetBytes,
  type ReleaseManifest,
} from "../website/github-release-artifact.mjs";

const maximumBytes = 8 * 1024 * 1024;
const maximumJsonBytes = 1024 * 1024;
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function regularBytes(path: string, maximum = maximumBytes): Promise<Buffer> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0 || metadata.size > maximum) {
    throw new Error("Release artifact must be a bounded nonempty regular file");
  }
  const bytes = await readFile(path);
  if (bytes.byteLength !== metadata.size) throw new Error("Release artifact changed during read");
  return bytes;
}

async function regularDirectory(directory: string): Promise<void> {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Canonical release directory must be an ordinary directory");
}

export async function prepareReleaseDirectory(
  directory: string,
  input: Omit<ReleaseManifest, "schema" | "repository" | "repositoryId" | "package" | "version" | "workflow" | "archive">,
): Promise<ReleaseManifest> {
  await regularDirectory(directory);
  const version = releaseVersion(input.tag);
  const archiveName = releaseAssetNames(input.tag)[0] as string;
  const entries = await readdir(directory);
  if (entries.sort().join(",") !== [archiveName, "npm-pack.json"].sort().join(",")) {
    throw new Error("Preparation requires only the exact archive and packing receipt");
  }
  const archive = await regularBytes(join(directory, archiveName));
  await regularBytes(join(directory, "npm-pack.json"), maximumJsonBytes);
  await verifyPackArtifact(join(directory, archiveName), join(directory, "npm-pack.json"), "@hraness/wrench", version, "Canonical GitHub");
  const manifest = parseReleaseManifest({
    schema: "hraness-github-release-v1", repository: GITHUB_RELEASE_REPOSITORY,
    repositoryId: GITHUB_RELEASE_REPOSITORY_ID, package: "@hraness/wrench",
    version, workflow: GITHUB_RELEASE_WORKFLOW, ...input,
    archive: { name: archiveName, bytes: archive.byteLength, sha256: sha256(archive), sha512: createHash("sha512").update(archive).digest("hex") },
  });
  await writeFile(join(directory, "release-manifest.json"), `${JSON.stringify(manifest)}\n`, { flag: "wx", mode: 0o600 });
  const checksums = await Promise.all(releaseAssetNames(input.tag).slice(0, 3).map(async name =>
    `${sha256(await regularBytes(join(directory, name)))}  ${name}\n`));
  await writeFile(join(directory, "SHA256SUMS"), checksums.join(""), { flag: "wx", mode: 0o600 });
  return manifest;
}

export function attestationVerifyArguments(directory: string, manifest: ReleaseManifest, name: string): string[] {
  if (!releaseAssetNames(manifest.tag).slice(0, 4).includes(name)) throw new Error("Unexpected attested filename");
  return ["attestation", "verify", join(directory, name), "--repo", GITHUB_RELEASE_REPOSITORY,
    "--signer-workflow", `${GITHUB_RELEASE_REPOSITORY}/${GITHUB_RELEASE_WORKFLOW}`,
    "--signer-digest", manifest.sourceSha, "--source-digest", manifest.sourceSha,
    "--source-ref", `refs/tags/${manifest.tag}`, "--deny-self-hosted-runners",
    "--bundle", join(directory, "provenance.jsonl"), "--format=json"];
}

export async function verifyBuildHandoff(directory: string, tag: string, hashesValue: unknown, bundleHash: unknown): Promise<void> {
  await regularDirectory(directory);
  const names = releaseAssetNames(tag).slice(0, 4);
  if (hashesValue === null || typeof hashesValue !== "object" || Array.isArray(hashesValue)
    || Object.keys(hashesValue).sort().join(",") !== [...names].sort().join(",")
    || typeof bundleHash !== "string" || !/^[a-f0-9]{64}$/u.test(bundleHash)) throw new Error("Trusted build handoff is malformed");
  const hashes = hashesValue as Record<string, unknown>;
  for (const name of [...names, "provenance.jsonl"]) {
    const expected = name === "provenance.jsonl" ? bundleHash : hashes[name];
    if (typeof expected !== "string" || !/^[a-f0-9]{64}$/u.test(expected)
      || sha256(await regularBytes(join(directory, name))) !== expected) throw new Error("Publication handoff differs from verified build or attester outputs");
  }
}

export function runReadOnlyGh(arguments_: readonly string[]): string {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key, value]) =>
    !key.startsWith("WRENCH_RELEASE_APP_") && value !== undefined));
  const result = spawnSync("gh", arguments_, { encoding: "utf8", env: environment,
    timeout: 60_000, maxBuffer: maximumBytes, stdio: ["ignore", "pipe", "pipe"] });
  if (result.error !== undefined || result.status !== 0) throw new Error("Bounded read-only GitHub artifact verification failed");
  return result.stdout;
}

export async function verifyReleaseDirectory(
  directory: string,
  expected: Partial<ReleaseManifest>,
  runGh: (args: readonly string[]) => string = runReadOnlyGh,
): Promise<ReleaseManifest> {
  await regularDirectory(directory);
  const manifest = parseReleaseManifest(JSON.parse((await regularBytes(join(directory, "release-manifest.json"), maximumJsonBytes)).toString("utf8")) as unknown, expected);
  const names = releaseAssetNames(manifest.tag);
  if ((await readdir(directory)).sort().join(",") !== [...names].sort().join(",")) {
    throw new Error("Release directory must contain exactly the five canonical files");
  }
  const files = new Map(await Promise.all(names.map(async name => [name, await regularBytes(join(directory, name))] as const)));
  const archive = files.get(manifest.archive.name) as Buffer;
  if (archive.byteLength !== manifest.archive.bytes || sha256(archive) !== manifest.archive.sha256
    || createHash("sha512").update(archive).digest("hex") !== manifest.archive.sha512) {
    throw new Error("Canonical archive differs from the release manifest");
  }
  const checksums = names.slice(0, 3).map(name => `${sha256(files.get(name) as Buffer)}  ${name}\n`).join("");
  if ((files.get("SHA256SUMS") as Buffer).toString("utf8") !== checksums) throw new Error("Canonical release checksum inventory differs");
  for (const name of names.slice(0, 4)) {
    const verified: unknown = JSON.parse(runGh(attestationVerifyArguments(directory, manifest, name)));
    verifyAttestationResult(verified, manifest, name, sha256(files.get(name) as Buffer));
  }
  await verifyPackArtifact(join(directory, manifest.archive.name), join(directory, "npm-pack.json"), "@hraness/wrench", manifest.version, "Canonical GitHub");
  return manifest;
}

export async function downloadReleaseDirectory(
  directory: string,
  releaseValue: unknown,
  expected: Partial<ReleaseManifest> & { tag: string; sourceSha: string },
  fetchImplementation: typeof fetch = fetch,
  runGh: (args: readonly string[]) => string = runReadOnlyGh,
): Promise<ReleaseManifest> {
  if (releaseValue === null || typeof releaseValue !== "object" || Array.isArray(releaseValue)) throw new Error("Release must be an object");
  const release = releaseValue as Record<string, unknown>;
  if (release.tag_name !== expected.tag || release.target_commitish !== expected.sourceSha
    || release.draft !== false || release.prerelease !== false || release.immutable !== true) {
    throw new Error("Canonical artifact requires the exact published immutable release");
  }
  const assets = parseReleaseAssetDescriptors(release.assets, expected.tag);
  const runId = releaseWorkflowRunIdFromPublishedRelease({ repository: GITHUB_RELEASE_REPOSITORY,
    value: release, verifiedSha: expected.sourceSha, verifiedTag: expected.tag });
  await mkdir(directory, { recursive: false, mode: 0o700 });
  for (const asset of assets) {
    const response = await fetchImplementation(asset.url, { signal: AbortSignal.timeout(30_000), redirect: "follow" });
    const url = new URL(response.url);
    if (response.status !== 200 || url.protocol !== "https:" || url.username !== "" || url.password !== ""
      || !["github.com", "release-assets.githubusercontent.com"].includes(url.hostname) || response.body === null) {
      await response.body?.cancel(); throw new Error("Canonical GitHub asset download failed closed");
    }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > asset.bytes) throw new Error("Canonical GitHub asset exceeded its exact byte bound");
        chunks.push(next.value);
      }
    } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks); verifyReleaseAssetBytes(bytes, asset);
    await writeFile(join(directory, asset.name), bytes, { flag: "wx", mode: 0o600 });
  }
  const manifest = await verifyReleaseDirectory(directory, { ...expected, runId: Number(runId) }, runGh);
  exactReleaseWorkflowRun({ repository: GITHUB_RELEASE_REPOSITORY,
    value: JSON.parse(runGh(["api", `repos/${GITHUB_RELEASE_REPOSITORY}/actions/runs/${runId}/attempts/${manifest.runAttempt}`])),
    verifiedSha: expected.sourceSha, verifiedTag: expected.tag, workflowRunId: runId,
    expectedRunAttempt: String(manifest.runAttempt) });
  return manifest;
}

if (import.meta.main) {
  const [mode, directoryValue, ...extra] = process.argv.slice(2);
  if (directoryValue === undefined || extra.length !== 0 || !["prepare", "verify", "download"].includes(mode ?? "")) {
    throw new Error("Usage: github-release-artifact.ts prepare|verify|download <exact-directory>");
  }
  const directory = resolve(directoryValue);
  const expected = { tag: process.env.VERIFIED_TAG ?? "", sourceSha: process.env.VERIFIED_SHA ?? "" };
  let manifest: ReleaseManifest;
  if (mode === "prepare") {
    manifest = await prepareReleaseDirectory(directory, { ...expected, workflowSha: process.env.WORKFLOW_SHA ?? "", runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) });
  } else if (mode === "download") {
    const release: unknown = JSON.parse(runReadOnlyGh(["api", `repos/${GITHUB_RELEASE_REPOSITORY}/releases/tags/${expected.tag}`]));
    manifest = await downloadReleaseDirectory(directory, release, expected);
  } else {
    manifest = await verifyReleaseDirectory(directory, { ...expected, workflowSha: process.env.WORKFLOW_SHA ?? "", runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT) });
  }
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}
