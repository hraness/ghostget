import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { countMenuNodes, MENU_NODE_BUDGET, validateSnapshotV2, type MenuItemV2, type MenuModel, type SnapshotV2 } from "@hraness/desktop-foundation";
import { ghostgetStateHome, installManifest } from "../storage";
import { createAuth, saveAuth } from "../auth";
import type { GhostgetManifest } from "../model";
import { providerPluginRegistry as registry } from "../provider-plugins";
import { readOperationPolicy } from "../operation-permission-store";
import { companionOptions as createCompanionOptions, localApp, menuActionError, MENU_BOUNDS, menuLabel, readOutputs, runMenubarCommand, snapshotMenu, type Attempt, type OutputsView } from "./menubar-cli";
import type { ActivityRow, ControlRequest, ControlResponse, ControlSnapshot } from "./protocol";
import { MAX_BROWSER_CHOICES, type BrowserChoice } from "./browser-choices";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function companionOptions(...args: Parameters<typeof createCompanionOptions>) {
  const options = createCompanionOptions(...args);
  cleanups.push(options.dispose);
  return options;
}
function fixture() {
  const raw = mkdtempSync("/tmp/ghostget-menu-"); chmodSync(raw, 0o700);
  cleanups.push(async () => { rmSync(raw, { recursive: true, force: true }); });
  const environment = { GHOSTGET_STATE_HOME: raw, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: process.env.HOME ?? "", USER: process.env.USER ?? "", LOGNAME: process.env.LOGNAME ?? "", TMPDIR: "/tmp" };
  ghostgetStateHome(environment);
  return { environment };
}

type Result = readonly MenuItemV2[] | MenuModel<MenuItemV2> | MenuModel;
function itemsOf(result: Result): readonly MenuItemV2[] {
  return (Array.isArray(result) ? result : (result as MenuModel).items) as readonly MenuItemV2[];
}
export function frame(result: Result): SnapshotV2 {
  const model: MenuModel<MenuItemV2> = Array.isArray(result) ? { items: result as readonly MenuItemV2[] } : result as MenuModel<MenuItemV2>;
  return { version: 2, type: "snapshot", appId: "ghostget", name: "Ghostget", mark: model.mark ?? { symbol: "mark.masks", letters: "Gg" }, revision: 1, items: itemsOf(result), ...(model.tooltip === undefined ? {} : { tooltip: model.tooltip }) };
}
/** The produced items must satisfy the shared runner's v2 wire contract. */
function wire(result: Result): ReadonlyMap<string, boolean> {
  return validateSnapshotV2(frame(result));
}
function labels(result: Result): string[] {
  const walk = (items: readonly MenuItemV2[]): string[] => items.flatMap((item) => item.kind === "separator" || item.kind === "quit" && false ? [] : item.kind === "submenu" ? [item.label, ...walk(item.items)] : "label" in item ? [item.label, ...("subtitle" in item && item.subtitle !== undefined ? [item.subtitle] : []), ...("detail" in item && item.detail !== undefined ? [item.detail] : []), ...(item.kind === "action" && item.alternate !== undefined ? [item.alternate.label] : [])] : []);
  return walk(itemsOf(result));
}
function actionIds(result: Result): string[] {
  const walk = (items: readonly MenuItemV2[]): string[] => items.flatMap((item) => item.kind === "action" ? [item.id, ...(item.alternate === undefined ? [] : [item.alternate.id])] : item.kind === "submenu" ? walk(item.items) : []);
  return walk(itemsOf(result));
}
function depthOf(result: Result, id: string): number {
  const walk = (items: readonly MenuItemV2[], depth: number): number => {
    for (const item of items) {
      if (item.kind === "action" && item.id === id) return depth;
      if (item.kind === "submenu") { const found = walk(item.items, depth + 1); if (found > 0) return found; }
    }
    return 0;
  };
  return walk(itemsOf(result), 1);
}
const account = (overrides: Partial<ControlSnapshot["accounts"][number]> = {}): ControlSnapshot["accounts"][number] => ({
  id: "x-main", provider: "x", kind: "cookie-source", subject: "1234567890", displayName: null, revision: "a".repeat(64), status: "configured", source: "chrome", profile: "Default", tokenStorage: null, tokenExpiresAt: null, tokenRefreshable: false, ...overrides,
});
export function base(overrides: Partial<ControlSnapshot> = {}): ControlSnapshot {
  return {
    version: "0.18.12",
    accountId: null,
    accounts: [],
    capabilities: [],
    interfaces: [],
    policy: { managed: false, revision: 3 },
    web: { revision: 1, gatewayOnly: false, rules: [] },
    approvals: [],
    connectionProviders: [{ id: "x-web", title: "X · browser session" }],
    vault: { provider: "1password", available: true, purpose: "x-user-token-import" },
    ...overrides,
  };
}
const FRESH = { confirmedAgeSeconds: 0, fresh: true } as const;

describe("menu label presentation", () => {
  test("sanitizes control, newline and bidi text before it reaches a menu row", () => {
    expect(menuLabel("a\u202Ab\nc\u0000d\u2066e")).toBe("a b c d e");
    expect(menuLabel("  spaced   out ")).toBe("spaced out");
    expect(menuLabel("\u202e\u2067\u0007")).toBe("");
  });
  test("truncates by unicode scalar values at the bound", () => {
    const result = menuLabel("x".repeat(100));
    expect([...result].length).toBe(72);
    expect(result.endsWith("…")).toBe(true);
    expect(menuLabel("emoji \ud83d\ude00 ".repeat(30), 10)).toBe("emoji \ud83d\ude00 e\u2026");
  });
});

describe("snapshot menu mapping", () => {
  test("sign-in offers the browser profiles discovery found, not a fixed list", () => {
    const discovered: readonly BrowserChoice[] = [
      { key: "safari", label: "Safari", browser: "safari", profile: null },
      { key: "chrome-profile-9", label: "Chrome \u00b7 Your Chrome (Profile 9)", browser: "chrome", profile: "Profile 9" },
    ];
    const menu = snapshotMenu(base(), new Map(), FRESH, { platform: "darwin", browsers: discovered });
    const ids = actionIds(menu);
    expect(ids).toContain("connect:x-web:chrome-profile-9");
    expect(ids).not.toContain("connect:x-web:chrome-default");
    expect(labels(menu)).toContain("Connect X in Chrome · Your Chrome (Profile 9)");
  });

  test("top level stays at ten rows or fewer, with one status line and Quit last", () => {
    const menu = snapshotMenu(base({
      accounts: [account(), account({ id: "x-web-3fa9c1b2", status: "reconnect-required", source: "safari", profile: null })],
      approvals: [{ id: "appr-1", digest: "c".repeat(64), kind: "web", title: "Fetch docs page", account: null, effect: "retrieval", preview: "GET https://docs.example.com", expiresAt: "2026-09-16T00:00:00Z" }],
    }), new Map(), FRESH, { platform: "darwin" });
    wire(menu);
    const top = itemsOf(menu).filter((item) => item.kind !== "separator" && item.kind !== "header");
    expect(top.length).toBeLessThanOrEqual(10);
    expect(itemsOf(menu).filter((item) => item.kind === "status")).toHaveLength(1);
    expect(itemsOf(menu).at(-1)).toEqual({ kind: "quit", label: "Quit Ghostget" });
    expect(itemsOf(menu).find((item) => item.kind === "status")).toMatchObject({ label: "1 approval waiting", detail: "1 account needs reconnecting" });
    expect((menu as MenuModel).mark).toMatchObject({ tone: "attention", text: "1" });
  });

  test("Reconnect is one row one level deep, in the browser the account was saved from", () => {
    const menu = snapshotMenu(base({ accounts: [account({ status: "reconnect-required" })] }), new Map(), FRESH, { platform: "darwin" });
    expect(depthOf(menu, "reconnect:x-main:x-web:chrome-default")).toBe(2);
    expect(labels(menu)).toContain("Reconnect in Chrome · Default");
  });

  test("accounts show the provider and where the sign-in lives, never the numeric subject or a generated ID", () => {
    const menu = snapshotMenu(base({ accounts: [account({ id: "x-web-3fa9c1b2" }), account({ id: "x-work", source: "safari", profile: null })] }), new Map(), FRESH, { platform: "darwin" });
    const text = labels(menu).join("\n");
    expect(text).not.toContain("1234567890");
    expect(text).not.toContain("x-web-3fa9c1b2");
    expect(labels(menu)).toContain("X · Chrome · Default");
    expect(labels(menu)).toContain("Saved · x-work");
    expect(actionIds(menu)).toContain("account:copy:x-web-3fa9c1b2");
  });

  test("renders in-flight connection attempts with verify, commit, retry-verify and ⌥ cancel", () => {
    const attempts = new Map<string, Attempt>([
      ["att-1", { attemptId: "att-1", title: "X · browser session", providerId: "x-web", browserKey: "chrome-default", accountId: null, status: "awaiting-sign-in", subject: null, displayName: null }],
      ["att-2", { attemptId: "att-2", title: "LinkedIn · browser session", providerId: "linkedin-web", browserKey: "safari", accountId: null, status: "verified", subject: "person-1", displayName: "person-one" }],
      ["att-3", { attemptId: "att-3", title: "Reddit · browser session", providerId: "reddit-web", browserKey: "safari", accountId: null, status: "failed", subject: null, displayName: null }],
    ]);
    const menu = snapshotMenu(base(), attempts, FRESH, { platform: "darwin" });
    wire(menu);
    const ids = actionIds(menu);
    for (const id of ["attempt:verify:att-1", "attempt:cancel:att-1", "attempt:commit:att-2", "attempt:cancel:att-2", "attempt:verify:att-3", "attempt:cancel:att-3"]) expect(ids).toContain(id);
    // A failed attempt re-verifies the same helper attempt; it never re-begins.
    expect(ids).not.toContain("attempt:retry:att-3");
    expect(labels(menu)).toContain("Verify Reddit sign-in again");
    // The verified row names the human handle, never the raw subject.
    expect(labels(menu).join("\n")).toContain("Signed in as person-one");
    expect(labels(menu).join("\n")).not.toContain("person-1");
  });

  test("degrades to a bounded paused menu without a control snapshot", () => {
    const menu = snapshotMenu(null, new Map(), { confirmedAgeSeconds: null, fresh: false, detail: "no helper" });
    wire(menu);
    expect(itemsOf(menu)[1]).toMatchObject({ kind: "status", label: "Ghostget controls are paused" });
    expect(actionIds(menu)).toEqual(["open-website", "refresh", "foundation.login", "support:open", "support:diagnostics"]);
    expect((menu as MenuModel).mark).toMatchObject({ tone: "offline" });
  });

  test("one Help & support row keeps diagnostics behind ⌥", () => {
    const menu = snapshotMenu(base(), new Map(), FRESH);
    const help = itemsOf(menu).find((item) => item.kind === "action" && item.id === "support:open");
    expect(help).toMatchObject({ label: "Help & support", alternate: { id: "support:diagnostics", label: "Copy diagnostics" } });
    expect(labels(menu).join("\n")).not.toMatch(/0\.18\.12|Updated \d/u);
  });

  test("configured browser accounts reconnect only from their own site, and tokens never offer it", () => {
    const accounts: ControlSnapshot["accounts"] = [
      account({ id: "x-web-123", provider: null, status: "reconnect-required" }),
      account({ id: "x-token", kind: "oauth-token-file", source: null, profile: null, tokenStorage: "ghostget-import", status: "reconnect-required" }),
      account({ id: "unknown-browser", provider: null, status: "reconnect-required" }),
    ];
    const ids = actionIds(snapshotMenu(base({ accounts, connectionProviders: [{ id: "x-web", title: "X" }, { id: "linkedin-web", title: "LinkedIn" }] }), new Map(), FRESH, { platform: "darwin" }));
    expect(ids).toContain("reconnect:x-web-123:x-web:chrome-default");
    expect(ids.some(id => id.startsWith("reconnect:x-web-123:linkedin"))).toBe(false);
    expect(ids.some(id => id.startsWith("reconnect:x-token:"))).toBe(false);
    expect(ids.some(id => id.startsWith("reconnect:unknown-browser:"))).toBe(false);
  });

  test("unconfirmed snapshots keep status but disable administrative actions", () => {
    const menu = snapshotMenu(base(), new Map(), { confirmedAgeSeconds: 9, fresh: false }, { platform: "darwin" });
    const actions = wire(menu);
    expect(actions.get("permission:enable")).toBe(false);
    expect(actions.get("connect:x-web:safari")).toBe(false);
    expect(actions.get("refresh")).toBe(true);
    expect(itemsOf(menu).find((item) => item.kind === "status")).toMatchObject({ label: "Reconnecting to Ghostget controls", detail: "Last confirmed 9s ago" });
  });

  test("Linux offers each site's setup guide instead of browser sign-in", () => {
    const menu = snapshotMenu(base({ accounts: [account({ status: "reconnect-required" })] }), new Map(), FRESH, { platform: "linux" });
    const actions = wire(menu);
    expect(actions.has("connect:x-web:safari")).toBe(false);
    expect(actions.has("reconnect:x-main:x-web:chrome-default")).toBe(false);
    expect(actions.get("provider:help:x-web")).toBe(true);
    expect(labels(menu)).toContain("Browser sign-in works on macOS");
  });

  test("Safari without Full Disk Access is not offered, and the menu links to the setting", () => {
    const menu = snapshotMenu(base(), new Map(), FRESH, { platform: "darwin", safari: "denied" });
    const ids = actionIds(menu);
    expect(ids).not.toContain("connect:x-web:safari");
    expect(ids).toContain("connect:x-web:chrome-default");
    expect(ids).toContain("foundation.settings.full-disk-access");
    expect(labels(menu)).toContain("Safari needs Full Disk Access");
    expect(actionIds(snapshotMenu(base(), new Map(), FRESH, { platform: "darwin", safari: "ok" }))).not.toContain("foundation.settings.full-disk-access");
  });

  test("an approval with hidden or normalized content cannot be allowed from the menu", () => {
    for (const preview of ["Visible prefix ".repeat(30) + "HIDDEN TARGET", "Preserve  these spaces", "line one\nline two", "x".repeat(100)]) {
      const approval = { id: "long-review", digest: "a".repeat(64), kind: "provider" as const, title: "Review request", account: "account", effect: "write", preview, expiresAt: "2026-09-20T00:00:00Z" };
      const menu = snapshotMenu(base({ approvals: [approval] }), new Map(), FRESH);
      const actions = wire(menu);
      expect(actions.get("approval:allow:long-review")).toBe(false);
      expect(actions.get("approval:deny:long-review")).toBe(true);
      expect(labels(menu)).toContain("Too long to review here");
    }
  });

  test("a failed menu action has plain words and one next step, never a code", () => {
    for (const code of ["CONTROL_UNCONFIRMED", "SIGN_IN_UNVERIFIED", "KEYCHAIN_DENIED", "FDA_DENIED", "SOMETHING_NEW"]) {
      const error = menuActionError(code);
      expect(error.code).toBe(code);
      expect(error.message).not.toContain(code);
      expect(error.message).not.toMatch(/[_]|ghostget-/u);
      expect(error.detail).toBeTruthy();
    }
  });
});

describe("menu node budget", () => {
  test("the worst case of every bound stays under the shared node cap with room for SDK rows", () => {
    const browsers: BrowserChoice[] = [{ key: "safari", label: "Safari", browser: "safari", profile: null }, ...Array.from({ length: MAX_BROWSER_CHOICES - 1 }, (_, index) => ({ key: `chrome-profile-${index + 1}`, label: `Chrome · Profile ${index + 1}`, browser: "chrome" as const, profile: `Profile ${index + 1}` }))];
    const providers = [{ id: "x-web", title: "X · browser session" }, { id: "linkedin-web", title: "LinkedIn · browser session" }, { id: "reddit-web", title: "Reddit · browser session" }, { id: "extra-web", title: "Extra" }];
    const accounts = Array.from({ length: 40 }, (_, index) => account({ id: `x-${index}`, status: "reconnect-required", profile: `Profile ${(index % 8) + 1}` }));
    const approvals = Array.from({ length: 20 }, (_, index) => ({ id: `appr-${index}`, digest: "c".repeat(64), kind: "provider" as const, title: "Post", account: "x-1", effect: "write", preview: "word ".repeat(200), expiresAt: "2026-09-16T00:00:00Z" }));
    const capabilities = Array.from({ length: 80 }, (_, index) => ({ digest: "f".repeat(64), adapterId: `adapter-${index}`, operationId: `op-${index}`, pluginId: null, surface: "x", transport: "web-session", risk: "read", effect: "reads", state: "available" as const, executorSource: "built-in" as const, interfaceSource: "bundled" as const, permission: "ask" as const }));
    const interfaces = Array.from({ length: 20 }, (_, index) => ({ id: `if-${index}`, title: `Interface ${index}`, source: "user" as const, digest: "e".repeat(64), activeDigest: null, state: "draft" as const, operationCount: 4, adapterIds: ["x"], activationTargets: [{ adapterId: "x", installedDigest: "b".repeat(64) }, { adapterId: "y", installedDigest: "b".repeat(64) }], issues: [] }));
    const rules = Array.from({ length: 40 }, (_, index) => ({ id: `r${index}`, origin: `https://site${index}.example.com`, path: { kind: "exact" as const, value: "/a" }, methods: ["GET" as const], queryKeys: [], decision: "allow" as const, effect: "retrieval" as const, maxResponseBytes: 1024, timeoutMs: 1000 }));
    const attempts = new Map<string, Attempt>(Array.from({ length: 8 }, (_, index) => [`a${index}`, { attemptId: `a${index}`, title: "X", providerId: "x-web", browserKey: "safari", accountId: null, status: "awaiting-sign-in" as const, subject: null, displayName: null }]));
    const outputs: OutputsView = { directory: { dev: 1n, ino: 2n }, entries: Array.from({ length: 12 }, (_, index) => ({ name: `f${index}.pdf`, size: 1, modifiedMs: 0, identity: { dev: 1n, ino: BigInt(index), size: 1n, mtimeNs: 0n, mode: 0o100600n } })), message: null, truncated: true };
    const activity: ActivityRow[] = Array.from({ length: 8 }, (_, index) => ({ id: `act-${index}`, sequence: index, startedAt: "2026-09-16T00:00:00Z", finishedAt: null, durationMs: null, method: "GET", origin: "https://example.com", ruleId: null, endpoint: null, decision: "allow", outcome: "succeeded", httpStatus: 200, responseBytes: 1, errorCode: null }));
    const menu = snapshotMenu(base({ accounts, approvals, capabilities, interfaces, connectionProviders: providers, policy: { managed: true, revision: 1 }, web: { revision: 1, gatewayOnly: true, rules }, accountId: "x-1" }), attempts, FRESH, { platform: "darwin", browsers, outputs, activity, safari: "denied", notice: "Connected X" });
    wire(menu);
    const nodes = countMenuNodes(itemsOf(menu));
    expect(nodes).toBeGreaterThan(150); // the fixture really is the worst case
    // The SDK adds one ⚠︎ row and may add its own Open at login handling.
    expect(nodes + 4).toBeLessThan(MENU_NODE_BUDGET);
    // A bound raised without this test failing first would freeze the menu.
    expect(MENU_BOUNDS.accounts * 2 + MENU_BOUNDS.providers * MAX_BROWSER_CHOICES + MENU_BOUNDS.attempts + 4).toBeLessThan(MENU_NODE_BUDGET / 2);
  });
});

describe("outputs menu", () => {
  const entry = (name: string, mtimeNs: bigint): OutputsView["entries"][number] => ({
    name, size: 128, modifiedMs: 1000,
    identity: { dev: 1n, ino: 2n, size: 128n, mtimeNs, mode: 0o100600n },
  });
  const view = (entries: OutputsView["entries"], extra: Partial<OutputsView> = {}): OutputsView => ({
    directory: { dev: 1n, ino: 9n }, entries, message: entries.length === 0 ? "No output files" : null, truncated: false, ...extra,
  });
  test("lists bounded output files with open, ⌥ reveal and copy actions", () => {
    const menu = snapshotMenu(base(), new Map(), FRESH, { outputs: view([entry("report.pdf", 3n), entry("data.bin", 2n)]) });
    wire(menu);
    const ids = actionIds(menu);
    expect(labels(menu)).toContain("Outputs (2)");
    expect(labels(menu)).toContain("report.pdf");
    expect(ids).toContain("output:open:0");
    expect(ids).toContain("output:reveal:0");
    expect(ids).toContain("output:folder");
    // A non-openable extension reveals in Finder and keeps its path copy behind ⌥.
    expect(ids).not.toContain("output:open:1");
    expect(ids).toContain("output:reveal:1");
    expect(ids).toContain("output:copy:1");
  });
  test("sanitizes hostile file names while keeping wire-safe action ids", () => {
    const menu = snapshotMenu(base(), new Map(), FRESH, { outputs: view([entry("bad\nname.pdf", 3n)]) });
    wire(menu);
    expect(labels(menu)).toContain("bad name.pdf");
    expect(actionIds(menu).filter((id) => id.startsWith("output:")).sort()).toEqual(["output:copy-folder", "output:folder", "output:open:0", "output:reveal:0"]);
  });
  test("readOutputs filters unsafe entries and orders newest first", () => {
    const raw = mkdtempSync("/tmp/ghostget-outs-"); chmodSync(raw, 0o700);
    cleanups.push(async () => { rmSync(raw, { recursive: true, force: true }); });
    const dir = join(raw, "outputs"); mkdirSync(dir, { mode: 0o700 });
    writeFileSync(join(dir, "older.txt"), "a", { mode: 0o600 });
    writeFileSync(join(dir, "newer.txt"), "b", { mode: 0o600 });
    writeFileSync(join(dir, ".hidden"), "h", { mode: 0o600 });
    writeFileSync(join(dir, "group.txt"), "g", { mode: 0o600 });
    chmodSync(join(dir, "group.txt"), 0o620);
    symlinkSync(join(dir, "older.txt"), join(dir, "link.txt"));
    utimesSync(join(dir, "older.txt"), new Date(1000), new Date(1000));
    utimesSync(join(dir, "newer.txt"), new Date(2000), new Date(2000));
    const outputs = readOutputs(dir);
    expect(outputs.entries.map((item) => item.name)).toEqual(["newer.txt", "older.txt"]);
    expect(outputs.directory).not.toBeNull();
    expect(readOutputs(join(raw, "missing"))).toMatchObject({ message: "No outputs yet" });
    chmodSync(dir, 0o755);
    expect(readOutputs(dir).message).toBe("No outputs yet");
  });
});

describe("helper-backed companion options", () => {
  test("the status mark is a monochrome symbol with bundled tray art for v1 runners", () => {
    const { environment } = fixture();
    const options = companionOptions(environment);
    expect(options.mark).toMatchObject({ symbol: "mark.masks", letters: "Gg" });
    expect(options.title).toBeUndefined();
    expect(options.icon).toEqual({ width: 32, height: 32, rgba: expect.any(String) });
    expect(Buffer.from(options.icon!.rgba, "base64")).toHaveLength(32 * 32 * 4);
  });
  test("snapshot maps a live helper response and marks it fresh", async () => {
    const { environment } = fixture();
    const options = companionOptions(environment, undefined, undefined, "darwin", () => "ok");
    const menu = await options.snapshot(new AbortController().signal);
    wire(menu);
    expect(labels(menu)).toContain("No accounts connected");
    expect(labels(menu)).toContain("Turn on operation permissions");
  });
  test("permission.enable applies one revision-checked mutation through the real helper", async () => {
    const { environment } = fixture();
    const options = companionOptions(environment, undefined, undefined, "darwin", () => "ok");
    const signal = new AbortController().signal;
    await options.snapshot(signal);
    await options.onAction("permission:enable", signal);
    const menu = await options.snapshot(signal);
    expect(labels(menu)).not.toContain("Turn on operation permissions");
  });
  test("a real private account can be selected and permissions remain editable after opt-in and a grant", async () => {
    const { environment } = fixture();
    const manifest = JSON.parse(readFileSync(new URL("../assets/adapters/x/wrench-adapter.json", import.meta.url), "utf8")) as GhostgetManifest;
    installManifest(manifest, { force: false, environment, registry });
    saveAuth(createAuth("selected-account", { oauthProvider: "x", tokenFile: join(environment.GHOSTGET_STATE_HOME, "synthetic-token.json"), scopes: ["tweet.read", "users.read"], subject: "12345" }), environment);
    const options = companionOptions(environment, undefined, undefined, "darwin", () => "ok");
    const signal = new AbortController().signal;
    const publicItems = await options.snapshot(signal);
    expect(actionIds(publicItems)).not.toContain("permission:allow:x:posts.read");
    await options.onAction("account:select:selected-account", signal);
    const selected = await options.snapshot(signal);
    expect(labels(selected)).toContain("For X · Access token");
    expect(wire(selected).get("permission:allow:x:posts.read")).toBe(false);
    await options.onAction("permission:enable", signal);
    const managed = await options.snapshot(signal);
    expect(wire(managed).get("permission:allow:x:posts.read")).toBe(true);
    await options.onAction("permission:allow:x:posts.read", signal);
    expect(readOperationPolicy(environment).entries).toHaveLength(1);
    expect(readOperationPolicy(environment).entries[0]?.decision).toBe("allow");
    const granted = await options.snapshot(signal);
    const allow = itemsOf(granted).flatMap(function flat(item): MenuItemV2[] { return item.kind === "submenu" ? item.items.flatMap(flat) : [item]; }).find((item) => item.kind === "action" && item.id === "permission:allow:x:posts.read");
    expect(allow).toMatchObject({ state: "on" });
    expect(wire(granted).get("permission:deny:x:posts.read")).toBe(true);
    await options.onAction("account:public", signal);
    expect(labels(await options.snapshot(signal))).toContain("For public operations");
  });
  test("a stale revision conflict is rejected by the helper, not retried", async () => {
    const { environment } = fixture();
    const options = companionOptions(environment, undefined, undefined, "darwin", () => "ok");
    const signal = new AbortController().signal;
    await options.snapshot(signal);
    await options.onAction("permission:enable", signal);
    const error = await Promise.resolve(options.onAction("permission:enable", signal)).then(() => null, (caught: unknown) => caught);
    expect(error).toMatchObject({ name: "GhostgetMenuError", message: expect.not.stringContaining("ghostget-") });
    expect(labels(await options.snapshot(signal))).not.toContain("Turn on operation permissions");
  });
});

describe("administrative action admission", () => {
  const draft = { id: "reviewed-interface", title: "Reviewed interface", source: "user" as const, digest: "a".repeat(64), activeDigest: null, state: "draft" as const, operationCount: 1, adapterIds: ["x"], activationTargets: [{ adapterId: "x", installedDigest: "b".repeat(64) }], issues: [] };
  function controlled(platform: NodeJS.Platform = "darwin") {
    const { environment } = fixture();
    let snapshot = base({ interfaces: [draft], policy: { managed: true, revision: 3 } });
    let unavailable = false;
    const requests: ControlRequest[] = [];
    const options = companionOptions(environment, async () => {}, () => ({
      request: async (request): Promise<ControlResponse> => {
        requests.push(request);
        if (unavailable) return { ok: false, code: "CONTROL_DISCONNECTED", message: "Disconnected" };
        if (request.action === "snapshot") return { ok: true, data: { kind: "snapshot", snapshot } };
        if (request.action === "activity.query") return { ok: true, data: { kind: "activity", page: { rows: [], nextCursor: null, snapshotSequence: 0, matchingCount: 0, newerCount: 0 } } };
        return { ok: true, data: { kind: "success", message: "Saved" } };
      },
      close() {},
    }), platform, () => "ok");
    return { options, requests, change: (next: ControlSnapshot) => { snapshot = next; }, disconnect: () => { unavailable = true; }, signal: new AbortController().signal };
  }
  test("interface activation needs a second selection and sends the exact draft and installed digests once", async () => {
    const f = controlled();
    await f.options.snapshot(f.signal);
    await f.options.onAction("interface:review:reviewed-interface:x", f.signal);
    expect(f.requests.filter(request => request.action === "interface.activate")).toEqual([]);
    const reviewed = await f.options.snapshot(f.signal);
    wire(reviewed);
    expect(labels(reviewed)).toContain("Activate Reviewed interface?");
    expect(actionIds(reviewed)).toContain("interface:confirm");
    await f.options.onAction("interface:confirm", f.signal);
    expect(f.requests.filter(request => request.action === "interface.activate")).toEqual([{ action: "interface.activate", id: draft.id, digest: draft.digest, adapterId: "x", expectedInstalledDigest: "b".repeat(64) }]);
    await expect(f.options.onAction("interface:confirm", f.signal)).rejects.toMatchObject({ code: "CONTROL_UNCONFIRMED" });
    expect(f.requests.filter(request => request.action === "interface.activate")).toHaveLength(1);
  });
  test("draft or baseline movement cancels confirmation before dispatch", async () => {
    for (const changed of [{ ...draft, digest: "c".repeat(64) }, { ...draft, activationTargets: [{ adapterId: "x", installedDigest: "c".repeat(64) }] }]) {
      const f = controlled();
      await f.options.snapshot(f.signal);
      await f.options.onAction("interface:review:reviewed-interface:x", f.signal);
      f.change(base({ interfaces: [changed], policy: { managed: true, revision: 3 } }));
      expect(actionIds(await f.options.snapshot(f.signal))).not.toContain("interface:confirm");
      await f.options.onAction("interface:confirm", f.signal);
      expect(f.requests.filter(request => request.action === "interface.activate")).toEqual([]);
    }
  });
  test("stale control state cannot dispatch an administrative action even with a direct action ID", async () => {
    const f = controlled();
    await f.options.snapshot(f.signal);
    f.disconnect();
    await f.options.snapshot(f.signal);
    const before = f.requests.length;
    await expect(f.options.onAction("permission:enable", f.signal)).rejects.toMatchObject({ code: "CONTROL_UNCONFIRMED" });
    expect(f.requests).toHaveLength(before);
  });
  test("Linux rejects direct browser connection actions before any helper mutation", async () => {
    const f = controlled("linux");
    await f.options.snapshot(f.signal);
    const before = f.requests.length;
    await expect(f.options.onAction("connect:x-web:safari", f.signal)).rejects.toMatchObject({ code: "CONNECTION_PLATFORM_UNSUPPORTED" });
    await expect(f.options.onAction("reconnect:x-web-main:x-web:chrome-default", f.signal)).rejects.toMatchObject({ code: "CONNECTION_PLATFORM_UNSUPPORTED" });
    expect(f.requests).toHaveLength(before);
  });
  test("a direct action ID cannot approve a truncated request, but denial remains available", async () => {
    const f = controlled();
    f.change(base({ approvals: [{ id: "hidden-tail", digest: "e".repeat(64), kind: "provider", title: "Request", account: "personal", effect: "write", preview: "Visible content ".repeat(30) + "unseen destination", expiresAt: "2026-09-20T00:00:00Z" }] }));
    await f.options.snapshot(f.signal);
    await expect(f.options.onAction("approval:allow:hidden-tail", f.signal)).rejects.toMatchObject({ code: "APPROVAL_REQUIRES_FULL_REVIEW" });
    expect(f.requests.filter(request => request.action === "approval.decide")).toEqual([]);
    await f.options.onAction("approval:deny:hidden-tail", f.signal);
    expect(f.requests.filter(request => request.action === "approval.decide")).toEqual([{ action: "approval.decide", id: "hidden-tail", digest: "e".repeat(64), decision: "deny" }]);
  });
});

describe("action failure notices", () => {
  function wired(code: string | null) {
    const { environment } = fixture();
    const requests: ControlRequest[] = [];
    const options = companionOptions(environment, async () => {}, () => ({
      request: async (request): Promise<ControlResponse> => {
        requests.push(request);
        if (request.action === "snapshot") return { ok: true, data: { kind: "snapshot", snapshot: base({ accounts: [] }) } };
        if (request.action === "activity.query") return { ok: true, data: { kind: "activity", page: { rows: [], nextCursor: null, snapshotSequence: 0, matchingCount: 0, newerCount: 0 } } };
        if (request.action === "connection.begin") return { ok: true, data: { kind: "connection", attemptId: "a1", status: "awaiting-sign-in", subject: null, displayName: null } };
        if (code !== null) return { ok: false, code, message: `synthetic ${code} detail` };
        return { ok: true, data: { kind: "success", message: "Saved" } };
      },
      close() {},
    }), "darwin", () => "ok");
    return { options, requests, signal: new AbortController().signal };
  }
  test("a typed keychain denial keeps the sign-in row and verify is the retry", async () => {
    const f = wired("KEYCHAIN_DENIED");
    await f.options.snapshot(f.signal);
    await f.options.onAction("connect:x-web:safari", f.signal);
    const failure = await Promise.resolve(f.options.onAction("attempt:verify:a1", f.signal)).then(() => null, (caught: unknown) => caught);
    expect(failure).toMatchObject({ name: "GhostgetMenuError", code: "KEYCHAIN_DENIED", message: "macOS didn't allow the keychain request", detail: "Try again and choose Always Allow when macOS asks" });
    const items = await f.options.snapshot(f.signal);
    // The failed attempt survives with the same verify action as its retry.
    expect(actionIds(items)).toContain("attempt:verify:a1");
    expect(labels(items)).toContain("Verify X sign-in again");
    // Retrying re-verifies the same helper attempt rather than re-beginning.
    f.requests.length = 0;
    await Promise.resolve(f.options.onAction("attempt:verify:a1", f.signal)).then(() => undefined, () => undefined);
    expect(f.requests).toEqual([{ action: "connection.verify", attemptId: "a1" }]);
  });
  test("an expired attempt is the one failure that drops the sign-in row", async () => {
    const f = wired("CONNECTION_EXPIRED");
    await f.options.snapshot(f.signal);
    await f.options.onAction("connect:x-web:safari", f.signal);
    await expect(f.options.onAction("attempt:verify:a1", f.signal)).rejects.toThrow("That sign-in expired");
    const items = await f.options.snapshot(f.signal);
    expect(actionIds(items)).not.toContain("attempt:verify:a1");
  });
  test("an unmapped code surfaces bounded public copy, not internals", async () => {
    const f = wired("SOMETHING_NEW");
    await f.options.snapshot(f.signal);
    const failure = await Promise.resolve(f.options.onAction("permission:enable", f.signal)).then(() => null, (caught: unknown) => caught);
    expect(failure).toMatchObject({ name: "GhostgetMenuError", code: "SOMETHING_NEW", message: "Couldn't finish that", detail: "Try again in a moment" });
  });
  test("a mapped code names the action instead of leaking internals", async () => {
    const f = wired("ACCOUNT_CHANGED");
    await f.options.snapshot(f.signal);
    const failure = await Promise.resolve(f.options.onAction("permission:enable", f.signal)).then(() => null, (caught: unknown) => caught);
    expect(failure).toMatchObject({ name: "GhostgetMenuError", code: "ACCOUNT_CHANGED", message: "That account changed", detail: "Open the menu again, then try again" });
  });
  test("cancelling a failed attempt still reaches the live helper attempt", async () => {
    const f = wired("KEYCHAIN_DENIED");
    await f.options.snapshot(f.signal);
    await f.options.onAction("connect:x-web:safari", f.signal);
    await Promise.resolve(f.options.onAction("attempt:verify:a1", f.signal)).then(() => undefined, () => undefined);
    f.requests.length = 0;
    await f.options.onAction("attempt:cancel:a1", f.signal);
    expect(f.requests).toEqual([{ action: "connection.cancel", attemptId: "a1" }]);
  });
});

describe("optional Accounts browser handoffs", () => {
  test("provider guidance opens only the exact selected public provider page", async () => {
    const { environment } = fixture();
    const opened: string[] = [];
    const options = companionOptions(environment, async url => { opened.push(url); });
    const signal = new AbortController().signal;
    for (const id of ["provider:help:x-web", "provider:help:linkedin-web", "provider:help:reddit-web", "provider:help:constructor", "provider:help:unknown"]) await options.onAction(id, signal);
    expect(opened).toEqual([
      "https://ghostget.com/provider-capabilities/#provider-x",
      "https://ghostget.com/provider-capabilities/#provider-linkedin",
      "https://ghostget.com/provider-capabilities/#provider-reddit",
    ]);
  });
  test("only explicit fixed actions open a page, including before any helper snapshot", async () => {
    const { environment } = fixture();
    const opened: string[] = [];
    const options = companionOptions(environment, async (url) => { opened.push(url); });
    const signal = new AbortController().signal;
    expect(opened).toEqual([]);
    await options.onAction("support:unknown", signal);
    expect(opened).toEqual([]);
    await options.onAction("support:open", signal);
    expect(opened).toEqual([
      "https://account.hraness.com/support?product=ghostget&source=desktop",
    ]);
  });

  test("concurrent clicks share one bounded handoff and failures reveal only a generic notice", async () => {
    const { environment } = fixture();
    const opened: string[] = [];
    let finish: (() => void) | undefined;
    const options = companionOptions(environment, async (url) => {
      opened.push(url);
      await new Promise<void>((resolve) => { finish = resolve; });
      throw new Error("PRIVATE_BROWSER_DIAGNOSTIC");
    });
    const signal = new AbortController().signal;
    const first = Promise.resolve(options.onAction("support:open", signal)).then(() => null, (caught: unknown) => caught);
    await options.onAction("support:open", signal);
    expect(opened).toHaveLength(1);
    finish!();
    const error = await first;
    expect(error).toMatchObject({ message: "Couldn't open Help & support", detail: "Try again from the menu" });
    expect(JSON.stringify(error)).not.toContain("PRIVATE_BROWSER_DIAGNOSTIC");
    expect(String((error as Error).message)).not.toContain("PRIVATE_BROWSER_DIAGNOSTIC");
    const retry = Promise.resolve(options.onAction("support:open", signal)).catch(() => undefined);
    expect(opened).toHaveLength(2);
    finish!();
    await retry;
  });
});

describe("menubar CLI routing", () => {
  test("first launch claims its state before the shared runner and serves a live helper snapshot", async () => {
    for (const legacyMenu of [false, true]) {
      const { environment: parent } = fixture();
      const environment = { ...parent, GHOSTGET_STATE_HOME: join(parent.GHOSTGET_STATE_HOME, "fresh") };
      if (legacyMenu) mkdirSync(join(environment.GHOSTGET_STATE_HOME, "menubar"), { recursive: true, mode: 0o700 });
      const marker = join(environment.GHOSTGET_STATE_HOME, ".io-state.json");
      expect(existsSync(marker)).toBe(false);
      expect(await runMenubarCommand(["menubar", "--foreground"], environment, { stdout: () => {}, stderr: () => {} }, {
        handle: async options => {
          expect(existsSync(marker)).toBe(true);
          expect(labels(await options.snapshot(new AbortController().signal))).toContain("No accounts connected");
          return 0;
        },
      })).toBe(0);
      expect(existsSync(join(environment.GHOSTGET_STATE_HOME, "control", "owner.json"))).toBe(false);
    }
  });
  test("status and doctor leave a fresh state home unclaimed", async () => {
    const { environment: parent } = fixture();
    const environment = { ...parent, GHOSTGET_STATE_HOME: join(parent.GHOSTGET_STATE_HOME, "untouched") };
    for (const verb of ["status", "doctor"]) await runMenubarCommand(["menubar", verb], environment, { stdout: () => {}, stderr: () => {} });
    expect(existsSync(environment.GHOSTGET_STATE_HOME)).toBe(false);
  });
  test("unsafe legacy menu directories are rejected before state ownership or lifecycle dispatch", async () => {
    for (const unsafe of ["public", "symlink"] as const) {
      const { environment: parent } = fixture();
      const environment = { ...parent, GHOSTGET_STATE_HOME: join(parent.GHOSTGET_STATE_HOME, "unsafe") };
      mkdirSync(environment.GHOSTGET_STATE_HOME, { mode: 0o700 });
      const menu = join(environment.GHOSTGET_STATE_HOME, "menubar");
      if (unsafe === "symlink") symlinkSync(parent.GHOSTGET_STATE_HOME, menu);
      else { mkdirSync(menu); chmodSync(menu, 0o755); }
      let dispatched = false;
      await expect(runMenubarCommand(["menubar", "--foreground"], environment, { stdout: () => {}, stderr: () => {} }, {
        handle: async () => { dispatched = true; return 0; },
      })).rejects.toThrow();
      expect(dispatched).toBe(false);
      expect(existsSync(join(environment.GHOSTGET_STATE_HOME, ".io-state.json"))).toBe(false);
    }
  });
  test("joins helper shutdown after both a normal return and a startup failure", async () => {
    for (const fails of [false, true]) {
      const { environment } = fixture();
      const before = process.listenerCount("exit");
      let finish!: () => void;
      const closing = new Promise<void>(resolve => { finish = resolve; });
      let closeStarted!: () => void;
      const started = new Promise<void>(resolve => { closeStarted = resolve; });
      let closes = 0;
      let settled = false;
      const result = runMenubarCommand(["menubar", "--foreground"], environment, { stdout: () => {}, stderr: () => {} }, {
        helper: () => ({
          request: async (): Promise<ControlResponse> => ({ ok: false, code: "CONTROL_UNAVAILABLE", message: "Test state unavailable." }),
          close: async () => { closes++; closeStarted(); await closing; },
        }),
        handle: async options => {
          await options.snapshot(new AbortController().signal);
          if (fails) throw new Error("synthetic startup failure");
          return 0;
        },
      }).then(code => ({ code, error: null }), error => ({ code: null, error: String(error) })).finally(() => { settled = true; });
      await started;
      expect(settled).toBe(false);
      expect(process.listenerCount("exit")).toBe(before);
      finish();
      const outcome = await result;
      expect(closes).toBe(1);
      expect(outcome).toEqual(fails ? { code: null, error: "Error: synthetic startup failure" } : { code: 0, error: null });
    }
  });
  test("doctor reports the exact maintainer binary override without running it", async () => {
    const { environment } = fixture();
    const binaryRoot = mkdtempSync("/tmp/ghostget-companion-");
    cleanups.push(async () => { rmSync(binaryRoot, { recursive: true, force: true }); });
    const binary = join(binaryRoot, "reviewed-companion");
    // This file is not a runner; doctor must only report the override.
    writeFileSync(binary, "#!/bin/sh\nexit 97\n", { mode: 0o700 });
    const lines: string[] = [];
    const output = { stdout: (text: string) => { lines.push(text); }, stderr: (text: string) => { lines.push(text); } };
    await runMenubarCommand(["menubar", "doctor", "--json"], { ...environment, GHOSTGET_MENUBAR: binary }, output);
    expect(JSON.parse(lines[0]!)).toMatchObject({ artifact: { path: binary, source: "maintainer-override", integrity: "not-release-verified" } });
  });
  test("invalid maintainer override paths are rejected before shared lifecycle dispatch", async () => {
    const { environment } = fixture();
    for (const binary of ["relative-companion", "/tmp/../tmp/companion", "/tmp/companion\n"]) {
      const lines: string[] = [];
      expect(await runMenubarCommand(["menubar", "doctor"], { ...environment, GHOSTGET_MENUBAR: binary }, { stdout: text => { lines.push(text); }, stderr: text => { lines.push(text); } })).toBe(1);
      expect(lines).toEqual(["GHOSTGET_MENUBAR must be an absolute, normalized path to a reviewed companion executable.\n"]);
    }
  });
  test("status reports the shared companion lifecycle, not a LaunchAgent", async () => {
    const { environment } = fixture();
    const lines: string[] = [];
    const output = { stdout: (text: string) => { lines.push(text); }, stderr: (text: string) => { lines.push(text); } };
    expect(await runMenubarCommand(["menubar", "status", "--json"], environment, output)).toBe(0);
    expect(JSON.parse(lines[0]!)).toMatchObject({ appId: "ghostget", running: false, state: "stopped" });
    expect(lines[0]).not.toContain("LaunchAgent");
  });
  test("unknown menubar verbs and extra arguments are rejected", async () => {
    const { environment } = fixture();
    const output = { stdout: () => {}, stderr: () => {} };
    expect(await runMenubarCommand(["menubar", "bogus"], environment, output)).toBe(1);
    expect(await runMenubarCommand(["menubar", "status", "extra"], environment, output)).toBe(1);
  });
  test("--help prints the shared command surface", async () => {
    const { environment } = fixture();
    const lines: string[] = [];
    const output = { stdout: (text: string) => { lines.push(text); }, stderr: () => {} };
    expect(await runMenubarCommand(["menubar", "--help"], environment, output)).toBe(0);
    expect(lines[0]).toContain("ghostget menubar");
    expect(lines[0]).toContain("install");
  });
  test("the local app login item stays off unless HRANESS_LOCAL_APP=1 on macOS", () => {
    expect(localApp({}, "/state/menubar", "darwin")).toBeUndefined();
    expect(localApp({ HRANESS_LOCAL_APP: "1" }, "/state/menubar", "linux")).toBeUndefined();
    expect(localApp({ HRANESS_LOCAL_APP: "1" }, "/state/menubar", "darwin")).toEqual({ name: "Ghostget", argvFile: "/state/menubar/login-argv.json" });
  });
});
