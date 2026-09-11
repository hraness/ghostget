import { chmod, copyFile, cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { buildDesktop, desktopRoot } from "./build.ts";
const repository = resolve(desktopRoot, "..");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function packageDirectory(name: string, parent: string): Promise<string> {
  let current = parent;
  for (;;) { const candidate = join(current, "node_modules", name); try { const path = await realpath(candidate); const metadata = JSON.parse(await readFile(join(path, "package.json"), "utf8")) as { name?: string }; if (metadata.name === name) return path; } catch {} const next = dirname(current); if (next === current) throw new Error(`Missing installed runtime dependency ${name}`); current = next; }
}
async function copyDependency(name: string, sourceParent: string, targetParent: string, ancestors: ReadonlySet<string>): Promise<void> {
  const source = await packageDirectory(name, sourceParent); if (ancestors.has(source)) return;
  const target = join(targetParent, "node_modules", name);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, dereference: true, filter: path => !relative(source, path).split(sep).includes("node_modules") });
  const metadata = JSON.parse(await readFile(join(source, "package.json"), "utf8")) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
  const next = new Set([...ancestors, source]);
  for (const dependency of Object.keys(metadata.dependencies ?? {})) await copyDependency(dependency, source, target, next);
  for (const dependency of Object.keys(metadata.optionalDependencies ?? {})) { try { await packageDirectory(dependency, source); } catch { continue; } await copyDependency(dependency, source, target, next); }
}
async function inventory(root: string, current = root): Promise<{ path: string; sha256: string; size: number }[]> {
  const entries: { path: string; sha256: string; size: number }[] = [];
  for (const name of (await readdir(current)).sort()) { const path = join(current, name); const value = await stat(path); if (value.isDirectory()) entries.push(...await inventory(root, path)); else if (value.isFile()) { const bytes = await readFile(path); entries.push({ path: relative(root, path), sha256: sha256(bytes), size: bytes.length }); } else throw new Error("Unsupported runtime resource"); }
  return entries;
}
/** Build-time copying only. Runtime never fetches or installs its own dependencies. */
export async function stageRuntime(): Promise<string> {
  if (Bun.version !== "1.3.14") throw new Error("Native resources require the pinned Bun 1.3.14 toolchain");
  const root = join(desktopRoot, "out", "runtime"); const target = join(root, "package");
  await rm(root, { recursive: true, force: true }); await mkdir(target, { recursive: true });
  const metadata = JSON.parse(await readFile(join(repository, "package.json"), "utf8")) as { files: string[]; dependencies: Record<string, string> };
  // Preserve every canonical published path and its exact source bytes. The
  // registry resolves import.meta.url and hashes the real source closure.
  for (const name of [...metadata.files, "package.json", "bunfig.toml", "bun.lock"]) {
    if (name.startsWith("!") || name.includes("*") || name.startsWith("/") || name.split("/").includes("..")) throw new Error("Runtime package manifest needs an explicit reviewed file list");
    const source = join(repository, name); const destination = join(target, name); await mkdir(dirname(destination), { recursive: true }); await cp(source, destination, { recursive: true, dereference: true });
  }
  if (!await Bun.file(join(target, "src/control/helper.ts")).exists()) throw new Error("The canonical package must include its control helper before native packaging");
  for (const name of Object.keys(metadata.dependencies)) await copyDependency(name, repository, target, new Set());
  // Only the credential helper loads this runtime dependency. Keep its pinned
  // version and relative WASM payload intact in the native resources.
  const sdkSource = await packageDirectory("@1password/sdk", repository);
  const sdk = JSON.parse(await readFile(join(sdkSource, "package.json"), "utf8")) as { version: string };
  if (sdk.version !== "0.5.0") throw new Error("Native credential helper requires @1password/sdk 0.5.0");
  await copyDependency("@1password/sdk", repository, target, new Set());
  for (const name of ["ghostget-bun", "ghostget-credential-bun"]) { await copyFile(process.execPath, join(root, name)); await chmod(join(root, name), 0o755); }
  const files = await inventory(root);
  if (files.some(file => file.path.includes("@hraness/direct/") || file.path.includes("desktop/direct/"))) throw new Error("Direct cannot ship in runtime resources");
  await writeFile(join(root, "runtime-manifest.json"), JSON.stringify({ schema: "ghostget.native-resources/1", bunVersion: Bun.version, files }, null, 2));
  return root;
}
if (import.meta.main) {
  await buildDesktop("native"); await stageRuntime();
  if (!process.argv.includes("--stage-only")) {
    const child = Bun.spawn([process.execPath, join(repository, "node_modules/@tauri-apps/cli/tauri.js"), "build"], { cwd: join(desktopRoot, "src-tauri"), stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    if (await child.exited !== 0) throw new Error("Native build failed");
  }
}
