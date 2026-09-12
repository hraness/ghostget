---
type: plan
area: control-panel
status: in-progress
---

# Agent setup and a quieter control panel

## Outcome

Ghostget is operated through the user's agent and CLI. The native app manages
accounts, permissions, credentials, approvals and request history. The current
0.19 release candidate adds the local vault and distribution pipeline; this pass
finishes its setup experience and replaces the old lettermark with a white ghost.

## Decisions

- Keep the production, Direct and inert marketing entry graphs separate.
- Keep the eight existing internal routes. Present Accounts, Activity, Approvals,
  Access and Vault as the main destinations, with Agent setup in the footer.
  Access groups operation permissions, web rules and user interfaces.
- Start account setup with a service choice. Put profile overrides and connection
  naming behind an optional disclosure. Preserve exact account verification and
  explicit connection confirmation.
- Browser discovery is optional, bounded and native-owned. Profile or cookie
  presence is a suggestion, never proof of authentication. It cannot grant access,
  disclose cookie values, silently traverse every browser, or change policy.
- Agent setup exposes useful structured status and bounded next actions. It
  cannot give the agent administrative approval or a plaintext-secret API.
- Preserve virtualized keyset activity loading, keyboard access, filter identity,
  cancellation and error recovery. Hide uncommon filters without hiding their
  active state.
- Use the user's white ghost emoji direction. Diagnose the Slopcamera color
  selection before changing it; consume reviewed immutable output and preserve
  provenance. Keep one brand asset across app, website and distribution.

## Work and ownership

1. Core owns browser discovery and the CLI setup contract, focused tests and
   operational documentation. Root agrees shared interfaces before edits.
2. Root owns native UX, shared UI state, Direct flows, marketing output and final
   Ghostget integration. Security independently reviews capability boundaries.
3. Platform traces the emoji provenance and supplies the generated brand assets.
   The causal pink-body repair belongs to Jungle's Apple emoji runtime projection;
   Security owns that isolated change and its corpus review. Slopcamera supplies
   the reviewed asset renderer; the noncausal vectorization experiment stays out.
4. Review the combined source and run relevant local checks, the native package,
   actual secure-entry cancellation, Direct and marketing verification.
5. Pass current-candidate Required CI and CodeQL, conditionally merge, qualify
   main, publish the canonical release and verify website promotion. Register the
   desktop workflow after merge. Signed desktop publication retains its Apple
   enrollment and credential prerequisites.

## Recovery and limits

Keep the existing public release and all user state intact until admission. Five
isolated test fixtures contain saved items with no grants; the owner confirmed
entering the synthetic value. Do not read their values or sweep their Keychain
namespace. Cancellation is still a separate native check on the final bundle.
No live 1Password, browser-login automation or passkey capability is claimed from
fixtures. Apple credentials stay in the protected GitHub environment.
