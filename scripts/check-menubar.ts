import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "darwin") throw new Error("Ghostget native menu checks require macOS.");
const root = resolve(import.meta.dir, "..");
const directory = await mkdtemp(join(tmpdir(), "ghostget-menubar-check-"));
try {
  const executable = join(directory, "outputs-tests");
  const compile = Bun.spawnSync([
    "/usr/bin/xcrun", "swiftc", "-parse-as-library",
    resolve(root, "menubar/Outputs.swift"), resolve(root, "menubar/OutputsTests.swift"), "-o", executable,
  ], { stdout: "inherit", stderr: "inherit" });
  if (compile.exitCode !== 0) throw new Error("Ghostget menu model compilation failed.");
  const tests = Bun.spawnSync([executable], { stdout: "inherit", stderr: "inherit" });
  if (tests.exitCode !== 0) throw new Error("Ghostget menu model checks failed.");
} finally { await rm(directory, { recursive: true, force: true }); }
await import("./build-menubar");
