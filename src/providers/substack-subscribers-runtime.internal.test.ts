import { afterAll, describe, expect, test } from "bun:test";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CookieRecordReader } from "@hraness/wordcell/clip/acquire";
import type { GhostgetAuth } from "../auth";
import type { OperationInput, WebSessionRecipe } from "../model";
import type { WebSessionDispatchEvent } from "../web-session-execution";
import {
  executeSubstackSubscriberOperation,
  executeSubstackWebOperation,
  substackSubscriberImportOperationId,
  type SubstackWebRuntimeDependencies,
} from "./substack-web-runtime";

const USER_ID = 42;
const PUBLICATION_ID = 7;
const ORIGIN = "https://wrench-owned.substack.com";
const cursorDirectory = mkdtempSync(join(tmpdir(), "ghostget-substack-cursor-test-"));
const cursorEnvironment = { ...process.env, GHOSTGET_STATE_HOME: cursorDirectory };
afterAll(() => rmSync(cursorDirectory, { recursive: true, force: true }));
const order = { by: "subscription_created_at", direction: "desc" };

const NONCE = "00000000-0000-4000-8000-000000000001";

const boundAuth = {
  schemaVersion: 1,
  id: "substack-test",
  kind: "cookie-source",
  source: "arc",
  profile: "Default",
  subject: `substack:${USER_ID}`,
} as const satisfies GhostgetAuth;

type CapturedRequest = {
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | null;
};

type Harness = {
  readonly calls: CapturedRequest[];
  readonly acquisitions: () => number;
  readonly dependencies: SubstackWebRuntimeDependencies;
};

function harness(
  handler: (request: CapturedRequest) => Response | Promise<Response>,
  publications: readonly Readonly<Record<string, unknown>>[] = [{
    id: PUBLICATION_ID,
    subdomain: "wrench-owned",
    primary_user_id: USER_ID,
    is_publication_primary_user: true,
  }],
  ownerOverrides: Readonly<Record<string, unknown>> = {},
): Harness {
  const calls: CapturedRequest[] = [];
  let acquisitions = 0;
  const acquireCookies: CookieRecordReader = () => {
    acquisitions += 1;
    return Promise.resolve({
      cookies: [{
        name: "substack.sid",
        value: "private-cookie-value",
        domain: ".substack.com",
        hostOnly: false,
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
        expires: 0,
      }],
      warnings: [],
    });
  };
  const fetch = (async (value: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof value === "string" ? value : value instanceof URL ? value.href : value.url);
    const request: CapturedRequest = {
      url,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : null,
    };
    calls.push(request);
    if (url.origin === "https://substack.com" && url.pathname === "/api/v1/am_i_logged_in") {
      return json({ loggedIn: true });
    }
    if (url.origin === "https://substack.com" && url.pathname === "/") {
      const payload = JSON.stringify({
        user: { id: USER_ID, handle: "owner", name: "Owner", dashboard_pubs: publications },
      });
      return new Response(
        `<script>window._preloads = JSON.parse(${JSON.stringify(payload)});</script>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    if (url.origin === ORIGIN && url.pathname === "/publish/subscribers") {
      const payload = JSON.stringify({
        user: { id: USER_ID, is_admin: true, is_author: true, is_ghost: false },
        publication: { id: PUBLICATION_ID, subdomain: "wrench-owned" },
        pub: { id: PUBLICATION_ID, subdomain: "wrench-owned", author_id: USER_ID, primary_user_id: null },
        ...ownerOverrides,
      });
      return new Response(`<script>window._preloads = JSON.parse(${JSON.stringify(payload)});</script>`, { status: 200, headers: { "content-type": "text/html" } });
    }
    return handler(request);
  }) as typeof globalThis.fetch;
  return {
    calls,
    acquisitions: () => acquisitions,
    dependencies: { acquireCookies, fetch, operationNonce: () => NONCE, cursorEnvironment },
  };
}

function json(value: unknown, status = 200): Response {
  if (typeof value === "object" && value !== null && "subscribers" in value) value = { order, ...value };
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function recipe(action: WebSessionRecipe["action"]): WebSessionRecipe {
  return {
    site: "substack",
    action,
    contractVersion: 2,
    timeoutMs: 1_000,
    maxOutputBytes: 8 * 1024 * 1024,
  };
}

function subscriberRow(index: number): Record<string, unknown> {
  return {
    user_id: index,
    user_email_address: `reader${String(index)}@example.com`,
    user_name: "Private Name",
    subscription_created_at: "2026-06-04T19:51:29.324Z",
    subscription_interval: "free",
    is_founding: false,
    is_gift: false,
    is_comp: false,
  };
}

const PUBLICATION = "wrench-owned";

function statusResponse(): Response {
  return json({
    hasActiveListManagementModerationTask: false,
    latestImportResult: {
      total: 25,
      is_added: 21,
      is_skipped: 3,
      is_limited: 1,
      passImportVerification: true,
      upload_date: "2026-09-27T00:00:00.123456789Z",
    },
    pubImports: [{ file_name: "private.csv" }],
  });
}

function importInput(emails: readonly string[] = ["reader@example.com"]): OperationInput {
  return { publication: PUBLICATION, emails: [...emails], send_welcome_email: false } as OperationInput;
}

type ExportOutput = {
  subscribers: { email: string; subscriptionType: string; subscribedAt: string | null }[];
  nextCursor: string | null;
  total: number;
  complete: boolean;
  completeness: { kind: string; reason: string };
  continuationSupported: boolean;
  stopReason: string | null;
};

async function exportAll(
  fixture: Harness,
  limit: number,
  pageLimit = 20,
): Promise<{ pages: ExportOutput[]; offsets: number[] }> {
  const pages: ExportOutput[] = [];
  let cursor: string | null = null;
  do {
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.export"),
      cursor === null ? { publication: PUBLICATION, limit } : { publication: PUBLICATION, cursor, limit },
      boundAuth,
      { dependencies: fixture.dependencies },
    );
    expect(result.status).toBe("succeeded");
    const output = result.output as ExportOutput;
    pages.push(output);
    cursor = output.nextCursor;
  } while (cursor !== null && pages.length < pageLimit);
  const offsets = fixture.calls
    .filter((call) => call.url.pathname === "/api/v1/subscriber-stats")
    .map((call) => (JSON.parse(call.body ?? "null") as { offset: number }).offset);
  return { pages, offsets };
}

function unexpected(request: CapturedRequest): never {
  throw new Error(`unexpected ${request.method} ${request.url.href}`);
}

describe("Substack subscriber runtime", () => {
  test("public dispatcher adds through the observed import only after owner binding", async () => {
    const fixture = harness((request) => {
      if (request.url.href !== `${ORIGIN}/api/v1/subscriber/add`) unexpected(request);
      return json({});
    });
    const result = await executeSubstackWebOperation(
      recipe("subscribers.import"),
      importInput(),
      boundAuth,
      { dependencies: fixture.dependencies },
    );
    expect(result).toMatchObject({ status: "succeeded", output: { accepted: true }, dispatch: { planned: 1, started: 1, verified: 1 } });
    expect(fixture.calls.filter((call) => call.url.pathname === "/api/v1/subscriber/add")).toHaveLength(1);
  });

  test("public dispatcher still refuses the archived v1 subscriber routes", async () => {
    for (const action of ["subscribers.export", "subscribers.import", "subscribers.import.status"] as const) {
      const fixture = harness(unexpected);
      await expect(executeSubstackWebOperation(
        { ...recipe(action), contractVersion: 1 },
        {} as OperationInput,
        boundAuth,
        { dependencies: fixture.dependencies },
      )).rejects.toThrow("contract version 1 is not installed");
      expect(fixture.calls).toEqual([]);
    }
  });

  test("public dispatcher runs the observed export and import-status reads", async () => {
    const fixture = harness((request) => {
      if (request.url.href === `${ORIGIN}/api/v1/subscriber-stats`) {
        return json({ count: 1, subscribers: [subscriberRow(0)] });
      }
      if (request.url.href === `${ORIGIN}/api/v1/import/instances`) return statusResponse();
      return unexpected(request);
    });
    const exported = await executeSubstackWebOperation(
      recipe("subscribers.export"),
      { publication: PUBLICATION, limit: 100 },
      boundAuth,
      { dependencies: fixture.dependencies },
    );
    expect(exported).toMatchObject({
      status: "succeeded",
      output: {
        subscribers: [{
          email: "reader0@example.com",
          subscriptionType: "free",
          subscribedAt: "2026-06-04T19:51:29.324Z",
        }],
        nextCursor: null,
        total: 1,
        complete: true,
        completeness: { kind: "census" },
        continuationSupported: false,
        stopReason: "provider-exhausted",
      },
    });
    const status = await executeSubstackWebOperation(
      recipe("subscribers.import.status"),
      { publication: PUBLICATION },
      boundAuth,
      { dependencies: fixture.dependencies },
    );
    expect(status).toMatchObject({
      status: "succeeded",
      output: { total: 25, isAdded: 21, isSkipped: 3, isLimited: 1, passImportVerification: true },
    });
  });

  test("exports a complete census with exact overlapping POSTs and no repeated address", async () => {
    const total = 5;
    const fixture = harness((request) => {
      if (request.url.origin !== ORIGIN || request.url.pathname !== "/api/v1/subscriber-stats") {
        unexpected(request);
      }
      expect(request.method).toBe("POST");
      expect(request.headers.get("content-type")).toBe("application/json");
      expect(request.headers.get("referer")).toBe(`${ORIGIN}/publish/subscribers`);
      const body = JSON.parse(request.body ?? "null") as { offset: number; limit: number };
      expect(request.body).toBe(JSON.stringify({
        filters: { order_by_desc_nulls_last: "subscription_created_at" },
        limit: 2,
        offset: body.offset,
        includeTags: true,
      }));
      const rows = Array.from(
        { length: Math.min(body.limit, total - body.offset) },
        (_, index) => subscriberRow(body.offset + index),
      );
      return json({ count: total, subscribers: rows, pendingImports: [] });
    });
    const { pages, offsets } = await exportAll(fixture, 2);
    // A two-row page can rewind only one row, so each page advances by one.
    expect(offsets).toEqual([0, 1, 2, 3]);
    const emails = pages.flatMap((page) => page.subscribers.map((row) => row.email));
    expect(emails).toEqual([0, 1, 2, 3, 4].map((index) => `reader${String(index)}@example.com`));
    expect(pages.slice(0, -1).every((page) => !page.complete && page.stopReason === null)).toBe(true);
    expect(pages.at(-1)).toMatchObject({ complete: true, stopReason: "provider-exhausted", nextCursor: null });
    expect(JSON.stringify(fixture.calls.map((call) => call.body))).not.toContain("private-cookie-value");
  });

  test("recovers the live 373-row census across reordered equal nine-digit timestamps", async () => {
    const total = 373;
    const timestamp = "2026-06-04T19:51:29.324567891+00:00";
    let request = 0;
    const fixture = harness((call) => {
      if (call.url.href !== `${ORIGIN}/api/v1/subscriber-stats`) unexpected(call);
      const body = JSON.parse(call.body ?? "null") as { offset: number; limit: number };
      request += 1;
      // Every row shares one signup instant, so each request may swap the rows
      // on either side of a page boundary, as the live dashboard did.
      const order = Array.from({ length: total }, (_, index) => index);
      if (request % 2 === 0) {
        for (let boundary = 90; boundary + 1 < total; boundary += 90) {
          [order[boundary - 1], order[boundary]] = [order[boundary]!, order[boundary - 1]!];
        }
      }
      const rows = order.slice(body.offset, body.offset + body.limit).map((index) => ({
        ...subscriberRow(index),
        subscription_created_at: timestamp,
      }));
      return json({ count: total, subscribers: rows });
    });
    const { pages, offsets } = await exportAll(fixture, 100);
    expect(offsets).toEqual([0, 90, 180, 270, 360]);
    const emails = pages.flatMap((page) => page.subscribers.map((row) => row.email));
    expect(emails).toHaveLength(total);
    expect(new Set(emails).size).toBe(total);
    expect(pages.flatMap((page) => page.subscribers).every((row) => row.subscribedAt === "2026-06-04T19:51:29.324Z")).toBe(true);
    expect(pages.at(-1)).toMatchObject({ complete: true, completeness: { kind: "census" }, stopReason: "provider-exhausted" });
  });

  test("reports census-mismatch instead of complete when exhaustion misses an address", async () => {
    const total = 4;
    let request = 0;
    const fixture = harness((call) => {
      const body = JSON.parse(call.body ?? "null") as { offset: number; limit: number };
      request += 1;
      // The second page hides row 2 behind a repeat of row 1 that falls
      // outside the one-row overlap window.
      const rows = request === 1
        ? [subscriberRow(0), subscriberRow(1)]
        : request === 2
          ? [subscriberRow(1), subscriberRow(0)]
          : [subscriberRow(0), subscriberRow(3)].slice(0, total - body.offset);
      return json({ count: total, subscribers: rows });
    });
    const { pages } = await exportAll(fixture, 2);
    expect(pages.at(-1)).toMatchObject({
      complete: false,
      completeness: { kind: "page" },
      stopReason: "census-mismatch",
      nextCursor: null,
    });
  });

  test("fails an export page closed when the total changes or the cursor names another publication", async () => {
    const first = harness(() => json({ count: 5, subscribers: [subscriberRow(0), subscriberRow(1)] }));
    const initial = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: PUBLICATION, limit: 2 }, boundAuth, { dependencies: first.dependencies });
    const cursor = (initial.output as { nextCursor: string }).nextCursor;
    const fixture = harness(() => json({ count: 6, subscribers: [subscriberRow(1), subscriberRow(2)] }));
    const changed = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: PUBLICATION, cursor, limit: 2 }, boundAuth, { dependencies: fixture.dependencies });
    expect(changed).toMatchObject({ status: "failed", output: null, dispatchStarted: false });
    expect(changed.readFailure?.category).toBe("contract-drift");

    const other = harness(unexpected, [{ id: 8, subdomain: "other", primary_user_id: USER_ID, is_publication_primary_user: true }]);
    const mismatch = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: PUBLICATION, cursor, limit: 2 }, boundAuth, { dependencies: other.dependencies });
    expect(mismatch.readFailure?.category).toBe("account-mismatch");
    expect(other.calls.map((call) => call.url.pathname)).toEqual(["/api/v1/am_i_logged_in", "/"]);
  });

  test("rejects tampered, legacy, and different-account cursors before cookies or network", async () => {
    const first = harness(() => json({ count: 5, subscribers: [subscriberRow(0), subscriberRow(1)] }));
    const initial = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: PUBLICATION, limit: 2 }, boundAuth, { dependencies: first.dependencies });
    const cursor = (initial.output as { nextCursor: string }).nextCursor;
    const fixture = harness(unexpected);
    for (const invalid of ["ss1.7.2.5", `${cursor.slice(0, 20)}${cursor[20] === "A" ? "B" : "A"}${cursor.slice(21)}`]) {
      await expect(executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: PUBLICATION, cursor: invalid, limit: 2 }, boundAuth, { dependencies: fixture.dependencies })).rejects.toThrow();
    }
    await expect(executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: PUBLICATION, cursor, limit: 2 }, { ...boundAuth, id: "other-account" }, { dependencies: fixture.dependencies })).rejects.toThrow();
    expect(fixture.acquisitions()).toBe(0);
    expect(fixture.calls).toEqual([]);
  });

  test("rejects an address repeated within one page", async () => {
    const fixture = harness(() => json({ count: 3, subscribers: [subscriberRow(0), subscriberRow(0)] }));
    const result = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: PUBLICATION, limit: 2 }, boundAuth, { dependencies: fixture.dependencies });
    expect(result).toMatchObject({ status: "failed", output: null, dispatchStarted: false });
  });

  test("keeps the largest continuation under its token ceiling and stops at the row bound", async () => {
    const limits: number[] = [];
    const fixture = harness((request) => {
      const body = JSON.parse(request.body ?? "null") as { offset: number; limit: number };
      limits.push(body.limit);
      return json({ count: 501, subscribers: Array.from({ length: body.limit }, (_, index) => subscriberRow(body.offset + index)) });
    });
    const { pages } = await exportAll(fixture, 100);
    for (const page of pages.slice(0, -1)) {
      expect(page.nextCursor!.length).toBeLessThanOrEqual(8192);
      expect(page.nextCursor).not.toContain("reader");
    }
    expect(pages.reduce((sum, page) => sum + page.subscribers.length, 0)).toBe(500);
    expect(pages.at(-1)).toMatchObject({ complete: false, continuationSupported: false, stopReason: "row-limit" });
    expect(limits).toEqual([100, 100, 100, 100, 100, 50]);
  });

  test("requires matching author/admin ownership before every subscriber exchange", async () => {
    for (const ownerOverrides of [
      { user: { id: USER_ID, is_admin: false, is_author: true, is_ghost: false } },
      { user: { id: USER_ID, is_admin: true, is_author: false, is_ghost: false } },
      { user: { id: USER_ID + 1, is_admin: true, is_author: true, is_ghost: false } },
      { user: { id: USER_ID, is_admin: true, is_author: true, is_ghost: true } },
      { pub: { id: PUBLICATION_ID, subdomain: PUBLICATION, author_id: USER_ID + 1, primary_user_id: null } },
      { pub: { id: PUBLICATION_ID, subdomain: PUBLICATION, author_id: USER_ID, primary_user_id: USER_ID + 1 } },
      { publication: { id: PUBLICATION_ID + 1, subdomain: PUBLICATION } },
    ]) {
      for (const [action, input] of [
        ["subscribers.export", { publication: PUBLICATION, limit: 2 }],
        ["subscribers.import.status", { publication: PUBLICATION }],
      ] as const) {
        const fixture = harness(unexpected, undefined, ownerOverrides);
        const result = await executeSubstackSubscriberOperation(recipe(action), input, boundAuth, { dependencies: fixture.dependencies });
        expect(result).toMatchObject({ status: "failed", output: null, dispatchStarted: false });
        expect(result.readFailure?.category).toBe("account-mismatch");
        expect(fixture.calls.map((call) => call.url.pathname)).toEqual(["/api/v1/am_i_logged_in", "/", "/publish/subscribers"]);
      }
      const fixture = harness(unexpected, undefined, ownerOverrides);
      let dispatches = 0;
      await expect(executeSubstackSubscriberOperation(recipe("subscribers.import"), importInput(), boundAuth, {
        dependencies: fixture.dependencies,
        beforeDispatch: () => {
          dispatches += 1;
          return Promise.resolve();
        },
      })).rejects.toThrow("author/admin");
      expect(dispatches).toBe(0);
      expect(fixture.calls.some((call) => call.url.pathname === "/api/v1/subscriber/add")).toBe(false);
    }
  });

  test("selects only the named dashboard publication when the account has several", async () => {
    const fixture = harness(() => json({ count: 1, subscribers: [subscriberRow(0)] }), [
      { id: 8, subdomain: "other-publication", primary_user_id: null, is_publication_primary_user: false },
      { id: PUBLICATION_ID, subdomain: PUBLICATION, primary_user_id: null, is_publication_primary_user: false },
    ]);
    const result = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: PUBLICATION, limit: 2 }, boundAuth, { dependencies: fixture.dependencies });
    expect(result).toMatchObject({ status: "succeeded", output: { complete: true, stopReason: "provider-exhausted" } });
    expect(fixture.calls.every((call) => call.url.hostname !== "other-publication.substack.com")).toBe(true);
  });

  test("refuses an absent, ambiguous, or custom-domain publication as account mismatch", async () => {
    for (const publications of [
      [],
      [{ id: 7, subdomain: "one" }, { id: 8, subdomain: "two" }],
      [{ id: 7, base_url: "https://news.example.com" }],
    ]) {
      const fixture = harness(unexpected, publications);
      const result = await executeSubstackSubscriberOperation(
        recipe("subscribers.import.status"),
        { publication: PUBLICATION },
        boundAuth,
        { dependencies: fixture.dependencies },
      );
      expect(result.readFailure?.category).toBe("account-mismatch");
    }
  });

  test("reads import status with one exact body-less GET and projects only its counts", async () => {
    const fixture = harness((request) => {
      if (request.url.href !== `${ORIGIN}/api/v1/import/instances` || request.method !== "GET") unexpected(request);
      expect(request.body).toBeNull();
      expect(request.headers.get("referer")).toBe(`${ORIGIN}/publish/subscribers`);
      return statusResponse();
    });
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.import.status"),
      { publication: PUBLICATION },
      boundAuth,
      { dependencies: fixture.dependencies },
    );
    expect(result.status).toBe("succeeded");
    expect(result.output).toEqual({
      total: 25,
      isAdded: 21,
      isSkipped: 3,
      isLimited: 1,
      passImportVerification: true,
    });
  });

  test("rejects every invalid import before any cookie, keychain, or network access", async () => {
    const valid = ["reader@example.com"];
    for (const input of [
      { publication: PUBLICATION, emails: [], send_welcome_email: false },
      { publication: PUBLICATION, emails: ["a@example.com", "b@example.com"], send_welcome_email: false },
      { publication: PUBLICATION, emails: ["reader@example.com", "reader@example.com"], send_welcome_email: false },
      { publication: PUBLICATION, emails: "reader@example.com", send_welcome_email: false },
      { publication: PUBLICATION, emails: ["not an email"], send_welcome_email: false },
      { publication: PUBLICATION, emails: ["Reader@Example.com"], send_welcome_email: false },
      { publication: PUBLICATION, emails: [" reader@example.com"], send_welcome_email: false },
      { publication: PUBLICATION, emails: valid, send_welcome_email: true },
      { publication: PUBLICATION, emails: valid, send_welcome_email: "false" },
      { publication: PUBLICATION, emails: valid },
      { emails: valid, send_welcome_email: false },
      { publication: "Wrench-Owned", emails: valid, send_welcome_email: false },
      { publication: "https://wrench-owned.substack.com", emails: valid, send_welcome_email: false },
      { publication: PUBLICATION, emails: valid, send_welcome_email: false, extra: "x" },
    ]) {
      const fixture = harness(unexpected);
      let dispatches = 0;
      await expect(executeSubstackSubscriberOperation(
        recipe("subscribers.import"),
        input as unknown as OperationInput,
        boundAuth,
        {
          dependencies: fixture.dependencies,
          beforeDispatch: () => {
            dispatches += 1;
            return Promise.resolve();
          },
        },
      )).rejects.toThrow();
      expect(fixture.acquisitions()).toBe(0);
      expect(fixture.calls).toEqual([]);
      expect(dispatches).toBe(0);
    }
  });

  test("an import naming a publication the viewer does not list never dispatches", async () => {
    const fixture = harness(unexpected);
    await expect(executeSubstackSubscriberOperation(
      recipe("subscribers.import"),
      { publication: "not-owned", emails: ["reader@example.com"], send_welcome_email: false },
      boundAuth,
      { dependencies: fixture.dependencies },
    )).rejects.toThrow("absent or ambiguous");
    expect(fixture.calls.some((call) => call.url.pathname === "/api/v1/subscriber/add")).toBe(false);
  });

  test("adds one address with the exact observed body and acknowledges only an empty object", async () => {
    const emails = ["a@example.com"];
    const events: string[] = [];
    const fixture = harness((request) => {
      if (request.url.href !== `${ORIGIN}/api/v1/subscriber/add` || request.method !== "POST") unexpected(request);
      events.push("dispatch");
      expect(request.body).toBe(JSON.stringify({ email: "a@example.com", subscription: false, sendEmail: false }));
      expect(request.headers.get("referer")).toBe(`${ORIGIN}/publish/subscribers`);
      return json({});
    });
    const accepted: string[] = [];
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.import"),
      importInput(emails),
      boundAuth,
      {
        dependencies: fixture.dependencies,
        beforeDispatch: (event: WebSessionDispatchEvent) => {
          events.push(`before:${event.id}:${String(event.progress.started)}`);
          return Promise.resolve();
        },
        afterProviderAcceptedMutationTarget: (event) => {
          accepted.push(event.target.identifier);
          return Promise.resolve();
        },
        afterDispatchVerified: () => {
          events.push("verified");
          return Promise.resolve();
        },
      },
    );
    const operationId = substackSubscriberImportOperationId({
      publicationId: PUBLICATION_ID,
      viewerId: USER_ID,
      plan: { publication: PUBLICATION, emails, sendWelcomeEmail: false },
      nonce: NONCE,
    });
    expect(operationId).toMatch(/^[0-9a-f]{64}$/u);
    expect(result).toEqual({
      status: "succeeded",
      output: { accepted: true, operationId },
      finalUrl: `${ORIGIN}/publish/subscribers`,
      dispatchStarted: true,
      dispatch: { planned: 1, started: 1, verified: 1 },
    });
    expect(events).toEqual(["before:subscribers.import:0", "dispatch", "verified"]);
    expect(accepted).toEqual([
      JSON.stringify({ emailCount: 1, operationId, publicationId: PUBLICATION_ID }),
    ]);
    const paths = fixture.calls.map((call) => call.url.pathname);
    // The owner binding is proved before the one add request, which is last.
    expect(paths.indexOf("/publish/subscribers")).toBeGreaterThan(-1);
    expect(paths.indexOf("/publish/subscribers")).toBeLessThan(paths.indexOf("/api/v1/subscriber/add"));
    expect(paths.at(-1)).toBe("/api/v1/subscriber/add");
    expect(fixture.calls.filter((call) => call.url.pathname === "/api/v1/subscriber/add")).toHaveLength(1);
  });

  test("returns reconcile-required after exactly one request for every ambiguous outcome", async () => {
    for (const respond of [
      () => json({ error: "busy" }, 502),
      () => json({ error: "busy" }, 503),
      () => json([], 200),
      () => json(null, 200),
      () => json({ ok: true }, 200),
      () => new Response("{", { status: 200, headers: { "content-type": "application/json" } }),
      () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
      () => {
        throw new TypeError("socket closed");
      },
    ]) {
      let imports = 0;
      const fixture = harness((request) => {
        if (request.url.pathname !== "/api/v1/subscriber/add") unexpected(request);
        imports += 1;
        return respond();
      });
      let verified = 0;
      const result = await executeSubstackSubscriberOperation(
        recipe("subscribers.import"),
        importInput(),
        boundAuth,
        {
          dependencies: fixture.dependencies,
          afterDispatchVerified: () => {
            verified += 1;
            return Promise.resolve();
          },
        },
      );
      expect(imports).toBe(1);
      expect(verified).toBe(0);
      expect(result.status).toBe("indeterminate");
      expect(result.output).toBeNull();
      expect(result.dispatchStarted).toBe(true);
      expect(result.dispatch).toEqual({ planned: 1, started: 1, verified: 0 });
      expect(result.error).toStartWith("reconcile-required:");
      expect(result.error).toContain("subscribers.export");
      expect(result.error).not.toContain("reader@example.com");
      expect(result.readFailure).toBeUndefined();
    }
  });

  test("keeps a 4xx on the add request indeterminate after exactly one request", async () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      let imports = 0;
      const fixture = harness((request) => {
        if (request.url.pathname !== "/api/v1/subscriber/add") unexpected(request);
        imports += 1;
        return json({ error: "Private provider detail reader@example.com" }, status);
      });
      const result = await executeSubstackSubscriberOperation(
        recipe("subscribers.import"),
        importInput(),
        boundAuth,
        { dependencies: fixture.dependencies },
      );
      expect(imports).toBe(1);
      expect(result).toMatchObject({
        status: "indeterminate",
        output: null,
        dispatchStarted: true,
        dispatch: { planned: 1, started: 1, verified: 0 },
      });
      expect(result.error).toStartWith("reconcile-required:");
      expect(result.error).toContain(`(stage: import-rejected, HTTP ${String(status)})`);
      expect(result.error).not.toContain("reader@example.com");
      expect(result.error).not.toContain("Private provider detail");
    }
  });

  test("an import whose dispatch admission fails never reaches the provider", async () => {
    const fixture = harness(unexpected);
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.import"),
      importInput(),
      boundAuth,
      {
        dependencies: fixture.dependencies,
        beforeDispatch: () => Promise.reject(new Error("ledger unavailable")),
      },
    );
    expect(result).toMatchObject({
      status: "failed",
      dispatchStarted: false,
      dispatch: { planned: 1, started: 0, verified: 0 },
    });
    expect(fixture.calls.some((call) => call.url.pathname === "/api/v1/subscriber/add")).toBe(false);
  });
});
