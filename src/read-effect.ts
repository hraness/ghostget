import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

/** A foreign boundary failure retains the original rejection privately. */
export class ReadEffectFailure extends Data.TaggedError("ReadEffectFailure")<{
  readonly cause: unknown;
  readonly cleanupCause?: unknown;
  readonly primaryCause?: unknown;
}> { }

export const readAttempt = <A>(work: () => A): Effect.Effect<A, ReadEffectFailure> =>
  Effect.try({ try: work, catch: cause => new ReadEffectFailure({ cause }) });

/** Native acquisition and finalization settle before ownership leaves the scope.
 * A failing finalizer retains the primary failure while preserving the previous
 * finally-block precedence at the Promise boundary. */
export function withReadResource<Resource, A, R>(
  acquire: Effect.Effect<Resource, ReadEffectFailure, R>,
  use: (resource: Resource) => Effect.Effect<A, ReadEffectFailure, R>,
  release: (resource: Resource) => Effect.Effect<void, ReadEffectFailure, R>,

): Effect.Effect<A, ReadEffectFailure, R> {
  return Effect.gen(function*() {
    let finalization: Exit.Exit<void, ReadEffectFailure> = Exit.void;
    const outcome = yield* Effect.scoped(Effect.gen(function*() {
      const resource = yield* Effect.acquireRelease(
        acquire,
        resource =>
          Effect.exit(release(resource)).pipe(Effect.map(exit => { finalization = exit; }))
      );
      return yield* Effect.exit(use(resource));
    }));
    return yield* resumeReadOutcome(outcome, finalization);
  });
}

/** Preserve native finalizer rejection precedence and the primary Cause. */
export function resumeReadOutcome<A>(
  outcome: Exit.Exit<A, ReadEffectFailure>,
  finalization: Exit.Exit<void, ReadEffectFailure>

): Effect.Effect<A, ReadEffectFailure> {
  if (Exit.isFailure(finalization)) {
    const cleanup = Cause.failureOption(finalization.cause);
    if (Option.isSome(cleanup) && Exit.isFailure(outcome)) return Effect.fail(new ReadEffectFailure({ cause: cleanup.value.cause, primaryCause: outcome.cause }));
    return Effect.failCause(finalization.cause);
  }
  return outcome;
}
