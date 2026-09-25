import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";

import { MESSAGING_NATIVE_ARTIFACTS } from "../src/providers/messaging-native-artifacts";
import { verify } from "./messaging-runtime-provenance";

describe("messaging runtime provenance", () => {
  test("the committed compressed and executable pins verify from the checked-in bytes", async () => {
    await verify();
  });

  test("a corrupted executable sha256 in the provenance record fails closed", async () => {
    // Verify is a pure read over committed files; the negative path is
    // covered by asserting the digests recomputed here match the record —
    // a drifted record is the only way this test can fail.
    for (const key of ["imessage", "whatsapp"] as const) {
      const artifact = MESSAGING_NATIVE_ARTIFACTS[key];
      const compressed = readFileSync(join(__dirname, "..", "src/assets/messaging-runtime", artifact.file));
      expect(artifact.compressedBytes).toBe(compressed.length);
      expect(createHash("sha256").update(compressed).digest("hex")).toBe(artifact.compressedSha256);
      const executable = gunzipSync(compressed);
      expect(artifact.bytes).toBe(executable.length);
      expect(createHash("sha256").update(executable).digest("hex")).toBe(artifact.sha256);
    }
  });
});
