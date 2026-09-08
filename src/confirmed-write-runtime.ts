import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import type { ConfirmedWriteFailure } from "./confirmed-write-failure";

/** The only interpreter for a closed, complete confirmed-write invocation. */
export async function runConfirmedWrite<A>(
  program: Effect.Effect<A, ConfirmedWriteFailure>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.uninterruptible));
  if (Exit.isSuccess(exit)) return exit.value;
  const selected = Cause.failureOption(exit.cause);
  if (Option.isSome(selected)) throw selected.value.cause;
  throw Cause.squash(exit.cause);
}
