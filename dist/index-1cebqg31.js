// @bun
import {
  imsgArtifactForCurrentRuntime,
  resolvePinnedImsgBinary
} from "./index-xgvkhhtr.js";
import {
  IMSG_ACCOUNT_SELECTION,
  IMSG_DIRECT_OPERATIONS,
  IMSG_MAX_CHAT_SCAN,
  IMSG_ORIGIN,
  IMSG_REVIEWED_VERSION,
  IMSG_SERVICE,
  IMSG_SMS_FALLBACK,
  IMSG_TOOL_PIN,
  IMSG_TRANSPORT,
  IMSG_UPSTREAM_VERSION,
  boundedImsgString,
  imsgOperationRequests,
  imsgStatusRequest,
  isImsgDirectOperation,
  parseImsgDirectOperationInput
} from "./index-7tcbcqs5.js";
import {
  attachLocalCliCleanupProcessGroup,
  captureLocalCliCleanupResource,
  localCliCleanupProcessGroupStatus
} from "./index-r9zhe6em.js";
import {
  removePrivateDirectoryTree
} from "./index-0ywm1fj9.js";
import {
  OperationDeadline
} from "./index-vtj5zdgf.js";
import {
  startProviderPluginCleanupTrackedOperation
} from "./index-n4szk3nw.js";
import {
  canonicalJson
} from "./index-8sbt8qwx.js";

// src/providers/imessage-direct-runtime.ts
import { createHash, randomBytes } from "crypto";
import { constants, createReadStream } from "fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  realpath
} from "fs/promises";
import { homedir, tmpdir } from "os";
import { isAbsolute, join } from "path";
import { types as nodeTypes } from "util";
var MAX_STDERR_BYTES = 64 * 1024;
var MAX_STATUS_BYTES = 512 * 1024;
var SUBJECT_PROBE_TIMEOUT_MS = 30000;
var OPERATION_LABEL = "direct iMessage local CLI operation";

class ImsgCleanupUnverifiedError extends Error {
  constructor() {
    super("direct iMessage process cleanup could not be proven; retry remains unsafe");
    this.name = "ImsgCleanupUnverifiedError";
  }
}

class ImsgRpcFailure extends Error {
  outcome;
  constructor(outcome) {
    super("imsg RPC returned a categorical failure");
    this.name = "ImsgRpcFailure";
    this.outcome = outcome;
  }
}
function record(value, label) {
  if (nodeTypes.isProxy(value) || typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw new Error(`${label} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = typeof key === "string" ? descriptors[key] : undefined;
    if (typeof key !== "string" || descriptor === undefined || !descriptor.enumerable || !("value" in descriptor))
      throw new Error(`${label} must contain only enumerable data fields`);
  }
  return value;
}
function exactKeys(value, required, optional, label) {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error(`${label} has unsupported fields`);
}
function array(value, label, maximum) {
  if (nodeTypes.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum)
    throw new Error(`${label} must be a bounded dense array`);
  for (let index = 0;index < value.length; index += 1) {
    if (!Object.hasOwn(value, index))
      throw new Error(`${label} must not be sparse`);
  }
  return value;
}
function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${label} must be a bounded integer`);
  return value;
}
function nullableString(value, label, maximum) {
  return value === undefined || value === null ? null : boundedImsgString(value, label, maximum, { allowEmpty: true });
}
function timestamp(value, label) {
  const source = boundedImsgString(value, label, 64);
  const milliseconds = Date.parse(source);
  if (!Number.isFinite(milliseconds))
    throw new Error(`${label} must be a timestamp`);
  return new Date(milliseconds).toISOString();
}
function requireImsgAuth(auth) {
  if (auth.kind !== "linked-device-store" || auth.provider !== "imessage") {
    throw new Error("direct iMessage requires an imessage linked-device-store auth locator");
  }
  return auth;
}
async function validateMessagesStore(path, expectedPath) {
  if (!isAbsolute(path) || !isAbsolute(expectedPath)) {
    throw new Error("Messages store paths must be absolute");
  }
  const canonical = await realpath(path);
  const expectedCanonical = await realpath(expectedPath);
  const stats = await lstat(path);
  if (canonical !== path || canonical !== expectedCanonical || !stats.isDirectory() || stats.isSymbolicLink() || stats.uid !== process.getuid?.() || (stats.mode & 18) !== 0)
    throw new Error("Messages store must be the owned physical device-default Messages directory");
  const databasePath = join(canonical, "chat.db");
  const canonicalDatabasePath = await realpath(databasePath);
  const databaseStats = await lstat(databasePath);
  if (canonicalDatabasePath !== databasePath || !databaseStats.isFile() || databaseStats.isSymbolicLink() || databaseStats.uid !== process.getuid?.() || (databaseStats.mode & 18) !== 0)
    throw new Error("Messages database must be an owned physical non-writable-by-others file");
  return Object.freeze({ storePath: canonical, databasePath: canonicalDatabasePath });
}
function subjectForStore(path) {
  const digest = createHash("sha256").update("wrench-imessage-device-default-v1\x00", "utf8").update(path, "utf8").digest("hex");
  return `imessage:device-default:${digest}`;
}
async function createOperationRoot() {
  const parent = await realpath(tmpdir());
  for (let attempt = 0;attempt < 16; attempt += 1) {
    const path = join(parent, `wrench-imessage-${randomBytes(16).toString("hex")}`);
    try {
      await mkdir(path, { mode: 448 });
      return path;
    } catch (error) {
      if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "EEXIST")
        throw error;
    }
  }
  throw new Error("direct iMessage operation root allocation failed");
}
async function sha256File(path) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
async function materializePinnedBinary(sourcePath, operationRoot, expectedSha256) {
  const source = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  const destinationPath = join(operationRoot, "imsg");
  let destination;
  try {
    const before = await source.stat();
    if (!before.isFile() || before.size < 1 || before.size > 256 * 1024 * 1024 || (before.mode & 18) !== 0 || (before.mode & 73) === 0 || before.uid !== process.getuid?.() && before.uid !== 0)
      throw new Error("reviewed imsg executable source is unsafe");
    destination = await open(destinationPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 320);
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let offset = 0;
    while (offset < before.size) {
      const read = await source.read(buffer, 0, Math.min(buffer.byteLength, before.size - offset), offset);
      if (read.bytesRead < 1)
        throw new Error("reviewed imsg executable changed while copied");
      const chunk = buffer.subarray(0, read.bytesRead);
      hash.update(chunk);
      let written = 0;
      while (written < chunk.byteLength) {
        const result = await destination.write(chunk, written, chunk.byteLength - written, offset + written);
        if (result.bytesWritten < 1)
          throw new Error("reviewed imsg private copy failed");
        written += result.bytesWritten;
      }
      offset += read.bytesRead;
    }
    const extra = await source.read(Buffer.allocUnsafe(1), 0, 1, offset);
    const after = await source.stat();
    if (extra.bytesRead !== 0 || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || hash.digest("hex") !== expectedSha256)
      throw new Error("reviewed imsg executable changed or failed its pin");
  } finally {
    await destination?.close();
    await source.close();
  }
  await chmod(destinationPath, 320);
  if (await sha256File(destinationPath) !== expectedSha256) {
    throw new Error("reviewed imsg private copy failed its pin");
  }
  return destinationPath;
}
async function readBoundedStream(stream, maximum, label) {
  const reader = stream.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    for (;; ) {
      const item = await reader.read();
      if (item.done)
        break;
      if (item.value.byteLength > maximum - byteLength) {
        throw new Error(`${label} exceeded its byte bound`);
      }
      chunks.push(item.value.slice());
      byteLength += item.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(output);
}
async function runImsgRpc(invocation) {
  const isAborted = () => invocation.signal?.aborted === true;
  if (isAborted()) {
    throw new Error("imsg RPC invocation was cancelled");
  }
  await invocation.beforeSpawn?.();
  if (isAborted()) {
    throw new Error("imsg RPC invocation was cancelled");
  }
  const child = Bun.spawn([invocation.binary, ...invocation.arguments], {
    env: { ...invocation.environment },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    detached: true
  });
  try {
    invocation.afterSpawn?.(child.pid);
  } catch (error) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    await child.exited;
    throw error;
  }
  let timedOut = false;
  let cancelled = false;
  let forceKill = null;
  let terminationStarted = false;
  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {}
  };
  const terminate = () => {
    if (!terminationStarted) {
      terminationStarted = true;
      signalGroup("SIGTERM");
    }
    forceKill ??= setTimeout(() => signalGroup("SIGKILL"), 1000);
  };
  const onAbort = () => {
    cancelled = true;
    terminate();
  };
  invocation.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    terminate();
  }, invocation.timeoutMs);
  const guarded = (promise) => promise.catch((error) => {
    terminate();
    throw error;
  });
  const stdin = guarded((async () => {
    await child.stdin.write(invocation.stdin);
    await child.stdin.end();
  })());
  const stdout = guarded(readBoundedStream(child.stdout, invocation.maxOutputBytes, "imsg RPC stdout"));
  const stderr = guarded(readBoundedStream(child.stderr, invocation.maxStderrBytes, "imsg RPC stderr"));
  try {
    const [stdinResult, stdoutResult, stderrResult, exitResult] = await Promise.allSettled([stdin, stdout, stderr, child.exited]);
    if (exitResult.status === "rejected")
      throw new ImsgCleanupUnverifiedError;
    if (stdinResult.status === "rejected" || stdoutResult.status === "rejected" || stderrResult.status === "rejected")
      throw new Error("imsg RPC stream failed within its bound");
    if (cancelled)
      throw new Error("imsg RPC invocation was cancelled");
    if (timedOut)
      throw new Error("imsg RPC invocation timed out");
    return Object.freeze({
      exitCode: exitResult.value,
      stdout: stdoutResult.value,
      stderr: stderrResult.value
    });
  } finally {
    clearTimeout(timeout);
    if (forceKill !== null)
      clearTimeout(forceKill);
    invocation.signal?.removeEventListener("abort", onAbort);
  }
}
function remainingTimeoutMs(timeoutMs, deadline) {
  deadline?.throwIfUnavailable(OPERATION_LABEL);
  const remaining = Math.min(timeoutMs, deadline?.remainingTimeMs() ?? timeoutMs);
  if (remaining < 1)
    throw new Error("direct iMessage operation timed out");
  return remaining;
}
function rpcEnvironment(operationRoot) {
  return Object.freeze({
    PATH: "/usr/bin:/bin",
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    TMPDIR: join(operationRoot, "tmp")
  });
}
function rpcInput(requests) {
  return `${requests.map((request) => canonicalJson(request)).join(`
`)}
`;
}
function parseRpcError(value) {
  const error = record(value, "imsg RPC error");
  exactKeys(error, ["code", "message"], ["data"], "imsg RPC error");
  integer(error.code, "imsg RPC error.code", -32768, 32767);
  boundedImsgString(error.message, "imsg RPC error.message", 4096, {
    allowEmpty: true,
    allowNewlines: true
  });
  if (error.data === undefined)
    throw new ImsgRpcFailure(null);
  const data = record(error.data, "imsg RPC error.data");
  exactKeys(data, ["disposition", "retry_safe", "transport", "operation", "detail"], [], "imsg RPC error.data");
  const disposition = boundedImsgString(data.disposition, "imsg RPC error.data.disposition", 64);
  if (disposition !== "not_started" && disposition !== "may_have_completed" && disposition !== "still_in_flight")
    throw new ImsgRpcFailure(null);
  if (typeof data.retry_safe !== "boolean")
    throw new ImsgRpcFailure(null);
  boundedImsgString(data.transport, "imsg RPC error.data.transport", 64);
  boundedImsgString(data.operation, "imsg RPC error.data.operation", 128);
  boundedImsgString(data.detail, "imsg RPC error.data.detail", 8192, {
    allowEmpty: true,
    allowNewlines: true
  });
  if (disposition === "not_started" && data.retry_safe !== true || disposition !== "not_started" && data.retry_safe !== false)
    throw new ImsgRpcFailure(null);
  throw new ImsgRpcFailure(disposition);
}
function parseRpcResponses(result, requests) {
  if (result.exitCode !== 0 || result.stderr.trim().length !== 0) {
    throw new Error("imsg RPC process failed before reviewed output was obtained");
  }
  const lines = result.stdout.split(`
`).filter((line) => line.length > 0);
  if (lines.length !== requests.length) {
    throw new Error("imsg RPC returned an unexpected response count");
  }
  const expected = new Set(requests.map((request) => request.id));
  const responses = new Map;
  for (const [index, line] of lines.entries()) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error("imsg RPC returned malformed JSON");
    }
    const envelope = record(parsed, `imsg RPC response ${index}`);
    const hasResult = Object.hasOwn(envelope, "result");
    const hasError = Object.hasOwn(envelope, "error");
    exactKeys(envelope, ["jsonrpc", "id", hasResult ? "result" : "error"], [], `imsg RPC response ${index}`);
    if (hasResult === hasError || envelope.jsonrpc !== "2.0") {
      throw new Error("imsg RPC returned an invalid response envelope");
    }
    const id = boundedImsgString(envelope.id, `imsg RPC response ${index}.id`, 128);
    if (!expected.has(id) || responses.has(id)) {
      throw new Error("imsg RPC returned an unbound response ID");
    }
    if (hasError)
      parseRpcError(envelope.error);
    responses.set(id, envelope.result);
  }
  return responses;
}
function parseStatus(value) {
  const source = record(value, "imsg status");
  exactKeys(source, [
    "version",
    "protocol_version",
    "database",
    "bridge",
    "contacts",
    "methods",
    "supported_methods"
  ], [], "imsg status");
  if (source.version !== IMSG_UPSTREAM_VERSION || source.protocol_version !== 1) {
    throw new Error("imsg status version or protocol changed from the reviewed contract");
  }
  const database = record(source.database, "imsg status.database");
  exactKeys(database, ["ready"], ["path", "features", "error"], "imsg status.database");
  if (database.ready !== true)
    throw new Error("Messages database is not currently readable");
  const databasePath = nullableString(database.path, "imsg status.database.path", 4096);
  if (databasePath === null || databasePath.length === 0 || !isAbsolute(databasePath)) {
    throw new Error("imsg status omitted its absolute Messages database path");
  }
  if (database.features !== undefined)
    record(database.features, "imsg status.database.features");
  if (database.error !== undefined) {
    boundedImsgString(database.error, "imsg status.database.error", 4096, {
      allowEmpty: true,
      allowNewlines: true
    });
  }
  record(source.bridge, "imsg status.bridge");
  const contacts = record(source.contacts, "imsg status.contacts");
  exactKeys(contacts, ["available"], [], "imsg status.contacts");
  if (typeof contacts.available !== "boolean") {
    throw new Error("imsg status contacts capability is malformed");
  }
  const methods = array(source.methods, "imsg status.methods", 256).map((method, index) => boundedImsgString(method, `imsg status.methods[${index}]`, 128));
  array(source.supported_methods, "imsg status.supported_methods", 256).forEach((method, index) => boundedImsgString(method, `imsg status.supported_methods[${index}]`, 128));
  for (const required of [
    "status",
    "chats.list",
    "chats.get",
    "messages.history",
    "send",
    "message.send_status"
  ]) {
    if (!methods.includes(required)) {
      throw new Error("imsg status did not expose the complete reviewed direct transport");
    }
  }
  return databasePath;
}
function parseChat(value, label) {
  const source = record(value, label);
  exactKeys(source, [
    "id",
    "name",
    "identifier",
    "service",
    "last_message_at",
    "is_group"
  ], [
    "guid",
    "display_name",
    "contact_name",
    "participants",
    "account_id",
    "account_login",
    "last_addressed_handle",
    "unread_count"
  ], label);
  const id = integer(source.id, `${label}.id`, 1);
  const service = boundedImsgString(source.service, `${label}.service`, 128);
  const guid = nullableString(source.guid, `${label}.guid`, 2048);
  const identifier = boundedImsgString(source.identifier, `${label}.identifier`, 2048, { allowEmpty: true });
  const name = boundedImsgString(source.name, `${label}.name`, 4096, {
    allowEmpty: true
  });
  const displayName = nullableString(source.display_name, `${label}.display_name`, 4096);
  const contactName = nullableString(source.contact_name, `${label}.contact_name`, 4096);
  const lastMessageAt = timestamp(source.last_message_at, `${label}.last_message_at`);
  if (typeof source.is_group !== "boolean")
    throw new Error(`${label}.is_group must be boolean`);
  const participants = source.participants === undefined ? [] : array(source.participants, `${label}.participants`, 500).map((participant, index) => boundedImsgString(participant, `${label}.participants[${index}]`, 2048));
  const unreadCount = source.unread_count === undefined ? null : integer(source.unread_count, `${label}.unread_count`);
  const observedAccountId = nullableString(source.account_id, `${label}.account_id`, 2048);
  const observedAccountLogin = nullableString(source.account_login, `${label}.account_login`, 2048);
  const observedLastAddressedHandle = nullableString(source.last_addressed_handle, `${label}.last_addressed_handle`, 2048);
  if (service !== IMSG_SERVICE || guid === null || guid.length === 0)
    return null;
  const title = displayName && displayName.length > 0 ? displayName : contactName && contactName.length > 0 ? contactName : name.length > 0 ? name : identifier.length > 0 ? identifier : null;
  return Object.freeze({
    id,
    guid,
    service: IMSG_SERVICE,
    identifier,
    title,
    kind: source.is_group ? "group" : "single",
    participants: Object.freeze(participants),
    lastMessageAt,
    unreadCount,
    observedAccountId,
    observedAccountLogin,
    observedLastAddressedHandle
  });
}
function parseChats(value) {
  const source = record(value, "imsg chats.list result");
  exactKeys(source, ["chats"], [], "imsg chats.list result");
  const chats = array(source.chats, "imsg chats.list result.chats", IMSG_MAX_CHAT_SCAN).map((chat, index) => parseChat(chat, `imsg chats.list result.chats[${index}]`)).filter((chat) => chat !== null);
  const coordinates = chats.map((chat) => `${chat.id}\x00${chat.guid}`);
  if (new Set(coordinates).size !== coordinates.length) {
    throw new Error("imsg chats.list repeated an exact chat coordinate");
  }
  return Object.freeze(chats);
}
function exactChat(value, target) {
  const source = record(value, "imsg chats.get result");
  exactKeys(source, ["chat"], [], "imsg chats.get result");
  const chat = parseChat(source.chat, "imsg chats.get result.chat");
  if (chat === null || chat.id !== target.observedChatRowId || chat.guid !== target.chatGuid || chat.service !== target.service) {
    throw new Error("the exact iMessage chat coordinate is not live");
  }
  return chat;
}
function parseMessage(value, label, target) {
  const source = record(value, label);
  exactKeys(source, [
    "id",
    "chat_id",
    "guid",
    "sender",
    "is_from_me",
    "text",
    "created_at",
    "attachments",
    "reactions",
    "chat_identifier",
    "chat_guid",
    "chat_name",
    "participants",
    "is_group"
  ], [
    "reply_to_guid",
    "thread_originator_guid",
    "thread_originator_part",
    "reply_to_text",
    "reply_to_sender",
    "sender_name",
    "destination_caller_id",
    "balloon_bundle_id",
    "url_preview",
    "poll",
    "is_reaction",
    "reaction_type",
    "reaction_emoji",
    "is_reaction_add",
    "reacted_to_guid",
    "is_read",
    "date_read"
  ], label);
  const id = integer(source.id, `${label}.id`, 1);
  const chatId = integer(source.chat_id, `${label}.chat_id`, 1);
  const guid = boundedImsgString(source.guid, `${label}.guid`, 2048);
  const chatGuid = boundedImsgString(source.chat_guid, `${label}.chat_guid`, 2048);
  if (chatId !== target.observedChatRowId || chatGuid !== target.chatGuid) {
    throw new Error(`${label} did not bind the exact requested chat`);
  }
  const sender = nullableString(source.sender, `${label}.sender`, 2048);
  const senderName = nullableString(source.sender_name, `${label}.sender_name`, 2048);
  if (typeof source.is_from_me !== "boolean") {
    throw new Error(`${label}.is_from_me must be boolean`);
  }
  const text = boundedImsgString(source.text, `${label}.text`, 4 * 1024 * 1024, {
    allowEmpty: true,
    allowNewlines: true
  });
  const createdAt = timestamp(source.created_at, `${label}.created_at`);
  const replyToGuid = nullableString(source.reply_to_guid, `${label}.reply_to_guid`, 2048);
  if (array(source.attachments, `${label}.attachments`, 64).length !== 0) {
    throw new Error(`${label}.attachments must remain empty when attachment reads are disabled`);
  }
  array(source.reactions, `${label}.reactions`, 1e4);
  boundedImsgString(source.chat_identifier, `${label}.chat_identifier`, 2048, {
    allowEmpty: true
  });
  boundedImsgString(source.chat_name, `${label}.chat_name`, 4096, { allowEmpty: true });
  array(source.participants, `${label}.participants`, 500).forEach((participant, index) => boundedImsgString(participant, `${label}.participants[${index}]`, 2048));
  if (typeof source.is_group !== "boolean")
    throw new Error(`${label}.is_group must be boolean`);
  return Object.freeze({
    id,
    guid,
    chatId,
    chatGuid,
    sender: sender === "" ? null : sender,
    senderName: senderName === "" ? null : senderName,
    isFromMe: source.is_from_me,
    text,
    createdAt,
    replyToGuid: replyToGuid === "" ? null : replyToGuid
  });
}
function parseMessages(value, target, limit) {
  const source = record(value, "imsg messages.history result");
  exactKeys(source, ["messages"], [], "imsg messages.history result");
  const messages = array(source.messages, "imsg messages.history result.messages", limit).map((message, index) => parseMessage(message, `imsg messages.history result.messages[${index}]`, target));
  const ids = messages.map((message) => message.guid);
  if (new Set(ids).size !== ids.length) {
    throw new Error("imsg messages.history repeated a message GUID");
  }
  return Object.freeze(messages);
}
function parseSendAccepted(value, input) {
  const source = record(value, "imsg send result");
  exactKeys(source, [
    "ok",
    "transport",
    "id",
    "guid",
    "message_id",
    "chat_guid",
    "service"
  ], [], "imsg send result");
  const id = integer(source.id, "imsg send result.id", 1);
  const guid = boundedImsgString(source.guid, "imsg send result.guid", 2048);
  if (source.ok !== true || source.transport !== IMSG_TRANSPORT || source.message_id !== guid || source.chat_guid !== input.chatGuid || source.service !== IMSG_SERVICE)
    throw new Error("imsg send did not return exact independently observed acceptance evidence");
  return Object.freeze({
    provider: "imessage",
    operation: "messaging.send",
    accountSelection: IMSG_ACCOUNT_SELECTION,
    service: IMSG_SERVICE,
    transport: IMSG_TRANSPORT,
    smsFallback: IMSG_SMS_FALLBACK,
    transportOutcome: "accepted",
    acceptanceEvidence: "matching-outgoing-chat-db-row",
    chatGuid: input.chatGuid,
    chatRowId: input.observedChatRowId,
    messageGuid: guid,
    messageRowId: id
  });
}
function parseDelivery(value, expectedGuid) {
  const source = record(value, "imsg message.send_status result");
  exactKeys(source, [
    "ok",
    "guid",
    "send_state",
    "service",
    "checked_at",
    "status_fields"
  ], ["delivered_at"], "imsg message.send_status result");
  if (source.ok !== true || source.guid !== expectedGuid) {
    throw new Error("imsg send-status read did not bind the exact GUID");
  }
  const state = boundedImsgString(source.send_state, "imsg send-status state", 64);
  const checkedAt = timestamp(source.checked_at, "imsg send-status checked_at");
  const service = source.service === null ? null : boundedImsgString(source.service, "imsg send-status service", 128);
  if (service !== null && service !== IMSG_SERVICE) {
    throw new Error("imsg send-status observed a non-iMessage service");
  }
  const present = source.status_fields !== null;
  if (present)
    record(source.status_fields, "imsg send-status status_fields");
  if (source.delivered_at !== undefined) {
    timestamp(source.delivered_at, "imsg send-status delivered_at");
  }
  return Object.freeze({
    provider: "imessage",
    operation: "messaging.delivery.read",
    accountSelection: IMSG_ACCOUNT_SELECTION,
    service: service ?? IMSG_SERVICE,
    messageGuid: expectedGuid,
    present,
    sendState: state,
    checkedAt
  });
}
function operationOutput(action, input, responses, subject) {
  if (action === "messaging.list") {
    return Object.freeze({
      provider: "imessage",
      operation: action,
      accountSubject: subject,
      accountSelection: IMSG_ACCOUNT_SELECTION,
      service: IMSG_SERVICE,
      transport: IMSG_TRANSPORT,
      smsFallback: IMSG_SMS_FALLBACK,
      projection: "bounded-local-chat-db",
      conversations: parseChats(responses.get("operation"))
    });
  }
  const target = input;
  if (action === "conversations.read") {
    return Object.freeze({
      provider: "imessage",
      operation: action,
      accountSubject: subject,
      accountSelection: IMSG_ACCOUNT_SELECTION,
      service: IMSG_SERVICE,
      transport: IMSG_TRANSPORT,
      smsFallback: IMSG_SMS_FALLBACK,
      conversation: exactChat(responses.get("operation"), target)
    });
  }
  if (action === "messaging.read") {
    const exact = exactChat(responses.get("route"), target);
    const limit = input.limit;
    return Object.freeze({
      provider: "imessage",
      operation: action,
      accountSubject: subject,
      accountSelection: IMSG_ACCOUNT_SELECTION,
      service: IMSG_SERVICE,
      transport: IMSG_TRANSPORT,
      smsFallback: IMSG_SMS_FALLBACK,
      projection: "bounded-local-chat-db",
      conversation: exact,
      messages: parseMessages(responses.get("operation"), target, limit)
    });
  }
  if (action === "messaging.send") {
    return parseSendAccepted(responses.get("operation"), input);
  }
  const delivery = input;
  return parseDelivery(responses.get("operation"), delivery.messageGuid);
}
async function withRuntime(auth, timeoutMs, maxOutputBytes, dependencies, environment, deadline, publishCleanupResource, cleanup, durableCleanupAdmissionRequired, operation) {
  if (durableCleanupAdmissionRequired && publishCleanupResource === undefined) {
    const error = new ImsgCleanupUnverifiedError;
    cleanup.unsafe(error);
    throw error;
  }
  const makeRoot = dependencies?.createOperationRoot ?? createOperationRoot;
  let operationRoot;
  let cleanupResource;
  let productionSpawnAttempted = false;
  try {
    const expectedStorePath = dependencies?.expectedMessagesStorePath ?? join(homedir(), "Library", "Messages");
    const store = await validateMessagesStore(auth.path, expectedStorePath);
    const subject = subjectForStore(store.storePath);
    const databaseIdentity = await lstat(store.databasePath, { bigint: true });
    const sourceGeneration = createHash("sha256").update(canonicalJson({
      subject,
      device: String(databaseIdentity.dev),
      inode: String(databaseIdentity.ino),
      birthtime: String(databaseIdentity.birthtimeNs)
    })).digest("hex");
    if (auth.subject !== undefined && auth.subject !== subject) {
      throw new Error("current Messages device-default realm does not match the bound auth subject");
    }
    operationRoot = await makeRoot();
    if (!isAbsolute(operationRoot))
      throw new Error("imsg operation root must be absolute");
    await mkdir(operationRoot, { recursive: true, mode: 448 });
    await chmod(operationRoot, 448);
    await mkdir(join(operationRoot, "tmp"), { mode: 448 });
    cleanupResource = captureLocalCliCleanupResource(operationRoot);
    publishCleanupResource?.(cleanupResource);
    const afterSpawn = dependencies?.run === undefined && publishCleanupResource !== undefined ? (pid) => {
      productionSpawnAttempted = true;
      cleanupResource = attachLocalCliCleanupProcessGroup(cleanupResource, pid);
      publishCleanupResource(cleanupResource);
    } : undefined;
    const binarySource = dependencies?.binaryPath ?? await resolvePinnedImsgBinary(environment);
    if (dependencies?.binaryPath !== undefined && !isAbsolute(binarySource)) {
      throw new Error("test imsg binary path must be absolute");
    }
    const binary = dependencies?.binaryPath !== undefined ? binarySource : await materializePinnedBinary(binarySource, operationRoot, imsgArtifactForCurrentRuntime().executableSha256);
    const runner = dependencies?.run ?? runImsgRpc;
    const run = async (requests, beforeSpawn) => {
      const result2 = await runner(Object.freeze({
        binary,
        arguments: Object.freeze(["rpc"]),
        stdin: rpcInput(requests),
        environment: rpcEnvironment(operationRoot),
        timeoutMs: remainingTimeoutMs(timeoutMs, deadline),
        maxOutputBytes,
        maxStderrBytes: MAX_STDERR_BYTES,
        ...deadline?.signal === undefined ? {} : { signal: deadline.signal },
        ...beforeSpawn === undefined ? {} : { beforeSpawn },
        ...afterSpawn === undefined ? {} : { afterSpawn }
      }));
      return parseRpcResponses(result2, requests);
    };
    const status = await run([imsgStatusRequest()], undefined);
    const reportedDatabasePath = parseStatus(status.get("status"));
    if (await realpath(reportedDatabasePath) !== reportedDatabasePath || reportedDatabasePath !== store.databasePath)
      throw new Error("imsg status reported a different Messages database than the bound subject");
    const result = await operation(Object.freeze({ subject, sourceGeneration, status: status.get("status"), operationRoot, run }));
    const after = await lstat(store.databasePath, { bigint: true });
    if (after.dev !== databaseIdentity.dev || after.ino !== databaseIdentity.ino || after.birthtimeNs !== databaseIdentity.birthtimeNs || after.isSymbolicLink()) {
      throw new Error("Messages database generation changed during the operation");
    }
    return result;
  } finally {
    try {
      if (operationRoot === undefined) {
        cleanup.verified();
      } else if (dependencies?.removeOperationRoot !== undefined) {
        await dependencies.removeOperationRoot(operationRoot);
      } else if (cleanupResource !== undefined) {
        const groups = cleanupResource.processGroups ?? [];
        if (productionSpawnAttempted && groups.length === 0 || groups.length > 0 && localCliCleanupProcessGroupStatus(cleanupResource) !== "quiescent")
          throw new ImsgCleanupUnverifiedError;
        const removed = removePrivateDirectoryTree(operationRoot, {
          device: cleanupResource.root.device,
          inode: cleanupResource.root.inode,
          birthtimeNs: cleanupResource.root.birthtimeNs
        });
        if (!removed)
          throw new ImsgCleanupUnverifiedError;
      }
      cleanup.verified();
    } catch {
      const error = new ImsgCleanupUnverifiedError;
      cleanup.unsafe(error);
      if (!durableCleanupAdmissionRequired)
        throw error;
    }
  }
}
async function withImsgAutomationRuntime(auth, options, operation) {
  if (options.registerCleanupBarrier === undefined)
    throw new Error("Messaging automation requires durable provider cleanup custody");
  return startProviderPluginCleanupTrackedOperation(options.registerCleanupBarrier, (publish, cleanup) => withRuntime(requireImsgAuth(auth), 30000, 10 * 1024 * 1024, options.dependencies, options.environment ?? process.env, options.operationDeadline, publish, cleanup, true, operation));
}
var imsgAutomationProjection = Object.freeze({ parseChats, parseChat, parseMessages, parseMessage, exactChat, parseSendAccepted });
async function inspectImsgDirectRuntime(environment) {
  let artifact;
  try {
    artifact = imsgArtifactForCurrentRuntime();
    await resolvePinnedImsgBinary(environment);
    return Object.freeze({
      ready: true,
      platform: artifact.platform,
      arch: artifact.arch,
      version: IMSG_REVIEWED_VERSION,
      executableSha256: artifact.executableSha256,
      reason: null
    });
  } catch {
    return Object.freeze({
      ready: false,
      platform: process.platform,
      arch: process.arch,
      version: null,
      executableSha256: null,
      reason: "the exact reviewed direct-iMessage executable is unavailable or failed integrity verification"
    });
  }
}
async function probeImsgDirectSubject(authValue, options = {}) {
  const auth = requireImsgAuth(authValue);
  const deadline = new OperationDeadline(SUBJECT_PROBE_TIMEOUT_MS, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  try {
    return await startProviderPluginCleanupTrackedOperation(options.registerCleanupBarrier, async (publishCleanupResource, cleanup) => withRuntime(auth, SUBJECT_PROBE_TIMEOUT_MS, MAX_STATUS_BYTES, options.dependencies, options.environment ?? process.env, deadline, publishCleanupResource, cleanup, options.registerCleanupBarrier !== undefined, async ({ subject }) => subject));
  } catch (error) {
    if (error instanceof ImsgCleanupUnverifiedError)
      throw error;
    throw new Error("direct iMessage status probe failed at a protected local boundary");
  } finally {
    deadline.dispose();
  }
}
function dispatchEvent(action, started, verified) {
  return Object.freeze({
    id: action,
    index: 1,
    progress: Object.freeze({ planned: 1, started, verified })
  });
}
function uncertainOutput(outcome) {
  return Object.freeze({
    provider: "imessage",
    operation: "messaging.send",
    accountSelection: IMSG_ACCOUNT_SELECTION,
    service: IMSG_SERVICE,
    transport: IMSG_TRANSPORT,
    smsFallback: IMSG_SMS_FALLBACK,
    transportOutcome: outcome,
    retryAuthorized: false
  });
}
function parseImsgPrivateIndeterminateOutcome(value) {
  const source = record(value, "direct iMessage indeterminate output");
  exactKeys(source, [
    "provider",
    "operation",
    "accountSelection",
    "service",
    "transport",
    "smsFallback",
    "transportOutcome",
    "retryAuthorized"
  ], [], "direct iMessage indeterminate output");
  const outcome = source.transportOutcome;
  if (source.provider !== "imessage" || source.operation !== "messaging.send" || source.accountSelection !== IMSG_ACCOUNT_SELECTION || source.service !== IMSG_SERVICE || source.transport !== IMSG_TRANSPORT || source.smsFallback !== IMSG_SMS_FALLBACK || source.retryAuthorized !== false || outcome !== "not_started" && outcome !== "may_have_completed" && outcome !== "still_in_flight" && outcome !== "unknown_post_dispatch")
    throw new Error("direct iMessage indeterminate output is malformed");
  return outcome;
}
async function executeImsgDirectOperation(recipe, inputValue, authValue, options = {}) {
  if (recipe.surface !== "imessage" || recipe.contractVersion !== 1 || !isImsgDirectOperation(recipe.action))
    throw new Error("direct iMessage local CLI recipe is not installed");
  const action = recipe.action;
  const contract = IMSG_DIRECT_OPERATIONS[action];
  const input = parseImsgDirectOperationInput(action, inputValue);
  const auth = requireImsgAuth(authValue);
  options.operationDeadline?.throwIfUnavailable(OPERATION_LABEL);
  let started = 0;
  let verified = 0;
  try {
    return await startProviderPluginCleanupTrackedOperation(options.registerCleanupBarrier, async (publishCleanupResource, cleanup) => withRuntime(auth, recipe.timeoutMs, recipe.maxOutputBytes, options.dependencies, options.environment ?? process.env, options.operationDeadline, publishCleanupResource, cleanup, options.registerCleanupBarrier !== undefined, async ({ run, subject }) => {
      const requests = imsgOperationRequests(action, input);
      const beforeSpawn = contract.effect === "write" ? async () => {
        await options.beforeDispatch?.(dispatchEvent(action, started, verified));
        started = 1;
      } : undefined;
      const responses = await run(requests, beforeSpawn);
      const output = operationOutput(action, input, responses, subject);
      if (contract.effect === "write") {
        if (started !== 1)
          throw new Error("imsg runner omitted dispatch spawn accounting");
        const accepted = record(output, "imsg accepted output");
        const target = Object.freeze({
          schemaVersion: 1,
          identifier: canonicalJson({
            chatGuid: accepted.chatGuid,
            chatRowId: accepted.chatRowId,
            messageGuid: accepted.messageGuid,
            service: accepted.service
          })
        });
        await options.afterProviderAcceptedMutationTarget?.({
          id: action,
          index: 1,
          target
        });
        await options.afterDispatchVerified?.(dispatchEvent(action, started, 1));
        verified = 1;
      }
      return Object.freeze({
        status: "succeeded",
        output,
        finalUrl: IMSG_ORIGIN,
        dispatchStarted: started > 0,
        dispatch: Object.freeze({
          planned: contract.effect === "write" ? 1 : 0,
          started,
          verified
        })
      });
    }));
  } catch (error) {
    if (error instanceof ImsgCleanupUnverifiedError)
      throw error;
    const postDispatch = started > 0;
    const outcome = error instanceof ImsgRpcFailure && error.outcome !== null ? error.outcome : postDispatch ? "unknown_post_dispatch" : null;
    return Object.freeze({
      status: postDispatch ? "indeterminate" : "failed",
      output: outcome === null ? null : uncertainOutput(outcome),
      finalUrl: IMSG_ORIGIN,
      dispatchStarted: postDispatch,
      dispatch: Object.freeze({
        planned: contract.effect === "write" ? 1 : 0,
        started,
        verified
      }),
      error: postDispatch ? "direct iMessage dispatch lacks durable exact acceptance evidence; no retry is authorized" : "direct iMessage operation failed before dispatch"
    });
  }
}
async function executeImsgDirectMessagingPart(recipe, inputValue, authValue, options = {}) {
  if (recipe.action !== "messaging.send") {
    throw new Error("direct iMessage messaging-part execution requires messaging.send");
  }
  const { afterIndeterminateOutcome, ...executionOptions } = options;
  const result = await executeImsgDirectOperation(recipe, inputValue, authValue, executionOptions);
  if (result.status === "indeterminate") {
    if (result.dispatchStarted !== true || result.dispatch.started !== 1 || result.dispatch.verified !== 0 || result.output === null)
      throw new Error("direct iMessage indeterminate dispatch evidence is malformed");
    const outcome = parseImsgPrivateIndeterminateOutcome(result.output);
    await afterIndeterminateOutcome?.(outcome);
  }
  return result;
}
function parseAcceptedTarget(context) {
  if (context?.kind !== "provider-accepted-target-presence") {
    throw new Error("direct iMessage reconciliation requires exact accepted target evidence");
  }
  let parsed;
  try {
    parsed = JSON.parse(context.target.identifier);
  } catch {
    throw new Error("direct iMessage accepted target is malformed");
  }
  if (canonicalJson(parsed) !== context.target.identifier) {
    throw new Error("direct iMessage accepted target is not canonical");
  }
  const source = record(parsed, "direct iMessage accepted target");
  exactKeys(source, ["chatGuid", "chatRowId", "messageGuid", "service"], [], "direct iMessage accepted target");
  if (source.service !== IMSG_SERVICE) {
    throw new Error("direct iMessage accepted target changed service");
  }
  return Object.freeze({
    chatGuid: boundedImsgString(source.chatGuid, "accepted target chat GUID", 2048),
    chatRowId: integer(source.chatRowId, "accepted target chat row", 1),
    messageGuid: boundedImsgString(source.messageGuid, "accepted target message GUID", 2048),
    service: IMSG_SERVICE
  });
}
async function reconcileImsgDirectOperation(operation, inputValue, authValue, context, options = {}) {
  if (operation !== "messaging.send") {
    throw new Error("direct iMessage reconciliation is available only for accepted sends");
  }
  parseImsgDirectOperationInput("messaging.send", inputValue);
  const target = parseAcceptedTarget(context);
  const auth = requireImsgAuth(authValue);
  const deadline = new OperationDeadline(SUBJECT_PROBE_TIMEOUT_MS, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  try {
    return await startProviderPluginCleanupTrackedOperation(options.registerCleanupBarrier, async (publishCleanupResource, cleanup) => withRuntime(auth, SUBJECT_PROBE_TIMEOUT_MS, MAX_STATUS_BYTES, options.dependencies, options.environment ?? process.env, deadline, publishCleanupResource, cleanup, options.registerCleanupBarrier !== undefined, async ({ run }) => {
      const responses = await run(imsgOperationRequests("messaging.delivery.read", Object.freeze({
        chatGuid: target.chatGuid,
        observedChatRowId: target.chatRowId,
        service: target.service,
        messageGuid: target.messageGuid
      })));
      const delivery = record(parseDelivery(responses.get("operation"), target.messageGuid), "direct iMessage reconciliation delivery");
      return Object.freeze({
        actualState: delivery.present === true,
        reason: delivery.present === true ? "the exact independently observed outgoing GUID remains present in the local Messages database" : "the exact outgoing GUID has no current local Messages status row"
      });
    }));
  } finally {
    deadline.dispose();
  }
}
var IMSG_DIRECT_ARTIFACT_IDENTITY = IMSG_TOOL_PIN;

export { runImsgRpc, withImsgAutomationRuntime, imsgAutomationProjection, inspectImsgDirectRuntime, probeImsgDirectSubject, parseImsgPrivateIndeterminateOutcome, executeImsgDirectOperation, executeImsgDirectMessagingPart, reconcileImsgDirectOperation, IMSG_DIRECT_ARTIFACT_IDENTITY };
