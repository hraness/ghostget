import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { propertyParameters } from "../test-support";
import { TuiController, runInteractiveTui, runTuiCommand } from "./tui";
import { applyTuiSnapshot, createTuiState, renderTui, renderTuiSnapshot, selectTuiSection, tuiRows, tuiText } from "./tui-model";
import { TuiInput, withTuiTerminal, type TuiTerminal } from "./tui-terminal";
import type { HelperClient } from "./helper-client";
import type { ControlRequest, ControlResponse, ControlSnapshot } from "./protocol";

function snapshot(overrides: Partial<ControlSnapshot> = {}): ControlSnapshot {
  return {
    version: "0.18.16", accountId: "personal", accounts: [{ id: "personal", provider: "x", kind: "cookie-source", subject: "123", revision: "a".repeat(64), status: "configured", source: "safari", tokenStorage: null }],
    capabilities: [{ digest: "b".repeat(64), adapterId: "x-web", operationId: "post", pluginId: null, surface: "x", transport: "web-session", risk: "write", effect: "create-post", state: "available", executorSource: "built-in", interfaceSource: "bundled", permission: "ask" }],
    interfaces: [{ id: "draft", title: "Example draft", source: "user", digest: "c".repeat(64), activeDigest: null, state: "draft", operationCount: 1, adapterIds: ["x-web"], activationTargets: [{ adapterId: "x-web", installedDigest: "d".repeat(64) }], issues: [] }],
    policy: { managed: true, revision: 7 }, web: { revision: 0, gatewayOnly: false, rules: [] },
    approvals: [{ id: "approval", digest: "e".repeat(64), kind: "provider", title: "Create post", account: "personal", effect: "create-post", preview: "Post: hello world", expiresAt: "2026-09-20T00:00:00Z" }],
    connectionProviders: [{ id: "x-web", title: "X browser sign-in" }], vault: { provider: "1password", available: true, purpose: "x-user-token-import" }, ...overrides,
  };
}

function helper(initial = snapshot()) {
  const requests: ControlRequest[] = [];
  let current = initial;
  let nextMutation: ControlResponse = { ok: true, data: { kind: "success", message: "Saved." } };
  let closeCount = 0;
  const client: HelperClient = {
    request: async (request) => {
      requests.push(request);
      if (request.action === "snapshot") return { ok: true, data: { kind: "snapshot", snapshot: { ...current, accountId: request.accountId } } };
      if (request.action === "activity.query") return { ok: true, data: { kind: "activity", page: { rows: [], nextCursor: "next", snapshotSequence: 1, matchingCount: 0, newerCount: 0 } } };
      return nextMutation;
    },
    close: async () => { closeCount += 1; },
  };
  return { client, requests, setSnapshot: (value: ControlSnapshot) => { current = value; }, setMutation: (value: ControlResponse) => { nextMutation = value; }, get closeCount() { return closeCount; } };
}

async function confirm(controller: TuiController): Promise<void> {
  const dialog = controller.state.dialog;
  expect(dialog?.kind).toBe("confirm");
  if (dialog?.kind !== "confirm") throw new Error("missing confirmation");
  await controller.key("end");
  const screen = renderTui(controller.state, 100, 30);
  expect(screen.reviewEndVisible).toBe(true);
  dialog.reviewed = screen.reviewEndVisible;
  for (const text of "yes") await controller.key({ text });
  await controller.key("enter");
}

function terminal() {
  const output: string[] = []; const modes: boolean[] = [];
  let data: ((chunk: string | Uint8Array) => void) | undefined;
  let resize: (() => void) | undefined; let signal: (() => void) | undefined;
  let columns = 100; let rows = 30; let disposed = 0; let paused = false;
  const io: TuiTerminal = {
    isTerminal: true, wasRaw: false, size: () => ({ columns, rows }), write: (text) => { output.push(text); }, setRawMode: (mode) => { modes.push(mode); }, resume: () => {}, pause: () => { paused = true; },
    onData: (handler) => { data = handler; return () => { data = undefined; disposed += 1; }; },
    onResize: (handler) => { resize = handler; return () => { resize = undefined; disposed += 1; }; },
    onSignal: (handler) => { signal = handler; return () => { signal = undefined; disposed += 1; }; },
  };
  return { io, output, modes, send: (value: string) => data?.(value), resize: (width: number, height: number) => { columns = width; rows = height; resize?.(); }, signal: () => signal?.(), get disposed() { return disposed; }, get paused() { return paused; } };
}

describe("terminal input", () => {
  test("paste markers split at every byte cannot issue shortcuts or confirmation", () => {
    const paste = "\x1b[200~qyes\r\x03\x1b[A\x1b[201~";
    for (let split = 0; split <= paste.length; split += 1) {
      const input = new TuiInput();
      expect([...input.feed(paste.slice(0, split)), ...input.feed(paste.slice(split))]).toEqual([]);
      expect(input.feed("r")).toEqual([{ text: "r" }]);
    }
  });
  test("fragmented arrows, escape, Unicode and unknown controls are bounded", () => {
    const input = new TuiInput();
    expect(input.feed("\x1b[")).toEqual([]); expect(input.feed("A")).toEqual(["up"]);
    expect(input.feed("\x1b")).toEqual([]); expect(input.flushEscape()).toEqual(["escape"]);
    const bytes = Buffer.from("東");
    expect([...input.feed(bytes.subarray(0, 2)), ...input.feed(bytes.subarray(2))]).toEqual([{ text: "東" }]);
    expect(input.feed("\x1b[99999~")).toEqual([]);
    expect(input.feed("\x00\x07")).toEqual([]);
    expect(input.feed("x".repeat(70_000))).toEqual([]);
    expect(input.feed("\x03")).toEqual(["interrupt"]);
    expect(input.feed("\x1bO")).toEqual([]); expect(input.feed("A")).toEqual(["up"]);
  });
  test("large bracketed paste keeps suppression until its split end marker", () => {
    const input = new TuiInput();
    expect(input.feed("\x1b[200~" + "x".repeat(70_000) + "\x1b[20")).toEqual([]);
    expect(input.feed("1~")).toEqual([]); expect(input.feed("q")).toEqual([{ text: "q" }]);
  });
  test("an unbracketed text burst cannot navigate and approve in one read", () => {
    const input = new TuiInput();
    expect(input.feed("4\r\ryes\r")).toEqual([]);
    expect(input.feed("yes\r")).toEqual([]);
    expect(input.feed("yes")).toEqual([]);
    expect(input.feed("\x1b[B\x1b[B")).toEqual(["down", "down"]);
  });
});

describe("screen model", () => {
  test("every section retains status and help at ordinary and narrow widths", () => {
    const state = createTuiState(); applyTuiSnapshot(state, snapshot());
    for (const width of [45, 60, 100, 200]) for (const section of ["Setup", "Accounts", "Capabilities", "Approvals", "Activity", "Interfaces"] as const) {
      selectTuiSection(state, section);
      const { text } = renderTui(state, width, 24);
      expect(text).toContain("Ghostget"); expect(text).toContain("Connected"); expect(text).toContain("exit");
      expect(text.split("\n").length).toBeLessThanOrEqual(24);
      expect(text.split("\n").every((line) => Bun.stringWidth(line) < width)).toBe(true);
      expect(text).not.toContain("\x1b");
    }
  });
  test("empty states give the next action and first read needs no account", () => {
    const state = createTuiState(); state.browserConnections = true; applyTuiSnapshot(state, snapshot({ accountId: null, accounts: [], approvals: [], interfaces: [] }));
    expect(renderTui(state, 100, 30).text).toContain("ghostget read https://example.com");
    selectTuiSection(state, "Accounts"); expect(renderTui(state, 100, 30).text).toContain("Press c to connect");
    selectTuiSection(state, "Approvals"); expect(renderTui(state, 100, 30).text).toContain("No requests waiting");
    expect(renderTuiSnapshot(state)).toContain("No account (public scope)");
  });
  test("refresh preserves selection by identity when rows reorder", () => {
    const state = createTuiState(); const base = snapshot(); const other = { ...base.accounts[0]!, id: "other" };
    applyTuiSnapshot(state, { ...base, accounts: [base.accounts[0]!, other] }); selectTuiSection(state, "Accounts"); state.selected = 1;
    applyTuiSnapshot(state, { ...base, accounts: [other, base.accounts[0]!] });
    expect(state.selected).toBe(0); expect(tuiRows(state)[state.selected]?.id).toBe("other");
  });
  test("arbitrary provider text cannot inject terminal controls or exceed geometry", () => {
    fc.assert(fc.property(fc.string({ maxLength: 300 }), fc.integer({ min: 0, max: 260 }), fc.integer({ min: 0, max: 90 }), (title, width, height) => {
      const state = createTuiState(); applyTuiSnapshot(state, snapshot({ version: `${title}\x1b]52;c;secret\x07\u202e` }));
      const result = renderTui(state, width, height).text;
      expect(result).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u);
      expect(result.length).toBeLessThan(40_000);
      expect(result.split("\n").length).toBeLessThanOrEqual(Math.max(1, Math.min(80, height)));
    }), propertyParameters);
    expect(tuiText("safe\x1b[2J\x1b]52;c;secret\x07\nnext\u202e")).toBe("safe next");
  });
});

describe("reviewed control actions", () => {
  test("permission request retains the reviewed account, revision and capability digest", async () => {
    const fake = helper(); const controller = new TuiController(fake.client, "personal"); await controller.refresh();
    await controller.key({ text: "3" }); await controller.key("enter"); await controller.key("down"); await controller.key("enter");
    expect(fake.requests.filter((request) => request.action === "permission.set")).toHaveLength(0);
    await confirm(controller);
    expect(fake.requests.filter((request) => request.action === "permission.set")).toEqual([{ action: "permission.set", adapterId: "x-web", operationId: "post", accountId: "personal", decision: "allow", expectedRevision: 7, expectedCapabilityDigest: "b".repeat(64) }]);
  });
  test("cannot confirm until the complete review was displayed and Esc discards it", async () => {
    const base = snapshot(); const fake = helper({ ...base, approvals: [{ ...base.approvals[0]!, preview: "long preview ".repeat(300) }] });
    const controller = new TuiController(fake.client); await controller.refresh(); await controller.key({ text: "4" }); await controller.key("enter"); await controller.key("enter");
    expect(renderTui(controller.state, 60, 16).reviewEndVisible).toBe(false);
    for (const text of "yes") await controller.key({ text }); await controller.key("enter");
    expect(fake.requests.filter((request) => request.action === "approval.decide")).toHaveLength(0);
    await controller.key("escape"); expect(controller.state.dialog).toBeNull();
  });
  test("approval and interface activation send exact digests only after review", async () => {
    const fake = helper(); const controller = new TuiController(fake.client); await controller.refresh();
    await controller.key({ text: "4" }); await controller.key("enter"); await controller.key("enter"); await confirm(controller);
    expect(fake.requests).toContainEqual({ action: "approval.decide", id: "approval", digest: "e".repeat(64), decision: "allow-once" });
    await controller.key({ text: "6" }); await controller.key("enter"); await controller.key("enter"); await confirm(controller);
    expect(fake.requests).toContainEqual({ action: "interface.activate", id: "draft", digest: "c".repeat(64), adapterId: "x-web", expectedInstalledDigest: "d".repeat(64) });
  });
  test("timed-out changes are never retried and block further writes until refresh", async () => {
    const fake = helper(); fake.setMutation({ ok: false, code: "CONTROL_TIMEOUT", message: "Unconfirmed result" });
    const controller = new TuiController(fake.client); await controller.refresh(); await controller.key({ text: "4" }); await controller.key("enter"); await controller.key("enter"); await confirm(controller);
    expect(controller.state.fresh).toBe(false); expect(controller.state.notice).toContain("No action was retried");
    await controller.key("enter"); await controller.key("enter");
    expect(controller.state.dialog).toBeNull();
    expect(fake.requests.filter((request) => request.action === "approval.decide")).toHaveLength(1);
  });
  test("sign-in offers the Chrome profile discovery found on this machine", async () => {
    const browsers = [
      { key: "safari", label: "Safari", browser: "safari" as const, profile: null },
      { key: "chrome-profile-9", label: "Chrome \u00b7 Your Chrome (Profile 9)", browser: "chrome" as const, profile: "Profile 9" },
    ];
    const fake = helper(snapshot({ accounts: [], accountId: null }));
    const controller = new TuiController(fake.client, null, () => {}, "darwin", browsers);
    await controller.refresh();
    await controller.key({ text: "2" }); await controller.key({ text: "c" }); await controller.key("enter");
    expect(JSON.stringify(controller.state.dialog)).toContain("Your Chrome (Profile 9)");
    await controller.key("down"); await controller.key("enter"); await controller.key("enter");
    fake.setMutation({ ok: true, data: { kind: "connection", attemptId: "attempt", status: "awaiting-sign-in", subject: null } });
    await confirm(controller);
    expect(fake.requests).toContainEqual({ action: "connection.begin", id: "x-main", provider: "x-web", browser: "chrome", profile: "Profile 9", expectedRevision: null });
  });
  test("sign-in saves only the independently verified subject", async () => {
    const fake = helper(snapshot({ accounts: [], accountId: null })); const controller = new TuiController(fake.client, null, () => {}, "darwin"); await controller.refresh();
    await controller.key({ text: "2" }); await controller.key({ text: "c" }); await controller.key("enter"); await controller.key("enter"); await controller.key("enter");
    fake.setMutation({ ok: true, data: { kind: "connection", attemptId: "attempt", status: "awaiting-sign-in", subject: null } }); await confirm(controller);
    expect(fake.requests).toContainEqual({ action: "connection.begin", id: "x-main", provider: "x-web", browser: "safari", profile: null, expectedRevision: null });
    await controller.key({ text: "s" }); expect(controller.state.dialog).toBeNull();
    fake.setMutation({ ok: true, data: { kind: "connection", attemptId: "attempt", status: "verified", subject: "verified-owner" } });
    await controller.key({ text: "v" }); await confirm(controller);
    fake.setMutation({ ok: true, data: { kind: "success", message: "Connected" } });
    await controller.key({ text: "s" }); await confirm(controller);
    expect(fake.requests).toContainEqual({ action: "connection.commit", attemptId: "attempt", expectedSubject: "verified-owner" });
  });
  test("Linux retains account management but does not offer the macOS browser flow", async () => {
    const fake = helper(); const controller = new TuiController(fake.client, null, () => {}, "linux"); await controller.refresh();
    await controller.key({ text: "2" }); await controller.key({ text: "c" });
    expect(controller.state.dialog).toBeNull(); expect(controller.state.notice).toContain("requires macOS");
    expect(fake.requests.some((request) => request.action === "connection.begin")).toBe(false);
  });
  test("review preserves a long request's last bytes and meaningful whitespace", () => {
    const state = createTuiState(); applyTuiSnapshot(state, snapshot());
    state.dialog = { kind: "confirm", title: "Review", detail: ["x".repeat(40_000) + "  END  ", "control: \x1b[2J"], request: { action: "approval.decide", id: "one", digest: "a".repeat(64), decision: "allow-once" }, value: "", scroll: 1_048_576, reviewed: false };
    const rendered = renderTui(state, 80, 24);
    expect(rendered.text).toContain("  END  "); expect(rendered.text).toContain("\\u001b[2J"); expect(rendered.reviewEndVisible).toBe(true);
    expect(rendered.reviewOffset).toBeGreaterThan(400);
  });
  test("zero-width combining runs stay bounded per row without hiding the preview tail", () => {
    const state = createTuiState(); applyTuiSnapshot(state, snapshot());
    state.dialog = { kind: "confirm", title: "Review", detail: ["\u0301".repeat(120_000) + "END"], request: { action: "approval.decide", id: "one", digest: "a".repeat(64), decision: "allow-once" }, value: "", scroll: 1_048_576, reviewed: false };
    const rendered = renderTui(state, 80, 24);
    expect(rendered.text).toContain("END"); expect(rendered.text.length).toBeLessThan(8_000);
    expect(rendered.reviewEndVisible).toBe(true);
  });
});

describe("terminal lifecycle and CLI", () => {
  test("plain snapshot and help do not require a terminal or emit escape sequences", async () => {
    const fake = helper(); const tty = terminal(); const lines: string[] = []; const errors: string[] = [];
    const output = { stdout: (text: string) => lines.push(text), stderr: (text: string) => errors.push(text) };
    const options = { helper: () => fake.client, terminal: { ...tty.io, isTerminal: false } };
    expect(await runTuiCommand(["tui", "--help"], {}, output, options)).toBe(0); expect(fake.requests).toEqual([]);
    expect(await runTuiCommand(["tui"], {}, output, options)).toBe(1); expect(fake.requests).toEqual([]);
    expect(await runTuiCommand(["tui", "--snapshot", "--account", "personal"], {}, output, options)).toBe(0);
    expect(lines.join("")).not.toContain("\x1b"); expect(fake.closeCount).toBe(1); expect(tty.modes).toEqual([]);
    expect(errors.join("")).toContain("--snapshot");
  });
  test("invalid flags fail before spawning a helper", async () => {
    const fake = helper();
    for (const args of [["tui", "--snapshot", "--snapshot"], ["tui", "--account"], ["tui", "--account", "../bad"], ["tui", "--help", "--snapshot"]]) {
      expect(await runTuiCommand(args, {}, { stdout: () => {}, stderr: () => {} }, { helper: () => fake.client })).toBe(1);
    }
    expect(fake.requests).toEqual([]);
  });
  test("quit, resize and signals restore raw mode, cursor and alternate screen", async () => {
    for (const stop of ["q", "\x03", "signal"] as const) {
      const tty = terminal(); const fake = helper(); const running = runInteractiveTui(fake.client, tty.io);
      tty.resize(20, 4); expect(tty.output.join("")).toContain("Enlarge terminal");
      if (stop === "signal") tty.signal(); else tty.send(stop);
      await running;
      expect(tty.modes).toEqual([true, false]); expect(tty.output.at(-1)).toBe("\x1b[?2004l\x1b[?25h\x1b[0m\x1b[?1049l");
      expect(tty.disposed).toBe(3); expect(tty.paused).toBe(true);
    }
  });
  test("a failure entering or using the terminal still restores its original mode", async () => {
    const tty = terminal();
    await expect(withTuiTerminal({ ...tty.io, wasRaw: true }, async () => { throw new Error("synthetic failure"); })).rejects.toThrow("synthetic failure");
    expect(tty.modes).toEqual([true, true]); expect(tty.output.at(-1)).toContain("?1049l");
    const setup = terminal(); let writes = 0;
    await expect(withTuiTerminal({ ...setup.io, write: () => { writes += 1; throw new Error("write failed"); } }, async () => {})).rejects.toThrow("write failed");
    expect(writes).toBe(2); expect(setup.modes).toEqual([true, false]);
  });
  test("helper collision is plain actionable output and the helper closes", async () => {
    let closed = false; const errors: string[] = [];
    const client: HelperClient = { request: async () => ({ ok: false, code: "CONTROL_ALREADY_RUNNING", message: "Stop the menu bar with ghostget menubar stop, then start ghostget tui." }), close: async () => { closed = true; } };
    expect(await runTuiCommand(["tui", "--snapshot"], {}, { stdout: () => {}, stderr: (text) => errors.push(text) }, { helper: () => client })).toBe(1);
    expect(errors.join("")).toContain("ghostget menubar stop"); expect(closed).toBe(true);
  });
});
