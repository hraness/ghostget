# Golden vectors

Reserved for plan Phase 7. Independent generators, such as a Python reference
for hashes and encodings, commit their golden vectors here. A differential test
in `Required` reads each vector file and compares the shipped TypeScript output
byte for byte.

Each vector file will record its generator, the generator's pinned version, and
the command that regenerates it. Keep vectors free of private content, tokens,
and local paths.
