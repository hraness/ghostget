import { paletteColors } from "@hraness/design-kit";
import { installAppearanceMenus } from "@hraness/design-kit/browser";

// Blocking head bundle: the shared controller applies the saved mode before
// paint and mounts the one header menu after the document is parsed.
installAppearanceMenus({
  lightThemeColor: paletteColors.gruvbox.light.background,
  darkThemeColor: paletteColors.gruvbox.dark.background,
});
