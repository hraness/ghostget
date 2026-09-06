import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import {
  ReadInvocationPlatform,
  type ReadExecution,
  type ReadInvocationOutcome
} from "./invocation-read-platform";
import { readAttempt, ReadEffectFailure } from "./read-effect";
import { readFailureProjection } from "./web-session-execution";

const failed = (error: string): ReadExecution => ({
  status: "failed",
  output: null,
  finalUrl: null,
  dispatchStarted: false,
  dispatch: { planned: 0, started: 0, verified: 0 },
  error
});

/** The complete R1 publication sequence: provisional receipt before execution,
 * bounded foreign decoding, zero-dispatch proof, redaction and final receipt
 * before output. R2/R3 confirmation and journal transitions remain separate. */
export const readInvocationProgram: Effect.Effect<ReadInvocationOutcome, ReadEffectFailure, ReadInvocationPlatform> = Effect.gen(function*() {
  const platform = yield* ReadInvocationPlatform;
  yield* platform.persist(platform.provisional).pipe(Effect.mapError(error => new ReadEffectFailure({
    cause: new Error("refusing to start execution because its provisional receipt could not be stored", { cause: error.cause })
  })));
  const result = yield* Effect.either(platform.execute);
  let execution: ReadExecution;
  if (Either.isLeft(result)) execution = yield* platform.rejected(result.left.cause);
  else execution = yield* platform.parse(result.right).pipe(Effect.catchTag(
    "ReadEffectFailure",
    () => Effect.succeed(failed("provider executor terminated without returning a bounded result"))
  ));
  if (execution.dispatch.planned !== 0 || execution.dispatch.started !== 0
    || execution.dispatch.verified !== 0
    || execution.dispatchStarted
    || execution.noOp === true
    || (execution.status !== "succeeded" && execution.status !== "failed")) {
    execution = failed("provider executor returned invalid dispatch progress");
  }
  const readFailure = execution.status === "failed"
    ? execution.readFailure ?? readFailureProjection("contract-drift")
    : undefined;
  const output = readFailure === undefined ? execution.output : null;
  const privateArtifactsPreserved = execution.privateArtifactsPreserved === true;
  const recoveryHandle = platform.recoveryHandle(execution.recoveryHandle);
  const recoveryMessage = privateArtifactsPreserved
    ? `private browser artifacts were preserved; wrench doctor must prove and complete exact browser-session recovery before retry${recoveryHandle === null ? "" : `; recovery handle: ${recoveryHandle}`}`
    : null;
  const finishedAt = yield* platform.now;
  const finalOrigin = yield* platform.finalOrigin(execution.finalUrl);
  const error = yield* readAttempt(() => {
    if (execution.error === undefined) return null;
    if (recoveryMessage !== null) return recoveryMessage;
    const reason = platform.apiOperation ? platform.redact(execution.error).slice(0, 2_000) : null;
    return platform.redact(platform.apiOperation
      ? `${platform.transportLabel} operation failed before the dispatch boundary${reason === null ? "" : `; reason: ${reason}`}`
      : "browser recipe failed before the dispatch boundary");
  });
  const receipt = {
    ...platform.provisional,
    status: execution.status,
    dispatchStarted: false,
    dispatch: execution.dispatch,
    finishedAt,
    finalOrigin,
    error
  };
  const stored = yield* Effect.either(platform.persist(receipt));
  if (Either.isLeft(stored)) return {
    receipt: {
      ...receipt,
      status: "failed" as const,
      error: `${platform.transportLabel} read completed, but its final receipt could not be stored${recoveryMessage === null ? "" : `; ${recoveryMessage}`}`
    },
    output: null,
    replayed: false,
    readFailure: readFailure?.category === "cleanup-required"
      ? readFailure
      : readFailureProjection("contract-drift"),
    privateArtifactsPreserved,
    ...(recoveryHandle === null ? {} : { recoveryHandle }),
  };
  return {
    receipt,
    output,
    replayed: false,
    ...(readFailure === undefined ? {} : { readFailure }),
    privateArtifactsPreserved,
    ...(recoveryHandle === null ? {} : { recoveryHandle })
  };
});
