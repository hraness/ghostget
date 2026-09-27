/**
 * Shared terminal symbols and short error lines for human CLI output.
 *
 * Follows the Hraness CLI style contract: only the symbol is colored, color
 * needs a TTY and no NO_COLOR, and ASCII fallbacks replace every symbol when
 * the terminal can't show UTF-8. This module must stay import-free so static
 * help can use it without loading the command graph.
 */

export type CliEnvironment = Readonly<Record<string, string | undefined>>;

export type CliSymbol =
  | "ok"
  | "fail"
  | "warn"
  | "next"
  | "on"
  | "off"
  | "skip"
  | "progress"
  | "notice";

const UNICODE: Readonly<Record<CliSymbol, string>> = {
  ok: "✓",
  fail: "✗",
  warn: "⚠",
  next: "→",
  on: "●",
  off: "○",
  skip: "–",
  progress: "↻",
  notice: "🔐",
};

const ASCII: Readonly<Record<CliSymbol, string>> = {
  ok: "OK",
  fail: "FAIL",
  warn: "WARN",
  next: "->",
  on: "*",
  off: "o",
  skip: "-",
  progress: "...",
  notice: "NOTE",
};

const COLOR: Readonly<Partial<Record<CliSymbol, string>>> = {
  ok: "32",
  fail: "31",
  warn: "33",
  next: "2",
  on: "32",
  skip: "2",
};

/** True when symbols must fall back to ASCII. */
export function cliUsesAscii(environment: CliEnvironment): boolean {
  if (environment.HRANESS_ASCII === "1" || environment.TERM === "dumb") return true;
  return ![environment.LC_ALL, environment.LC_CTYPE, environment.LANG]
    .some((value) => value !== undefined && /utf-?8/iu.test(value));
}

/** True when the stream being written may carry ANSI color. */
export function cliUsesColor(environment: CliEnvironment, isTTY: boolean): boolean {
  if (environment.FORCE_COLOR === "1") return true;
  if (!isTTY || environment.TERM === "dumb") return false;
  return environment.NO_COLOR === undefined || environment.NO_COLOR === "";
}

export type CliStyle = {
  readonly symbol: (name: CliSymbol) => string;
};

export function cliStyle(environment: CliEnvironment, isTTY: boolean): CliStyle {
  const ascii = cliUsesAscii(environment);
  const color = cliUsesColor(environment, isTTY);
  return {
    symbol: (name) => {
      const glyph = ascii ? ASCII[name] : UNICODE[name];
      const code = COLOR[name];
      return color && code !== undefined ? `\u001b[${code}m${glyph}\u001b[0m` : glyph;
    },
  };
}

/** Sentence-case a message fragment and end it with a period. */
export function cliSentence(message: string): string {
  const trimmed = message.trim();
  if (trimmed === "") return trimmed;
  const capitalized = `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}`;
  return /[.!?]$/u.test(capitalized) ? capitalized : `${capitalized}.`;
}

/** `✗ what happened` then `→ one next command`. */
export function renderCliError(style: CliStyle, message: string, next: string): string {
  return `${style.symbol("fail")} ${message}\n${style.symbol("next")} ${next}\n`;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column] ?? 0;
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      previous[column] = Math.min(above + 1, (previous[column - 1] ?? 0) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}

/** The closest known name within two edits, or null. */
export function closestCliName(input: string, names: readonly string[]): string | null {
  if (input.length === 0 || input.length > 64) return null;
  let best: string | null = null;
  let bestDistance = 3;
  for (const name of names) {
    const distance = editDistance(input, name);
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return best;
}

/** Map a terminal program to the app name macOS shows in Privacy & Security. */
export function responsibleApp(environment: CliEnvironment): string {
  if (environment.HRANESS_APP_BUNDLE_ID !== undefined && environment.HRANESS_APP_BUNDLE_ID !== "") return "Ghostget";
  const bundle = environment.__CFBundleIdentifier ?? "";
  const program = environment.TERM_PROGRAM ?? "";
  if (bundle === "com.apple.Terminal" || program === "Apple_Terminal") return "Terminal";
  if (bundle === "com.googlecode.iterm2" || program === "iTerm.app") return "iTerm";
  if (bundle === "com.mitchellh.ghostty" || program === "ghostty") return "Ghostty";
  if (bundle === "com.microsoft.VSCode" || program === "vscode") return "Visual Studio Code";
  if (bundle === "dev.zed.Zed" || (environment.ZED_TERM !== undefined && environment.ZED_TERM !== "")) return "Zed";
  if (bundle === "dev.warp.Warp-Stable" || program === "WarpTerminal") return "Warp";
  if (bundle === "com.github.wez.wezterm" || program === "WezTerm") return "WezTerm";
  return "your terminal app";
}
