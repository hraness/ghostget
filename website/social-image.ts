import { readFileSync } from "node:fs";
import { join } from "node:path";

import { product } from "@hraness/design-kit/portfolio";
import { defineSocialImageSite, socialImageAlt } from "@hraness/web-discovery/social-image/card";

/** The header's one-colour ghost-and-wrench mark, embedded as a local data URL. */
const markSvg = readFileSync(join(import.meta.dir, "public", "marks", "wrench.svg"), "utf8");

/**
 * The one social-image declaration for ghostget.com. Every share card is
 * rendered from it by the shared @hraness/web-discovery template.
 */
export const socialSite = defineSocialImageSite({
  // SITE_DESCRIPTION runs past three card lines, so the card uses the
  // portfolio registry's one-line description, which fits two.
  description: product("wrench").oneLiner,
  domain: "ghostget.com",
  icon: {
    kind: "mark",
    src: `data:image/svg+xml;base64,${Buffer.from(markSvg, "utf8").toString("base64")}`,
  },
  name: "Ghostget",
  theme: {
    accent: "#2474d4",
    background: "#fbf1c7",
    foreground: "#393533",
    muted: "#584f48",
  },
});

/** Alt text for the static `/og.png` card. */
export const SOCIAL_IMAGE_ALT = socialImageAlt(socialSite);
