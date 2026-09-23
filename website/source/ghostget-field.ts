import { attachHeroLight } from "@hraness/design-kit/browser";

// The static field stays readable without JavaScript. Shared pointer lifecycle
// adds restrained drift, proximity and curious eyes only while the hero is active.
const hero = document.querySelector<HTMLElement>(".ghostget-product-hero");
if (hero !== null) attachHeroLight(hero);
