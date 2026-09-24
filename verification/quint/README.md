# Quint models

Every model in this directory has an entry in `models.json`, and
`bun run verify:quint` checks each entry with the pinned Quint and Apalache
releases:

1. `quint typecheck` must pass.
2. Seeded `quint run` simulation must find no violation of each invariant.
3. Each mutant step must violate its invariant in the same simulation.
4. Apalache must find no violation of each invariant up to the bounded length.
5. Apalache must find a counterexample for each mutant. The run parses that
   counterexample strictly and keeps it as a CI artifact.
6. The model's replay test must pass.

A timeout, an interruption, or output the checker wrapper cannot parse fails
the run. A clean typecheck alone is never evidence.

`bun run ./scripts/verification-tools.ts quint-nightly` runs the same checks at
each model's `nightly` bounds and writes its logs to
`artifacts/verification/quint-nightly/`. The nightly workflow runs it; CI runs
only the CI bounds, so keep those inside the verification step's 16-minute
budget and put deeper bounds under `nightly`.

## `models.json`

`scripts/verification-tools.ts` parses the manifest strictly: an unknown field,
a missing field, or a value outside its bound fails `bun run verify`.

| Field | Meaning |
| --- | --- |
| `file` | The `.qnt` file in this directory. |
| `module`, `init`, `step` | The Quint module and the actions that start and advance it. |
| `invariants` | One to 32 invariant names. Simulation and Apalache check each one. |
| `simulation` | The decimal `seed`, `maxSamples` (1 to 100,000), and `maxSteps` (1 to 100) for `quint run`. |
| `apalache.length` | The bounded model-checking length, from 1 to 50. |
| `nightly` | Optional deeper bounds for the nightly workflow: `simulation.maxSamples`, `simulation.maxSteps`, and `apalache.length`. Each is at least its CI bound, and at least one is larger. The seed is the CI seed. Without this field the nightly run repeats the CI bounds. |
| `mutants` | One to 32 seeded defects or pre-fix variants. Each names a step other than `step` and an invariant from `invariants` that it must violate. |
| `replay.test` | The test file under `scripts/` or `src/` that replays this model's traces. |
| `replay.target` | `production` when the replay test drives production code, otherwise `reference`. |
| `replay.traces`, `replay.seed`, `replay.maxSteps` | The number of traces (1 to 10,000), their seed, and their length for `quint run --mbt`. |

## ITF trace replay

A model counts as conformance evidence only when its replay test drives
production code through the model's traces. Until then the model is design
evidence. `scripts/verification-lock-replay.test.ts` shows the pattern with a
reference lock:

1. Write the traces into a temporary directory with `quint run --mbt`. Build the
   arguments with `quintTraceArguments` so that the manifest's seed, trace
   count, and length apply. Traces never enter Git.
2. Parse each trace with `parseItfTrace` from `scripts/verification-itf.ts`.
   ITF (Informal Trace Format) is the JSON trace format that Apalache defines
   and Quint writes. The reader rejects unknown encodings, extra fields, and
   traces outside its bounds, so a misread trace fails the test.
3. Read the recorded step from each state. With `--mbt`, `mbt::actionTaken`
   names the action that produced the state (`init` for state 0), and
   `mbt::nondetPicks` holds each `nondet` value in Quint's `Option` encoding.
   Decode it with `itfOption`.
4. Check that the implementation starts in the model's initial state.
5. For each later state, map the recorded action to one implementation
   operation, apply it with the picked arguments, and compare the
   implementation's observable state with the model state. Stop at the first
   divergence and name the state index, the action, and both states.
6. Fail when a trace records an action the map does not know or a missing
   pick. Never skip a step.
7. Assert that the traces cover every action with every argument, so that a
   narrow seed cannot pass silently.
8. Replay the same traces through an implementation with a seeded defect. At
   least one trace must diverge.
9. Replay the traces of each mutant step. The implementation must refuse
   exactly the mutant traces that violate the invariant.

Set `replay.target` to `production` only when the replay test drives production
code, such as a reducer or a port. The register accepts an evidenced Quint claim
only when the claim cites such a model together with its replay test. The
`lock.qnt` smoke model has target `reference`: it proves that the toolchain and
the replay pattern work, and it states nothing about Ghostget code.

## Add a model

1. Write the model with its `init` and `step` actions, invariants, and at least
   one mutant step.
2. Add its entry to `models.json`.
3. Write its replay test. Start from `scripts/verification-lock-replay.test.ts`.
4. Add the replay test to the `bun test` command of the `verify:quint` script in
   `package.json`. A test fails `bun run verify` until every model's replay
   test runs there.
5. Cite the model and its replay test as evidence for the claims it supports in
   `verification/claims.json`, and keep each claim `planned` until its layer
   runs in CI.
6. Regenerate `docs/assurance.md` with
   `bun run ./scripts/verification-claims.ts render`, and run `bun run verify`.
