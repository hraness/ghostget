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

## Execution log

### 2026-09-10: repository rename invalidated every locked Wrench archive

Decision and evidence from the Jungle-pin lane (Claude Code session
`documents-3f`), recorded so the release lane and later agents do not
rediscover it.

- GitHub serves archives for pre-rename commits with the root directory
  `hraness-ghostget-<sha>/` instead of `hraness-wrench-<sha>/`, so the bytes and
  hashes changed. Bun locks the SHA-512 of the
  `api.github.com/repos/<owner>/<repo>/tarball/<sha>` response, so every
  `bun.lock` that resolves `github:hraness/wrench#<sha>` now fails
  `IntegrityCheckFailed` on a clean install regardless of which name the
  specifier uses. Verified by downloading the pinned commit under both names
  (identical bytes, neither matching the old lock) and by matching the new lock
  entry to a fresh API-tarball download.
- Jungle `main` push CI failed for exactly this reason from 02:51 UTC (run
  `34431084709`, "Integrity check failed for tarball: @hraness/wrench"),
  which also blocked its merge queue and therefore the daily social-statistics
  delivery. GitHub code search over the organization found only Jungle and
  PeopleBlade manifests with `hraness/wrench#`; PeopleBlade's lock still
  resolves `github:hraness/wrench#b0cf2ec` (Wrench 0.16.8) and belongs to its
  own owner.
- Step 4 executed as the interim exact-commit pin rather than waiting for the
  release: Jungle `@hraness/wrench` moved from
  `github:hraness/wrench#bb28af47` (0.16.9) to
  `github:hraness/ghostget#1ca41f4acda6cc77616d43fe8f6a7303eaf1ff28`
  (0.16.17, the `#204` cleanup fix), with `PINNED_WRENCH_VERSION` and the pin
  assertions updated and `bun.lock` regenerated under Bun 1.3.14. The lock
  diff is bounded to the Wrench entry, its nested `@hraness/kb` 0.17.1 →
  0.19.6 release asset, `@hraness/oh`, Sweet Cookie 0.4.3, and `yallist`
  hoisting. Evidence: frozen install from an empty download cache, the
  standalone-tool, workspace, dependency-proposal, social-stat-manifest, and
  refresh-social-stats tests (47 pass), and the Jungle merge queue's full
  repository gate (item `mq_4cc09fa30b989474be39fe51`). Landed on Jungle
  `main` as `87d663660` at 05:06 UTC; push CI run `34439771745` completed green, the first green `main` run since the rename.
- Step 5 cannot run from the machine that did step 4: none of the manifest's
  twelve authenticated realms exist there, and the collection skill binds the
  other workstation's toolchain path. The daily collection fetches `origin/main`
  fresh, so the pinned build is picked up by the next scheduled run without
  further action. Verification of step 5 is the next
  `chore(hraness): publish social stats` commit showing exact LinkedIn
  personal, LinkedIn company, and Instagram observations (last exact points:
  2026-09-05, 2026-09-04, 2026-09-01).
- The 0.17.0 Jungle pin remains a separate follow-up after the canonical
  release verifies: the Codex-prepared Jungle rename change (89 files, pin
  `github:hraness/ghostget#v0.17.0`, lock deliberately not regenerated) waits
  for the real archive so the lock resolves the immutable release asset.

## v0.17.0 admission failure and the v0.17.1 decision (documents-aa, 2026-09-10)

- PR #207 merged as `4e2a56a`; PR #209 (script-literal escaping for the
  remaining page-script providers) merged as `7967214` and carried the
  `v0.17.0` tag. Release run `34442137619` failed in Verify at "Admit exact
  source CI and security" with only "bounded read-only command failed".
- Local `admitSourceCi` from the exact checkout passed all 45 reads. A
  branch-only diagnostic under the Verify job's exact permissions (run
  `34442630921`) showed every JSON read succeeding and every job-log read
  failing: the runner's `gh` 2.100.0 refuses output containing terminal escape
  sequences unless `--allow-escape-sequences` is passed. This was the admit
  step's first execution on a runner.
- Tags are immutable, so `v0.17.0` stays an assetless failed request.
  `v0.17.1` passes the flag for log reads only, bumps the version and
  documentation, and is the first canonical Ghostget release; the Jungle pin
  targets `github:hraness/ghostget#v0.17.1`.

## v0.17.1 released and the domain cutover completed (documents-aa, 2026-09-10)

- PR #213 merged as `b74ae2a`; tag `v0.17.1` pushed from a ref-free staging
  checkout after fresh immutable-release and tag-ruleset readback. Release run
  `34444796271` attempt 1 passed admission (the `--allow-escape-sequences`
  fix), attestation, and publication: immutable release `386047282`,
  `hraness-ghostget-0.17.1.tgz` 2,259,943 bytes, SHA-256
  `b87b293075a8698c79d5d90615dbb9e59a8f2d152682f6878c8d8ec0423a3710`,
  SRI `sha512-gvqaSQCFBp44ZYnk5gKxdm+MQRZ47bkuEIonmasQ9lxmnYCNMNY5VMkg2aYLLhq0cy6OQEiBeTDSSymYikFq1g==`.
  The repository downloader verified all four signed subjects and the website
  release verifier passed at that commit.
- Promotion run `34445060834` advanced `website-production` through the
  release App; `ghostget.com` serves the v0.17.1 marker and `www` returns the
  exact 308.
- `wrench.rip` and `www.wrench.rip` now return 308 to `ghostget.com` on the
  same Vercel project, preserving path and query.
- Downstream rename pull requests merged: rolodex #8, tiff #20; message-like-me
  #61 and .github #12 follow their checks. The Jungle pin moved to
  `github:hraness/ghostget#v0.17.1` in the Jungle lane.
- Still owner-held: the Cloudflare Turnstile hostname for `ghostget.com` and
  the Accounts mailing keyring hostname; the external directory submissions
  are updated locally but not pushed; npm publication of `@hraness/ghostget`
  remains held pending the dual-use classification decision.
