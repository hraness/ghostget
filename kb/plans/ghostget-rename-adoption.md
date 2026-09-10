---
type: plan
area: delivery
status: in-progress
tags: [rename, release, social-stats]
---

# Adopt the Ghostget repository rename across delivery

Finish the delivery chain's adoption of the GitHub rename from `hraness/wrench`
to `hraness/ghostget`, release Ghostget 0.17.0, pin it into Jungle, and restore
the daily social-statistics collection that the rename and the earlier
authenticated-web cleanup defect interrupted. This plan is the takeover map: it
records what already landed, what is in flight in PR #207, and the exact
remaining work in dependency order, so any agent can continue without
rediscovery.

## Context

GitHub renamed the repository to `hraness/ghostget` on 2026-09-09. The rename
is intentional and identity-preserving: `gh api repos/hraness/wrench` redirects
to the renamed repository and both paths return immutable repository ID
`1316443113` with default branch `main`. Every delivery gate that bound the
exact old name began failing closed.

Two changes have landed on `main`:

- PR #204 (squash commit `1ca41f4a`) merged the authenticated-web cleanup
  convergence fix together with the minimal CI unblock: `release-source-ci.ts`
  now accepts both repository names only when bound to repository ID
  `1316443113`, in `githubEnvironment()` and `repository()`, with regression
  coverage in `github-release-artifact.test.ts`. Pull-request CI, the merged
  push run on `main` (run `34435978970`), and CodeQL are green under the new
  name.
- The cleanup fix matters beyond CI: LinkedIn personal, LinkedIn company, and
  Instagram reads in the daily social-statistics collection have failed
  `cleanup-required` since 2026-09-05/07, so those series have no fresh points.
  The fix only takes effect for collection once a Ghostget build containing it
  is pinned into Jungle.

The complete rename is in flight as draft PR #207, "Rename Wrench to Ghostget
with durable compatibility" (branch `codex/ghostget-rename`): the full product
rename to Ghostget 0.17.0 across CLI, package, skill, documentation, website,
and every release/production identity check, while keeping historical Wrench
releases, receipts, and encrypted state readable. Its branch already contains
current `main` including `1ca41f4a`.

## Scope and non-goals

In scope: PR #207 completion and merge, the Ghostget 0.17.0 canonical release,
the Jungle pin, and the resumed collection. Out of scope: any new npm listing
for Ghostget (blocked pending provider classification approval per the PR #207
description), backfilling missed social-statistics dates (the snapshot contract
forbids synthetic or carried values), and rewriting historical release
evidence.

## Constraints and decisions

- Identity binding stays name-plus-ID. Accepting a repository name alone is
  never sufficient; every check that gains the new name must keep the exact
  numeric identity `1316443113`. PR #204 set this pattern.
- Fresh GitHub API responses carry the new name in `full_name` and generated
  URLs, while stored artifacts created before the rename (CodeQL check
  summaries, release receipts, recorded asset URLs) carry the old name.
  Verifiers of stored evidence keep admitting the old name; checks on fresh
  responses expect the new one.
- Repository AGENTS.md admin gates are unchanged by the rename: before any
  stable tag push an administrator must freshly prove immutable Releases and
  the two tag rulesets, and the Vercel project (`prj_TZbDZ38ABPan158IqnczgsuTu6Ue`)
  plus App installation `158077029` bindings are ID-based and expected to
  survive the rename, but each requires readback confirmation before the
  0.17.0 release rather than assumption.
- If collection must resume before 0.17.0 ships, Jungle may pin exact commit
  `1ca41f4a` instead of a release; repository policy allows pinning reviewed
  immutable releases or full commits. This is an interim measure only and does
  not replace the release.

## Work in dependency order

1. Make PR #207 CI green. Current head `a831b7bc` fails one job: `package`, at
   the step "Check the canonical npm archive before tagging" (run
   `34437025340`, job `102744135174`); all other completed jobs pass. Diagnose
   from the job log after the run completes, fix, and keep the PR's rename
   semantics intact.
2. Take PR #207 through the repository's normal gate: independent impact and
   diff review against prior required coverage (workflow files changed:
   `ci.yml`, `release.yml`, `npm-stage.yml`, `website-production.yml`),
   complete `Required` CI and CodeQL on the final head, mark ready, and merge
   serially.
3. Perform the pre-release administrator readbacks (immutable Releases, tag
   rulesets, Vercel project link, App installation repository set) and release
   Ghostget 0.17.0 through the documented canonical flow in `docs/publishing.md`.
4. Pin the released 0.17.0 into Jungle through its merge-queue delivery flow,
   or pin commit `1ca41f4a` earlier if a collection day would otherwise be
   lost.
5. Run the daily `$publish-hraness-social-stats` collection with the pinned
   build and confirm LinkedIn personal, LinkedIn company, and Instagram return
   exact observations instead of `cleanup-required`.

Parallel-lane boundary agreed on 2026-09-10: a separate session owns PR #201
(LinkedIn contacts.read Como fix), the LinkedIn connections capability on
`claude/linkedin-connections-20260910`, and PeopleBlade consumption; this
plan's lane owns the rename-chain files and must not touch those.

## Verification

Each step carries its own gate: PR #207 needs complete `Required` plus CodeQL
on its final head; the release needs the full canonical admission, attestation,
and production-promotion contract; the Jungle pin needs its local affected
validation, merge-queue delivery verification, exact-SHA CI, and public
readback; the collection needs the manifest-bound sequential run and public
readback described in the social-statistics skill.

## Recovery

Every gate in this chain fails closed without mutating release or production
state, so a failed attempt is rerun after repair rather than rolled back. If
the 0.17.0 release stalls after PR #207 merges, the interim commit pin keeps
collection running. If PR #207 itself must be abandoned, `main` remains fully
functional for pull-request and push CI under the new name via the PR #204
compatibility fix; only canonical release and production promotion stay
blocked until an equivalent rename adoption lands.
