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

Implementation in progress in an isolated checkout at base
`5fb740ec4fef243734734bfbd917ed09bc7001c2`.
