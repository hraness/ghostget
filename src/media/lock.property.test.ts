import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertAsyncProperty, fc } from "../test-support";
import { ItemLockBusyError, acquireItemLock } from "./lock";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

const NOW_MS = Date.parse("2026-07-21T12:00:00.000Z");
const STALE_AFTER_MS = 60_000;

test("property: a lock is busy only while its heartbeat is fresh and its known owner answers", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-lock-property-"));
  roots.push(root);
  let run = 0;
  await assertAsyncProperty(
    fc.asyncProperty(
      fc.boolean(),
      fc.boolean(),
      fc.integer({ min: 0, max: STALE_AFTER_MS * 3 }),
      async (parseable, pidAlive, heartbeatAgeMs) => {
        run += 1;
        const lockPath = join(root, `item-${run}.lock`);
        await writeFile(lockPath, parseable
          ? `${JSON.stringify({
              version: 1,
              pid: 4321,
              token: "11111111-1111-4111-8111-111111111111",
              acquiredAt: "2026-07-20T00:00:00.000Z",
            })}\n`
          : "", { mode: 0o600 });
        // Whole seconds keep the injected age exact across filesystem mtime precision.
        const heartbeat = new Date(NOW_MS - (Math.floor(heartbeatAgeMs / 1_000) * 1_000));
        await utimes(lockPath, heartbeat, heartbeat);
        const ageMs = NOW_MS - heartbeat.getTime();
        const expectedBusy = ageMs <= STALE_AFTER_MS && (!parseable || pidAlive);
        let sequence = 0;
        try {
          const lock = await acquireItemLock(lockPath, {
            pid: 1234,
            now: () => new Date(NOW_MS),
            token: () => `00000000-0000-4000-8000-${String(run * 10 + (sequence += 1)).padStart(12, "0")}`,
            isProcessAlive: () => pidAlive,
            staleAfterMs: STALE_AFTER_MS,
            heartbeatMs: 3_600_000,
          });
          expect(expectedBusy).toBeFalse();
          await lock.assertOwned();
          await lock.release();
        } catch (error) {
          if (!(error instanceof ItemLockBusyError)) throw error;
          expect(expectedBusy).toBeTrue();
        }
      },
    ),
  );
});
