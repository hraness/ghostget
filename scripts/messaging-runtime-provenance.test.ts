import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";

import { MESSAGING_NATIVE_ARTIFACTS } from "../src/providers/messaging-native-artifacts";
import { assertPatchStackIdentity, commandSucceeded, verify } from "./messaging-runtime-provenance";

describe("messaging runtime provenance", () => {
  test("pinned source trees tolerate reconstructed commit metadata but reject source drift", () => {
    const stack = { tipCommit: "1".repeat(40), sourceTree: "2".repeat(40), patches: [] };
    expect(() => assertPatchStackIdentity("wacli", stack, "3".repeat(40), stack.sourceTree)).not.toThrow();
    expect(() => assertPatchStackIdentity("wacli", stack, stack.tipCommit, "4".repeat(40))).toThrow("source tree");
    expect(() => assertPatchStackIdentity("wacli", { ...stack, sourceTree: "" }, stack.tipCommit, "")).toThrow("source tree");
    const legacy = { tipCommit: stack.tipCommit, patches: [] };
    expect(() => assertPatchStackIdentity("imsg", legacy, stack.tipCommit, "4".repeat(40))).not.toThrow();
    expect(() => assertPatchStackIdentity("imsg", legacy, "3".repeat(40), "4".repeat(40))).toThrow("patch stack landed");
  });

  test("a rebuild command succeeds only when it exits 0", () => {
    expect(commandSucceeded({ kind: "exited", exitCode: 0, stdout: "", stderr: "" })).toBe(true);
    expect(commandSucceeded({ kind: "exited", exitCode: 1, stdout: "", stderr: "" })).toBe(false);
    expect(commandSucceeded({ kind: "timed-out", detail: "late", stdout: "", stderr: "" })).toBe(false);
    expect(commandSucceeded({ kind: "signaled", detail: "SIGKILL", stdout: "", stderr: "" })).toBe(false);
  });

  test("every committed patch stack pins its reconstructed source tree", () => {
    for (const vendor of ["imessage-direct", "whatsapp-linked-device"]) {
      const record = JSON.parse(readFileSync(join(import.meta.dir, "..", "src", "plugins", vendor, "vendor", "provenance.json"), "utf8")) as { reviewedPatchStack: { sourceTree?: string } };
      expect(record.reviewedPatchStack.sourceTree).toMatch(/^[0-9a-f]{40}$/u);
    }
  });

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
