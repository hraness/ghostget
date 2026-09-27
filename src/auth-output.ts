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
  | { readonly kind: "cookie-source"; readonly id: string; readonly source: string; readonly profile?: string; readonly subject?: string; readonly displayName?: string }
  | { readonly kind: "cookies-file"; readonly id: string; readonly subject?: string }
  | { readonly kind: "browser-profile"; readonly id: string; readonly cookieSource?: string; readonly subject?: string }
  | {
    readonly kind: "oauth-token-file";
    readonly id: string;
    readonly provider: string;
    readonly subject?: string;
    /** Whether the saved token can still be used; `auth list` only. */
    readonly token?: "ok" | "expired" | "unreadable";
    /** Ghostget made the token with `auth login`. */
    readonly managed?: boolean;
  }
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
export function authSavedLines(
  auth: AuthSummary,
  style: CliStyle,
  linkedDeviceNext?: string,
  platform: string = process.platform,
): AuthLines {
  const result = `${style.symbol("ok")} Saved ${auth.id} (${describeAuthSource(auth)}).`;
  if (auth.kind === "linked-device-store") {
    return { result, next: linkedDeviceNext ?? null, note: null };
  }
  // Both notes describe macOS privacy prompts; other systems never show them.
  const note = platform !== "darwin"
    ? null
    : auth.kind === "cookie-source" && KEYCHAIN_BROWSERS.has(auth.source)
    ? `macOS will ask to let security use "${browserDisplayName(auth.source)} Safe Storage" from your keychain.`
    : auth.kind === "cookie-source" && auth.source === "safari"
      ? "Safari cookies need Full Disk Access for this terminal app."
      : null;
  return { result, next: `ghostget auth bind ${auth.id} --site <site>`, note };
}

/** `auth bind`: which account the sign-in belongs to. A verified handle
 * names the account for people; the subject stays in the JSON output. */
export function authBoundLines(
  bound: { readonly id: string; readonly site: string; readonly subject: string; readonly displayName?: string },
  style: CliStyle,
): AuthLines {
  return {
    result: `${style.symbol("ok")} ${bound.id} is signed in to ${bound.site} as ${bound.displayName ?? bound.subject}.`,
    next: `ghostget capabilities`,
    note: null,
  };
}

type TokenProblem = "expired" | "unreadable";

function tokenProblem(auth: AuthSummary): TokenProblem | null {
  if (auth.kind !== "oauth-token-file" || auth.token === undefined || auth.token === "ok") return null;
  return auth.token;
}

function tokenNext(auth: Extract<AuthSummary, { readonly kind: "oauth-token-file" }>): string {
  return auth.managed === true
    ? `ghostget auth login ${auth.id} --client-file <desktop-client.json> --force`
    : `ghostget auth add ${auth.id} --oauth-provider ${auth.provider} --token-file <path> --scopes <list> --force`;
}

/**
 * `auth list`: one row per saved sign-in, then a count. A saved account name
 * is shown as given; `auth add --subject` records it without checking, so it
 * gets no "on" mark. Sign-ins with no account yet and OAuth tokens that can't
 * be used are called out, with one next step for the first of them.
 */
export function authListText(auths: readonly AuthSummary[], style: CliStyle): AuthLines {
  if (auths.length === 0) {
    // An empty list is only useful with its next step, so it is part of the
    // result for every text audience rather than a stderr hint.
    return {
      result: `No saved sign-ins.\n${style.symbol("next")} ghostget auth add <id> --cookie-source chrome`,
      next: null,
      note: null,
    };
  }
  const idWidth = Math.max(...auths.map((auth) => auth.id.length));
  const sources = auths.map(describeAuthSource);
  const sourceWidth = Math.max(...sources.map((source) => source.length));
  const rows = auths.map((auth, index) => {
    const problem = tokenProblem(auth);
    const handle = auth.kind === "cookie-source" ? auth.displayName : undefined;
    const state = problem === "expired"
      ? `${style.symbol("fail")} token expired`
      : problem === "unreadable"
        ? `${style.symbol("fail")} token missing or unreadable`
        : auth.subject === undefined
          ? `${style.symbol("off")} no account yet`
          : `as ${handle ?? auth.subject}`;
    return `${auth.id.padEnd(idWidth)}  ${(sources[index] ?? "").padEnd(sourceWidth)}  ${state}`.trimEnd();
  });
  const broken = auths.filter((auth) => tokenProblem(auth) !== null);
  const unchecked = auths.filter((auth) => tokenProblem(auth) === null && auth.subject === undefined);
  const details = [
    ...(broken.length === 0 ? [] : [`${broken.length} with a token to replace`]),
    ...(unchecked.length === 0 ? [] : [`${unchecked.length} with no account yet`]),
  ];
  const count = `${auths.length} saved sign-in${auths.length === 1 ? "" : "s"}${details.length === 0 ? "" : `, ${details.join(", ")}`}.`;
  const firstBroken = broken[0];
  const next = firstBroken !== undefined && firstBroken.kind === "oauth-token-file"
    ? tokenNext(firstBroken)
    : unchecked[0] === undefined ? null : `ghostget auth bind ${unchecked[0].id} --site <site>`;
  return { result: `${rows.join("\n")}\n\n${count}`, next, note: null };
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
