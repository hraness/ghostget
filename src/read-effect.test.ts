import { expect, test } from "bun:test";
import { Cause, Effect, Exit, Fiber, Option } from "effect";
import { ReadEffectFailure, withReadResource } from "./read-effect";
import { readNative } from "./read-effect-platform";
import { runReadEffect } from "./read-effect-runtime";

test("late native acquisition remains owned and closes before interruption settles", async () => {
  const acquired = Promise.withResolvers<string>();
  const closing = Promise.withResolvers<void>();
  const events: string[] = [];
  const fiber = Effect.runFork(withReadResource(readNative(() => acquired.promise), () => Effect.sync(() => { events.push("use"); }), resource => readNative(() => { events.push(`close:${resource}`); return closing.promise; })));
  let settled = false;
  const interrupted = Effect.runPromise(Fiber.interrupt(fiber)).then(() => { settled = true; });
  acquired.resolve("owned");
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  expect(events).toEqual(["close:owned"]);
  expect(settled).toBeFalse();
  closing.resolve();
  await interrupted;
  expect(settled).toBeTrue();
});

test("cleanup rejection preserves prior Promise finally precedence and retains the primary Cause", async () => {
  const primary = new Error("private operation detail");
  const cleanup = new Error("private cleanup detail");
  const program = withReadResource(Effect.succeed("resource"), () => Effect.fail(new ReadEffectFailure({ cause: primary })), () => Effect.fail(new ReadEffectFailure({ cause: cleanup })));
  const exit = await Effect.runPromiseExit(program);
  expect(Exit.isFailure(exit)).toBeTrue();
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    expect(Option.isSome(failure)).toBeTrue();
    if (Option.isSome(failure)) { expect(failure.value.cause).toBe(cleanup); expect(failure.value.primaryCause).toBeDefined(); }
  }
  await expect(runReadEffect(program)).rejects.toBe(cleanup);
});
