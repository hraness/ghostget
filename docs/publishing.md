# Publish Ghostget

Ghostget starts at `@hraness/ghostget@0.17.5`, with command `ghostget` and the
existing seven SDK subpaths. GitHub Releases became canonical under the former
`@hraness/wrench` name at v0.16.13. Historical manifests, archive filenames, and
signed provenance keep that original identity. npm carries the identical
canonical archive: the same tag Release workflow publishes it through OIDC
trusted publishing immediately after the immutable GitHub Release, with no
dispatch, staged approval, or two-factor prompt. An npm failure never unpublishes
or blocks the GitHub Release or its website promotion; it is rerun from the
same run. Historical versions and assetless Releases through v0.16.12 remain
unchanged.

## Admit the canonical GitHub artifact

Start from the exact reviewed source commit `C` merged below protected `main`.
Complete the repository's applicable source, focused native, package/install,
and independent review gates. Keep Node 24.20.0, npm 11.19.0, and Bun 1.3.14. The
release workflow admits the exact commit's successful default-branch CI run
before installing dependencies. This replaces its duplicate serial `bun run
check`; the complete local aggregate and `prepack` stay unchanged. The CI union
covers static checks, package and isolated Bun-consumer checks, every whole-file
source shard, serialized omni tests, standalone checks, and selected macOS checks.
Explicit focused local/native and coupled reproductions still apply under
`CONTRIBUTING.md`; the independently required npm-mirror full check is unchanged.

`scripts/release-source-ci.ts` reads GitHub's current run attempt directly. It
requires the exact repository, active workflow ID/path, main-push source and tree,
all ten successful jobs, and nine actual checkout logs. Each source job records
its exact workflow/lock hashes, Node/npm/Bun versions and GitHub-hosted platform
before its frozen install. Admission also requires both successful exact-source
CodeQL jobs and current main analyses, plus the successful security comparison
on the merged PR's identical tree. Any present main comparison must succeed;
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

After admission, Release still performs a fresh frozen install and deterministic
build, checks generated `dist` and `bun.lock` cleanliness, dry packing and all
seven Node imports. Its new exact npm archive passes the strict artifact parser
and isolated consumer smoke before attestation or publication capability is
available. CI also packs with the same Node/npm versions and canonical npm
command, then checks the archive parser before tagging. Record the Node zlib
build and platform with package measurements; equal Node/npm versions alone do
not establish equal gzip bytes.

Choose a new stable package version greater than every completed stable
Release. A raw tag is a request, not a completed publication. Check the package
version, `src/version.ts`, generated package bytes, installation examples,
changelog, and asset filename together. Dependency upgrades must preserve the
reviewed native browser and cookie contracts and pass their focused checks.

Immediately before tag dispatch, require signed-in administrator readback that
immutable Releases are enabled. Keep Administration out of workflow tokens;
the residual control-plane setting-toggle window remains explicit. Create one
direct lightweight `v<version>` tag on the admitted package commit and push only
that exact ref. Do not overwrite, annotate-convert, move, or delete a historical
tag to recover a run. Both the actor and triggering actor must be exact User
`894119`; the protected tag, public repository `hraness/ghostget` / `1316443113`,
and Release workflow `323493609` remain bound at each capability boundary.

The canonical asset set is exactly:

- `hraness-ghostget-<version>.tgz`, packed once with `npm pack --ignore-scripts`.
- `npm-pack.json`, the receipt for those exact bytes.
- `release-manifest.json`, the strict `hraness-github-release-v1` identity,
  including repository/name/version/tag, source `C`, reviewed workflow authority
  `W`, run ID/attempt, and archive size/SHA-256/SHA-512.
- `SHA256SUMS`, covering the preceding three files in that order.
- `provenance.jsonl`, the GitHub attestation bundle for all four build files.

Ghostget has no separate platform-native release assets. Its optional native
providers retain their existing installation, identity, and live admission
requirements. Publishing the CLI does not establish live provider qualification.

The read-only build uploads a run-and-attempt-specific artifact. A separate
checkout-free attestation job reauthorizes the exact owner/run/tag before
requesting OIDC, validates the four-file handoff, and invokes pinned
`actions/attest` with registry publication and storage records disabled. The
publisher independently reauthorizes the run before checkout, verifies each
file with `gh attestation verify`, and binds the successful verifier's signed
certificate to the exact numeric repository/owner IDs, source/ref, workflow,
GitHub-hosted push, and run ID/attempt. Predicate metadata alone is not authority.
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
A matching partial draft from the same run attempt
may resume only with matching source, bot, body, and every already uploaded
asset. A mismatched draft or another attempt fails closed and retains evidence;
never delete/recreate it or silently relabel it. A completed release is accepted
only with its original signed identity, never with a newly rebuilt artifact.

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

## Install the canonical release

For the CLI:

```sh
bun add --global https://github.com/hraness/ghostget/releases/download/v0.17.5/hraness-ghostget-0.17.5.tgz
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
   User `894119` as actor and triggering actor, public repository ID
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

`admit_npm` then checks out the verified source read-only, downloads the
registry tarball and metadata, and runs `scripts/npm-package-identity.ts`
against the canonical asset plus `npm audit signatures --include-attestations`
through `scripts/npm-provenance-identity.ts`, which binds the registry publish
and SLSA attestations to the tag push, the verified commit, and
`.github/workflows/release.yml`. Only after that admission is
`@hraness/ghostget@<version>` an available registry coordinate.

An ambiguous npm write is readback and diagnosis work, never a blind retry.
Rerun the failed jobs of the same run: the registry-state step recognizes the
exact prior publication and completes without a second write. The workflow's
`stable-release` concurrency group and npm's version immutability serialize
publication; no separate intent ledger or recovery input exists.

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

## Deploy the release-bound website

Configure the Vercel project's Production Branch as `website-production` and
keep Vercel System Environment Variables enabled for builds. The checked-in
build command injects exact non-secret marker
`WRENCH_VERCEL_BUILD=release-bound-v1`. Local admission is allowed only when
that marker and every Vercel signal are absent. Any marked or Vercel-signaled
build requires the exact marker, `VERCEL=1`, a valid `VERCEL_ENV`, and an exact
nonempty `VERCEL_GIT_COMMIT_REF`; missing, malformed, or inconsistent platform
state fails before external verification or site generation. Production also
requires `VERCEL_GIT_COMMIT_REF=website-production`, while that ref is rejected
for a non-production deployment.
`main` and pull requests are preview sources only; they may describe a package
candidate that has not completed tagging or immutable Release publication, so they must never replace the public production site.

Keep Vercel project `prj_TZbDZ38ABPan158IqnczgsuTu6Ue` under team
`team_UAd1iD2XogJlbFg4h14mRaPM` linked to GitHub repository ID `1316443113`
with `link.productionBranch=website-production`,
`autoExposeSystemEnvs=true`, and `autoAssignCustomDomains=true`. The last
setting is a persistent project invariant, not a per-release switch. When it is
false, Vercel can report a READY/STAGED deployment and GitHub success without
moving `ghostget.com` or `www.ghostget.com`; the public marker gate must reject or
time out on that state.

Before the one-time false-to-true correction, require the marker patch on
current `main` with merged-main CI green. Prove `website-production`, its tag,
and immutable Latest Release still identify the intended current release;
`targets.production`, the apex, `www`, and system aliases still identify the
already-promoted exact deployment; no newer or in-flight Production deployment,
promotion, rollback, or rolling release exists for `website-production`; and
the exact project and link identities above have not drifted. Make one
setting-only update, then read the project back immediately. The only allowed
change is `autoAssignCustomDomains: false` to `true`: project, link, Production
target, and domains stay byte-for-byte equivalent; canonical body hashes and
the exact `www` 308 stay unchanged; and the update creates no deployment or
promotion. Leave the setting true persistently.

An ambiguous setting update is readback-only, never a blind retry. If it remains
false with every invariant intact, stop and begin a fresh preflight. If it is
true with every invariant intact, accept it. If it is true but the
setting-transition postcondition is suspect while the target and domains remain
exact, at most one compensating setting-only update back to false plus exact
readback is permitted. Any target, domain, deployment, or ref drift freezes the
release for review; never alias, promote, or guess. Setting false cannot undo an
alias move.

If a future candidate is READY/STAGED because this persistent invariant
drifted, do not rewrite the ref, rerun the workflow, or assign an individual
alias. Pin the exact deployment ID and unique URL, source SHA,
`website-production` source, READY/STAGED state, and matching GitHub deployment
and status, and prove that no competing deployment exists. Recovery is one
owner-authorized `vercel promote <exact-id-or-url>`, followed by exact
Production target, domain, marker, and route readback. An ambiguous promote is
also readback-only with no blind retry. Reconcile
`autoAssignCustomDomains=true` afterward as the durable state. Checked-in
workflows never mutate this project setting, call the Vercel API, or perform an
alias or promote operation; promotion outcome remains token-free public HTTPS
plus read-only GitHub evidence.

Vercel will not accept a Production Branch that does not exist. For the one-time
migration only, first verify the current immutable Latest Release against its
exact remote tag commit and canonical GitHub artifact version, then create
`website-production` once at that release commit with the GitHub create-ref API.
Fail if the branch already exists, and never bootstrap it from `main` or an
unreleased candidate. Configure Vercel only after that exact ref exists. This
exception must never be repeated.

Live ruleset `21832074` targets exactly `refs/heads/website-production` and
`refs/heads/website-production-canary`. It has no bypass actors,
`current_user_can_bypass=never`, and exact creation, deletion, and
non-fast-forward rules. Live ruleset `21887484` targets the same refs with one
update restriction and exactly one `Integration` bypass for dedicated App
`4783991` with `bypass_mode=always`. Together they deny ref creation, deletion,
non-fast-forward movement, and every update except the dedicated App's admitted
fast-forward. Incident freeze ruleset `22182820` added no-bypass creation,
update, deletion, and non-fast-forward restrictions during the v0.16.4 release.
It was removed by captured numeric ID only after the release-owner audit and
successful exact production promotion; it is historical, not a live control.
The App-only writer passed the positive and negative canary
proofs retained below. GitHub Actions App Integration 15368 is not the
production writer and must not be configured as the update-rule bypass.

The retained canary proof is evidence, never standing
mutation authority.
At setup, after a control-plane configuration or workflow-authority change,
and during drift recovery, fresh administrator readback must
reconfirm the exact permanent rulesets and target refs and the sole App
`4783991` `Integration` bypass. It must prove that the App registration still
grants exactly `metadata:read`, `contents:write`, and `workflows:write` with no
other permission, and that installation `158077029` still selects exactly
repository `hraness/ghostget` at ID `1316443113`. The
`production-ref-writer-key` environment still has `deployment=false`, a
main-only branch policy, no required deployment reviewers or wait timer,
`prevent_self_review=false`, administrator bypass disabled, exactly the four variables
`WRENCH_RELEASE_APP_ID`, `WRENCH_RELEASE_APP_CLIENT_ID`,
`WRENCH_RELEASE_APP_SLUG`, and `WRENCH_RELEASE_APP_INSTALLATION_ID`, and
exactly the `WRENCH_RELEASE_APP_PRIVATE_KEY` secret. Control changes must
include fresh readback evidence before activation. Any detected drift leaves
production unchanged until those controls are requalified. The audited v0.16.4 removal of incident freeze
`22182820` does not authorize changing either permanent rule or silently
weakening a future incident freeze.

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
`publish` job with a `contents: write` `GITHUB_TOKEN`; the separate promotion job
keeps that token read-only and uses the short-lived App token only inside the
leased Git push.

After the one-time bootstrap has established `website-production`, the tag
workflow admits the canonical artifact, creates or resumes the exact draft,
verifies its uploaded asset descriptors, and publishes the immutable Latest
Release. It does not read or update `website-production`, wait for Vercel, or
receive the App key. Only an authenticated exact REST 404 permits draft creation;
other lookup failures abort. A pre-existing draft must bind the original exact
Actions bot, run/attempt, source receipt, direct lightweight tag, and every
already uploaded asset. No clobber, deletion, relabeling, tag movement, or
rollback is permitted. The only publication PATCH changes the admitted draft
to non-draft and requests Latest after the complete five-file readback.

Before each draft creation, missing-asset upload, and publication, fetch only the
fully qualified governed main and tag refs, prove `C<=M`, and require unchanged
release controls. The release-ref helper's closure includes `.github/workflows`,
the release-ref, npm provenance/package identity, package artifact/budget/smoke,
packed private-source runtime, canonical verifier/publisher, provider, App-token,
ref-writer, production-marker, and canonical asset-parser modules. It observes
two equal bounded combined main-plus-tag advertisements around that proof.
Current main may move linearly while preserving those controls. The publication
path also exhausts the bounded completed stable-Release ordering census before
creating or publishing a draft; a higher raw tag alone is an incomplete request.
The canonical artifact has no dependency on npm latest.

After publication, require exact immutable release and asset readback, bounded
Latest convergence, and terminal protected-ref/control-closure verification.
GitHub has no conditional lease for publishing a Release, so a concurrent
control-plane change may make readback fail after publication. Preserve that
immutable release and inspect current authority; never delete or rewrite it.
If another immutable release becomes Latest, recover from its actual coordinate.
A supersession after the final read is not observable by the completed workflow.

Immediately before the tag push that dispatches **Release**, a signed-in
administrator must read back immutable Releases as `enabled=true` and two exact
active repository tag rulesets whose sole ref target is `refs/tags/v*`. The
creation ruleset must contain only `creation` and give sole always-bypass
authority to User ID `894119`. The immutable ruleset must contain only
`deletion` plus `update` and have no bypass actors. Never combine those rules:
the owner bypass may create a release tag but cannot move or delete one, while
every other User or Integration is denied creation. Rulesets `22311815`,
currently named `Release tag creation`, and `19989752`, currently named
`Immutable version tags`, are retained live evidence, but their numeric IDs and
names are not authority: the split semantics are. If either evidence coordinate
changes, resolve and retain the unique new semantic match before proceeding.
The write-capable workflow token deliberately keeps only `actions:read` for its
own attempt/workflow readback and `contents:write` for the immutable Release; it
cannot read any Administration endpoint. These fresh control-plane checks are
therefore a trusted operator boundary,
with a residual administrator-toggle window that repeated workflow reads
cannot remove. The created and terminal
Release readbacks and tag reads must still report exact immutable authority.

Run this with the signed-in administrator session immediately before creating
the tag. First resolve the two unique candidates from the repository ruleset
list, then set the IDs below to those captured numeric IDs. The validation
records their required split semantics alongside GitHub's immutable-Release
diagnostic without granting the workflow Administration:

```bash
immutable_release_state="$(gh api \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2026-03-10' \
  /repos/hraness/ghostget/immutable-releases \
  --jq '{enabled: .enabled, enforced_by_owner: .enforced_by_owner}')"
IMMUTABLE_RELEASE_STATE="$immutable_release_state" node <<'NODE'
const value = JSON.parse(process.env.IMMUTABLE_RELEASE_STATE ?? "null");
if (
  value === null ||
  typeof value !== "object" ||
  Array.isArray(value) ||
  Object.keys(value).sort().join(",") !== "enabled,enforced_by_owner" ||
  value.enabled !== true ||
  typeof value.enforced_by_owner !== "boolean"
) process.exit(1);
process.stdout.write(`${JSON.stringify(value)}\n`);
NODE
ghostget_tag_create_ruleset_id=22311815
ghostget_tag_immutable_ruleset_id=19989752
tag_create_ruleset_state="$(gh api \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2026-03-10' \
  "/repos/hraness/ghostget/rulesets/$ghostget_tag_create_ruleset_id")"
TAG_CREATE_RULESET_STATE="$tag_create_ruleset_state" node <<'NODE'
const value = JSON.parse(process.env.TAG_CREATE_RULESET_STATE ?? "null");
const refName = value?.conditions?.ref_name;
const ruleTypes = Array.isArray(value?.rules)
  ? value.rules.map((rule) => rule?.type).sort()
  : [];
const bypass = Array.isArray(value?.bypass_actors) ? value.bypass_actors : [];
if (
  value === null ||
  typeof value !== "object" ||
  Array.isArray(value) ||
  value.target !== "tag" ||
  value.source_type !== "Repository" ||
  value.source !== "hraness/ghostget" ||
  value.enforcement !== "active" ||
  bypass.length !== 1 ||
  bypass[0]?.actor_id !== 894119 ||
  bypass[0]?.actor_type !== "User" ||
  bypass[0]?.bypass_mode !== "always" ||
  refName === null ||
  typeof refName !== "object" ||
  !Array.isArray(refName.include) ||
  refName.include.length !== 1 ||
  refName.include[0] !== "refs/tags/v*" ||
  !Array.isArray(refName.exclude) ||
  refName.exclude.length !== 0 ||
  JSON.stringify(ruleTypes) !== '["creation"]'
) process.exit(1);
process.stdout.write(`${JSON.stringify({
  id: value.id,
  name: value.name,
  semantics: {
    bypass: { actorId: 894119, actorType: "User", mode: "always" },
    enforcement: value.enforcement,
    ref: refName.include[0],
    rules: ruleTypes,
  },
})}\n`);
NODE
tag_immutable_ruleset_state="$(gh api \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2026-03-10' \
  "/repos/hraness/ghostget/rulesets/$ghostget_tag_immutable_ruleset_id")"
TAG_IMMUTABLE_RULESET_STATE="$tag_immutable_ruleset_state" node <<'NODE'
const value = JSON.parse(process.env.TAG_IMMUTABLE_RULESET_STATE ?? "null");
const refName = value?.conditions?.ref_name;
const ruleTypes = Array.isArray(value?.rules)
  ? value.rules.map((rule) => rule?.type).sort()
  : [];
if (
  value === null ||
  typeof value !== "object" ||
  Array.isArray(value) ||
  value.target !== "tag" ||
  value.source_type !== "Repository" ||
  value.source !== "hraness/ghostget" ||
  value.enforcement !== "active" ||
  !Array.isArray(value.bypass_actors) ||
  value.bypass_actors.length !== 0 ||
  refName === null ||
  typeof refName !== "object" ||
  !Array.isArray(refName.include) ||
  refName.include.length !== 1 ||
  refName.include[0] !== "refs/tags/v*" ||
  !Array.isArray(refName.exclude) ||
  refName.exclude.length !== 0 ||
  JSON.stringify(ruleTypes) !== '["deletion","update"]'
) process.exit(1);
process.stdout.write(`${JSON.stringify({
  id: value.id,
  name: value.name,
  semantics: {
    bypassActors: 0,
    enforcement: value.enforcement,
    ref: refName.include[0],
    rules: ruleTypes,
  },
})}\n`);
NODE
```

For 0.16.6, the direct lightweight tag already exists at the pinned staged
commit. Never create or push it again. Read the local and remote refs back
without mutation:

```sh
test "$(git rev-parse --verify "$C^{commit}")" = "$C"
test "$(git rev-parse --verify "refs/tags/v0.16.6^{commit}")" = "$C"
test "$(git ls-remote --refs origin refs/tags/v0.16.6 | cut -f1)" = "$C"
```

The create request sends the verified SHA `C` as `target_commitish`, but GitHub
may normalize that response field to the default branch when the protected tag
already exists. Response `target_commitish` is informational and is not release
authority. Every publication readback instead requires Actions bot ID
`41898282` with type `Bot` and a deterministic body prefix binding repository,
tag, source SHA, and `GITHUB_RUN_ID`; the separately
read protected lightweight tag must still peel to `C`. Generated notes may
follow that prefix but are not release authority. The Release display title and
bot login are presentation only. An owner rerun of the same
workflow run can therefore recover an already-created exact immutable Release,
while a front-run Release or a Release from another run fails closed. Promotion
derives the Release workflow run ID only from that sampled exact source receipt.
The automatic path requires it to equal the triggering payload run ID and first
attempt; manual recovery accepts no run-ID input and requires the receipt's exact
run to have one positive current attempt. The initial verification job reads that
Actions run exactly once. It binds workflow ID `323493609`, path
`.github/workflows/release.yml`, tag push, head tag and SHA, completed success,
stable numeric IDs and types for the owner actor and triggering actor, and the
exact public Ghostget repository and head repository. Mutable actor logins, the
run display name, and the Release display title are presentation, not authority.
The body receipt is mutable GitHub control-plane data, so each accepted Release
read samples and validates it exactly; the protected tag and stable numeric
identities remain the durable authority. Later strict by-tag Release reads
revalidate the sampled exact receipt and carried run ID without rereading Actions.
Both `wrench-provider-baseline-v4` and
`wrench-provider-promotion-v3` bind the Release workflow run ID across every
promotion/outcome readback. The promotion receipt additionally binds the stable
Release ID and publication time. Each Latest projection must be the same
strict workflow-published Release with the same ID and publication time; the
exact tag name, encoded peeled-tag commit, immutable state, and current-main
ancestry remain authority.

The separate **Promote website production** workflow is loaded from current
default-branch `main`. GitHub starts it after **Release** completes, and manual
recovery dispatches this workflow directly from current `main` with an untrusted
stable-tag input. The automatic path treats the entire `workflow_run` payload as
foreign data. It requires repository `hraness/ghostget` with numeric ID
`1316443113`, Release workflow ID `323493609`, exact workflow path, a
tag `push`, first attempt, successful conclusion, and this repository as the head
repository. The reviewed workflow source `W` originates from `main`; the
automatic head SHA must instead equal the peeled immutable tag commit `C`.
Manual recovery carries no upstream SHA, run ID, or run attempt. Both paths
check out exact `W`, bind the package version from `C`, verify the immutable
asset-free Latest Release and its exact initial Actions run, and prove `C<=W<=M`
for protected current main `M` before any provider or ref work. The canonical
download binds the receipt attempt: a successful attempt is admitted outright,
and an attempt that published the Release and then failed a later npm job is
admitted only when its complete job inventory shows the four canonical jobs
(authorize, verify, attest, publish) succeeded in that attempt. A rerun that
completes npm makes the run's latest attempt successful, but automatic
promotion still requires the first attempt, so that release is promoted through
the manual recovery dispatch. Only the initial
verification job has `actions: read`; baseline, both promotion paths,
receipt selection, and provider outcome carry the verified run ID but cannot
read Actions.
Main may advance by protected linear fast-forward after dispatch without
invalidating reviewed `W`.

That promotion checkout is depth one with tags and credentials disabled. The
same bounded release-ref helper observes `main` and the bounded `refs/tags/v*`
inventory in one combined governed-ref advertisement per observation. It then
imports only exact advertised `main` and the requested lightweight tag, without
writing `FETCH_HEAD`, proves the requested tag is direct commit `C` and proves
`C<=W<=M`, and requires a second combined advertisement to equal the first.
Raw tag order is not completed-release order. Every
later promotion job checks out only the already-verified workflow SHA at depth
one with tags disabled; provider and App/CAS authority remain separate from Git
ref discovery.

Before any key-gated job starts, a read-only job records a bounded, complete
snapshot of GitHub's Production deployments. Authenticated GitHub
`Date` headers bracket that snapshot without trusting the runner clock. The job
uses bounded GraphQL pages to read the complete current inventory of at most 500
Production deployments. It validates each deployment's exact SHA, task,
Production environment and original environment, pinned Vercel bot, state, and
current `latestStatus`. Two stable, order-independent reads bind the branch and
the complete current-state fingerprint. The global receipt does not depend on
older deployment-status rows because GitHub removes previous deployment
statuses after 90 days while preserving the current status on the deployment.
The baseline outputs whether the established production ref already equals the
verified release. The already-exact branch takes a separate read-only job. That
job has no environment admission, App variable, private key, token mint, or Git
push. It still revalidates reviewed workflow-source ancestry, the peeled tag,
immutable Release, Latest, the baseline, authenticated server time, and the
terminal ref before emitting a receipt.

Only an actual fast-forward enters `production-ref-writer-key`, configured with
`deployment: false` so the secret-bearing job does not create a GitHub
Deployment record that could collide with the Vercel-only Production inventory.
The environment must permit only `main`, configure no required deployment
reviewers or wait timer, disable admin bypass, set `prevent_self_review=false`,
and store only `WRENCH_RELEASE_APP_PRIVATE_KEY`
plus the reviewed App ID, client ID, slug, and selected installation ID
variables. The job repeats the full `C<=W<=M`, peeled-tag, immutable Release,
and Latest authority check after automatic environment admission and before
credentials and mutation. The preceding immutable-release, exact workflow-source,
and provider-baseline checks authorize admission without a separate human review.
The privileged control-plane census runs at setup, after control-plane or
workflow-authority changes, and during drift recovery. The agent performs it
programmatically through already-authorized access and retains fresh evidence
with each control change. Routine promotions do not wait for another census.
Every run still checks immutable artifact and source identity, the configured
App and installation, exact token permissions and the single Ghostget repository,
the existing ref and fast-forward relationship, lease, and revocation. Live
GitHub rules enforce ref restrictions, and provider and public readbacks bind
the delivered result. The retained canary supports the established writer
behavior; changes to writer identity, permissions, lease, or revocation require
new bounded admission evidence without resetting or repurposing that canary.

The writer authenticates one private Hraness-owned GitHub App. The App
registration and every minted token close to exactly `metadata:read`,
`contents:write`, and `workflows:write`, with no Administration or other
permission. Workflows write is required because an admitted fast-forward may
introduce reviewed `.github/workflows` changes. Runtime checks bind the
configured App and selected installation identities, request that exact
permission set on a token narrowed to repository ID `1316443113`, and require
the minted token response to name only that repository. That runtime token
proof does not prove the installation-wide selected-repository set. Before
admitting the key, privileged setup must exhaustively read every repository
selected for the installation with the administrator identity, prove that the
unique result is `hraness/ghostget` at ID `1316443113`, and retain the exact
readback with the canary evidence.

The single-use permission and writer proof completed on 2026-09-02 from exact
current-main workflow SHA
`fb876445334bb74abcb3592a5aaae2672c7b2d96` in workflow `345799741`, run
`33691443614`, attempt 1, dispatched by `0thernet` (`actor_id=894119`).
An ordinary `0thernet` `P` to `C` update was denied in Rule Suite `3922909251`.
The dedicated App bot then performed the only admitted leased fast-forward in
Rule Suite `3922938237`; the update restriction failed and was admitted only by
the exact App Integration bypass, while the lifecycle rules passed. The canary
moved from `P=6d9096b0fabbc03ede0741ec4931fbe19127440c` to
`C=0bf88a064233635e0c5485c61f9c533974a7dca4`. Production remained
`33309c470336127228b959e2aaa54138247b9684`, and `main` remained the workflow
SHA. The canary remains at `C` and must never be reset, deleted, or repurposed.

The durable pre-cleanup archive's `PRE_CLEANUP_MANIFEST.tsv` SHA-256 is
`cf899eac777336a06dd3d19c41512ae60d1e19f848fdf709c5284ddf73564815`.
It binds exact App `4783991` and selected installation `158077029`.

A separate one-shot key-setup proof for that exact App and installation is
anchored by the packet `SHA256SUMS` SHA-256
`62449019d3a2c6c5bed4c1f5d25d9a5383f95e865da7335a579e1cbe28f2b148`,
the complete `EXECUTION_JOURNAL.jsonl` SHA-256
`4facee05aa0493bb3f724a47729079fd107f4f2d029a4547d5fcbd0df2fa9560`,
and the `KEY_PROOF_RECEIPT_V3.json` SHA-256
`a3d75a3adf39286cab828ea0dd3ac0e3c8242e9a18c73f51f06f20bde0e0e468`.
Its terminal journal-record digest is
`9d6c91d29fb8932a6abba9b2f9d4822a153011d0642dd61150a4b9a8bf8da75b`.
These four anchors identify the one-shot key-setup proof.

The base64-decoded `WRENCH_RELEASE_APP_CANARY_EVIDENCE_V2` value emitted by
workflow run `33691443614` ends at its closing `}` byte with no trailing line
feed and has SHA-256
`b3b285d8d8965851595ff991ba4a4ffa327b605350c161fca36dc09a32b5bb27`.
Archived file `terminal.canary-evidence.json` contains those same JSON bytes
plus exactly one trailing line feed and has SHA-256
`5b5161fbaea60b29bac64881680e7954631c157b2cb5a0a8e84d1dc1b9f415ec`.
The raw prove-job log response bytes for job `100450916193` have SHA-256
`eb79ede7214e1b3085d7f787cd91df8b23f9150f805c13d5e5675df934b70510`.
Archived whole-run log file `terminal.run.log` is a separate, larger byte
sequence with SHA-256
`eb930fec28427928a328a89f61874920ebc18694484b0ffd70051d660ca703e8`.
These four hashes label four distinct retained or fetched byte representations
and are not interchangeable.

The evidence binds exact App `4783991`, bot `323289432`, selected installation
`158077029` and repository, the admitted push output SHA-256
`93f5eaa8169aa38b358f7eb3e80b30f80f0cb3fd4eb3d37fe6ac60673b02f9fd`,
the stale-lease rejection output SHA-256
`ca646017da1c8e57ef915b6b76e4e808a41a1e0492454ca0b0c3176f7a504b8a`,
unchanged control fingerprints, and the activation workflow's
cleanup-qualified revocation receipt
`{converged:true, observationCount:2, propagationObserved:false,
stableDenials:2}`. Lifecycle ruleset `21832074` remained no-bypass. Update
ruleset `21887484` admitted only App `4783991` as an `Integration` with
`bypass_mode=always`. Production-only freeze ruleset `22149969` remained
no-bypass during that retained proof. That historical ruleset was later absent.
Replacement incident freeze `22182820` protected the v0.16.4 release and was
then removed by captured numeric ID during its audited production promotion.
The production helper remains hard-bound to `website-production` and was not
reused for the canary.

This checked cleanup removed the single-use workflow and helper after retaining
their run, job log, App and installation readbacks, environment admission,
administrator ruleset projections, ordinary-denial and App-bypass Rule Suites,
canonical evidence, and SHA-256 digests. After this cleanup is merged and its
merged-source CI is green, delete the six temporary lifecycle, update, and freeze
ruleset fingerprint variables by exact name:
`GHOSTGET_RELEASE_LIFECYCLE_RULESET_ID`,
`GHOSTGET_RELEASE_LIFECYCLE_RULESET_UPDATED_AT`,
`GHOSTGET_RELEASE_UPDATE_RULESET_ID`,
`GHOSTGET_RELEASE_UPDATE_RULESET_UPDATED_AT`,
`GHOSTGET_RELEASE_PRODUCTION_FREEZE_RULESET_ID`, and
`GHOSTGET_RELEASE_PRODUCTION_FREEZE_RULESET_UPDATED_AT`. Read the environment back and
require exactly the four reviewed App ID, client ID, slug, and installation ID
variables plus the single private key secret, with its main-only branch policy,
absence of deployment reviewers or wait timers, `prevent_self_review` setting,
and disabled admin bypass unchanged.
Retain both permanent rulesets and the canary at `C`. The six temporary
fingerprint variables were cleanup inputs, not durable environment state. A
future incident freeze must be created, captured, audited, and removed by exact
numeric ID; uncertainty leaves that incident safely frozen.

The minted token must carry a bounded one-hour expiry and fit the streamed
response parser. The helper masks it and passes it only through a private
`GIT_ASKPASS` environment. Because the writer checks out only exact reviewed
workflow source `W`, it first fetches only the verified tag through the fixed HTTPS
repository URL, peels that fetched object locally, and requires the result to
equal the independently verified release SHA. It does not check out or execute
tagged code. The same ephemeral credential boundary then runs one fixed push
with the explicit compare-and-swap lease
`--force-with-lease=refs/heads/website-production:<expected-old>`. The push has
one exact source-to-destination refspec, no followed tags, no hooks, no persisted
Git configuration or checkout credential, no interactive prompt, and a
60-second cap on each Git process.

After the operation, the shared helper sends exactly one nonredirecting
`DELETE /installation/token` request and requires an HTTP 204 with absent or
canonical-zero `Content-Length` and zero body bytes. Its GitHub `Date` header,
and the `Date` header on every accepted HTTP 200 or 401 observation, must be
canonical and strictly precede the minted token's exact `expires_at`.
The monotonic completion of that response anchors a separate 30-second
half-open request-start window `[start, deadline)`. A response that completes
exactly at the deadline remains eligible; a later completion fails. The helper
may make at most ten reads of the token's exact `/installation/repositories`
endpoint at absolute offsets 0, 250,
500, 1,000, 2,000, 4,000, 8,000, 16,000, 24,000, and 29,000 milliseconds. Each
read is admitted and timed from one authoritative request-begin clock sample,
then capped at the lesser of ten seconds and that sample's remaining window.
Request,
body, and sleep latency are charged to the same window. A missed absolute slot
is skipped instead of triggering a burst or sliding later observations. An HTTP
200 before denial must still name the exact singleton selected Ghostget
repository. Acceptance requires HTTP 401 on two distinct scheduled reads; a
later 200 after a 401, only one 401, any other status, a redirect, malformed or
oversized authority data, transport or sleep failure, clock drift, or deadline
inconsistency is indeterminate and fails closed. If every observation that can
start before the deadline remains authorized, the result is a distinct
nonconvergence failure even when charged latency reduces the number of reads.
The sanitized receipt sets `propagationObserved=false` only when the first two
observations are the required 401 pair and no authorized 200 was observed. It
sets `propagationObserved=true` only when at least one exact authorized 200
precedes the final two stable 401 observations. An advanced
`wrench-provider-promotion-v3` receipt must retain that exact bounded object as
`releaseAppRevocation`; the no-write `already-exact` path must instead bind the
field to `null` and never mint a token.
This operational ceiling is a
Ghostget fail-closed policy, not a GitHub revocation-propagation SLA. No action is
retried, and operation and revocation failures are both retained when they
coincide. The exact production-ref post-read begins only after convergence.
Every read-only `gh api` child receives `GH_TOKEN` but has every
`WRENCH_RELEASE_APP_*` value removed from its environment. A missing branch,
moved tag, concurrent ref update, divergence, rollback, server-time regression,
source drift, token-scope drift, push rejection, revocation failure, or post-read
mismatch fails closed. The workflow never creates, deletes, force-moves, or
recreates the branch.

A dependent job with only `contents: read` and `deployments: read` owns the
bounded provider wait. Its explicit job condition accepts only successful
verification, baseline, and promotion-selection results while tolerating the
one intentionally skipped alternate promotion path; cancellation and every
failed prerequisite still skip it. After a new fast-forward, it accepts exactly one new
GitHub Production deployment whose SHA is the verified release commit, whose
task is `deploy`, whose environment and original environment are `Production`,
and whose creator is the pinned Vercel bot. Recovery from an already-exact
branch instead selects the unique newest deployment for the verified SHA and
requires it to postdate the immutable Release. A newer or same-second deployment
for another SHA blocks recovery when its current Vercel status is successful.
A newer terminal failure, error, or inactive deployment does not displace the
exact successful candidate. Both paths require the REST deployment's lowercase
40-hex `.ref` to equal its `.sha` and the verified release commit. The matching
GraphQL deployment must expose `ref: null` while `commitOid` equals that same
commit. These source fields remain in the pinned candidate fingerprint. Both
paths recheck the exact tag, immutable Release, Latest Release, production ref,
and `C<=W<=M`, and pin one deployment. Each workflow-source check reads
protected main twice, accepts only identical or strict linear-forward movement,
and rejects rollback or divergence. A protected descendant advance after the
final read remains safe; neither path claims an atomic cross-system snapshot.
Every poll rereads the complete GraphQL current-state inventory. The pinned
candidate also gets an exhaustive, order-independent REST status-history read
with a 500-row cap and empty sentinel page. Any retained failure, error, or
inactive row rejects the candidate even when a newer row says success. GraphQL
`latestStatus.id` must equal the REST status `node_id`; that current status must
keep its exact GitHub
deployment URL, Production environment, pinned Vercel creator, and one shared
canonical `https://ghostget-<id>-hraness.vercel.app` target, environment, and log
URL. Same-second status rows are resolved only by that cross-API node identity.
The build's exact seven-key `/.well-known/wrench-release.json` binds schema,
package, repository, tag, version, verifier-proven local HEAD, and the strict
unique Vercel deployment URL. Before any write, the baseline reads that marker
twice around the GitHub ref and complete deployment inventory. A 404 is allowed
only when promoting exact v0.16.5, the first release that contains the marker;
every later baseline requires one stable valid marker for the latest successful
deployment at the baseline ref. During outcome polling, the apex marker may
show only the baseline identity or the exact target. A third identity, changed
same-release deployment URL, target-to-baseline regression, or disagreement
with the pinned status URL fails closed.

The job requires the initial success observation plus two complete consistent
readbacks, repeats the complete deployment inventory after the final status
read, and sandwiches terminal state with exact tag, Release, Latest, ref,
workflow-source, and canonical-host authority reads. Each public readback
requires the target marker plus bounded canonical responses from
`https://ghostget.com/`, `/providers/beeper/`, and `/llms.txt`; it also requires
`https://www.ghostget.com` to return one no-follow 308 whose `Location` preserves
the marker path and query exactly. The project-domain aliases are not release
authorities. The two complete public readbacks must be byte-stable by digest.
Release/source/nonce query values and `cache: no-store` are propagation and race
observations only: Vercel static caching is not assumed bypassable, and
correctness comes from release-varying marker bytes plus stable readback.
The observation window starts immediately
before the first provider read, after the initial authority checks. Production
uses exactly 20 observation slots anchored to that start at offsets zero through
19 minutes inside the half-open monotonic `[start, deadline)` window. API latency
reduces the sleep before the next absolute slot instead of sliding the schedule,
and both success confirmations consume the same 20-minute window. Each `gh api`
process has a 60-second cap reduced to the remaining window. No provider API
process starts with less than one millisecond remaining, and every completed
process must strictly advance the injected monotonic clock.
After an unsuccessful slot 20, the default cadence performs only a final bounded
sleep to the 20-minute deadline and rejects without starting another API read.
A reduced poll count or test cadence rejects immediately after its configured
final observation. An early sleep resolution cannot trigger another provider
read before its absolute slot. The contract makes no visibility claim for a
deployment that changes after the slot-20 query completes. A final external read
that completes exactly at the deadline remains eligible from its captured
completion; no redundant clock sample or later API read follows it. A later
completion, a frozen or regressing clock, poll-budget exhaustion before the
deadline, or an empty or nonterminal result fails closed. The workflow job has
a separate 30-minute timeout, leaving ten minutes for checkout, Node setup, and
runner teardown around the product deadline.

The bounded request contract is separate for REST and GraphQL. The current
control flow can make at most 209 REST calls in the provider outcome job. The
post-reauthorization publication helper's worst missing-Release path uses 30
calls, including all five bounded release pages plus the empty sentinel page;
the full immutable Release path uses 36 after its six terminal source-
reauthorization calls. The immutable Release and downstream
promotion workflows together use at most 351 REST calls, leaving 649 calls
under the repository `GITHUB_TOKEN` limit of 1,000 REST requests per hour. The
website authority sandwiches use at most 83 calls, the surrounding immutable
Release and website authority paths use at most 119, and the promotion helper
itself uses at most 21 read-only REST calls. Its leased Git
push and at most fourteen App REST requests do not consume that `GITHUB_TOKEN`
budget. Those App requests are the three setup and mint calls, one DELETE, and
at most ten convergence probes. Git authentication is outside that REST bound. Five
bounded GraphQL pages across two baseline reads, 20 observations, and two
confirmations make at most 120 requests. Each response must cost no more than
two points, for a 240-point ceiling and 760 points of headroom under the
separate 1,000-point GraphQL limit. API errors, malformed or incomplete
pagination, rate-limit drift,
timestamp ambiguity, competing deployments, identity drift, Latest Release or
workflow-source drift, terminal failure, timeout, or final readback drift fail
the promotion workflow. Read-only GitHub responses are capped at 8 MiB; App
identity, installation, token, and revocation responses are streamed under a
1 MiB cap; and each encoded cross-job receipt is capped at 64 KiB. Public-host
verification uses at most 32 unauthenticated GETs: two baseline marker reads,
20 polling marker reads, and two five-request terminal snapshots. Every request
has at most ten seconds, marker and redirect bodies are capped at 1 KiB, health
HTML at 256 KiB, and health text at 64 KiB. This check needs no Vercel token,
PAT, cookie, authorization header, or redeploy.

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

If promotion fails after the immutable Release exists, merge the reviewed fix to
`main` first. Then dispatch **Promote website production** from current `main`
with the immutable Latest stable tag. Recovery never reruns or changes the tag
Release. It resolves the peeled tag as verified release commit `C`, keeps that
coordinate distinct from reviewed workflow source `W`, and proves `C<=W<=M`
against protected current main. An
already-exact recovery remains entirely outside the key environment. A required
fast-forward repeats every authority check after automatic admission before it
mints the one-repository App token. Never rerun an ambiguous App push, bypass the
explicit lease, or write the production branch manually.

Vercel runs the checked-in marked `website:vercel-build` command. Valid preview
and development builds, plus true local builds with no Vercel signal, generate
the site without external release checks. A production build first requires the
checked-out HEAD and root package version to equal the exact `v<version>` commit
returned by GitHub's bounded public commit API, requires canonical GitHub artifact to
contain that version with SHA-512 integrity, and requires the matching immutable
GitHub Release to be non-draft, non-prerelease, and Latest. It also requires
Vercel's system commit SHA to equal that verifier-proven local HEAD and its
deployment host to match the strict Ghostget Production URL grammar. Public JSON
response bodies and the fixed local `git rev-parse HEAD` child output are
streamed under fixed byte bounds. Only then does the build derive the public
release identity and provider capability attestation from that exact source
tree. After the verified site build succeeds, it writes canonical JSON plus one
line feed at `/.well-known/wrench-release.json`, with exact
`Cache-Control: no-store, max-age=0`; a failed verifier or build cannot publish
the marker. Preview, development, and true local builds never emit it, and the
normal site build removes any stale marker from its output directory.

This production admission assumes a Vercel Git deployment whose checkout keeps
a resolvable Git `HEAD`; missing repository metadata is a hard failure, not a
reason to trust deployment environment variables. Keep `.git` out of
`.vercelignore` so the Git-connected shallow clone retains the metadata needed
for this independent check. Starting with v0.16.13, the build checks the exact
five immutable asset descriptors, Actions bot/source receipt, manifest identity,
archive size and SHA-256/SHA-512 digests, tag/HEAD, and Latest. It trusts the
canonical workflow's authenticated source/install/attestation admission;
cryptographic Sigstore verification runs separately in promotion CI, not inside
Vercel. Historical assetless Releases retain their previous npm manifest check.
A failure prevents a production build and its release marker from publishing.

See npm's documentation for [trusted
publishing](https://docs.npmjs.com/trusted-publishers/), [staged
publishing](https://docs.npmjs.com/staged-publishing/), and [dual-use package
publishing](https://docs.npmjs.com/policies/dual-use/).
