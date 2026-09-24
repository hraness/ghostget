---
title: Build a formally checked assurance case for Ghostget
description: Audit Ghostget end to end, fix the defects the audit found, and add Quint models, Lean proofs, model-based tests, and a claims register so every stated safety law has named evidence.
type: plan
area: verification
status: proposed
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
| D14 | Read paths | The menu-bar snapshot creates incarnation files through `ensureIncarnationUnderAdmission`, and read-projection listings unlink orphaned claims. Both break the literal rule "No writes on read paths". Either the rule gets an explicit, bounded exemption or the writes move. | code-confirmed |

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
  `stable-release` concurrency can cancel a pending tag run. Media probe and
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

Acceptance per model:

- Apalache shows no violation at the recorded bounds.
- The replay test passes over at least 1,000 simulated traces in CI.
- The pre-fix variant finds the known defect.
- The claims rows point at the model and the replay test.

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
