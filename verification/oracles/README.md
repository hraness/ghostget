# Independent oracles

`ghostget-oracle` is a dev-only Rust program that the `verification` job
compares with the shipped TypeScript. It is never packaged.

- `src/jcs.rs` is an RFC 8785 canonicalizer with its own strict I-JSON parser.
  It refuses duplicate member names, lone surrogates, and numbers outside the
  IEEE 754 double range, sorts members by UTF-16 code units, and writes numbers
  with the ECMAScript layout from Rust's correctly rounded digits.
- `src/url_policy.rs` parses a candidate with the `url` crate, reports its
  WHATWG components, and restates the web gateway URL policy from
  `publicUrl`'s documented rules over that parse.

The program reads one request per line on standard input and writes one answer
per line, so a test keeps one process open for a whole property run:

```sh
ghostget-oracle jcs      # JSON text in, "ok<TAB>canonical" or "error<TAB>reason" out
ghostget-oracle url      # a JSON string in, a JSON report out
ghostget-oracle version  # the oracle and url crate versions
```

`rust-toolchain.toml` pins Rust 1.97.1, `Cargo.toml` pins `url` at exactly
2.5.8, and `Cargo.lock` pins every other crate with its checksum. Record any
pin change in `RUST_ORACLE` in `scripts/verification-tools.ts` too.

Build and test it from the repository root:

```sh
bun run verify:oracles
```

That runs `scripts/verification-oracles.ts`, which checks the pins, builds
with `cargo build --release --locked`, and checks the golden vectors, and then
the differential tests in `scripts/verification-oracles.test.ts` and
`scripts/verification-vectors.test.ts`.
