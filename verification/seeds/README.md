# Property seed corpus

Reserved for plan Phase 2. The checked-in corpus will hold fast-check seeds and
shrink paths that found a failure or that a nightly soak should keep replaying.

Replay one entry with `GHOSTGET_PROPERTY_SEED`, `GHOSTGET_PROPERTY_PATH`, and an
anchored `--test-name-pattern`. Promote every minimized failure to a named
example test beside the property it came from; a seed in this corpus does not
replace that regression test.
