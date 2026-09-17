import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createSocialImageCard } from "@hraness/web-discovery/social-image/card";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { SITE_DESCRIPTION, SITE_TITLE } from "../website/build";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(repositoryRoot, "website", "public", "og.png");

const mark = (
  <svg aria-label="Ghostget" height="42" role="img" viewBox="0 0 42 42" width="42">
    <path
      d="M21 5c-8.4 0-14 6.2-14 14v17.6l4.6-3.7 4.7 3.7 4.7-3.7 4.7 3.7 4.6-3.7 4.7 3.7V19c0-7.8-5.6-14-14-14z"
      fill="currentColor"
    />
    <circle cx="16" cy="19" r="2.6" fill="#f8f7f4" />
    <circle cx="26" cy="19" r="2.6" fill="#f8f7f4" />
  </svg>
);

const card = createSocialImageCard({
  description: SITE_DESCRIPTION,
  domain: "ghostget.com",
  eyebrow: "Ghostget",
  mark,
  theme: {
    accent: "#9a5d16",
    background: "#f8f7f4",
    foreground: "#1a1916",
    muted: "#625e56",
  },
  title: SITE_TITLE,
});

const svg = await satori(card.element, {
  fonts: card.fonts.map((font) => ({
    data: font.data,
    name: font.name,
    style: font.style,
    weight: font.weight,
  })),
  height: card.height,
  width: card.width,
});
const png = new Resvg(svg).render().asPng();
await writeFile(outputPath, png);
console.log(`Wrote ${png.byteLength} bytes to ${outputPath}`);
