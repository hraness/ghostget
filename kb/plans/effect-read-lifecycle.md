---
title: Own bounded read invocation lifecycles with Effect
description: Move R1 receipt sequencing and selected statistics reads to typed Effect programs while retaining native custody and immutable provider contracts.
type: plan
area: runtime
status: in-progress
repository_scopes:
  - src
  - scripts
  - package.json
  - bun.lock
  - docs
  - kb/plans/effect-read-lifecycle.md
tags:
  - runtime
  - providers
  - validation
---

# Own bounded read invocation lifecycles with Effect

## Outcome

R1 invocation owns provisional receipt persistence, execution, bounded decoding,
zero-dispatch validation, redaction, final persistence and output publication in
one typed program. GitHub organization pagination and LinkedIn authenticated
self-profile statistics use product-local services and scoped resources.

## Invariants

Public Promise interfaces, canonical wire data, exact provider/account identity,
response byte/page/deadline limits and retry policy remain stable. R2/R3 write
confirmation, durable dispatch and journal authority remain in their existing
interpreter. A completed fiber is never proof that a native process, browser or
private root is quiescent. Exact cleanup admission and portable lease custody
remain authoritative. No operation gains a new endpoint, credential, script or
remote write capability.

## Implementation

Tracked in [issue171](https://github.com/hraness/wrench/issues/171), including
the source-local callback-record proof required by Effect Micro.

Pin Effect 3.22.1 and retain TypeScript 6.0.3. Programs compose typed failures;
foreign I/O lives in named local adapters and Promise interpretation occurs at
public plugin/runtime boundaries. Keep pure parsing helpers independent. Remove
replaced lifecycle plumbing, install the reviewed architecture checker with
paired fixtures, and preserve all existing repository gates and package-root
inertness checks. Record any deliberate compatibility restriction separately.

## Validation

Run focused provider, HTTP/deadline, invocation and custody tests after source
converges. Include regressions for failure translation, cancellation, cleanup
precedence, receipt failure and zero-dispatch publication. The integration owner
runs the complete scheduled repository gate and any required native gate on the
reviewed tree. Provider contracts and packaged dependency closure must remain
verified. Public npm promotion remains subject to the existing stage-only
release boundary.

## Status

The source implementation is reviewed and the 0.16.9 candidate is prepared on
main `b9f6ef8b1f54f232781951ffa85ae61349bb59de`. This includes upstream strict
natural-exit browser cleanup and the X UserTweets descriptor refresh. The
existing 0.16.8 npm stage retains its original source and owner. This plan stays
in progress through package, current-head checks and governed release delivery;
neither a local candidate nor a successful npm stage is public availability.

## Review and execution evidence

The source-local Micro callback proof, R1 invocation, selected provider programs,
native cleanup ownership and UTF-8 queue ordering received independent review.
The browser join adds two causal tests through the actual profile transport,
Effect runtime and durable admission. They prove safe release after native
cleanup despite a lost close acknowledgement, and retained unsafe admission
despite proof arriving after the existing cleanup-join timeout. Native browser
tests separately prove the physical owner, endpoint and private-root evidence.

The joined transport and current Beeper identity suite passed 19 tests and
1,287 assertions on the b0cf2ec-based source later committed as `4189913`,
followed by compiler and architecture checks on the same frozen source. An
earlier full run exposed a test that confused current source
closure with a frozen historical durable contract. Its repair independently
derives both identities and preserves mutation sensitivity; no production
identity constant changed. That stopped run is not a successful full gate.

The complete final repository check, exact installed-package proof, KB check,
current PR Required (including macOS) and release readbacks remain delivery
gates. Record their exact completed coordinates in the linked issue and PR;
earlier focused receipts do not admit a later source tree or artifact.

## Performance tradeoff

One controlled sequential catalog-import comparison, from base `5fb740ec` to
the earlier Effect candidate `315c573`, measured 1,605.646 ms versus 2,961.797 ms
and 638,599,168 versus 733,413,376 bytes of ending RSS. The 1.84-times startup
and additional 90.4 MiB are material costs. This is one observation per tree,
with uncontrolled filesystem cache and co-scheduling; it is not a current-tree
latency distribution, peak-memory measurement or coding-model token benchmark.

Profiling identified complete package identity and source parsing as the main
costs. Ordinary modules keep parent-free parsing, with binding analysis only
for the exceptional private-record proof. Pre-encoded queue keys preserve
ordering without caching or skipping a fresh trust observation. Retain the
measured limitation when deciding which remaining provider families to migrate.

## Durable memory

The maintained [read runtime ownership](../../docs/effect-read-runtime.md)
document owns native proof, error precedence, local capability roles and the
scanner's bounded exception. The source tests own the executable cleanup and
current-versus-durable identity laws. The
[publishing procedure](../../docs/publishing.md) owns candidate, pending-stage,
public-artifact and immutable-release authority. No shared production runtime
was extracted: the local custody and publication laws do not become generic
because their programs use the same Effect primitives.
