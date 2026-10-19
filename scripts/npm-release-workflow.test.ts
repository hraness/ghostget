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
import { installedSignatureInventory, trustedNpmRegistryKeys, verifyInstalledRegistrySignatures } from "./npm-installed-signatures.mjs";
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
  "./media-acquisition",
  "./pdf-acquisition",
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
  "@hraness/ghostget/media-acquisition",
  "@hraness/ghostget/pdf-acquisition",
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
  "dist/media-acquisition.js",
  "dist/pdf-acquisition.js",
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
    workflow_id: 389238077,
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
    expect(MAX_PACKAGE_TAR_BYTES).toBe(24_629_760);
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
 const [artifact, smoke] = await Promise.all([readFile(packageArtifactUrl, "utf8"), readFile(packageSmokeUrl, "utf8")]);
 expect(artifact).toContain('from "./package-budget.js"');
 expect(smoke).toContain('from "./package-budget.js"');
 expect(smoke).toContain('"@types/bun": "1.3.14"');
 expect(smoke).not.toContain('"@types/bun": "^1.3.14"');
 expect(smoke).toContain('"@types/node": "26.1.2"');
 expect(Object.isFrozen(repairPackageMeasurement)).toBeTrue();
 expect(repairPackageMeasurement.scope).toBe("lean public GhostGet 0.19.0");
 expect(repairPackageMeasurement.entryCount).toBe(629);
 expect(repairPackageMeasurement.archiveSha256).toMatch(/^[0-9a-f]{64}$/u);
 expect(MAX_PACKED_ENTRIES).toBe(629);
 expect(MAX_PACKED_FILES).toBe(629);
 expect(MAX_PACKED_BYTES).toBe(repairPackageMeasurement.packedBytes + repairPackageMeasurement.packedPlatformProjection + repairPackageMeasurement.packedPortabilityAllowance);
 expect(MAX_UNPACKED_BYTES).toBe(repairPackageMeasurement.unpackedBytes + repairPackageMeasurement.payloadPlatformProjection + repairPackageMeasurement.payloadAllowance);
 expect(MAX_PACKED_BYTES).toBeLessThanOrEqual(12_555_012);
 expect(MAX_UNPACKED_BYTES).toBeLessThanOrEqual(25_966_107);
 expect(Object.isFrozen(packageArtifactBudget)).toBeTrue();
 for(const range of Object.values(packageArtifactBudget)) expect(Object.isFrozen(range)).toBeTrue();
 expect(packageArtifactBudget).toEqual({entryCount:{min:629,max:629},fileCount:{min:629,max:629},packedBytes:{min:1_600_000,max:MAX_PACKED_BYTES},unpackedBytes:{min:9_000_000,max:MAX_UNPACKED_BYTES}});
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

  test("keeps the exact eleven public SDK entrypoints and required source inventory", async () => {
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
      "@hraness/ghostget/media-acquisition": ["./src/media-acquisition.ts"],
      "@hraness/ghostget/pdf-acquisition": ["./src/pdf-acquisition.ts"],
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

  test("documents the lean0.19.0 public release and safe upgrade", async () => {
 const changelog=await readFile(changelogUrl,"utf8");
 expect(changelog.match(/^## /gmu)).toHaveLength(1);
 expect(changelog).toContain("## 0.19.0");
 for(const fact of ["page capture", "local messaging", "reviewed", "Existing local state is preserved", "ghostget adapter sync-bundled"])expect(changelog).toContain(fact);
 expect(changelog).not.toContain("CreateTweet");
 expect(changelog).not.toContain("query-ID");
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
        expect(inventory.files.some(file => file.path === "src/control/helper.ts")).toBe(true);
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
      let manifestEntry = exactTarEntry(originalTar, "package/package.json");
      // Exercise padding even when a real package manifest lands exactly on a
      // block boundary: its final JSON whitespace can become one padding byte.
      if (manifestEntry.size % 512 === 0) {
        expect(originalTar[manifestEntry.dataOffset + manifestEntry.size - 1]).toBe(10);
        originalTar[manifestEntry.dataOffset + manifestEntry.size - 1] = 0;
        originalTar.write((manifestEntry.size - 1).toString(8).padStart(11, "0") + "\0", manifestEntry.headerOffset + 124, "ascii");
        writeHeaderChecksum(originalTar, manifestEntry.headerOffset);
        manifestEntry = exactTarEntry(originalTar, "package/package.json");
      }
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
    expect(workflow).toContain('EXPECTED_REPOSITORY_ID: "1425391521"');
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
      workflow_id: 389238077,
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
          id: 389238077,
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
  "api --method GET /repos/hraness/ghostget/actions/workflows/389238077") cat "$WORKFLOW_FIXTURE" ;;
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
        EXPECTED_WORKFLOW_ID: "389238077",
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
        id: 389238077,
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
                repository_id: "1425391521",
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
      expectedRepositoryId: "1425391521",
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
      await writeFile(auditJson, `${JSON.stringify({ ...auditFixture(), inventory: {
        registryPackages: [{ name: "@hraness/ghostget", version }],
        nonRegistryPackages: [{ name: "source-only-fixture", kind: "non-registry" }],
      } })}\n`, "utf8");
      await expect(verifyNpmProvenanceIdentity(input)).resolves.toEqual({ runAttempt: 2, runId: 123456 });
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
    expect(publishNpmSource).toContain('EXPECTED_WORKFLOW_ID: "389238077"');
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
    expect(admitNpmSource).toContain('npm install "@hraness/ghostget@$version" --ignore-scripts --no-audit --no-fund');
    expect(admitNpmSource).toContain("node ./scripts/npm-installed-signatures.mjs");
    expect(admitNpmSource).toContain('--consumer-directory "$consumer_directory"');
    expect(admitNpmSource).toContain('--registry-archive "$registry_directory/$archive_name"');
    expect(admitNpmSource).toContain('--npm-root "$(npm root --global)/npm"');
    expect(admitNpmSource).not.toMatch(/npm audit signatures|legacy-peer-deps|--omit=optional|--omit=peer|continue-on-error/u);
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

describe("complete installed npm signature admission", () => {
  const rootName = "@hraness/ghostget";
  const rootVersion = "0.18.95";
  const rootLocation = `node_modules/${rootName}`;
  const sri = (value: string) => `sha512-${createHash("sha512").update(value).digest("base64")}`;
  const canonicalIntegrity = sri("canonical Ghostget bytes");
  const publicKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const keyDocument = { keys: [{ keyId: "SHA256:fixture", publicKey: { rawBytes: publicKey, validFor: { end: "2099-01-01T00:00:00Z" } } }] };
  function fixture() {
    const registryRow = (name: string, version: string, integrity = sri(name)) => ({ name, version, location: `node_modules/${name}`,
      resolved: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`, integrity,
      link: false, workspace: false, dev: false, inBundle: false, bundler: null });
    const rows: Record<string, unknown>[] = [registryRow(rootName, rootVersion, canonicalIntegrity), registryRow("@hraness/oh", "0.12.0"),
      { name: "@tobilu/qmd", version: "2.8.3-hraness.1", location: "node_modules/@tobilu/qmd",
        resolved: "https://github.com/hraness/qmd/releases/download/v2.8.3-hraness.1/hraness-qmd-2.8.3-hraness.1.tgz", integrity: sri("fork bytes"),
        link: false, workspace: false, dev: false, inBundle: false, bundler: null }];
    const packages: Record<string, Record<string, unknown>> = Object.fromEntries(rows.map(row => [String(row.location), {
      version: row.version, resolved: row.resolved, integrity: row.integrity,
    }]));
    packages["node_modules/absent-optional"] = { version: "1.0.0", optional: true,
      resolved: "https://registry.npmjs.org/absent-optional/-/absent-optional-1.0.0.tgz", integrity: sri("not installed") };
    return { rows, lock: { lockfileVersion: 3, packages } };
  }
  function services(calls: Array<{ spec: string; options: Record<string, unknown> }>,
    mutate: (manifest: Record<string, unknown>) => void = () => {}) {
    return { initTUF: async (options: Record<string, unknown>) => {
      expect(options).toMatchObject({ cachePath: "/tmp/isolated-tuf", retry: { retries: 2 }, timeout: 30_000 });
      return { getTarget: async (target: string) => { expect(target).toBe("registry.npmjs.org/keys.json"); return JSON.stringify(keyDocument); } };
    }, manifest: async (spec: string, options: Record<string, unknown>) => {
      calls.push({ spec, options });
      const target = fixture().rows.find(row => `${row.name}@${row.version}` === spec)!;
      const manifest: Record<string, unknown> = { name: target.name, version: target.version, _id: spec,
        _resolved: target.resolved, _integrity: target.integrity, _signatures: [{ keyid: "SHA256:fixture", sig: "verified-by-pacote" }] };
      if (target.name === rootName) Object.assign(manifest, { dist: { attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/root" } },
        _attestations: { url: "https://registry.npmjs.org/-/npm/v1/attestations/root" },
        _attestationBundles: [{ predicateType: "https://slsa.dev/provenance/v1", bundle: {} }] });
      mutate(manifest);
      return manifest;
    } };
  }
  test("the GitHub-only fork on a registry peer edge never becomes a nonexistent registry coordinate", async () => {
    const { rows, lock } = fixture();
    const inventory = installedSignatureInventory(rows, lock, rootVersion, canonicalIntegrity);
    const calls: Array<{ spec: string; options: Record<string, unknown> }> = [];
    const receipt = await verifyInstalledRegistrySignatures(inventory, services(calls), "/tmp/isolated-tuf");
    expect(calls.map(call => call.spec)).toEqual(["@hraness/ghostget@0.18.95", "@hraness/oh@0.12.0"]);
    expect(inventory.nonRegistryPackages.map((row: { name: string }) => row.name)).toEqual(["@tobilu/qmd"]);
    expect(receipt.verified).toHaveLength(1);
    expect(receipt.invalid).toEqual([]); expect(receipt.missing).toEqual([]);
    for (const call of calls) {
      expect(call.options).toMatchObject({ registry: "https://registry.npmjs.org/", verifySignatures: true, verifyAttestations: true,
        before: null, cache: "/tmp/isolated-tuf/npm-cache", tufCache: "/tmp/isolated-tuf" });
      expect(call.options["//registry.npmjs.org/:_keys"]).toHaveLength(1);
      expect(call.options.integrity).toBe(inventory.registryPackages.find((row: { name: string; version: string }) => `${row.name}@${row.version}` === call.spec)!.integrity);
    }
  });
  test("installed coordinates, actual origins, lock integrity and the canonical root cannot drift", () => {
    for (const mutate of [
      (value: ReturnType<typeof fixture>) => { value.rows[0]!.version = "0.18.94"; },
      (value: ReturnType<typeof fixture>) => { value.rows[0]!.integrity = sri("other bytes"); value.lock.packages[rootLocation]!.integrity = sri("other bytes"); },
      (value: ReturnType<typeof fixture>) => { value.rows[0]!.resolved = "https://other.invalid/root.tgz"; value.lock.packages[rootLocation]!.resolved = "https://other.invalid/root.tgz"; },
      (value: ReturnType<typeof fixture>) => { value.rows[0]!.link = true; },
      (value: ReturnType<typeof fixture>) => { value.rows[0]!.workspace = true; },
      (value: ReturnType<typeof fixture>) => { value.rows.push(value.rows[0]!); },
      (value: ReturnType<typeof fixture>) => { delete value.lock.packages[rootLocation]; },
      (value: ReturnType<typeof fixture>) => { value.lock.lockfileVersion = 2; },
      (value: ReturnType<typeof fixture>) => { value.rows[2]!.resolved = null; value.lock.packages[String(value.rows[2]!.location)]!.resolved = null; },
    ]) {
      const value = fixture(); mutate(value);
      expect(() => installedSignatureInventory(value.rows, value.lock, rootVersion, canonicalIntegrity)).toThrow();
    }
  });
  test("unsigned registry packages, changed manifests and every present-invalid attestation fail", async () => {
    for (const mutate of [
      (manifest: Record<string, unknown>) => { manifest._signatures = []; },
      (manifest: Record<string, unknown>) => { manifest._resolved = "https://other.invalid/changed.tgz"; },
      (manifest: Record<string, unknown>) => { manifest._integrity = sri("changed"); },
      (manifest: Record<string, unknown>) => { manifest.name = "other"; },
      (manifest: Record<string, unknown>) => { manifest.version = "0.0.0"; },
      (manifest: Record<string, unknown>) => { manifest._id = "other@0.0.0"; },
      (manifest: Record<string, unknown>) => { manifest.dist = { attestations: {} }; delete manifest._attestations; },
      (manifest: Record<string, unknown>) => { manifest.dist = { attestations: {} }; manifest._attestationBundles = []; },
      (_manifest: Record<string, unknown>) => { throw Object.assign(new Error("invalid signature"), { code: "EINTEGRITYSIGNATURE" }); },
      (_manifest: Record<string, unknown>) => { throw Object.assign(new Error("invalid attestation"), { code: "EATTESTATIONVERIFY" }); },
    ]) {
      const value = fixture(); const inventory = installedSignatureInventory(value.rows, value.lock, rootVersion, canonicalIntegrity);
      await expect(verifyInstalledRegistrySignatures(inventory, services([], mutate), "/tmp/isolated-tuf")).rejects.toThrow("verification failed");
    }
  });
  test("root attestations remain mandatory although dependencies may have no attestations", async () => {
    const value = fixture(); const inventory = installedSignatureInventory(value.rows, value.lock, rootVersion, canonicalIntegrity);
    await expect(verifyInstalledRegistrySignatures(inventory, services([], manifest => {
      delete manifest.dist; delete manifest._attestations; delete manifest._attestationBundles;
    }), "/tmp/isolated-tuf")).rejects.toThrow("root has no verified attestations");
  });
  test("bundled packages without an independent origin must bind an admitted enclosing artifact", () => {
    const value = fixture();
    const nested = `${rootLocation}/node_modules/bundled`;
    value.rows.push({ name: "bundled", version: "1.0.0", location: nested, resolved: null, integrity: null,
      link: false, workspace: false, dev: false, inBundle: true, bundler: rootLocation });
    value.lock.packages[nested] = { version: "1.0.0", inBundle: true };
    expect(installedSignatureInventory(value.rows, value.lock, rootVersion, canonicalIntegrity).nonRegistryPackages).toHaveLength(2);
    value.rows.at(-1)!.bundler = "node_modules/unadmitted";
    expect(() => installedSignatureInventory(value.rows, value.lock, rootVersion, canonicalIntegrity)).toThrow("no admitted enclosing source");
  });
  test("trusted TUF keys reject missing, conflicting, malformed or noncanonical public keys", () => {
    expect(trustedNpmRegistryKeys(keyDocument)).toHaveLength(1);
    for (const value of [null, {}, { keys: [] }, { keys: [...keyDocument.keys,
      { ...keyDocument.keys[0], publicKey: { rawBytes: publicKey, validFor: { end: "2098-01-01T00:00:00Z" } } }] },
      { keys: [{ keyId: "key", publicKey: { rawBytes: "private invalid key" } }] },
      { keys: [{ keyId: "key", publicKey: { rawBytes: publicKey, validFor: { end: 12 } } }] }]) {
      expect(() => trustedNpmRegistryKeys(value)).toThrow();
    }
  });
  test("npm TUF target's duplicate key IDs deduplicate only identical PEM and expiry projections", () => {
    const original = keyDocument.keys[0]!;
    expect(trustedNpmRegistryKeys({ keys: [original, { ...original,
      publicKey: { ...original.publicKey, validFor: { start: "2022-12-01T00:00:00.000Z", end: original.publicKey.validFor.end } } }, original] }))
      .toHaveLength(1);
    const otherKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
    expect(() => trustedNpmRegistryKeys({ keys: [original, { ...original, publicKey: { ...original.publicKey, rawBytes: otherKey } }] }))
      .toThrow("conflicting verification material");
  });
  test("property: each additional lock-bound registry package is included exactly once regardless of source peers", () => {
    assertProperty(fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 9_999 }), { maxLength: 30 }), numbers => {
      const value = fixture();
      for (const number of numbers) {
        const name = `fixture-${number}`; const target = `node_modules/${name}`;
        const row = { name, version: "1.0.0", location: target, resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`,
          integrity: sri(name), link: false, workspace: false, dev: false, inBundle: false, bundler: null };
        value.rows.push(row); value.lock.packages[target] = { version: row.version, resolved: row.resolved, integrity: row.integrity };
      }
      const inventory = installedSignatureInventory(value.rows, value.lock, rootVersion, canonicalIntegrity);
      expect(inventory.registryPackages.length).toBe(numbers.length + 2);
      expect(new Set(inventory.registryPackages.map((row: { location: string }) => row.location)).size).toBe(numbers.length + 2);
      expect(inventory.nonRegistryPackages).toHaveLength(1);
    }), { numRuns: 100 });
  });
});
