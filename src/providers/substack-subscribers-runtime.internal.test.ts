import { afterAll, describe, expect, test } from "bun:test";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CookieRecordReader } from "@hraness/kb/clip/acquire";
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
    contractVersion: action === "subscribers.export" ? 2 : 1,
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

function unexpected(request: CapturedRequest): never {
  throw new Error(`unexpected ${request.method} ${request.url.href}`);
}

describe("Substack subscriber runtime", () => {
  test("public dispatcher refuses every capture-required subscriber operation before cookies or network", async () => {
    for (const [action, input] of [
      ["subscribers.export", { publication: "wrench-owned", limit: 10 }],
      ["subscribers.import", { emails: ["reader@example.com"], send_welcome_email: false }],
      ["subscribers.import.status", {}],
    ] as const) {
      const fixture = harness(unexpected);
      await expect(executeSubstackWebOperation(
        recipe(action),
        input as OperationInput,
        boundAuth,
        { dependencies: fixture.dependencies },
      )).rejects.toThrow("capture-required");
      expect(fixture.acquisitions()).toBe(0);
      expect(fixture.calls).toEqual([]);
    }
  });

  test("exports every page of the bound publication with one exact POST per page", async () => {
    const total = 5;
    const fixture = harness((request) => {
      if (request.url.origin !== ORIGIN || request.url.pathname !== "/api/v1/subscriber-stats") {
        unexpected(request);
      }
      expect(request.method).toBe("POST");
      expect(request.headers.get("content-type")).toBe("application/json");
      expect(request.headers.get("referer")).toBe(`${ORIGIN}/publish/subscribers`);
      const body = JSON.parse(request.body ?? "null") as { filters: unknown; offset: number; limit: number; includeTags: true };
      expect(body).toEqual({
        filters: { order_by_desc_nulls_last: "subscription_created_at" },
        limit: 2,
        offset: body.offset,
        includeTags: true,
      });
      const rows = Array.from(
        { length: Math.min(body.limit, total - body.offset) },
        (_, index) => subscriberRow(body.offset + index),
      );
      return json({ count: total, subscribers: rows, pendingImports: [] });
    });
    const emails: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const result = await executeSubstackSubscriberOperation(
        recipe("subscribers.export"),
        cursor === null ? { publication: "wrench-owned", limit: 2 } : { publication: "wrench-owned", cursor, limit: 2 },
        boundAuth,
        { dependencies: fixture.dependencies },
      );
      expect(result.status).toBe("succeeded");
      expect(result.dispatchStarted).toBe(false);
      expect(result.finalUrl).toBe(`${ORIGIN}/publish/subscribers`);
      const output = result.output as {
        subscribers: { email: string }[];
        nextCursor: string | null;
        total: number;
      };
      expect(output.total).toBe(total);
      emails.push(...output.subscribers.map((subscriber) => subscriber.email));
      cursor = output.nextCursor;
      pages += 1;
    } while (cursor !== null);
    expect(pages).toBe(3);
    expect(emails).toEqual([0, 1, 2, 3, 4].map((index) => `reader${String(index)}@example.com`));
    expect(JSON.stringify(fixture.calls.map((call) => call.body))).not.toContain("private-cookie-value");
  });

  test("fails an export page closed when the total changes or the cursor names another publication", async () => {
    const first = harness(() => json({ count: 5, subscribers: [subscriberRow(0), subscriberRow(1)] }));
    const initial = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", limit: 2 }, boundAuth, { dependencies: first.dependencies });
    const cursor = (initial.output as { nextCursor: string }).nextCursor;
    const fixture = harness(() => json({ count: 6, subscribers: [subscriberRow(2)] }));
    const changed = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", cursor, limit: 2 }, boundAuth, { dependencies: fixture.dependencies });
    expect(changed).toMatchObject({ status: "failed", output: null, dispatchStarted: false });
    expect(changed.readFailure?.category).toBe("contract-drift");

    const other = harness(unexpected, [{ id: 8, subdomain: "other", primary_user_id: USER_ID, is_publication_primary_user: true }]);
    const mismatch = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", cursor, limit: 2 }, boundAuth, { dependencies: other.dependencies });
    expect(mismatch.readFailure?.category).toBe("account-mismatch");
    expect(other.calls.map((call) => call.url.pathname)).toEqual(["/api/v1/am_i_logged_in", "/"]);
  });

  test("rejects tampered, legacy, and different-account cursors before cookies or network", async () => {
    const first = harness(() => json({ count: 5, subscribers: [subscriberRow(0), subscriberRow(1)] }));
    const initial = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", limit: 2 }, boundAuth, { dependencies: first.dependencies });
    const cursor = (initial.output as { nextCursor: string }).nextCursor;
    const fixture = harness(unexpected);
    for (const invalid of ["ss1.7.2.5", `${cursor.slice(0, 20)}${cursor[20] === "A" ? "B" : "A"}${cursor.slice(21)}`]) {
      await expect(executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", cursor: invalid, limit: 2 }, boundAuth, { dependencies: fixture.dependencies })).rejects.toThrow();
    }
    await expect(executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", cursor, limit: 2 }, { ...boundAuth, id: "other-account" }, { dependencies: fixture.dependencies })).rejects.toThrow();
    expect(fixture.acquisitions()).toBe(0);
    expect(fixture.calls).toEqual([]);
  });

  test("rejects repeated rows across pages and keeps terminal results explicitly incomplete", async () => {
    let page = 0;
    const fixture = harness(() => json({ count: 3, subscribers: page++ === 0 ? [subscriberRow(0), subscriberRow(1)] : [subscriberRow(0)] }));
    const initial = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", limit: 2 }, boundAuth, { dependencies: fixture.dependencies });
    expect(initial.output).toMatchObject({ complete: false, completeness: { kind: "page" } });
    const duplicate = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", cursor: (initial.output as { nextCursor: string }).nextCursor, limit: 2 }, boundAuth, { dependencies: fixture.dependencies });
    expect(duplicate).toMatchObject({ status: "failed", output: null, dispatchStarted: false });
  });

  test("keeps the largest continuation under its token ceiling and stops at the row bound", async () => {
    const limits: number[] = [];
    const fixture = harness((request) => {
      const body = JSON.parse(request.body ?? "null") as { offset: number; limit: number };
      limits.push(body.limit);
      return json({ count: 501, subscribers: Array.from({ length: body.limit }, (_, index) => subscriberRow(body.offset + index)) });
    });
    let cursor: string | null = null;
    let rows = 0;
    do {
      const result = await executeSubstackSubscriberOperation(recipe("subscribers.export"), cursor === null ? { publication: "wrench-owned", limit: 49 } : { publication: "wrench-owned", limit: 49, cursor }, boundAuth, { dependencies: fixture.dependencies });
      expect(result.status).toBe("succeeded");
      const output = result.output as { subscribers: unknown[]; nextCursor: string | null; complete: boolean; continuationSupported: boolean; stopReason: string | null };
      rows += output.subscribers.length;
      expect(output.complete).toBe(false);
      cursor = output.nextCursor;
      if (cursor !== null) {
        expect(cursor.length).toBeLessThanOrEqual(8192);
        expect(cursor).not.toContain("reader");
      } else {
        expect(output.continuationSupported).toBe(false);
        expect(output.stopReason).toBe("row-limit");
      }
    } while (cursor !== null);
    expect(rows).toBe(500);
    expect(limits).toEqual([...Array.from({ length: 10 }, () => 49), 10]);
  });

  test("requires matching author/admin ownership from the selected publication dashboard", async () => {
    for (const ownerOverrides of [
      { user: { id: USER_ID, is_admin: false, is_author: true, is_ghost: false } },
      { user: { id: USER_ID, is_admin: true, is_author: false, is_ghost: false } },
      { user: { id: USER_ID + 1, is_admin: true, is_author: true, is_ghost: false } },
      { user: { id: USER_ID, is_admin: true, is_author: true, is_ghost: true } },
      { pub: { id: PUBLICATION_ID, subdomain: "wrench-owned", author_id: USER_ID + 1, primary_user_id: null } },
      { pub: { id: PUBLICATION_ID, subdomain: "wrench-owned", author_id: USER_ID, primary_user_id: USER_ID + 1 } },
      { publication: { id: PUBLICATION_ID + 1, subdomain: "wrench-owned" } },
    ]) {
      const fixture = harness(unexpected, undefined, ownerOverrides);
      const result = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", limit: 2 }, boundAuth, { dependencies: fixture.dependencies });
      expect(result).toMatchObject({ status: "failed", output: null, dispatchStarted: false });
      expect(result.readFailure?.category).toBe("account-mismatch");
      expect(fixture.calls.map((call) => call.url.pathname)).toEqual(["/api/v1/am_i_logged_in", "/", "/publish/subscribers"]);
    }
  });

  test("selects only the named dashboard publication when the account has several", async () => {
    const fixture = harness(() => json({ count: 1, subscribers: [subscriberRow(0)] }), [
      { id: 8, subdomain: "other-publication", primary_user_id: null, is_publication_primary_user: false },
      { id: PUBLICATION_ID, subdomain: "wrench-owned", primary_user_id: null, is_publication_primary_user: false },
    ]);
    const result = await executeSubstackSubscriberOperation(recipe("subscribers.export"), { publication: "wrench-owned", limit: 2 }, boundAuth, { dependencies: fixture.dependencies });
    expect(result).toMatchObject({ status: "succeeded", output: { complete: false, stopReason: "provider-exhausted" } });
    expect(fixture.calls.every((call) => call.url.hostname !== "other-publication.substack.com")).toBe(true);
  });

  test("refuses an ambiguous or custom-domain publication binding as account mismatch", async () => {
    for (const publications of [
      [],
      [
        { id: 7, subdomain: "one" },
        { id: 8, subdomain: "two" },
      ],
      [{ id: 7, base_url: "https://news.example.com" }],
    ]) {
      const fixture = harness(unexpected, publications);
      const result = await executeSubstackSubscriberOperation(
        recipe("subscribers.import.status"),
        {},
        boundAuth,
        { dependencies: fixture.dependencies },
      );
      expect(result.readFailure?.category).toBe("account-mismatch");
    }
  });

  test("projects the exact import status and nothing else", async () => {
    const fixture = harness((request) => {
      if (request.url.href !== `${ORIGIN}/api/v1/import` || request.method !== "GET") unexpected(request);
      return json({
        total: 25,
        is_added: 21,
        is_skipped: 3,
        is_limited: 1,
        passImportVerification: true,
      });
    });
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.import.status"),
      {},
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
      { emails: [], send_welcome_email: false },
      {
        emails: Array.from({ length: 26 }, (_, index) => `r${String(index)}@example.com`),
        send_welcome_email: false,
      },
      { emails: ["reader@example.com", "reader@example.com"], send_welcome_email: false },
      { emails: ["not an email"], send_welcome_email: false },
      { emails: ["Reader@Example.com"], send_welcome_email: false },
      { emails: valid, send_welcome_email: true },
      { emails: valid },
      { emails: valid, send_welcome_email: false, extra: "x" },
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

  test("imports once with a frozen operation identity and records the accepted target", async () => {
    const emails = ["a@example.com", "b@example.com"];
    const events: string[] = [];
    const fixture = harness((request) => {
      if (request.url.href !== `${ORIGIN}/api/v1/import` || request.method !== "POST") unexpected(request);
      events.push("dispatch");
      expect(JSON.parse(request.body ?? "null")).toEqual({ emails, sendWelcomeEmail: false });
      return json({ ok: true });
    });
    const accepted: string[] = [];
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.import"),
      { emails, send_welcome_email: false },
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
      plan: { emails, sendWelcomeEmail: false },
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
      JSON.stringify({ emailCount: 2, operationId, publicationId: PUBLICATION_ID }),
    ]);
    expect(fixture.calls.filter((call) => call.url.pathname === "/api/v1/import")).toHaveLength(1);
  });

  test("returns reconcile-required and never retries an ambiguous import", async () => {
    for (const respond of [
      () => json({ error: "busy" }, 502),
      () => json([], 200),
      () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
      () => {
        throw new TypeError("socket closed");
      },
    ]) {
      let imports = 0;
      const fixture = harness((request) => {
        if (request.url.pathname !== "/api/v1/import") unexpected(request);
        imports += 1;
        return respond();
      });
      let verified = 0;
      const result = await executeSubstackSubscriberOperation(
        recipe("subscribers.import"),
        { emails: ["reader@example.com"], send_welcome_email: false },
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
      expect(result.error).toContain("subscribers.import.status");
      expect(result.error).not.toContain("reader@example.com");
      expect(result.readFailure).toBeUndefined();
    }
  });

  test("an import whose dispatch admission fails never reaches the provider", async () => {
    const fixture = harness(unexpected);
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.import"),
      { emails: ["reader@example.com"], send_welcome_email: false },
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
    expect(fixture.calls.some((call) => call.url.pathname === "/api/v1/import")).toBe(false);
  });
});
