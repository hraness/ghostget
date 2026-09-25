import { describe, expect, test } from "bun:test";

import type { ConfirmedWriteIntent } from "./confirmed-write-model";
import { initialRunJournal, type RunJournal } from "./run-journal";
import { intentFenceBlocker } from "./runtime";
import { assertProperty, fc } from "./test-support";

/**
 * The dedupe-window boundary of the confirmed-write intent fence, driven
 * directly over production `intentFenceBlocker`. A retried write reuses or is
 * refused while an unsettled journal exists, while a fulfilled journal's
 * dedupe window (or its duplicate-intent record) still holds; after the
 * window expires the fence admits a fresh charged attempt.
 */

const adapter: RunJournal["adapter"] = { id: "example-web", version: "1.0.0", hash: "b".repeat(64) };
const auth: RunJournal["auth"] = { id: "example-main", hash: "d".repeat(64), kind: "cookies-file" };
const otherAuth: RunJournal["auth"] = { id: "example-other", hash: "f".repeat(64), kind: "cookies-file" };
const contract: RunJournal["contract"] = { transport: "web-session-api", hash: "e".repeat(64) };
const operation = "likes.set";
const startedAt = "2026-07-25T12:00:00.000Z";
const dedupeAt = "2026-07-26T12:00:00.000Z";

function journal(overrides: {
  readonly runId?: string;
  readonly auth?: RunJournal["auth"];
  readonly authSubject?: string;
  readonly dedupeExpiresAt?: string;
  readonly duplicateIntent?: RunJournal["duplicateIntent"];
  readonly ledgerState?: RunJournal["ledgerState"];
  readonly operation?: RunJournal["operation"];
  readonly risk?: "R2" | "R3";
  readonly inputHash?: string;
} = {}): RunJournal {
  const built = initialRunJournal({
    runId: overrides.runId ?? "11111111-1111-4111-8111-111111111111",
    planDigest: "a".repeat(64),
    adapter,
    operation: overrides.operation ?? operation,
    risk: overrides.risk ?? "R2",
    inputHash: overrides.inputHash ?? "c".repeat(64),
    auth: overrides.auth ?? auth,
    ...(overrides.authSubject === undefined ? {} : { authSubject: overrides.authSubject }),
    contract,
    ...(overrides.duplicateIntent === undefined ? {} : { duplicateIntent: overrides.duplicateIntent }),
    plannedDispatches: 1,
    hasPlanAssets: true,
    owner: {
      pid: 1234,
      token: "22222222-2222-4222-8222-222222222222",
      bootId: "1".repeat(64),
      processStartId: "2".repeat(64),
      leaseUntil: "2026-07-25T12:10:00.000Z",
    },
    startedAt,
    dedupeExpiresAt: overrides.dedupeExpiresAt ?? dedupeAt,
  });
  // ledgerState is a projection the reducer maintains; the fence predicate is
  // a pure read over the journal record, so the property varies it directly.
  return overrides.ledgerState === undefined ? built : { ...built, ledgerState: overrides.ledgerState };
}

const intent: ConfirmedWriteIntent = {
  adapterId: adapter.id,
  authId: auth.id,
  operationId: operation,
  inputHashes: ["c".repeat(64)],
};

const dedupeInstant = Date.parse(dedupeAt);
const clockArbitrary = fc.integer({ min: dedupeInstant - 3_600_000, max: dedupeInstant + 3_600_000 })
  .map((ms) => new Date(ms).toISOString());
const unsettledLedgerArbitrary = fc.constantFrom("pending", "partial", "indeterminate");

describe("idempotency fence boundary", () => {
  test("an unsettled same-intent run fences every clock reading", () => {
    assertProperty(fc.property(
      unsettledLedgerArbitrary,
      clockArbitrary,
      (ledgerState, nowIso) => {
        const unsettled = journal({ ledgerState });
        expect(intentFenceBlocker([unsettled], intent, "22222222-2222-4222-8222-222222222222", new Date(nowIso))).toBe(unsettled);
      },
    ));
  });

  test("a succeeded journal fences while its dedupe window holds and admits after expiry", () => {
    assertProperty(fc.property(
      clockArbitrary,
      (nowIso) => {
        const succeeded = journal({ ledgerState: "succeeded" });
        const blocker = intentFenceBlocker([succeeded], intent, "22222222-2222-4222-8222-222222222222", new Date(nowIso));
        if (Date.parse(succeeded.dedupeExpiresAt) >= new Date(nowIso).getTime()) {
          expect(blocker).toBe(succeeded);
        } else {
          expect(blocker).toBeNull();
        }
      },
    ));
  });

  test("a duplicate-intent record fences a settled predecessor at every clock reading", () => {
    assertProperty(fc.property(
      fc.integer({ min: dedupeInstant - 90 * 24 * 60 * 60_000, max: dedupeInstant + 90 * 24 * 60 * 60_000 })
        .map((ms) => new Date(ms).toISOString()),
      (nowIso) => {
        // Duplicate intent journals are legal only for R3 posts.publish —
        // assertJournalInvariants rejects the record anywhere else.
        const duplicate = journal({
          ledgerState: "succeeded",
          operation: "posts.publish",
          risk: "R3",
          duplicateIntent: {
            schemaVersion: 1,
            intentHash: "9".repeat(64),
            sourceRunId: "33333333-3333-4333-8333-333333333333",
          },
        });
        const duplicateIntent: ConfirmedWriteIntent = {
          ...intent,
          operationId: "posts.publish",
          duplicateIntentHash: "9".repeat(64),
        };
        expect(intentFenceBlocker([duplicate], duplicateIntent, "22222222-2222-4222-8222-222222222222", new Date(nowIso))).toBe(duplicate);
      },
    ));
  });

  test("property: the fulfilled blocker is the same-intent journal whose dedupe ends last", () => {
    const fulfilledArbitrary = fc.record({
      runId: fc.constantFrom(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        // The contender's own run id: production must skip it.
        "22222222-2222-4222-8222-222222222222",
      ),
      ledgerState: fc.constantFrom("unclaimed", "released", "succeeded", "pending", "partial", "indeterminate"),
      // dedupeExpiresAt must stay at or after startedAt or the journal reducer
      // rejects the record; the property still samples windows after `now`.
      windowHours: fc.integer({ min: 0, max: 96 }),
    });
    assertProperty(fc.property(
      fc.array(fulfilledArbitrary, { minLength: 0, maxLength: 8 }),
      clockArbitrary,
      (rows, nowIso) => {
        const now = new Date(nowIso);
        const journals = rows.map((row) => journal({
          runId: row.runId,
          ledgerState: row.ledgerState,
          dedupeExpiresAt: new Date(dedupeInstant + row.windowHours * 3_600_000).toISOString(),
        }));
        const runId = "22222222-2222-4222-8222-222222222222";
        const blocker = intentFenceBlocker(journals, intent, runId, now);
        const settling = (candidate: RunJournal): "unsettled" | "fulfilled" | null => {
          if (candidate.ledgerState === "unclaimed" || candidate.ledgerState === "released") return null;
          if (candidate.ledgerState !== "succeeded") return "unsettled";
          return Date.parse(candidate.dedupeExpiresAt) >= now.getTime() ? "fulfilled" : null;
        };
        // Production: the first unsettled journal wins immediately; otherwise
        // the fulfilled journal whose dedupe window ends last (first max wins
        // on ties). An expired-window succeeded journal never blocks.
        const candidates = journals
          .filter((candidate) => candidate.runId !== runId)
          .filter((candidate) => settling(candidate) !== null);
        const unsettled = candidates.filter((candidate) => settling(candidate) === "unsettled");
        const fulfilled = candidates
          .filter((candidate) => settling(candidate) === "fulfilled")
          .sort((left, right) => Date.parse(right.dedupeExpiresAt) - Date.parse(left.dedupeExpiresAt));
        const expected = unsettled[0] ?? fulfilled[0];
        if (expected === undefined) {
          expect(blocker).toBeNull();
        } else {
          expect(blocker).toBe(expected);
        }
      },
    ));
  });

  test("a retry never sees its own run as the blocker, and a mismatched intent never fences", () => {
    const succeeded = journal({ ledgerState: "succeeded" });
    expect(intentFenceBlocker([succeeded], intent, succeeded.runId, new Date(dedupeAt))).toBeNull();
    for (const variant of [
      { ...intent, adapterId: "other-adapter" },
      { ...intent, authId: "other-auth" },
      { ...intent, operationId: "posts.publish" },
      { ...intent, inputHashes: ["9".repeat(64)] },
      { ...intent, duplicateIntentHash: "9".repeat(64) },
    ] satisfies ConfirmedWriteIntent[]) {
      expect(intentFenceBlocker([succeeded], variant, "22222222-2222-4222-8222-222222222222", new Date(dedupeAt))).toBeNull();
    }
  });

  test("an unsettled run under another locator sharing the provider subject still fences", () => {
    const subject = "subject-1";
    const other = journal({ auth: otherAuth, authSubject: subject, ledgerState: "pending" });
    const sameLocator = journal({ ledgerState: "pending" });
    const runId = "22222222-2222-4222-8222-222222222222";
    const withSubject: ConfirmedWriteIntent = { ...intent, authSubject: subject };
    // The same-subject run under another auth locator fences at any clock.
    expect(intentFenceBlocker([other], withSubject, runId, new Date(dedupeAt))).toBe(other);
    // A subject-less journal under the same locator keeps the per-locator fence.
    expect(intentFenceBlocker([sameLocator], intent, runId, new Date(dedupeAt))).toBe(sameLocator);
    // Once it settles beyond its window, the subject fence releases.
    const expiredSettled = { ...other, ledgerState: "succeeded" as const };
    expect(
      intentFenceBlocker([expiredSettled], withSubject, runId, new Date(dedupeInstant + 3_600_000)),
    ).toBeNull();
  });
});
