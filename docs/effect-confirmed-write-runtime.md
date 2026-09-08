# Confirmed-write runtime ownership

`confirmInvocation` keeps its public Promise interface. Its invocation-local
Effect program owns confirmation, durable preparation, dispatch, result
reconciliation and cleanup. R1 reads retain their separate
[read interpreter](effect-read-runtime.md). R4 remains blocked; the migration
adds no provider operation, implicit confirmation or automatic retry.

## Program and native boundaries

[The program](../src/confirmed-write-program.ts) sequences the complete R2/R3
invocation. [The platform](../src/confirmed-write-platform.ts) supplies individual
native operations and the invocation's journal cell. Existing validation,
storage, process identity, executor and cleanup kernels retain their authority.
[The interpreter](../src/confirmed-write-runtime.ts) projects one closed program
back to the public Promise and preserves the selected native rejection value.
Pure DTOs and constants live in [the model](../src/confirmed-write-model.ts).

Confirmation claims, plan consumption, provisional receipt, idempotency ledger
and recovery capsule must reach their existing durable boundaries before remote
dispatch. Request qualification keeps its original error and release precedence;
output-limit validation retains its post-capsule, pre-dispatch position. A
changed duplicate-risk witness retains the existing confirmation claim so the
ordinary recovery path can inspect it.

## Synchronous dispatch evidence

Dispatch and accepted-target callbacks validate and persist their transitions
against one current journal cell before returning a settled Promise. Keep those
native callbacks synchronous even though the enclosing program is lazy. An
executor that calls a callback without awaiting its returned Promise must still
observe the committed transition. A stale or competing callback cannot reuse an
older journal snapshot.

The public confirmation prefix must retain its original timing through the first
native asynchronous operation. Test that boundary before awaiting the public
Promise, and inspect the actual journal. A microtask delay in the test would hide
an admission regression. An Effect scheduling boundary does not independently
grant permission to change this contract.

A journal write can commit and then lose its acknowledgment. Preserve the existing
reconciliation path: inspect the durable state, withhold unproven output, and
retain unresolved ownership. Missing acknowledgment never permits another remote
submission. A failed projection may be repairable without repeating execution.

## Cleanup and failure selection

Native operations remain owned until their real settlement. The existing
operation deadline and physical cleanup kernels still own browser/process proof.
Completing or interrupting a fiber cannot prove that a native process exited.

The portable cleanup context reuses the existing AsyncLocalStorage kernel. It
associates descendant registrations with the same invocation lease, closes
registration, joins admitted cleanup, and releases only after the native proof
succeeds. Failed or unsafe proof retains durable admission for recovery. A late
safe-looking result cannot reverse a previously unsafe settlement.

[Typed failures](../src/confirmed-write-failure.ts) distinguish confirmation,
admission, journal, dispatch, projection and cleanup. The public boundary keeps
the exact selected rejection, including `undefined`, `null` and other falsey
values. Native `finally` precedence remains observable; an earlier Cause stays
private. Best-effort journal repair consumes its handled result explicitly and
cannot replace the already selected failure.

## Validation and delivery

Causal tests use real confirmation, storage/CAS and cleanup-context seams with
bounded held operations and injected failures. They cover synchronous journal
admission, lost acknowledgments, competing callbacks, falsey cleanup precedence,
retained custody and withheld output. The architecture checker constrains the
explicit module roles; these domain tests establish the ordering laws.

The exact package inventory includes every new runtime source module. Built-in
source/dependency closure remains automatically derived and revalidated; durable
writer contract identities stay fixed. Run the repository's full `bun run check`
and applicable `bun run check:macos` on the converged tree. Release staging,
human npm promotion and production verification follow
[the publishing workflow](publishing.md). Implementation status and remaining
gates belong in [the expansion plan](../kb/plans/effect-profile-and-confirmed-write.md)
and its PR.
