import { describe, expect, test } from "bun:test";

import { htmlMainToMarkdown } from "./html-to-markdown";

describe("HTML main-to-markdown conversion", () => {
  test("keeps headings, links, code, lists, tables, and disclosures", () => {
    const markdown = htmlMainToMarkdown(`
      <html><body>
        <main>
          <div aria-hidden="true" class="hero-field"><span>🔧</span></div>
          <h1>Install Ghostget</h1>
          <a class="button" href="#start">Get started</a>
          <p>Use <code>ghostget doctor</code> and the <a href="/security/">security guide</a>.</p>
          <figure>
            <img alt="A bounded path [with proof]" src="/images/editorial/example.webp">
            <figcaption><span>One named operation.</span><small>Generated for Ghostget.</small></figcaption>
          </figure>
          <pre><code>ghostget read https://example.com/article</code></pre>
          <ul><li>One <strong>exact</strong> account</li><li>Second</li></ul>
          <table>
            <thead><tr><th>Command</th><th>Result</th></tr></thead>
            <tbody><tr><th>ghostget URL</th><td>Durable Markdown</td></tr></tbody>
          </table>
          <details><summary>Is Ghostget an AI agent?</summary><p>No. Your agent owns the model.</p></details>
        </main>
      </body></html>
    `, "https://ghostget.com/getting-started/");

    expect(markdown).toBe([
      "# Install Ghostget",
      "",
      "[Get started](https://ghostget.com/getting-started/#start)",
      "",
      "Use `ghostget doctor` and the [security guide](https://ghostget.com/security/).",
      "",
      "![A bounded path \\[with proof\\]](https://ghostget.com/images/editorial/example.webp)",
      "",
      "One named operation. Generated for Ghostget.",
      "",
      "```",
      "ghostget read https://example.com/article",
      "```",
      "",
      "- One **exact** account",
      "- Second",
      "",
      "| Command | Result |",
      "| --- | --- |",
      "| ghostget URL | Durable Markdown |",
      "",
      "### Is Ghostget an AI agent?",
      "",
      "No. Your agent owns the model.",
      "",
    ].join("\n"));
    expect(markdown).not.toContain("🔧");
    expect(markdown).not.toContain("<");
  });

  test("rejects pages without a main landmark or convertible content", () => {
    expect(() => htmlMainToMarkdown("<html><body><p>none</p></body></html>", "https://ghostget.com/"))
      .toThrow("main landmark");
    expect(() => htmlMainToMarkdown("<main><div aria-hidden=\"true\">x</div></main>", "https://ghostget.com/"))
      .toThrow("empty document");
  });

  test("omits decorative images and keeps images with meaningful alternatives", () => {
    const markdown = htmlMainToMarkdown(`
      <main>
        <h1>Image boundaries</h1>
        <p>
          <img alt="" src="/images/editorial/decorative.webp">
          <img src="/images/editorial/missing-alt.webp">
          <img alt="   " src="/images/editorial/blank-alt.webp">
          Read the argument.
        </p>
        <figure>
          <img alt="A meaningful diagram" src="/images/editorial/diagram.webp">
          <figcaption>The diagram has a textual alternative.</figcaption>
        </figure>
      </main>
    `, "https://ghostget.com/arguments/");

    expect(markdown).toContain("Read the argument.");
    expect(markdown).toContain(
      "![A meaningful diagram](https://ghostget.com/images/editorial/diagram.webp)",
    );
    expect(markdown).toContain("The diagram has a textual alternative.");
    expect(markdown).not.toContain("decorative.webp");
    expect(markdown).not.toContain("missing-alt.webp");
    expect(markdown).not.toContain("blank-alt.webp");
    expect(markdown).not.toContain("![](");
  });
});
