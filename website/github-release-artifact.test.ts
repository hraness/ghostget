import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  parseReleaseAssetDescriptors, parseReleaseManifest, releaseArchiveUrl, releaseAssetNames,
  usesGithubReleaseAssets, verifyAttestationResult, verifyReleaseAssetBytes,
  releaseIdentity, releaseAssetByteLimit,
} from "./github-release-artifact.mjs";

const tag = "v0.17.0";
const sourceSha = "a".repeat(40);
const hash = "b".repeat(64);
const manifest = {
  schema: "hraness-github-release-v1", repository: "hraness/ghostget", repositoryId: 1316443113,
  package: "@hraness/ghostget", version: "0.17.0", tag, sourceSha, workflowSha: "c".repeat(40),
  workflow: ".github/workflows/release.yml", runId: 12345, runAttempt: 2,
  archive: { name: "hraness-ghostget-0.17.0.tgz", bytes: 100, sha256: hash, sha512: "d".repeat(128) },
} as const;
function descriptors() {
  return releaseAssetNames(tag).map((name, index) => ({
    id: index + 1, name, size: 100, state: "uploaded", digest: `sha256:${hash}`,
    browser_download_url: `https://github.com/hraness/ghostget/releases/download/${tag}/${name}`,
    url: `https://api.github.com/repos/hraness/ghostget/releases/assets/${index + 1}`,
  }));
}
function verifierOutput() {
  return [{ verificationResult: {
    signature: { certificate: {
      issuer: "https://token.actions.githubusercontent.com",
      buildSignerURI: `https://github.com/hraness/ghostget/.github/workflows/release.yml@refs/tags/${tag}`,
      buildSignerDigest: sourceSha, runnerEnvironment: "github-hosted",
      sourceRepositoryURI: "https://github.com/hraness/ghostget", sourceRepositoryIdentifier: "1316443113",
      sourceRepositoryOwnerIdentifier: "307125679", sourceRepositoryDigest: sourceSha,
      sourceRepositoryOwnerURI: "https://github.com/hraness", sourceRepositoryVisibilityAtSigning: "public",
      buildConfigURI: `https://github.com/hraness/ghostget/.github/workflows/release.yml@refs/tags/${tag}`,
      buildConfigDigest: sourceSha,
      sourceRepositoryRef: `refs/tags/${tag}`, buildTrigger: "push",
      runInvocationURI: "https://github.com/hraness/ghostget/actions/runs/12345/attempts/2",
    } }, verifiedTimestamps: [{ type: "Tlog", uri: "https://rekor.sigstore.dev" }],
    statement: { _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
      subject: releaseAssetNames(tag).slice(0, 4).map(name => ({ name, digest: { sha256: hash } })),
    },
  } }];
}

describe("canonical GitHub artifact admission", () => {
  test("reserves the larger transfer envelope for exact messaging archives and keeps historical and JSON bounds", () => {
    for (const versionTag of ["v0.16.16", "v0.17.0", "v0.18.0", "v0.18.1", "v0.18.2", "v0.19.0", "v1.0.0"]) {
      const names = releaseAssetNames(versionTag);
      const archiveMaximum = ["v0.16.16", "v0.17.0", "v0.18.0"].includes(versionTag) ? 8 : 12;
      for (const name of names) {
        const maximum = (name === names[0] ? archiveMaximum : ["npm-pack.json", "release-manifest.json"].includes(name) ? 1 : 8) * 1024 * 1024;
        expect(releaseAssetByteLimit(versionTag, name)).toBe(maximum);
        const assets = names.map((name, index) => ({ id: index + 1, name, state: "uploaded", size: 100,
          digest: `sha256:${hash}`, url: `https://api.github.com/repos/hraness/ghostget/releases/assets/${index + 1}`,
          browser_download_url: `https://github.com/hraness/ghostget/releases/download/${versionTag}/${name}` }));
        const asset = assets.find(asset => asset.name === name)!;
        asset.size = maximum;
        expect(parseReleaseAssetDescriptors(assets, versionTag).find(asset => asset.name === name)?.bytes).toBe(maximum);
        asset.size++;
        expect(() => parseReleaseAssetDescriptors(assets, versionTag)).toThrow();
      }
      for (const name of ["unknown.tgz", `../${names[0]}`, `${names[0]}.json`, "provenance.jsonl.tgz"]) {
        expect(() => releaseAssetByteLimit(versionTag, name)).toThrow();
      }
    }
    const current = { ...manifest, tag: "v0.18.1", version: "0.18.1", archive: {
      ...manifest.archive, name: "hraness-ghostget-0.18.1.tgz", bytes: 12 * 1024 * 1024 } };
    expect(parseReleaseManifest(current).archive.bytes).toBe(12 * 1024 * 1024);
    expect(() => parseReleaseManifest({ ...current, archive: { ...current.archive, bytes: current.archive.bytes + 1 } })).toThrow();
  });
  test("keeps immutable Wrench package names and signed repository identity below the rename boundary", () => {
    expect(releaseIdentity("v0.16.16")).toEqual({ package: "@hraness/wrench", repository: "hraness/wrench", archivePrefix: "hraness-wrench" });
    expect(releaseIdentity("v0.17.0")).toEqual({ package: "@hraness/ghostget", repository: "hraness/ghostget", archivePrefix: "hraness-ghostget" });
    expect(releaseAssetNames("v0.16.16")[0]).toBe("hraness-wrench-0.16.16.tgz");
    const legacy = { ...manifest, repository: "hraness/wrench", package: "@hraness/wrench", tag: "v0.16.16", version: "0.16.16", archive: { ...manifest.archive, name: "hraness-wrench-0.16.16.tgz" } } as const;
    expect(parseReleaseManifest(legacy)).toEqual(legacy);
    expect(() => parseReleaseManifest({ ...legacy, package: "@hraness/ghostget" })).toThrow();
    expect(() => parseReleaseManifest({ ...manifest, repository: "hraness/wrench" })).toThrow();
  });
  test("retains historical assetless releases and gives stable versioned installation URLs", () => {
    expect(usesGithubReleaseAssets("v0.16.11")).toBe(false);
    expect(usesGithubReleaseAssets("v0.16.12")).toBe(false);
    expect(usesGithubReleaseAssets(tag)).toBe(true);
    expect(releaseArchiveUrl(tag)).toBe("https://github.com/hraness/ghostget/releases/download/v0.17.0/hraness-ghostget-0.17.0.tgz");
  });
  test("binds strict manifest fields to the requested source and attempt", () => {
    expect(parseReleaseManifest(manifest, { sourceSha, runAttempt: 2 })).toEqual(manifest);
    for (const invalid of [
      { ...manifest, extra: true }, { ...manifest, sourceSha: 1e39 }, { ...manifest, repositoryId: "1316443113" },
      { ...manifest, workflow: ".github/workflows/ci.yml" }, { ...manifest, runAttempt: 0 },
      { ...manifest, tag: "v0.17.0-preview" }, { ...manifest, version: "0.17.1" },
      { ...manifest, archive: { ...manifest.archive, name: "../archive.tgz" } },
      { ...manifest, archive: { ...manifest.archive, bytes: 8 * 1024 * 1024 + 1 } },
    ]) expect(() => parseReleaseManifest(invalid)).toThrow();
    expect(() => parseReleaseManifest(manifest, { runAttempt: 1 })).toThrow(/runAttempt/u);
  });
  test("rejects duplicate IDs, names, foreign URLs, uncommitted uploads and unknown assets", () => {
    expect(parseReleaseAssetDescriptors(descriptors(), tag)).toHaveLength(5);
    for (const change of [
      { id: 2 }, { name: "npm-pack.json" }, { name: "extra.tgz" }, { state: "new" },
      { digest: null }, { browser_download_url: "https://example.com/archive.tgz" }, { size: -1 },
    ]) {
      const assets = descriptors(); Object.assign(assets[0]!, change);
      expect(() => parseReleaseAssetDescriptors(assets, tag)).toThrow();
    }
    expect(() => parseReleaseAssetDescriptors(descriptors().slice(1), tag)).toThrow();
  });
  test("checks exact remote asset bytes", () => {
    const bytes = Buffer.from("canonical");
    const descriptor = { id: 1, name: "a", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), url: "https://github.com" };
    expect(() => verifyReleaseAssetBytes(bytes, descriptor)).not.toThrow();
    expect(() => verifyReleaseAssetBytes(Buffer.from("different"), descriptor)).toThrow();
    expect(() => verifyReleaseAssetBytes(bytes, { ...descriptor, bytes: bytes.length + 1 })).toThrow();
  });
  test("requires signed certificate claims for the exact build run and all four subjects", () => {
    const verifiedManifest = parseReleaseManifest(manifest);
    expect(() => verifyAttestationResult(verifierOutput(), verifiedManifest, manifest.archive.name, hash)).not.toThrow();
    for (const key of Object.keys(verifierOutput()[0]!.verificationResult.signature.certificate)) {
      const output = verifierOutput();
      Object.assign(output[0]!.verificationResult.signature.certificate, { [key]: "different" });
      expect(() => verifyAttestationResult(output, verifiedManifest, manifest.archive.name, hash)).toThrow();
    }
    const duplicate = verifierOutput();
    duplicate[0]!.verificationResult.statement.subject[1] = duplicate[0]!.verificationResult.statement.subject[0]!;
    expect(() => verifyAttestationResult(duplicate, verifiedManifest, manifest.archive.name, hash)).toThrow();
    const rawBundle = { dsseEnvelope: { payload: "attacker-chosen" } };
    expect(() => verifyAttestationResult(rawBundle, verifiedManifest, manifest.archive.name, hash)).toThrow();
    expect(() => verifyAttestationResult(verifierOutput(), verifiedManifest, manifest.archive.name, "e".repeat(64))).toThrow();
  });
});
