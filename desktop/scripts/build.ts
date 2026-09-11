import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBundleBoundary } from "@hraness/direct/tooling/bundle-boundary";

export const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function buildDesktop(kind: "native" | "direct" = "native", output = join(desktopRoot, "out", kind)): Promise<string> {
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  const result = await Bun.build({ entrypoints: [join(desktopRoot, kind === "native" ? "src/native-main.tsx" : "direct/main.tsx")], outdir: output, target: "browser", format: "esm", sourcemap: "external", minify: true, naming: { entry: "app.[ext]", asset: "[name].[ext]" }, external: ["*.woff2"], define: { "process.env.NODE_ENV": '"production"' } });
  if (!result.success) throw new Error("Desktop bundle failed: " + result.logs.map(log => log.message).join("\n"));
  await copyFile(resolve(desktopRoot, "../src/assets/fonts/nebula-sans/NebulaSans-Book.woff2"), join(output, "NebulaSans-Book.woff2"));
  await copyFile(join(desktopRoot, "assets/ghost.png"), join(output, "ghost.png"));
  const names = await readdir(output); const css = names.filter(name => name.endsWith(".css"));
  if (css.length === 0 || !names.includes("app.js")) throw new Error("Desktop build emitted no complete UI");
  const policy = kind === "native" ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'";
  await writeFile(join(output, "index.html"), `<!doctype html><html lang="en" data-hraness-theme="paper"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="icon" href="data:,"><title>Ghostget${kind === "direct" ? " · fictional workbench" : ""}</title>${css.map(name => `<link rel="stylesheet" href="./${name}">`).join("")}</head><body><div id="root"></div><script type="module" src="./app.js"></script></body></html>`);
  await verifyGraph(output, kind);
  return output;
}
export async function verifyGraph(output: string, kind: "native" | "direct"): Promise<void> {
  const names = await readdir(output); const scripts = names.filter(name => name.endsWith(".js"));
  if (scripts.length === 0) throw new Error("No executable bundles to inspect");
  for (const name of scripts) {
    const parsed: unknown = JSON.parse(await readFile(join(output, `${name}.map`), "utf8"));
    if (!parsed || typeof parsed !== "object" || !('sources' in parsed) || !Array.isArray(parsed.sources) || !parsed.sources.every(source => typeof source === "string")) throw new Error("Missing paired source map");
    const sources = parsed.sources as string[];
    for (const suffix of ["/src/panel.tsx", "/src/model.ts", kind === "native" ? "/src/native-port.ts" : "/direct/definition.ts", kind === "native" ? "/src/native-main.tsx" : "/direct/main.tsx"]) if (!sources.some(source => source.endsWith(suffix))) throw new Error(`Missing positive source selection: ${suffix}`);
    if (kind === "native" && sources.some(source => /\/desktop\/direct\/|@hraness\/direct|\/direct\/definition\.ts/u.test(source))) throw new Error("Fixture source reached native production");
    if (kind === "direct" && sources.some(source => /native-port|native-main|@tauri-apps/u.test(source))) throw new Error("Native authority reached fixture graph");
  }
  if (kind === "native") {
    const scan = await checkBundleBoundary({ directory: output, patterns: ["**/*.js", "**/*.html"], markers: ["@hraness/direct", "direct.browser-bridge/", "direct.session-manifest/", "__direct", "fictional-capability-", "fictional-approval-", "accounts.empty"] });
    if (scan.scanned.length === 0 || scan.violations.length > 0) throw new Error("Direct marker reached production output");
  }
}
if (import.meta.main) await buildDesktop(process.argv.includes("--direct") ? "direct" : "native");
