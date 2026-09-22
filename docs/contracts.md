# Machine-checkable contracts

`ghostget contracts` and the `@hraness/ghostget/contracts` SDK subpath give a
consumer a typed, schema-backed view of what this installation can run, and a
way to check a read-only collection plan against it before any provider is
contacted. Five documents make up the surface:

| Document | Produced by | Parsed by |
|---|---|---|
| `ghostget.contract-catalog.v1` | `ghostget contracts catalog --json` | `parseContractCatalog` |
| `ghostget.collection-plan.v1` | the consumer | `parseCollectionPlan` |
| `ghostget.contract-check.v1` | `ghostget contracts check --plan <file> --json` or `checkCollectionPlan` | `parseContractCheck` |
| R1 invoke result envelope | `ghostget invoke <adapter> <operation> --json` | `parseInvokeReadResult` |
| `ghostget.contract-repair.v1` | Each handoff in `ghostget contracts repair --json` | `parseContractRepairHandoff` |

`ghostget contracts schema <catalog|check|plan|invoke-read|repair> --json` prints the
JSON Schema (draft 2020-12) for each document. The schema is generated from the
same shape table the parser uses, so the two cannot drift. Rules a schema cannot
express are listed under [Semantic rules](#semantic-rules).

Catalog, check, schema, and repair inspection are read-only projections. They
never bind an account or contact a provider. `repair --plan ... --record` also
writes bounded local diagnostic metadata. The catalog, check, and repair
commands are not available while a state home is in gateway-only mode.

## The consumer loop

1. Run `ghostget contracts catalog --json` and parse the document with
   `parseContractCatalog`. Pin the vocabulary and the `contractHash` of every
   operation the consumer relies on.
2. Run `ghostget contracts check --plan <file> --json` for the collection plan
   (or call `checkCollectionPlan(plan, catalog)`). Stop when `ok` is false and
   report the gap reasons; each read carries exactly one.
3. Invoke each read with `ghostget invoke <adapter> <operation> --input - --json`
   (omit `--auth` for a `public` authority) and parse stdout with
   `parseInvokeReadResult`.
4. On `status: "failed"`, act only on `readFailure.retryDisposition`:
   `retry-once-after-60s` allows one retry after 60 seconds,
   `repair-auth` means the locator must be repaired before any retry, and
   `do-not-retry` ends the read. `readFailureDispositions` exports the same
   closed table.

## Repair handoffs

Failed invocation attempts, including SDK execution previews, cache a lead when
an installed operation is `capture-required`. Failed live R1 invocations cache
suspected drift when their typed failure category is `contract-drift`. Other
categories retain their own recovery instructions. Cache-only and identity-only
inspection, cancellation, replayed results, and preserved-artifact failures do
not collect leads. The invocation result envelope and retry policy are unchanged.

`contract-drift` can also represent an unclassified failure. A lead is a reason
to investigate, not proof that a provider changed. `observed` means the installed
contract was reviewed; it does not prove current provider availability or that a
particular account can use it.

```sh
ghostget contracts repair --json
ghostget contracts repair --id <signal-sha256> --json
ghostget contracts repair --plan <file|-> --json
ghostget contracts repair --plan <file|-> --record --json
```

A plan preview collects only requested, installed, input-valid R1 reservations.
Unknown adapters, missing operations, and other plan errors remain the job of
`contracts check`; an empty repair report does not certify the plan. `--record`
retains those leads locally without retaining the plan. Each report has `status`,
`capacityReached`, `recording`, and `repairs`; each repair contains `recordedAt`
and a `handoff`. Exit 3 means unavailable storage, a missing requested signal,
or an unsuccessful explicit recording. A disabled inbox reports `disabled`.

The inbox is a private derived cache: at most 128 distinct identities, 2 KiB per
signal, and 256 KiB total. An identity binds reason, adapter version and manifest
hash, operation, transport, authority kind, risk, state, and contract version and
hash. It contains no account ID, subject, input or input hash, provider output,
URL, credential, raw diagnostic, or HAR. Duplicate delivery does not rewrite the
entry or count as additional evidence. Entries expire after 30 days; inspection
hides expired entries and the next admitted write compacts them. Full storage
retains existing leads and refuses new ones. It is not a complete audit log.

Set `GHOSTGET_REPAIR_SIGNALS=off` to disable collection and inbox inspection.
No existing entries are deleted. Malformed, unsafe, or contended storage never
changes the original operation outcome. Writes use private conditional storage;
inspection never repairs or replaces the cache.

| Handoff status | Next step |
|---|---|
| `capture-required` | Reproduce the gap and obtain the missing authorized evidence or implementation. A browser capture may be insufficient. |
| `investigate` | Reproduce a suspected failure against the exact recorded identity. |
| `update-candidate` | A different observed contract is installed. Verify it, then suggest a consumer update PR if its pins or parser need changing. This is not a successful live qualification. |
| `blocked` | Review the authority or risk boundary, disabled transport, or version regression. Do not widen permissions or replace pins automatically. |
| `unavailable` | Inspect the installed catalog; the recorded operation is missing or invalid. |

Every handoff fixes `authority.recapture`, `retry`, `activate`, and `publish` to
`false`. It contains bounded next-step names rather than provider-supplied
instructions. A content hash binds the diagnostic bytes; it is not authentication
or provider attestation. Treat local or supplied catalogs and handoffs as evidence
for review, never as permission to run code.

The calling agent owns a repair attempt. First create a failing synthetic fixture
for the intended semantics. Review the minimum authorized first-party evidence,
including subject, target, paging, completeness, acknowledgement behavior, and
negative cases. A read label or HTTP method alone does not authorize browser
interaction. Encrypted or unimplemented surfaces may need new runtime support.
Keep real traffic private; a secret scan alone does not make a fixture safe to
publish. Propose the smallest provider patch and run its regression and repository
gates. A consumer update must independently review an immutable released artifact,
route pins, parser behavior, and consumer tests before enabling anything.

Ghostget starts no model, browser capture, repair worker, pull request, or retry.
An external workflow host may retain the handoff across pauses and validate a
patch against a host-selected checkout and test commands. Its receipts do not
replace provider evidence or the repository's merge and release gates.

## `ghostget contracts catalog [--adapter <id>]... [--json]`

Prints `ghostget.contract-catalog.v1`. Without `--adapter`, every installed
adapter appears in ascending ID order; with one or more `--adapter` flags only
those adapters appear. The command exits 0 when `ok` is true and 3 when the
filter matched no installed adapter (`ok: false`, `adapters: []`). A filter that
matches some IDs lists the installed ones and exits 0.

```jsonc
{
  "ok": true,
  "contract": "ghostget.contract-catalog.v1",
  "ghostget": { "version": "0.18.24" },
  "generatedAt": "2026-09-21T20:00:00.000Z",
  "vocabulary": {
    "risks": ["R1", "R2", "R3", "R4"],
    "states": ["observed", "capture-required"],
    "transports": ["web-session-api", "provider-api", "local-cli", "reviewed-template-api"],
    "authorities": ["public", "auth"],
    "readFailure": { "target-unavailable": "do-not-retry", "…": "…" },
    "invokeStatuses": ["succeeded", "failed"]
  },
  "adapters": [
    {
      "id": "bluesky-web", "version": "1.7.0", "surfaceId": "bluesky",
      "manifestHash": "<sha256>", "origins": ["https://bsky.app"],
      "operations": [
        {
          "id": "profiles.read", "transport": "web-session-api", "authority": "public",
          "risk": "R1", "sideEffect": "none", "idempotency": "none", "dedupeWindowMs": 0,
          "state": "observed", "contractVersion": 2, "contractHash": "<sha256>",
          "input": { "properties": { "handle": { "type": "string", "description": "…", "minLength": 3, "maxLength": 253 } }, "required": ["handle"] }
        }
      ]
    },
    { "id": "broken-web", "invalid": true, "issues": ["manifest.schemaVersion must be 4"] }
  ]
}
```

Field derivation:

- `authority` is decided by the same code-owned policy the invoke path uses
  (`resolvedWebSessionOperationAuthenticationPolicy`). A web-session operation
  is `public` only when its active descriptor declares `access: "public"` and
  is an observed, dispatch-free, built-in R1 read; every other operation and
  every other transport is `auth` and requires `--auth <id>`. Manifests cannot
  opt into public execution.
- `contractHash` is the existing durable hash for the operation's transport:
  the web-session, provider, or local-CLI contract hash, or the SHA-256 of the
  canonical reviewed-template recipe. `transport` says which.
- `state` is the installed contract state. A reviewed template reports
  `capture-required` until its template is reviewed.
- `invokeStatuses` are the statuses the R1 read program can emit; every other
  execution status is coerced to `failed` before the envelope is printed.
- Operations are sorted by ID. `input` is the reviewed manifest schema verbatim;
  its `description` fields are the only prose in the document.

## `ghostget contracts check --plan <file|-> [--auth-state] [--json]`

Reads one `ghostget.collection-plan.v1` document from a file (or stdin with
`--plan -`, at most 1 MiB), projects the installed catalog, and prints
`ghostget.contract-check.v1`. The command exits 0 when every read is `ok` and 4
when any read has a gap; the full document is printed either way. A plan that
does not parse is an error (exit 3) and no catalog is read.

```jsonc
{
  "ok": false,
  "contract": "ghostget.contract-check.v1",
  "ghostget": { "version": "0.18.24" },
  "plan": { "collectionKey": "hraness-social-profile-statistics", "reads": 15 },
  "reads": [
    { "index": 0, "accountKey": "x-hraness", "adapter": "x-web", "operation": "profiles.read",
      "verdict": "ok",
      "binding": { "adapterVersion": "1.14.0", "contractVersion": 1, "contractHash": "<sha256>", "transport": "web-session-api", "authority": "auth" } },
    { "index": 2, "accountKey": "linkedin-personal", "adapter": "linkedin-web", "operation": "profiles.read",
      "verdict": "gap",
      "gap": { "reason": "state-mismatch", "detail": "installed state is capture-required; plan requires observed" } }
  ]
}
```

Each read reports at most one gap, chosen in this order:

| Reason | Meaning |
|---|---|
| `adapter-missing` | No installed adapter has the plan's `adapter` ID. |
| `adapter-invalid` | The installed manifest no longer parses; `detail` lists up to three issues. |
| `operation-missing` | The adapter does not own the plan's `operation`. |
| `transport-disabled` | The installed transport is `reviewed-template-api`, which cannot be invoked. |
| `state-mismatch` | Installed `state` differs from `semantics.state`. |
| `risk-mismatch` | Installed `risk` differs from `semantics.risk`. |
| `side-effect-mismatch` | Installed `sideEffect` differs from `semantics.sideEffect`. |
| `authority-mismatch` | Installed `authority` differs from `authority.kind`. |
| `input-invalid` | `validateOperationInput` rejected the plan input against the operation schema and adapter origins; `detail` carries the issue list. |
| `auth-missing` | Only with `--auth-state` (or `storedAuthIds`): the plan names an auth locator ID that is not stored. The ID itself is not printed. |

`--auth-state` lists locally stored auth locator IDs. It does not open a
browser, read cookies, or prove that a locator still works.

## `ghostget.collection-plan.v1`

The [Hraness social-profile manifest](../skills/ghostget/references/hraness-social-profile-stats.json)
is a complete instance. Bounds: at most 64 accounts, 8 reads per account, 128
reads in total, 16 unique metric keys per read, and a delay of at most
600 000 ms. `semantics.risk` must be `R1` and `semantics.sideEffect` must be
`none`; v1 plans are read-only by construction. `authority` is either
`{ "kind": "public" }` or `{ "kind": "auth", "authId": "<locator>" }`; the
locator is a local Ghostget ID, never a credential. `input` holds at most 32
keys of bounded JSON (depth 8). `expectedOutput.targetUrl` is a canonical,
credential-free HTTPS URL without query or fragment.

## R1 invoke result envelope

`parseInvokeReadResult` accepts exactly what `ghostget invoke … --json` prints
for an R1 operation: top-level `ok`, `status`, `runId`, `replayed`, `receipt`,
`output`, `source: "live"`, and `cache`, plus `readFailure` on failure. The
receipt is the durable run receipt (`schemaVersion` 2 through 7, one contract
hash field per transport, zero dispatch). `output` stays `unknown` but is
bounded to depth 64 and 4 000 000 JSON nodes. Preview, cache-only, and
projection-identity envelopes are different documents and are rejected.
Nothing about `invoke` changed; the schema documents what exists.

## Semantic rules

The parsers enforce these rules in addition to the schema:

- Catalog: adapter IDs are unique and ascending; operation IDs are unique per
  adapter; `input.required` names declared fields; `ok: false` lists no
  adapters; the vocabulary equals this version's closed sets verbatim.
- Plan: account keys are unique; at most 128 reads in total; every expected gap
  names one distinct metric key of its read; target URLs are canonical.
- Check: `reads` has exactly `plan.reads` entries with indexes `0..n-1`; `ok`
  is true exactly when every verdict is `ok`.
- Invoke result: `receipt.status` and `receipt.runId` equal the top-level
  fields; the cache outcome is consistent with the receipt status (`stored`,
  `error`, or `skipped` after success; `retained`, `miss`, `error`, or
  `skipped` after failure); a failed result has `output: null` and a
  `readFailure` whose disposition matches its category.
- Everywhere: objects carry exactly the declared keys, strings are NUL-free,
  well-formed Unicode within their length bound, and foreign JSON keys are at
  most 1024 characters.

## SDK

```ts
import {
  checkCollectionPlan,
  contractSchema,
  parseCollectionPlan,
  parseContractCatalog,
  parseInvokeReadResult,
  readFailureDispositions,
} from "@hraness/ghostget/contracts"

const catalog = parseContractCatalog(JSON.parse(catalogStdout))
const plan = parseCollectionPlan(JSON.parse(planText))
const check = checkCollectionPlan(plan, catalog, { storedAuthIds })
if (!check.ok) throw new Error("plan has gaps")

const result = parseInvokeReadResult(JSON.parse(invokeStdout))
if (result.status === "failed") {
  act(readFailureDispositions[result.readFailure.category])
}
```

Importing the subpath is side-effect free: it never starts the CLI, inspects
local state, loads a provider runtime, or accesses the network. Every parser
throws `ContractParseError` with the offending path; a consumer never needs to
inspect a partially parsed document.
