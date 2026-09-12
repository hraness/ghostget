# Native control panel

Ghostget's macOS app manages the local kernel your agent uses. It does not run a
model. Accounts, capabilities, user interfaces, web rules, approvals, activity,
and copyable agent instructions are available in one window.

Pending approvals update every four seconds while the app is visible. Accounts
and capabilities refresh when you return to the app, after changes made in the
app, or when you choose Refresh. Permission decisions always validate current
account and integration state.

Build instructions and native qualification live in [desktop/README.md](https://github.com/hraness/ghostget/blob/v0.18.1/desktop/README.md).
The CLI's canonical five-file GitHub Release contract is unchanged. A source
build is not a signed or notarized public macOS installer.

## Connect an account

Open Accounts, choose a connection name, provider, browser, and optional Chrome
profile, then open sign-in. Finish authentication in that browser. Passwords and
passkeys stay in the browser and password manager; Ghostget never asks the agent
to handle them. Return to the app, verify the account, review its exact subject,
and save the connection. The app installs that provider's bundled adapter if it
is absent. Existing user interfaces are preserved.

Browser connection currently supports X, LinkedIn, and Reddit. Other installed
account types remain visible and can be configured through their provider's
agent instructions. A saved account is labeled **Configured**; it is not proof
that its browser session is still signed in. Disconnect removes Ghostget's
locator and owned state, not the browser's session or a vault item.

## Choose operation permissions

Existing CLI installations remain unmanaged until you enable permissions in the
app. Enabling management makes unknown operations denied. Select an account and
choose **Allow**, **Deny**, or **Ask** for each installed operation. A public
operation has a separate account-free authority.

Grants bind the exact account lifetime, installed manifest, executable contract,
and implementation. Replacing an account or changing an integration invalidates
the old grant. Approval is for one exact proposed request; pending approvals
expire after two minutes and require the app to stay open. Writes still require
Ghostget's existing preview, confirmation, and dispatch evidence. Cached reads
requiring human approval fail without disclosing data; a live invocation can ask.

## Give an agent one web tool

Create a web rule with an exact HTTPS origin, literal path or slash-terminated
path prefix, GET/HEAD methods, permitted query keys, and an allow/deny/ask
decision. Unknown URLs are denied. A deny takes precedence; overlapping allowed
rules use the strictest decision, response limit, and deadline.

```sh
ghostget web request 'https://www.rust-lang.org/' --method GET
```

The app must be open. The gateway admits public HTTPS text and JSON responses,
with no supplied headers, cookies, authorization, redirects, retries, or private
network access. DNS addresses are validated and pinned, and policy is checked
again before dispatch and before returning content. The first version rejects
ambiguous encoded paths, matrix parameters, duplicate query keys, IP literals,
custom ports, and compressed or binary responses. GET is not proof that a
server action is harmless: review the endpoint's behavior before permitting it.

Enable **Gateway only** to block Ghostget's other supported network command
families for this state home. Disable other web tools in the agent harness too.
This is an application gateway, not an operating-system firewall. Same-user
programs, other state homes, trusted source plugins, and tools outside Ghostget
are not sandboxed by it. Returned content is untrusted data.

## Inspect activity

Activity records gateway request IDs, origin, configured rule/path labels,
method, decision, outcome, status, size, and elapsed time in local SQLite. Search
and filter by method, outcome, origin, time, and order. Rows load continuously
through bounded cursor queries and render in a virtualized table. New arrivals
do not move the rows being read; refresh to include them.

Raw URL query values, request headers, credentials, response bodies, and raw
transport errors are never recorded. The store retains at most 10,000 finished
requests and 30 days of finished history, plus bounded active requests. A crash
marks previously active requests **Interrupted**. That label never authorizes a
retry. Existing provider dispatch journals remain separate. A failed history
write blocks dispatch or withholds a completed response as appropriate. This
first activity view covers the public web gateway, not all legacy provider logs.

## Import a token from 1Password

Use Accounts → Import an X token from 1Password. Enable desktop SDK integration
in 1Password's developer settings, choose the account and exact field reference,
and approve 1Password's desktop prompt. Provide the expected numeric X user ID,
the token's declared scopes, and optional expiry.

The initial integration imports an OAuth 2.0 **user-context access token** for X.
A separate credential process resolves the field, probes the fixed X identity
endpoint, checks the expected subject, and commits a private local copy. The
token never travels through renderer IPC, agent tools, argv, or diagnostic logs.
The identity probe does not independently attest the declared scopes or expiry.
App-only tokens, password automation, passkey export, and generic vault access
are not supported.

This is an import: locking 1Password does not revoke the copy already stored by
Ghostget. Disconnect the Ghostget account to remove its owned copy; revoke the
token at X when necessary. Cancellation or lost helper output can produce an
uncertain result; refresh Accounts before attempting another import.

## Edit user-space integrations

```sh
ghostget interface export x-web > x-web.openapi.json
# Edit the exported document with your agent.
ghostget interface import x-web.openapi.json
ghostget interface list
```

The format is a bounded OpenAPI 3.1 JSON profile. Standard request schemas describe
inputs; `x-ghostget` binds operations to reviewed semantic executors. Import
creates an inert draft. Review it in Integrations and activate one adapter at a
time. Subsequent edits use the displayed draft digest with
`--expected-digest <sha256>`. Activation is conditional on the exact installed
version and cannot overwrite a portable plugin's owned adapter.

User and imported interfaces are distinguished from bundled interfaces. Remote
references, executable import hooks, arbitrary HTTP templates, and unsupported
input-schema constructs are rejected or remain visibly inert as appropriate.
An interface without an executor does not become executable by importing it.
Use the existing [provider plugin protocol](https://github.com/hraness/ghostget/blob/v0.18.1/docs/plugins.md) when a new executor is
needed. OpenAPI import does not grant it account access.

Middleware and LLM approval are future extensions. Future hooks may propose
changes or narrow access; changed requests must be validated and authorized
again. The app does not currently execute middleware or an approval model.

## Development and product previews

The Tauri host owns one packaged Bun kernel and a private administrative stdio
channel. An owner-only Unix socket accepts agent requests and approval polling;
it cannot approve requests, change policy, connect accounts, or read secrets.
Closing the app cancels its work and releases its ownership record and socket.

Direct supplies deterministic data through the same production-safe UI port.
Its eight scenarios include empty accounts, stale permissions, imported
interfaces, approvals, failure, vault cancellation, and 10,000 activity rows.
Production and fixture entry graphs are separate and checked with source maps.
Marketing frames render those same screens at build time, contain no executable
script, and declare that all accounts and requests are fictional. Browser
fixture evidence does not qualify native IPC, live provider login, or signed
1Password authentication.
