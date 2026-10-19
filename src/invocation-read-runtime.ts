import * as Effect from "effect/Effect";
import { readInvocationProgram } from "./invocation-read-program";
import {
  ReadInvocationPlatformLive,
  type ReadInvocationNative,
  type ReadInvocationOutcome
} from "./invocation-read-platform";
import { runReadEffect } from "./read-effect-runtime";

export const runReadInvocation = (native: ReadInvocationNative): Promise<ReadInvocationOutcome> =>
  runReadEffect(readInvocationProgram.pipe(Effect.provide(ReadInvocationPlatformLive(native))));
