# Property seed corpus

`corpus.json` maps a property name to the test file that runs it and the
fast-check coordinates recorded for it. Schema `ghostget-property-seeds-v1`:

```json
{
  "schema": "ghostget-property-seeds-v1",
  "properties": {
    "area/property-name": {
      "file": "src/area.test.ts",
      "entries": [
        {
          "kind": "counterexample",
          "seed": 455347073,
          "path": "3:1:86:86",
          "origin": "Where and how the failure was found.",
          "regression": "the exact title of the named example test that pins it"
        }
      ]
    }
  }
}
```

- `kind` is `counterexample` for a coordinate that once failed, or `workload`
  for a seed worth replaying for another reason, such as one that hit a time
  limit. Only a counterexample names a `regression`, and that test must be
  registered in `file`.
- `path` is optional; with it, fast-check replays the recorded shrink first.
- Names are sorted, lowercase, and use `-`, `/`, or `.` as separators.

A test opts in by passing the name as the third argument:
`assertProperty(property, overrides, "area/property-name")`. The helper replays
each recorded coordinate, labelling a failure with the corpus entry, and then
runs the ordinary random workload. An environment replay coordinate skips the
corpus. `src/test-harness-policy.test.ts` fails when a name has no entry, when
an entry's property is not run exactly once in its file, or when a
counterexample's regression test is missing.

To record a failure, copy the seed and path from fast-check's report, add the
entry, name the property at its call site, and promote the minimized input to
the named example test. The corpus entry does not replace that test.

A fast-check upgrade can move a coordinate. Pin what a counterexample
coordinate generates with `fc.sample` beside its regression, as
`src/contracts-invoke-read.test.ts` does, so a moved coordinate fails loudly.
