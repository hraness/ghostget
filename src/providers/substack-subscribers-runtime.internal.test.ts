import { describe, expect, test } from "bun:test";

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
    return handler(request);
  }) as typeof globalThis.fetch;
  return {
    calls,
    acquisitions: () => acquisitions,
    dependencies: { acquireCookies, fetch, operationNonce: () => NONCE },
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function recipe(action: WebSessionRecipe["action"]): WebSessionRecipe {
  return {
    site: "substack",
    action,
    contractVersion: 1,
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
  test("public dispatcher refuses the capture-required import before cookies or network", async () => {
    const fixture = harness(unexpected);
    await expect(executeSubstackWebOperation(
      recipe("subscribers.import"),
      { emails: ["reader@example.com"], send_welcome_email: false, publication_origin: ORIGIN } as OperationInput,
      boundAuth,
      { dependencies: fixture.dependencies },
    )).rejects.toThrow("capture-required");
    expect(fixture.acquisitions()).toBe(0);
    expect(fixture.calls).toEqual([]);
  });

  test("public dispatcher runs the observed subscriber reads", async () => {
    const fixture = harness((request) => {
      if (request.url.href === `${ORIGIN}/api/v1/subscriber-stats`) {
        return json({ count: 1, subscribers: [subscriberRow(0)] });
      }
      if (request.url.href === `${ORIGIN}/api/v1/import/instances`) {
        return json({
          hasActiveListManagementModerationTask: false,
          latestImportResult: {
            total: 1,
            is_added: 1,
            is_skipped: 0,
            is_limited: 0,
            passImportVerification: true,
            upload_date: "2026-09-27T00:00:00.000Z",
          },
          pubImports: [],
        });
      }
      return unexpected(request);
    });
    const exported = await executeSubstackWebOperation(
      recipe("subscribers.export"),
      { limit: 100, publication_origin: ORIGIN },
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
          sections: [],
        }],
        nextCursor: null,
        total: 1,
      },
    });
    const status = await executeSubstackWebOperation(
      recipe("subscribers.import.status"),
      { publication_origin: ORIGIN },
      boundAuth,
      { dependencies: fixture.dependencies },
    );
    expect(status.status).toBe("succeeded");
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
      const body = JSON.parse(request.body ?? "null") as {
        filters: unknown;
        includeTags: boolean;
        offset: number;
        limit: number;
      };
      expect(body).toEqual({
        filters: { order_by_desc_nulls_last: "subscription_created_at" },
        includeTags: true,
        limit: 2,
        offset: body.offset,
      });
      const rows = Array.from(
        { length: Math.min(body.limit, total - body.offset) },
        (_, index) => subscriberRow(body.offset + index),
      );
      return json({ count: total, subscribers: rows, pendingImports: [] });
    });
    const emails = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const result = await executeSubstackSubscriberOperation(
        recipe("subscribers.export"),
        cursor === null ? { limit: 2 } : { cursor, limit: 2 },
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
      for (const subscriber of output.subscribers) emails.add(subscriber.email);
      cursor = output.nextCursor;
      pages += 1;
    } while (cursor !== null);
    expect(pages).toBe(4);
    expect([...emails]).toEqual([0, 1, 2, 3, 4].map((index) => `reader${String(index)}@example.com`));
    expect(JSON.stringify(fixture.calls.map((call) => call.body))).not.toContain("private-cookie-value");
  });

  test("fails an export page closed when the total changes or the cursor names another publication", async () => {
    const fixture = harness(() => json({ count: 6, subscribers: [subscriberRow(2)] }));
    const changed = await executeSubstackSubscriberOperation(
      recipe("subscribers.export"),
      { cursor: "ss1.7.2.5", limit: 2 },
      boundAuth,
      { dependencies: fixture.dependencies },
    );
    expect(changed).toMatchObject({ status: "failed", output: null, dispatchStarted: false });
    expect(changed.readFailure?.category).toBe("contract-drift");

    const other = harness(unexpected);
    const mismatch = await executeSubstackSubscriberOperation(
      recipe("subscribers.export"),
      { cursor: "ss1.8.2.5", limit: 2 },
      boundAuth,
      { dependencies: other.dependencies },
    );
    expect(mismatch.readFailure?.category).toBe("account-mismatch");
    expect(other.calls.map((call) => call.url.pathname)).toEqual(["/api/v1/am_i_logged_in", "/"]);
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
      if (request.url.href !== `${ORIGIN}/api/v1/import/instances` || request.method !== "GET") unexpected(request);
      return json({
        hasActiveListManagementModerationTask: false,
        latestImportResult: {
          total: 25,
          is_added: 21,
          is_skipped: 3,
          is_limited: 1,
          passImportVerification: true,
          upload_date: "2026-09-27T00:00:00.000Z",
        },
        pubImports: [],
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
    const origin = ORIGIN;
    for (const input of [
      { emails: [], send_welcome_email: false, publication_origin: origin },
      {
        emails: ["a@example.com", "b@example.com"],
        send_welcome_email: false,
        publication_origin: origin,
      },
      {
        emails: Array.from({ length: 26 }, (_, index) => `r${String(index)}@example.com`),
        send_welcome_email: false,
        publication_origin: origin,
      },
      {
        emails: ["reader@example.com", "reader@example.com"],
        send_welcome_email: false,
        publication_origin: origin,
      },
      { emails: "reader@example.com", send_welcome_email: false, publication_origin: origin },
      { emails: ["not an email"], send_welcome_email: false, publication_origin: origin },
      { emails: ["Reader@Example.com"], send_welcome_email: false, publication_origin: origin },
      { emails: [" reader@example.com"], send_welcome_email: false, publication_origin: origin },
      { emails: valid, send_welcome_email: true, publication_origin: origin },
      { emails: valid, send_welcome_email: "false", publication_origin: origin },
      { emails: valid, publication_origin: origin },
      { emails: valid, send_welcome_email: false },
      { emails: valid, send_welcome_email: false, publication_origin: null },
      { emails: valid, send_welcome_email: false, publication_origin: "https://news.example.com" },
      { emails: valid, send_welcome_email: false, publication_origin: `${origin}/` },
      { emails: valid, send_welcome_email: false, publication_origin: "http://wrench-owned.substack.com" },
      { emails: valid, send_welcome_email: false, publication_origin: origin, extra: "x" },
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
    const emails = ["a@example.com"];
    const events: string[] = [];
    const fixture = harness((request) => {
      if (request.url.href !== `${ORIGIN}/api/v1/subscriber/add` || request.method !== "POST") unexpected(request);
      events.push("dispatch");
      expect(JSON.parse(request.body ?? "null")).toEqual({
        email: emails[0],
        subscription: false,
        sendEmail: false,
      });
      return json({});
    });
    const accepted: string[] = [];
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.import"),
      { emails, send_welcome_email: false, publication_origin: ORIGIN },
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
      plan: { emails, sendWelcomeEmail: false, publicationOrigin: ORIGIN },
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
    expect(fixture.calls.filter((call) => call.url.pathname === "/api/v1/subscriber/add")).toHaveLength(1);
  });

  test("returns reconcile-required and never retries an ambiguous import", async () => {
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
        { emails: ["reader@example.com"], send_welcome_email: false, publication_origin: ORIGIN },
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

  test("an import whose dispatch admission fails never reaches the provider", async () => {
    const fixture = harness(unexpected);
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.import"),
      { emails: ["reader@example.com"], send_welcome_email: false, publication_origin: ORIGIN },
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

  test("a 4xx on the add request stays indeterminate after exactly one request", async () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429]) {
      let imports = 0;
      const fixture = harness((request) => {
        if (request.url.pathname !== "/api/v1/subscriber/add") unexpected(request);
        imports += 1;
        return json({ error: "Private provider detail reader@example.com" }, status);
      });
      const result = await executeSubstackSubscriberOperation(
        recipe("subscribers.import"),
        { emails: ["reader@example.com"], send_welcome_email: false, publication_origin: ORIGIN },
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

  test("an import naming a publication the viewer does not own never dispatches", async () => {
    const fixture = harness(unexpected, [
      { id: 7, subdomain: "wrench-owned", primary_user_id: USER_ID, is_publication_primary_user: true },
      { id: 8, subdomain: "second", primary_user_id: USER_ID, is_publication_primary_user: true },
    ]);
    let dispatches = 0;
    await expect(executeSubstackSubscriberOperation(
      recipe("subscribers.import"),
      {
        emails: ["reader@example.com"],
        send_welcome_email: false,
        publication_origin: "https://not-owned.substack.com",
      },
      boundAuth,
      {
        dependencies: fixture.dependencies,
        beforeDispatch: () => {
          dispatches += 1;
          return Promise.resolve();
        },
      },
    )).rejects.toThrow("exactly one matching signed-in viewer-owned publication");
    expect(dispatches).toBe(0);
    expect(fixture.calls.some((call) => call.url.pathname === "/api/v1/subscriber/add")).toBe(false);
  });

  test("sends the exact observed import status GET with no body to the named publication", async () => {
    const second = "https://second.substack.com";
    const fixture = harness((request) => {
      expect(request.url.href).toBe(`${second}/api/v1/import/instances`);
      expect(request.method).toBe("GET");
      expect(request.body).toBeNull();
      expect(request.headers.get("referer")).toBe(`${second}/publish/subscribers`);
      return json({
        hasActiveListManagementModerationTask: false,
        latestImportResult: {
          total: 0,
          is_added: 0,
          is_skipped: 0,
          is_limited: 0,
          passImportVerification: false,
          upload_date: "2026-09-27T00:00:00.123456789Z",
        },
        pubImports: [],
      });
    }, [
      { id: 7, subdomain: "wrench-owned", primary_user_id: USER_ID, is_publication_primary_user: true },
      { id: 8, subdomain: "second", primary_user_id: USER_ID, is_publication_primary_user: true },
    ]);
    const result = await executeSubstackSubscriberOperation(
      recipe("subscribers.import.status"),
      { publication_origin: second },
      boundAuth,
      { dependencies: fixture.dependencies },
    );
    expect(result.status).toBe("succeeded");
    expect(fixture.calls.filter((call) => call.url.origin === second)).toHaveLength(1);
  });

  test("overlapping pages let a caller dedupe unstable equal-timestamp order into a complete census", async () => {
    // Every row shares one nanosecond timestamp, so the provider may return
    // them in any order. Each request sees a different permutation, like the
    // live publication did, and the cursor must still let a caller collect
    // every unique address by overlapping adjacent pages.
    const total = 373;
    const limit = 100;
    const timestamp = "2026-06-04T19:51:29.324567891Z";
    let request = 0;
    const second = "https://second.substack.com";
    const fixture = harness((call) => {
      if (call.url.href !== `${second}/api/v1/subscriber-stats` || call.method !== "POST") unexpected(call);
      const body = JSON.parse(call.body ?? "null") as { offset: number; limit: number };
      expect(JSON.parse(call.body ?? "null")).toEqual({
        filters: { order_by_desc_nulls_last: "subscription_created_at" },
        includeTags: true,
        limit,
        offset: body.offset,
      });
      request += 1;
      // Deterministic permutation that swaps each page boundary pair.
      const order = Array.from({ length: total }, (_, index) => index);
      for (let boundary = limit - 10; boundary + 1 < total; boundary += limit - 10) {
        if (request % 2 === 0) [order[boundary - 1], order[boundary]] = [order[boundary]!, order[boundary - 1]!];
      }
      const rows = order.slice(body.offset, body.offset + body.limit).map((index) => ({
        ...subscriberRow(index),
        subscription_created_at: timestamp,
        sections: [{ name: "Weekly" }],
      }));
      return json({ count: total, subscribers: rows });
    }, [
      { id: 7, subdomain: "wrench-owned", primary_user_id: USER_ID, is_publication_primary_user: true },
      { id: 8, subdomain: "second", primary_user_id: USER_ID, is_publication_primary_user: true },
    ]);
    const unique = new Set<string>();
    const offsets: number[] = [];
    let rowsSeen = 0;
    let cursor: string | null = null;
    do {
      const input: OperationInput = cursor === null
        ? { limit, publication_origin: second }
        : { cursor, limit, publication_origin: second };
      const result = await executeSubstackSubscriberOperation(
        recipe("subscribers.export"),
        input,
        boundAuth,
        { dependencies: fixture.dependencies },
      );
      expect(result.status).toBe("succeeded");
      const output = result.output as {
        subscribers: { email: string; subscribedAt: string | null; sections: string[] }[];
        nextCursor: string | null;
        total: number;
      };
      expect(output.total).toBe(total);
      for (const row of output.subscribers) {
        expect(row.subscribedAt).toBe("2026-06-04T19:51:29.324Z");
        expect(row.sections).toEqual(["Weekly"]);
        unique.add(row.email);
      }
      rowsSeen += output.subscribers.length;
      offsets.push(JSON.parse(fixture.calls.at(-1)?.body ?? "null").offset as number);
      cursor = output.nextCursor;
    } while (cursor !== null);
    expect(offsets).toEqual([0, 90, 180, 270, 360]);
    expect(rowsSeen).toBeGreaterThan(total);
    expect(unique.size).toBe(total);
  });
});
