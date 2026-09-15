import { lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { ControlEnvironment } from "./web-policy";

/**
 * `ghostget menubar` launches the detached native control panel as a menu-bar
 * accessory: a status item over the shared desktop foundation plus the hidden
 * companion window. The binary enforces one instance per state home; a second
 * launch exits quietly once its lock is held, which the CLI reports as
 * "already running" rather than an error.
 */
const SETTLE_MS = 400;

export function resolveDesktopBinary(environment: ControlEnvironment = process.env): string | null {
  const candidates = [
    environment.GHOSTGET_DESKTOP,
    resolve(dirname(process.execPath), "ghostget-desktop"),
    resolve(import.meta.dir, "../../desktop/src-tauri/target/release/ghostget-desktop"),
    resolve(import.meta.dir, "../../desktop/src-tauri/target/debug/ghostget-desktop"),
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== "" && qualifiedBinary(candidate)) return candidate;
  }
  return null;
}

/** Accept regular executable files without group or other write bits.
 * This filters accidental directories, symlinks, and writable binaries; it does
 * not qualify ownership of parent directories or eliminate filesystem races.
 */
function qualifiedBinary(path: string): boolean {
  try {
    const info = lstatSync(path);
    return info.isFile() && (info.mode & 0o111) !== 0 && (info.mode & 0o022) === 0;
  } catch {
    return false;
  }
}

export async function runMenubarCommand(
  args: readonly string[],
  environment: ControlEnvironment = process.env,
  output: { stdout: (text: string) => unknown; stderr: (text: string) => unknown },
): Promise<number> {
  if (args[1] === "--help") {
    output.stdout("Usage: ghostget menubar\nLaunches the detached Ghostget menu-bar control panel. Build it with `cd desktop/src-tauri && cargo build --release` after staging runtime resources with `bun desktop/scripts/package.ts --stage-only`.\n");
    return 0;
  }
  if (args.length !== 1) { output.stderr("Usage: ghostget menubar\n"); return 1; }
  const binary = resolveDesktopBinary(environment);
  if (binary === null) {
    output.stderr("The Ghostget desktop binary is not installed. Build it with `cd desktop/src-tauri && cargo build --release` or set GHOSTGET_DESKTOP.\n");
    return 1;
  }
  let child;
  try {
    // The companion owns its diagnostics. Do not leave a pipe unread: a
    // noisy crash or repeated retry could otherwise fill stderr and wedge the
    // launcher while it is waiting for the short startup settle window.
    child = Bun.spawn([binary], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  } catch {
    output.stderr("The Ghostget desktop binary could not start.\n");
    return 1;
  }
  child.unref();
  const settled = await Promise.race([
    child.exited.then((code) => code as number | null),
    Bun.sleep(SETTLE_MS).then(() => null),
  ]);
  if (settled !== null && settled !== 0) {
    output.stderr("The Ghostget desktop exited during startup.\n");
    return 1;
  }
  output.stdout(settled === 0
    ? "Ghostget menu bar is already running.\n"
    : "Ghostget menu bar is running.\n");
  return 0;
}
