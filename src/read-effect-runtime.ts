import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import type { ReadEffectFailure } from "./read-effect";

/** Only genuine Promise/plugin boundaries interpret closed read programs. */
export async function runReadEffect<A>(program: Effect.Effect<A, ReadEffectFailure>): Promise<A> {
  const exit = await Effect.runPromiseExit(program);
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.failureOption(exit.cause);
  if (Option.isSome(failure)) throw failure.value.cause;
  throw Cause.squash(exit.cause);
}
