// @bun
import {
  OperationDeadline,
  OperationDeadlineError
} from "./index-vtj5zdgf.js";

// src/provider-http.ts
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync
} from "fs";
import { createHash } from "crypto";
import { isAbsolute, parse, resolve, sep } from "path";
import { BoundedByteBuffer } from "@hraness/kb/clip/bounded-byte-buffer";
var MAX_TOKEN_FILE_BYTES = 64 * 1024;
var MAX_ACCESS_TOKEN_BYTES = 16 * 1024;
var DEFAULT_MINIMUM_TOKEN_VALIDITY_MS = 30000;
var PROVIDER_OPERATION_LABEL = "official provider operation";
var PROVIDER_RESPONSE_CLEANUP_JOIN_MS = 500;
function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}
function ownedByCurrentUser(stats) {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return uid === undefined || stats.uid === BigInt(uid);
}
function canonicalTokenPath(path) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const relative = absolute.slice(root.length);
  const segments = relative === "" ? [] : relative.split(sep).filter((segment) => segment !== "");
  let current = root;
  for (const [index, segment] of segments.entries()) {
    const candidate = resolve(current, segment);
    const stats = lstatSync(candidate, { bigint: true });
    if (stats.isSymbolicLink()) {
      if (index === segments.length - 1 || process.platform === "win32" || stats.uid !== 0n) {
        throw new Error("OAuth token path cannot contain user-controlled symbolic links");
      }
      current = realpathSync(candidate);
    } else
      current = candidate;
  }
  return current;
}
function readPrivateTokenFile(path, expectedContent) {
  if (!isAbsolute(path))
    throw new Error("OAuth token file path must be absolute");
  const canonical = canonicalTokenPath(path);
  const descriptor = openSync(canonical, constants.O_RDONLY | ("O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0) | ("O_NONBLOCK" in constants ? constants.O_NONBLOCK : 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || !ownedByCurrentUser(before) || process.platform !== "win32" && (before.mode & 0o777n) !== 0o600n || before.size < 1n || before.size > BigInt(MAX_TOKEN_FILE_BYTES)) {
      throw new Error("OAuth token file must be a current-user-owned regular file with mode 0600 and at most 65536 bytes");
    }
    const buffer = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < buffer.byteLength) {
      const count = readSync(descriptor, buffer, offset, buffer.byteLength - offset, offset);
      if (count === 0)
        break;
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (offset !== buffer.byteLength || !sameIdentity(before, after) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || before.mode !== after.mode)
      throw new Error("OAuth token file changed while it was read");
    if (expectedContent !== undefined && !buffer.equals(Buffer.from(expectedContent, "utf8"))) {
      throw new Error("OAuth credential file does not match its intended content");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } finally {
    closeSync(descriptor);
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}
function tokenExpiry(value) {
  if (value === null)
    return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("OAuth token file has an invalid expiresAt timestamp");
  }
  return new Date(value).toISOString();
}
function hasForbiddenAccessTokenCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 32 || codePoint === 127))
      return true;
  }
  return false;
}
function boundedOAuthSecret(value, label, minimumBytes, maximumBytes) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < minimumBytes || Buffer.byteLength(value, "utf8") > maximumBytes || hasForbiddenAccessTokenCharacter(value))
    throw new Error(`OAuth token document contains an invalid ${label}`);
  return value;
}
function parseGoogleInstalledAppRefresh(value) {
  if (!isRecord(value))
    throw new Error("OAuth token document refresh configuration must be an object");
  if (!exactKeys(value, [
    "kind",
    "clientId",
    "clientSecret",
    "refreshToken",
    "refreshTokenExpiresAt"
  ]))
    throw new Error("OAuth token document refresh configuration has unsupported fields");
  if (value.kind !== "google-installed-app") {
    throw new Error("OAuth token document has an unsupported refresh configuration");
  }
  const clientId = boundedOAuthSecret(value.clientId, "Google OAuth clientId", 16, 1024);
  if (!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/u.test(clientId)) {
    throw new Error("OAuth token document contains an invalid Google OAuth clientId");
  }
  const clientSecret = value.clientSecret === null ? null : boundedOAuthSecret(value.clientSecret, "Google OAuth clientSecret", 1, 4096);
  const refreshToken = boundedOAuthSecret(value.refreshToken, "Google OAuth refreshToken", 8, 16 * 1024);
  const refreshTokenExpiresAt = tokenExpiry(value.refreshTokenExpiresAt);
  return Object.freeze({
    kind: "google-installed-app",
    clientId,
    clientSecret,
    refreshToken,
    refreshTokenExpiresAt
  });
}
function loadOAuthCredential(auth, options = {}) {
  let content;
  let parsed;
  try {
    content = readPrivateTokenFile(auth.path, options.expectedContent);
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`could not load private ${auth.provider} OAuth token document`, { cause: error });
  }
  if (!isRecord(parsed))
    throw new Error("OAuth token document must be an object");
  const schemaVersion = parsed.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new Error("OAuth token document provider or schema version does not match its locator");
  }
  const expected = ["schemaVersion", "provider", "subject", "scopes", "accessToken", "expiresAt"];
  if (schemaVersion === 2)
    expected.push("refresh");
  if (!exactKeys(parsed, expected))
    throw new Error("OAuth token document has unsupported fields");
  if (parsed.provider !== auth.provider) {
    throw new Error("OAuth token document provider or schema version does not match its locator");
  }
  if ((parsed.subject ?? null) !== (auth.subject ?? null)) {
    throw new Error("OAuth token document subject does not match its locator");
  }
  if (!Array.isArray(parsed.scopes) || !parsed.scopes.every((scope) => typeof scope === "string") || parsed.scopes.length !== auth.scopes.length || parsed.scopes.some((scope, index) => scope !== auth.scopes[index]))
    throw new Error("OAuth token document scopes do not match its locator");
  const accessToken = boundedOAuthSecret(parsed.accessToken, "accessToken", 8, MAX_ACCESS_TOKEN_BYTES);
  const expiresAt = tokenExpiry(parsed.expiresAt);
  if (schemaVersion === 1) {
    if (auth.managed === true) {
      throw new Error("Ghostget-managed OAuth auth requires a renewable schema-version-2 credential");
    }
    return Object.freeze({
      schemaVersion,
      accessToken,
      expiresAt,
      refresh: null,
      contentSha256: createHash("sha256").update(content, "utf8").digest("hex")
    });
  }
  if (auth.managed !== true || auth.provider !== "gmail") {
    throw new Error("renewable OAuth credentials require a Ghostget-managed Gmail auth locator");
  }
  if (expiresAt === null) {
    throw new Error("renewable OAuth credentials require an access-token expiry");
  }
  return Object.freeze({
    schemaVersion,
    accessToken,
    expiresAt,
    refresh: parseGoogleInstalledAppRefresh(parsed.refresh),
    contentSha256: createHash("sha256").update(content, "utf8").digest("hex")
  });
}
function loadOAuthToken(auth, now = new Date, minimumValidityMs = DEFAULT_MINIMUM_TOKEN_VALIDITY_MS) {
  if (!Number.isSafeInteger(minimumValidityMs) || minimumValidityMs < 0) {
    throw new Error("OAuth token minimum validity budget must be a non-negative safe integer");
  }
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs))
    throw new Error("OAuth token validity reference time is invalid");
  const credential = loadOAuthCredential(auth);
  const expiresAt = credential.expiresAt;
  if (expiresAt !== null && Date.parse(expiresAt) - nowMs <= minimumValidityMs) {
    const budget = minimumValidityMs === DEFAULT_MINIMUM_TOKEN_VALIDITY_MS ? "expires within 30 seconds" : `does not remain valid for the required ${minimumValidityMs}ms budget`;
    throw new Error(`the ${auth.provider} OAuth access token is expired or ${budget}; rotate the private token file`);
  }
  return { accessToken: credential.accessToken, expiresAt };
}
function requireOAuthScopes(auth, alternatives, additional = []) {
  const available = new Set(auth.scopes);
  const base = alternatives.find((candidate) => candidate.every((scope) => available.has(scope)));
  if (base === undefined) {
    throw new Error(`OAuth locator ${auth.id} lacks one complete required ${auth.provider} scope set`);
  }
  const missing = additional.filter((scope) => !available.has(scope));
  if (missing.length > 0)
    throw new Error(`OAuth locator ${auth.id} lacks required scope(s): ${missing.join(", ")}`);
}
async function settlesWithin(operation, maximumMs) {
  let timer;
  try {
    return await Promise.race([
      operation.then((value) => ({
        status: "fulfilled",
        value
      }), (reason) => ({
        status: "rejected",
        reason
      })),
      new Promise((resolve2) => {
        timer = setTimeout(() => resolve2(null), maximumMs);
      })
    ]);
  } finally {
    if (timer !== undefined)
      clearTimeout(timer);
  }
}
function combineCleanupFailures(current, next) {
  return current === null ? next : new AggregateError([current, next], "multiple official provider response cleanup checks failed");
}
function responseCleanupVerificationError(primaryFailure, cleanupFailure) {
  const primary = primaryFailure instanceof Error ? primaryFailure : new Error("official provider response processing failed", {
    cause: primaryFailure
  });
  return new AggregateError([primary, cleanupFailure], `${primary.message}; official provider response cleanup could not be verified`);
}
async function cancellationCleanupFailure(cancellation, concurrentOperations, diagnostic) {
  const quiescence = Promise.allSettled([
    ...concurrentOperations,
    cancellation
  ]).then((results) => {
    const cancellationResult = results.at(-1);
    if (cancellationResult?.status === "rejected") {
      throw cancellationResult.reason;
    }
  });
  const settled = await settlesWithin(quiescence, PROVIDER_RESPONSE_CLEANUP_JOIN_MS);
  if (settled !== null && settled.status === "fulfilled") {
    return { failure: null, settled: true };
  }
  return {
    failure: new Error(diagnostic, settled?.status === "rejected" ? { cause: settled.reason } : undefined),
    settled: settled !== null
  };
}
async function cancelResponseBody(body) {
  if (body === null)
    return null;
  const cancellation = Promise.resolve().then(() => body.cancel("official provider response was rejected"));
  return (await cancellationCleanupFailure(cancellation, [], "official provider response body cleanup did not settle after cancellation")).failure;
}
function releaseReaderAfterPendingRead(reader, pendingRead) {
  const release = () => {
    try {
      reader.releaseLock();
    } catch {}
  };
  pendingRead.then(release, release);
}
async function joinLateResponseCleanup(fetchOperation, deadlineError) {
  const cleanup = fetchOperation.then(async (response) => {
    await response.body?.cancel("official provider request deadline expired");
  }, () => {
    return;
  });
  const settled = await settlesWithin(cleanup, PROVIDER_RESPONSE_CLEANUP_JOIN_MS);
  if (settled !== null && settled.status === "fulfilled")
    return;
  const cleanupError = new Error("official provider response cleanup did not settle after cancellation", settled?.status === "rejected" ? { cause: settled.reason } : undefined);
  throw new AggregateError([deadlineError, cleanupError], `${deadlineError.message}; official provider response cleanup could not be verified`);
}
function hasOversizedContentLength(response, maximumBytes) {
  const declared = response.headers.get("content-length");
  if (declared === null || !/^[0-9]+$/u.test(declared))
    return false;
  return BigInt(declared) > BigInt(maximumBytes);
}
async function boundedResponseText(response, maximumBytes, deadline) {
  const body = response.body;
  if (body === null) {
    deadline?.throwIfUnavailable(PROVIDER_OPERATION_LABEL);
    return "";
  }
  let reader = null;
  let pendingRead = null;
  let pendingReadSettled = true;
  let deferReaderRelease = false;
  let failed = false;
  let failure;
  let cleanupFailure = null;
  let text;
  const output = new BoundedByteBuffer(maximumBytes);
  try {
    deadline?.throwIfUnavailable(PROVIDER_OPERATION_LABEL);
    if (hasOversizedContentLength(response, maximumBytes)) {
      throw new Error(`provider response exceeds ${maximumBytes} bytes`);
    }
    const activeReader = body.getReader();
    reader = activeReader;
    for (;; ) {
      pendingReadSettled = false;
      pendingRead = activeReader.read();
      pendingRead.then(() => {
        pendingReadSettled = true;
      }, () => {
        pendingReadSettled = true;
      });
      const next = deadline === null ? await pendingRead : await deadline.run(() => pendingRead, PROVIDER_OPERATION_LABEL);
      pendingRead = null;
      if (!isRecord(next) || typeof next.done !== "boolean") {
        throw new Error("provider response returned an invalid body read result");
      }
      if (next.done)
        break;
      const chunk = next.value;
      if (!(chunk instanceof Uint8Array))
        throw new Error("provider response returned an invalid body chunk");
      if (!output.append(chunk))
        throw new Error(`provider response exceeds ${maximumBytes} bytes`);
    }
    text = new TextDecoder("utf-8", { fatal: true }).decode(output.toUint8Array());
    deadline?.throwIfUnavailable(PROVIDER_OPERATION_LABEL);
  } catch (error) {
    failed = true;
    failure = error;
    if (reader === null) {
      cleanupFailure = await cancelResponseBody(body);
    } else {
      const activeReader = reader;
      const cancellation = Promise.resolve().then(() => activeReader.cancel("official provider response processing stopped"));
      const cleanup = await cancellationCleanupFailure(cancellation, pendingRead === null ? [] : [pendingRead], "official provider response reader cleanup did not settle after cancellation");
      cleanupFailure = cleanup.failure;
      deferReaderRelease = !cleanup.settled && pendingRead !== null && !pendingReadSettled;
    }
  } finally {
    if (reader !== null) {
      if (deferReaderRelease && pendingRead !== null) {
        releaseReaderAfterPendingRead(reader, pendingRead);
      } else {
        try {
          reader.releaseLock();
        } catch (error) {
          cleanupFailure = combineCleanupFailures(cleanupFailure, new Error("official provider response reader lock could not be released", { cause: error }));
        }
      }
    }
  }
  if (failed) {
    if (cleanupFailure !== null) {
      throw responseCleanupVerificationError(failure, cleanupFailure);
    }
    throw failure;
  }
  if (cleanupFailure !== null) {
    throw new Error("official provider response cleanup could not be verified", { cause: cleanupFailure });
  }
  if (text === undefined) {
    throw new Error("official provider response processing did not produce text");
  }
  return text;
}
function safePath(url) {
  return `${url.pathname}${url.search === "" ? "" : "?\u2026"}`;
}

class ProviderHttpClient {
  #fetch;
  #operationDeadline;
  #legacyDeadlineMs;
  #maximumBytes;
  constructor(fetch_, timeoutOrDeadline, maximumBytes) {
    this.#fetch = fetch_;
    this.#operationDeadline = timeoutOrDeadline instanceof OperationDeadline ? timeoutOrDeadline : null;
    this.#legacyDeadlineMs = typeof timeoutOrDeadline === "number" ? Date.now() + timeoutOrDeadline : null;
    this.#maximumBytes = maximumBytes;
  }
  remainingTimeMs() {
    return this.#operationDeadline?.remainingTimeMs() ?? Math.max(0, (this.#legacyDeadlineMs ?? 0) - Date.now());
  }
  throwIfUnavailable() {
    this.#operationDeadline?.throwIfUnavailable(PROVIDER_OPERATION_LABEL);
    if (this.remainingTimeMs() < 1) {
      throw new Error("official provider operation timed out during response projection");
    }
  }
  async request(urlValue, init, expectedStatuses, allowedHosts, maximumBytes = this.#maximumBytes, responseMediaType) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > this.#maximumBytes) {
      throw new Error("official provider request response limit must be a positive safe integer within the client ceiling");
    }
    if (responseMediaType !== undefined && responseMediaType !== "application/json") {
      throw new Error("official provider request has an unsupported response media-type policy");
    }
    const url = new URL(urlValue);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || !allowedHosts.includes(url.hostname))
      throw new Error("official provider request attempted an unapproved origin");
    this.#operationDeadline?.throwIfUnavailable(PROVIDER_OPERATION_LABEL);
    const remaining = this.remainingTimeMs();
    if (remaining < 1)
      throw new Error("official provider operation timed out before its next request");
    let response;
    let fetchOperation;
    try {
      response = this.#operationDeadline === null ? await this.#fetch(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(remaining)
      }) : await this.#operationDeadline.run((signal) => {
        fetchOperation = Promise.resolve().then(() => this.#fetch(url, {
          ...init,
          redirect: "error",
          signal
        }));
        return fetchOperation;
      }, PROVIDER_OPERATION_LABEL);
    } catch (error) {
      if (error instanceof OperationDeadlineError) {
        if (fetchOperation !== undefined) {
          await joinLateResponseCleanup(fetchOperation, error);
        }
        throw error;
      }
      throw new Error(`official provider request did not return a response for ${init.method ?? "GET"} ${safePath(url)}`, { cause: error });
    }
    if (!expectedStatuses.includes(response.status)) {
      const failure = new Error(`official provider returned HTTP ${response.status} for ${init.method ?? "GET"} ${safePath(url)}`);
      const cleanupFailure = await cancelResponseBody(response.body);
      if (cleanupFailure !== null) {
        throw responseCleanupVerificationError(failure, cleanupFailure);
      }
      throw failure;
    }
    if (responseMediaType === "application/json") {
      const contentType = response.headers.get("content-type");
      if (contentType === null || contentType.length > 256 || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(contentType)) {
        const failure = new Error(`official provider returned an unsupported response media type for ${init.method ?? "GET"} ${safePath(url)}`);
        const cleanupFailure = await cancelResponseBody(response.body);
        if (cleanupFailure !== null) {
          throw responseCleanupVerificationError(failure, cleanupFailure);
        }
        throw failure;
      }
    }
    const text = await boundedResponseText(response, maximumBytes, this.#operationDeadline);
    if (text === "")
      return { status: response.status, headers: response.headers, body: null };
    try {
      const body = JSON.parse(text);
      this.#operationDeadline?.throwIfUnavailable(PROVIDER_OPERATION_LABEL);
      return { status: response.status, headers: response.headers, body };
    } catch (error) {
      throw new Error(`official provider returned malformed JSON for ${init.method ?? "GET"} ${safePath(url)}`, { cause: error });
    }
  }
}
function bearerHeaders(accessToken, extra = {}) {
  const headers = new Headers(extra);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

export { loadOAuthCredential, loadOAuthToken, requireOAuthScopes, ProviderHttpClient, bearerHeaders };
