import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { actionErrorItem, assertMenuFixture, countMenuNodes, MENU_NODE_BUDGET, type MenuItemV2, type SnapshotV2 } from "@hraness/desktop-foundation";
import { GHOSTGET_MENU_NOUNS, menuActionError, snapshotMenu, type Attempt, type OutputsView } from "./menubar-cli";
import type { BrowserChoice } from "./browser-choices";
import type { ControlSnapshot } from "./protocol";

/**
 * One menu snapshot per state, committed as the v2 JSON frame and its text
 * tree. `assertMenuFixture` validates each frame and runs the strict menu lint
 * (the same check as `hraness-companion lint-menu --strict`). Regenerate with
 * `UPDATE_MENU_FIXTURES=1 bun test src/control/menubar-fixtures.test.ts`.
 */
const FIXTURES = join(import.meta.dir, "__fixtures__", "menubar");
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

type State = {
  readonly snapshot: ControlSnapshot | null;
  readonly attempts?: ReadonlyMap<string, Attempt>;
  readonly fresh?: boolean;
  readonly outputs?: OutputsView;
  readonly platform?: NodeJS.Platform;
  readonly safari?: "ok" | "denied";
  /** The code of a failed action; the runner shows it as a ⚠︎ row. */
  readonly actionError?: string;
};

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
  connecting: {
    snapshot: snapshot(),
    attempts: new Map<string, Attempt>([
      ["att-1", { attemptId: "att-1", title: "X · browser session", providerId: "x-web", browserKey: "chrome-default", accountId: null, status: "awaiting-sign-in", subject: null, displayName: null }],
      ["att-2", { attemptId: "att-2", title: "Reddit · browser session", providerId: "reddit-web", browserKey: "safari", accountId: null, status: "failed", subject: null, displayName: null }],
      ["att-3", { attemptId: "att-3", title: "LinkedIn · browser session", providerId: "linkedin-web", browserKey: "chrome-profile-1", accountId: null, status: "verified", subject: "urn:li:fsd_profile:11777888", displayName: "person-verified" }],
    ]),
  },
  error: { snapshot: RUNNING, outputs: OUTPUTS, actionError: "SIGN_IN_UNVERIFIED" },
  "keychain-denied": { snapshot: RUNNING, outputs: OUTPUTS, actionError: "KEYCHAIN_DENIED" },
  "safari-needs-full-disk-access": { snapshot: snapshot(), safari: "denied" },
  empty: { snapshot: snapshot({ accounts: [account()] }) },
  "controls-paused": { snapshot: null, outputs: OUTPUTS },
  reconnecting: { snapshot: RUNNING, fresh: false, outputs: OUTPUTS },
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

function frame(state: State): SnapshotV2 {
  const model = snapshotMenu(state.snapshot, state.attempts ?? new Map(), {
    confirmedAgeSeconds: state.fresh === false ? 42 : 0,
    fresh: state.fresh !== false,
  }, {
    outputs: state.outputs ?? { directory: { dev: 1n, ino: 2n }, entries: [], message: null, truncated: false },
    platform: state.platform ?? "darwin",
    browsers: BROWSERS,
    safari: state.safari ?? "ok",
    nowMs: NOW,
  });
  let items: MenuItemV2[] = [...model.items];
  if (state.actionError !== undefined) {
    // The shared runner inserts the ⚠︎ row after the status rows.
    const error = menuActionError(state.actionError);
    const index = items.findIndex((item) => item.kind !== "header" && item.kind !== "status");
    items = [...items.slice(0, index), actionErrorItem(error.message, error.detail), ...items.slice(index)];
  }
  return {
    version: 2,
    type: "snapshot",
    appId: "ghostget",
    name: "Ghostget",
    mark: model.mark!,
    ...(model.tooltip === undefined ? {} : { tooltip: model.tooltip }),
    revision: 1,
    items,
  };
}

describe("ghostget menu fixtures", () => {
  for (const [name, state] of Object.entries(STATES)) {
    test(`${name}: passes the strict menu lint and matches the committed fixture`, async () => {
      const snapshot = frame(state);
      const { tree } = assertMenuFixture(snapshot, { properNouns: [...GHOSTGET_MENU_NOUNS, "Personal", "Work"] });
      const json = `${JSON.stringify(snapshot, null, 2)}\n`;
      const jsonPath = join(FIXTURES, `${name}.json`);
      const treePath = join(FIXTURES, `${name}.txt`);
      if (process.env["UPDATE_MENU_FIXTURES"] === "1") {
        await mkdir(FIXTURES, { recursive: true });
        await writeFile(jsonPath, json);
        await writeFile(treePath, tree);
      }
      expect(await readFile(jsonPath, "utf8")).toBe(json);
      expect(await readFile(treePath, "utf8")).toBe(tree);
    });
  }

  test("every state has one primary action, stays under the node budget and ends with Quit Ghostget", () => {
    for (const state of Object.values(STATES)) {
      const items = frame(state).items;
      expect(items.filter((item) => item.kind === "action" && item.role === "primary")).toHaveLength(1);
      expect(items.at(-1)).toEqual({ kind: "quit", label: "Quit Ghostget" });
      expect(countMenuNodes(items)).toBeLessThan(MENU_NODE_BUDGET);
    }
  });
});
