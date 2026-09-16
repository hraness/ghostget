import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { standaloneSupportDepth, runGhostgetCliProcess } from "./cli";

const fixtureEmail = "ghostget-fixture@example.test";
const canonicalSupportUrls = [
  "https://account.hraness.com/support?product=wrench&source=cli#updates",
  "https://account.hraness.com/support?product=wrench&source=cli#support",
];

function isolatedEnvironment(root: string): Record<string, string> {
  const cwd = join(root, "cwd");
  mkdirSync(cwd, { recursive: true });
  const gitConfig = join(root, "gitconfig");
  writeFileSync(gitConfig, `[user]\nemail = ${fixtureEmail}\n`);
  const env: Record<string, string> = {
    HOME: root,
    PATH: process.env.PATH ?? "",
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CEILING_DIRECTORIES: root,
    GHOSTGET_STATE_HOME: join(root, "ghostget-state"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_STATE_HOME: join(root, "state"),
    HRANESS_SUPPORT_EMAIL: "off",
  };
  for (const name of ["COMSPEC", "PATHEXT", "SystemRoot", "SYSTEMROOT"]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

const cli = [process.execPath, "--no-env-file", "--no-install", join(import.meta.dir, "cli.ts")];
const usefulArguments = ["thread", "split", "x", "--text", "Synthetic support fixture", "--json"];

async function runIsolatedCli(root: string, args: readonly string[], extraEnv: Record<string, string> = {}) {
  const env = { ...isolatedEnvironment(root), ...extraEnv };
  const child = Bun.spawn([...cli, ...args], {
    cwd: join(root, "cwd"), env, stdin: "ignore", stdout: "pipe", stderr: "pipe",
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).finally(() => clearTimeout(timeout));
  return { exitCode, stdout, stderr };
}

function runIsolatedSupport(root: string, args: readonly string[], disabled = false) {
  return runIsolatedCli(root, ["support", ...args], { HRANESS_SUPPORT_EMAIL: disabled ? "off" : "" });
}

async function runIsolatedPty(root: string, extraEnv: Record<string, string> = {}) {
  const env = { ...isolatedEnvironment(root), ...extraEnv };
  const chunks: Buffer[] = [];
  let closed = (): void => undefined;
  const eof = new Promise<void>((resolve) => { closed = resolve; });
  const child = Bun.spawn([...cli, ...usefulArguments], {
    cwd: join(root, "cwd"), env,
    terminal: {
      cols: 100, rows: 24,
      data: (_terminal, data) => { chunks.push(Buffer.from(data)); },
      exit: () => { closed(); },
    },
  });
  const timeout = setTimeout(() => { child.kill("SIGKILL"); child.terminal?.close(); closed(); }, 10_000);
  try {
    const [exitCode] = await Promise.all([child.exited, eof]);
    return { exitCode, output: Buffer.concat(chunks).toString("utf8").replaceAll("\r\n", "\n") };
  } finally {
    clearTimeout(timeout);
    child.terminal?.close();
  }
}

describe("optional Ghostget support", () => {
  let stateRoot: string;
  let previousStateHome: string | undefined;
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    stateRoot = realpathSync(mkdtempSync(join(tmpdir(), "ghostget-support-cli-")));
    previousStateHome = process.env.GHOSTGET_STATE_HOME;
    previousExitCode = process.exitCode;
    process.env.GHOSTGET_STATE_HOME = stateRoot;
    process.exitCode = undefined;
  });

  afterEach(() => {
    if (previousStateHome === undefined) delete process.env.GHOSTGET_STATE_HOME;
    else process.env.GHOSTGET_STATE_HOME = previousStateHome;
    process.exitCode = previousExitCode;
    rmSync(stateRoot, { recursive: true, force: true });
  });

  test("offers an unverified synthetic Git email without changing links or persisting it", async () => {
    const result = await runIsolatedSupport(stateRoot, ["--json"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const offer = JSON.parse(result.stdout);
    expect(offer.product).toEqual({ id: "wrench", name: "Ghostget" });
    expect(offer.emailSuggestion).toEqual({ email: fixtureEmail, source: "git-config", verified: false });
    expect(offer.actions.map((action: { url: string }) => action.url)).toEqual(canonicalSupportUrls);
    const text = await runIsolatedSupport(stateRoot, []);
    expect(text.exitCode).toBe(0);
    expect(text.stderr).toBe("");
    expect(text.stdout).toContain(fixtureEmail);
    expect(text.stdout).toContain("skip updates");
    expect(existsSync(join(stateRoot, "state"))).toBeFalse();
  });

  test("disables email discovery while preserving explicit support offers", async () => {
    const result = await runIsolatedSupport(stateRoot, ["--json"], true);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const offer = JSON.parse(result.stdout);
    expect(offer).not.toHaveProperty("emailSuggestion");
    expect(offer.actions.map((action: { url: string }) => action.url)).toEqual(canonicalSupportUrls);
    const text = await runIsolatedSupport(stateRoot, [], true);
    expect(text.exitCode).toBe(0);
    expect(text.stderr).toBe("");
    expect(text.stdout).not.toContain(fixtureEmail);
    expect(existsSync(join(stateRoot, "state"))).toBeFalse();
  });

  test("bounds inherited CLI depth and rejects malformed nesting markers", () => {
    expect(standaloneSupportDepth(undefined)).toBe(0);
    for (const depth of ["0", "1", "8"]) expect(standaloneSupportDepth(depth)).toBe(Number(depth));
    for (const depth of ["", "-1", "9", "01", "1.0", "1e0", " 0", "0\n"]) expect(standaloneSupportDepth(depth)).toBeNull();
  });

  test("discovers closeout in pipes without changing JSON or claiming an invitation", async () => {
    const first = await runIsolatedCli(stateRoot, usefulArguments);
    expect(first.exitCode).toBe(0);
    const artifact = JSON.parse(first.stdout);
    expect(artifact.kind).toBe("local-thread-split");
    expect(artifact.published).toBeFalse();
    expect(artifact.chunks.map((chunk: { text: string }) => chunk.text).join("")).toBe("Synthetic support fixture");
    const discovery = JSON.parse(first.stderr);
    expect(discovery.schemaVersion).toBe("hraness-support-discovery-v1");
    expect(discovery).not.toHaveProperty("emailSuggestion");
    expect(first.stderr).toContain("protocol");
    expect(first.stderr).not.toContain(fixtureEmail);
    const second = await runIsolatedCli(stateRoot, usefulArguments);
    expect(second).toEqual({ exitCode: 0, stdout: first.stdout, stderr: "" });
    const protocol = await runIsolatedCli(stateRoot, ["support", "protocol", "--json"]);
    const contract = JSON.parse(protocol.stdout);
    expect(contract.schemaVersion).toBe("hraness-support-protocol-v1");
    expect(contract.commands.offer).toEqual(["ghostget", "support", "offer", "--json"]);
    expect(protocol.stdout).not.toContain(fixtureEmail);
    const offer = await runIsolatedCli(stateRoot, ["support", "offer", "--json"]);
    expect(JSON.parse(offer.stdout).kind).toBe("offer");
  });

  test("treats an unknown PTY audience as an agent without reserving an offer", async () => {
    const result = await runIsolatedPty(stateRoot);
    expect(result.exitCode).toBe(0);
    const lines = result.output.trim().split("\n");
    const discovery = JSON.parse(lines.pop() ?? "");
    const artifact = JSON.parse(lines.join("\n"));
    expect(artifact.kind).toBe("local-thread-split");
    expect(discovery.schemaVersion).toBe("hraness-support-discovery-v1");
    expect(result.output).not.toContain(fixtureEmail);
    const offer = await runIsolatedCli(stateRoot, ["support", "offer", "--json"]);
    expect(JSON.parse(offer.stdout).kind).toBe("offer");
  });

  test("explicit human presentation requires a PTY and audience off suppresses due offers", async () => {
    const pipe = await runIsolatedCli(stateRoot, usefulArguments, { HRANESS_SUPPORT_AUDIENCE: "human" });
    expect(pipe.exitCode).toBe(0);
    expect(pipe.stderr).toBe("");
    const terminal = await runIsolatedPty(stateRoot, { HRANESS_SUPPORT_AUDIENCE: "human" });
    expect(terminal.exitCode).toBe(0);
    expect(terminal.output).toContain("account.hraness.com/support");
    expect(terminal.output).not.toContain("hraness-support-discovery-v1");
    const disabledRoot = join(stateRoot, "disabled");
    const disabled = await runIsolatedPty(disabledRoot, { HRANESS_SUPPORT_AUDIENCE: "off" });
    expect(disabled.exitCode).toBe(0);
    expect(disabled.output).not.toContain("account.hraness.com");
    expect(disabled.output).not.toContain("hraness-support-discovery-v1");
    const offer = await runIsolatedCli(disabledRoot, ["support", "offer", "--json"], { HRANESS_SUPPORT_AUDIENCE: "off" });
    expect(JSON.parse(offer.stdout).kind).toBe("quiet");
    expect(existsSync(join(disabledRoot, "state"))).toBeFalse();
  });

  test("keeps probes, failures, nested executables and unattended mode quiet", async () => {
    for (const args of [["--help"], ["--version"], ["media", "--version"], ["thread", "split", "reddit", "--text", "draft"]]) {
      const result = await runIsolatedCli(stateRoot, args);
      expect(result.stderr).not.toContain("hraness-support-discovery-v1");
    }
    const suppressionEnvironments: readonly Record<string, string>[] = [{ GHOSTGET_CLI_DEPTH: "1" }, { GHOSTGET_CLI_DEPTH: "invalid" }, { CI: "1" }, { HRANESS_SUPPORT: "off" }, { HRANESS_SUPPORT_AUDIENCE: "off" }, { HRANESS_SUPPORT_AUDIENCE: "invalid" }];
    for (const env of suppressionEnvironments) {
      const result = await runIsolatedCli(stateRoot, usefulArguments, env);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
    }
  });

  test("routes explicit support without loading provider or knowledge commands", async () => {
    let stdout = "";
    let stderr = "";
    let received: readonly string[] = [];
    const forbidden = () => { throw new Error("support must stay independent of command runtimes"); };
    await runGhostgetCliProcess(
      ["support", "offer", "--json"],
      { stdout: (value) => { stdout += value; }, stderr: (value) => { stderr += value; } },
      forbidden,
      forbidden,
      forbidden,
      async () => ({
        runGhostgetSupportCommand: async (args, output) => {
          received = args;
          output.stdout('{"kind":"quiet","reason":"dismissed"}\n');
          return 0;
        },
        showGhostgetSupportInvitation: forbidden,
      }),
    );
    expect(received).toEqual(["offer", "--json"]);
    expect(stdout).toBe('{"kind":"quiet","reason":"dismissed"}\n');
    expect(stderr).toBe("");
    expect(process.exitCode).toBe(0);
  });

  test("preserves support command errors and does not fall through to provider parsing", async () => {
    let stderr = "";
    const forbidden = () => { throw new Error("support must not fall through"); };
    await runGhostgetCliProcess(
      ["support", "unknown"],
      { stdout: forbidden, stderr: (value) => { stderr += value; } },
      forbidden,
      forbidden,
      forbidden,
      async () => ({
        runGhostgetSupportCommand: async (_args, output) => {
          output.stderr("Invalid support command.\n");
          return 2;
        },
        showGhostgetSupportInvitation: forbidden,
      }),
    );
    expect(stderr).toBe("Invalid support command.\n");
    expect(process.exitCode).toBe(2);
  });

  test("leaves custom and machine command output untouched", async () => {
    let stdout = "";
    let stderr = "";
    let supportLoads = 0;
    const forbidden = () => { throw new Error("the read uses the provider process"); };
    for (const args of [["read", "https://example.com", "--json"], ["read", "https://example.com"]]) {
      await runGhostgetCliProcess(
        args,
        { stdout: (value) => { stdout += value; }, stderr: (value) => { stderr += value; } },
        async () => ({
          runGhostgetProcess: async (overrides) => {
            overrides?.output?.stdout('{"result":"captured"}\n');
            process.exitCode = 0;
          },
        }),
        forbidden,
        forbidden,
        () => { supportLoads += 1; throw new Error("unexpected support load"); },
      );
    }
    expect(stdout).toBe('{"result":"captured"}\n{"result":"captured"}\n');
    expect(stderr).toBe("");
    expect(supportLoads).toBe(0);
  });

  test("observes only successful standalone completion and tolerates optional support failure", async () => {
    let invitations = 0;
    const forbidden = () => { throw new Error("the invocation uses the provider process"); };
    for (const [exitCode, usefulResult, standalone, extraArgs] of [
      [1, true, true, []], [0, false, true, []], [0, true, false, []],
      [0, true, true, ["--quiet"]], [0, true, true, ["--silent"]],
      [0, true, true, ["--help"]], [0, true, true, ["--version"]],
      [0, true, true, []],
    ] as const) {
      await runGhostgetCliProcess(
        ["invoke", "example", "posts.list", "--json", ...extraArgs],
        undefined,
        async () => ({ runGhostgetProcess: async (overrides) => {
          if (usefulResult) overrides?.onUsefulResult?.();
          process.exitCode = exitCode;
        } }),
        forbidden,
        forbidden,
        async () => ({
          runGhostgetSupportCommand: forbidden,
          showGhostgetSupportInvitation: async () => { invitations += 1; throw new Error("optional support unavailable"); },
        }),
        standalone,
      );
      expect(process.exitCode).toBe(exitCode);
    }
    expect(invitations).toBe(1);
  });
});
