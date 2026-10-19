import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parseGhostgetArguments } from "../args";
import { assertProperty, fc } from "../test-support";
import { inspectMediaQuarantine, MediaArchiveError, quarantinedRevisionLeaf } from "./archive";
import { parseArgs } from "./args";
import { runCli, type CliIo } from "./cli";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

async function library(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "media-quarantine-")));
  roots.push(root);
  return root;
}

function captureIo(): { io: CliIo; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { io: { stdout: (value) => stdout.push(value), stderr: (value) => stderr.push(value) }, stdout, stderr };
}

/** Every path under `root` with its size and modification time, to prove a read changed nothing. */
async function snapshot(root: string): Promise<readonly string[]> {
  const lines: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).toSorted((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      const metadata = await lstat(path);
      lines.push(`${relative(root, path)} ${String(metadata.size)} ${String(metadata.mtimeMs)} ${String(metadata.mode)}`);
      if (entry.isDirectory()) await walk(path);
    }
  };
  await walk(root);
  return lines;
}

async function tornRevision(root: string, leaf: string, bytes: number): Promise<string> {
  const name = `${randomUUID()}-${leaf}`;
  const directory = join(root, ".wrench-media-quarantine", name);
  await mkdir(join(directory, "data", "capture"), { recursive: true });
  await writeFile(join(directory, "data", "capture", "media.webm"), "x".repeat(bytes));
  await writeFile(join(directory, "wrench-media.json"), "{\"torn\":");
  return name;
}

describe("media quarantine arguments", () => {
  test("parses the read-only quarantine command with an optional library and JSON", () => {
    expect(parseArgs(["quarantine"])).toEqual({ ok: true, command: { kind: "quarantine", json: false } });
    expect(parseArgs(["quarantine", "--output", "/library", "--json"])).toEqual({
      ok: true,
      command: { kind: "quarantine", outputDirectory: "/library", json: true },
    });
  });

  test("rejects extra operands, capture options, and anything that could name an entry to remove", () => {
    for (const argv of [
      ["quarantine", "entry"],
      ["quarantine", "--lang", "en"],
      ["quarantine", "--refresh"],
      ["quarantine", "--output", ""],
    ]) {
      expect(parseArgs(argv).ok).toBeFalse();
    }
  });

  test("routes ghostget media quarantine to the media command unchanged", () => {
    expect(parseGhostgetArguments(["media", "quarantine", "--json"])).toEqual({
      ok: true,
      value: { command: "media", arguments: ["quarantine", "--json"] },
    });
  });
});

describe("inspectMediaQuarantine", () => {
  test("reports an absent library without creating it", async () => {
    const root = join(await library(), "not-created");
    const report = await inspectMediaQuarantine({ libraryDirectory: root });
    expect(report).toMatchObject({ exists: false, entries: [], truncated: false });
    expect(existsSync(root)).toBeFalse();
  });

  test("reports a library with no quarantine without creating the directory", async () => {
    const root = await library();
    const report = await inspectMediaQuarantine({ libraryDirectory: root });
    expect(report).toMatchObject({ exists: false, entries: [], truncated: false });
    expect(existsSync(join(root, ".wrench-media-quarantine"))).toBeFalse();
  });

  test("lists each torn revision with its original leaf, size, and file count and changes nothing", async () => {
    const root = await library();
    const first = await tornRevision(root, "abcdefghijk", 5);
    const second = await tornRevision(root, "zyxwvutsrqp", 11);
    await writeFile(join(root, ".wrench-media-quarantine", "stray-note"), "owner file");
    const before = await snapshot(root);

    const report = await inspectMediaQuarantine({ libraryDirectory: root });

    expect(await snapshot(root)).toEqual(before);
    expect(report.exists).toBeTrue();
    expect(report.truncated).toBeFalse();
    expect(report.quarantineDirectory).toBe(join(root, ".wrench-media-quarantine"));
    const byName = new Map(report.entries.map((entry) => [entry.name, entry]));
    expect(byName.get(first)).toMatchObject({ kind: "directory", originalLeaf: "abcdefghijk", files: 2, bytes: 5 + 8 });
    expect(byName.get(second)).toMatchObject({ kind: "directory", originalLeaf: "zyxwvutsrqp", files: 2, bytes: 11 + 8 });
    expect(byName.get("stray-note")).toMatchObject({ kind: "other", originalLeaf: null, files: null, bytes: null });
    expect(report.entries.map((entry) => entry.name)).toEqual([...report.entries.map((entry) => entry.name)].toSorted());
  });

  test("does not follow a symbolic link inside a quarantined revision", async () => {
    const root = await library();
    const name = await tornRevision(root, "abcdefghijk", 3);
    await writeFile(join(root, "outside"), "o".repeat(1_000));
    await symlink(join(root, "outside"), join(root, ".wrench-media-quarantine", name, "link"));
    const report = await inspectMediaQuarantine({ libraryDirectory: root });
    expect(report.entries).toEqual([
      expect.objectContaining({ name, files: 2, bytes: 3 + 8 }),
    ]);
  });

  test("refuses a quarantine directory that is a symbolic link", async () => {
    const root = await library();
    await mkdir(join(root, "elsewhere"));
    await symlink(join(root, "elsewhere"), join(root, ".wrench-media-quarantine"));
    const error = await inspectMediaQuarantine({ libraryDirectory: root }).then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(MediaArchiveError);
    expect((error as MediaArchiveError).code).toBe("ARCHIVE_INVALID");
  });
});

describe("ghostget media quarantine", () => {
  test("prints the entries and says that nothing was removed", async () => {
    const root = await library();
    const name = await tornRevision(root, "abcdefghijk", 5);
    const output = captureIo();
    const code = await runCli(["quarantine", "--output", root], { io: output.io, environment: {}, homeDirectory: "/home/test" });
    expect(code).toBe(0);
    const text = output.stdout.join("");
    expect(text).toContain(name);
    expect(text).toContain("13 bytes");
    expect(text).toContain("Nothing was removed");
    expect(existsSync(join(root, ".wrench-media-quarantine", name))).toBeTrue();
  });

  test("emits a stable JSON record", async () => {
    const root = await library();
    const name = await tornRevision(root, "abcdefghijk", 5);
    const output = captureIo();
    const code = await runCli(["quarantine", "--output", root, "--json"], { io: output.io, environment: {}, homeDirectory: "/home/test" });
    expect(code).toBe(0);
    const record = JSON.parse(output.stdout.join("")) as Record<string, unknown>;
    expect(Object.keys(record).toSorted()).toEqual(["ok", "quarantine"]);
    expect(record["quarantine"]).toMatchObject({
      exists: true,
      truncated: false,
      entries: [expect.objectContaining({ name, originalLeaf: "abcdefghijk", files: 2, bytes: 13 })],
    });
  });
});

test("property: a quarantined name yields its original leaf only in the <uuid>-<leaf> form", () => {
  assertProperty(
    fc.property(
      fc.uuid(),
      fc.stringMatching(/^[A-Za-z0-9_.-]{1,64}$/u),
      fc.string({ maxLength: 80 }),
      (uuid, leaf, other) => {
        expect(quarantinedRevisionLeaf(`${uuid}-${leaf}`)).toBe(leaf);
        const matchesForm = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-.+$/u.test(other);
        if (!matchesForm) expect(quarantinedRevisionLeaf(other)).toBeNull();
      },
    ),
  );
});
