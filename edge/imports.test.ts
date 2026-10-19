import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

// This test runs on Bun, so it may use Node APIs. The files it scans may not.
const EDGE = import.meta.dir;
const ROOT = dirname(EDGE);
const MIDDLEWARE = join(ROOT, "middleware.ts");

function isTestFile(path: string): boolean {
  return /\.test\.tsx?$/u.test(path);
}

async function edgeRuntimeFiles(): Promise<readonly string[]> {
  const entries = await readdir(EDGE, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.tsx?$/u.test(entry.name) && !isTestFile(entry.name))
    .map((entry) => join(EDGE, entry.name));
  return [...files, MIDDLEWARE].sort();
}

function inside(directory: string, path: string): boolean {
  const offset = relative(directory, path);
  return offset !== "" && !offset.startsWith("..") && !offset.startsWith(sep);
}

/**
 * The imports of one Edge runtime file that leave the Edge runtime set: every
 * specifier must be relative and resolve to a non-test file in `edge/`.
 * Type-only imports vanish at build time, so the transpiler drops them.
 */
function importFindings(file: string, source: string, runtime: ReadonlySet<string>): readonly string[] {
  const transpiler = new Bun.Transpiler({ loader: file.endsWith(".tsx") ? "tsx" : "ts" });
  const findings: string[] = [];
  for (const { path: specifier, kind } of transpiler.scanImports(source)) {
    const where = `${relative(ROOT, file)} ${kind} "${specifier}"`;
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      findings.push(`${where} is not a relative import inside edge/`);
      continue;
    }
    const target = resolve(dirname(file), specifier);
    const candidates = [target, `${target}.ts`, `${target}.tsx`];
    const resolved = candidates.find((candidate) => runtime.has(candidate));
    if (resolved === undefined || !inside(EDGE, resolved)) {
      findings.push(`${where} does not resolve to an Edge runtime file in edge/`);
    }
  }
  return findings;
}

describe("Edge runtime imports", () => {
  test("every Edge runtime file imports only Edge runtime files", async () => {
    const files = await edgeRuntimeFiles();
    expect(files.map((file) => relative(ROOT, file))).toContain("edge/negotiation.ts");
    const runtime = new Set(files);
    const findings: string[] = [];
    for (const file of files) findings.push(...importFindings(file, await readFile(file, "utf8"), runtime));
    expect(findings).toEqual([]);
  });

  test("the Edge tsconfig type-checks exactly the Edge runtime files", async () => {
    const config = JSON.parse(await readFile(join(EDGE, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types?: unknown; lib?: unknown };
      include: readonly string[];
    };
    const included = config.include.map((entry) => resolve(EDGE, entry)).sort();
    expect(included).toEqual([...await edgeRuntimeFiles()]);
    expect(config.compilerOptions.types).toEqual([]);
    expect(config.compilerOptions.lib).toEqual(["ES2022", "WebWorker"]);
  });

  test("the scan rejects Node, Bun, package, website, and test-file imports", async () => {
    const runtime = new Set(await edgeRuntimeFiles());
    const file = join(EDGE, "negotiation.ts");
    const rejected = [
      'import { readFile } from "node:fs/promises";',
      'import { join } from "path";',
      'import { $ } from "bun";',
      'import fc from "fast-check";',
      'import { site } from "../website/site";',
      'import { request } from "./negotiation.test";',
      'const fs = require("fs");',
      'const late = await import("node:net");',
      'export { handleDocumentNegotiation } from "../src/cli";',
    ];
    for (const source of rejected) {
      expect(importFindings(file, `${source}\nexport const used = 1;\n`, runtime)).toHaveLength(1);
    }
    const accepted = 'import { handleDocumentNegotiation } from "./negotiation";\nimport type { Stats } from "node:fs";\nexport const value: Stats | null = null;\nexport { handleDocumentNegotiation };\n';
    expect(importFindings(MIDDLEWARE, accepted.replace("./negotiation", "./edge/negotiation"), runtime)).toEqual([]);
  });
});
