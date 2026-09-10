import { trackWebSessionCleanupBarrier, awaitWebSessionCleanupBarriers, type TrackedWebSessionCleanupBarrier } from "./web-session-cleanup-join";
import { types as nodeTypes } from "node:util";

import type { GhostgetAuth } from "./auth";
import type {
  BrowserFileResolver,
} from "./browser";
import type {
  GhostgetManifest,
  OperationInput,
  WebSessionRecipe,
} from "./model";
import type {
  ProviderAcceptedMutationTarget,
  ProviderBoundMutationTarget,
} from "./recovery";
import {
  OperationDeadline,
  type OperationDeadlineClock,
} from "./operation-deadline";
import type { WebSessionPluginOperationV1 } from "./provider-plugin";
import {
  startProviderPluginCleanupTrackedOperation,
  type ProviderPluginCleanupBarrierRegistrar,
  type ProviderPluginCleanupResourcePublisher,
} from "./provider-plugin-cleanup-execution";

export {
  startProviderPluginCleanupTrackedOperation,
  type ProviderPluginCleanupBarrierRegistrar,
  type ProviderPluginCleanupResourcePublisher,
} from "./provider-plugin-cleanup-execution";

const WEB_SESSION_OPERATION_LABEL = "authenticated web operation deadline";
export const WEB_SESSION_CLEANUP_JOIN_TIMEOUT_MS = 30_000;

export class WebSessionCleanupUnverifiedError extends Error {
  constructor(cause?: unknown) {
    super(
      "provider resource cleanup could not be verified within its bounded join; retry is unsafe until ghostget doctor proves and completes exact resource recovery",
      cause === undefined ? undefined : { cause },
    );
    this.name = "WebSessionCleanupUnverifiedError";
  }
}

export type ReadFailureProjection =
  | {
      readonly category: "target-unavailable";
      readonly retryDisposition: "do-not-retry";
    }
  | {
      readonly category: "auth-repair-required";
      readonly retryDisposition: "repair-auth";
    }
  | {
      readonly category:
        | "account-mismatch"
        | "contract-drift"
        | "cleanup-required";
      readonly retryDisposition: "do-not-retry";
    }
  | {
      readonly category:
        | "provider-throttled"
        | "provider-temporary"
        | "operation-timeout";
      readonly retryDisposition: "retry-once-after-60s";
    };

const readFailureRetryDisposition = Object.freeze({
  "target-unavailable": "do-not-retry",
  "auth-repair-required": "repair-auth",
  "account-mismatch": "do-not-retry",
  "provider-throttled": "retry-once-after-60s",
  "provider-temporary": "retry-once-after-60s",
  "operation-timeout": "retry-once-after-60s",
  "contract-drift": "do-not-retry",
  "cleanup-required": "do-not-retry",
} as const satisfies Readonly<Record<
  ReadFailureProjection["category"],
  ReadFailureProjection["retryDisposition"]
>>);

export function readFailureProjection(
  category: ReadFailureProjection["category"],
): ReadFailureProjection {
  return Object.freeze({
    category,
    retryDisposition: readFailureRetryDisposition[category],
  }) as ReadFailureProjection;
}

export function parseReadFailureProjection(
  value: unknown,
): ReadFailureProjection {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
  ) {
    throw new Error("read failure projection must be a plain data object");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("read failure projection must be a plain data object");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")
    || Object.keys(descriptors).sort().join(",") !== "category,retryDisposition"
  ) {
    throw new Error("read failure projection is malformed");
  }
  const categoryDescriptor = descriptors.category;
  const dispositionDescriptor = descriptors.retryDisposition;
  if (
    categoryDescriptor === undefined
    || dispositionDescriptor === undefined
    || !categoryDescriptor.enumerable
    || !dispositionDescriptor.enumerable
    || !("value" in categoryDescriptor)
    || !("value" in dispositionDescriptor)
  ) throw new Error("read failure projection is malformed");
  const category = categoryDescriptor.value as unknown;
  if (
    typeof category !== "string"
    || !Object.hasOwn(readFailureRetryDisposition, category)
  ) throw new Error("read failure category is malformed");
  const expected = readFailureRetryDisposition[
    category as ReadFailureProjection["category"]
  ];
  if (dispositionDescriptor.value !== expected) {
    throw new Error("read failure retry disposition is inconsistent");
  }
  return readFailureProjection(category as ReadFailureProjection["category"]);
}

export type WebSessionExecution = {
  readonly status: "succeeded" | "failed" | "partial" | "indeterminate";
  readonly output: unknown;
  readonly finalUrl: string | null;
  /**
   * A desired-state write was already satisfied by an independently bound
   * preflight, so no provider dispatch was started.
   */
  readonly noOp?: true;
  readonly dispatchStarted: boolean;
  readonly dispatch: {
    readonly planned: number;
    readonly started: number;
    readonly verified: number;
  };
  readonly error?: string;
  /** Stable redacted failure policy for an R1 result that failed pre-dispatch. */
  readonly readFailure?: ReadFailureProjection;
};

export type WebSessionDispatchEvent = {
  readonly id: string;
  readonly index: number;
  readonly progress: WebSessionExecution["dispatch"];
};

export type WebSessionProviderAcceptedMutationTargetEvent = {
  readonly id: string;
  readonly index: number;
  readonly target: ProviderAcceptedMutationTarget;
};

export type WebSessionProviderBoundMutationTargetEvent = {
  readonly id: string;
  readonly index: number;
  readonly target: ProviderBoundMutationTarget;
};

export type WebSessionOperationDeadline = Pick<
  OperationDeadline,
  "signal" | "remainingTimeMs" | "run" | "throwIfUnavailable"
>;

/** Compatibility names retained for existing browser-backed runtimes. */
export type WebSessionCleanupResourcePublisher =
  ProviderPluginCleanupResourcePublisher;
export type WebSessionCleanupBarrierRegistrar =
  ProviderPluginCleanupBarrierRegistrar;

/** Compatibility wrapper for existing browser-backed runtimes. */
export function startWebSessionCleanupTrackedOperation<T>(
  register: WebSessionCleanupBarrierRegistrar | undefined,
  start: (
    publishCleanupResource: WebSessionCleanupResourcePublisher | undefined,
  ) => Promise<T>,
  cleanupBoundary: (operation: Promise<T>) => Promise<void>,
): Promise<T> {
  if (register === undefined) return start(undefined);
  return startProviderPluginCleanupTrackedOperation(
    register,
    async (publishCleanupResource, cleanup) => {
      const operation = start(publishCleanupResource);
      try {
        await cleanupBoundary(operation);
        cleanup.verified();
      } catch (error) {
        cleanup.unsafe(error);
      }
      // Preserve the provider result only after cleanup proof has settled. This
      // ordering prevents the generic controller's rejection fallback from
      // racing an ordinary provider failure ahead of its verified cleanup.
      return await operation;
    },
  );
}

export type WebSessionExecutionOptions = {
  readonly fileResolver?: BrowserFileResolver;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
  /** Kernel-owned total budget shared by runtime loading and every provider step. */
  readonly operationDeadline?: WebSessionOperationDeadline;
  /** Internal deterministic-clock seam for an operation that owns its deadline. */
  readonly deadlineClock?: OperationDeadlineClock;
  /**
   * Kernel-owned post-abort join. Browser-backed runtimes register only their
   * bounded teardown proof, never arbitrary provider work.
   */
  readonly registerCleanupBarrier?: WebSessionCleanupBarrierRegistrar;
  readonly beforeDispatch?: (event: WebSessionDispatchEvent) => Promise<void>;
  /**
   * Persist the exact provider-owned target immediately after a strict
   * mutation response accepts the dispatch and before independent readback.
   * Implementations must never call this for an inferred or scraped target.
   */
  readonly afterProviderAcceptedMutationTarget?: (
    event: WebSessionProviderAcceptedMutationTargetEvent,
  ) => Promise<void>;
  /**
   * Persist one exact provider-owned target after a strict pre-dispatch read.
   * The runtime must call `beforeDispatch` first so dispatch start is durable,
   * then await this callback before sending the mutation request. It must never
   * retain a caller-inferred, scraped, or otherwise ambiguous target.
   */
  readonly afterProviderBoundMutationTarget?: (
    event: WebSessionProviderBoundMutationTargetEvent,
  ) => Promise<void>;
  readonly afterDispatchVerified?: (event: WebSessionDispatchEvent) => Promise<void>;
};

export type WebSessionOperationExecutor = (
  manifest: GhostgetManifest,
  recipe: WebSessionRecipe,
  input: OperationInput,
  auth: GhostgetAuth,
  options: WebSessionExecutionOptions,
) => Promise<WebSessionExecution>;

export type PublicWebSessionOperationExecutor = (
  manifest: GhostgetManifest,
  recipe: WebSessionRecipe,
  input: OperationInput,
  options: WebSessionExecutionOptions,
) => Promise<WebSessionExecution>;

/**
 * Bound the complete lazy web runtime hook, including module loading and any
 * work that does not cooperate with cancellation.
 */
export async function runWebSessionOperationWithDeadline<T>(
  recipe: Pick<WebSessionRecipe, "timeoutMs">,
  options: WebSessionExecutionOptions,
  execute: (boundedOptions: WebSessionExecutionOptions) => Promise<T>,
): Promise<T> {
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
  let outcome:
    | { readonly status: "fulfilled"; readonly value: T }
    | { readonly status: "rejected"; readonly reason: unknown };
  try {
    try {
      outcome = {
        status: "fulfilled",
        value: await deadline.run(
          () => execute(boundedOptions),
          WEB_SESSION_OPERATION_LABEL,
        ),
      };
    } catch (reason) {
      outcome = { status: "rejected", reason };
    }
    acceptingCleanupBarriers = false;
    await awaitWebSessionCleanupBarriers(
      cleanupBarriers,
      options.deadlineClock,
    );
    if (outcome.status === "rejected") throw outcome.reason;
    return outcome.value;
  } finally {
    ownedDeadline?.dispose();
  }
}

export function requireValidWebSessionOperationInput(
  operation: Pick<WebSessionPluginOperationV1, "validateInput">,
  input: OperationInput,
): void {
  const inputIssues = operation.validateInput(input);
  if (inputIssues.length > 0) throw new Error(inputIssues.join("; "));
}
