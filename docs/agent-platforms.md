# Agent platform integration

Ghostget is a bring-your-own-agent CLI and TypeScript SDK, not a hosted
service. An agent platform integrates by giving its agent the ability to run
`ghostget` commands on an operator-controlled machine; there is no HTTP API,
MCP server, OAuth portal, webhook catalog, or hosted credential store to call.
Platforms whose agents cannot execute local commands cannot reach Ghostget.

## What a platform gets

- One immutable, release-pinned install: a Bun 1.3.14 package archive served
  from the GitHub Release, installable with `bun add --global`, and an optional
  npm mirror at the same version.
- One public Agent Skill (`skills/ghostget/`) pinned to the same release, with
  the install command, capability routing, and the stop conditions an agent
  must honor.
- A machine-readable capability surface (`ghostget contracts`) that a platform
  can enumerate, plan-check, and invoke without parsing prose; see
  [contracts.md](contracts.md).
- A local custody boundary: pages, media archives, connected-account state,
  and encrypted snapshots stay on the operator's machine under their accounts
  and permissions.

## Onboarding sequence

1. Install the pinned release and verify one public-page read. The exact
   commands are in `skills/ghostget/references/install.md` and on
   ghostget.com; the skill installs the workflow guidance, not the executable.
2. Install the release-matched Agent Skill into the agent's skill directory.
   The canonical command is published on the site and in `llms.txt`.
3. Run `ghostget adapter sync-bundled --json`, then `ghostget capabilities`
   and `ghostget doctor --json`. Doctor reports missing optional tools per
   workflow; an unconnected account does not block public reads.
4. Enumerate operations with `ghostget contracts catalog --json` and pin the
   `contractHash` values the platform depends on. Before any provider contact,
   validate the intended reads with `ghostget contracts check --plan <file>
   --json`; a `gap` verdict names the missing state or auth binding.
5. Invoke reads through `ghostget invoke <adapter> <operation> --json` and
   parse the R1 envelope. Retry only what `readFailure.retryDisposition`
   permits; mutations sit behind preview, confirmation, and at-most-once
   evidence rather than retry.

## Trust boundary

- The agent never handles raw authenticated traffic: cookies, tokens,
  profiles, selectors, and shell commands stay inside Ghostget. Connected
  accounts are admitted only through the operator's local control client
  (menu bar or TUI), which also owns operation permissions and approvals.
- Mutations require an exact preview and confirmation. An indeterminate
  dispatch is never retried; it is reconciled from separately obtained
  evidence.
- A state home in gateway-only mode accepts only policy-admitted operations;
  `contracts` and `capabilities` report the reduced surface rather than
  failing silently.
- Every command treats the operator's authorization as the ceiling: public
  page capture needs no account, provider reads need a bound account, and DRM
  or access-control bypass is out of scope by design.

## Operational notes for integrators

- The agent should treat the CLI as the contract: exit codes, `--json`
  envelopes, and the closed vocabularies in the contract documents are the
  stable interface; prose output is for humans.
- Keep `HRANESS_SUPPORT_AUDIENCE` in mind: Ghostget may emit a compact
  discovery notice on stderr after useful work, and `ghostget support
  protocol --json` describes the closeout behavior an agent should follow.
  Setting the audience to `off` suppresses it.
- The package root import is inert: embedding `@hraness/ghostget` in a Node or
  Bun host does not start a CLI, read state, or touch the network until a
  caller constructs a host with explicit providers.
- Ghostget can sit behind a platform's own MCP tool or agent framework; it
  does not publish one, and the platform owns that bridge.

## Evidence

- `skills/ghostget/` — the public skill and its operational references.
- `docs/contracts.md` — the typed catalog, plan-check, invoke, and schema
  documents with their parsers.
- `docs/plugins.md` — the content-addressed provider-plugin contract a
  platform can extend under an explicit trust decision.
- `SECURITY.md`, ghostget.com/security/, and ghostget.com/privacy/ — custody,
  account binding, and reporting boundaries.
- ghostget.com/llms.txt — the public agent-facing summary of the same claims.
