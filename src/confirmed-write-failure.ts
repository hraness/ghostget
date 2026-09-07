import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

export type ConfirmedWritePhase = "confirmation" | "admission" | "journal" | "dispatch" | "projection" | "cleanup";

/** Original rejection identity is private; public Promise projection selects cause. */
export class ConfirmedWriteFailure extends Data.TaggedError("ConfirmedWriteFailure")<{
  readonly phase: ConfirmedWritePhase;
  readonly cause: unknown;
  readonly priorCause?: Cause.Cause<ConfirmedWriteFailure>;
}> {}

export function confirmedWriteAttempt<A>(
  phase: ConfirmedWritePhase,
  work: () => A,
): Effect.Effect<A, ConfirmedWriteFailure> {
  return Effect.try({ try: work, catch: cause => new ConfirmedWriteFailure({ phase, cause }) });
}

/** A native finally chooses its own rejection while retaining the prior Cause. */
export function confirmedWriteFinally<A, R, R2>(
  operation: Effect.Effect<A, ConfirmedWriteFailure, R>,
  cleanup: Effect.Effect<unknown, ConfirmedWriteFailure, R2>,
): Effect.Effect<A, ConfirmedWriteFailure, R | R2> {
  return Effect.gen(function*() {
    const outcome = yield* Effect.exit(operation);
    const finalization = yield* Effect.exit(cleanup);
    if (Exit.isFailure(finalization)) {
      const selected = Cause.failureOption(finalization.cause);
      if (Option.isSome(selected) && Exit.isFailure(outcome)) {
        return yield* Effect.fail(new ConfirmedWriteFailure({
          phase: selected.value.phase,
          cause: selected.value.cause,
          priorCause: outcome.cause,
        }));
      }
      return yield* Effect.failCause(finalization.cause);
    }
    return yield* outcome;
  });
}
