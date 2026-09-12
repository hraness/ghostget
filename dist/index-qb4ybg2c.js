// @bun
// src/providers/imessage-direct.ts
import { types as nodeTypes } from "util";
var IMSG_UPSTREAM_VERSION = "0.14.1";
var IMSG_UPSTREAM_COMMIT = "25beb76c902b0acf2dd7ae392f1b0792f6813240";
var IMSG_PRIVATE_TRANSPORT_PATCH_COMMIT = "292db82d89293867ef847a2875667fea0fdd5dc1";
var IMSG_PRIVATE_TRANSPORT_PATCH_SHA256 = "99cf18953470e85a62a226f207e6a5c0452d3997675c99eabf4d5cb73c6411fd";
var IMSG_EXACT_CHAT_PATCH_COMMIT = "c5994f00d17969fd7772fd2772e7b3591089513a";
var IMSG_EXACT_CHAT_PATCH_SHA256 = "b05aa92a078930f96fda611c674436638843f7b148d7bfa3b65ed1ccb0885c13";
var IMSG_NO_FETCH_RICH_CARDS_PATCH_COMMIT = "520b82ab025c1d4d57333b552aa65c9ae3fdb5fd";
var IMSG_NO_FETCH_RICH_CARDS_PATCH_SHA256 = "c2346afca4dd0f9721c235db4f692d6a2d6dece36481e074d94b5ce78f2e019b";
var IMSG_REVIEWED_PATCH_COMMIT = IMSG_NO_FETCH_RICH_CARDS_PATCH_COMMIT;
var IMSG_REVIEWED_PATCHES = Object.freeze([
  Object.freeze({
    commit: IMSG_PRIVATE_TRANSPORT_PATCH_COMMIT,
    sha256: IMSG_PRIVATE_TRANSPORT_PATCH_SHA256
  }),
  Object.freeze({
    commit: IMSG_EXACT_CHAT_PATCH_COMMIT,
    sha256: IMSG_EXACT_CHAT_PATCH_SHA256
  }),
  Object.freeze({
    commit: IMSG_NO_FETCH_RICH_CARDS_PATCH_COMMIT,
    sha256: IMSG_NO_FETCH_RICH_CARDS_PATCH_SHA256
  })
]);
var IMSG_REVIEWED_VERSION = "0.14.1+private-transport.3";
var IMSG_DARWIN_ARM64_EXECUTABLE_SHA256 = "46c4c73c81c7db2d516c2d467c66aff03c73de196996d646bc8afce0ea85cff6";
var IMSG_NO_FETCH_RICH_CARDS_AVAILABLE = true;
var IMSG_TOOL_PIN = Object.freeze({
  id: "imsg-private-transport",
  implementation: "github.com/openclaw/imsg+reviewed-patch",
  version: IMSG_REVIEWED_VERSION,
  upstreamVersion: IMSG_UPSTREAM_VERSION,
  upstreamCommit: IMSG_UPSTREAM_COMMIT,
  reviewedPatchCommit: IMSG_REVIEWED_PATCH_COMMIT,
  reviewedPatches: IMSG_REVIEWED_PATCHES,
  sourceUrl: `https://github.com/openclaw/imsg/tree/${IMSG_UPSTREAM_COMMIT}`,
  artifacts: Object.freeze([Object.freeze({
    platform: "darwin",
    arch: "arm64",
    executableSha256: IMSG_DARWIN_ARM64_EXECUTABLE_SHA256
  })])
});
var IMSG_ORIGIN = "https://www.apple.com";
var IMSG_SERVICE = "iMessage";
var IMSG_TRANSPORT = "applescript";
var IMSG_ACCOUNT_SELECTION = "device-default";
var IMSG_SMS_FALLBACK = false;
var IMSG_MAX_CHAT_SCAN = 1000;
var IMSG_MAX_MESSAGES = 200;
var IMSG_MAX_TEXT_BYTES = 65536;
var IMSG_DIRECT_OPERATION_NAMES = Object.freeze([
  "messaging.list",
  "conversations.read",
  "messaging.read",
  "messaging.send",
  "messaging.delivery.read"
]);
var IMSG_DIRECT_OPERATIONS = Object.freeze({
  "messaging.list": Object.freeze({
    effect: "read",
    risk: "R1",
    reason: "list a bounded current local Messages conversation window"
  }),
  "conversations.read": Object.freeze({
    effect: "read",
    risk: "R1",
    reason: "resolve one exact live iMessage chat GUID, service, and database row"
  }),
  "messaging.read": Object.freeze({
    effect: "read",
    risk: "R1",
    reason: "read bounded current context from one exact live iMessage chat"
  }),
  "messaging.send": Object.freeze({
    effect: "write",
    risk: "R3",
    reason: "submit one confirmed text bubble through explicit AppleScript iMessage transport with SMS fallback disabled"
  }),
  "messaging.delivery.read": Object.freeze({
    effect: "read",
    risk: "R1",
    reason: "read the local Messages status row for one exact observed outgoing GUID"
  })
});
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
function hasWellFormedUnicode(value) {
  for (let index = 0;index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 55296 && code <= 56319) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 56320 && next <= 57343))
        return false;
      index += 1;
    } else if (code >= 56320 && code <= 57343)
      return false;
  }
  return true;
}
function boundedImsgString(value, label, maximum, options = {}) {
  if (typeof value !== "string" || !options.allowEmpty && value.length === 0 || Buffer.byteLength(value, "utf8") > maximum || !hasWellFormedUnicode(value) || value.includes("\x00") || !options.allowNewlines && /[\u0001-\u001f\u007f-\u009f]/u.test(value))
    throw new Error(`${label} must be bounded well-formed text`);
  return value;
}
function positiveInteger(value, label, maximum) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error(`${label} must be a positive bounded integer`);
  return value;
}
function coordinate(source, label) {
  if (source.service !== IMSG_SERVICE) {
    throw new Error(`${label}.service must be exactly iMessage`);
  }
  return Object.freeze({
    chatGuid: boundedImsgString(source.chat_guid, `${label}.chat_guid`, 2048),
    service: IMSG_SERVICE,
    observedChatRowId: positiveInteger(source.observed_chat_row_id, `${label}.observed_chat_row_id`, Number.MAX_SAFE_INTEGER)
  });
}
function isImsgDirectOperation(value) {
  return IMSG_DIRECT_OPERATION_NAMES.includes(value);
}
function parseImsgDirectOperationInput(action, value) {
  const source = record(value, `${action} input`);
  if (action === "messaging.list") {
    exactKeys(source, [], ["limit"], `${action} input`);
    return Object.freeze({
      limit: source.limit === undefined ? 200 : positiveInteger(source.limit, `${action} input.limit`, IMSG_MAX_CHAT_SCAN)
    });
  }
  const baseKeys = ["chat_guid", "service", "observed_chat_row_id"];
  if (action === "conversations.read") {
    exactKeys(source, baseKeys, [], `${action} input`);
    return coordinate(source, `${action} input`);
  }
  if (action === "messaging.read") {
    exactKeys(source, baseKeys, ["limit"], `${action} input`);
    return Object.freeze({
      ...coordinate(source, `${action} input`),
      limit: source.limit === undefined ? 100 : positiveInteger(source.limit, `${action} input.limit`, IMSG_MAX_MESSAGES)
    });
  }
  if (action === "messaging.send") {
    exactKeys(source, [...baseKeys, "text"], [], `${action} input`);
    return Object.freeze({
      ...coordinate(source, `${action} input`),
      text: boundedImsgString(source.text, `${action} input.text`, IMSG_MAX_TEXT_BYTES, {
        allowNewlines: true
      })
    });
  }
  exactKeys(source, [...baseKeys, "message_guid"], [], `${action} input`);
  return Object.freeze({
    ...coordinate(source, `${action} input`),
    messageGuid: boundedImsgString(source.message_guid, `${action} input.message_guid`, 2048)
  });
}
function imsgStatusRequest(id = "status") {
  return Object.freeze({ jsonrpc: "2.0", id, method: "status", params: Object.freeze({}) });
}
function imsgOperationRequests(action, input) {
  if (action === "messaging.list") {
    return Object.freeze([Object.freeze({
      jsonrpc: "2.0",
      id: "operation",
      method: "chats.list",
      params: Object.freeze({ limit: input.limit })
    })]);
  }
  const target = input;
  if (action === "conversations.read") {
    return Object.freeze([Object.freeze({
      jsonrpc: "2.0",
      id: "operation",
      method: "chats.get",
      params: Object.freeze({ chat_id: target.observedChatRowId })
    })]);
  }
  if (action === "messaging.read") {
    return Object.freeze([
      Object.freeze({
        jsonrpc: "2.0",
        id: "route",
        method: "chats.get",
        params: Object.freeze({ chat_id: target.observedChatRowId })
      }),
      Object.freeze({
        jsonrpc: "2.0",
        id: "operation",
        method: "messages.history",
        params: Object.freeze({
          chat_id: target.observedChatRowId,
          limit: input.limit,
          attachments: false
        })
      })
    ]);
  }
  if (action === "messaging.send") {
    return Object.freeze([Object.freeze({
      jsonrpc: "2.0",
      id: "operation",
      method: "send",
      params: Object.freeze({
        chat_guid: target.chatGuid,
        text: input.text,
        service: "imessage",
        transport: IMSG_TRANSPORT,
        allow_sms_fallback: IMSG_SMS_FALLBACK
      })
    })]);
  }
  return Object.freeze([Object.freeze({
    jsonrpc: "2.0",
    id: "operation",
    method: "message.send_status",
    params: Object.freeze({ guid: input.messageGuid })
  })]);
}

export { IMSG_UPSTREAM_VERSION, IMSG_REVIEWED_VERSION, IMSG_NO_FETCH_RICH_CARDS_AVAILABLE, IMSG_TOOL_PIN, IMSG_ORIGIN, IMSG_SERVICE, IMSG_TRANSPORT, IMSG_ACCOUNT_SELECTION, IMSG_SMS_FALLBACK, IMSG_MAX_CHAT_SCAN, IMSG_DIRECT_OPERATION_NAMES, IMSG_DIRECT_OPERATIONS, boundedImsgString, isImsgDirectOperation, parseImsgDirectOperationInput, imsgStatusRequest, imsgOperationRequests };
