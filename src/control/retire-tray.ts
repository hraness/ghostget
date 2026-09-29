import { createHash } from "node:crypto";
import { homedir } from "node:os";
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

/**
 * Boots out and renames aside the retired menu bar's login item, if one is
 * present. Nothing is deleted: undo by renaming the file back and running
 * `launchctl bootstrap gui/<uid> <path>`. Only macOS had a login item.
 */
export async function retireTray(
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
  options: Pick<RetireOptions, "bootout" | "now" | "uid"> = {},
): Promise<Retired | null> {
  if (platform !== "darwin") return null;
  const home = environment.HOME !== undefined && environment.HOME.startsWith("/") ? environment.HOME : homedir();
  return await retireLegacyLoginItem({ home, labels: LEGACY_TRAY_LABELS, accepts: isLegacyTray, ...options });
}

export function retiredNotice(retired: Retired): string {
  return `Moved the retired Ghostget menu bar login item aside: ${retired.to}. To undo, rename it back to ${retired.from}.`;
}

export const MENUBAR_RETIRED = `The Ghostget menu bar has been retired. Use:
  ghostget status                  accounts, approvals and saved outputs
  ghostget tui                     keyboard controls
  ghostget control serve           run the control owner without a window
  ghostget control install         start it at login
  ghostget menubar uninstall       move the old menu bar login item aside
Every former menu action is a command: ghostget commands --json
`;

/**
 * `ghostget menubar …` after the retirement: `uninstall` still moves the old
 * login item aside so the old instructions keep working; everything else
 * explains where each view went.
 */
export async function runRetiredMenubarCommand(
  args: readonly string[],
  environment: Readonly<Record<string, string | undefined>>,
  output: { stdout(text: string): void; stderr(text: string): void },
  retire: () => Promise<Retired | null> = async () => await retireTray(environment),
): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) { output.stdout(MENUBAR_RETIRED); return 0; }
  if (args[0] === "uninstall" && (args.length === 1 || (args.length === 2 && args[1] === "--json"))) {
    const retired = await retire();
    if (args.length === 2) {
      output.stdout(`${JSON.stringify({ ok: true, schema: "ghostget.menubar-uninstall/1", data: { retired } })}\n`);
      return 0;
    }
    output.stdout(`${retired === null ? "No Ghostget menu bar login item was installed." : retiredNotice(retired)}\n`);
    return 0;
  }
  output.stderr(MENUBAR_RETIRED);
  return 2;
}
