import * as Effect from "effect/Effect";
import type { BrowserFileResolver } from "./browser";
import type { WebSessionRecipe } from "./model";
import { OperationDeadline } from "./operation-deadline";
import { readAttempt, resumeReadOutcome, type ReadEffectFailure } from "./read-effect";
import { readNative } from "./read-effect-platform";
import { runReadEffect } from "./read-effect-runtime";
import {
  trackWebSessionCleanupBarrier,
  awaitWebSessionCleanupBarriers,
  type TrackedWebSessionCleanupBarrier
} from "./web-session-cleanup-join";
import type {
  WebSessionExecutionOptions,
  WebSessionDispatchEvent,
  WebSessionProviderAcceptedMutationTargetEvent,
  WebSessionProviderBoundMutationTargetEvent,
  WebSessionCleanupBarrierRegistrar
} from "./web-session-execution";

const WEB_SESSION_OPERATION_LABEL = "authenticated web operation deadline";

/** R1 owns native deadline acquisition, execution Exit and the separate
 * content-bound cleanup join. Closing a fiber does not verify native cleanup. */
export async function runWebSessionReadWithDeadline<T>(
  recipe: Pick<WebSessionRecipe, "timeoutMs">,
  options: WebSessionExecutionOptions,
  execute: (bounded: WebSessionExecutionOptions) => Promise<T>

): Promise<T> {
  const program: Effect.Effect<T, ReadEffectFailure> = Effect.scoped(Effect.gen(function*() {
    const resource = yield* Effect.acquireRelease(
      readAttempt(() => {
        const ownedDeadline = options.operationDeadline === undefined
          ? new OperationDeadline(recipe.timeoutMs, {
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            ...(options.deadlineClock === undefined
              ? {}
              : { clock: options.deadlineClock }),
          })
          : null;
        const deadline = options.operationDeadline ?? ownedDeadline;
        if (deadline === null) {
          throw new Error("authenticated web operation deadline is unavailable");
        }
        return { ownedDeadline, deadline };
      }),
      resource => Effect.sync(() => resource.ownedDeadline?.dispose())
    );
    const { deadline } = resource;
    const guardDispatch = (
      callback: ((event: WebSessionDispatchEvent) => Promise<void>) | undefined,
    ): ((event: WebSessionDispatchEvent) => Promise<void>) | undefined =>
      callback === undefined
        ? undefined
        : (event) => deadline.run(
          () => callback(event),
          WEB_SESSION_OPERATION_LABEL,
        );
    const beforeDispatch = guardDispatch(options.beforeDispatch);
    const afterProviderAcceptedMutationTarget =
      options.afterProviderAcceptedMutationTarget === undefined
        ? undefined
        : (event: WebSessionProviderAcceptedMutationTargetEvent) => deadline.run(
          () => options.afterProviderAcceptedMutationTarget!(event),
          WEB_SESSION_OPERATION_LABEL,
        );
    const afterProviderBoundMutationTarget =
      options.afterProviderBoundMutationTarget === undefined
        ? undefined
        : (event: WebSessionProviderBoundMutationTargetEvent) => deadline.run(
          () => options.afterProviderBoundMutationTarget!(event),
          WEB_SESSION_OPERATION_LABEL,
        );
    const afterDispatchVerified = guardDispatch(options.afterDispatchVerified);
    const cleanupBarriers: TrackedWebSessionCleanupBarrier[] = [];
    let acceptingCleanupBarriers = true;
    const registerCleanupBarrier: WebSessionCleanupBarrierRegistrar = (barrier) => {
      if (!acceptingCleanupBarriers) {
        throw new Error("authenticated web cleanup registration is already closed");
      }
      const tracked = trackWebSessionCleanupBarrier(barrier);
      try {
        const registered =
          options.registerCleanupBarrier?.(tracked.promise);
        cleanupBarriers.push(tracked);
        return typeof registered === "function" ? registered : undefined;
      } catch (error) {
        // Registration happens before its resource starts. If an outer registrar
        // retained the promise before throwing, settle it safely so that scope
        // does not wait forever for an operation that was never begun.
        tracked.verified();
        throw error;
      }
    };
    const fileResolver = options.fileResolver === undefined
      ? undefined
      : (files: Parameters<BrowserFileResolver>[0]) => deadline.run(
        () => options.fileResolver!(files),
        WEB_SESSION_OPERATION_LABEL,
      );
    const boundedOptions: WebSessionExecutionOptions = {
      ...(fileResolver === undefined ? {} : { fileResolver }),
      ...(options.environment === undefined ? {} : { environment: options.environment }),
      signal: deadline.signal,
      operationDeadline: deadline,
      registerCleanupBarrier,
      ...(beforeDispatch === undefined ? {} : { beforeDispatch }),
      ...(afterProviderAcceptedMutationTarget === undefined
        ? {}
        : { afterProviderAcceptedMutationTarget }),
      ...(afterProviderBoundMutationTarget === undefined
        ? {}
        : { afterProviderBoundMutationTarget }),
      ...(afterDispatchVerified === undefined ? {} : { afterDispatchVerified }),
    };
    const outcome = yield* Effect.exit(readNative(() => deadline.run(() => execute(boundedOptions), WEB_SESSION_OPERATION_LABEL)));
    acceptingCleanupBarriers = false;
    // Native barrier verification must settle even when the operation failed.
    const cleanup = yield* Effect.exit(Effect.uninterruptible(readNative(() => awaitWebSessionCleanupBarriers(cleanupBarriers, options.deadlineClock))));
    return yield* resumeReadOutcome(outcome, cleanup);
  }));
  return runReadEffect(program);
}
