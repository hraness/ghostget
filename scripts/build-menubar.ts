import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const output = resolve(root, "dist/ghostget-menubar");
if (process.platform !== "darwin") {
  throw new Error("Ghostget menu-bar companion builds require macOS; no app bundle is produced.");
}
await mkdir(dirname(output), { recursive: true });
await rm(output, { force: true });
const result = Bun.spawnSync([
  "/usr/bin/xcrun", "swiftc", "-O", "-framework", "AppKit",
  resolve(root, "menubar/ghostget-menubar.swift"), "-o", output,
], { stdout: "inherit", stderr: "inherit" });
if (result.exitCode !== 0) throw new Error(`swiftc failed with exit code ${String(result.exitCode)}`);
console.log(`Built standalone Ghostget menu-bar companion at ${output}`);
