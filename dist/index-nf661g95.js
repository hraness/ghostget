// @bun
// src/cli-style.ts
var UNICODE = {
  ok: "\u2713",
  fail: "\u2717",
  warn: "\u26A0",
  next: "\u2192",
  on: "\u25CF",
  off: "\u25CB",
  skip: "\u2013",
  progress: "\u21BB",
  notice: "\uD83D\uDD10"
};
var ASCII = {
  ok: "OK",
  fail: "FAIL",
  warn: "WARN",
  next: "->",
  on: "*",
  off: "o",
  skip: "-",
  progress: "...",
  notice: "NOTE"
};
var COLOR = {
  ok: "32",
  fail: "31",
  warn: "33",
  next: "2",
  on: "32",
  skip: "2"
};
function cliUsesAscii(environment) {
  if (environment.HRANESS_ASCII === "1" || environment.TERM === "dumb")
    return true;
  return ![environment.LC_ALL, environment.LC_CTYPE, environment.LANG].some((value) => value !== undefined && /utf-?8/iu.test(value));
}
function cliUsesColor(environment, isTTY) {
  if (environment.FORCE_COLOR === "1")
    return true;
  if (!isTTY || environment.TERM === "dumb")
    return false;
  return environment.NO_COLOR === undefined || environment.NO_COLOR === "";
}
function cliStyle(environment, isTTY) {
  const ascii = cliUsesAscii(environment);
  const color = cliUsesColor(environment, isTTY);
  return {
    symbol: (name) => {
      const glyph = ascii ? ASCII[name] : UNICODE[name];
      const code = COLOR[name];
      return color && code !== undefined ? `\x1B[${code}m${glyph}\x1B[0m` : glyph;
    }
  };
}
function cliSentence(message) {
  const trimmed = message.trim();
  if (trimmed === "")
    return trimmed;
  const capitalized = `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}`;
  return /[.!?]$/u.test(capitalized) ? capitalized : `${capitalized}.`;
}
function renderCliError(style, message, next) {
  return `${style.symbol("fail")} ${message}
${style.symbol("next")} ${next}
`;
}
function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1;row <= left.length; row += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = row;
    for (let column = 1;column <= right.length; column += 1) {
      const above = previous[column] ?? 0;
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      previous[column] = Math.min(above + 1, (previous[column - 1] ?? 0) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[right.length] ?? Number.POSITIVE_INFINITY;
}
function closestCliName(input, names) {
  if (input.length === 0 || input.length > 64)
    return null;
  let best = null;
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
var RESPONSIBLE_APPS = Object.freeze({
  "com.apple.Terminal": "Terminal",
  "com.googlecode.iterm2": "iTerm",
  "com.mitchellh.ghostty": "Ghostty",
  "com.microsoft.VSCode": "Visual Studio Code",
  "com.microsoft.VSCodeInsiders": "Visual Studio Code - Insiders",
  "com.todesktop.230313mzl4w4u92": "Cursor",
  "com.exafunction.windsurf": "Windsurf",
  "com.vscodium": "VSCodium",
  "dev.zed.Zed": "Zed",
  "dev.warp.Warp-Stable": "Warp",
  "com.github.wez.wezterm": "WezTerm"
});
function responsibleApp(environment) {
  if (environment.HRANESS_APP_BUNDLE_ID !== undefined && environment.HRANESS_APP_BUNDLE_ID !== "")
    return "Ghostget";
  const bundle = environment.__CFBundleIdentifier ?? "";
  const program = environment.TERM_PROGRAM ?? "";
  const named = Object.hasOwn(RESPONSIBLE_APPS, bundle) ? RESPONSIBLE_APPS[bundle] : undefined;
  if (named !== undefined)
    return named;
  if (program === "Apple_Terminal")
    return "Terminal";
  if (program === "iTerm.app")
    return "iTerm";
  if (program === "ghostty")
    return "Ghostty";
  if (program === "vscode")
    return bundle === "" ? "Visual Studio Code" : "your code editor";
  if (environment.ZED_TERM !== undefined && environment.ZED_TERM !== "")
    return "Zed";
  if (program === "WarpTerminal")
    return "Warp";
  if (program === "WezTerm")
    return "WezTerm";
  return "your terminal app";
}

export { cliUsesAscii, cliUsesColor, cliStyle, cliSentence, renderCliError, closestCliName, responsibleApp };
