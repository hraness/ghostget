import { discoverBrowserProfiles, type BrowserProfileDiscovery } from "./browser-profiles";

/** One POSIX-quoted argument, safe to paste even for a name with a quote. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The exact flags that select this profile as a cookie source. */
export function cookieSourceFlags(source: string, profile: string | null): string {
  return profile === null
    ? `--cookie-source ${source}`
    : `--cookie-source ${source} --cookie-profile ${shellQuote(profile)}`;
}

export function browserProfilesJson(
  discovery: readonly BrowserProfileDiscovery[],
): Readonly<Record<string, unknown>> {
  return {
    ok: true,
    browsers: discovery.map((entry) => ({
      source: entry.source,
      installed: entry.installed,
      profiles: entry.profiles.map((profile) => ({
        profile: profile.profile,
        directory: profile.directory,
        cookies: profile.cookies,
        flags: cookieSourceFlags(entry.source, profile.profile),
      })),
    })),
  };
}

const COLUMN = 34;

function row(label: string, detail: string): string {
  const padded = label.length >= COLUMN ? `${label}\n${" ".repeat(COLUMN + 4)}` : label.padEnd(COLUMN);
  return `    ${padded}${detail}`;
}

export function renderBrowserProfiles(
  discovery: readonly BrowserProfileDiscovery[],
): string {
  if (discovery.length === 0) {
    return "Browser profile discovery is available on macOS.\n";
  }
  const installed = discovery.filter((entry) => entry.installed);
  const absent = discovery.filter((entry) => !entry.installed).map((entry) => entry.source);
  const lines: string[] = ["Browser cookie sources on this machine", ""];
  if (installed.length === 0) {
    lines.push("  No browser profile was found.", "");
  }
  for (const entry of installed) {
    const count = entry.profiles.length;
    lines.push(`  ${entry.source}${count === 1 && entry.profiles[0]?.profile === null
      ? " · one shared cookie store"
      : ` · ${count} ${count === 1 ? "profile" : "profiles"}`}`);
    for (const profile of entry.profiles) {
      lines.push(row(
        profile.profile ?? "(no profile selector)",
        profile.cookies
          ? cookieSourceFlags(entry.source, profile.profile)
          : "no cookie store yet — sign in once in this profile",
      ));
    }
    lines.push("");
  }
  if (absent.length > 0) lines.push(`  Not installed: ${absent.join(", ")}`, "");
  lines.push(
    "A listed profile is a name you can select, not proof that it is signed in.",
    "Connect one to an account, then verify the signed-in identity:",
    "",
    "  ghostget auth add <id> --cookie-source <browser> [--cookie-profile <name>]",
    "  ghostget auth bind <id> --site <provider-surface-id>",
  );
  return `${lines.join("\n")}\n`;
}

export function browserProfilesResult(
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<{ json: Record<string, unknown>; text: string }> {
  const discovery = discoverBrowserProfiles(environment);
  return { json: { ...browserProfilesJson(discovery) }, text: renderBrowserProfiles(discovery) };
}
