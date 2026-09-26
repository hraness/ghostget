export const RELEASE_PAGE_REPOSITORY: "hraness/ghostget";
export const RELEASE_PAGE_PRODUCT: "Ghostget";
export const RELEASE_IDENTITY_SCHEMA: "wrench-release-source-v1";
export const RELEASE_IDENTITY_OPEN: "<!-- wrench-release-source-v1 ";
export const RELEASE_IDENTITY_CLOSE: " -->";
export const LAST_BARE_IDENTITY_RELEASE_TAG: "v0.18.38";
export const RELEASE_NOTES_MAX_BYTES: number;
export const CHANGELOG_MAX_BYTES: number;
export function releaseTitle(tag: string): string;
export function releaseChangelogSection(changelog: string, tag: string): Readonly<{
  summary: readonly string[];
  changes: readonly string[];
}>;
export function renderReleaseNotes(input: Readonly<{ changelog: string; tag: string; sourceSha: string }>): string;
export function releaseNotesSha256(notes: string): string;
export function releaseBody(notes: string, identity: string): string;
export function parseReleaseBody(body: unknown, tag: string): Readonly<{ notes: string | undefined; identity: string }>;
export function verifyReleaseBodyNotes(body: unknown, tag: string, expectedNotes: string): Readonly<{
  notes: string | undefined;
  identity: string;
}>;
