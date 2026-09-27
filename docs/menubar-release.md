# Accounts, approvals, and local controls

Use the menu-bar companion to connect accounts, review permissions and pending
approvals, and open recent outputs. Public-page reads work without it.

```sh
ghostget menubar doctor   # check the companion and platform requirements
ghostget menubar          # start the companion
ghostget menubar install  # optionally start it at login
```

The companion is a downloaded, unsigned native binary. Follow the platform
guidance printed by `doctor` if the operating system blocks it. Ghostget does
not change operating-system trust settings for you. It supports macOS and
Linux; Linux also needs a desktop session with a supported tray.

On macOS, choose X, LinkedIn, or Reddit under account connections and finish
sign-in in the selected browser. Use Verify sign-in, then Connect to save the
verified account. The companion does not offer Gmail, Beeper, or WhatsApp
sign-in, and its browser connection flow does not run on Linux. Use the CLI
setup instructions in the [provider directory](https://ghostget.com/docs/reference/provider-capabilities/)
for those routes. Once configured, select an account under Accounts to review
its permissions.

## Use the terminal controls

Run `ghostget tui` for keyboard-driven account, permission, approval, and activity
views. Run `ghostget tui --snapshot` to print the current control state once.
These commands use the same local control service as the menu companion.

The six sections are Setup, Accounts, Capabilities, Approvals, Activity, and
Interfaces. Press Tab to change sections, use the arrow keys to choose a row,
and press Enter to open its actions. Press `?` for keyboard help and `q` to quit.
Changes show a review before you confirm them. For long approval previews, read
through the complete preview before confirming. The TUI runs with the same Bun
installation as the CLI; it needs no Rust compiler or separate download.

Only one control client can own a state home at a time. Before opening the TUI
or importing a token, stop the menu companion:

```sh
ghostget menubar stop
ghostget tui
```

Quit the TUI before restarting `ghostget menubar`. Neither control interface is
needed for an ordinary public-page read.

## Import one X token from 1Password

The password-vault integration imports one X OAuth 2.0 user credential. It does
not manage passwords, fill web forms, or import a whole vault. The Markdown
vault created by `ghostget init` is a separate document store.

On a supported desktop platform (macOS, Linux, or Windows), unlock the 1Password
desktop app and enable its app integration. Keep the existing X token in a
1Password field. Obtain the numeric X user ID for that token and its actual
scopes before importing. The TUI and menu companion may stay open; the import
binds the exact account revision:

```sh
ghostget vault import-x \
  --id x-main \
  --account 'Personal' \
  --reference 'op://Personal/X/access-token' \
  --subject 123456789 \
  --scopes tweet.read,users.read
```

`--account` is the 1Password account name shown at the top left of the
desktop app, or its account UUID. It is not the sign-in domain.

Pass only the `op://` field reference, never the token itself. Required scopes
are `tweet.read` and `users.read`; declare any additional supported scopes the
token actually has. A plain import does not renew: use `--expires-at` with the
token’s known future ISO timestamp, such as `2030-01-01T00:00:00.000Z`, when
available. Do not invent a later expiry.

For a renewable import, keep the X OAuth 2.0 public client's refresh token in a
second 1Password field and pass `--refresh-reference` with `--client-id`
together, declaring `offline.access` in `--scopes`:

```sh
ghostget vault import-x \
  --id x-main \
  --account 'Personal' \
  --reference 'op://Personal/X/access-token' \
  --refresh-reference 'op://Personal/X/refresh-token' \
  --client-id 'public-client-id-from-x' \
  --subject 123456789 \
  --scopes tweet.read,users.read,offline.access
```

Ghostget proves the refresh token with one live exchange during import and then
renews the stored access token automatically as it nears expiry, persisting
each rotated refresh token under conditional writes. A renewable import takes no
`--expires-at`: the exchange supplies the real expiry. Account surfaces show
each OAuth account's token expiry and whether it renews.

Ghostget verifies the token against the expected X user before storing a local
copy. The credential helper resolves the field in a separate process; token
bytes do not cross the agent protocol or normal command output. The saved copy
is protected by filesystem permissions, not encrypted by Ghostget. Disconnecting
removes the exact owned copy but does not revoke the token at X.

An existing account ID requires explicit `--replace` and a matching current
revision. If an import’s outcome is unknown, inspect `ghostget auth list`
before starting another import. Use `ghostget vault --help` for the current
options. Where the 1Password desktop integration is unavailable, the import
reports the vault as unavailable rather than guessing.

## Companion implementation

Ghostget's menu-bar companion is a TypeScript adapter over the shared
`hraness/desktop-foundation` runner. `ghostget menubar` delegates to the shared
lifecycle (`start`, `stop`, `status`, `doctor`, `install`, `uninstall`, and
`--foreground` re-entry) instead of launching a product-built executable.

The shared runner is `hraness-companion`, a pinned `desktop-foundation` release
artifact bound to an exact tag, byte size, and SHA-256 digest in its release
manifest. `ghostget menubar doctor` reports the resolved artifact, its
verification state, and the unsigned-binary installation guidance for the
current platform. The binaries are unsigned by design; there is no app bundle,
no notarization, and no automatic OS trust-policy change. `install` registers
the shared runner's per-user login startup; it writes no product LaunchAgent.

The menu companion owns the control helper's private stdio channel as its
parent process. Agent requests stay on the owner-only agent socket. Menu rows
are bounded and sanitized, and every administrative action is a revision-checked
control request dispatched by the product adapter; the shared runner only
renders state and forwards action identifiers. A failed or indeterminate
mutation is never retried.

The menu follows the shared menu kit v2 layout: a status line (ready, needs
you, or controls paused), Open Ghostget, then at most ten top-level rows.
`Approvals` appears only while requests wait. `Accounts` lists each account as
its site and where the sign-in lives ("X · Chrome · Personal"), never a numeric
subject; the account ID copies from its ⌥ alternate. A saved browser account
that needs reconnecting has one "Reconnect in Chrome · Personal" row in the same
submenu, and new connections are "Connect X in Safari" rows one level deep.
When macOS blocks Safari's cookie store, Safari is left out and the menu links
to Full Disk Access instead. `Outputs` lists up to 8 files from a bounded scan
of the state home's `outputs` directory, each with size and age; supported
documents open, and the ⌥ alternate reveals the file or copies its path.
`Permissions` sets Allow, Ask each time or Deny for the selected account's
operations. `Advanced` holds web rules, interfaces, recent reads, interface
activation, Refresh, CLI help commands and Disconnect. The worst case of every
row bound together stays under the shared 256-item cap, and a test fails first
if a bound grows past it.

A failed action shows one ⚠︎ row under the status line for 30 seconds, in plain
words with one next step ("Couldn't verify the sign-in · Finish signing in in
the browser, then try again"). A sign-in that fails verification keeps its row
as "Try … sign-in again" in the same browser and profile.

`Help & support` opens the fixed Hraness Accounts support page, which offers
free Ghostget updates and optional paid development support; its ⌥ alternate
copies diagnostics (version, control state and counts, no account details). The
link carries no account details or email address and does not inspect local
invitation preferences. It stays available when the control helper is not.
The shared browser handoff has a 10-second deadline; repeated clicks while it is
pending do not launch another browser process.

`Open at login` uses the shared login item. It starts Ghostget through the local
Ghostget app only when `HRANESS_LOCAL_APP=1`, until that app identity has been
checked on a clean macOS user account.

The adapter selects the state home through the existing private-state validator.
The output directory must already exist, belong to the current user, and have
mode `0700`. The adapter does not create or adopt it. An unavailable directory
shows as "No outputs yet" with no folder action. Snapshots inspect
at most 512 entries and never descend into subdirectories or follow symbolic
links. File actions recheck the directory and file identity before the
operating-system handoff. That readback does not eliminate races with the same
user's processes.

## Run

```sh
ghostget menubar          # start the companion
ghostget menubar status   # shared lifecycle state as JSON
ghostget menubar doctor   # artifact, verification, and platform guidance
ghostget menubar install  # per-user login startup
```

For local testing, set `GHOSTGET_MENUBAR` to the absolute path of a reviewed
companion executable; the runner reports it as a maintainer override rather than
release-verified.

## Release contract

The companion executable is the shared foundation's architecture-specific
release artifact, resolved through the pinned manifest packaged with
`@hraness/desktop-foundation`. Ghostget ships only the adapter in its CLI
archive; it publishes no platform sidecar of its own. There is no app bundle or
notarization gate. Adapter, manifest, artifact, and evidence stay bound to
exact versions end to end.
