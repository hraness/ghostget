import { describe, expect, test } from "bun:test";

import { assertProperty, fc } from "../test-support";
import {
  authorizeSubstackSubscriberRequest,
  encodeSubstackSubscriberCursor,
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
  test("keeps all three operations capture-required with the frozen risks", () => {
    expect(SUBSTACK_WEB_OPERATIONS["subscribers.export"]).toMatchObject({
      effect: "read",
      risk: "R1",
      state: "capture-required",
      evidence: "none",
    });
    expect(SUBSTACK_WEB_OPERATIONS["subscribers.import"]).toMatchObject({
      effect: "write",
      risk: "R3",
      state: "capture-required",
      evidence: "none",
    });
    expect(SUBSTACK_WEB_OPERATIONS["subscribers.import.status"]).toMatchObject({
      effect: "read",
      risk: "R1",
      state: "capture-required",
      evidence: "none",
    });
  });
});

describe("Substack subscriber export projection", () => {
  test("projects only the contract fields and drops every other provider field", () => {
    const page = normalizeSubstackSubscriberPage({
      count: 3,
      subscribers: [
        row(0),
        row(1, {
          user_email_address: "Mixed.Case@Example.COM",
          subscription_interval: "annual",
          subscription_created_at: "2026-06-05T01:02:03.123456789+02:00",
          sections: [{ id: 9, name: "Notes" }, "Audio", "Audio"],
        }),
        row(2, { is_founding: true, subscription_created_at: null }),
      ],
      pendingImports: [],
      chartCounts: { subscribers: 3 },
      lastSync: "2026-06-23T05:35:09.172Z",
    }, { publicationId: PUBLICATION_ID, offset: 0, limit: 3, total: null });
    expect(page).toEqual({
      subscribers: [
        {
          email: "reader0@example.com",
          subscriptionType: "free",
          subscribedAt: "2026-06-04T19:51:29.324Z",
          sections: [],
        },
        {
          email: "mixed.case@example.com",
          subscriptionType: "paid",
          subscribedAt: "2026-06-04T23:02:03.123Z",
          sections: ["Audio", "Notes"],
        },
        {
          email: "reader2@example.com",
          subscriptionType: "founding",
          subscribedAt: null,
          sections: [],
        },
      ],
      nextCursor: null,
      total: 3,
    });
    for (const subscriber of page.subscribers) {
      expect(Object.keys(subscriber).sort()).toEqual(
        ["email", "sections", "subscribedAt", "subscriptionType"],
      );
    }
    expect(JSON.stringify(page)).not.toContain("Private Name");
    expect(JSON.stringify(page)).not.toContain("subscription_id");
  });

  test("maps gift, comp, and unreviewed intervals without guessing", () => {
    const page = normalizeSubstackSubscriberPage({
      count: 4,
      subscribers: [
        row(0, { is_gift: true, subscription_interval: "monthly" }),
        row(1, { is_comp: true }),
        row(2, { subscription_interval: "lifetime" }),
        row(3, { subscription_interval: null }),
      ],
    }, { publicationId: PUBLICATION_ID, offset: 0, limit: 4, total: null });
    expect(page.subscribers.map((subscriber) => subscriber.subscriptionType))
      .toEqual(["gift", "comp", "unknown", "unknown"]);
  });

  test("rejects malformed rows, oversized pages, and inconsistent totals", () => {
    const expected = { publicationId: PUBLICATION_ID, offset: 0, limit: 2, total: null };
    for (const value of [
      { count: 1, subscribers: [row(0, { user_email_address: "not-an-email" })] },
      { count: 1, subscribers: [row(0, { is_gift: "yes" })] },
      { count: 1, subscribers: [row(0, { subscription_created_at: "yesterday" })] },
      { count: 3, subscribers: [row(0), row(1), row(2)] },
      { count: 1, subscribers: [row(0), row(1)] },
      { count: 2, subscribers: [row(0), row(0)] },
      { count: 5, subscribers: [] },
      { count: -1, subscribers: [] },
      { count: "2", subscribers: [row(0)] },
      { subscribers: [row(0)] },
    ]) {
      expect(() => normalizeSubstackSubscriberPage(value, expected)).toThrow();
    }
    expect(() => normalizeSubstackSubscriberPage(
      { count: 9, subscribers: [row(0)] },
      { publicationId: PUBLICATION_ID, offset: 2, limit: 2, total: 8 },
    )).toThrow("total changed during pagination");
  });

  test("pages completely against the first-page total", () => {
    assertProperty(fc.property(
      fc.integer({ min: 0, max: 2_000 }),
      fc.integer({ min: 1, max: 100 }),
      (total, limit) => {
        let cursor: string | null = null;
        let offset = 0;
        let summed = 0;
        let pages = 0;
        const emails = new Set<string>();
        do {
          const prepared = prepareSubstackSubscriberExportInput(
            cursor === null ? { limit } : { cursor, limit },
          );
          const start = prepared.cursor?.offset ?? 0;
          expect(start).toBe(offset);
          const count = Math.min(limit, total - start);
          const page = normalizeSubstackSubscriberPage({
            count: total,
            subscribers: Array.from({ length: count }, (_, index) => row(start + index)),
          }, {
            publicationId: PUBLICATION_ID,
            offset: start,
            limit,
            total: prepared.cursor?.total ?? null,
          });
          expect(page.total).toBe(total);
          for (const subscriber of page.subscribers) emails.add(subscriber.email);
          summed += page.subscribers.length;
          offset += page.subscribers.length;
          cursor = page.nextCursor;
          pages += 1;
        } while (cursor !== null);
        expect(summed).toBe(total);
        expect(emails.size).toBe(total);
        expect(pages).toBe(Math.max(1, Math.ceil(total / limit)));
      },
    ));
  });

  test("round-trips only canonical publication-bound cursors", () => {
    assertProperty(fc.property(
      fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      fc.integer({ min: 2, max: 100_000_000 }),
      fc.integer({ min: 1, max: 99_999_999 }),
      (publicationId, total, rawOffset) => {
        const offset = 1 + (rawOffset % (total - 1));
        const encoded = encodeSubstackSubscriberCursor({ publicationId, offset, total });
        expect(parseSubstackSubscriberCursor(encoded)).toEqual({ publicationId, offset, total });
      },
    ));
    for (const value of [
      "",
      "ss1.7.0.5",
      "ss1.7.5.5",
      "ss1.07.1.5",
      "ss1.7.01.5",
      "ss2.7.1.5",
      "ss1.7.1.5 ",
      "ss1.0.1.5",
    ]) {
      expect(() => parseSubstackSubscriberCursor(value)).toThrow();
    }
  });

  test("validates export input exactly", () => {
    expect(prepareSubstackSubscriberExportInput({ limit: 100 })).toEqual({
      cursor: null,
      limit: 100,
      publicationOrigin: null,
    });
    expect(prepareSubstackSubscriberExportInput({
      limit: 50,
      publication_origin: ORIGIN,
    })).toMatchObject({ publicationOrigin: ORIGIN });
    for (const value of [
      {},
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { limit: "10" },
      { limit: 10, cursor: "opaque" },
      { limit: 10, offset: 0 },
      { limit: 10, publication_origin: "https://news.example.com" },
      [],
      null,
    ]) {
      expect(() => prepareSubstackSubscriberExportInput(value)).toThrow();
    }
  });
});

describe("Substack subscriber import validation", () => {
  test("accepts exactly one normalized address with welcome email suppressed", () => {
    const emails = ["reader@example.com"];
    expect(prepareSubstackSubscriberImportInput({ emails, send_welcome_email: false })).toEqual({
      emails,
      sendWelcomeEmail: false,
      publicationOrigin: null,
    });
  });

  test("rejects every invalid batch", () => {
    const valid = ["reader@example.com"];
    for (const value of [
      { emails: [], send_welcome_email: false },
      {
        emails: ["first@example.com", "second@example.com"],
        send_welcome_email: false,
      },
      { emails: ["reader@example.com", "reader@example.com"], send_welcome_email: false },
      { emails: ["Reader@example.com"], send_welcome_email: false },
      { emails: [" reader@example.com"], send_welcome_email: false },
      { emails: ["reader"], send_welcome_email: false },
      { emails: ["reader@localhost"], send_welcome_email: false },
      { emails: ["a..b@example.com"], send_welcome_email: false },
      { emails: ["a@b@example.com"], send_welcome_email: false },
      { emails: [7], send_welcome_email: false },
      { emails: valid, send_welcome_email: true },
      { emails: valid, send_welcome_email: "false" },
      { emails: valid, send_welcome_email: 0 },
      { emails: valid },
      { emails: valid, sendWelcomeEmail: false },
      { emails: valid, send_welcome_email: false, publication: "other" },
      { emails: "reader@example.com", send_welcome_email: false },
    ]) {
      expect(() => prepareSubstackSubscriberImportInput(value)).toThrow();
    }
  });

  test("never accepts a batch above the ceiling or with a repeated address", () => {
    assertProperty(fc.property(
      fc.uniqueArray(fc.integer({ min: 0, max: 10_000 }), { minLength: 1, maxLength: 40 }),
      fc.boolean(),
      (ids, repeat) => {
        const emails = ids.map((id) => `r${String(id)}@example.com`);
        if (repeat) emails.push(emails[0]!);
        const valid = emails.length === 1 && !repeat;
        const attempt = (): unknown => prepareSubstackSubscriberImportInput({
          emails,
          send_welcome_email: false,
        });
        if (valid) expect(attempt()).toMatchObject({ emails });
        else expect(attempt).toThrow();
      },
    ));
  });

  test("status input accepts only an optional bound publication origin", () => {
    expect(() => prepareSubstackSubscriberImportStatusInput({})).not.toThrow();
    expect(prepareSubstackSubscriberImportStatusInput({ publication_origin: ORIGIN })).toBe(ORIGIN);
    expect(() => prepareSubstackSubscriberImportStatusInput({ publication_origin: "https://news.example.com" })).toThrow();
    expect(() => prepareSubstackSubscriberImportStatusInput({ job: 1 })).toThrow();
    expect(() => prepareSubstackSubscriberImportStatusInput(null)).toThrow();
  });
});

describe("Substack import status projection", () => {
  test("projects only the observed latest import result from the instances envelope", () => {
    expect(normalizeSubstackSubscriberImportInstances({
      hasActiveListManagementModerationTask: false,
      latestImportResult: {
        total: 25,
        is_added: 21,
        is_skipped: 3,
        is_limited: 1,
        passImportVerification: true,
        upload_date: "2026-09-27T00:00:00.000Z",
      },
      pubImports: [{ file_name: "private.csv" }],
    })).toEqual({
      total: 25,
      isAdded: 21,
      isSkipped: 3,
      isLimited: 1,
      passImportVerification: true,
    });
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
    expect(soleSubstackSubscriberPublication(viewer([
      publication(),
      publication("https://second.substack.com", 8),
    ]), ORIGIN)).toMatchObject({ id: PUBLICATION_ID, origin: ORIGIN });
    expect(() => soleSubstackSubscriberPublication(viewer([
      publication(),
      publication("https://second.substack.com", 8),
    ]), "https://third.substack.com")).toThrow("matching");
    expect(() => soleSubstackSubscriberPublication(viewer([
      publication("https://news.example.com"),
    ]))).toThrow("own substack.com origin");
  });

  test("authorizes only the exact owned origin, method, path, and body", () => {
    const binding = { organization: "wrench-owned", publicationOrigin: ORIGIN } as const;
    const body = substackSubscriberStatsRequestBody(0, 100);
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
      emails: ["reader@example.com"],
      sendWelcomeEmail: false,
      publicationOrigin: null,
    });
    expect(importBody).toEqual({
      email: "reader@example.com",
      subscription: false,
      sendEmail: false,
    });
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
      { operation: "subscribers.import", url: `${ORIGIN}/api/v1/subscriber/add`, method: "POST", body: { ...importBody, sendEmail: true } },
      { operation: "subscribers.import", url: `${ORIGIN}/api/v1/subscriber/add`, method: "POST", body: { ...importBody, subscription: true } },
      { operation: "subscribers.import", url: "https://substack.com/api/v1/subscriber/add", method: "POST", body: importBody },
    ] as const) {
      expect(() => authorizeSubstackSubscriberRequest({ ...binding, ...candidate })).toThrow();
    }
  });
});
