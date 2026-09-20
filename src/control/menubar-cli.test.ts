import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateSnapshot, type MenuItem, type Snapshot } from "@hraness/desktop-foundation";
import { ghostgetStateHome, installManifest } from "../storage";
import { createAuth, saveAuth } from "../auth";
import type { GhostgetManifest } from "../model";
import { providerPluginRegistry as registry } from "../provider-plugins";
import { readOperationPolicy } from "../operation-permission-store";
import { TRAY_ICON } from "./menubar-icon";
import { companionOptions as createCompanionOptions, menuLabel, readOutputs, runMenubarCommand, snapshotItems, type Attempt, type OutputsView } from "./menubar-cli";
import type { ControlRequest, ControlResponse, ControlSnapshot } from "./protocol";
import type { BrowserChoice } from "./browser-choices";

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

/** The produced items must satisfy the shared runner's wire contract. */
function wire(items: readonly MenuItem[]): ReadonlyMap<string, boolean> {
  return validateSnapshot({ version: 1, type: "snapshot", appId: "ghostget", name: "Ghostget", title: "\u{1f47b}", icon: TRAY_ICON, revision: 1, items } satisfies Snapshot);
}
function labels(items: readonly MenuItem[]): string[] {
  return items.flatMap((item) => item.kind === "separator" ? [] : item.kind === "submenu" ? [item.label, ...labels(item.items)] : [item.label]);
}
function actionIds(items: readonly MenuItem[]): string[] {
  return items.flatMap((item) => item.kind === "action" ? [item.id] : item.kind === "submenu" ? actionIds(item.items) : []);
}
function base(overrides: Partial<ControlSnapshot> = {}): ControlSnapshot {
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
    const items = snapshotItems(base(), new Map(), { confirmedAgeSeconds: 0, fresh: true }, [], undefined, null, null, "darwin", discovered);
    const ids = actionIds(items);
    expect(ids).toContain("connect:x-web:chrome-profile-9");
    expect(ids).not.toContain("connect:x-web:chrome-default");
    expect(labels(items)).toContain("Chrome \u00b7 Your Chrome (Profile 9)");
  });

  test("maps approvals, accounts, providers, permissions and vault onto the wire contract", () => {
    const items = snapshotItems(base({
      accounts: [
        { id: "acct-one", provider: "x", kind: "browser-profile", subject: "owner", revision: "a".repeat(64), status: "verified", source: "Browser profile", tokenStorage: null },
        { id: "x-web-acct-two", provider: null, kind: "cookie-source", subject: null, revision: "b".repeat(64), status: "reconnect-required", source: "safari", tokenStorage: null },
      ],
      approvals: [{ id: "appr-1", digest: "c".repeat(64), kind: "web", title: "Fetch docs page", account: null, effect: "retrieval", preview: "GET https://docs.example.com", expiresAt: "2026-09-16T00:00:00Z" }],
      capabilities: [
        { digest: "d".repeat(64), adapterId: "x-web", operationId: "post", pluginId: null, surface: "x", transport: "web-session", risk: "write", effect: "posts", state: "available", executorSource: "built-in", interfaceSource: "bundled", permission: "unmanaged" },
      ],
      interfaces: [{ id: "if-1", title: "Docs interface", source: "user", digest: "e".repeat(64), activeDigest: null, state: "draft", operationCount: 4, adapterIds: ["docs"], activationTargets: [], issues: [] }],
      web: { revision: 2, gatewayOnly: true, rules: [{ id: "r1", origin: "https://docs.example.com", path: { kind: "exact", value: "/a" }, methods: ["GET"], queryKeys: [], decision: "allow", effect: "retrieval", maxResponseBytes: 1024, timeoutMs: 1000 }] },
    }), new Map(), { confirmedAgeSeconds: 3, fresh: true });
    wire(items);
    const all = labels(items);
    const ids = actionIds(items);
    expect(all).toContain("Ghostget 0.18.12");
    expect(all).toContain("2 accounts · 1 need reconnect · 1 pending approval");
    expect(all).toContain("Approvals · 1");
    expect(all).toContain("Fetch docs page");
    expect(all).toContain("x-web-acct-two · Reconnect required");
    expect(all).toContain("Gateway-only mode");
    expect(all).toContain("Docs interface · draft");
    expect(all).toContain("1Password · X token import");
    expect(all).toContain("macOS supported; desktop access has not been checked.");
    expect(all).toContain("Updated 3s ago");
    expect(ids).toContain("approval:allow:appr-1");
    expect(ids).toContain("approval:deny:appr-1");
    expect(ids).toContain("disconnect:acct-one");
    expect(ids).toContain("connect:x-web:safari");
    expect(ids).toContain("reconnect:x-web-acct-two:x-web:chrome-default");
    expect(ids).toContain("permission:enable");
    expect(ids).toContain("permission:allow:x-web:post");
    expect(ids).toContain("permission:ask:x-web:post");
    expect(ids).toContain("permission:deny:x-web:post");
    expect(items.at(-1)).toMatchObject({ kind: "quit", label: "Quit Ghostget" });
  });
  test("renders in-flight connection attempts with verify, commit and cancel", () => {
    const attempts = new Map<string, Attempt>([
      ["att-1", { attemptId: "att-1", title: "X · browser session", status: "awaiting-sign-in", subject: null }],
      ["att-2", { attemptId: "att-2", title: "LinkedIn · browser session", status: "verified", subject: "person-1" }],
    ]);
    const ids = actionIds(snapshotItems(base(), attempts, { confirmedAgeSeconds: 1, fresh: true }));
    expect(ids).toContain("attempt:verify:att-1");
    expect(ids).toContain("attempt:cancel:att-1");
    expect(ids).toContain("attempt:commit:att-2");
    expect(ids).toContain("attempt:cancel:att-2");
  });
  test("degrades to a bounded unavailable menu without a control snapshot", () => {
    const items = snapshotItems(null, new Map(), { confirmedAgeSeconds: null, fresh: false, detail: "no helper" });
    wire(items);
    expect(items[0]).toMatchObject({ kind: "label", label: "Ghostget control unavailable" });
    expect(labels(items)).toContain("Control status not confirmed");
    expect(labels(items)).toContain("Outputs · 0");
    expect(actionIds(items)).toEqual(["refresh", "open-website", "support:updates", "support:paid", "clip:0", "clip:1", "clip:2"]);
    expect(labels(items)).toContain("Get Ghostget updates (free)…");
    expect(labels(items)).toContain("Support Ghostget development (optional paid)…");
  });
  test("bounds menus for large control surfaces", () => {
    const capabilities = Array.from({ length: 40 }, (_, index) => ({
      digest: "f".repeat(64), adapterId: `adapter-${index}`, operationId: `op-${index}`, pluginId: null, surface: "x", transport: "web-session", risk: "read", effect: "reads", state: "available" as const, executorSource: "built-in" as const, interfaceSource: "bundled" as const, permission: "unmanaged" as const,
    }));
    const accounts = Array.from({ length: 25 }, (_, index) => ({ id: `acct-${index}`, provider: null, kind: "cookie-source", subject: null, revision: "a".repeat(64), status: "configured" as const, source: null, tokenStorage: null }));
    const items = snapshotItems(base({ accounts, capabilities, policy: { managed: true, revision: 9 } }), new Map(), { confirmedAgeSeconds: 61, fresh: false });
    wire(items);
    const all = labels(items);
    expect(all).toContain("5 more accounts");
    expect(all).toContain("25 more operations; use ghostget tui to review all");
    expect(all).toContain("Last confirmed 1m ago");
  });
  test("configured browser accounts offer a matching reconnect without offering token replacement", () => {
    const accounts: ControlSnapshot["accounts"] = [
      { id: "x-web-123", provider: null, kind: "cookie-source", subject: "12345", revision: "a".repeat(64), status: "configured", source: "chrome", tokenStorage: null },
      { id: "x-token", provider: "x", kind: "oauth-token-file", subject: "12345", revision: "b".repeat(64), status: "configured", source: null, tokenStorage: "ghostget-import" },
      { id: "unknown-browser", provider: null, kind: "cookie-source", subject: "12345", revision: "c".repeat(64), status: "configured", source: "chrome", tokenStorage: null },
    ];
    const ids = actionIds(snapshotItems(base({ accounts, connectionProviders: [{ id: "x-web", title: "X" }, { id: "linkedin-web", title: "LinkedIn" }] }), new Map(), { confirmedAgeSeconds: 0, fresh: true }));
    expect(ids).toContain("reconnect:x-web-123:x-web:chrome-default");
    expect(ids.some(id => id.startsWith("reconnect:x-web-123:linkedin"))).toBe(false);
    expect(ids.some(id => id.startsWith("reconnect:x-token:"))).toBe(false);
    expect(ids.some(id => id.startsWith("reconnect:unknown-browser:"))).toBe(false);
  });
  test("unconfirmed snapshots retain status but disable administrative actions", () => {
    const actions = wire(snapshotItems(base(), new Map(), { confirmedAgeSeconds: 9, fresh: false }));
    expect(actions.get("permission:enable")).toBe(false);
    expect(actions.get("connect:x-web:safari")).toBe(false);
    expect(actions.get("refresh")).toBe(true);
  });
  test("Linux keeps browser connection controls disabled and offers provider-specific guidance", () => {
    const state = base({ accounts: [{ id: "x-web-main", provider: null, kind: "cookie-source", subject: "12345", revision: "a".repeat(64), status: "configured", source: "chrome", tokenStorage: null }] });
    const items = snapshotItems(state, new Map(), { confirmedAgeSeconds: 0, fresh: true }, [], undefined, null, null, "linux");
    const actions = wire(items);
    expect(actions.get("connect:x-web:safari")).toBe(false);
    expect(actions.get("reconnect:x-web-main:x-web:chrome-default")).toBe(false);
    expect(actions.get("provider:help:x-web")).toBe(true);
    expect(labels(items)).toContain("Browser sign-in requires macOS. Open a provider guide for CLI setup.");
    expect(labels(items)).toContain("Connect X, LinkedIn, or Reddit");
  });
  test("an approval with hidden or normalized content cannot be allowed from the menu", () => {
    for (const preview of ["Visible prefix ".repeat(30) + "HIDDEN TARGET", "Preserve  these spaces", "line one\nline two", "x".repeat(100)]) {
      const approval = { id: "long-review", digest: "a".repeat(64), kind: "provider" as const, title: "Review request", account: "account", effect: "write", preview, expiresAt: "2026-09-20T00:00:00Z" };
      const items = snapshotItems(base({ approvals: [approval] }), new Map(), { confirmedAgeSeconds: 0, fresh: true });
      const actions = wire(items);
      expect(actions.get("approval:allow:long-review")).toBe(false);
      expect(actions.get("approval:deny:long-review")).toBe(true);
      expect(labels(items).join(" ")).toContain("Full review requires TUI. Stop menu, open ghostget tui, then submit a new approval request.");
      expect(labels(items)).toContain("Switching controllers cancels this pending request.");
    }
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
  test("lists bounded output files with open, reveal and copy actions", () => {
    const items = snapshotItems(base(), new Map(), { confirmedAgeSeconds: 2, fresh: true }, [], view([entry("report.pdf", 3n), entry("data.bin", 2n)]));
    wire(items);
    const all = labels(items);
    const ids = actionIds(items);
    expect(all).toContain("Outputs · 2");
    expect(all).toContain("report.pdf");
    expect(ids).toContain("output:open:0");
    expect(ids).toContain("output:reveal:0");
    expect(ids).toContain("output:copy:0");
    expect(ids).toContain("output:folder");
    // A non-openable extension keeps reveal/copy but drops the open action.
    expect(ids).not.toContain("output:open:1");
    expect(ids).toContain("output:reveal:1");
  });
  test("sanitizes hostile file names while keeping wire-safe action ids", () => {
    const items = snapshotItems(base(), new Map(), { confirmedAgeSeconds: 2, fresh: true }, [], view([entry("bad\nname.pdf", 3n)]));
    wire(items);
    expect(labels(items)).toContain("bad name.pdf");
    expect(actionIds(items).filter((id) => id.startsWith("output:")).sort()).toEqual(["output:copy:0", "output:folder", "output:open:0", "output:reveal:0"]);
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
    expect(readOutputs(join(raw, "missing"))).toMatchObject({ message: "Outputs unavailable" });
    chmodSync(dir, 0o755);
    expect(readOutputs(dir).message).toBe("Outputs unavailable");
  });
});

describe("helper-backed companion options", () => {
  test("the status mark is the ghost emoji with bundled tray art", () => {
    const { environment } = fixture();
    const options = companionOptions(environment);
    expect(options.title).toBe("\u{1f47b}");
    expect(options.icon).toEqual({ width: 32, height: 32, rgba: expect.any(String) });
    expect(Buffer.from(options.icon!.rgba, "base64")).toHaveLength(32 * 32 * 4);
  });
  test("snapshot maps a live helper response and marks it fresh", async () => {
    const { environment } = fixture();
    const options = companionOptions(environment);
    const items = await options.snapshot(new AbortController().signal);
    wire(items);
    expect(labels(items)).toContain("No accounts connected");
    expect(labels(items)).toContain("Updated 0s ago");
    expect(labels(items)).toContain("Enable operation permissions");
  });
  test("permission.enable applies one revision-checked mutation through the real helper", async () => {
    const { environment } = fixture();
    const options = companionOptions(environment);
    const signal = new AbortController().signal;
    await options.snapshot(signal);
    await options.onAction("permission:enable", signal);
    const items = await options.snapshot(signal);
    expect(labels(items)).toContain("Operation permissions are managed per account.");
  });
  test("a real private account can be selected and permissions remain editable after opt-in and a grant", async () => {
    const { environment } = fixture();
    const manifest = JSON.parse(readFileSync(new URL("../assets/adapters/x/wrench-adapter.json", import.meta.url), "utf8")) as GhostgetManifest;
    installManifest(manifest, { force: false, environment, registry });
    saveAuth(createAuth("selected-account", { oauthProvider: "x", tokenFile: join(environment.GHOSTGET_STATE_HOME, "synthetic-token.json"), scopes: ["tweet.read", "users.read"], subject: "12345" }), environment);
    const options = companionOptions(environment);
    const signal = new AbortController().signal;
    const publicItems = await options.snapshot(signal);
    expect(actionIds(publicItems)).not.toContain("permission:allow:x:posts.read");
    await options.onAction("account:select:selected-account", signal);
    const selected = await options.snapshot(signal);
    expect(labels(selected)).toContain("Account: selected-account");
    expect(wire(selected).get("permission:allow:x:posts.read")).toBe(false);
    await options.onAction("permission:enable", signal);
    const managed = await options.snapshot(signal);
    expect(wire(managed).get("permission:allow:x:posts.read")).toBe(true);
    await options.onAction("permission:allow:x:posts.read", signal);
    expect(readOperationPolicy(environment).entries).toHaveLength(1);
    expect(readOperationPolicy(environment).entries[0]?.decision).toBe("allow");
    const granted = await options.snapshot(signal);
    expect(labels(granted)).toContain("x · posts.read · allow");
    expect(wire(granted).get("permission:deny:x:posts.read")).toBe(true);
    await options.onAction("account:public", signal);
    expect(labels(await options.snapshot(signal))).toContain("Scope: public operations");
  });
  test("a stale revision conflict is rejected by the helper, not retried", async () => {
    const { environment } = fixture();
    const options = companionOptions(environment);
    const signal = new AbortController().signal;
    await options.snapshot(signal);
    await options.onAction("permission:enable", signal);
    await expect(options.onAction("permission:enable", signal)).rejects.toThrow("ghostget-");
    const items = await options.snapshot(signal);
    expect(labels(items)).toContain("Operation permissions are managed per account.");
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
    }), platform);
    return { options, requests, change: (next: ControlSnapshot) => { snapshot = next; }, disconnect: () => { unavailable = true; }, signal: new AbortController().signal };
  }
  test("interface activation needs a second selection and sends the exact draft and installed digests once", async () => {
    const f = controlled();
    await f.options.snapshot(f.signal);
    await f.options.onAction("interface:review:reviewed-interface:x", f.signal);
    expect(f.requests.filter(request => request.action === "interface.activate")).toEqual([]);
    const reviewed = await f.options.snapshot(f.signal);
    wire(reviewed);
    expect(labels(reviewed)).toContain(`Draft: ${draft.digest}`);
    expect(actionIds(reviewed)).toContain("interface:confirm");
    await f.options.onAction("interface:confirm", f.signal);
    expect(f.requests.filter(request => request.action === "interface.activate")).toEqual([{ action: "interface.activate", id: draft.id, digest: draft.digest, adapterId: "x", expectedInstalledDigest: "b".repeat(64) }]);
    await expect(f.options.onAction("interface:confirm", f.signal)).rejects.toThrow("CONTROL_UNCONFIRMED");
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
    await expect(f.options.onAction("permission:enable", f.signal)).rejects.toThrow("CONTROL_UNCONFIRMED");
    expect(f.requests).toHaveLength(before);
  });
  test("Linux rejects direct browser connection actions before any helper mutation", async () => {
    const f = controlled("linux");
    await f.options.snapshot(f.signal);
    const before = f.requests.length;
    await expect(f.options.onAction("connect:x-web:safari", f.signal)).rejects.toThrow("CONNECTION_PLATFORM_UNSUPPORTED");
    await expect(f.options.onAction("reconnect:x-web-main:x-web:chrome-default", f.signal)).rejects.toThrow("CONNECTION_PLATFORM_UNSUPPORTED");
    expect(f.requests).toHaveLength(before);
  });
  test("a direct action ID cannot approve a truncated request, but denial remains available", async () => {
    const f = controlled();
    f.change(base({ approvals: [{ id: "hidden-tail", digest: "e".repeat(64), kind: "provider", title: "Request", account: "personal", effect: "write", preview: "Visible content ".repeat(30) + "unseen destination", expiresAt: "2026-09-20T00:00:00Z" }] }));
    await f.options.snapshot(f.signal);
    await expect(f.options.onAction("approval:allow:hidden-tail", f.signal)).rejects.toThrow("APPROVAL_REQUIRES_FULL_REVIEW");
    expect(f.requests.filter(request => request.action === "approval.decide")).toEqual([]);
    await f.options.onAction("approval:deny:hidden-tail", f.signal);
    expect(f.requests.filter(request => request.action === "approval.decide")).toEqual([{ action: "approval.decide", id: "hidden-tail", digest: "e".repeat(64), decision: "deny" }]);
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
    await options.onAction("support:updates", signal);
    await options.onAction("support:paid", signal);
    expect(opened).toEqual([
      "https://account.hraness.com/support?product=wrench&source=desktop#updates",
      "https://account.hraness.com/support?product=wrench&source=desktop#support",
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
    const first = options.onAction("support:paid", signal);
    await options.onAction("support:updates", signal);
    expect(opened).toHaveLength(1);
    finish!();
    await first;
    const items = await options.snapshot(signal);
    expect(labels(items)).toContain("Could not open Accounts. Try again from the menu.");
    expect(JSON.stringify(items)).not.toContain("PRIVATE_BROWSER_DIAGNOSTIC");
    const retry = options.onAction("support:updates", signal);
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
          expect(labels(await options.snapshot(new AbortController().signal))).toContain("Updated 0s ago");
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
    await runMenubarCommand(["menubar", "doctor"], { ...environment, GHOSTGET_MENUBAR: binary }, output);
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
    expect(await runMenubarCommand(["menubar", "status"], environment, output)).toBe(0);
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
    expect(lines[0]).toContain("start|stop|status|doctor|install|uninstall");
  });
});
