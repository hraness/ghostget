import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isLegacyTray, LEGACY_TRAY_LABELS, legacyTrayItems, MENUBAR_RETIRED, retireTray, runRetiredMenubarCommand } from "./retire-tray";

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
    const [retired, ...rest] = await retireTray({ HOME: h.home }, "darwin", options);
    expect(rest).toEqual([]);
    expect(retired).toEqual({ label: "app.hraness.companion.ghostget", from: join(h.agents, "app.hraness.companion.ghostget.plist"), to: join(h.agents, "app.hraness.companion.ghostget.plist.retired-1000") });
    expect(booted).toEqual(["app.hraness.companion.ghostget"]);
    expect(readFileSync(retired!.to, "utf8")).toBe(text);
    expect(existsSync(retired!.from)).toBe(false);
  });
  test("the signed local app item is retired too", async () => {
    const h = home(); booted.length = 0;
    writeFileSync(join(h.agents, "app.hraness.ghostget.plist"), runnerPlist("app.hraness.ghostget", [`${h.home}/Applications/Hraness/Ghostget.app/Contents/MacOS/Ghostget`, "--launch", "/state/login-argv.json"]));
    expect((await retireTray({ HOME: h.home }, "darwin", options)).map((r) => r.label)).toEqual(["app.hraness.ghostget"]);
  });
  test("both items are retired when both are installed, and nothing is left to report", async () => {
    // An app-mode install followed by a plain one leaves both files.
    const h = home(); booted.length = 0;
    writeFileSync(join(h.agents, "app.hraness.companion.ghostget.plist"), runnerPlist("app.hraness.companion.ghostget", ["/opt/hraness-companion", "--foreground"]));
    writeFileSync(join(h.agents, "app.hraness.ghostget.plist"), runnerPlist("app.hraness.ghostget", ["/Applications/Ghostget.app/Contents/MacOS/Ghostget", "--launch", "/state/login-argv.json"]));
    expect(legacyTrayItems({ HOME: h.home }, "darwin")).toEqual([join(h.agents, "app.hraness.companion.ghostget.plist"), join(h.agents, "app.hraness.ghostget.plist")]);
    const retired = await retireTray({ HOME: h.home }, "darwin", options);
    expect(retired.map((r) => r.label)).toEqual(["app.hraness.companion.ghostget", "app.hraness.ghostget"]);
    expect(booted).toEqual(["app.hraness.companion.ghostget", "app.hraness.ghostget"]);
    expect(readdirSync(h.agents).sort()).toEqual(["app.hraness.companion.ghostget.plist.retired-1000", "app.hraness.ghostget.plist.retired-1000"]);
    expect(legacyTrayItems({ HOME: h.home }, "darwin")).toEqual([]);
    expect(await retireTray({ HOME: h.home }, "darwin", options)).toEqual([]);
  });
  test("an edited, foreign or control-owner item is left alone", async () => {
    const h = home(); booted.length = 0;
    const edited = runnerPlist("app.hraness.companion.ghostget", ["/opt/hraness-companion"]).replace("RunAtLoad", "KeepAlive");
    writeFileSync(join(h.agents, "app.hraness.companion.ghostget.plist"), edited);
    writeFileSync(join(h.agents, "app.hraness.ghostget.plist"), runnerPlist("app.hraness.textbutler", ["/opt/other"]));
    writeFileSync(join(h.agents, "app.hraness.ghostget.control.plist"), runnerPlist("app.hraness.ghostget.control", ["/bun", "cli.ts", "control", "serve"]));
    expect(await retireTray({ HOME: h.home }, "darwin", options)).toEqual([]);
    expect(legacyTrayItems({ HOME: h.home }, "darwin")).toEqual([]);
    expect(booted).toEqual([]);
    expect(readdirSync(h.agents).sort()).toEqual(["app.hraness.companion.ghostget.plist", "app.hraness.ghostget.control.plist", "app.hraness.ghostget.plist"]);
    expect(LEGACY_TRAY_LABELS).not.toContain("app.hraness.ghostget.control");
  });
  test("no item, or another platform, is a no-op", async () => {
    const h = home(); booted.length = 0;
    expect(await retireTray({ HOME: h.home }, "darwin", options)).toEqual([]);
    writeFileSync(join(h.agents, "app.hraness.companion.ghostget.plist"), runnerPlist("app.hraness.companion.ghostget", ["/opt/hraness-companion"]));
    expect(await retireTray({ HOME: h.home }, "linux", options)).toEqual([]);
    expect(legacyTrayItems({ HOME: h.home }, "linux")).toEqual([]);
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
  const moved = { label: "app.hraness.companion.ghostget", from: "/h/a.plist", to: "/h/a.plist.retired-1" };
  function ports(retired: readonly { label: string; from: string; to: string }[], legacy: readonly string[] = []) {
    const calls: boolean[] = [];
    return { calls, ports: { retire: async (atLogin: boolean) => { calls.push(atLogin); return retired; }, legacyItems: () => legacy } };
  }
  test("every old verb explains the replacements and exits 2 without touching login items", async () => {
    for (const args of [[], ["start"], ["stop"], ["install"], ["status", "--json"], ["--foreground", "--extra"], ["doctor", "--all"]]) {
      const c = capture(); const p = ports([moved]);
      expect(await runRetiredMenubarCommand(args, {}, c.output, p.ports)).toBe(2);
      expect(c.stderr).toBe(MENUBAR_RETIRED); expect(c.stdout).toBe(""); expect(p.calls).toEqual([]);
    }
  });
  test("--foreground, what an old login item runs at login, retires the items without booting out its own job", async () => {
    const c = capture(); const p = ports([moved, { label: "app.hraness.ghostget", from: "/h/b.plist", to: "/h/b.plist.retired-1" }]);
    expect(await runRetiredMenubarCommand(["--foreground"], {}, c.output, p.ports)).toBe(2);
    expect(p.calls).toEqual([true]);
    expect(c.stderr).toContain("/h/a.plist.retired-1");
    expect(c.stderr).toContain("/h/b.plist.retired-1");
    expect(c.stderr.endsWith(MENUBAR_RETIRED)).toBe(true);
    expect(c.stdout).toBe("");
  });
  test("--foreground from a real legacy item renames it aside and never calls launchctl", async () => {
    const h = home();
    writeFileSync(join(h.agents, "app.hraness.companion.ghostget.plist"), runnerPlist("app.hraness.companion.ghostget", ["/bun", "cli.ts", "menubar", "--foreground"]));
    writeFileSync(join(h.agents, "app.hraness.ghostget.plist"), runnerPlist("app.hraness.ghostget", ["/Applications/Ghostget.app/Contents/MacOS/Ghostget", "--launch", "/state/login-argv.json"]));
    const c = capture();
    const real = {
      retire: async (atLogin: boolean) => { expect(atLogin).toBe(true); return await retireTray({ HOME: h.home }, "darwin", { bootout: async () => {}, now: () => new Date(7) }); },
      legacyItems: () => legacyTrayItems({ HOME: h.home }, "darwin"),
    };
    expect(await runRetiredMenubarCommand(["--foreground"], { HOME: h.home }, c.output, real)).toBe(2);
    expect(readdirSync(h.agents).sort()).toEqual(["app.hraness.companion.ghostget.plist.retired-7", "app.hraness.ghostget.plist.retired-7"]);
    const doctor = capture();
    expect(await runRetiredMenubarCommand(["doctor", "--json"], { HOME: h.home }, doctor.output, real)).toBe(0);
    expect(JSON.parse(doctor.stdout).data.legacyLoginItems).toEqual([]);
  });
  test("doctor reports the login items still installed, without changing them", async () => {
    const left = capture(); const p = ports([moved], ["/h/Library/LaunchAgents/app.hraness.ghostget.plist"]);
    expect(await runRetiredMenubarCommand(["doctor", "--json"], {}, left.output, p.ports)).toBe(0);
    expect(JSON.parse(left.stdout)).toEqual({ ok: true, schema: "ghostget.menubar-doctor/1", data: { retired: true, legacyLoginItems: ["/h/Library/LaunchAgents/app.hraness.ghostget.plist"] } });
    const text = capture();
    expect(await runRetiredMenubarCommand(["doctor"], {}, text.output, p.ports)).toBe(0);
    expect(text.stdout).toContain("ghostget menubar uninstall");
    expect(p.calls).toEqual([]);
    const clean = capture();
    expect(await runRetiredMenubarCommand(["doctor"], {}, clean.output, ports([]).ports)).toBe(0);
    expect(clean.stdout).toContain("no login item for it remains");
  });
  test("--help prints the same guidance on stdout", async () => {
    const c = capture();
    expect(await runRetiredMenubarCommand(["--help"], {}, c.output, ports([]).ports)).toBe(0);
    expect(c.stdout).toContain("ghostget control serve");
  });
  test("uninstall --json reports every item that moved", async () => {
    const c = capture(); const second = { label: "app.hraness.ghostget", from: "/h/b.plist", to: "/h/b.plist.retired-1" };
    expect(await runRetiredMenubarCommand(["uninstall", "--json"], {}, c.output, ports([moved, second]).ports)).toBe(0);
    expect(JSON.parse(c.stdout)).toEqual({ ok: true, schema: "ghostget.menubar-uninstall/1", data: { retired: [moved, second] } });
  });
  test("uninstall still moves the old login items aside and names each", async () => {
    const c = capture(); const p = ports([moved, { label: "app.hraness.ghostget", from: "/h/b.plist", to: "/h/b.plist.retired-1" }]);
    expect(await runRetiredMenubarCommand(["uninstall"], {}, c.output, p.ports)).toBe(0);
    expect(p.calls).toEqual([false]);
    expect(c.stdout).toContain("/h/a.plist.retired-1");
    expect(c.stdout).toContain("/h/b.plist.retired-1");
    const none = capture();
    expect(await runRetiredMenubarCommand(["uninstall"], {}, none.output, ports([]).ports)).toBe(0);
    expect(none.stdout).toContain("No Ghostget menu bar login item");
  });
});
