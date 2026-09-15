import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { installLaunchAgent, launchAgentPlist, launchAgentState, resolveMenubarBinary, uninstallLaunchAgent } from "./menubar-cli";

describe("Ghostget menu-bar binary resolution", () => {
  test("rejects missing, directory, symlink, non-executable, and group-writable paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "ghostget-menubar-"));
    try {
      const binary = join(dir, "ghostget-menubar");
      const alias = join(dir, "alias");
      const resolve = (path: string) => resolveMenubarBinary({ GHOSTGET_MENUBAR: path });
      expect(resolve(binary)).not.toBe(binary);
      expect(resolve(dir)).not.toBe(dir);
      writeFileSync(binary, "prebuilt", { mode: 0o600 });
      expect(resolve(binary)).not.toBe(binary);
      chmodSync(binary, 0o755);
      expect(resolve(binary)).toBe(binary);
      symlinkSync(binary, alias);
      expect(resolve(alias)).not.toBe(alias);
      chmodSync(binary, 0o775);
      expect(resolve(binary)).not.toBe(binary);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("installs and removes only the exact owned LaunchAgent with injected launchctl", () => {
    const dir = mkdtempSync(join(tmpdir(), "ghostget-menubar-agent-"));
    try {
      const binary = join(dir, "ghostget-menubar");
      const environment = { HOME: dir };
      const calls: string[][] = [];
      const run = (args: readonly string[]) => { calls.push([...args]); };
      writeFileSync(binary, "prebuilt", { mode: 0o755 });
      expect(launchAgentState(binary, environment)).toBe("absent");
      expect(installLaunchAgent(binary, environment, "darwin", run)).toBe("installed");
      expect(launchAgentState(binary, environment)).toBe("installed");
      expect(installLaunchAgent(binary, environment, "darwin", run)).toBe("installed");
      expect(calls.length).toBe(1);
      expect(uninstallLaunchAgent(binary, environment, "darwin", run)).toBe("absent");
      expect(calls[1]).toEqual(["bootout", "gui/{uid}/com.ghostget.menubar"]);
      expect(launchAgentPlist('/tmp/a&"b')).toContain("/tmp/a&amp;&quot;b");
      expect(launchAgentPlist(binary)).toContain("<key>KeepAlive</key><false/>");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
