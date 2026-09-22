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
setup instructions in the [provider directory](https://ghostget.com/provider-capabilities/)
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

The menu lists connected accounts and reconnect or disconnect actions, pending
approvals, connection providers and in-flight sign-in attempts, operation
permissions, capabilities, web rules, interfaces, recent activity, and vault
availability. It also lists up to 12 files from a bounded scan of the selected
state home's `outputs` directory, each with size and modification time.
Supported documents can be opened; every admitted file can be revealed in the
file manager or have its path copied. A further submenu copies CLI help
commands, and the menu opens documentation.

The menu also offers free Ghostget product updates and optional paid development
support. Each explicit selection opens the fixed Hraness Accounts page in the
default browser, where the person reviews and confirms signup or payment. These
links remain available when the control helper is unavailable. They carry no
account details or email address and do not inspect local invitation preferences.
The shared browser handoff has a 10-second deadline; repeated clicks while it is
pending do not launch another browser process.

The adapter selects the state home through the existing private-state validator.
The output directory must already exist, belong to the current user, and have
mode `0700`. The adapter does not create or adopt it. An unavailable directory
is shown as unavailable, separately from an empty directory. Snapshots inspect
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
