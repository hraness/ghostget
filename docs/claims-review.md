# Nightly verification and the quarterly claims review

`docs/assurance.md` states what Ghostget's checks prove. The `Required` PR gate
keeps those checks inside a 16-minute verification step. This procedure covers
the deeper nightly checks and the quarterly review that keeps
`verification/claims.json` honest.

## Nightly verification

`.github/workflows/verification-nightly.yml` runs at 07:17 UTC every day and on
manual dispatch. It holds only `contents: read`, pins every action to a full
commit, and checks out without persisted credentials. It is not a `Required`
dependency, so a nightly failure blocks no merge or release. A failure is still
a finding. Triage it with the steps below.

It runs three jobs:

- **`quint nightly bounds`** runs
  `bun run ./scripts/verification-tools.ts quint-nightly`. For each model in
  `verification/quint/models.json` it uses the optional `nightly` bounds: more
  simulation samples, longer simulation traces, and a longer Apalache bound.
  The parser rejects a nightly bound below its CI bound, and a `nightly` entry
  must deepen at least one bound. A model without `nightly` repeats its CI
  bounds and logs that. Each seeded mutant must still be found at the deeper
  bounds. Output lands in `artifacts/verification/quint-nightly/` and is
  uploaded for 30 days.
- **`property soak N/6`** runs `bun run ./scripts/verification-soak.ts N 6`
  with `GHOSTGET_PROPERTY_RUNS` set to 20 by default. The soak selects every
  `src` unit test file that calls `assertProperty` or `assertAsyncProperty`.
  `src/test-support.ts` multiplies each property's `numRuns` and
  `interruptAfterTimeLimit` by the value, which must be an integer from 1 to
  100. Properties that call `fc.assert` directly do not scale until they move
  to the shared helpers.
- **`reducer mutants`** runs `bun run ./scripts/verification-mutants.ts`. See
  [Reducer mutants](#reducer-mutants).

Run the same checks locally:

```sh
bun run ./scripts/verification-tools.ts quint-nightly
GHOSTGET_PROPERTY_RUNS=20 bun run ./scripts/verification-soak.ts 1 6
bun run ./scripts/verification-mutants.ts
```

### Triage a nightly failure

1. Open the failed run with `gh run view <run-id> --log-failed`.
2. For a Quint or Apalache failure, download the `nightly-quint-attempt-N`
   artifact and read the model's log. A violation at a deeper bound is a real
   counterexample: reproduce it with the logged command, then fix the model or
   the production code in a PR. A timeout or an unparsed verdict is missing
   evidence, not a pass; lower the nightly bound in the same PR only when the
   log shows the checker needs more than the job budget.
3. For a property soak failure, copy the printed seed and path, and replay the
   property with `GHOSTGET_PROPERTY_SEED`, `GHOSTGET_PROPERTY_PATH`, and an
   anchored `--test-name-pattern`. Promote the minimized counterexample to a
   named example test in the fixing PR.
4. For a mutant failure, read `artifacts/verification/mutants/summary.json`.
   Each mutant records a `baseline` and a `mutant` verdict. A baseline other
   than `pass` means the named test fails or times out on unmodified source;
   fix that test first. A mutant verdict of `pass` means the named test no
   longer detects the defect; restore the test's strength or replace the
   mutant with a stronger one. An `inconclusive` mutant verdict means another
   test failed, the run timed out, or the output did not parse. If the job
   stops with "no longer occurs" or "occurs more than once", the source
   changed; update that mutant's `search` text in `verification/mutants.json`.
5. Record the outcome in the next quarterly review.

## Reducer mutants

`verification/mutants.json` lists named source mutants of the production
reducers in `src/run-journal.ts`, `src/messaging-action-store.ts`, and
`src/linked-device-lifecycle-journal.ts`. Each entry removes or weakens one
guard, names the defect that change introduces, and names the one test that
must fail. The runner copies the tracked tree into a temporary sandbox, runs
the named test on unmodified source, applies the mutant, and runs the test
again. The mutant counts as killed only when the unmodified run passes exactly
one test and the mutated run fails exactly that test. A timeout, a different
failing test, or a compile error is inconclusive and fails the job.

Add a mutant when you add a guard that a reducer test protects. Keep each
`search` string unique in its file, and keep the named test's full
`describe` > `test` path.

### StrykerJS evaluation

StrykerJS 10.0.0 was evaluated on 2026-09-23 against the `transitionRunJournal`
reducer in `src/run-journal.ts`, lines 954 to 1060.

- Stryker has no Bun test runner. It runs under Bun only through its generic
  command runner, with `coverageAnalysis` set to `off`, because that runner
  cannot report per-test coverage.
- It instrumented 159 mutants in those 107 lines. The dry run of
  `bun test src/run-journal.test.ts` succeeded in 45 seconds.
- The command runner reruns the whole test command for every mutant, so the
  reducer alone needs about 159 × 45 s / 3 ≈ 40 minutes at concurrency 3. On
  the evaluation host, under a load average of 25 to 41, the run reported no
  mutant results after 31 minutes and was stopped.
- A property test in the same file set was interrupted by its time limit
  during the dry run. It is also interrupted on unmodified source on that
  loaded host, so the time limit, not Stryker, caused the failure.
- The third-party `@hughescr/stryker-bun-runner` was not evaluated, because
  it would add an unreviewed dependency to the package graph.

Stryker is not adopted. Its mutant count and per-mutant full reruns do not fit
a nightly job for the three reducers, and a survived Stryker mutant does not
name the property it weakens. The scripted runner checks fewer mutants, but
each one names its defect and the test that must detect it.

## Quarterly claims review

Review the register in the first week of January, April, July, and October.
One maintainer or agent owns each review and opens one PR.

1. Branch from current `main`.
2. Run `bun run ./scripts/verification-claims.ts check` and `bun run verify`.
3. List the quarter's nightly runs with
   `gh run list --workflow verification-nightly.yml --limit 100`. Confirm
   that every failure was triaged, and that each job ran on a recent `main`.
4. For every claim in `verification/claims.json`, confirm that each cited
   evidence path still tests the quoted text, that `status` matches the
   evidence, and that `notVerified` still names what the evidence skips.
   Downgrade a claim whose evidence weakened.
5. Rerun the audit areas listed under "Audit findings" in
   `kb/plans/formal-verification-assurance.md` over the changes since the last
   review. List them with `git log --since=<last review date> -- src edge
   scripts .github/workflows`.
6. Append a dated entry to "Quarterly claims reviews" in that plan. Record
   the commit reviewed, new findings with their evidence level, claims whose
   status changed, and nightly failures.
7. Regenerate `docs/assurance.md` with
   `bun run ./scripts/verification-claims.ts render`, then run the check
   again.
8. Open the PR with the findings and claim changes.
