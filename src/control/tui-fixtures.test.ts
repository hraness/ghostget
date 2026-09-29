import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ghostgetHelpRequest } from "../usage";
import type { BrowserChoice } from "./browser-choices";
import type { OutputsView } from "./outputs";
import type { ControlSnapshot } from "./protocol";
import { buildStatus, renderStatus, type StatusAttempt, type StatusInputs } from "./status-view";

/**
 * The status each former menu bar state now shows, committed as the
 * `ghostget.status/1` JSON and the 80-column `tui --snapshot` text. These are
 * the same 13 states `__fixtures__/menubar` covered. Regenerate with
 * `UPDATE_TUI_FIXTURES=1 bun test src/control/tui-fixtures.test.ts`.
 */
const FIXTURES = join(import.meta.dir, "__fixtures__", "tui");
const NOW = Date.parse("2026-09-26T12:00:00Z");

const BROWSERS: readonly BrowserChoice[] = [
  { key: "safari", label: "Safari", browser: "safari", profile: null },
  { key: "chrome-default", label: "Chrome · Personal", browser: "chrome", profile: "Default" },
  { key: "chrome-profile-1", label: "Chrome · Work", browser: "chrome", profile: "Profile 1" },
];
const PROVIDERS = [
  { id: "x-web", title: "X · browser session" },
  { id: "linkedin-web", title: "LinkedIn · browser session" },
  { id: "reddit-web", title: "Reddit · browser session" },
];

type Account = ControlSnapshot["accounts"][number];
const account = (overrides: Partial<Account> = {}): Account => ({
  id: "x-main", provider: "x", kind: "cookie-source", subject: "1234567890", displayName: null, revision: "a".repeat(64), status: "verified",
  source: "chrome", profile: "Default", tokenStorage: null, tokenExpiresAt: null, tokenRefreshable: false, ...overrides,
});

function snapshot(overrides: Partial<ControlSnapshot> = {}): ControlSnapshot {
  return {
    version: "0.18.40",
    accountId: null,
    accounts: [],
    capabilities: [],
    interfaces: [],
    policy: { managed: true, revision: 3 },
    web: { revision: 1, gatewayOnly: false, rules: [] },
    approvals: [],
    connectionProviders: PROVIDERS,
    vault: { provider: "1password", available: false, purpose: "x-user-token-import" },
    ...overrides,
  };
}

const capability = (operationId: string, permission: "allow" | "ask" | "deny") => ({
  digest: "d".repeat(64), adapterId: "x", operationId, pluginId: null, surface: "x", transport: "web-session", risk: "low", effect: "read",
  state: "available" as const, executorSource: "built-in" as const, interfaceSource: "bundled" as const, permission,
});

const NO_OUTPUTS: OutputsView = { directory: { dev: 1n, ino: 2n }, entries: [], message: null, truncated: false };
const OUTPUTS: OutputsView = {
  directory: { dev: 1n, ino: 2n },
  entries: [
    { name: "x-timeline-2026-09-26.md", size: 18_432, modifiedMs: NOW - 5 * 60_000, identity: { dev: 1n, ino: 3n, size: 18_432n, mtimeNs: 0n, mode: 0o100600n } },
    { name: "example-com.pdf", size: 402_118, modifiedMs: NOW - 3 * 3_600_000, identity: { dev: 1n, ino: 4n, size: 402_118n, mtimeNs: 0n, mode: 0o100600n } },
  ],
  message: null,
  truncated: false,
};

const RUNNING = snapshot({
  accounts: [account({ displayName: "@runner" }), account({ id: "linkedin-web-5d0e2a91", provider: "linkedin", source: "safari", profile: null, displayName: "runner-person" })],
  accountId: "x-main",
  capabilities: [capability("timeline.read", "allow"), capability("posts.create", "ask")],
});

const ATTEMPTS: readonly StatusAttempt[] = [
  { attemptId: "att-1", title: "X · browser session", providerId: "x-web", browserKey: "chrome-default", accountId: null, status: "awaiting-sign-in", subject: null, displayName: null },
  { attemptId: "att-2", title: "Reddit · browser session", providerId: "reddit-web", browserKey: "safari", accountId: null, status: "failed", subject: null, displayName: null },
  { attemptId: "att-3", title: "LinkedIn · browser session", providerId: "linkedin-web", browserKey: "chrome-profile-1", accountId: null, status: "verified", subject: "urn:li:fsd_profile:11777888", displayName: "person-verified" },
];

type State = Partial<StatusInputs> & { readonly snapshot: ControlSnapshot | null };

/** The same names and states as the retired `__fixtures__/menubar`. */
const STATES: Readonly<Record<string, State>> = {
  "first-run": { snapshot: snapshot({ policy: { managed: false, revision: 1 } }) },
  "signed-out": { snapshot: snapshot({ accounts: [account({ status: "reconnect-required" })] }), outputs: OUTPUTS },
  running: { snapshot: RUNNING, outputs: OUTPUTS },
  "needs-approval": {
    snapshot: snapshot({
      ...RUNNING,
      approvals: [{ id: "appr-1", digest: "c".repeat(64), kind: "provider", title: "Post to X", account: "x-main", effect: "write", preview: "Shipping the new menu today", expiresAt: new Date(NOW + 4 * 60_000).toISOString() }],
    }),
    outputs: OUTPUTS,
  },
  connecting: { snapshot: snapshot(), attempts: ATTEMPTS },
  error: { snapshot: RUNNING, outputs: OUTPUTS, actionError: "SIGN_IN_UNVERIFIED" },
  "keychain-denied": { snapshot: RUNNING, outputs: OUTPUTS, actionError: "KEYCHAIN_DENIED" },
  "safari-needs-full-disk-access": { snapshot: snapshot(), safari: "denied" },
  empty: { snapshot: snapshot({ accounts: [account()] }) },
  "controls-paused": { snapshot: null, outputs: OUTPUTS },
  reconnecting: { snapshot: RUNNING, fresh: false, confirmedAgeSeconds: 42, outputs: OUTPUTS },
  linux: { snapshot: snapshot({ accounts: [account({ status: "reconnect-required" })] }), platform: "linux" },
  "max-accounts": {
    snapshot: snapshot({
      accounts: Array.from({ length: 12 }, (_, index) => account({
        id: index % 2 === 0 ? `x-${index}` : `reddit-web-${(0x1000_0000 + index).toString(16)}`,
        provider: index % 2 === 0 ? "x" : "reddit",
        profile: index % 3 === 0 ? "Profile 1" : "Default",
        status: index === 3 ? "reconnect-required" : "verified",
      })),
      capabilities: Array.from({ length: 16 }, (_, index) => capability(`operation.${index}`, "ask")),
    }),
    outputs: OUTPUTS,
  },
};

const status = (state: State) => buildStatus({ outputs: NO_OUTPUTS, platform: "darwin", browsers: BROWSERS, safari: "ok", ...state });

/** The words of a suggested command, up to its first argument or flag. */
function commandWords(command: string): string[] {
  const words = command.split(" ");
  expect(words[0]).toBe("ghostget");
  const end = words.findIndex((word, index) => index > 0 && (word.startsWith("-") || word.startsWith("<") || word.includes("/") || word.includes(":")));
  return words.slice(1, end === -1 ? undefined : end);
}

describe("tui fixtures", () => {
  test("cover every former menu bar state", () => {
    // The 13 states the retired `__fixtures__/menubar` covered, by name.
    expect(Object.keys(STATES).sort()).toEqual(["connecting", "controls-paused", "empty", "error", "first-run", "keychain-denied", "linux", "max-accounts", "needs-approval", "running", "safari-needs-full-disk-access", "reconnecting", "signed-out"].sort());
  });

  for (const [name, state] of Object.entries(STATES)) {
    test(name, async () => {
      const value = status(state);
      const json = `${JSON.stringify(value, null, 2)}\n`;
      const text = renderStatus(value, 80, NOW);
      const jsonPath = join(FIXTURES, `${name}.json`);
      const textPath = join(FIXTURES, `${name}.txt`);
      if (process.env["UPDATE_TUI_FIXTURES"] === "1") {
        await mkdir(FIXTURES, { recursive: true });
        await writeFile(jsonPath, json);
        await writeFile(textPath, text);
      }
      expect(await readFile(jsonPath, "utf8")).toBe(json);
      expect(await readFile(textPath, "utf8")).toBe(text);
    });
  }

  test("every line fits 80 columns and every state suggests a next step", () => {
    for (const state of Object.values(STATES)) {
      const value = status(state);
      expect(value.next.length).toBeGreaterThan(0);
      for (const line of renderStatus(value, 80, NOW).split("\n")) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(80);
    }
  });

  test("every suggested command is a real Ghostget command", () => {
    const commands = new Set<string>();
    for (const state of Object.values(STATES)) {
      const value = status(state);
      for (const command of value.next) commands.add(command);
      for (const notice of value.notices) if (notice.next.startsWith("ghostget ")) commands.add(notice.next);
    }
    expect(commands.size).toBeGreaterThan(3);
    for (const command of commands) {
      const words = commandWords(command);
      const help = ghostgetHelpRequest([...words, "--help"]);
      expect({ command, kind: help?.kind }).not.toEqual({ command, kind: "unknown-topic" });
    }
  });
});
