import { Blob } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { types as nodeTypes } from "node:util";

import { renderCookieHeader } from "@hraness/wordcell/clip/cookies";

import type { GhostgetAuth } from "../auth";
import type { BrowserFileResolver } from "../browser";
import { openCursorToken, sealCursorToken } from "../cursor-token";
import {
  canonicalJson,
  isCanonicalJsonText,
} from "../canonical-json";
import type { FileInputValue, OperationInput, WebSessionRecipe } from "../model";
import { OperationDeadline } from "../operation-deadline";
import { createPinnedHttpsFetchScope, pinnedHttpsFetch } from "../pinned-https";
import {
  createWebSessionClient,
  webSessionAuthSubject,
  type WebSessionClient,
  type WebSessionNetworkDependencies,
} from "../web-session-client";
import type {
  WebSessionDispatchEvent,
  WebSessionExecution,
  WebSessionOperationDeadline,
  WebSessionProviderAcceptedMutationTargetEvent,
} from "../web-session-execution";
import { WebSessionResponseRejectedError } from "../web-session-read-errors";
import { failedProviderRead } from "./read-failure";
import { substackMp4Metadata } from "./substack-video-mp4";
import { hasExactKeys, hasSameKeys } from "../contracts-shape.js";
import {
  SUBSTACK_WEB_OPERATION_NAMES,
  SUBSTACK_WEB_OPERATIONS,
  authorizeSubstackSubscriberRequest,
  authorizeSubstackWebReadRequest,
  normalizeSubstackSubscriberImportInstances,
  normalizeSubstackSubscriberPage,
  prepareSubstackSubscriberExportInput,
  parseSubstackSubscriberCursor,
  prepareSubstackSubscriberImportInput,
  prepareSubstackSubscriberImportStatusInput,
  selectSubstackSubscriberPublication,
  requireSubstackSubscriberExportOwner,
  substackSubscriberImportRequestBody,
  substackSubscriberStatsRequestBody,
  SUBSTACK_SUBSCRIBER_CURSOR_MAX_TOKEN_CHARACTERS,
  SUBSTACK_SUBSCRIBER_EXPORT_MAX_ROWS,
  type SubstackSubscriberCursor,
  type SubstackSubscriberExportPlan,
  type SubstackSubscriberImportPlan,
  normalizeSubstackArticleResponse,
  normalizeSubstackCommentsResponse,
  normalizeSubstackFeedResponse,
  normalizeSubstackMediaResponse,
  normalizeSubstackMessageInbox,
  normalizeSubstackNoteResponse,
  normalizeSubstackPublicationStatsResponse,
  normalizeSubstackProfileStatsResponse,
  parseSubstackLoggedInResponse,
  parseSubstackPreloadsHtml,
  SubstackAuthRepairRequiredError,
  type SubstackFeedName,
  type SubstackWebOperationName,
  type SubstackWebViewer,
} from "./substack-web";

const SUBSTACK_ORIGIN = "https://substack.com";
const MAX_BOOTSTRAP_BYTES = 8 * 1024 * 1024;
const MAX_LOGIN_BYTES = 256 * 1024;
const MAX_READ_BYTES = 8 * 1024 * 1024;
const MAX_SUBSTACK_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_SUBSTACK_VIDEO_BYTES = 128 * 1024 * 1024;
const SUBSTACK_VIDEO_BINDING_KEYS = Object.freeze([
  "byteLength",
  "bytes",
  "durationSeconds",
  "height",
  "mediaType",
  "sha256",
  "width",
] as const);
export const SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES = 50 * 1024 * 1024;
const MAX_SUBSTACK_VIDEO_PARTS = Math.ceil(
  MAX_SUBSTACK_VIDEO_BYTES / SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES,
);
const MAX_SUBSTACK_RECOVERY_IDENTIFIER_BYTES = 4_096;
const DEFAULT_LIMIT = 20;
const SUBSTACK_NOTE_READBACK_DELAYS_MS = Object.freeze([500, 1_500, 4_000]);
const SUBSTACK_DELETE_REQUEST_LABEL = "Substack personal Note deletion request";
const MIN_PINNED_HTTPS_TIMEOUT_MS = 1_000;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(
  Uint8Array.prototype,
) as object;
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "buffer",
)?.get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
)?.get;

type SubstackWebSleep = (
  milliseconds: number,
  signal?: AbortSignal,
) => Promise<void>;

/** One byte-range PUT to a provider-issued Substack video multipart URL. */
export type SubstackVideoUploadFetch = (request: {
  readonly url: URL;
  readonly body: Uint8Array;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
}) => Promise<Readonly<{ status: number; etag: string | null }>>;

export type SubstackWebRuntimeDependencies = Partial<WebSessionNetworkDependencies> & {
  readonly now?: () => number;
  readonly sleep?: SubstackWebSleep;
  /** Injected per-invocation nonce for a frozen subscriber-import identity. */
  readonly operationNonce?: () => string;
  /** Private cursor state; tests supply a separate state home. */
  readonly cursorEnvironment?: Readonly<Record<string, string | undefined>>;
  /** Exact-origin multipart byte transport; tests inject a stub. */
  readonly videoUploadFetch?: SubstackVideoUploadFetch;
};

function sleepForSubstackReadback(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new Error("Substack Note readback wait was cancelled"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new Error("Substack Note readback wait was cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function isSubstackOperation(value: string): value is SubstackWebOperationName {
  return (SUBSTACK_WEB_OPERATION_NAMES as readonly string[]).includes(value);
}

function integerInput(
  input: OperationInput,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`input.${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function positiveIdInput(input: OperationInput, name: string): number {
  return integerInput(input, name, Number.NaN, 1, Number.MAX_SAFE_INTEGER);
}

function optionalStringInput(
  input: OperationInput,
  name: string,
  maximum: number,
): string | undefined {
  const value = input[name];
  if (value === undefined) return undefined;
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || /[\0\r\n]/u.test(value)
  ) throw new Error(`input.${name} must be bounded text`);
  return value;
}

function substackProfileInput(input: OperationInput): string {
  const value = input.profile;
  if (
    typeof value !== "string"
    || !/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/u.test(value)
  ) throw new Error("input.profile must be one canonical lowercase Substack handle");
  return value;
}

function substackOrganizationInput(input: OperationInput): string {
  const value = input.organization;
  if (
    typeof value !== "string"
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value)
  ) throw new Error("input.organization must be one canonical lowercase Substack subdomain");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  if (!hasExactKeys(value, expected)) {
    throw new Error(`${label} keys did not match the reviewed contract`);
  }
}

function requireAllowedKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
): void {
  const permitted = new Set(allowed);
  if (Object.keys(value).some((key) => !permitted.has(key))) {
    throw new Error(`${label} contained fields outside the reviewed contract`);
  }
}

function requireExactInputKeys(input: OperationInput, allowed: readonly string[]): void {
  const permitted = new Set(allowed);
  const unexpected = Object.keys(input).filter((key) => !permitted.has(key));
  if (unexpected.length > 0) {
    throw new Error(`input contains unsupported keys: ${unexpected.join(", ")}`);
  }
}

function fileInput(value: OperationInput[string] | undefined): FileInputValue {
  if (
    !isRecord(value)
    || value.kind !== "file"
    || typeof value.reference !== "string"
    || value.reference.length < 1
    || value.reference.length > 4_096
    || /[\0\r\n]/u.test(value.reference)
    || !hasExactKeys(value, ["kind", "reference"])
  ) throw new Error("input.media must be one plan-bound file");
  return Object.freeze({ kind: "file", reference: value.reference });
}

function substackNoteText(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 500
    || /[\0\r]/u.test(value)
  ) throw new Error(`${label} must be bounded Substack Note text`);
  return value;
}

export type SubstackVideoNotePublishPlan = Readonly<{
  readonly body: string;
  readonly media: FileInputValue;
}>;

/** Validate the complete capture-neutral Note-video plan without resolving it. */
export function prepareSubstackVideoNotePublishInput(
  input: OperationInput,
): SubstackVideoNotePublishPlan {
  requireExactInputKeys(input, ["body", "media"]);
  return Object.freeze({
    body: substackNoteText(input.body, "input.body"),
    media: fileInput(input.media),
  });
}

export type SubstackPersonalNoteDeletePlan = Readonly<{
  readonly expectedBody: string;
  readonly noteId: number;
}>;

/** Validate the exact authored-personal-Note deletion confirmation. */
export function prepareSubstackPersonalNoteDeleteInput(
  input: OperationInput,
): SubstackPersonalNoteDeletePlan {
  requireExactInputKeys(input, ["expected_body", "note_id"]);
  return Object.freeze({
    expectedBody: substackNoteText(input.expected_body, "input.expected_body"),
    noteId: positiveIdInput(input, "note_id"),
  });
}

type SubstackImage = {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mediaType: "image/png";
  readonly width: number;
};

export type SubstackVideo = Readonly<{
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly byteLength: number;
  readonly durationSeconds: number;
  readonly height: number;
  readonly mediaType: "video/mp4";
  readonly sha256: string;
  readonly width: number;
}>;

function substackVideoSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactSubstackVideoBinding(
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object"
    || value === null
  ) throw new Error("Substack video binding must be one exact object");
  if (nodeTypes.isProxy(value)) {
    throw new Error("Substack video binding must not be a proxy");
  }
  if (Array.isArray(value)) {
    throw new Error("Substack video binding must be one exact object");
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Substack video binding must use a plain prototype");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.some((key) => typeof key !== "string")
    || !hasSameKeys(ownKeys as string[], SUBSTACK_VIDEO_BINDING_KEYS)
  ) throw new Error("Substack video binding contained unsupported fields");
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const key of SUBSTACK_VIDEO_BINDING_KEYS) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      throw new Error(
        "Substack video binding must contain only enumerable data properties",
      );
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function snapshotSubstackVideoBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== "object"
    || value === null
    || nodeTypes.isProxy(value)
    || !(value instanceof Uint8Array)
    || Object.getPrototypeOf(value) !== Uint8Array.prototype
    || TYPED_ARRAY_BUFFER_GETTER === undefined
    || TYPED_ARRAY_BYTE_LENGTH_GETTER === undefined
  ) throw new Error("Substack video binding must contain one bounded MP4");
  let buffer: unknown;
  let byteLength: unknown;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER.call(value) as unknown;
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER.call(value) as unknown;
  } catch {
    throw new Error("Substack video binding must contain one bounded MP4");
  }
  if (
    typeof byteLength !== "number"
    || !Number.isSafeInteger(byteLength)
    || byteLength < 24
    || byteLength > MAX_SUBSTACK_VIDEO_BYTES
    || nodeTypes.isSharedArrayBuffer(buffer)
  ) throw new Error("Substack video binding must contain one bounded MP4");
  const bytes = new Uint8Array(byteLength);
  try {
    Uint8Array.prototype.set.call(bytes, value);
  } catch {
    throw new Error("Substack video binding must contain one bounded MP4");
  }
  return bytes;
}

/** Reparse one local video binding so mutable or caller-forged metadata fails. */
export function parseSubstackVideoBinding(value: unknown): SubstackVideo {
  const binding = exactSubstackVideoBinding(value);
  const bytes = snapshotSubstackVideoBytes(binding.bytes);
  if (binding.mediaType !== "video/mp4") {
    throw new Error("Substack video binding must contain one bounded MP4");
  }
  const metadata = substackMp4Metadata(bytes, "Substack video");
  const sha256 = substackVideoSha256(bytes);
  if (
    !Number.isSafeInteger(binding.byteLength)
    || binding.byteLength !== bytes.byteLength
    || typeof binding.sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(binding.sha256)
    || binding.sha256 !== sha256
  ) throw new Error("Substack video binding byte integrity changed from its exact bytes");
  if (
    binding.durationSeconds !== metadata.durationSeconds
    || binding.height !== metadata.height
    || binding.width !== metadata.width
  ) throw new Error("Substack video binding metadata changed from its exact bytes");
  return Object.freeze({
    bytes,
    byteLength: bytes.byteLength,
    durationSeconds: metadata.durationSeconds,
    height: metadata.height,
    mediaType: "video/mp4" as const,
    sha256,
    width: metadata.width,
  });
}

/**
 * Materialize one plan-bound MP4 without following a final symlink and bind
 * duration plus dimensions to the exact stable bytes. This is shared protocol
 * groundwork only; media.publish remains network-inert until its response and
 * Note attachment contracts are captured.
 */
export async function materializeSubstackVideo(
  media: FileInputValue,
  fileResolver: BrowserFileResolver | undefined,
  operationDeadline: WebSessionOperationDeadline | undefined,
): Promise<SubstackVideo> {
  if (fileResolver === undefined) {
    throw new Error("Substack video upload requires the plan-bound file resolver");
  }
  const paths = operationDeadline === undefined
    ? await fileResolver([media])
    : await operationDeadline.run(
        () => fileResolver([media]),
        "authenticated web operation deadline",
      );
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("Substack file resolver did not return one exact path");
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined
    ? await open(paths[0], constants.O_RDONLY | noFollow)
    : await operationDeadline.run(
        () => open(paths[0]!, constants.O_RDONLY | noFollow),
        "authenticated web operation deadline",
      );
  try {
    const before = operationDeadline === undefined
      ? await handle.stat()
      : await operationDeadline.run(
          () => handle.stat(),
          "authenticated web operation deadline",
        );
    if (!before.isFile() || before.size < 24 || before.size > MAX_SUBSTACK_VIDEO_BYTES) {
      throw new Error(
        "Substack video must be a regular MP4 no larger than the 128 MiB in-memory publish limit",
      );
    }
    const bytes = operationDeadline === undefined
      ? await handle.readFile()
      : await operationDeadline.run(
          () => handle.readFile(),
          "authenticated web operation deadline",
        );
    const after = operationDeadline === undefined
      ? await handle.stat()
      : await operationDeadline.run(
          () => handle.stat(),
          "authenticated web operation deadline",
        );
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== before.size
    ) throw new Error("Substack video changed while it was materialized");
    const snapshot = new Uint8Array(bytes);
    const metadata = substackMp4Metadata(snapshot, "Substack video");
    return Object.freeze({
      bytes: snapshot,
      byteLength: snapshot.byteLength,
      durationSeconds: metadata.durationSeconds,
      height: metadata.height,
      mediaType: "video/mp4" as const,
      sha256: substackVideoSha256(snapshot),
      width: metadata.width,
    });
  } finally {
    await handle.close();
  }
}

export type SubstackVideoMultipartPart = Readonly<{
  readonly byteLength: number;
  readonly endExclusive: number;
  readonly partNumber: number;
  readonly start: number;
}>;

/** Exact byte coverage used by the current first-party 50 MiB uploader. */
export function planSubstackVideoMultipartParts(
  byteLength: number,
  uploadUrlCount: number,
): readonly SubstackVideoMultipartPart[] {
  if (
    !Number.isSafeInteger(byteLength)
    || byteLength < 24
    || byteLength > MAX_SUBSTACK_VIDEO_BYTES
  ) throw new Error("Substack video byte length is outside the reviewed bound");
  const expectedCount = Math.ceil(byteLength / SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES);
  if (
    !Number.isSafeInteger(uploadUrlCount)
    || uploadUrlCount !== expectedCount
    || uploadUrlCount < 1
    || uploadUrlCount > MAX_SUBSTACK_VIDEO_PARTS
  ) throw new Error("Substack multipart URL count does not exactly cover the video");
  return Object.freeze(Array.from({ length: uploadUrlCount }, (_, index) => {
    const start = index * SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES;
    const endExclusive = Math.min(
      byteLength,
      start + SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES,
    );
    return Object.freeze({
      byteLength: endExclusive - start,
      endExclusive,
      partNumber: index + 1,
      start,
    });
  }));
}

export type SubstackVideoMultipartTransferBody = Readonly<{
  readonly body: Blob;
  readonly byteLength: number;
  readonly credentials: "omit";
  readonly endExclusive: number;
  readonly formData: false;
  readonly method: "PUT";
  readonly partNumber: number;
  readonly start: number;
}>;

export type SubstackVideoMultipartDispatchCheckpoint = Readonly<{
  readonly byteLength: number;
  readonly durationSeconds: number;
  readonly height: number;
  readonly mediaType: "video/mp4";
  readonly partCount: number;
  readonly schemaVersion: 1;
  readonly sha256: string;
  readonly width: number;
}>;

export type SubstackVideoMultipartDispatchSnapshot = Readonly<{
  readonly checkpoint: SubstackVideoMultipartDispatchCheckpoint;
  readonly parts: readonly SubstackVideoMultipartTransferBody[];
}>;

function parseSubstackVideoMultipartDispatchCheckpoint(
  value: unknown,
): SubstackVideoMultipartDispatchCheckpoint {
  if (!isRecord(value)) {
    throw new Error("Substack multipart dispatch checkpoint must be an object");
  }
  requireExactKeys(
    value,
    [
      "byteLength",
      "durationSeconds",
      "height",
      "mediaType",
      "partCount",
      "schemaVersion",
      "sha256",
      "width",
    ],
    "Substack multipart dispatch checkpoint",
  );
  if (
    value.schemaVersion !== 1
    || value.mediaType !== "video/mp4"
    || !Number.isSafeInteger(value.byteLength)
    || !Number.isSafeInteger(value.partCount)
    || typeof value.durationSeconds !== "number"
    || !Number.isFinite(value.durationSeconds)
    || value.durationSeconds <= 0
    || !Number.isSafeInteger(value.height)
    || (value.height as number) < 1
    || (value.height as number) > 20_000
    || !Number.isSafeInteger(value.width)
    || (value.width as number) < 1
    || (value.width as number) > 20_000
    || typeof value.sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.sha256)
  ) throw new Error("Substack multipart dispatch checkpoint changed shape");
  planSubstackVideoMultipartParts(
    value.byteLength as number,
    value.partCount as number,
  );
  return Object.freeze({
    byteLength: value.byteLength as number,
    durationSeconds: value.durationSeconds,
    height: value.height as number,
    mediaType: "video/mp4" as const,
    partCount: value.partCount as number,
    schemaVersion: 1 as const,
    sha256: value.sha256,
    width: value.width as number,
  });
}

/**
 * Pin the exact local byte version and canonical part count before any future
 * multipart dispatch. This checkpoint contains no target or retry authority.
 */
export function createSubstackVideoMultipartDispatchCheckpoint(
  videoValue: unknown,
  uploadUrlCount: number,
): SubstackVideoMultipartDispatchCheckpoint {
  const video = parseSubstackVideoBinding(videoValue);
  const parts = planSubstackVideoMultipartParts(video.byteLength, uploadUrlCount);
  return Object.freeze({
    byteLength: video.byteLength,
    durationSeconds: video.durationSeconds,
    height: video.height,
    mediaType: video.mediaType,
    partCount: parts.length,
    schemaVersion: 1 as const,
    sha256: video.sha256,
    width: video.width,
  });
}

/**
 * Reparse and digest the entire current binding once immediately before a
 * future dispatch, require its original checkpoint, then snapshot every part
 * as an immutable Blob from that one byte version. Provider-issued URLs,
 * accepted PUT statuses, response ETags, and dispatch hooks remain absent
 * until an authorized capture proves those contracts.
 */
export function revalidateAndSnapshotSubstackVideoMultipartDispatch(
  videoValue: unknown,
  checkpointValue: unknown,
): SubstackVideoMultipartDispatchSnapshot {
  const video = parseSubstackVideoBinding(videoValue);
  const checkpoint = parseSubstackVideoMultipartDispatchCheckpoint(checkpointValue);
  if (
    video.byteLength !== checkpoint.byteLength
    || video.durationSeconds !== checkpoint.durationSeconds
    || video.height !== checkpoint.height
    || video.mediaType !== checkpoint.mediaType
    || video.sha256 !== checkpoint.sha256
    || video.width !== checkpoint.width
  ) throw new Error("Substack video changed after its multipart dispatch checkpoint");
  const plannedParts = planSubstackVideoMultipartParts(
    checkpoint.byteLength,
    checkpoint.partCount,
  );
  const immutableVideo = new Blob([
    // Parsing rejected shared storage and copied the bytes into a fresh buffer.
    video.bytes as Uint8Array<ArrayBuffer>,
  ], { type: video.mediaType });
  if (
    immutableVideo.size !== checkpoint.byteLength
    || immutableVideo.type !== checkpoint.mediaType
  ) throw new Error("Substack video multipart snapshot changed shape");
  return Object.freeze({
    checkpoint,
    parts: Object.freeze(plannedParts.map((part) => Object.freeze({
      body: immutableVideo.slice(part.start, part.endExclusive, video.mediaType),
      byteLength: part.byteLength,
      credentials: "omit" as const,
      endExclusive: part.endExclusive,
      formData: false as const,
      method: "PUT" as const,
      partNumber: part.partNumber,
      start: part.start,
    }))),
  });
}

function substackResponseBoundIdentifier(value: unknown, label: string): string {
  const candidate = typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : value;
  if (
    typeof candidate !== "string"
    || !/^[A-Za-z0-9_-]{1,256}$/u.test(candidate)
  ) throw new Error(`${label} must be one response-bound identifier`);
  return candidate;
}

/** Parse ordered strong ETag-shaped values for a future captured PUT contract. */
export function parseSubstackVideoMultipartEtags(
  value: unknown,
  expectedCount: number,
): readonly string[] {
  if (
    !Number.isSafeInteger(expectedCount)
    || expectedCount < 1
    || expectedCount > MAX_SUBSTACK_VIDEO_PARTS
  ) throw new Error("Substack multipart ETags did not bind every ordered part");
  if (typeof value !== "object" || value === null || nodeTypes.isProxy(value)) {
    throw new Error("Substack multipart ETags must be one exact data-only array");
  }
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
  ) throw new Error("Substack multipart ETags must be one exact data-only array");
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Readonly<
    Record<PropertyKey, PropertyDescriptor | undefined>
  >;
  const ownKeys = Reflect.ownKeys(descriptors);
  const lengthDescriptor = descriptors.length;
  if (
    lengthDescriptor === undefined
    || !("value" in lengthDescriptor)
    || lengthDescriptor.value !== expectedCount
  ) throw new Error("Substack multipart ETags did not bind every ordered part");
  if (
    ownKeys.length !== expectedCount + 1
    || ownKeys.some((key) => typeof key !== "string")
  ) throw new Error("Substack multipart ETags must be one exact data-only array");
  const snapshot: string[] = [];
  for (let index = 0; index < expectedCount; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !("value" in descriptor)
    ) {
      throw new Error("Substack multipart ETags must be one exact data-only array");
    }
    const entry = descriptor.value;
    if (
      typeof entry !== "string"
      || !/^"[\x21\x23-\x7e]{1,256}"$/u.test(entry)
    ) throw new Error("Substack multipart ETag changed from a bounded strong entity-tag");
    snapshot.push(entry);
  }
  return Object.freeze(snapshot);
}

export type SubstackVideoUploadState =
  | "cancelled"
  | "created"
  | "error"
  | "transcoded"
  | "uploaded";

export function parseSubstackVideoUploadState(value: unknown): SubstackVideoUploadState {
  if (
    value !== "cancelled"
    && value !== "created"
    && value !== "error"
    && value !== "transcoded"
    && value !== "uploaded"
  ) throw new Error("Substack video upload returned an unreviewed state");
  return value;
}

export type SubstackVideoUploadSettlement = Readonly<{
  readonly state: SubstackVideoUploadState;
  readonly status: "complete" | "pending" | "terminal-failure";
}>;

/** Classify only the lifecycle states named by the current first-party bundle. */
export function classifySubstackVideoUploadState(
  value: unknown,
): SubstackVideoUploadSettlement {
  const state = parseSubstackVideoUploadState(value);
  return Object.freeze({
    state,
    status: state === "transcoded"
      ? "complete" as const
      : state === "created" || state === "uploaded"
        ? "pending" as const
        : "terminal-failure" as const,
  });
}

/** Bundle-derived initialization request-shape candidate; contextual IDs are omitted. */
export function substackVideoUploadInitializationRequest(
  byteLength: number,
): Readonly<{ method: "POST"; url: string }> {
  planSubstackVideoMultipartParts(
    byteLength,
    Math.ceil(byteLength / SUBSTACK_VIDEO_MULTIPART_CHUNK_BYTES),
  );
  const url = new URL("/api/v1/video/upload", SUBSTACK_ORIGIN);
  url.searchParams.set("filetype", "video/mp4");
  url.searchParams.set("fileSize", String(byteLength));
  url.searchParams.set("fileName", "wrench-video.mp4");
  return Object.freeze({ method: "POST" as const, url: url.href });
}

/** Build initialization only after reparsing the exact local MP4 binding. */
export function substackVideoUploadInitializationRequestForBinding(
  videoValue: unknown,
): Readonly<{ method: "POST"; url: string }> {
  const video = parseSubstackVideoBinding(videoValue);
  return substackVideoUploadInitializationRequest(video.bytes.byteLength);
}

/** Bundle-derived transcode request-shape candidate over response-bound identifiers. */
export function substackVideoTranscodeRequest(
  mediaUploadId: unknown,
  multipartUploadId: unknown,
  durationSeconds: number,
  videoByteLength: number,
  uploadUrlCount: number,
  etags: unknown,
): Readonly<{
  body: Readonly<{
    duration: number;
    multipart_upload_etags: readonly string[];
    multipart_upload_id: string;
  }>;
  method: "POST";
  url: string;
}> {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Substack video duration must be finite and positive");
  }
  const uploadId = substackResponseBoundIdentifier(
    mediaUploadId,
    "Substack media upload ID",
  );
  const multipartId = substackMultipartUploadIdentifier(
    multipartUploadId,
    "Substack multipart upload ID",
  );
  const parts = planSubstackVideoMultipartParts(videoByteLength, uploadUrlCount);
  const parsedEtags = parseSubstackVideoMultipartEtags(etags, parts.length);
  return Object.freeze({
    body: Object.freeze({
      duration: durationSeconds,
      multipart_upload_id: multipartId,
      multipart_upload_etags: parsedEtags,
    }),
    method: "POST" as const,
    url: new URL(
      `/api/v1/video/upload/${encodeURIComponent(uploadId)}/transcode`,
      SUBSTACK_ORIGIN,
    ).href,
  });
}

/** Bind transcode duration and byte coverage to the same reparsed local MP4. */
export function substackVideoTranscodeRequestForBinding(
  mediaUploadId: unknown,
  multipartUploadId: unknown,
  videoValue: unknown,
  uploadUrlCount: number,
  etags: unknown,
): ReturnType<typeof substackVideoTranscodeRequest> {
  const video = parseSubstackVideoBinding(videoValue);
  return substackVideoTranscodeRequest(
    mediaUploadId,
    multipartUploadId,
    video.durationSeconds,
    video.bytes.byteLength,
    uploadUrlCount,
    etags,
  );
}

export function substackVideoStatusRequest(
  mediaUploadId: unknown,
): Readonly<{ method: "GET"; url: string }> {
  const uploadId = substackResponseBoundIdentifier(
    mediaUploadId,
    "Substack media upload ID",
  );
  return Object.freeze({
    method: "GET" as const,
    url: new URL(
      `/api/v1/video/upload/${encodeURIComponent(uploadId)}`,
      SUBSTACK_ORIGIN,
    ).href,
  });
}

export type SubstackVideoUploadRecoveryTarget = Readonly<{
  readonly mediaUploadId: string;
  readonly schemaVersion: 1;
}>;

/** Serialize only the response-bound upload identity needed for a status GET. */
export function substackVideoUploadRecoveryTargetIdentifier(
  mediaUploadId: unknown,
): string {
  return canonicalJson({
    mediaUploadId: substackResponseBoundIdentifier(
      mediaUploadId,
      "Substack video recovery media upload ID",
    ),
    schemaVersion: 1,
  });
}

/** Parse a private canonical upload checkpoint without authorizing any retry. */
export function parseSubstackVideoUploadRecoveryTargetIdentifier(
  identifier: unknown,
): SubstackVideoUploadRecoveryTarget {
  if (
    typeof identifier !== "string"
    || identifier.length < 1
    || identifier.length > MAX_SUBSTACK_RECOVERY_IDENTIFIER_BYTES
    || /[\0\r\n]/u.test(identifier)
  ) throw new Error("Substack video recovery target must be bounded canonical JSON");
  let value: unknown;
  try {
    value = JSON.parse(identifier) as unknown;
  } catch {
    throw new Error("Substack video recovery target must be bounded canonical JSON");
  }
  if (!isRecord(value)) {
    throw new Error("Substack video recovery target changed shape");
  }
  requireExactKeys(
    value,
    ["mediaUploadId", "schemaVersion"],
    "Substack video recovery target",
  );
  if (value.schemaVersion !== 1) {
    throw new Error("Substack video recovery target changed schema version");
  }
  const target = Object.freeze({
    mediaUploadId: substackResponseBoundIdentifier(
      value.mediaUploadId,
      "Substack video recovery media upload ID",
    ),
    schemaVersion: 1 as const,
  });
  if (!isCanonicalJsonText(identifier, target)) {
    throw new Error("Substack video recovery target must use canonical JSON");
  }
  return target;
}

/** Build the bundle-derived read-only status candidate from a private checkpoint. */
export function substackVideoUploadRecoveryStatusRequest(
  identifier: unknown,
): Readonly<{ method: "GET"; url: string }> {
  const target = parseSubstackVideoUploadRecoveryTargetIdentifier(identifier);
  return substackVideoStatusRequest(target.mediaUploadId);
}

async function materializeSubstackImage(
  media: FileInputValue,
  fileResolver: BrowserFileResolver | undefined,
  operationDeadline: WebSessionOperationDeadline | undefined,
): Promise<SubstackImage> {
  if (fileResolver === undefined) {
    throw new Error("Substack image upload requires the plan-bound file resolver");
  }
  const paths = operationDeadline === undefined
    ? await fileResolver([media])
    : await operationDeadline.run(
        () => fileResolver([media]),
        "authenticated web operation deadline",
      );
  operationDeadline?.throwIfUnavailable("authenticated web operation deadline");
  if (paths.length !== 1 || typeof paths[0] !== "string") {
    throw new Error("Substack file resolver did not return one exact path");
  }
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = operationDeadline === undefined
    ? await open(paths[0], constants.O_RDONLY | noFollow)
    : await operationDeadline.run(
        () => open(paths[0]!, constants.O_RDONLY | noFollow),
        "authenticated web operation deadline",
      );
  try {
    const before = operationDeadline === undefined
      ? await handle.stat()
      : await operationDeadline.run(
          () => handle.stat(),
          "authenticated web operation deadline",
        );
    if (!before.isFile() || before.size < 24 || before.size > MAX_SUBSTACK_IMAGE_BYTES) {
      throw new Error("Substack image must be a regular PNG no larger than 20 MiB");
    }
    const bytes = operationDeadline === undefined
      ? await handle.readFile()
      : await operationDeadline.run(
          () => handle.readFile(),
          "authenticated web operation deadline",
        );
    const after = operationDeadline === undefined
      ? await handle.stat()
      : await operationDeadline.run(
          () => handle.stat(),
          "authenticated web operation deadline",
        );
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== before.size
    ) throw new Error("Substack image changed while it was materialized");
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (
      signature.some((value, index) => bytes[index] !== value)
      || bytes.subarray(12, 16).toString("ascii") !== "IHDR"
    ) throw new Error("Substack image must be a PNG fixture");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 20_000 || height > 20_000) {
      throw new Error("Substack PNG dimensions are outside the reviewed bound");
    }
    return Object.freeze({
      bytes: new Uint8Array(bytes),
      height,
      mediaType: "image/png",
      width,
    });
  } finally {
    await handle.close();
  }
}

function jsonHeaders(): Readonly<Record<string, string>> {
  return Object.freeze({
    accept: "application/json",
    referer: `${SUBSTACK_ORIGIN}/`,
  });
}

function jsonPostHeaders(): Readonly<Record<string, string>> {
  return Object.freeze({
    accept: "application/json",
    "content-type": "application/json",
    referer: `${SUBSTACK_ORIGIN}/`,
  });
}

function htmlHeaders(): Readonly<Record<string, string>> {
  return Object.freeze({
    accept: "text/html",
    referer: `${SUBSTACK_ORIGIN}/`,
  });
}

async function currentViewer(
  client: WebSessionClient,
  maximumBytes = MAX_BOOTSTRAP_BYTES,
): Promise<SubstackWebViewer> {
  const loggedInUrl = new URL("/api/v1/am_i_logged_in", SUBSTACK_ORIGIN);
  authorizeSubstackWebReadRequest({
    operation: "viewer.logged-in",
    url: loggedInUrl,
    method: "GET",
  });
  parseSubstackLoggedInResponse(await client.requestJson({
    url: loggedInUrl,
    method: "GET",
    headers: jsonHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: Math.min(maximumBytes, MAX_LOGIN_BYTES),
  }));

  const rootUrl = new URL("/", SUBSTACK_ORIGIN);
  authorizeSubstackWebReadRequest({
    operation: "viewer.root",
    url: rootUrl,
    method: "GET",
  });
  const html = await client.requestText({
    url: rootUrl,
    headers: htmlHeaders(),
    expectedContentTypes: ["text/html"],
    maxBytes: Math.min(maximumBytes, MAX_BOOTSTRAP_BYTES),
  });
  return parseSubstackPreloadsHtml(html);
}

function viewerSubject(viewer: SubstackWebViewer): string {
  return `substack:${viewer.id}`;
}

export async function probeSubstackWebSubject(
  auth: GhostgetAuth,
  options: {
    readonly timeoutMs?: number;
    readonly dependencies?: SubstackWebRuntimeDependencies;
    readonly signal?: AbortSignal;
  } = {},
): Promise<string> {
  const client = await createWebSessionClient(SUBSTACK_ORIGIN, auth, {
    timeoutMs: options.timeoutMs ?? 60_000,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  return viewerSubject(await currentViewer(client));
}

async function requireBoundViewer(
  client: WebSessionClient,
  auth: GhostgetAuth,
  maximumBytes: number,
): Promise<SubstackWebViewer> {
  const expected = webSessionAuthSubject(auth);
  if (expected === null || !/^substack:[0-9]{1,32}$/u.test(expected)) {
    throw new Error(
      "Substack authenticated operations require an auth locator bound to an exact substack:<user-id> subject",
    );
  }
  const viewer = await currentViewer(client, maximumBytes);
  if (viewerSubject(viewer) !== expected) {
    throw new Error("Substack browser session viewer no longer matches the confirmed auth subject");
  }
  return viewer;
}

function boundedMaximum(recipe: WebSessionRecipe): number {
  return Math.min(recipe.maxOutputBytes, MAX_READ_BYTES);
}

function feedName(input: OperationInput): SubstackFeedName {
  const value = input.feed;
  if (value !== "notes" && value !== "inbox" && value !== "reader-posts") {
    throw new Error("input.feed must name notes, inbox, or reader-posts");
  }
  return value;
}

async function readFeed(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  input: OperationInput,
): Promise<unknown> {
  const feed = feedName(input);
  const limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  const request = {
    notes: {
      operation: "feeds.reader" as const,
      path: "/api/v1/reader/feed",
    },
    inbox: {
      operation: "feeds.inbox" as const,
      path: "/api/v1/inbox/top",
    },
    "reader-posts": {
      operation: "feeds.posts" as const,
      path: "/api/v1/reader/posts",
    },
  }[feed];
  const url = new URL(request.path, SUBSTACK_ORIGIN);
  authorizeSubstackWebReadRequest({
    operation: request.operation,
    url,
    method: "GET",
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe),
  });
  return normalizeSubstackFeedResponse(response, feed, limit);
}

async function readProfile(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  viewer: SubstackWebViewer,
  input: OperationInput,
  now: () => number,
): Promise<unknown> {
  requireExactInputKeys(input, ["profile"]);
  const profile = substackProfileInput(input);
  if (viewer.handle !== profile) {
    throw new Error("Substack requested profile does not match the signed-in viewer");
  }
  const url = new URL(`/api/v1/user/${profile}/public_profile`, SUBSTACK_ORIGIN);
  authorizeSubstackWebReadRequest({
    operation: "profiles.read",
    url,
    method: "GET",
    profile,
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: boundedMaximum(recipe),
  });
  return normalizeSubstackProfileStatsResponse(
    response,
    viewer.id,
    profile,
    new Date(now()).toISOString(),
  );
}

async function readOrganization(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  viewer: SubstackWebViewer,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  },
): Promise<unknown> {
  requireExactInputKeys(input, ["organization"]);
  const organization = substackOrganizationInput(input);
  const origin = `https://${organization}.substack.com`;
  const owned = viewer.publications.filter((publication) =>
    publication.origin === origin);
  if (owned.length !== 1) {
    throw new Error("Substack requested organization is not one exact signed-in viewer-owned publication");
  }
  const publication = owned[0]!;
  const client = await createWebSessionClient(origin, auth, {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  const url = new URL("/api/v1/publish-dashboard/summary", origin);
  authorizeSubstackWebReadRequest({
    operation: "organizations.read",
    url,
    method: "GET",
    organization,
    publicationOrigin: publication.origin,
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: Object.freeze({
      accept: "application/json",
      referer: `${origin}/publish/home`,
    }),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: boundedMaximum(recipe),
  });
  return normalizeSubstackPublicationStatsResponse(
    response,
    {
      id: publication.id,
      organization,
      origin: publication.origin,
    },
    new Date((options.dependencies?.now ?? Date.now)()).toISOString(),
  );
}

async function readNote(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  input: OperationInput,
): Promise<unknown> {
  const noteId = positiveIdInput(input, "note_id");
  const url = new URL(`/api/v1/reader/comment/${noteId}`, SUBSTACK_ORIGIN);
  authorizeSubstackWebReadRequest({
    operation: "posts.note",
    url,
    method: "GET",
    targetId: noteId,
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe),
  });
  return normalizeSubstackNoteResponse(response, noteId);
}

async function articleResponse(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  articleId: number,
  operation: "articles.read" | "media.read",
): Promise<unknown> {
  const url = new URL(`/api/v1/posts/by-id/${articleId}`, SUBSTACK_ORIGIN);
  authorizeSubstackWebReadRequest({
    operation,
    url,
    method: "GET",
    targetId: articleId,
  });
  return client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe),
  });
}

async function readArticle(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  input: OperationInput,
  media: boolean,
): Promise<unknown> {
  const articleId = positiveIdInput(input, "article_id");
  const response = await articleResponse(
    client,
    recipe,
    articleId,
    media ? "media.read" : "articles.read",
  );
  return media
    ? normalizeSubstackMediaResponse(response, articleId)
    : normalizeSubstackArticleResponse(response, articleId);
}

async function readComments(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  input: OperationInput,
): Promise<unknown> {
  const articleId = positiveIdInput(input, "article_id");
  const publicationId = positiveIdInput(input, "publication_id");
  const limit = integerInput(input, "limit", 50, 1, 100);

  // Bind the caller-supplied publication before requesting its reply tree.
  const article = normalizeSubstackArticleResponse(
    await articleResponse(client, recipe, articleId, "articles.read"),
    articleId,
  ) as {
    readonly post: { readonly publicationId: number };
  };
  if (article.post.publicationId !== publicationId) {
    throw new Error("input.publication_id did not match the requested Substack article");
  }

  const url = new URL(`/api/v1/reader/post/${articleId}/replies`, SUBSTACK_ORIGIN);
  url.searchParams.set("publication_id", String(publicationId));
  const cursor = optionalStringInput(input, "cursor", 4_096);
  if (cursor !== undefined) url.searchParams.set("cursor", cursor);
  authorizeSubstackWebReadRequest({
    operation: "comments.read",
    url,
    method: "GET",
    targetId: articleId,
    publicationId,
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe),
  });
  return normalizeSubstackCommentsResponse(response, articleId, limit);
}

type MessageFolder = "all" | "people" | "unread";

function messageFolder(input: OperationInput): MessageFolder {
  const value = input.folder;
  if (value !== "all" && value !== "people" && value !== "unread") {
    throw new Error("input.folder must name all, people, or unread");
  }
  return value;
}

async function listMessages(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  input: OperationInput,
): Promise<unknown> {
  const folder = messageFolder(input);
  const limit = integerInput(input, "limit", DEFAULT_LIMIT, 1, 100);
  const url = new URL("/api/v1/messages/inbox", SUBSTACK_ORIGIN);
  url.searchParams.set("tab", folder);
  const cursor = optionalStringInput(input, "cursor", 4_096);
  if (cursor !== undefined) url.searchParams.set("cursor", cursor);
  authorizeSubstackWebReadRequest({
    operation: "messages.list",
    url,
    method: "GET",
    folder,
  });
  const response = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe),
  });
  return normalizeSubstackMessageInbox(response, folder, limit);
}

type UploadedSubstackImage = {
  readonly id: number;
  readonly url: string;
};

type SubstackImageAttachment = {
  readonly id: string;
  readonly url: string;
};

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function exactSubstackImageUrl(
  value: unknown,
  width: number,
  height: number,
  label: string,
): string {
  if (typeof value !== "string" || value.length > 8_192) {
    throw new Error(`${label} must be a bounded URL`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const path = new RegExp(`^/public/images/${uuid}_${width}x${height}\\.png$`, "iu");
  if (
    parsed.protocol !== "https:"
    || parsed.hostname !== "substack-post-media.s3.amazonaws.com"
    || parsed.port !== ""
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
    || !path.test(parsed.pathname)
  ) throw new Error(`${label} did not match the reviewed Substack image asset URL`);
  return parsed.href;
}

function parseUploadedSubstackImage(
  value: unknown,
  image: SubstackImage,
): UploadedSubstackImage {
  if (!isRecord(value)) throw new Error("Substack image upload response must be an object");
  requireExactKeys(value, [
    "bytes",
    "contentType",
    "id",
    "imageHeight",
    "imageWidth",
    "url",
  ], "Substack image upload response");
  if (
    value.bytes !== image.bytes.byteLength
    || value.contentType !== image.mediaType
    || value.imageHeight !== image.height
    || value.imageWidth !== image.width
  ) throw new Error("Substack image upload response did not bind the reviewed PNG");
  return Object.freeze({
    id: positiveInteger(value.id, "Substack image upload response.id"),
    url: exactSubstackImageUrl(
      value.url,
      image.width,
      image.height,
      "Substack image upload response.url",
    ),
  });
}

function attachmentUuid(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) throw new Error(`${label} must be an exact UUID`);
  return value;
}

function parseSubstackImageAttachment(
  value: unknown,
  image: SubstackImage,
  expectedUrl: string,
): SubstackImageAttachment {
  if (!isRecord(value)) throw new Error("Substack image attachment response must be an object");
  requireExactKeys(value, [
    "explicit",
    "id",
    "imageHeight",
    "imageUrl",
    "imageWidth",
    "type",
  ], "Substack image attachment response");
  if (
    value.explicit !== false
    || value.type !== "image"
    || value.imageHeight !== image.height
    || value.imageWidth !== image.width
    || value.imageUrl !== expectedUrl
  ) throw new Error("Substack image attachment response did not bind the reviewed PNG");
  return Object.freeze({
    id: attachmentUuid(value.id, "Substack image attachment response.id"),
    url: expectedUrl,
  });
}

async function uploadSubstackImage(
  client: WebSessionClient,
  image: SubstackImage,
): Promise<SubstackImageAttachment> {
  const encoded = `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString("base64")}`;
  const uploaded = parseUploadedSubstackImage(await client.requestJson({
    url: new URL("/api/v1/image", SUBSTACK_ORIGIN),
    method: "POST",
    headers: jsonPostHeaders(),
    body: JSON.stringify({ image: encoded }),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: 256 * 1024,
  }), image);
  void uploaded.id;
  return parseSubstackImageAttachment(await client.requestJson({
    url: new URL("/api/v1/comment/attachment", SUBSTACK_ORIGIN),
    method: "POST",
    headers: jsonPostHeaders(),
    body: JSON.stringify({ type: "image", url: uploaded.url }),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: 256 * 1024,
  }), image, uploaded.url);
}

// ---------------------------------------------------------------------------
// Substack Note video upload (media.publish@1)
//
// Reviewed against the live capture recorded on 2026-10-05: initialization
// POST /api/v1/video/upload returns the media upload record, one multipart
// upload id, and ordered presigned byte-transfer URLs on the reviewed
// substack-video S3 accelerate host. Each part PUT is accepted with 200 and a
// strong ETag response header. POST /api/v1/video/upload/{id}/transcode binds
// duration, the multipart upload id, and the ordered ETags; GET
// /api/v1/video/upload/{id} reports the lifecycle until "transcoded".
// POST /api/v1/comment/attachment binds type "video" and mediaUploadId and
// returns the attachment identifier admitted to the Note create call.
// ---------------------------------------------------------------------------

const SUBSTACK_VIDEO_UPLOAD_ORIGIN =
  "https://substack-video.s3-accelerate.amazonaws.com";
const SUBSTACK_VIDEO_STATUS_POLL_DELAYS_MS = Object.freeze([
  1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 8_000, 10_000, 10_000, 10_000,
  10_000, 10_000,
]);
const SUBSTACK_VIDEO_PART_PUT_TIMEOUT_MS = 120_000;

type SubstackVideoUploadSession = Readonly<{
  readonly mediaUploadId: string;
  readonly multipartUploadId: string;
  readonly signedUrls: readonly URL[];
}>;

function substackMediaUploadIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) throw new Error(`${label} must be one exact UUID`);
  return value;
}

function substackMultipartUploadIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 512
    || !/^[A-Za-z0-9_.\-/+=]{1,512}$/u.test(value)
  ) throw new Error(`${label} must be one bounded multipart upload identifier`);
  return value;
}

function bindSubstackVideoSignedPartUrl(
  value: unknown,
  partNumber: number,
  viewerId: number,
  mediaUploadId: string,
  multipartUploadId: string,
): URL {
  if (typeof value !== "string" || value.length > 8_192) {
    throw new Error("Substack video multipart URL must be one bounded string");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Substack video multipart URL must be absolute HTTPS");
  }
  if (
    url.origin !== SUBSTACK_VIDEO_UPLOAD_ORIGIN
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
  ) throw new Error("Substack video multipart URL left the reviewed upload origin");
  if (
    url.pathname !== `/video_upload/user/${viewerId}/${mediaUploadId}/original`
  ) throw new Error("Substack video multipart URL did not bind the upload session");
  if (url.searchParams.get("partNumber") !== String(partNumber)) {
    throw new Error("Substack video multipart URL did not bind its part number");
  }
  if (url.searchParams.get("uploadId") !== multipartUploadId) {
    throw new Error("Substack video multipart URL did not bind the multipart upload");
  }
  for (const required of [
    "X-Amz-Algorithm",
    "X-Amz-Date",
    "X-Amz-Expires",
    "X-Amz-Signature",
    "X-Amz-SignedHeaders",
    "x-id",
  ]) {
    if (url.searchParams.get(required) === null) {
      throw new Error("Substack video multipart URL is missing a signed parameter");
    }
  }
  return url;
}

/** Bind the live-reviewed initialization response to the exact local MP4. */
function parseSubstackVideoUploadSession(
  value: unknown,
  video: SubstackVideo,
  viewerId: number,
): SubstackVideoUploadSession {
  if (!isRecord(value)) {
    throw new Error("Substack video upload initialization response must be an object");
  }
  requireExactKeys(
    value,
    ["mediaUpload", "multipartUploadId", "multipartUploadUrls"],
    "Substack video upload initialization response",
  );
  const upload = value.mediaUpload;
  if (!isRecord(upload)) {
    throw new Error("Substack video upload initialization mediaUpload must be an object");
  }
  requireAllowedKeys(upload, [
    "created_at",
    "duration",
    "hash",
    "id",
    "is_mux",
    "media_type",
    "multipart_upload_id",
    "name",
    "parts",
    "post_id",
    "primary_file_size",
    "publication_id",
    "state",
    "user_id",
  ], "Substack video upload initialization mediaUpload");
  const mediaUploadId = substackMediaUploadIdentifier(
    upload.id,
    "Substack video upload initialization mediaUpload.id",
  );
  const multipartUploadId = substackMultipartUploadIdentifier(
    upload.multipart_upload_id,
    "Substack video upload initialization mediaUpload.multipart_upload_id",
  );
  if (
    upload.state !== "created"
    || upload.media_type !== "video"
    || upload.user_id !== viewerId
    || upload.primary_file_size !== video.byteLength
    || upload.publication_id !== null
    || upload.post_id !== null
    || upload.is_mux !== true
    || (upload.parts !== undefined
      && (!Array.isArray(upload.parts) || upload.parts.length !== 0))
    || typeof upload.name !== "string"
    || upload.name.length < 1
    || upload.name.length > 256
  ) throw new Error("Substack video upload initialization did not bind the exact MP4 session");
  if (value.multipartUploadId !== multipartUploadId) {
    throw new Error("Substack video upload initialization multipart identifiers diverged");
  }
  const urls = value.multipartUploadUrls;
  if (!Array.isArray(urls)) {
    throw new Error("Substack video upload initialization URLs must be an array");
  }
  const parts = planSubstackVideoMultipartParts(video.byteLength, urls.length);
  const signedUrls = urls.map((entry, index) => bindSubstackVideoSignedPartUrl(
    entry,
    parts[index]!.partNumber,
    viewerId,
    mediaUploadId,
    multipartUploadId,
  ));
  return Object.freeze({
    mediaUploadId,
    multipartUploadId,
    signedUrls: Object.freeze(signedUrls),
  });
}

function parseSubstackVideoTranscodeResponse(
  value: unknown,
  mediaUploadId: string,
): void {
  if (!isRecord(value) || !isRecord(value.mediaUpload)) {
    throw new Error("Substack video transcode response must bind the media upload");
  }
  const upload = value.mediaUpload;
  if (upload.id !== mediaUploadId || upload.state !== "uploaded") {
    throw new Error("Substack video transcode response did not bind the exact upload");
  }
}

function parseSubstackVideoStatusResponse(
  value: unknown,
  mediaUploadId: string,
): SubstackVideoUploadSettlement {
  if (!isRecord(value) || value.id !== mediaUploadId) {
    throw new Error("Substack video status response did not bind the exact upload");
  }
  return classifySubstackVideoUploadState(value.state);
}

type SubstackVideoAttachment = Readonly<{
  readonly id: string;
  readonly mediaUploadId: string;
}>;

function parseSubstackVideoAttachment(
  value: unknown,
  mediaUploadId: string,
): SubstackVideoAttachment {
  if (!isRecord(value)) {
    throw new Error("Substack video attachment response must be an object");
  }
  requireExactKeys(
    value,
    ["comment_id", "id", "media_upload_id", "mediaUpload", "type", "user_id"],
    "Substack video attachment response",
  );
  if (
    value.type !== "video"
    || value.media_upload_id !== mediaUploadId
    || value.comment_id !== null
    || !isRecord(value.mediaUpload)
    || value.mediaUpload.id !== mediaUploadId
    || value.mediaUpload.state !== "transcoded"
  ) throw new Error("Substack video attachment response did not bind the exact upload");
  return Object.freeze({
    id: attachmentUuid(value.id, "Substack video attachment response.id"),
    mediaUploadId,
  });
}

/** Run the reviewed upload lifecycle; returns the attachment for Note create. */
async function uploadSubstackVideo(
  client: WebSessionClient,
  video: SubstackVideo,
  viewerId: number,
  videoUploadFetch: SubstackVideoUploadFetch,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly sleep: SubstackWebSleep;
    readonly setFailureStage?: (
      stage: "video-attachment" | "video-part-transfer" | "video-processing"
        | "video-transcode" | "video-upload-init",
    ) => void;
  },
): Promise<SubstackVideoAttachment> {
  options.setFailureStage?.("video-upload-init");
  const initialization = substackVideoUploadInitializationRequestForBinding(video);
  const session = parseSubstackVideoUploadSession(await client.requestJson({
    url: new URL(initialization.url),
    method: "POST",
    headers: jsonPostHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: 256 * 1024,
  }), video, viewerId);
  const snapshot = revalidateAndSnapshotSubstackVideoMultipartDispatch(
    video,
    createSubstackVideoMultipartDispatchCheckpoint(video, session.signedUrls.length),
  );
  const etags: string[] = [];
  options.setFailureStage?.("video-part-transfer");
  for (const part of snapshot.parts) {
    options.operationDeadline?.throwIfUnavailable(
      "authenticated web operation deadline",
    );
    if (options.signal?.aborted === true) {
      throw new Error("Substack video upload was cancelled");
    }
    const url = session.signedUrls[part.partNumber - 1]!;
    const bytes = new Uint8Array(
      await snapshot.parts[part.partNumber - 1]!.body.arrayBuffer(),
    );
    if (bytes.byteLength !== part.byteLength) {
      throw new Error("Substack video multipart snapshot changed shape");
    }
    const timeoutMs = Math.min(
      SUBSTACK_VIDEO_PART_PUT_TIMEOUT_MS,
      Math.max(
        MIN_PINNED_HTTPS_TIMEOUT_MS,
        options.operationDeadline?.remainingTimeMs() ?? SUBSTACK_VIDEO_PART_PUT_TIMEOUT_MS,
      ),
    );
    const response = await videoUploadFetch({
      url,
      body: bytes,
      signal: options.signal ?? AbortSignal.timeout(timeoutMs),
      timeoutMs,
    });
    if (response.status !== 200) {
      throw new Error("Substack video multipart byte transfer was not accepted");
    }
    etags.push(
      parseSubstackVideoMultipartEtags([response.etag], 1)[0]!,
    );
  }
  options.setFailureStage?.("video-transcode");
  const transcodeRequest = substackVideoTranscodeRequestForBinding(
    session.mediaUploadId,
    session.multipartUploadId,
    video,
    session.signedUrls.length,
    etags,
  );
  parseSubstackVideoTranscodeResponse(await client.requestJson({
    url: new URL(transcodeRequest.url),
    method: "POST",
    headers: jsonPostHeaders(),
    body: JSON.stringify(transcodeRequest.body),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: 256 * 1024,
  }), session.mediaUploadId);
  options.setFailureStage?.("video-processing");
  const statusRequest = substackVideoStatusRequest(session.mediaUploadId);
  let settled: SubstackVideoUploadSettlement | null = null;
  for (
    let attempt = 0;
    attempt <= SUBSTACK_VIDEO_STATUS_POLL_DELAYS_MS.length;
    attempt += 1
  ) {
    if (attempt > 0) {
      await waitForSubstackNoteReadback(
        SUBSTACK_VIDEO_STATUS_POLL_DELAYS_MS[attempt - 1]!,
        options.sleep,
        options.signal,
        options.operationDeadline,
      );
    }
    settled = parseSubstackVideoStatusResponse(await client.requestJson({
      url: new URL(statusRequest.url),
      method: "GET",
      headers: jsonHeaders(),
      expectedStatuses: [200],
      expectedContentTypes: ["application/json"],
      maxBytes: 256 * 1024,
    }), session.mediaUploadId);
    if (settled.status === "complete") break;
    if (settled.status === "terminal-failure") {
      throw new Error(`Substack video processing ended in ${settled.state}`);
    }
  }
  if (settled === null || settled.status !== "complete") {
    throw new Error("Substack video processing exhausted its reviewed window");
  }
  options.setFailureStage?.("video-attachment");
  return parseSubstackVideoAttachment(await client.requestJson({
    url: new URL("/api/v1/comment/attachment", SUBSTACK_ORIGIN),
    method: "POST",
    headers: jsonPostHeaders(),
    body: JSON.stringify({ type: "video", mediaUploadId: session.mediaUploadId }),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: 256 * 1024,
  }), session.mediaUploadId);
}

type SubstackBodyJson = Readonly<{
  type: "doc";
  attrs: Readonly<{ schemaVersion: "v1"; title: null }>;
  content: readonly Readonly<{
    type: "paragraph";
    content?: readonly Readonly<{ type: "text"; text: string }>[];
  }>[];
}>;

function substackBodyJson(body: string): SubstackBodyJson {
  const content = body.split("\n").map((line) => Object.freeze({
    type: "paragraph" as const,
    ...(line.length === 0
      ? {}
      : { content: Object.freeze([Object.freeze({ type: "text" as const, text: line })]) }),
  }));
  return Object.freeze({
    type: "doc",
    attrs: Object.freeze({ schemaVersion: "v1", title: null }),
    content: Object.freeze(content),
  });
}

function noteBodyInput(input: OperationInput): string {
  return substackNoteText(input.body, "input.body");
}

const CREATED_NOTE_KEYS = Object.freeze([
  "ancestor_path",
  "attachments",
  "autotranslate_to",
  "body",
  "body_json",
  "children",
  "children_count",
  "date",
  "deleted",
  "edited_at",
  "handle",
  "id",
  "is_ai_detection_disabled",
  "is_ai_generated_text",
  "isFirstFeedCommentByUser",
  "language",
  "media_clip_id",
  "name",
  "photo_url",
  "post_id",
  "publication_id",
  "reaction_count",
  "reactions",
  "reply_minimum_role",
  "restacked",
  "restacks",
  "status",
  "type",
  "userStatus",
  "user_bestseller_tier",
  "user_id",
  "user_primary_publication",
]);

type SubstackNoteCreateRequestFailureStage =
  | "note-create-transport"
  | "note-create-http-status"
  | "note-create-content-type"
  | "note-create-json"
  | "note-create-response-bounds";

type SubstackNoteCreateBindingFailureStage =
  | "note-create-response-object"
  | "note-create-response-fields"
  | "note-create-actor"
  | "note-create-body"
  | "note-create-kind"
  | "note-create-deleted-state"
  | "note-create-parent-post"
  | "note-create-publication"
  | "note-create-reply-role"
  | "note-create-body-json"
  | "note-create-publication-status"
  | "note-create-attachments-shape"
  | "note-create-attachments-count"
  | "note-create-attachment-object"
  | "note-create-attachment-fields"
  | "note-create-attachment-id"
  | "note-create-attachment-url"
  | "note-create-attachment-kind"
  | "note-create-id";

class SubstackNoteCreateBindingError extends Error {
  constructor(
    readonly stage: SubstackNoteCreateBindingFailureStage,
    message: string,
  ) {
    super(message);
    this.name = "SubstackNoteCreateBindingError";
  }
}

function noteCreateBindingFailure(
  stage: SubstackNoteCreateBindingFailureStage,
  message: string,
): never {
  throw new SubstackNoteCreateBindingError(stage, message);
}

function substackNoteCreateRequestFailureStage(
  error: unknown,
): SubstackNoteCreateRequestFailureStage {
  const message = error instanceof Error ? error.message : "";
  const statusPrefix =
    "authenticated web API returned unreviewed status/content type ";
  if (message.startsWith(statusPrefix)) {
    const separator = message.indexOf("/", statusPrefix.length);
    const status = separator < 0
      ? ""
      : message.slice(statusPrefix.length, separator);
    return status === "200"
      ? "note-create-content-type"
      : "note-create-http-status";
  }
  if (
    message === "authenticated web API returned invalid UTF-8 JSON"
    || message === "authenticated web API returned malformed JSON"
  ) return "note-create-json";
  if (
    message === "authenticated web response exceeded its reviewed byte limit"
    || message === "authenticated web response yielded a non-byte chunk"
  ) return "note-create-response-bounds";
  return "note-create-transport";
}

/** Exact confirmed Note attachment, keyed by the reviewed media kind. */
type SubstackNoteAttachmentBinding =
  | Readonly<{
      kind: "image";
      id: string;
      url: string;
    }>
  | Readonly<{
      kind: "video";
      id: string;
      mediaUploadId: string;
    }>;

function parseCreatedSubstackNote(
  value: unknown,
  viewer: SubstackWebViewer,
  body: string,
  bodyJson: SubstackBodyJson,
  attachment: SubstackNoteAttachmentBinding | null,
): number {
  if (!isRecord(value)) {
    noteCreateBindingFailure(
      "note-create-response-object",
      "Substack Note create response must be an object",
    );
  }
  try {
    requireAllowedKeys(value, CREATED_NOTE_KEYS, "Substack Note create response");
  } catch {
    noteCreateBindingFailure(
      "note-create-response-fields",
      "Substack Note create response fields changed",
    );
  }
  if (value.user_id !== viewer.id) {
    noteCreateBindingFailure(
      "note-create-actor",
      "Substack Note create response did not bind the confirmed actor",
    );
  }
  if (value.body !== body) {
    noteCreateBindingFailure(
      "note-create-body",
      "Substack Note create response did not bind the confirmed body",
    );
  }
  if (value.type !== "feed") {
    noteCreateBindingFailure(
      "note-create-kind",
      "Substack Note create response did not bind the confirmed Note kind",
    );
  }
  if (value.deleted !== undefined && value.deleted !== false) {
    noteCreateBindingFailure(
      "note-create-deleted-state",
      "Substack Note create response returned a deleted Note",
    );
  }
  if (value.post_id !== null) {
    noteCreateBindingFailure(
      "note-create-parent-post",
      "Substack Note create response did not bind the confirmed parent post",
    );
  }
  if (value.publication_id !== null) {
    noteCreateBindingFailure(
      "note-create-publication",
      "Substack Note create response did not bind the confirmed publication",
    );
  }
  if (value.reply_minimum_role !== "everyone") {
    noteCreateBindingFailure(
      "note-create-reply-role",
      "Substack Note create response did not bind the confirmed reply role",
    );
  }
  let bodyJsonMatches = false;
  try {
    bodyJsonMatches = canonicalJson(value.body_json) === canonicalJson(bodyJson);
  } catch {
    bodyJsonMatches = false;
  }
  if (!bodyJsonMatches) {
    noteCreateBindingFailure(
      "note-create-body-json",
      "Substack Note create response did not bind the confirmed body document",
    );
  }
  if (value.status !== undefined && value.status !== "published") {
    noteCreateBindingFailure(
      "note-create-publication-status",
      "Substack Note create response did not bind the confirmed publication status",
    );
  }
  const attachments = value.attachments;
  if (attachments !== undefined && !Array.isArray(attachments)) {
    noteCreateBindingFailure(
      "note-create-attachments-shape",
      "Substack Note create response attachments changed shape",
    );
  }
  // The create response may omit the attachment echo or return an empty echo.
  // The exact target readback below remains authoritative for image binding.
  if (Array.isArray(attachments) && attachments.length > 0) {
    if (attachment === null || attachments.length !== 1) {
      noteCreateBindingFailure(
        "note-create-attachments-count",
        "Substack Note create response did not bind the confirmed attachment count",
      );
    }
    const item = attachments[0];
    if (!isRecord(item)) {
      noteCreateBindingFailure(
        "note-create-attachment-object",
        "Substack Note create attachment must be an object",
      );
    }
    if (attachment.kind === "image") {
      try {
        requireExactKeys(item, [
          "explicit",
          "id",
          "imageHeight",
          "imageUrl",
          "imageWidth",
          "type",
        ], "Substack Note create attachment");
      } catch {
        noteCreateBindingFailure(
          "note-create-attachment-fields",
          "Substack Note create attachment fields changed",
        );
      }
      if (item.imageUrl !== attachment.url) {
        noteCreateBindingFailure(
          "note-create-attachment-url",
          "Substack Note create response attachment did not bind the uploaded image URL",
        );
      }
    }
    if (item.id !== attachment.id) {
      noteCreateBindingFailure(
        "note-create-attachment-id",
        "Substack Note create response attachment did not bind the uploaded media identifier",
      );
    }
    if (item.type !== attachment.kind) {
      noteCreateBindingFailure(
        "note-create-attachment-kind",
        "Substack Note create response attachment did not bind the uploaded media kind",
      );
    }
    if (
      attachment.kind === "video"
      && item.media_upload_id !== undefined
      && item.media_upload_id !== attachment.mediaUploadId
    ) {
      noteCreateBindingFailure(
        "note-create-attachment-id",
        "Substack Note create response attachment did not bind the uploaded video identifier",
      );
    }
  }
  try {
    return positiveInteger(value.id, "Substack Note create response.id");
  } catch {
    noteCreateBindingFailure(
      "note-create-id",
      "Substack Note create response did not return a valid Note identifier",
    );
  }
}

type ProjectedSubstackNote = Readonly<{
  entityKey: string | null;
  comment: Readonly<{
    id: number;
    userId: number;
    publicationId: number | null;
    postId: number | null;
    body: string;
    type: string | null;
    attachments: readonly Readonly<{
      id: string | null;
      type: string | null;
      url: string | null;
      imageUrl: string | null;
      videoUrl: string | null;
      mediaUploadId: string | null;
      mediaUpload: Readonly<{
        id: string | null;
        state: string | null;
      }> | null;
      width: number | null;
      height: number | null;
    }>[];
  }>;
  post: unknown | null;
}>;

export type SubstackNoteDeletionRecoveryTarget = Readonly<{
  readonly noteId: number;
  readonly publicationId: null;
  readonly schemaVersion: 1;
}>;

/** Bind deletion to one exact current-account personal Note before dispatch. */
export function assertSubstackNoteDeletionPreRead(
  value: unknown,
  noteId: number,
  viewerId: number,
  expectedBody: string,
): SubstackNoteDeletionRecoveryTarget {
  if (!Number.isSafeInteger(noteId) || noteId < 1) {
    throw new Error("Substack deletion Note ID must be positive");
  }
  if (!Number.isSafeInteger(viewerId) || viewerId < 1) {
    throw new Error("Substack deletion viewer ID must be positive");
  }
  substackNoteText(expectedBody, "Substack deletion expected body");
  const note = normalizeSubstackNoteResponse(value, noteId) as ProjectedSubstackNote;
  if (
    note.entityKey !== `c-${noteId}`
    || note.comment.id !== noteId
    || note.comment.userId !== viewerId
    || note.comment.publicationId !== null
    || note.comment.postId !== null
    || note.comment.body !== expectedBody
    || note.comment.type !== "feed"
    || note.post !== null
  ) throw new Error("Substack deletion pre-read did not bind the exact authored Note");
  return Object.freeze({ noteId, publicationId: null, schemaVersion: 1 as const });
}

/** Serialize the pre-read authored target without retaining its private body. */
export function substackNoteDeletionRecoveryTargetIdentifier(
  targetValue: unknown,
): string {
  if (!isRecord(targetValue)) {
    throw new Error("Substack deletion recovery target changed shape");
  }
  requireExactKeys(
    targetValue,
    ["noteId", "publicationId", "schemaVersion"],
    "Substack deletion recovery target",
  );
  if (targetValue.publicationId !== null || targetValue.schemaVersion !== 1) {
    throw new Error("Substack deletion recovery target changed shape");
  }
  return canonicalJson({
    noteId: positiveInteger(
      targetValue.noteId,
      "Substack deletion recovery target.noteId",
    ),
    publicationId: null,
    schemaVersion: 1,
  });
}

/** Parse only one canonical personal-Note target for read-only reconciliation. */
export function parseSubstackNoteDeletionRecoveryTargetIdentifier(
  identifier: unknown,
): SubstackNoteDeletionRecoveryTarget {
  if (
    typeof identifier !== "string"
    || identifier.length < 1
    || identifier.length > MAX_SUBSTACK_RECOVERY_IDENTIFIER_BYTES
    || /[\0\r\n]/u.test(identifier)
  ) throw new Error("Substack deletion recovery target must be bounded canonical JSON");
  let value: unknown;
  try {
    value = JSON.parse(identifier) as unknown;
  } catch {
    throw new Error("Substack deletion recovery target must be bounded canonical JSON");
  }
  if (!isRecord(value)) {
    throw new Error("Substack deletion recovery target changed shape");
  }
  const canonical = substackNoteDeletionRecoveryTargetIdentifier(value);
  if (canonical !== identifier) {
    throw new Error("Substack deletion recovery target must use canonical JSON");
  }
  return Object.freeze({
    noteId: positiveInteger(value.noteId, "Substack deletion recovery target.noteId"),
    publicationId: null,
    schemaVersion: 1 as const,
  });
}

/** Build the exact independent Note GET used for pre-read and absence checks. */
export function substackNoteDeletionRecoveryReadRequest(
  identifier: unknown,
): Readonly<{ method: "GET"; url: string }> {
  const target = parseSubstackNoteDeletionRecoveryTargetIdentifier(identifier);
  return Object.freeze({
    method: "GET" as const,
    url: new URL(`/api/v1/reader/comment/${target.noteId}`, SUBSTACK_ORIGIN).href,
  });
}

export function substackPersonalNoteDeleteRequest(
  noteId: unknown,
): Readonly<{ method: "DELETE"; url: string }> {
  const target = positiveInteger(noteId, "Substack deletion Note ID");
  return Object.freeze({
    method: "DELETE" as const,
    url: new URL(`/api/v1/comment/${target}`, SUBSTACK_ORIGIN).href,
  });
}

async function dispatchSubstackPersonalNoteDelete(
  client: WebSessionClient,
  noteId: number,
  options: {
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  },
): Promise<void> {
  const request = substackPersonalNoteDeleteRequest(noteId);
  const url = new URL(request.url);
  if (
    url.origin !== SUBSTACK_ORIGIN
    || url.pathname !== `/api/v1/comment/${noteId}`
    || url.search !== ""
    || url.hash !== ""
    || url.username !== ""
    || url.password !== ""
  ) throw new Error("Substack personal Note deletion escaped its exact reviewed target");

  const ownedDeadline = options.operationDeadline === undefined
    ? new OperationDeadline(options.timeoutMs, {
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    : null;
  const deadline = options.operationDeadline ?? ownedDeadline;
  if (deadline === null) {
    throw new Error("Substack personal Note deletion deadline is unavailable");
  }
  const headers = new Headers(jsonPostHeaders());
  headers.set("cookie", renderCookieHeader(client.cookies));
  let response: Response | undefined;
  try {
    deadline.throwIfUnavailable(SUBSTACK_DELETE_REQUEST_LABEL);
    const timeoutMs = deadline.remainingTimeMs();
    if (options.dependencies?.fetch === undefined && timeoutMs < MIN_PINNED_HTTPS_TIMEOUT_MS) {
      throw new Error("Substack personal Note deletion has insufficient time for its request");
    }
    try {
      response = await deadline.run(
        (signal) => {
          const init: RequestInit = {
            method: request.method,
            headers,
            redirect: "error",
            signal,
          };
          return options.dependencies?.fetch === undefined
            ? pinnedHttpsFetch(url, init, timeoutMs)
            : options.dependencies.fetch(url, init);
        },
        SUBSTACK_DELETE_REQUEST_LABEL,
      );
    } catch (error) {
      throw new Error(
        "Substack personal Note deletion failed before a reviewed response was received",
        { cause: error },
      );
    }
    if (response.status !== 200 || response.headers.get("location") !== null) {
      void response.body?.cancel().catch(() => undefined);
      throw new Error(
        `Substack personal Note deletion returned unreviewed status/redirect ${response.status}`,
      );
    }
    void response.body?.cancel().catch(() => undefined);
    deadline.throwIfUnavailable(SUBSTACK_DELETE_REQUEST_LABEL);
  } finally {
    if (deadline.signal.aborted) {
      void response?.body?.cancel().catch(() => undefined);
    }
    ownedDeadline?.dispose();
  }
}

type SubstackPersonalNoteDeletionPresence = Readonly<{
  present: boolean;
  target: SubstackNoteDeletionRecoveryTarget | null;
}>;

async function readSubstackPersonalNoteDeletionPresence(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  noteId: number,
  viewerId: number,
  expectedBody: string,
): Promise<SubstackPersonalNoteDeletionPresence> {
  const request = substackNoteDeletionRecoveryReadRequest(
    substackNoteDeletionRecoveryTargetIdentifier({
      noteId,
      publicationId: null,
      schemaVersion: 1,
    }),
  );
  const url = new URL(request.url);
  authorizeSubstackWebReadRequest({
    operation: "posts.note",
    url,
    method: "GET",
    targetId: noteId,
  });
  const status = await client.requestStatus({
    url,
    method: "GET",
    headers: jsonHeaders(),
    expectedStatuses: [200, 404],
  });
  if (status.status === 404) {
    return Object.freeze({ present: false, target: null });
  }
  const value = await client.requestJson({
    url,
    method: "GET",
    headers: jsonHeaders(),
    expectedStatuses: [200],
    expectedContentTypes: ["application/json"],
    maxBytes: boundedMaximum(recipe),
  });
  return Object.freeze({
    present: true,
    target: assertSubstackNoteDeletionPreRead(
      value,
      noteId,
      viewerId,
      expectedBody,
    ),
  });
}

/** Exact confirmed media expectation for an independent Note readback. */
type SubstackNoteMediaExpectation =
  | Readonly<{
      kind: "image";
      attachment: Readonly<{ id: string; url: string }>;
      height: number;
      width: number;
    }>
  | Readonly<{
      kind: "video";
      attachment: Readonly<{ id: string; mediaUploadId: string }>;
    }>;

function assertSubstackNoteReadback(
  note: ProjectedSubstackNote,
  noteId: number,
  viewer: SubstackWebViewer,
  body: string,
  media: SubstackNoteMediaExpectation | null,
): void {
  if (
    note.entityKey !== `c-${noteId}`
    || note.comment.id !== noteId
    || note.comment.userId !== viewer.id
    || note.comment.publicationId !== null
    || note.comment.postId !== null
    || note.comment.body !== body
    || note.comment.type !== "feed"
    || note.post !== null
  ) throw new Error("Substack Note readback did not bind the confirmed Note");
  if (media === null) {
    if (note.comment.attachments.length !== 0) {
      throw new Error("Substack Note readback contained an unexpected attachment");
    }
    return;
  }
  const item = note.comment.attachments[0];
  if (
    note.comment.attachments.length !== 1
    || item === undefined
    || item.id !== media.attachment.id
    || item.type !== media.kind
  ) throw new Error("Substack Note readback did not bind the confirmed media");
  if (
    media.kind === "image"
    && (
      item.imageUrl !== media.attachment.url
      || item.width !== media.width
      || item.height !== media.height
    )
  ) throw new Error("Substack Note readback did not bind the confirmed image");
  if (
    media.kind === "video"
    && (
      item.mediaUploadId !== media.attachment.mediaUploadId
      || (item.mediaUpload !== null && item.mediaUpload.id !== media.attachment.mediaUploadId)
    )
  ) throw new Error("Substack Note readback did not bind the confirmed video");
}

function substackDispatchEvent(
  id: "media.publish" | "posts.publish",
  started: number,
  verified: number,
): WebSessionDispatchEvent {
  return {
    id,
    index: 1,
    progress: { planned: 1, started, verified },
  };
}

function substackDeleteDispatchEvent(
  started: number,
  verified: number,
): WebSessionDispatchEvent {
  return {
    id: "content.delete",
    index: 1,
    progress: { planned: 1, started, verified },
  };
}

function substackNoteUrl(handle: string, noteId: number): string {
  return new URL(`/@${encodeURIComponent(handle)}/note/c-${noteId}`, SUBSTACK_ORIGIN).href;
}

type SubstackPostFailureStage =
  | "dispatch-admission"
  | "image-upload"
  | SubstackNoteCreateRequestFailureStage
  | SubstackNoteCreateBindingFailureStage
  | "accepted-target-recording"
  | "note-readback"
  | "verification-recording";

async function waitForSubstackNoteReadback(
  milliseconds: number,
  sleep: SubstackWebSleep,
  signal: AbortSignal | undefined,
  operationDeadline: WebSessionOperationDeadline | undefined,
): Promise<void> {
  if (operationDeadline === undefined) {
    await sleep(milliseconds, signal);
    return;
  }
  await operationDeadline.run(
    (deadlineSignal) => sleep(milliseconds, deadlineSignal),
    "authenticated web operation deadline",
  );
}

async function readExactSubstackNoteAfterPublish(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  noteId: number,
  viewer: SubstackWebViewer,
  body: string,
  media: SubstackNoteMediaExpectation | null,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly sleep: SubstackWebSleep;
  },
): Promise<ProjectedSubstackNote> {
  const readbackUrl = new URL(`/api/v1/reader/comment/${noteId}`, SUBSTACK_ORIGIN);
  authorizeSubstackWebReadRequest({
    operation: "posts.note",
    url: readbackUrl,
    method: "GET",
    targetId: noteId,
  });
  for (let attempt = 0; attempt <= SUBSTACK_NOTE_READBACK_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await waitForSubstackNoteReadback(
        SUBSTACK_NOTE_READBACK_DELAYS_MS[attempt - 1]!,
        options.sleep,
        options.signal,
        options.operationDeadline,
      );
    }
    try {
      const note = normalizeSubstackNoteResponse(await client.requestJson({
        url: readbackUrl,
        method: "GET",
        headers: jsonHeaders(),
        maxBytes: boundedMaximum(recipe),
      }), noteId) as ProjectedSubstackNote;
      assertSubstackNoteReadback(note, noteId, viewer, body, media);
      return note;
    } catch {
      options.operationDeadline?.throwIfUnavailable(
        "authenticated web operation deadline",
      );
      if (options.signal?.aborted === true) {
        throw new Error("Substack Note readback was cancelled");
      }
      if (attempt === SUBSTACK_NOTE_READBACK_DELAYS_MS.length) {
        throw new Error("Substack exact Note readback exhausted its reviewed window");
      }
    }
  }
  throw new Error("Substack exact Note readback exhausted its reviewed window");
}

type SubstackAcceptedNoteAttachment =
  | Readonly<{
      id: string;
      kind: "image";
      url: string;
      height: number;
      width: number;
      mediaType: "image/png";
    }>
  | Readonly<{
      id: string;
      kind: "video";
      mediaUploadId: string;
      durationSeconds: number;
      height: number;
      width: number;
      mediaType: "video/mp4";
    }>;

type SubstackAcceptedNoteTarget = Readonly<{
  noteId: number;
  attachment: SubstackAcceptedNoteAttachment | null;
}>;

function parseSubstackAcceptedNoteTarget(
  identifier: unknown,
): SubstackAcceptedNoteTarget {
  if (
    typeof identifier !== "string"
    || identifier.length < 1
    || identifier.length > 8_192
    || /[\0\r\n]/u.test(identifier)
  ) throw new Error("Substack accepted Note target must be bounded canonical JSON");
  let value: unknown;
  try {
    value = JSON.parse(identifier) as unknown;
  } catch {
    throw new Error("Substack accepted Note target must be bounded canonical JSON");
  }
  if (!isRecord(value)) throw new Error("Substack accepted Note target changed shape");
  requireExactKeys(value, ["attachment", "noteId"], "Substack accepted Note target");
  if (!isCanonicalJsonText(identifier, value)) {
    throw new Error("Substack accepted Note target must use canonical JSON");
  }
  const noteId = positiveInteger(value.noteId, "Substack accepted Note target.noteId");
  if (value.attachment === null) return Object.freeze({ noteId, attachment: null });
  if (!isRecord(value.attachment)) {
    throw new Error("Substack accepted Note attachment changed shape");
  }
  const id = attachmentUuid(value.attachment.id, "Substack accepted Note attachment.id");
  if (value.attachment.mediaType === "video/mp4") {
    requireExactKeys(
      value.attachment,
      ["durationSeconds", "height", "id", "mediaType", "mediaUploadId", "width"],
      "Substack accepted Note attachment",
    );
    const width = positiveInteger(
      value.attachment.width,
      "Substack accepted Note attachment.width",
    );
    const height = positiveInteger(
      value.attachment.height,
      "Substack accepted Note attachment.height",
    );
    const durationSeconds = value.attachment.durationSeconds;
    if (
      width > 20_000
      || height > 20_000
      || typeof durationSeconds !== "number"
      || !Number.isFinite(durationSeconds)
      || durationSeconds <= 0
      || durationSeconds > 4 * 60 * 60
    ) throw new Error("Substack accepted Note attachment changed shape");
    return Object.freeze({
      noteId,
      attachment: Object.freeze({
        id,
        kind: "video" as const,
        mediaUploadId: substackMediaUploadIdentifier(
          value.attachment.mediaUploadId,
          "Substack accepted Note attachment.mediaUploadId",
        ),
        durationSeconds,
        height,
        width,
        mediaType: "video/mp4" as const,
      }),
    });
  }
  requireExactKeys(
    value.attachment,
    ["height", "id", "mediaType", "url", "width"],
    "Substack accepted Note attachment",
  );
  const width = positiveInteger(
    value.attachment.width,
    "Substack accepted Note attachment.width",
  );
  const height = positiveInteger(
    value.attachment.height,
    "Substack accepted Note attachment.height",
  );
  if (width > 20_000 || height > 20_000 || value.attachment.mediaType !== "image/png") {
    throw new Error("Substack accepted Note attachment changed shape");
  }
  return Object.freeze({
    noteId,
    attachment: Object.freeze({
      id,
      kind: "image" as const,
      url: exactSubstackImageUrl(
        value.attachment.url,
        width,
        height,
        "Substack accepted Note attachment.url",
      ),
      height,
      width,
      mediaType: "image/png" as const,
    }),
  });
}

/** Read only the exact provider-accepted Substack Note target; never dispatch. */
export async function readSubstackWebAcceptedNoteTargetPresence(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  acceptedIdentifier: string,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  } = {},
): Promise<Readonly<{ present: true; noteId: number }>> {
  if (
    recipe.site !== "substack"
    || !(
      (recipe.action === "posts.publish" && recipe.contractVersion === 3)
      || (recipe.action === "media.publish" && recipe.contractVersion === 1)
    )
  ) throw new Error(
    "Substack accepted Note readback supports only posts.publish@3 or media.publish@1",
  );
  requireExactInputKeys(input, ["body", "media"]);
  const body = noteBodyInput(input);
  const media = input.media === undefined ? null : fileInput(input.media);
  const target = parseSubstackAcceptedNoteTarget(acceptedIdentifier);
  if ((media !== null) !== (target.attachment !== null)) {
    throw new Error("Substack accepted Note target did not bind the confirmed media input");
  }
  const client = await createWebSessionClient(SUBSTACK_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  const viewer = await requireBoundViewer(client, auth, recipe.maxOutputBytes);
  const readbackUrl = new URL(
    `/api/v1/reader/comment/${target.noteId}`,
    SUBSTACK_ORIGIN,
  );
  authorizeSubstackWebReadRequest({
    operation: "posts.note",
    url: readbackUrl,
    method: "GET",
    targetId: target.noteId,
  });
  const note = normalizeSubstackNoteResponse(await client.requestJson({
    url: readbackUrl,
    method: "GET",
    headers: jsonHeaders(),
    maxBytes: boundedMaximum(recipe),
  }), target.noteId) as ProjectedSubstackNote;
  assertSubstackNoteReadback(
    note,
    target.noteId,
    viewer,
    body,
    target.attachment === null
      ? null
      : target.attachment.kind === "image"
        ? {
            kind: "image" as const,
            attachment: { id: target.attachment.id, url: target.attachment.url },
            height: target.attachment.height,
            width: target.attachment.width,
          }
        : {
            kind: "video" as const,
            attachment: {
              id: target.attachment.id,
              mediaUploadId: target.attachment.mediaUploadId,
            },
          },
  );
  return Object.freeze({ present: true as const, noteId: target.noteId });
}

async function executeSubstackPost(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  viewer: SubstackWebViewer,
  input: OperationInput,
  options: {
    readonly fileResolver?: BrowserFileResolver;
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly sleep: SubstackWebSleep;
  },
): Promise<WebSessionExecution> {
  requireExactInputKeys(input, ["body", "media"]);
  const body = noteBodyInput(input);
  const bodyJson = substackBodyJson(body);
  if (viewer.handle === null) {
    throw new Error("Substack Note publication requires the bound viewer's public handle");
  }
  const image = input.media === undefined
    ? null
    : await materializeSubstackImage(
        fileInput(input.media),
        options.fileResolver,
        options.operationDeadline,
      );
  const reboundViewer = await currentViewer(client, boundedMaximum(recipe));
  if (viewerSubject(reboundViewer) !== viewerSubject(viewer)) {
    throw new Error("Substack current viewer changed before the Note dispatch");
  }
  if (reboundViewer.handle === null) {
    throw new Error("Substack Note publication requires the bound viewer's public handle");
  }
  let started = 0;
  let verified = 0;
  let noteId: number | null = null;
  let attachment: SubstackImageAttachment | null = null;
  let failureStage: SubstackPostFailureStage = "dispatch-admission";
  try {
    failureStage = "image-upload";
    attachment = image === null ? null : await uploadSubstackImage(client, image);
    failureStage = "dispatch-admission";
    await options.beforeDispatch?.(substackDispatchEvent("posts.publish", started, verified));
    started = 1;
    failureStage = "note-create-transport";
    let createdNoteResponse: unknown;
    try {
      createdNoteResponse = await client.requestJson({
        url: new URL("/api/v1/comment/feed", SUBSTACK_ORIGIN),
        method: "POST",
        headers: jsonPostHeaders(),
        body: JSON.stringify({
          bodyJson,
          ...(attachment === null ? {} : { attachmentIds: [attachment.id] }),
          tabId: "for-you",
          surface: "feed",
          replyMinimumRole: "everyone",
        }),
        expectedStatuses: [200],
        expectedContentTypes: ["application/json"],
        maxBytes: boundedMaximum(recipe),
      });
    } catch (error) {
      failureStage = substackNoteCreateRequestFailureStage(error);
      throw error;
    }
    try {
      noteId = parseCreatedSubstackNote(
        createdNoteResponse,
        reboundViewer,
        body,
        bodyJson,
        attachment === null
          ? null
          : { kind: "image", id: attachment.id, url: attachment.url },
      );
    } catch (error) {
      failureStage = error instanceof SubstackNoteCreateBindingError
        ? error.stage
        : "note-create-response-object";
      throw error;
    }
    failureStage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "posts.publish",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: canonicalJson({
          noteId,
          attachment: attachment === null
            ? null
            : {
                id: attachment.id,
                url: attachment.url,
                height: image!.height,
                width: image!.width,
                mediaType: image!.mediaType,
              },
        }),
      },
    });
    failureStage = "note-readback";
    const note = await readExactSubstackNoteAfterPublish(
      client,
      recipe,
      noteId,
      reboundViewer,
      body,
      attachment === null || image === null
        ? null
        : {
            kind: "image" as const,
            attachment: { id: attachment.id, url: attachment.url },
            height: image.height,
            width: image.width,
          },
      options,
    );
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(substackDispatchEvent("posts.publish", started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({
        note,
        attachment: image === null
          ? null
          : Object.freeze({
              height: image.height,
              mediaType: image.mediaType,
              width: image.width,
            }),
      }),
      finalUrl: substackNoteUrl(reboundViewer.handle, noteId),
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified },
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: noteId === null ? SUBSTACK_ORIGIN : substackNoteUrl(reboundViewer.handle, noteId),
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0
        ? `Substack may have accepted the image upload or Note but exact actor, text, attachment, and permalink readback was not verified; reconcile before retrying (stage: ${failureStage})`
        : `Substack Note dispatch failed before submission (stage: ${failureStage})`,
    };
  }
}

type SubstackMediaPublishFailureStage =
  | "dispatch-admission"
  | "video-attachment"
  | "video-part-transfer"
  | "video-processing"
  | "video-transcode"
  | "video-upload-init"
  | SubstackNoteCreateRequestFailureStage
  | SubstackNoteCreateBindingFailureStage
  | "accepted-target-recording"
  | "note-readback"
  | "verification-recording";

async function executeSubstackMediaPublish(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  viewer: SubstackWebViewer,
  input: OperationInput,
  options: {
    readonly fileResolver?: BrowserFileResolver;
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly sleep: SubstackWebSleep;
    readonly videoUploadFetch?: SubstackVideoUploadFetch;
  },
): Promise<WebSessionExecution> {
  requireExactInputKeys(input, ["body", "media"]);
  const body = noteBodyInput(input);
  const bodyJson = substackBodyJson(body);
  if (viewer.handle === null) {
    throw new Error("Substack Note publication requires the bound viewer's public handle");
  }
  const video = await materializeSubstackVideo(
    fileInput(input.media),
    options.fileResolver,
    options.operationDeadline,
  );
  const reboundViewer = await currentViewer(client, boundedMaximum(recipe));
  if (viewerSubject(reboundViewer) !== viewerSubject(viewer)) {
    throw new Error("Substack current viewer changed before the Note dispatch");
  }
  if (reboundViewer.handle === null) {
    throw new Error("Substack Note publication requires the bound viewer's public handle");
  }
  const injectedUploadFetch = options.videoUploadFetch;
  const uploadScope = injectedUploadFetch === undefined
    ? createPinnedHttpsFetchScope(SUBSTACK_VIDEO_UPLOAD_ORIGIN)
    : null;
  const videoUploadFetch: SubstackVideoUploadFetch = injectedUploadFetch
    ?? (async (request) => {
      const response = await uploadScope!.fetch(request.url, {
        method: "PUT",
        redirect: "error",
        body: request.body.slice().buffer,
        signal: request.signal,
      }, request.timeoutMs);
      const etag = response.headers.get("etag");
      await response.arrayBuffer();
      return Object.freeze({ status: response.status, etag });
    });
  let started = 0;
  let verified = 0;
  let noteId: number | null = null;
  let attachment: SubstackVideoAttachment | null = null;
  let failureStage: SubstackMediaPublishFailureStage = "dispatch-admission";
  try {
    failureStage = "video-upload-init";
    attachment = await uploadSubstackVideo(
      client,
      video,
      reboundViewer.id,
      videoUploadFetch,
      { ...options, setFailureStage: (stage) => { failureStage = stage; } },
    );
    failureStage = "dispatch-admission";
    await options.beforeDispatch?.(substackDispatchEvent("media.publish", started, verified));
    started = 1;
    failureStage = "note-create-transport";
    let createdNoteResponse: unknown;
    try {
      createdNoteResponse = await client.requestJson({
        url: new URL("/api/v1/comment/feed", SUBSTACK_ORIGIN),
        method: "POST",
        headers: jsonPostHeaders(),
        body: JSON.stringify({
          bodyJson,
          attachmentIds: [attachment.id],
          tabId: "for-you",
          surface: "feed",
          replyMinimumRole: "everyone",
        }),
        expectedStatuses: [200],
        expectedContentTypes: ["application/json"],
        maxBytes: boundedMaximum(recipe),
      });
    } catch (error) {
      failureStage = substackNoteCreateRequestFailureStage(error);
      throw error;
    }
    try {
      noteId = parseCreatedSubstackNote(
        createdNoteResponse,
        reboundViewer,
        body,
        bodyJson,
        { kind: "video", id: attachment.id, mediaUploadId: attachment.mediaUploadId },
      );
    } catch (error) {
      failureStage = error instanceof SubstackNoteCreateBindingError
        ? error.stage
        : "note-create-response-object";
      throw error;
    }
    failureStage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "media.publish",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: canonicalJson({
          noteId,
          attachment: {
            id: attachment.id,
            mediaUploadId: attachment.mediaUploadId,
            durationSeconds: video.durationSeconds,
            height: video.height,
            width: video.width,
            mediaType: video.mediaType,
          },
        }),
      },
    });
    failureStage = "note-readback";
    const note = await readExactSubstackNoteAfterPublish(
      client,
      recipe,
      noteId,
      reboundViewer,
      body,
      {
        kind: "video" as const,
        attachment: {
          id: attachment.id,
          mediaUploadId: attachment.mediaUploadId,
        },
      },
      options,
    );
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(substackDispatchEvent("media.publish", started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({
        note,
        attachment: Object.freeze({
          durationSeconds: video.durationSeconds,
          height: video.height,
          mediaType: video.mediaType,
          width: video.width,
        }),
      }),
      finalUrl: substackNoteUrl(reboundViewer.handle, noteId),
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified },
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: noteId === null ? SUBSTACK_ORIGIN : substackNoteUrl(reboundViewer.handle, noteId),
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0
        ? `Substack may have accepted the video upload or Note but exact actor, text, attachment, and permalink readback was not verified; reconcile before retrying (stage: ${failureStage})`
        : `Substack Note dispatch failed before submission (stage: ${failureStage})`,
    };
  } finally {
    uploadScope?.close();
  }
}

type SubstackDeleteFailureStage =
  | "accepted-target-recording"
  | "delete-readback"
  | "delete-transport"
  | "dispatch-admission"
  | "verification-recording";

// ---------------------------------------------------------------------------
// Substack article comments and Note/comment replies (comments.create@1,
// replies.create@1).
// ---------------------------------------------------------------------------

function substackCommentText(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 1_000
    || /[\0\r]/u.test(value)
  ) throw new Error(`${label} must be bounded Substack comment text`);
  return value;
}

type SubstackCommentCreatePlan = Readonly<{
  articleId: number;
  publicationId: number;
  body: string;
}>;

export function prepareSubstackCommentCreateInput(
  input: OperationInput,
): SubstackCommentCreatePlan {
  requireExactInputKeys(input, ["article_id", "publication_id", "body"]);
  return Object.freeze({
    articleId: positiveIdInput(input, "article_id"),
    publicationId: positiveIdInput(input, "publication_id"),
    body: substackCommentText(input.body, "input.body"),
  });
}

type SubstackReplyParentType = "note" | "comment";

type SubstackReplyCreatePlan = Readonly<{
  parentType: SubstackReplyParentType;
  parentId: number;
  body: string;
}>;

export function prepareSubstackReplyCreateInput(
  input: OperationInput,
): SubstackReplyCreatePlan {
  requireExactInputKeys(input, ["parent_type", "parent_id", "body"]);
  const parentType = input.parent_type;
  if (parentType === "chat") {
    throw new Error("Substack chat replies remain capture-required");
  }
  if (parentType !== "note" && parentType !== "comment") {
    throw new Error("input.parent_type must name note, comment, or chat");
  }
  if (
    typeof input.parent_id !== "string"
    || !/^[1-9][0-9]{0,15}$/u.test(input.parent_id)
  ) throw new Error("input.parent_id must be a decimal Substack entity ID");
  return Object.freeze({
    parentType,
    parentId: positiveInteger(Number(input.parent_id), "input.parent_id"),
    body: substackCommentText(input.body, "input.body"),
  });
}

type SubstackArticleWriteContext = Readonly<{
  origin: string;
  canonicalUrl: string | null;
}>;

/** Bind the exact article and publication before selecting its write origin. */
async function resolveSubstackArticleWriteContext(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  articleId: number,
  publicationId: number,
): Promise<SubstackArticleWriteContext> {
  const url = new URL(`/api/v1/posts/by-id/${articleId}`, SUBSTACK_ORIGIN);
  authorizeSubstackWebReadRequest({
    operation: "articles.read",
    url,
    method: "GET",
    targetId: articleId,
  });
  const article = normalizeSubstackArticleResponse(
    await client.requestJson({
      url,
      method: "GET",
      headers: jsonHeaders(),
      expectedStatuses: [200],
      expectedContentTypes: ["application/json"],
      maxBytes: boundedMaximum(recipe),
    }),
    articleId,
  ) as {
    readonly post: Readonly<{
      readonly publicationId: number;
      readonly canonicalUrl: string | null;
    }>;
    readonly publication: Readonly<{ readonly subdomain: string | null }> | null;
  };
  if (article.post.publicationId !== publicationId) {
    throw new Error("Substack article did not bind the confirmed publication");
  }
  const subdomain = article.publication?.subdomain;
  if (
    typeof subdomain !== "string"
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(subdomain)
  ) throw new Error("Substack article publication did not expose a reviewed subdomain");
  return Object.freeze({
    origin: `https://${subdomain}.substack.com`,
    canonicalUrl: article.post.canonicalUrl,
  });
}

type ProjectedSubstackCommentEntity = Readonly<{
  id: number;
  userId: number;
  publicationId: number | null;
  postId: number | null;
  body: string;
  type: string | null;
  ancestorPath: string | null;
}>;

type ProjectedSubstackComment = Readonly<{
  entityKey: string | null;
  comment: ProjectedSubstackCommentEntity;
  post: unknown | null;
  publication: Readonly<{ readonly subdomain: string | null }> | null;
}>;

/** Bind one exact comment entity to the confirmed request. */
function assertSubstackCommentEntity(
  projected: ProjectedSubstackComment,
  expected: {
    readonly commentId: number;
    readonly userId: number;
    readonly postId: number | null;
    readonly publicationId: number | null;
    readonly body: string;
    readonly parentId: number | null;
  },
  label: string,
): void {
  const comment = projected.comment;
  if (
    comment.id !== expected.commentId
    || comment.userId !== expected.userId
    || comment.postId !== expected.postId
    || comment.publicationId !== expected.publicationId
    || comment.body !== expected.body
  ) throw new Error(`${label} did not bind the confirmed comment`);
  assertSubstackAncestorPath(comment.ancestorPath, expected.parentId, label);
}

function substackAncestorPathText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 4_096) {
    throw new Error(`${label} must be bounded ancestor-path text`);
  }
  return value;
}

function assertSubstackAncestorPath(
  ancestorPath: string | null,
  parentId: number | null,
  label: string,
): void {
  if (parentId === null) {
    if (ancestorPath !== null && !/^\s*\/?\s*$/u.test(ancestorPath)) {
      throw new Error(`${label} returned an ancestor path for a top-level comment`);
    }
    return;
  }
  if (ancestorPath === null || ancestorPath.length > 4_096) {
    throw new Error(`${label} omitted the reply ancestor path`);
  }
  const segments = ancestorPath.split(/[^0-9]+/u).filter((part) => part.length > 0);
  if (!segments.includes(String(parentId))) {
    throw new Error(`${label} did not bind the confirmed parent in its ancestor path`);
  }
}

type SubstackCommentCreateFailureStage =
  | "dispatch-admission"
  | "article-preflight"
  | "parent-preflight"
  | "comment-create-transport"
  | "comment-create-response-object"
  | "comment-create-response-fields"
  | "comment-create-actor"
  | "comment-create-body"
  | "comment-create-kind"
  | "comment-create-parent-post"
  | "comment-create-publication"
  | "comment-create-parent"
  | "comment-create-deleted-state"
  | "comment-create-id"
  | "accepted-target-recording"
  | "comment-readback"
  | "verification-recording";

const CREATED_COMMENT_KEYS = Object.freeze([
  ...CREATED_NOTE_KEYS,
  "body_html",
  "can_moderate",
  "children",
  "comment_count",
  "metadata",
  "parent_id",
  "parent_children",
  "post",
  "ranking_detail",
  "reaction",
  "reactor_names",
  "top_parent_id",
]);

class SubstackCommentCreateBindingError extends Error {
  constructor(
    readonly stage: SubstackCommentCreateFailureStage,
    message: string,
  ) {
    super(message);
    this.name = "SubstackCommentCreateBindingError";
  }
}

function commentCreateBindingFailure(
  stage: SubstackCommentCreateFailureStage,
  message: string,
): never {
  throw new SubstackCommentCreateBindingError(stage, message);
}

/** Parse the created-comment response into its exact accepted identifier. */
function parseCreatedSubstackComment(
  value: unknown,
  viewer: SubstackWebViewer,
  expected: {
    readonly body: string;
    readonly postId: number | null;
    readonly publicationId: number | null;
    readonly parentId: number | null;
    readonly noteKind: boolean;
  },
): number {
  if (!isRecord(value)) {
    commentCreateBindingFailure(
      "comment-create-response-object",
      "Substack comment create response must be an object",
    );
  }
  try {
    requireAllowedKeys(value, CREATED_COMMENT_KEYS, "Substack comment create response");
  } catch {
    commentCreateBindingFailure(
      "comment-create-response-fields",
      "Substack comment create response fields changed",
    );
  }
  if (value.user_id !== viewer.id) {
    commentCreateBindingFailure(
      "comment-create-actor",
      "Substack comment create response did not bind the confirmed actor",
    );
  }
  if (value.body !== expected.body) {
    commentCreateBindingFailure(
      "comment-create-body",
      "Substack comment create response did not bind the confirmed body",
    );
  }
  if (
    expected.noteKind
    && value.type !== undefined
    && value.type !== null
    && value.type !== "feed"
    && value.type !== "comment"
  ) {
    commentCreateBindingFailure(
      "comment-create-kind",
      "Substack reply create response did not bind the confirmed Note kind",
    );
  }
  if (value.post_id !== expected.postId) {
    commentCreateBindingFailure(
      "comment-create-parent-post",
      "Substack comment create response did not bind the confirmed post",
    );
  }
  if (value.publication_id !== expected.publicationId) {
    commentCreateBindingFailure(
      "comment-create-publication",
      "Substack comment create response did not bind the confirmed publication",
    );
  }
  if (
    value.parent_id !== undefined
    && value.parent_id !== expected.parentId
  ) {
    commentCreateBindingFailure(
      "comment-create-parent",
      "Substack comment create response did not bind the confirmed parent",
    );
  }
  try {
    assertSubstackAncestorPath(
      value.ancestor_path === null || value.ancestor_path === undefined
        ? null
        : substackAncestorPathText(value.ancestor_path, "Substack create ancestor_path"),
      expected.parentId,
      "Substack comment create response",
    );
  } catch {
    commentCreateBindingFailure(
      "comment-create-parent",
      "Substack comment create response did not bind the confirmed parent",
    );
  }
  if (value.deleted !== undefined && value.deleted !== false) {
    commentCreateBindingFailure(
      "comment-create-deleted-state",
      "Substack comment create response returned a deleted comment",
    );
  }
  try {
    return positiveInteger(value.id, "Substack comment create response.id");
  } catch {
    commentCreateBindingFailure(
      "comment-create-id",
      "Substack comment create response did not return a valid comment identifier",
    );
  }
}

/** Read back one exact created comment through the global reader endpoint. */
async function readExactSubstackComment(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  commentId: number,
): Promise<ProjectedSubstackComment> {
  const url = new URL(`/api/v1/reader/comment/${commentId}`, SUBSTACK_ORIGIN);
  authorizeSubstackWebReadRequest({
    operation: "posts.note",
    url,
    method: "GET",
    targetId: commentId,
  });
  return normalizeSubstackNoteResponse(
    await client.requestJson({
      url,
      method: "GET",
      headers: jsonHeaders(),
      maxBytes: boundedMaximum(recipe),
    }),
    commentId,
  ) as ProjectedSubstackComment;
}

async function readExactSubstackCommentAfterCreate(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  expected: {
    readonly commentId: number;
    readonly userId: number;
    readonly postId: number | null;
    readonly publicationId: number | null;
    readonly body: string;
    readonly parentId: number | null;
  },
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly sleep: SubstackWebSleep;
  },
): Promise<ProjectedSubstackComment> {
  for (let attempt = 0; attempt <= SUBSTACK_NOTE_READBACK_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await waitForSubstackNoteReadback(
        SUBSTACK_NOTE_READBACK_DELAYS_MS[attempt - 1]!,
        options.sleep,
        options.signal,
        options.operationDeadline,
      );
    }
    try {
      const comment = await readExactSubstackComment(client, recipe, expected.commentId);
      assertSubstackCommentEntity(comment, expected, "Substack comment readback");
      return comment;
    } catch {
      options.operationDeadline?.throwIfUnavailable(
        "authenticated web operation deadline",
      );
      if (options.signal?.aborted === true) {
        throw new Error("Substack comment readback was cancelled");
      }
      if (attempt === SUBSTACK_NOTE_READBACK_DELAYS_MS.length) {
        throw new Error("Substack exact comment readback exhausted its reviewed window");
      }
    }
  }
  throw new Error("Substack exact comment readback exhausted its reviewed window");
}

type SubstackAcceptedCommentTarget = Readonly<{
  commentId: number;
  postId: number | null;
  publicationId: number | null;
  parentId: number | null;
}>;

function substackAcceptedCommentTargetIdentifier(
  target: SubstackAcceptedCommentTarget,
): string {
  return canonicalJson(target);
}

function parseSubstackAcceptedCommentTarget(
  identifier: unknown,
): SubstackAcceptedCommentTarget {
  if (
    typeof identifier !== "string"
    || identifier.length < 1
    || identifier.length > 8_192
    || /[\0\r\n]/u.test(identifier)
  ) throw new Error("Substack accepted comment target must be bounded canonical JSON");
  let value: unknown;
  try {
    value = JSON.parse(identifier) as unknown;
  } catch {
    throw new Error("Substack accepted comment target must be bounded canonical JSON");
  }
  if (!isRecord(value)) throw new Error("Substack accepted comment target changed shape");
  requireExactKeys(
    value,
    ["commentId", "postId", "publicationId", "parentId"],
    "Substack accepted comment target",
  );
  if (!isCanonicalJsonText(identifier, value)) {
    throw new Error("Substack accepted comment target must use canonical JSON");
  }
  const optionalId = (field: unknown, label: string): number | null => {
    if (field === null) return null;
    return positiveInteger(field, label);
  };
  return Object.freeze({
    commentId: positiveInteger(value.commentId, "Substack accepted comment target.commentId"),
    postId: optionalId(value.postId, "Substack accepted comment target.postId"),
    publicationId: optionalId(value.publicationId, "Substack accepted comment target.publicationId"),
    parentId: optionalId(value.parentId, "Substack accepted comment target.parentId"),
  });
}

function substackCommentDispatchEvent(
  action: "comments.create" | "replies.create",
  started: number,
  verified: number,
): WebSessionDispatchEvent {
  return {
    id: action,
    index: 1,
    progress: { planned: 1, started, verified },
  };
}

/** Read only the exact provider-accepted comment or reply target; never dispatch. */
export async function readSubstackWebAcceptedCommentTargetPresence(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  acceptedIdentifier: string,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  } = {},
): Promise<Readonly<{ present: true; commentId: number }>> {
  if (
    recipe.site !== "substack"
    || (recipe.action !== "comments.create" && recipe.action !== "replies.create")
    || recipe.contractVersion !== 1
  ) throw new Error("Substack accepted comment readback supports only comments.create@1 and replies.create@1");
  const target = parseSubstackAcceptedCommentTarget(acceptedIdentifier);
  const client = await createWebSessionClient(SUBSTACK_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  const viewer = await requireBoundViewer(client, auth, recipe.maxOutputBytes);
  const body = recipe.action === "comments.create"
    ? prepareSubstackCommentCreateInput(input).body
    : prepareSubstackReplyCreateInput(input).body;
  const projected = await readExactSubstackComment(client, recipe, target.commentId);
  assertSubstackCommentEntity(projected, {
    commentId: target.commentId,
    userId: viewer.id,
    postId: target.postId,
    publicationId: target.publicationId,
    body,
    parentId: target.parentId,
  }, "Substack accepted comment readback");
  return Object.freeze({ present: true as const, commentId: target.commentId });
}

/** Publish one confirmed top-level comment on the exact bound article. */
async function executeSubstackCommentCreate(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  viewer: SubstackWebViewer,
  auth: GhostgetAuth,
  input: OperationInput,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly sleep: SubstackWebSleep;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  },
): Promise<WebSessionExecution> {
  const plan = prepareSubstackCommentCreateInput(input);
  let failureStage: SubstackCommentCreateFailureStage = "dispatch-admission";
  let context: SubstackArticleWriteContext;
  try {
    failureStage = "article-preflight";
    context = await resolveSubstackArticleWriteContext(
      client,
      recipe,
      plan.articleId,
      plan.publicationId,
    );
  } catch (error) {
    if (error instanceof SubstackCommentCreateBindingError) throw error;
    return {
      status: "failed",
      output: null,
      finalUrl: SUBSTACK_ORIGIN,
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 },
      error: `Substack comment dispatch failed before submission (stage: ${failureStage})`,
    };
  }
  const reboundViewer = await currentViewer(client, boundedMaximum(recipe));
  if (viewerSubject(reboundViewer) !== viewerSubject(viewer)) {
    throw new Error("Substack current viewer changed before the comment dispatch");
  }
  let started = 0;
  let verified = 0;
  let commentId: number | null = null;
  failureStage = "article-preflight";
  let publicationClient: WebSessionClient;
  try {
    publicationClient = await createWebSessionClient(context.origin, auth, {
      timeoutMs: recipe.timeoutMs,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.operationDeadline === undefined
        ? {}
        : { operationDeadline: options.operationDeadline }),
      ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
    });
  } catch {
    return {
      status: "failed",
      output: null,
      finalUrl: context.canonicalUrl ?? context.origin,
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 },
      error: `Substack comment dispatch failed before submission (stage: ${failureStage})`,
    };
  }
  failureStage = "dispatch-admission";
  try {
    await options.beforeDispatch?.(
      substackCommentDispatchEvent("comments.create", started, verified),
    );
    started = 1;
    failureStage = "comment-create-transport";
    const createdResponse = await publicationClient.requestJson({
      url: new URL(`/api/v1/post/${plan.articleId}/comment`, context.origin),
      method: "POST",
      headers: Object.freeze({
        ...jsonPostHeaders(),
        referer: `${context.origin}/`,
      }),
      body: JSON.stringify({ body: plan.body }),
      expectedStatuses: [200, 201],
      expectedContentTypes: ["application/json"],
      maxBytes: boundedMaximum(recipe),
    });
    try {
      commentId = parseCreatedSubstackComment(createdResponse, reboundViewer, {
        body: plan.body,
        postId: plan.articleId,
        publicationId: plan.publicationId,
        parentId: null,
        noteKind: false,
      });
    } catch (error) {
      failureStage = error instanceof SubstackCommentCreateBindingError
        ? error.stage
        : "comment-create-response-object";
      throw error;
    }
    failureStage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "comments.create",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: substackAcceptedCommentTargetIdentifier({
          commentId,
          postId: plan.articleId,
          publicationId: plan.publicationId,
          parentId: null,
        }),
      },
    });
    failureStage = "comment-readback";
    const comment = await readExactSubstackCommentAfterCreate(
      client,
      recipe,
      {
        commentId,
        userId: reboundViewer.id,
        postId: plan.articleId,
        publicationId: plan.publicationId,
        body: plan.body,
        parentId: null,
      },
      options,
    );
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(
      substackCommentDispatchEvent("comments.create", started, verified),
    );
    return {
      status: "succeeded",
      output: Object.freeze({ comment }),
      finalUrl: context.canonicalUrl ?? context.origin,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified },
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: context.canonicalUrl ?? context.origin,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0
        ? `Substack may have accepted the comment but exact actor, body, and target readback was not verified; reconcile before retrying (stage: ${failureStage})`
        : `Substack comment dispatch failed before submission (stage: ${failureStage})`,
    };
  }
}

/** Publish one confirmed reply beneath an exact Note or article comment. */
async function executeSubstackReplyCreate(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  viewer: SubstackWebViewer,
  auth: GhostgetAuth,
  input: OperationInput,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly sleep: SubstackWebSleep;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  },
): Promise<WebSessionExecution> {
  const plan = prepareSubstackReplyCreateInput(input);
  let failureStage: SubstackCommentCreateFailureStage = "dispatch-admission";
  let postId: number | null = null;
  let publicationId: number | null = null;
  let writeOrigin = SUBSTACK_ORIGIN;
  let finalUrl = SUBSTACK_ORIGIN;
  try {
    failureStage = "parent-preflight";
    const parent = await readExactSubstackComment(client, recipe, plan.parentId);
    if (plan.parentType === "note") {
      if (
        parent.comment.type !== "feed"
        || parent.comment.postId !== null
        || parent.comment.publicationId !== null
      ) throw new Error("Substack reply parent did not bind a Note entity");
      finalUrl = SUBSTACK_ORIGIN;
    } else {
      if (parent.comment.postId === null || parent.comment.publicationId === null) {
        throw new Error("Substack reply parent did not bind an article comment");
      }
      postId = parent.comment.postId;
      publicationId = parent.comment.publicationId;
      failureStage = "article-preflight";
      const context = await resolveSubstackArticleWriteContext(
        client,
        recipe,
        postId,
        publicationId,
      );
      writeOrigin = context.origin;
      finalUrl = context.canonicalUrl ?? context.origin;
    }
  } catch (error) {
    if (error instanceof SubstackCommentCreateBindingError) throw error;
    return {
      status: "failed",
      output: null,
      finalUrl,
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 },
      error: `Substack reply dispatch failed before submission (stage: ${failureStage})`,
    };
  }
  const reboundViewer = await currentViewer(client, boundedMaximum(recipe));
  if (viewerSubject(reboundViewer) !== viewerSubject(viewer)) {
    throw new Error("Substack current viewer changed before the reply dispatch");
  }
  let started = 0;
  let verified = 0;
  let replyId: number | null = null;
  let publicationClient: WebSessionClient | null = null;
  if (plan.parentType === "comment") {
    failureStage = "article-preflight";
    try {
      publicationClient = await createWebSessionClient(writeOrigin, auth, {
        timeoutMs: recipe.timeoutMs,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.operationDeadline === undefined
          ? {}
          : { operationDeadline: options.operationDeadline }),
        ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
      });
    } catch {
      return {
        status: "failed",
        output: null,
        finalUrl,
        dispatchStarted: false,
        dispatch: { planned: 1, started: 0, verified: 0 },
        error: `Substack reply dispatch failed before submission (stage: ${failureStage})`,
      };
    }
  }
  failureStage = "dispatch-admission";
  try {
    await options.beforeDispatch?.(
      substackCommentDispatchEvent("replies.create", started, verified),
    );
    started = 1;
    failureStage = "comment-create-transport";
    let createdResponse: unknown;
    if (plan.parentType === "note") {
      createdResponse = await client.requestJson({
        url: new URL("/api/v1/comment/feed", SUBSTACK_ORIGIN),
        method: "POST",
        headers: jsonPostHeaders(),
        body: JSON.stringify({
          bodyJson: substackBodyJson(plan.body),
          parent_id: plan.parentId,
        }),
        expectedStatuses: [200],
        expectedContentTypes: ["application/json"],
        maxBytes: boundedMaximum(recipe),
      });
    } else {
      if (publicationClient === null) throw new Error("Substack reply publication client was not prepared");
      createdResponse = await publicationClient.requestJson({
        url: new URL(`/api/v1/post/${postId}/comment`, writeOrigin),
        method: "POST",
        headers: Object.freeze({
          ...jsonPostHeaders(),
          referer: `${writeOrigin}/`,
        }),
        body: JSON.stringify({ body: plan.body, parent_id: plan.parentId }),
        expectedStatuses: [200, 201],
        expectedContentTypes: ["application/json"],
        maxBytes: boundedMaximum(recipe),
      });
    }
    try {
      replyId = parseCreatedSubstackComment(createdResponse, reboundViewer, {
        body: plan.body,
        postId,
        publicationId,
        parentId: plan.parentId,
        noteKind: plan.parentType === "note",
      });
    } catch (error) {
      failureStage = error instanceof SubstackCommentCreateBindingError
        ? error.stage
        : "comment-create-response-object";
      throw error;
    }
    failureStage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "replies.create",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: substackAcceptedCommentTargetIdentifier({
          commentId: replyId,
          postId,
          publicationId,
          parentId: plan.parentId,
        }),
      },
    });
    failureStage = "comment-readback";
    const reply = await readExactSubstackCommentAfterCreate(
      client,
      recipe,
      {
        commentId: replyId,
        userId: reboundViewer.id,
        postId,
        publicationId,
        body: plan.body,
        parentId: plan.parentId,
      },
      options,
    );
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(
      substackCommentDispatchEvent("replies.create", started, verified),
    );
    return {
      status: "succeeded",
      output: Object.freeze({ reply }),
      finalUrl: replyUrl(reboundViewer, plan, replyId, finalUrl),
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified },
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl: replyId === null ? finalUrl : replyUrl(reboundViewer, plan, replyId, finalUrl),
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0
        ? `Substack may have accepted the reply but exact actor, body, and parent readback was not verified; reconcile before retrying (stage: ${failureStage})`
        : `Substack reply dispatch failed before submission (stage: ${failureStage})`,
    };
  }
}

function replyUrl(
  viewer: SubstackWebViewer,
  plan: SubstackReplyCreatePlan,
  replyId: number,
  articleUrl: string,
): string {
  if (plan.parentType === "note" && viewer.handle !== null) {
    return substackNoteUrl(viewer.handle, replyId);
  }
  return articleUrl;
}

async function executeSubstackPersonalNoteDelete(
  client: WebSessionClient,
  recipe: WebSessionRecipe,
  viewer: SubstackWebViewer,
  input: OperationInput,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly sleep: SubstackWebSleep;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  },
): Promise<WebSessionExecution> {
  const plan = prepareSubstackPersonalNoteDeleteInput(input);
  const before = await readSubstackPersonalNoteDeletionPresence(
    client,
    recipe,
    plan.noteId,
    viewer.id,
    plan.expectedBody,
  );
  const finalUrl = viewer.handle === null
    ? SUBSTACK_ORIGIN
    : substackNoteUrl(viewer.handle, plan.noteId);
  if (!before.present) {
    return {
      status: "succeeded",
      output: Object.freeze({ deleted: true, noOp: true, noteId: plan.noteId }),
      finalUrl,
      noOp: true,
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 },
    };
  }

  const reboundViewer = await currentViewer(client, boundedMaximum(recipe));
  if (viewerSubject(reboundViewer) !== viewerSubject(viewer)) {
    throw new Error("Substack current viewer changed before the Note deletion dispatch");
  }
  const fresh = await readSubstackPersonalNoteDeletionPresence(
    client,
    recipe,
    plan.noteId,
    reboundViewer.id,
    plan.expectedBody,
  );
  if (!fresh.present) {
    return {
      status: "succeeded",
      output: Object.freeze({ deleted: true, noOp: true, noteId: plan.noteId }),
      finalUrl,
      noOp: true,
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 },
    };
  }
  if (fresh.target === null) {
    throw new Error("Substack deletion pre-read omitted its exact recovery target");
  }

  let started = 0;
  let verified = 0;
  let failureStage: SubstackDeleteFailureStage = "dispatch-admission";
  try {
    await options.beforeDispatch?.(substackDeleteDispatchEvent(started, verified));
    started = 1;
    failureStage = "delete-transport";
    await dispatchSubstackPersonalNoteDelete(client, plan.noteId, {
      timeoutMs: recipe.timeoutMs,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.operationDeadline === undefined
        ? {}
        : { operationDeadline: options.operationDeadline }),
      ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
    });
    failureStage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "content.delete",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: substackNoteDeletionRecoveryTargetIdentifier(fresh.target),
      },
    });
    failureStage = "delete-readback";
    let after = await readSubstackPersonalNoteDeletionPresence(
      client,
      recipe,
      plan.noteId,
      reboundViewer.id,
      plan.expectedBody,
    );
    for (const delay of SUBSTACK_NOTE_READBACK_DELAYS_MS) {
      if (!after.present) break;
      await waitForSubstackNoteReadback(
        delay,
        options.sleep,
        options.signal,
        options.operationDeadline,
      );
      after = await readSubstackPersonalNoteDeletionPresence(
        client,
        recipe,
        plan.noteId,
        reboundViewer.id,
        plan.expectedBody,
      );
    }
    if (after.present) {
      throw new Error("Substack exact Note deletion readback still returned the authored Note");
    }
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(substackDeleteDispatchEvent(started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({ deleted: true, noOp: false, noteId: plan.noteId }),
      finalUrl,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified },
    };
  } catch {
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0
        ? `Substack may have deleted the exact authored Note, but independent absence was not verified; reconcile before retrying (stage: ${failureStage})`
        : `Substack Note deletion failed before submission (stage: ${failureStage})`,
    };
  }
}

/** Independently read the exact confirmed personal Note's desired deletion state. */
export async function readSubstackWebContentDeleteDesiredState(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  } = {},
): Promise<Readonly<{ present: boolean; noteId: number }>> {
  if (
    recipe.site !== "substack"
    || recipe.action !== "content.delete"
    || recipe.contractVersion !== 1
  ) throw new Error("Substack deletion recovery supports only content.delete@1");
  const plan = prepareSubstackPersonalNoteDeleteInput(input);
  const client = await createWebSessionClient(SUBSTACK_ORIGIN, auth, {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  });
  const viewer = await requireBoundViewer(client, auth, recipe.maxOutputBytes);
  const presence = await readSubstackPersonalNoteDeletionPresence(
    client,
    recipe,
    plan.noteId,
    viewer.id,
    plan.expectedBody,
  );
  return Object.freeze({ present: presence.present, noteId: plan.noteId });
}

type SubstackSubscriberOperationName =
  | "subscribers.export"
  | "subscribers.import"
  | "subscribers.import.status";

const SUBSTACK_SUBSCRIBER_READ_LABEL = "Substack subscribers";
const SUBSTACK_SUBSCRIBER_CURSOR_SCOPE = "substack-subscribers-export-v2";
const MAX_SUBSTACK_IMPORT_RESPONSE_BYTES = 256 * 1024;
const MAX_SUBSTACK_OPERATION_NONCE_LENGTH = 128;

function isSubstackSubscriberOperation(
  value: string,
): value is SubstackSubscriberOperationName {
  return value === "subscribers.export"
    || value === "subscribers.import"
    || value === "subscribers.import.status";
}

type SubstackSubscriberPlan =
  | Readonly<{ kind: "subscribers.export"; plan: SubstackSubscriberExportPlan }>
  | Readonly<{ kind: "subscribers.import"; plan: SubstackSubscriberImportPlan }>
  | Readonly<{ kind: "subscribers.import.status"; publication: string }>;

/** Parse the complete subscriber input before any cookie, keychain, or network access. */
function prepareSubstackSubscriberPlan(
  operation: SubstackSubscriberOperationName,
  input: OperationInput,
): SubstackSubscriberPlan {
  switch (operation) {
    case "subscribers.export":
      return Object.freeze({ kind: operation, plan: prepareSubstackSubscriberExportInput(input) });
    case "subscribers.import":
      return Object.freeze({ kind: operation, plan: prepareSubstackSubscriberImportInput(input) });
    case "subscribers.import.status":
      return Object.freeze({
        kind: operation,
        publication: prepareSubstackSubscriberImportStatusInput(input),
      });
  }
}

function subscriberAccountMismatch(error: Error): boolean {
  return error.message.includes("no longer matches")
    || error.message.includes("viewer-owned publication")
    || error.message.includes("belongs to another publication");
}

function subscriberAuthRepairRequired(error: Error): boolean {
  return error.message.includes("auth locator bound")
    || error instanceof SubstackAuthRepairRequiredError;
}

function substackSubscriberDispatchEvent(
  started: number,
  verified: number,
): WebSessionDispatchEvent {
  return {
    id: "subscribers.import",
    index: 1,
    progress: { planned: 1, started, verified },
  };
}

/** Freeze one per-invocation import identity from the exact batch before dispatch. */
export function substackSubscriberImportOperationId(input: Readonly<{
  publicationId: number;
  viewerId: number;
  plan: SubstackSubscriberImportPlan;
  nonce: string;
}>): string {
  if (
    typeof input.nonce !== "string"
    || input.nonce.length < 1
    || input.nonce.length > MAX_SUBSTACK_OPERATION_NONCE_LENGTH
    || /[\0\r\n]/u.test(input.nonce)
  ) throw new Error("Substack subscriber import nonce must be bounded text");
  const plan = prepareSubstackSubscriberImportInput({
    publication: input.plan.publication,
    emails: [...input.plan.emails],
    send_welcome_email: input.plan.sendWelcomeEmail,
  });
  return createHash("sha256").update(canonicalJson({
    schemaVersion: 1,
    operation: "subscribers.import",
    publicationId: positiveInteger(input.publicationId, "Substack subscriber import publication"),
    viewerId: positiveInteger(input.viewerId, "Substack subscriber import viewer"),
    emails: [...plan.emails],
    sendWelcomeEmail: false,
    nonce: input.nonce,
  })).digest("hex");
}

type SubstackSubscriberImportFailureStage =
  | "dispatch-admission"
  | "import-transport"
  | "import-rejected"
  | "import-response"
  | "accepted-target-recording"
  | "verification-recording";

/** Prove the viewer is the selected publication's author and admin before any subscriber exchange. */
async function requireSubstackSubscriberOwner(
  publicationClient: WebSessionClient,
  recipe: WebSessionRecipe,
  viewer: SubstackWebViewer,
  publication: Readonly<{ id: number; origin: string; organization: string }>,
): Promise<void> {
  const identityUrl = new URL("/publish/subscribers", publication.origin);
  authorizeSubstackSubscriberRequest({
    operation: "subscribers.export.identity",
    url: identityUrl,
    method: "GET",
    organization: publication.organization,
    publicationOrigin: publication.origin,
  });
  requireSubstackSubscriberExportOwner(await publicationClient.requestText({
    url: identityUrl,
    method: "GET",
    headers: { accept: "text/html", referer: `${publication.origin}/` },
    expectedContentTypes: ["text/html"],
    maxBytes: boundedMaximum(recipe),
  }), { viewerId: viewer.id, publicationId: publication.id, organization: publication.organization });
}

/**
 * Execute one subscriber contract after complete input validation. The public
 * dispatcher reaches this only once the contract is observed; tests call it
 * directly to prove the implementation without live provider evidence.
 */
export async function executeSubstackSubscriberOperation(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  } = {},
): Promise<WebSessionExecution> {
  if (
    recipe.site !== "substack"
    || !isSubstackSubscriberOperation(recipe.action)
    || recipe.contractVersion !== 2
  ) throw new Error("Substack subscriber recipe is not installed");
  const selected = prepareSubstackSubscriberPlan(recipe.action, input);
  const cursorEnvironment = options.dependencies?.cursorEnvironment ?? process.env;
  const authHash = createHash("sha256").update(canonicalJson(auth)).digest("hex");
  let exportCursor: SubstackSubscriberCursor | null = null;
  if (selected.kind === "subscribers.export" && selected.plan.cursor !== null) {
    exportCursor = parseSubstackSubscriberCursor(openCursorToken(
      SUBSTACK_SUBSCRIBER_CURSOR_SCOPE,
      auth.id,
      authHash,
      selected.plan.cursor,
      cursorEnvironment,
      { maxTokenCharacters: SUBSTACK_SUBSCRIBER_CURSOR_MAX_TOKEN_CHARACTERS },
    ));
    if (webSessionAuthSubject(auth) !== `substack:${String(exportCursor.viewerId)}` || exportCursor.publicationOrigin !== `https://${selected.plan.publication}.substack.com`) {
      throw new Error("Substack subscriber cursor belongs to another publication or viewer");
    }
  }
  const clientOptions = {
    timeoutMs: recipe.timeoutMs,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    ...(options.operationDeadline === undefined
      ? {}
      : { operationDeadline: options.operationDeadline }),
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
  };
  const read = selected.kind !== "subscribers.import";

  let client: WebSessionClient;
  try {
    client = await createWebSessionClient(SUBSTACK_ORIGIN, auth, clientOptions);
  } catch (error) {
    if (!read) throw error;
    return failedProviderRead(SUBSTACK_SUBSCRIBER_READ_LABEL, error, null, {
      stage: "bootstrap",
      authenticated: true,
    });
  }
  let viewer: SubstackWebViewer;
  let publication: ReturnType<typeof selectSubstackSubscriberPublication>;
  try {
    viewer = await requireBoundViewer(client, auth, recipe.maxOutputBytes);
    publication = selectSubstackSubscriberPublication(
      viewer,
      selected.kind === "subscribers.import.status" ? selected.publication : selected.plan.publication,
    );
  } catch (error) {
    if (!read) throw error;
    return failedProviderRead(SUBSTACK_SUBSCRIBER_READ_LABEL, error, null, {
      stage: "identity",
      authenticated: true,
      accountMismatch: subscriberAccountMismatch,
      authRepairRequired: subscriberAuthRepairRequired,
    });
  }
  const finalUrl = `${publication.origin}/publish/subscribers`;
  const referer = Object.freeze({
    accept: "application/json",
    referer: finalUrl,
  });
  const postHeaders = Object.freeze({
    ...referer,
    "content-type": "application/json",
  });

  if (selected.kind === "subscribers.export" || selected.kind === "subscribers.import.status") {
    try {
      const publicationClient = await createWebSessionClient(
        publication.origin,
        auth,
        clientOptions,
      );
      let output: unknown;
      await requireSubstackSubscriberOwner(publicationClient, recipe, viewer, publication);
      if (selected.kind === "subscribers.export") {
        const cursor = exportCursor;
        if (cursor !== null && (cursor.publicationId !== publication.id || cursor.publicationOrigin !== publication.origin || cursor.viewerId !== viewer.id)) {
          throw new Error("Substack subscriber cursor belongs to another publication or viewer");
        }
        const offset = cursor?.offset ?? 0;
        const limit = Math.min(selected.plan.limit, SUBSTACK_SUBSCRIBER_EXPORT_MAX_ROWS - offset);
        const body = substackSubscriberStatsRequestBody(offset, limit);
        const url = new URL("/api/v1/subscriber-stats", publication.origin);
        authorizeSubstackSubscriberRequest({
          operation: "subscribers.export",
          url,
          method: "POST",
          body,
          organization: publication.organization,
          publicationOrigin: publication.origin,
        });
        const page = normalizeSubstackSubscriberPage(await publicationClient.requestJson({
          url,
          method: "POST",
          headers: postHeaders,
          body: JSON.stringify(body),
          expectedStatuses: [200],
          expectedContentTypes: ["application/json"],
          maxBytes: boundedMaximum(recipe),
        }), {
          publicationId: publication.id,
          publicationOrigin: publication.origin,
          viewerId: viewer.id,
          offset,
          limit,
          total: cursor?.total ?? null,
          seenFingerprints: cursor?.seenFingerprints ?? "",
        });
        output = Object.freeze({
          ...page,
          nextCursor: page.nextCursor === null ? null : sealCursorToken(
            SUBSTACK_SUBSCRIBER_CURSOR_SCOPE,
            auth.id,
            authHash,
            page.nextCursor,
            cursorEnvironment,
            { maxTokenCharacters: SUBSTACK_SUBSCRIBER_CURSOR_MAX_TOKEN_CHARACTERS },
          ),
        });
      } else {
        const url = new URL("/api/v1/import/instances", publication.origin);
        authorizeSubstackSubscriberRequest({
          operation: "subscribers.import.status",
          url,
          method: "GET",
          organization: publication.organization,
          publicationOrigin: publication.origin,
        });
        output = normalizeSubstackSubscriberImportInstances(await publicationClient.requestJson({
          url,
          method: "GET",
          headers: referer,
          expectedStatuses: [200],
          expectedContentTypes: ["application/json"],
          maxBytes: boundedMaximum(recipe),
        }));
      }
      return {
        status: "succeeded",
        output,
        finalUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
      };
    } catch (error) {
      return failedProviderRead(SUBSTACK_SUBSCRIBER_READ_LABEL, error, finalUrl, {
        stage: "target",
        authenticated: true,
        accountMismatch: subscriberAccountMismatch,
      });
    }
  }

  const plan = selected.plan;
  const operationId = substackSubscriberImportOperationId({
    publicationId: publication.id,
    viewerId: viewer.id,
    plan,
    nonce: (options.dependencies?.operationNonce ?? randomUUID)(),
  });
  const body = substackSubscriberImportRequestBody(plan);
  const url = new URL("/api/v1/subscriber/add", publication.origin);
  authorizeSubstackSubscriberRequest({
    operation: "subscribers.import",
    url,
    method: "POST",
    body,
    organization: publication.organization,
    publicationOrigin: publication.origin,
  });
  const publicationClient = await createWebSessionClient(
    publication.origin,
    auth,
    clientOptions,
  );
  await requireSubstackSubscriberOwner(publicationClient, recipe, viewer, publication);
  const reboundViewer = await currentViewer(client, boundedMaximum(recipe));
  if (
    viewerSubject(reboundViewer) !== viewerSubject(viewer)
    || selectSubstackSubscriberPublication(reboundViewer, plan.publication).id !== publication.id
  ) {
    throw new Error("Substack current viewer or publication changed before the subscriber import");
  }
  let started = 0;
  let verified = 0;
  let failureStage: SubstackSubscriberImportFailureStage = "dispatch-admission";
  try {
    await options.beforeDispatch?.(substackSubscriberDispatchEvent(started, verified));
    started = 1;
    failureStage = "import-transport";
    const response = await publicationClient.requestJson({
      url,
      method: "POST",
      headers: postHeaders,
      body: JSON.stringify(body),
      expectedStatuses: [200],
      expectedContentTypes: ["application/json"],
      maxBytes: Math.min(boundedMaximum(recipe), MAX_SUBSTACK_IMPORT_RESPONSE_BYTES),
    });
    failureStage = "import-response";
    if (!isRecord(response) || Object.keys(response).length !== 0) {
      throw new Error("Substack subscriber add response changed its reviewed empty-object shape");
    }
    failureStage = "accepted-target-recording";
    await options.afterProviderAcceptedMutationTarget?.({
      id: "subscribers.import",
      index: 1,
      target: {
        schemaVersion: 1,
        identifier: canonicalJson({
          emailCount: plan.emails.length,
          operationId,
          publicationId: publication.id,
        }),
      },
    });
    verified = 1;
    failureStage = "verification-recording";
    await options.afterDispatchVerified?.(substackSubscriberDispatchEvent(started, verified));
    return {
      status: "succeeded",
      output: Object.freeze({ accepted: true, operationId }),
      finalUrl,
      dispatchStarted: true,
      dispatch: { planned: 1, started, verified },
    };
  } catch (error) {
    // A started dispatch can never finish as failed (run-journal invariant), so
    // even a 4xx on the add request stays indeterminate. The stage and status
    // code say what Substack answered without echoing its body.
    const rejectedStatus = failureStage === "import-transport"
      && error instanceof WebSessionResponseRejectedError
      && error.status >= 400
      && error.status < 500
      ? error.status
      : null;
    if (rejectedStatus !== null) failureStage = "import-rejected";
    const stage = rejectedStatus === null
      ? failureStage
      : `${failureStage}, HTTP ${String(rejectedStatus)}`;
    return {
      status: started > 0 ? "indeterminate" : "failed",
      output: null,
      finalUrl,
      dispatchStarted: started > 0,
      dispatch: { planned: 1, started, verified },
      error: started > 0
        ? `reconcile-required: Substack may have accepted subscriber import ${operationId}, but acceptance was not verified; read a fresh subscribers.export census and never retry this import (stage: ${stage})`
        : `Substack subscriber import failed before submission (stage: ${stage})`,
    };
  }
}

export async function executeSubstackWebOperation(
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: {
    readonly fileResolver?: BrowserFileResolver;
    readonly signal?: AbortSignal;
    readonly operationDeadline?: WebSessionOperationDeadline;
    readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly afterProviderAcceptedMutationTarget?: (
      event: WebSessionProviderAcceptedMutationTargetEvent,
    ) => Promise<void>;
    readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
    readonly dependencies?: SubstackWebRuntimeDependencies;
  } = {},
): Promise<WebSessionExecution> {
  if (
    recipe.site !== "substack"
    || !isSubstackOperation(recipe.action)
  ) throw new Error("Substack authenticated web recipe is not installed");
  const expectedContractVersion = recipe.action === "posts.publish"
    ? 3
    : isSubstackSubscriberOperation(recipe.action) ? 2 : 1;
  if (recipe.contractVersion !== expectedContractVersion) {
    throw new Error(
      `Substack authenticated web operation ${recipe.action} contract version ${recipe.contractVersion} is not installed`,
    );
  }
  const contract = SUBSTACK_WEB_OPERATIONS[recipe.action];
  if (contract.state !== "observed") {
    throw new Error(
      `Substack authenticated web operation ${recipe.action} is capture-required: ${contract.reason}`,
    );
  }
  if (
    recipe.action !== "feeds.read"
    && recipe.action !== "posts.read"
    && recipe.action !== "articles.read"
    && recipe.action !== "comments.read"
    && recipe.action !== "media.read"
    && recipe.action !== "messaging.list"
    && recipe.action !== "profiles.read"
    && recipe.action !== "organizations.read"
    && recipe.action !== "posts.publish"
    && recipe.action !== "media.publish"
    && recipe.action !== "content.delete"
    && recipe.action !== "comments.create"
    && recipe.action !== "replies.create"
    && !isSubstackSubscriberOperation(recipe.action)
  ) throw new Error(`Substack authenticated web operation ${recipe.action} has no executable reviewed contract`);
  if (isSubstackSubscriberOperation(recipe.action)) {
    return executeSubstackSubscriberOperation(recipe, input, auth, options);
  }

  const statisticsRead = recipe.action === "profiles.read"
    || recipe.action === "organizations.read";
  const statisticsFinalUrl = recipe.action === "profiles.read"
    ? `https://substack.com/@${substackProfileInput(input)}`
    : recipe.action === "organizations.read"
      ? `https://${substackOrganizationInput(input)}.substack.com/`
      : null;
  let client: WebSessionClient;
  try {
    client = await createWebSessionClient(SUBSTACK_ORIGIN, auth, {
      timeoutMs: recipe.timeoutMs,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.operationDeadline === undefined
        ? {}
        : { operationDeadline: options.operationDeadline }),
      ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
    });
  } catch (error) {
    if (!statisticsRead) throw error;
    return failedProviderRead("Substack statistics", error, statisticsFinalUrl, {
      stage: "bootstrap",
      authenticated: true,
    });
  }
  let viewer: SubstackWebViewer;
  try {
    viewer = await requireBoundViewer(client, auth, recipe.maxOutputBytes);
  } catch (error) {
    if (!statisticsRead) throw error;
    return failedProviderRead("Substack statistics", error, statisticsFinalUrl, {
      stage: "identity",
      authenticated: true,
      accountMismatch: (candidate) => candidate.message.includes("no longer matches"),
      authRepairRequired: (candidate) => candidate.message.includes("auth locator bound")
        || candidate instanceof SubstackAuthRepairRequiredError,
    });
  }
  if (statisticsRead) {
    try {
      const output = recipe.action === "profiles.read"
        ? await readProfile(
          client,
          recipe,
          viewer,
          input,
          options.dependencies?.now ?? Date.now,
        )
        : await readOrganization(recipe, input, auth, viewer, options);
      return {
        status: "succeeded",
        output,
        finalUrl: statisticsFinalUrl,
        dispatchStarted: false,
        dispatch: { planned: 0, started: 0, verified: 0 },
      };
    } catch (error) {
      return failedProviderRead("Substack statistics", error, statisticsFinalUrl, {
        stage: "target",
        authenticated: true,
        accountMismatch: (candidate) => candidate.message.includes("does not match the signed-in viewer")
          || candidate.message.includes("viewer-owned publication")
          || candidate.message.includes("did not bind the current viewer ID"),
      });
    }
  }
  if (recipe.action === "posts.publish") {
    return executeSubstackPost(client, recipe, viewer, input, {
      ...options,
      sleep: options.dependencies?.sleep ?? sleepForSubstackReadback,
    });
  }
  if (recipe.action === "media.publish") {
    return executeSubstackMediaPublish(client, recipe, viewer, input, {
      ...options,
      sleep: options.dependencies?.sleep ?? sleepForSubstackReadback,
      ...(options.dependencies?.videoUploadFetch === undefined
        ? {}
        : { videoUploadFetch: options.dependencies.videoUploadFetch }),
    });
  }
  if (recipe.action === "content.delete") {
    return executeSubstackPersonalNoteDelete(client, recipe, viewer, input, {
      ...options,
      sleep: options.dependencies?.sleep ?? sleepForSubstackReadback,
    });
  }
  if (recipe.action === "comments.create") {
    return executeSubstackCommentCreate(client, recipe, viewer, auth, input, {
      ...options,
      sleep: options.dependencies?.sleep ?? sleepForSubstackReadback,
    });
  }
  if (recipe.action === "replies.create") {
    return executeSubstackReplyCreate(client, recipe, viewer, auth, input, {
      ...options,
      sleep: options.dependencies?.sleep ?? sleepForSubstackReadback,
    });
  }
  // Executable Substack reads never enter the mutation dispatch ledger.
  void options.fileResolver;
  void options.beforeDispatch;
  void options.afterDispatchVerified;

  let output: unknown;
  let finalUrl = SUBSTACK_ORIGIN;
  switch (recipe.action) {
    case "feeds.read":
      output = await readFeed(client, recipe, input);
      break;
    case "posts.read":
      output = await readNote(client, recipe, input);
      break;
    case "articles.read":
      output = await readArticle(client, recipe, input, false);
      break;
    case "comments.read":
      output = await readComments(client, recipe, input);
      break;
    case "media.read":
      output = await readArticle(client, recipe, input, true);
      break;
    case "messaging.list":
      output = await listMessages(client, recipe, input);
      break;
  }
  return {
    status: "succeeded",
    output,
    finalUrl,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 },
  };
}
