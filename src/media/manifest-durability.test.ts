import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertAsyncProperty, fc } from "../test-support";
import {
  mediaFullSyncAvailable,
  nativeMediaDurability,
  syncDirectoryChain,
  type MediaDurability,
} from "./manifest";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "media-durability-")));
  roots.push(root);
  return root;
}

describe("media durability", () => {
  test("flushes a staged item tree and its directories", async () => {
    const root = await fixture();
    await mkdir(join(root, "item", "data", "capture"), { recursive: true });
    await writeFile(join(root, "item", "data", "capture", "media.webm"), "media");
    await writeFile(join(root, "item", "wrench-media.json"), "{}\n");
    await nativeMediaDurability.syncTree(join(root, "item"));
    await nativeMediaDurability.syncDirectory(root);
  });

  test("refuses a tree with a symbolic link instead of following it", async () => {
    const root = await fixture();
    await mkdir(join(root, "item"));
    await writeFile(join(root, "outside"), "caller-owned");
    await symlink(join(root, "outside"), join(root, "item", "link"));
    await expect(nativeMediaDurability.syncTree(join(root, "item"))).rejects.toThrow("symbolic link");
  });

  test.skipIf(process.platform !== "darwin")("reaches F_FULLFSYNC on macOS", () => {
    expect(mediaFullSyncAvailable()).toBeTrue();
  });
});

test("property: a directory chain flushes each ancestor once, from the new parent to the root", async () => {
  await assertAsyncProperty(
    fc.asyncProperty(
      fc.array(fc.stringMatching(/^[a-z0-9]{1,8}$/u), { minLength: 0, maxLength: 12 }),
      async (segments) => {
        const root = "/library";
        const leaf = join(root, ...segments);
        const flushed: string[] = [];
        const recorder: MediaDurability = {
          syncTree: () => Promise.reject(new Error("unused")),
          syncDirectory: (path) => {
            flushed.push(path);
            return Promise.resolve();
          },
        };
        await syncDirectoryChain(recorder, leaf, root);
        const expected = segments.map((_, index) => join(root, ...segments.slice(0, segments.length - index)));
        expect(flushed).toEqual([...expected, root]);
      },
    ),
  );
});
