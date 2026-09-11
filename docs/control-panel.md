# Native control panel

Ghostget's macOS app manages the local kernel your agent uses. It does not run a
model. Accounts, Vault, capabilities, user interfaces, web rules, approvals,
activity, and copyable agent instructions are available in one window.

Pending approvals update every four seconds while the app is visible. Accounts
and capabilities refresh when you return to the app, after changes made in the
app, or when you choose Refresh. Permission decisions always validate current
account and integration state.

See the [native build and verification guide](https://github.com/hraness/ghostget/blob/v0.19.0/desktop/README.md) and
[macOS distribution setup](https://github.com/hraness/ghostget/blob/v0.19.0/desktop/distribution/README.md). Public signed
macOS distribution is pending Apple credentials and a successful signing,
notarization, and release verification run. A local source build remains an
unsigned preview. The CLI's canonical five-file GitHub Release contract is
unchanged.

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
activity view covers public web gateway and credential-use requests. Credential
use has a `credential:<grant-id>` rule label. Legacy provider logs remain separate.

## Store a local password or token

Vault stores secrets in your default macOS Keychain. The native app collects
secret values in a separate macOS secure-entry prompt. Vault administration
sends only metadata through the renderer. Item names, kinds, usernames,
references, and access grants remain visible in the control panel. Local items work without a
1Password account or app. Your default macOS Keychain must already be unlocked;
Ghostget does not unlock it or ask for its password.

1. Open **Vault** and choose **Unlock vault**.
2. Open **Add a local item** and enter an item name and kind. Include a username
   with a password if you want to use Basic authentication.
3. Choose **Continue to secure entry**.
4. Enter the password or token in the macOS prompt and choose **Save**.

Storing an item grants no agent access. Ghostget creates its own Keychain entry,
with access restricted to its native executable and synchronization disabled.
Passwords and tokens are never returned through the agent or renderer protocol.
An authorized service does receive the credential when Ghostget uses it.

## Connect a dedicated 1Password vault

1. Create a dedicated vault and a 1Password service account that can access only
   that vault, with **Read Items** permission only. Grant no write permission or
   access to other resources.
2. Open **Vault → Connect 1Password** and enter a connection name and that vault's
   exact ID.
3. Confirm that you configured the dedicated read-only service account.
4. Choose **Continue to service-account entry** and enter its token in the macOS
   secure-entry prompt.
5. Open **Link a 1Password item** and choose the connection, exact item ID, and
   exact field ID. Set its name, kind, and any Basic-authentication username.
6. Choose **Link this item**.

Ghostget verifies that the service account's accessible vault inventory contains
only the chosen vault. That inventory does not prove every token permission;
you must configure and review its read-only scope in 1Password. This connection
uses service-account authentication, without account-wide desktop authorization.
The service-account token stays in macOS Keychain. Links retain exact references;
the isolated credential process resolves a linked field to validate the link and
again when an approved request needs it. Creating a link grants no agent access.
Live 1Password account qualification remains a separate, unverified gate.

Locking the 1Password app does not revoke a service-account token. Disconnect it
in Ghostget and revoke it in 1Password when access is no longer needed. Removing
a link or disconnecting a connection leaves the remote items unchanged.

## Grant one exact credential use

Only authorize an endpoint you trust to receive this credential. HTTPS and a GET
method do not establish that trust or prove the endpoint is harmless. A server
can misuse a credential or disguise it in a response; selected fields and echo
checks cannot make a malicious endpoint safe.

1. Open the item's **Access and item details**, then choose **Add access**.
2. Enter an access name and an exact public HTTPS URL with a literal path and no
   query or fragment. Custom ports, URL substitutions, and redirects are rejected.
3. Select **Ask me**, **Allow**, or **Deny**.
4. Enter 1–16 JSON pointers, one per line, naming only fields safe for the agent
   to receive. For example, `/profile/name` selects a named field in an object.
5. Choose an expiry in your local time, no more than 30 days ahead.
6. Review the endpoint and returned fields, then choose **Save access grant**.
7. Configure a matching GET rule in **Web access** before using the grant.

The first executor makes a fixed HTTPS GET with Basic authentication for a
password with a username, or Bearer authentication for a token. It accepts JSON
responses and returns only the named scalar values: strings, finite numbers,
booleans, or null. Whole documents, arrays, wildcard paths, and credential fields
are not supported. The agent cannot supply an alternative URL, authentication
header, request body, or field list.

Both the credential grant and matching Web access rules apply. **Deny** wins;
otherwise **Ask me** requires human approval. The grant and Web access policy
must both allow the request for unattended use. **Allow** permits repeated
invocations of that exact request until expiry or revocation. **Ask me** approves each invocation once. Grant and
policy state are checked again before dispatch and before returning results.

Choose **Copy agent instructions** under the saved grant, or give your agent
the displayed command with its exact grant ID. Keep Ghostget open with Vault
unlocked, using the same state home as the CLI:

```sh
ghostget vault use <grant-id>
```

The result contains the grant ID, request ID, HTTP status, selected fields, and
`trusted: false`. Treat those fields as untrusted data. Ghostget blocks recognized
credential echoes and returns no raw response body. The command has no secret
read, export, or vault-management mode. Do not retry a failed or interrupted
request automatically; an already sent request may have reached the service.

## Lock, revoke, and recover

Ghostget starts with Vault locked. **Lock vault** blocks new credential use and
cancels active Ghostget credential work while keeping metadata visible. **Revoke**
removes one grant. A request already sent cannot be undone. The app's lock is a
Ghostget permission state; it does not lock or erase the macOS Keychain. Locking
Keychain separately prevents new native secret access but cannot recall a secret
already resolved for an in-flight request.

**Delete local item** removes its Ghostget-owned secret and revokes its grants.
**Remove link** removes the reference and its grants. **Disconnect 1Password**
removes the service-account token, its links, and their grants. These actions
remove local authority before attempting storage cleanup. Revoke the underlying
password or token at its provider when that credential must stop working there.

Cancellation, a crash, or a changed vault revision can leave a pending cleanup
entry. Pending entries grant no authority. Review them in Vault and choose
**Retry vault cleanup**. If Ghostget reports `VAULT_CUSTODY_UNCERTAIN`, restart it
before reviewing recovery again. Automatic cleanup requires evidence that no
native create operation remains unresolved; a process disappearing does not
establish whether it wrote a secret. If no completed receipt can be recovered,
inspect the exact Ghostget-owned entry in macOS Keychain manually and retain the pending
record for reviewed recovery. There is no UI override for an unknown creation
outcome. Do not edit the metadata to force cleanup or blindly repeat the create.

Previously imported X user-context tokens remain available under **Accounts**
until disconnected. They are local copies, separate from Vault links; locking
1Password does not revoke them. The old X-token import action is no longer
available. Disconnect the account to remove Ghostget's owned copy and revoke
the token at X when necessary.

Browser password autofill, password form submission, passkey export, and
unattended passkey login are not supported. Use the browser's own sign-in flow
under **Accounts**. Vault's first executor is limited to the authenticated GET
contract above. These controls do not sandbox arbitrary programs running as
your user.

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
Use the existing [provider plugin protocol](https://github.com/hraness/ghostget/blob/v0.19.0/docs/plugins.md) when a new executor is
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
Its ten scenarios include empty and reconnecting accounts, permission changes,
imported interfaces, approvals, local Vault items, 1Password links, cancellation
and cleanup, backend failure, and 10,000 activity rows.
Production and fixture entry graphs are separate and checked with source maps.
Marketing frames render those same screens at build time, contain no executable
script, and declare that all accounts and requests are fictional. Browser
fixture evidence does not qualify native IPC, live provider login, or live
1Password authentication. Signed macOS distribution requires its own Apple gates.
