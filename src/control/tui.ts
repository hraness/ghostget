import { spawnHelper, type HelperClient } from "./helper-client";
import { DEFAULT_BROWSER_CHOICES, browserChoices, type BrowserChoice } from "./browser-choices";
import type { ControlRequest, ControlResponse, PermissionDecision } from "./protocol";
import { applyTuiSnapshot, createTuiState, renderTui, renderTuiSnapshot, selectTuiSection, TUI_SECTIONS, tuiRows, tuiText, type TuiChoice, type TuiState } from "./tui-model";
import { processTerminal, TuiInput, withTuiTerminal, type TuiKey, type TuiTerminal } from "./tui-terminal";
import type { ControlEnvironment } from "./web-policy";

type Output = { readonly stdout: (text: string) => unknown; readonly stderr: (text: string) => unknown };
const USAGE = `Usage: ghostget tui [--account <id>] [--snapshot]

Open local controls for setup, accounts, capabilities, approvals, activity,
and imported interfaces. No model or Rust toolchain is needed.

  --snapshot      Print a plain status summary and exit (works without a TTY)
  --account <id>  Select an existing account for permission review
  --help          Show this help without starting a helper

Tab changes sections; arrows choose rows; Enter opens actions; ? shows help.
q, Esc or Ctrl-C exits. Every change requires an exact review and confirmation.
Pasted text is ignored. Keep this panel open for your agent's approval requests.

Only one local controller can run at a time. If the menu bar is running:
  ghostget menubar stop
  ghostget tui

First page read (no account needed): ghostget read https://example.com
Optional 1Password X-token import: ghostget vault --help
`;

function failure(response: Extract<ControlResponse, { readonly ok: false }>): string {
  return `${tuiText(response.code, 64)}: ${tuiText(response.message, 640)}`;
}

// Snapshots re-verify the plugin store and every account revision; the menu
// controller uses the same bound for all of its requests.
const SNAPSHOT_REQUEST_TIMEOUT_MS = 90_000;
const VERIFY_REQUEST_TIMEOUT_MS = 70_000;
const REQUEST_TIMEOUT_MS = 15_000;
// A full snapshot is real verification work; the cheap in-memory approval list
// keeps human review latency low between refreshes.
const SNAPSHOT_INTERVAL_MS = 30_000;
const APPROVAL_INTERVAL_MS = 3_000;

/** The controller only sends closed protocol requests. Reviews retain the exact
 * account, capability digest and revision; neither refresh nor failures retry a
 * mutation. The helper remains the authority for all admission decisions. */
export class TuiController {
  readonly state: TuiState = createTuiState();
  accountId: string | null;
  closed = false;
  constructor(private readonly helper: HelperClient, accountId: string | null = null, private readonly changed: () => void = () => {}, platform: NodeJS.Platform = process.platform, private readonly browsers: readonly BrowserChoice[] = DEFAULT_BROWSER_CHOICES) { this.accountId = accountId; this.state.browserConnections = platform === "darwin"; }

  private choices(title: string, choices: readonly TuiChoice[]): void {
    this.state.dialog = { kind: "choices", title, choices: choices.slice(0, 2_000), selected: 0 };
  }
  private review(title: string, detail: readonly string[], request: ControlRequest): void {
    if (!this.state.fresh) { this.state.notice = "Refresh local state before changing it."; return; }
    if (detail.length > 32 || detail.some((line) => line.length > 524_288) || detail.reduce((sum, line) => sum + line.length, 0) > 1_048_576) { this.state.notice = "This request is too large to review safely in the terminal. No action was taken."; return; }
    this.state.dialog = { kind: "confirm", title, detail, request, value: "", scroll: 0, reviewed: false };
  }
  private async request(request: ControlRequest): Promise<ControlResponse> {
    try { return await this.helper.request(request, request.action === "connection.verify" ? VERIFY_REQUEST_TIMEOUT_MS : request.action === "snapshot" ? SNAPSHOT_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS); }
    catch { return { ok: false, code: "CONTROL_DISCONNECTED", message: "The local helper is unavailable. Stop the menu bar or quit the other controller, then restart ghostget tui." }; }
  }
  /** Background refreshes set refreshing instead of busy so navigation stays
   * live; mutations still wait for a settled foreground state. */
  async refresh(background = false): Promise<void> {
    if (this.closed || this.state.busy || this.state.refreshing) return;
    if (background) this.state.refreshing = true; else { this.state.busy = true; this.changed(); }
    try {
      const response = await this.request({ action: "snapshot", accountId: this.accountId });
      if (this.closed) return;
      if (!response.ok) { this.state.fresh = false; this.state.dialog = null; this.state.notice = failure(response); return; }
      if (response.data.kind !== "snapshot") { this.state.fresh = false; this.state.notice = "Unexpected control response. Restart the panel."; return; }
      // A late or replayed response must never undo newer owner state.
      if (this.state.snapshot !== null && response.data.snapshot.policy.revision < this.state.snapshot.policy.revision) return;
      applyTuiSnapshot(this.state, response.data.snapshot);
      this.accountId = response.data.snapshot.accountId;
      if (this.state.notice === "Loading local controls…") this.state.notice = "Start with a public page; connect an account when you need it.";
      if (this.state.section === "Activity") await this.loadActivity();
    } finally { this.state.busy = false; this.state.refreshing = false; this.changed(); }
  }
  /** Approval requests live in the helper's memory; polling them does not pay
   * the snapshot's verification cost and never marks stale state fresh. */
  private approvalsPolling = false;
  async refreshApprovals(): Promise<void> {
    if (this.closed || this.state.busy || this.state.refreshing || this.approvalsPolling || this.state.snapshot === null) return;
    this.approvalsPolling = true;
    try {
      const response = await this.request({ action: "approval.list" });
      if (this.closed || !response.ok || response.data.kind !== "approvals") return;
      const current = this.state.snapshot;
      if (current === null) return;
      const approvals = response.data.approvals;
      if (current.approvals.length === approvals.length && current.approvals.every((approval, index) => approval.id === approvals[index]!.id && approval.digest === approvals[index]!.digest)) return;
      const selectedId = tuiRows(this.state)[this.state.selected]?.id;
      this.state.snapshot = { ...current, approvals };
      const rows = tuiRows(this.state);
      const selected = rows.findIndex((row) => row.id === selectedId);
      this.state.selected = selected >= 0 ? selected : Math.max(0, Math.min(this.state.selected, rows.length - 1));
      this.changed();
    } finally { this.approvalsPolling = false; }
  }
  private async loadActivity(): Promise<void> {
    const response = await this.request({ action: "activity.query", query: { search: "", method: "all", outcome: "all", origin: null, since: null, order: "newest", cursor: this.state.activityCursor, limit: 50 } });
    if (this.closed) return;
    if (response.ok && response.data.kind === "activity") {
      this.state.activity = response.data.page;
      this.state.selected = Math.min(this.state.selected, Math.max(0, tuiRows(this.state).length - 1));
    } else {
      this.state.activity = null;
      this.state.notice = response.ok ? "Unexpected activity response." : failure(response);
    }
  }
  private async mutate(request: ControlRequest): Promise<void> {
    if (this.closed || !this.state.fresh || this.state.busy) return;
    if (this.state.refreshing) { this.state.notice = "A state refresh is in progress — review and confirm again when it finishes."; this.changed(); return; }
    this.state.busy = true; this.state.dialog = null; this.state.notice = "Applying the reviewed action…"; this.changed();
    try {
      const response = await this.request(request);
      if (this.closed) return;
      if (!response.ok) {
        this.state.fresh = false;
        this.state.notice = `${failure(response)} No action was retried. Refresh to inspect current state.`;
        if (request.action === "connection.verify") this.state.attempt = null;
        return;
      }
      if (response.data.kind === "connection") {
        if (request.action === "connection.begin") this.state.attempt = { attemptId: response.data.attemptId, accountId: request.id, provider: request.provider, browser: `${request.browser}${request.profile ? ` / ${request.profile}` : ""}`, subject: response.data.subject };
        else if (request.action === "connection.verify" && this.state.attempt?.attemptId === response.data.attemptId) this.state.attempt = { ...this.state.attempt, subject: response.data.subject };
        this.state.notice = response.data.status === "verified" ? "Account verified. Press s to review and save this identity." : "Finish sign-in in the opened browser, return here, then press v to verify.";
      } else {
        this.state.notice = response.data.kind === "success" ? tuiText(response.data.message) : "Action completed. Refresh to inspect current state.";
        if (request.action === "connection.commit") { this.accountId = this.state.attempt?.accountId ?? this.accountId; this.state.attempt = null; }
        if (request.action === "connection.cancel") this.state.attempt = null;
        if (request.action === "connection.disconnect" && request.id === this.accountId) this.accountId = null;
      }
      // Read current state after a successful mutation, never retry the write.
      const current = await this.request({ action: "snapshot", accountId: this.accountId });
      if (this.closed) return;
      if (current.ok && current.data.kind === "snapshot") applyTuiSnapshot(this.state, current.data.snapshot);
      else { this.state.fresh = false; this.state.notice += " State refresh failed; press r before further changes."; }
    } finally { this.state.busy = false; this.changed(); }
  }

  private pickAccount(): void {
    this.choices("Select permission scope", [{ label: "No account (public scope)", action: "account:public" }, ...(this.state.snapshot?.accounts ?? []).map((account, index) => ({ label: `${account.id} · ${account.provider ?? account.kind}`, action: `account:${index}` }))]);
  }
  private connect(): void {
    if (!this.state.browserConnections) { this.state.notice = "Browser connection from this panel requires macOS. Use ghostget auth --help for provider CLI setup; existing accounts work here."; return; }
    if (this.state.attempt !== null) { this.state.notice = "Finish or cancel the current sign-in first (v verify · s save · x cancel)."; return; }
    this.choices("Connect an account · choose a provider", (this.state.snapshot?.connectionProviders ?? []).map((provider, index) => ({ label: provider.title, action: `provider:${index}` })));
  }
  private enablePermissions(): void {
    const snapshot = this.state.snapshot;
    if (snapshot === null) return;
    if (snapshot.policy.managed) { this.state.notice = "Managed permissions are already enabled. Choose a capability to change its rule."; return; }
    this.review("Enable managed operation permissions?", ["This changes admission for provider operations in this Ghostget state directory.", "All operations start denied until you explicitly choose Allow or Ask for each account and operation. Existing agent workflows may stop until you set those rules.", "Review each account's capability rules after enabling. This does not grant any operation access.", `Policy revision: ${snapshot.policy.revision}`], { action: "permission.enable", expectedRevision: snapshot.policy.revision });
  }
  private selectedAction(): void {
    const snapshot = this.state.snapshot;
    const selected = tuiRows(this.state)[this.state.selected];
    if (snapshot === null || selected === undefined) return;
    switch (this.state.section) {
      case "Setup":
        if (selected.id === "connect") this.connect();
        else if (selected.id === "permissions") selectTuiSection(this.state, "Capabilities");
        else this.state.dialog = { kind: "detail", title: selected.label, detail: selected.detail, scroll: 0 };
        break;
      case "Accounts": this.accountId = selected.id; this.state.notice = `Selected ${tuiText(selected.id)}. Open Capabilities to review access.`; break;
      case "Capabilities": {
        const capability = snapshot.capabilities.find((item) => `${item.adapterId}/${item.operationId}` === selected.id);
        if (capability === undefined) return;
        if (!snapshot.policy.managed) { this.enablePermissions(); return; }
        if (capability.permission === "unavailable" || capability.state !== "available") { this.state.notice = "This operation cannot be permitted in its current state. Inspect its installed support and account setup."; return; }
        this.choices(`Permission for ${capability.adapterId} / ${capability.operationId}`, [{ label: "Ask · require an exact one-use approval", action: `permission:ask:${selected.id}` }, { label: "Allow · permit within the existing operation contract", action: `permission:allow:${selected.id}` }, { label: "Deny · block this operation", action: `permission:deny:${selected.id}` }]);
        break;
      }
      case "Approvals": this.choices("Review this exact request", [{ label: "Approve once", action: `approval:allow-once:${selected.id}` }, { label: "Deny request", action: `approval:deny:${selected.id}` }]); break;
      case "Interfaces": {
        const item = snapshot.interfaces.find((entry) => entry.id === selected.id);
        if (item === undefined) return;
        if (item.issues.length > 0 || item.state === "needs-executor" || item.activationTargets.length === 0) { this.state.notice = "This draft is not ready for activation. Inspect its issues and installed executor."; return; }
        this.choices("Activate a draft for one adapter", item.activationTargets.map((target, index) => ({ label: `${target.adapterId} · ${target.installedDigest === null ? "new installation" : "replace exact installed revision"}`, action: `interface:${item.id}:${index}` })));
        break;
      }
      case "Activity": this.state.dialog = { kind: "detail", title: selected.label, detail: selected.detail, scroll: 0 }; break;
    }
  }
  private async choose(action: string): Promise<void> {
    const snapshot = this.state.snapshot;
    if (snapshot === null) return;
    this.state.dialog = null;
    const parts = action.split(":");
    switch (parts[0]) {
      case "account": this.accountId = parts[1] === "public" ? null : snapshot.accounts[Number(parts[1])]?.id ?? this.accountId; await this.refresh(); break;
      case "provider": {
        const provider = snapshot.connectionProviders[Number(parts[1])];
        if (provider !== undefined) this.choices(`Connect ${provider.title} · choose browser`, this.browsers.map((browser, index) => ({ label: browser.label, action: `browser:${parts[1]}:${index}` })));
        break;
      }
      case "browser": {
        const provider = snapshot.connectionProviders[Number(parts[1])]; const browser = this.browsers[Number(parts[2])];
        if (provider !== undefined && browser !== undefined) this.state.dialog = { kind: "input", title: `Connect ${provider.title} · ${browser.label}`, value: `${provider.id.replace(/-web$/u, "")}-main`, provider: provider.id, browser: browser.browser, profile: browser.profile };
        break;
      }
      case "permission": {
        const decision = parts[1] as PermissionDecision;
        const capability = snapshot.capabilities.find((item) => `${item.adapterId}/${item.operationId}` === parts[2]);
        if (capability === undefined || !["ask", "allow", "deny"].includes(decision)) return;
        this.review(`Set permission to ${decision}?`, [`Operation: ${capability.adapterId} / ${capability.operationId}`, `Account: ${snapshot.accountId ?? "No account (public scope)"}`, `Effect: ${capability.effect} · risk: ${capability.risk}`, `Current: ${capability.permission} → ${decision}`, "Allow preserves the operation's existing preview and write confirmation requirements.", `Policy revision: ${snapshot.policy.revision}`, `Capability digest: ${capability.digest}`], { action: "permission.set", adapterId: capability.adapterId, operationId: capability.operationId, accountId: snapshot.accountId, decision, expectedRevision: snapshot.policy.revision, expectedCapabilityDigest: capability.digest });
        break;
      }
      case "approval": {
        const approval = snapshot.approvals.find((item) => item.id === parts[2]); const decision = parts[1];
        if (approval === undefined || decision !== "allow-once" && decision !== "deny") return;
        this.review(decision === "allow-once" ? "Approve this exact request once?" : "Deny this exact request?", [approval.title, `Kind: ${approval.kind} · account: ${approval.account ?? "none"}`, `Effect: ${approval.effect}`, `Request preview: ${approval.preview}`, `Expires: ${approval.expiresAt}`, `Request ID: ${approval.id}`, `Digest: ${approval.digest}`, "Changed or expired requests cannot use this approval."], { action: "approval.decide", id: approval.id, digest: approval.digest, decision });
        break;
      }
      case "interface": {
        const item = snapshot.interfaces.find((entry) => entry.id === parts[1]); const target = item?.activationTargets[Number(parts[2])];
        if (item === undefined || target === undefined) return;
        this.review("Activate this exact interface draft?", [`Interface: ${item.title} (${item.id})`, `Adapter: ${target.adapterId}`, `Operations: ${item.operationCount} · source: ${item.source}`, `Draft digest: ${item.digest}`, `Expected installed digest: ${target.installedDigest ?? "none (new installation)"}`, "This publishes the reviewed draft for that adapter. Inspect capability permissions afterward. A draft cannot create an arbitrary HTTP executor."], { action: "interface.activate", id: item.id, digest: item.digest, adapterId: target.adapterId, expectedInstalledDigest: target.installedDigest });
        break;
      }
    }
  }
  async key(key: TuiKey): Promise<boolean> {
    const text = typeof key === "object" ? key.text : null;
    if (key === "interrupt") return false;
    if (this.state.busy) return !(key === "escape" || text === "q");
    const dialog = this.state.dialog;
    if (dialog !== null) {
      if (key === "escape") { this.state.dialog = null; return true; }
      if (dialog.kind === "help" || dialog.kind === "confirm" || dialog.kind === "detail") {
        if (key === "up" || key === "pageup") dialog.scroll = Math.max(0, dialog.scroll - (key === "up" ? 1 : 10));
        if (key === "down" || key === "pagedown") dialog.scroll = Math.min(1_048_576, dialog.scroll + (key === "down" ? 1 : 10));
        if (key === "end") dialog.scroll = 1_048_576;
        if (key === "home") dialog.scroll = 0;
        if (dialog.kind === "confirm") {
          if (key === "backspace") dialog.value = dialog.value.slice(0, -1);
          if (text !== null && /^[yes]$/u.test(text) && dialog.value.length < 3) dialog.value += text;
          if (key === "enter") {
            if (dialog.value === "yes" && dialog.reviewed) await this.mutate(dialog.request);
            else this.state.notice = "Read the full review, then type yes and press Enter. Esc cancels.";
          }
        }
      } else if (dialog.kind === "choices") {
        if (key === "up" || text === "k") dialog.selected = Math.max(0, dialog.selected - 1);
        if (key === "down" || text === "j") dialog.selected = Math.min(dialog.choices.length - 1, dialog.selected + 1);
        if (key === "enter") { const choice = dialog.choices[dialog.selected]; if (choice !== undefined) await this.choose(choice.action); }
      } else {
        if (key === "backspace") dialog.value = dialog.value.slice(0, -1);
        if (text !== null && /^[a-zA-Z0-9._-]$/u.test(text) && dialog.value.length < 64) dialog.value += text;
        if (key === "enter") {
          if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u.test(dialog.value)) this.state.notice = "Enter a valid local account name.";
          else {
            const existing = this.state.snapshot?.accounts.find((account) => account.id === dialog.value);
            this.review(existing === undefined ? "Open browser sign-in?" : "Reconnect this existing account?", [`Account name: ${dialog.value}`, `Provider: ${dialog.provider}`, `Browser: ${dialog.browser} · profile: ${dialog.profile ?? "default"}`, `Existing account revision: ${existing?.revision ?? "none"}`, "Ghostget opens sign-in in this browser. It will verify the signed-in identity before you review and save the account. Passwords stay in your browser."], { action: "connection.begin", id: dialog.value, provider: dialog.provider, browser: dialog.browser, profile: dialog.profile, expectedRevision: existing?.revision ?? null });
          }
        }
      }
      return true;
    }
    if (this.state.filtering) {
      if (key === "escape") { this.state.filter = ""; this.state.filtering = false; }
      else if (key === "enter") this.state.filtering = false;
      else if (key === "backspace") this.state.filter = [...this.state.filter].slice(0, -1).join("");
      else if (text !== null && [...this.state.filter].length < 80) this.state.filter += text;
      this.state.selected = 0;
      return true;
    }
    if (key === "escape" && this.state.filter !== "") { this.state.filter = ""; this.state.selected = 0; return true; }
    if (key === "escape" || text === "q") return false;
    if (text === "?") { this.state.dialog = { kind: "help", scroll: 0 }; return true; }
    if (text === "/") { this.state.filtering = true; return true; }
    if (text === "r") { await this.refresh(); return true; }
    if (text === "a") { this.pickAccount(); return true; }
    if (key === "tab" || key === "backtab" || key === "left" || key === "right" || text !== null && /^[1-6]$/u.test(text)) {
      const offset = key === "backtab" || key === "left" ? -1 : 1;
      const index = text !== null ? Number(text) - 1 : (TUI_SECTIONS.indexOf(this.state.section) + offset + TUI_SECTIONS.length) % TUI_SECTIONS.length;
      selectTuiSection(this.state, TUI_SECTIONS[index]!);
      if (this.state.section === "Activity") await this.refresh();
      return true;
    }
    const rows = tuiRows(this.state);
    if (text === "i") { const row = rows[this.state.selected]; if (row !== undefined) this.state.dialog = { kind: "detail", title: row.label, detail: row.detail, scroll: 0 }; return true; }
    if (key === "up" || text === "k") this.state.selected = Math.max(0, this.state.selected - 1);
    if (key === "down" || text === "j") this.state.selected = Math.min(Math.max(0, rows.length - 1), this.state.selected + 1);
    if (key === "pageup") this.state.selected = Math.max(0, this.state.selected - 8);
    if (key === "pagedown") this.state.selected = Math.min(Math.max(0, rows.length - 1), this.state.selected + 8);
    if (key === "home") this.state.selected = 0;
    if (key === "end") this.state.selected = Math.max(0, rows.length - 1);
    if (key === "enter") { this.selectedAction(); if (this.state.section === "Accounts") await this.refresh(); }
    if (text === "c" && this.state.section === "Accounts") this.connect();
    if (text === "e" && this.state.section === "Capabilities") this.enablePermissions();
    if (text === "d" && this.state.section === "Accounts") {
      const account = this.state.snapshot?.accounts.find((item) => item.id === rows[this.state.selected]?.id);
      if (account !== undefined) this.review("Disconnect this account from Ghostget?", [`Account: ${account.id}`, `Provider: ${account.provider ?? account.kind}`, `Subject: ${account.subject ?? "unknown"}`, `Revision: ${account.revision}`, "This removes the local Ghostget account connection. It does not sign you out of the provider's browser session."], { action: "connection.disconnect", id: account.id, expectedRevision: account.revision });
    }
    const attempt = this.state.attempt;
    if (attempt !== null) {
      if (text === "v") this.review("Verify the signed-in browser account?", [`Account: ${attempt.accountId}`, `Provider: ${attempt.provider} · browser: ${attempt.browser}`, "Ghostget will read the signed-in identity from this browser. Complete sign-in there before continuing."], { action: "connection.verify", attemptId: attempt.attemptId });
      if (text === "x") this.review("Cancel this sign-in attempt?", [`Account: ${attempt.accountId}`, "This discards the pending Ghostget connection. It does not close or sign out the browser."], { action: "connection.cancel", attemptId: attempt.attemptId });
      if (text === "s" && attempt.subject !== null) this.review("Save this verified account?", [`Account: ${attempt.accountId}`, `Provider: ${attempt.provider} · browser: ${attempt.browser}`, `Verified subject: ${attempt.subject}`, "Save only if this is the identity you intended to connect."], { action: "connection.commit", attemptId: attempt.attemptId, expectedSubject: attempt.subject });
    }
    if (this.state.section === "Activity") {
      if (text === "n" && this.state.activity?.nextCursor != null) { this.state.activityPrevious.push(this.state.activityCursor); this.state.activityPrevious = this.state.activityPrevious.slice(-100); this.state.activityCursor = this.state.activity.nextCursor; this.state.selected = 0; await this.refresh(); }
      if (text === "b" && this.state.activityPrevious.length > 0) { this.state.activityCursor = this.state.activityPrevious.pop() ?? null; this.state.selected = 0; await this.refresh(); }
    }
    return true;
  }
}

export async function runInteractiveTui(helper: HelperClient, terminal: TuiTerminal, accountId: string | null = null, browsers: readonly BrowserChoice[] = DEFAULT_BROWSER_CHOICES): Promise<void> {
  let stopped = false;
  let finish = (): void => {};
  let drawFailed = false;
  let queue: Promise<void> = Promise.resolve();
  let queuedKeys = 0;
  let previousScreen = "";
  const decoder = new TuiInput();
  const draw = (): void => {
    if (stopped) return;
    try {
      const size = terminal.size(); const screen = renderTui(controller.state, size.columns, size.rows);
      if (controller.state.dialog?.kind === "confirm" && screen.reviewEndVisible) controller.state.dialog.reviewed = true;
      if (controller.state.dialog?.kind === "confirm" || controller.state.dialog?.kind === "help" || controller.state.dialog?.kind === "detail") controller.state.dialog.scroll = screen.reviewOffset;
      if (screen.text === previousScreen) return;
      previousScreen = screen.text;
      terminal.write(`\x1b[H\x1b[2J${screen.text.replace(/\n/gu, "\r\n")}`);
    } catch { drawFailed = true; finish(); }
  };
  const controller = new TuiController(helper, accountId, draw, process.platform, browsers);
  await withTuiTerminal(terminal, async () => {
    const disposers: (() => void)[] = [];
    let escapeTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setInterval> | undefined;
    let approvalTimer: ReturnType<typeof setInterval> | undefined;
    try {
      await new Promise<void>((resolve) => {
        finish = () => { if (stopped) return; stopped = true; controller.closed = true; resolve(); };
        const keys = (received: readonly TuiKey[]): void => {
          for (const key of received) {
            if (key === "interrupt" || (key === "escape" || typeof key === "object" && key.text === "q") && (controller.state.busy || controller.state.dialog === null && !controller.state.filtering && controller.state.filter === "")) { finish(); return; }
            const size = terminal.size();
            if (size.columns < 45 || size.rows < 12 || controller.state.busy || queuedKeys >= 32) continue;
            queuedKeys += 1;
            queue = queue.then(async () => {
              if (stopped) return;
              if (!await controller.key(key)) finish(); else draw();
            }).catch(() => { controller.state.fresh = false; controller.state.notice = "Controls became unavailable. Quit and restart the panel; no action was retried."; controller.state.dialog = null; draw(); }).finally(() => { queuedKeys -= 1; });
          }
        };
        disposers.push(terminal.onData((chunk) => {
          if (escapeTimer !== undefined) clearTimeout(escapeTimer);
          keys(decoder.feed(chunk));
          escapeTimer = setTimeout(() => keys(decoder.flushEscape()), 40);
        }), terminal.onResize(draw), terminal.onSignal(finish));
        draw();
        void controller.refresh().catch(() => finish());
        refreshTimer = setInterval(() => { if (controller.state.dialog === null && !controller.state.filtering) void controller.refresh(true).catch(() => finish()); }, SNAPSHOT_INTERVAL_MS);
        approvalTimer = setInterval(() => { void controller.refreshApprovals().catch(() => {}); }, APPROVAL_INTERVAL_MS);
      });
    } finally {
      stopped = true; controller.closed = true;
      if (escapeTimer !== undefined) clearTimeout(escapeTimer);
      if (refreshTimer !== undefined) clearInterval(refreshTimer);
      if (approvalTimer !== undefined) clearInterval(approvalTimer);
      for (const dispose of disposers.reverse()) dispose();
    }
  });
  if (drawFailed) throw new Error("terminal unavailable");
}

export async function runTuiCommand(args: readonly string[], environment: ControlEnvironment, output: Output, dependencies: { readonly helper?: (environment: ControlEnvironment) => HelperClient; readonly terminal?: TuiTerminal } = {}): Promise<number> {
  if (args.length === 2 && (args[1] === "--help" || args[1] === "-h")) { output.stdout(USAGE); return 0; }
  let snapshot = false; let accountId: string | null = null;
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] === "--snapshot" && !snapshot) snapshot = true;
    else if (args[index] === "--account" && accountId === null && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(args[index + 1] ?? "")) accountId = args[++index]!;
    else { output.stderr("Invalid TUI arguments. Use ghostget tui --help.\n"); return 1; }
  }
  const terminal = dependencies.terminal ?? processTerminal(output.stdout);
  if (!snapshot && !terminal.isTerminal) { output.stderr("ghostget tui needs an interactive terminal. Use ghostget tui --snapshot for a plain summary.\n"); return 1; }
  let helper: HelperClient | undefined;
  try {
    helper = (dependencies.helper ?? spawnHelper)(environment);
    if (snapshot) {
      const controller = new TuiController(helper, accountId, () => {}, process.platform, browserChoices(environment));
      await controller.refresh();
      if (!controller.state.fresh) { output.stderr(`${tuiText(controller.state.notice)}\n`); return 1; }
      output.stdout(renderTuiSnapshot(controller.state));
    } else await runInteractiveTui(helper, terminal, accountId, browserChoices(environment));
    return 0;
  } catch {
    output.stderr("Ghostget's terminal controls could not start or stopped unexpectedly. Stop the menu bar with ghostget menubar stop, quit any other controller, then try ghostget tui again.\n");
    return 1;
  } finally { await helper?.close(); }
}
