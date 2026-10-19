import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { retireLegacyLoginItem, type LegacyLoginItem, type Retired, type RetireOptions } from "@hraness/desktop-foundation/retire";

/**
 * Login items the retired menu bar installed through the shared runner: the
 * signed local app (`HRANESS_LOCAL_APP=1`) and the plain companion. The
 * control owner's own item, `app.hraness.ghostget.control`, is never listed.
 */
export const LEGACY_TRAY_LABELS: readonly string[] = Object.freeze(["app.hraness.companion.ghostget", "app.hraness.ghostget"]);

const HEADER = /^<!-- hraness-companion autostart ghostget sha256:([0-9a-f]{64}) -->\n/u;

/**
 * True only for the shared runner's own autostart file for Ghostget, unedited:
 * its first line names `ghostget` and carries the digest of the rest of the
 * file, which is how the runner itself recognizes files it wrote.
 */
export function isLegacyTray(item: LegacyLoginItem): boolean {
  const match = HEADER.exec(item.text);
  if (match === null) return false;
  const body = item.text.slice(match[0].length);
  return createHash("sha256").update(body).digest("hex") === match[1]
    && body.includes(`<string>${item.label}</string>`);
}

function homeOf(environment: Readonly<Record<string, string | undefined>>): string {
  return environment.HOME !== undefined && environment.HOME.startsWith("/") ? environment.HOME : homedir();
}

/**
 * Boots out and renames aside every login item the retired menu bar left, the
 * companion and the local-app one alike. Nothing is deleted: undo by renaming
 * a file back and running `launchctl bootstrap gui/<uid> <path>`. Only macOS
 * had a login item.
 *
 * The foundation's retire stops at the first item it moves, so it runs once
 * per remaining label until nothing more is accepted.
 */
export async function retireTray(
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
  options: Pick<RetireOptions, "bootout" | "now" | "uid"> = {},
): Promise<readonly Retired[]> {
  if (platform !== "darwin") return [];
  const home = homeOf(environment);
  const retired: Retired[] = [];
  let labels = LEGACY_TRAY_LABELS;
  while (labels.length > 0) {
    const moved = await retireLegacyLoginItem({ home, labels, accepts: isLegacyTray, ...options });
    if (moved === null) break;
    retired.push(moved);
    labels = labels.filter((label) => label !== moved.label);
  }
  return retired;
}

/**
 * The retired menu bar's login items still in place, without changing
 * anything: the receipt `ghostget menubar doctor` and `control status` print.
 * A file that is not a plain one, or is too large to be the runner's, is not
 * reported, matching what retire would accept.
 */
export function legacyTrayItems(
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): readonly string[] {
  if (platform !== "darwin") return [];
  const agents = join(homeOf(environment), "Library", "LaunchAgents");
  return LEGACY_TRAY_LABELS.flatMap((label) => {
    const path = join(agents, `${label}.plist`);
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.size > 65_536) return [];
      return isLegacyTray({ label, path, text: readFileSync(path, "utf8") }) ? [path] : [];
    } catch { return []; }
  });
}

export function retiredNotice(retired: Retired): string {
  return `Moved the retired Ghostget menu bar login item aside: ${retired.to}. To undo, rename it back to ${retired.from}.`;
}

export function retiredNotices(retired: readonly Retired[]): string[] {
  return retired.map(retiredNotice);
}

export const MENUBAR_RETIRED = `The Ghostget menu bar has been retired. Use:
  ghostget status                  accounts, approvals and saved outputs
  ghostget tui                     keyboard controls
  ghostget control serve           run the control owner without a window
  ghostget control install         start it at login
  ghostget menubar uninstall       move the old menu bar login item aside
  ghostget menubar doctor          report any old menu bar login item left
Every former menu action is a command: ghostget commands --json
`;

type RetiredMenubarPorts = {
  /** Move every legacy item aside; `atLogin` means launchd started this run from one. */
  retire(atLogin: boolean): Promise<readonly Retired[]>;
  legacyItems(): readonly string[];
};

function defaultPorts(environment: Readonly<Record<string, string | undefined>>): RetiredMenubarPorts {
  return {
    // Run from a legacy item at login, this process is that launchd job, so
    // booting the job out would stop this process before the rename. The
    // item has RunAtLoad and no KeepAlive: once renamed aside it cannot run
    // again, and the loaded job ends when this process exits.
    retire: async (atLogin) => await retireTray(environment, process.platform, atLogin ? { bootout: async () => {} } : {}),
    legacyItems: () => legacyTrayItems(environment),
  };
}

function jsonOnly(args: readonly string[], verb: string): boolean | null {
  if (args[0] !== verb) return null;
  if (args.length === 1) return false;
  return args.length === 2 && args[1] === "--json" ? true : null;
}

/**
 * `ghostget menubar …` after the retirement. `uninstall` still moves the old
 * login items aside so the old instructions keep working, and `doctor`
 * reports any left. `--foreground`, which is what an old login item runs at
 * every login, retires that item before explaining where each view went, so
 * an upgrade needs no manual step. Everything else only explains.
 */
export async function runRetiredMenubarCommand(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  output: { stdout(text: string): void; stderr(text: string): void },
  ports: RetiredMenubarPorts = defaultPorts(environment),
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) { output.stdout(MENUBAR_RETIRED); return 0; }
  const uninstall = jsonOnly(args, "uninstall");
  if (uninstall !== null) {
    const retired = await ports.retire(false);
    if (uninstall) {
      output.stdout(`${JSON.stringify({ ok: true, schema: "ghostget.menubar-uninstall/1", data: { retired } })}\n`);
      return 0;
    }
    output.stdout(`${retired.length === 0 ? "No Ghostget menu bar login item was installed." : retiredNotices(retired).join("\n")}\n`);
    return 0;
  }
  const doctor = jsonOnly(args, "doctor");
  if (doctor !== null) {
    const legacyLoginItems = ports.legacyItems();
    if (doctor) {
      output.stdout(`${JSON.stringify({ ok: true, schema: "ghostget.menubar-doctor/1", data: { retired: true, legacyLoginItems } })}\n`);
      return 0;
    }
    output.stdout(legacyLoginItems.length === 0
      ? "The Ghostget menu bar is retired and no login item for it remains.\n"
      : `The Ghostget menu bar is retired, but its login item is still installed:\n${legacyLoginItems.map((path) => `  ${path}`).join("\n")}\nMove it aside with: ghostget menubar uninstall\n`);
    return 0;
  }
  if (args.length === 1 && args[0] === "--foreground") {
    for (const notice of retiredNotices(await ports.retire(true))) output.stderr(`${notice}\n`);
  }
  output.stderr(MENUBAR_RETIRED);
  return 2;
}
