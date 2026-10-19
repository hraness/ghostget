import { renderSnapshot, type View } from "@hraness/desktop-foundation/tui";
import type { BrowserChoice } from "./browser-choices";
import type { OutputsView } from "./outputs";
import type { ControlSnapshot } from "./protocol";

/**
 * One read-only status model shared by `ghostget status`, `ghostget tui
 * --snapshot` and `ghostget tui --json`. It carries every state the retired
 * retired menu bar showed, so an agent or a person sees the same facts in text or JSON.
 * Nothing here performs an action; each row names the verb that does.
 */
export const STATUS_SCHEMA = "ghostget.status/1";

export type StatusHealth = "ready" | "attention" | "idle" | "reconnecting" | "paused";
export type SafariAccess = "ok" | "denied" | "missing";

/** One connection attempt the owner is holding open. */
export interface StatusAttempt {
  readonly attemptId: string;
  readonly title: string;
  readonly providerId: string;
  readonly browserKey: string;
  readonly accountId: string | null;
  readonly status: "awaiting-sign-in" | "verified" | "failed";
  readonly subject: string | null;
  readonly displayName: string | null;
}

export interface StatusNotice {
  readonly code: string;
  readonly message: string;
  readonly next: string;
}

export interface GhostgetStatus {
  readonly product: "ghostget";
  readonly version: string | null;
  readonly health: StatusHealth;
  readonly headline: string;
  readonly detail: string | null;
  readonly confirmedAgeSeconds: number | null;
  readonly accountId: string | null;
  readonly accounts: readonly { readonly id: string; readonly label: string; readonly provider: string; readonly source: string; readonly status: string; readonly current: boolean }[];
  readonly approvals: readonly { readonly id: string; readonly digest: string; readonly title: string; readonly account: string; readonly effect: string; readonly preview: string; readonly expiresAt: string }[];
  readonly attempts: readonly StatusAttempt[];
  readonly connect: { readonly available: boolean; readonly providers: readonly string[]; readonly browsers: readonly string[] };
  readonly permissions: { readonly managed: boolean; readonly revision: number; readonly allow: number; readonly ask: number; readonly deny: number };
  /** Web gateway rules, as the retired menu's Advanced section showed them. */
  readonly web: { readonly revision: number; readonly gatewayOnly: boolean; readonly rules: number } | null;
  readonly outputs: { readonly files: readonly { readonly name: string; readonly bytes: number; readonly modifiedAt: string }[]; readonly message: string | null; readonly truncated: boolean };
  readonly notices: readonly StatusNotice[];
  readonly next: readonly string[];
}

export interface StatusInputs {
  readonly snapshot: ControlSnapshot | null;
  readonly attempts?: readonly StatusAttempt[];
  /** False while the last snapshot is not confirmed by the owner. */
  readonly fresh?: boolean;
  readonly confirmedAgeSeconds?: number | null;
  readonly outputs: OutputsView;
  readonly platform: NodeJS.Platform;
  readonly browsers: readonly BrowserChoice[];
  readonly safari: SafariAccess;
  /** The code of the last failed control request, shown as a notice. */
  readonly actionError?: string | null;
}

/** Plain words and one next step for a failed control request. */
const CONTROL_ERRORS: Readonly<Record<string, readonly [string, string]>> = {
  CONTROL_UNCONFIRMED: ["That view is out of date", "ghostget status"],
  CONTROL_DISCONNECTED: ["Ghostget controls stopped responding", "ghostget control status"],
  CONTROL_TIMEOUT: ["Ghostget controls didn't answer in time", "ghostget control status"],
  CONTROL_CLOSED: ["Ghostget controls are closed", "ghostget control serve"],
  CONTROL_ALREADY_RUNNING: ["Another Ghostget control owner is open", "ghostget control status"],
  ACCOUNT_CHANGED: ["That account changed", "ghostget status"],
  ACCOUNT_UNAVAILABLE: ["That account is gone", "ghostget auth list"],
  CONNECTION_EXPIRED: ["That sign-in expired", "ghostget connections begin --help"],
  CONNECTION_LIMIT: ["Too many sign-ins in progress", "ghostget connections cancel --help"],
  CONNECTION_BUSY: ["Still checking that sign-in", "ghostget connections verify --help"],
  CONNECTION_UNSUPPORTED: ["That site can't be connected here", "ghostget connections begin --help"],
  CONNECTION_PLATFORM_UNSUPPORTED: ["Browser sign-in works on macOS only", "ghostget doctor"],
  BROWSER_UNAVAILABLE: ["Couldn't open that browser", "ghostget connections begin --help"],
  PROFILE_UNSUPPORTED: ["Couldn't use that browser profile", "ghostget connections begin --help"],
  SIGN_IN_UNVERIFIED: ["Couldn't verify the sign-in", "ghostget connections verify --help"],
  KEYCHAIN_DENIED: ["macOS didn't allow the keychain request", "Try again and choose Always Allow when macOS asks"],
  KEYCHAIN_UNAVAILABLE: ["Couldn't read the keychain", "Unlock your login keychain, then try again"],
  FDA_DENIED: ["Safari needs Full Disk Access", "Turn it on in System Settings > Privacy & Security > Full Disk Access"],
  APPROVAL_REQUIRES_FULL_REVIEW: ["This request is too long to review here", "ghostget tui"],
  REVISION_CONFLICT: ["Settings changed somewhere else", "ghostget status"],
  STALE_REVISION: ["Settings changed somewhere else", "ghostget status"],
};

export function controlErrorNotice(code: string): StatusNotice {
  const known = Object.hasOwn(CONTROL_ERRORS, code) ? CONTROL_ERRORS[code] : undefined;
  return known === undefined
    ? { code, message: "Couldn't finish that", next: "Try again in a moment" }
    : { code, message: known[0], next: known[1] };
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

function accountLabel(account: ControlSnapshot["accounts"][number], browsers: readonly BrowserChoice[]): string {
  const browser = browsers.find((choice) => choice.browser === account.source && (choice.profile === account.profile || choice.browser === "safari"));
  const name = account.displayName ?? account.id;
  return browser === undefined ? name : `${name} · ${browser.label}`;
}

/** Build the status model. Deterministic for the same inputs. */
export function buildStatus(inputs: StatusInputs): GhostgetStatus {
  const snapshot = inputs.snapshot;
  const attempts = inputs.attempts ?? [];
  const fresh = inputs.fresh !== false;
  const offered = inputs.browsers.filter((choice) => choice.browser !== "safari" || inputs.safari !== "denied");
  const notices: StatusNotice[] = [];
  if (inputs.actionError != null) notices.push(controlErrorNotice(inputs.actionError));
  if (inputs.safari === "denied" && inputs.browsers.some((choice) => choice.browser === "safari")) notices.push(controlErrorNotice("FDA_DENIED"));
  if (inputs.platform !== "darwin") notices.push({ code: "CONNECTION_PLATFORM_UNSUPPORTED", message: "Browser sign-in works on macOS", next: "ghostget doctor" });
  const outputs = {
    files: inputs.outputs.entries.map((entry) => ({ name: entry.name, bytes: entry.size, modifiedAt: new Date(entry.modifiedMs).toISOString() })),
    message: inputs.outputs.message,
    truncated: inputs.outputs.truncated,
  };
  if (snapshot === null) {
    return {
      product: "ghostget", version: null, health: "paused", headline: "Ghostget controls are paused",
      detail: "Another Ghostget control owner holds this state home, or none answered", confirmedAgeSeconds: null,
      accountId: null, accounts: [], approvals: [], attempts: [...attempts],
      connect: { available: false, providers: [], browsers: [] },
      permissions: { managed: false, revision: 0, allow: 0, ask: 0, deny: 0 }, web: null,
      outputs, notices, next: ["ghostget control status", "ghostget status"],
    };
  }
  const pending = snapshot.approvals.length;
  const reconnect = snapshot.accounts.filter((account) => account.status === "reconnect-required").length;
  const needs = [
    ...(pending > 0 ? [`${plural(pending, "approval", "approvals")} waiting`] : []),
    ...(reconnect > 0 ? [`${plural(reconnect, "account needs", "accounts need")} reconnecting`] : []),
  ];
  const age = inputs.confirmedAgeSeconds ?? null;
  const [health, headline, detail]: readonly [StatusHealth, string, string | null] = !fresh
    ? ["reconnecting", "Reconnecting to Ghostget controls", age === null ? "Not confirmed yet" : `Last confirmed ${age < 60 ? `${age}s ago` : `${Math.floor(age / 60)} min ago`}`]
    : needs.length > 0
      ? ["attention", needs[0]!, needs.length > 1 ? needs.slice(1).join(" · ") : null]
      : snapshot.accounts.length === 0
        ? ["idle", "No accounts connected", "Public pages work without one"]
        : ["ready", `Ready · ${plural(snapshot.accounts.length, "account", "accounts")}`, null];
  const count = (decision: string): number => snapshot.capabilities.filter((capability) => capability.permission === decision).length;
  const next = [
    ...(pending > 0 ? ["ghostget approvals list"] : []),
    ...(reconnect > 0 ? ["ghostget auth list"] : []),
    ...(!snapshot.policy.managed ? ["ghostget permissions enable --help"] : []),
    "ghostget read https://example.com",
    "ghostget commands --json",
  ];
  return {
    product: "ghostget", version: snapshot.version, health, headline, detail, confirmedAgeSeconds: fresh ? 0 : age,
    accountId: snapshot.accountId,
    accounts: snapshot.accounts.map((account) => ({ id: account.id, label: accountLabel(account, inputs.browsers), provider: account.provider ?? account.kind, source: account.source ?? "unknown", status: account.status, current: account.id === snapshot.accountId })),
    approvals: snapshot.approvals.map((approval) => ({ id: approval.id, digest: approval.digest, title: approval.title, account: approval.account ?? "public", effect: approval.effect, preview: approval.preview ?? "", expiresAt: approval.expiresAt })),
    attempts: [...attempts],
    connect: {
      available: inputs.platform === "darwin" && snapshot.connectionProviders.length > 0,
      providers: snapshot.connectionProviders.map((provider) => provider.id),
      browsers: inputs.platform === "darwin" ? offered.map((choice) => choice.key) : [],
    },
    permissions: { managed: snapshot.policy.managed, revision: snapshot.policy.revision, allow: count("allow"), ask: count("ask"), deny: count("deny") },
    web: { revision: snapshot.web.revision, gatewayOnly: snapshot.web.gatewayOnly, rules: snapshot.web.rules.length },
    outputs, notices, next,
  };
}

function ago(iso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
}

function expires(iso: string, nowMs: number): string {
  const minutes = Math.ceil((Date.parse(iso) - nowMs) / 60_000);
  return minutes <= 0 ? "expired" : minutes === 1 ? "expires in 1 min" : `expires in ${minutes} min`;
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The status views, in order. `nowMs` only affects relative times. */
export function statusViews(nowMs: number): readonly View<GhostgetStatus>[] {
  return [
    { id: "overview", title: "Ghostget", render: (s) => [
      `${s.headline}${s.version === null ? "" : ` · v${s.version}`}`,
      ...(s.detail === null ? [] : [s.detail]),
      `Account: ${s.accountId ?? "none (public scope)"}`,
      ...s.notices.map((notice) => `! ${notice.message}. ${notice.next}`),
    ] },
    { id: "approvals", title: "Approvals", render: (s) => s.approvals.length === 0
      ? ["No approvals waiting"]
      : s.approvals.flatMap((approval) => [
        `${approval.title} · ${approval.effect} · ${approval.account}`,
        `  ${expires(approval.expiresAt, nowMs)} · ghostget approvals show ${approval.id}`,
      ]) },
    { id: "accounts", title: "Accounts", render: (s) => [
      ...(s.accounts.length === 0 ? ["No accounts connected"] : s.accounts.map((account) => `${account.current ? "*" : "-"} ${account.label} · ${account.provider} · ${account.status}`)),
      ...s.attempts.map((attempt) => `~ ${attempt.title} · ${attempt.browserKey} · ${attempt.status}${attempt.displayName === null ? "" : ` · ${attempt.displayName}`}`),
      ...(s.connect.available
        ? [`Connect: ${s.connect.providers.join(", ")}`, `  from ${s.connect.browsers.join(", ")}`]
        : ["Connect: browser sign-in unavailable here"]),
    ] },
    { id: "permissions", title: "Permissions", render: (s) => [
      `Managed: ${s.permissions.managed ? "on" : "off"} · revision ${s.permissions.revision}`,
      `allow ${s.permissions.allow} · ask ${s.permissions.ask} · deny ${s.permissions.deny}`,
      ...(s.web?.gatewayOnly === true ? [`Web gateway: gateway-only · ${plural(s.web.rules, "rule", "rules")}`] : []),
    ] },
    { id: "outputs", title: "Outputs", render: (s) => s.outputs.files.length === 0
      ? [s.outputs.message ?? "No output files"]
      : [...s.outputs.files.map((file) => `${file.name} · ${size(file.bytes)} · ${ago(file.modifiedAt, nowMs)}`), ...(s.outputs.truncated ? ["More files: ghostget outputs list --json"] : [])] },
    { id: "next", title: "Next", render: (s) => [...s.next] },
  ];
}

/** Plain text for `ghostget status` and `ghostget tui --snapshot`. */
export function renderStatus(status: GhostgetStatus, width: number, nowMs: number = Date.now()): string {
  return renderSnapshot(statusViews(nowMs), status, width);
}
