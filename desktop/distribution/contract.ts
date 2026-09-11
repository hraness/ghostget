import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const REPOSITORY = "hraness/ghostget";
export const REPOSITORY_ID = 1316443113;
export const WORKFLOW = ".github/workflows/desktop-release.yml";
export const MAX_ARCHIVE_BYTES = 1536 * 1024 * 1024;
export const MAX_JSON_BYTES = 1024 * 1024;
export const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Desktop distribution: ${message}`);
}
export function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), "expected an object");
  return value as Record<string, unknown>;
}
export function keys(value: unknown, expected: readonly string[]): Record<string, unknown> {
  const record = object(value);
  requireValue(Object.keys(record).sort().join(",") === [...expected].sort().join(","), "object fields differ");
  return record;
}
export function positive(value: unknown): number {
  requireValue(Number.isSafeInteger(value) && Number(value) > 0, "invalid numeric identity");
  return Number(value);
}
export function digest(value: unknown, length = 64): string {
  requireValue(typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`, "u").test(value), "invalid digest");
  return value;
}
export function version(tag: unknown): string {
  requireValue(typeof tag === "string", "invalid canonical tag");
  const match = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.exec(tag);
  requireValue(match && match.slice(1).every(part => BigInt(part) <= BigInt(Number.MAX_SAFE_INTEGER)), "invalid canonical tag");
  return tag.slice(1);
}
export const desktopTag = (tag: string): string => `desktop-v${version(tag)}-macos-arm64`;
export const archiveName = (tag: string): string => `Ghostget-${version(tag)}-macos-arm64.zip`;
export const buildNames = (tag: string): string[] => [archiveName(tag), "desktop-manifest.json", "SHA256SUMS"];
export const assetNames = (tag: string): string[] => [...buildNames(tag), "provenance.jsonl"];
export const VERIFICATIONS = ["codesign", "stapler", "spctl", "syspolicy_check", "packaged-helper"] as const;

export type DesktopManifest = Readonly<{
  schema: "ghostget.desktop-release/1"; repository: typeof REPOSITORY; repositoryId: typeof REPOSITORY_ID;
  canonicalTag: string; desktopTag: string; version: string; sourceSha: string; sourceTree: string;
  workflow: typeof WORKFLOW; workflowSha: string; workflowId: number; runId: number; runAttempt: number;
  architecture: "arm64"; minimumMacOS: "14.5"; teamId: string; signingIdentitySha1: string;
  archive: Readonly<{ name: string; bytes: number; sha256: string }>;
  notarization: Readonly<{ id: string; status: "Accepted"; stapled: true }>;
  runtimeInventorySha256: string; signingInventorySha256: string; verification: typeof VERIFICATIONS;
}>;
export function parseManifest(value: unknown): DesktopManifest {
  const m = keys(value, ["schema", "repository", "repositoryId", "canonicalTag", "desktopTag", "version", "sourceSha", "sourceTree", "workflow", "workflowSha", "workflowId", "runId", "runAttempt", "architecture", "minimumMacOS", "teamId", "signingIdentitySha1", "archive", "notarization", "runtimeInventorySha256", "signingInventorySha256", "verification"]);
  const tag = typeof m.canonicalTag === "string" ? m.canonicalTag : "";
  requireValue(m.schema === "ghostget.desktop-release/1" && m.repository === REPOSITORY && m.repositoryId === REPOSITORY_ID
    && m.desktopTag === desktopTag(tag) && m.version === version(tag) && m.workflow === WORKFLOW && m.workflowSha === m.sourceSha
    && m.architecture === "arm64" && m.minimumMacOS === "14.5" && typeof m.teamId === "string" && /^[A-Z0-9]{10}$/u.test(m.teamId)
    && JSON.stringify(m.verification) === JSON.stringify(VERIFICATIONS), "manifest authority differs");
  digest(m.sourceSha, 40); digest(m.sourceTree, 40); digest(m.signingIdentitySha1, 40);
  positive(m.workflowId); positive(m.runId); positive(m.runAttempt);
  digest(m.runtimeInventorySha256); digest(m.signingInventorySha256);
  const archive = keys(m.archive, ["name", "bytes", "sha256"]);
  requireValue(archive.name === archiveName(tag) && positive(archive.bytes) <= MAX_ARCHIVE_BYTES, "archive identity or size differs"); digest(archive.sha256);
  const notary = keys(m.notarization, ["id", "status", "stapled"]);
  requireValue(typeof notary.id === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(notary.id)
    && notary.status === "Accepted" && notary.stapled === true, "accepted stapled notarization is required");
  return m as unknown as DesktopManifest;
}
export function regularBytes(path: string, maximum: number): Buffer {
  const info = lstatSync(path);
  requireValue(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= maximum, "artifact is not a bounded regular file");
  const bytes = readFileSync(path); requireValue(bytes.length === info.size, "artifact changed during read"); return bytes;
}
export function verifyDirectory(directory: string, tag: string, withProvenance: boolean): { manifest: DesktopManifest; hashes: Record<string, string> } {
  const info = lstatSync(directory); requireValue(info.isDirectory() && !info.isSymbolicLink(), "artifact directory is unsafe");
  const names = withProvenance ? assetNames(tag) : buildNames(tag);
  requireValue(readdirSync(directory).sort().join(",") === [...names].sort().join(","), "artifact inventory differs");
  const hashes = Object.fromEntries(names.map(name => [name, sha256(regularBytes(join(directory, name), name === archiveName(tag) ? MAX_ARCHIVE_BYTES : MAX_JSON_BYTES))]));
  const manifest = parseManifest(JSON.parse(regularBytes(join(directory, "desktop-manifest.json"), MAX_JSON_BYTES).toString("utf8")));
  requireValue(manifest.canonicalTag === tag && manifest.archive.sha256 === hashes[archiveName(tag)] && manifest.archive.bytes === lstatSync(join(directory, archiveName(tag))).size, "archive differs from manifest");
  const checksums = [archiveName(tag), "desktop-manifest.json"].map(name => `${hashes[name]}  ${name}\n`).join("");
  requireValue(regularBytes(join(directory, "SHA256SUMS"), MAX_JSON_BYTES).toString("utf8") === checksums, "checksums differ");
  return { manifest, hashes };
}

/** Accept only output from a successful cryptographic gh attestation verifier. */
export function verifyAttestation(value: unknown, manifest: DesktopManifest, hashes: Readonly<Record<string, string>>): void {
  requireValue(Array.isArray(value) && value.length === 1, "expected one verified attestation");
  const result = object(object(value[0]).verificationResult), cert = object(object(result.signature).certificate);
  const workflowURI = `https://github.com/${REPOSITORY}/${WORKFLOW}@refs/heads/main`;
  const expected = {
    issuer: "https://token.actions.githubusercontent.com", buildSignerURI: workflowURI, buildSignerDigest: manifest.sourceSha,
    runnerEnvironment: "github-hosted", sourceRepositoryURI: `https://github.com/${REPOSITORY}`,
    sourceRepositoryIdentifier: String(REPOSITORY_ID), sourceRepositoryOwnerIdentifier: "307125679",
    sourceRepositoryOwnerURI: "https://github.com/hraness", sourceRepositoryVisibilityAtSigning: "public",
    buildConfigURI: workflowURI, buildConfigDigest: manifest.sourceSha, sourceRepositoryDigest: manifest.sourceSha,
    sourceRepositoryRef: "refs/heads/main", buildTrigger: "workflow_dispatch",
    runInvocationURI: `https://github.com/${REPOSITORY}/actions/runs/${manifest.runId}/attempts/${manifest.runAttempt}`,
  };
  for (const [key, expectedValue] of Object.entries(expected)) requireValue(cert[key] === expectedValue, `verified certificate differs: ${key}`);
  requireValue(Array.isArray(result.verifiedTimestamps) && result.verifiedTimestamps.length > 0, "verified timestamp missing");
  const statement = object(result.statement);
  requireValue(statement._type === "https://in-toto.io/Statement/v1" && statement.predicateType === "https://slsa.dev/provenance/v1" && Array.isArray(statement.subject), "verified statement differs");
  const subjects = statement.subject.map(value => { const s = keys(value, ["name", "digest"]); return { name: s.name, sha256: digest(keys(s.digest, ["sha256"]).sha256) }; });
  requireValue(subjects.length === 3 && new Set(subjects.map(s => s.name)).size === 3
    && subjects.every(s => typeof s.name === "string" && buildNames(manifest.canonicalTag).includes(s.name) && hashes[s.name] === s.sha256), "attested subject inventory differs");
}
