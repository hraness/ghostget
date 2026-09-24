# Contents

- `claims.json` – the claims register: one rule entry per `AGENTS.md` guideline, with its digest and the claims that quote it; the digest and reason of each synced managed block; and one row per claim with its layer, status, quotes, evidence, named property tests, assumptions, and not-verified scope. `bun run ./scripts/verification-claims.ts render` writes `docs/assurance.md` from it.
- `quint/` – Quint models, `models.json` with each model's invariants, seeds, bounds, mutants, and replay test, and the ITF trace replay pattern.
- `mutants.json` – named source mutants of the production reducers, each with the defect it introduces and the one test that must fail; `bun run ./scripts/verification-mutants.ts` runs them in the nightly workflow.
- `lean/` – the core-only Lake project, its pinned `lean-toolchain`, `proofs.json` with each required theorem's statement digest and each seeded defect, and the axiom audit.
- `vectors/`, `seeds/`, `oracles/` – reserved for golden vectors, the property seed corpus, and independent oracles.
- `tsconfig.json` – type checking for `../scripts/verification-*.ts`.

# Guidelines

- Keep this directory, the verification scripts, and the checker downloads out of the published package.
- Change a claim together with its evidence, and run `bun run verify`. Keep a claim `planned` with its plan phase until its layer runs in CI.
- Record every Quint model in `quint/models.json` with its invariants, seed, bounds, Apalache length, at least one mutant, and its replay test. Set the replay target to `production` only when the replay test drives production code; a `reference` target is toolchain evidence only.
- Give a Quint model `nightly` bounds only when they deepen its CI bounds and none falls below them. Keep `.github/workflows/verification-nightly.yml` read-only and outside `Required`, and triage its failures and review the register quarterly through `docs/claims-review.md`.
- List every reducer source mutant in `mutants.json` with its defect and the full name of the one test that must fail. A mutant counts as killed only when that test passes on unmodified source and is the only test that fails on the mutant.
- Keep the Lean project core-only. List every required theorem and allowed axiom in `lean/proofs.json`; the audit rejects `sorry`, `admit`, native evaluation, unlisted axioms, and other trust escapes.
- Keep generated traces, build output, and downloaded tools out of Git.
