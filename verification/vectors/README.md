# Golden vectors

`generate.py` is an independent reference for Ghostget's canonical JSON,
hashes, and encodings. It uses only the CPython 3.11 or later standard library
and restates each encoding from its specification or its documented byte
layout, never from the TypeScript. It writes:

- `jcs.json`: RFC 8785 canonical forms with their SHA-256 and script-literal
  escaping, ECMAScript number text for IEEE 754 bit patterns including the RFC
  8785 appendix B samples, and inputs outside I-JSON.
- `hashes.json`: the length-framed SHA-256 identities for media provider and
  authorization-context keys, native runtime closures, and retained revision
  content, plus UTF-8 byte ordering.

Each file records its generator path, version, runtime, and command. The
output is deterministic: the random corpus has a fixed seed, and nothing
depends on the platform, locale, hash seed, or clock.

```sh
python3 verification/vectors/generate.py          # rewrite the vector files
python3 verification/vectors/generate.py --check  # fail if a file is stale
```

`scripts/verification-vectors.test.ts` compares the shipped TypeScript with
every vector byte for byte, and `scripts/verification-oracles.test.ts` runs the
canonical JSON vectors through the Rust oracle too. Keep vectors free of
private content, tokens, and local paths.
