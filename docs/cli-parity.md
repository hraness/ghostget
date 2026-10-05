# Control CLI parity

Every control the retired Ghostget menu bar offered has a command that does
the same thing. Each command takes `--json` and answers with a versioned
envelope (`ghostget.<name>/1`, or `hraness.error/1` on failure).
`ghostget commands --json` lists them all with their operation class.

## The control owner

The owner holds the account, permission and approval state for one state home.
It answers on two owner-only sockets in `<state home>/control/`:
`agent.sock` for agent requests and `admin.sock` for the commands below.

| Command | What it does |
| --- | --- |
| `ghostget control serve` | Run the owner in this terminal. Stop it with Ctrl-C or `control stop`. |
| `ghostget control status` | Report whether an owner answers. |
| `ghostget control stop` | Ask the owner to stop over its socket. It never signals a process. |
| `ghostget control install` | Start the owner at login with a LaunchAgent. Asks you first. |
| `ghostget control uninstall` | Remove that LaunchAgent. |

Nothing starts an owner at login unless you run `control install`. Read
commands work without an owner: they start a private one for the one command
and stop it afterwards. `connections begin` starts an owner if none runs,
because a browser sign-in outlives one command.

## Decisions need a person

`admin.sock` is readable only by your user and every request must carry the
owner's private capability file, but other programs running as you can read
that file too. The protection for decisions therefore sits in the commands:
each one that grants, loosens, connects, disconnects, activates or installs
asks you to confirm at your terminal. An agent that runs one gets
`human-required` (exit 3) with the exact command to run yourself, and nothing
changes. Inputs that only tighten run without asking:
`approvals decide … deny`, `permissions set … deny`, and
`web rules set` with an empty rule list and `--gateway-only`.

## Menu item to command

| Menu item | Command |
| --- | --- |
| Status line, accounts, approvals count, sign-ins | `ghostget status` |
| Refresh | Run `ghostget status` again |
| Choose account / Public scope | `--account <id>` on `status` and `permissions list`; omit it for public scope |
| Copy account id | `ghostget auth list --json` |
| Connect a provider with a browser | `ghostget connections begin <provider> --browser chrome\|safari [--profile <name>]` |
| Reconnect an account | `connections begin <provider> --browser … --id <account> --expected-revision <rev>` |
| Check sign-in | `ghostget connections verify <attempt>` |
| Save account | `ghostget connections commit <attempt> --subject <subject>` (asks you) |
| Cancel sign-in | `ghostget connections cancel <attempt>` |
| Disconnect | `ghostget connections disconnect <account> --expected-revision <rev>` (asks you) |
| Turn on permissions | `ghostget permissions enable --expected-revision <n>` (asks you) |
| Allow / Ask / Deny a capability | `ghostget permissions set <adapter> <operation> allow\|ask\|deny --expected-revision <n> --capability-digest <digest>` |
| Approval requests | `ghostget approvals list`, `ghostget approvals show <id>` |
| Allow once / Deny | `ghostget approvals decide <id> --digest <digest> allow-once\|deny` |
| Review and activate an interface | `ghostget interface list`, then `ghostget interface activate <draft> <adapter> --digest <digest>` (asks you) |
| Web gateway rules | `ghostget web rules set --file <rules.json> --expected-revision <n> [--gateway-only]` |
| Activity | `ghostget activity [--search …] [--outcome …] [--limit n]` |
| Agent prompts (install, use, extend, gateway) | `ghostget prompt install\|use\|extend\|gateway [--adapter <id>]` |
| Outputs folder, open, reveal, copy path | `ghostget outputs list` prints the folder and every file path |
| 1Password X-token import | `ghostget vault import-x --help` |
| Provider setup guide, Open Ghostget | `ghostget --help`, and <https://ghostget.com/getting-started> |
| Help & support | `ghostget support` |
| Open at login | `ghostget control install` (asks you); the old menu bar login item is moved aside |
| Copy diagnostics | `ghostget doctor` |

Agents get the `ghostget.status/1` JSON envelope from `ghostget status
--json`; people get the same facts as text. The 13 former menu bar states are
committed as goldens in `src/control/__fixtures__/status/<state>.{json,txt}`.
