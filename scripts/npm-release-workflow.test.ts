import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import {
  inspectPackageArtifact,
  type PackageArtifactInventory,
} from "./package-artifact.js";
import {
  MAX_PACKAGE_TAR_BYTES,
  MAX_PACKED_BYTES,
  MAX_PACKED_ENTRIES,
  MAX_PACKED_FILES,
  MAX_UNPACKED_BYTES,
  packageArtifactBudget,
  repairPackageMeasurement,
} from "./package-budget.js";
import { verifyNpmPackageIdentity } from "./npm-package-identity.js";
import {
  verifyNpmProvenanceIdentity,
  type NpmProvenanceIdentityInput,
} from "./npm-provenance-identity.js";
import {
  assertReleaseTagNewerThanPublished,
  CANONICAL_RELEASE_JOBS,
  GHOSTGET_REPOSITORY_ID,
  exactReleaseWorkflowRun,
  MAX_INTERMEDIATE_RELEASE_ATTEMPTS,
  parseIncludedGitHubResponse,
  exactWorkflowPublishedRelease,
  releaseWorkflowRunIdFromPublishedRelease,
  releaseSourceReceipt,
} from "./release-provider-outcome.mjs";

import { releaseIdentity } from "../website/github-release-artifact.mjs";
import { releaseBody, releaseNotesSha256 } from "../website/release-notes.mjs";
import { assertAsyncProperty, assertProperty, fc } from "../src/test-support.js";

const ciWorkflowUrl = new URL("../.github/workflows/ci.yml", import.meta.url);
const releaseWorkflowUrl = new URL("../.github/workflows/release.yml", import.meta.url);
const codeownersUrl = new URL("../.github/CODEOWNERS", import.meta.url);
const workflowsUrl = new URL("../.github/workflows/", import.meta.url);
const providerOutcomeHelperUrl = new URL("./release-provider-outcome.mjs", import.meta.url);
const manifestUrl = new URL("../package.json", import.meta.url);
const packageSmokeUrl = new URL("./package-smoke.ts", import.meta.url);
const standaloneSmokeUrl = new URL("./standalone-smoke.ts", import.meta.url);
const packageArtifactUrl = new URL("./package-artifact.ts", import.meta.url);
const packageBudgetUrl = new URL("./package-budget.ts", import.meta.url);
const packageIdentityUrl = new URL("./npm-package-identity.ts", import.meta.url);
const tsconfigUrl = new URL("../tsconfig.json", import.meta.url);
const publishingGuideUrl = new URL("../docs/publishing.md", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const changelogUrl = new URL("../CHANGELOG.md", import.meta.url);
const skillInstallGuideUrl = new URL("../skills/ghostget/references/install.md", import.meta.url);
const npmRegistry = "https://registry.npmjs.org";
const repository = fileURLToPath(new URL("../", import.meta.url));
const publicExportKeys = Object.freeze([
  ".",
  "./client",
  "./beeper",
  "./apple-photos",
  "./whatsapp",
  "./omni",
  "./messaging",
  "./messaging-automation",
  "./contracts",
]);
const publicImportSpecifiers = Object.freeze([
  "@hraness/ghostget",
  "@hraness/ghostget/client",
  "@hraness/ghostget/beeper",
  "@hraness/ghostget/apple-photos",
  "@hraness/ghostget/whatsapp",
  "@hraness/ghostget/omni",
  "@hraness/ghostget/messaging",
  "@hraness/ghostget/messaging-automation",
  "@hraness/ghostget/contracts",
]);
const publicDistEntrypoints = Object.freeze([
  "dist/index.js",
  "dist/client.js",
  "dist/beeper-client.js",
  "dist/apple-photos-client.js",
  "dist/whatsapp-client.js",
  "dist/omni-client.js",
  "dist/messaging.js",
  "dist/messaging-automation-api.js",
  "dist/contracts.js",
]);

function workflowStepScript(workflow: string, name: string): string {
  const stepMarker = `      - name: ${name}\n`;
  const stepStart = workflow.indexOf(stepMarker);
  if (stepStart < 0) throw new Error(`Workflow step not found: ${name}`);
  const runMarker = "        run: |\n";
  const runStart = workflow.indexOf(runMarker, stepStart);
  if (runStart < 0) throw new Error(`Workflow step has no run script: ${name}`);
  const lines = workflow.slice(runStart + runMarker.length).split("\n");
  const script: string[] = [];
  for (const line of lines) {
    if (line.length === 0) {
      script.push("");
      continue;
    }
    if (!line.startsWith("          ")) break;
    script.push(line.slice(10));
  }
  return script.join("\n");
}

async function runWorkflowScript(
  script: string,
  environment: Readonly<Record<string, string>>,
  cwd = repository,
): Promise<Readonly<{ exitCode: number; stderr: string; stdout: string }>> {
  const child = Bun.spawn(["/bin/bash", "-c", script], {
    cwd,
    env: { ...process.env, ...environment },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  return Object.freeze({ exitCode, stderr, stdout });
}

async function run(command: readonly string[], cwd: string): Promise<void> {
  const child = Bun.spawn([...command], { cwd, stderr: "pipe", stdout: "pipe" });
  const [exitCode, stderr, stdout] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Command failed (${String(exitCode)}): ${command.join(" ")}\n${stdout}${stderr}`,
    );
  }
}

function sha1(bytes: Uint8Array): string {
  return createHash("sha1").update(bytes).digest("hex");
}

function integrity(bytes: Uint8Array): string {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

function packJson(
  bytes: Uint8Array,
  inventory: PackageArtifactInventory,
  name: string,
  version: string,
  reverseFiles = false,
): string {
  const files = reverseFiles ? [...inventory.files].reverse() : inventory.files;
  return `${JSON.stringify([{
    bundled: [],
    entryCount: inventory.fileCount,
    filename: `hraness-ghostget-${version}.tgz`,
    files: files.map((file) => ({
      mode: file.mode,
      path: file.path,
      size: file.size,
    })),
    id: `${name}@${version}`,
    integrity: integrity(bytes),
    name,
    shasum: sha1(bytes),
    size: bytes.byteLength,
    unpackedSize: inventory.unpackedBytes,
    version,
  }], null, 2)}\n`;
}

function registryView(
  bytes: Uint8Array,
  inventory: PackageArtifactInventory,
  name: string,
  version: string,
): string {
  return `${JSON.stringify({
    dist: {
      attestations: {
        provenance: { predicateType: "https://slsa.dev/provenance/v1" },
        url: `${npmRegistry}/-/npm/v1/attestations/${encodeURIComponent(name)}@${version}`,
      },
      fileCount: inventory.fileCount,
      integrity: integrity(bytes),
      shasum: sha1(bytes),
      signatures: [{
        keyid: "SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U",
        sig: "MEUCIQD0ZXN0LXNpZ25hdHVyZS1ieXRlcy1mb3Itd29ya2Zsb3cCIQDjZXN0LXNpZ25hdHVyZS1ieXRlcy1mb3Itd29ya2Zsb3c=",
      }],
      tarball: `${npmRegistry}/${name}/-/ghostget-${version}.tgz`,
      unpackedSize: inventory.unpackedBytes,
    },
    name,
    version,
  }, null, 2)}\n`;
}

function readTarOctal(tar: Buffer, offset: number): number {
  const value = tar.subarray(offset, offset + 12).toString("ascii").replace(/\0.*$/u, "").trim();
  return Number.parseInt(value, 8);
}

function firstRegularHeader(tar: Buffer): Readonly<{ offset: number; size: number }> {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = readTarOctal(tar, offset + 124);
    const type = tar[offset + 156] ?? 0;
    if ((type === 0 || type === 48) && size > 0) return Object.freeze({ offset, size });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error("Test package contains no non-empty regular file");
}

function exactTarEntry(
  tar: Buffer,
  expectedPath: string,
): Readonly<{ dataOffset: number; headerOffset: number; size: number }> {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start: number, length: number) => {
      const bytes = header.subarray(start, start + length);
      const zero = bytes.indexOf(0);
      return (zero < 0 ? bytes : bytes.subarray(0, zero)).toString("utf8");
    };
    const name = text(0, 100);
    const prefix = text(345, 155);
    const path = prefix === "" ? name : `${prefix}/${name}`;
    const size = readTarOctal(tar, offset + 124);
    if (path === expectedPath) {
      return Object.freeze({ dataOffset: offset + 512, headerOffset: offset, size });
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Test package has no ${expectedPath} entry`);
}

function writeHeaderChecksum(tar: Buffer, offset: number): void {
  tar.fill(32, offset + 148, offset + 156);
  let checksum = 0;
  for (let index = offset; index < offset + 512; index += 1) checksum += tar[index] ?? 0;
  const field = `${checksum.toString(8).padStart(6, "0")}\0 `;
  tar.write(field, offset + 148, 8, "ascii");
}


const providerRepository = "hraness/ghostget";
const providerPreviousSha = "1".repeat(40);
const providerVerifiedSha = "2".repeat(40);
const providerTag = "v0.16.2";
const providerServerDate = "2026-08-29T15:01:00.000Z";
const providerReleasePublishedAt = "2026-08-29T14:00:00Z";
const providerReleaseWorkflowRunId = "88001";

type ProviderJson = null | boolean | number | string | readonly ProviderJson[] | {
  readonly [key: string]: ProviderJson;
};

function providerRef(sha: string, branch = "main"): ProviderJson {
  return { object: { sha, type: "commit" }, ref: `refs/heads/${branch}` };
}

function providerRelease(overrides: Readonly<Record<string, ProviderJson>> = {}): ProviderJson {
  const receipt = releaseSourceReceipt({
    repository: providerRepository,
    verifiedSha: providerVerifiedSha,
    verifiedTag: providerTag,
    workflowRunId: providerReleaseWorkflowRunId,
  });
  return {
    assets: [],
    author: { id: 41898282, login: "github-actions[bot]", type: "Bot" },
    body: `${receipt}\n\n## What's Changed\nGenerated notes are not authority.`,
    draft: false,
    id: 10,
    immutable: true,
    name: `Ghostget ${providerTag}`,
    prerelease: false,
    published_at: providerReleasePublishedAt,
    tag_name: providerTag,
    target_commitish: "main",
    ...overrides,
  };
}


function providerReleaseWorkflowRun(
  overrides: Readonly<Record<string, ProviderJson>> = {},
): ProviderJson {
  const repository = {
    full_name: providerRepository,
    id: GHOSTGET_REPOSITORY_ID,
    private: false,
  };
  return {
    actor: { id: 894119, login: "0thernet", type: "User" },
    conclusion: "success",
    event: "push",
    head_branch: providerTag,
    head_repository: repository,
    head_sha: providerVerifiedSha,
    id: Number(providerReleaseWorkflowRunId),
    name: "Release",
    path: ".github/workflows/release.yml",
    repository,
    run_attempt: 1,
    status: "completed",
    triggering_actor: { id: 894119, login: "0thernet", type: "User" },
    workflow_id: 323493609,
    ...overrides,
  };
}

/** One complete bounded Release job inventory whose jobs all belong to `attempt` unless overridden. */
function providerReleaseJobs(
  attempt: number,
  overrides: Readonly<Record<string, Readonly<Record<string, ProviderJson>>>> = {},
): ProviderJson {
  const jobs = [
    ...CANONICAL_RELEASE_JOBS,
    "Publish exact npm package through OIDC",
    "Admit exact public npm package",
  ].map((name, index) => ({
    conclusion: "success",
    head_sha: providerVerifiedSha,
    id: 5000 + attempt * 10 + index,
    name,
    run_attempt: attempt,
    run_id: Number(providerReleaseWorkflowRunId),
    status: "completed",
    ...overrides[name],
  }));
  return { jobs, total_count: jobs.length };
}

describe("npm publication contract", () => {
  test("derives the tar expansion ceiling from the reviewed package budget", async () => {
    const artifact = await readFile(packageArtifactUrl, "utf8");

    expect(MAX_PACKAGE_TAR_BYTES).toBe(
      Math.ceil(
        (MAX_UNPACKED_BYTES + MAX_PACKED_ENTRIES * 1_023 + 1_024) / 512,
      ) * 512,
    );
    expect(MAX_PACKAGE_TAR_BYTES).toBe(25_012_736);
    expect(MAX_PACKAGE_TAR_BYTES % 512).toBe(0);
    expect(artifact).toContain("maxOutputLength: MAX_PACKAGE_TAR_BYTES");
    expect(artifact).not.toContain("const maximumTarBytes");
  });

  test("enforces the derived package decompression ceiling", () => {
    const atCeiling = gzipSync(Buffer.alloc(MAX_PACKAGE_TAR_BYTES));
    const overCeiling = gzipSync(Buffer.alloc(MAX_PACKAGE_TAR_BYTES + 512));

    expect(
      gunzipSync(atCeiling, { maxOutputLength: MAX_PACKAGE_TAR_BYTES }).byteLength,
    ).toBe(MAX_PACKAGE_TAR_BYTES);
    expect(() =>
      gunzipSync(overCeiling, { maxOutputLength: MAX_PACKAGE_TAR_BYTES })
    ).toThrow();
  });

  test("keeps the PR Required gate as the union of Linux shards, the macOS subset, and formal verification", async () => {
    const workflow = await readFile(ciWorkflowUrl, "utf8");
    const staticStart = workflow.indexOf("\n  static:\n");
    const packageStart = workflow.indexOf("\n  package:\n");
    const testStart = workflow.indexOf("\n  test:\n");
    const testOmniStart = workflow.indexOf("\n  test-omni:\n");
    const standaloneStart = workflow.indexOf("\n  standalone:\n");
    const macosStart = workflow.indexOf("\n  macos:\n");
    const verificationStart = workflow.indexOf("\n  verification:\n");
    const quintStart = workflow.indexOf("\n  quint:\n");
    const requiredStart = workflow.indexOf("\n  required:\n");

    expect(workflow.match(/^  static:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  package:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  test:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  test-omni:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  standalone:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  macos:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  verification:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  quint:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  required:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  check:$/gmu) ?? []).toHaveLength(0);
    expect(workflow.match(/^    timeout-minutes: [0-9]+$/gmu)).toHaveLength(9);
    expect(staticStart).toBeGreaterThan(-1);
    expect(packageStart).toBeGreaterThan(staticStart);
    expect(testStart).toBeGreaterThan(packageStart);
    expect(testOmniStart).toBeGreaterThan(testStart);
    expect(standaloneStart).toBeGreaterThan(testOmniStart);
    expect(macosStart).toBeGreaterThan(standaloneStart);
    expect(verificationStart).toBeGreaterThan(macosStart);
    expect(quintStart).toBeGreaterThan(verificationStart);
    expect(requiredStart).toBeGreaterThan(quintStart);

    const staticJob = workflow.slice(staticStart, packageStart);
    const packageJob = workflow.slice(packageStart, testStart);
    const testJob = workflow.slice(testStart, testOmniStart);
    const testOmniJob = workflow.slice(testOmniStart, standaloneStart);
    const standaloneJob = workflow.slice(standaloneStart, macosStart);
    const macosJob = workflow.slice(macosStart, verificationStart);
    const verificationJob = workflow.slice(verificationStart, quintStart);
    const quintJob = workflow.slice(quintStart, requiredStart);
    const requiredJob = workflow.slice(requiredStart);

    const timeoutValues = (job: string): readonly number[] =>
      [...job.matchAll(/^    timeout-minutes: ([0-9]+)$/gmu)]
        .map((match) => Number(match[1]));

    expect(timeoutValues(staticJob)).toEqual([15]);
    expect(timeoutValues(packageJob)).toEqual([20]);
    expect(timeoutValues(testJob)).toEqual([25]);
    expect(timeoutValues(testOmniJob)).toEqual([25]);
    expect(timeoutValues(standaloneJob)).toEqual([20]);
    expect(timeoutValues(macosJob)).toEqual([45]);
    expect(timeoutValues(verificationJob)).toEqual([30]);
    expect(timeoutValues(quintJob)).toEqual([45]);
    expect(timeoutValues(requiredJob)).toEqual([5]);
    expect(staticJob.match(/^      - run: bun run check:static$/gmu) ?? []).toHaveLength(1);
    expect(packageJob.match(/^      - run: bun run check:package$/gmu) ?? []).toHaveLength(1);
    expect(packageJob).toContain("git status --porcelain --untracked-files=all -- dist bun.lock");
    expect(packageJob).toContain("./dist/index.js");
    expect(testJob).toContain("bun run ./scripts/ci-test-shard.ts");
    expect(testJob).toContain("shard: [1, 2, 3, 4, 5, 6, 7, 8]");
    expect(testOmniJob.match(/^      - run: bun run test:omni$/gmu) ?? []).toHaveLength(1);
    expect(standaloneJob.match(/^      - run: bun run test:standalone$/gmu) ?? []).toHaveLength(1);
    expect(macosJob.match(/^      - run: bun run check:macos$/gmu) ?? []).toHaveLength(1);
    expect(macosJob).not.toContain("desktop");
    expect(macosJob.match(/^      - run: bun run check$/gmu) ?? []).toHaveLength(0);
    // `bun run verify` is split into its phases: three run once in the
    // verification job and verify:quint runs as the quint matrix.
    for (const phase of ["verify:claims", "verify:lean", "verify:oracles"]) {
      expect(verificationJob.match(new RegExp(`^      - run: bun run ${phase}$`, "gmu")) ?? []).toHaveLength(1);
      expect(workflow.match(new RegExp(`^      - run: bun run ${phase}$`, "gmu")) ?? []).toHaveLength(1);
    }
    expect(quintJob).toContain("shard: [1, 2, 3, 4]");
    expect(quintJob.match(/^      - run: bun run \.\/scripts\/verification-tools\.ts quint \$\{\{ matrix\.shard \}\} 4$/gmu) ?? [])
      .toHaveLength(1);
    expect(workflow.match(/^      - run: bun run verify$/gmu) ?? []).toHaveLength(0);
    expect(workflow.match(/^      - run: bun run verify:quint$/gmu) ?? []).toHaveLength(0);
    expect(requiredJob.match(/^      - run: bun run check$/gmu) ?? []).toHaveLength(0);
    expect(requiredJob.match(
      /^    needs: \[static, package, test, test-omni, standalone, macos, verification, quint\]$/gmu,
    ) ?? []).toHaveLength(1);
    expect(workflow.match(/^      - run: bun run check$/gmu) ?? []).toHaveLength(0);
  });

  test("keeps one narrow release-authoritative package budget", async () => {
    const [artifact, budget, smoke] = await Promise.all([
      readFile(packageArtifactUrl, "utf8"),
      readFile(packageBudgetUrl, "utf8"),
      readFile(packageSmokeUrl, "utf8"),
    ]);

    expect(artifact).toContain('from "./package-budget.js"');
    expect(smoke).toContain('from "./package-budget.js"');
    expect(smoke).toContain('"@types/bun": "1.3.14"');
    expect(smoke).not.toContain('"@types/bun": "^1.3.14"');
    expect(smoke).toContain('"@types/node": "26.1.2"');
    expect(budget).toContain("two npm 11.19.0 packs");
    expect(budget).toContain("2,232,402 packed bytes");
    expect(budget).toContain("12,322,791 unpacked bytes, and 485 files");
    expect(budget).toContain(
      "7b72a20a95ef0e92feec1c6e75b556800dc08215f142bac0fa6c24b53fd74928",
    );
    expect(budget).toContain("Published 0.16.7 is 2,214,418 packed bytes");
    expect(budget).toContain("466 files from npm 11.19.0");
    expect(budget).toContain(
      "7b13498e1070d95f2a1d564caba41f1eebc6a32a7a8e078373fe2fec564060a8",
    );
    expect(budget).toContain("LinkedIn activity pagination, cleanup convergence");
    expect(budget).toContain("12,419,404-byte release archive");
    expect(budget).toContain("6,112-byte");
    expect(budget).toContain("12,425,516 unpacked bytes");
    expect(budget).toContain("26 bytes of unpacked allowance");
    expect(budget).toContain("measured a 3,543-byte Linux/macOS gzip spread");
    expect(budget).toContain("leaves 4,266 bytes");
    expect(budget).toContain("635 unpacked bytes of headroom");
    expect(budget).toContain("2,258,232 compressed and 12,443,041 payload bytes");
    expect(budget).toContain("cff3bf55b9dabfea4b17f590ff83cfbc8c78d8b0b2c338696da82b4c6cb42a1b");
    expect(budget).toContain("2,258,370 compressed and 12,443,517 payload bytes");
    expect(budget).toContain("319fa969d7398386b7f2963cb000a02bd3b99d0fad19a16141bfad1429e10bfb");
    expect(budget).toContain("2,312,026 compressed and 12,644,368 payload");
    expect(budget).toContain("82364442728547e0ea3c6a2fb105ea58e461f5bab2346e8b8244bf68e4596d54");
    expect(budget).toContain("2,313,628 compressed and");
    expect(budget).toContain("12,648,898 payload bytes across exactly 524 files");
    expect(budget).toContain("6a18ddbf45c787ab22a206eccc75159e745700bab5cbdf34e159f0a240e135a9");
    expect(budget).toContain("2,314,828 compressed and 12,654,022 payload bytes");
    expect(budget).toContain("e1b7edca283b667a1caa7f38d34c7d0b4c677380b464dc4e11ef3e6827f72dbf");
    expect(budget).toContain("2,314,832 compressed and 12,654,071 payload");
    expect(budget).toContain("01abe7e7a0953670578777aa88e3c3dbe6d095fb2e46298154c37801db576c96");
    expect(budget).toContain("2,316,774 compressed");
    expect(budget).toContain("12,725,779 payload bytes across exactly 524 files");
    expect(budget).toContain("43818a0f9210eea9ab07964afe98df56444c042cd911599b9cac83f93bcf1d6d");
    expect(budget).toContain("12,725,039 payload bytes across exactly 524 files");
    expect(budget).toContain("82aebc3443ba76a5f5ecb20121528aec7d52b3c25f9d0546310e213588dc9aad");
    expect(budget).toContain("12,721,045 payload bytes across exactly 524 files");
    expect(budget).toContain("6ce1e1a7bf4f3f4d30b56cce135be3916efe3602fa7f595ceffd640de432a0dc");
    expect(budget).toContain("12,717,070 payload bytes across exactly 524 files");
    expect(budget).toContain("77b915c17c573d48b421253fd22a8d1e302e03e2aa637dc3e33f57c007fa8763");
    expect(budget).toContain("12,689,327 payload bytes across exactly 524 files");
    expect(budget).toContain("fd447e01ecfbf7bf7f4d68d63110ed3cd74d857e56e65b7e48ca162594c5aa5f");
    expect(budget).toContain("12,685,404 payload bytes across exactly 524 files");
    expect(budget).toContain("6520cea342a0b9b570cb33d8f51536656fb5c828177701f42f889afaaff350cf");
    expect(budget).toContain("12,683,195 payload bytes across exactly 524 files");
    expect(budget).toContain("daebc81fbe6611c93b9c9b58a9cc245d4397e1a700429cb107baa2a9fbb62dbe");
    expect(budget).toContain("12,672,001 payload bytes across exactly 524 files");
    expect(budget).toContain("b35c1ba04ab3e7170668090a1d3fa8cfd4c48e8395765e1b1b93b4866e51c096");
    expect(budget).toContain("12,670,102 payload bytes across exactly 524 files");
    expect(budget).toContain("6c90a0e415f5b5d4e0466ad679d12167f370353da11f43c2208f5ed0a0780053");
    expect(budget).toContain("12,666,813 payload bytes across exactly 524 files");
    expect(budget).toContain("cf6a9688425c58509b4341e97e98e591eac1cdbfc1c004b37fb6b3f5a89c577b");
    expect(budget).toContain("12,662,758 payload bytes across exactly 524 files");
    expect(budget).toContain("0940ba8e8e406f81093d360df8d6e7be9e972dbeba7b1c88ae51b961b7d0711d");
    expect(budget).toContain("2,258,514 compressed and 12,443,924");
    expect(budget).toContain("009e254d04ce94d17cbbe8a09293adcda42cb4b1430469d0d63c376d4c7581be");
    expect(budget).toContain("12,452,611 payload bytes across exactly 500 files");
    expect(budget).toContain("6fdc9574102d2364548291891b8b81f9c1c1b442a95dfb13dce0d42f7e66944c");
    expect(budget).toContain("2,802-byte Linux spread and the reviewed 4,096-byte portability allowance");
    expect(budget).toContain("This is a projection, not Linux evidence");
    expect(budget).toContain("12,561,964 compressed / 27,437,097 payload");
    expect(budget).toContain("0914c7721df5cd1a2e317d334d7ee60e6ff8f461e4e61a21aae086cd9d5fb322");
    expect(budget).toContain("11,638,165 compressed / 22,474,305 payload");
    expect(budget).toContain("56b38a2714918029075503d4e916f797e97e9ccaa76bed894421e2b4946ac677");
    expect(budget).toContain("11,648,247 + 4,096 = 11,652,343");
    expect(budget).toContain("52553bf2a994d12620df6973d2be365ca5b8ebf1c5e3266165d6b1000e7ea72f");
    expect(budget).toContain("f3a019d12d62d947e963dd6b81dc583e1897f0e76261fbd3f1ef8705390ed5b5");
    expect(budget).toContain("1.3.2.1-motley-42c2f19");
    expect(budget).toContain("3e96590b2334be064df614a9c65908b460f07be65def73d39eb71ab91d5fe204");
    expect(budget).toContain("11,649,726 + 4,096 = 11,653,822");
    expect(budget).toContain("11,654,371 + 4,096 = 11,658,467");
    expect(budget).toContain("11,689,843 + 4,096 = 11,693,939");
    expect(budget).toContain("22,517,747 payload bytes across exactly 558 files");
    expect(budget).toContain("22,517,747 + 3,542 = 22,521,289");
    expect(budget).toContain("b74ba576b58bb5b8b2b9de1bdb4ab27280b99fa156d2eb1e6c768954b4d50b23");
    expect(budget).toContain("22,515,152 payload bytes across exactly 558 files");
    expect(budget).toContain("c606e02ae0ce9b4c72f8b27f7b705698597e6f1f474d0dc00f525cd7c0bbc259");
    expect(budget).toContain("22,513,764 payload bytes across exactly 558 files");
    expect(budget).toContain("a7c6b53a90bde4324f2e4a8b3fb7af7ea2550d56549aad9c6a62c2637f035a04");
    expect(budget).toContain("22,504,918 payload bytes across exactly 558 files");
    expect(budget).toContain("da3f581f1f96724337a99c4b80567d4d11893c4df1ff9a808464260796092976");
    expect(budget).toContain("22,496,998 payload bytes across exactly 558 files");
    expect(budget).toContain("47c0114ba631b314fa5bea489eb79e29a77bb7e06321c4088725b6b238dfe81a");
    expect(budget).toContain("0f0aa0a6313132ac00477496792563879b902c16b786d86d88ae74843c93afed");
    expect(budget).toContain("cb84d130337d9f5efb520d78592c0047b67c75de2a1677633bea25064a06e46b");
    expect(budget).toContain("90ef33da70559db4674510c401466fe74a240967f8d719a4cfb3f9e012af4227");
    expect(budget).toContain("00ead58f3e0268855e0face59da2460faa723c68c18e19542c37fd891cd4431f");
    expect(budget).toContain("81b82626d55fcc0ef960ac59c3dfc0e90ed6417756d614b00796d5c4122b5072");
    expect(budget).toContain("d5681ab13f0bc005bcd4bbf4b18152de887c062e7e8be3d0ecc28f14e11177d5");
    expect(budget).toContain("0d6a1de00fd825d700b1ed0505b6fa34992f11d1deb42a5c255f7cfc295eedbc");
    expect(budget).toContain("25cfe9120e4cf43087a79e5bf302cb0683719a7db8267ed97503e75da5883185");
    expect(budget).toContain("785b8fa60c329d7ac46bc8fcf4d959b5fa9d96455bba9e7cdea63f6a3827c4f6");
    expect(Object.isFrozen(repairPackageMeasurement)).toBeTrue();
    expect(repairPackageMeasurement).toMatchObject({
      scope: "0.18.85 Beeper SDK pin extraction",
      npmVersion: "11.19.0", nodeVersion: "24.20.0", zlibVersion: "1.3.2.1-motley-42c2f19",
      archiveSha256: "acad4b6558e011503df7c42662a461efbb77f6291d024776951e369b36671588",
      packedBytes: 12_220_202, unpackedBytes: 24_357_529, entryCount: 639,
      packedPlatformProjection: 12_387, packedPortabilityAllowance: 4_096,
      payloadPlatformProjection: 353, payloadAllowance: 65,
    });
    expect(budget).toContain("12,093,793 packed; 23,759,283 + 353 + 65 = 23,759,701 unpacked");
    expect(budget).toContain("23,798,398 + 353 + 65 = 23,798,816 unpacked");
    expect(budget).toContain("23,887,548 + 353 + 65 = 23,887,966 unpacked");
    expect(budget).toContain("12,141,169 packed; 23,937,025 + 353 + 65 = 23,937,443 unpacked");
    expect(budget).toContain("23,930,250 + 353 + 65 = 23,930,668 unpacked");
    expect(budget).toContain("12,141,373 packed; 23,937,545 + 353 + 65 = 23,937,963 unpacked");
    expect(budget).toContain("12,133,689 + 12,387 + 4,096 = 12,150,172 packed");
    expect(budget).toContain("24,024,488 + 353 + 65 = 24,024,906 unpacked");
    expect(budget).toContain("12,133,765 + 12,387 + 4,096 = 12,150,248 packed");
    expect(budget).toContain("24,024,705 + 353 + 65 = 24,025,123 unpacked");
    expect(budget).toContain("12,152,562 + 12,387 + 4,096 = 12,169,045 packed");
    expect(budget).toContain("24,093,786 + 353 + 65 = 24,094,204 unpacked");
    expect(MAX_PACKED_BYTES).toBe(12_236_685);
    expect(MAX_PACKED_BYTES).toBe(12_220_202 + 12_387 + 4_096);
    expect(budget).toContain("aa127b3193c9bb3b0cb5deece5927be60ccb7111a50169320d322ffdeaa13f39");
    expect(budget).toContain("0c331bab3ab3df69a108e18f5f29845b0db90c281cbd6455c0d90fa0b24081e2");
    expect(budget).toContain("873cad8139fda303e2d19c6afd61cf549cf9b4d1d76b2a1d6d632a6afe6bd0d1");
    expect(budget).toContain("7b7e8e9feda9e61ca4e6f426b5b68e674102a37143ebbe39da8a24d0138a68af");
    expect(budget).toContain("12,004,806 + 12,387 + 4,096 =");
    expect(budget).toContain("12,003,367 + 12,387 + 4,096 =");
    expect(budget).toContain("23,462,195 + 353 + 65 = 23,462,613");
    expect(budget).toContain("511abcac8f9316451689f3881ef403d2fa2284f91dda1e9a31048dfdf5f612b2");
    expect(budget).toContain("11,999,852 + 12,387 + 4,096 =");
    expect(budget).toContain("23,451,059 + 353 + 65 = 23,451,477");
    expect(budget).toContain("c38d1f9522d477a42a82d934359012ba31124f98348302b3b5c3fe97bac6709e");
    expect(budget).toContain("11,998,420 + 12,387 + 4,096 =");
    expect(budget).toContain("23,447,236 + 353 + 65 = 23,447,654");
    expect(budget).toContain("6b1701acb53e452e8ada70e02c2f497535a7fdae32276cbd015723f2f817680d");
    expect(budget).toContain("11,998,003 + 12,387 + 4,096 =");
    expect(budget).toContain("23,446,599 + 353 + 65 = 23,447,017");
    expect(budget).toContain("202f2c9de0a07a44439e36b8448cd6d194ac7fd8f5f4d9c1f7bbfa7918c0bb10");
    expect(budget).toContain("11,994,505 + 12,387 + 4,096 =");
    expect(budget).toContain("23,431,392 + 353 + 65 = 23,431,810");
    expect(budget).toContain("bc193f99425865e22f6527ed41d918c41259491d01b77c1225196f6156dd713a");
    expect(budget).toContain("11,993,735 + 12,387 + 4,096 =");
    expect(budget).toContain("23,429,296 + 353 + 65 = 23,429,714");
    expect(budget).toContain("367705dc28b1778d1cf5d6359b18fbd14980e67b91335515ae7308e0b8032685");
    expect(budget).toContain("11,993,659 + 12,387 + 4,096 =");
    expect(budget).toContain("23,428,925 + 353 + 65 = 23,429,343");
    expect(budget).toContain("67bcf3f2bb56b7d9d7db7a902893528ed18823e888f553e4b78737b104fb6d09");
    expect(budget).toContain("11,993,659 + 12,387 + 4,096 =");
    expect(budget).toContain("23,428,918 + 353 + 65 = 23,429,336");
    expect(budget).toContain("5162451c3acb46616a35fe38729d9e26291e283e2baceabfc665c29aa2020f79");
    expect(budget).toContain("11,993,622 + 12,387 + 4,096 =");
    expect(budget).toContain("23,428,685 + 353 + 65 = 23,429,103");
    expect(budget).toContain("ece2627c6967cb8cf201ebdd598cfc57df555e069feafdd09c38ba6a775c32da");
    expect(budget).toContain("11,993,645 + 12,387 + 4,096 =");
    expect(budget).toContain("23,427,470 + 353 + 65 = 23,427,888");
    expect(budget).toContain("87e0c7bc0e6037f05c2d1ae83672de5b9abc016e2516f96a31f9a3b1bac640a4");
    expect(budget).toContain("12,005,185 + 12,387 + 4,096 = 12,021,668 packed");
    expect(budget).toContain("23,425,412 + 353 + 65 = 23,425,830 unpacked");
    expect(budget).toContain("874784766ccc8e505bc73de42d1aad7b95ce6acd59ea121914ea6f9a6dbffe85");
    expect(budget).toContain("11,992,902 + 12,387 + 4,096 =");
    expect(budget).toContain("23,424,993 + 353 + 65 = 23,425,411 unpacked");
    expect(budget).toContain("f2c9be480d9ffe8aa7ae642af2523491745987ee9bed58b66d37f7d2f4d6c4ed");
    expect(budget).toContain("11,992,764 + 12,387 + 4,096 =");
    expect(budget).toContain("11,992,132 + 12,387 + 4,096 =");
    expect(budget).toContain("11,990,908 + 12,387 + 4,096 =");
    expect(budget).toContain("11,997,841 + 12,387 + 4,096 =");
    expect(budget).toContain("11,986,281 + 12,387 + 4,096 = 12,002,764");
    expect(budget).toContain("11,972,733 + 12,387 + 4,096 =");
    expect(budget).toContain("a93c3400369b926d7dc23451d8ddb5b2b2cb47ccd733b09fda9000345415b16c");
    expect(budget).toContain("23,401,176 + 353 + 65 = 23,401,594 unpacked");
    expect(budget).toContain("23,401,813 + 353 + 65 = 23,402,231 unpacked");
    expect(budget).toContain("11,983,769 + 12,387 + 4,096 =");
    expect(budget).toContain("11,980,765 + 12,387 + 4,096 =");
    expect(budget).toContain("11,977,961 + 12,387 + 4,096 =");
    expect(budget).toContain("11,975,697 + 12,387 + 4,096 =");
    expect(budget).toContain("11,959,007 + 12,387 + 4,096 = 11,975,490");
    expect(budget).toContain("11,959,411 + 12,387 + 4,096 = 11,975,894");
    expect(budget).toContain("11,959,529 + 12,387 + 4,096 = 11,976,012");
    expect(budget).toContain("11,959,793 + 12,387 + 4,096 = 11,976,276");
    expect(budget).toContain("23,268,400 + 353 + 65 = 23,268,818");
    expect(budget).toContain("23,269,398 + 353 + 65 = 23,269,816");
    expect(budget).toContain("23,269,753 + 353 + 65 = 23,270,171");
    expect(budget).toContain("23,270,453 + 353 + 65 = 23,270,871");
    expect(budget).toContain("11,974,295 + 12,387 + 4,096 = 11,990,778");
    expect(budget).toContain("23,294,815 + 353 + 65 = 23,295,233");
    expect(budget).toContain("11,962,148 + 12,387 + 4,096 = 11,978,631");
    expect(budget).toContain("23,295,338 + 353 + 65 = 23,295,756");
    expect(budget).toContain("23,341,797 + 353 + 65 = 23,342,215");
    expect(budget).toContain(
      "c347ae9a739bd49660b7daea38fc799a08389616bad7b99801b00eb6e9ace7d1",
    );
    expect(budget).toContain(
      "6cd3c8989b9258ae9007aa5509cfd16171375f5d1b5916c7439644fbecc6dfa8",
    );
    expect(budget).toContain(
      "dc1e8d6d400a601b22224111403a1fe50f96ac4d0461571d8a763b72ceeda2c2",
    );
    expect(budget).toContain(
      "b68abd4a40f98b0ea466f78fa4383c481f8cd5b7c0c96d57127b75ae2792b5d5",
    );
    expect(budget).toContain(
      "0725e564d463965ca9b6ca8fdfb80eb712c7f4573c9a73acf499a398882cf49f",
    );
    expect(budget).toContain(
      "20f08e21c8f2063334e77597453bf984dcc1849c2447689fb166b23e35f76eb0",
    );
    expect(budget).toContain("exactly 591 files");
    expect(budget).toContain("exactly 592 files");
    expect(budget).toContain("11,946,327 + 11,158 + 4,096 = 11,961,581");
    expect(budget).toContain("11,953,899 + 4,096 = 11,957,995");
    expect(budget).toContain("11,910,740 + 12,387 + 4,096 = 11,927,223");
    expect(budget).toContain("11,922,389 + 4,096 = 11,926,485");
    expect(budget).toContain("11,696,091 + 4,096 = 11,700,187");
    expect(budget).toContain("35449445752 attempt 1, package job 105913938839");
    expect(budget).toContain("exactly 596 files");
    expect(MAX_PACKED_ENTRIES).toBe(639);
    expect(MAX_PACKED_FILES).toBe(639);
    expect(budget).toContain("Ghostget 0.18.6 same-boot setup-cleanup candidate over main edbe567");
    expect(budget).toContain("11,656,173");
    expect(budget).toContain("22,513,450 payload bytes across exactly 557 files");
    expect(budget).toContain("14ca5affd08c7d3561401b7e38c048e1bb0d6a02b02312210ea4c3d314d5d82c");
    expect(budget).toContain("34708922100, static job 103593972035 and package job 103593972046");
    expect(budget).toContain("22,521,539 + 65 = 22,521,604");
    expect(budget).toContain("22,523,437 + 65 = 22,523,502");
    expect(budget).toContain("22,657,938 + 65 = 22,658,003");
    expect(budget).toContain("22,674,601 + 65 = 22,674,666");
    expect(budget).toContain("22,674,938 + 65 = 22,675,003");
    expect(budget).toContain("22,674,966 + 37 = 22,675,003");
    expect(budget).toContain("22,673,853 + 1,150 = 22,675,003");
    expect(budget).toContain("22,677,414 + 65 = 22,677,479");
    expect(budget).toContain("22,689,572 + 65 = 22,689,637");
    expect(budget).toContain("22,800,871 + 65 = 22,800,936");
    expect(budget).toContain("22,801,968 + 65 = 22,802,033");
    expect(budget).toContain("22,813,906 + 65 = 22,813,971");
    expect(budget).toContain("34d071b68b74dbfb1d9332b4c1fc0f2f6d5d786578e89143cf129582539f6b71");
    expect(budget).toContain("23,019,689 + 65 = 23,019,754");
    expect(budget).toContain("23,029,751 + 353 + 65 = 23,030,169");
    expect(budget).toContain("23,193,728 + 65 = 23,193,793");
    expect(budget).toContain("47684b3e2eb5cf3ed07fbb520aade8c7251d993f75262fbf1af627d9081a1a5f");
    expect(budget).toContain("23,688,277 + 353 + 65 = 23,688,695");
    expect(budget).toContain("23,759,283 + 353 + 65 = 23,759,701");
    expect(MAX_UNPACKED_BYTES).toBe(24_357_947);
    expect(budget).toContain("23,037,873 + 65 = 23,037,938");
    expect(budget).toContain("f9f3ab38a682690ceaa2699a7309997512030f0fa500a9dc29dcd108123dc41f");
    expect(budget).toContain("23,038,557 + 65 = 23,038,622");
    expect(budget).toContain("d00d126b6fc2e3d214287e1a642c5eb712062f332e4f81217f7a815fef44cd49");
    expect(budget).toContain("23,213,056 + 353 + 65 = 23,213,474");
    expect(budget).toContain("23,219,374 + 65 = 23,219,439");
    expect(budget).toContain("23,220,534 + 65 = 23,220,599");
    expect(budget).toContain("23,222,059 + 65 = 23,222,124");
    expect(budget).toContain("7aaeba9a98900ed8083f4ec0a7d36d137cbc7585c1a5a676c8b092d7f3e486cb");
    expect(budget).toContain("23,229,987 + 65 = 23,230,052");
    expect(budget).toContain("f67a9230983bf87b02352ed91e8dc368ff214e19fd4aecaf4a0b3476fdb3b164");
    expect(budget).toContain("23,060,195 + 353 + 65 = 23,060,613");
    expect(budget).toContain("c58f27d5b9f06040d27ca361e7816a0cde2d69c3fb26ed76649fd3f160f348f9");
    expect(budget).toContain("23,057,885 + 65 = 23,057,950");
    expect(budget).toContain("794cbe482b03bffac194def947d3f3fcc246015fec2589e017564d3a08b3a9b0");
    expect(budget).toContain("23,040,867 + 353 + 65 = 23,041,285");
    expect(budget).toContain("feefdaa288454938b6e6598b0cd19be5bcecbb2cca307bebafee6a32495c47e8");
    expect(budget).toContain("22,689,627 + 10 = 22,689,637");
    expect(budget).toContain("22,689,627 + 65 = 22,689,692");
    expect(budget).toContain("23,346,582 + 353 + 65 = 23,347,000");
    expect(budget).toContain("1a9a87defe7a0f4f7a628f6cb2ce70d701fe500770df1184c96c87874620cc97");
    expect(budget).toContain("444e23bbbe782aa5bf22980a28bdde76b474bd299039eb1a610e4211f05895e5");
    expect(budget).toContain("23,357,506 + 353 + 65 = 23,357,924");
    expect(budget).toContain("23,366,348 + 353 + 65 = 23,366,766");
    expect(budget).toContain("5300d2503ae48a50ace5e1edc76a45d8b2e32724d8fd34fad09cf7405e083e85");
    expect(budget).toContain("cfcd1f3db620ed7529a54f65fd374959154f9417399443f994f035f060feefab");
    expect(budget).toContain("9b9f358333b911d0ffbfa0602b77281c8b3fa7476c6baba9a376ca14f0f76dc3");
    expect(budget).toContain("8614f1f031979371907772a6284888527064014b18f81cc26c4ee2f1f2bdcb56");
    expect(budget).toContain("519e4bfdfd61196722eda53965398a7553afb1818a399cc322004665a04574a2");
    expect(budget).toContain("01875f12ab73a49d6c7d6bf520dc3d318db816addee2fa7981889f35c958cf7c");
    expect(budget).toContain("b12909f08f7c19460ced56e30619f4860a1183f4b0106170c07837dae577a937");
    expect(budget).toContain("0b212ac291218528dcf979370110a36f10850e046ca90a536057d9a44e807d1d");
    expect(MAX_UNPACKED_BYTES).toBe(24_357_529 + 353 + 65);
    expect(budget).toContain("22,794,052 + 65 = 22,794,117");
    expect(budget).toContain("c482efe748f880e3717727d6d39fd92a68953e6eea766642b329ba47ae772d80");
    expect(budget).toContain("22,759,423 + 65 = 22,759,488");
    expect(budget).toContain("22,764,262 + 65 = 22,764,327");
    expect(budget).toContain("22,786,274 + 65 = 22,786,339");
    expect(budget).toContain("6fba42075451240d07bf5ecdad5d9ce485754e6604277ae8811c03e92355a457");
    expect(budget).toContain("a211e0a1fc8cca37ce468a22500c1718787baca2c304b537a1a636ac3d98560e");
    expect(budget).toContain("22,689,627 - 12,213 = 22,677,414");
    expect(budget).toContain("22,656,407 + 65 = 22,656,472");
    expect(budget).toContain("22,656,395 + 65 = 22,656,460");
    expect(budget).toContain("22,655,477 + 65 = 22,655,542");
    expect(budget).toContain("22,654,338 + 65 = 22,654,403");
    expect(budget).toContain("Shared-footer v0.13.0 repin over main c4c1469 adds exactly 369 payload");
    expect(budget).toContain("11,673,185 compressed / 22,571,708 payload bytes");
    expect(budget).toContain("11,673,325 compressed / 22,572,077 payload bytes");
    expect(budget).toContain("41de26ca839fb0ba8ab93ba03b4f91140ebe6925");
    expect(budget).toContain("22,572,077 + 65 = 22,572,142");
    expect(budget).toContain("22,571,609 + 65 = 22,571,674");
    expect(budget).toContain("160726e2db7ac18e243c2ce3b04bf967e49233730eb66b5a7bc102827ece05dc");
    expect(budget).toContain("22,562,509 + 1,974 + 65 = 22,564,548");
    expect(budget).toContain("6a266944e0815c607d2722e592ed8875fee718e4f9fd5f23d7492c81af722712");
    expect(budget).toContain("22,562,509 + 65 = 22,562,574");
    expect(budget).toContain("22,520,359 + 8,123 + 189 + 65 = 22,528,736");
    expect(budget).toContain("22,520,359 + 65 = 22,520,424");
    expect(budget).toContain("22,519,442 + 65 = 22,519,507");
    expect(budget).toContain("22,513,450 + 4,207 + 65 = 22,517,722");
    expect(budget).toContain("2,324,169 + 4,096 = 2,328,265");
    expect(budget).toContain("2,330,878 + 4,096 = 2,334,974");
    expect(Object.isFrozen(packageArtifactBudget)).toBe(true);
    for (const range of Object.values(packageArtifactBudget)) {
      expect(Object.isFrozen(range)).toBe(true);
    }
    expect(packageArtifactBudget).toEqual({
      entryCount: { min: 639, max: 639 },
      fileCount: { min: 639, max: 639 },
      packedBytes: { min: 1_600_000, max: 12_236_685 },
      unpackedBytes: { min: 9_000_000, max: 24_357_947 },
    });
  });

  test("pins the public package to the canonical registry", async () => {
    const value: unknown = JSON.parse(await readFile(manifestUrl, "utf8"));
    expect(typeof value).toBe("object");
    expect(value).not.toBeNull();
    const manifest = value as { readonly publishConfig?: unknown };
    expect(manifest.publishConfig).toEqual({
      access: "public",
      registry: npmRegistry,
    });
  });

  test("keeps the exact nine public SDK entrypoints and required source inventory", async () => {
    const [manifestSource, tsconfigSource, artifact, packageSmoke, standaloneSmoke, releaseWorkflow]
      = await Promise.all([
        readFile(manifestUrl, "utf8"),
        readFile(tsconfigUrl, "utf8"),
        readFile(packageArtifactUrl, "utf8"),
        readFile(packageSmokeUrl, "utf8"),
        readFile(standaloneSmokeUrl, "utf8"),
        readFile(releaseWorkflowUrl, "utf8"),
      ]);
    const value: unknown = JSON.parse(manifestSource);
    expect(typeof value).toBe("object");
    expect(value).not.toBeNull();
    const manifest = value as { readonly exports?: unknown; readonly files?: unknown };
    expect(typeof manifest.exports).toBe("object");
    expect(manifest.exports).not.toBeNull();
    expect(Object.keys(manifest.exports as object)).toEqual(publicExportKeys);
    expect((manifest.exports as Record<string, unknown>)["./messaging-automation"]).toEqual({
      types: "./src/messaging-automation-types.ts",
      import: "./dist/messaging-automation-api.js",
    });
    expect(Array.isArray(manifest.files)).toBe(true);
    const files = manifest.files as readonly unknown[];
    expect(files.every((path) => typeof path === "string" && path.length > 0)).toBe(true);
    expect(new Set(files).size).toBe(files.length);
    for (const requiredSource of [
      "src/assets/adapters/beeper/wrench-web-adapter.v2.2.0.json",
      "src/assets/adapters/beeper/wrench-web-adapter.v2.3.0.json",
      "src/assets/adapters/beeper/wrench-web-adapter.v2.4.0.json",
      "src/local-cli-surface-contract.ts",
      "src/messaging.ts",
    ] as const) {
      expect(files).toContain(requiredSource);
      expect(artifact).toContain(`"${requiredSource}"`);
    }
    const tsconfig: unknown = JSON.parse(tsconfigSource);
    expect(
      (tsconfig as {
        readonly compilerOptions?: { readonly paths?: Record<string, unknown> };
      }).compilerOptions?.paths,
    ).toEqual({
      "@hraness/ghostget": ["./src/index.ts"],
      "@hraness/ghostget/client": ["./src/client.ts"],
      "@hraness/ghostget/beeper": ["./src/beeper-client.ts"],
      "@hraness/ghostget/apple-photos": ["./src/apple-photos-client.ts"],
      "@hraness/ghostget/whatsapp": ["./src/whatsapp-client.ts"],
      "@hraness/ghostget/omni": ["./src/omni-client.ts"],
      "@hraness/ghostget/messaging": ["./src/messaging.ts"],
      "@hraness/ghostget/messaging-automation": ["./src/messaging-automation-types.ts"],
      "@hraness/ghostget/contracts": ["./src/contracts.ts"],
      // Type checking only: keeps Next's global augmentations out of Ghostget's programs.
      next: ["./website/next-types.d.ts"],
    });
    const releaseNodeImports = releaseWorkflow.match(/await Promise\.all\(\[(.*?)\]\.map/u)?.[1];
    expect(releaseNodeImports).toBeDefined();
    expect(JSON.parse(`[${releaseNodeImports ?? ""}]`)).toEqual(
      publicDistEntrypoints.map(path => `./${path}`),
    );
    for (const specifier of publicImportSpecifiers) {
      expect(packageSmoke).toContain(`"${specifier}"`);
      expect(standaloneSmoke).toContain(`"${specifier}"`);
    }
  });

  test("preserves Wrench release history and adds Ghostget 0.18.0", async () => {
    const changelog = await readFile(changelogUrl, "utf8");
    const unreleasedHeader = "## Unreleased\n";
    const candidateHeader = "## 0.16.12 - 2026-09-08\n";
    const canonicalHeader = "## 0.16.13 - 2026-09-09\n";
    const controlHeader = "## 0.18.0 - 2026-09-11\n";
    const paperHeader = "## 0.17.6 - 2026-09-10\n";
    const windowHeader = "## 0.17.5 - 2026-09-10\n";
    const automationHeader = "## 0.17.4 - 2026-09-10\n";
    const contactHeader = "## 0.17.3 - 2026-09-10\n";
    const listingHeader = "## 0.17.2 - 2026-09-10\n";
    const fixHeader = "## 0.17.1 - 2026-09-10\n";
    const renameHeader = "## 0.17.0 - 2026-09-09\n";
    const cookieHeader = "## 0.16.17 - 2026-09-09\n";
    const admissionHeader = "## 0.16.16 - 2026-09-09\n";
    const typingHeader = "## 0.16.15 - 2026-09-09\n";
    const packingHeader = "## 0.16.14 - 2026-09-09\n";
    const currentHeader = "## 0.16.11 - 2026-09-07\n";
    const footerHeader = "## 0.16.10 - 2026-09-07\n";
    const companyHeader = "## 0.16.9 - 2026-09-06\n";
    const cleanupHeader = "## 0.16.8 - 2026-09-06\n";
    const previousHeader = "## 0.16.7 - 2026-09-05\n";
    const consumedHeader = "## 0.16.6 - 2026-09-05\n";
    const markerHeader = "## 0.16.5 - 2026-09-04\n";
    const releaseHeader = "## 0.16.4 - 2026-09-03\n";
    const incidentHeader = "## 0.16.3 - 2026-09-01\n";
    const unreleasedStart = changelog.indexOf(unreleasedHeader);
    const candidateStart = changelog.indexOf(candidateHeader);
    const canonicalStart = changelog.indexOf(canonicalHeader);
    const controlStart = changelog.indexOf(controlHeader);
    const paperStart = changelog.indexOf(paperHeader);
    const windowStart = changelog.indexOf(windowHeader);
    const automationStart = changelog.indexOf(automationHeader);
    const contactStart = changelog.indexOf(contactHeader);
    const listingStart = changelog.indexOf(listingHeader);
    const fixStart = changelog.indexOf(fixHeader);
    const renameStart = changelog.indexOf(renameHeader);
    const cookieStart = changelog.indexOf(cookieHeader);
    const admissionStart = changelog.indexOf(admissionHeader);
    const typingStart = changelog.indexOf(typingHeader);
    const packingStart = changelog.indexOf(packingHeader);
    const currentStart = changelog.indexOf(currentHeader);
    const footerStart = changelog.indexOf(footerHeader);
    const companyStart = changelog.indexOf(companyHeader);
    const cleanupStart = changelog.indexOf(cleanupHeader);
    const previousStart = changelog.indexOf(previousHeader);
    const consumedStart = changelog.indexOf(consumedHeader);
    const markerStart = changelog.indexOf(markerHeader);
    const releaseStart = changelog.indexOf(releaseHeader);
    const incidentStart = changelog.indexOf(incidentHeader);

    expect(changelog.match(/^## Unreleased$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.17\.1 - 2026-09-10$/gmu) ?? []).toHaveLength(1);
    expect(fixStart).toBeGreaterThan(unreleasedStart);
    expect(fixStart).toBeLessThan(renameStart);
    expect(changelog.match(/^## 0\.16\.17 - 2026-09-09$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.13 - 2026-09-09$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.12 - 2026-09-08$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.11 - 2026-09-07$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.10 - 2026-09-07$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.9 - 2026-09-06$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.8 - 2026-09-06$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.7 - 2026-09-05$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.6 - 2026-09-05$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.5 - 2026-09-04$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.4 - 2026-09-03$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.16\.3 - 2026-09-01$/gmu) ?? []).toHaveLength(1);
    expect(unreleasedStart).toBeGreaterThan(-1);
    expect(candidateStart).toBeGreaterThan(canonicalStart);
    expect(currentStart).toBeGreaterThan(candidateStart);
    expect(currentStart).toBeGreaterThan(unreleasedStart);
    expect(canonicalStart).toBeGreaterThan(unreleasedStart);
    expect(renameStart).toBeGreaterThan(unreleasedStart);
    expect(cookieStart).toBeGreaterThan(renameStart);
    expect(admissionStart).toBeGreaterThan(cookieStart);
    expect(typingStart).toBeGreaterThan(admissionStart);
    expect(packingStart).toBeGreaterThan(typingStart);
    expect(canonicalStart).toBeGreaterThan(packingStart);
    expect(currentStart).toBeGreaterThan(canonicalStart);
    expect(footerStart).toBeGreaterThan(currentStart);
    expect(companyStart).toBeGreaterThan(footerStart);
    expect(cleanupStart).toBeGreaterThan(companyStart);
    expect(previousStart).toBeGreaterThan(cleanupStart);
    expect(consumedStart).toBeGreaterThan(previousStart);
    expect(markerStart).toBeGreaterThan(consumedStart);
    expect(releaseStart).toBeGreaterThan(markerStart);
    expect(incidentStart).toBeGreaterThan(releaseStart);
    expect(changelog.match(/^## 0\.17\.3 - 2026-09-10$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.17\.2 - 2026-09-10$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.17\.4 - 2026-09-10$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.17\.5 - 2026-09-10$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.17\.6 - 2026-09-10$/gmu) ?? []).toHaveLength(1);
    expect(changelog.match(/^## 0\.18\.0 - 2026-09-11$/gmu) ?? []).toHaveLength(1);
    expect(controlStart).toBeGreaterThan(unreleasedStart);
    expect(controlStart).toBeLessThan(paperStart);
    expect(paperStart).toBeGreaterThan(unreleasedStart);
    expect(paperStart).toBeLessThan(windowStart);
    expect(windowStart).toBeGreaterThan(unreleasedStart);
    expect(windowStart).toBeLessThan(automationStart);
    expect(automationStart).toBeLessThan(contactStart);
    expect(contactStart).toBeLessThan(listingStart);
    expect(listingStart).toBeLessThan(fixStart);
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.36.3",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.36.2",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.36.1",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.36.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.35.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.34.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.33.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.32.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.31.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.30.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.29.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.28.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.27.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.26.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "non-flight",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "Adapter bundle 1.25.0",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "vieweeMemberUrn",
    );
    expect(changelog.slice(unreleasedStart + unreleasedHeader.length, controlStart)).toContain(
      "multi-escaped",
    );
    const controlSection = changelog.slice(controlStart, paperStart);
    for (const fact of ["Tauri control panel", "existing Bun kernel", "human approval", "local SQLite", "1Password X token import", "source build", "separate qualification", "OpenAPI imports inert", "no model runtime in the kernel"]) {
      expect(controlSection).toContain(fact);
    }
    expect(changelog.slice(paperStart, windowStart)).toContain("shared Paper colors");
    expect(changelog.slice(windowStart, automationStart)).toContain("newest-first");
    expect(changelog.slice(windowStart, automationStart)).toContain("`v0.17.4`");
    expect(changelog.slice(automationStart, contactStart)).toContain("`publish_npm`");
    expect(changelog.slice(automationStart, contactStart)).toContain("trusted publishing");
    expect(changelog.slice(automationStart, contactStart)).toContain("`npm-stage.yml`");
    expect(changelog.slice(contactStart, listingStart)).toContain("`contacts.read@1`");
    expect(changelog.slice(contactStart, listingStart)).toMatch(/RSC\s+flight array/u);
    expect(changelog.slice(contactStart, listingStart)).toContain("Adapter bundle 1.23.0");
    expect(changelog.slice(listingStart, fixStart)).toContain("contentPolicy");
    expect(changelog.slice(fixStart, renameStart)).toContain("--allow-escape-sequences");

    const cookieReleaseEnd = changelog.indexOf("\n## ", cookieStart + cookieHeader.length);
    expect(cookieReleaseEnd).toBe(admissionStart - 1);
    const cookieSection = changelog.slice(cookieStart, cookieReleaseEnd);
    for (const requiredFact of [
      "Sweet Cookie 0.4.3 through KB 0.19.6",
      "explicit browser keychain selection for custom profiles",
      "opaque partition metadata in cookie-file web sessions",
      "malformed flags and opaque records without a partition key",
    ] as const) {
      expect(cookieSection).toContain(requiredFact);
    }

    const candidateReleaseEnd = changelog.indexOf("\n## ", candidateStart + candidateHeader.length);
    expect(candidateReleaseEnd).toBe(currentStart - 1);
    const candidateSection = changelog.slice(candidateStart, candidateReleaseEnd);
    for (const requiredFact of [
      "contacts.read",
      "first-degree Contact info",
      "bounded reads",
      "account and profile identity checks",
      "Compile shared website styles",
      "typography",
      "keyboard focus",
      "touch targets",
      "forced colors",
      "reduced motion",
    ] as const) {
      expect(candidateSection).toContain(requiredFact);
    }

    const currentReleaseEnd = changelog.indexOf("\n## ", currentStart + currentHeader.length);
    expect(currentReleaseEnd).toBe(footerStart - 1);
    const footerReleaseEnd = changelog.indexOf("\n## ", footerStart + footerHeader.length);
    expect(footerReleaseEnd).toBe(companyStart - 1);
    const companyReleaseEnd = changelog.indexOf("\n## ", companyStart + companyHeader.length);
    expect(companyReleaseEnd).toBe(cleanupStart - 1);
    const cleanupReleaseEnd = changelog.indexOf("\n## ", cleanupStart + cleanupHeader.length);
    expect(cleanupReleaseEnd).toBe(previousStart - 1);
    const cleanupSection = changelog.slice(cleanupStart, cleanupReleaseEnd);
    for (const requiredFact of [
      "completed LinkedIn profile and organization statistics",
      "Instagram",
      "single close attempt",
      "one strict, no-effect",
      "two inactive session reads",
      "three spaced CDP refusals",
      "Never repeat",
      "fail-closed",
      "REST.li variable",
      "total: 0",
      "positive paging total",
      "without inventing",
    ] as const) {
      expect(cleanupSection).toContain(requiredFact);
    }

    const previousReleaseEnd = changelog.indexOf("\n## ", previousStart + previousHeader.length);
    expect(previousReleaseEnd).toBe(consumedStart - 1);
    const previousSection = changelog.slice(previousStart, previousReleaseEnd);
    for (const requiredFact of [
      "pinned daemon exits",
      "repeated inactive-session",
      "unchanged private-root",
      "final dead-owner proof",
      "three consecutive CDP refusals",
      "no close",
      "or signal on this path",
    ] as const) {
      expect(previousSection).toContain(requiredFact);
    }

    const consumedReleaseEnd = changelog.indexOf("\n## ", consumedStart + consumedHeader.length);
    expect(consumedReleaseEnd).toBe(markerStart - 1);
    const consumedSection = changelog.slice(consumedStart, consumedReleaseEnd);
    for (const requiredFact of [
      "contacts.list@3",
      "beeper-linked-device 2.4.0",
      "feeds.read@2",
      "flair.user.choices",
      "Instagram",
    ] as const) {
      expect(consumedSection).toContain(requiredFact);
    }

    const markerReleaseEnd = changelog.indexOf("\n## ", markerStart + markerHeader.length);
    expect(markerReleaseEnd).toBe(releaseStart - 1);
    const markerSection = changelog.slice(markerStart, markerReleaseEnd);
    for (const requiredFact of [
      "production-outcome job",
      "canonical release marker",
      "custom-domain auto-assignment",
      "Latest Release projection",
      "version-tag update/deletion ruleset",
    ] as const) {
      expect(markerSection).toContain(requiredFact);
    }

    const nextReleaseStart = changelog.indexOf("\n## ", releaseStart + releaseHeader.length);
    expect(nextReleaseStart).toBe(incidentStart - 1);
    const releaseSection = changelog.slice(releaseStart, nextReleaseStart);
    for (const requiredFact of [
      "Omarchy",
      "production promotion",
      "release App",
      "Beeper",
      "signed-in X account's bookmarks",
      "Apple Photos",
      "WhatsApp",
    ] as const) {
      expect(releaseSection).toContain(requiredFact);
    }
    expect(releaseSection.match(/\bX\b/gmu) ?? []).toHaveLength(1);
    expect(releaseSection).not.toContain("CreateTweet");
    expect(releaseSection).not.toContain("UserTweets");
    expect(releaseSection).not.toContain("SearchTimeline");

    const nextIncidentStart = changelog.indexOf("\n## ", incidentStart + incidentHeader.length);
    expect(nextIncidentStart).toBeGreaterThan(incidentStart);
    const incidentSection = changelog.slice(incidentStart, nextIncidentStart);
    const normalizedIncidentSection = incidentSection.replace(/\s+/gu, " ");
    for (const retainedFact of [
      "stale-source npm-only",
      "npm published it on 2026-09-03",
      "no matching Git tag, GitHub Release, or production promotion",
      "not a completed Wrench release",
      "CreateTweet",
      "UserTweets",
      "SearchTimeline",
      "cleanup-required",
    ] as const) {
      expect(normalizedIncidentSection).toContain(retainedFact);
    }
    expect(incidentSection).not.toContain("Apple Photos");
    expect(incidentSection).not.toContain("WhatsApp Message Like Me");
  });

  test("validates and npm-installs the exact reported tarball", async () => {
    const smoke = await readFile(packageSmokeUrl, "utf8");

    for (const required of [
      "--archive <package.tgz> --pack-json <npm-pack.json>",
      "entryCount",
      "unpackedSize",
      "npm pack file inventory does not match unpackedSize",
      "createHash(\"sha512\")",
      "createHash(\"sha1\")",
      "Exact npm tarball digest does not match npm-pack.json",
      "Clean npm install does not match the exact npm pack metrics",
      "\"npm\",\n      \"install\"",
      "`--registry=${NPM_REGISTRY}`",
      "not currently published on npm",
      'Object.hasOwn(manifest, "tag")',
      'Object.hasOwn(manifest, "private") && manifest.private !== false',
      "Object.keys(manifest.publishConfig).sort()",
      'JSON.stringify(["access", "registry"])',
      "manifest.publishConfig.registry !== NPM_REGISTRY",
      "Packed Ghostget must remain public and publishConfig may contain only public access and the canonical npm registry",
    ] as const) {
      expect(smoke).toContain(required);
    }
  });

  test("requires the shipped control surface and rejects unreviewed documentation or test sources", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ghostget-control-artifact-"));
    const archive = join(directory, "package.tgz");
    try {
      await run([process.execPath, "pm", "pack", "--filename", archive, "--ignore-scripts", "--quiet"], repository);
      const inventory = await inspectPackageArtifact(archive);
        expect(inventory.files.some(file => file.path === "src/control/credential-helper.ts")).toBe(true);
      expect(inventory.files.some(file => file.path === "src/provider-plugin-import-analysis.ts")).toBe(true);
      expect(inventory.files.some(file => file.path.startsWith("desktop/") || file.path.includes("/direct/"))).toBe(false);
      expect(inventory.files.some(file => file.path.includes("benchmark"))).toBe(false);
      const originalTar = gunzipSync(await readFile(archive));
      for (const [source, replacement, expected] of [
        ["src/control/helper.ts", "src/control/absent-helper.ts", "Required package path is missing: src/control/helper.ts"],
        ["src/provider-plugin-import-analysis.ts", "src/absent-provider-analysis.ts", "Required package path is missing: src/provider-plugin-import-analysis.ts"],
        ["src/control/helper.ts", "src/control/helper.test.ts", "Test source entered the package"],
      ] as const) {
        const tar = Buffer.from(originalTar);
        const entry = exactTarEntry(tar, `package/${source}`);
        tar.fill(0, entry.headerOffset, entry.headerOffset + 100);
        tar.write(`package/${replacement}`, entry.headerOffset, "utf8");
        writeHeaderChecksum(tar, entry.headerOffset);
        await writeFile(archive, gzipSync(tar, { level: 9 }));
        await expect(inspectPackageArtifact(archive)).rejects.toThrow(expected);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("accepts omitted private and rejects a packed top-level npm tag before OIDC publication", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const script = workflowStepScript(workflow, "Bind downloaded artifact");
    const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as {
      readonly name: string;
      readonly version: string;
    };
    const directory = await mkdtemp(join(tmpdir(), "ghostget-packed-tag-"));
    const artifactDirectory = join(directory, "ghostget-npm-package");
    const filename = `hraness-ghostget-${manifest.version}.tgz`;
    const archive = join(artifactDirectory, filename);
    try {
      await mkdir(artifactDirectory, { recursive: true });
      await run([
        process.execPath,
        "pm",
        "pack",
        "--filename",
        archive,
        "--ignore-scripts",
        "--quiet",
      ], repository);
      const originalArchive = await readFile(archive);
      const originalInventory = await inspectPackageArtifact(archive);
      await Promise.all([
        writeFile(
          join(artifactDirectory, "npm-pack.json"),
          packJson(originalArchive, originalInventory, manifest.name, manifest.version),
        ),
        writeFile(
          join(artifactDirectory, "npm-package.sha256"),
          `${createHash("sha256").update(originalArchive).digest("hex")}\n`,
        ),
      ]);
      const accepted = await runWorkflowScript(script, {
        EXPECTED_TARBALL_NAME: filename,
        EXPECTED_VERSION: manifest.version,
        GITHUB_OUTPUT: join(directory, "github-output.txt"),
        RUNNER_TEMP: directory,
      });
      expect(accepted.exitCode).toBe(0);

      const tar = gunzipSync(originalArchive);
      const manifestEntry = exactTarEntry(tar, "package/package.json");
      const manifestBytes = tar.subarray(
        manifestEntry.dataOffset,
        manifestEntry.dataOffset + manifestEntry.size,
      );
      const manifestText = manifestBytes.toString("utf8");
      expect(manifestText).not.toContain('"private"');
      const packedManifest = JSON.parse(manifestText) as Record<string, unknown>;
      const manifestPaddedSize = Math.ceil(manifestEntry.size / 512) * 512;
      const runPrivateVariant = async (
        value: string,
        accepted: boolean,
      ): Promise<void> => {
        // Isolate the identity mutation from the production byte ceiling;
        // pretty-printing can exhaust its reviewed metadata headroom.
        const variantManifest = Buffer.from(
          `${JSON.stringify({ ...packedManifest, private: JSON.parse(value) })}\n`,
          "utf8",
        );
        const variantPaddedSize = Math.ceil(variantManifest.length / 512) * 512;
        const variantTar = Buffer.concat([
          tar.subarray(0, manifestEntry.dataOffset),
          Buffer.alloc(variantPaddedSize),
          tar.subarray(manifestEntry.dataOffset + manifestPaddedSize),
        ]);
        variantManifest.copy(variantTar, manifestEntry.dataOffset);
        variantTar.fill(0, manifestEntry.headerOffset + 124, manifestEntry.headerOffset + 136);
        Buffer.from(variantManifest.length.toString(8).padStart(11, "0"), "ascii")
          .copy(variantTar, manifestEntry.headerOffset + 124);
        writeHeaderChecksum(variantTar, manifestEntry.headerOffset);
        const variantArchive = gzipSync(variantTar, { level: 9 });
        await writeFile(archive, variantArchive);
        const variantInventory = await inspectPackageArtifact(archive);
        await Promise.all([
          writeFile(
            join(artifactDirectory, "npm-pack.json"),
            packJson(variantArchive, variantInventory, manifest.name, manifest.version),
          ),
          writeFile(
            join(artifactDirectory, "npm-package.sha256"),
            `${createHash("sha256").update(variantArchive).digest("hex")}\n`,
          ),
        ]);
        const result = await runWorkflowScript(script, {
          EXPECTED_TARBALL_NAME: filename,
          EXPECTED_VERSION: manifest.version,
          GITHUB_OUTPUT: join(directory, "github-output.txt"),
          RUNNER_TEMP: directory,
        });
        if (accepted) {
          expect(result.exitCode).toBe(0);
        } else {
          expect(result.exitCode).not.toBe(0);
          expect(`${result.stdout}${result.stderr}`).toContain(
            "Packed Ghostget can publish only to the canonical public npm registry",
          );
        }
      };
      await runPrivateVariant("false", true);
      for (const rejected of ["true", "null", '"false"', "0", "{}"] as const) {
        await runPrivateVariant(rejected, false);
      }

      const originalKey = Buffer.from('"bin":', "utf8");
      const replacementKey = Buffer.from('"tag":', "utf8");
      const keyOffset = manifestBytes.indexOf(originalKey);
      expect(keyOffset).toBeGreaterThan(-1);
      replacementKey.copy(tar, manifestEntry.dataOffset + keyOffset);
      const archiveBytes = gzipSync(tar, { level: 9 });
      await writeFile(archive, archiveBytes);
      const inventory = await inspectPackageArtifact(archive);
      await Promise.all([
        writeFile(
          join(artifactDirectory, "npm-pack.json"),
          packJson(archiveBytes, inventory, manifest.name, manifest.version),
        ),
        writeFile(
          join(artifactDirectory, "npm-package.sha256"),
          `${createHash("sha256").update(archiveBytes).digest("hex")}\n`,
        ),
      ]);
      const result = await runWorkflowScript(script, {
        EXPECTED_TARBALL_NAME: filename,
        EXPECTED_VERSION: manifest.version,
        GITHUB_OUTPUT: join(directory, "github-output.txt"),
        RUNNER_TEMP: directory,
      });
      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "Packed Ghostget can publish only to the canonical public npm registry",
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("keeps both tar consumers aligned on hostile USTAR version and prefix headers", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const script = workflowStepScript(workflow, "Bind downloaded artifact");
    const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as {
      readonly name: string;
      readonly version: string;
    };
    const directory = await mkdtemp(join(tmpdir(), "ghostget-hostile-ustar-"));
    const artifactDirectory = join(directory, "ghostget-npm-package");
    const filename = `hraness-ghostget-${manifest.version}.tgz`;
    const archive = join(artifactDirectory, filename);
    try {
      await mkdir(artifactDirectory, { recursive: true });
      await run([
        process.execPath,
        "pm",
        "pack",
        "--filename",
        archive,
        "--ignore-scripts",
        "--quiet",
      ], repository);
      const originalArchive = await readFile(archive);
      const inventory = await inspectPackageArtifact(archive);
      const originalTar = gunzipSync(originalArchive);
      const manifestEntry = exactTarEntry(originalTar, "package/package.json");
      expect(manifestEntry.size % 512).not.toBe(0);
      const runMutation = async (
        mutate: (tar: Buffer, headerOffset: number) => void,
        expectedArtifactMessage: string,
        expectedWorkflowMessage: string,
      ) => {
        const tar = Buffer.from(originalTar);
        mutate(tar, manifestEntry.headerOffset);
        writeHeaderChecksum(tar, manifestEntry.headerOffset);
        const archiveBytes = gzipSync(tar, { level: 9 });
        await Promise.all([
          writeFile(archive, archiveBytes),
          writeFile(
            join(artifactDirectory, "npm-pack.json"),
            packJson(archiveBytes, inventory, manifest.name, manifest.version),
          ),
          writeFile(
            join(artifactDirectory, "npm-package.sha256"),
            `${createHash("sha256").update(archiveBytes).digest("hex")}\n`,
          ),
        ]);
        await expect(inspectPackageArtifact(archive)).rejects.toThrow(expectedArtifactMessage);
        const result = await runWorkflowScript(script, {
          EXPECTED_TARBALL_NAME: filename,
          EXPECTED_VERSION: manifest.version,
          GITHUB_OUTPUT: join(directory, "github-output.txt"),
          RUNNER_TEMP: directory,
        });
        expect(result.exitCode).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain(expectedWorkflowMessage);
      };

      await runMutation((tar, headerOffset) => {
        tar[headerOffset + 264] = "1".charCodeAt(0);
      }, "Package tar header is not exact USTAR", "Packed package.json tar header is invalid");

      await runMutation((tar) => {
        tar[manifestEntry.dataOffset + manifestEntry.size] = 1;
      }, "Package tar entry padding is invalid", "Packed package.json tar padding is invalid");

      await runMutation((tar, headerOffset) => {
        tar.fill(0, headerOffset, headerOffset + 100);
        tar.write("package.json", headerOffset, "ascii");
        tar.fill("a".charCodeAt(0), headerOffset + 345, headerOffset + 475);
        tar.write("package/", headerOffset + 345, "ascii");
        tar[headerOffset + 475] = "/".charCodeAt(0);
        tar[headerOffset + 476] = ".".charCodeAt(0);
        tar[headerOffset + 477] = ".".charCodeAt(0);
        tar[headerOffset + 478] = 0;
      }, "Package tar entry has an unsafe path", "Packed package.json tar path is unsafe");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("accepts only exact tag pushes in the immutable Release workflow", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const script = workflowStepScript(workflow, "Resolve release request");
    const directory = await mkdtemp(join(tmpdir(), "ghostget-release-request-"));
    const output = join(directory, "github-output.txt");

    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).toContain("ref: refs/tags/${{ steps.request.outputs.tag }}");
    expect(workflow).toContain("fetch-depth: 1");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow.slice(0, workflow.indexOf("  publish_npm:\n"))).not.toMatch(/npm view|npm audit signatures|npm publish/u);
    expect(workflow).toContain("github-release-artifact.ts prepare");
    expect(workflow).toContain("github-release-publish.ts");

    try {
      const runCase = async (
        overrides: Readonly<Record<string, string>>,
      ): Promise<Readonly<{ exitCode: number; stderr: string; stdout: string }>> => {
        await rm(output, { force: true });
        return runWorkflowScript(script, {
          EVENT_NAME: "push",
          EVENT_REF: "refs/tags/v0.16.2",
          EVENT_REF_NAME: "v0.16.2",
          EVENT_REF_TYPE: "tag",
          GITHUB_OUTPUT: output,
          ...overrides,
        });
      };

      const pushed = await runCase({});
      expect(pushed.exitCode).toBe(0);
      expect(await readFile(output, "utf8")).toBe("tag=v0.16.2\n");

      for (const rejectedEnvironment of [
        {
          EVENT_NAME: "workflow_dispatch",
          EVENT_REF: "refs/heads/main",
          EVENT_REF_NAME: "main",
          EVENT_REF_TYPE: "branch",
        },
        { EVENT_REF: "refs/heads/main", EVENT_REF_NAME: "main", EVENT_REF_TYPE: "branch" },
        { EVENT_REF_NAME: "v0.16.2\npoison", EVENT_REF: "refs/tags/v0.16.2\npoison" },
        {
          EVENT_REF_NAME: "v9007199254740992.0.0",
          EVENT_REF: "refs/tags/v9007199254740992.0.0",
        },
        { EVENT_NAME: "schedule" },
      ] as const) {
        const rejected = await runCase(rejectedEnvironment);
        expect(rejected.exitCode).not.toBe(0);
        expect(await Bun.file(output).exists()).toBe(false);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("serializes stable Release runs in one queued concurrency group that never cancels a pending tag run", async () => {
    // GitHub keeps one running and one pending run per concurrency group and
    // cancels the pending run when a third arrives, unless the group sets
    // `queue: max`, which queues up to 100 pending runs in order. A Release
    // run cancelled while pending never builds, attests, or publishes its tag.
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const parsed = Bun.YAML.parse(workflow) as {
      concurrency?: unknown;
      jobs: Record<string, { concurrency?: unknown }>;
    };
    expect(parsed.concurrency).toEqual({ group: "stable-release", "cancel-in-progress": false, queue: "max" });
    expect(Object.entries(parsed.jobs).filter(([, job]) => job.concurrency !== undefined).map(([name]) => name)).toEqual([]);
    expect(workflow.match(/^\s*concurrency:/gmu)).toHaveLength(1);
    expect(workflow.match(/cancel-in-progress/gu)).toHaveLength(1);
  });

  test("runs npm publication only after the canonical jobs succeed, and canonical jobs never wait on npm", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const parsed = Bun.YAML.parse(workflow) as {
      jobs: Record<string, {
        if?: unknown; needs?: string | string[]; "continue-on-error"?: unknown;
        steps?: { if?: unknown; "continue-on-error"?: unknown }[];
      }>;
    };
    const needs = (name: string): readonly string[] => {
      const value = parsed.jobs[name]?.needs;
      return value === undefined ? [] : typeof value === "string" ? [value] : value;
    };
    // Every transitive prerequisite, so an indirect dependency on npm is caught too.
    const closure = (name: string): ReadonlySet<string> => {
      const seen = new Set<string>();
      const pending = [...needs(name)];
      while (pending.length > 0) {
        const next = pending.pop()!;
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(...needs(next));
      }
      return seen;
    };
    expect(Object.keys(parsed.jobs)).toEqual(["authorize", "verify", "attest", "publish", "publish_npm", "admit_npm"]);
    expect([...closure("publish_npm")].sort()).toEqual(["attest", "authorize", "publish", "verify"]);
    for (const canonical of ["authorize", "verify", "attest", "publish"]) {
      const prerequisites = closure(canonical);
      expect(prerequisites.has("publish_npm") || prerequisites.has("admit_npm")).toBe(false);
    }
    // A job-level `if:` could run npm after a failed or skipped prerequisite
    // (`always()`, `failure()`, `!cancelled()`); without one, GitHub runs a job
    // only when every needed job succeeded. publish_npm needs authorize only
    // through verify, so an `if:` on any job, not just the npm jobs, could
    // carry npm past a failed canonical job. No job may tolerate its own failure.
    for (const [name, job] of Object.entries(parsed.jobs)) expect([name, job.if]).toEqual([name, undefined]);
    for (const [name, job] of Object.entries(parsed.jobs)) expect([name, job["continue-on-error"]]).toEqual([name, undefined]);
    // A tolerated or conditionally skipped step would let a canonical job succeed
    // without doing its work, and npm would then publish after it.
    for (const [name, job] of Object.entries(parsed.jobs)) {
      (job.steps ?? []).forEach((step, index) => {
        expect([name, index, step["continue-on-error"], step.if]).toEqual([name, index, undefined, undefined]);
      });
    }
  });

  test("authorizes a tag pushed by the owner or the release tagger and no one else", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const script = workflowStepScript(workflow, "Verify immutable owner and public repository identity");
    const directory = await mkdtemp(join(tmpdir(), "ghostget-release-authorize-"));
    const eventPath = join(directory, "event.json");
    const repositoryEvent = {
      id: GHOSTGET_REPOSITORY_ID,
      full_name: "hraness/ghostget",
      visibility: "public",
      private: false,
      default_branch: "main",
    };
    const runCase = async (actorId: string, sender: Readonly<{ id: number; type: string }>) => {
      await writeFile(eventPath, `${JSON.stringify({ sender, repository: repositoryEvent })}\n`, "utf8");
      return runWorkflowScript(script, {
        EXPECTED_ACTOR_ID: "894119",
        EXPECTED_REPOSITORY: "hraness/ghostget",
        EXPECTED_REPOSITORY_ID: String(GHOSTGET_REPOSITORY_ID),
        GITHUB_ACTOR_ID: actorId,
        GITHUB_EVENT_NAME: "push",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "hraness/ghostget",
        GITHUB_REPOSITORY_ID: String(GHOSTGET_REPOSITORY_ID),
        REF_PROTECTED: "true",
        TAGGER_ACTOR_ID: "337004703",
      });
    };
    try {
      expect((await runCase("894119", { id: 894119, type: "User" })).exitCode).toBe(0);
      expect((await runCase("337004703", { id: 337004703, type: "Bot" })).exitCode).toBe(0);
      for (const [actorId, sender] of [
        ["41898282", { id: 41898282, type: "Bot" }],
        ["337004703", { id: 337004703, type: "User" }],
        ["894119", { id: 894119, type: "Bot" }],
        ["894119", { id: 337004703, type: "Bot" }],
        ["337004703", { id: 894119, type: "User" }],
      ] as const) {
        expect((await runCase(actorId, sender)).exitCode).not.toBe(0);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("reauthorizes the exact owner on the current Release attempt before checkout", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const script = workflowStepScript(workflow, "Reauthorize current release attempt");
    const publishStart = workflow.indexOf("  publish:\n");
    const reauthorizeStart = workflow.indexOf("      - name: Reauthorize current release attempt\n", publishStart);
    const checkoutStart = workflow.indexOf(
      "      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0",
      reauthorizeStart,
    );

    expect(workflow).toContain("name: Authorize owner release tag");
    expect(workflow).toContain('EXPECTED_ACTOR_ID: "894119"');
    expect(workflow).toContain('EXPECTED_REPOSITORY_ID: "1316443113"');
    expect(workflow).toContain("REF_PROTECTED: ${{ github.ref_protected }}");
    expect(workflow).toContain("needs: authorize");
    expect(publishStart).toBeGreaterThan(0);
    expect(reauthorizeStart).toBeGreaterThan(publishStart);
    expect(checkoutStart).toBeGreaterThan(reauthorizeStart);
    expect(workflow.slice(publishStart, reauthorizeStart)).toContain("actions: read");
    for (const required of [
      "attempt.actor?.id !== actorId",
      "attempt.triggering_actor?.id !== actorId",
      "attempt.workflow_id !== workflowId",
      "attempt.path !== process.env.EXPECTED_WORKFLOW_PATH",
      'value?.object?.type !== "commit"',
      '"$comparison_status" != ahead && "$comparison_status" != identical',
    ] as const) {
      expect(script).toContain(required);
    }

    const directory = await mkdtemp(join(tmpdir(), "ghostget-release-attempt-"));
    const binaryDirectory = join(directory, "bin");
    const ghStub = join(binaryDirectory, "gh");
    const attemptFixture = join(directory, "attempt.json");
    const workflowFixture = join(directory, "workflow.json");
    const repositoryFixture = join(directory, "repository.json");
    const tagFixture = join(directory, "tag.json");
    const sourceSha = providerVerifiedSha;
    const releaseTag = "v0.16.6";
    const validAttempt = Object.freeze({
      id: 9001,
      run_attempt: 2,
      workflow_id: 323493609,
      name: "Release",
      path: ".github/workflows/release.yml",
      event: "push",
      head_branch: releaseTag,
      head_sha: sourceSha,
      status: "in_progress",
      conclusion: null,
      actor: { id: 894119, type: "User" },
      triggering_actor: { id: 894119, type: "User" },
      repository: { id: GHOSTGET_REPOSITORY_ID, full_name: providerRepository, private: false },
    });
    try {
      await mkdir(binaryDirectory, { recursive: true });
      await Promise.all([
        writeFile(workflowFixture, `${JSON.stringify({
          id: 323493609,
          name: "Release",
          path: ".github/workflows/release.yml",
          state: "active",
        })}\n`, "utf8"),
        writeFile(repositoryFixture, `${JSON.stringify({
          id: GHOSTGET_REPOSITORY_ID,
          full_name: providerRepository,
          visibility: "public",
          private: false,
          default_branch: "main",
        })}\n`, "utf8"),
        writeFile(tagFixture, `${JSON.stringify({ object: { type: "commit", sha: sourceSha } })}\n`, "utf8"),
      ]);
      await writeFile(ghStub, `#!/bin/bash
set -euo pipefail
case "$*" in
  "api --method GET /repos/hraness/ghostget/actions/runs/9001/attempts/2") cat "$ATTEMPT_FIXTURE" ;;
  "api --method GET /repos/hraness/ghostget/actions/workflows/323493609") cat "$WORKFLOW_FIXTURE" ;;
  "api --method GET /repos/hraness/ghostget") cat "$REPOSITORY_FIXTURE" ;;
  "api --method GET /repos/hraness/ghostget/git/ref/tags/v0.16.6") cat "$TAG_FIXTURE" ;;
  "api --method GET --jq .sha /repos/hraness/ghostget/commits/main") printf '%s\\n' "$SOURCE_SHA" ;;
  "api --method GET --jq .status /repos/hraness/ghostget/compare/$SOURCE_SHA...$SOURCE_SHA") printf 'identical\\n' ;;
  *) echo "unexpected gh command: $*" >&2; exit 1 ;;
esac
`, "utf8");
      await chmod(ghStub, 0o755);
      const baseEnvironment = Object.freeze({
        ATTEMPT_FIXTURE: attemptFixture,
        DEFAULT_BRANCH: "main",
        EXPECTED_ACTOR_ID: "894119",
        EXPECTED_REPOSITORY: providerRepository,
        EXPECTED_REPOSITORY_ID: String(GHOSTGET_REPOSITORY_ID),
        EXPECTED_WORKFLOW_ID: "323493609",
        EXPECTED_WORKFLOW_PATH: ".github/workflows/release.yml",
        GITHUB_EVENT_NAME: "push",
        GITHUB_REF: `refs/tags/${releaseTag}`,
        GITHUB_REPOSITORY: providerRepository,
        GITHUB_REPOSITORY_ID: String(GHOSTGET_REPOSITORY_ID),
        GITHUB_RUN_ATTEMPT: "2",
        GITHUB_RUN_ID: "9001",
        GITHUB_SHA: sourceSha,
        PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
        REPOSITORY_FIXTURE: repositoryFixture,
        RUNNER_TEMP: directory,
        SOURCE_SHA: sourceSha,
        TAG_FIXTURE: tagFixture,
        VERIFIED_SHA: sourceSha,
        VERIFIED_TAG: releaseTag,
        WORKFLOW_FIXTURE: workflowFixture,
      });
      const runCase = async (attempt: Readonly<Record<string, unknown>>) => {
        await writeFile(attemptFixture, `${JSON.stringify(attempt)}\n`, "utf8");
        return runWorkflowScript(script, baseEnvironment);
      };

      const accepted = await runCase(validAttempt);
      if (accepted.exitCode !== 0) {
        throw new Error(`Valid Release attempt failed:\n${accepted.stdout}${accepted.stderr}`);
      }
      expect(accepted.exitCode).toBe(0);
      await writeFile(workflowFixture, `${JSON.stringify({
        id: 323493609,
        name: "Renamed release workflow presentation",
        path: ".github/workflows/release.yml",
        state: "active",
      })}\n`, "utf8");
      const presentationDrift = await runCase({
        ...validAttempt,
        name: "Renamed release run presentation",
      });
      expect(presentationDrift.exitCode).toBe(0);
      const tagger = { id: 337004703, type: "Bot" };
      expect((await runCase({ ...validAttempt, actor: tagger, triggering_actor: tagger })).exitCode).toBe(0);
      for (const hostileAttempt of [
        { ...validAttempt, actor: { id: 7, type: "User" } },
        { ...validAttempt, triggering_actor: { id: 7, type: "User" } },
        { ...validAttempt, actor: { id: 41898282, type: "Bot" }, triggering_actor: { id: 41898282, type: "Bot" } },
        { ...validAttempt, actor: { id: 337004703, type: "User" }, triggering_actor: { id: 337004703, type: "User" } },
        { ...validAttempt, actor: { id: 894119, type: "Bot" }, triggering_actor: { id: 894119, type: "Bot" } },
        { ...validAttempt, run_attempt: 1 },
        { ...validAttempt, workflow_id: 7 },
        { ...validAttempt, path: ".github/workflows/other.yml" },
        { ...validAttempt, status: "completed", conclusion: "success" },
      ] as const) {
        expect((await runCase(hostileAttempt)).exitCode).not.toBe(0);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });



  test("gates canonical publication on exact archive and source-free signed provenance", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const parsed = Bun.YAML.parse(workflow) as { jobs: Record<string, { needs?: string | string[]; permissions: Record<string, string> }> };
    expect(Object.keys(parsed.jobs)).toEqual(["authorize", "verify", "attest", "publish", "publish_npm", "admit_npm"]);
    expect(parsed.jobs.verify!.permissions).toEqual({ actions: "read", contents: "read", checks: "read", "pull-requests": "read", "security-events": "read" });
    expect(parsed.jobs.attest!.permissions).toEqual({ actions: "read", contents: "read", "id-token": "write", attestations: "write" });
    expect(parsed.jobs.publish!.permissions).toEqual({ actions: "read", contents: "write" });
    expect(parsed.jobs.publish!.needs).toEqual(["verify", "attest"]);
    const verify = workflow.slice(workflow.indexOf("  verify:"), workflow.indexOf("  attest:"));
    const attest = workflow.slice(workflow.indexOf("  attest:"), workflow.indexOf("  publish:"));
    const publish = workflow.slice(workflow.indexOf("  publish:"), workflow.indexOf("  publish_npm:"));
    expect(verify).toContain("bun run ./scripts/release-source-ci.ts admit");
    expect(verify).toContain("bun run build"); expect(verify).toContain("package-smoke.ts");
    expect(verify).not.toContain("- run: bun run check");
    expect(verify).toContain("github-release-artifact.ts prepare");
    expect(attest).not.toContain("actions/checkout"); expect(attest).not.toContain("./scripts/");
    expect(attest).toContain("actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6");
    expect(attest).toContain("push-to-registry: false"); expect(attest).toContain("create-storage-record: false");
    expect(attest.indexOf("Reauthorize current release attempt")).toBeLessThan(attest.indexOf("actions/attest@"));
    expect(attest).toContain("EXPECTED_WORKFLOW_SHA: ${{ needs.verify.outputs.workflow_sha }}");
    expect(attest).toContain("name: canonical-attested-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(publish).toContain("artifact-ids: ${{ needs.attest.outputs.artifact_id }}");
    expect(publish).not.toContain("name: canonical-attested-");
    expect(publish).toContain("github-release-publish.ts");
    expect(workflow.slice(0, workflow.indexOf("  publish_npm:"))).not.toMatch(/npm view|npm audit signatures|npm publish/u);
    expect(workflow).not.toMatch(/WRENCH_RELEASE_APP_|website-production/u);
  });

  test("publishes a failed-jobs rerun from the carried attesting attempt's exact artifact", async () => {
    // Regression: `publish` downloaded `canonical-attested-<run>-<current attempt>`.
    // Rerunning the failed jobs of a run carries `verify` and `attest`, their
    // outputs, and their artifacts from the attesting attempt, so that name
    // selected an artifact that never existed and no rerun could publish.
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const parsed = Bun.YAML.parse(workflow) as {
      jobs: Record<string, {
        steps: { env?: Record<string, string>; name?: string; uses?: string; with?: Record<string, unknown> }[];
      }>;
    };
    const steps = parsed.jobs.publish!.steps;
    const downloads = steps.filter((step) => step.uses?.startsWith("actions/download-artifact@") === true);
    expect(downloads).toHaveLength(1);
    const download = downloads[0]!;
    type ModeledRun = Readonly<{
      artifacts: readonly Readonly<{ id: number; name: string }>[];
      attempt: number;
      carriedAttestArtifactId: string;
      runId: number;
    }>;
    // Evaluate only the expressions this step may use; anything else is unmodeled.
    const evaluate = (template: unknown, run: ModeledRun): string => {
      if (typeof template !== "string") throw new Error("Unmodeled download input value");
      const context: Readonly<Record<string, string>> = {
        "github.run_attempt": String(run.attempt),
        "github.run_id": String(run.runId),
        "needs.attest.outputs.artifact_id": run.carriedAttestArtifactId,
        "runner.temp": "/runner/temp",
      };
      return template.replace(/\$\{\{ ([^{}]+) \}\}/gu, (_expression, name: string) => {
        const value = context[name];
        if (value === undefined) throw new Error(`Unmodeled workflow expression ${name}`);
        return value;
      });
    };
    // download-artifact selects one exact name or exact numeric IDs; with neither
    // it downloads every artifact of the run.
    const selected = (run: ModeledRun): readonly number[] => {
      const inputs = download.with ?? {};
      const unmodeled = Object.keys(inputs)
        .filter((key) => !["artifact-ids", "merge-multiple", "name", "path"].includes(key));
      if (unmodeled.length !== 0) throw new Error(`Unmodeled download inputs ${unmodeled.join(",")}`);
      if (inputs.name !== undefined && inputs["artifact-ids"] !== undefined) {
        throw new Error("Modeled download both names and identifies artifacts");
      }
      if (inputs.name !== undefined) {
        const name = evaluate(inputs.name, run);
        const matches = run.artifacts.filter((artifact) => artifact.name === name);
        if (matches.length !== 1) {
          throw new Error(`Run ${String(run.runId)} attempt ${String(run.attempt)} has no artifact named ${name}`);
        }
        return matches.map((artifact) => artifact.id);
      }
      const ids = inputs["artifact-ids"] === undefined ? "" : evaluate(inputs["artifact-ids"], run);
      if (ids === "") return run.artifacts.map((artifact) => artifact.id);
      return ids.split(",").map((id) => {
        const match = run.artifacts.find((artifact) => String(artifact.id) === id.trim());
        if (match === undefined) throw new Error(`Run ${String(run.runId)} has no artifact ${id}`);
        return match.id;
      });
    };
    const firstAttempt = [
      { id: 7001, name: "canonical-build-88001-1" },
      { id: 7002, name: "canonical-attested-88001-1" },
    ] as const;
    const first = { artifacts: firstAttempt, attempt: 1, carriedAttestArtifactId: "7002", runId: 88001 };
    expect(selected(first)).toEqual([7002]);
    // "Re-run all jobs" rebuilds and reattests inside the new attempt.
    expect(selected({
      artifacts: [
        ...firstAttempt,
        { id: 7003, name: "canonical-build-88001-2" },
        { id: 7004, name: "canonical-attested-88001-2" },
      ],
      attempt: 2,
      carriedAttestArtifactId: "7004",
      runId: 88001,
    })).toEqual([7004]);
    // "Re-run failed jobs" after a publish failure uploads nothing new and
    // carries attest's numeric artifact ID from the attesting attempt.
    for (const attempt of [2, 3] as const) {
      expect(selected({ ...first, attempt })).toEqual([7002]);
    }
    expect(download.with?.["merge-multiple"]).toBe(true);
    expect(evaluate(download.with?.path, { ...first, attempt: 2 })).toBe("/runner/temp/ghostget-canonical");

    // An empty carried ID would select every run artifact, so an exact numeric
    // identity guard must run immediately before the download.
    expect(selected({ ...first, attempt: 2, carriedAttestArtifactId: "" })).toEqual([7001, 7002]);
    const names = steps.map((step) => step.name ?? step.uses?.split("@")[0]);
    const downloadIndex = steps.indexOf(download);
    expect(names.indexOf("Bind carried attested artifact identity")).toBe(downloadIndex - 1);
    expect(names.indexOf("Reauthorize current release attempt")).toBe(0);
    expect(names.slice(downloadIndex + 1)).toEqual([
      "Verify signed canonical assets and publish exact immutable Release",
    ]);
    expect(steps[downloadIndex - 1]?.env).toEqual({
      EXPECTED_ARTIFACT_ID: "${{ needs.attest.outputs.artifact_id }}",
    });
    const guard = workflowStepScript(workflow, "Bind carried attested artifact identity");
    const environment = {
      EXPECTED_ARTIFACT_ID: "7002",
      EXPECTED_BUNDLE_SHA256: "c".repeat(64),
      EXPECTED_RELEASE_NOTES_SHA256: "d".repeat(64),
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_RUN_ID: "88001",
      VERIFIED_SHA: "a".repeat(40),
      VERIFIED_TAG: "v0.18.33",
      WORKFLOW_SHA: "b".repeat(40),
    };
    const accepted = await runWorkflowScript(guard, environment);
    expect(accepted.exitCode, accepted.stderr).toBe(0);
    for (const override of [
      { EXPECTED_ARTIFACT_ID: "" },
      { EXPECTED_ARTIFACT_ID: "0" },
      { EXPECTED_ARTIFACT_ID: "07002" },
      { EXPECTED_ARTIFACT_ID: "7002,7001" },
      { EXPECTED_ARTIFACT_ID: "7002 " },
      { EXPECTED_BUNDLE_SHA256: "" },
      { EXPECTED_RELEASE_NOTES_SHA256: "" },
      { EXPECTED_RELEASE_NOTES_SHA256: "D".repeat(64) },
      { GITHUB_RUN_ATTEMPT: "0" },
      { GITHUB_RUN_ID: "" },
      { VERIFIED_SHA: "A".repeat(40) },
      { VERIFIED_TAG: "v0.18" },
      { WORKFLOW_SHA: "" },
    ] as const) {
      const rejected = await runWorkflowScript(guard, { ...environment, ...override });
      expect(rejected.exitCode).not.toBe(0);
      expect(`${rejected.stdout}${rejected.stderr}`).toContain("no exact immutable identity");
    }
  });






  test("parses one authenticated GitHub server Date response", () => {
    const body = JSON.stringify(providerRef(providerPreviousSha));
    expect(parseIncludedGitHubResponse(
      `HTTP/2.0 200 OK\r\ndate: Sat, 29 Aug 2026 15:01:00 GMT\r\ncontent-type: application/json\r\n\r\n${body}\n`,
    )).toEqual({
      body: providerRef(providerPreviousSha),
      serverDate: providerServerDate,
    });

    for (const response of [
      `HTTP/2.0 200 OK\ncontent-type: application/json\n\n${body}`,
      `HTTP/2.0 200 OK\ndate: Sat, 29 Aug 2026 15:01:00 GMT\ndate: Sat, 29 Aug 2026 15:01:01 GMT\n\n${body}`,
      `HTTP/2.0 404 Not Found\ndate: Sat, 29 Aug 2026 15:01:00 GMT\n\n${body}`,
      `HTTP/2.0 200 OK\ndate: Fri, 29 Aug 2026 15:01:00 GMT\n\n${body}`,
      "HTTP/2.0 200 OK\ndate: Sat, 29 Aug 2026 15:01:00 GMT\n\nnot-json",
      body,
    ] as const) {
      expect(() => parseIncludedGitHubResponse(response)).toThrow();
    }

    const oversizedBody = `"${"x".repeat(8 * 1024 * 1024)}"`;
    expect(() => parseIncludedGitHubResponse(
      `HTTP/2.0 200 OK\r\ndate: Sat, 29 Aug 2026 15:01:00 GMT\r\n\r\n${oversizedBody}`,
    )).toThrow("exceeds the bounded response size");

  });

  test("bounds the published stable-release ordering scan", async () => {
    const publishedRelease = (
      id: number,
      tagName: string,
      overrides: Readonly<Record<string, ProviderJson>> = {},
    ): ProviderJson => ({
      draft: false,
      id,
      immutable: true,
      prerelease: false,
      published_at: "2026-08-29T14:00:00Z",
      tag_name: tagName,
      ...overrides,
    });
    const releaseApi = (releases: readonly ProviderJson[]) => {
      const calls: string[] = [];
      return {
        calls,
        async get(endpoint: string): Promise<ProviderJson> {
          calls.push(endpoint);
          const match = new RegExp(
            `^/repos/${providerRepository}/releases\\?per_page=100&page=([1-6])$`,
            "u",
          ).exec(endpoint);
          if (match === null) throw new Error(`Unexpected release GET ${endpoint}`);
          const page = Number(match[1]);
          return releases.slice((page - 1) * 100, page * 100);
        },
      };
    };

    const accepted = releaseApi([
      publishedRelease(1, "v0.16.1"),
      publishedRelease(2, "v9.0.0", { draft: true }),
      publishedRelease(3, "v9.0.0", { prerelease: true }),
      publishedRelease(4, "nightly"),
    ]);
    await expect(assertReleaseTagNewerThanPublished({
      api: accepted,
      repository: providerRepository,
      verifiedTag: providerTag,
    })).resolves.toBeUndefined();
    expect(accepted.calls).toHaveLength(6);

    for (const current of ["v0.16.2", "v0.17.0"] as const) {
      await expect(assertReleaseTagNewerThanPublished({
        api: releaseApi([publishedRelease(1, current)]),
        repository: providerRepository,
        verifiedTag: providerTag,
      })).rejects.toThrow(`is not newer than ${current}`);
    }

    await expect(assertReleaseTagNewerThanPublished({
      api: releaseApi([publishedRelease(1, "v0.16.1", { immutable: false })]),
      repository: providerRepository,
      verifiedTag: providerTag,
    })).rejects.toThrow("Published stable Release v0.16.1 is not immutable");
    await expect(assertReleaseTagNewerThanPublished({
      api: releaseApi([{ draft: false, id: 1, prerelease: false, tag_name: "v0.16.1" }]),
      repository: providerRepository,
      verifiedTag: providerTag,
    })).rejects.toThrow("published releases page 1 item 0 immutable is not a boolean");
    await expect(assertReleaseTagNewerThanPublished({
      api: releaseApi([publishedRelease(1, "v0.16.1", { immutable: "true" })]),
      repository: providerRepository,
      verifiedTag: providerTag,
    })).rejects.toThrow("published releases page 1 item 0 immutable is not a boolean");
    await expect(assertReleaseTagNewerThanPublished({
      api: releaseApi([{
        draft: false,
        id: 1,
        immutable: true,
        prerelease: false,
        tag_name: "v0.16.1",
      }]),
      repository: providerRepository,
      verifiedTag: providerTag,
    })).rejects.toThrow("published releases page 1 item 0 published_at is not a string");
    for (const publishedAt of [null, "not-a-timestamp"] as const) {
      await expect(assertReleaseTagNewerThanPublished({
        api: releaseApi([publishedRelease(1, "v0.16.1", { published_at: publishedAt })]),
        repository: providerRepository,
        verifiedTag: providerTag,
      })).rejects.toThrow("published releases page 1 item 0 published_at");
    }

    const overCap = Array.from(
      { length: 501 },
      (_, index) => publishedRelease(index + 1, "nightly"),
    );
    await expect(assertReleaseTagNewerThanPublished({
      api: releaseApi(overCap),
      repository: providerRepository,
      verifiedTag: providerTag,
    })).rejects.toThrow("exceed the 500-item audit cap");
    await expect(assertReleaseTagNewerThanPublished({
      api: releaseApi([null]),
      repository: providerRepository,
      verifiedTag: providerTag,
    })).rejects.toThrow("is not an object");

    await expect(assertReleaseTagNewerThanPublished({
      allowExistingTarget: true,
      api: releaseApi([publishedRelease(1, providerTag)]),
      repository: providerRepository,
      verifiedTag: providerTag,
    })).resolves.toBeUndefined();
    await expect(assertReleaseTagNewerThanPublished({
      allowExistingTarget: true,
      api: releaseApi([]),
      repository: providerRepository,
      verifiedTag: providerTag,
    })).rejects.toThrow("does not contain exactly one existing v0.16.2");
    await expect(assertReleaseTagNewerThanPublished({
      allowExistingTarget: true,
      api: releaseApi([
        publishedRelease(1, providerTag),
        publishedRelease(2, "v0.16.3"),
      ]),
      repository: providerRepository,
      verifiedTag: providerTag,
    })).rejects.toThrow("is not newer than v0.16.3");

    await expect(assertReleaseTagNewerThanPublished({
      api: releaseApi([publishedRelease(1, "v9007199254740990.0.0")]),
      repository: providerRepository,
      verifiedTag: "v9007199254740991.0.0",
    })).resolves.toBeUndefined();
    await expect(assertReleaseTagNewerThanPublished({
      api: releaseApi([]),
      repository: providerRepository,
      verifiedTag: "v9007199254740992.0.0",
    })).rejects.toThrow("npm's safe numeric range");
  });

  test("binds a workflow-published Release to its exact bot, source, and run receipt", () => {
    const workflowRunId = "88001";
    const receipt = releaseSourceReceipt({
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
      workflowRunId,
    });
    const exactRelease = providerRelease({
      author: { id: 41898282, login: "github-actions[bot]", type: "Bot" },
      body: `${receipt}\n\n## What's Changed\nGenerated notes are not authority.`,
      name: `Ghostget ${providerTag}`,
      target_commitish: "main",
    });
    const coordinates = {
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
      workflowRunId,
    };
    expect(exactWorkflowPublishedRelease({ ...coordinates, value: exactRelease }))
      .toEqual(exactRelease);
    const presentationDrift = {
      ...exactRelease,
      author: { id: 41898282, login: "renamed-actions-bot", type: "Bot" },
      name: "Renamed release presentation",
    };
    expect(exactWorkflowPublishedRelease({ ...coordinates, value: presentationDrift }))
      .toEqual(presentationDrift);
    expect(exactWorkflowPublishedRelease({
      ...coordinates,
      value: { ...exactRelease, target_commitish: providerVerifiedSha },
    })).toEqual({ ...exactRelease, target_commitish: providerVerifiedSha });
    for (const overrides of [
      { author: { id: 7, login: "github-actions[bot]", type: "Bot" } },
      { author: { id: 41898282, login: "owner", type: "User" } },
      { body: `${receipt}suffix` },
      { body: releaseSourceReceipt({ ...coordinates, workflowRunId: "88002" }) },
    ] as const) {
      expect(() => exactWorkflowPublishedRelease({
        ...coordinates,
        value: { ...exactRelease, ...overrides },
      })).toThrow("exact Actions workflow identity and source receipt");
    }
  });

  test("derives and validates the exact successful Release workflow run", async () => {
    const coordinates = {
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    };
    expect(releaseWorkflowRunIdFromPublishedRelease({
      ...coordinates,
      value: providerRelease(),
    })).toBe(providerReleaseWorkflowRunId);
    expect(exactReleaseWorkflowRun({
      ...coordinates,
      expectedRunAttempt: "3",
      value: providerReleaseWorkflowRun({ run_attempt: 3 }),
      workflowRunId: providerReleaseWorkflowRunId,
    })).toEqual(providerReleaseWorkflowRun({ run_attempt: 3 }));
    const runPresentationDrift = providerReleaseWorkflowRun({
      actor: { id: 894119, login: "renamed-owner", type: "User" },
      name: "Renamed release workflow presentation",
      run_attempt: 3,
      triggering_actor: { id: 894119, login: "renamed-owner", type: "User" },
    });
    expect(exactReleaseWorkflowRun({
      ...coordinates,
      expectedRunAttempt: "3",
      value: runPresentationDrift,
      workflowRunId: providerReleaseWorkflowRunId,
    })).toEqual(runPresentationDrift);
    const taggerRun = providerReleaseWorkflowRun({
      actor: { id: 337004703, login: "hraness-release-tagger[bot]", type: "Bot" },
      run_attempt: 3,
      triggering_actor: { id: 337004703, login: "hraness-release-tagger[bot]", type: "Bot" },
    });
    expect(exactReleaseWorkflowRun({
      ...coordinates,
      expectedRunAttempt: "3",
      value: taggerRun,
      workflowRunId: providerReleaseWorkflowRunId,
    })).toEqual(taggerRun);

    const receipt = releaseSourceReceipt({
      ...coordinates,
      workflowRunId: providerReleaseWorkflowRunId,
    });
    for (const body of [
      `\n${receipt}`,
      `${receipt}\nnotes without the generated-note separator`,
      receipt.replace("workflow_run_id=88001", "workflow_run_id=0"),
      receipt.replace("workflow_run_id=88001", "workflow_run_id=088001"),
      receipt.replace("workflow_run_id=88001", "workflow_run_id=9007199254740992"),
      receipt.replace("repository=hraness/wrench tag=", "tag=v0.16.2 repository=hraness/wrench "),
    ]) {
      expect(() => releaseWorkflowRunIdFromPublishedRelease({
        ...coordinates,
        value: providerRelease({ body }),
      })).toThrow();
    }

    const repository = {
      full_name: providerRepository,
      id: GHOSTGET_REPOSITORY_ID,
      private: false,
    };
    for (const overrides of [
      { id: 88002 },
      { workflow_id: 1 },
      { path: ".github/workflows/copied.yml" },
      { event: "workflow_dispatch" },
      { head_branch: "main" },
      { head_sha: "3".repeat(40) },
      { run_attempt: 0 },
      { run_attempt: 1.5 },
      { run_attempt: Number.MAX_SAFE_INTEGER + 1 },
      { status: "in_progress" },
      { conclusion: "failure" },
      { actor: { id: 7, login: "0thernet", type: "User" } },
      { actor: { id: 894119, login: "0thernet", type: "Bot" } },
      { triggering_actor: { id: 7, login: "0thernet", type: "User" } },
      { triggering_actor: { id: 894119, login: "0thernet", type: "Bot" } },
      { actor: { id: 41898282, login: "github-actions[bot]", type: "Bot" } },
      { actor: { id: 337004703, login: "hraness-release-tagger[bot]", type: "User" } },
      { triggering_actor: { id: 41898282, login: "github-actions[bot]", type: "Bot" } },
      { triggering_actor: { id: 337004703, login: "hraness-release-tagger[bot]", type: "User" } },
      { repository: { ...repository, id: 1 } },
      { repository: { ...repository, full_name: "hraness/copied" } },
      { repository: { ...repository, private: true } },
      { head_repository: { ...repository, id: 1 } },
      { head_repository: { ...repository, full_name: "hraness/copied" } },
      { head_repository: { ...repository, private: true } },
    ] as const) {
      expect(() => exactReleaseWorkflowRun({
        ...coordinates,
        value: providerReleaseWorkflowRun(overrides),
        workflowRunId: providerReleaseWorkflowRunId,
      })).toThrow();
    }
    expect(() => exactReleaseWorkflowRun({
      ...coordinates,
      expectedRunAttempt: "1",
      value: providerReleaseWorkflowRun({ run_attempt: 3 }),
      workflowRunId: providerReleaseWorkflowRunId,
    })).toThrow("does not match the triggering Release run attempt");

    // A receipt attempt that published the immutable Release and then failed a
    // later npm job is admitted only with its complete canonical job inventory.
    const canonicalJob = (name: string, overrides: Record<string, ProviderJson> = {}): ProviderJson => ({
      id: 5000 + CANONICAL_RELEASE_JOBS.indexOf(name), name, run_id: Number(providerReleaseWorkflowRunId), run_attempt: 1,
      head_sha: providerVerifiedSha, status: "completed", conclusion: "success", ...overrides,
    });
    const npmJob = { id: 5010, name: "Publish exact npm package through OIDC", run_id: Number(providerReleaseWorkflowRunId),
      run_attempt: 1, head_sha: providerVerifiedSha, status: "completed", conclusion: "failure" };
    const canonicalJobs = (mutate: (jobs: ProviderJson[]) => void = () => {}): ProviderJson => {
      const jobs = [...CANONICAL_RELEASE_JOBS.map((name) => canonicalJob(name)), npmJob];
      mutate(jobs);
      return { total_count: jobs.length, jobs };
    };
    const failedAttempt = providerReleaseWorkflowRun({ conclusion: "failure" });
    expect(exactReleaseWorkflowRun({
      ...coordinates, canonicalJobs: canonicalJobs(), expectedRunAttempt: "1", value: failedAttempt,
      workflowRunId: providerReleaseWorkflowRunId,
    })).toEqual(failedAttempt);
    expect(() => exactReleaseWorkflowRun({
      ...coordinates, expectedRunAttempt: "1", value: failedAttempt, workflowRunId: providerReleaseWorkflowRunId,
    })).toThrow("exact successful Release workflow identity");
    for (const [mutate, message] of [
      [(jobs: ProviderJson[]) => { (jobs[3] as Record<string, ProviderJson>).conclusion = "failure"; }, "did not succeed in the receipt attempt"],
      [(jobs: ProviderJson[]) => { (jobs[1] as Record<string, ProviderJson>).status = "in_progress"; }, "did not succeed in the receipt attempt"],
      [(jobs: ProviderJson[]) => { (jobs[2] as Record<string, ProviderJson>).run_attempt = 2; }, "did not succeed in the receipt attempt"],
      [(jobs: ProviderJson[]) => { (jobs[0] as Record<string, ProviderJson>).head_sha = "3".repeat(40); }, "did not succeed in the receipt attempt"],
      [(jobs: ProviderJson[]) => { jobs.splice(3, 1); }, "does not contain exactly one"],
      [(jobs: ProviderJson[]) => { jobs.push(canonicalJob("Verify")); }, "does not contain exactly one"],
    ] as const) {
      expect(() => exactReleaseWorkflowRun({
        ...coordinates, canonicalJobs: canonicalJobs(mutate), expectedRunAttempt: "1", value: failedAttempt,
        workflowRunId: providerReleaseWorkflowRunId,
      })).toThrow(message);
    }
    expect(() => exactReleaseWorkflowRun({
      ...coordinates, canonicalJobs: { total_count: 6, jobs: canonicalJobs().jobs }, expectedRunAttempt: "1", value: failedAttempt,
      workflowRunId: providerReleaseWorkflowRunId,
    })).toThrow("complete bounded job inventory");
    expect(() => exactReleaseWorkflowRun({
      ...coordinates, canonicalJobs: canonicalJobs(), value: providerReleaseWorkflowRun({ status: "in_progress", conclusion: null }),
      workflowRunId: providerReleaseWorkflowRunId,
    })).toThrow("exact successful Release workflow identity");

  });



  test("property: the canonical download admits an intermediate attempt only when it is exact, bounded, and proves all four jobs", () => {
    const conclusion = fc.constantFrom("success", "failure", "skipped");
    const intermediate = fc.record({
      drift: fc.constantFrom("none", "none", "none", "triggering-actor", "run", "attempt", "source"),
      publish: conclusion,
      verify: conclusion,
      jobAttemptDrift: fc.boolean(),
    });
    assertProperty(fc.property(
      fc.record({
        currentPublish: conclusion,
        gap: fc.integer({ min: 0, max: MAX_INTERMEDIATE_RELEASE_ATTEMPTS + 2 }),
        intermediates: fc.array(intermediate, {
          maxLength: MAX_INTERMEDIATE_RELEASE_ATTEMPTS + 2,
          minLength: MAX_INTERMEDIATE_RELEASE_ATTEMPTS + 2,
        }),
        readAttemptRun: fc.boolean(),
        receiptAttempt: fc.integer({ min: 1, max: 3 }),
      }),
      ({ currentPublish, gap, intermediates, readAttemptRun, receiptAttempt }) => {
        const currentAttempt = receiptAttempt + gap + 1;
        const between = Array.from({ length: gap }, (_, index) => receiptAttempt + 1 + index);
        const reads: string[] = [];
        const runs = new Map<number, ProviderJson>();
        const inventories = new Map<number, ProviderJson>();
        between.forEach((attempt, index) => {
          const shape = intermediates[index]!;
          runs.set(attempt, providerReleaseWorkflowRun({
            conclusion: "failure",
            run_attempt: shape.drift === "attempt" ? attempt + 1 : attempt,
            ...(shape.drift === "triggering-actor" ? { triggering_actor: { id: 7, login: "0thernet", type: "User" } } : {}),
            ...(shape.drift === "run" ? { id: 88002 } : {}),
            ...(shape.drift === "source" ? { head_sha: "3".repeat(40) } : {}),
          }));
          inventories.set(attempt, providerReleaseJobs(attempt, {
            Verify: { conclusion: shape.verify },
            "Publish immutable GitHub Release": {
              conclusion: shape.publish,
              ...(shape.jobAttemptDrift ? { run_attempt: currentAttempt } : {}),
            },
          }));
        });
        inventories.set(currentAttempt, providerReleaseJobs(currentAttempt, {
          "Publish immutable GitHub Release": { conclusion: currentPublish },
        }));
        const input = {
          canonicalJobs: providerReleaseJobs(receiptAttempt, {
            "Admit exact public npm package": { conclusion: "skipped" },
            "Publish exact npm package through OIDC": { conclusion: "skipped" },
            "Publish immutable GitHub Release": { conclusion: "failure" },
          }),
          expectedRunAttempt: String(receiptAttempt),
          readAttemptJobs: (attempt: number): ProviderJson => {
            reads.push(`jobs ${String(attempt)}`);
            const inventory = inventories.get(attempt);
            if (inventory === undefined) throw new Error(`Unexpected attempt ${String(attempt)} job inventory read`);
            return inventory;
          },
          readCurrentRun: (): ProviderJson => {
            reads.push("run");
            return providerReleaseWorkflowRun({ conclusion: "failure", run_attempt: currentAttempt });
          },
          ...(readAttemptRun
            ? {
              readAttemptRun: (attempt: number): ProviderJson => {
                reads.push(`attempt ${String(attempt)}`);
                const value = runs.get(attempt);
                if (value === undefined) throw new Error(`Unexpected attempt ${String(attempt)} read`);
                return value;
              },
            }
            : {}),
          repository: providerRepository,
          value: providerReleaseWorkflowRun({ conclusion: "failure", run_attempt: receiptAttempt }),
          verifiedSha: providerVerifiedSha,
          verifiedTag: providerTag,
          workflowRunId: providerReleaseWorkflowRunId,
        };

        // The reference: the current attempt proves all four, or, within the
        // bound, the first exact intermediate attempt in ascending order does
        // before any intermediate attempt with drifted identity.
        const expectedReads = ["run", `jobs ${String(currentAttempt)}`];
        let admitted = currentPublish === "success";
        if (!admitted && readAttemptRun && gap >= 1 && gap <= MAX_INTERMEDIATE_RELEASE_ATTEMPTS) {
          for (const [index, attempt] of between.entries()) {
            const shape = intermediates[index]!;
            expectedReads.push(`attempt ${String(attempt)}`);
            if (shape.drift !== "none") break;
            expectedReads.push(`jobs ${String(attempt)}`);
            if (shape.verify === "success" && shape.publish === "success" && !shape.jobAttemptDrift) {
              admitted = true;
              break;
            }
          }
        }
        let refusal: string | null = null;
        try {
          expect(exactReleaseWorkflowRun(input)).toEqual(input.value);
        } catch (error) {
          refusal = error instanceof Error ? error.message : String(error);
        }
        expect({ admitted: refusal === null, reads }).toEqual({ admitted, reads: expectedReads });
        expect(reads.length).toBeLessThanOrEqual(2 + 2 * MAX_INTERMEDIATE_RELEASE_ATTEMPTS);
      },
    ));
  });

  test("admits a receipt attempt whose publication a later failed-jobs rerun of the same run completed", () => {
    // Regression: when the receipt attempt attested the canonical bytes and its
    // publish job failed, rerunning the failed jobs of that same run is the only
    // way to publish those exact signed bytes. The canonical download admitted
    // publication only inside the receipt attempt, so the published Release
    // could never be promoted.
    const coordinates = {
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
      workflowRunId: providerReleaseWorkflowRunId,
    };
    const unpublished = {
      "Admit exact public npm package": { conclusion: "skipped" },
      "Publish exact npm package through OIDC": { conclusion: "skipped" },
      "Publish immutable GitHub Release": { conclusion: "failure" },
    } as const;
    const receipt = providerReleaseWorkflowRun({ conclusion: "failure" });
    const receiptJobs = providerReleaseJobs(1, unpublished);
    const recovery = (current: ProviderJson, inventories: ReadonlyMap<number, ProviderJson>) => {
      const reads: string[] = [];
      return {
        readers: {
          readAttemptJobs: (attempt: number): ProviderJson => {
            reads.push(`jobs ${String(attempt)}`);
            const inventory = inventories.get(attempt);
            if (inventory === undefined) {
              throw new Error(`Unexpected attempt ${String(attempt)} job inventory read`);
            }
            return inventory;
          },
          readCurrentRun: (): ProviderJson => {
            reads.push("run");
            return current;
          },
        },
        reads,
      };
    };

    for (const [current, inventories] of [
      [providerReleaseWorkflowRun({ run_attempt: 2 }), new Map([[2, providerReleaseJobs(2)]])],
      [
        providerReleaseWorkflowRun({ conclusion: "failure", run_attempt: 2 }),
        new Map([[2, providerReleaseJobs(2, { "Admit exact public npm package": { conclusion: "failure" } })]]),
      ],
      [providerReleaseWorkflowRun({ run_attempt: 3 }), new Map([[3, providerReleaseJobs(3)]])],
    ] as const) {
      const attempt = recovery(current, inventories);
      expect(exactReleaseWorkflowRun({
        ...coordinates,
        canonicalJobs: receiptJobs,
        expectedRunAttempt: "1",
        value: receipt,
        ...attempt.readers,
      })).toEqual(receipt);
      expect(attempt.reads).toEqual([
        "run",
        `jobs ${String((current as Readonly<Record<string, ProviderJson>>).run_attempt)}`,
      ]);
    }

    const rejectRecovery = (
      message: string,
      current: ProviderJson,
      inventories: ReadonlyMap<number, ProviderJson>,
      reads: string[],
      receiptInventory: ProviderJson = receiptJobs,
    ): void => {
      const attempt = recovery(current, inventories);
      expect(() => exactReleaseWorkflowRun({
        ...coordinates,
        canonicalJobs: receiptInventory,
        expectedRunAttempt: "1",
        value: receipt,
        ...attempt.readers,
      })).toThrow(message);
      expect(attempt.reads).toEqual(reads);
    };
    const laterJobs = new Map([[2, providerReleaseJobs(2)]]);
    // The current attempt must be a strictly later, completed, exact attempt of this run.
    rejectRecovery(
      "later attempt",
      providerReleaseWorkflowRun({ conclusion: "failure" }),
      new Map([[1, receiptJobs]]),
      ["run"],
    );
    for (const current of [
      providerReleaseWorkflowRun({ conclusion: null, run_attempt: 2, status: "in_progress" }),
      providerReleaseWorkflowRun({ head_sha: "3".repeat(40), run_attempt: 2 }),
      providerReleaseWorkflowRun({ id: 88002, run_attempt: 2 }),
      providerReleaseWorkflowRun({ head_branch: "v0.16.3", run_attempt: 2 }),
      providerReleaseWorkflowRun({ run_attempt: 2, workflow_id: 1 }),
    ] as const) {
      rejectRecovery("exact successful Release workflow identity", current, laterJobs, ["run"]);
    }
    rejectRecovery(
      "triggering_actor is not the exact release owner",
      providerReleaseWorkflowRun({
        run_attempt: 2,
        triggering_actor: { id: 7, login: "0thernet", type: "User" },
      }),
      laterJobs,
      ["run"],
    );
    // All four canonical jobs must have succeeded in that later attempt's own inventory.
    for (const [inventory, message] of [
      [providerReleaseJobs(2, { "Publish immutable GitHub Release": { conclusion: "failure" } }),
        "Publish immutable GitHub Release job did not succeed"],
      [providerReleaseJobs(2, { Verify: { conclusion: "failure" } }), "Verify job did not succeed"],
      [providerReleaseJobs(2, { "Attest exact canonical build files": { run_attempt: 1 } }),
        "Attest exact canonical build files job did not succeed"],
      [providerReleaseJobs(2, { "Authorize owner release tag": { head_sha: "3".repeat(40) } }),
        "Authorize owner release tag job did not succeed"],
      [{ ...providerReleaseJobs(2) as Record<string, ProviderJson>, total_count: 7 },
        "complete bounded job inventory"],
    ] as const) {
      rejectRecovery(message, providerReleaseWorkflowRun({ run_attempt: 2 }), new Map([[2, inventory]]), [
        "run",
        "jobs 2",
      ]);
    }
    // The receipt attempt must itself have attested the bytes and carry an exact
    // unsuccessful publish job; otherwise no later attempt is consulted.
    for (const [inventory, message] of [
      [providerReleaseJobs(1, {
        ...unpublished,
        "Attest exact canonical build files": { conclusion: "failure" },
      }), "Attest exact canonical build files job did not succeed in the receipt attempt"],
      [providerReleaseJobs(1, {
        ...unpublished,
        "Publish immutable GitHub Release": { conclusion: "failure", run_attempt: 2 },
      }), "Publish immutable GitHub Release job did not succeed in the receipt attempt"],
      [providerReleaseJobs(1, {
        ...unpublished,
        "Publish immutable GitHub Release": { conclusion: null, status: "in_progress" },
      }), "Publish immutable GitHub Release job did not succeed in the receipt attempt"],
      [providerReleaseJobs(1, {
        ...unpublished,
        "Publish immutable GitHub Release": { conclusion: "failure", head_sha: "3".repeat(40) },
      }), "Publish immutable GitHub Release job did not succeed in the receipt attempt"],
    ] as const) {
      rejectRecovery(message, providerReleaseWorkflowRun({ run_attempt: 2 }), laterJobs, [], inventory);
    }
    // Without both readers the receipt attempt alone must prove publication.
    for (const readers of [
      {},
      { readCurrentRun: (): ProviderJson => providerReleaseWorkflowRun({ run_attempt: 2 }) },
      { readAttemptJobs: (): ProviderJson => providerReleaseJobs(2) },
    ] as const) {
      expect(() => exactReleaseWorkflowRun({
        ...coordinates,
        canonicalJobs: receiptJobs,
        expectedRunAttempt: "1",
        value: receipt,
        ...readers,
      })).toThrow("Publish immutable GitHub Release job did not succeed in the receipt attempt");
    }
  });

  test("property: rerun publication admission follows the attesting attempt and a later exact canonical attempt", () => {
    const conclusion = fc.constantFrom("success", "failure", "cancelled", "skipped");
    const canonicalConclusions = fc.tuple(conclusion, conclusion, conclusion, conclusion);
    assertProperty(fc.property(
      fc.record({
        currentAttemptOffset: fc.integer({ min: -2, max: 2 }),
        currentConclusions: canonicalConclusions,
        currentDrift: fc.constantFrom("none", "status", "source", "job-attempt"),
        npmConclusion: conclusion,
        readers: fc.boolean(),
        receiptAttempt: fc.integer({ min: 1, max: 3 }),
        receiptConclusions: canonicalConclusions,
      }),
      ({
        currentAttemptOffset,
        currentConclusions,
        currentDrift,
        npmConclusion,
        readers,
        receiptAttempt,
        receiptConclusions,
      }) => {
        const currentAttempt = Math.max(1, receiptAttempt + currentAttemptOffset);
        const conclusions = (values: readonly string[]) => Object.fromEntries(
          CANONICAL_RELEASE_JOBS.map((name: string, index: number) => [name, { conclusion: values[index] ?? "" }]),
        );
        const receiptSucceeded = [...receiptConclusions, npmConclusion].every((value) => value === "success");
        const attested = receiptConclusions.slice(0, 3).every((value) => value === "success");
        const published = receiptConclusions[3] === "success";
        const currentExact = currentDrift !== "status" && currentDrift !== "source";
        const reads: string[] = [];
        const receipt = providerReleaseWorkflowRun({
          conclusion: receiptSucceeded ? "success" : "failure",
          run_attempt: receiptAttempt,
        });
        const current = providerReleaseWorkflowRun({
          conclusion: "failure",
          run_attempt: currentAttempt,
          ...(currentDrift === "status" ? { conclusion: null, status: "in_progress" } : {}),
          ...(currentDrift === "source" ? { head_sha: "3".repeat(40) } : {}),
        });
        const currentJobs = providerReleaseJobs(currentAttempt, Object.fromEntries(
          Object.entries(conclusions(currentConclusions)).map(([name, value]) => [name, {
            ...value,
            ...(currentDrift === "job-attempt" ? { run_attempt: currentAttempt + 1 } : {}),
          }]),
        ));
        const input = {
          canonicalJobs: providerReleaseJobs(receiptAttempt, {
            ...conclusions(receiptConclusions),
            "Admit exact public npm package": { conclusion: npmConclusion },
          }),
          expectedRunAttempt: String(receiptAttempt),
          repository: providerRepository,
          value: receipt,
          verifiedSha: providerVerifiedSha,
          verifiedTag: providerTag,
          workflowRunId: providerReleaseWorkflowRunId,
          ...(readers
            ? {
              readAttemptJobs: (attempt: number): ProviderJson => {
                reads.push(`jobs ${String(attempt)}`);
                return currentJobs;
              },
              readCurrentRun: (): ProviderJson => {
                reads.push("run");
                return current;
              },
            }
            : {}),
        };
        const recoveryConsulted = !receiptSucceeded && attested && !published && readers;
        const laterAttemptRead = recoveryConsulted && currentExact && currentAttempt > receiptAttempt;
        const laterPublication = laterAttemptRead
          && currentDrift === "none"
          && currentConclusions.every((value) => value === "success");
        const admitted = receiptSucceeded || (attested && (published || laterPublication));
        if (admitted) expect(exactReleaseWorkflowRun(input)).toEqual(receipt);
        else expect(() => exactReleaseWorkflowRun(input)).toThrow();
        expect(reads).toEqual([
          ...(recoveryConsulted ? ["run"] : []),
          ...(laterAttemptRead ? [`jobs ${String(currentAttempt)}`] : []),
        ]);
      },
    ));
  });











  test("keeps installation coordinates aligned with the canonical source version", async () => {
    const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as { version: string };
    const url = `https://github.com/hraness/ghostget/releases/download/v${manifest.version}/hraness-ghostget-${manifest.version}.tgz`;
    for (const source of [readmeUrl, skillInstallGuideUrl, publishingGuideUrl]) {
      const text = await readFile(source, "utf8"); expect(text).toContain(url);
    }
  });

});


describe("canonical npm package identity", () => {
  test("accepts transport and metadata-order drift while rejecting metadata, content, mode, and link drift", async () => {
    const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as {
      readonly name: string;
      readonly version: string;
    };
    const filename = `hraness-ghostget-${manifest.version}.tgz`;
    const work = await mkdtemp(join(tmpdir(), "ghostget-package-identity-test-"));
    try {
      const sourceDirectory = join(work, "source");
      const registryDirectory = join(work, "registry");
      await mkdir(sourceDirectory);
      await mkdir(registryDirectory);
      const sourceArchive = join(sourceDirectory, filename);
      const registryArchive = join(registryDirectory, filename);
      await run([
        process.execPath,
        "pm",
        "pack",
        "--filename",
        sourceArchive,
        "--ignore-scripts",
        "--quiet",
      ], repository);

      const sourceBytes = await readFile(sourceArchive);
      const transportVariant = Buffer.from(sourceBytes);
      transportVariant[9] = transportVariant[9] === 3 ? 0 : 3;
      expect(transportVariant.equals(sourceBytes)).toBe(false);
      expect(gunzipSync(transportVariant).equals(gunzipSync(sourceBytes))).toBe(true);
      await writeFile(registryArchive, transportVariant);

      const [sourceInventory, registryInventory] = await Promise.all([
        inspectPackageArtifact(sourceArchive),
        inspectPackageArtifact(registryArchive),
      ]);
      const sourcePackJson = join(sourceDirectory, "npm-pack.json");
      const registryPackJson = join(registryDirectory, "npm-pack.json");
      const registryViewJson = join(registryDirectory, "npm-view.json");
      await Promise.all([
        writeFile(
          sourcePackJson,
          packJson(sourceBytes, sourceInventory, manifest.name, manifest.version),
        ),
        writeFile(
          registryPackJson,
          packJson(
            transportVariant,
            registryInventory,
            manifest.name,
            manifest.version,
            true,
          ),
        ),
        writeFile(
          registryViewJson,
          registryView(transportVariant, registryInventory, manifest.name, manifest.version),
        ),
      ]);
      const validInput = Object.freeze({
        expectedName: manifest.name,
        expectedVersion: manifest.version,
        registryArchive,
        registryPackJson,
        registryViewJson,
        sourceArchive,
        sourcePackJson,
      });
      const verified = await verifyNpmPackageIdentity(validInput);
      expect(verified.fileCount).toBe(sourceInventory.fileCount);
      expect(verified.sourceArchiveSha512).not.toBe(verified.registryArchiveSha512);
      await expect(verifyNpmPackageIdentity({
        ...validInput,
        expectedVersion: "9007199254740992.0.0",
      })).rejects.toThrow("Expected package version is not stable semantic version");

      const registryViewValue = JSON.parse(await readFile(registryViewJson, "utf8")) as {
        dist: { attestations?: unknown; signatures?: unknown[] };
      };
      const missingAttestationView = join(registryDirectory, "npm-view-no-attestation.json");
      const noAttestation = structuredClone(registryViewValue);
      delete noAttestation.dist.attestations;
      await writeFile(missingAttestationView, `${JSON.stringify(noAttestation)}\n`, "utf8");
      await expect(verifyNpmPackageIdentity({
        ...validInput,
        registryViewJson: missingAttestationView,
      })).rejects.toThrow("npm registry view.dist.attestations must be an object");

      const emptySignatureView = join(registryDirectory, "npm-view-no-signature.json");
      const noSignature = structuredClone(registryViewValue);
      noSignature.dist.signatures = [];
      await writeFile(emptySignatureView, `${JSON.stringify(noSignature)}\n`, "utf8");
      await expect(verifyNpmPackageIdentity({
        ...validInput,
        registryViewJson: emptySignatureView,
      })).rejects.toThrow("npm registry package has no registry signature");

      const metadataDirectory = join(work, "metadata-mode");
      await mkdir(metadataDirectory);
      const metadataPackJson = join(metadataDirectory, "npm-pack.json");
      const metadataRecord = JSON.parse(
        packJson(transportVariant, registryInventory, manifest.name, manifest.version),
      ) as [{ files: Array<{ mode: number }> }];
      const firstMetadataFile = metadataRecord[0].files[0];
      if (firstMetadataFile === undefined) throw new Error("Test package has no metadata file");
      firstMetadataFile.mode = firstMetadataFile.mode === 0o644 ? 0o755 : 0o644;
      await writeFile(metadataPackJson, `${JSON.stringify(metadataRecord, null, 2)}\n`);
      await expect(verifyNpmPackageIdentity({
        ...validInput,
        registryPackJson: metadataPackJson,
      })).rejects.toThrow("Registry npm pack metadata differs from tar path, mode, or size");

      const originalTar = gunzipSync(sourceBytes);
      const first = firstRegularHeader(originalTar);

      const modeDirectory = join(work, "mode");
      await mkdir(modeDirectory);
      const modeArchive = join(modeDirectory, filename);
      const modeTar = Buffer.from(originalTar);
      modeTar.write("0000755\0", first.offset + 100, 8, "ascii");
      writeHeaderChecksum(modeTar, first.offset);
      const modeBytes = gzipSync(modeTar, { level: 9 });
      await writeFile(modeArchive, modeBytes);
      const modeInventory = await inspectPackageArtifact(modeArchive);
      const modePackJson = join(modeDirectory, "npm-pack.json");
      const modeViewJson = join(modeDirectory, "npm-view.json");
      await Promise.all([
        writeFile(
          modePackJson,
          packJson(modeBytes, modeInventory, manifest.name, manifest.version),
        ),
        writeFile(
          modeViewJson,
          registryView(modeBytes, modeInventory, manifest.name, manifest.version),
        ),
      ]);
      await expect(verifyNpmPackageIdentity({
        ...validInput,
        registryArchive: modeArchive,
        registryPackJson: modePackJson,
        registryViewJson: modeViewJson,
      })).rejects.toThrow("Source and registry npm pack file metadata differ");

      const contentDirectory = join(work, "content");
      await mkdir(contentDirectory);
      const contentArchive = join(contentDirectory, filename);
      const contentTar = Buffer.from(originalTar);
      contentTar[first.offset + 512] = (contentTar[first.offset + 512] ?? 0) ^ 0xff;
      const contentBytes = gzipSync(contentTar, { level: 9 });
      await writeFile(contentArchive, contentBytes);
      const contentInventory = await inspectPackageArtifact(contentArchive);
      const contentPackJson = join(contentDirectory, "npm-pack.json");
      const contentViewJson = join(contentDirectory, "npm-view.json");
      await Promise.all([
        writeFile(
          contentPackJson,
          packJson(contentBytes, contentInventory, manifest.name, manifest.version),
        ),
        writeFile(
          contentViewJson,
          registryView(contentBytes, contentInventory, manifest.name, manifest.version),
        ),
      ]);
      await expect(verifyNpmPackageIdentity({
        ...validInput,
        registryArchive: contentArchive,
        registryPackJson: contentPackJson,
        registryViewJson: contentViewJson,
      })).rejects.toThrow("Source and registry package content differ at canonical entry");

      const linkDirectory = join(work, "link");
      await mkdir(linkDirectory);
      const linkArchive = join(linkDirectory, filename);
      const linkTar = Buffer.from(originalTar);
      linkTar[first.offset + 156] = 50;
      writeHeaderChecksum(linkTar, first.offset);
      await writeFile(linkArchive, gzipSync(linkTar, { level: 9 }));
      await expect(verifyNpmPackageIdentity({
        ...validInput,
        registryArchive: linkArchive,
      })).rejects.toThrow("Unsupported package tar entry type");
    } finally {
      await rm(work, { force: true, recursive: true });
    }
  });
});

describe("verified npm provenance identity", () => {
  test("binds cryptographically audited publish and SLSA attestations to the tag Release workflow", async () => {
    const work = await mkdtemp(join(tmpdir(), "ghostget-provenance-identity-test-"));
    const auditJson = join(work, "npm-audit.json");
    const registryArchive = join(work, "hraness-ghostget-0.16.6.tgz");
    const archive = Buffer.from("reviewed Ghostget registry archive\n", "utf8");
    const archiveSha512 = createHash("sha512").update(archive).digest("hex");
    const sourceSha = "a".repeat(40);
    const version = "0.16.6";
    const purl = `pkg:npm/%40hraness/ghostget@${version}`;
    const bundle = (predicateType: string, statement: unknown) => ({
      predicateType,
      bundle: {
        mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
        verificationMaterial: { tlogEntries: [{}] },
        dsseEnvelope: {
          payload: Buffer.from(JSON.stringify(statement), "utf8").toString("base64"),
          payloadType: "application/vnd.in-toto+json",
          signatures: [{ keyid: "", sig: "verified" }],
        },
      },
    });
    const auditFixture = ({
      event = "push",
      includePublish = true,
      invalid = [] as readonly unknown[],
      invocation = "https://github.com/hraness/ghostget/actions/runs/123456/attempts/2",
      source = sourceSha,
      subjectDigest = archiveSha512,
      workflowPath = ".github/workflows/release.yml",
    } = {}) => {
      const provenanceStatement = {
        _type: "https://in-toto.io/Statement/v1",
        subject: [{ name: purl, digest: { sha512: subjectDigest } }],
        predicateType: "https://slsa.dev/provenance/v1",
        predicate: {
          buildDefinition: {
            buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
            externalParameters: {
              workflow: {
                ref: `refs/tags/v${version}`,
                repository: "https://github.com/hraness/ghostget",
                path: workflowPath,
              },
            },
            internalParameters: {
              github: {
                event_name: event,
                repository_id: "1316443113",
                repository_owner_id: "307125679",
              },
            },
            resolvedDependencies: [{
              uri: `git+https://github.com/hraness/ghostget@refs/tags/v${version}`,
              digest: { gitCommit: source },
            }],
          },
          runDetails: {
            builder: { id: "https://github.com/actions/runner/github-hosted" },
            metadata: {
              invocationId: invocation,
            },
          },
        },
      };
      const publishPredicate = "https://github.com/npm/attestation/tree/main/specs/publish/v0.1";
      const publishStatement = {
        _type: "https://in-toto.io/Statement/v0.1",
        subject: [{ name: purl, digest: { sha512: subjectDigest } }],
        predicateType: publishPredicate,
        predicate: {
          name: "@hraness/ghostget",
          version,
          registry: "https://registry.npmjs.org",
        },
      };
      return {
        invalid,
        missing: [],
        verified: [{
          name: "@hraness/ghostget",
          version,
          location: "node_modules/@hraness/ghostget",
          registry: "https://registry.npmjs.org/",
          attestations: {
            url: `https://registry.npmjs.org/-/npm/v1/attestations/%40hraness%2Fghostget@${version}`,
            provenance: { predicateType: "https://slsa.dev/provenance/v1" },
          },
          attestationBundles: [
            ...(includePublish ? [bundle(publishPredicate, publishStatement)] : []),
            bundle("https://slsa.dev/provenance/v1", provenanceStatement),
          ],
        }],
      };
    };
    const input: NpmProvenanceIdentityInput = Object.freeze({
      auditJson,
      expectedEvent: "push",
      expectedName: "@hraness/ghostget",
      expectedOwnerId: "307125679",
      expectedRef: `refs/tags/v${version}`,
      expectedRepository: "hraness/ghostget",
      expectedRepositoryId: "1316443113",
      expectedSourceSha: sourceSha,
      expectedVersion: version,
      expectedWorkflowPath: ".github/workflows/release.yml",
      registryArchive,
    });
    try {
      await writeFile(registryArchive, archive);
      await writeFile(auditJson, `${JSON.stringify(auditFixture())}\n`, "utf8");
      await expect(verifyNpmProvenanceIdentity(input)).resolves.toEqual({
        runAttempt: 2,
        runId: 123456,
      });
      await expect(verifyNpmProvenanceIdentity({
        ...input,
        expectedVersion: "9007199254740992.0.0",
      })).rejects.toThrow("Expected version is not stable semver");

      for (const [fixture, message] of [
        [auditFixture({ event: "workflow_dispatch" }), "Verified SLSA event"],
        [auditFixture({ source: "b".repeat(40) }), "does not bind the released commit"],
        [auditFixture({ subjectDigest: "0".repeat(128) }), "does not bind the registry archive"],
        [auditFixture({ workflowPath: ".github/workflows/npm-stage.yml" }), "Verified SLSA workflow path"],
        [auditFixture({ includePublish: false }), "must verify one registry publish bundle"],
        [auditFixture({ invalid: [{}] }), "contains invalid entries"],
        [auditFixture({ invocation: "https://github.com/hraness/ghostget/actions/runs/9007199254740992/attempts/2" }), "unsafe numeric identity"],
      ] as const) {
        await writeFile(auditJson, `${JSON.stringify(fixture)}\n`, "utf8");
        await expect(verifyNpmProvenanceIdentity(input)).rejects.toThrow(message);
      }
    } finally {
      await rm(work, { force: true, recursive: true });
    }
  });
});

describe("automatic npm publication from the tag Release", () => {
  const releaseStepScript = (workflow: string, name: string, fromIndex: number): string => {
    const stepStart = workflow.indexOf(`      - name: ${name}\n`, fromIndex);
    if (stepStart < 0) throw new Error(`Workflow step not found after offset: ${name}`);
    return workflowStepScript(workflow.slice(stepStart), name);
  };

  test("publishes the attested canonical bytes through one environment-bound OIDC job after the immutable Release", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const parsed = Bun.YAML.parse(workflow) as {
      jobs: Record<string, {
        environment?: string; needs?: string | string[]; outputs?: Record<string, string>;
        permissions: Record<string, string>; steps: { id?: string; name?: string; uses?: string; with?: Record<string, unknown> }[];
      }>;
    };
    const publishNpm = parsed.jobs.publish_npm; const admitNpm = parsed.jobs.admit_npm;
    if (publishNpm === undefined || admitNpm === undefined) throw new Error("missing npm jobs");
    expect(publishNpm.permissions).toEqual({ actions: "read", contents: "read", "id-token": "write" });
    expect(publishNpm.environment).toBe("npm-release");
    expect(publishNpm.needs).toEqual(["verify", "attest", "publish"]);
    expect(admitNpm.permissions).toEqual({ contents: "read" });
    expect(admitNpm.needs).toEqual(["verify", "attest", "publish_npm"]);
    expect(admitNpm.environment).toBeUndefined();
    expect(workflow.match(/id-token: write/gu)).toHaveLength(2);
    expect(workflow.match(/^    environment:/gmu)).toHaveLength(1);
    expect(parsed.jobs.verify!.outputs?.build_artifact_id).toBe("${{ steps.build_artifact.outputs.artifact-id }}");
    expect(parsed.jobs.attest!.outputs?.artifact_id).toBe("${{ steps.attested_artifact.outputs.artifact-id }}");
    expect(parsed.jobs.verify!.steps.find((step) => step.id === "build_artifact")?.uses).toStartWith("actions/upload-artifact@");
    expect(parsed.jobs.attest!.steps.find((step) => step.id === "attested_artifact")?.uses).toStartWith("actions/upload-artifact@");

    const publishNpmSource = workflow.slice(workflow.indexOf("  publish_npm:\n"), workflow.indexOf("  admit_npm:\n"));
    const admitNpmSource = workflow.slice(workflow.indexOf("  admit_npm:\n"));
    expect(publishNpmSource).not.toMatch(/actions\/checkout|setup-bun|\bbun\b|\.\/scripts\/|NPM_TOKEN|NODE_AUTH_TOKEN|--tag\b|resolved_stage_version|stable-stage/u);
    expect(publishNpmSource.match(/npm publish/gu)).toHaveLength(1);
    expect(publishNpmSource).toContain("artifact-ids: ${{ needs.attest.outputs.artifact_id }}");
    expect(publishNpmSource).not.toContain("canonical-attested-${{ github.run_id }}");
    expect(publishNpmSource).toContain("--provenance");
    expect(publishNpmSource).toContain("--access public");
    expect(publishNpmSource).toContain("--ignore-scripts");
    const order = [
      "      - name: Reauthorize current release attempt\n",
      "      - uses: actions/setup-node@",
      "      - name: Pin npm\n",
      "      - name: Establish clean npm publication defaults\n",
      "      - uses: actions/download-artifact@",
      "      - name: Bind attested canonical artifact\n",
      "      - name: Bind downloaded artifact\n",
      "      - name: Admit absent or exact public registry state\n",
      "      - name: Publish exact canonical archive through npm trusted publishing\n",
    ].map((marker) => publishNpmSource.indexOf(marker));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(publishNpm.steps.map((step) => step.name ?? step.uses?.split("@")[0])).toEqual([
      "Reauthorize current release attempt", "actions/setup-node", "Pin npm", "Establish clean npm publication defaults",
      "actions/download-artifact", "Bind attested canonical artifact", "Bind downloaded artifact",
      "Admit absent or exact public registry state", "Publish exact canonical archive through npm trusted publishing",
    ]);
    const publishReauthorize = releaseStepScript(workflow, "Reauthorize current release attempt", workflow.indexOf("  publish:\n"));
    const npmReauthorize = releaseStepScript(workflow, "Reauthorize current release attempt", workflow.indexOf("  publish_npm:\n"));
    expect(npmReauthorize).toBe(publishReauthorize);
    expect(npmReauthorize).toContain('EXPECTED_WORKFLOW_ID="$EXPECTED_WORKFLOW_ID"');
    expect(publishNpmSource).toContain('EXPECTED_WORKFLOW_ID: "323493609"');
    expect(publishNpmSource).toContain('EXPECTED_WORKFLOW_PATH: ".github/workflows/release.yml"');

    for (const [job, source] of [[publishNpm, publishNpmSource], [admitNpm, admitNpmSource]] as const) {
      const ids = new Set(job.steps.flatMap((step) => (step.id === undefined ? [] : [step.id])));
      const references = [...source.matchAll(/\$\{\{ steps\.([a-z_]+)\.outputs\.[a-z_]+ \}\}/gu)].map((match) => match[1]);
      expect(references.length > 0).toBe(job === publishNpm);
      expect(references.filter((id) => !ids.has(id as string))).toEqual([]);
    }
    expect(admitNpmSource).not.toMatch(/id-token|npm publish|environment:/u);
    expect(admitNpmSource).toContain("artifact-ids: ${{ needs.attest.outputs.artifact_id }}");
    expect(admitNpmSource).toContain("bun run ./scripts/npm-package-identity.ts");
    expect(admitNpmSource).toContain("bun run ./scripts/npm-provenance-identity.ts");
    expect(admitNpmSource).toContain("--expected-event push");
    expect(admitNpmSource).toContain('--expected-ref "refs/tags/$VERIFIED_TAG"');
    expect(admitNpmSource).toContain("--expected-workflow-path .github/workflows/release.yml");
    expect(admitNpmSource).toContain("npm audit signatures --json --include-attestations --omit=dev");
    expect(admitNpmSource).toContain("propagation_deadline=$((SECONDS + 840))");
    expect(admitNpmSource).toContain("sleep 20");
    expect(admitNpmSource).toContain('npm view "@hraness/ghostget@$version" version');
    expect(admitNpmSource).toContain('grep -Fqx "$version"');
    expect(admitNpmSource).toContain("npm registry did not publish @hraness/ghostget@$version inside the bounded propagation window");
    expect(admitNpmSource.indexOf("propagation_deadline=$((SECONDS + 840))")).toBeLessThan(
      admitNpmSource.indexOf('npm pack "@hraness/ghostget@$version"'),
    );
    expect(existsSync(fileURLToPath(new URL("../.github/workflows/npm-stage.yml", import.meta.url)))).toBe(false);
  });

  test("binds the attested five-file canonical artifact before handing off the exact archive and receipt", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const script = workflowStepScript(workflow, "Bind attested canonical artifact");
    const root = await mkdtemp(join(tmpdir(), "ghostget-attested-bind-"));
    const version = "0.17.9"; const tag = `v${version}`; const archiveName = `hraness-ghostget-${version}.tgz`;
    const sourceSha = "a".repeat(40); const workflowSha = "b".repeat(40);
    const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
    const archive = Buffer.from("canonical ghostget archive bytes\n", "utf8");
    const baseManifest = {
      schema: "hraness-github-release-v1", repository: "hraness/ghostget", repositoryId: GHOSTGET_REPOSITORY_ID,
      package: "@hraness/ghostget", version, tag, sourceSha, workflow: ".github/workflows/release.yml", workflowSha,
      runId: 123456, runAttempt: 1,
      archive: { name: archiveName, bytes: archive.byteLength, sha256: sha256(archive), sha512: createHash("sha512").update(archive).digest("hex") },
    };
    const bundle = Buffer.from("{\"attestation\":true}\n", "utf8");
    let caseIndex = 0;
    const runCase = async (
      mutate: (files: Map<string, Buffer>, environment: Record<string, string>) => void,
    ): Promise<Readonly<{ exitCode: number; handoff: string; output: string; stderr: string; stdout: string }>> => {
      caseIndex += 1;
      const directory = join(root, `canonical-${String(caseIndex)}`); const handoff = join(root, `handoff-${String(caseIndex)}`);
      const output = join(root, `output-${String(caseIndex)}.txt`);
      await mkdir(directory);
      const packJson = Buffer.from(JSON.stringify([{ name: "@hraness/ghostget", version, filename: archiveName }]), "utf8");
      const files = new Map<string, Buffer>([
        [archiveName, archive], ["npm-pack.json", packJson], ["release-manifest.json", Buffer.from(JSON.stringify(baseManifest), "utf8")],
        ["provenance.jsonl", bundle],
      ]);
      const sums = (): Buffer => Buffer.from([archiveName, "npm-pack.json", "release-manifest.json"]
        .map((name) => `${sha256(files.get(name) as Buffer)}  ${name}\n`).join(""), "utf8");
      files.set("SHA256SUMS", sums());
      const hashes = Object.fromEntries([archiveName, "npm-pack.json", "release-manifest.json", "SHA256SUMS"]
        .map((name) => [name, sha256(files.get(name) as Buffer)]));
      const environment: Record<string, string> = {
        DIRECTORY: directory, HANDOFF_DIRECTORY: handoff, EXPECTED_ARTIFACT_ID: "77", EXPECTED_BUNDLE_SHA256: sha256(bundle), EXPECTED_RELEASE_NOTES_SHA256: "d".repeat(64),
        EXPECTED_ARTIFACT_HASHES: JSON.stringify(hashes), VERIFIED_SHA: sourceSha, WORKFLOW_SHA: workflowSha, VERIFIED_TAG: tag,
        GITHUB_RUN_ID: "123456", GITHUB_RUN_ATTEMPT: "2", GITHUB_OUTPUT: output, RUNNER_TEMP: root,
      };
      mutate(files, environment);
      for (const [name, bytes] of files) await writeFile(join(directory, name), bytes);
      const result = await runWorkflowScript(script, environment);
      return { ...result, handoff, output: existsSync(output) ? await readFile(output, "utf8") : "" };
    };
    try {
      const accepted = await runCase(() => {});
      expect(accepted.exitCode, accepted.stderr).toBe(0);
      expect(accepted.output).toBe(`tarball_name=${archiveName}\nversion=${version}\nrelease_attempt=1\narchive_sha256=${sha256(archive)}\n`);
      expect((await readdir(accepted.handoff)).sort()).toEqual([archiveName, "npm-pack.json", "npm-package.sha256"]);
      expect(await readFile(join(accepted.handoff, archiveName))).toEqual(archive);
      expect(await readFile(join(accepted.handoff, "npm-package.sha256"), "utf8")).toBe(`${sha256(archive)}\n`);

      const rejected: [(files: Map<string, Buffer>, environment: Record<string, string>) => void, string][] = [
        [(files) => { files.set(archiveName, Buffer.concat([archive, Buffer.from("x")])); }, "differs from verified build output"],
        [(files) => { files.set("provenance.jsonl", Buffer.from("{}\n")); }, "differs from verified build output"],
        [(files) => { files.set("extra.txt", Buffer.from("x")); }, "inventory differs"],
        [(files) => { files.delete("provenance.jsonl"); }, "inventory differs"],
        [(files, environment) => {
          const manifest = { ...baseManifest, runId: 654321 };
          files.set("release-manifest.json", Buffer.from(JSON.stringify(manifest), "utf8"));
          const sums = [archiveName, "npm-pack.json", "release-manifest.json"].map((name) => `${sha256(files.get(name) as Buffer)}  ${name}\n`).join("");
          files.set("SHA256SUMS", Buffer.from(sums, "utf8"));
          environment.EXPECTED_ARTIFACT_HASHES = JSON.stringify(Object.fromEntries([archiveName, "npm-pack.json", "release-manifest.json", "SHA256SUMS"].map((name) => [name, sha256(files.get(name) as Buffer)])));
        }, "belongs to another build"],
        [(files, environment) => {
          const manifest = { ...baseManifest, runAttempt: 3 };
          files.set("release-manifest.json", Buffer.from(JSON.stringify(manifest), "utf8"));
          const sums = [archiveName, "npm-pack.json", "release-manifest.json"].map((name) => `${sha256(files.get(name) as Buffer)}  ${name}\n`).join("");
          files.set("SHA256SUMS", Buffer.from(sums, "utf8"));
          environment.EXPECTED_ARTIFACT_HASHES = JSON.stringify(Object.fromEntries([archiveName, "npm-pack.json", "release-manifest.json", "SHA256SUMS"].map((name) => [name, sha256(files.get(name) as Buffer)])));
        }, "belongs to another build"],
        [(_files, environment) => { environment.VERIFIED_TAG = "v0.17.10"; }, "inventory differs"],
        [(_files, environment) => { environment.EXPECTED_ARTIFACT_ID = "0"; }, "no exact immutable identity"],
        [(_files, environment) => { environment.EXPECTED_BUNDLE_SHA256 = "z".repeat(64); }, "no exact immutable identity"],
      ];
      for (const [mutate, message] of rejected) {
        const result = await runCase(mutate);
        expect(result.exitCode).not.toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain(message);
        expect(result.output).toBe("");
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("admits only an absent newer version or the exact prior publication before mutating npm", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const script = workflowStepScript(workflow, "Admit absent or exact public registry state");
    const root = await mkdtemp(join(tmpdir(), "ghostget-registry-state-"));
    const binaryDirectory = join(root, "bin"); const npmDirectory = join(root, "clean");
    const version = "0.17.9"; const tarball = join(root, `hraness-ghostget-${version}.tgz`);
    const archive = Buffer.from("canonical ghostget archive bytes\n", "utf8");
    const expectedIntegrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    const output = join(root, "github-output.txt");
    try {
      await mkdir(binaryDirectory); await mkdir(npmDirectory);
      await writeFile(tarball, archive);
      await writeFile(join(root, "userconfig"), ""); await writeFile(join(root, "globalconfig"), "");
      await writeFile(join(binaryDirectory, "npm"), `#!/bin/bash
set -euo pipefail
printf 'npm %s\\n' "$*" >> "$COMMAND_LOG"
if [[ "$1" == view && "$2" == "@hraness/ghostget@${version}" ]]; then
  case "$REGISTRY_MODE" in
    absent) echo 'npm error code E404' >&2; exit 1 ;;
    empty) printf '\n' ;;
    exact) printf '{"name":"@hraness/ghostget","version":"%s","dist":{"integrity":"%s","tarball":"https://registry.npmjs.org/@hraness/ghostget/-/ghostget-%s.tgz"}}\\n' "${version}" "$REGISTRY_INTEGRITY" "${version}" ;;
    outage) echo 'npm error code ECONNRESET' >&2; exit 1 ;;
    *) exit 99 ;;
  esac
elif [[ "$1" == view && "$2" == "@hraness/ghostget" && "$3" == dist-tags.latest ]]; then
  printf '"%s"\\n' "$REGISTRY_LATEST"
else
  exit 98
fi
`);
      await chmod(join(binaryDirectory, "npm"), 0o755);
      const runCase = async (extra: Record<string, string>) => {
        await rm(output, { force: true }); const commandLog = join(root, "commands"); await rm(commandLog, { force: true });
        const result = await runWorkflowScript(script, {
          COMMAND_LOG: commandLog, EXPECTED_TARBALL_SHA256: createHash("sha256").update(archive).digest("hex"),
          EXPECTED_VERSION: version, GITHUB_OUTPUT: output, NPM_DIRECTORY: npmDirectory, NPM_GLOBALCONFIG: join(root, "globalconfig"),
          NPM_USERCONFIG: join(root, "userconfig"), PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`, RUNNER_TEMP: root,
          REGISTRY_INTEGRITY: expectedIntegrity, REGISTRY_LATEST: "0.17.8", REGISTRY_MODE: "absent", TARBALL: tarball, ...extra,
        });
        return { ...result, output: existsSync(output) ? await readFile(output, "utf8") : "" };
      };
      const absent = await runCase({});
      expect(absent.exitCode, absent.stderr).toBe(0); expect(absent.output).toBe("npm_state=absent\n");
      const empty = await runCase({ REGISTRY_MODE: "empty" });
      expect(empty.exitCode, empty.stderr).toBe(0); expect(empty.output).toBe("npm_state=absent\n");
      const exact = await runCase({ REGISTRY_MODE: "exact", REGISTRY_LATEST: version });
      expect(exact.exitCode, exact.stderr).toBe(0); expect(exact.output).toBe("npm_state=exact\n");
      const exactBehindLatest = await runCase({ REGISTRY_MODE: "exact", REGISTRY_LATEST: "0.17.10" });
      expect(exactBehindLatest.exitCode, exactBehindLatest.stderr).toBe(0); expect(exactBehindLatest.output).toBe("npm_state=exact\n");
      for (const [extra, message] of [
        [{ REGISTRY_LATEST: version }, "is not newer than public npm latest"],
        [{ REGISTRY_LATEST: "0.18.0" }, "is not newer than public npm latest"],
        [{ REGISTRY_MODE: "exact", REGISTRY_INTEGRITY: "sha512-AAAA" }, "different bytes"],
        [{ REGISTRY_MODE: "exact", REGISTRY_LATEST: "0.17.8" }, "is older than the already published"],
        [{ REGISTRY_MODE: "outage" }, "Could not prove the public registry state"],
        [{ EXPECTED_TARBALL_SHA256: "0".repeat(64) }, "changed before registry admission"],
        [{ REGISTRY_LATEST: "0.17.8-beta.1" }, "not a supported stable semantic version"],
      ] as const) {
        const rejected = await runCase(extra);
        expect(rejected.exitCode).not.toBe(0);
        expect(`${rejected.stdout}${rejected.stderr}`).toContain(message);
        expect(rejected.output).toBe("");
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("publishes once through trusted publishing only after the immutable Release binds the exact bytes", async () => {
    const workflow = await readFile(releaseWorkflowUrl, "utf8");
    const script = workflowStepScript(workflow, "Publish exact canonical archive through npm trusted publishing");
    const root = await mkdtemp(join(tmpdir(), "ghostget-npm-publish-"));
    const binaryDirectory = join(root, "bin"); const npmDirectory = join(root, "clean");
    const version = "0.17.9"; const tag = `v${version}`; const sourceSha = "a".repeat(40);
    const archive = Buffer.from("canonical ghostget archive bytes\n", "utf8");
    const tarball = join(root, `hraness-ghostget-${version}.tgz`);
    const archiveSha256 = createHash("sha256").update(archive).digest("hex");
    const expectedIntegrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
    const releaseFixture = join(root, "release.json"); const output = join(root, "github-output.txt"); const commandLog = join(root, "commands");
    const releaseNotes = "Ghostget release summary.\n\n## Changes\n\n- One change.";
    const release = {
      id: 9001, tag_name: tag, target_commitish: sourceSha, draft: false, prerelease: false, immutable: true,
      author: { id: 41898282, type: "Bot" },
      body: releaseBody(releaseNotes, `wrench-release-source-v1 repository=hraness/ghostget tag=${tag} source_sha=${sourceSha} workflow_run_id=123456\n\nghostget-release-attempt-v1 run_attempt=1`),
      assets: [
        { name: `hraness-ghostget-${version}.tgz`, state: "uploaded", digest: `sha256:${archiveSha256}`, size: archive.byteLength },
        { name: "npm-pack.json", state: "uploaded", digest: `sha256:${"1".repeat(64)}`, size: 10 },
        { name: "release-manifest.json", state: "uploaded", digest: `sha256:${"2".repeat(64)}`, size: 10 },
        { name: "SHA256SUMS", state: "uploaded", digest: `sha256:${"3".repeat(64)}`, size: 10 },
        { name: "provenance.jsonl", state: "uploaded", digest: `sha256:${"4".repeat(64)}`, size: 10 },
      ],
    };
    try {
      await mkdir(binaryDirectory); await mkdir(npmDirectory); await writeFile(tarball, archive);
      await writeFile(join(root, "userconfig"), ""); await writeFile(join(root, "globalconfig"), "");
      await writeFile(join(binaryDirectory, "gh"), `#!/bin/bash
set -euo pipefail
printf 'gh %s\\n' "$*" >> "$COMMAND_LOG"
[[ "$1" == api && "$2" == --method && "$3" == GET && "$4" == "/repos/hraness/ghostget/releases/tags/${tag}" ]] || exit 97
cat "$RELEASE_FIXTURE"
`);
      await writeFile(join(binaryDirectory, "npm"), `#!/bin/bash
set -euo pipefail
printf 'npm %s\\n' "$*" >> "$COMMAND_LOG"
if [[ "$1" == config && "$2" == get && "$3" == tag ]]; then printf '%s\\n' "$CLEAN_TAG"; exit 0; fi
if [[ "$1" == publish ]]; then
  [[ -z "\${NPM_CONFIG_TAG-}" && -z "\${npm_config_tag-}" ]] || exit 96
  if [[ "\${PUBLISH_RECEIPT_SHAPE-}" == flat ]]; then
    printf '{"id":"@hraness/ghostget@%s","name":"@hraness/ghostget","version":"%s","integrity":"%s"}\\n' "${version}" "${version}" "$PUBLISHED_INTEGRITY"
    exit 0
  fi
  printf '{"@hraness/ghostget":{"id":"@hraness/ghostget@%s","name":"@hraness/ghostget","version":"%s","integrity":"%s","filename":"hraness-ghostget-%s.tgz"}}\\n' "${version}" "${version}" "$PUBLISHED_INTEGRITY" "${version}"
  exit 0
fi
exit 98
`);
      await chmod(join(binaryDirectory, "gh"), 0o755); await chmod(join(binaryDirectory, "npm"), 0o755);
      const runCase = async (extra: Record<string, string>, fixture: unknown = release) => {
        await rm(output, { force: true }); await rm(commandLog, { force: true });
        await writeFile(releaseFixture, JSON.stringify(fixture));
        const result = await runWorkflowScript(script, {
          CLEAN_TAG: "latest", COMMAND_LOG: commandLog, DEFAULT_BRANCH: "main", EXPECTED_ARCHIVE_SHA256: archiveSha256,
          EXPECTED_RELEASE_ATTEMPT: "1", EXPECTED_RELEASE_NOTES_SHA256: releaseNotesSha256(releaseNotes),
          EXPECTED_TARBALL_SHA256: archiveSha256, EXPECTED_VERSION: version,
          GITHUB_OUTPUT: output, GITHUB_REF: `refs/tags/${tag}`, GITHUB_REPOSITORY: "hraness/ghostget", GITHUB_RUN_ID: "123456",
          GITHUB_SHA: sourceSha, NPM_DIRECTORY: npmDirectory, NPM_GLOBALCONFIG: join(root, "globalconfig"), NPM_STATE: "absent",
          NPM_USERCONFIG: join(root, "userconfig"), PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`, PUBLISHED_INTEGRITY: expectedIntegrity,
          RELEASE_FIXTURE: releaseFixture, RUNNER_TEMP: root, TARBALL: tarball, VERIFIED_SHA: sourceSha, VERIFIED_TAG: tag, ...extra,
        });
        return { ...result, commands: existsSync(commandLog) ? await readFile(commandLog, "utf8") : "", output: existsSync(output) ? await readFile(output, "utf8") : "" };
      };
      const published = await runCase({});
      expect(published.exitCode, published.stderr).toBe(0);
      expect(published.output).toBe(`published_identity=@hraness/ghostget@${version} ${expectedIntegrity}\n`);
      const publishLine = published.commands.split("\n").find((line) => line.startsWith("npm publish"));
      expect(publishLine).toBe(`npm publish ${tarball} --access public --ignore-scripts --json --provenance --registry=https://registry.npmjs.org`);
      expect(published.commands.match(/^npm publish/gmu)).toHaveLength(1);
      expect(published.commands.indexOf("gh api")).toBeLessThan(published.commands.indexOf("npm publish"));

      const skipped = await runCase({ NPM_STATE: "exact" });
      expect(skipped.exitCode, skipped.stderr).toBe(0);
      expect(skipped.output).toBe(`published_identity=@hraness/ghostget@${version} exact-prior-publication\n`);
      expect(skipped.commands).toBe("");

      const rejections: [Record<string, string>, unknown, string][] = [
        [{ NPM_STATE: "" }, release, "did not record an exact npm state"],
        [{ NPM_STATE: "published" }, release, "did not record an exact npm state"],
        [{ GITHUB_SHA: "b".repeat(40) }, release, "exact Ghostget release tag context"],
        [{ GITHUB_REF: "refs/heads/main" }, release, "exact Ghostget release tag context"],
        [{ EXPECTED_ARCHIVE_SHA256: "0".repeat(64) }, release, "changed before npm publication"],
        [{ CLEAN_TAG: "next" }, release, "Clean npm publication default moved"],
        [{}, { ...release, immutable: false }, "not the exact publication authority"],
        [{}, { ...release, draft: true }, "not the exact publication authority"],
        [{}, { ...release, author: { id: 894119, type: "User" } }, "not the exact publication authority"],
        [{}, { ...release, body: release.body.replace("run_attempt=1", "run_attempt=2") }, "not the rendered changelog notes"],
        [{}, { ...release, body: release.body.replace("One change.", "Another change.") }, "not the rendered changelog notes"],
        [{}, { ...release, body: `${release.body}\n` }, "not the rendered changelog notes"],
        [{}, { ...release, body: release.body.slice(release.body.indexOf("<!-- ") - 2) }, "not the rendered changelog notes"],
        [{ EXPECTED_RELEASE_NOTES_SHA256: "0".repeat(64) }, release, "not the rendered changelog notes"],
        [{}, { ...release, assets: release.assets.slice(0, 4) }, "not the exact publication authority"],
        [{}, { ...release, assets: [{ ...release.assets[0], digest: `sha256:${"9".repeat(64)}` }, ...release.assets.slice(1)] }, "not the exact canonical archive bytes"],
        [{}, { ...release, assets: [{ ...release.assets[0], size: archive.byteLength + 1 }, ...release.assets.slice(1)] }, "not the exact canonical archive bytes"],
        [{ PUBLISHED_INTEGRITY: "sha512-AAAA" }, release, "one exact published Ghostget identity"],
        [{ PUBLISH_RECEIPT_SHAPE: "flat" }, release, "one exact published Ghostget identity"],
      ];
      for (const [extra, fixture, message] of rejections) {
        const rejected = await runCase(extra, fixture);
        expect(rejected.exitCode).not.toBe(0);
        expect(`${rejected.stdout}${rejected.stderr}`).toContain(message);
        if (message !== "one exact published Ghostget identity") expect(rejected.commands).not.toContain("npm publish");
        expect(rejected.output).toBe("");
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
