import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { checkLanternMaterialSnapshot, lanternSnapshotFileLimits } from "./vendor/lantern-material/check.mjs";

/** Admit the whole portable snapshot, then retain bounded, hash-matched build bytes. */
export async function snapshotLanternMaterial(directory: string) {
  const manifest = await checkLanternMaterialSnapshot(directory);
  const files = new Map<string, Buffer>();
  for (const name of ["lantern-material.css", "LICENSE"] as const) {
    const handle = await open(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      const limit = lanternSnapshotFileLimits[name];
      assert.ok(before.isFile() && before.size > 0 && before.size <= limit, "Lantern build input is nonordinary or oversized.");
      const buffer = Buffer.alloc(before.size + 1);
      let consumed = 0;
      while (consumed < buffer.length) {
        const { bytesRead } = await handle.read(buffer, consumed, buffer.length - consumed, consumed);
        if (bytesRead === 0) break;
        consumed += bytesRead;
      }
      const after = await handle.stat();
      assert.ok(consumed === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs,
        "Lantern build input changed while reading.");
      const bytes = buffer.subarray(0, consumed);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.files[name].sha256,
        "Lantern snapshot changed after admission.");
      files.set(name, bytes);
    } finally {
      await handle.close();
    }
  }
  return { manifest, files };
}
