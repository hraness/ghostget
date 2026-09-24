import { describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import ts from "typescript";

import {
  PROPERTY_CORPUS_PATH,
  parsePropertyCorpus,
  type PropertyCorpus,
} from "./test-support";

type PolicyViolationCode =
  | "jest-timeout-call"
  | "set-default-timeout-import"
  | "set-default-timeout-call"
  | "registration-opaque-options"
  | "registration-options-timeout"
  | "registration-positional-timeout";

type PolicyViolation = {
  readonly code: PolicyViolationCode;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
};

type BunTestBindings = {
  readonly jestBindings: ReadonlySet<string>;
  readonly registrations: ReadonlySet<string>;
  readonly setDefaultTimeouts: ReadonlySet<string>;
  readonly namespaces: ReadonlySet<string>;
};

const executableTestFilePattern = /[._](?:test|spec)\.(?:js|jsx|ts|tsx)$/u;
const jestTimeoutMembers = new Set(["setDefaultTimeout", "setTimeout"]);
const registrationExports = new Set(["it", "test", "xit", "xtest"]);
const registrationBuilderMembers = new Set(["each", "if", "skipIf"]);

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function memberName(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | null {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  const argument = expression.argumentExpression;
  if (
    ts.isStringLiteral(argument)
    || ts.isNoSubstitutionTemplateLiteral(argument)
  ) {
    return argument.text;
  }
  return null;
}

function isMemberExpression(
  expression: ts.Expression,
): expression is ts.PropertyAccessExpression | ts.ElementAccessExpression {
  return ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression);
}

function isNamespaceMember(
  expression: ts.Expression,
  namespaces: ReadonlySet<string>,
  names: ReadonlySet<string>,
): boolean {
  const unwrapped = unwrapExpression(expression);
  if (!isMemberExpression(unwrapped)) return false;
  const owner = unwrapExpression(unwrapped.expression);
  return ts.isIdentifier(owner)
    && namespaces.has(owner.text)
    && names.has(memberName(unwrapped) ?? "");
}

function isRegistrationRootedExpression(
  expression: ts.Expression,
  bindings: BunTestBindings,
): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) {
    return bindings.registrations.has(unwrapped.text);
  }
  if (isMemberExpression(unwrapped)) {
    if (isNamespaceMember(unwrapped, bindings.namespaces, registrationExports)) {
      return true;
    }
    return isRegistrationRootedExpression(unwrapped.expression, bindings);
  }
  if (ts.isCallExpression(unwrapped)) {
    return isRegistrationRootedExpression(unwrapped.expression, bindings);
  }
  if (ts.isTaggedTemplateExpression(unwrapped)) {
    return isRegistrationRootedExpression(unwrapped.tag, bindings);
  }
  return false;
}

function isRegistrationCall(
  call: ts.CallExpression,
  bindings: BunTestBindings,
): boolean {
  const callee = unwrapExpression(call.expression);
  if (ts.isIdentifier(callee)) {
    return bindings.registrations.has(callee.text);
  }
  if (isMemberExpression(callee)) {
    if (!isRegistrationRootedExpression(callee, bindings)) return false;
    return !registrationBuilderMembers.has(memberName(callee) ?? "");
  }
  return (ts.isCallExpression(callee) || ts.isTaggedTemplateExpression(callee))
    && isRegistrationRootedExpression(callee, bindings);
}

function propertyName(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name)
    || ts.isStringLiteral(name)
    || ts.isNumericLiteral(name)
    || ts.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrapExpression(name.expression);
    if (
      ts.isStringLiteral(expression)
      || ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      return expression.text;
    }
  }
  return null;
}

function hasTimeoutProperty(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.some((property) => {
    if (ts.isSpreadAssignment(property)) return false;
    return propertyName(property.name) === "timeout";
  });
}

function hasOpaqueProperty(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.some((property) => (
    ts.isSpreadAssignment(property) || propertyName(property.name) === null
  ));
}

function isJestTimeoutCall(
  expression: ts.Expression,
  bindings: BunTestBindings,
): boolean {
  const callee = unwrapExpression(expression);
  if (
    !isMemberExpression(callee)
    || !jestTimeoutMembers.has(memberName(callee) ?? "")
  ) {
    return false;
  }
  const owner = unwrapExpression(callee.expression);
  if (ts.isIdentifier(owner)) return bindings.jestBindings.has(owner.text);
  if (!isMemberExpression(owner) || memberName(owner) !== "jest") return false;
  const namespace = unwrapExpression(owner.expression);
  return ts.isIdentifier(namespace) && bindings.namespaces.has(namespace.text);
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function violation(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  code: PolicyViolationCode,
  message: string,
): PolicyViolation {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    code,
    file: sourceFile.fileName,
    line: position.line + 1,
    column: position.character + 1,
    message,
  };
}

function inspectTestSource(file: string, source: string): readonly PolicyViolation[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const jestBindings = new Set<string>();
  const registrations = new Set<string>();
  const setDefaultTimeouts = new Set<string>();
  const namespaces = new Set<string>();
  const violations: PolicyViolation[] = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "bun:test"
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings === undefined) continue;
    if (ts.isNamespaceImport(namedBindings)) {
      namespaces.add(namedBindings.name.text);
      continue;
    }
    for (const specifier of namedBindings.elements) {
      const importedName = specifier.propertyName?.text ?? specifier.name.text;
      if (registrationExports.has(importedName)) {
        registrations.add(specifier.name.text);
      }
      if (importedName === "jest") {
        jestBindings.add(specifier.name.text);
      }
      if (importedName === "setDefaultTimeout") {
        setDefaultTimeouts.add(specifier.name.text);
        violations.push(violation(
          sourceFile,
          specifier,
          "set-default-timeout-import",
          "Importing setDefaultTimeout from bun:test bypasses the package-wide timeout policy.",
        ));
      }
    }
  }

  const bindings: BunTestBindings = {
    jestBindings,
    registrations,
    setDefaultTimeouts,
    namespaces,
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      const callsNamedDefaultTimeout = ts.isIdentifier(callee)
        && bindings.setDefaultTimeouts.has(callee.text);
      const callsNamespacedDefaultTimeout = isNamespaceMember(
        callee,
        bindings.namespaces,
        new Set(["setDefaultTimeout"]),
      );
      if (callsNamedDefaultTimeout || callsNamespacedDefaultTimeout) {
        violations.push(violation(
          sourceFile,
          node,
          "set-default-timeout-call",
          "Calling bun:test setDefaultTimeout bypasses the package-wide timeout policy.",
        ));
      }
      if (isJestTimeoutCall(callee, bindings)) {
        violations.push(violation(
          sourceFile,
          node,
          "jest-timeout-call",
          "Calling bun:test jest.setTimeout bypasses the package-wide timeout policy.",
        ));
      }

      if (isRegistrationCall(node, bindings)) {
        const optionsArgument = node.arguments[2];
        if (optionsArgument !== undefined) {
          const options = unwrapExpression(optionsArgument);
          if (ts.isObjectLiteralExpression(options)) {
            if (hasTimeoutProperty(options)) {
              violations.push(violation(
                sourceFile,
                options,
                "registration-options-timeout",
                "A bun:test registration options object must not set timeout.",
              ));
            }
            if (hasOpaqueProperty(options)) {
              violations.push(violation(
                sourceFile,
                options,
                "registration-opaque-options",
                "A bun:test registration options object must expose every property so timeout absence is reviewable.",
              ));
            }
          } else {
            violations.push(violation(
              sourceFile,
              options,
              "registration-positional-timeout",
              "A bun:test registration must not pass a numeric or opaque third-argument runner timeout.",
            ));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

async function executableTestFiles(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (entry.isFile() && executableTestFilePattern.test(entry.name)) {
        files.push(path);
      }
    }
  };
  await visit(root);
  return files;
}

function displayPath(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}

const acceptedFixtures = [
  {
    name: "direct registration and product deadline",
    source: `
      import { test } from "bun:test";
      const setDefaultTimeout = (milliseconds: number) => milliseconds;
      const productOptions = { timeout: 25 };
      setDefaultTimeout(productOptions.timeout);
      test("works", async () => runProductOperation(productOptions));
    `,
  },
  {
    name: "aliased registration",
    source: `
      import { test as check } from "bun:test";
      check.only("works", () => undefined);
    `,
  },
  {
    name: "namespace registration",
    source: `
      import * as bunTest from "bun:test";
      bunTest.it.skip("works", () => undefined);
    `,
  },
  {
    name: "each builder and modifier chain",
    source: `
      import { test } from "bun:test";
      test.only.each([[1], [2]])("case %i", (value) => value);
      test.skipIf(false)("conditional", () => undefined);
    `,
  },
  {
    name: "tagged each builder",
    source: `
      import { test } from "bun:test";
      test.each\`
        value
        \${1}
      \`("case $value", ({ value }) => value);
    `,
  },
  {
    name: "retry-only registration options",
    source: `
      import { test } from "bun:test";
      test("retries", () => undefined, { retry: 2, repeats: 1 });
    `,
  },
  {
    name: "skipped aliases and ordinary jest mocks",
    source: `
      import { jest, xit, xtest } from "bun:test";
      xit("skipped", () => undefined, { retry: 1 });
      xtest("also skipped", () => undefined);
      jest.fn(() => undefined);
    `,
  },
] as const;

const rejectedFixtures: readonly {
  readonly name: string;
  readonly source: string;
  readonly code: PolicyViolationCode;
}[] = [
  {
    name: "named setDefaultTimeout import",
    source: `import { setDefaultTimeout } from "bun:test";`,
    code: "set-default-timeout-import",
  },
  {
    name: "aliased setDefaultTimeout call",
    source: `
      import { setDefaultTimeout as configureHarness } from "bun:test";
      configureHarness(1_000);
    `,
    code: "set-default-timeout-call",
  },
  {
    name: "namespace setDefaultTimeout call",
    source: `
      import * as bunTest from "bun:test";
      bunTest.setDefaultTimeout(1_000);
    `,
    code: "set-default-timeout-call",
  },
  {
    name: "aliased jest timeout call",
    source: `
      import { jest as bunJest } from "bun:test";
      bunJest.setTimeout(1_000);
    `,
    code: "jest-timeout-call",
  },
  {
    name: "namespace jest timeout call",
    source: `
      import * as bunTest from "bun:test";
      bunTest.jest.setTimeout(1_000);
    `,
    code: "jest-timeout-call",
  },
  {
    name: "direct positional timeout",
    source: `
      import { test } from "bun:test";
      test("slow", () => undefined, 1_000);
    `,
    code: "registration-positional-timeout",
  },
  {
    name: "aliased modifier positional timeout",
    source: `
      import { it as check } from "bun:test";
      check.only("slow", () => undefined, TEST_TIMEOUT);
    `,
    code: "registration-positional-timeout",
  },
  {
    name: "namespace each positional timeout",
    source: `
      import * as bunTest from "bun:test";
      bunTest.test.each([[1]])("case %i", () => undefined, 1_000);
    `,
    code: "registration-positional-timeout",
  },
  {
    name: "modifier each options timeout",
    source: `
      import { test } from "bun:test";
      test.only.each([[1]])("case %i", () => undefined, { timeout: 1_000 });
    `,
    code: "registration-options-timeout",
  },
  {
    name: "tagged each positional timeout",
    source: `
      import { test } from "bun:test";
      test.each\`
        value
        \${1}
      \`("case $value", () => undefined, 1_000);
    `,
    code: "registration-positional-timeout",
  },
  {
    name: "timeout registration option",
    source: `
      import { test } from "bun:test";
      test("slow", () => undefined, { timeout: 1_000 });
    `,
    code: "registration-options-timeout",
  },
  {
    name: "quoted timeout registration option",
    source: `
      import { test } from "bun:test";
      test("slow", () => undefined, { "timeout": 1_000 });
    `,
    code: "registration-options-timeout",
  },
  {
    name: "shorthand timeout registration option",
    source: `
      import { test } from "bun:test";
      const timeout = 1_000;
      test("slow", () => undefined, { timeout });
    `,
    code: "registration-options-timeout",
  },
  {
    name: "opaque registration options identifier",
    source: `
      import { test } from "bun:test";
      const options = { retry: 1 };
      test("opaque", () => undefined, options);
    `,
    code: "registration-positional-timeout",
  },
  {
    name: "spread registration options",
    source: `
      import { test } from "bun:test";
      const shared = { retry: 1 };
      test("spread", () => undefined, { ...shared });
    `,
    code: "registration-opaque-options",
  },
  {
    name: "skipped registration timeout",
    source: `
      import { xtest } from "bun:test";
      xtest("slow", () => undefined, 1_000);
    `,
    code: "registration-positional-timeout",
  },
];

type PropertyViolationCode =
  | "bare-fast-check-runner"
  | "fast-check-runner-destructure"
  | "fast-check-dynamic-import";

type PropertyViolation = Readonly<{
  code: PropertyViolationCode;
  file: string;
  line: number;
  message: string;
}>;

type PropertyCorpusUse = Readonly<{ name: string; file: string; line: number }>;

type PropertySourceReport = Readonly<{
  violations: readonly PropertyViolation[];
  corpusUses: readonly PropertyCorpusUse[];
}>;

/** fast-check runners that execute a property outside the shared defaults, replay, corpus, and soak scaling. */
const fastCheckRunners = new Set(["assert", "check"]);
const propertyHelpers = new Set(["assertProperty", "assertAsyncProperty"]);
const testSupportModule = /(?:^|\/)test-support(?:\.[cm]?[jt]s)?$/u;
const propertySourceFile = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const propertyPolicyRoots = ["src/", "scripts/", "edge/", "website/"] as const;
const propertyHelperFile = "src/test-support.ts";

function literalText(expression: ts.Expression | undefined): string | null {
  if (expression === undefined) return null;
  const unwrapped = unwrapExpression(expression);
  return ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)
    ? unwrapped.text
    : null;
}

/**
 * Find every way a file can run a fast-check property without the shared
 * helpers, and every seed corpus name it passes to them. A file reaches
 * fast-check through its default or namespace import, a named runner import,
 * the `fc` re-export of `test-support`, or a dynamic load.
 */
function inspectPropertySource(file: string, source: string): PropertySourceReport {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const namespaces = new Set<string>();
  const runners = new Set<string>();
  const helpers = new Set<string>();
  const violations: PropertyViolation[] = [];
  const corpusUses: PropertyCorpusUse[] = [];
  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const report = (node: ts.Node, code: PropertyViolationCode, message: string): void => {
    violations.push({ code, file, line: lineOf(node), message });
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = statement.moduleSpecifier.text;
    const fromFastCheck = module === "fast-check";
    const fromTestSupport = testSupportModule.test(module);
    if (!fromFastCheck && !fromTestSupport) continue;
    const clause = statement.importClause;
    if (clause === undefined) continue;
    if (fromFastCheck && clause.name !== undefined) namespaces.add(clause.name.text);
    const named = clause.namedBindings;
    if (named === undefined) continue;
    if (ts.isNamespaceImport(named)) {
      if (fromFastCheck) namespaces.add(named.name.text);
      continue;
    }
    for (const specifier of named.elements) {
      const imported = specifier.propertyName?.text ?? specifier.name.text;
      if (fromFastCheck && imported === "default") namespaces.add(specifier.name.text);
      if (fromFastCheck && (imported === "fc" || fastCheckRunners.has(imported))) {
        (imported === "fc" ? namespaces : runners).add(specifier.name.text);
      }
      if (fromTestSupport && imported === "fc") namespaces.add(specifier.name.text);
      if (fromTestSupport && propertyHelpers.has(imported)) helpers.add(specifier.name.text);
    }
  }

  const visit = (node: ts.Node): void => {
    if (isMemberExpression(node as ts.Expression) && ts.isExpression(node)) {
      const member = node as ts.PropertyAccessExpression | ts.ElementAccessExpression;
      const owner = unwrapExpression(member.expression);
      if (
        ts.isIdentifier(owner)
        && namespaces.has(owner.text)
        && fastCheckRunners.has(memberName(member) ?? "")
      ) {
        report(member, "bare-fast-check-runner", `fast-check ${memberName(member) ?? ""} bypasses assertProperty and assertAsyncProperty.`);
      }
    }
    if (ts.isIdentifier(node) && runners.has(node.text) && !ts.isImportSpecifier(node.parent)) {
      report(node, "bare-fast-check-runner", `The imported fast-check ${node.text} bypasses assertProperty and assertAsyncProperty.`);
    }
    if (
      ts.isVariableDeclaration(node)
      && ts.isObjectBindingPattern(node.name)
      && node.initializer !== undefined
    ) {
      const initializer = unwrapExpression(node.initializer);
      const fromNamespace = ts.isIdentifier(initializer) && namespaces.has(initializer.text);
      if (fromNamespace && node.name.elements.some((element) => {
        const key = element.propertyName ?? element.name;
        return (ts.isIdentifier(key) || ts.isStringLiteral(key)) && fastCheckRunners.has(key.text);
      })) {
        report(node, "fast-check-runner-destructure", "Destructuring a fast-check runner bypasses assertProperty and assertAsyncProperty.");
      }
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      const loadsModule = node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(callee) && callee.text === "require");
      if (loadsModule && literalText(node.arguments[0]) === "fast-check") {
        report(node, "fast-check-dynamic-import", "Load fast-check statically so the property policy can see every runner.");
      }
      if (ts.isIdentifier(callee) && helpers.has(callee.text)) {
        const name = literalText(node.arguments[2]);
        if (name !== null) corpusUses.push({ name, file, line: lineOf(node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { violations, corpusUses };
}

/** Titles of the literal `test` and `it` registrations in one file. */
function registeredTestTitles(file: string, source: string): ReadonlySet<string> {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const registrations = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "bun:test"
    ) {
      continue;
    }
    const named = statement.importClause?.namedBindings;
    if (named === undefined) continue;
    if (ts.isNamespaceImport(named)) {
      namespaces.add(named.name.text);
      continue;
    }
    for (const specifier of named.elements) {
      if (registrationExports.has(specifier.propertyName?.text ?? specifier.name.text)) {
        registrations.add(specifier.name.text);
      }
    }
  }
  const bindings: BunTestBindings = {
    jestBindings: new Set(),
    registrations,
    setDefaultTimeouts: new Set(),
    namespaces,
  };
  const titles = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isRegistrationCall(node, bindings)) {
      const title = literalText(node.arguments[0]);
      if (title !== null) titles.add(title);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return titles;
}

/** Tracked and untracked unignored files under the property policy roots. */
function propertyPolicyFiles(root: string): readonly string[] {
  const listed = Bun.spawnSync(
    ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...propertyPolicyRoots],
    { cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  if (listed.exitCode !== 0) throw new Error("git ls-files must list the property policy roots");
  return listed.stdout.toString("utf8").split("\0")
    .filter((path) => propertySourceFile.test(path) && path !== propertyHelperFile)
    .sort();
}

/**
 * Check the seed corpus against the repository: each named property is run by
 * exactly one literal helper call in its declared file, each counterexample
 * names a test registered in that file, and every literal name exists.
 */
function corpusFindings(
  corpus: PropertyCorpus,
  uses: readonly PropertyCorpusUse[],
  titlesOf: (file: string) => ReadonlySet<string> | null,
): readonly string[] {
  const findings: string[] = [];
  for (const use of uses) {
    if (!corpus.has(use.name)) {
      findings.push(`${use.file}:${String(use.line)} names property ${use.name}, which has no corpus entry`);
    }
  }
  for (const [name, property] of corpus) {
    const named = uses.filter((use) => use.name === name);
    if (named.length !== 1 || named[0]!.file !== property.file) {
      findings.push(`corpus property ${name} must be run by exactly one helper call in ${property.file}; found ${named.map((use) => `${use.file}:${String(use.line)}`).join(", ") || "none"}`);
    }
    const titles = titlesOf(property.file);
    if (titles === null) {
      findings.push(`corpus property ${name} names missing file ${property.file}`);
      continue;
    }
    for (const entry of property.entries) {
      if (entry.regression !== undefined && !titles.has(entry.regression)) {
        findings.push(`corpus property ${name} seed ${String(entry.seed)} names regression "${entry.regression}", which ${property.file} does not register`);
      }
    }
  }
  return findings;
}

const acceptedPropertyFixtures = [
  {
    name: "shared helpers with arbitraries from fast-check",
    source: `
      import fc from "fast-check";
      import { assertAsyncProperty, assertProperty } from "./test-support";
      assertProperty(fc.property(fc.integer(), () => true), { numRuns: 10 });
      await assertAsyncProperty(fc.asyncProperty(fc.integer(), async () => true));
      const values = fc.sample(fc.integer(), { seed: 1, numRuns: 1 });
    `,
  },
  {
    name: "the fc re-export used for arbitraries only",
    source: `
      import { assertProperty as check, fc } from "../src/test-support.js";
      check(fc.property(fc.boolean(), () => true), {}, { seed: 7 });
      const text = "fc.assert(property)";
    `,
  },
  {
    name: "an unrelated assert member",
    source: `
      import assert from "node:assert";
      const fc = { assert: () => undefined };
      fc.assert();
      assert.equal(1, 1);
    `,
  },
] as const;

const rejectedPropertyFixtures: readonly Readonly<{
  name: string;
  source: string;
  code: PropertyViolationCode;
}>[] = [
  {
    name: "default import assert",
    source: `import fc from "fast-check"; fc.assert(fc.property(fc.nat(), () => true));`,
    code: "bare-fast-check-runner",
  },
  {
    name: "renamed default import check",
    source: `import checks from "fast-check"; checks.check(checks.property(checks.nat(), () => true));`,
    code: "bare-fast-check-runner",
  },
  {
    name: "namespace import assert",
    source: `import * as fastCheck from "fast-check"; await fastCheck.assert(property);`,
    code: "bare-fast-check-runner",
  },
  {
    name: "element access assert",
    source: `import fc from "fast-check"; fc["assert"](property);`,
    code: "bare-fast-check-runner",
  },
  {
    name: "test-support re-export assert",
    source: `import { fc } from "./test-support"; fc.assert(property, propertyParameters);`,
    code: "bare-fast-check-runner",
  },
  {
    name: "aliased named runner",
    source: `import { assert as run } from "fast-check"; run(property);`,
    code: "bare-fast-check-runner",
  },
  {
    name: "detached runner reference",
    source: `import fc from "fast-check"; const run = fc.assert; run(property);`,
    code: "bare-fast-check-runner",
  },
  {
    name: "destructured runner",
    source: `import fc from "fast-check"; const { assert: run } = fc; run(property);`,
    code: "fast-check-runner-destructure",
  },
  {
    name: "required fast-check",
    source: `const fc = require("fast-check"); fc.assert(property);`,
    code: "fast-check-dynamic-import",
  },
  {
    name: "dynamically imported fast-check",
    source: `const fc = await import("fast-check");`,
    code: "fast-check-dynamic-import",
  },
];

describe("property runner policy", () => {
  for (const fixture of acceptedPropertyFixtures) {
    test(`accepts ${fixture.name}`, () => {
      expect(inspectPropertySource("fixture.test.ts", fixture.source).violations).toEqual([]);
    });
  }

  for (const fixture of rejectedPropertyFixtures) {
    test(`rejects ${fixture.name}`, () => {
      expect(inspectPropertySource("fixture.test.ts", fixture.source).violations.map((entry) => entry.code))
        .toContain(fixture.code);
    });
  }

  test("records literal corpus names passed to either helper", () => {
    const { corpusUses } = inspectPropertySource("fixture.test.ts", `
      import { assertAsyncProperty, assertProperty as check } from "./test-support";
      check(property, {}, "one/name");
      await assertAsyncProperty(property, { numRuns: 5 }, \`two-name\`);
      check(property, {}, { seed: 3 });
      check(property);
    `);
    expect(corpusUses).toEqual([
      { name: "one/name", file: "fixture.test.ts", line: 3 },
      { name: "two-name", file: "fixture.test.ts", line: 4 },
    ]);
  });

  test("reports corpus names, files, and regressions that do not line up", () => {
    const corpus = parsePropertyCorpus({
      schema: "ghostget-property-seeds-v1",
      properties: {
        "a/present": {
          file: "src/a.test.ts",
          entries: [{ kind: "counterexample", seed: 1, path: "0", origin: "run 1", regression: "pins case one" }],
        },
        "b/unused": {
          file: "src/b.test.ts",
          entries: [{ kind: "workload", seed: 2, origin: "timing seed" }],
        },
      },
    });
    const titles = new Map([["src/a.test.ts", new Set(["pins another case"])]]);
    expect(corpusFindings(corpus, [
      { name: "a/present", file: "src/a.test.ts", line: 4 },
      { name: "c/unknown", file: "src/a.test.ts", line: 9 },
    ], (file) => titles.get(file) ?? null)).toEqual([
      "src/a.test.ts:9 names property c/unknown, which has no corpus entry",
      'corpus property a/present seed 1 names regression "pins case one", which src/a.test.ts does not register',
      "corpus property b/unused must be run by exactly one helper call in src/b.test.ts; found none",
      "corpus property b/unused names missing file src/b.test.ts",
    ]);
  });

  test("every repository property runs through the shared helpers and the seed corpus lines up", async () => {
    const repositoryRoot = join(import.meta.dir, "..");
    const files = propertyPolicyFiles(repositoryRoot);
    expect(files).toContain("src/canonical-json.test.ts");
    expect(files).toContain("edge/negotiation.test.ts");
    expect(files).toContain("scripts/ci-pr-gate.test.ts");
    const reports = await Promise.all(files.map(async (file) => {
      const source = await readFile(join(repositoryRoot, file), "utf8");
      return /fast-check|test-support/u.test(source)
        ? inspectPropertySource(file, source)
        : { violations: [], corpusUses: [] };
    }));
    expect(reports.flatMap((entry) => entry.violations).map((entry) => (
      `${entry.file}:${String(entry.line)} [${entry.code}] ${entry.message}`
    ))).toEqual([]);

    const corpus = parsePropertyCorpus(JSON.parse(
      await readFile(join(repositoryRoot, PROPERTY_CORPUS_PATH), "utf8"),
    ) as unknown);
    const sources = new Map(await Promise.all([...new Set([...corpus.values()].map((entry) => entry.file))]
      .map(async (file) => [file, await readFile(join(repositoryRoot, file), "utf8").catch(() => null)] as const)));
    expect(corpusFindings(corpus, reports.flatMap((entry) => entry.corpusUses), (file) => {
      const source = sources.get(file);
      return source === undefined || source === null ? null : registeredTestTitles(file, source);
    })).toEqual([]);
  });
});

describe("test harness policy", () => {
  for (const fixture of acceptedFixtures) {
    test(`accepts ${fixture.name}`, () => {
      expect(inspectTestSource("fixture.test.ts", fixture.source)).toEqual([]);
    });
  }

  for (const fixture of rejectedFixtures) {
    test(`rejects ${fixture.name}`, () => {
      const codes = inspectTestSource("fixture.test.ts", fixture.source)
        .map((entry) => entry.code);
      expect(codes).toContain(fixture.code);
    });
  }

  test("matches every Bun-discovered test and spec filename form", () => {
    for (const separator of [".", "_"]) {
      for (const label of ["test", "spec"]) {
        for (const extension of ["js", "jsx", "ts", "tsx"]) {
          expect(
            executableTestFilePattern.test(`example${separator}${label}.${extension}`),
          ).toBe(true);
        }
      }
    }

    for (const file of [
      "example.ts",
      "example-test.ts",
      "example.testing.ts",
      "example.test.d.ts",
      "example.test.mts",
      "example.test.cts",
      "example.TEST.ts",
      "test.ts",
      "spec.ts",
    ]) {
      expect(executableTestFilePattern.test(file)).toBe(false);
    }
  });

  test("scans underscore tests and test files nested beneath assets", async () => {
    const root = await mkdtemp(join(tmpdir(), "wrench-test-harness-policy-"));
    try {
      await mkdir(join(root, "assets", "nested"), { recursive: true });
      await Promise.all([
        writeFile(
          join(root, "underscore_test.ts"),
          `import { test } from "bun:test"; test("slow", () => undefined, 1_000);`,
        ),
        writeFile(
          join(root, "assets", "nested", "fixture_spec.js"),
          `import { jest } from "bun:test"; jest.setTimeout(1_000);`,
        ),
        writeFile(
          join(root, "assets", "nested", "ordinary.ts"),
          `throw new Error("not a test file");`,
        ),
        writeFile(
          join(root, "looks-like.test.d.ts"),
          `import { setDefaultTimeout } from "bun:test";`,
        ),
      ]);

      const files = await executableTestFiles(root);
      expect(files.map((file) => displayPath(root, file))).toEqual([
        "assets/nested/fixture_spec.js",
        "underscore_test.ts",
      ]);

      const violations = (
        await Promise.all(files.map(async (file) => ({
          file: displayPath(root, file),
          codes: inspectTestSource(file, await readFile(file, "utf8"))
            .map((entry) => entry.code),
        })))
      );
      expect(violations).toEqual([
        {
          file: "assets/nested/fixture_spec.js",
          codes: ["jest-timeout-call"],
        },
        {
          file: "underscore_test.ts",
          codes: ["registration-positional-timeout"],
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("all executable source and script tests use the package harness policy", async () => {
    const repositoryRoot = join(import.meta.dir, "..");
    const files = (
      await Promise.all([
        executableTestFiles(import.meta.dir),
        executableTestFiles(join(repositoryRoot, "scripts")),
      ])
    ).flat();
    const violations = (
      await Promise.all(files.map(async (file) => {
        const source = await readFile(file, "utf8");
        return inspectTestSource(displayPath(repositoryRoot, file), source);
      }))
    ).flat();

    expect(violations.map((entry) => (
      `${entry.file}:${entry.line}:${entry.column} [${entry.code}] ${entry.message}`
    ))).toEqual([]);
  });

  test("the package script owns timeout and concurrency limits", async () => {
    const packageJson = JSON.parse(
      await readFile(join(import.meta.dir, "..", "package.json"), "utf8"),
    ) as unknown;
    if (
      typeof packageJson !== "object"
      || packageJson === null
      || !("scripts" in packageJson)
      || typeof packageJson.scripts !== "object"
      || packageJson.scripts === null
    ) {
      throw new Error("package.json scripts must be an object");
    }
    const scripts = packageJson.scripts as Record<string, unknown>;
    const readScript = (name: string): string => {
      const value = scripts[name];
      if (typeof value !== "string") {
        throw new Error(`package.json scripts.${name} must be a string`);
      }
      return value;
    };
    const unitCommand =
      "bun test --no-orphans --timeout 180000 --max-concurrency \"$"
      + "{GOMAXPROCS:-4}\" ./src --path-ignore-patterns='**/src/omni-runtime.test.ts'";
    const omniCommand =
      "bun test --no-orphans --timeout 180000 --max-concurrency 1"
      + " ./src/omni-runtime.test.ts";
    expect(readScript("test:unit")).toBe(unitCommand);
    expect(readScript("test:omni")).toBe(omniCommand);
    expect(readScript("test")).toBe("bun run test:unit && bun run test:omni");
    expect(readScript("test:shard")).toBe("bun run ./scripts/ci-test-shard.ts");
  });
});
