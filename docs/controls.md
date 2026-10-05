# Accounts, approvals, and local controls

Ghostget's local controls are terminal commands. Public-page reads need none
of them.

```sh
ghostget status              # accounts, approvals, saved outputs, web rules
ghostget control serve       # run the control owner without a window
ghostget control install     # optionally start the owner at login
```

Every command takes `--json` and prints one versioned envelope, so an agent
reads the same facts a person sees. `ghostget commands --json` lists every
control verb with its schema, and [CLI parity](cli-parity.md) maps each former
menu bar action to its command.

## Status and approvals

`ghostget status` shows each connected account with its site and where the
sign-in lives, pending approvals, recent saved outputs, web rules, and one next
step when something needs you. `ghostget approvals list` shows waiting requests;
`ghostget approvals decide <id> --digest <digest> allow-once|deny` resolves one
against its exact reviewed digest. `ghostget permissions list` and
`ghostget permissions set` show and set Allow, Ask each time or Deny per
operation. `ghostget connections begin|verify|commit|disconnect` connects and
disconnects browser accounts.

Every command that grants, loosens, connects, disconnects, activates or
installs asks for a person at the terminal (a typed confirmation of the exact
change). Run from an agent, it returns `human-required` with exit code 3 and
changes nothing. Commands that only tighten, such as denying a request, run
without it.

## The control owner

One process owns a state home's control helper at a time. `ghostget control
serve` runs it headless with an owner-only agent socket and an administrative
socket the control verbs use. The control verbs reuse a
running owner; with none running, each command starts a private helper for its
own duration. `ghostget control stop` asks the owner to exit over its socket;
it never signals a process. `ghostget control status` reports whether one
answers.

`ghostget control install` registers a per-user login item that starts the
owner at login. It is opt-in and asks for confirmation;
`ghostget control uninstall` removes it.

## The retired menu bar

Ghostget no longer ships a menu bar companion. `ghostget menubar` prints the
replacement commands. If you had set the menu bar to open at login, the next
login moves that login item aside by itself: the old item runs
`ghostget menubar --foreground`, which renames every Ghostget menu bar login
item to `<name>.retired-<time>` (never deleted) and exits.
`ghostget control serve`, `control install` and `menubar uninstall` do the same
at once. `ghostget menubar doctor --json` and `ghostget control status --json`
list any still installed (`legacyLoginItems`). To undo, rename the file back
and run `launchctl bootstrap gui/$(id -u) <path>`.

The signed macOS cookie reader is separate from the menu bar and still used for
Chrome and Safari cookie reads: Ghostget resolves the shared `hraness-helper`
executable, falling back to `hraness-companion`. Maintainers can point
`GHOSTGET_HELPER` (or the older `GHOSTGET_MENUBAR`) at the absolute path of a
reviewed helper.

## Import one X token from 1Password

The password-vault integration imports one X OAuth 2.0 user credential. It does
not manage passwords, fill web forms, or import a whole vault. The Markdown
vault created by `ghostget init` is a separate document store.

On a supported desktop platform (macOS, Linux, or Windows), unlock the 1Password
desktop app and enable its app integration. Keep the existing X token in a
1Password field. Obtain the numeric X user ID for that token and its actual
scopes before importing. The control owner may stay open; the import
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
