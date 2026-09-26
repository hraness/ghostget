import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { addDocumentAppearance } from "./appearance";

const asset = "/assets/appearance-123abc.js";
const head = '<html><head><link rel="stylesheet" href="/assets/styles-123.css"></head><body>';
const tail = '<main id="main"><h1>Actual content</h1></main></body></html>';
test("one final header menu preserves content and precedes first stylesheet for saved-mode paint", () => {
  for (const header of [
    '<header class="hraness-marketing-header"><nav>Navigation</nav><div class="hraness-marketing-header__actions"><a href="#start">Install</a></div></header>',
    '<header class="topbar guide-topbar"><a href="/">Brand</a><nav>Navigation</nav></header>',
  ]) {
    const html = addDocumentAppearance(head + header + tail, asset);
    expect(html.match(/data-hraness-appearance-menu/gu)).toHaveLength(1);
    expect(html.indexOf(`<script src="${asset}"></script>`)).toBeLessThan(html.indexOf('<link rel="stylesheet"'));
    expect(html.indexOf('data-hraness-appearance-menu')).toBeLessThan(html.indexOf('</header>'));
    expect(html).toContain('<main id="main" tabindex="-1"><h1>Actual content</h1>');
    expect(html.match(/role="menuitemradio"/gu)).toHaveLength(3);
    expect(html).toContain('data-ready="false"');
    expect(html).toContain('aria-label="Appearance: System" disabled');
  }
  expect(() => addDocumentAppearance(head + '<main><h1>Missing</h1></main></body></html>', asset)).toThrow("ordinary header");
});

test("every ordinary authored template has one accepted composition; preview remains inert", async () => {
  const source = new URL("./source/", import.meta.url);
  const paths = [...new Bun.Glob("*.html").scanSync(source.pathname)];
  for (const path of paths.filter((path) => path !== "preview.html")) {
    const template = await readFile(new URL(path, source), "utf8");
    const rendered = addDocumentAppearance(template, asset);
    expect(rendered.match(/data-hraness-appearance-menu/gu)).toHaveLength(1);
    expect(rendered).toContain('tabindex="-1"');
  }
  const preview = await readFile(new URL("preview.html", source), "utf8");
  expect(preview).not.toMatch(/<(?:script|button|input)\b/iu);
  expect(() => addDocumentAppearance(preview, asset)).toThrow("ordinary header");
  expect(() => addDocumentAppearance(head + '<header class="topbar"></header>' + tail, "https://other.test/a.js")).toThrow("owned appearance");
  expect(() => addDocumentAppearance(addDocumentAppearance(head + '<header class="topbar"></header>' + tail, asset), asset)).toThrow("one composition owner");
});


test("text outputs remain byte-exact and ordinary HTML still fails closed", async () => {
  for (const path of ["404.md", "llms.txt"]) {
    const source = await readFile(new URL(`./source/${path}`, import.meta.url), "utf8");
    expect(addDocumentAppearance(source, asset, "text")).toBe(source);
    expect(() => addDocumentAppearance(source, asset)).toThrow("ordinary document stylesheet");
  }
  const markdown = "# Code example\n```html\n" + head + tail + "\n```\n";
  expect(addDocumentAppearance(markdown, asset, "text")).toBe(markdown);
});
