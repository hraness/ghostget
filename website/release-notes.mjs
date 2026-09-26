import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The GitHub Release page for one stable tag, following the Hraness release
// page standard: summary, `## Changes`, `## Install`, `## Verify`, and then
// the unchanged release identity record as the trailing HTML comment. The
// summary and changes come only from the version's CHANGELOG.md section.

export const RELEASE_PAGE_REPOSITORY = "hraness/ghostget";
export const RELEASE_PAGE_PRODUCT = "Ghostget";
export const RELEASE_IDENTITY_SCHEMA = "wrench-release-source-v1";
export const RELEASE_IDENTITY_OPEN = `<!-- ${RELEASE_IDENTITY_SCHEMA} `;
export const RELEASE_IDENTITY_CLOSE = " -->";
// Releases up to this tag were published with the bare identity record as the
// whole body. Identity readers accept that legacy shape only for those tags.
export const LAST_BARE_IDENTITY_RELEASE_TAG = "v0.18.38";
export const RELEASE_NOTES_MAX_BYTES = 60_000;
export const CHANGELOG_MAX_BYTES = 4 * 1024 * 1024;

const STABLE_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const SHA = /^[0-9a-f]{40}$/u;
const DATE_SUFFIX = /^ - [0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/u;
const UNRELEASED = /\bunreleased\b/iu;

function stableTag(tag) {
  const match = typeof tag === "string" ? STABLE_TAG.exec(tag) : null;
  if (match === null) throw new Error("Release notes require one stable vX.Y.Z tag");
  return match.slice(1).map(BigInt);
}

function compareTags(left, right) {
  const a = stableTag(left); const b = stableTag(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function releaseTitle(tag) {
  stableTag(tag);
  return `${RELEASE_PAGE_PRODUCT} ${tag}`;
}

/**
 * The version's CHANGELOG.md section as `{ summary, changes }`. The heading is
 * `## X.Y.Z` or `## vX.Y.Z` with an optional ` - YYYY-MM-DD` date. The section
 * holds one or more summary paragraphs and then a bulleted list; hard-wrapped
 * lines are joined so the page renders as written. A missing, duplicated,
 * empty, or Unreleased section fails.
 */
export function releaseChangelogSection(changelog, tag) {
  stableTag(tag);
  if (typeof changelog !== "string" || changelog.length === 0) throw new Error("CHANGELOG.md is missing or empty");
  if (Buffer.byteLength(changelog, "utf8") > CHANGELOG_MAX_BYTES) throw new Error("CHANGELOG.md exceeds its byte bound");
  if (changelog.includes("\r")) throw new Error("CHANGELOG.md must use LF line endings");
  const version = tag.slice(1);
  const lines = changelog.split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("## ")) continue;
    const heading = line.slice(3);
    const named = heading.startsWith(`${version}`) ? heading.slice(version.length)
      : heading.startsWith(`v${version}`) ? heading.slice(version.length + 1) : undefined;
    if (named === undefined || /^[0-9A-Za-z.+-]/u.test(named)) continue;
    if (start !== -1) throw new Error(`CHANGELOG.md has more than one ${tag} section`);
    if (UNRELEASED.test(named)) throw new Error(`CHANGELOG.md section ${tag} still says Unreleased`);
    if (named !== "" && !DATE_SUFFIX.test(named)) throw new Error(`CHANGELOG.md heading for ${tag} is malformed`);
    start = index + 1;
  }
  if (start === -1) throw new Error(`CHANGELOG.md has no ${tag} section`);
  let end = start;
  while (end < lines.length && !lines[end].startsWith("## ") && !lines[end].startsWith("# ")) end += 1;
  const body = lines.slice(start, end);
  const text = body.join("\n").trim();
  if (text === "") throw new Error(`CHANGELOG.md section ${tag} is empty`);
  if (UNRELEASED.test(text)) throw new Error(`CHANGELOG.md section ${tag} still says Unreleased`);
  if (text.includes("<!--") || text.includes("-->")) throw new Error(`CHANGELOG.md section ${tag} must not contain HTML comments`);
  const summary = []; const changes = [];
  let paragraph = []; let inList = false;
  for (const raw of body) {
    const line = raw.trimEnd();
    if (line.startsWith("#") || line.trimStart().startsWith("```")) {
      throw new Error(`CHANGELOG.md section ${tag} may hold only paragraphs and one bulleted list`);
    }
    if (line === "") {
      if (!inList && paragraph.length !== 0) { summary.push(paragraph.join(" ")); paragraph = []; }
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList && paragraph.length !== 0) { summary.push(paragraph.join(" ")); paragraph = []; }
      inList = true;
      const item = line.slice(2).trim();
      if (item === "") throw new Error(`CHANGELOG.md section ${tag} has an empty change`);
      changes.push(item);
      continue;
    }
    if (inList) {
      if (!/^ {2,}\S/u.test(line)) throw new Error(`CHANGELOG.md section ${tag} has text after its list`);
      changes[changes.length - 1] = `${changes[changes.length - 1]} ${line.trim()}`;
      continue;
    }
    paragraph.push(line.trim());
  }
  if (paragraph.length !== 0) summary.push(paragraph.join(" "));
  if (summary.length === 0) throw new Error(`CHANGELOG.md section ${tag} has no summary paragraph`);
  if (changes.length === 0) throw new Error(`CHANGELOG.md section ${tag} has no changes`);
  return Object.freeze({ summary: Object.freeze(summary), changes: Object.freeze(changes) });
}

/** The visible release page above the identity record. */
export function renderReleaseNotes({ changelog, tag, sourceSha }) {
  const section = releaseChangelogSection(changelog, tag);
  if (typeof sourceSha !== "string" || !SHA.test(sourceSha)) throw new Error("Release notes require the full source commit");
  const version = tag.slice(1);
  const archive = `hraness-ghostget-${version}.tgz`;
  const base = `https://github.com/${RELEASE_PAGE_REPOSITORY}`;
  const notes = [
    section.summary.join("\n\n"),
    "## Changes",
    section.changes.map(change => `- ${change}`).join("\n"),
    "## Install",
    "Install the command-line tool with Bun from this release:",
    `\`\`\`sh\nbun add --global ${base}/releases/download/${tag}/${archive}\n\`\`\``,
    "For the SDK, use the same URL without `--global`. The same package is on npm:",
    `\`\`\`sh\nnpm install @hraness/ghostget@${version}\n\`\`\``,
    "## Verify",
    `\`SHA256SUMS\` lists the SHA-256 of the archive, \`npm-pack.json\`, and \`release-manifest.json\`. \`provenance.jsonl\` holds the signed build attestation. This release was built from commit [\`${sourceSha}\`](${base}/commit/${sourceSha}).`,
    `\`\`\`sh\ngh release download ${tag} --repo ${RELEASE_PAGE_REPOSITORY}\nshasum -a 256 --check SHA256SUMS\ngh attestation verify ${archive} --repo ${RELEASE_PAGE_REPOSITORY} --bundle provenance.jsonl --signer-workflow ${RELEASE_PAGE_REPOSITORY}/.github/workflows/release.yml\n\`\`\``,
    `The [publishing guide](${base}/blob/${tag}/docs/publishing.md) describes how the release is built and checked.`,
  ].join("\n\n");
  if (Buffer.byteLength(notes, "utf8") > RELEASE_NOTES_MAX_BYTES) throw new Error(`Release notes for ${tag} exceed their byte bound`);
  return notes;
}

export function releaseNotesSha256(notes) {
  return createHash("sha256").update(notes, "utf8").digest("hex");
}

/** Notes, a blank line, and the identity record as the final HTML comment. */
export function releaseBody(notes, identity) {
  if (typeof notes !== "string" || notes.trim() === "" || notes !== notes.trim()) throw new Error("Release notes must be nonempty and trimmed");
  if (typeof identity !== "string" || !identity.startsWith(`${RELEASE_IDENTITY_SCHEMA} `)
    || identity.includes("<!--") || identity.includes("-->")) throw new Error("Release identity record is malformed");
  if (notes.includes(RELEASE_IDENTITY_OPEN.trimEnd()) || notes.includes("<!--") || notes.includes("-->")) {
    throw new Error("Release notes must not contain HTML comments");
  }
  return `${notes}\n\n${RELEASE_IDENTITY_OPEN}${identity.slice(RELEASE_IDENTITY_SCHEMA.length + 1)}${RELEASE_IDENTITY_CLOSE}`;
}

/**
 * Split a published body into its visible notes and identity record. The
 * record starts at the last `<!-- wrench-release-source-v1 ` marker and the
 * body must end with ` -->`. A release at or below the last bare-identity tag
 * may instead carry the bare record as its whole body; it has no notes.
 */
export function parseReleaseBody(body, tag) {
  stableTag(tag);
  if (typeof body !== "string") throw new Error(`Release ${tag} body is not a string`);
  const start = body.lastIndexOf(RELEASE_IDENTITY_OPEN);
  if (start === -1) {
    if (compareTags(tag, LAST_BARE_IDENTITY_RELEASE_TAG) <= 0 && body.startsWith(`${RELEASE_IDENTITY_SCHEMA} `)
      && !body.includes("<!--") && !body.includes("-->")) {
      return Object.freeze({ notes: undefined, identity: body });
    }
    throw new Error(`Release ${tag} body has no trailing identity record`);
  }
  if (!body.endsWith(RELEASE_IDENTITY_CLOSE) || body.length < start + RELEASE_IDENTITY_OPEN.length + RELEASE_IDENTITY_CLOSE.length) {
    throw new Error(`Release ${tag} body does not end with its identity record`);
  }
  const identity = `${RELEASE_IDENTITY_SCHEMA} ${body.slice(start + RELEASE_IDENTITY_OPEN.length, body.length - RELEASE_IDENTITY_CLOSE.length)}`;
  if (identity.includes("<!--") || identity.includes("-->")) throw new Error(`Release ${tag} identity record is not one HTML comment`);
  const head = body.slice(0, start);
  if (!head.endsWith("\n\n")) throw new Error(`Release ${tag} identity record does not follow its notes`);
  const notes = head.slice(0, -2);
  if (notes.trim() === "" || notes !== notes.trim() || notes.includes("<!--") || notes.includes("-->")) {
    throw new Error(`Release ${tag} notes are empty or malformed`);
  }
  return Object.freeze({ notes, identity });
}

/** Require the body's notes to equal the notes rendered for this release. */
export function verifyReleaseBodyNotes(body, tag, expectedNotes) {
  const parsed = parseReleaseBody(body, tag);
  if (parsed.notes === undefined || parsed.notes !== expectedNotes) {
    throw new Error(`Release ${tag} notes differ from the rendered changelog section`);
  }
  return parsed;
}

function repositoryChangelog() {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "CHANGELOG.md"), "utf8");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [command, tag, sourceSha, ...extra] = process.argv.slice(2);
  if ((command !== "render" && command !== "notes-sha256") || extra.length !== 0) {
    throw new Error("Usage: release-notes.mjs render|notes-sha256 <vX.Y.Z> <source-sha>");
  }
  const notes = renderReleaseNotes({ changelog: repositoryChangelog(), tag, sourceSha });
  process.stdout.write(command === "render" ? `${notes}\n` : `notes_sha256=${releaseNotesSha256(notes)}\n`);
}
