import { describe, expect, test } from "bun:test";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { ConfirmedWriteFailure, confirmedWriteFinally } from "./confirmed-write-failure";
import { runConfirmedWrite } from "./confirmed-write-runtime";

// This is the actual production finalizer/projection primitive. The public
// confirm tests separately exercise it around real journal and claim custody.
describe("confirmed native failure selection", () => {
  for (const primary of [undefined, null, false, new Error("native primary")]) {
    test.each([undefined, null, false, new Error("native cleanup")])("retains prior Cause while selecting native cleanup %j", async cleanup => {
      const operation = Effect.fail(new ConfirmedWriteFailure({ phase: "journal", cause: primary }));
      const finalization = Effect.fail(new ConfirmedWriteFailure({ phase: "cleanup", cause: cleanup }));
      const program = confirmedWriteFinally(operation, finalization);
      const exit = await Effect.runPromiseExit(program);
      expect(Exit.isFailure(exit)).toBeTrue();
      if (Exit.isSuccess(exit)) throw new Error("native failure disappeared");
      const selected = Cause.failureOption(exit.cause);
      if (Option.isNone(selected)) throw new Error("selected cleanup failure missing");
      expect(selected.value.cause).toBe(cleanup);
      expect(selected.value.priorCause).toBeDefined();
      if (selected.value.priorCause === undefined) throw new Error("prior native Cause missing");
      const prior = Cause.failureOption(selected.value.priorCause);
      if (Option.isNone(prior)) throw new Error("prior expected failure missing");
      expect(prior.value.cause).toBe(primary);
      const outward = await runConfirmedWrite(program).then(
        value => ({ success: true as const, value }), error => ({ success: false as const, error }),
      );
      expect(outward.success).toBeFalse();
      if (outward.success) throw new Error("public failure disappeared");
      expect(outward.error).toBe(cleanup);
    });
  }
});
