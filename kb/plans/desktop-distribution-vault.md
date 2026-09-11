---
type: plan
area: desktop-vault
status: in-progress
---

# Desktop distribution and a provider-neutral vault

## Outcome

Distribute a self-contained macOS application outside the App Store, and make
secure local credential storage a core Ghostget feature. 1Password is an optional
credential source. The user explicitly chose a dedicated 1Password vault and
requires secret values to remain outside agent context.

## Decisions and evidence

- Ship Developer ID signed, hardened, notarized downloads. Apple's notarization
  is an automated distribution check, not App Store review. Ad hoc builds remain
  development artifacts; they do not provide ordinary Gatekeeper admission.
  [Apple distribution](https://developer.apple.com/developer-id/),
  [Tauri signing](https://v2.tauri.app/distribute/sign/macos/).
- Preserve the immutable five-asset CLI release contract. A separately named
  desktop prerelease is derived from the exact admitted stable source tag and
  never becomes the canonical CLI Latest release. Start with Apple Silicon,
  matching the bundled Bun architecture. Intel needs its own native build and
  qualification, not a relabeled or universal wrapper around an ARM runtime.
- Prefer macOS Keychain for local secret material and the 1Password bootstrap
  token. Keep only metadata, opaque references and grants in Ghostget state.
  Avoid a second cryptographic storage format and password-derived master-key
  recovery scheme. Scope all Keychain operations to Ghostget-owned entries.
  [Apple Keychain](https://developer.apple.com/documentation/security/keychain-services).
- Separate credential sources, grants and credential executors. A provider
  resolves a selected secret inside the broker; a grant authorizes an exact use;
  an executor performs it without a secret-returning agent operation. User-space
  interfaces can describe requirements but do not gain arbitrary secret sinks.
- 1Password DesktopAuth temporarily authorizes the entire account. Replace that
  onboarding path with a service account limited to a dedicated vault, read-only.
  Items are additionally selected and granted individually in Ghostget. Adding
  an item to the shared vault expands 1Password's scope, not Ghostget grants.
  [SDK access model](https://www.1password.dev/sdks/concepts).
- Resolve connected secrets on use; do not silently copy 1Password passwords
  into local storage. Local entries and connected entries retain distinct
  provenance and deletion/revocation semantics.
- Passkeys remain authenticator- and relying-party-bound browser ceremonies.
  1Password's current partner Agentic Autofill requires partner admission and
  explicitly excludes passkeys. Do not use undocumented IPC or claim an
  unattended assertion API. [Partner security](https://support.1password.com/1password-claude-security/),
  [Supported types](https://support.1password.com/1password-claude/).

## Work and ownership

1. Root and independent security reviewer settle the storage, native secret entry,
   credential-use protocol, revocation and response disclosure boundaries.
2. Native distribution worker owns the isolated release workflow and distribution
   scripts. Root owns package versions, shared manifests and final delivery.
3. Implement local secret entry/storage, optional restricted 1Password connection,
   exact-item links and grants. Native secret entry must not send values through
   the renderer, Direct, command arguments, environment or logs.
4. Implement real credential use through a reviewed executor with exact
   destination admission, private resolution, bounded transport and response
   disclosure. General browser form filling requires exclusive observation
   custody and is not implied by storing a password.
5. Add the vault to the shared native UI and Direct fixtures. Show origin,
   permitted use, lock/revoke state, and explicit limits. Preserve the existing
   activity table's bounded rendering and cursor loading.
6. Run focused parser, lifetime, secrecy and native checks, independent review,
   then complete Required CI and conditional PR integration. Build the actual
   distributable and qualify signing/notarization only with the required Apple
   credentials. Missing credentials must leave publication fail closed.

## Invariants and recovery

- The agent cannot create grants, select arbitrary vault fields, read plaintext,
  change destinations or run a caller-selected executable.
- A grant is bound to exact source metadata, revision, destination, executor and
  permission state. Recheck after asynchronous work and immediately before
  transmission; a revoked pending grant cannot later resume with old authority.
- The chosen remote endpoint necessarily receives its authorized credential.
  Response filtering cannot make a malicious credential recipient trustworthy.
  Do not claim absolute secrecy from a deliberately exfiltrating endpoint.
- Record durable metadata before network effects. Record terminal evidence
  before returning results. Do not log credential values, query values or bodies.
  Do not automatically retry an uncertain dispatch.
- Application permissions constrain the supported agent protocol. They do not
  sandbox arbitrary hostile code running as the same OS user.
- Unlinking 1Password must not delete its remote items. Revocation stops future
  Ghostget uses; it cannot undo already sent requests or existing website sessions.
- Preserve existing user state and credentials. Any migration is additive and
  leaves the old explicitly retained X-token import inspectable until removed.

## Review and verification

Independent source reviews covered native storage/custody, distribution,
service revocation and response boundaries. Review repaired live-creator cleanup,
native completion receipts, aggregate request deadlines, metadata byte capacity,
and poisoning after unjoined management work. A later adversarial pass found two
additional authority gaps: a build process could persist into a same-runner signing
step, and two trusted interpreter paths did not prove execution through the GUI.
The revised pipeline separates build, signing and execution verification onto
fresh runners, admitting bounded source-bound archives before credentials. Native
secret access now requires the exact live GUI ancestor, which verifies the sealed
app before starting its fixed control helper. Required evidence includes strict
parsers and CAS laws; cancellation/revocation during resolution and dispatch;
no secret-bearing output/errors; isolated native storage round-trip and cleanup;
Direct UI flows; final signed bundle nested-code identity, notarization ticket,
Gatekeeper assessment and packaged helper execution. Fixture tests alone do not
qualify live Keychain, 1Password, browser login or Apple notarization behavior.


### Current evidence and external dependencies

- Local control-domain suite: 101 tests, 2,685 assertions passed. It includes
  exact grant parsing and projection, byte admission, approval, cancellation,
  revocation across resolution/DNS/response, durable audit, private ownership,
  interrupted creation, and shutdown. Only synthetic credentials were used.
- Isolated Rust Keychain and native ancestry suite passed seven focused tests.
  Native completion receipt tests passed eight tests with 171 assertions.
  Packaged native ancestry and actual secure-entry cancellation remain separate
  final integration checks; Direct does not substitute for those effects.
- The earlier distribution suite passed nine tests with 328 assertions; the
  revised runner-isolation design requires its own final tests and independent
  review. Root and desktop TypeScript checks passed before artifact convergence.
- The Vault grant form passed visual review at 1100 and 700 pixels. A diagnostic
  replay exposed the browser driver's ineffective Meta+A selection; the final
  verifier uses Home, Shift+End and Backspace and checks the empty search value.
  The complete ten-scenario run remains the UI admission gate.
- The owner selected a dedicated 1Password vault and no agent-visible plaintext.
  No live service account was supplied; SDK/provider acceptance remains unclaimed.
- The owner has no Apple Developer membership yet and is willing to enroll.
  Identity, agreement, membership and Developer ID/notary credentials are the
  remaining external signed-publication prerequisites. No valid local signing
  identity was found. Do not weaken the signed-publication gate.
- Additive GitHub controls were created and independently read back on
  2026-09-11: desktop-signing environment 21757011657 (main-only policy 59739357,
  administrator bypass disabled), creation-only desktop tag rule 22960902 with
  sole User 894119 bypass, and update/deletion rule 22960911 with no bypass.
  Both target only refs/tags/desktop-v*-macos-arm64. Existing canonical controls
  and immutable Releases remain intact. No secrets were added. Register the
  exact merged workflow ID after PR delivery; public dispatch waits for Apple.
- Marketing retains the original four inert scenarios and adds a fifth Vault
  rendering. The website verifier requires every opaque frame and local asset;
  native, Direct and marketing remain separate entry graphs.
