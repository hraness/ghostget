/*
 * Static rendering of the shared design-kit PlatformInstall block. The React
 * component is StyleX-only, so this site renders the same markup, hook class
 * names, marks, and copy behavior as plain HTML: `source/platform-install.ts`
 * enhances the tabs and copy buttons, and `source/styles.css` carries the
 * matching presentation. Without JavaScript every platform's command shows.
 */
import { platformLabel, platformMark, type PlatformId } from "@hraness/design-kit";

export type StaticPlatformInstallTarget = Readonly<{
  id: PlatformId;
  command?: string;
  shell?: string;
  /** Trusted HTML fragment. */
  noteHtml?: string;
  unavailable?: boolean;
  /** Trusted HTML fragment; required when `unavailable` is true. */
  unavailableNoteHtml?: string;
}>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderPlatformIcon(id: PlatformId): string {
  const mark = platformMark(id);
  return `<svg aria-hidden="true" class="hraness-platform-icon" fill="currentColor" focusable="false" viewBox="${mark.viewBox}"><path d="${mark.path}"></path></svg>`;
}

const copyGlyph = '<svg aria-hidden="true" class="hraness-platform-install__copy-icon" fill="none" focusable="false" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><rect height="12" rx="2" width="12" x="8" y="8"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>';

export function renderPlatformInstall(
  options: Readonly<{ id: string; label?: string; analyticsCommand?: string; platforms: readonly StaticPlatformInstallTarget[] }>,
): string {
  const [first] = options.platforms;
  if (first === undefined) throw new RangeError("Platform install needs at least one platform.");
  const seen = new Set<string>();
  for (const target of options.platforms) {
    if (seen.has(target.id)) throw new RangeError(`Duplicate platform id: ${target.id}.`);
    seen.add(target.id);
    if (target.unavailable === true ? !target.unavailableNoteHtml : !target.command?.trim()) {
      throw new RangeError(`Platform ${target.id} needs ${target.unavailable === true ? "an unavailable note" : "a command"}.`);
    }
  }
  const base = options.id;
  const tabs = options.platforms.map((target) => {
    const selected = target.id === first.id;
    return `<button aria-controls="${base}-panel-${target.id}" aria-selected="${selected}" class="hraness-platform-install__tab" data-availability="${target.unavailable === true ? "unavailable" : "available"}" data-platform="${target.id}" id="${base}-tab-${target.id}" role="tab" tabindex="${selected ? 0 : -1}" type="button">${renderPlatformIcon(target.id)}<span>${escapeHtml(platformLabel(target.id))}</span></button>`;
  }).join("");
  const panels = options.platforms.map((target) => {
    const name = platformLabel(target.id);
    const subject = `${name} install command`;
    const unavailable = target.unavailable === true
      ? `<div class="hraness-platform-install__unavailable">${target.unavailableNoteHtml}</div>`
      : "";
    const command = target.command === undefined ? "" : `<div class="hraness-platform-install__command" data-copy-state="idle"><div class="hraness-platform-install__command-bar"><span class="hraness-platform-install__shell">${escapeHtml(target.shell ?? "")}</span><button class="hraness-platform-install__copy" data-copy-state="idle" data-platform-install-copy hidden type="button">${copyGlyph}<span data-platform-install-copy-label>Copy</span><span class="hraness-platform-install__status"> ${escapeHtml(subject)}</span></button></div><pre aria-label="${escapeHtml(subject)}" class="hraness-platform-install__pre" tabindex="0"><code class="hraness-platform-install__code">${escapeHtml(target.command)}</code></pre></div>`;
    const note = target.noteHtml === undefined ? "" : `<div class="hraness-platform-install__note">${target.noteHtml}</div>`;
    return `<div aria-labelledby="${base}-tab-${target.id}" class="hraness-platform-install__panel" data-availability="${target.unavailable === true ? "unavailable" : "available"}" data-platform="${target.id}" id="${base}-panel-${target.id}" role="tabpanel"><div class="hraness-platform-install__panel-body"><p class="hraness-platform-install__panel-label">${renderPlatformIcon(target.id)}<span>${escapeHtml(name)}</span></p>${unavailable}${command}${note}</div></div>`;
  }).join("");
  const analytics = options.analyticsCommand === undefined ? "" : ` data-install-command="${escapeHtml(options.analyticsCommand)}"`;
  return `<div class="hraness-platform-install" data-hraness-platform-install="" data-selected-platform="${first.id}" data-selection-source="default" id="${base}"${analytics}><div aria-label="${escapeHtml(options.label ?? "Platform")}" class="hraness-platform-install__tabs" hidden role="tablist">${tabs}</div>${panels}<p aria-live="polite" class="hraness-platform-install__status" role="status"></p></div>`;
}

export function renderPlatformBadges(
  platforms: readonly (PlatformId | Readonly<{ id: PlatformId; note: string }>)[],
  label = "Runs on",
): string {
  const items = platforms.map((entry) => {
    const id = typeof entry === "string" ? entry : entry.id;
    const note = typeof entry === "string" ? "" : ` <span class="hraness-platform-badges__note">${escapeHtml(entry.note)}</span>`;
    return `<li class="hraness-platform-badges__item">${renderPlatformIcon(id)}<span>${escapeHtml(platformLabel(id))}</span>${note}</li>`;
  }).join("");
  return `<div class="hraness-platform-badges"><span class="hraness-platform-badges__label">${escapeHtml(label)}</span><ul class="hraness-platform-badges__list">${items}</ul></div>`;
}
