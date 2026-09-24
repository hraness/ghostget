# Contents

- `claims.json` – the claims register: one rule entry per `AGENTS.md` guideline, with its digest and the claims that quote it; the digest and reason of each synced managed block; and one row per claim with its layer, status, quotes, evidence, named property tests, assumptions, and not-verified scope. `bun run ./scripts/verification-claims.ts render` writes `docs/assurance.md` from it.
- `quint/` – Quint models, `models.json` with each model's invariants, seeds, bounds, mutants, and replay test, and the ITF trace replay pattern.
- `lean/` – the core-only Lake project, its pinned `lean-toolchain`, `proofs.json` with each required theorem's statement digest and each seeded defect, and the axiom audit.
- `oracles/` – the dev-only Rust oracle: an RFC 8785 canonicalizer and a `url`-crate reading of the web gateway URL policy, pinned by `rust-toolchain.toml` and `Cargo.lock`. `scripts/verification-oracles.test.ts` compares it with the TypeScript.
- `vectors/` – golden vectors from the standard-library Python generator `generate.py`. `scripts/verification-vectors.test.ts` compares the TypeScript with them.
- `seeds/` – reserved for the property seed corpus.
- `tsconfig.json` – type checking for `../scripts/verification-*.ts`.

# Guidelines

- Keep this directory, the verification scripts, and the checker downloads out of the published package.
- Change a claim together with its evidence, and run `bun run verify`. Keep a claim `planned` with its plan phase until its layer runs in CI.
- Record every Quint model in `quint/models.json` with its invariants, seed, bounds, Apalache length, at least one mutant, and its replay test. Set the replay target to `production` only when the replay test drives production code; a `reference` target is toolchain evidence only.
- Keep the Lean project core-only. List every required theorem and allowed axiom in `lean/proofs.json`; the audit rejects `sorry`, `admit`, native evaluation, unlisted axioms, and other trust escapes.
- Keep generated traces, build output, and downloaded tools out of Git.
