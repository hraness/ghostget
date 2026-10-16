import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { createProviderPluginRegistry, providerPluginRuntimePackages } from "../src/provider-plugin-registry";
import xPlugin from "../src/plugins/x-web/plugin";

// Packaging projection only. Runtime identity is still derived and revalidated
// by the registry, including all installed source/data files in each package.
const exclusions: Record<string, readonly string[]> = {
  "agent-browser": ["bin/agent-browser-darwin-x64", "bin/agent-browser-linux-x64", "bin/agent-browser-linux-arm64", "bin/agent-browser-linux-musl-x64", "bin/agent-browser-linux-musl-arm64", "bin/agent-browser-win32-x64.exe"],
  "@hraness/local-custody": ["dist/rust-artifacts/local-custody/darwin-x64", "dist/rust-artifacts/local-custody/linux-x64"],
};
// The X-only host never installs the messaging transports. Keep their compressed
// executables and accompanying resources outside its signed application bundle.
const sourceExclusions = ["src/assets/messaging-runtime"] as const;
const repository = realpathSync(resolve(import.meta.dir, ".."));

type NativePackage = { readonly name: string; readonly version: string; readonly dependencies: Readonly<Record<string, string>> };
const packageName = /^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/u;
function validPackageName(value: string): boolean {
  return value.length <= 214 && packageName.test(value) && !/[\u0000-\u001f\u007f]/u.test(value);
}
function validPackageVersion(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 128) return false;
  const parts = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/u.exec(value);
  return parts !== null && parts[0] === value
    && (parts[1] === undefined || parts[1].split(".").every(part => /^[0-9A-Za-z-]+$/u.test(part) && !/^0[0-9]+$/u.test(part)))
    && (parts[2] === undefined || parts[2].split(".").every(part => /^[0-9A-Za-z-]+$/u.test(part)));
}
function readNativePackage(root: string, allowSubpath: boolean): NativePackage | null {
  const path = join(root, "package.json");
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1_048_576) throw new Error("native runtime dependency manifest is not a bounded regular file");
  const text = readFileSync(path, "utf8");
  if (Buffer.byteLength(text) > 1_048_576) throw new Error("native runtime dependency manifest exceeds its byte bound");
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("native runtime dependency manifest must be an object");
  const manifest = value as Record<string, unknown>;
  const hasName = Object.hasOwn(manifest, "name"), hasVersion = Object.hasOwn(manifest, "version");
  if (!hasName && !hasVersion && allowSubpath) return null;
  if (!hasName || !hasVersion || typeof manifest.name !== "string" || !validPackageName(manifest.name) || !validPackageVersion(manifest.version)) {
    throw new Error("native runtime dependency manifest has an invalid name or version");
  }
  const dependencies: Record<string, string> = {};
  if (manifest.dependencies !== undefined) {
    if (typeof manifest.dependencies !== "object" || manifest.dependencies === null || Array.isArray(manifest.dependencies)) throw new Error("native runtime dependency declarations must be an object");
    for (const [name, constraint] of Object.entries(manifest.dependencies)) {
      if (!validPackageName(name) || typeof constraint !== "string" || constraint.length === 0 || constraint.length > 4096 || /[\u0000-\u001f\u007f]/u.test(constraint)) {
        throw new Error("native runtime dependency declaration is malformed");
      }
      Object.defineProperty(dependencies, name, { value: constraint, enumerable: true });
    }
  }
  return { name: manifest.name, version: manifest.version, dependencies };
}

/** Subpath package.json files may describe module formats without owning a package identity. */
export function resolveNativeRuntimePackageRoot(input: string): string {
  const path = realpathSync(input);
  const marker = sep + "node_modules" + sep;
  const start = path.lastIndexOf(marker);
  if (start < 0) throw new Error("dependency is outside a node_modules package");
  const parts = path.slice(start + marker.length).split(sep);
  const count = parts[0]?.startsWith("@") ? 2 : 1;
  if (parts.length <= count || parts.slice(0, count).some(part => part.length === 0)) throw new Error("dependency has no package boundary");
  const boundary = path.slice(0, start + marker.length) + parts.slice(0, count).join(sep);
  let directory = dirname(path);
  for (;;) {
    if (existsSync(join(directory, "package.json"))) {
      if (readNativePackage(directory, directory !== boundary) !== null) return directory;
    }
    if (directory === boundary) throw new Error("dependency package root has no valid identity");
    const parent = dirname(directory);
    if (parent === directory || !directory.startsWith(boundary + sep)) throw new Error("dependency has no contained package identity");
    directory = parent;
  }
}

export function assertSourceExclusionsUnreachable(excluded: readonly string[], inputs: Iterable<string>): void {
  const reached = [...inputs].map(path => realpathSync(path));
  if (excluded.length > 64 || new Set(excluded).size !== excluded.length) throw new Error("invalid native runtime source exclusions");
  for (const name of excluded) {
    if (!name.startsWith("src/assets/") || name.includes("\\") || name.split("/").some(part => part === "" || part === "." || part === "..")) {
      throw new Error("native runtime source exclusion must name one contained asset path");
    }
    const path = join(repository, name);
    const metadata = lstatSync(path);
    const canonical = realpathSync(path);
    const within = relative(repository, canonical);
    if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile()) || isAbsolute(within) || within === ".." || within.startsWith(".." + sep)) {
      throw new Error("native runtime source exclusion escapes its source package");
    }
    if (reached.some(input => input === canonical || input.startsWith(canonical + sep))) {
      throw new Error("native runtime source exclusion contains a reached host dependency");
    }
  }
}

export async function generateNativeRuntimeProfile(): Promise<unknown> {
  const packages = new Map<string, { name: string; version: string; exclude: readonly string[] }>();
  const admit = (root: string): void => {
    const parsed = readNativePackage(root, false);
    if (parsed === null) throw new Error("native runtime dependency has no package identity");
    const previous = packages.get(parsed.name);
    if (previous !== undefined && previous.version !== parsed.version) throw new Error("native runtime has multiple package versions");
    packages.set(parsed.name, { name: parsed.name, version: parsed.version, exclude: exclusions[parsed.name] ?? [] });
  };
  for (const dependency of providerPluginRuntimePackages(createProviderPluginRegistry([xPlugin]))) admit(dependency.root);
  const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../src/app-host.ts")], target: "bun", write: false, metafile: true });
  if (!built.success || built.metafile === undefined) throw new Error("native host dependency analysis failed");
  assertSourceExclusionsUnreachable(sourceExclusions, Object.keys(built.metafile.inputs));
  for (const input of Object.keys(built.metafile.inputs)) {
    const path = realpathSync(input);
    if (!path.includes("/node_modules/")) continue;
    const directory = resolveNativeRuntimePackageRoot(path);
    admit(directory);
    // Some dependencies resolve package directories from literal configuration,
    // outside import/require syntax (wordcell's browser adapter is one example).
    // Project every literal declared-dependency reference in the reached module.
    const manifest = readNativePackage(directory, false);
    if (manifest === null) throw new Error("native runtime dependency has no package identity");
    const declared = new Set(Object.keys(manifest.dependencies));
    const tree = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node) && declared.has(node.text)) {
        admit(dirname(createRequire(path).resolve(node.text + "/package.json")));
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  if (packages.size > 64) throw new Error("native runtime dependency count exceeds its bound");
  for (const name of Object.keys(exclusions)) if (!packages.has(name)) throw new Error(`stale platform exclusion policy ${name}: ${[...packages.keys()].join(",")}`);
  return { schemaVersion: 1, profiles: { "app-host-x-macos-arm64": {
    entrypoint: "src/app-host.ts", target: "darwin-arm64", sourceExclude: sourceExclusions,
    packages: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name, "en")),
  } } };
}

if (import.meta.main) {
  const path = resolve(import.meta.dir, "../native-runtime-profiles.json");
  const generated = JSON.stringify(await generateNativeRuntimeProfile(), null, 2) + "\n";
  if (process.argv[2] === "--write") writeFileSync(path, generated);
  else if (process.argv[2] !== "--check" || readFileSync(path, "utf8") !== generated) throw new Error("native runtime profile drift; run bun scripts/native-runtime-profile.ts --write");
}
