import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { types } from "node:util";

export const MICROSOFT_GRAPH_ORIGIN = "https://graph.microsoft.com";
export const MICROSOFT_GRAPH_MAX_BYTES = 4 * 1024 * 1024;
export const MICROSOFT_GRAPH_MAX_CURSOR = 16_384;
export const MICROSOFT_GRAPH_MAX_PAGES = 100;
export const MICROSOFT_GRAPH_CONTACT_FIELDS = "id,displayName,givenName,surname,emailAddresses,businessPhones,homePhones,mobilePhone,companyName,jobTitle";
export const MICROSOFT_GRAPH_EVENT_FIELDS = "id,iCalUId,type,seriesMasterId,start,end,isCancelled,isOrganizer,hideAttendees,organizer,attendees";
export type MicrosoftGraphOperation = "contacts.list" | "calendar.attendees.list";

export function graphFailure(label: string): never {
  // Labels are code-owned: never include response values, account IDs, or cursors.
  throw new Error(`Microsoft Graph contract mismatch: ${label}`);
}

export function graphRecord(value: unknown, keys: readonly string[], required = keys): Record<string, unknown> {
  if (value === null || typeof value !== "object" || types.isProxy(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return graphFailure("expected a plain data object");
  }
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== "string" || !keys.includes(key)
    || !Object.getOwnPropertyDescriptor(value, key)?.enumerable
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value"))
    || required.some((key) => !Object.hasOwn(value, key))) {
    return graphFailure("unexpected or missing fields");
  }
  return value as Record<string, unknown>;
}

export function graphText(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && value.length === 0)
    || /[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value)) {
    return graphFailure("invalid text");
  }
  return value;
}

export function isMicrosoftGraphSubject(value: string): boolean {
  // Graph IDs are opaque and case-sensitive; consumer accounts need not use UUIDs.
  return /^microsoft-graph:[A-Za-z0-9_-]{1,128}$/u.test(value);
}

export function graphTimestamp(value: unknown): string {
  const text = graphText(value, 32);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/u.test(text)
    || text.startsWith("0000") || !Number.isFinite(Date.parse(text))
    || new Date(text).toISOString().slice(0, 19) !== text.slice(0, 19)) {
    return graphFailure("invalid UTC timestamp");
  }
  return text;
}

/** Fixed-width UTC representation preserves Graph's full 100-nanosecond precision. */
export function graphComparableTimestamp(value: unknown): string {
  const text = graphTimestamp(value);
  const fraction = text.includes(".") ? text.slice(20, -1) : "";
  return `${text.slice(0, 19)}.${fraction.padEnd(7, "0")}Z`;
}

/** Ephemeral integrity key. Token rotation deliberately invalidates continuations. */
export function microsoftGraphContinuationKey(accessToken: string): Uint8Array {
  graphText(accessToken, 16_384);
  return createHmac("sha256", accessToken).update("ghostget:microsoft-graph:continuation-key:v1").digest();
}

export type MicrosoftGraphInput = Readonly<{
  limit: number;
  cursor: string | null;
  start: string | null;
  end: string | null;
}>;

export function parseMicrosoftGraphInput(operation: string, value: unknown): MicrosoftGraphInput {
  if (operation !== "contacts.list" && operation !== "calendar.attendees.list") {
    return graphFailure("unsupported operation");
  }
  const calendar = operation === "calendar.attendees.list";
  const input = graphRecord(value, calendar ? ["limit", "cursor", "start", "end"] : ["limit", "cursor"], calendar ? ["start", "end"] : []);
  const limit = Object.hasOwn(input, "limit") ? input.limit : 100;
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100) {
    return graphFailure("page size must be an integer from 1 to 100");
  }
  const cursor = Object.hasOwn(input, "cursor") ? graphText(input.cursor, MICROSOFT_GRAPH_MAX_CURSOR) : null;
  let start: string | null = null;
  let end: string | null = null;
  if (calendar) {
    start = graphTimestamp(input.start);
    end = graphTimestamp(input.end);
    if (!/^\d{4}.*\.000Z$/u.test(start) || !/^\d{4}.*\.000Z$/u.test(end)
      || Date.parse(end) <= Date.parse(start)
      || Date.parse(end) - Date.parse(start) > 90 * 86_400_000) {
      return graphFailure("calendar window requires increasing whole-second UTC bounds within 90 days");
    }
  }
  return Object.freeze({ limit: limit as number, cursor, start, end });
}

export function microsoftGraphInputIssues(operation: string, input: unknown): readonly string[] {
  try { parseMicrosoftGraphInput(operation, input); return []; }
  catch { return ["Invalid Microsoft Graph page size, continuation, or UTC calendar window"]; }
}

export function microsoftGraphInitialUrl(operation: MicrosoftGraphOperation, input: MicrosoftGraphInput): URL {
  const url = new URL(operation === "contacts.list" ? "/v1.0/me/contacts" : "/v1.0/me/calendar/calendarView", MICROSOFT_GRAPH_ORIGIN);
  url.searchParams.set("$select", operation === "contacts.list" ? MICROSOFT_GRAPH_CONTACT_FIELDS : MICROSOFT_GRAPH_EVENT_FIELDS);
  url.searchParams.set("$top", String(input.limit));
  if (input.start !== null && input.end !== null) {
    url.searchParams.set("startDateTime", input.start);
    url.searchParams.set("endDateTime", input.end);
  }
  return url;
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

type Continuation = Readonly<{ version: 1; query: string; nextLink: string; visited: readonly string[] }>;
function continuationMac(cursor: Continuation, key: Uint8Array): string {
  if (!(key instanceof Uint8Array) || key.byteLength !== 32) return graphFailure("invalid continuation authority");
  return createHmac("sha256", key).update(JSON.stringify(cursor)).digest("hex");
}
export type MicrosoftGraphPageRequest = Readonly<{
  url: URL;
  initialUrl: URL;
  query: string;
  visited: readonly string[];
}>;

function nextUrl(value: unknown, initial: URL): URL {
  const text = graphText(value, 8_192);
  let url: URL;
  try { url = new URL(text); } catch { return graphFailure("invalid continuation URL"); }
  if (url.href !== text || url.origin !== MICROSOFT_GRAPH_ORIGIN || url.username !== ""
    || url.password !== "" || url.port !== "" || url.hash !== "" || url.pathname !== initial.pathname) {
    return graphFailure("continuation changed origin or resource");
  }
  const expected = [...initial.searchParams.keys()];
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.length !== expected.length + 1
    || expected.some((key) => url.searchParams.get(key) !== initial.searchParams.get(key))) {
    return graphFailure("continuation changed request projection or window");
  }
  const extra = keys.filter((key) => !expected.includes(key));
  const key = extra[0];
  if (extra.length !== 1 || (key !== "$skiptoken" && key !== "$skip")) {
    return graphFailure("unsupported continuation query");
  }
  const token = graphText(url.searchParams.get(key), 4_096);
  if ((key === "$skip" && !/^[1-9][0-9]{0,6}$/u.test(token)) || /\s/u.test(token)) {
    return graphFailure("invalid continuation token");
  }
  return url;
}

export function microsoftGraphPageRequest(operation: MicrosoftGraphOperation, subject: string, input: MicrosoftGraphInput, key: Uint8Array): MicrosoftGraphPageRequest {
  if (!isMicrosoftGraphSubject(subject)) return graphFailure("invalid account subject");
  const initialUrl = microsoftGraphInitialUrl(operation, input);
  const query = digest(JSON.stringify({ version: 1, operation, subject, url: initialUrl.href }));
  if (input.cursor === null) return Object.freeze({ url: initialUrl, initialUrl, query, visited: [] });
  const encoded = input.cursor;
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) return graphFailure("invalid continuation encoding");
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); }
  catch { return graphFailure("invalid continuation JSON"); }
  const cursor = graphRecord(parsed, ["version", "query", "nextLink", "visited", "mac"]);
  if (cursor.version !== 1 || cursor.query !== query || !Array.isArray(cursor.visited)
    || cursor.visited.length < 1 || cursor.visited.length >= MICROSOFT_GRAPH_MAX_PAGES
    || cursor.visited.some((hash: unknown) => typeof hash !== "string" || !/^[a-f0-9]{64}$/u.test(hash))
    || new Set(cursor.visited).size !== cursor.visited.length) {
    return graphFailure("continuation account, request, or traversal bound changed");
  }
  const url = nextUrl(cursor.nextLink, initialUrl);
  const canonical: Continuation = { version: 1, query, nextLink: url.href, visited: cursor.visited as string[] };
  const expectedMac = continuationMac(canonical, key);
  if (typeof cursor.mac !== "string" || !/^[a-f0-9]{64}$/u.test(cursor.mac)
    || !timingSafeEqual(Buffer.from(cursor.mac, "hex"), Buffer.from(expectedMac, "hex"))) {
    return graphFailure("continuation integrity or credential changed");
  }
  if (Buffer.from(JSON.stringify({ ...canonical, mac: expectedMac })).toString("base64url") !== encoded
    || canonical.visited.includes(digest(url.href))) return graphFailure("noncanonical or repeated continuation");
  return Object.freeze({ url, initialUrl, query, visited: Object.freeze([...canonical.visited]) });
}

export function microsoftGraphNextCursor(value: unknown, request: MicrosoftGraphPageRequest, rowCount: number, key: Uint8Array): string | null {
  if (value === undefined) return null;
  if (rowCount === 0) return graphFailure("empty page has a continuation");
  const url = nextUrl(value, request.initialUrl);
  const visited = [...request.visited, digest(request.url.href)];
  if (visited.length >= MICROSOFT_GRAPH_MAX_PAGES || visited.includes(digest(url.href))) {
    return graphFailure("continuation repeated or exceeded the 100-page traversal bound");
  }
  const cursor: Continuation = { version: 1, query: request.query, nextLink: url.href, visited };
  const encoded = Buffer.from(JSON.stringify({ ...cursor, mac: continuationMac(cursor, key) })).toString("base64url");
  if (encoded.length > MICROSOFT_GRAPH_MAX_CURSOR) return graphFailure("continuation exceeds byte bound");
  return encoded;
}
