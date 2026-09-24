import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "./process";

const fixture = join(import.meta.dir, "process-parent-exit.fixture.ts");
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

async function eventually(predicate: () => boolean, limitMs: number): Promise<boolean> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await Bun.sleep(20);
  }
  return predicate();
}

type Group = Readonly<{ leader: number; child: number }>;

type Parent = Readonly<{
  subprocess: ReturnType<typeof Bun.spawn>;
  group: Group;
  readyFile: string;
}>;

async function startParent(mode: string): Promise<Parent> {
  const root = await mkdtemp(join(tmpdir(), "media-parent-exit-"));
  roots.push(root);
  const pidFile = join(root, "group.pid");
  const readyFile = join(root, "ready");
  const subprocess = Bun.spawn([process.execPath, fixture, mode, pidFile, readyFile], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  strays.push(subprocess.pid);
  if (!(await eventually(() => existsSync(readyFile), 15_000))) {
    throw new Error("the fixture parent did not start its grouped tool");
  }
  const [leader, child] = (await readFile(pidFile, "utf8")).trim().split(" ").map((value) => Number.parseInt(value, 10));
  if (leader === undefined || child === undefined || !Number.isSafeInteger(leader) || !Number.isSafeInteger(child)) {
    throw new Error("the fixture parent wrote an invalid process group record");
  }
  strays.push(leader, child);
  return { subprocess, group: { leader, child }, readyFile };
}

async function expectGroupStopped(group: Group): Promise<void> {
  expect(await eventually(() => !isRunning(group.leader) && !isRunning(group.child), 3_000)).toBeTrue();
}

describe.skipIf(process.platform === "win32")("media process groups when the parent ends", () => {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    test(`an unhandled ${signal} stops the group and still ends the parent with ${signal}`, async () => {
      const { subprocess, group } = await startParent("signal");
      expect(isRunning(group.child)).toBeTrue();
      subprocess.kill(signal);
      await subprocess.exited;
      expect(subprocess.signalCode).toBe(signal);
      await expectGroupStopped(group);
    });
  }

  test("process.exit stops the group before the parent exits", async () => {
    const { subprocess, group } = await startParent("exit");
    expect(await subprocess.exited).toBe(7);
    await expectGroupStopped(group);
  });

  test("an uncaught error stops the group before the parent exits", async () => {
    const { subprocess, group } = await startParent("throw");
    expect(await subprocess.exited).not.toBe(0);
    await expectGroupStopped(group);
  });

  test("a signal that another listener owns leaves the group to that listener, and the next one stops it", async () => {
    const { subprocess, group, readyFile } = await startParent("owned-signal");
    subprocess.kill("SIGINT");
    expect(await eventually(() => existsSync(`${readyFile}.first-signal`), 5_000)).toBeTrue();
    await Bun.sleep(200);
    expect(subprocess.exitCode).toBeNull();
    expect(isRunning(group.child)).toBeTrue();

    subprocess.kill("SIGINT");
    await subprocess.exited;
    expect(subprocess.signalCode).toBe("SIGINT");
    await expectGroupStopped(group);
  });
});

test.skipIf(process.platform === "win32")("a finished grouped run leaves no parent signal or exit listener behind", async () => {
  const events = ["SIGINT", "SIGTERM", "SIGHUP", "exit"] as const;
  const before = events.map((event) => process.listenerCount(event));
  const result = await runProcess(["/bin/sh", "-c", "exit 0"], { processGroup: true });
  expect(result.ok).toBeTrue();
  expect(events.map((event) => process.listenerCount(event))).toEqual(before);
});
