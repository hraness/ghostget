# Native app host

A macOS product can run a pinned GhostGet package as an account-only subprocess.
The first host supports X connections from existing Chrome profiles or Safari.
It does not expose publishing, grants, the administrative socket, or credentials.
The design record is [#598](https://github.com/hraness/ghostget/issues/598).

Launch the packaged Bun runtime with:

```sh
GHOSTGET_STATE_HOME='/absolute/product-state/ghostget' \
  /absolute/runtime/bin/bun --config=/dev/null --no-env-file --no-install \
  /absolute/runtime/package/src/app-host.ts --app-id com.example.product
```

Use the product's verified package/runtime closure, including production
`node_modules`, `package.json` and the source/assets listed by GhostGet's package
manifest. Do not find Bun or GhostGet on PATH, fall back to a global installation,
run an install at startup, or update the embedded runtime independently of the
product. Source packaging is supported; compiling or obfuscating the provider
closure requires separate qualification. The host never imports CLI startup or
runs its update check.

Launch with a sanitized environment, without `BUN_CONFIG_FILE`, `BUN_OPTIONS` or
semantic `NODE_OPTIONS` overrides. On macOS/Linux, the exact single
`--config=/dev/null` argument disables Bun's local and global config discovery;
split arguments, aliases, duplicate flags and custom configuration files are
rejected. This mode has its own runtime closure identity, retains validation of
the checked package's `bunfig.toml`, and does not change durable provider contract
identities. It prevents an unrelated user `.bunfig.toml` from affecting the host.

`GHOSTGET_STATE_HOME` must be an absolute private directory. If omitted, the host
uses `~/Library/Application Support/<app-id>/ghostget`. An empty directory gains
a `control/app-host.json` namespace marker. An unmarked nonempty directory, another app's
marker, and the default global CLI state directory are rejected. The app ID is a
storage namespace, not authentication. The app and its CLI should use one owner
process and this same product root. Do not run a second helper against it. The
existing private control owner lock is held until owned work settles; this host
creates no control sockets.

## Wire

`@hraness/ghostget/app-host-protocol` exports the versioned wire types and bounds.
`src/app-host-protocol.ts` is the authoritative language-neutral contract for
Swift/Rust clients. Each stdin line is a UTF-8 JSON object:

```json
{"protocol":"ghostget.app-host/1","id":"request-1","request":{"action":"hello"}}
```

Stdout contains only response frames:

```json
{"protocol":"ghostget.app-host/1","id":"request-1","ok":true,"data":{"kind":"hello","version":"PACKAGE_VERSION","appId":"com.example.product","capabilities":["x-browser-connections"],"nativeConfirmation":"ghostget-dialog"}}
```

Failures contain `ok: false`, `code`, and `message` instead of `data`. An invalid
frame uses ID `invalid`; a startup failure uses `startup`. Clients should show
safe error text and branch on codes. Frames are at most 16 KiB, at most eight
requests may be active, and request IDs cannot repeat in one host session. Start
a new host after 4,096 requests. Unknown fields and actions are rejected.

Actions:

- `hello`, `browsers.list`, `accounts.list`: no other request fields.
- `connection.begin`: `browser` is `chrome` or `safari`; `profile` is `Default`,
  `Profile 1` through `Profile 999`, or null for Safari. Supply null `id` and
  `expectedRevision` for a new account, or both exact values from the account list
  for reconnect. The result includes an opaque account `id` and `attemptId`.
- `connection.verify`: `attemptId`. Sign in in the selected browser first. The
  result includes the real numeric X `subject`, display handle and `commitDigest`.
- `connection.commit`: `attemptId`, `expectedSubject`, and `expectedDigest` from
  that verification. GhostGet displays its own native confirmation dialog, then
  rechecks the real X subject and account revision before saving.
- `connection.cancel`: `attemptId`. Cancels a probe or pending native dialog.
- `connection.disconnect`: `id`, `expectedRevision`, and `expectedDigest` from
  the account's current `disconnectDigest`. GhostGet displays its own native
  dialog and removes only the exact unchanged account incarnation.
- `close`: aborts pending decisions and probes. EOF and termination signals also
  initiate cleanup. Wait for process exit before relinquishing owner custody.

Commit, disconnect, cancel and close return `{ "kind": "success" }`. A new
verification is needed after a denied or consumed commit decision. Refresh the
account list after a denied or stale disconnect decision. Digests are replay and
context checks; possessing a digest does not bypass native human confirmation.
The client never supplies prompt text or an affirmative authorization boolean.
Native dialogs are provider-owned UX, not protection against hostile same-user
code or desktop automation; existing operating-system and custody controls apply.

## Account semantics

A listed account contains its verified provider surface, stable numeric subject,
display handle, browser/profile locator, conditional revision and disconnect
digest. `status: "configured"` and `identityVerification: "at-connection"` mean
that identity was verified when saved. They do not claim a currently signed-in
or healthy browser session. Legacy cookie locators without an explicit provider
binding are not silently classified as X.

A Chrome profile can have only one saved X connection in this app, and an X
subject can be connected only once. Use separate existing Chrome profiles for
multiple accounts. Connecting a profile twice does not create independent
persistent sessions. The host checks duplicates before connection and again
before commit. A profile switch after the dialog invalidates the attempt rather
than inheriting the earlier approval. Disconnecting does not sign out of Chrome
or Safari, delete their profiles, or grant/withdraw a provider operation policy.

Cookie credentials remain inside GhostGet and its reviewed custody helper.
The packaged app identity and native confirmation path require explicit live
macOS acceptance before a product claims working connections. Tests using
injected identity probes or confirmation results establish lifecycle invariants,
not real-browser qualification. Existing cookie-helper identity provisioning is
preserved; this entrypoint does not claim a new notarized embedded-custody design.

## Retention and future work

The app namespace marker is at most 1 KiB, saved accounts are capped at 32, and
pending attempts are capped at eight with a ten-minute lifetime. Confirmation
dialogs time out after two minutes. The namespace marker and account state stay
until the product's explicit local-data deletion flow stops the helper and
removes its exact product-owned directory. Ordinary disconnect removes only the
selected auth record and invalidates its auth incarnation.

Scheduling, feeds, SQLite projections and external job idempotency are not in
this host. A later publication interface must retain GhostGet's account-scoped
Allow, fresh plans, durable dispatch/reconciliation and human-required states.
Background process lifetime does not establish unattended, sleeping-machine or
locked-screen publication support.

## macOS arm64 runtime projection
`native-runtime-profiles.json` includes `app-host-x-macos-arm64`, generated with
`bun scripts/native-runtime-profile.ts --write` and checked by `bun run
check:native-runtime`. Package membership and versions come automatically from Bun's
host module graph plus the registry's validated installed-dependency snapshots, plus
literal declared-dependency metadata references in reached modules. The X-only host
does not initialize unrelated providers. Owner custody is shared with the general
control helper without importing its wider service.

This is a packaging projection, not a manual identity allowlist. Ship the complete
GhostGet source package and each declared dependency's source, data, licenses and
metadata. Only the exact foreign-platform local-custody and agent-browser artifact
paths in the generated profile are omitted. The macOS arm64 binaries and artifact
manifest remain. Native executables must still be inventoried, inspected, signed and
verified by the consumer's distribution pipeline. Every other native binary is a
packaging failure, not an implicit exception. The durable built-in contract hash is
invariant; current source/dependency identity is automatically recomputed for the
actual installed tree and checked before and after lazy provider loading.

Use a frozen hoisted dependency installation as input; validate exact declared
versions, copy only this profile, and retain a content inventory for the prepared
runtime. No runtime install, global CLI, optional embedding/SQLite extensions, or
PATH discovery is required for X account connection. This profile exposes no posting
or general browsing API. A future broader host must regenerate and qualify a new
complete runtime profile before shipping.

The `app-host-x-macos-arm64` profile supports direct X browser-session connection
verification through the default Sweet Cookie reader. It includes no qualification
of the optional `HRANESS_LOCAL_APP=1` Ghostget companion route. Native hosts launch
with a sanitized environment and leave that opt-in unset; the default path may ask
macOS for browser Keychain access or Safari Full Disk Access. The synthetic package
check performs no real cookie or Keychain reads. Re-signing a bundled local-custody
binary changes its digest, so this profile does not assert that an original custody
manifest remains valid after embedding. Enabling that companion route requires its
own reviewed binding, complete runtime closure and live qualification.
