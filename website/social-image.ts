import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defineSocialImageSite, socialImageAlt } from "@hraness/web-discovery/social-image/card";

/** The header's one-colour ghost-and-wrench mark, embedded as a local data URL. */
const markSvg = readFileSync(join(import.meta.dir, "public", "marks", "wrench.svg"), "utf8");

/**
 * The registry one-liner, shortened to fit the card's two description lines
 * and ended with a period like the site's other description copy.
 */
export const SOCIAL_IMAGE_DESCRIPTION = "Named web actions for AI agents: read pages, save media, use accounts.";

/**
 * The one social-image declaration for ghostget.com. Every share card is
 * rendered from it by the shared @hraness/web-discovery template.
 */
export const socialSite = defineSocialImageSite({
  // SITE_DESCRIPTION and the registry one-liner both run past two card
  // lines, so the card drops "connected" from the one-liner to fit two whole.
  description: SOCIAL_IMAGE_DESCRIPTION,
  domain: "ghostget.com",
  icon: {
    kind: "mark",
    src: `data:image/svg+xml;base64,${Buffer.from(markSvg, "utf8").toString("base64")}`,
  },
  name: "GhostGet",
  theme: {
    accent: "#2474d4",
    background: "#fbf1c7",
    foreground: "#393533",
    muted: "#584f48",
    // The site's bright action amber. The default wash, the blue accent, turns
    // this paper background a muddy grey-green.
    wash: "#d99a4a",
  },
});

/** Alt text for the static `/og.png` card. */
export const SOCIAL_IMAGE_ALT = socialImageAlt(socialSite);
