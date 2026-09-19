import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync, type BigIntStats } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleCompanionCommand, openBrowser, type CompanionOptions, type MenuItem } from "@hraness/desktop-foundation";
import { createSupportOffer } from "@hraness/support-foundation";
import { ghostgetSupportProfile } from "../support-profile";
import { TRAY_ICON } from "./menubar-icon";
import { ghostgetStateHome } from "../storage";
import { type ActivityRow, type ApprovalView, type CapabilityView, type ControlRequest, type ControlResponse, type ControlSnapshot } from "./protocol";
import { spawnHelper, type HelperClient } from "./helper-client";
import type { ControlEnvironment } from "./web-policy";

const WEBSITE = "https://ghostget.com/getting-started";
const CONNECTION_GUIDES: Readonly<Record<string, { readonly title: string; readonly url: string }>> = {
  "x-web": { title: "X", url: "https://ghostget.com/provider-capabilities/#provider-x" },
  "linkedin-web": { title: "LinkedIn", url: "https://ghostget.com/provider-capabilities/#provider-linkedin" },
  "reddit-web": { title: "Reddit", url: "https://ghostget.com/provider-capabilities/#provider-reddit" },
};
const connectionGuide = (id: string) => Object.hasOwn(CONNECTION_GUIDES, id) ? CONNECTION_GUIDES[id] : undefined;
const SUPPORT_ACTIONS = createSupportOffer(ghostgetSupportProfile, "desktop").actions;
const OUTPUTS_LIMIT = 12;
const OUTPUTS_SCAN_BOUND = 512;
const OPENABLE_EXTENSIONS = new Set(["pdf", "txt", "md", "csv", "json", "png", "jpg", "jpeg", "gif", "webp", "tiff"]);
const BROWSERS = [
  { key: "safari", label: "Safari", browser: "safari", profile: null },
  { key: "chrome-default", label: "Chrome · Default", browser: "chrome", profile: "Default" },
  { key: "chrome-profile-1", label: "Chrome · Profile 1", browser: "chrome", profile: "Profile 1" },
  { key: "chrome-profile-2", label: "Chrome · Profile 2", browser: "chrome", profile: "Profile 2" },
] as const;
type Output = { readonly stdout: (text: string) => unknown; readonly stderr: (text: string) => unknown };

/** Presentation never lets control data add lines, bidi overrides or unbounded menus. */
export function menuLabel(text: string, limit = 72): string {
  const clean = [...text]
    .map((character) => (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(character) ? " " : character))
    .join("").split(/\s+/u).filter((part) => part.length > 0).join(" ");
  const scalars = [...clean];
  return scalars.length > limit ? `${scalars.slice(0, Math.max(0, limit - 1)).join("")}…` : clean;
}

function detailItems(detail: string): MenuItem[] {
  const words = menuLabel(detail, 216).split(" ");
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if ([...next].length <= 72) current = next;
    else { if (current !== "") rows.push(current); current = word; }
  }
  if (current !== "") rows.push(current);
  const bounded = rows.slice(0, 3);
  return bounded.length > 0 ? bounded.map((line) => ({ kind: "label" as const, label: menuLabel(line, 72) })) : [{ kind: "label" as const, label: "No additional detail." }];
}

/** One output file that passed ownership, type and permission checks. The
 * identity fields revalidate the same file at dispatch time. */
export interface OutputEntry {
  readonly name: string;
  readonly size: number;
  readonly modifiedMs: number;
  readonly identity: { readonly dev: bigint; readonly ino: bigint; readonly size: bigint; readonly mtimeNs: bigint; readonly mode: bigint };
}
export interface OutputsView {
  readonly directory: { readonly dev: bigint; readonly ino: bigint } | null;
  readonly entries: readonly OutputEntry[];
  readonly message: string | null;
  readonly truncated: boolean;
}
const EMPTY_OUTPUTS: OutputsView = { directory: null, entries: [], message: null, truncated: false };
const UNAVAILABLE_OUTPUTS: OutputsView = { directory: null, entries: [], message: "Outputs unavailable", truncated: false };

/** Bounded newest-first listing of the product outputs directory. Reads never
 * create the directory and never follow symlinks; entries must be regular
 * files owned by the current user without group or other write bits. */
export function readOutputs(directory: string): OutputsView {
  const uid = process.getuid?.();
  const dirInfo = (() => { try { return lstatSync(directory, { bigint: true }); } catch { return null; } })();
  if (dirInfo === null || uid === undefined || !dirInfo.isDirectory() || dirInfo.isSymbolicLink() || dirInfo.uid !== BigInt(uid) || (dirInfo.mode & 0o777n) !== 0o700n) return UNAVAILABLE_OUTPUTS;
  const entry = (name: string): OutputEntry | null => {
    if (name.startsWith(".") || name.includes("/") || name.includes("\u0000")) return null;
    let info: BigIntStats;
    try { info = lstatSync(join(directory, name), { bigint: true }); } catch { return null; }
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== BigInt(uid) || (info.mode & 0o022n) !== 0n) return null;
    return { name, size: Number(info.size), modifiedMs: Number(info.mtimeMs), identity: { dev: info.dev, ino: info.ino, size: info.size, mtimeNs: info.mtimeNs, mode: info.mode } };
  };
  let names: readonly string[];
  try { names = readdirSync(directory).slice(0, OUTPUTS_SCAN_BOUND); } catch { return UNAVAILABLE_OUTPUTS; }
  const entries = names.flatMap((name) => { const found = entry(name); return found === null ? [] : [found]; });
  const truncated = names.length === OUTPUTS_SCAN_BOUND || entries.length > OUTPUTS_LIMIT;
  entries.sort((a, b) => b.identity.mtimeNs === a.identity.mtimeNs ? a.name.localeCompare(b.name) : b.identity.mtimeNs > a.identity.mtimeNs ? 1 : -1);
  return { directory: { dev: dirInfo.dev, ino: dirInfo.ino }, entries: entries.slice(0, OUTPUTS_LIMIT), message: entries.length === 0 ? "No output files" : null, truncated };
}

/** Wire action ids carry only entry indices; file names never enter the wire
 * contract, and dispatch revalidates identity against the stored listing. */

/** Revalidate directory and entry identity at dispatch. An OS open remains a
 * handoff; this refuses stale or swapped targets. */
function validatedOutputPath(directory: string, expected: OutputsView, name: string): string | null {
  const uid = process.getuid?.();
  if (expected.directory === null || uid === undefined) return null;
  const dirInfo = (() => { try { return lstatSync(directory, { bigint: true }); } catch { return null; } })();
  if (dirInfo === null || !dirInfo.isDirectory() || dirInfo.isSymbolicLink() || dirInfo.dev !== expected.directory.dev || dirInfo.ino !== expected.directory.ino) return null;
  const expectedEntry = expected.entries.find((item) => item.name === name);
  if (expectedEntry === undefined) return null;
  const fresh = (() => { try { return lstatSync(join(directory, name), { bigint: true }); } catch { return null; } })();
  if (fresh === null || !fresh.isFile() || fresh.isSymbolicLink() || fresh.uid !== BigInt(uid) || (fresh.mode & 0o022n) !== 0n
    || fresh.dev !== expectedEntry.identity.dev || fresh.ino !== expectedEntry.identity.ino
    || fresh.size !== expectedEntry.identity.size || fresh.mtimeNs !== expectedEntry.identity.mtimeNs || fresh.mode !== expectedEntry.identity.mode) return null;
  return join(directory, name);
}

function outputSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function outputItems(outputs: OutputsView): MenuItem[] {
  const items: MenuItem[] = [];
  if (outputs.message !== null) items.push({ kind: "label", label: menuLabel(outputs.message) });
  outputs.entries.forEach((entry, index) => {
    const detail: MenuItem[] = [{ kind: "label", label: menuLabel(`${outputSize(entry.size)} · ${new Date(entry.modifiedMs).toLocaleString()}`) }];
    const extension = entry.name.includes(".") ? entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase() : "";
    if (OPENABLE_EXTENSIONS.has(extension)) detail.push({ kind: "action", id: `output:open:${index}`, label: "Open file" });
    detail.push({ kind: "action", id: `output:reveal:${index}`, label: "Reveal in file manager" });
    detail.push({ kind: "action", id: `output:copy:${index}`, label: "Copy file path" });
    items.push({ kind: "submenu", label: menuLabel(entry.name), items: detail });
  });
  if (outputs.truncated) items.push({ kind: "label", label: `Showing up to ${OUTPUTS_LIMIT} files from a bounded scan` });
  if (outputs.directory !== null && outputs.entries.length > 0) items.push({ kind: "action", id: "output:folder", label: "Reveal outputs folder" });
  if (items.length === 0) items.push({ kind: "label", label: "No output files" });
  return items;
}

const CLI_COMMANDS = ["ghostget --help", "ghostget menubar --help", "ghostget menubar status", "ghostget vault import-x --help"] as const;
function cliHelpItems(): MenuItem[] {
  return [
    { kind: "action", id: "clip:0", label: "CLI help" },
    { kind: "action", id: "clip:1", label: "Menu-bar help" },
    { kind: "action", id: "clip:2", label: "Menu-bar installation status" },
  ];
}

/** OS open/reveal handoff for one validated path. Explorer exit codes are not
 * meaningful, so only spawn failure degrades the menu. */
function openPath(path: string, reveal: boolean): void {
  const command = process.platform === "darwin"
    ? (reveal ? ["open", "-R", path] : ["open", path])
    : process.platform === "win32"
      ? (reveal ? ["explorer", `/select,${path}`] : ["explorer", path])
      : (reveal ? ["xdg-open", dirname(path)] : ["xdg-open", path]);
  try { const child = Bun.spawnSync(command, { stdout: "ignore", stderr: "ignore" }); if (process.platform !== "win32" && child.exitCode !== 0) throw new Error("exit"); }
  catch { throw new Error("ghostget-open-unavailable"); }
}
function copyText(text: string): void {
  const command = process.platform === "darwin" ? ["pbcopy"] : process.platform === "win32" ? ["clip"] : ["xclip", "-selection", "clipboard"];
  try { const child = Bun.spawnSync(command, { stdin: Buffer.from(text, "utf8"), stdout: "ignore", stderr: "ignore" }); if (child.exitCode !== 0) throw new Error("exit"); }
  catch { throw new Error("ghostget-clipboard-unavailable"); }
}


function reconnectProviders(snapshot: ControlSnapshot, account: ControlSnapshot["accounts"][number]) {
  if (account.kind !== "cookie-source" && account.kind !== "browser-profile") return [];
  return snapshot.connectionProviders.filter((provider) => account.provider === provider.id.replace(/-web$/u, "")
    || account.provider === null && account.id.startsWith(`${provider.id}-`));
}

function accountItems(snapshot: ControlSnapshot, enabled: boolean, platform: NodeJS.Platform): MenuItem[] {
  const accounts = snapshot.accounts;
  const rows: MenuItem[] = accounts.slice(0, 20).map((account) => {
    const status = account.status === "verified" ? "Verified" : account.status === "configured" ? "Configured" : "Reconnect required";
    const items: MenuItem[] = [
      { kind: "label", label: status },
      ...detailItems([account.provider, account.kind, account.subject].filter((part): part is string => part !== null).join(" · ") || "No subject recorded"),
      { kind: "action", id: `account:select:${account.id}`, label: snapshot.accountId === account.id ? "Selected for permissions" : "Review this account's permissions", enabled },
    ];
    const providers = reconnectProviders(snapshot, account);
    if (providers.length > 0) {
      items.push({
        kind: "submenu",
        label: "Reconnect",
        items: providers.map((provider) => ({
          kind: "submenu" as const,
          label: menuLabel(provider.title) || "Provider",
          items: BROWSERS.map((choice) => ({ kind: "action" as const, id: `reconnect:${account.id}:${provider.id}:${choice.key}`, label: choice.label, enabled: enabled && platform === "darwin" })),
        })),
      });
    }
    items.push({ kind: "action", id: `disconnect:${account.id}`, label: "Disconnect this account", enabled });
    return { kind: "submenu" as const, label: menuLabel(`${account.id} · ${status}`) || "Account", items };
  });
  if (accounts.length === 0) rows.push({ kind: "label", label: "No accounts connected" });
  if (accounts.length > 20) rows.push({ kind: "label", label: `${accounts.length - 20} more accounts` });
  return rows;
}

function approvalReview(approval: ApprovalView): { readonly items: MenuItem[]; readonly complete: boolean } {
  const detail = [approval.kind, approval.account ?? "no account", approval.effect, approval.preview].join(" · ");
  const items = detailItems(detail);
  // Allow only when every account/effect/preview character survives the actual
  // bounded menu rendering. Truncation or normalization needs the full TUI.
  const rendered = items.map(item => item.kind === "label" ? item.label : "").join(" ");
  return { items, complete: rendered === detail };
}

function approvalItems(approvals: readonly ApprovalView[], enabled: boolean): MenuItem[] {
  const rows: MenuItem[] = approvals.slice(0, 10).map((approval) => {
    const review = approvalReview(approval);
    return {
    kind: "submenu" as const,
    label: menuLabel(approval.title) || "Approval request",
    items: [
      ...review.items,
      ...(review.complete ? [] : [
        ...detailItems("Full review requires TUI. Stop menu, open ghostget tui, then submit a new approval request."),
        { kind: "label" as const, label: "Switching controllers cancels this pending request." },
      ]),
      { kind: "label", label: menuLabel(`Expires ${approval.expiresAt}`) },
      { kind: "action", id: `approval:allow:${approval.id}`, label: "Allow once", enabled: enabled && review.complete },
      { kind: "action", id: `approval:deny:${approval.id}`, label: "Deny", enabled },
    ],
    };
  });
  if (approvals.length === 0) rows.push({ kind: "label", label: "No pending approvals" });
  if (approvals.length > 10) rows.push({ kind: "label", label: `${approvals.length - 10} more approvals` });
  return rows;
}

export interface Attempt { readonly attemptId: string; readonly title: string; status: "awaiting-sign-in" | "verified"; subject: string | null }
function connectItems(snapshot: ControlSnapshot, attempts: ReadonlyMap<string, Attempt>, enabled: boolean, platform: NodeJS.Platform): MenuItem[] {
  const rows: MenuItem[] = [];
  if (platform !== "darwin") rows.push({ kind: "label", label: "Browser sign-in requires macOS. Open a provider guide for CLI setup." });
  for (const attempt of [...attempts.values()].slice(0, 8)) {
    const items: MenuItem[] = attempt.status === "verified"
      ? [
          { kind: "label", label: menuLabel(`Signed in as ${attempt.subject ?? "unknown"}`) },
          { kind: "action", id: `attempt:commit:${attempt.attemptId}`, label: `Connect ${menuLabel(attempt.subject ?? "this account", 40)}`, enabled },
        ]
      : [
          { kind: "label", label: "Finish sign-in in the opened browser, then verify." },
          { kind: "action", id: `attempt:verify:${attempt.attemptId}`, label: "Verify sign-in", enabled },
        ];
    items.push({ kind: "action", id: `attempt:cancel:${attempt.attemptId}`, label: "Cancel", enabled });
    rows.push({ kind: "submenu", label: menuLabel(`${attempt.title} · ${attempt.status === "verified" ? "verified" : "awaiting sign-in"}`), items });
  }
  for (const provider of snapshot.connectionProviders.slice(0, 12)) {
    const guide = connectionGuide(provider.id);
    rows.push({
      kind: "submenu",
      label: menuLabel(provider.title) || "Provider",
      items: [
        ...BROWSERS.map((choice) => ({ kind: "action" as const, id: `connect:${provider.id}:${choice.key}`, label: choice.label, enabled: enabled && platform === "darwin" })),
        ...(guide === undefined ? [] : [{ kind: "action" as const, id: `provider:help:${provider.id}`, label: `Open ${guide.title} capabilities and setup…` }]),
      ],
    });
  }
  if (rows.length === 0) rows.push({ kind: "label", label: "No connection providers" });
  return rows;
}

function capabilityItems(capabilities: readonly CapabilityView[]): MenuItem[] {
  if (capabilities.length === 0) return [{ kind: "label", label: "No capabilities discovered" }];
  const counts = new Map<string, number>();
  for (const capability of capabilities) counts.set(capability.state, (counts.get(capability.state) ?? 0) + 1);
  const rows: MenuItem[] = [...counts.entries()].map(([state, count]) => ({ kind: "label" as const, label: `${count} ${state}` }));
  for (const capability of capabilities.slice(0, 15)) {
    rows.push({ kind: "label", label: menuLabel(`${capability.adapterId} · ${capability.operationId} · ${capability.permission}`) });
  }
  if (capabilities.length > 15) rows.push({ kind: "label", label: `${capabilities.length - 15} more capabilities` });
  return rows;
}

function permissionItems(snapshot: ControlSnapshot, enabled: boolean): MenuItem[] {
  const rows: MenuItem[] = [
    { kind: "label", label: menuLabel(snapshot.accountId === null ? "Scope: public operations" : `Account: ${snapshot.accountId}`) },
    { kind: "action", id: "account:public", label: "Review public operations", enabled },
    { kind: "label", label: "Choose an account under Accounts for private operations." },
  ];
  if (!snapshot.policy.managed) rows.push({ kind: "action", id: "permission:enable", label: "Enable operation permissions", enabled });
  else rows.push({ kind: "label", label: "Operation permissions are managed per account." });
  if (!snapshot.policy.managed) rows.push({ kind: "label", label: "Enabling blocks operations until you choose Allow or Ask each time." });
  const editable = snapshot.capabilities.filter((capability) => capability.permission !== "unavailable");
  for (const capability of editable.slice(0, 15)) {
    rows.push({
      kind: "submenu",
      label: menuLabel(`${capability.adapterId} · ${capability.operationId} · ${capability.permission}`),
      items: [
        ...detailItems(`${capability.surface} · ${capability.effect} · risk ${capability.risk}`),
        { kind: "action", id: `permission:allow:${capability.adapterId}:${capability.operationId}`, label: "Allow", enabled: enabled && snapshot.policy.managed },
        { kind: "action", id: `permission:ask:${capability.adapterId}:${capability.operationId}`, label: "Ask each time", enabled: enabled && snapshot.policy.managed },
        { kind: "action", id: `permission:deny:${capability.adapterId}:${capability.operationId}`, label: "Deny", enabled: enabled && snapshot.policy.managed },
      ],
    });
  }
  if (editable.length > 15) rows.push({ kind: "label", label: `${editable.length - 15} more operations; use ghostget tui to review all` });
  if (editable.length === 0) rows.push({ kind: "label", label: "No compatible operations in this scope." });
  return rows;
}

function webItems(snapshot: ControlSnapshot): MenuItem[] {
  const rules = snapshot.web.rules;
  const rows: MenuItem[] = [{ kind: "label", label: snapshot.web.gatewayOnly ? "Gateway-only mode" : "Direct retrieval allowed" }];
  for (const rule of rules.slice(0, 10)) {
    rows.push({ kind: "label", label: menuLabel(`${rule.origin}${rule.path.value} · ${rule.decision}`) });
  }
  if (rules.length > 10) rows.push({ kind: "label", label: `${rules.length - 10} more rules` });
  return rows;
}

export type PendingActivation = Extract<ControlRequest, { action: "interface.activate" }>;
function interfaceItems(snapshot: ControlSnapshot, enabled: boolean, pending: PendingActivation | null): MenuItem[] {
  const interfaces = snapshot.interfaces;
  if (interfaces.length === 0) return [{ kind: "label", label: "No interfaces installed" }];
  const rows: MenuItem[] = interfaces.slice(0, 10).map((entry) => ({
    kind: "submenu" as const,
    label: menuLabel(`${entry.title} · ${entry.state}`),
    items: [
      ...detailItems(`${entry.operationCount} operations · ${entry.adapterIds.join(", ") || "no adapters"}${entry.issues.length > 0 ? ` · ${entry.issues.length} issue(s)` : ""}`),
      ...entry.activationTargets.slice(0, 3).map((target) => ({ kind: "action" as const, id: `interface:review:${entry.id}:${target.adapterId}`, label: menuLabel(`Review activation · ${target.adapterId}`), enabled })),
    ],
  }));
  if (pending !== null) rows.unshift({ kind: "submenu", label: menuLabel(`Confirm activation · ${pending.adapterId}`), items: [
    { kind: "label", label: "Activate this exact reviewed draft and installed baseline." },
    { kind: "label", label: `Draft: ${pending.digest}` },
    { kind: "label", label: `Base: ${pending.expectedInstalledDigest ?? "not installed"}` },
    { kind: "action", id: "interface:confirm", label: menuLabel(`Activate ${pending.adapterId}`), enabled },
    { kind: "action", id: "interface:cancel", label: "Cancel activation", enabled },
  ] });
  if (interfaces.length > 10) rows.push({ kind: "label", label: `${interfaces.length - 10} more interfaces` });
  return rows;
}

function activityItems(rows: readonly ActivityRow[]): MenuItem[] {
  if (rows.length === 0) return [{ kind: "label", label: "No recent gateway activity" }];
  return rows.slice(0, 8).map((row) => ({
    kind: "label" as const,
    label: menuLabel(`${row.method} ${row.origin ?? row.endpoint ?? "request"} · ${row.outcome}${row.httpStatus === null ? "" : ` · ${row.httpStatus}`}`),
  }));
}

/** Map one control snapshot onto the shared menu contract. The helper stays
 * the authority; rows are display-only except the bounded actions below. */
export function snapshotItems(
  snapshot: ControlSnapshot | null,
  attempts: ReadonlyMap<string, Attempt>,
  status: { confirmedAgeSeconds: number | null; fresh: boolean; detail?: string | undefined },
  activity: readonly ActivityRow[] = [],
  outputs: OutputsView = EMPTY_OUTPUTS,
  notice: string | null = null,
  pendingActivation: PendingActivation | null = null,
  platform: NodeJS.Platform = process.platform,
): MenuItem[] {
  const confirmed = snapshot !== null && status.fresh;
  const age = status.confirmedAgeSeconds;
  const ageText = age !== null && age < 60 ? `${age}s ago` : `${Math.floor((age ?? 0) / 60)}m ago`;
  const updated = age === null ? "Control status not confirmed" : status.fresh ? `Updated ${ageText}` : `Last confirmed ${ageText}`;
  const tail: MenuItem[] = [
    { kind: "separator" },
    { kind: "submenu", label: `Outputs · ${outputs.entries.length}`, items: outputItems(outputs) },
    ...(notice === null ? [] : [{ kind: "label" as const, label: menuLabel(notice) }]),
    { kind: "label", label: menuLabel(updated) },
    { kind: "action", id: "refresh", label: "Refresh status" },
    { kind: "action", id: "open-website", label: "Open Ghostget…" },
    { kind: "action", id: "support:updates", label: "Get Ghostget updates (free)…" },
    { kind: "action", id: "support:paid", label: "Support Ghostget development (optional paid)…" },
    { kind: "submenu", label: "Copy CLI command", items: cliHelpItems() },
    { kind: "separator" },
    { kind: "quit", label: "Quit Ghostget" },
  ];
  if (snapshot === null) {
    return [
      { kind: "label", label: "Ghostget control unavailable" },
      { kind: "label", label: menuLabel(status.detail ?? "The control helper is not running. Requests need the companion open.") },
      { kind: "label", label: "Close any Ghostget TUI or other control session, then refresh." },
      ...tail,
    ];
  }
  const pending = snapshot.approvals.length;
  const reconnect = snapshot.accounts.filter((account) => account.status === "reconnect-required").length;
  return [
    { kind: "label", label: menuLabel(`Ghostget ${snapshot.version}`) },
    { kind: "label", label: menuLabel(`${snapshot.accounts.length} account${snapshot.accounts.length === 1 ? "" : "s"}${reconnect > 0 ? ` · ${reconnect} need reconnect` : ""} · ${pending} pending approval${pending === 1 ? "" : "s"}`) },
    { kind: "separator" },
    { kind: "submenu", label: `Approvals · ${pending}`, items: approvalItems(snapshot.approvals, confirmed) },
    { kind: "submenu", label: `Accounts · ${snapshot.accounts.length}`, items: accountItems(snapshot, confirmed, platform) },
    { kind: "submenu", label: "Connect X, LinkedIn, or Reddit", items: connectItems(snapshot, attempts, confirmed, platform) },
    { kind: "submenu", label: "Permissions", items: permissionItems(snapshot, confirmed) },
    { kind: "submenu", label: `Capabilities · ${snapshot.capabilities.length}`, items: capabilityItems(snapshot.capabilities) },
    { kind: "submenu", label: `Web rules · ${snapshot.web.rules.length}`, items: webItems(snapshot) },
    { kind: "submenu", label: `Interfaces · ${snapshot.interfaces.length}`, items: interfaceItems(snapshot, confirmed, pendingActivation) },
    { kind: "submenu", label: "Recent activity", items: activityItems(activity) },
    { kind: "submenu", label: "1Password · X token import", items: [
      { kind: "label", label: snapshot.vault.available ? "macOS supported; desktop access has not been checked." : "Import requires macOS and the 1Password desktop app." },
      { kind: "label", label: "Imports one X token to a private local copy; no token renewal." },
      { kind: "action", id: "clip:3", label: "Copy import help command" },
    ] },
    ...tail,
  ];
}

/** The Ghostget menu companion owns the control helper's stdio channel and is
 * a disposable client of it. All reads and mutations use bounded control
 * requests; the shared runner renders state and enforces revision-checked
 * dispatch. Failed or indeterminate mutations are never retried. */
export function companionOptions(
  environment: ControlEnvironment,
  openPage: (url: string) => Promise<void> = openBrowser,
  createHelper: (environment: ControlEnvironment) => HelperClient = spawnHelper,
  platform: NodeJS.Platform = process.platform,
): CompanionOptions & { readonly dispose: () => Promise<void> } {
  let helper: HelperClient | null = null;
  let disposed = false;
  let closing: Promise<void> | null = null;
  let lastSnapshot: ControlSnapshot | null = null;
  let confirmedAt: number | null = null;
  let lastOutputs: OutputsView = EMPTY_OUTPUTS;
  let notice: string | null = null;
  let openingAccountPage = false;
  let selectedAccount: string | null = null;
  let administrativeConfirmed = false;
  let pendingActivation: PendingActivation | null = null;
  const attempts = new Map<string, Attempt>();
  const outputsDirectory = join(ghostgetStateHome(environment), "outputs");
  const drop = (): Promise<void> => {
    const current = helper;
    helper = null;
    if (current === null) return closing ?? Promise.resolve();
    // Closing stdin asks the helper to cancel and join owned work. Keep that
    // custody until it settles; never detach or kill pending credential work.
    closing = Promise.all([closing, Promise.resolve().then(() => current.close())]).then(() => undefined);
    void closing.catch(() => undefined); // The exit fallback cannot await it.
    return closing;
  };
  const onExit = (): void => { void drop(); };
  const dispose = async (): Promise<void> => {
    disposed = true;
    administrativeConfirmed = false;
    process.removeListener("exit", onExit);
    await drop();
  };
  process.once("exit", onExit);
  const request = async (body: ControlRequest, timeoutMs?: number): Promise<ControlResponse> => {
    await closing;
    if (disposed) return { ok: false, code: "CONTROL_CLOSED", message: "The Ghostget menu controller is closed." };
    if (helper === null) helper = createHelper(environment);
    const response = await helper.request(body, timeoutMs);
    if (!response.ok && (response.code === "CONTROL_DISCONNECTED" || response.code === "CONTROL_TIMEOUT")) { administrativeConfirmed = false; await drop(); }
    return response;
  };
  return {
    dispose,
    appId: "ghostget",
    name: "Ghostget",
    title: "\u{1f47b}",
    icon: TRAY_ICON,
    tooltip: "Ghostget · control, outputs and CLI help",
    stateDir: join(ghostgetStateHome(environment), "menubar"),
    refreshMs: 5_000,
    timeoutMs: 90_000,
    snapshot: async () => {
      let fresh = false;
      administrativeConfirmed = false;
      let response = await request({ action: "snapshot", accountId: selectedAccount });
      if (!response.ok && response.code === "ACCOUNT_UNAVAILABLE" && selectedAccount !== null) {
        selectedAccount = null;
        pendingActivation = null;
        notice = "The selected account is no longer configured. Showing public operations.";
        response = await request({ action: "snapshot", accountId: null });
      }
      if (response.ok && response.data.kind === "snapshot") {
        if (lastSnapshot !== null && response.data.snapshot.policy.revision < lastSnapshot.policy.revision) {
          // A late or replayed response must never undo newer owner state.
        } else {
          lastSnapshot = response.data.snapshot;
          confirmedAt = Date.now();
          fresh = true;
          administrativeConfirmed = true;
          if (pendingActivation !== null && !response.data.snapshot.interfaces.some((entry) => entry.id === pendingActivation!.id && entry.digest === pendingActivation!.digest
            && entry.activationTargets.some((target) => target.adapterId === pendingActivation!.adapterId && target.installedDigest === pendingActivation!.expectedInstalledDigest))) {
            pendingActivation = null;
            notice = "The draft or installed adapter changed. Review activation again.";
          }
        }
      }
      let activity: readonly ActivityRow[] = [];
      if (fresh) {
        const page = await request({ action: "activity.query", query: { search: "", method: "all", outcome: "all", origin: null, since: null, order: "newest", cursor: null, limit: 8 } });
        if (page.ok && page.data.kind === "activity") activity = page.data.page.rows;
      }
      lastOutputs = readOutputs(outputsDirectory);
      return snapshotItems(lastSnapshot, attempts, { confirmedAgeSeconds: confirmedAt === null ? null : Math.max(0, Math.floor((Date.now() - confirmedAt) / 1000)), fresh: fresh && administrativeConfirmed, detail: response.ok ? undefined : response.message }, activity, lastOutputs, notice, pendingActivation, platform);
    },
    onAction: async (id) => {
      if (id === "refresh") { notice = null; return; } // the runner re-reads state after every action
      if (id === "open-website") { await openBrowser(WEBSITE); return; }
      if (id.startsWith("provider:help:")) {
        const guide = connectionGuide(id.slice("provider:help:".length));
        if (guide !== undefined) await openPage(guide.url);
        return;
      }
      if (id === "support:updates" || id === "support:paid") {
        if (openingAccountPage) return;
        const action = SUPPORT_ACTIONS.find((item) => item.kind === (id === "support:updates" ? "updates" : "support"));
        if (action === undefined) return;
        openingAccountPage = true;
        notice = null;
        try { await openPage(action.url); }
        catch { notice = "Could not open Accounts. Try again from the menu."; }
        finally { openingAccountPage = false; }
        return;
      }
      if (id === "output:folder") {
        const expected = lastOutputs.directory;
        const fresh = (() => { try { return lstatSync(outputsDirectory, { bigint: true }); } catch { return null; } })();
        if (expected !== null && fresh !== null && fresh.isDirectory() && !fresh.isSymbolicLink() && fresh.dev === expected.dev && fresh.ino === expected.ino) openPath(outputsDirectory, true);
        return;
      }
      if (id.startsWith("output:open:") || id.startsWith("output:reveal:") || id.startsWith("output:copy:")) {
        const entry = lastOutputs.entries[Number(id.slice(id.indexOf(":", 7) + 1))];
        const path = entry === undefined ? null : validatedOutputPath(outputsDirectory, lastOutputs, entry.name);
        if (path === null) { notice = "File changed or unavailable; refresh outputs"; return; }
        notice = null;
        if (id.startsWith("output:copy:")) copyText(path);
        else openPath(path, id.startsWith("output:reveal:"));
        return;
      }
      if (id.startsWith("clip:")) { const command = CLI_COMMANDS[Number(id.slice(5))]; if (command !== undefined) copyText(command); return; }
      const snapshot = lastSnapshot;
      if (snapshot === null) return;
      const parts = id.split(":");
      if (id === "account:public" || parts[0] === "account" && parts[1] === "select" && parts.length === 3) {
        if (id !== "account:public" && !snapshot.accounts.some((account) => account.id === parts[2])) return;
        selectedAccount = id === "account:public" ? null : parts[2]!;
        administrativeConfirmed = false;
        pendingActivation = null;
        return;
      }
      if (id === "interface:cancel") { pendingActivation = null; return; }
      if (!administrativeConfirmed) throw new Error("ghostget-CONTROL_UNCONFIRMED");
      const fail = (response: ControlResponse): void => { if (!response.ok) throw new Error(`ghostget-${response.code}`); };
      if (parts[0] === "interface" && parts[1] === "review" && parts.length === 4) {
        const entry = snapshot.interfaces.find((item) => item.id === parts[2]);
        const target = entry?.activationTargets.find((item) => item.adapterId === parts[3]);
        if (entry === undefined || target === undefined) return;
        pendingActivation = { action: "interface.activate", id: entry.id, digest: entry.digest, adapterId: target.adapterId, expectedInstalledDigest: target.installedDigest };
        return;
      }
      if (id === "interface:confirm") {
        const activation = pendingActivation;
        pendingActivation = null;
        if (activation === null) return;
        fail(await request(activation));
        administrativeConfirmed = false;
        notice = "Interface activated. Review its operation permissions.";
        return;
      }
      if (id === "permission:enable") { fail(await request({ action: "permission.enable", expectedRevision: snapshot.policy.revision })); return; }
      if (parts[0] === "approval" && parts.length === 3 && (parts[1] === "allow" || parts[1] === "deny")) {
        const approval = snapshot.approvals.find((item) => item.id === parts[2]);
        if (approval === undefined) return;
        if (parts[1] === "allow" && !approvalReview(approval).complete) {
          notice = "Full review requires TUI. Switching controllers cancels this request.";
          throw new Error("ghostget-APPROVAL_REQUIRES_FULL_REVIEW");
        }
        fail(await request({ action: "approval.decide", id: approval.id, digest: approval.digest, decision: parts[1] === "allow" ? "allow-once" : "deny" }));
        return;
      }
      if (parts[0] === "disconnect" && parts.length === 2) {
        const account = snapshot.accounts.find((item) => item.id === parts[1]);
        if (account === undefined) return;
        fail(await request({ action: "connection.disconnect", id: account.id, expectedRevision: account.revision }));
        return;
      }
      if (parts[0] === "connect" && parts.length === 3) {
        if (platform !== "darwin") throw new Error("ghostget-CONNECTION_PLATFORM_UNSUPPORTED");
        const provider = snapshot.connectionProviders.find((item) => item.id === parts[1]);
        const choice = BROWSERS.find((item) => item.key === parts[2]);
        if (provider === undefined || choice === undefined) return;
        const response = await request({ action: "connection.begin", id: `${provider.id}-${randomUUID().slice(0, 8)}`, provider: provider.id, browser: choice.browser, profile: choice.profile, expectedRevision: null });
        fail(response);
        if (response.ok && response.data.kind === "connection") attempts.set(response.data.attemptId, { attemptId: response.data.attemptId, title: provider.title, status: "awaiting-sign-in", subject: null });
        return;
      }
      if (parts[0] === "reconnect" && parts.length === 4) {
        if (platform !== "darwin") throw new Error("ghostget-CONNECTION_PLATFORM_UNSUPPORTED");
        const account = snapshot.accounts.find((item) => item.id === parts[1]);
        const provider = snapshot.connectionProviders.find((item) => item.id === parts[2]);
        const choice = BROWSERS.find((item) => item.key === parts[3]);
        if (account === undefined || provider === undefined || choice === undefined || !reconnectProviders(snapshot, account).some((item) => item.id === provider.id)) return;
        const response = await request({ action: "connection.begin", id: account.id, provider: provider.id, browser: choice.browser, profile: choice.profile, expectedRevision: account.revision });
        fail(response);
        if (response.ok && response.data.kind === "connection") attempts.set(response.data.attemptId, { attemptId: response.data.attemptId, title: provider.title, status: "awaiting-sign-in", subject: null });
        return;
      }
      if (parts[0] === "attempt" && parts.length === 3) {
        const attempt = attempts.get(parts[2]!);
        if (attempt === undefined) return;
        if (parts[1] === "cancel") { await request({ action: "connection.cancel", attemptId: attempt.attemptId }); attempts.delete(attempt.attemptId); return; }
        if (parts[1] === "verify") {
          const response = await request({ action: "connection.verify", attemptId: attempt.attemptId }, 75_000);
          if (!response.ok) { attempts.delete(attempt.attemptId); throw new Error(`ghostget-${response.code}`); }
          if (response.data.kind === "connection" && response.data.status === "verified") attempts.set(attempt.attemptId, { ...attempt, status: "verified", subject: response.data.subject });
          return;
        }
        if (parts[1] === "commit") {
          if (attempt.status !== "verified" || attempt.subject === null) return;
          const response = await request({ action: "connection.commit", attemptId: attempt.attemptId, expectedSubject: attempt.subject });
          attempts.delete(attempt.attemptId);
          fail(response);
          return;
        }
        return;
      }
      if (parts[0] === "permission" && parts.length === 4 && (parts[1] === "allow" || parts[1] === "ask" || parts[1] === "deny")) {
        const capability = snapshot.capabilities.find((item) => item.adapterId === parts[2] && item.operationId === parts[3]);
        if (capability === undefined || capability.permission === "unavailable" || !snapshot.policy.managed) return;
        fail(await request({ action: "permission.set", adapterId: capability.adapterId, operationId: capability.operationId, accountId: snapshot.accountId, decision: parts[1], expectedRevision: snapshot.policy.revision, expectedCapabilityDigest: capability.digest }));
      }
    },
  };
}

/** Delegate the product `menubar` command family to the shared lifecycle. */
export async function runMenubarCommand(
  args: readonly string[], environment: ControlEnvironment = process.env, output: Output,
  dependencies: { readonly handle?: typeof handleCompanionCommand; readonly helper?: (environment: ControlEnvironment) => HelperClient } = {},
): Promise<number> {
  const rest = args.slice(1);
  if (rest[0] === "--help" || rest[0] === "help" || rest[0] === "-h") {
    output.stdout("Usage: ghostget menubar [start|stop|status|doctor|install|uninstall]\nRuns the shared menu-bar companion; install registers login startup.\n");
    return 0;
  }
  if (rest.length > 1 || (rest[0] !== undefined && !["start", "stop", "status", "doctor", "install", "uninstall", "--foreground", "--background"].includes(rest[0]))) {
    output.stderr("Usage: ghostget menubar [start|stop|status|doctor|install|uninstall]\n");
    return 1;
  }
  const mapped = rest[0] === "--background" ? [] : rest;
  const cli = fileURLToPath(new URL("../cli.ts", import.meta.url));
  const binary = environment.GHOSTGET_MENUBAR;
  if (binary !== undefined && binary !== "" && (!isAbsolute(binary) || normalize(binary) !== binary || /[\u0000-\u001f\u007f]/u.test(binary))) {
    output.stderr("GHOSTGET_MENUBAR must be an absolute, normalized path to a reviewed companion executable.\n");
    return 1;
  }
  const adapter = companionOptions(environment, openBrowser, dependencies.helper ?? spawnHelper);
  const options: CompanionOptions = {
    ...adapter,
    ...(binary === undefined || binary === "" ? {} : { binary }),
  };
  try {
    return await (dependencies.handle ?? handleCompanionCommand)(options, {
      args: mapped,
      foreground: { executable: process.execPath, args: [cli, "menubar", "--foreground"] },
      write: (result) => output.stdout(`${JSON.stringify(result)}\n`),
    });
  } finally { await adapter.dispose(); }
}
