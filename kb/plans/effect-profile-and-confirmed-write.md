---
title: Own profile activity and confirmed-write lifecycles with Effect
description: Extend native resource ownership while preserving synchronous durable dispatch admission and independent product authority.
type: plan
area: runtime
status: in-progress
repository_scopes:
  - src
  - scripts
  - package.json
  - bun.lock
  - docs
  - kb/plans/effect-profile-and-confirmed-write.md
tags:
  - runtime
  - providers
  - validation
---

# Own profile activity and confirmed-write lifecycles with Effect

## Outcome and scope

Extend the completed [[plans/effect-read-lifecycle|read lifecycle rollout]] with
one provider-local profile-activity program and one complete native confirmed
R2/R3 lifecycle. Keep the public Promise interfaces, durable contracts, explicit
write authority and physical resource custody. Share the versioned development
checker and causal test patterns; retain Wrench's own runtime and release.

Start from released 0.16.10 source
`521922ed2c81441aeab2cddb67cde5d8ffe078c9`. The release owner completed its
immutable Release, production promotion and exact source handoff before this
branch began. Implementer and integration owner use
`codex/effect-profile-confirmed-write-20260907`; older source branches remain
preserved. One integration owner joins both phases for one later eligible stable
version after convergence. No coding-model benchmark is included.

## Constraints and decisions

Profile reads must validate target/cursor/limits before browser acquisition,
bind the current account before independent profile access and retain the same
request/projection bounds. Producer-owned identity and native browser categories
replace message-text authority for account/authentication failures. This is an
intentional restriction. Native close failure wins by exact identity; earlier
causes remain private. No retry, endpoint or live write is added.

Confirmed writes must retain one invocation-local journal cell. Dispatch and
accepted-target callbacks persist checked transitions synchronously before they
return settled Promises. The native program owns claim validation, execution
admission, journal/receipt/ledger/capsule preparation, dispatch, reconciliation,
cleanup join and final claim release. A lazy Effect callback must not defer the
durable admission. Pure reducers and native storage/CAS kernels stay intact.

Use the existing web/local deadline and cleanup kernels. A narrow portable
asynchronous-context handle must preserve descendant registration and physical
host proof without a copied cleanup algorithm or nested interpreter. Caller
abort, operation failure and cleanup safety remain distinct. Failed proof retains
durable admission. Ambiguous commit never authorizes resubmission. Preserve the
existing duplicate-risk freshness mismatch claim witness and all observable
cleanup/error precedence, including falsey rejection values.

R1's invocation owner, messaging-composite execution, blocked R4 operations,
provider protocols and frozen durable writer identities remain unchanged by the
confirmed-write phase. Current source/dependency closure continues to be derived
and revalidated automatically.

## Dependency-ordered work and ownership

1. The read implementer owns [issue185](https://github.com/hraness/wrench/issues/185):
   profile platform, program, failure classifier, old routine deletion and causal
   tests. Independent review qualifies the actual native boundary and failure
   precedence. This phase is implemented and frozen.
2. The same implementer proceeds with
   [issue186](https://github.com/hraness/wrench/issues/186): native confirmed-write
   lifecycle, immediate durable callbacks and portable context seam. Independent
   review checks storage order, native joins, terminal reconciliation and the
   exact old failure/claim laws before acceptance.
3. The integration owner owns explicit package inventory, version/lock changes,
   copied checker source and local roles, generated closure/catalog, documentation
   and KB convergence. Do not rebaseline durable identity constants because
   source modules moved.
4. After focused evidence and independent review pass, the integration owner runs
   one fresh required aggregate and applicable native checks on the exact clean
   committed tree. Deliver through normal PR/Required CI, exact candidate/stage,
   human npm promotion, public artifact/provenance admission, immutable Release
   and governed production promotion. Each external wait has one owner.

## Verification and current evidence

The corrected profile phase passed 116 focused/foundation tests and 1,166
assertions, TypeScript 6.0.3 and the v1.4.0 local architecture policy using
Bun 1.3.14 and Node 24.20.0. The source stayed unchanged throughout that pass.
The two earlier attempts exposed a malformed test identity and a superseded
unused import; both failures remain recorded. Neither required production logic
to change. This is focused evidence, not a full gate or release.

Confirmed-write acceptance will exercise production confirmation with immediate
journal inspection, competing/stale callbacks, held native dispatch and cleanup,
late handle publication, lost commit acknowledgments, private earlier causes,
unsafe retained admission, and exact terminal output withholding. Use the real
native cleanup context and durable fixtures; no live mutation is necessary.

## Confirmed-write execution checkpoint

The native confirmed-write implementation for [issue 186](https://github.com/hraness/wrench/issues/186)
is complete in source and independently reviewed. The single invocation program
owns qualification, durable preparation, dispatch, reconciliation and cleanup;
the existing native storage and process kernels retain authority. Public Promise
facades and the immediate durable callback prefix remain part of the contract.

The first broad causal run retained 167 passes, 13 failures and 4,927 assertions.
One failure exposed a real admission regression: providing an already constructed,
resource-free service through `Layer.succeed` entered the pinned runtime's
asynchronous memo-map semaphore before the write program. Direct service provision
removes that boundary while preserving one interpreter. The immediate public-call
and journal assertions remain unchanged; a delayed test observation would not
prove this law.

Eight cleanup fixtures compared uncanonicalized temporary paths against native
canonical storage paths, and three projection fixtures targeted the generic
writer instead of the existing conditional receipt writer. Those fault seams now
match the production paths and still require the original selected rejection and
durable outcomes. The CAS property reached its existing ten-second limit after
18 trials. It now constructs only the unaffected prefix with the production
reducer, then exercises the chosen physical commit, repeated stale-snapshot
refusal, exact bytes, readback and next native transition. Its 24-run setting and
deadline remain unchanged; complete schedule semantics retain their separate
reducer property.

Source checkpoint `bfe0ea8b92e5924291eb1e522e4a8e0b8af72d50` contains these
reviewed repairs and [the ownership guide](../../docs/effect-confirmed-write-runtime.md).
The fresh focused sequence passed 180 causal tests and 4,878 assertions, full
TypeScript and the unchanged architecture policy. The immediate public-call
oracle passed without delayed observation; all cleanup/projection controls and
the 24-case native CAS property passed within its unchanged deadline.

Independent terminal review matched all 785 source files and modes, six command
logs and the runner. The focused receipt has SHA-256
`80cf9b7ceb141c4137589316004ea87edf5b160c01dee7f408293b4180087749`;
its independent review is
`88186c9ace6a8e9ac5167346709b95ab692d43d6f7fd267ef56334616216abe4`.
The failed attempts remain historical evidence. Candidate 0.16.11 still requires
generated/package convergence, KB checks, the fresh full aggregate/native gates
and current-head CI. Public npm, immutable Release and production are separate
later admissions. Released baseline 0.16.10 at
`521922ed2c81441aeab2cddb67cde5d8ffe078c9` remains the comparison and recovery
coordinate until that delivery completes.

## Recovery

Keep the exact released 0.16.10 source available until the successor completes
its full delivery. Preserve failed/ambiguous journals, claims and private native
artifacts for existing doctor/recovery procedures. Never infer safe rollback or
permission to retry from interruption, failed receipt projection or missing
acknowledgment. Preserve staged bytes and unresolved stage intent if publication
is interrupted; use only the documented exact-version recovery procedure.
