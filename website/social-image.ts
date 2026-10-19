import { marketing } from "./portfolio-copy";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { defineSocialImageSite, socialImageAlt, type SocialImagePage } from "@hraness/web-discovery/social-image/card";

/**
 * The header's one-colour ghost-and-wrench mark, the glyph the sticky header
 * paints in foil. Read at build time by the card generator and tests.
 */
export const SOCIAL_IMAGE_BRAND_MARK = readFileSync(join(import.meta.dir, "public", "marks", "wrench.svg"), "utf8");

/**
 * The portfolio's authored share-card variant fits without trimming.
 */
export const SOCIAL_IMAGE_DESCRIPTION = marketing.channels.social.imageDescription;

/**
 * The one social-image declaration for ghostget.com. Every share card is
 * rendered from it by the shared @hraness/web-discovery template.
 */
export const socialSite = defineSocialImageSite({
  // The canonical site-card variant preserves the shared template's fit gate.
  description: SOCIAL_IMAGE_DESCRIPTION,
  domain: "ghostget.com",
  // The header shows the foil mark and the product name over the site's
  // Design Kit palette (data-palette="gruvbox" on every page).
  brand: marketing.names.name,
  brandMark: SOCIAL_IMAGE_BRAND_MARK,
  name: marketing.names.name,
  palette: "gruvbox",
});

/**
 * The home card copies the homepage hero: its short headline, with the
 * tagline beneath. The tagline alone would need three lines as the headline.
 */
export const SOCIAL_IMAGE_HOME_PAGE: SocialImagePage = {
  headline: marketing.hero.heading,
  layout: "product",
};

/** Alt text for the static `/og.png` card. */
export const SOCIAL_IMAGE_ALT = socialImageAlt(socialSite);
