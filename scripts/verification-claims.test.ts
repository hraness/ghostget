/**
 * Tests for the claims register in `scripts/verification-claims.ts`: the
 * committed register and the assurance case generated from it, guideline
 * coverage of every scanned `AGENTS.md`, evidence paths and the evidence each
 * checker layer requires, guideline units, and the strict register parser.
 *
 * Repository changes run against an in-memory overlay of the working tree, so
 * no test writes to the checkout.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { assertAsyncProperty, assertProperty, fc } from "../src/test-support.js";
import {
  ASSURANCE_DOCUMENT,
  CLAIMS_REGISTER,
  LAYERS,
  PROPERTY_MARKERS,
  RENDER_COMMAND,
  STATUSES,
  diskRepository,
  guidelineUnits,
  isRepositoryPath,
  markdownTableCell,
  normalizeWhitespace,
  parseClaimsRegister,
  readClaimsRegister,
  registerFindings,
  renderAssurance,
  ruleDigest,
  testBlocks,
  type Claim,
  type ClaimsRegister,
  type Layer,
  type RepositoryView,
  type Status,
} from "./verification-claims.js";
import {
  invalidatingMutation,
  isJsonObject,
  jsonAt,
  jsonWith,
  rejects,
  type JsonPath,
  type JsonValue,
} from "./verification-test-support.js";
import { REPOSITORY_ROOT } from "./verification-tools.js";

// ---------------------------------------------------------------------------
// Repository views and register fixtures
// ---------------------------------------------------------------------------

/** `base` with every read remembered, so repeated register checks stay fast. */
function remembered(base: RepositoryView): RepositoryView {
  const files = new Map<string, Promise<boolean>>();
  const texts = new Map<string, Promise<string | null>>();
  let guides: Promise<readonly string[]> | undefined;
  return Object.freeze({
    isFile(path: string) {
      const known = files.get(path) ?? base.isFile(path);
      files.set(path, known);
      return known;
    },
    readText(path: string) {
      const known = texts.get(path) ?? base.readText(path);
      texts.set(path, known);
      return known;
    },
    guidePaths() {
      guides ??= base.guidePaths();
      return guides;
    },
  });
}

const DISK = remembered(diskRepository());

type Files = Readonly<Record<string, string | null>>;

const isGuidePath = (path: string): boolean => path === "AGENTS.md" || path.endsWith("/AGENTS.md");

/** `base` with each file in `files` replaced by its text, or deleted when the text is null. */
function overlay(base: RepositoryView, files: Files): RepositoryView {
  const changed = new Map(Object.entries(files));
  return Object.freeze({
    async isFile(path: string) {
      return changed.has(path) ? changed.get(path) !== null : base.isFile(path);
    },
    async readText(path: string) {
      return changed.has(path) ? changed.get(path) ?? null : base.readText(path);
    },
    async guidePaths() {
      const paths = new Set(await base.guidePaths());
      for (const [path, text] of changed) {
        if (!isGuidePath(path)) continue;
        if (text === null) paths.delete(path);
        else paths.add(path);
      }
      return Object.freeze([...paths].sort());
    },
  });
}

/** An independent statement of the table-cell escape: backslashes first, then pipes. */
const tableCell = (value: string): string => value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");

/**
 * Split a rendered cell into the characters Markdown shows, or return null
 * when a bare pipe would split the cell or a backslash escapes anything else.
 */
function shownCellText(cell: string): string | null {
  let shown = "";
  for (let index = 0; index < cell.length; index += 1) {
    const character = cell[index]!;
    if (character === "|") return null;
    if (character !== "\\") {
      shown += character;
      continue;
    }
    const escaped = cell[index + 1];
    if (escaped !== "\\" && escaped !== "|") return null;
    shown += escaped;
    index += 1;
  }
  return shown;
}

async function repositoryText(path: string): Promise<string> {
  const text = await DISK.readText(path);
  if (text === null) throw new Error(`${path} must be a repository file`);
  return text;
}

let committedText: Promise<string> | undefined;

/** A fresh copy of the committed register document. */
async function committedDocument(): Promise<JsonValue> {
  committedText ??= readFile(join(REPOSITORY_ROOT, CLAIMS_REGISTER), "utf8");
  return JSON.parse(await committedText) as JsonValue;
}

async function committedRegister(): Promise<ClaimsRegister> {
  return parseClaimsRegister(await committedDocument());
}

async function findingsFor(files: Files, register?: ClaimsRegister): Promise<readonly string[]> {
  return registerFindings(register ?? await committedRegister(), overlay(DISK, files));
}

function listAt(document: JsonValue, path: JsonPath): readonly JsonValue[] {
  const items = jsonAt(document, path);
  if (!Array.isArray(items)) throw new Error(`${path.join(".")} must be a list`);
  return items;
}

/** `document` with `value` appended to the list at `path`. */
function appended(document: JsonValue, path: JsonPath, value: JsonValue): JsonValue {
  return jsonWith(document, [...path, listAt(document, path).length], value);
}

/** The index of the first object in the list at `path` that `matches`. */
function indexWhere(
  document: JsonValue,
  path: JsonPath,
  matches: (entry: { [key: string]: JsonValue }) => boolean,
): number {
  const index = listAt(document, path).findIndex((entry) => isJsonObject(entry) && matches(entry));
  if (index < 0) throw new Error(`no entry of ${path.join(".")} matches`);
  return index;
}

/** The committed register with fields of claim `id` replaced, or removed when undefined. */
async function withClaim(id: string, fields: Readonly<Record<string, JsonValue | undefined>>): Promise<ClaimsRegister> {
  let document = await committedDocument();
  const index = indexWhere(document, ["claims"], (claim) => claim.id === id);
  for (const [key, value] of Object.entries(fields)) document = jsonWith(document, ["claims", index, key], value);
  return parseClaimsRegister(document);
}

/** The committed register with claim `id` evidenced by exactly `evidence`. */
const evidencedBy = (id: string, evidence: readonly string[]): Promise<ClaimsRegister> =>
  withClaim(id, { status: "evidenced", phase: undefined, evidence: [...evidence] });

/**
 * A claim at `layer` with `status`. Tests that only need a claim of the layer
 * to re-evidence may take any claim there once no planned one is left.
 */
function claimWith(register: ClaimsRegister, layer: Layer, status: Status, anyStatus = false): Claim {
  const claim = register.claims.find((candidate) => candidate.layer === layer && candidate.status === status)
    ?? (anyStatus ? register.claims.find((candidate) => candidate.layer === layer) : undefined);
  if (claim === undefined) throw new Error(`the register has no ${status} ${layer} claim`);
  return claim;
}

// The exact findings a maintainer sees.
const shown = (unit: string): string => unit.length > 72 ? `${unit.slice(0, 72)}…` : unit;
const unruled = (guide: string, unit: string): string =>
  `${guide}: the guideline "${shown(unit)}" has no rule in ${CLAIMS_REGISTER}; add one with digest ${ruleDigest(unit)} and the claims that quote it, or an exempt reason`;
const changedGuideline = (guide: string, anchor: string, unit: string): string =>
  `${guide}: the guideline anchored at "${anchor}" changed; review its claims and set its digest to ${ruleDigest(unit)}`;
const orphanedRule = (guide: string, anchor: string): string =>
  `${guide}: no guideline contains the rule anchor "${anchor}"; remove the rule or update its anchor`;
const unquoted = (guide: string, anchor: string, id: string): string =>
  `${guide}: the rule anchored at "${anchor}" lists the claim ${id}, which quotes no text of its guideline; add the text it covers to the claim's alsoQuotes or remove it from the rule`;
const unlisted = (id: string, anchor: string): string =>
  `claim ${id} quotes the guideline anchored at "${anchor}", whose rule does not list it`;

/** The managed block names of scanned guide `path`. */
const blockNames = (register: ClaimsRegister, path: string): readonly string[] =>
  register.guides.find((guide) => guide.path === path)!.managedBlocks.map((block) => block.name);

/** The whitespace-normalized text between the markers of managed block `name`. */
function managedText(source: string, name: string): string {
  const lines = source.split("\n");
  const begin = lines.indexOf(`<!-- ${name}:start -->`);
  const end = lines.indexOf(`<!-- ${name}:end -->`);
  if (begin < 0 || end < begin) throw new Error(`the guide has no managed block ${name}`);
  return normalizeWhitespace(lines.slice(begin + 1, end).join("\n"));
}

// ---------------------------------------------------------------------------
// Guide text edits
// ---------------------------------------------------------------------------

const MARKER = /^<!-- [a-z0-9-]+:(?:start|end) -->$/u;
const isBlank = (line: string): boolean => line.trim() === "";

/** The body of the `# Guidelines` section as a half-open line range. */
function guidelinesBody(lines: readonly string[]): readonly [number, number] {
  const begin = lines.indexOf("# Guidelines") + 1;
  if (begin === 0) throw new Error("the guide needs a # Guidelines heading");
  const next = lines.findIndex((line, index) => index >= begin && line.startsWith("# "));
  return [begin, next < 0 ? lines.length : next];
}

/** Line indices before which a new guideline can go without joining a neighbour or a managed block. */
function insertionPoints(lines: readonly string[]): readonly number[] {
  const [begin, end] = guidelinesBody(lines);
  const points: number[] = [];
  let managed = false;
  for (let index = begin; index <= end; index += 1) {
    const line = index < end ? lines[index]! : null;
    const previous = index > begin ? lines[index - 1]! : null;
    const continues = line !== null && !isBlank(line) && !line.startsWith("- ") && !MARKER.test(line)
      && previous !== null && !isBlank(previous) && !MARKER.test(previous);
    if (!managed && !continues) points.push(index);
    if (line !== null && MARKER.test(line)) managed = line.endsWith(":start -->");
  }
  return points;
}

/** The first and last line of the guideline whose text contains `anchor`. */
function guidelineSpan(lines: readonly string[], anchor: string): readonly [number, number] {
  const at = lines.flatMap((line, index) => line.includes(anchor) ? [index] : []);
  if (at.length !== 1) throw new Error(`the anchor "${anchor}" must sit on exactly one line`);
  const ends = (line: string | undefined): boolean =>
    line === undefined || isBlank(line) || MARKER.test(line) || line.startsWith("# ");
  let first = at[0]!;
  while (!lines[first]!.startsWith("- ") && !ends(lines[first - 1])) first -= 1;
  let last = at[0]!;
  while (!ends(lines[last + 1]) && !lines[last + 1]!.startsWith("- ")) last += 1;
  return [first, last];
}

const escapeRegExp = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|/]/gu, "\\$&");

/** Matches `quote` in raw source text, across any whitespace layout. */
const quotePattern = (quote: string): RegExp => new RegExp(quote.split(" ").map(escapeRegExp).join("\\s+"), "gu");

/** Words for generated guidelines; none of the committed anchors or quotes is built from them alone. */
const WORDS = Object.freeze([
  "Keep", "never", "every", "checker", "bounded", "exact", "trace", "state", "record", "input", "window",
  "owner", "stable", "review", "reject", "archive", "orchard", "lantern", "quietly", "`verify`", "(example)",
  "v2.0.1", "docs/new.md", "safe,", "twice;", "done.",
]);

// ---------------------------------------------------------------------------
// The committed register
// ---------------------------------------------------------------------------

describe("committed claims register", () => {
  test("parses strictly and agrees with every scanned guide, source, and evidence path", async () => {
    const register = await readClaimsRegister();
    expect(register).toEqual(await committedRegister());
    expect(await registerFindings(register, DISK)).toEqual([]);
  });

  test("maps every guideline of every scanned guide to exactly one current rule", async () => {
    const register = await committedRegister();
    let guidelines = 0;
    for (const guide of register.guides) {
      const source = await repositoryText(guide.path);
      const units = guidelineUnits(source, blockNames(register, guide.path), guide.path);
      for (const block of guide.managedBlocks) expect(block.digest).toBe(ruleDigest(managedText(source, block.name)));
      const rules = register.rules.filter((rule) => rule.guide === guide.path);
      for (const unit of units) {
        const matching = rules.filter((rule) => unit.includes(rule.anchor));
        expect(matching.map((rule) => rule.anchor)).toHaveLength(1);
        expect(matching[0]!.digest).toBe(ruleDigest(unit));
      }
      for (const rule of rules) expect(units.filter((unit) => unit.includes(rule.anchor))).toHaveLength(1);
      expect(rules).toHaveLength(units.length);
      guidelines += units.length;
    }
    expect(register.rules).toHaveLength(guidelines);
  });

  test("cites only repository files as evidence", async () => {
    const register = await committedRegister();
    const paths = [...new Set(register.claims.flatMap((claim) => claim.evidence))].sort();
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect({ path, valid: isRepositoryPath(path), file: await DISK.isFile(path) }).toEqual({ path, valid: true, file: true });
    }
  });

  test("gives every claim a layer, a status, a not-verified scope, and a phase exactly when planned", async () => {
    const register = await committedRegister();
    for (const claim of register.claims) {
      expect(LAYERS).toContain(claim.layer);
      expect(STATUSES).toContain(claim.status);
      expect(claim.notVerified.length).toBeGreaterThan(0);
      expect(claim.phase !== null).toBe(claim.status === "planned");
      if (claim.status === "evidenced") {
        expect(claim.evidence.length).toBeGreaterThan(0);
        expect(["configuration-readback", "not-verified"]).not.toContain(claim.layer);
      }
    }
  });

  test("the check command passes on the committed tree and rejects any other invocation", () => {
    const run = (...args: string[]) => Bun.spawnSync([process.execPath, "run", "./scripts/verification-claims.ts", ...args], {
      cwd: REPOSITORY_ROOT,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const check = run("check");
    expect(check.stderr.toString()).toBe("");
    expect(check.stdout.toString()).toMatch(/^verification\/claims\.json: \d+ claims and \d+ guideline rules are current\n$/u);
    expect(check.exitCode).toBe(0);
    for (const args of [[], ["publish"], ["check", "render"]]) {
      const refused = run(...args);
      expect(refused.stderr.toString()).toBe("usage: bun run ./scripts/verification-claims.ts render|check\n");
      expect(refused.exitCode).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// The assurance case
// ---------------------------------------------------------------------------

describe("assurance case", () => {
  test("docs/assurance.md is the current rendering of the register", async () => {
    const current = await repositoryText(ASSURANCE_DOCUMENT);
    const rendered = renderAssurance(await committedRegister());
    expect(current === rendered ? "current" : `stale; run ${RENDER_COMMAND}`).toBe("current");
    expect(renderAssurance(await committedRegister())).toBe(rendered);
  });

  test("escapes backslashes and pipes so each table cell stays one cell", () => {
    expect(markdownTableCell("deny | ask")).toBe("deny \\| ask");
    expect(markdownTableCell("C:\\temp")).toBe("C:\\\\temp");
    expect(markdownTableCell("ends in \\")).toBe("ends in \\\\");
    expect(markdownTableCell("\\|")).toBe("\\\\\\|");
    expect(shownCellText("\\\\|")).toBeNull();
    const text = fc.oneof(
      fc.string({ maxLength: 40 }),
      fc.string({ unit: fc.constantFrom("\\", "|", "a", " ", "`"), maxLength: 40 }),
    );
    assertProperty(fc.property(text, (value) => {
      const cell = markdownTableCell(value);
      expect(cell).toBe(tableCell(value));
      expect(shownCellText(cell)).toBe(value);
    }));
  });

  test("states what the register does not verify and the environment it assumes", async () => {
    const register = await committedRegister();
    const document = await repositoryText(ASSURANCE_DOCUMENT);
    expect(document.split("\n").filter((line) => /^#{1,3} [^`]/u.test(line))).toEqual([
      "# Assurance case",
      "## Summary",
      "## What is not verified",
      "### Claims without an automated check",
      "### Exempt guidelines",
      "### Managed blocks outside the register",
      "### Guides outside the register",
      "## Environmental assumptions",
      "## Claims by area",
    ]);
    const section = (from: string, to: string): string =>
      document.slice(document.indexOf(`\n${from}\n`), document.indexOf(`\n${to}\n`));
    const scope = section("## What is not verified", "### Claims without an automated check");
    for (const item of register.notVerified) expect(scope).toContain(`\n- ${item}\n`);
    const unchecked = section("### Claims without an automated check", "### Exempt guidelines");
    const withoutCheck = register.claims.filter((claim) => claim.status === "not-verified");
    expect(withoutCheck.length).toBeGreaterThan(0);
    for (const claim of withoutCheck) expect(unchecked).toContain(`\n- \`${claim.id}\`: ${claim.statement} `);
    const exempt = section("### Exempt guidelines", "### Managed blocks outside the register");
    for (const rule of register.rules.filter((candidate) => candidate.exempt !== null)) {
      expect(exempt).toContain(`| ${tableCell(rule.anchor)}… | ${tableCell(rule.exempt!)} |`);
    }
    const managed = section("### Managed blocks outside the register", "### Guides outside the register");
    const blocks = register.guides.flatMap((guide) => guide.managedBlocks.map((block) => ({ guide: guide.path, block })));
    expect(blocks.map(({ block }) => block.name)).toEqual(["hraness-public-copy", "hraness-articles", "hraness-delivery", "hraness-ci", "algal-skills"]);
    for (const { guide, block } of blocks) {
      expect(managed).toContain(`\n| \`${guide}\` | \`${block.name}\` | ${tableCell(block.reason)} |\n`);
    }
    const outside = section("### Guides outside the register", "## Environmental assumptions");
    for (const excluded of register.excludedGuides) expect(outside).toContain(`\n- \`${excluded.prefix}\`: ${excluded.reason}\n`);
    const environment = section("## Environmental assumptions", "## Claims by area");
    for (const assumption of register.assumptions) {
      const users = register.claims.filter((claim) => claim.assumptions.includes(assumption.id)).length;
      expect(users).toBeGreaterThan(0);
      expect(environment).toContain(`\n| \`${assumption.id}\` | ${tableCell(assumption.statement)} | ${String(users)} |\n`);
    }
  });

  test("renders every claim once with its status, source, evidence, and not-verified scope", async () => {
    const register = await committedRegister();
    const document = await repositoryText(ASSURANCE_DOCUMENT);
    for (const claim of register.claims) {
      const heading = `\n#### \`${claim.id}\`\n`;
      const start = document.indexOf(heading);
      expect(start).toBeGreaterThan(0);
      expect(document.indexOf(heading, start + 1)).toBe(-1);
      const next = document.indexOf("\n#", start + heading.length);
      const entry = document.slice(start, next < 0 ? undefined : next);
      expect(entry).toContain(`\n${claim.statement}\n`);
      const status = {
        evidenced: /\n- Evidenced by [^\n]+\.\n/u,
        planned: new RegExp(`\\n- Planned: [^\\n]+ in plan Phase ${String(claim.phase)}\\.\\n`, "u"),
        "not-verified": /\n- Not verified(?:\.|; intended layer: [^\n]+\.)\n/u,
      }[claim.status];
      expect(entry).toMatch(status);
      expect(entry).toContain(`\n- Source: \`${claim.source.path}\`: “${claim.source.quote}”\n`);
      for (const quote of claim.alsoQuotes) expect(entry).toContain(`\n- Also covers: \`${quote.path}\`: “${quote.quote}”\n`);
      for (const named of claim.properties) expect(entry).toContain(`\`${named.path}\`: “${named.test}”`);
      for (const path of claim.evidence) expect(entry).toContain(`\`${path}\``);
      for (const item of claim.notVerified) expect(entry).toContain(item);
    }
  });

  test("the summary and layer table count every rendered claim exactly once", async () => {
    const register = await committedRegister();
    assertProperty(fc.property(fc.subarray([...register.claims], { minLength: 1 }), (claims) => {
      const rendered = renderAssurance({ ...register, claims });
      const tally = (status: Status): number => claims.filter((claim) => claim.status === status).length;
      expect(rendered).toContain(
        `The register holds ${String(claims.length)} ${claims.length === 1 ? "claim" : "claims"}: `
        + `${String(tally("evidenced"))} evidenced, ${String(tally("planned"))} planned, and ${String(tally("not-verified"))} not verified.`,
      );
      expect(rendered.match(/^#### `[a-z0-9-]+`$/gmu)).toHaveLength(claims.length);
      for (const claim of claims) expect(rendered).toContain(`\n#### \`${claim.id}\`\n`);
      const counted = rendered.split("\n")
        .filter((line) => /^\| [^|`]+ \| \d+ \| \d+ \| \d+ \|$/u.test(line))
        .flatMap((line) => line.slice(2, -2).split(" | ").slice(1).map(Number));
      expect(counted.reduce((sum, value) => sum + value, 0)).toBe(claims.length);
    }), { numRuns: 100 });
  });

  test("editing any rendered claim field leaves the committed case stale", async () => {
    const document = await committedDocument();
    const committed = await repositoryText(ASSURANCE_DOCUMENT);
    const count = listAt(document, ["claims"]).length;
    assertProperty(fc.property(
      fc.integer({ min: 0, max: count - 1 }),
      fc.constantFrom<JsonPath>(["statement"], ["source", "quote"], ["notVerified", 0], ["area"]),
      fc.stringMatching(/^[a-z]{1,12}(?:-[a-z]{1,12}){0,3}$/u),
      (index, field, word) => {
        const value = field[0] === "area" ? `changed-${word}` : `Changed ${word}.`;
        const rendered = renderAssurance(parseClaimsRegister(jsonWith(document, ["claims", index, ...field], value)));
        expect(rendered === committed).toBe(false);
        expect(rendered).toContain(value);
      },
    ), { numRuns: 100 });
  });
});

// ---------------------------------------------------------------------------
// Guideline coverage
// ---------------------------------------------------------------------------

describe("guideline coverage", () => {
  test("a new guideline fails the register until a rule with its digest lists claims or an exemption", async () => {
    const source = await repositoryText("AGENTS.md");
    const guideline = "Never let a new safety rule skip the claims register.";
    const changed = source.replace("# Guidelines\n\n", `# Guidelines\n\n- ${guideline}\n`);
    expect(changed).not.toBe(source);
    const files = { "AGENTS.md": changed };
    expect(await findingsFor(files)).toEqual([unruled("AGENTS.md", guideline)]);

    const document = await committedDocument();
    const rule = { guide: "AGENTS.md", anchor: "Never let a new safety rule", digest: ruleDigest(guideline) };
    const exempted = appended(document, ["rules"], { ...rule, exempt: "A test guideline." });
    expect(await findingsFor(files, parseClaimsRegister(exempted))).toEqual([]);

    // A rule lists exactly the claims that quote its guideline: an unrelated claim does not cover it.
    const someClaim = (await committedRegister()).claims.find((claim) => claim.alsoQuotes.length === 0)!;
    const claimIndex = indexWhere(document, ["claims"], (claim) => claim.id === someClaim.id);
    const listed = appended(document, ["rules"], { ...rule, claims: [someClaim.id] });
    expect(await findingsFor(files, parseClaimsRegister(listed))).toEqual([unquoted("AGENTS.md", rule.anchor, someClaim.id)]);
    const quote = [{ path: "AGENTS.md", quote: "a new safety rule skip the claims" }];
    expect(await findingsFor(files, parseClaimsRegister(jsonWith(listed, ["claims", claimIndex, "alsoQuotes"], quote)))).toEqual([]);
    expect(await findingsFor(files, parseClaimsRegister(jsonWith(exempted, ["claims", claimIndex, "alsoQuotes"], quote))))
      .toEqual([unlisted(someClaim.id, rule.anchor)]);
    const stale = parseClaimsRegister(appended(document, ["rules"], { ...rule, digest: ruleDigest("An older text."), exempt: "Test." }));
    expect(await findingsFor(files, stale)).toEqual([changedGuideline("AGENTS.md", rule.anchor, guideline)]);
  });

  test("a guideline added anywhere in any scanned guide fails until it has a rule", async () => {
    const register = await committedRegister();
    const guides = await Promise.all(register.guides.map(async (guide) => {
      const lines = (await repositoryText(guide.path)).split("\n");
      const taken = [
        ...register.rules.filter((rule) => rule.guide === guide.path).map((rule) => rule.anchor),
        ...register.claims.flatMap((claim) => [claim.source, ...claim.alsoQuotes])
          .filter((quote) => quote.path === guide.path).map((quote) => quote.quote),
      ];
      return Object.freeze({ path: guide.path, lines, points: insertionPoints(lines), taken });
    }));
    for (const guide of guides) expect(guide.points.length).toBeGreaterThan(1);
    const addition = fc.constantFrom(...guides).chain((guide) => fc.record({
      guide: fc.constant(guide),
      point: fc.constantFrom(...guide.points),
      words: fc.array(fc.constantFrom(...WORDS), { minLength: 2, maxLength: 24 }),
      breaks: fc.array(fc.boolean(), { minLength: 24, maxLength: 24 }),
      gaps: fc.array(fc.constantFrom(" ", "  ", "\t"), { minLength: 24, maxLength: 24 }),
      indent: fc.constantFrom("", "  ", "\t"),
    })).filter(({ guide, words }) => !guide.taken.some((text) => words.join(" ").includes(text)));
    await assertAsyncProperty(fc.asyncProperty(addition, async ({ guide, point, words, breaks, gaps, indent }) => {
      const inserted: string[] = [];
      let line = `- ${words[0]!}`;
      words.slice(1).forEach((word, index) => {
        if (breaks[index] === true) {
          inserted.push(line);
          line = `${indent}${word}`;
        } else {
          line += `${gaps[index]!}${word}`;
        }
      });
      inserted.push(line, "");
      const changed = guide.lines.toSpliced(point, 0, ...inserted).join("\n");
      expect(await findingsFor({ [guide.path]: changed }, register)).toEqual([unruled(guide.path, words.join(" "))]);
    }));
  });

  test("changing any guideline requires reviewing its claims and digest", async () => {
    const register = await committedRegister();
    const suffix = " Changed for the register test.";
    for (const rule of register.rules) {
      const guide = register.guides.find((candidate) => candidate.path === rule.guide)!;
      const source = await repositoryText(rule.guide);
      const unit = guidelineUnits(source, blockNames(register, guide.path), rule.guide).find((candidate) => candidate.includes(rule.anchor))!;
      const lines = source.split("\n");
      const [, last] = guidelineSpan(lines, rule.anchor);
      const changed = lines.with(last, `${lines[last]!}${suffix}`).join("\n");
      expect(await findingsFor({ [rule.guide]: changed }, register)).toEqual([
        changedGuideline(rule.guide, rule.anchor, `${unit}${suffix}`),
      ]);
    }
  });

  test("removing any guideline reports its orphaned rule and only the claims that rule lists", async () => {
    const register = await committedRegister();
    for (const rule of register.rules) {
      const lines = (await repositoryText(rule.guide)).split("\n");
      const [first, last] = guidelineSpan(lines, rule.anchor);
      const removed = lines.toSpliced(first, last - first + 1).join("\n");
      const findings = await findingsFor({ [rule.guide]: removed }, register);
      expect(findings).toContain(orphanedRule(rule.guide, rule.anchor));
      for (const finding of findings) {
        const expected = finding === orphanedRule(rule.guide, rule.anchor)
          || rule.claims.some((id) => finding.startsWith(`claim ${id} `));
        expect({ finding, expected }).toEqual({ finding, expected: true });
      }
    }
  });

  test("an AGENTS.md outside the scanned guides must be scanned or excluded", async () => {
    const guide = "# Guidelines\n\n- A rule in a new guide.\n";
    expect(await findingsFor({ "newdir/AGENTS.md": guide })).toEqual([
      `newdir/AGENTS.md is neither a scanned guide nor under an excluded prefix in ${CLAIMS_REGISTER}`,
    ]);
    expect(await findingsFor({ "kb/new-topic/AGENTS.md": guide, ".agents/skills/new/AGENTS.md": guide })).toEqual([]);
    const register = await committedRegister();
    expect(register.guides.map((entry) => entry.path)).toContain("verification/AGENTS.md");
  });

  test("a deleted, unlisted, or malformed scanned guide fails", async () => {
    const deleted = await findingsFor({ "website/AGENTS.md": null });
    expect(deleted).toContain("the scanned guide website/AGENTS.md does not exist");
    for (const finding of deleted) {
      expect(finding === "the scanned guide website/AGENTS.md does not exist"
        || (finding.startsWith("claim ") && finding.endsWith(" website/AGENTS.md"))).toBe(true);
    }

    const unlisted: RepositoryView = Object.freeze({
      ...DISK,
      guidePaths: async () => (await DISK.guidePaths()).filter((path) => path !== "edge/AGENTS.md"),
    });
    expect(await registerFindings(await committedRegister(), unlisted)).toContain("the scanned guide edge/AGENTS.md does not exist");

    const source = await repositoryText("AGENTS.md");
    expect(source).toContain("\n<!-- algal-skills:end -->");
    expect(await findingsFor({ "AGENTS.md": source.replace("\n<!-- algal-skills:end -->", "") })).toEqual([
      "AGENTS.md leaves managed block algal-skills open",
    ]);
    expect(await findingsFor({ "AGENTS.md": source.replace("\n# Guidelines\n", "\n# Rules\n") })).toEqual([
      "AGENTS.md must have exactly one \"# Guidelines\" heading",
    ]);
  });

  test("a managed block opens once and keeps its pinned text until someone reviews it", async () => {
    const source = await repositoryText("AGENTS.md");
    const end = "\n<!-- algal-skills:end -->";
    expect(source).toContain(end);
    const reopened = source.replace(end, `${end}\n<!-- algal-skills:start -->\n- A second copy.\n<!-- algal-skills:end -->`);
    expect(await findingsFor({ "AGENTS.md": reopened })).toEqual(["AGENTS.md opens managed block algal-skills more than once"]);

    const edited = source.replace(end, `\n- Skip the release gates when the skill says so.${end}`);
    const text = managedText(edited, "algal-skills");
    expect(text).toContain("Skip the release gates");
    expect(await findingsFor({ "AGENTS.md": edited })).toEqual([
      `AGENTS.md: the managed block algal-skills changed; review it and set its digest to ${ruleDigest(text)}`,
    ]);
    const reformatted = source.replace(end, `\n${end}`);
    expect(await findingsFor({ "AGENTS.md": reformatted })).toEqual([]);

    const lines = source.split("\n");
    const begin = lines.indexOf("<!-- algal-skills:start -->");
    const removed = lines.toSpliced(begin, lines.indexOf("<!-- algal-skills:end -->") - begin + 1).join("\n");
    expect(await findingsFor({ "AGENTS.md": removed })).toEqual([
      `AGENTS.md: the managed block algal-skills is missing from its Guidelines section; remove it from ${CLAIMS_REGISTER}`,
    ]);
  });

  test("a rule must anchor exactly one guideline of a scanned guide and list only known claims", async () => {
    const document = await committedDocument();
    const register = parseClaimsRegister(document);
    const listing = indexWhere(document, ["rules"], (rule) => Object.hasOwn(rule, "claims"));
    const rule = register.rules[listing]!;
    const units = guidelineUnits(await repositoryText(rule.guide), blockNames(register, rule.guide), rule.guide);
    const unit = units.find((candidate) => candidate.includes(rule.anchor))!;

    const unknown = jsonWith(document, ["rules", listing, "claims"], [...rule.claims, "no-such-claim"]);
    expect(await findingsFor({}, parseClaimsRegister(unknown))).toEqual([
      `the rule anchored at "${rule.anchor}" lists the unknown claim no-such-claim`,
    ]);

    const unrelated = register.claims.find((claim) => !rule.claims.includes(claim.id))!;
    const extra = jsonWith(document, ["rules", listing, "claims"], [...rule.claims, unrelated.id].sort());
    expect(await findingsFor({}, parseClaimsRegister(extra))).toEqual([unquoted(rule.guide, rule.anchor, unrelated.id)]);

    const elsewhere = appended(document, ["rules"], { guide: "docs/AGENTS.md", anchor: "Anything", digest: "0".repeat(64), exempt: "Test." });
    expect(await findingsFor({}, parseClaimsRegister(elsewhere))).toEqual([
      "the rule anchored at \"Anything\" names docs/AGENTS.md, which is not a scanned guide",
    ]);

    const common = "Keep";
    const hits = units.filter((candidate) => candidate.includes(common)).length;
    expect(hits).toBeGreaterThan(1);
    const vague = await findingsFor({}, parseClaimsRegister(jsonWith(document, ["rules", listing, "anchor"], common)));
    expect(vague).toContain(`${rule.guide}: the rule anchor "Keep" matches ${String(hits)} guidelines; lengthen it`);

    const longer = unit.slice(0, rule.anchor.length + 12).trim();
    expect(longer).not.toBe(rule.anchor);
    const twice = appended(document, ["rules"], { guide: rule.guide, anchor: longer, digest: rule.digest, exempt: "Test." });
    expect(await findingsFor({}, parseClaimsRegister(twice))).toEqual([
      `${rule.guide}: two rules anchor the guideline "${shown(unit)}"`,
    ]);
  });

  test("excluded prefixes must match a guide and never overlap the scanned guides", async () => {
    const document = await committedDocument();
    const excluded = (prefix: string): Promise<readonly string[]> =>
      findingsFor({}, parseClaimsRegister(appended(document, ["excludedGuides"], { prefix, reason: "Test." })));
    expect(await excluded("verification/")).toEqual(["verification/AGENTS.md is both scanned and excluded"]);
    expect(await excluded("nowhere/")).toEqual(["the excluded guide prefix nowhere/ matches no AGENTS.md"]);
  });
});

// ---------------------------------------------------------------------------
// Claims, sources, and evidence
// ---------------------------------------------------------------------------

describe("claims and evidence", () => {
  test("deleting any cited evidence path fails the register", async () => {
    const register = await committedRegister();
    const paths = [...new Set(register.claims.flatMap((claim) => claim.evidence))].sort();
    for (const path of paths) {
      const findings = await findingsFor({ [path]: null }, register);
      const expected = register.claims
        .filter((claim) => claim.evidence.includes(path))
        .map((claim) => `claim ${claim.id} cites the missing evidence path ${path}`);
      expect(findings).toEqual(expect.arrayContaining(expected));
    }
  });

  test("a directory or a missing file is not evidence, even for a planned claim", async () => {
    const register = await committedRegister();
    const example = claimWith(register, "example", "evidenced");
    expect(await findingsFor({}, await withClaim(example.id, { evidence: ["scripts"] }))).toEqual([
      `claim ${example.id} cites the missing evidence path scripts`,
      `claim ${example.id} is an evidenced example claim, but it cites no test file`,
    ]);
    const planned = claimWith(register, "quint", "planned");
    expect(await findingsFor({}, await withClaim(planned.id, { evidence: ["scripts/missing-evidence.test.ts"] }))).toEqual([
      `claim ${planned.id} cites the missing evidence path scripts/missing-evidence.test.ts`,
    ]);
    expect(await findingsFor({}, await withClaim(planned.id, { evidence: [] }))).toEqual([]);
  });

  test("removing any claim's quoted text from its source fails that claim", async () => {
    const register = await committedRegister();
    for (const claim of register.claims) {
      for (const quote of [claim.source, ...claim.alsoQuotes]) {
        const source = await repositoryText(quote.path);
        const removed = source.replace(quotePattern(quote.quote), "[quote removed]");
        expect(removed).not.toBe(source);
        expect(await findingsFor({ [quote.path]: removed }, register))
          .toContain(`claim ${claim.id} quotes text that ${quote.path} no longer contains`);
      }
    }
  });

  test("a claim must quote exactly one guideline, and that guideline's rule must list it", async () => {
    const register = await committedRegister();
    const claim = register.claims.find((candidate) => candidate.source.path === "AGENTS.md" && candidate.alsoQuotes.length === 0)!;
    const own = register.rules.find((rule) => rule.claims.includes(claim.id))!;
    // The claim's rule still lists it, so moving its only quote also leaves that rule listing a claim that no longer quotes it.
    const stale = unquoted("AGENTS.md", own.anchor, claim.id);
    const missing = await withClaim(claim.id, { source: { path: "docs/missing.md", quote: claim.source.quote } });
    expect(await findingsFor({}, missing)).toEqual([stale, `claim ${claim.id} cites the missing source docs/missing.md`]);

    const contents = "the CLI, page-capture runtime, strict data and protocol models";
    const guideUnits = guidelineUnits(await repositoryText("AGENTS.md"), blockNames(register, "AGENTS.md"), "AGENTS.md");
    expect(guideUnits.some((unit) => unit.includes(contents))).toBe(false);
    const outside = await withClaim(claim.id, { source: { path: "AGENTS.md", quote: contents } });
    expect(await findingsFor({}, outside)).toEqual([`claim ${claim.id} quotes AGENTS.md outside exactly one guideline`, stale]);

    const other = register.rules.find((rule) => rule.guide === "AGENTS.md" && !rule.claims.includes(claim.id))!;
    const misfiled = await withClaim(claim.id, { source: { path: "AGENTS.md", quote: other.anchor } });
    expect(await findingsFor({}, misfiled)).toEqual([unlisted(claim.id, other.anchor), stale]);

    // Every further quote obeys the same rule as the source.
    const further = await withClaim(claim.id, { alsoQuotes: [{ path: "AGENTS.md", quote: other.anchor }] });
    expect(await findingsFor({}, further)).toEqual([unlisted(claim.id, other.anchor)]);
    const outsideFurther = await withClaim(claim.id, { alsoQuotes: [{ path: "AGENTS.md", quote: contents }] });
    expect(await findingsFor({}, outsideFurther)).toEqual([`claim ${claim.id} quotes AGENTS.md outside exactly one guideline`]);
  });

  test("every assumption is declared and used, and the plan exists", async () => {
    const document = await committedDocument();
    const register = parseClaimsRegister(document);
    const unused = appended(document, ["assumptions"], { id: "unused-assumption", statement: "Nothing relies on this." });
    expect(await findingsFor({}, parseClaimsRegister(unused))).toEqual(["the assumption unused-assumption is not used by any claim"]);
    const claim = register.claims[0]!;
    const undeclared = await withClaim(claim.id, { assumptions: [...claim.assumptions, "undeclared-assumption"] });
    expect(await findingsFor({}, undeclared)).toEqual([`claim ${claim.id} names the unknown assumption undeclared-assumption`]);
    expect(await findingsFor({ [register.plan]: null }, register)).toContain(`the plan ${register.plan} does not exist`);
  });

  test("an evidenced property claim names tests that each run a property", async () => {
    const register = await committedRegister();
    const properties = register.claims.filter((claim) => claim.status === "evidenced" && claim.layer === "property");
    expect(properties.length).toBeGreaterThan(0);
    const markers = ["assertProperty(", "assertAsyncProperty(", "fc.assert(", "fc.property(", "fc.asyncProperty("];
    expect([...PROPERTY_MARKERS]).toEqual(markers);
    for (const claim of properties) {
      expect(claim.properties.length).toBeGreaterThan(0);
      for (const named of claim.properties) {
        // Strip the markers from the named test only; the file's other tests keep running properties.
        const source = await repositoryText(named.path);
        const blocks = testBlocks(source).filter((block) => block.title === named.test);
        expect(blocks).toHaveLength(1);
        const body = blocks[0]!.body;
        const stripped = source.replace(body, markers.reduce((text, marker) => text.replaceAll(marker, "check("), body));
        expect(testBlocks(stripped).some((block) => block.title !== named.test && markers.some((marker) => block.body.includes(marker))))
          .toBe(testBlocks(source).some((block) => block.title !== named.test && markers.some((marker) => block.body.includes(marker))));
        expect(await findingsFor({ [named.path]: stripped }, register))
          .toContain(`claim ${claim.id} names the test "${named.test}" in ${named.path}, which runs no property`);
      }
    }

    // A property elsewhere in the file does not evidence the named test.
    const claim = properties[0]!;
    const file = "scripts/synthetic.test.ts";
    const named = (test: string): Promise<ClaimsRegister> =>
      withClaim(claim.id, { evidence: [file], properties: [{ path: file, test }] });
    const unrelated = 'test("another law", () => {\n  assertProperty(fc.property(fc.nat(), () => true));\n});\n';
    const example = 'test("the named law", () => {\n  expect(1).toBe(1);\n});\n';
    expect(await findingsFor({ [file]: `${example}\n${unrelated}` }, await named("the named law"))).toEqual([
      `claim ${claim.id} names the test "the named law" in ${file}, which runs no property`,
    ]);
    expect(await findingsFor({ [file]: `${example}\n${unrelated}` }, await named("a missing law"))).toEqual([
      `claim ${claim.id} names the property test "a missing law", which ${file} does not declare`,
    ]);
    for (const marker of markers) {
      const running = `describe("laws", () => {\n  test.each([1])("the named law", () => {\n    ${marker}\n  });\n});\n${unrelated}`;
      expect(await findingsFor({ [file]: running }, await named("the named law"))).toEqual([]);
    }

    const notes = "docs/property-notes.md";
    const documentation = await withClaim(claim.id, { evidence: [notes], properties: [{ path: notes, test: "notes" }] });
    expect(await findingsFor({ [notes]: 'test("notes", () => { fc.property( });' }, documentation)).toEqual([
      `claim ${claim.id} names the property test "notes", which ${notes} does not declare`,
    ]);
  });

  test("an evidenced stateful-model claim names tests that run fast-check commands", async () => {
    const claim = claimWith(await committedRegister(), "stateful-model", "planned", true);
    const file = "scripts/synthetic-model.test.ts";
    const register = await withClaim(claim.id, {
      status: "evidenced", phase: undefined, evidence: [file], properties: [{ path: file, test: "the model" }],
    });
    expect(await findingsFor({ [file]: 'test("the model", () => {\n  assertProperty(fc.property(\n});\n' }, register)).toEqual([
      `claim ${claim.id} names the test "the model" in ${file}, which runs no stateful-model`,
    ]);
    for (const marker of ["fc.commands(", "fc.modelRun(", "fc.asyncModelRun("]) {
      expect(await findingsFor({ [file]: `test("the model", () => {\n  ${marker}\n});\n` }, register)).toEqual([]);
    }
  });

  test("an evidenced example claim cites at least one test file", async () => {
    const register = await committedRegister();
    const example = claimWith(register, "example", "evidenced");
    const refused = `claim ${example.id} is an evidenced example claim, but it cites no test file`;
    expect(await findingsFor({}, await withClaim(example.id, { evidence: ["edge/tsconfig.json"] }))).toEqual([refused]);
    expect(await findingsFor({}, await withClaim(example.id, { evidence: ["edge/tsconfig.json", "edge/imports.test.ts"] }))).toEqual([]);
    const planned = await withClaim(example.id, { status: "planned", phase: 2, evidence: ["edge/tsconfig.json"] });
    expect(await findingsFor({}, planned)).toEqual([]);
  });

  test("an evidenced Quint claim needs a cited model whose cited replay test drives production code", async () => {
    const claim = claimWith(await committedRegister(), "quint", "planned", true);
    const model = "verification/quint/lock.qnt";
    const replay = "scripts/verification-lock-replay.test.ts";
    const refused = `claim ${claim.id} is an evidenced Quint claim, but it cites no model whose replay test drives production code together with that test`;
    const models = await repositoryText("verification/quint/models.json");
    const manifest = JSON.parse(models) as JsonValue;
    expect(jsonAt(manifest, ["models", 0, "replay", "target"])).toBe("reference");
    const production = { "verification/quint/models.json": JSON.stringify(jsonWith(manifest, ["models", 0, "replay", "target"], "production")) };

    expect(await findingsFor({}, await evidencedBy(claim.id, [model, replay]))).toEqual([refused]);
    expect(await findingsFor(production, await evidencedBy(claim.id, [model, replay]))).toEqual([]);
    expect(await findingsFor(production, await evidencedBy(claim.id, [model]))).toEqual([refused]);
    expect(await findingsFor(production, await evidencedBy(claim.id, [replay]))).toEqual([refused]);
    expect(await findingsFor(
      { ...production, "scripts/other-replay.test.ts": "" },
      await evidencedBy(claim.id, [model, "scripts/other-replay.test.ts"]),
    )).toEqual([refused]);

    // An unparsable manifest refuses every evidenced Quint claim, the committed ones included.
    const broken = await findingsFor({ "verification/quint/models.json": "[]" }, await evidencedBy(claim.id, [model, replay]));
    const committed = (await committedRegister()).claims
      .filter((candidate) => candidate.layer === "quint" && candidate.status === "evidenced")
      .map((candidate) => `claim ${candidate.id} is an evidenced Quint claim, but it cites no model whose replay test drives production code together with that test`);
    expect(committed.length).toBeGreaterThan(0);
    expect([...broken].sort()).toEqual(
      ["verification/quint/models.json does not parse: models.json must be an object", refused, ...committed].sort(),
    );
  });

  test("an evidenced Lean claim needs both a Lean proof and a differential test", async () => {
    const claim = claimWith(await committedRegister(), "lean", "planned", true);
    const proof = "verification/lean/GhostgetVerification/Smoke.lean";
    const differential = "scripts/synthetic-differential.test.ts";
    const files = { [differential]: "", "src/Proof.lean": "" };
    const refused = `claim ${claim.id} is an evidenced Lean claim, but it does not cite both a Lean proof and a differential test`;
    expect(await findingsFor(files, await evidencedBy(claim.id, [proof, differential]))).toEqual([]);
    for (const evidence of [[proof], [differential], ["verification/lean/proofs.json", differential], ["src/Proof.lean", differential]]) {
      expect(await findingsFor(files, await evidencedBy(claim.id, evidence))).toEqual([refused]);
    }
  });

  test("an evidenced differential claim needs both an oracle or vector and a test", async () => {
    const claim = claimWith(await committedRegister(), "differential", "planned", true);
    const differential = "scripts/synthetic-differential.test.ts";
    const files = { [differential]: "" };
    const refused = `claim ${claim.id} is an evidenced differential claim, but it does not cite both an oracle or vector and a test`;
    for (const corpus of ["verification/oracles/README.md", "verification/vectors/README.md"]) {
      expect(await findingsFor(files, await evidencedBy(claim.id, [corpus, differential]))).toEqual([]);
      expect(await findingsFor(files, await evidencedBy(claim.id, [corpus]))).toEqual([refused]);
    }
    for (const evidence of [[differential], ["verification/seeds/README.md", differential]]) {
      expect(await findingsFor(files, await evidencedBy(claim.id, evidence))).toEqual([refused]);
    }
  });
});

// ---------------------------------------------------------------------------
// Guideline units and digests
// ---------------------------------------------------------------------------

describe("guideline units", () => {
  const GUIDE = [
    "# Contents",
    "",
    "- `src/` – not a guideline.",
    "",
    "# Guidelines",
    "",
    "- First guideline",
    "  continues here.",
    "- Second guideline.",
    "",
    "A paragraph guideline",
    "on two lines.",
    "   ",
    "-  Third\tguideline  with   spacing.",
    "-no-space is not a bullet.",
    "<!-- tooling:start -->",
    "- Managed text is skipped.",
    "",
    "Managed paragraph too.",
    "<!-- tooling:end -->",
    "- Fourth guideline.",
    "",
    "# Next section",
    "",
    "- Not a guideline either.",
  ].join("\n");
  const UNITS = [
    "First guideline continues here.",
    "Second guideline.",
    "A paragraph guideline on two lines.",
    "Third guideline with spacing. -no-space is not a bullet.",
    "Fourth guideline.",
  ];

  test("splits the Guidelines section at bullets and blank lines and skips listed managed blocks", () => {
    expect(guidelineUnits(GUIDE, ["tooling"], "guide")).toEqual(UNITS);
    expect(guidelineUnits(GUIDE.replaceAll("\n", "\r\n"), ["tooling"], "guide")).toEqual(UNITS);
    expect(guidelineUnits("# Guidelines\n", [], "guide")).toEqual([]);
    expect(guidelineUnits("# Guidelines\n\n\n", [], "guide")).toEqual([]);
  });

  test("rejects an ambiguous section or managed block", () => {
    const cases: readonly (readonly [string, readonly string[], string])[] = [
      ["# Contents\n\n- x\n", [], "guide must have exactly one \"# Guidelines\" heading"],
      ["# Guidelines \n\n- x\n", [], "guide must have exactly one \"# Guidelines\" heading"],
      ["# Guidelines\n\n- x\n\n# Guidelines\n\n- y\n", [], "guide must have exactly one \"# Guidelines\" heading"],
      ["# Guidelines\n<!-- other:start -->\n- x\n<!-- other:end -->\n", ["tooling"], "guide has an unlisted managed block other"],
      ["# Guidelines\n<!-- a:start -->\n<!-- b:start -->\n<!-- b:end -->\n<!-- a:end -->\n", ["a", "b"], "guide nests managed block b"],
      ["# Guidelines\n<!-- a:end -->\n", ["a"], "guide ends managed block a that is not open"],
      ["# Guidelines\n<!-- a:start -->\n<!-- b:end -->\n", ["a", "b"], "guide ends managed block b that is not open"],
      ["# Guidelines\n<!-- a:start -->\n- x\n", ["a"], "guide leaves managed block a open"],
      ["# Guidelines\n<!-- a:start -->\n- x\n# Next\n<!-- a:end -->\n", ["a"], "guide leaves managed block a open"],
    ];
    for (const [source, blocks, message] of cases) expect(() => guidelineUnits(source, blocks, "guide")).toThrow(message);
  });

  test("no text of the section outside managed blocks escapes a unit", () => {
    const word = fc.stringMatching(/^[A-Za-z0-9`.,;:()*_-]{1,8}$/u);
    const words = fc.array(word, { minLength: 1, maxLength: 6 }).map((items) => items.join(" "));
    const line = fc.oneof(
      fc.constantFrom("", " ", "\t"),
      words,
      words.map((text) => `- ${text}`),
      words.map((text) => `  ${text}`),
    );
    assertProperty(fc.property(fc.array(line, { maxLength: 30 }), (lines) => {
      const units = guidelineUnits(["# Guidelines", ...lines, "# After", "- tail"].join("\n"), [], "guide");
      const text = normalizeWhitespace(lines.map((entry) => entry.startsWith("- ") ? entry.slice(2) : entry).join(" "));
      expect(units.join(" ")).toBe(text);
      for (const unit of units) {
        expect(unit).not.toBe("");
        expect(normalizeWhitespace(unit)).toBe(unit);
      }
    }));
  });

  test("units ignore indentation, line breaks, blank lines, whitespace runs, and line endings", () => {
    const word = fc.stringMatching(/^[A-Za-z0-9`.,;:()_]{1,8}$/u);
    const unit = fc.record({
      words: fc.array(word, { minLength: 1, maxLength: 10 }),
      bullet: fc.boolean(),
      breaks: fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
      gaps: fc.array(fc.constantFrom(" ", "  ", "\t", "   "), { minLength: 10, maxLength: 10 }),
      indent: fc.constantFrom("", "  ", "\t"),
      blanks: fc.array(fc.constantFrom("", "   ", "\t"), { maxLength: 2 }),
    });
    assertProperty(fc.property(fc.array(unit, { minLength: 1, maxLength: 8 }), fc.boolean(), (units, crlf) => {
      const lines = ["# Contents", "", "- not a guideline", "", "# Guidelines"];
      for (const entry of units) {
        lines.push(...entry.blanks);
        if (!entry.bullet && entry.blanks.length === 0) lines.push("");
        let line = `${entry.bullet ? "- " : ""}${entry.words[0]!}`;
        entry.words.slice(1).forEach((item, index) => {
          if (entry.breaks[index] === true) {
            lines.push(line);
            line = `${entry.indent}${item}`;
          } else {
            line += `${entry.gaps[index]!}${item}`;
          }
        });
        lines.push(line);
      }
      lines.push("", "# Next", "- not a guideline either");
      const source = lines.join(crlf ? "\r\n" : "\n");
      expect(guidelineUnits(source, [], "guide")).toEqual(units.map((entry) => entry.words.join(" ")));
    }));
  });

  test("rule digests are SHA-256 over the UTF-8 text of the unit", () => {
    expect(ruleDigest("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(ruleDigest("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(ruleDigest("é")).toBe(createHash("sha256").update(new Uint8Array([0xc3, 0xa9])).digest("hex"));
  });

  test("whitespace normalization collapses every run, trims, and keeps all other text", () => {
    expect(normalizeWhitespace("  a \t b\n\nc  ")).toBe("a b c");
    expect(normalizeWhitespace(" x y﻿")).toBe("x y");
    assertProperty(fc.property(fc.string({ unit: "binary", maxLength: 80 }), (text) => {
      const normalized = normalizeWhitespace(text);
      expect(normalizeWhitespace(normalized)).toBe(normalized);
      expect(/^\s|\s$|\s\s|[^\S ]/u.test(normalized)).toBe(false);
      expect(normalized.replaceAll(" ", "")).toBe(text.replace(/\s/gu, ""));
    }));
  });
});

describe("test blocks", () => {
  test("a block runs from its test or it declaration to the next declaration", () => {
    const source = [
      'import { test } from "bun:test";',
      'describe("group", () => {',
      '  test("first law", () => {',
      '    assertProperty(fc.property(fc.nat(), () => true));',
      '  });',
      "  it('second \\'law\\'', () => {});",
      '  test.each([1, 2])(`third law %d`, () => {});',
      '  test.skipIf(process.platform === "win32")("fourth law", () => {',
      '    fc.assert(',
      '  });',
      '});',
      'const helper = () => test("inline", () => {});',
    ].join("\n");
    const blocks = testBlocks(source);
    expect(blocks.map((block) => block.title)).toEqual(["first law", "second \\'law\\'", "third law %d", "fourth law"]);
    expect(blocks[0]!.body).toContain("fc.property(");
    expect(blocks[1]!.body).not.toContain("fc.");
    expect(blocks[3]!.body).toContain("fc.assert(");
    expect(blocks[3]!.body).toContain("inline");
    expect(testBlocks("no tests here")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The strict register parser
// ---------------------------------------------------------------------------

describe("register parser", () => {
  test("accepts only normalized repository-relative paths", () => {
    for (const path of ["AGENTS.md", ".github/workflows/ci.yml", "src/control/AGENTS.md", "a/b@c+d-e_f.g", "x".repeat(300)]) {
      expect({ path, valid: isRepositoryPath(path) }).toEqual({ path, valid: true });
    }
    for (const path of [
      "", "/AGENTS.md", "AGENTS.md/", "a//b", "./a", "a/./b", "a/../b", ".", "..", "a b", "a\\b", "a\nb", "é.md", "~/.ssh/id", "x".repeat(301),
    ]) {
      expect({ path, valid: isRepositoryPath(path) }).toEqual({ path, valid: false });
    }
  });

  test("rejects each malformed field with the field that failed", async () => {
    const document = await committedDocument();
    const at = (path: JsonPath, value: JsonValue | undefined): JsonValue => jsonWith(document, path, value);
    const evidenced = indexWhere(document, ["claims"], (claim) => claim.status === "evidenced");
    const planned = indexWhere(document, ["claims"], (claim) => claim.status === "planned");
    const listing = indexWhere(document, ["rules"], (rule) => Object.hasOwn(rule, "claims"));
    const exempt = indexWhere(document, ["rules"], (rule) => Object.hasOwn(rule, "exempt"));
    const idAt = (index: number): string => String(jsonAt(document, ["claims", index, "id"]));
    const claim = `claim ${idAt(evidenced)}`;
    const plannedClaim = `claim ${idAt(planned)}`;
    const claimAt = (path: JsonPath, value: JsonValue | undefined): JsonValue => at(["claims", evidenced, ...path], value);
    expect(jsonAt(document, ["claims", evidenced, "layer"])).toBe("example");
    const property = indexWhere(document, ["claims"], (entry) => entry.layer === "property" && entry.status === "evidenced");
    const propertyClaim = `claim ${idAt(property)}`;
    const propertyAt = (path: JsonPath, value: JsonValue | undefined): JsonValue => at(["claims", property, ...path], value);
    const block = jsonAt(document, ["guides", 0, "managedBlocks", 0])!;
    const firstRule = jsonAt(document, ["rules", listing]);
    const cases: readonly (readonly [unknown, string])[] = [
      [[], "claims.json must be an object"],
      [new Map(), "claims.json must be an object"],
      [Object.create(document as object) as unknown, "claims.json must be an object"],
      [at(["schema"], "ghostget-claims-v1"), "claims.json has an unknown schema"],
      [at(["extra"], true), "claims.json has an unexpected field \"extra\""],
      [at(["rules"], undefined), "claims.json is missing rules"],
      [at(["plan"], "../plan.md"), "claims.json plan must be a normalized path relative to the repository root"],
      [at(["notVerified"], []), "claims.json notVerified must not be empty"],
      [at(["claims"], []), "claims.json claims must not be empty"],
      [at(["rules"], []), "claims.json rules must not be empty"],
      [at(["guides"], []), "claims.json guides must not be empty"],
      [at(["excludedGuides"], {}), "claims.json excludedGuides must be a list"],
      [at(["assumptions"], []), "claims.json assumptions must not be empty"],
      [at(["assumptions", 0, "id"], "Not Kebab"), "claims.json assumptions[0].id must be a lowercase kebab-case identifier"],
      [at(["guides", 0, "path"], "docs/README.md"), "claims.json guides[0].path must name an AGENTS.md"],
      [at(["guides", 0, "path"], "NOTAGENTS.md"), "claims.json guides[0].path must name an AGENTS.md"],
      [at(["guides", 0, "path"], "../AGENTS.md"), "claims.json guides[0].path must be a normalized path relative to the repository root"],
      [at(["guides", 0, "path"], "/AGENTS.md"), "claims.json guides[0].path must be a normalized path relative to the repository root"],
      [at(["guides", 0, "managedBlocks"], ["a"]), "claims.json guides[0].managedBlocks[0] must be an object"],
      [at(["guides", 0, "managedBlocks"], [block, block]), "claims.json guides[0].managedBlocks must not repeat a block"],
      [at(["guides", 0, "managedBlocks", 0, "digest"], "0".repeat(63)), "claims.json guides[0].managedBlocks[0].digest must be a SHA-256 hex digest"],
      [at(["guides", 0, "managedBlocks", 0, "name"], "Not Kebab"), "claims.json guides[0].managedBlocks[0].name must be a lowercase kebab-case identifier"],
      [at(["guides", 0, "managedBlocks", 0, "reason"], ""), "claims.json guides[0].managedBlocks[0].reason must be non-empty single-line text"],
      [at(["excludedGuides", 0, "prefix"], "kb"), "claims.json excludedGuides[0].prefix must be a repository directory ending in /"],
      [at(["excludedGuides", 0, "prefix"], "/"), "claims.json excludedGuides[0].prefix must be a repository directory ending in /"],
      [at(["excludedGuides", 0, "prefix"], "../kb/"), "claims.json excludedGuides[0].prefix must be a repository directory ending in /"],
      [at(["rules", listing, "exempt"], "Both."), `claims.json rules[${String(listing)}] must have either claims or an exempt reason`],
      [at(["rules", listing, "claims"], undefined), `claims.json rules[${String(listing)}] must have either claims or an exempt reason`],
      [at(["rules", listing, "digest"], "A".repeat(64)), `claims.json rules[${String(listing)}].digest must be a SHA-256 hex digest`],
      [at(["rules", listing, "digest"], "a".repeat(63)), `claims.json rules[${String(listing)}].digest must be a SHA-256 hex digest`],
      [at(["rules", listing, "claims"], []), `claims.json rules[${String(listing)}].claims must not be empty`],
      [at(["rules", listing, "claims"], ["x", "x"]), `claims.json rules[${String(listing)}].claims must not repeat an entry`],
      [at(["rules", listing, "anchor"], "x".repeat(301)), `claims.json rules[${String(listing)}].anchor must be non-empty single-line text of at most 300 characters`],
      [at(["rules", exempt, "exempt"], ""), `claims.json rules[${String(exempt)}].exempt must be non-empty single-line text of at most 1000 characters`],
      [claimAt(["id"], "Bad_Id"), `claims.json claims[${String(evidenced)}].id must be a lowercase kebab-case identifier`],
      [claimAt(["id"], "trailing-"), `claims.json claims[${String(evidenced)}].id must be a lowercase kebab-case identifier`],
      [claimAt(["id"], "a".repeat(81)), `claims.json claims[${String(evidenced)}].id must be a lowercase kebab-case identifier`],
      [claimAt(["extra"], 1), `claims.json claims[${String(evidenced)}] has an unexpected field "extra"`],
      [claimAt(["layer"], "proof"), `${claim} has an unknown layer`],
      [claimAt(["status"], "done"), `${claim} has an unknown status`],
      [at(["claims", planned, "phase"], 9), `${plannedClaim} is planned and needs its plan phase from 1 to 8`],
      [at(["claims", planned, "phase"], 0), `${plannedClaim} is planned and needs its plan phase from 1 to 8`],
      [at(["claims", planned, "phase"], 1.5), `${plannedClaim} is planned and needs its plan phase from 1 to 8`],
      [at(["claims", planned, "phase"], "3"), `${plannedClaim} is planned and needs its plan phase from 1 to 8`],
      [at(["claims", planned, "phase"], undefined), `${plannedClaim} is planned and needs its plan phase from 1 to 8`],
      [at(["claims", planned, "layer"], "configuration-readback"), `${plannedClaim} at the configuration-readback layer must have status not-verified`],
      [claimAt(["phase"], 3), `${claim} has a phase but is not planned`],
      [claimAt(["phase"], null), `${claim} has a phase but is not planned`],
      [claimAt(["layer"], "configuration-readback"), `${claim} cannot be evidenced at the configuration-readback layer`],
      [claimAt(["layer"], "not-verified"), `${claim} cannot be evidenced at the not-verified layer`],
      [claimAt(["evidence"], []), `${claim} is evidenced without evidence`],
      [claimAt(["evidence"], ["scripts/../x.ts"]), `${claim} evidence[0] must be a normalized path relative to the repository root`],
      [claimAt(["evidence"], ["a.ts", "a.ts"]), `${claim} evidence must not repeat an entry`],
      [claimAt(["evidence"], Array.from({ length: 65 }, (_, index) => `e${String(index)}.ts`)), `${claim} evidence is too long`],
      [claimAt(["statement"], "two  spaces"), `${claim} statement must be non-empty single-line text of at most 1000 characters`],
      [claimAt(["statement"], "line\nbreak"), `${claim} statement must be non-empty single-line text of at most 1000 characters`],
      [claimAt(["statement"], " leading"), `${claim} statement must be non-empty single-line text of at most 1000 characters`],
      [claimAt(["statement"], "x".repeat(1_001)), `${claim} statement must be non-empty single-line text of at most 1000 characters`],
      [claimAt(["area"], "Area"), `${claim} area must be a lowercase kebab-case identifier`],
      [claimAt(["source", "extra"], 1), `${claim} source has an unexpected field "extra"`],
      [claimAt(["source", "path"], "a\\b"), `${claim} source.path must be a normalized path relative to the repository root`],
      [claimAt(["source", "quote"], "x".repeat(601)), `${claim} source.quote must be non-empty single-line text of at most 600 characters`],
      [claimAt(["alsoQuotes"], []), `${claim} alsoQuotes must not be empty`],
      [claimAt(["alsoQuotes"], [jsonAt(document, ["claims", evidenced, "source"])!]), `${claim} repeats a quote`],
      [claimAt(["alsoQuotes"], [{ path: "AGENTS.md" }]), `${claim} alsoQuotes[0] is missing quote`],
      [claimAt(["properties"], [{ path: "a.test.ts", test: "x" }]), `${claim} names property tests but is at the example layer`],
      [propertyAt(["properties"], undefined), `${propertyClaim} is an evidenced property claim and must name the property tests that exercise its law`],
      [propertyAt(["properties"], []), `${propertyClaim} properties must not be empty`],
      [propertyAt(["properties", 0, "path"], "scripts/not-evidence.test.ts"), `${propertyClaim} properties[0].path must be one of the claim's evidence paths`],
      [propertyAt(["properties", 0, "test"], "two\nlines"), `${propertyClaim} properties[0].test must be a non-empty one-line test title of at most 300 characters`],
      [propertyAt(["properties", 0, "test"], "x".repeat(301)), `${propertyClaim} properties[0].test must be a non-empty one-line test title of at most 300 characters`],
      [propertyAt(["properties", 1], jsonAt(document, ["claims", property, "properties", 0])!), `${propertyClaim} properties must not repeat a test`],
      [claimAt(["assumptions"], ["Bad"]), `${claim} assumptions[0] must be a lowercase kebab-case identifier`],
      [claimAt(["notVerified"], []), `${claim} notVerified must not be empty`],
      [claimAt(["notVerified"], ["Same.", "Same."]), `${claim} notVerified must not repeat an entry`],
      [claimAt(["notVerified"], Array.from({ length: 17 }, (_, index) => `Item ${String(index)}.`)), `${claim} notVerified is too long`],
      [claimAt(["id"], idAt(planned)), `claims.json repeats "${idAt(planned)}"`],
      [appended(document, ["assumptions"], jsonAt(document, ["assumptions", 0])!), `claims.json repeats "${String(jsonAt(document, ["assumptions", 0, "id"]))}"`],
      [appended(document, ["guides"], { path: "AGENTS.md", managedBlocks: [] }), "claims.json repeats \"AGENTS.md\""],
      [appended(document, ["excludedGuides"], { prefix: "kb/", reason: "Again." }), "claims.json repeats \"kb/\""],
      [appended(document, ["rules"], firstRule!), `claims.json repeats "${String(jsonAt(document, ["rules", listing, "guide"]))} `],
    ];
    expect(() => parseClaimsRegister(document)).not.toThrow();
    for (const [candidate, message] of cases) expect(() => parseClaimsRegister(candidate)).toThrow(message);
  });

  test("rejects every type change, missing field, and unknown field", async () => {
    const document = await committedDocument();
    // A claim's further quotes are optional; every other field is required or required by its layer and status.
    assertProperty(fc.property(invalidatingMutation(document, ["alsoQuotes"]), (mutated) => rejects(() => parseClaimsRegister(mutated))));
  });

  test("accepts every well-formed claim and rule and keeps their values", async () => {
    const base = await committedDocument();
    if (!isJsonObject(base)) throw new Error("claims.json must be an object");
    const identifier = fc.array(fc.stringMatching(/^[a-z0-9]{1,6}$/u), { minLength: 1, maxLength: 4 }).map((parts) => parts.join("-"));
    const prose = (maximum: number) => fc.string({ unit: "binary", minLength: 1, maxLength: Math.min(maximum, 120) })
      .map(normalizeWhitespace)
      .filter((value) => value !== "");
    const segment = fc.stringMatching(/^[A-Za-z0-9._@+-]{1,10}$/u).filter((value) => value !== "." && value !== "..");
    const path = fc.array(segment, { minLength: 1, maxLength: 4 }).map((parts) => parts.join("/"));
    const pairs: (readonly [Layer, Status])[] = [
      ...(["example", "property", "stateful-model", "quint", "lean", "differential"] as const)
        .flatMap((layer) => STATUSES.map((status) => [layer, status] as const)),
      ["configuration-readback", "not-verified"],
      ["not-verified", "not-verified"],
    ];
    const quote = fc.record({ path, quote: prose(600) });
    const title = fc.string({ unit: "binary", minLength: 1, maxLength: 300 }).filter((value) => !/[\n\r]/u.test(value));
    const claim = fc.record({
      id: identifier,
      statement: prose(1_000),
      area: identifier,
      source: quote,
      alsoQuotes: fc.option(fc.uniqueArray(quote, { minLength: 1, maxLength: 3, selector: (entry) => `${entry.path} ${entry.quote}` }), { nil: null }),
      kind: fc.constantFrom(...pairs),
      phase: fc.integer({ min: 1, max: 8 }),
      evidence: fc.uniqueArray(path, { maxLength: 4 }),
      titles: fc.option(fc.uniqueArray(title, { minLength: 1, maxLength: 3 }), { nil: null }),
      assumptions: fc.uniqueArray(identifier, { maxLength: 4 }),
      notVerified: fc.uniqueArray(prose(1_000), { minLength: 1, maxLength: 4 }),
    }).filter((value) => (value.kind[1] !== "evidenced" || value.evidence.length > 0)
      && !(value.alsoQuotes ?? []).some((entry) => entry.path === value.source.path && entry.quote === value.source.quote))
      .map((value) => {
        const [layer, status] = value.kind;
        const propertyLayer = layer === "property" || layer === "stateful-model";
        const titles = !propertyLayer || value.evidence.length === 0 ? null
          : status === "evidenced" ? value.titles ?? ["the law"] : value.titles;
        const properties = titles === null ? null : titles.map((test, index) => ({ path: value.evidence[index % value.evidence.length]!, test }));
        return { ...value, properties };
      });
    const rule = fc.record({
      guide: path,
      anchor: prose(300),
      digest: fc.stringMatching(/^[0-9a-f]{64}$/u),
      claims: fc.option(fc.uniqueArray(identifier, { minLength: 1, maxLength: 4 }), { nil: null }),
      exempt: prose(1_000),
    });
    assertProperty(fc.property(claim, rule, (generated, generatedRule) => {
      const [layer, status] = generated.kind;
      const planned = status === "planned";
      const parsed = parseClaimsRegister({
        ...base,
        rules: [{
          guide: generatedRule.guide,
          anchor: generatedRule.anchor,
          digest: generatedRule.digest,
          ...(generatedRule.claims === null ? { exempt: generatedRule.exempt } : { claims: generatedRule.claims }),
        }],
        claims: [{
          id: generated.id,
          statement: generated.statement,
          area: generated.area,
          source: generated.source,
          ...(generated.alsoQuotes === null ? {} : { alsoQuotes: generated.alsoQuotes }),
          layer,
          status,
          ...(planned ? { phase: generated.phase } : {}),
          evidence: generated.evidence,
          ...(generated.properties === null ? {} : { properties: generated.properties }),
          assumptions: generated.assumptions,
          notVerified: generated.notVerified,
        }],
      });
      expect(parsed.claims).toEqual([{
        id: generated.id,
        statement: generated.statement,
        area: generated.area,
        source: generated.source,
        alsoQuotes: generated.alsoQuotes ?? [],
        layer,
        status,
        phase: planned ? generated.phase : null,
        evidence: generated.evidence,
        properties: generated.properties ?? [],
        assumptions: generated.assumptions,
        notVerified: generated.notVerified,
      }]);
      expect(parsed.rules).toEqual([{
        guide: generatedRule.guide,
        anchor: generatedRule.anchor,
        digest: generatedRule.digest,
        claims: generatedRule.claims ?? [],
        exempt: generatedRule.claims === null ? generatedRule.exempt : null,
      }]);
    }));
  });
});

// ---------------------------------------------------------------------------
// The working-tree view
// ---------------------------------------------------------------------------

describe("repository view", () => {
  test("lists every tracked or unignored AGENTS.md that is a regular file, and reads only repository files", async () => {
    const root = await mkdtemp(join(tmpdir(), "ghostget-claims-repository-"));
    try {
      const git = (...args: string[]): void => {
        const result = Bun.spawnSync(["git", ...args], {
          cwd: root,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1" },
        });
        if (result.exitCode !== 0) throw new Error(`git ${args[0] ?? ""} failed: ${result.stderr.toString()}`);
      };
      git("init", "-q");
      const files: Readonly<Record<string, string>> = {
        "AGENTS.md": "# Guidelines\n",
        "tracked/AGENTS.md": "tracked guide\n",
        "untracked/AGENTS.md": "untracked guide\n",
        "ignored/AGENTS.md": "ignored guide\n",
        "deleted/AGENTS.md": "deleted guide\n",
        "notes/NOT-AGENTS.md": "not a guide\n",
        ".gitignore": "ignored/\n",
      };
      for (const [path, text] of Object.entries(files)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), text);
      }
      git("add", "AGENTS.md", "tracked/AGENTS.md", "deleted/AGENTS.md", ".gitignore");
      await rm(join(root, "deleted", "AGENTS.md"));
      await mkdir(join(root, "directory", "AGENTS.md"), { recursive: true });
      await writeFile(join(root, "directory", "AGENTS.md", "keep"), "");

      const view = diskRepository(root);
      expect(await view.guidePaths()).toEqual(["AGENTS.md", "tracked/AGENTS.md", "untracked/AGENTS.md"]);
      expect(await view.readText("tracked/AGENTS.md")).toBe("tracked guide\n");
      expect(await view.isFile("ignored/AGENTS.md")).toBe(true);
      for (const path of ["deleted/AGENTS.md", "directory/AGENTS.md", "tracked", "../AGENTS.md", "/etc/hosts", "./AGENTS.md", "tracked//AGENTS.md", ""]) {
        expect({ path, file: await view.isFile(path), text: await view.readText(path) }).toEqual({ path, file: false, text: null });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
