/** One standards-only shared menu per ordinary document. The inert preview
 * uses its separate renderer and never passes through this composition. */
export function renderAppearanceMenu(): string {
  const items = (["light", "dark", "system"] as const).map((theme) =>
    `<div class="hraness-design-theme-toggle__item" data-theme-value="${theme}" role="menuitemradio" aria-checked="${theme === "system"}" tabindex="-1"${theme === "system" ? ' data-selected="true"' : ""}><span aria-hidden="true" data-appearance-icon="${theme}"></span><span>${theme[0]!.toUpperCase()}${theme.slice(1)}</span></div>`).join("\n");
  return `<div class="ghostget-appearance hraness-design-theme-toggle" aria-busy="true" data-display="icons" data-hraness-appearance-menu data-presentation="menu" data-ready="false" data-theme-value="system">
  <button class="hraness-design-theme-toggle__trigger" type="button" aria-controls="ghostget-appearance-menu" aria-expanded="false" aria-haspopup="menu" aria-label="Appearance: System" disabled><span aria-hidden="true" data-current-appearance-icon="system"></span></button>
  <div class="hraness-design-theme-toggle__popover" hidden><div class="hraness-design-theme-toggle__menu" id="ghostget-appearance-menu" role="menu" aria-label="Appearance">${items}</div></div>
</div>`;
}

export function addDocumentAppearance(html: string, asset: string, format: "html" | "text" = "html"): string {
  if (format === "text") return html;
  if (!/^\/assets\/appearance-[a-f0-9]+\.js$/u.test(asset)) throw new Error("Invalid owned appearance asset.");
  if (html.includes("data-hraness-appearance-menu")) throw new Error("Appearance must have one composition owner.");
  const styles = html.match(/<link rel="stylesheet" href="[^"]+">/gu);
  if (styles?.length !== 1) throw new Error("Appearance requires one ordinary document stylesheet.");
  let result = html.replace(styles[0]!, `<script src="${asset}"></script>\n    ${styles[0]}`);
  const header = /<header\b[^>]*class="[^"]*\b(?:hraness-marketing-header|topbar)\b[^"]*"[^>]*>[\s\S]*?<\/header>/gu;
  const headers = result.match(header);
  const menu = renderAppearanceMenu();
  if (headers?.length === 1) {
    const existing = headers[0]!;
    const actions = /(<div class="hraness-marketing-header__actions">[\s\S]*?)(<\/div>)/u;
    const amended = actions.test(existing)
      ? existing.replace(actions, `$1\n${menu}\n$2`)
      : existing.replace("</header>", `${menu}\n</header>`);
    result = result.replace(existing, amended);
  } else if (headers === null && /<main class="route-state">/u.test(result)) {
    result = result.replace("<body>", `<body>\n<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar guide-topbar"><a class="wordmark" href="/" aria-label="Ghostget home">Ghostget</a><nav aria-label="Primary"><a href="/docs/tutorials/getting-started/">Install</a><a href="/docs/">Docs</a></nav>${menu}</header>`);
    result = result.replace('<main class="route-state">', '<main class="route-state" id="main">');
  } else throw new Error("Appearance requires exactly one ordinary header.");
  const targets = result.match(/<main\b[^>]*\bid="main"[^>]*>/gu);
  if (targets?.length !== 1 || /\btabindex=/iu.test(targets[0]!)) throw new Error("Expected one owned skip-link target.");
  const target = targets[0]!;
  return result.replace(target, `${target.slice(0, -1)} tabindex="-1">`);
}
