import type { OperationDeadlineClock } from "./operation-deadline";
import {
  WebSessionCleanupUnverifiedError,
  WEB_SESSION_CLEANUP_JOIN_TIMEOUT_MS
} from "./web-session-execution";

export type TrackedWebSessionCleanupBarrier = {
  readonly promise: Promise<void>;
  readonly unsafe: (cause: unknown) => void;
  readonly verified: () => void;
};

export function trackWebSessionCleanupBarrier(
  barrier: Promise<void>,
): TrackedWebSessionCleanupBarrier {
  let settled = false;
  let resolveTracked: (() => void) | undefined;
  let rejectTracked: ((cause: unknown) => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolveTracked = resolve;
    rejectTracked = reject;
  });
  // The barrier may fail before the operation reaches its join. Observe the
  // tracked rejection immediately while retaining it for the fail-closed join.
  void promise.catch(() => undefined);
  const verified = (): void => {
    if (settled) return;
    settled = true;
    resolveTracked?.();
  };
  const unsafe = (cause: unknown): void => {
    if (settled) return;
    settled = true;
    rejectTracked?.(cause);
  };
  void barrier.then(verified, unsafe);
  return Object.freeze({ promise, unsafe, verified });
}

export async function awaitWebSessionCleanupBarriers(
  barriers: readonly TrackedWebSessionCleanupBarrier[],
  clock: OperationDeadlineClock | undefined,

): Promise<void> {
  if (barriers.length === 0) return;
  const failures: unknown[] = [];
  let joined = 0;
  const join = async (): Promise<void> => {
    for (; ;) {
      const pending = barriers.slice(joined).map((barrier) => barrier.promise);
      joined = barriers.length;
      if (pending.length > 0) {
        const results = await Promise.allSettled(pending);
        for (const result of results) {
          if (result.status === "rejected") failures.push(result.reason);
        }
        continue;
      }
      await Promise.resolve();
      if (joined === barriers.length) break;
    }
    if (failures.length > 0) {
      const failure = failures[0];
      throw failure instanceof WebSessionCleanupUnverifiedError
        ? failure
        : new WebSessionCleanupUnverifiedError(failure);
    }
  };
  let cancelTimeout: (() => void) | undefined;
  let rejectForTimeout: ((error: Error) => void) | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    rejectForTimeout = reject;
  });
  const timeout = (): void => {
    const error = new WebSessionCleanupUnverifiedError();
    for (const barrier of barriers) barrier.unsafe(error);
    rejectForTimeout?.(error);
  };
  try {
    if (clock === undefined) {
      const timer = setTimeout(timeout, WEB_SESSION_CLEANUP_JOIN_TIMEOUT_MS);
      cancelTimeout = () => clearTimeout(timer);
    } else {
      cancelTimeout = clock.schedule(
        timeout,
        WEB_SESSION_CLEANUP_JOIN_TIMEOUT_MS,
      );
    }
  } catch (error) {
    const unverified = new WebSessionCleanupUnverifiedError(error);
    for (const barrier of barriers) barrier.unsafe(unverified);
    throw unverified;
  }
  try {
    await Promise.race([join(), timedOut]);
  } finally {
    cancelTimeout?.();
  }
}
