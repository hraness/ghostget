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

The ledger claim takes an intent fence before the hash-keyed ledger. An intent
is one account realm (the auth locator), provider target (adapter ID),
operation, and canonical input, narrowed to an elected duplicate-risk
successor. The fence ignores adapter and auth hashes because a reconnect or a
manifest revision rewrites those bytes without changing the effect. While an
earlier run of the same intent is unsettled, confirmation refuses; while a
succeeded run is inside its dedupe window, confirmation replays its receipt
when it ran under the current auth record and refuses otherwise.
The fence scans run journals before its exclusive create under
`idempotency/intents`, so a run recorded before the fence existed still blocks.

The realm is the locator ID, not the provider account, because the verified
subject is optional and journals do not record it. Three limits follow:

- The same account connected under a second locator ID is a different intent
  and is not fenced against the first locator's runs.
- A fulfilled run whose auth record differs from the current one (a reconnect
  with new settings, or `--force` onto another account) is not replayed as the
  current account's result. Confirmation refuses until the dedupe window ends
  or the locator is reconnected with the settings that run used.
- Reconciliation and duplicate-successor election accept the current auth
  record when it has the unsettled run's exact bytes, or when it keeps the
  locator ID and kind and names the provider subject that the run's encrypted
  recovery capsule recorded. Capsules record the subject from this release
  on. A capsule written earlier, or a run whose auth record had no subject,
  still needs the exact record. After such a reconnect the refusal says to
  reconnect with the settings that run used before reconciling; auth records
  carry no timestamps, so the same settings restore the same bytes.

`ghostget doctor` reads the fence back without writing, after its repair pass.
`ghostget.intentFences` counts intent claims held by active, unsettled, and
fulfilled runs, and counts terminal runs that still fence their intent through
their journal alone. It lists claims that are malformed, have no run journal,
outlive a released run, disagree with their terminal journal, sit off their
run's intent chain, or repeat a run. Any such issue makes durable run recovery
unhealthy. Issues name a claim by its opaque key and a run by its ID only.

A repair pass remembers each intent's generation chain, so projecting every
terminal journal reads each generation once. The chain never resets on a
reconnect or a manifest revision, so one intent holds at most the same 10,000
fulfilled generations as a hash-keyed ledger.

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
