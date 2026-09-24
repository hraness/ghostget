import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertAsyncProperty, fc } from "../test-support";
import {
  runProcess,
  type ProcessSignal,
  type ProcessSpawnOptions,
  type ProcessTimer,
  type SpawnedProcess,
} from "./process";

const roots: string[] = [];
const strays: number[] = [];
afterEach(async () => {
  for (const pid of strays.splice(0)) {
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function eventually(predicate: () => boolean | Promise<boolean>, limitMs: number): Promise<boolean> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await Bun.sleep(20);
  }
  return await predicate();
}

async function readPid(path: string): Promise<number | null> {
  try {
    const value = Number.parseInt((await readFile(path, "utf8")).trim(), 10);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

describe("media process groups", () => {
  test.skipIf(process.platform === "win32")("cancelling a grouped tool also stops its grandchildren", async () => {
    const root = await mkdtemp(join(tmpdir(), "media-process-group-"));
    roots.push(root);
    const pidFile = join(root, "grandchild.pid");
    const controller = new AbortController();
    // The shell stands in for yt-dlp, and `sleep` stands in for its FFmpeg or
    // HLS child. SIGTERM to the shell alone ends the shell and orphans `sleep`.
    const pending = runProcess(
      ["/bin/sh", "-c", `sleep 30 & echo $! > '${pidFile}'; wait`],
      {
        signal: controller.signal,
        processGroup: true,
        terminateGraceMs: 200,
        killGraceMs: 200,
      },
    );
    expect(await eventually(async () => (await readPid(pidFile)) !== null, 5_000)).toBeTrue();
    const grandchild = await readPid(pidFile);
    if (grandchild === null) throw new Error("grandchild did not start");
    strays.push(grandchild);
    expect(isRunning(grandchild)).toBeTrue();

    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ ok: false, reason: "aborted" });
    expect(await eventually(() => !isRunning(grandchild), 3_000)).toBeTrue();
  });
});

class ImmediateTimer implements ProcessTimer {
  readonly delays: number[] = [];

  set = (callback: () => void, delayMs: number): unknown => {
    this.delays.push(delayMs);
    return setTimeout(callback, 0);
  };

  clear = (handle: unknown): void => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  };
}

type ExitPoint = "never" | "SIGTERM" | "SIGKILL";

function scriptedChild(exitOn: ExitPoint, signals: ProcessSignal[]): SpawnedProcess {
  let resolveExit: ((code: number) => void) | undefined;
  const exited = new Promise<number>((resolve) => { resolveExit = resolve; });
  const closed = (): ReadableStream<Uint8Array> => new ReadableStream<Uint8Array>({
    start(controller) { controller.close(); },
  });
  return {
    stdout: closed(),
    stderr: closed(),
    exited,
    kill: (signal) => {
      signals.push(signal);
      if (exitOn !== "never" && signal === exitOn) resolveExit?.(signal === "SIGTERM" ? 143 : 137);
      if (exitOn === "SIGTERM" && signal === "SIGKILL") resolveExit?.(137);
    },
  };
}

test("property: grouped termination is bounded and always ends with a group SIGKILL", async () => {
  await assertAsyncProperty(
    fc.asyncProperty(
      fc.constantFrom<ExitPoint>("never", "SIGTERM", "SIGKILL"),
      fc.constantFrom<"abort" | "timeout">("abort", "timeout"),
      fc.boolean(),
      async (exitOn, cause, grouped) => {
        const signals: ProcessSignal[] = [];
        const spawnOptions: ProcessSpawnOptions[] = [];
        const controller = new AbortController();
        const timer = new ImmediateTimer();
        const pending = runProcess(
          ["yt-dlp", "--", "https://example.test/v"],
          {
            ...(cause === "abort" ? { signal: controller.signal } : {}),
            timeoutMs: cause === "abort" ? 60_000 : 1,
            terminateGraceMs: 1,
            killGraceMs: 1,
            processGroup: grouped,
          },
          {
            spawn: (_argv, options) => {
              spawnOptions.push(options);
              return scriptedChild(exitOn, signals);
            },
            timer,
            now: () => 0,
          },
        );
        if (cause === "abort") controller.abort();
        const result = await pending;
        expect(result.ok).toBeFalse();
        expect(spawnOptions).toEqual([{ processGroup: grouped }]);
        // TERM first, then at most one KILL escalation and one group sweep.
        expect(signals[0]).toBe("SIGTERM");
        expect(signals.length).toBeLessThanOrEqual(3);
        expect(signals.slice(1).every((signal) => signal === "SIGKILL")).toBeTrue();
        if (grouped) expect(signals.at(-1)).toBe("SIGKILL");
        else expect(signals).toEqual(exitOn === "SIGTERM" ? ["SIGTERM"] : ["SIGTERM", "SIGKILL"]);
      },
    ),
  );
});
