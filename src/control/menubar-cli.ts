import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ControlEnvironment } from "./web-policy";

const SETTLE_MS = 400;
const LABEL = "com.ghostget.menubar";
type Output = { readonly stdout: (text: string) => unknown; readonly stderr: (text: string) => unknown };

function xml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function exists(path: string): boolean { try { return statSync(path).isFile(); } catch { return false; } }

export function resolveDesktopBinary(environment: ControlEnvironment = process.env): string | null {
  // Consume a prebuilt companion only. Keep GHOSTGET_DESKTOP as a
  // compatibility alias for existing local installs, but prefer the explicit
  // menu-bar name and never trigger a source build or app bundling step.
  const candidates = [environment.GHOSTGET_MENUBAR, environment.GHOSTGET_DESKTOP, resolve(dirname(process.execPath), "ghostget-menubar"), resolve(dirname(process.execPath), "ghostget-desktop"), resolve(import.meta.dir, "../../desktop/src-tauri/target/release/ghostget-menubar"), resolve(import.meta.dir, "../../desktop/src-tauri/target/release/ghostget-desktop")];
  for (const candidate of candidates) if (candidate !== undefined && candidate !== "" && exists(candidate)) return candidate;
  return null;
}
export function launchAgentPath(environment: Readonly<Record<string, string | undefined>> = process.env): string {
  const home = environment.HOME; if (home === undefined || home === "") throw new Error("HOME is required for a per-user LaunchAgent.");
  return join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
}
export function launchAgentPlist(binary: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${xml(LABEL)}</string><key>ProgramArguments</key><array><string>${xml(binary)}</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><false/><key>ProcessType</key><string>Interactive</string><key>LimitLoadToSessionType</key><string>Aqua</string></dict></plist>\n`;
}
function readAgent(path: string): string | null { try { return readFileSync(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
export type LaunchAgentState = "absent" | "installed" | "conflict";
export type LaunchctlRunner = (args: readonly string[], allowMissing?: boolean) => void;
function launchctl(args: readonly string[], allowMissing = false): void {
  const uid = process.getuid?.(); if (uid === undefined) throw new Error("The current user has no launchd GUI domain.");
  const result = Bun.spawnSync(["/bin/launchctl", ...args.map((arg) => arg.replaceAll("{uid}", String(uid)))], { stdout: "ignore", stderr: "pipe" });
  if (result.exitCode !== 0 && !(allowMissing && result.stderr.toString().includes("Could not find service"))) throw new Error("launchctl could not reconcile the Ghostget menu-bar LaunchAgent.");
}
export function launchAgentState(binary: string, environment: Readonly<Record<string, string | undefined>> = process.env): LaunchAgentState { const content = readAgent(launchAgentPath(environment)); return content === null ? "absent" : content === launchAgentPlist(binary) ? "installed" : "conflict"; }
export function installLaunchAgent(binary: string, environment: Readonly<Record<string, string | undefined>> = process.env, platform: NodeJS.Platform = process.platform, runLaunchctl: LaunchctlRunner = launchctl): LaunchAgentState {
  if (platform !== "darwin") throw new Error("Ghostget menu-bar LaunchAgents are supported only on macOS.");
  if (!binary.startsWith("/")) throw new Error("LaunchAgent binary must be an absolute path.");
  if (!exists(binary)) throw new Error("The prebuilt Ghostget menu-bar binary does not exist.");
  const path = launchAgentPath(environment); const current = readAgent(path); const expected = launchAgentPlist(binary);
  if (current !== null) { if (current !== expected) throw new Error("The existing Ghostget menu-bar LaunchAgent is not owned by this command."); return "installed"; }
  const directory = dirname(path); mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
  const temporary = `${path}.tmp-${process.pid}`; writeFileSync(temporary, expected, { encoding: "utf8", mode: 0o600, flag: "wx" }); chmodSync(temporary, 0o600); renameSync(temporary, path); runLaunchctl(["bootstrap", "gui/{uid}", path]); return "installed";
}
export function uninstallLaunchAgent(binary: string, environment: Readonly<Record<string, string | undefined>> = process.env, platform: NodeJS.Platform = process.platform, runLaunchctl: LaunchctlRunner = launchctl): LaunchAgentState {
  if (platform !== "darwin") throw new Error("Ghostget menu-bar LaunchAgents are supported only on macOS.");
  const path = launchAgentPath(environment); const current = readAgent(path); if (current === null) return "absent";
  if (current !== launchAgentPlist(binary)) throw new Error("The existing Ghostget menu-bar LaunchAgent is not owned by this command.");
  runLaunchctl(["bootout", `gui/{uid}/${LABEL}`], true); rmSync(path); return "absent";
}
async function runBinary(binary: string, foreground: boolean): Promise<number> {
  let child: Bun.Subprocess;
  try { child = Bun.spawn([binary], foreground ? { stdin: "inherit", stdout: "inherit", stderr: "inherit" } : { stdin: "ignore", stdout: "ignore", stderr: "pipe" }); } catch { throw new Error("The Ghostget menu-bar companion could not start."); }
  if (!foreground) { child.unref(); const settled = await Promise.race([child.exited.then((code) => code as number | null), Bun.sleep(SETTLE_MS).then(() => null)]); if (settled !== null && settled !== 0) throw new Error("The Ghostget desktop exited during startup."); return 0; }
  return await child.exited;
}
export async function runMenubarCommand(args: readonly string[], environment: ControlEnvironment = process.env, output: Output): Promise<number> {
  if (args[1] === "--help") { output.stdout("Usage: ghostget menubar [--foreground|--background]\n       ghostget menubar install|uninstall|status\nRuns the prebuilt menu-bar companion; install writes a per-user LaunchAgent (RunAtLoad, no KeepAlive).\n"); return 0; }
  if (args.length > 2 || (args[1] !== undefined && !["install", "uninstall", "status", "--foreground", "--background"].includes(args[1]))) { output.stderr("Usage: ghostget menubar [--foreground|--background] | install|uninstall|status\n"); return 1; }
  const action = args[1] === "install" || args[1] === "uninstall" || args[1] === "status" ? args[1] : "run";
  const binary = resolveDesktopBinary(environment); if (binary === null) { output.stderr("The Ghostget menu-bar companion is not installed; install a prebuilt binary or set GHOSTGET_MENUBAR.\n"); return 1; }
  try {
    if (action === "install") { const state = installLaunchAgent(binary, environment); output.stdout(`Ghostget menu-bar LaunchAgent ${state}.\n`); return 0; }
    if (action === "uninstall") { const state = uninstallLaunchAgent(binary, environment); output.stdout(`Ghostget menu-bar LaunchAgent ${state}.\n`); return 0; }
    if (action === "status") { output.stdout(`Ghostget menu-bar LaunchAgent: ${launchAgentState(binary, environment)}.\n`); return 0; }
    return await runBinary(binary, args[1] !== "--background");
  } catch (error) { output.stderr(`${error instanceof Error ? error.message : "Ghostget menu-bar command failed."}\n`); return 1; }
}
