import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLegacyTray, LEGACY_TRAY_LABELS, MENUBAR_RETIRED, retireTray, runRetiredMenubarCommand } from "./retire-tray";

const homes: string[] = [];
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
function home(): { home: string; agents: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "gg-retire-"))); homes.push(root);
  const agents = join(root, "Library", "LaunchAgents"); mkdirSync(agents, { recursive: true });
  return { home: root, agents };
}
/** The shared runner's autostart file, byte for byte as it writes one. */
function runnerPlist(label: string, program: readonly string[]): string {
  const body = `<plist version="1.0"><dict>\n<key>Label</key><string>${label}</string>\n<key>ProgramArguments</key><array>${program.map((arg) => `<string>${arg}</string>`).join("")}</array>\n<key>RunAtLoad</key><true/>\n</dict></plist>\n`;
  return `<!-- hraness-companion autostart ghostget sha256:${createHash("sha256").update(body).digest("hex")} -->\n${body}`;
}
const booted: string[] = [];
const options = { bootout: async (label: string) => { booted.push(label); }, now: () => new Date(1_000) };

describe("retiring the menu bar login item", () => {
  test("the companion item is booted out and renamed aside, never deleted", async () => {
    const h = home(); booted.length = 0;
    const text = runnerPlist("app.hraness.companion.ghostget", ["/opt/hraness-companion", "--foreground"]);
    writeFileSync(join(h.agents, "app.hraness.companion.ghostget.plist"), text);
    const retired = await retireTray({ HOME: h.home }, "darwin", options);
    expect(retired).toEqual({ label: "app.hraness.companion.ghostget", from: join(h.agents, "app.hraness.companion.ghostget.plist"), to: join(h.agents, "app.hraness.companion.ghostget.plist.retired-1000") });
    expect(booted).toEqual(["app.hraness.companion.ghostget"]);
    expect(readFileSync(retired!.to, "utf8")).toBe(text);
    expect(existsSync(retired!.from)).toBe(false);
  });
  test("the signed local app item is retired too", async () => {
    const h = home(); booted.length = 0;
    writeFileSync(join(h.agents, "app.hraness.ghostget.plist"), runnerPlist("app.hraness.ghostget", [`${h.home}/Applications/Hraness/Ghostget.app/Contents/MacOS/Ghostget`, "--launch", "/state/login-argv.json"]));
    expect((await retireTray({ HOME: h.home }, "darwin", options))?.label).toBe("app.hraness.ghostget");
  });
  test("an edited, foreign or control-owner item is left alone", async () => {
    const h = home(); booted.length = 0;
    const edited = runnerPlist("app.hraness.companion.ghostget", ["/opt/hraness-companion"]).replace("RunAtLoad", "KeepAlive");
    writeFileSync(join(h.agents, "app.hraness.companion.ghostget.plist"), edited);
    writeFileSync(join(h.agents, "app.hraness.ghostget.plist"), runnerPlist("app.hraness.textbutler", ["/opt/other"]));
    writeFileSync(join(h.agents, "app.hraness.ghostget.control.plist"), runnerPlist("app.hraness.ghostget.control", ["/bun", "cli.ts", "control", "serve"]));
    expect(await retireTray({ HOME: h.home }, "darwin", options)).toBeNull();
    expect(booted).toEqual([]);
    expect(readdirSync(h.agents).sort()).toEqual(["app.hraness.companion.ghostget.plist", "app.hraness.ghostget.control.plist", "app.hraness.ghostget.plist"]);
    expect(LEGACY_TRAY_LABELS).not.toContain("app.hraness.ghostget.control");
  });
  test("no item, or another platform, is a no-op", async () => {
    const h = home(); booted.length = 0;
    expect(await retireTray({ HOME: h.home }, "darwin", options)).toBeNull();
    writeFileSync(join(h.agents, "app.hraness.companion.ghostget.plist"), runnerPlist("app.hraness.companion.ghostget", ["/opt/hraness-companion"]));
    expect(await retireTray({ HOME: h.home }, "linux", options)).toBeNull();
    expect(booted).toEqual([]);
  });
  test("the header must bind the whole body and name Ghostget", () => {
    const text = runnerPlist("app.hraness.companion.ghostget", ["/opt/x"]);
    expect(isLegacyTray({ label: "app.hraness.companion.ghostget", path: "/p", text })).toBe(true);
    expect(isLegacyTray({ label: "app.hraness.companion.ghostget", path: "/p", text: text.replace("ghostget sha256", "textbutler sha256") })).toBe(false);
    expect(isLegacyTray({ label: "app.hraness.companion.ghostget", path: "/p", text: `${text}<!-- extra -->` })).toBe(false);
  });
});

describe("the retired menubar command", () => {
  
  function capture() { let stdout = ""; let stderr = ""; return { output: { stdout: (t: string) => { stdout += t; }, stderr: (t: string) => { stderr += t; } }, get stdout() { return stdout; }, get stderr() { return stderr; } }; }
  test("every old verb explains the replacements and exits 2 without touching login items", async () => {
    for (const args of [[], ["start"], ["stop"], ["install"], ["status", "--json"], ["--foreground"]]) {
      const c = capture(); let called = false;
      expect(await runRetiredMenubarCommand(args, {}, c.output, async () => { called = true; return null; })).toBe(2);
      expect(c.stderr).toBe(MENUBAR_RETIRED); expect(c.stdout).toBe(""); expect(called).toBe(false);
    }
  });
  test("--help prints the same guidance on stdout", async () => {
    const c = capture();
    expect(await runRetiredMenubarCommand(["--help"], {}, c.output)).toBe(0);
    expect(c.stdout).toContain("ghostget control serve");
  });
  test("uninstall --json reports what moved", async () => {
    const c = capture();
    const moved = { label: "app.hraness.companion.ghostget", from: "/h/a.plist", to: "/h/a.plist.retired-1" };
    expect(await runRetiredMenubarCommand(["uninstall", "--json"], {}, c.output, async () => moved)).toBe(0);
    expect(JSON.parse(c.stdout)).toEqual({ ok: true, schema: "ghostget.menubar-uninstall/1", data: { retired: moved } });
  });

  test("uninstall still moves the old login item aside", async () => {
    const c = capture();
    expect(await runRetiredMenubarCommand(["uninstall"], {}, c.output, async () => ({ label: "app.hraness.companion.ghostget", from: "/h/a.plist", to: "/h/a.plist.retired-1" }))).toBe(0);
    expect(c.stdout).toContain("/h/a.plist.retired-1");
    const none = capture();
    expect(await runRetiredMenubarCommand(["uninstall"], {}, none.output, async () => null)).toBe(0);
    expect(none.stdout).toContain("No Ghostget menu bar login item");
  });
});
