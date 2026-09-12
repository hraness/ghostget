import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotLanternMaterial } from "./lantern-material";

const source = join(import.meta.dir, "vendor/lantern-material");

test("retains the exact admitted asset-free Lantern CSS and attribution", async () => {
  const snapshot = await snapshotLanternMaterial(source);
  expect(snapshot.manifest.source.commit).toBe("eccb0341d8d0ba960a0f02248cf59888062afb0a");
  expect([...snapshot.files.keys()]).toEqual(["lantern-material.css", "LICENSE"]);
  for (const name of ["lantern-material.css", "LICENSE"] as const) {
    const bytes = snapshot.files.get(name);
    expect(bytes).toBeDefined();
    if (bytes === undefined) throw new Error("Missing admitted Lantern bytes.");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(snapshot.manifest.files[name].sha256);
    expect(Buffer.compare(bytes, await readFile(join(source, name)))).toBe(0);
  }
});

test("refuses incomplete, extra, drifted, oversized or linked material before static output", async () => {
  for (const mutation of ["missing", "extra", "drift", "oversized", "symlink"] as const) {
    const directory = await mkdtemp(join(tmpdir(), "ghostget-lantern-test-"));
    try {
      await cp(source, directory, { recursive: true });
      const css = join(directory, "lantern-material.css");
      if (mutation === "missing") await rm(join(directory, "check.d.mts"));
      if (mutation === "extra") await writeFile(join(directory, "extra.css"), "body {}");
      if (mutation === "drift") await writeFile(css, "body { color: red; }");
      if (mutation === "oversized") await writeFile(css, Buffer.alloc(256 * 1024));
      if (mutation === "symlink") {
        await rm(css);
        await symlink(join(source, "lantern-material.css"), css);
      }
      await expect(snapshotLanternMaterial(directory)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("keeps the Lantern wall on the homepage hero and preserves ordinary reading and inert previews", async () => {
  const directory = join(import.meta.dir, "source");
  const home = await readFile(join(directory, "index.html"), "utf8");
  expect(home).toContain('data-hraness-marketing-preset="editorial" data-hraness-material="lantern"');
  expect(home).toContain('class="hraness-marketing-header hraness-material-chrome"');
  expect(home.match(/hraness-material-wall/gu)).toHaveLength(1);
  expect(home).toContain('class="hraness-marketing-hero ghostget-product-hero hraness-material-wall"');
  expect(home).not.toContain('class="hraness-marketing-field"');
  expect(home.match(/class="hraness-marketing-question hraness-material-disclosure"/gu)).toHaveLength(11);
  expect(home.match(/sandbox referrerpolicy="no-referrer" loading="lazy" tabindex="-1"/gu)).toHaveLength(5);
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".html") || name === "index.html") continue;
    const html = await readFile(join(directory, name), "utf8");
    expect(html).not.toContain('data-hraness-material="lantern"');
    expect(html).not.toContain("hraness-material-wall");
  }
  const css = await readFile(join(directory, "styles.css"), "utf8");
  expect(css).toContain("-webkit-backdrop-filter: var(--hraness-material-chrome-blur);\n  backdrop-filter: var(--hraness-material-chrome-blur);");
  expect(css).toContain("background-color: var(--hraness-material-chrome-paint);");
  expect(css).toContain("background-color: var(--hraness-material-plane);");
  expect(css).toContain("background-color: var(--hraness-material-warm-plane);\n  color: var(--hraness-material-ink);");
  expect(css).toContain("background-color: Highlight;\n    color: HighlightText;");
  expect(css).toContain(".proof-transcript {\n  background: var(--code-background);");
  const adapters = css.slice(css.indexOf("/* Bind existing native surfaces"));
  expect(adapters).not.toContain("!important");
});
