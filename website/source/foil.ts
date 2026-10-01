import { attachFoil } from "@hraness/design-kit/browser";
import { initHranessCookieConsent } from "@hraness/site-footer/consent";

if (typeof document !== "undefined") {
  attachFoil(document.documentElement);
  initHranessCookieConsent();
}
