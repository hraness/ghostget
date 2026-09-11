// @bun
import {
  WHATSAPP_PROTOCOL_PIN,
  WHATSAPP_WEB_OPERATIONS,
  WHATSAPP_WEB_OPERATION_NAMES,
  parseWhatsAppAuthStatusEnvelope,
  parseWhatsAppJid,
  projectWhatsAppChatsEnvelope,
  projectWhatsAppMessageEnvelope,
  projectWhatsAppMessagesEnvelope,
  whatsappMessageId,
  whatsappTargetJid
} from "./index-vnc8xn67.js";
import {
  projectContactDirectionStats
} from "./index-f30rdtbs.js";
import {
  assertSafeStatePath,
  ghostgetStateHome
} from "./index-0ywm1fj9.js";
import {
  startWebSessionCleanupTrackedOperation
} from "./index-aka7rgdj.js";
import {
  OperationDeadline
} from "./index-vtj5zdgf.js";
import {
  canonicalJson
} from "./index-8sbt8qwx.js";

// src/providers/whatsapp-web-runtime.ts
import { createHash } from "crypto";
import {
  constants as fsConstants,
  createReadStream
} from "fs";
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readdir,
  realpath,
  rmdir,
  unlink
} from "fs/promises";
import { tmpdir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";
import { BoundedByteBuffer } from "@hraness/kb/clip/bounded-byte-buffer";

// src/providers/whatsapp-contact-projection-protocol.ts
var WHATSAPP_CONTACT_PROJECTION_PROTOCOL_VERSION = 1;
var WHATSAPP_CONTACT_PROJECTION_MAX_LIMIT = 100;
var WHATSAPP_CONTACT_PROJECTION_MAX_STDIN_BYTES = 8 * 1024;
var WHATSAPP_CONTACT_PROJECTION_MAX_STDOUT_BYTES = 1024 * 1024;
function isExactWhatsAppContactProjectionMode(mode, expected) {
  return typeof mode === "bigint" ? (mode & 0o7777n) === BigInt(expected) : Number.isSafeInteger(mode) && (mode & 4095) === expected;
}
var MAX_JID_LENGTH = 96;
var MAX_NAME_LENGTH = 512;
var MAX_REDACTED_PHONE_LENGTH = 64;
var PN_SUBJECT_PATTERN = /^whatsapp:pn:([0-9]{5,20})$/u;
var LID_SUBJECT_PATTERN = /^whatsapp:lid:([0-9]{5,32})$/u;
var CONTACT_PN_JID_PATTERN = /^([0-9]{5,20})@s\.whatsapp\.net$/u;
var CONTACT_LID_JID_PATTERN = /^([0-9]{5,32})@lid$/u;
var WHATSAPP_CONTACT_PROJECTION_ERROR_CODES = Object.freeze([
  "request-invalid",
  "store-binding-invalid",
  "session-file-invalid",
  "session-file-too-large",
  "session-sidecar-present",
  "session-sidecar-state-unverified",
  "session-read-failed",
  "database-invalid",
  "database-integrity-failed",
  "schema-mismatch",
  "owner-mismatch",
  "projection-invalid",
  "output-too-large"
]);
function fail(label) {
  throw new Error(`${label} did not match the WhatsApp contact projection protocol`);
}
function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    return fail(label);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string")
      return fail(label);
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable)
      return fail(label);
  }
  return value;
}
function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index]))
    fail(label);
}
function parseWhatsAppContactProjectionSubject(value) {
  if (typeof value !== "string")
    return fail("accountSubject");
  const pn = PN_SUBJECT_PATTERN.exec(value);
  if (pn !== null && pn[1] !== undefined) {
    return Object.freeze({ kind: "pn", id: pn[1], subject: value });
  }
  const lid = LID_SUBJECT_PATTERN.exec(value);
  if (lid !== null && lid[1] !== undefined) {
    return Object.freeze({ kind: "lid", id: lid[1], subject: value });
  }
  return fail("accountSubject");
}
function parseWhatsAppContactProjectionJid(value) {
  if (typeof value !== "string" || value.length > MAX_JID_LENGTH) {
    return fail("contact JID");
  }
  const phone = CONTACT_PN_JID_PATTERN.exec(value);
  const lid = CONTACT_LID_JID_PATTERN.exec(value);
  const id = phone?.[1] ?? lid?.[1];
  if (id === undefined) {
    return fail("contact JID");
  }
  return Object.freeze({
    jid: value,
    id,
    kind: phone === null ? "lid" : "user"
  });
}
function optionalText(value, maximum, label) {
  if (value === null)
    return null;
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    return fail(label);
  return value;
}
function contact(value, label) {
  const parsed = record(value, label);
  exactKeys(parsed, [
    "providerId",
    "jidKind",
    "phone",
    "redactedPhone",
    "firstName",
    "fullName",
    "pushName",
    "businessName",
    "displayName",
    "displayNameBasis"
  ], label);
  const jid = parseWhatsAppContactProjectionJid(parsed.providerId);
  if (parsed.jidKind !== jid.kind)
    fail(`${label}.jidKind`);
  const phone = optionalText(parsed.phone, 32, `${label}.phone`);
  if (jid.kind === "user" && phone !== jid.id || jid.kind === "lid" && phone !== null)
    fail(`${label}.phone`);
  const redactedPhone = optionalText(parsed.redactedPhone, MAX_REDACTED_PHONE_LENGTH, `${label}.redactedPhone`);
  const firstName = optionalText(parsed.firstName, MAX_NAME_LENGTH, `${label}.firstName`);
  const fullName = optionalText(parsed.fullName, MAX_NAME_LENGTH, `${label}.fullName`);
  const pushName = optionalText(parsed.pushName, MAX_NAME_LENGTH, `${label}.pushName`);
  const businessName = optionalText(parsed.businessName, MAX_NAME_LENGTH, `${label}.businessName`);
  const displayName = optionalText(parsed.displayName, MAX_NAME_LENGTH, `${label}.displayName`);
  const candidates = [
    [fullName, "full-name"],
    [pushName, "push-name"],
    [businessName, "business-name"],
    [firstName, "first-name"],
    [redactedPhone, "redacted-phone"],
    [phone, "phone"]
  ];
  const selected = candidates.find(([value2]) => value2 !== null);
  const expectedDisplayName = selected?.[0] ?? null;
  const displayNameBasis = selected?.[1] ?? "unavailable";
  if (parsed.displayNameBasis !== displayNameBasis) {
    fail(`${label}.displayNameBasis`);
  }
  if (displayName !== expectedDisplayName)
    fail(`${label}.displayName`);
  return Object.freeze({
    providerId: jid.jid,
    jidKind: jid.kind,
    phone,
    redactedPhone,
    firstName,
    fullName,
    pushName,
    businessName,
    displayName,
    displayNameBasis
  });
}
function errorCode(value) {
  if (typeof value !== "string" || !WHATSAPP_CONTACT_PROJECTION_ERROR_CODES.includes(value))
    return fail("response.errorCode");
  return value;
}
function parseWhatsAppContactProjectionResponse(value, request) {
  const parsed = record(value, "response");
  if (parsed.status === "failed") {
    exactKeys(parsed, ["schemaVersion", "status", "errorCode"], "response");
    if (parsed.schemaVersion !== WHATSAPP_CONTACT_PROJECTION_PROTOCOL_VERSION) {
      fail("response.schemaVersion");
    }
    return Object.freeze({
      schemaVersion: WHATSAPP_CONTACT_PROJECTION_PROTOCOL_VERSION,
      status: "failed",
      errorCode: errorCode(parsed.errorCode)
    });
  }
  exactKeys(parsed, [
    "schemaVersion",
    "status",
    "contacts",
    "nextCursor",
    "localContactTablePageComplete"
  ], "response");
  if (parsed.schemaVersion !== WHATSAPP_CONTACT_PROJECTION_PROTOCOL_VERSION || parsed.status !== "succeeded" || !Array.isArray(parsed.contacts) || parsed.contacts.length > WHATSAPP_CONTACT_PROJECTION_MAX_LIMIT || typeof parsed.localContactTablePageComplete !== "boolean")
    fail("response");
  if (request !== undefined && (parsed.contacts.length > request.limit || !parsed.localContactTablePageComplete && parsed.contacts.length !== request.limit)) {
    fail("response.contacts");
  }
  const contacts = parsed.contacts.map((item, index) => contact(item, `response.contacts[${index}]`));
  for (let index = 0;index < contacts.length; index += 1) {
    const current = contacts[index];
    const previous = index === 0 ? request?.cursor : contacts[index - 1]?.providerId;
    if (previous !== undefined && previous !== null && current.providerId <= previous) {
      fail("response.contacts ordering");
    }
  }
  const nextCursor = parsed.nextCursor === null ? null : parseWhatsAppContactProjectionJid(parsed.nextCursor).jid;
  if (parsed.localContactTablePageComplete && nextCursor !== null || !parsed.localContactTablePageComplete && (contacts.length === 0 || nextCursor !== contacts.at(-1)?.providerId))
    fail("response.nextCursor");
  return Object.freeze({
    schemaVersion: WHATSAPP_CONTACT_PROJECTION_PROTOCOL_VERSION,
    status: "succeeded",
    contacts: Object.freeze(contacts),
    nextCursor,
    localContactTablePageComplete: parsed.localContactTablePageComplete
  });
}

// src/providers/whatsapp-interaction-projection-protocol.ts
import { types as nodeTypes } from "util";
var WHATSAPP_INTERACTION_PROJECTION_PROTOCOL_VERSION = 1;
var WHATSAPP_INTERACTION_PROJECTION_MAX_LIMIT = 1000;
var WHATSAPP_INTERACTION_PROJECTION_MAX_STDIN_BYTES = 8 * 1024;
var WHATSAPP_INTERACTION_PROJECTION_MAX_STDOUT_BYTES = 1024 * 1024;
var WHATSAPP_INTERACTION_PROJECTION_SCHEMA_FINGERPRINT = "sha256:994b5024bc2479a269866060ea14a06230532b5aba8365d31b1f94113df3bc57";
var MAX_ROWID = 9223372036854775807n;
var ROWID_PATTERN = /^(?:0|[1-9][0-9]{0,18})$/u;
var PN_SUBJECT_PATTERN2 = /^whatsapp:pn:[0-9]{5,20}$/u;
var LID_SUBJECT_PATTERN2 = /^whatsapp:lid:[0-9]{5,32}$/u;
var JID_PATTERNS = [
  /^0@s\.whatsapp\.net$/u,
  /^[0-9]{5,20}(?::[0-9]{1,5})?@s\.whatsapp\.net$/u,
  /^[0-9]{5,32}(?::[0-9]{1,5})?@lid$/u,
  /^[0-9]{5,32}(?:-[0-9]{5,20})?@g\.us$/u,
  /^[0-9]{5,32}@newsletter$/u,
  /^(?:status|[0-9]{5,32})@broadcast$/u
];
var MESSAGE_ID_PATTERN = /^[A-Za-z0-9._~:-]{1,256}$/u;
var SHA256_PATTERN = /^[a-f0-9]{64}$/u;
var CHAT_KINDS = new Set(["dm", "group", "broadcast", "newsletter", "unknown"]);
var WHATSAPP_INTERACTION_PROJECTION_ERROR_CODES = Object.freeze([
  "request-invalid",
  "store-binding-invalid",
  "session-binding-invalid",
  "message-store-file-invalid",
  "message-store-file-too-large",
  "message-store-sidecar-present",
  "message-store-sidecar-state-unverified",
  "database-invalid",
  "database-integrity-failed",
  "schema-mismatch",
  "owner-mismatch",
  "generation-mismatch",
  "projection-invalid",
  "output-too-large"
]);
function fail2(label) {
  throw new Error(`${label} did not match the WhatsApp interaction projection protocol`);
}
function record2(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    return fail2(label);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string")
      return fail2(label);
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
      return fail2(label);
    }
  }
  return value;
}
function denseArray(value, label, maximum) {
  if (!Array.isArray(value) || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum)
    return fail2(label);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some((key) => typeof key !== "string")) {
    return fail2(label);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (lengthDescriptor === undefined || lengthDescriptor.enumerable || !("value" in lengthDescriptor) || lengthDescriptor.value !== value.length)
    return fail2(label);
  for (let index = 0;index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
      return fail2(label);
    }
  }
  return value;
}
function exactKeys2(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail2(label);
  }
}
function fileIdentity(value, label) {
  const parsed = record2(value, label);
  exactKeys2(parsed, ["dev", "ino"], label);
  if (typeof parsed.dev !== "string" || !ROWID_PATTERN.test(parsed.dev) || typeof parsed.ino !== "string" || !ROWID_PATTERN.test(parsed.ino) || BigInt(parsed.ino) === 0n)
    fail2(label);
  return Object.freeze({ dev: parsed.dev, ino: parsed.ino });
}
function parseWhatsAppInteractionRowid(value, label = "rowid") {
  if (typeof value !== "string" || !ROWID_PATTERN.test(value) || BigInt(value) > MAX_ROWID) {
    return fail2(label);
  }
  return value;
}
function accountSubject(value) {
  if (typeof value !== "string" || !PN_SUBJECT_PATTERN2.test(value) && !LID_SUBJECT_PATTERN2.test(value)) {
    return fail2("accountSubject");
  }
  return value;
}
function legacyInteractionAccountSubjectJid(subject) {
  const match = /^whatsapp:(pn|lid):([0-9]+)$/u.exec(subject);
  if (match?.[1] === undefined || match[2] === undefined)
    return fail2("accountSubject");
  return match[1] === "pn" ? `${match[2]}@s.whatsapp.net` : `${match[2]}@lid`;
}
function legacyInteractionParticipantJid(value) {
  const match = /^([0-9]{5,32})(?::[0-9]{1,5})?@(s\.whatsapp\.net|lid)$/u.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) {
    return fail2("response.interactions sender direction");
  }
  return `${match[1]}@${match[2]}`;
}
function jid(value, label, nullable = false, allowDevice = false) {
  if (nullable && (value === null || value === ""))
    return null;
  if (typeof value !== "string" || value.length > 96 || !allowDevice && value.includes(":"))
    return fail2(label);
  if (!JID_PATTERNS.some((pattern) => pattern.test(value)))
    return fail2(label);
  return value;
}
function timestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(value) || !Number.isFinite(Date.parse(value)))
    return fail2(label);
  return value;
}
function parseWhatsAppInteractionProjectionRequest(value) {
  const parsed = record2(value, "request");
  exactKeys2(parsed, [
    "schemaVersion",
    "operation",
    "accountSubject",
    "cursor",
    "limit",
    "cursorAnchor",
    "storeIdentity",
    "sessionIdentity",
    "messageStoreIdentity"
  ], "request");
  if (parsed.schemaVersion !== WHATSAPP_INTERACTION_PROJECTION_PROTOCOL_VERSION || parsed.operation !== "contacts.interactions.list" || typeof parsed.limit !== "number" || !Number.isSafeInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > WHATSAPP_INTERACTION_PROJECTION_MAX_LIMIT)
    fail2("request");
  const cursor = parseWhatsAppInteractionRowid(parsed.cursor, "request.cursor");
  const cursorAnchor = parsed.cursorAnchor === null ? null : typeof parsed.cursorAnchor === "string" && SHA256_PATTERN.test(parsed.cursorAnchor) ? parsed.cursorAnchor : fail2("request.cursorAnchor");
  if (cursor === "0" !== (cursorAnchor === null))
    fail2("request.cursorAnchor");
  return Object.freeze({
    schemaVersion: WHATSAPP_INTERACTION_PROJECTION_PROTOCOL_VERSION,
    operation: "contacts.interactions.list",
    accountSubject: accountSubject(parsed.accountSubject),
    cursor,
    cursorAnchor,
    limit: parsed.limit,
    storeIdentity: fileIdentity(parsed.storeIdentity, "request.storeIdentity"),
    sessionIdentity: fileIdentity(parsed.sessionIdentity, "request.sessionIdentity"),
    messageStoreIdentity: fileIdentity(parsed.messageStoreIdentity, "request.messageStoreIdentity")
  });
}
function interaction(value, label) {
  const parsed = record2(value, label);
  exactKeys2(parsed, [
    "rowid",
    "chatJid",
    "messageId",
    "senderJid",
    "timestamp",
    "fromMe",
    "chatKind"
  ], label);
  const rowid = parseWhatsAppInteractionRowid(parsed.rowid, `${label}.rowid`);
  if (BigInt(rowid) < 1n)
    fail2(`${label}.rowid`);
  const messageId = parsed.messageId;
  if (typeof messageId !== "string" || !MESSAGE_ID_PATTERN.test(messageId) || typeof parsed.fromMe !== "boolean" || typeof parsed.chatKind !== "string" || !CHAT_KINDS.has(parsed.chatKind))
    fail2(label);
  const chatJid = jid(parsed.chatJid, `${label}.chatJid`);
  const senderJid = jid(parsed.senderJid, `${label}.senderJid`, true, true);
  if (parsed.chatKind === "dm" && !chatJid.endsWith("@s.whatsapp.net") && !chatJid.endsWith("@lid") || parsed.chatKind === "group" && !chatJid.endsWith("@g.us"))
    fail2(`${label}.chatKind`);
  return Object.freeze({
    rowid,
    chatJid,
    messageId,
    senderJid,
    timestamp: timestamp(parsed.timestamp, `${label}.timestamp`),
    fromMe: parsed.fromMe,
    chatKind: parsed.chatKind
  });
}
function accountJidAliases(value, subject) {
  const parsed = record2(value, "response.accountJidAliases");
  exactKeys2(parsed, ["pnJid", "lidJid"], "response.accountJidAliases");
  const pnJid = typeof parsed.pnJid === "string" && /^[1-9][0-9]{4,14}@s\.whatsapp\.net$/u.test(parsed.pnJid) ? parsed.pnJid : fail2("response.accountJidAliases.pnJid");
  const lidJid = parsed.lidJid === null ? null : typeof parsed.lidJid === "string" && /^[1-9][0-9]{4,19}@lid$/u.test(parsed.lidJid) ? parsed.lidJid : fail2("response.accountJidAliases.lidJid");
  if (subject !== undefined) {
    const bound = legacyInteractionAccountSubjectJid(subject);
    if (bound !== pnJid && bound !== lidJid)
      fail2("response.accountJidAliases binding");
  }
  return Object.freeze({ pnJid, lidJid });
}
function parseWhatsAppInteractionProjectionResponse(value, request) {
  const parsed = record2(value, "response");
  if (parsed.status === "failed") {
    exactKeys2(parsed, ["schemaVersion", "status", "errorCode"], "response");
    if (parsed.schemaVersion !== WHATSAPP_INTERACTION_PROJECTION_PROTOCOL_VERSION || typeof parsed.errorCode !== "string" || !WHATSAPP_INTERACTION_PROJECTION_ERROR_CODES.includes(parsed.errorCode))
      fail2("response");
    return Object.freeze({
      schemaVersion: WHATSAPP_INTERACTION_PROJECTION_PROTOCOL_VERSION,
      status: "failed",
      errorCode: parsed.errorCode
    });
  }
  exactKeys2(parsed, [
    "schemaVersion",
    "status",
    "projectionGeneration",
    "interactions",
    "nextCursor",
    "localInsertPageComplete",
    "checkpoint",
    "accountJidAliases"
  ], "response");
  if (parsed.schemaVersion !== WHATSAPP_INTERACTION_PROJECTION_PROTOCOL_VERSION || parsed.status !== "succeeded" || typeof parsed.localInsertPageComplete !== "boolean")
    fail2("response");
  const rawInteractions = denseArray(parsed.interactions, "response.interactions", WHATSAPP_INTERACTION_PROJECTION_MAX_LIMIT);
  const projectionGeneration = record2(parsed.projectionGeneration, "response.projectionGeneration");
  exactKeys2(projectionGeneration, [
    "messageStoreIdentity",
    "schemaFingerprint"
  ], "response.projectionGeneration");
  const messageStoreIdentity = fileIdentity(projectionGeneration.messageStoreIdentity, "response.projectionGeneration.messageStoreIdentity");
  if (projectionGeneration.schemaFingerprint !== WHATSAPP_INTERACTION_PROJECTION_SCHEMA_FINGERPRINT || request !== undefined && (messageStoreIdentity.dev !== request.messageStoreIdentity.dev || messageStoreIdentity.ino !== request.messageStoreIdentity.ino))
    fail2("response.projectionGeneration");
  if (request !== undefined && (rawInteractions.length > request.limit || !parsed.localInsertPageComplete && rawInteractions.length !== request.limit))
    fail2("response.interactions");
  const interactions = rawInteractions.map((item, index) => interaction(item, `response.interactions[${index}]`));
  const aliases = accountJidAliases(parsed.accountJidAliases, request?.accountSubject);
  if (request?.accountSubject !== undefined) {
    const selfJids = new Set([aliases.pnJid, aliases.lidJid].filter((value2) => value2 !== null));
    for (const item of interactions) {
      if (item.chatKind !== "dm" && item.chatKind !== "group")
        continue;
      const senderJid = item.senderJid === null ? null : legacyInteractionParticipantJid(item.senderJid);
      const valid = item.chatKind === "dm" ? senderJid === null || (item.fromMe ? selfJids.has(senderJid) : senderJid === item.chatJid) : senderJid === null || (item.fromMe ? selfJids.has(senderJid) : !selfJids.has(senderJid));
      if (!valid)
        fail2("response.interactions sender direction");
    }
  }
  for (let index = 0;index < interactions.length; index += 1) {
    const previous = index === 0 ? request?.cursor : interactions[index - 1]?.rowid;
    if (previous !== undefined && BigInt(interactions[index].rowid) <= BigInt(previous)) {
      fail2("response.interactions ordering");
    }
  }
  const nextCursor = parsed.nextCursor === null ? null : parseWhatsAppInteractionRowid(parsed.nextCursor, "response.nextCursor");
  if (parsed.localInsertPageComplete && nextCursor !== null || !parsed.localInsertPageComplete && (interactions.length === 0 || nextCursor !== interactions.at(-1)?.rowid))
    fail2("response.nextCursor");
  const checkpoint = record2(parsed.checkpoint, "response.checkpoint");
  exactKeys2(checkpoint, ["cursor", "anchor"], "response.checkpoint");
  const checkpointCursor = parseWhatsAppInteractionRowid(checkpoint.cursor, "response.checkpoint.cursor");
  const checkpointAnchor = checkpoint.anchor === null ? null : typeof checkpoint.anchor === "string" && SHA256_PATTERN.test(checkpoint.anchor) ? checkpoint.anchor : fail2("response.checkpoint.anchor");
  if (checkpointCursor === "0" !== (checkpointAnchor === null) || interactions.length > 0 && checkpointCursor !== interactions.at(-1)?.rowid || interactions.length === 0 && request !== undefined && (checkpointCursor !== request.cursor || checkpointAnchor !== request.cursorAnchor) || !parsed.localInsertPageComplete && nextCursor !== checkpointCursor)
    fail2("response.checkpoint");
  return Object.freeze({
    schemaVersion: WHATSAPP_INTERACTION_PROJECTION_PROTOCOL_VERSION,
    status: "succeeded",
    projectionGeneration: Object.freeze({
      messageStoreIdentity,
      schemaFingerprint: WHATSAPP_INTERACTION_PROJECTION_SCHEMA_FINGERPRINT
    }),
    accountJidAliases: aliases,
    interactions: Object.freeze(interactions),
    nextCursor,
    localInsertPageComplete: parsed.localInsertPageComplete,
    checkpoint: Object.freeze({ cursor: checkpointCursor, anchor: checkpointAnchor })
  });
}

// src/providers/whatsapp-web-runtime.ts
var WHATSAPP_ORIGIN = "https://web.whatsapp.com";
var DEFAULT_LIMIT = 50;
var MAX_STDERR_BYTES = 64 * 1024;
var MAX_STORE_ENTRIES = 1e4;
var MAX_SYNC_MESSAGES = 200000;
var MAX_SYNC_DB_SIZE = "2GB";
var MAX_CONTACT_PROJECTION_STDERR_BYTES = 16 * 1024;
var CONTACT_PROJECTION_FORCE_KILL_DELAY_MS = 1000;
var MESSAGE_EXPORT_SESSION_MAX_TOTAL_STDOUT_BYTES = 512 * 1024 * 1024;
var MESSAGE_EXPORT_SESSION_MAX_FRAMES = 1001;
var MESSAGE_EXPORT_SESSION_SPOOL_CHUNK_BYTES = 64 * 1024;
var MESSAGE_EXPORT_SESSION_PRIVATE_DIRECTORY_MODE = 448;
var MESSAGE_EXPORT_SESSION_PRIVATE_FILE_MODE = 384;
var WEB_SESSION_OPERATION_LABEL = "authenticated web operation deadline";

class WhatsAppContactProjectionCleanupUnverifiedError extends Error {
  constructor() {
    super("WhatsApp contact projection helper cleanup could not be verified");
    this.name = "WhatsAppContactProjectionCleanupUnverifiedError";
  }
}
function containsWhatsAppContactProjectionCleanupUnverified(error) {
  const pending = [error];
  const visited = new Set;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current instanceof WhatsAppContactProjectionCleanupUnverifiedError)
      return true;
    if (typeof current !== "object" || current === null || visited.has(current))
      continue;
    visited.add(current);
    if (current instanceof AggregateError) {
      try {
        pending.push(...current.errors);
      } catch {
        return true;
      }
    }
    try {
      if ("cause" in current)
        pending.push(current.cause);
    } catch {
      return true;
    }
  }
  return false;
}
function isWhatsAppOperation(value) {
  return WHATSAPP_WEB_OPERATION_NAMES.includes(value);
}
function requireWhatsAppAuth(auth) {
  if (auth.kind !== "linked-device-store" || auth.provider !== "whatsapp") {
    throw new Error("WhatsApp protocol operations require a WhatsApp linked-device-store auth realm");
  }
  if (!isAbsolute(auth.path)) {
    throw new Error("WhatsApp linked-device store path must be absolute");
  }
  return auth;
}
function ownedByCurrentUser(stats) {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  return uid === null || stats.uid === uid;
}
function assertPrivateOwned(stats, label, kind) {
  const matchesKind = kind === "directory" ? stats.isDirectory() : kind === "file" ? stats.isFile() : stats.isSocket();
  if (!matchesKind || !ownedByCurrentUser(stats)) {
    throw new Error(`${label} must be an owned ${kind}`);
  }
  if ((stats.mode & 63) !== 0) {
    throw new Error(`${label} must not grant group or world access`);
  }
}
async function validateWhatsAppStoreDirectory(pathValue, purpose) {
  if (!isAbsolute(pathValue)) {
    throw new Error("WhatsApp linked-device store path must be absolute");
  }
  const lexical = resolve(pathValue);
  let directoryStats;
  try {
    directoryStats = await lstat(lexical);
  } catch (error) {
    if (purpose === "pair" && typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      await mkdir(lexical, { recursive: true, mode: 448 });
      await chmod(lexical, 448);
      directoryStats = await lstat(lexical);
    } else {
      throw new Error("WhatsApp linked-device store is unavailable");
    }
  }
  if (directoryStats.isSymbolicLink()) {
    throw new Error("WhatsApp linked-device store must not be a symbolic link");
  }
  assertPrivateOwned(directoryStats, "WhatsApp linked-device store", "directory");
  const canonical = await realpath(lexical);
  if (canonical !== lexical) {
    throw new Error("WhatsApp linked-device store path must be canonical");
  }
  const entries = await readdir(canonical, { withFileTypes: true });
  if (entries.length > MAX_STORE_ENTRIES) {
    throw new Error("WhatsApp linked-device store has too many entries");
  }
  for (const entry of entries) {
    if (entry.name.length < 1 || entry.name.length > 255 || entry.name.includes("\x00") || entry.isSymbolicLink())
      throw new Error("WhatsApp linked-device store contains an unsafe entry");
    const entryPath = join(canonical, entry.name);
    const stats = await lstat(entryPath);
    if (stats.isSymbolicLink()) {
      throw new Error("WhatsApp linked-device store contains a symbolic link");
    }
    if (stats.isDirectory()) {
      assertPrivateOwned(stats, "WhatsApp linked-device store entry", "directory");
    } else if (stats.isFile()) {
      assertPrivateOwned(stats, "WhatsApp linked-device store entry", "file");
    } else if (stats.isSocket()) {
      assertPrivateOwned(stats, "WhatsApp linked-device store entry", "socket");
    } else {
      throw new Error("WhatsApp linked-device store contains an unsupported entry");
    }
  }
  const requireRegular = async (name) => {
    let stats;
    try {
      stats = await lstat(join(canonical, name));
    } catch {
      throw new Error(`WhatsApp linked-device store omitted ${name}`);
    }
    assertPrivateOwned(stats, `WhatsApp ${name}`, "file");
  };
  if (purpose === "sync" || purpose === "projection" || purpose === "contact-projection") {
    await requireRegular("session.db");
  }
  if (purpose === "projection") {
    await requireRegular("wacli.db");
  }
  return canonical;
}
async function sha256File(path) {
  const hash = createHash("sha256");
  const stream = createReadStream(path, { flags: "r" });
  for await (const chunkValue of stream) {
    const chunk = chunkValue;
    if (!Buffer.isBuffer(chunk)) {
      throw new Error("WhatsApp protocol binary stream returned non-byte data");
    }
    hash.update(chunk);
  }
  return hash.digest("hex");
}
async function runFixedCodesign(arguments_, signal) {
  const isAborted = () => signal?.aborted === true;
  if (isAborted()) {
    return Object.freeze({ exitCode: -1, output: "" });
  }
  const child = Bun.spawn(["/usr/bin/codesign", ...arguments_], {
    env: {
      PATH: "/usr/bin:/bin",
      LANG: "C",
      LC_ALL: "C"
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe"
  });
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    try {
      child.kill("SIGKILL");
    } catch {}
  };
  const onAbort = () => interrupt();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (isAborted())
    onAbort();
  const timeout = setTimeout(interrupt, 5000);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readBoundedStream(child.stdout, 64 * 1024),
      readBoundedStream(child.stderr, 64 * 1024),
      child.exited
    ]);
    return Object.freeze({
      exitCode: interrupted ? -1 : exitCode,
      output: interrupted ? "" : `${stdout}${stderr}`
    });
  } catch (error) {
    interrupt();
    await child.exited;
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}
function codeSignatureValue(display, key) {
  const prefix = `${key}=`;
  const lines = display.split(/\r?\n/u).filter((line) => line.startsWith(prefix));
  if (lines.length !== 1)
    return null;
  return lines[0]?.slice(prefix.length) ?? null;
}
function normalizeCodeRequirement(value) {
  return value.replace(/\s+/gu, " ").replace(/"([A-Za-z0-9.]+)"/gu, "$1").trim();
}
async function verifyPinnedWacliSignature(path, signal) {
  const verified = await runFixedCodesign([
    "--verify",
    "--strict",
    "--verbose=4",
    path
  ], signal);
  if (verified.exitCode !== 0)
    return false;
  const display = await runFixedCodesign([
    "--display",
    "--verbose=4",
    path
  ], signal);
  if (display.exitCode !== 0)
    return false;
  const signature = WHATSAPP_PROTOCOL_PIN.signature;
  const authorities = display.output.split(/\r?\n/u).filter((line) => line.startsWith("Authority=")).map((line) => line.slice("Authority=".length)).filter((authority) => authority.startsWith("Developer ID Application:"));
  if (codeSignatureValue(display.output, "Identifier") !== signature.identifier || codeSignatureValue(display.output, "TeamIdentifier") !== signature.teamIdentifier || codeSignatureValue(display.output, "CDHash") !== signature.cdHash || codeSignatureValue(display.output, "CandidateCDHashFull sha256") !== signature.cdHashFull || authorities.length !== 1 || authorities[0] !== signature.authority || !/\bflags=0x[0-9a-f]+\(runtime\)/iu.test(display.output) || !/^Timestamp=(?!none$).+/mu.test(display.output))
    return false;
  const requirements = await runFixedCodesign([
    "--display",
    "--requirements",
    "-",
    path
  ], signal);
  if (requirements.exitCode !== 0)
    return false;
  const embeddedRequirements = requirements.output.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.startsWith("designated =>"));
  if (embeddedRequirements.length !== 1 || normalizeCodeRequirement(embeddedRequirements[0] ?? "") !== normalizeCodeRequirement(signature.designatedRequirement))
    return false;
  return true;
}
async function pinnedBinaryCandidate(pathValue, signal) {
  let canonical;
  try {
    canonical = await realpath(pathValue);
  } catch {
    return null;
  }
  try {
    const stats = await lstat(canonical);
    if (!stats.isFile() || (stats.mode & 63) !== 0 || (stats.mode & 73) === 0 || !ownedByCurrentUser(stats))
      return null;
    if (process.platform !== "darwin" || process.arch !== "arm64")
      return null;
    if (await sha256File(canonical) !== WHATSAPP_PROTOCOL_PIN.darwinArm64BinarySha256)
      return null;
    if (!await verifyPinnedWacliSignature(canonical, signal))
      return null;
    const finalStats = await lstat(canonical);
    if (!finalStats.isFile() || finalStats.dev !== stats.dev || finalStats.ino !== stats.ino || finalStats.size !== stats.size || finalStats.mode !== stats.mode || !ownedByCurrentUser(finalStats) || await sha256File(canonical) !== WHATSAPP_PROTOCOL_PIN.darwinArm64BinarySha256)
      return null;
    return canonical;
  } catch {
    return null;
  }
}
async function resolvePinnedWacliBinary(environment = process.env, signal) {
  const candidates = [
    join(ghostgetStateHome(environment), "tools", "wacli", WHATSAPP_PROTOCOL_PIN.version, WHATSAPP_PROTOCOL_PIN.transport, "wacli")
  ];
  for (const candidate of candidates) {
    try {
      assertSafeStatePath(candidate, environment);
    } catch {
      continue;
    }
    const found = await pinnedBinaryCandidate(candidate, signal);
    if (found === null)
      continue;
    try {
      assertSafeStatePath(candidate, environment);
      if (await realpath(candidate) === found)
        return found;
    } catch {}
  }
  throw new Error(`pinned WhatsApp protocol runtime wacli ${WHATSAPP_PROTOCOL_PIN.version} is not installed or failed integrity verification`);
}
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
async function inspectWhatsAppProtocolRuntime(environment = process.env) {
  const installer = fileURLToPath(new URL("../scripts/install-whatsapp-protocol.sh", import.meta.url));
  let ready = false;
  try {
    await resolvePinnedWacliBinary(environment);
    ready = true;
  } catch {}
  return Object.freeze({
    ready,
    implementation: WHATSAPP_PROTOCOL_PIN.implementation,
    version: WHATSAPP_PROTOCOL_PIN.version,
    integrity: "official-release+sha256+offline-code-signature",
    transport: WHATSAPP_PROTOCOL_PIN.transport,
    archiveSha256: WHATSAPP_PROTOCOL_PIN.darwinArm64ArchiveSha256,
    binarySha256: WHATSAPP_PROTOCOL_PIN.darwinArm64BinarySha256,
    signature: Object.freeze({
      authority: WHATSAPP_PROTOCOL_PIN.signature.authority,
      identifier: WHATSAPP_PROTOCOL_PIN.signature.identifier,
      teamIdentifier: WHATSAPP_PROTOCOL_PIN.signature.teamIdentifier,
      designatedRequirement: WHATSAPP_PROTOCOL_PIN.signature.designatedRequirement,
      cdHash: WHATSAPP_PROTOCOL_PIN.signature.cdHash,
      cdHashFull: WHATSAPP_PROTOCOL_PIN.signature.cdHashFull,
      hardenedRuntime: WHATSAPP_PROTOCOL_PIN.signature.hardenedRuntime
    }),
    qualification: "read-only-runtime",
    setupCommand: `/bin/sh ${shellQuote(installer)}`
  });
}
async function readBoundedStream(stream, maximum) {
  return readBoundedStreamControlled(stream, maximum).promise;
}
function readBoundedStreamControlled(stream, maximum) {
  const reader = stream.getReader();
  const output = new BoundedByteBuffer(maximum);
  const promise = (async () => {
    try {
      for (;; ) {
        const item = await reader.read();
        if (item.done)
          break;
        if (!output.append(item.value)) {
          throw new Error("WhatsApp protocol process output exceeded its bound");
        }
      }
    } finally {
      reader.releaseLock();
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(output.toUint8Array());
  })();
  return Object.freeze({
    promise,
    cancel: async () => {
      try {
        await reader.cancel();
      } catch {}
    }
  });
}
async function runWacli(invocation) {
  const cancellationSignal = invocation.signal;
  const isCancelled = () => cancellationSignal?.aborted === true;
  if (isCancelled()) {
    throw new Error("WhatsApp protocol command was cancelled");
  }
  const ownsProcessGroup = cancellationSignal !== undefined && process.platform !== "win32";
  const child = Bun.spawn([invocation.binary, ...invocation.arguments], {
    env: { ...invocation.environment },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    detached: ownsProcessGroup
  });
  let timedOut = false;
  let cancelled = false;
  let forceKill = null;
  const signalChild = (signal) => {
    if (ownsProcessGroup) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH")
          return;
      }
    }
    try {
      child.kill(signal);
    } catch {}
  };
  const terminate = () => {
    signalChild("SIGTERM");
    if (forceKill === null) {
      forceKill = setTimeout(() => signalChild("SIGKILL"), 1000);
    }
  };
  const onAbort = () => {
    cancelled = true;
    terminate();
  };
  cancellationSignal?.addEventListener("abort", onAbort, { once: true });
  if (isCancelled())
    onAbort();
  const timeout = setTimeout(() => {
    timedOut = true;
    terminate();
  }, invocation.timeoutMs);
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      readBoundedStream(child.stdout, invocation.maxOutputBytes),
      readBoundedStream(child.stderr, Math.min(invocation.maxOutputBytes, MAX_STDERR_BYTES)),
      child.exited
    ]);
    if (cancelled)
      throw new Error("WhatsApp protocol command was cancelled");
    if (timedOut)
      throw new Error("WhatsApp protocol command timed out");
    return { exitCode, stdout, stderr };
  } catch (error) {
    signalChild("SIGKILL");
    await child.exited;
    throw error;
  } finally {
    clearTimeout(timeout);
    if (forceKill !== null)
      clearTimeout(forceKill);
    cancellationSignal?.removeEventListener("abort", onAbort);
  }
}
function wacliEnvironment(readOnly) {
  return Object.freeze({
    PATH: "/usr/bin:/bin",
    LANG: "C.UTF-8",
    ...readOnly ? { WACLI_READONLY: "1" } : {}
  });
}
function remainingTimeoutMs(timeoutMs, operationDeadline) {
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const remaining = Math.min(timeoutMs, operationDeadline?.remainingTimeMs() ?? timeoutMs);
  if (remaining < 1) {
    throw new Error("WhatsApp authenticated web operation timed out");
  }
  return remaining;
}
async function checkedRun(binary, arguments_, options) {
  const timeoutMs = remainingTimeoutMs(options.timeoutMs, options.operationDeadline);
  const run = options.dependencies?.run ?? runWacli;
  const invoke = () => run({
    binary,
    arguments: arguments_,
    environment: wacliEnvironment(options.readOnly),
    timeoutMs,
    maxOutputBytes: options.maxOutputBytes,
    ...options.operationDeadline === undefined ? {} : { signal: options.operationDeadline.signal }
  });
  const result = options.operationDeadline === undefined ? await invoke() : await options.operationDeadline.run(invoke, WEB_SESSION_OPERATION_LABEL);
  options.operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  if (result.exitCode !== 0) {
    throw new Error("WhatsApp protocol command failed before producing reviewed output");
  }
  const raw = result.stdout.trim();
  if (raw.length < 1) {
    throw new Error("WhatsApp protocol command omitted JSON output");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("WhatsApp protocol command returned malformed JSON");
  }
}
async function runtimeBinary(dependencies, environment, operationDeadline) {
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const resolveBinary = () => resolvePinnedWacliBinary(environment, operationDeadline?.signal);
  const binary = dependencies?.binaryPath ?? (operationDeadline === undefined ? await resolveBinary() : await operationDeadline.run(resolveBinary, WEB_SESSION_OPERATION_LABEL));
  if (dependencies?.binaryPath !== undefined && !isAbsolute(binary)) {
    throw new Error("test WhatsApp protocol binary path must be absolute");
  }
  const timeoutMs = remainingTimeoutMs(5000, operationDeadline);
  const run = dependencies?.run ?? runWacli;
  const invoke = () => run({
    binary,
    arguments: ["version"],
    environment: wacliEnvironment(true),
    timeoutMs,
    maxOutputBytes: 1024,
    ...operationDeadline === undefined ? {} : { signal: operationDeadline.signal }
  });
  const result = operationDeadline === undefined ? await invoke() : await operationDeadline.run(invoke, WEB_SESSION_OPERATION_LABEL);
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  if (result.exitCode !== 0 || result.stdout.trim() !== WHATSAPP_PROTOCOL_PIN.version) {
    throw new Error("WhatsApp protocol runtime version did not match its pin");
  }
  return binary;
}
function readOnlyArguments(store, timeoutMs, command) {
  return Object.freeze([
    "--store",
    store,
    "--read-only",
    "--json",
    "--full",
    "--timeout",
    `${Math.max(1, timeoutMs)}ms`,
    ...command
  ]);
}
async function authStatus(binary, store, timeoutMs, dependencies, operationDeadline) {
  const commandTimeoutMs = remainingTimeoutMs(timeoutMs, operationDeadline);
  return parseWhatsAppAuthStatusEnvelope(await checkedRun(binary, readOnlyArguments(store, commandTimeoutMs, ["auth", "status"]), {
    timeoutMs: commandTimeoutMs,
    maxOutputBytes: 64 * 1024,
    readOnly: true,
    ...dependencies === undefined ? {} : { dependencies },
    ...operationDeadline === undefined ? {} : { operationDeadline }
  }));
}
async function boundRuntime(auth, purpose, timeoutMs, dependencies, environment, operationDeadline) {
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const linked = requireWhatsAppAuth(auth);
  const validateStore = () => validateWhatsAppStoreDirectory(linked.path, purpose);
  const store = operationDeadline === undefined ? await validateStore() : await operationDeadline.run(validateStore, WEB_SESSION_OPERATION_LABEL);
  const binary = await runtimeBinary(dependencies, environment, operationDeadline);
  const status = await authStatus(binary, store, timeoutMs, dependencies, operationDeadline);
  if (!status.authenticated || status.subject === null) {
    throw new Error("WhatsApp linked-device store is not paired; run the explicit auth pairing flow");
  }
  if (purpose === "projection") {
    if (linked.subject === undefined) {
      throw new Error("WhatsApp linked-device auth must be bound to its current account before private reads");
    }
    if (linked.subject !== status.subject) {
      throw new Error("WhatsApp linked-device account did not match the bound auth realm");
    }
  }
  return {
    auth: linked,
    binary,
    store,
    subject: status.subject
  };
}
async function probeWhatsAppWebSubject(auth, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1e4;
  const deadline = new OperationDeadline(timeoutMs, {
    ...options.signal === undefined ? {} : { signal: options.signal }
  });
  try {
    const runtime = await boundRuntime(auth, "probe", timeoutMs, options.dependencies, options.environment ?? process.env, deadline);
    deadline.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
    return runtime.subject;
  } finally {
    deadline.dispose();
  }
}
function inputInteger(input, name, fallback, maximum) {
  const value = input[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`input.${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}
function inputFolder(input) {
  const value = input.folder ?? "all";
  if (value !== "all" && value !== "active" && value !== "archived" && value !== "unread")
    throw new Error("input.folder must be all, active, archived, or unread");
  return value;
}
function exactContactInput(input) {
  const unexpected = Object.keys(input).filter((key) => key !== "collection" && key !== "cursor" && key !== "cursor_anchor" && key !== "limit");
  if (unexpected.length > 0) {
    throw new Error("WhatsApp contacts.list input contained unsupported fields");
  }
  const collection = input.collection ?? "contacts";
  if (collection !== "contacts" && collection !== "interactions") {
    throw new Error("input.collection must be contacts or interactions");
  }
  if (collection === "interactions") {
    const cursor2 = input.cursor === undefined ? "0" : parseWhatsAppInteractionRowid(input.cursor, "input.cursor");
    const cursorAnchor = input.cursor_anchor === undefined ? null : typeof input.cursor_anchor === "string" && /^[a-f0-9]{64}$/u.test(input.cursor_anchor) ? input.cursor_anchor : (() => {
      throw new Error("input.cursor_anchor must be a SHA-256 digest");
    })();
    if (cursor2 === "0" !== (cursorAnchor === null)) {
      throw new Error("input.cursor_anchor must bind every nonzero interaction cursor");
    }
    return Object.freeze({
      collection,
      cursor: cursor2,
      cursorAnchor,
      limit: inputInteger(input, "limit", DEFAULT_LIMIT, 1000)
    });
  }
  if (input.cursor_anchor !== undefined) {
    throw new Error("input.cursor_anchor is only supported for interaction scans");
  }
  let cursor = null;
  if (input.cursor !== undefined) {
    const parsed = parseWhatsAppJid(input.cursor, "input.cursor");
    if (parsed.kind !== "user" && parsed.kind !== "lid" || parsed.jid.includes(":")) {
      throw new Error("input.cursor must be one exact contact user or LID JID");
    }
    cursor = parsed.jid;
  }
  return Object.freeze({
    collection,
    cursor,
    limit: inputInteger(input, "limit", DEFAULT_LIMIT, 100)
  });
}
function sameContactProjectionSnapshot(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.uid === right.uid && left.gid === right.gid && left.nlink === right.nlink && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
function currentBigIntUid() {
  return typeof process.getuid === "function" ? BigInt(process.getuid()) : null;
}
function assertParentContactProjectionIdentity(store, session) {
  const uid = currentBigIntUid();
  if (!store.isDirectory() || store.isSymbolicLink() || uid !== null && store.uid !== uid || !isExactWhatsAppContactProjectionMode(store.mode, 448) || !session.isFile() || session.isSymbolicLink() || session.nlink !== 1n || uid !== null && session.uid !== uid || !isExactWhatsAppContactProjectionMode(session.mode, 384) || session.size < 1n || session.size > 128n * 1024n * 1024n) {
    throw new Error("WhatsApp contact projection parent could not verify its private session store");
  }
}
async function captureContactProjectionParentIdentity(store) {
  try {
    if (await realpath(store) !== store) {
      throw new Error("non-canonical");
    }
    const [storeStats, sessionStats] = await Promise.all([
      lstat(store, { bigint: true }),
      lstat(join(store, "session.db"), { bigint: true })
    ]);
    assertParentContactProjectionIdentity(storeStats, sessionStats);
    return Object.freeze({ store: storeStats, session: sessionStats });
  } catch {
    throw new Error("WhatsApp contact projection parent could not bind its private session store");
  }
}
async function revalidateContactProjectionParentIdentity(store, initial) {
  try {
    if (await realpath(store) !== store)
      throw new Error("non-canonical");
    const [storeStats, sessionStats] = await Promise.all([
      lstat(store, { bigint: true }),
      lstat(join(store, "session.db"), { bigint: true })
    ]);
    assertParentContactProjectionIdentity(storeStats, sessionStats);
    if (!sameContactProjectionSnapshot(initial.store, storeStats) || !sameContactProjectionSnapshot(initial.session, sessionStats))
      throw new Error("identity changed");
  } catch {
    throw new Error("WhatsApp contact projection parent binding changed during the helper read");
  }
}
function assertParentInteractionProjectionIdentity(store, session, messageStore) {
  assertParentContactProjectionIdentity(store, session);
  const uid = currentBigIntUid();
  if (!messageStore.isFile() || messageStore.isSymbolicLink() || messageStore.nlink !== 1n || uid !== null && messageStore.uid !== uid || !isExactWhatsAppContactProjectionMode(messageStore.mode, 384) || messageStore.size < 1n || messageStore.size > 2n * 1024n * 1024n * 1024n) {
    throw new Error("WhatsApp interaction projection parent could not verify its private message store");
  }
}
async function captureInteractionProjectionParentIdentity(store) {
  try {
    if (await realpath(store) !== store)
      throw new Error("non-canonical");
    const [storeStats, sessionStats, messageStoreStats] = await Promise.all([
      lstat(store, { bigint: true }),
      lstat(join(store, "session.db"), { bigint: true }),
      lstat(join(store, "wacli.db"), { bigint: true })
    ]);
    assertParentInteractionProjectionIdentity(storeStats, sessionStats, messageStoreStats);
    return Object.freeze({
      store: storeStats,
      session: sessionStats,
      messageStore: messageStoreStats
    });
  } catch {
    throw new Error("WhatsApp interaction projection parent could not bind its private stores");
  }
}
async function revalidateInteractionProjectionParentIdentity(store, initial) {
  try {
    if (await realpath(store) !== store)
      throw new Error("non-canonical");
    const [storeStats, sessionStats, messageStoreStats] = await Promise.all([
      lstat(store, { bigint: true }),
      lstat(join(store, "session.db"), { bigint: true }),
      lstat(join(store, "wacli.db"), { bigint: true })
    ]);
    assertParentInteractionProjectionIdentity(storeStats, sessionStats, messageStoreStats);
    if (!sameContactProjectionSnapshot(initial.store, storeStats) || !sameContactProjectionSnapshot(initial.session, sessionStats) || !sameContactProjectionSnapshot(initial.messageStore, messageStoreStats))
      throw new Error("identity changed");
  } catch {
    throw new Error("WhatsApp interaction projection parent binding changed during the helper read");
  }
}
async function fixedContactProjectionFile(pathValue) {
  try {
    const stats = await lstat(pathValue);
    const uid = typeof process.getuid === "function" ? process.getuid() : null;
    if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1 || stats.size < 1 || stats.size > 2 * 1024 * 1024 || (stats.mode & 18) !== 0 || uid !== null && stats.uid !== uid && stats.uid !== 0 || await realpath(pathValue) !== pathValue) {
      throw new Error("unsafe fixed file");
    }
    return pathValue;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return null;
    throw new Error("WhatsApp contact projection fixed helper files failed validation");
  }
}
async function resolveFixedContactProjectionFiles(helperName = "whatsapp-contact-projection-helper.ts") {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    {
      helper: resolve(moduleDirectory, helperName),
      config: resolve(moduleDirectory, "../state-helper.bunfig.toml")
    },
    {
      helper: resolve(moduleDirectory, `../src/providers/${helperName}`),
      config: resolve(moduleDirectory, "../src/state-helper.bunfig.toml")
    }
  ];
  for (const candidate of candidates) {
    const [helper, config] = await Promise.all([
      fixedContactProjectionFile(candidate.helper),
      fixedContactProjectionFile(candidate.config)
    ]);
    if (helper === null && config === null)
      continue;
    if (helper === null || config === null) {
      throw new Error("WhatsApp contact projection fixed helper installation is incomplete");
    }
    return Object.freeze({ helper, config });
  }
  throw new Error("WhatsApp contact projection fixed helper is not installed");
}
function contactProjectionEnvironment() {
  return Object.freeze({
    PATH: "/usr/bin:/bin",
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
    TZ: "UTC"
  });
}
async function runWhatsAppContactProjectionHelperChild(invocation) {
  const isAborted = () => invocation.signal?.aborted === true;
  if (isAborted()) {
    throw new Error("WhatsApp contact projection helper was cancelled");
  }
  let child;
  try {
    child = Bun.spawn([...invocation.command], {
      cwd: invocation.cwd,
      env: { ...invocation.environment },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      detached: process.platform !== "win32"
    });
  } catch {
    throw new Error("WhatsApp contact projection helper could not start");
  }
  if (invocation.onSpawned !== undefined) {
    try {
      invocation.onSpawned(child.pid);
    } catch (error) {
      try {
        if (process.platform !== "win32")
          process.kill(-child.pid, "SIGKILL");
        else
          child.kill("SIGKILL");
      } catch {}
      try {
        await child.exited;
      } catch {
        throw new WhatsAppContactProjectionCleanupUnverifiedError;
      }
      throw error;
    }
  }
  let timedOut = false;
  let cancelled = false;
  let forceKill;
  let terminationStarted = false;
  const signalChild = (signal) => {
    if (process.platform !== "win32") {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH")
          return;
      }
    }
    try {
      child.kill(signal);
    } catch {}
  };
  const terminate = () => {
    if (!terminationStarted) {
      terminationStarted = true;
      signalChild("SIGTERM");
    }
    forceKill ??= setTimeout(() => signalChild("SIGKILL"), CONTACT_PROJECTION_FORCE_KILL_DELAY_MS);
  };
  const onAbort = () => {
    cancelled = true;
    terminate();
  };
  invocation.signal?.addEventListener("abort", onAbort, { once: true });
  if (isAborted())
    onAbort();
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
  const stdout = guarded(readBoundedStream(child.stdout, invocation.maxOutputBytes));
  const stderr = guarded(readBoundedStream(child.stderr, invocation.maxStderrBytes));
  const exited = child.exited;
  try {
    const [stdinResult, stdoutResult, stderrResult, exitResult] = await Promise.allSettled([stdin, stdout, stderr, exited]);
    if (exitResult.status === "rejected") {
      throw new WhatsAppContactProjectionCleanupUnverifiedError;
    }
    if (stdinResult.status === "rejected" || stdoutResult.status === "rejected" || stderrResult.status === "rejected") {
      throw new Error("WhatsApp contact projection helper stream failed within its bound");
    }
    if (cancelled) {
      throw new Error("WhatsApp contact projection helper was cancelled");
    }
    if (timedOut) {
      throw new Error("WhatsApp contact projection helper timed out");
    }
    return Object.freeze({
      exitCode: exitResult.value,
      stdout: stdoutResult.value,
      stderr: stderrResult.value
    });
  } finally {
    clearTimeout(timeout);
    if (forceKill !== undefined)
      clearTimeout(forceKill);
    invocation.signal?.removeEventListener("abort", onAbort);
  }
}

class CanonicalSessionFrameDecoder {
  #maximumFrameBytes;
  #onFrame;
  #chunks = [];
  #pendingBytes = 0;
  #frameCount = 0;
  constructor(maximumFrameBytes, onFrame) {
    this.#maximumFrameBytes = maximumFrameBytes;
    this.#onFrame = onFrame;
  }
  get frameCount() {
    return this.#frameCount;
  }
  #append(bytes) {
    if (bytes.byteLength === 0)
      return;
    this.#pendingBytes += bytes.byteLength;
    if (this.#pendingBytes + 1 > this.#maximumFrameBytes) {
      throw new Error("WhatsApp projection session frame exceeded its bound");
    }
    this.#chunks.push(Buffer.from(bytes));
  }
  #finishLine() {
    if (this.#pendingBytes < 2 || this.#pendingBytes + 1 > this.#maximumFrameBytes || this.#frameCount >= MESSAGE_EXPORT_SESSION_MAX_FRAMES)
      throw new Error("WhatsApp projection session frame exceeded its bound");
    const bytes = this.#chunks.length === 1 ? this.#chunks[0] : Buffer.concat(this.#chunks, this.#pendingBytes);
    this.#chunks = [];
    this.#pendingBytes = 0;
    let line;
    try {
      line = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error("WhatsApp projection session frame was malformed");
    }
    if (line.includes("\r")) {
      throw new Error("WhatsApp projection session frame exceeded its bound");
    }
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error("WhatsApp projection session frame was malformed");
    }
    const canonical = canonicalJson(value);
    if (canonical !== line || !Buffer.from(canonical, "utf8").equals(bytes)) {
      throw new Error("WhatsApp projection session frame was not canonical");
    }
    this.#frameCount += 1;
    this.#onFrame(Object.freeze({
      index: this.#frameCount,
      canonical,
      value
    }));
  }
  push(bytes) {
    let start = 0;
    for (let index = 0;index < bytes.byteLength; index += 1) {
      if (bytes[index] !== 10)
        continue;
      this.#append(bytes.subarray(start, index));
      this.#finishLine();
      start = index + 1;
    }
    this.#append(bytes.subarray(start));
  }
  finish() {
    if (this.#pendingBytes !== 0 || this.#chunks.length !== 0) {
      throw new Error("WhatsApp projection session ended inside a frame");
    }
  }
}
function sameSpoolDirectory(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid && left.mode === right.mode && left.birthtimeNs === right.birthtimeNs;
}
function assertPrivateSpoolDirectory(stats) {
  const uid = process.getuid?.();
  if (uid === undefined || !stats.isDirectory() || stats.isSymbolicLink() || stats.uid !== BigInt(uid) || (stats.mode & 0o777n) !== BigInt(MESSAGE_EXPORT_SESSION_PRIVATE_DIRECTORY_MODE))
    throw new WhatsAppContactProjectionCleanupUnverifiedError;
}
function assertPrivateSpoolFile(stats, identity, expectedBytes) {
  const uid = process.getuid?.();
  if (!stats.isFile() || stats.isSymbolicLink() || uid === undefined || stats.uid !== BigInt(uid) || (stats.mode & 0o777n) !== BigInt(MESSAGE_EXPORT_SESSION_PRIVATE_FILE_MODE) || stats.nlink !== 0n || stats.dev !== identity.dev || stats.ino !== identity.ino || expectedBytes !== undefined && stats.size !== BigInt(expectedBytes))
    throw new WhatsAppContactProjectionCleanupUnverifiedError;
}
async function writeSpoolBytes(handle, bytes, position) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = await handle.write(bytes, offset, bytes.byteLength - offset, position + offset);
    if (written.bytesWritten < 1) {
      throw new WhatsAppContactProjectionCleanupUnverifiedError;
    }
    offset += written.bytesWritten;
  }
}
async function createWhatsAppMessageExportSessionSpool(beforeReadyForTest) {
  let createdDirectory;
  try {
    createdDirectory = await mkdtemp(join(tmpdir(), "wrench-whatsapp-stdout-"));
  } catch {
    throw new Error("WhatsApp projection session private spool could not be created");
  }
  let directory;
  try {
    directory = await realpath(createdDirectory);
  } catch {
    throw new WhatsAppContactProjectionCleanupUnverifiedError;
  }
  const path = join(directory, "stdout.ndjson");
  let handle;
  let directoryHandle;
  let cleanupDirectoryIdentity;
  try {
    await chmod(directory, MESSAGE_EXPORT_SESSION_PRIVATE_DIRECTORY_MODE);
    const directoryFlags = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | (typeof fsConstants.O_DIRECTORY === "number" ? fsConstants.O_DIRECTORY : 0);
    directoryHandle = await open(directory, directoryFlags);
    const directoryIdentity = await directoryHandle.stat({ bigint: true });
    cleanupDirectoryIdentity = directoryIdentity;
    assertPrivateSpoolDirectory(directoryIdentity);
    const directoryPathIdentity = await lstat(directory, { bigint: true });
    assertPrivateSpoolDirectory(directoryPathIdentity);
    if (!sameSpoolDirectory(directoryIdentity, directoryPathIdentity)) {
      throw new WhatsAppContactProjectionCleanupUnverifiedError;
    }
    const assertDirectoryBinding = async () => {
      const [descriptor, current] = await Promise.all([
        directoryHandle.stat({ bigint: true }),
        lstat(directory, { bigint: true })
      ]);
      assertPrivateSpoolDirectory(descriptor);
      assertPrivateSpoolDirectory(current);
      if (!sameSpoolDirectory(directoryIdentity, descriptor) || !sameSpoolDirectory(directoryIdentity, current))
        throw new WhatsAppContactProjectionCleanupUnverifiedError;
    };
    const uid = process.getuid?.();
    if (uid === undefined)
      throw new WhatsAppContactProjectionCleanupUnverifiedError;
    handle = await open(path, fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, MESSAGE_EXPORT_SESSION_PRIVATE_FILE_MODE);
    await handle.chmod(MESSAGE_EXPORT_SESSION_PRIVATE_FILE_MODE);
    const linked = await handle.stat({ bigint: true });
    const entry = await lstat(path, { bigint: true });
    if (!linked.isFile() || linked.isSymbolicLink() || linked.nlink !== 1n || linked.dev !== entry.dev || linked.ino !== entry.ino || linked.uid !== BigInt(uid) || (linked.mode & 0o777n) !== BigInt(MESSAGE_EXPORT_SESSION_PRIVATE_FILE_MODE))
      throw new Error("WhatsApp projection session private spool file was invalid");
    const fileIdentity2 = Object.freeze({ dev: linked.dev, ino: linked.ino });
    await assertDirectoryBinding();
    await unlink(path);
    assertPrivateSpoolFile(await handle.stat({ bigint: true }), fileIdentity2, 0);
    await assertDirectoryBinding();
    let sealed;
    let closed = false;
    let replayStarted = false;
    let replayActive = false;
    const capture = (stream, maximumFrameBytes, onFrame) => {
      const reader = stream.getReader();
      const digest = createHash("sha256");
      const decoder = new CanonicalSessionFrameDecoder(maximumFrameBytes, onFrame ?? (() => {
        return;
      }));
      let totalBytes = 0;
      const promise = (async () => {
        try {
          for (;; ) {
            const item = await reader.read();
            if (item.done)
              break;
            const nextTotal = totalBytes + item.value.byteLength;
            if (nextTotal > MESSAGE_EXPORT_SESSION_MAX_TOTAL_STDOUT_BYTES) {
              throw new Error("WhatsApp projection session output exceeded its total bound");
            }
            await writeSpoolBytes(handle, item.value, totalBytes);
            digest.update(item.value);
            decoder.push(item.value);
            totalBytes = nextTotal;
          }
          decoder.finish();
          await assertDirectoryBinding();
          await handle.sync();
          const metadata = await handle.stat({ bigint: true });
          assertPrivateSpoolFile(metadata, fileIdentity2, totalBytes);
          sealed = Object.freeze({
            frameCount: decoder.frameCount,
            totalBytes,
            stdoutSha256: digest.digest("hex"),
            maximumFrameBytes,
            metadata
          });
        } finally {
          reader.releaseLock();
        }
      })().catch((error) => {
        if (containsWhatsAppContactProjectionCleanupUnverified(error) || errnoCode(error) !== undefined)
          throw new WhatsAppContactProjectionCleanupUnverifiedError;
        throw error;
      });
      return Object.freeze({
        promise,
        cancel: async () => {
          try {
            await reader.cancel();
          } catch {}
        }
      });
    };
    const replay = async function* (project) {
      if (closed || sealed === undefined || replayStarted || replayActive) {
        throw new WhatsAppContactProjectionCleanupUnverifiedError;
      }
      replayStarted = true;
      replayActive = true;
      const expected = sealed;
      const digest = createHash("sha256");
      const decoded = [];
      const decoder = new CanonicalSessionFrameDecoder(expected.maximumFrameBytes, (frame) => decoded.push(frame));
      const buffer = Buffer.allocUnsafe(MESSAGE_EXPORT_SESSION_SPOOL_CHUNK_BYTES);
      let position = 0;
      try {
        await assertDirectoryBinding();
        assertPrivateSpoolFile(await handle.stat({ bigint: true }), fileIdentity2, expected.totalBytes);
        while (position < expected.totalBytes) {
          const length = Math.min(buffer.byteLength, expected.totalBytes - position);
          const item = await handle.read(buffer, 0, length, position);
          if (item.bytesRead < 1)
            throw new WhatsAppContactProjectionCleanupUnverifiedError;
          const bytes = buffer.subarray(0, item.bytesRead);
          digest.update(bytes);
          decoder.push(bytes);
          position += item.bytesRead;
          while (decoded.length > 0)
            yield project(decoded.shift());
        }
        decoder.finish();
        if (position !== expected.totalBytes || decoder.frameCount !== expected.frameCount || digest.digest("hex") !== expected.stdoutSha256)
          throw new WhatsAppContactProjectionCleanupUnverifiedError;
        await assertDirectoryBinding();
        const after = await handle.stat({ bigint: true });
        assertPrivateSpoolFile(after, fileIdentity2, expected.totalBytes);
        if (after.mtimeNs !== expected.metadata.mtimeNs || after.ctimeNs !== expected.metadata.ctimeNs)
          throw new WhatsAppContactProjectionCleanupUnverifiedError;
      } catch (error) {
        if (containsWhatsAppContactProjectionCleanupUnverified(error) || errnoCode(error) !== undefined)
          throw new WhatsAppContactProjectionCleanupUnverifiedError;
        throw error;
      } finally {
        replayActive = false;
      }
    };
    const close = async () => {
      if (closed)
        return;
      closed = true;
      let failure;
      try {
        await handle.close();
      } catch (error) {
        failure = error;
      }
      try {
        const descriptor = await directoryHandle.stat({ bigint: true });
        const current = await lstat(directory, { bigint: true });
        const entries = await readdir(directory);
        assertPrivateSpoolDirectory(descriptor);
        assertPrivateSpoolDirectory(current);
        if (!sameSpoolDirectory(directoryIdentity, descriptor) || !sameSpoolDirectory(directoryIdentity, current) || entries.length !== 0) {
          throw new WhatsAppContactProjectionCleanupUnverifiedError;
        }
        await rmdir(directory);
      } catch (error) {
        failure = failure === undefined ? error : new AggregateError([failure, error], "WhatsApp projection spool cleanup failed");
      }
      try {
        await directoryHandle.close();
      } catch (error) {
        failure = failure === undefined ? error : new AggregateError([failure, error], "WhatsApp projection spool cleanup failed");
      }
      if (failure !== undefined)
        throw new WhatsAppContactProjectionCleanupUnverifiedError;
    };
    const publicSpool = Object.freeze({
      get frameCount() {
        return sealed?.frameCount ?? 0;
      },
      get totalBytes() {
        return sealed?.totalBytes ?? 0;
      },
      get stdoutSha256() {
        return sealed?.stdoutSha256 ?? "";
      },
      replay,
      close
    });
    await beforeReadyForTest?.();
    return Object.freeze({ handle, capture, publicSpool });
  } catch (error) {
    let cleanupVerified = true;
    try {
      await handle?.close();
    } catch {
      cleanupVerified = false;
    }
    let exactDirectory = false;
    if (directoryHandle !== undefined && cleanupDirectoryIdentity !== undefined) {
      try {
        const [descriptor, current] = await Promise.all([
          directoryHandle.stat({ bigint: true }),
          lstat(directory, { bigint: true })
        ]);
        exactDirectory = sameSpoolDirectory(cleanupDirectoryIdentity, descriptor) && sameSpoolDirectory(cleanupDirectoryIdentity, current);
      } catch {
        exactDirectory = false;
      }
    }
    if (exactDirectory) {
      try {
        await unlink(path);
      } catch (unlinkError) {
        if (errnoCode(unlinkError) !== "ENOENT")
          cleanupVerified = false;
      }
      try {
        if ((await readdir(directory)).length !== 0) {
          cleanupVerified = false;
        } else {
          await rmdir(directory);
        }
      } catch {
        cleanupVerified = false;
      }
    } else {
      cleanupVerified = false;
    }
    try {
      await directoryHandle?.close();
    } catch {
      cleanupVerified = false;
    }
    if (!cleanupVerified || containsWhatsAppContactProjectionCleanupUnverified(error))
      throw new WhatsAppContactProjectionCleanupUnverifiedError;
    throw new Error("WhatsApp projection session private spool could not be created");
  }
}
function unrefTimer(timer) {
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    timer.unref();
  }
}
function errnoCode(error) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}
async function runWhatsAppMessageExportSessionHelperChild(invocation) {
  if ((invocation.processGroupIsAbsentForTest !== undefined || invocation.onProcessGroupPollForTest !== undefined || invocation.beforeSpoolReadyForTest !== undefined) && true)
    throw new Error("WhatsApp projection process-group injection is test-only");
  const runnerDeadline = new OperationDeadline(invocation.timeoutMs, {
    ...invocation.signal === undefined ? {} : { signal: invocation.signal }
  });
  const deadlineFailure = () => new Error(invocation.signal?.aborted === true ? "WhatsApp projection session helper was cancelled" : "WhatsApp projection session helper timed out");
  const assertRunnerAvailable = () => {
    try {
      runnerDeadline.throwIfUnavailable("WhatsApp projection session helper");
    } catch {
      throw deadlineFailure();
    }
  };
  try {
    assertRunnerAvailable();
  } catch (error) {
    runnerDeadline.dispose();
    throw error;
  }
  let spool;
  try {
    spool = await createWhatsAppMessageExportSessionSpool(invocation.beforeSpoolReadyForTest);
  } catch (error) {
    runnerDeadline.dispose();
    throw error;
  }
  try {
    assertRunnerAvailable();
  } catch (error) {
    try {
      await spool.publicSpool.close();
    } catch (cleanupError) {
      runnerDeadline.dispose();
      throw new AggregateError([error, cleanupError], "WhatsApp projection session deadline and spool cleanup both failed");
    }
    runnerDeadline.dispose();
    throw error;
  }
  let child;
  try {
    child = Bun.spawn([...invocation.command], {
      cwd: invocation.cwd,
      env: { ...invocation.environment },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      detached: process.platform !== "win32"
    });
  } catch {
    const launchUncertainty = new WhatsAppContactProjectionCleanupUnverifiedError;
    try {
      await spool.publicSpool.close();
    } catch (cleanupError) {
      runnerDeadline.dispose();
      throw new AggregateError([launchUncertainty, cleanupError], "WhatsApp projection session spawn and spool cleanup both failed");
    }
    runnerDeadline.dispose();
    throw launchUncertainty;
  }
  let childExited = false;
  const signalChild = (signal) => {
    if (process.platform !== "win32") {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch (error) {
        if (errnoCode(error) === "ESRCH")
          return;
      }
    }
    try {
      child.kill(signal);
    } catch {}
  };
  let terminationStarted = false;
  let forceKill;
  let reapTimer;
  let rejectCleanupDeadline;
  let cleanupDeadlineExpired = false;
  const cleanupDeadline = new Promise((_resolve, reject) => {
    rejectCleanupDeadline = reject;
  });
  const terminate = () => {
    if (!terminationStarted) {
      terminationStarted = true;
      signalChild("SIGTERM");
      forceKill = setTimeout(() => {
        signalChild("SIGKILL");
      }, CONTACT_PROJECTION_FORCE_KILL_DELAY_MS);
      reapTimer = setTimeout(() => {
        cleanupDeadlineExpired = true;
        rejectCleanupDeadline?.(new WhatsAppContactProjectionCleanupUnverifiedError);
      }, CONTACT_PROJECTION_FORCE_KILL_DELAY_MS * 2);
      unrefTimer(forceKill);
      unrefTimer(reapTimer);
    }
  };
  let timedOut = false;
  let cancelled = false;
  const onAbort = () => {
    cancelled = invocation.signal?.aborted === true;
    timedOut = !cancelled;
    terminate();
  };
  runnerDeadline.signal.addEventListener("abort", onAbort, { once: true });
  if (runnerDeadline.signal.aborted)
    onAbort();
  const guarded = (promise) => promise.catch((error) => {
    terminate();
    throw error;
  });
  const capture = spool.capture(child.stdout, invocation.maxOutputBytes, invocation.onCanonicalFrame);
  const frames = guarded(capture.promise);
  const stderrRead = readBoundedStreamControlled(child.stderr, invocation.maxStderrBytes);
  const stderr = guarded(stderrRead.promise);
  const exited = child.exited.then((exitCode) => {
    childExited = true;
    return exitCode;
  }, (error) => {
    terminate();
    throw error;
  });
  let callbackFailure;
  try {
    invocation.onSpawned?.(child.pid);
  } catch (error) {
    callbackFailure = error;
    terminate();
  }
  const stdin = callbackFailure === undefined ? guarded((async () => {
    await child.stdin.write(invocation.stdin);
    await child.stdin.end();
  })()) : guarded((async () => {
    await child.stdin.end();
  })());
  const processGroupIsAbsent = () => {
    if (invocation.processGroupIsAbsentForTest !== undefined) {
      return invocation.processGroupIsAbsentForTest();
    }
    if (process.platform === "win32")
      return true;
    try {
      process.kill(-child.pid, 0);
      return false;
    } catch (error) {
      if (errnoCode(error) === "ESRCH")
        return true;
      throw new WhatsAppContactProjectionCleanupUnverifiedError;
    }
  };
  let unexpectedDescendantObserved = false;
  let groupPollTimer;
  let resolveGroupPoll;
  const cancelGroupPoll = () => {
    if (groupPollTimer !== undefined)
      clearTimeout(groupPollTimer);
    groupPollTimer = undefined;
    const resolve2 = resolveGroupPoll;
    resolveGroupPoll = undefined;
    resolve2?.();
  };
  const waitForGroupPoll = () => new Promise((resolve2) => {
    invocation.onProcessGroupPollForTest?.();
    resolveGroupPoll = resolve2;
    groupPollTimer = setTimeout(() => {
      groupPollTimer = undefined;
      resolveGroupPoll = undefined;
      resolve2();
    }, 20);
    unrefTimer(groupPollTimer);
  });
  const joinProcessGroup = async () => {
    if (processGroupIsAbsent())
      return;
    unexpectedDescendantObserved = true;
    terminate();
    for (;; ) {
      if (cleanupDeadlineExpired) {
        throw new WhatsAppContactProjectionCleanupUnverifiedError;
      }
      if (processGroupIsAbsent())
        return;
      await waitForGroupPoll();
    }
  };
  let transferred = false;
  try {
    const settled = await Promise.race([
      Promise.allSettled([stdin, frames, stderr, exited]),
      cleanupDeadline
    ]);
    const [stdinResult, framesResult, stderrResult, exitResult] = settled;
    await Promise.race([joinProcessGroup(), cleanupDeadline]);
    if (exitResult.status === "rejected") {
      throw new WhatsAppContactProjectionCleanupUnverifiedError;
    }
    if (unexpectedDescendantObserved) {
      throw new Error("WhatsApp projection session helper left an unexpected descendant");
    }
    if (callbackFailure !== undefined)
      throw callbackFailure;
    if (cancelled)
      throw new Error("WhatsApp projection session helper was cancelled");
    if (timedOut)
      throw new Error("WhatsApp projection session helper timed out");
    if (stdinResult.status === "rejected" || framesResult.status === "rejected" || stderrResult.status === "rejected") {
      const failure = framesResult.status === "rejected" ? framesResult.reason : stderrResult.status === "rejected" ? stderrResult.reason : stdinResult.status === "rejected" ? stdinResult.reason : undefined;
      throw failure instanceof Error ? failure : new Error("WhatsApp projection session stream failed within its bound");
    }
    transferred = true;
    return Object.freeze({
      exitCode: exitResult.value,
      spool: spool.publicSpool,
      stderr: stderrResult.value
    });
  } catch (error) {
    const detach = () => {
      capture.cancel();
      stderrRead.cancel();
      Promise.resolve(child.stdin.end()).catch(() => {
        return;
      });
      if (!childExited)
        child.unref();
    };
    detach();
    if (cleanupDeadlineExpired) {
      spool.publicSpool.close().catch(() => {
        return;
      });
      throw error;
    }
    await Promise.allSettled([
      capture.promise,
      stderrRead.promise,
      child.stdin.end()
    ]);
    try {
      await spool.publicSpool.close();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "WhatsApp projection session operation and spool cleanup both failed");
    }
    throw error;
  } finally {
    cancelGroupPoll();
    if (reapTimer !== undefined)
      clearTimeout(reapTimer);
    if (forceKill !== undefined)
      clearTimeout(forceKill);
    runnerDeadline.signal.removeEventListener("abort", onAbort);
    runnerDeadline.dispose();
    if (!transferred && !childExited)
      child.unref();
  }
}
function whatsappContactProjectionCleanupBarrier(operation) {
  return operation.then(() => {
    return;
  }, (error) => {
    if (containsWhatsAppContactProjectionCleanupUnverified(error)) {
      throw error;
    }
  });
}
function unavailableWhatsAppDirectionStats() {
  return Object.freeze({
    count: null,
    complete: false,
    lowerBound: false,
    truncated: false,
    lastAt: null,
    lastAtComplete: false,
    lastAtBasis: "unavailable",
    incompleteReasons: Object.freeze([
      "whatsapp-message-store-account-owner-unavailable"
    ])
  });
}
async function projectWhatsAppLocalContacts(auth, recipe, input, dependencies, operationDeadline, registerCleanupBarrier) {
  const parsedInput = exactContactInput(input);
  if (parsedInput.collection !== "contacts") {
    throw new Error("WhatsApp contact projection requires collection=contacts");
  }
  if (auth.subject === undefined) {
    throw new Error("WhatsApp linked-device auth must be bound to its current account before private reads");
  }
  let accountSubject2;
  try {
    accountSubject2 = parseWhatsAppContactProjectionSubject(auth.subject).subject;
  } catch {
    throw new Error("WhatsApp linked-device auth subject is not a PN or LID account");
  }
  const rawOperation = startWebSessionCleanupTrackedOperation(registerCleanupBarrier, async () => {
    operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
    const store = await validateWhatsAppStoreDirectory(auth.path, "contact-projection");
    const initial = await captureContactProjectionParentIdentity(store);
    const fixed = await resolveFixedContactProjectionFiles();
    const request = Object.freeze({
      schemaVersion: WHATSAPP_CONTACT_PROJECTION_PROTOCOL_VERSION,
      operation: "contacts.list",
      accountSubject: accountSubject2,
      cursor: parsedInput.cursor,
      limit: parsedInput.limit,
      storeIdentity: Object.freeze({
        dev: initial.store.dev.toString(),
        ino: initial.store.ino.toString()
      }),
      sessionIdentity: Object.freeze({
        dev: initial.session.dev.toString(),
        ino: initial.session.ino.toString()
      })
    });
    const timeoutMs = remainingTimeoutMs(recipe.timeoutMs, operationDeadline);
    const invocation = Object.freeze({
      command: Object.freeze([
        process.execPath,
        "--no-env-file",
        "--no-install",
        "--no-macros",
        "--no-addons",
        `--config=${fixed.config}`,
        fixed.helper
      ]),
      cwd: store,
      environment: contactProjectionEnvironment(),
      stdin: `${JSON.stringify(request)}
`,
      timeoutMs,
      maxOutputBytes: Math.min(recipe.maxOutputBytes, WHATSAPP_CONTACT_PROJECTION_MAX_STDOUT_BYTES),
      maxStderrBytes: MAX_CONTACT_PROJECTION_STDERR_BYTES,
      ...operationDeadline === undefined ? {} : { signal: operationDeadline.signal }
    });
    const run = dependencies?.runContactProjectionHelper ?? runWhatsAppContactProjectionHelperChild;
    let childResult;
    let helperFailure;
    try {
      childResult = await run(invocation);
    } catch (error) {
      helperFailure = error;
    }
    let identityFailure;
    try {
      await revalidateContactProjectionParentIdentity(store, initial);
    } catch (error) {
      identityFailure = error;
    }
    if (helperFailure instanceof WhatsAppContactProjectionCleanupUnverifiedError) {
      throw helperFailure;
    }
    if (identityFailure !== undefined) {
      throw identityFailure instanceof Error ? identityFailure : new Error("WhatsApp contact projection parent binding became unverifiable");
    }
    if (helperFailure !== undefined) {
      throw helperFailure instanceof Error ? helperFailure : new Error("WhatsApp contact projection helper failed");
    }
    if (childResult === undefined) {
      throw new Error("WhatsApp contact projection helper omitted its result");
    }
    if (childResult.exitCode !== 0 || childResult.stderr.length !== 0) {
      throw new Error("WhatsApp contact projection helper failed before reviewed output");
    }
    let parsed;
    try {
      parsed = JSON.parse(childResult.stdout.trim());
    } catch {
      throw new Error("WhatsApp contact projection helper returned malformed output");
    }
    let response2;
    try {
      response2 = parseWhatsAppContactProjectionResponse(parsed, request);
    } catch {
      throw new Error("WhatsApp contact projection helper returned unsupported output");
    }
    if (response2.status === "failed") {
      throw new Error(`WhatsApp contact projection helper rejected the local store (${response2.errorCode})`);
    }
    return response2;
  }, whatsappContactProjectionCleanupBarrier);
  const response = operationDeadline === undefined ? await rawOperation : await operationDeadline.run(() => rawOperation, WEB_SESSION_OPERATION_LABEL);
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const directionStats = unavailableWhatsAppDirectionStats();
  const projectedStats = projectContactDirectionStats(directionStats, directionStats);
  const output = Object.freeze({
    provider: "whatsapp",
    operation: "contacts.list",
    accountSubject: accountSubject2,
    projection: "quiescent-account-bound-session-store",
    contacts: Object.freeze(response.contacts.map((contact2) => Object.freeze({
      ...contact2,
      alias: null,
      tags: Object.freeze([]),
      updatedAt: null,
      localProjectionStatsComplete: false,
      ...projectedStats
    }))),
    nextCursor: response.nextCursor,
    localContactTablePageComplete: response.localContactTablePageComplete,
    remoteContactSetComplete: false,
    contactSetIncompleteReasons: Object.freeze([
      "linked-device-contact-sync-coverage-unknown"
    ]),
    statsScope: "unavailable",
    statsCompleteness: "unavailable"
  });
  return {
    status: "succeeded",
    output: outputWithinBound(output, recipe.maxOutputBytes),
    finalUrl: WHATSAPP_ORIGIN,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function projectWhatsAppLocalInteractions(auth, recipe, parsedInput, dependencies, operationDeadline, registerCleanupBarrier) {
  if (auth.subject === undefined) {
    throw new Error("WhatsApp linked-device auth must be bound to its current account before private reads");
  }
  const accountSubject2 = auth.subject;
  const rawOperation = startWebSessionCleanupTrackedOperation(registerCleanupBarrier, async () => {
    operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
    const store = await validateWhatsAppStoreDirectory(auth.path, "projection");
    const initial = await captureInteractionProjectionParentIdentity(store);
    const fixed = await resolveFixedContactProjectionFiles("whatsapp-interaction-projection-helper.ts");
    const request = parseWhatsAppInteractionProjectionRequest({
      schemaVersion: WHATSAPP_INTERACTION_PROJECTION_PROTOCOL_VERSION,
      operation: "contacts.interactions.list",
      accountSubject: accountSubject2,
      cursor: parsedInput.cursor,
      cursorAnchor: parsedInput.cursorAnchor,
      limit: parsedInput.limit,
      storeIdentity: {
        dev: initial.store.dev.toString(),
        ino: initial.store.ino.toString()
      },
      sessionIdentity: {
        dev: initial.session.dev.toString(),
        ino: initial.session.ino.toString()
      },
      messageStoreIdentity: {
        dev: initial.messageStore.dev.toString(),
        ino: initial.messageStore.ino.toString()
      }
    });
    const timeoutMs = remainingTimeoutMs(recipe.timeoutMs, operationDeadline);
    const invocation = Object.freeze({
      command: Object.freeze([
        process.execPath,
        "--no-env-file",
        "--no-install",
        "--no-macros",
        "--no-addons",
        `--config=${fixed.config}`,
        fixed.helper
      ]),
      cwd: store,
      environment: contactProjectionEnvironment(),
      stdin: `${JSON.stringify(request)}
`,
      timeoutMs,
      maxOutputBytes: Math.min(recipe.maxOutputBytes, WHATSAPP_INTERACTION_PROJECTION_MAX_STDOUT_BYTES),
      maxStderrBytes: MAX_CONTACT_PROJECTION_STDERR_BYTES,
      ...operationDeadline === undefined ? {} : { signal: operationDeadline.signal }
    });
    const run = dependencies?.runInteractionProjectionHelper ?? runWhatsAppContactProjectionHelperChild;
    let childResult;
    let helperFailure;
    try {
      childResult = await run(invocation);
    } catch (error) {
      helperFailure = error;
    }
    let identityFailure;
    try {
      await revalidateInteractionProjectionParentIdentity(store, initial);
    } catch (error) {
      identityFailure = error;
    }
    if (helperFailure instanceof WhatsAppContactProjectionCleanupUnverifiedError) {
      throw helperFailure;
    }
    if (identityFailure !== undefined) {
      throw identityFailure instanceof Error ? identityFailure : new Error("WhatsApp interaction projection parent binding became unverifiable");
    }
    if (helperFailure !== undefined) {
      throw helperFailure instanceof Error ? helperFailure : new Error("WhatsApp interaction projection helper failed");
    }
    if (childResult === undefined || childResult.exitCode !== 0 || childResult.stderr.length !== 0) {
      throw new Error("WhatsApp interaction projection helper failed before reviewed output");
    }
    let parsed;
    try {
      parsed = JSON.parse(childResult.stdout.trim());
    } catch {
      throw new Error("WhatsApp interaction projection helper returned malformed output");
    }
    let response2;
    try {
      response2 = parseWhatsAppInteractionProjectionResponse(parsed, request);
    } catch {
      throw new Error("WhatsApp interaction projection helper returned unsupported output");
    }
    if (response2.status === "failed") {
      throw new Error(`WhatsApp interaction projection helper rejected the local store (${response2.errorCode})`);
    }
    return response2;
  }, whatsappContactProjectionCleanupBarrier);
  const response = operationDeadline === undefined ? await rawOperation : await operationDeadline.run(() => rawOperation, WEB_SESSION_OPERATION_LABEL);
  operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  const output = Object.freeze({
    provider: "whatsapp",
    operation: "contacts.list",
    accountSubject: accountSubject2,
    contactCollection: "interactions",
    projection: "quiescent-account-bound-local-message-inserts",
    projectionGeneration: response.projectionGeneration,
    interactions: response.interactions,
    nextCursor: response.nextCursor,
    localInsertPageComplete: response.localInsertPageComplete,
    checkpoint: response.checkpoint,
    remoteHistoryComplete: false,
    incompleteReasons: Object.freeze([
      "linked-device-history-coverage-unknown",
      "rowid-cursor-discovers-inserts-only"
    ])
  });
  return {
    status: "succeeded",
    output: outputWithinBound(output, recipe.maxOutputBytes),
    finalUrl: WHATSAPP_ORIGIN,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
function planWhatsAppReadCommand(action, input) {
  if (action === "messaging.list") {
    const limit = inputInteger(input, "limit", DEFAULT_LIMIT, 100);
    const folder = inputFolder(input);
    const flags = folder === "active" ? ["--no-archived"] : folder === "archived" ? ["--archived"] : folder === "unread" ? ["--unread"] : [];
    return Object.freeze({
      action,
      limit,
      folder,
      command: Object.freeze([
        "chats",
        "list",
        "--limit",
        String(limit),
        ...flags
      ])
    });
  }
  const conversationJid = whatsappTargetJid(input.conversation_jid, "input.conversation_jid");
  if (action === "messaging.read") {
    const limit = inputInteger(input, "limit", DEFAULT_LIMIT, 200);
    return Object.freeze({
      action,
      limit,
      conversationJid,
      command: Object.freeze([
        "messages",
        "list",
        "--chat",
        conversationJid,
        "--limit",
        String(limit)
      ])
    });
  }
  const messageId = whatsappMessageId(input.message_id, "input.message_id");
  return Object.freeze({
    action,
    conversationJid,
    messageId,
    command: Object.freeze([
      "messages",
      "show",
      "--chat",
      conversationJid,
      "--id",
      messageId
    ])
  });
}
function outputWithinBound(value, maximum) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maximum) {
    throw new Error("WhatsApp projected output exceeded its reviewed byte limit");
  }
  return value;
}
async function executeLocalProjection(runtime, recipe, input, dependencies, operationDeadline) {
  let output;
  if (recipe.action === "messaging.list") {
    const plan = planWhatsAppReadCommand(recipe.action, input);
    const timeoutMs = remainingTimeoutMs(recipe.timeoutMs, operationDeadline);
    const raw = await checkedRun(runtime.binary, readOnlyArguments(runtime.store, timeoutMs, plan.command), {
      timeoutMs,
      maxOutputBytes: recipe.maxOutputBytes,
      readOnly: true,
      ...dependencies === undefined ? {} : { dependencies },
      ...operationDeadline === undefined ? {} : { operationDeadline }
    });
    output = Object.freeze({
      accountSubject: runtime.subject,
      projection: "local-store",
      completeness: "bounded-current-local-projection",
      chats: projectWhatsAppChatsEnvelope(raw, plan.limit)
    });
  } else if (recipe.action === "messaging.read") {
    const plan = planWhatsAppReadCommand(recipe.action, input);
    const timeoutMs = remainingTimeoutMs(recipe.timeoutMs, operationDeadline);
    const raw = await checkedRun(runtime.binary, readOnlyArguments(runtime.store, timeoutMs, plan.command), {
      timeoutMs,
      maxOutputBytes: recipe.maxOutputBytes,
      readOnly: true,
      ...dependencies === undefined ? {} : { dependencies },
      ...operationDeadline === undefined ? {} : { operationDeadline }
    });
    output = Object.freeze({
      accountSubject: runtime.subject,
      projection: "local-store",
      completeness: "bounded-current-local-projection",
      conversationJid: plan.conversationJid,
      ...projectWhatsAppMessagesEnvelope(raw, plan.conversationJid, plan.limit)
    });
  } else if (recipe.action === "media.read") {
    const plan = planWhatsAppReadCommand(recipe.action, input);
    const timeoutMs = remainingTimeoutMs(recipe.timeoutMs, operationDeadline);
    const raw = await checkedRun(runtime.binary, readOnlyArguments(runtime.store, timeoutMs, plan.command), {
      timeoutMs,
      maxOutputBytes: recipe.maxOutputBytes,
      readOnly: true,
      ...dependencies === undefined ? {} : { dependencies },
      ...operationDeadline === undefined ? {} : { operationDeadline }
    });
    const message = projectWhatsAppMessageEnvelope(raw, plan.conversationJid, plan.messageId);
    output = Object.freeze({
      accountSubject: runtime.subject,
      projection: "local-store",
      completeness: "one-local-message",
      conversationJid: plan.conversationJid,
      messageId: plan.messageId,
      media: message.media
    });
  } else {
    throw new Error("WhatsApp operation has no local projection");
  }
  return {
    status: "succeeded",
    output: outputWithinBound(output, recipe.maxOutputBytes),
    finalUrl: WHATSAPP_ORIGIN,
    dispatchStarted: false,
    dispatch: { planned: 0, started: 0, verified: 0 }
  };
}
async function executeWhatsAppWebOperation(recipe, input, auth, options = {}) {
  if (recipe.site !== "whatsapp" || (recipe.action === "contacts.list" ? recipe.contractVersion !== 2 : recipe.contractVersion !== 1) || !isWhatsAppOperation(recipe.action))
    throw new Error("WhatsApp linked-device recipe is not installed");
  const contract = WHATSAPP_WEB_OPERATIONS[recipe.action];
  if (contract.state !== "observed") {
    throw new Error(`WhatsApp linked-device operation ${recipe.action} is capture-required: ${contract.reason}`);
  }
  const localProjection = recipe.action === "contacts.list" || recipe.action === "messaging.list" || recipe.action === "messaging.read" || recipe.action === "media.read";
  if (!localProjection) {
    throw new Error(`WhatsApp linked-device operation ${recipe.action} has no executable local projection`);
  }
  options.operationDeadline?.throwIfUnavailable(WEB_SESSION_OPERATION_LABEL);
  if (recipe.action === "contacts.list") {
    const parsedInput = exactContactInput(input);
    if (parsedInput.collection === "interactions") {
      return projectWhatsAppLocalInteractions(requireWhatsAppAuth(auth), recipe, parsedInput, options.dependencies, options.operationDeadline, options.registerCleanupBarrier);
    }
    return projectWhatsAppLocalContacts(requireWhatsAppAuth(auth), recipe, input, options.dependencies, options.operationDeadline, options.registerCleanupBarrier);
  }
  const runtime = await boundRuntime(auth, "projection", recipe.timeoutMs, options.dependencies, options.environment ?? process.env, options.operationDeadline);
  if (localProjection) {
    return executeLocalProjection(runtime, recipe, input, options.dependencies, options.operationDeadline);
  }
  throw new Error("WhatsApp local projection classification changed during execution");
}
async function planWhatsAppPairing(auth, options = {}) {
  const linked = requireWhatsAppAuth(auth);
  const store = await validateWhatsAppStoreDirectory(linked.path, "pair");
  const binary = await runtimeBinary(options.dependencies, options.environment ?? process.env);
  const phone = options.phone;
  if (phone !== undefined && !/^\+?[0-9]{5,20}$/u.test(phone))
    throw new Error("WhatsApp pairing phone must be one international number");
  return Object.freeze({
    binary,
    store,
    arguments: Object.freeze([
      "--store",
      store,
      "--timeout",
      "10m",
      "auth",
      "--idle-exit",
      "30s",
      "--qr-format",
      "terminal",
      ...phone === undefined ? [] : ["--phone", phone]
    ]),
    environment: Object.freeze({
      ...wacliEnvironment(false),
      WACLI_SYNC_MAX_MESSAGES: String(MAX_SYNC_MESSAGES),
      WACLI_SYNC_MAX_DB_SIZE: MAX_SYNC_DB_SIZE
    })
  });
}
async function runInteractivePairing(plan) {
  const child = Bun.spawn([plan.binary, ...plan.arguments], {
    env: { ...plan.environment },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit"
  });
  return child.exited;
}
async function pairWhatsAppAuth(auth, options) {
  const plan = await planWhatsAppPairing(auth, options);
  const run = options.dependencies?.runInteractive ?? runInteractivePairing;
  await options.attempt.beforeExternalBegin();
  if (await run(plan) !== 0) {
    throw new Error("WhatsApp linked-device pairing did not complete");
  }
  return probeWhatsAppWebSubject(auth, {
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies },
    ...options.environment === undefined ? {} : { environment: options.environment },
    timeoutMs: 1e4
  });
}
async function planWhatsAppSyncOnce(auth, options = {}) {
  const linked = requireWhatsAppAuth(auth);
  const store = await validateWhatsAppStoreDirectory(linked.path, "sync");
  const binary = await runtimeBinary(options.dependencies, options.environment ?? process.env);
  return Object.freeze({
    binary,
    store,
    arguments: Object.freeze([
      "--store",
      store,
      "--json",
      "--full",
      "--timeout",
      "5m",
      "sync",
      "--once",
      "--presence-mode",
      "quiet",
      "--idle-exit",
      "30s",
      "--max-reconnect",
      "1m",
      "--max-messages",
      String(MAX_SYNC_MESSAGES),
      "--max-db-size",
      MAX_SYNC_DB_SIZE
    ]),
    environment: wacliEnvironment(false),
    emitsProtocolAcknowledgements: true
  });
}
async function syncWhatsAppAuthOnce(auth, options) {
  const linked = requireWhatsAppAuth(auth);
  if (linked.subject === undefined) {
    throw new Error("WhatsApp linked-device auth must be account-bound before sync");
  }
  const currentSubject = await probeWhatsAppWebSubject(linked, {
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies },
    ...options.environment === undefined ? {} : { environment: options.environment },
    timeoutMs: 1e4
  });
  if (currentSubject !== linked.subject) {
    throw new Error("WhatsApp sync account did not match the bound auth realm");
  }
  const plan = await planWhatsAppSyncOnce(auth, options);
  const run = options.dependencies?.run ?? runWacli;
  await options.attempt.beforeExternalBegin();
  const result = await run({
    binary: plan.binary,
    arguments: plan.arguments,
    environment: plan.environment,
    timeoutMs: 5 * 60000,
    maxOutputBytes: 1024 * 1024
  });
  if (result.exitCode !== 0) {
    throw new Error("WhatsApp linked-device synchronization failed");
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error("WhatsApp linked-device synchronization returned malformed JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.keys(parsed).sort().join(",") !== "data,error,success" || !("success" in parsed) || parsed.success !== true || !("error" in parsed) || parsed.error !== null || !("data" in parsed) || typeof parsed.data !== "object" || parsed.data === null || Array.isArray(parsed.data))
    throw new Error("WhatsApp linked-device synchronization returned an unsupported response");
  const data = parsed.data;
  if (Object.keys(data).sort().join(",") !== "messages_stored,synced" || data.synced !== true || !Number.isSafeInteger(data.messages_stored) || data.messages_stored < 0)
    throw new Error("WhatsApp linked-device synchronization returned an unsupported response");
  const finalSubject = await probeWhatsAppWebSubject(linked, {
    ...options.dependencies === undefined ? {} : { dependencies: options.dependencies },
    ...options.environment === undefined ? {} : { environment: options.environment },
    timeoutMs: 1e4
  });
  if (finalSubject !== linked.subject) {
    throw new Error("WhatsApp linked-device account changed during sync");
  }
  return Object.freeze({ messagesStored: data.messages_stored });
}

export { WhatsAppContactProjectionCleanupUnverifiedError, containsWhatsAppContactProjectionCleanupUnverified, validateWhatsAppStoreDirectory, resolvePinnedWacliBinary, inspectWhatsAppProtocolRuntime, probeWhatsAppWebSubject, runWhatsAppContactProjectionHelperChild, runWhatsAppMessageExportSessionHelperChild, whatsappContactProjectionCleanupBarrier, planWhatsAppReadCommand, executeWhatsAppWebOperation, planWhatsAppPairing, pairWhatsAppAuth, planWhatsAppSyncOnce, syncWhatsAppAuthOnce };
