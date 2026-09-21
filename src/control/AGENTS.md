# Contents

- `protocol.ts` – browser-safe administrative and agent contracts.
- `helper.ts`, `service.ts` – process custody, transport and control composition.
- `menubar-cli.ts` – shared desktop-foundation menu adapter over the helper's private stdio channel.
- `menubar-icon.ts` – bundled 32px Twemoji (CC-BY 4.0) tray art for icon-only surfaces.
- `tui*.ts` – keyboard-driven control views, input decoding, and terminal lifetime.
- `helper-client.ts`, `control-response.ts` – bounded private control transport and strict response parsing shared by the menu and TUI.
- `vault-cli.ts`, `vault-input.ts` – explicit X-token import metadata and command guidance; secret resolution stays in `credential-helper.ts`.
- `approval-*.ts` – exact human request and one-use approval lifetimes.
- `web-*.ts`, `activity.ts` – bounded public retrieval and SQLite metadata.
- `interface*.ts` – OpenAPI parsing, inert drafts and conditional activation.
- `connections.ts`, `vault.ts`, `credential-helper.ts` – subject-bound account setup and isolated credential custody.
- Colocated tests exercise boundary, lifetime and property laws.

# Guidelines

`protocol.ts` is the browser-safe shared contract. `helper.ts` owns private
administrative stdio and a separate owner-only agent socket. Agent requests
cannot grant approvals, alter policy, connect accounts, or resolve secrets.
Keep both protocols bounded and reject drift before dispatch.
The menu and TUI share one helper owner per state home. The token-import
command performs its own credential-helper ceremony without that owner, so
imports run while control surfaces stay open. Keep account selection and
exact revision/digest review visible before actions. Terminal input,
including pasted text, must never bypass that review. Restore terminal state
before waiting for helper cancellation and custody settlement.

`service.ts` composes current account, manifest and implementation identities.
Display optimizations must not cache authorization across a changed account,
policy, interface or executable closure. User OpenAPI documents remain inert
until exact conditional activation and never create arbitrary HTTP executors.

`web-policy.ts`, `web-gateway.ts` and `activity.ts` form one admission boundary:
durable metadata before dispatch, public pinned DNS, no redirects or ambient
credentials, policy rechecks, and durable terminal evidence before disclosure.
Request bodies, query values, secrets, response bodies and raw transport errors
must not enter activity storage. A cancellation or interrupted record does not
authorize a retry. Legacy provider dispatch journals remain separate.

The credential helper has one fixed 1Password X-token sink. Keep SDK loading and
raw credential material in that process; suppress third-party diagnostics before
loading it. Verify exact staged bytes and account revision again at publication.
Connection and helper shutdown must settle owned work before custody is released.
