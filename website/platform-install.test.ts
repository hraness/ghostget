import { describe, expect, test } from "bun:test";

import { platformMark } from "@hraness/design-kit";

import { renderPlatformBadges, renderPlatformInstall } from "./platform-install";

describe("static platform install", () => {
  const html = renderPlatformInstall({
    analyticsCommand: "cli",
    id: "install",
    platforms: [
      { command: "bun add --global <pkg>", id: "macos", noteHtml: "Requires Bun.", shell: "Terminal" },
      { command: "bun add --global <pkg>", id: "linux", shell: "Terminal" },
      { command: "bun add --global <pkg>", id: "windows", unavailable: true, unavailableNoteHtml: "Runs in WSL2." },
    ],
  });

  test("renders one tab and one panel per platform in order", () => {
    const tabs = [...html.matchAll(/role="tab"[^>]*>/gu)];
    expect(tabs).toHaveLength(3);
    expect([...html.matchAll(/id="install-tab-(\w+)"/gu)].map((match) => match[1])).toEqual(["macos", "linux", "windows"]);
    expect([...html.matchAll(/role="tabpanel"/gu)]).toHaveLength(3);
    expect(html).toContain('aria-selected="true" class="hraness-platform-install__tab" data-availability="available" data-platform="macos"');
  });

  test("keeps every command readable before enhancement", () => {
    expect(html).toContain('class="hraness-platform-install__tabs" hidden role="tablist"');
    expect(html).not.toMatch(/role="tabpanel"[^>]*hidden/u);
    expect(html.match(/bun add --global &lt;pkg&gt;/gu)).toHaveLength(3);
    expect(html.match(/data-platform-install-copy hidden/gu)).toHaveLength(3);
    expect(html).toContain('data-install-command="cli"');
    expect(html).toContain('<div class="hraness-platform-install__unavailable">Runs in WSL2.</div>');
  });

  test("draws each mark once from an id-scoped symbol", () => {
    for (const id of ["macos", "linux", "windows"] as const) {
      expect(html.split(platformMark(id).path)).toHaveLength(2);
      expect(html).toContain(`<symbol id="install-mark-${id}" viewBox="${platformMark(id).viewBox}">`);
      expect(html.match(new RegExp(`<use href="#install-mark-${id}"></use>`, "gu"))).toHaveLength(2);
    }
    expect(html).toContain('<span class="hraness-platform-install__tab-label">Windows</span>');
  });

  test("rejects a supported platform without a command", () => {
    expect(() => renderPlatformInstall({ id: "x", platforms: [{ id: "linux" }] })).toThrow(RangeError);
    expect(() => renderPlatformInstall({ id: "x", platforms: [{ id: "windows", unavailable: true }] })).toThrow(RangeError);
  });

  test("badges list platforms with notes", () => {
    const badges = renderPlatformBadges(["macos", "linux", { id: "windows", note: "via WSL2" }]);
    expect(badges).toContain("Runs on");
    expect([...badges.matchAll(/<li /gu)]).toHaveLength(3);
    expect(badges).toContain('<span class="hraness-platform-badges__note">via WSL2</span>');
  });
});
