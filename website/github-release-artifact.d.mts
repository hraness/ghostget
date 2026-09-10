export const GITHUB_RELEASE_REPOSITORY: "hraness/ghostget";
export const GITHUB_RELEASE_REPOSITORY_ID: 1316443113;
export const GITHUB_RELEASE_WORKFLOW: ".github/workflows/release.yml";
export interface ReleaseManifest {
  readonly schema: "hraness-github-release-v1";
  readonly repository: "hraness/ghostget" | "hraness/wrench";
  readonly repositoryId: 1316443113;
  readonly package: "@hraness/ghostget" | "@hraness/wrench";
  readonly version: string;
  readonly tag: string;
  readonly sourceSha: string;
  readonly workflow: ".github/workflows/release.yml";
  readonly workflowSha: string;
  readonly runId: number;
  readonly runAttempt: number;
  readonly archive: Readonly<{ name: string; bytes: number; sha256: string; sha512: string }>;
}
export interface ReleaseAssetDescriptor {
  readonly id: number;
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly url: string;
}
export function releaseVersion(tag: unknown): string;
export function usesGithubReleaseAssets(tag: string): boolean;
export function releaseIdentity(tag: string): Readonly<{
  package: "@hraness/ghostget" | "@hraness/wrench";
  repository: "hraness/ghostget" | "hraness/wrench";
  archivePrefix: "hraness-ghostget" | "hraness-wrench";
}>;
export function releaseAssetNames(tag: string): readonly string[];
export function releaseArchiveUrl(tag: string): string;
export function parseReleaseManifest(value: unknown, expected?: Partial<ReleaseManifest>): ReleaseManifest;
export function parseReleaseAssetDescriptors(value: unknown, tag: string): readonly ReleaseAssetDescriptor[];
export function verifyReleaseAssetBytes(bytes: Uint8Array, descriptor: ReleaseAssetDescriptor): void;
export function verifyAttestationResult(value: unknown, manifest: unknown, subjectName: string, subjectSha256: string): void;
