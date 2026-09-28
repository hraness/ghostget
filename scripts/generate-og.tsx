import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createSocialImageCard, socialImageSiteDetails } from "@hraness/web-discovery/social-image/card";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

import { socialSite } from "../website/social-image";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = process.argv[2] ?? join(repositoryRoot, "website", "public", "og.png");

// The site card: no page copy, so the shared template draws the product layout.
const card = createSocialImageCard(socialImageSiteDetails(socialSite));

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
