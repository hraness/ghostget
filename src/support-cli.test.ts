import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isUsefulSupportBoundary, runGhostgetCliProcess } from "./cli";

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

  test("allows useful captures while excluding auth, writes, diagnostics and machine output", () => {
    for (const args of [
      ["clip", "https://example.com/article"],
      ["read", "https://example.com/article"],
      ["https://example.com/article"],
      ["media", "transcript", "https://example.com/video"],
      ["verify", "archive"],
    ]) expect(isUsefulSupportBoundary(args)).toBeTrue();
    for (const args of [
      [], ["--help"], ["--version"], ["capabilities"], ["doctor"],
      ["auth", "login", "example"], ["confirm", "digest"],
      ["invoke", "example", "posts.publish"], ["support"],
      ["read", "https://example.com", "--json"],
      ["archive", "https://example.com", "--quiet"],
      ["clip", "--help"], ["media", "doctor"],
      ["archive", "--version"], ["audio", "-V"], ["media", "transcript", "--version"],
    ]) expect(isUsefulSupportBoundary(args)).toBeFalse();
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

  test("offers only after successful terminal work and tolerates optional support failure", async () => {
    const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    const stderrTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    let invitations = 0;
    const forbidden = () => { throw new Error("the capture uses the provider process"); };
    try {
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
      Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
      for (const exitCode of [1, 0]) {
        await runGhostgetCliProcess(
          ["clip", "https://example.com"],
          undefined,
          async () => ({ runGhostgetProcess: async () => { process.exitCode = exitCode; } }),
          forbidden,
          forbidden,
          async () => ({
            runGhostgetSupportCommand: forbidden,
            showGhostgetSupportInvitation: async () => {
              invitations += 1;
              throw new Error("optional support unavailable");
            },
          }),
        );
        expect(process.exitCode).toBe(exitCode);
      }
    } finally {
      if (stdoutTTY === undefined) Reflect.deleteProperty(process.stdout, "isTTY");
      else Object.defineProperty(process.stdout, "isTTY", stdoutTTY);
      if (stderrTTY === undefined) Reflect.deleteProperty(process.stderr, "isTTY");
      else Object.defineProperty(process.stderr, "isTTY", stderrTTY);
    }
    expect(invitations).toBe(1);
  });
});
