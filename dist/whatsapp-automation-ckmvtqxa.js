// @bun
import {
  WHATSAPP_AUTOMATION_PROTOCOL,
  createWhatsAppAutomationRuntime
} from "./index-vzyyhqmg.js";
import"./index-fdkav3nq.js";
import"./index-vnc8xn67.js";
import {
  AUTOMATION_ACTION_KINDS,
  automationArray,
  automationDigest,
  automationInteger,
  automationRecord,
  automationText,
  parseAutomationAction,
  parseAutomationCoordinate,
  parseAutomationIdentity
} from "./index-2ymnp8xv.js";
import"./index-f30rdtbs.js";
import"./index-r9zhe6em.js";
import"./index-0ywm1fj9.js";
import"./index-4bpemvnc.js";
import"./index-aka7rgdj.js";
import"./index-vtj5zdgf.js";
import"./index-n4szk3nw.js";
import"./index-26yq8q16.js";
import {
  canonicalJson
} from "./index-8sbt8qwx.js";
import"./index-z1w83f81.js";

// src/providers/whatsapp-automation.ts
import { createHash } from "crypto";
var sha = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
function coordinate(value) {
  const result = parseAutomationCoordinate(value);
  if (result.provider !== "whatsapp")
    throw new Error("WhatsApp cannot operate another messaging network");
  return result;
}
function identity(admission, snapshot) {
  return parseAutomationIdentity({ provider: "whatsapp", authId: admission.auth.id, accountIdentity: admission.accountIdentity, accountSubject: snapshot.subject, implementationIdentity: admission.implementationIdentity, sourceGeneration: snapshot.sourceGeneration });
}
function conversation(value) {
  const row = automationRecord(value, ["jid", "kind", "name"]), selected = coordinate({ provider: "whatsapp", conversationJid: row.jid });
  if (row.kind !== "dm")
    throw new Error("Only direct WhatsApp conversations can be enrolled");
  return { coordinate: selected, title: row.name === null || row.name === "" ? null : automationText(row.name, 512), kind: "single", participants: [selected.conversationJid] };
}
function exact(database, selected, account) {
  if (selected.conversationJid === account)
    throw new Error("Self messaging requires a separate contract");
  return conversation(database.query("SELECT jid,kind,name FROM chats WHERE jid=? AND kind='dm'").get(selected.conversationJid));
}
var messageColumns = "chat_jid,msg_id,sender_jid,ts,from_me,text,display_text,quoted_msg_id,reaction_to_id,reaction_emoji,media_type,filename,mime_type,file_length,revoked,deleted_for_me";
var nullableText = (value, maximum) => value === null || value === "" ? null : automationText(value, maximum, true);
function message(value) {
  const row = automationRecord(value, ["kind", ...messageColumns.split(",")]);
  const selected = coordinate({ provider: "whatsapp", conversationJid: row.chat_jid });
  const id = automationText(row.msg_id, 256), seconds = automationInteger(row.ts, 0, 253402300799);
  if (row.from_me !== 0 && row.from_me !== 1 || row.revoked !== 0 && row.revoked !== 1 || row.deleted_for_me !== 0 && row.deleted_for_me !== 1 || !["message", "reaction", "edit", "delete"].includes(String(row.kind)))
    throw new Error("Invalid WhatsApp message projection");
  nullableText(row.sender_jid, 128);
  nullableText(row.reaction_emoji, 64);
  const deleted = row.kind === "delete" || row.revoked === 1 || row.deleted_for_me === 1;
  const text = deleted ? null : row.kind === "reaction" ? nullableText(row.reaction_emoji, 64) : nullableText(row.text || row.display_text, 65536);
  const media = nullableText(row.media_type, 128);
  return { id, coordinate: selected, direction: row.from_me === 1 ? "outgoing" : "incoming", occurredAt: new Date(seconds * 1000).toISOString(), text, kind: deleted ? "delete" : row.kind, relatedMessageId: nullableText(row.reaction_to_id || row.quoted_msg_id, 256), attachments: media && !deleted ? [{ name: nullableText(row.filename, 255), mimeType: nullableText(row.mime_type, 128), sizeBytes: row.file_length === null ? null : automationInteger(row.file_length, 0, Number.MAX_SAFE_INTEGER) }] : [] };
}
function status(current, snapshot) {
  const supported = new Set(["text", "attachment", "reaction", "sticker", "link", "poll"]);
  const actions = Object.fromEntries(AUTOMATION_ACTION_KINDS.map((kind) => [kind, { available: snapshot.connected && snapshot.ledgerReady && supported.has(kind), reason: !supported.has(kind) ? "The pinned WhatsApp transport has no operation for this experience." : !snapshot.connected ? "Start the selected WhatsApp linked-device connection explicitly through Ghostget." : !snapshot.ledgerReady ? "The durable message feed has not been initialized." : null }]));
  return { identity: current, connected: snapshot.connected, events: { available: snapshot.connected && snapshot.ledgerReady, reason: snapshot.connected && snapshot.ledgerReady ? null : "The owned WhatsApp connection and its durable feed must be ready." }, actions };
}
function encodeCursor(value) {
  return Buffer.from(canonicalJson(value)).toString("base64url");
}
function parseCursor(value, current, coordinates) {
  const initial = { version: 1, identity: sha(current), scope: sha(coordinates), sequence: 0, anchor: null };
  if (value === null)
    return initial;
  automationText(value, 16384);
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value)
    throw new Error("Noncanonical WhatsApp cursor");
  const row = automationRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)), ["version", "identity", "scope", "sequence", "anchor"]);
  if (row.version !== 1 || row.identity !== initial.identity || row.scope !== initial.scope)
    throw new Error("WhatsApp cursor identity or scope changed");
  return { ...initial, sequence: automationInteger(row.sequence, 0, Number.MAX_SAFE_INTEGER), anchor: row.anchor === null ? null : automationDigest(row.anchor) };
}
function ledgerBounds(database) {
  const row = automationRecord(database.query("SELECT COALESCE(MIN(sequence),0) AS first,COALESCE(MAX(sequence),0) AS last FROM ghostget_automation_events").get(), ["first", "last"]);
  return { first: automationInteger(row.first, 0, Number.MAX_SAFE_INTEGER), last: automationInteger(row.last, 0, Number.MAX_SAFE_INTEGER) };
}
function ledgerAnchor(database, sequence) {
  if (sequence === 0)
    return null;
  const row = database.query(`SELECT sequence,kind,${messageColumns} FROM ghostget_automation_events WHERE sequence=?`).get(sequence);
  return row === null ? null : sha(row);
}
function createWhatsAppAutomationProvider(options) {
  const runtime = options.runtime ?? createWhatsAppAutomationRuntime(options.execution);
  const lifetime = new AbortController;
  let closed = false, inFlight;
  async function run(operation, signal, work) {
    if (closed || inFlight)
      throw new Error("WhatsApp automation provider is closed or busy");
    const activeSignal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
    const pending = (async () => {
      activeSignal.throwIfAborted();
      const before = await options.authorize(operation, activeSignal);
      const result = await work(before, activeSignal);
      const after = await options.authorize(operation, activeSignal);
      if (sha(before) !== sha(after))
        throw new Error("WhatsApp account or permission changed during the operation");
      return result;
    })();
    inFlight = pending;
    try {
      return await pending;
    } finally {
      if (inFlight === pending)
        inFlight = undefined;
    }
  }
  return {
    provider: "whatsapp",
    start(signal) {
      return run("start", signal, (admission, signal2) => runtime.start(admission.auth, async () => {
        if (sha(await options.authorize("start", signal2)) !== sha(admission))
          throw new Error("WhatsApp synchronization permission changed before launch");
      }, signal2));
    },
    inspect(signal) {
      return run("inspect", signal, (admission, signal2) => runtime.read(admission.auth, (_database, snapshot) => status(identity(admission, snapshot), snapshot), signal2));
    },
    conversations(input, signal) {
      const limit = automationInteger(input.limit, 1, 200);
      return run("conversations", signal, (admission, signal2) => runtime.read(admission.auth, (database, snapshot) => {
        const rows = database.query("SELECT jid,kind,name FROM chats WHERE kind='dm' AND jid<>? ORDER BY last_message_ts DESC,jid ASC LIMIT ?").all(snapshot.account, limit + 1);
        return { identity: identity(admission, snapshot), conversations: rows.slice(0, limit).map(conversation), complete: rows.length <= limit };
      }, signal2));
    },
    resolve(value, signal) {
      const selected = coordinate(value);
      return run("resolve", signal, (admission, signal2) => runtime.read(admission.auth, (database, snapshot) => ({ identity: identity(admission, snapshot), conversation: exact(database, selected, snapshot.account) }), signal2));
    },
    history(input, signal) {
      const selected = coordinate(input.coordinate), limit = automationInteger(input.limit, 1, 200);
      return run("history", signal, (admission, signal2) => runtime.read(admission.auth, (database, snapshot) => {
        if (!snapshot.ledgerReady)
          throw new Error("Start the owned WhatsApp connection before enrollment");
        exact(database, selected, snapshot.account);
        const current = identity(admission, snapshot), bounds = ledgerBounds(database);
        const rows = database.query(`SELECT CASE WHEN revoked=1 OR deleted_for_me=1 THEN 'delete' WHEN reaction_to_id IS NOT NULL AND reaction_to_id<>'' THEN 'reaction' ELSE 'message' END AS kind,${messageColumns} FROM messages WHERE chat_jid=? ORDER BY ts DESC,rowid DESC LIMIT ?`).all(selected.conversationJid, limit).reverse();
        return { identity: current, messages: rows.map(message), nextCursor: encodeCursor({ version: 1, identity: sha(current), scope: sha([selected]), sequence: bounds.last, anchor: ledgerAnchor(database, bounds.last) }), caughtUp: true, gap: false };
      }, signal2));
    },
    events(input, signal) {
      const coordinates = automationArray(input.coordinates, 50).map(coordinate).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))), limit = automationInteger(input.limit, 1, 500);
      if (!coordinates.length || new Set(coordinates.map(sha)).size !== coordinates.length)
        throw new Error("Distinct WhatsApp event scopes are required");
      return run("events", signal, (admission, signal2) => runtime.read(admission.auth, (database, snapshot) => {
        if (!snapshot.ledgerReady || !snapshot.connected)
          throw new Error("The owned WhatsApp message feed is unavailable");
        for (const selected of coordinates)
          exact(database, selected, snapshot.account);
        const current = identity(admission, snapshot), next = parseCursor(input.cursor, current, coordinates), bounds = ledgerBounds(database);
        if (next.sequence > bounds.last || next.sequence < bounds.first - 1 || next.sequence > 0 && ledgerAnchor(database, next.sequence) !== next.anchor)
          return { identity: current, messages: [], nextCursor: encodeCursor(next), caughtUp: false, gap: true };
        const placeholders = coordinates.map(() => "?").join(",");
        const rows = database.query(`SELECT sequence,kind,${messageColumns} FROM ghostget_automation_events WHERE sequence>? AND chat_jid IN (${placeholders}) ORDER BY sequence ASC LIMIT ?`).all(next.sequence, ...coordinates.map((value) => value.conversationJid), limit + 1);
        const page = rows.slice(0, limit).map((value) => {
          const row = automationRecord(value, ["sequence", "kind", ...messageColumns.split(",")]);
          const sequence = automationInteger(row.sequence, next.sequence + 1, bounds.last);
          next.sequence = sequence;
          const { sequence: _sequence, ...projection } = row;
          return message(projection);
        });
        const caughtUp = rows.length <= limit;
        if (caughtUp)
          next.sequence = bounds.last;
        next.anchor = ledgerAnchor(database, next.sequence);
        return { identity: current, messages: page, nextCursor: encodeCursor(next), caughtUp, gap: false };
      }, signal2));
    },
    async send(input, signal) {
      const selected = coordinate(input.coordinate), expected = parseAutomationIdentity(input.identity), action = parseAutomationAction(input.action), intentId = automationText(input.intentId, 256);
      let dispatched = false, asset;
      try {
        return await run(action.kind, signal, async (admission, signal2) => {
          try {
            let request = { protocol: WHATSAPP_AUTOMATION_PROTOCOL, kind: "text", requestId: sha({ intentId, expected, selected, action }), generation: "", account: "", to: selected.conversationJid, message: "", file: "", filename: "", mime: "", id: "", reaction: "", question: "", options: [], selectable: 0 };
            if (action.kind === "text")
              request = { ...request, message: action.text };
            else if (action.kind === "link")
              request = { ...request, message: action.url };
            else if (action.kind === "reaction")
              request = { ...request, kind: "react", id: action.messageId, reaction: action.remove ? "" : action.emoji };
            else if (action.kind === "poll")
              request = { ...request, kind: "poll", question: action.question, options: action.options, selectable: action.maximumSelections ?? 1 };
            else if (action.kind === "attachment" || action.kind === "sticker") {
              if (action.kind === "sticker" && action.messageId !== null)
                throw new Error("WhatsApp stickers are standalone messages in this contract");
              const resolved = await options.resolveAsset(action.assetId, signal2);
              asset = await runtime.stage(resolved.bytes, resolved.sha256);
              request = { ...request, kind: action.kind === "sticker" ? "sticker" : "file", file: asset.path, filename: action.kind === "attachment" ? action.name : "", mime: action.kind === "attachment" ? action.mimeType : "" };
            } else
              throw new Error("The pinned WhatsApp transport does not support this action");
            if (sha(await options.authorize(action.kind, signal2)) !== sha(admission))
              throw new Error("WhatsApp permission changed before dispatch");
            request = await runtime.read(admission.auth, (database, snapshot) => {
              const current = identity(admission, snapshot);
              if (sha(current) !== sha(expected) || !status(current, snapshot).actions[action.kind].available || !snapshot.generation)
                throw new Error("WhatsApp source identity or capability changed before dispatch");
              exact(database, selected, snapshot.account);
              if (action.kind === "reaction" && !database.query("SELECT msg_id FROM messages WHERE chat_jid=? AND msg_id=? AND revoked=0 AND deleted_for_me=0").get(selected.conversationJid, action.messageId))
                throw new Error("WhatsApp reaction target is unavailable");
              return { ...request, account: snapshot.account, generation: snapshot.generation };
            }, signal2);
            signal2?.throwIfAborted();
            dispatched = true;
            const result = await runtime.request(request, signal2, async () => {
              if (sha(await options.authorize(action.kind, signal2)) !== sha(admission))
                throw new Error("WhatsApp permission changed before writing the action");
            });
            if (result.state === "accepted")
              return { state: "accepted", messageId: result.messageId || null, providerReceiptId: result.requestId, delivery: "unknown" };
            return result.state === "not-started" ? { state: "not-started", reason: "The exact WhatsApp request was not admitted." } : { state: "indeterminate", reason: "The WhatsApp outcome is uncertain and cannot be retried." };
          } finally {
            await asset?.close();
          }
        });
      } catch {
        return { state: dispatched ? "indeterminate" : "not-started", reason: dispatched ? "The WhatsApp receipt or cleanup could not be verified; do not retry." : "The selected WhatsApp account, permission, target, or action was unavailable." };
      }
    },
    async close() {
      closed = true;
      lifetime.abort();
      await inFlight?.catch(() => {
        return;
      });
      await runtime.close();
    }
  };
}
export {
  createWhatsAppAutomationProvider
};
