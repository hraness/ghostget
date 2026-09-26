import { attachStatusPage } from "@hraness/design-kit/browser";

if (typeof document !== "undefined") {
  const root = document.querySelector<HTMLElement>(".hraness-status-page");
  if (root !== null) attachStatusPage(root);
}
