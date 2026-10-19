# Accounts, approvals, and local controls

Ghostget's local controls are terminal commands. Public-page reads need none
of them.

```sh
ghostget status              # accounts, approvals, saved outputs, web rules
ghostget tui                 # keyboard control panel
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
socket the control verbs use. `ghostget tui` and the control verbs reuse a
running owner; with none running, each command starts a private helper for its
own duration. `ghostget control stop` asks the owner to exit over its socket;
it never signals a process. `ghostget control status` reports whether one
answers.

`ghostget control install` registers a per-user login item that starts the
owner at login. It is opt-in and asks for confirmation;
`ghostget control uninstall` removes it.

## Use the terminal panel

Run `ghostget tui` for keyboard-driven account, permission, approval, and
activity views. `ghostget tui --snapshot` prints the current state once, as
text for a person and as the JSON envelope for an agent (`--json` forces it).

The six sections are Setup, Accounts, Capabilities, Approvals, Activity, and
Interfaces. Press Tab to change sections, use the arrow keys to choose a row,
and press Enter to open its actions. Press `?` for keyboard help and `q` to quit.
Changes show a review before you confirm them. For long approval previews, read
through the complete preview before confirming. The TUI runs with the same Bun
installation as the CLI; it needs no Rust compiler or separate download.

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
