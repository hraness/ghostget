import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { join } from "node:path";
import { hasExactKeys } from "./contracts-shape.js";

import {
  canonicalJson,
  isCanonicalJsonText,
} from "./canonical-json";
import {
  createPrivateJsonIfAbsent,
  readRegularFile,
  ghostgetStateHome,
} from "./storage";

const TOKEN_VERSION = "smn1";
const TOKEN_PREFIX = `${TOKEN_VERSION}.`;
const KEY_FILE_NAME = ".cursor-encryption-key";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MAX_KEY_FILE_BYTES = 128;
const DEFAULT_MAX_TOKEN_CHARACTERS = 8192;
const LARGEST_MAX_TOKEN_CHARACTERS = 65_536;

/**
 * Size bounds derived from one token-character ceiling. A scope that must carry
 * a larger sealed payload names its own ceiling on both seal and open; every
 * other scope keeps the default.
 */
export type CursorTokenOptions = Readonly<{ maxTokenCharacters?: number }>;

type CursorTokenLimits = Readonly<{
  tokenCharacters: number;
  envelopeBytes: number;
  plaintextBytes: number;
}>;

function cursorTokenLimits(options: CursorTokenOptions | undefined): CursorTokenLimits {
  const requested = options?.maxTokenCharacters ?? DEFAULT_MAX_TOKEN_CHARACTERS;
  if (
    !Number.isSafeInteger(requested)
    || requested < DEFAULT_MAX_TOKEN_CHARACTERS
    || requested > LARGEST_MAX_TOKEN_CHARACTERS
  ) {
    throw new Error("cursor-token size ceiling is outside its allowed range");
  }
  const envelopeBytes = Math.floor(((requested - TOKEN_PREFIX.length) * 3) / 4);
  return Object.freeze({
    tokenCharacters: requested,
    envelopeBytes,
    plaintextBytes: envelopeBytes - IV_BYTES - AUTH_TAG_BYTES,
  });
}

type Environment = Readonly<Record<string, string | undefined>>;

function invalidToken(message: "authentication failed" | "is malformed"): Error {
  return new Error(`cursor token ${message}`);
}

function validateCoordinates(
  scope: string,
  authId: string,
  authHash: string,
): void {
  if (
    typeof scope !== "string"
    || !/^[a-z][a-z0-9-]{0,47}$/u.test(scope)
  ) {
    throw new Error("cursor-token scope must be lowercase kebab-case");
  }
  if (
    typeof authId !== "string"
    || !/^[a-z][a-z0-9-]{0,47}$/u.test(authId)
  ) {
    throw new Error("cursor-token auth ID must be lowercase kebab-case");
  }
  if (
    typeof authHash !== "string"
    || !/^[a-f0-9]{64}$/u.test(authHash)
  ) {
    throw new Error("cursor-token auth hash is malformed");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keyPath(environment: Environment): string {
  return join(ghostgetStateHome(environment), KEY_FILE_NAME);
}

function cursorEncryptionKey(
  environment: Environment,
  createIfMissing: boolean,
): Buffer {
  const path = keyPath(environment);
  if (createIfMissing) {
    createPrivateJsonIfAbsent(path, {
      schemaVersion: 1,
      key: randomBytes(KEY_BYTES).toString("hex"),
    }, {
      environment,
      privateParent: true,
    });
  }
  const text = readRegularFile(path, MAX_KEY_FILE_BYTES, "cursor encryption key");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("cursor encryption key is malformed");
  }
  if (
    !isRecord(parsed)
    || !hasExactKeys(parsed, ["key", "schemaVersion"])
    || parsed.schemaVersion !== 1
    || typeof parsed.key !== "string"
    || !/^[a-f0-9]{64}$/u.test(parsed.key)
  ) {
    throw new Error("cursor encryption key is malformed");
  }
  return Buffer.from(parsed.key, "hex");
}

function additionalData(
  scope: string,
  authId: string,
  authHash: string,
): Buffer {
  return Buffer.from(
    `io-cursor-token\0${TOKEN_VERSION}\0${scope}\0${authId}\0${authHash}`,
    "utf8",
  );
}

function canonicalPayload(payload: unknown, limits: CursorTokenLimits): Buffer {
  let encoded: string;
  try {
    encoded = canonicalJson(payload);
  } catch {
    throw new Error("cursor-token payload must be JSON-compatible");
  }
  const bytes = Buffer.from(encoded, "utf8");
  if (bytes.byteLength > limits.plaintextBytes) {
    throw new Error("cursor-token payload exceeds its size bound");
  }
  return bytes;
}

function decodeEnvelope(token: string, limits: CursorTokenLimits): {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
} {
  if (
    typeof token !== "string"
    || token.length > limits.tokenCharacters
    || !token.startsWith(TOKEN_PREFIX)
  ) {
    throw invalidToken("is malformed");
  }
  const encoded = token.slice(TOKEN_PREFIX.length);
  if (encoded === "" || /[^A-Za-z0-9_-]/u.test(encoded)) {
    throw invalidToken("is malformed");
  }
  let envelope: Buffer;
  try {
    envelope = Buffer.from(encoded, "base64url");
  } catch {
    throw invalidToken("is malformed");
  }
  if (
    envelope.toString("base64url") !== encoded
    || envelope.byteLength <= IV_BYTES + AUTH_TAG_BYTES
    || envelope.byteLength > limits.envelopeBytes
  ) {
    throw invalidToken("is malformed");
  }
  return {
    iv: envelope.subarray(0, IV_BYTES),
    ciphertext: envelope.subarray(IV_BYTES, -AUTH_TAG_BYTES),
    tag: envelope.subarray(-AUTH_TAG_BYTES),
  };
}

export function sealCursorToken(
  scope: string,
  authId: string,
  authHash: string,
  payload: unknown,
  environment: Environment = process.env,
  options?: CursorTokenOptions,
): string {
  validateCoordinates(scope, authId, authHash);
  const limits = cursorTokenLimits(options);
  const plaintext = canonicalPayload(payload, limits);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    "aes-256-gcm",
    cursorEncryptionKey(environment, true),
    iv,
  );
  cipher.setAAD(additionalData(scope, authId, authHash));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope = Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
  const token = `${TOKEN_PREFIX}${envelope.toString("base64url")}`;
  if (token.length > limits.tokenCharacters) {
    throw new Error("cursor-token payload exceeds its size bound");
  }
  return token;
}

export function openCursorToken(
  scope: string,
  authId: string,
  authHash: string,
  token: string,
  environment: Environment = process.env,
  options?: CursorTokenOptions,
): unknown {
  validateCoordinates(scope, authId, authHash);
  const limits = cursorTokenLimits(options);
  const { ciphertext, iv, tag } = decodeEnvelope(token, limits);
  let plaintext: Buffer;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      cursorEncryptionKey(environment, false),
      iv,
    );
    decipher.setAAD(additionalData(scope, authId, authHash));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
  } catch {
    throw invalidToken("authentication failed");
  }
  if (plaintext.byteLength > limits.plaintextBytes) {
    throw invalidToken("is malformed");
  }
  let text: string;
  let payload: unknown;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    payload = JSON.parse(text) as unknown;
  } catch {
    throw invalidToken("is malformed");
  }
  try {
    if (!isCanonicalJsonText(text, payload)) {
      throw invalidToken("is malformed");
    }
  } catch {
    throw invalidToken("is malformed");
  }
  return payload;
}
