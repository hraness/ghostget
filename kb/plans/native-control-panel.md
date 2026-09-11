---
type: plan
area: native-control
status: in-progress
---

# Ghostget native control panel and user interfaces

## Outcome

Ship a macOS application for the human who delegates work to Ghostget. It manages
account connections, shows the actual installed capabilities, edits operation
permissions, handles human approval requests, distinguishes user-authored
interfaces, and supplies copyable agent installation and usage prompts. Keep
the CLI and TypeScript SDK as the primary execution interfaces.

The owner requested planning, adversarial review and iteration, implementation,
and unreasonably robust programming on 2026-09-11. The first vault is 1Password.
macOS is the initial qualified platform; the application structure remains
portable. This request supersedes the old repository prohibition on application
UI and native apps, but does not authorize a bundled agent or model.

## Existing evidence

Baseline: protected main `2f3824e`, Ghostget 0.17.6. The current kernel already
owns source and portable plugins, bounded semantic contracts, exact auth realms,
private state, DNS-pinned HTTPS, encrypted plans, dispatch journals, at-most-once
mutation evidence, and reconciliation. Reuse these contracts.

`src/model.ts` validates adapter operations against installed executable
descriptors. User adapter manifests select exact reviewed recipes; they cannot
change risk, input contracts, side effects, or transport. `src/storage.ts`
already provides conditional private writes and manifest installation.

`SECURITY.md` accurately states that trusted source/portable code and arbitrary
same-user shell access are outside hostile-code isolation. The existing CLI
confirmation digest does not prove that a human approved it.

## Architecture decision

| Option | Benefit | Cost and evidence | Decision |
| --- | --- | --- | --- |
| Tauri 2, narrow Rust host, bundled TypeScript UI, existing Bun core | Explicit IPC permissions, CSP, OS WebView, established packaging; retain provider safety contracts | Rust and TypeScript toolchains; packaged app must prove its helper lifecycle | Selected |
| Dioxus Desktop | Rust UI and host | Stable desktop also uses an OS WebView; browser-free renderer is experimental; no demonstrated Ghostget performance advantage | Reconsider if Rust UI becomes a product requirement |
| Vercel Native SDK | Native rendering, TypeScript AOT, Zig support | Pre-1.0 API movement and additional renderer/toolchain ownership | Reconsider after stable APIs and a measured need |
| Rewrite the whole runtime in Rust | Potentially smaller memory-safe native trusted core | Reimplementing proven contracts, provider logic and recovery introduces migration risk; Rust does not solve authorization or same-user access | Do not rewrite |

Sources checked 2026-09-11: [Tauri process model](https://tauri.app/concept/process-model/),
[capabilities](https://v2.tauri.app/security/capabilities/),
[CSP](https://v2.tauri.app/security/csp/),
[Dioxus desktop](https://dioxuslabs.com/learn/0.7/guides/platforms/desktop/),
[Dioxus renderers](https://dioxuslabs.com/learn/0.7/beyond/project_structure/),
[Vercel Native](https://github.com/vercel-labs/native).
Performance is a qualification result, not an inferred framework property.

### One execution kernel, two local channels

The desktop host starts one exact packaged Bun helper. Package the pinned Bun
runtime and admitted Ghostget source/dependency tree as resources. Do not resolve
Bun from PATH or assume a compiled monolith preserves source-closure identities.
Start in the packaged root with only supported runtime flags. App control requests use
inherited private stdio; agent authorization requests use a bounded owner-only
Unix socket. Neither channel accepts arbitrary shell, fetch, filesystem, or
secret-read requests. Agent IPC cannot change policy, connect vaults, or approve
requests. The helper owns the pending approval queue. Ordinary agent execution
continues in the existing kernel; the helper is not a second provider engine.

Closing the app cancels pending human approvals and closes its helper and socket.
Explicit allow/deny policies remain evaluable without the app. Human-required
operations fail closed with actionable instructions while the app is closed.
No login item, background service manager, or competing daemon is installed.

Qualify Apple Silicon macOS first. Require a protocol/version handshake, one
helper owner per selected state home, 256 KiB agent request frames and 4 MiB private control
frames (including escaped 512 KiB interface documents), 128 pending approvals, 16 agent clients, and a two-minute human request
deadline. Reject partial/oversized frames. EOF cancels children and clients before
bounded shutdown. Use a short socket path with verified owner-only parent and
exact inode ownership; never unlink a socket merely because it exists. Reject a
second live instance. Unknown versions fail closed without state changes.

Tauri exposes a fixed set of typed commands. Declare them using
`AppManifest::commands`, then grant only the required commands to the local main
window. Bundle assets, prohibit remote IPC origins, configure restrictive CSP,
disable privileged navigation and production developer tools. Render foreign
strings as text. Clipboard accepts only generated non-secret instruction text.

### Operation permissions and human approvals

Resolve policy coordinates from the installed registry, not user-supplied
labels: plugin ID, transport, surface, operation name and contract version, plus
the exact account incarnation (`readProjectionAuthIdentityHash`) or a distinct
public authority coordinate. There are no wildcard account grants in v1.
Policies use `allow`, `deny`, or `ask`. Existing installations remain explicitly
unmanaged until the human enables management. Enabling management is a reviewable
app action; unknown operations default to deny. Never silently authorize newly
installed or changed capabilities. Grants bind the active adapter manifest digest
and durable executable contract identity, so activation structurally invalidates
old grants even if the app crashes before cleanup. An allow cannot bypass existing mutation
preview, explicit confirmation, exact account proof, or dispatch journals.

Persist strict versioned policy with conditional writes and monotonically
increasing revisions. Malformed, stale, duplicate or oversized policy fails
closed. A durable managed marker distinguishes a never-managed installation from
a missing policy after opt-in. Any present policy is managed; errors never fall
back to unmanaged. Management applies to one state home. Recheck deny during preparation and authorization at actual execution or
cached disclosure. Key grants to executable contract identity as well as the
coordinate so changing implementation cannot inherit a prior allow.
Also bind `registry.implementationClosureHash(binding)` and exact portable bundle
identity. The stable durable identity alone does not detect implementation changes.
Keep hashes internal; the human reviews concrete changed operations.

Human requests contain an immutable canonical envelope: exact operation and
implementation identity, adapter hash, auth realm/incarnation, canonical input
and attachment hashes, existing plan digest where present, policy revision,
random request nonce, and application generation. Show the requested effect,
account alias, operation, and bounded meaningful input in the app. Recompute the
preview from validated input and installed descriptors in the helper; never trust
caller-authored effect summaries. Bind its digest to execution. Never truncate
recipients, targets, amounts or other decision fields. No credentials,
private paths, vault references, or provider HTML enter the queue.
The first approval frame has a 256 KiB ceiling. Larger input returns a specific
size-limit error without truncation or execution; CLI confirmation cannot replace
the required human approval.

The helper alone moves requests from pending to approved or denied. Approval
expires on a monotonic deadline and is atomically consumed once for the exact
envelope. Simultaneous consumers cannot share it. Request changes, policy changes,
account changes, implementation changes, app restart or cancellation invalidate
approval. Atomic permit consumption is the authorization linearization point:
revocation rejects unconsumed work; consumed work is already in flight. The grant
becomes an invocation-local admission proof. Recheck after waits, before result
disclosure, and before subsequent messaging parts without re-prompting for the
approved exact composite plan. Once a
dispatch may have happened, preserve the existing uncertainty record and stop;
revocation never authorizes retry or destroys recovery evidence.

Covered semantic paths must include ordinary reads, cached read disclosure,
confirmed writes, omni reads, and composite messaging, including every subsequent
part's revocation check. The independent coverage inventory must name every
choke point and test. Generic page/media capture, local evidence exports,
authentication lifecycle and derivation are separate command families. The UI
and docs must state their scope; a provider operation toggle must never claim
to prevent all same-account data access through other tools.

Identity and preview never consume. Human waits precede cleanup/confirmation
claims. Synchronous cache-only APIs return an explicit approval-required outcome
without private output; they never wait on same-process IPC. SWR/revalidation
must use one live admission for the result and internal cache projection; an
initial denied cache probe cannot prevent the later approved live result. Test
the public SDK's identity/cache-before/live/cache-after process sequence.

Concrete coverage inventory: `runtime.ts:prepareInvocation`, `runPrepared`, and
`confirmMessagingInvocation`; `read-client.ts:readCachedPreparedCapability` and
revalidation; admission/dispatch in `confirmed-write-platform.ts`; per-part
dispatch in `messaging-runtime.ts`; cache/live/rebuild in `omni-runtime.ts`.
Check before returning data after network latency. Denied disclosure preserves
any dispatch/recovery evidence. Prepared invocations cannot retain stale grants.
`validateFreshPlan` reconstructs an invocation without an incarnation today;
populate and validate it for confirmed writes, including A→B→A account changes.

### User-space interfaces and OpenAPI

Use OpenAPI 3.1 JSON as a composable semantic interface contract over the existing
plugin kernel. An interface is editable user data. An executor is separately
trusted code. Preserve that distinction in types, UI, documentation and identity.

The versioned `x-ghostget` binding selects an exact existing semantic recipe and
contract. Export active interfaces with standard request schemas and the known
result envelope; provider payloads are explicitly unconstrained where no output
schema exists. A compound document preserves separate adapter projections or
references for mixed transports. Activate one explicitly selected adapter at a
time; composition is not a partially committed batch presented as atomic. Import
matching bindings through the existing strict runtime manifest parser and
conditional installer. Portable-owned adapters remain references and can only be
updated through their owning package lifecycle. A foreign operation without
a supported matching executor remains a visible inert draft with a useful
authoring prompt. It never becomes an arbitrary HTTP call. Existing portable
plugins remain the route to new provider behavior and retain their exact bundle
trust and lifecycle gates.

Document a strict profile instead of pretending to implement all OpenAPI. Bound
JSON bytes, depth, operations and schemas. Reject remote references, cycles,
dynamic servers, callbacks, webhooks, unknown behavioral extensions, unsupported
schema constraints and duplicate ownership. Import performs no network request
or code execution. An operation cannot weaken kernel risk, input validation,
origin, auth, side effect, idempotency or dispatch requirements. Standard OpenAPI
authentication metadata describes a mechanism; it grants no Ghostget authority.

Compose installed interfaces with stable namespaced operation IDs and path
ownership; never silently shadow built-ins or rewrite collisions. Track source
as bundled, user-authored or imported, separately from executor source-kind.
Keep editable drafts separate from exact activated snapshots. Draft edits do not
change live behavior. Activating an update requires comparison with the previous
snapshot and invalidates affected permissions and pending approvals.

Sources: [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.1.html),
[Pi extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md),
[Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).
Borrow Pi's small registration API, resources, scoped configuration and lifecycle
ergonomics. Do not import its full-permission in-process extension trust model
into credential handling.

### 1Password and account connection

Connect existing browser sessions through bounded account locator creation and
the kernel's exact provider subject probe. Open only reviewed provider login
URLs with an explicitly selected supported browser/profile. Label this action
“Open provider login”; opening a URL proves neither successful login nor that
1Password is enabled. The user may use 1Password's browser integration for the
password/passkey ceremony, then select “Verify sign-in”. Probe a staged locator,
show the detected subject, and conditionally bind the expected account. Browser
lock, cancellation, mismatch or concurrent replacement preserves the old binding.

Provide a narrowly scoped **Import token from 1Password** path using the pinned
1Password SDK's desktop authentication. The human binds an exact account and
vault reference to a supported provider token sink. A dedicated credential
helper resolves the secret after 1Password's own authorization, validates it,
and connects through the existing private OAuth credential mechanism. This
retains a local token copy: locking 1Password does not revoke it. Start with the
built-in X official OAuth 2.0 user-context access-token purpose. App-only Bearer
Tokens are unsupported. Add a bounded built-in account probe around the existing
private `/2/users/me` logic, because X's plugin currently has no subject-probe
entry. Use DNS-pinned HTTPS, a deadline and categorical errors. The probe verifies
subject; scopes and expiry remain explicitly declared import metadata. Reject
unsupported scopes, expired/app-only tokens and incorrect subjects without
committing a locator or orphaning credentials. Add an owned-import marker distinct
from renewable managed Gmail credentials. Stage one mode-0600 immutable token
file, probe with trusted built-in code, and conditionally publish the locator as
the single commit point. Cancel/failure removes only the owned stage; successful
replacement/disconnect cleans up owned prior credentials. Preserve uncertain
cleanup evidence. Expired tokens need a new import; do not claim vault-backed
renewal. Never
return secret values, SDK raw errors, or vault references to the agent. Do not
copy secrets, put them in argv/environment, or log them. Do not load community
executors or middleware in the credential helper. New or unsupported vault
purposes fail closed. Keep API token support distinct from password login.

Passkeys are origin-bound authenticator ceremonies, not readable secrets.
Universal unattended password or passkey login is not an acceptance claim.
Provider-specific automated password login requires a later reviewed login
adapter with fixed origin/form/navigation/account proof, MFA handoff and cleanup.
This version delivers the real system-browser/1Password handoff and typed future
auth-purpose boundary. It does not invent a generic secret-to-form API.

Sources: [1Password SDKs](https://www.1password.dev/sdks),
[desktop integration security](https://www.1password.dev/sdks/desktop-app-integrations),
[WebAuthn](https://www.w3.org/TR/webauthn-3/),
[Apple passkeys](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys).
The supported guarantee is that agent-facing Ghostget interfaces never disclose
credentials. An unrestricted malicious process under the same OS account is
outside this guarantee; stronger isolation requires separately qualified OS
sandboxing and credential/process identities.

### Future middleware

Reserve a versioned, immutable sanitized invocation/result envelope and the
stages validate, authorize, execute, redact and postprocess. Document ordering,
budgets, cancellation and failure behavior now. No plugin runtime or LLM service
is implemented in this change. Future hooks may narrow authority or request
review; changing a request restarts validation and approval. A later LLM approval
plugin receives only explicitly delegated authority and cannot override a hard
deny, see credentials, or skip dispatch records.

### Agent web gateway and local observability

The owner additionally requested a web-proxy role: agents can disable other web
tools and use Ghostget as their gateway. Implement `ghostget web fetch` for public
HTTPS GET/HEAD retrieval, with exact-origin and endpoint rules using the same
allow/deny/ask vocabulary and human approval service. This is an application
gateway, not CONNECT, PAC, TLS interception or an OS-wide firewall. Disabling
other tools is agent configuration; unrestricted shell and other state homes
remain outside enforcement.

An immutable ruleset contains versioned uniquely named rules, explicit public
HTTPS origins on port 443, exact paths or bounded path prefixes, allowed methods,
declared query parameter names, decision and byte/time ceilings. Default deny;
matching hard deny wins. Overlapping allows use the strictest decision and
minimum byte/time ceilings; any ask requires approval. No
arbitrary regex, hostname suffix matching, caller headers, request body, cookies,
auth locator or ambient proxy. Normalize once and bind the exact URL, method,
rule digest and ruleset revision to approval. Reject userinfo, fragments,
ambiguous path encodings, dot segments and unsafe destinations.

Use existing DNS-pinned HTTPS, reject redirects, bound response bytes and
deadlines, perform no retry and recheck authorization before disclosure. GET/HEAD
describes HTTP intent, not guaranteed harmlessness: rules represent explicit
endpoint permission, and known mutating/secret-bearing endpoints need a reviewed
provider operation. Return bounded textual content as untrusted source data.
Authenticated providers retain their existing kernel; a broad domain allow grants
no credentials and cannot bypass operation/account permission.

Offer explicit gateway-only mode for the selected state home. It blocks legacy
generic network entrypoints that bypass this gateway, including capture/media
and derivation. Do not claim all provider/browser subrequests obey endpoint rules:
semantic provider mode is separately scoped. The first strict gateway-only mode
allows the gateway, local inspection/configuration and approval-safe control
commands; authenticated providers require the separately disclosed semantic mode.
Test actual CLI aliases and supported SDK paths, not just the setup prompt.

Keep `RequestObservationV1` separate from authorization and mutation journals.
Store gateway attempts/outcomes in owner-only SQLite using rollback journal
mode, FULL synchronization, bounded busy timeout and small transactions. Never
hold a transaction across approval/network waits. Strictly version the schema,
bind SQL parameters, verify private DB/journal paths and cap readers.
Record trace ID, UTC times, monotonic duration, rule identity, method, approved
origin, configured endpoint scope, decision, categorical outcome, HTTP status
and byte counts. Use random request IDs; omit URL-derived digests to avoid
offline guessing of low-entropy private query values. Never store raw URL path/query values, headers, cookies, bodies,
response content, vault metadata or raw errors. Scope Activity to gateway
requests; provider observation is a future additive kind, not packet capture.

Record intent durably before dispatch. Audit admission failure prevents network.
Crash after intent leaves an interrupted observation, never success or permission
to retry. Final audit failure is categorical; a row never grants authority.
Retain at most 10,000 completed rows or 30 days with bounded oldest-first pruning,
keeping interrupted recent rows visible. Do not touch existing mutation journals.
Activity offers search, method/domain/outcome/time filters, sortable supported
orders and metadata detail in the native app. The owner explicitly requires
virtualized table rendering and infinite lazy scrolling, with no pagination UI.
Use indexed keyset cursors bound to the filter/search fingerprint and a stable
snapshot upper sequence. Never use growing SQL OFFSET. Return at most 100 rows
per request with an opaque next cursor and bounded metadata. Strictly parse
search terms; parameterize SQL and quote FTS terms rather than accepting raw FTS
or SQL expressions. Search only retained non-secret metadata.

Use a pinned virtualizer over the actual table, stable row IDs, a modest overscan
and a bounded mounted-row count. Preserve keyboard navigation, accessible column
headers, row positions, focus and detail access. Keep the query port asynchronous;
filter/search changes cancel or ignore stale responses using a generation ID,
reset cursor state, and cannot append results from the prior query. Load near the
viewport end; show honest initial/loading/empty/error/retry/end states. New events
offer an explicit refresh without shifting the current reader's scroll position.
Verify a 10,000-row synthetic Direct world, filter races, late replies, retry,
duplicate-free cursor traversal, stable ordering under inserts, and a fixed small
DOM row window. Record real render/query measurements on the packaged app.

Future policy/observability plugins receive versioned sanitized envelopes and
may narrow authority or consume observations. LLM approval remains a future
explicit policy plugin. Neither SQLite nor OpenAPI grants network authority.
OpenAPI can describe endpoint shapes; activating outbound rules remains an
explicit control-plane decision.

## Interface direction

Operate mode. Use the existing Paper theme and native macOS expectations, compact
sidebar navigation, keyboard-reachable controls, system-appropriate typography,
light/dark appearance and restrained status colors. Sections: Accounts,
Capabilities, Integrations, Web access, Approvals, Activity, and Agent setup. Account states describe
what is known: configured, verified, reconnect required, pending, or failed.
Do not label a stored locator as a verified current session.

Use real catalog/state projections. Show provenance in integration rows and the
capability detail. Permission controls show exactly which semantic operation and
account they govern. Agent setup copies pinned installation prompts and bounded
usage/authoring prompts. No model API key, chat window, fake activity statistics,
remote asset requests or unauthenticated web control server.

### Direct verification and marketing frames

The owner additionally required Direct on 2026-09-11. Follow the pinned Direct
setup/verification skills and Oompa's `app/fixtures/product` and
`site/product-preview.tsx` pattern. Define a production-safe `ControlPanelPort`
below shared screens and product state, above native IPC. The production adapter
uses Tauri; a distinct Direct entry supplies strict synthetic JSON worlds and
stateful deterministic adapters for the same port. No copied fixture UI.

Cover empty accounts, verified accounts, reconnect required, capability policy,
user/imported integrations, pending approval, vault cancellation, and backend
failure in at most eight stable scenarios. Explicit activation errors must remain
errors. Use Direct session/manifest/probe/coverage contracts, activity settlement,
abort and cleanup. Mark native IPC, vault, private filesystem and real provider
proof as direct or mixed evidence, never proven by fixture screenshots.

Build production and Direct separately. Require positive source-map evidence for
shared screens, state and the production adapter and reject Direct, fixtures,
reserved query keys and bridge globals in the shipped app. The fixture bundle
must prove the inverse adapter selection. Marketing frames render the real shared
UI from a closed synthetic scene catalog at build time, inside inert sandboxed
preview documents. They refuse IO and ship no Direct runtime, native IPC, provider
code or personal data. Add accessible scene/enlargement controls to the static
marketing site, preserving no-JavaScript content and the existing Paper theme.

One browser-auth owner verifies a bounded local batch with fresh scenario
contexts, exact host allowlisting, stable quiescence and product assertions, and
retains the final close result. Native macOS app verification remains separate.

## Phase map

| Phase | Outcome | Depends on | Write owner / scope | Parallel with |
| --- | --- | --- | --- | --- |
| 1 | Reviewed contracts and threat model | none | Root: plan, shared control types, repository rules | none |
| 2 | Operation policy and kernel enforcement | 1 | Policy worker: permission modules and named kernel choke points | 3, 4 |
| 3 | OpenAPI/user interface lifecycle | 1 | Interface worker: interface modules and focused tests | 2, 4 |
| 4 | Native control panel and Direct rig | 1 | App worker: desktop frontend, port and Direct composition | 2, 3 |
| 5 | Helper, account/vault connection and composition | 1; joins 2–4 | Root: control service, credential helper, CLI routing, barrels/manifests/locks/scripts | independent portions of 2–4 |
| 5b | Web gateway and SQLite activity | 1; approval service | Root: gateway/rules/audit modules and CLI integration | 2–4 |
| 6 | Adversarial review, installed app and release | 2–5 | Root integrates; independent reviewers own bounded review | none |

Root owns package manifests, lockfiles, generated output, public exports,
aggregate CI, release workflows, versioning and the plan log. Workers must not
edit these shared files. Freeze shared request/response contracts before workers
start. Each worker reports exact commands and evidence; repeat only invalidated
checks. Use bounded subagents in this task, not new user-owned tasks.

## Phase 1: Contracts and adversarial plan review

- **Status:** Complete
- **Scope:** this plan, shared protocol types, policy scope documentation.
- **Acceptance:** independent platform, integration and security reviews resolve
  authority, operation coverage, draft activation, packaging and vault boundaries.
  Explicitly record findings and changes before implementation. No unresolved
  critical design issue is moved silently into implementation.
- **Validation:** strict protocol fixtures and review against current source.

## Phase 2: Policy and approvals

- **Status:** Complete
- **Scope:** permission model/store/client and the enumerated semantic entrypoints.
- **Acceptance:** deny/allow/ask has actual CLI/SDK effect; cached disclosure and
  composite writes have regression coverage; stale/replayed approvals fail;
  unmanaged compatibility and managed default-deny are explicit.
- **Validation:** focused `bun test` on new permission suites and affected runtime,
  read-client, confirmed-write and messaging suites; property laws for parsers,
  revisions, coordinate identity and request transitions. Final command inventory
  is recorded when exact new file names are frozen.

## Phase 3: OpenAPI interfaces

- **Status:** Complete
- **Scope:** strict profile parser/exporter/composer and draft/snapshot store.
- **Acceptance:** deterministic export/import round trip, actual known-binding
  activation, inert unsupported drafts, visible provenance and immutable updates;
  no fetch/code execution during import; no authority drift or collisions.
- **Validation:** example and property tests for hostile inputs, canonical bytes,
  round trips, collision detection, drift and conditional activation.

## Phase 4: Native app

- **Status:** Complete
- **Scope:** `desktop/`, excluding root-owned dependency/release convergence.
- **Acceptance:** packaged macOS app launches with real helper; all seven sections
  work, account and permission changes have observed kernel effects, copied
  prompts contain no secrets, offline/error/empty states work, closing settles
  helper custody, and IPC/capabilities/CSP deny undeclared operations.
- **Validation:** frontend typecheck/build, Rust unit tests and locked native build,
  installed-app smoke, keyboard/light/dark/compact-window visual review. Record
  startup, helper readiness, idle CPU and memory on the real app without invented
  performance comparisons.

## Phase 5: Control service and authentication

- **Status:** Complete
- **Scope:** fixed stdio control API, agent approval socket, account projections,
  1Password purpose adapter, setup prompts and integration composition.
- **Acceptance:** agent IPC cannot approve or resolve secrets; invalid frames and
  overload are bounded; app restart, cancellation, stale policy and duplicate
  consumption fail closed; account reconnect uses exact subject proof; vault
  secret sentinels never reach any public output. Live user authentication is
  performed only for an account the user chooses, through 1Password's own prompt.
- **Validation:** process-level private fixture tests for both channels, failure
  injection and expiry; fake-vault tests for exact sinks and all output surfaces;
  packaged helper and SDK/native dependency admission. No fixture uses personal
  account data.

## Phase 6: Qualification and delivery

- **Status:** In progress
- **Scope:** independent impact/diff/security/UI review, documentation, immutable
  packages, macOS app artifact, PR and required CI, release and applicable site
  production verification.
- **Acceptance:** no unresolved critical/high security finding; all enabled claims
  have evidence. A source-built app is not advertised as signed/notarized without
  actual signing evidence. Release the CLI/source through the existing exact
  five-asset canonical channel. Deliver the locally qualified macOS `.app` archive
  separately as a task artifact; do not add a sixth asset to a canonical Release
  or advertise a public signed installer before a separately reviewed channel
  and real signing authority exist. Keep unqualified distribution paths disabled and
  name any unavoidable credential or signing blocker.
- **Validation:** preserve the complete existing `Required` PR CI union and add
  native/frontend checks without weakening source coverage. Run relevant focused
  local macOS checks and installed-app acceptance. Use `bun run check` when
  equivalence or coupled-sequence evidence is uncertain. Refresh/check the KB.

Run heavy checks through `/Users/bg/.bun/bin/oompa-host-run` with compute lane;
native builds and app qualification use mac-native; browser suites use the single
browser-auth owner. Keep exact child argv and retry exit 77 once with reviewed
host access. Required CI owns the aggregate integration gate after convergence.

Deliver through a current-head PR to main with independent review, resolved
threads and fresh matching required CI before conditional merge. No force-push.
Follow `docs/publishing.md` for immutable canonical releases, optional exact-byte
npm mirror and separately qualified website promotion. Do not modify release
authority merely to accommodate desktop packaging. Final log records branch,
head/tree, PR, required run/attempt/job union, merge, package/app hashes, signing
status and applicable production evidence.

## Recovery and migration

Use additive private state under the existing state home; never rewrite existing
account credentials merely by opening the app. Preserve prior live snapshots
until replacement validates and commits conditionally. Policy rollback is an
explicit local control action and cannot erase dispatch journals. The exact
installed manifest remains authoritative across interrupted activation. Failure
before its conditional commit preserves the prior manifest; failure to save a
later UI provenance receipt cannot roll back a committed manifest or preserve
its old permission. Refresh and reconcile the installed digest. Approval/helper failure
returns a categorical blocked outcome; it never executes anyway. Versioned
protocol incompatibility fails with a supported upgrade instruction.

## Implementation log

### 2026-09-11: Adversarial plan round 1

Independent core and security reviewers found six blocking design gaps: account
scope, synchronous/multi-process cache approval, revocation linearization,
compound OpenAPI activation, imported-token ownership, and desktop distribution.
The plan now binds account incarnations and active adapter digests, distinguishes
preview/cache/live admission, defines in-flight revocation semantics, activates
one adapter with explicit portable references, names the X token sink and retained
copy lifecycle, and preserves the five-asset release contract. Added helper
limits/custody and staged browser/profile verification. Direct and real-UI
marketing frames are now explicit acceptance criteria.

Packaging research pinned Tauri crate 2.11.5/build 2.6.3, JS API 2.11.1/CLI
2.11.4, and 1Password SDK/core 0.5.0. A scheduled mac-native ABI-only probe using
Bun 1.3.14 loaded the SDK, its WASM and the installed 1Password IPC dylib without
account access. This proves ABI loading only. Signed distribution must qualify
the separate vault helper's library-validation requirements; the main app does
not inherit a blanket hardened-runtime exception.

### 2026-09-11: Implementation and adversarial revision

Parallel lanes implemented account-bound operation policies, OpenAPI drafts and
activation, the Tauri/React/Direct app, and isolated 1Password token import. The
integration owner implemented the private helper, web gateway, SQLite activity,
CLI paths, and marketing composition. Shared protocol frames remain explicit;
private control is bounded at 4 MiB and agent messages at 256 KiB.

Independent review closed races in approval rechecks and shutdown, encoded-path
deny bypasses, policy changes while DNS is pending, stale sign-in proof, account
A-to-B-to-A revisions, partial interface activation, credential-stage mutation
between probe and commit, and cleanup after credential publication. Revisions
are tested at their actual boundaries. Activity retention includes interrupted
rows under the same bounded audit retention; dispatch journals remain separate.

Focused evidence so far: interfaces 15/15, vault and Gmail lifecycle 21/21,
connection lifecycle 5/5, initial gateway/SQLite 13/13, pure control parsers and
broker barriers 10/10, desktop model/parser scenarios 6/6. Real browser
verification has driven the account flow and captured the shared UI; the driver
found its own pinned tab-ID contract drift and is being repaired before any
passing browser receipt is admitted. Native dependency compilation reached the
app host; resource and icon packaging issues were found and repaired. Final
source, native, browser, package, CI, release, and production gates remain open.


### 2026-09-11: Source, package, and real native qualification

The two independent canonical build/pack pairs are byte-identical: 523 files,
2,312,026 compressed bytes and 12,644,368 payload bytes, SHA-256
`82364442728547e0ea3c6a2fb105ea58e461f5bab2346e8b8244bf68e4596d54`.
The strict archive parser admits the control guide and complete source closure,
rejects missing helper/guide and unreviewed documentation or tests, and preserves
the historical five-file Release contract. The compressed Linux allowance is
explicitly a projection pending the actual CI measurement.

Real private-helper lifecycle checks passed (2 tests / 55 assertions), including
second-owner exclusion, agent/admin channel separation, pending-work cancellation,
restart, truncated-frame handling and orderly custody cleanup. Gateway and pinned
transport tests passed (16 / 889); retention and interfaces passed (23 / 1,076),
including completion-triggered 10,000-row and 30-day retention. Public CLI tests
passed (5 / 147) for draft authoring and gateway-only command/alias routing.
Native CI composition tests passed (10 / 235), preserving the existing Linux
union and adding unconditional pinned Rust and packaged-helper checks.

The actual Apple Silicon macOS app built successfully; Rust host tests passed
(2 / 2). CUA inspected the real Tauri window against a separate synthetic SQLite
store with 10,000 requests. Search reduced it to 5,000 matching rows; HEAD
filtering reduced it to 1,667; scrolling loaded beyond the first 100-row query
while keeping only the viewport's rows exposed. A human-approval-required rule
for exactly `GET https://example.com/` was saved in this test app. The real CLI
waited for its native approval and then returned HTTP 200, 559 bytes, untrusted
public content. App exit returned zero and removed its exact owner and socket.
No personal account, token, browser profile, or vault item was accessed.

The owner identified the macOS default selectors as visually inconsistent.
The shared controls now set equal heights, typography, padding and a single
chevron while preserving native select behavior; optional labels stay inline.
A reviewed Save/Cancel race is covered by deferred-response UI tests (8 / 715).
The source-built app is being rebuilt for this visual repair. Direct's pinned
browser driver exposed lifecycle and command-contract faults; none of those
failed runs is accepted as a passing browser receipt. Final Direct, native
visual, exact-tree CI, release and production qualification remain open.

### 2026-09-11: Native polish and measured idle cost

The rebuilt macOS app now shows consistent 36-pixel selectors with one chevron
and inline optional labels. The real native setup prompt and clipboard action
also passed. The installed-version prompt now links to the exact version's
immutable installation guide and native source build instructions.

The same native run exposed repeated catalog construction: the helper retained
roughly 916–958 MiB and consumed 31.36 CPU seconds across a 100-second idle
sample. An independent empty-state source benchmark measured repeated snapshots
at a median 1.50 seconds wall and 1.07 seconds CPU; bundled interface digests
took only about 7 milliseconds. Forced GC and Bun's small-heap option did not
materially improve resident memory and were not adopted.

Periodic native updates now read only the bounded private administrative
`approval.list` result. Full account and catalog snapshots run on return to the
app, after commands, or on manual refresh. Aborted and late polls cannot restore
an old approval or error across a command, full refresh, or disposal. Permission
and execution checks retain fresh source and account validation. Focused UI and
parser checks passed (14 tests / 1,355 assertions); the real helper's updated
agent/admin isolation and lifecycle checks passed (2 / 56). A separate pure
syntax-analysis optimization and comparable final measurements remain under
review. Production source changes require fresh package measurements and gates.

### 2026-09-11: Final review and performance result

The syntax optimization caches only immutable literal import lists and a boolean
loader-analysis result keyed by exact freshly read source bytes and parser
inputs. Every filesystem read, resolution edge, source/dependency digest,
per-registry bound, and pre/post runtime-load identity check remains in place.
Focused syntax checks passed (9 / 291) and source, dependency, symlink, lazy-load,
JSX, and opaque-loader drift regressions passed (14 / 45).

Comparable fresh-process measurements with eight four-second polls used
105.0 milliseconds CPU across 32.001 seconds for the approval list (0.33%),
versus 5,670.5 milliseconds across 33.797 seconds for full snapshots (16.8%).
Approval polling took 0.04–0.26 milliseconds. Warm snapshot CPU fell from about
1.07 to 0.57 seconds. Startup RSS remains roughly 708 MiB; a first snapshot
leaves roughly 842 MiB resident with no observed idle growth. An allocation
diagnostic measured 478.6 MiB physical footprint after GC. The existing source
and dependency validation kernel is the principal cost. This change does not
claim a lightweight helper. Further reduction needs a separately reviewed
on-demand provider or short-lived validation design; cached authority and
hardcoded dependency analysis were rejected.

Final seam review replaced wall-clock approval and connection deadlines with
monotonic elapsed time, retaining wall time only for displayed expiry. It also
bounded retained approval previews to 512 KiB, aligned renderer preview limits
with the kernel's 240 KiB limit, and changed an oversized catalog reply into a
bounded matching error without stopping the helper. Race, exact-boundary, clock
jump, escaping and multibyte tests cover these repairs. Broker checks passed
(9 / 55), connection checks passed (6 / 31), and updated UI/parser checks passed
(15 / 1,368).

All eight Direct scenarios passed in one owned browser with fresh contexts and
successful final whole-browser close. The recorded local verification policy
uses nonce-bound clean pagehide disposal into inert documents instead of the
reference skill's per-tab close attempts: agent-browser 0.32.3 reattaches a
queued already-destroyed target and fails its network controls after a close.
The substitution retains exact host allowlisting, fresh contexts, a bounded
inventory of eight scenario tabs plus bootstrap, and no context reuse. It does
not claim per-context closure or unchanged reference-policy compliance. Direct
also exposed a blocked inline font; production and fixture builds now serve
the exact local font file under the existing restrictive policies.

### 2026-09-11: Converged local qualification

The final paired canonical packs contain 524 files, 2,313,628 compressed bytes,
and 12,648,898 payload bytes. Both source inventories, modes, and archive bytes
match; SHA-256 is
`6a18ddbf45c787ab22a206eccc75159e745700bab5cbdf34e159f0a240e135a9`.
Strict archive inspection and focused budget/source checks passed (4 / 89).
Local static checks passed, including frontend, website and 103 release-contract
tests with 7,125 assertions. Current-candidate Required CI remains the final
source integration gate.

The last real native run found the new approval-list action absent from the
Rust allowlist. The host now admits it; a source-AST parity check compares the
entire shared request union with native admission and rejects aliases or
nonliteral action declarations it cannot inspect (2 / 8). After that repair,
the app rebuilt, both locked Rust tests passed, and the packaged helper returned
its empty snapshot in 3.067 seconds and exited with its owner/socket removed.
The actual native window showed the new pending approval without manual refresh,
displayed the exact synthetic URL, and returned `WEB_DENIED` to the waiting CLI
when Deny was selected. No public request was dispatched in this check. Native
menus, font, aligned controls, and clean app shutdown passed. Steady native idle
samples used about 0.35% helper CPU with roughly 745 MiB resident; account and
approval interactions caused bounded refresh work. The locally built Apple
Silicon app archive is separate from canonical publication; its SHA-256 is
`22e54533a41c6d19fafe38793e1494ea22ab95e96b06371906527f0ad815039e`.

The website browser run proved all four preview frames remain opaque with empty
sandboxes, no scripts or authority bridge, correct geometry, and a loaded local
font. The font's `Origin: null` requests receive the exact file's CORS header.
The receipt retains four source-verified Playwright-injected diagnostics; no
authored or unexpected browser error passed. A separate minimum-window review
proved Accounts and Activity at 700×560 in both light and dark themes: aligned
36-pixel controls, visible keyboard focus, no document overflow, and 13 rendered
activity rows for 10,000 records. All four fresh contexts and the whole browser
closed successfully. No product change was needed.

Repository design issue [#226](https://github.com/hraness/ghostget/issues/226)
records the agreed migration and trust boundaries for implementation review.
PR, Required CI, merge, immutable release and production readback remain open.
