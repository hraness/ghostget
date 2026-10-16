import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import type { WebSessionOperationDeadline } from "../web-session-execution";
import { assertProperty } from "../test-support";
import { embedPngChunk, minimalPngBytes } from "./x-image-provenance";
import {
  assertXWebMediaReadback,
  parseXWebMediaInput,
  readBoundXWebMedia,
  scrubXWebMediaBytes,
  X_WEB_MAX_IMAGE_BYTES,
} from "./x-web-media";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root(): string { const result = mkdtempSync(join(tmpdir(), "ghostget-x-media-")); roots.push(result); return result; }
function file(reference: string) { return { kind: "file", reference }; }
function input(count: number) {
  return { media: Array.from({ length: count }, (_, index) => file(`bound-${index}`)), media_types: Array.from({ length: count }, () => "image/png") };
}
function mp4(): Uint8Array { return Uint8Array.of(0, 0, 0, 16, ...Buffer.from("ftypisom"), 0, 0, 0, 0); }

describe("X ordered plan-bound media", () => {
  test("accepts one to four ordered PNG/JPEG images, or exactly one MP4", () => {
    for (let count = 1; count <= 4; count++) {
      expect(parseXWebMediaInput(input(count)).map(value => value.file.reference)).toEqual(
        Array.from({ length: count }, (_, index) => `bound-${index}`),
      );
    }
    expect(parseXWebMediaInput({ media: [file("video")], media_types: ["video/mp4"] })[0]?.mediaType).toBe("video/mp4");
    expect(parseXWebMediaInput({ media: [file("png"), file("jpeg")], media_types: ["image/png", "image/jpeg"] })).toHaveLength(2);
    expect(parseXWebMediaInput({ body: "text" })).toEqual([]);
  });

  test("rejects ambiguous, mixed, duplicate, unsupported, and unaligned attachments", () => {
    for (const value of [null, [], { media: [] }, input(5), { media_types: [] }, { media: file("old"), media_type: "image/png" },
      { media: [file("a")], media_types: [] }, { media: [file("a")], media_types: ["image/webp"] },
      { media: [file("a"), file("b")], media_types: ["image/png", "video/mp4"] },
      { media: [file("a"), file("a")], media_types: ["image/png", "image/png"] },
      { media: [{ ...file("a"), path: "caller-owned" }], media_types: ["image/png"] },
      { media: [file("bad\u0000reference")], media_types: ["image/png"] },
    ]) expect(() => parseXWebMediaInput(value)).toThrow();
  });

  test("materializes the resolver's ordered files once, preserving source digests while scrubbing PNG metadata", async () => {
    const directory = root();
    const tainted = embedPngChunk(minimalPngBytes(), "iTXt", Buffer.from("private camera metadata"));
    const paths = [join(directory, "first"), join(directory, "second")];
    writeFileSync(paths[0]!, tainted);
    writeFileSync(paths[1]!, minimalPngBytes());
    let calls = 0;
    const result = await readBoundXWebMedia(input(2), async files => {
      calls++;
      expect(files.map(value => value.reference)).toEqual(["bound-0", "bound-1"]);
      return paths;
    });
    expect(calls).toBe(1);
    expect(result).toHaveLength(2);
    expect(result[0]?.sourceSHA256).toBe(createHash("sha256").update(tainted).digest("hex"));
    expect(result[0]?.bytes).toEqual(minimalPngBytes());
    expect(result[1]?.bytes).toEqual(minimalPngBytes());
  });

  test("requires the scoped resolver and an exact number of paths", async () => {
    await expect(readBoundXWebMedia(input(1), undefined)).rejects.toThrow("plan-bound file resolver");
    await expect(readBoundXWebMedia(input(1), async () => [])).rejects.toThrow("exactly the confirmed files");
    await expect(readBoundXWebMedia({}, undefined)).resolves.toEqual([]);
  });

  test("refuses symlinks, directories, empty and oversized source files without leaking paths", async () => {
    const directory = root();
    const target = join(directory, "target"); writeFileSync(target, minimalPngBytes());
    const link = join(directory, "link"); symlinkSync(target, link);
    await expect(readBoundXWebMedia(input(1), async () => [link])).rejects.toThrow("could not be opened");
    for (const path of [directory, join(directory, "empty"), join(directory, "large")]) {
      if (path !== directory) writeFileSync(path, "");
      if (path.endsWith("large")) truncateSync(path, X_WEB_MAX_IMAGE_BYTES + 1);
      await expect(readBoundXWebMedia(input(1), async () => [path])).rejects.toThrow("bounded regular file");
    }
  });

  test("refuses a same-length source change between descriptor observations", async () => {
    const directory = root(); const path = join(directory, "image"); writeFileSync(path, minimalPngBytes());
    let operations = 0;
    const deadline: WebSessionOperationDeadline = {
      signal: new AbortController().signal, remainingTimeMs: () => 1_000, throwIfUnavailable: () => {},
      run: async action => {
        operations++;
        // Resolver, initial stat, read, EOF, final stat. Mutate before final stat.
        if (operations === 5) writeFileSync(path, Buffer.alloc(minimalPngBytes().byteLength));
        return action(new AbortController().signal);
      },
    };
    await expect(readBoundXWebMedia(input(1), async () => [path], deadline)).rejects.toThrow("changed while it was materialized");
  });

  test("checks declared media signatures and MP4 file-type bounds", () => {
    expect(scrubXWebMediaBytes(mp4(), "video/mp4")).toEqual(mp4());
    expect(() => scrubXWebMediaBytes(minimalPngBytes(), "image/jpeg")).toThrow("different file signature");
    expect(() => scrubXWebMediaBytes(mp4(), "image/png")).toThrow();
    const bad = mp4(); bad[3] = 255;
    expect(() => scrubXWebMediaBytes(bad, "video/mp4")).toThrow("invalid MP4 file-type box");
    expect(() => scrubXWebMediaBytes(new Uint8Array(), "image/png")).toThrow("byte bound");
  });

  test("exact readback binds media IDs, order, type, count, and uniqueness", () => {
    const expected = [{ id: "11", mediaType: "image/png" as const }, { id: "22", mediaType: "image/jpeg" as const }];
    assertXWebMediaReadback(expected, [{ id: "11", type: "photo" }, { id: "22", type: "photo" }]);
    for (const actual of [[], [{ id: "11", type: "photo" }], [{ id: "22", type: "photo" }, { id: "11", type: "photo" }],
      [{ id: "11", type: "video" }, { id: "22", type: "photo" }]]) expect(() => assertXWebMediaReadback(expected, actual)).toThrow();
    expect(() => assertXWebMediaReadback([expected[0]!, expected[0]!], [{ id: "11", type: "photo" }, { id: "11", type: "photo" }])).toThrow("unique");
  });

  test("property: image order survives parsing and each changed readback identity fails", () => {
    assertProperty(fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 999_999 }), { minLength: 1, maxLength: 4 }), values => {
      const media = values.map(value => file(`bound-${value}`));
      expect(parseXWebMediaInput({ media, media_types: values.map(() => "image/png") }).map(value => value.file.reference)).toEqual(media.map(value => value.reference));
      const expected = values.map(value => ({ id: String(value), mediaType: "image/png" as const }));
      const actual = values.map(value => ({ id: String(value), type: "photo" }));
      assertXWebMediaReadback(expected, actual);
      for (const index of values.keys()) {
        const altered = actual.map((value, current) => current === index ? { ...value, id: "9999999" } : value);
        expect(() => assertXWebMediaReadback(expected, altered)).toThrow();
      }
    }), { numRuns: 80 });
  });

  test("property: arbitrary descriptor fields cannot add file authority", () => {
    assertProperty(fc.property(fc.string({ minLength: 1, maxLength: 40 }).filter(key => key !== "kind" && key !== "reference"), key => {
      expect(() => parseXWebMediaInput({ media: [{ ...file("bound"), [key]: "extra" }], media_types: ["image/png"] })).toThrow();
    }), { numRuns: 80 });
  });
});
