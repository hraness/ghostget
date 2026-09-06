import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as Exit from "effect/Exit";
import type { PortableOperationIdentityV1 } from "./provider-plugin-portable-identity";
import {
  acquirePortableProviderPluginInvocationLease,
  createPortableProviderPluginInvocationLeaseContainmentController,
  releasePortableProviderPluginInvocationLease
} from "./provider-plugin-invocation-lease";
import { settlePortableProviderPluginCleanup } from "./provider-plugin-cleanup-barrier";
import {
  acquireWebSessionCleanupAdmission,
  WebSessionCleanupAdmissionBlockedError,
  type WebSessionCleanupAdmissionIdentity
} from "./web-session-cleanup-admission";
import type { WebSessionCleanupBarrierRegistrar } from "./web-session-execution";
import { readAttempt, type ReadEffectFailure } from "./read-effect";
import { readNative } from "./read-effect-platform";
import { runReadEffect } from "./read-effect-runtime";

type Environment = Readonly<Record<string, string | undefined>>;

/** Exact kernel/content custody stays synchronous. The program owns closing
 * registration, joining every registered barrier, and releasing only a proven
 * cleanup-complete controller. An unsafe controller remains durable. */
export async function withReadCleanupAdmission<A>(
  identity: WebSessionCleanupAdmissionIdentity,
  environment: Environment,
  operation: (register: WebSessionCleanupBarrierRegistrar) => Promise<A>,
  acquiredAt: Date | undefined,
  onBlocked: (error: WebSessionCleanupAdmissionBlockedError) => Promise<A>

): Promise<A> {
  const program: Effect.Effect<A, ReadEffectFailure> = Effect.gen(function*() {
    const acquired = yield* Effect.either(readAttempt(() => acquireWebSessionCleanupAdmission(identity, environment, acquiredAt)));
    if (Either.isLeft(acquired)) {
      const cause = acquired.left.cause;
      if (cause instanceof WebSessionCleanupAdmissionBlockedError) return yield* readNative(() => onBlocked(cause));
      return yield* Effect.fail(acquired.left);
    }
    const admission = acquired.right;
    const settlement = yield* Effect.exit(Effect.gen(function*() {
      const outcome = yield* Effect.exit(readNative(() => operation(admission.registerCleanupBarrier)));
      yield* readAttempt(admission.closeRegistration);
      const barriers = yield* Effect.all(
        admission.barriers.map(barrier => Effect.either(readNative(() => barrier))),
        { concurrency: "unbounded" }
      );
      yield* readAttempt(() => {
        if (barriers.some(Either.isLeft)) admission.cleanupUnsafe();
        else { admission.cleanupComplete(); admission.release(); }
      });
      return yield* outcome;
    }));
    if (Exit.isFailure(settlement)) {
      yield* readAttempt(() => {
        admission.closeRegistration();
        if (admission.current.claim.containment.status === "parent-owned") { admission.cleanupComplete(); admission.release(); }
      });
    }
    return yield* settlement;
  }).pipe(Effect.uninterruptible);
  return runReadEffect(program);
}

/** AsyncLocalStorage in the native portable host retains descendant barrier
 * registration. Its positive proof precedes the synchronous exact lease release;
 * neither a failed operation nor Effect scope completion can substitute for it. */
export async function withPortableReadAdmission<A>(
  identity: PortableOperationIdentityV1,
  runId: string,
  environment: Environment,
  acquiredAt: Date | undefined,
  operation: () => Promise<A>

): Promise<A> {
  const program: Effect.Effect<A, ReadEffectFailure> = Effect.gen(function*() {
    const containment = yield* readAttempt(() => createPortableProviderPluginInvocationLeaseContainmentController(
      acquirePortableProviderPluginInvocationLease(identity, runId, environment, acquiredAt),
      environment
    ));
    const outcome = yield* readNative(() => settlePortableProviderPluginCleanup(
      operation,
      { containment, cleanupComplete: containment.cleanupComplete }
    ));
    yield* readAttempt(() => releasePortableProviderPluginInvocationLease(containment.current, environment, new Date()));
    if (outcome.status === "rejected") return yield* readAttempt(() => { throw outcome.reason; });
    return outcome.value;
  }).pipe(Effect.uninterruptible);
  return runReadEffect(program);
}
