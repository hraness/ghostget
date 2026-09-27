import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CookieSelection } from "@hraness/kb/clip/acquire";

import { browserProfilesJson, renderBrowserProfiles } from "./browser-profiles-cli";
import { responsibleApp } from "./cli-style";
import {
  classifyCookieProviderResult,
  classifyKeychainFailure,
  configureCookieAccessNotice,
  CookieAccessError,
  CookieAccessSkippedError,
  cookieAccessRemedy,
  createClassifiedCookieRecordReader,
  detectCookieAudience,
  findCookieAccessError,
  keychainNoticeLines,
  classifyTerminalKey,
  showKeychainNotice,
  terminalReadKey,
  UNPROMPTED_KEYCHAIN_READ_MS,
  type CookieNoticeIO,
  type KeyInput,
} from "./cookie-access";
import { cookieAccessNext } from "./ghostget";
import { parseKeychainNoticeRecord, stateKeychainNoticeRecord } from "./keychain-notice-record";
import { renderCookieAccessFailure } from "./ghostget";
import { readFailureProjection, permissionReadFailure } from "./web-session-execution";
import { providerReadFailureProjection } from "./providers/read-failure";

const target = new URL("https://example.com/");
const selection = (sources: readonly ("chrome" | "safari" | "arc")[]): CookieSelection => ({
  cookieSources: sources,
  cookieProfile: undefined,
  cookiesFile: undefined,
  timeoutMs: 1_000,
});

// The exact text @steipete/sweet-cookie 0.4.3 produces when `security` fails.
const deniedWarning = "Failed to read macOS Keychain (Chrome Safe Storage): security: SecKeychainSearchCopyNext: The user name or passphrase you entered is not correct.";
const canceledWarning = "Failed to read macOS Keychain (Arc Safe Storage): User canceled the operation.";
const timeoutWarning = "Failed to read macOS Keychain (Chrome Safe Storage): \nTimed out after 3000ms";
const missingWarning = "Failed to read macOS Keychain (Chrome Safe Storage): security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.";
const edgeWarning = "Failed to read macOS Keychain (Microsoft Edge Safe Storage): exit 51";

function captureNotice(overrides: Partial<CookieNoticeIO> = {}): { io: CookieNoticeIO; text: () => string } {
  let written = "";
  return {
    io: {
      environment: { LANG: "en_US.UTF-8" },
      stdinIsTTY: false,
      stderrIsTTY: true,
      write: (text) => { written += text; },
      confirm: false,
      ...overrides,
    },
    text: () => written,
  };
}

describe("keychain failure classification", () => {
  test.each([
    ["The user name or passphrase you entered is not correct.", "denied"],
    ["User canceled the operation.", "denied"],
    ["exit 51", "denied"],
    ["exit 45", "denied"],
    ["exit 128", "denied"],
    ["User interaction is not allowed.", "unavailable"],
    ["exit 36", "unavailable"],
    ["\nTimed out after 3000ms", "unavailable"],
    ["The specified item could not be found in the keychain.", "missing"],
    ["exit 44", "missing"],
    ["something else", null],
  ] as const)("%p is %p", (text, expected) => {
    expect(classifyKeychainFailure(text)).toBe(expected);
  });

  test("reads the browser from the provider warning", () => {
    expect(classifyCookieProviderResult({ cookies: [], warnings: [deniedWarning] }, ["chrome"]))
      .toEqual({ code: "KEYCHAIN_DENIED", browser: "Chrome" });
    expect(classifyCookieProviderResult({ cookies: [], warnings: [canceledWarning] }, ["arc"]))
      .toEqual({ code: "KEYCHAIN_DENIED", browser: "Arc" });
    expect(classifyCookieProviderResult({ cookies: [], warnings: [edgeWarning] }, ["edge"]))
      .toEqual({ code: "KEYCHAIN_DENIED", browser: "Microsoft Edge" });
    expect(classifyCookieProviderResult({ cookies: [], warnings: [timeoutWarning] }, ["chrome"]))
      .toEqual({ code: "KEYCHAIN_UNAVAILABLE", browser: "Chrome" });
  });

  test("a missing key or unrelated warning is not a permission failure", () => {
    expect(classifyCookieProviderResult({ cookies: [], warnings: [missingWarning] }, ["chrome"])).toBeNull();
    expect(classifyCookieProviderResult({ cookies: [], warnings: ["Chrome cookies database not found."] }, ["chrome"])).toBeNull();
    expect(classifyCookieProviderResult(null, ["chrome"])).toBeNull();
    expect(classifyCookieProviderResult({ warnings: "not a list" }, ["chrome"])).toBeNull();
  });

  test("Safari EPERM in a warning is a Full Disk Access denial", () => {
    expect(classifyCookieProviderResult({
      cookies: [],
      warnings: ["Failed to read Safari cookies: EPERM: operation not permitted, open '/x/Cookies.binarycookies'"],
    }, ["safari"])).toEqual({ code: "FDA_DENIED", browser: "Safari" });
  });
});

describe("classified cookie reader", () => {
  test("turns a denied keychain read into KEYCHAIN_DENIED instead of no cookies", async () => {
    const reader = createClassifiedCookieRecordReader(async () => ({ cookies: [], warnings: [deniedWarning] }), { platform: "linux" });
    const error = await reader(selection(["chrome"]), target).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(CookieAccessError);
    const denied = error as CookieAccessError;
    expect(denied.code).toBe("KEYCHAIN_DENIED");
    expect(denied.permission).toBe("keychain");
    expect(denied.requester).toBe("security");
    expect(denied.settingsUrl).toBeNull();
    expect(denied.message).toBe("Ghostget can't use \"Chrome Safe Storage\" from your keychain: the keychain request was denied");
    expect(cookieAccessRemedy(denied)).toBe("Run it again and choose Always Allow when macOS asks.");
  });

  test("reports Safari blocked by Full Disk Access with a Settings link", async () => {
    const reader = createClassifiedCookieRecordReader(async () => ({ cookies: [], warnings: ["Safari Cookies.binarycookies not found."] }), {
      platform: "darwin",
      probeSafari: () => "denied",
      environment: { TERM_PROGRAM: "iTerm.app" },
    });
    const error = await reader(selection(["safari"]), target).then(() => null, (caught: unknown) => caught) as CookieAccessError;
    expect(error.code).toBe("FDA_DENIED");
    expect(error.requester).toBe("iTerm");
    expect(error.settingsUrl).toBe("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles");
    expect(error.message).toBe("Ghostget can't read Safari's cookies: macOS access is off for iTerm");
    expect(cookieAccessRemedy(error)).toBe("Turn on iTerm in System Settings › Privacy & Security › Full Disk Access.");
  });

  test("keeps the original error when Safari is simply empty", async () => {
    const reader = createClassifiedCookieRecordReader(async () => ({ cookies: [], warnings: ["Safari Cookies.binarycookies not found."] }), {
      platform: "darwin",
      probeSafari: () => "missing",
    });
    const error = await reader(selection(["safari"]), target).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CookieAccessError);
  });

  test("a named Safari cookie file is not blamed on Full Disk Access", async () => {
    let probed = 0;
    const reader = createClassifiedCookieRecordReader(async () => ({ cookies: [], warnings: [] }), {
      platform: "darwin",
      probeSafari: () => { probed += 1; return "denied"; },
    });
    const error = await reader({ ...selection(["safari"]), cookieProfile: "/tmp/Other.binarycookies" }, target)
      .then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CookieAccessError);
    expect(probed).toBe(0);
  });

  test("returns cookies unchanged when the read works", async () => {
    const reader = createClassifiedCookieRecordReader(async () => ({
      cookies: [{ name: "sid", value: "v", domain: "example.com", hostOnly: true, path: "/", secure: true, httpOnly: true }],
      warnings: [],
    }), { platform: "linux" });
    const result = await reader(selection(["chrome"]), target);
    expect(result.cookies.map((cookie) => cookie.name)).toEqual(["sid"]);
  });

  test("shows the notice once per browser before the first keychain read, only on macOS", async () => {
    const reads: string[] = [];
    const capture = captureNotice();
    configureCookieAccessNotice(capture.io);
    try {
      const reader = createClassifiedCookieRecordReader(async () => {
        reads.push(capture.text());
        return { cookies: [{ name: "sid", value: "v", domain: "example.com", hostOnly: true, path: "/", secure: true, httpOnly: true }], warnings: [] };
      }, { platform: "darwin" });
      await reader(selection(["chrome"]), target);
      await reader(selection(["chrome"]), target);
      expect(reads[0]).toContain("macOS will ask to let security use \"Chrome Safe Storage\"");
      expect(capture.text().match(/macOS will ask/gu)?.length).toBe(1);
      const linux = createClassifiedCookieRecordReader(async () => ({ cookies: [], warnings: [] }), { platform: "linux" });
      configureCookieAccessNotice(captureNotice().io);
      await linux(selection(["arc"]), target).catch(() => undefined);
    } finally {
      configureCookieAccessNotice(null);
    }
  });

  test("skipping the notice stops before any keychain read", async () => {
    let reads = 0;
    const capture = captureNotice({ stdinIsTTY: true, confirm: true, readKey: async () => "s" });
    configureCookieAccessNotice(capture.io);
    try {
      const reader = createClassifiedCookieRecordReader(async () => { reads += 1; return { cookies: [], warnings: [] }; }, { platform: "darwin" });
      const error = await reader(selection(["arc"]), target).then(() => null, (caught: unknown) => caught);
      expect(error).toBeInstanceOf(CookieAccessSkippedError);
      expect(reads).toBe(0);
    } finally {
      configureCookieAccessNotice(null);
    }
  });

  test("library use prints nothing", async () => {
    configureCookieAccessNotice(null);
    const reader = createClassifiedCookieRecordReader(async () => ({ cookies: [], warnings: [] }), { platform: "darwin" });
    await reader(selection(["chrome"]), target).catch(() => undefined);
  });
});

describe("keychain notice copy", () => {
  test("names security and explains Always Allow", () => {
    expect(keychainNoticeLines("Chrome")).toEqual([
      "macOS will ask to let security use \"Chrome Safe Storage\" from your keychain for Ghostget.",
      "Ghostget uses it to read the Chrome sign-in you already have and never stores it. Enter your Mac password if asked, then choose Always Allow so macOS doesn't ask again.",
    ]);
  });

  test("human terminal gets the symbol notice without a key prompt", async () => {
    const capture = captureNotice();
    expect(await showKeychainNotice("Chrome", capture.io)).toBe("continue");
    expect(capture.text()).toBe(
      "🔐 macOS will ask to let security use \"Chrome Safe Storage\" from your keychain for Ghostget.\n"
      + "   Ghostget uses it to read the Chrome sign-in you already have and never stores it. Enter your Mac password if asked, then choose Always Allow so macOS doesn't ask again.\n",
    );
  });

  test("NO_COLOR keeps the Unicode symbol and plain text", async () => {
    const capture = captureNotice({ environment: { LANG: "en_US.UTF-8", NO_COLOR: "1" } });
    await showKeychainNotice("Arc", capture.io);
    expect(capture.text()).not.toContain("\u001b[");
    expect(capture.text().startsWith("🔐 macOS will ask")).toBeTrue();
  });

  test("a dumb terminal falls back to ASCII", async () => {
    const capture = captureNotice({ environment: { TERM: "dumb" } });
    await showKeychainNotice("Arc", capture.io);
    expect(capture.text().startsWith("NOTE macOS will ask")).toBeTrue();
  });

  test("explicit setup waits for Enter", async () => {
    const capture = captureNotice({ stdinIsTTY: true, confirm: true, readKey: async () => "enter" });
    expect(await showKeychainNotice("Brave", capture.io)).toBe("continue");
    expect(capture.text()).toContain("   Press Enter to continue · s to skip\n");
  });

  test("other keys wait again with the time that is left", async () => {
    const keys: ("other" | "enter")[] = ["other", "other", "enter"];
    const waits: number[] = [];
    const capture = captureNotice({
      stdinIsTTY: true,
      confirm: true,
      readKey: async (seconds) => { waits.push(seconds); return keys.shift() ?? "enter"; },
    });
    expect(await showKeychainNotice("Brave", capture.io)).toBe("continue");
    expect(waits).toHaveLength(3);
    expect(waits.every((seconds) => seconds > 0 && seconds <= 120)).toBeTrue();
  });

  test("a terminal that can't read single keys goes on after the notice", async () => {
    let calls = 0;
    const capture = captureNotice({ stdinIsTTY: true, confirm: true, readKey: async () => { calls += 1; return "unavailable"; } });
    expect(await showKeychainNotice("Brave", capture.io)).toBe("continue");
    expect(calls).toBe(1);
    expect(capture.text()).toContain("macOS will ask to let security use \"Brave Safe Storage\"");
  });

  test("agents get one structured line", async () => {
    const capture = captureNotice({ environment: { CLAUDECODE: "1" }, stderrIsTTY: false });

    await showKeychainNotice("Chrome", capture.io);
    const line = JSON.parse(capture.text()) as Record<string, unknown>;
    expect(line).toEqual({
      type: "permission-notice",
      product: "Ghostget",
      kind: "keychain",
      message: `${keychainNoticeLines("Chrome")[0]} ${keychainNoticeLines("Chrome")[1]}`,
    });
  });

  test("non-TTY without an agent marker stays quiet", async () => {
    const capture = captureNotice({ stderrIsTTY: false });
    await showKeychainNotice("Chrome", capture.io);
    expect(capture.text()).toBe("");
  });

  test("audience detection follows the shared rule", () => {
    expect(detectCookieAudience({ HRANESS_AUDIENCE: "agent" }, true)).toBe("agent");
    expect(detectCookieAudience({ HRANESS_AUDIENCE: "off" }, true)).toBe("quiet");
    expect(detectCookieAudience({ CODEX_SANDBOX: "seatbelt" }, true)).toBe("agent");
    expect(detectCookieAudience({ CODEX: "1" }, true)).toBe("human");
    expect(detectCookieAudience({}, false)).toBe("quiet");
  });

  test("names the terminal app macOS lists", () => {
    expect(responsibleApp({ TERM_PROGRAM: "Apple_Terminal" })).toBe("Terminal");
    expect(responsibleApp({ __CFBundleIdentifier: "com.mitchellh.ghostty" })).toBe("Ghostty");
    expect(responsibleApp({ HRANESS_APP_BUNDLE_ID: "com.hraness.ghostget" })).toBe("Ghostget");
    expect(responsibleApp({})).toBe("your terminal app");
  });
});

describe("permission failures reach every caller", () => {
  const denied = new CookieAccessError("KEYCHAIN_DENIED", "Chrome", "security");

  test("findCookieAccessError walks the cause chain", () => {
    const wrapped = new Error("outer", { cause: new Error("middle", { cause: denied }) });
    expect(findCookieAccessError(wrapped)).toBe(denied);
    expect(findCookieAccessError(new Error("plain"))).toBeNull();
  });

  test("read failures say grant-permission, never repair-auth", () => {
    expect(permissionReadFailure(new Error("x", { cause: denied }))).toEqual(readFailureProjection("permission-denied"));
    expect(readFailureProjection("permission-denied").retryDisposition).toBe("grant-permission");
    expect(providerReadFailureProjection(new Error("authenticated web request returned unreviewed status 401", { cause: denied }), {
      stage: "identity",
      authenticated: true,
    })).toEqual({ category: "permission-denied", retryDisposition: "grant-permission" });
  });

  const arguments_ = { command: "auth-bind", id: "work", site: "x", force: false, json: false } as const;

  function render(error: unknown, environment: Record<string, string> = {}, json = false) {
    let stdout = "";
    let stderr = "";
    const code = renderCookieAccessFailure(error, { ...arguments_, json } as never, { LANG: "en_US.UTF-8", NO_COLOR: "1", ...environment }, {
      stdout: (text: string) => { stdout += text; },
      stderr: (text: string) => { stderr += text; },
    } as never, true);
    return { code, stdout, stderr };
  }

  test("human auth bind denial", () => {
    expect(render(new Error("probe failed", { cause: denied }))).toEqual({
      code: 3,
      stdout: "",
      stderr: "✗ Ghostget can't use \"Chrome Safe Storage\" from your keychain: the keychain request was denied.\n"
        + "  Run it again and choose Always Allow when macOS asks.\n"
        + "→ ghostget auth bind work --site x\n",
    });
  });

  test("a color terminal colors only the symbols", () => {
    const result = render(denied, { NO_COLOR: "" });
    expect(result.stderr.startsWith("\u001b[31m✗\u001b[0m Ghostget can't")).toBeTrue();
    expect(result.stderr.replaceAll(/\u001b\[[0-9;]*m/gu, "")).toBe(render(denied).stderr);
  });

  test("ASCII fallback on a dumb terminal", () => {
    const result = render(denied, { TERM: "dumb" });
    expect(result.stderr.startsWith("FAIL Ghostget can't")).toBeTrue();
    expect(result.stderr).toContain("\n-> ghostget auth bind work --site x\n");
  });

  test("--json and agents get a typed error", () => {
    const fda = new CookieAccessError("FDA_DENIED", "Safari", "Terminal");
    for (const [result, next] of [
      [render(fda, {}, true), "ghostget auth bind work --site x --json"],
      [render(fda, { CLAUDECODE: "1" }), "ghostget auth bind work --site x"],
    ] as const) {
      expect(result.code).toBe(3);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        ok: false,
        error: {
          code: "permission-denied",
          kind: "full-disk-access",
          reason: "FDA_DENIED",
          message: "Ghostget can't read Safari's cookies: macOS access is off for Terminal.",
          next,
          settingsUrl: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
        },
      });
    }
  });

  test("a skipped notice is reported as skipped", () => {
    expect(render(new CookieAccessSkippedError("Arc")).stderr).toBe(
      "✗ Stopped before reading your Arc sign-in. Nothing was read.\n→ ghostget auth bind work --site x\n",
    );
  });

  test("other errors are left to the generic handler", () => {
    expect(render(new Error("nope")).code).toBeNull();
  });
});

describe("browsers list", () => {
  test("Safari blocked by Full Disk Access is not reported as not installed", () => {
    const discovery = [
      { source: "safari" as const, installed: true, profiles: [], blocked: "full-disk-access" as const },
      { source: "firefox" as const, installed: false, profiles: [] },
    ];
    const text = renderBrowserProfiles(discovery, "Ghostty");
    expect(text).toContain(
      "  safari · blocked: needs Full Disk Access\n"
      + "    macOS doesn't ask for this. Turn on\n"
      + "    Ghostty in System Settings › Privacy & Security › Full Disk Access.\n"
      + "    Open Settings:\n"
      + "    open 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'\n",
    );
    expect(text).toContain("Not installed: firefox");
    expect(text).not.toContain("Not installed: safari");
    expect(browserProfilesJson(discovery).browsers).toEqual([
      {
        source: "safari",
        installed: true,
        blocked: {
          permission: "full-disk-access",
          settingsUrl: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
        },
        profiles: [],
      },
      { source: "firefox", installed: false, profiles: [] },
    ]);
  });

  test("an unreadable home reports Safari as missing, not blocked", async () => {
    const { safariCookieAccess } = await import("./browser-profiles");
    expect(safariCookieAccess(mkdtempSync(join(tmpdir(), "ghostget-safari-")))).toBe("missing");
  });
});

describe("keychain notice follow-ups", () => {
  const cookie = { name: "sid", value: "v", domain: "example.com", hostOnly: true, path: "/", secure: true, httpOnly: true } as const;

  test("skips the notice for a browser whose access already worked", async () => {
    const capture = captureNotice({ record: { has: (browser) => browser === "Chrome" } });
    configureCookieAccessNotice(capture.io);
    try {
      const reader = createClassifiedCookieRecordReader(async () => ({ cookies: [cookie], warnings: [] }), { platform: "darwin" });
      await reader(selection(["chrome"]), target);
      expect(capture.text()).toBe("");
      await reader(selection(["arc"]), target);
      expect(capture.text()).toContain("\"Arc Safe Storage\"");
    } finally {
      configureCookieAccessNotice(null);
    }
  });

  test("records only fast clean single-browser reads and forgets prompted or failed ones", async () => {
    const updates: [string[], string[]][] = [];
    const record = { has: () => false, update: (granted: readonly string[], lost: readonly string[]) => { updates.push([[...granted], [...lost]]); } };
    configureCookieAccessNotice(captureNotice({ record }).io);
    let clock = 0;
    const reader = (warnings: string[], elapsed: number, platform = "darwin", cookies: typeof cookie[] = [cookie]) =>
      createClassifiedCookieRecordReader(async () => { clock += elapsed; return { cookies, warnings }; }, { platform, now: () => clock });
    try {
      await reader([], 5)(selection(["chrome"]), target);
      await reader([], UNPROMPTED_KEYCHAIN_READ_MS + 4_000)(selection(["arc"]), target);
      await reader([deniedWarning], 5)(selection(["chrome"]), target).catch(() => undefined);
      await reader(["Chrome cookies database not found."], 5)(selection(["chrome"]), target).catch(() => undefined);
      await reader([], 5, "linux")(selection(["chrome"]), target);
      await reader([], 5)(selection(["chrome", "arc"]), target);
      expect(updates).toEqual([
        [["Chrome"], []],
        [[], ["Arc"]],
        [[], ["Chrome"]],
      ]);
    } finally {
      configureCookieAccessNotice(null);
    }
  });

  test("the state record round-trips and ignores unknown content", () => {
    const home = mkdtempSync(join(tmpdir(), "ghostget-keychain-record-"));
    const environment = { GHOSTGET_STATE_HOME: join(home, "state") };
    try {
      expect(stateKeychainNoticeRecord(environment).has("Chrome")).toBeFalse();
      stateKeychainNoticeRecord(environment).update?.(["Chrome", "Arc", "Not a browser"], []);
      const reread = stateKeychainNoticeRecord(environment);
      expect(reread.has("Chrome")).toBeTrue();
      expect(reread.has("Arc")).toBeTrue();
      expect(reread.has("Not a browser")).toBeFalse();
      reread.update?.([], ["Arc"]);
      expect(stateKeychainNoticeRecord(environment).has("Arc")).toBeFalse();
      expect(stateKeychainNoticeRecord(environment).has("Chrome")).toBeTrue();
      expect([...parseKeychainNoticeRecord("{\"version\":1,\"browsers\":[\"Arc\",7,\"Nope\"]}")]).toEqual(["Arc"]);
      expect(parseKeychainNoticeRecord("{\"version\":2,\"browsers\":[\"Arc\"]}").size).toBe(0);
      expect(parseKeychainNoticeRecord("not json").size).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("an Edge denial is typed even though the reader reports its fallback item", () => {
    const edgeMissing = "Failed to read macOS Keychain (Microsoft Edge Safe Storage): security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.";
    expect(classifyCookieProviderResult({ warnings: [edgeMissing] }, ["edge"])).toEqual({ code: "KEYCHAIN_DENIED", browser: "Microsoft Edge" });
    expect(classifyCookieProviderResult({ warnings: [missingWarning] }, ["chrome"])).toBeNull();
  });

  test("VS Code-based editors are named by their own app", () => {
    expect(responsibleApp({ TERM_PROGRAM: "vscode" })).toBe("Visual Studio Code");
    expect(responsibleApp({ TERM_PROGRAM: "vscode", __CFBundleIdentifier: "com.microsoft.VSCode" })).toBe("Visual Studio Code");
    expect(responsibleApp({ TERM_PROGRAM: "vscode", __CFBundleIdentifier: "com.todesktop.230313mzl4w4u92" })).toBe("Cursor");
    expect(responsibleApp({ TERM_PROGRAM: "vscode", __CFBundleIdentifier: "com.exafunction.windsurf" })).toBe("Windsurf");
    expect(responsibleApp({ TERM_PROGRAM: "vscode", __CFBundleIdentifier: "com.vscodium" })).toBe("VSCodium");
    expect(responsibleApp({ TERM_PROGRAM: "vscode", __CFBundleIdentifier: "com.example.fork" })).toBe("your code editor");
  });

  test("retry hints keep --force and --json", () => {
    const bind = { command: "auth-bind", id: "work", site: "x", force: false, json: false } as const;
    expect(cookieAccessNext(bind as never)).toBe("ghostget auth bind work --site x");
    expect(cookieAccessNext({ ...bind, force: true, json: true } as never)).toBe("ghostget auth bind work --site x --force --json");
  });

  test("raw key input is read by its first character", () => {
    expect(classifyTerminalKey("\r")).toBe("enter");
    expect(classifyTerminalKey("\r\n")).toBe("enter");
    expect(classifyTerminalKey("S")).toBe("s");
    expect(classifyTerminalKey("\u0004")).toBe("s");
    expect(classifyTerminalKey("\u0003")).toBe("interrupt");
    expect(classifyTerminalKey("\u001b[A")).toBe("other");
  });

  function fakeStdin() {
    const listeners = new Map<string, Set<(value?: unknown) => void>>();
    const calls: string[] = [];
    const input = {
      isRaw: false,
      setRawMode: (mode: boolean) => { calls.push(`raw:${mode}`); },
      on: (event: string, listener: (value?: unknown) => void) => {
        (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(listener);
      },
      off: (event: string, listener: (value?: unknown) => void) => { listeners.get(event)?.delete(listener); },
      resume: () => { calls.push("resume"); },
      pause: () => { calls.push("pause"); },
      unref: () => { calls.push("unref"); },
    };
    const emit = (event: string, value?: unknown) => { for (const listener of [...(listeners.get(event) ?? [])]) listener(value); };
    const count = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    return { input: input as unknown as KeyInput, emit, calls, count };
  }

  test("closed input skips instead of hanging, and stdin is released", async () => {
    const stdin = fakeStdin();
    const pending = terminalReadKey(120, stdin.input);
    stdin.emit("end");
    expect(await pending).toBe("s");
    expect(stdin.calls).toEqual(["raw:true", "resume", "raw:false", "pause", "unref"]);
    expect(stdin.count()).toBe(0);
  });

  test("Enter continues and Ctrl-C interrupts after restoring the terminal", async () => {
    const enter = fakeStdin();
    const first = terminalReadKey(120, enter.input);
    enter.emit("data", Buffer.from("\r"));
    expect(await first).toBe("enter");
    const interrupted = fakeStdin();
    let signalled = 0;
    const second = terminalReadKey(120, interrupted.input, () => { signalled += 1; });
    interrupted.emit("data", "\u0003");
    expect(await second).toBe("s");
    expect(signalled).toBe(1);
    expect(interrupted.calls.at(-1)).toBe("unref");
  });
});
