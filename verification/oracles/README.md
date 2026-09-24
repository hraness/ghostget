# Independent oracles

Reserved for plan Phase 7. Dev-only reference implementations, such as an
RFC 8785 canonicalizer and a URL differential, live here and run in the
`verification` job. They are never packaged.

Pin each oracle's toolchain and dependencies exactly, and record the pins in
`scripts/verification-tools.ts` beside the Quint, Apalache, JDK, elan, and Lean
pins.
