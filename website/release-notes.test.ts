import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseReleaseBody, releaseBody, releaseChangelogSection, releaseNotesSha256, releaseTitle, renderReleaseNotes, verifyReleaseBodyNotes,
} from "./release-notes.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const tag = "v0.19.0";
const identity = `wrench-release-source-v1 repository=hraness/ghostget tag=${tag} source_sha=${sha} workflow_run_id=9001`
  + "\n\nghostget-release-attempt-v1 run_attempt=2";
const changelog = [
  "# Changelog", "", "## Unreleased", "", "## 0.19.0 - 2026-09-26", "",
  "Ghostget reads new sources.", "Wrapped summary line.", "",
  "- First change,", "  continued.", "- Second change.", "", "## 0.18.38", "", "Older.", "", "- Older change.", "",
].join("\n");

describe("release changelog section", () => {
  test("copies the summary and changes of the exact version", () => {
    expect(releaseChangelogSection(changelog, tag)).toEqual({
      summary: ["Ghostget reads new sources. Wrapped summary line."],
      changes: ["First change, continued.", "Second change."],
    });
    expect(releaseChangelogSection(changelog.replace("## 0.19.0 - 2026-09-26", "## v0.19.0"), tag).changes).toHaveLength(2);
  });

  test.each([
    ["missing", changelog.replace("## 0.19.0 - 2026-09-26", "## 0.19.1"), /has no v0.19.0 section/u],
    ["empty", changelog.replace(/## 0\.19\.0 - 2026-09-26\n[\s\S]*?(?=## 0\.18\.38)/u, "## 0.19.0\n\n"), /is empty/u],
    ["Unreleased heading", changelog.replace("## 0.19.0 - 2026-09-26", "## 0.19.0 - Unreleased"), /Unreleased/u],
    ["Unreleased text", changelog.replace("Wrapped summary line.", "Unreleased."), /Unreleased/u],
    ["malformed heading", changelog.replace("## 0.19.0 - 2026-09-26", "## 0.19.0 (soon)"), /malformed/u],
    ["duplicate", `${changelog}\n## 0.19.0\n\nAgain.\n\n- Again.\n`, /more than one/u],
    ["no summary", changelog.replace("Ghostget reads new sources.\nWrapped summary line.\n\n", ""), /no summary/u],
    ["no changes", changelog.replace("- First change,\n  continued.\n- Second change.\n", ""), /no changes/u],
    ["HTML comment", changelog.replace("Second change.", "Second <!-- x --> change."), /HTML comments/u],
    ["subheading", changelog.replace("- First change,", "### Fixed\n\n- First change,"), /only paragraphs/u],
    ["text after the list", changelog.replace("- Second change.\n", "- Second change.\nTrailing.\n"), /after its list/u],
  ])("fails when the section is %s", (_name, value, message) => {
    expect(() => releaseChangelogSection(value, tag)).toThrow(message);
  });

  test("ignores an empty Unreleased section above the version", () => {
    expect(releaseChangelogSection(changelog, tag).summary).toHaveLength(1);
    expect(() => releaseChangelogSection(changelog, "v1.0.0")).toThrow(/has no v1.0.0 section/u);
  });
});

describe("release page", () => {
  const notes = renderReleaseNotes({ changelog, tag, sourceSha: sha });
  const body = releaseBody(notes, identity);

  test("renders summary, Changes, Install, and Verify in order", () => {
    expect(releaseTitle(tag)).toBe("Ghostget v0.19.0");
    const headings = notes.split("\n").filter(line => line.startsWith("## "));
    expect(headings).toEqual(["## Changes", "## Install", "## Verify"]);
    expect(notes.startsWith("Ghostget reads new sources. Wrapped summary line.\n\n## Changes\n\n- First change, continued.\n- Second change.\n\n## Install")).toBe(true);
    expect(notes).toContain(`bun add --global https://github.com/hraness/ghostget/releases/download/${tag}/hraness-ghostget-0.19.0.tgz`);
    expect(notes).toContain("npm install @hraness/ghostget@0.19.0");
    expect(notes.indexOf("releases/download")).toBeLessThan(notes.indexOf("npm install"));
    expect(notes).toContain("SHA256SUMS");
    expect(notes).toContain(`https://github.com/hraness/ghostget/commit/${sha}`);
    expect(notes).toContain(`https://github.com/hraness/ghostget/blob/${tag}/docs/publishing.md`);
    for (const forbidden of ["latest", "What's Changed", "Full Changelog", "Generated with", "Automated release", "Canonical GitHub release for", "wrench-release-source-v1", "<!--"]) {
      expect(notes).not.toContain(forbidden);
    }
  });

  test("ends with the unchanged identity record as the final HTML comment", () => {
    expect(body).toBe(`${notes}\n\n<!-- ${identity} -->`);
    expect(body.endsWith("-->")).toBe(true);
    expect(parseReleaseBody(body, tag)).toEqual({ notes, identity });
    expect(verifyReleaseBodyNotes(body, tag, notes).identity).toBe(identity);
    expect(releaseNotesSha256(notes)).toMatch(/^[0-9a-f]{64}$/u);
  });

  test("detects tampered notes and malformed identity placement", () => {
    expect(() => verifyReleaseBodyNotes(body.replace("Second change.", "Second change!"), tag, notes)).toThrow(/differ/u);
    expect(() => verifyReleaseBodyNotes(`Injected.\n\n${body}`, tag, notes)).toThrow(/differ/u);
    expect(() => parseReleaseBody(`${body}\n`, tag)).toThrow(/does not end/u);
    expect(() => parseReleaseBody(`${body}\n\ntrailing -->`, tag)).toThrow();
    expect(() => parseReleaseBody(body.replace(`${notes}\n\n`, `${notes}\n`), tag)).toThrow(/does not follow/u);
    expect(() => parseReleaseBody(identity, tag)).toThrow(/no trailing identity/u);
    expect(() => parseReleaseBody(`<!-- ${identity} -->`, tag)).toThrow();
    expect(() => releaseBody(`${notes}\n<!-- x -->`, identity)).toThrow(/HTML comments/u);
  });

  test("the last identity marker wins over one quoted in the notes", () => {
    const decoy = `<!-- wrench-release-source-v1 repository=hraness/ghostget tag=${tag} source_sha=${"f".repeat(40)} workflow_run_id=1 -->`;
    expect(() => parseReleaseBody(`${decoy}\n\n${body}`, tag)).toThrow(/notes are empty or malformed/u);
  });

  test("accepts the bare legacy record only for releases published before the notes", () => {
    const legacy = identity.replaceAll(tag, "v0.18.38");
    expect(parseReleaseBody(legacy, "v0.18.38")).toEqual({ notes: undefined, identity: legacy });
    expect(() => parseReleaseBody(identity, tag)).toThrow(/no trailing identity/u);
    expect(() => verifyReleaseBodyNotes(legacy, "v0.18.38", notes)).toThrow(/differ/u);
  });
});

test("the repository changelog renders the current package version", () => {
  const root = join(import.meta.dir, "..");
  const version = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
  const notes = renderReleaseNotes({ changelog: readFileSync(join(root, "CHANGELOG.md"), "utf8"), tag: `v${version}`, sourceSha: sha });
  expect(notes.startsWith("## ")).toBe(false);
  expect(notes).toContain(`npm install @hraness/ghostget@${version}`);
});
