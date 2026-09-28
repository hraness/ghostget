import { describe, expect, test } from "bun:test";

import { assertProperty, fc } from "../test-support";
import {
  authorizeSubstackSubscriberRequest,
  normalizeSubstackSubscriberImportInstances,
  normalizeSubstackSubscriberImportStatus,
  normalizeSubstackSubscriberPage,
  parseSubstackSubscriberCursor,
  prepareSubstackSubscriberExportInput,
  prepareSubstackSubscriberImportInput,
  prepareSubstackSubscriberImportStatusInput,
  soleSubstackSubscriberPublication,
  substackSubscriberImportRequestBody,
  substackSubscriberStatsRequestBody,
  SUBSTACK_WEB_OPERATIONS,
  SUBSTACK_SUBSCRIBER_EXPORT_MAX_ROWS,
  SUBSTACK_SUBSCRIBER_EXPORT_OVERLAP,
  type SubstackSubscriberCursor,
  type SubstackWebViewer,
} from "./substack-web";

const PUBLICATION_ID = 7;
const ORIGIN = "https://wrench-owned.substack.com";

function row(index: number, overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    user_id: 1_000 + index,
    user_email_address: `reader${String(index)}@example.com`,
    user_name: "Private Name",
    user_photo_url: null,
    subscription_id: 2_000 + index,
    subscription_created_at: "2026-06-04T19:51:29.324Z",
    subscription_interval: "free",
    subscription_type: null,
    is_subscribed: true,
    is_founding: false,
    is_free_trial: false,
    is_gift: false,
    is_comp: false,
    is_bitcoin: false,
    activity_rating: 1,
    total_revenue_generated: 0,
    total_count: 3,
    ...overrides,
  };
}

function viewer(publications: SubstackWebViewer["publications"]): SubstackWebViewer {
  return { id: 42, handle: "owner", name: null, publications };
}

function publication(origin = ORIGIN, id = PUBLICATION_ID): SubstackWebViewer["publications"][number] {
  return {
    id,
    origin,
    primaryUserId: 42,
    canPostNotesAsPrimaryUser: true,
    isPublicationPrimaryUser: true,
  };
}

describe("Substack subscriber contract states", () => {
  test("runs all three live-qualified subscriber operations with their frozen risks", () => {
    expect(SUBSTACK_WEB_OPERATIONS["subscribers.export"]).toMatchObject({
      effect: "read",
      risk: "R1",
      state: "observed",
      evidence: "live-direct",
    });
    expect(SUBSTACK_WEB_OPERATIONS["subscribers.import"]).toMatchObject({
      effect: "write",
      risk: "R3",
      state: "observed",
      evidence: "live-direct",
    });
    expect(SUBSTACK_WEB_OPERATIONS["subscribers.import.status"]).toMatchObject({
      effect: "read",
      risk: "R1",
      state: "observed",
      evidence: "live-direct",
    });
  });
});

const exportBinding = { publicationId: PUBLICATION_ID, publicationOrigin: ORIGIN, viewerId: 42 };
const order = { by: "subscription_created_at", direction: "desc" };
function page(rows: readonly Record<string, unknown>[], total = rows.length) {
  return { count: total, subscribers: rows, order };
}

describe("Substack subscriber export projection", () => {
  test("projects only email, dashboard type, and signup time without inferring membership or sections", () => {
    const result = normalizeSubstackSubscriberPage(page([
      row(0, { is_subscribed: false, subscription_created_at: "2026-06-04T19:51:29.324567890+00:00" }),
      row(1, { user_email_address: "Mixed.Case@Example.COM", subscription_interval: "annual", sections: [{ name: "Private section" }] }),
      row(2, { is_founding: true, subscription_created_at: null }),
    ]), { ...exportBinding, offset: 0, limit: 3, total: null });
    expect(result.subscribers).toEqual([
      { email: "reader0@example.com", subscriptionType: "free", subscribedAt: "2026-06-04T19:51:29.324Z" },
      { email: "mixed.case@example.com", subscriptionType: "paid", subscribedAt: "2026-06-04T19:51:29.324Z" },
      { email: "reader2@example.com", subscriptionType: "founding", subscribedAt: null },
    ]);
    expect(result).toMatchObject({ total: 3, nextCursor: null, complete: true, continuationSupported: false, stopReason: "provider-exhausted", completeness: { kind: "census" } });
    for (const subscriber of result.subscribers) {
      expect(Object.keys(subscriber).sort()).toEqual(["email", "subscribedAt", "subscriptionType"]);
    }
    expect(JSON.stringify(result)).not.toContain("Private");
    expect(JSON.stringify(result)).not.toContain("subscription_id");
  });

  test("maps gift, comp, and unreviewed intervals without guessing", () => {
    const result = normalizeSubstackSubscriberPage(page([
      row(0, { is_gift: true, subscription_interval: "monthly" }),
      row(1, { is_comp: true }),
      row(2, { subscription_interval: "lifetime" }),
      row(3, { subscription_interval: null }),
    ]), { ...exportBinding, offset: 0, limit: 4, total: null });
    expect(result.subscribers.map((subscriber) => subscriber.subscriptionType)).toEqual(["gift", "comp", "unknown", "unknown"]);
  });

  test("rejects malformed rows, unknown ordering, oversized pages, and inconsistent totals", () => {
    const expected = { ...exportBinding, offset: 0, limit: 2, total: null };
    for (const value of [
      page([row(0, { user_email_address: "not-an-email" })]),
      page([row(0, { is_gift: "yes" })]),
      page([row(0, { subscription_created_at: "yesterday" })]),
      page([row(0, { subscription_created_at: "2026-02-30T19:51:29.123456789+00:00" })]),
      page([row(0, { subscription_created_at: "2100-02-29T00:00:00Z" })]),
      page([row(0, { subscription_created_at: "2026-04-31T00:00:00Z" })]),
      page([row(0, { subscription_created_at: "2026-06-04T24:00:00Z" })]),
      page([row(0), row(1), row(2)]),
      page([row(0), row(1)], 1),
      page([row(0), row(0)]),
      page([], 5),
      page([], -1),
      { ...page([row(0)]), count: "2" },
      { subscribers: [row(0)], order },
      { ...page([row(0)]), order: { by: "user_email_address", direction: "desc" } },
      { ...page([row(0)]), order: { ...order, direction: "asc" } },
      { ...page([row(0)]), order: null },
    ]) expect(() => normalizeSubstackSubscriberPage(value, expected)).toThrow();
    expect(() => normalizeSubstackSubscriberPage(page([row(0)], 9), { ...expected, total: 8 })).toThrow("total changed during pagination");
    expect(normalizeSubstackSubscriberPage(page([row(0, { subscription_created_at: "2000-02-29T00:00:00.123456789+01:00" })]), expected).subscribers[0]?.subscribedAt).toBe("2000-02-28T23:00:00.123Z");
  });

  test("drops overlap repeats, including case variants, and rewinds the next page", () => {
    const first = normalizeSubstackSubscriberPage(page([row(0), row(1), row(2)], 6), { ...exportBinding, offset: 0, limit: 3, total: null });
    const cursor = parseSubstackSubscriberCursor(first.nextCursor);
    // A three-row page rewinds two rows, keeping at least one row of progress.
    expect(cursor.offset).toBe(1);
    const second = normalizeSubstackSubscriberPage(page([row(2), row(1, { user_email_address: "READER1@EXAMPLE.COM" }), row(3)], 6), { ...cursor, limit: 3 });
    expect(second.subscribers.map((subscriber) => subscriber.email)).toEqual(["reader3@example.com"]);
    expect(() => normalizeSubstackSubscriberPage(page([row(4), row(4)], 6), { ...cursor, limit: 3 })).toThrow("repeated an address");
  });

  test("marks only an exhausted chain whose unique count equals total as complete", () => {
    const first = normalizeSubstackSubscriberPage(page([row(0), row(1)], 3), { ...exportBinding, offset: 0, limit: 2, total: null });
    const cursor = parseSubstackSubscriberCursor(first.nextCursor);
    const missing = normalizeSubstackSubscriberPage(page([row(1), row(0)], 3), { ...cursor, limit: 2 });
    expect(missing).toMatchObject({ complete: false, stopReason: "census-mismatch", nextCursor: null, completeness: { kind: "page" } });
    const found = normalizeSubstackSubscriberPage(page([row(1), row(2)], 3), { ...cursor, limit: 2 });
    expect(found).toMatchObject({ complete: true, stopReason: "provider-exhausted", nextCursor: null, completeness: { kind: "census" } });
  });

  test("collects every stable window into a census bounded by the row limit", () => {
    assertProperty(fc.property(fc.integer({ min: 0, max: 700 }), fc.integer({ min: 1, max: 100 }), (total, requestedLimit) => {
      let cursor: SubstackSubscriberCursor | null = null;
      const emails = new Set<string>();
      let pages = 0;
      let last: ReturnType<typeof normalizeSubstackSubscriberPage> | null = null;
      do {
        const offset = cursor?.offset ?? 0;
        const limit = Math.min(requestedLimit, SUBSTACK_SUBSCRIBER_EXPORT_MAX_ROWS - offset);
        const count = Math.min(limit, total - offset);
        last = normalizeSubstackSubscriberPage(page(Array.from({ length: count }, (_, index) => row(offset + index)), total), {
          ...exportBinding, offset, limit, total: cursor?.total ?? null, seenFingerprints: cursor?.seenFingerprints ?? "",
        });
        for (const subscriber of last.subscribers) {
          expect(emails.has(subscriber.email)).toBe(false);
          emails.add(subscriber.email);
        }
        if (last.nextCursor !== null) {
          expect(last.nextCursor.offset).toBe(offset + Math.max(1, count - SUBSTACK_SUBSCRIBER_EXPORT_OVERLAP));
        }
        cursor = last.nextCursor;
        pages += 1;
      } while (cursor !== null && pages < 1_000);
      expect(cursor).toBeNull();
      const bounded = Math.min(total, SUBSTACK_SUBSCRIBER_EXPORT_MAX_ROWS);
      expect(emails.size).toBe(bounded);
      expect(last?.complete).toBe(total <= SUBSTACK_SUBSCRIBER_EXPORT_MAX_ROWS);
      expect(last?.stopReason).toBe(total <= SUBSTACK_SUBSCRIBER_EXPORT_MAX_ROWS ? "provider-exhausted" : "row-limit");
    }));
  });

  test("reconstructs strict authenticated payloads and rejects legacy cursors and inconsistent history", () => {
    const first = normalizeSubstackSubscriberPage(page([row(0), row(1)], 3), { ...exportBinding, offset: 0, limit: 2, total: null });
    if (first.nextCursor === null) throw new Error("expected a continuation for the remaining row");
    expect(parseSubstackSubscriberCursor(first.nextCursor)).toEqual(first.nextCursor);
    for (const value of [
      "ss1.7.2.3", null, {}, { ...first.nextCursor, schemaVersion: 1 }, { ...first.nextCursor, schemaVersion: 2 },
      { ...first.nextCursor, offset: 0 }, { ...first.nextCursor, offset: 500 },
      { ...first.nextCursor, total: 1 },
      { ...first.nextCursor, viewerId: 0 }, { ...first.nextCursor, extra: true },
      { ...first.nextCursor, publicationOrigin: "https://other.example.com" },
      { ...first.nextCursor, seenFingerprints: "AA" },
      { ...first.nextCursor, seenFingerprints: "" },
      { ...first.nextCursor, seenFingerprints: Buffer.alloc(16).toString("base64url") },
      { ...first.nextCursor, offset: 1, seenFingerprints: Buffer.from(Array.from({ length: 12 }, (_, index) => index.toString(16).padStart(16, "0")).join(""), "hex").toString("base64url") },
    ]) expect(() => parseSubstackSubscriberCursor(value)).toThrow();
  });

  test("validates export input exactly", () => {
    expect(prepareSubstackSubscriberExportInput({ publication: "wrench-owned", limit: 100 })).toEqual({ publication: "wrench-owned", cursor: null, limit: 100 });
    for (const value of [{}, { publication: "UPPER", limit: 10 }, { publication: "https://other.substack.com", limit: 10 }, { publication: "x".repeat(64), limit: 10 }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: "10" }, { limit: 10, cursor: "ss1.7.2.5" }, { limit: 10, cursor: null }, { limit: 10, offset: 0 }, [], null]) {
      expect(() => prepareSubstackSubscriberExportInput(typeof value === "object" && value !== null && !Array.isArray(value) ? { publication: "wrench-owned", ...value } : value)).toThrow();
    }
  });
});

describe("Substack subscriber import validation", () => {
  const P = "wrench-owned";

  test("accepts exactly one normalized address for one named publication", () => {
    const emails = ["reader@example.com"];
    expect(prepareSubstackSubscriberImportInput({ publication: P, emails, send_welcome_email: false })).toEqual({
      publication: P,
      emails,
      sendWelcomeEmail: false,
    });
  });

  test("rejects every invalid request", () => {
    const valid = ["reader@example.com"];
    for (const value of [
      { publication: P, emails: [], send_welcome_email: false },
      { publication: P, emails: ["first@example.com", "second@example.com"], send_welcome_email: false },
      { publication: P, emails: ["reader@example.com", "reader@example.com"], send_welcome_email: false },
      { publication: P, emails: ["Reader@example.com"], send_welcome_email: false },
      { publication: P, emails: [" reader@example.com"], send_welcome_email: false },
      { publication: P, emails: ["reader"], send_welcome_email: false },
      { publication: P, emails: ["reader@localhost"], send_welcome_email: false },
      { publication: P, emails: ["a..b@example.com"], send_welcome_email: false },
      { publication: P, emails: ["a@b@example.com"], send_welcome_email: false },
      { publication: P, emails: [7], send_welcome_email: false },
      { publication: P, emails: valid, send_welcome_email: true },
      { publication: P, emails: valid, send_welcome_email: "false" },
      { publication: P, emails: valid, send_welcome_email: 0 },
      { publication: P, emails: valid },
      { publication: P, emails: valid, sendWelcomeEmail: false },
      { publication: P, emails: "reader@example.com", send_welcome_email: false },
      { emails: valid, send_welcome_email: false },
      { publication: "Wrench-Owned", emails: valid, send_welcome_email: false },
      { publication: "https://wrench-owned.substack.com", emails: valid, send_welcome_email: false },
      { publication: P, emails: valid, send_welcome_email: false, extra: true },
    ]) {
      expect(() => prepareSubstackSubscriberImportInput(value)).toThrow();
    }
  });

  test("never accepts more than one address", () => {
    assertProperty(fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 40 }),
      fc.boolean(),
      (ids, repeat) => {
        const emails = ids.map((id) => `r${String(id)}@example.com`);
        if (repeat) emails.push(emails[0]!);
        const attempt = (): unknown => prepareSubstackSubscriberImportInput({
          publication: P,
          emails,
          send_welcome_email: false,
        });
        if (emails.length === 1) expect(attempt()).toMatchObject({ emails });
        else expect(attempt).toThrow();
      },
    ));
  });

  test("status input names exactly one canonical publication", () => {
    expect(prepareSubstackSubscriberImportStatusInput({ publication: P })).toBe(P);
    for (const value of [{}, { publication: "UPPER" }, { publication: P, job: 1 }, null]) {
      expect(() => prepareSubstackSubscriberImportStatusInput(value)).toThrow();
    }
  });
});

describe("Substack import status projection", () => {
  test("projects only the latest import result counts from the instances envelope", () => {
    const envelope = {
      hasActiveListManagementModerationTask: false,
      latestImportResult: {
        total: 1,
        is_added: 1,
        is_skipped: 0,
        is_limited: 0,
        passImportVerification: true,
        upload_date: "2026-09-28T02:40:00.123456789+00:00",
      },
      pubImports: [{ file_name: "private.csv" }],
    };
    expect(normalizeSubstackSubscriberImportInstances(envelope)).toEqual({
      total: 1,
      isAdded: 1,
      isSkipped: 0,
      isLimited: 0,
      passImportVerification: true,
    });
    for (const value of [
      { ...envelope, extra: true },
      { ...envelope, hasActiveListManagementModerationTask: "no" },
      { ...envelope, pubImports: null },
      { ...envelope, latestImportResult: null },
      { ...envelope, latestImportResult: { ...envelope.latestImportResult, upload_date: "never" } },
      { ...envelope, latestImportResult: { ...envelope.latestImportResult, extra: 1 } },
    ]) expect(() => normalizeSubstackSubscriberImportInstances(value)).toThrow();
  });

  test("projects the exact five status fields to camelCase", () => {
    expect(normalizeSubstackSubscriberImportStatus({
      total: 25,
      is_added: 20,
      is_skipped: 4,
      is_limited: 1,
      passImportVerification: true,
    })).toEqual({
      total: 25,
      isAdded: 20,
      isSkipped: 4,
      isLimited: 1,
      passImportVerification: true,
    });
  });

  test("rejects missing, extra, or mistyped status fields", () => {
    const base = {
      total: 0,
      is_added: 0,
      is_skipped: 0,
      is_limited: 0,
      passImportVerification: false,
    };
    for (const value of [
      { ...base, extra: 1 },
      { ...base, total: -1 },
      { ...base, is_added: 1.5 },
      { ...base, is_limited: "0" },
      { ...base, passImportVerification: "true" },
      Object.fromEntries(Object.entries(base).filter(([key]) => key !== "is_skipped")),
    ]) {
      expect(() => normalizeSubstackSubscriberImportStatus(value)).toThrow();
    }
  });

  test("round-trips arbitrary valid counts exactly", () => {
    assertProperty(fc.property(
      fc.nat({ max: 100_000_000 }),
      fc.nat({ max: 100_000_000 }),
      fc.nat({ max: 100_000_000 }),
      fc.nat({ max: 100_000_000 }),
      fc.boolean(),
      (total, added, skipped, limited, pass) => {
        expect(normalizeSubstackSubscriberImportStatus({
          total,
          is_added: added,
          is_skipped: skipped,
          is_limited: limited,
          passImportVerification: pass,
        })).toEqual({
          total,
          isAdded: added,
          isSkipped: skipped,
          isLimited: limited,
          passImportVerification: pass,
        });
      },
    ));
  });
});

describe("Substack subscriber publication and request binding", () => {
  test("binds exactly one dashboard publication on its own substack.com origin", () => {
    expect(soleSubstackSubscriberPublication(viewer([publication()]))).toEqual({
      id: PUBLICATION_ID,
      origin: ORIGIN,
      organization: "wrench-owned",
    });
    expect(() => soleSubstackSubscriberPublication(viewer([]))).toThrow("exactly one");
    expect(() => soleSubstackSubscriberPublication(viewer([
      publication(),
      publication("https://second.substack.com", 8),
    ]))).toThrow("exactly one");
    expect(() => soleSubstackSubscriberPublication(viewer([
      publication("https://news.example.com"),
    ]))).toThrow("own substack.com origin");
  });

  test("authorizes only the exact owned origin, method, path, and body", () => {
    const binding = { organization: "wrench-owned", publicationOrigin: ORIGIN } as const;
    const body = substackSubscriberStatsRequestBody(0, 50);
    expect(authorizeSubstackSubscriberRequest({
      ...binding,
      operation: "subscribers.export",
      url: `${ORIGIN}/api/v1/subscriber-stats`,
      method: "POST",
      body,
    })).toEqual({ operation: "subscribers.export", method: "POST", path: "/api/v1/subscriber-stats" });
    expect(authorizeSubstackSubscriberRequest({
      ...binding,
      operation: "subscribers.import.status",
      url: `${ORIGIN}/api/v1/import/instances`,
      method: "GET",
    })).toEqual({ operation: "subscribers.import.status", method: "GET", path: "/api/v1/import/instances" });
    const importBody = substackSubscriberImportRequestBody({
      publication: "wrench-owned",
      emails: ["reader@example.com"],
      sendWelcomeEmail: false,
    });
    expect(JSON.stringify(importBody)).toBe(JSON.stringify({ email: "reader@example.com", subscription: false, sendEmail: false }));
    expect(authorizeSubstackSubscriberRequest({
      ...binding,
      operation: "subscribers.import",
      url: `${ORIGIN}/api/v1/subscriber/add`,
      method: "POST",
      body: importBody,
    }).path).toBe("/api/v1/subscriber/add");

    for (const candidate of [
      { operation: "subscribers.export", url: "https://other.substack.com/api/v1/subscriber-stats", method: "POST", body },
      { operation: "subscribers.export", url: `${ORIGIN}/api/v1/subscriber-stats?x=1`, method: "POST", body },
      { operation: "subscribers.export", url: `${ORIGIN}/api/v1/subscriber-stats`, method: "GET", body },
      { operation: "subscribers.export", url: `${ORIGIN}/api/v1/subscriber-stats`, method: "POST", body: { ...body, limit: 101 } },
      { operation: "subscribers.export", url: `${ORIGIN}/api/v1/subscriber-stats`, method: "POST", body: { ...body, extra: true } },
      { operation: "subscribers.import.status", url: `${ORIGIN}/api/v1/import/instances`, method: "POST" },
      { operation: "subscribers.import.status", url: `${ORIGIN}/api/v1/import/instances`, method: "GET", body: {} },
      { operation: "subscribers.import.status", url: `${ORIGIN}/api/v1/import`, method: "GET" },
      { operation: "subscribers.import", url: `${ORIGIN}/api/v1/subscriber/add`, method: "POST", body: { ...importBody, sendEmail: true } },
      { operation: "subscribers.import", url: `${ORIGIN}/api/v1/subscriber/add`, method: "POST", body: { ...importBody, subscription: true } },
      { operation: "subscribers.import", url: `${ORIGIN}/api/v1/subscriber/add`, method: "POST", body: { ...importBody, email: "Reader@example.com" } },
      { operation: "subscribers.import", url: `${ORIGIN}/api/v1/subscriber/add`, method: "POST", body: { email: "reader@example.com" } },
      { operation: "subscribers.import", url: `${ORIGIN}/api/v1/import`, method: "POST", body: importBody },
      { operation: "subscribers.import", url: "https://substack.com/api/v1/subscriber/add", method: "POST", body: importBody },
    ] as const) {
      expect(() => authorizeSubstackSubscriberRequest({ ...binding, ...candidate })).toThrow();
    }
  });
});
