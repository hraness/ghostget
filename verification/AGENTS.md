# Contents

- `claims.json` – the claims register: one rule entry per `AGENTS.md` guideline, with its digest and claims, and one row per claim with its layer, status, evidence, assumptions, and not-verified scope. `bun run ./scripts/verification-claims.ts render` writes `docs/assurance.md` from it.
- `quint/` – Quint models, `models.json` with each model's invariants, seeds, bounds, mutants, and replay test, and the ITF trace replay pattern.
- `lean/` – the core-only Lake project, its pinned `lean-toolchain`, `proofs.json`, and the axiom audit.
- `vectors/`, `seeds/`, `oracles/` – reserved for golden vectors, the property seed corpus, and independent oracles.
- `tsconfig.json` – type checking for `../scripts/verification-*.ts`.

# Guidelines

- Keep this directory, the verification scripts, and the checker downloads out of the published package.
- Change a claim together with its evidence, and run `bun run verify`. Keep a claim `planned` with its plan phase until its layer runs in CI.
- Record every Quint model in `quint/models.json` with its invariants, seed, bounds, Apalache length, at least one mutant, and its replay test. Set the replay target to `production` only when the replay test drives production code; a `reference` target is toolchain evidence only.
- Keep the Lean project core-only. List every required theorem and allowed axiom in `lean/proofs.json`; the audit rejects `sorry`, `admit`, native evaluation, unlisted axioms, and other trust escapes.
- Keep generated traces, build output, and downloaded tools out of Git.
