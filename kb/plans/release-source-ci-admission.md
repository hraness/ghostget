---
type: plan
area: delivery
status: in-progress
---

# Admit completed source CI before building a release

Release should consume the complete successful CI evidence for its exact source
and retain fresh artifact verification. The prior successful canonical run spent
49 minutes 26 seconds in `bun run check`, followed by 75 seconds preparing and
installing the exact npm archive. Required main CI had already covered the same
source commands through static, package, four whole-file unit shards, serialized
omni and standalone jobs, with an additional selected macOS job.

## Decision and scope

The repository already accepts this disjoint CI union as its final source gate.
The publishing guide and workflow encoded the duplicate command, but no separate
requirement makes global phase order or one shared Bun process across all unit
files an acceptance criterion. The reviewed change replaces that command with
direct provider admission of the exact main-push source. Local `check`, `prepack`,
within-file behavior, serialized omni, explicit focused native/coupled acceptance,
and the optional npm mirror's full check remain required.

Every CI source job now uses Node 24.20.0, npm 11.19.0 and Bun 1.3.14 and records
its actual versions, checkout tree, workflow and lock hashes before installation.
The Release verifier requires all ten successful jobs on the current attempt,
nine actual checkout logs and those records. It binds the active workflow, exact
repository and source, both successful CodeQL jobs, two analyses from that exact
current language job's interval, and the merged PR's same-tree successful security
comparison. Earlier analyses remain history. Any present main comparison must
succeed; analysis counts are not a zero-alert assertion. A second control read
rejects drift before admission returns.
Every required source and CodeQL job must finish within the prior 72 hours.
This bounded window supports ordinary multi-day release coordination; a later
release needs a complete unattended CI rerun. Future, malformed and stale job
times fail closed rather than relying on mutable run update timestamps.

The caller still proves the protected lightweight tag and current-main control
closure. The new helper joins that closure and uses only bounded GitHub GETs.
Verify alone gains the documented read permissions for Checks, Pull requests and
Security events. The source receipt is logged without changing the signed
four-subject, five-asset contract. A fresh frozen install, deterministic build,
generated-tree cleanliness, dry pack, seven Node imports, canonical npm packing,
strict archive checks and exact consumer smoke remain before attestation.

This work is isolated from the active `v0.16.16` release checkout. It changes no
runtime, version, dependency, lock, package budget, published guide or package
bytes. Integration waits for that release's nonpublishing mirror closeout.

## Verification and recovery

Independent review compares each workflow command, shard, deadline, platform,
failure propagation and native provisioner with the previous coverage. Regression
fixtures reject omitted or failed jobs, wrong source/tree/attempt/toolchain,
foreign or ambiguous security associations, old analyses and evidence drift.
Workflow mutation tests reject conditional or ignored admission failures and
preserve the fresh build/install order. Complete current-candidate CI remains
the final source gate, followed by actual-main CI and source readback.

Missing or unavailable provider evidence stops the release before dependency
installation or artifact creation. There is no automatic rerun, queue, alternate
receipt or fallback that skips admission. Retain the failure and repair the
source or provider prerequisite through the normal reviewed path. Earlier tags,
artifacts and run attempts stay unchanged.

The initial focused helper/publication/CI run passed 18 tests and 419 assertions.
The isolated frozen install and managed baseline check passed. The targeted
TypeScript command initially required TypeScript 6's `--ignoreConfig` when naming
a source file; the corrected strict command passed. Complete static validation
then passed the website/edge suite (73 tests, 5,200 assertions), all 106 release
contracts (7,067 assertions), repository/website/edge types, the architecture
policy and site build. The changed native provisioning-order contract passed
1 test and 11 assertions without launching a browser. Independent review found
JavaScript date normalization could accept an invalid calendar date; the strict
round-trip repair and all ten helper/publication tests passed with 207 assertions.
Helper types, bounded KB percolation, refresh and the complete KB/21-guide check
passed. All 501 packaged bytes and modes still equal the admitted `v0.16.16`
archive and original clean source. Final review and current-candidate CI remain
pending.

GitHub documents the runner identity in its [variables reference](https://docs.github.com/en/actions/reference/workflows-and-actions/variables),
the analysis read permission in the [code-scanning API](https://docs.github.com/en/rest/code-scanning/code-scanning#list-code-scanning-analyses-for-a-repository),
and job permission scoping in [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions).
