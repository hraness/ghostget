import { describe, expect, test } from "bun:test";
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
} from "./package-budget.js";
import { verifyNpmPackageIdentity } from "./npm-package-identity.js";
import {
  verifyNpmProvenanceIdentity,
  type NpmProvenanceIdentityInput,
} from "./npm-provenance-identity.js";
import {
  createReleaseAppJwt,
  parseReleaseAppConfiguration,
  parseReleaseAppIdentity,
  parseReleaseAppInstallation,
  parseReleaseAppTokenResponse,
  RELEASE_APP_REVOCATION_OBSERVATION_OFFSETS_MILLISECONDS,
  releaseAppTokenRequestBody,
  revokeReleaseAppTokenWithConvergence,
  GHOSTGET_REPOSITORY_ID,
  withReleaseAppToken,
  withReleaseAppTokenFromEnvironment,
} from "./release-app-token.mjs";
import {
  assertReleaseTagNewerThanPublished,
  CANONICAL_RELEASE_JOBS,
  collectDeploymentStatuses,
  collectProductionDeployments,
  createProviderBaseline as createProviderBaselineRaw,
  decodeProviderReceipt,
  encodeProviderReceipt,
  exactReleaseWorkflowRun,
  parseIncludedGitHubResponse,
  promoteWebsiteProduction as promoteWebsiteProductionRaw,
  revalidateReleaseAuthority,
  exactWorkflowPublishedRelease,
  releaseWorkflowRunIdFromPublishedRelease,
  releaseSourceReceipt,
  releaseGraphqlRequestBudget,
  releasePublicHostRequestBudget,
  releaseRestRequestBudget,
  resolveReleaseAuthority,
  scrubReadOnlyGithubEnvironment,
  waitForProviderOutcome as waitForProviderOutcomeRaw,
  GhostgetPublicSite,
} from "./release-provider-outcome.mjs";
import {
  createProductionReleaseMarker,
  parseProductionReleaseMarker,
  PRODUCTION_RELEASE_MARKER_PATH,
  serializeProductionReleaseMarker,
} from "../website/production-release-marker.mjs";
import {
  advanceWebsiteProductionRef,
  verifiedReleaseFetchArguments,
  websiteProductionPushArguments,
} from "./release-ref-writer.mjs";

import { releaseIdentity } from "../website/github-release-artifact.mjs";

const ciWorkflowUrl = new URL("../.github/workflows/ci.yml", import.meta.url);
const releaseWorkflowUrl = new URL("../.github/workflows/release.yml", import.meta.url);
const websiteProductionWorkflowUrl = new URL(
  "../.github/workflows/website-production.yml",
  import.meta.url,
);
const codeownersUrl = new URL("../.github/CODEOWNERS", import.meta.url);
const workflowsUrl = new URL("../.github/workflows/", import.meta.url);
const releaseAppTokenHelperUrl = new URL("./release-app-token.mjs", import.meta.url);
const releaseRefWriterHelperUrl = new URL("./release-ref-writer.mjs", import.meta.url);
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
const providerTagObjectSha = "3".repeat(40);
const providerWorkflowSha = "4".repeat(40);
const providerTag = "v0.16.2";
const providerTagCommitEndpoint =
  `/repos/${providerRepository}/commits/refs%2Ftags%2F${providerTag}`;
const providerAmbiguousTagCommitEndpoints = Object.freeze([
  `/repos/${providerRepository}/commits/${providerTag}`,
  `/repos/${providerRepository}/commits/tags/${providerTag}`,
  `/repos/${providerRepository}/commits/refs/tags/${providerTag}`,
]);
const providerReleasePublishedAt = "2026-08-29T14:00:00Z";
const providerReleaseWorkflowRunId = "88001";
const providerBaselineServerDate = "2026-08-29T15:00:00.000Z";
const providerPromotionServerDate = "2026-08-29T15:01:00.000Z";
const providerReleaseAppRevocation = Object.freeze({
  converged: true,
  observationCount: 3,
  propagationObserved: true,
  stableDenials: 2,
});
const providerAuthority = Object.freeze({
  releaseWorkflowRunId: providerReleaseWorkflowRunId,
  repository: providerRepository,
  verifiedSha: providerVerifiedSha,
  verifiedTag: providerTag,
});

type ProviderMarker = ReturnType<typeof createProductionReleaseMarker>;

function providerMarker(
  sourceSha: string,
  tag: string,
  deploymentId: number,
): ProviderMarker {
  return createProductionReleaseMarker({
    deploymentUrl: `https://${releaseIdentity(tag).package === "@hraness/ghostget" ? "ghostget" : "wrench"}-${String(deploymentId)}-hraness.vercel.app`,
    name: releaseIdentity(tag).package,
    sourceSha,
    tag,
    version: tag.slice(1),
  });
}

function providerMarkerObservation(
  marker: ProviderMarker | "missing",
  requestIndex: number,
): Readonly<Record<string, unknown>> {
  const requestPath = `${PRODUCTION_RELEASE_MARKER_PATH}?release=${providerTag}&source=${providerVerifiedSha}&nonce=fixture-${String(requestIndex).padStart(4, "0")}`;
  if (marker === "missing") {
    return Object.freeze({
      bodySha256: createHash("sha256").update("<!doctype html>\nmissing\n").digest("hex"),
      kind: "missing",
      requestPath,
    });
  }
  const body = serializeProductionReleaseMarker(marker);
  return Object.freeze({
    bodySha256: createHash("sha256").update(body).digest("hex"),
    kind: "release",
    marker,
    requestPath,
  });
}

class ProviderPublicSiteFixture {
  readonly calls: string[] = [];
  readonly timeouts: number[] = [];
  readonly markerSnapshots: readonly (ProviderMarker | "missing")[];
  readonly healthDigests: ReadonlyMap<string, readonly string[]>;
  readonly redirectDigests: readonly string[];
  readonly readHook: ((timeoutMilliseconds: number) => void) | undefined;
  #markerRead = 0;
  #healthReads = new Map<string, number>();
  #redirectRead = 0;

  constructor({
    healthDigests = new Map(),
    markerSnapshots = [providerMarker(providerVerifiedSha, providerTag, 20)],
    readHook,
    redirectDigests = [createHash("sha256").update("Redirecting...\n").digest("hex")],
  }: Readonly<{
    healthDigests?: ReadonlyMap<string, readonly string[]>;
    markerSnapshots?: readonly (ProviderMarker | "missing")[];
    readHook?: (timeoutMilliseconds: number) => void;
    redirectDigests?: readonly string[];
  }> = {}) {
    this.healthDigests = healthDigests;
    this.markerSnapshots = markerSnapshots;
    this.readHook = readHook;
    this.redirectDigests = redirectDigests;
  }

  #record(call: string, timeoutMilliseconds: number): void {
    this.calls.push(call);
    this.timeouts.push(timeoutMilliseconds);
    this.readHook?.(timeoutMilliseconds);
  }

  async readMarker(
    _tag: string,
    _sha: string,
    { timeoutMilliseconds }: Readonly<{ timeoutMilliseconds: number }>,
  ): Promise<Readonly<Record<string, unknown>>> {
    this.#record("marker", timeoutMilliseconds);
    const snapshot = this.markerSnapshots[
      Math.min(this.#markerRead, this.markerSnapshots.length - 1)
    ];
    this.#markerRead += 1;
    if (snapshot === undefined) throw new Error("public marker fixture is empty");
    return providerMarkerObservation(snapshot, this.#markerRead);
  }

  async readHealthRoute(
    route: string,
    _tag: string,
    _sha: string,
    { timeoutMilliseconds }: Readonly<{ timeoutMilliseconds: number }>,
  ): Promise<Readonly<Record<string, unknown>>> {
    this.#record(`health ${route}`, timeoutMilliseconds);
    const read = this.#healthReads.get(route) ?? 0;
    this.#healthReads.set(route, read + 1);
    const snapshots = this.healthDigests.get(route) ?? [
      createHash("sha256").update(`stable ${route}`).digest("hex"),
    ];
    const bodySha256 = snapshots[Math.min(read, snapshots.length - 1)];
    if (bodySha256 === undefined) throw new Error("public health fixture is empty");
    return Object.freeze({
      bodyBytes: 64,
      bodySha256,
      contentType: route === "/llms.txt"
        ? "text/plain; charset=utf-8"
        : "text/html; charset=utf-8",
      path: route,
      status: 200,
    });
  }

  async readWwwRedirect(
    requestPath: string,
    { timeoutMilliseconds }: Readonly<{ timeoutMilliseconds: number }>,
  ): Promise<Readonly<Record<string, unknown>>> {
    this.#record("www", timeoutMilliseconds);
    const bodySha256 = this.redirectDigests[
      Math.min(this.#redirectRead, this.redirectDigests.length - 1)
    ];
    this.#redirectRead += 1;
    if (bodySha256 === undefined) throw new Error("public redirect fixture is empty");
    return Object.freeze({
      bodySha256,
      contentType: "text/plain",
      location: `https://ghostget.com${requestPath}`,
      status: 308,
    });
  }
}

function inferredBaselinePublicSite(
  options: Parameters<typeof createProviderBaselineRaw>[0],
): ProviderPublicSiteFixture {
  const api = options.api as unknown as Readonly<{
    deploymentSnapshots?: readonly (readonly ProviderJson[])[];
    graphqlSnapshots?: readonly (readonly ProviderJson[])[];
    refSha?: string;
  }>;
  const refSha = api.refSha ?? providerPreviousSha;
  const rest = api.deploymentSnapshots?.[0] ?? [];
  const matching = rest
    .map((value) => value as Readonly<Record<string, ProviderJson>>)
    .filter((value) => value.sha === refSha)
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  const graph = api.graphqlSnapshots?.[0]
    ?.map((value) => value as Readonly<Record<string, ProviderJson>>)
    .filter((value) => value.commitOid === refSha)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const deploymentId = Number(matching[0]?.id ?? graph?.[0]?.databaseId ?? 10);
  const tag = refSha === providerVerifiedSha ? providerTag : "v0.16.1";
  return new ProviderPublicSiteFixture({
    markerSnapshots: [providerMarker(refSha, tag, deploymentId)],
  });
}

const createProviderBaseline = (
  options: Parameters<typeof createProviderBaselineRaw>[0],
): ReturnType<typeof createProviderBaselineRaw> => createProviderBaselineRaw({
  publicSite: inferredBaselinePublicSite(options),
  releaseWorkflowRunId: providerReleaseWorkflowRunId,
  verifiedTag: providerTag,
  ...options,
});

const promoteWebsiteProduction = (
  options: Parameters<typeof promoteWebsiteProductionRaw>[0],
): ReturnType<typeof promoteWebsiteProductionRaw> => promoteWebsiteProductionRaw({
  releaseWorkflowRunId: providerReleaseWorkflowRunId,
  ...options,
});

const waitForProviderOutcome = (
  options: Parameters<typeof waitForProviderOutcomeRaw>[0],
): ReturnType<typeof waitForProviderOutcomeRaw> => {
  const receipt = options.promotionReceipt as unknown as Readonly<{ mode?: unknown }>;
  const deploymentId = receipt.mode === "already-exact" ? 10 : 20;
  return waitForProviderOutcomeRaw({
    defaultBranch: "main",
    eventName: "push",
    publicSite: new ProviderPublicSiteFixture({
      markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, deploymentId)],
    }),
    recoveryWorkflowSha: "",
    releaseWorkflowRunId: providerReleaseWorkflowRunId,
    ...providerAuthority,
    ...options,
  });
};

type ProviderJson = null | boolean | number | string | readonly ProviderJson[] | {
  readonly [key: string]: ProviderJson;
};

function providerDeployment(
  id: number,
  createdAt: string,
  overrides: Readonly<Record<string, ProviderJson>> = {},
): ProviderJson {
  const sha = typeof overrides.sha === "string" ? overrides.sha : providerVerifiedSha;
  return {
    created_at: createdAt,
    creator: { id: 35613825, login: "vercel[bot]", type: "Bot" },
    environment: "Production",
    id,
    original_environment: "Production",
    ref: sha,
    sha,
    statuses_url: `https://api.github.com/repos/${providerRepository}/deployments/${String(id)}/statuses`,
    task: "deploy",
    ...overrides,
  };
}

function providerGraphqlDeployment(
  id: number,
  createdAt: string,
  overrides: Readonly<Record<string, ProviderJson>> = {},
): ProviderJson {
  const vercelUrl = `https://wrench-${String(id)}-hraness.vercel.app`;
  const defaultLatestStatus: ProviderJson = {
    createdAt,
    creator: { __typename: "Bot", databaseId: 35613825, login: "vercel" },
    environment: "Production",
    environmentUrl: vercelUrl,
    id: `status-${String(id)}`,
    logUrl: vercelUrl,
    state: "SUCCESS",
    updatedAt: createdAt,
  };
  const latestStatus = Object.hasOwn(overrides, "latestStatus")
    ? overrides.latestStatus
    : defaultLatestStatus;
  const { latestStatus: _latestStatus, ...restOverrides } = overrides;
  return {
    commitOid: providerVerifiedSha,
    createdAt,
    creator: { __typename: "Bot", databaseId: 35613825, login: "vercel" },
    databaseId: id,
    environment: "Production",
    latestStatus,
    originalEnvironment: "Production",
    ref: null,
    state: "ACTIVE",
    task: "deploy",
    updatedAt: createdAt,
    ...restOverrides,
  };
}

function graphqlDeploymentFromRest(
  value: ProviderJson,
  restStatuses: readonly ProviderJson[] = [],
): ProviderJson {
  const deployment = value as Readonly<Record<string, ProviderJson>>;
  const creator = deployment.creator as Readonly<Record<string, ProviderJson>>;
  const derivedStatuses = restStatuses.map((value) => {
    const status = value as Readonly<Record<string, ProviderJson>>;
    const statusCreator = status.creator as Readonly<Record<string, ProviderJson>>;
    return {
      createdAt: status.created_at,
      creator: {
        __typename: statusCreator.type,
        databaseId: statusCreator.id,
        login: statusCreator.login === "vercel[bot]" ? "vercel" : statusCreator.login,
      },
      environment: status.environment,
      environmentUrl: status.environment_url,
      id: status.node_id,
      logUrl: status.log_url,
      state: typeof status.state === "string" ? status.state.toUpperCase() : status.state,
      updatedAt: status.updated_at,
    } satisfies ProviderJson;
  });
  const derivedLatestStatus = derivedStatuses[0];
  const statusState = (derivedLatestStatus as Readonly<Record<string, ProviderJson>> | undefined)
    ?.state;
  const derivedState = statusState === "SUCCESS" ? "ACTIVE" : statusState;
  const latestStatus = deployment.graphql_latest_status ?? derivedLatestStatus ??
    (providerGraphqlDeployment(
      deployment.id as number,
      deployment.created_at as string,
    ) as Readonly<Record<string, ProviderJson>>).latestStatus;
  return providerGraphqlDeployment(
    deployment.id as number,
    deployment.created_at as string,
    {
      commitOid: deployment.sha,
      creator: {
        __typename: creator.type,
        databaseId: creator.id,
        login: creator.login === "vercel[bot]" ? "vercel" : creator.login,
      },
      environment: deployment.environment,
      latestStatus,
      originalEnvironment: deployment.original_environment,
      state: deployment.graphql_state ?? derivedState ?? "ACTIVE",
      task: deployment.task,
      updatedAt:
        deployment.graphql_updated_at ??
        (derivedLatestStatus as Readonly<Record<string, ProviderJson>> | undefined)?.updatedAt ??
        deployment.created_at,
    },
  );
}

function providerGraphqlResponse(
  nodes: readonly ProviderJson[],
  {
    cost = 1,
    endCursor = null,
    hasNextPage = false,
    remaining = 999,
    resetAt = "2026-08-29T16:00:00Z",
    totalCount = nodes.length,
  }: Readonly<{
    cost?: number;
    endCursor?: ProviderJson;
    hasNextPage?: boolean;
    remaining?: number;
    resetAt?: string;
    totalCount?: number;
  }> = {},
): ProviderJson {
  return {
    data: {
      rateLimit: { cost, remaining, resetAt },
      repository: {
        deployments: {
          nodes,
          pageInfo: { endCursor, hasNextPage },
          totalCount,
        },
      },
    },
  };
}

function providerStatus(
  id: number,
  state: string,
  createdAt: string,
  overrides: Readonly<Record<string, ProviderJson>> = {},
  deploymentId = 10,
): ProviderJson {
  const vercelUrl = `https://wrench-${String(deploymentId)}-hraness.vercel.app`;
  return {
    created_at: createdAt,
    creator: { id: 35613825, login: "vercel[bot]", type: "Bot" },
    deployment_url: `https://api.github.com/repos/${providerRepository}/deployments/${String(deploymentId)}`,
    environment: "Production",
    environment_url: vercelUrl,
    id,
    log_url: vercelUrl,
    node_id: `status-${String(id)}`,
    state,
    target_url: vercelUrl,
    updated_at: createdAt,
    ...overrides,
  };
}

function providerRef(sha: string, branch = "website-production"): ProviderJson {
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

function providerLatest(overrides: Readonly<Record<string, ProviderJson>> = {}): ProviderJson {
  return providerRelease(overrides);
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

function providerCompare(overrides: Readonly<Record<string, ProviderJson>> = {}): ProviderJson {
  return {
    ahead_by: 1,
    base_commit: { sha: providerPreviousSha },
    behind_by: 0,
    commits: [{ sha: providerVerifiedSha }],
    merge_base_commit: { sha: providerPreviousSha },
    status: "ahead",
    ...overrides,
  };
}

function providerCommitResponse(sha: string): ProviderJson {
  return {
    commit: {
      message: "deterministic annotated-tag target fixture",
      tree: { sha: "4".repeat(40) },
    },
    parents: [],
    sha,
  };
}

class ProviderApiFixture {
  readonly calls: string[] = [];
  readonly graphqlCalls: string[] = [];
  readonly includedCalls: string[] = [];
  readonly timedCalls: Array<Readonly<{ endpoint: string; timeoutMilliseconds: number }>> = [];
  readonly timeoutMilliseconds: number[] = [];
  readonly deploymentDetailSnapshots: readonly ProviderJson[];
  readonly defaultBranchSnapshots: readonly string[];
  readonly defaultBranchShaSnapshots: readonly string[];
  readonly deploymentSnapshots: ProviderJson[][];
  readonly graphqlResponses: readonly ProviderJson[];
  readonly graphqlSnapshots: ProviderJson[][] | undefined;
  readonly latestSnapshots: readonly ProviderJson[];
  readonly serverDates: readonly string[];
  readonly statusSnapshots: Map<number, ProviderJson[][]>;
  compare: ProviderJson = providerCompare();
  compareHook: (() => void) | undefined;
  sourceCompare: ProviderJson | undefined;
  readonly sourceCompareSnapshots: readonly ProviderJson[];
  deploymentDetailError: Error | undefined;
  patchError: Error | undefined;
  refSha: string;
  readonly refSnapshots: readonly string[];
  readonly refValues: readonly ProviderJson[];
  readonly releaseSnapshots: readonly ProviderJson[];
  readonly tagSnapshots: readonly string[];
  readonly workflowRunSnapshots: readonly ProviderJson[];
  latest: ProviderJson = providerLatest();
  release: ProviderJson = providerRelease();
  readonly readHook: ((timeoutMilliseconds: number | undefined) => void) | undefined;

  #deploymentDetailRead = 0;
  #defaultBranchRead = 0;
  #defaultBranchShaRead = 0;
  #deploymentRead = -1;
  #deploymentSnapshot: ProviderJson[] = [];
  #graphqlRead = -1;
  #graphqlResponseRead = 0;
  #graphqlSnapshot: ProviderJson[] = [];
  #refRead = 0;
  #releaseRead = 0;
  #latestRead = 0;
  #serverDateRead = 0;
  #sourceCompareRead = 0;
  #statusReads = new Map<number, number>();
  #statusCurrent = new Map<number, ProviderJson[]>();
  #tagRead = 0;
  #workflowRunRead = 0;

  constructor({
    deploymentDetails = [],
    defaultBranchSnapshots = [],
    defaultBranchShaSnapshots = [],
    deployments = [[]],
    graphqlDeployments,
    graphqlResponses = [],
    latestSnapshots = [],
    refSnapshots = [],
    refSha = providerPreviousSha,
    refValues = [],
    readHook,
    releaseSnapshots = [],
    serverDates = [providerPromotionServerDate],
    sourceCompare,
    sourceCompareSnapshots = [],
    statuses = new Map<number, ProviderJson[][]>(),
    tagSnapshots = [],
    workflowRunSnapshots = [],
  }: Readonly<{
    deploymentDetails?: readonly ProviderJson[];
    defaultBranchSnapshots?: readonly string[];
    defaultBranchShaSnapshots?: readonly string[];
    deployments?: ProviderJson[][];
    graphqlDeployments?: ProviderJson[][];
    graphqlResponses?: readonly ProviderJson[];
    latestSnapshots?: readonly ProviderJson[];
    refSnapshots?: readonly string[];
    refSha?: string;
    refValues?: readonly ProviderJson[];
    readHook?: (timeoutMilliseconds: number | undefined) => void;
    releaseSnapshots?: readonly ProviderJson[];
    serverDates?: readonly string[];
    sourceCompare?: ProviderJson;
    sourceCompareSnapshots?: readonly ProviderJson[];
    statuses?: Map<number, ProviderJson[][]>;
    tagSnapshots?: readonly string[];
    workflowRunSnapshots?: readonly ProviderJson[];
  }> = {}) {
    this.deploymentDetailSnapshots = deploymentDetails;
    this.defaultBranchSnapshots = defaultBranchSnapshots;
    this.defaultBranchShaSnapshots = defaultBranchShaSnapshots;
    this.deploymentSnapshots = deployments;
    this.graphqlResponses = graphqlResponses;
    this.graphqlSnapshots = graphqlDeployments;
    this.latestSnapshots = latestSnapshots;
    this.refSha = refSha;
    this.refSnapshots = refSnapshots;
    this.refValues = refValues;
    this.readHook = readHook;
    this.releaseSnapshots = releaseSnapshots;
    this.serverDates = serverDates;
    this.sourceCompare = sourceCompare;
    this.sourceCompareSnapshots = sourceCompareSnapshots;
    this.statusSnapshots = statuses;
    this.tagSnapshots = tagSnapshots;
    this.workflowRunSnapshots = workflowRunSnapshots;
  }

  async graphql(input: Readonly<{
    after?: string;
    name: string;
    owner: string;
    query: string;
  }>, options?: Readonly<{ timeoutMilliseconds?: number }>): Promise<ProviderJson> {
    if (options?.timeoutMilliseconds !== undefined) {
      this.timeoutMilliseconds.push(options.timeoutMilliseconds);
    }
    this.readHook?.(options?.timeoutMilliseconds);
    expect(input.owner).toBe("hraness");
    expect(input.name).toBe("ghostget");
    expect(input.query).toContain("query GhostgetProductionDeployments");
    this.graphqlCalls.push(`after=${input.after ?? ""}`);
    const response = this.graphqlResponses[
      Math.min(this.#graphqlResponseRead, this.graphqlResponses.length - 1)
    ];
    if (response !== undefined) {
      this.#graphqlResponseRead += 1;
      return response;
    }
    const page = input.after === undefined
      ? 1
      : Number(/^cursor-([1-4])$/u.exec(input.after)?.[1] ?? "0") + 1;
    if (!Number.isSafeInteger(page) || page < 1 || page > 5) {
      throw new Error(`Unexpected GraphQL cursor ${input.after ?? ""}`);
    }
    if (page === 1) {
      this.#graphqlRead += 1;
      const read = Math.min(this.#graphqlRead, this.deploymentSnapshots.length - 1);
      this.#deploymentSnapshot = this.deploymentSnapshots[read] ?? [];
      this.#graphqlSnapshot = this.graphqlSnapshots?.[
        Math.min(this.#graphqlRead, this.graphqlSnapshots.length - 1)
      ] ?? this.#deploymentSnapshot.map((deployment) => {
        const raw = deployment as Readonly<Record<string, ProviderJson>>;
        const id = raw.id as number;
        const statusRead = this.#statusReads.get(id) ?? 0;
        const snapshots = this.statusSnapshots.get(id) ?? [];
        const currentStatuses = snapshots[Math.min(statusRead, snapshots.length - 1)] ?? [];
        return graphqlDeploymentFromRest(deployment, currentStatuses);
      });
    }
    const start = (page - 1) * 100;
    const nodes = this.#graphqlSnapshot.slice(start, page * 100);
    const hasNextPage = this.#graphqlSnapshot.length > page * 100;
    return providerGraphqlResponse(nodes, {
      endCursor: hasNextPage ? `cursor-${String(page)}` : `end-${String(page)}`,
      hasNextPage,
      remaining: 999 - this.graphqlCalls.length,
      totalCount: this.#graphqlSnapshot.length,
    });
  }

  async get(
    endpoint: string,
    options?: Readonly<{ timeoutMilliseconds?: number }>,
  ): Promise<ProviderJson> {
    if (options?.timeoutMilliseconds !== undefined) {
      this.timeoutMilliseconds.push(options.timeoutMilliseconds);
      this.timedCalls.push(Object.freeze({
        endpoint,
        timeoutMilliseconds: options.timeoutMilliseconds,
      }));
    }
    this.readHook?.(options?.timeoutMilliseconds);
    this.calls.push(`GET ${endpoint}`);
    if (endpoint === `/repos/${providerRepository}`) {
      const branch = this.defaultBranchSnapshots[
        Math.min(this.#defaultBranchRead, this.defaultBranchSnapshots.length - 1)
      ];
      this.#defaultBranchRead += 1;
      return { default_branch: branch ?? "main" };
    }
    if (endpoint === `/repos/${providerRepository}/git/ref/heads/main`) {
      const sha = this.defaultBranchShaSnapshots[
        Math.min(this.#defaultBranchShaRead, this.defaultBranchShaSnapshots.length - 1)
      ];
      this.#defaultBranchShaRead += 1;
      return providerRef(sha ?? providerVerifiedSha, "main");
    }
    if (endpoint === `/repos/${providerRepository}/git/ref/heads/website-production`) {
      const value = this.refValues[Math.min(this.#refRead, this.refValues.length - 1)];
      const snapshot = this.refSnapshots[Math.min(this.#refRead, this.refSnapshots.length - 1)];
      this.#refRead += 1;
      if (value !== undefined) return value;
      return providerRef(snapshot ?? this.refSha);
    }
    if (endpoint === `/repos/${providerRepository}/releases/tags/${providerTag}`) {
      const snapshot = this.releaseSnapshots[
        Math.min(this.#releaseRead, this.releaseSnapshots.length - 1)
      ];
      this.#releaseRead += 1;
      if (snapshot !== undefined) return snapshot;
      return this.release;
    }
    if (endpoint === `/repos/${providerRepository}/releases/latest`) {
      const snapshot = this.latestSnapshots[
        Math.min(this.#latestRead, this.latestSnapshots.length - 1)
      ];
      this.#latestRead += 1;
      return snapshot ?? this.latest;
    }
    const workflowRun = new RegExp(
      `^/repos/${providerRepository}/actions/runs/([1-9][0-9]*)$`,
      "u",
    ).exec(endpoint);
    if (workflowRun !== null) {
      const snapshot = this.workflowRunSnapshots[
        Math.min(this.#workflowRunRead, this.workflowRunSnapshots.length - 1)
      ];
      this.#workflowRunRead += 1;
      return snapshot ?? providerReleaseWorkflowRun();
    }
    if (endpoint === providerTagCommitEndpoint) {
      const snapshot = this.tagSnapshots[Math.min(this.#tagRead, this.tagSnapshots.length - 1)];
      this.#tagRead += 1;
      return providerCommitResponse(snapshot ?? providerVerifiedSha);
    }
    if (providerAmbiguousTagCommitEndpoints.includes(endpoint)) {
      return providerCommitResponse(providerTagObjectSha);
    }
    if (
      endpoint ===
      `/repos/${providerRepository}/compare/${providerPreviousSha}...${providerVerifiedSha}`
    ) {
      this.compareHook?.();
      return this.compare;
    }
    const sourceComparison = new RegExp(
      `^/repos/${providerRepository}/compare/([0-9a-f]{40})\\.\\.\\.([0-9a-f]{40})$`,
      "u",
    ).exec(endpoint);
    if (sourceComparison !== null) {
      const ancestor = sourceComparison[1] ?? "";
      const descendant = sourceComparison[2] ?? "";
      const snapshot = this.sourceCompareSnapshots[
        Math.min(this.#sourceCompareRead, this.sourceCompareSnapshots.length - 1)
      ];
      this.#sourceCompareRead += 1;
      return snapshot ?? this.sourceCompare ?? providerCompare({
        base_commit: { sha: ancestor },
        commits: [{ sha: descendant }],
        merge_base_commit: { sha: ancestor },
      });
    }
    const deploymentPage = new RegExp(
      `^/repos/${providerRepository}/deployments\\?environment=Production&task=deploy&per_page=100&page=([1-6])$`,
      "u",
    ).exec(endpoint);
    if (deploymentPage !== null) {
      const page = Number(deploymentPage[1]);
      if (page === 1) {
        this.#deploymentRead += 1;
        this.#deploymentSnapshot =
          this.deploymentSnapshots[Math.min(this.#deploymentRead, this.deploymentSnapshots.length - 1)] ?? [];
      }
      return this.#deploymentSnapshot.slice((page - 1) * 100, page * 100);
    }
    const deploymentDetail = new RegExp(
      `^/repos/${providerRepository}/deployments/([1-9][0-9]*)$`,
      "u",
    ).exec(endpoint);
    if (deploymentDetail !== null) {
      if (this.deploymentDetailError !== undefined) throw this.deploymentDetailError;
      const deploymentId = Number(deploymentDetail[1]);
      const snapshot = this.deploymentDetailSnapshots[
        Math.min(this.#deploymentDetailRead, this.deploymentDetailSnapshots.length - 1)
      ];
      this.#deploymentDetailRead += 1;
      if (snapshot !== undefined) return snapshot;
      const found = this.#deploymentSnapshot.find((deployment) =>
        (deployment as Readonly<Record<string, ProviderJson>>).id === deploymentId);
      if (found !== undefined) return found;
      throw new Error(`Deployment ${String(deploymentId)} disappeared`);
    }
    const statusPage = new RegExp(
      `^/repos/${providerRepository}/deployments/([1-9][0-9]*)/statuses\\?per_page=100&page=([1-6])$`,
      "u",
    ).exec(endpoint);
    if (statusPage !== null) {
      const deploymentId = Number(statusPage[1]);
      const page = Number(statusPage[2]);
      if (page === 1) {
        const read = (this.#statusReads.get(deploymentId) ?? -1) + 1;
        this.#statusReads.set(deploymentId, read);
        const snapshots = this.statusSnapshots.get(deploymentId) ?? [[]];
        this.#statusCurrent.set(
          deploymentId,
          snapshots[Math.min(read, snapshots.length - 1)] ?? [],
        );
      }
      const statuses = this.#statusCurrent.get(deploymentId) ?? [];
      return statuses.slice((page - 1) * 100, page * 100);
    }
    throw new Error(`Unexpected provider GET ${endpoint}`);
  }

  async getWithServerDate(endpoint: string): Promise<ProviderJson> {
    this.includedCalls.push(endpoint);
    const body = await this.get(endpoint);
    const serverDate = this.serverDates[
      Math.min(this.#serverDateRead, this.serverDates.length - 1)
    ];
    this.#serverDateRead += 1;
    return { body, serverDate: serverDate ?? providerPromotionServerDate };
  }

  async advanceRef(
    repository: string,
    expectedOldSha: string,
    verifiedSha: string,
    verifiedTag: string,
  ): Promise<ProviderJson> {
    this.calls.push(`GIT CAS ${repository} ${expectedOldSha} ${verifiedSha} ${verifiedTag}`);
    expect(repository).toBe(providerRepository);
    expect(expectedOldSha).toBe(providerPreviousSha);
    expect(verifiedSha).toBe(providerVerifiedSha);
    expect(verifiedTag).toBe(providerTag);
    if (this.patchError !== undefined) throw this.patchError;
    this.refSha = providerVerifiedSha;
    return providerReleaseAppRevocation;
  }
}

function terminalBaselineStatus(
  deploymentId = 10,
  createdAt = "2026-08-29T13:01:00Z",
): Map<number, ProviderJson[][]> {
  return new Map([
    [deploymentId, [[providerStatus(100, "success", createdAt, {}, deploymentId)]]],
  ]);
}

async function providerReceipts(mode: "advanced" | "already-exact"): Promise<Readonly<{
  baseline: ProviderJson;
  baselineDeployment: ProviderJson;
  promotion: ProviderJson;
  promotionCalls: readonly string[];
}>> {
  const baselineDeployment = providerDeployment(
    10,
    mode === "already-exact" ? "2026-08-29T14:05:00Z" : "2026-08-29T13:00:00Z",
    mode === "already-exact" ? {} : { sha: providerPreviousSha },
  );
  const baselineApi = new ProviderApiFixture({
    deployments: [[baselineDeployment]],
    refSha: mode === "already-exact" ? providerVerifiedSha : providerPreviousSha,
    serverDates: [providerBaselineServerDate, providerBaselineServerDate],
    statuses: terminalBaselineStatus(
      10,
      mode === "already-exact" ? "2026-08-29T14:06:00Z" : "2026-08-29T13:01:00Z",
    ),
  });
  const baseline = await createProviderBaseline({
    api: baselineApi,
    repository: providerRepository,
    verifiedSha: providerVerifiedSha,
  }) as ProviderJson;
  const promotionApi = new ProviderApiFixture({
    deployments: [[baselineDeployment]],
    refSha: mode === "already-exact" ? providerVerifiedSha : providerPreviousSha,
    serverDates: [providerPromotionServerDate],
    statuses: terminalBaselineStatus(
      10,
      mode === "already-exact" ? "2026-08-29T14:06:00Z" : "2026-08-29T13:01:00Z",
    ),
  });
  const promotion = await promoteWebsiteProduction({
    api: promotionApi,
    baselineReceipt: baseline,
    repository: providerRepository,
    verifiedSha: providerVerifiedSha,
    verifiedTag: providerTag,
  }) as ProviderJson;
  return Object.freeze({
    baseline,
    baselineDeployment,
    promotion,
    promotionCalls: Object.freeze([...promotionApi.calls]),
  });
}

const requiredVaultSources = [
  "src/control/vault-model.ts",
  "src/control/vault-store.ts",
  "src/control/vault-runtime.ts",
  "src/control/vault-process.ts",
  "src/control/vault-helper.ts",
  "src/control/vault-custody.ts",
  "src/control/credential-executor.ts",
  "src/control/credential-gateway.ts",
] as const;

describe("npm publication contract", () => {
  test("derives the tar expansion ceiling from the reviewed package budget", async () => {
    const artifact = await readFile(packageArtifactUrl, "utf8");

    expect(MAX_PACKAGE_TAR_BYTES).toBe(
      Math.ceil(
        (MAX_UNPACKED_BYTES + MAX_PACKED_ENTRIES * 1_023 + 1_024) / 512,
      ) * 512,
    );
    expect(MAX_PACKAGE_TAR_BYTES).toBe(23_230_976);
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

  test("keeps the PR Required gate as the union of Linux shards and the macOS subset", async () => {
    const workflow = await readFile(ciWorkflowUrl, "utf8");
    const staticStart = workflow.indexOf("\n  static:\n");
    const packageStart = workflow.indexOf("\n  package:\n");
    const testStart = workflow.indexOf("\n  test:\n");
    const testOmniStart = workflow.indexOf("\n  test-omni:\n");
    const standaloneStart = workflow.indexOf("\n  standalone:\n");
    const macosStart = workflow.indexOf("\n  macos:\n");
    const requiredStart = workflow.indexOf("\n  required:\n");

    expect(workflow.match(/^  static:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  package:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  test:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  test-omni:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  standalone:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  macos:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  required:$/gmu)).toHaveLength(1);
    expect(workflow.match(/^  check:$/gmu) ?? []).toHaveLength(0);
    expect(workflow.match(/^    timeout-minutes: [0-9]+$/gmu)).toHaveLength(7);
    expect(staticStart).toBeGreaterThan(-1);
    expect(packageStart).toBeGreaterThan(staticStart);
    expect(testStart).toBeGreaterThan(packageStart);
    expect(testOmniStart).toBeGreaterThan(testStart);
    expect(standaloneStart).toBeGreaterThan(testOmniStart);
    expect(macosStart).toBeGreaterThan(standaloneStart);
    expect(requiredStart).toBeGreaterThan(macosStart);

    const staticJob = workflow.slice(staticStart, packageStart);
    const packageJob = workflow.slice(packageStart, testStart);
    const testJob = workflow.slice(testStart, testOmniStart);
    const testOmniJob = workflow.slice(testOmniStart, standaloneStart);
    const standaloneJob = workflow.slice(standaloneStart, macosStart);
    const macosJob = workflow.slice(macosStart, requiredStart);
    const requiredJob = workflow.slice(requiredStart);

    const timeoutValues = (job: string): readonly number[] =>
      [...job.matchAll(/^    timeout-minutes: ([0-9]+)$/gmu)]
        .map((match) => Number(match[1]));

    expect(timeoutValues(staticJob)).toEqual([15]);
    expect(timeoutValues(packageJob)).toEqual([20]);
    expect(timeoutValues(testJob)).toEqual([40]);
    expect(timeoutValues(testOmniJob)).toEqual([25]);
    expect(timeoutValues(standaloneJob)).toEqual([20]);
    expect(timeoutValues(macosJob)).toEqual([45]);
    expect(timeoutValues(requiredJob)).toEqual([5]);
    expect(staticJob.match(/^      - run: bun run check:static$/gmu) ?? []).toHaveLength(1);
    expect(packageJob.match(/^      - run: bun run check:package$/gmu) ?? []).toHaveLength(1);
    expect(packageJob).toContain("git status --porcelain --untracked-files=all -- dist bun.lock");
    expect(packageJob).toContain("./dist/index.js");
    expect(testJob).toContain("bun run ./scripts/ci-test-shard.ts");
    expect(testJob).toContain("shard: [1, 2, 3, 4]");
    expect(testOmniJob.match(/^      - run: bun run test:omni$/gmu) ?? []).toHaveLength(1);
    expect(standaloneJob.match(/^      - run: bun run test:standalone$/gmu) ?? []).toHaveLength(1);
    expect(macosJob.match(/^      - run: bun run check:macos$/gmu) ?? []).toHaveLength(1);
    expect(macosJob).toContain("rustup toolchain install 1.97.1 --profile minimal && rustup default 1.97.1");
    expect(macosJob.match(/^      - run: bun run desktop:check-native$/gmu) ?? []).toHaveLength(1);
    expect(macosJob.indexOf("bun run desktop:check-native")).toBeGreaterThan(macosJob.indexOf("bun run check:macos"));
    expect(macosJob.match(/^      - run: bun run check$/gmu) ?? []).toHaveLength(0);
    expect(requiredJob.match(/^      - run: bun run check$/gmu) ?? []).toHaveLength(0);
    expect(requiredJob.match(
      /^    needs: \[static, package, test, test-omni, standalone, macos\]$/gmu,
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
    expect(budget).toContain("2,337,247 compressed");
    expect(budget).toContain("12,742,436 payload bytes across exactly 532 files");
    expect(budget).toContain("94d6d015620ae4a4a9f6c59a761c1d631ecb91a6df6ab3e606f041440d72929b");
    expect(budget).toContain("2,337,268 compressed and 12,742,512 payload bytes");
    expect(budget).toContain("f37cf3a326301db472f08e3ec56dc8dc14ef9897a85b1a51d95065abec4e28dd");
    expect(budget).toContain("2,338,050 compressed and 12,745,801");
    expect(budget).toContain("fc00b4d88c542ce47c13b4fd281f87fff16f4c920b59fa44fc242091d52a5f6b");
    expect(budget).toContain("2,351,623 compressed / 12,793,233 payload bytes");
    expect(budget).toContain("ecec283d7db9faffcf6bf7d7d6861de0d6a0f99e0d9c90923318627a369a79bd");
    expect(budget).toContain("2,352,260 compressed and 12,795,796 payload bytes");
    expect(budget).toContain("a9273339f49473e32c298f403b6673a6eb16d2848335315e5eff94754a03c6bc");
    expect(budget).toContain("2,354,420 compressed and 12,806,990 payload bytes");
    expect(budget).toContain("2594de7a4b1fffc380aacdbe0c7a15b5dd0782db78ec264f9b807db527fb87ea");
    expect(budget).toContain("2,360,770 compressed and 12,841,328 payload bytes");
    expect(budget).toContain("517341426a9bdcdb0f245032f08b607d7617aed061932d4577a4ef3a25d6ec77");
    expect(budget).toContain("2,361,917 compressed and 12,845,303 payload bytes");
    expect(budget).toContain("8518b9c0264d6c80c5d016fc75e98063c39d3a76055f5592bcec3ef5b6992667");
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
    expect(budget).toContain("22,515,152 payload bytes across exactly 558 files");
    expect(budget).toContain("c606e02ae0ce9b4c72f8b27f7b705698597e6f1f474d0dc00f525cd7c0bbc259");
    expect(budget).toContain("22,513,764 payload bytes across exactly 558 files");
    expect(budget).toContain("a7c6b53a90bde4324f2e4a8b3fb7af7ea2550d56549aad9c6a62c2637f035a04");
    expect(budget).toContain("22,504,918 payload bytes across exactly 558 files");
    expect(budget).toContain("da3f581f1f96724337a99c4b80567d4d11893c4df1ff9a808464260796092976");
    expect(budget).toContain("22,496,998 payload bytes across exactly 558 files");
    expect(budget).toContain("47c0114ba631b314fa5bea489eb79e29a77bb7e06321c4088725b6b238dfe81a");
    expect(budget).toContain("11,691,232 compressed / 22,642,211 payload bytes across exactly 574 files");
    expect(budget).toContain("5d020e68a4362c41b3e5251828144df4be4533b3bc2ad25f6f7b2b45a624a50e");
    expect(budget).toContain("1f936230bbfe3624e8a633b3068d99d3839d5ba092fcb104b6c172984a4cb363");
    expect(budget).toContain("11,657,577 + 4,096 = 11,661,673");
    expect(budget).toContain("376dee6d63a54be49b46407cbcb69769da00c075657d89f40e0002975d49225f");
    expect(budget).toContain("7a1459e68864f3b5c5779915f37aba6bc0d164b57ddd69a86e581674c30fed06");
    expect(budget).toContain("11,691,340 compressed / 22,642,526 payload bytes across exactly 574 files");
    expect(budget).toContain("00c1d461b83bf891d62e51e6ab1f1f5f25108767c1216f00d90ef7bc8eba82a4");
    expect(MAX_PACKED_BYTES).toBe(11_695_436);
    expect(MAX_PACKED_BYTES).toBe(11_691_340 + 4_096);
    expect(MAX_PACKED_ENTRIES).toBe(574);
    expect(MAX_PACKED_FILES).toBe(574);
    expect(MAX_UNPACKED_BYTES).toBe(22_642_591);
    expect(MAX_UNPACKED_BYTES).toBe(22_642_526 + 65);
    expect(budget).toContain("2,324,169 + 4,096 = 2,328,265");
    expect(budget).toContain("2,330,878 + 4,096 = 2,334,974");
    expect(Object.isFrozen(packageArtifactBudget)).toBe(true);
    for (const range of Object.values(packageArtifactBudget)) {
      expect(Object.isFrozen(range)).toBe(true);
    }
    expect(packageArtifactBudget).toEqual({
      entryCount: { min: 574, max: 574 },
      fileCount: { min: 574, max: 574 },
      packedBytes: { min: 1_600_000, max: 11_695_436 },
      unpackedBytes: { min: 9_000_000, max: 22_642_591 },
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

  test("keeps the exact eight public SDK entrypoints and required source inventory", async () => {
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
    const setupSources = [
      "docs/agent-setup.md", "src/control/setup-model.ts", "src/control/setup.ts",
      "src/control/setup-cli.ts", "src/control/discovery.ts", "src/control/discovery-process.ts",
      "src/control/discovery-helper.ts", "src/control/discovery-reader.ts",
    ];
    const directory = await mkdtemp(join(tmpdir(), "ghostget-control-artifact-"));
    const archive = join(directory, "package.tgz");
    try {
      await run([process.execPath, "pm", "pack", "--filename", archive, "--ignore-scripts", "--quiet"], repository);
      const inventory = await inspectPackageArtifact(archive);
      expect(inventory.files.some(file => file.path === "docs/control-panel.md")).toBe(true);
      expect(inventory.files.some(file => file.path === "src/control/credential-helper.ts")).toBe(true);
      for (const source of [...requiredVaultSources, ...setupSources]) expect(inventory.files.some(file => file.path === source)).toBe(true);
      expect(inventory.files.some(file => file.path === "src/provider-plugin-import-analysis.ts")).toBe(true);
      expect(inventory.files.some(file => file.path.startsWith("desktop/") || file.path.includes("/direct/"))).toBe(false);
      expect(inventory.files.some(file => file.path.includes("benchmark"))).toBe(false);
      const originalTar = gunzipSync(await readFile(archive));
      for (const [source, replacement, expected] of [
        ...requiredVaultSources.map(source => [source, source.replace(".ts", "-missing.ts"), `Required package path is missing: ${source}`] as const),
        ...setupSources.map((source, index) => [source, `src/absent-setup-${index}.ts`, `Required package path is missing: ${source}`] as const),
        ["src/control/helper.ts", "src/control/absent-helper.ts", "Required package path is missing: src/control/helper.ts"],
        ["src/provider-plugin-import-analysis.ts", "src/absent-provider-analysis.ts", "Required package path is missing: src/provider-plugin-import-analysis.ts"],
        ["docs/control-panel.md", "src/control-guide.md", "Required package path is missing: docs/control-panel.md"],
        ["docs/control-panel.md", "docs/unreviewed.md", "Unexpected package path: docs/unreviewed.md"],
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
      const manifestWithoutClosingBrace = manifestText.trimEnd().slice(0, -1);
      const manifestPaddedSize = Math.ceil(manifestEntry.size / 512) * 512;
      const runPrivateVariant = async (
        value: string,
        accepted: boolean,
      ): Promise<void> => {
        const variantManifest = Buffer.from(
          `${manifestWithoutClosingBrace},\n  "private": ${value}\n}\n`,
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
      for (const hostileAttempt of [
        { ...validAttempt, actor: { id: 7, type: "User" } },
        { ...validAttempt, triggering_actor: { id: 7, type: "User" } },
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

  test("routes recovery through the reviewed main-origin website workflow", async () => {
    const [releaseWorkflow, websiteWorkflow] = await Promise.all([
      readFile(releaseWorkflowUrl, "utf8"),
      readFile(websiteProductionWorkflowUrl, "utf8"),
    ]);
    const requestScript = workflowStepScript(
      websiteWorkflow,
      "Bind dispatch to reviewed main workflow source",
    );
    const parsed = Bun.YAML.parse(websiteWorkflow) as { jobs: { verify: { steps: { uses?: string; with?: unknown }[] } } };
    const verifyCheckout = parsed.jobs.verify.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    expect(verifyCheckout?.with).toEqual({
      "fetch-depth": 1, "fetch-tags": false, "persist-credentials": false, ref: "${{ github.sha }}",
    });

    expect(releaseWorkflow).not.toContain("workflow_dispatch:");
    expect(releaseWorkflow).not.toContain("release-provider-outcome.mjs promote");
    expect(releaseWorkflow).not.toMatch(/release-provider-outcome\.mjs wait(?:\s|$)/u);
    expect(releaseWorkflow).not.toContain("/rulesets");
    expect(websiteWorkflow).toContain("workflow_run:");
    expect(websiteWorkflow).toContain("workflow_dispatch:");
    expect(websiteWorkflow).toContain("UPSTREAM_WORKFLOW_ID");
    expect(requestScript).toContain('"$UPSTREAM_WORKFLOW_ID" != "323493609"');
    expect(requestScript).toContain('"$EVENT_REPOSITORY_ID" != "1316443113"');
    for (const hostileField of [
      "UPSTREAM_CONCLUSION",
      "UPSTREAM_EVENT",
      "UPSTREAM_HEAD_BRANCH",
      "UPSTREAM_HEAD_REPOSITORY",
      "UPSTREAM_HEAD_SHA",
      "UPSTREAM_PATH",
      "UPSTREAM_RUN_ID",
      "UPSTREAM_RUN_ATTEMPT",
      "UPSTREAM_WORKFLOW_ID",
    ] as const) {
      expect(requestScript).toContain(hostileField);
    }
    expect(websiteWorkflow).not.toContain("UPSTREAM_WORKFLOW_NAME");
    expect(requestScript).toContain('repository_default="$(gh api');
    expect(requestScript).toContain('current_main_sha="$(gh api');
    expect(requestScript).toContain('! "$current_main_sha" =~ ^[0-9a-f]{40}$');
    expect(requestScript).not.toContain('"$current_main_sha" != "$EVENT_SHA"');

    const directory = await mkdtemp(join(tmpdir(), "ghostget-website-request-"));
    const binaryDirectory = join(directory, "bin");
    const ghStub = join(binaryDirectory, "gh");
    const output = join(directory, "github-output.txt");
    const sourceSha = providerWorkflowSha;
    try {
      await mkdir(binaryDirectory, { recursive: true });
      await writeFile(ghStub, `#!/bin/bash
set -euo pipefail
case "$*" in
  "api /repos/hraness/ghostget --jq .default_branch") printf 'main\\n' ;;
  "api /repos/hraness/ghostget/git/ref/heads/main --jq .object.sha") printf '%s\\n' "$CURRENT_MAIN_SHA" ;;
  *) echo "unexpected gh command: $*" >&2; exit 1 ;;
esac
`, "utf8");
      await chmod(ghStub, 0o755);
      const baseEnvironment = Object.freeze({
        CURRENT_MAIN_SHA: sourceSha,
        DEFAULT_BRANCH: "main",
        EVENT_NAME: "workflow_run",
        EVENT_REF: "refs/heads/main",
        EVENT_REPOSITORY: providerRepository,
        EVENT_REPOSITORY_ID: String(GHOSTGET_REPOSITORY_ID),
        EVENT_SHA: sourceSha,
        GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: providerRepository,
        INPUT_RELEASE_TAG: "",
        PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
        UPSTREAM_CONCLUSION: "success",
        UPSTREAM_EVENT: "push",
        UPSTREAM_HEAD_BRANCH: "v0.16.2",
        UPSTREAM_HEAD_REPOSITORY: providerRepository,
        UPSTREAM_HEAD_SHA: providerVerifiedSha,
        UPSTREAM_PATH: ".github/workflows/release.yml",
        UPSTREAM_RUN_ID: providerReleaseWorkflowRunId,
        UPSTREAM_RUN_ATTEMPT: "1",
        UPSTREAM_WORKFLOW_ID: "323493609",
      });
      const runCase = async (overrides: Readonly<Record<string, string>>) => {
        await rm(output, { force: true });
        return runWorkflowScript(requestScript, { ...baseEnvironment, ...overrides });
      };

      const automatic = await runCase({});
      expect(automatic.exitCode).toBe(0);
      expect(await readFile(output, "utf8")).toBe(
        `sha=${sourceSha}\ntag=v0.16.2\nrelease_sha=${providerVerifiedSha}\nrelease_run_id=${providerReleaseWorkflowRunId}\nrelease_run_attempt=1\n`,
      );
      const manual = await runCase({
        EVENT_NAME: "workflow_dispatch",
        INPUT_RELEASE_TAG: "v0.16.2",
        UPSTREAM_CONCLUSION: "",
        UPSTREAM_EVENT: "",
        UPSTREAM_HEAD_BRANCH: "",
        UPSTREAM_HEAD_REPOSITORY: "",
        UPSTREAM_HEAD_SHA: "",
        UPSTREAM_PATH: "",
        UPSTREAM_RUN_ID: "",
        UPSTREAM_RUN_ATTEMPT: "",
        UPSTREAM_WORKFLOW_ID: "",
      });
      expect(manual.exitCode).toBe(0);
      expect(await readFile(output, "utf8")).toBe(
        `sha=${sourceSha}\ntag=v0.16.2\nrelease_sha=\nrelease_run_id=\nrelease_run_attempt=\n`,
      );

      for (const rejected of [
        { UPSTREAM_WORKFLOW_ID: "1" },
        { UPSTREAM_PATH: ".github/workflows/copied.yml" },
        { UPSTREAM_EVENT: "workflow_dispatch" },
        { UPSTREAM_RUN_ID: "0" },
        { UPSTREAM_RUN_ATTEMPT: "2" },
        { UPSTREAM_CONCLUSION: "failure" },
        { UPSTREAM_HEAD_REPOSITORY: "hraness/copied" },
        { UPSTREAM_HEAD_SHA: "not-a-sha" },
        { UPSTREAM_HEAD_BRANCH: "main" },
        { EVENT_REF: "refs/tags/v0.16.2" },
        { EVENT_REPOSITORY_ID: "1" },
        { CURRENT_MAIN_SHA: "not-a-sha" },
      ] as const) {
        const result = await runCase(rejected);
        expect(result.exitCode).not.toBe(0);
        expect(await Bun.file(output).exists()).toBe(false);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("separates reviewed main-origin workflow authority from the immutable release commit", async () => {
    const workflow = await readFile(websiteProductionWorkflowUrl, "utf8");
    const identityScript = workflowStepScript(
      workflow,
      "Verify exact immutable release coordinate",
    );

    expect(workflow.match(/actions\/checkout@/gu) ?? []).toHaveLength(5);
    expect(workflow.match(/fetch-depth: 1/gu) ?? []).toHaveLength(5);
    expect(workflow.match(/fetch-tags: false/gu) ?? []).toHaveLength(5);
    expect(workflow.match(/persist-credentials: false/gu) ?? []).toHaveLength(5);
    expect(workflow).not.toContain("fetch-depth: 0");
    expect(identityScript).not.toContain("git tag --list");
    expect(identityScript).not.toContain("FETCH_HEAD");

    expect(identityScript).toContain('"$head_commit" != "$RECOVERY_WORKFLOW_SHA"');
    expect(identityScript).toContain('"$REQUESTED_RELEASE_SHA" != "$tag_commit"');
    expect(identityScript).toContain(
      './scripts/release-ref-authority.ts promotion "$REQUESTED_TAG"',
    );
    expect(identityScript).not.toContain("git merge-base");
    expect(identityScript).toContain('git show "${tag_commit}:package.json"');
    expect(identityScript).toContain("printf 'sha=%s\\n' \"$tag_commit\"");
    expect(identityScript).toContain(
      'VERIFIED_SHA="$tag_commit" VERIFIED_TAG="$REQUESTED_TAG"',
    );
    expect(identityScript).toContain("resolve-release-authority");
    expect(identityScript).not.toContain('"$tag_commit" != "$head_commit"');

    const api = new ProviderApiFixture({
      defaultBranchShaSnapshots: [
        providerWorkflowSha,
        providerWorkflowSha,
        providerWorkflowSha,
        providerWorkflowSha,
      ],
      releaseSnapshots: [
        providerRelease({ target_commitish: "main" }),
        providerRelease({ target_commitish: providerVerifiedSha }),
      ],
    });
    await expect(revalidateReleaseAuthority({
      api,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      recoveryWorkflowSha: providerWorkflowSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).resolves.toBeUndefined();
    expect(api.calls.filter((call) => call === `GET ${providerTagCommitEndpoint}`))
      .toHaveLength(2);
    expect(api.calls.filter((call) =>
      call === `GET /repos/${providerRepository}/actions/runs/${providerReleaseWorkflowRunId}`
    )).toHaveLength(0);

    const releaseRunPresentationAfterInitialValidation = new ProviderApiFixture({
      defaultBranchShaSnapshots: Array(4).fill(providerWorkflowSha),
      workflowRunSnapshots: [
        providerReleaseWorkflowRun({ conclusion: "failure" }),
      ],
    });
    await expect(revalidateReleaseAuthority({
      api: releaseRunPresentationAfterInitialValidation,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      recoveryWorkflowSha: providerWorkflowSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).resolves.toBeUndefined();
    expect(releaseRunPresentationAfterInitialValidation.calls.some((call) =>
      call.includes("/actions/runs/")
    )).toBe(false);

    const releaseIdentityDrift = new ProviderApiFixture({
      defaultBranchShaSnapshots: [
        providerWorkflowSha,
        providerWorkflowSha,
        providerWorkflowSha,
        providerWorkflowSha,
      ],
      releaseSnapshots: [
        providerRelease({ id: 10, target_commitish: "main" }),
        providerRelease({ id: 11, target_commitish: providerVerifiedSha }),
      ],
      latestSnapshots: [
        providerLatest({ id: 10 }),
        providerLatest({ id: 11 }),
      ],
    });
    await expect(revalidateReleaseAuthority({
      api: releaseIdentityDrift,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      recoveryWorkflowSha: providerWorkflowSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("changed during authority verification");

    const directory = await mkdtemp(join(tmpdir(), "ghostget-promotion-identity-"));
    const output = join(directory, "github-output.txt");
    const helperDirectory = join(directory, "scripts");
    const binaryDirectory = join(directory, "bin");
    const nodeStub = join(binaryDirectory, "node");
    const checkedGit = (arguments_: readonly string[]): string => {
      const result = Bun.spawnSync(["git", ...arguments_], {
        cwd: directory,
        stderr: "pipe",
        stdout: "pipe",
      });
      if (result.exitCode !== 0) throw new Error(result.stderr.toString());
      return result.stdout.toString().trim();
    };
    try {
      checkedGit(["init", "--initial-branch=main"]);
      checkedGit(["config", "user.name", "Ghostget promotion test"]);
      checkedGit(["config", "user.email", "test@example.invalid"]);
      await mkdir(helperDirectory, { recursive: true });
      await mkdir(binaryDirectory, { recursive: true });
      await writeFile(nodeStub, `#!/bin/bash
set -euo pipefail
if [[ "\${1-}" == "--experimental-strip-types" && \
      "\${2-}" == "./scripts/release-ref-authority.ts" && \
      "\${3-}" == "promotion" ]]; then
  [[ "$GITHUB_REPOSITORY" == "hraness/ghostget" && "$DEFAULT_BRANCH" == "main" ]]
  tag="\${4-}"
  workflow_sha="\${5-}"
  expected_release_sha="\${6-}"
  head_sha="$(PATH="$ORIGINAL_PATH" git rev-parse --verify 'HEAD^{commit}')"
  tag_sha="$(PATH="$ORIGINAL_PATH" git rev-parse --verify "refs/tags/$tag^{commit}")"
  [[ "$head_sha" == "$workflow_sha" ]]
  PATH="$ORIGINAL_PATH" git merge-base --is-ancestor "$tag_sha" "$workflow_sha"
  if [[ -n "$expected_release_sha" && "$expected_release_sha" != "$tag_sha" ]]; then
    exit 1
  fi
  printf 'sha=%s\ntag=%s\nmain_sha=%s\n' "$tag_sha" "$tag" "$workflow_sha"
elif [[ "\${1-}" == "./scripts/release-provider-outcome.mjs" && \
        "\${2-}" == "resolve-release-authority" ]]; then
  printf '%s' "${providerReleaseWorkflowRunId}"
else
  PATH="$ORIGINAL_PATH" exec node "$@"
fi
`, "utf8");
      await chmod(nodeStub, 0o755);
      await writeFile(
        join(directory, "package.json"),
        '{"name":"@hraness/ghostget","version":"0.16.2"}\n',
        "utf8",
      );
      await writeFile(
        join(helperDirectory, "release-provider-outcome.mjs"),
        "process.exit(0);\n",
        "utf8",
      );
      checkedGit(["add", "package.json", "scripts/release-provider-outcome.mjs"]);
      checkedGit(["commit", "-m", "immutable release"]);
      const releaseSha = checkedGit(["rev-parse", "HEAD"]);
      checkedGit(["tag", providerTag]);
      await writeFile(
        join(directory, "package.json"),
        '{"name":"@hraness/ghostget","version":"9.9.9"}\n',
        "utf8",
      );
      await writeFile(join(directory, "control.txt"), "reviewed main workflow\n", "utf8");
      checkedGit(["add", "package.json", "control.txt"]);
      checkedGit(["commit", "-m", "post-release control fix"]);
      const workflowSha = checkedGit(["rev-parse", "HEAD"]);

      const runIdentity = async (
        eventName: "workflow_dispatch" | "workflow_run",
        requestedReleaseSha: string,
        recoveryWorkflowSha = workflowSha,
      ) => {
        await rm(output, { force: true });
        return runWorkflowScript(identityScript, {
          DEFAULT_BRANCH: "main",
          EVENT_NAME: eventName,
          GITHUB_OUTPUT: output,
          GITHUB_REPOSITORY: "hraness/ghostget",
          ORIGINAL_PATH: process.env.PATH ?? "",
          PATH: `${binaryDirectory}:${process.env.PATH ?? ""}`,
          RECOVERY_WORKFLOW_SHA: recoveryWorkflowSha,
          REQUESTED_RELEASE_SHA: requestedReleaseSha,
          REQUESTED_RELEASE_WORKFLOW_RUN_ATTEMPT:
            eventName === "workflow_run" ? "1" : "",
          REQUESTED_RELEASE_WORKFLOW_RUN_ID:
            eventName === "workflow_run" ? providerReleaseWorkflowRunId : "",
          REQUESTED_TAG: providerTag,
        }, directory);
      };

      for (const [eventName, requestedReleaseSha] of [
        ["workflow_dispatch", ""],
        ["workflow_run", releaseSha],
      ] as const) {
        const result = await runIdentity(eventName, requestedReleaseSha);
        expect(result.exitCode).toBe(0);
        expect(await readFile(output, "utf8")).toBe(
          `sha=${releaseSha}\ntag=${providerTag}\nrelease_run_id=${providerReleaseWorkflowRunId}\n`,
        );
      }

      checkedGit(["checkout", "--detach", releaseSha]);
      const immediate = await runIdentity("workflow_dispatch", "", releaseSha);
      expect(immediate.exitCode).toBe(0);
      expect(await readFile(output, "utf8")).toBe(
        `sha=${releaseSha}\ntag=${providerTag}\nrelease_run_id=${providerReleaseWorkflowRunId}\n`,
      );
      checkedGit(["switch", "main"]);

      for (const [eventName, requestedReleaseSha] of [
        ["workflow_dispatch", releaseSha],
        ["workflow_run", "5".repeat(40)],
      ] as const) {
        const result = await runIdentity(eventName, requestedReleaseSha);
        expect(result.exitCode).not.toBe(0);
        expect(await Bun.file(output).exists()).toBe(false);
      }

      checkedGit(["switch", "--orphan", "unrelated"]);
      await writeFile(
        join(directory, "package.json"),
        '{"name":"@hraness/ghostget","version":"0.16.2"}\n',
        "utf8",
      );
      checkedGit(["add", "package.json"]);
      checkedGit(["commit", "-m", "unrelated release"]);
      checkedGit(["tag", "--force", providerTag]);
      checkedGit(["switch", "main"]);
      const unrelated = await runIdentity("workflow_dispatch", "");
      expect(unrelated.exitCode).not.toBe(0);
      expect(await Bun.file(output).exists()).toBe(false);
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
    expect(publish).toContain("canonical-attested-${{ github.run_id }}-${{ github.run_attempt }}");
    expect(publish).toContain("github-release-publish.ts");
    expect(workflow.slice(0, workflow.indexOf("  publish_npm:"))).not.toMatch(/npm view|npm audit signatures|npm publish/u);
    expect(workflow).not.toMatch(/WRENCH_RELEASE_APP_|website-production/u);
  });

  test("keeps provider verification read-only, terminal, and release-authoritative", async () => {
    const [releaseWorkflow, workflow, helper, appHelper, writerHelper, codeowners] = await Promise.all([
      readFile(releaseWorkflowUrl, "utf8"),
      readFile(websiteProductionWorkflowUrl, "utf8"),
      readFile(providerOutcomeHelperUrl, "utf8"),
      readFile(releaseAppTokenHelperUrl, "utf8"),
      readFile(releaseRefWriterHelperUrl, "utf8"),
      readFile(codeownersUrl, "utf8"),
    ]);
    const job = (name: string): string => {
      const start = workflow.indexOf(`\n  ${name}:\n`);
      if (start < 0) throw new Error(`Workflow job not found: ${name}`);
      const nextJob = /\n  [a-z][a-z_]*:\n/gu;
      nextJob.lastIndex = start + `\n  ${name}:\n`.length;
      const next = nextJob.exec(workflow)?.index ?? -1;
      return workflow.slice(start, next < 0 ? undefined : next);
    };
    const verifyJob = job("verify");
    const baselineJob = job("provider_baseline");
    const advanceJob = job("advance_production_ref");
    const existingJob = job("confirm_existing_production_ref");
    const selectionJob = job("select_promotion");
    const providerJob = job("provider_outcome");
    const workflowHeader = workflow.slice(0, workflow.indexOf("\npermissions:\n"));
    const permissions = (jobText: string): readonly string[] => {
      const match = /\n    permissions:\n((?:      [a-z-]+: (?:read|write)\n)+)/u.exec(jobText);
      if (match?.[1] === undefined) throw new Error("Workflow job has no exact permission block");
      return match[1].trim().split("\n").map((line) => line.trim()).sort();
    };

    for (const exactNodeJob of [baselineJob, advanceJob, existingJob, providerJob]) {
      expect(exactNodeJob).toContain("node-version: \"24\"");
      expect(exactNodeJob).toContain("package-manager-cache: false");
    }

    expect(workflow.indexOf("\n  provider_baseline:\n"))
      .toBeLessThan(workflow.indexOf("\n  advance_production_ref:\n"));
    expect(workflow.indexOf("\n  select_promotion:\n"))
      .toBeLessThan(workflow.indexOf("\n  provider_outcome:\n"));
    expect(baselineJob).toContain("needs: verify");
    expect(permissions(verifyJob)).toEqual(["actions: read", "contents: read"]);
    expect(workflowHeader).toContain("release_tag:");
    expect(workflowHeader).not.toContain("run_id:");
    expect(permissions(baselineJob)).toEqual([
      "contents: read",
      "deployments: read",
    ]);
    expect(baselineJob).not.toContain("contents: write");
    expect(baselineJob).toContain("release-provider-outcome.mjs baseline");
    expect(baselineJob).toContain("advance_required:");
    expect(permissions(advanceJob)).toEqual(["contents: read"]);
    expect(advanceJob).toContain("environment: { name: production-ref-writer-key, deployment: false }");
    expect(advanceJob).toContain("needs.provider_baseline.outputs.advance_required == 'true'");
    expect(advanceJob).toContain("WRENCH_RELEASE_APP_PRIVATE_KEY");
    expect(advanceJob).toContain("PROMOTION_EXPECTED_MODE: advanced");
    expect(advanceJob).toContain("release-provider-outcome.mjs promote");
    expect(permissions(existingJob)).toEqual(["contents: read"]);
    expect(existingJob).toContain("needs.provider_baseline.outputs.advance_required == 'false'");
    expect(existingJob).toContain("PROMOTION_EXPECTED_MODE: already-exact");
    expect(existingJob).not.toContain("environment:");
    expect(existingJob).not.toContain("WRENCH_RELEASE_APP_");
    expect(selectionJob).toContain("Bind exactly one promotion path");
    expect(selectionJob).toContain("permissions: {}");
    expect(selectionJob).toContain("ADVANCE_RESULT");
    expect(selectionJob).toContain("EXISTING_RESULT");
    expect(providerJob).toContain("timeout-minutes: 30");
    expect(providerJob).toContain(
      "if: >-\n" +
        "      ${{ !cancelled() &&\n" +
        "          needs.verify.result == 'success' &&\n" +
        "          needs.provider_baseline.result == 'success' &&\n" +
        "          needs.select_promotion.result == 'success' }}",
    );
    expect(providerJob).not.toContain("always()");
    expect(permissions(providerJob)).toEqual([
      "contents: read",
      "deployments: read",
    ]);
    expect(providerJob).not.toContain("contents: write");
    expect(providerJob).not.toContain("continue-on-error");
    expect(providerJob).toContain("release-provider-outcome.mjs wait");
    expect(providerJob).toContain("needs.select_promotion.outputs.receipt");
    expect(providerJob).toContain("VERIFIED_SHA: ${{ needs.verify.outputs.verified_sha }}");
    expect(providerJob).toContain("VERIFIED_TAG: ${{ needs.verify.outputs.verified_tag }}");
    for (const strictReadJob of [baselineJob, advanceJob, existingJob, providerJob]) {
      expect(strictReadJob).toContain(
        "VERIFIED_RELEASE_RUN_ID: ${{ needs.verify.outputs.release_run_id }}",
      );
    }
    expect(workflow.match(
      /VERIFIED_RELEASE_RUN_ID: \$\{\{ needs\.verify\.outputs\.release_run_id \}\}/gu,
    ) ?? []).toHaveLength(9);
    expect(workflow.match(/actions: read/gu) ?? []).toHaveLength(1);
    expect(providerJob).toContain("DEFAULT_BRANCH: main");
    expect(providerJob).toContain("EVENT_NAME: ${{ github.event_name }}");
    expect(providerJob).toContain(
      "RECOVERY_WORKFLOW_SHA: ${{ needs.verify.outputs.workflow_sha }}",
    );
    expect(helper).toContain("defaultBranch: process.env.DEFAULT_BRANCH");
    expect(helper).toContain("eventName: process.env.EVENT_NAME");
    expect(helper).toContain("recoveryWorkflowSha: process.env.RECOVERY_WORKFLOW_SHA");
    expect(workflow.match(/ref: \$\{\{ needs\.verify\.outputs\.workflow_sha \}\}/gu)).toHaveLength(4);
    expect(releaseWorkflow).not.toContain("provider_baseline:");
    expect(releaseWorkflow).not.toContain("provider_outcome:");
    expect(releaseWorkflow).not.toContain("release-provider-outcome.mjs promote");
    expect(releaseWorkflow).not.toContain("website-production");
    expect(releaseWorkflow).not.toContain("WRENCH_RELEASE_APP_");
    expect(releaseWorkflow.match(/contents: write/gu) ?? []).toHaveLength(1);
    const workflowWriters: string[] = [];
    let contentsWriteOccurrences = 0;
    for (const filename of (await readdir(workflowsUrl)).filter((name) => name.endsWith(".yml")).sort()) {
      const source = await readFile(new URL(filename, workflowsUrl), "utf8");
      contentsWriteOccurrences += source.match(/contents:\s*write/gu)?.length ?? 0;
      expect(source).not.toMatch(/permissions:\s*write-all/u);
      const jobsStart = source.indexOf("\njobs:\n");
      expect(jobsStart).toBeGreaterThan(0);
      const workflowHeader = source.slice(0, jobsStart);
      expect(workflowHeader.match(/^  contents: (?:read|write)$/gmu) ?? [])
        .toEqual(["  contents: read"]);
      const jobs = source.slice(jobsStart + "\njobs:\n".length);
      const markers = [...jobs.matchAll(/^  ([A-Za-z_][A-Za-z0-9_-]*):$/gmu)];
      const jobNames = markers.map((marker) => marker[1]);
      expect(new Set(jobNames).size).toBe(jobNames.length);
      for (const [index, marker] of markers.entries()) {
        const name = marker[1];
        if (name === undefined || marker.index === undefined) continue;
        const next = markers[index + 1]?.index ?? jobs.length;
        const jobSource = jobs.slice(marker.index, next);
        const writes = jobSource.match(/^      contents: write$/gmu) ?? [];
        expect(writes.length).toBeLessThanOrEqual(1);
        if (writes.length === 1) workflowWriters.push(`${filename}:${name}`);
      }
    }
    expect(workflowWriters).toEqual(["desktop-release.yml:publish", "release.yml:publish"]);
    expect(contentsWriteOccurrences).toBe(2);
    expect(workflow).not.toContain("VERCEL_TOKEN");
    expect(workflow).not.toContain("projectSettings");
    expect(workflow).not.toContain("redeploy");
    expect(workflow).not.toContain("api.vercel.com");
    expect(workflow).not.toContain("autoAssignCustomDomains");
    expect(workflow).not.toContain("vercel alias");
    expect(workflow).not.toContain("vercel promote");
    expect(helper).not.toContain("--jq");
    expect(helper).not.toContain("@tsv");
    expect(helper).toContain("MAX_ITEMS = 500");
    expect(helper).toContain("MAX_GRAPHQL_DEPLOYMENT_PAGES = 5");
    expect(helper).toContain("MAX_GRAPHQL_COST_PER_REQUEST = 2");
    expect(helper).toContain("rateLimit { cost remaining resetAt }");
    expect(helper).toContain("totalCount");
    expect(helper).toContain("MAX_PROVIDER_POLLS = 20");
    expect(helper).toContain("PROVIDER_POLL_INTERVAL_MILLISECONDS = 60_000");
    expect(helper).toContain("PROVIDER_OBSERVATION_DEADLINE_MILLISECONDS = 20 * 60_000");
    expect(helper).toContain("PROVIDER_API_CALL_TIMEOUT_MILLISECONDS = 60_000");
    expect(helper).toContain("MAX_SLEEP_ATTEMPTS_PER_INTERVAL = 16");
    expect(helper).toContain("timeout: timeoutMilliseconds");
    expect(helper).toContain("state.remainingMilliseconds < 1");
    expect(helper).toContain("after.now <= before.now");
    expect(helper).toContain('deadline.begin("begin provider success confirmation")');
    expect(helper).toContain("deadline.startedAt + nextObservationIndex * pollIntervalMilliseconds");
    expect(helper).toContain("if (poll < maxPolls)");
    expect(helper).toContain("{ allowDeadlineTarget: true }");
    expect(helper).not.toContain('deadline.complete("complete provider success confirmation")');
    expect(helper).not.toContain("Date.now");
    expect(helper).toContain("performance.now()");
    expect(helper).toContain('this.#runRaw(["--include", endpoint]');
    expect(releaseWorkflow).toContain("github-release-publish.ts");
    expect(workflow).not.toContain("gh api --paginate");
    expect(helper).toContain('mode = "already-exact"');
    expect(helper).toContain('mode = "advanced"');
    expect(helper).toContain("35613825");
    expect(helper).toContain("encodeURIComponent(`refs/tags/${tag}`)");
    expect(helper).not.toContain("/commits/tags/");
    expect(helper).not.toContain("head_commit");
    expect(helper).not.toContain("release.target_commitish");
    expect(helper).toContain("41898282");
    expect(helper).toContain("wrench-release-source-v1");
    expect(helper.match(/\/actions\/runs\//gu) ?? []).toHaveLength(1);
    expect(helper).toContain("/actions/runs/${releaseWorkflowRunId}");
    expect(helper).toContain("RELEASE_WORKFLOW_REQUEST_TIMEOUT_MILLISECONDS = 10_000");
    expect(helper).toContain("advanceWebsiteProductionRefFromEnvironment");
    expect(helper).toContain('key.startsWith("WRENCH_RELEASE_APP_")');
    expect(scrubReadOnlyGithubEnvironment({
      GH_TOKEN: "read-token",
      PATH: "/usr/bin:/bin",
      WRENCH_RELEASE_APP_ID: "123",
      WRENCH_RELEASE_APP_PRIVATE_KEY: "private",
      WRENCH_RELEASE_APP_TOKEN: "installation-token",
    })).toEqual({ GH_TOKEN: "read-token", PATH: "/usr/bin:/bin" });
    expect(helper).toContain("/git/ref/heads/website-production");
    expect(helper).not.toContain("/git/refs/heads/website-production");
    expect(helper).not.toContain('async patch(');
    expect(helper).not.toContain("matching-refs");
    expect(helper).not.toContain("api.post");
    expect(helper).not.toContain('["--method", "POST"');
    for (const forbiddenControlEndpoint of ["/rulesets", "/rule-suites"] as const) {
      expect(`${workflow}\n${helper}\n${appHelper}\n${writerHelper}`)
        .not.toContain(forbiddenControlEndpoint);
    }
    expect(workflow).not.toContain("WRENCH_RELEASE_APP_RULESET");
    expect(appHelper).toContain("repository_ids: Object.freeze([GHOSTGET_REPOSITORY_ID])");
    expect(appHelper).toContain('["contents", "metadata", "workflows"]');
    expect(appHelper).toContain('workflows: "write"');
    expect(appHelper).toContain("MAX_RESPONSE_BYTES = 1024 * 1024");
    expect(appHelper).toContain("response.body.getReader()");
    expect(appHelper).not.toContain("response.arrayBuffer()");
    expect(appHelper).not.toContain("administration");
    expect(writerHelper).toContain(
      '`--force-with-lease=${PRODUCTION_REF}:${expectedOld}`',
    );
    expect(writerHelper).toContain("verifiedReleaseFetchArguments");
    expect(writerHelper).toContain('`refs/tags/${tag}`');
    expect(writerHelper).toContain('"FETCH_HEAD^{commit}"');
    expect(writerHelper).toContain('resolved.stdout !== `${verifiedSha}\\n`');
    expect(writerHelper).toContain("does not peel to the verified release SHA");
    expect(writerHelper).toContain('const FIXED_REMOTE = "https://github.com/hraness/ghostget.git"');
    expect(writerHelper).toContain('GIT_ASKPASS_REQUIRE: "force"');
    expect(writerHelper).not.toContain("--force\"");
    expect(codeowners.trim().split("\n")).toEqual([
      "/.github/workflows/** @0thernet",
      "/.github/CODEOWNERS @0thernet",
      "/scripts/release-* @0thernet",
      "/docs/publishing.md @0thernet",
    ]);
    expect(releaseRestRequestBudget).toEqual({
      githubTokenLimit: 1_000,
      headroom: 649,
      immutableRelease: 36,
      maxPolls: 20,
      observationDeadlineMilliseconds: 1_200_000,
      perCallTimeoutMilliseconds: 60_000,
      pollIntervalMilliseconds: 60_000,
      providerBaseline: 2,
      providerOutcome: 209,
      providerPromotion: 21,
      surroundingRelease: 119,
      total: 351,
      websiteAuthority: 83,
    });
    expect(releaseGraphqlRequestBudget).toEqual({
      githubPointLimit: 1_000,
      headroom: 760,
      maxCostPerRequest: 2,
      maxPoints: 240,
      providerBaseline: 10,
      providerOutcome: 110,
      totalRequests: 120,
    });
    expect(releaseRestRequestBudget.total).toBeLessThan(400);
    expect(releaseGraphqlRequestBudget.maxPoints).toBeLessThanOrEqual(250);
  });

  test("mints only one exact Ghostget release-App token and always revokes it", async () => {
    const releaseAppTokenSource = await readFile(releaseAppTokenHelperUrl, "utf8");
    expect(createHash("sha256").update(releaseAppTokenSource).digest("hex")).toBe(
      "3427942305e7284e65f42d70f0f12f4106fc28c1da06b0908ca1eef553605438",
    );
    const revokeWithFetchSource = `async function revokeWithFetch(input) {
  return revokeReleaseAppTokenWithConvergence({
    apiUrl: input.apiUrl,
    expiresAt: input.expiresAt,
    token: input.token,
  });
}`;
    expect(releaseAppTokenSource.match(/^async function revokeWithFetch\(input\) \{$/gmu) ?? [])
      .toHaveLength(1);
    expect(releaseAppTokenSource.match(/return revokeReleaseAppTokenWithConvergence\(/gu) ?? [])
      .toHaveLength(1);
    expect(releaseAppTokenSource).toContain(revokeWithFetchSource);
    const environmentWrapperStart = releaseAppTokenSource.indexOf(
      "export function withReleaseAppTokenFromEnvironment",
    );
    expect(environmentWrapperStart).toBeGreaterThan(0);
    const environmentWrapperSource = releaseAppTokenSource.slice(environmentWrapperStart);
    expect(environmentWrapperSource.trimEnd()).toBe(`export function withReleaseAppTokenFromEnvironment(environment, operation, onRevoked) {
  return withReleaseAppToken({
    environment,
    inspect: inspectWithFetch,
    inspectInstallation: inspectInstallationWithFetch,
    mask(token) {
      process.stdout.write(\`::add-mask::\${token}\\n\`);
    },
    mint: mintWithFetch,
    nowMilliseconds: Date.now,
    onRevoked,
    revoke: revokeWithFetch,
  }, operation);
}`);
    expect(withReleaseAppTokenFromEnvironment.length).toBe(3);
    expect(releaseAppTokenSource.match(/^    revoke: revokeWithFetch,$/gmu) ?? [])
      .toHaveLength(1);
    const revocationImplementationStart = releaseAppTokenSource.indexOf(
      "function revocationIndeterminate",
    );
    const revocationImplementationEnd = releaseAppTokenSource.indexOf(
      "\nasync function revokeWithFetch",
      revocationImplementationStart,
    );
    expect(revocationImplementationStart).toBeGreaterThan(0);
    expect(revocationImplementationEnd).toBeGreaterThan(revocationImplementationStart);
    const revocationImplementationSource = releaseAppTokenSource.slice(
      revocationImplementationStart,
      revocationImplementationEnd,
    );
    expect(createHash("sha256").update(revocationImplementationSource).digest("hex")).toBe(
      "d5bd6d4826c024eeda2c605fedcb5a223138674f2ea1cdfdee6d6534fd45350a",
    );
    expect(revocationImplementationSource.match(/input\.fetchImplementation/gu) ?? [])
      .toHaveLength(3);
    expect(revocationImplementationSource).toContain(
      "const fetchImplementation = input.fetchImplementation ?? fetch;",
    );

    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    });
    const environment = Object.freeze({
      GITHUB_API_URL: "https://api.github.com",
      GITHUB_REPOSITORY: providerRepository,
      GITHUB_REPOSITORY_ID: String(GHOSTGET_REPOSITORY_ID),
      GITHUB_REPOSITORY_OWNER: "hraness",
      WRENCH_RELEASE_APP_CLIENT_ID: "Iv23liGhostgetWriter",
      WRENCH_RELEASE_APP_ID: "123456",
      WRENCH_RELEASE_APP_INSTALLATION_ID: "654321",
      WRENCH_RELEASE_APP_PRIVATE_KEY: privateKey,
      WRENCH_RELEASE_APP_SLUG: "ghostget-prod-ref-writer-1316443113",
    });
    const configuration = parseReleaseAppConfiguration(environment);
    expect(configuration.repositoryId).toBe(1_316_443_113);
    expect(releaseAppTokenRequestBody()).toEqual({
      permissions: { contents: "write", metadata: "read", workflows: "write" },
      repository_ids: [1_316_443_113],
    });

    const jwt = createReleaseAppJwt({
      clientId: configuration.clientId,
      nowMilliseconds: Date.parse("2026-08-30T01:00:00Z"),
      privateKey,
    });
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header ?? "", "base64url").toString("utf8"))).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8"))).toEqual({
      exp: 1_788_052_080,
      iat: 1_788_051_540,
      iss: "Iv23liGhostgetWriter",
    });
    expect(verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`, "ascii"),
      publicKey,
      Buffer.from(signature ?? "", "base64url"),
    )).toBe(true);

    const appIdentity = {
      client_id: configuration.clientId,
      id: configuration.appId,
      owner: { login: "hraness", type: "Organization" },
      permissions: { contents: "write", metadata: "read", workflows: "write" },
      slug: configuration.appSlug,
    };
    const installation = {
      account: { login: "hraness", type: "Organization" },
      app_id: configuration.appId,
      app_slug: configuration.appSlug,
      id: configuration.installationId,
      permissions: { contents: "write", metadata: "read", workflows: "write" },
      repository_selection: "selected",
      target_type: "Organization",
    };
    const token = "ghs_exact-ghostget-release-token";
    const response = {
      expires_at: "2026-08-30T02:00:00Z",
      permissions: { contents: "write", metadata: "read", workflows: "write" },
      repositories: [{
        full_name: providerRepository,
        id: GHOSTGET_REPOSITORY_ID,
        name: "ghostget",
        owner: { login: "hraness" },
      }],
      repository_selection: "selected",
      token,
    };
    const firstTwoDenialsReceipt = Object.freeze({
      converged: true,
      observationCount: 2,
      propagationObserved: false,
      stableDenials: 2,
    });
    expect(() => parseReleaseAppIdentity(appIdentity, configuration)).not.toThrow();
    expect(() => parseReleaseAppInstallation(installation, configuration)).not.toThrow();
    for (const permissions of [
      { contents: "write", metadata: "read" },
      { contents: "write", metadata: "read", workflows: "read" },
      {
        administration: "write",
        contents: "write",
        metadata: "read",
        workflows: "write",
      },
    ] as const) {
      expect(() => parseReleaseAppIdentity(
        { ...appIdentity, permissions },
        configuration,
      )).toThrow();
      expect(() => parseReleaseAppInstallation(
        { ...installation, permissions },
        configuration,
      )).toThrow();
    }
    expect(parseReleaseAppTokenResponse(
      response,
      "Sun, 30 Aug 2026 01:00:00 GMT",
    )).toEqual({
      expiresAt: "2026-08-30T02:00:00Z",
      permissions: { contents: "write", metadata: "read", workflows: "write" },
      repositoryId: GHOSTGET_REPOSITORY_ID,
      token,
    });
    expect(parseReleaseAppTokenResponse({
      ...response,
      has_multiple_single_files: false,
      single_file: null,
      single_file_paths: [],
    }, "Sun, 30 Aug 2026 01:00:00 GMT")).toEqual({
      expiresAt: "2026-08-30T02:00:00Z",
      permissions: { contents: "write", metadata: "read", workflows: "write" },
      repositoryId: GHOSTGET_REPOSITORY_ID,
      token,
    });

    const events: string[] = [];
    const result = await withReleaseAppToken({
      environment,
      async inspect() {
        events.push("inspect");
        return appIdentity;
      },
      async inspectInstallation() {
        events.push("installation");
        return installation;
      },
      mask(value: string) {
        events.push(`mask:${value}`);
      },
      async mint(input: Readonly<{ body: unknown }>) {
        events.push(`mint:${JSON.stringify(input.body)}`);
        return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" };
      },
      nowMilliseconds() {
        return Date.parse("2026-08-30T01:00:00Z");
      },
      async revoke(input: Readonly<{ token: string }>) {
        events.push(`revoke:${input.token}`);
        return firstTwoDenialsReceipt;
      },
    }, async (value: string, receipt: Readonly<{ repositoryId: number }>) => {
      events.push(`operate:${value}`);
      expect(receipt.repositoryId).toBe(GHOSTGET_REPOSITORY_ID);
      return "advanced";
    });
    expect(result).toBe("advanced");
    expect(events).toEqual([
      "inspect",
      "installation",
      `mint:${JSON.stringify(releaseAppTokenRequestBody())}`,
      `mask:${token}`,
      `operate:${token}`,
      `revoke:${token}`,
    ]);

    const repositoryBody = Object.freeze({
      repositories: [{
        full_name: providerRepository,
        id: GHOSTGET_REPOSITORY_ID,
        name: "ghostget",
        owner: { login: "hraness" },
      }],
      repository_selection: "selected",
      total_count: 1,
    });
    type RevocationObservation = Readonly<{
      body?: "binary" | "empty" | "invalid-json" | "json" | "overflow" | "pending" | "text" | "wrong-repo";
      bodyText?: string;
      bodyLatencyMilliseconds?: number;
      contentLength?: string;
      date?: string;
      fetchLatencyMilliseconds?: number;
      location?: string;
      networkFailure?: "abort" | "pending" | true;
      omitDate?: boolean;
      redirected?: boolean;
      requestId?: string;
      status: number;
    }>;
    const observation = (
      status: number,
      overrides: Omit<RevocationObservation, "status"> = {},
    ): RevocationObservation => Object.freeze({ status, ...overrides });
    const stableDenials = [observation(401, { body: "empty" }), observation(401, { body: "json" })];

    function createRevocationHarness(
      observations: readonly RevocationObservation[],
      overrides: Readonly<{
        auditEvents?: string[];
        deleteObservation?: RevocationObservation;
        initialClock?: number;
        nowSamples?: readonly number[];
        sleepMode?: "frozen" | "overflow" | "partial" | "regress" | "reject";
      }> = {},
    ) {
      let clock = overrides.initialClock ?? 0;
      let nowSampleIndex = 0;
      let deleted = false;
      let observationIndex = 0;
      const calls: string[] = [];
      const callTimes: number[] = [];
      let cancelledBodies = 0;
      const sourceChunks: Uint8Array[] = [];
      const sleepCalls: number[] = [];
      const timeouts: number[] = [];
      const encoder = new TextEncoder();
      const defaultDate = "Sun, 30 Aug 2026 01:00:01 GMT";
      const responseFor = async (item: RevocationObservation, signal?: AbortSignal | null): Promise<Response> => {
        if (item.networkFailure === "abort") {
          throw new DOMException(`aborted ${token}`, "AbortError");
        }
        if (item.networkFailure === "pending") {
          await new Promise<never>((_resolve, reject) => {
            const abort = () => reject(new DOMException(`aborted ${token}`, "AbortError"));
            if (signal?.aborted === true) abort();
            else signal?.addEventListener("abort", abort, { once: true });
          });
        }
        if (item.networkFailure === true) {
          throw new Error(`network leaked ${token}`);
        }
        clock += item.fetchLatencyMilliseconds ?? 1;
        let bytes: Uint8Array;
        switch (item.body) {
          case "empty":
            bytes = new Uint8Array();
            break;
          case "text":
            bytes = encoder.encode(item.bodyText ?? "denied");
            break;
          case "binary":
            bytes = new Uint8Array([0xff, 0xfe, 0xfd]);
            break;
          case "invalid-json":
            bytes = encoder.encode("{");
            break;
          case "overflow":
            bytes = encoder.encode("bounded");
            break;
          case "pending":
            bytes = new Uint8Array();
            break;
          case "json":
            bytes = encoder.encode(JSON.stringify({ message: "Bad credentials" }));
            break;
          case "wrong-repo":
            bytes = encoder.encode(JSON.stringify({
              ...repositoryBody,
              repositories: [{
                ...repositoryBody.repositories[0],
                full_name: "hraness/other",
                id: 1,
                name: "other",
              }],
            }));
            break;
          default:
            bytes = item.status === 200
              ? encoder.encode(JSON.stringify(repositoryBody))
              : encoder.encode(JSON.stringify({ message: "Bad credentials" }));
            break;
        }
        const headers: Record<string, string> = {};
        if (item.omitDate !== true) headers.Date = item.date ?? defaultDate;
        if (item.contentLength !== undefined) headers["Content-Length"] = item.contentLength;
        else if (item.body === "overflow") headers["Content-Length"] = String(1024 * 1024 + 1);
        if (item.location !== undefined) headers.Location = item.location;
        if (item.requestId !== undefined) headers["X-GitHub-Request-Id"] = item.requestId;
        const hasForbidden204Body = item.status === 204 && item.body !== undefined && item.body !== "empty";
        const body = item.status === 204 && !hasForbidden204Body ? null : new ReadableStream<Uint8Array>({
          cancel() { cancelledBodies += 1; },
          start(controller) {
            clock += item.bodyLatencyMilliseconds ?? 0;
            if (item.body === "pending") {
              const abort = () => controller.error(new DOMException(`aborted ${token}`, "AbortError"));
              if (signal?.aborted === true) abort();
              else signal?.addEventListener("abort", abort, { once: true });
              return;
            }
            if (bytes.byteLength > 0) {
              sourceChunks.push(bytes);
              controller.enqueue(bytes);
            }
            controller.close();
          },
        });
        const result = new Response(body, {
          headers,
          status: hasForbidden204Body ? 200 : item.status,
        });
        if (overrides.auditEvents !== undefined) {
          const responseHeaders = result.headers;
          Object.defineProperty(result, "headers", {
            value: Object.freeze({
              get(name: string) {
                overrides.auditEvents?.push(`header:${name.toLowerCase()}`);
                return responseHeaders.get(name);
              },
            }),
          });
        }
        if (hasForbidden204Body) Object.defineProperty(result, "status", { value: 204 });
        if (item.redirected === true) {
          Object.defineProperty(result, "redirected", { value: true });
        }
        return result;
      };
      const fetchImplementation = async (request: URL | RequestInfo, init?: RequestInit) => {
        expect(request).toBeInstanceOf(URL);
        expect(Object.keys(init ?? {}).sort()).toEqual([
          "headers",
          "method",
          "redirect",
          "signal",
        ]);
        const url = new URL(String(request));
        const method = init?.method ?? "GET";
        const headers = init?.headers as Readonly<Record<string, string>> | undefined;
        expect(url.origin).toBe("https://api.github.com");
        expect(url.href).toBe(`https://api.github.com${url.pathname}`);
        expect(url.search).toBe("");
        expect(url.hash).toBe("");
        expect(url.username).toBe("");
        expect(url.password).toBe("");
        expect(init?.body).toBeUndefined();
        expect(Object.keys(headers ?? {}).sort()).toEqual([
          "Accept",
          "Authorization",
          "User-Agent",
          "X-GitHub-Api-Version",
        ]);
        expect(headers).toEqual({
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "ghostget-release-writer",
          "X-GitHub-Api-Version": "2022-11-28",
        });
        expect(init?.redirect).toBe("error");
        calls.push(`${method} ${url.pathname}`);
        callTimes.push(clock);
        if (url.pathname === "/installation/token") {
          expect(method).toBe("DELETE");
          expect(deleted).toBe(false);
          deleted = true;
          return responseFor(
            overrides.deleteObservation ?? observation(204, { body: "empty" }),
            init?.signal,
          );
        }
        expect(url.pathname).toBe("/installation/repositories");
        expect(method).toBe("GET");
        expect(deleted).toBe(true);
        const item = observations[observationIndex];
        observationIndex += 1;
        if (item === undefined) throw new Error("revocation fixture exhausted");
        return responseFor(item, init?.signal);
      };
      return Object.freeze({
        advanceClock(milliseconds: number) { clock += milliseconds; },
        calls,
        cancelledBodies() { return cancelledBodies; },
        callTimes,
        createTimeoutSignal(milliseconds: number) {
          timeouts.push(milliseconds);
          return new AbortController().signal;
        },
        fetchImplementation,
        currentClock() { return clock; },
        now() {
          overrides.auditEvents?.push("clock");
          const sample = overrides.nowSamples?.[nowSampleIndex];
          nowSampleIndex += 1;
          if (sample !== undefined) clock = sample;
          return clock;
        },
        observationCount() { return observationIndex; },
        async sleep(milliseconds: number) {
          sleepCalls.push(milliseconds);
          if (overrides.sleepMode === "reject") throw new Error(`sleep leaked ${token}`);
          if (overrides.sleepMode === "frozen") return;
          if (overrides.sleepMode === "regress") {
            clock -= 1;
            return;
          }
          if (overrides.sleepMode === "overflow") {
            clock = Number.MAX_SAFE_INTEGER + 1;
            return;
          }
          clock += overrides.sleepMode === "partial"
            ? Math.max(1, Math.floor(milliseconds / 2))
            : milliseconds;
        },
        sourceChunks,
        sleepCalls,
        timeouts,
      });
    }

    async function runRevocationCase(
      observations: readonly RevocationObservation[],
      overrides: Parameters<typeof createRevocationHarness>[1] = {},
    ) {
      const harness = createRevocationHarness(observations, overrides);
      const receipt = await revokeReleaseAppTokenWithConvergence({
        apiUrl: new URL("https://api.github.com/"),
        createTimeoutSignal: harness.createTimeoutSignal,
        expiresAt: response.expires_at,
        fetchImplementation: harness.fetchImplementation,
        now: harness.now,
        sleep: harness.sleep,
        token,
      });
      return Object.freeze({ harness, receipt });
    }

    const environmentWrapperHarness = createRevocationHarness(stableDenials);
    const environmentWrapperEvents: string[] = [];
    const environmentWrapperFetch = async (request: URL | RequestInfo, init?: RequestInit) => {
      expect(request).toBeInstanceOf(URL);
      const url = new URL(String(request));
      const method = init?.method ?? "GET";
      environmentWrapperEvents.push(`${method} ${url.pathname}`);
      if (
        url.pathname === "/installation/token" ||
        url.pathname === "/installation/repositories"
      ) {
        return environmentWrapperHarness.fetchImplementation(request, init);
      }
      expect(url.origin).toBe("https://api.github.com");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      expect(url.username).toBe("");
      expect(url.password).toBe("");
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal?.aborted).toBe(false);
      const headers = init?.headers as Readonly<Record<string, string>> | undefined;
      expect(headers?.Accept).toBe("application/vnd.github+json");
      expect(headers?.Authorization).toBe(`Bearer ${jwt}`);
      expect(headers?.["User-Agent"]).toBe("ghostget-release-writer");
      expect(headers?.["X-GitHub-Api-Version"]).toBe("2022-11-28");
      const jsonResponse = (body: unknown, status: number, date?: string) => new Response(
        JSON.stringify(body),
        { headers: date === undefined ? undefined : { Date: date }, status },
      );
      if (url.pathname === "/app") {
        expect(method).toBe("GET");
        expect(Object.keys(init ?? {}).sort()).toEqual([
          "headers",
          "method",
          "redirect",
          "signal",
        ]);
        expect(Object.keys(headers ?? {}).sort()).toEqual([
          "Accept",
          "Authorization",
          "User-Agent",
          "X-GitHub-Api-Version",
        ]);
        return jsonResponse(appIdentity, 200);
      }
      if (url.pathname === `/app/installations/${String(configuration.installationId)}`) {
        expect(method).toBe("GET");
        expect(Object.keys(init ?? {}).sort()).toEqual([
          "headers",
          "method",
          "redirect",
          "signal",
        ]);
        expect(Object.keys(headers ?? {}).sort()).toEqual([
          "Accept",
          "Authorization",
          "User-Agent",
          "X-GitHub-Api-Version",
        ]);
        return jsonResponse(installation, 200);
      }
      expect(url.pathname).toBe(
        `/app/installations/${String(configuration.installationId)}/access_tokens`,
      );
      expect(method).toBe("POST");
      expect(Object.keys(init ?? {}).sort()).toEqual([
        "body",
        "headers",
        "method",
        "redirect",
        "signal",
      ]);
      expect(Object.keys(headers ?? {}).sort()).toEqual([
        "Accept",
        "Authorization",
        "Content-Type",
        "User-Agent",
        "X-GitHub-Api-Version",
      ]);
      expect(headers?.["Content-Type"]).toBe("application/json");
      expect(init?.body).toBe(JSON.stringify(releaseAppTokenRequestBody()));
      return jsonResponse(response, 201, "Sun, 30 Aug 2026 01:00:00 GMT");
    };
    const originalFetch = globalThis.fetch;
    const originalDateNow = Date.now;
    const originalStdoutWrite = process.stdout.write;
    let environmentWrapperResult: string | undefined;
    try {
      globalThis.fetch = environmentWrapperFetch as typeof fetch;
      Date.now = () => Date.parse("2026-08-30T01:00:00Z");
      process.stdout.write = ((chunk: string | Uint8Array) => {
        expect(String(chunk)).toBe(`::add-mask::${token}\n`);
        environmentWrapperEvents.push(`mask:${token}`);
        return true;
      }) as typeof process.stdout.write;
      environmentWrapperResult = await withReleaseAppTokenFromEnvironment(
        environment,
        async (value, receipt) => {
          environmentWrapperEvents.push(`operation:${value}`);
          expect(receipt).toEqual({
            appId: configuration.appId,
            appSlug: configuration.appSlug,
            clientId: configuration.clientId,
            expiresAt: response.expires_at,
            installationId: configuration.installationId,
            repositoryId: GHOSTGET_REPOSITORY_ID,
          });
          return "environment-wrapper-advanced";
        },
        async (receipt) => {
          environmentWrapperEvents.push(`revoked:${JSON.stringify(receipt)}`);
        },
      );
    } finally {
      process.stdout.write = originalStdoutWrite;
      Date.now = originalDateNow;
      globalThis.fetch = originalFetch;
    }
    environmentWrapperEvents.push(`return:${environmentWrapperResult}`);
    expect(environmentWrapperEvents).toEqual([
      "GET /app",
      `GET /app/installations/${String(configuration.installationId)}`,
      `POST /app/installations/${String(configuration.installationId)}/access_tokens`,
      `mask:${token}`,
      `operation:${token}`,
      "DELETE /installation/token",
      "GET /installation/repositories",
      "GET /installation/repositories",
      `revoked:${JSON.stringify(firstTwoDenialsReceipt)}`,
      "return:environment-wrapper-advanced",
    ]);
    expect(environmentWrapperHarness.calls).toEqual([
      "DELETE /installation/token",
      "GET /installation/repositories",
      "GET /installation/repositories",
    ]);
    expect(environmentWrapperHarness.timeouts).toEqual([]);

    expect(RELEASE_APP_REVOCATION_OBSERVATION_OFFSETS_MILLISECONDS).toEqual([
      0,
      250,
      500,
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      24_000,
      29_000,
    ]);
    for (const bodies of [
      ["empty", "text"],
      ["json", "binary"],
    ] as const) {
      const direct = await runRevocationCase([
        observation(401, { body: bodies[0] }),
        observation(401, { body: bodies[1] }),
      ]);
      expect(direct.receipt).toEqual({
        converged: true,
        observationCount: 2,
        propagationObserved: false,
        stableDenials: 2,
      });
      expect(direct.harness.calls).toEqual([
        "DELETE /installation/token",
        "GET /installation/repositories",
        "GET /installation/repositories",
      ]);
      expect(direct.harness.sourceChunks.every((chunk) =>
        chunk.every((value) => value === 0))).toBe(true);
    }
    const canonicalEmptyDelete = await runRevocationCase(stableDenials, {
      deleteObservation: observation(204, { body: "empty", contentLength: "0" }),
    });
    expect(canonicalEmptyDelete.receipt).toEqual(firstTwoDenialsReceipt);
    expect(canonicalEmptyDelete.harness.calls).toEqual([
      "DELETE /installation/token",
      "GET /installation/repositories",
      "GET /installation/repositories",
    ]);

    const propagated = await runRevocationCase([
      observation(200),
      observation(401, { body: "text" }),
      observation(401, { body: "empty" }),
    ], { sleepMode: "partial" });
    expect(propagated.receipt).toEqual({
      converged: true,
      observationCount: 3,
      propagationObserved: true,
      stableDenials: 2,
    });

    const observedHarness = createRevocationHarness(stableDenials);
    const observedEvents: string[] = [];
    const observedResult = await withReleaseAppToken({
      environment,
      async inspect() { observedEvents.push("inspect"); return appIdentity; },
      async inspectInstallation() { observedEvents.push("installation"); return installation; },
      mask() { observedEvents.push("mask"); },
      async mint() {
        observedEvents.push("mint");
        return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" };
      },
      nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
      async onRevoked(receipt: Readonly<Record<string, unknown>>) {
        observedEvents.push(`observed:${JSON.stringify(receipt)}`);
      },
      async revoke(input: Readonly<{ apiUrl: URL; expiresAt: string; token: string }>) {
        observedEvents.push("revoke:start");
        const receipt = await revokeReleaseAppTokenWithConvergence({
          ...input,
          createTimeoutSignal: observedHarness.createTimeoutSignal,
          fetchImplementation: observedHarness.fetchImplementation,
          now: observedHarness.now,
          sleep: observedHarness.sleep,
        });
        observedEvents.push("revoke:converged");
        return receipt;
      },
    }, async () => {
      observedEvents.push("operate");
      return "advanced";
    });
    expect(observedResult).toBe("advanced");
    expect(observedEvents).toEqual([
      "inspect",
      "installation",
      "mint",
      "mask",
      "operate",
      "revoke:start",
      "revoke:converged",
      'observed:{"converged":true,"observationCount":2,"propagationObserved":false,"stableDenials":2}',
    ]);

    const observerFailure = withReleaseAppToken({
      environment,
      async inspect() { return appIdentity; },
      async inspectInstallation() { return installation; },
      mask() {},
      async mint() { return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" }; },
      nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
      async onRevoked() { throw new Error("simulated sanitized observer failure"); },
      async revoke() {
        return {
          converged: true,
          observationCount: 2,
          propagationObserved: false,
          stableDenials: 2,
        };
      },
    }, async () => {
      throw new Error("simulated operation failure before observer");
    });
    try {
      await observerFailure;
      throw new Error("operation and observer unexpectedly succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors.map((item) => String(item))).toEqual([
        "Error: simulated operation failure before observer",
        "Error: simulated sanitized observer failure",
      ]);
    }

    for (const invalidReceipt of [
      undefined,
      { ...firstTwoDenialsReceipt, observationCount: 3 },
      { ...firstTwoDenialsReceipt, observationCount: 2, propagationObserved: true },
      { ...firstTwoDenialsReceipt, observationCount: 11, propagationObserved: true },
      { ...firstTwoDenialsReceipt, stableDenials: 1 },
      { ...firstTwoDenialsReceipt, extra: true },
    ] as const) {
      let invalidObserverCalls = 0;
      await expect(withReleaseAppToken({
        environment,
        async inspect() { return appIdentity; },
        async inspectInstallation() { return installation; },
        mask() {},
        async mint() { return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" }; },
        nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
        async onRevoked() { invalidObserverCalls += 1; },
        async revoke() { return invalidReceipt; },
      }, async () => "advanced")).rejects.toThrow("revocation receipt");
      expect(invalidObserverCalls).toBe(0);
    }
    await expect(withReleaseAppToken({
      environment,
      async inspect() { return appIdentity; },
      async inspectInstallation() { return installation; },
      mask() {},
      async mint() {
        return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" };
      },
      nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
      async revoke() { return undefined; },
    }, async () => "advanced")).rejects.toThrow("revocation receipt");

    const deferredEvents: string[] = [];
    let settleRevocation: ((value: typeof firstTwoDenialsReceipt) => void) | undefined;
    const deferredRevocation = new Promise<typeof firstTwoDenialsReceipt>((resolve) => {
      settleRevocation = resolve;
    });
    const deferredProductionFlow = (async () => {
      await withReleaseAppToken({
        environment,
        async inspect() { return appIdentity; },
        async inspectInstallation() { return installation; },
        mask() {},
        async mint() { return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" }; },
        nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
        async onRevoked() { deferredEvents.push("revocation-receipt"); },
        async revoke() {
          deferredEvents.push("revocation-pending");
          return deferredRevocation;
        },
      }, async () => {
        deferredEvents.push("leased-write");
      });
      deferredEvents.push("post-ref-read");
    })();
    for (let attempt = 0; attempt < 16 && deferredEvents.length < 2; attempt += 1) {
      await Promise.resolve();
    }
    expect(deferredEvents).toEqual(["leased-write", "revocation-pending"]);
    settleRevocation?.(firstTwoDenialsReceipt);
    await deferredProductionFlow;
    expect(deferredEvents).toEqual([
      "leased-write",
      "revocation-pending",
      "revocation-receipt",
      "post-ref-read",
    ]);

    const deferredFailureEvents: string[] = [];
    let rejectDeferredRevocation: ((reason: Error) => void) | undefined;
    const deferredRevocationFailure = new Promise<typeof firstTwoDenialsReceipt>(
      (_resolve, reject) => { rejectDeferredRevocation = reject; },
    );
    const deferredFailureFlow = (async () => {
      await withReleaseAppToken({
        environment,
        async inspect() { return appIdentity; },
        async inspectInstallation() { return installation; },
        mask() {},
        async mint() {
          return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" };
        },
        nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
        async onRevoked() { deferredFailureEvents.push("revocation-receipt"); },
        async revoke() {
          deferredFailureEvents.push("revocation-pending");
          return deferredRevocationFailure;
        },
      }, async () => { deferredFailureEvents.push("leased-write"); });
      deferredFailureEvents.push("post-ref-read");
    })();
    for (let attempt = 0; attempt < 16 && deferredFailureEvents.length < 2; attempt += 1) {
      await Promise.resolve();
    }
    expect(deferredFailureEvents).toEqual(["leased-write", "revocation-pending"]);
    rejectDeferredRevocation?.(new Error("simulated deferred convergence failure"));
    await expect(deferredFailureFlow).rejects.toThrow("simulated deferred convergence failure");
    expect(deferredFailureEvents).toEqual(["leased-write", "revocation-pending"]);

    const failedDeferredEvents: string[] = [];
    await expect((async () => {
      await withReleaseAppToken({
        environment,
        async inspect() { return appIdentity; },
        async inspectInstallation() { return installation; },
        mask() {},
        async mint() { return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" }; },
        nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
        async revoke() { throw new Error("simulated convergence failure"); },
      }, async () => { failedDeferredEvents.push("leased-write"); });
      failedDeferredEvents.push("post-ref-read");
    })()).rejects.toThrow("simulated convergence failure");
    expect(failedDeferredEvents).toEqual(["leased-write"]);

    const persistentHarness = createRevocationHarness(
      Array.from({ length: 10 }, () => observation(200)),
    );
    await expect(revokeReleaseAppTokenWithConvergence({
      apiUrl: new URL("https://api.github.com/"),
      createTimeoutSignal: persistentHarness.createTimeoutSignal,
      expiresAt: response.expires_at,
      fetchImplementation: persistentHarness.fetchImplementation,
      now: persistentHarness.now,
      sleep: persistentHarness.sleep,
      token,
    })).rejects.toThrow("did not converge within the bounded operational window");
    expect(persistentHarness.observationCount()).toBe(10);
    expect(persistentHarness.calls).toEqual([
      "DELETE /installation/token",
      ...Array.from({ length: 10 }, () => "GET /installation/repositories"),
    ]);
    expect(3 + persistentHarness.calls.length).toBe(14);
    expect(persistentHarness.timeouts.slice(1)).toEqual([
      10_000,
      10_000,
      10_000,
      10_000,
      10_000,
      10_000,
      10_000,
      10_000,
      6_000,
      1_000,
    ]);

    for (const authoritativeBegin of [250, 251] as const) {
      const closedBoundary = createRevocationHarness(stableDenials, {
        nowSamples: [0, 1, 2, authoritativeBegin, 30_002],
      });
      await expect(revokeReleaseAppTokenWithConvergence({
        apiUrl: new URL("https://api.github.com/"),
        createTimeoutSignal: closedBoundary.createTimeoutSignal,
        expiresAt: response.expires_at,
        fetchImplementation: closedBoundary.fetchImplementation,
        now: closedBoundary.now,
        sleep: closedBoundary.sleep,
        token,
      })).rejects.toThrow("did not converge within the bounded operational window");
      expect(closedBoundary.calls).toEqual(["DELETE /installation/token"]);
      expect(closedBoundary.observationCount()).toBe(0);
      expect(closedBoundary.sleepCalls).toEqual([]);
      expect(closedBoundary.timeouts).toEqual([10_000]);
    }

    for (const authoritativeBegin of [30_000, 30_001] as const) {
      const finalSlotBoundary = createRevocationHarness(stableDenials, {
        nowSamples: [
          0,
          250,
          500,
          1_000,
          2_000,
          4_000,
          8_000,
          16_000,
          24_000,
          29_000,
          29_000,
          29_000,
          authoritativeBegin,
        ],
      });
      await expect(revokeReleaseAppTokenWithConvergence({
        apiUrl: new URL("https://api.github.com/"),
        createTimeoutSignal: finalSlotBoundary.createTimeoutSignal,
        expiresAt: response.expires_at,
        fetchImplementation: finalSlotBoundary.fetchImplementation,
        now: finalSlotBoundary.now,
        sleep: finalSlotBoundary.sleep,
        token,
      })).rejects.toThrow("did not converge within the bounded operational window");
      expect(finalSlotBoundary.calls).toEqual(["DELETE /installation/token"]);
      expect(finalSlotBoundary.observationCount()).toBe(0);
      expect(finalSlotBoundary.sleepCalls).toEqual([]);
      expect(finalSlotBoundary.timeouts).toEqual([10_000]);
    }

    for (const authoritativeBegin of [30_000, 30_001] as const) {
      const finalSlotAfterObservations = createRevocationHarness(
        Array.from({ length: 9 }, () => observation(200)),
        {
          deleteObservation: observation(204, {
            body: "empty",
            fetchLatencyMilliseconds: 0,
          }),
        },
      );
      let finalSlotClockReads = 0;
      const finalSlotNow = () => {
        if (
          finalSlotAfterObservations.observationCount() === 9 &&
          finalSlotAfterObservations.currentClock() === 29_000
        ) {
          finalSlotClockReads += 1;
          if (finalSlotClockReads === 2) {
            finalSlotAfterObservations.advanceClock(authoritativeBegin - 29_000);
          }
        }
        return finalSlotAfterObservations.currentClock();
      };
      await expect(revokeReleaseAppTokenWithConvergence({
        apiUrl: new URL("https://api.github.com/"),
        createTimeoutSignal: finalSlotAfterObservations.createTimeoutSignal,
        expiresAt: response.expires_at,
        fetchImplementation: finalSlotAfterObservations.fetchImplementation,
        now: finalSlotNow,
        sleep: finalSlotAfterObservations.sleep,
        token,
      })).rejects.toThrow("did not converge within the bounded operational window");
      expect(finalSlotAfterObservations.calls).toEqual([
        "DELETE /installation/token",
        ...Array.from({ length: 9 }, () => "GET /installation/repositories"),
      ]);
      expect(finalSlotAfterObservations.observationCount()).toBe(9);
      expect(finalSlotAfterObservations.sleepCalls).toEqual([
        249,
        249,
        499,
        999,
        1_999,
        3_999,
        7_999,
        7_999,
        4_999,
      ]);
      expect(finalSlotAfterObservations.timeouts).toEqual([
        ...Array.from({ length: 9 }, () => 10_000),
        6_000,
      ]);
    }

    const boundaryTimeoutHarness = createRevocationHarness(
      Array.from({ length: 10 }, () => observation(200)),
    );
    let finalSlotSamples = 0;
    const boundaryTimeoutNow = () => {
      if (
        boundaryTimeoutHarness.observationCount() === 9 &&
        boundaryTimeoutHarness.currentClock() === 29_001
      ) {
        finalSlotSamples += 1;
        if (finalSlotSamples === 2) boundaryTimeoutHarness.advanceClock(500);
      }
      return boundaryTimeoutHarness.currentClock();
    };
    await expect(revokeReleaseAppTokenWithConvergence({
      apiUrl: new URL("https://api.github.com/"),
      createTimeoutSignal: boundaryTimeoutHarness.createTimeoutSignal,
      expiresAt: response.expires_at,
      fetchImplementation: boundaryTimeoutHarness.fetchImplementation,
      now: boundaryTimeoutNow,
      sleep: boundaryTimeoutHarness.sleep,
      token,
    })).rejects.toThrow("did not converge within the bounded operational window");
    expect(boundaryTimeoutHarness.observationCount()).toBe(10);
    expect(boundaryTimeoutHarness.callTimes.at(-1)).toBe(29_501);
    expect(boundaryTimeoutHarness.timeouts.at(-1)).toBe(500);
    expect(
      (boundaryTimeoutHarness.callTimes.at(-1) ?? 0) +
      (boundaryTimeoutHarness.timeouts.at(-1) ?? 0),
    ).toBe(30_001);

    const loneDenial = [
      ...Array.from({ length: 9 }, () => observation(200)),
      observation(401, { body: "empty" }),
    ];
    await expect(runRevocationCase(loneDenial)).rejects.toThrow("only one denial");
    await expect(runRevocationCase([
      observation(401, { body: "empty" }),
      observation(200),
    ])).rejects.toThrow("authorization returned after a denial");

    const observationFailureCases: readonly Readonly<{
      message: string;
      observations: readonly RevocationObservation[];
      overrides?: Parameters<typeof createRevocationHarness>[1];
      sensitive?: readonly string[];
    }>[] = [
      {
        message: "unexpected authorization state",
        observations: [observation(403, {
          body: "text",
          bodyText: "observation-403-body-secret",
          requestId: "observation-403-request-secret",
        })],
        sensitive: ["403", "observation-403-body-secret", "observation-403-request-secret"],
      },
      {
        message: "unexpected authorization state",
        observations: [observation(404, {
          body: "text",
          bodyText: "observation-404-body-secret",
          requestId: "observation-404-request-secret",
        })],
        sensitive: ["404", "observation-404-body-secret", "observation-404-request-secret"],
      },
      {
        message: "unexpected authorization state",
        observations: [observation(429, {
          body: "text",
          bodyText: "observation-429-body-secret",
          requestId: "observation-429-request-secret",
        })],
        sensitive: ["429", "observation-429-body-secret", "observation-429-request-secret"],
      },
      {
        message: "unexpected authorization state",
        observations: [observation(500, {
          body: "text",
          bodyText: "observation-500-body-secret",
          requestId: "observation-500-request-secret",
        })],
        sensitive: ["500", "observation-500-body-secret", "observation-500-request-secret"],
      },
      {
        message: "authorized revocation observation is malformed",
        observations: [observation(200, { body: "wrong-repo" })],
      },
      {
        message: "authorized revocation observation is malformed",
        observations: [observation(200, { body: "binary" })],
      },
      {
        message: "authorized revocation observation is malformed",
        observations: [observation(200, { body: "overflow" })],
      },
      {
        message: "redirected",
        observations: [observation(200, {
          body: "text",
          bodyText: "observation-200-location-body-secret",
          location: "https://observation-location-secret.invalid/",
          requestId: "observation-200-location-request-secret",
        })],
        sensitive: [
          "observation-200-location-body-secret",
          "observation-200-location-request-secret",
          "https://observation-location-secret.invalid/",
        ],
      },
      {
        message: "redirected",
        observations: [observation(401, {
          body: "json",
          redirected: true,
          requestId: "observation-401-redirect-request-secret",
        })],
        sensitive: ["Bad credentials", "observation-401-redirect-request-secret"],
      },
      {
        message: "redirected",
        observations: [observation(401, {
          body: "text",
          bodyText: "observation-401-location-body-secret",
          location: "https://observation-401-location-secret.invalid/",
          requestId: "observation-401-location-request-secret",
        })],
        sensitive: [
          "observation-401-location-body-secret",
          "observation-401-location-request-secret",
          "https://observation-401-location-secret.invalid/",
        ],
      },
      {
        message: "transport failed",
        observations: [observation(401, { networkFailure: true })],
      },
      {
        message: "transport failed",
        observations: [observation(401, { networkFailure: "abort" })],
      },
      {
        message: "authorized revocation observation is malformed",
        observations: [observation(200, { body: "invalid-json" })],
      },
      {
        message: "denied revocation observation is malformed",
        observations: [observation(401, { body: "overflow" })],
      },
      {
        message: "sleep failed",
        observations: [observation(200), ...stableDenials],
        overrides: { sleepMode: "reject" },
      },
      {
        message: "did not advance the clock",
        observations: [observation(200), ...stableDenials],
        overrides: { sleepMode: "frozen" },
      },
      {
        message: "clock regressed",
        observations: [observation(200), ...stableDenials],
        overrides: { sleepMode: "regress" },
      },
      {
        message: "clock is invalid",
        observations: [observation(200), ...stableDenials],
        overrides: { sleepMode: "overflow" },
      },
      {
        message: "clock regressed",
        observations: [
          observation(401, { fetchLatencyMilliseconds: -1 }),
          observation(401),
        ],
      },
    ];
    for (const failureCase of observationFailureCases) {
      const failureHarness = createRevocationHarness(
        failureCase.observations,
        failureCase.overrides,
      );
      let caught: unknown;
      try {
        await revokeReleaseAppTokenWithConvergence({
          apiUrl: new URL("https://api.github.com/"),
          createTimeoutSignal: failureHarness.createTimeoutSignal,
          expiresAt: response.expires_at,
          fetchImplementation: failureHarness.fetchImplementation,
          now: failureHarness.now,
          sleep: failureHarness.sleep,
          token,
        });
      } catch (error) {
        caught = error;
      }
      expect(String(caught)).toContain(failureCase.message);
      for (const sensitive of [
        token,
        "Bad credentials",
        "/installation/repositories",
        "/installation/token",
        ...(failureCase.sensitive ?? []),
      ]) {
        expect(String(caught)).not.toContain(sensitive);
      }
      if (failureCase.observations.some((item) => item.body === "overflow")) {
        expect(failureHarness.cancelledBodies()).toBe(1);
      } else {
        expect(failureHarness.sourceChunks.every((chunk) =>
          chunk.every((value) => value === 0))).toBe(true);
      }
    }

    for (const invalidDateObservation of [
      observation(200, {
        date: "invalid-authorized-date-secret",
        requestId: "authorized-date-request-secret",
      }),
      observation(200, { omitDate: true }),
      observation(401, {
        body: "text",
        bodyText: "denied-date-body-secret",
        date: "invalid-denied-date-secret",
        requestId: "denied-date-request-secret",
      }),
      observation(401, { body: "text", omitDate: true }),
    ] as const) {
      const invalidDateHarness = createRevocationHarness([invalidDateObservation]);
      let caught: unknown;
      try {
        await revokeReleaseAppTokenWithConvergence({
          apiUrl: new URL("https://api.github.com/"),
          createTimeoutSignal: invalidDateHarness.createTimeoutSignal,
          expiresAt: response.expires_at,
          fetchImplementation: invalidDateHarness.fetchImplementation,
          now: invalidDateHarness.now,
          sleep: invalidDateHarness.sleep,
          token,
        });
      } catch (error) {
        caught = error;
      }
      expect(String(caught)).toContain(
        invalidDateObservation.status === 200
          ? "authorized revocation observation is malformed"
          : "denied revocation observation is malformed",
      );
      for (const sensitive of [
        token,
        invalidDateObservation.date ?? "",
        String(invalidDateObservation.requestId),
        invalidDateObservation.bodyText ?? "",
        "/installation/repositories",
      ].filter((value) => value.length > 0)) {
        expect(String(caught)).not.toContain(sensitive);
      }
      expect(invalidDateHarness.sourceChunks.length).toBeGreaterThan(0);
      expect(invalidDateHarness.sourceChunks.every((chunk) =>
        chunk.every((value) => value === 0))).toBe(true);
    }

    const rejectedDeleteCases: readonly Readonly<{
      observation: RevocationObservation;
      sensitive?: readonly string[];
    }>[] = [
      {
        observation: observation(403, {
          body: "text",
          bodyText: "delete-403-body-secret",
          requestId: "delete-403-request-secret",
        }),
        sensitive: ["403", "delete-403-body-secret", "delete-403-request-secret"],
      },
      {
        observation: observation(401, {
          body: "json",
          requestId: "delete-401-request-secret",
        }),
        sensitive: ["401", "Bad credentials", "delete-401-request-secret"],
      },
      {
        observation: observation(204, {
          body: "text",
          bodyText: "delete-redirect-body-secret",
          contentLength: "27",
          location: "https://delete-location-secret.invalid/",
          requestId: "delete-redirect-request-secret",
        }),
        sensitive: [
          "delete-redirect-body-secret",
          "delete-redirect-request-secret",
          "https://delete-location-secret.invalid/",
        ],
      },
      {
        observation: observation(204, {
          body: "text",
          bodyText: "delete-nonempty-body-secret",
          contentLength: "27",
        }),
        sensitive: ["delete-nonempty-body-secret"],
      },
      {
        observation: observation(204, { body: "empty", contentLength: "1" }),
      },
      {
        observation: observation(204, { body: "empty", contentLength: "00" }),
      },
      { observation: observation(204, { body: "overflow" }) },
      { observation: observation(204, { body: "empty", networkFailure: true }) },
    ];
    for (const rejectedDeleteCase of rejectedDeleteCases) {
      const deleteObservation = rejectedDeleteCase.observation;
      const rejectedDelete = createRevocationHarness(stableDenials, { deleteObservation });
      let caught: unknown;
      try {
        await revokeReleaseAppTokenWithConvergence({
          apiUrl: new URL("https://api.github.com/"),
          createTimeoutSignal: rejectedDelete.createTimeoutSignal,
          expiresAt: response.expires_at,
          fetchImplementation: rejectedDelete.fetchImplementation,
          now: rejectedDelete.now,
          sleep: rejectedDelete.sleep,
          token,
        });
      } catch (error) {
        caught = error;
      }
      expect(String(caught)).toContain("indeterminate");
      for (const sensitive of [
        token,
        "Bad credentials",
        "/installation/repositories",
        "/installation/token",
        ...(rejectedDeleteCase.sensitive ?? []),
      ]) {
        expect(String(caught)).not.toContain(sensitive);
      }
      expect(rejectedDelete.calls).toEqual(["DELETE /installation/token"]);
      if (deleteObservation.body !== "overflow") {
        expect(rejectedDelete.sourceChunks.every((chunk) =>
          chunk.every((value) => value === 0))).toBe(true);
      } else {
        expect(rejectedDelete.cancelledBodies()).toBe(1);
      }
    }

    for (const deleteObservation of [
      observation(204, { body: "empty", networkFailure: "pending" }),
      observation(204, { body: "pending" }),
    ] as const) {
      const pendingHarness = createRevocationHarness(stableDenials, { deleteObservation });
      let caught: unknown;
      try {
        await revokeReleaseAppTokenWithConvergence({
          apiUrl: new URL("https://api.github.com/"),
          createTimeoutSignal: () => AbortSignal.timeout(1),
          expiresAt: response.expires_at,
          fetchImplementation: pendingHarness.fetchImplementation,
          now: pendingHarness.now,
          sleep: pendingHarness.sleep,
          token,
        });
      } catch (error) {
        caught = error;
      }
      expect(String(caught)).toContain("indeterminate");
      expect(String(caught)).not.toContain(token);
      expect(pendingHarness.calls).toEqual(["DELETE /installation/token"]);
    }
    for (const observations of [
      [observation(401, { networkFailure: "pending" })],
      [observation(401, { body: "pending" })],
    ] as const) {
      const pendingHarness = createRevocationHarness(observations, {
        deleteObservation: observation(204, { body: "empty" }),
      });
      let caught: unknown;
      try {
        await revokeReleaseAppTokenWithConvergence({
          apiUrl: new URL("https://api.github.com/"),
          createTimeoutSignal: () => AbortSignal.timeout(1),
          expiresAt: response.expires_at,
          fetchImplementation: pendingHarness.fetchImplementation,
          now: pendingHarness.now,
          sleep: pendingHarness.sleep,
          token,
        });
      } catch (error) {
        caught = error;
      }
      expect(String(caught)).toContain("indeterminate");
      expect(String(caught)).not.toContain(token);
      expect(pendingHarness.calls).toEqual([
        "DELETE /installation/token",
        "GET /installation/repositories",
      ]);
    }

    const missedSlots = await runRevocationCase([
      observation(200, { fetchLatencyMilliseconds: 9_000 }),
      observation(401, { body: "empty" }),
      observation(401, { body: "text" }),
    ]);
    expect(missedSlots.receipt.observationCount).toBe(3);
    expect(missedSlots.harness.callTimes.slice(1)).toEqual([1, 16_001, 24_001]);

    for (const invalidClock of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      Number.MAX_SAFE_INTEGER + 1,
    ] as const) {
      const clockHarness = createRevocationHarness(stableDenials, {
        nowSamples: [invalidClock],
      });
      await expect(revokeReleaseAppTokenWithConvergence({
        apiUrl: new URL("https://api.github.com/"),
        createTimeoutSignal: clockHarness.createTimeoutSignal,
        expiresAt: response.expires_at,
        fetchImplementation: clockHarness.fetchImplementation,
        now: clockHarness.now,
        sleep: clockHarness.sleep,
        token,
      })).rejects.toThrow("clock is invalid");
      expect(clockHarness.calls).toEqual(["DELETE /installation/token"]);
    }
    const throwingClock = createRevocationHarness(stableDenials);
    await expect(revokeReleaseAppTokenWithConvergence({
      apiUrl: new URL("https://api.github.com/"),
      createTimeoutSignal: throwingClock.createTimeoutSignal,
      expiresAt: response.expires_at,
      fetchImplementation: throwingClock.fetchImplementation,
      now() { throw new Error(`clock leaked ${token}`); },
      sleep: throwingClock.sleep,
      token,
    })).rejects.toThrow("clock read failed");
    expect(throwingClock.calls).toEqual(["DELETE /installation/token"]);

    const deletionCompletionEvents: string[] = [];
    const deletionCompletionHarness = createRevocationHarness(stableDenials, {
      auditEvents: deletionCompletionEvents,
      deleteObservation: observation(204, { body: "empty", date: "malformed" }),
      nowSamples: [0],
    });
    await expect(revokeReleaseAppTokenWithConvergence({
      apiUrl: new URL("https://api.github.com/"),
      createTimeoutSignal: deletionCompletionHarness.createTimeoutSignal,
      expiresAt: response.expires_at,
      fetchImplementation: deletionCompletionHarness.fetchImplementation,
      now: deletionCompletionHarness.now,
      sleep: deletionCompletionHarness.sleep,
      token,
    })).rejects.toThrow("revocation authority time proof is malformed");
    expect(deletionCompletionHarness.calls).toEqual(["DELETE /installation/token"]);
    expect(deletionCompletionEvents).toEqual([
      "header:location",
      "header:content-length",
      "header:content-length",
      "clock",
      "header:date",
    ]);

    const boundary = await runRevocationCase([
      ...Array.from({ length: 8 }, () => observation(200)),
      observation(401, { body: "text" }),
      observation(401, { body: "empty", bodyLatencyMilliseconds: 1_000, fetchLatencyMilliseconds: 0 }),
    ]);
    expect(boundary.receipt).toEqual({
      converged: true,
      observationCount: 10,
      propagationObserved: true,
      stableDenials: 2,
    });
    await expect(runRevocationCase([
      ...Array.from({ length: 8 }, () => observation(200)),
      observation(401),
      observation(401, { bodyLatencyMilliseconds: 1_001, fetchLatencyMilliseconds: 0 }),
    ])).rejects.toThrow("completed outside its deadline");
    await expect(runRevocationCase([
      observation(401, { date: "Sun, 30 Aug 2026 02:00:00 GMT" }),
      observation(401),
    ])).rejects.toThrow("denied revocation observation is malformed");

    const oneSecondBeforeExpiry = "Sun, 30 Aug 2026 01:59:59 GMT";
    const acceptedDeleteDate = await runRevocationCase(stableDenials, {
      deleteObservation: observation(204, {
        body: "empty",
        date: oneSecondBeforeExpiry,
      }),
    });
    expect(acceptedDeleteDate.receipt).toEqual(firstTwoDenialsReceipt);
    const acceptedAuthorizedDate = await runRevocationCase([
      observation(200, { date: oneSecondBeforeExpiry }),
      observation(401, { body: "empty", date: oneSecondBeforeExpiry }),
      observation(401, { body: "text", date: oneSecondBeforeExpiry }),
    ]);
    expect(acceptedAuthorizedDate.receipt).toEqual({
      converged: true,
      observationCount: 3,
      propagationObserved: true,
      stableDenials: 2,
    });
    const acceptedDeniedDate = await runRevocationCase([
      observation(401, { body: "empty", date: oneSecondBeforeExpiry }),
      observation(401, { body: "text", date: oneSecondBeforeExpiry }),
    ]);
    expect(acceptedDeniedDate.receipt).toEqual(firstTwoDenialsReceipt);
    for (const [label, observations, overrides] of [
      [
        "revocation authority time proof is malformed",
        stableDenials,
        {
          deleteObservation: observation(204, {
            body: "empty",
            date: "Sun, 30 Aug 2026 02:00:00 GMT",
          }),
        },
      ],
      [
        "authorized revocation observation is malformed",
        [observation(200, { date: "Sun, 30 Aug 2026 02:00:00 GMT" })],
        {},
      ],
      [
        "denied revocation observation is malformed",
        [observation(401, {
          body: "empty",
          date: "Sun, 30 Aug 2026 02:00:00 GMT",
        })],
        {},
      ],
    ] as const) {
      const equalityBoundary = createRevocationHarness(observations, overrides);
      await expect(revokeReleaseAppTokenWithConvergence({
        apiUrl: new URL("https://api.github.com/"),
        createTimeoutSignal: equalityBoundary.createTimeoutSignal,
        expiresAt: response.expires_at,
        fetchImplementation: equalityBoundary.fetchImplementation,
        now: equalityBoundary.now,
        sleep: equalityBoundary.sleep,
        token,
      })).rejects.toThrow(label);
    }

    for (const [expiresAt, deleteObservation] of [
      ["malformed", observation(204, { body: "empty" })],
      [response.expires_at, observation(204, { body: "empty", date: "malformed" })],
      [response.expires_at, observation(204, { body: "empty", omitDate: true })],
    ] as const) {
      const invalidAuthority = createRevocationHarness(stableDenials, { deleteObservation });
      await expect(revokeReleaseAppTokenWithConvergence({
        apiUrl: new URL("https://api.github.com/"),
        createTimeoutSignal: invalidAuthority.createTimeoutSignal,
        expiresAt,
        fetchImplementation: invalidAuthority.fetchImplementation,
        now: invalidAuthority.now,
        sleep: invalidAuthority.sleep,
        token,
      })).rejects.toThrow("revocation authority time proof is malformed");
      expect(invalidAuthority.calls).toEqual(["DELETE /installation/token"]);
    }

    const impreciseDeadline = createRevocationHarness(stableDenials, {
      initialClock: Number.MAX_SAFE_INTEGER - 30_000,
    });
    await expect(revokeReleaseAppTokenWithConvergence({
      apiUrl: new URL("https://api.github.com/"),
      createTimeoutSignal: impreciseDeadline.createTimeoutSignal,
      expiresAt: response.expires_at,
      fetchImplementation: impreciseDeadline.fetchImplementation,
      now: impreciseDeadline.now,
      sleep: impreciseDeadline.sleep,
      token,
    })).rejects.toThrow("outside the precise clock range");
    expect(impreciseDeadline.calls).toEqual(["DELETE /installation/token"]);

    const revokedAfterFailure: string[] = [];
    await expect(withReleaseAppToken({
      environment,
      async inspect() { return appIdentity; },
      async inspectInstallation() { return installation; },
      mask() {},
      async mint() { return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" }; },
      nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
      async revoke(input: Readonly<{ token: string }>) {
        revokedAfterFailure.push(input.token);
        return firstTwoDenialsReceipt;
      },
    }, async () => {
      throw new Error("simulated leased push failure");
    })).rejects.toThrow("simulated leased push failure");
    expect(revokedAfterFailure).toEqual([token]);

    const malformedTokenRevocations: string[] = [];
    await expect(withReleaseAppToken({
      environment,
      async inspect() { return appIdentity; },
      async inspectInstallation() { return installation; },
      mask() {},
      async mint() {
        return {
          body: {
            ...response,
            permissions: { contents: "read", metadata: "read", workflows: "write" },
          },
          serverDate: "Sun, 30 Aug 2026 01:00:00 GMT",
        };
      },
      nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
      async revoke(input: Readonly<{ token: string }>) {
        malformedTokenRevocations.push(input.token);
        return firstTwoDenialsReceipt;
      },
    }, async () => "unreachable")).rejects.toThrow("permissions are not exactly");
    expect(malformedTokenRevocations).toEqual([token]);

    const operationAndRevocation = withReleaseAppToken({
      environment,
      async inspect() { return appIdentity; },
      async inspectInstallation() { return installation; },
      mask() {},
      async mint() { return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" }; },
      nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
      async revoke() { throw new Error("simulated revoke failure"); },
    }, async () => {
      throw new Error("simulated operation failure");
    });
    try {
      await operationAndRevocation;
      throw new Error("combined App operation unexpectedly succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors.map((item) => String(item))).toEqual([
        "Error: simulated operation failure",
        "Error: simulated revoke failure",
      ]);
    }

    const convergenceAggregateHarness = createRevocationHarness(
      Array.from({ length: 10 }, () => observation(200)),
    );
    const convergenceAggregateSetupCalls: string[] = [];
    let convergenceAggregateOperations = 0;
    let convergenceAggregateMints = 0;
    try {
      await withReleaseAppToken({
        environment,
        async inspect() {
          convergenceAggregateSetupCalls.push("GET /app");
          return appIdentity;
        },
        async inspectInstallation() {
          convergenceAggregateSetupCalls.push("GET /app/installations/12345");
          return installation;
        },
        mask() {},
        async mint() {
          convergenceAggregateMints += 1;
          convergenceAggregateSetupCalls.push("POST /app/installations/12345/access_tokens");
          return { body: response, serverDate: "Sun, 30 Aug 2026 01:00:00 GMT" };
        },
        nowMilliseconds() { return Date.parse("2026-08-30T01:00:00Z"); },
        async revoke(input: Readonly<{ apiUrl: URL; expiresAt: string; token: string }>) {
          await revokeReleaseAppTokenWithConvergence({
            ...input,
            createTimeoutSignal: convergenceAggregateHarness.createTimeoutSignal,
            fetchImplementation: convergenceAggregateHarness.fetchImplementation,
            now: convergenceAggregateHarness.now,
            sleep: convergenceAggregateHarness.sleep,
          });
        },
      }, async () => {
        convergenceAggregateOperations += 1;
        throw new Error("simulated leased push failure before convergence");
      });
      throw new Error("combined operation and convergence unexpectedly succeeded");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors.map((item) => String(item))).toEqual([
        "Error: simulated leased push failure before convergence",
        "Error: release App token revocation did not converge within the bounded operational window",
      ]);
    }
    expect(convergenceAggregateMints).toBe(1);
    expect(convergenceAggregateOperations).toBe(1);
    expect(convergenceAggregateSetupCalls).toEqual([
      "GET /app",
      "GET /app/installations/12345",
      "POST /app/installations/12345/access_tokens",
    ]);
    expect(convergenceAggregateHarness.calls).toEqual([
      "DELETE /installation/token",
      ...Array.from({ length: 10 }, () => "GET /installation/repositories"),
    ]);
    expect([
      ...convergenceAggregateSetupCalls,
      ...convergenceAggregateHarness.calls,
    ]).toHaveLength(14);
    expect(convergenceAggregateHarness.calls.filter((call) =>
      call === "DELETE /installation/token")).toHaveLength(1);

    const deferredPromotionDeployment = providerDeployment(
      10,
      "2026-08-29T13:00:00Z",
      { sha: providerPreviousSha },
    );
    const deferredPromotionBaselineApi = new ProviderApiFixture({
      deployments: [[deferredPromotionDeployment]],
      refSha: providerPreviousSha,
      serverDates: [providerBaselineServerDate, providerBaselineServerDate],
      statuses: terminalBaselineStatus(10, "2026-08-29T13:01:00Z"),
    });
    const deferredPromotionBaseline = await createProviderBaseline({
      api: deferredPromotionBaselineApi,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
    });
    const productionRefRead =
      `GET /repos/${providerRepository}/git/ref/heads/website-production`;

    const deferredPromotionApi = new ProviderApiFixture({
      deployments: [[deferredPromotionDeployment]],
      refSha: providerPreviousSha,
      serverDates: [providerPromotionServerDate],
      statuses: terminalBaselineStatus(10, "2026-08-29T13:01:00Z"),
    });
    const originalDeferredAdvance = deferredPromotionApi.advanceRef.bind(deferredPromotionApi);
    const deferredPromotionEvents: string[] = [];
    let settleDeferredAdvance: (() => void) | undefined;
    const deferredAdvance = new Promise<void>((resolve) => { settleDeferredAdvance = resolve; });
    Object.defineProperty(deferredPromotionApi, "advanceRef", {
      value: async (...args: Parameters<ProviderApiFixture["advanceRef"]>) => {
        deferredPromotionEvents.push("advance-pending");
        await deferredAdvance;
        deferredPromotionEvents.push("advance-settled");
        return originalDeferredAdvance(...args);
      },
    });
    let deferredPromotionSettled = false;
    const deferredPromotionResult = promoteWebsiteProduction({
      api: deferredPromotionApi,
      baselineReceipt: deferredPromotionBaseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    }).finally(() => { deferredPromotionSettled = true; });
    for (let attempt = 0; attempt < 32 && deferredPromotionEvents.length === 0; attempt += 1) {
      await Promise.resolve();
    }
    expect(deferredPromotionEvents).toEqual(["advance-pending"]);
    expect(deferredPromotionSettled).toBe(false);
    expect(deferredPromotionApi.calls.filter((call) => call === productionRefRead)).toHaveLength(2);
    settleDeferredAdvance?.();
    await expect(deferredPromotionResult).resolves.toMatchObject({ mode: "advanced" });
    expect(deferredPromotionEvents).toEqual(["advance-pending", "advance-settled"]);
    expect(deferredPromotionApi.calls.filter((call) => call === productionRefRead)).toHaveLength(3);

    const rejectedPromotionApi = new ProviderApiFixture({
      deployments: [[deferredPromotionDeployment]],
      refSha: providerPreviousSha,
      serverDates: [providerPromotionServerDate],
      statuses: terminalBaselineStatus(10, "2026-08-29T13:01:00Z"),
    });
    let rejectDeferredAdvance: ((reason: Error) => void) | undefined;
    const rejectedAdvance = new Promise<void>((_resolve, reject) => {
      rejectDeferredAdvance = reject;
    });
    Object.defineProperty(rejectedPromotionApi, "advanceRef", {
      value: async () => rejectedAdvance,
    });
    const rejectedPromotion = promoteWebsiteProduction({
      api: rejectedPromotionApi,
      baselineReceipt: deferredPromotionBaseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    });
    for (let attempt = 0; attempt < 32; attempt += 1) await Promise.resolve();
    expect(rejectedPromotionApi.calls.filter((call) => call === productionRefRead)).toHaveLength(2);
    rejectDeferredAdvance?.(new Error("simulated deferred writer failure"));
    await expect(rejectedPromotion).rejects.toThrow("simulated deferred writer failure");
    expect(rejectedPromotionApi.calls.filter((call) => call === productionRefRead)).toHaveLength(2);

    const providerSource = await readFile(providerOutcomeHelperUrl, "utf8");
    const promotionStart = providerSource.indexOf("export async function promoteWebsiteProduction");
    const promotionEnd = providerSource.indexOf("\nexport ", promotionStart + 1);
    const promotionSource = providerSource.slice(
      promotionStart,
      promotionEnd < 0 ? undefined : promotionEnd,
    );
    expect(promotionSource.indexOf("await api.advanceRef(")).toBeGreaterThan(0);
    expect(promotionSource.indexOf("await api.advanceRef("))
      .toBeLessThan(promotionSource.indexOf("const promotedSha = await readProductionRef("));
    const productionAdvanceStart = providerSource.indexOf("async advanceRef(repository");
    const productionAdvanceEnd = providerSource.indexOf("\n  }\n}", productionAdvanceStart);
    const productionAdvanceSource = providerSource.slice(productionAdvanceStart, productionAdvanceEnd);
    expect(providerSource.match(/from "\.\/release-app-token\.mjs";/gu) ?? []).toHaveLength(1);
    expect(providerSource).toContain(
      "RELEASE_APP_REVOCATION_OBSERVATION_OFFSETS_MILLISECONDS",
    );
    expect(providerSource).toContain("withReleaseAppTokenFromEnvironment");
    expect(providerSource.match(/await withReleaseAppTokenFromEnvironment\(/gu) ?? [])
      .toHaveLength(1);
    expect(productionAdvanceSource.trimEnd()).toBe(`async advanceRef(repository, expectedOldSha, verifiedSha, verifiedTag) {
    let releaseAppRevocation;
    await withReleaseAppTokenFromEnvironment(this.#environment, async (token) => {
      advanceWebsiteProductionRefFromEnvironment({
        environment: Object.freeze({ WRENCH_RELEASE_APP_TOKEN: token }),
        expectedOldSha,
        repository,
        verifiedSha,
        verifiedTag,
      });
    }, async (receipt) => {
      if (releaseAppRevocation !== undefined) {
        fail("release App revocation receipt was emitted more than once");
      }
      releaseAppRevocation = parseReleaseAppRevocationReceipt(receipt);
    });
    if (releaseAppRevocation === undefined) fail("release App revocation receipt is missing");
    return releaseAppRevocation;`);

    for (const overrides of [
      { GITHUB_API_URL: "https://github.example.invalid" },
      { GITHUB_REPOSITORY: "hraness/copied-repository" },
      { GITHUB_REPOSITORY_ID: "1" },
      { GITHUB_REPOSITORY_OWNER: "copied-owner" },
      { WRENCH_RELEASE_APP_CLIENT_ID: "bad client" },
      { WRENCH_RELEASE_APP_ID: "0" },
      { WRENCH_RELEASE_APP_INSTALLATION_ID: "1.5" },
      { WRENCH_RELEASE_APP_PRIVATE_KEY: "" },
      { WRENCH_RELEASE_APP_SLUG: "Bad_Slug" },
    ] as const) {
      expect(() => parseReleaseAppConfiguration({ ...environment, ...overrides })).toThrow();
    }

    for (const invalid of [
      { ...response, permissions: { contents: "write", metadata: "read" } },
      { ...response, permissions: { contents: "write", metadata: "read", workflows: "read" } },
      {
        ...response,
        permissions: {
          administration: "write",
          contents: "write",
          metadata: "read",
          workflows: "write",
        },
      },
      { ...response, repository_selection: "all" },
      { ...response, repositories: [] },
      { ...response, repositories: [{ ...response.repositories[0], id: 1 }] },
      { ...response, repositories: [{ ...response.repositories[0], owner: { login: "other" } }] },
      { ...response, expires_at: "2026-08-30T03:00:00Z" },
    ] as const) {
      expect(() => parseReleaseAppTokenResponse(
        invalid,
        "Sun, 30 Aug 2026 01:00:00 GMT",
      )).toThrow();
    }
    const missingTokenResponse: Record<string, unknown> = { ...response };
    delete missingTokenResponse.token;
    expect(() => parseReleaseAppTokenResponse(
      missingTokenResponse,
      "Sun, 30 Aug 2026 01:00:00 GMT",
    )).toThrow("release App token response is missing token");
  });

  test("fetches the exact release object before one leased production ref write", () => {
    const fetchArguments = verifiedReleaseFetchArguments(providerTag);
    expect(fetchArguments).toEqual([
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "credential.helper=",
      "-c",
      "http.extraHeader=",
      "fetch",
      "--no-tags",
      "--no-recurse-submodules",
      "--depth=1",
      "https://github.com/hraness/ghostget.git",
      `refs/tags/${providerTag}`,
    ]);
    const pushArguments = websiteProductionPushArguments(providerPreviousSha, providerVerifiedSha);
    expect(pushArguments).toEqual([
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "credential.helper=",
      "-c",
      "http.extraHeader=",
      "-c",
      "push.followTags=false",
      "-c",
      "push.gpgSign=false",
      "push",
      "--porcelain",
      `--force-with-lease=refs/heads/website-production:${providerPreviousSha}`,
      "--no-follow-tags",
      "--no-tags",
      "--no-signed",
      "--no-verify",
      "--recurse-submodules=no",
      "https://github.com/hraness/ghostget.git",
      `${providerVerifiedSha}:refs/heads/website-production`,
    ]);
    expect(pushArguments).toContain(
      `--force-with-lease=refs/heads/website-production:${providerPreviousSha}`,
    );
    expect(pushArguments).toContain(
      `${providerVerifiedSha}:refs/heads/website-production`,
    );
    expect(pushArguments).toContain("https://github.com/hraness/ghostget.git");
    expect(pushArguments.filter((value) => value === "push")).toHaveLength(1);
    expect(pushArguments).not.toContain("--force");
    expect(pushArguments).not.toContain("--mirror");
    expect(pushArguments).not.toContain("--all");
    expect(pushArguments.join(" ")).not.toContain("*");
    expect(() => verifiedReleaseFetchArguments("main")).toThrow("stable semantic-version tag");
    expect(() => websiteProductionPushArguments(providerPreviousSha, providerPreviousSha))
      .toThrow("already exact");

    const token = "ghs_secret-ghostget-release-token";
    let askpassPath = "";
    const calls: string[][] = [];
    advanceWebsiteProductionRef({
      environment: { WRENCH_RELEASE_APP_TOKEN: token },
      expectedOldSha: providerPreviousSha,
      repository: providerRepository,
      spawnImplementation(executable: string, args: readonly string[], options: {
        readonly env: Readonly<Record<string, string>>;
        readonly timeout: number;
      }) {
        expect(executable).toBe("/usr/bin/git");
        calls.push([...args]);
        expect(options.timeout).toBe(60_000);
        expect(options.env.GIT_TERMINAL_PROMPT).toBe("0");
        expect(options.env.GIT_CONFIG_NOSYSTEM).toBe("1");
        const authenticated = args.includes("fetch") || args.includes("push");
        expect(options.env.WRENCH_RELEASE_APP_TOKEN).toBe(authenticated ? token : undefined);
        expect(Object.keys(options.env).sort()).toEqual((authenticated ? [
          "GIT_ASKPASS",
          "GIT_ASKPASS_REQUIRE",
          "GIT_CONFIG_GLOBAL",
          "GIT_CONFIG_NOSYSTEM",
          "GIT_CONFIG_SYSTEM",
          "GIT_LFS_SKIP_SMUDGE",
          "GIT_TERMINAL_PROMPT",
          "LC_ALL",
          "PATH",
          "WRENCH_RELEASE_APP_TOKEN",
        ] : [
          "GIT_CONFIG_GLOBAL",
          "GIT_CONFIG_NOSYSTEM",
          "GIT_CONFIG_SYSTEM",
          "GIT_LFS_SKIP_SMUDGE",
          "GIT_TERMINAL_PROMPT",
          "LC_ALL",
          "PATH",
        ]).sort());
        if (authenticated) {
          askpassPath = options.env.GIT_ASKPASS ?? "";
          expect(statSync(askpassPath).mode & 0o777).toBe(0o700);
          const askpass = readFileSync(askpassPath, "utf8");
          expect(askpass).toContain("x-access-token");
          expect(askpass).toContain("$WRENCH_RELEASE_APP_TOKEN");
          expect(askpass).not.toContain(token);
        } else {
          expect(options.env.GIT_ASKPASS).toBeUndefined();
        }
        return {
          status: 0,
          stderr: "",
          stdout: args.includes("rev-parse") ? `${providerVerifiedSha}\n` : "ok",
        };
      },
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    });
    expect(calls).toEqual([
      fetchArguments,
      [
        "-c",
        "core.hooksPath=/dev/null",
        "rev-parse",
        "--verify",
        "FETCH_HEAD^{commit}",
      ],
      pushArguments,
    ]);
    expect(existsSync(askpassPath)).toBe(false);

    let failureAskpass = "";
    expect(() => advanceWebsiteProductionRef({
      environment: { WRENCH_RELEASE_APP_TOKEN: token },
      expectedOldSha: providerPreviousSha,
      repository: providerRepository,
      spawnImplementation(_executable: string, _args: readonly string[], options: {
        readonly env: Readonly<Record<string, string>>;
      }) {
        failureAskpass = options.env.GIT_ASKPASS ?? "";
        return { status: 1, stderr: `remote rejected ${token}`, stdout: "" };
      },
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).toThrow("remote rejected [redacted]");
    expect(existsSync(failureAskpass)).toBe(false);

    let mismatchCalls = 0;
    expect(() => advanceWebsiteProductionRef({
      environment: { WRENCH_RELEASE_APP_TOKEN: token },
      expectedOldSha: providerPreviousSha,
      repository: providerRepository,
      spawnImplementation(_executable: string, args: readonly string[]) {
        mismatchCalls += 1;
        return {
          status: 0,
          stderr: "",
          stdout: args.includes("rev-parse") ? `${providerPreviousSha}\n` : "ok",
        };
      },
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).toThrow("does not peel to the verified release SHA");
    expect(mismatchCalls).toBe(2);
  });

  test("rejects a stale explicit lease without moving the production ref", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ghostget-ref-lease-"));
    const remote = join(directory, "remote.git");
    const source = join(directory, "source");
    const runGit = (arguments_: readonly string[], cwd = source) => {
      const result = Bun.spawnSync(["git", ...arguments_], {
        cwd,
        stderr: "pipe",
        stdout: "pipe",
      });
      return Object.freeze({
        exitCode: result.exitCode,
        stderr: result.stderr.toString(),
        stdout: result.stdout.toString(),
      });
    };
    const checkedGit = (arguments_: readonly string[], cwd = source): string => {
      const result = runGit(arguments_, cwd);
      if (result.exitCode !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };

    try {
      checkedGit(["init", "--bare", remote], directory);
      checkedGit(["init", source], directory);
      checkedGit(["config", "user.name", "Ghostget lease test"]);
      checkedGit(["config", "user.email", "test@example.invalid"]);
      const file = join(source, "value.txt");
      await writeFile(file, "one\n", "utf8");
      checkedGit(["add", "value.txt"]);
      checkedGit(["commit", "-m", "one"]);
      const first = checkedGit(["rev-parse", "HEAD"]);
      checkedGit(["push", remote, `${first}:refs/heads/website-production`]);

      await writeFile(file, "two\n", "utf8");
      checkedGit(["commit", "-am", "two"]);
      const second = checkedGit(["rev-parse", "HEAD"]);
      const firstAdvance = websiteProductionPushArguments(first, second).map((value) =>
        value === "https://github.com/hraness/ghostget.git" ? remote : value
      );
      checkedGit(firstAdvance);
      expect(checkedGit([
        "--git-dir",
        remote,
        "rev-parse",
        "refs/heads/website-production",
      ], directory)).toBe(second);

      await writeFile(file, "three\n", "utf8");
      checkedGit(["commit", "-am", "three"]);
      const third = checkedGit(["rev-parse", "HEAD"]);
      const staleAdvance = websiteProductionPushArguments(first, third).map((value) =>
        value === "https://github.com/hraness/ghostget.git" ? remote : value
      );
      const stale = runGit(staleAdvance);
      expect(stale.exitCode).not.toBe(0);
      expect(`${stale.stdout}${stale.stderr}`).toContain("failed to push some refs");
      expect(checkedGit([
        "--git-dir",
        remote,
        "rev-parse",
        "refs/heads/website-production",
      ], directory)).toBe(second);
    } finally {
      await chmod(directory, 0o700).catch(() => undefined);
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("parses one authenticated GitHub server Date response", () => {
    const body = JSON.stringify(providerRef(providerPreviousSha));
    expect(parseIncludedGitHubResponse(
      `HTTP/2.0 200 OK\r\ndate: Sat, 29 Aug 2026 15:01:00 GMT\r\ncontent-type: application/json\r\n\r\n${body}\n`,
    )).toEqual({
      body: providerRef(providerPreviousSha),
      serverDate: providerPromotionServerDate,
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

    const canonicalReceipt = encodeProviderReceipt({ a: 1 });
    expect(decodeProviderReceipt(canonicalReceipt)).toEqual({ a: 1 });
    expect(() => decodeProviderReceipt(
      Buffer.from('{ "a": 1 }', "utf8").toString("base64url"),
    )).toThrow("does not contain canonical JSON");
    expect(() => decodeProviderReceipt("A".repeat(64 * 1024 + 1)))
      .toThrow("is not bounded canonical base64url");
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

    const automaticApi = new ProviderApiFixture();
    await expect(resolveReleaseAuthority({
      api: automaticApi,
      defaultBranch: "main",
      eventName: "workflow_run",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      requestedReleaseWorkflowRunAttempt: "1",
      requestedReleaseWorkflowRunId: providerReleaseWorkflowRunId,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).resolves.toEqual({ releaseWorkflowRunId: providerReleaseWorkflowRunId });
    expect(automaticApi.calls.filter((call) => call.includes("/releases/tags/")))
      .toHaveLength(2);
    expect(automaticApi.calls.filter((call) => call.includes("/actions/runs/")))
      .toHaveLength(1);
    expect(automaticApi.timeoutMilliseconds.filter((value) => value === 10_000))
      .toHaveLength(1);

    const manualApi = new ProviderApiFixture({
      workflowRunSnapshots: [
        providerReleaseWorkflowRun({ run_attempt: 3 }),
      ],
    });
    await expect(resolveReleaseAuthority({
      api: manualApi,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).resolves.toEqual({ releaseWorkflowRunId: providerReleaseWorkflowRunId });

    for (const input of [
      {
        eventName: "workflow_run",
        requestedReleaseWorkflowRunAttempt: "",
        requestedReleaseWorkflowRunId: "",
      },
      {
        eventName: "workflow_dispatch",
        requestedReleaseWorkflowRunAttempt: "1",
        requestedReleaseWorkflowRunId: providerReleaseWorkflowRunId,
      },
      {
        eventName: "workflow_run",
        requestedReleaseWorkflowRunAttempt: "",
        requestedReleaseWorkflowRunId: providerReleaseWorkflowRunId,
      },
    ] as const) {
      const api = new ProviderApiFixture();
      await expect(resolveReleaseAuthority({
        api,
        defaultBranch: "main",
        recoveryWorkflowSha: providerVerifiedSha,
        repository: providerRepository,
        verifiedSha: providerVerifiedSha,
        verifiedTag: providerTag,
        ...input,
      })).rejects.toThrow();
      expect(api.calls).toHaveLength(0);
    }

    const differentRunReceipt = releaseSourceReceipt({
      ...coordinates,
      workflowRunId: "88002",
    });
    const differentRun = new ProviderApiFixture({
      releaseSnapshots: [providerRelease({ body: differentRunReceipt })],
    });
    await expect(resolveReleaseAuthority({
      api: differentRun,
      defaultBranch: "main",
      eventName: "workflow_run",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      requestedReleaseWorkflowRunAttempt: "1",
      requestedReleaseWorkflowRunId: providerReleaseWorkflowRunId,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("name different runs");
    expect(differentRun.calls.some((call) => call.includes("/actions/runs/"))).toBe(false);

    const manualDifferentRun = new ProviderApiFixture({
      releaseSnapshots: [providerRelease({ body: differentRunReceipt })],
    });
    await expect(resolveReleaseAuthority({
      api: manualDifferentRun,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("successful Release workflow identity");

    const runAfterInitialValidation = new ProviderApiFixture({
      workflowRunSnapshots: [
        providerReleaseWorkflowRun({ run_attempt: 3 }),
        providerReleaseWorkflowRun({ head_sha: "3".repeat(40), run_attempt: 3 }),
      ],
    });
    await expect(resolveReleaseAuthority({
      api: runAfterInitialValidation,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).resolves.toEqual({ releaseWorkflowRunId: providerReleaseWorkflowRunId });
    expect(runAfterInitialValidation.calls.filter((call) => call.includes("/actions/runs/")))
      .toHaveLength(1);

    for (const latestOverride of [
      { id: 11 },
      { published_at: "2026-08-29T14:00:01Z" },
      { author: { id: 7, login: "github-actions[bot]", type: "Bot" } },
      { body: differentRunReceipt },
    ] as const) {
      const api = new ProviderApiFixture({
        latestSnapshots: [providerLatest(latestOverride)],
      });
      await expect(resolveReleaseAuthority({
        api,
        defaultBranch: "main",
        eventName: "workflow_dispatch",
        recoveryWorkflowSha: providerVerifiedSha,
        repository: providerRepository,
        verifiedSha: providerVerifiedSha,
        verifiedTag: providerTag,
      })).rejects.toThrow();
    }
  });

  test("exhausts bounded deployment and status pages without trusting API order", async () => {
    const at = (index: number): string =>
      new Date(Date.parse("2026-08-29T13:59:59Z") - index * 1_000)
        .toISOString()
        .replace(".000Z", "Z");
    for (const count of [0, 100, 101, 500] as const) {
      const deployments = Array.from(
        { length: count },
        (_, index) => providerDeployment(10_000 - index, at(index)),
      );
      if (count === 101) {
        deployments[99] = providerDeployment(1, "2026-08-29T12:00:00Z");
        deployments[100] = providerDeployment(20_000, "2026-08-29T12:00:00Z");
      }
      const api = new ProviderApiFixture({ deployments: [deployments] });
      const parsed = await collectProductionDeployments(api, providerRepository);
      expect(parsed).toHaveLength(count);
      expect(api.graphqlCalls).toHaveLength(Math.max(1, Math.ceil(count / 100)));
      if (count === 101) expect(parsed.findIndex((item: { id: number }) => item.id === 20_000))
        .toBeLessThan(parsed.findIndex((item: { id: number }) => item.id === 1));
    }

    const overCap = Array.from(
      { length: 501 },
      (_, index) => providerDeployment(20_000 - index, at(index)),
    );
    await expect(
      collectProductionDeployments(
        new ProviderApiFixture({ deployments: [overCap] }),
        providerRepository,
      ),
    ).rejects.toThrow("exceed the 500-item GraphQL audit cap");

    const duplicate = [
      providerDeployment(20, "2026-08-29T13:00:00Z"),
      providerDeployment(20, "2026-08-29T12:00:00Z"),
    ];
    await expect(
      collectProductionDeployments(
        new ProviderApiFixture({ deployments: [duplicate] }),
        providerRepository,
      ),
    ).rejects.toThrow("duplicate id");
    await expect(
      collectProductionDeployments(
        new ProviderApiFixture({ deployments: [[null]] }),
        providerRepository,
      ),
    ).rejects.toThrow("is not an object");
    await expect(
      collectProductionDeployments(
        new ProviderApiFixture({
          deployments: [[providerDeployment(21, "2026-08-29T13:00:00Z", { sha: null })]],
        }),
        providerRepository,
      ),
    ).rejects.toThrow("is not a string");

    for (const count of [0, 100, 101, 500] as const) {
      const statuses = Array.from(
        { length: count },
        (_, index) => providerStatus(30_000 - index, "pending", at(index)),
      );
      if (count === 101) {
        statuses[99] = providerStatus(2, "pending", "2026-08-29T12:00:00Z");
        statuses[100] = providerStatus(40_000, "pending", "2026-08-29T12:00:00Z");
      }
      const api = new ProviderApiFixture({ statuses: new Map([[10, [statuses]]]) });
      const parsed = await collectDeploymentStatuses(api, providerRepository, 10);
      expect(parsed).toHaveLength(count);
      expect(api.calls.filter((call) => call.includes("/statuses?"))).toHaveLength(6);
      if (count === 101) expect(parsed.findIndex((item: { id: number }) => item.id === 40_000))
        .toBeLessThan(parsed.findIndex((item: { id: number }) => item.id === 2));
    }

    const statusOverCap = Array.from(
      { length: 501 },
      (_, index) => providerStatus(50_000 - index, "pending", at(index)),
    );
    await expect(
      collectDeploymentStatuses(
        new ProviderApiFixture({ statuses: new Map([[10, [statusOverCap]]]) }),
        providerRepository,
        10,
      ),
    ).rejects.toThrow("exceeds the 500-item audit cap");

    await expect(collectDeploymentStatuses(
      new ProviderApiFixture({
        statuses: new Map([[10, [[
          providerStatus(9, "pending", "2026-08-29T13:00:00Z"),
          providerStatus(9, "success", "2026-08-29T12:00:00Z"),
        ]]]]),
      }),
      providerRepository,
      10,
    )).rejects.toThrow("duplicate id");
    await expect(collectDeploymentStatuses(
      new ProviderApiFixture({ statuses: new Map([[10, [[null]]]]) }),
      providerRepository,
      10,
    )).rejects.toThrow("is not an object");

    const oneGraphNode = providerGraphqlDeployment(80_000, "2026-08-29T12:00:00Z");
    for (const response of [
      providerGraphqlResponse([oneGraphNode], { endCursor: null, totalCount: 1 }),
      providerGraphqlResponse([oneGraphNode], { totalCount: 2 }),
      providerGraphqlResponse([], { endCursor: "cursor-1", hasNextPage: true, totalCount: 1 }),
      providerGraphqlResponse([oneGraphNode], { cost: 3, totalCount: 1 }),
      providerGraphqlResponse([oneGraphNode], { remaining: -1, totalCount: 1 }),
      providerGraphqlResponse([oneGraphNode], { totalCount: 501 }),
    ] as const) {
      await expect(collectProductionDeployments(
        new ProviderApiFixture({ graphqlResponses: [response] }),
        providerRepository,
      )).rejects.toThrow();
    }
    for (const deployment of [
      providerGraphqlDeployment(80_000, "2026-08-29T12:00:00Z", {
        ref: { name: "website-production" },
      }),
      providerGraphqlDeployment(80_000, "2026-08-29T12:00:00Z", {
        commitOid: providerVerifiedSha.toUpperCase(),
      }),
    ] as const) {
      await expect(collectProductionDeployments(
        new ProviderApiFixture({
          graphqlResponses: [providerGraphqlResponse([deployment])],
        }),
        providerRepository,
      )).rejects.toThrow();
    }
    await expect(collectProductionDeployments(
      new ProviderApiFixture({
        graphqlResponses: [providerGraphqlResponse([oneGraphNode], {
          endCursor: "opaque+/=cursor",
          hasNextPage: true,
          remaining: 8,
          totalCount: 2,
        }), providerGraphqlResponse([
          providerGraphqlDeployment(80_001, "2026-08-29T12:00:01Z"),
        ], {
          endCursor: "done+/=cursor",
          remaining: 7,
          totalCount: 3,
        })],
      }),
      providerRepository,
    )).rejects.toThrow("totalCount changed");

    const graphPageOne = providerGraphqlResponse(
      [providerGraphqlDeployment(80_010, "2026-08-29T12:00:00Z")],
      {
        endCursor: "cursor-repeat",
        hasNextPage: true,
        remaining: 10,
        totalCount: 2,
      },
    );
    const graphPageTwo = providerGraphqlResponse(
      [providerGraphqlDeployment(80_011, "2026-08-29T12:00:01Z")],
      {
        endCursor: "cursor-repeat",
        hasNextPage: true,
        remaining: 9,
        totalCount: 2,
      },
    );
    await expect(collectProductionDeployments(
      new ProviderApiFixture({ graphqlResponses: [graphPageOne, graphPageTwo] }),
      providerRepository,
    )).rejects.toThrow("cursor repeated");
    await expect(collectProductionDeployments(
      new ProviderApiFixture({
        graphqlResponses: [graphPageOne, providerGraphqlResponse([
          providerGraphqlDeployment(80_011, "2026-08-29T12:00:01Z"),
        ], {
          endCursor: "cursor-finished",
          remaining: 9,
          resetAt: "2026-08-29T17:00:00Z",
          totalCount: 2,
        })],
      }),
      providerRepository,
    )).rejects.toThrow("crossed a GraphQL rate-limit reset");
    await expect(collectProductionDeployments(
      new ProviderApiFixture({
        graphqlResponses: [graphPageOne, providerGraphqlResponse([
          providerGraphqlDeployment(80_011, "2026-08-29T12:00:01Z"),
        ], {
          endCursor: "cursor-finished",
          remaining: 10,
          totalCount: 2,
        })],
      }),
      providerRepository,
    )).rejects.toThrow("remaining points did not decrease monotonically");
    await expect(collectProductionDeployments(
      new ProviderApiFixture({
        graphqlResponses: [providerGraphqlResponse([
          providerGraphqlDeployment(80_012, "2026-08-29T12:00:02Z"),
        ], {
          endCursor: "cursor-1",
          hasNextPage: true,
          remaining: 7,
          totalCount: 2,
        })],
      }),
      providerRepository,
    )).rejects.toThrow("insufficient GraphQL points");
    await expect(collectProductionDeployments({
      async graphql(): Promise<ProviderJson> {
        throw new Error("simulated provider API failure");
      },
    }, providerRepository)).rejects.toThrow("simulated provider API failure");
  });

  test("stabilizes the baseline and records the actual promotion mode", async () => {
    const baselineDeployment = providerDeployment(
      10,
      "2026-08-29T13:00:00Z",
      { sha: providerPreviousSha },
    );
    const baselineApi = new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      statuses: terminalBaselineStatus(),
    });
    const baseline = await createProviderBaseline({
      api: baselineApi,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
    }) as Readonly<Record<string, unknown>>;
    expect(baseline.schema).toBe("wrench-provider-baseline-v4");
    expect(baseline.releaseWorkflowRunId).toBe(providerReleaseWorkflowRunId);
    expect(baseline.verifiedTag).toBe(providerTag);
    expect(baseline.publicMarker).toMatchObject({
      kind: "release",
      marker: {
        deploymentUrl: "https://wrench-10-hraness.vercel.app",
        sourceSha: providerPreviousSha,
        tag: "v0.16.1",
      },
    });
    expect(baseline.refSha).toBe(providerPreviousSha);
    expect(baseline.deploymentIds).toEqual([10]);
    expect(baseline.deploymentFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(baselineApi.calls).toHaveLength(2);
    expect(baselineApi.graphqlCalls).toHaveLength(2);
    expect(baselineApi.includedCalls).toEqual([
      `/repos/${providerRepository}/git/ref/heads/website-production`,
      `/repos/${providerRepository}/git/ref/heads/website-production`,
    ]);

    for (const refValue of [
      null,
      { object: { sha: providerPreviousSha, type: "commit" }, ref: "refs/heads/other" },
      { object: { sha: providerPreviousSha, type: "tag" }, ref: "refs/heads/website-production" },
      { object: { sha: "A".repeat(40), type: "commit" }, ref: "refs/heads/website-production" },
    ] as const) {
      await expect(createProviderBaseline({
        api: new ProviderApiFixture({ refValues: [refValue] }),
        repository: providerRepository,
        verifiedSha: providerVerifiedSha,
      })).rejects.toThrow();
    }

    const advanced = await providerReceipts("advanced");
    expect(advanced.promotion).toMatchObject({
      mode: "advanced",
      releaseAppRevocation: providerReleaseAppRevocation,
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      schema: "wrench-provider-promotion-v3",
    });
    expect(advanced.promotionCalls.filter((call) => call.includes("/commits/"))).toEqual([
      `GET ${providerTagCommitEndpoint}`,
    ]);
    expect(advanced.promotionCalls.filter((call) => call.includes("/actions/runs/")))
      .toEqual([]);
    for (const ambiguousEndpoint of providerAmbiguousTagCommitEndpoints) {
      expect(advanced.promotionCalls).not.toContain(`GET ${ambiguousEndpoint}`);
    }
    expect(advanced.promotionCalls.filter((call) => call.startsWith("GIT CAS "))).toEqual([
      `GIT CAS ${providerRepository} ${providerPreviousSha} ${providerVerifiedSha} ${providerTag}`,
    ]);
    expect(advanced.promotionCalls.some((call) => call.includes("/deployments"))).toBe(false);
    const recovered = await providerReceipts("already-exact");
    expect(recovered.promotion).toMatchObject({
      mode: "already-exact",
      releaseAppRevocation: null,
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      schema: "wrench-provider-promotion-v3",
    });
    expect(recovered.promotionCalls.filter((call) => call.includes("/commits/"))).toEqual([
      `GET ${providerTagCommitEndpoint}`,
    ]);
    for (const ambiguousEndpoint of providerAmbiguousTagCommitEndpoints) {
      expect(recovered.promotionCalls).not.toContain(`GET ${ambiguousEndpoint}`);
    }
    expect(recovered.promotionCalls.some((call) => call.startsWith("GIT CAS "))).toBe(false);

    const concurrent = providerDeployment(11, "2026-08-29T15:01:00Z");
    await expect(createProviderBaseline({
      api: new ProviderApiFixture({
        deployments: [[concurrent]],
        statuses: terminalBaselineStatus(11, "2026-08-29T15:01:01Z"),
      }),
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
    })).rejects.toThrow("overlaps the baseline lower bound");

    await expect(createProviderBaseline({
      api: new ProviderApiFixture({
        deployments: [[baselineDeployment], [providerDeployment(11, "2026-08-29T14:59:00Z"), baselineDeployment]],
        statuses: terminalBaselineStatus(),
      }),
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
    })).rejects.toThrow("inventory changed during the baseline");

    await expect(createProviderBaseline({
      api: new ProviderApiFixture({
        deployments: [[
          baselineDeployment,
        ], [
          providerDeployment(10, "2026-08-29T13:00:00Z"),
        ]],
        statuses: terminalBaselineStatus(),
      }),
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
    })).rejects.toThrow("inventory changed during the baseline");

    const relevantBaselineDeployment = providerDeployment(10, "2026-08-29T13:00:00Z");
    const baselineGraph = providerGraphqlDeployment(10, "2026-08-29T13:00:00Z");
    for (const malformedGraph of [
      providerGraphqlDeployment(10, "2026-08-29T13:00:00Z", {
        latestStatus: null,
        state: "ACTIVE",
      }),
      providerGraphqlDeployment(10, "2026-08-29T13:00:00Z", {
        latestStatus: {
          ...(baselineGraph as Readonly<Record<string, ProviderJson>>).latestStatus as object,
          state: "PENDING",
        },
        state: "PENDING",
      }),
      providerGraphqlDeployment(10, "2026-08-29T13:00:00Z", {
        latestStatus: {
          ...(baselineGraph as Readonly<Record<string, ProviderJson>>).latestStatus as object,
          state: "FAILURE",
        },
        state: "ACTIVE",
      }),
      providerGraphqlDeployment(10, "2026-08-29T13:00:00Z", {
        creator: { __typename: "Bot", databaseId: 35613825, login: "vercel[bot]" },
      }),
      providerGraphqlDeployment(10, "2026-08-29T13:00:00Z", {
        latestStatus: {
          ...(baselineGraph as Readonly<Record<string, ProviderJson>>).latestStatus as object,
          environmentUrl: "https://other-10-hraness.vercel.app",
          logUrl: "https://other-10-hraness.vercel.app",
        },
      }),
    ] as const) {
      await expect(createProviderBaseline({
        api: new ProviderApiFixture({ graphqlDeployments: [[malformedGraph]] }),
        repository: providerRepository,
        verifiedSha: providerVerifiedSha,
      })).rejects.toThrow();
    }
    const duplicateGraphStatus = providerGraphqlDeployment(11, "2026-08-29T12:59:00Z", {
      latestStatus: (baselineGraph as Readonly<Record<string, ProviderJson>>).latestStatus,
      updatedAt: "2026-08-29T13:00:00Z",
    });
    await expect(createProviderBaseline({
      api: new ProviderApiFixture({
        graphqlDeployments: [[baselineGraph, duplicateGraphStatus]],
      }),
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
    })).rejects.toThrow("duplicate latest status id");
    await expect(createProviderBaseline({
      api: new ProviderApiFixture({
        deployments: [[relevantBaselineDeployment]],
        serverDates: [providerBaselineServerDate, "2026-08-29T14:59:59.000Z"],
        statuses: terminalBaselineStatus(),
      }),
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
    })).rejects.toThrow("GitHub server Date regressed");

    const auditedDeployments = Array.from(
      { length: 500 },
      (_, index) => providerDeployment(
        1_000 + index,
        new Date(Date.parse("2026-08-28T13:00:00Z") + index * 1_000)
          .toISOString()
          .replace(".000Z", "Z"),
        { sha: index % 2 === 0 ? providerVerifiedSha : providerPreviousSha },
      ),
    );
    const maxBaselineApi = new ProviderApiFixture({
      deployments: [auditedDeployments],
      serverDates: [providerBaselineServerDate, providerBaselineServerDate],
    });
    const maxBaseline = await createProviderBaseline({
      api: maxBaselineApi,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
    }) as ProviderJson;
    expect((maxBaseline as Readonly<{ deploymentIds: readonly unknown[] }>).deploymentIds)
      .toHaveLength(500);
    const encodedMaxBaseline = encodeProviderReceipt(maxBaseline);
    expect(Buffer.byteLength(encodedMaxBaseline, "utf8")).toBeLessThanOrEqual(64 * 1024);
    expect(maxBaselineApi.calls).toHaveLength(releaseRestRequestBudget.providerBaseline);
    expect(maxBaselineApi.graphqlCalls).toHaveLength(releaseGraphqlRequestBudget.providerBaseline);
    const maxPromotionApi = new ProviderApiFixture({
      defaultBranchShaSnapshots: [
        "3".repeat(40),
        "4".repeat(40),
        "5".repeat(40),
        "6".repeat(40),
      ],
      refSha: providerPreviousSha,
      serverDates: [providerPromotionServerDate],
    });
    const maxPromotion = await promoteWebsiteProduction({
      api: maxPromotionApi,
      baselineReceipt: maxBaseline,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    }) as ProviderJson;
    expect(maxPromotion).toMatchObject({ mode: "advanced" });
    expect(maxPromotionApi.calls.filter((call) => !call.startsWith("GIT CAS ")))
      .toHaveLength(releaseRestRequestBudget.providerPromotion);

    const budgetBaseline = await createProviderBaseline({
      api: new ProviderApiFixture({
        deployments: [auditedDeployments.slice(0, 499)],
        serverDates: [providerBaselineServerDate, providerBaselineServerDate],
      }),
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
    }) as ProviderJson;
    const budgetPromotion = await promoteWebsiteProduction({
      api: new ProviderApiFixture({
        refSha: providerPreviousSha,
        serverDates: [providerPromotionServerDate],
      }),
      baselineReceipt: budgetBaseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    }) as ProviderJson;

    const budgetCandidate = providerDeployment(20_000, "2026-08-29T15:02:00Z");
    const budgetPending = providerStatus(
      200_000,
      "pending",
      "2026-08-29T15:02:30Z",
      {},
      20_000,
    );
    const budgetSuccess = providerStatus(
      200_001,
      "success",
      "2026-08-29T15:03:00Z",
      {},
      20_000,
    );
    const candidateSnapshots = [
      ...Array.from({ length: releaseRestRequestBudget.maxPolls - 2 }, () => [budgetPending]),
      [budgetSuccess, budgetPending],
      [budgetSuccess, budgetPending],
      [budgetSuccess, budgetPending],
      [budgetSuccess, budgetPending],
    ];
    const budgetApi = new ProviderApiFixture({
      defaultBranchShaSnapshots: [
        "3".repeat(40),
        "4".repeat(40),
        "5".repeat(40),
        "6".repeat(40),
        "7".repeat(40),
        "8".repeat(40),
      ],
      deployments: [[budgetCandidate, ...auditedDeployments.slice(0, 499)]],
      refSha: providerVerifiedSha,
      statuses: new Map([
        [20_000, candidateSnapshots],
      ]),
    });
    await expect(waitForProviderOutcome({
      api: budgetApi,
      baselineReceipt: budgetBaseline,
      maxPolls: releaseRestRequestBudget.maxPolls,
      pollIntervalMilliseconds: 0,
      promotionReceipt: budgetPromotion,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      publicSite: new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, 20_000)],
      }),
      recoveryWorkflowSha: providerVerifiedSha,
      sleep: async () => {},
    })).resolves.toEqual({ deploymentId: 20_000, statusId: 200_001 });
    expect(budgetApi.calls).toHaveLength(releaseRestRequestBudget.providerOutcome);
    expect(budgetApi.graphqlCalls).toHaveLength(releaseGraphqlRequestBudget.providerOutcome);

    const auditedBaseline = auditedDeployments.slice(0, 499);
    const lateCandidateInventory = [budgetCandidate, ...auditedBaseline];
    const lateCandidateApi = new ProviderApiFixture({
      deployments: [
        ...Array.from(
          { length: releaseRestRequestBudget.maxPolls - 1 },
          () => auditedBaseline,
        ),
        lateCandidateInventory,
        lateCandidateInventory,
        lateCandidateInventory,
      ],
      refSha: providerVerifiedSha,
      statuses: new Map([[20_000, [
        [budgetSuccess],
        [budgetSuccess],
        [budgetSuccess],
      ]]]),
    });
    await expect(waitForProviderOutcome({
      api: lateCandidateApi,
      baselineReceipt: budgetBaseline,
      maxPolls: releaseRestRequestBudget.maxPolls,
      pollIntervalMilliseconds: 0,
      promotionReceipt: budgetPromotion,
      publicSite: new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, 20_000)],
      }),
      sleep: async () => {},
    })).resolves.toEqual({ deploymentId: 20_000, statusId: 200_001 });
    expect(lateCandidateApi.graphqlCalls).toHaveLength(
      releaseGraphqlRequestBudget.providerOutcome,
    );
  });

  test("fails public production identity closed across baseline and outcome transitions", async () => {
    const baselineDeployment = providerDeployment(
      10,
      "2026-08-29T13:00:00Z",
      { sha: providerPreviousSha },
    );
    const baselineApi = (): ProviderApiFixture => new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      refSha: providerPreviousSha,
      serverDates: [providerBaselineServerDate, providerBaselineServerDate],
      statuses: terminalBaselineStatus(),
    });
    const missingSite = (): ProviderPublicSiteFixture => new ProviderPublicSiteFixture({
      markerSnapshots: ["missing"],
    });
    await expect(createProviderBaselineRaw({
      api: baselineApi(),
      publicSite: missingSite(),
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: "v0.16.5",
    })).resolves.toMatchObject({
      publicMarker: { kind: "missing" },
      schema: "wrench-provider-baseline-v4",
      verifiedTag: "v0.16.5",
    });
    for (const verifiedTag of ["v0.16.4", "v0.16.6"] as const) {
      await expect(createProviderBaselineRaw({
        api: baselineApi(),
        publicSite: missingSite(),
        releaseWorkflowRunId: providerReleaseWorkflowRunId,
        repository: providerRepository,
        verifiedSha: providerVerifiedSha,
        verifiedTag,
      })).rejects.toThrow("may be absent only for first marker-bearing release v0.16.5");
    }

    await expect(createProviderBaselineRaw({
      api: baselineApi(),
      publicSite: new ProviderPublicSiteFixture({
        markerSnapshots: [
          "missing",
          providerMarker(providerPreviousSha, "v0.16.1", 10),
        ],
      }),
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: "v0.16.5",
    })).rejects.toThrow("changed during the baseline snapshot");
    await expect(createProviderBaselineRaw({
      api: baselineApi(),
      publicSite: new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, 20)],
      }),
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("does not bind the baseline production ref");
    await expect(createProviderBaselineRaw({
      api: baselineApi(),
      publicSite: new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker(providerPreviousSha, "v0.16.1", 11)],
      }),
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("does not bind the latest baseline deployment URL");

    const newerBaseline = providerDeployment(
      11,
      "2026-08-29T13:01:00Z",
      { sha: providerPreviousSha },
    );
    await expect(createProviderBaselineRaw({
      api: new ProviderApiFixture({
        deployments: [[newerBaseline, baselineDeployment]],
        refSha: providerPreviousSha,
        serverDates: [providerBaselineServerDate, providerBaselineServerDate],
        statuses: new Map([
          [10, [[providerStatus(100, "success", "2026-08-29T13:01:00Z")]]],
          [11, [[providerStatus(110, "success", "2026-08-29T13:02:00Z", {}, 11)]]],
        ]),
      }),
      publicSite: new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker(providerPreviousSha, "v0.16.1", 10)],
      }),
      releaseWorkflowRunId: providerReleaseWorkflowRunId,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("does not bind the latest baseline deployment URL");

    const { baseline, promotion } = await providerReceipts("advanced");
    const candidate = providerDeployment(20, "2026-08-29T15:02:00Z");
    const pending = providerStatus(200, "pending", "2026-08-29T15:02:30Z", {}, 20);
    const success = providerStatus(201, "success", "2026-08-29T15:03:00Z", {}, 20);
    const outcomeApi = (
      statusSnapshots: ProviderJson[][],
      deployments: ProviderJson[][] = [[candidate, baselineDeployment]],
    ): ProviderApiFixture => new ProviderApiFixture({
      deployments,
      refSha: providerVerifiedSha,
      statuses: new Map([
        [10, [[providerStatus(100, "success", "2026-08-29T13:01:00Z")]]],
        [20, statusSnapshots],
      ]),
    });
    const wait = (
      api: ProviderApiFixture,
      publicSite: ProviderPublicSiteFixture,
      maxPolls = 2,
    ): Promise<unknown> => waitForProviderOutcomeRaw({
      api,
      baselineReceipt: baseline,
      defaultBranch: "main",
      eventName: "push",
      maxPolls,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      publicSite,
      recoveryWorkflowSha: "",
      sleep: async () => {},
      ...providerAuthority,
    });

    await expect(wait(
      outcomeApi([[pending]], [[baselineDeployment]]),
      new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker("3".repeat(40), "v0.15.0", 30)],
      }),
      1,
    )).rejects.toThrow("exposed a third release identity");

    await expect(wait(
      outcomeApi([[pending], [pending]]),
      new ProviderPublicSiteFixture({
        markerSnapshots: [
          providerMarker(providerVerifiedSha, providerTag, 20),
          providerMarker(providerPreviousSha, "v0.16.1", 10),
        ],
      }),
    )).rejects.toThrow("regressed after exposing the target release");

    await expect(wait(
      outcomeApi([[pending], [pending]], [[baselineDeployment]]),
      new ProviderPublicSiteFixture({
        markerSnapshots: [
          providerMarker(providerVerifiedSha, providerTag, 20),
          providerMarker(providerVerifiedSha, providerTag, 21),
        ],
      }),
    )).rejects.toThrow("changed within the target release identity");

    await expect(wait(
      outcomeApi([[success]]),
      new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, 21)],
      }),
      1,
    )).rejects.toThrow("does not bind the pinned candidate deployment URL");

    await expect(wait(
      outcomeApi([[success]]),
      new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker(providerPreviousSha, "v0.16.1", 10)],
      }),
      1,
    )).rejects.toThrow("provider observation poll budget exhausted before its monotonic deadline");

    const stablePublic = new ProviderPublicSiteFixture({
      markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, 20)],
    });
    const stableOutcomeApi = outcomeApi([[success], [success], [success]]);
    await expect(wait(stableOutcomeApi, stablePublic, 1))
      .resolves.toEqual({ deploymentId: 20, statusId: 201 });
    const releaseRunReads = stableOutcomeApi.timedCalls.filter((call) =>
      call.endpoint ===
        `/repos/${providerRepository}/actions/runs/${providerReleaseWorkflowRunId}`
    );
    expect(releaseRunReads).toHaveLength(0);
    expect(stablePublic.calls).toEqual([
      "marker",
      "marker",
      "health /",
      "health /providers/beeper/",
      "health /llms.txt",
      "www",
      "marker",
      "health /",
      "health /providers/beeper/",
      "health /llms.txt",
      "www",
    ]);
    expect(stablePublic.timeouts).toHaveLength(11);
    expect(stablePublic.timeouts.every((value) => value > 0 && value <= 10_000)).toBe(true);

    const changingHealth = new ProviderPublicSiteFixture({
      healthDigests: new Map([["/", ["a".repeat(64), "b".repeat(64)]]]),
      markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, 20)],
    });
    await expect(wait(outcomeApi([[success], [success], [success]]), changingHealth, 1))
      .rejects.toThrow("public production routes changed during terminal verification");
    const changingRedirect = new ProviderPublicSiteFixture({
      markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, 20)],
      redirectDigests: ["a".repeat(64), "b".repeat(64)],
    });
    await expect(wait(outcomeApi([[success], [success], [success]]), changingRedirect, 1))
      .rejects.toThrow("public production routes changed during terminal verification");
  });

  test("fails promotion closed on comparison, ref, and leased-writer races", async () => {
    const { baseline, baselineDeployment } = await providerReceipts("advanced");
    const mismatchedRunApi = new ProviderApiFixture();
    await expect(promoteWebsiteProduction({
      api: mismatchedRunApi,
      baselineReceipt: baseline,
      releaseWorkflowRunId: "88002",
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("baseline receipt does not bind the verified release coordinate");
    expect(mismatchedRunApi.calls).toHaveLength(0);

    const differentRunReceipt = releaseSourceReceipt({
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
      workflowRunId: "88002",
    });
    const frontRunRelease = new ProviderApiFixture({
      releaseSnapshots: [providerRelease({ body: differentRunReceipt })],
    });
    await expect(promoteWebsiteProduction({
      api: frontRunRelease,
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("exact Actions workflow identity and source receipt");
    expect(frontRunRelease.calls.some((call) => call.startsWith("GIT CAS "))).toBe(false);

    const invalidReleaseRun = new ProviderApiFixture({
      workflowRunSnapshots: [providerReleaseWorkflowRun({ status: "in_progress" })],
    });
    await expect(promoteWebsiteProduction({
      api: invalidReleaseRun,
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).resolves.toMatchObject({ mode: "advanced" });
    expect(invalidReleaseRun.calls.some((call) => call.includes("/actions/runs/"))).toBe(false);

    const tagObjectTarget = new ProviderApiFixture({
      tagSnapshots: [providerTagObjectSha],
    });
    await expect(promoteWebsiteProduction({
      api: tagObjectTarget,
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("tag v0.16.2 moved from the verified release commit");
    expect(tagObjectTarget.calls).toEqual([`GET ${providerTagCommitEndpoint}`]);
    expect(tagObjectTarget.calls.some((call) => call.startsWith("GIT CAS "))).toBe(false);

    const staleLatest = new ProviderApiFixture({
      latestSnapshots: [providerLatest({ tag_name: "v0.16.1" })],
      refSha: providerPreviousSha,
    });
    await expect(promoteWebsiteProduction({
      api: staleLatest,
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("Release v0.16.2 is no longer Latest");
    expect(staleLatest.calls.some((call) => call.startsWith("GIT CAS "))).toBe(false);

    const { commits: _omittedCommits, ...missingCommits } = providerCompare() as Readonly<
      Record<string, ProviderJson>
    >;
    for (const compare of [
      providerCompare({ ahead_by: 0 }),
      providerCompare({ ahead_by: 1.5 }),
      providerCompare({ behind_by: 1 }),
      providerCompare({ status: "diverged" }),
      providerCompare({ base_commit: { sha: "3".repeat(40) } }),
      providerCompare({ merge_base_commit: { sha: "3".repeat(40) } }),
      missingCommits,
      providerCompare({ commits: null }),
      providerCompare({ commits: [] }),
      providerCompare({ commits: [null] }),
      providerCompare({ commits: [{ sha: "A".repeat(40) }] }),
      providerCompare({ commits: [{ sha: "3".repeat(40) }] }),
      null,
    ] as const) {
      const api = new ProviderApiFixture({
        deployments: [[baselineDeployment]],
        statuses: terminalBaselineStatus(),
      });
      api.compare = compare;
      await expect(promoteWebsiteProduction({
        api,
        baselineReceipt: baseline,
        repository: providerRepository,
        verifiedSha: providerVerifiedSha,
        verifiedTag: providerTag,
      })).rejects.toThrow();
      expect(api.calls.some((call) => call.startsWith("GIT CAS "))).toBe(false);
    }

    const refRace = new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      refSnapshots: [providerPreviousSha, "3".repeat(40)],
      statuses: terminalBaselineStatus(),
    });
    await expect(promoteWebsiteProduction({
      api: refRace,
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("moved before promotion");
    expect(refRace.calls.some((call) => call.startsWith("GIT CAS "))).toBe(false);

    const patchFailure = new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      statuses: terminalBaselineStatus(),
    });
    patchFailure.patchError = new Error("simulated leased push race");
    await expect(promoteWebsiteProduction({
      api: patchFailure,
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("simulated leased push race");

    const movedBeforePatch = new ProviderApiFixture({
      defaultBranchShaSnapshots: ["3".repeat(40)],
      deployments: [[baselineDeployment]],
      statuses: terminalBaselineStatus(),
    });
    await expect(promoteWebsiteProduction({
      api: movedBeforePatch,
      baselineReceipt: baseline,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).resolves.toMatchObject({ mode: "advanced" });
    expect(movedBeforePatch.calls.filter((call) => call.startsWith("GIT CAS "))).toHaveLength(1);

    const movedAfterPatch = new ProviderApiFixture({
      defaultBranchShaSnapshots: [providerVerifiedSha, "3".repeat(40)],
      deployments: [[baselineDeployment]],
      statuses: terminalBaselineStatus(),
    });
    await expect(promoteWebsiteProduction({
      api: movedAfterPatch,
      baselineReceipt: baseline,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).resolves.toMatchObject({ mode: "advanced" });
    expect(movedAfterPatch.calls.filter((call) => call.startsWith("GIT CAS "))).toHaveLength(1);

    const alreadyExact = await providerReceipts("already-exact");
    const alreadyExactSourceDrift = new ProviderApiFixture({
      defaultBranchShaSnapshots: ["3".repeat(40)],
      refSha: providerVerifiedSha,
      serverDates: [providerPromotionServerDate],
    });
    await expect(promoteWebsiteProduction({
      api: alreadyExactSourceDrift,
      baselineReceipt: alreadyExact.baseline,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).resolves.toMatchObject({ mode: "already-exact" });
    const alreadyExactTerminalRefRead = alreadyExactSourceDrift.calls.lastIndexOf(
      `GET /repos/${providerRepository}/git/ref/heads/website-production`,
    );
    const alreadyExactSourceRead = alreadyExactSourceDrift.calls.indexOf(
      `GET /repos/${providerRepository}`,
    );
    expect(alreadyExactTerminalRefRead).toBeGreaterThanOrEqual(0);
    expect(alreadyExactSourceRead).toBeGreaterThan(alreadyExactTerminalRefRead);
    expect(alreadyExactSourceDrift.calls.some((call) => call.startsWith("GIT CAS "))).toBe(false);

    for (const sourceCompare of [
      providerCompare({ status: "diverged" }),
      providerCompare({ behind_by: 1 }),
      providerCompare({ base_commit: { sha: "9".repeat(40) } }),
      providerCompare({ merge_base_commit: { sha: "9".repeat(40) } }),
      providerCompare({ commits: [] }),
    ] as const) {
      const invalidSourceAncestry = new ProviderApiFixture({
        defaultBranchShaSnapshots: ["3".repeat(40)],
        deployments: [[baselineDeployment]],
        sourceCompare,
        statuses: terminalBaselineStatus(),
      });
      await expect(promoteWebsiteProduction({
        api: invalidSourceAncestry,
        baselineReceipt: baseline,
        defaultBranch: "main",
        eventName: "workflow_dispatch",
        recoveryWorkflowSha: providerVerifiedSha,
        repository: providerRepository,
        verifiedSha: providerVerifiedSha,
        verifiedTag: providerTag,
      })).rejects.toThrow();
      expect(invalidSourceAncestry.calls.some((call) => call.startsWith("GIT CAS "))).toBe(false);
    }

    const sourceRollback = new ProviderApiFixture({
      defaultBranchShaSnapshots: ["3".repeat(40), providerVerifiedSha],
      deployments: [[baselineDeployment]],
      sourceCompareSnapshots: [
        providerCompare({
          base_commit: { sha: providerVerifiedSha },
          commits: [{ sha: "3".repeat(40) }],
          merge_base_commit: { sha: providerVerifiedSha },
        }),
        providerCompare({
          base_commit: { sha: "3".repeat(40) },
          commits: [{ sha: providerVerifiedSha }],
          merge_base_commit: { sha: "3".repeat(40) },
          status: "behind",
        }),
      ],
      statuses: terminalBaselineStatus(),
    });
    await expect(promoteWebsiteProduction({
      api: sourceRollback,
      baselineReceipt: baseline,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      recoveryWorkflowSha: providerVerifiedSha,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("main sandwich does not preserve protected linear ancestry");
    expect(sourceRollback.calls.some((call) => call.startsWith("GIT CAS "))).toBe(false);

    const postPatchMismatch = new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      refSnapshots: [providerPreviousSha, providerPreviousSha, providerPreviousSha],
      statuses: terminalBaselineStatus(),
    });
    await expect(promoteWebsiteProduction({
      api: postPatchMismatch,
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("after promotion");
    expect(postPatchMismatch.calls.filter((call) => call.startsWith("GIT CAS "))).toHaveLength(1);

    const missingRef = new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      refValues: [null],
      statuses: terminalBaselineStatus(),
    });
    await expect(promoteWebsiteProduction({
      api: missingRef,
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("is not an object");
    expect(missingRef.calls.some((call) => call.startsWith("GIT CAS "))).toBe(false);

    await expect(promoteWebsiteProduction({
      api: new ProviderApiFixture({
        deployments: [[baselineDeployment]],
        serverDates: [providerReleasePublishedAt.replace("Z", ".000Z")],
        statuses: terminalBaselineStatus(),
      }),
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("promotion boundary");

    const readToWriteRace = new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      serverDates: ["2026-08-29T15:02:00.000Z"],
      statuses: terminalBaselineStatus(),
    });
    const racePromotion = await promoteWebsiteProduction({
      api: readToWriteRace,
      baselineReceipt: baseline,
      repository: providerRepository,
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    }) as ProviderJson;
    expect((racePromotion as Readonly<Record<string, ProviderJson>>).boundaryAt)
      .toBe("2026-08-29T15:02:00.000Z");
    const prePatchDeployment = providerDeployment(20, "2026-08-29T15:02:00Z");
    await expect(waitForProviderOutcome({
      api: new ProviderApiFixture({
        deployments: [[prePatchDeployment, baselineDeployment]],
        refSha: providerVerifiedSha,
        statuses: new Map([
          [10, [[providerStatus(100, "success", "2026-08-29T13:01:00Z")]]],
          [20, [[providerStatus(201, "success", "2026-08-29T15:03:00Z", {}, 20)]]],
        ]),
      }),
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: racePromotion,
      sleep: async () => {},
    })).rejects.toThrow("concurrent promotion gap");

  });

  test("waits from pending to one twice-confirmed exact Vercel Production success", async () => {
    const { baseline, baselineDeployment, promotion } = await providerReceipts("advanced");
    const candidate = providerDeployment(20, "2026-08-29T15:02:00Z");
    const candidateAt = "2026-08-29T15:02:00Z";
    const successAt = "2026-08-29T15:03:00Z";
    const pending = providerStatus(200, "pending", "2026-08-29T15:02:30Z", {}, 20);
    const success = providerStatus(201, "success", successAt, {}, 20);
    const api = new ProviderApiFixture({
      deployments: [
        [candidate, baselineDeployment],
        [candidate, baselineDeployment],
        [candidate, baselineDeployment],
      ],
      refSha: providerVerifiedSha,
      statuses: new Map([
        [10, [
          [providerStatus(100, "success", "2026-08-29T13:01:00Z")],
          [providerStatus(100, "success", "2026-08-29T13:01:00Z")],
        ]],
        [20, [[pending], [success, pending], [success, pending]]],
      ]),
    });
    const result = await waitForProviderOutcome({
      api,
      baselineReceipt: baseline,
      maxPolls: 4,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      sleep: async () => {},
    });
    expect(result).toEqual({ deploymentId: 20, statusId: 201 });
    expect(api.graphqlCalls).toHaveLength(5);
    expect(api.calls.filter((call) => call.includes("/deployments/20/statuses?"))).toHaveLength(30);
    expect(api.calls.filter((call) => call === `GET /repos/${providerRepository}/deployments/20`))
      .toHaveLength(4);

    const baselineStatus = providerStatus(100, "success", "2026-08-29T13:01:00Z");
    const baselineGraph = graphqlDeploymentFromRest(baselineDeployment, [baselineStatus]);
    const pendingGraph = graphqlDeploymentFromRest(candidate, [pending]);
    const successGraph = graphqlDeploymentFromRest(candidate, [success, pending]);
    const graphLagApi = new ProviderApiFixture({
      deployments: [[candidate, baselineDeployment]],
      graphqlDeployments: [
        [pendingGraph, baselineGraph],
        [successGraph, baselineGraph],
        [successGraph, baselineGraph],
        [successGraph, baselineGraph],
      ],
      refSha: providerVerifiedSha,
      statuses: new Map([
        [10, [[baselineStatus]]],
        [20, [
          [success, pending],
          [success, pending],
          [success, pending],
          [success, pending],
        ]],
      ]),
    });
    await expect(waitForProviderOutcome({
      api: graphLagApi,
      baselineReceipt: baseline,
      maxPolls: 2,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      sleep: async () => {},
    })).resolves.toEqual({ deploymentId: 20, statusId: 201 });
    expect(graphLagApi.graphqlCalls).toHaveLength(4);
    expect(graphLagApi.calls.filter(
      (call) => call === `GET /repos/${providerRepository}/releases/latest`,
    )).toHaveLength(4);

    const staleGraphApi = new ProviderApiFixture({
      deployments: [[candidate, baselineDeployment]],
      graphqlDeployments: [[successGraph, baselineGraph]],
      refSha: providerVerifiedSha,
      statuses: new Map([[20, [[
        providerStatus(202, "pending", "2026-08-29T15:03:01Z", {}, 20),
        success,
      ]]]]),
    });
    await expect(waitForProviderOutcome({
      api: staleGraphApi,
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      sleep: async () => {},
    })).rejects.toThrow("poll budget exhausted");

    const staleGraphFailureApi = new ProviderApiFixture({
      deployments: [[candidate, baselineDeployment]],
      graphqlDeployments: [[successGraph, baselineGraph]],
      refSha: providerVerifiedSha,
      statuses: new Map([[20, [[
        providerStatus(202, "failure", "2026-08-29T15:03:01Z", {}, 20),
        success,
      ]]]]),
    });
    await expect(waitForProviderOutcome({
      api: staleGraphFailureApi,
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      sleep: async () => {},
    })).rejects.toThrow("ended in failure");

    const confirmationRegressionApi = new ProviderApiFixture({
      deployments: [[candidate, baselineDeployment]],
      graphqlDeployments: [
        [successGraph, baselineGraph],
        [pendingGraph, baselineGraph],
      ],
      refSha: providerVerifiedSha,
      statuses: new Map([[20, [[success], [success]]]]),
    });
    await expect(waitForProviderOutcome({
      api: confirmationRegressionApi,
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      sleep: async () => {},
    })).rejects.toThrow("regressed during success confirmation");

    for (const state of ["error", "failure", "inactive"] as const) {
      const failed = providerStatus(300, state, successAt, {}, 20);
      const graphFailureApi = new ProviderApiFixture({
        deployments: [[candidate, baselineDeployment]],
        graphqlDeployments: [[
          graphqlDeploymentFromRest(candidate, [failed]),
          baselineGraph,
        ]],
        refSha: providerVerifiedSha,
        statuses: new Map([[20, [[success]]]]),
      });
      await expect(waitForProviderOutcome({
        api: graphFailureApi,
        baselineReceipt: baseline,
        maxPolls: 1,
        pollIntervalMilliseconds: 0,
        promotionReceipt: promotion,
        sleep: async () => {},
      })).rejects.toThrow(`ended in ${state}`);
    }

    for (const state of ["error", "failure", "inactive"] as const) {
      const historicalFailure = providerStatus(
        199,
        state,
        "2026-08-29T15:02:45Z",
        {},
        20,
      );
      const pollHistoryApi = new ProviderApiFixture({
        deployments: [[candidate, baselineDeployment]],
        graphqlDeployments: [[successGraph, baselineGraph]],
        refSha: providerVerifiedSha,
        statuses: new Map([[20, [[success, historicalFailure]]]]),
      });
      await expect(waitForProviderOutcome({
        api: pollHistoryApi,
        baselineReceipt: baseline,
        maxPolls: 1,
        pollIntervalMilliseconds: 0,
        promotionReceipt: promotion,
        sleep: async () => {},
      })).rejects.toThrow(`ended in ${state}`);

      const firstConfirmationHistoryApi = new ProviderApiFixture({
        deployments: [[candidate, baselineDeployment]],
        refSha: providerVerifiedSha,
        statuses: new Map([
          [10, [[baselineStatus]]],
          [20, [[success], [success, historicalFailure]]],
        ]),
      });
      await expect(waitForProviderOutcome({
        api: firstConfirmationHistoryApi,
        baselineReceipt: baseline,
        maxPolls: 1,
        pollIntervalMilliseconds: 0,
        promotionReceipt: promotion,
        sleep: async () => {},
      })).rejects.toThrow(`ended in ${state}`);

      const finalConfirmationHistoryApi = new ProviderApiFixture({
        deployments: [[candidate, baselineDeployment]],
        refSha: providerVerifiedSha,
        statuses: new Map([
          [10, [[baselineStatus]]],
          [20, [
            [success],
            [success],
            [success, historicalFailure],
          ]],
        ]),
      });
      await expect(waitForProviderOutcome({
        api: finalConfirmationHistoryApi,
        baselineReceipt: baseline,
        maxPolls: 1,
        pollIntervalMilliseconds: 0,
        promotionReceipt: promotion,
        sleep: async () => {},
      })).rejects.toThrow(`ended in ${state}`);
    }

    const successGraphRecord = successGraph as Readonly<Record<string, ProviderJson>>;
    const successGraphStatus = successGraphRecord.latestStatus as Readonly<
      Record<string, ProviderJson>
    >;
    for (const latestStatus of [
      { ...successGraphStatus, id: "different-status-node" },
      {
        ...successGraphStatus,
        createdAt: "2026-08-29T15:02:59Z",
        updatedAt: "2026-08-29T15:02:59Z",
      },
      {
        ...successGraphStatus,
        creator: { __typename: "Bot", databaseId: 1, login: "vercel" },
      },
      {
        ...successGraphStatus,
        environmentUrl: "https://wrench-other-hraness.vercel.app",
        logUrl: "https://wrench-other-hraness.vercel.app",
      },
    ] as const) {
      const disagreementApi = new ProviderApiFixture({
        deployments: [[candidate, baselineDeployment]],
        graphqlDeployments: [[
          providerGraphqlDeployment(20, candidateAt, {
            latestStatus,
            updatedAt: successAt,
          }),
          baselineGraph,
        ]],
        refSha: providerVerifiedSha,
        statuses: new Map([[20, [[success]]]]),
      });
      await expect(waitForProviderOutcome({
        api: disagreementApi,
        baselineReceipt: baseline,
        maxPolls: 1,
        pollIntervalMilliseconds: 0,
        promotionReceipt: promotion,
        sleep: async () => {},
      })).rejects.toThrow();
    }

    const recovery = await providerReceipts("already-exact");
    const recoveryApi = new ProviderApiFixture({
      deployments: [[recovery.baselineDeployment]],
      refSha: providerVerifiedSha,
      statuses: new Map([
        [10, [[
          providerStatus(100, "success", "2026-08-29T14:06:00Z"),
        ]]],
      ]),
    });
    await expect(waitForProviderOutcome({
      api: recoveryApi,
      baselineReceipt: recovery.baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: recovery.promotion,
      sleep: async () => {},
    })).resolves.toEqual({ deploymentId: 10, statusId: 100 });
  });

  test("rejects provider identity, concurrency, timeout, and final-readback failures", async () => {
    const { baseline, baselineDeployment, promotion } = await providerReceipts("advanced");
    const candidateAt = "2026-08-29T15:02:00Z";
    const successAt = "2026-08-29T15:03:00Z";
    const candidateStatus = (
      id: number,
      state: string,
      createdAt: string,
      overrides: Readonly<Record<string, ProviderJson>> = {},
    ): ProviderJson => providerStatus(id, state, createdAt, overrides, 20);
    const waitCase = (
      candidate: ProviderJson,
      statusSnapshots: ProviderJson[][],
      deployments: ProviderJson[][] = [[candidate, baselineDeployment], [candidate, baselineDeployment]],
      refSnapshots: readonly string[] = [],
      tagSnapshots: readonly string[] = [],
      releaseSnapshots: readonly ProviderJson[] = [],
      latestSnapshots: readonly ProviderJson[] = [],
      workflowRunSnapshots: readonly ProviderJson[] = [],
    ): ProviderApiFixture => new ProviderApiFixture({
      deployments,
      latestSnapshots,
      refSha: providerVerifiedSha,
      refSnapshots,
      statuses: new Map([
        [10, [[providerStatus(100, "success", "2026-08-29T13:01:00Z")]]],
        [20, statusSnapshots],
      ]),
      tagSnapshots,
      releaseSnapshots,
      workflowRunSnapshots,
    });
    const run = (api: ProviderApiFixture, maxPolls = 2): Promise<unknown> =>
      waitForProviderOutcome({
        api,
        baselineReceipt: baseline,
        maxPolls,
        pollIntervalMilliseconds: 0,
        promotionReceipt: promotion,
        sleep: async () => {},
      });

    for (const candidate of [
      providerDeployment(20, candidateAt, { sha: "3".repeat(40) }),
      providerDeployment(20, candidateAt, { ref: "website-production" }),
      providerDeployment(20, candidateAt, { ref: providerTag }),
      providerDeployment(20, candidateAt, { ref: "A".repeat(40) }),
      providerDeployment(20, candidateAt, { ref: null }),
      providerDeployment(20, candidateAt, { ref: providerPreviousSha }),
      providerDeployment(20, candidateAt, { task: "other" }),
      providerDeployment(20, candidateAt, { environment: "Preview" }),
      providerDeployment(20, candidateAt, { original_environment: null }),
      providerDeployment(20, candidateAt, {
        creator: { id: 1, login: "vercel[bot]", type: "Bot" },
      }),
      providerDeployment(20, candidateAt, {
        creator: { id: 35613825, login: "other[bot]", type: "Bot" },
      }),
      providerDeployment(20, candidateAt, {
        creator: { id: 35613825, login: "vercel[bot]", type: "User" },
      }),
    ] as const) {
      await expect(run(waitCase(candidate, [[candidateStatus(201, "success", successAt)]])))
        .rejects.toThrow("deployment");
    }

    const gapCandidate = providerDeployment(20, "2026-08-29T15:01:00Z");
    await expect(run(waitCase(gapCandidate, [[candidateStatus(201, "success", successAt)]])))
      .rejects.toThrow("concurrent promotion gap");

    const competing = [
      providerDeployment(21, "2026-08-29T15:02:01Z"),
      providerDeployment(20, candidateAt),
      baselineDeployment,
    ];
    await expect(run(waitCase(
      providerDeployment(20, candidateAt),
      [[candidateStatus(201, "success", successAt)]],
      [competing],
    ))).rejects.toThrow("more than one new Production deployment");

    const noCandidate = new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      refSha: providerVerifiedSha,
      statuses: terminalBaselineStatus(),
    });
    await expect(run(noCandidate, 2)).rejects.toThrow("poll budget exhausted");

    const emptyStatuses = waitCase(providerDeployment(20, candidateAt), [[], []]);
    await expect(run(emptyStatuses, 2)).rejects.toThrow("poll budget exhausted");

    const disappearingStatus = waitCase(providerDeployment(20, candidateAt), [
      [candidateStatus(200, "pending", "2026-08-29T15:02:30Z")],
      [],
    ]);
    await expect(run(disappearingStatus, 2)).rejects.toThrow("statuses disappeared");

    const mutatedStatus = waitCase(providerDeployment(20, candidateAt), [
      [candidateStatus(200, "pending", "2026-08-29T15:02:30Z")],
      [candidateStatus(200, "success", "2026-08-29T15:02:30Z")],
    ]);
    await expect(run(mutatedStatus, 2)).rejects.toThrow("status 200 changed");
    const mutatedStatusUrl = waitCase(providerDeployment(20, candidateAt), [
      [candidateStatus(200, "pending", "2026-08-29T15:02:30Z")],
      [candidateStatus(200, "pending", "2026-08-29T15:02:30Z", {
        environment_url: "https://wrench-alt-hraness.vercel.app",
        log_url: "https://wrench-alt-hraness.vercel.app",
        target_url: "https://wrench-alt-hraness.vercel.app",
      })],
    ]);
    await expect(run(mutatedStatusUrl, 2)).rejects.toThrow("status 200 changed");

    for (const state of ["error", "failure", "inactive"] as const) {
      await expect(run(waitCase(
        providerDeployment(20, candidateAt),
        [[candidateStatus(201, state, successAt)]],
      ))).rejects.toThrow(`ended in ${state}`);
    }

    const switched = waitCase(
      providerDeployment(20, candidateAt),
      [[candidateStatus(200, "pending", "2026-08-29T15:02:30Z")]],
      [
        [providerDeployment(20, candidateAt), baselineDeployment],
        [providerDeployment(21, "2026-08-29T15:02:01Z"), baselineDeployment],
      ],
    );
    await expect(run(switched)).rejects.toThrow();

    const disappeared = waitCase(
      providerDeployment(20, candidateAt),
      [[candidateStatus(200, "pending", "2026-08-29T15:02:30Z")]],
    );
    disappeared.deploymentDetailError = new Error("simulated deployment disappearance");
    await expect(run(disappeared)).rejects.toThrow("simulated deployment disappearance");

    const successRegression = waitCase(
      providerDeployment(20, candidateAt),
      [
        [candidateStatus(201, "success", successAt)],
        [
          candidateStatus(202, "pending", "2026-08-29T15:03:01Z"),
          candidateStatus(201, "success", successAt),
        ],
      ],
    );
    await expect(run(successRegression)).rejects.toThrow("success changed");

    const finalStatusInventoryRace = waitCase(
      providerDeployment(20, candidateAt),
      [
        [
          candidateStatus(201, "success", successAt),
          candidateStatus(200, "pending", "2026-08-29T15:02:30Z"),
        ],
        [
          candidateStatus(201, "success", successAt),
          candidateStatus(200, "pending", "2026-08-29T15:02:30Z"),
        ],
        [
          candidateStatus(201, "success", successAt),
          candidateStatus(200, "pending", "2026-08-29T15:02:30Z"),
          candidateStatus(199, "queued", "2026-08-29T15:02:10Z"),
        ],
      ],
    );
    await expect(run(finalStatusInventoryRace)).rejects.toThrow("success changed");

    const finalInventoryRace = waitCase(
      providerDeployment(20, candidateAt),
      [
        [candidateStatus(201, "success", successAt)],
        [candidateStatus(201, "success", successAt)],
      ],
      [
        [providerDeployment(20, candidateAt), baselineDeployment],
        [providerDeployment(20, candidateAt), baselineDeployment],
        [
          providerDeployment(21, "2026-08-29T15:03:01Z"),
          providerDeployment(20, candidateAt),
          baselineDeployment,
        ],
      ],
    );
    await expect(run(finalInventoryRace)).rejects.toThrow();

    const finalRefRace = waitCase(
      providerDeployment(20, candidateAt),
      [
        [candidateStatus(201, "success", successAt)],
        [candidateStatus(201, "success", successAt)],
      ],
      undefined,
      [providerVerifiedSha, providerVerifiedSha, providerVerifiedSha, "3".repeat(40)],
    );
    await expect(run(finalRefRace)).rejects.toThrow("website-production moved");

    const finalTagRace = waitCase(
      providerDeployment(20, candidateAt),
      [
        [candidateStatus(201, "success", successAt)],
        [candidateStatus(201, "success", successAt)],
      ],
      undefined,
      [],
      [providerVerifiedSha, providerVerifiedSha, providerVerifiedSha, providerTagObjectSha],
    );
    await expect(run(finalTagRace)).rejects.toThrow("tag v0.16.2 moved");

    const finalReleaseRace = waitCase(
      providerDeployment(20, candidateAt),
      [
        [candidateStatus(201, "success", successAt)],
        [candidateStatus(201, "success", successAt)],
      ],
      undefined,
      [],
      [],
      [
        providerRelease(),
        providerRelease(),
        providerRelease(),
        providerRelease({ published_at: "2026-08-29T14:00:01Z" }),
      ],
    );
    await expect(run(finalReleaseRace)).rejects.toThrow("Release identity changed");

    const finalReleaseIdRace = waitCase(
      providerDeployment(20, candidateAt),
      [
        [candidateStatus(201, "success", successAt)],
        [candidateStatus(201, "success", successAt)],
      ],
      undefined,
      [],
      [],
      [
        providerRelease(),
        providerRelease(),
        providerRelease(),
        providerRelease({ id: 11 }),
      ],
    );
    await expect(run(finalReleaseIdRace)).rejects.toThrow("Release identity changed");

    const terminalReleaseRunChange = waitCase(
      providerDeployment(20, candidateAt),
      [
        [candidateStatus(201, "success", successAt)],
        [candidateStatus(201, "success", successAt)],
      ],
      undefined,
      [],
      [],
      [],
      [],
      [
        providerReleaseWorkflowRun(),
        providerReleaseWorkflowRun(),
        providerReleaseWorkflowRun(),
        providerReleaseWorkflowRun({ conclusion: "failure" }),
      ],
    );
    await expect(run(terminalReleaseRunChange))
      .resolves.toEqual({ deploymentId: 20, statusId: 201 });
    expect(terminalReleaseRunChange.calls.some((call) => call.includes("/actions/runs/")))
      .toBe(false);

    const wrongStatusBot = waitCase(
      providerDeployment(20, candidateAt),
      [[candidateStatus(201, "success", successAt, {
        creator: { id: 2, login: "vercel[bot]", type: "Bot" },
      })]],
    );
    await expect(run(wrongStatusBot)).rejects.toThrow("pinned Vercel bot");

    const wrongDeploymentStatusesUrl = waitCase(
      providerDeployment(20, candidateAt, {
        statuses_url: `https://api.github.com/repos/${providerRepository}/deployments/21/statuses`,
      }),
      [[candidateStatus(201, "success", successAt)]],
    );
    await expect(run(wrongDeploymentStatusesUrl)).rejects.toThrow("statuses_url");

    const refBoundCandidate = providerDeployment(20, candidateAt);
    const refDrift = new ProviderApiFixture({
      deploymentDetails: [
        refBoundCandidate,
        providerDeployment(20, candidateAt, { ref: providerPreviousSha }),
      ],
      deployments: [[refBoundCandidate, baselineDeployment]],
      refSha: providerVerifiedSha,
      statuses: new Map([
        [10, [[providerStatus(100, "success", "2026-08-29T13:01:00Z")]]],
        [20, [[candidateStatus(201, "success", successAt)]]],
      ]),
    });
    await expect(run(refDrift, 1)).rejects.toThrow(".ref does not bind its exact SHA");

    const duplicateStatusNodeId = waitCase(
      providerDeployment(20, candidateAt),
      [[
        candidateStatus(201, "success", successAt),
        candidateStatus(200, "pending", "2026-08-29T15:02:30Z", {
          node_id: "status-201",
        }),
      ]],
    );
    await expect(run(duplicateStatusNodeId)).rejects.toThrow("duplicate node id status-201");

    for (const overrides of [
      { deployment_url: `https://api.github.com/repos/${providerRepository}/deployments/21` },
      { environment: "Preview" },
      { environment_url: "http://ghostget-20-hraness.vercel.app" },
      { environment_url: "https://wrench-20-hraness.vercel.app/" },
      { log_url: "https://wrench-other-hraness.vercel.app" },
      { target_url: "https://wrench-other-hraness.vercel.app" },
    ] as const) {
      await expect(run(waitCase(
        providerDeployment(20, candidateAt),
        [[candidateStatus(201, "success", successAt, overrides)]],
      ))).rejects.toThrow();
    }

    const tiedStatusSecond = waitCase(providerDeployment(20, candidateAt), [[
      candidateStatus(202, "success", successAt),
      candidateStatus(201, "pending", successAt),
    ]]);
    await expect(run(tiedStatusSecond)).resolves.toEqual({ deploymentId: 20, statusId: 202 });

    const initialLatestRace = waitCase(
      providerDeployment(20, candidateAt),
      [[candidateStatus(201, "success", successAt)]],
      undefined,
      [],
      [],
      [],
      [providerLatest({ tag_name: "v0.16.1" })],
    );
    await expect(run(initialLatestRace)).rejects.toThrow("Release v0.16.2 is no longer Latest");

    const decisiveLatestRace = waitCase(
      providerDeployment(20, candidateAt),
      [[candidateStatus(201, "success", successAt)]],
      undefined,
      [],
      [],
      [],
      [providerLatest(), providerLatest({ tag_name: "v0.16.1" })],
    );
    await expect(run(decisiveLatestRace)).rejects.toThrow("Release v0.16.2 is no longer Latest");

    const terminalLatestRace = waitCase(
      providerDeployment(20, candidateAt),
      [
        [candidateStatus(201, "success", successAt)],
        [candidateStatus(201, "success", successAt)],
        [candidateStatus(201, "success", successAt)],
      ],
      undefined,
      [],
      [],
      [],
      [
        providerLatest(),
        providerLatest(),
        providerLatest(),
        providerLatest({ tag_name: "v0.16.1" }),
      ],
    );
    await expect(run(terminalLatestRace)).rejects.toThrow("Release v0.16.2 is no longer Latest");

    await expect(waitForProviderOutcomeRaw({
      api: new ProviderApiFixture({ defaultBranchSnapshots: ["main", "release"] }),
      baselineReceipt: baseline,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      recoveryWorkflowSha: providerVerifiedSha,
      sleep: async () => {},
      ...providerAuthority,
    })).rejects.toThrow("default branch moved during source verification");

    const recoverySourceShaRace = new ProviderApiFixture({
      defaultBranchShaSnapshots: [providerVerifiedSha, "3".repeat(40)],
      deployments: [[providerDeployment(20, candidateAt), baselineDeployment]],
      refSha: providerVerifiedSha,
      statuses: new Map([
        [10, [[providerStatus(100, "success", "2026-08-29T13:01:00Z")]]],
        [20, [
          [candidateStatus(201, "success", successAt)],
          [candidateStatus(201, "success", successAt)],
          [candidateStatus(201, "success", successAt)],
        ]],
      ]),
    });
    await expect(waitForProviderOutcomeRaw({
      api: recoverySourceShaRace,
      baselineReceipt: baseline,
      defaultBranch: "main",
      eventName: "workflow_dispatch",
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      publicSite: new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, 20)],
      }),
      recoveryWorkflowSha: providerVerifiedSha,
      sleep: async () => {},
      ...providerAuthority,
    })).resolves.toBeDefined();

    const wrongMode = {
      ...(promotion as Readonly<Record<string, ProviderJson>>),
      mode: "already-exact",
    };
    await expect(waitForProviderOutcome({
      api: new ProviderApiFixture(),
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: wrongMode,
      sleep: async () => {},
    })).rejects.toThrow("releaseAppRevocation contradicts its mode");
    const wrongTransition = {
      ...(promotion as Readonly<Record<string, ProviderJson>>),
      mode: "already-exact",
      releaseAppRevocation: null,
    };
    await expect(waitForProviderOutcome({
      api: new ProviderApiFixture(),
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: wrongTransition,
      sleep: async () => {},
    })).rejects.toThrow("promotion receipt mode contradicts the recorded ref transition");
    const immediateRevocation = {
      ...(promotion as Readonly<Record<string, ProviderJson>>),
      releaseAppRevocation: {
        ...providerReleaseAppRevocation,
        observationCount: 2,
        propagationObserved: false,
      },
    };
    await expect(waitForProviderOutcome({
      api: waitCase(
        providerDeployment(20, candidateAt),
        [[candidateStatus(201, "success", successAt)]],
      ),
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: immediateRevocation,
      sleep: async () => {},
    })).resolves.toEqual({ deploymentId: 20, statusId: 201 });
    const missingRevocation = {
      ...(promotion as Readonly<Record<string, ProviderJson>>),
    } as Record<string, ProviderJson>;
    delete missingRevocation.releaseAppRevocation;
    await expect(waitForProviderOutcome({
      api: new ProviderApiFixture(),
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: missingRevocation,
      sleep: async () => {},
    })).rejects.toThrow("promotion receipt has an unexpected shape");
    for (const releaseAppRevocation of [
      null,
      { ...providerReleaseAppRevocation, converged: false },
      { ...providerReleaseAppRevocation, observationCount: 2 },
      { ...providerReleaseAppRevocation, observationCount: 11 },
      { ...providerReleaseAppRevocation, propagationObserved: false },
      { ...providerReleaseAppRevocation, stableDenials: 1 },
      { ...providerReleaseAppRevocation, extra: true },
    ] as const) {
      await expect(waitForProviderOutcome({
        api: new ProviderApiFixture(),
        baselineReceipt: baseline,
        maxPolls: 1,
        pollIntervalMilliseconds: 0,
        promotionReceipt: {
          ...(promotion as Readonly<Record<string, ProviderJson>>),
          releaseAppRevocation,
        },
        sleep: async () => {},
      })).rejects.toThrow("promotion receipt releaseAppRevocation");
    }
    const invalidReleaseId = {
      ...(promotion as Readonly<Record<string, ProviderJson>>),
      releaseId: 0,
    };
    await expect(waitForProviderOutcome({
      api: new ProviderApiFixture(),
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: invalidReleaseId,
      sleep: async () => {},
    })).rejects.toThrow("promotion receipt releaseId");
    const mismatchedPromotionRun = {
      ...(promotion as Readonly<Record<string, ProviderJson>>),
      releaseWorkflowRunId: "88002",
    };
    await expect(waitForProviderOutcome({
      api: new ProviderApiFixture(),
      baselineReceipt: baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: mismatchedPromotionRun,
      sleep: async () => {},
    })).rejects.toThrow("provider receipts do not bind one release transition");
    const authoritativeRunMismatchApi = new ProviderApiFixture();
    await expect(waitForProviderOutcomeRaw({
      api: authoritativeRunMismatchApi,
      baselineReceipt: baseline,
      defaultBranch: "main",
      eventName: "push",
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      recoveryWorkflowSha: "",
      releaseWorkflowRunId: "88002",
      repository: providerRepository,
      sleep: async () => {},
      verifiedSha: providerVerifiedSha,
      verifiedTag: providerTag,
    })).rejects.toThrow("authoritative release inputs");
    expect(authoritativeRunMismatchApi.calls).toHaveLength(0);
    const tamperedBaseline = {
      ...(baseline as Readonly<Record<string, ProviderJson>>),
      completedAt: "2026-08-29T15:00:00.600Z",
    };
    await expect(waitForProviderOutcome({
      api: new ProviderApiFixture(),
      baselineReceipt: tamperedBaseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: promotion,
      sleep: async () => {},
    })).rejects.toThrow("does not bind the baseline receipt");

    for (const authority of [
      { repository: "hraness/other", verifiedSha: providerVerifiedSha, verifiedTag: providerTag },
      { repository: providerRepository, verifiedSha: "3".repeat(40), verifiedTag: providerTag },
      { repository: providerRepository, verifiedSha: providerVerifiedSha, verifiedTag: "v9.9.9" },
    ] as const) {
      const api = new ProviderApiFixture();
      await expect(waitForProviderOutcomeRaw({
        api,
        baselineReceipt: baseline,
        maxPolls: 1,
        pollIntervalMilliseconds: 0,
        promotionReceipt: promotion,
        releaseWorkflowRunId: providerReleaseWorkflowRunId,
        sleep: async () => {},
        ...authority,
      })).rejects.toThrow("authoritative release inputs");
      expect(api.calls).toHaveLength(0);
    }
  });

  test("enforces one half-open monotonic 20-minute provider observation deadline", async () => {
    const { baseline, baselineDeployment, promotion } = await providerReceipts("advanced");
    const candidateAt = "2026-08-29T15:02:00Z";
    const successAt = "2026-08-29T15:03:00Z";
    const candidate = providerDeployment(20, candidateAt);
    const success = providerStatus(201, "success", successAt, {}, 20);
    const noCandidate = (
      readHook?: (timeoutMilliseconds: number | undefined) => void,
    ): ProviderApiFixture => new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      readHook,
      refSha: providerVerifiedSha,
      statuses: terminalBaselineStatus(),
    });
    const successCase = (
      readHook?: (timeoutMilliseconds: number | undefined) => void,
    ): ProviderApiFixture => new ProviderApiFixture({
      deployments: [[candidate, baselineDeployment]],
      readHook,
      refSha: providerVerifiedSha,
      statuses: new Map([
        [10, [[providerStatus(100, "success", "2026-08-29T13:01:00Z")]]],
        [20, [[success], [success], [success]]],
      ]),
    });
    const run = (
      api: ProviderApiFixture,
      monotonicNow: () => number,
      sleep: (milliseconds: number) => Promise<void>,
      maxPolls = 20,
      pollIntervalMilliseconds = 60_000,
    ): Promise<unknown> => waitForProviderOutcome({
      api,
      baselineReceipt: baseline,
      maxPolls,
      monotonicNow,
      pollIntervalMilliseconds,
      promotionReceipt: promotion,
      publicSite: new ProviderPublicSiteFixture({
        markerSnapshots: [providerMarker(providerVerifiedSha, providerTag, 20)],
        readHook: (timeoutMilliseconds) => api.readHook?.(timeoutMilliseconds),
      }),
      sleep,
    });

    let now = 0;
    const expectedPartialSleepRequests = [59_997, 29_999, 15_000];
    expect(expectedPartialSleepRequests).toHaveLength(3);
    const sleepThroughThreePartialWakeups = (
      requests: number[],
    ): ((milliseconds: number) => Promise<void>) => async (milliseconds) => {
      requests.push(milliseconds);
      const phase = (requests.length - 1) % 3;
      now += phase === 2 ? milliseconds : Math.floor(milliseconds / 2);
    };
    const partialSleeps: number[] = [];
    const fullWindowApi = noCandidate((timeoutMilliseconds) => {
      if (timeoutMilliseconds !== undefined) now += 1;
    });
    await expect(run(
      fullWindowApi,
      () => now,
      sleepThroughThreePartialWakeups(partialSleeps),
    )).rejects.toThrow("timed out waiting for the exact Vercel Production deployment");
    expect(partialSleeps).toEqual(
      Array.from({ length: 20 }, () => expectedPartialSleepRequests).flat(),
    );
    expect(now).toBe(1_200_000);
    expect(fullWindowApi.graphqlCalls).toHaveLength(20);
    expect(fullWindowApi.timeoutMilliseconds).toHaveLength(40);
    expect(fullWindowApi.timeoutMilliseconds.slice(-2)).toEqual([60_000, 59_999]);

    now = 0;
    const tailSleeps: number[] = [];
    const latencyApi = noCandidate((timeoutMilliseconds) => {
      if (timeoutMilliseconds !== undefined) now += 11_000;
    });
    await expect(run(
      latencyApi,
      () => now,
      async (milliseconds) => {
        tailSleeps.push(milliseconds);
        now += milliseconds;
      },
    )).rejects.toThrow("timed out waiting for the exact Vercel Production deployment");
    expect(tailSleeps).toEqual(Array.from({ length: 20 }, () => 27_000));
    expect(latencyApi.graphqlCalls).toHaveLength(20);
    expect(now).toBe(1_200_000);

    now = 0;
    let boundaryRead = 0;
    let boundarySamples = 0;
    const successGithubReads = 36;
    const successPublicReads = 11;
    const successExternalReads = successGithubReads + successPublicReads;
    const exactBoundaryApi = successCase((timeoutMilliseconds) => {
      if (timeoutMilliseconds === undefined) return;
      boundaryRead += 1;
      now = boundaryRead === successExternalReads
        ? 1_200_000
        : Math.floor(1_199_999 * boundaryRead / (successExternalReads - 1));
    });
    await expect(run(exactBoundaryApi, () => {
      if (now !== 1_200_000) return now;
      boundarySamples += 1;
      return boundarySamples === 1 ? now : now + 0.001;
    }, async () => {}))
      .resolves.toEqual({ deploymentId: 20, statusId: 201 });
    expect(now).toBe(1_200_000);
    expect(boundaryRead).toBe(successExternalReads);
    expect(boundarySamples).toBe(1);
    expect(exactBoundaryApi.timeoutMilliseconds).toHaveLength(successGithubReads);
    expect(exactBoundaryApi.timeoutMilliseconds.at(-1)).toBe(1);

    now = 0;
    const lateSleeps: number[] = [];
    const lateCandidateApi = new ProviderApiFixture({
      deployments: [
        ...Array.from({ length: 19 }, () => [baselineDeployment]),
        [candidate, baselineDeployment],
      ],
      readHook: (timeoutMilliseconds) => {
        if (timeoutMilliseconds !== undefined) now += 1;
      },
      refSha: providerVerifiedSha,
      statuses: new Map([
        [10, [[providerStatus(100, "success", "2026-08-29T13:01:00Z")]]],
        [20, [[success], [success], [success]]],
      ]),
    });
    await expect(run(
      lateCandidateApi,
      () => now,
      sleepThroughThreePartialWakeups(lateSleeps),
    )).resolves.toEqual({ deploymentId: 20, statusId: 201 });
    expect(lateSleeps).toEqual(
      Array.from({ length: 19 }, () => expectedPartialSleepRequests).flat(),
    );
    expect(now).toBe(1_140_047);
    expect(lateCandidateApi.graphqlCalls).toHaveLength(22);

    now = 0;
    const frozenSuccessApi = successCase();
    await expect(run(frozenSuccessApi, () => now, async () => {}))
      .rejects.toThrow("did not advance the provider monotonic clock");
    expect(frozenSuccessApi.timeoutMilliseconds).toHaveLength(1);

    now = 0;
    const afterBoundaryApi = successCase((timeoutMilliseconds) => {
      if (timeoutMilliseconds !== undefined) now = 1_200_001;
    });
    await expect(run(afterBoundaryApi, () => now, async () => {}))
      .rejects.toThrow("timed out waiting for the exact Vercel Production deployment");
    expect(afterBoundaryApi.timeoutMilliseconds).toHaveLength(1);

    let subMillisecondRead = 0;
    const subMillisecondApi = noCandidate();
    await expect(run(
      subMillisecondApi,
      () => subMillisecondRead++ === 0 ? 0 : 1_199_999.5,
      async () => {},
    )).rejects.toThrow("timed out waiting for the exact Vercel Production deployment");
    expect(subMillisecondApi.timeoutMilliseconds).toHaveLength(0);
    expect(subMillisecondApi.graphqlCalls).toHaveLength(0);

    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1] as const) {
      await expect(run(noCandidate(), () => invalid, async () => {}))
        .rejects.toThrow("finite nonnegative monotonic timestamp");
    }
    await expect(run(noCandidate(), () => Number.MAX_SAFE_INTEGER, async () => {}))
      .rejects.toThrow("deadline overflows");

    let read = 0;
    await expect(run(
      noCandidate(),
      () => read++ === 0 ? 100 : 99,
      async () => {},
    )).rejects.toThrow("monotonic clock regressed");

    now = 0;
    const stuckSleeps: number[] = [];
    const stuckApi = noCandidate((timeoutMilliseconds) => {
      if (timeoutMilliseconds !== undefined) now += 1;
    });
    await expect(run(
      stuckApi,
      () => now,
      async (milliseconds) => {
        stuckSleeps.push(milliseconds);
        if (stuckSleeps.length === 1) now += 1;
      },
    )).rejects.toThrow("poll sleep did not reach its monotonic schedule");
    expect(stuckSleeps).toHaveLength(16);
    expect(stuckApi.graphqlCalls).toHaveLength(1);

    now = 0;
    const reducedSleeps: number[] = [];
    const reducedApi = noCandidate((timeoutMilliseconds) => {
      if (timeoutMilliseconds !== undefined) now += 1;
    });
    await expect(run(
      reducedApi,
      () => now,
      async (milliseconds) => {
        reducedSleeps.push(milliseconds);
      },
      1,
    ))
      .rejects.toThrow("poll budget exhausted before its monotonic deadline");
    expect(reducedSleeps).toHaveLength(0);
    expect(reducedApi.graphqlCalls).toHaveLength(1);

    now = 0;
    const immediateSleeps: number[] = [];
    const immediateApi = noCandidate((timeoutMilliseconds) => {
      if (timeoutMilliseconds !== undefined) now += 1;
    });
    await expect(run(
      immediateApi,
      () => now,
      async (milliseconds) => {
        immediateSleeps.push(milliseconds);
      },
      20,
      0,
    )).rejects.toThrow("test cadence exhausted before its monotonic deadline");
    expect(immediateSleeps).toHaveLength(0);
    expect(immediateApi.graphqlCalls).toHaveLength(20);
    expect(immediateApi.timeoutMilliseconds).toHaveLength(40);
    expect(now).toBe(60);
  });

  test("fails recovery closed on stale success, latest ties, or newer deployments", async () => {
    const recovery = await providerReceipts("already-exact");
    const baselineDeployment = recovery.baselineDeployment;

    const baselineStatusDriftGraph = providerGraphqlDeployment(
      10,
      "2026-08-29T14:05:00Z",
      {
        latestStatus: {
          createdAt: "2026-08-29T14:06:00Z",
          creator: { __typename: "Bot", databaseId: 35613825, login: "vercel" },
          environment: "Production",
          environmentUrl: "https://wrench-10-hraness.vercel.app",
          id: "status-99",
          logUrl: "https://wrench-10-hraness.vercel.app",
          state: "SUCCESS",
          updatedAt: "2026-08-29T14:06:00Z",
        },
        updatedAt: "2026-08-29T14:06:00Z",
      },
    );
    const baselineStatusDrift = new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      graphqlDeployments: [[baselineStatusDriftGraph]],
      refSha: providerVerifiedSha,
      statuses: new Map([[10, [[
        providerStatus(100, "success", "2026-08-29T14:06:00Z"),
        providerStatus(99, "pending", "2026-08-29T14:05:30Z"),
      ]]]]),
    });
    await expect(waitForProviderOutcome({
      api: baselineStatusDrift,
      baselineReceipt: recovery.baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: recovery.promotion,
      sleep: async () => {},
    })).rejects.toThrow("baseline Production deployment disappeared or changed");

    const recoveryReceiptsFor = async (
      deployments: ProviderJson[],
      statuses: Map<number, ProviderJson[][]>,
    ): Promise<Readonly<{ baseline: ProviderJson; promotion: ProviderJson }>> => {
      const baseline = await createProviderBaseline({
        api: new ProviderApiFixture({
          deployments: [deployments],
          refSha: providerVerifiedSha,
          serverDates: [providerBaselineServerDate, providerBaselineServerDate],
          statuses,
        }),
        repository: providerRepository,
        verifiedSha: providerVerifiedSha,
      }) as ProviderJson;
      const promotion = await promoteWebsiteProduction({
        api: new ProviderApiFixture({
          deployments: [deployments],
          refSha: providerVerifiedSha,
          serverDates: [providerPromotionServerDate],
          statuses,
        }),
        baselineReceipt: baseline,
        repository: providerRepository,
        verifiedSha: providerVerifiedSha,
        verifiedTag: providerTag,
      }) as ProviderJson;
      return Object.freeze({ baseline, promotion });
    };

    const staleDeployment = providerDeployment(10, "2026-08-29T13:59:59Z");
    const staleStatuses = terminalBaselineStatus(10, "2026-08-29T14:00:01Z");
    const stale = await recoveryReceiptsFor([staleDeployment], staleStatuses);
    const staleApi = new ProviderApiFixture({
      deployments: [[staleDeployment]],
      refSha: providerVerifiedSha,
      statuses: staleStatuses,
    });
    await expect(waitForProviderOutcome({
      api: staleApi,
      baselineReceipt: stale.baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: stale.promotion,
      sleep: async () => {},
    })).rejects.toThrow("does not postdate the immutable Release");

    const tiedOlderId = providerDeployment(10, "2026-08-29T14:05:00Z");
    const tiedNewerId = providerDeployment(11, "2026-08-29T14:05:00Z");
    const tiedStatuses = new Map<number, ProviderJson[][]>([
      [10, [[providerStatus(100, "success", "2026-08-29T14:06:00Z")]]],
      [11, [[providerStatus(101, "success", "2026-08-29T14:06:00Z", {}, 11)]]],
    ]);
    await expect(recoveryReceiptsFor(
      [tiedOlderId, tiedNewerId],
      tiedStatuses,
    )).rejects.toThrow("ambiguous at second precision");

    const olderVerified = providerDeployment(10, "2026-08-29T14:05:00Z");
    const newerWrongSha = providerDeployment(11, "2026-08-29T14:07:00Z", {
      sha: providerPreviousSha,
    });
    const wrongNewestStatuses = new Map<number, ProviderJson[][]>([
      [10, [[providerStatus(100, "success", "2026-08-29T14:06:00Z")]]],
      [11, [[providerStatus(101, "success", "2026-08-29T14:08:00Z", {}, 11)]]],
    ]);
    const wrongNewestReceipts = await recoveryReceiptsFor(
      [olderVerified, newerWrongSha],
      wrongNewestStatuses,
    );
    await expect(waitForProviderOutcome({
      api: new ProviderApiFixture({
        deployments: [[olderVerified, newerWrongSha]],
        refSha: providerVerifiedSha,
        statuses: wrongNewestStatuses,
      }),
      baselineReceipt: wrongNewestReceipts.baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: wrongNewestReceipts.promotion,
      sleep: async () => {},
    })).rejects.toThrow("successfully binds another SHA");

    for (const terminalState of ["failure", "error", "inactive"] as const) {
      const newerWrongTerminal = providerDeployment(11, "2026-08-29T14:07:00Z", {
        sha: providerPreviousSha,
      });
      const wrongTerminalStatuses = new Map<number, ProviderJson[][]>([
        [10, [[providerStatus(100, "success", "2026-08-29T14:06:00Z")]]],
        [11, [[providerStatus(101, terminalState, "2026-08-29T14:08:00Z", {}, 11)]]],
      ]);
      const wrongTerminalReceipts = await recoveryReceiptsFor(
        [olderVerified, newerWrongTerminal],
        wrongTerminalStatuses,
      );
      await expect(waitForProviderOutcome({
        api: new ProviderApiFixture({
          deployments: [[olderVerified, newerWrongTerminal]],
          refSha: providerVerifiedSha,
          statuses: wrongTerminalStatuses,
        }),
        baselineReceipt: wrongTerminalReceipts.baseline,
        maxPolls: 1,
        pollIntervalMilliseconds: 0,
        promotionReceipt: wrongTerminalReceipts.promotion,
        sleep: async () => {},
      })).resolves.toEqual({ deploymentId: 10, statusId: 100 });
    }

    const concurrentApi = new ProviderApiFixture({
      deployments: [[
        providerDeployment(11, "2026-08-29T14:07:00Z"),
        baselineDeployment,
      ]],
      refSha: providerVerifiedSha,
      statuses: terminalBaselineStatus(10, "2026-08-29T14:06:00Z"),
    });
    await expect(waitForProviderOutcome({
      api: concurrentApi,
      baselineReceipt: recovery.baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: recovery.promotion,
      sleep: async () => {},
    })).rejects.toThrow("concurrent Production deployment");

    const malformedApi = new ProviderApiFixture({
      deployments: [[baselineDeployment]],
      refSha: providerVerifiedSha,
      statuses: terminalBaselineStatus(10, "2026-08-29T14:06:00Z"),
    });
    malformedApi.release = { ...providerRelease(), published_at: null };
    await expect(waitForProviderOutcome({
      api: malformedApi,
      baselineReceipt: recovery.baseline,
      maxPolls: 1,
      pollIntervalMilliseconds: 0,
      promotionReceipt: recovery.promotion,
      sleep: async () => {},
    })).rejects.toThrow("published_at");
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
        DIRECTORY: directory, HANDOFF_DIRECTORY: handoff, EXPECTED_ARTIFACT_ID: "77", EXPECTED_BUNDLE_SHA256: sha256(bundle),
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
    const release = {
      id: 9001, tag_name: tag, target_commitish: sourceSha, draft: false, prerelease: false, immutable: true,
      author: { id: 41898282, type: "Bot" },
      body: `wrench-release-source-v1 repository=hraness/ghostget tag=${tag} source_sha=${sourceSha} workflow_run_id=123456\n\nghostget-release-attempt-v1 run_attempt=1`,
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
          EXPECTED_RELEASE_ATTEMPT: "1", EXPECTED_TARBALL_SHA256: archiveSha256, EXPECTED_VERSION: version,
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
        [{}, { ...release, body: release.body.replace("run_attempt=1", "run_attempt=2") }, "not the exact publication authority"],
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
