import { expect, test } from "bun:test";
import { imsgAutomationProjection as project } from "./imessage-direct-runtime";
import type { ImsgChatCoordinate } from "./imessage-direct";

const target: ImsgChatCoordinate = { chatGuid: "iMessage;-;fixture@example.test", observedChatRowId: 7, service: "iMessage" };
const attachment = () => ({ filename: "/synthetic/private/source.jpg", transfer_name: "photo.jpg", uti: "public.jpeg",
  mime_type: "image/jpeg", total_bytes: 1234, is_sticker: false, original_path: "/synthetic/private/resolved.jpg", missing: false });
const message = (attachments: unknown) => ({ id: 10, guid: "fixture-message", chat_id: 7, sender: "fixture@example.test",
  is_from_me: false, text: "", created_at: "2026-09-11T12:00:00.000Z", attachments, reactions: [],
  chat_identifier: "fixture@example.test", chat_guid: target.chatGuid, chat_name: "Fixture", participants: ["fixture@example.test"], is_group: false });
const parse = (attachments: unknown) => project.parseMessage(message(attachments), "fixture message", target, { attachmentMetadata: true });

test("attachment metadata requires explicit opt-in and preserves exact conversation binding", () => {
  expect(project.parseMessage(message([]), "fixture", target).attachments).toEqual([]);
  for (const options of [undefined, {}, { attachmentMetadata: false }]) {
    expect(() => project.parseMessage(message([attachment()]), "fixture", target, options)).toThrow("attachment reads are disabled");
  }
  expect(() => project.parseMessages({ messages: [message([attachment()])] }, target, 1)).toThrow("attachment reads are disabled");
  for (const changed of [{ chat_id: 8 }, { chat_guid: "iMessage;-;other@example.test" }]) {
    expect(() => project.parseMessage({ ...message([attachment()]), ...changed }, "fixture", target, { attachmentMetadata: true })).toThrow("exact requested chat");
  }
});

test("metadata projects only a bounded name, MIME type and stored size, without native paths", () => {
  const native = attachment(), result = parse([native]);
  expect(result.attachments).toEqual([{ name: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1234 }]);
  expect(Object.keys(result.attachments[0]!).sort()).toEqual(["mimeType", "name", "sizeBytes"]);
  expect(JSON.stringify(result)).not.toContain("/synthetic/private");
  expect(Object.isFrozen(result.attachments)).toBe(true); expect(Object.isFrozen(result.attachments[0])).toBe(true);
  native.transfer_name = "changed.jpg"; expect(result.attachments[0]?.name).toBe("photo.jpg");
  expect(parse([{ ...attachment(), transfer_name: "", mime_type: "", total_bytes: 0, missing: true }]).attachments)
    .toEqual([{ name: null, mimeType: null, sizeBytes: 0 }]);
  expect(parse([{ ...attachment(), transfer_name: "é".repeat(256), total_bytes: 1024 * 1024 * 1024 }]).attachments[0]?.sizeBytes)
    .toBe(1024 * 1024 * 1024);
});

test("metadata rejects conversion fields, unsupported fields and incomplete native schemas", () => {
  for (const changed of [{ converted_path: "/synthetic/private/converted.png" }, { converted_mime_type: "image/png" },
    { converted_path: null }, { file_bytes: "private" }, { provider_key: "secret" }]) {
    expect(() => parse([{ ...attachment(), ...changed }])).toThrow("unsupported fields");
  }
  for (const key of Object.keys(attachment())) {
    const incomplete: Record<string, unknown> = attachment(); delete incomplete[key];
    expect(() => parse([incomplete])).toThrow("unsupported fields");
  }
});

test("metadata rejects path-shaped names and MIME values, unsafe text, flags and size bounds", () => {
  for (const patch of [
    { transfer_name: "/private/name" }, { transfer_name: "nested/name" }, { transfer_name: "C:\\private\\name" }, { transfer_name: ".." },
    { transfer_name: "é".repeat(257) }, { transfer_name: "bad\nname" }, { transfer_name: "\ud800" }, { transfer_name: null },
    { mime_type: "/private/type" }, { mime_type: "image/png/extra" }, { mime_type: "image/png\n" }, { mime_type: "x/" + "a".repeat(255) },
    { total_bytes: -1 }, { total_bytes: 1.5 }, { total_bytes: Number.NaN }, { total_bytes: 1024 * 1024 * 1024 + 1 }, { total_bytes: "1234" },
    { is_sticker: 1 }, { missing: null }, { original_path: 42 }, { filename: "a".repeat(8193) }, { uti: "a".repeat(513) },
  ]) expect(() => parse([{ ...attachment(), ...patch }])).toThrow();
});

test("metadata is capped, rejects sparse/proxy/accessor values and never invokes their getters", () => {
  expect(parse(Array.from({ length: 20 }, attachment)).attachments).toHaveLength(20);
  expect(() => parse(Array.from({ length: 21 }, attachment))).toThrow();
  expect(() => parse(new Array(1))).toThrow();
  expect(() => parse(new Proxy([], {}))).toThrow();
  expect(() => parse([new Proxy(attachment(), {})])).toThrow();
  let reads = 0;
  const row = Object.defineProperty(attachment(), "transfer_name", { enumerable: true, get() { reads++; return "secret"; } });
  expect(() => parse([row])).toThrow();
  const items = Object.defineProperty([attachment()], "0", { enumerable: true, get() { reads++; return attachment(); } });
  expect(() => parse(items)).toThrow();
  expect(reads).toBe(0);
});
