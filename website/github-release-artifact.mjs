import { createHash } from "node:crypto";

export const GITHUB_RELEASE_REPOSITORY = "hraness/wrench";
export const GITHUB_RELEASE_REPOSITORY_ID = 1316443113;
export const GITHUB_RELEASE_WORKFLOW = ".github/workflows/release.yml";
const shaPattern = /^[0-9a-f]{40}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const sha512Pattern = /^[0-9a-f]{128}$/u;
const maximumAssetBytes = 8 * 1024 * 1024;

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function keys(value, expected, label) {
  const result = record(value, label);
  if (Object.keys(result).sort().join(",") !== [...expected].sort().join(",")) {
    throw new Error(`${label} has missing or unexpected fields`);
  }
  return result;
}

function positive(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be a bounded positive safe integer`);
  }
  return value;
}

export function releaseVersion(tag) {
  const match = typeof tag === "string"
    ? /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.exec(tag)
    : null;
  if (match === null || match.slice(1).some(part => BigInt(part) > BigInt(Number.MAX_SAFE_INTEGER))) {
    throw new Error("GitHub release tag must be one stable semantic version");
  }
  return tag.slice(1);
}

export function usesGithubReleaseAssets(tag) {
  const [major, minor, patch] = releaseVersion(tag).split(".").map(BigInt);
  return major > 0n || minor > 16n || (minor === 16n && patch >= 13n);
}

export function releaseAssetNames(tag) {
  const version = releaseVersion(tag);
  return Object.freeze([
    `hraness-wrench-${version}.tgz`, "npm-pack.json", "release-manifest.json",
    "SHA256SUMS", "provenance.jsonl",
  ]);
}

export function releaseArchiveUrl(tag) {
  return `https://github.com/${GITHUB_RELEASE_REPOSITORY}/releases/download/${tag}/${releaseAssetNames(tag)[0]}`;
}

export function parseReleaseManifest(value, expected = {}) {
  const manifest = keys(value, [
    "schema", "repository", "repositoryId", "package", "version", "tag",
    "sourceSha", "workflow", "workflowSha", "runId", "runAttempt", "archive",
  ], "GitHub release manifest");
  const version = releaseVersion(manifest.tag);
  if (manifest.schema !== "hraness-github-release-v1"
    || manifest.repository !== GITHUB_RELEASE_REPOSITORY
    || manifest.repositoryId !== GITHUB_RELEASE_REPOSITORY_ID
    || manifest.package !== "@hraness/wrench" || manifest.version !== version
    || manifest.workflow !== GITHUB_RELEASE_WORKFLOW
    || typeof manifest.sourceSha !== "string" || !shaPattern.test(manifest.sourceSha)
    || typeof manifest.workflowSha !== "string" || !shaPattern.test(manifest.workflowSha)
    || !usesGithubReleaseAssets(manifest.tag)) {
    throw new Error("GitHub release manifest has a different source or package identity");
  }
  positive(manifest.runId, "release run ID");
  positive(manifest.runAttempt, "release run attempt");
  const archive = keys(manifest.archive, ["name", "bytes", "sha256", "sha512"], "release archive");
  if (archive.name !== releaseAssetNames(manifest.tag)[0]
    || typeof archive.sha256 !== "string" || !sha256Pattern.test(archive.sha256)
    || typeof archive.sha512 !== "string" || !sha512Pattern.test(archive.sha512)) {
    throw new Error("GitHub release archive identity is malformed");
  }
  positive(archive.bytes, "release archive bytes", maximumAssetBytes);
  for (const [key, value] of Object.entries(expected)) {
    if (!Object.hasOwn(manifest, key) || manifest[key] !== value) {
      throw new Error(`GitHub release manifest does not bind expected ${key}`);
    }
  }
  return Object.freeze({ ...manifest, archive: Object.freeze({ ...archive }) });
}

export function parseReleaseAssetDescriptors(value, tag) {
  if (!Array.isArray(value)) throw new Error("GitHub release assets must be an array");
  const names = releaseAssetNames(tag);
  if (value.length !== names.length) throw new Error("GitHub release must contain exactly five canonical assets");
  const ids = new Set();
  const found = new Set();
  const descriptors = value.map((entry) => {
    const asset = record(entry, "GitHub release asset");
    const id = positive(asset.id, "GitHub release asset ID");
    const bytes = positive(asset.size, "GitHub release asset size", maximumAssetBytes);
    if (!names.includes(asset.name) || found.has(asset.name) || ids.has(id)
      || asset.state !== "uploaded" || typeof asset.digest !== "string"
      || !/^sha256:[0-9a-f]{64}$/u.test(asset.digest)
      || asset.browser_download_url !== `https://github.com/${GITHUB_RELEASE_REPOSITORY}/releases/download/${tag}/${asset.name}`
      || asset.url !== `https://api.github.com/repos/${GITHUB_RELEASE_REPOSITORY}/releases/assets/${id}`) {
      throw new Error("GitHub release asset identity, digest, or inventory is not exact");
    }
    found.add(asset.name); ids.add(id);
    return Object.freeze({ id, name: asset.name, bytes, sha256: asset.digest.slice(7), url: asset.browser_download_url });
  });
  return Object.freeze(descriptors.sort((a, b) => a.name.localeCompare(b.name)));
}

export function verifyReleaseAssetBytes(bytes, descriptor) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== descriptor.bytes
    || createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256) {
    throw new Error("GitHub release asset bytes differ from its immutable descriptor");
  }
}

// This accepts only the successful CLI verifier's parsed output, never a raw bundle.
export function verifyAttestationResult(value, manifestValue, subjectName, subjectSha256) {
  const manifest = parseReleaseManifest(manifestValue);
  if (!Array.isArray(value) || value.length !== 1 || typeof subjectSha256 !== "string" || !sha256Pattern.test(subjectSha256)) {
    throw new Error("Expected one cryptographically verified GitHub attestation");
  }
  const result = record(record(value[0], "attestation").verificationResult, "verification result");
  const cert = record(record(result.signature, "verified signature").certificate, "verified certificate");
  const expected = {
    issuer: "https://token.actions.githubusercontent.com",
    buildSignerURI: `https://github.com/${GITHUB_RELEASE_REPOSITORY}/${GITHUB_RELEASE_WORKFLOW}@refs/tags/${manifest.tag}`,
    buildSignerDigest: manifest.sourceSha,
    runnerEnvironment: "github-hosted",
    sourceRepositoryURI: `https://github.com/${GITHUB_RELEASE_REPOSITORY}`,
    sourceRepositoryIdentifier: String(GITHUB_RELEASE_REPOSITORY_ID),
    sourceRepositoryOwnerIdentifier: "307125679",
    sourceRepositoryOwnerURI: "https://github.com/hraness",
    sourceRepositoryVisibilityAtSigning: "public",
    buildConfigURI: `https://github.com/${GITHUB_RELEASE_REPOSITORY}/${GITHUB_RELEASE_WORKFLOW}@refs/tags/${manifest.tag}`,
    buildConfigDigest: manifest.sourceSha,
    sourceRepositoryDigest: manifest.sourceSha,
    sourceRepositoryRef: `refs/tags/${manifest.tag}`,
    buildTrigger: "push",
    runInvocationURI: `https://github.com/${GITHUB_RELEASE_REPOSITORY}/actions/runs/${manifest.runId}/attempts/${manifest.runAttempt}`,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (cert[key] !== expectedValue) throw new Error(`Verified certificate has a different ${key}`);
  }
  if (!Array.isArray(result.verifiedTimestamps) || result.verifiedTimestamps.length === 0) {
    throw new Error("Verified attestation has no trusted timestamp");
  }
  const statement = record(result.statement, "verified statement");
  if (statement._type !== "https://in-toto.io/Statement/v1"
    || statement.predicateType !== "https://slsa.dev/provenance/v1"
    || !Array.isArray(statement.subject) || statement.subject.length !== 4) {
    throw new Error("Verified attestation must cover the four canonical build files");
  }
  const allowed = releaseAssetNames(manifest.tag).slice(0, 4);
  const seen = new Set();
  for (const item of statement.subject) {
    const subject = keys(item, ["name", "digest"], "attested subject");
    const digest = keys(subject.digest, ["sha256"], "attested subject digest");
    if (!allowed.includes(subject.name) || seen.has(subject.name)
      || typeof digest.sha256 !== "string" || !sha256Pattern.test(digest.sha256)) {
      throw new Error("Verified attestation subject inventory is not exact");
    }
    if (subject.name === subjectName && digest.sha256 !== subjectSha256) {
      throw new Error("Verified attestation subject digest differs from the artifact");
    }
    seen.add(subject.name);
  }
  if (!seen.has(subjectName)) throw new Error("Verified attestation omits the expected subject");
}
