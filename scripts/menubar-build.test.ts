import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const repository = dirname(root);

describe("standalone menu-bar companion", () => {
  test("is a source executable rather than an app bundle or webview", async () => {
    const source = await readFile(join(repository, "menubar/ghostget-menubar.swift"), "utf8");
    expect(source).toContain("NSStatusBar.system.statusItem");
    expect(source).toContain("flock");
    expect(source).not.toContain("WKWebView");
    expect(source).not.toContain("NSBundle");
    expect(source).not.toContain(".app/");
  });

  test("build script invokes swiftc directly and rejects non-macOS builds", async () => {
    const script = await readFile(join(root, "build-menubar.ts"), "utf8");
    expect(script).toContain("swiftc");
    expect(script).toContain("-framework");
    expect(script).toContain("AppKit");
    expect(script).toContain("process.platform !== \"darwin\"");
    expect(script).not.toContain("tauri");
  });
});
