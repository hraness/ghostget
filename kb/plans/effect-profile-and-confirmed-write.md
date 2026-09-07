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

## Recovery

Keep the exact released 0.16.10 source available until the successor completes
its full delivery. Preserve failed/ambiguous journals, claims and private native
artifacts for existing doctor/recovery procedures. Never infer safe rollback or
permission to retry from interruption, failed receipt projection or missing
acknowledgment. Preserve staged bytes and unresolved stage intent if publication
is interrupted; use only the documented exact-version recovery procedure.
