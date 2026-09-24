import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import fc from "fast-check";
import {
  GHOSTGET_REPOSITORY_ID,
  RELEASE_APP_REVOCATION_OBSERVATION_OFFSETS_MILLISECONDS,
  revokeReleaseAppTokenWithConvergence,
  withReleaseAppToken,
} from "./release-app-token.mjs";
import { assertAsyncProperty } from "../src/test-support.js";

// Properties for the release-App token lifecycle. The revocation property
// generates what GitHub answers to the one DELETE and to each repository
// observation, how long each request takes, how the sleeper behaves, and whether
// the monotonic clock regresses once; the lifecycle property generates where the
// mint-operate-revoke sequence fails. Both drive the production module.

const token = "ghs_property-ghostget-release-token";
const expiresAt = "2026-08-30T02:00:00Z";
const beforeExpiry = "Sun, 30 Aug 2026 01:00:00 GMT";
const atExpiry = "Sun, 30 Aug 2026 02:00:00 GMT";
const repositoryBody = JSON.stringify({
  repositories: [{ full_name: "hraness/ghostget", id: GHOSTGET_REPOSITORY_ID, name: "ghostget", owner: { login: "hraness" } }],
  repository_selection: "selected",
  total_count: 1,
});
const offsets = RELEASE_APP_REVOCATION_OBSERVATION_OFFSETS_MILLISECONDS;

type DeletionAnswer = "204" | "204-body" | "204-late-date" | "204-no-date" | "200" | "404" | "transport";
type ObservationAnswer = "200" | "401" | "403" | "500" | "200-wrong-repository" | "401-late-date" | "transport";
const deletionAnswer = fc.oneof(
  { weight: 12, arbitrary: fc.constant<DeletionAnswer>("204") },
  { weight: 1, arbitrary: fc.constantFrom<DeletionAnswer>("204-body", "204-late-date", "204-no-date", "200", "404", "transport") },
);
const observationAnswer = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom<ObservationAnswer>("200", "401", "401") },
  { weight: 1, arbitrary: fc.constantFrom<ObservationAnswer>("403", "500", "200-wrong-repository", "401-late-date", "transport") },
);
const latency = fc.oneof({ weight: 8, arbitrary: fc.integer({ min: 1, max: 200 }) },
  { weight: 1, arbitrary: fc.constantFrom(0, 9_000, 20_000) });

function answer(status: number, body: string, date: string | undefined): Response {
  return new Response(status === 204 && body === "" ? null : body,
    { status, headers: date === undefined ? {} : { Date: date } });
}

describe("release App token revocation", () => {
  test("property: exactly one DELETE, then two stable denials inside ten absolute slots and 30 seconds, or fail closed", async () => {
    await assertAsyncProperty(fc.asyncProperty(
      deletionAnswer,
      fc.array(fc.tuple(observationAnswer, latency), { minLength: 1, maxLength: 12 }),
      fc.oneof({ weight: 6, arbitrary: fc.constant(1) }, { weight: 1, arbitrary: fc.constantFrom(0, 0.5, 3) }),
      fc.option(fc.integer({ min: 2, max: 40 }), { nil: undefined, freq: 5 }),
      fc.integer({ min: 0, max: 1_000_000 }),
      async (deletion, schedule, sleepFactor, regressAt, start) => {
        let now = start; let clockReads = 0;
        const readings: number[] = [];
        const requests: { method: string; path: string; startedAt: number }[] = [];
        const answered: ObservationAnswer[] = [];
        const fetchImplementation = async (request: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
          const url = new URL(String(request)); const method = init?.method ?? "GET";
          requests.push({ method, path: url.pathname, startedAt: now });
          if (method === "DELETE") {
            now += 1;
            switch (deletion) {
              case "204": return answer(204, "", beforeExpiry);
              case "204-body": return answer(204, "{}", beforeExpiry);
              case "204-late-date": return answer(204, "", atExpiry);
              case "204-no-date": return answer(204, "", undefined);
              case "200": return answer(200, "{}", beforeExpiry);
              case "404": return answer(404, "{\"message\":\"Not Found\"}", beforeExpiry);
              case "transport": throw new TypeError("network");
            }
          }
          const [kind, delay] = schedule[Math.min(answered.length, schedule.length - 1)]!;
          answered.push(kind); now += delay;
          switch (kind) {
            case "200": return answer(200, repositoryBody, beforeExpiry);
            case "200-wrong-repository": return answer(200, repositoryBody.replace("\"ghostget\"", "\"other\""), beforeExpiry);
            case "401": return answer(401, "{\"message\":\"Bad credentials\"}", beforeExpiry);
            case "401-late-date": return answer(401, "{\"message\":\"Bad credentials\"}", atExpiry);
            case "403": return answer(403, "{}", beforeExpiry);
            case "500": return answer(500, "{}", beforeExpiry);
            case "transport": throw new TypeError("network");
          }
        };
        const result = await revokeReleaseAppTokenWithConvergence({
          apiUrl: new URL("https://api.github.com/"),
          createTimeoutSignal: () => new AbortController().signal,
          expiresAt,
          fetchImplementation,
          now: () => {
            clockReads += 1;
            readings.push(regressAt === clockReads ? now - 1 : now);
            return readings.at(-1)!;
          },
          sleep: async (milliseconds: number) => { now += Math.floor(milliseconds * sleepFactor); },
          token,
        }).then(receipt => ({ ok: true as const, receipt }), (error: unknown) => ({ ok: false as const, error }));

        // Exactly one DELETE, sent first, and never again.
        expect(requests[0]).toMatchObject({ method: "DELETE", path: "/installation/token" });
        expect(requests.filter(request => request.method === "DELETE")).toHaveLength(1);
        const observations = requests.slice(1);
        observations.forEach(request => expect(request).toMatchObject({ method: "GET", path: "/installation/repositories" }));
        if (deletion !== "204") {
          expect(result.ok).toBe(false);
          expect(observations).toEqual([]);
          return;
        }
        // At most ten observations; the k-th starts no earlier than the k-th
        // absolute offset and strictly inside the 30-second window. The anchor is
        // the first clock reading, taken after the DELETE completes.
        expect(observations.length).toBeLessThanOrEqual(offsets.length);
        const anchor = readings[0]!;
        observations.forEach((request, index) => {
          expect(request.startedAt).toBeGreaterThanOrEqual(anchor + offsets[index]!);
          expect(request.startedAt).toBeLessThan(anchor + 30_000);
        });
        const regressed = readings.some((value, index) => index > 0 && value < readings[index - 1]!);
        if (result.ok) {
          // Success: every observation before the final two was an exact 200, and the final two were exact 401s.
          expect(answered.slice(-2)).toEqual(["401", "401"]);
          answered.slice(0, -2).forEach(kind => expect(kind).toBe("200"));
          expect(result.receipt).toEqual({ converged: true, observationCount: answered.length,
            propagationObserved: answered.length > 2, stableDenials: 2 });
          expect(regressed).toBe(false);
          expect(now).toBeLessThanOrEqual(anchor + 30_000);
        }
        // An authorization that returns after a denial, or any other answer, fails closed.
        const firstDenial = answered.indexOf("401");
        if (firstDenial >= 0 && answered.slice(firstDenial + 1).includes("200")) expect(result.ok).toBe(false);
        if (answered.some(kind => kind !== "200" && kind !== "401")) expect(result.ok).toBe(false);
        // Progress: k authorized reads then two denials within ten slots, with an
        // accurate sleeper, prompt requests, and a monotonic clock, always converge.
        const firstNonAuthorized = schedule.findIndex(([kind]) => kind !== "200");
        const fits = firstNonAuthorized >= 0 && firstNonAuthorized + 2 <= offsets.length
          && schedule[firstNonAuthorized]?.[0] === "401" && (schedule[firstNonAuthorized + 1] ?? schedule.at(-1))![0] === "401"
          && schedule.slice(0, firstNonAuthorized + 2).every(([, delay]) => delay >= 1 && delay <= 200)
          && (schedule.length > firstNonAuthorized + 1 || schedule.at(-1)![1] <= 200);
        if (fits && sleepFactor === 1 && regressAt === undefined) {
          expect(result).toEqual({ ok: true, receipt: { converged: true, observationCount: firstNonAuthorized + 2,
            propagationObserved: firstNonAuthorized > 0, stableDenials: 2 } });
        }
      }), { numRuns: 400 });
  });
});

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const environment = Object.freeze({
  GITHUB_API_URL: "https://api.github.com",
  GITHUB_REPOSITORY: "hraness/ghostget",
  GITHUB_REPOSITORY_ID: String(GHOSTGET_REPOSITORY_ID),
  GITHUB_REPOSITORY_OWNER: "hraness",
  WRENCH_RELEASE_APP_CLIENT_ID: "Iv23liGhostgetWriter",
  WRENCH_RELEASE_APP_ID: "123456",
  WRENCH_RELEASE_APP_INSTALLATION_ID: "654321",
  WRENCH_RELEASE_APP_PRIVATE_KEY: privateKey,
  WRENCH_RELEASE_APP_SLUG: "ghostget-prod-ref-writer-1316443113",
});
const permissions = { contents: "write", metadata: "read", workflows: "write" };
const appIdentity = { client_id: "Iv23liGhostgetWriter", id: 123456, owner: { login: "hraness", type: "Organization" },
  permissions, slug: "ghostget-prod-ref-writer-1316443113" };
const installation = { account: { login: "hraness", type: "Organization" }, app_id: 123456,
  app_slug: "ghostget-prod-ref-writer-1316443113", id: 654321, permissions, repository_selection: "selected", target_type: "Organization" };
const mintBody = { expires_at: expiresAt, permissions, repository_selection: "selected", token,
  repositories: [{ full_name: "hraness/ghostget", id: GHOSTGET_REPOSITORY_ID, name: "ghostget", owner: { login: "hraness" } }] };
const receipt = Object.freeze({ converged: true, observationCount: 2, propagationObserved: false, stableDenials: 2 });

type LifecycleFailure = "none" | "inspect" | "installation" | "mint-throws" | "mint-no-token" | "mint-wrong-repository"
  | "operation" | "revoke" | "revoke-malformed-receipt" | "on-revoked";

describe("release App token lifecycle", () => {
  test("property: a minted token is revoked exactly once whatever fails, and an unminted token is never revoked", async () => {
    await assertAsyncProperty(fc.asyncProperty(
      fc.uniqueArray(fc.constantFrom<LifecycleFailure>("inspect", "installation", "mint-throws", "mint-no-token",
        "mint-wrong-repository", "operation", "revoke", "revoke-malformed-receipt", "on-revoked"), { maxLength: 3 }),
      async (failures) => {
        const has = (failure: LifecycleFailure): boolean => failures.includes(failure);
        const events: string[] = [];
        const outcome = await withReleaseAppToken({
          environment,
          async inspect() { events.push("inspect"); if (has("inspect")) throw new Error("inspect"); return appIdentity; },
          async inspectInstallation() { events.push("installation"); if (has("installation")) throw new Error("installation"); return installation; },
          mask(value: string) { events.push(`mask:${value}`); },
          async mint() {
            events.push("mint");
            if (has("mint-throws")) throw new Error("mint");
            if (has("mint-no-token")) return { body: { ...mintBody, token: undefined }, serverDate: beforeExpiry };
            if (has("mint-wrong-repository")) {
              return { body: { ...mintBody, repositories: [{ ...mintBody.repositories[0], id: 1 }] }, serverDate: beforeExpiry };
            }
            return { body: mintBody, serverDate: beforeExpiry };
          },
          nowMilliseconds: () => Date.parse("2026-08-30T01:00:00Z"),
          async onRevoked() { events.push("on-revoked"); if (has("on-revoked")) throw new Error("on-revoked"); },
          async revoke(input: Readonly<{ token: string }>) {
            events.push(`revoke:${input.token}`);
            if (has("revoke")) throw new Error("revoke");
            return has("revoke-malformed-receipt") ? { ...receipt, stableDenials: 1 } : receipt;
          },
        }, async (value: string) => {
          events.push(`operate:${value}`);
          if (has("operation")) throw new Error("operation");
          return "advanced";
        }).then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));

        // The first failing step in sequence decides how far the lifecycle got.
        const preMint = has("inspect") || has("installation") || has("mint-throws") || has("mint-no-token");
        const operated = !preMint && !has("mint-wrong-repository");
        const revokes = events.filter(event => event.startsWith("revoke:"));
        expect(revokes).toEqual(preMint ? [] : [`revoke:${token}`]);
        expect(events.filter(event => event.startsWith("operate:"))).toEqual(operated ? [`operate:${token}`] : []);
        if (!preMint) expect(events.indexOf(`revoke:${token}`)).toBeGreaterThan(events.indexOf(`mask:${token}`));
        const operationFailed = preMint || has("mint-wrong-repository") || (operated && has("operation"));
        const revokeFailed = !preMint && (has("revoke") || has("revoke-malformed-receipt") || has("on-revoked"));
        expect(result(outcome)).toBe(operationFailed || revokeFailed ? "failed" : "advanced");
        if (!outcome.ok && operationFailed && revokeFailed) expect(outcome.error).toBeInstanceOf(AggregateError);
      }));
  });
});

function result(outcome: { ok: true; value: unknown } | { ok: false; error: unknown }): unknown {
  return outcome.ok ? outcome.value : "failed";
}
