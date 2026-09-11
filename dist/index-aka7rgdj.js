// @bun
import {
  OperationDeadline
} from "./index-vtj5zdgf.js";
import {
  startProviderPluginCleanupTrackedOperation
} from "./index-n4szk3nw.js";

// src/web-session-cleanup-join.ts
function trackWebSessionCleanupBarrier(barrier) {
  let settled = false;
  let resolveTracked;
  let rejectTracked;
  const promise = new Promise((resolve, reject) => {
    resolveTracked = resolve;
    rejectTracked = reject;
  });
  promise.catch(() => {
    return;
  });
  const verified = () => {
    if (settled)
      return;
    settled = true;
    resolveTracked?.();
  };
  const unsafe = (cause) => {
    if (settled)
      return;
    settled = true;
    rejectTracked?.(cause);
  };
  barrier.then(verified, unsafe);
  return Object.freeze({ promise, unsafe, verified });
}
async function awaitWebSessionCleanupBarriers(barriers, clock) {
  if (barriers.length === 0)
    return;
  const failures = [];
  let joined = 0;
  const join = async () => {
    for (;; ) {
      const pending = barriers.slice(joined).map((barrier) => barrier.promise);
      joined = barriers.length;
      if (pending.length > 0) {
        const results = await Promise.allSettled(pending);
        for (const result of results) {
          if (result.status === "rejected")
            failures.push(result.reason);
        }
        continue;
      }
      await Promise.resolve();
      if (joined === barriers.length)
        break;
    }
    if (failures.length > 0) {
      const failure = failures[0];
      throw failure instanceof WebSessionCleanupUnverifiedError ? failure : new WebSessionCleanupUnverifiedError(failure);
    }
  };
  let cancelTimeout;
  let rejectForTimeout;
  const timedOut = new Promise((_resolve, reject) => {
    rejectForTimeout = reject;
  });
  const timeout = () => {
    const error = new WebSessionCleanupUnverifiedError;
    for (const barrier of barriers)
      barrier.unsafe(error);
    rejectForTimeout?.(error);
  };
  try {
    if (clock === undefined) {
      const timer = setTimeout(timeout, WEB_SESSION_CLEANUP_JOIN_TIMEOUT_MS);
      cancelTimeout = () => clearTimeout(timer);
    } else {
      cancelTimeout = clock.schedule(timeout, WEB_SESSION_CLEANUP_JOIN_TIMEOUT_MS);
    }
  } catch (error) {
    const unverified = new WebSessionCleanupUnverifiedError(error);
    for (const barrier of barriers)
      barrier.unsafe(unverified);
    throw unverified;
  }
  try {
    await Promise.race([join(), timedOut]);
  } finally {
    cancelTimeout?.();
  }
}

// src/web-session-execution.ts
import { types as nodeTypes } from "util";
var WEB_SESSION_OPERATION_LABEL = "authenticated web operation deadline";
var WEB_SESSION_CLEANUP_JOIN_TIMEOUT_MS = 30000;

class WebSessionCleanupUnverifiedError extends Error {
  constructor(cause) {
    super("provider resource cleanup could not be verified within its bounded join; retry is unsafe until ghostget doctor proves and completes exact resource recovery", cause === undefined ? undefined : { cause });
    this.name = "WebSessionCleanupUnverifiedError";
  }
}
var readFailureRetryDisposition = Object.freeze({
  "target-unavailable": "do-not-retry",
  "auth-repair-required": "repair-auth",
  "account-mismatch": "do-not-retry",
  "provider-throttled": "retry-once-after-60s",
  "provider-temporary": "retry-once-after-60s",
  "operation-timeout": "retry-once-after-60s",
  "contract-drift": "do-not-retry",
  "cleanup-required": "do-not-retry"
});
function readFailureProjection(category) {
  return Object.freeze({
    category,
    retryDisposition: readFailureRetryDisposition[category]
  });
}
function parseReadFailureProjection(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)) {
    throw new Error("read failure projection must be a plain data object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("read failure projection must be a plain data object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string") || Object.keys(descriptors).sort().join(",") !== "category,retryDisposition") {
    throw new Error("read failure projection is malformed");
  }
  const categoryDescriptor = descriptors.category;
  const dispositionDescriptor = descriptors.retryDisposition;
  if (categoryDescriptor === undefined || dispositionDescriptor === undefined || !categoryDescriptor.enumerable || !dispositionDescriptor.enumerable || !("value" in categoryDescriptor) || !("value" in dispositionDescriptor))
    throw new Error("read failure projection is malformed");
  const category = categoryDescriptor.value;
  if (typeof category !== "string" || !Object.hasOwn(readFailureRetryDisposition, category))
    throw new Error("read failure category is malformed");
  const expected = readFailureRetryDisposition[category];
  if (dispositionDescriptor.value !== expected) {
    throw new Error("read failure retry disposition is inconsistent");
  }
  return readFailureProjection(category);
}
function startWebSessionCleanupTrackedOperation(register, start, cleanupBoundary) {
  if (register === undefined)
    return start(undefined);
  return startProviderPluginCleanupTrackedOperation(register, async (publishCleanupResource, cleanup) => {
    const operation = start(publishCleanupResource);
    try {
      await cleanupBoundary(operation);
      cleanup.verified();
    } catch (error) {
      cleanup.unsafe(error);
    }
    return await operation;
  });
}
async function runWebSessionOperationWithDeadline(recipe, options, execute) {
  const ownedDeadline = options.operationDeadline === undefined ? new OperationDeadline(recipe.timeoutMs, {
    ...options.signal === undefined ? {} : { signal: options.signal },
    ...options.deadlineClock === undefined ? {} : { clock: options.deadlineClock }
  }) : null;
  const deadline = options.operationDeadline ?? ownedDeadline;
  if (deadline === null) {
    throw new Error("authenticated web operation deadline is unavailable");
  }
  const guardDispatch = (callback) => callback === undefined ? undefined : (event) => deadline.run(() => callback(event), WEB_SESSION_OPERATION_LABEL);
  const beforeDispatch = guardDispatch(options.beforeDispatch);
  const afterProviderAcceptedMutationTarget = options.afterProviderAcceptedMutationTarget === undefined ? undefined : (event) => deadline.run(() => options.afterProviderAcceptedMutationTarget(event), WEB_SESSION_OPERATION_LABEL);
  const afterProviderBoundMutationTarget = options.afterProviderBoundMutationTarget === undefined ? undefined : (event) => deadline.run(() => options.afterProviderBoundMutationTarget(event), WEB_SESSION_OPERATION_LABEL);
  const afterDispatchVerified = guardDispatch(options.afterDispatchVerified);
  const cleanupBarriers = [];
  let acceptingCleanupBarriers = true;
  const registerCleanupBarrier = (barrier) => {
    if (!acceptingCleanupBarriers) {
      throw new Error("authenticated web cleanup registration is already closed");
    }
    const tracked = trackWebSessionCleanupBarrier(barrier);
    try {
      const registered = options.registerCleanupBarrier?.(tracked.promise);
      cleanupBarriers.push(tracked);
      return typeof registered === "function" ? registered : undefined;
    } catch (error) {
      tracked.verified();
      throw error;
    }
  };
  const fileResolver = options.fileResolver === undefined ? undefined : (files) => deadline.run(() => options.fileResolver(files), WEB_SESSION_OPERATION_LABEL);
  const boundedOptions = {
    ...fileResolver === undefined ? {} : { fileResolver },
    ...options.environment === undefined ? {} : { environment: options.environment },
    signal: deadline.signal,
    operationDeadline: deadline,
    registerCleanupBarrier,
    ...beforeDispatch === undefined ? {} : { beforeDispatch },
    ...afterProviderAcceptedMutationTarget === undefined ? {} : { afterProviderAcceptedMutationTarget },
    ...afterProviderBoundMutationTarget === undefined ? {} : { afterProviderBoundMutationTarget },
    ...afterDispatchVerified === undefined ? {} : { afterDispatchVerified }
  };
  let outcome;
  try {
    try {
      outcome = {
        status: "fulfilled",
        value: await deadline.run(() => execute(boundedOptions), WEB_SESSION_OPERATION_LABEL)
      };
    } catch (reason) {
      outcome = { status: "rejected", reason };
    }
    acceptingCleanupBarriers = false;
    await awaitWebSessionCleanupBarriers(cleanupBarriers, options.deadlineClock);
    if (outcome.status === "rejected")
      throw outcome.reason;
    return outcome.value;
  } finally {
    ownedDeadline?.dispose();
  }
}

export { trackWebSessionCleanupBarrier, awaitWebSessionCleanupBarriers, WebSessionCleanupUnverifiedError, readFailureProjection, parseReadFailureProjection, startWebSessionCleanupTrackedOperation, runWebSessionOperationWithDeadline };
