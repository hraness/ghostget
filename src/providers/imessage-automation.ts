import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { GhostgetAuth } from "../auth";
import { canonicalJson } from "../canonical-json";
import type { LocalCliExecutionOptions } from "../local-cli-execution";
import { OperationDeadline } from "../operation-deadline";
import type { AutomationAction, AutomationConversation, AutomationCoordinate, AutomationIdentity, AutomationMessage, AutomationProviderStatus, AutomationProviderSendResult, MessagingAutomationProvider } from "../messaging-automation-types";
import { AUTOMATION_ACTION_KINDS, automationArray, automationDigest, automationInteger, automationRecord, automationText, parseAutomationAction, parseAutomationCoordinate, parseAutomationIdentity } from "../messaging-automation-validation";
import { IMSG_NO_FETCH_RICH_CARDS_AVAILABLE, type ImsgChatCoordinate, type ImsgRpcRequest } from "./imessage-direct";
import { imsgAutomationProjection as project, withImsgAutomationRuntime, type ImsgChatProjection, type ImsgDirectRuntimeDependencies } from "./imessage-direct-runtime";

export type ImsgAutomationOperation = "inspect" | "conversations" | "resolve" | "history" | "events" | AutomationAction["kind"];
/** The Ghostget host supplies existing permission admission, auth lifetime and
 * exact plugin closure. A contact grant only narrows this authority. */
export type ImsgAutomationAdmission = Readonly<{ auth: GhostgetAuth; accountIdentity: string; implementationIdentity: string }>;
export type ImsgAutomationOptions = Readonly<{
  authorize(operation: ImsgAutomationOperation, signal?: AbortSignal): Promise<ImsgAutomationAdmission>;
  execution: Pick<LocalCliExecutionOptions, "registerCleanupBarrier" | "environment">;
  resolveAsset(assetId: string, signal?: AbortSignal): Promise<Readonly<{ bytes: Uint8Array; sha256: string }>>;
  dependencies?: ImsgDirectRuntimeDependencies;
}>;
type Session = Parameters<Parameters<typeof withImsgAutomationRuntime>[2]>[0];
const sha = (value: unknown): string => createHash("sha256").update(canonicalJson(value)).digest("hex");
function request(method: string, params: Readonly<Record<string, unknown>> = {}, id = "operation"): ImsgRpcRequest { return { jsonrpc: "2.0", id, method, params }; }
function coordinate(value: unknown): Extract<AutomationCoordinate, { provider: "imessage" }> {
  const result = parseAutomationCoordinate(value);
  if (result.provider !== "imessage") throw new Error("iMessage cannot operate another messaging network");
  return result;
}
function target(value: AutomationCoordinate): ImsgChatCoordinate {
  const item = coordinate(value); return { chatGuid: item.chatGuid, service: "iMessage", observedChatRowId: item.observedChatRowId };
}
function conversation(chat: ImsgChatProjection): AutomationConversation {
  return { coordinate: coordinate({ provider: "imessage", chatGuid: chat.guid, service: "iMessage", observedChatRowId: chat.id }), title: chat.title, kind: chat.kind, participants: chat.participants };
}
async function exactConversation(session: Session, value: AutomationCoordinate): Promise<AutomationConversation> {
  const selected = target(value);
  const output = await session.run([request("chats.get", { chat_id: selected.observedChatRowId })]);
  return conversation(project.exactChat(output.get("operation"), selected));
}
function methods(session: Session): ReadonlySet<string> {
  const status = session.status as Record<string, unknown>; // already parsed by the pinned runtime
  return new Set(automationArray(status.methods, 256).map(value => automationText(value, 128)));
}
function providerStatus(session: Session, identity: AutomationIdentity): AutomationProviderStatus {
  const available = methods(session);
  const rpc: Partial<Record<AutomationAction["kind"], string>> = { text: "send", attachment: "send", reaction: "tapback", sticker: "send.sticker", link: "send.rich", poll: "poll.send" };
  const actions = Object.fromEntries(AUTOMATION_ACTION_KINDS.map(kind => {
    if (kind === "link" && !IMSG_NO_FETCH_RICH_CARDS_AVAILABLE) return [kind, { available: false, reason: "The installed iMessage artifact predates no-fetch rich cards. The replacement native build has not been admitted." }];
    const method = rpc[kind]; const ready = method !== undefined && available.has(method);
    return [kind, { available: ready, reason: ready ? null : !method ? "The pinned iMessage helper has no reviewed operation for this action." : method === "send" ? "The native iMessage send operation is unavailable. Check Messages permissions in Ghostget." : `The private Messages bridge does not currently advertise ${method}. Its injection design requires owner-configured system support, including disabled SIP. Ghostget installation never changes SIP.` }];
  })) as AutomationProviderStatus["actions"];
  return { identity, connected: true, events: { available: available.has("messages.after"), reason: available.has("messages.after") ? null : "The pinned database cursor operation is unavailable." }, actions };
}
function message(value: unknown, selected: AutomationCoordinate): AutomationMessage {
  const projected = project.parseMessage(value, "automation message", target(selected));
  const raw = value as Record<string, unknown>;
  if (raw.is_reaction !== undefined && typeof raw.is_reaction !== "boolean") throw new Error("Invalid reaction marker");
  const related = raw.is_reaction === true ? automationText(raw.reacted_to_guid, 256) : projected.replyToGuid;
  if (Buffer.byteLength(projected.text) > 65_536) throw new Error("Automation message exceeds its text bound");
  return { id: automationText(projected.guid, 256), coordinate: selected, direction: projected.isFromMe ? "outgoing" : "incoming", occurredAt: projected.createdAt, text: projected.text, kind: raw.is_reaction === true ? "reaction" : "message", relatedMessageId: related, attachments: [] };
}
async function historyMessages(session: Session, selected: AutomationCoordinate, limit: number): Promise<readonly AutomationMessage[]> {
  await exactConversation(session, selected);
  const response = await session.run([request("messages.history", { chat_id: target(selected).observedChatRowId, limit, attachments: false })]);
  const row = automationRecord(response.get("operation"), ["messages"]);
  const messages = automationArray(row.messages, limit).map(raw => message(raw, selected));
  if (new Set(messages.map(item => item.id)).size !== messages.length) throw new Error("Repeated message identity");
  return messages;
}
type Cursor = { version: 1; identity: string; coordinates: string; rows: number[]; anchors: ({ row: number; id: string } | null)[] };
function cursor(value: string | null, identity: AutomationIdentity, coordinates: readonly AutomationCoordinate[]): Cursor {
  if (value === null) return { version: 1, identity: sha(identity), coordinates: sha(coordinates), rows: coordinates.map(() => 0), anchors: coordinates.map(() => null) };
  automationText(value, 16_384);
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("Noncanonical iMessage cursor");
  const parsed = automationRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)), ["version", "identity", "coordinates", "rows", "anchors"]);
  if (parsed.version !== 1 || parsed.identity !== sha(identity) || parsed.coordinates !== sha(coordinates)) throw new Error("iMessage cursor generation or scope changed");
  const rows = automationArray(parsed.rows, 50).map(value => automationInteger(value, 0, Number.MAX_SAFE_INTEGER));
  if (rows.length !== coordinates.length) throw new Error("iMessage cursor scope changed");
  const anchors = automationArray(parsed.anchors, 50).map((value, index) => {
    if (value === null) return null;
    const anchor = automationRecord(value, ["row", "id"]);
    return { row: automationInteger(anchor.row, 1, rows[index] ?? 0), id: automationText(anchor.id, 256) };
  });
  if (anchors.length !== rows.length) throw new Error("iMessage cursor anchor scope changed");
  return { version: 1, identity: parsed.identity as string, coordinates: parsed.coordinates as string, rows, anchors };
}

/** Concrete pinned imsg implementation. It never starts the private Messages
 * bridge, changes OS permissions, or falls back to SMS or another transport. */
export function createImsgAutomationProvider(options: ImsgAutomationOptions): MessagingAutomationProvider {
  let closed = false; let inFlight: Promise<unknown> | undefined;
  async function run<T>(operation: ImsgAutomationOperation, signal: AbortSignal | undefined, work: (session: Session, identity: AutomationIdentity, reauthorize: () => Promise<void>) => Promise<T>): Promise<T> {
    if (closed || inFlight) throw new Error("iMessage provider is closed or busy");
    const pending = (async () => {
      signal?.throwIfAborted();
      const admission = await options.authorize(operation, signal);
      if (admission.auth.kind !== "linked-device-store" || admission.auth.provider !== "imessage") throw new Error("iMessage account required");
      const deadline = new OperationDeadline(30_000, signal ? { signal } : {});
      try {
        return await withImsgAutomationRuntime(admission.auth, { ...options.execution, operationDeadline: deadline, ...(options.dependencies ? { dependencies: options.dependencies } : {}) }, async session => {
          const identity = parseAutomationIdentity({ provider: "imessage", authId: admission.auth.id, accountIdentity: admission.accountIdentity, accountSubject: session.subject, implementationIdentity: admission.implementationIdentity, sourceGeneration: session.sourceGeneration });
          const reauthorize = async () => { signal?.throwIfAborted(); const after = await options.authorize(operation, signal); if (sha(after) !== sha(admission)) throw new Error("iMessage account or permission changed during the operation"); };
          const result = await work(session, identity, reauthorize);
          await reauthorize();
          return result;
        });
      } finally { deadline.dispose(); }
    })();
    inFlight = pending;
    try { return await pending; } finally { if (inFlight === pending) inFlight = undefined; }
  }
  return {
    provider: "imessage",
    inspect(signal) { return run("inspect", signal, async (session, identity) => providerStatus(session, identity)); },
    conversations(input, signal) {
      const limit = automationInteger(input.limit, 1, 200);
      return run("conversations", signal, async (session, identity) => {
        const result = await session.run([request("chats.list", { limit })]);
        return { identity, conversations: project.parseChats(result.get("operation")).map(conversation), complete: false };
      });
    },
    resolve(value, signal) { const selected = coordinate(value); return run("resolve", signal, async (session, identity) => ({ identity, conversation: await exactConversation(session, selected) })); },
    history(input, signal) {
      const selected = coordinate(input.coordinate), limit = automationInteger(input.limit, 1, 200);
      return run("history", signal, async (session, identity) => {
        await exactConversation(session, selected);
        const response = await session.run([request("messages.history", { chat_id: selected.observedChatRowId, limit, attachments: false })]);
        const raw = automationArray(automationRecord(response.get("operation"), ["messages"]).messages, limit);
        const messages = raw.map(value => message(value, selected));
        if (new Set(messages.map(item => item.id)).size !== messages.length) throw new Error("Repeated history identity");
        const next = cursor(null, identity, [selected]);
        for (const [index, value] of raw.entries()) {
          const row = automationInteger((value as Record<string, unknown>).id, 1, Number.MAX_SAFE_INTEGER);
          if (row > next.rows[0]!) { next.rows[0] = row; next.anchors[0] = { row, id: messages[index]!.id }; }
        }
        // Start after the newest verified history row, then silently drain any
        // remaining rows to establish the initial live boundary.
        return { identity, messages, nextCursor: Buffer.from(canonicalJson(next)).toString("base64url"), caughtUp: false, gap: false };
      });
    },
    events(input, signal) {
      const coordinates = automationArray(input.coordinates, 50).map(coordinate).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
      if (coordinates.length === 0 || new Set(coordinates.map(sha)).size !== coordinates.length) throw new Error("Distinct iMessage event scopes required");
      const limit = automationInteger(input.limit, 1, 500);
      return run("events", signal, async (session, identity) => {
        if (!methods(session).has("messages.after")) throw new Error("Database event cursor is unavailable");
        const next = cursor(input.cursor, identity, coordinates);
        const messages: AutomationMessage[] = []; let caughtUp = true;
        for (const [index, selected] of coordinates.entries()) {
          if (messages.length === limit) { caughtUp = false; break; }
          await exactConversation(session, selected);
          const anchor = next.anchors[index];
          if (anchor) {
            const proof = await session.run([request("messages.after", { chat_id: selected.observedChatRowId, since_rowid: anchor.row - 1, limit: 1, attachments: false, convert_attachments: false, include_reactions: true })]);
            const proofPage = automationRecord(proof.get("operation"), ["messages", "next_rowid", "has_more"]);
            const first = automationArray(proofPage.messages, 1)[0];
            if (!first || (first as Record<string, unknown>).id !== anchor.row || message(first, selected).id !== anchor.id) throw new Error("iMessage cursor anchor changed; re-enrollment is required");
          }
          const remaining = limit - messages.length;
          const result = await session.run([request("messages.after", { chat_id: selected.observedChatRowId, since_rowid: next.rows[index], limit: remaining, attachments: false, convert_attachments: false, include_reactions: true })]);
          const page = automationRecord(result.get("operation"), ["messages", "next_rowid", "has_more"]);
          const nextRow = automationInteger(page.next_rowid, next.rows[index]!, Number.MAX_SAFE_INTEGER);
          if (typeof page.has_more !== "boolean" || page.has_more && nextRow === next.rows[index]) throw new Error("Nonprogressing iMessage cursor");
          const rawMessages = automationArray(page.messages, remaining);
          let previous = next.rows[index]!;
          for (const raw of rawMessages) {
            const parsed = message(raw, selected);
            const rowId = automationInteger((raw as Record<string, unknown>).id, previous + 1, nextRow);
            previous = rowId; messages.push(parsed); next.anchors[index] = { row: rowId, id: parsed.id };
          }
          next.rows[index] = nextRow;
          if (page.has_more) caughtUp = false;
        }
        if (new Set(messages.map(item => item.id)).size !== messages.length) throw new Error("Repeated event identity");
        return { identity, messages, nextCursor: Buffer.from(canonicalJson(next)).toString("base64url"), caughtUp, gap: false };
      });
    },
    async send(input, signal): Promise<AutomationProviderSendResult> {
      const selected = coordinate(input.coordinate), action = parseAutomationAction(input.action), expected = parseAutomationIdentity(input.identity);
      let dispatched = false;
      try {
        return await run(action.kind, signal, async (session, identity, reauthorize) => {
          if (sha(identity) !== sha(expected)) throw new Error("iMessage account or source changed before dispatch");
          const live = await exactConversation(session, selected);
          if (live.kind !== "single" || live.participants.length !== 1) throw new Error("Only direct participant-bound automation is supported");
          if (!providerStatus(session, identity).actions[action.kind].available) throw new Error("Requested action is unavailable");
          let method: string; const params: Record<string, unknown> = { chat_guid: selected.chatGuid };
          if (action.kind === "text") { method = "send"; Object.assign(params, { text: action.text, service: "imessage", transport: "applescript", allow_sms_fallback: false }); }
          else if (action.kind === "link") { method = "send.rich"; params.url = action.url; params.fetch_metadata = false; }
          else if (action.kind === "poll") { if (action.maximumSelections !== null) throw new Error("Native iMessage polls use provider selection behavior"); method = "poll.send"; Object.assign(params, { question: action.question, options: action.options, suppress_comment: true }); }
          else if (action.kind === "reaction" || action.kind === "sticker" || action.kind === "attachment") {
            if ((action.kind === "reaction" || action.kind === "sticker") && action.messageId !== null) {
              const current = await historyMessages(session, selected, 200);
              if (!current.some(message => message.id === action.messageId && message.kind === "message")) throw new Error("Reaction or sticker target must belong to current conversation history");
            }
            if (action.kind === "reaction") {
              if (!["❤️", "👍", "👎", "😂", "‼️", "❓"].includes(action.emoji)) throw new Error("This iMessage contract admits the six standard reactions");
              method = "tapback"; Object.assign(params, { message_guid: action.messageId, emoji: action.emoji, remove: action.remove });
            } else {
              const asset = await options.resolveAsset(action.assetId, signal);
              const maximum = action.kind === "sticker" ? 500 * 1024 : 16 * 1024 * 1024;
              if (!(asset.bytes instanceof Uint8Array) || asset.bytes.byteLength < 1 || asset.bytes.byteLength > maximum) throw new Error("Attachment byte admission failed");
              const bytes = Buffer.from(asset.bytes);
              if (createHash("sha256").update(bytes).digest("hex") !== automationDigest(asset.sha256)) throw new Error("Attachment byte admission failed");
              const path = join(session.operationRoot, action.kind === "attachment" ? action.name : "sticker");
              const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
              try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
              params.file = path;
              if (action.kind === "sticker") { method = "send.sticker"; if (action.messageId !== null) params.attach_to = action.messageId; }
              else { method = "send"; Object.assign(params, { service: "imessage", transport: "applescript", allow_sms_fallback: false }); }
            }
          } else throw new Error("No reviewed iMessage implementation exists for this experience");
          signal?.throwIfAborted();
          const response = await session.run([request(method, params)], async () => {
            await reauthorize();
            if (sha(await exactConversation(session, selected)) !== sha(live)) throw new Error("iMessage participants changed before dispatch");
            await reauthorize();
            dispatched = true;
          });
          const raw = response.get("operation");
          if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid iMessage acceptance");
          const result = raw as Record<string, unknown>;
          if (action.kind === "text" || action.kind === "attachment") {
            const accepted = project.parseSendAccepted(result, target(selected));
            return { state: "accepted", messageId: automationText(accepted.messageGuid, 256), providerReceiptId: null, delivery: "unknown" };
          }
          const allowed = action.kind === "reaction" ? ["ok", "reaction"] : action.kind === "poll" ? ["ok", "event", "guid", "message_id", "poll"] : action.kind === "link" ? ["ok", "id", "guid", "message_id", "messageGuid", "chat_guid", "chatGuid", "queued", "service", "richLinkImageUsed"] : ["ok", "transfer_guid"];
          if (result.ok !== true || Object.keys(result).some(key => !allowed.includes(key)) || result.chat_guid !== undefined && result.chat_guid !== selected.chatGuid || result.transport !== undefined && result.transport !== "applescript") throw new Error("iMessage acceptance changed");
          const ids = [result.guid, result.message_id, result.messageGuid].filter(value => value !== undefined).map(value => automationText(value, 256));
          const messageId = ids[0] ?? null;
          if (ids.some(value => value !== messageId)) throw new Error("Ambiguous iMessage result identity");
          if (result.chatGuid !== undefined && result.chatGuid !== selected.chatGuid || result.queued !== undefined && typeof result.queued !== "boolean") throw new Error("iMessage rich-link receipt changed");
          if (action.kind === "link" && (result.service !== undefined && result.service !== "iMessage" || result.richLinkImageUsed !== undefined && result.richLinkImageUsed !== false)) throw new Error("iMessage rich-link transport or metadata mode changed");
          if (result.id !== undefined) automationInteger(result.id, 1, Number.MAX_SAFE_INTEGER);
          if (action.kind === "link" && messageId === null) throw new Error("Rich-link acceptance has no reconciled message identity");
          const providerReceiptId = result.transfer_guid === undefined ? null : automationText(result.transfer_guid, 256);
          if (action.kind === "reaction") { automationRecord(result, ["ok", "reaction"]); automationInteger(result.reaction, action.remove ? 3000 : 2000, action.remove ? 3005 : 2005); }
          if (action.kind === "sticker") { automationRecord(result, ["ok", "transfer_guid"]); if (providerReceiptId === null) throw new Error("Sticker transfer receipt is missing"); }
          if (action.kind === "poll" && (result.event !== "imessage.poll.created" || messageId === null)) throw new Error("Poll creation receipt is missing");
          return { state: "accepted", messageId, providerReceiptId, delivery: "unknown" };
        });
      } catch { return { state: dispatched ? "indeterminate" : "not-started", reason: dispatched ? "iMessage dispatch or process cleanup could not be reconciled. Do not retry." : "iMessage admission failed before any send." }; }
    },
    async close() { closed = true; await inFlight; },
  };
}
