import { describe, expect, test } from "bun:test";
import { OperationDeadline } from "../operation-deadline";
import { ProviderHttpClient, type ProviderFetch } from "../provider-http";
import { assertAsyncProperty, assertProperty, fc } from "../test-support";
import { executeMicrosoftGraphRead } from "./microsoft-graph";
import {
  MICROSOFT_GRAPH_MAX_BYTES, MICROSOFT_GRAPH_ORIGIN,
  graphRecord, graphTimestamp, isMicrosoftGraphSubject,
  microsoftGraphContinuationKey, microsoftGraphInitialUrl, microsoftGraphNextCursor, microsoftGraphPageRequest,
  parseMicrosoftGraphInput, type MicrosoftGraphOperation,
} from "./microsoft-graph-policy";

const SUBJECT = "microsoft-graph:00000000-0000-0000-0000-000000000042";
const WINDOW = { start: "2026-09-01T00:00:00.000Z", end: "2026-09-30T00:00:00.000Z" };
const KEY = microsoftGraphContinuationKey("synthetic-token");
const SCOPES = ["User.Read", "Contacts.Read", "Calendars.ReadBasic"];
function json(value: unknown): Response { return Response.json(value); }
function contact(id = "contact-1") {
  return { id, displayName: "Example Person", givenName: "Example", surname: null,
    emailAddresses: [{ address: "person@example.com", name: "Example Person" }],
    businessPhones: ["+1 202 555 0100"], homePhones: [], mobilePhone: null,
    companyName: null, jobTitle: "Developer" };
}
function event(id = "event-1") {
  return { id, iCalUId: `ical-${id}`, type: "singleInstance", seriesMasterId: null,
    start: { dateTime: "2026-09-02T11:00:00.0000000", timeZone: "UTC" },
    end: { dateTime: "2026-09-02T12:00:00.0000000", timeZone: "UTC" },
    isCancelled: false, isOrganizer: false, hideAttendees: false,
    organizer: { emailAddress: { address: "organizer@example.com", name: "Organizer" } },
    attendees: [{ emailAddress: { address: "person@example.com", name: "Example Person" }, type: "required", status: { response: "accepted", time: "2026-09-01T09:00:00Z" } }] };
}

function harness(handler: (url: URL, index: number) => Response | Promise<Response> = () => json({ value: [contact()] }), options: { identity?: unknown; maximumBytes?: number; scopes?: readonly string[]; subject?: string; deadline?: OperationDeadline } = {}) {
  const calls: URL[] = [];
  const fetch: ProviderFetch = async (input, init) => {
    const url = new URL(input instanceof URL ? input.href : typeof input === "string" ? input : input.url);
    calls.push(url);
    expect(url.origin).toBe(MICROSOFT_GRAPH_ORIGIN);
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer synthetic-token");
    expect(new Headers(init?.headers).get("prefer")).toBe('IdType="ImmutableId", outlook.timezone="UTC"');
    if (url.pathname === "/v1.0/me") {
      expect([...url.searchParams]).toEqual([["$select", "id"]]);
      return json(options.identity ?? { id: SUBJECT.slice("microsoft-graph:".length) });
    }
    return handler(url, calls.length);
  };
  const client = {
    http: new ProviderHttpClient(fetch, options.deadline ?? 60_000, MICROSOFT_GRAPH_MAX_BYTES),
    accessToken: "synthetic-token", subject: options.subject ?? SUBJECT,
    scopes: options.scopes ?? SCOPES, maximumBytes: options.maximumBytes ?? MICROSOFT_GRAPH_MAX_BYTES,
  };
  return { calls, client };
}

describe("Microsoft Graph candidate reads", () => {
  test("reads identity and one minimal contact page, preserving nullable fields", async () => {
    const fixture = harness((url) => {
      expect(url.pathname).toBe("/v1.0/me/contacts");
      expect(url.searchParams.get("$top")).toBe("1");
      expect(url.searchParams.get("$select")).not.toMatch(/personalNotes|birthday|Address,/u);
      return json({ "@odata.context": `${MICROSOFT_GRAPH_ORIGIN}/v1.0/$metadata#contacts`, value: [{ ...contact(), "@odata.etag": 'W/"revision"' }] });
    });
    const output = await executeMicrosoftGraphRead("contacts.list", { limit: 1 }, fixture.client);
    if (!("contacts" in output)) throw new Error("expected contacts");
    expect(output.contacts).toEqual([contact()]);
    expect(output.page).toEqual({ count: 1, limit: 1, terminal: true, nextCursor: null, snapshotComplete: false });
    expect(fixture.calls).toHaveLength(2);
    expect(output.account).toBe(SUBJECT);
  });

  test("keeps occurrences, cancellations, resource invitees, and hidden-attendee state without claiming attendance", async () => {
    const rows = [event(), { ...event("occurrence"), type: "occurrence", seriesMasterId: "series", hideAttendees: true },
      { ...event("exception"), type: "exception", seriesMasterId: "series", isCancelled: true, attendees: [{ ...event().attendees[0], type: "resource" }] }];
    const fixture = harness((url) => {
      expect(url.pathname).toBe("/v1.0/me/calendar/calendarView");
      expect(url.searchParams.get("startDateTime")).toBe(WINDOW.start);
      expect(url.searchParams.get("endDateTime")).toBe(WINDOW.end);
      expect(url.searchParams.get("$select")).not.toMatch(/body|subject|location|attachments/u);
      return json({ value: rows });
    });
    const output = await executeMicrosoftGraphRead("calendar.attendees.list", WINDOW, fixture.client);
    if (!("events" in output)) throw new Error("expected calendar events");
    expect(output.events).toHaveLength(3);
    expect(output.events?.[1]).toMatchObject({ type: "occurrence", seriesMasterId: "series", hideAttendees: true });
    expect(output.events?.[2]).toMatchObject({ isCancelled: true, attendees: [{ type: "resource", response: "accepted" }] });
    expect(output.window).toEqual(WINDOW);
    expect(JSON.stringify(output)).not.toMatch(/attendance|subject|body|location|proposedNewTime/u);
  });

  test("traverses a fixed window and rechecks the account on every page", async () => {
    let page = 0;
    const fixture = harness((url) => {
      page += 1;
      if (page === 1) {
        const next = new URL(url); next.searchParams.set("$skiptoken", "opaque-token");
        return json({ value: [event()], "@odata.nextLink": next.href });
      }
      expect(url.searchParams.get("$skiptoken")).toBe("opaque-token");
      return json({ value: [] });
    });
    const first = await executeMicrosoftGraphRead("calendar.attendees.list", { ...WINDOW, limit: 1 }, fixture.client);
    expect(first.page.terminal).toBeFalse();
    const second = await executeMicrosoftGraphRead("calendar.attendees.list", { ...WINDOW, limit: 1, cursor: first.page.nextCursor }, fixture.client);
    expect(second.page).toMatchObject({ count: 0, terminal: true, snapshotComplete: false });
    expect(fixture.calls.map((url) => url.pathname)).toEqual(["/v1.0/me", "/v1.0/me/calendar/calendarView", "/v1.0/me", "/v1.0/me/calendar/calendarView"]);
  });

  test("rejects account mismatch before contact or calendar access", async () => {
    for (const operation of ["contacts.list", "calendar.attendees.list"] as const) {
      const fixture = harness(undefined, { identity: { id: "other-private-account" } });
      await expect(executeMicrosoftGraphRead(operation, operation === "contacts.list" ? {} : WINDOW, fixture.client)).rejects.toThrow("account mismatch");
      expect(fixture.calls).toHaveLength(1);
    }
  });

  test("validates delegated scopes, input, subject, and byte bound before HTTP", async () => {
    for (const options of [{ scopes: [] }, { scopes: ["User.Read"] }, { scopes: ["User.Read", "Contacts.ReadWrite"] }, { subject: "email@example.com" }, { maximumBytes: 0 }, { maximumBytes: MICROSOFT_GRAPH_MAX_BYTES + 1 }]) {
      const fixture = harness(undefined, options);
      await expect(executeMicrosoftGraphRead("contacts.list", {}, fixture.client)).rejects.toThrow();
      expect(fixture.calls).toHaveLength(0);
    }
    for (const value of [{ limit: 101 }, { limit: null }, { limit: 1.5 }, { cursor: null }, { path: "/users/other" }]) {
      const fixture = harness();
      await expect(executeMicrosoftGraphRead("contacts.list", value, fixture.client)).rejects.toThrow();
      expect(fixture.calls).toHaveLength(0);
    }
  });

  test("fails closed on HTTP failures, redirection, wrong media types, and excessive response bytes", async () => {
    for (const reply of [new Response(null, { status: 302, headers: { location: "https://example.com/private" } }), new Response("secret-body", { status: 401 }), new Response("secret-body", { status: 429 }), new Response("{}", { headers: { "content-type": "text/html" } }), new Response("not-json", { headers: { "content-type": "application/json" } }), json({ value: [contact()], padding: "x".repeat(4_000) })]) {
      const fixture = harness(() => reply, { maximumBytes: 2_000 });
      let error: unknown;
      try { await executeMicrosoftGraphRead("contacts.list", {}, fixture.client); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toMatch(/secret-body|synthetic-token|person@example/u);
      expect(fixture.calls).toHaveLength(2);
    }
  });

  test("strict response validation rejects duplicate IDs, excess rows, private fields, and malformed data", async () => {
    const invalid = [
      { value: [contact(), contact()] }, { value: [contact("one"), contact("two")] },
      { value: [{ ...contact(), personalNotes: "private" }] },
      { value: [{ ...contact(), emailAddresses: [{ address: "not-an-email", name: null }] }] },
      { value: [{ ...contact(), givenName: undefined }] },
      { value: [contact()], "@odata.count": 1 },
      { value: [contact()], "@odata.context": "https://other.invalid/$metadata#contacts" },
      { value: [contact()], "@odata.nextLink": null },
    ];
    for (const page of invalid) {
      const fixture = harness(() => json(page));
      await expect(executeMicrosoftGraphRead("contacts.list", { limit: 1 }, fixture.client)).rejects.toThrow();
    }
  });

  test("rejects event series drift, impossible timestamps, outside-window events, and ambiguous invitees", async () => {
    const invalid = [
      { ...event(), type: "seriesMaster" }, { ...event(), type: "occurrence" },
      { ...event(), seriesMasterId: "unexpected-series" }, { ...event(), subject: "private" },
      { ...event(), start: { dateTime: "2026-02-30T11:00:00", timeZone: "UTC" } },
      { ...event(), start: { dateTime: "2026-09-02T11:00:00", timeZone: "America/New_York" } },
      { ...event(), start: event().end, end: event().start },
      { ...event(), start: { dateTime: "2026-10-02T11:00:00", timeZone: "UTC" }, end: { dateTime: "2026-10-02T12:00:00", timeZone: "UTC" } },
      { ...event(), attendees: [...event().attendees, ...event().attendees] },
      { ...event(), attendees: [{ ...event().attendees[0], type: "unknown" }] },
    ];
    for (const row of invalid) {
      const fixture = harness(() => json({ value: [row] }));
      await expect(executeMicrosoftGraphRead("calendar.attendees.list", WINDOW, fixture.client)).rejects.toThrow();
    }
  });

  test("accepts zero-duration events and events spanning a window edge", async () => {
    const fixture = harness(() => json({ value: [{ ...event(), end: event().start }, { ...event("edge"), start: { dateTime: "2026-08-31T00:00:00", timeZone: "UTC" } }] }));
    expect((await executeMicrosoftGraphRead("calendar.attendees.list", WINDOW, fixture.client)).page.count).toBe(2);
  });

  test("preserves 100-nanosecond ordering for events and proposed times", async () => {
    const early = { dateTime: "2026-09-02T11:00:00.0000001", timeZone: "UTC" };
    const late = { dateTime: "2026-09-02T11:00:00.0000002", timeZone: "UTC" };
    const inverted = harness(() => json({ value: [{ ...event(), start: late, end: early }] }));
    await expect(executeMicrosoftGraphRead("calendar.attendees.list", WINDOW, inverted.client)).rejects.toThrow();
    const valid = harness(() => json({ value: [{ ...event(), start: early, end: late,
      attendees: [{ ...event().attendees[0], proposedNewTime: { start: early, end: late } }] }] }));
    const output = await executeMicrosoftGraphRead("calendar.attendees.list", WINDOW, valid.client);
    expect(output.page.count).toBe(1);
    expect(JSON.stringify(output)).not.toContain("proposedNewTime");
  });

  test("enforces per-event and whole-page attendee ceilings", async () => {
    const invitees = (count: number) => Array.from({ length: count }, (_, index) => ({
      ...event().attendees[0], emailAddress: { address: `person${index}@example.com`, name: null },
    }));
    const tooManyInEvent = harness(() => json({ value: [{ ...event(), attendees: invitees(501) }] }));
    await expect(executeMicrosoftGraphRead("calendar.attendees.list", WINDOW, tooManyInEvent.client)).rejects.toThrow("collection bound");
    const rows = Array.from({ length: 11 }, (_, index) => ({ ...event(`event-${index}`), attendees: invitees(500) }));
    const tooManyOnPage = harness(() => json({ value: rows }));
    await expect(executeMicrosoftGraphRead("calendar.attendees.list", WINDOW, tooManyOnPage.client)).rejects.toThrow("5000 attendees");
  });

  test("honors cancellation before the identity request", async () => {
    const controller = new AbortController(); controller.abort("private-reason");
    const deadline = new OperationDeadline(60_000, { signal: controller.signal });
    const fixture = harness(undefined, { deadline });
    try {
      await expect(executeMicrosoftGraphRead("contacts.list", {}, fixture.client)).rejects.toThrow();
      expect(fixture.calls).toHaveLength(0);
    } finally { deadline.dispose(); }
  });
});

describe("Microsoft Graph continuation authority", () => {
  const input = parseMicrosoftGraphInput("calendar.attendees.list", { ...WINDOW, limit: 2 });
  const first = microsoftGraphPageRequest("calendar.attendees.list", SUBJECT, input, KEY);
  function nextLink(): URL { const url = new URL(first.url); url.searchParams.set("$skiptoken", "token-1"); return url; }
  function cursor(): string { return microsoftGraphNextCursor(nextLink().href, first, 2, KEY)!; }

  test("rejects account, operation, window, page-size, and projection rebinding before HTTP", async () => {
    const saved = cursor();
    for (const request of [
      { operation: "contacts.list" as const, input: { limit: 2, cursor: saved }, subject: SUBJECT },
      { operation: "calendar.attendees.list" as const, input: { ...WINDOW, limit: 2, cursor: saved }, subject: "microsoft-graph:other" },
      { operation: "calendar.attendees.list" as const, input: { ...WINDOW, limit: 1, cursor: saved }, subject: SUBJECT },
      { operation: "calendar.attendees.list" as const, input: { ...WINDOW, end: "2026-09-29T00:00:00.000Z", limit: 2, cursor: saved }, subject: SUBJECT },
    ]) {
      const fixture = harness(undefined, { subject: request.subject });
      await expect(executeMicrosoftGraphRead(request.operation, request.input, fixture.client)).rejects.toThrow();
      expect(fixture.calls).toHaveLength(0);
    }
  });

  test("rejects SSRF, user/resource switches, duplicate and extra query parameters, and projections containing bodies", () => {
    const cases: ((url: URL) => void)[] = [
      (url) => { url.hostname = "graph.microsoft.com.evil.invalid"; },
      (url) => { url.protocol = "http:"; }, (url) => { url.username = "private"; },
      (url) => { url.port = "444"; }, (url) => { url.hash = "private"; },
      (url) => { url.pathname = "/v1.0/users/other/calendar/calendarView"; },
      (url) => { url.searchParams.set("$select", "body,subject"); },
      (url) => { url.searchParams.append("$top", "2"); },
      (url) => { url.searchParams.set("$expand", "attachments"); },
      (url) => { url.searchParams.set("$skip", "2"); },
      (url) => { url.searchParams.delete("$select"); },
    ];
    for (const change of cases) {
      const url = nextLink(); change(url);
      expect(() => microsoftGraphNextCursor(url.href, first, 2, KEY)).toThrow();
    }
    expect(() => microsoftGraphNextCursor(nextLink().href, first, 0, KEY)).toThrow();
  });

  test("rejects noncanonical encoding, duplicate JSON keys, loops, and a 101st page", () => {
    const saved = cursor();
    expect(() => microsoftGraphPageRequest("calendar.attendees.list", SUBJECT, { ...input, cursor: `${saved}=` }, KEY)).toThrow();
    const text = Buffer.from(saved, "base64url").toString("utf8");
    const duplicate = text.replace('"version":1', '"version":1,"version":1');
    expect(() => microsoftGraphPageRequest("calendar.attendees.list", SUBJECT, { ...input, cursor: Buffer.from(duplicate).toString("base64url") }, KEY)).toThrow();
    let request = microsoftGraphPageRequest("calendar.attendees.list", SUBJECT, { ...input, cursor: saved }, KEY);
    expect(() => microsoftGraphNextCursor(request.url.href, request, 2, KEY)).toThrow();
    for (let page = 2; page < 100; page += 1) {
      const url = nextLink(); url.searchParams.set("$skiptoken", `token-${page}`);
      const next = microsoftGraphNextCursor(url.href, request, 2, KEY)!;
      request = microsoftGraphPageRequest("calendar.attendees.list", SUBJECT, { ...input, cursor: next }, KEY);
    }
    const overflow = nextLink(); overflow.searchParams.set("$skiptoken", "token-100");
    expect(() => microsoftGraphNextCursor(overflow.href, request, 2, KEY)).toThrow("100-page");
    expect(microsoftGraphNextCursor(undefined, request, 0, KEY)).toBeNull();
  });

  test("authenticates the full cursor against credential rotation, account rebinding, and rewritten traversal history", () => {
    const saved = cursor();
    expect(() => microsoftGraphPageRequest("calendar.attendees.list", SUBJECT, { ...input, cursor: saved }, microsoftGraphContinuationKey("rotated-token"))).toThrow("integrity");
    const parsed = JSON.parse(Buffer.from(saved, "base64url").toString("utf8"));
    const other = "microsoft-graph:account-b";
    const rewritten = { ...parsed, query: microsoftGraphPageRequest("calendar.attendees.list", other, input, KEY).query, visited: ["0".repeat(64)] };
    const forged = Buffer.from(JSON.stringify(rewritten)).toString("base64url");
    expect(() => microsoftGraphPageRequest("calendar.attendees.list", other, { ...input, cursor: forged }, KEY)).toThrow("integrity");
    const reset = Buffer.from(JSON.stringify({ ...parsed, visited: ["0".repeat(64)] })).toString("base64url");
    expect(() => microsoftGraphPageRequest("calendar.attendees.list", SUBJECT, { ...input, cursor: reset }, KEY)).toThrow("integrity");
    expect(saved).not.toContain("synthetic-token");
    expect(Buffer.from(saved, "base64url").toString("utf8")).not.toContain("synthetic-token");
  });
});

describe("Microsoft Graph parser properties", () => {
  test("accepted UTC timestamps round-trip without calendar rollover", () => {
    assertProperty(fc.property(fc.date({ min: new Date("2000-01-01Z"), max: new Date("2099-12-31Z"), noInvalidDate: true }), (date) => {
      expect(graphTimestamp(date.toISOString())).toBe(date.toISOString());
    }));
    expect(() => graphTimestamp("2026-02-30T00:00:00.000Z")).toThrow();
    expect(() => graphTimestamp("2026-09-01T24:00:00.000Z")).toThrow();
  });

  test("arbitrary input cannot cause provider access when parsing fails", async () => {
    await assertAsyncProperty(fc.asyncProperty(fc.jsonValue(), async (value) => {
      let valid = false;
      try { parseMicrosoftGraphInput("calendar.attendees.list", value); valid = true; } catch { /* invalid */ }
      if (valid) return;
      const fixture = harness();
      await expect(executeMicrosoftGraphRead("calendar.attendees.list", value, fixture.client)).rejects.toThrow();
      expect(fixture.calls).toHaveLength(0);
    }));
  });

  test("bounded continuations round-trip for both projections and cannot switch accounts", () => {
    assertProperty(fc.property(fc.constantFrom<MicrosoftGraphOperation>("contacts.list", "calendar.attendees.list"), fc.integer({ min: 1, max: 100 }), fc.uuid(), (operation, limit, id) => {
      const subject = `microsoft-graph:${id}`;
      const input = parseMicrosoftGraphInput(operation, operation === "contacts.list" ? { limit } : { ...WINDOW, limit });
      const first = microsoftGraphPageRequest(operation, subject, input, KEY);
      const next = microsoftGraphInitialUrl(operation, input); next.searchParams.set("$skiptoken", id);
      const cursor = microsoftGraphNextCursor(next.href, first, limit, KEY)!;
      expect(microsoftGraphPageRequest(operation, subject, { ...input, cursor }, KEY).url.href).toBe(next.href);
      expect(() => microsoftGraphPageRequest(operation, `${subject}-other`, { ...input, cursor }, KEY)).toThrow();
    }));
  });

  test("rejects accessors and proxy records without evaluating them", () => {
    let reads = 0;
    expect(() => graphRecord({ get value() { reads += 1; return []; } }, ["value"])).toThrow();
    expect(() => graphRecord(new Proxy({}, { ownKeys() { reads += 1; return []; } }), [])).toThrow();
    expect(reads).toBe(0);
    expect(isMicrosoftGraphSubject("microsoft-graph:0000000042ABCDEF")).toBeTrue();
    expect(isMicrosoftGraphSubject("microsoft-graph:person@example.com")).toBeFalse();
  });
});
