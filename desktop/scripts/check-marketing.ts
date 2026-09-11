import { copyFile, lstat, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildMarketing } from "./marketing.tsx";
import { desktopRoot } from "./build.ts";

const permitted = /^(?:(?:accounts|capabilities|activity|approvals)\.html|app\.css|NebulaSans-Book\.woff2|scenes\.json)$/u;
async function inspect(directory: string): Promise<string[]> {
  const names = (await readdir(directory)).sort();
  for (const name of names) {
    if (!permitted.test(name) || !(await lstat(join(directory, name))).isFile()) throw new Error("Marketing output contains an unexpected file");
    if (name.endsWith(".html")) {
      const text = await readFile(join(directory, name), "utf8");
      if (/<script\b|__direct|@tauri-apps|control_request|(?:src|href)=["'](?:https?:|\/\/)/iu.test(text) || !text.includes("<div inert=")) throw new Error("Marketing HTML is not an inert local scene");
    }
    if (name.endsWith(".css") && /url\(\s*["']?(?:https?:|\/\/)|@import/iu.test(await readFile(join(directory, name), "utf8"))) throw new Error("Marketing CSS references a foreign resource");
  }
  return names;
}
export async function checkMarketing(write = false): Promise<void> {
  const output = await buildMarketing(); const expected = await inspect(output);
  const target = resolve(desktopRoot, "../website/public/control");
  if (write) {
    await mkdir(target, { recursive: true });
    const existing = await inspect(target);
    for (const name of expected) await copyFile(join(output, name), join(target, name));
    for (const name of existing) if (!expected.includes(name)) await unlink(join(target, name));
  }
  const actual = await inspect(target);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Marketing scene inventory drifted; regenerate with desktop:marketing:check --write");
  for (const name of expected) if (!(await readFile(join(target, name))).equals(await readFile(join(output, name)))) throw new Error(`Marketing scene drifted: ${name}`);
  process.stdout.write("Checked marketing scenes match the real shared UI and contain no executable authority.\n");
}
if (import.meta.main) {
  if (process.argv.slice(2).some(value => value !== "--write")) throw new Error("Only --write is supported");
  await checkMarketing(process.argv.includes("--write"));
}
