/**
 * Static CLI help kept separate from the command implementation graph.
 *
 * The installed entrypoint imports only static help, terminal identity, and release
 * identity for a valid help request, so help remains available even when an
 * optional provider runtime is broken. This module must stay import-free.
 */

const GHOSTGET_DESCRIPTION = `Ghostget gives your AI agent named web actions: read a page, archive one
media item, or use a connected account, without credentials or a browser to
steer.`;

/** Bare `ghostget`: at most 25 lines including the terminal banner. */
export function ghostgetBareUsage(version: string): string {
  return `${GHOSTGET_DESCRIPTION}

Start here
  ghostget read https://example.com   Read a public page, no account needed
  ghostget browsers                   Find the browser you're signed in to
  ghostget auth add x-main --cookie-source chrome
                                      Connect an account from that browser
  ghostget capabilities               See the actions you can run
  ghostget menubar                    Show Ghostget in the menu bar

Everyday
  ghostget clip <url>                 Save a page as a Markdown note
  ghostget invoke <adapter> <action>  Run an action with a connected account

All commands: ghostget --help · Topics: ghostget help <topic>
ghostget ${version}
`;
}

/** Root `--help`: grouped, at most 60 lines, stdout, exit 0. */
export const ghostgetUsage = `Usage: ghostget <command> [options]

${GHOSTGET_DESCRIPTION}

Start here
  ghostget read <url>                 Read a public page, no account needed
  ghostget browsers                   List browser profiles you can connect
  ghostget auth add <id> [options]    Connect an account from a browser
  ghostget auth bind <id> --site <site>
                                      Check which account is signed in
  ghostget capabilities               See the actions you can run

Read and save
  ghostget clip <url> [options]       Save a page as a Markdown note
  ghostget media <url> [options]      Save one video or audio item, checked
  ghostget search <query>             Search your saved notes

Connect accounts
  ghostget auth list|add|bind|remove  Manage connected accounts
  ghostget login                      Sign in to Hraness Accounts (updates
                                      and support; not needed for sites)

Run actions
  ghostget invoke <adapter> <action>  Run an action (or: ghostget <adapter>
                                      <action>)
  ghostget confirm <digest>           Run a previewed change once
  ghostget runs list                  Review past runs

Control Ghostget
  ghostget menubar                    Show Ghostget in the menu bar
  ghostget tui                        Open the keyboard control panel
  ghostget doctor                     Check everything Ghostget needs

Extend Ghostget
  ghostget adapter|plugin|contracts   Add and check site support
  ghostget derive                     Record a site's API from a browser
  ghostget web|interface|platforms    Web rules, API drafts, site policy

Messaging and exports
  ghostget messaging|beeper|whatsapp|imessage|apple-photos [options]

Options
  -h, --help                          Show help for any command
  -V, --version                       Print the version
  --json                              Print machine-readable output

More: ghostget help <command> · ghostget help policy · ghostget help advanced
Optional support: ghostget support · Turn off: HRANESS_SUPPORT=off
`;

const readHelp = `Usage: ghostget read <url> [options]

Read a page and print it as Markdown. Nothing is saved.

Options
  --auth <id>                    Read with a connected account
  --mode auto|http|browser|file  How to fetch the page (default: auto)
  --browser-profile <name|path>  Use a signed-in Chrome profile
  --cookie-source <browser>      chrome|arc|brave|chromium|edge|firefox|safari
  --cookie-profile <name|path>   Which profile of that browser
  --cookies-file <path>          Use exported cookies instead of a browser
  --json                         Print machine-readable output
  --timeout-ms <n>               Stop waiting after this many milliseconds

Example
  ghostget read https://example.com
`;

const clipHelp = `Usage: ghostget clip <url> [slug] [options]
       ghostget <url> [slug] [options]

Save a page as a Markdown note in your notes folder.

Options
  --auth <id>                    Save with a connected account
  --output <directory>           Where to save (default: kb/articles)
  --media none|images|all        Save images or all supported media
  --evidence none|source|screenshot|all
                                 Keep the page source or a screenshot
  --stdout                       Print Markdown instead of saving
  --force                        Replace an existing note
  --json                         Print machine-readable output

Capture options from ghostget read --help also apply.

Example
  ghostget clip https://example.com example-page
`;

const authHelp = `Usage: ghostget auth <list|add|bind|remove|login|pair|sync> [options]

Connect accounts you're already signed in to. Ghostget reads the sign-in
from your browser when it needs it and never stores your password.

Commands
  auth list                          List connected accounts
  auth add <id> --cookie-source <browser> [--cookie-profile <name>]
                                     Connect from a browser profile
  auth add <id> --cookies-file <path>
                                     Connect from exported cookies
  auth add <id> --browser-profile <name|path> --trust-profile-egress
                                     Use a whole Chrome profile
  auth add <id> --oauth-provider <site> --token-file <path> --scopes <list>
  auth add <id> --linked-device <site> [--device-store <directory>]
  auth bind <id> --site <site> [--force]
                                     Check which account is signed in
  auth login <id> --client-file <desktop-client.json> [--no-open]
                                     Connect Google with your own OAuth app
  auth pair <id> [--phone <number>]  Pair a linked device
  auth sync <id> --once              Refresh a linked device's local copy
  auth remove <id> --yes             Remove an account from Ghostget

Options
  --subject <account-id>             Expect this account
  --force                            Replace an existing account
  --json                             Print machine-readable output

Example
  ghostget browsers
  ghostget auth add x-main --cookie-source chrome --cookie-profile Default
  ghostget auth bind x-main --site x
`;

const browsersHelp = `Usage: ghostget browsers [--json]

List browsers and profiles on this Mac that Ghostget can read a sign-in
from, with the flags to paste into ghostget auth add.

Options
  --json                             Print machine-readable output

Example
  ghostget browsers
`;

const capabilitiesHelp = `Usage: ghostget capabilities [adapter] [--json]

List the actions installed adapters offer. An adapter is Ghostget's support
for one site, such as x-web.

Options
  --json                             Print machine-readable output

Example
  ghostget adapter sync-bundled
  ghostget capabilities x-web
`;

const invokeHelp = `Usage: ghostget invoke <adapter> <action> [options]
       ghostget <adapter> <action> [options]

Run one action from ghostget capabilities. Reads run right away. Changes,
such as posting, print a preview first; run ghostget confirm <digest> to
make the change once.

Options
  --input <json|@file|->             Action input
  --auth <id>                        Connected account to use
  --preview                          Show the change without making it
  --cache-only                       Return the last saved result only
  --headed                           Show the browser window if one is used
  --json                             Print machine-readable output

Example
  ghostget invoke x-web timeline.read --auth x-main
`;

const confirmHelp = `Usage: ghostget confirm <digest> [--headed] [--json]

Make a previewed change once. Previews expire after five minutes.

Related
  ghostget plans list                List previews waiting for confirmation
  ghostget plans cancel <digest> --yes
                                     Drop a preview
  ghostget runs list                 List finished runs
  ghostget runs show <run-id>        Show one run
  ghostget runs reconcile <run-id>   Settle a run whose result was unclear
`;

const omniHelp = `Usage: ghostget omni read --input <json|@file|-> [options]

Read your inboxes from several connected sites as one list.

Options
  --cache-only                       Return the saved view without new reads
  --from-exact-cache                 Rebuild from saved reads only
  --identity-only                    Print only the query identity
  --headed                           Show the browser window if one is used
  --json                             Print machine-readable output
`;

const doctorHelp = `Usage: ghostget doctor [--json]

Check that capture, media, accounts and actions have what they need, and
say what to fix.

Options
  --json                             Print machine-readable output
`;

const loginHelp = `Usage: ghostget login [--json]
       ghostget logout [--json]

Sign in to Hraness Accounts for product updates and optional support. You
don't need this to connect sites; use ghostget auth add for that.
`;

const adapterHelp = `Usage: ghostget adapter <command> [options]

Adapters are Ghostget's reviewed support for one site.

Commands
  adapter sync-bundled [--json]      Install or update the bundled adapters
  adapter validate <manifest>        Check an adapter manifest
  adapter install <manifest> [--force]
                                     Install an adapter
  adapter remove <id> --yes          Remove an adapter
  adapter init <id> (--origin <https-origin> | --platform <site>)
                --output <directory> Start a new adapter
  adapters [--json]                  List public page-capture adapters

Example
  ghostget adapter sync-bundled
`;

const pluginHelp = `Usage: ghostget plugin <command> [options]

Plugins add site support as code. Only install plugins you trust.

Commands
  plugin list [--json]               List installed plugins
  plugin show <id> [--json]          Show one plugin
  plugin init <id> [options]         Start a new plugin
  plugin scaffold [options]          Start a plugin from recorded API evidence
  plugin check <directory>           Check a plugin
  plugin test <directory> --trust-code
                                     Run a plugin's offline tests
  plugin pack <directory> --output <directory>
                                     Package a plugin
  plugin install <directory> --trust-code
                                     Install a packaged plugin
  plugin doctor [--json]             Check installed plugins
  plugin disable <id>                Turn a plugin off
  plugin remove <id> --yes           Remove a plugin

Guide: https://ghostget.com/docs/plugins
`;

const contractsHelp = `Usage: ghostget contracts <catalog|check|repair|schema> [options]

Machine-readable descriptions of every installed action, for agents that
plan work before running it.

Commands
  contracts catalog [--adapter <id>]... [--json]
                                     Print the action catalog
  contracts check --plan <file|-> [--auth-state] [--json]
                                     Check a plan against installed actions
  contracts repair [--id <sha256> | --plan <file|->] [--json]
                                     Show suggested fixes without running them
  contracts schema <catalog|check|plan|invoke-read|repair> [--json]
                                     Print one document's JSON Schema
`;

const deriveHelp = `Usage: ghostget derive <command> [options]

Record how a site's own web app calls its API, then turn the recording into
an adapter. Requires a browser you control.

Commands
  derive start <id> <url> [--auth <id>] [--headed] [--json]
  derive list [--json]
  derive browser <derivation-id> -- <browser command>
  derive review <derivation-id> [--offset <n> --limit <n>] [--json]
  derive finish <derivation-id> --output <directory> [--json]
  derive analyze <har> --adapter <id> --origin <origin> --output <directory>
  derive discard <derivation-id> --yes
`;

const messagingHelp = `Usage: ghostget <messaging|beeper|whatsapp|imessage|apple-photos> ...

Local messaging tools. Private content goes to files you name, never to the
command line or standard output.

Commands
  messaging automation serve --stdio
  messaging routes|resolve|context|preview --input <-|@file>
            --private-output <absolute-file> [--json]
  messaging reconcile <run-id> [--json]
  beeper export-message-like-me --auth <id> --output <new-directory>
  beeper export-contact-interactions --auth <id>
  whatsapp export-message-like-me --auth <id> --output <new-directory>
  whatsapp automation install [--binary <file>] [--json]
  imessage transport install [--binary <file>] [--json]
  apple-photos export-contact-evidence [--library <path>] [--json]

iMessage needs Full Disk Access for your terminal app, and macOS asks
before your terminal app can control Messages.
`;

const threadHelp = `Usage: ghostget thread <split|publish> <site> [options]

Split long text into a thread, or publish one after a preview.

Commands
  thread split <site> --text <text|@file|-> [--json]
  thread publish <site> --adapter <id> --text <text|@file|-> --auth <id>
                 [--preview] [--headed] [--json]
`;

const platformsHelp = `Usage: ghostget platforms [site] [--json]

Show the reviewed policy for each supported site: what Ghostget may read or
change there. This lists policy, not installed adapters.
`;

const notesHelp = `Usage: ghostget <command> [options]

Keep saved pages as a Markdown notes folder and search it.

Commands
  init [directory] [--json]          Create a notes folder
  pdf <file-or-url> [options]        Save a PDF as a note
  list [--tag <tag>] [--json]        List notes
  search <query> [--json]            Search notes
  index [--json]                     Build the search index
  refresh|check|graph [--json]       Rebuild or check links between notes
  backlinks|links <note> [--json]    Show links to or from a note
  url-metadata backfill [options]    Fill in titles for saved links
  context <repository-path> [--json] Find notes about a file or folder
  agents identity|check|audit        Check a repository's agent guides
  adapters [--json]                  List page-capture adapters

Most commands take --root <directory> to pick the notes folder.
`;

const supportHelp = `Usage: ghostget support [--json]

See optional product updates and ways to support Ghostget. Nothing is paid
or signed up for through these commands.

Commands
  support                            Show updates and support options
  support dismiss|snooze|enable      Stop, pause or restore invitations
  support status --json              Show your invitation settings

Agent commands (for agents that show invitations at task closeout)
  support protocol --json            Read the closeout protocol
  support offer --json               Claim an invitation when one is due
  support shown <id>                 Record that an invitation was shown
  support release <id>               Cancel an unshown invitation

Turn off: HRANESS_SUPPORT=off
`;

const policyHelp = `Ghostget policy

Risk levels
  R1 reads run right away. R2 and R3 changes make a preview that lasts five
  minutes; ghostget confirm <digest> makes the change once. R4 is blocked.
  Signed-in actions use each site's own API. Ghostget never runs arbitrary
  scripts, requests, selectors, cookies or file transfers for an agent.

Saved reads
  A successful read of an account's data is saved encrypted. Add
  --cache-only to get it back without going to the site, or
  --projection-identity-only to get only its identity. A normal read always
  checks the site again. Reads without a known account are never saved.
  Run ghostget auth bind first so private reads can be saved.

Combined inboxes
  ghostget omni read merges supported inboxes into one encrypted local view.
  --cache-only returns that view without new reads. --from-exact-cache
  rebuilds it from saved reads only.

Local browsers
  Ghostget runs at most two browsers of its own at a time for page capture,
  shared by every process that uses the same state folder. A capture waits
  up to 30 seconds for a free browser. Attaching to your own browser with
  --browser-live or --cdp doesn't count. ghostget doctor --json shows the
  state folder.

Updates and support
  After useful work, Ghostget may print one short line on stderr about
  updates or support. Output and exit codes don't change. Agents read
  ghostget support protocol --json once, then check
  ghostget support offer --json at the end of a task with a person.
  HRANESS_SUPPORT_AUDIENCE=agent|human|off picks who sees it (default:
  agent). HRANESS_SUPPORT=off turns it off; ghostget support dismiss opts out.
`;

const advancedHelp = `Ghostget advanced commands

  ghostget tui --snapshot            Print the control panel as plain text
  ghostget vault --help              Import an X token from 1Password
  ghostget web request <https-url>   Fetch public text through your web rules
  ghostget interface list|export|import
                                     OpenAPI drafts of installed actions
  ghostget transcriber setup --engine whisper-cpp --model <file>
                                     Set up local transcripts for media
  ghostget verify <archive-folder>   Check a saved media archive
  ghostget omni read --input <json>  Read several inboxes as one list
  ghostget plans list|cancel         Manage change previews
  ghostget runs show|reconcile       Inspect or settle one run
  ghostget operator doctor           Same as ghostget doctor

Use one controller at a time: run ghostget menubar stop before opening the
TUI. Setup guide: https://ghostget.com/getting-started
`;

type HelpTopic = { readonly text: string } | { readonly delegate: string };

/**
 * Help topics by command or topic name. `delegate` names a command that owns
 * its help: `ghostget help <name>` runs `ghostget <name> --help`.
 */
const HELP_TOPICS: Readonly<Record<string, HelpTopic>> = {
  read: { text: readHelp },
  inspect: { text: readHelp },
  clip: { text: clipHelp },
  capture: { text: clipHelp },
  auth: { text: authHelp },
  browsers: { text: browsersHelp },
  capabilities: { text: capabilitiesHelp },
  invoke: { text: invokeHelp },
  confirm: { text: confirmHelp },
  plans: { text: confirmHelp },
  runs: { text: confirmHelp },
  omni: { text: omniHelp },
  doctor: { text: doctorHelp },
  operator: { text: doctorHelp },
  login: { text: loginHelp },
  logout: { text: loginHelp },
  adapter: { text: adapterHelp },
  adapters: { text: adapterHelp },
  plugin: { text: pluginHelp },
  plugins: { text: pluginHelp },
  contracts: { text: contractsHelp },
  derive: { text: deriveHelp },
  messaging: { text: messagingHelp },
  beeper: { text: messagingHelp },
  whatsapp: { text: messagingHelp },
  imessage: { text: messagingHelp },
  "apple-photos": { text: messagingHelp },
  thread: { text: threadHelp },
  platforms: { text: platformsHelp },
  init: { text: notesHelp },
  notes: { text: notesHelp },
  pdf: { text: notesHelp },
  refresh: { text: notesHelp },
  check: { text: notesHelp },
  graph: { text: notesHelp },
  backlinks: { text: notesHelp },
  links: { text: notesHelp },
  list: { text: notesHelp },
  index: { text: notesHelp },
  search: { text: notesHelp },
  "url-metadata": { delegate: "url-metadata" },
  context: { text: notesHelp },
  agents: { text: notesHelp },
  support: { text: supportHelp },
  policy: { text: policyHelp },
  advanced: { text: advancedHelp },
  help: { text: ghostgetUsage },
  menubar: { delegate: "menubar" },
  tui: { delegate: "tui" },
  vault: { delegate: "vault" },
  web: { delegate: "web" },
  interface: { delegate: "interface" },
  media: { delegate: "media" },
  archive: { delegate: "media" },
  audio: { delegate: "media" },
  video: { delegate: "media" },
  transcript: { delegate: "media" },
  verify: { delegate: "media" },
  transcriber: { delegate: "media" },
};

/** Commands whose own parser already prints help on stdout and exits 0. */
const SELF_HELP_COMMANDS = new Set([
  "menubar", "tui", "vault", "web", "interface", "url-metadata",
  "media", "archive", "audio", "video", "transcript", "verify", "transcriber",
]);

export type GhostgetHelpRequest =
  | { readonly kind: "bare" }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "delegate"; readonly arguments: readonly string[] }
  | { readonly kind: "unknown-topic"; readonly topic: string };

const ADAPTER_ID = /^[a-z][a-z0-9-]{0,47}$/u;
const ACTION_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;

function topicFor(name: string, next: string | undefined): string {
  if (/^https?:\/\//iu.test(name)) return "clip";
  if (HELP_TOPICS[name] !== undefined) return name;
  if (ADAPTER_ID.test(name) && next !== undefined && ACTION_ID.test(next)) return "invoke";
  return name;
}

function resolveTopic(name: string, next: string | undefined): GhostgetHelpRequest {
  const key = topicFor(name, next);
  const topic = HELP_TOPICS[key];
  if (topic === undefined) return { kind: "unknown-topic", topic: name };
  if ("delegate" in topic) return { kind: "delegate", arguments: [topic.delegate, "--help"] };
  return { kind: "text", text: topic.text };
}

/**
 * Classify a help request without loading any command. Returns null when the
 * arguments are not a help request, so the command runs normally.
 */
export function ghostgetHelpRequest(raw: readonly string[]): GhostgetHelpRequest | null {
  if (raw.length === 0) return { kind: "bare" };
  const first = raw[0] ?? "";
  if (first === "help" || first === "--help" || first === "-h") {
    const topic = raw[1];
    return topic === undefined ? { kind: "text", text: ghostgetUsage } : resolveTopic(topic, raw[2]);
  }
  const separator = raw.indexOf("--");
  const scanned = separator === -1 ? raw : raw.slice(0, separator);
  if (!scanned.includes("--help") && !scanned.includes("-h")) return null;
  if (SELF_HELP_COMMANDS.has(first)) return null;
  return resolveTopic(first, raw[1]);
}

/** Top-level command names, for "Did you mean" suggestions. */
export const GHOSTGET_COMMAND_NAMES: readonly string[] = Object.freeze(
  Object.keys(HELP_TOPICS).filter((name) =>
    !["help", "permissions", "keychain", "policy", "advanced", "notes"].includes(name)),
);

/** The per-command help to point at from a usage error. */
export function ghostgetHelpCommandFor(raw: readonly string[]): string {
  const first = raw[0];
  if (first === undefined) return "ghostget --help";
  const key = topicFor(first, raw[1]);
  if (HELP_TOPICS[key] === undefined || key === "help") return "ghostget --help";
  return key === "invoke" && first !== "invoke" ? "ghostget invoke --help" : `ghostget ${key} --help`;
}
