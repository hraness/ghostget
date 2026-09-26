/**
 * Human output for the sign-in commands: `auth add`, `auth bind`, `auth list`
 * and `adapter install`.
 *
 * People get one ✓ line saying what changed, and at most one `Next:` hint on
 * stderr. Agents keep the JSON they had (and get the hint as `next`); `quiet`
 * gets the result line with no hint. Paths, realm fingerprints and cookie
 * values never appear in the human lines.
 */
import type { CliStyle } from "./cli-style";

export type AuthOutputAudience = "human" | "agent" | "quiet";

/** The subset of a saved sign-in these lines describe. */
export type AuthSummary =
  | { readonly kind: "cookie-source"; readonly id: string; readonly source: string; readonly profile?: string; readonly subject?: string }
  | { readonly kind: "cookies-file"; readonly id: string; readonly subject?: string }
  | { readonly kind: "browser-profile"; readonly id: string; readonly cookieSource?: string; readonly subject?: string }
  | { readonly kind: "oauth-token-file"; readonly id: string; readonly provider: string; readonly subject?: string }
  | { readonly kind: "linked-device-store"; readonly id: string; readonly provider: string; readonly subject?: string };

const BROWSER_NAMES: Readonly<Record<string, string>> = {
  arc: "Arc",
  brave: "Brave",
  chrome: "Chrome",
  chromium: "Chromium",
  edge: "Microsoft Edge",
  firefox: "Firefox",
  safari: "Safari",
};

const KEYCHAIN_BROWSERS = new Set(["arc", "brave", "chrome", "chromium", "edge"]);

export function browserDisplayName(source: string): string {
  return BROWSER_NAMES[source] ?? source;
}

/** "Chrome · Profile 1", "Cookies file", "Google (OAuth token)". */
export function describeAuthSource(auth: AuthSummary): string {
  switch (auth.kind) {
    case "cookie-source":
      return auth.profile === undefined
        ? browserDisplayName(auth.source)
        : `${browserDisplayName(auth.source)} · ${auth.profile}`;
    case "cookies-file":
      return "Cookies file";
    case "browser-profile":
      return auth.cookieSource === undefined
        ? "Dedicated browser profile"
        : `Dedicated browser profile · ${browserDisplayName(auth.cookieSource)} cookies`;
    case "oauth-token-file":
      return `${auth.provider} (OAuth token)`;
    case "linked-device-store":
      return `${auth.provider} (linked device)`;
  }
}

export type AuthLines = {
  /** The result line for stdout. */
  readonly result: string;
  /** One next command, or null. */
  readonly next: string | null;
  /** A short note that belongs with the hint, such as the keychain prompt. */
  readonly note: string | null;
};

/** `auth add`: what was saved, and the command that checks it. */
export function authSavedLines(auth: AuthSummary, style: CliStyle, linkedDeviceNext?: string): AuthLines {
  const result = `${style.symbol("ok")} Saved ${auth.id} (${describeAuthSource(auth)}).`;
  if (auth.kind === "linked-device-store") {
    return { result, next: linkedDeviceNext ?? null, note: null };
  }
  const note = auth.kind === "cookie-source" && KEYCHAIN_BROWSERS.has(auth.source)
    ? `macOS will ask to let security use "${browserDisplayName(auth.source)} Safe Storage" from your keychain.`
    : auth.kind === "cookie-source" && auth.source === "safari"
      ? "Safari cookies need Full Disk Access for this terminal app."
      : null;
  return { result, next: `ghostget auth bind ${auth.id} --site <site>`, note };
}

/** `auth bind`: which account the sign-in belongs to. */
export function authBoundLines(
  bound: { readonly id: string; readonly site: string; readonly subject: string },
  style: CliStyle,
): AuthLines {
  return {
    result: `${style.symbol("ok")} ${bound.id} is signed in to ${bound.site} as ${bound.subject}.`,
    next: `ghostget capabilities`,
    note: null,
  };
}

/** `auth list`: one row per saved sign-in, then a count. */
export function authListText(auths: readonly AuthSummary[], style: CliStyle): AuthLines {
  if (auths.length === 0) {
    return {
      result: "No saved sign-ins.",
      next: "ghostget auth add <id> --cookie-source chrome",
      note: null,
    };
  }
  const idWidth = Math.max(...auths.map((auth) => auth.id.length));
  const sources = auths.map(describeAuthSource);
  const sourceWidth = Math.max(...sources.map((source) => source.length));
  const rows = auths.map((auth, index) => {
    const state = auth.subject === undefined
      ? `${style.symbol("off")} not checked yet`
      : `${style.symbol("on")} ${auth.subject}`;
    return `${auth.id.padEnd(idWidth)}  ${(sources[index] ?? "").padEnd(sourceWidth)}  ${state}`;
  });
  const unchecked = auths.filter((auth) => auth.subject === undefined);
  const count = `${auths.length} saved sign-in${auths.length === 1 ? "" : "s"}${unchecked.length === 0 ? "" : `, ${unchecked.length} not checked yet`}.`;
  return {
    result: `${rows.join("\n")}\n\n${count}`,
    next: unchecked[0] === undefined ? null : `ghostget auth bind ${unchecked[0].id} --site <site>`,
    note: null,
  };
}

/** `adapter install`: the adapter, not the file path it landed at. */
export function adapterInstalledLines(id: string, style: CliStyle): AuthLines {
  return {
    result: `${style.symbol("ok")} Installed the ${id} adapter.`,
    next: `ghostget capabilities ${id}`,
    note: null,
  };
}

/** Write the result to stdout and, for people only, the hint to stderr. */
export function writeAuthLines(
  lines: AuthLines,
  audience: AuthOutputAudience,
  output: { readonly stdout: (text: string) => void; readonly stderr: (text: string) => void },
): void {
  output.stdout(`${lines.result}\n`);
  if (audience !== "human") return;
  if (lines.note !== null) output.stderr(`${lines.note}\n`);
  if (lines.next !== null) output.stderr(`Next: ${lines.next}\n`);
}
