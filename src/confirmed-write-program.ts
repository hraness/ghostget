import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { canonicalJson } from "./canonical-json";
import { ConfirmedWriteFailure, confirmedWriteFinally, type ConfirmedWritePhase } from "./confirmed-write-failure";
import { ConfirmedWritePlatform } from "./confirmed-write-platform";
import type { RunPreparedOptions } from "./confirmed-write-model";
import type { PreparedInvocation, StoredPlan, InvocationResult } from "./runtime";

type Platform = Effect.Effect.Success<typeof ConfirmedWritePlatform>;
type Execution = Effect.Effect.Success<ReturnType<Platform["execution"]>>;

const refuse = (phase: ConfirmedWritePhase, message: string) =>
  Effect.fail(new ConfirmedWriteFailure({ phase, cause: new Error(message) }));
const wrapped = (failure: ConfirmedWriteFailure, message: string) =>
  Effect.fail(new ConfirmedWriteFailure({
    phase: failure.phase, cause: new Error(message, { cause: failure.cause }),
    priorCause: Cause.fail(failure),
  }));

/** The best-effort repair cannot replace the existing selected error. */
function finalizePreDispatchFailure(state: Execution, message: string) {
  return Effect.gen(function*() {
    if (!state.journalTerminal) {
      yield* state.record({ type: "finished", status: "failed", finalOrigin: null, error: message, at: yield* state.clock() });
    }
    yield* state.projectJournal;
    yield* state.refreshReceipt;
  }).pipe(Effect.either, Effect.asVoid);
}

function prepareAndExecute(
  platform: Platform, invocation: PreparedInvocation, digest: string, options: RunPreparedOptions,
): Effect.Effect<InvocationResult, ConfirmedWriteFailure> {
  return Effect.gen(function*() {
    const checked = yield* platform.checkExecution(invocation, options);
    if (checked.operation.risk === "R4") return yield* refuse("confirmation", "R4 capabilities are blocked by wrench");
    const claims = yield* platform.repairClaims;
    const journals = yield* platform.repairJournals(yield* platform.currentTime(options));
    if (claims.invalid > 0 || journals.issues.length > 0) {
      return yield* refuse("confirmation", "local execution recovery has unresolved state; run wrench doctor before starting another write");
    }
    const state = yield* platform.execution(checked, digest, options);
    const requestJournal = yield* state.journalRequest;
    const created = yield* Effect.either(state.createJournal(requestJournal));
    if (Either.isLeft(created)) {
      return yield* confirmedWriteFinally(Effect.fail(created.left), state.releaseClaim);
    }
    if (!(yield* state.removePlan)) {
      yield* confirmedWriteFinally(Effect.gen(function*() {
        yield* state.record({ type: "finished", status: "failed", finalOrigin: null, error: "confirmation ownership was lost before plan consumption", at: state.startedAt });
        yield* state.projectJournal;
      }), state.releaseClaim);
      return yield* refuse("confirmation", "confirmation plan was already consumed or cancelled");
    }
    const consumed = yield* Effect.either(state.record({ type: "confirmation-consumed", at: state.startedAt }));
    if (Either.isLeft(consumed)) return yield* wrapped(consumed.left,
      "confirmation plan was consumed, but its run journal could not claim ownership; run wrench doctor before retrying");
    if (!(yield* state.releaseClaim)) {
      yield* Effect.either(Effect.gen(function*() {
        yield* state.record({ type: "finished", status: "failed", finalOrigin: null, error: "confirmation ownership claim changed before release", at: state.startedAt });
        yield* state.projectJournal;
      })).pipe(Effect.asVoid);
      return yield* refuse("confirmation", "confirmation ownership claim changed unexpectedly; run wrench doctor before retrying");
    }
    yield* state.refreshReceipt;
    const provisional = yield* Effect.either(state.persistProvisional);
    if (Either.isLeft(provisional)) {
      yield* Effect.either(Effect.gen(function*() {
        yield* state.record({
          type: "finished", status: "failed", finalOrigin: null,
          error: "provisional receipt could not be projected before dispatch", at: yield* state.clock()
        });
      })).pipe(Effect.asVoid);
      return yield* wrapped(provisional.left, "refusing to start execution because its provisional receipt could not be stored");
    }
    const request = yield* state.ledgerRequest;
    const ledger = yield* Effect.either(state.acquireLedger(request));
    if (Either.isLeft(ledger)) {
      yield* finalizePreDispatchFailure(state, "idempotency state could not be inspected before dispatch");
      return yield* wrapped(ledger.left, "refusing to start a remote write because its idempotency state could not be inspected");
    }
    const acquired = ledger.right;
    if (!acquired.acquired) {
      yield* finalizePreDispatchFailure(state, "another run already owns this idempotency scope");
      if (acquired.existing.inputHash !== state.inputHash || acquired.existing.adapterHash !== state.adapter.hash || acquired.existing.authHash !== state.auth.hash) {
        return yield* refuse("journal", "idempotency key was already used in a different action scope");
      }
      if (acquired.existing.status === "succeeded") return {
        receipt: yield* state.readReceipt(acquired.existing.runId), output: null, replayed: true, privateArtifactsPreserved: false,
      };
      return yield* refuse("journal", `a prior attempt (${acquired.existing.runId}) may have reached the provider; inspect 'wrench runs show ${acquired.existing.runId}' and reconcile it before retrying`);
    }
    const claimed = yield* Effect.either(Effect.gen(function*() {
      yield* state.record({ type: "ledger-claimed", ledgerRelativePath: yield* state.ledgerRelativePath(acquired.snapshot.path), at: yield* state.clock() });
    }));
    if (Either.isLeft(claimed)) {
      yield* finalizePreDispatchFailure(state, "idempotency claim could not be bound to the run journal");
      return yield* wrapped(claimed.left, "refusing to start a remote write because its run journal could not claim the idempotency ledger");
    }
    const recovery = yield* Effect.either(Effect.gen(function*() {
      yield* state.storeCapsule;
      yield* state.record({ type: "recovery-stored", at: yield* state.clock() });
      yield* state.refreshReceipt;
    }));
    if (Either.isLeft(recovery)) {
      yield* finalizePreDispatchFailure(state, "encrypted recovery state could not be made durable before dispatch");
      return yield* wrapped(recovery.left, "refusing to start a remote write because its encrypted recovery capsule could not be stored");
    }
    const maxOutputBytes = yield* state.outputLimit;
    const dispatched = yield* Effect.either(state.dispatch);
    const projected = yield* state.projectExecution(Either.isRight(dispatched)
      ? { status: "fulfilled", value: dispatched.right }
      : { status: "rejected", reason: dispatched.left.cause }, maxOutputBytes);
    const terminal = yield* Effect.either(state.record(projected.terminalEvent));
    if (Either.isLeft(terminal)) yield* Effect.either(state.reloadJournal).pipe(Effect.asVoid);
    if (state.journalTerminal) yield* Effect.either(state.projectJournal).pipe(Effect.asVoid);
    return yield* state.result(projected.result);
  });
}

/** Admission and actual physical cleanup belong to the same program as dispatch. */
function withWriteAdmission(
  platform: Platform, invocation: PreparedInvocation, digest: string, options: RunPreparedOptions,
): Effect.Effect<InvocationResult, ConfirmedWriteFailure> {
  return Effect.gen(function*() {
    const selected = yield* platform.admission(invocation, options);
    if (selected.cleanupIdentity !== null) {
      const admission = yield* platform.acquireWeb(selected.cleanupIdentity, options.now);
      const settlement = yield* Effect.exit(Effect.gen(function*() {
        const outcome = yield* Effect.exit(prepareAndExecute(platform, selected.invocation, digest,
          { ...selected.options, registerCleanupBarrier: admission.registerCleanupBarrier }));
        const cleanup = Effect.gen(function*() {
          yield* platform.cleanup(admission.closeRegistration);
          const joined = yield* Effect.all(admission.barriers.map(barrier =>
            Effect.either(platform.nativeCleanup(() => barrier))), { concurrency: "unbounded" });
          yield* platform.cleanup(() => {
            if (joined.some(Either.isLeft)) admission.cleanupUnsafe();
            else { admission.cleanupComplete(); admission.release(); }
          });
        });
        return yield* confirmedWriteFinally(outcome, cleanup);
      }));
      if (Exit.isFailure(settlement)) {
        return yield* confirmedWriteFinally(settlement, platform.cleanup(() => {
          admission.closeRegistration();
          if (admission.current.claim.containment.status === "parent-owned") { admission.cleanupComplete(); admission.release(); }
        }));
      }
      return settlement.value;
    }
    if (selected.portableIdentity !== null) {
      const owned = yield* platform.acquirePortable(selected.portableIdentity, selected.options.runId, options.now);
      const outcome = yield* Effect.exit(prepareAndExecute(platform, selected.invocation, digest, selected.options));
      const cleanup = yield* Effect.exit(Effect.gen(function*() {
        yield* platform.cleanup(owned.context.closeRegistration);
        yield* platform.nativeCleanup(owned.context.join);
        yield* platform.cleanup(owned.context.complete);
      }));
      if (Exit.isFailure(cleanup)) {
        // A failed physical proof never releases the durable lease.
        return yield* confirmedWriteFinally(confirmedWriteFinally(outcome, cleanup),
          platform.cleanup(() => {
            const selected = Cause.failureOption(cleanup.cause);
            owned.context.unsafe(Option.isSome(selected) ? selected.value.cause : Cause.squash(cleanup.cause));
          }));
      }
      return yield* confirmedWriteFinally(outcome, platform.cleanup(owned.release));
    }
    return yield* prepareAndExecute(platform, selected.invocation, digest, selected.options);
  });
}

export function confirmedWriteProgram(digest: string): Effect.Effect<InvocationResult, ConfirmedWriteFailure, ConfirmedWritePlatform> {
  return Effect.gen(function*() {
    const platform = yield* ConfirmedWritePlatform;
    const initial = yield* platform.initialPlan(digest);
    if (initial.plan.messagingComposite !== undefined) return yield* refuse("confirmation",
      "messaging composite execution is unavailable until a reviewed provider executor is installed");
    const configured = yield* platform.configure;
    const claims = yield* platform.repairClaims;
    const journals = yield* platform.repairJournals(configured.observedAt);
    if (claims.invalid > 0 || journals.issues.length > 0) return yield* refuse("confirmation",
      "local execution recovery has unresolved state; run wrench doctor before confirming");
    const runId = yield* platform.newRunId;
    const claim = yield* platform.claim(digest, runId, configured.observedAt);
    let stored: StoredPlan | null = null;
    let invocation: PreparedInvocation | null = null;
    const selected = yield* confirmedWriteFinally(Effect.gen(function*() {
      stored = yield* platform.initialPlan(digest);
      invocation = yield* platform.freshPlan(stored, configured.registry, configured.observedAt);
      if (stored.plan.duplicateRisk !== undefined) {
        const current = yield* platform.duplicateRisk(stored);
        if (current === undefined || canonicalJson(current) !== canonicalJson(stored.plan.duplicateRisk)) {
          return yield* refuse("confirmation", "duplicate-risk source evidence changed after preview; inspect the source run and preview again");
        }
      }
      return { stored, invocation };
    }), Effect.gen(function*() {
      // Preserve the existing duplicate-risk mismatch witness: invocation has
      // already been assigned, so this branch deliberately retains its claim.
      if (invocation === null && stored !== null) {
        if (yield* platform.removePlan(digest)) {
          if (!(yield* platform.retainingJournal(digest))) yield* platform.cleanupAssets(digest);
        }
        yield* platform.releaseClaim(claim);
      } else if (invocation === null) yield* platform.releaseClaim(claim);
    }));
    let started = false;
    return yield* confirmedWriteFinally(Effect.gen(function*() {
      const prepared = yield* platform.prepareOptions(selected.invocation, selected.stored, claim, runId, configured.registry);
      started = true;
      return yield* withWriteAdmission(platform, selected.invocation, digest, prepared);
    }), Effect.gen(function*() {
      if (!started) {
        yield* platform.removePlan(digest);
        if (!(yield* platform.retainingJournal(digest))) yield* platform.cleanupAssets(digest);
      }
      yield* platform.releaseClaim(claim);
    }));
  }).pipe(Effect.uninterruptible);
}
