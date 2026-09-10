# Contributing to Ghostget

Issues and focused pull requests are welcome. Open an issue before changing a
durable wire format, trust boundary, confirmation rule, or compatibility
contract so the required migration and evidence can be agreed first.

Use Bun 1.3.14. Complete `Required` PR CI is the normal final source integration
gate for executable and documentation changes. Run relevant focused local checks
and obtain independent impact and diff review before delivery. CI runs the
complete Linux aggregate as parallel jobs plus a selected macOS suite;
`Required` waits for that full union. Its executable phase-composition and
disjoint source coverage contracts in `scripts/ci-pr-gate.test.ts` remain required.

```sh
bun install --frozen-lockfile
bun test scripts/ci-pr-gate.test.ts
```

Record the repository, reviewed workflow, successful run and attempt, complete
required job union, actual checked commit and tree, PR head, and current base.
Revalidate those coordinates immediately before conditional merge. Head or base
movement requires matching current-candidate CI; an older candidate's receipt
does not qualify a new integration.

The macOS suite in `scripts/ci-macos-check.ts` is a selected inventory, currently
ten files and one patterned iMessage canary. It does not establish complete
macOS source, package, or installation equivalence. For impacted native behavior
outside that suite, run relevant focused macOS checks or add and pass an
independently reviewed CI extension. Hosted runners do not qualify the user's
Keychain, signed-in browser, profiles, devices, installation, or production
state. Keep every explicit local, native, coupled-sequence, live, installation,
package-release, provider-control, and production acceptance check, including
opt-in qualifications when required.

Keep `bun run check` available as the complete local aggregate and use it when
coverage or equivalence is uncertain, a coupled sequence must run together, or
a known failure needs the complete local reproduction. Diagnose observed
failures and retain their
relevant reproduction and repair checks. Independently review workflow,
discovery, command, deadline, and platform changes against the prior required
coverage; edited coverage assertions alone cannot certify a weakened workflow.

For parallel chats or other concurrent local work, follow the
[isolated worktree workflow](docs/local-development.md). It keeps changing
source and development state separate from the stable Ghostget installation.

Provider changes must keep semantic operations separate from transport
mechanics. Add deterministic tests for strict parsing, account and target
binding, request construction, response projection, drift, cancellation,
redaction, and recovery. A new mutation also needs preview-digest,
at-most-once, indeterminate-result, and reconciliation evidence. Keep an
operation `capture-required` until the exact current contract is proved.

For a stateful boundary, drive the production reducer or port with a bounded
action and fault schedule. Name the safety properties that must hold after
every step and any conditional progress law, including the evidence or healthy
boundary behavior supplied by the harness.
Fast-check reports a seed and shrink path for failures. Replay the exact
coordinate and only the named property before changing code:

```sh
GHOSTGET_PROPERTY_SEED=-17 \
GHOSTGET_PROPERTY_PATH=3:0 \
bun test src/linked-device-lifecycle-journal.property.test.ts \
  --test-name-pattern '^bounded action and fault workloads terminalize with supplied evidence$'
```

This checked smoke coordinate is valid for the named property. Replace both
values with the seed and path emitted by the failure you are investigating.
Keep the seed and minimized trace free of credentials and provider data, then
turn the smallest useful counterexample into a named deterministic regression.
These workloads verify local models and injected ports. They do not establish
live provider, browser, operating-system, or device behavior.

Media changes must preserve the one-item, finite, non-DRM source boundary and
must never add an access-control bypass. Keep acquisition output staged until
the complete artifact contract, manifest, and SHA-256 records verify. Add
deterministic coverage for parsing, direct and provider acquisition,
derivation, transcripts, revision history, locking, cancellation, and
full-item verification.

Portable-plugin changes must preserve static validation before code execution,
content-addressed packages, explicit code trust, denied-by-default host
capabilities, exact-origin HTTPS, opaque credential sinks, bounded files and
state, serialized lifecycle transitions, and immutable run identity. Include a
secret-free fixture for each executable operation.

Built-in source plugins retain a separate exact source/dependency closure
check. Ghostget derives that identity from the current tree, snapshots it at
registry startup, and revalidates it immediately before and after lazy runtime
load. There is no manual closure allowlist or hash-approval step: durable
contract identity remains the reviewed semantic boundary, while automatic
closure revalidation catches ordinary source or dependency drift. Released and
development commands must never ask an operator or maintainer to approve source
hashes.

Do not include cookies, tokens, authenticated HAR values, browser profiles,
private messages, local state, real account identifiers, or unredacted provider
responses in fixtures, issues, logs, or pull requests. Networked acceptance
tests must be explicit and must not require contributor credentials.
