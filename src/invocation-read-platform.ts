import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { readAttempt, ReadEffectFailure } from "./read-effect";
import type { InvocationResult, RunReceipt } from "./runtime";
import type { ReadFailureProjection } from "./web-session-execution";

export type ReadExecution = {
  readonly status: "succeeded" | "failed" | "partial" | "indeterminate";
  readonly output: unknown;
  readonly finalUrl: string | null;
  readonly dispatchStarted: boolean;
  readonly dispatch: RunReceipt["dispatch"];
  readonly error?: string;
  readonly readFailure?: ReadFailureProjection;
  readonly noOp?: true;
  readonly privateArtifactsPreserved?: boolean;
  readonly recoveryHandle?: string;
};

export type ReadInvocationNative = {
  readonly provisional: RunReceipt;
  readonly transportLabel: string;
  readonly apiOperation: boolean;
  readonly execute: () => Promise<unknown>;
  readonly persist: (receipt: RunReceipt) => void;
  readonly parse: (raw: unknown) => ReadExecution;
  readonly rejected: (cause: unknown) => ReadExecution;
  readonly now: () => string;
  readonly finalOrigin: (url: string | null) => string | null;
  readonly recoveryHandle: (value: string | undefined) => string | null;
  readonly redact: (value: string) => string;
};

function platform(native: ReadInvocationNative) {
  return {
    provisional: native.provisional,
    transportLabel: native.transportLabel,
    apiOperation: native.apiOperation,
    execute: Effect.tryPromise({ try: native.execute, catch: cause => new ReadEffectFailure({ cause }) }),
    persist: (receipt: RunReceipt) => readAttempt(() => native.persist(receipt)),
    parse: (raw: unknown) => readAttempt(() => native.parse(raw)),
    rejected: (cause: unknown) => readAttempt(() => native.rejected(cause)),
    now: readAttempt(native.now),
    finalOrigin: (url: string | null) => readAttempt(() => native.finalOrigin(url)),
    recoveryHandle: native.recoveryHandle,
    redact: native.redact,
  };
}

export class ReadInvocationPlatform extends Context.Tag("wrench/ReadInvocationPlatform/v1")<ReadInvocationPlatform, ReturnType<typeof platform>>() { }

export const ReadInvocationPlatformLive = (native: ReadInvocationNative): Layer.Layer<ReadInvocationPlatform> => Layer.succeed(ReadInvocationPlatform, platform(native));

export type ReadInvocationOutcome = InvocationResult;
