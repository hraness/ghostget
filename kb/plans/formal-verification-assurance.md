---
title: Build a formally checked assurance case for Ghostget
description: Audit Ghostget end to end, fix the defects the audit found, and add Quint models, Lean proofs, model-based tests, and a claims register so every stated safety law has named evidence.
type: plan
area: verification
status: completed
repository_scopes:
  - src
  - edge
  - scripts
  - .github/workflows
  - docs
  - verification
  - AGENTS.md
  - kb/plans/formal-verification-assurance.md
tags:
  - verification
  - formal-methods
  - property-testing
  - runtime
  - release
---

# Build a formally checked assurance case for Ghostget

## Outcome

Every safety law that `AGENTS.md` states has a row in a checked claims
register. Each row names its evidence: a Quint model with model-based trace
replay against the production code, a Lean proof of a pure core with a
differential test against the TypeScript implementation, a stateful property
model, or an explicit "not verified" entry with the reason. CI fails when a law
loses its evidence, a model and the code drift apart, or a proof breaks.

"Correct" here means the stated laws hold under stated environmental
assumptions. Provider behaviour on third-party sites, WHATWG URL parsing, the
Bun runtime, the filesystem, and GitHub or Vercel control planes stay
assumptions. The register names each one.

## Decisions

- **Model protocols in Quint, not hand-written TLA+.** Quint compiles to TLA+
  for Apalache, runs fast randomized simulation with `quint run`, and emits ITF
  JSON traces that a Bun test can replay through the production reducer. That
  replay is what keeps a model honest. Use raw TLA+ with TLC only where a model
  needs a feature Quint lacks, and record why.
- **Prove small pure cores in Lean 4, core library only.** Targets total about
  1.5k lines of TypeScript. Connect every proof to the shipped code with a
  differential fast-check test against the compiled Lean executable, or against
  vectors the Lean code generates. Without that connection, a proof is
  documentation.
- **Keep Rust out of the shipped product.** Most risk sits in multi-process
  protocols and orchestration, where Quint and model-based tests pay off more
  than a language change. A native binary would bring back the per-platform
  distribution, signing, and notarization cost that the retired Tauri host
  (#227 → #257) already demonstrated. Rust is admitted as dev-only oracles under
  `verification/oracles/`: the RFC 8785 canonicalizer, the `url` crate for
  differential URL admission, and a Kani-checked IP classifier proposed upstream
  to `@hraness/kb`. Reopen the question only if a crash-safe store core or
  process supervisor cannot meet its law in Bun.
- **Port Valhalla's evidence discipline, not its toolchain.** Valhalla keeps a
  single `if: always()` aggregator gate, exact tool pins, finite models for
  design questions, recorded shrinks promoted to named tests, a "what is not
  verified" section, and the rule that a timeout or inconclusive run is not
  evidence. It uses Verus and Kani because it is a Rust workspace; Ghostget is
  not. Valhalla learned that Kani over std collections is intractable and
  heavy on hosted runners. Ghostget should extract pure cores before modelling
  anything.

## Audit findings

The audit covered the confirmed-write lifecycle, mutual exclusion, messaging,
control, encrypted stores, parsers, canonical encodings, the plugin kernel, the
web gateway, the Edge middleware, media, release, and CI on `origin/main`
`193dc14` (0.18.32). Evidence levels:

- **reproduced**: observed by executing code or in CI.
- **code-confirmed**: the defect is visible in the code, but the end-to-end
  scenario has not been run.
- **code-read**: a plausible race or gap found by reading; it needs a model or
  test to confirm.

### Defects

| # | Area | Finding | Evidence |
|---|---|---|---|
| D1 | Confirmed write | The idempotency fence is keyed by `adapterHash‖authHash‖operationId‖inputHash` (`src/runtime.ts` `ledgerPath`). If an account is reconnected (new auth record bytes) or the manifest hash changes, an indeterminate `posts.publish` no longer blocks the same intent. At-most-once holds per implementation and credential bytes, not per account realm, target, and intent. | code-confirmed |
| D2 | Confirmed write | Portable reconciliation accepts `{"outcome":"not-applied","evidenceHash":<any 64 hex>}` from the caller and releases the ledger (`src/portable-run-recovery.ts` `parsePortableRunReconciliationInput`, `reconcilePortableProviderPluginRun`; CLI path in `src/ghostget.ts` reconcile). An agent can clear an indeterminate fence without observed evidence or owner approval. The web-session reconciler releases only on its own readback. | code-confirmed |
| D3 | Mutual exclusion | Path-helper quarantine race (`src/path-helper.ts` ~986–1001): two recoverers see a dead owner; the second moves the first's fresh claim into quarantine and does not restore it; a third writer then links a claim while the first still believes it holds one. | code-read |
| D4 | Session secrets | File names `${namespace}--${authId}.json` are ambiguous because both grammars allow `--`. Removing account `work` deletes `bluesky--old--work.json`, which belongs to account `old--work`, or throws and blocks removal (`src/session-secrets.ts` 158, 172, 1115–1127, 1172–1181). | reproduced |
| D5 | Canonical encoding | `canonicalJson` returns invalid JSON for sparse arrays (`[,1]`), encodes `Map`, `Date`, and `{}` identically, and encodes typed arrays as objects. `legacyCanonicalJson` uses `localeCompare`, so the output depends on ICU and key insertion order. `providerPluginSemanticValue` shares the collapse. | reproduced |
| D6 | Read contracts | A JSON output with an own `__proto__` key does not round-trip through `parseInvokeReadResult` (`src/contracts-invoke-read.test.ts:212`, seed 455347073, path `3:1:86:86`). Main CI run 35687468171 failed on it, and no regression test was added. | reproduced |
| D7 | Release | Rerunning failed jobs cannot recover a publish. `publish` downloads `canonical-attested-${run_id}-${run_attempt}` (`.github/workflows/release.yml:557`) and `verifyReleaseDirectory` requires the current attempt. A full rerun rebuilds a different body, which the resume branch rejects. A failure after the PATCH leaves an immutable Latest Release that can only be superseded by a new version, contradicting `docs/publishing.md`. | code-confirmed |
| D8 | Release | A failed npm publish blocks website promotion. `resolveReleaseAuthority` requires a successful latest attempt without the canonical-job inventory that the download path accepts. `website-production` failed in 71 of the last 100 runs, mostly on this gate. This contradicts "npm failure never blocks canonical". | code-read, CI history |
| D9 | Media | Cancellation signals only yt-dlp (`src/media/process.ts` 147–159, no process group), so ffmpeg and HLS grandchildren keep running. A cancel that arrives after transcription can still return `created`. The yt-dlp path discards staging only on `CANCELLED`, while the direct path discards on every error. | code-read |
| D10 | Media | Nothing except the direct capture file and the lock is fsynced before promotion (`atomicWrite`, derivatives, transcripts, directories). A torn file after power loss makes `trackedYtDlpHead` reject the whole revision lineage with no repair path. Verification still prevents unsafe reads, but the lineage stops making progress. | code-read |
| D11 | Media | `assertOwned` observes the lock but does not fence the promotion `rename`. Media-lock liveness trusts `kill(pid, 0)` over heartbeat age, which breaks on shared or namespaced filesystems. | code-read |
| D12 | Edge | The direct `.md` branch calls `retrieve(new URL(url.pathname, url.origin))` (`edge/negotiation.ts:257`), so `//evil.example/x.md` resolves off-origin in-process. The live site is not affected: Vercel returns 308 to a single slash before middleware, and `/\` returns 404 (checked 2026-09-23). The code still violates same-origin retrieval if the platform changes. | reproduced in-process; latent live |
| D13 | Approvals | Allow-once is enforced by the client. The broker leaves an `allowed` entry checkable for 600 s and relies on the Ghostget process calling `releaseApproval` in `finally`. A crash leaves a reusable lease for same-UID callers. | code-read |
| D14 | Read paths | The menu-bar snapshot creates incarnation files through `ensureIncarnationUnderAdmission`, and read-projection listings unlink orphaned claims. Both break the literal rule "No writes on read paths". Either the rule gets an explicit, bounded exemption or the writes move. Done: #355 made the snapshot read-only, #371 moved the cache-read and omni auth checks to `AuthIncarnationReader` and recorded the two exemptions, and the residual-incarnation change binds read-path preparation, confirmation preparation, and the permission account identity the same way. Explicit invocation preparation remains the admitted creator. Owner decision (delegated): `invoke --projection-identity-only` is the SDK's identity preflight for a live invoke, so it is execution preparation and stays an admitted creator; `src/read-path-preparation.test.ts` pins that it creates a missing incarnation while `invoke --cache-only` creates none. | code-confirmed; fixed |
| D15 | Release | Manual promotion refuses a Release that an intermediate attempt published. When a failed-jobs rerun publishes bytes an earlier attempt attested, the body names that earlier attempt. A later rerun of all jobs then fails its publish job, and `resolveReleaseAuthority` reads only the latest attempt and the receipt attempt, neither of which proved all four canonical jobs. Found by a strengthened `promotionNotBlocked` over `verification/quint/release.qnt` (attempts: publish fails, rerun failed jobs publishes, rerun all) and reproduced against `resolveReleaseAuthority` with the release replay fixtures. Fixed: when the receipt attempt attested but did not publish, manual recovery and the canonical download read at most three exact intermediate attempts, each through its own attempt record and job inventory, and the model's `promotionNotBlocked` now names any publishing attempt (mutant `stepD15`). | reproduced, fixed |
| D16 | Release | A stable Release that completes out of band during publication is hidden. `publishCanonicalRelease` ran the completed-Release census before the PATCH but not after it, so a higher Release completed between that census and the PATCH (GitHub has no conditional publish) let the PATCH make the older target Latest and the run report success. Found by the stateful publisher model in `scripts/github-release-publish-model.test.ts` (shrunk to `Publish(R1, concurrent-higher at main read 7)`). Fixed: the census repeats after the terminal authority proof, and on an already-published target, so such a run fails closed; the immutable publication itself cannot be undone. | reproduced, fixed |
| D17 | Release | Pending stable Release runs could be cancelled. GitHub keeps one running and one pending run per concurrency group and cancels the pending run when a third arrives, so a tag pushed while two runs were queued never published. Fixed: the `stable-release` group sets `queue: max`, which queues up to 100 pending runs in order. | code-read, fixed |
| D18 | Promotion | The production writer accepted a stale lease as its own update. `git push --porcelain --force-with-lease` reports `=` `[up to date]` with exit status 0 when the remote already holds the pushed commit, so after a concurrent move of `website-production` to the release commit the writer returned success where the lease had failed. Found by the `verification/quint/promotion.qnt` replay, which runs the real writer against a bare repository. Fixed: `scripts/release-ref-writer.mjs` requires the one porcelain update line from the leased SHA to the release SHA; the named regression test fails on the previous writer. | reproduced, fixed |

### Evidence gaps

- **Unmodelled lifecycles.** The ledger generation chain, confirmation claim,
  duplicate successor, messaging composite runs,
  `beeper-message-like-me-recovery.ts`, state-helper and path-helper exclusion,
  media lock and promotion, and the approval broker have no stateful model.
  `AGENTS.md` requires one for consequential lifecycles. The repository has no
  `fc.commands` or `fc.scheduler` use. Only the linked-device lifecycle has a
  full action-and-fault workload.
- **Uneven parser coverage.** There are about 743 hand-written `parse*`
  functions, 66 local `isRecord` definitions with different prototype rules,
  and 65 `Object.keys(...).sort().join(",")` exact-key checks that accept a
  smuggled `"a,b"` key. Only `src/contracts-shape.ts` generates parser and
  schema from one table. Plugin protocol, package, store, registry, host,
  portable identity, session secrets, and the control gateway have zero
  properties. Many "arbitrary JSON" properties only reach the rejection path.
- **Seed replay bypassed.** 102 direct `fc.assert` calls, including every
  media property file, skip `assertProperty`, so the
  `GHOSTGET_PROPERTY_SEED` and path replay does not apply to them. No seed
  corpus or soak run exists.
- **Linux-only suites.** macOS CI runs 10 files. The darwin-arm64
  `src/providers/messaging-native-install.test.ts` never runs in CI. Perf
  budgets run only with `GHOSTGET_STRICT_PERF`, which CI never sets.
- **Unreproduced binaries.** `imsg-darwin-arm64.gz` (Swift) and
  `wacli-darwin-arm64.gz` (Go) are committed binaries. imsg provenance records
  zero clean rebuilds. The release attestation proves the workflow packed
  them, not that they came from reviewed source.
- **Doctrine drift.** `AGENTS.md` expects two active `refs/tags/v*` rulesets.
  Four tag rulesets are active; the extra two target `desktop-v*-macos-arm64`.
  A literal readback reports drift.
- **Weaker items.** The lazy-load revalidation compares disk bytes, so an
  A→B→A edit passes. That is acceptable under the single-writer assumption,
  but the assumption is not written down. Durable contract hashes change only
  on a version bump, and nothing checks that a closure change forces one.
  `stable-release` concurrency could cancel a pending tag run (D17, fixed). Media probe and
  capture are two yt-dlp calls, and capture does not recheck live or DRM
  status.

## Assurance architecture

Each claim gets the cheapest layer that can carry it:

1. **Claims register** (`verification/claims.json`, rendered into
   `docs/assurance.md`). One row per law: statement, source rule, layer,
   evidence path, assumptions, and the not-verified scope. A test fails when an
   `AGENTS.md` safety rule has no row, or a row's evidence path does not exist.
2. **Example and property tests.** These are the existing base. Every
   property goes through `assertProperty`. Parsers get valid-value-plus-mutation
   generators.
3. **Stateful model-based tests.** `fc.commands` or bounded action-and-fault
   schedules run over the production reducer and ports. A crash-injecting
   `StatePort` filesystem double covers rename, link, readdir, fsync, and
   power-loss truncation.
4. **Quint protocol models.** These check safety invariants with Apalache
   (bounded) and `quint run` (randomized). Conformance comes from replaying
   ITF traces through the production reducer. A model with no trace replay
   counts as design evidence only.
5. **Lean proofs.** These cover pure cores, with differential tests binding
   the shipped TypeScript to the proved definition.
6. **Differential oracles.** Rust or Python oracles run as independent
   references for encodings and URL and IP classification. Golden vectors live
   in `verification/vectors/`.

Carry over Valhalla's rules into `AGENTS.md`:

- A timeout, an inconclusive checker result, or compilation alone is not
  evidence.
- Promote every recorded shrink to a named example test.
- Pin every verification tool to an exact version.
- Keep "what is not verified" beside every claim.

## Work

The phases are ordered by dependency. Each phase lands as one or more
current-head PRs through `Required` CI. The phases use the `write-phase-plan`
shape so `phase-orchestrator` can run them.

### Phase 1: reproduce and fix the confirmed defects

Scope: D1, D2, D4, D5, D6, D7, D8, D12. Write the failing test first, then fix.

- D1: bind the ledger fence to an intent key ⟨account realm, provider target,
  operation id, canonical input⟩. Before dispatch, check all unsettled runs for
  that intent, whatever the adapter or auth hash. Keep the current path for
  lookup compatibility. Add a regression test for reconnect-then-confirm and
  manifest-hash-change-then-confirm.
- D2: a portable `not-applied` release requires observed evidence from the
  plugin's own readback operation, or an owner approval through the control
  broker. Caller-typed hashes alone are rejected.
- D4: length-prefix or escape the session-secret file name so the encoding is
  injective. Migrate existing files with a dry-run readback first, and add an
  injectivity property.
- D5: make `canonicalJson` reject non-plain prototypes, sparse arrays,
  accessors, and symbols, using the rules `canonicalPortableJson` already has.
  Pin `legacyCanonicalJson` to code-unit ordering for verification only, and
  add a `fc.anything()` rejection property.
- D6: fix the `__proto__` round trip and promote seed 455347073 to a named
  test.
- D7 and D8: name the attested artifact by run so a failed-jobs rerun can
  resume. Allow the resume branch across attempts of the same run when
  the body matches exactly. Pass the canonical-job inventory to
  `resolveReleaseAuthority`.
- D12: require `retrieved.origin === request.origin` and add the property.

Acceptance: each defect has a named regression test that fails on `193dc14`
and passes after the fix, and `Required` passes.

#### D1 and D2 follow-ups

| Follow-up | State |
| --- | --- |
| Doctor readback of the intent fence | Done: `ghostget.intentFences` in `ghostget doctor`, claim `intent-fence-readback`. |
| Bind the recovery realm to the provider subject | Done: recovery capsules record the auth record's subject, claim `recovery-auth-continuity`. |
| Reconcile across a reauth | Done: web-session and portable reconcile and web duplicate-successor election accept a reconnect that keeps the locator, kind, and recorded subject. Capsules with no subject still need the exact record. |
| Portable readback protocol | Done (claim `portable-retained-release`, `verification/quint/retained.qnt`). The owner chose an optional versioned readback: a write declares `readback: {version: 1, operation, contractVersion}`, protocol 2 carries only the `host.readback` and `plugin.readback.result` frames, and protocol 1 stays accepted. Ghostget invokes the readback itself, bound to the run, intent, auth realm, and manifest, and only its observed `not-applied` releases the fence. Undeclared plugins keep the explicit-input path. Still open: no owner-approval route reaches portable reconciliation. |
| Duplicate successors for portable runs | Done (claim `portable-retained-release`). Portable writes elect duplicate-risk successors under the web path's rules. Once the successor settles, the source's journal records `supersededBy`, which releases its recovery material and assets so the bundle is quiescent; its ledger stays indeterminate. Supersession runs at plugin install, disable, and removal and in the doctor repair pass. |
| Fence keyed by subject across locators | Done: new run journals record an optional, strictly parsed `authSubject`; before dispatch the fence also refuses while an unsettled run of the same target, operation, input, and source recorded the same subject under another locator, at its scan and again after its claim. Journals without a subject keep the per-locator fence. Operator-typed subjects can only over-block. `fence.qnt` gained a locator and subject dimension and the `stepSubjectBlind` mutant, claim `intent-fence-subject-across-locators`. |

### Phase 2: test infrastructure

- Route all 102 direct `fc.assert` calls through `assertProperty`, and add a
  lint test that rejects new ones.
- Add a checked-in seed corpus under `verification/seeds/`, and a nightly soak
  workflow at 20× `numRuns` whose failures are reported with seed and path.
- Build the crash-injecting `StatePort` double and a `fc.commands` harness
  helper in `src/test-support.ts`.
- Add `messaging-native-install.test.ts` to the macOS suite. Run perf budgets
  in the nightly soak.

Acceptance: `git grep "fc.assert(" -- src | grep -v test-support` is empty.
The soak runs once green.

### Phase 3: claims register and CI gate

- Write `verification/claims.json` and its strict parser. Generate
  `docs/assurance.md` from it, including the "not verified" and assumptions
  sections.
- Add a `verification` job to `ci.yml` and include it in `Required`. The job
  runs the register completeness test, Quint typecheck and simulation, Apalache
  at CI bounds, `lake build`, and the differential tests. Keep Quint, Apalache,
  Lean, and JDK pins exact. Apply a path filter only to the expensive checker
  runs, never to the register test.
- Add the Valhalla evidence rules to `AGENTS.md`.

Acceptance: deleting any evidence path, or adding an `AGENTS.md` safety rule
without a row, fails `Required`.

### Phase 4: Quint protocol models with trace replay

Build one model per protocol. Each has invariants, deliberate fault actions,
and an ITF replay test through production code.

1. **Confirmed-write fence.** N processes with preview, confirm, acquire,
   dispatch, crash, repair, reconcile, reauth, manifest upgrade, and duplicate
   successor. Provider evidence is a nondeterministic oracle constrained by
   ground truth. The invariant is
   `∀ intent: |effects(intent)| ≤ 1 + |duplicateSuccessors(intent)|`. The
   pre-Phase-1 variant must reproduce D1 and D2. Replay traces through
   `transitionRunJournal`, `acquireLedger`, and the repair functions over
   `StatePort`.

   Execution note (2026-09-24): `fence.qnt` now models duplicate-risk
   successors. A successor is its own intent, narrowed to one terminal,
   unsettled, indeterminate source that still binds the current auth record
   and manifest, and it elects that source once, just before its dispatch.
   `fenceSafety` checks the full bound (dispatches ≤ 1 + elected successors),
   no intent dispatched twice, and that only an indeterminate run elects a
   successor. Two new mutants break it: `stepUnelected`, where a successor
   skips the election, and `stepElectInFlight`, where a successor names an
   in-flight source. The replay now also drives the file-backed state layer
   on a real state home, over a five-trace greedy cover of every action
   result the seeded traces take (each state operation spawns the bound
   state helper, so all 2,000 traces would take hours): journals, `acquireConfirmedWriteLedgers` (the intent
   ledger, then the hash-keyed ledger, the composition the confirmed-write
   platform calls), `repairInterruptedRunJournals` after a lost outcome and
   after every step, and `releaseReconciledRunRecovery`. The
   `indeterminate-never-retried` claim is evidenced by this model. Still open:
   the `confirmInvocation` program itself, including
   `claimDuplicateRiskSource`'s receipt, capsule, and ledger rechecks, is
   covered only by example tests.
2. **State-helper and path-helper exclusion.** The three-phase claim with
   stale-owner reaping. Check two variants: `readdir` as an atomic snapshot,
   and `readdir` that may omit renamed entries. The invariant is
   `|{p : critical(p)}| ≤ 1`. The model must reproduce D3 before its fix.
3. **Media lock, staging, promotion, and revision chain.** Include
   crash points and concurrent `--refresh`. The invariants are "a promoted item
   passed closed verification" and "a revision chain has one head". The
   progress property "a crash never makes a lineage permanently invalid"
   drives D10.
4. **Messaging composite run.** The invariants are the ordered accepted
   prefix, at most one part dispatching or indeterminate, and no redispatch.
   Add a `fc.commands` model for Beeper and Message Like Me recovery.
5. **Approvals and connections.** Model digest binding at dispatch, lease
   expiry, crash, and reconnect. The invariant `allowed ⇒ uses ≤ 1` drives
   the fix for D13.
6. **Release and promotion.** Model the attempt and artifact machine, reruns,
   draft and Latest convergence while main moves, `C ≤ W ≤ M`, the
   concurrency group, npm absent, exact, or conflict states, and App-token use
   after revocation. The progress goal is "an immutable Release is eventually
   promoted or leaves explicit stuck evidence". Replay traces through the
   pure validators in `scripts/`.

   Execution note (2026-09-24): the publication half of item 6 is evidenced
   without a new Quint model. A `fc.commands` model in
   `scripts/github-release-publish-model.test.ts` drives the production
   `publishCanonicalRelease` against a fake GitHub across publication
   attempts, reruns, lookup, inventory, authority and write faults, later and
   front-run Releases, edited bodies, and stored-byte corruption, and checks
   the write laws after every command. It found D16. Properties cover the
   completed-Release census and Latest convergence
   (`scripts/release-provider-outcome.test.ts`), App-token revocation and its
   mint-operate-revoke lifecycle (`scripts/release-app-token-revocation.test.ts`),
   and npm reruns through the real registry step scripts
   (`scripts/npm-publish-model.test.ts`). Structural tests pin D17's fix and
   the npm job graph. These files now run in `test:npm-release`; before this,
   no CI job ran `scripts/release-provider-outcome.test.ts`, although evidenced
   claims cited it. Each release claim's evidence was checked against 26 deliberate
   mutants of the publisher, census, Latest wait, revocation helper, and
   workflow; every one fails a cited test. Still open:
   `npm-publish-at-most-once-per-version` stays planned, because under
   registry read lag a rerun issues a second `npm publish` that only npm's
   version immutability refuses; the statement needs a durable per-version
   record or an owner-accepted restatement.

   Execution note (2026-09-24), website promotion: `promotion.qnt` models
   one run of `.github/workflows/website-production.yml` after its verify
   job (three authority checks, the baseline, the promotion checks, the
   leased write, and a three-observation poll budget) against an environment
   that moves main, the production ref, the tag, and Latest, fails or
   finishes the Vercel deployment, changes the apex marker, and arms one of
   ten drifts between the two terminal readbacks. Its seven invariants back
   `promotion-leased-fast-forward-only`, `promotion-c-le-w-le-m`,
   `promotion-revalidate-after-admission`,
   `promotion-success-requires-stable-readbacks`,
   `website-outcome-baseline-to-target-only`, and the progress claim, and
   each has a mutant step. The replay runs the production authority,
   baseline, promotion, and outcome functions, and the real writer's Git
   fetch, peel, and leased push against a bare repository, over 300 traces
   per step relation; it found D18. The progress goal is checked as a
   bounded invariant (a verdict within nine production steps, and every
   stuck verdict explained by the environment), not as a temporal property
   under fairness. `promotion-observation-window` moved to the property
   layer: the model abstracts time, and a fast-check property drives the
   production slot schedule with generated latencies and early wakeups.
   Bounds: Required runs Apalache to length 11, the shortest length at
   which every mutant step is found (at 10 `stepSingleReadback` passes),
   and the nightly workflow repeats the model at length 12 with 10,000
   simulation samples of up to 20 steps. Local cost on a host at load
   about 32: about 17.5 minutes for the whole promotion entry at length 11
   (Apalache invariants and mutants about 14.5, the replay 178 s), against
   about 19 minutes at length 12; the CI cost is read from the PR run.
   Still open: the release attempt machine beyond `release.qnt`, npm
   registry states, App-token use after revocation, and a temporal check of
   the progress law.

Acceptance per model:

- Apalache shows no violation at the recorded bounds.
- The replay test passes over at least 1,000 simulated traces in CI.
- The pre-fix variant finds the known defect.
- The claims rows point at the model and the replay test.

Execution of item 2, 2026-09-24:

- Done: the D3 follow-ups. A path helper from before the reaper election
  moves a live claim away and never restores it. A current helper that claims
  afterwards now finds that live claim in its recovery quarantine, releases
  its own claim, and fails closed. The residue sweep keeps a quarantine whose
  claim's owner is still alive and removes it once that owner exits. A named
  test in `src/path-helper.test.ts` failed before the change.
- Done: `verification/quint/state-claim.qnt` models the state helper's
  three-phase claim with a dead claim and a `readdir` that may miss or report
  stale renames; an atomic snapshot is one of its outcomes, so one model
  covers both variants. Its replay drives `listLiveStateMutationClaims` and
  `decideStateMutationClaimStage` on real claim files for 2,000 traces, and
  its mutants drop the listing after the rename to `held` or its check. The
  model found that a non-atomic listing can let both claims reach `held`; the
  later one then fails closed with "arbitration admitted two owners".
- Open: the path-claim replay runs 60 traces, below the 1,000 in the
  acceptance list, because each trace drives three real helper processes.
  The Quint model has no pre-election helper, and nothing stops such a helper
  that claims third.

Control and authority claims, 2026-09-24 (branch `claude/fv-claims-control-auth`):

- Evidenced by stateful models over production code, each paired with named
  source mutants in `verification/mutants.json`:
  `control-single-helper-owner` (`src/control/helper-owner.property.test.ts`
  over `inspectControlOwner` and `commitControlOwner`),
  `shutdown-settles-before-custody-release`
  (`src/control/helper-shutdown.property.test.ts` over `settleHelperShutdown`
  and `Connections`), `web-gateway-durable-audit-precedes-network`
  (`src/control/web-gateway.property.test.ts` over `WebGateway`,
  `ActivityStore` and `ApprovalBroker`), and, through
  `src/operation-authority.property.test.ts`,
  `no-cached-authorization-across-change`, `grant-binds-exact-identity`,
  `auth-request-binding`, and `mutation-exact-preview-confirmation`.
- `grant-binds-exact-identity` moved from the Quint layer to the stateful-model
  layer. Its replay would drive the permission layer, where every state
  operation spawns the bound state helper, so 1,000 traces are out of reach in
  CI; the stateful model checks the digest law directly on the production
  layer instead.
- Defect fixed: under managed permissions, `confirmInvocation` refused an
  expired or drifted plan but left it saved, so restoring the interface let
  the same plan dispatch later. It now consumes the plan, as the unmanaged
  path already did. `src/operation-permission.test.ts` failed before the fix;
  the existing A-to-B-to-A test had asserted that the refused plan survived
  and now asserts that it is consumed.
- Defect fixed earlier on the branch: the pinned transport now refuses every
  non-public resolved address with `src/public-address.ts` (see Phase 7).
- `helper-owner`, `helper-shutdown` and the permission layer gained small
  exported seams (`inspectControlOwner`, `commitControlOwner`,
  `settleHelperShutdown`) that production calls unchanged.
- Open: `mutation-idempotency-key` stays planned. The fence model and the
  authority model's retry command cover provider dispatch for confirmed
  writes only; storage and quota charges of a retry, routes whose contracts
  declare `idempotency: none`, and the dedupe window's expiry are not covered.
- Open: plans bind the reviewed contract implementation identity, not the
  exact closure; only a managed grant binds the exact closure. Recorded in
  `auth-request-binding`'s not-verified scope.
Execution of items 3 and 4, and of the browser-admission models, 2026-09-24:

- Done: `verification/quint/media.qnt` gains the invariants
  `promotedVerified` (no revision is promoted without passing closed
  verification of its staged item), `promotedDurable` (every promotion flushed
  the staged tree and both parents), and `lineageRecoverable` (crash and
  power-loss damage reaches only the head, and discovery never answers
  invalid for a lineage whose only damage is a torn revision). Its new
  variants `stepUnverified`, `stepNoSync` (before D10), and `stepNoRepair`
  (before D10) each violate the invariant they target, in Quint simulation
  and in Apalache. The replay runs the real `verifyMediaItem` on every
  revision the model calls ok, derives each revision's durability from the
  flushes production made, and diverges when production's post-rename flush
  of the revision parent is deleted: "state 5: after promote(p) the lineage
  is [ok B unflushed], the model [ok B]". The progress property is checked as
  this safety invariant, not as liveness under fairness.
- Done: `src/beeper-message-like-me-recovery.model.test.ts` is the
  `fc.commands` model of the Beeper Message Like Me export admission. The
  directory-lease recovery keeps only its example tests.
- Done: the messaging stop and no-resubmission laws are checked by a
  property over single-event schedules in
  `src/messaging-runtime-execution.test.ts`, against the production composite
  runtime and a reference model, instead of a stateful model.
- Done: `src/browser-admission.model.test.ts` is an `fc.commands` model of
  browser admission across simulated processes that reuse one PID, with owner
  death, unreadable liveness, reboots, and a clock that jumps on any reading.
  It replaces the Quint model this plan scheduled for the cap and PID-reuse
  claims.
- Every run of the three `fc.commands`-style checks first runs fixed boundary
  schedules, so each seeded defect in `verification/mutants.json` fails on
  every run rather than on a lucky seed.
- Open: `committed-binaries-provenance` stays planned for Phase 6. The
  provenance records pin sources, patches, and build commands, but no CI job
  rebuilds either binary, and imsg's record shows no clean rebuild.

### Phase 5: Lean proofs of pure cores

Lay out `verification/lean/` as a Lake project with a pinned toolchain and no
Mathlib unless a proof needs it. Proof targets:

- Canonical JSON over an inductive `Json` with UTF-16 key order: the encoder
  is injective, parse-then-encode is the identity on canonical output, and key
  order is total.
- The length-framed hash input and the `json ‖ 0x00 ‖ 32-byte` suffix are
  injective.
- Identifier grammars, and route, operation, and session-secret composite keys:
  `parse ∘ format = id` and the keys are unambiguous.
- Web policy decision: deny beats ask beats allow, adding a deny rule never
  widens the result, and prefix matching is exact.
- `assertJournalInvariants` is inductive under `transitionRunJournal`, and the
  dispatch counters are monotone.
- The same inductive-invariant proof for `transitionMessagingRun`.
- Edge Accept negotiation returns 406 only when no representation remains.

Bind each proof to the code with a differential fast-check test against the
compiled Lean executable, or against Lean-generated vectors.

Acceptance:

- `lake build` succeeds with no `sorry`, and a check enforces that.
- Each proof has a differential test in `Required`.

### Phase 6: structural hardening

- Extend the `contracts-shape.ts` Shape DSL to plugin protocol frames, store
  and trust records, control requests, and leases. Replace the local
  `isRecord` and comma-joined key helpers with one shared `exactKeys`. Prove the
  DSL properties once: exact keys, bounds, and parse and render agreement.
- Enforce "no writes on reads" with a type-level read capability for
  read-path ports. Record the D14 exemption decision in `AGENTS.md`.
  Done: `AuthIncarnationReader` (#355), the auth checks and exemptions
  (#371), and read-path, confirmation, and permission-identity preparation
  (residual-incarnation change).
- Fix the media findings:
  - D9: spawn in a process group and kill the group. Check cancellation before
    promotion. Discard staging on every error in both pipelines.
  - D10: fsync files and parent directories before and after the promotion
    rename, and use `F_FULLFSYNC` on macOS. Add a lineage repair path.
  - D11: fence promotion with a lock generation token, and use heartbeat
    age as well as PID liveness.
- Build imsg and wacli in CI from pinned source with provenance, and stop
  committing binaries.
- Update the `AGENTS.md` tag-ruleset readback to the four live rulesets. Add a
  workflow scan so that only `publish_npm` references `npm-release`.

### Phase 7: independent oracles

- Add a dev-only Rust crate under `verification/oracles/` with an RFC 8785
  canonicalizer and a `url`-crate differential for `publicUrl`. It runs in the
  `verification` job and is never packaged.
- Propose to `@hraness/kb` a Kani-checked, or Lean bit-vector-checked, IP
  classifier against the IANA special-purpose registries, including
  IPv4-mapped IPv6. That classifier is the real SSRF boundary for the web
  gateway.
- Commit Python-generated golden vectors for hashes and encodings to
  `verification/vectors/`.

Execution, 2026-09-23:

- `verify:oracles` builds `ghostget-oracle` with Rust 1.97.1 and
  `cargo build --locked`, checks the vectors with `generate.py --check`, and
  runs `scripts/verification-oracles.test.ts` and
  `scripts/verification-vectors.test.ts`. It is the last step of `verify`.
- Three claims are evidenced at the differential layer:
  `canonical-json-matches-rfc8785-oracle`,
  `public-url-matches-url-crate-oracle`, and
  `media-identity-hashes-match-golden-vectors`. Each comparison also rejects
  seeded defects.
- The golden number vectors caught a bug in the first oracle draft: Rust's
  shortest-digit `{:e}` wrote 1424953923781206.25 as `...206.3`, where
  ECMAScript breaks the tie to the even digit, `...206.2`. The TypeScript was
  already right.
- Review found a second oracle bug that 200 differential runs missed: at 46
  powers of two, such as 2^-44, the oracle wrote 17 digits where ECMAScript
  writes 16. Below a power of two the doubles are half as far apart, so the
  shortest text that parses back can lie on the far side of the closest
  decimal. The oracle now tries that neighbour, and the vectors and the
  differential generator now include every power of two.
- The URL differential found no policy disagreement. It names four parser
  differences, each of which leaves the gateway refusing the input: Bun
  percent-encodes `^` in paths, Bun accepts `[::1:]` and drops a leading `/.`
  from a non-special path, and the `url` crate keeps a drive-letter segment
  before `..` in an https: path.
- `canonicalJson` writes a lone surrogate as an escape where RFC 8785 refuses
  the input. The vector test pins this, and the claim records it.
- The classifier proposal is `kb/plans/kb-ip-classifier-proposal.md`.
  Update, 2026-09-24: `gateway-rejects-private-addresses` no longer waits for
  `@hraness/kb`. The pinned transport checks every resolved answer with
  Ghostget's own allowlist, `src/public-address.ts`, after the kb check, and
  `verification/vectors/generate.py` restates the IANA special-purpose table
  in Python for golden vectors in `verification/vectors/addresses.json`. The
  claim is evidenced at the differential layer for the gateway's pinned
  transport only; page capture, derivation and the derivation network proxy
  still rely on the kb classifier.

### Phase 8: continuous assurance

- Nightly jobs run deeper Apalache bounds, the property soak, and mutation
  testing on the reducers. Evaluate StrykerJS under Bun first, and record the
  result if it is unsupported.
- Add a quarterly claims review that reruns this audit's areas and appends
  findings here.

Landed on 2026-09-23 on branch `claude/fv-continuous`:

- `.github/workflows/verification-nightly.yml` runs daily and on manual
  dispatch, read-only and outside `Required`. It runs
  `bun run ./scripts/verification-tools.ts quint-nightly` at each model's
  `nightly` bounds in `verification/quint/models.json`, a six-shard property
  soak at `GHOSTGET_PROPERTY_RUNS=20`, and the reducer mutants.
- StrykerJS 10.0.0 has no Bun runner. Through its command runner it
  instrumented 159 mutants in 107 lines of `src/run-journal.ts`, and each
  mutant reruns the whole test file, about 40 minutes for that one reducer.
  It is not adopted. `verification/mutants.json` and
  `scripts/verification-mutants.ts` check named guard mutants against the one
  test that must fail. `docs/claims-review.md` records the evaluation.
- The first mutant pass found that no test asserted the messaging reducer's
  active-prefix and dispatch-boundary guards. Removing the accept or
  categorical-stop guard left `src/messaging-action-store.test.ts` green.
  Removing the active-prefix guard failed two tests in a whole-file run, but
  each passed when selected alone. A named example test now asserts each
  guard, and all 12 mutants are killed.
- `docs/claims-review.md` holds the nightly triage steps and the quarterly
  review procedure. Reviews append to "Quarterly claims reviews" below.

## Closeout

All phases landed on main by 2026-09-25, each through a pull request that
passed the complete `Required` job union on its current head against the
current base. The final lane merges: `7ce5e418` (media, messaging, and
browser admission models), `7c4ef1a7` (verification concurrency), `3d1292be`
(`retained.qnt`, the portable retained readback and supersession replay),
`8c3724ca` (the browser-admission model's timeout oracle compares the
simulated clock value, not its last read), `b718fbc6`
(`GhostgetVerification.RouteKey`, five core-law claims, axiom audit),
`c6f6b799` (control/auth claims, the `src/public-address.ts` classifier and
IANA vectors), and `1fd2d81b` (subject-keyed fence, `stepSubjectBlind`).

Lane integration caught four real defects the register then covered:

- The packed CLI crashed on `./public-address` because the new module was
  missing from `files`; the packed smoke and `tui --snapshot` found it, and
  the package now ships 597 entries.
- The file-backed fence replay diverged on `finish(r3, succeeded)`:
  production's repair sweep supersedes the elected source, while
  `fence.qnt` kept `reconciled` empty. `finish` and `reconcile` now
  reconcile the elected source, matching
  `supersedeSettledDuplicateSources` (dispatched, settled, never failed).
- The subject-refusal classifier rejected generated locators containing
  digits as "unexpected reason"; the pattern now admits `[a-z0-9-]+`.
- `fence.qnt` outgrew its budgets under shard-local parallel Apalache.
  Its measured weight is 1150 s so the packer isolates it, and the shard
  step and job timeouts moved to 30 and 35 minutes.

The register on `main` carries 246 claims: 223 evidenced, 4 planned, 19
not-verified, across 90 guideline rules. The still-planned claims and their
blockers: `strict-foreign-parsing` (property coverage does not yet cite
every strict parser the claim ranges over), `mutation-idempotency-key`
(storage and quota charge retries, `idempotency: none` routes, and
dedupe-window expiry are outside the confirmed-dispatch models),
`npm-publish-at-most-once-per-version` (registry read lag still admits a
second issued publish; it needs a durable per-version record or an
owner-approved narrower claim), and `committed-binaries-provenance`
(imsg/wacli need a CI source build with provenance evidence before the
committed binaries can be removed). They stay registered planned claims;
the quarterly review tracks them.

## Quarterly claims reviews

Each review follows `docs/claims-review.md` and appends one dated entry here:
the commit reviewed, new findings with their evidence level, claims whose
status changed, and nightly failures since the last review. The first review
is due in the first week of January 2027.

## Verification

- Every phase: `bun run check` locally for the touched area, then `Required`
  CI on the current head.
- Phase 3 onward: the `verification` job, all green, with checker output
  retained as a CI artifact. An inconclusive or timed-out checker fails the
  job.
- Each model and proof must detect its seeded pre-fix defect. A model that
  cannot find a known bug is not accepted as evidence.

## Recovery

- Phase 1 fixes that change durable state (D1 fence key, D4 file names) ship
  with a dry-run migration readback, and keep the old paths readable until
  every unsettled run has settled.
- Every verification layer is additive. Revert a failing checker job by PR,
  never by skipping it.

## Not verified by this plan

- Provider behaviour on third-party sites.
- Correctness of Bun, JavaScriptCore, the OS filesystem beyond the modelled
  `StatePort` semantics, WHATWG URL parsing (covered only differentially),
  GitHub, npm, Sigstore, and Vercel.
- Hostile in-process plugin code, which `AGENTS.md` already treats as trusted.
- Hostile processes running as the same user.

## Result

Shipped. Every `AGENTS.md` safety law has a checked row in
`verification/claims.json`; `docs/assurance.md` renders the same register
and both are re-validated on every change. Eleven Quint models replay
seeded ITF traces through the production reducers and ports, each with
named mutants the checkers must kill; `verification/quint/models.json`
carries the CI and nightly bounds and the weight that packs them into
shards. The Lean `GhostgetVerification` modules prove the pure cores
(registry-key unambiguity and injectivity, canonical JSON, ordering, and
contract-kernel laws) with differential tests against the TypeScript and a
recorded axiom audit; `verification/oracles` adds Rust oracles and
`verification/vectors` the generated golden vectors. The nightly workflow
runs deeper bounds, the property soak, and the named mutants outside
`Required`, and `docs/claims-review.md` holds the triage and quarterly
review procedure.

Four claims remain planned with their blockers recorded in the closeout
above, and the recorded open items stand: the path-claim replay at 60
traces (each trace drives three real helper processes), the
`confirmInvocation` program beyond the modeled journal cores,
`auth-request-binding`'s not-verified scope (plans bind the reviewed
contract implementation identity, not the exact closure), the release
attempt machine beyond `release.qnt`, and the owner-approval route for
portable reconciliation.
The failures the audit and the lanes found are fixed and their
reproducers retained as named tests; what the plan deliberately does not
verify stays enumerated above.

## Durable memory

- The standing contract is the checked register and its rendering:
  `verification/claims.json`, `docs/assurance.md`, the `verification` job,
  and the `Required` gate. A checker timeout, an inconclusive or unparsed
  checker result, or a successful compile alone is missing evidence
  (`AGENTS.md`); the register fails closed on each.
- `docs/claims-review.md` owns nightly triage, the seeded-defect replay
  commands, and the quarterly claims-review procedure; reviews append to
  "Quarterly claims reviews" above.
- A model's CI shard weight lives in `MEASURED_QUINT_MODEL_WEIGHTS` in
  `scripts/verification-tools.ts`; refresh it from the latest CI run log
  whenever a model grows and the shard packing is asserted disjoint.
- The package budget is re-measured per shipped-source merge:
  `scripts/package-budget.ts` holds the measurement record and the derived
  ceilings that `scripts/npm-release-workflow.test.ts` pins.
- Reusable conclusions need no maintained-note promotion: the procedure
  owners are `docs/claims-review.md` and the `AGENTS.md` verification
  rules, and the facts live in the checked register. This plan stays as
  the execution history.
