import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runGhostgetCliProcess } from "./cli";
import { terminalIntro } from "./cli-intro";
import {
  cliSentence,
  cliStyle,
  cliUsesAscii,
  cliUsesColor,
  closestCliName,
  renderCliError,
} from "./cli-style";
import { renderGhostgetUsageError } from "./ghostget";
import {
  GHOSTGET_COMMAND_NAMES,
  ghostgetBareUsage,
  ghostgetHelpCommandFor,
  ghostgetHelpRequest,
  ghostgetUsage,
} from "./usage";
import { GHOSTGET_VERSION } from "./version";

const goldenDirectory = join(import.meta.dir, "fixtures", "cli-help");
const cliPath = join(import.meta.dir, "cli.ts");
const update = process.env.GHOSTGET_UPDATE_GOLDEN === "1";
const privateHome = mkdtempSync(join(tmpdir(), "ghostget-help-home-"));

function golden(name: string, actual: string): void {
  const path = join(goldenDirectory, `${name}.txt`);
  if (update || !existsSync(path)) {
    if (!update) throw new Error(`missing golden ${name}; rerun with GHOSTGET_UPDATE_GOLDEN=1`);
    mkdirSync(goldenDirectory, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  expect(actual).toBe(readFileSync(path, "utf8"));
}

async function render(rawArguments: readonly string[]): Promise<{
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}> {
  const previous = process.exitCode;
  let stdout = "";
  let stderr = "";
  try {
    process.exitCode = 0;
    await runGhostgetCliProcess(
      rawArguments,
      {
        stdout: (value) => { stdout += value; },
        stderr: (value) => { stderr += value; },
      },
      () => { throw new Error("help must not load the command graph"); },
      () => { throw new Error("help must not load the catalog"); },
      () => { throw new Error("help must not load the notes CLI"); },
      () => { throw new Error("help must not load support"); },
    );
    return { stdout, stderr, exitCode: Number(process.exitCode ?? 0) };
  } finally {
    process.exitCode = previous;
  }
}

async function spawn(
  command: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = {},
): Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }> {
  const child = Bun.spawn([...command], {
    env: { PATH: process.env.PATH, HOME: privateHome, GHOSTGET_STATE_HOME: join(privateHome, "state"), ...environment },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

/** Topics with their own static help text, one golden each. */
const TEXT_TOPICS = [
  "read", "clip", "auth", "browsers", "capabilities", "invoke", "confirm",
  "omni", "doctor", "login", "adapter", "plugin", "contracts", "derive",
  "messaging", "thread", "platforms", "notes", "support", "policy", "advanced",
] as const;

describe("ghostget help", () => {
  test("bare invocation is short, grouped and ends with the version", async () => {
    const result = await render([]);
    expect(result).toEqual({ stdout: ghostgetBareUsage(GHOSTGET_VERSION), stderr: "", exitCode: 0 });
    golden("bare", ghostgetBareUsage("0.0.0"));
    const banner = terminalIntro({ isTTY: true, columns: 80, term: "xterm" });
    const lines = `${banner}${ghostgetBareUsage(GHOSTGET_VERSION)}`.split("\n").length - 1;
    expect(lines).toBeLessThanOrEqual(25);
    expect(ghostgetBareUsage(GHOSTGET_VERSION)).toEndWith(`ghostget ${GHOSTGET_VERSION}\n`);
    expect(ghostgetBareUsage(GHOSTGET_VERSION)).not.toMatch(/support protocol|credits|closeout/u);
  });

  test("root help is grouped, at most 60 lines and 80 columns, without internal vocabulary", async () => {
    for (const spelling of [["--help"], ["-h"], ["help"]]) {
      expect(await render(spelling)).toEqual({ stdout: ghostgetUsage, stderr: "", exitCode: 0 });
    }
    golden("root", ghostgetUsage);
    const lines = ghostgetUsage.split("\n");
    expect(lines.length - 1).toBeLessThanOrEqual(60);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(80);
    expect(ghostgetUsage).not.toMatch(
      /\b(admission|custody|receipt|projection|habitat|organism|semantic|realm|locator)\b/iu,
    );
    expect(ghostgetUsage).toStartWith("Usage: ghostget <command> [options]\n");
    expect(ghostgetUsage).toContain("-h, --help");
    expect(ghostgetUsage).toContain("-V, --version");
  });

  test("every command family has help on stdout that exits 0 in all three spellings", async () => {
    for (const topic of TEXT_TOPICS) {
      const viaHelp = await render(["help", topic]);
      expect(viaHelp.exitCode, topic).toBe(0);
      expect(viaHelp.stderr, topic).toBe("");
      golden(`topic-${topic}`, viaHelp.stdout);
      for (const line of viaHelp.stdout.split("\n")) expect(line.length, `${topic}: ${line}`).toBeLessThanOrEqual(80);
      if (topic === "policy" || topic === "advanced" || topic === "notes") continue;
      expect(await render([topic, "--help"]), topic).toEqual(viaHelp);
      expect(await render([topic, "-h"]), topic).toEqual(viaHelp);
    }
  });

  test("help for a subcommand that needs arguments exits 0 instead of a parse error", async () => {
    const auth = await render(["help", "auth"]);
    for (const rawArguments of [
      ["auth", "add", "--help"],
      ["auth", "add", "x-main", "--cookie-source", "chrome", "--help"],
      ["auth", "bind", "-h"],
    ]) expect(await render(rawArguments)).toEqual(auth);
    const invoke = await render(["help", "invoke"]);
    expect(await render(["x-web", "timeline.read", "--help"])).toEqual(invoke);
    expect(await render(["https://example.com", "--help"])).toEqual(await render(["help", "clip"]));
  });

  test("commands that own their help are delegated, not intercepted", () => {
    for (const command of ["menubar", "tui", "vault", "web", "interface", "media", "url-metadata"]) {
      expect(ghostgetHelpRequest([command, "--help"]), command).toBeNull();
      expect(ghostgetHelpRequest(["help", command]), command).toEqual({
        kind: "delegate",
        arguments: [command === "url-metadata" ? "url-metadata" : command, "--help"],
      });
    }
    expect(ghostgetHelpRequest(["read", "https://example.com"])).toBeNull();
    expect(ghostgetHelpRequest(["derive", "browser", "d-1", "--", "chrome", "--help"])).toBeNull();
  });

  test("an unknown help topic is a one-line usage error", async () => {
    const result = await render(["help", "nope"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^(✗|FAIL) No help topic named "nope"\.\n(→|->) ghostget --help\n$/u);
  });
});

describe("ghostget usage errors", () => {
  const utf8 = { LANG: "en_US.UTF-8", TERM: "xterm-256color" };

  test("render one line and one next command, never the full help", () => {
    const unknown = renderGhostgetUsageError("unknown command: captur", ["captur"], { ...utf8, NO_COLOR: "1" }, false);
    expect(unknown).toBe('✗ Unknown command "captur". Did you mean "capture"?\n→ ghostget --help\n');
    const auth = renderGhostgetUsageError("auth ID must be lowercase kebab-case", ["auth", "add", "X"], utf8, false);
    expect(auth).toBe("✗ Auth ID must be lowercase kebab-case.\n→ ghostget auth --help\n");
    expect(auth).not.toContain("Usage:");
    golden("error-unknown-command", unknown);
    golden("error-missing-url", renderGhostgetUsageError("A page URL is missing", ["read"], utf8, false));
  });

  test("NO_COLOR keeps symbols, TERM=dumb and non-UTF-8 locales use ASCII, color needs a TTY", () => {
    const colored = renderGhostgetUsageError("A page URL is missing", ["read"], utf8, true);
    expect(colored).toBe("\u001b[31m✗\u001b[0m A page URL is missing.\n\u001b[2m→\u001b[0m ghostget read --help\n");
    expect(renderGhostgetUsageError("A page URL is missing", ["read"], { ...utf8, NO_COLOR: "1" }, true))
      .toBe("✗ A page URL is missing.\n→ ghostget read --help\n");
    expect(renderGhostgetUsageError("A page URL is missing", ["read"], utf8, false))
      .toBe("✗ A page URL is missing.\n→ ghostget read --help\n");
    const dumb = renderGhostgetUsageError("A page URL is missing", ["read"], { LANG: "en_US.UTF-8", TERM: "dumb" }, true);
    expect(dumb).toBe("FAIL A page URL is missing.\n-> ghostget read --help\n");
    golden("error-ascii", dumb);
    expect(renderGhostgetUsageError("A page URL is missing", ["read"], { LANG: "C", TERM: "xterm" }, false))
      .toBe("FAIL A page URL is missing.\n-> ghostget read --help\n");
    expect(renderGhostgetUsageError("A page URL is missing", ["read"], { ...utf8, HRANESS_ASCII: "1" }, false))
      .toBe("FAIL A page URL is missing.\n-> ghostget read --help\n");
  });

  test("hostile input is bounded and never echoed as control characters", () => {
    const text = renderGhostgetUsageError(`unknown command: ${"\u001b[2J".repeat(40)}`, [`${"\u001b[2J".repeat(40)}`], utf8, false);
    expect(text).not.toContain("\u001b");
    expect(text.split("\n")[0]!.length).toBeLessThanOrEqual(120);
  });

  test("the next command points at the closest help", () => {
    expect(ghostgetHelpCommandFor([])).toBe("ghostget --help");
    expect(ghostgetHelpCommandFor(["auth", "add"])).toBe("ghostget auth --help");
    expect(ghostgetHelpCommandFor(["x-web", "timeline.read"])).toBe("ghostget invoke --help");
    expect(ghostgetHelpCommandFor(["zzz"])).toBe("ghostget --help");
  });
});

describe("cli style", () => {
  test("color, ASCII and symbol rules follow the shared contract", () => {
    expect(cliUsesColor({}, true)).toBeTrue();
    expect(cliUsesColor({}, false)).toBeFalse();
    expect(cliUsesColor({ NO_COLOR: "1" }, true)).toBeFalse();
    expect(cliUsesColor({ NO_COLOR: "" }, true)).toBeTrue();
    expect(cliUsesColor({ TERM: "dumb" }, true)).toBeFalse();
    expect(cliUsesColor({ FORCE_COLOR: "1" }, false)).toBeTrue();
    expect(cliUsesAscii({ LANG: "en_US.UTF-8" })).toBeFalse();
    expect(cliUsesAscii({ LC_ALL: "C" })).toBeTrue();
    expect(cliUsesAscii({ LANG: "en_US.UTF-8", TERM: "dumb" })).toBeTrue();
    expect(cliUsesAscii({ LANG: "en_US.UTF-8", HRANESS_ASCII: "1" })).toBeTrue();
    const plain = cliStyle({ LANG: "en_US.UTF-8" }, false);
    expect(renderCliError(plain, "Nope.", "ghostget --help")).toBe("✗ Nope.\n→ ghostget --help\n");
    expect(cliSentence("no trailing period")).toBe("No trailing period.");
    expect(cliSentence("Already done!")).toBe("Already done!");
  });

  test("suggestions stay within two edits", () => {
    expect(closestCliName("brwosers", GHOSTGET_COMMAND_NAMES)).toBe("browsers");
    expect(closestCliName("completely-different", GHOSTGET_COMMAND_NAMES)).toBeNull();
    expect(closestCliName("", GHOSTGET_COMMAND_NAMES)).toBeNull();
    expect(GHOSTGET_COMMAND_NAMES).not.toContain("policy");
  });
});

describe("ghostget help in a real process", () => {
  test("help piped into head exits quietly", async () => {
    const piped = await spawn(["sh", "-c", `"${process.execPath}" "${cliPath}" --help | head -1`]);
    expect(piped.exitCode).toBe(0);
    expect(piped.stdout).toBe("Usage: ghostget <command> [options]\n");
    expect(piped.stderr).toBe("");
  });

  test("per-command help and usage errors from the installed entrypoint", async () => {
    const help = await spawn([process.execPath, cliPath, "auth", "add", "--help"], { NO_COLOR: "1", LANG: "en_US.UTF-8" });
    expect(help.exitCode).toBe(0);
    expect(help.stderr).toBe("");
    expect(help.stdout).toStartWith("Usage: ghostget auth ");
    const missing = await spawn([process.execPath, cliPath, "read"], { NO_COLOR: "1", LANG: "en_US.UTF-8" });
    expect(missing).toEqual({ exitCode: 2, stdout: "", stderr: "✗ A page URL is missing.\n→ ghostget read --help\n" });
  });
});
