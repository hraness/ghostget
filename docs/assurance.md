# Assurance case

<!-- Generated from verification/claims.json by `bun run ./scripts/verification-claims.ts render`. Edit the register, then render. -->

This page lists what Ghostget's automated checks establish. Each claim names the layer that carries it, the evidence that checks it, the environment it assumes, and what it leaves unverified. The register `verification/claims.json` is the source, and the plan behind it is `kb/plans/formal-verification-assurance.md`.

A claim is *evidenced* when its layer runs in CI, *planned* when a plan phase schedules its layer, and *not verified* when no automated check covers it. `bun run verify:claims` fails when this page is stale, when a guideline in a scanned `AGENTS.md` has no current rule in the register, when a rule does not list exactly the claims that quote its guideline, when a managed block's text changes, when an evidenced property claim names a test that runs no property, or when an evidence path no longer exists.

## Summary

The register holds 245 claims: 200 evidenced, 26 planned, and 19 not verified. It maps 90 guidelines from 5 guides; 70 list claims and 20 are exempt.

| Layer | Evidenced | Planned | Not verified |
| --- | ---: | ---: | ---: |
| example test | 145 | 2 | 0 |
| property test | 18 | 1 | 0 |
| stateful model | 10 | 13 | 0 |
| Quint model with production trace replay | 17 | 8 | 0 |
| Lean proof with differential test | 7 | 1 | 0 |
| differential oracle | 3 | 1 | 0 |
| configuration readback | 0 | 0 | 15 |
| none | 0 | 0 | 4 |

## What is not verified

The register as a whole does not verify:

- Provider behaviour on third-party sites.
- Correctness of Bun, JavaScriptCore, the operating-system filesystem beyond the modelled `StatePort` semantics, WHATWG URL parsing (covered only differentially), GitHub, npm, Sigstore, and Vercel.
- Hostile in-process plugin code, which `AGENTS.md` already treats as trusted.
- Hostile processes running as the same user.
- Sentence-level coverage inside a guideline. A guideline counts as covered when its rule lists every claim that quotes it; a sentence of a covered guideline may still have no claim, and review of the guideline digest is the only check.

Every claim below also lists its own not-verified scope.

### Claims without an automated check

- `derived-state-rebuildable`: Derived state is rebuildable from authoritative state and lives in the cheapest serving tier; only authoritative state uses transactional storage. No automated check covers this claim. Only the `costs.json` kind classification is checked; rebuildability and tier placement are not.
- `content-bytes-in-content-store`: Content bytes live only in the content store; the control plane holds references and metadata. No automated check covers this claim as stated; the listed tests check only related cases.
- `local-cli-birth-time-readiness`: Local-CLI readiness requires a nonzero immutable directory birth time for operation-private roots and reports the transport unavailable before staging credentials otherwise. No automated check covers this claim, and no plan phase schedules one. No test exercises the birth-time readiness requirement.
- `npm-release-env-config`: GitHub environment npm-release has administrator bypass disabled, no reviewers, no secrets, sole protection rule branch_policy, and the single custom deployment policy tag v* with no branch admitted. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift. The listed tests check only the checked-in side of the contract.
- `npm-trusted-publisher-binding`: The npm trusted publisher for @hraness/ghostget names exactly hraness/ghostget, release.yml and environment npm-release; no other relationship exists, package access requires 2FA and disallows tokens, and no npm token is stored in GitHub. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `tag-ruleset-creation-only`: In each tag ruleset pair, the creation-only ruleset has the exact rule set [creation] and sole always-bypass User 894119; it never authorizes update or deletion. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `tag-ruleset-immutable`: In each tag ruleset pair, the immutable ruleset has exact rules [deletion, update] and no bypass actors; it never authorizes creation. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `tag-rulesets-two-split-pairs`: Exactly four active repository tag rulesets form two split creation-only and immutable pairs, one targeting only `refs/tags/v*` and one targeting only `refs/tags/desktop-v*-macos-arm64`; any other active tag ruleset is drift, and the split semantics, not the ruleset IDs or names, carry the authority. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `immutable-releases-enabled-before-tag`: Immediately before every stable tag push, signed-in administrator readback shows repository immutable Releases enabled=true. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift. An administrator could change the setting between the readback and publication.
- `no-integration-tag-bypass`: Neither GitHub Actions nor any other Integration has a release-tag ruleset bypass. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `production-ref-lifecycle-ruleset`: Ruleset 21832074 targets exactly website-production and website-production-canary with no bypass actors and exact creation, deletion and non-fast-forward rules. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `production-ref-update-ruleset-app-only`: Ruleset 21887484 supplies the sole update restriction on both production refs with exactly one Integration bypass, App 4783991, bypass_mode=always; no other actor (including Actions App 15368) may update either ref. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `protect-main-ruleset`: Protect-main has no bypass actors, requires the pull-request path and exact Required CI check, approval minimum zero and require_code_owner_review=false while only one eligible code owner exists. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift. The listed tests check only the checked-in side of the contract.
- `production-writer-env-config`: Environment production-ref-writer-key has deployment=false, main-only branch policy, no required reviewers or wait timer, prevent_self_review=false, no administrator bypass, exactly four App identity variables and the single WRENCH_RELEASE_APP_PRIVATE_KEY secret. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift. The listed tests check only the checked-in side of the contract. The workflow-side `deployment: false` is source-checked; the environment's protection settings are confirmed only by readback.
- `release-app-permissions-exact`: The release App registration grants exactly metadata:read, contents:write and workflows:write with no Administration or other permission, and installation 158077029 selects only repository ID 1316443113. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `promotion-canary-preserved`: refs/heads/website-production-canary remains at exactly 0bf88a064233635e0c5485c61f9c533974a7dca4 and is never reset, deleted or repurposed. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `vercel-project-config`: Vercel project `prj_TZbDZ38ABPan158IqnczgsuTu6Ue` under team `team_UAd1iD2XogJlbFg4h14mRaPM` is linked to GitHub repository 1316443113 with `link.productionBranch=website-production`, `autoExposeSystemEnvs=true`, and persistent `autoAssignCustomDomains=true`; main and pull requests deploy only previews. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
- `control-drift-freezes-production`: Any detected control-plane drift (rulesets, App bypass, App permissions, installation selection, writer environment) leaves production unchanged until the controls are requalified by fresh administrator readback. Live settings are confirmed only by administrator readback; CI cannot read them or detect drift. Drift is detected only at setup, after control changes, and during recovery, not on each routine promotion.
- `website-informational-only`: `website/` explains and documents Ghostget and contains no agent runtime, authenticated product surface, or browser-based substitute for the CLI and SDK. No automated check inspects `website/` for authenticated surfaces, credential handling, or runtime features; review alone enforces this boundary.

### Exempt guidelines

These guidelines have no claim in the register, and no automated check covers them. Each reason says why.

| Guide | Guideline | Reason |
| --- | --- | --- |
| `AGENTS.md` | Follow `WRITING.md` for… | Prose style rule; it states no property of the package, CLI, website, or release. |
| `AGENTS.md` | Apply unreasonably robust… | Engineering method; the laws it asks for are claimed under the example-and-property and lifecycle-model rules. |
| `AGENTS.md` | Extract a shared… | Package-extraction process rule; it states no property of shipped behaviour. |
| `AGENTS.md` | Freeze shared interfaces… | Parallel-work coordination rule for contributors; it states no property of shipped behaviour. |
| `AGENTS.md` | Keep mandatory rules… | Documentation placement rule; `bun run kb:check` validates guide shape. |
| `AGENTS.md` | Keep Ghostget a bring-your-own-agent… | Product-scope rule; no automated check covers it, and it states no safety or integrity property. |
| `AGENTS.md` | Keep exactly one… | Skill-packaging rule; it states no safety or integrity property. |
| `AGENTS.md` | Treat this repository… | Editorial scope rule for repository prose; no automated check covers it. |
| `AGENTS.md` | An owner release… | Delegation of owner authority to agents; it governs who acts, while the readback and tag claims cover what must hold. |
| `website/AGENTS.md` | Keep the homepage's… | Presentation rule for the informational website; it states no safety or integrity property. |
| `website/AGENTS.md` | Keep the page useful… | Presentation rule for the informational website; it states no safety or integrity property. |
| `website/AGENTS.md` | Keep every product… | Editorial accuracy rule for website copy; no automated check covers it. |
| `website/AGENTS.md` | Keep canonical metadata,… | Search-metadata presentation rule; it states no safety or integrity property. |
| `website/AGENTS.md` | Keep ordinary reference… | Presentation rule for website guides and editorial images; it states no safety or integrity property. |
| `website/AGENTS.md` | Preserve semantic headings,… | Accessibility presentation rule; it states no safety or integrity property. |
| `website/AGENTS.md` | Public copy (page… | Public-copy style rule; it states no safety or integrity property. |
| `website/AGENTS.md` | The one-line description… | Public-copy consistency rule that the website build enforces; it states no safety or integrity property. |
| `website/AGENTS.md` | On a public page,… | Public-copy vocabulary rule; it states no safety or integrity property. |
| `website/AGENTS.md` | Describe a sibling… | Editorial accuracy rule for sibling-product copy; no automated check covers it. |
| `website/AGENTS.md` | Use product names… | Public-copy naming rule; it states no safety or integrity property. |

### Managed blocks outside the register

These synced blocks sit inside a scanned Guidelines section but have no rules or claims, and no automated check covers them. The register pins each block's text, so any change fails the register until someone reviews it.

| Guide | Block | Reason |
| --- | --- | --- |
| `AGENTS.md` | `hraness-public-copy` | Synced Hraness public-copy policy for prose; it states no property of the package, CLI, website, or release. |
| `AGENTS.md` | `hraness-delivery` | Synced Hraness delivery and workstation laws, including production-data preservation, runtime-enforced approvals, and delivery-gate guards; no automated check in this repository covers them. |
| `AGENTS.md` | `algal-skills` | Synced contributor tooling instructions for the algal skill pack; it states no property of the package, CLI, website, or release. |

### Guides outside the register

- `.agents/skills/`: Reusable repository-maintenance skill guides; they direct agent workflows and state no property of the package, CLI, website, or release.
- `kb/`: Knowledge-vault authoring guides; `bun run kb:check` validates the vault, and they state no product property.

## Environmental assumptions

Each claim holds only while its listed assumptions hold.

| Assumption | Statement | Claims |
| --- | --- | ---: |
| `bun-runtime` | Bun and JavaScriptCore execute the sources and the test runner as specified. | 8 |
| `filesystem-atomic-rename` | Same-volume rename and link are atomic. | 33 |
| `filesystem-durability` | Data and directory entries that were fsynced persist across a crash or power loss. | 29 |
| `same-user-trusted` | Processes running as the same operating-system user are trusted; file modes and owner-only sockets separate users. | 33 |
| `process-liveness` | Process ID, process start time, and boot identity readings are truthful. | 10 |
| `monotonic-clock` | The injected monotonic clock never runs backward. | 6 |
| `whatwg-url` | Bun's URL parser implements the WHATWG URL Standard. | 13 |
| `dns-tls` | The operating-system resolver and the TLS stack behave as specified. | 7 |
| `sha256` | SHA-256 is collision resistant. | 3 |
| `encryption` | The authenticated encryption primitives and the operating-system key storage are sound. | 4 |
| `media-tools` | yt-dlp, ffmpeg, and whisper.cpp report metadata faithfully and honor the arguments they are given. | 11 |
| `provider-behaviour` | Third-party providers behave as their observed contracts describe. | 29 |
| `plugin-trusted` | Source plugins are trusted in-process code; portable execution contains ordinary failures, not hostile code. | 13 |
| `onepassword` | The 1Password SDK and account return the requested secret faithfully. | 2 |
| `github-api` | GitHub's REST, GraphQL, and Actions APIs report repository, run, and Release state truthfully. | 73 |
| `github-enforcement` | GitHub enforces rulesets, environments, concurrency groups, immutable Releases, and token permissions as configured. | 72 |
| `sigstore` | Sigstore and `gh attestation verify` verify attestation bundles correctly. | 2 |
| `npm-registry` | The npm registry enforces version immutability, trusted publishing, and provenance as documented. | 17 |
| `vercel` | Vercel builds and serves deployments as its project settings and APIs report. | 37 |
| `administrator-readback` | A signed-in administrator performs the documented live readbacks and reports them faithfully. | 15 |
| `ci-runner` | GitHub-hosted runners execute the reviewed workflow faithfully. | 16 |
| `verification-tools` | The pinned Quint, Apalache, JDK, elan, and Lean releases are sound for the outcomes they report. | 15 |
| `edge-runtime` | The Vercel Edge runtime implements the Web Platform APIs the edge code uses. | 5 |

## Claims by area

### `authentication` (2 claims)

#### `auth-request-binding`

Every authenticated request is bound to one exact account realm, provider target, transport, contract version, and implementation identity; drift in any of them rejects the request and consumes prepared plans.

- Planned: stateful model in plan Phase 4.
- Source: `AGENTS.md`: “Bind every authenticated request to one exact account realm, provider target, transport, contract version, and implementation identity.”
- Evidence: `src/auth-storage.test.ts`, `src/beeper-message-like-me-source.test.ts`, `src/client-boundary.test.ts`, `src/local-cli-durable-identity.test.ts`, `src/runtime.test.ts`, `src/web-session-authentication-policy.test.ts`
- Assumptions: `provider-behaviour`
- Not verified: The stateful model for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `no-silent-transport-switch`

Ghostget never silently switches between official API, browser session, linked-device, or portable transports; error text cannot grant a transport switch.

- Evidenced by example test.
- Source: `AGENTS.md`: “Never silently switch transport.”
- Evidence: `src/beeper-local-plugin.test.ts`, `src/ghostget.test.ts`, `src/pinned-https.test.ts`, `src/providers/linkedin-company-program.test.ts`, `src/providers/linkedin-self-program.test.ts`
- Assumptions: `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

### `browser-admission` (4 claims)

#### `browser-admission-cap-two`

At most two locally owned browser acquisitions run concurrently across processes sharing one state home.

- Planned: Quint model with production trace replay in plan Phase 4.
- Source: `SECURITY.md`: “Ghostget caps locally owned browser acquisition at two across processes sharing one state home”
- Evidence: `src/browser-admission.property.test.ts`, `src/browser-admission.test.ts`
- Assumptions: `filesystem-atomic-rename`, `process-liveness`
- Not verified: The Quint model with production trace replay for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `browser-admission-no-pid-reuse-reclaim`

PID reuse alone cannot reclaim a browser admission claim; automatic reclamation requires a verified prior boot and same-boot claims stay occupied after owner death.

- Planned: Quint model with production trace replay in plan Phase 4.
- Source: `SECURITY.md`: “PID reuse alone cannot reclaim a claim. Automatic reclamation requires a verified prior operating-system boot”
- Evidence: `src/browser-admission.property.test.ts`, `src/browser-admission.test.ts`, `src/process-identity.test.ts`
- Assumptions: `filesystem-atomic-rename`, `process-liveness`
- Not verified: The Quint model with production trace replay for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `browser-admission-malformed-reduces-capacity`

A malformed claim, unverifiable owner, or unsafe state path reduces available capture capacity and never creates an extra slot.

- Evidenced by example test.
- Source: `SECURITY.md`: “A malformed claim, an unverifiable owner, or an unsafe state path reduces available capture capacity and never creates an extra slot.”
- Evidence: `src/browser-admission.property.test.ts`, `src/browser-admission.test.ts`
- Assumptions: `filesystem-atomic-rename`, `process-liveness`
- Not verified: Only the enumerated example cases are checked.

#### `browser-admission-no-launch-after-deadline`

Admission polling is budgeted to min(remaining capture time, 30 s), and deadline revalidation plus conditional rollback prevent a browser launch after expiry.

- Planned: stateful model in plan Phase 2.
- Source: `SECURITY.md`: “deadline revalidation and conditional rollback prevent a browser launch after expiry”
- Evidence: `src/browser-admission.test.ts`
- Assumptions: `filesystem-atomic-rename`, `process-liveness`, `monotonic-clock`
- Not verified: The stateful model for this claim is scheduled for plan Phase 2; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

### `ci` (1 claim)

#### `ci-source-coverage-contract`

The `Required` job succeeds only when every source CI job succeeds, including `verification`, and each source job runs the checked checkout, toolchain, source-identity, and frozen-install template with SHA-pinned actions, unpersisted credentials, and least permissions.

- Evidenced by example test.
- Source: `AGENTS.md`: “Complete `Required` PR CI is the normal final source integration gate for executable and documentation changes”
- Also covers: `AGENTS.md`: “CI covers the complete Linux aggregate and a selected macOS suite.”
- Evidence: `scripts/ci-pr-gate.test.ts`, `scripts/github-release-artifact.test.ts`, `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-enforcement`, `ci-runner`
- Not verified: Only the enumerated example cases are checked.

### `contracts` (8 claims)

#### `contracts-schema-parser-agree`

Contract JSON Schemas are generated from the same shape table as the parsers; parser and schema agree on arbitrary values and reject every unsupported key.

- Evidenced by property test.
- Source: `docs/contracts.md`: “The schema is generated from the same shape table the parser uses, so the two cannot drift.”
- Evidence: `src/contracts-schema.test.ts`, `src/contracts-shape.test.ts`
- Property tests: `src/contracts-shape.test.ts`: “property: valid documents round-trip and validate; parse and schema agree on arbitrary values”; `src/contracts-shape.test.ts`: “property: an unsupported key at any object path is rejected by the parser and the schema”
- Assumptions: none beyond the register-wide scope
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `contracts-inspection-read-only`

Catalog, check, schema, and repair inspection never bind an account or contact a provider.

- Evidenced by example test.
- Source: `docs/contracts.md`: “Catalog, check, schema, and repair inspection are read-only projections. They never bind an account or contact a provider.”
- Evidence: `src/contracts-check.test.ts`, `src/contracts-cli.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified: Only the enumerated example cases are checked.

#### `public-authority-code-owned`

An operation is public only when it is an observed, dispatch-free, built-in R1 web-session read declaring access public; manifests cannot opt into public execution.

- Evidenced by example test.
- Source: `docs/contracts.md`: “A web-session operation is `public` only when”
- Evidence: `src/contracts-catalog.test.ts`, `src/web-session-authentication-policy.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified: Only the enumerated example cases are checked.

#### `collection-plan-read-only-bounded`

collection-plan.v1 requires risk R1 and sideEffect none and enforces bounds (64 accounts, 8 reads per account, 128 total, 16 metric keys, delay ≤ 600000 ms, input ≤ 32 keys depth 8, canonical credential-free target URLs).

- Evidenced by property test.
- Source: `docs/contracts.md`: “`semantics.risk` must be `R1` and `semantics.sideEffect` must be `none`; v1 plans are read-only by construction.”
- Evidence: `src/contracts-plan.test.ts`
- Property tests: `src/contracts-plan.test.ts`: “property: generated plans round-trip through JSON, flatten in order, and validate against the schema”; `src/contracts-plan.test.ts`: “property: every parser rejection of a generated mutation is a schema violation or a documented semantic rule”
- Assumptions: none beyond the register-wide scope
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `contract-check-single-gap`

Each checked read reports at most one gap chosen by the fixed precedence; reads has exactly plan.reads indexed entries and ok is true exactly when every verdict is ok.

- Evidenced by property test.
- Source: `docs/contracts.md`: “Each read reports at most one gap, chosen in this order”
- Evidence: `src/contracts-check.test.ts`
- Property tests: `src/contracts-check.test.ts`: “property: checking is deterministic and idempotent and never leaves the closed gap set”; `src/contracts-check.test.ts`: “property: reads derived from the catalog bind ok with the exact installed contract”
- Assumptions: none beyond the register-wide scope
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `invoke-read-envelope-consistency`

R1 invoke envelopes are consistent: receipt status/runId equal top-level fields, cache outcome matches status, failed results have null output and a readFailure whose disposition matches its category, output bounded to depth 64 and 4,000,000 nodes.

- Evidenced by example test.
- Source: `docs/contracts.md`: “Invoke result: `receipt.status` and `receipt.runId` equal the top-level fields”
- Evidence: `src/contracts-invoke-read.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified: Only the enumerated example cases are checked.

#### `read-failure-disposition-table`

Read failure retry dispositions come from one closed table (retry-once-after-60s, repair-auth, do-not-retry).

- Evidenced by example test.
- Source: `docs/contracts.md`: “`readFailureDispositions` exports the same closed table.”
- Evidence: `src/ghostget.test.ts`, `src/providers/read-failure.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified: Only the enumerated example cases are checked.

#### `read-runtime-zero-dispatch`

R1 reads store a provisional receipt before execution, accept only zero-dispatch outcomes, and store the final receipt before returning output.

- Evidenced by example test.
- Source: `docs/effect-read-runtime.md`: “`readInvocationProgram` stores the provisional receipt before starting execution. It accepts only zero-dispatch success or failure”
- Evidence: `src/read-client.test.ts`, `src/read-effect.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified: Only the enumerated example cases are checked.

### `control` (13 claims)

#### `agent-channel-cannot-escalate`

Requests on the owner-only agent socket cannot grant approvals, alter policy or permissions, connect accounts, import credentials, or resolve secrets.

- Evidenced by example test.
- Source: `src/control/AGENTS.md`: “Agent requests cannot grant approvals, alter policy, connect accounts, or resolve secrets.”
- Evidence: `src/control/approval-broker.test.ts`, `src/control/helper-lifecycle.test.ts`, `src/control/validation.test.ts`
- Assumptions: `same-user-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `control-protocol-bounded-reject-drift`

Administrative and agent control protocols are bounded and reject unknown fields, unsupported methods, oversized or malformed frames, and nested contract drift before dispatch.

- Evidenced by property test.
- Source: `src/control/AGENTS.md`: “Keep both protocols bounded and reject drift before dispatch.”
- Evidence: `src/control/helper-client.test.ts`, `src/control/validation.test.ts`
- Property tests: `src/control/helper-client.test.ts`: “helper rejects malformed envelopes and nested contract drift”; `src/control/validation.test.ts`: “strict parsers reject every generated unknown key”
- Assumptions: `same-user-trusted`
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `tui-input-cannot-bypass-review`

Terminal input, including pasted or unbracketed bursts, cannot issue confirmation or approval without the complete account and exact revision/digest review being displayed.

- Evidenced by example test.
- Source: `src/control/AGENTS.md`: “Terminal input, including pasted text, must never bypass that review.”
- Evidence: `src/control/tui.test.ts`
- Assumptions: `same-user-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `tui-restores-terminal-state`

The TUI restores terminal state (raw mode, cursor, alternate screen) before waiting for helper cancellation and custody settlement, including on failure and signals.

- Evidenced by example test.
- Source: `src/control/AGENTS.md`: “Restore terminal state before waiting for helper cancellation and custody settlement.”
- Evidence: `src/control/tui.test.ts`
- Assumptions: `same-user-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `managed-policy-corrupt-denies`

Once operation permissions are enabled, a missing or corrupt policy denies access and never falls back to unmanaged behaviour.

- Evidenced by example test.
- Source: `SECURITY.md`: “Enabling operation permissions establishes a persistent managed marker: missing or corrupt policy then denies access.”
- Evidence: `src/control/policy-privacy.test.ts`, `src/operation-permission.test.ts`
- Assumptions: `same-user-trusted`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `openapi-inert-until-activation`

User OpenAPI documents remain inert drafts until exact conditional activation and never create arbitrary (authenticated) HTTP executors.

- Evidenced by example test.
- Source: `src/control/AGENTS.md`: “User OpenAPI documents remain inert until exact conditional activation and never create arbitrary HTTP executors.”
- Evidence: `src/control/interface-cli.test.ts`, `src/control/interfaces.test.ts`
- Assumptions: `same-user-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `credential-helper-fixed-sink`

The credential helper has one fixed 1Password X-token sink; SDK loading and raw credential material stay in that process and never reach the renderer, agent protocol, or diagnostics.

- Evidenced by example test.
- Source: `src/control/AGENTS.md`: “The credential helper has one fixed 1Password X-token sink. Keep SDK loading and raw credential material in that process”
- Evidence: `src/control/vault-cli.test.ts`, `src/control/vault.test.ts`
- Assumptions: `same-user-trusted`, `onepassword`
- Not verified: Only the enumerated example cases are checked.

#### `credential-publish-exact-staged-bytes`

Credential publication re-verifies the exact staged bytes and account revision; changed or BOM-prefixed bytes are not published.

- Evidenced by example test.
- Source: `src/control/AGENTS.md`: “Verify exact staged bytes and account revision again at publication.”
- Evidence: `src/control/vault.test.ts`
- Assumptions: `same-user-trusted`, `onepassword`
- Not verified: Only the enumerated example cases are checked.

#### `control-single-helper-owner`

The menu and TUI share exactly one helper owner per state home; a second controller does not acquire custody.

- Planned: stateful model in plan Phase 2.
- Source: `src/control/AGENTS.md`: “The menu and TUI share one helper owner per state home.”
- Evidence: `src/control/helper-client.test.ts`, `src/control/helper-lifecycle.test.ts`, `src/control/tui.test.ts`
- Assumptions: `same-user-trusted`
- Not verified: The stateful model for this claim is scheduled for plan Phase 2; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `no-cached-authorization-across-change`

Authorization is never cached across a changed account, policy, interface, or executable closure; an A-to-B-to-A account change invalidates grants and previewed plans.

- Planned: stateful model in plan Phase 4.
- Source: `src/control/AGENTS.md`: “Display optimizations must not cache authorization across a changed account, policy, interface or executable closure.”
- Evidence: `src/control/account-revision.test.ts`, `src/control/connections.test.ts`, `src/operation-permission.test.ts`
- Assumptions: `same-user-trusted`
- Not verified: The stateful model for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `grant-binds-exact-identity`

Operation grants bind the exact account incarnation, manifest, contract, and executable closure; a change to any of them, or a changed approval, invalidates the prior grant.

- Planned: Quint model with production trace replay in plan Phase 4.
- Source: `SECURITY.md`: “Grants bind the exact account incarnation, manifest, contract, and executable closure. A changed account, interface, implementation, or approval invalidates the prior grant.”
- Evidence: `src/control/approval-broker.test.ts`, `src/operation-permission.test.ts`
- Assumptions: `same-user-trusted`
- Not verified: The Quint model with production trace replay for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `approval-allow-once`

An allow-once approval admits one exact pending request at most once (allowed implies uses ≤ 1), including across client crash, expiry, and reconnect; drift, expiry, and shutdown revoke proofs.

- Evidenced by Quint model with production trace replay.
- Source: `kb/plans/formal-verification-assurance.md`: “Model digest binding at dispatch, lease expiry, crash, and reconnect. The invariant `allowed ⇒ uses ≤ 1` drives the fix for D13.”
- Evidence: `scripts/verification-approvals-replay.test.ts`, `src/control/approval-broker.test.ts`, `src/control/connections.test.ts`, `verification/quint/approvals.qnt`
- Assumptions: `same-user-trusted`
- Not verified:
  - verification/quint/approvals.qnt checks one request, two holders and an anonymous caller, with at most two crashes and two policy changes per trace, to Quint simulation depth 20 and Apalache length 10. Its ITF replay drives the production ApprovalBroker with 1,000 traces of up to 30 steps. Longer schedules, more requests, and more callers are sampled only by the fast-check model in src/control/approval-broker.test.ts.
  - The model covers the broker alone. Connection reconnect, dispatch digest binding outside the broker, and control-service shutdown are covered only by the listed example tests.
  - Plan defect D13 is fixed: the broker binds each allow-once grant to its holder's use secret at request or first allowed check. The Quint variants stepShared, stepFirstCheck and stepAdmitBeforeAwait reproduce the pre-fix defects, and the replay shows the production broker refuses each of their violating traces.

#### `shutdown-settles-before-custody-release`

Connection and helper shutdown settle owned work before custody is released.

- Planned: stateful model in plan Phase 2.
- Source: `src/control/AGENTS.md`: “Connection and helper shutdown must settle owned work before custody is released.”
- Evidence: `src/control/connections.test.ts`, `src/control/helper-lifecycle.test.ts`
- Assumptions: `same-user-trusted`
- Not verified: The stateful model for this claim is scheduled for plan Phase 2; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

### `control-plane` (13 claims)

#### `tag-ruleset-creation-only`

In each tag ruleset pair, the creation-only ruleset has the exact rule set [creation] and sole always-bypass User 894119; it never authorizes update or deletion.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “In each pair, the creation-only ruleset must have exact rule `creation` and sole always-bypass User `894119`; it must never authorize update or deletion.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

#### `tag-ruleset-immutable`

In each tag ruleset pair, the immutable ruleset has exact rules [deletion, update] and no bypass actors; it never authorizes creation.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “The immutable ruleset must have no bypass actors and exact deletion plus update rules; it must never authorize creation.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

#### `tag-rulesets-two-split-pairs`

Exactly four active repository tag rulesets form two split creation-only and immutable pairs, one targeting only `refs/tags/v*` and one targeting only `refs/tags/desktop-v*-macos-arm64`; any other active tag ruleset is drift, and the split semantics, not the ruleset IDs or names, carry the authority.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “read back all four active repository tag rulesets. They form two split pairs: one pair targets only `refs/tags/v*`, and the other targets only `refs/tags/desktop-v*-macos-arm64`.”
- Also covers: `AGENTS.md`: “Any other active tag ruleset is drift.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

#### `immutable-releases-enabled-before-tag`

Immediately before every stable tag push, signed-in administrator readback shows repository immutable Releases enabled=true.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “Immediately before tag dispatch, require administrator readback that immutable Releases are enabled; grant no Administration to workflows.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified:
  - Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
  - An administrator could change the setting between the readback and publication.

#### `no-integration-tag-bypass`

Neither GitHub Actions nor any other Integration has a release-tag ruleset bypass.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “Never give GitHub Actions or another Integration a release-tag bypass.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

#### `production-ref-lifecycle-ruleset`

Ruleset 21832074 targets exactly website-production and website-production-canary with no bypass actors and exact creation, deletion and non-fast-forward rules.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “Live ruleset `21832074` supplies no-bypass creation, deletion, and non-fast-forward protection to the production and persistent canary refs.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

#### `production-ref-update-ruleset-app-only`

Ruleset 21887484 supplies the sole update restriction on both production refs with exactly one Integration bypass, App 4783991, bypass_mode=always; no other actor (including Actions App 15368) may update either ref.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “Live ruleset `21887484` supplies the sole update restriction and exact App `4783991` `Integration` bypass with `bypass_mode=always`; no other actor may update either ref.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

#### `protect-main-ruleset`

Protect-main has no bypass actors, requires the pull-request path and exact Required CI check, approval minimum zero and require_code_owner_review=false while only one eligible code owner exists.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “Protect-main has no bypass actors and retains pull-request admission plus the exact Required CI check. Keep its approval minimum at zero and `require_code_owner_review=false` until a second eligible independent code owner exists.”
- Also covers: `AGENTS.md`: “Never force-push or bypass the gate.”
- Evidence: `scripts/ci-pr-gate.test.ts`
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified:
  - Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
  - The listed tests check only the checked-in side of the contract.

#### `production-writer-env-config`

Environment production-ref-writer-key has deployment=false, main-only branch policy, no required reviewers or wait timer, prevent_self_review=false, no administrator bypass, exactly four App identity variables and the single WRENCH_RELEASE_APP_PRIVATE_KEY secret.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “the main-only, automatically admitted `production-ref-writer-key` environment with no required deployment reviewers or wait timer, no administrator bypass, `prevent_self_review=false`, exactly four App identity variables and the one private-key secret.”
- Also covers: `website/AGENTS.md`: “Keep no required deployment reviewers or wait timer, `prevent_self_review=false`, no administrator bypass, exact `main` admission, and `deployment: false`.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified:
  - Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
  - The listed tests check only the checked-in side of the contract.
  - The workflow-side `deployment: false` is source-checked; the environment's protection settings are confirmed only by readback.

#### `release-app-permissions-exact`

The release App registration grants exactly metadata:read, contents:write and workflows:write with no Administration or other permission, and installation 158077029 selects only repository ID 1316443113.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “The App registration and every minted token must close to exactly `metadata:read`, `contents:write`, and `workflows:write`, with no Administration or other permission.”
- Also covers: `website/AGENTS.md`: “Keep the App and minted token permission set exact at `metadata:read`, `contents:write`, and `workflows:write`.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

#### `promotion-canary-preserved`

refs/heads/website-production-canary remains at exactly 0bf88a064233635e0c5485c61f9c533974a7dca4 and is never reset, deleted or repurposed.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “Retain persistent canary `refs/heads/website-production-canary` at exact `C=0bf88a064233635e0c5485c61f9c533974a7dca4`; never reset, delete, or repurpose it.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

#### `vercel-project-config`

Vercel project `prj_TZbDZ38ABPan158IqnczgsuTu6Ue` under team `team_UAd1iD2XogJlbFg4h14mRaPM` is linked to GitHub repository 1316443113 with `link.productionBranch=website-production`, `autoExposeSystemEnvs=true`, and persistent `autoAssignCustomDomains=true`; main and pull requests deploy only previews.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “keep exact project `prj_TZbDZ38ABPan158IqnczgsuTu6Ue`, team `team_UAd1iD2XogJlbFg4h14mRaPM`, GitHub repository ID `1316443113`, `link.productionBranch=website-production`, `autoExposeSystemEnvs=true`, and persistent `autoAssignCustomDomains=true`.”
- Also covers: `website/AGENTS.md`: “Keep Vercel project `prj_TZbDZ38ABPan158IqnczgsuTu6Ue` under team `team_UAd1iD2XogJlbFg4h14mRaPM` linked to GitHub repository ID `1316443113`”
- Evidence: none
- Assumptions: `github-enforcement`, `vercel`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

#### `control-drift-freezes-production`

Any detected control-plane drift (rulesets, App bypass, App permissions, installation selection, writer environment) leaves production unchanged until the controls are requalified by fresh administrator readback.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “Any detected drift leaves production unchanged until those controls are requalified.”
- Also covers: `website/AGENTS.md`: “Any detected drift leaves production unchanged until those controls are requalified.”
- Evidence: none
- Assumptions: `github-enforcement`, `administrator-readback`
- Not verified:
  - Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
  - Drift is detected only at setup, after control changes, and during recovery, not on each routine promotion.

### `costs` (3 claims)

#### `cost-surface-registry`

Every product data surface (table, bucket, stream, dynamic route, blob, provider meter) is registered in costs.json with kind, retention class, owner, and budget; an unregistered surface fails check:cost-surfaces.

- Evidenced by example test.
- Source: `AGENTS.md`: “A new table, bucket, stream, dynamic route, blob, or provider meter fails `check:cost-surfaces` until it registers.”
- Also covers: `AGENTS.md`: “Run `bun run check:cost-surfaces` before handoff whenever a data surface changes.”
- Evidence: `scripts/check-cost-surfaces.mjs`, `scripts/ci-pr-gate.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified:
  - Only the enumerated example cases are checked.
  - No unit test covers the surface detector in `scripts/check-cost-surfaces.mjs`.

#### `bounded-inputs`

The parsers and stores that the cited tests exercise bound their inputs before storage or provider I/O: request bytes, row counts, page sizes, batch sizes, retry counts, and event payloads.

- Evidenced by example test.
- Source: `AGENTS.md`: “Bound every input before storage or provider I/O”
- Evidence: `src/article-draft-document.test.ts`, `src/contract-repair-inbox.test.ts`, `src/contracts-plan.test.ts`, `src/control/approval-broker.test.ts`, `src/control/gateway.test.ts`, `src/control/validation.test.ts`, `src/messaging-automation-server.test.ts`, `src/omni-limits.test.ts`, `src/provider-plugin-host.test.ts`, `src/provider-plugin-registry.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified:
  - Only the enumerated example cases are checked.
  - Modules without a cited test are not checked, and no static scan finds an unbounded input elsewhere.

#### `mutation-idempotency-key`

Every mutation carries an idempotency key, so a retried write never double-charges storage, quota, or provider spend.

- Planned: Quint model with production trace replay in plan Phase 4.
- Source: `AGENTS.md`: “Every mutation carries an idempotency key; a retried write never double-charges storage, quota, or provider spend.”
- Evidence: `src/contract-repair-inbox.test.ts`, `src/run-journal.test.ts`, `src/runtime.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified: The Quint model with production trace replay for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

### `edge` (5 claims)

#### `edge-same-origin-retrieval`

Edge negotiation retrieves only same-origin sibling assets: the retrieved origin equals the request origin for every request path, including `//host/x.md`.

- Evidenced by property test.
- Source: `kb/plans/formal-verification-assurance.md`: “D12: require `retrieved.origin === request.origin` and add the property.”
- Evidence: `edge/negotiation.test.ts`
- Property tests: `edge/negotiation.test.ts`: “property: every retrieved URL keeps the request origin”
- Assumptions: `whatwg-url`, `edge-runtime`
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `edge-accept-406-only-when-empty`

Over parsed Accept media ranges, document negotiation returns 406 exactly when the header has ranges and no offered representation has a best matching range with q above 0; a selected representation is offered, accepted with q above 0, and has the highest q among the acceptable representations.

- Evidenced by Lean proof with differential test.
- Source: `edge/AGENTS.md`: “Honor Accept q-values, set `Vary: Accept`, and return `406` only when no owned representation remains.”
- Also covers: `website/AGENTS.md`: “return `406` only when no owned representation remains”
- Evidence: `edge/negotiation.test.ts`, `scripts/verification-lean-encodings.test.ts`, `verification/lean/GhostgetVerification/Edge/Negotiation.lean`
- Assumptions: `whatwg-url`, `edge-runtime`, `verification-tools`
- Not verified:
  - The Lean theorems are about a Lean model of the selection. The differential test checks that negotiateDocumentRepresentation agrees with that model on generated headers, not on every header.
  - The Accept header parser (parseAcceptMediaRanges) is not modelled; the differential test parses each header with the TypeScript.
  - Tie-breaking after q (specificity, header order, server preference) is only sampled, and response headers such as Vary: Accept are covered only by the listed tests.

#### `edge-vary-accept`

Negotiated document responses set Vary: Accept.

- Evidenced by example test.
- Source: `edge/AGENTS.md`: “set `Vary: Accept`”
- Also covers: `website/AGENTS.md`: “set `Vary: Accept`”
- Evidence: `edge/negotiation.test.ts`
- Assumptions: `whatwg-url`, `edge-runtime`
- Not verified: Only the enumerated example cases are checked.

#### `edge-unknown-404`

Unknown document paths stay HTTP 404 and serve the static markdown 404 body.

- Evidenced by example test.
- Source: `edge/AGENTS.md`: “Unknown document paths stay HTTP 404 and serve the static markdown 404 body.”
- Also covers: `website/AGENTS.md`: “Unknown paths stay HTTP 404”
- Evidence: `edge/negotiation.test.ts`
- Assumptions: `whatwg-url`, `edge-runtime`
- Not verified: Only the enumerated example cases are checked.

#### `edge-no-node-imports`

Edge files import no Node, Bun, website build, or filesystem modules, and middleware.ts imports only edge/.

- Evidenced by example test.
- Source: `edge/AGENTS.md`: “Keep every file here free of Node, Bun, website build, and filesystem imports.”
- Evidence: `edge/imports.test.ts`, `edge/tsconfig.json`
- Assumptions: `whatwg-url`, `edge-runtime`
- Not verified: Only static import declarations and `import()` calls with literal specifiers are scanned; test files under `edge/` run on Bun and are not scanned.

### `encoding` (5 claims)

#### `canonical-json-injective`

canonicalJson over plain JSON (null, booleans, safe integers, strings of UTF-16 code units, arrays, and objects with distinct keys) is injective up to member order, gives the same text for any member insertion order, and never writes a NUL code unit; its UTF-16 code-unit key order is total and locale-independent.

- Evidenced by Lean proof with differential test.
- Source: `kb/plans/formal-verification-assurance.md`: “Canonical JSON over an inductive `Json` with UTF-16 key order: the encoder is injective, parse-then-encode is the identity on canonical output, and key order is total.”
- Evidence: `scripts/verification-lean-encodings.test.ts`, `src/canonical-json.test.ts`, `src/local-cli-surface-contract.test.ts`, `src/model.test.ts`, `verification/lean/GhostgetVerification/Encodings/CanonicalJson.lean`, `verification/lean/GhostgetVerification/Encodings/CanonicalJsonProofs.lean`
- Assumptions: `bun-runtime`, `verification-tools`
- Not verified:
  - The Lean theorems are about a Lean model of the encoder. The differential test checks that the TypeScript agrees with that model on generated values, not on every value.
  - Parse-then-encode being the identity on canonical output is not proved.
  - Numbers are modelled as safe integers only; fractions, exponents, and the JavaScript engine's number formatting are not modelled.
  - The model starts from a plain JSON value. The TypeScript checks that reject undefined members, cycles, symbols, getters, and non-plain objects are not modelled.

#### `canonical-json-rejects-non-json`

`canonicalJson` rejects sparse arrays, non-plain prototypes (Map, Date, typed arrays), accessors, and symbols rather than emitting invalid or colliding output.

- Evidenced by property test.
- Source: `kb/plans/formal-verification-assurance.md`: “D5: make `canonicalJson` reject non-plain prototypes, sparse arrays, accessors, and symbols”
- Evidence: `src/canonical-json.test.ts`, `src/client-boundary.test.ts`
- Property tests: `src/canonical-json.test.ts`: “property: every value fast-check can build encodes exactly when it is in the JSON domain”; `src/canonical-json.test.ts`: “property: a domain violation at any nesting depth is rejected”
- Assumptions: none beyond the register-wide scope
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `canonical-json-matches-rfc8785-oracle`

For every I-JSON value, which excludes lone surrogates, `canonicalJson` writes the same text as an independent RFC 8785 canonicalizer, and it reproduces the committed golden canonical forms, number texts, SHA-256 digests, and script-literal escapes.

- Evidenced by differential oracle.
- Source: `kb/plans/formal-verification-assurance.md`: “Add a dev-only Rust crate under `verification/oracles/` with an RFC 8785 canonicalizer”
- Evidence: `verification/oracles/src/jcs.rs`, `verification/vectors/generate.py`, `verification/vectors/jcs.json`, `scripts/verification-oracles.test.ts`, `scripts/verification-vectors.test.ts`
- Assumptions: `sha256`
- Not verified:
  - Generated values are sampled at the configured run count, and the golden vectors are a fixed corpus; neither is a proof over all inputs.
  - `canonicalJson` writes a lone surrogate as JSON.stringify escapes it, where RFC 8785 refuses the input; the vector test pins this difference.
  - Duplicate member names never reach `canonicalJson`, because `JSON.parse` keeps the last one; refusing them is a parser's job, not the canonicalizer's.
  - The Rust oracle and the Python generator were written from RFC 8785 without reference to the TypeScript, but by the same author, so a misreading all three share would pass. The oracle's number digits come from Rust's correctly rounded formatting, and one misreading of the shortest-digit rule at powers of two was found in review and fixed.

#### `hash-framing-injective`

The length-framed hash input (a 4-byte label length, an 8-byte payload length, the label, and the payload, per section) determines its sections; the contract hash preimage (canonical JSON as UTF-8, a 0x00 byte, then the implementation hash) determines the JSON bytes and the implementation hash; and the NUL-joined confirmed-write intent key preimage determines the intent's fields.

- Evidenced by Lean proof with differential test.
- Source: `kb/plans/formal-verification-assurance.md`: “The length-framed hash input and the `json ‖ 0x00 ‖ 32-byte` suffix are injective.”
- Evidence: `scripts/verification-lean-encodings.test.ts`, `src/media/runtime-closure.property.test.ts`, `verification/lean/GhostgetVerification/Encodings/HashFraming.lean`, `verification/lean/GhostgetVerification/Encodings/Units.lean`
- Assumptions: `sha256`, `verification-tools`
- Not verified:
  - SHA-256 is not modelled; that distinct preimages give distinct hashes rests on the sha256 assumption.
  - The Lean theorems are about Lean models of the preimages. The differential test checks that updateLengthFramedHash, providerContractHash, localCliContractHash, and intentLedgerPath agree with those models on generated inputs, not on every input.
  - UTF-8 injectivity is not proved, so the contract theorem stops at the UTF-8 bytes of the canonical JSON rather than the JSON value.
  - The intent key theorem assumes every field is ASCII and NUL-free, as validated identifiers and hex hashes are; the model does not check that callers only pass such fields.
  - Framing lengths must fit their headers (labels under 2^32 bytes, payloads under 2^64 bytes); the TypeScript does not check this.
  - Other NUL-separated preimages (the per-hash idempotency key in ledgerPath, web-session contracts, predecessor-compatible contract hashes, provider-plugin package and module-analysis hashes) and the separate framing copy in src/provider-plugin.ts are not covered.

#### `identifier-roundtrip`

Identifier grammars and route/operation composite keys satisfy parse(format(x)) = x and are unambiguous.

- Planned: Lean proof with differential test in plan Phase 5.
- Source: `AGENTS.md`: “Add property tests for strict parsers, canonical encodings, identifiers, ordering, round trips”
- Evidence: `src/contracts-repair.test.ts`, `src/local-cli-tool-identity.test.ts`, `src/platform-catalog.property.test.ts`, `src/provider-plugin-registry.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified: The Lean proof with differential test for this claim is scheduled for plan Phase 5; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

### `local-cli` (7 claims)

#### `local-cli-digest-authority`

A local-CLI binding executes only an executable whose exact SHA-256 matches the reviewed tool identity; reported versions are drift checks, not authority.

- Evidenced by example test.
- Source: `docs/local-cli-providers.md`: “the exact executable SHA-256, which is the execution authority”
- Evidence: `src/beeper-local-plugin.test.ts`, `src/local-cli-tool-identity.test.ts`
- Assumptions: `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

#### `local-cli-identity-change-invalidates`

Changing the tool identity changes the operation implementation and contract hash, so old previews, receipts, caches, and recovery evidence cannot authorize new bytes.

- Evidenced by example test.
- Source: `docs/local-cli-providers.md`: “Changing the tool identity changes the operation's implementation and contract hash, so old previews, receipts, caches, and recovery evidence cannot silently authorize the new bytes.”
- Evidence: `src/local-cli-durable-identity.test.ts`
- Assumptions: `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

#### `local-cli-fixed-argument-positions`

Caller values fill only reviewed argument positions and cannot select a command, flag, endpoint, target, env var, header, shell fragment, or output path.

- Evidenced by example test.
- Source: `docs/local-cli-providers.md`: “Caller values may fill only reviewed argument positions.”
- Evidence: `src/beeper-local-plugin.test.ts`, `src/providers/beeper-local-runtime.internal.test.ts`
- Assumptions: `provider-behaviour`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `local-cli-command-coverage-ledger`

Every upstream canonical command maps to exactly one semantic operation or one explicit unavailable reason, and R4 destructive commands are unavailable to provider dispatch.

- Evidenced by example test.
- Source: `docs/local-cli-providers.md`: “Map every canonical command to one semantic Ghostget operation or one explicit unavailable reason.”
- Evidence: `src/beeper-local-plugin.test.ts`
- Assumptions: `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

#### `local-cli-isolated-env`

Local-CLI children start without a shell, with a minimal environment and operation-private directories, and inherit no credentials, targets, proxies, debug overrides, or user plugins.

- Evidenced by example test.
- Source: `docs/local-cli-providers.md`: “Start the process directly without a shell. Give it a minimal environment and operation-private config, data, cache, and temporary directories.”
- Evidence: `src/imessage-direct-plugin.test.ts`, `src/providers/beeper-local-runtime.internal.test.ts`
- Assumptions: `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

#### `local-cli-birth-time-readiness`

Local-CLI readiness requires a nonzero immutable directory birth time for operation-private roots and reports the transport unavailable before staging credentials otherwise.

- Not verified.
- Source: `docs/local-cli-providers.md`: “The temporary filesystem must expose a nonzero immutable directory birth time for operation-private roots.”
- Evidence: none
- Assumptions: `provider-behaviour`
- Not verified:
  - No automated check covers this claim, and no plan phase schedules one.
  - No test exercises the birth-time readiness requirement.

#### `local-cli-post-spawn-indeterminate`

Once a local-CLI mutation child starts, any failure (timeout, signal, malformed or lost response) is post-dispatch indeterminate and is never retried.

- Planned: Quint model with production trace replay in plan Phase 4.
- Source: `docs/local-cli-providers.md`: “Never retry a mutation after the child may have reached the provider.”
- Evidence: `src/imessage-direct-plugin.test.ts`, `src/providers/beeper-direct-messaging.test.ts`
- Assumptions: `provider-behaviour`
- Not verified: The Quint model with production trace replay for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

### `media` (12 claims)

#### `media-single-finite-item`

Media acquisition admits exactly one finite item and rejects playlists/collections and live or non-finite streams.

- Evidenced by example test.
- Source: `AGENTS.md`: “Keep media acquisition to one authorized, accessible, finite, non-DRM item. Reject playlists, live streams”
- Evidence: `src/media/archive.test.ts`, `src/media/args.test.ts`, `src/media/metadata.property.test.ts`, `src/media/metadata.test.ts`, `src/media/source-router.property.test.ts`, `src/media/yt-dlp.test.ts`
- Assumptions: `filesystem-atomic-rename`, `media-tools`
- Not verified:
  - Only the enumerated example cases are checked.
  - Probe and capture are separate yt-dlp calls, and capture does not recheck live or DRM status.

#### `media-reject-drm-auth-bypass`

Media acquisition rejects affirmative DRM, unsupported authentication, and access-control bypasses, and Ghostget never supplies decryption keys or bypass flags to media tools.

- Evidenced by example test.
- Source: `AGENTS.md`: “affirmative DRM, unsupported authentication, and access-control bypasses.”
- Evidence: `src/media/archive.test.ts`, `src/media/metadata.test.ts`, `src/media/yt-dlp.test.ts`
- Assumptions: `filesystem-atomic-rename`, `media-tools`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `media-promote-only-after-verification`

A media item is promoted only after its inspectable archive, versioned manifest, and SHA-256 records pass complete verification; a revision chain has exactly one head.

- Planned: Quint model with production trace replay in plan Phase 4.
- Source: `AGENTS.md`: “Promote an item only after its inspectable archive, versioned manifest, and SHA-256 records pass complete verification.”
- Evidence: `scripts/verification-media-replay.test.ts`, `src/media/archive.property.test.ts`, `src/media/archive.test.ts`, `src/media/lock.test.ts`, `src/media/manifest.property.test.ts`, `src/media/manifest.test.ts`, `src/media/revision.property.test.ts`, `verification/quint/media.qnt`
- Assumptions: `filesystem-atomic-rename`, `media-tools`
- Not verified: verification/quint/media.qnt and its production replay check that promotion needs the current lock and that only a torn head leaves the lineage, but they take discovery's verification verdict as given. The law "a promoted item passed closed verification" is not yet a model invariant, so this claim stays planned; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `media-crash-lineage-progress`

Each capture subject has one revision lineage with a single head, and a crash or power loss during staging or promotion never leaves that lineage permanently invalid.

- Planned: Quint model with production trace replay in plan Phase 4.
- Source: `kb/plans/formal-verification-assurance.md`: “The progress property "a crash never makes a lineage permanently invalid" drives D10.”
- Evidence: `scripts/verification-media-replay.test.ts`, `src/media/archive.property.test.ts`, `src/media/archive.test.ts`, `src/media/lock.test.ts`, `src/media/manifest-durability.test.ts`, `src/media/quarantine.test.ts`, `src/media/revision.property.test.ts`, `src/media/revision.test.ts`, `verification/quint/media.qnt`
- Assumptions: `filesystem-atomic-rename`, `filesystem-durability`, `process-liveness`, `media-tools`
- Not verified:
  - The progress property is not checked. verification/quint/media.qnt checks only safety: its production replay repairs a torn head by quarantine and recaptures, and the stepQuarantineAny variant shows why only a torn head may be moved. A liveness check under fairness is still scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.
  - Plan defect D10 is fixed: the staging tree and its parent directories are fsynced before and after the promotion rename, and a start that finds a torn head moves it to the quarantine instead of stopping the lineage.
  - F_FULLFSYNC runs in the macOS CI job; on Linux and on filesystems that refuse it, the flush falls back to fsync, which gives no drive-cache guarantee.
  - Repair quarantines at most one torn head per capture; the direct pipeline promotes durably but does not repair a torn head.
  - Quarantined revisions stay until their owner removes them; `ghostget media quarantine` lists them and removes nothing.

#### `media-lock-exclusion`

Media item locks exclude concurrent owners; release never removes a replacement lock and final publication is an atomic same-volume rename.

- Evidenced by Quint model with production trace replay.
- Source: `SECURITY.md`: “Media locks coordinate Ghostget processes, and final publication uses an atomic same-volume rename.”
- Evidence: `scripts/verification-media-replay.test.ts`, `src/media/lock.test.ts`, `verification/quint/media.qnt`
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`, `process-liveness`, `media-tools`
- Not verified:
  - verification/quint/media.qnt checks two processes on one revision lineage to Quint simulation depth 12 and Apalache length 8. Its noPromotionWithoutLock invariant restates the guard at the rename, so the checkers show only that the unfenced variant breaks it; noForeignRevision is the lock law the model derives, and the replay is what binds the guard to production. Its ITF replay drives production mediaUrl and the item lock with 300 traces in one test process, not the plan's 1,000: on the CI runner 1,000 traces took 159 seconds and pushed the verification step to 13.6 minutes. In the replay, runs interleave at the capture and flush gates, a crash rewrites the lock to a dead PID, and heartbeat loss is an aged lock file. Truly concurrent processes, other filesystems, and network volumes are not exercised.
  - The atomicity of a same-volume rename is an assumption (filesystem-atomic-rename), not a checked property.
  - Plan defect D11 is fixed: promotion renames only through the lock's fence, which checks the token and inode immediately before the rename, and a stale heartbeat is reclaimable even when its PID answers. The Quint variant stepUnfenced reproduces the unfenced rename, and the replay shows production refuses each of its violating traces.

#### `media-cancellation-stops-work`

Cancelling a media acquisition stops every process it started, including ffmpeg and HLS grandchildren; a cancellation that arrives before promotion prevents a `created` result, both pipelines discard staging on every error, and when Ghostget exits or receives an unhandled SIGINT, SIGTERM, or SIGHUP it kills every active media process group.

- Evidenced by example test.
- Source: `kb/plans/formal-verification-assurance.md`: “D9: spawn in a process group and kill the group. Check cancellation before promotion.”
- Evidence: `scripts/verification-media-replay.test.ts`, `src/media/archive.test.ts`, `src/media/process-group.test.ts`, `src/media/process-parent-exit.test.ts`, `src/media/process.test.ts`, `verification/quint/media.qnt`
- Assumptions: `filesystem-atomic-rename`, `media-tools`
- Not verified:
  - Only the enumerated example cases are checked; the grouped-termination property samples scripted exit points, not every signal interleaving.
  - A SIGKILL of Ghostget itself, or a kernel or power failure, runs no exit handler, so a detached media tool group can outlive it.
  - A signal Ghostget inherited as ignored, such as SIGHUP under nohup, stays ignored, so the group keeps running until Ghostget exits for another reason.
  - The group kill reaches only processes that stay in the tool's process group; a helper that calls setsid() or setpgid() leaves the group and is not stopped.
  - On Windows media tools run without a process group, so only the direct child is signalled.
  - Plan defect D9 is fixed: yt-dlp runs in its own process group and cancellation signals the group, and the promotion fence checks cancellation immediately before the rename. verification/quint/media.qnt checks that a cancelled yt-dlp capture never answers created, its stepLateCancel variant reproduces the pre-fix promotion, and its replay drives production mediaUrl. The direct HTTP pipeline and grandchild process termination are not modelled.

#### `media-verify-recomputes-hashes`

`ghostget verify` recomputes SHA-256 records and detects later archive changes.

- Evidenced by example test.
- Source: `SECURITY.md`: “SHA-256 records that `ghostget verify` recomputes”
- Evidence: `src/media/archive.test.ts`, `src/media/cli.test.ts`
- Assumptions: `filesystem-atomic-rename`, `media-tools`
- Not verified: Only the enumerated example cases are checked.

#### `media-no-shell-no-ambient-config`

Media tools are invoked with an argv array without a shell, and ambient yt-dlp configuration is ignored unless explicitly selected.

- Evidenced by example test.
- Source: `SECURITY.md`: “Ghostget invokes media tools without a shell, ignores ambient yt-dlp configuration unless the user explicitly selects that mode”
- Evidence: `src/media/args.test.ts`, `src/media/process.test.ts`, `src/media/yt-dlp.test.ts`
- Assumptions: `filesystem-atomic-rename`, `media-tools`
- Not verified: Only the enumerated example cases are checked.

#### `media-no-persist-transport-secrets`

Media archives never persist cookies, request headers, signed media URLs, raw yt-dlp metadata, or transport fragments; diagnostics redact URL paths and credentials.

- Evidenced by example test.
- Source: `SECURITY.md`: “does not persist cookies, request headers, signed media URLs, raw yt-dlp metadata, or transport fragments”
- Evidence: `src/media/archive.test.ts`, `src/media/metadata.test.ts`, `src/media/process.test.ts`
- Assumptions: `filesystem-atomic-rename`, `media-tools`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `direct-media-fixed-role-names`

The direct-media adapter reads a bounded range, identifies media from bytes, and stores fixed role names rather than URL basenames.

- Evidenced by property test.
- Source: `SECURITY.md`: “It reads a bounded range, identifies media from bytes, and stores fixed role names instead of URL basenames.”
- Evidence: `src/media/archive.property.test.ts`, `src/media/http-capture.test.ts`, `src/media/http-probe.property.test.ts`
- Property tests: `src/media/http-probe.property.test.ts`: “property: chunk partitioning cannot hide bytes beyond the probe declaration”; `src/media/archive.property.test.ts`: “property: opaque raw IDs never enter archive or focused path segments”
- Assumptions: `filesystem-atomic-rename`, `media-tools`
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `transcription-setup-no-download`

Local transcription setup never downloads whisper.cpp, its model, or libraries, and rechecks the selected executable, model, and observable runtime closure.

- Evidenced by example test.
- Source: `SECURITY.md`: “Ghostget records and rechecks the selected executable, model, and observable non-platform runtime closure”
- Evidence: `src/media/local-transcription.test.ts`, `src/media/runtime-closure.test.ts`, `src/media/transcriber-config.test.ts`
- Assumptions: `filesystem-atomic-rename`, `media-tools`
- Not verified: Only the enumerated example cases are checked.

#### `media-identity-hashes-match-golden-vectors`

The media provider identity and source asset key, the authorization-context digest, the native runtime closure digest, the retained revision content digest, and UTF-8 byte ordering reproduce golden vectors from an independent Python generator.

- Evidenced by differential oracle.
- Source: `kb/plans/formal-verification-assurance.md`: “Commit Python-generated golden vectors for hashes and encodings to `verification/vectors/`.”
- Evidence: `verification/vectors/generate.py`, `verification/vectors/hashes.json`, `scripts/verification-vectors.test.ts`
- Assumptions: `sha256`
- Not verified:
  - The vectors are a fixed corpus; they pin the byte layout, not a property of all inputs.
  - Injectivity of the length framing is `hash-framing-injective`, which Phase 5 addresses.

### `messaging` (10 claims)

#### `messaging-composite-ordered-prefix`

A messaging turn is one composite confirmation and one ordered, prefix-durable run: the accepted prefix is monotone, at most one part is dispatching or indeterminate, and no part is redispatched.

- Evidenced by Quint model with production trace replay.
- Source: `SECURITY.md`: “A messaging turn is one composite confirmation and one ordered, prefix-durable run.”
- Evidence: `scripts/verification-messaging-replay.test.ts`, `src/messaging-action-store.test.ts`, `src/messaging-confirmation-recovery.test.ts`, `src/messaging-provider-identity-collision.test.ts`, `src/messaging-runtime-composite.test.ts`, `src/messaging-runtime-execution.test.ts`, `verification/quint/messaging.qnt`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified:
  - The Quint model covers one run of three parts; Apalache checks it to depth 10 and seeded simulation samples 2,000 runs of up to 12 steps. Neither is a proof for longer runs or more parts.
  - The replay drives `transitionMessagingRun` and the runtime's `messagingRecoveryEvent` over 1,000 seeded traces. It does not cover the durable journal writes, file locking, or the provider adapters around them.
  - A provider history window may evict the accepted prefix before recovery reads it.

#### `messaging-recovery-model`

Beeper and Message Like Me recovery retain a live or indeterminate owner and never reclaim it until death is proved.

- Planned: stateful model in plan Phase 4.
- Source: `kb/plans/formal-verification-assurance.md`: “Add a `fc.commands` model for Beeper and Message Like Me recovery.”
- Evidence: `src/beeper-message-like-me-recovery.test.ts`
- Assumptions: `filesystem-durability`, `process-liveness`, `provider-behaviour`
- Not verified: The stateful model for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `messaging-stop-on-drift`

Before every remaining part, current provider state is rechecked and the run stops on foreign activity, edit, retraction, participant or provider drift, permanent failure, partial work, or possible completion.

- Planned: stateful model in plan Phase 4.
- Source: `SECURITY.md`: “Ghostget checks current provider state before every remaining part and stops on foreign activity, edit, retraction, participant drift, provider drift”
- Evidence: `src/messaging-automation.test.ts`, `src/messaging-runtime-execution.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: The stateful model for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `messaging-transition-inductive`

The messaging run reducer invariant is inductive under transitionMessagingRun.

- Evidenced by Lean proof with differential test.
- Source: `kb/plans/formal-verification-assurance.md`: “The same inductive-invariant proof for `transitionMessagingRun`.”
- Evidence: `verification/lean/GhostgetVerification/MessagingRun.lean`, `verification/lean/Differential.lean`, `scripts/verification-lean-oracle.ts`, `scripts/verification-lean-messaging-run.test.ts`, `src/messaging-action-store.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified:
  - The proof is about a Lean model of assertRun, the structural checks of parseRun, and transitionMessagingRun. The differential test ties the model to the TypeScript on generated runs of up to eight parts only; it is not a proof that the TypeScript equals the model.
  - The transition's own guards do not preserve the invariant alone: an accepted part whose provider message ID repeats one in the accepted prefix is rejected only by the final parseRun. The production-shape theorem holds by construction, because the model rechecks the invariant; the substantive results are that the guarded step keeps the invariant outside that event and that the final parse rejects exactly that event.
  - Part text, digests, reply references, delivery and read fields, context evidence, encryption, durable storage, and the compare-and-swap write in updateMessagingRun are outside the model.

#### `messaging-uncertain-not-resubmitted`

Cancellation never proves an already-started action was unsent; uncertain submits are reconciled by exact run identity and never resubmitted.

- Planned: stateful model in plan Phase 4.
- Source: `docs/messaging-automation.md`: “reconcile its exact run identity without resubmitting uncertain work.”
- Evidence: `src/beeper-message-like-me-recovery.test.ts`, `src/messaging-automation.test.ts`, `src/messaging-confirmation-recovery.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: The stateful model for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `messaging-capability-io-private`

Messaging route, context, reply, and provider references enter only through stdin or owner-only files and leave only through explicit atomic mode-0600 artifacts, never argv or ordinary output.

- Evidenced by example test.
- Source: `SECURITY.md`: “These values enter through stdin or checked owner-only files and leave only through explicit atomic mode-`0600` artifacts.”
- Evidence: `src/args.test.ts`, `src/messaging-private-output-boundary.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

#### `messaging-encrypted-no-plaintext-fallback`

Messaging route, context, preview, and execution state is encrypted at rest with authenticated reference binding; authentication failure, expiry, generation drift, or implementation drift makes records unusable and never falls back to plaintext.

- Evidenced by example test.
- Source: `SECURITY.md`: “Ghostget encrypts route, context, preview, and execution state at rest”
- Evidence: `src/cursor-token.test.ts`, `src/messaging-action-store.test.ts`, `src/messaging-runtime-execution.test.ts`, `src/messaging-store.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

#### `messaging-output-outside-state-root`

Explicit messaging output paths are distinct from each other and outside the Ghostget state root, so plaintext exports cannot replace keys, plans, runs, or receipts.

- Evidenced by example test.
- Source: `SECURITY.md`: “Explicit messaging output paths must be distinct and outside the Ghostget state root”
- Evidence: `src/messaging-private-output-boundary.test.ts`, `src/messaging-runtime-composite.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

#### `messaging-automation-grant-scoped`

The owner messaging host requires explicit allow grants for messaging.automation.* operations; old messaging.send allow, ask, deny, or unmanaged policy provide no unattended authority, and changed manifests or closures invalidate grants.

- Evidenced by example test.
- Source: `docs/messaging-automation.md`: “An old `messaging.send` allow does not authorize this host. `ask`, `deny`, and an unmanaged policy do not provide unattended authority.”
- Evidence: `src/messaging-automation-server.test.ts`, `src/messaging-automation.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

#### `messaging-automation-bounds`

The messaging automation protocol rejects a second ordinary in-flight request and enforces frame (24 MiB), response (32 MiB), and asset (16 MiB each, 64 MiB total, 32 entries, canonical Base64 with checked SHA-256) bounds.

- Evidenced by example test.
- Source: `docs/messaging-automation.md`: “Frames are bounded to 24 MiB; responses to 32 MiB. Assets use canonical Base64 and a checked SHA-256, at most 16 MiB each, 64 MiB total and 32 entries.”
- Evidence: `src/messaging-automation-server.test.ts`, `src/messaging-automation.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

### `mutations` (11 claims)

#### `mutation-exact-preview-confirmation`

A mutation dispatches only after an exact preview and a confirmation whose digest binds that preview; each plan is consumed exactly once, and expired, drifted, or altered plans are consumed without dispatch.

- Planned: stateful model in plan Phase 4.
- Source: `AGENTS.md`: “Keep mutations behind exact preview, confirmation, durable dispatch, and at-most-once evidence.”
- Evidence: `src/confirmed-write-program.test.ts`, `src/control/menubar-cli.test.ts`, `src/messaging-runtime-composite.test.ts`, `src/providers/x.test.ts`, `src/runtime.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: The stateful model for this claim is scheduled for plan Phase 4; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `confirmed-write-at-most-once`

For every intent (account realm, provider target, operation id, canonical input), provider effects are at most 1 + duplicate successors, including across reconnect and manifest-hash changes.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “durable dispatch, and at-most-once evidence.”
- Evidence: `scripts/verification-fence-replay.test.ts`, `src/confirmed-write-intent-fence.test.ts`, `src/run-journal.property.test.ts`, `src/run-journal.test.ts`, `src/runtime.test.ts`, `verification/quint/fence.qnt`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified:
  - The model is bounded: three runs of one intent under two auth locators that may each record one provider subject or none, one reconnect and one manifest upgrade (one auth generation counter serves both locators), one duplicate-risk successor per source run (a successor may itself be a source), 5,000 simulated samples of up to 12 steps, and Apalache to length 8.
  - Across locators the account realm is the recorded provider subject, which the operator may type: two locators that record one subject are fenced as one account even when they are not, so the cross-locator fence can only refuse more. Runs with no recorded subject, including every journal written before journals kept it, are fenced per locator only, and a succeeded run under another locator neither fences nor replays.
  - The replay drives every seeded trace through the pure fence cores with an in-memory store, and five of them, a greedy cover of every action result the seeded traces take, through the file-backed state layer on a real state home: `createRunJournal`, `updateRunJournal`, `listRunJournalSnapshots`, `acquireConfirmedWriteLedgers` (the intent ledger, then the hash-keyed ledger), `repairInterruptedRunJournals` with its receipt and ledger projection, and `releaseReconciledRunRecovery`. It does not run the `confirmInvocation` program, so plan validation, recovery capsules, and `claimDuplicateRiskSource`'s receipt, capsule, and ledger rechecks are covered only by the listed example tests.
  - Owner acceptance of the duplicate risk, the preview's successor check, election of a source across a same-subject reconnect (the model's source must bind the current auth record), and a successor whose election fails at its dispatch boundary are not modelled; the model disables that dispatch, and the listed example tests cover production failing the run before any request.
  - The dedupe window's expiry, partial multi-dispatch runs, and journals from before the intent fence are not modelled.

#### `indeterminate-never-retried`

An indeterminate (post-dispatch uncertain) mutation is never retried; a lost acknowledgement never permits another remote submission.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “Never retry or clear an indeterminate dispatch”
- Evidence: `scripts/verification-fence-replay.test.ts`, `src/confirmed-write-intent-fence.test.ts`, `src/control/gateway.test.ts`, `src/derive.test.ts`, `src/imessage-direct-plugin.test.ts`, `src/linked-device-lifecycle-journal.test.ts`, `src/linked-device-lifecycle-runtime.test.ts`, `src/portable-run-recovery.test.ts`, `src/run-journal.property.test.ts`, `src/runtime.test.ts`, `verification/quint/fence.qnt`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified:
  - The fence model checks the confirmed-write path (`posts.publish`-shaped R3 web-session writes with one planned dispatch): no intent is dispatched twice, and a later dispatch of the same effect is only an elected duplicate-risk successor of an indeterminate source. It is bounded to three runs, one reconnect, one manifest upgrade, 5,000 simulated samples of up to 12 steps, and Apalache to length 8.
  - The replay drives the fence cores on every seeded trace and the file-backed journal, ledger, repair, and reconciliation layer on a five-trace cover of their action results, not the `confirmInvocation` program, the provider transports, or owner acceptance of the duplicate risk.
  - Linked-device lifecycle, local CLI, iMessage, derive, and control-gateway paths, and partial multi-dispatch runs, are covered only by the listed example and property tests.

#### `indeterminate-cleared-only-by-evidence`

An indeterminate dispatch fence is released only from separately obtained exact evidence (plugin readback or owner approval), never from caller-typed hashes.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “reconcile it from separately obtained exact evidence.”
- Evidence: `scripts/verification-fence-replay.test.ts`, `src/ghostget.test.ts`, `src/portable-run-recovery.test.ts`, `src/provider-plugin-portable-runtime.test.ts`, `src/provider-plugin-reconciliation.property.test.ts`, `src/run-journal.test.ts`, `src/web-session-recovery.test.ts`, `verification/quint/fence.qnt`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified:
  - The fence model abstracts the evidence: one reconcile action stands for applied plugin readback or owner approval. The in-memory replay checks that `reconciledRecoveryRelease` and `transitionRunJournal` settle a reconciled run and keep its ledger; the file-backed replay settles it through `releaseReconciledRunRecovery`. That a source with an elected successor keeps its recovery material is covered only by the listed example tests.
  - The replay does not call `recordNotAppliedClaim`: its not-applied action changes no journal in the replay world, so that `recordNotAppliedClaim` releases nothing is covered only by the listed example tests.
  - The web-session reconciler and the CLI and portable parsers of reconciliation input are covered only by the listed example and property tests.
  - Terminalizing a run from supplied evidence says nothing about provider liveness.

#### `recovery-auth-continuity`

Reconciliation and duplicate-risk successor election accept a current auth record other than the run's exact record only when it keeps the locator ID and kind and names the provider subject that the run's encrypted recovery capsule recorded; a capsule with no recorded subject still needs the exact record.

- Evidenced by property test.
- Source: `docs/effect-confirmed-write-runtime.md`: “locator ID and kind and names the provider subject that the run's encrypted recovery capsule recorded.”
- Evidence: `src/confirmed-write-intent-fence.test.ts`, `src/provider-plugin-portable-runtime.test.ts`, `src/recovery.test.ts`, `src/runtime.test.ts`, `src/web-session-recovery.test.ts`
- Property tests: `src/recovery.test.ts`: “property: only exact bytes or the recorded provider subject continue a run's realm”
- Assumptions: `encryption`, `provider-behaviour`, `same-user-trusted`
- Not verified:
  - The check compares subject strings. That one subject names one provider account rests on how the auth record's subject was bound, by a plugin subject probe or by the operator; a subject typed onto another account's credentials is not detected here.
  - The property test samples the pure `recoveryAuthContinuity` decision; its use by the web-session reconciler, the portable reconciler, and successor election is covered only by the listed example tests.
  - The intent fence stays keyed by locator ID for fulfilled runs: a fulfilled run under other auth bytes is still withheld rather than replayed. Only an unsettled run that recorded the same subject under another locator fences across locators (claim `intent-fence-subject-across-locators`).

#### `intent-fence-subject-across-locators`

New run journals record the provider subject their auth record named; before dispatch, the confirmed-write fence also refuses while an unsettled run of the same provider target, operation, canonical input, and duplicate-risk source recorded the same subject under a different auth locator, both in its journal scan and in a recheck after its own claim is on record. Journals without a subject keep the per-locator fence and stay valid.

- Evidenced by Quint model with production trace replay.
- Source: `docs/effect-confirmed-write-runtime.md`: “the fence also refuses while an unsettled run of the same provider target, operation, and canonical input”
- Evidence: `scripts/verification-fence-replay.test.ts`, `src/confirmed-write-intent-fence.test.ts`, `src/run-journal.test.ts`, `verification/quint/fence.qnt`
- Assumptions: `filesystem-durability`, `same-user-trusted`
- Not verified:
  - Subjects are compared as strings. The operator may type a subject, so two locators that record one subject are fenced as one account even when they are not; this only refuses more. Two locators of one account with no recorded subject, or a run recorded before journals kept the subject, are not fenced against each other.
  - Two runs that race past their scans may both refuse at the recheck; neither dispatches, and each is retried after the other settles. No progress law is checked.
  - The fence model has two locators, one subject, three runs, 5,000 simulated samples of up to 12 steps, and Apalache to length 8; the replay drives the subject scan and recheck through the pure fence cores and a five-trace file-backed cover, not the `confirmInvocation` program, which the listed example tests cover.
  - A succeeded run under another locator neither fences nor replays across locators, by design.

#### `intent-fence-readback`

`ghostget doctor` reads every confirmed-write intent claim back against its run journal without writing, reports malformed, orphaned, stale, drifted, misplaced, and repeated claims as unhealthy, and names claims and runs only by opaque key and run ID.

- Evidenced by example test.
- Source: `docs/effect-confirmed-write-runtime.md`: “`ghostget doctor` reads the fence back without writing, after its repair pass.”
- Evidence: `src/confirmed-write-intent-fence.test.ts`, `src/ghostget.test.ts`
- Assumptions: `filesystem-durability`, `same-user-trusted`
- Not verified:
  - The readback is not modelled; only the listed example tests cover it, and they plant an orphaned, a malformed, and an off-chain claim but not every issue kind.
  - The readback reads at most 10,000 directory entries and then reports itself truncated; it does not re-derive the hash-keyed ledgers.
  - Doctor runs its journal repair pass before the readback, so the readback describes the state after that repair.

#### `durable-boundaries-before-dispatch`

Confirmation claim, plan consumption, provisional receipt, idempotency ledger, and recovery capsule reach durable storage before remote dispatch; dispatch is refused if the capsule cannot be stored.

- Evidenced by stateful model.
- Source: `docs/effect-confirmed-write-runtime.md`: “Confirmation claims, plan consumption, provisional receipt, idempotency ledger and recovery capsule must reach their existing durable boundaries before remote dispatch.”
- Evidence: `src/confirmed-write-program.test.ts`, `src/runtime.test.ts`, `src/state-crash-harness.fixture.ts`, `src/state-crash-harness.test.ts`, `src/state-crash-port.test-support.ts`, `src/state-crash-preload.test-support.ts`
- Property tests: `src/state-crash-harness.test.ts`: “a crash just before a durable boundary never repeats or forgets a crossing”; `src/state-crash-harness.test.ts`: “a crash just after a durable boundary never repeats or forgets a crossing”; `src/state-crash-harness.test.ts`: “a torn data write never repeats or forgets a crossing”; `src/state-crash-harness.test.ts`: “power loss at a durable boundary never repeats or forgets a crossing”
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified:
  - The crash harness samples its schedules: CI runs one fast-check schedule of up to four commands per crash mode, each crashing at one generated boundary, so it does not visit every boundary of every operation.
  - Crashes land only on the state and path helpers' filesystem effects. Writes the runtime process makes directly, such as the provider-effect ground truth, are outside the crash port.
  - Power loss is modelled by the port, not observed: it rolls back, newest first, created, linked, renamed, and unlinked entries whose directory was not fsynced after the effect, and truncates data not fsynced after its write. Directory tree removals are treated as durable when they return, and a real filesystem may keep or lose unsynced effects in other combinations.
  - One runtime process mutates the state at a time; concurrent confirmations under crash are not modelled here.
  - The harness checks outcomes: no crossing repeats, none is forgotten, and a crossing leaves a durable started journal. It does not check separately that each named record (claim, plan consumption, receipt, ledger, capsule) was durable, and it re-confirms with a freshly saved plan, so replaying a consumed plan digest after a crash is not exercised.
  - That dispatch is refused when the recovery capsule cannot be stored rests on the listed example tests only.

#### `journal-stale-writer-rejected`

Dispatch callbacks persist transitions against one current journal cell; a stale or competing callback cannot reuse an older journal snapshot (content-hash CAS).

- Evidenced by property test.
- Source: `docs/effect-confirmed-write-runtime.md`: “A stale or competing callback cannot reuse an older journal snapshot.”
- Evidence: `src/confirmed-write-program.test.ts`, `src/run-journal.property.test.ts`, `src/run-journal.test.ts`
- Property tests: `src/run-journal.property.test.ts`: “a lost native acknowledgement never permits a stale journal write in a bounded dispatch schedule”
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `journal-invariant-inductive`

assertJournalInvariants is inductive under transitionRunJournal and dispatch counters are monotone; skipped, duplicate, or contradictory progress is rejected.

- Evidenced by Lean proof with differential test.
- Source: `kb/plans/formal-verification-assurance.md`: “`assertJournalInvariants` is inductive under `transitionRunJournal`, and the dispatch counters are monotone.”
- Evidence: `verification/lean/GhostgetVerification/RunJournal.lean`, `verification/lean/Differential.lean`, `scripts/verification-lean-oracle.ts`, `scripts/verification-lean-run-journal.test.ts`, `src/run-journal.property.test.ts`, `src/run-journal.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified:
  - The proof is about a Lean model of assertJournalInvariants, the parseDispatch bounds, and transitionRunJournal. The differential test ties the model to the TypeScript on generated journals and events only; it is not a proof that the TypeScript equals the model.
  - The transition's own guards do not preserve the invariant alone: an explicit no-op success before the confirmation is consumed and a duplicate successor naming its own run are rejected only by the final parseRunJournal. The production-shape theorem holds by construction, because the model rechecks the invariant; the substantive results are that the guarded step keeps the invariant outside those two events and that the final parse rejects exactly those two.
  - Adapter, auth, owner identity, digests, the final origin, error text, the 64 KiB bound, durable storage, and the compare-and-swap write in updateRunJournal are outside the model.

#### `public-rejection-preserved`

The confirmed-write public boundary preserves the exact selected rejection value, including undefined, null, and other falsey values.

- Evidenced by example test.
- Source: `docs/effect-confirmed-write-runtime.md`: “The public boundary keeps the exact selected rejection, including `undefined`, `null` and other falsey values.”
- Evidence: `src/confirmed-write-program.test.ts`
- Assumptions: `filesystem-durability`, `provider-behaviour`
- Not verified: Only the enumerated example cases are checked.

### `npm` (17 claims)

#### `npm-publish-after-canonical-only`

publish_npm runs only after verify, attest and publish succeed (the immutable GitHub Release exists) and publishes the identical canonical bytes; canonical publication has no dependency on npm.

- Evidenced by example test.
- Source: `AGENTS.md`: “The same tag Release run then publishes the identical canonical bytes to npm”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified:
  - The test checks the job graph: `publish_npm` transitively needs exactly `authorize`, `verify`, `attest`, and `publish`, no canonical job needs an npm job, and no job or step carries an `if:` or `continue-on-error` that could run npm after a failed prerequisite or let a canonical job succeed without its work. That GitHub skips a job whose needed jobs did not succeed is the `github-enforcement` assumption.
  - The identical-bytes half rests on the enumerated example tests of the npm job's artifact-by-ID, archive-hash, and canonical-Release re-read steps.

#### `npm-failure-never-blocks-canonical`

An npm failure never unpublishes or blocks the GitHub Release.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “an npm failure is rerun from the same run and never blocks canonical publication.”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/verification-release-replay.test.ts`, `verification/quint/release.qnt`
- Assumptions: `github-api`, `npm-registry`
- Not verified:
  - The model takes the job order (npm after the immutable Release) from the `needs` of `.github/workflows/release.yml`; it does not check that workflow file.
  - The replay drives the publisher handoff, promotion authority, and canonical download validators. The draft, resume, and Latest convergence of `publishCanonicalRelease` are modeled but not replayed.
  - The model covers one run of up to three attempts; Apalache checks it to depth 10 and seeded simulation samples 2,000 runs of up to 12 steps.

#### `npm-failure-never-blocks-promotion`

A Release attempt that published the canonical Release and then failed a later npm job can still be promoted to the website through manual recovery: its authority resolution and the canonical download admit that attempt only through its bounded job inventory proving the four canonical jobs succeeded, and after a re-run of all jobs, only through the earlier receipt attempt that the Release body names, whose own inventory must prove all four, or, when that receipt attempt attested but did not publish, through one of at most three exact intermediate attempts of the same run whose own attempt record and inventory prove all four. Automatic promotion admits only a first attempt that succeeded.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “Manual recovery requires a positive current attempt and admits an unsuccessful latest attempt only through that attempt's own bounded job inventory proving all four or, when that attempt did not publish, through the earlier receipt attempt that the Release body names, whose own bounded inventory must prove all four”
- Also covers: `AGENTS.md`: “when that receipt attempt attested but did not publish, through one of at most three attempts strictly between it and the latest whose own attempt record binds the exact owner actors, repository, workflow ID and path, tag push, tag, SHA, and completion and whose own complete bounded inventory proves all four; a wider gap fails closed, and the mutable body only selects which inventories to read.”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/verification-release-replay.test.ts`, `verification/quint/release.qnt`
- Assumptions: `github-api`, `npm-registry`
- Not verified:
  - The shell gate in `.github/workflows/website-production.yml` that limits automatic promotion to a successful first attempt is outside the model and its replay. The model lets automatic promotion admit any successful latest attempt, a superset of what the gate allows.
  - Promotion after an npm failure waits for an owner to dispatch manual recovery; the automatic path fails its first-attempt gate by design.
  - The model's `promotionNotBlocked` ghost flags a manual recovery or canonical download refusal whenever any attempt of the run proved all four canonical jobs, independent of the admission rule; the D8 and D15 mutants violate it, and the replay's verdict equality ties it to production. Recovery reads at most three attempts between the receipt attempt and the latest attempt and fails closed beyond that bound, so a Release published by an attempt followed by more than three further reruns cannot be promoted; the model's three attempts never reach that bound, which only the example tests cover.
  - The replay serves synthetic run, job inventory, and Release responses to `resolveReleaseAuthority`; it does not exercise the deadline, pagination, or main-branch ancestry reads.
  - The model covers one run of up to three attempts; Apalache checks it to depth 10 and seeded simulation samples 2,000 runs of up to 12 steps.

#### `npm-reauthorize-before-oidc`

Before npm setup or OIDC minting, publish_npm reauthorizes the current attempt identically to the GitHub publisher (actor and triggering_actor 894119, repository 1316443113, workflow 323493609 at its path, protected tag, verified SHA, main ancestry); delegated reruns fail closed.

- Evidenced by example test.
- Source: `AGENTS.md`: “Before `publish_npm` sets up npm or mints OIDC, bind its current attempt—including both `actor` and `triggering_actor`—to owner User `894119`”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified: Only the enumerated example cases are checked.

#### `npm-job-checkout-free-minimal-permissions`

publish_npm is checkout-free, runs no product source, bun, scripts, NPM_TOKEN or NODE_AUTH_TOKEN, and declares exactly actions: read, contents: read, id-token: write.

- Evidenced by example test.
- Source: `docs/publishing.md`: “It is checkout-free, runs no product source or `bun install`, declares only `actions: read`, `contents: read`, and `id-token: write`”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified: Only the enumerated example cases are checked.

#### `npm-artifact-by-numeric-id-bound`

publish_npm downloads the attested artifact only by numeric artifact ID and binds all five files to the verify job's SHA-256 hashes and bundle digest, and the manifest to the verified source, tag, workflow, run and package, before handing off only archive and receipt.

- Evidenced by example test.
- Source: `AGENTS.md`: “Download the attested canonical artifact only by numeric artifact ID and bind all five files to the verify hashes and bundle digest.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `npm-clean-defaults-latest-tag`

Before publishing, ambient npm_config_tag is absent, user/global/project npm config is empty, pinned npm 11.19.0's default tag is proven to be latest, and npm publish runs without --tag.

- Evidenced by example test.
- Source: `AGENTS.md`: “Scrub ambient tag variables and project, user, and global npm configuration; prove pinned npm's clean default tag is `latest`;”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified: Only the enumerated example cases are checked.

#### `npm-admit-registry-identity-provenance`

@hraness/ghostget@<version> is advertised as available only after admit_npm proves the registry tarball matches the canonical archive and npm audit signatures binds publish and SLSA attestations to the tag push, verified commit and release.yml, within a bounded propagation window.

- Evidenced by example test.
- Source: `AGENTS.md`: “Require the exact public registry package and its npm provenance to match the canonical archive in `admit_npm` before advertising registry availability”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `sigstore`, `npm-registry`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `npm-no-token-no-staged-no-dispatch`

No npm token, staged publish, separate dispatch workflow, or human step follows the tag push; npm-stage.yml does not exist.

- Evidenced by example test.
- Source: `AGENTS.md`: “No dispatch, staged publish, token, or human step follows the tag push”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified: Only the enumerated example cases are checked.

#### `npm-no-content-policy`

The @hraness/ghostget package carries no contentPolicy declaration and no DISCLOSURE file.

- Evidenced by example test.
- Source: `AGENTS.md`: “the package carries no `contentPolicy` declaration and no `DISCLOSURE` file”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified: Only the enumerated example cases are checked.

#### `npm-reread-canonical-before-publish`

Immediately before npm publish, the immutable canonical Release is re-read by tag: immutable, non-draft, non-prerelease, Actions-bot author, exact source and attempt receipt, exactly five uploaded assets, and archive digest and size equal to the handed-off tarball; returned identity and integrity must match.

- Evidenced by example test.
- Source: `AGENTS.md`: “re-read the immutable canonical Release immediately before `npm publish` without `--tag`”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified: Only the enumerated example cases are checked.

#### `npm-packed-manifest-publication-settings`

The independently parsed packed manifest must have private omitted or false, no contentPolicy, no top-level tag, and publishConfig exactly {access: public, canonical registry}; scoped registries, proxies, credentials and any other publication setting are rejected.

- Evidenced by example test.
- Source: `AGENTS.md`: “permit no top-level `tag` plus only `publishConfig.access=public` and the canonical npm registry—reject scoped registries, proxies, credentials, and all other publication settings.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `npm-registry-state-admission`

npm mutation is admitted only when the version is absent and public latest is strictly older (publish), or the same version is public with the exact canonical dist.integrity (skip, no second write); every other state, including same version with different bytes or an unprovable registry state, fails closed.

- Evidenced by example test.
- Source: `AGENTS.md`: “Admit only an absent registry version newer than public `latest`, or the same version already public with the exact canonical integrity (skip without a second write); never overwrite a published version.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `npm-publish-at-most-once-per-version`

Across any sequence of attempts and reruns of a Release run, npm publish is issued at most once per version and a published version is never overwritten; an ambiguous write is resolved by readback, never blind retry.

- Planned: Quint model with production trace replay in plan Phase 4.
- Source: `docs/publishing.md`: “The workflow's `stable-release` concurrency group and npm's version immutability serialize publication”
- Evidence: `scripts/npm-publish-model.test.ts`, `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `npm-registry`
- Not verified:
  - The Quint model with production trace replay for this claim is scheduled for plan Phase 4.
  - The sampled rerun property in `scripts/npm-publish-model.test.ts` runs the real registry-admission and publish step scripts against a fake npm registry: each attempt issues at most one `npm publish`, only after an absent readback, never changes a held version, and never reports success after an ambiguous or failed write.
  - The statement does not hold as written when the registry readback lags: after a publish whose response was lost or malformed, a rerun that still reads the version as absent issues a second `npm publish` for it, and only npm's version immutability refuses it (the named test on registry lag). Evidencing the statement needs a durable per-version publish record or an owner-accepted restatement.

#### `npm-release-env-sole-reference`

Only the `publish_npm` job references the `npm-release` environment or mints an npm OIDC token; it is the sole environment in `release.yml`, and no other workflow names it.

- Evidenced by example test.
- Source: `AGENTS.md`: “Only `publish_npm` may reference it or mint an npm OIDC token”
- Evidence: `scripts/ci-pr-gate.test.ts`, `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `npm-registry`
- Not verified:
  - Only the enumerated example cases are checked.
  - The test covers `release.yml` only; plan Phase 6 adds the scan that no other workflow names the environment.

#### `npm-release-env-config`

GitHub environment npm-release has administrator bypass disabled, no reviewers, no secrets, sole protection rule branch_policy, and the single custom deployment policy tag v* with no branch admitted.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “Keep the `npm-release` environment fail closed: administrator bypass disabled, no reviewers, no secrets, sole protection rule `branch_policy`, and the single custom deployment policy `tag` `v*` with no branch admitted.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `npm-registry`, `administrator-readback`
- Not verified:
  - Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.
  - The listed tests check only the checked-in side of the contract.

#### `npm-trusted-publisher-binding`

The npm trusted publisher for @hraness/ghostget names exactly hraness/ghostget, release.yml and environment npm-release; no other relationship exists, package access requires 2FA and disallows tokens, and no npm token is stored in GitHub.

- Not verified; intended layer: configuration readback.
- Source: `AGENTS.md`: “the npm trusted publisher names `release.yml` and this environment.”
- Evidence: none
- Assumptions: `github-api`, `npm-registry`, `administrator-readback`
- Not verified: Live settings are confirmed only by administrator readback; CI cannot read them or detect drift.

### `parsing` (2 claims)

#### `strict-foreign-parsing`

Every foreign manifest, package, message, plan, receipt, response, and CLI value is parsed from `unknown` and rejects extra fields, malformed bounds, accessors, non-plain prototypes, ambiguous ownership, smuggled keys, and drift.

- Planned: property test in plan Phase 6.
- Source: `AGENTS.md`: “Parse every foreign manifest, package, message, plan, receipt, response, and CLI value from `unknown`; reject extra fields, malformed bounds, ambiguous ownership, and drift.”
- Evidence: `src/browser-admission.property.test.ts`, `src/contracts-check.test.ts`, `src/contracts-shape.test.ts`, `src/control/validation.test.ts`, `src/linked-device-lifecycle-journal.property.test.ts`, `src/local-cli-tool-identity.test.ts`, `src/provider-plugin-portable.property.test.ts`, `src/run-journal.property.test.ts`
- Assumptions: none beyond the register-wide scope
- Not verified:
  - The property test for this claim is scheduled for plan Phase 6; until then only the listed tests apply, and they cover only their enumerated or sampled cases.
  - Some exact-key checks compare comma-joined key lists, so a smuggled `"a,b"` key can pass; plan Phase 6 replaces them with one shared `exactKeys`.

#### `read-result-proto-roundtrip`

An own `__proto__` key in foreign JSON stays visible to exact-key parsing, and `parseInvokeReadResult` round-trips any JSON output, including objects with an own `__proto__` key.

- Evidenced by property test.
- Source: `kb/plans/formal-verification-assurance.md`: “D6: fix the `__proto__` round trip and promote seed 455347073 to a named test.”
- Evidence: `src/browser-admission.property.test.ts`, `src/contracts-invoke-read.test.ts`, `src/contracts-shape.test.ts`, `src/provider-plugin-registry-semantic.test.ts`
- Property tests: `src/contracts-invoke-read.test.ts`: “property: bounded arbitrary outputs round-trip; an unsupported key at any envelope path is rejected”
- Assumptions: none beyond the register-wide scope
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

### `plugins` (13 claims)

#### `portable-plugin-explicit-trust`

Portable plugin code executes only after an explicit trust decision bound to the exact verified content-addressed bundle; `plugin check` never executes plugin code.

- Evidenced by example test.
- Source: `AGENTS.md`: “require an explicit trust decision for the exact verified bundle.”
- Evidence: `src/args.test.ts`, `src/provider-plugin-lifecycle.test.ts`, `src/provider-plugin-package.test.ts`, `src/provider-plugin-store.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `portable-host-capability-denial`

The portable child-process host denies undeclared capabilities, foreign origins, and out-of-bound results, and executes only the verified runtime bytes even if the installed path is rewritten.

- Evidenced by example test.
- Source: `AGENTS.md`: “Treat portable child-process execution as ordinary-failure containment”
- Evidence: `src/provider-plugin-host.test.ts`, `src/provider-plugin-portable-runtime.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `catalog-unique-ownership`

The validated active catalog rejects duplicate plugin, route, or operation ownership, independent of insertion order, before any command can use it.

- Evidenced by example test.
- Source: `AGENTS.md`: “Reject duplicate plugin, route, or operation ownership before a command can use it.”
- Evidence: `src/contracts-catalog.test.ts`, `src/operation-permission.property.test.ts`, `src/platform-catalog.property.test.ts`, `src/provider-plugin-portable-registry.test.ts`, `src/provider-plugin-registry.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `contract-hash-environment-invariant`

Built-in durable contract hashes are versioned and identical across package layout and execution environment.

- Evidenced by example test.
- Source: `AGENTS.md`: “Keep built-in durable contract hashes versioned and invariant across package layout and execution environment.”
- Evidence: `src/model.test.ts`, `src/provider-plugin-package.test.ts`, `src/provider-plugin-registry.test.ts`, `src/web-session-contracts.test.ts`
- Assumptions: `plugin-trusted`
- Not verified:
  - No property test covers this law yet; only the enumerated example cases are checked.
  - Nothing forces a contract version bump when the source closure changes.

#### `contract-closure-lazy-revalidation`

The source/dependency closure is derived automatically, snapshotted at registry startup, and revalidated before and after lazy runtime load; a changed closure is rejected rather than executed.

- Evidenced by example test.
- Source: `AGENTS.md`: “Derive the exact current source/dependency closure automatically, snapshot it at registry startup, and revalidate it before and after lazy runtime load”
- Evidence: `src/beeper-local-plugin.test.ts`, `src/provider-plugin-registry.test.ts`
- Assumptions: `plugin-trusted`
- Not verified:
  - Only the enumerated example cases are checked.
  - Revalidation compares disk bytes under a single-writer assumption, so an A→B→A edit between the checks passes.

#### `portable-identity-artifact-bound`

Portable-plugin identity is bound to its exact verified artifact; artifact tampering changes identity separately from the logical descriptor, and identity extensions are rejected.

- Evidenced by example test.
- Source: `AGENTS.md`: “Portable-plugin identity must remain bound to its exact verified artifact.”
- Evidence: `src/provider-plugin-portable-identity.test.ts`, `src/provider-plugin-portable-registry.test.ts`, `src/recovery.test.ts`, `src/run-journal.property.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `plugin-lifecycle-serialized`

Plugin update, disable, and removal are refused while the old bundle still owns live or unknown work (invocation leases, confirmations, run journals, recovery capsules, linked-device lifecycles).

- Planned: stateful model in plan Phase 2.
- Source: `docs/plugins.md`: “Ghostget refuses a transition while the old bundle still owns live or unknown work.”
- Evidence: `src/provider-plugin-invocation-lease.property.test.ts`, `src/provider-plugin-invocation-lease.test.ts`, `src/provider-plugin-lifecycle-kernel.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: The stateful model for this claim is scheduled for plan Phase 2; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `portable-pack-reproducible`

`plugin pack` verifies the fixed file set and produces reproducible, relocation-stable bytes; undeclared files are refused.

- Evidenced by example test.
- Source: `docs/plugins.md`: “`pack` verifies the fixed file set and produces reproducible bytes.”
- Evidence: `src/provider-plugin-lifecycle.test.ts`, `src/provider-plugin-package.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `portable-no-ambient-authority`

Portable plugins receive no shell, package manager, ambient environment, raw auth locator, unrestricted filesystem, redirect, automatic retry, or caller-chosen network primitive; native code and undeclared module imports are rejected.

- Evidenced by example test.
- Source: `docs/plugins.md`: “It receives no shell, package manager, ambient environment, raw auth locator”
- Evidence: `src/provider-plugin-host.test.ts`, `src/provider-plugin-import-analysis.test.ts`, `src/provider-plugin-module-analysis.test.ts`, `src/provider-plugin-package.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `portable-session-material-sinks`

Cookie material is bound only to a cookie jar and OAuth material only to the Authorization header, for exact-origin HTTPS with bounded bodies.

- Evidenced by example test.
- Source: `docs/plugins.md`: “opaque cookie material bound only to a cookie jar and OAuth material bound only to the Authorization header”
- Evidence: `src/provider-plugin-auth.test.ts`, `src/provider-plugin-host.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `portable-state-cas`

Versioned namespaced plugin state supports exact-byte compare-and-exchange so overlapping invocations cannot silently overwrite each other.

- Evidenced by property test.
- Source: `docs/plugins.md`: “Namespaced state supports exact-byte compare-and-exchange.”
- Evidence: `src/provider-plugin-portable-runtime.test.ts`
- Property tests: `src/provider-plugin-portable-runtime.test.ts`: “compare-exchange prevents concurrent lost updates and stale deletes”
- Assumptions: `plugin-trusted`
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `portable-cannot-declare-local-cli`

Portable protocol v1 packages cannot declare the local-cli transport or request native process authority.

- Evidenced by example test.
- Source: `docs/local-cli-providers.md`: “Portable plugin protocol v1 cannot declare `local-cli`.”
- Evidence: `src/provider-plugin-package.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: Only the enumerated example cases are checked.

#### `cleanup-unsafe-irreversible`

Once a cleanup barrier is marked unsafe, later native proof cannot reverse that settlement or release durable admission.

- Evidenced by example test.
- Source: `docs/effect-read-runtime.md`: “once it marks a barrier unsafe, later native proof cannot reverse that settlement or release the durable admission”
- Evidence: `src/provider-plugin-cleanup-barrier.test.ts`, `src/web-session-cleanup-admission.test.ts`
- Assumptions: `plugin-trusted`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

### `privacy` (3 claims)

#### `secrets-out-of-artifacts`

The code paths that the cited tests exercise keep raw authenticated traffic, cookies, tokens, profiles, private content, and local paths out of the receipts, logs, diagnostics, and captured evidence they produce.

- Evidenced by property test.
- Source: `AGENTS.md`: “Keep raw authenticated traffic, cookies, tokens, profiles, private content, and local paths out of Git, tests, receipts, logs, and diagnostics.”
- Evidence: `scripts/verification-tools.test.ts`, `src/auth-storage.test.ts`, `src/control/gateway.test.ts`, `src/control/interface-cli.test.ts`, `src/control/vault.test.ts`, `src/derive-review.test.ts`, `src/ghostget.test.ts`, `src/har-internal.test.ts`, `src/media/archive.test.ts`, `src/media/process.test.ts`, `src/run-journal.test.ts`
- Property tests: `src/har-internal.test.ts`: “property: arbitrary identifier-shaped path segments and JSON map keys never survive evidence”; `scripts/verification-tools.test.ts`: “never lets a replaced path, a marker, or a control character through”
- Assumptions: `same-user-trusted`, `encryption`
- Not verified:
  - Generated inputs are sampled at the configured run count; this is not a proof over all inputs.
  - Modules outside the cited tests are not checked, and nothing scans output for secrets in general.
  - Git history, test fixtures, and CI logs are not mechanically scanned.

#### `secrets-at-rest-encrypted-private`

Provider session material is stored encrypted with authenticated ciphertext and private modes, invalidated on auth incarnation rotation, and never re-keyed beside existing ciphertext.

- Evidenced by example test.
- Source: `README.md`: “Replacing or removing an auth locator rotates its local lifetime identity, so old projection and provider-session ciphertext cannot revive after recreation.”
- Evidence: `src/auth-storage.test.ts`, `src/nonstate-storage.test.ts`, `src/session-secrets.test.ts`
- Assumptions: `same-user-trusted`, `encryption`
- Not verified: Only the enumerated example cases are checked.

#### `confirmation-plans-encrypted`

Confirmation plan inputs are encrypted at rest with authenticated metadata; a missing or replaced key never causes key replacement or ciphertext overwrite.

- Evidenced by example test.
- Source: `skills/ghostget/references/social-platform-routing.md`: “Ghostget's plan owns encrypted confirmed input and attachment bundles for its lifecycle.”
- Evidence: `src/ghostget.test.ts`, `src/runtime.test.ts`
- Assumptions: `same-user-trusted`, `encryption`
- Not verified: Only the enumerated example cases are checked.

### `promotion` (24 claims)

#### `release-app-token-narrowed`

Every minted App token is requested and validated to carry exactly metadata:read, contents:write, workflows:write, name only repository 1316443113, and a bounded one-hour expiry.

- Evidenced by example test.
- Source: `AGENTS.md`: “Runtime must request and validate a token narrowed to Ghostget repository ID `1316443113`”
- Also covers: `website/AGENTS.md`: “Runtime must narrow and validate the minted token for Ghostget”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `release-app-token-revoked-exactly-once`

After the operation the helper sends exactly one DELETE /installation/token requiring 204 with zero body, then requires two stable 401 denials from the exact installation-repositories endpoint within a 30-second, at-most-ten-slot absolute schedule; a 200 after 401, nonconvergence, malformed or timing-ambiguous responses fail closed and nothing is retried.

- Evidenced by property test.
- Source: `AGENTS.md`: “send exactly one empty-204 revocation request and require two stable authorization denials”
- Also covers: `website/AGENTS.md`: “the shared helper must send exactly one empty-204 token revocation”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/release-app-token-revocation.test.ts`
- Property tests: `scripts/release-app-token-revocation.test.ts`: “property: exactly one DELETE, then two stable denials inside ten absolute slots and 30 seconds, or fail closed”; `scripts/release-app-token-revocation.test.ts`: “property: a minted token is revoked exactly once whatever fails, and an unminted token is never revoked”
- Assumptions: `monotonic-clock`, `github-api`, `github-enforcement`, `vercel`
- Not verified:
  - The properties drive `revokeReleaseAppTokenWithConvergence` and `withReleaseAppToken` with a fake fetch, clock, and sleeper; live revocation against GitHub is retained evidence from one workflow run, not a CI check.
  - GitHub does not guarantee how quickly a revoked token stops working.

#### `release-app-date-before-expiry`

The GitHub Date header on the DELETE 204 and on every accepted 200 or 401 observation is canonical and strictly precedes the token's expires_at.

- Evidenced by example test.
- Source: `AGENTS.md`: “Require canonical GitHub `Date` headers strictly before the minted `expires_at` on that DELETE 204 and every accepted 200 or 401.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `release-app-revocation-receipt-semantics`

propagationObserved=false iff the first two probes are the stable 401 pair with no 200; true iff at least one exact 200 preceded the final two 401s; advanced receipts bind this object as releaseAppRevocation and already-exact binds null.

- Evidenced by example test.
- Source: `AGENTS.md`: “`propagationObserved=false` means the first two probes were the stable 401 pair with no observed 200; `propagationObserved=true` means at least one exact 200 preceded the final two stable 401s. Bind that exact bounded object as `releaseAppRevocation`”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `promotion-helper-bound-to-production-ref`

The production helper is hard-bound to website-production and never targets the canary or any other ref.

- Evidenced by example test.
- Source: `AGENTS.md`: “Keep the production helper hard-bound to `website-production`.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `promotion-workflow-run-binding`

The automatic workflow_run path requires repository 1316443113, Release workflow 323493609 at its exact path, tag push, first attempt, success, same head repository, and head SHA equal to the peeled immutable tag commit, with the payload run ID equal to the Release receipt's run ID.

- Evidenced by example test.
- Source: `AGENTS.md`: “bind its automatic `workflow_run` to Ghostget repository ID `1316443113` and Release workflow ID `323493609` plus the exact path, tag-push event, first attempt, success, head repository, tag, peeled immutable release SHA, and payload run ID.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `promotion-manual-recovery-untrusted-tag`

Manual recovery runs only from the main-origin promotion workflow with an untrusted stable-tag input and carries no upstream SHA, run ID or attempt; it requires a positive current attempt and never reruns or changes the tag Release.

- Evidenced by example test.
- Source: `AGENTS.md`: “Manual recovery on that same main-origin workflow accepts only an untrusted stable-tag input and carries no upstream SHA, run ID, or attempt.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `promotion-run-id-from-receipt`

The authoritative Release run ID is derived only from the Release's sampled exact Actions receipt and is carried through baseline-v4, promotion-v3 and every later authority, promotion and outcome check.

- Evidenced by example test.
- Source: `AGENTS.md`: “Carry that run ID through exact `wrench-provider-baseline-v4` and `wrench-provider-promotion-v3` receipts”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `promotion-baseline-before-key-wait`

A complete bounded Vercel Production deployment baseline (at most 500 deployments, two stable order-independent reads bracketed by authenticated GitHub Date headers) is recorded before any key-environment wait.

- Evidenced by example test.
- Source: `AGENTS.md`: “Record the complete bounded Vercel Production baseline before any key-environment wait.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `promotion-deployment-ref-sha-binding`

The REST deployment's lowercase 40-hex .ref equals .sha equals the verified release commit, while the matching GraphQL deployment reports ref null and the same commitOid.

- Evidenced by example test.
- Source: `AGENTS.md`: “Bind the REST deployment's lowercase commit `.ref` and `.sha` to the verified release while GraphQL reports a null `ref` and the same `commitOid`.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `promotion-recovery-no-newer-success`

Already-exact recovery selects the unique newest deployment for the verified SHA postdating the Release; a newer or same-second successful deployment for another SHA blocks recovery, while newer terminal failures do not displace the exact candidate.

- Evidenced by example test.
- Source: `docs/publishing.md`: “Recovery from an already-exact branch instead selects the unique newest deployment for the verified SHA and requires it to postdate the immutable Release. A newer or same-second deployment for another SHA blocks recovery when its current Vercel status is successful.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `production-branch-missing-is-hard-failure`

After the one-time bootstrap, a missing website-production branch is a hard failure; no workflow or recovery creates it.

- Evidenced by example test.
- Source: `AGENTS.md`: “After it, a missing production branch is a hard failure.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `promotion-rest-graphql-public-budgets`

Promotion stays within the documented request budgets: at most 209 REST calls in the provider outcome job and 358 together with the immutable Release workflow, at most 120 GraphQL requests at no more than two points each, and at most 32 unauthenticated public-host GETs.

- Evidenced by example test.
- Source: `docs/publishing.md`: “The immutable Release and downstream promotion workflows together use at most 370 REST calls”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/release-provider-outcome.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `promotion-actions-read-single-read`

Only the initial verify job has `actions: read`, and its authority resolution reads the Release Actions run exactly once, binding stable numeric actor and triggering-actor IDs and types, repository identities, workflow ID and path, tag-push event, source SHA, completion, success, and attempt.

- Evidenced by example test.
- Source: `AGENTS.md`: “In the initial verify job's authority resolution, read that Actions run exactly once”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `release-app-rest-cap-fourteen`

The App path makes at most fourteen REST requests (three setup/mint, one DELETE, at most ten probes).

- Evidenced by example test.
- Source: `AGENTS.md`: “cap the App path at fourteen REST requests.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `release-app-env-scrubbed-from-gh`

Every read-only gh child process has all WRENCH_RELEASE_APP_* values removed from its environment; the installation token reaches only the private GIT_ASKPASS for the exact fetch and push.

- Evidenced by example test.
- Source: `AGENTS.md`: “Scrub every `WRENCH_RELEASE_APP_*` value from read-only `gh` children.”
- Also covers: `website/AGENTS.md`: “every read-only GitHub child must be scrubbed of App values”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `promotion-leased-fast-forward-only`

The production writer fetches only the verified tag, peels it locally to the independently verified SHA without executing tagged code, and pushes exactly one refspec with --force-with-lease=refs/heads/website-production:<expected-old>; a stale lease leaves the ref unchanged and the workflow never creates, deletes, force-moves or recreates the branch.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “Fetch only the exact verified tag through the private askpass token, peel it locally”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/release-ref-authority.test.ts`, `scripts/verification-promotion-replay.test.ts`, `verification/quint/promotion.qnt`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified:
  - `verification/quint/promotion.qnt` checks one run of the website production workflow after its verify job, with seven abstract commits, one release tag, and a three-observation poll budget, against an environment that may move protected main, the production ref, and the tag, replace Latest, finish or fail the Vercel deployment, change the apex marker, and arm one of ten readback drifts between the two terminal readbacks. Quint simulation checks it with 3,000 samples of up to 14 steps and Apalache to length 11 in the Required verification job (every mutant step is found at that length; at length 10 the single-readback mutant is not), and the nightly workflow repeats it with 10,000 samples of up to 20 steps and Apalache to length 12.
  - Its ITF replay runs the production `revalidateReleaseAuthority`, `createProviderBaseline`, `promoteWebsiteProduction`, and `waitForProviderOutcome` on 300 traces of up to 14 steps per step relation, and the production writer's real `/usr/bin/git` tag fetch, peel, and `--force-with-lease` push against a local bare repository. GitHub's REST and GraphQL answers and the public site are stubs computed from the model state, and longer schedules, more commits, and the production poll budget of 20 are not modelled.
  - The replay's remote is a local bare repository, not GitHub. GitHub's ref-update ruleset and non-fast-forward rule are assumed under `github-enforcement`. That the workflow never creates, deletes, or recreates the branch, that the tag is fetched through the private askpass token, and that the peel executes no tagged code rest on the writer's fixed argument lists, which only the example tests in `scripts/npm-release-workflow.test.ts` check, and on the production-ref lifecycle ruleset, which only a live readback checks.
  - Defect found and fixed here: `git push --porcelain` reports a stale `--force-with-lease` as `=` `[up to date]` with exit status 0 when the remote already holds the pushed commit, and the writer accepted that as its own update. It now requires the one porcelain update line from the leased SHA to the release SHA; the test “fails a leased write closed when the remote already holds the release commit” fails on the previous writer, and the replay's seeded `force-push` defect diverges from the model.

#### `promotion-c-le-w-le-m`

Promotion proves release commit C ≤ reviewed workflow source W ≤ protected current main M at every authority check before any provider or ref work, accepts only identical or strictly linear-forward movement of main, rejects rollback or divergence, and binds package, tag, Release, deployment, and production-ref identity to C.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “prove release `C<=W<=M` for protected current main `M`, allowing only linear descendant movement after dispatch”
- Also covers: `website/AGENTS.md`: “prove `C<=W<=M` for protected current main `M` at every authority sandwich”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/release-ref-authority.test.ts`, `scripts/verification-promotion-replay.test.ts`, `verification/quint/promotion.qnt`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified:
  - `verification/quint/promotion.qnt` checks one run of the website production workflow after its verify job, with seven abstract commits, one release tag, and a three-observation poll budget, against an environment that may move protected main, the production ref, and the tag, replace Latest, finish or fail the Vercel deployment, change the apex marker, and arm one of ten readback drifts between the two terminal readbacks. Quint simulation checks it with 3,000 samples of up to 14 steps and Apalache to length 11 in the Required verification job (every mutant step is found at that length; at length 10 the single-readback mutant is not), and the nightly workflow repeats it with 10,000 samples of up to 20 steps and Apalache to length 12.
  - Its ITF replay runs the production `revalidateReleaseAuthority`, `createProviderBaseline`, `promoteWebsiteProduction`, and `waitForProviderOutcome` on 300 traces of up to 14 steps per step relation, and the production writer's real `/usr/bin/git` tag fetch, peel, and `--force-with-lease` push against a local bare repository. GitHub's REST and GraphQL answers and the public site are stubs computed from the model state, and longer schedules, more commits, and the production poll budget of 20 are not modelled.
  - C ≤ W is the verify job's precondition in `scripts/release-ref-authority.ts`, covered by `scripts/release-ref-authority.test.ts`; the model fixes it and checks W ≤ M at every source check that passes, including a main that forks from C before W. Linear movement is judged against W: a main that later moves back to an earlier descendant of W still satisfies W ≤ M and is accepted, and protected main's non-fast-forward rule, assumed under `github-enforcement`, excludes that move.
  - The model binds the tag, the Release, Latest, and the production ref to C. The package and deployment identity bindings are covered only by the listed example tests.

#### `promotion-already-exact-no-credentials`

When the production ref already equals the verified release, promotion takes a separate read-only path with no environment admission, App variable, private key, token mint, or Git push, and binds `releaseAppRevocation` to null.

- Evidenced by example test.
- Source: `AGENTS.md`: “An already-exact ref must take a separate read-only path with no environment, App variable, private key, token mint, or Git push.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `promotion-revalidate-after-admission`

A required fast-forward enters production-ref-writer-key only after immutable release, workflow-source and provider-baseline checks pass, then revalidates C<=W<=M, peeled tag, immutable Release and Latest before credentials and mutation.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “admit it automatically after the existing immutable release, exact workflow-source, and provider-baseline checks pass, then revalidate source and immutable release authority before credentials and mutation”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/verification-promotion-replay.test.ts`, `verification/quint/promotion.qnt`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified:
  - `verification/quint/promotion.qnt` checks one run of the website production workflow after its verify job, with seven abstract commits, one release tag, and a three-observation poll budget, against an environment that may move protected main, the production ref, and the tag, replace Latest, finish or fail the Vercel deployment, change the apex marker, and arm one of ten readback drifts between the two terminal readbacks. Quint simulation checks it with 3,000 samples of up to 14 steps and Apalache to length 11 in the Required verification job (every mutant step is found at that length; at length 10 the single-readback mutant is not), and the nightly workflow repeats it with 10,000 samples of up to 20 steps and Apalache to length 12.
  - Its ITF replay runs the production `revalidateReleaseAuthority`, `createProviderBaseline`, `promoteWebsiteProduction`, and `waitForProviderOutcome` on 300 traces of up to 14 steps per step relation, and the production writer's real `/usr/bin/git` tag fetch, peel, and `--force-with-lease` push against a local bare repository. GitHub's REST and GraphQL answers and the public site are stubs computed from the model state, and longer schedules, more commits, and the production poll budget of 20 are not modelled.
  - The model orders the checks inside one run. The `production-ref-writer-key` environment gate, the job `needs` graph, and which steps receive the release-App key are checked only by the workflow example tests in `scripts/npm-release-workflow.test.ts`, and their enforcement is assumed under `github-enforcement`. In the replay the write step stands in for `GitHubApi.advanceRef`, where production mints the release-App token, so the token's own lifecycle is not replayed.

#### `promotion-observation-window`

Provider outcome uses exactly 20 absolute observation slots at minute offsets 0..19 inside one injected monotonic half-open 20-minute window; latency never slides slots, no provider read starts at or after the deadline, and the job has a separate 30-minute timeout.

- Evidenced by property test.
- Source: `AGENTS.md`: “Keep 20 observation slots at absolute minute offsets zero through 19 inside one injected monotonic 20-minute `[start, deadline)` interval and a separate 30-minute read-only job”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Property tests: `scripts/npm-release-workflow.test.ts`: “keeps 20 absolute observation slots under any read latency and partial sleep wakeups”
- Assumptions: `monotonic-clock`, `github-api`, `github-enforcement`, `vercel`
- Not verified:
  - The property test runs `waitForProviderOutcome` 100 times against a candidate that never appears, with up to 64 generated read latencies from 1 to 45,000 ms and early sleep wakeups. Generated latencies rarely land exactly on the deadline, so the boundary read, clock regression, overflow, and a sleep that never reaches its slot are covered by the example test “enforces one half-open monotonic 20-minute provider observation deadline”.
  - `verification/quint/promotion.qnt` abstracts time and does not carry this claim. The 30-minute provider job timeout is a workflow setting that an example test checks; GitHub enforcing it is assumed under `github-enforcement`.

#### `promotion-eventual-promotion-or-stuck-evidence`

An immutable Release is eventually promoted or leaves explicit stuck evidence (progress law).

- Evidenced by Quint model with production trace replay.
- Source: `kb/plans/formal-verification-assurance.md`: “The progress goal is "an immutable Release is eventually promoted or leaves explicit stuck evidence".”
- Evidence: `scripts/verification-promotion-replay.test.ts`, `verification/quint/promotion.qnt`
- Assumptions: `github-api`, `github-enforcement`, `vercel`, `ci-runner`
- Not verified:
  - `verification/quint/promotion.qnt` checks one run of the website production workflow after its verify job, with seven abstract commits, one release tag, and a three-observation poll budget, against an environment that may move protected main, the production ref, and the tag, replace Latest, finish or fail the Vercel deployment, change the apex marker, and arm one of ten readback drifts between the two terminal readbacks. Quint simulation checks it with 3,000 samples of up to 14 steps and Apalache to length 11 in the Required verification job (every mutant step is found at that length; at length 10 the single-readback mutant is not), and the nightly workflow repeats it with 10,000 samples of up to 20 steps and Apalache to length 12.
  - Its ITF replay runs the production `revalidateReleaseAuthority`, `createProviderBaseline`, `promoteWebsiteProduction`, and `waitForProviderOutcome` on 300 traces of up to 14 steps per step relation, and the production writer's real `/usr/bin/git` tag fetch, peel, and `--force-with-lease` push against a local bare repository. GitHub's REST and GraphQL answers and the public site are stubs computed from the model state, and longer schedules, more commits, and the production poll budget of 20 are not modelled.
  - The progress law is checked as a bounded safety property, not as a temporal one: no Quint or Apalache check of a liveness property under fairness runs. The invariant `boundedVerdict` shows that every run reaches a verdict within nine production steps (three authority checks, the baseline, the promotion checks, the write, and the model's three observations), and `stuckHasEvidence` that every stuck verdict names one of ten reasons that the environment state explains. Every production step stays enabled until the verdict, so under weak fairness for the workflow's jobs a run terminates; that step is argued, not checked.
  - The stuck evidence is the failed run's refusal message; the replay maps each production refusal to the model's reason and fails on a refusal it cannot map. Eventual promotion across runs while the environment keeps faulting is outside the model: it needs Vercel to succeed and expose the exact marker inside the observation window.
  - Progress assumes fair Actions scheduling and an owner who dispatches manual recovery when the automatic path is ineligible.

#### `promotion-success-requires-stable-readbacks`

Promotion succeeds only with one exact successful Vercel Production deployment plus stable terminal tag, Release, Latest, workflow-source, ref, inventory, status and two byte-stable canonical-host readbacks.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “Bind one exact successful Vercel Production deployment plus stable terminal tag, Release, Latest, workflow source, ref, inventory, status, and canonical-host readbacks before promotion succeeds.”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/release-provider-outcome.test.ts`, `scripts/verification-promotion-replay.test.ts`, `verification/quint/promotion.qnt`, `website/production-release-marker.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified:
  - `verification/quint/promotion.qnt` checks one run of the website production workflow after its verify job, with seven abstract commits, one release tag, and a three-observation poll budget, against an environment that may move protected main, the production ref, and the tag, replace Latest, finish or fail the Vercel deployment, change the apex marker, and arm one of ten readback drifts between the two terminal readbacks. Quint simulation checks it with 3,000 samples of up to 14 steps and Apalache to length 11 in the Required verification job (every mutant step is found at that length; at length 10 the single-readback mutant is not), and the nightly workflow repeats it with 10,000 samples of up to 20 steps and Apalache to length 12.
  - Its ITF replay runs the production `revalidateReleaseAuthority`, `createProviderBaseline`, `promoteWebsiteProduction`, and `waitForProviderOutcome` on 300 traces of up to 14 steps per step relation, and the production writer's real `/usr/bin/git` tag fetch, peel, and `--force-with-lease` push against a local bare repository. GitHub's REST and GraphQL answers and the public site are stubs computed from the model state, and longer schedules, more commits, and the production poll budget of 20 are not modelled.
  - The replay arms at most one drift per trace: the production ref, the candidate's status history, the apex marker, Latest, a health route, the `www` redirect, the tag commit, the Release, protected main, or the Production inventory. Combined drifts and GraphQL and REST disagreement are covered only by the listed example tests.
  - Byte stability is checked as digest equality of the stubbed bodies; the canonical host's real HTTP behaviour is assumed under `vercel`.

#### `promotion-candidate-status-history-clean`

The pinned candidate's exhaustive REST status history (cap 500, empty sentinel page) must contain no failure, error or inactive row even if a newer row reports success; GraphQL latestStatus.id must equal the REST status node_id.

- Evidenced by example test.
- Source: `AGENTS.md`: “exhaustively audit only the pinned candidate's REST status history. Reject any retained failure, error, or inactive candidate status even after success.”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/release-provider-outcome.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

### `providers` (1 claim)

#### `no-caller-selected-raw-controls`

No semantic provider operation or gateway call accepts caller-selected provider headers, cookies, selectors, scripts, shell commands, or arbitrary file paths; such inputs are rejected before any provider I/O.

- Evidenced by example test.
- Source: `AGENTS.md`: “Never add caller-selected provider headers, cookies, selectors, scripts, shell commands, or arbitrary file access.”
- Evidence: `src/client-boundary.test.ts`, `src/model.test.ts`, `src/provider-plugin-host.test.ts`, `src/runtime.test.ts`
- Assumptions: `provider-behaviour`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

### `release` (32 claims)

#### `release-trigger-exact-tag-push-only`

The Release workflow runs only on a protected direct tag push (no workflow_dispatch); the entry job rejects any event whose sender is not User 894119 or whose repository is not public Ghostget ID 1316443113.

- Evidenced by example test.
- Source: `AGENTS.md`: “Bind every Release run at entry to a protected tag-push event and embedded sender owned by User `894119` in public Ghostget repository ID `1316443113`.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-source-ci-admission-exact`

Release admits source only with the exact commit's successful default-branch CI run on its current attempt: exact repository, workflow ID/path, main-push source and tree, every CI job successful with its real checkout log, and recorded workflow/lock hashes and toolchain versions; missing, failed, skipped, ambiguous, stale-attempt, or drifting evidence blocks.

- Evidenced by example test.
- Source: `docs/publishing.md`: “It requires the exact repository, active workflow ID/path, main-push source and tree”
- Evidence: `scripts/github-release-artifact.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-source-codeql-exact-two-languages`

Source admission requires exactly the Actions and JavaScript/TypeScript CodeQL jobs and analyses on the exact source and current main; missing or extra languages, or two exact-source CodeQL runs, are rejected.

- Evidenced by example test.
- Source: `docs/publishing.md`: “Admission requires exactly those two jobs and analyses, with missing or extra languages rejected.”
- Evidence: `scripts/github-release-artifact.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-source-codeql-pr-association`

The CodeQL PR comparison is accepted via its returned PR association; the exact 'View all branch alerts' summary is a fallback only when the association array is empty, never when a nonempty association contradicts.

- Evidenced by example test.
- Source: `docs/publishing.md`: “A nonempty contradictory association never falls back to the summary.”
- Evidence: `scripts/github-release-artifact.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-source-evidence-72h-freshness`

Every required CI and CodeQL job must have completed within 72 hours of admission with valid, non-future timestamps, and each analysis must fall inside its attempt's language-job interval; mutable run update times never establish freshness.

- Evidenced by example test.
- Source: `docs/publishing.md`: “Every required CI and CodeQL job must have completed within 72 hours of admission”
- Evidence: `scripts/github-release-artifact.test.ts`
- Assumptions: `monotonic-clock`, `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-source-no-caller-receipt`

The source-CI helper resamples control evidence before returning, never reruns CI, and never accepts a caller-supplied receipt.

- Evidenced by example test.
- Source: `docs/publishing.md`: “The helper samples the control evidence again before returning”
- Evidence: `scripts/github-release-artifact.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-fresh-build-before-capability`

After admission Release performs a fresh frozen install and deterministic build, checks dist and bun.lock cleanliness, and the new npm archive passes the strict artifact parser and isolated consumer smoke before any attestation or publication capability exists.

- Evidenced by example test.
- Source: `docs/publishing.md`: “Its new exact npm archive passes the strict artifact parser and isolated consumer smoke before attestation or publication capability is available.”
- Evidence: `scripts/ci-pr-gate.test.ts`, `scripts/github-release-artifact.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-tag-direct-lightweight`

A release tag is one direct lightweight v<version> tag on the admitted commit; annotated tags are rejected and a historical tag is never overwritten, annotate-converted, moved or deleted to recover a run.

- Evidenced by example test.
- Source: `AGENTS.md`: “Keep direct lightweight tags”
- Evidence: `scripts/release-ref-authority.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `release-manifest-strict-binding`

release-manifest.json is parsed strictly and must bind repository, name, version, tag, source C, workflow authority W, run ID/attempt and archive size/SHA-256/SHA-512 to the requested values.

- Evidenced by example test.
- Source: `docs/publishing.md`: “`release-manifest.json`, the strict `hraness-github-release-v1` identity, including repository/name/version/tag, source `C`, reviewed workflow authority `W`, run ID/attempt, and archive size/SHA-256/SHA-512.”
- Evidence: `scripts/github-release-artifact.test.ts`, `website/github-release-artifact.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-file-specific-size-bounds`

Archive transfer is capped at 12 MiB from v0.18.1 (8 MiB earlier), receipt and manifest at 1 MiB, checksums and provenance at 8 MiB, applied uniformly by preparation, downloads, draft readbacks, attestation and npm handoff without relaxing digest or inventory checks.

- Evidenced by property test.
- Source: `docs/publishing.md`: “The transfer envelope admits an archive of at most 12 MiB from `v0.18.1`; earlier archives retain their 8 MiB limit”
- Evidence: `scripts/github-release-artifact.test.ts`, `website/github-release-artifact.test.ts`
- Property tests: `scripts/github-release-artifact.test.ts`: “property: foreign archive sizes are accepted exactly within the versioned transfer bound”
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Generated inputs are sampled at the configured run count; this is not a proof over all inputs.

#### `release-archive-receipt-ustar-agreement`

The archive and npm receipt must agree on every safe USTAR entry, mode, count, size and integrity; extra files, traversal, links, malformed receipts, unsafe package configuration and mismatched bytes are rejected, and both tar consumers agree on hostile USTAR headers.

- Evidenced by example test.
- Source: `docs/publishing.md`: “Reject extra files, traversal, links, malformed receipts, unsafe package configuration, and mismatched bytes.”
- Evidence: `scripts/github-release-artifact.test.ts`, `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-attest-checkout-free-reauthorized`

A separate checkout-free attest job reauthorizes owner/run/tag before requesting OIDC and invokes pinned actions/attest; attest and publish_npm are the only jobs with id-token: write.

- Evidenced by example test.
- Source: `AGENTS.md`: “a separate checkout-free OIDC attestation job”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-single-contents-write-job`

Across all workflows, the Release publish job is the only job with contents: write; workflow defaults are contents: read and no workflow uses write-all.

- Evidenced by example test.
- Source: `docs/publishing.md`: “the checked workflow census leaves only the Release `publish` job with a `contents: write` `GITHUB_TOKEN`”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-existing-release-single-latest-check`

An exact Release that already existed gets one immediate Latest check and never enters the convergence loop; after either path the terminal tag, main, control, by-tag and Latest reads must bind the same tag, ID and publication time.

- Evidenced by example test.
- Source: `docs/publishing.md`: “An exact Release that already existed gets one immediate Latest check and never enters this convergence loop”
- Evidence: `scripts/release-provider-outcome.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-receipt-bot-and-body-prefix`

Every publication readback requires Actions bot ID 41898282 of type Bot and a deterministic body prefix binding repository, tag, source SHA and GITHUB_RUN_ID; target_commitish is informational only and the protected tag must peel to C.

- Evidenced by example test.
- Source: `docs/publishing.md`: “Every publication readback instead requires Actions bot ID `41898282` with type `Bot` and a deterministic body prefix binding repository, tag, source SHA, and `GITHUB_RUN_ID`”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/release-provider-outcome.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `release-reauthorize-attempt-before-checkout`

Before the sole write-capable job checks out source, the current attempt's actor and triggering_actor must both be User 894119 and the attempt must bind Release workflow ID 323493609, its exact path, the verified direct tag object and current-main ancestry; delegated reruns fail closed.

- Evidenced by example test.
- Source: `AGENTS.md`: “Before the sole write-capable job checks out source, use only `actions:read` to bind the exact current attempt—including both `actor` and `triggering_actor`”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `release-reauthorize-only-actions-read`

The reauthorization before checkout uses only actions:read; no Release job holds Administration or calls ruleset/rule-suite endpoints.

- Evidenced by example test.
- Source: `AGENTS.md`: “use only `actions:read`”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-version-monotone-stable`

A new stable package version must exceed every completed stable Release; a higher raw tag alone is an incomplete request, and the publication path exhausts the bounded completed stable-Release ordering census before creating or publishing a draft.

- Evidenced by stateful model.
- Source: `docs/publishing.md`: “Choose a new stable package version greater than every completed stable Release. A raw tag is a request, not a completed publication.”
- Evidence: `scripts/github-release-publish-model.test.ts`, `scripts/npm-release-workflow.test.ts`, `scripts/release-provider-outcome.test.ts`, `scripts/release-ref-authority.test.ts`
- Property tests: `scripts/github-release-publish-model.test.ts`: “stateful model: every schedule of attempts, faults, and foreign releases keeps the publisher's write laws”
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The publisher model drives the production `publishCanonicalRelease` and its bounded asset downloader against an in-memory fake of GitHub; that GitHub behaves like the fake (drafts invisible to the by-tag endpoint, one published Release per tag, `gh release upload` resolving a tag to its published Release or else the newest draft) is the `github-api` assumption.
  - CI samples up to 1,000 schedules of at most 12 commands; it does not enumerate every interleaving.
  - The census law itself (a target is admitted exactly when it exceeds every completed stable Release in the 500-Release window) is the sampled property in `scripts/release-provider-outcome.test.ts`; the model checks that a clean census precedes each draft creation and publication, and that success never leaves a higher completed stable Release.
  - GitHub has no conditional create or publish, so a stable Release that completes between the last census and the PATCH is caught only by the census repeated after publication, which fails the run but cannot undo the already immutable publication. A stable Release that completes after that last census, while the terminal Latest read still names the target, is not detected, and the model injects no such completion.

#### `release-five-file-contract`

The canonical GitHub Release publishes, independently of npm, exactly five files: the packed `.tgz`, `npm-pack.json`, `release-manifest.json` (`hraness-github-release-v1`), `SHA256SUMS` covering the preceding three in order, and `provenance.jsonl`; duplicate, unknown, foreign-URL, or uncommitted assets are rejected.

- Evidenced by example test.
- Source: `AGENTS.md`: “publish the exact five-file archive/packing-receipt/manifest/checksums/provenance contract independently of npm.”
- Evidence: `scripts/github-release-artifact.test.ts`, `website/github-release-artifact.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `release-attestation-before-mutation`

Before GitHub mutation, the attestation bundle must cryptographically verify for all four subjects with signed certificate repository/owner IDs, source/ref, workflow, GitHub-hosted push and run ID/attempt exactly matching; a matching archive hash or predicate metadata alone is not authority.

- Evidenced by example test.
- Source: `AGENTS.md`: “A matching archive hash is insufficient release authority. Before GitHub mutation, require successful cryptographic verification”
- Evidence: `scripts/github-release-artifact.test.ts`, `scripts/npm-release-workflow.test.ts`, `website/github-release-artifact.test.ts`
- Assumptions: `github-api`, `github-enforcement`, `sigstore`
- Not verified: Only the enumerated example cases are checked.

#### `release-draft-create-only-on-exact-404`

A draft is created only after an authenticated exact REST 404 by tag plus bounded inventory discovery shows none exists; any other lookup failure aborts.

- Evidenced by stateful model.
- Source: `docs/publishing.md`: “Only an authenticated exact REST 404 permits draft creation; other lookup failures abort.”
- Evidence: `scripts/github-release-artifact.test.ts`, `scripts/github-release-publish-model.test.ts`
- Property tests: `scripts/github-release-publish-model.test.ts`: “stateful model: every schedule of attempts, faults, and foreign releases keeps the publisher's write laws”
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The publisher model drives the production `publishCanonicalRelease` and its bounded asset downloader against an in-memory fake of GitHub; that GitHub behaves like the fake (drafts invisible to the by-tag endpoint, one published Release per tag, `gh release upload` resolving a tag to its published Release or else the newest draft) is the `github-api` assumption.
  - CI samples up to 1,000 schedules of at most 12 commands; it does not enumerate every interleaving.
  - The model's lookup faults are HTTP 500 and 403, a status and exit code that disagree, an unparseable response, a 404 with another body, and an unreadable inventory; other malformed responses rest on the parser's example tests.

#### `release-upload-missing-only-no-clobber`

Publication uploads only missing exact asset names without clobber, then downloads each asset by ID within its byte bound and compares bytes and SHA-256 to the verified local artifact before and after publication.

- Evidenced by stateful model.
- Source: `docs/publishing.md`: “downloads each exact asset ID with its admitted byte bound, and compares its actual bytes and SHA-256”
- Evidence: `scripts/github-release-artifact.test.ts`, `scripts/github-release-publish-model.test.ts`
- Property tests: `scripts/github-release-publish-model.test.ts`: “stateful model: every schedule of attempts, faults, and foreign releases keeps the publisher's write laws”
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The publisher model drives the production `publishCanonicalRelease` and its bounded asset downloader against an in-memory fake of GitHub; that GitHub behaves like the fake (drafts invisible to the by-tag endpoint, one published Release per tag, `gh release upload` resolving a tag to its published Release or else the newest draft) is the `github-api` assumption.
  - CI samples up to 1,000 schedules of at most 12 commands; it does not enumerate every interleaving.
  - Stored-byte corruption is injected only between publisher invocations, not between an upload and its own readback.

#### `release-draft-resume-exact-only`

A pre-existing draft or published Release from the same attesting attempt, including one that a failed-jobs rerun of that run resumes, resumes only with matching Actions bot, source receipt, body, tag, and every already-uploaded asset; a mismatched draft or another attempt fails closed and is never deleted, recreated, clobbered, or relabeled.

- Evidenced by stateful model.
- Source: `docs/publishing.md`: “A matching partial draft or published Release from the same attesting attempt, including one a failed-jobs rerun of that run resumes, may resume only with matching source, bot, body, and every already uploaded asset.”
- Evidence: `scripts/github-release-artifact.test.ts`, `scripts/github-release-publish-model.test.ts`, `scripts/verification-release-replay.test.ts`
- Property tests: `scripts/github-release-publish-model.test.ts`: “stateful model: every schedule of attempts, faults, and foreign releases keeps the publisher's write laws”
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The publisher model drives the production `publishCanonicalRelease` and its bounded asset downloader against an in-memory fake of GitHub; that GitHub behaves like the fake (drafts invisible to the by-tag endpoint, one published Release per tag, `gh release upload` resolving a tag to its published Release or else the newest draft) is the `github-api` assumption.
  - CI samples up to 1,000 schedules of at most 12 commands; it does not enumerate every interleaving.
  - The model represents a failed-jobs rerun as a further invocation of the same attesting attempt, because the rerun publishes that attempt's attested manifest; that the rerun receives that manifest is covered by the `release-failed-jobs-rerun-recovers-publish` claim, not here.

#### `release-single-publish-patch`

The only publication mutation is one PATCH turning the admitted draft non-draft and requesting Latest after the complete five-file readback; no deletion, tag movement or rollback is ever issued.

- Evidenced by stateful model.
- Source: `docs/publishing.md`: “The only publication PATCH changes the admitted draft to non-draft and requests Latest after the complete five-file readback.”
- Evidence: `scripts/github-release-artifact.test.ts`, `scripts/github-release-publish-model.test.ts`, `scripts/npm-release-workflow.test.ts`
- Property tests: `scripts/github-release-publish-model.test.ts`: “stateful model: every schedule of attempts, faults, and foreign releases keeps the publisher's write laws”
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The publisher model drives the production `publishCanonicalRelease` and its bounded asset downloader against an in-memory fake of GitHub; that GitHub behaves like the fake (drafts invisible to the by-tag endpoint, one published Release per tag, `gh release upload` resolving a tag to its published Release or else the newest draft) is the `github-api` assumption.
  - CI samples up to 1,000 schedules of at most 12 commands; it does not enumerate every interleaving.
  - The model rejects any command outside the publisher's exact reads and three write shapes, so a DELETE, a tag write, or a second PATCH fails it; Git ref writes made outside `publishCanonicalRelease` are covered only by the workflow's example tests.

#### `release-closure-check-before-each-write`

Before each draft creation, missing-asset upload and publication, the helper proves C<=M on fully qualified main and tag refs, requires unchanged release-control closure, and observes two equal combined main-plus-tag advertisements around the proof.

- Evidenced by stateful model.
- Source: `docs/publishing.md`: “Before each draft creation, missing-asset upload, and publication, fetch only the fully qualified governed main and tag refs, prove `C<=M`, and require unchanged release controls”
- Evidence: `scripts/github-release-publish-model.test.ts`, `scripts/release-ref-authority.test.ts`
- Property tests: `scripts/github-release-publish-model.test.ts`: “stateful model: every schedule of attempts, faults, and foreign releases keeps the publisher's write laws”
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The publisher model drives the production `publishCanonicalRelease` and its bounded asset downloader against an in-memory fake of GitHub; that GitHub behaves like the fake (drafts invisible to the by-tag endpoint, one published Release per tag, `gh release upload` resolving a tag to its published Release or else the newest draft) is the `github-api` assumption.
  - CI samples up to 1,000 schedules of at most 12 commands; it does not enumerate every interleaving.
  - The model checks that a successful `publication-prewrite` run of the ref-authority helper on current main immediately precedes each draft creation, upload, and publication, and that a failing helper blocks the write. It treats the helper as a black box: its `C<=M` proof, release-control closure, and two equal combined advertisements are covered only by the example tests in `scripts/release-ref-authority.test.ts`.

#### `release-completed-release-original-identity`

A completed Release is accepted only with its original signed identity and exact bot/body receipt; a newly rebuilt artifact never satisfies an existing Release, and a front-run Release or one from another run fails closed.

- Evidenced by stateful model.
- Source: `docs/publishing.md`: “A completed release is accepted only with its original signed identity, never with a newly rebuilt artifact.”
- Evidence: `scripts/github-release-artifact.test.ts`, `scripts/github-release-publish-model.test.ts`, `scripts/npm-release-workflow.test.ts`
- Property tests: `scripts/github-release-publish-model.test.ts`: “stateful model: every schedule of attempts, faults, and foreign releases keeps the publisher's write laws”
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The publisher model drives the production `publishCanonicalRelease` and its bounded asset downloader against an in-memory fake of GitHub; that GitHub behaves like the fake (drafts invisible to the by-tag endpoint, one published Release per tag, `gh release upload` resolving a tag to its published Release or else the newest draft) is the `github-api` assumption.
  - CI samples up to 1,000 schedules of at most 12 commands; it does not enumerate every interleaving.
  - The model covers the bot author (including an owner-authored completed Release that copies the exact receipt body and asset bytes), exact receipt body, and stored bytes; the signed attestation identity is verified before publication and covered by the `release-attestation-before-mutation` claim's example tests, not by the model.

#### `release-latest-convergence-bounded`

When creating a missing Release, the workflow pins one older immutable Latest predecessor; Latest may only remain that predecessor or advance to the exact target within at most twelve 5-second absolute slots in a 60-second monotonic deadline; any third identity, regression, drift, clock regression or exhaustion fails closed.

- Evidenced by property test.
- Source: `docs/publishing.md`: “GitHub's Latest projection may remain only that exact predecessor or advance to the exact created target while the workflow makes at most twelve observations at absolute five-second slots inside one 60-second monotonic deadline.”
- Evidence: `scripts/github-release-publish-model.test.ts`, `scripts/release-provider-outcome.test.ts`
- Property tests: `scripts/release-provider-outcome.test.ts`: “property: Latest converges only through the exact predecessor to the exact target inside twelve absolute slots and 60 seconds”
- Assumptions: `monotonic-clock`, `github-api`, `github-enforcement`
- Not verified:
  - The property drives `waitForLatestRelease` with a fake API, monotonic clock, and sleeper. The production publisher's `gh api` reader ignores the per-request timeout it is passed and bounds each read only by its 120-second command timeout; a read that completes after the 60-second deadline fails closed, so the deadline bounds acceptance, not wall time.
  - The publisher model checks that a fresh publication reads Latest as the target after its terminal authority proof, and one example test in it drives a lagging Latest projection through the production wait on a fake clock; the stateful schedules themselves project Latest immediately.
  - The publisher model checks that no draft is created while Latest is a completed Release under a non-stable tag, which the completed-Release census skips; the other refusals of `exactLatestPredecessor` (a mutable, malformed, or not strictly older Latest) rest on its example tests in the same file.
  - How quickly GitHub's Latest projection converges is not verified; the window is a fail-closed ceiling.

#### `release-never-delete-published`

A published immutable Release is never deleted or rewritten, even if terminal readback fails after publication; historical versions, tags and assetless Releases are preserved.

- Evidenced by stateful model.
- Source: `docs/publishing.md`: “Preserve that immutable release and inspect current authority; never delete or rewrite it.”
- Evidence: `scripts/github-release-artifact.test.ts`, `scripts/github-release-publish-model.test.ts`
- Property tests: `scripts/github-release-publish-model.test.ts`: “stateful model: every schedule of attempts, faults, and foreign releases keeps the publisher's write laws”
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The publisher model drives the production `publishCanonicalRelease` and its bounded asset downloader against an in-memory fake of GitHub; that GitHub behaves like the fake (drafts invisible to the by-tag endpoint, one published Release per tag, `gh release upload` resolving a tag to its published Release or else the newest draft) is the `github-api` assumption.
  - CI samples up to 1,000 schedules of at most 12 commands; it does not enumerate every interleaving.
  - The model's history is one assetless predecessor Release; larger histories and tag deletion outside the publisher are not modelled, and the tag rulesets that forbid tag deletion are `github-enforcement` configuration.

#### `stable-release-concurrency-no-cancel-pending`

The stable-release concurrency group serializes Release runs without cancelling a pending tag run.

- Evidenced by example test.
- Source: `docs/publishing.md`: “The workflow's `stable-release` concurrency group and npm's version immutability serialize publication”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The test checks the workflow's single `stable-release` concurrency group with `cancel-in-progress: false` and `queue: max`, and that no job declares its own group. That GitHub then queues pending runs in order is the `github-enforcement` assumption; GitHub still cancels pending runs beyond 100 in the group.
  - No live run has exercised three overlapping tag pushes.

#### `release-failed-jobs-rerun-recovers-publish`

Re-running only the failed jobs of a Release run publishes the exact bytes that an earlier attempt of the same run attested: the publisher downloads the carried artifact only by its numeric ID behind an exact-identity guard, admits a manifest whose attempt is no later than the current attempt of the same run, and requires every signed certificate to name that attempt. The canonical download admits an attesting attempt whose publication failed only when a strictly later completed attempt of the same run proves all four canonical jobs in its own job inventory: the current attempt, or one of at most three exact intermediate attempts when the current attempt did not publish.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “The GitHub publisher downloads the attested artifact only by numeric artifact ID behind an exact-identity guard, so a failed-jobs rerun publishes the exact bytes and signed attempt its run already attested, never another run's or a later attempt's.”
- Evidence: `scripts/github-release-artifact.test.ts`, `scripts/npm-release-workflow.test.ts`, `scripts/verification-release-replay.test.ts`, `verification/quint/release.qnt`
- Assumptions: `github-api`, `github-enforcement`
- Not verified:
  - The model and its replay cover the handoff's attempt and signature binding and the canonical download's admission. Downloading the carried artifact by numeric ID behind the exact-identity guard is checked only by the listed example tests.
  - That GitHub carries the verify and attestation outputs and their artifact into a failed-jobs rerun, and reports every job of an attempt, carried or not, under that attempt, are assumptions about GitHub Actions; CI does not check them.
  - A failed attestation job cannot be recovered this way, because attestation downloads the build of its own attempt; re-running all jobs rebuilds under a new attempt, which the draft body check rejects.
  - The model covers one run of up to three attempts; Apalache checks it to depth 10 and seeded simulation samples 2,000 runs of up to 12 steps.

#### `release-workflow-isolation`

The Release workflow never reads, creates, or updates website-production, never receives the release App key or Administration permission, and never waits for Vercel.

- Evidenced by example test.
- Source: `AGENTS.md`: “The Release workflow must never read, create, or update `website-production`, receive the release App key, or wait for Vercel.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

#### `mutable-presentation-not-authority`

Release display title, run display name, actor logins and receipt body are presentation; authority comes only from stable numeric IDs/types, the protected tag and immutable Release coordinates, and the sampled source receipt is revalidated on every accepted Release read.

- Evidenced by example test.
- Source: `AGENTS.md`: “Treat the Release display title, Actions workflow-run display name, actor logins, and receipt body as mutable presentation or control-plane data.”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/release-provider-outcome.test.ts`
- Assumptions: `github-api`, `github-enforcement`
- Not verified: Only the enumerated example cases are checked.

### `repair-signals` (6 claims)

#### `repair-signals-private`

Repair signals are bounded and contain no account ID, subject, input or input hash, provider output, URL, credential, raw diagnostic, or HAR.

- Evidenced by example test.
- Source: `AGENTS.md`: “Keep failed-invocation signals free of account identifiers, inputs, private content, and raw errors.”
- Evidence: `src/contract-repair-cli.test.ts`, `src/contract-repair-inbox.test.ts`, `src/contracts-repair.test.ts`
- Assumptions: `filesystem-atomic-rename`
- Not verified: Only the enumerated example cases are checked.

#### `repair-inspection-no-demand`

Catalog, check, cache-only, and identity-only inspection records no repair demand.

- Evidenced by example test.
- Source: `AGENTS.md`: “Catalog/check/cache-only/identity-only inspection must not record demand.”
- Evidence: `src/contract-repair-cli.test.ts`, `src/contract-repair-inbox.test.ts`, `src/contracts-repair-lifecycle.test.ts`
- Assumptions: `filesystem-atomic-rename`
- Not verified: Only the enumerated example cases are checked.

#### `repair-handoff-no-authority`

Every repair handoff fixes `authority.recapture`, `retry`, `activate`, and `publish` to false; repair signals never authorize capture, retry, activation, or publication, and changed contracts remain unverified candidates.

- Evidenced by example test.
- Source: `AGENTS.md`: “Repair handoffs never authorize capture, retry, activation, or publication; changed contracts remain unverified candidates.”
- Evidence: `src/contract-repair-cli.test.ts`, `src/contracts-repair-lifecycle.test.ts`, `src/contracts-repair.test.ts`
- Assumptions: `filesystem-atomic-rename`
- Not verified: Only the enumerated example cases are checked.

#### `repair-inbox-budget`

The contract-repair inbox holds at most 128 entries, 2048 bytes per signal, and 262144 bytes total; full storage refuses new leads without evicting live ones.

- Evidenced by example test.
- Source: `costs.json`: “budget": { "maxEntries": 128, "maxBytes": 262144, "maxBytesPerSignal": 2048 }”
- Evidence: `src/contract-repair-inbox.test.ts`
- Assumptions: `filesystem-atomic-rename`
- Not verified: Only the enumerated example cases are checked.

#### `repair-inbox-ttl`

Repair inbox entries are hidden after 30 days and compacted only on the next admitted write; duplicate delivery never rewrites an entry.

- Evidenced by example test.
- Source: `costs.json`: “Hidden after 30 days; expired entries are compacted on the next admitted write”
- Evidence: `src/contract-repair-inbox.test.ts`
- Assumptions: `filesystem-atomic-rename`
- Not verified: Only the enumerated example cases are checked.

#### `repair-storage-failure-isolated`

Malformed, unsafe, or contended repair storage never changes the original operation outcome, and inspection never repairs or replaces the cache.

- Evidenced by example test.
- Source: `docs/contracts.md`: “Malformed, unsafe, or contended storage never changes the original operation outcome.”
- Evidence: `src/contract-repair-inbox.test.ts`
- Assumptions: `filesystem-atomic-rename`
- Not verified: Only the enumerated example cases are checked.

### `runtime` (4 claims)

#### `package-root-import-inert`

Importing the package root `@hraness/ghostget` does not start the CLI, inspect local state, load built-in providers, or access the network.

- Evidenced by example test.
- Source: `AGENTS.md`: “Keep the package root import side-effect-free. Importing `@hraness/ghostget` must not start the CLI, inspect local state, load built-in providers, or access the network.”
- Evidence: `scripts/package-smoke.ts`, `src/cli.test.ts`, `src/contracts.test.ts`
- Assumptions: `bun-runtime`
- Not verified:
  - Only the enumerated example cases are checked.
  - The package smoke guards filesystem, HTTP, DNS, socket, and fetch entry points while it imports the packed root; it does not intercept child processes or environment reads.

#### `runner-timeout-policy`

Bun runner timeout and concurrency live only in package.json; no test calls setDefaultTimeout or passes per-test runner timeouts.

- Evidenced by example test.
- Source: `AGENTS.md`: “Keep the Bun runner timeout and concurrency policy in `package.json`; test bodies”
- Evidence: `src/test-harness-policy.test.ts`
- Assumptions: `bun-runtime`
- Not verified: Only the enumerated example cases are checked.

#### `property-seed-replay`

Every fast-check property runs through assertProperty or assertAsyncProperty, so GHOSTGET_PROPERTY_SEED and GHOSTGET_PROPERTY_PATH replay, the seed corpus, and the soak multiplier apply; no other fast-check runner appears outside test-support.

- Evidenced by example test.
- Source: `AGENTS.md`: “retain fast-check's seed and shrink path. Replay one exact property with `GHOSTGET_PROPERTY_SEED`, `GHOSTGET_PROPERTY_PATH`”
- Also covers: `verification/AGENTS.md`: “Run every fast-check property through `assertProperty` or `assertAsyncProperty` from `src/test-support.ts`”
- Evidence: `src/test-harness-policy.test.ts`, `src/test-support.test.ts`
- Assumptions: `bun-runtime`
- Not verified:
  - The policy scan is static: it follows fast-check's default, namespace, and named imports, the `fc` re-export of `test-support`, and dynamic loads by literal specifier, but not a runner reached through another module's re-export or a computed member name.
  - It covers `src/`, `scripts/`, `edge/`, and `website/`; tests elsewhere are not scanned.

#### `lifecycle-injected-clocks`

Consequential lifecycle reducers take injected clocks and randomness; wall-clock jumps cannot extend or prematurely expire leases or proofs.

- Planned: stateful model in plan Phase 2.
- Source: `AGENTS.md`: “keep clocks and randomness injected”
- Evidence: `src/control/approval-broker.test.ts`, `src/control/gateway.test.ts`, `src/effect-architecture.test.ts`, `src/linked-device-lifecycle-journal.property.test.ts`
- Assumptions: `bun-runtime`, `monotonic-clock`
- Not verified: The stateful model for this claim is scheduled for plan Phase 2; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

### `storage` (13 claims)

#### `helper-mutual-exclusion`

The state helper's three-phase claim and the path helper's per-leaf claim each admit at most one critical-section holder, including with stale-owner reaping and non-atomic readdir.

- Evidenced by Quint model with production trace replay.
- Source: `kb/plans/formal-verification-assurance.md`: “The invariant is `|{p : critical(p)}| ≤ 1`.”
- Evidence: `scripts/verification-path-claim-replay.test.ts`, `scripts/verification-state-claim-replay.test.ts`, `src/browser-snapshots.test.ts`, `src/path-helper.test.ts`, `src/read-projections.test.ts`, `src/storage-cas.test.ts`, `verification/quint/path-claim.qnt`, `verification/quint/state-claim.qnt`
- Assumptions: `filesystem-atomic-rename`, `process-liveness`, `same-user-trusted`
- Not verified:
  - verification/quint/state-claim.qnt checks two state helpers with at most one kill. A listing may report the other claim at any phase it had since the listing began, or not at all after it changed. CI runs 20,000 simulated samples of up to 12 steps and Apalache to length 8. The replay runs the production listing and stage decision on real claim files for 2,000 traces; concurrent helper processes run only in the example tests. Three or more helpers, an owner whose liveness cannot be inspected, and the eight-listing retry bound are not modelled.
  - When listings are not atomic, both state-helper claims can reach `held`. The later one then fails with "state mutation arbitration admitted two owners" instead of entering, so mutual exclusion holds but that request fails.
  - The path-helper model is bounded: three helpers, at most one kill, kills only at pause points, 10,000 simulated samples of up to 12 steps, Apalache to length 6, and 60 replayed traces.
  - A path helper from before the reaper election can move a live claim away without restoring it. A current helper that claims afterwards finds that claim in the quarantine, releases its own claim, and fails; the residue sweep keeps the quarantine until the claim's PID exits. Liveness is by PID alone, so a reused PID keeps such a quarantine, and blocks the leaf, until that PID exits; this also applies to a current reaper killed between moving a dead claim into its quarantine and removing it, when the dead claim's PID is reused. Only src/path-helper.test.ts covers this, the Quint model has no such helper, and nothing stops an old helper that claims third.

#### `state-cas-no-rollback`

Private state writes are compare-and-swap: exactly one overlapping writer for an exact snapshot succeeds, a stale writer never rolls state back or resurrects a removed file, disappearance is a conflict, and symlinks are never followed.

- Planned: stateful model in plan Phase 2.
- Source: `docs/plugins.md`: “exact-byte compare-and-exchange”
- Evidence: `src/auth-storage.test.ts`, `src/session-secrets.test.ts`, `src/storage-cas.test.ts`
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`
- Not verified: The stateful model for this claim is scheduled for plan Phase 2; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `state-crash-consistency`

A crash or power loss at any durable state-helper or path-helper boundary leaves each private file with its old or its new content, never a torn one; a session-secret read afterwards returns the old value, the new value, or nothing, a completed removal stays removed, and the next write succeeds.

- Evidenced by stateful model.
- Source: `kb/plans/formal-verification-assurance.md`: “power-loss truncation”
- Evidence: `src/state-crash-harness.fixture.ts`, `src/state-crash-harness.test.ts`, `src/state-crash-port.test-support.ts`, `src/state-crash-preload.test-support.ts`
- Property tests: `src/state-crash-harness.test.ts`: “a crash at any durable boundary leaves the old value, the new value, or nothing”; `src/state-crash-harness.test.ts`: “a crash at any durable boundary leaves the old or the new value, never a torn one”
- Assumptions: `filesystem-atomic-rename`, `filesystem-durability`, `process-liveness`, `same-user-trusted`
- Not verified:
  - The harness samples its schedules: CI runs two fast-check schedules each for session secrets and private files, each command crashing at one generated boundary. Only a single private-file replacement is swept at every boundary under power loss.
  - Power loss is modelled by the port, not observed: it rolls back, newest first, created, linked, renamed, and unlinked entries whose directory was not fsynced after the effect, and truncates data not fsynced after its write. Directory tree removals are treated as durable when they return, and a real filesystem may keep or lose unsynced effects in other combinations.
  - A crashed session-secret write may lose the previous value; the law allows that outcome and does not check that the old value survives.
  - One process mutates the state at a time; overlapping writers under crash are not modelled here.

#### `session-secret-filename-injective`

sessionSecretFileName is injective on valid (namespace, authId) coordinates, and parseSessionSecretFileName reads every name it writes back to that coordinate.

- Evidenced by Lean proof with differential test.
- Source: `kb/plans/formal-verification-assurance.md`: “Identifier grammars, and route, operation, and session-secret composite keys: `parse ∘ format = id` and the keys are unambiguous.”
- Evidence: `scripts/verification-lean-encodings.test.ts`, `src/session-secrets.test.ts`, `verification/lean/GhostgetVerification/Encodings/SessionSecret.lean`
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`, `verification-tools`
- Not verified:
  - The Lean theorems are about a Lean model of the naming and parsing functions. The differential test checks that the TypeScript agrees with that model on generated names, not on every name.
  - The name grammar is modelled by hand from its regular expression.
  - File removal, adoption of ambiguous historical files, and filesystem behaviour are not modelled, so two properties are covered only by the listed tests: removing one account never deletes or blocks another account's files, and single-coordinate and auth-wide removal both take an ambiguous historical file only for the coordinate its envelope names, by compare-and-swap on the bytes that named it.
  - Ownership of an ambiguous historical file is read from its envelope header without decryption, so a same-user writer that forges the header can direct its removal; that writer could already delete the file directly.

#### `no-writes-on-read-paths`

Read paths never mutate state; reads may only cache.

- Planned: example test in plan Phase 6.
- Source: `AGENTS.md`: “No writes on read paths. Reads may cache; they never mutate.”
- Evidence: `src/contract-repair-cli.test.ts`, `src/contract-repair-inbox.test.ts`, `src/control/policy-privacy.test.ts`, `src/control/read-capability.test.ts`, `src/cursor-token.test.ts`, `src/linked-device-lifecycle-journal.test.ts`, `src/provider-plugin-store.test.ts`, `src/providers/whatsapp-interaction-projection-helper.test.ts`, `src/read-path-incarnation.test.ts`, `src/read-path-preparation.test.ts`
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`
- Not verified:
  - The example test for this claim is scheduled for plan Phase 6; until then only the listed tests apply, and they cover only their enumerated or sampled cases.
  - Only the menu-bar snapshot, its account and permission listings, the auth checks of cache reads, live-read publication, and omni materialization, read-path invocation preparation, confirmation preparation, and the operation-permission account identity take a typed read capability; explicit invocation preparation, including the messaging route, context, and action preparations and `invoke --projection-identity-only` (the SDK's identity preflight for a live invoke), still creates a missing auth incarnation as an admitted execution path.

#### `read-path-read-capability`

A read path receives a branded read capability with only read members, such as `AuthIncarnationReader`, not an environment that reaches writers; a structurally similar unbranded object is rejected by the type checker.

- Evidenced by example test.
- Source: `AGENTS.md`: “Hand a read path a read capability with no writer members, such as `AuthIncarnationReader`, not an environment that reaches writers.”
- Evidence: `src/control/read-capability.test.ts`, `src/read-path-incarnation.test.ts`, `src/read-path-preparation.test.ts`
- Assumptions: `bun-runtime`
- Not verified:
  - Only the enumerated example cases are checked; the type assertions run under `bun run typecheck`.
  - The brand exists only in the type system; code that casts through `unknown` can still forge a capability.
  - Only the menu-bar snapshot, its account and permission listings, the auth checks of cache reads, live-read publication, and omni materialization, read-path invocation preparation, confirmation preparation, and the operation-permission account identity take the typed capability; other read paths are not covered.

#### `menu-bar-snapshot-read-only`

The menu-bar snapshot and its account and permission listings take no admission and create no state; auth incarnations are created only by account saves, the control-service startup backfill, and admitted execution paths.

- Evidenced by property test.
- Source: `AGENTS.md`: “The menu-bar snapshot and its account and permission listings take no admission and create no state; account saves, the control-service startup backfill, and admitted execution paths create auth incarnations.”
- Evidence: `src/control/read-capability.test.ts`
- Property tests: `src/control/read-capability.test.ts`: “for any set of legacy accounts and orphaned claims, listing revisions write nothing and match the admitted revision exactly when an incarnation exists”
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`
- Not verified:
  - Generated inputs are sampled at the configured run count; this is not a proof over all inputs.
  - The law fingerprints only the read-projection control tree; writes elsewhere in the state home are covered only by the example snapshot test.

#### `read-path-auth-check-read-only`

The auth checks of a cache read, a live-read publication, and an omni materialization read the auth incarnation through `AuthIncarnationReader`; a missing incarnation reads as changed and none is created.

- Evidenced by example test.
- Source: `AGENTS.md`: “The auth checks of a cache read, a live-read publication, and an omni materialization read the incarnation through `AuthIncarnationReader`, so a missing incarnation reads as changed and nothing is created.”
- Evidence: `src/read-path-incarnation.test.ts`
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`
- Not verified:
  - Only the enumerated example cases are checked.
  - The omni example observes the incarnation only between materialization and the next source preparation; read-path preparation itself is covered by read-path-preparation-read-only.

#### `read-projection-admission-exemption`

The only admission write a read-projection cache read makes is its own admission claim, which it creates and releases, and the removal of a claim whose recorded owner is proven dead; the claim carries no data.

- Evidenced by example test.
- Source: `AGENTS.md`: “First, a read-projection cache read may create and release its own admission claim and remove a claim whose recorded owner is proven dead, because it must exclude a concurrent projection transition; the claim is coordination state with no data.”
- Also covers: `AGENTS.md`: “The exemptions cover nothing else.”
- Evidence: `src/read-projections.test.ts`
- Assumptions: `filesystem-atomic-rename`, `process-liveness`, `same-user-trusted`
- Not verified:
  - Only the enumerated example cases are checked.
  - No check establishes that a cache read writes nothing beyond its own claim and dead-owner removal.

#### `read-path-preparation-read-only`

Read-path invocation preparation (capability and omni reads, cache-only invocations, and control-plane inspection), confirmation preparation, and the operation-permission account identity read the auth incarnation through `AuthIncarnationReader`; a missing incarnation fails closed and none is created, while explicit invocation preparation remains the admitted execution path that may create one.

- Evidenced by example test.
- Source: `AGENTS.md`: “Read-path preparation (capability and omni reads, cache-only invocations, and control-plane inspection), confirmation preparation, and the operation-permission account identity bind the current incarnation the same way: they read it through `AuthIncarnationReader`, fail closed when it is missing, and create none.”
- Evidence: `src/read-path-preparation.test.ts`
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`
- Not verified:
  - Only the enumerated example cases are checked: one missing incarnation per read path, on a fresh state home.
  - The cache-only `ghostget invoke` branch is driven in process through `main` with a stubbed cache read, not through the installed binary; the retry preparation after a discarded live read is checked by type and review only.
  - Explicit invocation preparation, including the messaging route, context, and action preparations, still creates a missing incarnation as an admitted execution path. `invoke --projection-identity-only` is the SDK's identity preflight for a live invoke, so it is execution preparation: one example pins that it creates the missing incarnation while `invoke --cache-only` beside it creates none.

#### `read-projection-key-exemption`

A cache read creates at most the projection encryption key and its store-key marker, only when they are absent; a later cache read writes nothing.

- Evidenced by example test.
- Source: `AGENTS.md`: “Second, a cache read may create the projection encryption key and its store-key marker when they are absent, because a miss returns the query key that this encryption key derives; each is created at most once per state home and holds no user data.”
- Evidence: `src/read-path-incarnation.test.ts`
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`
- Not verified:
  - Only the enumerated example cases are checked.
  - The example checks a cache read after preparation on a fresh state home; it does not cover concurrent first reads or a legacy store that needs only its marker.

#### `derived-state-rebuildable`

Derived state is rebuildable from authoritative state and lives in the cheapest serving tier; only authoritative state uses transactional storage.

- Not verified.
- Source: `AGENTS.md`: “Derived state is rebuildable and lives in the cheapest tier that can serve it.”
- Evidence: none
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`
- Not verified:
  - No automated check covers this claim.
  - Only the `costs.json` kind classification is checked; rebuildability and tier placement are not.

#### `content-bytes-in-content-store`

Content bytes live only in the content store; the control plane holds references and metadata.

- Not verified.
- Source: `AGENTS.md`: “Content bytes live in the content store; the control plane keeps references and metadata only.”
- Evidence: `src/control/gateway.test.ts`
- Assumptions: `filesystem-atomic-rename`, `same-user-trusted`
- Not verified: No automated check covers this claim as stated; the listed tests check only related cases.

### `supply-chain` (3 claims)

#### `committed-binaries-reproducible`

Bundled native messaging runtimes are accepted only as exact pinned bytes.

- Evidenced by example test.
- Source: `docs/messaging-automation.md`: “Only exact pinned bytes are accepted.”
- Evidence: `src/providers/messaging-native-install.test.ts`, `src/scripts/install-whatsapp-protocol.test.ts`
- Assumptions: `ci-runner`
- Not verified:
  - Only the enumerated example cases are checked.
  - The bundled-runtime install case runs only on darwin-arm64, so only the arm64 `macos-15` job of the macOS CI suite runs it; Linux CI skips it.

#### `committed-binaries-provenance`

Committed native binaries (imsg, wacli) are reproducible from reviewed source.

- Planned: example test in plan Phase 6.
- Source: `kb/plans/formal-verification-assurance.md`: “Build imsg and wacli in CI from pinned source with provenance, and stop committing binaries.”
- Evidence: none
- Assumptions: `ci-runner`
- Not verified:
  - The example test for this claim is scheduled for plan Phase 6; no automated check covers it yet.
  - The release attestation proves that the workflow packed the binaries, not that they came from reviewed source, and imsg provenance records no clean rebuild.

#### `hraness-deps-immutable-pins`

Hraness dependencies are pinned to reviewed immutable releases or full commits, never sibling paths, submodules, or main.

- Evidenced by example test.
- Source: `AGENTS.md`: “Pin Hraness dependencies to reviewed immutable releases or full commits.”
- Also covers: `AGENTS.md`: “consume shared design-kit or `@hraness/ui` primitives only at immutable versions”
- Evidence: `website/site.test.ts`
- Assumptions: `ci-runner`
- Not verified:
  - Only the enumerated example cases are checked.
  - `website/site.test.ts` asserts only the design-kit, site-footer, and ui pins; the other Hraness dependencies, and rejection of branches, sibling paths, and submodules, are not checked.

### `verification` (13 claims)

#### `property-soak-multiplier`

GHOSTGET_PROPERTY_RUNS accepts only a canonical integer from 1 to 100 and multiplies every helper-run property's run count and interruption budget, including seed corpus replays.

- Evidenced by example test.
- Source: `verification/AGENTS.md`: “For a soak, set `GHOSTGET_PROPERTY_RUNS` to an integer from 1 to 100.”
- Evidence: `src/test-support.test.ts`
- Assumptions: `bun-runtime`
- Not verified:
  - No nightly workflow runs the soak yet; the multiplier is checked only in a child process at multiplier 3.
  - The soak's runner timeout is set on its command line, so a soak that outgrows it fails as a runner timeout rather than a property failure.

#### `verification-inconclusive-not-evidence`

A Quint, Apalache, or Lean run passes only on its exact success outcome; a timeout, interruption, violation, unparsed output, or a successful compile or typecheck alone fails `bun run verify` and the `verification` job.

- Evidenced by example test.
- Source: `AGENTS.md`: “Treat a checker timeout, an inconclusive or unparsed checker result, and a successful compile or typecheck alone as missing evidence”
- Evidence: `scripts/verification-tools.test.ts`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified: Only the enumerated example cases are checked.

#### `verification-tools-pinned`

Quint 0.32.0, Apalache 0.62.2, the Temurin 21.0.12.1+1 JDK, elan 4.2.4, and Lean v4.34.0 are pinned exactly, and every downloaded checker archive, the JDK included, is admitted only at its pinned size and SHA-256.

- Evidenced by example test.
- Source: `AGENTS.md`: “Pin Quint, Apalache, the JDK, elan, and Lean to exact versions, and admit every downloaded checker archive only at its pinned SHA-256.”
- Evidence: `.github/workflows/ci.yml`, `scripts/verification-tools.test.ts`, `verification/lean/lean-toolchain`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified: Only the enumerated example cases are checked.

#### `verification-quint-smoke`

The Quint smoke model typechecks, passes seeded simulation and bounded Apalache checking of `mutualExclusion`, both checkers find the violation in its unguarded mutant, 1,000 seeded ITF traces replay through a TypeScript reference lock, and the replay rejects a defective lock and every mutant trace that breaks mutual exclusion.

- Evidenced by example test.
- Source: `AGENTS.md`: “Pair every model with a seeded mutant or pre-fix variant that its checkers must find.”
- Evidence: `scripts/verification-lock-replay.test.ts`, `scripts/verification-tools.test.ts`, `verification/quint/lock.qnt`, `verification/quint/models.json`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified:
  - Only the enumerated example cases are checked.
  - The smoke model is toolchain evidence: its traces replay through a TypeScript reference lock, not production code.

#### `verification-nightly-depth`

`bun run ./scripts/verification-tools.ts quint-nightly` checks every Quint model at its recorded `nightly` bounds, which the parser rejects when any bound falls below its CI bound or none deepens it; the soak multiplies the run count and time limit of every `assertProperty` and `assertAsyncProperty` by an explicit `GHOSTGET_PROPERTY_RUNS` from 2 to 100; and `.github/workflows/verification-nightly.yml` runs both with the reducer mutants on a schedule, read-only, SHA-pinned, and outside `Required`.

- Evidenced by example test.
- Source: `verification/AGENTS.md`: “Give a Quint model `nightly` bounds only when they deepen its CI bounds and none falls below them. Keep `.github/workflows/verification-nightly.yml` read-only and outside `Required`”
- Evidence: `.github/workflows/verification-nightly.yml`, `scripts/ci-pr-gate.test.ts`, `scripts/verification-soak.ts`, `scripts/verification-tools.test.ts`, `src/test-support.test.ts`, `verification/quint/models.json`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified:
  - Only the enumerated example cases are checked; `Required` checks the nightly configuration, not a nightly run.
  - The nightly workflow has not run on `main` yet. Its first scheduled run after merge is the first CI evidence at the deeper bounds and soak multiplier.
  - Only `verification/quint/lock.qnt`, the toolchain smoke model with a `reference` replay target, lists `nightly` bounds. The six production models run in the nightly at their CI bounds, so the nightly deepens no model of production code until one lists `nightly` bounds.
  - A nightly failure blocks no merge or release. Only the quarterly review in `docs/claims-review.md` checks that failures were triaged, and no automated check enforces that review.
  - The serialized omni runtime test file is outside the soak.

#### `verification-source-mutants`

Every mutant in `verification/mutants.json` changes exactly one occurrence of a guard in `src/run-journal.ts`, `src/messaging-action-store.ts`, or `src/linked-device-lifecycle-journal.ts` and still transpiles, and `bun run ./scripts/verification-mutants.ts` reports it killed only when its fully named test passes alone on unmodified source and is the only failing test on the mutant; a timeout, another failure, or unparsed output is inconclusive and fails the run.

- Evidenced by example test.
- Source: `verification/AGENTS.md`: “List every reducer source mutant in `mutants.json` with its defect and the full name of the one test that must fail.”
- Evidence: `scripts/verification-mutants.ts`, `scripts/verification-tools.test.ts`, `verification/mutants.json`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified:
  - `Required` checks only that each mutant applies, compiles, and names a declared test; the kill runs happen in the nightly workflow.
  - The manifest lists hand-picked guards. It is not a mutation score over the reducers, and StrykerJS was evaluated and not adopted (see `docs/claims-review.md`).

#### `verification-itf-strict`

The ITF reader accepts only the value encodings Quint and Apalache write; bounds a trace's bytes, states, variables, nesting depth, value count, and string bytes; and rejects extra fields, duplicate set members and map keys, non-canonical integers, and states that are misindexed or do not assign exactly the declared variables.

- Evidenced by property test.
- Source: `AGENTS.md`: “Parse every foreign manifest, package, message, plan, receipt, response, and CLI value from `unknown`; reject extra fields, malformed bounds, ambiguous ownership, and drift.”
- Evidence: `scripts/verification-itf.test.ts`
- Property tests: `scripts/verification-itf.test.ts`: “every container level counts once against the depth bound”; `scripts/verification-itf.test.ts`: “bounds every string in UTF-8 bytes wherever the trace holds one”; `scripts/verification-itf.test.ts`: “a set or map is rejected exactly when two members or keys denote the same value”; `scripts/verification-itf.test.ts`: “a JSON number is read exactly when it is a safe integer other than -0”; `scripts/verification-itf.test.ts`: “#bigint text is read exactly when it is a canonical decimal integer of at most 78 digits”; `scripts/verification-itf.test.ts`: “every state must carry its own index and assign exactly the declared variables”
- Assumptions: `ci-runner`, `verification-tools`
- Not verified:
  - Generated inputs are sampled at the configured run count; this is not a proof over all inputs.
  - CI reads only the traces that the pinned Quint and Apalache releases write; another release may write an encoding the reader rejects.

#### `verification-lean-trusted-base`

The core-only Lean project builds with warnings as errors; every theorem listed in `proofs.json` exists as a theorem whose kernel statement matches its recorded SHA-256; for each seeded defect, the audit checks at the kernel-term level that the defect has the guarded definition's type and that the refutation states exactly the negation of the guarded theorem with the defect in place of the guarded definition; the axiom audit and source scan reject `sorry`, `admit`, native evaluation, unlisted axioms, and other trust escapes; and a seeded `sorry` canary must fail the build and the audit on every run.

- Evidenced by example test.
- Source: `verification/AGENTS.md`: “the audit rejects `sorry`, `admit`, native evaluation, unlisted axioms, and other trust escapes.”
- Evidence: `scripts/verification-tools.test.ts`, `verification/lean/AxiomAudit.lean`, `verification/lean/GhostgetVerification/Smoke.lean`, `verification/lean/proofs.json`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified:
  - Only the enumerated example cases are checked.
  - The smoke theorems state nothing about Ghostget code, and the Lean kernel and toolchain are trusted.
  - The negation check compares kernel terms syntactically; a refutation that is only definitionally equal to the negation is rejected, not accepted.

#### `verification-model-replay-required`

Every Quint model records its invariants, seeds, bounds, a mutant, and a replay test, and the register accepts an evidenced Quint claim only when it cites a model whose replay test drives production code.

- Evidenced by example test.
- Source: `AGENTS.md`: “Count a Quint model as conformance evidence only after an ITF trace replay test drives production code through its traces; until then it is design evidence.”
- Also covers: `verification/AGENTS.md`: “Set the replay target to `production` only when the replay test drives production code”
- Evidence: `scripts/verification-claims.test.ts`, `scripts/verification-tools.test.ts`, `verification/quint/models.json`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified: Only the enumerated example cases are checked.

#### `verification-register-complete`

Every guideline in the scanned `AGENTS.md` guides maps to exactly one register rule whose digest matches its current text and which lists at least one claim or an exemption reason, and every evidence path in the register exists.

- Evidenced by example test.
- Source: `AGENTS.md`: “When you add or change a rule in an `AGENTS.md`, update its claims and rule digest in `verification/claims.json` in the same change.”
- Evidence: `scripts/verification-claims.test.ts`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified: Only the enumerated example cases are checked.

#### `verification-claim-scope`

Every claim carries its layer, status, assumptions, and a non-empty not-verified scope, and `docs/assurance.md` is generated from the register and fails its freshness test when stale.

- Evidenced by example test.
- Source: `AGENTS.md`: “Give every claim its not-verified scope, and regenerate `docs/assurance.md`.”
- Also covers: `verification/AGENTS.md`: “Keep a claim `planned` with its plan phase until its layer runs in CI.”
- Evidence: `docs/assurance.md`, `scripts/verification-claims.test.ts`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified: Only the enumerated example cases are checked.

#### `verification-shrink-promotion`

Every failing seed recorded in the seed corpus is replayed by its named property and cites a named example test registered beside that property.

- Evidenced by example test.
- Source: `AGENTS.md`: “Promote every recorded shrink or failing seed to a named example test.”
- Also covers: `AGENTS.md`: “then promote a minimized failure to a named regression”
- Also covers: `verification/AGENTS.md`: “Record a failing seed and shrink path in `seeds/corpus.json` under the property's name”
- Evidence: `src/test-harness-policy.test.ts`, `src/test-support.test.ts`, `src/contracts-invoke-read.test.ts`
- Assumptions: `bun-runtime`
- Not verified:
  - Only failures someone records in `verification/seeds/corpus.json` are checked; a shrink fixed without a corpus entry is not.
  - The check confirms that the cited regression test is registered, not that it exercises the recorded input; only the `contracts-invoke-read` entry pins its generated input with `fc.sample`.

#### `verification-unpublished`

The published package excludes `verification/`, the verification scripts, and checker downloads, and generated traces, Lean build output, and downloaded checkers stay out of Git.

- Evidenced by example test.
- Source: `verification/AGENTS.md`: “Keep this directory, the verification scripts, and the checker downloads out of the published package.”
- Also covers: `verification/AGENTS.md`: “Keep generated traces, build output, and downloaded tools out of Git.”
- Evidence: `scripts/verification-tools.test.ts`
- Assumptions: `ci-runner`, `verification-tools`
- Not verified: Only the enumerated example cases are checked.

### `web-gateway` (8 claims)

#### `web-gateway-policy-admitted-https-only`

The public web gateway dispatches only bounded HTTPS GET and HEAD retrieval requests that the web policy admits, with no request body and no ambient authentication.

- Evidenced by example test.
- Source: `AGENTS.md`: “The separate public web gateway accepts only explicitly policy-admitted HTTPS retrieval URLs”
- Evidence: `src/control/gateway.test.ts`, `src/control/interface-cli.test.ts`, `src/control/validation.test.ts`, `src/operation-permission.property.test.ts`
- Assumptions: `filesystem-durability`, `whatwg-url`, `dns-tls`
- Not verified: Only the enumerated example cases are checked.

#### `web-policy-deny-dominates`

Web policy decision is default-deny; deny beats ask beats allow, adding a deny rule never widens the result, and domain/path/query-key prefix matching is exact.

- Evidenced by Lean proof with differential test.
- Source: `SECURITY.md`: “under explicit domain, path, and query-key rules”
- Evidence: `verification/lean/GhostgetVerification/WebPolicy.lean`, `verification/lean/Differential.lean`, `scripts/verification-lean-oracle.ts`, `scripts/verification-lean-web-policy.test.ts`, `src/control/gateway.test.ts`, `src/control/validation.test.ts`
- Assumptions: `filesystem-durability`, `whatwg-url`, `dns-tls`
- Not verified:
  - The Lean model covers the decision, the limits, and rule matching in checkWebRequest over parsed rules and an already parsed URL. WHATWG URL parsing, publicUrl, parseWebRule, and DNS and TLS are assumptions, not proofs.
  - Strings are modelled as lists of characters. That equals the production UTF-16 startsWith only because parseWebRule and publicUrl admit ASCII origins, paths, and query keys; the proof does not check that admission.
  - The differential test runs the unchanged web-policy.ts over an in-memory private state store, not the real store and its helper. It samples three origins, one a string prefix of another, three path segments, and four query keys, so it checks only its generated cases.

#### `web-gateway-pinned-transport`

Gateway retrieval uses the pinned transport: one validated DNS address, redirects disabled, revocation/cancellation rechecked after DNS before dispatch, and no retry to another address after an ambiguous transport failure.

- Evidenced by example test.
- Source: `AGENTS.md`: “through its pinned transport and durable audit boundary.”
- Also covers: `src/control/AGENTS.md`: “no redirects or ambient credentials”
- Evidence: `src/control/gateway.test.ts`, `src/pinned-https.test.ts`
- Assumptions: `filesystem-durability`, `whatwg-url`, `dns-tls`
- Not verified: Only the enumerated example cases are checked.

#### `gateway-rejects-private-addresses`

The gateway rejects private, loopback, and other non-public addresses (including IPv4-mapped IPv6) after resolution.

- Planned: differential oracle in plan Phase 7.
- Source: `SECURITY.md`: “private addresses”
- Also covers: `src/control/AGENTS.md`: “public pinned DNS”
- Evidence: `src/control/validation.test.ts`, `src/pinned-https.test.ts`
- Assumptions: `filesystem-durability`, `whatwg-url`, `dns-tls`
- Not verified:
  - The address classifier comes from `@hraness/kb`, and no independent registry oracle checks it yet. Phase 7 wrote the proposal for one, `kb/plans/kb-ip-classifier-proposal.md`; this claim stays planned until `@hraness/kb` ships a checked classifier and Ghostget pins it.
  - Probing `@hraness/kb` 0.19.6 found gaps that the proposal records: it treats the IPv4-translated range `::ffff:0:0:0/96`, the rest of `::/8`, and unallocated IPv6 space outside `2000::/3` as public, and it blocks all of `192.0.0.0/16` where the registry reserves only `192.0.0.0/24` and `192.0.2.0/24`.
  - Until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `public-url-matches-url-crate-oracle`

`publicUrl` makes the same admission decision as an independent reading of the web gateway URL policy over the Rust `url` crate, and every URL that either side admits parses to the same WHATWG components.

- Evidenced by differential oracle.
- Source: `kb/plans/formal-verification-assurance.md`: “a `url`-crate differential for `publicUrl`”
- Evidence: `verification/oracles/src/url_policy.rs`, `scripts/verification-oracles.test.ts`
- Assumptions: `whatwg-url`
- Not verified:
  - URL candidates come from a sampled grammar plus named examples; this is not a proof over all strings.
  - The oracle restates the written policy, so a rule that the policy text and the implementation both omit goes unnoticed.
  - Known parser differences are named in the test and checked to leave the gateway refusing the input: Bun percent-encodes `^` in paths and the `url` crate 2.5.8 does not; Bun accepts an IPv6 literal such as `[::1:]` and drops the leading `/.` from a non-special path such as `m:/.a`; and the `url` crate keeps a drive-letter segment such as `c:` before `..` in an https: path.
  - Address classification after DNS resolution is a separate claim, `gateway-rejects-private-addresses`.

#### `web-gateway-durable-audit-precedes-network`

A durable audit record exists before any gateway network dispatch, and a failed final audit, revocation, redirect, or oversized body withholds output; crash recovery preserves unknown requests without retrying them.

- Planned: stateful model in plan Phase 2.
- Source: `AGENTS.md`: “through its pinned transport and durable audit boundary.”
- Also covers: `src/control/AGENTS.md`: “durable metadata before dispatch”
- Evidence: `src/control/gateway.test.ts`
- Assumptions: `filesystem-durability`, `whatwg-url`, `dns-tls`
- Not verified: The stateful model for this claim is scheduled for plan Phase 2; until then only the listed tests apply, and they cover only their enumerated or sampled cases.

#### `gateway-activity-excludes-sensitive`

Gateway activity storage never contains request bodies, query values or strings, secrets, response bodies, raw transport errors, or a URL digest.

- Evidenced by example test.
- Source: `src/control/AGENTS.md`: “Request bodies, query values, secrets, response bodies and raw transport errors must not enter activity storage.”
- Evidence: `src/control/gateway.test.ts`
- Assumptions: `filesystem-durability`, `whatwg-url`, `dns-tls`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `gateway-only-mode-restricts-routing`

A state home in gateway-only mode restricts Ghostget command routing to policy-admitted operations; contracts catalog/check/repair are unavailable and capabilities report the reduced surface.

- Evidenced by example test.
- Source: `SECURITY.md`: “Gateway-only mode restricts Ghostget command routing”
- Evidence: `src/control/interface-cli.test.ts`, `src/control/menubar-cli.test.ts`, `src/storage-state-home.test.ts`
- Assumptions: `filesystem-durability`, `same-user-trusted`, `whatwg-url`, `dns-tls`
- Not verified:
  - Only the enumerated example cases are checked.
  - Gateway-only mode is not an operating-system network sandbox; a same-user process can bypass the application policy.

### `website` (12 claims)

#### `analytics-allowlist-byte-ceiling`

Analytics events come from a checked allowlist (page lifecycle, web vitals, the two GitHub links) with a byte ceiling per event, canonical-host-only, cookieless, personless, and query-free.

- Evidenced by example test.
- Source: `AGENTS.md`: “Analytics and metering events come from a checked allowlist with a byte ceiling per event.”
- Also covers: `website/AGENTS.md`: “Keep analytics canonical-host-only, cookieless, personless”
- Also covers: `website/AGENTS.md`: “cookies, replay, identity, feature flags, broad autocapture, console capture”
- Evidence: `website/analytics.test.ts`
- Assumptions: `vercel`
- Not verified:
  - Only the enumerated example cases are checked.
  - No test asserts a per-event byte ceiling.

#### `website-release-identity-from-package`

Website release identity and install commands derive from the validated root package.json; the skill install command pins hraness/ghostget#v<package version>.

- Evidenced by example test.
- Source: `website/AGENTS.md`: “Derive release identity and install commands from the validated root `package.json`; never copy a version into page source.”
- Also covers: `website/AGENTS.md`: “pin its skills source to `hraness/ghostget#v<package version>`”
- Evidence: `website/site.test.ts`, `website/skill-install-command.test.ts`
- Assumptions: `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `vercel-build-admission-fail-closed`

A marked or Vercel-signalled build requires the exact marker, VERCEL=1, valid VERCEL_ENV, and exact VERCEL_GIT_COMMIT_REF; production requires website-production and non-production rejects it; inconsistent state fails before build.

- Evidenced by example test.
- Source: `website/AGENTS.md`: “A marked or otherwise Vercel-signaled build must have the exact marker, `VERCEL=1`, a valid `VERCEL_ENV`, and an exact nonempty `VERCEL_GIT_COMMIT_REF`”
- Evidence: `website/vercel-build.test.ts`
- Assumptions: `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `preview-builds-independent`

Preview builds do not depend on npm or GitHub release availability.

- Evidenced by example test.
- Source: `website/AGENTS.md`: “preview builds must not depend on npm or GitHub release availability and must not emit the production marker”
- Evidence: `website/vercel-build.test.ts`
- Assumptions: `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `website-marker-production-only`

Preview, development and local builds never emit the marker and remove any stale marker; a failed verifier or build cannot publish it.

- Evidenced by example test.
- Source: `AGENTS.md`: “Preview and local builds emit no marker.”
- Also covers: `website/AGENTS.md`: “preview builds must not depend on npm or GitHub release availability and must not emit the production marker”
- Evidence: `website/vercel-build.test.ts`
- Assumptions: `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `website-baseline-marker-404-only-v0165`

The baseline reads the marker twice; a 404 is admitted only when promoting exact v0.16.5, and every later baseline requires one stable valid marker.

- Evidenced by example test.
- Source: `AGENTS.md`: “The provider baseline reads it twice; only exact v0.16.5 may begin from 404.”
- Also covers: `website/AGENTS.md`: “The marker may be absent only at the v0.16.5 baseline that introduces it; every later baseline requires it.”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/release-provider-outcome.test.ts`
- Assumptions: `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `website-www-exact-308`

Each public snapshot requires exactly one no-follow www 308 whose Location preserves the marker path and query, plus bounded canonical apex health responses.

- Evidenced by example test.
- Source: `AGENTS.md`: “finishes with two stable apex marker/health snapshots plus one exact no-follow `www` 308 in each snapshot.”
- Also covers: `website/AGENTS.md`: “require `www` to return one exact no-follow 308 to the same apex marker path and query”
- Evidence: `scripts/release-provider-outcome.test.ts`
- Assumptions: `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `website-marker-seven-key-canonical`

Only a verified Production build emits `/.well-known/wrench-release.json`, after the release verifier and site build pass, as one exact canonical seven-key JSON body (schema, package, repository, tag, version, verified HEAD, strict unique Vercel deployment URL) plus one line feed; reordered, expanded, noncanonical, or identity-drifting bodies are rejected.

- Evidenced by example test.
- Source: `AGENTS.md`: “A verified Production build emits one exact seven-key `/.well-known/wrench-release.json` after its site build, binding the verifier-proven local HEAD and release tag to the strict unique Vercel deployment URL.”
- Also covers: `website/AGENTS.md`: “Each verified Production build emits exact bounded `/.well-known/wrench-release.json` bytes only after the release verifier and site build pass”
- Evidence: `scripts/release-provider-outcome.test.ts`, `website/production-release-marker.test.ts`, `website/production-release-verifier.test.ts`, `website/vercel-build.test.ts`
- Assumptions: `vercel`
- Not verified: No property test covers this law yet; only the enumerated example cases are checked.

#### `website-outcome-baseline-to-target-only`

During outcome the apex marker may show only the baseline identity or the exact target; a third identity, changed same-release deployment URL, target-to-baseline regression or disagreement with pinned status URLs fails closed.

- Evidenced by Quint model with production trace replay.
- Source: `AGENTS.md`: “Outcome requires that deployment URL to equal the pinned status URLs, permits only baseline-to-target movement”
- Also covers: `website/AGENTS.md`: “Public outcome checks require that URL to equal the pinned deployment status”
- Evidence: `scripts/npm-release-workflow.test.ts`, `scripts/verification-promotion-replay.test.ts`, `verification/quint/promotion.qnt`
- Assumptions: `vercel`
- Not verified:
  - `verification/quint/promotion.qnt` checks one run of the website production workflow after its verify job, with seven abstract commits, one release tag, and a three-observation poll budget, against an environment that may move protected main, the production ref, and the tag, replace Latest, finish or fail the Vercel deployment, change the apex marker, and arm one of ten readback drifts between the two terminal readbacks. Quint simulation checks it with 3,000 samples of up to 14 steps and Apalache to length 11 in the Required verification job (every mutant step is found at that length; at length 10 the single-readback mutant is not), and the nightly workflow repeats it with 10,000 samples of up to 20 steps and Apalache to length 12.
  - Its ITF replay runs the production `revalidateReleaseAuthority`, `createProviderBaseline`, `promoteWebsiteProduction`, and `waitForProviderOutcome` on 300 traces of up to 14 steps per step relation, and the production writer's real `/usr/bin/git` tag fetch, peel, and `--force-with-lease` push against a local bare repository. GitHub's REST and GraphQL answers and the public site are stubs computed from the model state, and longer schedules, more commits, and the production poll budget of 20 are not modelled.
  - The model's apex marker takes four identities: the baseline, the target at the pinned deployment URL, the target at another deployment URL, and a third release. The replay reaches each refusal: a third identity, a target-to-baseline regression, a changed same-release deployment URL, and disagreement with the pinned status URL. Marker parsing and its canonical form are separate claims.

#### `website-production-build-release-verified`

A production Vercel build requires VERCEL_GIT_COMMIT_REF=website-production, exact marker env, local HEAD and package version equal to the v<version> tag commit, the canonical artifact, and a non-draft, non-prerelease, Latest immutable Release; main/preview refs never produce production, and missing or inconsistent Vercel state fails before verification.

- Evidenced by example test.
- Source: `AGENTS.md`: “`main` and pull requests are preview sources, never production website sources.”
- Also covers: `website/AGENTS.md`: “Require `VERCEL_GIT_COMMIT_REF=website-production` only for production”
- Also covers: `website/AGENTS.md`: “production verifies immutable GitHub metadata, exact five descriptors, bot/source receipt, manifest/archive digests, HEAD/tag, and Latest”
- Evidence: `website/production-release-verifier.test.ts`, `website/vercel-build.test.ts`
- Assumptions: `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `website-no-vercel-mutation-in-workflows`

Checked-in workflows stay token-free for Vercel and never mutate project settings, call the Vercel API, redeploy, alias, or promote; promotion outcome uses token-free public HTTPS plus read-only GitHub evidence.

- Evidenced by example test.
- Source: `docs/publishing.md`: “Checked-in workflows never mutate this project setting, call the Vercel API, or perform an alias or promote operation”
- Also covers: `website/AGENTS.md`: “Checked-in workflows remain token-free and never mutate the setting, call Vercel APIs, alias, or promote.”
- Evidence: `scripts/npm-release-workflow.test.ts`
- Assumptions: `vercel`
- Not verified: Only the enumerated example cases are checked.

#### `website-informational-only`

`website/` explains and documents Ghostget and contains no agent runtime, authenticated product surface, or browser-based substitute for the CLI and SDK.

- Not verified.
- Source: `AGENTS.md`: “Keep `website/` informational: it may explain and document Ghostget, but must not grow an agent runtime, authenticated product surface, or browser-based substitute for the CLI and SDK.”
- Evidence: none
- Assumptions: `vercel`
- Not verified: No automated check inspects `website/` for authenticated surfaces, credential handling, or runtime features; review alone enforces this boundary.
