import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateSnapshot, type MenuItem, type Snapshot } from "@hraness/desktop-foundation";
import { ghostgetStateHome } from "../storage";
import { companionOptions, menuLabel, readOutputs, runMenubarCommand, snapshotItems, type Attempt, type OutputsView } from "./menubar-cli";
import type { ControlSnapshot } from "./protocol";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function fixture() {
  const raw = mkdtempSync("/tmp/ghostget-menu-"); chmodSync(raw, 0o700);
  cleanups.push(async () => { rmSync(raw, { recursive: true, force: true }); });
  const environment = { GHOSTGET_STATE_HOME: raw, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: process.env.HOME ?? "", USER: process.env.USER ?? "", LOGNAME: process.env.LOGNAME ?? "", TMPDIR: "/tmp" };
  ghostgetStateHome(environment);
  return { environment };
}

/** The produced items must satisfy the shared runner's wire contract. */
function wire(items: readonly MenuItem[]): ReadonlyMap<string, boolean> {
  return validateSnapshot({ version: 1, type: "snapshot", appId: "ghostget", name: "Ghostget", title: "Gg", revision: 1, items } satisfies Snapshot);
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
  test("maps approvals, accounts, providers, permissions and vault onto the wire contract", () => {
    const items = snapshotItems(base({
      accounts: [
        { id: "acct-one", provider: "x", kind: "browser-profile", subject: "owner", revision: "a".repeat(64), status: "verified", source: "Browser profile", tokenStorage: null },
        { id: "acct-two", provider: null, kind: "cookie-source", subject: null, revision: "b".repeat(64), status: "reconnect-required", source: "safari", tokenStorage: null },
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
    expect(all).toContain("acct-two · Reconnect required");
    expect(all).toContain("Gateway-only mode");
    expect(all).toContain("Docs interface · draft");
    expect(all).toContain("Vault · 1Password available");
    expect(all).toContain("Updated 3s ago");
    expect(ids).toContain("approval:allow:appr-1");
    expect(ids).toContain("approval:deny:appr-1");
    expect(ids).toContain("disconnect:acct-one");
    expect(ids).toContain("connect:x-web:safari");
    expect(ids).toContain("reconnect:acct-two:x-web:chrome-default");
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
    expect(actionIds(items)).toEqual(["refresh", "open-website", "clip:0", "clip:1", "clip:2"]);
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
    expect(all).toContain("25 more operations need review");
    expect(all).toContain("Last confirmed 1m ago");
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

describe("menubar CLI routing", () => {
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
