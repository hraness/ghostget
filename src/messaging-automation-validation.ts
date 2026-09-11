import { types } from "node:util";
import type { AutomationAction, AutomationActionKind, AutomationCoordinate, AutomationIdentity, AutomationMessage } from "./messaging-automation-types";

export const AUTOMATION_ACTION_KINDS = Object.freeze(["text", "attachment", "reaction", "sticker", "link", "poll", "app-clip", "experience"] as const);
export function automationRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (types.isProxy(value) || typeof value !== "object" || value === null || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Messaging automation value must be a plain object.");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !Object.hasOwn(fields, key))
    || Reflect.ownKeys(fields).some(key => typeof key !== "string" || !keys.includes(key) || !fields[key]?.enumerable || !("value" in fields[key]!))) {
    throw new Error("Messaging automation value has unsupported fields.");
  }
  return value as Record<string, unknown>;
}
export function automationText(value: unknown, maximum = 256, empty = false): string {
  if (typeof value !== "string" || (!empty && value.length === 0) || Buffer.byteLength(value) > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    || Buffer.from(value, "utf8").toString("utf8") !== value) throw new Error("Messaging automation text is invalid or exceeds its bound.");
  return value;
}
export function automationId(value: unknown): string {
  const id = automationText(value, 256);
  if (!/^[A-Za-z0-9._:-]+$/u.test(id)) throw new Error("Messaging automation identifier is invalid.");
  return id;
}
export function automationDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("Messaging automation digest is invalid.");
  return value;
}
export function automationInteger(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error("Messaging automation integer is outside its bound.");
  return value;
}
export function automationArray(value: unknown, maximum: number): readonly unknown[] {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) throw new Error("Messaging automation list is invalid or exceeds its bound.");
  for (let i = 0; i < value.length; i++) {
    const field = Object.getOwnPropertyDescriptor(value, String(i));
    if (field === undefined || !field.enumerable || !("value" in field)) throw new Error("Messaging automation list must be dense data.");
  }
  return value;
}
export function automationDate(value: unknown): string {
  const text = automationText(value, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) throw new Error("Messaging automation time must be canonical UTC.");
  return text;
}
export function parseAutomationCoordinate(value: unknown): AutomationCoordinate {
  if (typeof value !== "object" || value === null || types.isProxy(value)) throw new Error("Messaging coordinate is invalid.");
  const provider = Object.getOwnPropertyDescriptor(value, "provider")?.value;
  if (provider === "imessage") {
    const r = automationRecord(value, ["provider", "chatGuid", "service", "observedChatRowId"]);
    const chatGuid = automationText(r.chatGuid, 1024);
    if (!chatGuid.startsWith("iMessage;") || r.service !== "iMessage") throw new Error("Only exact iMessage conversations are supported.");
    return Object.freeze({ provider, chatGuid, service: "iMessage", observedChatRowId: automationInteger(r.observedChatRowId, 1, Number.MAX_SAFE_INTEGER) });
  }
  const r = automationRecord(value, ["provider", "conversationJid"]);
  if (provider !== "whatsapp" || typeof r.conversationJid !== "string" || !/^(?:[1-9][0-9]{4,14}@s\.whatsapp\.net|[1-9][0-9]{4,19}@lid)$/u.test(r.conversationJid)) throw new Error("Only exact individual WhatsApp conversations are supported.");
  return Object.freeze({ provider, conversationJid: r.conversationJid });
}
export function parseAutomationIdentity(value: unknown): AutomationIdentity {
  const r = automationRecord(value, ["provider", "authId", "accountIdentity", "accountSubject", "implementationIdentity", "sourceGeneration"]);
  if (r.provider !== "imessage" && r.provider !== "whatsapp") throw new Error("Messaging provider is invalid.");
  return Object.freeze({ provider: r.provider, authId: automationId(r.authId), accountIdentity: automationDigest(r.accountIdentity), accountSubject: automationText(r.accountSubject, 512), implementationIdentity: automationDigest(r.implementationIdentity), sourceGeneration: automationText(r.sourceGeneration, 256) });
}
export function parseAutomationActionKind(value: unknown): AutomationActionKind {
  if (!AUTOMATION_ACTION_KINDS.includes(value as AutomationActionKind)) throw new Error("Messaging action is unsupported.");
  return value as AutomationActionKind;
}
function https(value: unknown): string {
  const url = automationText(value, 4096);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("Messaging links require credential-free HTTPS.");
  return url;
}
export function parseAutomationAction(value: unknown): AutomationAction {
  if (typeof value !== "object" || value === null || types.isProxy(value)) throw new Error("Messaging action is invalid.");
  const kind = parseAutomationActionKind(Object.getOwnPropertyDescriptor(value, "kind")?.value);
  if (kind === "text") { const r = automationRecord(value, ["kind", "text"]); return Object.freeze({ kind, text: automationText(r.text, 65536) }); }
  if (kind === "link" || kind === "app-clip") { const r = automationRecord(value, ["kind", "url"]); return Object.freeze({ kind, url: https(r.url) }); }
  if (kind === "attachment") {
    const r = automationRecord(value, ["kind", "assetId", "name", "mimeType"]);
    const name = automationText(r.name, 255); const mimeType = automationText(r.mimeType, 128);
    if (/[\\/\r\n]/u.test(name) || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(mimeType)) throw new Error("Messaging attachment metadata is invalid.");
    return Object.freeze({ kind, assetId: automationId(r.assetId), name, mimeType });
  }
  if (kind === "reaction") {
    const r = automationRecord(value, ["kind", "messageId", "emoji", "remove"]); const emoji = automationText(r.emoji, 64, true);
    if (typeof r.remove !== "boolean" || (!r.remove && (emoji.length === 0 || [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(emoji)].length !== 1))) throw new Error("Messaging reaction is invalid.");
    return Object.freeze({ kind, messageId: automationId(r.messageId), emoji, remove: r.remove });
  }
  if (kind === "sticker") { const r = automationRecord(value, ["kind", "assetId", "messageId"]); return Object.freeze({ kind, assetId: automationId(r.assetId), messageId: r.messageId === null ? null : automationId(r.messageId) }); }
  if (kind === "poll") {
    const r = automationRecord(value, ["kind", "question", "options", "maximumSelections"]);
    const options = automationArray(r.options, 12).map(option => automationText(option, 256));
    if (options.length < 2 || new Set(options).size !== options.length) throw new Error("Messaging poll needs distinct options.");
    return Object.freeze({ kind, question: automationText(r.question, 1024), options: Object.freeze(options), maximumSelections: r.maximumSelections === null ? null : automationInteger(r.maximumSelections, 1, options.length) });
  }
  const r = automationRecord(value, ["kind", "experienceId", "parameters"]);
  if (typeof r.parameters !== "object" || r.parameters === null || types.isProxy(r.parameters)) throw new Error("Messaging experience parameters are invalid.");
  const keys = Object.keys(r.parameters); if (keys.length > 16) throw new Error("Messaging experience parameters exceed their bound.");
  const parameters = automationRecord(r.parameters, keys);
  return Object.freeze({ kind, experienceId: automationId(r.experienceId), parameters: Object.freeze(Object.fromEntries(keys.map(key => [automationId(key), automationText(parameters[key], 4096, true)]))) });
}
export function parseAutomationMessage(value: unknown): AutomationMessage {
  const r = automationRecord(value, ["id", "coordinate", "direction", "occurredAt", "text", "kind", "relatedMessageId", "attachments"]);
  if (r.direction !== "incoming" && r.direction !== "outgoing" && r.direction !== "unknown") throw new Error("Messaging authorship is invalid.");
  if (r.kind !== "message" && r.kind !== "reaction" && r.kind !== "edit" && r.kind !== "delete") throw new Error("Messaging event kind is invalid.");
  const attachments = automationArray(r.attachments, 20).map(value => { const a = automationRecord(value, ["name", "mimeType", "sizeBytes"]); return Object.freeze({ name: a.name === null ? null : automationText(a.name, 512), mimeType: a.mimeType === null ? null : automationText(a.mimeType, 256), sizeBytes: a.sizeBytes === null ? null : automationInteger(a.sizeBytes, 0, 1024 * 1024 * 1024) }); });
  return Object.freeze({ id: automationId(r.id), coordinate: parseAutomationCoordinate(r.coordinate), direction: r.direction, occurredAt: automationDate(r.occurredAt), text: r.text === null ? null : automationText(r.text, 65536, true), kind: r.kind, relatedMessageId: r.relatedMessageId === null ? null : automationId(r.relatedMessageId), attachments: Object.freeze(attachments) });
}
