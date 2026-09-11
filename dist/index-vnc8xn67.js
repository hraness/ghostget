// @bun
// src/providers/whatsapp-account-identity.ts
var CANONICAL_PN_ACCOUNT_PATTERN = /^[1-9][0-9]{4,14}$/u;
var CANONICAL_LID_ACCOUNT_PATTERN = /^[1-9][0-9]{4,19}$/u;
function isCanonicalWhatsAppAccountId(kind, value) {
  return typeof value === "string" && (kind === "pn" ? CANONICAL_PN_ACCOUNT_PATTERN.test(value) : CANONICAL_LID_ACCOUNT_PATTERN.test(value));
}

// src/providers/whatsapp-web.ts
var WHATSAPP_PROTOCOL_PIN = Object.freeze({
  implementation: "github.com/openclaw/wacli",
  version: "0.15.0",
  tag: "v0.15.0",
  commit: "a020de724180d31eccfa5241d45443402d62fb06",
  transport: "official-release",
  darwinArm64Archive: "wacli_0.15.0_darwin_arm64.tar.gz",
  darwinArm64ArchiveSha256: "2b54f33d246e913a5c33525b4fc895a345363c2dcc673c70fa5f19cffb15d17d",
  darwinArm64BinarySha256: "a900af4d0dfd10471bcdf74105b9f256d1a08574242a041df3e5985a548826aa",
  signature: Object.freeze({
    authority: "Developer ID Application: OpenClaw Foundation (FWJYW4S8P8)",
    identifier: "org.openclaw.wacli",
    teamIdentifier: "FWJYW4S8P8",
    designatedRequirement: 'designated => identifier "org.openclaw.wacli" and anchor apple generic and certificate leaf[subject.OU] = FWJYW4S8P8',
    cdHash: "a67b5d50877d6a2c3386d969d24dfc991bcc6a85",
    cdHashFull: "a67b5d50877d6a2c3386d969d24dfc991bcc6a8571a3343afc82e8d6de32e486",
    hardenedRuntime: true,
    notarized: true
  })
});
var WHATSAPP_WEB_OPERATION_NAMES = Object.freeze([
  "contacts.list",
  "content.edit",
  "content.save",
  "content.share",
  "media.read",
  "messaging.list",
  "messaging.read",
  "messaging.send",
  "reactions.set"
]);
function captureRequired(effect, risk, reason) {
  return Object.freeze({ effect, risk, state: "capture-required", reason });
}
function observed(effect, risk, reason) {
  return Object.freeze({ effect, risk, state: "observed", reason });
}
var WHATSAPP_WEB_OPERATIONS = Object.freeze({
  "contacts.list": observed("read", "R1", "the account-bound Whatsmeow session.db contact table and content-free wacli.db insert evidence are projected by fixed killable read-only helpers after exact pinned-schema, owner, quiescence, and file-identity validation; rowid pages expose their exact database generation and never claim remote-history completeness"),
  "messaging.list": observed("read", "R1", "the pinned read-only local projection is account-bound and a paired nonempty fixture proved bounded chat listing without opening a WhatsApp connection"),
  "messaging.read": observed("read", "R1", "the pinned read-only local projection binds one exact conversation and a paired nonempty fixture proved bounded message listing without opening a WhatsApp connection"),
  "media.read": observed("read", "R1", "the pinned metadata-only local projection is account-bound and a paired fixture proved exact attachment lookup while omitting paths and media keys"),
  "reactions.set": captureRequired("write", "R2", "the exact linked-device reaction command and local readback are reserved, but create/remove fixtures and process-private payload delivery are not yet proven"),
  "content.save": captureRequired("write", "R2", "the pinned protocol client can read starred state but does not expose a reviewed star/unstar mutation"),
  "messaging.send": captureRequired("write", "R3", "the official read runtime exposes no Wrench-qualified mutation transport; sending remains unavailable until a separate process-private transport, controlled live fixture, and exact accepted-message reconciliation are proven"),
  "content.edit": captureRequired("write", "R3", "the exact recent-self-message edit and local readback are reserved, but a low-stakes live fixture and process-private message delivery are not yet proven"),
  "content.share": captureRequired("write", "R3", "the exact one-message forward and destination readback are reserved, but a low-stakes live fixture must still prove text and media variants")
});
var WHATSAPP_COMMUNITY_MEMBERSHIP_POLICY = Object.freeze({
  risk: "R4",
  state: "prohibited",
  reason: "community and group membership changes remain outside the executable wrench boundary"
});
var MAX_TEXT = 65536;
var MAX_NAME = 1024;
var MAX_MESSAGE_ID = 256;
var MAX_JID = 96;
var MAX_BUTTONS = 64;
var MAX_CHATS = 100;
var MAX_MESSAGES = 200;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, label) {
  if (!isRecord(value))
    throw new Error(`${label} must be an object`);
  return value;
}
function exactKeys(value, required, optional, label) {
  const keys = new Set(Object.keys(value));
  for (const key of required) {
    if (!keys.delete(key))
      throw new Error(`${label} omitted ${key}`);
  }
  for (const key of optional)
    keys.delete(key);
  if (keys.size > 0)
    throw new Error(`${label} contained unsupported fields`);
}
function text(value, label, maximum = MAX_TEXT, allowEmpty = false) {
  if (typeof value !== "string" || !allowEmpty && value.length < 1 || value.length > maximum || /[\0\r]/u.test(value))
    throw new Error(`${label} must be bounded text`);
  return value;
}
function optionalText(value, label, maximum = MAX_TEXT) {
  if (value === undefined || value === null || value === "")
    return null;
  return text(value, label, maximum);
}
function boolean(value, label) {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be boolean`);
  return value;
}
function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${label} must be a bounded integer`);
  return value;
}
function timestamp(value, label) {
  const result = text(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(result) || !Number.isFinite(Date.parse(result)))
    throw new Error(`${label} must be an RFC3339 UTC timestamp`);
  return result;
}
function boundedArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} must be a bounded array`);
  }
  return value;
}
var userJidPattern = /^[0-9]{5,20}(?::[0-9]{1,5})?@s\.whatsapp\.net$/u;
var lidJidPattern = /^[0-9]{5,32}(?::[0-9]{1,5})?@lid$/u;
var groupJidPattern = /^[0-9]{5,32}(?:-[0-9]{5,20})?@g\.us$/u;
var newsletterJidPattern = /^[0-9]{5,32}@newsletter$/u;
var broadcastJidPattern = /^(?:status|[0-9]{5,32})@broadcast$/u;
function parseWhatsAppJid(value, label = "WhatsApp JID") {
  const jid = text(value, label, MAX_JID);
  const kind = userJidPattern.test(jid) ? "user" : lidJidPattern.test(jid) ? "lid" : groupJidPattern.test(jid) ? "group" : newsletterJidPattern.test(jid) ? "newsletter" : broadcastJidPattern.test(jid) ? "broadcast" : null;
  if (kind === null)
    throw new Error(`${label} must be an exact WhatsApp JID`);
  return Object.freeze({ jid, kind });
}
function whatsappTargetJid(value, label = "WhatsApp target JID") {
  const parsed = parseWhatsAppJid(value, label);
  if (parsed.kind === "newsletter" || parsed.kind === "broadcast" || parsed.jid.includes(":"))
    throw new Error(`${label} is not an addressable user, LID, or group JID`);
  return parsed.jid;
}
function whatsappMessageId(value, label = "WhatsApp message ID") {
  const result = text(value, label, MAX_MESSAGE_ID);
  if (!/^[A-Za-z0-9._~:-]{1,256}$/u.test(result)) {
    throw new Error(`${label} must be an exact bounded message ID`);
  }
  return result;
}
function senderJid(value, label) {
  if (value === "")
    return null;
  return parseWhatsAppJid(value, label).jid;
}
function envelope(value, label) {
  const root = record(value, `${label} envelope`);
  exactKeys(root, ["success", "data", "error"], [], `${label} envelope`);
  if (root.success !== true || root.error !== null) {
    throw new Error(`${label} returned an unsuccessful envelope`);
  }
  return root.data;
}
function whatsappSubjectFromLinkedJid(value) {
  const parsed = parseWhatsAppJid(value, "WhatsApp linked-device JID");
  if (parsed.kind !== "user" && parsed.kind !== "lid") {
    throw new Error("WhatsApp linked-device JID must name one user account");
  }
  const account = parsed.jid.slice(0, parsed.jid.indexOf("@")).split(":", 1)[0];
  const kind = parsed.kind === "user" ? "pn" : "lid";
  if (account === undefined || !isCanonicalWhatsAppAccountId(kind, account)) {
    throw new Error("WhatsApp linked-device account identifier is not canonical");
  }
  return `whatsapp:${kind}:${account}`;
}
function parseWhatsAppAuthStatusEnvelope(value) {
  const data = record(envelope(value, "WhatsApp auth status"), "auth status");
  const authenticated = boolean(data.authenticated, "auth status.authenticated");
  const expected = ["authenticated"];
  if (data.linked_jid !== undefined)
    expected.push("linked_jid");
  if (data.phone !== undefined)
    expected.push("phone");
  exactKeys(data, expected, [], "auth status");
  if (!authenticated) {
    if (data.linked_jid !== undefined || data.phone !== undefined) {
      throw new Error("unauthenticated WhatsApp status exposed account fields");
    }
    return Object.freeze({
      authenticated: false,
      linkedJid: null,
      subject: null
    });
  }
  const linkedJid = parseWhatsAppJid(data.linked_jid, "auth status.linked_jid");
  if (linkedJid.kind !== "user" && linkedJid.kind !== "lid") {
    throw new Error("authenticated WhatsApp status did not name one account");
  }
  if (data.phone !== undefined) {
    const phone = text(data.phone, "auth status.phone", 20);
    if (!isCanonicalWhatsAppAccountId("pn", phone)) {
      throw new Error("auth status.phone must be a canonical international number");
    }
    const linkedAccount = linkedJid.jid.slice(0, linkedJid.jid.indexOf("@")).split(":", 1)[0];
    if (linkedJid.kind === "user" && phone !== linkedAccount) {
      throw new Error("auth status.phone did not match linked_jid");
    }
  }
  return Object.freeze({
    authenticated: true,
    linkedJid: linkedJid.jid,
    subject: whatsappSubjectFromLinkedJid(linkedJid.jid)
  });
}
function projectChat(value, index) {
  const item = record(value, `chat[${index}]`);
  exactKeys(item, [
    "jid",
    "kind",
    "name",
    "last_message_ts",
    "archived",
    "pinned",
    "muted_until",
    "unread",
    "unread_count"
  ], [], `chat[${index}]`);
  return Object.freeze({
    jid: parseWhatsAppJid(item.jid, `chat[${index}].jid`).jid,
    kind: text(item.kind, `chat[${index}].kind`, 64),
    name: optionalText(item.name, `chat[${index}].name`, MAX_NAME),
    lastMessageAt: timestamp(item.last_message_ts, `chat[${index}].last_message_ts`),
    archived: boolean(item.archived, `chat[${index}].archived`),
    pinned: boolean(item.pinned, `chat[${index}].pinned`),
    mutedUntil: integer(item.muted_until, `chat[${index}].muted_until`, -1),
    unread: boolean(item.unread, `chat[${index}].unread`),
    unreadCount: integer(item.unread_count, `chat[${index}].unread_count`, 0, 1e6)
  });
}
function projectWhatsAppChatsEnvelope(value, maximum = MAX_CHATS) {
  const limit = integer(maximum, "WhatsApp chat projection limit", 1, MAX_CHATS);
  return Object.freeze(boundedArray(envelope(value, "WhatsApp chats"), "chats", limit).map(projectChat));
}
function projectButton(value, index) {
  const item = record(value, `button[${index}]`);
  exactKeys(item, ["type", "display_text"], ["id", "url", "phone_number", "description", "response_type", "index"], `button[${index}]`);
  return Object.freeze({
    type: text(item.type, `button[${index}].type`, 64),
    displayText: text(item.display_text, `button[${index}].display_text`, 1024, true),
    index: item.index === undefined ? null : integer(item.index, `button[${index}].index`, 0, 1000)
  });
}
var messageRequiredKeys = [
  "ChatJID",
  "ChatName",
  "MsgID",
  "SenderJID",
  "SenderName",
  "Timestamp",
  "FromMe",
  "Text",
  "DisplayText",
  "IsForwarded",
  "ForwardingScore",
  "ReactionToID",
  "ReactionEmoji",
  "MediaType",
  "MediaCaption",
  "Filename",
  "MimeType",
  "DirectPath",
  "LocalPath",
  "DownloadedAt",
  "Starred",
  "StarredAt",
  "Revoked",
  "DeletedForMe",
  "Snippet"
];
function projectMessage(value, label, expectedChat, expectedMessageId) {
  const item = record(value, label);
  exactKeys(item, messageRequiredKeys, ["quoted_msg_id", "quoted_sender_jid", "Buttons"], label);
  const chatJid = parseWhatsAppJid(item.ChatJID, `${label}.ChatJID`).jid;
  const messageId = whatsappMessageId(item.MsgID, `${label}.MsgID`);
  if (expectedChat !== undefined && chatJid !== expectedChat) {
    throw new Error(`${label} did not match the requested conversation`);
  }
  if (expectedMessageId !== undefined && messageId !== expectedMessageId) {
    throw new Error(`${label} did not match the requested message`);
  }
  text(item.DirectPath, `${label}.DirectPath`, 16384, true);
  const localPath = text(item.LocalPath, `${label}.LocalPath`, 4096, true);
  const mediaType = optionalText(item.MediaType, `${label}.MediaType`, 64);
  const downloadedAt = timestamp(item.DownloadedAt, `${label}.DownloadedAt`);
  timestamp(item.StarredAt, `${label}.StarredAt`);
  const buttons = item.Buttons === undefined ? [] : boundedArray(item.Buttons, `${label}.Buttons`, MAX_BUTTONS).map(projectButton);
  const sender = senderJid(item.SenderJID, `${label}.SenderJID`);
  const quotedSender = item.quoted_sender_jid === undefined ? null : senderJid(item.quoted_sender_jid, `${label}.quoted_sender_jid`);
  return Object.freeze({
    chatJid,
    chatName: optionalText(item.ChatName, `${label}.ChatName`, MAX_NAME),
    messageId,
    senderJid: sender,
    senderName: optionalText(item.SenderName, `${label}.SenderName`, MAX_NAME),
    timestamp: timestamp(item.Timestamp, `${label}.Timestamp`),
    fromMe: boolean(item.FromMe, `${label}.FromMe`),
    text: text(item.Text, `${label}.Text`, MAX_TEXT, true),
    displayText: text(item.DisplayText, `${label}.DisplayText`, MAX_TEXT, true),
    quotedMessageId: item.quoted_msg_id === undefined ? null : whatsappMessageId(item.quoted_msg_id, `${label}.quoted_msg_id`),
    quotedSenderJid: quotedSender,
    buttons: Object.freeze(buttons),
    forwarded: boolean(item.IsForwarded, `${label}.IsForwarded`),
    forwardingScore: integer(item.ForwardingScore, `${label}.ForwardingScore`, 0, 1e6),
    reactionToId: optionalText(item.ReactionToID, `${label}.ReactionToID`, MAX_MESSAGE_ID),
    reactionEmoji: optionalText(item.ReactionEmoji, `${label}.ReactionEmoji`, 64),
    media: mediaType === null ? null : Object.freeze({
      type: mediaType,
      caption: optionalText(item.MediaCaption, `${label}.MediaCaption`, MAX_TEXT),
      filename: optionalText(item.Filename, `${label}.Filename`, MAX_NAME),
      mimeType: optionalText(item.MimeType, `${label}.MimeType`, 255),
      downloaded: localPath !== "" && downloadedAt !== "0001-01-01T00:00:00Z"
    }),
    starred: boolean(item.Starred, `${label}.Starred`),
    revoked: boolean(item.Revoked, `${label}.Revoked`),
    deletedForMe: boolean(item.DeletedForMe, `${label}.DeletedForMe`),
    snippet: optionalText(item.Snippet, `${label}.Snippet`, 4096)
  });
}
function projectWhatsAppMessagesEnvelope(value, expectedChat, maximum = MAX_MESSAGES) {
  const chat = whatsappTargetJid(expectedChat, "requested conversation JID");
  const limit = integer(maximum, "WhatsApp message projection limit", 1, MAX_MESSAGES);
  const data = record(envelope(value, "WhatsApp messages"), "messages data");
  exactKeys(data, ["messages", "fts"], [], "messages data");
  const messages = boundedArray(data.messages, "messages", limit).map((item, index) => projectMessage(item, `message[${index}]`, chat));
  return Object.freeze({
    messages: Object.freeze(messages),
    fullTextSearch: boolean(data.fts, "messages.fts")
  });
}
function projectWhatsAppMessageEnvelope(value, expectedChat, expectedMessageId) {
  const chat = whatsappTargetJid(expectedChat, "requested conversation JID");
  const messageId = whatsappMessageId(expectedMessageId, "requested message ID");
  return projectMessage(envelope(value, "WhatsApp message"), "message", chat, messageId);
}

export { WHATSAPP_PROTOCOL_PIN, WHATSAPP_WEB_OPERATION_NAMES, WHATSAPP_WEB_OPERATIONS, parseWhatsAppJid, whatsappTargetJid, whatsappMessageId, parseWhatsAppAuthStatusEnvelope, projectWhatsAppChatsEnvelope, projectWhatsAppMessagesEnvelope, projectWhatsAppMessageEnvelope };
