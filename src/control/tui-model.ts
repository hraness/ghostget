import type { ActivityPage, ControlRequest, ControlSnapshot } from "./protocol";

export const TUI_SECTIONS = ["Setup", "Accounts", "Capabilities", "Approvals", "Activity", "Interfaces"] as const;
export type TuiSection = typeof TUI_SECTIONS[number];
export interface TuiRow { readonly id: string; readonly label: string; readonly detail: readonly string[] }
export interface TuiChoice { readonly label: string; readonly action: string }
export type TuiDialog =
  | { readonly kind: "choices"; readonly title: string; readonly choices: readonly TuiChoice[]; selected: number }
  | { readonly kind: "input"; readonly title: string; value: string; readonly provider: string; readonly browser: "chrome" | "safari"; readonly profile: string | null }
  | { readonly kind: "confirm"; readonly title: string; readonly detail: readonly string[]; readonly request: ControlRequest; value: string; scroll: number; reviewed: boolean }
  | { readonly kind: "detail"; readonly title: string; readonly detail: readonly string[]; scroll: number }
  | { readonly kind: "help"; scroll: number };

export interface TuiAttempt {
  readonly attemptId: string;
  readonly accountId: string;
  readonly provider: string;
  readonly browser: string;
  readonly subject: string | null;
}

export interface TuiState {
  snapshot: ControlSnapshot | null;
  section: TuiSection;
  selected: number;
  filter: string;
  filtering: boolean;
  notice: string;
  fresh: boolean;
  busy: boolean;
  dialog: TuiDialog | null;
  activity: ActivityPage | null;
  activityPrevious: (string | null)[];
  activityCursor: string | null;
  attempt: TuiAttempt | null;
  browserConnections: boolean;
}

export function createTuiState(): TuiState {
  return { snapshot: null, section: "Setup", selected: 0, filter: "", filtering: false, notice: "Loading local controls…", fresh: false, busy: false, dialog: null, activity: null, activityPrevious: [], activityCursor: null, attempt: null, browserConnections: process.platform === "darwin" };
}

/** Treat every displayed provider string as data, including terminal sequences,
 * bidi overrides and zero-width formatting. Bound before doing Unicode work. */
export function tuiText(text: string, limit = 2_048): string {
  const clean = Bun.stripANSI(text.slice(0, 32_768)).replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/gu, " ").trim();
  const characters = [...clean];
  return characters.length > limit ? `${characters.slice(0, Math.max(0, limit - 1)).join("")}…` : clean;
}

/** Reviews preserve every character, escaping terminal controls visibly instead
 * of dropping bytes or collapsing meaningful whitespace in request content. */
function reviewText(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}]/gu, (character) => {
    const point = character.codePointAt(0)!;
    return point <= 0xffff ? `\\u${point.toString(16).padStart(4, "0")}` : `\\u{${point.toString(16)}}`;
  });
}

function fit(text: string, width: number, review = false): string {
  const clean = review ? reviewText(text) : tuiText(text);
  if (width <= 0) return "";
  if (Bun.stringWidth(clean) <= width) return clean;
  let result = "";
  let cells = 0;
  for (const character of clean) { const size = Bun.stringWidth(character); if (cells + size > width - 1) break; result += character; cells += size; }
  return result + "…";
}

function wrap(text: string, width: number, review = false): string[] {
  if (width < 1) return [];
  const result: string[] = [];
  let line = "";
  let cells = 0;
  let scalars = 0;
  for (const character of review ? reviewText(text) : tuiText(text, 8_192)) {
    const size = Bun.stringWidth(character);
    // Scalar width accounting is conservative for combined glyphs. Also bound
    // zero-width combining runs so a single row can never grow with the entire
    // preview, and avoid repeatedly rescanning that growing string.
    if (cells + size > width || scalars >= width * 4) { result.push(line); line = ""; cells = 0; scalars = 0; }
    if (size <= width) { line += character; cells += size; scalars += 1; }
  }
  result.push(line);
  return result;
}

export function tuiRows(state: TuiState): readonly TuiRow[] {
  const snapshot = state.snapshot;
  if (snapshot === null) return [];
  let rows: readonly TuiRow[];
  switch (state.section) {
    case "Setup": rows = [
      { id: "first-read", label: "1. Try a public page · no account needed", detail: ["Give your agent precise web tools, with connected accounts under your control.", "Run in another terminal: ghostget read https://example.com", "This first read needs no account or password vault. Browser dependencies may be requested on first use.", "Capture into Markdown: ghostget https://example.com", "This control panel does not run an AI agent. Use the CLI or Ghostget skill from your preferred agent."] },
      { id: "connect", label: `2. Connect an account · ${snapshot.accounts.length} configured`, detail: [state.browserConnections ? "Press Enter to choose a provider and browser. Sign in there, return here, verify the account, then review and save." : "Browser sign-in from this panel currently requires macOS. Connect supported providers using ghostget auth --help; existing accounts remain manageable here.", "Passwords stay in your browser. Other providers: ghostget auth --help"] },
      { id: "permissions", label: `3. Review access · ${snapshot.policy.managed ? "managed permissions on" : "managed permissions off"}`, detail: ["Press Enter to inspect capabilities and choose Ask, Allow, or Deny for the selected account.", "Enabling managed permissions changes how operations are admitted. Review the confirmation before enabling.", "An allowed operation still follows Ghostget's exact preview and write confirmation rules."] },
      { id: "vault", label: "Optional · import an X API token from 1Password", detail: ["The password vault is optional. It currently imports one verified X user token through the 1Password desktop app on macOS.", "It is not a general password manager and is not needed for browser sign-in.", "Exit this controller first, then run: ghostget vault --help", "Supply the secret reference to the CLI; never paste a password or token into this panel or agent chat."] },
      { id: "agent", label: "Use with your agent · CLI and one reusable skill", detail: ["Inspect installed tools: ghostget capabilities --json", "Diagnose setup: ghostget doctor --json", "The bundled skills/ghostget/SKILL.md explains the CLI workflows to your agent.", "Getting started: https://ghostget.com/getting-started", "macOS menu bar: quit this panel, then ghostget menubar start", "One local controller runs at a time. Stop the menu bar with ghostget menubar stop before starting this panel."] },
    ]; break;
    case "Accounts": rows = snapshot.accounts.map((account) => ({ id: account.id, label: `${account.id === snapshot.accountId ? "* " : ""}${account.id} · ${account.status}`, detail: [`Provider: ${account.provider ?? "browser session"}`, `Subject: ${account.subject ?? "not verified"}`, `Kind: ${account.kind}`, `Source: ${account.source ?? "local account"}`, `Token storage: ${account.tokenStorage ?? "browser managed"}`, `Revision: ${account.revision}`, "Enter selects this account for capability permissions. c connects; d reviews disconnection."] })); break;
    case "Capabilities": rows = snapshot.capabilities.map((capability) => ({ id: `${capability.adapterId}/${capability.operationId}`, label: `${capability.adapterId} / ${capability.operationId} · ${capability.permission}`, detail: [`State: ${capability.state} · transport: ${capability.transport}`, `Effect: ${capability.effect} · risk: ${capability.risk}`, `Executor: ${capability.executorSource} · interface: ${capability.interfaceSource}`, `Account: ${snapshot.accountId ?? "No account (public scope)"}`, `Digest: ${capability.digest}`, "Enter reviews Ask, Allow or Deny. a selects an account; / filters operations.", "Availability describes installed support; it does not verify the current provider login."] })); break;
    case "Approvals": rows = snapshot.approvals.map((approval) => ({ id: approval.id, label: `${approval.title} · ${approval.kind}`, detail: [`Account: ${approval.account ?? "none"}`, `Effect: ${approval.effect}`, `Request: ${approval.preview}`, `Expires: ${approval.expiresAt}`, `Digest: ${approval.digest}`, "Enter opens the exact request review. Approval is single use."] })); break;
    case "Activity": rows = (state.activity?.rows ?? []).map((row) => ({ id: row.id, label: `${row.outcome} · ${row.method} ${row.origin ?? "unavailable origin"}`, detail: [`Started: ${row.startedAt}`, `Endpoint: ${row.endpoint ?? "not recorded"}`, `Decision: ${row.decision} · status: ${row.httpStatus ?? "none"}`, `Response: ${row.responseBytes} bytes · duration: ${row.durationMs ?? "pending"} ms`, `Error: ${row.errorCode ?? "none"}`, "This is public gateway request metadata. Legacy provider dispatch history is separate.", "n older page · b newer page · r refresh. Failed or interrupted requests are never retried here."] })); break;
    case "Interfaces": rows = snapshot.interfaces.map((item) => ({ id: item.id, label: `${item.title} · ${item.state}`, detail: [`Source: ${item.source} · operations: ${item.operationCount}`, `Adapters: ${item.adapterIds.join(", ")}`, `Draft digest: ${item.digest}`, `Active digest: ${item.activeDigest ?? "none"}`, ...item.issues.slice(0, 8), "Enter reviews activation for one exact adapter. Import drafts with ghostget interface import <openapi.json>.", "Bundled operations are listed in Capabilities; this section contains imported and user drafts."] })); break;
  }
  const query = state.filter.toLocaleLowerCase();
  return rows.filter((row) => query === "" || tuiText(`${row.label} ${row.detail.join(" ")}`).toLocaleLowerCase().includes(query)).slice(0, 2_000);
}

export function selectTuiSection(state: TuiState, section: TuiSection): void {
  state.section = section; state.selected = 0; state.filter = ""; state.filtering = false; state.dialog = null;
}

export function applyTuiSnapshot(state: TuiState, snapshot: ControlSnapshot): void {
  const selectedId = tuiRows(state)[state.selected]?.id;
  state.snapshot = snapshot; state.fresh = true;
  const rows = tuiRows(state);
  const selected = rows.findIndex((row) => row.id === selectedId);
  state.selected = selected >= 0 ? selected : Math.max(0, Math.min(state.selected, rows.length - 1));
}

const HELP = [
  "Ghostget local controls",
  "Tab / Shift-Tab or Left / Right: change section. 1–6: jump to a section.",
  "Up / Down or j / k: choose a row. Enter: view available actions. i: read complete row details.",
  "/: filter this section. Enter keeps the filter; Esc clears it.",
  "a: account picker. r: refresh local state. ?: keyboard help.",
  "Accounts: c connects a browser account, d reviews disconnection.",
  "During sign-in: v verifies the account, s reviews saving it, x cancels.",
  "Capabilities: Enter chooses Ask, Allow or Deny. e reviews enabling managed permissions.",
  "Approvals: Enter chooses approve once or deny; review the full request before confirming.",
  "Interfaces: Enter chooses an adapter and reviews exact draft activation.",
  "Activity: n older page, b newer page. It records public gateway requests only.",
  "Reviews: Up / Down or PageUp / PageDown scroll; End shows the end. Type yes and press Enter after reading the whole review.",
  "Esc closes a dialog or exits the panel. q and Ctrl-C exit; no provider operation is retried.",
  "Pasted text is ignored to prevent shortcuts or confirmations from running accidentally.",
  "Use one local controller at a time: ghostget menubar stop before ghostget tui.",
];

function emptyMessage(state: TuiState): readonly string[] {
  if (state.filter !== "") return ["No matches. Press / to change the filter or Esc to clear it."];
  switch (state.section) {
    case "Accounts": return ["No accounts connected yet.", state.browserConnections ? "Press c to connect a browser account. Public page reads work without an account." : "Use ghostget auth --help to connect supported providers. Browser sign-in from this panel requires macOS."];
    case "Capabilities": return ["No installed capabilities to display.", "Run ghostget capabilities --json or connect an account to install its bundled interface."];
    case "Approvals": return ["No requests waiting for your approval.", "Keep this panel open while your agent uses Ghostget; requests appear here."];
    case "Activity": return ["No public gateway requests recorded on this page.", "Provider dispatch history is separate; this screen does not claim to list all Ghostget activity."];
    case "Interfaces": return ["No imported or user interfaces.", "Bundled operations appear in Capabilities. To add a draft: ghostget interface import <openapi.json>"];
    default: return ["Loading local state…"];
  }
}

/** A plain, bounded screen. The caller alone owns terminal control sequences. */
export function renderTui(state: TuiState, columns = 100, rows = 28): { readonly text: string; readonly reviewEndVisible: boolean; readonly reviewOffset: number } {
  const width = Math.max(1, Math.min(240, Math.floor(Number.isFinite(columns) ? columns : 80)) - 1);
  const height = Math.max(1, Math.min(80, Math.floor(Number.isFinite(rows) ? rows : 24)));
  const snapshot = state.snapshot;
  const header = `Ghostget${snapshot === null ? "" : ` ${snapshot.version}`} · Local controls`;
  if (width < 44 || height < 12) return { text: [fit(header, width), fit("Enlarge terminal to 45 × 12 or larger.", width), fit("q / Esc / Ctrl-C exits", width)].slice(0, height).join("\n"), reviewEndVisible: false, reviewOffset: 0 };
  const chrome = [header, `${snapshot?.accountId ?? "No account (public scope)"} · ${snapshot?.approvals.length ?? 0} pending · ${state.busy ? "Working…" : state.fresh ? "Connected" : "State unavailable — refresh before changes"}`, TUI_SECTIONS.map((section, index) => `${index + 1} ${section === state.section ? `[${section}]` : section}`).join("  ")];
  const bodyHeight = height - 6;
  let body: string[] = [];
  let reviewEndVisible = false;
  let reviewOffset = 0;
  if (snapshot === null && !state.busy && state.notice !== "Loading local controls…") {
    body = ["Local controls unavailable", ...wrap(state.notice, width), "", "Stop the menu bar: ghostget menubar stop", "Quit any other terminal controller, then restart ghostget tui.", "q or Ctrl-C exits this panel."];
  } else if (state.dialog?.kind === "confirm" || state.dialog?.kind === "help" || state.dialog?.kind === "detail") {
    const dialog = state.dialog;
    const content = (dialog.kind === "help" ? HELP : [dialog.title, ...dialog.detail]).flatMap((line) => wrap(line, width, dialog.kind === "confirm"));
    const contentHeight = Math.max(1, bodyHeight - 2);
    const offset = Math.min(dialog.scroll, Math.max(0, content.length - contentHeight));
    reviewOffset = offset;
    body = content.slice(offset, offset + contentHeight);
    reviewEndVisible = offset + contentHeight >= content.length;
    while (body.length < contentHeight) body.push("");
    body.push(`Review ${Math.min(offset + 1, content.length)}–${Math.min(offset + contentHeight, content.length)} of ${content.length} · ↑↓ PgUp/PgDn End`);
    body.push(dialog.kind !== "confirm" ? "Esc closes details" : `${reviewEndVisible || dialog.reviewed ? "Type yes then Enter to confirm" : "Read to the end before confirming"} · Esc cancels${dialog.value ? ` · ${dialog.value}` : ""}`);
  } else if (state.dialog?.kind === "choices") {
    const dialog = state.dialog;
    body = [dialog.title, "↑↓ chooses · Enter opens · Esc cancels"];
    const start = Math.max(0, dialog.selected - bodyHeight + 3);
    body.push(...dialog.choices.slice(start, start + bodyHeight - 2).map((choice, index) => `${start + index === dialog.selected ? ">" : " "} ${choice.label}`));
  } else if (state.dialog?.kind === "input") {
    body = [state.dialog.title, "Use a short local account name (letters, numbers, dots, dashes).", `Account name: ${state.dialog.value}`, "Enter reviews opening the browser · Esc cancels", "An existing name will be reviewed as reconnecting that exact account."];
  } else {
    const entries = tuiRows(state);
    const selected = entries[state.selected];
    body.push(`${state.section} · ${entries.length}${entries.length === 2_000 ? "+" : ""} items${state.filter || state.filtering ? ` · filter: ${state.filter}${state.filtering ? "_" : ""}` : ""}`);
    if (state.attempt !== null) body.push(`Sign-in: ${state.attempt.accountId} · ${state.attempt.subject === null ? "finish browser sign-in, then v verify" : `verified ${state.attempt.subject} · s save`} · x cancel`);
    const listHeight = Math.max(2, Math.min(8, Math.floor((bodyHeight - body.length) / 2)));
    const start = Math.max(0, state.selected - listHeight + 1);
    body.push(...entries.slice(start, start + listHeight).map((entry, index) => `${state.selected === start + index ? ">" : " "} ${entry.label}`));
    if (entries.length === 0) body.push(...emptyMessage(state).flatMap((line) => wrap(line, width)));
    if (selected !== undefined) { body.push("─".repeat(width)); body.push(...selected.detail.flatMap((line) => wrap(line, width))); }
  }
  const screen = [...chrome.map((line) => fit(line, width)), ...body.slice(0, bodyHeight).map((line) => fit(line, width, state.dialog?.kind === "confirm"))];
  while (screen.length < height - 3) screen.push("");
  screen.push(fit(state.notice, width), fit("Tab sections · ↑↓ select · Enter actions · i details · / filter · a account · r refresh · ? help", width), fit("q / Esc exit sections · Ctrl-C always exits · changes require review", width));
  return { text: screen.slice(0, height).join("\n"), reviewEndVisible, reviewOffset };
}

export function renderTuiSnapshot(state: TuiState): string {
  const snapshot = state.snapshot;
  if (snapshot === null) return `${tuiText(state.notice)}\n`;
  return [
    `Ghostget ${snapshot.version} · Local controls`,
    `Account: ${snapshot.accountId ?? "No account (public scope)"}`,
    `Accounts: ${snapshot.accounts.length} · capabilities: ${snapshot.capabilities.length} · approvals: ${snapshot.approvals.length} · interfaces: ${snapshot.interfaces.length}`,
    `Managed permissions: ${snapshot.policy.managed ? "on" : "off"}`,
    "", "First read: ghostget read https://example.com", "Interactive controls: ghostget tui", "1Password X-token import: ghostget vault --help", "",
    ...snapshot.accounts.slice(0, 20).map((account) => `Account ${account.id}: ${account.status} · ${account.provider ?? account.kind}`),
    ...snapshot.approvals.slice(0, 20).map((approval) => `Approval pending: ${approval.title}`),
  ].map((line) => tuiText(line)).join("\n") + "\n";
}
