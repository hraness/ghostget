import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync, type BigIntStats } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  companionHelp,
  createCliOutput,
  handleCompanionCommand,
  MenuActionError,
  openAtLoginItem,
  openBrowser,
  type ActionItemV2,
  type AutostartApp,
  type CompanionOptions,
  type MenuItemV2,
  type MenuModel,
  type StatusItemV2,
  type StatusMark,
} from "@hraness/desktop-foundation";
import { createSupportOffer } from "@hraness/support-foundation";
import { ghostgetSupportProfile } from "../support-profile";
import { TRAY_ICON } from "./menubar-icon";
import { ensurePrivateStateDirectory, ghostgetStateHome } from "../storage";
import { type ActivityRow, type ApprovalView, type ControlRequest, type ControlResponse, type ControlSnapshot } from "./protocol";
import { probeSafariAccess } from "../cookie-access";
import { spawnHelper, type HelperClient } from "./helper-client";
import { DEFAULT_BROWSER_CHOICES, browserChoices, type BrowserChoice } from "./browser-choices";
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
type Output = { readonly stdout: (text: string) => unknown; readonly stderr: (text: string) => unknown };

/** Presentation never lets control data add lines, bidi overrides or unbounded menus. */
export function menuLabel(text: string, limit = 72): string {
  const clean = [...text]
    .map((character) => (/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(character) ? " " : character))
    .join("").split(/\s+/u).filter((part) => part.length > 0).join(" ");
  const scalars = [...clean];
  return scalars.length > limit ? `${scalars.slice(0, Math.max(0, limit - 1)).join("")}…` : clean;
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
const UNAVAILABLE_OUTPUTS: OutputsView = { directory: null, entries: [], message: "No outputs yet", truncated: false };

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

const CLI_COMMANDS = ["ghostget --help", "ghostget menubar --help", "ghostget menubar status", "ghostget vault import-x --help"] as const;

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


function outputSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** "just now", "5 min ago", "3 hr ago", "2 days ago". */
function ago(thenMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.floor((nowMs - thenMs) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr ago`;
  const days = Math.floor(seconds / 86_400);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "in 4 min", "in 2 hr", or "now" for a request about to expire. */
function expiresIn(expiresAt: string, nowMs: number): string {
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return "Expires soon";
  const seconds = Math.floor((at - nowMs) / 1000);
  if (seconds < 60) return "Expires in under a minute";
  if (seconds < 3600) return `Expires in ${Math.floor(seconds / 60)} min`;
  return `Expires in ${Math.floor(seconds / 3600)} hr`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Sentence-case one identifier: "timeline.read" -> "Timeline read". */
function humanize(identifier: string): string {
  const words = identifier.split(/[._\-\s]+/u).filter((word) => word.length > 0).map((word) => word.toLowerCase());
  const text = words.join(" ");
  return text === "" ? "Operation" : `${text[0]!.toUpperCase()}${text.slice(1)}`;
}

/** Row and budget bounds. The worst case of every bound together stays under
 * the shared 256-node cap with room for the SDK's own rows (see the budget test). */
export const MENU_BOUNDS = Object.freeze({
  approvals: 4,
  approvalLines: 4,
  attempts: 4,
  accounts: 8,
  providers: 3,
  outputs: 8,
  permissions: 12,
  interfaceReviews: 2,
  webRules: 6,
  interfaces: 4,
  activity: 5,
  disconnects: 8,
});

const PROVIDER_NAMES: Readonly<Record<string, string>> = { x: "X", linkedin: "LinkedIn", reddit: "Reddit" };
/** Proper nouns the Ghostget menu may capitalize, for the strict menu lint. */
export const GHOSTGET_MENU_NOUNS = ["X", "LinkedIn", "Reddit", "Chrome", "Safari", "1Password", "Ghostget", "TUI"] as const;

function siteName(surface: string): string {
  return Object.hasOwn(PROVIDER_NAMES, surface) ? PROVIDER_NAMES[surface]! : surface;
}

function providerTitle(title: string): string {
  return menuLabel(title.split(" · ")[0] ?? title, 24) || "Provider";
}

function accountProvider(snapshot: ControlSnapshot, account: ControlSnapshot["accounts"][number]): string {
  const key = account.provider ?? snapshot.connectionProviders.find((provider) => account.id.startsWith(`${provider.id}-`))?.id.replace(/-web$/u, "") ?? null;
  if (key === null) return "Account";
  return Object.hasOwn(PROVIDER_NAMES, key) ? PROVIDER_NAMES[key]! : humanize(key);
}

/** The browser choice an account was saved from, when it is one of the offered choices. */
function accountBrowser(account: ControlSnapshot["accounts"][number], browsers: readonly BrowserChoice[]): BrowserChoice | undefined {
  if (account.kind !== "cookie-source" || (account.source !== "chrome" && account.source !== "safari")) return undefined;
  const profile = account.source === "chrome" ? (account.profile ?? "Default") : null;
  return browsers.find((choice) => choice.browser === account.source && choice.profile === profile);
}

function accountSource(account: ControlSnapshot["accounts"][number], browsers: readonly BrowserChoice[]): string {
  const choice = accountBrowser(account, browsers);
  if (choice !== undefined) return choice.label;
  if (account.kind === "cookie-source") return account.source === "safari" ? "Safari" : "Chrome";
  if (account.kind === "oauth-token-file") return "Access token";
  if (account.kind === "browser-profile") return "Browser profile";
  if (account.kind === "cookies-file") return "Cookie file";
  return "Saved sign-in";
}

/** A generated account ID ("x-web-3fa9c1b2") is noise; a chosen one ("x-main") is a name. */
function accountName(id: string): string | null {
  return /[0-9a-f]{8}/u.test(id) || id.length > 24 ? null : id;
}

/** "X · @name" once the provider verified a handle; otherwise
 * "X · Chrome · Personal": provider and where the sign-in lives — never a
 * numeric subject or generated account ID. */
export function accountLabel(snapshot: ControlSnapshot, account: ControlSnapshot["accounts"][number], browsers: readonly BrowserChoice[]): string {
  const provider = accountProvider(snapshot, account);
  return menuLabel(account.displayName === null
    ? `${provider} · ${accountSource(account, browsers)}`
    : `${provider} · ${account.displayName}`, 48);
}

function accountStatus(account: ControlSnapshot["accounts"][number]): string {
  return account.status === "verified" ? "Verified" : account.status === "configured" ? "Saved" : "Needs reconnecting";
}

function reconnectProviders(snapshot: ControlSnapshot, account: ControlSnapshot["accounts"][number]) {
  if (account.kind !== "cookie-source" && account.kind !== "browser-profile") return [];
  return snapshot.connectionProviders.filter((provider) => account.provider === provider.id.replace(/-web$/u, "")
    || account.provider === null && account.id.startsWith(`${provider.id}-`));
}

function separated(groups: readonly (readonly MenuItemV2[])[]): MenuItemV2[] {
  const out: MenuItemV2[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    if (out.length > 0) out.push({ kind: "separator" });
    out.push(...group);
  }
  return out;
}

function wrapLines(text: string, width: number): string[] {
  const rows: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if ([...next].length <= width) current = next;
    else { if (current !== "") rows.push(current); current = [...word].length > width ? menuLabel(word, width) : word; }
  }
  if (current !== "") rows.push(current);
  return rows;
}

function approvalReview(approval: ApprovalView, account: string): { readonly lines: string[]; readonly complete: boolean } {
  const who = menuLabel(`${account} · ${approval.effect}`, 4096);
  const preview = wrapLines(menuLabel(approval.preview, 4096), 48);
  const lines = [...wrapLines(who, 48), ...preview].slice(0, MENU_BOUNDS.approvalLines);
  // Allow only when every account/effect/preview character survives the
  // bounded menu rendering. Truncation or normalization needs the full TUI.
  const exact = [`${account} · ${approval.effect}`, approval.preview].filter((part) => part !== "").join(" ");
  return { lines, complete: lines.join(" ") === exact };
}

function approvalAccount(snapshot: ControlSnapshot, approval: ApprovalView, browsers: readonly BrowserChoice[]): string {
  if (approval.account === null) return "No account";
  const account = snapshot.accounts.find((item) => item.id === approval.account);
  return account === undefined ? approval.account : accountLabel(snapshot, account, browsers);
}

function approvalItems(snapshot: ControlSnapshot, enabled: boolean, browsers: readonly BrowserChoice[], nowMs: number): MenuItemV2[] {
  const groups: MenuItemV2[][] = snapshot.approvals.slice(0, MENU_BOUNDS.approvals).map((approval) => {
    const review = approvalReview(approval, approvalAccount(snapshot, approval, browsers));
    return [
      { kind: "label", label: menuLabel(approval.title, 48) || "Approval request", subtitle: expiresIn(approval.expiresAt, nowMs) },
      ...review.lines.map((line): MenuItemV2 => ({ kind: "label", label: line })),
      ...(review.complete ? [] : [{ kind: "label" as const, label: "Too long to review here", subtitle: "Review it in the Ghostget TUI; switching cancels this request" }]),
      { kind: "action", id: `approval:allow:${approval.id}`, label: "Allow once", symbol: "item.approval", enabled: enabled && review.complete },
      { kind: "action", id: `approval:deny:${approval.id}`, label: "Deny", role: "destructive", enabled },
    ];
  });
  const more = snapshot.approvals.length - MENU_BOUNDS.approvals;
  if (more > 0) groups.push([{ kind: "label", label: `${plural(more, "more request", "more requests")} waiting` }]);
  return separated(groups);
}

/** One in-flight browser sign-in. The helper keeps a failed verification
 * alive, so its row stays and "verify" on the same attempt is the retry;
 * only an expired attempt disappears. */
export interface Attempt {
  readonly attemptId: string;
  readonly title: string;
  readonly providerId: string;
  readonly browserKey: string;
  /** The saved account being reconnected, or null for a new account. */
  readonly accountId: string | null;
  status: "awaiting-sign-in" | "verified" | "failed";
  subject: string | null;
  /** The verified human handle, such as "@name"; null before it resolves. */
  displayName: string | null;
}

function attemptItems(attempts: ReadonlyMap<string, Attempt>, enabled: boolean, browsers: readonly BrowserChoice[]): MenuItemV2[] {
  return [...attempts.values()].slice(0, MENU_BOUNDS.attempts).map((attempt): MenuItemV2 => {
    const name = providerTitle(attempt.title);
    const where = browsers.find((choice) => choice.key === attempt.browserKey)?.label ?? "the browser";
    const cancel = { id: `attempt:cancel:${attempt.attemptId}`, label: `Cancel ${name} sign-in` };
    if (attempt.status === "verified") {
      const verified = attempt.displayName === null ? `Signed in and verified in ${where}` : `Signed in as ${attempt.displayName} in ${where}`;
      return { kind: "action", id: `attempt:commit:${attempt.attemptId}`, label: menuLabel(`Connect this ${name} account`, 48), subtitle: menuLabel(verified, 80), symbol: "action.add", enabled, alternate: cancel };
    }
    if (attempt.status === "failed") {
      return { kind: "action", id: `attempt:verify:${attempt.attemptId}`, label: menuLabel(`Verify ${name} sign-in again`, 48), subtitle: menuLabel(`Couldn't verify the sign-in in ${where}`, 80), symbol: "action.refresh", enabled, alternate: cancel };
    }
    // Chromium keeps its cookie key in the keychain, so say before Verify that macOS will ask.
    const chromium = browsers.find((choice) => choice.key === attempt.browserKey)?.browser === "chrome";
    const subtitle = chromium ? `Sign in in ${where}, then allow keychain access when macOS asks` : `Sign in to ${name} in ${where} first`;
    return { kind: "action", id: `attempt:verify:${attempt.attemptId}`, label: menuLabel(`Verify ${name} sign-in`, 48), subtitle: menuLabel(subtitle, 80), symbol: "action.signIn", enabled, alternate: cancel };
  });
}

function accountRows(snapshot: ControlSnapshot, enabled: boolean, platform: NodeJS.Platform, browsers: readonly BrowserChoice[]): MenuItemV2[] {
  const rows: MenuItemV2[] = [];
  for (const account of snapshot.accounts.slice(0, MENU_BOUNDS.accounts)) {
    const name = accountName(account.id);
    // When the label already shows the handle, keep where the sign-in lives
    // in the subtitle; without a handle the label carries it instead.
    const subtitle = menuLabel([accountStatus(account), ...(account.displayName === null ? [] : [accountSource(account, browsers)]), name].filter((part): part is string => part !== null).join(" · "), 80);
    rows.push({
      kind: "action",
      id: `account:select:${account.id}`,
      label: accountLabel(snapshot, account, browsers),
      subtitle,
      symbol: "item.contact",
      state: snapshot.accountId === account.id ? "on" : "off",
      tooltip: "Choose it to set this account's permissions",
      alternate: { id: `account:copy:${account.id}`, label: "Copy account ID", symbol: "action.copy" },
    });
    const choice = accountBrowser(account, browsers);
    const provider = reconnectProviders(snapshot, account)[0];
    if (account.status === "reconnect-required" && provider !== undefined && platform === "darwin") {
      rows.push(choice === undefined
        ? { kind: "label", label: menuLabel(`Reconnect ${providerTitle(provider.title)} below`, 48), subtitle: "Choose the browser you signed in with" }
        : { kind: "action", id: `reconnect:${account.id}:${provider.id}:${choice.key}`, label: menuLabel(`Reconnect in ${choice.label}`, 48), symbol: "action.signIn", enabled });
    }
  }
  const more = snapshot.accounts.length - MENU_BOUNDS.accounts;
  if (more > 0) rows.push({ kind: "label", label: plural(more, "more account", "more accounts") });
  return rows;
}

export type SafariAccess = "ok" | "denied" | "missing";

function connectRows(snapshot: ControlSnapshot, enabled: boolean, platform: NodeJS.Platform, browsers: readonly BrowserChoice[], safari: SafariAccess): MenuItemV2[] {
  const providers = snapshot.connectionProviders.slice(0, MENU_BOUNDS.providers);
  if (providers.length === 0) return [{ kind: "label", label: "No sites to connect yet" }];
  if (platform !== "darwin") {
    return [
      { kind: "label", label: "Browser sign-in works on macOS", subtitle: "Each site's guide shows how to connect from the terminal" },
      ...providers.flatMap((provider): MenuItemV2[] => connectionGuide(provider.id) === undefined ? [] : [{ kind: "action", id: `provider:help:${provider.id}`, label: menuLabel(`${providerTitle(provider.title)} setup guide`, 48), symbol: "action.help", opens: "browser" }]),
    ];
  }
  const rows: MenuItemV2[] = [];
  const offered = browsers.filter((choice) => choice.browser !== "safari" || safari !== "denied");
  for (const provider of providers) {
    for (const choice of offered) {
      rows.push({ kind: "action", id: `connect:${provider.id}:${choice.key}`, label: menuLabel(`Connect ${providerTitle(provider.title)} in ${choice.label}`, 48), symbol: "action.add", enabled });
    }
  }
  if (safari === "denied" && browsers.some((choice) => choice.browser === "safari")) {
    rows.push({ kind: "action", id: "foundation.settings.full-disk-access", label: "Safari needs Full Disk Access", subtitle: "Turn it on to connect with Safari", symbol: "action.permission", opens: "settings" });
  }
  return rows;
}

function accountsMenu(snapshot: ControlSnapshot, attempts: ReadonlyMap<string, Attempt>, enabled: boolean, platform: NodeJS.Platform, browsers: readonly BrowserChoice[], safari: SafariAccess): MenuItemV2 {
  const items = separated([attemptItems(attempts, enabled, browsers), accountRows(snapshot, enabled, platform, browsers), connectRows(snapshot, enabled, platform, browsers, safari)]);
  if (snapshot.accounts.length === 0) return { kind: "submenu", label: "Connect an account", symbol: "action.add", items };
  return { kind: "submenu", label: `Accounts (${snapshot.accounts.length})`, symbol: "item.contact", items };
}

function outputItems(outputs: OutputsView, nowMs: number): MenuItemV2[] {
  if (outputs.entries.length === 0) return [{ kind: "label", label: "No outputs yet", subtitle: "Saved pages appear here" }];
  const rows: MenuItemV2[] = outputs.entries.slice(0, MENU_BOUNDS.outputs).map((entry, index): MenuItemV2 => {
    const extension = entry.name.includes(".") ? entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase() : "";
    const openable = OPENABLE_EXTENSIONS.has(extension);
    return {
      kind: "action",
      id: openable ? `output:open:${index}` : `output:reveal:${index}`,
      label: menuLabel(entry.name, 48) || "Output file",
      subtitle: `${outputSize(entry.size)} · ${ago(entry.modifiedMs, nowMs)}`,
      symbol: /^(png|jpe?g|gif|webp|tiff)$/u.test(extension) ? "item.image" : "item.file",
      alternate: openable
        ? { id: `output:reveal:${index}`, label: "Show in Finder", symbol: "action.folder" }
        : { id: `output:copy:${index}`, label: "Copy file path", symbol: "action.copy" },
    };
  });
  const more = outputs.entries.length - MENU_BOUNDS.outputs;
  if (more > 0 || outputs.truncated) rows.push({ kind: "label", label: "More files in the outputs folder" });
  if (outputs.directory !== null) rows.push({ kind: "separator" }, { kind: "action", id: "output:folder", label: "Open outputs folder", symbol: "action.folder", opens: "finder", alternate: { id: "output:copy-folder", label: "Copy folder location", symbol: "action.copy" } });
  return rows;
}

function permissionRows(snapshot: ControlSnapshot, enabled: boolean, browsers: readonly BrowserChoice[]): MenuItemV2[] {
  const selected = snapshot.accountId === null ? undefined : snapshot.accounts.find((account) => account.id === snapshot.accountId);
  const rows: MenuItemV2[] = [
    { kind: "label", label: selected === undefined ? "For public operations" : menuLabel(`For ${accountLabel(snapshot, selected, browsers)}`, 48) },
    { kind: "action", id: "account:public", label: "Use public operations", state: snapshot.accountId === null ? "on" : "off", enabled, tooltip: "Choose an account under Accounts for its private operations" },
  ];
  if (!snapshot.policy.managed) {
    rows.push({ kind: "action", id: "permission:enable", label: "Turn on operation permissions", subtitle: "Operations then wait until you choose Allow or Ask", symbol: "action.permission", enabled });
  }
  const editable = snapshot.capabilities.filter((capability) => capability.permission !== "unavailable");
  for (const capability of editable.slice(0, MENU_BOUNDS.permissions)) {
    const coordinates = `${capability.adapterId}:${capability.operationId}`;
    const on = (decision: string): "on" | "off" => capability.permission === decision ? "on" : "off";
    const editableNow = enabled && snapshot.policy.managed;
    rows.push(
      { kind: "label", label: menuLabel(humanize(capability.operationId), 48), subtitle: menuLabel(`${siteName(capability.surface)} · ${capability.effect} · ${capability.risk} risk`, 80) },
      { kind: "action", id: `permission:allow:${coordinates}`, label: "Allow", state: on("allow"), enabled: editableNow },
      { kind: "action", id: `permission:ask:${coordinates}`, label: "Ask each time", state: on("ask"), enabled: editableNow },
      { kind: "action", id: `permission:deny:${coordinates}`, label: "Deny", state: on("deny"), enabled: editableNow },
    );
  }
  const more = editable.length - MENU_BOUNDS.permissions;
  if (more > 0) rows.push({ kind: "label", label: plural(more, "more operation", "more operations"), subtitle: "Review them all in the Ghostget TUI" });
  if (editable.length === 0) rows.push({ kind: "label", label: "No operations to set here" });
  return rows;
}

export type PendingActivation = Extract<ControlRequest, { action: "interface.activate" }>;
function activationRows(snapshot: ControlSnapshot, enabled: boolean, pending: PendingActivation | null): MenuItemV2[] {
  if (pending !== null) {
    const entry = snapshot.interfaces.find((item) => item.id === pending.id);
    return [
      { kind: "label", label: menuLabel(`Activate ${entry?.title ?? "this interface"}?`, 48), subtitle: menuLabel(`Uses the reviewed draft for ${pending.adapterId}`, 80) },
      { kind: "action", id: "interface:confirm", label: "Activate", symbol: "item.approval", enabled },
      { kind: "action", id: "interface:cancel", label: "Cancel activation", enabled },
    ];
  }
  const rows: MenuItemV2[] = [];
  for (const entry of snapshot.interfaces) {
    for (const target of entry.activationTargets) {
      if (rows.length >= MENU_BOUNDS.interfaceReviews) break;
      rows.push({ kind: "action", id: `interface:review:${entry.id}:${target.adapterId}`, label: menuLabel(`Review ${entry.title}`, 48), subtitle: menuLabel(`Activate it for ${target.adapterId}`, 80), enabled });
    }
  }
  return rows;
}

function hostOf(origin: string | null): string {
  if (origin === null) return "request";
  try { return new URL(origin).host || "request"; } catch { return "request"; }
}

function webRows(snapshot: ControlSnapshot): MenuItemV2[] {
  const rows: MenuItemV2[] = [{ kind: "label", label: snapshot.web.gatewayOnly ? "Only through the gateway" : "Direct reads allowed" }];
  for (const rule of snapshot.web.rules.slice(0, MENU_BOUNDS.webRules)) {
    rows.push({ kind: "label", label: menuLabel(hostOf(rule.origin), 48), subtitle: `${humanize(rule.decision)}${rule.path.value === "/" && rule.path.kind === "prefix" ? "" : " · some paths"}` });
  }
  const more = snapshot.web.rules.length - MENU_BOUNDS.webRules;
  if (more > 0) rows.push({ kind: "label", label: plural(more, "more rule", "more rules") });
  return rows;
}

function interfaceRows(snapshot: ControlSnapshot): MenuItemV2[] {
  if (snapshot.interfaces.length === 0) return [{ kind: "label", label: "No interfaces installed" }];
  const rows: MenuItemV2[] = snapshot.interfaces.slice(0, MENU_BOUNDS.interfaces).map((entry) => ({
    kind: "label", label: menuLabel(entry.title, 48) || "Interface",
    subtitle: menuLabel(`${humanize(entry.state)} · ${plural(entry.operationCount, "operation", "operations")}${entry.issues.length > 0 ? ` · ${plural(entry.issues.length, "issue", "issues")}` : ""}`, 80),
  }));
  const more = snapshot.interfaces.length - MENU_BOUNDS.interfaces;
  if (more > 0) rows.push({ kind: "label", label: plural(more, "more interface", "more interfaces") });
  return rows;
}

function activityRows(rows: readonly ActivityRow[]): MenuItemV2[] {
  if (rows.length === 0) return [{ kind: "label", label: "No recent reads" }];
  return rows.slice(0, MENU_BOUNDS.activity).map((row) => ({
    kind: "label" as const,
    label: menuLabel(hostOf(row.origin), 48),
    subtitle: `${humanize(row.outcome)}${row.httpStatus === null ? "" : ` · ${row.httpStatus}`}`,
  }));
}

function permissionsMenu(snapshot: ControlSnapshot, enabled: boolean, browsers: readonly BrowserChoice[]): MenuItemV2 {
  return { kind: "submenu", label: "Permissions", symbol: "action.permission", items: permissionRows(snapshot, enabled, browsers) };
}

function advancedMenu(snapshot: ControlSnapshot, enabled: boolean, activity: readonly ActivityRow[], pending: PendingActivation | null, browsers: readonly BrowserChoice[]): MenuItemV2 {
  const disconnects: MenuItemV2[] = snapshot.accounts.slice(0, MENU_BOUNDS.disconnects).map((account) => ({
    kind: "action", id: `disconnect:${account.id}`, label: menuLabel(`Disconnect ${accountLabel(snapshot, account, browsers)}`, 48), ...(accountName(account.id) === null ? {} : { subtitle: accountName(account.id)! }), role: "destructive", symbol: "action.signOut", enabled,
  }));
  const tools: MenuItemV2[] = [
    { kind: "action", id: "refresh", label: "Refresh", symbol: "action.refresh", shortcut: "CmdOrCtrl+R" },
    { kind: "action", id: "clip:0", label: "Copy CLI help command", symbol: "action.copy" },
    ...(snapshot.vault.available ? [{ kind: "action" as const, id: "clip:3", label: "Copy 1Password import command", symbol: "action.copy" as const, tooltip: "Imports one X token from 1Password into a private local copy" }] : []),
  ];
  return {
    kind: "submenu",
    label: "Advanced",
    symbol: "action.settings",
    items: separated([
      activationRows(snapshot, enabled, pending),
      [
        { kind: "submenu", label: `Web rules (${snapshot.web.rules.length})`, items: webRows(snapshot) },
        { kind: "submenu", label: `Interfaces (${snapshot.interfaces.length})`, items: interfaceRows(snapshot) },
        { kind: "submenu", label: "Recent reads", items: activityRows(activity) },
      ],
      tools,
      disconnects,
    ]),
  };
}

const MARK: StatusMark = Object.freeze({ symbol: "mark.masks", letters: "Gg", accessibilityLabel: "Ghostget" });
const PRIMARY: ActionItemV2 = Object.freeze({ kind: "action", id: "open-website", label: "Open Ghostget", symbol: "action.open", opens: "browser", shortcut: "CmdOrCtrl+O", role: "primary" });
/** The one "Help & support" row (support-foundation's shape), with diagnostics behind ⌥. */
const HELP: ActionItemV2 = Object.freeze({ kind: "action", id: "support:open", label: "Help & support", symbol: "action.support", opens: "browser", alternate: { id: "support:diagnostics", label: "Copy diagnostics", symbol: "action.copy" } } as const);

export interface MenuStatus {
  readonly confirmedAgeSeconds: number | null;
  readonly fresh: boolean;
  readonly detail?: string | undefined;
}

/** Map one control snapshot onto menu kit v2. The helper stays the authority;
 * rows are display-only except the bounded actions below. */
export function snapshotMenu(
  snapshot: ControlSnapshot | null,
  attempts: ReadonlyMap<string, Attempt>,
  status: MenuStatus,
  options: {
    readonly activity?: readonly ActivityRow[];
    readonly outputs?: OutputsView;
    readonly notice?: string | null;
    readonly pendingActivation?: PendingActivation | null;
    readonly platform?: NodeJS.Platform;
    readonly browsers?: readonly BrowserChoice[];
    readonly safari?: SafariAccess;
    readonly nowMs?: number;
  } = {},
): MenuModel<MenuItemV2> {
  const platform = options.platform ?? process.platform;
  const browsers = options.browsers ?? DEFAULT_BROWSER_CHOICES;
  const nowMs = options.nowMs ?? Date.now();
  const outputs = options.outputs ?? EMPTY_OUTPUTS;
  const notice: StatusItemV2[] = options.notice == null ? [] : [{ kind: "status", symbol: "status.ok", label: menuLabel(options.notice, 48) }];
  const tail: MenuItemV2[] = [
    { kind: "separator" },
    openAtLoginItem(),
    { kind: "separator" },
    HELP,
    { kind: "quit", label: "Quit Ghostget" },
  ];
  const outputsMenu: MenuItemV2 = { kind: "submenu", label: outputs.entries.length === 0 ? "Outputs" : `Outputs (${outputs.entries.length})`, symbol: "action.folder", items: outputItems(outputs, nowMs) };
  if (snapshot === null) {
    return {
      items: [
        { kind: "header", label: "Ghostget" },
        { kind: "status", symbol: "status.offline", label: "Ghostget controls are paused", detail: "Close the Ghostget TUI, then choose Refresh" },
        ...notice,
        { kind: "separator" },
        PRIMARY,
        { kind: "separator" },
        outputsMenu,
        { kind: "action", id: "refresh", label: "Refresh", symbol: "action.refresh", shortcut: "CmdOrCtrl+R" },
        ...tail,
      ],
      mark: { ...MARK, tone: "offline" },
      tooltip: "Ghostget · controls paused",
    };
  }
  const confirmed = status.fresh;
  const pending = snapshot.approvals.length;
  const reconnect = snapshot.accounts.filter((account) => account.status === "reconnect-required").length;
  const needs = [
    ...(pending > 0 ? [`${plural(pending, "approval", "approvals")} waiting`] : []),
    ...(reconnect > 0 ? [`${plural(reconnect, "account needs", "accounts need")} reconnecting`] : []),
  ];
  const age = status.confirmedAgeSeconds ?? 0;
  const stale = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)} min ago`;
  const primaryStatus: StatusItemV2 = !confirmed
    ? { kind: "status", symbol: "status.syncing", label: "Reconnecting to Ghostget controls", detail: status.confirmedAgeSeconds === null ? "Not confirmed yet" : `Last confirmed ${stale}` }
    : needs.length > 0
      ? { kind: "status", symbol: "status.attention", label: menuLabel(needs[0]!, 48), ...(needs.length > 1 ? { detail: menuLabel(needs.slice(1).join(" · "), 80) } : {}) }
      : snapshot.accounts.length === 0
        ? { kind: "status", symbol: "status.idle", label: "No accounts connected", detail: "Public pages work without one" }
        : { kind: "status", symbol: "status.running", label: menuLabel(`Ready · ${plural(snapshot.accounts.length, "account", "accounts")}`, 48) };
  const items: MenuItemV2[] = [
    { kind: "header", label: "Ghostget" },
    primaryStatus,
    ...notice,
    { kind: "separator" },
    PRIMARY,
    { kind: "separator" },
    ...(pending > 0 ? [{ kind: "submenu" as const, label: `Approvals (${pending})`, symbol: "item.approval" as const, items: approvalItems(snapshot, confirmed, browsers, nowMs) }] : []),
    accountsMenu(snapshot, attempts, confirmed, platform, browsers, options.safari ?? "ok"),
    outputsMenu,
    permissionsMenu(snapshot, confirmed, browsers),
    advancedMenu(snapshot, confirmed, options.activity ?? [], options.pendingActivation ?? null, browsers),
    ...tail,
  ];
  const attention = needs.length > 0;
  return {
    items,
    mark: attention
      ? { ...MARK, tone: "attention", ...(pending > 0 ? { text: pending > 99 ? "99+" : String(pending) } : {}) }
      : confirmed ? MARK : { ...MARK, tone: "offline" },
    tooltip: attention ? `Ghostget · ${needs.join(" · ")}` : "Ghostget · accounts, approvals and outputs",
  };
}

/** Plain words for a failed control request. Codes stay on the error for
 * tests and diagnostics; the menu shows only the message and one next step. */
export class GhostgetMenuError extends MenuActionError {
  constructor(readonly code: string, message: string, detail?: string) {
    super(message, detail);
    this.name = "GhostgetMenuError";
  }
}

const ACTION_ERRORS: Readonly<Record<string, readonly [string, string]>> = {
  CONTROL_UNCONFIRMED: ["That menu is out of date", "Open the menu again, then try again"],
  CONTROL_DISCONNECTED: ["Ghostget controls stopped responding", "Choose Refresh, then try again"],
  CONTROL_TIMEOUT: ["Ghostget controls didn't answer in time", "Choose Refresh, then try again"],
  CONTROL_CLOSED: ["Ghostget controls are closed", "Quit and open the menu again"],
  ACCOUNT_CHANGED: ["That account changed", "Open the menu again, then try again"],
  ACCOUNT_UNAVAILABLE: ["That account is gone", "Open the menu again"],
  CONNECTION_EXPIRED: ["That sign-in expired", "Start the connection again"],
  CONNECTION_LIMIT: ["Too many sign-ins in progress", "Finish or cancel one first"],
  CONNECTION_BUSY: ["Still checking that sign-in", "Wait a moment, then try again"],
  CONNECTION_UNSUPPORTED: ["That site can't be connected here", "Open its setup guide for other ways"],
  CONNECTION_PLATFORM_UNSUPPORTED: ["Browser sign-in works on macOS only", "Open the site's setup guide instead"],
  BROWSER_UNAVAILABLE: ["Couldn't open that browser", "Check that it's installed, then try again"],
  PROFILE_UNSUPPORTED: ["Couldn't use that browser profile", "Choose another profile"],
  SIGN_IN_UNVERIFIED: ["Couldn't verify the sign-in", "Finish signing in in the browser, then try again"],
  KEYCHAIN_DENIED: ["macOS didn't allow the keychain request", "Try again and choose Always Allow when macOS asks"],
  KEYCHAIN_UNAVAILABLE: ["Couldn't read the keychain", "Unlock your login keychain, then try again"],
  FDA_DENIED: ["Safari needs Full Disk Access", "Turn it on in Privacy & Security, then try again"],
  APPROVAL_REQUIRES_FULL_REVIEW: ["This request is too long to review here", "Review it in the Ghostget TUI"],
  REVISION_CONFLICT: ["Settings changed somewhere else", "Open the menu again to see them"],
  STALE_REVISION: ["Settings changed somewhere else", "Open the menu again to see them"],
};

export function menuActionError(code: string): GhostgetMenuError {
  const known = Object.hasOwn(ACTION_ERRORS, code) ? ACTION_ERRORS[code] : undefined;
  return known === undefined
    ? new GhostgetMenuError(code, "Couldn't finish that", "Try again in a moment")
    : new GhostgetMenuError(code, known[0], known[1]);
}

/** Starts at login through the local Ghostget app only when HRANESS_LOCAL_APP=1,
 * until the local app identity is checked on a clean macOS account. */
export function localApp(environment: ControlEnvironment, stateDir: string, platform: NodeJS.Platform = process.platform): AutostartApp | undefined {
  if (platform !== "darwin" || environment.HRANESS_LOCAL_APP !== "1") return undefined;
  return { name: "Ghostget", argvFile: join(stateDir, "login-argv.json") };
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
  probeSafari: () => SafariAccess = probeSafariAccess,
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
  // One list for this controller's lifetime, so a rendered action id always
  // resolves to the same browser and profile when it is dispatched.
  const browsers = browserChoices(environment);
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
  const fail = (response: ControlResponse): void => { if (!response.ok) throw menuActionError(response.code); };
  const begin = async (attemptTitle: string, providerId: string, choice: BrowserChoice, account: ControlSnapshot["accounts"][number] | null): Promise<void> => {
    const response = await request({ action: "connection.begin", id: account?.id ?? `${providerId}-${randomUUID().slice(0, 8)}`, provider: providerId, browser: choice.browser, profile: choice.profile, expectedRevision: account?.revision ?? null });
    fail(response);
    if (response.ok && response.data.kind === "connection") {
      attempts.set(response.data.attemptId, { attemptId: response.data.attemptId, title: attemptTitle, providerId, browserKey: choice.key, accountId: account?.id ?? null, status: "awaiting-sign-in", subject: null, displayName: null });
    }
  };
  const diagnostics = (): string => {
    const snapshot = lastSnapshot;
    return [
      `Ghostget ${snapshot?.version ?? "unknown"} (${platform})`,
      `Controls: ${snapshot === null ? "paused" : administrativeConfirmed ? "confirmed" : "not confirmed"}`,
      `Accounts: ${snapshot?.accounts.length ?? 0}; approvals waiting: ${snapshot?.approvals.length ?? 0}; operations: ${snapshot?.capabilities.length ?? 0}`,
      `Sign-ins in progress: ${attempts.size}`,
    ].join("\n");
  };
  return {
    dispose,
    appId: "ghostget",
    name: "Ghostget",
    mark: MARK,
    icon: TRAY_ICON,
    tooltip: "Ghostget · accounts, approvals and outputs",
    stateDir: join(ghostgetStateHome(environment), "menubar"),
    refreshMs: 5_000,
    timeoutMs: 90_000,
    degraded: () => ({ detail: "Retrying…", primary: PRIMARY }),
    snapshot: async () => {
      let fresh = false;
      administrativeConfirmed = false;
      let response = await request({ action: "snapshot", accountId: selectedAccount });
      if (!response.ok && response.code === "ACCOUNT_UNAVAILABLE" && selectedAccount !== null) {
        selectedAccount = null;
        pendingActivation = null;
        notice = "Showing public operations";
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
            notice = "Interface changed; review it again";
          }
        }
      }
      let activity: readonly ActivityRow[] = [];
      if (fresh) {
        const page = await request({ action: "activity.query", query: { search: "", method: "all", outcome: "all", origin: null, since: null, order: "newest", cursor: null, limit: 8 } });
        if (page.ok && page.data.kind === "activity") activity = page.data.page.rows;
      }
      lastOutputs = readOutputs(outputsDirectory);
      return snapshotMenu(lastSnapshot, attempts, {
        confirmedAgeSeconds: confirmedAt === null ? null : Math.max(0, Math.floor((Date.now() - confirmedAt) / 1000)),
        fresh: fresh && administrativeConfirmed,
        detail: response.ok ? undefined : response.message,
      }, {
        activity,
        outputs: lastOutputs,
        notice,
        pendingActivation,
        platform,
        browsers,
        safari: platform === "darwin" ? probeSafari() : "ok",
      });
    },
    onAction: async (id) => {
      if (id === "refresh") { notice = null; return; } // the runner re-reads state after every action
      if (id === "open-website") { await openPage(WEBSITE); return; }
      if (id.startsWith("provider:help:")) {
        const guide = connectionGuide(id.slice("provider:help:".length));
        if (guide !== undefined) await openPage(guide.url);
        return;
      }
      if (id === "support:open") {
        if (openingAccountPage) return;
        const action = SUPPORT_ACTIONS[0];
        if (action === undefined) return;
        const url = new URL(action.url);
        url.hash = "";
        openingAccountPage = true;
        notice = null;
        try { await openPage(url.href); }
        catch { throw new GhostgetMenuError("SUPPORT_UNAVAILABLE", "Couldn't open Help & support", "Try again from the menu"); }
        finally { openingAccountPage = false; }
        return;
      }
      if (id === "support:diagnostics") {
        try { copyText(diagnostics()); } catch { throw new GhostgetMenuError("CLIPBOARD_UNAVAILABLE", "Couldn't copy diagnostics", "Copying needs a clipboard tool"); }
        return;
      }
      if (id === "output:folder" || id === "output:copy-folder") {
        const expected = lastOutputs.directory;
        const fresh = (() => { try { return lstatSync(outputsDirectory, { bigint: true }); } catch { return null; } })();
        if (expected === null || fresh === null || !fresh.isDirectory() || fresh.isSymbolicLink() || fresh.dev !== expected.dev || fresh.ino !== expected.ino) {
          throw new GhostgetMenuError("OUTPUT_CHANGED", "The outputs folder changed", "Open the menu again");
        }
        if (id === "output:copy-folder") copyText(outputsDirectory);
        else openPath(outputsDirectory, false);
        return;
      }
      if (id.startsWith("output:open:") || id.startsWith("output:reveal:") || id.startsWith("output:copy:")) {
        const entry = lastOutputs.entries[Number(id.slice(id.indexOf(":", 7) + 1))];
        const path = entry === undefined ? null : validatedOutputPath(outputsDirectory, lastOutputs, entry.name);
        if (path === null) throw new GhostgetMenuError("OUTPUT_CHANGED", "That file changed or moved", "Open the menu again");
        notice = null;
        if (id.startsWith("output:copy:")) copyText(path);
        else openPath(path, id.startsWith("output:reveal:"));
        return;
      }
      if (id.startsWith("clip:")) { const command = CLI_COMMANDS[Number(id.slice(5))]; if (command !== undefined) copyText(command); return; }
      const snapshot = lastSnapshot;
      if (snapshot === null) return;
      const parts = id.split(":");
      if (parts[0] === "account" && parts[1] === "copy" && parts.length === 3) {
        if (snapshot.accounts.some((account) => account.id === parts[2])) copyText(parts[2]!);
        return;
      }
      if (id === "account:public" || parts[0] === "account" && parts[1] === "select" && parts.length === 3) {
        if (id !== "account:public" && !snapshot.accounts.some((account) => account.id === parts[2])) return;
        selectedAccount = id === "account:public" ? null : parts[2]!;
        administrativeConfirmed = false;
        pendingActivation = null;
        return;
      }
      if (id === "interface:cancel") { pendingActivation = null; return; }
      if (parts[0] === "attempt" && parts[1] === "cancel" && parts.length === 3) {
        const attempt = attempts.get(parts[2]!);
        if (attempt === undefined) return;
        attempts.delete(attempt.attemptId);
        // Failed attempts stay live in the helper until cancelled or expired,
        // so every cancel reaches it; a stale id reports CONNECTION_EXPIRED.
        await request({ action: "connection.cancel", attemptId: attempt.attemptId });
        return;
      }
      if (!administrativeConfirmed) throw menuActionError("CONTROL_UNCONFIRMED");
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
        notice = "Interface activated";
        return;
      }
      if (id === "permission:enable") { fail(await request({ action: "permission.enable", expectedRevision: snapshot.policy.revision })); return; }
      if (parts[0] === "approval" && parts.length === 3 && (parts[1] === "allow" || parts[1] === "deny")) {
        const approval = snapshot.approvals.find((item) => item.id === parts[2]);
        if (approval === undefined) return;
        if (parts[1] === "allow" && !approvalReview(approval, approvalAccount(snapshot, approval, browsers)).complete) {
          throw menuActionError("APPROVAL_REQUIRES_FULL_REVIEW");
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
        if (platform !== "darwin") throw menuActionError("CONNECTION_PLATFORM_UNSUPPORTED");
        const provider = snapshot.connectionProviders.find((item) => item.id === parts[1]);
        const choice = browsers.find((item) => item.key === parts[2]);
        if (provider === undefined || choice === undefined) return;
        await begin(provider.title, provider.id, choice, null);
        return;
      }
      if (parts[0] === "reconnect" && parts.length === 4) {
        if (platform !== "darwin") throw menuActionError("CONNECTION_PLATFORM_UNSUPPORTED");
        const account = snapshot.accounts.find((item) => item.id === parts[1]);
        const provider = snapshot.connectionProviders.find((item) => item.id === parts[2]);
        const choice = browsers.find((item) => item.key === parts[3]);
        if (account === undefined || provider === undefined || choice === undefined || !reconnectProviders(snapshot, account).some((item) => item.id === provider.id)) return;
        await begin(provider.title, provider.id, choice, account);
        return;
      }
      if (parts[0] === "attempt" && parts.length === 3) {
        const attempt = attempts.get(parts[2]!);
        if (attempt === undefined) return;
        if (parts[1] === "verify") {
          if (attempt.status === "verified") return;
          const response = await request({ action: "connection.verify", attemptId: attempt.attemptId }, 75_000);
          if (!response.ok) {
            // An expired attempt is the one failure that drops the row; the
            // helper keeps every other failed attempt re-verifiable, so the
            // row stays and this same action is the retry.
            if (response.code === "CONNECTION_EXPIRED") attempts.delete(attempt.attemptId);
            else attempts.set(attempt.attemptId, { ...attempt, status: "failed", subject: null, displayName: null });
            throw menuActionError(response.code);
          }
          if (response.data.kind === "connection" && response.data.status === "verified") attempts.set(attempt.attemptId, { ...attempt, status: "verified", subject: response.data.subject, displayName: response.data.displayName });
          return;
        }
        if (parts[1] === "commit") {
          if (attempt.status !== "verified" || attempt.subject === null) return;
          const response = await request({ action: "connection.commit", attemptId: attempt.attemptId, expectedSubject: attempt.subject });
          attempts.delete(attempt.attemptId);
          fail(response);
          notice = `Connected ${providerTitle(attempt.title)}`;
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
    output.stdout(companionHelp("Ghostget", "ghostget menubar"));
    return 0;
  }
  const verbs = rest.filter((value) => value !== "--json");
  if (verbs.length > 1 || (verbs[0] !== undefined && !["start", "stop", "status", "doctor", "install", "uninstall", "--foreground", "--background"].includes(verbs[0]))) {
    output.stderr("Usage: ghostget menubar [start|stop|status|doctor|install|uninstall] [--json]\n");
    return 1;
  }
  const mapped = rest.filter((value) => value !== "--background");
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
    // Claim the private root before the shared lifecycle creates its service
    // directory. Otherwise a first launch leaves unmarked state that the
    // independently launched control helper must reject.
    if (mapped[0] === undefined || mapped[0] === "start" || mapped[0] === "--foreground") ensurePrivateStateDirectory(adapter.stateDir, environment);
    const app = localApp(environment, adapter.stateDir);
    return await (dependencies.handle ?? handleCompanionCommand)(options, {
      args: mapped,
      foreground: { executable: process.execPath, args: [cli, "menubar", "--foreground"] },
      command: "ghostget menubar",
      env: environment,
      ...(app === undefined ? {} : { app }),
      write: (result) => output.stdout(`${JSON.stringify(result)}\n`),
      output: createCliOutput({ env: environment, stdout: { write: (text) => output.stdout(text) }, stderr: { write: (text) => output.stderr(text) } }),
    });
  } finally { await adapter.dispose(); }
}
