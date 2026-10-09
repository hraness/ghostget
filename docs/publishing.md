# Publish Ghostget

Ghostget starts at `@hraness/ghostget@0.17.5`, with command `ghostget` and the
existing seven SDK subpaths. GitHub Releases became canonical under the former
`@hraness/wrench` name at v0.16.13. Historical manifests, archive filenames, and
signed provenance keep that original identity. npm carries the identical
canonical archive: the same tag Release workflow publishes it through OIDC
trusted publishing immediately after the immutable GitHub Release, with no
dispatch, staged approval, or two-factor prompt. An npm failure never unpublishes
or blocks the GitHub Release, and it is rerun from the same run. Historical versions and assetless Releases through v0.16.12 remain
unchanged.

## Admit the canonical GitHub artifact

Start from the exact reviewed source commit `C` merged below protected `main`.
Complete the repository's applicable source, focused native, package/install,
and independent review gates. Keep Node 24.20.0, npm 11.19.0, and Bun 1.3.14. The
release workflow admits the exact commit's successful default-branch CI run
before installing dependencies. This replaces its duplicate serial `bun run
check`. The complete local aggregate and `prepack` still run `bun run check`,
which now ends with `bun run verify`; see `CONTRIBUTING.md` for its local
prerequisites. The CI union
covers static checks, package and isolated Bun-consumer checks, every whole-file
source shard, serialized omni tests, standalone checks, selected macOS checks,
and the formal-verification checks.
Explicit focused local/native and coupled reproductions still apply under
`CONTRIBUTING.md`. The npm mirror consumes the attested canonical archive after
exact-source CI admission and independently checks its identity, digest, and
provenance. It does not rebuild or rerun source checks.

`scripts/release-source-ci.ts` reads GitHub's current run attempt directly. It
requires the exact repository, active workflow ID/path, main-push source and tree,
all nineteen successful jobs, and eighteen actual checkout logs. Each source job
records its exact workflow/lock hashes, Node/npm/Bun versions and GitHub-hosted platform
before its frozen install. Admission also requires all four successful
exact-source CodeQL jobs and current main analyses for Actions,
JavaScript/TypeScript, Python, and Rust, plus the successful
security comparison on the merged PR's identical tree. Any present main comparison must succeed;
analysis result counts are recorded without asserting that no alerts exist.
The CodeQL app's check must identify that exact PR through its returned PR
association. If GitHub returns an empty association array, only its exact
repository-and-PR-specific `View all branch alerts` summary is accepted instead.
A nonempty contradictory association never falls back to the summary. This
observed provider format is matched literally; future formatting changes stop
admission until reviewed, and do not justify skipping the security comparison.
Every required CI and CodeQL job must have completed within 72 hours of admission,
with valid start/completion times and no future completion. This permits normal
overnight and multi-day delivery while bounding reuse; older source requires an
ordinary complete CI rerun before tagging. Each analysis must fall inside its
current attempt's corresponding language-job interval. Mutable run update times
alone never establish freshness.
Missing, failed, skipped, ambiguous, stale-attempt, or drifting evidence blocks
the release. The helper samples the control evidence again before returning and
logs its bounded receipt; it never reruns CI or accepts a caller-supplied receipt.
Only the read-only Verify job adds Checks, Pull requests and Security events read
permissions for these API reads. Publication and attestation permissions stay
unchanged.

PR #272 moved the repository-owned Swift menu into the pinned shared desktop
foundation. The current repository has no tracked Swift source; its verification
oracles added in PRs #357 and #358 include Python and Rust. GitHub's default setup
scans Actions, JavaScript/TypeScript, Python, and Rust. Admission requires exactly
those four jobs and analyses, with missing or extra languages rejected.
The shared foundation owns its native source checks and published artifacts.
Reintroducing another source language requires a reviewed coverage update.

When the native host first entered `main`, GitHub's automatic CodeQL setup
produced two runs on that source: the existing two-language scan and a new
three-language scan including Rust. That transition source remains ambiguous
and cannot qualify a release. That source-admission correction required a fresh
merged source with one complete three-language run; neither scan was deleted or
selected as a substitute for the unique-run gate.

After admission, Release still performs a fresh frozen install and deterministic
build, checks generated `dist` and `bun.lock` cleanliness, dry packing and all
nine Node imports. Its new exact npm archive passes the strict artifact parser
and isolated consumer smoke before attestation or publication capability is
available. CI also packs with the same Node/npm versions and canonical npm
command, then checks the archive parser and calls the actual canonical
preparation function before tagging. That CI preparation uses explicit synthetic
source/run coordinates in its temporary directory; it creates no provenance and
grants no publication authority. Record the Node zlib
build and platform with package measurements; equal Node/npm versions alone do
not establish equal gzip bytes.

Choose a new stable package version greater than every completed stable
Release. A raw tag is a request, not a completed publication. Check the package
version, `src/version.ts`, generated package bytes, installation examples,
changelog, and asset filename together. Dependency upgrades must preserve the
reviewed native browser and cookie contracts and pass their focused checks.

Merging the version bump releases it. When that commit's own `CI` run for its
push to `main` succeeds, `.github/workflows/auto-tag.yml` creates one direct
lightweight `v<version>` tag on that exact commit through the
`hraness-release-tagger` GitHub App, which starts **Release**. Auto-tag never
moves or replaces an existing tag. Do not overwrite, annotate-convert, move, or
delete a historical tag to recover a run. The actor and triggering actor must
each be owner User `894119` or `hraness-release-tagger[bot]` Bot `337004703`;
the protected tag, public repository `hraness/ghostget` / `1316443113`, and
Release workflow `323493609` remain bound at each capability boundary. Keep
Administration out of workflow tokens; an administrator re-reads the immutable
Releases setting and tag rulesets at setup, after any control change, and during
drift recovery, and the residual setting-toggle window remains explicit.

If auto-tag did not run, the owner pushes the same lightweight tag. Push it
only after the admitted commit's own `CI` run for its push to
`main` has completed successfully. Release admission reads that run once and
never waits, so a tag pushed while it still runs fails the first Release
attempt; a rerun of the same run still admits it. The website deploys
independently from `main` and is unaffected by Release attempts. Main
push runs are never cancelled by a later merge, so the run for `C` always
finishes:

```sh
sha=<C>
run_id="$(gh run list --repo hraness/ghostget --workflow CI --event push \
  --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId')"
test -n "$run_id"
gh run watch "$run_id" --repo hraness/ghostget --exit-status
```

If the Release still needs a rerun, dispatch **Promote website production**
with the tag as soon as the rerun publishes, rather than waiting for a later
release.

The canonical asset set is exactly:

- `hraness-ghostget-<version>.tgz`, packed once with `npm pack --ignore-scripts`.
- `npm-pack.json`, the receipt for those exact bytes.
- `release-manifest.json`, the strict `hraness-github-release-v1` identity,
  including repository/name/version/tag, source `C`, reviewed workflow authority
  `W`, run ID/attempt, and archive size/SHA-256/SHA-512.
- `SHA256SUMS`, covering the preceding three files in that order.
- `provenance.jsonl`, the GitHub attestation bundle for all four build files.

The transfer envelope admits an archive of at most 12 MiB from `v0.18.1`;
earlier archives retain their 8 MiB limit. The measured compressed package
budget remains a separate, stricter admission check. The packing receipt and
manifest remain limited to 1 MiB, checksums and provenance to 8 MiB, and GitHub
JSON/log command output to 8 MiB. Preparation, downloads, draft readbacks,
attestation handoff, and npm handoff use the same file-specific limits without
changing any source, digest, signed-identity, or five-file inventory checks.

Ghostget has no separate platform-native release assets. Its optional native
providers retain their existing installation, identity, and live admission
requirements. Publishing the CLI does not establish live provider qualification.

The canonical release pipeline publishes the CLI from an exact source checkout.
Local controls are terminal commands ([`controls.md`](controls.md)); the
signed macOS cookie reader resolves the shared helper from the pinned
desktop-foundation release, and Ghostget publishes no platform sidecar of its
own.
There is no desktop app bundle or native installer. Native provider checks retain
only their own installation and live admission requirements.

The read-only build uploads a run-and-attempt-specific artifact. A separate
checkout-free attestation job reauthorizes the exact owner/run/tag before
requesting OIDC, validates the four-file handoff, and invokes pinned
`actions/attest` with registry publication and storage records disabled. The
publisher independently reauthorizes the run before checkout, verifies each
file with `gh attestation verify`, and binds the successful verifier's signed
certificate to the exact numeric repository/owner IDs, source/ref, workflow,
GitHub-hosted push, and run ID/attempt. Predicate metadata alone is not authority.
The publisher downloads the attested artifact only by the numeric artifact ID
that the attestation job output, after a step proves that ID and the carried
handoff identities are exact; an empty ID would select every run artifact.
Re-running only the failed jobs of a run carries the verify and attestation
outputs and that artifact unchanged, so the rerun publishes the exact bytes an
earlier attempt of the same run attested. Its manifest may name that earlier
attempt, never another run or a later attempt, and every signed certificate
must name the same attempt. A failed attestation job cannot be recovered that
way because attestation downloads the build of its own attempt; re-run all jobs
instead.
The source archive and npm receipt must also agree on every inspected safe
USTAR entry, mode, count, size, and integrity. Reject extra files, traversal,
links, malformed receipts, unsafe package configuration, and mismatched bytes.

Publication discovers retained drafts through the bounded authenticated release
inventory when the by-tag endpoint returns 404. It retains the exact release ID,
creates a draft only when absent, and uploads only missing exact names without
clobber. Before publication, it validates all five descriptors, downloads each
exact asset ID with its admitted byte bound, and compares its actual bytes and
SHA-256 to the verified local artifact. It rechecks current protected
main/tag/release-control closure and stable Release ordering, then publishes it
as immutable Latest and repeats the exact downloaded-byte proof. Keep the
existing bounded Latest convergence check and terminal authority readback.
A matching partial draft or published Release from the same attesting attempt,
including one a failed-jobs rerun of that run resumes, may resume only with
matching source, bot, body, and every already uploaded asset. A mismatched
draft or another attempt fails closed and retains evidence;
never delete/recreate it or silently relabel it. A completed release is accepted
only with its original signed identity, never with a newly rebuilt artifact.
Re-running all jobs after publication rebuilds under a new attempt, which that
body check rejects, so that run can no longer complete npm. Manual website
recovery still admits the Release through its earlier receipt attempt's job
inventory or, when a failed-jobs rerun published it after that receipt attempt,
through that rerun attempt's own job inventory.

The Release workflow does not hold the production App key, touch production
refs, or wait for Vercel. The separate production workflow cryptographically
verifies the canonical archive before collecting the provider baseline.

The `v0.16.13` request passed its complete source gate but failed canonical
preparation because its npm archive exceeded the compressed-byte ceiling. No
canonical assets were uploaded or published. Retain that tag and failed run;
`v0.16.14` also remains unpublished: its first attempt was interrupted without
a proven cause, and its one complete recovery failed strict consumer typing
after resolving incompatible floating declarations. Keep both attempts and
the tag intact. `v0.16.15` pins the consumer compiler and declaration tuple to
the source-qualified versions and was admitted as an immutable canonical
Release with verified public installation. Its first nonpublishing mirror
failed before canonical download because the pack step omitted `DEFAULT_BRANCH`.
The reviewed workflow correction preserves strict main/ref authority.

The correction's main CI then exposed a concurrent browser-claim creation error.
The `v0.16.16` candidate retries only exact read drift after unchanged ownership
reconciliation, using the existing backoff and deadline. Retain the failed runs
and immutable `v0.16.15`; admit and publish the new candidate before using its
installation or mirror commands.

The `v0.17.0` request, the first Ghostget tag, passed its owner, tag, and
package identity checks but failed the new source-CI admission before any
canonical asset was built: the hosted runner's `gh` 2.100 refuses to print job
logs that carry terminal escape sequences unless `--allow-escape-sequences` is
passed, and every job log does. The helper now passes that flag for log reads
only. Retain the assetless `v0.17.0` tag and its failed run; `v0.17.1` is the
first canonical Ghostget release.

The `v0.17.4` request, the first tag after npm publication moved into the
Release workflow, passed its owner, tag, and package identity checks but
failed source-CI admission before any canonical asset was built: `main` had
accumulated one hundred CodeQL analyses, so the helper's single hundred-entry
page read tripped its own truncation bound. The helper now reads a bounded
twenty-entry newest-first window, in which the exact current-main analyses
always sit, and rejects only an oversized window. Retain the assetless
`v0.17.4` tag and its failed run; `v0.17.5` is the first release published to
npm by the Release workflow.

The `v0.18.1` request passed source-CI admission, then Release run
`34675956810` failed canonical preparation: its verified 11,649,726-byte archive
exceeded an older 8 MiB transfer limit, despite passing the stricter measured
package budget. No canonical assets, attestations, or publication were produced.
Retain that tag and failed run. The correction applies file-specific limits to
every canonical archive consumer and adds real canonical preparation to PR CI;
delivery proceeds through a new source-qualified version.

## Publish the immutable GitHub Release

Checked-in `CODEOWNERS` assigns source ownership and notification for the
workflow, Release helper, and publishing policy paths. It does not claim live or
independent review enforcement. Live Protect-main ruleset `20921911` has no
bypass actors, retains the pull-request path and exact Required integration
check, requires no approving review, and does not require code-owner review.
Ghostget currently has one eligible maintainer, so
`require_code_owner_review` must remain `false` and the approval minimum must
remain zero until a second eligible independent code owner exists. Enabling it
now would make the repository unreviewable rather than safer. Repository Actions
default to read, and the checked workflow census leaves only the Release
`publish` job with a `contents: write` `GITHUB_TOKEN`; no other job carries a
write token.

The tag workflow admits the canonical artifact, creates or resumes the exact
draft, verifies its uploaded asset descriptors, and publishes the immutable
Latest Release. Only an authenticated exact REST 404 permits draft creation;
other lookup failures abort. A pre-existing draft must bind the original exact
Actions bot, run/attempt, source receipt, direct lightweight tag, and every
already uploaded asset. No clobber, deletion, relabeling, tag movement, or
rollback is permitted. The only publication PATCH changes the admitted draft
to non-draft and requests Latest after the complete five-file readback.

Before each draft creation, missing-asset upload, and publication, fetch only the
fully qualified governed main and tag refs, prove `C<=M`, and require unchanged
release controls. The release-ref helper's closure includes `.github/workflows`,
the release-ref, source-CI, npm provenance/package identity, package
artifact/budget/smoke, packed private-source runtime, canonical artifact and
publisher, provider-outcome, and release-notes modules. It observes
two equal bounded combined main-plus-tag advertisements around that proof.
Current main may move linearly while preserving those controls. The publication
path also exhausts the bounded completed stable-Release ordering census before
creating or publishing a draft; a higher raw tag alone is an incomplete request.
It repeats that census after the terminal authority proof, and on a completed
target, so a higher stable Release that completed out of band during publication
fails the run instead of leaving the older target as Latest.
The canonical artifact has no dependency on npm latest.

After publication, require exact immutable release and asset readback, bounded
Latest convergence, and terminal protected-ref/control-closure verification.
GitHub has no conditional lease for publishing a Release, so a concurrent
control-plane change may make readback fail after publication. Preserve that
immutable release and inspect current authority; never delete or rewrite it.
If another immutable release becomes Latest, recover from its actual coordinate.
A supersession after the final read is not observable by the completed workflow.

The create request sends the verified SHA `C` as `target_commitish`, but GitHub
may normalize that response field to the default branch when the protected tag
already exists. Response `target_commitish` is informational and is not release
authority. Every publication readback instead requires Actions bot ID
`41898282` with type `Bot` and a deterministic trailing identity record binding
repository, tag, source SHA, and `GITHUB_RUN_ID`; the separately
read protected lightweight tag must still peel to `C`. The Release page follows
the Hraness release page standard: the title is `Ghostget vX.Y.Z`, and the body
is a summary, `## Changes`, `## Install`, and `## Verify`, followed by the
identity record as one HTML comment that forms the final bytes of the body. The
verify job renders the summary and changes from the version's `CHANGELOG.md`
section in the tagged commit with `website/release-notes.mjs`, fails when that
section is missing, empty, or says Unreleased, and carries the notes' SHA-256 to
the publish and npm jobs; both require the published body to be exactly those
notes followed by that attempt's identity comment. GitHub's generated notes are
never used. Identity readers take the record from the last
`<!-- wrench-release-source-v1 ` marker and require the body to end with `-->`;
only releases up to v0.18.38, published before the notes, may carry the bare
record as the whole body. The notes are presentation, not release authority, and
so are the Release display title and bot login. An owner rerun of the same
workflow run can therefore recover an already-created exact immutable Release.

Only when creating a missing immutable Release, the Release workflow first
pins one exact older immutable Latest Release by tag, ID, and publication time.
After the POST, GitHub's Latest projection may remain only that exact predecessor
or advance to the exact created target while the workflow makes at most twelve
observations at absolute five-second slots inside one 60-second monotonic
deadline. Each authenticated read has at most ten seconds. A third older
identity, regression, same-or-higher different stable tag, target ID or
publication-time drift, malformed or mutable Release, API failure, clock
regression, stuck sleep, attempt exhaustion, or deadline expiry fails closed.
An exact Release that already existed gets one immediate Latest check and never
enters this convergence loop. After either path converges, the workflow repeats
terminal tag, main, and release-control authority, then reads the exact by-tag
Release and Latest once more. That final Latest read is the last external
observation and must bind the same tag, ID, and publication time. This is a
bounded authority sandwich, not an atomic provider snapshot, and it never
changes the immutable Release or its tag.

## Install the canonical release

These commands require the matching published immutable v0.18.92 release.

For the CLI:

```sh
bun add --global https://github.com/hraness/ghostget/releases/download/v0.18.92/hraness-ghostget-0.18.92.tgz
ghostget --version
ghostget doctor --json
```

For the SDK, use the same URL without `--global`. Package imports remain
`@hraness/ghostget` and the existing exported subpaths. npm consumers may use
`npm install` with that exact tarball URL. Do not add a private registry or a
curl-to-shell installer. Verify the immutable release, complete asset set,
checksums, signed provenance, and a clean consumer install before reporting a
new release as delivered. Preview commands describe the checked source's
candidate coordinate; publication must complete before those commands work.

## Publish the same bytes to npm

The existing `@hraness/wrench` npm listing is retained as history; its
`contentPolicy.class` stays `dual-use` and it receives no further versions.
`@hraness/ghostget` is a new coordinate published as ordinary software by
owner decision on 2026-09-10: the package carries no `contentPolicy`
declaration and no `DISCLOSURE` file, matching the other Hraness listings, so
npm's dual-use rules (interactive or staged publication with two-factor
promotion) do not apply to it. The first publication of the new coordinate was
one owner-authenticated `npm publish` of the exact canonical archive bytes,
after which the trusted publisher was configured in the package settings. Every
later version publishes automatically from the tag Release workflow, unified
with the other Hraness packages (owner decision 2026-09-10): no separate
dispatch workflow, no staged publish, no token, and no human step after the tag
push. Canonical GitHub publication and the domain migration remain independent
of npm.

`publish_npm` runs after the immutable GitHub Release exists and needs the
verify, attest, and publish jobs. It is checkout-free, runs no product source or
`bun install`, declares only `actions: read`, `contents: read`, and
`id-token: write`, and enters the `npm-release` environment. In order it:

1. Reauthorizes the current attempt exactly like the GitHub publisher: owner
   User `894119` or `hraness-release-tagger[bot]` Bot `337004703` as actor and
   triggering actor, public repository ID
   `1316443113`, Release workflow `323493609` at its exact path, the protected
   tag ref and verified source SHA, and current-main ancestry.
2. Pins npm 11.19.0 and establishes clean publication defaults: empty user and
   global configuration files, a clean working directory, no ambient
   `npm_config_tag`, and a proven default tag of `latest`.
3. Downloads the attested canonical artifact by its numeric artifact ID, so a
   failed job can be rerun from the same run without rebuilding. It binds all
   five files to the verify job's recorded SHA-256 hashes and the attestation
   bundle hash, binds `release-manifest.json` to the verified source, tag,
   workflow authority, run, and package, and copies only the archive and
   packing receipt into the three-file handoff.
4. Independently parses the bounded USTAR archive and its packed manifest:
   omitted or `false` `private`, no `contentPolicy`, no top-level `tag`, and a
   `publishConfig` of exactly `access=public` plus the canonical registry.
5. Admits the public registry state. `@hraness/ghostget@<version>` absent and
   public `latest` older than the candidate proceeds to publication. The
   version already public with the exact canonical `dist.integrity` is an
   idempotent rerun and is skipped. Any other state, including the same
   version with different bytes, fails closed; a published version is never
   overwritten.
6. Immediately before mutation, re-reads the immutable canonical Release by
   tag: immutable, not draft or prerelease, Actions-bot author, the exact
   source and attempt receipt, exactly five uploaded assets, and an archive
   digest and size equal to the handed-off tarball. Then it runs one
   `npm publish <tarball> --access public --ignore-scripts --json --provenance`
   from the clean directory without `--tag`, so npm's monotonic default-tag
   guard stays active, and requires the returned identity and integrity to
   match the tarball.

`admit_npm` then checks out the verified source read-only, first waits inside
a bounded propagation window until `npm view` reports the exact candidate
version (OIDC provenance publishing is asynchronous on the registry side),
downloads the registry tarball and metadata, and runs
`scripts/npm-package-identity.ts`
against the canonical asset plus `npm audit signatures --include-attestations`
through `scripts/npm-provenance-identity.ts`, which binds the registry publish
and SLSA attestations to the tag push, the verified commit, and
`.github/workflows/release.yml`. Only after that admission is
`@hraness/ghostget@<version>` an available registry coordinate.

An ambiguous npm write is readback and diagnosis work, never a blind retry.
Rerun the failed jobs of the same run: the registry-state step recognizes the
exact prior publication and completes without a second write. The workflow's
`stable-release` concurrency group and npm's version immutability serialize
publication; no separate intent ledger or recovery input exists. The group sets
`queue: max`, so a pending tag run waits in order behind the running one
instead of being cancelled when a later tag push arrives; GitHub cancels only
beyond 100 pending runs.

## Configure trusted publishing

Keep a GitHub environment named `npm-release`. Disable administrator bypass.
Its sole protection rule must be `branch_policy`, with the single custom
deployment policy `tag` `v*`; no branch may enter it. Configure no required
deployment reviewers and no environment secrets. Only `publish_npm` may
reference this environment or request an OIDC token for npm; `attest` holds the
only other `id-token: write`, for GitHub attestation.

Configure the exact GitHub Actions identity once (interactive passkey), then
read it back:

```sh
npm trust github @hraness/ghostget \
  --repo hraness/ghostget \
  --file release.yml \
  --environment npm-release \
  --allow-publish \
  --yes \
  --registry=https://registry.npmjs.org
npm trust list @hraness/ghostget \
  --json \
  --registry=https://registry.npmjs.org
```

The trust relationship must name `hraness/ghostget`, the exact `release.yml`
filename, the `npm-release` environment, and `npm publish`. Revoke any earlier
relationship that names another workflow file or environment with
`npm trust revoke @hraness/ghostget --id <trust-id>`. Keep package publishing
access on **Require two-factor authentication and disallow tokens**; the
trusted publisher is exempt from that prompt. Do not add an npm token to
GitHub.

## Deploy the website

Configure the Vercel project's Production Branch as `main` and keep Vercel
System Environment Variables enabled for builds. The checked-in build command
injects exact non-secret marker `WRENCH_VERCEL_BUILD=release-bound-v1`. Local
admission is allowed only when that marker and every Vercel signal are absent.
Any marked or Vercel-signaled build requires the exact marker, `VERCEL=1`, a
valid `VERCEL_ENV`, and an exact nonempty `VERCEL_GIT_COMMIT_REF`; missing,
malformed, or inconsistent platform state fails before site generation.
Production also requires `VERCEL_GIT_COMMIT_REF=main`, and `main` is rejected
for a non-production deployment.

Keep Vercel project `prj_TZbDZ38ABPan158IqnczgsuTu6Ue` under team
`team_UAd1iD2XogJlbFg4h14mRaPM` linked to GitHub repository ID `1316443113`
with `link.productionBranch=main`, `autoExposeSystemEnvs=true`, and
`autoAssignCustomDomains=true`. The last setting is a persistent project
invariant, not a per-release switch. When it is false, Vercel can report a
READY deployment without moving `ghostget.com` or `www.ghostget.com`.

Merging reviewed `main` history deploys the site directly through the Vercel
Git integration; every pull request produces a preview. There is no promotion
ref, writer workflow, or release marker between `main` and the live site, and
the site does not gate production on the latest release commit. The immutable
GitHub Release contract above remains the sole admission for published
artifacts; website deployment is ordinary reviewed-source delivery, not release
authority.

If a future production candidate is READY without moving the canonical domains,
do not rerun the build or assign an individual alias. Pin the exact deployment
ID and unique URL, source SHA, `main` source, READY state, and matching GitHub
deployment status, and prove that no competing deployment exists. Recovery is
one owner-authorized `vercel promote <exact-id-or-url>`, followed by exact
Production target, domain, and route readback. An ambiguous promote is
readback-only with no blind retry. Reconcile `autoAssignCustomDomains=true`
afterward as the durable state. Checked-in workflows never mutate project
settings, call the Vercel API, or perform an alias or promote operation.

See npm's documentation for [trusted
publishing](https://docs.npmjs.com/trusted-publishers/), [staged
publishing](https://docs.npmjs.com/staged-publishing/), and [dual-use package
publishing](https://docs.npmjs.com/policies/dual-use/).

The v0.18.49 request passed source, archive and attestation checks, but its
publisher stopped at the prewrite authority guard after PR #463 changed
protected release controls on main. No draft or canonical assets were created.
Retain the tag and failed run `36536744822`; v0.18.50 includes those reviewed
controls and carries the metallic product-footer update forward.
