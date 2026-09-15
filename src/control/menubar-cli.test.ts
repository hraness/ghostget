import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { resolveDesktopBinary } from "./menubar-cli";

describe("Ghostget menu-bar binary resolution", () => {
  test("rejects missing, non-executable, and group-writable paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "ghostget-menubar-"));
    const binary = join(dir, "ghostget-desktop");
    writeFileSync(binary, "prebuilt", { mode: 0o600 });
    expect(resolveDesktopBinary({ GHOSTGET_DESKTOP: binary })).not.toBe(binary);
    chmodSync(binary, 0o755);
    expect(resolveDesktopBinary({ GHOSTGET_DESKTOP: binary })).toBe(binary);
    chmodSync(binary, 0o775);
    expect(resolveDesktopBinary({ GHOSTGET_DESKTOP: binary })).not.toBe(binary);
  });
});
