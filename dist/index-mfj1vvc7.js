// @bun
// src/read-effect-runtime.ts
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
async function runReadEffect(program) {
  const exit = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(exit))
    return exit.value;
  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure))
    throw failure.value.cause;
  throw Cause.squash(exit.cause);
}

// src/read-effect.ts
import * as Cause2 from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect2 from "effect/Effect";
import * as Exit2 from "effect/Exit";
import * as Option2 from "effect/Option";

class ReadEffectFailure extends Data.TaggedError("ReadEffectFailure") {
}
var readAttempt = (work) => Effect2.try({ try: work, catch: (cause) => new ReadEffectFailure({ cause }) });
function withReadResource(acquire, use, release) {
  return Effect2.gen(function* () {
    let finalization = Exit2.void;
    const outcome = yield* Effect2.scoped(Effect2.gen(function* () {
      const resource = yield* Effect2.acquireRelease(acquire, (resource2) => Effect2.exit(release(resource2)).pipe(Effect2.map((exit2) => {
        finalization = exit2;
      })));
      return yield* Effect2.exit(use(resource));
    }));
    return yield* resumeReadOutcome(outcome, finalization);
  });
}
function resumeReadOutcome(outcome, finalization) {
  if (Exit2.isFailure(finalization)) {
    const cleanup = Cause2.failureOption(finalization.cause);
    if (Option2.isSome(cleanup) && Exit2.isFailure(outcome))
      return Effect2.fail(new ReadEffectFailure({ cause: cleanup.value.cause, primaryCause: outcome.cause }));
    return Effect2.failCause(finalization.cause);
  }
  return outcome;
}

export { runReadEffect, ReadEffectFailure, readAttempt, withReadResource, resumeReadOutcome };
