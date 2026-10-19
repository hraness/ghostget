---
type: plan
area: contracts
status: completed
repository_scopes:
  - ghostget
  - peopleblade
---

# Usage-driven contract repair handoffs

## Outcome

Ordinary usage surfaces repair demand without changing execution authority.
Failed invocations leave bounded, private, deduplicated leads; a consumer or
agent turns a lead into a reviewed patch through the repositories' normal
gates. Nothing recaptures, retries, activates, publishes, or opens a pull
request by itself.

## Context and rejected scope

The motivating idea was automatic self-healing: detect drift, recapture the
exchange, and ship a new contract. Review rejected that scope. A
`contract-drift` category is also the fallback for unclassified failures, so
it is a lead rather than proof that a provider changed. A read-only label does
not authorize browser interaction, and a captured exchange still needs
implementation, regression, security, and release review before it means
anything. `derive finish` output is inert evidence, not a deployed contract.

ALGAL's durable repair host was evaluated as the substrate. Its receipts and
pause/resume are real, but the initial demand store is a small bounded cache
with no worker, model, or external write, so ALGAL stays an optional external
host that can consume a handoff later rather than a Ghostget dependency.

## Design

`ghostget.contract-repair-signal.v1` binds reason (`capture-required` |
`contract-drift`), adapter id/version/manifest hash, operation, transport,
authority, risk, read-only flag, and contract state/version/hash. The signal
id is the SHA-256 of the canonical identity, so delivery is idempotent and a
signal cannot be forged after the fact.

`src/contract-repair-inbox.ts` is a private derived cache: 128 distinct
signals, 2 KiB each, 256 KiB total, 30-day expiry hidden on read and compacted
on the next admitted write. It uses private conditional storage, refuses
symlinked or malformed state without replacing it, and records nothing on
read, cache-only, identity-only, replay, preserved-artifact, or cancellation
paths. `GHOSTGET_REPAIR_SIGNALS=off` disables collection and inspection
without deleting entries.

`ghostget.contract-repair.v1` is the handoff: the signal, the currently
installed binding, a status (`capture-required`, `investigate`,
`update-candidate`, `blocked`, `unavailable`), bounded next-step names, and
`authority` fixed to all-false. Parsing recomputes the assessment, so a
handoff cannot lie about its status. A different observed contract produces
`update-candidate`, never a healed claim; risk, transport, authority, or
version regressions produce `blocked`.

`ghostget contracts repair [--id <sha256>]` inspects the inbox; `--plan
<file|->` previews demand for a collection plan and `--record` retains only
the signals, never the plan's private fields.

## Verification

- `src/contract-repair-inbox.test.ts`: read-only inspection, dedup without
  rewrite, malformed/symlinked storage preserved, convergence under delivery
  permutations, capacity and expiry bounds.
- `src/contracts-repair.test.ts`: missing coverage versus suspected drift,
  privacy of signals, update-candidate gating, forged-identity and
  authority-escalation rejection.
- `src/contract-repair-cli.test.ts`: real invocation and SDK preview record
  one lead; unrelated failure categories and failure JSON stay unchanged;
  `--record` requirement; opt-out preserves the original refusal.
- `src/contracts-repair-lifecycle.test.ts`: a synthetic changed R1 projection
  passes identity and negative fixtures before a consumer-update suggestion.
- Package budget re-measured for the two new packed sources (591 entries).
- Verification surfaced a pre-existing parser bug on `main`: own `__proto__`
  keys inside arbitrary JSON and record payloads were silently dropped by
  `result[key] = …` construction in `src/contracts-shape.ts`. Fixed via
  `Object.defineProperty` at all three construction sites with a regression
  test; the failing fast-check seed now passes.
- The full local unit aggregate ran 4,466 passing tests across 342 files.
  Eight recorded failures were triaged: three were the repair branch's own
  real pins (frozen SDK surface, both fixed); one was the parser bug above;
  the remaining four were machine-load artifacts proven by isolation or a
  clean-`main` control (property time budgets, a 150 ms spawn race, and the
  provisioned fixture-browser daemon teardown). `check:package` (rebuild +
  tarball install smoke) and the npm-release contract suite pass on the final
  tree; the heavyweight omni and standalone suites fail identically on
  unmodified `main` under the same load, so CI remains the authoritative
  environment for them.

## Risks and recovery

The inbox is derived and rebuildable; deleting it loses only diagnostic leads.
A disabled or full inbox never changes the original invocation outcome. The
consumer workflow (PeopleBlade) keeps exact receipt binding and proposes its
own update PR only after upstream gates pass.

## Result

Shipped in PR #323 (squash `1006964` on `main`, 2026-09-22): bounded private
repair-signal inbox, typed capture-required boundary errors, drift-lead
collection for no-dispatch failed R1 results, `ghostget contracts repair`,
the `ghostget.contract-repair.v1` handoff schema, SDK exports, docs, and the
`__proto__` payload-construction fix. PeopleBlade's matching repair guidance
shipped independently in its PR #185 (`a443ec5`). The synthetic lifecycle
spike qualified exactly one candidate — the one passing identity plus
negative fixtures — which is the intended promotion boundary.

## Durable memory

Two conclusions generalize beyond this change. First, a classifier fallback
is a lead, not evidence: `contract-drift` also absorbs unclassified failures,
so demand collection, diagnosis, repair, and activation must stay separate
stages with explicit authority at each boundary. Second, result construction
by ordinary assignment is unsafe for arbitrary keys — `result[key] = …`
silently drops an own `__proto__`; `Object.defineProperty` is the correct
primitive for parsed object construction (see `src/contracts-shape.ts`
`setJsonField`). No new maintained note was created; both facts live in the
shipped code, tests, and this plan's history.
