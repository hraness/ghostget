/**
 * The claims register in `verification/claims.json` and the assurance case
 * rendered from it into `docs/assurance.md`.
 *
 * The register maps every guideline of every scanned `AGENTS.md` to the claims
 * that quote it, or to the reason it makes none, pins each synced managed block
 * by digest, and gives each claim its layer, status, evidence, assumptions, and
 * not-verified scope. `parseClaimsRegister` checks the shape;
 * `registerFindings` checks the register against the repository: guideline
 * and managed-block digests, that each rule lists exactly the claims quoting
 * its guideline, evidence paths, sources, and the evidence each checker layer
 * requires, down to the named property tests. `bun run verify:claims` runs both.
 */
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { REPOSITORY_ROOT, parseQuintModels } from "./verification-tools.js";

export const CLAIMS_REGISTER = "verification/claims.json";
export const ASSURANCE_DOCUMENT = "docs/assurance.md";
export const RENDER_COMMAND = "bun run ./scripts/verification-claims.ts render";

export const LAYERS = Object.freeze([
  "example",
  "property",
  "stateful-model",
  "quint",
  "lean",
  "differential",
  "configuration-readback",
  "not-verified",
] as const);
export type Layer = (typeof LAYERS)[number];

export const STATUSES = Object.freeze(["evidenced", "planned", "not-verified"] as const);
export type Status = (typeof STATUSES)[number];

const LAYER_LABELS: Readonly<Record<Layer, string>> = Object.freeze({
  example: "example test",
  property: "property test",
  "stateful-model": "stateful model",
  quint: "Quint model with production trace replay",
  lean: "Lean proof with differential test",
  differential: "differential oracle",
  "configuration-readback": "configuration readback",
  "not-verified": "none",
});

/** Layers whose checks can run in CI. The other two can never evidence a claim. */
const CHECKED_LAYERS: ReadonlySet<Layer> = new Set([
  "example", "property", "stateful-model", "quint", "lean", "differential",
]);

export type Quote = Readonly<{ path: string; quote: string }>;

/** One named test that runs a property, in one of the claim's evidence files. */
export type PropertyTest = Readonly<{ path: string; test: string }>;

export type Claim = Readonly<{
  id: string;
  statement: string;
  area: string;
  source: Quote;
  /** Further guideline text that states the same law, each checked like the source. */
  alsoQuotes: readonly Quote[];
  layer: Layer;
  status: Status;
  /** The plan phase that schedules a planned claim's layer. */
  phase: number | null;
  evidence: readonly string[];
  /** The property tests that exercise the law; required for an evidenced property or stateful-model claim. */
  properties: readonly PropertyTest[];
  assumptions: readonly string[];
  notVerified: readonly string[];
}>;

export type Rule = Readonly<{
  guide: string;
  /** Leading words that identify the guideline within its guide. */
  anchor: string;
  /** SHA-256 of the guideline's whitespace-normalized text. */
  digest: string;
  /** Exactly the claims whose source or further quote lies in the guideline. */
  claims: readonly string[];
  /** Why the guideline makes no claim; null when it lists claims. */
  exempt: string | null;
}>;

/**
 * A block between `<!-- name:start -->` and `<!-- name:end -->` in a guide's
 * Guidelines section, synced from outside this repository. Its guidelines have
 * no rules; the digest pins its text and the reason says why it is outside the
 * register.
 */
export type ManagedBlock = Readonly<{
  name: string;
  /** SHA-256 of the block's whitespace-normalized text. */
  digest: string;
  reason: string;
}>;

export type ClaimsRegister = Readonly<{
  plan: string;
  notVerified: readonly string[];
  assumptions: readonly Readonly<{ id: string; statement: string }>[];
  guides: readonly Readonly<{ path: string; managedBlocks: readonly ManagedBlock[] }>[];
  excludedGuides: readonly Readonly<{ prefix: string; reason: string }>[];
  rules: readonly Rule[];
  claims: readonly Claim[];
}>;

// ---------------------------------------------------------------------------
// Strict parsing
// ---------------------------------------------------------------------------

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const PATH_SEGMENT = /^[A-Za-z0-9._@+-]+$/u;
const MAX_TEXT = 1_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function exactFields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new Error(`${label} has an unexpected field ${JSON.stringify(key).slice(0, 64)}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing ${key}`);
  }
  return value;
}

/** Collapse every whitespace run to one space and trim, as rule digests and quotes do. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function text(value: unknown, label: string, maximum: number = MAX_TEXT): string {
  if (typeof value !== "string" || value === "" || value.length > maximum || value !== normalizeWhitespace(value)) {
    throw new Error(`${label} must be non-empty single-line text of at most ${String(maximum)} characters`);
  }
  return value;
}

function kebab(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 80 || !KEBAB.test(value)) {
    throw new Error(`${label} must be a lowercase kebab-case identifier`);
  }
  return value;
}

/** True for a normalized path relative to the repository root. */
export function isRepositoryPath(value: string): boolean {
  if (value.length === 0 || value.length > 300) return false;
  return value.split("/").every((segment) => PATH_SEGMENT.test(segment) && segment !== "." && segment !== "..");
}

function repositoryPath(value: unknown, label: string): string {
  if (typeof value !== "string" || !isRepositoryPath(value)) {
    throw new Error(`${label} must be a normalized path relative to the repository root`);
  }
  return value;
}

function list<T>(value: unknown, label: string, item: (entry: unknown, label: string) => T, options: Readonly<{
  nonEmpty?: boolean;
  maximum?: number;
  unique?: boolean;
}> = {}): readonly T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list`);
  if (options.nonEmpty === true && value.length === 0) throw new Error(`${label} must not be empty`);
  if (value.length > (options.maximum ?? 10_000)) throw new Error(`${label} is too long`);
  const items = value.map((entry, index) => item(entry, `${label}[${String(index)}]`));
  if (options.unique === true && new Set(items).size !== items.length) throw new Error(`${label} must not repeat an entry`);
  return Object.freeze(items);
}

function parseQuote(value: unknown, label: string): Quote {
  const quote = exactFields(value, ["path", "quote"], [], label);
  return Object.freeze({
    path: repositoryPath(quote.path, `${label}.path`),
    quote: text(quote.quote, `${label}.quote`, 600),
  });
}

/** Test titles are one line of at most 300 characters, as written between the quotes. */
function testTitle(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "" || value.length > 300 || /[\n\r]/u.test(value)) {
    throw new Error(`${label} must be a non-empty one-line test title of at most 300 characters`);
  }
  return value;
}

function parseClaim(value: unknown, label: string): Claim {
  const claim = exactFields(value, [
    "id", "statement", "area", "source", "layer", "status", "evidence", "assumptions", "notVerified",
  ], ["phase", "alsoQuotes", "properties"], label);
  const id = kebab(claim.id, `${label}.id`);
  const where = `claim ${id}`;
  if (typeof claim.layer !== "string" || !(LAYERS as readonly string[]).includes(claim.layer)) {
    throw new Error(`${where} has an unknown layer`);
  }
  if (typeof claim.status !== "string" || !(STATUSES as readonly string[]).includes(claim.status)) {
    throw new Error(`${where} has an unknown status`);
  }
  const layer = claim.layer as Layer;
  const status = claim.status as Status;
  let phase: number | null = null;
  if (status === "planned") {
    if (typeof claim.phase !== "number" || !Number.isInteger(claim.phase) || claim.phase < 1 || claim.phase > 8) {
      throw new Error(`${where} is planned and needs its plan phase from 1 to 8`);
    }
    phase = claim.phase;
  } else if (Object.hasOwn(claim, "phase")) {
    throw new Error(`${where} has a phase but is not planned`);
  }
  if (status === "evidenced" && !CHECKED_LAYERS.has(layer)) {
    throw new Error(`${where} cannot be evidenced at the ${layer} layer`);
  }
  if ((layer === "configuration-readback" || layer === "not-verified") && status !== "not-verified") {
    throw new Error(`${where} at the ${layer} layer must have status not-verified`);
  }
  const evidence = list(claim.evidence, `${where} evidence`, repositoryPath, { maximum: 64, unique: true });
  if (status === "evidenced" && evidence.length === 0) throw new Error(`${where} is evidenced without evidence`);
  const source = parseQuote(claim.source, `${where} source`);
  const alsoQuotes = Object.hasOwn(claim, "alsoQuotes")
    ? list(claim.alsoQuotes, `${where} alsoQuotes`, parseQuote, { nonEmpty: true, maximum: 16 })
    : Object.freeze([]);
  const quoted = [source, ...alsoQuotes].map((entry) => `${entry.path} ${entry.quote}`);
  if (new Set(quoted).size !== quoted.length) throw new Error(`${where} repeats a quote`);
  const propertyLayer = layer === "property" || layer === "stateful-model";
  if (Object.hasOwn(claim, "properties") && !propertyLayer) {
    throw new Error(`${where} names property tests but is at the ${layer} layer`);
  }
  const properties = Object.hasOwn(claim, "properties")
    ? list(claim.properties, `${where} properties`, (entry, entryLabel) => {
      const named = exactFields(entry, ["path", "test"], [], entryLabel);
      const path = repositoryPath(named.path, `${entryLabel}.path`);
      if (!evidence.includes(path)) throw new Error(`${entryLabel}.path must be one of the claim's evidence paths`);
      return Object.freeze({ path, test: testTitle(named.test, `${entryLabel}.test`) });
    }, { nonEmpty: true, maximum: 16 })
    : Object.freeze([]);
  if (new Set(properties.map((entry) => `${entry.path} ${entry.test}`)).size !== properties.length) {
    throw new Error(`${where} properties must not repeat a test`);
  }
  if (status === "evidenced" && propertyLayer && properties.length === 0) {
    throw new Error(`${where} is an evidenced ${layer} claim and must name the property tests that exercise its law`);
  }
  return Object.freeze({
    id,
    statement: text(claim.statement, `${where} statement`),
    area: kebab(claim.area, `${where} area`),
    source,
    alsoQuotes,
    layer,
    status,
    phase,
    evidence,
    properties,
    assumptions: list(claim.assumptions, `${where} assumptions`, kebab, { maximum: 32, unique: true }),
    notVerified: list(claim.notVerified, `${where} notVerified`, text, { nonEmpty: true, maximum: 16, unique: true }),
  });
}

function parseRule(value: unknown, label: string): Rule {
  const rule = exactFields(value, ["guide", "anchor", "digest"], ["claims", "exempt"], label);
  const hasClaims = Object.hasOwn(rule, "claims");
  if (hasClaims === Object.hasOwn(rule, "exempt")) throw new Error(`${label} must have either claims or an exempt reason`);
  if (typeof rule.digest !== "string" || !DIGEST.test(rule.digest)) throw new Error(`${label}.digest must be a SHA-256 hex digest`);
  return Object.freeze({
    guide: repositoryPath(rule.guide, `${label}.guide`),
    anchor: text(rule.anchor, `${label}.anchor`, 300),
    digest: rule.digest,
    claims: hasClaims ? list(rule.claims, `${label}.claims`, kebab, { nonEmpty: true, maximum: 64, unique: true }) : Object.freeze([]),
    exempt: hasClaims ? null : text(rule.exempt, `${label}.exempt`),
  });
}

/** Parse the register strictly: exact fields, bounded text, unique identifiers. */
export function parseClaimsRegister(value: unknown): ClaimsRegister {
  const register = exactFields(value, [
    "schema", "plan", "notVerified", "assumptions", "guides", "excludedGuides", "rules", "claims",
  ], [], "claims.json");
  if (register.schema !== "ghostget-claims-v2") throw new Error("claims.json has an unknown schema");
  const assumptions = list(register.assumptions, "claims.json assumptions", (entry, label) => {
    const assumption = exactFields(entry, ["id", "statement"], [], label);
    return Object.freeze({ id: kebab(assumption.id, `${label}.id`), statement: text(assumption.statement, `${label}.statement`) });
  }, { nonEmpty: true, maximum: 256 });
  const guides = list(register.guides, "claims.json guides", (entry, label) => {
    const guide = exactFields(entry, ["path", "managedBlocks"], [], label);
    const path = repositoryPath(guide.path, `${label}.path`);
    if (path !== "AGENTS.md" && !path.endsWith("/AGENTS.md")) throw new Error(`${label}.path must name an AGENTS.md`);
    const managedBlocks = list(guide.managedBlocks, `${label}.managedBlocks`, (block, blockLabel): ManagedBlock => {
      const managed = exactFields(block, ["name", "digest", "reason"], [], blockLabel);
      if (typeof managed.digest !== "string" || !DIGEST.test(managed.digest)) {
        throw new Error(`${blockLabel}.digest must be a SHA-256 hex digest`);
      }
      return Object.freeze({
        name: kebab(managed.name, `${blockLabel}.name`),
        digest: managed.digest,
        reason: text(managed.reason, `${blockLabel}.reason`),
      });
    }, { maximum: 32 });
    const names = managedBlocks.map((block) => block.name);
    if (new Set(names).size !== names.length) throw new Error(`${label}.managedBlocks must not repeat a block`);
    return Object.freeze({ path, managedBlocks });
  }, { nonEmpty: true, maximum: 256 });
  const excludedGuides = list(register.excludedGuides, "claims.json excludedGuides", (entry, label) => {
    const excluded = exactFields(entry, ["prefix", "reason"], [], label);
    const prefix = excluded.prefix;
    if (typeof prefix !== "string" || !prefix.endsWith("/") || !isRepositoryPath(prefix.slice(0, -1))) {
      throw new Error(`${label}.prefix must be a repository directory ending in /`);
    }
    return Object.freeze({ prefix, reason: text(excluded.reason, `${label}.reason`) });
  }, { maximum: 64 });
  const rules = list(register.rules, "claims.json rules", parseRule, { nonEmpty: true });
  const claims = list(register.claims, "claims.json claims", parseClaim, { nonEmpty: true });
  const duplicate = (items: readonly string[]): string | undefined =>
    items.find((item, index) => items.indexOf(item) !== index);
  const repeated = duplicate(claims.map((claim) => claim.id))
    ?? duplicate(assumptions.map((assumption) => assumption.id))
    ?? duplicate(guides.map((guide) => guide.path))
    ?? duplicate(excludedGuides.map((excluded) => excluded.prefix))
    ?? duplicate(rules.map((rule) => `${rule.guide} ${rule.anchor}`));
  if (repeated !== undefined) throw new Error(`claims.json repeats ${JSON.stringify(repeated).slice(0, 120)}`);
  return Object.freeze({
    plan: repositoryPath(register.plan, "claims.json plan"),
    notVerified: list(register.notVerified, "claims.json notVerified", text, { nonEmpty: true, maximum: 64, unique: true }),
    assumptions,
    guides,
    excludedGuides,
    rules,
    claims,
  });
}

// ---------------------------------------------------------------------------
// Guideline units
// ---------------------------------------------------------------------------

const MANAGED_MARKER = /^<!-- ([a-z0-9-]+):(start|end) -->$/u;

export type GuideSections = Readonly<{
  /** The guideline units outside managed blocks. */
  units: readonly string[];
  /** Each managed block's whitespace-normalized text, by name. */
  blocks: ReadonlyMap<string, string>;
}>;

/**
 * Split the `# Guidelines` section of an `AGENTS.md` into guideline units. A
 * `- ` bullet or a blank line ends the current unit, other lines continue it,
 * and the text between a listed managed marker pair is set aside as that
 * block. Each listed block may open at most once. Units and blocks are
 * whitespace-normalized.
 */
export function guideSections(source: string, managedBlocks: readonly string[], label: string): GuideSections {
  const lines = source.replace(/\r\n/gu, "\n").split("\n");
  const starts = lines.flatMap((line, index) => line === "# Guidelines" ? [index] : []);
  if (starts.length !== 1) throw new Error(`${label} must have exactly one "# Guidelines" heading`);
  const begin = starts[0]! + 1;
  const next = lines.findIndex((line, index) => index >= begin && line.startsWith("# "));
  const body = lines.slice(begin, next < 0 ? lines.length : next);
  const units: string[] = [];
  const blocks = new Map<string, string[]>();
  let current: string[] | null = null;
  let skipping: string | null = null;
  const close = (): void => {
    if (current !== null) units.push(normalizeWhitespace(current.join(" ")));
    current = null;
  };
  for (const line of body) {
    const marker = MANAGED_MARKER.exec(line);
    if (marker !== null) {
      close();
      const [, name, edge] = marker;
      if (edge === "start") {
        if (!managedBlocks.includes(name!)) throw new Error(`${label} has an unlisted managed block ${name!}`);
        if (skipping !== null) throw new Error(`${label} nests managed block ${name!}`);
        if (blocks.has(name!)) throw new Error(`${label} opens managed block ${name!} more than once`);
        blocks.set(name!, []);
        skipping = name!;
      } else {
        if (skipping !== name) throw new Error(`${label} ends managed block ${name!} that is not open`);
        skipping = null;
      }
      continue;
    }
    if (skipping !== null) {
      blocks.get(skipping)!.push(line);
      continue;
    }
    if (line.trim() === "") {
      close();
    } else if (line.startsWith("- ")) {
      close();
      current = [line.slice(2)];
    } else if (current === null) {
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (skipping !== null) throw new Error(`${label} leaves managed block ${skipping} open`);
  close();
  return Object.freeze({
    units: Object.freeze(units.filter((unit) => unit !== "")),
    blocks: new Map([...blocks].map(([name, text]) => [name, normalizeWhitespace(text.join("\n"))])),
  });
}

/** The guideline units of a guide; see `guideSections`. */
export function guidelineUnits(source: string, managedBlocks: readonly string[], label: string): readonly string[] {
  return guideSections(source, managedBlocks, label).units;
}

export function ruleDigest(unit: string): string {
  return createHash("sha256").update(unit, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Repository checks
// ---------------------------------------------------------------------------

export type RepositoryView = Readonly<{
  /** True when the repository path names a regular file. */
  isFile(path: string): Promise<boolean>;
  /** The UTF-8 text of a repository file, or null when it is not a regular file. */
  readText(path: string): Promise<string | null>;
  /** Every `AGENTS.md` in the repository that Git tracks or does not ignore. */
  guidePaths(): Promise<readonly string[]>;
}>;

/** A view of the working tree at `root`. Guides come from `git ls-files`. */
export function diskRepository(root: string = REPOSITORY_ROOT): RepositoryView {
  const isFile = async (path: string): Promise<boolean> => {
    if (!isRepositoryPath(path)) return false;
    try {
      return (await stat(join(root, path))).isFile();
    } catch {
      return false;
    }
  };
  return Object.freeze({
    isFile,
    async readText(path: string) {
      return await isFile(path) ? readFile(join(root, path), "utf8") : null;
    },
    async guidePaths() {
      const listed = Bun.spawnSync(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
        cwd: root,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      if (listed.exitCode !== 0) throw new Error("git ls-files must list the repository files to find every AGENTS.md");
      const paths = listed.stdout.toString("utf8").split("\0")
        .filter((path) => path === "AGENTS.md" || path.endsWith("/AGENTS.md"));
      const present = await Promise.all(paths.map(async (path) => await isFile(path) ? [path] : []));
      return Object.freeze([...new Set(present.flat())].sort());
    },
  });
}

export const PROPERTY_MARKERS = Object.freeze([
  "assertProperty(", "assertAsyncProperty(", "fc.assert(", "fc.property(", "fc.asyncProperty(",
]);
export const STATEFUL_MODEL_MARKERS = Object.freeze(["fc.commands(", "fc.modelRun(", "fc.asyncModelRun("]);
const TEST_FILE = /\.test\.(?:ts|tsx|mjs)$/u;

/** A `test`, `it`, or `describe` call with a literal title at the start of a line. */
const TEST_DECLARATION = /(?:^|\n)[ \t]*(test|it|describe)(?:\.[A-Za-z]+(?:\([^()\n]*\))?)*\(\s*(["'`])((?:\\.|(?!\2)[^\\\n])*)\2/gu;

export type TestBlock = Readonly<{ title: string; body: string }>;

/**
 * The `test` and `it` blocks of a test file, each running from its declaration
 * to the next `test`, `it`, or `describe` declaration. A title is the literal
 * text between its quotes. This is a lexical view: a property that a test runs
 * only through a helper defined elsewhere does not count.
 */
export function testBlocks(source: string): readonly TestBlock[] {
  const declarations = [...source.matchAll(TEST_DECLARATION)];
  return Object.freeze(declarations.flatMap((match, index) => {
    if (match[1] === "describe") return [];
    const end = index + 1 < declarations.length ? declarations[index + 1]!.index : source.length;
    return [Object.freeze({ title: match[3]!, body: source.slice(match.index, end) })];
  }));
}

function preview(unit: string): string {
  return unit.length > 72 ? `${unit.slice(0, 72)}…` : unit;
}

/** Every quote of a claim: its source, then its further quotes. */
export function claimQuotes(claim: Claim): readonly Quote[] {
  return [claim.source, ...claim.alsoQuotes];
}

/**
 * Checks for guideline coverage: every guideline of every scanned guide has
 * exactly one current rule, every listed managed block appears once with its
 * pinned text, and each rule lists exactly the claims that quote its guideline.
 */
async function guideFindings(register: ClaimsRegister, repository: RepositoryView, claimIds: ReadonlySet<string>): Promise<{
  findings: string[];
  units: ReadonlyMap<string, readonly string[]>;
}> {
  const findings: string[] = [];
  const units = new Map<string, readonly string[]>();
  const scanned = new Set(register.guides.map((guide) => guide.path));
  const present = await repository.guidePaths();
  for (const path of present) {
    const excluded = register.excludedGuides.some((entry) => path.startsWith(entry.prefix));
    if (!scanned.has(path) && !excluded) {
      findings.push(`${path} is neither a scanned guide nor under an excluded prefix in ${CLAIMS_REGISTER}`);
    }
    if (scanned.has(path) && excluded) findings.push(`${path} is both scanned and excluded`);
  }
  for (const entry of register.excludedGuides) {
    if (!present.some((path) => path.startsWith(entry.prefix))) {
      findings.push(`the excluded guide prefix ${entry.prefix} matches no AGENTS.md`);
    }
  }
  /** The rule each guideline unit resolves to, by guide. */
  const unitRules = new Map<string, ReadonlyMap<number, Rule>>();
  for (const guide of register.guides) {
    const source = await repository.readText(guide.path);
    if (source === null || !present.includes(guide.path)) {
      findings.push(`the scanned guide ${guide.path} does not exist`);
      continue;
    }
    let sections: GuideSections;
    try {
      sections = guideSections(source, guide.managedBlocks.map((block) => block.name), guide.path);
    } catch (error) {
      findings.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    const guideUnits = sections.units;
    units.set(guide.path, guideUnits);
    for (const block of guide.managedBlocks) {
      const text = sections.blocks.get(block.name);
      if (text === undefined) {
        findings.push(`${guide.path}: the managed block ${block.name} is missing from its Guidelines section; remove it from ${CLAIMS_REGISTER}`);
      } else if (ruleDigest(text) !== block.digest) {
        findings.push(`${guide.path}: the managed block ${block.name} changed; review it and set its digest to ${ruleDigest(text)}`);
      }
    }
    const rules = register.rules.filter((rule) => rule.guide === guide.path);
    const matched = new Map<number, Rule>();
    for (const rule of rules) {
      const hits = guideUnits.flatMap((unit, index) => unit.includes(rule.anchor) ? [index] : []);
      if (hits.length !== 1) {
        findings.push(hits.length === 0
          ? `${guide.path}: no guideline contains the rule anchor "${rule.anchor}"; remove the rule or update its anchor`
          : `${guide.path}: the rule anchor "${rule.anchor}" matches ${String(hits.length)} guidelines; lengthen it`);
        continue;
      }
      const index = hits[0]!;
      if (matched.has(index)) findings.push(`${guide.path}: two rules anchor the guideline "${preview(guideUnits[index]!)}"`);
      else matched.set(index, rule);
      const digest = ruleDigest(guideUnits[index]!);
      if (digest !== rule.digest) {
        findings.push(`${guide.path}: the guideline anchored at "${rule.anchor}" changed; review its claims and set its digest to ${digest}`);
      }
    }
    guideUnits.forEach((unit, index) => {
      if (!matched.has(index)) {
        findings.push(`${guide.path}: the guideline "${preview(unit)}" has no rule in ${CLAIMS_REGISTER}; add one with digest ${ruleDigest(unit)} and the claims that quote it, or an exempt reason`);
      }
    });
    unitRules.set(guide.path, matched);
  }
  for (const rule of register.rules) {
    if (!scanned.has(rule.guide)) findings.push(`the rule anchored at "${rule.anchor}" names ${rule.guide}, which is not a scanned guide`);
    for (const id of rule.claims) {
      if (!claimIds.has(id)) findings.push(`the rule anchored at "${rule.anchor}" lists the unknown claim ${id}`);
    }
  }
  // A rule lists a claim exactly when one of the claim's quotes lies in its guideline.
  const quoting = new Map<Rule, Set<string>>();
  for (const claim of register.claims) {
    for (const quote of claimQuotes(claim)) {
      const guideUnits = units.get(quote.path);
      if (guideUnits === undefined) continue;
      const hits = guideUnits.flatMap((unit, index) => unit.includes(quote.quote) ? [index] : []);
      if (hits.length !== 1) {
        findings.push(`claim ${claim.id} quotes ${quote.path} outside exactly one guideline`);
        continue;
      }
      const rule = unitRules.get(quote.path)?.get(hits[0]!);
      if (rule === undefined) continue;
      if (!quoting.has(rule)) quoting.set(rule, new Set());
      quoting.get(rule)!.add(claim.id);
      if (!rule.claims.includes(claim.id)) {
        findings.push(`claim ${claim.id} quotes the guideline anchored at "${rule.anchor}", whose rule does not list it`);
      }
    }
  }
  for (const [path, matched] of unitRules) {
    for (const rule of matched.values()) {
      for (const id of rule.claims) {
        if (claimIds.has(id) && quoting.get(rule)?.has(id) !== true) {
          findings.push(`${path}: the rule anchored at "${rule.anchor}" lists the claim ${id}, which quotes no text of its guideline; add the text it covers to the claim's alsoQuotes or remove it from the rule`);
        }
      }
    }
  }
  return { findings, units };
}

async function evidenceFindings(claim: Claim, repository: RepositoryView, models: ReturnType<typeof parseQuintModels> | null): Promise<string[]> {
  const findings: string[] = [];
  const where = `claim ${claim.id}`;
  for (const path of claim.evidence) {
    if (!await repository.isFile(path)) findings.push(`${where} cites the missing evidence path ${path}`);
  }
  if (claim.status !== "evidenced") return findings;
  const tests = claim.evidence.filter((path) => TEST_FILE.test(path));
  const namedProperties = async (markers: readonly string[], kind: string): Promise<void> => {
    for (const named of claim.properties) {
      const body = TEST_FILE.test(named.path) ? await repository.readText(named.path) : null;
      const blocks = body === null ? [] : testBlocks(body).filter((block) => block.title === named.test);
      if (blocks.length === 0) {
        findings.push(`${where} names the ${kind} test "${named.test}", which ${named.path} does not declare`);
      } else if (!blocks.some((block) => markers.some((marker) => block.body.includes(marker)))) {
        findings.push(`${where} names the test "${named.test}" in ${named.path}, which runs no ${kind}`);
      }
    }
  };
  switch (claim.layer) {
    case "example":
      if (tests.length === 0) findings.push(`${where} is an evidenced example claim, but it cites no test file`);
      break;
    case "property":
      await namedProperties(PROPERTY_MARKERS, "property");
      break;
    case "stateful-model":
      await namedProperties(STATEFUL_MODEL_MARKERS, "stateful-model");
      break;
    case "quint": {
      const cited = (models ?? []).filter((model) => claim.evidence.includes(`verification/quint/${model.file}`));
      if (!cited.some((model) => model.replay.target === "production" && claim.evidence.includes(model.replay.test))) {
        findings.push(`${where} is an evidenced Quint claim, but it cites no model whose replay test drives production code together with that test`);
      }
      break;
    }
    case "lean":
      if (!claim.evidence.some((path) => path.startsWith("verification/lean/") && path.endsWith(".lean")) || tests.length === 0) {
        findings.push(`${where} is an evidenced Lean claim, but it does not cite both a Lean proof and a differential test`);
      }
      break;
    case "differential":
      if (!claim.evidence.some((path) => path.startsWith("verification/oracles/") || path.startsWith("verification/vectors/"))
        || tests.length === 0) {
        findings.push(`${where} is an evidenced differential claim, but it does not cite both an oracle or vector and a test`);
      }
      break;
    default:
      break;
  }
  return findings;
}

/**
 * Check the register against the repository. An empty result means every
 * guideline has a current rule listing exactly the claims that quote it, every
 * managed block is pinned, every claim's quotes and evidence exist, and every
 * evidenced claim meets its layer's evidence rule.
 */
export async function registerFindings(register: ClaimsRegister, repository: RepositoryView): Promise<readonly string[]> {
  const claimIds = new Set(register.claims.map((claim) => claim.id));
  const { findings } = await guideFindings(register, repository, claimIds);
  if (!await repository.isFile(register.plan)) findings.push(`the plan ${register.plan} does not exist`);
  const catalog = new Set(register.assumptions.map((assumption) => assumption.id));
  const used = new Set(register.claims.flatMap((claim) => claim.assumptions));
  for (const id of catalog) {
    if (!used.has(id)) findings.push(`the assumption ${id} is not used by any claim`);
  }
  const modelsText = await repository.readText("verification/quint/models.json");
  let models: ReturnType<typeof parseQuintModels> | null = null;
  try {
    models = modelsText === null ? null : parseQuintModels(JSON.parse(modelsText) as unknown);
  } catch (error) {
    findings.push(`verification/quint/models.json does not parse: ${error instanceof Error ? error.message : String(error)}`);
  }
  /** Whitespace-normalized source files, read once each. */
  const sources = new Map<string, string | null>();
  for (const claim of register.claims) {
    const where = `claim ${claim.id}`;
    for (const id of claim.assumptions) {
      if (!catalog.has(id)) findings.push(`${where} names the unknown assumption ${id}`);
    }
    for (const quote of claimQuotes(claim)) {
      if (!sources.has(quote.path)) {
        const source = await repository.readText(quote.path);
        sources.set(quote.path, source === null ? null : normalizeWhitespace(source));
      }
      const source = sources.get(quote.path) ?? null;
      if (source === null) {
        findings.push(`${where} cites the missing source ${quote.path}`);
      } else if (!source.includes(quote.quote)) {
        findings.push(`${where} quotes text that ${quote.path} no longer contains`);
      }
    }
    findings.push(...await evidenceFindings(claim, repository, models));
  }
  return Object.freeze(findings);
}

// ---------------------------------------------------------------------------
// Assurance case
// ---------------------------------------------------------------------------

/**
 * Escape single-line text for one Markdown table cell. Backslashes are escaped
 * along with pipes; otherwise the text `a\|b` would render as `a\\|b`, where
 * the pipe splits the cell.
 */
export function markdownTableCell(value: string): string {
  return value.replace(/[\\|]/gu, (character) => `\\${character}`);
}

function code(value: string): string {
  return value.includes("`") ? `\`\` ${value} \`\`` : `\`${value}\``;
}

function statusLine(claim: Claim): string {
  const layer = LAYER_LABELS[claim.layer];
  switch (claim.status) {
    case "evidenced":
      return `Evidenced by ${layer}.`;
    case "planned":
      return `Planned: ${layer} in plan Phase ${String(claim.phase)}.`;
    case "not-verified":
      return claim.layer === "not-verified" ? "Not verified." : `Not verified; intended layer: ${layer}.`;
  }
}

function count(items: number, one: string, many: string): string {
  return `${items.toLocaleString("en-US")} ${items === 1 ? one : many}`;
}

/** Render `docs/assurance.md` from the register. The output is deterministic. */
export function renderAssurance(register: ClaimsRegister): string {
  const claims = register.claims;
  const byStatus = (status: Status): number => claims.filter((claim) => claim.status === status).length;
  const exemptRules = register.rules.filter((rule) => rule.exempt !== null);
  const lines: string[] = [
    "# Assurance case",
    "",
    `<!-- Generated from ${CLAIMS_REGISTER} by \`${RENDER_COMMAND}\`. Edit the register, then render. -->`,
    "",
    `This page lists what Ghostget's automated checks establish. Each claim names the layer that carries it, the evidence that checks it, the environment it assumes, and what it leaves unverified. The register \`${CLAIMS_REGISTER}\` is the source, and the plan behind it is \`${register.plan}\`.`,
    "",
    "A claim is *evidenced* when its layer runs in CI, *planned* when a plan phase schedules its layer, and *not verified* when no automated check covers it. `bun run verify:claims` fails when this page is stale, when a guideline in a scanned `AGENTS.md` has no current rule in the register, when a rule does not list exactly the claims that quote its guideline, when a managed block's text changes, when an evidenced property claim names a test that runs no property, or when an evidence path no longer exists.",
    "",
    "## Summary",
    "",
    `The register holds ${count(claims.length, "claim", "claims")}: ${byStatus("evidenced").toLocaleString("en-US")} evidenced, ${byStatus("planned").toLocaleString("en-US")} planned, and ${byStatus("not-verified").toLocaleString("en-US")} not verified. It maps ${count(register.rules.length, "guideline", "guidelines")} from ${count(register.guides.length, "guide", "guides")}; ${(register.rules.length - exemptRules.length).toLocaleString("en-US")} list claims and ${exemptRules.length.toLocaleString("en-US")} are exempt.`,
    "",
    "| Layer | Evidenced | Planned | Not verified |",
    "| --- | ---: | ---: | ---: |",
  ];
  for (const layer of LAYERS) {
    const inLayer = claims.filter((claim) => claim.layer === layer);
    if (inLayer.length === 0) continue;
    const tally = (status: Status): string => String(inLayer.filter((claim) => claim.status === status).length);
    lines.push(`| ${LAYER_LABELS[layer]} | ${tally("evidenced")} | ${tally("planned")} | ${tally("not-verified")} |`);
  }
  lines.push("", "## What is not verified", "", "The register as a whole does not verify:", "");
  for (const item of register.notVerified) lines.push(`- ${item}`);
  lines.push("", "Every claim below also lists its own not-verified scope.", "", "### Claims without an automated check", "");
  for (const claim of claims.filter((candidate) => candidate.status === "not-verified")) {
    lines.push(`- ${code(claim.id)}: ${claim.statement} ${claim.notVerified.join(" ")}`);
  }
  lines.push("", "### Exempt guidelines", "", "These guidelines have no claim in the register, and no automated check covers them. Each reason says why.", "");
  lines.push("| Guide | Guideline | Reason |", "| --- | --- | --- |");
  for (const rule of exemptRules) {
    lines.push(`| ${code(rule.guide)} | ${markdownTableCell(rule.anchor)}… | ${markdownTableCell(rule.exempt ?? "")} |`);
  }
  const blocks = register.guides.flatMap((guide) => guide.managedBlocks.map((block) => ({ guide: guide.path, block })));
  if (blocks.length > 0) {
    lines.push("", "### Managed blocks outside the register", "", "These synced blocks sit inside a scanned Guidelines section but have no rules or claims, and no automated check covers them. The register pins each block's text, so any change fails the register until someone reviews it.", "");
    lines.push("| Guide | Block | Reason |", "| --- | --- | --- |");
    for (const { guide, block } of blocks) {
      lines.push(`| ${code(guide)} | ${code(block.name)} | ${markdownTableCell(block.reason)} |`);
    }
  }
  lines.push("", "### Guides outside the register", "");
  for (const excluded of register.excludedGuides) lines.push(`- ${code(excluded.prefix)}: ${excluded.reason}`);
  lines.push("", "## Environmental assumptions", "", "Each claim holds only while its listed assumptions hold.", "");
  lines.push("| Assumption | Statement | Claims |", "| --- | --- | ---: |");
  for (const assumption of register.assumptions) {
    const users = claims.filter((claim) => claim.assumptions.includes(assumption.id)).length;
    lines.push(`| ${code(assumption.id)} | ${markdownTableCell(assumption.statement)} | ${String(users)} |`);
  }
  lines.push("", "## Claims by area", "");
  const areas = [...new Set(claims.map((claim) => claim.area))].sort();
  for (const area of areas) {
    const inArea = claims.filter((claim) => claim.area === area);
    lines.push(`### ${code(area)} (${count(inArea.length, "claim", "claims")})`, "");
    for (const claim of inArea) {
      lines.push(`#### ${code(claim.id)}`, "", claim.statement, "");
      lines.push(`- ${statusLine(claim)}`);
      lines.push(`- Source: ${code(claim.source.path)}: “${claim.source.quote}”`);
      for (const quote of claim.alsoQuotes) lines.push(`- Also covers: ${code(quote.path)}: “${quote.quote}”`);
      lines.push(`- Evidence: ${claim.evidence.length === 0 ? "none" : claim.evidence.map(code).join(", ")}`);
      if (claim.properties.length > 0) {
        lines.push(`- Property tests: ${claim.properties.map((named) => `${code(named.path)}: “${named.test}”`).join("; ")}`);
      }
      lines.push(`- Assumptions: ${claim.assumptions.length === 0 ? "none beyond the register-wide scope" : claim.assumptions.map(code).join(", ")}`);
      if (claim.notVerified.length === 1) {
        lines.push(`- Not verified: ${claim.notVerified[0]!}`);
      } else {
        lines.push("- Not verified:");
        for (const item of claim.notVerified) lines.push(`  - ${item}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function readClaimsRegister(root: string = REPOSITORY_ROOT): Promise<ClaimsRegister> {
  return parseClaimsRegister(JSON.parse(await readFile(join(root, CLAIMS_REGISTER), "utf8")) as unknown);
}

if (import.meta.main) {
  const mode = process.argv[2];
  if ((mode !== "render" && mode !== "check") || process.argv.length !== 3) {
    console.error("usage: bun run ./scripts/verification-claims.ts render|check");
    process.exit(2);
  }
  try {
    const register = await readClaimsRegister();
    const rendered = renderAssurance(register);
    if (mode === "render") {
      await writeFile(join(REPOSITORY_ROOT, ASSURANCE_DOCUMENT), rendered);
      console.log(`Wrote ${ASSURANCE_DOCUMENT} from ${CLAIMS_REGISTER}`);
    } else {
      const findings = [...await registerFindings(register, diskRepository())];
      const current = await readFile(join(REPOSITORY_ROOT, ASSURANCE_DOCUMENT), "utf8").catch(() => null);
      if (current !== rendered) findings.push(`${ASSURANCE_DOCUMENT} is stale; run ${RENDER_COMMAND}`);
      if (findings.length > 0) {
        console.error(findings.join("\n"));
        process.exit(1);
      }
      console.log(`${CLAIMS_REGISTER}: ${String(register.claims.length)} claims and ${String(register.rules.length)} guideline rules are current`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
