import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { BrowserFileResolver } from "../browser";
import { hasExactKeys } from "../contracts-shape";
import type { FileInputValue } from "../model";
import type { WebSessionOperationDeadline } from "../web-session-execution";
import { scrubXUploadImage } from "./x-image-provenance";

export const X_WEB_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const X_WEB_MAX_VIDEO_BYTES = 512 * 1024 * 1024;
export type XWebMediaType = "image/png" | "image/jpeg" | "video/mp4";
export type XWebMediaDescriptor = Readonly<{ file: FileInputValue; mediaType: XWebMediaType }>;
export type XWebBoundMedia = Readonly<{
  bytes: Uint8Array;
  mediaType: XWebMediaType;
  /** Identity of the immutable plan bytes, before metadata removal. */
  sourceSHA256: string;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

/** New array contract only. Historical single-file contracts keep their own parser. */
export function parseXWebMediaInput(inputValue: unknown): readonly XWebMediaDescriptor[] {
  const input = record(inputValue, "X media input");
  if (input.media_type !== undefined) throw new Error("X array media requires media_types, not legacy media_type");
  if (input.media === undefined) {
    if (input.media_types !== undefined) throw new Error("X media_types requires media");
    return Object.freeze([]);
  }
  if (!Array.isArray(input.media) || input.media.length < 1 || input.media.length > 4) {
    throw new Error("X media requires one to four plan-bound files");
  }
  if (!Array.isArray(input.media_types) || input.media_types.length !== input.media.length) {
    throw new Error("X media_types must align one-to-one with media");
  }
  const references = new Set<string>();
  const descriptors = Array.from(input.media, (value: unknown, index: number) => {
    const file = record(value, "X media file");
    if (!hasExactKeys(file, ["kind", "reference"]) || file.kind !== "file"
      || typeof file.reference !== "string" || file.reference.length < 1 || file.reference.length > 1_024
      || /[\u0000-\u001f\u007f]/u.test(file.reference)) throw new Error("X media must contain plan-bound files");
    if (references.has(file.reference)) throw new Error("X media file references must be unique");
    references.add(file.reference);
    const mediaType: unknown = (input.media_types as unknown[])[index];
    if (mediaType !== "image/png" && mediaType !== "image/jpeg" && mediaType !== "video/mp4") {
      throw new Error("X media supports PNG, JPEG, or MP4; WebP is not yet reviewed");
    }
    return Object.freeze({ file: Object.freeze({ kind: "file" as const, reference: file.reference }), mediaType });
  });
  if (descriptors.some(({ mediaType }) => mediaType === "video/mp4") && descriptors.length !== 1) {
    throw new Error("X media permits images together or one video, never a mixed set");
  }
  return Object.freeze(descriptors);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return Buffer.from(bytes.subarray(offset, offset + length)).toString("ascii");
}

export function scrubXWebMediaBytes(bytes: Uint8Array, mediaType: XWebMediaType): Uint8Array {
  const maximum = mediaType === "video/mp4" ? X_WEB_MAX_VIDEO_BYTES : X_WEB_MAX_IMAGE_BYTES;
  if (bytes.byteLength < 1 || bytes.byteLength > maximum) throw new Error("X media escaped its confirmed byte bound");
  if (mediaType === "video/mp4") {
    if (bytes.byteLength < 16 || ascii(bytes, 4, 4) !== "ftyp") throw new Error("X video must contain an MP4 file-type box");
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (size < 16 || size > bytes.byteLength || size % 4 !== 0) throw new Error("X video has an invalid MP4 file-type box");
    // MP4 bytes are signature-checked and uploaded unchanged; no metadata scrub is performed.
    return bytes;
  }
  if (mediaType === "image/jpeg" && (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)) {
    throw new Error("X JPEG attachment has a different file signature");
  }
  const scrubbed = scrubXUploadImage(bytes, mediaType);
  if (scrubbed.byteLength > maximum) throw new Error("X scrubbed image escaped its upload byte bound");
  return scrubbed;
}

/** The resolver alone chooses paths. No ambient path, extension, or caller MIME is trusted. */
export async function readBoundXWebMedia(
  input: unknown,
  fileResolver: BrowserFileResolver | undefined,
  operationDeadline?: WebSessionOperationDeadline,
): Promise<readonly XWebBoundMedia[]> {
  const descriptors = parseXWebMediaInput(input);
  if (descriptors.length === 0) return Object.freeze([]);
  if (fileResolver === undefined) throw new Error("X media requires the plan-bound file resolver");
  const run = <T>(action: () => Promise<T>): Promise<T> => operationDeadline === undefined
    ? action() : operationDeadline.run(action, "X media materialization deadline");
  const paths = await run(() => fileResolver(descriptors.map(({ file }) => file)));
  if (paths.length !== descriptors.length || paths.some(path => typeof path !== "string" || path.length === 0)) {
    throw new Error("X media resolver did not return exactly the confirmed files");
  }
  const output: XWebBoundMedia[] = [];
  for (const [index, descriptor] of descriptors.entries()) {
    operationDeadline?.throwIfUnavailable("X media materialization deadline");
    // Do not race opening a descriptor against timeout: a late open would lose custody.
    const handle = await open(paths[index]!, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK)
      .catch(() => { throw new Error("X plan-bound media file could not be opened"); });
    try {
      const before = await run(() => handle.stat({ bigint: true }));
      const maximum = descriptor.mediaType === "video/mp4" ? X_WEB_MAX_VIDEO_BYTES : X_WEB_MAX_IMAGE_BYTES;
      if (!before.isFile() || before.size < 1n || before.size > BigInt(maximum)) throw new Error("X media must be a bounded regular file");
      // Fixed allocation and an extra byte refuse concurrent growth without an unbounded readFile.
      const buffer = Buffer.alloc(Number(before.size) + 1);
      let read = 0;
      while (read < buffer.byteLength) {
        const current = await run(() => handle.read(buffer, read, buffer.byteLength - read, read));
        if (current.bytesRead === 0) break;
        read += current.bytesRead;
      }
      const after = await run(() => handle.stat({ bigint: true }));
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || BigInt(read) !== before.size) {
        throw new Error("X media changed while it was materialized");
      }
      const bytes = buffer.subarray(0, read);
      const sourceSHA256 = createHash("sha256").update(bytes).digest("hex");
      output.push(Object.freeze({ bytes: scrubXWebMediaBytes(bytes, descriptor.mediaType), mediaType: descriptor.mediaType,
        sourceSHA256 }));
      operationDeadline?.throwIfUnavailable("X media materialization deadline");
    } finally { await handle.close(); }
  }
  return Object.freeze(output);
}

export function assertXWebMediaReadback(
  expected: readonly Readonly<{ id: string; mediaType: XWebMediaType }>[],
  actual: readonly Readonly<{ id: string; type: string }>[],
): void {
  const ids = new Set<string>();
  if (expected.length > 4 || actual.length !== expected.length
    || (expected.some(media => media.mediaType === "video/mp4") && expected.length !== 1)) throw new Error("X created post changed its confirmed media count");
  for (const [index, media] of expected.entries()) {
    if (!/^[0-9]{1,20}$/u.test(media.id) || ids.has(media.id)) throw new Error("X confirmed media upload IDs must be unique");
    ids.add(media.id);
    const bound = actual[index]!;
    if (bound.id !== media.id || bound.type !== (media.mediaType === "video/mp4" ? "video" : "photo")) {
      throw new Error("X created post changed its confirmed media identity, order, or type");
    }
  }
}
