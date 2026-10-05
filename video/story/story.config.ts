/**
 * GhostGet's launch film: a signed-in browser hands an agent everything, the
 * reveal, a page read as Markdown with the measured size difference, named
 * actions with previews and a record of every send, and an end card that asks
 * your agent to install GhostGet. Numbers and status come from
 * website/launch/facts.ts; commands from the README.
 */
import { join } from "node:path";

import { launchFacts } from "../../website/launch/facts.ts";
import { defineStory } from "./story.ts";
import palette from "./palette.json" with { type: "json" };

const repo = join(import.meta.dir, "../..");
const f = (key: keyof typeof launchFacts) => launchFacts[key].value;

export default () => defineStory({
  id: "ghostget",
  brand: {
    wordmark: "GhostGet",
    mark: join(repo, "website/public/marks/wrench.svg"),
    markAspect: 534 / 455,
    // Read with site-palette.ts from https://ghostget.com in dark mode; see palette.json.
    palette: { values: palette.palette },
    designKit: join(repo, "node_modules/@hraness/design-kit"),
  },
  acts: [
    {
      kind: "scatter", headline: "A signed-in browser lets your agent click anything you can.", accents: ["anything"],
      cards: [
        { app: "Browser", glyph: "B", color: "#7aa2f7", lines: ["Every cookie", "Every button"] },
        { app: "Raw HTML", glyph: "<>", color: "#e0af68", lines: ["Pages of markup", "to read through"] },
        { app: "Session", glyph: "S", color: "#f7768e", lines: ["Full account access", "for one small task"] },
      ],
      ghosts: ["Pop-up", "Cookie banner", "Login wall", "Captcha", "Tracking script"],
    },
    { kind: "reveal", tagline: "wget for the ghost in the machine." },
    {
      kind: "stats", headline: "Your agent reads the page, not the HTML.", accents: ["page,"],
      items: [
        { value: f("wikiMarkdownBytes"), label: "of Markdown for a Wikipedia article" },
        { value: f("wikiHtmlBytes"), label: "of HTML on the raw page" },
      ],
      note: `About ${f("wikiRatio")} smaller, with its source attached.`,
    },
    {
      kind: "terminal", headline: "Each read comes back as Markdown with its source.", accents: ["Markdown"],
      title: "ghostget",
      // Output captured from `ghostget read https://example.com` on 2026-10-04.
      lines: [
        { cmd: "ghostget read https://example.com" },
        { out: 'title: "Example Domain"', tone: "muted" },
        { out: 'source: "https://example.com/"', tone: "muted" },
        { out: 'capture_status: "complete"', tone: "ok" },
        { out: "# Example Domain" },
      ],
    },
    {
      kind: "cards", headline: "Nothing goes out until you say so.", accents: ["you", "say", "so."],
      items: [
        { tag: "Preview", title: "Anything beyond a read starts as a preview of exactly what will be sent" },
        { tag: "No double posts", title: "Every send is written down first and never resent on its own" },
        { tag: `${f("serviceCount")} services`, title: "Including Gmail, WhatsApp, LinkedIn, GitHub and YouTube" },
      ],
    },
  ],
  end: {
    lead: "Ask your agent:", prompt: "Install GhostGet from ghostget.com",
    terms: `Free and MIT licensed · macOS and Linux · ${f("status")}`, url: "ghostget.com",
  },
  formats: ["wide", "square", "portrait"],
});
